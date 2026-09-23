import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut } from 'lucide-react';
import './AppLayout.css';

export default function AppLayout({ children, title, back, onBack, theme = '', noScroll = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showSignOut, setShowSignOut] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className={`app-shell ${theme ? `app-shell--${theme}` : ''} ${noScroll ? 'app-shell--no-scroll' : ''}`}>
      <div className="app-shell__bg-art" aria-hidden="true" />
      {/* ── Top header ── */}
      <header className="app-header">
        <div className="app-header__left">
          {back ? (
            <button className="app-header__back" onClick={onBack || (() => navigate(-1))} aria-label="Go back">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
            </button>
          ) : (
            <Link to="/dashboard" className="app-header__logo">🪔 PujoPlan</Link>
          )}
        </div>

        <div className="app-header__center">
          {title && <span className="app-header__title">{title}</span>}
        </div>

        <div className="app-header__right">
          {user?.profileImage ? (
            <img
              src={user.profileImage}
              alt={user.name}
              className="app-header__avatar"
              referrerPolicy="no-referrer"
              onClick={() => setShowSignOut(true)}
              title="Tap to sign out"
            />
          ) : (
            <button className="app-header__logout" onClick={() => setShowSignOut(true)} title="Sign out">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="app-main">
        {children}
      </main>

      {showSignOut && (
        <div className="signout-modal" role="dialog" aria-modal="true" aria-labelledby="signout-title">
          <div className="signout-modal__card">
            <h2 id="signout-title">Sign out?</h2>
            <p>Are you sure you want to sign out?</p>
            <div className="signout-modal__actions">
              <button className="btn btn-ghost" onClick={() => setShowSignOut(false)}>No</button>
              <button className="btn btn-red" onClick={handleLogout}>Yes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
