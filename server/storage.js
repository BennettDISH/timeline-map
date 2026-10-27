const { createR2Store, PUBLIC_CACHE, R2_TIMEOUT_MS } = require('fleet-kit/server/r2');

// Object storage for uploaded images. When all five R2_* vars are set, files go to Cloudflare R2
// (one bucket, per-world key prefixes) and are served from R2's public URL; the images table keeps
// only the object key and the absolute URL. With any var missing R2 is off and nothing is stored:
// uploads and Forge paintings answer 503 (lib/storeImage.js) instead of putting bytes in Postgres.
// Old rows that still hold base64_data are read back by /api/images-base64/serve until
// scripts/move-base64-to-r2.js has copied them out.
//
// The bucket itself is fleet-kit's R2 store: every call is given up on after 15 s, so a bucket that
// stops answering cannot hold a request (or a world delete) open for good, and every object is put
// and copied with the immutable Cache-Control (every key is minted once and never written twice: a
// unique file name per upload, per Forge painting, per voice line, per world copy). This file keeps
// the Atlas's own side: the answers as public URLs, and the old addresses below.
//
// R2_PUBLIC_URL is the bucket's public address: the custom domain
// (https://atlas-media.bennettdishmanmedia.com) or, before that, the rate-limited r2.dev one.
// While stored URLs are being moved from the old address to the new (scripts/rewrite-media-host.js),
// R2_LEGACY_PUBLIC_URLS lists the old address(es), comma separated, so keyFromUrl still finds the
// object behind a row that has not been rewritten yet. Drop it once the rewrite has run.

const origin = (s) => String(s || '').trim().replace(/\/+$/, '');

const publicUrl = origin(process.env.R2_PUBLIC_URL);
const legacyUrls = (process.env.R2_LEGACY_PUBLIC_URLS || '').split(',').map(origin).filter(Boolean);

// The bucket, or null when any of the five vars is missing (a public bucket needs R2_PUBLIC_URL).
const store = createR2Store({ ...process.env, R2_PUBLIC_URL: publicUrl }, { isPublic: true });
const r2Enabled = Boolean(store);
const CACHE_CONTROL = PUBLIC_CACHE;

function bucket() {
  if (!store) throw new Error('R2 is not configured');
  return store;
}

// Upload a buffer to R2; returns the public URL.
async function putObject(key, body, contentType) {
  await bucket().put(key, body, contentType);
  return store.publicUrl(key);
}

// Copy an object inside the bucket (a world clone taking ownership of its art); returns the new
// public URL. The copy carries the immutable Cache-Control (an object put before that header
// existed has none), under the type given or, without one, the source's own.
async function copyObject(srcKey, dstKey, contentType) {
  await bucket().copy(srcKey, dstKey, contentType ? { contentType } : {});
  return store.publicUrl(dstKey);
}

// The size of an object in bytes, or null when it is not there (the old-row mover checks that a
// copy landed before it clears the row's base64).
async function objectSize(key) {
  const head = await bucket().head(key);
  return head ? head.length : null;
}

// Delete one object from R2 (no-op if the key is missing or R2 is off).
async function deleteObject(key) {
  if (!key || !store) return;
  await store.del(key);
}

// Delete every object under a prefix (world delete uses it); a no-op when R2 is off.
async function deletePrefix(prefix) {
  if (!store) return;
  await store.deletePrefix(prefix);
}

// The object key behind one of our public URLs (null for anything else): an address under
// R2_PUBLIC_URL, or under one of R2_LEGACY_PUBLIC_URLS until the stored URLs are rewritten.
function keyFromUrl(url) {
  if (!url || !publicUrl) return null;
  const s = String(url);
  for (const base of [publicUrl, ...legacyUrls]) {
    if (s.startsWith(`${base}/`)) return s.slice(base.length + 1);
  }
  return null;
}

module.exports = { r2Enabled, putObject, copyObject, objectSize, deleteObject, deletePrefix, keyFromUrl, CACHE_CONTROL, R2_TIMEOUT_MS };
