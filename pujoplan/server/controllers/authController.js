const User = require('../models/User');
const { verifyIdToken } = require('../config/firebase');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'pujoplan_jwt_super_secret_2026_kolkata_durga_puja';

function signToken(uid) {
  return jwt.sign({ uid, user_id: uid }, JWT_SECRET, { expiresIn: '30d' });
}

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
    const finalName = (name && name !== 'User') ? name : (email ? email.split('@')[0] : 'Pujo Explorer');
    const finalEmail = email || `${uid}@pujoplan.app`;

    // Upsert user in MongoDB Atlas
    let user = await User.findOne({ uid });
    if (!user) {
      user = await User.create({
        uid,
        name: finalName,
        email: finalEmail,
        profileImage: picture || null,
      });
    } else {
      if (finalName && (!user.name || user.name === 'Explorer' || user.name === 'User')) user.name = finalName;
      if (picture && !user.profileImage) user.profileImage = picture;
      if (finalEmail && !user.email) user.email = finalEmail;
      await user.save().catch(() => {});
    }

    const token = signToken(user.uid);

    return res.json({
      token,
      user: {
        id: user.uid,
        uid: user.uid,
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

module.exports = { createSession, signToken };
