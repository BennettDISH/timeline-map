#!/usr/bin/env node
// Upload the finished stock pictures to the games' media bucket and write the library the server
// offers (server/stock/library.json). Through fleet-kit's R2 store (the server's own copy, so run
// `npm install` in server/ first): every key is content-hashed,
//   atlas/stock/<tokens|portraits>/<name>-<sha256 first 8>.webp
// put once with the immutable Cache-Control and skipped when it is already there.
//
//   node tools/stock/upload.mjs <finished dir> [--dry]
//
// R2_* come from the environment (~/.config/games-media/r2.env) and are never printed.

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ALL, CREDIT } from './prompts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const { createR2Store } = createRequire(join(repo, 'server', 'package.json'))('fleet-kit/server/r2');

const [dir, ...rest] = process.argv.slice(2);
const dry = rest.includes('--dry');
if (!dir) { console.error('usage: node tools/stock/upload.mjs <finished dir> [--dry]'); process.exit(2); }
const store = createR2Store(process.env, { isPublic: true });
if (!store && !dry) { console.error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL must all be set'); process.exit(2); }
const base = String(process.env.R2_PUBLIC_URL || 'https://media.bennettdishmanmedia.com').replace(/\/+$/, '');

const items = [];
let put = 0;
let kept = 0;
for (const item of ALL) {
  const folder = item.kind === 'token' ? 'tokens' : 'portraits';
  const data = readFileSync(join(dir, folder, `${item.name}.webp`));
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 8);
  const key = `atlas/stock/${folder}/${item.name}-${hash}.webp`;
  const { width, height } = await sharp(data).metadata();
  items.push({ name: item.name, title: item.title, kind: item.kind, group: item.group, src: `${base}/${key}`, bytes: data.length, width, height });
  if (dry) continue;
  if (await store.head(key)) { kept++; continue; }
  await store.put(key, data, 'image/webp');
  put++;
}
const out = join(repo, 'server', 'stock', 'library.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ version: 1, credit: CREDIT, items }, null, 2)}\n`);
console.log(`${dry ? 'dry run: ' : ''}${put} uploaded, ${kept} already there; wrote ${out}`);
