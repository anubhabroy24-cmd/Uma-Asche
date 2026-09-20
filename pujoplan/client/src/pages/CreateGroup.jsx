import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';
import { createGroup } from '../services/api';
import { PUJA_DATES } from '../config/pujaDates';
import './CreateGroup.css';

export default function CreateGroup() {
  const navigate = useNavigate();
  const [form,    setForm]    = useState({ name: '', visitDate: '', startLocation: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Group name is required.');
    if (!form.visitDate) return setError('Please select a visit date.');
    if (!form.startLocation.trim()) return setError('Starting location is required.');
    setLoading(true);
    try {
      const { data } = await createGroup(form);
      if (data && data.id) {
        navigate(`/group/${data.id}`, { replace: true });
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create group.');
      setLoading(false);
    }
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
