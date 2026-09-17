import React, {
  useEffect, useRef, useState, useCallback,
  forwardRef, useImperativeHandle
} from 'react';
import { Crosshair, Maximize2, Navigation, Key, ExternalLink, X } from 'lucide-react';

const GOOGLE_MAPS_DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'poi.park', elementType: 'labels.text.stroke', stylers: [{ color: '#1b1b1b' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e4e' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
];

const PujaMap = forwardRef(function PujaMap({
  routeData = null,
  waypoints = [],
  onWaypointsChange,
  myLocation = null,
  liveMembers = [],
  currentUserId,
  centerTarget = null,
  onRouteSummary,
  onError,
  height = 420,
}, ref) {
  const mapContainerRef = useRef(null);
  const googleMapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const infoWindowRef = useRef(null);

  // Key state: Check environment or localStorage
  const [apiKey, setApiKey] = useState(() => {
    return import.meta.env.VITE_GOOGLE_MAPS_API_KEY || localStorage.getItem('pp_gmaps_api_key') || '';
  });
  const [isJsSdkLoaded, setIsJsSdkLoaded] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState(apiKey);
  const [keyError, setKeyError] = useState('');

  // Extract effective waypoints
  const effectiveWaypoints = (waypoints && waypoints.length > 0)
    ? waypoints
    : (routeData?.stops && routeData?.start)
      ? [
        {
          name: routeData.start.name || 'Start Point',
          lat: routeData.start.coords?.[0] || 22.5726,
          lng: routeData.start.coords?.[1] || 88.3639,
        },
        ...routeData.stops.map((s, idx) => ({
          name: s.spot?.name || `Stop ${idx + 1}`,
          lat: s.coords?.[0] || s.spot?.latitude,
          lng: s.coords?.[1] || s.spot?.longitude,
        })),
      ]
      : [];

  const centerCoord = effectiveWaypoints.length > 0
    ? { lat: Number(effectiveWaypoints[0].lat), lng: Number(effectiveWaypoints[0].lng) }
    : { lat: 22.5726, lng: 88.3639 }; // Kolkata center

  // Build full Google Maps directions URL for all waypoints
  const getGoogleMapsDirectionsUrl = () => {
    if (effectiveWaypoints.length === 0) {
      return `https://www.google.com/maps?q=Kolkata+Durga+Puja`;
    }
    if (effectiveWaypoints.length === 1) {
      const p = effectiveWaypoints[0];
      return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
    }
    const origin = `${effectiveWaypoints[0].lat},${effectiveWaypoints[0].lng}`;
    const destination = `${effectiveWaypoints[effectiveWaypoints.length - 1].lat},${effectiveWaypoints[effectiveWaypoints.length - 1].lng}`;
    const intermediates = effectiveWaypoints.slice(1, -1).map(w => `${w.lat},${w.lng}`).join('|');
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
    if (intermediates) {
      url += `&waypoints=${encodeURIComponent(intermediates)}`;
    }
    return url;
  };

  // ── 1. Dynamic Google Maps JavaScript SDK Loader ──
  useEffect(() => {
    if (!apiKey || isJsSdkLoaded) return;

    // If already on window
    if (window.google && window.google.maps) {
      setIsJsSdkLoaded(true);
      return;
    }

    const scriptId = 'google-maps-js-sdk';
    let script = document.getElementById(scriptId);
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry,places`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        setIsJsSdkLoaded(true);
      };
      script.onerror = () => {
        setKeyError('Failed to load Google Maps JS SDK with this key.');
      };
      document.head.appendChild(script);
    } else {
      script.onload = () => setIsJsSdkLoaded(true);
    }
  }, [apiKey, isJsSdkLoaded]);

  // ── 2. Initialize Google Maps instance when SDK is loaded ──
  useEffect(() => {
    if (!isJsSdkLoaded || !mapContainerRef.current || !window.google?.maps) return;

    try {
      const map = new window.google.maps.Map(mapContainerRef.current, {
        center: centerCoord,
        zoom: 13,
        styles: GOOGLE_MAPS_DARK_STYLE,
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        gestureHandling: 'greedy',
      });

      googleMapInstanceRef.current = map;
      infoWindowRef.current = new window.google.maps.InfoWindow();
    } catch (e) {
      console.warn('Google Maps JS Map creation error:', e);
    }
  }, [isJsSdkLoaded]);

  // ── 3. Render Static Markers & Route in Google Maps SDK ──
  useEffect(() => {
    const map = googleMapInstanceRef.current;
    if (!map || !window.google?.maps) return;

    // Clear old markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    // Clear old polylines
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    if (effectiveWaypoints.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    const routeCoords = [];

    // Render Stop Markers
    effectiveWaypoints.forEach((wp, i) => {
      const pos = { lat: Number(wp.lat), lng: Number(wp.lng) };
      if (isNaN(pos.lat) || isNaN(pos.lng)) return;

      bounds.extend(pos);
      routeCoords.push(pos);

      const isStart = i === 0;
      const marker = new window.google.maps.Marker({
        position: pos,
        map,
        title: wp.name,
        draggable: false, // Static & touch-proof
        label: {
          text: isStart ? 'S' : String(i),
          color: '#ffffff',
          fontWeight: '900',
          fontSize: '12px',
        },
        icon: {
          path: 'M12 0C7.03 0 3 4.03 3 9c0 5.25 7.05 14.25 8.19 14.85.48.25 1.14.25 1.62 0C13.95 23.25 21 14.25 21 9c0-4.97-4.03-9-9-9z',
          fillColor: isStart ? '#1a73e8' : '#ea4335',
          fillOpacity: 1,
          strokeWeight: 1.5,
          strokeColor: '#ffffff',
          scale: 1.6,
          anchor: new window.google.maps.Point(12, 24),
          labelOrigin: new window.google.maps.Point(12, 9),
        },
      });

      marker.addListener('click', () => {
        if (!infoWindowRef.current) return;
        infoWindowRef.current.setContent(`
          <div style="color:#202124; font-family:Roboto,sans-serif; padding:4px;">
            <strong style="color:${isStart ? '#1a73e8' : '#ea4335'}; font-size:12px;">
              ${isStart ? '🚩 START LOCATION' : `📍 STOP #${i}`}
            </strong><br/>
            <div style="font-weight:700; font-size:13px; margin:2px 0 6px;">${wp.name || 'Pandal Stop'}</div>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${pos.lat},${pos.lng}"
               target="_blank" rel="noopener noreferrer"
               style="display:inline-block; background:#1a73e8; color:#fff; padding:4px 8px; border-radius:4px; font-size:11px; text-decoration:none; font-weight:600;">
               Open in Google Maps
            </a>
          </div>
        `);
        infoWindowRef.current.open(map, marker);
      });

      markersRef.current.push(marker);
    });

    // Draw Google Maps Route Polyline
    if (routeCoords.length >= 2) {
      // 1. White border outline
      const baseLine = new window.google.maps.Polyline({
        path: routeCoords,
        geodesic: true,
        strokeColor: '#ffffff',
        strokeOpacity: 0.9,
        strokeWeight: 8,
        map,
      });
      polylinesRef.current.push(baseLine);

      // 2. Google Maps Classic Blue Navigation line
      const navLine = new window.google.maps.Polyline({
        path: routeCoords,
        geodesic: true,
        strokeColor: '#4285F4',
        strokeOpacity: 1.0,
        strokeWeight: 5,
        map,
      });
      polylinesRef.current.push(navLine);
    }

    // Auto fit bounds
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });
    }
  }, [effectiveWaypoints, isJsSdkLoaded]);

  // Recenter controls
  const handleRecenterMe = useCallback(() => {
    if (googleMapInstanceRef.current && myLocation) {
      googleMapInstanceRef.current.panTo({
        lat: Number(myLocation.latitude),
        lng: Number(myLocation.longitude),
      });
      googleMapInstanceRef.current.setZoom(16);
    }
  }, [myLocation]);

  const handleFitRoute = useCallback(() => {
    if (!googleMapInstanceRef.current || !window.google?.maps || effectiveWaypoints.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    effectiveWaypoints.forEach(w => bounds.extend({ lat: Number(w.lat), lng: Number(w.lng) }));
    googleMapInstanceRef.current.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });
  }, [effectiveWaypoints]);

  useImperativeHandle(ref, () => ({
    recenterMe: handleRecenterMe,
    fitRoute: handleFitRoute,
  }));

  const handleSaveKey = (e) => {
    e.preventDefault();
    const clean = keyInput.trim();
    if (clean) {
      localStorage.setItem('pp_gmaps_api_key', clean);
      setApiKey(clean);
      setShowKeyModal(false);
      setKeyError('');
    }
  };

  // Google Maps Embed URL for when JS SDK key is not provided
  const embedUrl = effectiveWaypoints.length > 1
    ? `https://maps.google.com/maps?saddr=${effectiveWaypoints[0].lat},${effectiveWaypoints[0].lng}&daddr=${effectiveWaypoints[effectiveWaypoints.length - 1].lat},${effectiveWaypoints[effectiveWaypoints.length - 1].lng}&z=13&output=embed`
    : `https://maps.google.com/maps?q=${centerCoord.lat},${centerCoord.lng}&z=14&output=embed`;

  return (
    <div className="gmaps-navigation-container" style={{ position: 'relative', width: '100%', height, background: '#121212', borderRadius: '12px', overflow: 'hidden' }}>
      {/* ── Mode A: Google Maps JavaScript SDK (Active when Key is present) ── */}
      {apiKey && (
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      )}

      {/* ── Mode B: Interactive Google Maps Live Fallback (Active when Key not yet set) ── */}
      {!apiKey && (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <iframe
            title="Google Maps Route View"
            src={embedUrl}
            width="100%"
            height="100%"
            style={{ border: 0, display: 'block', filter: 'invert(90%) hue-rotate(180deg) brightness(95%) contrast(90%)' }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />

          {/* Google Maps Floating Controls Pill */}
          <div style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            right: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            background: 'rgba(15, 15, 18, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '10px',
            padding: '6px 10px',
            zIndex: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#4285F4' }}>Google Maps</span>
              <span style={{ fontSize: '10px', color: '#a1a1aa' }}>• Interactive</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <a
                href={getGoogleMapsDirectionsUrl()}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#1a73e8',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: '700',
                  padding: '5px 9px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                }}
              >
                <Navigation size={12} />
                Open Live Maps
                <ExternalLink size={10} />
              </a>

              <button
                type="button"
                onClick={() => setShowKeyModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#f59e0b',
                  fontSize: '11px',
                  fontWeight: '600',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                title="Add Google Maps JS API Key"
              >
                <Key size={12} /> Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Recenter Controls (For JS SDK mode) */}
      {apiKey && (
        <div style={{ position: 'absolute', bottom: '16px', right: '16px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 5 }}>
          <button
            type="button"
            className="gmaps-map-fab"
            onClick={handleRecenterMe}
            title="Recenter on my location"
            style={{
              width: '38px', height: '38px', borderRadius: '50%',
              background: '#1e1e24', border: '1px solid rgba(255,255,255,0.15)',
              color: '#4285F4', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
          >
            <Crosshair size={18} />
          </button>
          <button
            type="button"
            className="gmaps-map-fab"
            onClick={handleFitRoute}
            title="Fit whole route"
            style={{
              width: '38px', height: '38px', borderRadius: '50%',
              background: '#1e1e24', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
          >
            <Maximize2 size={16} />
          </button>
        </div>
      )}

      {/* API Key Entry Modal */}
      {showKeyModal && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}>
          <form
            onSubmit={handleSaveKey}
            style={{
              width: '100%',
              maxWidth: '360px',
              background: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              padding: '16px',
              boxShadow: '0 16px 36px rgba(0,0,0,0.7)',
              color: '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', fontSize: '13px' }}>
                <Key size={14} color="#f59e0b" />
                <span>Google Maps API Key</span>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '11px', color: '#a1a1aa', marginBottom: '10px', lineHeight: '1.4' }}>
              Paste your Google Maps JavaScript API key to enable native Google Maps markers and live geometry rendering:
            </p>

            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: '#fff',
                fontSize: '12px',
                marginBottom: '10px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            {keyError && <p style={{ color: '#f87171', fontSize: '11px', marginBottom: '8px' }}>{keyError}</p>}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#d4d4d8',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  background: '#1a73e8',
                  border: 'none',
                  color: '#fff',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                Save & Load
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
});

export default PujaMap;
