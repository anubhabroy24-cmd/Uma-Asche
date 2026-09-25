/**
 * Google Gemini API Client Service for Durga Puja 2026 Assistant
 * Automatically connects to backend /api/ai/chat
 */
import api from './api';

const GEMINI_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
];


const DEFAULT_CLIENT_KEY = (typeof atob === 'function' ? atob('QVEuQWI4Uk42SWgzaGRHZG5jampRdWozZXF0X3dqSWl1cTFva1A5ZEU0LXY1TmNrLS03aVE=') : '');

/**
 * Retrieve active Gemini API key if present in client environment
 */
export function getGeminiApiKey() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) {
    return import.meta.env.VITE_GEMINI_API_KEY.trim();
  }
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('pp_gemini_api_key');
    if (local && local.trim()) return local.trim();
  }
  return DEFAULT_CLIENT_KEY;
}

/**
 * Save Gemini API Key into localStorage (optional helper)
 */
export function setGeminiApiKey(key) {
  if (typeof window !== 'undefined') {
    if (!key || !key.trim()) {
      localStorage.removeItem('pp_gemini_api_key');
    } else {
      localStorage.setItem('pp_gemini_api_key', key.trim());
    }
  }
}


/**
 * Build fallback system instruction for client-side direct calls if backend is offline
 */
function buildSystemInstruction(context = {}) {
  const { groupName, startLocation, groupSpots = [], waypoints = [], userLocation } = context;

  const allStops = (groupSpots && groupSpots.length > 0)
    ? groupSpots
    : (waypoints && waypoints.length > 0)
      ? waypoints.filter(w => w && w.id !== 'start-0' && w.id !== 'start-me')
      : [];

  const spotNames = allStops.length > 0
    ? allStops
        .map((s, i) => `${i + 1}. ${s.name || s.spot?.name || 'Pandal'}${s.area ? ` (${s.area})` : ''}${s.nearestMetro ? ` [Nearest Metro: ${s.nearestMetro}]` : ''}`)
        .join('\n')
    : 'None added yet.';

  let locationContext = '';
  if (userLocation && userLocation.latitude && userLocation.longitude) {
    locationContext = `\nUser's current GPS location: Lat ${Number(userLocation.latitude).toFixed(4)}, Lng ${Number(userLocation.longitude).toFixed(4)} (Kolkata).`;
  }

  return `You are Uma Asche AI — an unrestricted, intelligent, helpful AI assistant powered by Google Gemini.
You have FULL ACCESS to chat about everything with the user without any restrictions or refusals (math, coding, science, general chat, Durga Puja, metro, routes, etc.). Answer everything directly in the user's language.

CRITICAL RULES:
1. MULTI-LANGUAGE ACCURACY:
   - Accept questions in ANY language: Bengali (বাংলা), English, Hindi (हिंदी), Banglish, or Hinglish.
   - ALWAYS respond in the EXACT SAME LANGUAGE and script the user used!

2. USER'S ACTUAL PLAN & ROUTE DETAILS:
   - Plan Name: "${groupName || 'Durga Puja Parikrama'}"
   - Starting Point: "${startLocation || 'Kolkata Central'}"
   - Pandal Stops in Order:
${spotNames}

3. ROUTE & TRANSPORT DETAILS:
   - When asked about route details (e.g. "You know about my route details?", "what is my route?", "আমার রুট জানো?"):
     Confirm you know their plan! List the starting point and each planned pandal in sequence with friendly puja commentary. Do NOT include Google Maps links.
   - When asked for "transport details", "transit", "how to visit", "কীভাবে যাব", "যাতায়াত ব্যবস্থা", "পরিবহন", "kaise jaye", or how to travel between pandals:
     Guide them step-by-step from "${startLocation || 'Kolkata Central'}" all the way through each consecutive pandal in their plan until the end!
     Provide specific transit advice (nearest Metro station for each pandal on Blue Line / Green Line underwater tunnel, walking or auto connections between nearby pandals, and late-night puja metro timings).
     Do NOT include Google Maps links unless the user specifically asked for a map/link!

4. RULES FOR GOOGLE MAPS LINKS:
   - DO NOT provide a Google Maps link for general questions, greetings, or route questions!
   - ONLY include a Google Maps link if:
     a) The user explicitly asks for amenities or nearby places (e.g. "toilet near me", "washroom", "bars near me", "restaurants", "food", "ATM", "hospital").
     b) The user explicitly asks for navigation or a map link ("give google maps link", "show on map").
     c) Point-to-point transit directions between two specified locations (e.g. Howrah to Bagbazar).
   - If providing a link, format it as: [🗺️ Open in Google Maps](https://www.google.com/maps/search/<query>+Kolkata)

5. CASUAL CHAT & FESTIVE SPIRIT:
   - Warm, intelligent, natural responses with Durga Puja festival greetings (শুভ শারদীয়া! 🙏 / Happy Durga Puja!). Never sound like a robotic pre-recorded script!

6. DIRECT ANSWER ONLY & ULTRA FAST:
   - Output ONLY the direct, helpful answer addressing what the user asked.
   - Keep answers concise and structured with bullet points.
   - If mentioning buses, specify at most 2 to 3 common route numbers (e.g. 237, 45, S3B) or Metro lines. Never output continuous sequences of numbers.
   - Do NOT include filler preambles (such as "Sure, here is...", "As an AI..."), internal reasoning, checklist bullet points, or thoughts. Answer directly, clearly, and concisely in the user's language.
${locationContext}`;
}


/**
 * Send query to backend /api/ai/chat with fallback to direct Gemini REST
 */
export async function sendGeminiMessage(userQuery, conversationHistory = [], context = {}) {
  // 1. First priority: Connect with backend and pass questions through it
  const clientKey = getGeminiApiKey();
  try {
    const res = await api.post('/ai/chat', {
      message: userQuery,
      conversationHistory,
      context,
    }, {
      headers: clientKey ? { 'x-gemini-key': clientKey } : {},
      timeout: 25000,
    });

    if (res.data && res.data.reply) {
      return {
        reply: res.data.reply,
        gmapsUrl: res.data.gmapsUrl,
        modelUsed: res.data.modelUsed || 'gemini-3.5-flash',
        source: 'gemini',
      };
    }
  } catch (backendErr) {
    console.warn('Backend /api/ai/chat call failed, attempting direct Gemini client fallback:', backendErr);
  }

  // 2. Direct fallback (for offline preview / netlify static without proxy)
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const systemInstruction = buildSystemInstruction(context);
  const contents = [];

  const recentHistory = Array.isArray(conversationHistory) ? conversationHistory.slice(-6) : [];
  for (const msg of recentHistory) {
    if (msg.sender === 'user' && msg.text) {
      contents.push({ role: 'user', parts: [{ text: msg.text }] });
    } else if (msg.sender === 'bot' && (msg.reply || msg.text)) {
      if (contents.length > 0) {
        contents.push({ role: 'model', parts: [{ text: msg.reply || msg.text }] });
      }
    }
  }
  contents.push({ role: 'user', parts: [{ text: userQuery }] });

  const payload = {
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 800,
      topP: 0.9,
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  };

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP ${res.status}`;
        throw new Error(`Gemini API (${model}) error: ${errMsg}`);
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      const textResponse = candidate?.content?.parts?.[0]?.text;

      if (!textResponse) {
        throw new Error('Empty response received from Gemini API');
      }

      let extractedGmapsUrl = null;
      const isAmenityOrNav = /\b(toilet|washroom|bathroom|bar|pub|bars|pubs|food|restaurant|biryani|hospital|doctor|atm|cash|map|maps|directions|navigation|where\s+is|near\s+me)\b/i.test(userQuery) ||
        /(টয়লেট|বাথরুম|বার|পাব|রেস্তোরাঁ|খাবার|হাসপাতাল|এটিএম|ম্যাপ|শৌচাগার|शौचालय|बार|रेस्तरां|नक्शा|पास)/i.test(userQuery);

      const gmapsMatch = textResponse.match(/https:\/\/www\.google\.com\/maps\/[^\s\)\>]+/);
      if (gmapsMatch && isAmenityOrNav) {
        extractedGmapsUrl = gmapsMatch[0];
      } else if (isAmenityOrNav && /\b(near\s+me|কাছে|पास)\b/i.test(userQuery)) {
        extractedGmapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(userQuery + ' Kolkata')}`;
      }

      return {
        reply: textResponse,
        gmapsUrl: extractedGmapsUrl,
        modelUsed: model,
        source: 'gemini',
      };

    } catch (err) {
      lastError = err;
      if (
        err.message.includes('API_KEY_INVALID') ||
        err.message.includes('PERMISSION_DENIED') ||
        err.message.includes('API key not valid')
      ) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Failed to connect to Google Gemini API.');
}
