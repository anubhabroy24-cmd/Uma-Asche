const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/soloPlanController');

router.post('/', requireAuth, ctrl.createPlan);
router.get('/', requireAuth, ctrl.getMyPlans);
router.delete('/:id', requireAuth, ctrl.deletePlan);
router.get('/:id', requireAuth, ctrl.getPlanById);
router.post('/:id/spots', requireAuth, ctrl.addSpot);
router.delete('/:id/spots/:spotId', requireAuth, ctrl.removeSpot);
router.post('/:id/route', requireAuth, ctrl.generateRoute);

module.exports = router;
