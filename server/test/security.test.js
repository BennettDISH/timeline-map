// The fleet's security checks (fleet-kit/test/security) on the Atlas's own routes: the real server.js
// on a real Postgres in memory (PGlite, the kit's; only this file and the media-host one load it). A
// new route has to be public, an admin's, or reach a world through an id named below, or this fails.
// The Forge and voices are switched on, because with them off all their routes are 404s that prove
// nothing; every outside call is stubbed, so nothing leaves this machine.
//
// Next to the kit's walk are the Atlas's own checks of what a route table can't show: ids that
// arrive in a body or a query, what a share link hands out, and a guest's paid uses.
//
//   node --test server/test/security.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Set before server.js runs dotenv, which leaves a variable that is already set alone, so nothing
// in a local .env (a real database, Waypoint, R2 or a provider's key) reaches this file.
Object.assign(process.env, {
  PORT: '0', NODE_ENV: 'test', DATABASE_URL: '', JWT_SECRET: 'atlas-security-test', SESSION_SECRET: 'atlas-security-test',
  AUTH_SERVICE_URL: '', SSO_CLIENT_ID: '', SSO_CLIENT_SECRET: '', APP_BASE_URL: '', BUG_WIDGET_KEY: '', EMBED_ORIGINS: '',
  GUEST_CLEANUP_ENABLED: 'false',
  FORGE_ENABLED: '1', GEMINI_API_KEY: 'stub', VOICE_ENABLED: '1', VOICE_PROVIDER: '', OPENAI_API_KEY: '', ELEVENLABS_API_KEY: 'stub',
  R2_ACCOUNT_ID: 'stub', R2_ACCESS_KEY_ID: 'stub', R2_SECRET_ACCESS_KEY: 'stub', R2_BUCKET: 'stub', R2_PUBLIC_URL: 'https://r2.stub.invalid', R2_LEGACY_PUBLIC_URLS: '',
  // the admin list holds the guest's id too: a guest is never an admin, whatever id it carries
  ADMIN_CENTRAL_USER_IDS: '9004,9003',
  // no paid use is open to a guest here, so a paid route that forgets the spend guard shows
  FORGE_DAILY_CAP_GUEST: '0', VOICE_DAILY_CAP_GUEST: '0', UPLOAD_DAILY_CAP_GUEST: '0',
});

// Nothing leaves this machine: the kit's requests use http directly, so every fetch is an outside call
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

// The page goes out only when a build exists, and a page is what a missed gate would hand out
const DIST = path.join(__dirname, '..', '..', 'client', 'dist', 'index.html');
const SHELL = '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>';

// Every table holds a row of Ann's under one id, so :id, :mapId and :worldId are something real of
// hers on every route, whatever the route calls an id. Bob and the guest each have their own world.
const A = 7777;
const B = 8888;
const G = 9999;
const TOKEN = 'ann-share-token-0123456789';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const worldOf = (id, owner) => `
  INSERT INTO worlds (id, name, created_by) VALUES (${id}, 'World ${id}', ${owner});
  INSERT INTO maps (id, title, world_id, created_by, dm_note) VALUES (${id}, 'Map ${id}', ${id}, ${owner}, 'MAP-ONLY-NOTE');
  UPDATE worlds SET root_map_id = ${id} WHERE id = ${id};
  INSERT INTO images (id, filename, original_name, file_path, file_size, mime_type, world_id, uploaded_by, storage_key)
    VALUES (${id}, 'img-${id}.png', 'a.png', 'https://r2.stub.invalid/worlds/${id}/img-${id}.png', 10, 'image/png', ${id}, ${owner}, 'worlds/${id}/img-${id}.png');
  INSERT INTO nodes (id, world_id, title, body, category, visibility, voice_id, dm_note, stance, created_by)
    VALUES (${id}, ${id}, 'Open Keep', 'The keep stands.', 'place', 'shared', 'a-voice', 'DM-ONLY-NOTE', 'foe', ${owner});
  INSERT INTO placements (id, node_id, map_id) VALUES (${id}, ${id}, ${id});`;

const SEED = `
  INSERT INTO users (id, username, email, password_hash, central_user_id, is_guest) VALUES
    (1, 'ann', 'ann@example.invalid', 'x', 9001, false),
    (2, 'bob', 'bob@example.invalid', 'x', 9002, false),
    (3, 'guest-gale', NULL, 'x', 9003, true),
    (4, 'the-admin', 'admin@example.invalid', 'x', 9004, false);
  ${worldOf(A, 1)}
  ${worldOf(B, 2)}
  ${worldOf(G, 3)}
  UPDATE worlds SET share_token = '${TOKEN}' WHERE id = ${A};
  INSERT INTO image_folders (id, name, world_id, created_by) VALUES (${A}, 'A folder', ${A}, 1);
  INSERT INTO nodes (id, world_id, title, body, category, visibility, created_by) VALUES (${A + 1}, ${A}, 'Hidden Vault', 'HIDDEN-BODY', 'place', 'dm', 1);
  INSERT INTO placements (id, node_id, map_id) VALUES (${A + 1}, ${A + 1}, ${A});
  INSERT INTO links (id, world_id, from_node_id, to_node_id, label) VALUES (${A}, ${A}, ${A}, ${A + 1}, 'a thread');
  INSERT INTO eras (id, world_id, name, start_time, end_time) VALUES (${A}, ${A}, 'An age', 0, 10);
  INSERT INTO node_facts (id, node_id, body, start_time, end_time) VALUES (${A}, ${A}, 'A period text', 0, 10);
  INSERT INTO map_backdrops (id, map_id, image_id, start_time) VALUES (${A}, ${A}, ${A}, 0);
  INSERT INTO tombstones (id, world_id, user_id, kind, payload)
    VALUES (${A}, ${A}, 1, 'era', '{"era":{"id":${A + 2},"world_id":${A},"name":"Gone","start_time":0,"end_time":1,"player_visible":false}}');
  INSERT INTO forge_batches (id, world_id, summary, status, asks_state) VALUES (${A}, ${A}, 'A card', 'pending', 'pending');`;

// How many of everything there is: what a refused request must leave as it found it
const COUNTS = `SELECT ${['worlds', 'maps', 'nodes', 'placements', 'links', 'eras', 'node_facts', 'map_backdrops', 'images', 'image_folders', 'tombstones', 'forge_batches']
  .map((t) => `(SELECT count(*)::int FROM ${t}) AS ${t}`).join(', ')}`;

test('the security checks', async (t) => {
  // The kit before the app, so it sees the mounts go on
  const { securityChecks, appListening, send, pathTricks } = await import('fleet-kit/test/security');
  const { createPglite, pglitePool } = await import('fleet-kit/test/pglite');

  const db = await createPglite({ name: 'atlas' });
  const pool = require('../config/database');
  Object.assign(pool, pglitePool(db));
  pool.connectTx = pool.connect; // what it adds is a dropped connection's listener, and this one has no wire

  const madeDist = !fs.existsSync(DIST);
  if (madeDist) {
    fs.mkdirSync(path.dirname(DIST), { recursive: true });
    fs.writeFileSync(DIST, SHELL);
  }
  require('../server'); // builds and listens for itself, once the schema is on
  const { wp } = require('../config/auth');
  const { app, server, base } = await appListening();
  console.log = () => {}; // a walk is thousands of requests

  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await db.close();
    if (madeDist) {
      fs.rmSync(DIST, { force: true });
      try { fs.rmdirSync(path.dirname(DIST)); } catch { /* it held something else: not this file's to remove */ }
    }
  });

  await pool.query(SEED);
  const cookie = (id) => ({ cookie: `${wp.session.name}=${wp.session.mint({ id, token_version: 0 })}` });
  const [ann, bob, guest, admin] = [cookie(1), cookie(2), cookie(3), cookie(4)];
  const counts = async () => (await pool.query(COUNTS)).rows[0];
  const before = await counts();

  const checks = securityChecks({
    app,
    base,
    as: { user: () => ann, other: () => bob, guest: () => guest, admin: () => admin },
    public: [
      'GET /health', '* /api/auth/*', 'GET /auth/callback',
      // The Player View: the token in the address is the way in, minted and revoked by the world's
      // owner, and it asks for no session. Own checks below hold what these hand out.
      'GET /api/share/:token/world', 'GET /api/share/:token/maps/:mapId', 'GET /api/share/:token/nodes/:id', 'GET /api/share/:token/nodes/:id/locate',
      'POST /api/share/:token/maps/:mapId/nodes',
    ],
    admin: ['/api/admin/*'],
    adminPages: ['/admin', `/admin/worlds/${A}`],
    // gone since Waypoint made admin an identity: the first-run setup that named an admin must not return
    closed: ['POST /api/setup', 'GET /api/setup'],
    // A player's marker comes from a share link, in Spellforge's frame too, and no cookie counts there
    crossSite: { except: ['POST /api/share/:token/maps/:mapId/nodes'] },
    noStore: {},
    owned: { params: { worldId: () => A, mapId: () => A, id: () => A, token: () => TOKEN } },
    // A guest may use everything a DM may, with their paid uses capped (checked below): only the admin's are closed
    guests: { refused: ['/api/admin/*'] },
    headers: { path: '/' },
  });
  for (const check of checks) await t.test(check.name, check.run);

  const ask = (who, method, url, body) => send(base, url, { method, headers: who, body });
  const refusal = (r) => r.status === 404 || (r.status === 400 && /not in this world|your own/.test(r.body));

  await t.test("another account can't reach someone's things through an id in a body or a query", async () => {
    const stock = require('../lib/stock').list()[0].name;
    const upload = { world_id: A, originalName: 'a.png', imageData: PNG };
    for (const [method, url, body] of [
      // naming Ann's world
      ['GET', `/api/images?world_id=${A}`],
      ['GET', `/api/image-folders?world_id=${A}`],
      ['POST', '/api/image-folders', { world_id: A, name: 'Mine now' }],
      ['POST', '/api/images/upload', upload],
      ['POST', '/api/images-base64/upload', upload],
      ['POST', '/api/images/stock', { world_id: A, name: stock }],
      ['POST', '/api/atlas/worlds/clone', { source_id: A, name: 'Mine now' }],
      // naming Ann's things
      ['PUT', '/api/images/bulk', { ids: [A], folder_id: null }],
      ['DELETE', '/api/images/bulk', { ids: [A] }],
      ['POST', '/api/atlas/links', { from_node_id: B, to_node_id: A }],
      // pointing Bob's own things at Ann's
      ['PUT', `/api/images/${B}`, { folder_id: A }],
      ['PATCH', `/api/atlas/maps/${B}`, { image_id: A }],
      ['PATCH', `/api/atlas/maps/${B}`, { tree_parent_id: A }],
      ['PATCH', `/api/atlas/nodes/${B}`, { image_id: A }],
      ['POST', `/api/atlas/maps/${B}/backdrops`, { image_id: A }],
      ['POST', `/api/atlas/maps/${B}/placements`, { node_id: A, x: 1, y: 1 }],
      ['POST', `/api/atlas/worlds/${B}/spotlight`, { node_id: A }],
      ['POST', `/api/atlas/worlds/${B}/tree-order`, { ids: [A] }],
      ['PUT', `/api/atlas/nodes/${B}/leads-to`, { map_id: A }],
      ['POST', `/api/atlas/nodes/${B}/interior`, { beside_map_id: A }],
      ['PATCH', `/api/forge/worlds/${B}/mind`, { style_image_id: A }],
    ]) {
      const r = await ask(bob, method, url, body);
      assert.ok(refusal(r), `${method} ${url} ${JSON.stringify(body)} answered ${r.status}: ${r.body.slice(0, 120)}`);
    }
    // ...and the same ids are good for Ann, so what refused Bob was the owner
    assert.strictEqual((await ask(ann, 'GET', `/api/images?world_id=${A}`)).status, 200);
    assert.strictEqual((await ask(ann, 'GET', `/api/image-folders?world_id=${A}`)).status, 200);
    assert.deepStrictEqual(await counts(), before, 'a refused request changed something');
  });

  await t.test("a map's sound and a world's cues are the owner's to set, and a share link only reads them", async () => {
    const link = `/api/share/${TOKEN}`;
    const heard = async () => {
      const map = JSON.parse((await ask({}, 'GET', `${link}/maps/${A}`)).body).map;
      const world = JSON.parse((await ask({}, 'GET', `${link}/world`)).body).world;
      return { url: map.ambienceUrl, bed: map.ambienceBed, cues: world.soundCues };
    };
    const silent = { url: null, bed: null, cues: false };
    assert.deepStrictEqual(await heard(), silent, 'a map and a world start silent');
    const pick = ['PATCH', `/api/atlas/maps/${A}`, { ambience_bed: 'amb.sea' }];
    const cues = ['PATCH', `/api/atlas/worlds/${A}`, { sound_cues: true }];

    // signed out is a 401, another DM and a guest a 404, and a player has no route to these at all
    for (const [method, url, body] of [pick, cues]) {
      assert.strictEqual((await ask({}, method, url, body)).status, 401, `signed out: ${url}`);
      for (const who of [bob, guest]) assert.strictEqual((await ask(who, method, url, body)).status, 404, `not theirs: ${url}`);
    }
    for (const [method, p] of [['PATCH', `/maps/${A}`], ['POST', `/maps/${A}`], ['PUT', `/maps/${A}`], ['PATCH', '/world'], ['POST', '/world'], ['PUT', '/world']]) {
      const r = await ask({}, method, `${link}${p}`, { ambience_bed: 'amb.sea', sound_cues: true });
      assert.ok(r.status === 404 || r.status === 405, `${method} ${link}${p} answered ${r.status}`);
    }
    // the marker route is a player's one write, and it takes neither
    const marked = await ask({}, 'POST', `${link}/maps/${A}/nodes`, { title: 'Listen', ambience_bed: 'amb.sea', sound_cues: true });
    assert.strictEqual(marked.status, 201);
    await pool.query('DELETE FROM nodes WHERE id = $1', [JSON.parse(marked.body).nodeId]);
    assert.deepStrictEqual(await heard(), silent, 'a refused request changed what players hear');

    // only a name in the library, and only a yes or a no
    for (const bad of ['amb.nope', 'ui.reveal', 'AMB.SEA', ' amb.sea', 'stock:amb.sea', '../amb.sea', 5, true, {}, ['amb.sea'], '']) {
      assert.strictEqual((await ask(ann, 'PATCH', `/api/atlas/maps/${A}`, { ambience_bed: bad })).status, 400, JSON.stringify(bad));
    }
    assert.strictEqual((await ask(ann, 'PATCH', `/api/atlas/worlds/${A}`, { sound_cues: 'maybe' })).status, 400);
    assert.deepStrictEqual(await heard(), silent, 'a refused value changed what players hear');

    // the owner sets both; players read them, and no other map or world moves
    assert.strictEqual((await ask(ann, ...pick)).status, 200);
    assert.strictEqual((await ask(ann, ...cues)).status, 200);
    assert.deepStrictEqual(await heard(), { url: null, bed: 'amb.sea', cues: true });
    const dm = JSON.parse((await ask(ann, 'GET', `/api/atlas/maps/${A}`)).body).map;
    assert.deepStrictEqual([dm.ambienceBed, dm.ambiencePrompt, dm.ambienceUrl], ['amb.sea', null, null], 'the mark is not a prompt for the DM to read');
    assert.strictEqual(JSON.parse((await ask(ann, 'GET', `/api/atlas/worlds/${A}`)).body).world.soundCues, true);
    assert.strictEqual(JSON.parse((await ask(bob, 'GET', `/api/atlas/worlds/${B}`)).body).world.soundCues, false);

    // a clear goes back to silence
    assert.strictEqual((await ask(ann, 'PATCH', `/api/atlas/maps/${A}`, { ambience_bed: null })).status, 200);
    assert.strictEqual((await heard()).bed, null);

    // a map with its own ambience keeps playing it: a pick is refused, a clear leaves it, its prompt stays home
    const own = 'https://r2.stub.invalid/worlds/7777/ambience-7777.mp3';
    await pool.query('UPDATE maps SET ambience_url = $1, ambience_prompt = $2 WHERE id = $3', [own, 'OWN-PROMPT-TEXT', A]);
    assert.strictEqual((await ask(ann, ...pick)).status, 409);
    assert.strictEqual((await ask(ann, 'PATCH', `/api/atlas/maps/${A}`, { ambience_bed: null })).status, 200);
    const kept = await ask({}, 'GET', `${link}/maps/${A}`);
    assert.doesNotMatch(kept.body, /OWN-PROMPT-TEXT|stock:/);
    assert.strictEqual(JSON.parse(kept.body).map.ambienceUrl, own);
    assert.strictEqual(JSON.parse(kept.body).map.ambienceBed, null);
    const { rows: [row] } = await pool.query('SELECT ambience_prompt, ambience_url FROM maps WHERE id = $1', [A]);
    assert.deepStrictEqual(row, { ambience_prompt: 'OWN-PROMPT-TEXT', ambience_url: own });

    await pool.query('UPDATE maps SET ambience_url = NULL, ambience_prompt = NULL WHERE id = $1', [A]);
    assert.strictEqual((await ask(ann, 'PATCH', `/api/atlas/worlds/${A}`, { sound_cues: false })).status, 200);
    assert.deepStrictEqual(await heard(), silent);
  });

  await t.test('a share link hands out what players may see and nothing else', async () => {
    const link = `/api/share/${TOKEN}`;
    const secrets = /DM-ONLY-NOTE|MAP-ONLY-NOTE|HIDDEN-BODY|Hidden Vault|stance|share_token|dm_note/;
    for (const p of ['/world', `/maps/${A}`, `/nodes/${A}`, `/nodes/${A}/locate`]) {
      const r = await ask({}, 'GET', `${link}${p}`);
      assert.strictEqual(r.status, 200, p);
      assert.doesNotMatch(r.body, secrets, p);
    }
    assert.match((await ask({}, 'GET', `${link}/maps/${A}`)).body, /Open Keep/);
    // the DM-only entry, and another account's world through this world's link
    for (const p of [`/nodes/${A + 1}`, `/nodes/${A + 1}/locate`, `/maps/${B}`, `/nodes/${B}`]) assert.strictEqual((await ask({}, 'GET', `${link}${p}`)).status, 404, p);
    for (const bad of ['not-a-real-token-at-all', 'short']) assert.strictEqual((await ask({}, 'GET', `/api/share/${bad}/world`)).status, 404, bad);

    // a marker is the player's, whatever the body asks for, and lands in this link's world
    const marked = await ask({}, 'POST', `${link}/maps/${A}/nodes`, { title: 'Here', visibility: 'dm', category: 'party', world_id: B });
    assert.strictEqual(marked.status, 201);
    const { rows: [marker] } = await pool.query('SELECT world_id, visibility, category FROM nodes WHERE id = $1', [JSON.parse(marked.body).nodeId]);
    assert.deepStrictEqual(marker, { world_id: A, visibility: 'player', category: 'note' });
    assert.strictEqual((await ask({}, 'POST', `${link}/maps/${A + 1}/nodes`, { title: 'Nowhere' })).status, 404, 'a map that is not there takes no marker');

    // turning sharing off ends the link
    assert.strictEqual((await ask(bob, 'DELETE', `/api/atlas/worlds/${A}/share`)).status, 404);
    assert.strictEqual((await ask(ann, 'DELETE', `/api/atlas/worlds/${A}/share`)).status, 200);
    assert.strictEqual((await ask({}, 'GET', `${link}/world`)).status, 404);
  });

  // The walk above can't see this gate: every address gets the same page, so a page that gets past
  // it reads as "nothing here", and what the admin sees is decided again by /api/admin
  await t.test('the server decides the admin pages before they go out, in every spelling', async () => {
    for (const page of ['/admin', `/admin/worlds/${A}`]) {
      for (const p of [page, ...pathTricks(page)]) {
        const out = await ask({}, 'GET', p);
        assert.strictEqual(out.status, 302, `signed out at ${p}`);
        assert.match(out.location, /^\/api\/auth\/sso\/login\?next=/, p);
        for (const who of [ann, guest]) {
          const r = await ask(who, 'GET', p);
          assert.strictEqual(r.status, 403, p);
          assert.doesNotMatch(r.body, /id="root"/, p);
        }
      }
      assert.match((await ask(admin, 'GET', page)).body, /id="root"/, page);
    }
  });

  await t.test('only the Player View may be framed, and it carries no bug widget', async () => {
    const frame = (r) => /frame-ancestors ([^;]*)/.exec(r.headers['content-security-policy'])?.[1];
    const page = await ask({}, 'GET', '/login');
    assert.strictEqual(frame(page), "'self'");
    assert.strictEqual(page.headers['x-frame-options'], 'SAMEORIGIN');
    assert.match(page.body, /data-api-key/);
    const player = await ask({}, 'GET', '/p/some-share-token');
    assert.match(frame(player), /spellforge/);
    assert.strictEqual(player.headers['x-frame-options'], undefined);
    assert.doesNotMatch(player.body, /data-api-key/);
  });

  await t.test('a guest with no allowance spends nothing on any paid route', async () => {
    const upload = { world_id: G, originalName: 'a.png', imageData: PNG };
    for (const [url, body] of [
      [`/api/forge/worlds/${G}/chat`, { message: 'Hello' }],
      [`/api/forge/nodes/${G}/art`, {}],
      [`/api/forge/maps/${G}/backdrop`, {}],
      [`/api/voice/nodes/${G}/line`, { text: 'Hello' }],
      [`/api/voice/maps/${G}/ambience`, { prompt: 'Wind' }],
      ['/api/images/upload', upload],
      ['/api/images-base64/upload', upload],
    ]) {
      const r = await ask(guest, 'POST', url, body);
      assert.strictEqual(r.status, 429, `${url} answered ${r.status}: ${r.body.slice(0, 120)}`);
      assert.strictEqual(JSON.parse(r.body).allowance.scope, 'closed', url);
    }
  });

  await t.test('nothing left this machine', () => {
    assert.deepStrictEqual(outside, []);
    assert.deepStrictEqual(stored, []);
  });
});
