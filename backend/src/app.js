const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('node:path');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const { requireAuth } = require('./middleware/requireAuth');
const { errorHandler, notFound } = require('./middleware/errors');

const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      ...(process.env.NODE_ENV === 'production' ? {} : { upgradeInsecureRequests: null })
    }
  }
}));
app.use(cors((req, callback) => {
  const origin = req.get('origin');
  if (!origin) return callback(null, { origin: false });
  let sameOrigin = false;
  try {
    sameOrigin = new URL(origin).host === req.get('host');
  } catch {
    sameOrigin = false;
  }
  callback(null, { origin: allowedOrigins.includes(origin) || sameOrigin, credentials: true });
}));
app.use(express.json({ limit: '100kb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.get('origin')) return next();
  const origin = req.get('origin');
  let sameOrigin = false;
  try {
    sameOrigin = new URL(origin).host === req.get('host');
  } catch {
    sameOrigin = false;
  }
  if (allowedOrigins.includes(origin) || sameOrigin) return next();
  res.status(403).json({ error: 'Request origin is not allowed' });
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth, apiRoutes);
app.use(express.static(path.resolve(__dirname, '../../frontend')));
app.use(notFound);
app.use(errorHandler);

module.exports = app;
