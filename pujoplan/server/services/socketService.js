const { Server } = require('socket.io');
const { verifyIdToken } = require('../config/firebase');
const Group = require('../models/Group');

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
        const decoded = await verifyIdToken(token).catch(() => null);
        if (decoded) {
          socket.user = decoded;
        }
      }
      if (!socket.user) {
        socket.user = { uid: 'guest_' + socket.id, name: 'Explorer' };
      }
      next();
    } catch (err) {
      socket.user = { uid: 'guest_' + socket.id, name: 'Explorer' };
      next();
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user || { uid: 'anonymous' };
    const uid = user.uid || user.id;
    console.log(`[Socket] ⚡ User connected: ${user.name || uid} (${socket.id})`);

    // Auto-join all groups this user belongs to
    const uids = [user.uid, user.id, user._id ? String(user._id) : null].filter(Boolean);
    const email = (user.email || '').toLowerCase().trim();

    const orConditions = [
      { memberUids: { $in: uids } },
      { adminId: { $in: uids } },
      { 'admin.id': { $in: uids } },
      { 'members.userId': { $in: uids } },
      { 'members.user.id': { $in: uids } },
    ];
    if (email) {
      orConditions.push(
        { 'admin.email': { $regex: new RegExp(`^${email}$`, 'i') } },
        { 'members.user.email': { $regex: new RegExp(`^${email}$`, 'i') } }
      );
    }

    if (uids.length > 0 && !uids.every(u => u.startsWith('guest_') || u === 'anonymous')) {
      Group.find({ $or: orConditions })
        .then((groups) => {
          if (Array.isArray(groups)) {
            groups.forEach((g) => {
              // Use the custom 'id' field (grp_xxx), not Mongoose's virtual _id
              const groupId = g.get('id') || g._doc?.id;
              if (groupId) socket.join(`group:${groupId}`);
            });
            if (groups.length > 0) {
              console.log(`[Socket] 🚪 Auto-joined ${groups.length} group rooms for ${user.name || uid}`);
            }
          }
        })
        .catch(() => {});
    }



    // Join a specific group room
    socket.on('join_group', (groupId) => {
      if (groupId) {
        const room = `group:${groupId}`;
        socket.join(room);
        console.log(`[Socket] 🚪 ${user.name || user.uid} joined room: ${room} (socket: ${socket.id})`);
        
        // Confirm room join by checking socket rooms
        const rooms = Array.from(socket.rooms);
        console.log(`[Socket] 📋 Active rooms for ${socket.id}:`, rooms);
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
      if (groupId) {
        const room = `group:${groupId}`;
        socket.leave(room);
        console.log(`[Socket] 🚪 ${user.name || user.uid} left room: ${room}`);
      }
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
    
    if (clientCount === 0) {
      console.warn(`[Socket] ⚠️ No clients in room '${room}' to receive '${eventName}'`);
    }
  } else {
    console.warn(`[Socket] ⚠️ Cannot emit '${eventName}': io=${!!io}, groupId=${groupId}`);
  }
}

module.exports = {
  initSocket,
  getIO,
  emitGroupUpdate,
};
