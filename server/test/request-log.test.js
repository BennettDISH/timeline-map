// One line per request with an id, and nothing secret in it: Waypoint's ?code=&state= land on a
// callback's URL, and share links carry their token in the path. The middleware is mounted the
// way server.js mounts it, on a small app, so what is logged can be read here.
//
//   node --test server/test/request-log.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { requestLog, scrubPath } = require('../middleware/requestLog');

let server, base;
const lines = [];
const realLog = console.log;

test.before(async () => {
  const app = express();
  app.use(requestLog());
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use('/api', (req, res) => res.status(404).json({ message: 'Route not found' }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  console.log = (...a) => lines.push(a.join(' '));
});

test.after(() => {
  console.log = realLog;
  server.closeAllConnections();
  server.close();
});

const lineFor = async (id) => {
  await new Promise((r) => setTimeout(r, 50)); // the line is written when the response finishes
  return lines.find((l) => l.startsWith(`${id} `));
};

test('a request logs one line: id, method, path with its /api prefix, status and time, and no query string', async () => {
  const res = await fetch(`${base}/api/auth/sso/callback?code=abc123&state=def456`);
  const id = res.headers.get('x-request-id');
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.match(await lineFor(id), /^[0-9a-f-]{36} GET \/api\/auth\/sso\/callback 404 \d+ms$/);
  assert.ok(!/abc123|def456|code=|state=/.test(lines.join('\n')), 'nothing from the query is logged');
});

test('a request id the caller sent is kept, a malformed one is replaced, /health gets an id and no line', async () => {
  const kept = await fetch(`${base}/api/x`, { headers: { 'X-Request-Id': 'caller-id-0001' } });
  assert.strictEqual(kept.headers.get('x-request-id'), 'caller-id-0001');
  assert.ok(await lineFor('caller-id-0001'));
  const bad = await fetch(`${base}/api/x`, { headers: { 'X-Request-Id': 'not an id!' } });
  assert.match(bad.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  const health = await fetch(`${base}/health`);
  assert.ok(health.headers.get('x-request-id'));
  assert.strictEqual(await lineFor(health.headers.get('x-request-id')), undefined);
});

test('a share token in the path is logged as :token', async () => {
  const res = await fetch(`${base}/api/share/abcdefghijklmnopqrstuvwx1234`);
  assert.match(await lineFor(res.headers.get('x-request-id')), / GET \/api\/share\/:token 404 /);
  assert.ok(!lines.join('\n').includes('abcdefghijklmnopqrstuvwx1234'));
  assert.strictEqual(scrubPath('/api/worlds/12/maps'), '/api/worlds/12/maps');
});

test('server.js mounts the log first and its error handler logs with the request id', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(source.indexOf('app.use(requestLog())') > 0 && source.indexOf('app.use(requestLog())') < source.indexOf('app.use(collapseLeadingSlashes)'), 'logged first');
  assert.match(source, /console\.error\(req\.id, req\.method, scrubPath\(req\.originalUrl\.split\('\?'\)\[0\]\), err\)/);
});
