#!/usr/bin/env node
// A contact sheet of the finished library, to look at before uploading: the tokens on the Atlas'
// dark ground and on parchment (so a fringe shows on either), then the portraits.
//
//   node tools/stock/sheet.mjs <finished dir> <sheet.png>

import { join } from 'node:path';
import sharp from 'sharp';
import { TOKENS, PORTRAITS } from './prompts.mjs';

const [dir, outFile] = process.argv.slice(2);
if (!dir || !outFile) { console.error('usage: node tools/stock/sheet.mjs <finished dir> <sheet.png>'); process.exit(2); }

const CELL = 200;
const LABEL = 26;
const COLS = 8;
const PAD = 16;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const label = (text, w, color) => Buffer.from(`<svg width="${w}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg"><text x="${w / 2}" y="18" font-family="DejaVu Sans, sans-serif" font-size="14" fill="${color}" text-anchor="middle">${esc(text)}</text></svg>`);
const heading = (text, w) => Buffer.from(`<svg width="${w}" height="40" xmlns="http://www.w3.org/2000/svg"><text x="${PAD}" y="28" font-family="DejaVu Sans, sans-serif" font-size="20" font-weight="bold" fill="#c9a35f">${esc(text)}</text></svg>`);

async function cell(file, ground, ink) {
  const img = await sharp(file).resize(CELL - 16, CELL - 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: CELL, height: CELL + LABEL, channels: 4, background: ground } })
    .composite([{ input: img, left: 8, top: 8 }]).png().toBuffer().then((b) => ({ b, ink }));
}

const W = PAD * 2 + COLS * CELL;
const layers = [];
let y = 0;
async function section(title, list, folder, ground, ink) {
  layers.push({ input: heading(title, W), left: 0, top: y });
  y += 40;
  for (let i = 0; i < list.length; i++) {
    const x = PAD + (i % COLS) * CELL;
    const top = y + Math.floor(i / COLS) * (CELL + LABEL);
    const { b } = await cell(join(dir, folder, `${list[i].name}.webp`), ground, ink);
    layers.push({ input: b, left: x, top });
    layers.push({ input: label(list[i].title, CELL, ink), left: x, top: top + CELL });
  }
  y += Math.ceil(list.length / COLS) * (CELL + LABEL) + 12;
}
await section('Tokens on the Atlas ground', TOKENS, 'tokens', { r: 15, g: 23, b: 36, alpha: 1 }, '#e8e2d0');
await section('Tokens on parchment', TOKENS, 'tokens', { r: 230, g: 216, b: 182, alpha: 1 }, '#3a2c1a');
await section('Portraits', PORTRAITS, 'portraits', { r: 15, g: 23, b: 36, alpha: 1 }, '#e8e2d0');
await sharp({ create: { width: W, height: y + PAD, channels: 4, background: { r: 8, g: 12, b: 20, alpha: 1 } } })
  .composite(layers).png().toFile(outFile);
console.log(`wrote ${outFile} (${W}x${y + PAD})`);
