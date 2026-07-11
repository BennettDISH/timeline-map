# timeline-map — Deep-Dive Review (July 2026)

Multi-agent audit + R2 migration design. Every finding below was independently
verified against the source (adversarial pass); severities are the **post-verification**
values. Line numbers were accurate at time of writing — re-check after edits.

Scope goals from Bennett:
1. Move image storage from **base64-in-Postgres → Cloudflare R2**.
2. A pass over the app for **functionality + smoothness**.

Working assumptions (July 2026): site is in active development, **push/deploy freely**,
existing data is **disposable test data** — no backfill, no data preservation, schema may
be recreated freely.

**Status (2026-07-11): Batches A–D shipped.**
- **A** — R2 storage code (env-gated; awaiting an R2 bucket + the five `R2_*` Railway vars to
  activate — see `docs/R2-SETUP.md`), image IDOR fix, R2 delete-cascade, four P0 data-loss fixes.
- **B** — auth deep-link bounce, gallery search focus + pagination, image-picker labels + a
  "No image" remove option, MapManager `:worldId`, unassigned-count field, event image/link clearing.

- **C** — real rate limiting (`trust proxy`) + auth throttle, generic 500s (no SQL leakage), SSO
  `state` presence check, crypto JWT secret, real world delete (cascade + R2 prefix), maps
  `is_active` + `parent_map_id` validation, generic-PUT timeline validation, `LIKE` escaping;
  removed the dead "Duplicate World" feature.

- **D** — error boundary, catch-all route, keyboard/aria on list rows + labeled close buttons,
  real upload progress, WorldSettings no-reload + inputs that accept 0, Dashboard recent maps,
  WorldSelector count refresh, responsive toolbars, styled Settings link, Save-All state fix,
  timeline scrub-0 + new-node default range + slider div-by-zero guard, universal-search
  empty/error states; dead-code removal (mapSettings.scss.backup, requireCreator, dead search
  props, bgMapCount, InfoPanel dead deep-link).
- **Map-interaction follow-up** — sticky-drag off the container (bind move/up to window during a
  drag), working zoom-to-cursor, non-passive wheel (preventDefault now stops page scroll), and no
  redundant position write on click-to-select.

**Remaining (lower-value or higher-risk — not done):** JWT-in-localStorage/revocation redesign;
the `getBoundingClientRect`-per-node render perf micro-opt (too invasive to do safely untested);
search totalCount + cache-invalidation + request-sequencing;
timeline-bar/nodes-panel overlap; server event_type + coordinate-range validation; 403-vs-401
semantics; ImageSelector loading/empty distinction; duplicate new-folder-form dedup.

---

## R2 image migration — plan

**Today:** upload = client FileReader → base64 data-URI → `POST /api/images-base64/upload`
→ INSERT `images` row with `base64_data` = the bytes and `file_path` =
`/api/images-base64/serve/<filename>`; served by a public `/serve` endpoint that streams the
decoded bytes. The DB row *is* the storage.

**Target:** the env-gated R2 driver pattern from `content-platform/server/storage.js`.

**Because test data is disposable, this is simpler than a normal migration** — skip the
backfill entirely and don't preserve old rows.

Steps:
1. Add `@aws-sdk/client-s3` to `server/package.json` (not currently a dependency).
2. Add **`server/storage.js`** — a **CommonJS** rewrite of content-platform's ESM driver
   (`r2Enabled`, `putObject`, `deleteObject`, `deletePrefix`). content-platform is ESM;
   this server is CommonJS (`require`) — it **cannot be copied verbatim**.
3. `server/config/schema.sql`: add `storage_key VARCHAR(500)` to `images` (or just recreate
   the table — data is disposable). Keep `base64_data` nullable as an optional no-creds dev
   fallback, **or** drop the base64 path entirely (remove `/serve` + `base64_data`) to go
   R2-only and cleaner.
4. **`server/routes/image-base64.js` `POST /upload`**: when `r2Enabled`, decode the base64
   data-URI to a Buffer, `putObject` to R2 under key `worlds/<worldId>/<filename>`, store the
   absolute R2 URL in `file_path` + the key in `storage_key`. Keeps the existing client
   contract (no client change).
5. **`server/utils/imageUrl.js` → `resolveImageUrl(req, file_path)`**: pass absolute
   `http(s)` URLs through untouched (R2); host-prepend relative paths (fallback). Apply at
   **all 8 URL-production sites** — this is the single riskiest refactor; miss one and R2 rows
   404 from a double-prepended host:
   - `images.js` — lines ~80, ~124, ~195
   - `events.js` — lines ~60, ~122, ~184
   - `maps.js`   — lines ~55, ~110
6. **Delete cascade**: `images.js DELETE /:id` → `deleteObject(storage_key)`. (World/map
   deletes are soft deletes; folder delete is `SET NULL` — no prefix delete needed today.)
7. **Railway env** (app stays on fallback until all five present):
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`.
8. Add `docs/R2-SETUP.md` mirroring content-platform's.

Effort ≈ 4–6h, most of it Cloudflare/env config, not code.

---

## Findings (63 verified)

Legend: 🔴 fix regardless · 🟠 high user impact · 🟡 correctness papercut · ⚪ polish/cleanup

### 🔴 P0 — Silent data-loss / corruption
Root cause of the top three: `tooltip_text` is overloaded as a JSON blob (subtype, size,
scale, connections, colors). CLAUDE.md already flags it. Immediate fixes are tiny; the
structural fix is to promote subtype/connections to real columns.

- [x] **[high]** Saving any tooltip-bearing node **wipes all its connections** — `client/src/pages/MapViewer.jsx:491`. `formData.connections` is never seeded from the node, so editing any field on a text/image node and saving writes `connections: []`. Fix: seed `connections` into `editFormData` (`getNodeConnections(selectedNode)`), or preserve existing when `undefined`.
- [x] **[high]** Editor **writes the wrong node's connections** when switching nodes with the panel open — `client/src/components/NodeEditor.jsx:73`. `existingConnections` is `useState`'d once, never re-synced. Fix: `key={selectedNode.id}` on `<NodeEditor>` in `MapViewer.jsx:755` (remounts per node).
- [x] **[high]** **±10000 "corruption guard" randomizes far nodes** on load and blocks large maps — `client/src/hooks/useMapData.js:66` (+ `useMapInteractions.js:105,147`; create path `MapViewer.jsx:174` has no guard). Leftover debug scaffolding; overwrites persisted coords with `Math.random()`. Fix: remove the ±10000 guards (or clamp to real bounds, never randomize).
- [x] **[medium]** Text-node **width loaded from wrong source, reset to 400 on save** — `client/src/pages/MapViewer.jsx:70`. Seed width from `getTextNodeProps(selectedNode).width` in `editFormData`.

### 🔴 P1 — Security & auth
- [x] **[high]** **IDOR**: `GET /api/images/:id` has no ownership check → cross-tenant image disclosure (metadata + bytes via the public `/serve`) — `server/routes/images.js:96`. Fix: `JOIN worlds w … WHERE i.id=$1 AND w.created_by=$2`.
- [x] **[high]** **Authenticated users bounced off every deep link on refresh** — `client/src/utils/AuthContext.jsx:52`. `loading` never goes true during the initial `/auth/me` check, so `ProtectedRoute` redirects to `/login` before it resolves, dumping the user on `/dashboard`. Fix: `initialState.loading = true`; dispatch a terminal action (LOGIN_SUCCESS / LOGOUT) on **every** branch of `checkAuth`.
- [x] **[medium]** **SSO callback CSRF bypass** when `state` is absent (`null !== null` passes) — `client/src/pages/AuthCallback.jsx:21`. Fix: reject when `!state || !savedState`.
- [x] **[medium]** **Rate limiting inert** — `trust proxy` never set behind Railway, so all clients share one bucket — `server/server.js:19`. Fix: `app.set('trust proxy', 1)` + a stricter limiter on `/auth/login|register`.
- [x] **[medium]** **Raw Postgres error text leaked** on every 500 (~26 catch blocks bypass the `NODE_ENV` guard; `setup.js` even returns `error.stack`) — e.g. `server/routes/worlds.js:45`. Fix: return a generic message, route through the global handler.
- [x] **[medium]** **JWT secret generated with `Math.random()`** in the setup helper — `client/src/pages/EnvSetup.jsx:9`. Fix: `crypto.getRandomValues` (or instruct `openssl rand`).
- [ ] **[medium]** JWTs in `localStorage`, fixed 7-day expiry, **no revocation** — `client/src/services/authService.js:46`. Consider httpOnly cookie + shorter TTL + token version.
- [ ] **[medium]** Setup success writes token to `localStorage` but **not to AuthContext** → new admin bounced to `/login` — `client/src/pages/Setup.jsx:48`. Fix: update context via a login action.

### 🟠 P2 — Broken / rough core UX
- [x] **[high]** **Gallery search loses focus after one character** — `client/src/components/ImageGallery.jsx:135`. Every keystroke re-fetches and the `if (loading)` early-return unmounts the whole gallery incl. the input. Fix: debounce + inline spinner (don't unmount).
- [x] **[medium]** Gallery **hard-capped at 50 images, no pagination** — `client/src/components/ImageGallery.jsx:25`. Sidebar counts (limit 1000) show more than the grid renders. Fix: pagination / infinite scroll using the server's ignored `hasMore`.
- [x] **[medium]** Image picker shows the **generated storage filename** (`img-…​.png`) instead of `originalName` — `client/src/components/ImageSelector.jsx:183`. Fix: render `originalName || filename`.
- [x] **[medium]** **`MapManager` ignores the `:worldId` route param** — deep-links show the wrong world or none — `client/src/pages/MapManager.jsx:23`. Reads a `?world=` query that nothing produces. Fix: `useParams()`.
- [x] **[medium]** **No way to remove an image from a node**: server `COALESCE`s nulls so `image_id`/`link_to_map_id` can never be cleared, and there's no remove affordance — `server/routes/events.js:372` + `ImageSelector`. Fix: build the SET clause from present keys + add a "Remove image" option.
- [x] **[medium]** **"Unassigned" folder count reads `folder_id`** (server sends `folderId`) so it always equals the world total — `client/src/pages/ImageManager.jsx:138`. One-char fix.

### 🟡 P3 — Correctness papercuts
- [x] **[medium]** "Save All Changes" **visually reverts all-but-last node** (stale-closure `setNodes(nodes.map…)` in a loop; persistence is fine) — `client/src/pages/MapViewer.jsx:449`. Fix: functional `setNodes(prev => …)`.
- [x] **[medium]** ~~**"Duplicate World" copies nothing**~~ (removed the dead feature) — creates an empty world, hardcodes counts to 0 — `server/routes/worlds.js:302`. Also its client wrapper `worldService.duplicateWorld` is never called (dead). Finish it (deep copy in a txn) or remove it.
- [ ] **[medium]** **1000-image fetch per world just to compute count badges**, and the query pulls the heavy `base64_data` column then discards it — `client/src/pages/ImageManager.jsx:47`. Fix: a `COUNT(*)` endpoint / stop selecting `i.*`.
- [x] **[medium]** Clickable list rows (**node/world/gallery**) aren't keyboard-operable; close buttons are icon-only with no label — `client/src/components/NodesListPanel.jsx:37` et al. (a11y).
- [x] **[low]** Timeline scrub position of exactly **`0` resets to 50** on reload (`|| 50` falsy fallback) — `client/src/hooks/useMapData.js:41` (+ `MapViewer.jsx:90`). Use `??`.
- [x] **[low]** New nodes default to **time range 0–100**, so a timeline-enabled node is invisible in a world ranged e.g. 1000–2000; slider fill divides by zero when `min==max` — `client/src/pages/MapViewer.jsx:177`. Default to world min/max + guard the divide.
- [x] **[low]** World **soft-delete never cascades**; confirm dialog falsely promises permanent deletion; orphan rows (incl. base64 blobs) accumulate — `server/routes/worlds.js:290`. Fix cascade + honest dialog.
- [x] **[low]** Single-map `GET/PUT/DELETE /:id` don't filter `is_active` — soft-deleted maps stay reachable by id — `server/routes/maps.js:85`.
- [x] **[low]** `POST /api/maps` doesn't validate `parent_map_id` ownership/world membership — `server/routes/maps.js:162`. Mirror the `link_to_map_id` check in `events.js`.
- [x] **[low]** `PUT /api/worlds/:id` **bypasses timeline range validation** the dedicated endpoints enforce (can persist min>max) — `server/routes/worlds.js:206`.
- [x] **[low]** **Zoom-to-cursor is a no-op** — wheel always zooms to center (stale coord closures) — `client/src/hooks/useMapInteractions.js:187`.
- [x] **[low]** **Sticky drag**: mouseup outside the container leaves node/viewport following the cursor — `client/src/components/MapContainer.jsx:32`. Bind move/up to `window` (or pointer capture).
- [x] **[low]** Click-to-select in edit mode fires a **redundant position-save PUT** (no move threshold) — `client/src/hooks/useMapInteractions.js:131`.
- [x] **[low]** Wheel `preventDefault()` ignored (React passive listener) — page can scroll while zooming on short viewports — `client/src/hooks/useMapInteractions.js:171`.
- [ ] **[low]** Search cache TTL is **global, never invalidated** — typeahead can serve stale/deleted nodes — `client/src/services/nodeSearchService.js:22`. Per-entry timestamp + `clearCache()` after mutations.
- [ ] **[low]** Typeahead has **no request sequencing** — a slow earlier query can overwrite a newer one — `client/src/components/UniversalNodeSearch.jsx:41`.
- [x] **[low]** Search **`LIKE` doesn't escape `%`/`_`** — those behave as wildcards — `server/routes/events.js:44`.
- [ ] **[low]** Search results silently truncated; `totalCount` is post-LIMIT (≤50) and unused — `server/routes/events.js:65`.
- [x] **[low]** `ImageSelector` selected-state compare is **type-inconsistent** (`parseInt` vs `toString`) so the chosen thumbnail isn't highlighted — `client/src/components/ImageSelector.jsx:239`.

### ⚪ P4 — Polish, feedback & dead code
- [x] **[low]** **No error boundary** anywhere — a render throw blanks the app — `client/src/App.jsx:137`. (JSON.parse paths are guarded, so no known crash — best-practice gap.)
- [x] **[low]** **No catch-all route** — unknown URLs render a blank shell — `client/src/App.jsx:131`. Add `<Route path="*">`.
- [x] **[low]** **Silent empty catches** hide image-load and timeline-save failures — `client/src/pages/MapViewer.jsx:105,298`; `useMapData.js:30,107`. Surface a toast.
- [ ] **[low]** Image list in the editor has **no loading/empty/error distinction** — `client/src/pages/MapViewer.jsx:101` / `ImageSelector.jsx:230`.
- [x] **[low]** Upload progress bar is **fake/frozen** (index-based, resets to 0, never 100); the real `onProgress` hook is dead — `client/src/components/ImageUpload.jsx:46`.
- [x] **[low]** `WorldSettings` **full-page reload after save hides the success banner** behind the spinner — `client/src/pages/WorldSettings.jsx:69`.
- [x] **[low]** `WorldSelector` map/image **counts go stale** after map CRUD — `client/src/pages/MapManager.jsx:89`.
- [x] **[low]** Dashboard **"Recent Maps" is a hardcoded empty state** — always claims no maps — `client/src/pages/Dashboard.jsx:85`.
- [x] **[low]** Timeline numeric inputs use `parseInt(…) || fallback` — **can't enter 0**, snaps mid-edit — `client/src/pages/WorldSettings.jsx:237`.
- [x] **[low]** Map toolbars **non-responsive** — control row overflows on narrow viewports (no `flex-wrap`/media query) — `client/src/styles/mapStyles.scss:85`.
- [ ] **[low]** Fixed **Timeline bar overlaps** the bottom of the nodes-list panel (`z-index` 40 vs 25) — `client/src/styles/timelineStyles.scss:2`.
- [x] **[low]** **Unstyled Settings link** in the dark map header (`.settings-button` has no rule) — `client/src/pages/MapViewer.jsx:536`.
- [x] **[low]** InfoPanel "Edit connections" / "Add Connection" **deep-link is dead** (writes `localStorage` nothing reads; editor opens collapsed) — `client/src/pages/MapViewer.jsx:322`.
- [ ] **[low]** Node **subtype lives only in the blob**; any parse failure silently demotes NPC/Item/Text → generic Info (guarded, so conditional) — `client/src/utils/nodeUtils.js:7`.
- [ ] **[low]** `403` overloaded for auth + permission; the `authService` interceptor hard-redirects; `AdminPanel`'s own axios swallows it — `client/src/services/authService.js:26`.
- [x] **[low]** Role system beyond `admin` is **dead** — `requireCreator` exported but never used; every user is effectively a creator on their own data — `server/middleware/auth.js:60`.
- [ ] **[low]** `init-admin` runs `schema.sql` via naive `;`-split, no transaction; `auth.js generateToken` lacks the missing-`JWT_SECRET` guard `setup.js` has — `server/routes/setup.js:101`.
- [ ] **[low]** Schema-vs-code drift: `migrate.js` logs dead tables; `event_type` unvalidated vs its CHECK; `x_position/y_position` are `DECIMAL(5,2)` (±999.99) vs "infinite grid" comment — `server/config/migrate.js:29`.
- [x] **[low]** Dead code: **`client/src/styles/mapSettings.scss.backup` (773 lines)**; dead `mapLookup`/`currentMapId`, `bgMapCount`; dead `mapLookup`/`currentMapId` in `UniversalNodeSearch.jsx:23`; dead `tooltipData` in `NodeEditor.jsx:95`; unused `bgMapCount` in `MapViewer.jsx:142`; duplicated new-folder form in `ImageManager.jsx:503`.

---

## Suggested batching
- **A** — R2 migration + image IDOR + delete-cascade **+ the 4 P0 data-loss fixes**.
- **B** — auth deep-link bounce, gallery search + pagination, picker labels, MapManager worldId, remove-image.
- **C** — remaining security/correctness papercuts (error leak, trust proxy, SSO state, duplicate-world, validation gaps).
- **D** — polish / a11y / dead-code cleanup.
