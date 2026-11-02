// The editor's warning under the description box (client/src/utils/timeline.js): it appears only
// when a period text with words in it covers the lens moment or canon, and it names that period.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let warn, coveringFact;
const span = (f) => `${f.start ?? '…'}–${f.end ?? '…'}`;
test.before(async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'timeline.js')).href);
  coveringFact = mod.coveringFact;
  warn = (facts, lens, canon) => mod.descriptionWarning(facts, lens, canon, span);
});

const fact = (id, start, end, body = 'They walk the old road.') => ({ id, start, end, body });

test('no period text, no warning', () => {
  assert.equal(warn([], 10, 37), null);
  assert.equal(warn(undefined, 10, 37), null);
});

test('a period elsewhere on the clock hides nothing at these moments', () => {
  assert.equal(warn([fact(1, 0, 5)], 10, 37), null);
  assert.equal(warn([fact(1, 40, null)], 10, 37), null);
});

test('a blank period is no story yet, whatever it covers', () => {
  assert.equal(warn([fact(1, null, null, '')], 10, 37), null);
  assert.equal(warn([fact(1, null, null, '   \n')], 10, 37), null);
  assert.equal(warn([fact(1, null, null, null)], 10, 37), null);
});

test('a period at the lens only', () => {
  const w = warn([fact(1, 5, 15)], 10, 37);
  assert.match(w, /at this moment \(5–15\)\./);
  assert.doesNotMatch(w, /canon/);
  assert.match(w, /Changes here won't show there\.$/);
});

test('a period at canon only', () => {
  const w = warn([fact(1, 30, null)], 10, 37);
  assert.match(w, /at canon \(30–…\)\./);
  assert.doesNotMatch(w, /this moment/);
});

test('one period at both moments is named once', () => {
  assert.match(warn([fact(1, null, null)], 10, 37), /at this moment and canon \(…–…\)\./);
});

test('two periods name each moment', () => {
  assert.match(warn([fact(1, 5, 15), fact(2, 30, null)], 10, 37), /at this moment \(5–15\) and canon \(30–…\)\./);
});

test('it names the period that wins, the same one the reader shows', () => {
  const facts = [fact(1, 0, null, 'old'), fact(2, 8, null, 'new'), fact(3, 9, null, '')];
  assert.equal(coveringFact(facts, 10).id, 2);
  assert.match(warn(facts, 10, 10), /\(8–…\)/);
});

test('a world with no canon yet warns about the lens alone', () => {
  assert.match(warn([fact(1, -5, 5)], 3, null), /at this moment \(-5–5\)\./);
  assert.equal(warn([fact(1, -5, 5)], 10, null), null);
});
