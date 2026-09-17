const prisma = require('../config/prisma');

/**
 * GET /api/users/me
 */
async function getMe(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        profileImage: true,
        createdAt: true,
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found.' });
    return res.json(user);
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe };
