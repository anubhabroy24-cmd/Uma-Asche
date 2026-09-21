import { io } from 'socket.io-client';

// Derive Socket.io server URL from the API URL (strip /api suffix)
const SOCKET_SERVER_URL = 'https://uma-asche.onrender.com';

let socket = null;

function getAuthToken() {
  return localStorage.getItem('pp_token') || null;
}

export function getSocket() {
  if (!socket || socket.disconnected) {
    const token = getAuthToken();
    console.log(`[Socket.io] Creating connection with token: ${!!token ? 'YES' : 'NO'}`);
    socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      auth: (cb) => {
        // Send JWT token so server knows who the connecting user is
        const currentToken = getAuthToken();
        console.log(`[Socket.io] 🔐 Sending auth token: ${!!currentToken ? 'YES' : 'NO'}`);
        cb({ token: currentToken });
      },
    });

    socket.on('connect', () => {
      console.log('[Socket.io] ✅ Connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Socket.io] ⚠️ Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket.io] Connection error:', err.message);
    });

    socket.on('reconnect', (attempt) => {
      console.log('[Socket.io] 🔄 Reconnected after', attempt, 'attempts');
    });
  }
  return socket;
}

/**
 * Subscribe to all real-time events for a specific group.
 * Returns an unsubscribe function.
 */
export function subscribeToGroupUpdates(groupId, handlers = {}) {
  if (!groupId) return () => {};

  const s = getSocket();

  // Wait for socket to be ready before joining group
  const joinRoom = () => {
    if (s.connected) {
      console.log(`[Socket.io] ✅ Socket connected, joining group room: ${groupId}`);
      s.emit('join_group', groupId);
    } else {
      console.warn(`[Socket.io] ⏳ Socket not connected yet, retrying in 500ms...`);
      setTimeout(joinRoom, 500);
    }
  };
  
  // Try joining immediately, but also ensure we join after connection
  joinRoom();
  
  const onConnect = () => {
    console.log(`[Socket.io] 🔄 Reconnected, rejoining group: ${groupId}`);
    s.emit('join_group', groupId);
  };

  const onMemberJoined = (data) => {
    console.log(`[Socket.io] 👤 member_joined:`, data?.member?.user?.name || 'unknown', data);
    handlers.onMemberJoined?.(data);
  };

  const onMemberLeft = (data) => {
    console.log('[Socket.io] 👋 member_left:', data);
    handlers.onMemberLeft?.(data);
  };

  const onSpotsUpdated = (data) => {
    console.log('[Socket.io] 📍 spots_updated:', data);
    handlers.onSpotsUpdated?.(data);
  };

  const onLocationUpdated = (data) => {
    console.log('[Socket.io] 📍 location_updated:', data?.userId);
    handlers.onLocationUpdated?.(data);
  };

  const onGroupDeleted = (data) => {
    console.log('[Socket.io] 🗑️ group_deleted:', data);
    handlers.onGroupDeleted?.(data);
  };

  const onNewMessage = (data) => {
    console.log('[Socket.io] 💬 new_message:', data?.senderName);
    handlers.onNewMessage?.(data);
  };

  const onCallSignal = (data) => {
    console.log('[Socket.io] ☎️ call_signal:', data);
    handlers.onCallSignal?.(data);
  };

  const onIncomingCall = (data) => {
    console.log('[Socket.io] 📞 incomingCall:', data);
    handlers.onIncomingCall?.(data);
  };

  const onCallEnded = (data) => {
    console.log('[Socket.io] ❌ callEnded:', data);
    handlers.onCallEnded?.(data);
  };

  // Register all event handlers
  s.on('member_joined', onMemberJoined);
  s.on('member_left', onMemberLeft);
  s.on('spots_updated', onSpotsUpdated);
  s.on('location_updated', onLocationUpdated);
  s.on('group_deleted', onGroupDeleted);
  s.on('new_message', onNewMessage);
  s.on('call_signal', onCallSignal);
  s.on('incomingCall', onIncomingCall);
  s.on('callEnded', onCallEnded);
  s.on('connect', onConnect);

  // Cleanup: unsubscribe and leave room
  return () => {
    console.log(`[Socket.io] 🚪 Leaving group room: ${groupId}`);
    s.emit('leave_group', groupId);
    s.off('member_joined', onMemberJoined);
    s.off('member_left', onMemberLeft);
    s.off('spots_updated', onSpotsUpdated);
    s.off('location_updated', onLocationUpdated);
    s.off('group_deleted', onGroupDeleted);
    s.off('new_message', onNewMessage);
    s.off('call_signal', onCallSignal);
    s.off('incomingCall', onIncomingCall);
    s.off('callEnded', onCallEnded);
    s.off('connect', onConnect);
  };
}

/**
 * Keep-alive ping to prevent Render free-tier cold-starts.
 * Call once at app startup.
 */
let keepAliveInterval = null;
export function startKeepAlive() {
  if (keepAliveInterval) return; // Only run once
  // Ping every 14 minutes
  keepAliveInterval = setInterval(() => {
    fetch('https://uma-asche.onrender.com/api/health', { method: 'GET' })
      .then(() => console.log('[KeepAlive] ✅ Server pinged'))
      .catch(() => console.warn('[KeepAlive] Ping failed (server may be waking up)'));
  }, 14 * 60 * 1000);
}

export default getSocket;
