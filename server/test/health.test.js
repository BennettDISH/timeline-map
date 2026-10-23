// /health: 200 with the commit while the database answers, 503 (no database text) when it fails or
// hangs. The last test boots the real server.js against a database that refuses connections.
//
//   node --test server/test/health.test.js
const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const express = require('express');
const { healthHandler } = require('../lib/health');

async function serve(options) {
  const app = express();
  app.get('/health', healthHandler(options));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    return { res, body: await res.json() };
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

test('health asks the database SELECT 1 and keeps the commit', async () => {
  const asked = [];
  const { res, body } = await serve({ query: async (text) => { asked.push(text); }, commit: () => 'abc123' });
  assert.deepStrictEqual(asked, ['SELECT 1']);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('cache-control'), 'no-store');
  assert.strictEqual(body.status, 'ok');
  assert.strictEqual(body.commit, 'abc123');
  assert.strictEqual(body.db, 'ok');
  assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
});

test('health answers 503 without the database error when the query fails', async () => {
  const { res, body } = await serve({ query: async () => { throw new Error('password authentication failed for user "secret-user"'); } });
  assert.strictEqual(res.status, 503);
  assert.strictEqual(res.headers.get('cache-control'), 'no-store');
  assert.deepStrictEqual(body, { status: 'unavailable', db: 'not answering' });
});

test('health answers 503 when the query hangs past the timeout', async () => {
  const started = Date.now();
  const { res, body } = await serve({ query: () => new Promise(() => {}), timeoutMs: 100 });
  assert.strictEqual(res.status, 503);
  assert.strictEqual(body.db, 'not answering');
  assert.ok(Date.now() - started < 2000);
});

test('the real server answers 503 on /health while its database refuses connections', { timeout: 60000 }, async () => {
  const port = await new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
  // nothing listens on port 1: the pool's connections are refused at once
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { PORT: String(port), NODE_ENV: 'test', DATABASE_URL: 'postgres://nobody:secret-pass@127.0.0.1:1/none', JWT_SECRET: 'test', RAILWAY_GIT_COMMIT_SHA: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  try {
    let res;
    for (let i = 0; i < 300 && !res; i++) {
      if (child.exitCode !== null) throw new Error(`server exited early:\n${log}`);
      res = await fetch(`http://127.0.0.1:${port}/health`).catch(() => null);
      if (!res) await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(res, `server did not start:\n${log}`);
    assert.strictEqual(res.status, 503);
    const text = await res.text();
    assert.deepStrictEqual(JSON.parse(text), { status: 'unavailable', db: 'not answering' });
    assert.ok(!text.includes('secret-pass') && !/ECONNREFUSED/.test(text));
  } finally {
    child.kill();
    await new Promise((r) => (child.exitCode === null && child.signalCode === null ? child.once('exit', r) : r()));
  }
});
