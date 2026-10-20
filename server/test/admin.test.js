// The admin's look-only browse, run locally (no database, no network): every admin route turns
// away a signed-out caller (401), a signed-in non-admin and a guest (403) before any query runs;
// the lists come 50 a page with their total, and search treats % and _ as plain characters; and
// no answer carries a password hash, a token, a share token or image bytes, whatever the
// database hands back. The real SQL runs against the local stack in e2e/admin.mjs.
//
//   node --test server/test/admin.test.js
process.env.JWT_SECRET = 'admin-test-secret';
process.env.ADMIN_CENTRAL_USER_IDS = '7';
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const account = (id, central, guest = false) => ({
  id, username: `user${id}`, email: `user${id}@example.invalid`, role: 'viewer', token_version: 0,
  central_user_id: central, is_guest: guest, unseen: false,
});
const ACCOUNTS = { 1: account(1, 3), 2: account(2, 7), 3: account(3, 7, true), 4: account(4, null) };
const tokenOf = (id) => jwt.sign({ userId: id, tv: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });

// what a careless SELECT would bring along: none of it may ever reach an answer
const LEAKS = { password_hash: 'HASH-LEAK', share_token: 'SHARE-LEAK', base64_data: 'BYTES-LEAK', storage_key: 'KEY-LEAK', token_version: 31337 };
const ROW = {
  ...LEAKS, id: 5, username: 'someone', email: 'someone@example.invalid', name: 'A world', title: 'A title', central_user_id: 3, is_guest: false,
  file_path: '/api/images-base64/serve/a.png', backdrop: null, created: { nodes: [1, 2], maps: [] }, x: 10, y: 20,
  prep_note: '<p>Prep &amp; plan</p>', recap_note: '<ul><li>They won</li></ul>', shared: true,
};
let queries = [];
let total = 120;
pool.query = async (sql, params = []) => {
  // the session check (middleware/auth.js)
  if (/FROM users WHERE id = \$1/.test(sql)) return { rows: ACCOUNTS[params[0]] ? [ACCOUNTS[params[0]]] : [] };
  queries.push({ sql, params });
  if (/^SELECT count\(\*\)::int AS n FROM/.test(sql.trim())) return { rows: [{ n: total }] };
  return { rows: [{ ...ROW }] };
};

let base, server;
test.before(async () => {
  const app = express();
  app.use('/api/admin', require('../routes/admin'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/admin`;
});
test.after(() => { server.close(); pool.end().catch(() => {}); });

const get = async (path, who) => {
  const r = await fetch(base + path, { headers: who ? { Authorization: `Bearer ${tokenOf(who)}` } : {} });
  return { status: r.status, text: await r.text() };
};
const body = (r) => JSON.parse(r.text);
const LISTS = ['/users', '/worlds', '/maps', '/nodes', '/eras', '/images', '/forge/messages', '/forge/batches'];
const ONES = ['/summary', '/db-status', '/worlds/5', '/maps/5', '/nodes/5'];

test('signed out is a 401; a non-admin, a guest on an admin id and an account with no Waypoint id get 403, before any query', async () => {
  queries = [];
  for (const path of [...LISTS, ...ONES]) {
    assert.strictEqual((await get(path)).status, 401, path);
    for (const who of [1, 3, 4]) assert.strictEqual((await get(path, who)).status, 403, `${path} as account ${who}`);
  }
  assert.deepStrictEqual(queries, []);
});

test('the admin gets every list 50 a page, with the total and the page count', async () => {
  for (const path of LISTS) {
    queries = [];
    const r = await get(`${path}?page=3`, 2);
    assert.strictEqual(r.status, 200, path);
    const b = body(r);
    assert.deepStrictEqual([b.page, b.pages, b.pageSize, b.total, b.items.length], [3, 3, 50, 120, 1], path);
    assert.match(queries.at(-1).sql, /LIMIT 50 OFFSET 100$/, path);
  }
  total = 0;
  const empty = body(await get('/worlds', 2));
  assert.deepStrictEqual([empty.page, empty.pages, empty.total], [1, 1, 0]);
  total = 120;
});

test('a page that is not a page number is the first page', async () => {
  for (const p of ['abc', '0', '-2', '2.5', '']) {
    queries = [];
    const b = body(await get(`/nodes?page=${p}`, 2));
    assert.strictEqual(b.page, 1, p);
    assert.match(queries.at(-1).sql, /LIMIT 50 OFFSET 0$/, p);
  }
});

test('search is case-blind, takes % and _ as plain characters, and a number also finds the id', async () => {
  queries = [];
  const b = body(await get(`/users?q=${encodeURIComponent('  50%_off\\ ')}`, 2));
  assert.strictEqual(b.q, '50%_off\\');
  for (const { sql, params } of queries) {
    assert.match(sql, /u\.username ILIKE \$1 OR u\.email ILIKE \$1/);
    assert.deepStrictEqual(params, ['%50\\%\\_off\\\\%']);
  }
  queries = [];
  await get('/worlds?q=%2312', 2);
  assert.match(queries[0].sql, /w\.id = \$2/);
  assert.deepStrictEqual(queries[0].params, ['%#12%', 12]);
  queries = [];
  await get('/images?q=%20%20', 2);
  assert.doesNotMatch(queries[0].sql, /WHERE/);
});

test('a world or owner filter must be an id; a good one narrows the list', async () => {
  for (const [path, col] of [['/nodes', 'n.world_id'], ['/maps', 'm.world_id'], ['/eras', 'e.world_id'], ['/images', 'i.world_id'],
    ['/forge/messages', 'mm.world_id'], ['/forge/batches', 'b.world_id'], ['/worlds?owner=12&x=', 'w.created_by']]) {
    const bad = path.includes('?') ? path.replace('12', 'abc') : `${path}?world=abc`;
    queries = [];
    assert.strictEqual((await get(bad, 2)).status, 400, bad);
    assert.deepStrictEqual(queries, [], bad);
    await get(path.includes('?') ? path : `${path}?world=12`, 2);
    assert.match(queries[0].sql, new RegExp(`WHERE ${col.replace('.', '\\.')} = \\$1`), path);
    assert.deepStrictEqual(queries[0].params, [12], path);
  }
});

test('no answer carries a hash, a token, a share token or image bytes', async () => {
  for (const path of [...LISTS, ...ONES]) {
    queries = [];
    const r = await get(path, 2);
    assert.strictEqual(r.status, 200, path);
    for (const v of Object.values(LEAKS)) assert.ok(!r.text.includes(String(v)), `${path} sent ${v}`);
    for (const { sql } of queries) {
      assert.doesNotMatch(sql, /password_hash|token_version|base64_data|storage_key/, path);
      assert.doesNotMatch(sql.replace(/share_token IS NOT NULL/g, ''), /share_token/, path);
    }
  }
});

test('one world reads whole: its session notes as plain text, its Forge batch counts, no share token', async () => {
  const w = body(await get('/worlds/5', 2)).world;
  assert.strictEqual(w.eras[0].prepNote, 'Prep & plan');
  assert.strictEqual(w.eras[0].recapNote, '- They won');
  assert.strictEqual(w.shared, true);
  assert.ok(!('shareToken' in w));
  const b = body(await get('/forge/batches', 2)).items[0];
  assert.deepStrictEqual(b.made, { nodes: 2 });
});

test('an id with another spelling is a 404 before any query runs', async () => {
  queries = [];
  for (const path of ['/worlds/5.0', '/maps/abc', '/nodes/-1', '/worlds/05']) assert.strictEqual((await get(path, 2)).status, 404, path);
  assert.deepStrictEqual(queries, []);
});
