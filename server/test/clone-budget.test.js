// A world copy spends the upload allowance, run locally (no database, no network): the copy
// owns its art — every image is copied in storage — so it spends the source's image bytes from
// the day's upload allowance (lib/spend.js, kind 'upload') before anything is copied, and over
// it is a 429 with nothing made. The tables are stood in for: the source is its art's size and
// nothing else, so a copy let through runs to its end with nothing to copy. (A copy that fails
// partway giving the allowance back runs on a real database in world-copy.test.js.)
//
//   node --test server/test/clone-budget.test.js
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const pool = require('../config/database');
const { wp } = require('../config/auth');

process.env.JWT_SECRET ||= 'clone-budget-test';
for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL']) delete process.env[k];
Object.assign(process.env, { UPLOAD_DAILY_CAP: '1', UPLOAD_DAILY_CAP_GUEST: '1', UPLOAD_DAILY_CEILING: '100' }); // MB

const USERS = { 21: { id: 21, central_user_id: 5021, is_guest: false }, 22: { id: 22, central_user_id: 5022, is_guest: true } };
let counters = new Map(); // `${kind}|${userId}` -> used
let snapshot = null;
let artBytes = 0; // the source world's images, all together
let copying = 0; // copies that were let through (their world row went in)
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
  if (/SELECT COUNT\(\*\)::int AS n FROM worlds WHERE created_by=\$1/.test(s)) return { rows: [{ n: 0 }] };
  if (/FROM forge_batches/.test(s)) return { rows: [] };
  if (/SUM\(file_size\)/.test(s)) return { rows: [{ bytes: String(artBytes) }] };
  // the copy takes its world id up front (its objects go under worlds/<id>/ before the rows do)
  if (/nextval\(pg_get_serial_sequence\('worlds','id'\)\)/.test(s)) return { rows: [{ id: String(100 + copying + 1) }] };
  if (/^INSERT INTO worlds/.test(s)) { copying += 1; return { rows: [{ id: params[0] }] }; }
  // past its art's size the source is empty: every loop of the copy finds nothing to copy
  if (/^SELECT [bfp*.]+ FROM (image_folders|images|maps|nodes|placements|links|eras|map_backdrops|node_facts|world_minds)\b/.test(s)) return { rows: [] };
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
    headers: { 'content-type': 'application/json', cookie: `${wp.session.name}=${wp.session.mint({ id: userId })}` },
    body: JSON.stringify({ source_id: 7, name }),
  });
  return { status: r.status, body: await r.json() };
};

test("a copy spends its art's bytes from the day's upload allowance, and over it nothing is made", async () => {
  const error = console.error;
  console.error = () => {}; // a copy that did fail would log why, and the assert says so anyway
  try {
    artBytes = 600 * 1024;
    assert.strictEqual((await copy(21, 'First copy')).status, 201);
    assert.strictEqual(copying, 1, 'the first copy was let through');
    assert.strictEqual(counters.get('upload|21'), 600, 'and spent 600 KB of the account\'s 1 MB');
    const second = await copy(21, 'Second copy');
    assert.strictEqual(second.status, 429);
    // 424 KB of the day is still unused: the copy is too big, the day isn't used up
    assert.strictEqual(second.body.message.split(' — ')[0], "This needs 600 KB, but only 424 KB of today's 1 MB of uploads are left");
    assert.strictEqual(second.body.allowance.left, 424);
    assert.strictEqual(copying, 1, 'the second copy was never started');

    // a guest has its own (here equal) allowance; a world with no art spends nothing
    artBytes = 2 * 1024 * 1024;
    assert.strictEqual((await copy(22, 'Too much art')).status, 429);
    artBytes = 0;
    assert.strictEqual((await copy(22, 'No art')).status, 201);
    assert.strictEqual(copying, 2);
    assert.strictEqual(counters.get('upload|22'), undefined);
  } finally {
    console.error = error;
  }
});
