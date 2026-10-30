# Fantasy Map Timeline - Claude Instructions

## Project Overview
- Frontend: React 18 + Vite + SASS
- Backend: Express.js + PostgreSQL
- Purpose: a recursively zoomable fantasy world you scrub through time — the "Atlas" model
- Hosting: Railway (test locally first on the local stack, `e2e/local.mjs`)

The legacy map system (worlds → maps → events, `MapViewer`/`NodeEditor` and friends, ~3.5k lines)
was deleted in August 2026. **Atlas is the only map UI.** The founding vision lives in
`docs/UX-REDESIGN.md`; its roadmap is retired — `docs/RULES.md` is the current truth (the model
and every rule the code enforces), and what is still unbuilt is in `docs/ROADMAP.md`.
`docs/README.md` indexes the docs.

## Key Commands
- `npm run dev` - Start both client and server (for development structure reference only)
- `npm run build` - Build for production
- `npm test` at the root runs the server's local suites (`server/`'s `npm test`, no database or network)
- `npm install` at the root installs both (its postinstall runs `install-all`); `npm run migrate`
  in `server/` is optional — the boot applies the schema

## Testing & Deployment
- **Test locally before a push** on the local stack: `node e2e/local.mjs --build` (after `cd e2e &&
  npm install` once) runs the real server against an in-memory Postgres (PGlite on a socket, a
  devDependency of `e2e` only, never the server's), seeds a DM and a world laid out like the
  proving ground, and writes `e2e/local.config.json`; `E2E_CONFIG=e2e/local.config.json bash
  e2e/watch.sh` then runs every suite against it except the live secrecy suite. Outside services
  (R2, Waypoint, the Forge, voices) are off there, and the database dies with the process. A
  second server on the same database (`LOCAL_PORT` + 1) runs the Forge, voices and R2 against
  stubs (`e2e/stubs.cjs`: nothing leaves the machine) with tiny caps, for the spend-guard probes
  in `e2e/server.mjs`. The server reads `client/dist/index.html` once at boot: rebuild and
  restart after a client change.
  In the desktop app's browser pane it is `atlas-local` in `~/repos/.claude/launch.json`
- A schema change that drops or renames a column: `npm test` checks the sample seed
  (`server/scripts/seed-sample.js`) against the columns a fresh `schema.sql` leaves, and
  `node e2e/seed.mjs` runs it on a fresh in-memory Postgres
- Use standard commit messages without mentioning AI assistance
- Railway automatically deploys from the main branch
- **Always push changes to git when finished with a task** - commit and push automatically after completing work
- Nothing writes to the live Atlas by default. `npm test` (server/) is the local suites only;
  the API secrecy suite is `npm run test:live` (server/) or `node --test
  server/test/share-live.test.js` (from the repo root, live only: it reads the production
  fixture world, and writes nothing). The browser suites (Playwright) live in `e2e/` —
  `player.mjs` for the Player View and `dm.mjs` for the DM workspace on a throwaway world — with
  the API probes `undo.mjs`, `doors.mjs` and `server.mjs` — see `e2e/README.md`. Every suite takes
  `E2E_CONFIG` to read another config than `dm.config.json` / `player.config.json`; the four that
  write refuse any server off this machine unless `E2E_LIVE=1` (`E2E_LIVE=1 bash e2e/watch.sh`
  waits for the deploy and runs them live, on the throwaway DM account, when Bennett asks)
- The DB schema is ensured on every boot from `server/config/schema.sql` (idempotent statements,
  comment lines stripped before splitting on `;` — keep semicolons out of comments)

## Architecture
- **Atlas model**: a world is a graph of `nodes` (one identity, no copies) seen through nested `maps`;
  a node appears on a map via a `placement` (position + lifespan + visibility); `links` are
  first-class bidirectional edges. A node's `interior_map_id` is what makes it zoomable-into:
  it is where the node LEADS. A map's `owner_node_id` is whose map it is (the tree, the crumb,
  player reachability, what a delete takes). They usually match; a DOOR leads to a map it does
  not own (see Doors under Map surface rules in `docs/RULES.md`).
- Server: `server/routes/atlas.js` (the whole Atlas API), `worlds.js` (world CRUD only),
  `images.js` + `image-base64.js` + `imageFolders.js` (R2-backed image pipeline), `stock.js` +
  `lib/stock.js` (the stock tokens and portraits in `server/stock/library.json`, made by `tools/stock/`;
  a pick copies one into the world),
  `auth.js` (the Atlas's own password forms, then fleet-kit's sign-in router), `admin.js`, `share.js` (the public Player View API),
  `forge.js` + `server/forge/` (the mind), `voice.js` + `server/voice/` (voices and ambience),
  `config/auth.js` (fleet-kit's `createWaypoint`, app `atlas`: the users row by central id, the
  `__Host-atlas_session` cookie read against the row, sign-out on every device, the daily renewal
  that stamps `last_seen_at`, the old-token reader), `middleware/auth.js` (`authenticateToken` =
  the kit's session check, `requireAdmin`), `lib/security.js` (the kit's headers with the Atlas's
  CSP additions and the Player View's embed contract). From fleet-kit (vendored as
  `server/vendor/fleet-kit-1.0.6.tgz`; the client installs the same file for its top bar; a kit
  change is a new kit version, never a re-packed tarball, and never edited here): trust proxy 1,
  the request log (one line per request: id, method, path with no query string and tokens as
  `:token`, status, time; the id is `X-Request-Id` and the error handler logs with it), the
  same-origin write guard, the rate limits, `/health`, the JSON 404 and the error handler,
  `/auth/callback` and the `/admin` page gate (`server.js`),
  the R2 store under `storage.js` (every call is given up on after 15 s; immutable Cache-Control on every put and copy; `storage.js` keeps
  the public URLs and `R2_LEGACY_PUBLIC_URLS` while stored URLs move to the custom
  domain, `scripts/rewrite-media-host.js`, see `docs/R2-SETUP.md`), `lib/validate.js` + `lib/vocab.js` (input rules and the category list)
- Client: `pages/AtlasWorkspace.jsx` (the workspace: state, canvas, timebar, reader, dialogs) with
  its panels in `components/atlas/` (`Inspector`, `ForgePanel`, `MapTree`, `TimelineConfig`,
  `Pickers` = ImagePicker + NodePicker + MapPicker, `DeleteImpact`, and `helpers.js` they share) + `components/MapPlane.jsx` (shared pan/zoom world plane —
  pins are % of the backdrop image's plane, NOT the window) + `services/atlasService.js`;
  all authed services share `services/http.js` (the session is the cookie; a 401 is the
  dead-session redirect). The games' top bar is fleet-kit's `<fleet-topbar>` (`components/GamesBar.jsx`,
  driven by `SiteBar.jsx`, which takes over its menu)
- Supporting pages: `Dashboard` (world select → Atlas), `PlayerView` (`/p/:token`), `Archive`
  (a world's images: `/worlds/:id/images`, root class `.arch`, `archive.scss`), `AdminPanel` (`/admin`: every account, world, map, entry, era, image and Forge chat, look-only, searchable, 50 a page) and `AdminWorld` (`/admin/worlds/:id`: one world read-only, its maps with every pin, entries, eras, images and Forge history; the API is `GET /api/admin/*` in `admin.js`, gated by ADMIN_CENTRAL_USER_IDS), `Login`, `NotFound` (the pre-SSO Setup/EnvSetup pages and `/api/setup` are gone: the schema is
  ensured on boot and admin is a Waypoint identity)
- **Admin: /admin, Waypoint id 1 only (ADMIN_CENTRAL_USER_IDS=1).** Everything the admin has is
  there: `client/src/pages/AdminPanel.jsx` (the browse tabs, the Railway switches read-only, the
  database check), `AdminWorld.jsx`, `components/admin/` (`AdminOnly.jsx` is what anyone else sees:
  "This page is for the site admin."), and `GET /api/admin/*` in `server/routes/admin.js`
  (`/site` = the switches, read-only), tested in `server/test/admin.test.js`. The server decides
  the page before it goes out (fleet-kit's `adminPage`, run for every path `isAdminPath` in
  `config/auth.js` calls an admin page as the page's router reads it, so `/ADMIN` and `/%61dmin`
  too: signed out → sign in and back, anyone else → a plain 403; `server/test/admin-page.test.js`),
  and every admin API refuses a non-admin with a 403. The "Admin" link
  (`components/TopBar.jsx`) shows to the admin only.

## Key invariants (the whole rule for each is in `docs/RULES.md`)
- **All secrecy is enforced in `server/routes/share.js`, server-side**: DM-only nodes and
  placements, out-of-time placements, DM notes (`nodes.dm_note`, `maps.dm_note`, `nodes.stance`)
  and everything a pending Forge batch wrote never leave the database. The DM-side 🎭 Player
  posture is an iframe of the share link, so it can never drift from these rules. (Sharing,
  Timeline semantics, The Forge)
- **Every node is born DM-only**, manual or Forge-born; revealing is always a deliberate act. The
  one exception is a player's own marker (forced 'player'). (Sharing, Player markers)
- **Production holds a real campaign**: migrations are additive (`ADD COLUMN IF NOT EXISTS`),
  never a recreate, and anything destructive gets a snapshot first. Undo and world clone insert
  from one column list per table (`NODE_COLS`/`MAP_COLS`/`MIND_COLS` in `atlas.js`): add every
  new content column there. (Database)
- **Autosave contract** (`AtlasWorkspace.jsx`): every write goes through `track()`, each kind of
  edit has its own debounce clock and pending payload, and a refused save is never dropped.
  (Development Guidelines)
- **Every delete is undoable** (tombstones and the ↩ Undo toast), and **the server stays up**
  (no exit on a pool error, `pool.connectTx()` for transactions). (Development Guidelines)
- Every write route cleans its body with `server/lib/validate.js`: a refused input is a 400 with
  one plain sentence, anything not the caller's is a 404. (Input rules, API conventions)
- **`GET /health` checks the database** (fleet-kit's `health`, in `server.js`): `SELECT 1` on the
  pool with a 3 s timeout, 200 `{status, db:'ok', commit, timestamp}` or 503 `{status:'unavailable',
  db:'not answering', …}` with no database text, `Cache-Control: no-store`. `commit` is the deploy
  signal the live suites wait for; keep it. It is Railway's healthcheck path (saved on the
  service). `server/test/health.test.js` covers it, including the real
  server against a refused database.
- **Guests: yes, because** Spellforge's Map tab opens the Atlas for guests and a try-it door suits
  a table game; their AI, voice and upload use is capped per guest and idle guests are swept (see
  Sign-in in `docs/RULES.md`). Admin is Waypoint id 1 only (`ADMIN_CENTRAL_USER_IDS=1`).
- One word for one thing in every string players or the DM read (map, entry, thread, canon …).
  (Vocabulary)
- Mobile is view-only by design: editing happens on a PC. (Known gaps)

## The rules: `docs/RULES.md`
`docs/RULES.md` is the design spec: the model and every rule the code enforces, by area. Read
the sections for the area you touch before changing it, and **update RULES.md in the same commit
when behaviour changes**. Its sections: Sign-in, accounts and image storage · Database ·
Development Guidelines · Sharing (Player View) · Timeline semantics · Player markers · The Forge ·
The spend guard · Voice · Cleanup list · Image rules · Map surface rules · Vocabulary · Inspector
rules · API conventions · Input rules · Known gaps.
