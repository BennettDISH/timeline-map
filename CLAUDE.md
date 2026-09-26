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
- Tests run against the LIVE deploy: the API suite is `node --test server/test/share-live.test.js`
  (from the repo root); the browser suites (Playwright) live in `e2e/` — `player.mjs` for the
  Player View and `dm.mjs` for the DM workspace on a throwaway world — see `e2e/README.md`
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
**Production holds a real campaign** (Bennett's world 29: DM notes, R2 art, the Forge bible, a
share link in use). The data is NOT disposable: migrations are additive (`ADD COLUMN IF NOT
EXISTS`), never a recreate, and anything destructive gets a snapshot first (`tombstones`, or an
export like `~/atlas-backups/`). Undo and world clone both insert from ONE column list per
table (`NODE_COLS`/`MAP_COLS`/`MIND_COLS` in `atlas.js`); add every new content column there.
Clones own their art: with R2 on, objects are copied under `worlds/<newId>/` (`copyObject`),
base64 rows are lifted into R2, and folders, the lantern and the mind travel too.
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
- The top-level `ErrorBoundary` resets on a URL change via `resetKey` (App.jsx `RoutedBoundary`);
  never key it on the pathname — that remounts the whole page on every map hop.
- **The server stays up**: `database.js` never exits on a pool error; transactions use
  `pool.connectTx()` (an error listener + a release that discards a broken client). First-run
  setup holds an advisory lock. SSO profile sync skips a username/email another row holds
  (never a 500). Share map ids are parsed once (`intId`) and a player marker lands in one
  statement. Image list/metadata queries never select `base64_data`.
- **Autosave contract** (`AtlasWorkspace.jsx`): every write goes through `track()` so the
  header chip is honest. Node fields, lifespans and map notes each have their OWN debounce
  clock and pending payload (`flushSave`/`flushLife`/`flushNote`, `flushAll` on unmount and
  before navigation). A refused node save is never dropped: it waits in `failedPatches`
  under anything typed since and is retried every 5 s, and the chip stays on "Not saved"
  until it lands. `pagehide` flushes what is pending with keepalive fetches. A dead session
  (`atlas:auth-expired` from `http.js`) stashes pending edits in `localStorage.atlas_unsaved`
  and the next visit to that world re-applies them; `authenticateToken` slides the session
  with an `X-Refreshed-Token` header that `http.js` stores. Local node state is camelCase
  (`localPatchNode` translates API keys), so a saved `dm_note` is what the reseeded inspector
  shows. Reveal (`PATCH /nodes/:id {reveal:true}`) merges note into body ON THE SERVER. Map
  loads carry a sequence number; a stale reply never lands. Create buttons ignore re-entry
  (`once`), and `POST /nodes/:id/interior` claims the interior atomically.

## Sharing (Player View)
- The DM mints a share link in the Atlas Share popover → `/p/:token` (public route, no account).
- `worlds.share_token` is the whole capability; regenerate rotates it, delete revokes it.
- `server/routes/share.js` is the public read-only API. **All secrecy is enforced there,
  server-side**: DM-only nodes/placements and out-of-time placements never leave the DB; links
  are pruned when either end is hidden; deep links into hidden/future branches 404 via the
  owner-chain walk (`walkUp`). The DM-side "Player" toggle is only a preview of these rules.
- **Node detail follows the same rule as maps** (`reachableIds`): `/nodes/:id` and its
  Threads name a node only when it (or an interior it owns) stands on a map that passes
  `walkUp`, through a non-DM placement alive inside the allowed envelope (the player-visible
  eras clipped to canon, plus canon). Being 'shared' alone is not enough — ids are guessable.
  Windowed lifespans, backdrops, the party trail and a map's focus window are SNAPPED onto
  that envelope (`snapStart`/`snapEnd`), so no moment inside hidden history leaves the
  server. A clock with no canon fails closed (`NEVER`). Malformed ids 404.
- Image ids are checked to belong to the world on every write (`imageInWorld` in
  `atlas.js`); R2 URLs are public, so this is what keeps one account's art out of another's.
- **Every node is born DM-only** — manual ones (＋ Add node, right-click, ◌ Outline; POST
  `/maps/:mapId/nodes` inserts `visibility='dm'`) exactly like Forge-born ones. Revealing is
  always a deliberate act. The one exception is a player's own marker (forced 'player').
- The internal bug-tracker widget is injected server-side (the SPA fallback in `server.js`)
  on every page except `/p/*`; its key comes from `BUG_WIDGET_KEY` and is not in the bundle.
- `/api/share` has its own rate-limit bucket (the whole table shares one venue IP and the
  Player View polls every 45s).

## Timeline semantics
- The DM's scrubber is a local LENS (never auto-saved); players see the CANON moment
  (`timeline_current_time`), which moves only via the explicit "Set canon" button. Saving the
  timeline range/unit never sends canon (the server clamps it into the new range); switching
  the clock back on keeps the world's stored range, unit and canon unless it never had one;
  disabling it asks first (players would see every moment). A blank moment box anywhere
  means "no change", never 0. The world PATCH rejects null/non-integer clock fields (400).
- Maps may declare a FOCUS PERIOD (`maps.focus_start/focus_end`): inside that map the DM
  scrubber's track zooms to that window (⤢ expands). It is a magnifier on the ONE world
  clock — never a second clock; `now` and canon stay world-level.
- Nodes carry a `pin` style: 'chip' (icon + name) or 'image' — the node's art drawn
  directly on the map (frameless, PNG transparency respected), for both DM and players.
- **Outlines**: a placement may carry a `shape` (JSONB, 3–200 `[x,y]` points in % of the
  plane), a `shape_kind` preset ('area' = fill + stroke, a wash that fades with size;
  'button' = stroke + grow + glow + pop) and `shape_style` (JSONB toggles overriding the
  preset: fill, stroke, grow, glow, pop — 'pop' clips the SAME backdrop to the outline and
  lifts it 5% with a shadow under the pointer; no second image). The DM traces a feature of the art
  (◌ Outline in the toolbar, the right-click menu, or the inspector's "On this map") and
  that region becomes the node's button for DM and players (`components/Regions.jsx`, SVG
  over the plane; click reads, double-click enters). **An outlined placement draws no pin**:
  its name floats at the anchor (`x/y`) on hover, when selected, when labels are always on,
  and always on touch screens. Regions stack smallest-on-top so a house inside a district
  stays clickable; pins always float above regions. Validated in `atlas.js`
  (`cleanShape`/`shapeKind`/`cleanStyle`), sent by `share.js`, kept by world copies and undo.
- Map colour language: DM-only things are FAINT (opacity .45), never a colour of their own;
  things not present at the lens moment get a dashed PURPLE edge and the timebar's ⏳
  toggle hides them (local preference); a player's marker is dashed green; the lantern
  glows gold.
- `nodes.dm_note` is the SECRET half of a node: never selected by `share.js`, never fed to
  the Forge painter, shown only in the inspector + view-posture reader. The body is the
  public face; the inspector's "Reveal" button merges note → body. The mind is ordered to
  write secrets there and to keep image prompts to the innocent surface.
- `node_facts` are timed description overrides (same resolution rule as backdrops): the
  Colosseum reads as gladiators in 200, tourists in 2026. Resolved client-side in the
  reader, server-side in `share.js` (`?t=` on the node endpoint) for players. A blank
  period never overrides the base text, and "＋ Story for a period" starts as the text
  players read at that moment.
- `map_backdrops` are timed art overrides: the active backdrop at moment t is the row
  covering t with the latest start (base `maps.image_id` otherwise). Resolved client-side
  for the DM lens, server-side in `share.js` for players.
- The table convention: the clock counts **footsteps**, ten per session; each session is
  an era (`Session N`, footsteps 10N–10N+9), and "＋ Next session" in the timeline config
  appends the next era and grows the timeline to it, so the latest session is always the
  end of the clock. Every clock label reads era-relative via `utils/moment.js`
  ("Session 3 · footstep 7"). "The Party" node (category `party`, one per world) carries a
  placement + fact per footstep, following the players. On any map its PAST footsteps draw
  as a trail (`components/PartyTrail.jsx`: ghost prints, older fainter, colored per session
  via `SESSION_COLORS`, joined by a dotted path); the live footstep is the pin itself with
  a session-colored ring and an `S3·7` tag. The DM timebar shows a clickable tick per
  footstep (`GET /worlds/:id/trail`) — click sets the lens and jumps to that footstep's map.
  The trail crosses maps in TEXT, not markers: the Party's reader/sheet says "◂ From …" and
  "Then on to … ▸" with links (`partyNeighbors` in `utils/moment.js`); players get the
  world-wide `partyTrail` in the windowed share payload, reachable maps only. (The
  "⚑ The party is at …" chip was removed on 2026-09-25 as clutter.)
  Map ▾ → 👣 Footprints toggles the ghost-print trail (local preference).
- A spoken line is never overwritten: `POST /nodes/:id/line` refuses (409) while one exists;
  clear it first.
- Double-clicking a pin only ENTERS an existing interior; interiors are created on purpose
  from the inspector, never as a side effect.
- `eras` are named periods; ones marked `player_visible` let players scrub that stretch of
  the PAST in the Player View (`?t=` on the share map/locate endpoints). `allowedTime` in
  `share.js` enforces the rule server-side: a requested moment outside a revealed era, or
  past canon, silently resolves to canon. The workspace 🎭 posture previews this.

**V1.0 — tagged 2026-08-20.** The founding vision is implemented end-to-end; what remains
below is a wish-shelf, not a gap list.

## Player markers (live, trust-based)
- A share-link holder can drop a marker on the Player View: POST `/:token/maps/:mapId/nodes`
  in `share.js`, visibility FORCED to `'player'`, live for the whole table immediately.
  The server holds the boundary anonymously: `walkUp` gate (no hidden branches), inputs
  length-capped, its own 16kb body parse + 40/hr IP limiter + soft 200/world cap, and it
  can never forge a `shared`/`dm` tier. `nodes.author` is a self-typed signature — surfaced
  as "a player's marker, signed …", never as verified attribution.
- The DM sees `'player'` nodes as dashed green pins; the inspector offers to claim (re-visibility)
  or delete (with undo) them.

## The Forge (per-world AI mind — optional harness)
- One mind per world (Gemini text + Nano Banana `gemini-2.5-flash-image` images), reachable
  only from the DM workspace's ✦ Forge panel (edit posture). **Entirely inert without
  `GEMINI_API_KEY`** (or with `FORGE_ENABLED=0`): every `/api/forge` route except `/status`
  404s and nothing calls out. Model IDs override via `FORGE_TEXT_MODEL`/`FORGE_IMAGE_MODEL`.
- Server: `server/forge/` — `gemini.js` (fetch-only REST client), `contract.js` (the ONLY
  batch write path: validator clamps/rejects, then one transaction; images painted +
  R2-uploaded first with rollback cleanup; the image picker's ✦ Paint routes in `forge.js`
  are direct DM acts outside any batch), `mind.js` (rulebook + per-turn world digest from
  the DB + `world_minds` lore/style + `mind_messages` tail). Routes in
  `server/routes/forge.js` (auth + ownsWorld + 120/hr limiter; one chat turn per world at
  a time — a second gets 409).
- New nodes and placements are **born DM-only**, and **nothing a PENDING batch wrote reaches
  players before Keep**: `share.js` loads the world's pending batches once per request
  (`pendingForge`, on `w.pending`) and hides their maps (even an interior hung on a shared
  node), links, timed backdrops and facts, and serves the previous art / body / standing
  backdrop of existing things they touched. The DM-side Player toggle does not preview
  this. Batches are grouped in a `forge_batches` row — "Keep" retires the card, "Unmake"
  removes what the batch made, and ONLY that: it refuses (409 `blocked`) while hand-made
  placements, footsteps or markers stand inside the batch's maps or the DM hung spaces on
  its nodes; keeps paintings used elsewhere (the style anchor counts unless the batch set
  it — `created.anchorSet`); reverts a granted move only if its map still exists.
  The mind never sets visibility itself (it may only ASK to `reveal`); **revealing a node
  (atlas PATCH visibility ≠ dm) also lifts its DM-only placements to shared** — forge-born
  placements would otherwise keep a "revealed" node invisible to players.
- **Asks (permission-gated skills)**: the mind may request privileged acts on EXISTING
  things — `move` (reposition/carry a placement, incl. onto a new interior), `edit`
  (overwrite title/body/category/dm_note), `drop_era`, `reveal`. They're stored on the
  batch (`asks`/`asks_state`/`asks_undo`) and execute ONLY via the card's Allow button
  (`POST /batches/:id/allow`; Refuse/Keep lapse them). Allowed asks record undo state,
  so Unmake reverts them along with the creations. An ask whose target is gone reads
  "✕ … no longer possible" on the card (`asksLive`), and Allow reports what it skipped.
- Art style lock: `world_minds.art_style` (written spec — the mind drafts it when empty)
  + the style ANCHOR (`style_image_id`, the first painting by default) passed as a Nano
  Banana reference image into every later generation. Image prompts describe content only,
  never style. **Everything the mind runs on is DM-editable** in the panel's ⚙ partition
  (PATCH `/worlds/:id/mind`): art style, anchor (swap to any world image / clear), the
  mind's lore memory, `gen_size` (small/medium/large — how big a "fill out" runs), and the
  CAMPAIGN BIBLE (`world_minds.bible`, ≤100k chars, paste or .md upload) — the DM's own
  document, sent as canon in every turn's grounding; "📜 Build from the bible" constructs
  the world from it in successive keep/unmake-able batches.
- The contract also ENRICHES existing nodes (`enrich`: facts, extra placements, and a body
  that only ever fills an EMPTY one — unmake nulls exactly those). A backdrop entry with
  null start SETS a map's standing image (unmake restores what it replaced); dawn-pinned
  single-instant lifespans ({start:0,end:0} for "always") normalize to open-ended. Chat
  sends the DM's standing context (current map + selected node, server-verified) every turn.
- **No modes.** The panel is one conversation: the mind reads intent from the words plus
  the standing context (current map + selected node, sent in FULL detail — body, notes,
  stance, facts, threads — and shown as a chip on the composer). Questions → say only;
  "paint X" → images + `enrich.image` / `backdrops`; "build/fill" → creation; a session
  RECAP → dated `lore_append` + `enrich.dm_note_append` / `stance` + `enrich_maps`
  (map-note appends) + asks (`reveal`, `move`, `edit` incl. `dm_note`) + new nodes only
  for new things. Batch cards thread under the reply that made them
  (`mind_messages.batch_id`). Messages up to 12k chars; caps 8 images / 60 nodes / 40 asks.
  The image picker's ✦ Paint button remains the precise one-click paint path.
- Contract bookkeeping records WHAT the batch wrote (`wrote`) next to what it replaced
  (`prev`); Unmake reverts a field only while it still holds exactly that (compare-and-set),
  so the DM's later edits survive, and the mind's message for the batch gets an "↩ Unmade"
  line. A failed apply is stored as "⚠ Nothing was changed: …" and writes no lore. The DM's
  message is stored BEFORE the model call, so a failed turn keeps it. Messages over 12,000
  characters are refused (400), never trimmed. The mind reads the whole bible (≤100k) and
  the latest 20k of lore; the lore PATCH keeps the newest 20k. Edit asks show their proposed
  words on the card. A `move` ask carries an outline along (or clears it across maps).
  The rulebook speaks the world's own clock unit and knows the one `party` node. The
  digest sends each node's `vis` ('dm' | 'player'; revealed nodes unmarked, player markers
  with `author` and ruled non-canon), the Party as ONE entry (live footstep + count),
  placements with x/y and DM-only marks, and orders everything newest-first with the
  current map's things first; truncation is counted in `note`/`linksNote`/`placementsNote`
  and surfaced to the DM (`digestNote`). A turn appends lore IN SQL (`RIGHT(... || $1,
  20000)`) and fills `art_style` only when still empty at write time, so a "Save the
  mind" during the turn survives. The validator turns null/bare-string entries into
  errors, never a throw.

## Voice (optional harness, three providers)
- `server/voice/providers.js` chooses who speaks: `VOICE_PROVIDER` if pinned, else the
  first key present — Gemini (`gemini-2.5-flash-tts`, PCM wrapped as WAV server-side),
  OpenAI (`gpt-4o-mini-tts`), ElevenLabs (`server/voice/elevenlabs.js`). Gemini/OpenAI
  are STEERABLE: `nodes.voice_style` (a written description) shapes every line. Ambience
  (sound generation) is ElevenLabs-only. `server/routes/voice.js` is auth + ownsWorld and
  inert with no key (or `VOICE_ENABLED=0`); `/status` reports provider/steerable/ambience
  so the inspector adapts. Audio lands in R2 (`worlds/<id>/voice-*`, `ambience-*`).
- Nodes: `voice_id`/`voice_name`/`voice_style` + one `voice_line`/`voice_url`. Maps:
  `ambience_prompt`/`ambience_url` (≤22s loop). Clearing a line or an ambience deletes its
  R2 object (`keyFromUrl`). `POST /nodes/:id/line` accepts `voice_style` so the style shown
  in the box is the one used. Model overrides: `VOICE_TTS_MODEL_GEMINI`,
  `VOICE_TTS_MODEL_OPENAI`, `VOICE_TTS_MODEL_ELEVENLABS` (one per provider). Player View: a visible node's line plays
  on its sheet; a map's ambience is a tap-to-play toggle in the top bar. All players use
  `components/AudioClip.jsx` (themed; the native controls ignore the palette). helmet's CSP
  carries `media-src 'self' blob: https:` — without it the browser renders the player but
  refuses to load R2 audio.
- Player View navigation: a persistent ⬆ back button on every interior, crumbs kept
  visible (scrolling) on phones, and ◎ on pins/list rows is a single-tap "go inside".

## Open cleanup list
A whole-app audit on 2026-09-26 (every control clicked on the live site, all code read) left a
verified punch list in `docs/cleanup/` — start at `docs/cleanup/README.md`. 326 items in 20
work packages, highest-value first: the share API's node endpoint serves nodes players must not
see, Undo and world clone drop DM notes / stance / voice, the timeline panel can move canon or
wipe the clock, and two autosaves share one timer. Work a package at a time and tick items off
in its file with the commit hash.

## Known gaps (the honest list)
- Mobile is view-only BY DESIGN (Bennett: editing happens on a PC; only player/viewing
  surfaces need to be mobile-first)
- From the "later" shelf: per-fact visibility, branching campaigns, zones/regions,
  @-mention-to-link
