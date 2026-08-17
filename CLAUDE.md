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
  timeline config, image picker) + `services/atlasService.js`
- Supporting pages: `Dashboard` (world select → Atlas), `ImageManager`, `AdminPanel`, `Login`,
  `AuthCallback`, `Setup`, `EnvSetup`
- Authentication context in `client/src/utils/AuthContext.jsx`; SSO is built server-side
  (no VITE_ client vars)
- Images upload to Cloudflare R2 (`R2_*` env vars); `resolveImageUrl` redirects R2-backed paths

## Database
Live tables: `users`, `worlds`, `maps`, `nodes`, `placements`, `links`, `images`, `image_folders`.
Orphaned tables still present in production but absent from schema.sql and all code — droppable
whenever: `events`, `events_backup_tooltip_migration`, `map_timeline_images`, `timeline_settings`,
`user_sessions`.

## Development Guidelines
- Follow existing SCSS styling patterns in `client/src/styles/` (`atlas.scss` for the workspace)
- Use the service layer in `client/src/services/` — do NOT create raw axios instances in components
- Timeline invariant (min < max, current clamped into range) is enforced server-side in the
  Atlas world PATCH — keep it that way for any new write path

## Known gaps (the honest list)
- **No sharing**: every Atlas route is gated on `worlds.created_by = caller`. The DM/Player toggle
  is a client-side preview; the server still returns DM-only nodes. Player View / share links are
  UX-REDESIGN Phase 4 and the top missing feature.
- No undo, no world switcher inside the workspace, no category legend/filter
- Interior-as-List: API supports `view: 'list'`, UI barely surfaces it
