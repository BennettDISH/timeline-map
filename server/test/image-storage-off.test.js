// With R2 off nothing is stored: an upload answers 503 before it charges the allowance or touches
// the database, the Forge refuses before it paints (the paid call is never made), and storeImage
// throws instead of falling back to Postgres. No database, no network.
//
//   node --test server/test/image-storage-off.test.js
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const pool = require('../config/database');

for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL']) delete process.env[k];

const queries = [];
pool.query = async (sql) => {
  const s = sql.trim();
  queries.push(s);
  if (/FROM worlds WHERE id=\$1 AND created_by=\$2/.test(s)) return { rows: [{ '?column?': 1 }] };
  throw new Error(`unexpected query: ${s}`);
};

// the paid painter, counted: set before forge/contract takes it
const gemini = require('../forge/gemini');
let painted = 0;
gemini.generateImage = async () => { painted += 1; return { mimeType: 'image/png', data: 'AAAA' }; };
const { paintAndStore } = require('../forge/contract');
const { storeImage, refuseWithoutStorage, NO_STORAGE } = require('../lib/storeImage');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), Buffer.alloc(2048)]);
const dataUrl = `data:image/png;base64,${PNG.toString('base64')}`;

let base, server;
test.before(async () => {
  const app = express();
  app.use(express.json({ limit: '14mb' }));
  app.post('/upload', (req, res, next) => { req.user = { id: 11 }; next(); }, require('../routes/image-base64').upload);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); pool.end().catch(() => {}); });

const upload = async (body) => {
  const r = await fetch(`${base}/upload`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

test('an upload with R2 off is a 503 with a sentence, and nothing is charged or inserted', async () => {
  const out = await upload({ imageData: dataUrl, originalName: 'map.png', world_id: 5 });
  assert.strictEqual(out.status, 503);
  assert.strictEqual(out.body.message, NO_STORAGE);
  assert.ok(!queries.some((q) => /spend_counters|INSERT INTO images/.test(q)), 'no charge, no row');
});

test('a bad file is still refused as bad, not as unconfigured', async () => {
  const out = await upload({ imageData: `data:image/png;base64,${Buffer.from('not an image at all').toString('base64')}`, originalName: 'x.png', world_id: 5 });
  assert.strictEqual(out.status, 400);
});

test('storeImage and the Forge will not fall back to the database', async () => {
  await assert.rejects(storeImage({ worldId: 5, filename: 'a.png', buffer: PNG, mimeType: 'image/png' }), (e) => e.userMessage === NO_STORAGE);
  const error = console.error;
  console.error = () => {};
  try {
    await assert.rejects(paintAndStore({ worldId: 5, userId: 1, kind: 'art', prompt: 'a tower', artStyle: '', name: 'Tower' }), (e) => e.userMessage === NO_STORAGE);
  } finally {
    console.error = error;
  }
  assert.strictEqual(painted, 0, 'the paid painter was never called');
  assert.ok(!queries.some((q) => /INSERT INTO images/.test(q)));
});

test('refuseWithoutStorage answers 503 and says so', () => {
  let status = null, body = null;
  const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
  assert.strictEqual(refuseWithoutStorage(res), true);
  assert.strictEqual(status, 503);
  assert.deepStrictEqual(body, { message: NO_STORAGE });
});
