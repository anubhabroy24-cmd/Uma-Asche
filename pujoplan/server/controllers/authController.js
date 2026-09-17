const prisma = require('../config/prisma');
const { verifyIdToken } = require('../config/firebase');
const { signToken } = require('../middleware/auth');

/**
 * POST /api/auth/session
 * Body: { idToken: string }   — Firebase ID token (or demo:uid:name:email in dev)
 * Returns: { token, user }
 */
async function createSession(req, res, next) {
  try {
    const { idToken } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'idToken is required.' });
    }

    // Verify with Firebase (or demo adapter)
    let decoded;
    try {
      decoded = await verifyIdToken(idToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired Firebase token.' });
    }

    const { uid, name, email, picture } = decoded;

    // Upsert user in our DB
    const user = await prisma.user.upsert({
      where: { firebaseUid: uid },
      update: {
        name: name || email?.split('@')[0] || 'User',
        email: email || `${uid}@unknown.local`,
        profileImage: picture || null,
      },
      create: {
        firebaseUid: uid,
        name: name || email?.split('@')[0] || 'User',
        email: email || `${uid}@unknown.local`,
        profileImage: picture || null,
      },
    });

    const token = signToken(user.id);

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { createSession };
