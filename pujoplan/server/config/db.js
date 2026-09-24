const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

async function connectDB() {
  const candidates = [
    process.env.MONGODB_URI,
    process.env.MONGODB_DIRECT_URI,
    ...(process.env.NODE_ENV === 'production' ? [] : ['mongodb://localhost:27017/pujoplan']),
  ].filter(Boolean);

  const errors = [];

  for (const uri of candidates) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        family: 4,
      });

      const isLocal = /localhost|127\.0\.0\.1/.test(uri);
      console.log(
        isLocal
          ? '[MongoDB] ✅ Connected to local MongoDB instance.'
          : `[MongoDB] ✅ Connected to MongoDB Atlas (${mongoose.connection.host})`
      );

      // Perform one-time data cleanup to fix any cross-account data leakage from past bugs
      try {
        const Call = require('../models/Call');
        const Group = require('../models/Group');

        // 1. Terminate all calls older than 2 minutes that were left in 'ringing' or 'active'
        const staleCallTime = new Date(Date.now() - 2 * 60 * 1000);
        await Call.updateMany(
          { status: { $in: ['ringing', 'active'] }, updatedAt: { $lt: staleCallTime } },
          { status: 'ended' }
        ).exec().catch(() => {});

        // 2. Repair contaminated group.memberUids so users are only in groups where they are an actual member or admin
        const groups = await Group.find({}).lean().exec().catch(() => []);
        if (Array.isArray(groups)) {
          for (const g of groups) {
            const validUids = new Set();
            if (g.adminId && g.adminId !== 'local-user' && g.adminId !== 'anonymous') {
              validUids.add(g.adminId);
            }
            if (g.admin?.id && g.admin.id !== 'local-user' && g.admin.id !== 'anonymous') {
              validUids.add(g.admin.id);
            }
            if (g.admin?.email && !/^(user@pujoplan\.app|demo@pujoplan\.dev|anonymous)$/i.test(g.admin.email.trim())) {
              validUids.add(g.admin.email.toLowerCase().trim());
            }

            for (const m of g.members || []) {
              const mUid = m.userId || m.user?.id || m.id;
              if (mUid && mUid !== 'local-user' && mUid !== 'anonymous' && !String(mUid).startsWith('guest_')) {
                validUids.add(mUid);
              }
              const mEmail = (m.user?.email || m.email || '').trim().toLowerCase();
              if (mEmail && !/^(user@pujoplan\.app|demo@pujoplan\.dev|anonymous)$/i.test(mEmail)) {
                validUids.add(mEmail);
              }
            }

            const currentUids = Array.isArray(g.memberUids) ? g.memberUids : [];
            const cleanedUids = currentUids.filter(uid => validUids.has(uid));

            // Ensure adminId is always present
            if (g.adminId && !cleanedUids.includes(g.adminId)) {
              cleanedUids.push(g.adminId);
            }

            // If contaminated UIDs were present, save the clean list
            if (cleanedUids.length !== currentUids.length) {
              await Group.updateOne({ _id: g._id }, { memberUids: cleanedUids }).exec().catch(() => {});
            }
          }
        }
      } catch (cleanErr) {
        console.warn('[MongoDB] Data cleanup warning:', cleanErr.message);
      }

      return;
    } catch (err) {
      const safeUri = uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
      errors.push({ uri: safeUri, message: err.message });
      console.warn(`[MongoDB] ⚠️ Failed to connect to ${safeUri}: ${err.message}`);
    }
  }

  console.error('[MongoDB] ❌ All MongoDB connections failed.');
  errors.forEach(({ uri, message }) => console.error(`[MongoDB] ${uri}: ${message}`));
  console.warn('[MongoDB] Set MONGODB_URI and MONGODB_DIRECT_URI in the Render environment.');
}

module.exports = { connectDB };

