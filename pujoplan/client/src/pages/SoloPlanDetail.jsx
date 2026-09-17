import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';
import PujaMap from '../components/PujaMap';
import { getSoloPlanById, removeSoloPlanSpot, deleteSoloPlan, generateSoloRoute } from '../services/api';
import { MapPin, Plus, Trash2, Route, ArrowLeft } from 'lucide-react';
import './SoloPlanDetail.css';

const CROWD_CLR = { 'Very High': 'var(--red)', 'High': '#ff9900', 'Moderate': 'var(--gray-light)', 'Low': '#44bbaa' };

export default function SoloPlanDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();

  const [plan,         setPlan]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [routeData,    setRouteData]    = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError,   setRouteError]   = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await getSoloPlanById(id);
      setPlan(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load plan.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleRemove(spotId) {
    if (!window.confirm('Remove this spot?')) return;
    try {
      await removeSoloPlanSpot(id, spotId);
      setPlan(p => ({ ...p, spots: p.spots.filter(s => s.spotId !== spotId) }));
    } catch (e) { alert(e.response?.data?.error || 'Failed.'); }
  }

  async function handleDeletePlan() {
    if (!window.confirm(`Delete "${plan.name}"? This cannot be undone.`)) return;
    try {
      await deleteSoloPlan(id);
      navigate('/solo', { replace: true });
    } catch (e) { alert(e.response?.data?.error || 'Failed to delete plan.'); }
  }

  async function handleRoute() {
    setRouteError('');
    setRouteLoading(true);
    try {
      const { data } = await generateSoloRoute(id, { startLocation: plan.startLocation });
      setRouteData(data);
    } catch (e) {
      setRouteError(e.response?.data?.error || 'Route failed.');
    } finally {
      setRouteLoading(false);
    }
  }

  if (loading) return <AppLayout back onBack={() => navigate('/solo')}><div className="center-flex"><div className="spinner" /></div></AppLayout>;
  if (error)   return (
    <AppLayout back onBack={() => navigate('/solo')}>
      <div className="page-wrap">
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-outline btn-full" style={{ marginTop: 16 }} onClick={() => navigate('/solo')}>Back</button>
      </div>
    </AppLayout>
  );

  return (
    <AppLayout title={plan.name} back onBack={() => navigate('/solo')}>
      <div className="page-wrap spd">
        <button className="back-nav-btn" onClick={() => navigate('/solo')}>
          <ArrowLeft size={16} /> Back to Solo Plans
        </button>

        {/* Plan meta */}
        <div className="spd__meta">
          {plan.visitDate    && <span>{plan.visitDate}</span>}
          {plan.visitDate && plan.startLocation && <span>·</span>}
          {plan.startLocation && <span>From: {plan.startLocation}</span>}
        </div>

        <div className="divider" />

        {/* Spots */}
        <div className="spd__spots-head">
          <span className="section-title" style={{ marginBottom: 0 }}>
            PANDALS ({plan.spots.length})
          </span>
          <button className="btn btn-yellow btn-sm"
            onClick={() => navigate(`/solo/${id}/spots`)}>
            <Plus size={13} /> Add
          </button>
        </div>

        {plan.spots.length === 0 ? (
          <div className="empty-state">
            <MapPin size={28} />
            <p>No pandals yet</p>
            <button className="btn btn-yellow btn-sm"
              onClick={() => navigate(`/solo/${id}/spots`)}>
              Browse Pandals
            </button>
          </div>
        ) : (
          <div className="spd__list">
            {plan.spots.map((ps, i) => {
              const s = ps.spot;
              const cc = CROWD_CLR[s.crowdLevel] || 'var(--gray-light)';
              return (
                <div key={ps.id} className="spd__spot">
                  <div className="spd__spot-num">{i + 1}</div>
                  <div className="spd__spot-info">
                    <span className="spd__spot-name">{s.name}</span>
                    <div className="spd__spot-meta">
                      <span><MapPin size={10} /> {s.area}</span>
                      <span style={{ color: cc }}>● {s.crowdLevel}</span>
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '6px' }}
                    onClick={() => handleRemove(ps.spotId)}>
                    <Trash2 size={13} color="var(--red)" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="divider" />

        <button className="btn btn-outline btn-full"
          style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
          onClick={handleDeletePlan}>
          <Trash2 size={14} /> Delete Plan
        </button>

        {/* Route */}
        <div className="spd__route-head">
          <span className="section-title" style={{ marginBottom: 0 }}>ROUTE</span>
          <button className="btn btn-red btn-sm" onClick={handleRoute}
            disabled={routeLoading || plan.spots.length === 0}>
            {routeLoading
              ? <span className="spinner" style={{ width: 15, height: 15, borderWidth: 2, borderTopColor: '#fff' }} />
              : <Route size={14} />
            }
            {routeLoading ? 'Calculating…' : 'Generate'}
          </button>
        </div>

        {routeError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{routeError}</div>}

        {routeData && (
          <div className="spd__route">
            <div className="gd__route-stats">
              <div className="gd__stat">
                <span>{routeData.totalDistanceKm}<small>km</small></span>
                <label>Distance</label>
              </div>
              <div className="gd__stat">
                <span>{routeData.estimatedDurationMin}<small>min</small></span>
                <label>Duration</label>
              </div>
              <div className="gd__stat">
                <span>{routeData.stops.length}</span>
                <label>Stops</label>
              </div>
            </div>

            <PujaMap routeData={routeData} height={280} />

            <div className="gd__itin">
              <p className="section-title">ITINERARY</p>
              <div className="gd__itin-row gd__itin-start">
                <div className="gd__itin-dot gd__itin-dot--s">S</div>
                <div><strong>START</strong><span>{routeData.start.name}</span></div>
              </div>
              {routeData.stops.map(stop => (
                <div key={stop.order} className="gd__itin-row">
                  <div className="gd__itin-dot">{stop.order}</div>
                  <div>
                    <strong>{stop.spot.name}</strong>
                    <span>{stop.spot.area} · {stop.estimatedArrival}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
