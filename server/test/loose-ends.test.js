// Loose ends, run locally (no database, no network): when an entry last came up (its own work,
// another entry's mention of it, or its name in a session's prep or recap), who is never a loose
// end (the Party, an entry whose story ended before canon), the route's ownership rule, the world
// setting that turns the list on (off until the DM asks), and the list's own choices in the client
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
const { looseEnds, names, plain, fold } = require('../lib/looseEnds');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-27T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * DAY);
const row = (id, title, touchedDaysAgo, more = {}) => ({
  id, title, category: 'person', visibility: 'shared', interior_map_id: null, touched: daysAgo(touchedDaysAgo), placed: 1, live: 1, ...more,
});
// the client's side of the list (client/src/utils/looseEnds.js)
const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'looseEnds.js')).href);

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

// ---- the word check in front of the pattern never changes an answer ----
const escapeForTest = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patternFor = (title) => {
  const t = title.trim().replace(/\s+/g, ' ');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeForTest(t)}(?=$|[^\\p{L}\\p{N}])`, 'iu');
};
const patternSays = (title, text) => patternFor(title).test(text);

test('every pair of letters the pattern counts as one case folds the same, and sits on the same side of a word edge', () => {
  // Every code point with any case behaviour. Two different code points can only count as one if at
  // least one of them changes when case folded, so the first check closes the list.
  const cased = [];
  for (let cp = 0; cp <= 0x10ffff; cp += 1) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const c = String.fromCodePoint(cp);
    if (/\p{Changes_When_Casefolded}|\p{Changes_When_Casemapped}/u.test(c)) cased.push(c);
  }
  const anyCased = new RegExp(`[${cased.map(escapeForTest).join('').replace(/[-/]/g, '\\$&')}]`, 'iu');
  const listed = new Set(cased);
  for (let cp = 0; cp <= 0x10ffff; cp += 1) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const c = String.fromCodePoint(cp);
    if (!listed.has(c)) assert.ok(!anyCased.test(c), `U+${cp.toString(16)} counts as a cased letter`);
  }
  const all = cased.join('');
  const edge = /^[^\p{L}\p{N}]$/iu;
  let joined = 0;
  for (const c of cased) {
    for (const [other] of all.matchAll(new RegExp(escapeForTest(c), 'giu'))) {
      if (other === c) continue;
      joined += 1;
      assert.strictEqual(fold(other), fold(c), `U+${other.codePointAt(0).toString(16)} and U+${c.codePointAt(0).toString(16)}`);
      assert.strictEqual(edge.test(other), edge.test(c), `U+${other.codePointAt(0).toString(16)} and U+${c.codePointAt(0).toString(16)} at a word edge`);
    }
  }
  assert.ok(joined > 2000, `checked ${joined} pairs`);
});

test('the rare Unicode cases read as the pattern reads them', () => {
  const pairs = [
    ['Stark', 'the ſtark lord'], // ſ is s
    ['Kyle', 'Kyle came'], // the Kelvin sign is k
    ['Kyle', 'kyle came'],
    ['Ångström', 'the Kngström ruler'], // the Angstrom sign is Å
    ['Σίσυφος', 'ο σίσυφοσ ήρθε'], // final and plain sigma
    ['ΣΊΣΥΦΟΣ', 'ο σίσυφος ήρθε'],
    ['Στρας', 'ΣΤΡΑΣ'],
    ['Ας', 'ασπίς'], // inside a longer word, so no
    ['Straße', 'die STRAẞE'], // ẞ is ß
    ['Straße', 'die STRASSE'], // the pattern's folding is one letter to one, so no
    ['µon', 'the μon'], // the micro sign is μ
    ['Ιωάννης', 'ο ιͅωάννης'],
    ['aιb', 'aͅb'], // a combining mark that folds to a letter
    ['Aldric', 'Aldricͅ stood'], // and so is no word edge
    ['ǅur', 'the ǆur and'],
    ['Stﬅ', 'the STﬆ'], // two ligatures that fold as one
    ['İstanbul', 'old i̇stanbul'], // no: dotted capital I has no plain fold
    ['İstanbul', 'old İstanbul'],
    ['Isle', 'the ısle'], // no: dotless i is its own letter
    ['𐐀lbin', 'and 𐐨lbin'], // beyond the basic plane
    ['Élodie', 'met élodie'], // no: the two spellings of é are different text, today too
    ['Cult (of) Ash?', 'the CULT (OF) ASH? returns'],
    ['???', 'who? ??? no'], // a title with no words at all
    ['Tom & Jerry', 'tom & jerry'],
    ['Ser Aldric', 'aldric, ser'], // every word is there, not in that order
    ['a a', 'xa a a'], // the fit at a word's start begins inside the first try
    ['aba', 'ababa'],
    ['aba', 'xaba aba'],
    ['𐐀 𐐀', 'x𐐀 𐐀 𐐀'], // the same, beyond the basic plane
    ['𐐨 𐐨', 'x𐐀 𐐀 𐐀'],
    ['Mill', '𐐀Mill'], // a letter beyond the basic plane is a letter
    ['Mill', 'Mill𐐀'],
    ['Mill', '😀Mill😀'], // an emoji is not
    ['Mill', '１Mill'], // nor is a wide digit an edge
    ['Mill', 'mill'],
    ['Mill', '(mill)'],
    ['(Mill)', '((mill))'],
    ['(Mill)', 'x(mill)y'],
    ['Mill.', 'the mill.'],
    ['Mill.', 'the mill.x'],
    ['-- --', 'a -- -- b'],
  ];
  for (const [title, text] of pairs) {
    assert.strictEqual(names(title, text), patternSays(title, text), `${title} in ${text}`);
  }
  assert.ok(names('Stark', 'the ſtark lord'), 'the check really does let ſ through');
  assert.ok(names('Σίσυφος', 'ο σίσυφοσ ήρθε'));
  assert.ok(!names('Στρας', 'στρασια'));
});

test('random titles and notes from the awkward letters: the same answer as the pattern alone', () => {
  const letters = ['s', 'S', 'ſ', 'k', 'K', 'K', 'å', 'Å', 'Å', 'σ', 'Σ', 'ς', 'ß', 'ẞ', 'µ', 'μ', 'ι', 'ͅ', 'ı', 'İ', 'i', 'I', 'ǆ', 'ǅ', 'ﬅ', 'ﬆ', 'a', 'b', '1', '𐐀', '𐐨'];
  const gaps = [' ', ' ', '-', "'", '(', '.'];
  let seed = 20261030;
  const next = (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 16) % n; };
  const few = ['a', 'b', '𐐀', ' '];
  const word = () => Array.from({ length: 1 + next(4) }, () => letters[next(letters.length)]).join('');
  const phrase = (n) => Array.from({ length: n }, (_, i) => (i ? gaps[next(gaps.length)] : '') + word()).join('');
  // a run of very few letters, for titles that overlap themselves in the note
  const run = (n) => Array.from({ length: n }, () => few[next(few.length)]).join('');
  let yes = 0;
  for (let i = 0; i < 1500; i += 1) {
    const small = run(3 + next(4));
    const bigger = `${run(next(3))}${small}${run(next(4))}${small}${run(next(3))}`;
    if (small.trim().replace(/\s+/g, ' ').length >= 3) assert.strictEqual(names(small, bigger), patternSays(small, bigger), JSON.stringify([small, bigger]));
    const title = phrase(1 + next(2));
    if (title.trim().replace(/\s+/g, ' ').length < 3) continue;
    // half the notes hold the title in some other case, so plenty of answers are yes
    const inNote = next(2) ? title.toUpperCase() : next(2) ? title.toLowerCase() : title;
    const text = `${phrase(1 + next(3))} ${next(2) ? inNote : ''} ${phrase(1 + next(3))}`.replace(/\s+/g, ' ').trim();
    const said = patternSays(title, text);
    if (said) yes += 1;
    assert.strictEqual(names(title, text), said, JSON.stringify([title, text]));
  }
  assert.ok(yes > 100, `${yes} yes answers`);
});

test('a big world gets the same list, far faster than the pattern alone', (t) => {
  const words = ['river', 'keep', 'stark', 'Baron', 'moon', 'gate', 'Élodie', 'ash', 'tower', 'road', 'Σίσυφος', 'mill', 'king', 'the', 'and', 'of', 'they', 'burned', 'found', 'lost'];
  const say = (i, n) => Array.from({ length: n }, (_, k) => words[(i * 7 + k * k * 3 + (i * k) % 11) % words.length]).join(' ');
  const rows = Array.from({ length: 150 }, (_, i) => row(i + 1, `${words[i % words.length]} Name${i}${i % 9 ? '' : ` ${words[(i + 3) % words.length]}`}`, 100 + i));
  const eras = Array.from({ length: 20 }, (_, i) => ({
    name: `Session ${i}`, start_time: i, created_at: daysAgo(90 - i),
    prep_note: `<p>${say(i, 150)} ${rows[i * 7].title}</p>`,
    recap_note: `<p>${say(i + 100, 150)} ${rows[i * 7 + 1].title.toUpperCase()}</p>`,
  }));
  const started = process.hrtime.bigint();
  const fast = looseEnds(rows, eras);
  const fastMs = Number(process.hrtime.bigint() - started) / 1e6;

  // the same walk with the pattern alone, as it was before the word check
  const slowStarted = process.hrtime.bigint();
  const notes = eras.map((e) => ({ ...e, prep: plain(e.prep_note), recap: plain(e.recap_note), at: new Date(e.created_at).getTime() }));
  const byPattern = new Map();
  for (const r of rows) {
    let named = null;
    const re = patternFor(r.title);
    for (const e of notes) {
      const note = re.test(e.recap) ? 'recap' : re.test(e.prep) ? 'prep' : null;
      if (note && (!named || e.at > named.at)) named = { era: e.name, note, at: e.at };
    }
    byPattern.set(r.id, named && { era: named.era, note: named.note });
  }
  const slowMs = Number(process.hrtime.bigint() - slowStarted) / 1e6;

  for (const e of fast) assert.deepStrictEqual(e.named, byPattern.get(e.id), e.title);
  assert.ok(fast.some((e) => e.named), 'some entries are named');
  t.diagnostic(`${fastMs.toFixed(1)} ms with the word check, ${slowMs.toFixed(1)} ms without`);
  assert.ok(fastMs * 3 < slowMs, `${fastMs.toFixed(1)} ms with the word check, ${slowMs.toFixed(1)} ms without`);
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

const said = (id, days, text) => ({ id, updated_at: daysAgo(days), text });

test("another entry's mention is when it came up: newer, reordered, off the quiet list", async () => {
  // the Mill's text is the newest thing written, so its own work is its last time up
  const rows = [row(1, 'Baron Vex', 100), row(4, 'Quiet Keep', 80), row(3, 'Lost Ring', 50), row(2, 'Old Mill', 10)];
  assert.deepStrictEqual(looseEnds(rows, []).map((e) => e.id), [1, 4, 3, 2]);
  const out = looseEnds(rows, [], { mentions: [
    said(2, 10, 'Word of @[Baron](node:1@37) from @[The Ring](node:3).'), // any name, and with a moment
    said(3, 50, 'An older one: @[Baron Vex](node:1).'),
  ] });
  const by = Object.fromEntries(out.map((e) => [e.id, e]));
  assert.strictEqual(by[1].lastUp, daysAgo(10).toISOString(), 'the latest mention wins, in any order');
  assert.strictEqual(by[3].lastUp, daysAgo(10).toISOString());
  assert.strictEqual(by[4].lastUp, daysAgo(80).toISOString(), 'nobody wrote of the Keep');
  assert.strictEqual(by[1].named, null, 'a mention is no session naming it');
  assert.deepStrictEqual(out.map((e) => e.id), [4, 1, 3, 2]);
  assert.deepStrictEqual(Object.keys(by[1]).sort(), ['category', 'hasInterior', 'id', 'lastUp', 'named', 'placed', 'title', 'visibility'], 'who wrote it stays out of the answer');

  const { quietEntries } = await load();
  const quiet = (entries) => quietEntries(entries, { now: NOW, days: 14, aside: {} }).shown.map((e) => e.id);
  assert.deepStrictEqual(quiet(looseEnds(rows, [])), [1, 4, 3]);
  assert.deepStrictEqual(quiet(out), [4], 'just written about: no longer a loose end');

  // an old mention never pulls an entry back past its own work
  const worked = looseEnds([row(1, 'Baron Vex', 2)], [], { mentions: [said(3, 10, '@[Baron Vex](node:1)')] })[0];
  assert.strictEqual(worked.lastUp, daysAgo(2).toISOString());
});

test('what is no mention of an entry does not bring it up', () => {
  const lastUp = (mentions) => looseEnds([row(1, 'Baron Vex', 100), row(2, 'Old Mill', 50)], [], { mentions }).find((e) => e.id === 1).lastUp;
  const before = daysAgo(100).toISOString();
  assert.strictEqual(lastUp([said(1, 1, 'Me again: @[Baron Vex](node:1) and @[Baron Vex](node:1@37).')]), before, 'its own text mentioning itself');
  assert.strictEqual(lastUp([said(1, 1, '@[Baron Vex](node:1)'), said(2, 60, '@[Baron Vex](node:1)')]), daysAgo(60).toISOString(), 'its own mention does not hide another entry’s');
  assert.strictEqual(lastUp([said(2, 1, '@[Baron Vex](node:'), said(2, 1, 'Baron Vex [x](node:1)'), said(2, 1, '')]), before, 'a broken mention, or the name in words, is text');
  assert.strictEqual(lastUp([said(2, 1, null), { id: 2, updated_at: null, text: '@[Baron Vex](node:1)' }]), before, 'no text, or no time for it');
  assert.strictEqual(lastUp([said(2, 1, '@[Someone else](node:99)')]), before, 'a mention of an entry not on the list is nobody’s');
});

test('a session naming an entry in plain words still counts, and the later of the two wins', () => {
  const eras = [{ name: 'Session 2', start_time: 20, created_at: daysAgo(30), prep_note: '', recap_note: '<p>Baron Vex fled.</p>' }];
  const rows = [row(1, 'Baron Vex', 100)];
  const named = { era: 'Session 2', note: 'recap' };
  const older = looseEnds(rows, eras, { mentions: [said(3, 60, '@[Baron Vex](node:1)')] })[0];
  assert.strictEqual(older.lastUp, daysAgo(30).toISOString(), 'the session is later');
  assert.deepStrictEqual(older.named, named);
  const newer = looseEnds(rows, eras, { mentions: [said(3, 5, '@[Baron Vex](node:1)')] })[0];
  assert.strictEqual(newer.lastUp, daysAgo(5).toISOString(), 'the mention is later');
  assert.deepStrictEqual(newer.named, named, 'and the list still says where it was last named');
});

// ---- the route: the caller's own world only, canon handed to the query only with the clock on ----
const WORLDS = { 7: { owner: 21, timeline_enabled: true, timeline_current_time: 37 }, 8: { owner: 21, timeline_enabled: false, timeline_current_time: 37 }, 9: { owner: 21, timeline_enabled: false, timeline_current_time: 37 } };
const TEXTS = { 9: [said(4, 2, 'Word of @[Baron Vex](node:1).')] };
let nodeQuery = null;
let mentionQueries = [];
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
  if (/FROM nodes n CROSS JOIN LATERAL/.test(s)) {
    mentionQueries.push({ sql: s, params });
    return { rows: TEXTS[params[0]] || [] };
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

test('the route reads mentions from the one world asked for, the same entries as the list, in one query', async () => {
  mentionQueries = [];
  const asked = await get(21, 9);
  assert.strictEqual(mentionQueries.length, 1, 'one query however many entries the world holds');
  assert.deepStrictEqual(mentionQueries[0].params, ['9']);
  const { sql } = mentionQueries[0];
  assert.match(sql, /WHERE n\.world_id = \$1 AND n\.category <> 'party' AND t\.text LIKE '%\]\(node:%'/, 'that world, the entries the list reads, and no other text leaves the database');
  for (const text of ['n.body', 'n.dm_note', 'f.body']) assert.ok(sql.includes(text), `reads ${text}`);
  assert.strictEqual(asked.body.entries.find((e) => e.id === 1).lastUp, daysAgo(2).toISOString(), 'the mention brought it up');

  // the same entry in another world's list: a mention in world 9 is nothing to world 8
  const other = await get(21, 8);
  assert.deepStrictEqual(mentionQueries[1].params, ['8']);
  assert.strictEqual(other.body.entries.find((e) => e.id === 1).lastUp, daysAgo(40).toISOString());

  mentionQueries = [];
  assert.strictEqual((await get(22, 9)).status, 404);
  assert.strictEqual(mentionQueries.length, 0, "someone else's world is never read");
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

// ---- the client's side of the list ----
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
