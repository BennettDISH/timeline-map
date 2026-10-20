// Image URLs never get the app's page back, run locally (no database, no network): the serve
// route streams a Postgres-fallback row, sends an R2-backed row to its R2 URL, and answers a
// missing one with JSON; //api/... reaches the API; and a file-like path the app does not have
// (an R2 key asked of the app's host) is a JSON 404, never index.html.
//
//   node --test server/test/images-serve.test.js
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const pool = require('../config/database');
const { collapseLeadingSlashes, spaFallback, wantsPage } = require('../lib/spa');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const R2 = 'https://pub-test.r2.dev/worlds/12/forge-1787698122094-89ea04bc.png';
const ROWS = {
  'fallback.png': { base64_data: `data:image/png;base64,${PNG.toString('base64')}`, mime_type: 'image/png', file_path: '/api/images-base64/serve/fallback.png' },
  'forge-1787698122094-89ea04bc.png': { base64_data: null, mime_type: 'image/png', file_path: R2 },
  'img-1792187851076-109184844.jpg': { base64_data: null, mime_type: 'image/jpeg', file_path: 'https://pub-test.r2.dev/worlds/12/img-1792187851076-109184844.jpg' },
  'lost.png': { base64_data: null, mime_type: 'image/png', file_path: '/api/images-base64/serve/lost.png' },
  'loop.png': { base64_data: null, mime_type: 'image/png', file_path: 'https://example.test/api/images-base64/serve/loop.png' },
};
pool.query = async (sql, params) => {
  assert.match(sql, /FROM images WHERE filename = \$1/);
  const row = ROWS[params[0]];
  return { rows: row ? [row] : [] };
};

const PAGE = '<!DOCTYPE html><html><body>app</body></html>';
let base, server;
test.before(async () => {
  // wired like server.js: the slash rule first, the API, the page fallback, then the JSON 404
  const app = express();
  app.use(collapseLeadingSlashes);
  app.use('/api/images-base64', require('../routes/image-base64'));
  app.use(spaFallback(() => PAGE));
  app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); pool.end().catch(() => {}); });

const get = (path) => fetch(base + path, { redirect: 'manual' });
async function assertJson404(path) {
  const r = await get(path);
  assert.strictEqual(r.status, 404, path);
  assert.match(r.headers.get('content-type'), /^application\/json/, path);
  const body = await r.text();
  assert.ok(!/<html/i.test(body), `${path} answered with HTML`);
}

test('a Postgres-fallback image streams its bytes', async () => {
  const r = await get('/api/images-base64/serve/fallback.png');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers.get('content-type'), 'image/png');
  assert.deepStrictEqual(Buffer.from(await r.arrayBuffer()), PNG);
});

test('an R2-backed image asked for by file name is sent to its R2 URL', async () => {
  for (const [name, row] of Object.entries(ROWS).filter(([, v]) => v.file_path.startsWith('https://pub-'))) {
    const r = await get(`/api/images-base64/serve/${name}`);
    assert.strictEqual(r.status, 302, name);
    assert.strictEqual(r.headers.get('location'), row.file_path, name);
  }
});

test('no image, or no bytes anywhere, is a JSON 404 and never a redirect loop', async () => {
  await assertJson404('/api/images-base64/serve/missing.png');
  await assertJson404('/api/images-base64/serve/lost.png');
  await assertJson404('/api/images-base64/serve/loop.png');
  await assertJson404('/api/images-base64/serve/');
  await assertJson404('/api/nope');
});

test('//api/... is the same request as /api/...', async () => {
  const r = await get('//api/images-base64/serve/fallback.png');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers.get('content-type'), 'image/png');
  await assertJson404('//api/images-base64/serve/missing.png');
  const moved = await get('//api/images-base64/serve/forge-1787698122094-89ea04bc.png');
  assert.strictEqual(moved.status, 302);
  assert.strictEqual(moved.headers.get('location'), R2);
});

test('a file the app does not have is a JSON 404, not the app page', async () => {
  // the R2 key asked of the app's host: what a URL rewritten onto the wrong host looks like
  await assertJson404('/worlds/12/forge-1787698122094-89ea04bc.png');
  await assertJson404('/worlds/12/img-1792187851076-109184844.jpg');
  await assertJson404('/assets/index-gone.js');
  await assertJson404('/favicon.ico');
});

test('client routes still get the page', async () => {
  for (const p of ['/', '/dashboard', '/w/3/m/7', '/p/fx0123456789abcdef', '/p/Ab-_9xYz0123456789AbCdEfGh/m/12', '/auth/callback?code=a.b', '/worlds/4/images']) {
    const r = await get(p);
    assert.strictEqual(r.status, 200, p);
    assert.match(r.headers.get('content-type'), /^text\/html/, p);
    assert.strictEqual(await r.text(), PAGE, p);
  }
  assert.strictEqual(wantsPage('/w/3'), true);
  assert.strictEqual(wantsPage('/x.png'), false);
  assert.strictEqual(wantsPage('/api/x'), false);
});

test('only a GET or HEAD gets the page; a POST to a client route is the JSON 404', async () => {
  const head = await fetch(`${base}/w/3/m/7`, { method: 'HEAD' });
  assert.strictEqual(head.status, 200);
  assert.match(head.headers.get('content-type'), /^text\/html/);
  const r = await fetch(`${base}/w/3/m/7`, { method: 'POST' });
  assert.strictEqual(r.status, 404);
  assert.match(r.headers.get('content-type'), /^application\/json/);
});
