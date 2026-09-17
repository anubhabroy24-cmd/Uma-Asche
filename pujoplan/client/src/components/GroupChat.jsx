import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getGroupMessages, sendGroupMessage } from '../services/api';
import { Send, MessageSquare, AlertCircle } from 'lucide-react';
import './GroupChat.css';

function formatMessageTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function GroupChat({ groupId, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const isInitialLoadRef = useRef(true);

  const fetchMessages = useCallback(async () => {
    try {
      const { data } = await getGroupMessages(groupId);
      setMessages(data);
      setError('');
    } catch (e) {
      if (isInitialLoadRef.current) {
        setError(e.response?.data?.error || 'Failed to load group chat.');
      }
    } finally {
      if (isInitialLoadRef.current) {
        setLoading(false);
        isInitialLoadRef.current = false;
      }
    }
  }, [groupId]);

  // Initial fetch and 3-second polling
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    setInputText('');

    // Optimistic message append
    const tempId = 'temp-' + Date.now();
    const optimisticMsg = {
      id: tempId,
      text,
      createdAt: new Date().toISOString(),
      user: {
        id: currentUser?.id,
        name: currentUser?.name || 'You',
        profileImage: currentUser?.profileImage,
      },
    };

    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const { data: realMsg } = await sendGroupMessage(groupId, text);
      setMessages(prev => prev.map(m => (m.id === tempId ? realMsg : m)));
    } catch (err) {
      // Revert if error
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setInputText(text); // restore text so user doesn't lose it
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
            <h4>Group Discussion</h4>
            <p>Coordinate pandal visits, snacks, and meeting points with your squad! 🪔</p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.user?.id === currentUser?.id;
            return (
              <div
                key={msg.id}
                className={`gc__bubble-row ${isMe ? 'gc__bubble-row--me' : 'gc__bubble-row--other'}`}
              >
                {!isMe && (
                  <div className="gc__avatar-wrap">
                    {msg.user?.profileImage ? (
                      <img
                        src={msg.user.profileImage}
                        alt=""
                        className="gc__avatar"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="gc__avatar gc__avatar--ph">
                        {msg.user?.name?.[0] || 'U'}
                      </div>
                    )}
                  </div>
                )}

                <div className={`gc__bubble ${isMe ? 'gc__bubble--me' : 'gc__bubble--other'}`}>
                  {!isMe && <span className="gc__sender-name">{msg.user?.name}</span>}
                  <div className="gc__text">{msg.text}</div>
                  <span className="gc__time">{formatMessageTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Box */}
      <form className="gc__input-bar" onSubmit={handleSend}>
        <input
          type="text"
          className="gc__input"
          placeholder="Message your group…"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={1000}
          autoComplete="off"
        />
        <button
          type="submit"
          className="gc__send-btn"
          disabled={!inputText.trim() || sending}
          aria-label="Send message"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
