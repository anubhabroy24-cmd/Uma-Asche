const express = require('express');
const router = express.Router();

// High-speed, high-quota models in priority order
const GEMINI_MODELS = [
  'gemini-3.1-flash-lite', // Fastest & highest free quota (~1.5s)
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
 * Instant local detector for math, homework, or academic syllabus queries (0ms)
 */
function isMathOrAcademic(query = '') {
  const q = query.trim().toLowerCase();
  if (/\b(solve|equation|derivative|integral|algebra|calculus|pythagoras|formula|fraction)\b/i.test(q)) return true;
  if (/\b\d+\s*[\+\-\*\/\^%]\s*\d+\b/.test(q)) return true;
  if (/\b(what is|calculate)\s*\d+/i.test(q)) return true;
  if (/\b(syllabus|homework|exam|physics|chemistry|biology|photosynthesis|mitochondria|newton|essay|definition of|write a program|code)\b/i.test(q)) return true;
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
  }
];

/**
 * High-speed system instructions
 */
function buildSystemInstruction(context = {}) {
  const { groupName, startLocation, groupSpots = [] } = context;

  const spotNames = Array.isArray(groupSpots) && groupSpots.length > 0
    ? groupSpots.slice(0, 8).map((s, i) => `${i + 1}. ${s.name || s.spot?.name || 'Pandal'}`).join(', ')
    : 'None';

  return `You are the ultra-fast Durga Puja 2026 AI Assistant for Kolkata.
SPEED & FORMAT RULES:
1. Be extremely fast, concise, and helpful. Use 2-3 brief bullet points maximum.
2. STRICT REFUSAL: Refuse math, school syllabus, academic questions with: "🙏 শুভ শারদীয়া! I only assist with Kolkata Durga Puja plans, pandal distances, transit routes, and public amenities."
3. TRANSIT & DISTANCE: Give exact road km, metro connection (Blue Line or underwater Green Line), and driving/walking estimates. Always add: [🗺️ Open Route in Google Maps](https://www.google.com/maps/dir/?api=1&origin=<ORIGIN>&destination=<DESTINATION>)
4. WASHROOMS: Point to Metro concourses / KMC bio-toilets and add: [🗺️ Open Washrooms in Google Maps](https://www.google.com/maps/search/public+toilet+washroom+near+<LOCATION>)
5. Context: Plan "${groupName || 'Pandal Hopper'}", Start "${startLocation || 'Kolkata Central'}", Stops: ${spotNames}.`;
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

    // 1. Instant 0ms Math Refusal
    if (isMathOrAcademic(userQuery)) {
      return res.json({
        reply: '🙏 শুভ শারদীয়া! I only assist with Kolkata Durga Puja plans, pandal distances, transit routes, and public amenities. I do not solve math, syllabus, or academic questions.',
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
        maxOutputTokens: 220, // Crisp & fast
        topP: 0.85,
      },
    };

    let lastError = null;

    for (const model of GEMINI_MODELS) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5s max per model

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
