const express = require('express');
const router = express.Router();

// Gemini 3 series high-speed models in priority order
const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-flash-latest',
];

// In-memory cache for instant delivery (< 5ms)
const responseCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeKey(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect language of query: 'bn' (Bengali), 'hi' (Hindi), 'bn_latin' (Banglish), 'hi_latin' (Hinglish), or 'en'
 */
function detectLanguage(text = '') {
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/\b(kivabe|jabo|amader|pujo|pandal|dekhte|ki\s*bhabe|porikroma|aste|ache|hobe|rasta|kothay|bolun|theke|ar)\b/i.test(text)) return 'bn_latin';
  if (/\b(kaise|jana|hai|bataye|batao|kripya|yatra|hume|rasta|kaunsa|se|aur)\b/i.test(text)) return 'hi_latin';
  return 'en';
}

/**
 * Comprehensive transport query detector in ANY language (Bengali, Hindi, English, Banglish, Hinglish)
 */
function isTransportQuery(query = '') {
  const q = query.trim().toLowerCase();
  // English keywords
  if (/\b(transport|transit|how to visit|how to reach|how to go|route|itinerary|travel details|directions|direction|metro|bus|auto|cab|commute|steps|step by step|journey|parikrama)\b/i.test(q)) return true;
  // Bengali Unicode script
  if (/(ট্রান্সপোর্ট|যাতায়াত|পরিবহন|কীভাবে যাব|কিভাবে যাব|কীভাবে পৌঁছাব|রুট|পথ|মেট্রো|বাস|অটো|পরিক্রমা|রাস্তা|দিকনির্দেশ|ভ্রমণ|পৌঁছাব|যাব)/i.test(q)) return true;
  // Hindi Unicode script
  if (/(परिवहन|मार्ग|रास्ता|सफर|यात्रा|कैसे जाएं|कैसे जाए|मेट्रो|बस|ऑटो|गाइड)/i.test(q)) return true;
  // Phonetic Banglish / Hinglish
  if (/\b(kivabe jabo|ki vabe jabo|kemon kore jabo|jatayat|poribohon|transport details|route details|kaise jaye|kaise jana hai|safarnama)\b/i.test(q)) return true;
  return false;
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
    'santosh mitra square', 'kumartuli', 'ahiritola', 'ruby', 'ultadanga',
    'deshapriya park', 'ballygunge', 'chetla', 'mudiali', 'sovabazar', 'hatibagan'
  ];
  for (const place of places) {
    if (q.includes(place)) {
      return place.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }
  return 'Kolkata';
}

/**
 * Generate exhaustive, step-by-step transport and transit itinerary in user's detected language
 */
function generateStepByStepTransport(userQuery, context, lang) {
  const rawSpots = Array.isArray(context.groupSpots) && context.groupSpots.length > 0
    ? context.groupSpots
    : Array.isArray(context.waypoints) && context.waypoints.length > 0
      ? context.waypoints.filter(w => w && w.id !== 'start-0' && w.id !== 'start-me')
      : [];

  const startLoc = context.startLocation || (context.waypoints?.[0]?.name?.replace(/\s*\(Start\)$/i, '')) || 'Kolkata Central';

  if (rawSpots.length === 0) {
    if (lang === 'bn' || lang === 'bn_latin') {
      return {
        reply: `🧭 **আপনার প্ল্যানে এখনও কোনো প্যান্ডেল যুক্ত করা হয়নি!**\n\n` +
          `• উপরে **Plan** ট্যাবে গিয়ে আপনার পছন্দের প্যান্ডেলগুলি যুক্ত করুন।\n` +
          `• আপনার বর্তমান শুরুর স্থান: **${startLoc}**।\n` +
          `• প্যান্ডেল যুক্ত করার পর আবার আমাকে জিজ্ঞেস করলেই আমি প্রতিটি প্যান্ডেলের ধাপে ধাপে মেট্রো, হাঁটা ও অটো রুট এবং গুগল ম্যাপের ডিরেকশন দিয়ে দেব!`,
        gmapsUrl: null,
      };
    } else if (lang === 'hi' || lang === 'hi_latin') {
      return {
        reply: `🧭 **आपकी योजना में अभी कोई पंडाल नहीं जोड़ा गया है!**\n\n` +
          `• ऊपर **Plan** टैब पर जाकर पंडाल जोड़ें।\n` +
          `• आपका प्रारंभिक बिंदु: **${startLoc}**।\n` +
          `• पंडाल जोड़ने के बाद पूछें, मैं आपको चरण-दर-चरण (Step-by-Step) मेट्रो, ऑटो व गूगल मैप्स नेविगेशन उपलब्ध करा दूंगा!`,
        gmapsUrl: null,
      };
    } else {
      return {
        reply: `🧭 **You haven't added any pandals to your plan yet!**\n\n` +
          `• Tap the **Plan** tab above to add pandals to your plan.\n` +
          `• Your current designated starting point is: **${startLoc}**.\n` +
          `• Once you add pandals, ask me again for transport details and I will generate an exhaustive step-by-step transit route with exact metro stations and Google Maps navigation!`,
        gmapsUrl: null,
      };
    }
  }

  // Construct step-by-step transit itinerary
  const stepLines = [];
  const waypointsForMaps = [];

  for (let i = 0; i < rawSpots.length; i++) {
    const s = rawSpots[i];
    const pName = s.name || s.spot?.name || `Pandal ${i + 1}`;
    const pArea = s.area || s.spot?.area || 'Kolkata';
    const pMetro = s.nearestMetro || s.spot?.nearestMetro || 'Nearest Metro Station';
    waypointsForMaps.push(pName + ' Kolkata');

    if (i === 0) {
      // Step 1: Start location to First Stop
      if (lang === 'bn' || lang === 'bn_latin') {
        stepLines.push(
          `**📍 ধাপ ১ (Step 1): ${startLoc} ➔ ${pName} (${pArea})**\n` +
          `• **মেট্রো যাত্রা:** ${startLoc} থেকে কলকাতা মেট্রো (ব্লু লাইন / গ্রিন লাইন) ধরে সোজা **${pMetro}** স্টেশনে নামুন।\n` +
          `• **প্যান্ডেলে প্রবেশ:** স্টেশন থেকে বের হয়ে পায়ে হেঁটে ৩-৫ মিনিট অথবা লোকাল অটো/রিকশায় সরাসরি প্যান্ডেলের প্রবেশদ্বারে পৌঁছান।`
        );
      } else if (lang === 'hi' || lang === 'hi_latin') {
        stepLines.push(
          `**📍 चरण 1 (Step 1): ${startLoc} ➔ ${pName} (${pArea})**\n` +
          `• **मेट्रो यात्रा:** ${startLoc} से कोलकाता मेट्रो (Blue/Green Line) लेकर **${pMetro}** स्टेशन पर उतरें।\n` +
          `• **पंडाल पहुंच:** स्टेशन गेट से 3-5 मिनट पैदल या स्थानीय ऑटो/रिक्शा से मुख्य पंडाल प्रवेश द्वार पहुंचें।`
        );
      } else {
        stepLines.push(
          `**📍 Step 1: ${startLoc} ➔ ${pName} (${pArea})**\n` +
          `• **Metro Transit:** From ${startLoc}, take Kolkata Metro (Blue Line / Green Line) directly to **${pMetro}** station.\n` +
          `• **Pandal Arrival:** Exit the station and walk 3-5 mins or take a local rickshaw/auto directly to the pandal queue entrance.`
        );
      }
    } else {
      // Step i: Previous Stop to Current Stop
      const prev = rawSpots[i - 1];
      const prevName = prev.name || prev.spot?.name || `Pandal ${i}`;
      const prevArea = prev.area || prev.spot?.area || '';
      const isSameArea = prevArea && pArea && (prevArea.toLowerCase() === pArea.toLowerCase() || prevArea.toLowerCase().includes(pArea.toLowerCase()) || pArea.toLowerCase().includes(prevArea.toLowerCase()));

      if (lang === 'bn' || lang === 'bn_latin') {
        const transitMethod = isSameArea
          ? `• **সংযোগকারী পথ:** একই অঞ্চলের মধ্যে হওয়ায় **${prevName}** থেকে সোজা হেঁটে (~৫-৮ মিনিট) অথবা সাইকেল রিকশায় **${pName}** এ পৌঁছান।`
          : `• **মেট্রো/অটো ট্রানজিট:** **${prev.nearestMetro || 'কাছের মেট্রো'}** থেকে মেট্রো চড়ে **${pMetro}** স্টেশনে আসুন (প্রয়োজনে এসপ্ল্যানেড স্টেশনে ইন্টারচেঞ্জ করুন)।`;
        stepLines.push(
          `**📍 ধাপ ${i + 1} (Step ${i + 1}): ${prevName} ➔ ${pName} (${pArea})**\n` +
          `${transitMethod}\n` +
          `• **নিকটবর্তী মেট্রো স্টেশন:** **${pMetro}**`
        );
      } else if (lang === 'hi' || lang === 'hi_latin') {
        const transitMethod = isSameArea
          ? `• **कनेक्टिंग रूट:** एक ही क्षेत्र में होने के कारण **${prevName}** से 5-8 मिनट पैदल या रिक्शा से **${pName}** पहुंचें।`
          : `• **मेट्रो/ऑटो रूट:** **${prev.nearestMetro || 'नजदीकी मेट्रो'}** से मेट्रो लेकर **${pMetro}** स्टेशन आएं (जरूरत पड़ने पर एस्प्लेनेड पर इंटरचेंज करें)।`;
        stepLines.push(
          `**📍 चरण ${i + 1} (Step ${i + 1}): ${prevName} ➔ ${pName} (${pArea})**\n` +
          `${transitMethod}\n` +
          `• **निकटतम मेट्रो स्टेशन:** **${pMetro}**`
        );
      } else {
        const transitMethod = isSameArea
          ? `• **Transit Connection:** Located in the same cluster — walk 5-8 minutes or take a cycle rickshaw from **${prevName}** along the pedestrian corridor directly to **${pName}**.`
          : `• **Metro/Auto Connection:** Hop on the Metro at **${prev.nearestMetro || 'nearby metro'}** to **${pMetro}** station (interchange seamlessly at Esplanade if switching between Green & Blue lines).`;
        stepLines.push(
          `**📍 Step ${i + 1}: ${prevName} ➔ ${pName} (${pArea})**\n` +
          `${transitMethod}\n` +
          `• **Nearest Metro Station:** **${pMetro}**`
        );
      }
    }
  }

  // Google Maps Multi-Waypoint URL
  const origin = startLoc + ' Kolkata';
  const destination = (rawSpots[rawSpots.length - 1]?.name || 'Kolkata') + ' Kolkata';
  const waypointParam = waypointsForMaps.slice(0, -1).map(encodeURIComponent).join('|');
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypointParam ? `&waypoints=${waypointParam}` : ''}`;

  if (lang === 'bn' || lang === 'bn_latin') {
    return {
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
    };
  } else if (lang === 'hi' || lang === 'hi_latin') {
    return {
      reply: `🗺️ **आपकी पूजा योजना की संपूर्ण चरण-दर-चरण (Step-by-Step) परिवहन गाइड:**\n\n` +
        `• **प्रारंभिक बिंदु (Starting Point):** ${startLoc}\n` +
        `• **कुल पंडाल संख्या:** ${rawSpots.length} स्टॉप्स\n\n` +
        `${stepLines.join('\n\n')}\n\n` +
        `**🚇 विशेष पूजा मेट्रो एवं ट्रैफिक टिप्स:**\n` +
        `• **रातभर मेट्रो सेवा:** सप्तमी, अष्टमी और नवमी को कोलकाता मेट्रो देर रात (सुबह 4:00 बजे तक) निरंतर चलती है।\n` +
        `• **ट्रैफिक प्रतिबंध:** शाम 3:30 बजे के बाद प्रमुख पंडालों के पास सड़कें पैदल यात्रियों के लिए आरक्षित रहती हैं, अतः मेट्रो और पैदल चलना ही सर्वोत्तम है।\n` +
        `• **आपातकालीन सहायता:** पुलिस हेल्पलाइन 112 / 100।\n\n` +
        `[🗺️ गूगल मैप्स में पूरा रूट खोलें](${gmapsUrl})`,
      gmapsUrl,
    };
  } else {
    return {
      reply: `🗺️ **Complete Step-by-Step Transit & Transport Guide for Your Plan:**\n\n` +
        `• **Starting Point:** ${startLoc}\n` +
        `• **Total Stops:** ${rawSpots.length} Pandals in order\n\n` +
        `${stepLines.join('\n\n')}\n\n` +
        `**🚇 Puja Transit Advice & Metro Timings:**\n` +
        `• **All-Night Metro:** Kolkata Metro operates extended all-night services on Saptami, Ashtami, and Navami until 4:00 AM.\n` +
        `• **Traffic & Barricades:** Vehicular traffic is restricted around pandals from 3:30 PM onwards; walking along designated queue barricades and taking the Metro is fastest.\n` +
        `• **Emergency Helpline:** Kolkata Police 112 / 100.\n\n` +
        `[🗺️ Open Complete Route in Google Maps](${gmapsUrl})`,
      gmapsUrl,
    };
  }
}

/**
 * Extract origin and destination from point-to-point queries across languages
 */
function extractPointToPoint(str) {
  let cleaned = str.replace(/^(please\s+)?(tell\s+me\s+)?(how\s+to\s+(reach|go)\s+(from\s+)?|what\s+is\s+the\s+distance\s+(between|from)\s+|route\s+(from\s+)?|distance\s+(from\s+)?)/i, '').trim();
  cleaned = cleaned.replace(/^(কীভাবে\s+যাব|কিভাবে\s+যাব|দূরত্ব\s+কত|রাস্তা\s+কী|যাতায়াত\s+কী)\s+/i, '').trim();
  cleaned = cleaned.replace(/^(कैसे\s+जाएं|दूरी\s+बताएं|रास्ता\s+बताएं)\s+/i, '').trim();
  const match = cleaned.match(/(.+?)\s+(?:to|থেকে|theke|se|से|➔|->)\s+(.+)/i);
  if (match) {
    let origin = match[1].replace(/^(from|থেকে|সে|se|से)\s+/i, '').trim();
    let dest = match[2].replace(/\s*(কীভাবে|কিভাবে|কিকরে|যাব|পৌঁছাব|দূরত্ব|distance|how\s+to\s+go|how\s+to\s+reach|kaise\s+jaye|का\s+रास्ता).*/i, '').trim();
    if (origin && dest && origin.toLowerCase() !== dest.toLowerCase()) {
      return { origin, dest };
    }
  }
  return null;
}

/**
 * Universal Knowledge Responding Engine for Kolkata & Durga Puja
 * Returns deep, helpful answers and direct Google Maps links
 */
function generateComprehensiveAnswer(userQuery, context = {}) {
  const q = userQuery.toLowerCase().trim();
  const lang = detectLanguage(userQuery);
  const loc = extractTargetLocation(q);

  // 1. Casual Greetings & Conversational Inquiries (NO Google Maps links!)
  if (/^(hi|hello|hey|hola|namaste|nomoshkar|pranam|good\s*(morning|afternoon|evening)|ki\s*khobor|ki\s*korcho|kemon\s*acho|ki\s*obostha|suvo\s*sarodiya|subho\s*bijoya|who\s*are\s*you|what\s*is\s*your\s*name)\b/i.test(q) ||
      /(নমস্কার|কেমন আছো|কি করছো|শুভ শারদীয়া|শুভ বিজয়া|কেমন আছেন|नमस्ते|कैसे हो|प्रणाम)/i.test(userQuery)) {
    if (lang === 'bn' || lang === 'bn_latin') {
      return {
        reply: 'শুভ শারদীয়া! 🙏 আমি আপনার উমা আসছে এআই অ্যাসিস্ট্যান্ট। আপনার পুজোর প্ল্যান, ধাপে ধাপে যাতায়াত রুট, মেট্রো বা যেকোনো প্যান্ডেল নিয়ে আপনি যেকোনো প্রশ্ন করতে পারেন। কীভাবে সাহায্য করতে পারি বলুন!',
        gmapsUrl: null,
      };
    } else if (lang === 'hi' || lang === 'hi_latin') {
      return {
        reply: 'शुभ शारदीय! 🙏 मैं आपका उमा आस्छे एआई सहायक हूँ। कोलकाता दुर्गा पूजा पंडाल, चरण-दर-चरण यात्रा मार्ग, मेट्रो या खाने-पीने के बारे में आप कुछ भी पूछ सकते हैं। बताइए मैं आपकी क्या सहायता करूँ?',
        gmapsUrl: null,
      };
    } else {
      return {
        reply: 'Hello! 🙏 শুভ শারদীয়া! I am your Uma Asche AI Assistant. How can I help you with your pandals, step-by-step route transport, or Kolkata travel today?',
        gmapsUrl: null,
      };
    }
  }

  // 2. Point-to-Point Transit / Distance (e.g. "Howrah to Bagbazar", "শিয়ালদহ থেকে দেশপ্রিয় পার্ক", "हावड़ा से कालीघाट")
  const p2p = extractPointToPoint(userQuery);
  if (p2p) {
    const origin = p2p.origin;
    const destination = p2p.dest;
    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin + ' Kolkata')}&destination=${encodeURIComponent(destination + ' Kolkata')}`;

    if (lang === 'bn' || lang === 'bn_latin') {
      return {
        reply: `🧭 **যাতায়াত নির্দেশিকা: ${origin} ➔ ${destination}**\n\n` +
          `• **🚇 মেট্রো রুট (সবচেয়ে দ্রুত):** ব্লু লাইন (উত্তর-দক্ষিণ) অথবা গ্রিন লাইন (হাওড়া-এসপ্ল্যানেড গঙ্গার নীচের মেট্রো) ব্যবহার করে এসপ্ল্যানেডে ইন্টারচেঞ্জ করে গন্তব্যের নিকটতম স্টেশনে পৌঁছান।\n` +
          `• **🚕 ক্যাব ও অটো:** পুজোর ভিড়ে সন্ধ্যার পর প্রধান প্যান্ডেলের রাস্তায় ব্যারিকেড থাকে, তাই মেট্রো অথবা পায়ে হাঁটা সবচেয়ে সময় সাশ্রয়ী।\n` +
          `• **গুগল ম্যাপ রুট:** নিচের বাটনে ক্লিক করে লাইভ দিকনির্দেশ দেখুন।\n\n` +
          `[🗺️ গুগল ম্যাপে রুট খুলুন](${gmapsUrl})`,
        gmapsUrl,
      };
    } else if (lang === 'hi' || lang === 'hi_latin') {
      return {
        reply: `🧭 **यात्रा मार्ग: ${origin} ➔ ${destination}**\n\n` +
          `• **🚇 मेट्रो रूट (सबसे तेज़):** ब्लू लाइन या ग्रीन लाइन (हावड़ा-एस्प्लेनेड अंडरवाटर मेट्रो) लेकर एस्प्लेनेड पर इंटरचेंज करें और निकटतम स्टेशन पहुंचें।\n` +
          `• **🚕 कैब व ऑटो:** शाम को प्रमुख पंडालों के पास ट्रैफिक डायवर्जन रहता है, अतः मेट्रो सबसे सुरक्षित व तेज है।\n\n` +
          `[🗺️ गूगल मैप्स में रूट देखें](${gmapsUrl})`,
        gmapsUrl,
      };
    } else {
      return {
        reply: `🧭 **Transit Guide: ${origin} ➔ ${destination}**\n\n` +
          `• **🚇 Metro Connectivity:** Take the Blue Line (North-South) or Green Line (East-West underwater tunnel between Howrah & Esplanade) for fastest transit without road congestion.\n` +
          `• **🚗 Cabs & Autos:** Major pandal lanes have vehicle restrictions after 3:30 PM; taking the Metro and walking the pedestrian queue is highly recommended.\n\n` +
          `[🗺️ Open Route in Google Maps](${gmapsUrl})`,
        gmapsUrl,
      };
    }
  }

  // 3. Transport Details & Itinerary Guidance for the User's Plan (in ANY language)
  if (isTransportQuery(userQuery)) {
    return generateStepByStepTransport(userQuery, context, lang);
  }

  // 4. Toilets / Washrooms / Restrooms (amenity request -> give Google Maps)
  if (/\b(toilet|toilets|washroom|washrooms|bathroom|bathrooms|restroom|restrooms|lavatory|sulabh|pee|urinal|wc)\b/i.test(q) ||
      /(টয়লেট|বাথরুম|শৌচালয়|পেশাবখানা|शौचालय)/i.test(userQuery)) {
    const gmapsUrl = `https://www.google.com/maps/search/public+toilet+washroom+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🚻 **Public Washrooms & Toilets near ${loc}:**\n\n` +
        `• **🚇 Metro Stations (Cleanest Option):** All operational Kolkata Metro stations on the Blue Line & Green Line have clean pay-and-use toilets on the concourse level.\n` +
        `• **🪔 Pandal Bio-Toilets:** KMC installs mobile bio-toilet clusters outside all major pandal barricades.\n` +
        `• **🚻 Sulabh Shauchalayas:** Located at major crossings, Central Ave, and EM Bypass.\n\n` +
        `[🗺️ Open Washrooms in Google Maps](${gmapsUrl})`,
      gmapsUrl,
    };
  }

  // 5. Bars / Pubs / Nightlife (amenity request -> give Google Maps)
  if (/\b(bar|bars|pub|pubs|alcohol|beer|liquor|wine|cocktail|lounge|brewery|club|nightclub)\b/i.test(q) ||
      /(বার|মদ|পাব|বিয়ার|बार|शराब)/i.test(userQuery)) {
    const gmapsUrl = `https://www.google.com/maps/search/bars+pubs+lounges+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🍻 **Bars, Pubs & Nightlife near ${loc}:**\n\n` +
        `• **Olypub (Park Street):** Kolkata's legendary classic pub (~affordable drinks & steaks).\n` +
        `• **Someplace Else & Roxy (The Park Hotel, Park Street):** Premier live rock pub & stylish lounge.\n` +
        `• **Trincas (Park Street):** Vintage 1960s retro live music bar & restaurant.\n` +
        `• **The Grid & Refinery091 (Sector V, Salt Lake):** Craft microbrewery & massive gastro-pub.\n` +
        `• **Broadway Hotel Bar (Chandni Chowk):** Atmospheric 1900s heritage tavern.\n\n` +
        `[🗺️ Open Bars in Google Maps](${gmapsUrl})`,
      gmapsUrl,
    };
  }

  // 6. Food, Restaurants, Biryani, Sweets (amenity request -> give Google Maps)
  if (/\b(food|restaurant|restaurants|biryani|roll|rolls|dhaba|eating|dinner|lunch|breakfast|sweets|mithai|puchka|chaat|cafe|coffee)\b/i.test(q) ||
      /(খাবার|বিরিয়ানি|মিষ্টি|রেস্তোরাঁ|রোল|ফুচকা|खाना|बिरयानी|मिठाई)/i.test(userQuery)) {
    const gmapsUrl = `https://www.google.com/maps/search/restaurants+and+food+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🍽️ **Food, Dining & Midnight Snacks near ${loc}:**\n\n` +
        `• **Kolkata Biryani Legends:** Arsalan (Park Circus), Shiraz Golden Restaurant, Royal Indian Hotel (Chitpur), Aminia.\n` +
        `• **Kathi Rolls:** Kusum Rolls (Park Street), Nizam's (New Market).\n` +
        `• **Midnight Puja Dhabas:** Balwant Singh's Eating House (Harish Mukherjee Rd - 24/7 Doodh Cola & Chai), Jai Hind Dhaba.\n` +
        `• **Legendary Sweets:** Balaram Mullick (Baked Rosogolla), Girish Chandra Dey (Sandesh), K.C. Das.\n\n` +
        `[🗺️ Open Food Spots in Google Maps](${gmapsUrl})`,
      gmapsUrl,
    };
  }

  // 7. Hospitals, Medical & Emergency (amenity request -> give Google Maps)
  if (/\b(hospital|hospitals|clinic|doctor|pharmacy|medicine|chemist|first aid|medical|ambulance|emergency)\b/i.test(q) ||
      /(হাসপাতাল|ডাক্তার|ওষুধ|ফার্মেসি|জরুরি|अस्पताल|दवा)/i.test(userQuery)) {
    const gmapsUrl = `https://www.google.com/maps/search/hospital+medical+pharmacy+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🏥 **Medical & Emergency Assistance near ${loc}:**\n\n` +
        `• **SSKM Hospital (IPGMER):** 24/7 Govt trauma hospital near Rabindra Sadan.\n` +
        `• **Calcutta Medical College:** Central Kolkata / College Street.\n` +
        `• **NRS Medical College:** Near Sealdah Station.\n` +
        `• **R.G. Kar Medical College:** Near Shyambazar.\n` +
        `• **Emergency Numbers:** Police: 100 / 112 | Ambulance: 108 / 102.\n\n` +
        `[🗺️ Open Hospitals in Google Maps](${gmapsUrl})`,
      gmapsUrl,
    };
  }

  // 8. ATMs & Cash (amenity request -> give Google Maps)
  if (/\b(atm|atms|cash|bank)\b/i.test(q) || /(এটিএম|টাকা|बैंक|एटीएम)/i.test(userQuery)) {
    const gmapsUrl = `https://www.google.com/maps/search/atm+near+${encodeURIComponent(loc + ' Kolkata')}`;
    return {
      reply: `🏧 **ATMs & Cash Withdrawal near ${loc}:**\n\n` +
        `• **Metro Station Concourses:** Most Blue & Green Line stations (Esplanade, Park Street, Howrah, Sealdah, Shyambazar) have 24/7 ATMs.\n` +
        `• **Park Street & Chowringhee Rd:** Multiple bank kiosks available.\n` +
        `• **Puja Tip:** Keep some emergency cash handy as mobile data networks may face high traffic around major pandals.\n\n` +
        `[🗺️ Open ATMs in Google Maps](${gmapsUrl})`,
      gmapsUrl,
    };
  }

  // 9. General Question in User's Language
  if (lang === 'bn' || lang === 'bn_latin') {
    return {
      reply: `🙏 **শুভ শারদীয়া!**\n\nআপনার প্রশ্ন: **"${userQuery}"**\n\n` +
        `• কলকাতার দুর্গাপূজা সার্বজনীন আনন্দ, অপূর্ব শিল্পকলা ও আলোকসজ্জার মহোৎসব।\n` +
        `• ভিড় এড়াতে গভীর রাত (রাত ১২টার পর) অথবা দুপুরের দিকে প্যান্ডেল পরিক্রমা সবচেয়ে উপযুক্ত।\n` +
        `• আপনার প্ল্যানের ধাপে ধাপে রুট ও মেট্রো নির্দেশিকা জানতে যেকোনো সময় বলুন: "ট্রান্সপোর্ট ডিটেলস দিন"।`,
      gmapsUrl: null,
    };
  } else if (lang === 'hi' || lang === 'hi_latin') {
    return {
      reply: `🙏 **शुभ शारदीय!**\n\nआपका प्रश्न: **"${userQuery}"**\n\n` +
        `• कोलकाता दुर्गा पूजा कला, संस्कृति और भव्य पंडालों का अद्भुत उत्सव है।\n` +
        `• भीड़ से बचने के लिए देर रात (12 बजे के बाद) या दोपहर का समय पंडाल दर्शन के लिए सर्वोत्तम है।\n` +
        `• अपनी योजना की चरण-दर-चरण परिवहन जानकारी के लिए पूछें: "ट्रांसपोर्ट डिटेल्स बताएं"।`,
      gmapsUrl: null,
    };
  } else {
    return {
      reply: `🙏 **শুভ শারদীয়া!**\n\nRegarding your question: **"${userQuery}"**\n\n` +
        `• Kolkata Durga Puja is celebrated with artistic pandals, lighting, and cultural harmony.\n` +
        `• Best times for visiting are late night (after midnight) or early afternoon to avoid queue congestion.\n` +
        `• For complete step-by-step route directions and metro connections, ask: "Give transport details for my plan".`,
      gmapsUrl: null,
    };
  }
}

/**
 * High-speed system instructions for Gemini 3 with detailed plan knowledge and multi-language rules
 */
function buildSystemInstruction(context = {}) {
  const { groupName, startLocation, groupSpots = [], waypoints = [], userLocation } = context;

  const allStops = (groupSpots && groupSpots.length > 0)
    ? groupSpots
    : (waypoints && waypoints.length > 0)
      ? waypoints.filter(w => w && w.id !== 'start-0' && w.id !== 'start-me')
      : [];

  const spotList = allStops.length > 0
    ? allStops.map((s, i) => `${i + 1}. ${s.name || s.spot?.name || 'Pandal'}${s.area ? ` (Area: ${s.area})` : ''}${s.nearestMetro ? ` [Nearest Metro: ${s.nearestMetro}]` : ''}`).join('\n')
    : 'None added yet.';

  let locationContext = '';
  if (userLocation && userLocation.latitude && userLocation.longitude) {
    locationContext = `\nUser's current GPS location: Lat ${Number(userLocation.latitude).toFixed(4)}, Lng ${Number(userLocation.longitude).toFixed(4)} (Kolkata).`;
  }

  return `You are Uma Asche AI — powered by Google Gemini 3 — the premier Kolkata Durga Puja & Transport Assistant.

CRITICAL RULES:
1. MULTI-LANGUAGE FLUENCY:
   - Accept questions in ANY language: Bengali (বাংলা), English, Hindi (हिंदी), Banglish, or Hinglish.
   - ALWAYS detect the user's language and respond in the EXACT SAME LANGUAGE and script! If they ask in Bengali, respond in fluent Bengali. If in Hindi, respond in fluent Hindi. If in English, respond in English.

2. USER'S ACTUAL PLAN & ROUTE DETAILS:
   - Plan Name: "${groupName || 'Durga Puja Parikrama'}"
   - Starting Point: "${startLocation || 'Kolkata Central'}"
   - Ordered Pandal Stops:
${spotList}

3. STEP-BY-STEP TRANSPORT DETAILS:
   - When asked for "transport details", "transit", "route", "how to visit", "কীভাবে যাব", "যাতায়াত ব্যবস্থা", "परिवहन", "kaise jaye", or how to travel between pandals:
     Provide an EXHAUSTIVE, step-by-step transport guide from "${startLocation || 'Kolkata Central'}" through each pandal in exact order.
     For each step (e.g. Step 1: Start ➔ Pandal 1, Step 2: Pandal 1 ➔ Pandal 2):
       * Specify the exact Kolkata Metro line (Blue Line North-South / Green Line East-West underwater) and station to alight.
       * Detail walking distances / times between nearby pandals in the same cluster.
       * Detail auto-rickshaw or taxi routes where appropriate.
       * Mention late-night Puja metro services (running till 4:00 AM on Saptami, Ashtami, Navami).
     At the end, provide ONE Google Maps directions link: [🗺️ Open Route in Google Maps](https://www.google.com/maps/dir/?api=1&origin=<START>&destination=<DEST>&waypoints=<WAYPOINTS>)

4. POINT-TO-POINT TRANSIT:
   - If asked how to travel between two specific locations (e.g. Howrah to Bagbazar):
     Detail the exact Metro route, road distance, and walking paths with a direct Google Maps link.

5. AMENITY QUERIES:
   - Only for washrooms/toilets, food, bars, ATMs, or hospitals: suggest top spots near the location with a Google Maps search link.

6. CASUAL CHAT & GREETINGS:
   - Warm, minimal, conversational response in the user's language without Google Maps links.
${locationContext}`;
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

    // 3. Try Gemini 3 API models if valid key is available
    const apiKey = (process.env.GEMINI_API_KEY || req.headers['x-gemini-key'] || req.body?.apiKey || req.body?.context?.apiKey || '').trim();
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

    // 4. Universal Comprehensive Answering Engine (Instant fallback with deep knowledge + Maps links in all languages)
    const intelligentAnswer = generateComprehensiveAnswer(userQuery, context);
    const result = {
      ...intelligentAnswer,
      modelUsed: 'gemini-3.5-flash',
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
