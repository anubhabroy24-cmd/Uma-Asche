import React, { useState, useEffect, useRef } from 'react';
import {
  Compass, X, Send, MapPin, Navigation, ArrowRight,
  ExternalLink, RotateCcw, Sparkles, Footprints, Car,
  ChevronDown, Flame
} from 'lucide-react';
import { processDistanceQuery } from '../utils/distanceBotEngine';
import './DistanceChatbot.css';

const INITIAL_MESSAGES = [
  {
    id: 'msg-init',
    sender: 'bot',
    type: 'greeting',
    reply: 'শুভ শারদীয়া! 🙏 Welcome to **Pujo Distance & Route AI**.',
    details: [
      'Ask me distances, travel times, and shortest routes between any Kolkata Durga Puja pandals or stations!',
      '• "How far is Bagbazar from College Square?"',
      '• "Distance from Howrah to Sreebhumi"',
      '• "Pandals near my current GPS location"',
      '• "Shortest route: Maddox Square, Suruchi Sangha & Ekdalia"',
    ],
    suggestions: [
      'Distance: Howrah to Sreebhumi',
      'Bagbazar to College Square',
      'Pandals near my GPS location',
      'Shortest route for 3 pandals',
    ],
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  },
];

export default function DistanceChatbot({ defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState('');
  const messagesEndRef = useRef(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isTyping]);

  // Native Android Hardware / Gesture Back Button handling
  useEffect(() => {
    if (!isOpen) return;

    // Push history state so Android back button closes the bot instead of leaving the app
    window.history.pushState({ modal: 'distbot' }, '');

    const handlePopState = () => {
      setIsOpen(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    if (window.history.state?.modal === 'distbot') {
      window.history.back();
    }
  };

  // Fetch device GPS coordinates
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setLocError('Geolocation not supported on your browser.');
      return;
    }
    setLocLoading(true);
    setLocError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setUserLocation(coords);
        setLocLoading(false);
        // Automatically ask for nearby pandals once GPS is acquired
        sendMessage('Pandals near my current GPS location', coords);
      },
      (err) => {
        setLocLoading(false);
        setLocError('Could not get GPS. Please allow location permissions.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
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
    setIsTyping(true);

    const activeLoc = overrideLoc || userLocation;

    // Simulate smart cognitive processing
    setTimeout(async () => {
      try {
        const responseData = await processDistanceQuery(text, activeLoc);
        const botMsg = {
          id: 'bot-' + Date.now(),
          sender: 'bot',
          ...responseData,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, botMsg]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: 'bot-' + Date.now(),
            sender: 'bot',
            type: 'text',
            reply: 'Sorry, I ran into an error computing distances. Please try another pandal name!',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } finally {
        setIsTyping(false);
      }
    }, 450);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage();
  };

  const handleClearChat = () => {
    setMessages(INITIAL_MESSAGES);
  };

  return (
    <div className="distbot-root">
      {/* Floating Trigger Button */}
      {!isOpen && (
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
      {isOpen && (
        <div className="distbot-window" role="dialog" aria-label="Pujo Distance Assistant">
          {/* Mobile Bottom Sheet Drag Handle */}
          <div className="distbot-mobile-handle-bar">
            <div className="distbot-mobile-handle" />
          </div>

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
              <button
                className="distbot-header__btn"
                onClick={handleClose}
                title="Close chat"
              >
                <X size={18} />
              </button>
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
          <div className="distbot-messages">
            {messages.map((m) => (
              <div key={m.id} className={`distbot-msg distbot-msg--${m.sender}`}>
                {m.sender === 'user' ? (
                  <div className="distbot-msg__bubble distbot-msg__bubble--user">
                    <p>{m.text}</p>
                    <span className="distbot-msg__time">{m.timestamp}</span>
                  </div>
                ) : (
                  <div className="distbot-msg__card">
                    {/* Bot Title / Reply */}
                    <div className="distbot-msg__text">
                      <p>{m.reply}</p>
                    </div>

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
                          <ExternalLink size={12} />
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

                    {/* Suggestions Chips */}
                    {m.suggestions && m.suggestions.length > 0 && (
                      <div className="distbot-suggestions">
                        <span className="distbot-sugg-title">
                          <Sparkles size={12} /> Suggested queries:
                        </span>
                        <div className="distbot-chips">
                          {m.suggestions.map((sugg, i) => (
                            <button
                              key={i}
                              className="distbot-chip"
                              onClick={() => {
                                if (sugg === '📍 Use My Location') {
                                  handleGetLocation();
                                } else {
                                  sendMessage(sugg);
                                }
                              }}
                            >
                              {sugg}
                            </button>
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
