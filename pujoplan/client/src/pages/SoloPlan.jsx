import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';
import { createSoloPlan, getMySoloPlans, deleteSoloPlan } from '../services/api';
import { MapPin, Plus, ChevronRight, X, Trash2, ArrowLeft } from 'lucide-react';
import { PUJA_DATES } from '../config/pujaDates';
import './SoloPlan.css';

export default function SoloPlan() {
  const navigate  = useNavigate();
  const [plans,    setPlans]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ name: '', visitDate: '', startLocation: '' });
  const [creating, setCreating] = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    getMySoloPlans()
      .then(r => setPlans(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Plan name is required.');
    if (!form.visitDate) return setError('Please select a visit date.');
    if (!form.startLocation.trim()) return setError('Starting location is required.');
    setCreating(true);
    try {
      const { data } = await createSoloPlan(form);
      navigate(`/solo/${data.id}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(planId, planName) {
    if (!window.confirm(`Delete "${planName}"? This cannot be undone.`)) return;
    try {
      await deleteSoloPlan(planId);
      setPlans(current => current.filter(plan => plan.id !== planId));
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to delete plan.');
    }
  }

  return (
    <AppLayout title="Solo Plans" back onBack={() => navigate('/dashboard')}>
      <div className="page-wrap sp">
        <button className="back-nav-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>

        <div className="sp__head">
          <h1 className="sp__title">Solo Plans</h1>
          <button className="btn btn-yellow btn-sm" onClick={() => setShowForm(v => !v)}>
            {showForm ? <X size={14} /> : <Plus size={14} />}
            {showForm ? 'Cancel' : 'New Plan'}
          </button>
        </div>

        {showForm && (
          <form className="sp__form" onSubmit={handleCreate}>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-field">
              <label>Plan Name <span style={{ color: 'var(--yellow)' }}>*</span></label>
              <input
                type="text" placeholder="e.g. My Puja Tour 2026"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                maxLength={80} required autoFocus
              />
            </div>

            <div className="sp__form-row">
              <div className="form-field">
                <label>Visit Date <span style={{ color: 'var(--yellow)' }}>*</span></label>
                <select
                  value={form.visitDate}
                  onChange={e => setForm(p => ({ ...p, visitDate: e.target.value }))}
                  required
                >
                  <option value="">Select a Puja day</option>
                  {PUJA_DATES.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Start Location <span style={{ color: 'var(--yellow)' }}>*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Amta, Howrah, Kalighat"
                  value={form.startLocation}
                  onChange={e => setForm(p => ({ ...p, startLocation: e.target.value }))}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-yellow btn-full" disabled={creating}>
              {creating && <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />}
              {creating ? 'Creating…' : 'Create Plan →'}
            </button>
          </form>
        )}

        <div className="divider" />

        {loading ? (
          <div className="center-flex" style={{ minHeight: '35vh' }}><div className="spinner" /></div>
        ) : plans.length === 0 ? (
          <div className="empty-state">
            <MapPin size={30} />
            <p>No solo plans yet</p>
            <div style={{ display: 'flex', gap: 'var(--s2)', justifyContent: 'center', marginTop: 'var(--s2)', flexWrap: 'wrap' }}>
              <button className="btn btn-yellow btn-sm" onClick={() => setShowForm(true)}>
                <Plus size={14} /> Create one
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => navigate('/dashboard')}>
                <ArrowLeft size={14} /> Back to Dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="sp__list">
            {plans.map(p => (
              <div key={p.id} className="plan-card plan-card--yellow"
                onClick={() => navigate(`/solo/${p.id}`)}
                role="button" tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && navigate(`/solo/${p.id}`)}>
                <div className="plan-card__icon"><MapPin size={16} /></div>
                <div className="plan-card__body">
                  <div className="plan-card__row">
                    <span className="plan-card__title">{p.name}</span>
                  </div>
                  <div className="plan-card__meta">
                    <span>{p._count?.spots ?? 0} spots</span>
                    {p.visitDate && <span>· {p.visitDate}</span>}
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '6px' }}
                  onClick={e => { e.stopPropagation(); handleDelete(p.id, p.name); }}
                  aria-label={`Delete ${p.name}`}
                  title="Delete plan"
                >
                  <Trash2 size={14} color="var(--red)" />
                </button>
                <ChevronRight size={16} className="plan-card__arrow" />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
