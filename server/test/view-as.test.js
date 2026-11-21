// View as (fleet-kit 1.0.18), the Atlas's side: the site admin picks an account on /admin and sees
// the Atlas the way it does, read-only. The kit's own checks of it run in security.test.js
// (viewAs); this is the rest, on the real server.js over a Postgres in memory (PGlite): the ids
// /admin hands out, Ann's dashboard, world and Forge panel as she sees them, a world opened for the
// first time making nothing, no write going through (the Forge's and the voices' paid calls among
// them), the admin's pages refused, and the way back. Nothing leaves this machine.
//
//   node --test server/test/view-as.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

Object.assign(process.env, {
  PORT: '0', NODE_ENV: 'test', DATABASE_URL: '', JWT_SECRET: 'atlas-view-as-test', SESSION_SECRET: 'atlas-view-as-test',
  AUTH_SERVICE_URL: '', SSO_CLIENT_ID: '', SSO_CLIENT_SECRET: '', APP_BASE_URL: '', BUG_WIDGET_KEY: '', EMBED_ORIGINS: '',
  GUEST_CLEANUP_ENABLED: 'false', ADMIN_CENTRAL_USER_IDS: '9004,9005',
  // the Forge and voices on, so their paid routes are there to be refused; every outside call is stubbed
  FORGE_ENABLED: '1', GEMINI_API_KEY: 'stub', VOICE_ENABLED: '1', VOICE_PROVIDER: '', OPENAI_API_KEY: '', ELEVENLABS_API_KEY: 'stub',
  R2_ACCOUNT_ID: 'stub', R2_ACCESS_KEY_ID: 'stub', R2_SECRET_ACCESS_KEY: 'stub', R2_BUCKET: 'stub', R2_PUBLIC_URL: 'https://r2.stub.invalid', R2_LEGACY_PUBLIC_URLS: '',
});
const outside = [];
globalThis.fetch = async (url) => {
  outside.push(String(url));
  throw new Error('no network in this test');
};
const stored = [];
require('@aws-sdk/client-s3').S3Client.prototype.send = async (cmd) => {
  stored.push(cmd);
  return { Contents: [], IsTruncated: false };
};

const DIST = path.join(__dirname, '..', '..', 'client', 'dist', 'index.html');
const SHELL = '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Ann's world 10 has been opened before (its world map, an entry on it); world 11 never has, so
// it has no world map and no mind yet. Bob is someone else; account 4 is the site admin, and 5
// another admin on the list.
const SEED = `
  INSERT INTO users (id, username, email, password_hash, central_user_id, is_guest) VALUES
    (1, 'ann', 'ann@example.invalid', 'x', 9001, false),
    (2, 'bob', 'bob@example.invalid', 'x', 9002, false),
    (4, 'the-admin', 'admin@example.invalid', 'x', 9004, false),
    (5, 'another-admin', NULL, 'x', 9005, false);
  INSERT INTO worlds (id, name, created_by) VALUES (10, 'Vel Harrow', 1), (11, 'Unopened', 1);
  INSERT INTO maps (id, title, world_id, created_by) VALUES (10, 'Vel Harrow — World Map', 10, 1);
  UPDATE worlds SET root_map_id = 10 WHERE id = 10;
  INSERT INTO nodes (id, world_id, title, body, category, visibility, dm_note, created_by)
    VALUES (10, 10, 'The Keep', 'It stands.', 'place', 'dm', 'A secret door', 1);
  INSERT INTO placements (id, node_id, map_id) VALUES (10, 10, 10);
  INSERT INTO world_minds (world_id, lore) VALUES (10, 'The old kings sleep under the keep');
  INSERT INTO mind_messages (world_id, role, content) VALUES (10, 'user', 'Who built the keep?');
  ${['users', 'worlds', 'maps', 'nodes', 'placements'].map((t) => `SELECT setval(pg_get_serial_sequence('${t}', 'id'), 100);`).join('\n  ')}`;

const COUNTS = `SELECT ${['worlds', 'maps', 'nodes', 'placements', 'links', 'eras', 'images', 'image_folders', 'world_minds', 'mind_messages', 'forge_batches', 'spend_counters']
  .map((t) => `(SELECT count(*)::int FROM ${t}) AS ${t}`).join(', ')}`;

let db, pool, base, server, send, wp, madeDist;
let ann, bob, admin;
test.before(async () => {
  const kit = await import('fleet-kit/test/security'); // before the app, so it sees it listen
  send = kit.send;
  const { createPglite, pglitePool } = await import('fleet-kit/test/pglite');
  db = await createPglite({ name: 'atlas' });
  pool = require('../config/database');
  Object.assign(pool, pglitePool(db));
  pool.connectTx = pool.connect;
  madeDist = !fs.existsSync(DIST);
  if (madeDist) {
    fs.mkdirSync(path.dirname(DIST), { recursive: true });
    fs.writeFileSync(DIST, SHELL);
  }
  require('../server');
  ({ wp } = require('../config/auth'));
  ({ server, base } = await kit.appListening());
  console.log = () => {}; // the request log, and the kit's view-as lines
  await pool.query(SEED);
  const cookie = (id) => `${wp.session.name}=${wp.session.mint({ id, token_version: 0 })}`;
  [ann, bob, admin] = [cookie(1), cookie(2), cookie(4)];
});
test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  if (madeDist) {
    fs.rmSync(DIST, { force: true });
    try { fs.rmdirSync(path.dirname(DIST)); } catch { /* it held something else */ }
  }
});

// one request as `who` (a cookie line), from the Atlas's own page
const ask = async (who, method, url, body) => {
  const r = await send(base, url, { method, headers: { cookie: who, 'sec-fetch-site': 'same-origin' }, body });
  let data = null;
  try { data = JSON.parse(r.body); } catch { data = r.body; }
  return { ...r, data };
};
const counts = async () => (await pool.query(COUNTS)).rows[0];
// the view cookie a start set, as `name=value`
const viewCookieOf = (r) => [].concat(r.headers['set-cookie'] ?? [])
  .map((line) => line.split(';')[0]).find((pair) => /_view=./.test(pair)) ?? null;
const startView = async (id = 1) => {
  const r = await ask(admin, 'POST', '/api/auth/view-as', { id });
  return { r, viewing: `${admin}; ${viewCookieOf(r)}` };
};

test("/admin's account list names each account by the id View as takes, and marks the admin", async () => {
  const { items } = (await ask(admin, 'GET', '/api/admin/users')).data;
  const by = Object.fromEntries(items.map((u) => [u.username, u]));
  assert.deepStrictEqual([by.ann.id, by.ann.isAdmin], [1, false]);
  assert.deepStrictEqual([by['the-admin'].id, by['the-admin'].isAdmin], [4, true], 'the page shows no View as button by an admin');
});

test("the admin sees Ann's Atlas as she does, and nothing can be changed", async () => {
  const before = await counts();
  const { r: started, viewing } = await startView(1);
  assert.strictEqual(started.status, 200, started.body);
  assert.strictEqual(started.data.next, '/');
  assert.strictEqual(started.data.viewing.name, 'ann');
  assert.ok(viewCookieOf(started), 'a view cookie');

  // who the page thinks it is: Ann, no admin, and the banner's word that this is a view
  const me = (await ask(viewing, 'GET', '/api/auth/me')).data;
  assert.deepStrictEqual(me.user, (await ask(ann, 'GET', '/api/auth/me')).data.user);
  assert.strictEqual(me.user.isAdmin, false);
  assert.strictEqual(me.viewing.name, 'ann');
  assert.strictEqual((await ask(viewing, 'GET', '/api/auth/view-as')).data.viewing.name, 'ann');

  // her dashboard, her world, its map and an entry with its DM note: exactly as she gets them
  for (const url of ['/api/worlds', '/api/atlas/worlds/10', '/api/atlas/maps/10', '/api/atlas/nodes/10', '/api/atlas/worlds/10/maps', '/api/images?world_id=10', '/api/forge/worlds/10']) {
    const seen = await ask(viewing, 'GET', url);
    const hers = await ask(ann, 'GET', url);
    assert.strictEqual(seen.status, 200, `${url}: ${seen.body.slice(0, 160)}`);
    assert.deepStrictEqual(seen.data, hers.data, url);
  }
  assert.match((await ask(viewing, 'GET', '/api/atlas/nodes/10')).body, /A secret door/);
  // and only hers: Bob's things are as closed to the view as to Ann
  assert.strictEqual((await ask(viewing, 'GET', '/api/admin/users')).status, 403);
  await pool.query("INSERT INTO worlds (id, name, created_by) VALUES (20, 'Bob''s', 2)");
  assert.strictEqual((await ask(viewing, 'GET', '/api/atlas/worlds/20')).status, 404);
  await pool.query('DELETE FROM worlds WHERE id = 20');

  // a world she has never opened makes its world map and its mind on her first open; a view makes neither
  const fresh = await ask(viewing, 'GET', '/api/atlas/worlds/11');
  assert.strictEqual(fresh.status, 200, fresh.body);
  assert.strictEqual(fresh.data.world.rootMapId, null);
  const mind = await ask(viewing, 'GET', '/api/forge/worlds/11');
  assert.strictEqual(mind.status, 200, mind.body);
  assert.deepStrictEqual([mind.data.lore, mind.data.genSize, mind.data.messages], ['', 'medium', []]);
  assert.deepStrictEqual(await counts(), before, 'a view wrote something');

  // read-only: an edit, a new world, a copy, a delete, an upload, and every paid call
  for (const [method, url, body] of [
    ['PATCH', '/api/atlas/worlds/10', { name: 'Not Vel Harrow' }],
    ['PATCH', '/api/atlas/nodes/10', { title: 'Not the Keep' }],
    ['POST', '/api/worlds', { name: 'A new one' }],
    ['POST', '/api/atlas/worlds/clone', { source_id: 10, name: 'A copy' }],
    ['POST', '/api/atlas/worlds/10/share', {}],
    ['DELETE', '/api/worlds/10', {}],
    ['POST', '/api/images/upload', { world_id: 10, originalName: 'a.png', imageData: PNG }],
    ['POST', '/api/forge/worlds/10/chat', { message: 'Make me a dragon' }],
    ['POST', '/api/forge/nodes/10/art', {}],
    ['POST', '/api/forge/maps/10/backdrop', {}],
    ['POST', '/api/voice/nodes/10/line', { text: 'Halt!' }],
    ['POST', '/api/voice/maps/10/ambience', { prompt: 'Wind' }],
  ]) {
    const r = await ask(viewing, method, url, body);
    assert.strictEqual(r.status, 403, `${method} ${url}: ${r.body.slice(0, 160)}`);
    assert.strictEqual(r.data.code, 'viewing_as', `${method} ${url}`);
    assert.match(r.data.error, /viewing as ann/, `${method} ${url}`);
  }
  assert.deepStrictEqual(await counts(), before, 'a refused write changed something');
  assert.strictEqual((await pool.query('SELECT name FROM worlds WHERE id = 10')).rows[0].name, 'Vel Harrow');

  // the admin's pages are the admin's, not hers: a 403 with the way back, which is a link
  const page = await ask(viewing, 'GET', '/admin');
  assert.strictEqual(page.status, 403);
  assert.match(page.body, /viewing the Atlas as ann/);
  const href = /<a href="([^"]+)">Exit<\/a>/.exec(page.body)?.[1];
  assert.strictEqual(href, '/api/auth/view-as/exit');
  const back = await ask(viewing, 'GET', href);
  assert.strictEqual(back.status, 303);
  assert.strictEqual(back.location, '/admin');
  assert.ok([].concat(back.headers['set-cookie'] ?? []).some((l) => /_view=;|_view=.*max-age=0/i.test(l)), 'Exit clears the view cookie');
  assert.strictEqual((await ask(admin, 'GET', '/api/auth/view-as')).data.viewing, null);

  // the banner's Exit (JSON): back to the admin's own Atlas and /admin
  const again = await startView(1);
  assert.strictEqual(again.r.status, 200);
  const out = await ask(again.viewing, 'POST', '/api/auth/view-as/exit', {});
  assert.deepStrictEqual(out.data, { ok: true, next: '/admin' });
  assert.strictEqual((await ask(admin, 'GET', '/api/auth/me')).data.user.isAdmin, true);
  assert.strictEqual((await ask(admin, 'GET', '/api/admin/users')).status, 200);

  // Ann's own first open still makes the world map, as before
  const hers = await ask(ann, 'GET', '/api/atlas/worlds/11');
  assert.strictEqual(hers.status, 200);
  assert.ok(Number.isInteger(hers.data.world.rootMapId));
});

test("nobody else views as anyone, and an admin can't be viewed as", async () => {
  const quiet = console.error;
  console.error = () => {}; // the kit's refusal lines
  try {
    for (const who of [ann, bob, '']) {
      const r = await ask(who, 'POST', '/api/auth/view-as', { id: 2 });
      assert.ok(r.status === 401 || r.status === 403, `answered ${r.status}`);
      assert.strictEqual(viewCookieOf(r), null);
    }
    const self = await ask(admin, 'POST', '/api/auth/view-as', { id: 4 });
    assert.strictEqual(self.status, 400);
    assert.match(self.data.error, /your own account/);
    assert.strictEqual(viewCookieOf(self), null);
    const other = await ask(admin, 'POST', '/api/auth/view-as', { id: 5 });
    assert.strictEqual(other.status, 403);
    assert.match(other.data.error, /admin can't be viewed as/);
    assert.strictEqual(viewCookieOf(other), null);
  } finally {
    console.error = quiet;
  }
  for (const id of [0, '01', '1e3', 1.5, 'ann', 123456789012]) {
    const r = await ask(admin, 'POST', '/api/auth/view-as', { id });
    assert.ok(r.status === 400 || r.status === 404, `${JSON.stringify(id)} answered ${r.status}`);
    assert.strictEqual(viewCookieOf(r), null, JSON.stringify(id));
  }
});

test("every DM page loads the banner and a player's page doesn't; the strict CSP takes it", async () => {
  const tag = /<script src="\/api\/auth\/view-as\.js" defer><\/script>/;
  for (const p of ['/', '/dashboard', '/w/10/m/10', '/login']) {
    const r = await ask('', 'GET', p);
    assert.strictEqual(r.status, 200, p);
    assert.match(r.body, tag, p);
    assert.match(r.headers['content-security-policy'], /script-src[^;]*'self'/, p);
  }
  assert.doesNotMatch((await ask('', 'GET', '/p/some-share-token')).body, tag);
  const js = await ask('', 'GET', '/api/auth/view-as.js');
  assert.strictEqual(js.status, 200);
  assert.match(js.headers['content-type'], /javascript/);
});

test('nothing left this machine', () => {
  assert.deepStrictEqual(outside, []);
  assert.deepStrictEqual(stored, []);
});
