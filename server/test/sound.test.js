// The Player View's sound, run locally (no browser audio, no network): the player (levels, a bed
// crossfading as the map changes, a missing file being silence), which bed a map gets, the manifest
// the page ships with, and the one CSP line the files need. A stand-in AudioContext records what
// would have been started.
//
//   node --test server/test/sound.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { pathToFileURL } = require('node:url');
const { securityHeaders, MEDIA_ORIGIN } = require('../lib/security');

const client = (...p) => path.join(__dirname, '..', '..', 'client', ...p);
const load = (...p) => import(pathToFileURL(client('src', ...p)).href);
let audioMod, namesMod, bedsMod, elementMod;
test.before(async () => {
  audioMod = await load('audio', 'audio.js');
  namesMod = await load('audio', 'names.js');
  bedsMod = await load('audio', 'beds.js');
  elementMod = await load('audio', 'elementBed.js');
});
const manifestOnDisk = () => JSON.parse(fs.readFileSync(client('public', 'audio', 'manifest.json'), 'utf8'));

test('prefs: defaults, a saved set, and anything malformed falling back field by field', () => {
  const { prefsFrom, DEFAULT_PREFS } = audioMod;
  assert.deepStrictEqual(prefsFrom(null), DEFAULT_PREFS);
  assert.deepStrictEqual(prefsFrom('{"muted":true,"master":0.3,"music":0.2,"sfx":0.6}'), { muted: true, master: 0.3, music: 0.2, sfx: 0.6 });
  assert.deepStrictEqual(prefsFrom('{"muted":"yes","master":7,"sfx":"loud"}'), { ...DEFAULT_PREFS, master: 1 });
  assert.deepStrictEqual(prefsFrom('not json'), DEFAULT_PREFS);
});

test('the shipped manifest names every sound the Player View asks for, and only those, on the media host, with loop points on the beds', () => {
  const known = new Set(namesMod.SOUND_NAMES);
  const { sounds, dropped } = audioMod.parseManifest(manifestOnDisk(), known);
  assert.deepStrictEqual(dropped, [], 'nothing unknown or malformed');
  assert.deepStrictEqual([...sounds.keys()].sort(), [...known].sort());
  for (const [name, s] of sounds) {
    for (const u of s.urls) {
      assert.match(u, new RegExp(`^${MEDIA_ORIGIN.replace(/\./g, '\\.')}/atlas/audio/.+-[0-9a-f]{8}\\.mp3$`), `${name} is a hashed file on the media host`);
    }
    if (namesMod.BEDS.includes(name)) {
      assert.ok(s.loopStart > 0 && s.loopEnd > s.loopStart + 20, `${name} has loop points (a long loop, not a few seconds)`);
    }
  }
});

test('the media host is allowed to be fetched — connect-src only — on the Player View and the DM app alike', async () => {
  const app = express();
  app.use(securityHeaders({}));
  app.use((req, res) => res.send('ok'));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    for (const p of ['/p/tok', '/p/tok/m/3', '/dashboard']) {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${p}`);
      const csp = Object.fromEntries(res.headers.get('content-security-policy').split(';').map((d) => { const [n, ...v] = d.trim().split(/\s+/); return [n, v]; }));
      assert.ok(csp['connect-src'].includes(MEDIA_ORIGIN), `${p}: connect-src names the media host`);
      assert.ok(csp['connect-src'].includes("'self'"));
      for (const name of ['script-src', 'style-src', 'frame-src', 'object-src', 'default-src']) {
        assert.ok(!(csp[name] ?? []).includes(MEDIA_ORIGIN), `${p}: ${name} does not`);
      }
    }
  } finally {
    server.close();
  }
});

test('a map is heard as the kind of place its name says, its parents next, the open country otherwise', () => {
  const { bedFor, titlesOf, DEFAULT_BED } = bedsMod;
  const at = (title, crumbs = []) => bedFor(titlesOf({ title }, crumbs.map((t) => ({ title: t }))));
  assert.strictEqual(at('The Whispering Forest'), 'amb.forest');
  assert.strictEqual(at('Port Dunmere'), 'amb.sea');
  assert.strictEqual(at('Harbor Town'), 'amb.sea', 'the sea before the town');
  assert.strictEqual(at('The Drowned Crypt'), 'amb.dungeon');
  assert.strictEqual(at('Stormwatch Keep'), 'amb.town', 'a word that only starts with storm is not a storm');
  assert.strictEqual(at('Tempest over the Strait'), 'amb.storm', 'a storm over the sea is a storm');
  assert.strictEqual(at('Redstone Pass'), 'amb.mountain');
  assert.strictEqual(at('Market Square'), 'amb.town');
  assert.strictEqual(at('Great Hall', ['The World', 'Kingdom of Oss', 'Ironhold Citadel']), 'amb.town', 'the parents answer for a room that names nothing');
  assert.strictEqual(at('Cellar', ['The World', 'Old Mill']), 'amb.dungeon', 'but the map itself answers first');
  assert.strictEqual(at('Room 3', ['The Deep Mines']), 'amb.dungeon');
  assert.strictEqual(at('The Known World', ['The Known World']), DEFAULT_BED);
  assert.strictEqual(at(''), DEFAULT_BED);
  assert.strictEqual(bedFor([]), DEFAULT_BED);
  for (const t of ['Forest', 'Port', 'Crypt', 'Pass', 'Inn', 'Storm']) assert.ok(namesMod.BEDS.includes(at(t)), t);
});

test('a DM-made ambience follows mute and the levels, and fades in and out', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { levelOf, rampTo } = elementMod;
  assert.strictEqual(levelOf({ muted: true, master: 0.8, music: 0.5 }), 0);
  assert.ok(Math.abs(levelOf({ muted: false, master: 0.8, music: 0.5 }) - 0.4) < 1e-9);
  assert.strictEqual(levelOf({ muted: false, master: 2, music: 2 }), 1);
  const el = { volume: 0 };
  let done = 0;
  rampTo(el, 0.6, 200, () => { done += 1; });
  rampTo(el, 0.3, 200, () => { done += 10; }); // a new ramp replaces the one running
  t.mock.timers.tick(250);
  assert.strictEqual(el.volume, 0.3);
  assert.strictEqual(done, 10, 'only the replacing ramp finishes');
});

// a stand-in for the browser's audio: just enough surface for the player
function fakeAudio() {
  const started = [];
  const gains = [];
  const node = () => ({ connect() {}, disconnect() {} });
  const param = (v = 1) => ({ value: v, setTargetAtTime(x) { this.value = x; } });
  class Ctx {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = node(); }
    createGain() { const n = { ...node(), gain: param() }; gains.push(n); return n; }
    createDynamicsCompressor() { return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; }
    createStereoPanner() { return { ...node(), pan: param(0) }; }
    createBufferSource() {
      const src = { ...node(), playbackRate: param(), stopped: false, start() { started.push(src); }, stop() { src.stopped = true; } };
      return src;
    }
    async decodeAudioData() { return { duration: 40 }; }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
  }
  return { Ctx, started, gains };
}

async function unlocked(saved = null) {
  const f = fakeAudio();
  globalThis.window = { AudioContext: f.Ctx };
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('manifest.json')) {
      return { ok: true, json: async () => ({ sounds: {
        'amb.forest': { src: 'https://m/forest.mp3', loopStart: 2, loopEnd: 40 },
        'amb.sea': { src: 'https://m/sea.mp3', loopStart: 2, loopEnd: 40 },
        'ui.scrub': ['https://m/s1.mp3', 'https://m/s2.mp3'],
      } }) };
    }
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  const store = new Map(saved ? [['k', saved]] : []);
  const audio = new audioMod.GameAudio({ names: new Set(namesMod.SOUND_NAMES), prefsKey: 'k', read: (k) => store.get(k) ?? null, write: (k, v) => store.set(k, v) });
  audio.use('/audio/manifest.json');
  audio.unlock();
  await audio.ctx.resume();
  await audio.load();
  return { audio, store, ...f };
}
const cleanup = () => { delete globalThis.window; delete globalThis.fetch; };
const settle = () => new Promise((r) => setTimeout(r, 10));

test('beds: a bed wanted before the first gesture starts once the sound is unlocked', async () => {
  const f = fakeAudio();
  globalThis.window = { AudioContext: f.Ctx };
  globalThis.fetch = async (url) => (String(url).endsWith('manifest.json')
    ? { ok: true, json: async () => ({ sounds: { 'amb.forest': { src: 'https://m/forest.mp3', loopStart: 2, loopEnd: 40 } } }) }
    : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try {
    const audio = new audioMod.GameAudio({ names: new Set(namesMod.SOUND_NAMES), prefsKey: 'k', read: () => null, write() {} });
    audio.use('/audio/manifest.json');
    assert.strictEqual(audio.bed('ambience', 'amb.forest'), false, 'nothing sounds before a gesture');
    assert.strictEqual(audio.playing('ambience'), null);
    audio.unlock(); // the first tap
    await audio.ctx.resume();
    await audio.load();
    await settle();
    assert.strictEqual(audio.playing('ambience'), 'amb.forest', 'it was asked for first, so it starts now');
    assert.strictEqual(f.started.length, 1);
  } finally { cleanup(); }
});

test('beds: moving to another place crossfades — the old fades out and stops, the new fades in — and the same place is left alone', async () => {
  const { audio, started } = await unlocked();
  try {
    audio.bed('ambience', 'amb.forest');
    await settle();
    assert.strictEqual(audio.playing('ambience'), 'amb.forest');
    const first = started[0];
    assert.strictEqual(first.loopStart, 2, 'the manifest\'s loop points are used');
    assert.strictEqual(first.loopEnd, 40);
    assert.strictEqual(first.loop, true);
    audio.bed('ambience', 'amb.forest');
    assert.strictEqual(started.length, 1, 'the same bed again starts nothing');
    audio.bed('ambience', 'amb.sea', 2.4);
    await settle();
    assert.strictEqual(audio.playing('ambience'), 'amb.sea');
    assert.strictEqual(started.length, 2);
    assert.strictEqual(first.stopped, true, 'the old bed is stopped (after its fade)');
    audio.bed('ambience', null);
    assert.strictEqual(audio.playing('ambience'), null, 'null fades the bed out');
    assert.strictEqual(audio.bed('ambience', 'amb.not-there'), false, 'a bed with no file changes nothing');
  } finally { cleanup(); }
});

test('mute and the levels are remembered and reach the buses; a cue is played, throttled, and a missing one is silence', async () => {
  const { audio, store, gains, started } = await unlocked(JSON.stringify({ muted: true, master: 0.5, music: 0.5, sfx: 1 }));
  try {
    assert.strictEqual(gains[0].gain.value, 0, 'muted at load: the master is shut');
    audio.setMuted(false);
    audio.setPrefs({ music: 0.7 });
    assert.strictEqual(gains[0].gain.value, 0.5);
    assert.strictEqual(gains[2].gain.value, 0.7, 'the music slider moves the ambience bus too');
    assert.deepStrictEqual(JSON.parse(store.get('k')), { muted: false, master: 0.5, music: 0.7, sfx: 1 });
    assert.strictEqual(audio.play('ui.scrub', { throttleMs: 10_000 }), true);
    assert.strictEqual(audio.play('ui.scrub', { throttleMs: 10_000 }), true);
    assert.strictEqual(started.length, 1, 'a second tick inside the throttle starts nothing');
    assert.strictEqual(audio.play('ui.era'), false, 'in the app, not in the manifest: the page moves on');
  } finally { cleanup(); }
});
