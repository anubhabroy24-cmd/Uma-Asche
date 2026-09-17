const axios = require('axios');

// Comprehensive landmark dictionary for Kolkata starting points and neighbourhoods
const KNOWN_LOCATIONS = {
  'howrah railway station': [22.5839, 88.3424],
  'howrah station': [22.5839, 88.3424],
  'howrah': [22.5839, 88.3424],
  'sealdah station': [22.5701, 88.3698],
  'sealdah': [22.5701, 88.3698],
  'shalimar': [22.5574, 88.3242],
  'santragachi': [22.5800, 88.2780],
  'bagbazar': [22.6025, 88.3688],
  'kumartuli': [22.5992, 88.3664],
  'sovabazar': [22.5962, 88.3653],
  'ahiritola': [22.5938, 88.3582],
  'hatibagan': [22.5980, 88.3725],
  'shyambazar': [22.6022, 88.3712],
  'girish park': [22.5862, 88.3620],
  'mohammad ali park': [22.5815, 88.3601],
  'college square': [22.5746, 88.3639],
  'college street': [22.5746, 88.3639],
  'mg road': [22.5812, 88.3645],
  'central': [22.5726, 88.3639],
  'chandni chowk': [22.5678, 88.3556],
  'esplanade': [22.5645, 88.3533],
  'dharmatala': [22.5645, 88.3533],
  'new market': [22.5601, 88.3524],
  'park street': [22.5518, 88.3524],
  'maidan': [22.5462, 88.3430],
  'rabindra sadan': [22.5385, 88.3468],
  'exide': [22.5385, 88.3468],
  'victoria memorial': [22.5448, 88.3426],
  'netaji bhavan': [22.5338, 88.3475],
  'jatin das park': [22.5290, 88.3472],
  'hazra': [22.5230, 88.3470],
  'bhowanipore': [22.5300, 88.3480],
  'kalighat': [22.5261, 88.3432],
  'chetla': [22.5201, 88.3418],
  'rashbehari': [22.5180, 88.3520],
  'rabindra sarobar': [22.5122, 88.3475],
  'southern avenue': [22.5115, 88.3550],
  'deshapriya park': [22.5195, 88.3562],
  'maddox square': [22.5292, 88.3592],
  'ballygunge': [22.5255, 88.3601],
  'ballygunge phari': [22.5270, 88.3650],
  'gariahat': [22.5186, 88.3650],
  'ekdalia': [22.5186, 88.3657],
  'singhi park': [22.5209, 88.3642],
  'dhakuria': [22.5106, 88.3704],
  'jadavpur': [22.4985, 88.3755],
  'tollygunge': [22.4990, 88.3471],
  'kudghat': [22.4850, 88.3440],
  'bansdroni': [22.4740, 88.3520],
  'naktala': [22.4750, 88.3680],
  'garia': [22.4640, 88.3840],
  'patuli': [22.4780, 88.3880],
  'santoshpur': [22.4950, 88.3880],
  'kasba': [22.5150, 88.3850],
  'ruby': [22.5130, 88.4030],
  'anandapur': [22.5180, 88.4150],
  'mukundapur': [22.4950, 88.4020],
  'topsia': [22.5400, 88.3850],
  'tangra': [22.5530, 88.3870],
  'entally': [22.5580, 88.3700],
  'beliaghata': [22.5658, 88.3905],
  'phoolbagan': [22.5714, 88.3912],
  'kankurgachi': [22.5768, 88.3888],
  'maniktala': [22.5862, 88.3734],
  'ultadanga': [22.5957, 88.3861],
  'lake town': [22.5996, 88.3986],
  'sree bhumi': [22.5996, 88.3986],
  'sreebhumi': [22.5996, 88.3986],
  'vip road': [22.6050, 88.4100],
  'salt lake': [22.5867, 88.4178],
  'salt lake sector 5': [22.5735, 88.4331],
  'sector v': [22.5735, 88.4331],
  'new town': [22.5862, 88.4789],
  'rajarhat': [22.6167, 88.5000],
  'dum dum': [22.6517, 88.3986],
  'airport': [22.6547, 88.4467],
  'belgharia': [22.6600, 88.3800],
  'dunlop': [22.6500, 88.3750],
  'barranagar': [22.6400, 88.3700],
  'alipore': [22.5320, 88.3300],
  'new alipore': [22.5085, 88.3341],
  'behala': [22.5016, 88.3135],
  'taratala': [22.5110, 88.3180],
  'tarratala': [22.5110, 88.3180],
  'thakurpukur': [22.4600, 88.3000],
  'joka': [22.4400, 88.2900],
  // Howrah & Outer Suburbs
  'amta': [22.57828, 88.00922],
  'amta station': [22.5744, 88.0189],
  'bagnan': [22.4678, 87.9708],
  'uluberia': [22.4744, 88.1098],
  'domjur': [22.6416, 88.2235],
  'andul': [22.5855, 88.2435],
  'dankuni': [22.6865, 88.2936],
  'serampore': [22.7522, 88.3433],
  'srirampur': [22.7522, 88.3433],
  'rishra': [22.7126, 88.3512],
  'konnagar': [22.7000, 88.3500],
  'uttarpara': [22.6685, 88.3496],
  'bally': [22.6500, 88.3400],
  'chandannagar': [22.8671, 88.3674],
  'chinsurah': [22.9011, 88.3968],
  'hooghly': [22.9011, 88.3968],
  'bandel': [22.9218, 88.3756],
  'singur': [22.8100, 88.2300],
  'tarakeswar': [22.8872, 88.0200],
  'barasat': [22.7214, 88.4816],
  'madhyamgram': [22.6980, 88.4550],
  'habra': [22.8362, 88.6318],
  'barrackpore': [22.7644, 88.3777],
  'naihati': [22.8988, 88.4239],
  'sonarpur': [22.4388, 88.4312],
  'baruipur': [22.3654, 88.4325],
  'diamond harbour': [22.1906, 88.1925],
  'canning': [22.3106, 88.6575],
  'budge budge': [22.4822, 88.1818],
  'maheshtala': [22.5078, 88.2472],
  'kolaghat': [22.4300, 87.8700],
  'mecheda': [22.4172, 87.8732],
  'tamluk': [22.2989, 87.9258],
  'kharagpur': [22.3302, 87.3237],
  'midnapore': [22.4257, 87.3199],
  'burdwan': [23.2324, 87.8615],
  'bardhaman': [23.2324, 87.8615],
};

/**
 * Geocode a location string.
 * First tries known lookup table, then Nominatim (OSM).
 * Returns [lat, lng] or throws.
 */
async function geocode(locationStr) {
  if (!locationStr || !locationStr.trim()) {
    return [22.5726, 88.3639];
  }
  const key = locationStr.toLowerCase().trim();

  // Try known table first
  for (const [known, coords] of Object.entries(KNOWN_LOCATIONS)) {
    if (key.includes(known) || known.includes(key)) return coords;
  }

  // Try Nominatim (free, no key required)
  try {
    const resp = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: `${locationStr}, West Bengal, India`,
        format: 'json',
        limit: 1,
      },
      headers: { 'User-Agent': 'PujoPlan/1.0 (pujoplan.app)' },
      timeout: 6000,
    });

    if (resp.data && resp.data.length > 0) {
      return [parseFloat(resp.data[0].lat), parseFloat(resp.data[0].lon)];
    }
  } catch (_) {
    // Fallback silently
  }

  // Default to central Kolkata
  return [22.5726, 88.3639];
}

module.exports = { geocode };
