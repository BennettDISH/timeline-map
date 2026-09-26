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

// Security middleware. One set of CSP directives for the whole app; the public Player
// View (/p, /p/*) additionally allows framing by the hosts in EMBED_ORIGINS — Spellforge's
// Map tab by default — and drops X-Frame-Options (which cannot express an allowlist).
// Everything else keeps helmet's defaults: frame-ancestors 'self' + XFO SAMEORIGIN, so
// nobody can frame the DM UI. A Spellforge domain change means updating EMBED_ORIGINS
// here; an Atlas domain change means updating Spellforge's MAP_SHARE_RE.
const CSP_DIRECTIVES = {
  // Helmet's default CSP is img-src 'self' data:, which blocks cross-origin R2 image URLs
  // (pub-*.r2.dev / custom domain). Allow images from any https host (+ data/blob) while
  // keeping scripts/styles on the locked-down defaults.
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  // Voice lines and ambience are audio objects on R2 — without this the browser
  // renders the player and silently refuses to load the file.
  'media-src': ["'self'", 'blob:', 'https:'],
  // Bug-tracker feedback widget: loads widget.js and posts reports back to its API
  'script-src': ["'self'", 'https://bug-tracker-production-4ccb.up.railway.app'],
  'connect-src': ["'self'", 'https://bug-tracker-production-4ccb.up.railway.app'],
};
const EMBED_ORIGINS = (process.env.EMBED_ORIGINS || 'https://spellforge-production-1695.up.railway.app')
  .split(',').map((s) => s.trim()).filter(Boolean);
const dmHelmet = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: { useDefaults: true, directives: CSP_DIRECTIVES },
});
const playerHelmet = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: { useDefaults: true, directives: { ...CSP_DIRECTIVES, 'frame-ancestors': ["'self'", ...EMBED_ORIGINS] } },
  xFrameOptions: false,
});
const isPlayerPath = (p) => p === '/p' || p.startsWith('/p/');
app.use((req, res, next) => (isPlayerPath(req.path) ? playerHelmet(req, res, next) : dmHelmet(req, res, next)));
app.use(compression());

// Behind Railway's proxy — trust the first hop so req.ip is the real client (for rate limiting)
app.set('trust proxy', 1);

// Rate limiting. The whole table sits behind one venue IP and the Player View polls, so
// /api/share gets its own (laxer) bucket instead of the global one. The Atlas workspace
// gets its own generous bucket too — it autosaves on every typing pause, and a long prep
// session under the 300-cap was silently dropping writes into the client's error path.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs
  skip: (req) => req.path.startsWith('/share') || req.path.startsWith('/atlas') || req.path.startsWith('/images-base64/serve'),
});
app.use('/api/', limiter);
app.use('/api/share', rateLimit({ windowMs: 15 * 60 * 1000, max: 2400 }));
app.use('/api/atlas', rateLimit({ windowMs: 15 * 60 * 1000, max: 6000 }));
// public art loads (every phone at the table, through one venue IP) never count against the
// DM's own bucket
app.use('/api/images-base64/serve', rateLimit({ windowMs: 15 * 60 * 1000, max: 4000 }));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : 'http://localhost:5173',
  credentials: true,
  exposedHeaders: ['X-Refreshed-Token'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/worlds', require('./routes/worlds'));
app.use('/api/images', require('./routes/images'));
app.use('/api/images-base64', require('./routes/image-base64'));
app.use('/api/image-folders', require('./routes/imageFolders'));
app.use('/api/atlas', require('./routes/atlas')); // redesigned model (nodes/placements/links)
app.use('/api/share', require('./routes/share')); // public Player View (tokened, read-only, server-filtered)
app.use('/api/forge', require('./routes/forge')); // per-world AI mind — inert without GEMINI_API_KEY
app.use('/api/voice', require('./routes/voice')); // voices and ambience — inert without ELEVENLABS_API_KEY

// Health check endpoint (before the SPA fallback so it isn't swallowed)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve the built React app whenever it exists — independent of NODE_ENV, so a missing
// NODE_ENV=production on the host doesn't leave every page as a JSON "Route not found".
const distPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath, { index: false }));

  // The internal bug-tracker widget is injected HERE, server-side, into every page except
  // the public Player View (/p/*): anonymous players get neither the reporting UI nor its
  // key, and the key never ships inside the client bundle.
  const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
  const widgetKey = process.env.BUG_WIDGET_KEY || '74c1c3da43cd9020a09f570d78ab8834b7ff73c59d9586793d9e8119f53f8c2d';
  const widgetTag = `<script src="https://bug-tracker-production-4ccb.up.railway.app/widget.js" data-api-key="${widgetKey}"></script>`;
  const withWidget = indexHtml.replace('</body>', `${widgetTag}</body>`);

  // SPA fallback: serve index.html for any non-API GET so client-side routes work on direct
  // navigation / refresh (e.g. /auth/callback, /w/:id/m/:id).
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    const isPlayer = req.path === '/p' || req.path.startsWith('/p/');
    res.type('html').send(isPlayer ? indexHtml : withWidget);
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  // the body parser and friends set err.status: a malformed body is the caller's 400, not a 500
  const status = err.status || err.statusCode;
  if (status && status < 500) {
    return res.status(status).json({ message: err.type === 'entity.parse.failed' ? 'The request body is not valid JSON' : (err.message || 'Bad request') });
  }
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