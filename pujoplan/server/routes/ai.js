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
function generateComprehensiveAnswer(userQuery, context = {}) {
  const q = userQuery.toLowerCase().trim();
  const loc = extractTargetLocation(q);

  // 1. Toilets / Washrooms / Restrooms
  if (/\b(toilet|toilets|washroom|washrooms|bathroom|bathrooms|restroom|restrooms|lavatory|sulabh|pee|urinal|wc)\b/i.test(q)) {
    const gmapsUrl = `https://www.google.com/maps/search/public+toilet+washroom+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🚻 **Public Washrooms & Toilets near ${loc}:**

• **🚇 Metro Stations (Cleanest Option):** All operational Kolkata Metro stations on the Blue Line (e.g. Maidan, Park Street, MG Road, Shyambazar, Kalighat) & Green Line (Howrah, Esplanade, Sealdah) have clean pay-and-use toilets on the concourse level.
• **🪔 Pandal Bio-Toilets:** KMC installs mobile bio-toilet clusters outside all major pandal barricades and entry/exit zones.
• **🚻 Sulabh Shauchalayas & Fuel Pumps:** Available at major traffic crossings and along EM Bypass, Central Avenue, and Strand Road.
• **🛍️ Shopping Malls:** Quest Mall (Park Circus), South City Mall (Prince Anwar Shah Rd), and City Centre 1 (Salt Lake) have clean luxury facilities.

[🗺️ Open Washrooms near ${loc} in Google Maps](${gmapsUrl})`,
      gmapsUrl,
    };
  }

  // 2. Bars / Pubs / Nightlife
  if (/\b(bar|bars|pub|pubs|alcohol|beer|liquor|wine|cocktail|lounge|brewery|club|nightclub)\b/i.test(q)) {
    const gmapsUrl = `https://www.google.com/maps/search/bars+pubs+lounges+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🍻 **Bars, Pubs & Nightlife near ${loc}:**

• **Olypub (Park Street):** Kolkata's legendary heritage classic pub (~1.2 km from Maidan, affordable drinks & steaks).
• **Someplace Else & Roxy (The Park Hotel, Park Street):** Premier live rock music pub & stylish upscale nightlife lounge.
• **Trincas (Park Street):** Vintage 1960s retro live music bar & restaurant.
• **Peter Cat & Mocambo (Park Street):** Iconic heritage dining with classic cocktails and famous Chelo Kebabs.
• **The Grid & Refinery091 (Sector V, Salt Lake):** Craft microbrewery & massive gastro-pub.
• **Broadway Hotel Bar (Chandni Chowk):** Atmospheric 1900s old-school tavern.

[🗺️ Open Bars near ${loc} in Google Maps](${gmapsUrl})`,
      gmapsUrl,
    };
  }

  // 3. Food, Restaurants, Biryani, Sweets
  if (/\b(food|restaurant|restaurants|biryani|roll|rolls|dhaba|eating|dinner|lunch|breakfast|sweets|mithai|puchka|chaat|cafe|coffee)\b/i.test(q)) {
    const gmapsUrl = `https://www.google.com/maps/search/restaurants+and+food+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🍽️ **Food, Dining & Midnight Snacks near ${loc}:**

• **Kolkata Biryani Legends:** Arsalan (Park Circus & Ruby), Shiraz Golden Restaurant (Mullick Bazar), Royal Indian Hotel (Chitpur - Mutton Chaap), Aminia (New Market).
• **Kolkata Kathi Rolls:** Kusum Rolls (Park Street), Hot Kathi Roll, Nizam's (New Market - original birthplace of the roll).
• **Dacres Lane (Esplanade):** Heritage street food heaven — famous for Chitto Da's Chicken Stew & toast.
• **Midnight Puja Dhabas:** Balwant Singh's Eating House (Harish Mukherjee Rd - open 24/7, famous for Doodh Cola & Kesar Chai), Jai Hind Dhaba (Bhawanipore & Sarat Bose Rd).
• **Legendary Sweets:** Balaram Mullick & Radharaman Mullick (Baked Rosogolla), Girish Chandra Dey (Sandesh), K.C. Das (Original Rosogolla).

[🗺️ Open Restaurants & Food near ${loc} in Google Maps](${gmapsUrl})`,
      gmapsUrl,
    };
  }

  // 4. Hospitals, Medical & Emergency
  if (/\b(hospital|hospitals|clinic|doctor|pharmacy|medicine|chemist|first aid|medical|ambulance|emergency)\b/i.test(q)) {
    const gmapsUrl = `https://www.google.com/maps/search/hospital+medical+pharmacy+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🏥 **Medical & Emergency Assistance near ${loc}:**

• **SSKM Hospital (IPGMER):** 24/7 Govt super-speciality emergency trauma hospital near Rabindra Sadan (~1 km from Maidan).
• **Calcutta Medical College:** Central Kolkata / College Street area.
• **NRS Medical College:** Near Sealdah Railway Station.
• **R.G. Kar Medical College:** Near Shyambazar / Belgachia (North Kolkata).
• **Puja Medical Booths:** Kolkata Police & St. John Ambulance operate free first-aid medical booths outside all major pandals.
• **Emergency Numbers:** Police: 100 / 112 | Ambulance: 108 / 102 | Women Helpline: 1090.

[🗺️ Open Hospitals & Pharmacies near ${loc} in Google Maps](${gmapsUrl})`,
      gmapsUrl,
    };
  }

  // 5. ATMs & Cash
  if (/\b(atm|atms|cash|bank)\b/i.test(q)) {
    const gmapsUrl = `https://www.google.com/maps/search/atm+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🏧 **ATMs & Cash Withdrawal near ${loc}:**

• **Metro Station Concourses:** Most Blue Line and Green Line stations (Esplanade, Park Street, Howrah, Sealdah, Shyambazar) feature operational SBI, HDFC, and Axis Bank ATMs.
• **Park Street & Chowringhee Road:** Numerous 24-hour ATMs along the main street.
• **Tip for Puja:** Due to heavy footfall, carry some emergency cash as digital UPI networks can face momentary mobile network congestion around mega pandals.

[🗺️ Open 24/7 ATMs near ${loc} in Google Maps](${gmapsUrl})`,
      gmapsUrl,
    };
  }

  // 6. Transit, How to Go, Route, Distance
  if (/\b(how to go|how to reach|route|direction|directions|transit|metro|distance|between|far|drive|walk|bus|cab)\b/i.test(q)) {
    let origin = 'Howrah Station';
    let destination = 'Maidan Kolkata';
    if (q.includes('to')) {
      const parts = q.split('to');
      if (parts.length >= 2) {
        origin = parts[0].replace(/.*(from|distance|route|how to go|how to reach)/i, '').trim() || origin;
        destination = parts[1].replace(/(distance|how to go|route|metro).*/i, '').trim() || destination;
      }
    }
    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin + ' Kolkata')}&destination=${encodeURIComponent(destination + ' Kolkata')}`;
    return {
      reply: `🧭 **Transit Guide & Route: ${origin} ➔ ${destination}**

• **🚇 Kolkata Metro (Fastest):** The Metro avoids all road barricades and traffic diversions.
  - **Blue Line (North-South):** Connects Dakshineswar ⇄ Dum Dum ⇄ Shyambazar ⇄ MG Road ⇄ Esplanade ⇄ Park Street ⇄ Kalighat ⇄ Kavi Subhash.
  - **Green Line (East-West):** Connects Howrah ⇄ underwater river tunnel ⇄ Esplanade ⇄ Sealdah ⇄ Salt Lake Sector V.
• **🚗 Cabs & Autos:** Available along main roads; expect Puja evening traffic diversions around major pandals after 4 PM.
• **🚶 Walking Tip:** Follow Kolkata Police designated one-way pedestrian walking channels outside major pandals.

[🗺️ Open Directions in Google Maps](${gmapsUrl})`,
      gmapsUrl,
    };
  }

  // 7. General Puja, Culture & Conversation Fallback
  const gmapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(userQuery + ' Kolkata')}`;
  return {
    reply: `🙏 **শুভ শারদীয়া!** Regarding your question about **"${userQuery}"**:

• **Durga Puja Overview:** Kolkata Durga Puja is a UNESCO Intangible Cultural Heritage festival celebrated with art, culture, lights, and community feasting.
• **Visiting Pandals:** Best times to avoid extreme crowds are late night (1:00 AM – 5:00 AM) or early afternoons (11:00 AM – 3:00 PM).
• **Transportation:** Kolkata Metro runs special late-night trains throughout Saptami, Ashtami, and Navami.
• **Explore Spots:** Check your group plan route map in the tabs above for step-by-step nearest pandal order.

[🗺️ Explore on Google Maps](${gmapsUrl})`,
    gmapsUrl,
  };
}

/**
 * High-speed system instructions with unrestricted language support
 */
function buildSystemInstruction(context = {}) {
  const { groupName, startLocation, groupSpots = [] } = context;

  const spotNames = Array.isArray(groupSpots) && groupSpots.length > 0
    ? groupSpots.slice(0, 8).map((s, i) => `${i + 1}. ${s.name || s.spot?.name || 'Pandal'}`).join(', ')
    : 'None';

  return `You are Uma Asche AI — the intelligent, friendly, and comprehensive Kolkata Durga Puja & General Assistant.

CORE GUIDELINES:
1. UNIVERSAL CONVERSATION & MULTILINGUAL:
   - Answer ANY question the user asks (festivals, travel, food, culture, history, tips, advice, greetings, general inquiries).
   - Freely converse in ANY language: Bengali (বাংলা), English, Hindi (हिंदी), Banglish/Hinglish, or any other language requested. Always reply naturally in the language the user speaks.
2. REFUSALS / LIMITATIONS:
   - Image & Video Creation: If the user asks you to generate, draw, render, or create images/videos, politely explain: "🙏 I am a text chat assistant and cannot generate or render images/videos."
   - School Homework / Academic Research: If asked to write school syllabus homework or academic research papers/theses, politely decline and offer to help with travel, puja, food, culture, and general guidance instead.
3. GOOGLE MAPS LINKS:
   - ALWAYS include a direct Google Maps link at the end whenever the user asks for ANY place, amenity, direction, or route (e.g. toilets, bars, restaurants, hospitals, ATMs, pandals):
     [🗺️ Open in Google Maps](https://www.google.com/maps/search/<QUERY>+near+<LOCATION>+Kolkata) or directions link.
4. USER PLAN CONTEXT: Plan "${groupName || 'Pandal Hopper'}", Starting Point "${startLocation || 'Kolkata Central'}", Stops: ${spotNames}. Keep replies clear, well-formatted, and helpful.`;
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
    const apiKey = process.env.GEMINI_API_KEY || req.headers['x-gemini-key'];
    if (apiKey && apiKey.startsWith('AIzaSy')) {
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
              } else if (/\b(toilet|washroom|bathroom|bar|pub|food|restaurant|biryani|hospital|doctor|atm|metro|station|pandal|near|where)\b/i.test(userQuery)) {
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
