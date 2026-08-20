# Fantasy Map Timeline - Claude Instructions

## Project Overview
- Frontend: React 18 + Vite + SASS
- Backend: Express.js + PostgreSQL
- Purpose: a recursively zoomable fantasy world you scrub through time — the "Atlas" model
- Hosting: Railway (no local server testing available)

The legacy map system (worlds → maps → events, `MapViewer`/`NodeEditor` and friends, ~3.5k lines)
was deleted in August 2026. **Atlas is the only map UI.** The vision and roadmap live in
`docs/UX-REDESIGN.md`; its checkboxes reflect verified state as of 2026-08-17.

## Key Commands
- `npm run dev` - Start both client and server (for development structure reference only)
- `npm run build` - Build for production
- `npm run install-all` - Install dependencies for both client and server

## Testing & Deployment
- **No local server testing available** - always push changes to git to test on Railway
- Use standard commit messages without mentioning AI assistance
- Railway automatically deploys from the main branch
- **Always push changes to git when finished with a task** - commit and push automatically after completing work
- The DB schema is ensured on every boot from `server/config/schema.sql` (idempotent statements,
  comment lines stripped before splitting on `;` — keep semicolons out of comments)

## Architecture
- **Atlas model**: a world is a graph of `nodes` (one identity, no copies) seen through nested `maps`;
  a node appears on a map via a `placement` (position + lifespan + visibility); `links` are
  first-class bidirectional edges. A node's `interior_map_id` is what makes it zoomable-into.
- Server: `server/routes/atlas.js` (the whole Atlas API), `worlds.js` (world CRUD only),
  `images.js` + `image-base64.js` + `imageFolders.js` (R2-backed image pipeline),
  `auth.js` (JWT + server-side SSO), `admin.js`, `setup.js`
- Client: `pages/AtlasWorkspace.jsx` (the entire workspace: canvas, tree, inspector, timebar,
  timeline config, image picker) + `components/MapPlane.jsx` (shared pan/zoom world plane —
  pins are % of the backdrop image's plane, NOT the window) + `services/atlasService.js`;
  all authed services share `services/http.js` (token header + dead-token redirect)
- Supporting pages: `Dashboard` (world select → Atlas), `ImageManager`, `AdminPanel`, `Login`,
  `AuthCallback`, `Setup`, `EnvSetup`
- Authentication context in `client/src/utils/AuthContext.jsx`; SSO is built server-side
  (no VITE_ client vars)
- Images upload to Cloudflare R2 (`R2_*` env vars); `resolveImageUrl` redirects R2-backed paths

## Database
Live tables: `users`, `worlds`, `maps`, `nodes`, `placements`, `links`, `images`,
`image_folders`, `eras`, `map_backdrops`, `node_facts`.
Orphaned tables still present in production but absent from schema.sql and all code — droppable
whenever: `events`, `events_backup_tooltip_migration`, `map_timeline_images`, `timeline_settings`,
`user_sessions`.

## Development Guidelines
- Follow existing SCSS styling patterns in `client/src/styles/` (`atlas.scss` for the workspace)
- Use the service layer in `client/src/services/` — do NOT create raw axios instances in components
- Timeline invariant (min < max, current clamped into range) is enforced server-side in the
  Atlas world PATCH — keep it that way for any new write path

## Sharing (Player View)
- The DM mints a share link in the Atlas Share popover → `/p/:token` (public route, no account).
- `worlds.share_token` is the whole capability; regenerate rotates it, delete revokes it.
- `server/routes/share.js` is the public read-only API. **All secrecy is enforced there,
  server-side**: DM-only nodes/placements and out-of-time placements never leave the DB; links
  are pruned when either end is hidden; deep links into hidden/future branches 404 via the
  owner-chain walk (`walkUp`). The DM-side "Player" toggle is only a preview of these rules.
- `/api/share` has its own rate-limit bucket (the whole table shares one venue IP and the
  Player View polls every 45s).

## Timeline semantics
- The DM's scrubber is a local LENS (never auto-saved); players see the CANON moment
  (`timeline_current_time`), which moves only via the explicit "Set canon" button.
- Maps may declare a FOCUS PERIOD (`maps.focus_start/focus_end`): inside that map the DM
  scrubber's track zooms to that window (⤢ expands). It is a magnifier on the ONE world
  clock — never a second clock; `now` and canon stay world-level.
- Nodes carry a `pin` style: 'chip' (icon + name) or 'image' — the node's art drawn
  directly on the map (frameless, PNG transparency respected), for both DM and players.
- `node_facts` are timed description overrides (same resolution rule as backdrops): the
  Colosseum reads as gladiators in 200, tourists in 2026. Resolved client-side in the
  reader, server-side in `share.js` (`?t=` on the node endpoint) for players.
- `map_backdrops` are timed art overrides: the active backdrop at moment t is the row
  covering t with the latest start (base `maps.image_id` otherwise). Resolved client-side
  for the DM lens, server-side in `share.js` for players.
- `eras` are named periods; ones marked `player_visible` let players scrub that stretch of
  the PAST in the Player View (`?t=` on the share map/locate endpoints). `allowedTime` in
  `share.js` enforces the rule server-side: a requested moment outside a revealed era, or
  past canon, silently resolves to canon. The workspace 🎭 posture previews this.

## Known gaps (the honest list)
- Mobile is view-only BY DESIGN (Bennett: editing happens on a PC; only player/viewing
  surfaces need to be mobile-first)
- From the "later" shelf: per-fact visibility, branching campaigns, zones/regions,
  @-mention-to-link
