# Fantasy Map Timeline — the Atlas

A recursively zoomable fantasy world you scrub through time. A DM builds it on a PC; players
open a share link on their phones and see only what the DM has revealed, at the canon moment.

**Start with `CLAUDE.md`.** It is the always-current description of the model, the rules the
code enforces, and how to work on the repo (no local server: push to `main`, Railway deploys,
the live suites prove it).

## Doc map
- `CLAUDE.md` — the truth: architecture, the timeline and secrecy rules, the Forge, voice, input rules.
- `docs/UX-REDESIGN.md` — the founding vision (its roadmap is retired).
- `docs/cleanup/README.md` — the 2026-09-26 whole-app audit and its work packages.
- `docs/R2-SETUP.md` — Cloudflare R2 storage setup.
- `e2e/README.md` — the live suites: the API secrecy tests, the Player View, DM, undo and server probes.
- `server/test/FIXTURE.md` — the production fixture world the secrecy suite reads.

## Stack
React 18 + Vite + SASS (`client/`) · Express + Postgres (`server/`) · JWT auth with optional
server-side Waypoint SSO and guest sign-in · Cloudflare R2 for art (base64-in-Postgres fallback)
· optional Gemini "Forge" (a per-world mind) and Gemini/OpenAI/ElevenLabs voices.

## Getting started
Requires Node 18+ and a Postgres database.

```bash
npm install                  # the root postinstall installs server/ and client/
cp .env.example server/.env  # DATABASE_URL, JWT_SECRET, … (see the comments in the file)
npm run dev                  # server + client together
```

The schema is applied on every server boot from `server/config/schema.sql`; `cd server && npm run
migrate` runs the same statements by hand if you want to see them land first.

Production: `npm run build` then `npm start` (Railway runs both from `main`).

## Layout
- `client/src/pages/` — **AtlasWorkspace** (`/w/:worldId/m/:mapId`, the editor), **PlayerView**
  (`/p/:token`, the public read-only share), Dashboard, ImageManager (the Archive), AdminPanel,
  Login, AuthCallback, NotFound.
- `server/routes/` — **atlas** (the whole Atlas API), **share** (the tokened Player View API and
  the secrecy boundary), **forge**, **voice**, worlds, images, image-base64, imageFolders, auth, admin.
- `server/lib/validate.js` — the one set of input rules every write route uses.
- `server/config/apply-schema.js` — reads schema.sql into statements for the boot-time ensure and `migrate.js`.

## Tests
Everything runs against the live deploy. `bash e2e/watch.sh` waits for the deploy of the local
HEAD and runs every suite in order; `node --test server/test/share-live.test.js` is the secrecy
suite on its own. Details and the config files in `e2e/README.md`.

## Sign-in
"Sign in with Waypoint" is wired entirely server-side (`AUTH_SERVICE_URL`, `SSO_CLIENT_ID`,
`SSO_CLIENT_SECRET`); the client discovers it through `GET /api/auth/config`. Without those,
username/password accounts work on their own.
