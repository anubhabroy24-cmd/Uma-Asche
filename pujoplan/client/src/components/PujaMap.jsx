import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { Crosshair, Maximize2 } from 'lucide-react';

// Fix default marker icons in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom SVG Teardrop Pin (Google Maps style)
function createSvgTeardropPin(label, isStart = false) {
  const pinColor = isStart ? '#1a73e8' : '#EA4335';
  return L.divIcon({
    className: 'gmaps-teardrop-marker-div',
    html: `
      <div class="gmaps-teardrop-pin">
        <svg viewBox="0 0 32 44" width="30" height="42" class="gmaps-teardrop-svg">
          <defs>
            <filter id="shadow-${label}-${isStart ? 's' : 'p'}" x="-20%" y="-10%" width="140%" height="130%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity="0.5"/>
            </filter>
          </defs>
          <path d="M16 0C7.163 0 0 7.163 0 16c0 11.2 14.5 26.8 15.15 27.5a1.15 1.15 0 0 0 1.7 0C17.5 42.8 32 27.2 32 16 32 7.163 24.837 0 16 0z"
                fill="${pinColor}" filter="url(#shadow-${label}-${isStart ? 's' : 'p'})"/>
          <circle cx="16" cy="16" r="8.5" fill="#ffffff"/>
          <text x="16" y="20" font-family="'Roboto', 'Google Sans', Inter, sans-serif" font-size="${String(label).length > 2 ? '8.5' : '10.5'}" font-weight="900" fill="${pinColor}" text-anchor="middle">${label}</text>
        </svg>
      </div>
    `,
    iconSize: [30, 42],
    iconAnchor: [15, 41],
    popupAnchor: [0, -40],
  });
}

// Custom DivIcon: solid 14px blue dot with white border & CSS keyframe ring that pulses outward every ~2s
function createMyLocationDivIcon() {
  return L.divIcon({
    className: 'gmaps-mylocation-divicon',
    html: `
      <div class="gmaps-bluedot-host">
        <div class="gmaps-bluedot-pulse-ring"></div>
        <div class="gmaps-bluedot-solid"></div>
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
  height = 420,
}, ref) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routeLayerRef = useRef(null);
  const stopMarkersLayerRef = useRef(null);
  const userToStartRouteLayerRef = useRef(null);
  const amenitiesLayerRef = useRef(null);
  const myLocationMarkerRef = useRef(null);
  const myLocationAccuracyRef = useRef(null);
  const membersLayerRef = useRef(null);

  // Derive waypoints if routeData is passed instead
  const effectiveWaypoints = (waypoints && waypoints.length > 0)
    ? waypoints
    : (routeData?.stops && routeData?.start)
      ? [
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
      ]
      : [];

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
  const drawStopMarkers = useCallback((points) => {
    if (!stopMarkersLayerRef.current) return;
    stopMarkersLayerRef.current.clearLayers();

    points.forEach((wp, i) => {
      if (!wp || isNaN(Number(wp.lat)) || isNaN(Number(wp.lng))) return;
      const isStart = i === 0;
      const marker = L.marker([Number(wp.lat), Number(wp.lng)], {
        icon: createSvgTeardropPin(isStart ? 'S' : i, isStart),
        draggable: false, // Map pins are static to prevent accidental relocation on touch
        zIndexOffset: isStart ? 1100 : 1000 - i,
      });

      marker.bindPopup(
        `<div style="font-family:Roboto,sans-serif; padding: 2px;">
          <strong style="color:#ea4335; font-size: 13px;">${isStart ? '🚩 START LOCATION' : `📍 STOP #${i}`}</strong><br/>
          <span style="font-weight: 600; color: #fff; font-size: 13px;">${wp.name || 'Pandal Stop'}</span>
        </div>`
      );

      stopMarkersLayerRef.current.addLayer(marker);
    });
  }, []);

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

    // Compute stable coordinate serialization key
    const currentKey = validWaypoints.map(w => `${Number(w.lat).toFixed(4)},${Number(w.lng).toFixed(4)}`).join('|');
    if (currentKey === lastRenderedKeyRef.current && currentKey !== '') {
      return; // Waypoint coordinates haven't changed, skip re-rendering to prevent any flicker
    }
    lastRenderedKeyRef.current = currentKey;

    // 1. Draw all teardrop markers
    drawStopMarkers(validWaypoints);

    if (validWaypoints.length < 2) {
      if (routeLayerRef.current) routeLayerRef.current.clearLayers();
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

          try {
            map.fitBounds(roadLatLngs, { padding: [55, 55], maxZoom: 15 });
          } catch (_) { }

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
  }, [effectiveWaypoints, drawRouteLines, drawStopMarkers]);

  // ── 3. Current Location: 14px Blue Dot + 2s Pulsing Ring + Accuracy Circle ──
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!myLocation || !myLocation.latitude || !myLocation.longitude) {
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

    const latLng = [myLocation.latitude, myLocation.longitude];

    // Create or update blue dot marker
    if (!myLocationMarkerRef.current) {
      const marker = L.marker(latLng, {
        icon: createMyLocationDivIcon(),
        zIndexOffset: 2000,
      }).addTo(map);
      marker.bindPopup(`<strong>Your Location</strong><br/>Live GPS Position`);
      myLocationMarkerRef.current = marker;
    } else {
      myLocationMarkerRef.current.setLatLng(latLng);
    }

    // Faint accuracy radius circle
    const acc = myLocation.accuracy || 30;
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
  }, [myLocation]);

  // ── 3B. Route from User's Current Location to Starting Point in RED ──
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !userToStartRouteLayerRef.current) return;

    if (!myLocation?.latitude || !myLocation?.longitude || effectiveWaypoints.length === 0) {
      userToStartRouteLayerRef.current.clearLayers();
      return;
    }

    const startPoint = effectiveWaypoints[0];
    if (!startPoint || isNaN(Number(startPoint.lat)) || isNaN(Number(startPoint.lng))) {
      userToStartRouteLayerRef.current.clearLayers();
      return;
    }

    const uLat = Number(myLocation.latitude);
    const uLng = Number(myLocation.longitude);
    const sLat = Number(startPoint.lat);
    const sLng = Number(startPoint.lng);

    // If user is within 35m of start point, no route needed
    const dLat = (sLat - uLat) * 111000;
    const dLng = (sLng - uLng) * 111000 * Math.cos((uLat * Math.PI) / 180);
    const distMeters = Math.sqrt(dLat * dLat + dLng * dLng);

    if (distMeters < 35) {
      userToStartRouteLayerRef.current.clearLayers();
      return;
    }

    // Immediately render straight line while road query resolves
    drawUserToStartRouteLines([[uLat, uLng], [sLat, sLng]]);

    // Fetch turn-by-turn driving road path from User's location to Starting Point
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
        }
      })
      .catch(() => {
        // Keeps fallback straight line
      });
  }, [myLocation?.latitude, myLocation?.longitude, effectiveWaypoints, drawUserToStartRouteLines]);

  // ── 4. Group Members: Circular Avatar Pins + "last updated Xs ago" Tooltip ──
  useEffect(() => {
    if (!membersLayerRef.current) return;
    membersLayerRef.current.clearLayers();

    liveMembers.forEach((m) => {
      // Exclude self since self is the Blue Dot
      if (m.userId === currentUserId || !m.isSharingLocation || !m.latitude || !m.longitude) return;

      const marker = L.marker([m.latitude, m.longitude], {
        icon: createMemberAvatarIcon(m),
        zIndexOffset: 1500,
      });

      // Tooltip showing "last updated Xs ago"
      marker.bindTooltip(
        `<div class="gmaps-tooltip-content">
          <strong>${m.name}</strong><br/>
          <span>${formatUpdatedAgo(m.lastLocationUpdate)}</span>
        </div>`,
        {
          permanent: false,
          direction: 'top',
          offset: [0, -42],
          className: 'gmaps-dark-tooltip',
        }
      );

      marker.bindPopup(
        `<div style="font-family:Roboto,sans-serif;">
          <strong style="color:#8ab4f8;">${m.name}</strong><br/>
          <span style="color:#34a853;">● Sharing live location</span><br/>
          <small style="color:#aaa;">${formatUpdatedAgo(m.lastLocationUpdate)}</small>
        </div>`
      );

      membersLayerRef.current.addLayer(marker);
    });
  }, [liveMembers, currentUserId]);

  // ── 5. Center Target Listener ─────────────────────
  useEffect(() => {
    if (centerTarget && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(centerTarget, 16, { duration: 0.9 });
    }
  }, [centerTarget]);

  // Recenter on My Location
  const handleRecenterMe = () => {
    if (myLocation?.latitude && myLocation?.longitude && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([myLocation.latitude, myLocation.longitude], 16, { duration: 0.8 });
    } else if (waypoints.length > 0 && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([waypoints[0].lat, waypoints[0].lng], 15, { duration: 0.8 });
    }
  };

  // Fit Entire Route Bounds
  const handleFitRoute = () => {
    if (!mapInstanceRef.current || waypoints.length === 0) return;
    const bounds = waypoints.filter((w) => w && w.lat && w.lng).map((w) => [w.lat, w.lng]);
    if (myLocation?.latitude) bounds.push([myLocation.latitude, myLocation.longitude]);
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
