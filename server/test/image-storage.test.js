// Where uploaded images go, run locally (no database, no network): with R2 on, an upload puts
// the bytes to worlds/<world>/<file> and the row keeps only the object key and the R2 URL (no
// base64 column is written); a failed insert takes the object back out. Pool and S3 are stood in for.
//
//   node --test server/test/image-storage.test.js
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const pool = require('../config/database');

Object.assign(process.env, { R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'bucket', R2_PUBLIC_URL: 'https://pub.test/' });
const sent = [];
require('@aws-sdk/client-s3').S3Client.prototype.send = async (cmd) => { sent.push(cmd); return {}; };

let inserts = [];
let failInsert = false;
pool.query = async (sql, params) => {
  const s = sql.trim();
  if (/INSERT INTO spend_counters/.test(s)) return { rows: [{ used: params[3] }], rowCount: 1 };
  if (/FROM spend_counters/.test(s)) return { rows: [] };
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s) || /DELETE FROM spend_counters/.test(s)) return { rows: [], rowCount: 0 };
  if (/FROM worlds WHERE id=\$1 AND created_by=\$2/.test(s)) return { rows: [{ '?column?': 1 }] };
  if (/INSERT INTO images/.test(s)) {
    if (failInsert) throw new Error('insert failed');
    inserts.push({ sql: s, params });
    return { rows: [{ id: 1, filename: params[0], original_name: params[1], file_path: params[2], file_size: params[3], mime_type: params[4], alt_text: null, created_at: new Date() }] };
  }
  throw new Error(`unexpected query: ${s}`);
};
pool.connectTx = async () => ({ query: pool.query, release() {} });

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

const upload = async () => {
  const r = await fetch(`${base}/upload`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageData: dataUrl, originalName: 'map.png', world_id: 5 }) });
  return { status: r.status, body: await r.json() };
};

test('an upload goes to R2 and the row keeps only the key and the URL', async () => {
  const out = await upload();
  assert.strictEqual(out.status, 200);
  const put = sent.find((c) => c.constructor.name === 'PutObjectCommand');
  assert.ok(put, 'the bytes were put to R2');
  assert.strictEqual(put.input.Bucket, 'bucket');
  assert.match(put.input.Key, /^worlds\/5\/img-\d+-\d+\.png$/);
  assert.strictEqual(put.input.ContentType, 'image/png');
  assert.strictEqual(put.input.CacheControl, 'public, max-age=31536000, immutable', 'the key is never written twice, so the edge may keep it for good');
  assert.deepStrictEqual(Buffer.from(put.input.Body), PNG);

  assert.strictEqual(inserts.length, 1);
  const { sql, params } = inserts[0];
  assert.doesNotMatch(sql, /base64_data/, 'no bytes column is written');
  assert.ok(!params.some((p) => typeof p === 'string' && p.startsWith('data:')), 'no data URL reaches the database');
  assert.strictEqual(params[2], `https://pub.test/${put.input.Key}`, 'file_path is the absolute R2 URL');
  assert.ok(params.includes(put.input.Key), 'storage_key is the object key');
  assert.strictEqual(out.body.image.url, `https://pub.test/${put.input.Key}`);
});

test('a failed insert takes the object back out of R2', async () => {
  sent.length = 0;
  failInsert = true;
  const error = console.error;
  console.error = () => {};
  try {
    assert.strictEqual((await upload()).status, 500);
  } finally {
    console.error = error;
    failInsert = false;
  }
  const put = sent.find((c) => c.constructor.name === 'PutObjectCommand');
  const del = sent.find((c) => c.constructor.name === 'DeleteObjectCommand');
  assert.ok(put && del, 'put, then delete');
  assert.strictEqual(del.input.Key, put.input.Key);
});
