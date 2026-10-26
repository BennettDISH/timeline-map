// The Waypoint code exchange (GET /auth/callback, fleet-kit's) is a call to Waypoint, which caps
// per calling address and sees only this server's: so each visitor is counted first (20 per 15
// minutes per address), and the 21st is sent back to the sign-in page before anything is asked
// of Waypoint. The address is the one the proxy added last to X-Forwarded-For. Its own file: the
// count lives in the process.
//
//   node --test server/test/sso-callback-limit.test.js
process.env.AUTH_SERVICE_URL = 'http://waypoint.test';
process.env.SSO_CLIENT_ID = 'atlas-test-client';
process.env.SSO_CLIENT_SECRET = 'atlas-test-secret';
process.env.JWT_SECRET = 'sso-limit-test-secret';
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { trustOneProxy } = require('fleet-kit/server');
const pool = require('../config/database');
const { wp } = require('../config/auth');

let base, server;
test.before(async () => {
  const app = trustOneProxy(express()); // as server.js does
  app.get('/auth/callback', wp.callback);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.closeAllConnections(); server.close(); pool.end().catch(() => {}); });

// What the proxy sends: whatever the client wrote in X-Forwarded-For, then the address it saw.
const callback = async (address, forged) => {
  const r = await fetch(`${base}/auth/callback?code=x&state=y`, {
    redirect: 'manual',
    // no state cookie: the callback refuses on its own, without asking Waypoint
    headers: { 'X-Forwarded-For': forged ? `${forged}, ${address}` : address },
  });
  return { status: r.status, location: r.headers.get('location'), retryAfter: r.headers.get('retry-after') };
};

test('20 exchanges from one address reach the callback; the 21st is turned away, and a forged X-Forwarded-For does not help', async () => {
  for (let i = 0; i < 20; i++) {
    assert.strictEqual((await callback('203.0.113.7', `10.0.${i}.1`)).location, '/login?error=sso_state', `try ${i + 1}`);
  }
  const blocked = await callback('203.0.113.7', '10.9.9.9');
  assert.strictEqual(blocked.status, 302);
  assert.strictEqual(blocked.location, '/login?error=sso_busy');
  assert.ok(Number(blocked.retryAfter) > 0);
  assert.strictEqual((await callback('198.51.100.8')).location, '/login?error=sso_state', 'another address is not held back');
});
