// One set of input checks for every write route, so a bad value is a 400 with a plain
// sentence instead of a Postgres error dressed as 'Server error'. Each cleaner returns the
// cleaned value, or `undefined` when the input is unusable; nothing here throws.
const ID = /^[1-9]\d{0,9}$/; // one spelling per id: no '60.0', '6e1', '060' or '-1'
const isId = (v) => ID.test(String(v));
const INT_MAX = 2147483647; // Postgres INTEGER

// a whole number (a moment on the world clock, a pixel size); null or '' clears; anything
// else — a decimal, a word, a boolean — is unusable
function whole(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean' || typeof v === 'object') return undefined;
  const n = Number(v);
  return Number.isInteger(n) && Math.abs(n) <= INT_MAX ? n : undefined;
}
// text clamped to a column width. null clears (unusable when required); non-strings are
// unusable rather than stringified, so a number or an object never lands as a name
function text(v, max, { required = false, trim = true } = {}) {
  if (v == null) return required ? undefined : null;
  if (typeof v !== 'string') return undefined;
  const s = (trim ? v.trim() : v).slice(0, max);
  return required && !s ? undefined : s;
}
const oneOf = (v, list) => (list.includes(v) ? v : undefined);
const bool = (v) => (typeof v === 'boolean' ? v : (v === 'true' ? true : v === 'false' ? false : undefined));
// a start/end pair is ordered when both are set and start <= end; an open bound is always fine
const ordered = (st, en) => st == null || en == null || st <= en;
// a coordinate in % of the map plane, clamped onto it (a drag can only overshoot by a hair)
function pct(v, dflt = 50) {
  if (v == null || v === '') return dflt;
  const n = Number(v);
  return typeof v !== 'boolean' && Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n)) * 100) / 100 : undefined;
}
// one rule for a world's name on every path: create, rename and clone
const worldName = (v) => text(v, 255, { required: true });

// Clean a request body against a spec { field: [cleaner, message] }. Fields absent from
// the body are skipped (a PATCH sends only what changed); the first unusable field ends
// it with its message. Returns { vals } or { bad }.
function cleanBody(body, spec) {
  const vals = {};
  const b = body && typeof body === 'object' ? body : {};
  for (const [k, [clean, msg]] of Object.entries(spec)) {
    if (!(k in b)) continue;
    const v = clean(b[k]);
    if (v === undefined) return { bad: msg };
    vals[k] = v;
  }
  return { vals };
}
// express param guard: a non-canonical id is a 404 before any query runs
const idParam = (req, res, next, value) => (isId(value) ? next() : res.status(404).json({ message: 'Not found' }));

module.exports = { isId, whole, text, oneOf, bool, ordered, pct, worldName, cleanBody, idParam, INT_MAX };

// an outline keeps at most this many corners (the client's utils/geometry.js simplifies a trace down to it)
const MAX_CORNERS = 200;
module.exports.MAX_CORNERS = MAX_CORNERS;
