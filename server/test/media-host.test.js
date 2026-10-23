// Serving media from the bucket's custom domain, run locally (no network, no production):
//  - every object is put (and copied, when its type is known) with the immutable Cache-Control;
//  - keyFromUrl finds the object behind an address on the new domain AND, while the stored URLs
//    are being moved, behind one on the old r2.dev address (R2_LEGACY_PUBLIC_URLS);
//  - scripts/rewrite-media-host.js: the dry run writes nothing, apply rewrites the leading address
//    of images.file_path, nodes.voice_url and maps.ambience_url in one transaction (or none), and a
//    second run finds nothing. The SQL also runs for real on PGlite when it can be found (the
//    server does not depend on it; e2e/ does, or point NODE_PATH at a folder that has it).
//
//   node --test server/test/media-host.test.js
const test = require('node:test');
const assert = require('node:assert');

Object.assign(process.env, {
  R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'bucket',
  R2_PUBLIC_URL: 'https://atlas-media.example.test/',
  R2_LEGACY_PUBLIC_URLS: 'https://pub-0123abcd.r2.dev/, https://pub-old.r2.dev',
});
const sent = [];
require('@aws-sdk/client-s3').S3Client.prototype.send = async (cmd) => { sent.push(cmd); return {}; };
const storage = require('../storage');
const { rewriteHost, bareOrigin } = require('../scripts/rewrite-media-host');

const OLD = 'https://pub-0123abcd.r2.dev';
const NEW = 'https://atlas-media.example.test';
const CACHE = 'public, max-age=31536000, immutable';
const lastSent = () => sent[sent.length - 1];

test('a put carries the immutable Cache-Control and answers the public URL', async () => {
  sent.length = 0;
  const url = await storage.putObject('worlds/5/img-1-2.png', Buffer.from('x'), 'image/png');
  assert.strictEqual(url, `${NEW}/worlds/5/img-1-2.png`);
  assert.strictEqual(lastSent().constructor.name, 'PutObjectCommand');
  assert.strictEqual(lastSent().input.CacheControl, CACHE);
  assert.strictEqual(lastSent().input.ContentType, 'image/png');
  assert.strictEqual(storage.CACHE_CONTROL, CACHE);
});

test('a copy with a known type is stored with the Cache-Control too; without one it copies as is', async () => {
  sent.length = 0;
  await storage.copyObject('worlds/5/a.png', 'worlds/6/b.png', 'image/png');
  assert.strictEqual(lastSent().input.MetadataDirective, 'REPLACE');
  assert.strictEqual(lastSent().input.CacheControl, CACHE);
  assert.strictEqual(lastSent().input.ContentType, 'image/png');
  assert.strictEqual(lastSent().input.CopySource, '/bucket/worlds/5/a.png');

  sent.length = 0;
  const url = await storage.copyObject('worlds/5/a.png', 'worlds/6/c.png');
  assert.strictEqual(url, `${NEW}/worlds/6/c.png`);
  assert.strictEqual(lastSent().input.MetadataDirective, undefined);
  assert.strictEqual(lastSent().input.CacheControl, undefined);
});

test('keyFromUrl reads the new domain and the old addresses, and nothing else', () => {
  assert.strictEqual(storage.keyFromUrl(`${NEW}/worlds/5/voice-1.wav`), 'worlds/5/voice-1.wav');
  assert.strictEqual(storage.keyFromUrl(`${OLD}/worlds/5/voice-1.wav`), 'worlds/5/voice-1.wav');
  assert.strictEqual(storage.keyFromUrl('https://pub-old.r2.dev/worlds/9/x.png'), 'worlds/9/x.png');
  assert.strictEqual(storage.keyFromUrl('https://elsewhere.test/worlds/5/x.png'), null);
  assert.strictEqual(storage.keyFromUrl(`${NEW}.evil.test/worlds/5/x.png`), null, 'the host must end at the slash');
  assert.strictEqual(storage.keyFromUrl('/api/images-base64/serve/x.png'), null);
  assert.strictEqual(storage.keyFromUrl(null), null);
});

test('the addresses are checked before anything runs', () => {
  assert.strictEqual(bareOrigin('--to', 'https://atlas-media.example.test/'), 'https://atlas-media.example.test');
  for (const bad of ['', 'atlas-media.example.test', 'http://atlas-media.example.test', 'https://atlas-media.example.test/worlds', 'https://a.test/?x=1', 'https://user@a.test']) {
    assert.throws(() => bareOrigin('--to', bad), /--to/, bad);
  }
});

// ── a fake database: three columns, a transaction, and the rewrite's two statements ──────────
function fakePool(data, { failAfter = Infinity } = {}) {
  const log = [];
  const countOf = (col, from) => data[col].filter((v) => typeof v === 'string' && v.startsWith(from)).length;
  const column = (sql) => (/FROM images/.test(sql) || /UPDATE images/.test(sql) ? 'images.file_path' : /nodes/.test(sql) ? 'nodes.voice_url' : 'maps.ambience_url');
  let updates = 0;
  const run = async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    log.push(s.split(' ')[0]);
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [], rowCount: 0 };
    const col = column(s);
    if (/^SELECT count/.test(s)) {
      const hit = data[col].filter((v) => typeof v === 'string' && v.startsWith(params[0]));
      return { rows: [{ n: String(hit.length), longest: String(Math.max(0, ...hit.map((v) => params[1].length + v.length - params[0].length))) }] };
    }
    if (/^UPDATE/.test(s)) {
      if (++updates > failAfter) throw new Error('connection lost');
      let n = 0;
      data[col] = data[col].map((v) => (typeof v === 'string' && v.startsWith(params[0]) ? (n++, params[1] + v.slice(params[0].length)) : v));
      return { rows: [], rowCount: n };
    }
    throw new Error(`unexpected query: ${s}`);
  };
  return { log, query: run, connectTx: async () => ({ query: run, release() {} }), countOf };
}
const sample = () => ({
  'images.file_path': [`${OLD}/worlds/1/a.png`, `${OLD}/worlds/1/b.png`, `${NEW}/worlds/2/c.png`, '/api/images-base64/serve/d.png', 'https://other.test/e.png'],
  'nodes.voice_url': [`${OLD}/worlds/1/voice-1.wav`, null, `${NEW}/worlds/2/voice-2.wav`],
  'maps.ambience_url': [`${OLD}/worlds/1/ambience-1.mp3`],
});

test('the dry run counts per column and writes nothing', async () => {
  const data = sample(), pool = fakePool(data), lines = [];
  const out = await rewriteHost({ pool, from: OLD, to: NEW, log: (l) => lines.push(l) });
  assert.deepStrictEqual(out.counts, { 'images.file_path': 2, 'nodes.voice_url': 1, 'maps.ambience_url': 1 });
  assert.strictEqual(out.found, 4);
  assert.deepStrictEqual(data, sample());
  assert.ok(!pool.log.some((w) => w === 'UPDATE' || w === 'BEGIN'));
  assert.match(lines.join('\n'), /dry run/);
  assert.doesNotMatch(lines.join('\n'), /worlds\/1\/a\.png/, 'counts only, never the URLs');
});

test('apply rewrites the leading address in one transaction and leaves every other row alone', async () => {
  const data = sample(), pool = fakePool(data);
  const out = await rewriteHost({ pool, from: `${OLD}/`, to: `${NEW}/`, apply: true, log: () => {} });
  assert.strictEqual(out.updated, 4);
  assert.strictEqual(out.remaining, 0);
  assert.deepStrictEqual(data['images.file_path'], [`${NEW}/worlds/1/a.png`, `${NEW}/worlds/1/b.png`, `${NEW}/worlds/2/c.png`, '/api/images-base64/serve/d.png', 'https://other.test/e.png']);
  assert.deepStrictEqual(data['nodes.voice_url'], [`${NEW}/worlds/1/voice-1.wav`, null, `${NEW}/worlds/2/voice-2.wav`]);
  assert.deepStrictEqual(data['maps.ambience_url'], [`${NEW}/worlds/1/ambience-1.mp3`]);
  assert.deepStrictEqual(pool.log.filter((w) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(w)), ['BEGIN', 'COMMIT']);
  // a second run finds nothing
  const again = await rewriteHost({ pool, from: OLD, to: NEW, apply: true, log: () => {} });
  assert.deepStrictEqual([again.found, again.updated], [0, 0]);
});

test('a failure part way rolls the transaction back', async () => {
  const data = sample(), pool = fakePool(data, { failAfter: 1 });
  await assert.rejects(rewriteHost({ pool, from: OLD, to: NEW, apply: true, log: () => {} }), /connection lost/);
  assert.deepStrictEqual(pool.log.filter((w) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(w)), ['BEGIN', 'ROLLBACK']);
});

test('the same address, or a rewrite that would not fit the column, is refused before any write', async () => {
  const pool = fakePool(sample());
  await assert.rejects(rewriteHost({ pool, from: OLD, to: OLD }), /same address/);
  const data = sample();
  data['images.file_path'].push(`${OLD}/${'x'.repeat(480)}`);
  await assert.rejects(rewriteHost({ pool: fakePool(data), from: OLD, to: NEW, apply: true, log: () => {} }), /over the column/);
});

// ── the same SQL on a real engine, when PGlite can be found ─────────────────────────────────
function pgliteOrNull() {
  for (const p of ['@electric-sql/pglite', '../../e2e/node_modules/@electric-sql/pglite']) {
    try { return require(p).PGlite; } catch { /* try the next place */ }
  }
  return null;
}
const PGlite = pgliteOrNull();

test('on a real Postgres engine: the rewrite changes the leading address only and not updated_at', { skip: PGlite ? false : 'PGlite is not installed (npm install in e2e/, or NODE_PATH)' }, async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE images (id SERIAL PRIMARY KEY, file_path VARCHAR(500) NOT NULL, updated_at TIMESTAMP DEFAULT '2026-01-01');
    CREATE TABLE nodes (id SERIAL PRIMARY KEY, voice_url VARCHAR(500), updated_at TIMESTAMP DEFAULT '2026-01-01');
    CREATE TABLE maps (id SERIAL PRIMARY KEY, ambience_url VARCHAR(500), updated_at TIMESTAMP DEFAULT '2026-01-01');
    INSERT INTO images (file_path) VALUES ('${OLD}/worlds/1/a.png'), ('${OLD}/worlds/1/p%20q.png'), ('${NEW}/worlds/2/c.png'),
      ('/api/images-base64/serve/d.png'), ('https://other.test/${OLD}/e.png'), ('${OLD}evil/x.png');
    INSERT INTO nodes (voice_url) VALUES ('${OLD}/worlds/1/voice-1.wav'), (NULL), ('');
    INSERT INTO maps (ambience_url) VALUES ('${OLD}/worlds/1/ambience-1.mp3'), (NULL);`);
  const pool = {
    query: async (sql, params) => { const r = await db.query(sql, params); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; },
    connectTx: async () => ({ query: async (sql, params) => { const r = await db.query(sql, params); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; }, release() {} }),
  };
  const lines = [];
  const dry = await rewriteHost({ pool, from: OLD, to: NEW, log: (l) => lines.push(l) });
  assert.deepStrictEqual(dry.counts, { 'images.file_path': 2, 'nodes.voice_url': 1, 'maps.ambience_url': 1 });
  assert.strictEqual((await db.query(`SELECT count(*)::int AS n FROM images WHERE file_path LIKE '${NEW}%'`)).rows[0].n, 1, 'dry run wrote nothing');

  const out = await rewriteHost({ pool, from: OLD, to: NEW, apply: true, log: () => {} });
  assert.deepStrictEqual([out.updated, out.remaining], [4, 0]);
  assert.deepStrictEqual((await db.query('SELECT file_path FROM images ORDER BY id')).rows.map((r) => r.file_path), [
    `${NEW}/worlds/1/a.png`, `${NEW}/worlds/1/p%20q.png`, `${NEW}/worlds/2/c.png`,
    '/api/images-base64/serve/d.png', `https://other.test/${OLD}/e.png`, `${OLD}evil/x.png`,
  ]);
  assert.deepStrictEqual((await db.query('SELECT voice_url FROM nodes ORDER BY id')).rows.map((r) => r.voice_url), [`${NEW}/worlds/1/voice-1.wav`, null, '']);
  assert.deepStrictEqual((await db.query('SELECT ambience_url FROM maps ORDER BY id')).rows.map((r) => r.ambience_url), [`${NEW}/worlds/1/ambience-1.mp3`, null]);
  for (const t of ['images', 'nodes', 'maps']) {
    assert.strictEqual((await db.query(`SELECT count(*)::int AS n FROM ${t} WHERE updated_at <> '2026-01-01'`)).rows[0].n, 0, `${t}.updated_at is untouched`);
  }
  const again = await rewriteHost({ pool, from: OLD, to: NEW, apply: true, log: () => {} });
  assert.strictEqual(again.found, 0);
  await db.close();
});
