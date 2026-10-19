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
- Use standard commit messages without mentioning AI assistance
- Railway automatically deploys from the main branch
- **Always push changes to git when finished with a task** - commit and push automatically after completing work
- After a push the suites run against the LIVE deploy (`bash e2e/watch.sh` waits for it): the
  API secrecy suite is `node --test server/test/share-live.test.js` (from the repo root, live
  only: it reads the production fixture world); the browser suites (Playwright) live in `e2e/` —
  `player.mjs` for the Player View and `dm.mjs` for the DM workspace on a throwaway world — with
  the API probes `undo.mjs`, `doors.mjs` and `server.mjs` — see `e2e/README.md`. Every suite takes
  `E2E_CONFIG` to read another config than `dm.config.json` / `player.config.json`
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
  `images.js` + `image-base64.js` + `imageFolders.js` (R2-backed image pipeline),
  `auth.js` (JWT + server-side SSO), `admin.js`, `share.js` (the public Player View API),
  `forge.js` + `server/forge/` (the mind), `voice.js` + `server/voice/` (voices and ambience),
  `storage.js` (R2), `lib/validate.js` + `lib/vocab.js` (input rules and the category list)
- Client: `pages/AtlasWorkspace.jsx` (the workspace: state, canvas, timebar, reader, dialogs) with
  its panels in `components/atlas/` (`Inspector`, `ForgePanel`, `MapTree`, `TimelineConfig`,
  `Pickers` = ImagePicker + NodePicker + MapPicker, `DeleteImpact`, and `helpers.js` they share) + `components/MapPlane.jsx` (shared pan/zoom world plane —
  pins are % of the backdrop image's plane, NOT the window) + `services/atlasService.js`;
  all authed services share `services/http.js` (token header + dead-token redirect)
- Supporting pages: `Dashboard` (world select → Atlas), `PlayerView` (`/p/:token`), `Archive`
  (a world's images: `/worlds/:id/images`, root class `.arch`, `archive.scss`), `AdminPanel`, `Login`, `AuthCallback`, `NotFound` (the pre-SSO Setup/EnvSetup pages and `/api/setup` are gone: the schema is
  ensured on boot and admin is a Waypoint identity)

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
