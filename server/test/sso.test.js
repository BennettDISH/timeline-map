// Signing in through Waypoint, run locally (no database, no network): fleet-kit's stand-in
// Waypoint, and the users table stood in for by the few statements sign-in makes. /api/auth/
// sso/login keeps a fresh state in a cookie of the server's own and sends Waypoint this app's
// client id and callback (passing prompt=login on for "Switch account", and nothing else as a
// prompt); /auth/callback takes back only a code that comes with that state, signs the account
// in with an httpOnly session cookie and goes on to the page that asked; sign-out ends it on
// every device; a page still holding the old token is moved onto the cookie once.
//
//   node --test server/test/sso.test.js
process.env.APP_BASE_URL = '';
process.env.JWT_SECRET = 'sso-test-secret';
delete process.env.SESSION_SECRET;
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const express = require('express');
const pool = require('../config/database');
const { wp } = require('../config/auth');

// The users table: just what sign-in, the session check and sign-out ask of it.
const users = new Map();
let nextId = 1;
const row = (u) => (u ? { ...u } : undefined);
pool.query = async (sql, params = []) => {
  const q = sql.replace(/\s+/g, ' ').trim();
  if (/^SELECT \* FROM users WHERE central_user_id = \$1/.test(q)) return { rows: [...users.values()].filter((u) => u.central_user_id === params[0]).map(row) };
  if (/^SELECT 1 FROM users WHERE LOWER\(username\) = LOWER\(\$1\)/.test(q)) return { rows: [...users.values()].filter((u) => u.username.toLowerCase() === String(params[0]).toLowerCase() && (params[1] === undefined || u.id !== params[1])).map(() => ({})) };
  if (/^SELECT 1 FROM users WHERE (LOWER\()?email/.test(q)) return { rows: [...users.values()].filter((u) => u.email && u.email.toLowerCase() === String(params[0]).toLowerCase() && (params[1] === undefined || u.id !== params[1])).map(() => ({})) };
  if (/^INSERT INTO users/.test(q)) {
    const [username, email, , role, central_user_id, is_guest] = params;
    const u = { id: nextId++, username, email, role, central_user_id, is_guest, token_version: 0 };
    users.set(u.id, u);
    return { rows: [row(u)] };
  }
  if (/^SELECT id, username, email, role, token_version, central_user_id, is_guest FROM users WHERE id = \$1/.test(q)) return { rows: users.has(params[0]) ? [row(users.get(params[0]))] : [] };
  if (/^UPDATE users SET token_version = token_version \+ 1/.test(q)) {
    const u = users.get(params[0]);
    if (u && u.token_version === params[1]) u.token_version += 1;
    return { rows: [], rowCount: 1 };
  }
  if (/^UPDATE users SET/.test(q)) return { rows: [], rowCount: 1 };
  throw new Error(`unexpected query: ${q}`);
};

let site, server, waypoint;
test.before(async () => {
  const { startFakeWaypoint } = await import('fleet-kit/test/fakeWaypoint');
  waypoint = await startFakeWaypoint();
  Object.assign(process.env, waypoint.env());
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth'));
  app.get('/auth/callback', wp.callback);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  site = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.closeAllConnections(); server.close(); await waypoint.close(); pool.end().catch(() => {}); });

const cookiesOf = (res) => res.headers.getSetCookie().map((c) => c.split(';')[0]);
const sessionOf = (res) => res.headers.getSetCookie().find((c) => c.startsWith(`${wp.session.name}=`))?.split(';')[0];
const me = async (headers = {}) => (await (await fetch(`${site}/api/auth/me`, { headers })).json()).user;

const start = async (query = '') => {
  const r = await fetch(`${site}/api/auth/sso/login${query}`, { redirect: 'manual' });
  await r.arrayBuffer();
  return { status: r.status, url: new URL(r.headers.get('location')), cookies: cookiesOf(r) };
};

// The whole trip a browser makes: the sign-in link, Waypoint's authorize page, and back.
async function signIn(who, query = '') {
  waypoint.signInAs(who);
  const { url, cookies } = await start(query);
  const atWaypoint = await fetch(url, { redirect: 'manual' });
  const back = await fetch(atWaypoint.headers.get('location'), { redirect: 'manual', headers: { Cookie: cookies.join('; ') } });
  return { status: back.status, location: back.headers.get('location'), session: sessionOf(back), setCookie: back.headers.getSetCookie() };
}

test('the sign-in leaves for Waypoint\'s authorize page with a state of the server\'s own, this app\'s client id and callback', async () => {
  const { status, url, cookies } = await start();
  assert.strictEqual(status, 302);
  assert.strictEqual(`${url.origin}${url.pathname}`, `${waypoint.url}/oauth/authorize`);
  assert.strictEqual(url.searchParams.get('client_id'), waypoint.env().SSO_CLIENT_ID);
  assert.strictEqual(url.searchParams.get('redirect_uri'), `${site}/auth/callback`);
  assert.strictEqual(url.searchParams.has('prompt'), false, 'a plain sign-in reuses Waypoint\'s session');
  assert.strictEqual(url.searchParams.has('client_secret'), false);
  const state = cookies.find((c) => c.startsWith('__Host-atlas_oauth_state='));
  assert.ok(state, 'the state is kept in an httpOnly cookie');
  assert.strictEqual(state.split('=')[1], url.searchParams.get('state'));
});

test('"Switch account" passes prompt=login on, and only that', async () => {
  assert.strictEqual((await start('?prompt=login')).url.searchParams.get('prompt'), 'login');
  for (const p of ['none', 'consent', 'login%20none']) {
    assert.strictEqual((await start(`?prompt=${p}`)).url.searchParams.has('prompt'), false, p);
  }
});

test('the callback refuses a code without the state it was started with, before asking Waypoint', async () => {
  const { url, cookies } = await start();
  const before = waypoint.requests.filter((r) => r.path === '/oauth/token').length;
  const noCookie = await fetch(`${site}/auth/callback?code=x&state=${url.searchParams.get('state')}`, { redirect: 'manual' });
  assert.strictEqual(noCookie.headers.get('location'), '/login?error=sso_state');
  const other = await fetch(`${site}/auth/callback?code=x&state=someone-elses`, { redirect: 'manual', headers: { Cookie: cookies.join('; ') } });
  assert.strictEqual(other.headers.get('location'), '/login?error=sso_state');
  assert.strictEqual(waypoint.requests.filter((r) => r.path === '/oauth/token').length, before);
});

test('a Waypoint sign-in makes a fresh account, sets the session cookie and comes back to the page that asked', async () => {
  const r = await signIn({ central_user_id: 1, username: 'bennett', email: 'b@example.test' }, '?next=%2Fw%2F3%2Fm%2F9');
  assert.strictEqual(r.status, 302);
  assert.strictEqual(r.location, '/w/3/m/9');
  assert.ok(r.session, 'the session cookie is set');
  const line = r.setCookie.find((c) => c.startsWith(`${wp.session.name}=`));
  assert.match(line, /HttpOnly/i);
  assert.match(line, /Secure/i);
  assert.match(line, /SameSite=Lax/i);
  const who = await me({ Cookie: r.session });
  assert.deepStrictEqual(who, { id: who.id, username: 'bennett', email: 'b@example.test', role: 'admin', isAdmin: true, isGuest: false });
  // the same Waypoint account again is the same row
  const again = await signIn({ central_user_id: 1, username: 'bennett', email: 'b@example.test' });
  assert.strictEqual((await me({ Cookie: again.session })).id, who.id);
});

test('a guest is a DM like any other, never an admin, and flagged so the page can say so', async () => {
  const r = await fetch(`${site}/api/auth/guest`, { method: 'POST' });
  assert.strictEqual(r.status, 200);
  const { user } = await r.json();
  assert.strictEqual(user.isGuest, true);
  assert.strictEqual(user.isAdmin, false);
  assert.strictEqual((await me({ Cookie: sessionOf(r) })).id, user.id);
});

test('signing out ends the session on every device', async () => {
  const phone = await signIn({ central_user_id: 41, username: 'dm41' });
  const laptop = await signIn({ central_user_id: 41, username: 'dm41' });
  assert.ok(await me({ Cookie: laptop.session }));
  const out = await fetch(`${site}/api/auth/logout`, { method: 'POST', headers: { Cookie: phone.session } });
  assert.strictEqual(out.status, 200);
  assert.strictEqual(await me({ Cookie: phone.session }), null);
  assert.strictEqual(await me({ Cookie: laptop.session }), null);
});

test('a page still holding the old token is moved onto the cookie once, keeping its end; a revoked one is not', async () => {
  const r = await signIn({ central_user_id: 52, username: 'oldtab' });
  const { id } = await me({ Cookie: r.session });
  const now = Math.floor(Date.now() / 1000);
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const jwt = (claims, secret = process.env.JWT_SECRET) => {
    const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`;
    return `${data}.${crypto.createHmac('sha256', secret).update(data).digest('base64url')}`;
  };
  const tv = users.get(id).token_version;
  const res = await fetch(`${site}/api/auth/me`, { headers: { Authorization: `Bearer ${jwt({ userId: id, tv, iat: now - 3600, exp: now + 3 * 3600 })}` } });
  assert.strictEqual((await res.json()).user.id, id);
  const swapped = sessionOf(res);
  assert.ok(swapped, 'swapped for the session cookie');
  const { exp } = JSON.parse(Buffer.from(swapped.split('=')[1].split('.')[1], 'base64url').toString());
  assert.ok(exp <= now + 3 * 3600 + 5 && exp > now + 2 * 3600, 'the old end is kept');
  assert.strictEqual(await me({ Authorization: `Bearer ${jwt({ userId: id, tv, iat: now, exp: now + 3600 }, 'not-the-secret')}` }), null, 'signed with anything else, it is nobody');
  users.get(id).token_version += 1; // signed out everywhere since
  assert.strictEqual(await me({ Authorization: `Bearer ${jwt({ userId: id, tv, iat: now, exp: now + 3600 })}` }), null, 'a token from before a sign-out is refused');
});
