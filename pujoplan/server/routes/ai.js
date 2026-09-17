const express = require('express');
const router = express.Router();

/**
 * POST /api/ai/chat
 * Server-side proxy for Google Gemini API
 */
router.post('/chat', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: 'No Gemini API key provided. Please set GEMINI_API_KEY or configure in app settings.',
      });
    }

    const { contents, systemInstruction } = req.body;
    if (!contents || !Array.isArray(contents)) {
      return res.status(400).json({ error: 'Contents array is required.' });
    }

    const payload = { contents };
    if (systemInstruction) {
      payload.system_instruction = { parts: [{ text: systemInstruction }] };
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errData.error?.message || `Gemini API HTTP ${response.status}`,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
