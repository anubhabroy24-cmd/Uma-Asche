/**
 * Google Gemini API Client Service for Durga Puja 2026 Assistant
 * Automatically connects to backend /api/ai/chat
 */
import api from './api';

const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
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

  const spotNames = Array.isArray(groupSpots)
    ? groupSpots
        .map((s, i) => `${i + 1}. ${s.name || s.spot?.name || 'Pandal'}${s.area ? ` (${s.area})` : ''}`)
        .join('\n')
    : '';

  let locationContext = '';
  if (userLocation && userLocation.latitude && userLocation.longitude) {
    locationContext = `\nUser's current GPS location: Lat ${Number(userLocation.latitude).toFixed(4)}, Lng ${Number(userLocation.longitude).toFixed(4)} (Kolkata).`;
  }

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
4. USER PLAN CONTEXT: Plan "${groupName || 'Kolkata Pandal Parikrama'}", Starting Point "${startLocation || 'Kolkata Central'}".
Stops in Plan:
${spotNames || 'None added yet.'}
${locationContext}`;
}

/**
 * Send query to backend /api/ai/chat with fallback to direct Gemini REST
 */
export async function sendGeminiMessage(userQuery, conversationHistory = [], context = {}) {
  // 1. First priority: Connect with backend and pass questions through it
  try {
    const res = await api.post('/ai/chat', {
      message: userQuery,
      conversationHistory,
      context,
    });

    if (res.data && res.data.reply) {
      return {
        reply: res.data.reply,
        gmapsUrl: res.data.gmapsUrl,
        modelUsed: res.data.modelUsed || 'gemini-3.6-flash',
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
      maxOutputTokens: 1000,
      topP: 0.9,
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
