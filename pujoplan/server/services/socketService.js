const { Server } = require('socket.io');
const { verifyIdToken } = require('../config/firebase');
const Group = require('../models/Group');

let io = null;

function initSocket(server, clientUrl) {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => callback(null, true),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
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
              socket.join(`group:${g.id}`);
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
        console.log(`[Socket] 🚪 ${user.name || user.uid} joined room: ${room}`);
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
    io.to(`group:${groupId}`).emit(eventName, payload);
  }
}

module.exports = {
  initSocket,
  getIO,
  emitGroupUpdate,
};
