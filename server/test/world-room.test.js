// How much a world holds (lib/room.js), the retired sign-up form, and players' @-mentions, run
// locally: the real routes on a real Postgres in memory (PGlite, fresh from schema.sql). Nothing
// leaves this machine (no Waypoint, no R2, no Forge).
//  - every add counts: entries, maps, pins, threads, period texts, eras, folders and period
//    backdrops each stop at their most with one sentence, and the add that reaches 80% says so;
//  - the world payload says how full it is; a stranger learns nothing (404 before any count);
//  - a player's marker stops at a full world, and its @-mentions land as plain names that never
//    bring an entry up in the Loose ends list;
//  - an undo can't grow a world past its most, and a world keeps its newest 500 tombstones;
//  - a Forge batch is counted the same way before anything is painted;
//  - POST /api/auth/register is gone: sign-up is Waypoint's own form.
//
//   node --test server/test/world-room.test.js
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: '', JWT_SECRET: 'world-room-test', SESSION_SECRET: 'world-room-test',
  AUTH_SERVICE_URL: '', SSO_CLIENT_ID: '', SSO_CLIENT_SECRET: '', ADMIN_CENTRAL_USER_IDS: '9999',
  R2_ACCOUNT_ID: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '', R2_BUCKET: '', R2_PUBLIC_URL: '',
  GEMINI_API_KEY: '', VOICE_ENABLED: '0',
});
const realFetch = globalThis.fetch; // the test's own calls to the routes, on 127.0.0.1
globalThis.fetch = async () => { throw new Error('no network in this test'); };

const room = require('../lib/room');

let db, pool, base, server, wp;
test.before(async () => {
  const { createPglite, pglitePool } = await import('fleet-kit/test/pglite');
  db = await createPglite({ name: 'atlas' });
  pool = require('../config/database');
  Object.assign(pool, pglitePool(db));
  pool.connectTx = pool.connect;
  const { failed } = await require('../config/apply-schema').applySchema(pool);
  assert.deepStrictEqual(failed, [], 'schema.sql applies to a fresh database');
  await pool.query(`
    INSERT INTO users (id, username, email, password_hash, central_user_id, is_guest) VALUES
      (1, 'ann', NULL, 'x', 9001, false), (2, 'bob', NULL, 'x', 9002, false);
    ${['users', 'worlds', 'maps', 'nodes', 'images', 'placements', 'links', 'node_facts', 'eras', 'image_folders', 'map_backdrops', 'tombstones']
    .map((t) => `SELECT setval(pg_get_serial_sequence('${t}', 'id'), 100000);`).join('\n    ')}`);
  ({ wp } = require('../config/auth'));
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/atlas', require('../routes/atlas'));
  app.use('/api/share', require('../routes/share'));
  app.use('/api/image-folders', require('../routes/imageFolders'));
  app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  server.close();
  await db.close();
});

const call = async (userId, method, path, body) => {
  const headers = { 'content-type': 'application/json' };
  if (userId) headers.cookie = `${wp.session.name}=${wp.session.mint({ id: userId, token_version: 0 })}`;
  const r = await realFetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const rows = async (sql, args) => (await pool.query(sql, args)).rows;
const count = async (sql, args) => Number((await rows(sql, args))[0].n);

// A world of ann's with two maps, four entries and an image; ids are its own (sequences start past them)
let nextWorld = 100;
async function fresh(owner = 1) {
  const id = nextWorld; nextWorld += 10;
  await pool.query(`
    INSERT INTO worlds (id, name, created_by, share_token) VALUES (${id}, 'World ${id}', ${owner}, 'share-link-${id}');
    INSERT INTO maps (id, title, world_id, created_by) VALUES (${id}, 'Root', ${id}, ${owner}), (${id + 1}, 'Second', ${id}, ${owner});
    UPDATE worlds SET root_map_id = ${id} WHERE id = ${id};
    INSERT INTO nodes (id, world_id, title, category, visibility) VALUES
      (${id}, ${id}, 'Baron Vex', 'person', 'shared'), (${id + 1}, ${id}, 'Thornwick', 'place', 'shared'),
      (${id + 2}, ${id}, 'The Well', 'place', 'shared'), (${id + 3}, ${id}, 'Old Road', 'place', 'shared');
    INSERT INTO images (id, filename, original_name, file_path, file_size, mime_type, world_id, uploaded_by)
      VALUES (${id}, 'a.png', 'a.png', '/sample/a.png', 10, 'image/png', ${id}, ${owner});`);
  return { id, map: id, map2: id + 1, a: id, b: id + 1, c: id + 2, d: id + 3, img: id, token: `share-link-${id}` };
}

// Fill one kind of a world up to `total`, straight in the database
const FILL = {
  nodes: (w, n) => `INSERT INTO nodes (world_id, title) SELECT ${w.id}, 'Filler' FROM generate_series(1, ${n})`,
  maps: (w, n) => `INSERT INTO maps (title, world_id) SELECT 'Filler', ${w.id} FROM generate_series(1, ${n})`,
  placements: (w, n) => `INSERT INTO placements (node_id, map_id) SELECT ${w.d}, ${w.map} FROM generate_series(1, ${n})`,
  links: (w, n) => `INSERT INTO links (world_id, from_node_id, to_node_id) SELECT ${w.id}, ${w.c}, ${w.d} FROM generate_series(1, ${n})`,
  facts: (w, n) => `INSERT INTO node_facts (node_id, body) SELECT ${w.d}, 'x' FROM generate_series(1, ${n})`,
  eras: (w, n) => `INSERT INTO eras (world_id) SELECT ${w.id} FROM generate_series(1, ${n})`,
  folders: (w, n) => `INSERT INTO image_folders (name, world_id, created_by) SELECT 'Filler ' || g, ${w.id}, 1 FROM generate_series(1, ${n}) g`,
  backdrops: (w, n) => `INSERT INTO map_backdrops (map_id, image_id) SELECT ${w.map}, ${w.img} FROM generate_series(1, ${n})`,
};
async function fillTo(w, kind, total) {
  const have = (await room.counts(pool, w.id, [kind]))[kind];
  if (total > have) await pool.query(FILL[kind](w, total - have));
}

// The add each kind's cap guards, as the DM's pages make it (i: the first or the second try)
const ADD = {
  nodes: (w, i) => ['POST', `/api/atlas/maps/${w.map}/nodes`, { title: `New ${i}` }],
  maps: (w, i) => ['POST', `/api/atlas/nodes/${[w.a, w.b][i]}/interior`, {}],
  placements: (w) => ['POST', `/api/atlas/maps/${w.map2}/placements`, { node_id: w.a, x: 10, y: 10 }],
  links: (w, i) => ['POST', '/api/atlas/links', { from_node_id: w.a, to_node_id: [w.b, w.c][i] }],
  facts: (w) => ['POST', `/api/atlas/nodes/${w.a}/facts`, { body: 'Later', start_time: null, end_time: null }],
  eras: (w, i) => ['POST', `/api/atlas/worlds/${w.id}/eras`, { name: `Age ${i}` }],
  folders: (w, i) => ['POST', '/api/image-folders', { world_id: w.id, name: `New ${i}` }],
  backdrops: (w) => ['POST', `/api/atlas/maps/${w.map}/backdrops`, { image_id: w.img, start_time: 5, end_time: null }],
};

test('every add counts against what a world holds: the last one says so, the next is refused', async (t) => {
  assert.deepStrictEqual(Object.keys(ADD).sort(), Object.keys(room.KINDS).sort(), 'every kind room.js caps has its add here');
  for (const kind of Object.keys(ADD)) {
    await t.test(kind, async () => {
      const { max, many } = room.KINDS[kind];
      const w = await fresh();
      await fillTo(w, kind, max - 1);
      const last = await call(1, ...ADD[kind](w, 0));
      assert.ok(last.status === 201 || last.status === 200, `${kind}: ${last.status} ${JSON.stringify(last.body)}`);
      assert.deepStrictEqual(last.body.room, { what: many, count: max, max }, 'the add that fills the world says how full it is');
      const over = await call(1, ...ADD[kind](w, 1));
      assert.deepStrictEqual([over.status, over.body.message], [400, room.fullText(kind)]);
      assert.match(over.body.message, new RegExp(`^This world holds ${max.toLocaleString('en-US')} ${many}, the most a world can`));
      assert.strictEqual((await room.counts(pool, w.id, [kind]))[kind], max, 'nothing past the most landed');
    });
  }
});

test('an add under 80% says nothing; the world payload says how full it is from 80%', async () => {
  const w = await fresh();
  const quiet = await call(1, ...ADD.nodes(w, 0));
  assert.strictEqual(quiet.status, 201);
  assert.strictEqual(quiet.body.room, undefined);
  assert.strictEqual((await call(1, 'GET', `/api/atlas/worlds/${w.id}`)).body.world.room, null);
  await fillTo(w, 'nodes', 4000);
  assert.deepStrictEqual((await call(1, 'GET', `/api/atlas/worlds/${w.id}`)).body.world.room, { what: 'entries', count: 4000, max: 5000 });
  // the fullest kind is the one named
  await fillTo(w, 'eras', 450);
  assert.deepStrictEqual((await call(1, 'GET', `/api/atlas/worlds/${w.id}`)).body.world.room, { what: 'eras', count: 450, max: 500 });
});

test("a stranger adding to someone's full world learns nothing of it: a 404 before any count", async () => {
  const w = await fresh();
  await fillTo(w, 'nodes', room.KINDS.nodes.max);
  const r = await call(2, ...ADD.nodes(w, 0));
  assert.strictEqual(r.status, 404);
  assert.doesNotMatch(JSON.stringify(r.body), /holds|full/);
  const f = await call(2, ...ADD.folders(w, 0));
  assert.strictEqual(f.status, 404);
});

test("a player's marker stops at a full world, with no counts in the sentence", async () => {
  const w = await fresh();
  await fillTo(w, 'nodes', room.KINDS.nodes.max);
  const before = await count('SELECT count(*)::int AS n FROM nodes WHERE world_id=$1', [w.id]);
  const r = await call(null, 'POST', `/api/share/${w.token}/maps/${w.map}/nodes`, { title: 'Camp', author: 'Pip' });
  assert.deepStrictEqual([r.status, r.body.message], [400, 'This world is full — ask your DM to make room']);
  assert.strictEqual(await count('SELECT count(*)::int AS n FROM nodes WHERE world_id=$1', [w.id]), before);
});

test("a player's @-mentions land as plain names, and never bring an entry up in Loose ends", async () => {
  const w = await fresh();
  const r = await call(null, 'POST', `/api/share/${w.token}/maps/${w.map}/nodes`, {
    title: `Ask @[Baron Vex](node:${w.a})`,
    body: `He hides @[the ledger](node:${w.b}@12) and @[a secret](node:999999999) — @[Bad](node:abc) stays text`,
    author: 'Pip',
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  const [m] = await rows('SELECT title, body, visibility FROM nodes WHERE id=$1', [r.body.nodeId]);
  assert.deepStrictEqual(m, { title: 'Ask Baron Vex', body: 'He hides the ledger and a secret — @[Bad](node:abc) stays text', visibility: 'player' });

  // a marker that still holds a mention (saved before 2026-11) is not the DM bringing it up; a DM's own entry is
  const old = '2020-06-15 12:00:00'; // mid-month at noon: the same month read in any time zone
  await pool.query(`UPDATE nodes SET created_at=$2, updated_at=$2 WHERE world_id=$1`, [w.id, old]);
  await pool.query(`INSERT INTO nodes (world_id, title, body, visibility, author) VALUES ($1, 'Old marker', $2, 'player', 'Pip')`,
    [w.id, `About @[Baron Vex](node:${w.a})`]);
  await pool.query(`INSERT INTO nodes (world_id, title, body, visibility) VALUES ($1, 'Session plan', $2, 'dm')`,
    [w.id, `Visit @[Thornwick](node:${w.b})`]);
  const ends = (await call(1, 'GET', `/api/atlas/worlds/${w.id}/loose-ends`)).body.entries;
  const lastUp = (id) => ends.find((e) => e.id === id).lastUp;
  assert.match(lastUp(w.a), /^2020-06/, "the players' mention leaves Baron Vex where he was");
  assert.doesNotMatch(lastUp(w.b), /^2020/, "the DM's mention brings Thornwick up");
});

test('an undo cannot grow a world past its most; the tombstone waits for room', async () => {
  const w = await fresh();
  await fillTo(w, 'nodes', room.KINDS.nodes.max);
  const del = await call(1, 'DELETE', `/api/atlas/nodes/${w.a}`);
  assert.strictEqual(del.status, 200);
  assert.strictEqual((await call(1, ...ADD.nodes(w, 0))).status, 201, 'the room the delete made is used again');
  const undo = await call(1, 'POST', `/api/atlas/undo/${del.body.undoId}`);
  assert.deepStrictEqual([undo.status, undo.body.message],
    [409, `${room.fullText('nodes')} first, then undo again`]);
  assert.strictEqual(await count('SELECT count(*)::int AS n FROM nodes WHERE id=$1', [w.a]), 0, 'nothing came back');
  assert.strictEqual(await count('SELECT count(*)::int AS n FROM tombstones WHERE id=$1', [del.body.undoId]), 1, 'the tombstone stays');
  assert.strictEqual((await call(1, 'DELETE', `/api/atlas/nodes/${w.b}`)).status, 200);
  assert.strictEqual((await call(1, 'POST', `/api/atlas/undo/${del.body.undoId}`)).status, 200, 'with room again, it undoes');
  assert.strictEqual(await count('SELECT count(*)::int AS n FROM nodes WHERE id=$1', [w.a]), 1);
});

test('a world keeps its newest 500 tombstones, and only its own go', async () => {
  const w = await fresh(), other = await fresh();
  const era = (await call(1, 'POST', `/api/atlas/worlds/${w.id}/eras`, { name: 'Age' })).body.id;
  await pool.query(`INSERT INTO tombstones (world_id, kind, payload) SELECT $1, 'era', '{}' FROM generate_series(1, 505)`, [w.id]);
  await pool.query(`INSERT INTO tombstones (world_id, kind, payload) SELECT $1, 'era', '{}' FROM generate_series(1, 3)`, [other.id]);
  const del = await call(1, 'DELETE', `/api/atlas/eras/${era}`);
  assert.strictEqual(del.status, 200);
  assert.strictEqual(await count('SELECT count(*)::int AS n FROM tombstones WHERE world_id=$1', [w.id]), 500);
  assert.strictEqual(await count('SELECT count(*)::int AS n FROM tombstones WHERE world_id=$1', [other.id]), 3);
  assert.strictEqual((await call(1, 'POST', `/api/atlas/undo/${del.body.undoId}`)).status, 200, 'the newest is still there to undo');
});

test("a Forge batch is counted as its adds are, before any painting (contract.roomForBatch)", async () => {
  const { roomForBatch } = require('../forge/contract');
  const w = await fresh();
  const batch = (nodes, backdrops = []) => ({
    nodes: Array.from({ length: nodes }, () => ({ placements: [{}], facts: [{}] })),
    maps: [], links: [], eras: [], backdrops, enrich: [{ place: [{}], facts: [] }],
  });
  await fillTo(w, 'nodes', room.KINDS.nodes.max - 1);
  assert.strictEqual(await roomForBatch(w.id, batch(1)), null);
  assert.strictEqual(await roomForBatch(w.id, batch(2)),
    'this world holds 5,000 entries, the most a world can — delete some to make room');
  await fillTo(w, 'backdrops', room.KINDS.backdrops.max);
  assert.strictEqual(await roomForBatch(w.id, batch(0, [{ start: null }])), null, "a new base backdrop replaces the map's art: it adds nothing");
  assert.match(await roomForBatch(w.id, batch(0, [{ start: 3 }])), /^this world holds 2,000 period backdrops/);
});

test("the Atlas's own sign-up is gone: POST /api/auth/register makes nobody", async () => {
  const users = await count('SELECT count(*)::int AS n FROM users');
  const r = await call(null, 'POST', '/api/auth/register', { username: 'mallory', email: 'm@example.invalid', password: 'hunter22' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.body?.recoveryCode, undefined);
  assert.strictEqual(await count('SELECT count(*)::int AS n FROM users'), users);
});
