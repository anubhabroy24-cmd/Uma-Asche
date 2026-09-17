/**
 * amenitiesService.js — Overpass API Service for Nearby Amenities
 * 
 * Fetches:
 * - Restaurants (amenity=restaurant)
 * - Bars (amenity=bar)
 * - Public Toilets (amenity=toilets)
 * - Bus Stops (highway=bus_stop)
 * - Metro / Railway Stations (railway=station)
 * 
 * Features:
 * - 800m bounding search radius around any Pandal coordinate
 * - In-memory cache per coordinate/pandal to prevent redundant network queries
 * - Error handling for network limits and timeouts
 */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter'
];

// In-memory cache: key = `${lat.toFixed(4)}_${lng.toFixed(4)}_${radius}` -> result array
const amenityCache = new Map();

/**
 * Category metadata with display labels, icons, and colors
 */
export const AMENITY_CATEGORIES = {
  restaurant: {
    id: 'restaurant',
    label: 'Restaurants',
    icon: '🍽️',
    color: '#FF6B6B',
    bgColor: 'rgba(255, 107, 107, 0.15)',
    filter: 'node["amenity"="restaurant"]',
  },
  bar: {
    id: 'bar',
    label: 'Bars & Pubs',
    icon: '🍸',
    color: '#9B51E0',
    bgColor: 'rgba(155, 81, 224, 0.15)',
    filter: 'node["amenity"="bar"]',
  },
  toilets: {
    id: 'toilets',
    label: 'Public Toilets',
    icon: '🚻',
    color: '#2D9CDB',
    bgColor: 'rgba(45, 156, 219, 0.15)',
    filter: 'node["amenity"="toilets"]',
  },
  bus_stop: {
    id: 'bus_stop',
    label: 'Bus Stops',
    icon: '🚏',
    color: '#F2994A',
    bgColor: 'rgba(242, 153, 74, 0.15)',
    filter: 'node["highway"="bus_stop"]',
  },
  station: {
    id: 'station',
    label: 'Metro & Railway',
    icon: '🚇',
    color: '#27AE60',
    bgColor: 'rgba(39, 174, 96, 0.15)',
    filter: 'node["railway"="station"]',
  },
};

/**
 * Build Overpass QL query string
 */
function buildOverpassQuery(lat, lng, radius = 800) {
  return `
    [out:json][timeout:25];
    (
      node["amenity"="restaurant"](around:${radius},${lat},${lng});
      node["amenity"="bar"](around:${radius},${lat},${lng});
      node["amenity"="toilets"](around:${radius},${lat},${lng});
      node["highway"="bus_stop"](around:${radius},${lat},${lng});
      node["railway"="station"](around:${radius},${lat},${lng});
      node["railway"="subway_entrance"](around:${radius},${lat},${lng});
    );
    out body;
    >;
    out skel qt;
  `.trim();
}

/**
 * Classify OSM element into our standard amenity category
 */
function categorizeElement(tags = {}) {
  if (tags.amenity === 'restaurant') return 'restaurant';
  if (tags.amenity === 'bar' || tags.amenity === 'pub') return 'bar';
  if (tags.amenity === 'toilets') return 'toilets';
  if (tags.highway === 'bus_stop') return 'bus_stop';
  if (tags.railway === 'station' || tags.railway === 'subway_entrance' || tags.station === 'subway') return 'station';
  return 'other';
}

/**
 * Fetch nearby amenities around a pandal coordinate (800m default radius)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radius - Search radius in meters (default 800m)
 * @param {string} cacheKey - Optional custom ID/key for caching
 * @returns {Promise<Array>} List of standardized amenity objects
 */
export async function fetchNearbyAmenities(lat, lng, radius = 800, cacheKey = null) {
  const key = cacheKey || `${Number(lat).toFixed(4)}_${Number(lng).toFixed(4)}_${radius}`;

  // Check cache first
  if (amenityCache.has(key)) {
    return { data: amenityCache.get(key), fromCache: true };
  }

  const query = buildOverpassQuery(lat, lng, radius);
  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Overpass returned HTTP ${response.status}`);
      }

      const json = await response.json();
      const elements = json.elements || [];

      // Format and categorize results
      const amenities = elements
        .filter(el => el.lat && el.lon)
        .map(el => {
          const cat = categorizeElement(el.tags);
          const meta = AMENITY_CATEGORIES[cat] || { label: 'Amenity', icon: '📍', color: '#888888' };
          const name = el.tags?.name || el.tags?.['name:en'] || el.tags?.brand || `Unnamed ${meta.label}`;

          return {
            id: el.id,
            category: cat,
            categoryLabel: meta.label,
            icon: meta.icon,
            color: meta.color,
            name,
            lat: el.lat,
            lng: el.lon,
            tags: el.tags || {},
          };
        })
        .filter(item => item.category !== 'other');

      // Save to cache
      amenityCache.set(key, amenities);

      return { data: amenities, fromCache: false };
    } catch (err) {
      lastError = err;
      // Try next endpoint in loop
    }
  }

  throw new Error(lastError?.message || 'Failed to fetch nearby amenities from Overpass API');
}

/**
 * Normalize category name from Gemini / user input to internal category ID
 */
export function normalizeCategory(cat) {
  if (!cat) return null;
  const c = cat.toLowerCase();
  if (c === 'metro_station' || c === 'metro' || c === 'railway' || c === 'station') return 'station';
  if (c === 'restaurant' || c === 'food' || c === 'cafe') return 'restaurant';
  if (c === 'bar' || c === 'pub') return 'bar';
  if (c === 'toilets' || c === 'toilet' || c === 'restroom' || c === 'washroom') return 'toilets';
  if (c === 'bus_stop' || c === 'bus') return 'bus_stop';
  return c;
}

/**
 * Fetch specific category amenities around coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} category - Category ID or alias
 * @param {number} radius - Search radius in meters
 * @returns {Promise<{data: Array, fromCache: boolean}>}
 */
export async function fetchAmenitiesForCategory(lat, lng, category, radius = 1000) {
  const normCat = normalizeCategory(category);
  const { data, fromCache } = await fetchNearbyAmenities(lat, lng, radius);

  if (!normCat) {
    return { data, fromCache };
  }

  const filtered = data.filter(item => item.category === normCat);
  return { data: filtered, fromCache };
}

/**
 * Clear in-memory amenity cache
 */
export function clearAmenityCache() {
  amenityCache.clear();
}
