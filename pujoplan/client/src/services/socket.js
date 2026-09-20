import { io } from 'socket.io-client';

export const PRODUCTION_SOCKET_URL = 'https://uma-asche.onrender.com';
const BACKEND_URL = (import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace('/api', '')
  : PRODUCTION_SOCKET_URL).replace(/\/+$/, '');

let socket = null;
let currentGroupId = null;
const allJoinedGroupIds = new Set();

export function getSocket() {
  if (!socket) {
    const token = localStorage.getItem('pp_token') || '';
    socket = io(BACKEND_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket] ⚡ Connected to PujoPlan backend:', socket.id);
      if (allJoinedGroupIds.size > 0) {
        socket.emit('join_groups', Array.from(allJoinedGroupIds));
      } else if (currentGroupId) {
        socket.emit('join_group', currentGroupId);
      }
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });
  }

  return socket;
}

export function updateSocketAuthToken(token) {
  if (socket) {
    socket.auth = { token };
    if (!socket.connected) {
      socket.connect();
    }
  }
}

export function joinGroupRoom(groupId) {
  if (!groupId) return;
  currentGroupId = groupId;
  allJoinedGroupIds.add(groupId);
  const s = getSocket();
  if (s.connected) {
    s.emit('join_group', groupId);
  }
}

export function joinMultipleGroupRooms(groupIds) {
  if (!Array.isArray(groupIds) || groupIds.length === 0) return;
  groupIds.forEach(id => {
    if (id) allJoinedGroupIds.add(id);
  });
  const s = getSocket();
  if (s.connected) {
    s.emit('join_groups', groupIds);
  }
}

export function leaveGroupRoom(groupId) {
  if (currentGroupId === groupId) {
    currentGroupId = null;
  }
  allJoinedGroupIds.delete(groupId);
  const s = getSocket();
  if (s.connected && groupId) {
    s.emit('leave_group', groupId);
  }
}

export function subscribeToIncomingCalls(onIncomingCall, onCallEnded) {
  const s = getSocket();

  const handleIncoming = (data) => {
    if (onIncomingCall && data) onIncomingCall(data);
  };

  const handleSignal = (data) => {
    if (!data) return;
    if (data.type === 'start' || data.status === 'ringing') {
      if (onIncomingCall) onIncomingCall(data);
    } else if (data.type === 'ended' || data.type === 'decline' || data.status === 'ended') {
      if (onCallEnded) onCallEnded(data);
    }
  };

  const handleEnded = (data) => {
    if (onCallEnded && data) onCallEnded(data);
  };

  s.on('incomingCall', handleIncoming);
  s.on('call_signal', handleSignal);
  s.on('callEnded', handleEnded);

  return () => {
    s.off('incomingCall', handleIncoming);
    s.off('call_signal', handleSignal);
    s.off('callEnded', handleEnded);
  };
}

export function subscribeToGroupUpdates(groupId, {
  onMemberJoined,
  onMemberLeft,
  onSpotsUpdated,
  onNewMessage,
  onLocationUpdated,
  onCallSignal,
  onGroupDeleted,
} = {}) {
  const s = getSocket();
  joinGroupRoom(groupId);

  const handleMemberJoined = (data) => onMemberJoined && onMemberJoined(data);
  const handleMemberLeft = (data) => onMemberLeft && onMemberLeft(data);
  const handleSpotsUpdated = (data) => onSpotsUpdated && onSpotsUpdated(data);
  const handleNewMessage = (data) => onNewMessage && onNewMessage(data);
  const handleLocationUpdated = (data) => onLocationUpdated && onLocationUpdated(data);
  const handleCallSignal = (data) => onCallSignal && onCallSignal(data);
  const handleGroupDeleted = (data) => onGroupDeleted && onGroupDeleted(data);

  s.on('member_joined', handleMemberJoined);
  s.on('member_left', handleMemberLeft);
  s.on('spots_updated', handleSpotsUpdated);
  s.on('new_message', handleNewMessage);
  s.on('location_updated', handleLocationUpdated);
  s.on('call_signal', handleCallSignal);
  s.on('group_deleted', handleGroupDeleted);

  return () => {
    s.off('member_joined', handleMemberJoined);
    s.off('member_left', handleMemberLeft);
    s.off('spots_updated', handleSpotsUpdated);
    s.off('new_message', handleNewMessage);
    s.off('location_updated', handleLocationUpdated);
    s.off('call_signal', handleCallSignal);
    s.off('group_deleted', handleGroupDeleted);
    // Note: Do not leave the server room here so user continues to receive
    // incoming call alerts and chat push notifications across tabs/pages
  };
}


