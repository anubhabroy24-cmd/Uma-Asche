import React, { useState, useEffect, useRef } from 'react';
import {
  Compass, X, Send, MapPin, Navigation, ArrowRight,
  ExternalLink, RotateCcw, Footprints, Car,
  ChevronDown, Flame, Sparkles
} from 'lucide-react';
import { processDistanceQuery, isMathOrSyllabus } from '../utils/distanceBotEngine';
import { getReliableCurrentLocation } from '../services/routingService';
import { sendGeminiMessage } from '../services/geminiService';
import './DistanceChatbot.css';

const INITIAL_MESSAGES = [
  {
    id: 'msg-init',
    sender: 'bot',
    type: 'greeting',
    reply: 'শুভ শারদীয়া! 🙏',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  },
];

// Helper to parse markdown links [text](url) and bold **text** into clickable elements
function renderFormattedReply(text) {
  if (!text) return null;
  const lines = text.split('\n');

  return lines.map((line, lineIdx) => {
    if (!line.trim()) {
      return <div key={lineIdx} style={{ height: 6 }} />;
    }

    const tokens = [];
    const regex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)|\*\*([^*]+)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        tokens.push(line.slice(lastIndex, match.index));
      }
      if (match[1] && match[2]) {
        tokens.push(
          <a
            key={`lnk-${match.index}`}
            href={match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="distbot-inline-link"
          >
            {match[1]} <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 2 }} />
          </a>
        );
      } else if (match[3]) {
        tokens.push(<strong key={`b-${match.index}`}>{match[3]}</strong>);
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      tokens.push(line.slice(lastIndex));
    }

    const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-');
    return (
      <p
        key={lineIdx}
        style={{
          margin: isBullet ? '3px 0' : '5px 0',
          paddingLeft: isBullet ? '4px' : '0',
          lineHeight: '1.48',
        }}
      >
        {tokens}
      </p>
    );
  });
}

export default function DistanceChatbot({
  defaultOpen = false,
  embedded = false,
  groupSpots = [],
  groupName = '',
  startLocation = '',
  waypoints = []
}) {
  const [isOpen, setIsOpen] = useState(embedded ? true : defaultOpen);

  const getInitialMessages = () => {
    return [
      {
        id: 'msg-init',
        sender: 'bot',
        type: 'greeting',
        reply: 'শুভ শারদীয়া! 🙏',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
    ];
  };

  const [messages, setMessages] = useState(getInitialMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState('');
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const localCacheRef = useRef(new Map());

  // Auto scroll inside chatbot message container ONLY (prevents outer page scrolling)
  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isTyping]);

  // Native Android Hardware / Gesture Back Button handling for floating mode
  useEffect(() => {
    if (embedded || !isOpen) return;

    const handleAppBack = (e) => {
      e.preventDefault();
      setIsOpen(false);
    };

    window.addEventListener('app:back', handleAppBack);
    return () => {
      window.removeEventListener('app:back', handleAppBack);
    };
  }, [isOpen, embedded]);

  const handleClose = () => {
    if (!embedded) {
      setIsOpen(false);
    }
  };

  // Fetch device GPS coordinates
  const handleGetLocation = async () => {
    setLocLoading(true);
    setLocError('');
    try {
      const loc = await getReliableCurrentLocation();
      const coords = {
        latitude: loc.lat,
        longitude: loc.lng,
        accuracy: loc.accuracy,
      };
      setUserLocation(coords);
      setLocLoading(false);
      // Automatically ask for nearby pandals once GPS is acquired
      sendMessage('Pandals near my current GPS location', coords);
    } catch (err) {
      setLocLoading(false);
      setLocError('Could not get GPS. Please allow location permissions.');
    }
  };

  // Send message
  const sendMessage = async (textToSend, overrideLoc = null) => {
    const text = (textToSend || input).trim();
    if (!text) return;

    const userMsg = {
      id: 'usr-' + Date.now(),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // 1. Instant 0ms Filter for Image Gen / School Homework / Research Papers
    if (isMathOrSyllabus(text)) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'bot-' + Date.now(),
          sender: 'bot',
          type: 'text',
          reply: '🙏 শুভ শারদীয়া! I am your Durga Puja & Kolkata Guide Assistant. I cannot create images, solve school homework, or write academic research papers. Feel free to ask me anything about pandals, routes, food, metro, places to visit, and festive guides in any language!',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      return;
    }

    // 2. Instant 0ms Client Cache Hit
    const normKey = text.toLowerCase().trim();
    if (localCacheRef.current.has(normKey)) {
      const cachedMsg = localCacheRef.current.get(normKey);
      setMessages((prev) => [
        ...prev,
        {
          ...cachedMsg,
          id: 'bot-' + Date.now(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      return;
    }

    setIsTyping(true);
    const activeLoc = overrideLoc || userLocation;

    try {
      const geminiRes = await sendGeminiMessage(text, messages, {
        groupName,
        startLocation,
        groupSpots,
        userLocation: activeLoc,
      });

      const botMsg = {
        id: 'bot-' + Date.now(),
        sender: 'bot',
        type: 'gemini_response',
        reply: geminiRes.reply,
        gmapsUrl: geminiRes.gmapsUrl,
        modelUsed: geminiRes.modelUsed,
        source: 'gemini',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      localCacheRef.current.set(normKey, botMsg);
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.warn('AI call error, using local fallback:', err);
      try {
        const responseData = await processDistanceQuery(text, activeLoc);
        const botMsg = {
          id: 'bot-' + Date.now(),
          sender: 'bot',
          ...responseData,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, botMsg]);
      } catch (localErr) {
        setMessages((prev) => [
          ...prev,
          {
            id: 'bot-' + Date.now(),
            sender: 'bot',
            type: 'text',
            reply: 'Sorry, I ran into an issue. Please ask about Kolkata Puja pandals or routes!',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage();
  };

  const handleClearChat = () => {
    setMessages(getInitialMessages());
  };

  return (
    <div className={`distbot-root ${embedded ? 'distbot-root--embedded' : ''}`}>
      {/* Floating Trigger Button */}
      {!isOpen && !embedded && (
        <button
          className="distbot-trigger"
          onClick={() => setIsOpen(true)}
          aria-label="Open Distance Chatbot"
          title="Ask Pujo Distance AI"
        >
          <div className="distbot-trigger__glow" />
          <div className="distbot-trigger__icon">
            <Compass size={24} className="distbot-trigger__compass" />
            <span className="distbot-trigger__badge">AI</span>
          </div>
          <div className="distbot-trigger__text">
            <span className="distbot-trigger__title">Distance Bot</span>
            <span className="distbot-trigger__sub">Route & Transit</span>
          </div>
        </button>
      )}

      {/* Chat Window */}
      {(isOpen || embedded) && (
        <div className="distbot-window" role="dialog" aria-label="Pujo Distance Assistant">
          {/* Mobile Bottom Sheet Drag Handle */}
          {!embedded && (
            <div className="distbot-mobile-handle-bar">
              <div className="distbot-mobile-handle" />
            </div>
          )}

          {/* Header */}
          <div className="distbot-header">
            <div className="distbot-header__info">
              <div className="distbot-header__avatar">
                <Compass size={18} />
              </div>
              <div>
                <div className="distbot-header__title">
                  <span>Pujo Distance AI</span>
                  <span className="distbot-header__status-dot" />
                </div>
                <div className="distbot-header__sub">
                  {userLocation ? '📍 GPS Active (Kolkata)' : 'Kolkata Pandal & Route Guide'}
                </div>
              </div>
            </div>

            <div className="distbot-header__actions">
              <button
                className="distbot-header__btn"
                onClick={handleClearChat}
                title="Reset conversation"
              >
                <RotateCcw size={15} />
              </button>
              {!embedded && (
                <button
                  className="distbot-header__btn"
                  onClick={handleClose}
                  title="Close chat"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>

          {/* GPS Quick Bar */}
          <div className="distbot-gps-bar">
            <button
              className={`distbot-gps-btn ${userLocation ? 'distbot-gps-btn--active' : ''}`}
              onClick={handleGetLocation}
              disabled={locLoading}
            >
              <MapPin size={13} />
              {locLoading
                ? 'Acquiring GPS…'
                : userLocation
                ? 'GPS Location Linked 📍'
                : 'Use My GPS for Accurate Distances'}
            </button>
            {locError && <span className="distbot-gps-err">{locError}</span>}
          </div>

          {/* Messages Stream */}
          <div className="distbot-messages" ref={messagesContainerRef}>
            {messages.map((m) => (
              <div key={m.id} className={`distbot-msg distbot-msg--${m.sender}`}>
                {m.sender === 'user' ? (
                  <div className="distbot-msg__bubble distbot-msg__bubble--user">
                    <p>{m.text}</p>
                    <span className="distbot-msg__time">{m.timestamp}</span>
                  </div>
                ) : (
                  <div className="distbot-msg__card">
                    {/* Gemini Badge */}
                    {m.source === 'gemini' && (
                      <div className="distbot-gemini-badge">
                        <Sparkles size={11} color="#4285f4" />
                        <span>Gemini AI</span>
                      </div>
                    )}

                    {/* Warning if key issues */}
                    {m.warning && (
                      <div className="distbot-msg__warning" style={{ color: '#ffb300', fontSize: '0.74rem', marginBottom: 6 }}>
                        {m.warning}
                      </div>
                    )}

                    {/* Bot Title / Reply */}
                    <div className="distbot-msg__text">
                      {renderFormattedReply(m.reply)}
                    </div>

                    {/* Direct Google Maps Link Button */}
                    {m.gmapsUrl && m.type !== 'bathroom_card' && m.type !== 'distance_card' && (
                      <div style={{ marginTop: 8 }}>
                        <a
                          href={m.gmapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="distbot-action-btn distbot-action-btn--gmaps"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            textDecoration: 'none',
                            background: '#1a73e8',
                            color: '#ffffff',
                            fontWeight: 700,
                            padding: '8px 14px',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            boxShadow: '0 3px 10px rgba(26, 115, 232, 0.3)',
                          }}
                        >
                          <Navigation size={14} />
                          <span>Open in Google Maps</span>
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    )}

                    {/* Details Bullet List */}
                    {m.details && (
                      <div className="distbot-msg__details">
                        {m.details.map((d, i) => (
                          <div key={i} className="distbot-msg__detail-line">
                            {d}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 1. Point-to-Point Distance Card */}
                    {m.type === 'distance_card' && m.metrics && (
                      <div className="distbot-card distbot-card--distance">
                        <div className="distbot-card__endpoints">
                          <div className="distbot-endpoint">
                            <span className="distbot-endpoint__tag distbot-endpoint__tag--start">FROM</span>
                            <span className="distbot-endpoint__name">{m.origin?.name}</span>
                          </div>
                          <div className="distbot-endpoint__arrow">
                            <ArrowRight size={16} />
                          </div>
                          <div className="distbot-endpoint">
                            <span className="distbot-endpoint__tag distbot-endpoint__tag--end">TO</span>
                            <span className="distbot-endpoint__name">{m.destination?.name}</span>
                          </div>
                        </div>

                        {/* Metric Badges */}
                        <div className="distbot-metrics-grid">
                          <div className="distbot-metric-box distbot-metric-box--road">
                            <span className="distbot-metric-label">Road Distance</span>
                            <span className="distbot-metric-val">{m.metrics.roadKm} km</span>
                            <span className="distbot-metric-sub">Straight: {m.metrics.straightKm} km</span>
                          </div>
                          <div className="distbot-metric-box distbot-metric-box--walk">
                            <div className="distbot-metric-icon-row">
                              <Footprints size={14} />
                              <span className="distbot-metric-label">Walking</span>
                            </div>
                            <span className="distbot-metric-val">~{m.metrics.walkingMins} mins</span>
                            <span className="distbot-metric-sub">Pandal walking route</span>
                          </div>
                          <div className="distbot-metric-box distbot-metric-box--drive">
                            <div className="distbot-metric-icon-row">
                              <Car size={14} />
                              <span className="distbot-metric-label">Cab / Auto</span>
                            </div>
                            <span className="distbot-metric-val">~{m.metrics.drivingMins} mins</span>
                            <span className="distbot-metric-sub">Incl. Puja Traffic</span>
                          </div>
                        </div>

                        {/* Crowd Levels */}
                        {(m.destination?.crowdLevel || m.origin?.crowdLevel) && (
                          <div className="distbot-crowd-row">
                            <Flame size={14} color="#ff9900" />
                            <span>Destination Crowd:</span>
                            <span className="distbot-crowd-badge">
                              {m.destination?.crowdLevel || 'Moderate'}
                            </span>
                          </div>
                        )}

                        {/* Google Maps Direct Button */}
                        <a
                          href={m.metrics.gmapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="distbot-gmaps-btn"
                        >
                          <Navigation size={14} />
                          Open Directions in Google Maps
                        </a>
                      </div>
                    )}

                    {/* Washrooms & Toilets Card with direct Google Maps search link */}
                    {m.type === 'bathroom_card' && m.gmapsUrl && (
                      <div className="distbot-card" style={{
                        background: 'rgba(26, 115, 232, 0.08)',
                        border: '1px solid rgba(66, 133, 244, 0.35)',
                        borderRadius: '12px',
                        padding: '12px',
                        marginTop: '8px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '20px' }}>🚻</span>
                          <span style={{ fontWeight: '700', fontSize: '13px', color: '#60a5fa' }}>
                            Public Washrooms & Toilets
                          </span>
                        </div>

                        <a
                          href={m.gmapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="distbot-gmaps-btn"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            background: '#1a73e8',
                            color: '#ffffff',
                            fontWeight: '700',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            marginTop: '8px',
                            boxShadow: '0 4px 12px rgba(26, 115, 232, 0.35)'
                          }}
                        >
                          <Navigation size={15} />
                          Open Washrooms in Google Maps
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    )}

                    {/* 2. Nearby Pandals List Card */}
                    {m.type === 'nearby_list' && m.pandals && (
                      <div className="distbot-card distbot-card--nearby">
                        <div className="distbot-nearby-list">
                          {m.pandals.map((p, idx) => (
                            <div key={p.id || idx} className="distbot-nearby-item">
                              <div className="distbot-nearby-num">{idx + 1}</div>
                              <div className="distbot-nearby-content">
                                <div className="distbot-nearby-name">{p.name}</div>
                                <div className="distbot-nearby-sub">
                                  <span>{p.area || p.region}</span>
                                  {p.nearestMetro && (
                                    <span>· 🚇 {p.nearestMetro}</span>
                                  )}
                                </div>
                              </div>
                              <div className="distbot-nearby-right">
                                <span className="distbot-nearby-km">{p.distanceKm} km</span>
                                <a
                                  href={p.gmapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="distbot-nearby-nav-btn"
                                  title="Navigate"
                                >
                                  <Navigation size={12} />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. Multi-Stop Route Plan Card */}
                    {m.type === 'route_plan' && m.stops && (
                      <div className="distbot-card distbot-card--route">
                        <div className="distbot-route-total">
                          <span>Total Optimized Distance:</span>
                          <strong>{m.totalKm} km</strong>
                        </div>
                        <div className="distbot-route-steps">
                          {m.stops.map((stop, idx) => (
                            <div key={idx} className="distbot-route-step">
                              <div className="distbot-step-bullet">
                                <span>{idx === 0 ? 'S' : idx}</span>
                              </div>
                              <div className="distbot-step-info">
                                <span className="distbot-step-name">{stop.name}</span>
                                {idx > 0 && stop.legDistanceKm && (
                                  <span className="distbot-step-dist">
                                    +{stop.legDistanceKm} km from {stop.fromPrevName || 'previous'}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <span className="distbot-msg__time">{m.timestamp}</span>
                  </div>
                )}
              </div>
            ))}

            {/* Typing Animation */}
            {isTyping && (
              <div className="distbot-typing">
                <div className="distbot-typing__dot" />
                <div className="distbot-typing__dot" />
                <div className="distbot-typing__dot" />
                <span>Computing routes & distances…</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <form className="distbot-input-form" onSubmit={handleSubmit}>
            <input
              type="text"
              className="distbot-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Distance from Sreebhumi to Howrah…"
              aria-label="Query Distance AI"
            />
            <button
              type="submit"
              className="distbot-send-btn"
              disabled={!input.trim()}
              title="Send query"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

