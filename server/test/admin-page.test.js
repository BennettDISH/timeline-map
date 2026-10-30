// The admin's pages are decided on the server however the path is spelled: the page's router
// takes /ADMIN and /%61dmin as /admin (React Router ignores case and decodes the path), so the
// kit's adminPage gate runs for every path isAdminPath (config/auth.js) says is one, as in
// server.js. Signed out, every spelling goes to sign-in.
//
//   node --test server/test/admin-page.test.js
process.env.APP_BASE_URL = '';
process.env.JWT_SECRET = 'admin-page-test-secret';
delete process.env.SESSION_SECRET;
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const pool = require('../config/database');
const { wp, isAdminPath } = require('../config/auth');

let server, site;
test.before(async () => {
  const app = express();
  const adminGate = wp.adminPage();
  app.use((req, res, next) => (isAdminPath(req.path) ? adminGate(req, res, next) : next()));
  app.use((req, res) => res.type('text/plain').send('the page'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  site = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.closeAllConnections(); server.close(); pool.end().catch(() => {}); });

const get = (p) => fetch(`${site}${p}`, { redirect: 'manual' });

test('which paths are the admin\'s pages', () => {
  for (const p of ['/admin', '/admin/', '/ADMIN', '/Admin/worlds/3', '/%61dmin', '/%41DMIN/worlds/3', '/adm%69n']) assert.ok(isAdminPath(p), p);
  for (const p of ['/', '/administer', '/p/abc', '/worlds/3', '/%E0%A4%A', '/api/admin']) assert.ok(!isAdminPath(p), p);
});

test('signed out, every spelling of /admin goes to sign-in, never the page', async () => {
  for (const p of ['/admin', '/ADMIN', '/Admin/worlds/3', '/admin/', '/%61dmin', '/%61dmin/worlds/3']) {
    const res = await get(p);
    assert.equal(res.status, 302, p);
    assert.match(res.headers.get('location'), /\/sso\/login\?next=/, p);
    assert.notEqual(await res.text(), 'the page', p);
  }
});

test('every other page goes through', async () => {
  for (const p of ['/', '/administer', '/p/abc', '/worlds/3']) assert.equal((await get(p)).status, 200, p);
});
