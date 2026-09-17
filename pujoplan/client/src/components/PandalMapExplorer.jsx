/**
 * PandalMapExplorer.jsx — Complete Mapping System Component
 * 
 * Features:
 * 1. Leaflet map with OpenStreetMap tiles
 * 2. Pandal dataset visualization with custom festive teardrop icons
 * 3. Overpass API integration for nearby amenities within 800m
 * 4. Toggleable amenity layers (Restaurants, Bars, Toilets, Bus Stops, Metro/Rail)
 * 5. OpenRouteService foot-walking directions with distance & duration display
 * 6. Graceful geolocation fallback (click map to set start point)
 * 7. In-memory caching and loading state management
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Navigation,
  Compass,
  Layers,
  X,
  Loader2,
  AlertCircle,
  Footprints,
  Clock,
  LocateFixed,
} from 'lucide-react';
import { fetchNearbyAmenities, AMENITY_CATEGORIES } from '../services/amenitiesService';
import { getWalkingRoute, getCurrentLocation } from '../services/routingService';
import './PandalMapExplorer.css';

// Fix Vite Leaflet marker icon asset resolution
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Sample Kolkata Pandal Dataset Fallback
const DEFAULT_PANDALS = [
  {
    id: 'bagbazar-sarbojanin',
    name: 'Bagbazar Sarbojanin Durgotsav',
    address: 'Bagbazar, North Kolkata, West Bengal 700003',
    lat: 22.6025,
    lng: 88.3688,
    category: 'Heritage',
  },
  {
    id: 'ahiritola-sarbojanin',
    name: 'Ahiritola Sarbojanin Durgotsab',
    address: 'Ahiritola, BK Paul Ave, Kolkata 700005',
    lat: 22.5938,
    lng: 88.3582,
    category: 'Traditional',
  },
  {
    id: 'kumartuli-park',
    name: 'Kumartuli Park Sarbojanin',
    address: 'Kumartuli, Hatkhola, Kolkata 700005',
    lat: 22.5992,
    lng: 88.3664,
    category: 'Theme',
  },
  {
    id: 'sovabazar-rajbari',
    name: 'Sovabazar Rajbari Durga Puja',
    address: '36 & 33 Raja Nabakrishna Street, Kolkata 700005',
    lat: 22.5962,
    lng: 88.3653,
    category: 'Heritage',
  },
  {
    id: 'sree-bhumi',
    name: 'Sree Bhumi Sporting Club',
    address: 'Lake Town, VIP Road, Kolkata 700089',
    lat: 22.5996,
    lng: 88.3986,
    category: 'Grand Theme',
  },
  {
    id: 'ekdalia-evergreen',
    name: 'Ekdalia Evergreen Club',
    address: 'Gariahat, South Kolkata, West Bengal 700019',
    lat: 22.5186,
    lng: 88.3657,
    category: 'Traditional',
  },
  {
    id: 'ballygunge-cultural',
    name: 'Ballygunge Cultural Association',
    address: 'Ballygunge, Kolkata 700029',
    lat: 22.5255,
    lng: 88.3601,
    category: 'Theme',
  },
  {
    id: 'singhi-park',
    name: 'Singhi Park Sarbojanin',
    address: 'Dover Lane, Ballygunge, Kolkata 700029',
    lat: 22.5209,
    lng: 88.3642,
    category: 'Traditional',
  },
  {
    id: 'suruchi-sangha',
    name: 'Suruchi Sangha',
    address: 'New Alipore, Kolkata 700053',
    lat: 22.5085,
    lng: 88.3341,
    category: 'Theme',
  },
  {
    id: 'chetla-agrani',
    name: 'Chetla Agrani Club',
    address: 'Peary Mohan Roy Road, Chetla, Kolkata 700027',
    lat: 22.5201,
    lng: 88.3418,
    category: 'Theme',
  },
];

/**
 * Creates custom festive SVG teardrop pin for Pandals
 */
function createPandalIcon(label = '🕉️') {
  return L.divIcon({
    className: 'pandal-marker-icon-wrapper',
    html: `
      <div class="pandal-marker-icon">
        <svg viewBox="0 0 36 48" width="34" height="46">
          <defs>
            <radialGradient id="pandalGrad" cx="30%" cy="30%" r="70%">
              <stop offset="0%" stop-color="#FFDD00"/>
              <stop offset="100%" stop-color="#D9381E"/>
            </radialGradient>
            <filter id="pandalShadow" x="-20%" y="-10%" width="140%" height="130%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.5"/>
            </filter>
          </defs>
          <path d="M18 0C8.06 0 0 8.06 0 18c0 12.6 16.3 30 17.05 30.8a1.3 1.3 0 0 0 1.9 0C19.7 48 36 30.6 36 18 36 8.06 27.94 0 18 0z"
                fill="url(#pandalGrad)" filter="url(#pandalShadow)"/>
          <circle cx="18" cy="18" r="10" fill="#ffffff"/>
          <text x="18" y="22" font-size="12" text-anchor="middle">${label}</text>
        </svg>
      </div>
    `,
    iconSize: [34, 46],
    iconAnchor: [17, 45],
    popupAnchor: [0, -44],
  });
}

/**
 * Creates custom categorized round icon for amenities
 */
function createAmenityIcon(icon, color) {
  return L.divIcon({
    className: 'amenity-pin-wrapper',
    html: `
      <div class="amenity-pin-icon" style="background-color: ${color};">
        <span>${icon}</span>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

/**
 * User location pulsing dot
 */
function createUserLocationIcon() {
  return L.divIcon({
    className: 'user-location-wrapper',
    html: `
      <div class="user-dot-pulse">
        <div class="user-dot-ring"></div>
        <div class="user-dot-core"></div>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

export default function PandalMapExplorer({
  pandals = DEFAULT_PANDALS,
  initialCenter = [22.5726, 88.3639], // Central Kolkata
  initialZoom = 13,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const pandalsLayerRef = useRef(null);
  const amenitiesLayerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const userMarkerRef = useRef(null);

  // Active state
  const [selectedPandal, setSelectedPandal] = useState(null);
  const [activeAmenityPandal, setActiveAmenityPandal] = useState(null);
  const [amenitiesData, setAmenitiesData] = useState([]);
  const [activeCategories, setActiveCategories] = useState({
    restaurant: true,
    bar: true,
    toilets: true,
    bus_stop: true,
    station: true,
  });

  // Routing state
  const [routeInfo, setRouteInfo] = useState(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const [isAmenitiesLoading, setIsAmenitiesLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [isPickingStartPoint, setIsPickingStartPoint] = useState(false);
  const [pendingRoutePandal, setPendingRoutePandal] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = useCallback((text, isError = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: false,
    });

    // Add Standard OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Zoom controls at top right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Layer groups
    pandalsLayerRef.current = L.layerGroup().addTo(map);
    amenitiesLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    // Handle map click for manual start point picking
    map.on('click', (e) => {
      if (isPickingStartPoint && pendingRoutePandal) {
        handleManualStartPick([e.latlng.lat, e.latlng.lng]);
      }
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Render Pandal Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !pandalsLayerRef.current) return;

    pandalsLayerRef.current.clearLayers();

    pandals.forEach((pandal) => {
      const lat = pandal.latitude || pandal.lat;
      const lng = pandal.longitude || pandal.lng;
      if (!lat || !lng) return;

      const marker = L.marker([lat, lng], {
        icon: createPandalIcon(),
        title: pandal.name,
      });

      // Custom Popup HTML
      const popupDiv = document.createElement('div');
      popupDiv.className = 'pandal-popup-content';
      popupDiv.innerHTML = `
        <div class="pandal-popup-title">${pandal.name}</div>
        <div class="pandal-popup-address">📍 ${pandal.address || pandal.area || 'Kolkata'}</div>
        <div class="pandal-popup-actions">
          <button class="popup-btn popup-btn-nearby" id="btn-nearby-${pandal.id || pandal.name}">
            🔍 Find Nearby Amenities (800m)
          </button>
          <button class="popup-btn popup-btn-directions" id="btn-route-${pandal.id || pandal.name}">
            🚶 Walking Directions
          </button>
          <a class="popup-btn" style="background:#1a73e8; color:#fff; text-decoration:none; text-align:center; display:flex; align-items:center; justify-content:center; gap:5px; font-weight:600; margin-top:4px;"
             href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}"
             target="_blank" rel="noopener noreferrer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            Open in Google Maps
          </a>
        </div>
      `;

      // Attach event listeners to popup buttons
      marker.bindPopup(popupDiv, { maxWidth: 280 });
      marker.on('popupopen', () => {
        const btnNearby = document.getElementById(`btn-nearby-${pandal.id || pandal.name}`);
        const btnRoute = document.getElementById(`btn-route-${pandal.id || pandal.name}`);

        if (btnNearby) {
          btnNearby.onclick = () => {
            handleFindNearby(pandal);
            marker.closePopup();
          };
        }
        if (btnRoute) {
          btnRoute.onclick = () => {
            handleGetDirections(pandal);
            marker.closePopup();
          };
        }
      });

      marker.addTo(pandalsLayerRef.current);
    });
  }, [pandals]);

  // 3. Find Nearby Amenities (800m Overpass API)
  const handleFindNearby = async (pandal) => {
    const lat = pandal.latitude || pandal.lat;
    const lng = pandal.longitude || pandal.lng;

    setSelectedPandal(pandal);
    setActiveAmenityPandal(pandal);
    setIsAmenitiesLoading(true);

    try {
      const { data, fromCache } = await fetchNearbyAmenities(lat, lng, 800, pandal.id);
      setAmenitiesData(data);

      if (data.length === 0) {
        showToast(`No amenities found within 800m of ${pandal.name}`);
      } else {
        showToast(
          `Found ${data.length} places around ${pandal.name} ${fromCache ? '(Cached)' : ''}`
        );
      }

      // Pan to pandal
      mapInstanceRef.current?.setView([lat, lng], 15, { animate: true });
    } catch (err) {
      showToast(err.message || 'Error fetching nearby amenities', true);
    } finally {
      setIsAmenitiesLoading(false);
    }
  };

  // 4. Update Amenity Markers based on active toggleable categories
  useEffect(() => {
    if (!amenitiesLayerRef.current) return;
    amenitiesLayerRef.current.clearLayers();

    if (!amenitiesData || amenitiesData.length === 0) return;

    amenitiesData.forEach((item) => {
      // Check if category is enabled in filter
      if (!activeCategories[item.category]) return;

      const marker = L.marker([item.lat, item.lng], {
        icon: createAmenityIcon(item.icon, item.color),
        title: item.name,
      });

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 0.85rem;">
          <strong style="color: ${item.color};">${item.icon} ${item.categoryLabel}</strong>
          <div style="font-size: 0.95rem; font-weight: 700; margin: 4px 0;">${item.name}</div>
          <div style="font-size: 0.75rem; color: #888;">Distance ~800m from ${activeAmenityPandal?.name || 'Pandal'}</div>
        </div>
      `);

      marker.addTo(amenitiesLayerRef.current);
    });
  }, [amenitiesData, activeCategories, activeAmenityPandal]);

  // 5. Routing (OpenRouteService walking profile)
  const handleGetDirections = async (pandal) => {
    const destLat = pandal.latitude || pandal.lat;
    const destLng = pandal.longitude || pandal.lng;
    const dest = [destLat, destLng];

    setIsRoutingLoading(true);

    try {
      // Attempt to retrieve user geolocation
      let start = userLocation;
      if (!start) {
        const loc = await getCurrentLocation();
        start = [loc.lat, loc.lng];
        setUserLocation(start);

        // Plot user location marker
        if (mapInstanceRef.current) {
          if (userMarkerRef.current) mapInstanceRef.current.removeLayer(userMarkerRef.current);
          userMarkerRef.current = L.marker(start, { icon: createUserLocationIcon() }).addTo(
            mapInstanceRef.current
          );
        }
      }

      await executeRoute(start, dest, pandal.name);
    } catch (err) {
      // Graceful fallback for permission denial: ask user to tap on map
      showToast('Location permission denied. Click anywhere on the map to set your start point.', true);
      setPendingRoutePandal(pandal);
      setIsPickingStartPoint(true);
    } finally {
      setIsRoutingLoading(false);
    }
  };

  // Fallback manual start point execution
  const handleManualStartPick = async (startCoords) => {
    setIsPickingStartPoint(false);
    setUserLocation(startCoords);

    if (mapInstanceRef.current) {
      if (userMarkerRef.current) mapInstanceRef.current.removeLayer(userMarkerRef.current);
      userMarkerRef.current = L.marker(startCoords, { icon: createUserLocationIcon() }).addTo(
        mapInstanceRef.current
      );
    }

    if (pendingRoutePandal) {
      const destLat = pendingRoutePandal.latitude || pendingRoutePandal.lat;
      const destLng = pendingRoutePandal.longitude || pendingRoutePandal.lng;
      await executeRoute(startCoords, [destLat, destLng], pendingRoutePandal.name);
      setPendingRoutePandal(null);
    }
  };

  // Draw walking route & display summary
  const executeRoute = async (start, dest, destName) => {
    setIsRoutingLoading(true);
    try {
      const route = await getWalkingRoute(start, dest);

      if (routeLayerRef.current) {
        routeLayerRef.current.clearLayers();

        // White base underlay (10px)
        L.polyline(route.coordinates, {
          color: '#ffffff',
          weight: 9,
          opacity: 0.9,
          lineCap: 'round',
        }).addTo(routeLayerRef.current);

        // Vibrant Blue Top Line (5px)
        L.polyline(route.coordinates, {
          color: '#1a73e8',
          weight: 5,
          opacity: 1,
          lineCap: 'round',
        }).addTo(routeLayerRef.current);

        // Fit map bounds to route
        mapInstanceRef.current?.fitBounds(route.coordinates, { padding: [60, 60] });
      }

      setRouteInfo({
        destinationName: destName,
        distance: route.formattedDistance,
        duration: route.formattedDuration,
      });

      showToast(`Walking route calculated: ${route.formattedDistance} (${route.formattedDuration})`);
    } catch (err) {
      showToast(err.message || 'Failed to calculate walking route', true);
    } finally {
      setIsRoutingLoading(false);
    }
  };

  const clearRoute = () => {
    if (routeLayerRef.current) routeLayerRef.current.clearLayers();
    setRouteInfo(null);
  };

  const clearAmenities = () => {
    if (amenitiesLayerRef.current) amenitiesLayerRef.current.clearLayers();
    setActiveAmenityPandal(null);
    setAmenitiesData([]);
  };

  const toggleCategory = (catId) => {
    setActiveCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  return (
    <div className="pandal-explorer-container">
      {/* Map Element */}
      <div ref={mapContainerRef} className="pandal-explorer-map" />

      {/* Floating Header UI */}
      <div className="pandal-explorer-header">
        <div className="pandal-header-card">
          <div className="pandal-header-title">
            <span>🪔</span>
            <span>Kolkata Durga Puja & Amenities Map</span>
          </div>

          <div className="pandal-header-actions">
            {(isAmenitiesLoading || isRoutingLoading) && (
              <Loader2 size={18} className="animate-spin text-yellow-400" />
            )}
            {activeAmenityPandal && (
              <button
                className="btn-clear-amenities"
                onClick={clearAmenities}
                title="Clear amenities layer"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: '#fff',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Clear Amenities
              </button>
            )}
          </div>
        </div>

        {/* Toggleable Amenities Categories Bar */}
        {activeAmenityPandal && (
          <div className="amenities-filter-bar">
            <span style={{ fontSize: '0.75rem', color: '#ffcc00', fontWeight: 700, paddingRight: '4px' }}>
              Near {activeAmenityPandal.name.split(' ')[0]}:
            </span>
            {Object.values(AMENITY_CATEGORIES).map((cat) => {
              const count = amenitiesData.filter((a) => a.category === cat.id).length;
              const isActive = activeCategories[cat.id];
              return (
                <button
                  key={cat.id}
                  className={`amenity-chip-btn ${isActive ? 'active' : ''}`}
                  onClick={() => toggleCategory(cat.id)}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span className="amenity-chip-count">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Start Point Manual Picker Prompt */}
      {isPickingStartPoint && (
        <div className="start-picker-banner">
          <LocateFixed size={16} />
          <span>Tap anywhere on the map to set your starting location</span>
          <button
            onClick={() => setIsPickingStartPoint(false)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Walking Route Floating Info Card */}
      {routeInfo && (
        <div className="route-info-card">
          <div className="route-stat">
            <span className="route-stat-label">Destination</span>
            <span className="route-stat-val" style={{ fontSize: '0.95rem' }}>
              {routeInfo.destinationName}
            </span>
          </div>

          <div className="route-stat">
            <span className="route-stat-label">Walking Distance</span>
            <span className="route-stat-val">{routeInfo.distance}</span>
          </div>

          <div className="route-stat">
            <span className="route-stat-label">Est. Time</span>
            <span className="route-stat-val" style={{ color: '#4285F4' }}>
              {routeInfo.duration}
            </span>
          </div>

          <button className="route-close-btn" onClick={clearRoute} title="Close Route">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`explorer-toast ${toastMessage.isError ? 'error' : ''}`}>
          {toastMessage.text}
        </div>
      )}
    </div>
  );
}
