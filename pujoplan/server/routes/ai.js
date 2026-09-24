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

function isBengaliText(str = '') {
  return /[\u0980-\u09FF]/.test(str);
}

function isHindiText(str = '') {
  return /[\u0900-\u097F]/.test(str);
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
 * Universal Multilingual Knowledge Responding Engine for Kolkata & Durga Puja
 * Returns plan-aware guidance, natural replies in the user's language, and relevant Maps links
 */
function generateComprehensiveAnswer(userQuery, context = {}) {
  const q = userQuery.toLowerCase().trim();
  const rawQ = userQuery.trim();
  const isBn = isBengaliText(rawQ);
  const isHi = isHindiText(rawQ);
  const loc = extractTargetLocation(q);

  const groupSpots = Array.isArray(context.groupSpots) ? context.groupSpots : [];
  const startLoc = context.startLocation || 'Kolkata Central';

  // 1. Casual Greetings & Conversational Inquiries (NO Google Maps links!)
  const isGreeting = /^(hi|hello|hey|hola|namaste|nomoshkar|pranam|good\s*(morning|afternoon|evening)|ki\s*khobor|ki\s*korcho|kemon\s*acho|ki\s*obostha|suvo\s*sarodiya|subho\s*bijoya|who\s*are\s*you|what\s*is\s*your\s*name)\b/i.test(q) ||
    /^(হ্যালো|নমস্কার|কেমন\s*আছো|কি\s*খবর|কি\s*করছো|কেমন\s*আছেন|শুভ\s*শারদীয়া|শুভ\s*বিজয়া|প্রণাম|তুমি\s*কে|কে\s*তুমি)/.test(rawQ) ||
    /^(नमस्ते|हेलो|हाय|कैसे\s*हो|क्या\s*हाल\s*है|शुभ\s*दुर्गा\s*पूजा|प्रणाम)/.test(rawQ);

  if (isGreeting) {
    if (isBn || /\b(ki\s*korcho|kemon\s*acho|suvo\s*sarodiya|subho|nomoshkar)\b/i.test(q)) {
      if (/\b(ki\s*korcho|কি\s*করছো)\b/i.test(q) || rawQ.includes('কি করছো')) {
        return {
          reply: 'এই তো, আপনার পুজোর প্ল্যান, পরিক্রমা ও রুট সাজাতে সাহায্য করতে সম্পূর্ণ প্রস্তুত! বলুন, কীভাবে সাহায্য করতে পারি? 🪔',
          gmapsUrl: null,
        };
      }
      if (/\b(kemon\s*acho|কেমন\s*আছো|কেমন\s*আছেন)\b/i.test(q) || rawQ.includes('কেমন আছো') || rawQ.includes('কেমন আছেন')) {
        return {
          reply: 'আমি খুব ভালো আছি! 🙏 আপনার দুর্গাপুজোর প্ল্যান কেমন চলছে? আপনার রুট, প্যান্ডেল বা যাতায়াত নিয়ে যেকোনো প্রশ্ন করতে পারেন।',
          gmapsUrl: null,
        };
      }
      return {
        reply: 'শুভ শারদীয়া! 🙏 মা দুর্গার আশীর্বাদে আপনার পুজো আনন্দময় ও উৎসবমুখর কাটুক। আপনার প্যান্ডেল ভ্রমণ, রুট বা কলকাতা নিয়ে কী তথ্য জানতে চান?',
        gmapsUrl: null,
      };
    }
    if (isHi) {
      return {
        reply: 'नमस्ते! 🙏 शुभ दुर्गा पूजा! मैं आपका पूजा गाइड हूँ। आपकी यात्रा, पंडाल रूट या कोलकाता के बारे में मैं कैसे मदद कर सकता हूँ?',
        gmapsUrl: null,
      };
    }
    return {
      reply: 'Hello! 🙏 শুভ শারদীয়া! I am your Pujo Assistant. How can I help you with your pandals, route plan, or Kolkata travel today?',
      gmapsUrl: null,
    };
  }

  // 2. Transport Details & Itinerary Guidance for the User's Plan
  const isTransportQuery = /\b(transport|transit|how to visit|guide|itinerary|my route|route details|travel details|direction|commute)\b/i.test(q) ||
    (/\broute\b/i.test(q) && !q.includes(' to ')) ||
    /(রুট|ট্রান্সপোর্ট|কীভাবে\s*যাব|যাতায়াত|পরিক্রমা|পথ|গাড়ি|মেট্রো|গাইড)/.test(rawQ) ||
    /(रास्ता|रूट|कैसे\s*जाएं|सफर|गाड़ी|मेट्रो)/.test(rawQ);

  if (isTransportQuery) {
    if (groupSpots.length > 0) {
      const pandalSteps = groupSpots.map((s, i) => {
        const pName = s.name || s.spot?.name || `Pandal ${i + 1}`;
        const pArea = s.area || s.spot?.area || 'Kolkata';
        const pMetro = s.nearestMetro || s.spot?.nearestMetro;
        const metroInfo = pMetro && pMetro !== 'N/A' ? ` (${isBn ? 'নিকটবর্তী মেট্রো' : 'Nearest Metro'}: **${pMetro}**)` : '';
        return `• **${isBn ? 'স্টপ' : 'Stop'} ${i + 1}: ${pName}** — ${pArea}${metroInfo}`;
      }).join('\n');

      const waypoints = groupSpots.map(s => (s.name || s.spot?.name || '') + ' Kolkata').filter(Boolean);
      const origin = startLoc + ' Kolkata';
      const destination = (groupSpots[groupSpots.length - 1]?.name || 'Kolkata') + ' Kolkata';
      const waypointParam = waypoints.slice(0, -1).map(encodeURIComponent).join('|');
      const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypointParam ? `&waypoints=${waypointParam}` : ''}`;

      if (isBn) {
        return {
          reply: `🗺️ **আপনার প্ল্যানের সম্পূর্ণ ভ্রমণ ও রুট গাইড:**\n\n` +
            `• **শুরুর স্থান:** ${startLoc}\n` +
            `• **মোট প্যান্ডেল:** ${groupSpots.length} টি স্টপ\n\n` +
            `**📍 ক্রমানুসারে আপনার রুট:**\n` +
            `${pandalSteps}\n\n` +
            `**🚇 যাতায়াতের প্রয়োজনীয় পরামর্শ:**\n` +
            `• যানজট এড়াতে ব্লু লাইন বা গ্রীন লাইন মেট্রো ব্যবহার করা সবথেকে দ্রুত ও সুবিধাজনক।\n` +
            `• কাছাকাছি প্যান্ডেলগুলির মধ্যে হাঁটা বা লোকাল অটো ব্যবহার করা সেরা উপায় (বিকেল ৪টের পর রাস্তায় ব্যারিকেড থাকে)।\n` +
            `• সপ্তমী, অষ্টমী ও নবমীর দিন মেট্রো সারারাত ও অতিরিক্ত সময় পর্যন্ত চলে।`,
          gmapsUrl,
        };
      }

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
      if (isBn) {
        return {
          reply: `🧭 **আপনি এখনো কোনো প্যান্ডেল আপনার প্ল্যানে যোগ করেননি!**\n\n` +
            `• উপরে **Plan** ট্যাবে গিয়ে আপনার পছন্দের প্যান্ডেলগুলি যুক্ত করুন।\n` +
            `• আপনার বর্তমান শুরুর স্থান: **${startLoc}**।\n` +
            `• প্যান্ডেল যুক্ত করার পর আমাকে জিজ্ঞাসা করলে আমি প্রতিটি প্যান্ডেলের সঠিক মেট্রো স্টেশন, হাঁটার পথ ও গুগল ম্যাপস ডিরেকশন দিয়ে দেব!`,
          gmapsUrl: null,
        };
      }
      return {
        reply: `🧭 **You haven't added any pandals to your plan yet!**\n\n` +
          `• Tap the **Plan** tab above to add pandals to your group/solo plan.\n` +
          `• Your current starting point is set to: **${startLoc}**.\n` +
          `• Once you add pandals, ask me again and I will give you the exact step-by-step transit route, nearest metro stations, and a direct Google Maps navigation route!`,
        gmapsUrl: null,
      };
    }
  }

  // 3. Toilets / Washrooms (amenity request -> give Google Maps)
  const isToilet = /\b(toilet|toilets|washroom|washrooms|bathroom|bathrooms|restroom|restrooms|lavatory|sulabh|pee|urinal|wc)\b/i.test(q) ||
    /(টয়লেট|বাথরুম|শৌচাগার|মূত্রাগার|সুলভ)/.test(rawQ) ||
    /(शौचालय|बाथरूम|टॉयलेट)/.test(rawQ);

  if (isToilet) {
    const gmapsUrl = `https://www.google.com/maps/search/public+toilet+washroom+near+${encodeURIComponent(loc + ' Kolkata')}`;
    if (isBn) {
      return {
        reply: `🚻 **${loc} সংলগ্ন শৌচাগার ও পাবলিক টয়লেট:**\n\n` +
          `• **🚇 মেট্রো স্টেশন (সবথেকে পরিষ্কার):** ব্লু ও গ্রীন লাইনের প্রতিটি মেট্রো স্টেশনের কনকোর্স লেভেলে পে-অ্যান্ড-ইউজ টয়লেট থাকে।\n` +
          `• **🪔 প্যান্ডেল বায়ো-টয়লেট:** বড় প্যান্ডেলগুলির ব্যারিকেডের মুখে KMC-র মোবাইল বায়ো-টয়লেট বসানো থাকে।\n` +
          `• **🚻 সুলভ শৌচালয়:** প্রধান মোড় ও সেন্ট্রাল অ্যাভিনিউতে সুলভ শৌচালয় উপলব্ধ।`,
        gmapsUrl,
      };
    }
    return {
      reply: `🚻 **Public Washrooms & Toilets near ${loc}:**\n\n` +
        `• **🚇 Metro Stations (Cleanest Option):** All operational Kolkata Metro stations on the Blue Line & Green Line have clean pay-and-use toilets on the concourse level.\n` +
        `• **🪔 Pandal Bio-Toilets:** KMC installs mobile bio-toilet clusters outside all major pandal barricades.\n` +
        `• **🚻 Sulabh Shauchalayas:** Located at major crossings, Central Ave, and EM Bypass.`,
      gmapsUrl,
    };
  }

  // 4. Bars / Pubs / Nightlife
  const isBar = /\b(bar|bars|pub|pubs|alcohol|beer|liquor|wine|cocktail|lounge|brewery|club|nightclub)\b/i.test(q) ||
    /(বার|মদ|পাব|বিয়ার|পানশালা)/.test(rawQ) ||
    /(बार|पब|शराब)/.test(rawQ);

  if (isBar) {
    const gmapsUrl = `https://www.google.com/maps/search/bars+pubs+lounges+near+${encodeURIComponent(loc + ' Kolkata')}`;
    if (isBn) {
      return {
        reply: `🍻 **${loc} সংলগ্ন জনপ্রিয় বার ও পাব:**\n\n` +
          `• **Olypub (পার্ক স্ট্রিট):** কলকাতার ঐতিহ্যবাহী ও সাশ্রয়ী ঐতিহাসিক পাব।\n` +
          `• **Someplace Else & Roxy (The Park Hotel):** লাইভ মিউজিক ও প্রিমিয়াম লাউঞ্জ।\n` +
          `• **The Grid & Refinery091 (সল্টলেক সেক্টর ৫):** চমৎকার ক্রাফট ব্রিউয়ারি ও গ্যাস্ট্রোপাব।\n` +
          `• **Broadway Hotel Bar (চাঁদনি চক):** শতবর্ষ প্রাচীন হেরিটেজ ট্যাভার্ন।`,
        gmapsUrl,
      };
    }
    return {
      reply: `🍻 **Bars, Pubs & Nightlife near ${loc}:**\n\n` +
        `• **Olypub (Park Street):** Kolkata's legendary classic pub (~affordable drinks & steaks).\n` +
        `• **Someplace Else & Roxy (The Park Hotel, Park Street):** Premier live rock pub & stylish lounge.\n` +
        `• **The Grid & Refinery091 (Sector V, Salt Lake):** Craft microbrewery & massive gastro-pub.\n` +
        `• **Broadway Hotel Bar (Chandni Chowk):** Atmospheric 1900s heritage tavern.`,
      gmapsUrl,
    };
  }

  // 5. Food, Restaurants, Biryani, Sweets
  const isFood = /\b(food|restaurant|restaurants|biryani|roll|rolls|dhaba|eating|dinner|lunch|breakfast|sweets|mithai|puchka|chaat|cafe|coffee)\b/i.test(q) ||
    /(খাবার|রেস্তোরাঁ|বিরিয়ানি|খাব|রোল|মিষ্টি|ফুচকা|চা|ধাবা|ক্যাফে)/.test(rawQ) ||
    /(खाना|बिरयानी|रेस्टोरेंट|मिठाई|चाय)/.test(rawQ);

  if (isFood) {
    const gmapsUrl = `https://www.google.com/maps/search/restaurants+and+food+near+${encodeURIComponent(loc + ' Kolkata')}`;
    if (isBn) {
      return {
        reply: `🍽️ **${loc} সংলগ্ন কলকাতার বিখ্যাত খাবার ও রেস্তোরাঁ:**\n\n` +
          `• **বিখ্যাত বিরিয়ানি:** আর্সালান (পার্ক সার্কাস), সিরাজ, রয়্যাল ইন্ডিয়ান হোটেল (চিৎপুর), আমেনিয়া।\n` +
          `• **কাঠি রোল:** কুসুম রোলস (পার্ক স্ট্রিট), নিজামস (নিউ মার্কেট)।\n` +
          `• **সারারাত খোলা ধাবা:** বলবান্ত সিং ইটিং হাউস (হরীশ মুখার্জি রোড - দুধ কোলা ও চা), জয় হিন্দ ধাবা।\n` +
          `• **মিষ্টির স্বাদ:** বলরাম মল্লিক (বেকড রসগোল্লা), গিরিশচন্দ্র দে (সন্দেশ), কে.সি. দাস।`,
        gmapsUrl,
      };
    }
    return {
      reply: `🍽️ **Food, Dining & Midnight Snacks near ${loc}:**\n\n` +
        `• **Kolkata Biryani Legends:** Arsalan (Park Circus), Shiraz Golden Restaurant, Royal Indian Hotel (Chitpur), Aminia.\n` +
        `• **Kathi Rolls:** Kusum Rolls (Park Street), Nizam's (New Market).\n` +
        `• **Midnight Puja Dhabas:** Balwant Singh's Eating House (Harish Mukherjee Rd - 24/7 Doodh Cola & Chai), Jai Hind Dhaba.\n` +
        `• **Legendary Sweets:** Balaram Mullick (Baked Rosogolla), Girish Chandra Dey (Sandesh), K.C. Das.`,
      gmapsUrl,
    };
  }

  // 6. Hospitals, Medical & Emergency
  const isMedical = /\b(hospital|hospitals|clinic|doctor|pharmacy|medicine|chemist|first aid|medical|ambulance|emergency)\b/i.test(q) ||
    /(হাসপাতাল|ডাক্তার|ওষুধ|ফার্মেসি|জরুরি|অ্যাম্বুলেন্স)/.test(rawQ) ||
    /(अस्पताल|दवा|डॉक्टर|इलाज|इमरजेंसी)/.test(rawQ);

  if (isMedical) {
    const gmapsUrl = `https://www.google.com/maps/search/hospital+medical+pharmacy+near+${encodeURIComponent(loc + ' Kolkata')}`;
    if (isBn) {
      return {
        reply: `🏥 **${loc} সংলগ্ন জরুরি স্বাস্থ্যসেবা ও হাসপাতাল:**\n\n` +
          `• **এসএসকেএম হাসপাতাল (IPGMER):** রবীন্দ্র সদনের কাছে ২৪/৭ সরকারি ট্রমা সেন্টার।\n` +
          `• **কলকাতা মেডিকেল কলেজ:** সেন্ট্রাল / কলেজ স্ট্রিট।\n` +
          `• **এনআরএস মেডিকেল কলেজ:** শিয়ালদহ স্টেশনের নিকট।\n` +
          `• **জরুরি নম্বর:** পুলিশ: 100 / 112 | অ্যাম্বুলেন্স: 108 / 102।`,
        gmapsUrl,
      };
    }
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

  // 7. Distance query
  if ((q.includes(' to ') || rawQ.includes('থেকে')) && (/\b(distance|how to go|route|metro|far)\b/i.test(q) || /(দূরত্ব|কীভাবে|যেতে|সময়)/.test(rawQ))) {
    const parts = q.includes(' to ') ? q.split(' to ') : rawQ.split('থেকে');
    const origin = (parts[0] || 'Howrah').replace(/.*(from|distance|route|how to go|how to reach|থেকে)/i, '').trim();
    const destination = (parts[1] || 'Kolkata').replace(/(distance|how to go|route|metro|কীভাবে|যাব|দূরত্ব).*/i, '').trim();
    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin + ' Kolkata')}&destination=${encodeURIComponent(destination + ' Kolkata')}`;
    if (isBn) {
      return {
        reply: `🧭 **যাতায়াত গাইড: ${origin} ➔ ${destination}**\n\n` +
          `• **মেট্রো রুট:** ব্লু লাইন বা নদীর তলদেশ দিয়ে চলা গ্রীন লাইন মেট্রো ব্যবহার করুন।\n` +
          `• **ট্যাক্সি ও অটো:** প্রধান প্যান্ডেলগুলির আশেপাশে সন্ধ্যের পর ট্রাফিক ডাইভারশন থাকে।`,
        gmapsUrl,
      };
    }
    return {
      reply: `🧭 **Transit Guide: ${origin} ➔ ${destination}**\n\n` +
        `• **🚇 Metro Connectivity:** Take the Blue Line (North-South) or Green Line (East-West underwater tunnel) for the fastest crossing.\n` +
        `• **🚗 Cabs & Autos:** Expect road diversions around major pandals in the evening.`,
      gmapsUrl,
    };
  }

  // 8. General Question in Bengali, Hindi, or English
  if (isBn) {
    return {
      reply: `🙏 **শুভ শারদীয়া!**\n\nআপনার প্রশ্ন: **"${userQuery}"**\n\n` +
        `• কলকাতার দুর্গাপূজা বিশ্বখ্যাত শৈল্পিক প্যান্ডেল, আলোকসজ্জা ও আন্তরিক আতিথেয়তার উৎসব।\n` +
        `• ভিড় এড়িয়ে সেরা অভিজ্ঞতা পেতে মধ্যরাত থেকে ভোরের দিকে অথবা দুপুর ২টো থেকে ৪টের মধ্যে ঠাকুর দেখা সবথেকে সুবিধাজনক।\n` +
        `• আপনার যেকোনো প্যান্ডেলের দূরত্ব, মেট্রো স্টেশন বা রুট সম্পর্কে নির্দিষ্ট প্রশ্ন জিজ্ঞেস করুন, আমি বিস্তারিত জানিয়ে দেব!`,
      gmapsUrl: null,
    };
  }

  if (isHi) {
    return {
      reply: `🙏 **शुभ शारदीय नवरात्रि!**\n\nआपका प्रश्न: **"${userQuery}"**\n\n` +
        `• कोलकाता की दुर्गा पूजा अद्भुत कलात्मक पंडालों और संस्कृति का भव्य उत्सव है।\n` +
        `• कम भीड़ में दर्शन के लिए आधी रात के बाद या दोपहर का समय सबसे अच्छा रहता है।\n` +
        `• आप किसी भी पंडाल, निकटतम मेट्रो स्टेशन या रास्ते के बारे में पूछ सकते हैं!`,
      gmapsUrl: null,
    };
  }

  return {
    reply: `🙏 **শুভ শারদীয়া!**\n\nRegarding your question: **"${userQuery}"**\n\n` +
      `• Kolkata Durga Puja is celebrated with artistic pandals, lights, and cultural harmony.\n` +
      `• Best times for visiting are late night (after midnight) or early afternoon to avoid queue congestion.\n` +
      `• You can ask about any pandal, route, metro station, food spots, or transit tips in any language!`,
    gmapsUrl: null,
  };
}

/**
 * Multilingual system instructions with detailed plan knowledge and strict guidelines
 */
function buildSystemInstruction(context = {}) {
  const { groupName, startLocation, groupSpots = [] } = context;

  const spotList = Array.isArray(groupSpots) && groupSpots.length > 0
    ? groupSpots.map((s, i) => `${i + 1}. ${s.name || s.spot?.name || 'Pandal'}${s.area ? ` (${s.area})` : ''}${s.nearestMetro ? ` [Nearest Metro: ${s.nearestMetro}]` : ''}`).join('\n')
    : 'None added yet.';

  return `You are Uma Asche AI — the intelligent, friendly, and comprehensive Kolkata Durga Puja & General Assistant.

LANGUAGE INSTRUCTION (CRITICAL - HIGHEST PRIORITY):
- You MUST answer in the EXACT SAME LANGUAGE as the user's input!
- If the user writes in Bengali (বাংলা, e.g. "কেমন আছো", "রুট বলো", "প্যান্ডেলে যাবো"), answer fluently and naturally in Bengali!
- If the user writes in Hindi (हिंदी, e.g. "नमस्ते", "रास्ता बताओ", "पंडाल"), answer in Hindi!
- If the user writes in Banglish / Hinglish (e.g. "kemon acho", "route bolo", "ki korbo"), answer in the same friendly conversational Bengali/Hindi style!
- If the user writes in English, answer in English!
- Accept and reply accurately in ALL languages. Never reject questions based on language.

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
     Reply minimally, warmly, and naturally in their language.
     DO NOT include ANY Google Maps link for greetings or casual conversation.

3. AMENITY SEARCHES (PROVIDE GOOGLE MAPS):
   - ONLY when the user explicitly asks for amenities or locations (e.g. "bars near me", "toilet near me", "restaurants/biryani near me", "atms near me", "hospitals near me"):
     Recommend top local Kolkata places and provide ONE Google Maps search link at the end: [🗺️ Open in Google Maps](https://www.google.com/maps/search/<QUERY>+near+<LOCATION>+Kolkata).

4. GENERAL CONVERSATION & KNOWLEDGE:
   - Answer ANY question the user asks helpfully, thoroughly, and warmly in the user's language without Google Maps links unless requested.`;
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

    // 1. In-memory Cache Check
    const cacheKey = normalizeKey(userQuery);
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json({
        ...cached.data,
        cached: true,
      });
    }

    // 2. Determine active Gemini API Key
    // Checks client-provided key in header first, then server environment variable
    const apiKey = (req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY || '').trim();
    let geminiFailed = false;
    let apiKeyInvalid = false;

    if (apiKey) {
      const systemInstruction = buildSystemInstruction(context);
      const contents = [];

      const recentHistory = Array.isArray(conversationHistory) ? conversationHistory.slice(-6) : [];
      for (const msg of recentHistory) {
        if (msg.sender === 'user' && msg.text) {
          contents.push({ role: 'user', parts: [{ text: msg.text }] });
        } else if (msg.sender === 'bot' && (msg.reply || msg.text)) {
          contents.push({ role: 'model', parts: [{ text: (msg.reply || msg.text).slice(0, 400) }] });
        }
      }
      contents.push({ role: 'user', parts: [{ text: userQuery }] });

      const payload = {
        contents,
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1200,
          topP: 0.9,
        },
      };

      for (const model of GEMINI_MODELS) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8500);

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
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
              } else if (/\b(toilet|washroom|bathroom|bar|pub|bars|pubs|food|restaurant|biryani|hospital|doctor|atm|cash)\b/i.test(userQuery) ||
                         /(টয়লেট|বাথরুম|বার|খাবার|বিরিয়ানি|হাসপাতাল|শৌচালয়)/.test(userQuery)) {
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
          } else {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || '';
            if (response.status === 401 || response.status === 403 || errMsg.includes('API_KEY') || errMsg.includes('UNAUTHENTICATED')) {
              apiKeyInvalid = true;
            }
          }
        } catch (_) {
          geminiFailed = true;
        }
      }
    }

    // 3. Fallback to Multilingual Dynamic Answering Engine
    const intelligentAnswer = generateComprehensiveAnswer(userQuery, context);
    const result = {
      ...intelligentAnswer,
      modelUsed: 'uma-multilingual-engine',
      source: apiKey ? 'fallback' : 'local',
      apiKeyInvalid,
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
