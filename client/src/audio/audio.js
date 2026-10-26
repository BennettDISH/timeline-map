/**
 * The audio module the games share (copied per app, like the R2 helper): sample playback from a
 * manifest over one AudioContext, three buses (sfx, music, ambience) into a master and a soft
 * limiter, remembered mute and levels, the mobile unlock, and crossfaded beds. A name with no
 * decoded file answers false from `play`, so the game is never worse for a missing file.
 *
 * Manifest (public/audio/manifest.json): `{ version, sounds: { name: url | [urls] | { src, gain,
 * loopStart, loopEnd, once } } }`. Several urls under one name are variants picked at random.
 * Urls are absolute (the media host the server's CSP names). Names starting with `music.` or
 * `amb.` are beds: fetched when first asked for and dropped after they fade out.
 *
 * Nothing sounds before the first gesture: `unlock()` runs inside it (iOS refuses a deferred
 * resume) and `arm()` wires that to the page's first pointer, key or touch.
 */

export const DEFAULT_PREFS = Object.freeze({ muted: false, master: 0.8, music: 0.5, sfx: 1 });

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const clampPan = (v) => Math.max(-1, Math.min(1, v));

/** Saved prefs (a JSON string), or the defaults; anything malformed falls back field by field. */
export function prefsFrom(raw) {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const p = JSON.parse(raw);
    const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : fallback);
    return {
      muted: typeof p.muted === 'boolean' ? p.muted : DEFAULT_PREFS.muted,
      master: num(p.master, DEFAULT_PREFS.master),
      music: num(p.music, DEFAULT_PREFS.music),
      sfx: num(p.sfx, DEFAULT_PREFS.sfx),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/**
 * The manifest's sounds as a Map of name -> { urls, gain, loopStart?, loopEnd?, once? }, dropping
 * anything malformed or not in `known` (a Set of the names the game asks for); `dropped` says why.
 */
export function parseManifest(raw, known) {
  const sounds = new Map();
  const dropped = [];
  if (typeof raw !== 'object' || raw === null) return { sounds, dropped: ['manifest is not an object'] };
  const list = raw.sounds;
  if (typeof list !== 'object' || list === null) return { sounds, dropped: ['manifest has no sounds'] };
  for (const [name, entry] of Object.entries(list)) {
    if (known && !known.has(name)) {
      dropped.push(`${name}: not a sound the game asks for`);
      continue;
    }
    let src = entry;
    let gain = 1;
    let loopStart;
    let loopEnd;
    let once = false;
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      src = entry.src;
      if (typeof entry.gain === 'number' && Number.isFinite(entry.gain) && entry.gain >= 0 && entry.gain <= 4) gain = entry.gain;
      if (typeof entry.loopStart === 'number' && Number.isFinite(entry.loopStart) && entry.loopStart >= 0) loopStart = entry.loopStart;
      if (typeof entry.loopEnd === 'number' && Number.isFinite(entry.loopEnd) && entry.loopEnd > (loopStart ?? 0)) loopEnd = entry.loopEnd;
      if (entry.once === true) once = true;
    }
    const urls = (Array.isArray(src) ? src : [src]).filter((u) => typeof u === 'string' && u.length > 0 && !/\s/.test(u));
    if (urls.length === 0) {
      dropped.push(`${name}: no url`);
      continue;
    }
    const sound = { urls, gain };
    if (loopStart !== undefined) sound.loopStart = loopStart;
    if (loopEnd !== undefined) sound.loopEnd = loopEnd;
    if (once) sound.once = true;
    sounds.set(name, sound);
  }
  return { sounds, dropped };
}

const BED_FADE = 1.6;
/** Effects sit a touch under the music at equal slider settings. */
const SFX_TRIM = 0.8;
/** Per play: a little pitch and level spread so one recording heard twice is not a machine. */
const PITCH_JITTER = 0.03;
const VOL_JITTER = 0.1;
/** Busy moments: past these, a new one-shot is dropped rather than piled into the limiter. */
const MAX_VOICES = 16;
const MAX_PER_NAME = 3;
/** Seconds shaved off each end of a looping file: mp3 decoders pad the edges with silence that would click. */
const LOOP_TRIM = 0.035;
const isBed = (name) => name.startsWith('music.') || name.startsWith('amb.');

function trimLoop(src, sound) {
  const dur = src.buffer?.duration ?? 0;
  if (dur < 0.5) return;
  const start = sound?.loopStart ?? LOOP_TRIM;
  const end = sound?.loopEnd ?? dur - LOOP_TRIM;
  if (end > start && end <= dur) {
    src.loopStart = start;
    src.loopEnd = end;
  }
}

export class GameAudio {
  /**
   * @param {object} o
   * @param {Set<string>} o.names every sound name the game asks for (the manifest may name no others)
   * @param {string} o.prefsKey the storage key for the remembered levels
   * @param {(key: string) => string | null} o.read
   * @param {(key: string, value: string) => void} o.write
   */
  constructor({ names, prefsKey, read, write }) {
    this.names = names;
    this.prefsKey = prefsKey;
    this.write = write;
    this.prefs = prefsFrom(read(prefsKey));
    this.sounds = new Map();
    this.buffers = new Map();
    this.failed = new Set();
    this.lastAt = new Map();
    this.voices = 0;
    this.voicesByName = new Map();
    this.manifestUrl = null;
    this.loaded = false;
    this.loading = null;
    this.beds = { music: null, ambience: null };
    this.wanted = { music: null, ambience: null };
    this.ctx = null;
    this.buses = null;
    this.master = null;
    this.duckGain = null;
    this.armed = false;
  }

  get muted() { return this.prefs.muted; }

  /** True once the context is running (after the first gesture). */
  get ready() { return this.ctx !== null && this.ctx.state === 'running'; }

  /** Point at the manifest and listen for the first gesture; the files load once the context exists. */
  use(manifestUrl) {
    this.manifestUrl = manifestUrl;
    this.arm();
    if (this.ctx) void this.load();
  }

  /** The page's first pointer, key or touch opens the context; it listens again if the context is suspended later. */
  arm() {
    if (this.armed || typeof document === 'undefined') return;
    this.armed = true;
    const events = ['pointerdown', 'keydown', 'touchend'];
    const onGesture = () => {
      this.unlock();
      // resume() settles after this handler; once it is running the listeners are done
      this.ctx?.resume().then(() => {
        if (this.ready) for (const e of events) document.removeEventListener(e, onGesture, true);
      }).catch(() => { /* the next gesture tries again */ });
    };
    for (const e of events) document.addEventListener(e, onGesture, true);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      // A hidden tab stops making sound; coming back restarts it where it was.
      if (document.hidden) void this.ctx.suspend().catch(() => {});
      else void this.ctx.resume().catch(() => { /* needs a gesture */ });
    });
  }

  /** Call from a user gesture: opens the context, applies the saved levels, starts loading the manifest. */
  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return;
      try { this.ctx = new Ctor({ latencyHint: 'interactive' }); } catch { return; }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      // a soft limiter, so stacked stings never clip
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 12;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      this.master.connect(limiter);
      limiter.connect(ctx.destination);
      this.buses = {};
      for (const k of ['sfx', 'music', 'ambience']) {
        this.buses[k] = ctx.createGain();
        this.buses[k].connect(this.master);
      }
      this.applyPrefs(true);
    }
    // iOS reports 'interrupted' after a call or the silent switch; resume() inside a gesture brings it back
    if (this.ctx.state !== 'running') void this.ctx.resume().then(() => this.startWanted()).catch(() => {});
    else this.startWanted();
    if (this.manifestUrl && !this.loaded && !this.loading) void this.load();
  }

  /** Start the beds the game asked for before the context could sound (a bed wanted at page load). */
  startWanted() {
    for (const kind of ['music', 'ambience']) {
      const name = this.wanted[kind];
      if (name && this.beds[kind]?.name !== name) this.bed(kind, name);
    }
  }

  applyPrefs(instant = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (node, v) => (instant ? (node.gain.value = v) : node.gain.setTargetAtTime(v, t, 0.03));
    set(this.master, this.prefs.muted ? 0 : this.prefs.master);
    set(this.buses.sfx, this.prefs.sfx * SFX_TRIM);
    set(this.buses.music, this.prefs.music);
    set(this.buses.ambience, this.prefs.music);
  }

  setPrefs(next) {
    this.prefs = { ...this.prefs, ...next };
    this.write(this.prefsKey, JSON.stringify(this.prefs));
    this.applyPrefs();
  }

  setMuted(muted) { this.setPrefs({ muted }); }

  /** Fetch the manifest and decode every file it names (beds wait until asked for). Safe to call twice. */
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const res = await fetch(this.manifestUrl, { cache: 'no-cache' });
        if (!res.ok) return;
        const { sounds } = parseManifest(await res.json(), this.names);
        for (const [name, sound] of sounds) this.sounds.set(name, sound);
        this.loaded = true;
        const urls = new Set();
        for (const [name, s] of sounds) if (!isBed(name)) for (const u of s.urls) urls.add(u);
        await Promise.all([...urls].map((u) => this.decode(u)));
        // a bed asked for while the manifest was still on its way starts now
        this.startWanted();
      } catch {
        /* no manifest: the game stays as it was */
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  async decode(url) {
    if (!this.ctx || this.buffers.has(url) || this.failed.has(url)) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      this.buffers.set(url, await this.ctx.decodeAudioData(await res.arrayBuffer()));
    } catch {
      this.failed.add(url);
    }
  }

  /** True when `name` has at least one decoded file. */
  has(name) {
    const s = this.sounds.get(name);
    return s !== undefined && s.urls.some((u) => this.buffers.has(u));
  }

  pick(name) {
    const s = this.sounds.get(name);
    if (!s) return null;
    const ready = s.urls.filter((u) => this.buffers.has(u));
    if (ready.length === 0) return null;
    return { buffer: this.buffers.get(ready[Math.floor(Math.random() * ready.length)]), gain: s.gain, sound: s };
  }

  /**
   * Play a one-shot on the sfx bus: opts `vol` (0..1), `pitch` (rate), `pan` (-1..1), `throttleMs`.
   * False when there is no file for it (or the context is not running yet).
   */
  play(name, opts = {}) {
    if (!this.ready) return false;
    const picked = this.pick(name);
    if (!picked) return false;
    if (opts.throttleMs) {
      const now = performance.now();
      if (now - (this.lastAt.get(name) ?? -Infinity) < opts.throttleMs) return true;
      this.lastAt.set(name, now);
    }
    const same = this.voicesByName.get(name) ?? 0;
    if (this.voices >= MAX_VOICES || same >= MAX_PER_NAME) return true;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = picked.buffer;
    const pitch = (opts.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * PITCH_JITTER);
    src.playbackRate.value = Math.max(0.25, Math.min(4, pitch));
    const g = ctx.createGain();
    g.gain.value = clamp01(opts.vol ?? 1) * picked.gain * (1 - Math.random() * VOL_JITTER);
    src.connect(g);
    let out = g;
    if (opts.pan !== undefined && typeof ctx.createStereoPanner === 'function') {
      const pan = ctx.createStereoPanner();
      pan.pan.value = clampPan(opts.pan);
      g.connect(pan);
      out = pan;
    }
    out.connect(this.buses.sfx);
    this.voices++;
    this.voicesByName.set(name, same + 1);
    src.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      this.voicesByName.set(name, Math.max(0, (this.voicesByName.get(name) ?? 1) - 1));
    };
    src.start();
    return true;
  }

  /**
   * Crossfade a bed on the music or ambience bus; `null` fades the current one out. The same name
   * again is left playing. A bed that is not decoded yet is fetched, and starts when it is ready if
   * it is still the one wanted (the old bed plays on until then). False when nothing changed yet.
   */
  bed(kind, name, fade = BED_FADE) {
    this.wanted[kind] = name;
    if (!this.ready) return false;
    const ctx = this.ctx;
    const current = this.beds[kind];
    if (current && current.name === name) return true;
    if (name !== null && !this.has(name)) {
      const s = this.sounds.get(name);
      if (!this.loaded || (s !== undefined && s.urls.some((u) => !this.failed.has(u)))) {
        void Promise.all((s?.urls ?? []).map((u) => this.decode(u))).then(() => {
          if (this.wanted[kind] === name && this.beds[kind]?.name !== name && this.has(name)) this.bed(kind, name, fade);
        });
        return false;
      }
    }
    if (current) {
      current.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      current.src.stop(ctx.currentTime + fade + 0.1);
      this.beds[kind] = null;
      setTimeout(() => this.release(current.name), (fade + 0.5) * 1000);
    }
    if (name === null) return true;
    const picked = this.pick(name);
    if (!picked) return false;
    const src = ctx.createBufferSource();
    src.buffer = picked.buffer;
    src.loop = !picked.sound.once;
    if (src.loop) trimLoop(src, picked.sound);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(picked.gain, ctx.currentTime, fade / 3);
    src.connect(g);
    if (kind === 'music') {
      if (!this.duckGain) {
        this.duckGain = ctx.createGain();
        this.duckGain.connect(this.buses.music);
      }
      g.connect(this.duckGain);
    } else {
      g.connect(this.buses[kind]);
    }
    src.start();
    this.beds[kind] = { name, src, gain: g };
    return true;
  }

  /** Drop a bed's decoded audio once it has faded out and nothing wants it. */
  release(name) {
    if (!isBed(name)) return;
    if (this.beds.music?.name === name || this.beds.ambience?.name === name) return;
    if (this.wanted.music === name || this.wanted.ambience === name) return;
    const s = this.sounds.get(name);
    if (s) for (const u of s.urls) this.buffers.delete(u);
  }

  /** The bed playing on a bus, if any. */
  playing(kind) { return this.beds[kind]?.name ?? null; }

  /** Dip the music under a sting, then let it back up. */
  duck(amount = 0.4, seconds = 0.8) {
    if (!this.ctx || !this.duckGain) return;
    const t = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.setTargetAtTime(1 - clamp01(amount), t, 0.03);
    this.duckGain.gain.setTargetAtTime(1, t + seconds, 0.25);
  }

  /** Fade every bed out. */
  stopBeds(fade = BED_FADE) {
    this.bed('music', null, fade);
    this.bed('ambience', null, fade);
  }
}
