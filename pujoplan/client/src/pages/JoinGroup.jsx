import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getInviteInfo, joinGroup } from '../services/api';
import './JoinGroup.css';

export default function JoinGroup() {
  const { token }  = useParams();
  const { user, login } = useAuth();
  const navigate   = useNavigate();

  const [info,       setInfo]       = useState(null);
  const [infoErr,    setInfoErr]    = useState('');
  const [joining,    setJoining]    = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    getInviteInfo(token)
      .then(r => setInfo(r.data))
      .catch(e => setInfoErr(e.response?.data?.error || 'Invalid or expired invite link.'));
  }, [token]);

  // Auto-join once we know both info and user
  useEffect(() => {
    if (user && info && !joining) doJoin();
  }, [user, info]);

  async function doJoin() {
    setJoining(true);
    setError('');
    try {
      const { data } = await joinGroup(token);
      navigate(`/group/${data.groupId}`, { replace: true });
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to join. Try again.');
      setJoining(false);
    }
  }

  async function handleLogin() {
    setLoginLoading(true);
    setError('');
    try {
      await login();
      // useEffect will fire doJoin
    } catch (e) {
      setError(e.message || 'Sign-in failed.');
    } finally {
      setLoginLoading(false);
    }
  }

  // ── Loading invite info
  if (!info && !infoErr) {
    return (
      <div className="join-page">
        <div className="join-card">
          <div className="spinner" style={{ margin: '40px auto' }} />
        </div>
      </div>
    );
  }

  // ── Invalid invite
  if (infoErr) {
    return (
      <div className="join-page">
        <div className="join-card">
          <span className="join-logo">🪔 PujoPlan</span>
          <div className="join-icon join-icon--err">⚠️</div>
          <h2>Invalid Invite</h2>
          <p className="join-sub">{infoErr}</p>
          <button className="btn btn-yellow btn-full" onClick={() => navigate('/')}>Go Home</button>
        </div>
      </div>
    );
  }

  // ── Joining spinner
  if (joining) {
    return (
      <div className="join-page">
        <div className="join-card">
          <span className="join-logo">🪔 PujoPlan</span>
          <div className="spinner" style={{ margin: '24px auto' }} />
          <p className="join-sub">Joining the group…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="join-page">
      <div className="join-card">
        <span className="join-logo">🪔 PujoPlan</span>

        <div className="join-icon">👥</div>

        <h2 className="join-title">
          Join <span>{info.groupName}</span>
        </h2>
        <p className="join-sub">Invited by {info.adminName}</p>

        <div className="join-info">
          <div className="join-info__row">
            <span>Members</span>
            <strong>{info.memberCount}</strong>
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ width: '100%', textAlign: 'left' }}>{error}</div>}

        {user ? (
          <button className="btn btn-yellow btn-full btn-lg" onClick={doJoin}>
            Join Group →
          </button>
        ) : (
          <>
            <p style={{ fontSize: '.82rem', color: 'var(--gray-light)', textAlign: 'center' }}>
              Sign in with Google to join
            </p>
            <button className="join-google-btn" onClick={handleLogin} disabled={loginLoading}>
              {loginLoading
                ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                : <GoogleIcon />
              }
              {loginLoading ? 'Signing in…' : 'Continue with Google'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
