'use strict';

require('dotenv').config();
console.log('API KEY loaded:', process.env.ANTHROPIC_API_KEY ? 'YES (' + process.env.ANTHROPIC_API_KEY.slice(0,12) + '...)' : 'MISSING');
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const { sequelize } = require('./models');
const connectMongo  = require('./utils/mongo');
const { startCron } = require('./services/cron');

const app  = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(helmet());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000, max: 500,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'modelpulse-api', env: process.env.NODE_ENV });
});

if (process.env.NODE_ENV === 'development') {
  app.post('/dev/run-drift',    async (req, res) => { require('./services/drift').runDriftJob(); res.json({ message: 'Drift job triggered' }); });
  app.post('/dev/run-llm',      async (req, res) => { require('./services/llmCron').runLlmJob(); res.json({ message: 'LLM job triggered' }); });
  app.post('/dev/run-accuracy', async (req, res) => { require('./services/accuracyCron').runAccuracyJob(); res.json({ message: 'Accuracy job triggered' }); });
}

// ── API routes (v1)
app.use('/api/v1/auth',         require('./routes/auth'));
app.use('/api/v1/models',       require('./routes/models'));
app.use('/api/v1/predictions',  require('./routes/predictions'));
app.use('/api/v1/alerts',       require('./routes/alerts'));
app.use('/api/v1/reports',      require('./routes/reports'));
app.use('/api/v1/llm',          require('./routes/llm'));
app.use('/api/v1/ground-truth', require('./routes/groundTruth'));  // ← NEW

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

async function start() {
  try {
    console.log('→ Connecting to PostgreSQL...');
    console.log('  URL:', process.env.POSTGRES_URL ? process.env.POSTGRES_URL.replace(/:([^:@]+)@/, ':****@') : 'UNDEFINED');
    await sequelize.authenticate();
    console.log('✓ PostgreSQL connected');
    console.log('→ Syncing PostgreSQL models...');
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('✓ PostgreSQL models synced');
    console.log('→ Connecting to MongoDB...');
    console.log('  URI:', process.env.MONGODB_URI ? 'SET' : 'UNDEFINED');
    await connectMongo();
    console.log('✓ MongoDB connected');
    startCron();
    app.listen(PORT, () => console.log(`✓ ModelPulse API running on http://localhost:${PORT}`));
  } catch (err) {
    console.error('✗ Failed to start\n  Message:', err.message);
    process.exit(1);
  }
}

start();
module.exports = app;
