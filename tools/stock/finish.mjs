#!/usr/bin/env node
// Turn the raw paintings into the files the Atlas serves:
//   tokens    -> the magenta keyed out to transparency, trimmed, centred on a square with a small
//                margin, 512 px WebP (alpha kept)
//   portraits -> 768 px WebP
//
//   node tools/stock/finish.mjs <raw dir> <out dir> [--only a,b]
//
// <out dir> gets tokens/<name>.webp and portraits/<name>.webp. The key: the background colour is
// the median of the picture's border; a pixel near it is background when it touches the border
// or sits in a large patch of it (the gap between an arm and a body), and the pixels along the cut
// get partial alpha with the background colour taken back out of them, so no pink fringe is left.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { TOKENS, PORTRAITS } from './prompts.mjs';

const [rawDir, outDir, ...rest] = process.argv.slice(2);
const only = rest.includes('--only') ? rest[rest.indexOf('--only') + 1].split(',') : null;
if (!rawDir || !outDir) { console.error('usage: node tools/stock/finish.mjs <raw dir> <out dir> [--only a,b]'); process.exit(2); }

export const TOKEN_PX = 512;
export const PORTRAIT_PX = 768;
const NEAR = 62; // colour distance that is surely background
const FAR = 150; // past this a cut pixel is fully opaque
const PATCH = 40; // an enclosed patch of background this big (in pixels) is a hole, not a detail

const dist = (d, i, bg) => Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

function key({ data, info }) {
  const { width: w, height: h } = info;
  const n = w * h;
  // the background: the median colour of a 6 px ring round the edge
  const ring = [[], [], []];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= 6 && y >= 6 && x < w - 6 && y < h - 6) continue;
    const i = (y * w + x) * 4;
    ring[0].push(data[i]); ring[1].push(data[i + 1]); ring[2].push(data[i + 2]);
  }
  const bg = ring.map(median);

  const near = new Uint8Array(n);
  for (let p = 0; p < n; p++) near[p] = dist(data, p * 4, bg) < NEAR ? 1 : 0;
  // connected patches of near pixels: background when they touch the border or are big
  const isBg = new Uint8Array(n);
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!near[s] || seen[s]) continue;
    let top = 0; stack[top++] = s; seen[s] = 1;
    const members = [];
    let edge = false;
    while (top) {
      const p = stack[--top]; members.push(p);
      const x = p % w; const y = (p / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && near[q] && !seen[q]) { seen[q] = 1; stack[top++] = q; }
      }
    }
    if (edge || members.length >= PATCH) for (const p of members) isBg[p] = 1;
  }

  const outPx = Buffer.alloc(n * 4);
  let opaque = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (isBg[p]) continue; // stays transparent
    // a pixel next to the background is on the cut: alpha from how far it is from the background
    const x = p % w; const y = (p / w) | 0;
    let onCut = false;
    for (let dy = -2; dy <= 2 && !onCut; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx; const yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && isBg[yy * w + xx]) { onCut = true; break; }
    }
    let a = 1;
    if (onCut) a = Math.max(0, Math.min(1, (dist(data, i, bg) - NEAR) / (FAR - NEAR)));
    if (a <= 0.02) continue;
    for (let c = 0; c < 3; c++) {
      const v = a < 1 ? (data[i + c] - (1 - a) * bg[c]) / a : data[i + c]; // the background taken back out
      outPx[i + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
    outPx[i + 3] = Math.round(a * 255);
    if (a === 1) opaque++;
  }
  return { px: outPx, w, h, bg, cover: opaque / n };
}

async function token(item) {
  const raw = await sharp(join(rawDir, `${item.name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { px, w, h, bg, cover } = key(raw);
  // trim to what is left, then centre it on a square with a 5% margin
  const trimmed = await sharp(px, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
  const side = Math.round(Math.max(trimmed.info.width, trimmed.info.height) * 1.1);
  const file = join(outDir, 'tokens', `${item.name}.webp`);
  await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: trimmed.data, left: Math.round((side - trimmed.info.width) / 2), top: Math.round((side - trimmed.info.height) / 2) }])
    .png().toBuffer()
    .then((b) => sharp(b).resize(TOKEN_PX, TOKEN_PX, { kernel: 'lanczos3' }).webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(file));
  console.log(`token ${item.name}: background rgb(${bg.join(',')}), subject ${(cover * 100).toFixed(0)}% of the frame, trimmed ${trimmed.info.width}x${trimmed.info.height}`);
}

async function portrait(item) {
  const file = join(outDir, 'portraits', `${item.name}.webp`);
  await sharp(join(rawDir, `${item.name}.png`)).resize(PORTRAIT_PX, PORTRAIT_PX, { kernel: 'lanczos3', fit: 'cover' }).webp({ quality: 84, effort: 6 }).toFile(file);
  console.log(`portrait ${item.name}`);
}

mkdirSync(join(outDir, 'tokens'), { recursive: true });
mkdirSync(join(outDir, 'portraits'), { recursive: true });
let missing = 0;
for (const item of [...TOKENS, ...PORTRAITS]) {
  if (only && !only.includes(item.name)) continue;
  try {
    await (item.kind === 'token' ? token(item) : portrait(item));
  } catch (e) {
    if (e.message.includes('missing') || e.code === 'ENOENT' || /Input file is missing/.test(e.message)) { missing++; console.error(`no raw picture for ${item.name}`); }
    else throw e;
  }
}
if (missing) { console.error(`${missing} raw pictures missing`); process.exit(1); }
