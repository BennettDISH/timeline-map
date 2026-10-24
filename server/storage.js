const {
  S3Client,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');

// Object storage for uploaded images. When all five R2_* vars are set, files go to Cloudflare R2
// (one bucket, per-world key prefixes) and are served from R2's public URL; the images table keeps
// only the object key and the absolute URL. With any var missing R2 is off and nothing is stored:
// uploads and Forge paintings answer 503 (lib/storeImage.js) instead of putting bytes in Postgres.
// Old rows that still hold base64_data are read back by /api/images-base64/serve until
// scripts/move-base64-to-r2.js has copied them out.
//
// R2_PUBLIC_URL is the bucket's public address: the custom domain
// (https://atlas-media.bennettdishmanmedia.com) or, before that, the rate-limited r2.dev one.
// While stored URLs are being moved from the old address to the new (scripts/rewrite-media-host.js),
// R2_LEGACY_PUBLIC_URLS lists the old address(es), comma separated, so keyFromUrl still finds the
// object behind a row that has not been rewritten yet. Drop it once the rewrite has run.
//
// Every key is minted once and never written twice (a unique file name per upload, per Forge
// painting, per voice line, per world copy), so each object is cached for good (immutable).
//
// Ported from content-platform/server/storage.js, which is ESM; this server is CommonJS, so it is
// rewritten with require/module.exports rather than copied verbatim.

const origin = (s) => String(s || '').trim().replace(/\/+$/, '');

const cfg = {
  accountId: process.env.R2_ACCOUNT_ID || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || '',
  publicUrl: origin(process.env.R2_PUBLIC_URL),
  legacyUrls: (process.env.R2_LEGACY_PUBLIC_URLS || '').split(',').map(origin).filter(Boolean),
};

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

// True when R2 is fully configured and active.
const r2Enabled = Boolean(
  cfg.accountId && cfg.accessKeyId && cfg.secretAccessKey && cfg.bucket && cfg.publicUrl
);

const client = r2Enabled
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    })
  : null;

// A call to the bucket that takes longer than this is given up on, so a bucket that stops
// answering cannot hold a request (or a world delete) open for good.
const R2_TIMEOUT_MS = 15_000;
const send = (command) => client.send(command, { abortSignal: AbortSignal.timeout(R2_TIMEOUT_MS) });

// Upload a buffer to R2; returns the public URL.
async function putObject(key, body, contentType) {
  await send(
    new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: CACHE_CONTROL })
  );
  return `${cfg.publicUrl}/${key}`;
}

// Copy an object inside the bucket (a world clone taking ownership of its art); returns the
// new public URL. With the type given, the copy is stored with the immutable Cache-Control too
// (an object put before that header existed has none, and a plain copy would carry that over).
async function copyObject(srcKey, dstKey, contentType) {
  await send(new CopyObjectCommand({
    Bucket: cfg.bucket, CopySource: `/${cfg.bucket}/${encodeURI(srcKey)}`, Key: dstKey,
    ...(contentType ? { MetadataDirective: 'REPLACE', ContentType: contentType, CacheControl: CACHE_CONTROL } : {}),
  }));
  return `${cfg.publicUrl}/${dstKey}`;
}

// The size of an object in bytes, or null when it is not there (the old-row mover checks that a
// copy landed before it clears the row's base64).
async function objectSize(key) {
  try {
    const head = await send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return head.ContentLength;
  } catch (e) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

// Delete one object from R2 (no-op if the key is missing or R2 is off).
async function deleteObject(key) {
  if (!key || !client) return;
  await send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

// Delete every object under a prefix (world delete uses it).
async function deletePrefix(prefix) {
  if (!client) return;
  let token;
  do {
    const page = await send(
      new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token })
    );
    const keys = (page.Contents || []).map((o) => ({ Key: o.Key }));
    if (keys.length) {
      await send(
        new DeleteObjectsCommand({ Bucket: cfg.bucket, Delete: { Objects: keys } })
      );
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

// The object key behind one of our public URLs (null for anything else): an address under
// R2_PUBLIC_URL, or under one of R2_LEGACY_PUBLIC_URLS until the stored URLs are rewritten.
function keyFromUrl(url) {
  if (!url || !cfg.publicUrl) return null;
  const s = String(url);
  for (const base of [cfg.publicUrl, ...cfg.legacyUrls]) {
    if (s.startsWith(`${base}/`)) return s.slice(base.length + 1);
  }
  return null;
}

module.exports = { r2Enabled, putObject, copyObject, objectSize, deleteObject, deletePrefix, keyFromUrl, CACHE_CONTROL, R2_TIMEOUT_MS };
