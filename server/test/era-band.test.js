// The players' era bar names each band by its rendered width (client/src/utils/eraBand.js): the
// longest form that fits, so a 375px phone goes to S7 early and a desktop keeps whole names.
// Ten footsteps a session, as at the table; the text is measured at a flat 6.3px a letter (the
// bar's 10.5px labels with their letter-spacing).
//
//   node --test server/test/era-band.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let bandLabel, textWidth;
test.before(async () => {
  ({ bandLabel, textWidth } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'eraBand.js')).href));
});

const measure = (s) => s.length * 6.3;
// a band of one session on a track `track` px wide, `sessions` sessions long (span = 10n - 1)
const band = (track, sessions) => track * (9 / (sessions * 10 - 1));
const label = (name, num, width) => bandLabel(name, num, width, measure);

test('a phone at seven sessions prints S7, not a clipped "Session 7"', () => {
  assert.deepEqual(label('Session 7', 7, band(355, 7)), { text: 'S7', tight: false });
});

test('a phone at thirteen sessions pares the padding: S9 still fits, S13 goes to 13', () => {
  assert.deepEqual(label('Session 9', 9, band(355, 13)), { text: 'S9', tight: true });
  assert.deepEqual(label('Session 13', 13, band(355, 13)), { text: '13', tight: true });
});

test('a band too narrow even for the number prints nothing', () => {
  assert.equal(label('Session 13', 13, 12), null);
});

test('a desktop keeps whole names while they fit, and S13 where they do not', () => {
  assert.deepEqual(label('Session 3 — The Drowned Bell', 3, band(900, 3)), { text: 'Session 3 — The Drowned Bell', tight: false });
  assert.deepEqual(label('Session 13', 13, band(900, 13)), { text: 'S13', tight: false });
});

test('a name with a subtitle drops the subtitle before it drops the word Session', () => {
  assert.deepEqual(label('Session 3 — The Drowned Bell', 3, 100), { text: 'Session 3', tight: false });
});

test('a lore era clips while three letters fit, then goes blank', () => {
  assert.deepEqual(label('The Long Winter', null, 60), { text: 'The Long Winter', tight: false });
  assert.deepEqual(label('The Long Winter — Before the Fall', null, 60), { text: 'The Long Winter', tight: false });
  assert.equal(label('The Long Winter', null, 30), null);
});

test('a track not measured yet prints the whole name, as the bar always did', () => {
  assert.deepEqual(label('Session 13', 13, 0), { text: 'Session 13', tight: false });
});

test('with no canvas the measure is an estimate, not a failure', () => {
  assert.ok(textWidth('S13', null) > 0);
});
