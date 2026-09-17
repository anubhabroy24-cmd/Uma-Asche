const express = require('express');
const router = express.Router();

const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro'
];

/**
 * Build system prompt for Kolkata Durga Puja 2026
 */
function buildSystemInstruction(context = {}) {
  const { groupName, startLocation, groupSpots = [], userLocation } = context;

  const spotNames = Array.isArray(groupSpots)
    ? groupSpots
        .map((s, i) => `${i + 1}. ${s.name || s.spot?.name || 'Pandal'}${s.area ? ` (${s.area})` : ''}`)
        .join('\n')
    : '';

  let locationContext = '';
  if (userLocation && userLocation.latitude && userLocation.longitude) {
    locationContext = `\nUser's current GPS location: Lat ${Number(userLocation.latitude).toFixed(4)}, Lng ${Number(userLocation.longitude).toFixed(4)} (Kolkata).`;
  }

  return `You are the intelligent Durga Puja 2026 AI Assistant for the "Uma Asche" Kolkata Durga Puja Hopper & Plan app.

STRICT DOMAIN CONSTRAINTS:
1. ONLY answer questions related to Kolkata Durga Puja 2026, pandals, puja routes, travel distances, transportation (Kolkata Metro Blue Line & Green Line underwater metro, walking routes, buses, cabs, autos), and public amenities (such as public washrooms/toilets, water, medical help).
2. STRICT REFUSAL: If the user asks maths questions (e.g. "solve 2x + 10 = 20", arithmetic, algebra), homework, syllabus, physics, chemistry, school essays, or anything unrelated to Kolkata Durga Puja planning, you MUST politely refuse:
   "🙏 শুভ শারদীয়া! I only assist with Kolkata Durga Puja plans, pandal distances, transit routes, and public amenities. I do not solve math, syllabus, or academic questions."
3. WASHROOMS & TOILETS: When the user asks for bathrooms, toilets, washrooms, or Sulabh Shauchalayas, suggest Kolkata Metro station concourses and KMC bio-toilets outside pandals, and ALWAYS include a clickable Google Maps search link in this exact format:
   [🗺️ Open Washrooms in Google Maps](https://www.google.com/maps/search/public+toilet+washroom+near+<LOCATION_NAME_OR_PANDAL>)
4. TRANSIT GUIDANCE: When asked directions (e.g. "Howrah to Maidan distance how to go"), give exact Kolkata transit advice:
   - Green Line underwater metro from Howrah Station to Esplanade, then Blue Line to Maidan (total ~15-20 mins).
   - Driving distance is ~4.6 km (~18 mins). Walking distance is ~4.5 km (~55 mins) via Vidyasagar Setu / Strand Road.
   - Include a clickable Google Maps directions link: [🗺️ Open Route in Google Maps](https://www.google.com/maps/dir/?api=1&origin=<ORIGIN>&destination=<DESTINATION>)
5. TONE: Warm, helpful, and festive in English, Bengali (বাংলা), or Banglish as preferred by the user. Keep formatting clean with bullet points and bold highlights.

CURRENT USER PLAN CONTEXT:
- Group Plan: "${groupName || 'Kolkata Pandal Parikrama'}"
- Designated Starting Point: "${startLocation || 'Kolkata Central'}"
- Planned Stops in Plan:
${spotNames || 'None added yet.'}
${locationContext}`;
}

/**
 * POST /api/ai/chat
 * Server-side endpoint passing questions through Google Gemini API
 */
router.post('/chat', async (req, res, next) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || req.headers['x-gemini-key'];
    if (!apiKey) {
      return res.status(500).json({
        error: 'Backend Gemini API key not configured on server.',
      });
    }

    const { message, text, query, conversationHistory = [], context = {}, contents: rawContents, systemInstruction: rawSystemInstruction } = req.body;
    const userQuery = (message || text || query || '').trim();

    let contents = [];
    let systemInstruction = rawSystemInstruction;

    if (rawContents && Array.isArray(rawContents) && rawContents.length > 0) {
      contents = rawContents;
    } else if (userQuery) {
      // Build contents array from conversationHistory + current user query
      const recentHistory = Array.isArray(conversationHistory) ? conversationHistory.slice(-6) : [];
      for (const msg of recentHistory) {
        if (msg.sender === 'user' && msg.text) {
          contents.push({ role: 'user', parts: [{ text: msg.text }] });
        } else if (msg.sender === 'bot' && (msg.reply || msg.text)) {
          contents.push({ role: 'model', parts: [{ text: msg.reply || msg.text }] });
        }
      }
      contents.push({ role: 'user', parts: [{ text: userQuery }] });
    } else {
      return res.status(400).json({ error: 'Query or message is required.' });
    }

    if (!systemInstruction) {
      systemInstruction = buildSystemInstruction(context);
    }

    const payload = {
      contents,
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: req.body.generationConfig || {
        temperature: 0.7,
        maxOutputTokens: 1000,
        topP: 0.9,
      },
    };

    let lastError = null;

    // Try models in order
    for (const model of GEMINI_MODELS) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error?.message || `HTTP ${response.status}`;
          // If model not found or deprecated, try next model
          if (response.status === 404) {
            lastError = new Error(`Model ${model}: ${errMsg}`);
            continue;
          }
          return res.status(response.status).json({ error: errMsg });
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const textResponse = candidate?.content?.parts?.[0]?.text;

        if (!textResponse) {
          lastError = new Error(`Model ${model} returned empty response`);
          continue;
        }

        // Extract Google Maps URL if any
        let gmapsUrl = null;
        const gmapsMatch = textResponse.match(/https:\/\/www\.google\.com\/maps\/[^\s\)\>]+/);
        if (gmapsMatch) {
          gmapsUrl = gmapsMatch[0];
        }

        return res.json({
          reply: textResponse,
          gmapsUrl,
          modelUsed: model,
          source: 'gemini',
          status: 'success'
        });
      } catch (err) {
        lastError = err;
      }
    }

    return res.status(502).json({
      error: lastError ? lastError.message : 'All Gemini models failed to generate content.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
