// @-mentions, run locally (no database, no network): the pattern the client writes and both sides
// read, what players get (a mention of something they may not know becomes its name, and no
// moment leaves), the picker's search and insert, and locate's ?t= (a mention's moment) putting
// the placement standing then first. The share API's rewrite runs against the local stack in
// e2e/server.mjs.
//
//   node --test server/test/mentions.test.js
process.env.JWT_SECRET ||= 'mentions-test';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const express = require('express');
const { pathToFileURL } = require('node:url');
const pool = require('../config/database');
const { wp } = require('../config/auth');
const { mentionIds, plainMentions, mentionsForPlayers } = require('../lib/mentions');

let client;
test.before(async () => {
  client = await import(pathToFileURL(path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'mentions.js')).href);
});

const TEXT = 'They met @[Baron Vex](node:12@37) at @[The Old Mill](node:4), then @[Baron Vex](node:12@40) fled. Mail me@host.';

test('the server reads what the client writes', () => {
  assert.deepStrictEqual(mentionIds(TEXT), [12, 4]);
  assert.strictEqual(plainMentions(TEXT), 'They met Baron Vex at The Old Mill, then Baron Vex fled. Mail me@host.');
  assert.deepStrictEqual(mentionIds('@[Half](node:'), [], 'a broken mention is text');
  assert.strictEqual(plainMentions(null), null);
  const token = client.mentionToken('Baron Vex', 12, 37);
  assert.deepStrictEqual(mentionIds(`a ${token} b`), [12], 'a token the client writes is one the server finds');
});

test('players get a mention only of what they may know exists, and never its moment', () => {
  const out = mentionsForPlayers(TEXT, new Set([4]));
  assert.strictEqual(out, 'They met Baron Vex at @[The Old Mill](node:4), then Baron Vex fled. Mail me@host.');
  assert.ok(!/node:12|@37|@40/.test(out), 'no id or moment of the hidden entry');
  assert.strictEqual(mentionsForPlayers('@[The Old Mill](node:4@99)', new Set([4])), '@[The Old Mill](node:4)', "the DM's lens stays home");
  assert.strictEqual(mentionsForPlayers(null, new Set()), null);
});

test('the client splits text into words and mentions, and lists each mention once', () => {
  const parts = client.splitMentions(TEXT);
  assert.deepStrictEqual(parts.filter((p) => typeof p !== 'string'), [
    { name: 'Baron Vex', id: 12, t: 37 }, { name: 'The Old Mill', id: 4, t: null }, { name: 'Baron Vex', id: 12, t: 40 }]);
  assert.strictEqual(parts.map((p) => (typeof p === 'string' ? p : p.name)).join(''), client.plainMentions(TEXT));
  assert.deepStrictEqual(client.mentionsIn(`${TEXT} @[Baron Vex](node:12@37)`).map((m) => `${m.id}@${m.t}`), ['12@37', '4@null', '12@40']);
  assert.deepStrictEqual(client.splitMentions(''), []);
  assert.deepStrictEqual(client.splitMentions(null), []);
});

test("a pick writes a token a name can't break, with a whole moment", () => {
  assert.strictEqual(client.mentionToken('Baron Vex', 12), '@[Baron Vex](node:12)');
  assert.strictEqual(client.mentionToken('Baron Vex', 12, 36.6), '@[Baron Vex](node:12@37)');
  assert.strictEqual(client.mentionToken('Year -40', 3, -40), '@[Year -40](node:3@-40)');
  assert.strictEqual(client.mentionToken('The [Sealed]\nVault', 5), '@[The [Sealed Vault](node:5)');
  assert.deepStrictEqual(mentionIds(client.mentionToken('The [Sealed]\nVault', 5)), [5]);
  assert.strictEqual(client.mentionToken('', 6), '@[Untitled](node:6)');
});

test('the @ search: where it opens and where it stays text', () => {
  const q = (s) => client.atQuery(s, s.length);
  assert.deepStrictEqual(q('@'), { start: 0, query: '' });
  assert.deepStrictEqual(q('met @Bar'), { start: 4, query: 'Bar' });
  assert.deepStrictEqual(q('met @Baron V'), { start: 4, query: 'Baron V' }, 'a name has spaces');
  assert.deepStrictEqual(q('(@Old'), { start: 1, query: 'Old' });
  assert.strictEqual(q('mail@host'), null, 'inside a word it is text');
  assert.strictEqual(q('@Baron  V'), null, 'two spaces end it');
  assert.strictEqual(q('@ Baron'), null);
  assert.strictEqual(q('@Baron\nV'), null);
  assert.strictEqual(q(`@${'x'.repeat(41)}`), null);
  assert.strictEqual(q('@[Baron Vex](node:12@37) '), null, 'a written mention is not a search');
  assert.strictEqual(client.atQuery('met @Bar and more', 8).query, 'Bar', 'the caret decides, not the end of the text');
});

test('a pick replaces the @search with the token and a space', () => {
  const tok = '@[Baron Vex](node:12)';
  assert.deepStrictEqual(client.insertMention('met @Bar', 4, 8, tok), { text: `met ${tok} `, caret: 4 + tok.length + 1 });
  const r = client.insertMention('met @Bar today', 4, 8, tok);
  assert.strictEqual(r.text, `met ${tok} today`, 'no second space before one already there');
});

test('the picker lists names that start with the search first, then names that hold it', () => {
  const nodes = [
    { id: 1, title: 'The Old Mill' }, { id: 2, title: 'Old Tom' }, { id: 3, title: 'Mill Pond' }, { id: 4, title: 'Oldbury' },
    { id: 5, title: 'The Party', category: 'party' }, { id: 6, title: 'Cold Hollow' },
  ];
  assert.deepStrictEqual(client.rankEntries(nodes, 'old').map((n) => n.id), [2, 4, 6, 1]);
  assert.deepStrictEqual(client.rankEntries(nodes, 'old', { exclude: 2 }).map((n) => n.id), [4, 6, 1], 'not the entry being written');
  assert.deepStrictEqual(client.rankEntries(nodes, 'party').map((n) => n.id), [5], 'the Party can be named: its moment finds the footstep');
  assert.strictEqual(client.rankEntries(nodes, '', { limit: 3 }).length, 3);
});

// ---- locate ?t=: the placement standing at the moment first, then the map the DM is on ----
let locateQuery = null;
pool.query = async (sql, params = []) => {
  const s = sql.trim();
  if (/FROM users WHERE id = \$1/.test(s)) return { rows: [{ id: params[0], central_user_id: 5000 + params[0], is_guest: false, username: 'dm', email: null, role: 'user', token_version: 0, unseen: false }] };
  if (/^SELECT world_id FROM nodes WHERE id=\$1/.test(s)) return { rows: [{ world_id: 7 }] };
  if (/^SELECT 1 FROM worlds WHERE id=\$1 AND created_by=\$2/.test(s)) return { rows: params[1] === 21 ? [{}] : [] };
  if (/^SELECT interior_map_id FROM nodes/.test(s)) return { rows: [{ interior_map_id: null }] };
  if (/^SELECT id, map_id FROM placements WHERE node_id=\$1/.test(s)) { locateQuery = { sql: s, params }; return { rows: [{ id: 50, map_id: 9 }] }; }
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
const locate = async (qs) => {
  const r = await fetch(`${base}/api/atlas/nodes/12/locate${qs}`, { headers: { cookie: `${wp.session.name}=${wp.session.mint({ id: 21 })}` } });
  return { status: r.status, body: await r.json() };
};

test('locate takes a moment: the placement standing then comes first; a bad moment is a 400', async () => {
  const a = await locate('?map=3&t=37');
  assert.strictEqual(a.status, 200);
  assert.deepStrictEqual(locateQuery.params, ['12', 3, 37]);
  assert.match(locateQuery.sql, /ORDER BY \(\$3::int IS NULL OR .*start_time <= \$3::int.*end_time >= \$3::int.*\) DESC,\s*\(map_id = \$2\) DESC/s);
  assert.deepStrictEqual(a.body, { mapId: 9, placementId: 50, interiorMapId: null });
  await locate('');
  assert.deepStrictEqual(locateQuery.params, ['12', null, null], 'no moment: as before');
  const bad = await locate('?t=2.5');
  assert.strictEqual(bad.status, 400);
  assert.match(bad.body.message, /whole number/);
});
