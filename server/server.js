const express = require('express');
const compression = require('compression');
const {
  trustOneProxy, requestLog, sameOriginWrites, rateLimit, health, apiNotFound, errorHandler,
} = require('fleet-kit/server');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Behind Railway's proxy: trust that one hop and only it, so req.ip is the real client (the rate
// limits count it) and req.protocol the browser's https (the Waypoint redirect_uri)
const app = trustOneProxy(express());
const PORT = process.env.PORT || 3001;

// Ensure the DB schema exists on every boot (idempotent CREATE/ALTER IF NOT EXISTS), so a deploy
// needs no manual `npm run migrate`. Runs the full schema.sql; per-statement errors are logged,
// not fatal. The server LISTENS only once this settles: a request arriving mid-ensure could
// name a column the ALTER has not added yet.
const pool = require('./config/database');
const { applySchema } = require('./config/apply-schema');
const { wp } = require('./config/auth');
const { scheduleGuestSweep } = require('./lib/guests');
const { collapseLeadingSlashes, spaFallback } = require('./lib/spa');
const schemaReady = (async () => {
  try {
    // Loader lives in config/apply-schema.js so `npm run migrate` runs the identical statements.
    await applySchema(pool, {
      onError: (stmt, e) => console.error('schema ensure stmt skipped:', e.message),
    });
  } catch (e) { console.error('schema ensure skipped:', e.message); }
})();

// Security headers (lib/security.js): the CSP, and the embed contract — only the Player View
// (/p, /p/*) may be framed, and only by EMBED_ORIGINS (Spellforge's Map tab by default).
const { securityHeaders, isPlayerPath } = require('./lib/security');
// one line per request, with an id (fleet-kit's request log)
app.use(requestLog());
// then: //api/... is /api/... (lib/spa.js), so every rule below sees the plain path
app.use(collapseLeadingSlashes);
app.use(securityHeaders());
app.use(compression());

// Rate limiting. The whole table sits behind one venue IP and the Player View polls, so
// /api/share gets its own (laxer) bucket instead of the global one. The Atlas workspace
// gets its own generous bucket too — it autosaves on every typing pause, and a long prep
// session under the 300-cap was silently dropping writes into the client's error path.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }); // each IP, 300 per 15 minutes
const ownBucket = (p) => p.startsWith('/share') || p.startsWith('/atlas') || p.startsWith('/images-base64/serve');
app.use('/api/', (req, res, next) => (ownBucket(req.path) ? next() : limiter(req, res, next)));
app.use('/api/share', rateLimit({ windowMs: 15 * 60 * 1000, max: 2400 }));
app.use('/api/atlas', rateLimit({ windowMs: 15 * 60 * 1000, max: 6000 }));
// public art loads (every phone at the table, through one venue IP) never count against the
// DM's own bucket
app.use('/api/images-base64/serve', rateLimit({ windowMs: 15 * 60 * 1000, max: 4000 }));

// The session is a cookie, so a write sent by another site's page would carry it: every write
// under /api has to come from the Atlas's own pages. The Player View's API (/api/share) is made
// for anyone holding a share link and reads no session, so it is left out.
app.use('/api', sameOriginWrites({ message: 'This request has to come from the Atlas itself.', except: ['/share'] }));

// Body parsing middleware. The upload route carries a base64 image (about 4/3 of the file:
// a 10 MB image is ~13.4 MB of JSON), so it gets its own, larger limit first; the parser
// skips a body already read. Nothing sends form bodies, so no urlencoded parser.
app.use(['/api/images/upload', '/api/images-base64/upload'], express.json({ limit: '14mb' }));
// the public share API takes small bodies only (a marker is tiny): this limit must sit
// AHEAD of the global parser, which skips a body already read
app.use('/api/share', express.json({ limit: '16kb' }));
app.use(express.json({ limit: '10mb' }));
// Express 5's parser leaves req.body undefined when a request carries no JSON body (a DELETE,
// a bare POST); the routes read req.body.x as they did under Express 4, which always gave {}
app.use((req, res, next) => { if (req.body === undefined) req.body = {}; next(); });

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
app.use('/api/voice', require('./routes/voice')); // voices and ambience — inert with no voice key (Gemini/OpenAI/ElevenLabs) or VOICE_ENABLED=0

// Health check endpoint (before the SPA fallback so it isn't swallowed): a SELECT 1 on the pool
// within 3 s (fleet-kit's), and the commit, which the live suites wait for
app.get('/health', health({
  db: pool,
  timeoutMs: 3000,
  info: () => ({ commit: process.env.RAILWAY_GIT_COMMIT_SHA || null, timestamp: new Date().toISOString() }),
}));

// An /api path no route answered is a JSON 404, not the app's page.
app.use('/api', apiNotFound('Route not found'));

// Waypoint sends the browser back here (the address registered for the Atlas); the server takes
// the code, sets the session and goes on to the page that needed an account.
app.get('/auth/callback', wp.callback);

// The admin's pages (/admin, /admin/worlds/:id), decided on the server before the page goes out:
// signed out → sign in and back, anyone else → a plain 403 with nothing of the admin area in it.
// Their data asks again (/api/admin).
app.use(wp.adminPage({ pages: /^\/admin(?:\/.*)?$/ }));

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

  // SPA fallback: serve index.html for any client-route GET so client-side routes work on
  // direct navigation / refresh (e.g. /w/:id/m/:id). The API, file-like paths and other
  // methods fall through to the JSON 404 instead (lib/spa.js).
  app.use(spaFallback((req) => (isPlayerPath(req.path) ? indexHtml : withWidget)));
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Last (fleet-kit's): the body parser's refusals are the caller's 400/413 in plain words, any
// other 4xx says what it was, and a 5xx is logged with the request id while the DM gets one
// plain sentence, never the error itself
app.use(errorHandler({
  messages: {
    badJson: 'The request body is not valid JSON',
    tooLarge: 'That is too big to send — images are limited to 10 MB',
    server: 'Something went wrong!',
  },
}));

schemaReady.finally(() => app.listen(PORT, (err) => {
  // Express 5 hands a listen error (a port in use) to this callback instead of throwing it
  if (err) throw err;
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  if (!process.env.SESSION_SECRET && !process.env.JWT_SECRET) console.error('JWT_SECRET (or SESSION_SECRET) is not set: sign-in is off');
  scheduleGuestSweep(); // after the schema: it reads users.last_seen_at
}));
