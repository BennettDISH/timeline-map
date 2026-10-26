#!/usr/bin/env node
/**
 * Generate the sounds in prompts.mjs with ElevenLabs Sound Effects and put them in <out>/<name>.mp3
 * (a prompt with `variants: n` also gets <name>.2.mp3 … <name>.n.mp3, played at random), then write
 * their manifest entries. The key comes from ELEVENLABS_API_KEY in the environment (never from the
 * repo, never printed). Existing files are kept unless --force or --only <name,...> says otherwise.
 *
 *   set -a; . ~/.config/games-media/elevenlabs.env; set +a
 *   node tools/sounds/eleven.mjs --out <staging>/eleven --manifest <staging>/manifest.local.json \
 *        [--only name,name] [--force] [--credits]
 *
 * The files do not live in this repo: they go to the games-media bucket (the uploader in the
 * games-media repo rewrites the manifest's "/audio/eleven/…" paths to bucket URLs, and that manifest is
 * what public/audio/manifest.json holds).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROMPTS } from './prompts.mjs';

const API = 'https://api.elevenlabs.io/v1';
const key = process.env['ELEVENLABS_API_KEY'];
const args = process.argv.slice(2);
const force = args.includes('--force');
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const onlyArg = option('--only');
const only = onlyArg ? new Set(onlyArg.split(',')) : null;

if (!key) {
  console.error('ELEVENLABS_API_KEY is not set');
  process.exit(2);
}

async function credits() {
  const res = await fetch(`${API}/user/subscription`, { headers: { 'xi-api-key': key } });
  if (!res.ok) throw new Error(`subscription: ${res.status}`);
  const s = await res.json();
  return { used: s.character_count, limit: s.character_limit, tier: s.tier };
}

async function generate(p) {
  const body = { text: p.text, prompt_influence: 0.45 };
  if (p.seconds) body.duration_seconds = p.seconds;
  if (p.loop) body.loop = true;
  const res = await fetch(`${API}/sound-generation?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${p.name}: ${res.status} ${text.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

const before = await credits();
console.log(`credits used ${before.used} of ${before.limit} (${before.tier})`);
if (args.includes('--credits')) process.exit(0);

const out = option('--out');
const manifestArg = option('--manifest');
if (!out || !manifestArg) {
  console.error('usage: node tools/sounds/eleven.mjs --out <dir> --manifest <file> [--only a,b] [--force] [--credits]');
  process.exit(2);
}
const outDir = resolve(out);
const manifestPath = resolve(manifestArg);
mkdirSync(outDir, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { version: 1, sounds: {} };
let made = 0;
let kept = 0;
for (const p of PROMPTS) {
  if (only && !only.has(p.name)) continue;
  const takes = [];
  for (let i = 1; i <= (p.variants ?? 1); i++) {
    const base = i === 1 ? p.name : `${p.name}.${i}`;
    const file = resolve(outDir, `${base}.mp3`);
    if (existsSync(file) && !force) {
      kept++;
    } else {
      try {
        const bytes = await generate(p);
        writeFileSync(file, bytes);
        made++;
        console.log(`  ${base.padEnd(24)} ${(bytes.length / 1024).toFixed(0)} KB`);
      } catch (err) {
        console.error(`  FAILED ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }
    takes.push(`/audio/eleven/${base}.mp3`);
  }
  if (takes.length === 0) continue;
  manifest.sounds[p.name] = { src: takes.length === 1 ? takes[0] : takes, gain: p.gain ?? 0.7 };
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const after = await credits();
console.log(`${made} generated, ${kept} kept; credits used ${after.used} of ${after.limit} (${after.used - before.used} this run)`);
