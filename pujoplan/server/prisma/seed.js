/**
 * PujoPlan Seed Script
 * Imports Kolkata Durga Puja pandals from CSV into the database.
 * Run: npm run seed
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// ── Known coordinates for key pandals ──────────────────────────────────────
const KNOWN_COORDS = {
  'College Square': [22.5710, 88.3626],
  'Md. Ali Park': [22.5701, 88.3583],
  'Mohammad Ali Park': [22.5701, 88.3583],
  'Santosh Mitra Square': [22.5657, 88.3698],
  'Sreebhumi Sporting Club': [22.5934, 88.4126],
  'Kumartuli Park': [22.5977, 88.3616],
  'Bagbazar Sarbojanin': [22.5985, 88.3655],
  'Sovabazar Rajbari': [22.5980, 88.3635],
  'Tala Park': [22.6023, 88.3763],
  'Dum Dum Park Sarbojanin': [22.6258, 88.4132],
  'Maddox Square': [22.5304, 88.3712],
  'Ekdalia Evergreen': [22.5231, 88.3696],
  'Ekdalia Evergreen Club': [22.5231, 88.3696],
  'Deshapriya Park': [22.5248, 88.3571],
  'Suruchi Sangha': [22.5139, 88.3281],
  'Ballygunge Cultural': [22.5310, 88.3612],
  'Chetla Agrani': [22.5241, 88.3408],
  'Badamtala Ashar Sangha': [22.5245, 88.3469],
  'Jodhpur Park': [22.5073, 88.3719],
  'Mudiali Club': [22.5178, 88.3744],
  'Tridhara Sammilani': [22.5262, 88.3519],
  'Bosepukur Sitala Mandir': [22.5204, 88.3954],
  'Naktala Udayan Sangha': [22.4947, 88.3860],
  'Singhi Park': [22.5297, 88.3738],
  'Singhi Park Sarbojanin': [22.5297, 88.3738],
  'Hatibagan Sarbojonin': [22.5885, 88.3726],
  'Nalin Sarkar Street': [22.5997, 88.3681],
  'Ahiritola Jubak Brinda': [22.5930, 88.3591],
  'Nimtala Sarbojanin': [22.5921, 88.3588],
  'Jagat Mukherjee Park': [22.5965, 88.3670],
  'Simla Bayam Samiti': [22.5756, 88.3620],
  'Kalighat Milan Sangha': [22.5261, 88.3446],
  'Barisha Sarbojonin': [22.4941, 88.3153],
  'Golf Green Sarodotsab': [22.5014, 88.3954],
  'Rajdanga': [22.5143, 88.3976],
};

// Crowd level normalization
function normalizeCrowd(raw) {
  if (!raw || raw.trim() === '') return 'Moderate';
  const lower = raw.toLowerCase();
  if (lower.includes('very high')) return 'Very High';
  if (lower.includes('high')) return 'High';
  if (lower.includes('low')) return 'Low';
  return 'Moderate';
}

// Map CSV zone to our simplified region
function normalizeRegion(zone) {
  if (!zone) return 'Central Kolkata';
  const z = zone.toLowerCase();
  if (z.includes('north') && z.includes('central')) return 'North Kolkata';
  if (z.includes('north')) return 'North Kolkata';
  if (z.includes('south suburban') || z.includes('south-west')) return 'South Suburban';
  if (z.includes('south')) return 'South Kolkata';
  if (z.includes('central')) return 'Central Kolkata';
  if (z.includes('salt lake') || z.includes('new town')) return 'Salt Lake';
  if (z.includes('port')) return 'Central Kolkata';
  if (z.includes('east')) return 'North Kolkata';
  return 'Central Kolkata';
}

// Normalize category
function normalizeCategory(raw) {
  if (!raw || raw.trim() === '') return 'Community Puja';
  const lower = raw.toLowerCase();
  if (lower.includes('heritage') && lower.includes('theme')) return 'Heritage & Theme';
  if (lower.includes('heritage') && lower.includes('traditional')) return 'Heritage';
  if (lower.includes('heritage')) return 'Heritage';
  if (lower.includes('theme')) return 'Theme';
  if (lower.includes('cultural')) return 'Cultural';
  if (lower.includes('traditional')) return 'Traditional';
  if (lower.includes('community')) return 'Community Puja';
  return 'Community Puja';
}

// Parse CSV properly (handles quoted fields with commas)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Determine latitude/longitude for a pandal
function resolveCoords(name, latRaw, lonRaw) {
  const lat = parseFloat(latRaw);
  const lon = parseFloat(lonRaw);

  if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
    return [lat, lon];
  }

  // Try known coords table
  for (const [known, coords] of Object.entries(KNOWN_COORDS)) {
    if (name && name.toLowerCase().includes(known.toLowerCase())) return coords;
  }

  return [null, null];
}

async function main() {
  // Try multiple relative paths so it works from different CWDs
  const candidates = [
    path.join(__dirname, '../../../../kolkata_durga_puja_pandals_verified_2026.csv'),
    path.join(__dirname, '../../../kolkata_durga_puja_pandals_verified_2026.csv'),
    path.join(__dirname, '../../kolkata_durga_puja_pandals_verified_2026.csv'),
    path.join(__dirname, '../kolkata_durga_puja_pandals_verified_2026.csv'),
    path.join(process.cwd(), 'kolkata_durga_puja_pandals_verified_2026.csv'),
    path.join(process.cwd(), '../kolkata_durga_puja_pandals_verified_2026.csv'),
    path.join(process.cwd(), '../../kolkata_durga_puja_pandals_verified_2026.csv'),
    'c:\\Users\\T U F\\OneDrive\\Desktop\\joy ma\\kolkata_durga_puja_pandals_verified_2026.csv',
  ];
  const csvPath = candidates.find(p => fs.existsSync(p));

  if (!csvPath) {
    console.error('❌  CSV not found. Please place kolkata_durga_puja_pandals_verified_2026.csv in the project root.');
    process.exit(1);
  }
  console.log('📄 Using CSV:', csvPath);

  const lines = fs.readFileSync(csvPath, 'utf-8').split('\n').filter(l => l.trim());
  const header = lines[0];
  const dataLines = lines.slice(1);

  console.log(`\n🌱 Seeding ${dataLines.length} pandals...\n`);

  let created = 0;
  let skipped = 0;

  for (const line of dataLines) {
    try {
      const cols = parseCSVLine(line);
      // id,name,zone,address,nearest_metro,latitude,longitude,category,crowd_level,description,source
      const [externalId, name, zone, address, nearestMetro, latRaw, lonRaw, categoryRaw, crowdRaw, description, source] = cols;

      if (!externalId || !name) { skipped++; continue; }

      const region = normalizeRegion(zone);
      const category = normalizeCategory(categoryRaw);
      const crowdLevel = normalizeCrowd(crowdRaw);
      const [latitude, longitude] = resolveCoords(name, latRaw, lonRaw);

      // Area: use zone as a display-friendly string
      const area = zone ? zone.replace('/South-East', '').replace('/South-West', '').trim() : region;

      await prisma.pujaSpot.upsert({
        where: { externalId },
        update: {
          name, area, region, address: address || null,
          nearestMetro: nearestMetro || null,
          latitude, longitude,
          category, crowdLevel,
          description: description || `${category} pandal in ${area}.`,
          source: source || null,
        },
        create: {
          externalId, name, area, region, address: address || null,
          nearestMetro: nearestMetro || null,
          latitude, longitude,
          category, crowdLevel,
          description: description || `${category} pandal in ${area}.`,
          source: source || null,
        },
      });
      created++;

      if (created % 50 === 0) process.stdout.write(`  ${created}...`);
    } catch (err) {
      console.warn(`  ⚠️  Error on line "${line.slice(0, 60)}":`, err.message);
      skipped++;
    }
  }

  console.log(`\n\n✅  Seeded ${created} pandals (${skipped} skipped).\n`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
