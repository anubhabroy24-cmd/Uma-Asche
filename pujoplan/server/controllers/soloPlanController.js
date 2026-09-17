const prisma = require('../config/prisma');
const routeService = require('../services/routeService');

/** POST /api/solo-plans */
async function createPlan(req, res, next) {
  try {
    const { name, region, startLocation, visitDate } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Plan name is required.' });
    if (!visitDate || !visitDate.trim()) return res.status(400).json({ error: 'Visit date is required.' });
    if (!startLocation || !startLocation.trim()) return res.status(400).json({ error: 'Starting location is required.' });

    const plan = await prisma.soloPlan.create({
      data: {
        userId: req.user.id,
        name: name.trim().slice(0, 100),
        region: region || 'Kolkata',
        startLocation: startLocation.trim(),
        visitDate: visitDate.trim(),
      },
    });

    return res.status(201).json(plan);
  } catch (err) {
    next(err);
  }
}

/** GET /api/solo-plans */
async function getMyPlans(req, res, next) {
  try {
    const plans = await prisma.soloPlan.findMany({
      where: { userId: req.user.id },
      include: { _count: { select: { spots: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(plans);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/solo-plans/:id */
async function deletePlan(req, res, next) {
  try {
    const plan = await prisma.soloPlan.findUnique({ where: { id: req.params.id } });
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    if (plan.userId !== req.user.id) return res.status(403).json({ error: 'Not your plan.' });

    await prisma.soloPlan.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Plan deleted.' });
  } catch (err) {
    next(err);
  }
}

/** GET /api/solo-plans/:id */
async function getPlanById(req, res, next) {
  try {
    const plan = await prisma.soloPlan.findUnique({
      where: { id: req.params.id },
      include: {
        spots: {
          include: { spot: true },
          orderBy: { visitOrder: 'asc' },
        },
      },
    });

    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    if (plan.userId !== req.user.id) return res.status(403).json({ error: 'Not your plan.' });

    return res.json(plan);
  } catch (err) {
    next(err);
  }
}

/** POST /api/solo-plans/:id/spots */
async function addSpot(req, res, next) {
  try {
    const { id } = req.params;
    const { spotId } = req.body;
    if (!spotId) return res.status(400).json({ error: 'spotId is required.' });

    const plan = await prisma.soloPlan.findUnique({ where: { id } });
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    if (plan.userId !== req.user.id) return res.status(403).json({ error: 'Not your plan.' });

    const spot = await prisma.pujaSpot.findUnique({ where: { id: spotId } });
    if (!spot) return res.status(404).json({ error: 'Spot not found.' });

    const count = await prisma.soloPlanSpot.count({ where: { planId: id } });

    const ps = await prisma.soloPlanSpot.upsert({
      where: { planId_spotId: { planId: id, spotId } },
      update: {},
      create: { planId: id, spotId, visitOrder: count },
      include: { spot: true },
    });

    return res.status(201).json(ps);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/solo-plans/:id/spots/:spotId */
async function removeSpot(req, res, next) {
  try {
    const { id, spotId } = req.params;
    const plan = await prisma.soloPlan.findUnique({ where: { id } });
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    if (plan.userId !== req.user.id) return res.status(403).json({ error: 'Not your plan.' });

    await prisma.soloPlanSpot.deleteMany({ where: { planId: id, spotId } });
    return res.json({ message: 'Spot removed.' });
  } catch (err) {
    next(err);
  }
}

/** POST /api/solo-plans/:id/route */
async function generateRoute(req, res, next) {
  try {
    const { id } = req.params;
    const { startLocation } = req.body;

    const plan = await prisma.soloPlan.findUnique({
      where: { id },
      include: { spots: { include: { spot: true }, orderBy: { visitOrder: 'asc' } } },
    });

    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    if (plan.userId !== req.user.id) return res.status(403).json({ error: 'Not your plan.' });

    const spots = plan.spots.map(ps => ps.spot).filter(s => s.latitude && s.longitude);
    if (spots.length === 0) return res.status(400).json({ error: 'No spots with coordinates.' });

    const start = startLocation || plan.startLocation || 'Howrah Railway Station, Kolkata';
    const result = await routeService.generateRoute(start, spots);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { createPlan, getMyPlans, deletePlan, getPlanById, addSpot, removeSpot, generateRoute };
