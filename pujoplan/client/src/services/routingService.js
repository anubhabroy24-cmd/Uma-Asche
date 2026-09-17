/**
 * routingService.js — OpenRouteService Walking Directions Service
 * 
 * Profile: foot-walking
 * Endpoint: /v2/directions/foot-walking/geojson
 * 
 * Responsibilities:
 * - Fetches walking directions between start [lat, lng] and destination [lat, lng]
 * - Formats distance (meters -> km/m) and duration (seconds -> mins/hours)
 * - Safe user geolocation helper with permission handling
 */

import { ORS_CONFIG } from '../config/orsConfig';

/**
 * Format meters to human readable distance (e.g. "450 m" or "1.8 km")
 */
export function formatDistance(meters) {
  if (meters == null || isNaN(meters)) return '--';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Format seconds to human readable duration (e.g. "12 mins" or "1 hr 15 mins")
 */
export function formatDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return '--';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'}`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs} hr${hrs > 1 ? 's' : ''} ${remMins} min${remMins === 1 ? '' : 's'}`;
}

/**
 * Get current browser geolocation with automatic fallback
 * @returns {Promise<{lat: number, lng: number, accuracy: number}>}
 */
export function getCurrentLocation(options = { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }) {
  return getReliableCurrentLocation();
}

/**
 * Robust multi-tier location retriever:
 * 1. High accuracy GPS (short timeout 3.5s)
 * 2. Low accuracy WiFi/Cell network (short timeout 3.5s)
 * 3. IP-based location fallback (ipinfo.io / ipapi.co)
 * 4. Safe default Kolkata coordinates
 */
export async function getReliableCurrentLocation(defaultCoords = { lat: 22.5726, lng: 88.3639 }) {
  // Tier 1: Try browser geolocation with high accuracy
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 3500,
          maximumAge: 10000,
        });
      });
      if (pos?.coords?.latitude && pos?.coords?.longitude) {
        return {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 20,
          source: 'gps',
        };
      }
    } catch (_) {
      // Tier 2: Try low accuracy network geolocation (often works when GPS times out)
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 3500,
            maximumAge: 60000,
          });
        });
        if (pos?.coords?.latitude && pos?.coords?.longitude) {
          return {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy || 100,
            source: 'network',
          };
        }
      } catch (_) {}
    }
  }

  // Tier 3: IP-based geolocation (reliable for desktops / laptops / emulators)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch('https://ipinfo.io/json', { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data.loc) {
        const [latStr, lngStr] = data.loc.split(',');
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        if (!isNaN(lat) && !isNaN(lng)) {
          return {
            lat,
            lng,
            accuracy: 1500,
            city: data.city,
            source: 'ip',
          };
        }
      }
    }
  } catch (_) {}

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data.latitude && data.longitude) {
        return {
          lat: parseFloat(data.latitude),
          lng: parseFloat(data.longitude),
          accuracy: 2000,
          city: data.city,
          source: 'ip',
        };
      }
    }
  } catch (_) {}

  // Tier 4: Fallback coordinates (Kolkata)
  return {
    lat: defaultCoords.lat || 22.5726,
    lng: defaultCoords.lng || 88.3639,
    accuracy: 3000,
    source: 'fallback',
  };
}

/**
 * Fetch walking route from OpenRouteService
 * @param {[number, number]} start - [latitude, longitude]
 * @param {[number, number]} destination - [latitude, longitude]
 * @returns {Promise<{coordinates: Array<[number, number]>, distance: number, duration: number, formattedDistance: string, formattedDuration: string}>}
 */
export async function getWalkingRoute(start, destination) {
  if (!start || !destination) {
    throw new Error('Start and destination coordinates are required for directions');
  }

  const apiKey = ORS_CONFIG.apiKey;
  if (!apiKey) {
    throw new Error('OpenRouteService API key is missing. Please check your configuration.');
  }

  // ORS expects [longitude, latitude] in query params or GeoJSON
  const startLngLat = `${start[1]},${start[0]}`;
  const destLngLat = `${destination[1]},${destination[0]}`;
  const url = `${ORS_CONFIG.baseUrl}?api_key=${apiKey}&start=${startLngLat}&end=${destLngLat}`;

  const response = await fetch(url);
  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    const msg = errorJson.error?.message || `Routing API error (${response.status})`;
    throw new Error(msg);
  }

  const geojson = await response.json();
  const feature = geojson.features?.[0];

  if (!feature || !feature.geometry?.coordinates) {
    throw new Error('No walking route could be found between these locations');
  }

  // Convert ORS [lng, lat] to Leaflet [lat, lng]
  const coordinates = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]);
  const summary = feature.properties?.summary || {};
  const distance = summary.distance || 0; // meters
  const duration = summary.duration || 0; // seconds

  return {
    coordinates,
    distance,
    duration,
    formattedDistance: formatDistance(distance),
    formattedDuration: formatDuration(duration),
  };
}
