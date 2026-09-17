/**
 * orsConfig.js — Configuration for OpenRouteService
 * 
 * Keep your API key here or load from environment variables (VITE_ORS_API_KEY).
 * Do NOT commit personal API keys to public repositories.
 */

export const ORS_CONFIG = {
  // Replace with your OpenRouteService API key or set VITE_ORS_API_KEY in .env
  apiKey: import.meta.env?.VITE_ORS_API_KEY || '5b3ce3597851110001cf6248a23da4c89b07425483d1c6e5ecf7c8f2',
  baseUrl: 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson',
  profile: 'foot-walking',
};
