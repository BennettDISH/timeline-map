// The Forge, run locally (no database, no network): a mind that returns null or bare-string
// entries gets validator errors, never a crash; and the DM's session notes reach the mind as
// plain text, newest session first, within their budget.
//
//   node --test server/test/contract.test.js
const test = require('node:test');
const assert = require('node:assert');
const { validateBatch } = require('../forge/contract');
const { noteText, sessionNotes, NOTES_BUDGET } = require('../forge/notes');

test('a rich note reads as plain text: headings, bullets, paragraphs, entities', () => {
  const t = noteText('<h4>Where everyone is</h4><ul><li><b>The party:</b> on the slipway</li><li>Tommen &amp; Riven</li></ul><p>Morvath &lt;3 the ring</p>');
  assert.strictEqual(t, '## Where everyone is\n\n- The party: on the slipway\n- Tommen & Riven\n\nMorvath <3 the ring');
  assert.strictEqual(noteText('plain line one\nline two'), 'plain line one\nline two');
  assert.strictEqual(noteText(null), '');
});
test('session notes come newest first, a prep marked as no canon, and nothing when there are none', async () => {
  const rows = [
    { name: 'Session 4', start_time: 40, end_time: 49, prep_note: '<p>Elowen tonight</p>', recap_note: '' },
    { name: 'Session 3 — The Lantern Room', start_time: 30, end_time: 39, prep_note: null, recap_note: '<p>Celeste listened</p>' },
  ];
  const db = (r) => ({ query: async (sql, params) => { assert.match(sql, /ORDER BY start_time DESC/); assert.deepStrictEqual(params, [29]); return { rows: r }; } });
  const s = await sessionNotes(29, db(rows));
  assert.ok(s.startsWith("THE DM'S SESSION NOTES"), s);
  assert.ok(s.indexOf('== Session 4 (40–49) ==') < s.indexOf('== Session 3 — The Lantern Room (30–39) =='));
  assert.match(s, /PREP — the DM's plan before it was played \(possibilities, not canon\):\nElowen tonight/);
  assert.match(s, /RECAP — what happened at the table:\nCeleste listened/);
  assert.strictEqual(await sessionNotes(29, db([])), '');
});
test('the notes stay within their budget and say what was left out', async () => {
  const big = `<p>${'x'.repeat(NOTES_BUDGET)}</p>`;
  const db = { query: async () => ({ rows: [
    { name: 'Session 3', start_time: 30, end_time: 39, prep_note: '', recap_note: big },
    { name: 'Session 2', start_time: 20, end_time: 29, prep_note: '', recap_note: '<p>small</p>' },
    { name: 'Session 1', start_time: 10, end_time: 19, prep_note: '', recap_note: '<p>small</p>' },
  ] }) };
  const s = await sessionNotes(29, db);
  assert.match(s, /2 older sessions not shown/);
  assert.match(s, /\[… cut short\]$/);
  assert.ok(!s.includes('Session 2'));
  assert.ok(s.length < NOTES_BUDGET + 400, `${s.length}`);
});

const world = { timeline_min_time: 0, timeline_max_time: 100 };
const shapes = [
  { nodes: ['The Old Mill'] },
  { nodes: [null] },
  { nodes: [{ key: 'a', title: 'A', placements: [null] }] },
  { nodes: [{ key: 'a', title: 'A', facts: ['x'] }] },
  { images: [null] }, { links: [null] }, { asks: [null] }, { maps: [null] }, { eras: [null] }, { backdrops: [null] },
  { enrich: [null] }, { enrich: [{ node: 1, place: [null], facts: ['x'] }] }, { enrich_maps: [null] },
];
test('null and bare-string entries are validator errors, not throws', () => {
  for (const b of shapes) {
    let errs;
    assert.doesNotThrow(() => { errs = validateBatch(b, world); }, JSON.stringify(b));
    assert.ok(errs.length > 0, `should complain about ${JSON.stringify(b)}`);
  }
});
test('a sound batch still validates clean', () => {
  const b = { summary: 'ok', nodes: [{ key: 'n1', title: 'A place', category: 'place', placements: [{ map: 1, x: 10, y: 10 }] }] };
  assert.deepEqual(validateBatch(b, world), []);
  assert.equal(b.nodes[0].placements.length, 1);
});
