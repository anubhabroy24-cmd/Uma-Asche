/**
 * config.js — API keys & configuration
 * Swap out the ORS key here without touching any other file.
 */
const CONFIG = {
  ORS_API_KEY:
    '5b3ce3597851110001cf6248a23da4c89b07425483d1c6e5ecf7c8f2',
  ORS_ENDPOINT:
    'https://api.openrouteservice.org/v2/directions/foot-walking',
  OVERPASS_ENDPOINT:
    'https://overpass-api.de/api/interpreter',
  DEFAULT_RADIUS_M: 1500,          // 1.5 km search radius
  DEFAULT_CENTER: [22.5726, 88.3639], // Kolkata fallback
};
