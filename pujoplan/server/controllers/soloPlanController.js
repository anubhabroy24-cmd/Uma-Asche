const SoloPlan = require('../models/SoloPlan');
const prisma = require('../config/prisma');
const { nanoid } = require('nanoid');

/** POST /api/solo-plans */
async function createPlan(req, res, next) {
  try {
    const { name, region, visitDate, startLocation, spots } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Plan name is required.' });

    const user = req.user;
    const planId = 'sp_' + Date.now() + '_' + nanoid(6);

    const plan = await SoloPlan.create({
      id: planId,
      userId: user.id,
      userEmail: user.email || '',
      userName: user.name || 'Explorer',
      name: name.trim(),
      region: region || 'Kolkata',
      visitDate: (visitDate || '').trim(),
      startLocation: (startLocation || '').trim(),
      spots: spots || [],
    });

    return res.status(201).json(plan);
  } catch (err) {
    next(err);
  }
}

/** GET /api/solo-plans */
async function getMyPlans(req, res, next) {
  try {
    const uid = req.user.id;
    const plans = await SoloPlan.find({ userId: uid }).sort({ updatedAt: -1 });
    return res.json(plans);
  } catch (err) {
    next(err);
  }
}

/** GET /api/solo-plans/:id */
async function getPlanById(req, res, next) {
  try {
    const { id } = req.params;
    const uid = req.user.id;
    const plan = await SoloPlan.findOne({ id });
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    if (plan.userId !== uid) return res.status(403).json({ error: 'Access denied.' });
    return res.json(plan);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/solo-plans/:id */
async function deletePlan(req, res, next) {
  try {
    const { id } = req.params;
    const uid = req.user.id;
    const plan = await SoloPlan.findOne({ id });
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    if (plan.userId !== uid) return res.status(403).json({ error: 'Access denied.' });

    await SoloPlan.deleteOne({ id });
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/** POST /api/solo-plans/:id/spots */
async function addSpot(req, res, next) {
  try {
    const { id } = req.params;
    let { spotId, spot } = req.body;
    const uid = req.user.id;

    const plan = await SoloPlan.findOne({ id });
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    if (plan.userId !== uid) return res.status(403).json({ error: 'Access denied.' });

    let finalSpot = spot || {};
    if (!finalSpot.name) {
      try {
        const dbSpot = await prisma.pujaSpot.findUnique({
          where: { id: spotId },
        });
        if (dbSpot) {
          finalSpot = {
            id: dbSpot.id,
            name: dbSpot.name,
            area: dbSpot.area,
            region: dbSpot.region,
            latitude: dbSpot.latitude,
            longitude: dbSpot.longitude,
            category: dbSpot.category,
            crowdLevel: dbSpot.crowdLevel,
            address: dbSpot.address,
            nearestMetro: dbSpot.nearestMetro,
            ...finalSpot,
          };
        }
      } catch (_) {}
    }

    plan.spots = plan.spots || [];
    const exists = plan.spots.some((s) => s.spotId === spotId || s.id === spotId);
    if (!exists) {
      plan.spots.push({
        id: 'sps_' + Date.now() + '_' + nanoid(6),
        spotId,
        spot: finalSpot,
        createdAt: new Date(),
      });
      await plan.save();
    }

    return res.json(plan);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/solo-plans/:id/spots/:spotId */
async function removeSpot(req, res, next) {
  try {
    const { id, spotId } = req.params;
    const uid = req.user.id;

    const plan = await SoloPlan.findOne({ id });
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    if (plan.userId !== uid) return res.status(403).json({ error: 'Access denied.' });

    plan.spots = (plan.spots || []).filter((s) => s.id !== spotId && s.spotId !== spotId);
    await plan.save();

    return res.json(plan);
  } catch (err) {
    next(err);
  }
}

/** POST /api/solo-plans/:id/route */
async function generateRoute(req, res, next) {
  try {
    const { id } = req.params;
    const { startLocation } = req.body;
    const uid = req.user.id;

    const plan = await SoloPlan.findOne({ id });
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    if (plan.userId !== uid) return res.status(403).json({ error: 'Access denied.' });

    return res.json({
      success: true,
      startLocation: startLocation || plan.startLocation,
      waypoints: (plan.spots || []).map((s) => ({
        id: s.id,
        name: s.spot?.name,
        lat: s.spot?.latitude,
        lng: s.spot?.longitude,
      })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createPlan,
  getMyPlans,
  getPlanById,
  deletePlan,
  addSpot,
  removeSpot,
  generateRoute,
};
