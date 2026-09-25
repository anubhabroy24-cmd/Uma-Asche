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

// Image generation, academic homework/study, research paper detector
export function isDisallowedQuery(query) {
  if (!query) return false;
  const q = query.trim().toLowerCase();

  // 1. Video & Image generation requests
  if (/\b(generate|create|draw|make|render|paint|design)\s+(an?\s+)?(image|picture|photo|illustration|drawing|artwork|logo|wallpaper|poster|graphic|video|animation|clip)\b/i.test(q)) {
    return true;
  }
  if (/\b(dall-?e|midjourney|stable\s*diffusion|text\s*to\s*image|text\s*to\s*video|sora|runwayml|imagine\s+a)\b/i.test(q)) {
    return true;
  }

  // 2. Pure academic homework, school/college studies & coding homework
  if (/\b(solve|equation|derivative|integral|integrate|algebra|calculus|trigonometry|pythagoras|logarithm|fraction)\b/i.test(q)) {
    return true;
  }
  if (/\b\d+\s*[\+\-\*\/\^%]\s*\d+\b/.test(q)) {
    return true;
  }
  if (/\b(what is|calculate)\s*\d+\s*[\+\-\*\/]/i.test(q)) {
    return true;
  }
  if (/\b(syllabus|homework|school assignment|exam question|chapter\s*\d|physics numerical|chemistry lab|mitochondria|photosynthesis|newton's\s*law|write a program|write python code|write c\+\+|write java code)\b/i.test(q)) {
    return true;
  }

  // 3. In-depth academic research papers, thesis, literature review
  if (/\b(research paper|academic thesis|dissertation|literature review|scholarly citation|peer-reviewed journal)\b/i.test(q)) {
    return true;
  }

  return false;
}

// Backward compatibility alias
export const isMathOrSyllabus = isDisallowedQuery;

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
export async function processDistanceQuery(userQuery, userLocation = null, context = {}) {
  const text = normalize(userQuery);
  const qLower = userQuery.toLowerCase();

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

  // 2. Specific Iconic Kolkata Eateries & Landmarks (e.g. Aminia, Arsalan, Peter Cat)
  if (/aminia/i.test(qLower)) {
    const gmapsUrl = 'https://www.google.com/maps/search/Aminia+Restaurant+Esplanade+Kolkata';
    return {
      type: 'amenity_card',
      amenityType: 'food',
      gmapsUrl,
      reply: `📍 **আমিনিয়া রেস্তোরাঁ (এসপ্ল্যানেড) / Aminia Restaurant (Esplanade):**\n\n` +
        `• **ঠিকানা (Address):** 6A, S.N. Banerjee Road, New Market Area, Esplanade, Kolkata - 700087 (ফুটনানি চেম্বার্স ও মেট্রো সিনেমার উল্টোদিকে, কে.সি. দাশ-এর কাছে)।\n` +
        `• **🚇 নিকটতম মেট্রো:** এসপ্ল্যানেড মেট্রো স্টেশন (গেট নং ৪ বা ৫ থেকে মাত্র ২ মিনিট হাঁটা)।\n` +
        `• **জনপ্রিয় পদ (Specialties):** বিখ্যাত কলকাতা মটন বিরিয়ানি (নরম আলু ও ডিম সহ), চিকেন চাপ, আওয়াধি বিরিয়ানি ও ফিরনি।\n\n` +
        `[🗺️ গুগল ম্যাপে আমিনিয়া রেস্তোরাঁ খুলুন](${gmapsUrl})`,
      suggestions: [
        'Transport details for my this route',
        'Find bathrooms near Esplanade',
        'Pandals near Esplanade',
      ],
    };
  }

  if (/arsalan/i.test(qLower)) {
    const gmapsUrl = 'https://www.google.com/maps/search/Arsalan+Restaurant+Park+Circus+Kolkata';
    return {
      type: 'amenity_card',
      amenityType: 'food',
      gmapsUrl,
      reply: `📍 **আরসালান রেস্তোরাঁ (পার্ক সার্কাস) / Arsalan (Park Circus):**\n\n` +
        `• **ঠিকানা:** 191, Marina Garden Court, Park Circus 7-Point Crossing, Kolkata.\n` +
        `• **🚇 নিকটতম মেট্রো:** পার্ক স্ট্রিট বা রবীন্দ্র সদন (সেখান থেকে অটো বা ট্যাক্সি)।\n` +
        `• **জনপ্রিয় পদ:** কলকাতা স্পেশাল মাটন বিরিয়ানি, চিকেন চাপ ও আরসালান কাবাব।\n\n` +
        `[🗺️ গুগল ম্যাপে আরসালান রেস্তোরাঁ খুলুন](${gmapsUrl})`,
      suggestions: ['Food near Park Street', 'Find bathrooms near Park Circus'],
    };
  }

  if (/peter\s*cat/i.test(qLower)) {
    const gmapsUrl = 'https://www.google.com/maps/search/Peter+Cat+Park+Street+Kolkata';
    return {
      type: 'amenity_card',
      amenityType: 'food',
      gmapsUrl,
      reply: `📍 **পিটার ক্যাট (পার্ক স্ট্রিট) / Peter Cat (Park Street):**\n\n` +
        `• **ঠিকানা:** 18A, Park Street, Kolkata.\n` +
        `• **🚇 নিকটতম মেট্রো:** পার্ক স্ট্রিট মেট্রো স্টেশন (মাত্র ৩ মিনিট হাঁটা)।\n` +
        `• **জনপ্রিয় পদ:** বিশ্ববিখ্যাত চেলো কাবাব (Chelo Kebab) ও ঐতিহ্যবাহী কন্টিনেন্টাল খাবার।\n\n` +
        `[🗺️ গুগল ম্যাপে পিটার ক্যাট খুলুন](${gmapsUrl})`,
      suggestions: ['Bars near Park Street', 'Food near Park Street'],
    };
  }

  if (/mocambo/i.test(qLower)) {
    const gmapsUrl = 'https://www.google.com/maps/search/Mocambo+Park+Street+Kolkata';
    return {
      type: 'amenity_card',
      amenityType: 'food',
      gmapsUrl,
      reply: `📍 **মোকাম্বো (পার্ক স্ট্রিট) / Mocambo (Park Street):**\n\n` +
        `• **ঠিকানা:** 25B, Park Street, Kolkata (পিটার ক্যাটের কাছেই)।\n` +
        `• **🚇 নিকটতম মেট্রো:** পার্ক স্ট্রিট মেট্রো স্টেশন (৩ মিনিট হাঁটা)।\n` +
        `• **জনপ্রিয় পদ:** ডেভিলড ক্র্যাব (Devilled Crab), চিকেন টেট্রাজিনি ও কন্টিনেন্টাল সিজলার।\n\n` +
        `[🗺️ গুগল ম্যাপে মোকাম্বো খুলুন](${gmapsUrl})`,
      suggestions: ['Bars near Park Street', 'Food near Park Street'],
    };
  }

  if (/nizam/i.test(qLower)) {
    const gmapsUrl = 'https://www.google.com/maps/search/Nizams+Restaurant+New+Market+Kolkata';
    return {
      type: 'amenity_card',
      amenityType: 'food',
      gmapsUrl,
      reply: `📍 **নিজামস (নিউ মার্কেট) / Nizam's (New Market):**\n\n` +
        `• **ঠিকানা:** 23/24, Hogg Street, New Market Area, Kolkata.\n` +
        `• **🚇 নিকটতম মেট্রো:** এসপ্ল্যানেড মেট্রো স্টেশন (গেট নং ৫ থেকে ৪ মিনিট হাঁটা)।\n` +
        `• **ঐতিহ্য:** কলকাতার আসল কাঠি রোলের জন্মস্থান (Original Kathi Roll, Mutton & Beef Roll)।\n\n` +
        `[🗺️ গুগল ম্যাপে নিজামস খুলুন](${gmapsUrl})`,
      suggestions: ['Food near Esplanade', 'Find bathrooms near Esplanade'],
    };
  }

  if (/dacres\s*lane|chitto\s*da/i.test(qLower)) {
    const gmapsUrl = 'https://www.google.com/maps/search/Dacres+Lane+Chitto+Babu+Dokan+Kolkata';
    return {
      type: 'amenity_card',
      amenityType: 'food',
      gmapsUrl,
      reply: `📍 **ডেকার্স লেন / চিত্ত বাবুর দোকান (Dacres Lane - Chitto Da's):**\n\n` +
        `• **ঠিকানা:** James Hickey Sarani (Dacres Lane), Esplanade, Kolkata.\n` +
        `• **🚇 নিকটতম মেট্রো:** এসপ্ল্যানেড বা চাঁদনী চক মেট্রো স্টেশন (৩ মিনিট হাঁটা)।\n` +
        `• **জনপ্রিয় খাবার:** চিত্তদার চিকেন স্টু ও টোস্ট, ফিশ ফ্রাই, খিচুড়ি ও কফি।\n\n` +
        `[🗺️ গুগল ম্যাপে ডেকার্স লেন খুলুন](${gmapsUrl})`,
      suggestions: ['Food near Esplanade', 'Find bathrooms near Esplanade'],
    };
  }

  // 3. Step-by-Step Route & Transport Itinerary for the user's plan
  const isRouteTransport = /\b(transport|route|routes|transit|how to visit|how to reach|how to go|travel details|step by step|steps|itinerary)\b/i.test(text) ||
    /(ট্রান্সপোর্ট|যাতায়াত|পরিবহন|রুট|কীভাবে যাব|কিভাবে যাব|পরিক্রমা|রাস্তা)/i.test(userQuery);

  if (isRouteTransport) {
    const rawSpots = Array.isArray(context.groupSpots) && context.groupSpots.length > 0
      ? context.groupSpots
      : Array.isArray(context.waypoints) && context.waypoints.length > 0
        ? context.waypoints.filter(w => w && w.id !== 'start-0' && w.id !== 'start-me')
        : [];

    const startLoc = context.startLocation || (context.waypoints?.[0]?.name?.replace(/\s*\(Start\)$/i, '')) || 'Kolkata Central';

    if (rawSpots.length > 0) {
      const stepLines = [];
      for (let i = 0; i < rawSpots.length; i++) {
        const s = rawSpots[i];
        const pName = s.name || s.spot?.name || `Pandal ${i + 1}`;
        const pArea = s.area || s.spot?.area || 'Kolkata';
        const pMetro = s.nearestMetro || s.spot?.nearestMetro || 'নিকটতম মেট্রো স্টেশন';

        if (i === 0) {
          stepLines.push(
            `**📍 ধাপ ১: ${startLoc} ➔ ${pName} (${pArea})**\n` +
            `• **মেট্রো যাত্রা:** ${startLoc} থেকে কলকাতা মেট্রো ধরে সোজা **${pMetro}** স্টেশনে নামুন।\n` +
            `• **প্যান্ডেলে প্রবেশ:** স্টেশন গেট থেকে বের হয়ে পায়ে হেঁটে ৩-৫ মিনিট অথবা লোকাল রিকশায় সরাসরি প্যান্ডেলে পৌঁছান।`
          );
        } else {
          const prev = rawSpots[i - 1];
          const prevName = prev.name || prev.spot?.name || `Pandal ${i}`;
          const isSameArea = prev.area && s.area && prev.area.toLowerCase() === s.area.toLowerCase();
          const transitMethod = isSameArea
            ? `• **কানেক্টিং রুট:** একই এলাকায় অবস্থিত হওয়ায় **${prevName}** থেকে ৫-৮ মিনিট হেঁটে বা রিকশায় সরাসরি **${pName}** প্যান্ডেলে পৌঁছান।`
            : `• **মেট্রো/অটো রুট:** **${prev.nearestMetro || 'নিকটতম মেট্রো'}** থেকে মেট্রো নিয়ে **${pMetro}** স্টেশনে আসুন।`;
          stepLines.push(
            `**📍 ধাপ ${i + 1}: ${prevName} ➔ ${pName} (${pArea})**\n` +
            `${transitMethod}\n` +
            `• **নিকটতম মেট্রো:** **${pMetro}**`
          );
        }
      }

      const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(startLoc + ' Kolkata')}&destination=${encodeURIComponent((rawSpots[rawSpots.length - 1]?.name || 'Kolkata') + ' Kolkata')}`;

      return {
        type: 'route_plan',
        reply: `🗺️ **আপনার পুজোর প্ল্যানের নিখুঁত যাতায়াত ও পরিবহন গাইড (ধাপে ধাপে):**\n\n` +
          `• **শুরুর স্থান (Starting Point):** ${startLoc}\n` +
          `• **মোট প্যান্ডেল সংখ্যা:** ${rawSpots.length} টি স্টপ\n\n` +
          `${stepLines.join('\n\n')}\n\n` +
          `**🚇 পুজো স্পেশাল মেট্রো ও ট্রাফিক টিপস:**\n` +
          `• **সারারাত মেট্রো:** সপ্তমী, অষ্টমী ও নবমীর রাতে কলকাতা মেট্রো ভোর ৪টে পর্যন্ত বিশেষ বর্ধিত পরিষেবা দেয়।\n` +
          `• **যানবাহন নিয়ন্ত্রণ:** বিকেল ৩:৩০ এর পর প্যান্ডেল সংলগ্ন রাস্তায় যান চলাচল বন্ধ হয়ে যায়; তাই মেট্রো এবং পায়ে হাঁটাই সবচেয়ে দ্রুততম মাধ্যম।\n` +
          `• **জরুরি সহায়তা:** কলকাতা পুলিশ হেল্পলাইন ১১২ / ১০০।\n\n` +
          `[🗺️ গুগল ম্যাপে পুরো রুটটি খুলুন](${gmapsUrl})`,
        gmapsUrl,
        suggestions: [
          'Toilets near me',
          'Bars near me',
          'Famous restaurants near me',
        ],
      };
    } else {
      return {
        type: 'route_plan',
        reply: `🧭 **আপনার প্ল্যানে এখনও কোনো প্যান্ডেল যুক্ত করা হয়নি!**\n\n` +
          `• উপরে **Plan** ট্যাবে গিয়ে আপনার পছন্দের প্যান্ডেলগুলি যুক্ত করুন।\n` +
          `• আপনার বর্তমান শুরুর স্থান: **${startLoc}**।\n` +
          `• প্যান্ডেল যুক্ত করার পর আবার আমাকে জিজ্ঞেস করলেই আমি প্রতিটি প্যান্ডেলের ধাপে ধাপে মেট্রো, হাঁটা ও অটো রুট এবং গুগল ম্যাপের ডিরেকশন দিয়ে দেব!`,
        gmapsUrl: null,
        suggestions: [
          'Famous pandals in Kolkata',
          'Find bathrooms near me',
          'Bars near me',
        ],
      };
    }
  }

  // 4. Bathroom / Washroom / Toilet Search with direct Google Maps Link
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

  // 5. Greetings & General Inquiries
  if (/^(hi|hello|hey|namaste|shubho|nomoshkar|help|who are you|kemon acho)/.test(text)) {
    return {
      type: 'greeting',
      reply: 'শুভ শারদীয়া! 🙏',
      suggestions: [
        'Transport details for my this route',
        'Howrah to Maidan distance',
        'Find bathrooms near me',
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

  // Check specific non-pandal amenity queries
  const isBar = /\b(bar|bars|pub|pubs|beer|liquor|wine|cocktail|lounge|brewery|club|nightclub)\b/i.test(text);
  const isFood = /\b(food|restaurant|restaurants|dhaba|cafe|coffee|biryani|roll|rolls|sweets|mithai|eating|lunch|dinner|breakfast|snack|street food)\b/i.test(text);
  const isMedical = /\b(hospital|hospitals|clinic|doctor|pharmacy|medicine|chemist|first aid|medical|ambulance)\b/i.test(text);

  if (isBar) {
    const ref = entities[0] || { name: 'Maidan / Park Street', lat: 22.5520, lng: 88.3490 };
    const gmapsUrl = `https://www.google.com/maps/search/bars+pubs+lounges+near+${encodeURIComponent(ref.name + ' Kolkata')}`;
    return {
      type: 'amenity_card',
      amenityType: 'bar',
      gmapsUrl,
      reply: `🍻 **Bars & Pubs near ${ref.name}:**\n\n` +
        `• **Olypub (Park Street):** Kolkata's legendary classic budget pub (~1.2 km from Maidan).\n` +
        `• **Someplace Else & Roxy (The Park Hotel):** Iconic British pub with live music.\n` +
        `• **Trincas (Park Street):** Vintage 1960s retro live music bar & dining.\n` +
        `• **Peter Cat & Mocambo (Park Street):** Heritage dining with cocktails & Chelo Kebabs.\n` +
        `• **Broadway Hotel Bar (Chandni Chowk):** Old-school heritage tavern (~1.8 km).\n\n` +
        `[🗺️ Search All Bars near ${ref.name} on Google Maps](${gmapsUrl})`,
      suggestions: [
        'Bars near Park Street',
        `Food near ${ref.name}`,
        `Find bathrooms near ${ref.name}`,
        `Pandals near ${ref.name}`,
      ],
    };
  }

  if (isFood) {
    const ref = entities[0] || { name: 'Kolkata Central', lat: 22.5726, lng: 88.3639 };
    const gmapsUrl = `https://www.google.com/maps/search/restaurants+and+food+near+${encodeURIComponent(ref.name + ' Kolkata')}`;
    return {
      type: 'amenity_card',
      amenityType: 'food',
      gmapsUrl,
      reply: `🍽️ **Food & Restaurants near ${ref.name}:**\n\n` +
        `• **Park Street Restaurant Row:** Peter Cat, Mocambo, Kusum Rolls, Flurys.\n` +
        `• **Dacres Lane (Esplanade):** Famous heritage street food hub (Chitto Da's).\n` +
        `• **Arsalan / Shiraz (Park Circus):** Legendary Kolkata Biryani & Chaap.\n\n` +
        `[🗺️ Search All Restaurants near ${ref.name} on Google Maps](${gmapsUrl})`,
      suggestions: [
        'Food near Park Street',
        `Bars near ${ref.name}`,
        `Pandals near ${ref.name}`,
      ],
    };
  }

  if (isMedical) {
    const ref = entities[0] || { name: 'Kolkata', lat: 22.5726, lng: 88.3639 };
    const gmapsUrl = `https://www.google.com/maps/search/hospital+medical+pharmacy+near+${encodeURIComponent(ref.name + ' Kolkata')}`;
    return {
      type: 'amenity_card',
      amenityType: 'medical',
      gmapsUrl,
      reply: `🏥 **Medical & Emergency Services near ${ref.name}:**\n\n` +
        `• **SSKM Hospital (IPGMER):** Major Govt emergency hospital near Rabindra Sadan.\n` +
        `• **Calcutta Medical College:** College Street / Central area.\n` +
        `• **Durga Puja Medical Booths:** Kolkata Police / Red Cross booths outside major pandals.\n\n` +
        `[🗺️ Search Hospitals & Pharmacies on Google Maps](${gmapsUrl})`,
      suggestions: [
        `Pandals near ${ref.name}`,
        `Find bathrooms near ${ref.name}`,
      ],
    };
  }

  // Case B: 1 Entity found + "near" / "nearest" (Pandal proximity search)
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

  // 6. ATM & Cash Search
  const isAtm = /\b(atm|atms|cash|bank)\b/i.test(text);
  if (isAtm) {
    const ref = entities[0] || { name: 'Kolkata', lat: 22.5726, lng: 88.3639 };
    const gmapsUrl = `https://www.google.com/maps/search/atm+near+${encodeURIComponent(ref.name + ' Kolkata')}`;
    return {
      type: 'amenity_card',
      amenityType: 'atm',
      gmapsUrl,
      reply: `🏧 **ATMs & Cash Withdrawal near ${ref.name}:**\n\n` +
        `• **Metro Station Concourses:** Major Blue Line and Green Line stations (Esplanade, Park Street, Howrah, Sealdah, Shyambazar) feature operational SBI, HDFC, and Axis Bank ATMs.\n` +
        `• **Commercial Hubs:** Park Street, Chowringhee Rd, and Gariahat have multiple 24/7 ATM kiosks.\n` +
        `• **Puja Tip:** Keep some cash handy in case mobile digital UPI networks experience local congestion around mega pandals.\n\n` +
        `[🗺️ Search 24/7 ATMs near ${ref.name} on Google Maps](${gmapsUrl})`,
      suggestions: [
        'Find bathrooms near me',
        `Food near ${ref.name}`,
        'Pandals near my GPS location',
      ],
    };
  }

  // 7. Fallback search by keyword
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
      reply: `Found matching pandals in Kolkata:`,
      matches: keywordMatches,
      suggestions: keywordMatches.map(m => `Distance to ${m.name}`),
    };
  }

  // 8. Amenity and general query handling
  const isAmenity = /\b(toilet|washroom|bathroom|bar|pub|bars|pubs|food|restaurant|biryani|hospital|doctor|atm|cash|near\s*me)\b/i.test(userQuery) ||
    /(টয়লেট|বাথরুম|শৌচাগার|বার|পাব|রেস্তোরাঁ|খাবার|হাসপাতাল|কাছে|शौचालय|बार|रेस्तरां|पास)/i.test(userQuery);

  if (isAmenity) {
    const gmapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(userQuery + ' Kolkata')}`;
    return {
      type: 'amenity_info',
      reply: `📍 **Kolkata Facilities Guide:**\n\n` +
        `Here are the verified locations for **"${userQuery}"** in Kolkata. Tap the map link below for live turn-by-turn navigation:\n\n` +
        `[🗺️ Open in Google Maps](${gmapsUrl})`,
      gmapsUrl,
      suggestions: [
        'Toilets near me',
        'Bars near me',
        'Famous restaurants near me',
      ],
    };
  }

  // General helpful guidance (NO forced Google Maps links)
  return {
    type: 'general_info',
    reply: `🙏 **শুভ শারদীয়া!**\n\n` +
      `I am ready to help you with your Durga Puja plan! You can ask for step-by-step transport for your route, metro connections, pandal timings, or nearby amenities like washrooms and food.`,
    gmapsUrl: null,
    suggestions: [
      'Transport details for my this route',
      'Toilet near me',
      'Bars near me',
      'Famous pandals in Kolkata',
    ],
  };
}

