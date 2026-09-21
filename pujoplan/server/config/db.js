const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

async function connectDB() {
  const candidates = [
    process.env.MONGODB_URI,
    process.env.MONGODB_DIRECT_URI,
    'mongodb://localhost:27017/pujoplan',
  ].filter(Boolean);

  let lastError = null;

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
      return;
    } catch (err) {
      lastError = err;
      const safeUri = uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
      console.warn(`[MongoDB] ⚠️ Failed to connect to ${safeUri}: ${err.message}`);
    }
  }

  console.error('[MongoDB] ❌ All MongoDB connections failed.');
  console.error('[MongoDB] Last error:', lastError?.message || 'Unknown error');
  console.warn('[MongoDB] Please verify MONGODB_URI in server/.env or start a local MongoDB instance.');
}

module.exports = { connectDB };

