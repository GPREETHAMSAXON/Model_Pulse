'use strict';

require('dotenv').config();
console.log('API KEY loaded:', process.env.ANTHROPIC_API_KEY ? 'YES (' + process.env.ANTHROPIC_API_KEY.slice(0,12) + '...)' : 'MISSING');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { sequelize } = require('./models');
const connectMongo = require('./utils/mongo');
const { startCron } = require('./services/cron');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// ── Request parsing
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging (skip in test)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Global rate limiter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

// ── Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'modelpulse-api', env: process.env.NODE_ENV });
});

// ── Manual drift job trigger (dev only — remove in production)
if (process.env.NODE_ENV === 'development') {
  app.post('/dev/run-drift', async (req, res) => {
    const { runDriftJob } = require('./services/drift');
    console.log('[dev] Manual drift job triggered');
    runDriftJob()
      .then(() => console.log('[dev] Manual drift job complete'))
      .catch((err) => console.error('[dev] Manual drift job failed:', err.message));
    res.json({ message: 'Drift job triggered — check server logs' });
  });
}

// ── API routes (v1)
app.use('/api/v1/auth',        require('./routes/auth'));
app.use('/api/v1/models',      require('./routes/models'));
app.use('/api/v1/predictions', require('./routes/predictions'));
app.use('/api/v1/alerts',      require('./routes/alerts'));
app.use('/api/v1/reports',     require('./routes/reports'));

// ── 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── Boot
async function start() {
  try {
    console.log('→ Connecting to PostgreSQL...');
    console.log('  URL:', process.env.POSTGRES_URL
      ? process.env.POSTGRES_URL.replace(/:([^:@]+)@/, ':****@')
      : 'UNDEFINED');
    await sequelize.authenticate();
    console.log('✓ PostgreSQL connected');

    console.log('→ Syncing PostgreSQL models...');
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('✓ PostgreSQL models synced');

    console.log('→ Connecting to MongoDB...');
    console.log('  URI:', process.env.MONGODB_URI || 'UNDEFINED');
    await connectMongo();
    console.log('✓ MongoDB connected');

    // Start the hourly drift cron job
    startCron();

    app.listen(PORT, () => {
      console.log(`✓ ModelPulse API running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('✗ Failed to start');
    console.error('  Message:', err.message);
    console.error('  Stack:', err.stack);
    process.exit(1);
  }
}

start();

module.exports = app;
