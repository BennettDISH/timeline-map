// A world copy spends the upload allowance, run locally (no database, no network): the copy
// owns its art — every image is copied in storage — so it spends the source's image bytes from
// the day's upload allowance (lib/spend.js, kind 'upload') before anything is copied, and over
// it is a 429 with nothing made. The tables are stood in for; the copy itself is stopped at its
// first write, which is all this needs to know it was let through.
//
//   node --test server/test/clone-budget.test.js
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const pool = require('../config/database');
const { generateToken } = require('../utils/token');

process.env.JWT_SECRET ||= 'clone-budget-test';
for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL']) delete process.env[k];
Object.assign(process.env, { UPLOAD_DAILY_CAP: '1', UPLOAD_DAILY_CAP_GUEST: '1', UPLOAD_DAILY_CEILING: '100' }); // MB

const USERS = { 21: { id: 21, central_user_id: 5021, is_guest: false }, 22: { id: 22, central_user_id: 5022, is_guest: true } };
let counters = new Map(); // `${kind}|${userId}` -> used
let snapshot = null;
let artBytes = 0; // the source world's images, all together
let copying = 0; // copies that got as far as their first write
pool.query = async (sql, params) => {
  const s = sql.trim();
  if (/INSERT INTO spend_counters/.test(s)) {
    const [, kind, userId, n, max] = params;
    const key = `${kind}|${userId}`;
    const used = counters.get(key) ?? 0;
    if (max != null && used + n > max) return { rows: [], rowCount: 0 };
    counters.set(key, used + n);
    return { rows: [{ used: used + n }], rowCount: 1 };
  }
  if (/FROM spend_counters/.test(s)) {
    const [, kind, ids] = params;
    return { rows: ids.filter((id) => counters.has(`${kind}|${id}`)).map((id) => ({ user_id: id, used: counters.get(`${kind}|${id}`) })) };
  }
  if (s === 'BEGIN') { snapshot = new Map(counters); return { rows: [] }; }
  if (s === 'ROLLBACK') { counters = snapshot; return { rows: [] }; }
  if (s === 'COMMIT' || /DELETE FROM spend_counters/.test(s)) return { rows: [] };
  if (/FROM users WHERE id = \$1/.test(s)) return { rows: [{ ...USERS[params[0]], username: `u${params[0]}`, email: null, role: 'user', token_version: 0, unseen: false }] };
  if (/^SELECT \* FROM worlds WHERE id=\$1/.test(s)) return { rows: [{ id: 7, name: 'The sample world', description: 'A sample', is_template: true, created_by: 99 }] };
  if (/SELECT 1 FROM worlds WHERE name=\$1 AND created_by=\$2/.test(s)) return { rows: [] };
  if (/SELECT COUNT\(\*\) FROM worlds WHERE created_by=\$1/.test(s)) return { rows: [{ count: '0' }] };
  if (/FROM forge_batches/.test(s)) return { rows: [] };
  if (/SUM\(file_size\)/.test(s)) return { rows: [{ bytes: String(artBytes) }] };
  if (/^INSERT INTO worlds/.test(s)) { copying += 1; throw new Error('stop here: the copy was let through'); }
  throw new Error(`unexpected query: ${s}`);
};
pool.connectTx = async () => ({ query: pool.query, release() {} });

let base, server;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/atlas', require('../routes/atlas'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); pool.end().catch(() => {}); });

const copy = async (userId, name) => {
  const r = await fetch(`${base}/api/atlas/worlds/clone`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${generateToken(userId, 0)}` },
    body: JSON.stringify({ source_id: 7, name }),
  });
  return { status: r.status, body: await r.json() };
};

test("a copy spends its art's bytes from the day's upload allowance, and over it nothing is made", async () => {
  const error = console.error;
  console.error = () => {}; // the stopped copies log their stop
  try {
    artBytes = 600 * 1024;
    assert.notStrictEqual((await copy(21, 'First copy')).status, 429);
    assert.strictEqual(copying, 1, 'the first copy was let through');
    assert.strictEqual(counters.get('upload|21'), 600, 'and spent 600 KB of the account\'s 1 MB');
    const second = await copy(21, 'Second copy');
    assert.strictEqual(second.status, 429);
    assert.match(second.body.message, /^You've used today's 1 MB of uploads/);
    assert.strictEqual(copying, 1, 'the second copy was never started');

    // a guest has its own (here equal) allowance; a world with no art spends nothing
    artBytes = 2 * 1024 * 1024;
    assert.strictEqual((await copy(22, 'Too much art')).status, 429);
    artBytes = 0;
    assert.notStrictEqual((await copy(22, 'No art')).status, 429);
    assert.strictEqual(copying, 2);
    assert.strictEqual(counters.get('upload|22'), undefined);
  } finally {
    console.error = error;
  }
});
