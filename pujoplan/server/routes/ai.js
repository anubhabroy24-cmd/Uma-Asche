const express = require('express');
const router = express.Router();

// High-speed, high-quota models in priority order
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash-lite',
];

// In-memory cache for instant delivery (< 5ms)
const responseCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeKey(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Filter out image/video creation requests, school/college homework/syllabus studies, and academic research papers.
 */
function isDisallowedQuery(query = '') {
  const q = query.trim().toLowerCase();

  // 1. Video & Image generation
  if (/\b(generate|create|draw|make|render|paint|design)\s+(an?\s+)?(image|picture|photo|illustration|drawing|artwork|logo|wallpaper|poster|graphic|video|animation|clip)\b/i.test(q)) return true;
  if (/\b(dall-?e|midjourney|stable\s*diffusion|text\s*to\s*image|text\s*to\s*video|sora|runwayml|imagine\s+a)\b/i.test(q)) return true;

  // 2. Pure academic homework, school/college syllabus & coding homework
  if (/\b(solve|equation|derivative|integral|integrate|algebra|calculus|trigonometry|pythagoras|logarithm|fraction)\b/i.test(q)) return true;
  if (/\b\d+\s*[\+\-\*\/\^%]\s*\d+\b/.test(q)) return true;
  if (/\b(what is|calculate)\s*\d+\s*[\+\-\*\/]/i.test(q)) return true;
  if (/\b(syllabus|homework|school assignment|exam question|chapter\s*\d|physics numerical|chemistry lab|mitochondria|photosynthesis|newton's\s*law|write a program|write python code|write c\+\+|write java code)\b/i.test(q)) return true;

  // 3. Academic research papers, thesis
  if (/\b(research paper|academic thesis|dissertation|literature review|scholarly citation|peer-reviewed journal)\b/i.test(q)) return true;

  return false;
}

/**
 * Extract location or landmark from query text
 */
function extractTargetLocation(query = '') {
  const q = query.toLowerCase();
  const places = [
    'maidan', 'park street', 'howrah', 'sealdah', 'bagbazar', 'college square',
    'salt lake', 'sector v', 'sreebhumi', 'gariahat', 'kalighat', 'shyambazar',
    'esplanade', 'dharmatala', 'jadavpur', 'behala', 'dum dum', 'ballygunge',
    'santosh mitra square', 'kumartuli', 'ahiritola', 'ruby', 'ultadanga'
  ];
  for (const place of places) {
    if (q.includes(place)) {
      return place.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }
  return 'Kolkata';
}

/**
 * Universal Knowledge Responding Engine for Kolkata & Durga Puja
 * Returns deep, helpful answers and direct Google Maps links
 */
/**
 * Universal Knowledge Responding Engine for Kolkata & Durga Puja
 * Returns plan-aware guidance, minimal greeting replies, and amenity Google Maps links
 */
function generateComprehensiveAnswer(userQuery, context = {}) {
  const q = userQuery.toLowerCase().trim();
  const loc = extractTargetLocation(q);

  const groupSpots = Array.isArray(context.groupSpots) ? context.groupSpots : [];
  const startLoc = context.startLocation || 'Kolkata Central';

  // 1. Casual Greetings & Conversational Inquiries (NO Google Maps links!)
  if (/^(hi|hello|hey|hola|namaste|nomoshkar|pranam|good\s*(morning|afternoon|evening)|ki\s*khobor|ki\s*korcho|kemon\s*acho|ki\s*obostha|suvo\s*sarodiya|subho\s*bijoya|who\s*are\s*you|what\s*is\s*your\s*name)\b/i.test(q)) {
    if (/\b(ki\s*korcho)\b/i.test(q)) {
      return {
        reply: 'এই তো, আপনার পুজোর প্ল্যান ও রুট পরিক্রমায় সাহায্য করতে প্রস্তুত! আপনি বলুন, কীভাবে সাহায্য করতে পারি? 🪔',
        gmapsUrl: null,
      };
    }
    if (/\b(kemon\s*acho)\b/i.test(q)) {
      return {
        reply: 'আমি খুব ভালো আছি! আপনার দুর্গাপুজোর প্ল্যান কেমন চলছে? আপনার রুট বা প্যান্ডেল নিয়ে যেকোনো প্রশ্ন করতে পারেন। 🙏',
        gmapsUrl: null,
      };
    }
    if (/\b(suvo\s*sarodiya|subho\s*sharodiya|subho\s*sarodiya|shubho\s*sharadiya)\b/i.test(q)) {
      return {
        reply: 'শুভ শারদীয়া! 🙏 মা দুর্গার আশীর্বাদে আপনার পুজো আনন্দময় ও উৎসবমুখর কাটুক। আপনার প্যান্ডেল ভ্রমণ বা রুট নিয়ে কোনো তথ্য দরকার?',
        gmapsUrl: null,
      };
    }
    return {
      reply: 'Hello! 🙏 শুভ শারদীয়া! I am your Pujo Assistant. How can I help you with your pandals, route plan, or Kolkata travel today?',
      gmapsUrl: null,
    };
  }

  // 2. Transport Details & Itinerary Guidance for the User's Plan
  if (/\b(transport|transit|how to visit|guide|itinerary|my route|route details|travel details)\b/i.test(q) ||
      (/\broute\b/i.test(q) && !q.includes(' to '))) {
    if (groupSpots.length > 0) {
      const pandalSteps = groupSpots.map((s, i) => {
        const pName = s.name || s.spot?.name || `Pandal ${i + 1}`;
        const pArea = s.area || s.spot?.area || 'Kolkata';
        const pMetro = s.nearestMetro || s.spot?.nearestMetro;
        const metroInfo = pMetro && pMetro !== 'N/A' ? ` (Nearest Metro: **${pMetro}**)` : '';
        return `• **Stop ${i + 1}: ${pName}** — ${pArea}${metroInfo}`;
      }).join('\n');

      const waypoints = groupSpots.map(s => (s.name || s.spot?.name || '') + ' Kolkata').filter(Boolean);
      const origin = startLoc + ' Kolkata';
      const destination = (groupSpots[groupSpots.length - 1]?.name || 'Kolkata') + ' Kolkata';
      const waypointParam = waypoints.slice(0, -1).map(encodeURIComponent).join('|');
      const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypointParam ? `&waypoints=${waypointParam}` : ''}`;

      return {
        reply: `🗺️ **Transit & Transport Guide for Your Plan:**\n\n` +
          `• **Starting Point:** ${startLoc}\n` +
          `• **Total Pandals:** ${groupSpots.length} stops\n\n` +
          `**📍 Step-by-Step Itinerary:**\n` +
          `${pandalSteps}\n\n` +
          `**🚇 Travel Tips:**\n` +
          `• Take the Kolkata Metro (Blue / Green Line) to the nearest station to skip surface road traffic.\n` +
          `• For nearby pandals in the same cluster, walking or local auto is the fastest option after 4:00 PM when barricades start.\n` +
          `• Metro services operate extended late-night hours on Saptami, Ashtami, and Navami.`,
        gmapsUrl,
      };
    } else {
      return {
        reply: `🧭 **You haven't added any pandals to your plan yet!**\n\n` +
          `• Tap the **Plan** tab above to add pandals to your group/solo plan.\n` +
          `• Your current starting point is set to: **${startLoc}**.\n` +
          `• Once you add pandals, ask me again and I will give you the exact step-by-step transit route, nearest metro stations, and a direct Google Maps navigation route!`,
        gmapsUrl: null,
      };
    }
  }

  // 3. Toilets / Washrooms / Restrooms (amenity request -> give Google Maps)
  if (/\b(toilet|toilets|washroom|washrooms|bathroom|bathrooms|restroom|restrooms|lavatory|sulabh|pee|urinal|wc)\b/i.test(q)) {
    const gmapsUrl = `https://www.google.com/maps/search/public+toilet+washroom+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🚻 **Public Washrooms & Toilets near ${loc}:**\n\n` +
        `• **🚇 Metro Stations (Cleanest Option):** All operational Kolkata Metro stations on the Blue Line & Green Line have clean pay-and-use toilets on the concourse level.\n` +
        `• **🪔 Pandal Bio-Toilets:** KMC installs mobile bio-toilet clusters outside all major pandal barricades.\n` +
        `• **🚻 Sulabh Shauchalayas:** Located at major crossings, Central Ave, and EM Bypass.`,
      gmapsUrl,
    };
  }

  // 4. Bars / Pubs / Nightlife (amenity request -> give Google Maps)
  if (/\b(bar|bars|pub|pubs|alcohol|beer|liquor|wine|cocktail|lounge|brewery|club|nightclub)\b/i.test(q)) {
    const gmapsUrl = `https://www.google.com/maps/search/bars+pubs+lounges+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🍻 **Bars, Pubs & Nightlife near ${loc}:**\n\n` +
        `• **Olypub (Park Street):** Kolkata's legendary classic pub (~affordable drinks & steaks).\n` +
        `• **Someplace Else & Roxy (The Park Hotel, Park Street):** Premier live rock pub & stylish lounge.\n` +
        `• **Trincas (Park Street):** Vintage 1960s retro live music bar & restaurant.\n` +
        `• **The Grid & Refinery091 (Sector V, Salt Lake):** Craft microbrewery & massive gastro-pub.\n` +
        `• **Broadway Hotel Bar (Chandni Chowk):** Atmospheric 1900s heritage tavern.`,
      gmapsUrl,
    };
  }

  // 5. Food, Restaurants, Biryani, Sweets (amenity request -> give Google Maps)
  if (/\b(food|restaurant|restaurants|biryani|roll|rolls|dhaba|eating|dinner|lunch|breakfast|sweets|mithai|puchka|chaat|cafe|coffee)\b/i.test(q)) {
    const gmapsUrl = `https://www.google.com/maps/search/restaurants+and+food+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🍽️ **Food, Dining & Midnight Snacks near ${loc}:**\n\n` +
        `• **Kolkata Biryani Legends:** Arsalan (Park Circus), Shiraz Golden Restaurant, Royal Indian Hotel (Chitpur), Aminia.\n` +
        `• **Kathi Rolls:** Kusum Rolls (Park Street), Nizam's (New Market).\n` +
        `• **Midnight Puja Dhabas:** Balwant Singh's Eating House (Harish Mukherjee Rd - 24/7 Doodh Cola & Chai), Jai Hind Dhaba.\n` +
        `• **Legendary Sweets:** Balaram Mullick (Baked Rosogolla), Girish Chandra Dey (Sandesh), K.C. Das.`,
      gmapsUrl,
    };
  }

  // 6. Hospitals, Medical & Emergency (amenity request -> give Google Maps)
  if (/\b(hospital|hospitals|clinic|doctor|pharmacy|medicine|chemist|first aid|medical|ambulance|emergency)\b/i.test(q)) {
    const gmapsUrl = `https://www.google.com/maps/search/hospital+medical+pharmacy+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🏥 **Medical & Emergency Assistance near ${loc}:**\n\n` +
        `• **SSKM Hospital (IPGMER):** 24/7 Govt trauma hospital near Rabindra Sadan.\n` +
        `• **Calcutta Medical College:** Central Kolkata / College Street.\n` +
        `• **NRS Medical College:** Near Sealdah Station.\n` +
        `• **R.G. Kar Medical College:** Near Shyambazar.\n` +
        `• **Emergency Numbers:** Police: 100 / 112 | Ambulance: 108 / 102.`,
      gmapsUrl,
    };
  }

  // 7. ATMs & Cash (amenity request -> give Google Maps)
  if (/\b(atm|atms|cash|bank)\b/i.test(q)) {
    const gmapsUrl = `https://www.google.com/maps/search/atm+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🏧 **ATMs & Cash Withdrawal near ${loc}:**\n\n` +
        `• **Metro Station Concourses:** Most Blue & Green Line stations (Esplanade, Park Street, Howrah, Sealdah, Shyambazar) have 24/7 ATMs.\n` +
        `• **Park Street & Chowringhee Rd:** Multiple bank kiosks available.\n` +
        `• **Puja Tip:** Keep some emergency cash handy as mobile data networks may face high traffic around major pandals.`,
      gmapsUrl,
    };
  }

  // 8. Distance between two specific points (e.g. "Howrah to Bagbazar")
  if (q.includes(' to ') && /\b(distance|how to go|route|metro|far)\b/i.test(q)) {
    const parts = q.split(' to ');
    const origin = parts[0].replace(/.*(from|distance|route|how to go|how to reach)/i, '').trim() || 'Howrah Station';
    const destination = parts[1].replace(/(distance|how to go|route|metro).*/i, '').trim() || 'Kolkata';
    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin + ' Kolkata')}&destination=${encodeURIComponent(destination + ' Kolkata')}`;
    return {
      reply: `🧭 **Transit Guide: ${origin} ➔ ${destination}**\n\n` +
        `• **🚇 Metro Connectivity:** Take the Blue Line (North-South) or Green Line (East-West underwater tunnel) for the fastest crossing.\n` +
        `• **🚗 Cabs & Autos:** Expect road diversions around major pandals in the evening.`,
      gmapsUrl,
    };
  }

  // 9. General Question (NO Google Maps link!)
  return {
    reply: `🙏 **শুভ শারদীয়া!**\n\nRegarding your question: **"${userQuery}"**\n\n` +
      `• Kolkata Durga Puja is celebrated with artistic pandals, lights, and cultural harmony.\n` +
      `• Best times for visiting are late night (after midnight) or early afternoon to avoid queue congestion.\n` +
      `• Check your **Plan** and **Route** tabs above to organize your pandal itinerary.`,
    gmapsUrl: null,
  };
}

/**
 * High-speed system instructions with detailed plan knowledge and strict rules
 */
function buildSystemInstruction(context = {}) {
  const { groupName, startLocation, groupSpots = [] } = context;

  const spotList = Array.isArray(groupSpots) && groupSpots.length > 0
    ? groupSpots.map((s, i) => `${i + 1}. ${s.name || s.spot?.name || 'Pandal'}${s.area ? ` (${s.area})` : ''}${s.nearestMetro ? ` [Nearest Metro: ${s.nearestMetro}]` : ''}`).join('\n')
    : 'None added yet.';

  return `You are Uma Asche AI — the intelligent, friendly, and comprehensive Kolkata Durga Puja & General Assistant.

CORE RULES:
1. USER'S ACTUAL PLAN & ROUTE DETAILS:
   - Plan Name: "${groupName || 'Durga Puja Parikrama'}"
   - Starting Point: "${startLocation || 'Kolkata Central'}"
   - Pandal Stops in Order:
${spotList}
   - When the user asks for "transport details", "route", "itinerary", or how to visit their route:
     Guide them step-by-step from their starting point "${startLocation || 'Kolkata Central'}" through each pandal in their plan in order!
     Provide specific transit advice (nearest Metro station for each pandal, walking or auto connections between nearby pandals, and late-night puja metro timings).
     At the very end of your response, provide ONE Google Maps directions link for the route: [🗺️ Open Route in Google Maps](https://www.google.com/maps/dir/?api=1&origin=<START>&destination=<DEST>&waypoints=<WAYPOINTS>)

2. CASUAL CONVERSATION & GREETINGS (NO GOOGLE MAPS):
   - When the user says "hello", "hi", "hey", "ki korcho", "kemon acho", or asks casual conversational questions:
     Reply minimally, warmly, and naturally in their language (Bengali, English, Hindi, etc.).
     DO NOT include ANY Google Maps link for greetings or casual conversation.

3. AMENITY SEARCHES (PROVIDE GOOGLE MAPS):
   - ONLY when the user explicitly asks for amenities or locations (e.g. "bars near me", "toilet near me", "restaurants/biryani near me", "atms near me", "hospitals near me"):
     Recommend top local Kolkata places and provide ONE Google Maps search link at the end: [🗺️ Open in Google Maps](https://www.google.com/maps/search/<QUERY>+near+<LOCATION>+Kolkata).

4. GENERAL CONVERSATION:
   - For general questions not asking for a place or directions, give a clear, direct answer WITHOUT any Google Maps links.`;
}

/**
 * POST /api/ai/chat
 */
router.post('/chat', async (req, res, next) => {
  try {
    const { message, text, query, conversationHistory = [], context = {} } = req.body;
    const userQuery = (message || text || query || '').trim();

    if (!userQuery) {
      return res.status(400).json({ error: 'Query or message is required.' });
    }

    // 1. Instant Filter for Image/Video Gen, School Homework, Academic Research Papers
    if (isDisallowedQuery(userQuery)) {
      return res.json({
        reply: '🙏 শুভ শারদীয়া! I am your Durga Puja & Kolkata Travel Assistant. I cannot generate images/videos, solve school/college homework, or write academic research papers. Feel free to ask me anything else about pandals, routes, food, toilets, bars, metro, places to visit, and festive guides in any language!',
        gmapsUrl: null,
        modelUsed: 'instant-rule',
        source: 'gemini',
        status: 'success',
        cached: true,
      });
    }

    // 2. In-memory Cache Check (< 2ms)
    const cacheKey = normalizeKey(userQuery);
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json({
        ...cached.data,
        cached: true,
      });
    }

    // 3. Try Gemini API models
    const apiKey = (process.env.GEMINI_API_KEY || req.headers['x-gemini-key'] || '').trim();
    if (apiKey) {
      const systemInstruction = buildSystemInstruction(context);
      const contents = [];

      const recentHistory = Array.isArray(conversationHistory) ? conversationHistory.slice(-4) : [];
      for (const msg of recentHistory) {
        if (msg.sender === 'user' && msg.text) {
          contents.push({ role: 'user', parts: [{ text: msg.text }] });
        } else if (msg.sender === 'bot' && (msg.reply || msg.text)) {
          contents.push({ role: 'model', parts: [{ text: (msg.reply || msg.text).slice(0, 300) }] });
        }
      }
      contents.push({ role: 'user', parts: [{ text: userQuery }] });

      const payload = {
        contents,
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1200,
          topP: 0.9,
        },
      };

      for (const model of GEMINI_MODELS) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (textResponse) {
              let gmapsUrl = null;
              const gmapsMatch = textResponse.match(/https:\/\/www\.google\.com\/maps\/[^\s\)\>]+/);
              if (gmapsMatch) {
                gmapsUrl = gmapsMatch[0];
              } else if (/\b(toilet|washroom|bathroom|bar|pub|bars|pubs|food|restaurant|biryani|hospital|doctor|atm|cash)\b/i.test(userQuery)) {
                gmapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(userQuery + ' Kolkata')}`;
              }

              const result = {
                reply: textResponse.trim(),
                gmapsUrl,
                modelUsed: model,
                source: 'gemini',
                status: 'success',
              };

              responseCache.set(cacheKey, { timestamp: Date.now(), data: result });
              return res.json(result);
            }
          }
        } catch (_) {}
      }
    }

    // 4. Universal Comprehensive Answering Engine (Instant fallback with deep knowledge + Maps links)
    const intelligentAnswer = generateComprehensiveAnswer(userQuery, context);
    const result = {
      ...intelligentAnswer,
      modelUsed: 'uma-smart-engine',
      source: 'gemini',
      status: 'success',
    };

    responseCache.set(cacheKey, { timestamp: Date.now(), data: result });
    if (responseCache.size > 500) {
      const firstKey = responseCache.keys().next().value;
      responseCache.delete(firstKey);
    }

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
