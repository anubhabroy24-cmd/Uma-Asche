/**
 * script.js — Nearby Finder core logic
 *
 * Leaflet map  →  OpenStreetMap tiles (dark via CSS)
 * Overpass API →  fetch nearby amenities (zero API key)
 * ORS API      →  walking directions (key from config.js)
 */

/* ═══════════════════════════════════════════════════
   1.  DOM REFERENCES
   ═══════════════════════════════════════════════════ */
const $map            = document.getElementById('map');
const $loadingOverlay = document.getElementById('loading-overlay');
const $toast          = document.getElementById('toast');
const $chipsRow       = document.getElementById('chips-row');
const $routePanel     = document.getElementById('route-panel');
const $routeDistance   = document.getElementById('route-distance');
const $routeDuration   = document.getElementById('route-duration');
const $routeCloseBtn   = document.getElementById('route-close-btn');
const $recenterBtn     = document.getElementById('recenter-btn');

/* ═══════════════════════════════════════════════════
   2.  STATE
   ═══════════════════════════════════════════════════ */
let map;                     // Leaflet map instance
let userLatLng = null;       // [lat, lng] from browser geolocation
let userMarker = null;       // Leaflet marker for blue dot
let poiLayerGroup;           // LayerGroup holding current search markers
let routeLayerGroup;         // LayerGroup holding the route polyline
let activeCategory = null;   // currently selected chip key

/* Overpass tag mapping per category */
const CATEGORY_TAGS = {
  restaurant: { key: 'amenity',  value: 'restaurant' },
  bar:        { key: 'amenity',  value: 'bar'        },
  toilets:    { key: 'amenity',  value: 'toilets'    },
  bus_stop:   { key: 'highway',  value: 'bus_stop'   },
  station:    { key: 'railway',  value: 'station'    },
};

/* Emoji lookup for marker pins */
const CATEGORY_EMOJI = {
  restaurant: '🍽️',
  bar:        '🍺',
  toilets:    '🚻',
  bus_stop:   '🚌',
  station:    '🚇',
};

/* Human-readable labels */
const CATEGORY_LABEL = {
  restaurant: 'Restaurant',
  bar:        'Bar',
  toilets:    'Public Toilet',
  bus_stop:   'Bus Stop',
  station:    'Metro / Railway Station',
};

/* ═══════════════════════════════════════════════════
   3.  HELPERS — UI
   ═══════════════════════════════════════════════════ */

/** Show / hide the full-screen loading spinner */
function showLoading(text) {
  $loadingOverlay.querySelector('.loading-text').textContent = text || 'Searching nearby…';
  $loadingOverlay.classList.remove('hidden');
}
function hideLoading() {
  $loadingOverlay.classList.add('hidden');
}

/** Show a toast message; auto-dismiss after `ms` */
function showToast(msg, ms = 4000, type = 'error') {
  $toast.textContent = msg;
  $toast.className = 'toast' + (type === 'info' ? ' toast-info' : '');
  $toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => $toast.classList.add('hidden'), ms);
}

/* ═══════════════════════════════════════════════════
   4.  MAP INITIALISATION
   ═══════════════════════════════════════════════════ */

function initMap(center) {
  map = L.map('map', {
    center,
    zoom: 15,
    zoomControl: false,
  });

  // OpenStreetMap tiles (100% free, no API key, darkened via CSS filter)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  // Zoom control → top-right
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Persistent layer groups
  poiLayerGroup   = L.layerGroup().addTo(map);
  routeLayerGroup = L.layerGroup().addTo(map);

  // Place the user's blue dot if we have coords
  if (userLatLng) {
    placeUserDot(userLatLng);
  }
}

/** Animated pulsing blue dot for "my location" */
function placeUserDot(latlng) {
  if (userMarker) {
    userMarker.setLatLng(latlng);
    return;
  }
  const icon = L.divIcon({
    className: 'custom-marker-icon',
    html: `
      <div class="user-dot-wrapper">
        <div class="user-pulse"></div>
        <div class="user-dot"></div>
      </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  userMarker = L.marker(latlng, { icon, zIndexOffset: 2000, interactive: false }).addTo(map);
}

/* ═══════════════════════════════════════════════════
   5.  GEOLOCATION
   ═══════════════════════════════════════════════════ */

function geolocate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      showToast('Geolocation not supported — defaulting to Kolkata.', 3500, 'info');
      resolve(CONFIG.DEFAULT_CENTER);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
      () => {
        showToast('Location access denied — defaulting to Kolkata.', 3500, 'info');
        resolve(CONFIG.DEFAULT_CENTER);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });
}

/* ═══════════════════════════════════════════════════
   6.  OVERPASS QUERY
   ═══════════════════════════════════════════════════ */

/**
 * Query Overpass for POIs of `category` within `radius` metres of `center`.
 * Returns an array of { name, lat, lon }.
 */
async function queryOverpass(category, center, radius) {
  const tag = CATEGORY_TAGS[category];
  if (!tag) throw new Error('Unknown category');

  // Overpass QL: search for nodes and ways with the given tag around the center
  const query = `
    [out:json][timeout:15];
    (
      node["${tag.key}"="${tag.value}"](around:${radius},${center[0]},${center[1]});
      way["${tag.key}"="${tag.value}"](around:${radius},${center[0]},${center[1]});
    );
    out center body;
  `;

  const resp = await fetch(CONFIG.OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
  });

  if (!resp.ok) {
    throw new Error(`Overpass returned HTTP ${resp.status}`);
  }

  const data = await resp.json();

  return (data.elements || []).map((el) => ({
    name: el.tags?.name || 'Unnamed',
    lat:  el.lat  ?? el.center?.lat,
    lon:  el.lon  ?? el.center?.lon,
  })).filter((p) => p.lat != null && p.lon != null);
}

/* ═══════════════════════════════════════════════════
   7.  PLOT MARKERS
   ═══════════════════════════════════════════════════ */

function plotPOIs(places, category) {
  // Clear previous markers
  poiLayerGroup.clearLayers();

  if (places.length === 0) {
    showToast(`No ${CATEGORY_LABEL[category] || 'places'} found within 1.5 km.`, 3500, 'info');
    return;
  }

  places.forEach((place) => {
    const icon = L.divIcon({
      className: 'custom-marker-icon',
      html: `
        <div class="marker-pin cat-${category}">
          <span class="marker-pin-inner">${CATEGORY_EMOJI[category] || '📍'}</span>
        </div>`,
      iconSize: [34, 42],
      iconAnchor: [17, 42],
      popupAnchor: [0, -40],
    });

    const marker = L.marker([place.lat, place.lon], { icon }).addTo(poiLayerGroup);

    // Build popup with "Directions" button
    const popupHtml = `
      <div class="popup-body">
        <div class="popup-name">${escapeHtml(place.name)}</div>
        <div class="popup-category">${CATEGORY_LABEL[category] || category}</div>
        <button class="popup-dir-btn" onclick="getDirections(${place.lat}, ${place.lon})">
          🚶 Directions from my location
        </button>
      </div>`;

    marker.bindPopup(popupHtml, { maxWidth: 260 });
  });

  showToast(`Found ${places.length} ${CATEGORY_LABEL[category] || 'places'} nearby.`, 3000, 'info');
}

/** Minimal HTML escape */
function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

/* ═══════════════════════════════════════════════════
   8.  ORS DIRECTIONS
   ═══════════════════════════════════════════════════ */

/**
 * Fetch walking route from user's location to [destLat, destLon]
 * via OpenRouteService and draw it on the map.
 */
async function getDirections(destLat, destLon) {
  if (!userLatLng) {
    showToast('Your location is unknown — cannot route.', 3500);
    return;
  }

  // Close any open popup so the route panel is visible
  map.closePopup();
  showLoading('Calculating walking route…');

  try {
    const resp = await fetch(CONFIG.ORS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: CONFIG.ORS_API_KEY,
      },
      body: JSON.stringify({
        coordinates: [
          [userLatLng[1], userLatLng[0]],   // ORS expects [lng, lat]
          [destLon, destLat],
        ],
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`ORS ${resp.status}: ${errBody.slice(0, 120)}`);
    }

    const data = await resp.json();
    const route = data.routes?.[0];
    if (!route) throw new Error('No route returned from ORS.');

    // Decode the geometry (encoded polyline)
    const coords = decodePolyline(route.geometry);

    // Draw stacked polylines: white base + blue top
    routeLayerGroup.clearLayers();
    L.polyline(coords, { color: '#ffffff', weight: 8,  opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(routeLayerGroup);
    L.polyline(coords, { color: '#4285F4', weight: 5,  opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(routeLayerGroup);

    // Fit map to route
    map.fitBounds(L.polyline(coords).getBounds(), { padding: [60, 60] });

    // Show route panel with distance & duration
    const summary = route.summary;
    const distKm  = (summary.distance / 1000).toFixed(1);
    const durMin  = Math.round(summary.duration / 60);
    $routeDistance.textContent = `${distKm} km`;
    $routeDuration.textContent = `${durMin} min`;
    $routePanel.classList.remove('hidden');

  } catch (err) {
    console.error('ORS error:', err);
    showToast(`Route failed: ${err.message}`, 5000);
  } finally {
    hideLoading();
  }
}

/**
 * Decode an encoded polyline string (Google Polyline Algorithm)
 * into an array of [lat, lng] pairs.
 */
function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/* ═══════════════════════════════════════════════════
   9.  EVENT HANDLERS
   ═══════════════════════════════════════════════════ */

/** Category chip click */
$chipsRow.addEventListener('click', async (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;

  const category = chip.dataset.category;

  // Toggle off if same chip is clicked again
  if (activeCategory === category) {
    chip.classList.remove('active');
    activeCategory = null;
    poiLayerGroup.clearLayers();
    return;
  }

  // Set active chip
  document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
  chip.classList.add('active');
  activeCategory = category;

  // Clear old results and route
  poiLayerGroup.clearLayers();
  clearRoute();

  // Get current map center for the search
  const center = map.getCenter();
  const searchCenter = [center.lat, center.lng];

  showLoading(`Finding ${CATEGORY_LABEL[category] || 'places'}…`);

  try {
    const results = await queryOverpass(category, searchCenter, CONFIG.DEFAULT_RADIUS_M);
    plotPOIs(results, category);
  } catch (err) {
    console.error('Overpass error:', err);
    showToast(`Search failed: ${err.message}`, 5000);
  } finally {
    hideLoading();
  }
});

/** Close route panel */
$routeCloseBtn.addEventListener('click', clearRoute);

function clearRoute() {
  routeLayerGroup.clearLayers();
  $routePanel.classList.add('hidden');
}

/** Recenter FAB */
$recenterBtn.addEventListener('click', () => {
  if (userLatLng && map) {
    map.flyTo(userLatLng, 15, { duration: 0.8 });
  }
});

/* ═══════════════════════════════════════════════════
   10. BOOT
   ═══════════════════════════════════════════════════ */

(async function boot() {
  showLoading('Locating you…');

  userLatLng = await geolocate();
  initMap(userLatLng);
  placeUserDot(userLatLng);

  hideLoading();
})();
