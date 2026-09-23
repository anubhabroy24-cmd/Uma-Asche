import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyGroups, getCallStatus, sendCallSignal } from '../services/api';
import { startRingtone, stopRingtone } from '../services/ringtoneService';
import { showMobileNotification } from '../services/notificationService';
import { getSocket } from '../services/socket';
import { Phone, PhoneOff, Video, Radio } from 'lucide-react';
import './IncomingCallOverlay.css';

export default function IncomingCallOverlay() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeIncomingCall, setActiveIncomingCall] = useState(null);
  const dismissedSessionsRef = useRef(new Set());
  const checkingRef = useRef(false);
  const groupsRef = useRef([]);

  // Helper to check if a user matches current logged-in user
  const isSelf = useCallback((targetUser) => {
    if (!targetUser || !user) return false;
    const tUids = [
      targetUser.id,
      targetUser.userId,
      targetUser.uid,
      targetUser._id,
    ].filter(Boolean).map(String);

    const uUids = [
      user.id,
      user.userId,
      user.uid,
      user.firebaseUid,
      user._id,
    ].filter(Boolean).map(String);

    if (tUids.some(tid => uUids.includes(tid))) return true;

    const tEmail = (targetUser.email || '').toLowerCase().trim();
    const uEmail = (user.email || '').toLowerCase().trim();
    if (tEmail && uEmail && tEmail === uEmail) return true;

    return false;
  }, [user]);

  const activeIncomingCallRef = useRef(activeIncomingCall);
  useEffect(() => {
    activeIncomingCallRef.current = activeIncomingCall;
  }, [activeIncomingCall]);

  // Auto-timeout after 45 seconds of continuous ringing if unanswered
  useEffect(() => {
    if (!activeIncomingCall) return;
    const timer = setTimeout(() => {
      stopRingtone();
      setActiveIncomingCall(null);
    }, 45000);

    return () => clearTimeout(timer);
  }, [activeIncomingCall]);

  // Handler to trigger incoming call ring on this device
  const triggerIncomingCall = useCallback((callData) => {
    if (!user || window.__isUserInCall) return;
    const caller = callData.startedBy || callData.caller;
    if (!caller || isSelf(caller)) return;

    // If user is currently in the active call page, don't show incoming overlay
    if (location.pathname.startsWith('/group/') && location.search.includes('call=join')) {
      stopRingtone();
      setActiveIncomingCall(null);
      return;
    }

    const sessionId = `${callData.groupId}_${callData.startedAt || caller.id || caller.userId || Date.now()}`;
    if (dismissedSessionsRef.current.has(sessionId)) return;

    setActiveIncomingCall({
      groupId: callData.groupId,
      groupName: callData.groupName || 'Puja Group',
      sessionId,
      callMode: callData.callMode || 'video',
      startedBy: caller,
      startedAt: callData.startedAt || Date.now(),
    });

    startRingtone();

    const modeLabel = callData.callMode === 'voice' ? '📞 Voice Call' : '📹 Video Call';
    showMobileNotification({
      title: `Incoming ${modeLabel}`,
      body: `${caller.name || 'Group member'} is calling in "${callData.groupName || 'your group'}". Tap to answer!`,
      id: (Date.now() % 100000),
      sound: 'default',
    });
  }, [user, isSelf, location.pathname, location.search]);

  // ── Real-Time Socket.io Event Listener (Instant Delivery in Milliseconds) ──
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();

    const handleIncomingCallSocket = (data) => {
      console.log('[IncomingCallOverlay] 📞 Socket incomingCall event received:', data);
      if (data && data.groupId) {
        triggerIncomingCall(data);
      }
    };

    const handleCallSignalSocket = (data) => {
      if (!data) return;
      if (data.type === 'start' || data.type === 'startCall') {
        triggerIncomingCall(data);
      } else if (data.type === 'ended' || data.type === 'end') {
        if (activeIncomingCallRef.current && activeIncomingCallRef.current.groupId === data.groupId) {
          stopRingtone();
          setActiveIncomingCall(null);
        }
      }
    };

    const handleCallEndedSocket = (data) => {
      console.log('[IncomingCallOverlay] ❌ Socket callEnded event received:', data);
      if (activeIncomingCallRef.current && activeIncomingCallRef.current.groupId === data?.groupId) {
        stopRingtone();
        setActiveIncomingCall(null);
      }
    };

    socket.on('incomingCall', handleIncomingCallSocket);
    socket.on('call_signal', handleCallSignalSocket);
    socket.on('callEnded', handleCallEndedSocket);

    return () => {
      socket.off('incomingCall', handleIncomingCallSocket);
      socket.off('call_signal', handleCallSignalSocket);
      socket.off('callEnded', handleCallEndedSocket);
    };
  }, [user, triggerIncomingCall]);

  // ── Polling & Fallback call state checker ──
  const checkForActiveCalls = useCallback(async () => {
    if (!user || checkingRef.current) return;
    if (window.__isUserInCall) {
      stopRingtone();
      setActiveIncomingCall(null);
      return;
    }
    checkingRef.current = true;

    try {
      if (location.pathname.startsWith('/group/') && location.search.includes('call=join')) {
        stopRingtone();
        setActiveIncomingCall(null);
        return;
      }

      // If an incoming call is already ringing, check ONLY if that specific call was ended
      if (activeIncomingCallRef.current) {
        try {
          const { data: status } = await getCallStatus(activeIncomingCallRef.current.groupId);
          if (status && status.active === false) {
            stopRingtone();
            setActiveIncomingCall(null);
          }
        } catch (_) { }
        return;
      }

      // Otherwise, scan groups to catch any active incoming call
      const { data: groups } = await getMyGroups();
      if (!Array.isArray(groups) || groups.length === 0) return;
      groupsRef.current = groups;

      // Ensure socket joins all group rooms
      try {
        const socket = getSocket();
        if (socket && groups.length > 0) {
          socket.emit('join_groups', groups.map(g => g.id).filter(Boolean));
        }
      } catch (_) {}

      for (const grp of groups) {
        if (!grp || !grp.id) continue;
        try {
          const { data: status } = await getCallStatus(grp.id);
          if (
            status &&
            status.active &&
            status.startedBy &&
            !isSelf(status.startedBy)
          ) {
            const sessionId = `${grp.id}_${status.startedAt || status.startedBy.id}`;

            if (dismissedSessionsRef.current.has(sessionId)) {
              continue;
            }

            const amInCall = Array.isArray(status.participants) && status.participants.some(p => isSelf(p));
            if (amInCall) {
              continue;
            }

            triggerIncomingCall({
              groupId: grp.id,
              groupName: grp.name,
              sessionId,
              callMode: status.callMode || 'video',
              startedBy: status.startedBy,
              startedAt: status.startedAt || Date.now(),
            });

            return;
          }
        } catch (_) { }
      }
    } catch (_) {
    } finally {
      checkingRef.current = false;
    }
  }, [user, location.pathname, location.search, isSelf, triggerIncomingCall]);

  useEffect(() => {
    checkForActiveCalls();
    const interval = setInterval(checkForActiveCalls, 3000);
    return () => {
      clearInterval(interval);
    };
  }, [checkForActiveCalls]);

  useEffect(() => {
    return () => {
      stopRingtone();
    };
  }, []);

  function handleDecline() {
    if (activeIncomingCall) {
      dismissedSessionsRef.current.add(activeIncomingCall.sessionId);
      sendCallSignal(activeIncomingCall.groupId, { type: 'decline' }).catch(() => { });
    }
    stopRingtone();
    setActiveIncomingCall(null);
  }

  function handleAccept() {
    if (!activeIncomingCall) return;
    const { groupId, callMode, sessionId } = activeIncomingCall;
    dismissedSessionsRef.current.add(sessionId);
    stopRingtone();
    setActiveIncomingCall(null);
    sendCallSignal(groupId, { type: 'accept', callMode }).catch(() => {});
    navigate(`/group/${groupId}?tab=chat&call=join&mode=${callMode}`);
  }


  if (!activeIncomingCall) return null;

  const { groupName, callMode, startedBy } = activeIncomingCall;
  const isAudioOnly = callMode === 'voice' || callMode === 'audio';
  const isVideo = !isAudioOnly;

  return (
    <div className="incoming-call-overlay" role="dialog" aria-modal="true" aria-label="Incoming Call">
      <div className="incoming-call-card">
        <div className="incoming-call-badge">
          {isVideo ? <Video size={14} /> : <Phone size={14} />}
          <span>Incoming {isVideo ? 'Video' : 'Voice'} Call</span>
        </div>


        {/* Pulsing Avatar */}
        <div className="incoming-call-avatar-wrap">
          <div className="incoming-call-ripple" />
          <div className="incoming-call-ripple incoming-call-ripple--2" />
          {startedBy?.profileImage ? (
            <img src={startedBy.profileImage} alt="" className="incoming-call-avatar" referrerPolicy="no-referrer" />
          ) : (
            <div className="incoming-call-avatar-ph">{startedBy?.name?.[0] || 'U'}</div>
          )}
        </div>

        <h2 className="incoming-call-name">{startedBy?.name || 'Group Member'}</h2>
        <p className="incoming-call-group">{groupName}</p>
        <p className="incoming-call-status">Calling...</p>

        {/* Action buttons */}
        <div className="incoming-call-actions">
          <div className="incoming-call-btn-wrap">
            <button
              type="button"
              className="incoming-call-btn incoming-call-btn--decline"
              onClick={handleDecline}
              aria-label="Decline Call"
            >
              <PhoneOff size={28} />
            </button>
            <span className="incoming-call-btn-label">Decline</span>
          </div>

          <div className="incoming-call-btn-wrap">
            <button
              type="button"
              className="incoming-call-btn incoming-call-btn--accept"
              onClick={handleAccept}
              aria-label="Accept Call"
            >
              <Phone size={28} />
            </button>
            <span className="incoming-call-btn-label">Answer</span>
          </div>
        </div>
      </div>
    </div>
  );
}
