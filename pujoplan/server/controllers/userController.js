const User = require('../models/User');

/**
 * GET /api/users/me
 */
async function getMe(req, res, next) {
  try {
    const uid = req.user?.id || req.user?.uid;
    const user = await User.findOne({ uid });

    if (!user) {
      return res.json({
        id: uid,
        uid: uid,
        name: req.user?.name || 'Explorer',
        email: req.user?.email || '',
        profileImage: req.user?.profileImage || null,
        createdAt: new Date(),
      });
    }

    return res.json({
      id: user.uid,
      uid: user.uid,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage,
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe };
