import { DEFAULT_PANDALS } from '../data/defaultPandals';
import { haversineDistanceKm, solveNearestNeighbor } from './routeOptimizer';

// Major Kolkata Transit Hubs and Landmarks
export const POPULAR_LANDMARKS = [
  { name: 'Howrah Station', aliases: ['howrah', 'howrah station', 'howrah rly station', 'howrah railway station', 'hwh', 'howrah bridge'], lat: 22.5839, lng: 88.3424, type: 'Station' },
  { name: 'Sealdah Station', aliases: ['sealdah', 'sealdah station', 'sda'], lat: 22.5701, lng: 88.3698, type: 'Station' },
  { name: 'Maidan', aliases: ['maidan', 'maidan metro', 'maidan ground', 'brigade ground', 'brigade'], lat: 22.5520, lng: 88.3490, type: 'Metro & Park' },
  { name: 'Victoria Memorial', aliases: ['victoria', 'victoria memorial'], lat: 22.5448, lng: 88.3426, type: 'Monument' },
  { name: 'Kolkata Airport (CCU)', aliases: ['airport', 'dum dum airport', 'nscbi airport'], lat: 22.6547, lng: 88.4467, type: 'Airport' },
  { name: 'Esplanade / Dharmatala', aliases: ['esplanade', 'dharmatala', 'curzon park'], lat: 22.5645, lng: 88.3533, type: 'Central Hub' },
  { name: 'Park Street', aliases: ['park street', 'park st'], lat: 22.5518, lng: 88.3524, type: 'Landmark' },
  { name: 'Rabindra Sadan', aliases: ['rabindra sadan', 'exide', 'exide crossing'], lat: 22.5415, lng: 88.3485, type: 'Metro & Cultural' },
  { name: 'Shyambazar Five-Point', aliases: ['shyambazar', 'shyambazar 5 point'], lat: 22.6022, lng: 88.3712, type: 'Transit Point' },
  { name: 'Gariahat Crossing', aliases: ['gariahat', 'gariahat more'], lat: 22.5186, lng: 88.3650, type: 'Shopping Hub' },
  { name: 'Jadavpur 8B', aliases: ['jadavpur', 'jadavpur 8b', 'jadavpur university'], lat: 22.4985, lng: 88.3755, type: 'South Hub' },
  { name: 'Salt Lake Karunamoyee', aliases: ['salt lake', 'karunamoyee', 'salt lake central'], lat: 22.5867, lng: 88.4178, type: 'Township' },
  { name: 'Sector V (Tech Hub)', aliases: ['sector 5', 'sector v', 'salt lake sector 5'], lat: 22.5735, lng: 88.4331, type: 'IT Hub' },
  { name: 'Tollygunge Tram Depot', aliases: ['tollygunge', 'tollygunje', 'tolly'], lat: 22.4990, lng: 88.3471, type: 'South Hub' },
  { name: 'Dum Dum Junction', aliases: ['dum dum', 'dumdum'], lat: 22.6225, lng: 88.4200, type: 'Station' },
  { name: 'Kalighat Temple', aliases: ['kalighat', 'kalighat mandir'], lat: 22.5261, lng: 88.3432, type: 'Heritage' },
  { name: 'Santragachi Junction', aliases: ['santragachi', 'santragachi station'], lat: 22.5800, lng: 88.2780, type: 'Station' },
  { name: 'Shalimar Station', aliases: ['shalimar'], lat: 22.5574, lng: 88.3242, type: 'Station' },
  { name: 'Behala Chowrasta', aliases: ['behala', 'behala chowrasta'], lat: 22.4950, lng: 88.3150, type: 'South West' },
  { name: 'Ruby More (EM Bypass)', aliases: ['ruby', 'ruby hospital', 'ruby crossing'], lat: 22.5130, lng: 88.4030, type: 'Bypass' },
  { name: 'Ultadanga Hudco', aliases: ['ultadanga', 'hudco'], lat: 22.5957, lng: 88.3861, type: 'North Hub' },
];

// Clean text for token matching
function normalize(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Math or academic syllabus detector
export function isMathOrSyllabus(query) {
  const q = query.trim().toLowerCase();

  // Math equations / calculations
  if (/\b(solve|equation|derivative|integral|integrate|algebra|calculus|trigonometry|pythagoras|formula|logarithm|fraction)\b/i.test(q)) {
    return true;
  }
  if (/\b\d+\s*[\+\-\*\/\^%]\s*\d+\b/.test(q)) {
    return true;
  }
  if (/\b(what is|calculate)\s*\d+/i.test(q)) {
    return true;
  }

  // Academic syllabus, exams, homework, school/college questions
  if (/\b(syllabus|homework|assignment|exam question|chapter\s*\d|physics|chemistry|biology|photosynthesis|mitochondria|newton|history question|who was|who is the president|essay on|definition of|write a program|python code|java code|javascript code|html code|c\+\+)\b/i.test(q)) {
    return true;
  }

  return false;
}

// Bathroom / Toilet query detector
export function isBathroomQuery(query) {
  return /\b(bathroom|bathrooms|toilet|toilets|washroom|washrooms|restroom|restrooms|lavatory|shauchalay|sulabh|pee|urinal|wc)\b/i.test(query);
}

// Find all distinct entities in text
export function extractEntities(query) {
  const found = [];
  const norm = normalize(query);

  // 1. Check Pandals (both full name, core stripped name, and area)
  for (const p of DEFAULT_PANDALS) {
    const pName = normalize(p.name);
    const pArea = normalize(p.area);

    const coreName = normalize(
      p.name.replace(/\s+(Sporting Club|Sarbojanin|Sarbojanin Durgotsav|Sarbojanin Durga Puja|Evergreen Club|Club|Sangha|Samity|Committee)$/i, '')
    );

    const isMatch =
      norm.includes(pName) ||
      (coreName.length >= 4 && norm.includes(coreName)) ||
      (pArea.length >= 4 && norm.includes(pArea));

    if (isMatch && !found.some(f => f.name === p.name)) {
      found.push({ ...p, lat: p.latitude, lng: p.longitude, entityType: 'pandal' });
    }
  }

  // 2. Check Landmarks
  for (const lm of POPULAR_LANDMARKS) {
    const lmNames = [lm.name, ...(lm.aliases || [])];
    const isMatched = lmNames.some(alias => norm.includes(normalize(alias)));
    if (isMatched && !found.some(f => f.name === lm.name)) {
      found.push({ ...lm, entityType: 'landmark' });
    }
  }

  return found;
}

// Specific transit guidance between hubs
function getTransitAdvice(origin, destination) {
  const oName = (origin.name || '').toLowerCase();
  const dName = (destination.name || '').toLowerCase();

  // Howrah <-> Maidan / Esplanade
  if ((oName.includes('howrah') && dName.includes('maidan')) || (oName.includes('maidan') && dName.includes('howrah'))) {
    return '🚇 **Recommended Transit**: Take the **Green Line Metro** from Howrah Station to Esplanade (underwater river metro, ~6 mins), then walk 5 mins or take the Blue Line 1 stop to Maidan Station!';
  }

  // Howrah <-> Sreebhumi / Salt Lake
  if ((oName.includes('howrah') && (dName.includes('sreebhumi') || dName.includes('salt lake'))) || (dName.includes('howrah') && (oName.includes('sreebhumi') || oName.includes('salt lake')))) {
    return '🚇 **Recommended Transit**: Take the **Green Line Metro** from Howrah to Salt Lake / Karunamoyee, or take a direct AC bus via VIP Road to Sreebhumi.';
  }

  // North <-> South Corridor
  if ((oName.includes('shyambazar') || oName.includes('bagbazar') || oName.includes('dum dum')) && (dName.includes('kalighat') || dName.includes('gariah') || dName.includes('maddox') || dName.includes('maidan'))) {
    return '🚇 **Recommended Transit**: The **Kolkata Metro Blue Line** (North-South corridor) connects directly with zero road traffic!';
  }

  return '🚗 **Puja Transit Tip**: Check for traffic diversions around major pandals. Metro is the fastest option during peak evening hours (5 PM - 1 AM).';
}

// Calculate road distance, walking time, driving time
export function calculateTravelMetrics(pointA, pointB) {
  const lat1 = Number(pointA.lat || pointA.latitude);
  const lon1 = Number(pointA.lng || pointA.longitude);
  const lat2 = Number(pointB.lat || pointB.latitude);
  const lon2 = Number(pointB.lng || pointB.longitude);

  const straightKm = haversineDistanceKm(lat1, lon1, lat2, lon2);
  // Kolkata city road multiplier: approx 1.28x of straight line due to river, bridges, flyovers
  const roadKm = Math.max(0.1, Number((straightKm * 1.28).toFixed(1)));

  // Walking time: 4.5 km/h average
  const walkingMins = Math.max(2, Math.round((roadKm / 4.5) * 60));

  // Driving time during Durga Puja: average speed ~18 km/h due to traffic diversions & crowd
  const drivingMins = Math.max(3, Math.round((roadKm / 18) * 60) + 4);

  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat1},${lon1}&destination=${lat2},${lon2}&travelmode=driving`;
  const transitAdvice = getTransitAdvice(pointA, pointB);

  return {
    straightKm: Number(straightKm.toFixed(2)),
    roadKm,
    walkingMins,
    drivingMins,
    gmapsUrl,
    transitAdvice,
  };
}

// Find closest pandals to a given coordinate
export function findNearbyPandals(targetLat, targetLng, maxCount = 5, maxRadiusKm = 10) {
  const list = DEFAULT_PANDALS.map(p => {
    const dist = calculateTravelMetrics({ lat: targetLat, lng: targetLng }, { lat: p.latitude, lng: p.longitude });
    return {
      ...p,
      distanceKm: dist.roadKm,
      walkingMins: dist.walkingMins,
      drivingMins: dist.drivingMins,
      gmapsUrl: dist.gmapsUrl,
    };
  });

  return list
    .filter(p => p.distanceKm <= maxRadiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, maxCount);
}

// Master NLP query processor
export async function processDistanceQuery(userQuery, userLocation = null) {
  const text = normalize(userQuery);

  // 1. Math / Syllabus / Academic Filter (Strictly reject non-puja questions)
  if (isMathOrSyllabus(userQuery)) {
    return {
      type: 'off_topic',
      reply: '🙏 শুভ শারদীয়া!',
      details: [
        'I only assist with Kolkata Durga Puja plans, pandal distances, transit routes (e.g. "Howrah to Maidan distance how to go"), and public washrooms.',
        'I do not solve maths, syllabus, or academic questions.',
      ],
      suggestions: [
        'Howrah to Maidan distance',
        'Find bathrooms near me',
        'Shortest route for our group plan',
      ],
    };
  }

  // 2. Bathroom / Washroom / Toilet Search with direct Google Maps Link
  if (isBathroomQuery(userQuery)) {
    const entities = extractEntities(userQuery);
    let targetName = 'Your Location';
    let gmapsUrl = 'https://www.google.com/maps/search/public+toilet+washroom+kolkata';

    if (entities.length > 0) {
      targetName = entities[0].name;
      gmapsUrl = `https://www.google.com/maps/search/public+toilet+washroom+near+${encodeURIComponent(targetName)}`;
    } else if (userLocation && userLocation.latitude && userLocation.longitude) {
      targetName = 'your current GPS location';
      gmapsUrl = `https://www.google.com/maps/search/public+toilet+washroom+near+me/@${userLocation.latitude},${userLocation.longitude},15z`;
    }

    return {
      type: 'bathroom_card',
      reply: `🚻 Public Washrooms & Toilets near **${targetName}**:`,
      locationName: targetName,
      gmapsUrl,
      details: [
        '🚇 **Metro Stations**: All operational Kolkata Metro stations (Blue & Green lines) have clean public washrooms on concourses.',
        '🪔 **Pandal Bio-Toilets**: KMC provides mobile bio-toilets outside all mega pandals.',
        '🚻 **Sulabh Shauchalayas & Fuel Pumps**: Clean pay-and-use toilets available along major arterial crossings.',
      ],
      suggestions: [
        'Find bathrooms near me',
        'Howrah to Maidan distance',
        'Pandals near my GPS location',
      ],
    };
  }

  // 3. Greetings & General Inquiries
  if (/^(hi|hello|hey|namaste|shubho|nomoshkar|help|who are you|kemon acho)/.test(text)) {
    return {
      type: 'greeting',
      reply: 'শুভ শারদীয়া! 🙏',
      suggestions: [
        'Howrah to Maidan distance',
        'Find bathrooms near me',
        'Distance: Bagbazar to College Square',
        'Shortest route for our group plan',
      ],
    };
  }

  // 4. Nearby queries with GPS
  const isNearbyQuery = /near|closest|nearby|around me|close to me|nearest/.test(text);
  const isMyLocationQuery = /me|my location|here|current location|where i am/.test(text);

  if (isNearbyQuery && isMyLocationQuery) {
    if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
      return {
        type: 'require_gps',
        reply: '📍 To find pandals nearest to you, please click **"Use My GPS"** below or enable device location!',
        suggestions: ['📍 Use My Location', 'Pandals near Howrah Station', 'Pandals near Salt Lake'],
      };
    }

    const nearby = findNearbyPandals(userLocation.latitude, userLocation.longitude, 6, 8);
    if (nearby.length === 0) {
      return {
        type: 'text',
        reply: 'No major pandals found within 8 km of your current coordinates. Try asking for a major hub like Howrah or Sealdah!',
      };
    }

    return {
      type: 'nearby_list',
      originName: 'Your Current Location 📍',
      reply: `Found **${nearby.length} pandals** near you, sorted by closest distance:`,
      pandals: nearby,
      suggestions: [
        `Distance to ${nearby[0]?.name}`,
        'Find bathrooms near me',
        'Howrah to Maidan distance',
      ],
    };
  }

  // 5. Extract entities mentioned
  const entities = extractEntities(userQuery);

  // Case A: 2 Entities found -> Point to Point Distance & "How to Go" calculation
  if (entities.length >= 2) {
    const origin = entities[0];
    const destination = entities[1];
    const metrics = calculateTravelMetrics(origin, destination);

    // If more than 2 entities, also compute TSP route
    if (entities.length >= 3) {
      const stops = entities.map(e => ({ name: e.name, lat: e.lat, lng: e.lng, entityType: e.entityType }));
      const optimized = solveNearestNeighbor(stops[0], stops.slice(1));
      const totalKm = optimized.reduce((sum, item) => sum + (item.legDistanceKm || 0), 0);

      return {
        type: 'route_plan',
        reply: `🗺️ **Optimized Pandal Hopping Route** for **${entities.length} spots**:`,
        totalKm: Number(totalKm.toFixed(1)),
        stops: optimized,
        suggestions: [
          `Distance from ${entities[0].name} to ${entities[1].name}`,
          'Find bathrooms near me',
        ],
      };
    }

    const isHowToGo = /how to go|route|direction|directions|transit|metro|bus|cab|reach/.test(text);

    return {
      type: 'distance_card',
      origin,
      destination,
      metrics,
      reply: isHowToGo
        ? `🧭 Route & Distance from **${origin.name}** to **${destination.name}**:`
        : `📍 Distance from **${origin.name}** to **${destination.name}**:`,
      details: metrics.transitAdvice ? [metrics.transitAdvice] : undefined,
      suggestions: [
        `Find bathrooms near ${destination.name}`,
        `Pandals near ${destination.name}`,
        'Pandals near my GPS location',
      ],
    };
  }

  // Case B: 1 Entity found + "near" / "nearest"
  if (entities.length === 1 && (isNearbyQuery || /around|from/.test(text))) {
    const ref = entities[0];
    const nearby = findNearbyPandals(ref.lat, ref.lng, 5, 8).filter(p => p.name !== ref.name);

    return {
      type: 'nearby_list',
      originName: ref.name,
      reply: `Found **${nearby.length} pandals** closest to **${ref.name}**:`,
      pandals: nearby,
      suggestions: [
        `Distance from ${ref.name} to ${nearby[0]?.name}`,
        `Find bathrooms near ${ref.name}`,
        'Nearest metro to ' + ref.name,
      ],
    };
  }

  // Case C: 1 Entity found -> General Pandal & Transit details
  if (entities.length === 1) {
    const spot = entities[0];
    return {
      type: 'spot_info',
      spot,
      reply: `ℹ️ Information for **${spot.name}**:`,
      details: [
        `• **Region**: ${spot.region || 'Kolkata'}`,
        `• **Nearest Metro**: ${spot.nearestMetro || 'N/A'}`,
        `• **Crowd Level**: ${spot.crowdLevel || 'Moderate'}`,
        spot.description ? `• ${spot.description}` : null,
      ].filter(Boolean),
      suggestions: [
        `How far is ${spot.name} from Howrah?`,
        `Find bathrooms near ${spot.name}`,
        'Pandals near my GPS location',
      ],
    };
  }

  // 6. Fallback search by keyword
  const keywordMatches = DEFAULT_PANDALS.filter(p => {
    const q = text;
    return (
      p.name.toLowerCase().includes(q) ||
      p.area.toLowerCase().includes(q) ||
      p.region.toLowerCase().includes(q)
    );
  }).slice(0, 3);

  if (keywordMatches.length > 0) {
    return {
      type: 'pandal_matches',
      reply: `Did you mean one of these pandals?`,
      matches: keywordMatches,
      suggestions: keywordMatches.map(m => `Distance to ${m.name}`),
    };
  }

  // Fallback helpful guidance strictly focused on Puja plans and routes
  return {
    type: 'help',
    reply: `🙏 I couldn't identify those locations in Kolkata. Please ask about Puja pandals, routes, or distances!`,
    details: [
      'Example questions:',
      '• "Howrah to Maidan distance how to go"',
      '• "Distance between Bagbazar and College Square"',
      '• "Find bathrooms near me"',
      '• "Pandals near Salt Lake"',
    ],
    suggestions: [
      'Howrah to Maidan distance',
      'Find bathrooms near me',
      'Distance: Bagbazar to College Square',
    ],
  };
}
