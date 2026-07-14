# timeline-map

An interactive fantasy-map timeline tool: build worlds, upload map images, place events across a map,
and scrub through time to see how a world changes. Your most-developed app.

## Stack
React 18 + Vite (`client/`) · Express + Postgres (`server/`) · JWT auth · monorepo

## Getting started
Requires Node and a Postgres database.

```bash
npm run install-all          # installs client + server
cp server/.env.example server/.env    # DATABASE_URL, JWT_SECRET, FRONTEND_URL, MAX_FILE_SIZE, ...
cd server && npm run migrate # create tables

npm run dev                  # runs server + client together (concurrently)
```

Production: `npm run build` then `npm start`.

## Layout
- `client/src/pages/` — MapViewer, MapManager, MapSettings, WorldSettings, ImageManager, Dashboard,
  AdminPanel, Login, AuthCallback, Setup/EnvSetup.
- `server/routes/` — worlds, maps, events, images, imageFolders, **image-base64**, auth, admin, setup.
- `server/config/migrate.js` — schema/migrations.

## SSO
Optional "Sign in with bennettdishman.com" is wired **entirely server-side** — the OAuth
`/oauth/authorize` URL is built on the server from `AUTH_SERVICE_URL` + `SSO_CLIENT_ID`, so nothing
is baked into the client bundle (no `VITE_` vars). Set `AUTH_SERVICE_URL`, `SSO_CLIENT_ID`, and
`SSO_CLIENT_SECRET` on the server to enable it. The client discovers whether SSO is on via
`GET /api/auth/config` and starts the flow at `GET /api/auth/sso/login`.

## Deploy
Railway.

## Notes
⚠️ **Priority upgrade (P1 in `../PORTFOLIO.md`):** images are stored as **base64 in Postgres**
(`routes/image-base64.js`, `images.base64_data`) and served through an API endpoint. Migrate to
Cloudflare R2 — **`close-social-media` already has a working R2 implementation to copy.** Railway disk is
ephemeral, which is why base64/DB storage was used; R2 is the correct fix.
