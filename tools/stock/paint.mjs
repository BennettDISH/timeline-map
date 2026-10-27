#!/usr/bin/env node
// Paint the stock library's raw pictures with Gemini (see prompts.mjs). The anchor is painted
// first, with no reference; every other picture is painted with the anchor as its reference.
// A picture already in --out is kept (delete it, or pass --force with --only, to repaint it).
//
//   node tools/stock/paint.mjs --out <dir> [--only knight,wolf] [--anchor-only] [--force]
//
// GEMINI_API_KEY comes from the environment and is never printed. Every call (and what it cost
// in pictures) is appended to <out>/paint-log.jsonl.

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL, ANCHOR, MODEL, fullPrompt } from './prompts.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const out = opt('--out');
const only = opt('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
const force = args.includes('--force');
const anchorOnly = args.includes('--anchor-only');
if (!out) { console.error('usage: node tools/stock/paint.mjs --out <dir> [--only a,b] [--anchor-only] [--force]'); process.exit(2); }
if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY is not set'); process.exit(2); }
mkdirSync(out, { recursive: true });

const file = (name) => join(out, `${name}.png`);
const log = (row) => appendFileSync(join(out, 'paint-log.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`);

async function paint(item, refs) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [...refs.map((r) => ({ inlineData: r })), { text: fullPrompt(item) }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1' } },
    }),
    signal: AbortSignal.timeout(120000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}: ${json?.error?.message || 'no message'}`), { status: res.status });
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) throw new Error(`no picture came back${parts.length ? `: ${parts.map((p) => p.text || '').join(' ').slice(0, 200)}` : ''} (finish: ${json?.candidates?.[0]?.finishReason || 'none'})`);
  return { mimeType: img.inlineData.mimeType || 'image/png', data: img.inlineData.data, usage: json.usageMetadata };
}

async function one(item, refs) {
  const t0 = Date.now();
  try {
    const img = await paint(item, refs);
    writeFileSync(file(item.name), Buffer.from(img.data, 'base64'));
    log({ name: item.name, ok: true, mime: img.mimeType, ms: Date.now() - t0, tokens: img.usage?.totalTokenCount });
    console.log(`painted ${item.name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    return true;
  } catch (e) {
    log({ name: item.name, ok: false, error: e.message, ms: Date.now() - t0 });
    console.error(`FAILED ${item.name}: ${e.message}`);
    if (e.status === 400 || e.status === 401 || e.status === 403) throw e; // the key or the request is wrong: stop
    return false;
  }
}

const anchorItem = ALL.find((i) => i.name === ANCHOR);
if (!existsSync(file(ANCHOR)) || (force && (only?.includes(ANCHOR) ?? false))) {
  if (!(await one(anchorItem, []))) process.exit(1);
}
if (anchorOnly) process.exit(0);
const anchor = { mimeType: 'image/png', data: readFileSync(file(ANCHOR)).toString('base64') };

const todo = ALL.filter((i) => i.name !== ANCHOR && (!only || only.includes(i.name)) && (force || !existsSync(file(i.name))));
console.log(`${todo.length} to paint`);
let failed = 0;
for (let i = 0; i < todo.length; i += 3) { // three at a time
  const done = await Promise.all(todo.slice(i, i + 3).map((item) => one(item, [anchor])));
  failed += done.filter((ok) => !ok).length;
}
console.log(failed ? `${failed} failed (run again to retry them)` : 'all painted');
process.exit(failed ? 1 : 0);
