const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { verifyIdToken } = require('../config/firebase');
const Group = require('../models/Group');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'pujoplan_jwt_super_secret_2026_kolkata_durga_puja';

let io = null;

function initSocket(server, clientUrl) {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        // Allow all origins for Socket.io (already handled by Express CORS)
        // Explicitly allow Netlify and Render domains
        const allowedOrigins = [
          'https://pujoplan.netlify.app',
          'https://uma-asche.onrender.com',
          'http://localhost:5173',
          'http://localhost:3000',
          'capacitor://localhost',
          'ionic://localhost',
        ];
        
        if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed))) {
          return callback(null, true);
        }
        
        // Be permissive for mobile and development
        if (origin.startsWith('capacitor://') || 
            origin.startsWith('ionic://') || 
            origin.startsWith('http://localhost') ||
            origin.startsWith('https://localhost')) {
          return callback(null, true);
        }
        
        // Allow all in development
        if (process.env.NODE_ENV !== 'production') {
          return callback(null, true);
        }
        
        callback(null, true); // Permissive fallback
      },
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 1e6,
  });

  // Authentication Middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (token) {
        let uid = null;
        let decoded = null;

        // 1. Fast path: verify our own app JWT token (issued by /api/auth/session)
        try {
          const jwtPayload = jwt.verify(token, JWT_SECRET);
          uid = jwtPayload.uid || jwtPayload.user_id || jwtPayload.sub;
          if (uid) {
            decoded = {
              uid,
              name: jwtPayload.name || null,
              email: jwtPayload.email || null,
              picture: jwtPayload.picture || null,
            };
          }
        } catch (_) {
          // Not an app JWT — fallback to Firebase token
        }

        // 2. Slow path: verify Firebase ID token
        if (!uid) {
          decoded = await verifyIdToken(token).catch((err) => {
            console.warn(`[Socket] ⚠️ Token verification failed:`, err.message);
            return null;
          });
          if (decoded) {
            uid = decoded.uid;
          }
        }

        if (uid) {
          // Resolve full user from DB if available
          const dbUser = await User.findOne({ uid }).catch(() => null);
          const resolvedName = dbUser?.name || decoded?.name || (decoded?.email ? decoded.email.split('@')[0] : 'Explorer');
          const resolvedEmail = dbUser?.email || decoded?.email || '';
          const resolvedPhoto = dbUser?.profileImage || decoded?.picture || null;

          socket.user = {
            id: uid,
            uid: uid,
            _id: dbUser?._id ? String(dbUser._id) : uid,
            name: resolvedName,
            email: resolvedEmail,
            profileImage: resolvedPhoto,
          };
          console.log(`[Socket] ✅ Authenticated user: ${socket.user.name} (${uid})`);
        } else {
          console.warn(`[Socket] ❌ Token verification returned null`);
          socket.user = { uid: 'guest_' + socket.id, name: 'Explorer', id: 'guest_' + socket.id };
        }
      } else {
        console.warn(`[Socket] ❌ No token provided in auth`);
        socket.user = { uid: 'guest_' + socket.id, name: 'Explorer', id: 'guest_' + socket.id };
      }
      next();
    } catch (err) {
      console.error(`[Socket] ❌ Auth middleware error:`, err.message);
      socket.user = { uid: 'guest_' + socket.id, name: 'Explorer', id: 'guest_' + socket.id };
      next();
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user || { uid: 'anonymous' };
    const uid = user.uid || user.id;
    const email = (user.email || '').toLowerCase().trim();
    console.log(`[Socket] ⚡ User connected: ${user.name || uid} (${socket.id})`);

    // Personal user rooms for targeted direct calls and notifications
    if (uid) {
      socket.join(`user:${uid}`);
      socket.join(uid);
    }
    if (user.id && user.id !== uid) {
      socket.join(`user:${user.id}`);
      socket.join(user.id);
    }
    if (user._id && String(user._id) !== uid && String(user._id) !== user.id) {
      socket.join(`user:${String(user._id)}`);
      socket.join(String(user._id));
    }
    if (email) {
      socket.join(`user:email:${email}`);
      socket.join(`user:${email}`);
      socket.join(email);
    }

    // Function to join all groups for a user
    const autoJoinUserGroups = async (targetUser) => {
      const u = targetUser || user;
      const uids = [u.uid, u.id, u._id ? String(u._id) : null].filter(Boolean);
      const userEmail = (u.email || '').toLowerCase().trim();

      const orConditions = [
        { memberUids: { $in: uids } },
        { adminId: { $in: uids } },
        { 'admin.id': { $in: uids } },
        { 'members.userId': { $in: uids } },
        { 'members.user.id': { $in: uids } },
      ];
      if (userEmail) {
        orConditions.push(
          { 'admin.email': { $regex: new RegExp(`^${userEmail}$`, 'i') } },
          { 'members.user.email': { $regex: new RegExp(`^${userEmail}$`, 'i') } }
        );
      }

      if (uids.length > 0 && !uids.every(u => String(u).startsWith('guest_') || u === 'anonymous')) {
        try {
          const groups = await Group.find({ $or: orConditions });
          if (Array.isArray(groups)) {
            groups.forEach((g) => {
              const groupId = g.get('id') || g._doc?.id;
              if (groupId) socket.join(`group:${groupId}`);
            });
            if (groups.length > 0) {
              console.log(`[Socket] 🚪 Auto-joined ${groups.length} group rooms for ${u.name || uid}`);
            }
          }
        } catch (_) {}
      }
    };

    autoJoinUserGroups(user);

    // Allow client to register or update user identity after initial connection
    socket.on('register_user', (userData) => {
      if (!userData) return;
      const regUid = userData.uid || userData.id || userData._id;
      const regEmail = (userData.email || '').toLowerCase().trim();
      if (regUid) {
        socket.join(`user:${regUid}`);
        socket.join(regUid);
        if (userData.id) socket.join(`user:${userData.id}`);
        if (userData._id) socket.join(`user:${String(userData._id)}`);
      }
      if (regEmail) {
        socket.join(`user:email:${regEmail}`);
        socket.join(`user:${regEmail}`);
        socket.join(regEmail);
      }
      autoJoinUserGroups(userData);
    });

    // Join a specific group room
    socket.on('join_group', (groupId) => {
      if (groupId) {
        const room = `group:${groupId}`;
        socket.join(room);
        console.log(`[Socket] 🚪 ${user.name || user.uid} joined room: ${room} (socket: ${socket.id})`);
      }
    });

    // Join multiple group rooms at once (e.g. all groups user belongs to)
    socket.on('join_groups', (groupIds) => {
      if (Array.isArray(groupIds)) {
        groupIds.forEach((gid) => {
          if (gid) {
            socket.join(`group:${gid}`);
          }
        });
        console.log(`[Socket] 🚪 ${user.name || user.uid} joined ${groupIds.length} group rooms`);
      }
    });

    // Leave a specific group room
    socket.on('leave_group', (groupId) => {
      // Don't detach group room for registered members so they keep receiving calls
      console.log(`[Socket] ℹ️ leave_group signal for ${groupId} from ${user.name || user.uid}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] 🔌 User disconnected: ${user.name || user.uid} (${socket.id})`);
    });
  });

  return io;
}

function getIO() {
  return io;
}

// Helper methods to emit real-time updates to group rooms
function emitGroupUpdate(groupId, eventName, payload) {
  if (io && groupId) {
    const room = `group:${groupId}`;
    const socketsInRoom = io.sockets.adapter.rooms.get(room);
    const clientCount = socketsInRoom ? socketsInRoom.size : 0;
    
    console.log(`[Socket] 📤 Emitting '${eventName}' to room '${room}' (${clientCount} clients)`);
    io.to(room).emit(eventName, payload);
  } else {
    console.warn(`[Socket] ⚠️ Cannot emit '${eventName}': io=${!!io}, groupId=${groupId}`);
  }
}

// Emit update directly to an individual user across all their sockets
function emitToUser(userId, eventName, payload) {
  if (io && userId) {
    const room = `user:${userId}`;
    io.to(room).emit(eventName, payload);
  }
}

module.exports = {
  initSocket,
  getIO,
  emitGroupUpdate,
  emitToUser,
};
