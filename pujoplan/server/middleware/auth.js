const jwt = require('jsonwebtoken');
const { verifyIdToken } = require('../config/firebase');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'pujoplan_jwt_super_secret_2026_kolkata_durga_puja';

// In-memory cache for user metadata to avoid hitting MongoDB on every API request
const userCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Middleware: verifies app JWT token first (fast path),
 * then falls back to Firebase ID token verification.
 * Ensures user exists in MongoDB and attaches req.user.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  let uid, decoded;

  // ─── Fast path: verify our own JWT token (issued by /api/auth/session) ───
  try {
    const jwtPayload = jwt.verify(token, JWT_SECRET);
    uid = jwtPayload.uid || jwtPayload.user_id || jwtPayload.sub;
    if (uid) {
      decoded = {
        uid,
        name: jwtPayload.name || null,
        email: jwtPayload.email || null,
        picture: jwtPayload.picture || null,
      };
    }
  } catch (jwtErr) {
    // Not a valid app JWT — try Firebase token
  }

  // ─── Slow path: verify Firebase ID token (fresh login) ───
  if (!uid) {
    try {
      const firebaseDecoded = await verifyIdToken(token);
      if (!firebaseDecoded || !firebaseDecoded.uid) {
        return res.status(401).json({ error: 'Invalid authentication token.' });
      }
      decoded = firebaseDecoded;
      uid = decoded.uid;
    } catch (err) {
      console.warn('[Auth Middleware] Token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
  }

  if (!uid) {
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }

  const headerName = req.headers['x-user-name'] ? decodeURIComponent(req.headers['x-user-name']).trim() : null;
  const headerEmail = req.headers['x-user-email'] ? decodeURIComponent(req.headers['x-user-email']).trim() : null;
  const headerPhoto = req.headers['x-user-photo'] ? decodeURIComponent(req.headers['x-user-photo']).trim() : null;

  const resolvedName = (headerName && headerName !== 'Explorer' && headerName !== 'User' && headerName !== 'Pujo Explorer')
    ? headerName
    : (decoded.name && decoded.name !== 'Pujo Explorer' && decoded.name !== 'User' ? decoded.name : (decoded.email ? decoded.email.split('@')[0] : 'Explorer'));

  const resolvedEmail = headerEmail || decoded.email || '';
  const resolvedPhoto = headerPhoto || decoded.picture || null;

  const now = Date.now();
  const cached = userCache.get(uid);

  if (cached && cached.expiresAt > now) {
    // Update cached user name/photo if we have fresher data from headers
    if (resolvedName && resolvedName !== 'Explorer' && cached.user.name !== resolvedName) {
      cached.user.name = resolvedName;
    }
    if (resolvedPhoto && !cached.user.profileImage) {
      cached.user.profileImage = resolvedPhoto;
    }
    req.user = cached.user;
    return next();
  }

  // Build fast user identity from token data
  const reqUser = {
    id: uid,
    uid: uid,
    _id: uid,
    name: resolvedName,
    email: resolvedEmail,
    profileImage: resolvedPhoto,
  };

  // Store in cache
  userCache.set(uid, {
    user: reqUser,
    expiresAt: now + CACHE_TTL_MS,
  });

  // Non-blocking background sync with MongoDB
  User.findOne({ uid })
    .then(async (existing) => {
      if (!existing) {
        const created = await User.create({
          uid,
          email: resolvedEmail,
          name: resolvedName,
          profileImage: resolvedPhoto,
        }).catch(() => null);
        if (created) {
          reqUser._id = created._id;
          reqUser.name = created.name;
        }
      } else {
        reqUser._id = existing._id;
        reqUser.name = existing.name || reqUser.name;
        reqUser.email = existing.email || reqUser.email;
        reqUser.profileImage = existing.profileImage || reqUser.profileImage;
        // Update stale fields
        let needsSave = false;
        if (decoded.name && decoded.name !== existing.name) { existing.name = decoded.name; needsSave = true; }
        if (decoded.picture && decoded.picture !== existing.profileImage) { existing.profileImage = decoded.picture; needsSave = true; }
        if (needsSave) existing.save().catch(() => {});
      }
    })
    .catch((dbErr) => {
      console.warn('[Auth Middleware] Background User DB sync error:', dbErr.message);
    });

  req.user = reqUser;
  next();
}

module.exports = { requireAuth };
