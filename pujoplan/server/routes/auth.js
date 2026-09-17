const express = require('express');
const router = express.Router();
const { createSession } = require('../controllers/authController');

router.post('/session', createSession);

module.exports = router;
