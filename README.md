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
**Image storage:** Cloudflare R2 is the primary store — uploads go to R2 whenever all five `R2_*`
vars are set (`server/storage.js`, `r2Enabled`). Base64-in-Postgres (`images.base64_data`, served by
`/api/images-base64/serve`) is the deliberate fallback when R2 is off, and is also what world clones
use: `routes/atlas.js` duplicates image rows with `storage_key NULL` so clones never cascade-delete
each other's R2 objects. Both paths are live; neither is dead code.
