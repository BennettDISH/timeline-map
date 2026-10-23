# Fantasy Map Timeline — the Atlas

A recursively zoomable fantasy world you scrub through time. A DM builds it on a PC; players
open a share link on their phones and see only what the DM has revealed, at the canon moment.

Live: https://timeline-map-production.up.railway.app (GitHub: `timeline-map`).

**Start with `CLAUDE.md`, then `docs/RULES.md`.** CLAUDE.md is how to work on the repo (prove a
change on the local stack, push to `main`, Railway deploys, the live suites prove it again), the
file map and the key invariants; RULES.md is the always-current description of the model and
every rule the code enforces.

## Doc map
- `CLAUDE.md` — working notes: commands, the local stack, the file map, the key invariants.
- `docs/RULES.md` — the truth: the timeline and secrecy rules, the Forge, voice, input rules, by area.
- `docs/README.md` — the index of everything in `docs/`.
- `docs/ROADMAP.md` — open ideas, planned work and known issues.
- `docs/UX-REDESIGN.md` — the founding vision (its roadmap is retired).
- `docs/cleanup/README.md` — the 2026-09-26 whole-app audit and its work packages.
- `docs/R2-SETUP.md` — Cloudflare R2 storage setup.
- `e2e/README.md` — the suites (the API secrecy tests, the Player View, DM, undo, doors and server
  probes) and the local stack they also run against.
- `server/test/FIXTURE.md` — the production fixture world the secrecy suite reads.

## Stack
React 18 + Vite + SASS (`client/`) · Express + Postgres (`server/`) · JWT auth with optional
server-side Waypoint SSO and guest sign-in · Cloudflare R2 for art (nothing stored in Postgres)
· optional Gemini "Forge" (a per-world mind) and Gemini/OpenAI/ElevenLabs voices.

## Getting started
Requires Node 22 (the root `engines` pins 22.x, which is what Railway builds with; Vite needs
20.19+) and a Postgres database.

```bash
npm install                  # the root postinstall installs server/ and client/
cp .env.example server/.env  # DATABASE_URL, JWT_SECRET, … (see the comments in the file)
npm run dev                  # server + client together
```

The schema is applied on every server boot from `server/config/schema.sql`; `cd server && npm run
migrate` runs the same statements by hand if you want to see them land first.

Production: `npm run build` then `npm start` (Railway runs both from `main`).

## Deploy
Railway, the `timeline-map` service with its own Postgres. A push to `main` deploys (nixpacks,
`npm start`, health check `/health`, see `railway.toml`). `/health` runs `SELECT 1` against the
database (3 s limit), answers 503 when that fails, and reports the running commit. Production holds a real campaign, so
schema changes are additive only (see Database in `docs/RULES.md`).

Admin: `/admin`, Waypoint id 1 only (`ADMIN_CENTRAL_USER_IDS=1`) — every account, world, map,
entry, era, image and Forge chat, look-only, and the Railway switches as they stand.

## Environment variables
Names only; `.env.example` explains each.
- Core: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `NODE_ENV`, `PORT`
- Waypoint sign-in: `AUTH_SERVICE_URL`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `APP_BASE_URL`,
  `ADMIN_CENTRAL_USER_IDS`
- Guests: `GUEST_RETENTION_DAYS`, `GUEST_CLEANUP_ENABLED`
- Images (all five turn R2 on): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET`, `R2_PUBLIC_URL`
- The Forge: `GEMINI_API_KEY`, `FORGE_ENABLED`, `FORGE_TEXT_MODEL`, `FORGE_IMAGE_MODEL`
- Voices: `VOICE_PROVIDER`, `VOICE_ENABLED`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`,
  `VOICE_TTS_MODEL`, `VOICE_TTS_MODEL_GEMINI`, `VOICE_TTS_MODEL_OPENAI`, `VOICE_TTS_MODEL_ELEVENLABS`
- Daily spend caps (per account, per guest, everyone together): `FORGE_DAILY_CAP`,
  `FORGE_DAILY_CAP_GUEST`, `FORGE_DAILY_CEILING`, `VOICE_DAILY_CAP`, `VOICE_DAILY_CAP_GUEST`,
  `VOICE_DAILY_CEILING`, and image uploads in MB: `UPLOAD_DAILY_CAP`, `UPLOAD_DAILY_CAP_GUEST`,
  `UPLOAD_DAILY_CEILING`
- Embedding and the bug widget: `EMBED_ORIGINS`, `BUG_WIDGET_KEY`

## Layout
- `client/src/pages/` — **AtlasWorkspace** (`/w/:worldId/m/:mapId`, the editor), **PlayerView**
  (`/p/:token`, the public read-only share), Dashboard, Archive (the world's images), AdminPanel,
  Login, AuthCallback, NotFound.
- `server/routes/` — **atlas** (the whole Atlas API), **share** (the tokened Player View API and
  the secrecy boundary), **forge**, **voice**, worlds, images, image-base64, imageFolders, auth, admin.
- `server/lib/validate.js` — the one set of input rules every write route uses.
- `server/config/apply-schema.js` — reads schema.sql into statements for the boot-time ensure and `migrate.js`.

## Tests
Before a push, `node e2e/local.mjs --build` runs the real server on an in-memory Postgres
(PGlite) with a seeded proving-ground world, and `E2E_CONFIG=e2e/local.config.json bash
e2e/watch.sh` runs every suite against it but the live secrecy suite. `npm test` in `server/`
runs the local suites only. Against the live deploy, only on purpose: `E2E_LIVE=1 bash
e2e/watch.sh` waits for the deploy of the local HEAD and runs every suite in order against it
(the writing suites work on a throwaway world and remove what they made); `npm run test:live`
in `server/` is the read-only secrecy suite on its own. Details and the config files in
`e2e/README.md`.

## Sign-in
"Sign in with Waypoint" is wired entirely server-side (`AUTH_SERVICE_URL`, `SSO_CLIENT_ID`,
`SSO_CLIENT_SECRET`); the client discovers it through `GET /api/auth/config`. Without those,
username/password accounts work on their own.
