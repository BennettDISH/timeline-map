const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');

// Object storage for uploaded images. The driver is picked by env: when all five R2_* vars are
// set, files go to Cloudflare R2 (one bucket, per-world key prefixes) and are served from R2's
// public URL; otherwise the app falls back to storing bytes as base64 in Postgres (images.base64_data)
// served by /api/images-base64/serve. Swapping drivers changes only where bytes live — the images
// table/API stay identical.
//
// Ported from content-platform/server/storage.js, which is ESM; this server is CommonJS, so it is
// rewritten with require/module.exports rather than copied verbatim.

const cfg = {
  accountId: process.env.R2_ACCOUNT_ID || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || '',
  publicUrl: (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, ''),
};

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

// Upload a buffer to R2; returns the public URL.
async function putObject(key, body, contentType) {
  await client.send(
    new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType })
  );
  return `${cfg.publicUrl}/${key}`;
}

// Delete one object from R2 (no-op if the key is missing or R2 is off).
async function deleteObject(key) {
  if (!key || !client) return;
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

// Delete every object under a prefix (for future world/folder purges).
async function deletePrefix(prefix) {
  if (!client) return;
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token })
    );
    const keys = (page.Contents || []).map((o) => ({ Key: o.Key }));
    if (keys.length) {
      await client.send(
        new DeleteObjectsCommand({ Bucket: cfg.bucket, Delete: { Objects: keys } })
      );
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

module.exports = { r2Enabled, putObject, deleteObject, deletePrefix };
