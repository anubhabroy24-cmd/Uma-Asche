import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getGroupLocations, updateGroupLocation } from '../services/api';
import { Navigation, MapPin, Eye, EyeOff, Crosshair, Users, AlertCircle } from 'lucide-react';
import './GroupLocationTracker.css';

// Fix default leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function formatLastSeen(dateStr) {
  if (!dateStr) return 'Inactive';
  const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diffSec < 45) return 'Active now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

function createMemberMarkerIcon(member, isCurrentUser) {
  const initial = member.name?.[0] || 'U';
  const color = isCurrentUser ? '#f5c518' : '#ff4757';
  const textColor = isCurrentUser ? '#0a0a0a' : '#ffffff';
  const nameLabel = isCurrentUser ? `${member.name} (You)` : member.name;

  return L.divIcon({
    className: 'glt__marker-custom',
    html: `
      <div class="glt__marker-container ${isCurrentUser ? 'glt__marker--me' : ''}">
        <div class="glt__marker-tag" style="border-color:${color};">
          <span class="glt__marker-dot" style="background:${color};"></span>
          <span class="glt__marker-text">${nameLabel}</span>
        </div>
        <div class="glt__marker-pin" style="background:${color};">
          ${
            member.profileImage
              ? `<img src="${member.profileImage}" class="glt__marker-img" />`
              : `<span class="glt__marker-initial" style="color:${textColor};">${initial}</span>`
          }
          ${isCurrentUser ? '<div class="glt__marker-pulse"></div>' : ''}
        </div>
      </div>
    `,
    iconSize: [120, 60],
    iconAnchor: [60, 52],
    popupAnchor: [0, -48],
  });
}

// Popular Puja spots in Kolkata for quick test positioning
const QUICK_PRESETS = [
  { name: 'Park Street', lat: 22.5518, lng: 88.3524 },
  { name: 'Bagbazar (North)', lat: 22.6033, lng: 88.3685 },
  { name: 'Gariahat (South)', lat: 22.5173, lng: 88.3693 },
  { name: 'Salt Lake', lat: 22.5867, lng: 88.4178 },
];

export default function GroupLocationTracker({ groupId, currentUser }) {
  const [locations, setLocations] = useState([]);
  const [isSharing, setIsSharing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locError, setLocError] = useState('');
  const [clickToPin, setClickToPin] = useState(false);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const watchIdRef = useRef(null);

  const fetchLocations = useCallback(async () => {
    try {
      const { data } = await getGroupLocations(groupId);
      setLocations(data);
      const myState = data.find(m => m.userId === currentUser?.id);
      if (myState && myState.isSharingLocation && !isSharing) {
        setIsSharing(true);
      }
    } catch (e) {
      // silently retry on poll
    } finally {
      setLoading(false);
    }
  }, [groupId, currentUser?.id, isSharing]);

  // Initial fetch and 4s polling
  useEffect(() => {
    fetchLocations();
    const interval = setInterval(fetchLocations, 4000);
    return () => clearInterval(interval);
  }, [fetchLocations]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [22.5726, 88.3639], // Kolkata
        zoom: 12,
        zoomControl: true,
        scrollWheelZoom: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const markersGroup = L.layerGroup().addTo(map);
      markersLayerRef.current = markersGroup;
      mapInstanceRef.current = map;

      // Click to pin handler
      map.on('click', async e => {
        if (map._isPinning) {
          const { lat, lng } = e.latlng;
          try {
            await updateGroupLocation(groupId, {
              latitude: lat,
              longitude: lng,
              isSharingLocation: true,
            });
            setIsSharing(true);
            setClickToPin(false);
            map._isPinning = false;
            fetchLocations();
          } catch (err) {
            alert('Failed to set location.');
          }
        }
      });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [groupId, fetchLocations]);

  // Update map markers when locations change
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    const bounds = [];

    locations.forEach(member => {
      if (!member.isSharingLocation || !member.latitude || !member.longitude) return;

      const isMe = member.userId === currentUser?.id;
      const marker = L.marker([member.latitude, member.longitude], {
        icon: createMemberMarkerIcon(member, isMe),
      });

      const popupContent = `
        <div style="font-family:Inter,sans-serif; min-width:140px; padding:4px;">
          <strong style="color:#f5c518; font-size:13px;">${member.name}</strong>
          ${isMe ? ' <span style="font-size:10px; color:#aaa;">(You)</span>' : ''}
          <div style="font-size:11px; color:#ccc; margin-top:3px;">
            Role: <strong>${member.role}</strong>
          </div>
          <div style="font-size:11px; color:#44bbaa; margin-top:2px;">
            ${formatLastSeen(member.lastLocationUpdate)}
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      markersLayerRef.current.addLayer(marker);
      bounds.push([member.latitude, member.longitude]);
    });

    // Auto-fit if we have valid member pins
    if (bounds.length > 0 && !mapInstanceRef.current._hasInitialFit) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      mapInstanceRef.current._hasInitialFit = true;
    }
  }, [locations, currentUser?.id]);

  // Handle Share Location Toggle
  async function toggleShareLocation() {
    setLocError('');
    if (isSharing) {
      // Stop sharing
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      try {
        await updateGroupLocation(groupId, { isSharingLocation: false });
        setIsSharing(false);
        fetchLocations();
      } catch (err) {
        setLocError('Failed to disable location sharing.');
      }
    } else {
      // Start sharing
      if (!navigator.geolocation) {
        setLocError('Geolocation is not supported by your browser. Use "Click Map to Pin" instead.');
        return;
      }

      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        async position => {
          const { latitude, longitude } = position.coords;
          try {
            await updateGroupLocation(groupId, {
              latitude,
              longitude,
              isSharingLocation: true,
            });
            setIsSharing(true);
            setLoading(false);
            fetchLocations();

            // Center on user
            mapInstanceRef.current?.setView([latitude, longitude], 15);

            // Start watcher for continuous updates
            watchIdRef.current = navigator.geolocation.watchPosition(
              async pos => {
                try {
                  await updateGroupLocation(groupId, {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    isSharingLocation: true,
                  });
                } catch (_) {}
              },
              null,
              { enableHighAccuracy: true, maximumAge: 10000 }
            );
          } catch (e) {
            setLocError('Failed to broadcast location to group.');
            setLoading(false);
          }
        },
        error => {
          setLoading(false);
          setLocError(
            error.message ||
              'Could not get GPS location. You can still use "Click Map to Pin" below.'
          );
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }

  // Quick Preset setter
  async function handlePreset(preset) {
    try {
      await updateGroupLocation(groupId, {
        latitude: preset.lat,
        longitude: preset.lng,
        isSharingLocation: true,
      });
      setIsSharing(true);
      mapInstanceRef.current?.setView([preset.lat, preset.lng], 14);
      fetchLocations();
    } catch (e) {
      alert('Failed to set preset location.');
    }
  }

  function handleFocusMember(member) {
    if (member.latitude && member.longitude && mapInstanceRef.current) {
      mapInstanceRef.current.setView([member.latitude, member.longitude], 15);
    }
  }

  function toggleClickToPin() {
    const next = !clickToPin;
    setClickToPin(next);
    if (mapInstanceRef.current) {
      mapInstanceRef.current._isPinning = next;
    }
  }

  const activeSharingCount = locations.filter(l => l.isSharingLocation).length;

  return (
    <div className="glt">
      {locError && (
        <div className="alert alert-error glt__alert">
          <AlertCircle size={14} />
          <span>{locError}</span>
        </div>
      )}

      {/* Action Header */}
      <div className="glt__controls">
        <button
          type="button"
          className={`btn btn-sm ${isSharing ? 'btn-red' : 'btn-yellow'} glt__share-btn`}
          onClick={toggleShareLocation}
        >
          {isSharing ? <EyeOff size={14} /> : <Eye size={14} />}
          <span>{isSharing ? 'Stop Sharing' : 'Share My Live Location'}</span>
        </button>

        <button
          type="button"
          className={`btn btn-sm btn-outline glt__pin-btn ${clickToPin ? 'glt__pin-btn--active' : ''}`}
          onClick={toggleClickToPin}
          title="Click anywhere on the map to set your location"
        >
          <Crosshair size={14} />
          <span>{clickToPin ? 'Tap Map to Place' : 'Click to Pin'}</span>
        </button>
      </div>

      {clickToPin && (
        <div className="glt__pin-hint">
          📍 Click any spot on the map to update your location for all group members!
        </div>
      )}

      {/* Map Container */}
      <div className="glt__map-wrap">
        <div ref={mapContainerRef} className="glt__map" />
        <div className="glt__map-badge">
          <span className="glt__map-badge-dot" />
          <span>{activeSharingCount} Live on Map</span>
        </div>
      </div>

      {/* Quick Kolkata Presets for testing */}
      <div className="glt__presets">
        <span className="glt__presets-label">Quick Set (Testing):</span>
        <div className="glt__preset-tags">
          {QUICK_PRESETS.map(p => (
            <button
              key={p.name}
              type="button"
              className="glt__preset-chip"
              onClick={() => handlePreset(p)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Group Members Tracking Status List */}
      <div className="glt__list-section">
        <div className="glt__list-head">
          <Users size={15} />
          <span>GROUP MEMBERS ({locations.length})</span>
        </div>

        <div className="glt__members-list">
          {locations.map(member => {
            const isMe = member.userId === currentUser?.id;
            const sharing = member.isSharingLocation;

            return (
              <div key={member.userId} className="glt__member-row">
                <div className="glt__member-left">
                  {member.profileImage ? (
                    <img
                      src={member.profileImage}
                      alt=""
                      className="glt__avatar"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="glt__avatar glt__avatar--ph">
                      {member.name?.[0] || 'U'}
                    </div>
                  )}
                  <div>
                    <div className="glt__name">
                      {member.name}
                      {isMe && <span className="glt__you-tag">You</span>}
                    </div>
                    <div className="glt__status">
                      {sharing ? (
                        <span className="glt__live-text">
                          <span className="glt__dot glt__dot--live" />
                          {formatLastSeen(member.lastLocationUpdate)}
                        </span>
                      ) : (
                        <span className="glt__off-text">
                          <span className="glt__dot glt__dot--off" />
                          Not sharing
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {sharing && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm glt__focus-btn"
                    onClick={() => handleFocusMember(member)}
                    title="Focus member on map"
                  >
                    <Navigation size={13} />
                    <span>View</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
