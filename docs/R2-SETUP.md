# R2 Setup (click-by-click)

Image upload works out of the box with **no setup** — bytes land in Postgres as base64 and are
served by `/api/images-base64/serve/:filename`. To switch to **Cloudflare R2** (recommended for
anything real), do the following once; uploads then go to R2 automatically. Existing base64 rows
keep working at their old URLs — no migration needed.

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
- **All five vars must be set** or the app stays on the Postgres base64 fallback (`server/storage.js`
  `r2Enabled` gate). Check by uploading — R2 URLs start with your `R2_PUBLIC_URL`.
- Keys are prefixed per world (`worlds/<worldId>/...`).
- Deleting an image removes its R2 object (`server/routes/images.js` DELETE).
- Upload size is bounded by `express.json({ limit: '10mb' })` in `server/server.js` (base64 body).
  Raising it (or moving to multipart) is a future enhancement once R2 is proven.
