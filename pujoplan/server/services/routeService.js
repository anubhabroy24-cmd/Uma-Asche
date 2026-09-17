const axios = require('axios');
const { geocode } = require('./geocodeService');

const ORS_BASE = 'https://api.openrouteservice.org';

/* ─────────────────── Haversine distance ─────── */

function haversine(a, b) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ─────────────────── Nearest-Neighbour TSP ─────────────────── */
// Orders spots so the total travel distance is minimised.

function nearestNeighborTSP(startCoords, spots) {
  const remaining = [...spots];
  const ordered = [];
  let current = startCoords;

  while (remaining.length > 0) {
    let minDist = Infinity;
    let minIdx = 0;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(current, [remaining[i].latitude, remaining[i].longitude]);
      if (d < minDist) { minDist = d; minIdx = i; }
    }
    ordered.push(remaining[minIdx]);
    current = [remaining[minIdx].latitude, remaining[minIdx].longitude];
    remaining.splice(minIdx, 1);
  }

  return ordered;
}

/* ─────────────────── Heuristic-only result ─────────────────── */

function buildHeuristicResult(startCoords, orderedSpots, startName) {
  let totalDist = 0;
  let prev = startCoords;

  const stops = orderedSpots.map((spot, i) => {
    const coords = [spot.latitude, spot.longitude];
    const dist = haversine(prev, coords);
    totalDist += dist;
    prev = coords;

    const minutesFromStart = Math.round((totalDist / 20) * 60); // assume 20 km/h avg
    return {
      order: i + 1,
      spot,
      coords,
      estimatedArrival: `~${minutesFromStart} min from start`,
    };
  });

  const geometry = [
    startCoords,
    ...orderedSpots.map(s => [s.latitude, s.longitude]),
  ];

  return {
    start: { name: startName, coords: startCoords },
    stops,
    totalDistanceKm: Math.round(totalDist * 10) / 10,
    estimatedDurationMin: Math.round((totalDist / 20) * 60),
    geometry,
    source: 'heuristic',
  };
}

/* ─────────────────── ORS Directions ─────────────────── */
// Uses ORS /directions endpoint with our heuristic-ordered waypoints.
// ORS free tier supports this; we skip the Vroom optimiser.

async function generateRoute(startLocation, spots) {
  const startCoords = await geocode(startLocation);

  // Filter and guard spots so only valid coordinates are routed
  const validSpots = (spots || []).filter(s =>
    s &&
    typeof s.latitude === 'number' &&
    typeof s.longitude === 'number' &&
    !isNaN(s.latitude) &&
    !isNaN(s.longitude) &&
    s.latitude !== 0 &&
    s.longitude !== 0
  );

  if (validSpots.length === 0) {
    return buildHeuristicResult(startCoords, [], startLocation);
  }

  // Always apply nearest-neighbour ordering first
  const orderedSpots = nearestNeighborTSP(startCoords, validSpots);

  // 1. First try free public OSRM routing (Zero API key required)
  try {
    const coordsStr = [
      `${startCoords[1]},${startCoords[0]}`,
      ...orderedSpots.map(s => `${s.longitude},${s.latitude}`),
    ].join(';');

    const osrmResp = await axios.get(
      `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`,
      { timeout: 7000 }
    );

    const route = osrmResp.data?.routes?.[0];
    if (route && route.geometry) {
      const geometry = route.geometry.coordinates.map(c => [c[1], c[0]]);
      return {
        start: { name: startLocation, coords: startCoords },
        stops: orderedSpots.map((spot, i) => ({
          order: i + 1,
          spot,
          coords: [spot.latitude, spot.longitude],
          estimatedArrival: `Stop ${i + 1}`,
        })),
        totalDistanceKm: Math.round((route.distance / 1000) * 10) / 10,
        estimatedDurationMin: Math.round(route.duration / 60),
        geometry,
        source: 'osrm_free',
      };
    }
  } catch (osrmErr) {
    console.log('[Route] Public OSRM busy, using built-in heuristic (No API key needed)');
  }

  // 2. Built-in Haversine heuristic fallback (100% offline & zero API key)
  return buildHeuristicResult(startCoords, orderedSpots, startLocation);
}

module.exports = { generateRoute };
