# HANDOFF — timeline-map (the "Atlas" redesign)

Pick-up doc for a fresh chat (possibly on a different machine). Read this + `docs/UX-REDESIGN.md`
first, then skim `client/src/pages/AtlasWorkspace.jsx` and `server/routes/atlas.js`.

---

## TL;DR — where we are

`timeline-map` (Bennett's most-developed app: React 18 + Vite client, Express + Postgres server,
Railway auto-deploy from `main`) is a fantasy-worldbuilding / DM tool. Over this project we:

1. Ran a full correctness/UX audit and shipped fixes in batches A–D (`docs/REVIEW.md`).
2. Activated **Cloudflare R2** image storage (working in prod).
3. Fixed **SSO login**, **SPA serving**, and **CSP for cross-origin images**.
4. Began a **ground-up UX redesign** — the **Atlas** — and shipped its entire core roadmap.

The **Atlas is an ADDITIVE rebuild**: a new data model + a new single-screen UI that live *alongside*
the untouched legacy app. Reach it in the running app via **Dashboard → "🧭 Open Atlas (new)"**
(routes `/w/:worldId` → `/w/:worldId/m/:mapId`). The legacy tool is still at `/map/:mapId`.

⚠️ **Everything in the Atlas is build-verified only — NOT runtime-tested** (there's no local Postgres;
see "How to work" below). The very next step should be verifying it end-to-end on Railway.

---

## The vision (what the Atlas is)

A *recursively-nested, time-scrubbed* worldbuilding tool. In Bennett's words, mapped to what's built:

| Vision | Shipped as |
|---|---|
| "Upload a map of a world, drop info nodes all over it" | 🖼 Backdrop image + draggable category pins |
| "Some nodes are city maps — click to zoom in" | *Give a node an interior map*; double-click ◎ to descend |
| "Zoom in as far as I want, no artificial stop" | Unbounded map nesting; breadcrumb + left-rail tree to climb back |
| "A chest's inventory / inside an NPC's mind" | Interior `list` spaces — **still render as a canvas, not a list (top gap)** |
| "'Comes from the city of X' → link to that city" | Inspector **Links**: search a node, follow it (jumps across maps) |
| "Timeline brings it to life — alive day 1, dead day 2" | **Enable timeline** → scrubber + per-node lifespans; out-of-time nodes ghost out |
| "DM knows who's in the tavern; hide from players" | **DM/Player** top-bar toggle + per-node 🔒 DM-only visibility |
| "As little friction as possible" | One autosaving inspector; drop-then-categorize; no type-first placement |

Design principle Bennett endorsed: **all nodes are the same thing** — you drop first and pick a
*category* (just a label/color) after; category is swappable anytime. Do NOT reintroduce type-first
placement or the old `tooltip_text` blob.

---

## Architecture (Atlas)

**Model — new tables** (`server/config/schema.sql`, added idempotently after the legacy tables):
- `nodes` — the entity: `title, body, category, visibility ('shared'|'dm'), interior_map_id, image_id`.
- `placements` — a node placed on a map at `x,y` (0–100 %), with `start_time/end_time` (lifespan,
  nullable) + `visibility`. One node can be placed on many maps (no copies).
- `links` — directed node→node references (`kind, label, time_context`).
- `maps.owner_node_id` — the node this map is the *interior* of (null for the world root map).
- `maps.view` — `'map'` or `'list'` (list not yet visually distinct).
- `worlds.root_map_id` — each world lazily gets a root map on first Atlas load.

Nesting is expressed by `maps.owner_node_id` → a placement of that node → its parent map. The
breadcrumb/tree are derived from this chain server-side.

**API** — `server/routes/atlas.js`, mounted at `/api/atlas` (`server/server.js`). Auth-gated,
scoped to worlds the caller owns. Endpoints:
- `GET /worlds/:id` (world+timeline, ensures root map) · `PATCH /worlds/:id` (name/desc/timeline)
- `GET /worlds/:id/maps` (flat list → client builds the tree) · `GET /worlds/:id/nodes` (index)
- `GET /maps/:id` (canvas payload: map, placements+nodes, links, breadcrumb) · `PATCH /maps/:id`
  (title/view/`image_id` backdrop)
- `POST /maps/:id/nodes` (new node + placement) · `POST /maps/:id/placements` (place an existing node)
- `GET /nodes/:id` (detail + links + backlinks) · `GET /nodes/:id/locate` (best jump target) ·
  `PATCH /nodes/:id` (title/body/category/visibility/`image_id`) · `POST /nodes/:id/interior`
  (give it an interior map/list) · `DELETE /nodes/:id`
- `PATCH /placements/:id` (x/y/start/end/visibility) · `DELETE /placements/:id`
- `POST /links` · `DELETE /links/:id`

**Client** — mostly in a few files:
- `client/src/pages/AtlasWorkspace.jsx` — the whole workspace (shell, canvas, inspector, image
  picker, node picker, Player View). Routed at `/w/:worldId` and `/w/:worldId/m/:mapId` (`client/src/App.jsx`).
- `client/src/utils/categories.js` — node category definitions (`CATS`/`cat`).
- `client/src/services/atlasService.js` — thin client for `/api/atlas`.
- `client/src/styles/atlas.scss` — all Atlas styles (dark, self-contained under `.atlas`).

---

## What's shipped (commits `8549ac0`..`8eb416b`)

- `b8709c5` model + API · `a611270` frontend shell (tree/breadcrumb, canvas pins, drop+categorize,
  autosaving inspector, unbounded interior nesting) · `762eb75` R2 backdrop + node images +
  drag-to-move · `040837e` timeline (scrubber + lifespans + ghosting) · `4ad5447` links (+ jump) ·
  `8eb416b` DM/Player reveal.

## Known gaps / suggested next steps

1. **Interior `list` view renders as a canvas** — top follow-up. A node's interior created "as a list"
   (inventory / an NPC's mind) should render as a vertical list of child nodes, not spatial pins.
   `maps.view` already carries `'list'`; `AtlasWorkspace` just needs a list renderer branch.
2. **Runtime-verify on Railway** before building more (nothing is tested against a real DB).
3. Polish: link labels + time-context UI, "search a node to place it" on the canvas, cleanup of
   orphan interior maps on node delete. (A read-only **Player View / share link** already landed via
   the concurrent chat — verify it, don't rebuild it.)

---

## How to work on this repo (dev norms — important on a new machine)

- **Push/deploy freely.** In-development, pre-real-users. No per-push approval. Railway auto-deploys
  `main`. Data is **disposable test data** — no backfill/migration ceremony; schema can be recreated.
- **No local server run** (needs Postgres). **Verify via build only:** `cd client && npm run build`
  for client changes; `node --check <file>` for server files. The real test is the Railway deploy.
- **Node/npm may not be on PATH** in tool shells (they weren't on Bennett's Windows box — they lived
  at `C:\Program Files\nodejs\`). If `node`/`npm` aren't found, use the full path or prepend it to
  PATH for the command. Adjust for whatever machine you're on.
- Workflow per change: edit → build/`node --check` → `git commit` → `git push`.

---

## Operational context (works today — folded in here since local memory won't travel)

- **R2 images: DONE and working.** Five Railway env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`. Driver: `server/storage.js` (env-gated;
  falls back to base64-in-Postgres if any var is missing). **Gotcha we already hit:** `R2_PUBLIC_URL`
  must be the **public** bucket URL (`https://pub-….r2.dev` or a custom domain), NOT the
  `https://<accountid>.r2.cloudflarestorage.com` S3 API endpoint. Setup: `docs/R2-SETUP.md`.
- **CSP:** helmet's default `img-src 'self' data:` blocked cross-origin R2 images; we widened it to
  allow `https:` images (`server/server.js`). (A concurrent chat later also allowed the bug-tracker
  widget script — commit `9374ca1`.)
- **SPA serving:** the server serves `client/dist` whenever it exists, independent of `NODE_ENV`
  (a missing `NODE_ENV=production` was returning JSON "Route not found" for every page).
  Still recommended: set **`NODE_ENV=production`** on Railway (correct CORS origin + hidden error text).
- **SSO: working.** Central auth-service (Railway, prod `https://harmonious-ambition-production.up.railway.app`).
  `/oauth/token` requires `grant_type=authorization_code` + `redirect_uri` (must exactly match the one
  registered for this client's `client_id`, incl. the `-xxxx` Railway host suffix). Reference client:
  `content-platform/server/sso.js`. Env: `AUTH_SERVICE_URL`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`,
  `JWT_SECRET`. **Note:** a concurrent chat moved authorize-URL building server-side and added a guest
  login (commits `f2e1fc6`, `e85bdd5`, `155e8b0`) — so `client/src/pages/Login.jsx` / `server/config/sso.js`
  may differ from older descriptions; read the current files if touching auth.

## Concurrent work / current git state — READ THIS

`main` HEAD at handoff: **`9e0f161`**. This repo is being **actively co-developed by another chat**,
which has already advanced the Atlas *past* the feature snapshot above. Since `8eb416b` (my last Atlas
slice) it has landed, among other things:
- a **read-only Player View + shareable link** (single-column, canvas-first, bottom-sheet inspector) —
  so a "player share link" is DONE, not a next step;
- a **timeline range/unit editor** (set min/max/unit, not just the default 0–100 days);
- category defs **extracted to `client/src/utils/categories.js`** (no longer inline in `AtlasWorkspace.jsx`);
- plus changes to `server/config/schema.sql`, `server/routes/worlds.js`, `server/routes/image-base64.js`,
  `client/src/services/worldService.js`, and SSO/login (`f2e1fc6` server-side authorize, `e85bdd5` guest
  login, `155e8b0` no-email accounts, `9374ca1` bug-tracker widget CSP).

**Trust the CURRENT files, not this doc's feature snapshot.** Pull latest and read `AtlasWorkspace.jsx`,
`atlas.js`, and `atlas.scss` before building — they've moved. This doc is the map; the code is the territory.

## In-repo reference docs

- `docs/UX-REDESIGN.md` — full ground-up redesign spec + a clickable wireframe. **The design source of truth.**
- `docs/REVIEW.md` — the pre-redesign correctness/UX audit (63 findings, batches A–D + a "Remaining" list).
- `docs/R2-SETUP.md` — R2 provisioning steps.

## First action for the next chat

Pull latest, read `docs/UX-REDESIGN.md` + this file, skim `AtlasWorkspace.jsx` + `atlas.js`, then
**confirm the Railway deploy renders the Atlas end-to-end** (Open Atlas → backdrop → drop/drag nodes →
interior → timeline → links → DM/Player). Fix anything broken, then pick up with **real list-view
interiors** (gap #1) or whatever Bennett asks next.
