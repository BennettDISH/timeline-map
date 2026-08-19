# Readiness audit — can this run a real session?

**Date:** 2026-08-19 · **Head:** `37d4d9c` · **Scope:** everything between a DM on a laptop and
players on phones. Audit only — no code changed.

**How this was verified.** Read the full Atlas path (`AtlasWorkspace.jsx`, `PlayerView.jsx`,
`atlas.js`, `share.js`, `server.js`, `atlas.scss`, `schema.sql`), built the client (green), and
queried the live Railway database. Every claim below is checked against code or prod data, not
inferred. Findings that turned out to be false are recorded in "Checked and fine" so nobody
re-investigates them.

---

## Verdict

The app works. Prod holds 11 worlds, 27 maps, 22 nodes, 23 placements, 5 links and 175 images —
all 175 on R2, zero base64 fallback rows. The client build is clean. `HANDOFF.md`'s warning that
the Atlas is "build-verified only, NOT runtime-tested" is stale; it has been running against a
real database for a while, and that doc also still describes a legacy app that was deleted.

What's left is not "does it work." It's four things that will bite you *during* a session, and one
category of thing you can't undo.

**One sentence: the pin coordinate system is wrong for your setup, and everything else is smaller
than that.**

---

## P0 — will break the thing you're using it for

### 1. Pins land on different map features on your laptop than on a player's phone

`client/src/styles/atlas.scss:30` draws the backdrop as `background-size: cover` on a `.canvas`
that fills the stage (`atlas.scss:29`), and pins are positioned as a percentage of that *same
stage box* (`AtlasWorkspace.jsx:294`, `PlayerView.jsx:92`).

`cover` scales the image until it covers the stage and crops the overflow. The stage's aspect
ratio is `(viewport − 540px) × (viewport height − 46px)` on the DM side and roughly the whole
phone screen on the player side. Those are wildly different shapes, so they crop the map image
differently — and the pins do *not* move with the crop, because they're anchored to the stage,
not the image.

Consequences, in the order you'll hit them:

- You place a pin on a mountain range on your laptop. A player opens the link in portrait on a
  phone. The same pin now sits over an ocean, because the phone crops away most of the map's width
  and the pin is still at "62% across the box."
- Resizing your own browser window, or opening the inspector on a different screen, moves every
  pin relative to the map art.
- Any part of the map image outside the current crop is unreachable — you cannot place a pin
  there at all.

This is the single reason to not hand out share links yet.

**Fix shape.** Make the pin coordinate space the *image* box rather than the stage box. Render the
backdrop as an `<img>` (or a `background-size: contain` layer) inside a wrapper that is sized to
the image's intrinsic aspect ratio and letterboxed within the stage; position pins as percentages
of that wrapper. Existing placements stay valid in the common case where your map was roughly the
stage's shape, but expect some drift on already-placed pins — worth doing before there's much
placed content. Prod has 23 placements today, so now is cheap.

### 2. No zoom, no pan

`.canvas` is `position:absolute; inset:0` — fixed to the stage, no transform. There is no zoom
control, no pan, no fit-to-content. `docs/UX-REDESIGN.md:197` lists "fit-to-content + zoom
controls" as unshipped, and the vision line "zoom in as far as I want, no artificial stop" is
currently satisfied only by *nesting* (descending into interiors), not by actually magnifying a
map.

Every pin also renders its full title label (`.pin` has `max-width:220px`, labels always on), so a
map with 20 pins is a wall of overlapping text with no way to zoom in and separate them.

On a phone this is worse: the player gets one fixed view of the whole map with no pinch-zoom on
the map itself (the pins are `touch-action:none`, and the page is a fixed-position shell).

**Fix shape.** A pan/zoom transform on a wrapper around the canvas — wheel/pinch to zoom,
drag-empty-space to pan, a "fit" button. Best done *in the same change as #1*, since both are
about introducing a real map-space → screen-space transform. Doing them separately means building
the coordinate math twice.

---

## P1 — you can lose work, and you won't be told

### 3. Deleting a node silently strands everything inside it

`atlas.js:242` is `DELETE FROM nodes WHERE id=$1`. `schema.sql` declares
`maps.owner_node_id ... ON DELETE CASCADE`, so that also deletes the node's interior map, which
cascades to every placement on it (`placements.map_id ON DELETE CASCADE`).

The *nodes* that lived on that interior map are world-scoped, so they survive as rows — with no
placement anywhere, invisible on every canvas, unreachable from the tree, but still listed in the
node index and still linkable. Delete a city and every NPC, shop and rumour you nested inside it
becomes an orphan.

The confirm dialog (`AtlasWorkspace.jsx:111`) says "removes it from all maps and deletes its
interior" but doesn't say how many nodes are inside, and there is no undo anywhere in the app.

Prod currently has **0 orphaned nodes**, so this hasn't happened yet.

**Fix shape.** Count the interior's contents server-side and surface it in the confirm ("This will
also strand 7 nodes inside Ravenhollow"); optionally re-parent or soft-delete instead of hard
delete. A `deleted_at` column on `nodes` would give you a real undo cheaply.

### 4. There is no way to remove a node from one map — only to delete it everywhere

`DELETE /placements/:id` exists in the API and `atlasService.deletePlacement` exists in the
client, but **nothing calls it** — grep confirms zero usages. The only removal control in the UI
is `🗑 Delete node` (`AtlasWorkspace.jsx:467`), which is the destructive everywhere-delete from
#3.

So "I put this pin in the wrong place, take it off this map" has no safe answer. You either drag
it somewhere out of the way or nuke the node.

`POST /maps/:id/placements` (`atlasService.placeNode`) is likewise **unused** — meaning the
entity/placement split, the "one node, many placements, no copies" pillar the whole model is built
on, is unreachable from the UI. You cannot place an existing node on a second map. Prod has
exactly 1 multi-placed node, presumably created by hand during testing.

Per-placement `visibility` and per-placement lifespans exist in the schema and API too; the
Inspector only exposes *node*-level visibility, so per-placement reveal is also UI-unreachable.

**Fix shape.** Two buttons in the Inspector — "Remove from this map" (calls `deletePlacement`) and
"Also place on…" (map picker → `placeNode`). The backend is already done.

### 5. Every failure is swallowed; the save indicator can't tell you anything went wrong

Essentially every client call ends in `.catch(() => {})` — lines 35, 50, 65, 69, 75, 78, 99, 119,
121, 135, 142, 153, 158, 164, 166, 170, 174, 191, 480, 521 of `AtlasWorkspace.jsx`. There is no
toast, no error state, no retry.

And the indicator is `{savedAt ? '✓ Saved' : ''}` (`AtlasWorkspace.jsx:466`), where `savedAt` is
only ever *set* on success and never cleared. So after your first successful save of a session,
"✓ Saved" is permanently displayed regardless of whether the last twenty saves failed.

Combine with #6 and #7 and you get the bad case: your token expires or you get rate-limited
mid-session, every subsequent keystroke is silently discarded, and the UI cheerfully reads
"✓ Saved" the whole time.

**Fix shape.** A shared error channel — a small toast + a "⚠ Unsaved" state on the indicator that
`saveNode`/`patchPlacement`/`patchMap` set on rejection. Cheap and high value.

### 6. Rate limiting can cut you off mid-session

`server/server.js:54` caps `/api/` at **300 requests per 15 minutes per IP** — 20/min. `/api/share`
gets its own laxer 2400 bucket (`server.js:55`), so players are fine. The *DM* is not.

The workspace is chatty: autosave debounces at 350ms, so writing a paragraph of notes with natural
pauses fires a save every time you stop typing for a third of a second. Add `getNode` on every
node selection, `getMap` + `getMaps` on every navigation, and a `patchWorld` per timeline scrub
settle. A focused half-hour of prep will plausibly cross 300.

When it trips you get 429s, which land in the `.catch(() => {})` from #5, which means **you lose
edits with no indication at all.**

**Fix shape.** Give `/api/atlas` its own generous bucket the way `/api/share` has one, and/or key
the limiter on user id rather than IP for authenticated routes. Independently, raise the autosave
debounce to ~1s and coalesce patches per node.

### 7. Expired tokens don't log you out of the Atlas

JWTs expire after 7 days (`auth.js:33`). Only `authService`'s axios instance has a response
interceptor that catches 403 and redirects to login (`authService.js:23–34`). `atlasService`,
`shareService`, `worldService` and `imageServiceBase64` each construct their own bare axios
instance with no interceptor.

So when your token expires while the workspace is open, nothing happens visibly — every call 403s
into a silent catch. You keep typing into a dead app.

**Fix shape.** Move the interceptor into a shared axios factory that all services use.

---

## P2 — friction that shows up at the table

### 8. The DM cannot look at another moment in time without moving the players

`scrub()` (`AtlasWorkspace.jsx:132–136`) writes `timeline_current_time` to the world after a 300ms
debounce — unconditionally. `share.js` serves players exactly that value, and `PlayerView` polls
every 45s.

So dragging the scrubber back to check what the map looked like in year 200 **broadcasts year 200
to every player's phone** within 45 seconds. There is no local-preview mode. `CLAUDE.md` notes
players can't scrub; it doesn't note that the DM's scrubbing is the players' clock.

For solo prep this is invisible. Mid-session, with phones out, it's a leak and a confusion source.

**Fix shape.** Separate "my viewing moment" (local, free to scrub) from "the canon moment"
(persisted, what players see), with an explicit "Set canon moment to here" action. This is already
the framing `UX-REDESIGN.md:208` calls "playhead-as-lens vs set canon moment" — the lens half
shipped, the split didn't.

### 9. No global search

There is no way to find a node by name across the world. `NodePicker` (`AtlasWorkspace.jsx:518`)
has a search box, but it only exists inside the "link to another node" modal. With 27 maps, "where
did I put Baron Ulric" has no answer except clicking through the tree.
`UX-REDESIGN.md:189` lists global search as unshipped.

**Fix shape.** The `getNodes` endpoint already returns the whole index. Lift `NodePicker`'s search
into a top-bar palette that navigates via `locateNode` instead of linking. Small change, big
day-to-day payoff.

### 10. Interior "list" spaces render as a spatial canvas

`maps.view` carries `'map'|'list'`, the Inspector offers "＋ Give it an interior list (inventory /
notes)" (`AtlasWorkspace.jsx:461`), and the API stores it — but `AtlasWorkspace` has no list
renderer branch, so a chest's inventory comes out as pins floating on a dot grid.

Prod has **0 maps with `view='list'`**, so nobody has hit this yet — but the button is there,
promising something it doesn't deliver.

**Fix shape.** Either build the list renderer (a vertical list of the map's placements, no x/y) or
hide the button until it exists. Hiding it is a five-minute honesty fix.

### 11. No category legend or filter; no world switcher

Six categories with colour+icon (`utils/categories.js`) and nothing anywhere explains what the
colours mean, or lets you show only Places. `UX-REDESIGN.md:196` flags both as unshipped.
Switching worlds requires Exit → Dashboard → WorldSelector → Open Atlas.

---

## P3 — polish

- **Share popover doesn't close on outside click** (`AtlasWorkspace.jsx:244`). It stops
  propagation but registers no document listener; only the Share button toggles it.
- **The bug-tracker widget loads on the public Player View.** `client/index.html` puts the widget
  `<script>` in the shared shell, so players at your table get a feedback widget for your internal
  bug tracker, with its API key visible in the page source of a link you hand to strangers.
- **`*` routes redirect to `/dashboard`** (`App.jsx`) rather than showing a 404, so typos look like
  a broken app. `UX-REDESIGN.md:190` lists "real 404" as unshipped.
- **Stale pins flash during navigation.** Changing map keeps the previous `data` on screen until
  the new fetch resolves (`AtlasWorkspace.jsx:56–57`).
- **Inspector lifespan fields are keyed on `node.id`, not placement id** (`AtlasWorkspace.jsx:339`),
  so switching between two placements of the same node on one map shows stale start/end values.
  Only reachable via the unused multi-placement path, so latent for now.
- **New worlds silently arrive with a timeline already on.** `schema.sql` defaults
  `timeline_enabled` to `true` with 0–100 *years*, current 50. So "🕓 Enable timeline" never
  appears for a new world and you get a scrubber you didn't ask for, parked at year 50. Five of
  eleven prod worlds still sit at exactly that default. Either default it off, or run the
  range editor on first open the way `enableTimeline()` already does.

---

## Data cleanup (safe, and worth doing before you invite anyone)

- **8 of 11 active worlds are test junk** — `1`, `pooland`, `Test`, `Post-purge smoke`,
  `Share verify` ×2, `toms world`, `Test map for atlas`. Only **The Hollow Court** (3 maps,
  5 nodes, timeline days 1–30, share link live) looks like real content, with *The Sunless Reach*
  a possible second. The Dashboard world list is mostly noise.
- **`toms world` has a live share token and zero nodes.** If that link is out in the world, it
  currently shows an empty map.
- **13 maps are invisible orphans from the deleted legacy system** — `owner_node_id IS NULL` and
  not any world's `root_map_id`, so `childrenOf()` in the rail never renders them. All have 0
  placements. Safe to delete.
- **The orphaned `events` table holds 66 rows across 15 maps.** I checked the contents before
  trusting `CLAUDE.md`'s "droppable whenever": it is almost entirely test data — "New Info Node"
  ×many, "asdf", "Blach blach". The only lines resembling real worldbuilding are three or four
  Osterra entries ("The known world, split in two with the world spine mountains!"). Eyeball those
  four, then drop `events`, `events_backup_tooltip_migration`, `map_timeline_images`,
  `timeline_settings`, `user_sessions` as planned.

---

## Checked and fine (don't re-investigate)

- **Server-side secrecy in `share.js` is sound.** DM-only nodes and placements are filtered in SQL
  before leaving the database; links are pruned when either end is hidden; `walkUp()` correctly
  404s deep links into hidden or not-yet-present branches by walking the whole owner chain. The
  DM-side Player toggle really is just a preview of enforced rules.
- **Share tokens don't leak via `Referer`.** helmet 7.2.0 defaults to `Referrer-Policy:
  no-referrer`, so the R2 image host and the bug-tracker widget don't receive the token in the URL.
- **R2 is fully live** — 175/175 images have a `storage_key`, 0 base64 fallback rows.
- **Ownership checks are consistent** across every Atlas route (`ownsWorld` on each, resolved
  through `worldIdOfMap`/`worldIdOfNode`/`worldIdOfPlacement`).
- **The timeline invariant** (min < max, current clamped) is enforced server-side in the world
  PATCH as `CLAUDE.md` requires.
- **The rate-limiter `skip` path is correct** — `req.path` is mount-relative under
  `app.use('/api/', ...)`, so `/share` matches.
- **No unreachable interior maps in prod** (0 maps whose owner node has no placement).
- **`resolveImageUrl`** correctly passes absolute R2 URLs through without host-prepending.
- **Client build is green** (109 modules, no errors).

---

## Suggested order

1. **#1 + #2 together** — one change introducing a real map-space transform. This is the whole
   ballgame for laptop-DM + phone-players, and it's cheapest now at 23 placements.
2. **#5 + #6 + #7 together** — the silent-failure cluster. Shared axios factory with an
   interceptor, an error toast, an honest save indicator, a dedicated `/api/atlas` rate bucket.
   Small, and it stops you losing work.
3. **#3 + #4** — make delete honest and give "remove from this map" a button. Backend already done.
4. **#8** — split viewing moment from canon moment before players are actually holding phones.
5. **#9, #10, #11** — search, then either build or hide list view, then legend/filter.
6. Data cleanup, then P3.
