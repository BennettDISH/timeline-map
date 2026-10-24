// The Waypoint code exchange (POST /api/auth/sso-callback) is a call to Waypoint, which caps per
// calling address and sees only this server's: so each visitor is counted here first, with the
// same limiter as login and register (20 per 15 minutes per address), and the 21st is turned
// away before anything is asked of Waypoint. The address is the one the proxy added last to
// X-Forwarded-For. Its own file: the count lives in the process.
//
//   node --test server/test/sso-callback-limit.test.js
process.env.AUTH_SERVICE_URL = 'http://waypoint.test';
process.env.SSO_CLIENT_ID = 'atlas-test-client';
process.env.SSO_CLIENT_SECRET = 'atlas-test-secret';
process.env.JWT_SECRET = 'sso-limit-test-secret';
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const pool = require('../config/database');

let base, server;
test.before(async () => {
  const app = express();
  app.set('trust proxy', 1); // as server.js does
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/auth`;
});
test.after(() => { server.closeAllConnections(); server.close(); pool.end().catch(() => {}); });

// What the proxy sends: whatever the client wrote in X-Forwarded-For, then the address it saw.
const callback = async (address, forged) => {
  const r = await fetch(`${base}/sso-callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forged ? `${forged}, ${address}` : address },
    body: '{}', // no code: the route answers 400 on its own, without asking Waypoint
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

test('20 exchanges from one address reach the route; the 21st is refused, and a forged X-Forwarded-For does not help', async () => {
  for (let i = 0; i < 20; i++) {
    assert.strictEqual((await callback('203.0.113.7', `10.0.${i}.1`)).status, 400, `try ${i + 1}`);
  }
  const blocked = await callback('203.0.113.7', '10.9.9.9');
  assert.strictEqual(blocked.status, 429);
  assert.match(blocked.body.message, /Too many attempts/);
  assert.strictEqual((await callback('198.51.100.8')).status, 400, 'another address is not held back');
});
