import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';
import { ArrowRight, KeyRound } from 'lucide-react';
import './JoinByCode.css';

export default function JoinByCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    const value = code.trim();
    if (value) navigate(`/join/${encodeURIComponent(value)}`);
  }

  return (
    <AppLayout title="Join Group" back theme="light">
      <div className="page-wrap join-code">
        <div className="join-code__icon"><KeyRound size={24} /></div>
        <h1>Join with code</h1>
        <p>Enter the invite code shared by your group admin.</p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="invite-code">Invite code</label>
          <input
            id="invite-code"
            value={code}
            onChange={event => setCode(event.target.value)}
            placeholder="Paste invite code"
            autoComplete="off"
            autoFocus
          />
          <button className="btn btn-yellow btn-full" type="submit" disabled={!code.trim()}>
            Continue <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </AppLayout>
  );
}