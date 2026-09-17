const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/groupController');

// Invite info — must be before /:id routes
router.get('/invite-info/:token', ctrl.getInviteInfo);
router.post('/join/:token', requireAuth, ctrl.joinGroup);

// CRUD
router.post('/', requireAuth, ctrl.createGroup);
router.get('/', requireAuth, ctrl.getMyGroups);
router.get('/:id', requireAuth, ctrl.getGroupById);
router.delete('/:id', requireAuth, ctrl.deleteGroup);

// Invite management
router.post('/:id/invite', requireAuth, ctrl.regenerateInvite);

// Members
router.get('/:id/members', requireAuth, ctrl.getMembers);
router.delete('/:id/members/:userId', requireAuth, ctrl.removeMember);

// Spots
router.post('/:id/spots', requireAuth, ctrl.addSpot);
router.delete('/:id/spots/:spotId', requireAuth, ctrl.removeSpot);
router.post('/:id/spots/:spotId/vote', requireAuth, ctrl.voteSpot);
router.post('/:id/spots/:spotId/finalize', requireAuth, ctrl.finalizeSpot);

// Route
router.post('/:id/route', requireAuth, ctrl.generateRoute);

// Messages
router.get('/:id/messages', requireAuth, ctrl.getGroupMessages);
router.post('/:id/messages', requireAuth, ctrl.sendGroupMessage);

// Location Tracker
router.get('/:id/locations', requireAuth, ctrl.getGroupLocations);
router.post('/:id/location', requireAuth, ctrl.updateMemberLocation);

module.exports = router;

