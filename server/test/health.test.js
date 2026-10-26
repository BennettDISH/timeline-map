// /health (fleet-kit's, as server.js mounts it): 200 with the commit while the database answers,
// 503 (no database text) when it fails. The last test boots the real server.js against a database
// that refuses connections.
//
//   node --test server/test/health.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const express = require('express');
const { health } = require('fleet-kit/server');

test('server.js asks the pool within 3 s and hands out the commit and the time', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(source, /app\.get\('\/health', health\(\{\s*db: pool,\s*timeoutMs: 3000,/);
  // the same options on a small app: the commit is the deploy signal the live suites wait for
  const asked = [];
  const app = express().get('/health', health({ query: async (text) => { asked.push(text); }, info: () => ({ commit: 'abc123', timestamp: new Date().toISOString() }) }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    const body = await res.json();
    assert.deepStrictEqual(asked, ['SELECT 1']);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('cache-control'), 'no-store');
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.commit, 'abc123');
    assert.strictEqual(body.db, 'ok');
    assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
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
    const body = JSON.parse(text);
    assert.strictEqual(body.status, 'unavailable');
    assert.strictEqual(body.db, 'not answering');
    assert.ok(!text.includes('secret-pass') && !/ECONNREFUSED|password|nobody/.test(text));
  } finally {
    child.kill();
    await new Promise((r) => (child.exitCode === null && child.signalCode === null ? child.once('exit', r) : r()));
  }
});
