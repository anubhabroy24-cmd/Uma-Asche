const prisma = require('../config/prisma');

/**
 * GET /api/spots
 * Query params: region, category, crowdLevel, search, page, limit
 */
async function getSpots(req, res, next) {
  try {
    const { region, category, crowdLevel, search, page = 1, limit = 50 } = req.query;

    const where = {};

    if (region) {
      // Flexible region matching: "South Kolkata" matches "South/South-East Kolkata" etc.
      where.region = { contains: region.replace(' Kolkata', '').trim() };
    }
    if (category) {
      where.category = { contains: category };
    }
    if (crowdLevel) {
      where.crowdLevel = { contains: crowdLevel };
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { area: { contains: search } },
        { address: { contains: search } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 500);

    const [spots, total] = await Promise.all([
      prisma.pujaSpot.findMany({
        where,
        skip,
        take,
        orderBy: [{ crowdLevel: 'desc' }, { name: 'asc' }],
      }),
      prisma.pujaSpot.count({ where }),
    ]);

    return res.json({
      spots,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / take),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/spots/:id
 */
async function getSpotById(req, res, next) {
  try {
    const spot = await prisma.pujaSpot.findUnique({
      where: { id: req.params.id },
    });
    if (!spot) return res.status(404).json({ error: 'Spot not found.' });
    return res.json(spot);
  } catch (err) {
    next(err);
  }
}

module.exports = { getSpots, getSpotById };
