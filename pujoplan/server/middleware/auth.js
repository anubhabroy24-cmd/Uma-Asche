const { verifyIdToken } = require('../config/firebase');
const User = require('../models/User');

// In-memory cache for user metadata to avoid hitting MongoDB on every API request
const userCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Middleware: verifies Firebase ID token (or app session token),
 * ensures user exists in MongoDB, and attaches req.user.
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

  try {
    const decoded = await verifyIdToken(token);
    if (!decoded || !decoded.uid) {
      return res.status(401).json({ error: 'Invalid authentication token.' });
    }

    const uid = decoded.uid;
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
      if (resolvedName && resolvedName !== 'Explorer' && cached.user.name !== resolvedName) {
        cached.user.name = resolvedName;
      }
      if (resolvedPhoto && !cached.user.profileImage) {
        cached.user.profileImage = resolvedPhoto;
      }
      req.user = cached.user;
      return next();
    }

    // Default fast user identity
    const reqUser = {
      id: uid,
      uid: uid,
      _id: uid,
      name: resolvedName,
      email: resolvedEmail,
      profileImage: resolvedPhoto,
    };

    // Store in cache for sub-millisecond future requests
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
          if (decoded.name && decoded.name !== existing.name) existing.name = decoded.name;
          if (decoded.picture && decoded.picture !== existing.profileImage) existing.profileImage = decoded.picture;
          existing.save().catch(() => {});
        }
      })
      .catch((dbErr) => {
        console.warn('[Auth Middleware] Background User DB sync error:', dbErr.message);
      });

    req.user = reqUser;
    next();
  } catch (err) {
    console.warn('[Auth Middleware] Error verifying token:', err.message);
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

module.exports = { requireAuth };

