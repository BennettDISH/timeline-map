// One line per request with an id, and nothing secret in it: Waypoint's ?code=&state= land on the
// callback's URL, and share links carry their token in the path. The log is fleet-kit's; it is
// mounted the way server.js mounts it, on a small app, so what is logged can be read here.
//
//   node --test server/test/request-log.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { requestLog } = require('fleet-kit/server');

let server, base;
const lines = [];

test.before(async () => {
  const app = express();
  // the kit writes with console.log; here the lines are kept to be read
  app.use(requestLog({ log: (line) => lines.push(line) }));
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.closeAllConnections();
  server.close();
});

const lineFor = async (id) => {
  await new Promise((r) => setTimeout(r, 50)); // the line is written when the response finishes
  return lines.find((l) => l.startsWith(`${id} `));
};

test('the callback logs one line: id, method, path, status and time, and no query string', async () => {
  const res = await fetch(`${base}/auth/callback?code=abc123&state=def456`);
  const id = res.headers.get('x-request-id');
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.match(await lineFor(id), /^[0-9a-f-]{36} GET \/auth\/callback 404 \d+ms$/);
  assert.ok(!/abc123|def456|code=|state=/.test(lines.join('\n')), 'nothing from the query is logged');
});

test('a share token in the path is logged as :token, and /health gets an id and no line', async () => {
  const res = await fetch(`${base}/api/share/abcdefghijklmnopqrstuvwx1234`);
  assert.match(await lineFor(res.headers.get('x-request-id')), / GET \/api\/share\/:token 404 /);
  assert.ok(!lines.join('\n').includes('abcdefghijklmnopqrstuvwx1234'));
  const health = await fetch(`${base}/health`);
  assert.ok(health.headers.get('x-request-id'));
  assert.strictEqual(await lineFor(health.headers.get('x-request-id')), undefined);
});

test('server.js mounts the log first and the kit\'s error handler last', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(source.indexOf('app.use(requestLog())') > 0 && source.indexOf('app.use(requestLog())') < source.indexOf('app.use(collapseLeadingSlashes)'), 'logged first');
  assert.ok(source.lastIndexOf('app.use(errorHandler(') > source.lastIndexOf('app.use((req, res) =>'), 'the error handler is the last middleware');
});
