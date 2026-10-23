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
   (Later you can attach a custom domain here instead; just update the env var.)

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

## How it behaves
- **All five vars must be set** or image storage is off (`server/storage.js` `r2Enabled` gate) and
  uploads answer 503. Check by uploading — R2 URLs start with your `R2_PUBLIC_URL`.
- Keys are prefixed per world (`worlds/<worldId>/...`).
- Deleting an image removes its R2 object (`server/routes/images.js` DELETE).
- Upload size is bounded by the upload route's own `express.json({ limit: '14mb' })` in
  `server/server.js` (base64 is 4/3 of the file, so about a 10 MB image).
