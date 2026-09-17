/**
 * Route Optimizer using Nearest-Neighbor Greedy Algorithm
 * Computes shortest sequential path starting from current location / start point
 * using Haversine straight-line distance.
 */

// Precise Haversine distance formula in kilometers
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return 0;
  }
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Solve Traveling Salesperson subproblem using Nearest-Neighbor greedy heuristic.
 * 1. Start from starting location (e.g. My Location or designated start).
 * 2. Find pandal with shortest distance among all unvisited pandals -> Stop 1.
 * 3. From Stop 1, find nearest remaining unvisited pandal -> Stop 2.
 * 4. Repeat until every pandal is assigned an order.
 *
 * @param {Object} startPoint { name, lat, lng }
 * @param {Array} stops Array of destination pandals [{ id, name, lat, lng, ... }]
 * @returns {Array} Ordered waypoints [startPoint, Stop1, Stop2, ...] with leg distances
 */
export function solveNearestNeighbor(startPoint, stops) {
  if (!stops || stops.length === 0) {
    return startPoint ? [startPoint] : [];
  }

  const validStops = stops.filter((s) => s && !isNaN(Number(s.lat)) && !isNaN(Number(s.lng)));
  if (validStops.length <= 1) {
    const list = startPoint ? [startPoint, ...validStops] : validStops;
    return calculateLegDistances(list);
  }

  const unvisited = validStops.map((s) => ({ ...s, lat: Number(s.lat), lng: Number(s.lng) }));
  const orderedStops = [];

  let currentPos = {
    name: startPoint?.name || 'Starting Point',
    lat: Number(startPoint?.lat || validStops[0].lat),
    lng: Number(startPoint?.lng || validStops[0].lng),
  };

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const d = haversineDistanceKm(
        currentPos.lat,
        currentPos.lng,
        unvisited[i].lat,
        unvisited[i].lng
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    const [nearestStop] = unvisited.splice(nearestIdx, 1);
    orderedStops.push({
      ...nearestStop,
      legDistanceKm: Number(nearestDist.toFixed(2)),
      fromPrevName: currentPos.name,
    });

    currentPos = {
      name: nearestStop.name,
      lat: nearestStop.lat,
      lng: nearestStop.lng,
    };
  }

  const fullList = startPoint ? [startPoint, ...orderedStops] : orderedStops;
  return calculateLegDistances(fullList);
}

/**
 * Recalculate leg and cumulative distances live for any sequence of waypoints
 * (e.g. when the user manually drags to reorder stops).
 *
 * @param {Array} waypoints List of waypoints [Start, Stop 1, Stop 2, ...]
 * @returns {Array} Enriched waypoints with legDistanceKm and cumulativeDistanceKm
 */
export function calculateLegDistances(waypoints) {
  if (!waypoints || waypoints.length === 0) return [];

  let cumulative = 0;
  return waypoints.map((wp, i) => {
    if (i === 0) {
      return {
        ...wp,
        legDistanceKm: 0,
        cumulativeDistanceKm: 0,
      };
    }

    const prev = waypoints[i - 1];
    const leg = haversineDistanceKm(
      Number(prev.lat),
      Number(prev.lng),
      Number(wp.lat),
      Number(wp.lng)
    );
    cumulative += leg;

    return {
      ...wp,
      legDistanceKm: Number(leg.toFixed(2)),
      cumulativeDistanceKm: Number(cumulative.toFixed(2)),
      fromPrevName: prev.name,
    };
  });
}
