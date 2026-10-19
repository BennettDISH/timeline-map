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

test('a proposal that wants too many paintings says how many are left', () => {
  const at = new Date('2026-10-19T19:10:00Z');
  assert.strictEqual(paintingsText(1, 3, at), 'this proposal wanted 3 paintings and only 1 Forge use is left today — ask for fewer, or try again after midnight UTC, in about 5 hours');
  assert.strictEqual(paintingsText(2, 5, at), 'this proposal wanted 5 paintings and only 2 Forge uses are left today — ask for fewer, or try again after midnight UTC, in about 5 hours');
  assert.strictEqual(paintingsText(0, 1, at), "this proposal wanted 1 painting and today's Forge uses are spent — they come back at midnight UTC, in about 5 hours");
});
