// The start of the Waypoint redirect, run locally (no database, no network): /api/auth/sso/login
// sends Waypoint the state this tab made and kept (the callback page checks it comes back the
// same, client/src/utils/signIn.js), with the server's client id and callback, and passes
// prompt=login on for "Switch account" — nothing else as a prompt.
//
//   node --test server/test/sso.test.js
process.env.AUTH_SERVICE_URL = 'http://waypoint.test';
process.env.SSO_CLIENT_ID = 'atlas-test-client';
process.env.SSO_CLIENT_SECRET = 'atlas-test-secret';
process.env.APP_BASE_URL = 'http://atlas.test';
process.env.JWT_SECRET = 'sso-test-secret';
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const pool = require('../config/database');

let base, server;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/auth`;
});
test.after(() => { server.close(); pool.end().catch(() => {}); });

const start = async (query) => {
  const r = await fetch(`${base}/sso/login?${query}`, { redirect: 'manual' });
  await r.arrayBuffer();
  return { status: r.status, url: new URL(r.headers.get('location')) };
};

test('the sign-in leaves for Waypoint\'s authorize page with the tab\'s own state, this app\'s client id and callback', async () => {
  const { status, url } = await start('state=8a1c-tab-state');
  assert.strictEqual(status, 302);
  assert.strictEqual(`${url.origin}${url.pathname}`, 'http://waypoint.test/oauth/authorize');
  assert.strictEqual(url.searchParams.get('state'), '8a1c-tab-state');
  assert.strictEqual(url.searchParams.get('client_id'), 'atlas-test-client');
  assert.strictEqual(url.searchParams.get('redirect_uri'), 'http://atlas.test/auth/callback');
  assert.strictEqual(url.searchParams.has('prompt'), false, 'a plain sign-in reuses Waypoint\'s session');
  assert.strictEqual(url.searchParams.has('client_secret'), false);
});

test('"Switch account" passes prompt=login on, and only that', async () => {
  assert.strictEqual((await start('state=s1&prompt=login')).url.searchParams.get('prompt'), 'login');
  for (const p of ['none', 'consent', 'login%20none']) {
    assert.strictEqual((await start(`state=s2&prompt=${p}`)).url.searchParams.has('prompt'), false, p);
  }
});

test('the callback exchange needs a code; the state was checked on the callback page before it', async () => {
  const r = await fetch(`${base}/sso-callback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.strictEqual(r.status, 400);
});
