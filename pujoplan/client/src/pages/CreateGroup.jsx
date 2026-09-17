import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';
import { createGroup } from '../services/api';
import { Copy, Check, Share2 } from 'lucide-react';
import { PUJA_DATES } from '../config/pujaDates';
import './CreateGroup.css';

export default function CreateGroup() {
  const navigate = useNavigate();
  const [form,    setForm]    = useState({ name: '', visitDate: '', startLocation: '' });
  const [group,   setGroup]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [copied,  setCopied]  = useState(false);

  const inviteUrl = group ? `${window.location.origin}/join/${group.inviteToken}` : '';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Group name is required.');
    if (!form.visitDate) return setError('Please select a visit date.');
    if (!form.startLocation.trim()) return setError('Starting location is required.');
    setLoading(true);
    try {
      const { data } = await createGroup(form);
      setGroup(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create group.');
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function shareLink() {
    if (navigator.share) {
      navigator.share({
        title: `Join ${group.name} on PujoPlan`,
        text: `Plan Durga Puja 2026 together!`,
        url: inviteUrl,
      }).catch(() => {});
    } else {
      copyLink();
    }
  }

  /* ── Success screen ── */
  if (group) {
    return (
      <AppLayout title="Group Created" back onBack={() => navigate('/dashboard')}>
        <div className="page-wrap cg-success">
          <div className="cg-success__emoji">🎉</div>
          <h2 className="cg-success__name">{group.name}</h2>

          <div className="cg-invite">
            <p className="section-title">INVITE LINK</p>
            <div className="cg-invite__box">
              <span className="cg-invite__url">{inviteUrl}</span>
            </div>
            <div className="cg-invite__btns">
              <button className="btn btn-yellow btn-full" onClick={copyLink}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <button className="btn btn-outline" onClick={shareLink} style={{ flex: '0 0 auto' }}>
                <Share2 size={16} />
              </button>
            </div>
          </div>

          <div className="cg-success__actions">
            <button className="btn btn-yellow btn-full" onClick={() => navigate(`/group/${group.id}`)}>
              Open Group Dashboard
            </button>
            <button className="btn btn-ghost btn-full" onClick={() => navigate('/dashboard')}>
              Back to Home
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  /* ── Create form ── */
  return (
    <AppLayout title="Create Group" back>
      <div className="page-wrap">
        <form className="cg-form" onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-field">
            <label htmlFor="gname">Group Name <span style={{ color: 'var(--yellow)' }}>*</span></label>
            <input
              id="gname" type="text"
              placeholder="e.g. Friends 2026, Family Puja"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              maxLength={80} required autoFocus
            />
          </div>

          <div className="form-field">
            <label htmlFor="vdate">Visit Date <span style={{ color: 'var(--yellow)' }}>*</span></label>
            <select
              id="vdate"
              value={form.visitDate}
              onChange={e => setForm(p => ({ ...p, visitDate: e.target.value }))}
              required
            >
              <option value="">Select a Puja day</option>
              {PUJA_DATES.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="start">Starting Location <span style={{ color: 'var(--yellow)' }}>*</span></label>
            <input
              id="start" type="text"
              placeholder="e.g. Amta, Howrah Station, Kalighat"
              value={form.startLocation}
              onChange={e => setForm(p => ({ ...p, startLocation: e.target.value }))}
              required
            />
          </div>

          <button type="submit" className="btn btn-yellow btn-full btn-lg" disabled={loading}>
            {loading && <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />}
            {loading ? 'Creating…' : 'Create Group →'}
          </button>
        </form>
      </div>
    </AppLayout>
  );
}
