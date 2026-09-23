const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const callCtrl = require('../controllers/callController');

// Token generation endpoint for Stream Video / Audio
router.post('/token', requireAuth, callCtrl.generateStreamToken);
router.post('/stream-token', requireAuth, callCtrl.generateStreamToken);

// Call status & signaling
router.get('/status', requireAuth, callCtrl.getCallStatus);
router.get('/check-active', callCtrl.checkActiveCallsForUser);
router.post('/signal', requireAuth, callCtrl.handleCallSignal);

module.exports = router;
