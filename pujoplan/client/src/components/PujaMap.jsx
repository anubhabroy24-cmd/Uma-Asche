import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { Crosshair, Maximize2 } from 'lucide-react';
import './GmapsBottomSheet.css';

// Fix default marker icons in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom SVG Teardrop Pin (Google Maps style)
function createSvgTeardropPin(label, isStart = false, isVisited = false) {
  const pinColor = isVisited ? '#34A853' : isStart ? '#1a73e8' : '#EA4335';
  const textColor = '#ffffff';
  return L.divIcon({
    className: 'gmaps-teardrop-marker-div',
    html: `
      <div class="gmaps-teardrop-pin${isVisited ? ' gmaps-teardrop-pin--visited' : ''}">
        <svg viewBox="0 0 32 44" width="30" height="42" class="gmaps-teardrop-svg">
          <defs>
            <filter id="shadow-${label}-${isStart ? 's' : isVisited ? 'v' : 'p'}" x="-20%" y="-10%" width="140%" height="130%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity="0.5"/>
            </filter>
          </defs>
          <path d="M16 0C7.163 0 0 7.163 0 16c0 11.2 14.5 26.8 15.15 27.5a1.15 1.15 0 0 0 1.7 0C17.5 42.8 32 27.2 32 16 32 7.163 24.837 0 16 0z"
                fill="${pinColor}" filter="url(#shadow-${label}-${isStart ? 's' : isVisited ? 'v' : 'p'})"/>
          <circle cx="16" cy="16" r="8.5" fill="#ffffff"/>
          ${isVisited
        ? `<text x="16" y="20.5" font-family="'Roboto', 'Google Sans', Inter, sans-serif" font-size="11" font-weight="900" fill="${pinColor}" text-anchor="middle">✓</text>`
        : `<text x="16" y="20" font-family="'Roboto', 'Google Sans', Inter, sans-serif" font-size="${String(label).length > 2 ? '8.5' : '10.5'}" font-weight="900" fill="${pinColor}" text-anchor="middle">${label}</text>`
      }
        </svg>
      </div>
    `,
    iconSize: [30, 42],
    iconAnchor: [15, 41],
    popupAnchor: [0, -40],
  });
}

// Custom DivIcon: solid 16px blue dot with white border & CSS keyframe ring that pulses outward every ~2s
function createMyLocationDivIcon() {
  return L.divIcon({
    className: 'gmaps-mylocation-divicon',
    html: `
      <div class="gmaps-bluedot-host" style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
        <div class="gmaps-bluedot-pulse-ring" style="position:absolute;width:16px;height:16px;border-radius:50%;background:rgba(66,133,244,0.45);animation:gmapsBluePulse 2s cubic-bezier(0.2,0.6,0.4,1) infinite;"></div>
        <div class="gmaps-bluedot-solid" style="width:16px;height:16px;background:#4285F4;border:2.5px solid #ffffff;border-radius:50%;box-shadow:0 0 8px rgba(0,0,0,0.6);position:relative;z-index:2;"></div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

// Group Member Circular Avatar Pin
function createMemberAvatarIcon(member) {
  const initial = member.name?.[0]?.toUpperCase() || 'U';
  return L.divIcon({
    className: 'gmaps-member-avatar-div',
    html: `
      <div class="gmaps-avatar-pin-container">
        <div class="gmaps-avatar-pin-bubble">
          ${member.profileImage
        ? `<img src="${member.profileImage}" class="gmaps-avatar-pin-img" alt="${member.name}" />`
        : `<span class="gmaps-avatar-pin-initial">${initial}</span>`
      }
          <span class="gmaps-avatar-pin-dot"></span>
        </div>
        <div class="gmaps-avatar-pin-tail"></div>
      </div>
    `,
    iconSize: [36, 44],
    iconAnchor: [18, 42],
    popupAnchor: [0, -40],
  });
}

function formatUpdatedAgo(dateStr) {
  if (!dateStr) return 'Active now';
  const sec = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  if (sec < 60) return `last updated ${sec}s ago`;
  if (sec < 3600) return `last updated ${Math.floor(sec / 60)}m ago`;
  return `last updated ${Math.floor(sec / 3600)}h ago`;
}

const PujaMap = forwardRef(function PujaMap({
  routeData = null,
  waypoints = [],
  onWaypointsChange,
  myLocation = null, // { latitude, longitude, accuracy }
  liveMembers = [],
  currentUserId,
  centerTarget = null,
  onRouteSummary,
  onError,
  visitedStops = new Set(),
  onMarkVisited,
  height = 420,
}, ref) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routeLayerRef = useRef(null);
  const lastUserStartKeyRef = useRef('');
  const lastRouteFitKeyRef = useRef('');
  const stopMarkersLayerRef = useRef(null);
  const userToStartRouteLayerRef = useRef(null);
  const amenitiesLayerRef = useRef(null);
  const myLocationMarkerRef = useRef(null);
  const myLocationAccuracyRef = useRef(null);
  const membersLayerRef = useRef(null);

  // Internal GPS location state as autonomous fallback
  const [internalLoc, setInternalLoc] = useState(null);
  const effectiveLocation = (myLocation && myLocation.latitude && myLocation.longitude) ? myLocation : internalLoc;

  // Autonomous GPS fetch so the blue dot ALWAYS appears on current location without depending on parent props
  useEffect(() => {
    if (!navigator?.geolocation) return;

    const onPos = (pos) => {
      setInternalLoc({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy || 30,
      });
    };

    navigator.geolocation.getCurrentPosition(
      onPos,
      () => {
        navigator.geolocation.getCurrentPosition(onPos, () => { }, {
          enableHighAccuracy: false,
          timeout: 12000,
          maximumAge: 60000,
        });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );

    let watchId = null;
    try {
      watchId = navigator.geolocation.watchPosition(onPos, () => { }, {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000,
      });
    } catch (_) { }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // Derive waypoints if routeData is passed instead
  const effectiveWaypoints = useMemo(() => {
    if (waypoints && waypoints.length > 0) return waypoints;
    if (routeData?.stops && routeData?.start) {
      return [
        {
          name: routeData.start.name || 'Start',
          lat: routeData.start.coords?.[0] || 22.5726,
          lng: routeData.start.coords?.[1] || 88.3639,
        },
        ...routeData.stops.map((s, idx) => ({
          name: s.spot?.name || `Stop ${idx + 1}`,
          lat: s.coords?.[0] || s.spot?.latitude,
          lng: s.coords?.[1] || s.spot?.longitude,
        })),
      ];
    }
    return [];
  }, [waypoints, routeData]);

  const normalizedRouteKey = useMemo(() => {
    return effectiveWaypoints
      .filter((w) => w && !isNaN(Number(w.lat)) && !isNaN(Number(w.lng)))
      .map((w) => `${Number(w.lat).toFixed(4)},${Number(w.lng).toFixed(4)}`)
      .join('|');
  }, [effectiveWaypoints]);

  // Helper to draw the two stacked polylines: white 10px base under #4285F4 blue 6px top
  const drawRouteLines = useCallback((latLngs) => {
    if (!routeLayerRef.current) return;
    routeLayerRef.current.clearLayers();

    if (!latLngs || latLngs.length < 2) return;

    // 1. White 10px base under line with rounded caps
    L.polyline(latLngs, {
      color: '#ffffff',
      weight: 10,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(routeLayerRef.current);

    // 2. #4285F4 blue 6px line on top with rounded caps
    L.polyline(latLngs, {
      color: '#4285F4',
      weight: 6,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(routeLayerRef.current);
  }, []);

  // Helper to draw RED route line specifically from logged-in user's own location to start point
  const drawUserToStartRouteLines = useCallback((latLngs) => {
    if (!userToStartRouteLayerRef.current) return;
    userToStartRouteLayerRef.current.clearLayers();

    if (!latLngs || latLngs.length < 2) return;

    // 1. White 8px base underlay
    L.polyline(latLngs, {
      color: '#ffffff',
      weight: 8,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(userToStartRouteLayerRef.current);

    // 2. Vibrant RED (#EA4335) 5px line from User's location to Start Point
    L.polyline(latLngs, {
      color: '#EA4335',
      weight: 5,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(userToStartRouteLayerRef.current);
  }, []);

  // Helper to draw custom SVG teardrop stop markers (Static & Fixed)
  const drawStopMarkers = useCallback((points, visited = new Set()) => {
    if (!stopMarkersLayerRef.current) return;
    stopMarkersLayerRef.current.clearLayers();

    points.forEach((wp, i) => {
      if (!wp || isNaN(Number(wp.lat)) || isNaN(Number(wp.lng))) return;
      const isStart = i === 0;
      const isVisited = !isStart && visited.has(i);
      const marker = L.marker([Number(wp.lat), Number(wp.lng)], {
        icon: createSvgTeardropPin(isStart ? 'S' : i, isStart, isVisited),
        draggable: false, // Map pins are static to prevent accidental relocation on touch
        zIndexOffset: isStart ? 1100 : 1000 - i,
      });

      const visitBtnId = `visit-btn-${i}-${Date.now()}`;
      marker.bindPopup(
        `<div style="font-family:Roboto,sans-serif; padding: 4px 2px; min-width: 160px;">
          <strong style="color:${isVisited ? '#34a853' : '#ea4335'}; font-size: 13px;">${isStart ? '🚩 START LOCATION' : isVisited ? `✅ VISITED #${i}` : `📍 STOP #${i}`}</strong><br/>
          <span style="font-weight: 600; color: #fff; font-size: 13px;">${wp.name || 'Pandal Stop'}</span>
          ${!isStart ? `<br/><button id="${visitBtnId}" style="margin-top:8px; padding:5px 12px; border-radius:20px; border:none; background:${isVisited ? '#5f6368' : '#34a853'}; color:#fff; font-weight:700; font-size:12px; cursor:pointer; width:100%;">${isVisited ? '↩ Unmark' : '✓ Mark as Visited'}</button>` : ''}
        </div>`,
        { className: 'gmaps-pandal-popup' }
      );

      if (!isStart && onMarkVisited) {
        marker.on('popupopen', () => {
          const btn = document.getElementById(visitBtnId);
          if (btn) {
            btn.onclick = (e) => {
              e.stopPropagation();
              onMarkVisited(i);
              marker.closePopup();
            };
          }
        });
      }

      stopMarkersLayerRef.current.addLayer(marker);
    });
  }, [onMarkVisited]);

  // ── 1. Initialize Leaflet Map with CartoDB Dark Tiles ──
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [22.5726, 88.3639],
      zoom: 13,
      zoomControl: false,
    });

    // 100% Free OpenStreetMap tiles with Google Maps Dark Theme styling (Zero API key, zero watermarks)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      maxZoom: 19,
      className: 'gmaps-dark-tiles',
    }).addTo(map);

    // Zoom control in top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Dedicated layers for route and markers
    routeLayerRef.current = L.layerGroup().addTo(map);
    userToStartRouteLayerRef.current = L.layerGroup().addTo(map);
    stopMarkersLayerRef.current = L.layerGroup().addTo(map);
    amenitiesLayerRef.current = L.layerGroup().addTo(map);
    membersLayerRef.current = L.layerGroup().addTo(map);

    // Invalidate size once after mount to ensure seamless tile display
    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 250);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Run once on mount

  const onRouteSummaryRef = useRef(onRouteSummary);
  onRouteSummaryRef.current = onRouteSummary;

  const onWaypointsChangeRef = useRef(onWaypointsChange);
  onWaypointsChangeRef.current = onWaypointsChange;

  const lastRenderedKeyRef = useRef('');

  // ── 2. Render Route Lines & Driving Directions (Flicker-Free) ──
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const validWaypoints = effectiveWaypoints.filter(
      (w) => w && !isNaN(Number(w.lat)) && !isNaN(Number(w.lng))
    );

    // Compute stable coordinate serialization key to avoid redraw loops for unchanged routes
    const currentKey = validWaypoints.map((w) => `${Number(w.lat).toFixed(4)},${Number(w.lng).toFixed(4)}`).join('|');
    if (currentKey === lastRenderedKeyRef.current && currentKey !== '') {
      return; // Waypoint coordinates haven't changed, skip re-rendering to prevent any flicker
    }
    lastRenderedKeyRef.current = currentKey;

    // 1. Draw all teardrop markers (with current visited state)
    drawStopMarkers(validWaypoints, visitedStops);

    if (validWaypoints.length < 2) {
      if (routeLayerRef.current) routeLayerRef.current.clearLayers();
      lastRouteFitKeyRef.current = '';
      return;
    }

    // 2. Query high-accuracy driving road geometry via OSRM
    const coordStr = validWaypoints.map((w) => `${Number(w.lng)},${Number(w.lat)}`).join(';');
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

    fetch(osrmUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const route = data.routes && data.routes[0];
        if (route && route.geometry && route.geometry.coordinates) {
          const roadLatLngs = route.geometry.coordinates.map((c) => [c[1], c[0]]);
          drawRouteLines(roadLatLngs);

          const fitKey = `route:${currentKey}`;
          if (fitKey !== lastRouteFitKeyRef.current) {
            lastRouteFitKeyRef.current = fitKey;
            try {
              map.fitBounds(roadLatLngs, { padding: [55, 55], maxZoom: 15 });
            } catch (_) { }
          }

          if (onRouteSummaryRef.current) {
            onRouteSummaryRef.current({
              totalDistanceKm: (route.distance / 1000).toFixed(1),
              estimatedDurationMin: Math.round(route.duration / 60),
            });
          }
        } else {
          const straightCoords = validWaypoints.map((w) => [Number(w.lat), Number(w.lng)]);
          drawRouteLines(straightCoords);
        }
      })
      .catch((err) => {
        const straightCoords = validWaypoints.map((w) => [Number(w.lat), Number(w.lng)]);
        drawRouteLines(straightCoords);
      });
  }, [normalizedRouteKey, drawRouteLines, drawStopMarkers, visitedStops]);

  // ── 2B. Redraw markers when visited state changes (without re-querying OSRM) ──
  useEffect(() => {
    const validWaypoints = effectiveWaypoints.filter(
      (w) => w && !isNaN(Number(w.lat)) && !isNaN(Number(w.lng))
    );
    if (validWaypoints.length === 0) return;
    drawStopMarkers(validWaypoints, visitedStops);
  }, [visitedStops]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3. Current Location: 16px Blue Dot + 2s Pulsing Ring + Accuracy Circle ──
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!effectiveLocation || !effectiveLocation.latitude || !effectiveLocation.longitude) {
      if (myLocationMarkerRef.current) {
        map.removeLayer(myLocationMarkerRef.current);
        myLocationMarkerRef.current = null;
      }
      if (myLocationAccuracyRef.current) {
        map.removeLayer(myLocationAccuracyRef.current);
        myLocationAccuracyRef.current = null;
      }
      return;
    }

    const latLng = [effectiveLocation.latitude, effectiveLocation.longitude];

    // Create or update blue dot marker
    if (!myLocationMarkerRef.current) {
      const marker = L.marker(latLng, {
        icon: createMyLocationDivIcon(),
        zIndexOffset: 3000,
      }).addTo(map);
      marker.bindPopup(`<strong>Your Location</strong><br/>Live GPS Position`);
      myLocationMarkerRef.current = marker;
    } else {
      myLocationMarkerRef.current.setLatLng(latLng);
    }

    // Faint accuracy radius circle
    const acc = effectiveLocation.accuracy || 30;
    if (!myLocationAccuracyRef.current) {
      const circle = L.circle(latLng, {
        radius: acc,
        color: '#4285f4',
        weight: 1,
        opacity: 0.35,
        fillColor: '#4285f4',
        fillOpacity: 0.07,
      }).addTo(map);
      myLocationAccuracyRef.current = circle;
    } else {
      myLocationAccuracyRef.current.setLatLng(latLng);
      myLocationAccuracyRef.current.setRadius(acc);
    }
  }, [effectiveLocation]);

  // ── 3B. Route from User's Current Location to Starting Point in RED (Flicker-Free) ──
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !userToStartRouteLayerRef.current) return;

    if (!effectiveLocation?.latitude || !effectiveLocation?.longitude || effectiveWaypoints.length === 0) {
      userToStartRouteLayerRef.current.clearLayers();
      lastUserStartKeyRef.current = '';
      return;
    }

    const startPoint = effectiveWaypoints[0];
    if (!startPoint || isNaN(Number(startPoint.lat)) || isNaN(Number(startPoint.lng))) {
      userToStartRouteLayerRef.current.clearLayers();
      lastUserStartKeyRef.current = '';
      return;
    }

    const uLat = Number(effectiveLocation.latitude);
    const uLng = Number(effectiveLocation.longitude);
    const sLat = Number(startPoint.lat);
    const sLng = Number(startPoint.lng);

    // Filter minor GPS jittering < 15 meters
    const key = `${uLat.toFixed(3)},${uLng.toFixed(3)}|${sLat.toFixed(4)},${sLng.toFixed(4)}`;
    if (key === lastUserStartKeyRef.current && lastUserStartKeyRef.current !== '') {
      return; // Skip re-querying OSRM if position hasn't changed significantly
    }
    lastUserStartKeyRef.current = key;

    // If user is within 35m of start point, no route needed
    const dLat = (sLat - uLat) * 111000;
    const dLng = (sLng - uLng) * 111000 * Math.cos((uLat * Math.PI) / 180);
    const distMeters = Math.sqrt(dLat * dLat + dLng * dLng);

    if (distMeters < 35) {
      userToStartRouteLayerRef.current.clearLayers();
      return;
    }

    // Query turn-by-turn driving road path from User's location to Starting Point without straight-line flickering
    const coordStr = `${uLng},${uLat};${sLng},${sLat}`;
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

    fetch(osrmUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const route = data.routes && data.routes[0];
        if (route && route.geometry && route.geometry.coordinates) {
          const roadLatLngs = route.geometry.coordinates.map((c) => [c[1], c[0]]);
          drawUserToStartRouteLines(roadLatLngs);
        } else {
          drawUserToStartRouteLines([[uLat, uLng], [sLat, sLng]]);
        }
      })
      .catch(() => {
        drawUserToStartRouteLines([[uLat, uLng], [sLat, sLng]]);
      });
  }, [effectiveLocation, effectiveWaypoints, drawUserToStartRouteLines]);

  // ── 4. Live Group Members Pins with Avatars ──────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !membersLayerRef.current) return;

    membersLayerRef.current.clearLayers();

    if (!liveMembers || liveMembers.length === 0) return;

    liveMembers.forEach((member) => {
      // Don't render self as member pin if user has blue dot
      if (member.userId === currentUserId) return;
      if (!member.latitude || !member.longitude) return;

      const marker = L.marker([Number(member.latitude), Number(member.longitude)], {
        icon: createMemberAvatarIcon(member),
        zIndexOffset: 1200,
      });

      marker.bindPopup(`
        <div style="font-family:Roboto,sans-serif; min-width:140px; padding:2px 0;">
          <strong style="color:#ffffff; font-size:13px;">${member.name || 'Member'}</strong><br/>
          <span style="color:#9aa0a6; font-size:11px;">${formatUpdatedAgo(member.updatedAt)}</span>
        </div>
      `, { className: 'gmaps-member-popup' });

      membersLayerRef.current.addLayer(marker);
    });
  }, [liveMembers, currentUserId]);

  // Invalidate Size when height prop changes
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.invalidateSize();
    }
  }, [height]);

  // Center Target Trigger (when clicking stop in bottom sheet)
  useEffect(() => {
    if (centerTarget && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(centerTarget, 16, { duration: 0.9 });
    }
  }, [centerTarget]);

  // Recenter on My Location
  const handleRecenterMe = () => {
    // 1. If running in native Android app, check if GPS toggle is on / prompt permission
    if (typeof window !== 'undefined' && window.AndroidBridge) {
      if (typeof window.AndroidBridge.isGpsEnabled === 'function' && !window.AndroidBridge.isGpsEnabled()) {
        window.AndroidBridge.requestLocationPermissionOrEnableGps();
        if (typeof onError === 'function') {
          onError('Device GPS is turned off. Please turn on Location in settings.');
        }
        return;
      }
      if (typeof window.AndroidBridge.requestLocationPermissionOrEnableGps === 'function') {
        window.AndroidBridge.requestLocationPermissionOrEnableGps();
      }
    }

    // 2. If we already have accurate GPS coordinates, fly directly to them
    if (effectiveLocation?.latitude && effectiveLocation?.longitude && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([effectiveLocation.latitude, effectiveLocation.longitude], 17, { duration: 0.8 });
    }

    // 3. Query high-accuracy GPS position
    if (navigator?.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy || 30,
          };
          setInternalLoc(loc);
          mapInstanceRef.current?.flyTo([loc.latitude, loc.longitude], 17, { duration: 0.8 });
        },
        (err) => {
          console.warn('Recenter location error:', err);
          if (typeof window !== 'undefined' && window.AndroidBridge?.requestLocationPermissionOrEnableGps) {
            window.AndroidBridge.requestLocationPermissionOrEnableGps();
          }
          if (typeof onError === 'function') {
            onError('Could not get live location. Please allow location permission and turn on GPS.');
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else if (typeof onError === 'function') {
      onError('Geolocation is not supported by your browser.');
    }
  };

  // Fit Entire Route Bounds
  const handleFitRoute = () => {
    if (!mapInstanceRef.current || waypoints.length === 0) return;
    const bounds = waypoints.filter((w) => w && w.lat && w.lng).map((w) => [w.lat, w.lng]);
    if (effectiveLocation?.latitude) bounds.push([effectiveLocation.latitude, effectiveLocation.longitude]);
    if (bounds.length > 0) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  useImperativeHandle(ref, () => ({
    recenterMe: handleRecenterMe,
    fitRoute: handleFitRoute,
    invalidateSize: () => {
      mapInstanceRef.current?.invalidateSize();
    },
  }));

  return (
    <div className="gmaps-navigation-container" style={{ position: 'relative', width: '100%', height }}>
      {/* Map DOM Element */}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating GPS Recenter Button */}
      <div className="gmaps-floating-controls">
        <button
          type="button"
          className="gmaps-map-fab"
          onClick={handleRecenterMe}
          title="Recenter on my location"
          aria-label="Recenter on my location"
        >
          <Crosshair size={18} color="#4285F4" />
        </button>
        <button
          type="button"
          className="gmaps-map-fab"
          onClick={handleFitRoute}
          title="Fit whole route"
          aria-label="Fit whole route"
        >
          <Maximize2 size={16} color="#e8eaed" />
        </button>
      </div>
    </div>
  );
});

export default PujaMap;
