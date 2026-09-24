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

