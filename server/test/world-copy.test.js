// A world copy and the worlds cap, run locally: the real routes on a real Postgres in memory (PGlite,
// fresh from schema.sql) with R2 stubbed, so nothing leaves this machine.
//  - a copy keeps the image folders (their filing, the nesting) and owns its art AND its audio: every
//    voice line and ambience is copied under the new world's prefix, or left out when it can't be;
//  - clearing a copy's line or ambience deletes the copy's object, never the source's;
//  - a copy that fails partway takes back what it put in storage and gives the day's uploads back;
//  - an account holds at most 50 worlds, made or copied, and GET /api/worlds says how many it has.
//
//   node --test server/test/world-copy.test.js
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: '', JWT_SECRET: 'world-copy-test', SESSION_SECRET: 'world-copy-test',
  AUTH_SERVICE_URL: '', SSO_CLIENT_ID: '', SSO_CLIENT_SECRET: '', ADMIN_CENTRAL_USER_IDS: '9999',
  R2_ACCOUNT_ID: 'stub', R2_ACCESS_KEY_ID: 'stub', R2_SECRET_ACCESS_KEY: 'stub', R2_BUCKET: 'stub', R2_PUBLIC_URL: 'https://r2.stub.invalid', R2_LEGACY_PUBLIC_URLS: '',
  // voices on (their routes 404 without), answered by nobody: nothing here speaks
  VOICE_ENABLED: '1', VOICE_PROVIDER: '', GEMINI_API_KEY: '', OPENAI_API_KEY: '', ELEVENLABS_API_KEY: 'stub',
  UPLOAD_DAILY_CAP: '250', UPLOAD_DAILY_CEILING: '2000',
});
const realFetch = globalThis.fetch; // the test's own calls to the routes, on 127.0.0.1
globalThis.fetch = async () => { throw new Error('no network in this test'); };
const sent = [];
let refuse = null; // (cmd) => true makes the bucket refuse that command
let openTx = 0; // database transactions open right now (pool.connectTx, below)
const sentInTx = []; // the storage calls made while one was open
require('@aws-sdk/client-s3').S3Client.prototype.send = async (cmd) => {
  if (openTx > 0) sentInTx.push(cmd.constructor.name);
  if (refuse && refuse(cmd)) throw new Error('the bucket refused');
  sent.push(cmd);
  return { Contents: [], IsTruncated: false };
};
const named = (kind) => sent.filter((c) => c.constructor.name === kind).map((c) => c.input);

const R2 = 'https://r2.stub.invalid';
const SRC = 10;
const SEED = `
  INSERT INTO users (id, username, email, password_hash, central_user_id, is_guest) VALUES
    (1, 'ann', NULL, 'x', 9001, false), (2, 'bob', NULL, 'x', 9002, false);
  INSERT INTO worlds (id, name, created_by) VALUES (${SRC}, 'Source', 1);
  INSERT INTO maps (id, title, world_id, created_by, ambience_prompt, ambience_url) VALUES
    (${SRC}, 'Root', ${SRC}, 1, 'Wind over the moor', '${R2}/worlds/${SRC}/ambience-${SRC}-1-abc.mp3'),
    (${SRC + 1}, 'Elsewhere', ${SRC}, 1, 'Rain', 'https://elsewhere.invalid/rain.mp3');
  UPDATE worlds SET root_map_id = ${SRC} WHERE id = ${SRC};
  INSERT INTO image_folders (id, name, world_id, created_by) VALUES (${SRC}, 'Maps', ${SRC}, 1);
  INSERT INTO image_folders (id, name, parent_id, world_id, created_by) VALUES (${SRC + 1}, 'Old maps', ${SRC}, ${SRC}, 1);
  INSERT INTO images (id, filename, original_name, file_path, file_size, mime_type, world_id, uploaded_by, storage_key, folder_id)
    VALUES (${SRC}, 'img-${SRC}.png', 'a.png', '${R2}/worlds/${SRC}/img-${SRC}.png', 2048, 'image/png', ${SRC}, 1, 'worlds/${SRC}/img-${SRC}.png', ${SRC + 1});
  INSERT INTO nodes (id, world_id, title, category, visibility, voice_id, voice_line, voice_url, created_by)
    VALUES (${SRC}, ${SRC}, 'Baron Vex', 'person', 'shared', 'a-voice', 'Thirty gold a head.', '${R2}/worlds/${SRC}/voice-${SRC}-1-abc.mp3', 1);
  INSERT INTO placements (id, node_id, map_id) VALUES (${SRC}, ${SRC}, ${SRC});
  ${['users', 'worlds', 'maps', 'image_folders', 'images', 'nodes', 'placements'].map((t) => `SELECT setval(pg_get_serial_sequence('${t}', 'id'), 100);`).join('\n  ')}`;

let db, pool, base, server, wp;
test.before(async () => {
  const { createPglite, pglitePool } = await import('fleet-kit/test/pglite');
  db = await createPglite({ name: 'atlas' });
  pool = require('../config/database');
  Object.assign(pool, pglitePool(db));
  // a transaction's client counts itself open from BEGIN to COMMIT or ROLLBACK
  pool.connectTx = async () => {
    const c = await pool.connect();
    const q = c.query;
    c.query = (sql, ...rest) => {
      if (typeof sql === 'string' && /^\s*BEGIN/i.test(sql)) openTx += 1;
      if (typeof sql === 'string' && /^\s*(COMMIT|ROLLBACK)/i.test(sql)) openTx = Math.max(0, openTx - 1);
      return q(sql, ...rest);
    };
    return c;
  };
  const { failed } = await require('../config/apply-schema').applySchema(pool);
  assert.deepStrictEqual(failed, [], 'schema.sql applies to a fresh database');
  await pool.query(SEED);
  ({ wp } = require('../config/auth'));
  const app = express();
  app.use(express.json());
  app.use('/api/worlds', require('../routes/worlds'));
  app.use('/api/atlas', require('../routes/atlas'));
  app.use('/api/voice', require('../routes/voice'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  server.close();
  await db.close();
});

const call = async (userId, method, path, body) => {
  const r = await realFetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: `${wp.session.name}=${wp.session.mint({ id: userId, token_version: 0 })}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
};
const rows = async (sql, args) => (await pool.query(sql, args)).rows;
const uploadsUsed = async (userId) => Number((await rows(`SELECT used FROM spend_counters WHERE kind='upload' AND user_id=$1`, [userId]))[0]?.used || 0);
const worlds = async () => Number((await rows('SELECT count(*)::int AS n FROM worlds'))[0].n);
const quietly = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

let copy; // the copy made first, read by the tests after it
test('a copy keeps the folders and their filing, and owns its art and its audio', async () => {
  sent.length = 0;
  const r = await call(1, 'POST', '/api/atlas/worlds/clone', { source_id: SRC, name: 'The copy' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  copy = r.body.worldId;

  const folders = await rows('SELECT id, name, parent_id FROM image_folders WHERE world_id=$1 ORDER BY id', [copy]);
  assert.deepStrictEqual(folders.map((f) => f.name), ['Maps', 'Old maps']);
  assert.strictEqual(folders[1].parent_id, folders[0].id, 'the nesting is the copy\'s own');
  const [img] = await rows('SELECT folder_id, storage_key FROM images WHERE world_id=$1', [copy]);
  assert.strictEqual(img.folder_id, folders[1].id, 'the image is filed where it was');
  assert.match(img.storage_key, new RegExp(`^worlds/${copy}/`));

  const [node] = await rows('SELECT id, voice_line, voice_url FROM nodes WHERE world_id=$1', [copy]);
  assert.match(node.voice_url, new RegExp(`^${R2}/worlds/${copy}/voice-clone-[0-9a-f]+\\.mp3$`));
  assert.strictEqual(node.voice_line, 'Thirty gold a head.');
  const maps = await rows('SELECT title, ambience_prompt, ambience_url FROM maps WHERE world_id=$1 ORDER BY id', [copy]);
  assert.match(maps[0].ambience_url, new RegExp(`^${R2}/worlds/${copy}/ambience-clone-[0-9a-f]+\\.mp3$`));
  assert.deepStrictEqual([maps[1].title, maps[1].ambience_url], ['Elsewhere', null], 'an address that is not the bucket\'s is left out');

  const copies = named('CopyObjectCommand');
  assert.deepStrictEqual(copies.map((c) => c.CopySource).sort(),
    [`stub/worlds/${SRC}/ambience-${SRC}-1-abc.mp3`, `stub/worlds/${SRC}/img-${SRC}.png`, `stub/worlds/${SRC}/voice-${SRC}-1-abc.mp3`]);
  assert.ok(copies.every((c) => c.Key.startsWith(`worlds/${copy}/`)), 'every object lands under the copy');
  assert.strictEqual(copies.find((c) => c.CopySource.includes('voice')).ContentType, 'audio/mpeg');
  assert.strictEqual(await uploadsUsed(1), 2, "the art's 2 KB are spent from the day's uploads");
});

test('a copy calls storage only while no database transaction is open', async () => {
  sentInTx.length = 0;
  sent.length = 0;
  const r = await call(1, 'POST', '/api/atlas/worlds/clone', { source_id: SRC, name: 'The quick copy' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.strictEqual(named('CopyObjectCommand').length, 3, 'the image, the ambience and the line were copied');
  assert.deepStrictEqual(sentInTx, [], 'every object went up before the rows were written');
  assert.strictEqual(openTx, 0);
  const [img] = await rows('SELECT storage_key FROM images WHERE world_id=$1', [r.body.worldId]);
  assert.match(img.storage_key, new RegExp(`^worlds/${r.body.worldId}/`), "the objects sit under the copy's own id");
  assert.strictEqual((await call(1, 'DELETE', `/api/worlds/${r.body.worldId}`)).status, 200);
});

test("clearing a copy's line or ambience deletes the copy's audio, never the source's", async () => {
  const [node] = await rows('SELECT id, voice_url FROM nodes WHERE world_id=$1', [copy]);
  const [map] = await rows('SELECT id, ambience_url FROM maps WHERE world_id=$1 AND ambience_url IS NOT NULL', [copy]);
  sent.length = 0;
  assert.strictEqual((await call(1, 'DELETE', `/api/voice/nodes/${node.id}/line`)).status, 200);
  assert.strictEqual((await call(1, 'DELETE', `/api/voice/maps/${map.id}/ambience`)).status, 200);
  assert.deepStrictEqual(named('DeleteObjectCommand').map((d) => d.Key),
    [node.voice_url.slice(R2.length + 1), map.ambience_url.slice(R2.length + 1)]);
  const [src] = await rows('SELECT voice_url FROM nodes WHERE id=$1', [SRC]);
  assert.strictEqual(src.voice_url, `${R2}/worlds/${SRC}/voice-${SRC}-1-abc.mp3`, 'the source keeps its line');
});

test("a copy that fails partway leaves nothing: its objects go again and the day's uploads come back", async () => {
  const before = { worlds: await worlds(), used: await uploadsUsed(1) };
  sent.length = 0;
  refuse = (cmd) => cmd.constructor.name === 'CopyObjectCommand' && cmd.input.CopySource.includes('voice');
  let r;
  try {
    r = await quietly(() => call(1, 'POST', '/api/atlas/worlds/clone', { source_id: SRC, name: 'The broken copy' }));
  } finally { refuse = null; }
  assert.strictEqual(r.status, 500);
  assert.strictEqual(await worlds(), before.worlds, 'no world is left behind');
  assert.strictEqual(await uploadsUsed(1), before.used, 'the allowance is given back');
  const put = named('CopyObjectCommand').map((c) => c.Key);
  assert.strictEqual(put.length, 2, 'the image and the ambience went up before the line failed');
  assert.deepStrictEqual(named('DeleteObjectCommand').map((d) => d.Key), put, 'and both are taken back');
});

test('an account holds at most 50 worlds, made or copied, and the list says how many it has', async () => {
  assert.deepStrictEqual((await call(1, 'GET', '/api/worlds')).body.limit, { count: 2, max: 50 });
  await pool.query(`INSERT INTO worlds (name, created_by) SELECT 'Filler ' || g, 1 FROM generate_series(1, 47) g`);
  const fiftieth = await call(1, 'POST', '/api/worlds', { name: 'The fiftieth' });
  assert.strictEqual(fiftieth.status, 201);
  assert.deepStrictEqual((await call(1, 'GET', '/api/worlds')).body.limit, { count: 50, max: 50 });

  const full = 'You have 50 of 50 worlds, the most an account holds — delete one to make room';
  const used = await uploadsUsed(1);
  const made = await call(1, 'POST', '/api/worlds', { name: 'One more' });
  assert.deepStrictEqual([made.status, made.body.message], [400, full]);
  const copied = await call(1, 'POST', '/api/atlas/worlds/clone', { source_id: SRC, name: 'One more copy' });
  assert.deepStrictEqual([copied.status, copied.body.message], [400, full]);
  assert.strictEqual(await uploadsUsed(1), used, 'a refused copy spends nothing');
  assert.strictEqual((await call(2, 'POST', '/api/worlds', { name: 'Bob\'s first' })).status, 201, 'the cap is per account');
});
