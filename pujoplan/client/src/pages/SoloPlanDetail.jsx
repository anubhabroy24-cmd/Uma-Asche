import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';
import PujaMap from '../components/PujaMap';
import GmapsBottomSheet from '../components/GmapsBottomSheet';
import DistanceChatbot from '../components/DistanceChatbot';
import { solveNearestNeighbor, calculateLegDistances } from '../utils/routeOptimizer';
import { DEFAULT_PANDALS } from '../data/defaultPandals';
import { getSoloPlanById, removeSoloPlanSpot, deleteSoloPlan, generateSoloRoute } from '../services/api';
import {
  MapPin, Plus, Trash2, Route, ArrowLeft,
  Compass, Navigation,
} from 'lucide-react';
import './SoloPlanDetail.css';

const CROWD_CLR = { 'Very High': 'var(--red)', 'High': '#ff9900', 'Moderate': 'var(--gray-light)', 'Low': '#44bbaa' };

function findMatchingPandal(targetId, targetName) {
  if (!targetId && !targetName) return null;
  const tid = String(targetId || '').toLowerCase().trim();
  const tidNum = tid.replace(/[^0-9]/g, '');
  const tname = String(targetName || '').toLowerCase().trim();

  return DEFAULT_PANDALS.find((p) => {
    const pid = String(p.id || '').toLowerCase().trim();
    const pidNum = pid.replace(/[^0-9]/g, '');
    const pname = String(p.name || '').toLowerCase().trim();

    if (tid && (pid === tid || pid.replace(/[^a-z0-9]/g, '') === tid.replace(/[^a-z0-9]/g, ''))) return true;
    if (tidNum && pidNum && parseInt(tidNum, 10) === parseInt(pidNum, 10)) return true;
    if (tname && tname !== 'pandal spot' && (pname === tname || pname.includes(tname) || tname.includes(pname))) return true;
    return false;
  }) || null;
}

// Known Kolkata landmark coords for fast start-point resolution
const KNOWN_COORDS = {
  'howrah': { lat: 22.5839, lng: 88.3424 },
  'sealdah': { lat: 22.5701, lng: 88.3698 },
  'esplanade': { lat: 22.5645, lng: 88.3533 },
  'central': { lat: 22.5726, lng: 88.3639 },
  'park street': { lat: 22.5518, lng: 88.3524 },
  'salt lake': { lat: 22.5867, lng: 88.4178 },
  'new town': { lat: 22.5862, lng: 88.4789 },
};

function resolveStartCoords(startLoc) {
  if (!startLoc) return { lat: 22.5726, lng: 88.3639 };
  const q = startLoc.toLowerCase().trim();
  for (const [k, v] of Object.entries(KNOWN_COORDS)) {
    if (q.includes(k) || k.includes(q)) return v;
  }
  return { lat: 22.5726, lng: 88.3639 };
}

async function geocodeStart(startLoc) {
  if (!startLoc) return { lat: 22.5726, lng: 88.3639 };
  const quick = resolveStartCoords(startLoc);
  if (quick.lat !== 22.5726 || quick.lng !== 88.3639) return quick;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(startLoc + ', West Bengal, India')}&format=json&limit=1`
    );
    const data = await res.json();
    if (data?.[0]?.lat) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (_) {}
  return quick;
}

export default function SoloPlanDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();

  // ── State ─────────────────────────────────────────
  const [plan,         setPlan]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [activeTab,    setActiveTab]    = useState('plan'); // 'plan' | 'route' | 'ai'
  const [routeData,    setRouteData]    = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError,   setRouteError]   = useState('');
  const [waypoints,    setWaypoints]    = useState([]);
  const [myLocation,   setMyLocation]   = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [visitedStops, setVisitedStops] = useState(new Set());
  const mapRef = useRef(null);

  // Android hardware back key listener: if on ai or route tab, switch back to 'plan' tab
  useEffect(() => {
    const handleAppBack = (e) => {
      if (activeTab !== 'plan') {
        e.preventDefault();
        setActiveTab('plan');
      }
    };
    window.addEventListener('app:back', handleAppBack);
    return () => window.removeEventListener('app:back', handleAppBack);
  }, [activeTab]);

  // ── Auto GPS when mounted or when Route tab opens ──
  const requestGpsLocation = useCallback(() => {
    if (!navigator?.geolocation) return;

    const onPos = (pos) => {
      setMyLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy || 30,
      });
    };

    navigator.geolocation.getCurrentPosition(
      onPos,
      () => {
        navigator.geolocation.getCurrentPosition(onPos, () => {}, {
          enableHighAccuracy: false,
          timeout: 12000,
          maximumAge: 60000,
        });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  useEffect(() => {
    requestGpsLocation();
  }, [requestGpsLocation, activeTab]);

  useEffect(() => {
    if (!navigator?.geolocation) return;
    let watchId = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => setMyLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy || 30 }),
        () => {},
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
      );
    } catch (_) {}
    return () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); };
  }, []);

  // Invalidate map on tab switch
  useEffect(() => {
    if (activeTab === 'route') {
      setTimeout(() => mapRef.current?.invalidateSize(), 150);
    }
  }, [activeTab]);

  // ── Load plan ─────────────────────────────────────
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

  // ── Build nearest-neighbor waypoints from spots ───
  useEffect(() => {
    if (!plan) return;
    let mounted = true;

    async function buildWaypoints() {
      const startCoords = await geocodeStart(plan.startLocation);
      if (!mounted) return;

      const startWp = {
        id: 'start-0',
        name: plan.startLocation ? `${plan.startLocation} (Start)` : 'Start',
        lat: startCoords.lat,
        lng: startCoords.lng,
      };

      const spotWps = (plan.spots || [])
        .map((ps, i) => {
          const targetId = ps.spotId || ps.spot?.id || ps.id;
          const matched = (!ps?.spot || !ps.spot.latitude || !ps.spot.name)
            ? findMatchingPandal(targetId, ps?.spot?.name)
            : null;
          const sp = { ...(matched || {}), ...(ps?.spot || {}) };
          if (!sp.latitude || !sp.longitude) return null;
          return {
            id: ps.id || `spot-${i}`,
            spotId: targetId,
            name: sp.name || `Pandal ${i + 1}`,
            lat: Number(sp.latitude),
            lng: Number(sp.longitude),
          };
        })
        .filter(Boolean);

      if (spotWps.length > 0) {
        setWaypoints(solveNearestNeighbor(startWp, spotWps));
      } else {
        setWaypoints([startWp]);
      }
    }

    buildWaypoints();
    return () => { mounted = false; };
  }, [plan]);

  // ── Handlers ──────────────────────────────────────
  const handleMarkVisited = useCallback((idx) => {
    setVisitedStops(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }, []);

  const handleRouteSummary = useCallback((summary) => {
    setRouteData(prev => {
      if (prev?.totalDistanceKm === summary.totalDistanceKm) return prev;
      return { ...(prev || { start: { name: 'Start' }, stops: [] }), ...summary };
    });
  }, []);

  const handleUpdateWaypoints = (reordered) => setWaypoints(calculateLegDistances(reordered));

  const handleAddWaypoint = (newWp) => {
    setWaypoints(prev => calculateLegDistances([...prev, { ...newWp, id: `wp-${Date.now()}` }]));
  };

  const handleRemoveWaypoint = async (idx, targetWp) => {
    const target = targetWp || waypoints[idx];
    if (!target) return;
    const remaining = waypoints.filter((_, i) => i !== idx);
    setWaypoints(calculateLegDistances(remaining));
    if (target.spotId) {
      try {
        await removeSoloPlanSpot(id, target.spotId);
        setPlan(p => ({ ...p, spots: p.spots.filter(s => s.spotId !== target.spotId) }));
      } catch (_) {}
    }
    setToastMessage(`Removed "${target.name}"`);
  };

  async function handleRemoveFromPlan(spotId) {
    if (!window.confirm('Remove this pandal?')) return;
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

  // ── Render ────────────────────────────────────────
  if (loading) return <AppLayout back onBack={() => navigate('/solo')}><div className="center-flex"><div className="spinner" /></div></AppLayout>;
  if (error) return (
    <AppLayout back onBack={() => navigate('/solo')}>
      <div className="page-wrap">
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-outline btn-full" style={{ marginTop: 16 }} onClick={() => navigate('/solo')}>Back</button>
      </div>
    </AppLayout>
  );

  const isFullChatView = activeTab === 'ai';

  return (
    <AppLayout
      title={plan.name}
      back
      onBack={() => navigate('/solo')}
      noScroll={isFullChatView}
    >
      <div className={`page-wrap spd ${isFullChatView ? 'gd--full-chat' : ''}`}>
        {!isFullChatView && (
          <>
            <button className="back-nav-btn" onClick={() => navigate('/solo')}>
              <ArrowLeft size={16} /> Back to Solo Plans
            </button>

            {/* Meta */}
            <div className="spd__meta">
              {plan.visitDate && <span>{plan.visitDate}</span>}
              {plan.visitDate && plan.startLocation && <span>·</span>}
              {plan.startLocation && <span>From: {plan.startLocation}</span>}
              <span>·</span>
              <span>{plan.spots.length} pandals</span>
            </div>
          </>
        )}

        {/* ── Tabs ── */}
        <div className="gd__tabs">
          <button type="button" className={`gd__tab ${activeTab === 'plan' ? 'gd__tab--active' : ''}`} onClick={() => setActiveTab('plan')}>
            <MapPin size={14} /><span>Plan</span>
          </button>
          <button type="button" className={`gd__tab ${activeTab === 'route' ? 'gd__tab--active' : ''}`} onClick={() => setActiveTab('route')}>
            <Route size={14} /><span>Route</span>
          </button>
          <button type="button" className={`gd__tab ${activeTab === 'ai' ? 'gd__tab--active' : ''}`} onClick={() => setActiveTab('ai')}>
            <Compass size={14} /><span>AI</span>
          </button>
        </div>

        {/* ── 1. Plan Tab ── */}
        {activeTab === 'plan' && (
          <div className="gd__tab-pane">
            <div className="spd__spots-head">
              <span className="section-title" style={{ marginBottom: 0 }}>PANDALS ({plan.spots.length})</span>
              <button className="btn btn-yellow btn-sm" onClick={() => navigate(`/solo/${id}/spots`)}>
                <Plus size={13} /> Add
              </button>
            </div>

            {plan.spots.length === 0 ? (
              <div className="empty-state">
                <MapPin size={28} />
                <p>No pandals yet</p>
                <button className="btn btn-yellow btn-sm" onClick={() => navigate(`/solo/${id}/spots`)}>Browse Pandals</button>
              </div>
            ) : (
              <div className="spd__list">
                {plan.spots.map((ps, i) => {
                  const targetId = ps.spotId || ps.spot?.id || ps.id;
                  const matched = (!ps?.spot || !ps.spot.name) ? findMatchingPandal(targetId, ps?.name) : null;
                  const s = { ...(matched || {}), ...(ps?.spot || {}) };
                  const spotName = s.name || ps?.name || matched?.name || 'Durga Puja Pandal';
                  const spotArea = s.area || ps?.area || matched?.area || 'Kolkata';
                  const crowdLevel = s.crowdLevel || ps?.crowdLevel || matched?.crowdLevel || 'Moderate';
                  const cc = CROWD_CLR[crowdLevel] || 'var(--gray-light)';
                  return (
                    <div key={ps.id} className="spd__spot">
                      <div className="spd__spot-num">{i + 1}</div>
                      <div className="spd__spot-info">
                        <span className="spd__spot-name">{spotName}</span>
                        <div className="spd__spot-meta">
                          <span><MapPin size={10} /> {spotArea}</span>
                          <span style={{ color: cc }}>● {crowdLevel}</span>
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '6px' }}
                        onClick={() => handleRemoveFromPlan(ps.spotId || targetId)}>
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
          </div>
        )}

        {/* ── 2. Route Tab ── */}
        {activeTab === 'route' && (
          <div className="gd__tab-pane">
            <div className="gd__route-head">
              <span className="section-title" style={{ marginBottom: 0 }}>NAVIGATION & ROUTE</span>
              <button className="btn btn-red btn-sm" onClick={handleRoute}
                disabled={routeLoading || waypoints.length < 2}>
                {routeLoading
                  ? <span className="spinner" style={{ width: 15, height: 15, borderWidth: 2, borderTopColor: '#fff' }} />
                  : <Route size={14} />
                }
                {routeLoading ? 'Calculating…' : 'Recalculate'}
              </button>
            </div>

            {/* Map Legend */}
            <div style={{ display: 'flex', gap: 16, margin: '8px 0', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 28, height: 4, background: '#EA4335', borderRadius: 4, flexShrink: 0 }} />
                <span style={{ fontSize: '.72rem', color: 'var(--gray-light)' }}>You → Start point</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 28, height: 4, background: '#4285F4', borderRadius: 4, flexShrink: 0 }} />
                <span style={{ fontSize: '.72rem', color: 'var(--gray-light)' }}>Pandal route (nearest-neighbor)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, background: '#4285F4', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 4px #4285F4', flexShrink: 0 }} />
                <span style={{ fontSize: '.72rem', color: 'var(--gray-light)' }}>Your Location</span>
              </div>
              {!myLocation?.latitude && (
                <button
                  type="button"
                  onClick={requestGpsLocation}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: '#8ab4f8',
                    background: 'rgba(66,133,244,0.12)',
                    border: '1px solid rgba(66,133,244,0.3)',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: '.72rem',
                    cursor: 'pointer',
                  }}
                >
                  <Navigation size={12} />
                  Enable GPS Location
                </button>
              )}
            </div>

            {routeError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{routeError}</div>}

            <div className="gmaps-integrated-wrapper" style={{ position: 'relative', marginTop: 8, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              <PujaMap
                ref={mapRef}
                waypoints={waypoints}
                onWaypointsChange={handleUpdateWaypoints}
                myLocation={myLocation}
                liveMembers={[]}
                centerTarget={null}
                onRouteSummary={handleRouteSummary}
                onError={(msg) => setToastMessage(msg)}
                visitedStops={visitedStops}
                onMarkVisited={handleMarkVisited}
                height={460}
              />
              <GmapsBottomSheet
                routeData={routeData}
                waypoints={waypoints}
                onUpdateWaypoints={handleUpdateWaypoints}
                onAddWaypoint={handleAddWaypoint}
                onRemoveWaypoint={handleRemoveWaypoint}
                onRecenterOnMe={() => mapRef.current?.recenterMe()}
                onFitRoute={() => mapRef.current?.fitRoute()}
                liveMembers={[]}
                toastMessage={toastMessage}
                onCloseToast={() => setToastMessage('')}
                visitedStops={visitedStops}
                onMarkVisited={handleMarkVisited}
              />
            </div>
          </div>
        )}

        {/* ── 3. AI Tab ── */}
        {activeTab === 'ai' && (
          <div className="gd__tab-pane gd__tab-pane--fullscreen">
            <DistanceChatbot
              embedded={true}
              groupSpots={plan?.spots ? plan.spots.map(ps => ps.spot || ps) : []}
              groupName={plan?.name}
              startLocation={plan?.startLocation}
              waypoints={waypoints}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
