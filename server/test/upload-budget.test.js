// The upload allowance, run locally (no database, no network): an image upload spends the day's
// megabytes from the spend guard (lib/spend.js, kind 'upload') — per account, per guest and for
// everyone together — before anything is stored, a refused file spends nothing, and an admin is
// never refused. The counter table is stood in for by a Map that keeps the guard's rule.
//
//   node --test server/test/upload-budget.test.js
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const pool = require('../config/database');
const spend = require('../lib/spend');

for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL']) delete process.env[k];
// small numbers so the files stay small: 1 MB an account, 1 MB a guest, 2 MB in all
Object.assign(process.env, { UPLOAD_DAILY_CAP: '1', UPLOAD_DAILY_CAP_GUEST: '1', UPLOAD_DAILY_CEILING: '2' });

let counters = new Map(); // `${kind}|${userId}` -> used, today only
let snapshot = null; // what a ROLLBACK goes back to
let stored = 0;
const counterSql = (sql, params) => {
  if (/INSERT INTO spend_counters/.test(sql)) {
    const [, kind, userId, n, max] = params;
    const key = `${kind}|${userId}`;
    const used = counters.get(key) ?? 0;
    if (max != null && used + n > max) return { rows: [], rowCount: 0 };
    counters.set(key, used + n);
    return { rows: [{ used: used + n }], rowCount: 1 };
  }
  if (/FROM spend_counters/.test(sql)) {
    const [, kind, ids] = params;
    return { rows: ids.filter((id) => counters.has(`${kind}|${id}`)).map((id) => ({ user_id: id, used: counters.get(`${kind}|${id}`) })) };
  }
  if (sql.trim() === 'BEGIN') snapshot = new Map(counters);
  if (sql.trim() === 'ROLLBACK') counters = snapshot;
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim()) || /DELETE FROM spend_counters/.test(sql)) return { rows: [], rowCount: 0 };
  return null;
};
pool.query = async (sql, params) => {
  const c = counterSql(sql, params);
  if (c) return c;
  if (/FROM worlds WHERE id=\$1 AND created_by=\$2/.test(sql)) return { rows: [{ '?column?': 1 }] };
  if (/INSERT INTO images/.test(sql)) {
    stored += 1;
    return { rows: [{ id: stored, filename: params[0], original_name: params[1], file_path: params[2], file_size: params[3], mime_type: params[4], alt_text: null, created_at: new Date() }] };
  }
  throw new Error(`unexpected query: ${sql}`);
};
pool.connectTx = async () => ({ query: pool.query, release() {} });

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const png = (kb) => `data:image/png;base64,${Buffer.concat([PNG_MAGIC, Buffer.alloc(kb * 1024 - PNG_MAGIC.length)]).toString('base64')}`;

const USERS = { account: { id: 11 }, guest: { id: 12, is_guest: true }, other: { id: 13 }, third: { id: 14 }, admin: { id: 1, isAdmin: true } };
let base, server;
test.before(async () => {
  const app = express();
  app.use(express.json({ limit: '14mb' }));
  // the route's own handler, signed in as whoever the request names
  app.post('/upload/:who', (req, res, next) => { req.user = USERS[req.params.who]; next(); }, require('../routes/image-base64').upload);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); pool.end().catch(() => {}); });

const send = async (who, imageData) => {
  const r = await fetch(`${base}/upload/${who}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageData, originalName: 'map.png', world_id: 5 }) });
  return { status: r.status, body: await r.json() };
};

test('an account spends its day in kilobytes, and the upload that would pass the cap is refused before it is stored', async () => {
  assert.strictEqual((await send('account', png(600))).status, 200);
  assert.strictEqual(counters.get('upload|11'), 600, 'counted in KB, not a whole MB');
  const before = stored;
  const over = await send('account', png(600));
  assert.strictEqual(over.status, 429);
  assert.match(over.body.message, /^You've used today's 1 MB of uploads \(images\) — they come back at midnight UTC/);
  assert.strictEqual(stored, before, 'nothing was stored');
  assert.strictEqual(counters.get('upload|11'), 600, 'and nothing was counted');
  assert.strictEqual((await send('account', png(300))).status, 200, 'what is left can still be used');
});

test('a refused file spends nothing; a guest has its own cap; everyone together stops at the ceiling; an admin never does', async () => {
  const bad = await send('other', `data:image/png;base64,${Buffer.from('not an image at all').toString('base64')}`);
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(counters.get('upload|13'), undefined, 'a refused input never spends');

  assert.strictEqual((await send('guest', png(700))).status, 200);
  const guest = await send('guest', png(400));
  assert.strictEqual(guest.status, 429);
  assert.match(guest.body.message, /^Guests get 1 MB of uploads a day, and today's are used/);

  // 900 + 700 so far: the ceiling (2 MB) has 448 KB left for anyone
  const ceiling = await send('other', png(500));
  assert.strictEqual(ceiling.status, 429);
  assert.match(ceiling.body.message, /^Uploading has reached its daily limit for everyone/);
  assert.strictEqual(counters.get('upload|13'), undefined, "refused by the ceiling, the account's own count goes back too");
  assert.strictEqual((await send('third', png(400))).status, 200, 'what is left of the ceiling still goes');

  for (let i = 0; i < 4; i += 1) assert.strictEqual((await send('admin', png(900))).status, 200, 'the admin is never capped');
  assert.strictEqual(counters.get('upload|0'), 2000, 'and never spends the ceiling');
});

test('the upload settings are megabytes, counted in kilobytes, and never past what the counter holds', () => {
  const env = {};
  assert.deepStrictEqual(spend.limitsFor({ id: 1 }, 'upload', env), { cap: 250 * 1024, ceiling: 2000 * 1024, admin: false, guest: false });
  assert.strictEqual(spend.limitsFor({ id: 2, is_guest: true }, 'upload', env).cap, 25 * 1024);
  assert.strictEqual(spend.limitsFor({ id: 1 }, 'upload', { UPLOAD_DAILY_CEILING: '99999999' }).ceiling, 2147483647);
  assert.strictEqual(spend.limitsFor({ id: 1 }, 'forge', env).cap, spend.KINDS.forge.defaults.cap, 'the Forge is not scaled');
});
