const pool = require('../config/database');

// The spend guard: every call that costs money — a Forge chat turn, a painting (in a turn or
// from ✦ Paint), a voice line, an ambience — is counted against a daily allowance per account,
// and everyone's together against a daily ceiling. Counts live in Postgres (spend_counters), so
// a restart or a deploy never hands out a fresh day. A day is a UTC day.
//
// Accounts get the CAP, guests the GUEST cap (0 shuts the feature for them), and all non-admin
// use together stops at the CEILING. An admin (ADMIN_CENTRAL_USER_IDS) is the one paying: their
// use is counted on their own row but never capped and never spends the ceiling.
// A call is counted when it is made, whether or not the provider then delivers.
// `upload` is the same guard on what an image upload stores (R2, or Postgres without it): its
// settings are megabytes and it counts kilobytes (`scale`), so a small image is not a whole MB.
const KINDS = {
  forge: {
    env: 'FORGE', defaults: { cap: 40, guest: 5, ceiling: 150 },
    name: 'The Forge', units: (n) => `${n} Forge use${n === 1 ? '' : 's'}`, what: 'chat turns and paintings',
  },
  voice: {
    env: 'VOICE', defaults: { cap: 20, guest: 3, ceiling: 100 },
    name: 'Voice', units: (n) => `${n} voice recording${n === 1 ? '' : 's'}`, what: 'lines and ambiences',
  },
  upload: {
    env: 'UPLOAD', defaults: { cap: 250, guest: 25, ceiling: 2000 }, scale: 1024,
    name: 'Uploading', units: (kb) => `${Math.round(kb / 1024)} MB of uploads`, what: 'images',
  },
};
// spend_counters.used is an int: a setting scaled past it would make every upload a 500
const INT_MAX = 2147483647;

// A setting is a whole number of 0 or more; unset or blank keeps the default, and anything
// else is logged once and ignored (a typo must never open the tap).
const warned = new Set();
function setting(name, fallback, env = process.env) {
  const raw = env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number(String(raw).trim());
  if (Number.isInteger(n) && n >= 0) return n;
  if (!warned.has(name)) { warned.add(name); console.error(`${name} must be a whole number of 0 or more — using ${fallback}`); }
  return fallback;
}

// { cap, ceiling } for this user and kind; cap null means uncapped (an admin).
function limitsFor(user, kind, env = process.env) {
  const k = KINDS[kind];
  const scaled = (n) => Math.min(n * (k.scale ?? 1), INT_MAX);
  const ceiling = scaled(setting(`${k.env}_DAILY_CEILING`, k.defaults.ceiling, env));
  if (user?.isAdmin) return { cap: null, ceiling: null, admin: true };
  const cap = scaled(user?.is_guest ? setting(`${k.env}_DAILY_CAP_GUEST`, k.defaults.guest, env) : setting(`${k.env}_DAILY_CAP`, k.defaults.cap, env));
  return { cap, ceiling, admin: false, guest: !!user?.is_guest };
}

const today = (now = new Date()) => now.toISOString().slice(0, 10);
const resetsAt = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
function untilReset(now = new Date()) {
  const h = Math.round((resetsAt(now) - now) / 3600000);
  return `midnight UTC, ${h < 1 ? 'in under an hour' : h === 1 ? 'in about an hour' : `in about ${h} hours`}`;
}

// The sentence the DM reads when a call is refused.
function refusalText(kind, scope, limit, now = new Date()) {
  const k = KINDS[kind];
  if (scope === 'closed') return `${k.name} is not open to ${limit === 'guest' ? 'guests — sign in with an account to use it' : 'this account'}`;
  if (scope === 'ceiling') return `${k.name} has reached its daily limit for everyone — it opens again at ${untilReset(now)}`;
  if (scope === 'guest') return `Guests get ${k.units(limit)} a day, and today's are used — they come back at ${untilReset(now)}`;
  return `You've used today's ${k.units(limit)} (${k.what}) — they come back at ${untilReset(now)}`;
}

// The applyError a Forge turn reports when its proposal wants more paintings than are left.
function paintingsText(left, wanted, now = new Date()) {
  return left > 0
    ? `this proposal wanted ${wanted} paintings and only ${left} Forge use${left === 1 ? ' is' : 's are'} left today — ask for fewer, or try again after ${untilReset(now)}`
    : `this proposal wanted ${wanted} painting${wanted === 1 ? '' : 's'} and today's Forge uses are spent — they come back at ${untilReset(now)}`;
}

// Add n to one counter row, but only while it stays within `max` (null = no limit). The row lock
// taken by the upsert makes two calls racing for the last use take turns, so a cap is never
// passed. Returns false when the row is full.
async function bump(db, day, kind, userId, n, max) {
  if (max != null && n > max) return false;
  const r = await db.query(
    `INSERT INTO spend_counters (day, kind, user_id, used) VALUES ($1::date, $2, $3, $4)
     ON CONFLICT (day, kind, user_id) DO UPDATE SET used = spend_counters.used + EXCLUDED.used
       WHERE $5::int IS NULL OR spend_counters.used + EXCLUDED.used <= $5::int
     RETURNING used`, [day, kind, userId, n, max]);
  return r.rowCount > 0;
}

// What is used and left today: { limit, used, left, resetsAt } (limit and left null for an admin).
async function allowance(user, kind, db = pool, now = new Date()) {
  const { cap, ceiling, admin } = limitsFor(user, kind);
  const r = await db.query('SELECT user_id, used FROM spend_counters WHERE day=$1::date AND kind=$2 AND user_id = ANY($3)', [today(now), kind, [user.id, 0]]);
  const of = (id) => Number(r.rows.find((x) => x.user_id === id)?.used || 0);
  const used = of(user.id);
  return {
    limit: admin ? null : cap, used,
    left: admin ? null : Math.max(0, Math.min(cap - used, ceiling - of(0))),
    resetsAt: resetsAt(now).toISOString(),
  };
}

// Old days are dropped once a day per process; nothing reads them.
let prunedOn = null;
function prune(day) {
  if (prunedOn === day) return;
  prunedOn = day;
  pool.query(`DELETE FROM spend_counters WHERE day < $1::date - 40`, [day]).catch((e) => console.error('spend prune failed:', e.message));
}

// Spend n of the user's allowance for `kind`. Returns null when it was spent, or a refusal
// { scope, message, left } when it was not (nothing is counted then).
async function take(user, kind, n = 1, now = new Date()) {
  const { cap, ceiling, admin, guest } = limitsFor(user, kind);
  if (cap === 0) return { scope: 'closed', left: 0, message: refusalText(kind, 'closed', guest ? 'guest' : 'account', now) };
  const day = today(now);
  const client = await pool.connectTx();
  let refused = null;
  try {
    await client.query('BEGIN');
    if (!(await bump(client, day, kind, user.id, n, cap))) refused = guest ? 'guest' : 'account';
    else if (!admin && !(await bump(client, day, kind, 0, n, ceiling))) refused = 'ceiling';
    await client.query(refused ? 'ROLLBACK' : 'COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  prune(day);
  if (!refused) return null;
  const { left } = await allowance(user, kind, pool, now);
  return { scope: refused, left, message: refusalText(kind, refused, refused === 'ceiling' ? ceiling : cap, now) };
}

// Route helper: spends one use, or answers 429 with the sentence and returns false.
async function charge(req, res, kind, n = 1) {
  const refusal = await take(req.user, kind, n);
  if (!refusal) return true;
  res.status(429).json({ message: refusal.message, allowance: { scope: refusal.scope, left: refusal.left } });
  return false;
}

module.exports = { KINDS, setting, limitsFor, refusalText, paintingsText, untilReset, allowance, take, charge, today };
