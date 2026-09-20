const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (_) {}

require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { initFirebase } = require('./config/firebase');
const { connectDB } = require('./config/db');
const { initSocket } = require('./services/socketService');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const spotRoutes = require('./routes/spots');
const groupRoutes = require('./routes/groups');
const soloPlanRoutes = require('./routes/soloPlans');
const aiRoutes = require('./routes/ai');
const callRoutes = require('./routes/calls');

// Initialize Firebase Admin & MongoDB
initFirebase();
connectDB();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Initialize Socket.io
initSocket(server, CLIENT_URL);

// ─── Security ─────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

const ALLOWED_ORIGINS = [
  CLIENT_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow mobile apps, curl, postman, and server-to-server (no origin header)
      if (!origin) return callback(null, true);
      if (
        ALLOWED_ORIGINS.includes(origin) ||
        origin.startsWith('capacitor://') ||
        origin.startsWith('ionic://') ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('https://localhost') ||
        process.env.NODE_ENV !== 'production'
      ) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive CORS for APK devices on any network
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Name', 'X-User-Email', 'X-User-Photo'],
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiting ────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// ─── Health ───────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    app: 'PujoPlan Backend API',
    database: 'MongoDB Atlas',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: 'MongoDB Atlas',
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/spots', spotRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/solo-plans', soloPlanRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/calls', callRoutes);

// ─── Any /api/* that didn't match → 404 JSON ─────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
});

// ─── Non-API requests → redirect to frontend ─────────────────
app.use((req, res) => {
  res.redirect(CLIENT_URL);
});

// ─── Global error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack || err.message);
  const status = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Something went wrong. Please try again.'
      : err.message || 'Internal server error';
  res.status(status).json({ error: message });
});

// ─── Start ────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🪔  PujoPlan API + Socket.io Server →  http://localhost:${PORT}/api`);
  console.log(`    Database                         →  MongoDB Atlas`);
  console.log(`    Frontend                         →  ${CLIENT_URL}`);
  console.log(`    Environment                      →  ${process.env.NODE_ENV || 'development'}\n`);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});
