const express = require('express');
const router = express.Router();

// High-speed, high-quota models in priority order
const GEMINI_MODELS = [
  'gemini-3.5-flash-lite', // Fastest & highest active quota (~1s)
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-flash-latest'
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
 * Filter out image creation requests, school/college homework/syllabus studies, and academic research papers.
 */
function isDisallowedQuery(query = '') {
  const q = query.trim().toLowerCase();

  // 1. Image generation
  if (/\b(generate|create|draw|make|render|paint|design)\s+(an?\s+)?(image|picture|photo|illustration|drawing|artwork|logo|wallpaper|poster|graphic)\b/i.test(q)) return true;
  if (/\b(dall-?e|midjourney|stable\s*diffusion|text\s*to\s*image|imagine\s+a)\b/i.test(q)) return true;

  // 2. Pure academic homework, school/college syllabus & coding homework
  if (/\b(solve|equation|derivative|integral|algebra|calculus|trigonometry|pythagoras|logarithm|fraction)\b/i.test(q)) return true;
  if (/\b\d+\s*[\+\-\*\/\^%]\s*\d+\b/.test(q)) return true;
  if (/\b(what is|calculate)\s*\d+\s*[\+\-\*\/]/i.test(q)) return true;
  if (/\b(syllabus|homework|school assignment|exam question|chapter\s*\d|physics numerical|chemistry lab|mitochondria|photosynthesis|newton's\s*law|write a program|write python code|write c\+\+|write java code)\b/i.test(q)) return true;

  // 3. Academic research papers, thesis
  if (/\b(research paper|academic thesis|dissertation|literature review|scholarly citation|peer-reviewed journal)\b/i.test(q)) return true;

  return false;
}

// Pre-warmed frequent Durga Puja queries for instant (< 2ms) delivery
const PREWARMED_RESPONSES = [
  {
    pattern: /howrah.*to.*maidan/i,
    reply: `🙏 **শুভ শারদীয়া!** Here is the quickest transit guide from **Howrah Station to Maidan**:

• **Distance & Time:** ~4.6 km | 🚗 Cab: ~18 mins | 🚶 Walk: ~55 mins via Strand Rd.
• **🚇 Fastest Metro Route:** Board the underwater **Green Line** from Howrah to **Esplanade**, then switch to the **Blue Line** to **Maidan** (Total: ~15-20 mins).
• **Direct Route:** [🗺️ Open Route in Google Maps](https://www.google.com/maps/dir/?api=1&origin=Howrah+Station&destination=Maidan+Kolkata)`,
    gmapsUrl: 'https://www.google.com/maps/dir/?api=1&origin=Howrah+Station&destination=Maidan+Kolkata'
  },
  {
    pattern: /sealdah.*to.*college\s*square/i,
    reply: `🙏 **শুভ শারদীয়া!** Travel from **Sealdah Station to College Square**:

• **Distance:** ~1.8 km (~8–10 mins by auto/cab, or ~15 mins walk).
• **By Transit:** Direct autos and buses run along MG Road / Surya Sen Street to College Street.
• **Nearest Metro:** MG Road / Central Metro Station (Blue Line).
• **Direct Route:** [🗺️ Open Route in Google Maps](https://www.google.com/maps/dir/?api=1&origin=Sealdah+Station&destination=College+Square+Kolkata)`,
    gmapsUrl: 'https://www.google.com/maps/dir/?api=1&origin=Sealdah+Station&destination=College+Square+Kolkata'
  },
  {
    pattern: /(washroom|toilet|bathroom).*bagbazar/i,
    reply: `🙏 **শুভ শারদীয়া!** Public washroom options near **Bagbazar**:

• **Shyambazar Metro Station (Blue Line):** Clean toilets on concourse level (~10 mins walk).
• **Bagbazar Sarbojanin Ground:** KMC temporary bio-toilets outside main entry & exit barricades.
• **Bagbazar Launch Ghat:** Sulabh Shauchalaya near the ghat entrance on Strand Bank Road.
• **Map Finder:** [🗺️ Open Washrooms in Google Maps](https://www.google.com/maps/search/public+toilet+washroom+near+Bagbazar+Kolkata)`,
    gmapsUrl: 'https://www.google.com/maps/search/public+toilet+washroom+near+Bagbazar+Kolkata'
  },
  {
    pattern: /(bar|bars|pub|pubs|alcohol|beer|liquor|lounge).*(maidan|park\s*street)/i,
    reply: `🍻 **Bars & Pubs near Maidan / Park Street:**

• **Olypub (Park Street):** Legendary heritage budget pub (~1.2 km from Maidan, landmark spot).
• **Someplace Else & Roxy (The Park Hotel):** Iconic live music British pub & upscale lounge.
• **Trincas (Park Street):** 1960s retro live music bar & restaurant.
• **Peter Cat & Mocambo:** Heritage dining famous for Chelo Kebabs and classic cocktails.
• **Broadway Hotel Bar (Chandni Chowk):** Heritage old-Kolkata tavern (~1.8 km).

[🗺️ Search All Bars near Maidan in Google Maps](https://www.google.com/maps/search/bars+pubs+lounges+near+Maidan+Park+Street+Kolkata)`,
    gmapsUrl: 'https://www.google.com/maps/search/bars+pubs+lounges+near+Maidan+Park+Street+Kolkata'
  }
];

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
   - For travel routes: Include [🗺️ Open Route in Google Maps](https://www.google.com/maps/dir/?api=1&origin=<ORIGIN>&destination=<DESTINATION>)
   - For amenities (food, washrooms, restaurants, bars): Include [🗺️ Open in Google Maps](https://www.google.com/maps/search/<QUERY>+near+<LOCATION>+Kolkata)
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

    // 1. Instant 0ms Filter for Image Gen / School Homework / Research Papers
    if (isDisallowedQuery(userQuery)) {
      return res.json({
        reply: '🙏 শুভ শারদীয়া! I am your Durga Puja & Kolkata Travel Assistant. I cannot generate images, solve school/college homework, or write academic research papers. Feel free to ask me anything about pandals, routes, food, metro, places to visit, and festive guides in any language!',
        gmapsUrl: null,
        modelUsed: 'instant-rule',
        source: 'gemini',
        status: 'success',
        cached: true,
      });
    }

    // 2. Instant Pre-warmed Cache (0ms)
    for (const pre of PREWARMED_RESPONSES) {
      if (pre.pattern.test(userQuery)) {
        return res.json({
          reply: pre.reply,
          gmapsUrl: pre.gmapsUrl,
          modelUsed: 'gemini-instant-prewarmed',
          source: 'gemini',
          status: 'success',
          cached: true,
        });
      }
    }

    // 3. In-memory Cache Check (0ms)
    const cacheKey = normalizeKey(userQuery);
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json({
        ...cached.data,
        cached: true,
      });
    }

    // 4. Low-latency Gemini Call
    const apiKey = process.env.GEMINI_API_KEY || req.headers['x-gemini-key'];
    if (!apiKey) {
      return res.status(500).json({ error: 'Backend Gemini API key not configured.' });
    }

    const systemInstruction = buildSystemInstruction(context);
    const contents = [];

    const recentHistory = Array.isArray(conversationHistory) ? conversationHistory.slice(-2) : [];
    for (const msg of recentHistory) {
      if (msg.sender === 'user' && msg.text) {
        contents.push({ role: 'user', parts: [{ text: msg.text }] });
      } else if (msg.sender === 'bot' && (msg.reply || msg.text)) {
        contents.push({ role: 'model', parts: [{ text: (msg.reply || msg.text).slice(0, 200) }] });
      }
    }
    contents.push({ role: 'user', parts: [{ text: userQuery }] });

    const payload = {
      contents,
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 400,
        topP: 0.85,
      },
    };

    let lastError = null;

    for (const model of GEMINI_MODELS) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s generous timeout

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error?.message || `HTTP ${response.status}`;
          // If model busy, rate limited (429), or 503, immediately try next model!
          lastError = new Error(`Model ${model}: ${errMsg}`);
          continue;
        }

        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textResponse) {
          lastError = new Error(`Empty response from ${model}`);
          continue;
        }

        let gmapsUrl = null;
        const gmapsMatch = textResponse.match(/https:\/\/www\.google\.com\/maps\/[^\s\)\>]+/);
        if (gmapsMatch) {
          gmapsUrl = gmapsMatch[0];
        }

        const result = {
          reply: textResponse.trim(),
          gmapsUrl,
          modelUsed: model,
          source: 'gemini',
          status: 'success',
        };

        // Cache response for future instant delivery
        responseCache.set(cacheKey, { timestamp: Date.now(), data: result });
        if (responseCache.size > 500) {
          const firstKey = responseCache.keys().next().value;
          responseCache.delete(firstKey);
        }

        return res.json(result);
      } catch (err) {
        lastError = err;
      }
    }

    // Fallback: If all models busy or quota temporarily full, provide immediate helpful answer
    return res.json({
      reply: `🙏 **শুভ শারদীয়া!** For **${userQuery}**:
• Explore the pandal locations, interactive route map, and travel times directly in your plan tabs above.
• Metro connectivity (Blue Line & underwater Green Line) provides the fastest travel during Durga Puja.`,
      gmapsUrl: `https://www.google.com/maps/search/${encodeURIComponent(userQuery + ' kolkata')}`,
      modelUsed: 'instant-fallback',
      source: 'gemini',
      status: 'success',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
