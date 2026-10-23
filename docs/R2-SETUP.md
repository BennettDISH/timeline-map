# R2 Setup (click-by-click)

Images are stored on **Cloudflare R2** only — nothing is kept in Postgres. Without the R2 setup
below, uploads and Forge paintings answer 503 ("this server has no image storage (R2) set up").
Old rows that still hold base64 keep working at their old URLs (`/api/images-base64/serve/:filename`)
until `node server/scripts/move-base64-to-r2.js --apply` copies them to R2 (dry run by default;
take a database backup first).

## 1. Create the bucket
1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket**.
2. Name it (e.g. `timeline-map`), region Automatic → **Create bucket**.

## 2. Enable public access (so the app can load images)
1. Open the bucket → **Settings** → **Public access** → **R2.dev subdomain** → **Allow Access**.
2. Copy the URL it gives you, e.g. `https://pub-xxxxxxxxxxxx.r2.dev` — this is `R2_PUBLIC_URL`.
   (Better: attach a custom domain instead, see "Serving from a custom domain" below. r2.dev is rate
   limited and not meant for production traffic.)

## 3. Create an API token
1. R2 overview page → **Manage R2 API Tokens** → **Create API Token**.
2. Permissions: **Object Read & Write**. Scope: **Apply to specific buckets** → pick your bucket.
3. Create, then copy the **Access Key ID** and **Secret Access Key** (shown once).
4. Your **Account ID** is shown on the same page (also in the dashboard URL).

## 4. Set the env vars on Railway
On the **timeline-map service** (not the database), add:

| Variable | Value |
|---|---|
| `R2_ACCOUNT_ID` | your Cloudflare account id |
| `R2_ACCESS_KEY_ID` | from step 3 |
| `R2_SECRET_ACCESS_KEY` | from step 3 |
| `R2_BUCKET` | your bucket name |
| `R2_PUBLIC_URL` | from step 2 (no trailing slash) |

Railway redeploys automatically. New uploads now go to R2 with keys like
`worlds/<worldId>/<filename>`, and image URLs become fast Cloudflare-edge URLs.

## Serving from a custom domain
Production serves its media from `https://atlas-media.bennettdishmanmedia.com`, not r2.dev.
1. Cloudflare dashboard → the bucket → **Settings** → **Custom Domains** → **Add** →
   `atlas-media.bennettdishmanmedia.com`. Wait for it to say Active, then open
   `https://atlas-media.bennettdishmanmedia.com/<any existing key>` (a `worlds/<id>/<file>` from the
   Archive) to see it load. A custom domain makes the WHOLE bucket public: only this app's `worlds/`
   keys may be in it.
2. On the timeline-map service set `R2_PUBLIC_URL=https://atlas-media.bennettdishmanmedia.com` and
   `R2_LEGACY_PUBLIC_URLS=<the old https://pub-….r2.dev>`. New uploads now get the new address, and
   deleting a voice line or ambience still finds its object under either one.
3. Stored rows still hold the old address. After a `pg_dump`, and with Bennett's OK, from `server/`:
   `node scripts/rewrite-media-host.js` (the dry run: counts per column), then `--apply`. It rewrites the
   leading address of `images.file_path`, `nodes.voice_url` and `maps.ambience_url` in one transaction,
   touches nothing else, and a second run finds 0. `--from` defaults to the first
   `R2_LEGACY_PUBLIC_URLS` and `--to` to `R2_PUBLIC_URL`.
4. Remove `R2_LEGACY_PUBLIC_URLS`. Leave r2.dev enabled for a day more: undo snapshots (24 hours) and
   browsers' caches may still hold the old addresses.

Every object is put with `Cache-Control: public, max-age=31536000, immutable` (a key is never written
twice). Objects put before that have no header; the edge's own caching still serves them, and a world
copy re-stores its copies with it. New PNG and JPEG uploads are shrunk to WebP in the browser first
(`client/src/utils/shrinkImage.js`: at most 4096 px, quality 0.85; GIFs and WebPs go up as they are).

## How it behaves
- **All five vars must be set** or image storage is off (`server/storage.js` `r2Enabled` gate) and
  uploads answer 503. Check by uploading — R2 URLs start with your `R2_PUBLIC_URL`.
- Keys are prefixed per world (`worlds/<worldId>/...`).
- Deleting an image removes its R2 object (`server/routes/images.js` DELETE).
- Upload size is bounded by the upload route's own `express.json({ limit: '14mb' })` in
  `server/server.js` (base64 is 4/3 of the file, so about a 10 MB image).
