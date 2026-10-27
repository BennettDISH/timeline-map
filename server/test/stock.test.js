// The stock library, run locally (no database, no network): the shipped list is 24 tokens and 12
// portraits on the media bucket under content-hashed names; the picker's list needs a session; a
// pick copies the picture into the world (fetched, checked against its hash, charged like an
// upload, put under the world's prefix) and a second pick hands back the same image; anything
// wrong (an unknown name, another's world, bytes that are not the name's) stores nothing.
//
//   node --test server/test/stock.test.js
process.env.JWT_SECRET = 'stock-test-secret';
Object.assign(process.env, { R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'bucket', R2_PUBLIC_URL: 'https://pub.test' });
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const express = require('express');
const { wp } = require('../config/auth');
const pool = require('../config/database');
const { MEDIA_ORIGIN } = require('../lib/security');
const stock = require('../lib/stock');
const library = require('../stock/library.json');

const sent = [];
require('@aws-sdk/client-s3').S3Client.prototype.send = async (cmd) => { sent.push(cmd); return {}; };

const ME = { id: 11, username: 'dm', email: 'dm@example.invalid', role: 'viewer', token_version: 0, central_user_id: 40, is_guest: false, unseen: false };
const cookie = `${wp.session.name}=${wp.session.mint(ME)}`;

// a picture of our own, named by its hash the way tools/stock/upload.mjs names the real ones
const WEBP = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBPVP8L', 'latin1'), crypto.randomBytes(4096)]);
const HASH = crypto.createHash('sha256').update(WEBP).digest('hex').slice(0, 8);
const ITEM = { name: 'test-wolf', title: 'Test wolf', kind: 'token', group: 'creatures', src: `${MEDIA_ORIGIN}/atlas/stock/tokens/test-wolf-${HASH}.webp` };
stock.byName.set(ITEM.name, ITEM);
const LIAR = { ...ITEM, name: 'test-liar', src: `${MEDIA_ORIGIN}/atlas/stock/tokens/test-liar-00000000.webp` }; // its bytes are not its name's
stock.byName.set(LIAR.name, LIAR);

let fetched = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (!String(url).startsWith(MEDIA_ORIGIN)) return realFetch(url, opts);
  fetched.push(String(url));
  return new Response(WEBP, { status: 200, headers: { 'content-type': 'image/webp' } });
};

let rows = []; // the world's images
let charged = 0;
let failInsert = false;
pool.query = async (sql, params = []) => {
  const s = sql.trim();
  if (/FROM users WHERE id = \$1/.test(s)) return { rows: params[0] === ME.id ? [ME] : [] };
  if (/INSERT INTO spend_counters/.test(s)) { if (params[2] === ME.id) charged += params[3]; return { rows: [{ used: charged }], rowCount: 1 }; } // the account's row (the ceiling's is user 0)
  if (/FROM spend_counters/.test(s)) return { rows: [] };
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s) || /DELETE FROM spend_counters/.test(s)) return { rows: [], rowCount: 0 };
  if (/FROM worlds WHERE id=\$1 AND created_by=\$2/.test(s)) return { rows: Number(params[0]) === 5 && params[1] === ME.id ? [{ '?column?': 1 }] : [] };
  if (/FROM images WHERE world_id=\$1 AND filename=\$2/.test(s)) return { rows: rows.filter((r) => r.world_id === Number(params[0]) && r.filename === params[1]) };
  if (/INSERT INTO images/.test(s)) {
    if (failInsert) throw new Error('insert failed');
    const row = { id: rows.length + 1, filename: params[0], original_name: params[1], file_path: params[2], file_size: params[3], mime_type: params[4], world_id: Number(params[5]), alt_text: params[7], storage_key: params[8], created_at: new Date() };
    rows.push(row);
    return { rows: [row] };
  }
  throw new Error(`unexpected query: ${s}`);
};
pool.connectTx = async () => ({ query: pool.query, release() {} });

let base, server;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/images/stock', require('../routes/stock'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/images/stock`;
});
test.after(() => { server.close(); pool.end().catch(() => {}); });

const pick = async (body, signedIn = true) => {
  const r = await realFetch(base, { method: 'POST', headers: { 'content-type': 'application/json', ...(signedIn ? { cookie } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const reset = () => { rows = []; sent.length = 0; fetched = []; charged = 0; failInsert = false; };

test('the shipped library: 24 tokens and 12 portraits, each on the media bucket under its own hashed name, with a credit', () => {
  const items = library.items;
  assert.strictEqual(items.filter((i) => i.kind === 'token').length, 24);
  assert.strictEqual(items.filter((i) => i.kind === 'portrait').length, 12);
  assert.strictEqual(new Set(items.map((i) => i.name)).size, 36, 'names are unique');
  for (const i of items) {
    const folder = i.kind === 'token' ? 'tokens' : 'portraits';
    assert.match(i.src, new RegExp(`^${MEDIA_ORIGIN.replace(/\./g, '\\.')}/atlas/stock/${folder}/${i.name}-[0-9a-f]{8}\\.webp$`), i.name);
    assert.ok(i.title && i.group, `${i.name} has a title and a group`);
  }
  assert.ok(library.credit.length > 20, 'the credit line is there');
  assert.strictEqual(stock.list().length, 36, 'every shipped picture is offered');
});

test('the list needs a session, and is the library with its credit', async () => {
  assert.strictEqual((await realFetch(base)).status, 401);
  const r = await realFetch(base, { headers: { cookie } });
  assert.strictEqual(r.status, 200);
  const body = await r.json();
  assert.strictEqual(body.credit, library.credit);
  assert.strictEqual(body.items.length, 36);
  assert.deepStrictEqual(Object.keys(body.items[0]).sort(), ['group', 'kind', 'name', 'title', 'url']);
});

test('a pick copies the picture into the world: fetched, charged like an upload, put under the world, captioned', async () => {
  reset();
  const out = await pick({ world_id: 5, name: ITEM.name });
  assert.strictEqual(out.status, 200);
  assert.deepStrictEqual(fetched, [ITEM.src]);
  const put = sent.find((c) => c.constructor.name === 'PutObjectCommand');
  assert.strictEqual(put.input.Key, `worlds/5/stock-test-wolf-${HASH}.webp`);
  assert.strictEqual(put.input.ContentType, 'image/webp');
  assert.strictEqual(put.input.CacheControl, 'public, max-age=31536000, immutable');
  assert.deepStrictEqual(Buffer.from(put.input.Body), WEBP);
  assert.strictEqual(charged, Math.ceil(WEBP.length / 1024), 'the upload allowance is spent in KB');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].original_name, 'Test wolf (stock)');
  assert.match(rows[0].alt_text, /^Stock token from the Atlas library\. /);
  assert.strictEqual(rows[0].storage_key, put.input.Key);
  assert.strictEqual(out.body.kind, 'token');
  assert.strictEqual(out.body.reused, false);
  assert.strictEqual(out.body.image.url, `https://pub.test/${put.input.Key}`);
});

test('a second pick of the same picture hands back the first copy, with nothing fetched, put or spent', async () => {
  sent.length = 0; fetched = []; const before = charged;
  const out = await pick({ world_id: 5, name: ITEM.name });
  assert.strictEqual(out.status, 200);
  assert.strictEqual(out.body.reused, true);
  assert.strictEqual(out.body.image.id, 1);
  assert.deepStrictEqual(fetched, []);
  assert.strictEqual(sent.length, 0);
  assert.strictEqual(charged, before);
  assert.strictEqual(rows.length, 1);
});

test('bytes that are not the name\'s are never stored or charged', async () => {
  reset();
  const out = await pick({ world_id: 5, name: LIAR.name });
  assert.strictEqual(out.status, 502);
  assert.match(out.body.message, /try again/);
  assert.strictEqual(sent.length, 0);
  assert.strictEqual(charged, 0);
  assert.strictEqual(rows.length, 0);
});

test('refusals before anything is fetched: signed out, a missing or unknown name, a bad world, another\'s world', async () => {
  reset();
  assert.strictEqual((await pick({ world_id: 5, name: ITEM.name }, false)).status, 401);
  assert.strictEqual((await pick({ world_id: 5 })).status, 400);
  assert.strictEqual((await pick({ world_id: 5, name: 'unicorn' })).status, 400);
  assert.strictEqual((await pick({ world_id: 'x', name: ITEM.name })).status, 400);
  assert.strictEqual((await pick({ world_id: 6, name: ITEM.name })).status, 404);
  assert.deepStrictEqual(fetched, []);
  assert.strictEqual(sent.length, 0);
  assert.strictEqual(rows.length, 0);
});

test('a failed insert takes the object back out of R2', async () => {
  reset();
  failInsert = true;
  const out = await pick({ world_id: 5, name: ITEM.name });
  assert.strictEqual(out.status, 500);
  const names = sent.map((c) => c.constructor.name);
  assert.ok(names.includes('PutObjectCommand') && names.includes('DeleteObjectCommand'), names.join(','));
  assert.strictEqual(sent.find((c) => c.constructor.name === 'DeleteObjectCommand').input.Key, `worlds/5/stock-test-wolf-${HASH}.webp`);
});
