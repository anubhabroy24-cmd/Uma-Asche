const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'pujoplan_fallback_secret_change_me';

/**
 * Middleware: verifies JWT, attaches req.user (full DB user object).
 * Returns 401 if missing/invalid token.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = authHeader.slice(7);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Allow offline/local demo tokens
  if (token === 'local-token' || token.startsWith('header.') || token.startsWith('demo:')) {
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          firebaseUid: 'local-demo-uid',
          name: 'Pujo Explorer',
          email: 'explorer@pujoplan.app',
        }
      });
    }
    req.user = user;
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found. Please log in again.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
}

/**
 * Create a signed JWT for a user.
 */
function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

module.exports = { requireAuth, signToken };
