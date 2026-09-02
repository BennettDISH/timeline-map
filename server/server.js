const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure the DB schema exists on every boot (idempotent CREATE/ALTER IF NOT EXISTS), so a deploy
// needs no manual `npm run migrate`. Runs the full schema.sql; per-statement errors are logged, not fatal.
const pool = require('./config/database');
const { applySchema } = require('./config/apply-schema');
(async () => {
  try {
    // Loader lives in config/apply-schema.js so `npm run migrate` runs the identical statements.
    await applySchema(pool, {
      onError: (stmt, e) => console.error('schema ensure stmt skipped:', e.message),
    });
  } catch (e) { console.error('schema ensure skipped:', e.message); }
})();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // Helmet's default CSP is img-src 'self' data:, which blocks cross-origin R2 image URLs
  // (pub-*.r2.dev / custom domain). Allow images from any https host (+ data/blob) while
  // keeping scripts/styles on the locked-down defaults.
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      // Bug-tracker feedback widget: loads widget.js and posts reports back to its API
      'script-src': ["'self'", 'https://bug-tracker-production-4ccb.up.railway.app'],
      'connect-src': ["'self'", 'https://bug-tracker-production-4ccb.up.railway.app'],
    },
  },
}));
app.use(compression());

// Spellforge embeds the public Player View in an iframe. Only /p/* may be framed, and
// only by spellforge (plus ourselves) — the authed app keeps helmet's defaults
// (frame-ancestors 'self' + X-Frame-Options SAMEORIGIN), so nobody can frame the DM UI.
const SPELLFORGE = 'https://spellforge-production-1695.up.railway.app';
app.use((req, res, next) => {
  if (req.path === '/p' || req.path.startsWith('/p/')) {
    const csp = res.getHeader('Content-Security-Policy');
    if (csp) {
      res.setHeader('Content-Security-Policy',
        String(csp).replace("frame-ancestors 'self'", `frame-ancestors 'self' ${SPELLFORGE}`));
    }
    // XFO cannot express an allowlist; browsers that understand frame-ancestors ignore it,
    // but drop it here so older ones do not hard-block the embed
    res.removeHeader('X-Frame-Options');
  }
  next();
});

// Behind Railway's proxy — trust the first hop so req.ip is the real client (for rate limiting)
app.set('trust proxy', 1);

// Rate limiting. The whole table sits behind one venue IP and the Player View polls, so
// /api/share gets its own (laxer) bucket instead of the global one. The Atlas workspace
// gets its own generous bucket too — it autosaves on every typing pause, and a long prep
// session under the 300-cap was silently dropping writes into the client's error path.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs
  skip: (req) => req.path.startsWith('/share') || req.path.startsWith('/atlas'),
});
app.use('/api/', limiter);
app.use('/api/share', rateLimit({ windowMs: 15 * 60 * 1000, max: 2400 }));
app.use('/api/atlas', rateLimit({ windowMs: 15 * 60 * 1000, max: 6000 }));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : 'http://localhost:5173',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.use('/api/setup', require('./routes/setup'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/worlds', require('./routes/worlds'));
app.use('/api/images', require('./routes/images'));
app.use('/api/images-base64', require('./routes/image-base64'));
app.use('/api/image-folders', require('./routes/imageFolders'));
app.use('/api/atlas', require('./routes/atlas')); // redesigned model (nodes/placements/links)
app.use('/api/share', require('./routes/share')); // public Player View (tokened, read-only, server-filtered)
app.use('/api/forge', require('./routes/forge')); // per-world AI mind — inert without GEMINI_API_KEY

// Health check endpoint (before the SPA fallback so it isn't swallowed)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve the built React app whenever it exists — independent of NODE_ENV, so a missing
// NODE_ENV=production on the host doesn't leave every page as a JSON "Route not found".
const distPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));

  // SPA fallback: serve index.html for any non-API GET so client-side routes work on direct
  // navigation / refresh (e.g. /auth/callback, /map/:id).
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});