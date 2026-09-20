const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setDefaultResultOrder('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (_) {}

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pujoplan';
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      family: 4,
    });
    console.log(`[MongoDB] ✅ Connected to MongoDB Atlas (${mongoose.connection.host})`);
  } catch (err) {
    console.error('[MongoDB] ❌ Connection error:', err.message);
    console.warn('[MongoDB] ⚠️  Please verify your MONGODB_URI in server/.env');
  }
}

module.exports = { connectDB };

