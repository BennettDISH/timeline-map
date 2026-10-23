const helmet = require('helmet');

// The security headers. One set of CSP directives for the whole app; the public Player View
// (/p, /p/*) additionally allows framing by the hosts in EMBED_ORIGINS — Spellforge's Map tab
// — and drops X-Frame-Options (which cannot express an allowlist). Everything else keeps
// helmet's defaults: frame-ancestors 'self' + XFO SAMEORIGIN, so nobody can frame the DM UI.
// A Spellforge address change means updating EMBED_ORIGINS here; an Atlas address change
// means updating Spellforge's MAP_SHARE_RE.
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

// Spellforge answers at its railway.app name and at the games' front door; a player on
// either one opens the Map tab, and a refused frame is a blank tab with no word why.
const DEFAULT_EMBED_ORIGINS = [
  'https://spellforge-production-1695.up.railway.app',
  'https://spellforge.bennettdishman.com',
];
const embedOrigins = (env = process.env) => {
  const set = (env.EMBED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return set.length ? set : DEFAULT_EMBED_ORIGINS;
};

const isPlayerPath = (p) => p === '/p' || p.startsWith('/p/');

// The middleware: the Player View's headers on /p and /p/*, the DM app's everywhere else.
function securityHeaders(env = process.env) {
  const dmHelmet = helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: { useDefaults: true, directives: CSP_DIRECTIVES },
  });
  const playerHelmet = helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: { useDefaults: true, directives: { ...CSP_DIRECTIVES, 'frame-ancestors': ["'self'", ...embedOrigins(env)] } },
    xFrameOptions: false,
  });
  return (req, res, next) => (isPlayerPath(req.path) ? playerHelmet(req, res, next) : dmHelmet(req, res, next));
}

module.exports = { CSP_DIRECTIVES, DEFAULT_EMBED_ORIGINS, embedOrigins, isPlayerPath, securityHeaders };
