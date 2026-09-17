require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');

const { initFirebase } = require('./config/firebase');
const prisma = require('./config/prisma');

const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const spotRoutes     = require('./routes/spots');
const groupRoutes    = require('./routes/groups');
const soloPlanRoutes = require('./routes/soloPlans');

initFirebase();

const app        = express();
const PORT       = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// ─── Security ─────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiting ────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

app.use('/api/auth/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many auth attempts, please try again later.' },
}));

// ─── Health ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/spots',      spotRoutes);
app.use('/api/groups',     groupRoutes);
app.use('/api/solo-plans', soloPlanRoutes);

// ─── Any /api/* that didn't match → 404 JSON ─────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
});

// ─── Non-API requests → redirect browser to frontend ─────────
// This prevents the confusing {"error":"Route not found"} when
// someone opens localhost:5000 directly in the browser.
app.use((req, res) => {
  res.redirect(CLIENT_URL);
});

// ─── Global error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack || err.message);
  const status  = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Something went wrong. Please try again.'
    : (err.message || 'Internal server error');
  res.status(status).json({ error: message });
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🪔  PujoPlan API  →  http://localhost:${PORT}/api`);
  console.log(`    Frontend      →  ${CLIENT_URL}`);
  console.log(`    Environment   →  ${process.env.NODE_ENV || 'development'}\n`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
