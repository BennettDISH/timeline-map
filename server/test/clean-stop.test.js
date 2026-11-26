// A deploy's stop (server/lib/cleanStop.js). Railway stops the old server with SIGTERM on every deploy,
// and a stop that doesn't end in exit 0 is mailed as "Deploy crashed". Until 11-26 every update did that:
// npm start ran `cd server && npm start`, then `sh -c "node server.js"`, and sh died of the signal it was
// handed (npm exit 143) while node, orphaned, never heard it.
//
//   node --test server/test/clean-stop.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const { exitCleanlyOn } = require('../lib/cleanStop');

const root = path.join(__dirname, '..', '..');
const scripts = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts;

test('both start scripts exec, so the signal comes down npm, npm, node, and never stops at a shell', () => {
  assert.strictEqual(scripts(root).start, 'cd server && exec npm start');
  assert.strictEqual(scripts(path.join(root, 'server')).start, 'exec node server.js');
});

test('npm start, signalled as Railway signals it (twice), closes once and exits 0', { timeout: 60000 }, async () => {
  const port = await new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
  // nothing listens on port 1: the schema ensure fails at once and the server listens anyway
  const child = spawn('npm', ['start'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', DATABASE_URL: 'postgres://nobody:none@127.0.0.1:1/none', JWT_SECRET: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    for (let i = 0; i < 400 && !log.includes(`Server running on port ${port}`); i++) {
      if (child.exitCode !== null) throw new Error(`npm start exited early:\n${log}`);
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(log.includes(`Server running on port ${port}`), `server did not start:\n${log}`);
    // Back to back, as when Railway signals every process at once while npm passes its own on (a second
    // one sent once the close is over can find npm already on its way out, which no deploy does).
    child.kill('SIGTERM');
    child.kill('SIGTERM');
    assert.deepStrictEqual(await exited, { code: 0, signal: null }, log);
    assert.match(log, /SIGTERM: closing/);
    assert.match(log, /\nstopped\n/);
    assert.doesNotMatch(log, /npm error/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
});

test('a close that hangs or fails still exits 0', async () => {
  for (const close of [() => new Promise(() => {}), () => Promise.reject(new Error('stuck'))]) {
    const target = new EventEmitter();
    const exits = [];
    const lines = [];
    exitCleanlyOn(close, { target, graceMs: 30, exit: (c) => exits.push(c), log: (l) => lines.push(l) });
    target.emit('SIGTERM', 'SIGTERM');
    target.emit('SIGTERM', 'SIGTERM');
    await new Promise((r) => setTimeout(r, 80));
    assert.deepStrictEqual(exits.slice(0, 1), [0]);
    assert.ok(lines.includes('SIGTERM again: already stopping'));
    assert.ok(lines.some((l) => /gave up waiting after 30 ms|closing failed: stuck/.test(l)), lines.join(' / '));
  }
});
