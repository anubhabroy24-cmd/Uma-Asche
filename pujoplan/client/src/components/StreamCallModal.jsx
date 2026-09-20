import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  useCallStateHooks,
  useCall,
  ParticipantView,
  ParticipantsAudio,
  CallingState,
} from '@stream-io/video-react-sdk';
import '@stream-io/video-react-sdk/dist/css/styles.css';
import { getStreamCallToken, sendCallSignal, generateClientStreamToken } from '../services/api';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff,
  Maximize2, Minimize2, Radio, SwitchCamera, Monitor,
  Users, AlertCircle, X,
} from 'lucide-react';
import './StreamCallModal.css';

const STREAM_API_KEY = 'bazavn2fpwsf';

function formatCallDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function StreamCallModal({
  groupId,
  groupName = 'Puja Group',
  currentUser,
  callMode = 'video', // 'video' | 'voice'
  isOpen = false,
  onClose,
}) {
  const [streamClient, setStreamClient] = useState(null);
  const [streamCall, setStreamCall] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Track call state globally to prevent incoming call overlay from ringing for active callers
  useEffect(() => {
    if (isOpen) {
      window.__isUserInCall = true;
      try {
        import('../services/ringtoneService').then(m => m.stopRingtone());
      } catch (_) {}
    } else {
      window.__isUserInCall = false;
    }
    return () => {
      window.__isUserInCall = false;
    };
  }, [isOpen]);

  // Call duration counter
  const [durationSec, setDurationSec] = useState(0);
  useEffect(() => {
    let timer;
    if (isOpen && streamCall && !connecting) {
      timer = setInterval(() => setDurationSec(s => s + 1), 1000);
    } else {
      setDurationSec(0);
    }
    return () => clearInterval(timer);
  }, [isOpen, streamCall, connecting]);

  // Initialize Stream Video Client and join call
  useEffect(() => {
    if (!isOpen || !groupId || !currentUser) return;
    let isCancelled = false;
    let activeCall = null;
    let activeClient = null;

    async function initStream() {
      setConnecting(true);
      setErrorMsg('');

      try {
        const rawUid = currentUser?.id || currentUser?.uid || currentUser?.firebaseUid || 'user_' + Date.now();
        const userId = String(rawUid).replace(/[^a-zA-Z0-9_-]/g, '_');
        const userName = currentUser?.name || currentUser?.displayName || 'Group Member';
        const userImage = currentUser?.profileImage || currentUser?.photoURL || undefined;

        // Fetch user token from backend or client generator
        let token = null;
        let callId = `group_${groupId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        let apiKey = STREAM_API_KEY;

        try {
          const res = await getStreamCallToken(groupId);
          if (res?.data?.token) {
            token = res.data.token;
            if (res.data.callId) callId = res.data.callId;
            if (res.data.apiKey) apiKey = res.data.apiKey;
          }
        } catch (_) { }

        if (!token) {
          token = generateClientStreamToken(userId);
        }

        if (!token) {
          throw new Error('Calling authentication token could not be created.');
        }

        const client = new StreamVideoClient({
          apiKey,
          user: {
            id: userId,
            name: userName,
            image: userImage,
          },
          token,
        });

        if (isCancelled) {
          client.disconnectUser().catch(() => { });
          return;
        }
        activeClient = client;
        setStreamClient(client);

        const call = client.call('default', callId);
        const isAudioOnly = callMode === 'voice' || callMode === 'audio';

        // Join call first so SFU connection is active
        await call.join({ create: true });

        if (isCancelled) {
          call.leave().catch(() => { });
          client.disconnectUser().catch(() => { });
          return;
        }
        activeCall = call;
        setStreamCall(call);

        // Configure camera/mic according to mode:
        // Audio Call: Camera OFF, Microphone ON
        // Video Call: Camera ON, Microphone ON
        if (isAudioOnly) {
          try { await call.camera.disable(); } catch (e) { console.warn('[Stream] camera disable:', e); }
          try { await call.microphone.enable(); } catch (e) { console.warn('[Stream] mic enable:', e); }
        } else {
          try { await call.camera.enable(); } catch (e) { console.warn('[Stream] camera enable:', e); }
          try { await call.microphone.enable(); } catch (e) { console.warn('[Stream] mic enable:', e); }
        }

        // Resume AudioContext playback if browser paused it
        try {
          if (typeof call.resumeAudio === 'function') {
            await call.resumeAudio();
          }
        } catch (_) { }

        // Notify backend / group members via Socket.io
        sendCallSignal(groupId, {
          type: 'start',
          callId,
          callMode: isAudioOnly ? 'voice' : 'video',
          caller: { id: userId, name: userName, profileImage: userImage },
        }).catch(() => { });

      } catch (err) {
        console.error('[Stream Video] Join error:', err);
        if (!isCancelled) {
          setErrorMsg(err.message || 'Failed to start call. Please verify microphone & camera permissions.');
        }
      } finally {
        if (!isCancelled) setConnecting(false);
      }
    }

    initStream();

    return () => {
      isCancelled = true;
      if (activeCall) {
        activeCall.leave().catch(() => { });
      }
      if (activeClient) {
        activeClient.disconnectUser().catch(() => { });
      }
    };
  }, [isOpen, groupId, currentUser, callMode]);

  // Automatically unblock and resume remote audio playback on any user touch/click
  useEffect(() => {
    if (!isOpen || !streamCall) return;

    const unblockAudio = () => {
      try {
        if (typeof streamCall.resumeAudio === 'function') {
          streamCall.resumeAudio();
        }
      } catch (_) { }
    };

    window.addEventListener('click', unblockAudio, { passive: true });
    window.addEventListener('touchstart', unblockAudio, { passive: true });
    window.addEventListener('keydown', unblockAudio, { passive: true });

    return () => {
      window.removeEventListener('click', unblockAudio);
      window.removeEventListener('touchstart', unblockAudio);
      window.removeEventListener('keydown', unblockAudio);
    };
  }, [isOpen, streamCall]);

  // Handle Leave & Cleanup
  const handleLeaveCall = useCallback(async () => {
    try {
      if (streamCall) {
        await streamCall.leave();
      }
    } catch (_) { }

    try {
      if (streamClient) {
        await streamClient.disconnectUser();
      }
    } catch (_) { }

    // Notify backend
    sendCallSignal(groupId, {
      type: 'leave',
      callMode,
    }).catch(() => { });

    setStreamCall(null);
    setStreamClient(null);
    setIsMinimized(false);
    onClose && onClose();
  }, [streamCall, streamClient, groupId, callMode, onClose]);

  if (!isOpen) return null;

  const isAudioOnly = callMode === 'voice' || callMode === 'audio';

  // Minimized floating bubble
  if (isMinimized && streamCall) {
    return (
      <div className="str-call-minimized" onClick={() => setIsMinimized(false)}>
        <div className="str-call-minimized-header">
          <span>{!isAudioOnly ? '📹 Video Call' : '📞 Voice Call'}</span>
          <span>{formatCallDuration(durationSec)}</span>
        </div>
        <div className="str-call-minimized-body">
          <StreamVideo client={streamClient}>
            <StreamCall call={streamCall}>
              <MinimizedParticipantTile isAudioOnly={isAudioOnly} />
            </StreamCall>
          </StreamVideo>
          <div className="str-call-minimized-actions" onClick={e => e.stopPropagation()}>
            <button className="str-mini-btn" onClick={() => setIsMinimized(false)} title="Expand">
              <Maximize2 size={14} />
            </button>
            <button className="str-mini-btn str-mini-btn--end" onClick={handleLeaveCall} title="End Call">
              <PhoneOff size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="str-call-modal-overlay" role="dialog" aria-modal="true" onClick={() => {
      try { streamCall?.resumeAudio?.(); } catch (_) { }
    }}>
      <div className="str-call-container">
        {/* Header */}
        <div className="str-call-header">
          <div className="str-call-header-info">
            <div className="str-call-badge">
              {!isAudioOnly ? <Video size={14} /> : <Phone size={14} />}
              <span>{!isAudioOnly ? 'Video Call' : 'Voice Call'}</span>
            </div>
            <h3 className="str-call-title">{groupName}</h3>
            {!connecting && !errorMsg && (
              <div className="str-call-timer">
                <Radio size={12} color="#34a853" />
                <span>{formatCallDuration(durationSec)}</span>
              </div>
            )}
          </div>

          <div className="str-call-header-tools">
            <button className="str-call-icon-btn" onClick={() => setIsMinimized(true)} title="Minimize call">
              <Minimize2 size={16} />
            </button>
            <button className="str-call-icon-btn" onClick={handleLeaveCall} title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Call Main Body */}
        <div className="str-call-body">
          {errorMsg ? (
            <div className="str-call-connecting" style={{ color: '#ea4335', padding: 24, textAlign: 'center' }}>
              <AlertCircle size={36} />
              <p style={{ marginTop: 12 }}>{errorMsg}</p>
              <button className="btn btn-yellow btn-sm" onClick={handleLeaveCall} style={{ marginTop: 16 }}>
                Close
              </button>
            </div>
          ) : streamClient && streamCall ? (
            <StreamVideo client={streamClient}>
              <StreamCall call={streamCall}>
                <StreamCallGrid callMode={callMode} onLeave={handleLeaveCall} />
              </StreamCall>
            </StreamVideo>
          ) : (
            <div className="str-call-grid str-grid-1">
              <div className="str-tile str-tile--local">
                <div className="str-tile-avatar-wrap">
                  {currentUser?.profileImage || currentUser?.photoURL ? (
                    <img src={currentUser?.profileImage || currentUser?.photoURL} alt={currentUser?.name} className="str-tile-avatar" />
                  ) : (
                    <div className="str-tile-avatar-ph">{currentUser?.name?.[0] || 'U'}</div>
                  )}
                </div>
                <div className="str-tile-tag">
                  <span>{currentUser?.name || 'You'} (You)</span>
                  <Mic size={12} color="#34a853" />
                </div>
              </div>
              <div className={`str-call-controls ${isAudioOnly ? 'str-call-controls--audio' : ''}`}>
                <button className={`str-btn ${isAudioOnly ? 'str-btn--large' : ''}`} title="Microphone">
                  <Mic size={isAudioOnly ? 24 : 20} />
                </button>
                {!isAudioOnly && (
                  <button className="str-btn" title="Camera">
                    <Video size={20} />
                  </button>
                )}
                <button className={`str-btn str-btn--end ${isAudioOnly ? 'str-btn--large' : ''}`} onClick={handleLeaveCall} title="End Call">
                  <PhoneOff size={isAudioOnly ? 26 : 22} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Active Call Grid & Controls ──
function StreamCallGrid({ callMode, onLeave }) {
  const call = useCall();
  const {
    useParticipants,
    useMicrophoneState,
    useCameraState,
    useScreenShareState,
  } = useCallStateHooks();

  const rawParticipants = useParticipants();
  const isAudioOnly = callMode === 'voice' || callMode === 'audio';

  // Deduplicate participants by userId so each person only has 1 tile in the grid
  const participants = React.useMemo(() => {
    const map = new Map();
    rawParticipants.forEach((p) => {
      const key = p.userId || p.sessionId;
      if (!map.has(key)) {
        map.set(key, p);
      } else {
        const existing = map.get(key);
        // Prefer local participant or one with active video/speaking state
        if (p.isLocalParticipant || (p.videoStream && !existing.videoStream) || (p.isSpeaking && !existing.isSpeaking)) {
          map.set(key, p);
        }
      }
    });
    return Array.from(map.values());
  }, [rawParticipants]);

  const { isMute: isMicMuted } = useMicrophoneState();
  const { isMute: isCamMuted } = useCameraState();
  const { isScreenShareOn } = useScreenShareState();

  const toggleMic = async () => {
    try {
      if (isMicMuted) {
        await call.microphone.enable();
      } else {
        await call.microphone.disable();
      }
    } catch (e) {
      console.warn('mic toggle error', e);
    }
  };

  const toggleCam = async () => {
    if (isAudioOnly) return;
    try {
      if (isCamMuted) {
        await call.camera.enable();
      } else {
        await call.camera.disable();
      }
    } catch (e) {
      console.warn('cam toggle error', e);
    }
  };

  const flipCamera = async () => {
    if (isAudioOnly) return;
    try { await call.camera.flip(); } catch (_) { }
  };

  const toggleScreen = async () => {
    if (isAudioOnly) return;
    try { await call.screenShare.toggle(); } catch (_) { }
  };

  const count = participants.length;
  const gridClass = count <= 1 ? 'str-grid-1' : count === 2 ? 'str-grid-2' : count <= 4 ? 'str-grid-4' : 'str-grid-many';

  return (
    <>
      {/* Ensure remote participant audio tracks are actively played */}
      <ParticipantsAudio participants={rawParticipants} />

      <div className={`str-call-grid ${gridClass}`}>
        {participants.map((p) => (
          <div
            key={p.sessionId}
            className={`str-tile ${p.isSpeaking ? 'str-tile--speaking' : ''} ${p.isLocalParticipant ? 'str-tile--local' : ''}`}
          >
            {isAudioOnly ? (
              /* Dedicated Voice Call Tile: Avatar + Voice pulse + No video element */
              <div className="str-tile-avatar-wrap">
                <div className={`str-voice-avatar-ring ${p.isSpeaking ? 'str-voice-avatar-ring--active' : ''}`}>
                  {p.image ? (
                    <img src={p.image} alt={p.name} className="str-tile-avatar" />
                  ) : (
                    <div className="str-tile-avatar-ph">{p.name?.[0] || 'U'}</div>
                  )}
                </div>
                {p.isSpeaking && (
                  <span className="str-voice-speaking-tag">Speaking…</span>
                )}
              </div>
            ) : (
              /* Dedicated Video Call Tile: Stream ParticipantView with Live Video Stream */
              <ParticipantView
                participant={p}
                className="str-tile-participant-view"
                VideoPlaceholder={() => (
                  <div className="str-tile-avatar-wrap">
                    {p.image ? (
                      <img src={p.image} alt={p.name} className="str-tile-avatar" />
                    ) : (
                      <div className="str-tile-avatar-ph">{p.name?.[0] || 'U'}</div>
                    )}
                  </div>
                )}
              />
            )}

            <div className="str-tile-tag">
              <span>{p.name} {p.isLocalParticipant ? '(You)' : ''}</span>
              {p.isMuted ? <MicOff size={12} color="#ea4335" /> : <Mic size={12} color="#34a853" />}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Bottom Controls */}
      {isAudioOnly ? (
        /* Audio-only controls: Only Microphone & End Call buttons */
        <div className="str-call-controls str-call-controls--audio">
          <button
            className={`str-btn str-btn--large ${isMicMuted ? 'str-btn--off' : ''}`}
            onClick={toggleMic}
            title={isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
          >
            {isMicMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>

          <button
            className="str-btn str-btn--end str-btn--large"
            onClick={onLeave}
            title="End Audio Call"
          >
            <PhoneOff size={26} />
          </button>
        </div>
      ) : (
        /* Video call controls: Microphone, Camera, Flip Camera, Screen Share, End Call */
        <div className="str-call-controls">
          <button
            className={`str-btn ${isMicMuted ? 'str-btn--off' : ''}`}
            onClick={toggleMic}
            title={isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
          >
            {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <button
            className={`str-btn ${isCamMuted ? 'str-btn--off' : ''}`}
            onClick={toggleCam}
            title={isCamMuted ? 'Turn Camera On' : 'Turn Camera Off'}
          >
            {isCamMuted ? <VideoOff size={20} /> : <Video size={20} />}
          </button>

          <button className="str-btn" onClick={flipCamera} title="Flip Camera">
            <SwitchCamera size={20} />
          </button>

          <button
            className={`str-btn ${isScreenShareOn ? 'str-btn--active' : ''}`}
            onClick={toggleScreen}
            title="Share Screen"
          >
            <Monitor size={20} />
          </button>

          <button className="str-btn str-btn--end" onClick={onLeave} title="End Call">
            <PhoneOff size={22} />
          </button>
        </div>
      )}
    </>
  );
}

// ── Minimized Single Participant Preview ──
function MinimizedParticipantTile({ isAudioOnly = false }) {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();
  const activeP = participants.find(p => !p.isLocalParticipant) || participants[0];

  if (!activeP) return null;

  if (isAudioOnly) {
    return (
      <div className="str-tile-avatar-wrap" style={{ width: '100%', height: '100%' }}>
        {activeP.image ? (
          <img src={activeP.image} alt="" className="str-tile-avatar" style={{ width: 48, height: 48 }} />
        ) : (
          <div className="str-tile-avatar-ph" style={{ width: 48, height: 48, fontSize: '1.2rem' }}>
            {activeP.name?.[0] || 'U'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ParticipantView
        participant={activeP}
        className="str-tile-participant-view"
        VideoPlaceholder={() => (
          <div className="str-tile-avatar-wrap">
            {activeP.image ? (
              <img src={activeP.image} alt="" className="str-tile-avatar" style={{ width: 48, height: 48 }} />
            ) : (
              <div className="str-tile-avatar-ph" style={{ width: 48, height: 48, fontSize: '1.2rem' }}>
                {activeP.name?.[0] || 'U'}
              </div>
            )}
          </div>
        )}
      />
    </div>
  );
}


