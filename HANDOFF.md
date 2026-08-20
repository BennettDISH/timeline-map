# HANDOFF — fantasy-map-timeline (the Atlas)

Pick-up doc for a fresh session. **`CLAUDE.md` is the always-current source of truth** — read it
first and trust it over this file. `docs/UX-REDESIGN.md` holds the vision and roadmap;
`docs/READINESS.md` holds the audit history.

## What this is

A recursively zoomable fantasy world you scrub through time, for DMs and their players.
React 18 + Vite client (`client/`), Express + Postgres server (`server/`), Railway auto-deploy
from `main`. The world is a graph of `nodes` (one identity, no copies) seen through nested
`maps` via `placements`; `links` are first-class edges; a node's `interior_map_id` is what makes
it zoomable-into. The legacy map system was deleted in August 2026 — **Atlas is the only map UI**,
and it has been running in production for a while. Almost everything lives in
`client/src/pages/AtlasWorkspace.jsx`, `server/routes/atlas.js`, and `server/routes/share.js`.

## How to work

- **No local server.** Build-verify only: `cd client && npm run build` for client changes,
  `node --check <file>` for server files. The real test is the Railway deploy.
- Push to `main` = Railway auto-deploy. Commit and push when a task is done.
- Standard commit messages — never mention AI assistance.
- The DB schema self-ensures on every boot from `server/config/schema.sql` (idempotent
  statements; keep semicolons out of comments).
- SCSS nests under `.atlas` in `client/src/styles/atlas.scss`; components go through the
  service layer in `client/src/services/` (shared `http.js`), never raw axios.

## What's built (compact — details in CLAUDE.md)

- **Three postures**: Edit / View / Player (`mode` in `AtlasWorkspace`). Edit-only chrome is
  gated to edit; the player posture previews the share rules but is only a preview.
- **Timeline**: the DM scrubber is a local LENS (never auto-saved); players see the CANON
  moment, moved only by the explicit "Set canon" button. The min/max/clamp invariant is
  enforced server-side in the world PATCH.
- **Eras**: named periods; ones marked `player_visible` let players scrub that stretch of the
  past. `allowedTime` in `share.js` enforces it server-side — anything outside a revealed era
  or past canon silently resolves to canon.
- **Focus periods**: a map's `focus_start/focus_end` zooms the DM scrubber's track — a
  magnifier on the ONE world clock, never a second clock.
- **Timed backdrops & facts**: `map_backdrops` (timed art overrides) and `node_facts` (timed
  description overrides) resolve to the row covering t with the latest start — client-side for
  the DM lens, server-side in `share.js` for players.
- **Image pins**: nodes carry a `pin` style — 'chip' or 'image' (the node's art drawn
  frameless on the map).
- **Undo tombstones**: destructive deletes (node, placement, interior) are snapshotted into
  `tombstones` and restorable for 24 hours via the flash-bar Undo.
- **Share / Player View**: the DM mints `/p/:token` (public, no account); `worlds.share_token`
  is the whole capability. **All secrecy is enforced server-side in `share.js`** — hidden and
  out-of-time data never leaves the DB; deep links into hidden branches 404.
- **Images**: Cloudflare R2 pipeline (`R2_*` env vars), folders, ImageManager page.

## Known gaps (the honest list)

  workspace.
