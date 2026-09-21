const fs = require('fs');
const path = require('path');

const catalogPath = path.resolve(__dirname, '../../../kolkata_durga_puja_pandals_verified_2026.csv');

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }

  values.push(value);
  return values;
}

function loadSpots() {
  const lines = fs.readFileSync(catalogPath, 'utf8').split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift()).map((header) => header.replace(/^\uFEFF/, '').trim());

  return lines.map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
    return {
      id: row.id,
      name: row.name,
      area: row.zone,
      region: row.zone,
      address: row.address,
      nearestMetro: row.nearest_metro,
      latitude: row.latitude ? Number(row.latitude) : null,
      longitude: row.longitude ? Number(row.longitude) : null,
      category: row.category,
      crowdLevel: row.crowd_level,
      description: row.description,
    };
  });
}

const spots = loadSpots();

function includes(value, query) {
  return String(value || '').toLowerCase().includes(String(query || '').toLowerCase());
}

function matchesWhere(spot, where = {}) {
  if (where.region?.contains && !includes(spot.region, where.region.contains)) return false;
  if (where.category?.contains && !includes(spot.category, where.category.contains)) return false;
  if (where.crowdLevel?.contains && !includes(spot.crowdLevel, where.crowdLevel.contains)) return false;
  if (where.OR && !where.OR.some((condition) => {
    const [field, rule] = Object.entries(condition)[0];
    return includes(spot[field], rule.contains);
  })) return false;
  return true;
}

const prisma = {
  pujaSpot: {
    async findMany({ where = {}, skip = 0, take = 50 } = {}) {
      return spots.filter((spot) => matchesWhere(spot, where)).slice(skip, skip + take);
    },
    async count({ where = {} } = {}) {
      return spots.filter((spot) => matchesWhere(spot, where)).length;
    },
    async findUnique({ where } = {}) {
      return spots.find((spot) => spot.id === where?.id) || null;
    },
  },
};

module.exports = prisma;