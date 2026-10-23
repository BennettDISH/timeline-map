// The embed contract, run locally (no database, no network past this machine): the Player
// View may be framed by Spellforge at either of its addresses, and the DM app by nobody. The
// live check of the same headers is in share-live.test.js.
//
//   node --test server/test/embed.test.js
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { securityHeaders, embedOrigins } = require('../lib/security');

async function headersOf(env, paths) {
  const app = express();
  app.use(securityHeaders(env));
  app.use((req, res) => res.send('ok'));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    const out = {};
    for (const p of paths) {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${p}`);
      out[p] = { csp: res.headers.get('content-security-policy') || '', xfo: res.headers.get('x-frame-options') };
    }
    return out;
  } finally {
    server.close();
  }
}
const ancestors = (csp) => (csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('frame-ancestors')) || '').split(/\s+/).slice(1);

test('Spellforge frames the Player View from its railway.app name and from the front door', async () => {
  const h = await headersOf({}, ['/p/tok', '/p', '/p/tok/m/12']);
  for (const [p, { csp, xfo }] of Object.entries(h)) {
    assert.deepStrictEqual(ancestors(csp), ["'self'", 'https://spellforge-production-1695.up.railway.app', 'https://spellforge.bennettdishman.com'], p);
    assert.strictEqual(xfo, null, `${p}: no X-Frame-Options (it cannot express an allowlist)`);
  }
});

test('the DM app is framed by nobody, whatever EMBED_ORIGINS says', async () => {
  const h = await headersOf({ EMBED_ORIGINS: 'https://elsewhere.example' }, ['/dashboard', '/w/1', '/pizza', '/api/share/x']);
  for (const [p, { csp, xfo }] of Object.entries(h)) {
    assert.deepStrictEqual(ancestors(csp), ["'self'"], p);
    assert.strictEqual((xfo || '').toUpperCase(), 'SAMEORIGIN', p);
  }
});

test('EMBED_ORIGINS, when set, is the whole allowlist; blank keeps the default', async () => {
  assert.deepStrictEqual(embedOrigins({ EMBED_ORIGINS: ' https://a.example , https://b.example ' }), ['https://a.example', 'https://b.example']);
  assert.deepStrictEqual(embedOrigins({ EMBED_ORIGINS: ' , ' }), embedOrigins({}));
  const h = await headersOf({ EMBED_ORIGINS: 'https://a.example' }, ['/p/tok']);
  assert.deepStrictEqual(ancestors(h['/p/tok'].csp), ["'self'", 'https://a.example']);
});
