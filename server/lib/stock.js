const crypto = require('node:crypto');
const { MEDIA_ORIGIN } = require('./security');

// The stock library: 24 tokens and 12 portraits painted once for every world (tools/stock/ makes
// them), served from the games' media bucket under content-hashed names. server/stock/library.json
// is the list; nothing outside it can be fetched. A pick copies the picture into the world
// (routes/stock.js), so from then on it is an ordinary image of that world: in its Archive, under
// its key prefix, cloned and deleted with it.
const library = require('../stock/library.json');

const KINDS = ['token', 'portrait'];
const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_MS = 15000;

// "…/atlas/stock/tokens/wolf-1a2b3c4d.webp" -> "1a2b3c4d" (the first 8 hex of the bytes' sha256)
const hashOf = (src) => /-([0-9a-f]{8})\.webp$/.exec(String(src || ''))?.[1] || null;

const items = (library.items || []).filter((i) => KINDS.includes(i.kind)
  && String(i.src || '').startsWith(`${MEDIA_ORIGIN}/atlas/stock/`) && hashOf(i.src));
const byName = new Map(items.map((i) => [i.name, i]));

// what the picker is sent: the same for everyone
const list = () => items.map(({ name, title, kind, group, src }) => ({ name, title, kind, group, url: src }));

// The file name a world keeps its copy under, the same for every pick of the same picture: a
// second pick finds the first copy, and a key is only ever written with these exact bytes.
const fileName = (item) => `stock-${item.name}-${hashOf(item.src)}.webp`;

const isWebp = (b) => b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP';

// The picture's bytes from the media bucket, checked against the hash in its name (so a changed
// or wrong object is never copied into a world). Throws on anything else.
async function fetchStock(item, fetchImpl = fetch) {
  const res = await fetchImpl(item.src, { signal: AbortSignal.timeout(FETCH_MS) });
  if (!res.ok) throw new Error(`stock fetch ${item.name}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(`stock fetch ${item.name}: ${buf.length} bytes`);
  if (!isWebp(buf)) throw new Error(`stock fetch ${item.name}: not a WebP`);
  const got = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
  if (got !== hashOf(item.src)) throw new Error(`stock fetch ${item.name}: hash ${got} is not the name's ${hashOf(item.src)}`);
  return buf;
}

module.exports = { CREDIT: library.credit || '', list, byName, fileName, fetchStock, hashOf, MAX_BYTES };
