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
 * Get current browser geolocation
 * @returns {Promise<{lat: number, lng: number, accuracy: number}>}
 */
export function getCurrentLocation(options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      err => {
        let message = 'Unable to retrieve location';
        if (err.code === 1) message = 'Location permission was denied.';
        else if (err.code === 2) message = 'Position unavailable.';
        else if (err.code === 3) message = 'Location request timed out.';
        reject(new Error(message));
      },
      options
    );
  });
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
