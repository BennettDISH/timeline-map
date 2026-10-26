const kit = require('fleet-kit/server');

// The security headers (fleet-kit's): one Content-Security-Policy for the whole app; the public
// Player View (/p, /p/*) additionally allows framing by the hosts in EMBED_ORIGINS — Spellforge's
// Map tab — and drops X-Frame-Options (which cannot express an allowlist). Everything else keeps
// frame-ancestors 'self' + XFO SAMEORIGIN, so nobody can frame the DM UI.
// A Spellforge address change means updating EMBED_ORIGINS here; an Atlas address change
// means updating Spellforge's MAP_SHARE_RE.

// The bug-tracker feedback widget: loads widget.js and posts reports back to its API (the kit
// puts it in script-src and connect-src).
const WIDGET_ORIGIN = 'https://bug-tracker-production-4ccb.up.railway.app';

// The games' media bucket: the Player View's ambience beds and cues (client/public/audio/manifest.json)
// are fetched from here and decoded in Web Audio, which only connect-src has to allow (the kit
// merges this with its own: this origin and the widget).
const MEDIA_ORIGIN = 'https://media.bennettdishmanmedia.com';

// What the Atlas loads beyond the kit's strict defaults (this origin only, no inline script):
const CSP_ADD = {
  // images from any https host (+ data/blob): R2's public URL (pub-*.r2.dev / the custom domain)
  'img-src': ['https:'],
  // voice lines and ambience are audio objects on R2 — without this the browser renders the
  // player and silently refuses to load the file
  'media-src': ["'self'", 'blob:', 'https:'],
  'connect-src': [MEDIA_ORIGIN],
  // stylesheets and fonts from https hosts (Google Fonts), as before
  'style-src': ['https:'],
  'font-src': ['https:', 'data:'],
  'script-src-attr': ["'none'"],
  'upgrade-insecure-requests': [],
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
  const common = { widgetOrigin: WIDGET_ORIGIN, add: CSP_ADD, replace: { 'base-uri': ["'self'"] } };
  const dm = kit.securityHeaders({ ...common, frameAncestors: "'self'" });
  const player = kit.securityHeaders({ ...common, frameAncestors: ["'self'", ...embedOrigins(env)].join(' ') });
  return (req, res, next) => (isPlayerPath(req.path) ? player(req, res, next) : dm(req, res, next));
}

module.exports = { CSP_ADD, WIDGET_ORIGIN, MEDIA_ORIGIN, DEFAULT_EMBED_ORIGINS, embedOrigins, isPlayerPath, securityHeaders };
