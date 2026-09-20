import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Navigation, Crosshair, MapPin, EyeOff, Search, GripHorizontal,
  ChevronUp, ChevronDown, Trash2, ArrowUpDown, Maximize2, Users, AlertCircle, X, Zap,
} from 'lucide-react';
import { calculateLegDistances } from '../utils/routeOptimizer';
import './GmapsBottomSheet.css';

// Popular Durga Puja pandal locations in Kolkata for instant Nominatim search chips
const NOMINATIM_CHIPS = [
  { name: 'Bagbazar Sarbojanin', query: 'Bagbazar Sarbojanin Kolkata', lat: 22.6033, lng: 88.3685 },
  { name: 'College Square', query: 'College Square Kolkata', lat: 22.5746, lng: 88.3639 },
  { name: 'Maddox Square', query: 'Maddox Square Kolkata', lat: 22.5292, lng: 88.3592 },
  { name: 'Ekdalia Evergreen', query: 'Ekdalia Evergreen Kolkata', lat: 22.5186, lng: 88.3681 },
  { name: 'Park Street', query: 'Park Street Kolkata', lat: 22.5518, lng: 88.3524 },
  { name: 'Deshapriya Park', query: 'Deshapriya Park Kolkata', lat: 22.5195, lng: 88.3562 },
  { name: 'Salt Lake FD Block', query: 'FD Block Salt Lake Kolkata', lat: 22.5867, lng: 88.4178 },
  { name: 'Mohammad Ali Park', query: 'Mohammad Ali Park Kolkata', lat: 22.5815, lng: 88.3601 },
];

function formatTimeAgo(dateStr) {
  if (!dateStr) return 'Inactive';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  if (diffSec < 15) return 'Active now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

export default function GmapsBottomSheet({
  routeData,
  waypoints = [],
  onUpdateWaypoints,
  onAddWaypoint,
  onRemoveWaypoint,
  onOptimizeNearestNeighbor,
  startFromMe = false,
  onToggleStartOrigin,
  isSharing = false,
  onToggleSharing,
  sharingLoading = false,
  onRecenterOnMe,
  onFitRoute,
  liveMembers = [],
  currentUserId,
  onFocusMember,
  toastMessage = '',
  onCloseToast,
  visitedStops = new Set(),
  onMarkVisited,
}) {
  // Snap point states: 'peek' (~100px) | 'half' (~45vh) | 'full' (~85vh)
  const [snap, setSnap] = useState('half');
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [draggedStopIdx, setDraggedStopIdx] = useState(null);

  const sheetRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Height definitions based on snap points
  const snapHeights = {
    peek: 110,
    half: Math.round(window.innerHeight * 0.44),
    full: Math.round(window.innerHeight * 0.84),
  };

  // ── Drag Sheet Handlers ───────────────────────────
  const handleDragStart = useCallback((clientY) => {
    setIsDragging(true);
    setStartY(clientY);
    setCurrentY(clientY);
  }, []);

  const handleDragMove = useCallback((clientY) => {
    if (!isDragging) return;
    setCurrentY(clientY);
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    const deltaY = currentY - startY;

    // Determine target snap based on drag direction and threshold
    if (deltaY < -60) {
      if (snap === 'peek') setSnap('half');
      else if (snap === 'half') setSnap('full');
    } else if (deltaY > 60) {
      if (snap === 'full') setSnap('half');
      else if (snap === 'half') setSnap('peek');
    }
  }, [isDragging, currentY, startY, snap]);

  // Touch event listeners
  const onTouchStart = (e) => handleDragStart(e.touches[0].clientY);
  const onTouchMove = (e) => handleDragMove(e.touches[0].clientY);
  const onTouchEnd = () => handleDragEnd();

  // Mouse event listeners for desktop preview
  const onMouseDown = (e) => {
    handleDragStart(e.clientY);
    const onMouseMove = (ev) => handleDragMove(ev.clientY);
    const onMouseUp = () => {
      handleDragEnd();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // ── Debounced Nominatim Geocoding Search ──────────
  const searchNominatim = useCallback(async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    try {
      const qClean = query.trim();
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        qClean + ', West Bengal, India'
      )}&limit=5`;
      const response = await fetch(url, {
        headers: { 'Accept-Language': 'en' },
      });
      if (!response.ok) throw new Error('Nominatim request failed');
      const data = await response.json();
      setSearchResults(
        data.map((item) => ({
          name: item.display_name.split(',')[0],
          fullName: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
        }))
      );
    } catch (err) {
      // Graceful error handling: toast or silent fallback
      console.warn('Nominatim search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      searchNominatim(val);
    }, 450); // 450ms debounce
  };

  const handleSelectSearchResult = (item) => {
    onAddWaypoint({ name: item.name, lat: item.lat, lng: item.lng });
    setSearchQuery('');
    setSearchResults([]);
    setSnap('half');
  };

  // ── Drag to Reorder Waypoints with Live Distance Calculation ───────
  const handleDragOverStop = (e, index) => {
    e.preventDefault();
    if (draggedStopIdx === null || draggedStopIdx === index) return;
    const reordered = [...waypoints];
    const [movedItem] = reordered.splice(draggedStopIdx, 1);
    reordered.splice(index, 0, movedItem);
    setDraggedStopIdx(index);
    const withDistances = calculateLegDistances(reordered);
    onUpdateWaypoints(withDistances);
  };

  const activeSharingMembers = liveMembers.filter(
    (m) => m.isSharingLocation && m.latitude && m.longitude
  );

  return (
    <>
      {/* Toast Notification (Non-blocking on OSRM/Nominatim timeout) */}
      {toastMessage && (
        <div className="gmaps-toast-alert" role="alert">
          <AlertCircle size={16} className="gmaps-toast-icon" />
          <span className="gmaps-toast-text">{toastMessage}</span>
          <button
            type="button"
            className="gmaps-toast-close"
            onClick={onCloseToast}
            aria-label="Close notification"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Horizontally Scrollable Nominatim Suggestion Chips Bar */}
      <div className="gmaps-chips-container">
        <div className="gmaps-chips-track">
          {NOMINATIM_CHIPS.map((chip) => (
            <button
              key={chip.name}
              type="button"
              className="gmaps-nav-chip"
              onClick={() => onAddWaypoint({ name: chip.name, lat: chip.lat, lng: chip.lng })}
            >
              <MapPin size={12} color="#8ab4f8" />
              <span>{chip.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Draggable Bottom Sheet */}
      <div
        ref={sheetRef}
        className={`gmaps-bottom-sheet gmaps-bottom-sheet--${snap} ${
          isDragging ? 'gmaps-bottom-sheet--dragging' : ''
        }`}
        style={{ height: `${snapHeights[snap]}px` }}
      >
        {/* Drag Handle Bar */}
        <div
          className="gmaps-sheet-drag-handle-area"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
        >
          <div className="gmaps-sheet-pill-handle"></div>
        </div>

        {/* Peek / Header Content */}
        <div className="gmaps-sheet-peek-row">
          <div className="gmaps-sheet-eta-main">
            {routeData ? (
              <>
                <span className="gmaps-eta-value">{routeData.estimatedDurationMin}</span>
                <span className="gmaps-eta-unit">min</span>
                <span className="gmaps-eta-dist">({routeData.totalDistanceKm} km)</span>
              </>
            ) : (
              <span className="gmaps-eta-calculating">Planning route…</span>
            )}
          </div>

          <div className="gmaps-sheet-quick-actions">
            <button
              type="button"
              className="gmaps-quick-btn"
              onClick={onRecenterOnMe}
              title="Recenter on me"
              aria-label="Recenter on me"
            >
              <Crosshair size={16} color="#8ab4f8" />
            </button>
            <button
              type="button"
              className="gmaps-quick-btn"
              onClick={onFitRoute}
              title="Fit entire route"
              aria-label="Fit entire route"
            >
              <Maximize2 size={15} color="#bdc1c6" />
            </button>
            <button
              type="button"
              className="gmaps-quick-btn gmaps-quick-btn--chevron"
              onClick={() => setSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek')}
              aria-label="Toggle sheet height"
            >
              {snap === 'full' ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
          </div>
        </div>

        {/* Sheet Body (Visible in 'half' and 'full' states) */}
        <div className="gmaps-sheet-scrollable-body">
          {/* Real-Time Location Sharing Card */}
          <div className="gmaps-sharing-control-card">
            <div className="gmaps-sharing-left">
              <div className={`gmaps-sharing-indicator ${isSharing ? 'gmaps-sharing-indicator--active' : ''}`}>
                <Navigation size={18} className="gmaps-nav-icon" />
              </div>
              <div className="gmaps-sharing-meta">
                <div className="gmaps-sharing-title-row">
                  <span className="gmaps-sharing-title">Location sharing</span>
                  <span className={`gmaps-live-pill ${isSharing ? 'gmaps-live-pill--on' : ''}`}>
                    {isSharing ? '● SHARING' : 'OFF'}
                  </span>
                </div>
                <span className="gmaps-sharing-sub">
                  {isSharing
                    ? 'Updating live GPS via watchPosition (every 5s)'
                    : 'Share real-time GPS with group members'}
                </span>
              </div>
            </div>

            <button
              type="button"
              className={`gmaps-share-toggle-btn ${isSharing ? 'gmaps-share-toggle-btn--stop' : 'gmaps-share-toggle-btn--start'}`}
              onClick={onToggleSharing}
              disabled={sharingLoading}
            >
              {sharingLoading ? (
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              ) : isSharing ? (
                <>
                  <EyeOff size={15} />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <Navigation size={15} />
                  <span>Share</span>
                </>
              )}
            </button>
          </div>



          {/* Waypoints & Stop Reordering Section with Nearest-Neighbor Order & Live Distances */}
          <div className="gmaps-stops-section">
            <div className="gmaps-stops-header">
              <div className="gmaps-stops-header-title-area">
                <span className="gmaps-section-heading">
                  COMPUTED ORDER (NEAREST-NEIGHBOR)
                </span>
                <span className="gmaps-stops-count-tag">
                  {Math.max(0, waypoints.length - 1)} pandals
                  {visitedStops.size > 0 && (
                    <span className="gmaps-visited-count-tag"> · {visitedStops.size} visited</span>
                  )}
                </span>
              </div>

            </div>

            {/* Live Distance Summary Strip */}
            {waypoints.length > 1 && (
              <div className="gmaps-stops-summary-strip">
                <div className="gmaps-summary-strip-left">
                  <span className="gmaps-summary-dot"></span>
                  <span className="gmaps-summary-text">
                    Start: <strong>{waypoints[0]?.name?.split('(')[0]?.trim()}</strong>
                  </span>
                  {onToggleStartOrigin && (
                    <button
                      type="button"
                      className={`gmaps-origin-toggle-btn ${startFromMe ? 'gmaps-origin-toggle-btn--gps' : ''}`}
                      onClick={onToggleStartOrigin}
                      title={startFromMe ? "Switch to Group Plan's designated starting point" : "Switch to My Live GPS as Starting point"}
                    >
                      {startFromMe ? "📍 Plan Start" : "📱 My GPS"}
                    </button>
                  )}
                </div>
                <div className="gmaps-summary-strip-right">
                  <span className="gmaps-summary-dist">
                    ∑ Straight-line: <strong>{Number(waypoints[waypoints.length - 1]?.cumulativeDistanceKm || 0).toFixed(1)} km</strong>
                  </span>
                </div>
              </div>
            )}

            {/* Numbered List of Stops */}
            <div className="gmaps-stops-list">
              {waypoints.map((wp, index) => {
                const isStart = index === 0;
                const isVisited = !isStart && visitedStops.has(index);
                return (
                  <div
                    key={wp.id || `${wp.lat}-${wp.lng}-${index}`}
                    className={`gmaps-stop-row ${
                      draggedStopIdx === index ? 'gmaps-stop-row--dragging' : ''
                    } ${isStart ? 'gmaps-stop-row--start' : ''} ${isVisited ? 'gmaps-stop-row--visited' : ''}`}
                    draggable
                    onDragStart={() => setDraggedStopIdx(index)}
                    onDragOver={(e) => handleDragOverStop(e, index)}
                    onDragEnd={() => setDraggedStopIdx(null)}
                  >
                    <div className="gmaps-stop-drag-grip" title="Drag to reorder stop">
                      <GripHorizontal size={16} />
                    </div>

                    <div className={`gmaps-stop-badge ${isStart ? 'gmaps-stop-badge--start' : ''} ${isVisited ? 'gmaps-stop-badge--visited' : ''}`}>
                      {isVisited ? '✓' : isStart ? 'S' : index}
                    </div>

                    <div className="gmaps-stop-info">
                      <div className="gmaps-stop-title-row">
                        {!isStart && (
                          <span className="gmaps-stop-order-num" style={{ color: isVisited ? '#34a853' : undefined }}>{index}.</span>
                        )}
                        <span className={`gmaps-stop-name ${isVisited ? 'gmaps-stop-name--visited' : ''}`}>
                          {wp.name || `Pandal ${index}`}
                        </span>
                      </div>

                      <div className="gmaps-stop-meta-row">
                        <span className="gmaps-stop-sub">
                          {isStart ? 'Starting Location' : isVisited ? '✅ Visited' : `Stop #${index}`}
                        </span>
                        {!isStart && wp.legDistanceKm !== undefined && (
                          <span className="gmaps-leg-dist-badge">
                            +{wp.legDistanceKm} km from {index === 1 ? 'Start' : `Stop ${index - 1}`}
                          </span>
                        )}
                        {!isStart && wp.cumulativeDistanceKm !== undefined && (
                          <span className="gmaps-cumul-dist-badge">
                            (Cumul: {wp.cumulativeDistanceKm} km)
                          </span>
                        )}
                      </div>
                    </div>

                    {!isStart && onMarkVisited && (
                      <button
                        type="button"
                        className={`gmaps-visited-toggle-btn ${isVisited ? 'gmaps-visited-toggle-btn--done' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkVisited(index);
                        }}
                        title={isVisited ? 'Unmark as visited' : 'Mark as visited'}
                        aria-label={isVisited ? `Unmark stop ${index}` : `Mark stop ${index} as visited`}
                      >
                        {isVisited ? '↩' : '✓'}
                      </button>
                    )}

                    {!isStart && (
                      <button
                        type="button"
                        className="gmaps-stop-remove-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveWaypoint(index, wp);
                        }}
                        title={`Remove ${wp.name || 'Stop'}`}
                        aria-label={`Remove ${wp.name || 'Stop'}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group Members Live Location Sharing List */}
          <div className="gmaps-members-section">
            <div className="gmaps-members-header">
              <Users size={14} color="#8ab4f8" />
              <span className="gmaps-section-heading">
                GROUP MEMBERS SHARING LIVE ({activeSharingMembers.length})
              </span>
            </div>

            {activeSharingMembers.length > 0 ? (
              <div className="gmaps-members-cards-list">
                {activeSharingMembers.map((m) => {
                  const isMe = m.userId === currentUserId;
                  const initial = m.name?.[0]?.toUpperCase() || 'U';
                  return (
                    <div key={m.userId} className={`gmaps-member-card ${isMe ? 'gmaps-member-card--me' : ''}`}>
                      <div className="gmaps-member-card-avatar">
                        {m.profileImage ? (
                          <img src={m.profileImage} alt={m.name} className="gmaps-avatar-img" />
                        ) : (
                          <div className="gmaps-avatar-init">{initial}</div>
                        )}
                        <span className="gmaps-online-beacon"></span>
                      </div>

                      <div className="gmaps-member-card-info">
                        <span className="gmaps-member-card-name">
                          {m.name} {isMe && <strong className="gmaps-you-tag">(You)</strong>}
                        </span>
                        <span className="gmaps-member-card-time">
                          📍 Updated {formatTimeAgo(m.lastLocationUpdate)}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="gmaps-member-focus-action"
                        onClick={() => onFocusMember([m.latitude, m.longitude])}
                        title="Focus on map"
                      >
                        <Crosshair size={13} />
                        <span>Focus</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="gmaps-members-empty-state">
                No members currently sharing location. Tap <strong>Share</strong> to broadcast your live position to the group.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
