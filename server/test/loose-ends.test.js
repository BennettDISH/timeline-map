// Loose ends, run locally (no database, no network): when an entry last came up (its own work,
// or its name in a session's prep or recap), who is never a loose end (the Party, an entry whose
// story ended before canon), the route's ownership rule, the world setting that turns the list
// on (off until the DM asks), and the list's own choices in the client
// (how long is quiet, how it reads, "Not now"). The real SQL runs against the local stack in
// e2e/server.mjs.
//
//   node --test server/test/loose-ends.test.js
process.env.JWT_SECRET ||= 'loose-ends-test';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const express = require('express');
const { pathToFileURL } = require('node:url');
const pool = require('../config/database');
const { wp } = require('../config/auth');
const { looseEnds, names, plain } = require('../lib/looseEnds');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-27T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * DAY);
const row = (id, title, touchedDaysAgo, more = {}) => ({
  id, title, category: 'person', visibility: 'shared', interior_map_id: null, touched: daysAgo(touchedDaysAgo), placed: 1, live: 1, ...more,
});

test('a name is the whole title, any case, never inside a longer word', () => {
  assert.ok(names('Old Mill', 'they burned the old mill down'));
  assert.ok(names('The Keep', "at the Keep's gate"));
  assert.ok(names('Ser Aldric', 'Ser   Aldric'.replace(/\s+/g, ' ')));
  assert.ok(!names('Mill', 'Millbrook is quiet'));
  assert.ok(!names('Mill', 'the windmill'));
  assert.ok(names('Élodie', 'met élodie at dawn'), 'letters beyond ASCII count as letters');
  assert.ok(!names('Ox', 'the ox cart'), 'under three letters names nothing');
  assert.ok(!names('Untitled', 'Untitled'), 'a default title names nothing');
  assert.ok(!names('New entry', 'a new entry'));
  assert.ok(names('Cult (of) Ash?', 'the cult (of) ash? returns'), 'a title is text, never a pattern');
});

test('a session note is read as words: tags out, entities back', () => {
  assert.strictEqual(plain('<p>Tom &amp; Jerry</p><ul><li>the&nbsp;mill</li></ul>'), 'Tom & Jerry the mill');
  assert.ok(names('Tom & Jerry', plain('<p>Tom &amp; Jerry argued</p>')));
  assert.ok(names('the mill', plain('<b>the</b>&nbsp;mill')));
});

test('oldest first; the Party never; an entry whose story is over only with the clock on', () => {
  const rows = [
    row(1, 'Baron Vex', 40),
    row(2, 'The Party', 90, { category: 'party' }),
    row(3, 'Old Mill', 10, { category: 'place', interior_map_id: 9 }),
    row(4, 'Dead King', 200, { placed: 2, live: 0 }),
    row(5, 'Stray Note', 60, { placed: 0, live: 0, category: 'note', visibility: 'dm' }),
  ];
  const off = looseEnds(rows, []);
  assert.deepStrictEqual(off.map((e) => e.id), [4, 5, 1, 3]);
  const on = looseEnds(rows, [], { clockOn: true });
  assert.deepStrictEqual(on.map((e) => e.id), [5, 1, 3], 'every placement ended before canon: tied off already');
  const stray = on[0];
  assert.deepStrictEqual(stray, { id: 5, title: 'Stray Note', category: 'note', visibility: 'dm', hasInterior: false, placed: false,
    lastUp: daysAgo(60).toISOString(), named: null });
  assert.strictEqual(on[2].hasInterior, true);
});

test('a session that names an entry is when it came up; the latest one wins, a recap over a prep', () => {
  const eras = [
    { name: 'Session 1', start_time: 10, created_at: daysAgo(50), prep_note: '', recap_note: '<p>They met <b>Baron Vex</b>.</p>' },
    { name: 'Session 2', start_time: 20, created_at: daysAgo(30), prep_note: '<p>Bring back baron vex?</p>', recap_note: '<p>Baron Vex fled.</p>' },
    { name: 'Session 3', start_time: 30, created_at: daysAgo(5), prep_note: '<p>The Old Mill burns.</p>', recap_note: '' },
  ];
  const out = looseEnds([row(1, 'Baron Vex', 45), row(3, 'Old Mill', 20), row(6, 'Lost Ring', 35)], eras);
  const by = Object.fromEntries(out.map((e) => [e.id, e]));
  assert.deepStrictEqual(by[1].named, { era: 'Session 2', note: 'recap' });
  assert.strictEqual(by[1].lastUp, daysAgo(30).toISOString(), 'named in Session 2 beats an edit 45 days ago');
  assert.deepStrictEqual(by[3].named, { era: 'Session 3', note: 'prep' });
  assert.strictEqual(by[3].lastUp, daysAgo(5).toISOString());
  assert.strictEqual(by[6].named, null);
  assert.deepStrictEqual(out.map((e) => e.id), [6, 1, 3]);
  // a later edit is later than an old mention
  const edited = looseEnds([row(1, 'Baron Vex', 2)], eras)[0];
  assert.strictEqual(edited.lastUp, daysAgo(2).toISOString());
  assert.deepStrictEqual(edited.named, { era: 'Session 2', note: 'recap' }, 'the mention still says where it was last named');
});

// ---- the route: the caller's own world only, canon handed to the query only with the clock on ----
const WORLDS = { 7: { owner: 21, timeline_enabled: true, timeline_current_time: 37 }, 8: { owner: 21, timeline_enabled: false, timeline_current_time: 37 } };
let nodeQuery = null;
let worldUpdate = null;
pool.query = async (sql, params = []) => {
  const s = sql.trim();
  if (/FROM users WHERE id = \$1/.test(s)) return { rows: [{ id: params[0], central_user_id: 5000 + params[0], is_guest: false, username: 'dm', email: null, role: 'user', token_version: 0, unseen: false }] };
  if (/^SELECT 1 FROM worlds WHERE id=\$1 AND created_by=\$2/.test(s)) return { rows: WORLDS[params[0]]?.owner === params[1] ? [{}] : [] };
  if (/^SELECT timeline_enabled, timeline_current_time, LOCALTIMESTAMP AS now FROM worlds/.test(s)) return { rows: [{ ...WORLDS[params[0]], now: new Date(NOW) }] };
  if (/FROM nodes n WHERE n\.world_id = \$1 AND n\.category <> 'party'/.test(s)) {
    nodeQuery = { sql: s, params };
    return { rows: [row(1, 'Baron Vex', 40), row(4, 'Dead King', 200, { placed: 1, live: 0 })] };
  }
  if (/^SELECT name, start_time, prep_note, recap_note, created_at FROM eras/.test(s)) return { rows: [] };
  if (/^UPDATE worlds SET/.test(s)) { worldUpdate = { sql: s, params }; return { rows: [], rowCount: 1 }; }
  throw new Error(`unexpected query: ${s}`);
};

let base, server;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/atlas', require('../routes/atlas'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); pool.end().catch(() => {}); });
const get = async (userId, worldId) => {
  const r = await fetch(`${base}/api/atlas/worlds/${worldId}/loose-ends`, { headers: { cookie: `${wp.session.name}=${wp.session.mint({ id: userId })}` } });
  return { status: r.status, body: await r.json() };
};

test('the route: your own world only, and canon reaches the query only with the clock on', async () => {
  assert.strictEqual((await get(22, 7)).status, 404, "someone else's world is as if absent");
  assert.strictEqual((await fetch(`${base}/api/atlas/worlds/7/loose-ends`)).status, 401);

  const on = await get(21, 7);
  assert.strictEqual(on.status, 200);
  assert.deepStrictEqual(nodeQuery.params, ['7', 37]);
  assert.deepStrictEqual(on.body.entries.map((e) => e.id), [1], 'Dead King ended before canon');
  assert.strictEqual(on.body.now, new Date(NOW).toISOString(), "now is the database's clock, read like the stored timestamps");

  const off = await get(21, 8);
  assert.deepStrictEqual(nodeQuery.params, ['8', null]);
  assert.deepStrictEqual(off.body.entries.map((e) => e.id), [4, 1], 'with no clock, nothing is over');
});

test('the list is a world setting the DM turns on and off; anything but true or false is a 400', async () => {
  const patch = (body) => fetch(`${base}/api/atlas/worlds/7`, {
    method: 'PATCH', body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', cookie: `${wp.session.name}=${wp.session.mint({ id: 21 })}` },
  });
  assert.strictEqual((await patch({ loose_ends: true })).status, 200);
  assert.strictEqual(worldUpdate.sql, 'UPDATE worlds SET loose_ends=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2');
  assert.deepStrictEqual(worldUpdate.params, [true, '7']);
  await patch({ loose_ends: false });
  assert.deepStrictEqual(worldUpdate.params, [false, '7']);
  worldUpdate = null;
  const bad = await patch({ loose_ends: 'yes' });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual((await bad.json()).message, 'Loose ends are on or off');
  assert.strictEqual(worldUpdate, null, 'nothing written');
});

// ---- the client's side of the list (client/src/utils/looseEnds.js) ----
const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'looseEnds.js')).href);

test('a quiet spell reads in plain words', async () => {
  const { quietFor } = await load();
  assert.strictEqual(quietFor(3 * 60 * 60 * 1000), 'less than a day');
  assert.strictEqual(quietFor(DAY), 'a day');
  assert.strictEqual(quietFor(9 * DAY), '9 days');
  assert.strictEqual(quietFor(15 * DAY), '2 weeks');
  assert.strictEqual(quietFor(59 * DAY), '8 weeks');
  assert.strictEqual(quietFor(75 * DAY), '2 months');
  assert.strictEqual(quietFor(400 * DAY), 'a year');
  assert.strictEqual(quietFor(800 * DAY), '2 years');
});

test('the list shows what is quiet long enough; Not now holds until it comes up or stays quiet another spell', async () => {
  const { quietEntries, whyLine } = await load();
  const e = (id, d, more = {}) => ({ id, title: `E${id}`, lastUp: daysAgo(d).toISOString(), placed: true, named: null, ...more });
  const entries = [e(1, 100), e(2, 40), e(3, 20), e(4, 3)];
  const ids = (x) => x.map((y) => y.id);
  assert.deepStrictEqual(ids(quietEntries(entries, { now: NOW, days: 14, aside: {} }).shown), [1, 2, 3]);
  assert.deepStrictEqual(ids(quietEntries(entries, { now: NOW, days: 30, aside: {} }).shown), [1, 2]);

  // set aside 5 days ago: hidden for a 14-day spell, back once 14 days pass
  const aside = { 2: NOW - 5 * DAY };
  const r = quietEntries(entries, { now: NOW, days: 14, aside });
  assert.deepStrictEqual([ids(r.shown), ids(r.hidden)], [[1, 3], [2]]);
  assert.deepStrictEqual(ids(quietEntries(entries, { now: NOW + 10 * DAY, days: 14, aside }).hidden), []);
  // it came up after it was set aside (then went quiet again): it is back
  const later = [e(2, 20)]; // lastUp 20 days ago, set aside 25 days ago
  assert.deepStrictEqual(ids(quietEntries(later, { now: NOW, days: 14, aside: { 2: NOW - 25 * DAY } }).shown), [2]);

  assert.strictEqual(whyLine(e(5, 35, { named: { era: 'Session 4', note: 'recap' } }), NOW), 'quiet 5 weeks · last named in Session 4’s recap');
  assert.strictEqual(whyLine(e(6, 100, { placed: false }), NOW), 'quiet 3 months · on no map');
});
