/**
 * Google Gemini API Client Service for Durga Puja 2026 Assistant
 * Automatically connects to backend /api/ai/chat
 */
import api from './api';

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-flash-latest',
];

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
  return null;
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
  const { groupName, startLocation, groupSpots = [], userLocation } = context;

  const spotNames = Array.isArray(groupSpots) && groupSpots.length > 0
    ? groupSpots
        .map((s, i) => `${i + 1}. ${s.name || s.spot?.name || 'Pandal'}${s.area ? ` (${s.area})` : ''}${s.nearestMetro ? ` [Nearest Metro: ${s.nearestMetro}]` : ''}`)
        .join('\n')
    : 'None added yet.';

  let locationContext = '';
  if (userLocation && userLocation.latitude && userLocation.longitude) {
    locationContext = `\nUser's current GPS location: Lat ${Number(userLocation.latitude).toFixed(4)}, Lng ${Number(userLocation.longitude).toFixed(4)} (Kolkata).`;
  }

  return `You are Uma Asche AI — the intelligent, friendly, and comprehensive Kolkata Durga Puja & General Assistant.

LANGUAGE INSTRUCTION (CRITICAL - HIGHEST PRIORITY):
- You MUST answer in the EXACT SAME LANGUAGE as the user's input!
- If the user writes in Bengali (বাংলা, e.g. "কেমন আছো", "রুট বলো", "প্যান্ডেলে যাবো"), answer fluently and naturally in Bengali!
- If the user writes in Hindi (हिंदी, e.g. "नमस्ते", "रास्ता बताओ", "पंडাল"), answer in Hindi!
- If the user writes in Banglish / Hinglish (e.g. "kemon acho", "route bolo", "ki korbo"), answer in the same friendly conversational Bengali/Hindi style!
- If the user writes in English, answer in English!
- Accept and reply accurately in ALL languages. Never reject questions based on language.

CORE GUIDELINES:
1. USER'S ACTUAL PLAN & ROUTE DETAILS:
   - Plan Name: "${groupName || 'Durga Puja Parikrama'}"
   - Starting Point: "${startLocation || 'Kolkata Central'}"
   - Pandal Stops in Order:
${spotNames}
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

4. GENERAL CONVERSATION & KNOWLEDGE:
   - Answer ANY question the user asks helpfully, thoroughly, and warmly in the user's language without Google Maps links unless requested.
${locationContext}`;
}

/**
 * Send query to backend /api/ai/chat with fallback to direct Gemini REST
 */
export async function sendGeminiMessage(userQuery, conversationHistory = [], context = {}) {
  const activeKey = getGeminiApiKey();

  // 1. First priority: Connect with backend and pass questions through it
  try {
    const res = await api.post(
      '/ai/chat',
      {
        message: userQuery,
        conversationHistory,
        context,
      },
      {
        headers: activeKey ? { 'x-gemini-key': activeKey } : {},
      }
    );

    if (res.data && res.data.reply) {
      return {
        reply: res.data.reply,
        gmapsUrl: res.data.gmapsUrl,
        modelUsed: res.data.modelUsed || 'gemini-2.5-flash',
        source: res.data.source || 'gemini',
        apiKeyInvalid: !!res.data.apiKeyInvalid,
      };
    }
  } catch (backendErr) {
    console.warn('Backend /api/ai/chat call failed, attempting direct Gemini client fallback:', backendErr);
  }

  // 2. Direct fallback (for offline preview / netlify static without proxy)
  const apiKey = activeKey;
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
      contents.push({ role: 'model', parts: [{ text: msg.reply || msg.text }] });
    }
  }
  contents.push({ role: 'user', parts: [{ text: userQuery }] });

  const payload = {
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1200,
      topP: 0.9,
    },
  };

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
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
      const gmapsMatch = textResponse.match(/https:\/\/www\.google\.com\/maps\/[^\s\)\>]+/);
      if (gmapsMatch) {
        extractedGmapsUrl = gmapsMatch[0];
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
