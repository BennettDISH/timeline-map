// The spend guard's rules, run locally (no database, no network): which cap applies to whom, how
// the settings are read, and the sentences a refused DM reads. The counting itself runs against
// a real database in e2e/server.mjs (the local stack's stubbed paid server).
//
//   node --test server/test/spend.test.js
const test = require('node:test');
const assert = require('node:assert');
const { setting, limitsFor, refusalText, paintingsText, untilReset, KINDS } = require('../lib/spend');

test('an account, a guest and an admin each get their own limits, defaults first', () => {
  const env = {};
  assert.deepStrictEqual(limitsFor({ id: 1 }, 'forge', env), { cap: KINDS.forge.defaults.cap, ceiling: KINDS.forge.defaults.ceiling, admin: false, guest: false });
  assert.deepStrictEqual(limitsFor({ id: 2, is_guest: true }, 'forge', env), { cap: KINDS.forge.defaults.guest, ceiling: KINDS.forge.defaults.ceiling, admin: false, guest: true });
  assert.deepStrictEqual(limitsFor({ id: 3, isAdmin: true }, 'voice', env), { cap: null, ceiling: null, admin: true });
  assert.ok(KINDS.forge.defaults.guest < KINDS.forge.defaults.cap && KINDS.voice.defaults.guest < KINDS.voice.defaults.cap, 'guests get much less');
});

test('the settings are whole numbers; blank keeps the default and a typo never opens the tap', () => {
  const env = { FORGE_DAILY_CAP: '7', FORGE_DAILY_CAP_GUEST: '0', FORGE_DAILY_CEILING: ' 30 ', VOICE_DAILY_CAP: '', VOICE_DAILY_CAP_GUEST: 'lots', VOICE_DAILY_CEILING: '-1' };
  assert.deepStrictEqual(limitsFor({ id: 1 }, 'forge', env), { cap: 7, ceiling: 30, admin: false, guest: false });
  assert.strictEqual(limitsFor({ id: 2, is_guest: true }, 'forge', env).cap, 0);
  assert.deepStrictEqual(limitsFor({ id: 1 }, 'voice', env), { cap: KINDS.voice.defaults.cap, ceiling: KINDS.voice.defaults.ceiling, admin: false, guest: false });
  assert.strictEqual(limitsFor({ id: 2, is_guest: true }, 'voice', env).cap, KINDS.voice.defaults.guest);
  assert.strictEqual(setting('X', 5, { X: '2.5' }), 5);
});

test('each refusal is one plain sentence that says when the uses come back', () => {
  const at = new Date('2026-10-19T19:10:00Z'); // 4 h 50 min to midnight UTC
  assert.strictEqual(untilReset(at), 'midnight UTC, in about 5 hours');
  assert.strictEqual(untilReset(new Date('2026-10-19T23:40:00Z')), 'midnight UTC, in under an hour');
  assert.strictEqual(untilReset(new Date('2026-10-19T22:50:00Z')), 'midnight UTC, in about an hour');
  assert.strictEqual(refusalText('forge', 'account', 40, at), "You've used today's 40 Forge uses (chat turns and paintings) — they come back at midnight UTC, in about 5 hours");
  assert.strictEqual(refusalText('voice', 'guest', 1, at), "Guests get 1 voice recording a day, and today's are used — they come back at midnight UTC, in about 5 hours");
  assert.strictEqual(refusalText('forge', 'ceiling', 150, at), 'The Forge has reached its daily limit for everyone — it opens again at midnight UTC, in about 5 hours');
  assert.strictEqual(refusalText('voice', 'closed', 'guest', at), 'Voice is not open to guests — sign in with an account to use it');
  assert.strictEqual(refusalText('forge', 'closed', 'account', at), 'The Forge is not open to this account');
  for (const s of [refusalText('forge', 'account', 40, at), refusalText('voice', 'ceiling', 9, at)]) assert.ok(!s.endsWith('.'), 'a one-sentence flash has no trailing period');
});

test('a call too big for what is left says its size and what is left, not "you\'ve used today\'s"', () => {
  const at = new Date('2026-10-19T19:10:00Z');
  const MB = 1024;
  // a world copy of 300 MB of art with 230 MB of the day's 250 still unused
  assert.strictEqual(refusalText('upload', 'account', 250 * MB, at, { wanted: 300 * MB, left: 230 * MB }),
    "This needs 300 MB, but only 230 MB of today's 250 MB of uploads are left — try something smaller, or again at midnight UTC, in about 5 hours");
  // under a megabyte reads in KB, never "0 MB"
  assert.strictEqual(refusalText('upload', 'guest', MB, at, { wanted: 600, left: 424 }),
    "This needs 600 KB, but only 424 KB of today's 1 MB of uploads are left — try something smaller, or again at midnight UTC, in about 5 hours");
  // with nothing left it is the day that's used, as before
  assert.match(refusalText('upload', 'account', 250 * MB, at, { wanted: 300 * MB, left: 0 }), /^You've used today's 250 MB of uploads \(images\)/);
  assert.strictEqual(refusalText('upload', 'account', 250 * MB, at), refusalText('upload', 'account', 250 * MB, at, { wanted: 1, left: 0 }));
});

test('a proposal that wants too many paintings says how many are left', () => {
  const at = new Date('2026-10-19T19:10:00Z');
  assert.strictEqual(paintingsText(1, 3, at), 'this proposal wanted 3 paintings and only 1 Forge use is left today — ask for fewer, or try again after midnight UTC, in about 5 hours');
  assert.strictEqual(paintingsText(2, 5, at), 'this proposal wanted 5 paintings and only 2 Forge uses are left today — ask for fewer, or try again after midnight UTC, in about 5 hours');
  assert.strictEqual(paintingsText(0, 1, at), "this proposal wanted 1 painting and today's Forge uses are spent — they come back at midnight UTC, in about 5 hours");
});

// What a DM is told before a daily allowance runs out (client/src/utils/allowance.js), and that the
// count behind it is the signed-in account's own.
{
  const assert = require('node:assert/strict');
  const { pathToFileURL } = require('node:url');
  const path = require('node:path');
  const spend = require('../lib/spend');
  const { CAPS } = require('../forge/contract');
  let forgeLine, voiceLine, uploadLine, markersLine;
  test.before(async () => {
    ({ forgeLine, voiceLine, uploadLine, markersLine } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'allowance.js')).href));
  });
  const of = (limit, used, left = limit - used) => ({ limit, used, left, resetsAt: '2026-11-03T00:00:00.000Z' });
  const PER = 1 + CAPS.images;

  test('one message can use the turn and every painting a proposal may hold', () => assert.equal(PER, 9));

  test('the Forge says nothing while there is plenty', () => {
    assert.equal(forgeLine(of(40, 0), PER), null);
    assert.equal(forgeLine(of(40, 31), PER), null, 'just under 80%, with room for the largest message');
  });

  test('the Forge shows the count from about 80% used, and warns when a message may cost more than is left', () => {
    const at80 = forgeLine(of(40, 32), PER);
    assert.match(at80.text, /^8 of 40 left today\. One message can use up to 9: one, plus one for each painting\.$/);
    assert.equal(at80.warn, true);
    // a larger allowance reaches 80% with room for a message: the count alone, still a warning colour
    assert.deepEqual(forgeLine(of(100, 80), PER), { text: '20 of 100 left today', warn: true });
  });

  test("a guest's 5 warn from the first message, since one message could spend them all", () => {
    const g = forgeLine(of(5, 0), PER);
    assert.match(g.text, /^5 of 5 left today\. One message can use up to 9/);
    assert.equal(g.warn, true);
  });

  test('voice always shows its count, and warns from about 80% used', () => {
    assert.deepEqual(voiceLine(of(20, 0)), { text: '20 of 20 left today', warn: false });
    assert.deepEqual(voiceLine(of(20, 15)), { text: '5 of 20 left today', warn: false });
    assert.deepEqual(voiceLine(of(20, 16)), { text: '4 of 20 left today', warn: true });
    assert.deepEqual(voiceLine(of(3, 1)), { text: '2 of 3 left today', warn: false }, 'a guest gets theirs');
  });

  test('at the cap it says when they come back', () => {
    for (const line of [forgeLine(of(40, 40), PER), voiceLine(of(20, 20))]) {
      assert.match(line.text, /^0 of \d+ left today\. They come back at midnight UTC\.$/);
      assert.equal(line.warn, true);
    }
  });

  test('used past a limit that was lowered never reads as a negative count', () => {
    assert.match(voiceLine({ limit: 5, used: 9, left: 0 }).text, /^0 of 5 left today/);
  });

  test("the count is this account's own, and everyone's ceiling gets words with no number in them", () => {
    // 10 used of 40 with 6 left for everyone together: the count says 30, not 6
    const crowded = forgeLine({ limit: 40, used: 10, left: 6 }, PER);
    assert.match(crowded.text, /^30 of 40 left today\. The Forge is close to its daily limit for everyone, so you may get fewer\./);
    assert.doesNotMatch(crowded.text, /\b6\b/);
    assert.equal(crowded.warn, true);
    const shut = voiceLine({ limit: 20, used: 2, left: 0 });
    assert.equal(shut.text, 'Voice has reached its daily limit for everyone. It opens again at midnight UTC.');
    assert.doesNotMatch(shut.text, /\d+ of/);
  });

  test('an admin, a closed account and a missing allowance', () => {
    for (const line of [forgeLine, voiceLine]) {
      assert.equal(line({ limit: null, used: 12, left: null }, PER), null, 'an admin has no limit to warn about');
      assert.equal(line(null, PER), null, 'a database blip says nothing');
      assert.equal(line(undefined, PER), null);
      assert.equal(line(of(0, 0), PER).warn, true);
      assert.match(line(of(0, 0), PER).text, /isn't open to this account$/);
    }
  });

  test("the allowance counts only the signed-in account's row, and asks for no one else's", async () => {
    const asked = [];
    const db = { query: async (sql, args) => {
      asked.push(args);
      return { rows: [{ user_id: 7, used: 3 }, { user_id: 0, used: 100 }, { user_id: 8, used: 39 }] };
    } };
    const mine = await spend.allowance({ id: 7 }, 'forge', db);
    assert.equal(mine.used, 3, 'not everyone together, and not another account that happens to come back');
    assert.equal(mine.limit, 40);
    assert.equal(mine.left, 37);
    assert.deepEqual(asked[0][2], [7, 0], 'only this account and the ceiling are read');
    const guest = await spend.allowance({ id: 7, is_guest: true }, 'voice', db);
    assert.deepEqual([guest.limit, guest.used, guest.left], [3, 3, 0], 'a guest gets the guest cap');
    const admin = await spend.allowance({ id: 7, isAdmin: true }, 'forge', db);
    assert.deepEqual([admin.limit, admin.left, admin.used], [null, null, 3]);
  });

  test("the image picker says what's left of the day's uploads from about 80% used, in MB or KB", () => {
    const MB = 1024;
    assert.equal(uploadLine(of(250 * MB, 199 * MB)), null, 'under 80%: nothing');
    assert.deepEqual(uploadLine(of(250 * MB, 200 * MB)), { text: "50 MB of today's 250 MB of uploads left. They come back at midnight UTC.", warn: true });
    assert.equal(uploadLine(of(MB, 1000)).text, "24 KB of today's 1 MB of uploads left. They come back at midnight UTC.");
    assert.deepEqual(uploadLine(of(250 * MB, 250 * MB)), { text: "Today's 250 MB of uploads are used. They come back at midnight UTC.", warn: true });
    // everyone's ceiling: shown at once, and the count is no more than everyone has left
    assert.equal(uploadLine({ limit: 250 * MB, used: 0, left: 30 * MB }).text, "30 MB of today's 250 MB of uploads left. They come back at midnight UTC.");
    assert.match(uploadLine({ limit: 250 * MB, used: 0, left: 0 }).text, /^Uploading has reached its daily limit for everyone/);
    assert.equal(uploadLine({ limit: null, used: 9, left: null }), null, 'an admin');
    assert.equal(uploadLine(null), null);
  });

  test("the Share panel counts the players' markers, and warns from 160 of 200", () => {
    assert.equal(markersLine({ count: 0, max: 200 }), null);
    assert.equal(markersLine(undefined), null);
    assert.deepEqual(markersLine({ count: 12, max: 200 }), { text: "Players' markers: 12 of 200", warn: false });
    assert.deepEqual(markersLine({ count: 160, max: 200 }), { text: "Players' markers: 160 of 200. Near the most a world holds: remove some to give players room.", warn: true });
    assert.deepEqual(markersLine({ count: 200, max: 200 }), { text: "Players' markers: 200 of 200, the most a world holds. Players can't add more until you remove some.", warn: true });
  });

  test("a player who finds the world full is told it's the world's markers, not the map's", () => {
    const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'routes', 'share.js'), 'utf8');
    assert.match(src, /const PLAYER_MARKER_CAP = 200;/);
    assert.match(src, /This world holds \$\{PLAYER_MARKER_CAP\} player markers, the most it can — ask your DM to clear some away/);
    assert.match(src, /if \(\(await playerMarkerCount\(w\.id\)\) >= PLAYER_MARKER_CAP\) return res\.status\(400\)\.json\(\{ message: MARKERS_FULL \}\);/);
    assert.match(require('node:fs').readFileSync(path.join(__dirname, '..', 'routes', 'atlas.js'), 'utf8'),
      /playerMarkers: \{ count: await playerMarkerCount\(w\.id\), max: PLAYER_MARKER_CAP \}/);
  });
}
