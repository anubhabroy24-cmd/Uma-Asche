import { getGroupMessages, sendGroupMessage, getCallStatus } from '../services/api';
import { showMobileNotification } from '../services/notificationService';
import { subscribeToGroupUpdates } from '../services/socket';
import {
  Send, MessageSquare, AlertCircle, Phone, PhoneOff,
  Mic, MicOff, Volume2, Users, Radio, Video, VideoOff,
  Maximize2, Minimize2, Image as ImageIcon, X, ZoomIn,
  ChevronDown, ShieldCheck
} from 'lucide-react';
import './GroupChat.css';

function formatMessageTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// WebRTC ICE configuration with Google STUN + Open Relay Free TURN Servers for mobile data & strict NATs
export const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelay',
      credential: 'openrelay',
    },
    {
      urls: [
        'turns:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelay',
      credential: 'openrelay',
    },
  ],
  iceCandidatePoolSize: 10,
};

// Helper to accurately detect if message was sent by the current active user
function isMsgFromUser(msg, currentUser) {
  if (!msg || !currentUser) return false;
  const currentUids = [
    currentUser.id,
    currentUser.uid,
    currentUser.firebaseUid,
    currentUser._id,
  ].filter(Boolean);

  const msgUids = [
    msg.user?.id,
    msg.user?.uid,
    msg.senderId,
    msg.userId,
    msg.user?._id,
  ].filter(Boolean);

  if (currentUids.some((u) => msgUids.includes(u))) return true;

  if (
    currentUser.email &&
    (msg.user?.email === currentUser.email || msg.senderEmail === currentUser.email)
  ) {
    return true;
  }

  return false;
}

// Helper to resolve sender display info with proper fallback
function getMsgSender(msg, currentUser, isMe) {
  if (isMe) {
    return {
      name: currentUser?.name || currentUser?.displayName || 'You',
      profileImage: currentUser?.profileImage || currentUser?.photoURL || null,
    };
  }
  const name = msg.user?.name || msg.senderName || 'Member';
  const profileImage = msg.user?.profileImage || msg.senderImage || null;
  return { name, profileImage };
}

// Compress selected photo before upload to keep chat fast and responsive
function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Please select an image file.'));
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_DIM = 1200;
          let { width, height } = img;
          if (width > height) {
            if (width > MAX_DIM) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Failed to decode image.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function areParticipantsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].name !== b[i].name) {
      return false;
    }
  }
  return true;
}

export default function GroupChat({ groupId, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [previewPhotoModal, setPreviewPhotoModal] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const isInitialLoadRef = useRef(true);
  const currentUserRef = useRef(currentUser);
  const messagesRequestActiveRef = useRef(false);
  const callRequestActiveRef = useRef(false);
  const previousMessageCountRef = useRef(0);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // ── Call (Voice & Video) State with Stream ──
  const [callActive, setCallActive] = useState(false);
  const [callMode, setCallMode] = useState('video'); // 'video' | 'voice'
  const [isInCall, setIsInCall] = useState(false);
  const [callParticipants, setCallParticipants] = useState([]);
  const [callStartedBy, setCallStartedBy] = useState(null);
  const [callConnecting, setCallConnecting] = useState(false);

  const lastKnownMessageIdRef = useRef(null);
  const prevCallActiveRef = useRef(false);

  const fetchMessages = useCallback(async () => {
    if (messagesRequestActiveRef.current) return;
    messagesRequestActiveRef.current = true;
    const user = currentUserRef.current;

    try {
      const { data } = await getGroupMessages(groupId);
      if (Array.isArray(data)) {
        if (!isInitialLoadRef.current && lastKnownMessageIdRef.current && data.length > 0) {
          // Check for any new message from other members
          const newMsgs = data.filter(
            m => m.id !== lastKnownMessageIdRef.current &&
              !isMsgFromUser(m, user) &&
              new Date(m.createdAt).getTime() > (window.__lastMsgSeenTime || 0)
          );
          if (newMsgs.length > 0) {
            const latest = newMsgs[newMsgs.length - 1];
            const senderInfo = getMsgSender(latest, user, false);
            showMobileNotification({
              title: senderInfo.name ? `💬 ${senderInfo.name}` : '💬 New Group Message',
              body: latest.text ? latest.text : '📷 Shared a photo',
              id: (Date.now() % 100000),
            });
          }
        }
        if (data.length > 0) {
          const lastMsg = data[data.length - 1];
          lastKnownMessageIdRef.current = lastMsg.id;
          window.__lastMsgSeenTime = new Date(lastMsg.createdAt).getTime();
        }

        setMessages((prev) => {
          if (data.length === 0 && prev.length > 0) {
            // Do not wipe out existing chat if empty result comes from an offline/network fallback
            return prev;
          }
          // Keep any optimistic temporary messages that haven't been saved yet
          const pendingTemp = prev.filter(
            (m) =>
              typeof m.id === 'string' &&
              m.id.startsWith('temp-') &&
              !data.some((dm) => isMsgFromUser(dm, user) && dm.text === m.text && (dm.imageUrl || null) === (m.imageUrl || null))
          );
          if (pendingTemp.length === 0) return data;
          return [...data, ...pendingTemp];
        });
        setError('');
      }
    } catch (e) {
      if (isInitialLoadRef.current) {
        setError(e.response?.data?.error || 'Failed to load group chat.');
      }
    } finally {
      messagesRequestActiveRef.current = false;
      if (isInitialLoadRef.current) {
        setLoading(false);
        isInitialLoadRef.current = false;
      }
    }
  }, [groupId]);

  useEffect(() => {
    isInitialLoadRef.current = true;
    setLoading(true);
    setMessages([]);
    setError('');
    lastKnownMessageIdRef.current = null;
    previousMessageCountRef.current = 0;
  }, [groupId]);

  // Initial fetch + real-time Socket.io subscription + slow fallback poll
  useEffect(() => {
    if (!groupId) return undefined;

    fetchMessages();

    const currentUserSnapshot = currentUserRef.current;

    // Real-time: listen for new messages via Socket.io (instant delivery)
    const unsubSocket = subscribeToGroupUpdates(groupId, {
      onNewMessage: (msg) => {
        if (!msg) return;
        const user = currentUserRef.current || currentUserSnapshot;
        // Avoid duplicate if this was our own optimistic message
        setMessages((prev) => {
          const isDuplicate = prev.some(
            (m) => m.id === msg.id || (m.id?.startsWith('temp-') && isMsgFromUser(m, user) && m.text === msg.text)
          );
          if (isDuplicate) return prev;
          // Remove any matching temp message for this content
          const filtered = prev.filter(
            (m) => !(m.id?.startsWith('temp-') && isMsgFromUser(m, user) && m.text === msg.text)
          );
          return [...filtered, msg];
        });
      },
    });

    // Fallback: slower poll every 8s in case socket misses something
    const interval = setInterval(fetchMessages, 8000);

    return () => {
      clearInterval(interval);
      unsubSocket();
    };
  }, [fetchMessages, groupId]);


  // Scroll to bottom on new messages
  useEffect(() => {
    const behavior = previousMessageCountRef.current === 0 ? 'auto' : 'smooth';
    messagesEndRef.current?.scrollIntoView({ behavior });
    previousMessageCountRef.current = messages.length;
  }, [messages]);

  // ── Poll Call Status ──
  const pollCallStatus = useCallback(async () => {
    if (callRequestActiveRef.current) return;
    callRequestActiveRef.current = true;
    try {
      const { data } = await getCallStatus(groupId);

      if (data && data.active && !prevCallActiveRef.current && !isInCall) {
        const callerName = data.startedBy?.name || 'A group member';
        const modeLabel = data.callMode === 'video' ? '📹 Video Call' : '📞 Voice Call';
        showMobileNotification({
          title: `Incoming ${modeLabel}`,
          body: `${callerName} started a ${modeLabel.toLowerCase()} in your Puja group. Tap to join!`,
          id: (Date.now() % 100000),
          sound: 'default',
        });
      }
      prevCallActiveRef.current = Boolean(data?.active);

      setCallActive(prev => (prev === data.active ? prev : Boolean(data.active)));
      if (data.callMode) {
        setCallMode(prev => (prev === data.callMode ? prev : data.callMode));
      }
      setCallParticipants(prev => (areParticipantsEqual(prev, data.participants) ? prev : (data.participants || [])));
      setCallStartedBy(prev => {
        if (!prev && !data.startedBy) return prev;
        if (prev?.id === data.startedBy?.id) return prev;
        return data.startedBy || null;
      });
    } catch (_) { }
    finally {
      callRequestActiveRef.current = false;
    }
  }, [groupId, isInCall]);

  // ── Live Call State Polling ──
  useEffect(() => {
    let timerId = setTimeout(pollCallStatus, 1200);
    const interval = setInterval(pollCallStatus, 10000);

    return () => {
      clearTimeout(timerId);
      clearInterval(interval);
      try {
        import('../services/ringtoneService').then(m => m.stopRingtone());
      } catch (_) { }
    };
  }, [pollCallStatus, groupId, currentUser?.id, isInCall]);


  // ── Start / Join Call (Voice or Video) with Stream ──
  function handleStartOrJoinCall(mode = 'video') {
    setCallMode(mode);
    setIsInCall(true);
    try {
      import('../services/ringtoneService').then(m => m.stopRingtone());
    } catch (_) { }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingPhoto(true);
      setError('');
      const compressedDataUrl = await compressImage(file);
      setSelectedPhoto({
        name: file.name,
        dataUrl: compressedDataUrl,
      });
    } catch (err) {
      console.warn('Image processing error:', err);
      setError(err.message || 'Failed to attach image.');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleRemovePhoto() {
    setSelectedPhoto(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleSend(e) {
    if (e) e.preventDefault();
    const text = inputText.trim();
    const photo = selectedPhoto?.dataUrl || null;

    if ((!text && !photo) || sending) return;

    setSending(true);
    setInputText('');
    setSelectedPhoto(null);

    // Optimistic message append
    const tempId = 'temp-' + Date.now();
    const optimisticMsg = {
      id: tempId,
      text,
      imageUrl: photo,
      createdAt: new Date().toISOString(),
      senderId: currentUser?.id || currentUser?.uid,
      senderName: currentUser?.name || currentUser?.displayName || 'You',
      senderImage: currentUser?.profileImage || currentUser?.photoURL || null,
      user: {
        id: currentUser?.id || currentUser?.uid,
        name: currentUser?.name || currentUser?.displayName || 'You',
        profileImage: currentUser?.profileImage || currentUser?.photoURL || null,
        email: currentUser?.email || '',
      },
    };

    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const { data: realMsg } = await sendGroupMessage(groupId, {
        text,
        imageUrl: photo,
      });
      setMessages(prev => {
        // If realMsg was already inserted via Socket.io, remove the temp message to avoid duplicates
        const alreadyHasReal = prev.some(m => m.id === realMsg.id);
        if (alreadyHasReal) {
          return prev.filter(m => m.id !== tempId);
        }
        return prev.map(m => (m.id === tempId ? realMsg : m));
      });
    } catch (err) {
      // Revert if error
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setInputText(text); // restore text so user doesn't lose it
      if (photo) setSelectedPhoto({ dataUrl: photo, name: 'Attached photo' });
      alert(err.response?.data?.error || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  if (loading) {
    return (
      <div className="gc__loading">
        <div className="spinner" style={{ width: 24, height: 24 }} />
        <span>Loading conversations…</span>
      </div>
    );
  }

  return (
    <div className="gc">
      {/* ── Stream Video & Audio Calling Modal ── */}
      {isInCall && (
        <StreamCallModal
          groupId={groupId}
          groupName="Puja Group Call"
          currentUser={currentUser}
          callMode={callMode}
          isOpen={isInCall}
          onClose={() => setIsInCall(false)}
        />
      )}

      {/* ── Normal Call Bar (when not in active call) ── */}
      {!isInCall && (
        <div className={`gc__call-bar ${callActive ? 'gc__call-bar--active' : ''}`}>
          <div className="gc__call-info">
            <div className="gc__call-badge">
              <Radio size={14} className={callActive ? 'gc__pulse-dot' : ''} />
              <span>{callActive ? `LIVE GROUP ${callMode.toUpperCase()} CALL` : 'GROUP CALLING'}</span>
            </div>
            {callActive ? (
              <div className="gc__call-meta">
                <span className="gc__call-count">
                  <Users size={12} /> {callParticipants.length} active
                </span>
                <span className="gc__call-names">
                  {callParticipants.map(p => p.name).join(', ')}
                </span>
              </div>
            ) : (
              <span className="gc__call-subtitle">Live voice & video chat with group members</span>
            )}
          </div>

          <div className="gc__call-actions">
            {callActive ? (
              <button
                type="button"
                className="btn btn-sm btn-green gc__join-pulse"
                onClick={() => handleStartOrJoinCall(callMode || 'video')}
                disabled={callConnecting}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
              >
                {callConnecting ? (
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                ) : callMode === 'video' ? (
                  <Video size={14} />
                ) : (
                  <Phone size={14} />
                )}
                {callConnecting ? 'Connecting…' : `Join ${callMode === 'video' ? 'Video' : 'Call'}`}
              </button>
            ) : (
              <div className="gc__call-start-buttons">
                <button
                  type="button"
                  className="btn btn-sm btn-yellow"
                  onClick={() => handleStartOrJoinCall('video')}
                  disabled={callConnecting}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, padding: '7px 14px' }}
                  title="Start group video call"
                >
                  <Video size={15} />
                  <span>Video</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error gc__error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Messages Feed */}
      <div className="gc__feed">
        {messages.length === 0 ? (
          <div className="gc__empty">
            <div className="gc__empty-icon">
              <MessageSquare size={32} />
            </div>
            <h4>Group Discussion & Photos</h4>
            <p>Coordinate pandal visits, share photos with friends, or start a video/voice call with your squad! 🪔</p>
          </div>
        ) : (
          messages.map(msg => {
            // System notices (e.g. member joined) rendered as centered WhatsApp pills
            if (msg.type === 'system') {
              return (
                <div key={msg.id} className="gc__system-pill-row">
                  <div className="gc__system-pill">
                    <span className="gc__system-pill-text">{msg.text}</span>
                    <span className="gc__system-pill-time">{formatMessageTime(msg.createdAt)}</span>
                  </div>
                </div>
              );
            }

            const isMe = isMsgFromUser(msg, currentUser);
            const sender = getMsgSender(msg, currentUser, isMe);

            return (
              <div
                key={msg.id}
                className={`gc__bubble-row ${isMe ? 'gc__bubble-row--me' : 'gc__bubble-row--other'}`}
              >
                {!isMe && (
                  <div className="gc__avatar-wrap">
                    {sender.profileImage ? (
                      <img
                        src={sender.profileImage}
                        alt={sender.name}
                        className="gc__avatar"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="gc__avatar gc__avatar--ph">
                        {sender.name?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                )}

                <div className={`gc__bubble ${isMe ? 'gc__bubble--me' : 'gc__bubble--other'}`}>
                  {!isMe && <span className="gc__sender-name">{sender.name}</span>}

                  {msg.imageUrl && (
                    <div
                      className="gc__bubble-img-wrap"
                      onClick={() => setPreviewPhotoModal(msg.imageUrl)}
                      title="Click to zoom photo"
                    >
                      <img
                        src={msg.imageUrl}
                        alt="Shared in group"
                        className="gc__bubble-img"
                        loading="lazy"
                      />
                      <div className="gc__bubble-img-hover">
                        <ZoomIn size={16} />
                      </div>
                    </div>
                  )}

                  {msg.text ? <div className="gc__text">{msg.text}</div> : null}
                  <div className="gc__bubble-meta">
                    <span className="gc__time">{formatMessageTime(msg.createdAt)}</span>
                    {isMe && (
                      <span className="gc__check-marks" title="Delivered">✓✓</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Photo Attachment Selected Preview */}
      {selectedPhoto && (
        <div className="gc__photo-preview-bar">
          <div className="gc__photo-thumb-wrap">
            <img src={selectedPhoto.dataUrl} alt="Preview" className="gc__photo-thumb" />
            <button
              type="button"
              className="gc__photo-thumb-remove"
              onClick={handleRemovePhoto}
              title="Remove photo"
              aria-label="Remove photo"
            >
              <X size={12} />
            </button>
          </div>
          <span className="gc__photo-preview-label">Photo attached (ready to send)</span>
        </div>
      )}

      {/* Message Input Box */}
      <form className="gc__input-bar" onSubmit={handleSend}>
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <button
          type="button"
          className="gc__attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Share photo in group"
          aria-label="Share photo"
          disabled={uploadingPhoto || sending}
        >
          {uploadingPhoto ? (
            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          ) : (
            <ImageIcon size={19} />
          )}
        </button>

        <input
          type="text"
          className="gc__input"
          placeholder={selectedPhoto ? 'Add a caption…' : 'Message your group…'}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={1000}
          autoComplete="off"
        />

        <button
          type="submit"
          className="gc__send-btn"
          disabled={(!inputText.trim() && !selectedPhoto) || sending}
          aria-label="Send message"
        >
          <Send size={16} />
        </button>
      </form>

      {/* Lightbox Zoom Modal for Chat Photos */}
      {previewPhotoModal && (
        <div className="gc__lightbox-overlay" onClick={() => setPreviewPhotoModal(null)}>
          <div className="gc__lightbox-content" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="gc__lightbox-close"
              onClick={() => setPreviewPhotoModal(null)}
              aria-label="Close enlarged photo"
            >
              <X size={20} />
            </button>
            <img src={previewPhotoModal} alt="Shared in chat" className="gc__lightbox-img" />
          </div>
        </div>
      )}
    </div>
  );
}
