// The Forge contract's validator, run locally (no database, no network): a mind that
// returns null or bare-string entries gets validator errors, never a crash.
//
//   node --test server/test/contract.test.js
const test = require('node:test');
const assert = require('node:assert');
const { validateBatch } = require('../forge/contract');

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
