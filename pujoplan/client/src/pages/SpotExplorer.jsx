import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';
import {
  getSpots, addGroupSpot, removeGroupSpot,
  addSoloPlanSpot, removeSoloPlanSpot,
} from '../services/api';
import { Search, MapPin, Plus, Check, X, SlidersHorizontal } from 'lucide-react';
import './SpotExplorer.css';

const CATEGORIES  = ['All', 'Community Puja', 'Heritage', 'Theme', 'Traditional', 'Cultural'];
const CROWD_LEVELS= ['All', 'Very High', 'High', 'Moderate', 'Low'];
const CROWD_CLR   = { 'Very High': 'var(--red)', 'High': '#ff9900', 'Moderate': 'var(--gray-light)', 'Low': '#44bbaa' };

export default function SpotExplorer({ mode }) {
  const { id }        = useParams();
  const navigate      = useNavigate();

  const [spots,     setSpots]     = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(false);
  const [addedIds,  setAddedIds]  = useState(new Set());
  const [addingId,  setAddingId]  = useState(null);
  const [errMap,    setErrMap]    = useState({});
  const [search,    setSearch]    = useState('');
  const [category,  setCategory]  = useState('All');
  const [crowd,     setCrowd]     = useState('All');
  const [showFilters, setFilters] = useState(false);

  const debRef = useRef(null);

  const fetchSpots = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = { page: pg, limit: 500 };
      if (search.trim())      params.search     = search.trim();
      if (category !== 'All') params.category   = category;
      if (crowd !== 'All')    params.crowdLevel = crowd;

      const { data } = await getSpots(params);
      const spotList = Array.isArray(data) ? data : (Array.isArray(data?.spots) ? data.spots : []);
      const totalCount = typeof data?.total === 'number' ? data.total : spotList.length;
      setSpots(pg === 1 ? spotList : prev => [...prev, ...spotList]);
      setTotal(totalCount);
      setPage(pg);
    } catch (_) {}
    finally { setLoading(false); }
  }, [search, category, crowd]);

  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => fetchSpots(1), 320);
    return () => clearTimeout(debRef.current);
  }, [fetchSpots]);

  async function handleToggle(spot) {
    const spotId = typeof spot === 'object' && spot ? spot.id : spot;
    const spotObj = typeof spot === 'object' && spot ? spot : spots.find(s => s.id === spotId);
    if (!spotId || addingId === spotId) return;
    setAddingId(spotId);
    try {
      if (addedIds.has(spotId)) {
        if (mode === 'group') await removeGroupSpot(id, spotId);
        else                  await removeSoloPlanSpot(id, spotId);
        setAddedIds(prev => {
          const next = new Set(prev);
          next.delete(spotId);
          return next;
        });
      } else {
        if (mode === 'group') await addGroupSpot(id, spotId, spotObj);
        else                  await addSoloPlanSpot(id, spotId, spotObj);
        setAddedIds(prev => new Set([...prev, spotId]));
      }
    } catch (e) {
      const msg = e.response?.data?.error || 'Failed';
      setErrMap(p => ({ ...p, [spotId]: msg }));
      setTimeout(() => setErrMap(p => { const n = { ...p }; delete n[spotId]; return n; }), 3000);
    } finally {
      setAddingId(null);
    }
  }

  const activeFilters = [category, crowd].filter(f => f !== 'All');

  return (
    <AppLayout title="Browse Pandals" back>
      <div className="se">
        {/* Search bar — sticky */}
        <div className="se__search-bar">
          <div className="se__search-wrap">
            <Search size={15} className="se__icon" />
            <input
              className="se__input"
              placeholder="Search pandal, area, metro…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="se__clear" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>
          <button
            className={`btn btn-sm ${showFilters ? 'btn-yellow' : 'btn-outline'}`}
            style={{ flexShrink: 0 }}
            onClick={() => setFilters(v => !v)}
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="se__filters">
            <FilterChips label="Category" items={CATEGORIES}   active={category} onChange={v => { setCategory(v); fetchSpots(1); }} />
            <FilterChips label="Crowd"    items={CROWD_LEVELS} active={crowd}    onChange={v => { setCrowd(v);    fetchSpots(1); }} />
          </div>
        )}

        {/* Active filter tags + count */}
        {(activeFilters.length > 0 || total > 0) && (
          <div className="se__meta">
            {activeFilters.map(f => (
              <span key={f} className="badge badge-yellow" style={{ fontSize: '.65rem' }}>{f}</span>
            ))}
            {total > 0 && <span className="se__count">{total} pandals</span>}
          </div>
        )}

        {/* Spot list */}
        <div className="se__list">
          {loading && spots.length === 0
            ? <div className="center-flex" style={{ minHeight: '40vh' }}><div className="spinner" /></div>
            : spots.length === 0
              ? <div className="empty-state"><MapPin size={28} /><p>No pandals found</p></div>
              : spots.map(spot => (
                  <SpotCard
                    key={spot.id}
                    spot={spot}
                    added={addedIds.has(spot.id)}
                    adding={addingId === spot.id}
                    error={errMap[spot.id]}
                    onToggle={handleToggle}
                  />
                ))
          }
        </div>

      </div>
    </AppLayout>
  );
}

function FilterChips({ label, items, active, onChange }) {
  return (
    <div className="se__filter-row">
      <span className="se__filter-label">{label}</span>
      <div className="se__chips">
        {items.map(v => (
          <button
            key={v}
            className={`se__chip ${active === v ? 'se__chip--on' : ''}`}
            onClick={() => onChange(v)}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function SpotCard({ spot, added, adding, error, onToggle }) {
  const cc = CROWD_CLR[spot.crowdLevel] || 'var(--gray-light)';
  return (
    <div className="se__spot">
      <div className="se__spot-body">
        <span className="se__spot-name">{spot.name}</span>
        <div className="se__spot-meta">
          <span><MapPin size={10} /> {spot.area}</span>
          <span style={{ color: cc }}>● {spot.crowdLevel}</span>
          {spot.nearestMetro && <span>🚇 {spot.nearestMetro}</span>}
        </div>
        <span className="badge badge-gray" style={{ fontSize: '.62rem', marginTop: 2 }}>{spot.category}</span>
      </div>

      <div className="se__spot-add">
        {error ? (
          <span style={{ fontSize: '.7rem', color: 'var(--red)' }}>Failed</span>
        ) : added ? (
          <button
            className="se__added"
            onClick={() => onToggle(spot)}
            title="Remove from plan"
            aria-label={`Remove ${spot.name} from plan`}
          >
            <Check size={13} />
          </button>
        ) : (
          <button
            className="btn btn-yellow btn-sm"
            style={{ padding: '7px 12px' }}
            onClick={() => onToggle(spot)}
            disabled={adding}
          >
            {adding
              ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
              : <Plus size={14} />
            }
          </button>
        )}
      </div>
    </div>
  );
}
