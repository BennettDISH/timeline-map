# Fantasy Map Timeline - Claude Instructions

## Project Overview
- Frontend: React 18 + Vite + SASS
- Backend: Express.js + PostgreSQL
- Purpose: a recursively zoomable fantasy world you scrub through time — the "Atlas" model
- Hosting: Railway (no local server testing available)

The legacy map system (worlds → maps → events, `MapViewer`/`NodeEditor` and friends, ~3.5k lines)
was deleted in August 2026. **Atlas is the only map UI.** The founding vision lives in
`docs/UX-REDESIGN.md`; its roadmap is retired — this file is the current truth, and what is
still unbuilt is listed under Known gaps at the end. `README.md` is the doc map.

## Key Commands
- `npm run dev` - Start both client and server (for development structure reference only)
- `npm run build` - Build for production
- `npm install` at the root installs both (its postinstall runs `install-all`); `npm run migrate`
  in `server/` is optional — the boot applies the schema

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
  `auth.js` (JWT + server-side SSO), `admin.js`, `share.js` (the public Player View API),
  `forge.js` + `server/forge/` (the mind), `voice.js` + `server/voice/` (voices and ambience),
  `storage.js` (R2), `lib/validate.js` + `lib/vocab.js` (input rules and the category list)
- Client: `pages/AtlasWorkspace.jsx` (the entire workspace: canvas, tree, inspector, timebar,
  timeline config, image picker) + `components/MapPlane.jsx` (shared pan/zoom world plane —
  pins are % of the backdrop image's plane, NOT the window) + `services/atlasService.js`;
  all authed services share `services/http.js` (token header + dead-token redirect)
- Supporting pages: `Dashboard` (world select → Atlas), `PlayerView` (`/p/:token`), `ImageManager`
  (the Archive), `AdminPanel`, `Login`, `AuthCallback`, `NotFound` (the pre-SSO Setup/EnvSetup pages and `/api/setup` are gone: the schema is
  ensured on boot and admin is a Waypoint identity)
- Authentication context in `client/src/utils/AuthContext.jsx`; SSO is built server-side
  (no VITE_ client vars; configured only when URL + client id + secret all exist).
  **Admin is a Waypoint identity**: `ADMIN_CENTRAL_USER_IDS` (unset = central id 1, Bennett;
  explicitly empty = nobody; guests never) — `isAdmin` in `server/middleware/auth.js`; the
  local `users.role` grants nothing. `/me` and every sign-in return `{role: 'admin'|'dm',
  isAdmin, isGuest}`. Sign-out POSTs `{}` (a `null` JSON body is a 400 before the route)
  and bumps `token_version`; `clearLocalSession` in `http.js` also forgets the last map and
  current world. The first `/me` check clears the token ONLY when the server says the token
  is bad; a 5xx/429/network blip keeps it (cached user, or a retry screen). Sign-in and
  sign-up are `submitting`, the initial check is `initializing` — the login card never
  unmounts mid-request. Guards bounce with `replace` + `state.from` (SSO: `sso_next`).
  Guests (`users.is_guest`, from Waypoint) are named "Guest" in the menu and warned before
  sign-out; the app's guest is browser-bound (no claim path exists — Waypoint would need a
  proxy claim endpoint).
- Images upload to Cloudflare R2 (`R2_*` env vars); `resolveImageUrl` (utils/imageUrl.js) passes
  absolute R2 URLs through and prefixes relative paths; `/api/images-base64/serve/:filename`
  streams base64 rows and redirects R2-backed ones

## Database
**Production holds a real campaign** (Bennett's world 29: DM notes, R2 art, the Forge bible, a
share link in use). The data is NOT disposable: migrations are additive (`ADD COLUMN IF NOT
EXISTS`), never a recreate, and anything destructive gets a snapshot first (`tombstones`, or an
export like `~/atlas-backups/`). Undo and world clone both insert from ONE column list per
table (`NODE_COLS`/`MAP_COLS`/`MIND_COLS` in `atlas.js`); add every new content column there.
Clones own their art: with R2 on, objects are copied under `worlds/<newId>/` (`copyObject`),
base64 rows are lifted into R2, and folders, the lantern and the mind travel too.
Live tables (the 15 `schema.sql` creates, and exactly what production holds as of 2026-09-26):
`users`, `worlds`, `image_folders`, `images`, `maps`, `nodes`, `placements`, `links`, `node_facts`,
`eras`, `map_backdrops`, `world_minds`, `mind_messages`, `forge_batches`, `tombstones`. The
legacy tables (`events` and friends) are gone.

## Development Guidelines
- Follow existing SCSS styling patterns in `client/src/styles/` (`atlas.scss` for the workspace)
- Use the service layer in `client/src/services/` — do NOT create raw axios instances in components
- Timeline invariant (min < max, current clamped into range) is enforced server-side in the
  Atlas world PATCH — keep it that way for any new write path
- The top-level `ErrorBoundary` resets on a URL change via `resetKey` (App.jsx `RoutedBoundary`);
  never key it on the pathname — that remounts the whole page on every map hop.
- **One click does one thing**: MapPlane ignores gestures that start within 400 ms of a
  press inside any dialog/popover (a module-level timestamp) and honours a double-click only
  when both presses began on the viewport; while placing or outlining, Enter/Space on a
  focused button activate the button, never the map action. Paid generation is guarded
  twice (ambience: `ambBusy` + a per-map 409). Voice reports `enabled` only with R2
  (`storage`), and a saved voice the current provider does not list is named as such with
  Say it disabled.
- **Every delete is undoable**: facts, links, eras and timed backdrops leave tombstones
  (kinds `fact`/`link`/`era`/`backdrop`, restored by `POST /undo/:id` with their original
  ids) and their ✕ buttons show the ↩ Undo toast; removing a base backdrop, a node's image
  or an outline (or redrawing one) is a LOCAL undo on the toast (`flash.undo`). Breaking the
  share link (Regenerate / Turn off) takes two clicks and the toast says what happened.
- **One Party per world** is enforced by the API (409 on a second `party` node) and the
  inspector (the ⚑ dot hides once a Party exists; leaving `party` asks first). At campaign
  length: timebar ticks group per SESSION when the pitch drops under 8px, era bands print
  `S12` past five bands (the players' bar past twelve), the trail breaks between visits,
  session colours cycle only over the newest eight (older go grey), the legend counts
  things not placements, and the Party's editor shows its footstep first with the other
  periods folded. **A clock never set stores NULLs** (schema defaults dropped; legacy
  0/100/50/years rows cleared once): enabling it starts the table convention — footsteps,
  0–9, canon 0 — and "＋ Next session" opens Session 1 at 10–19.
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
- **The lantern** (`worlds.spotlight_node_id`): `spotlightTrail` in `share.js` resolves it at
  CANON by walking down the way players walk up (`walkUp` through visible, present
  placements — a lit node placed both inside a hidden branch and on the root is reached
  through the root); every step is player-visible, and a secret or out-of-time lit node
  stops the trail one step short. `POST /worlds/:id/spotlight` returns that trail.
- **Templates**: `worlds.is_template` (set by hand on sample worlds; no UI) makes a world
  clonable by any signed-in user, DM-only content included; cloning is capped at 50 owned
  worlds. The sample keep can be rebuilt from `server/test/sample-world.json` with
  `node server/scripts/seed-sample.js`.
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
- **The embed contract**: Spellforge's Map tab frames `/p/*` in an iframe. Only `/p` and
  `/p/*` may be framed, and only by the origins in `EMBED_ORIGINS` (comma-separated; default
  the Spellforge origin) — a /p-only helmet CSP sets `frame-ancestors` and drops XFO; every
  other path keeps `frame-ancestors 'self'` + `SAMEORIGIN`. A Spellforge domain change
  means updating `EMBED_ORIGINS`; an Atlas domain change means updating Spellforge's
  `MAP_SHARE_RE`. The API suite asserts the headers. Framed (`embedded` in MapPlane.jsx):
  map moves REPLACE history entries, a plain wheel scrolls the host page (Ctrl/⌘+wheel
  zooms), and a pan ends on `lostpointercapture`. The Player View fetches `/world` and the
  map in parallel; the DM pages are lazy chunks so `/p` never downloads them.

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
  the Forge painter, shown only in the inspector + view-posture reader. **`maps.dm_note` and
  `nodes.stance` follow the same rule** — never selected by `share.js` (the API suite asserts
  all three stay home). The body is the
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
  an era named `Session N` of ten footsteps, each starting right after the last session's end
  (10–19, 20–29 … when untouched), and "＋ Next session" in the timeline config
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
  **A session is an era NAMED "Session N"** (`sessionNum` in `utils/moment.js`): tags, tick
  titles, colours and labels number from the name, never from the era's position; where
  eras overlap, a session era wins, else the narrowest (`momentLabel`, `sessionOf`).
  **The party moves by footsteps**: right-click → "👣 The party moves here" (or the Party's
  inspector "Next footstep here", or placing the Party) ends the live footstep at the lens
  moment and POSTs a new placement with `start_time` (the placements POST accepts
  `start_time`/`end_time`), growing the clock if needed; the lens and selection follow. With
  the clock off, one party pin (the latest footstep) and no prints. "＋ Next session" shows
  only in footstep worlds (or where a Session era exists), follows the last SESSION era and
  numbers past the highest. A placement of a shared node can be hidden on ONE map
  (`placements.visibility`, the inspector's "Hidden on this map"); it draws faint with 🔒.
  Setting the lantern returns the resolved player trail so the toast says what players see.
- A spoken line is never overwritten: `POST /nodes/:id/line` refuses (409) while one exists;
  clear it first.
- Double-clicking a pin only ENTERS an existing interior; interiors are created on purpose
  from the inspector, never as a side effect.
- `eras` are named periods; ones marked `player_visible` let players scrub that stretch of
  the PAST in the Player View (`?t=` on the share map/locate endpoints). `allowedTime` in
  `share.js` enforces the rule server-side: a requested moment outside a revealed era, or
  past canon, silently resolves to canon. The workspace 🎭 posture previews this.

**Releases:** v1.0.0 was tagged 2026-08-20 with the founding vision implemented end-to-end;
everything since is polish, the 2026-09-26 cleanup (`docs/cleanup/`) and the wish-shelf under
Known gaps.

## Player markers (live, trust-based)
- A share-link holder can drop a marker on the Player View: POST `/:token/maps/:mapId/nodes`
  in `share.js`, visibility FORCED to `'player'`, live for the whole table immediately.
  The server holds the boundary anonymously: `walkUp` gate (no hidden branches), inputs
  length-capped, a 16 KB body limit mounted ahead of the global parser + 40/hr IP limiter + soft 200/world cap, and it
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
  document, sent as canon in every turn's grounding; asking the mind in chat to build from the bible constructs
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
  on its sheet; a map's ambience is a tap-to-play toggle in the top bar. Voice lines play through
  `components/AudioClip.jsx` (themed; the native controls ignore the palette); the Player View's
  ambience is a tap-to-play toggle in the top bar over a hidden audio element. helmet's CSP
  carries `media-src 'self' blob: https:` — without it the browser renders the player but
  refuses to load R2 audio.
- Player View navigation: a persistent ⬆ back button on every interior, crumbs kept
  visible (scrolling) on phones, and ◎ on pins/list rows is a single-tap "go inside".
- **The Player View never strands a player**: only an unknown TOKEN shows "This link isn't
  active" (`DeadLink`, also the `/p/*` route); a hidden/missing/unbuilt map shows "This
  place isn't on your map" with ⬆ back; a failed first load or failed navigation shows a
  retry, never the previous map under the new URL. Every load and sheet fetch carries a
  request counter, so late replies never repaint an older map or reopen an older sheet.
  The map is always fetched at canon with `window=1`; a remembered past moment the world
  no longer allows drops back to now. The open sheet refetches on every poll. `/p/` pages
  never call `/auth/me` and `http.js` never redirects off them. `walkUp` tries EVERY
  visible present placement of an owner, `hasInterior` is sent only when the interior is
  enterable, and `/locate` falls back to the latest revealed moment the node stood
  somewhere (`{mapId, t}` — the era bar moves there). Windowed backdrops carry `rank`
  (the DM's latest-start-then-newest rule on unclamped starts). Node categories come from
  one list: `server/lib/vocab.js` (mirrored by `MARKABLE` in `utils/categories.js`).

## Open cleanup list
A whole-app audit on 2026-09-26 (every control clicked on the live site, all code read) left a
verified punch list in `docs/cleanup/` — start at `docs/cleanup/README.md`. 326 items in 20
work packages, highest-value first: the share API's node endpoint serves nodes players must not
see, Undo and world clone drop DM notes / stance / voice, the timeline panel can move canon or
wipe the clock, and two autosaves share one timer. Work a package at a time and tick items off
in its file with the commit hash.

## Image rules
- Uploads: the BYTES decide the type (PNG/JPEG/GIF/WebP magic numbers; an SVG or a text file
  called .png is refused with the formats named), names are clamped to 255, a folder can ride
  along (`folder_id`, checked against the world), and a failed insert deletes the R2 object it
  just wrote. The upload route has its own 14 MB JSON limit (base64 is 4/3 of the file); a
  too-big body is a plain 413 sentence.
- Lists: `limit` 1–200 and `offset` whole, ids canonical, else 400; search matches `\`, `%`
  and `_` literally (ILIKE with ESCAPE). PUT /images/:id builds SET from the keys sent:
  `original_name` renames, `alt_text` '' or null clears the caption. PUT/DELETE
  /images/bulk `{ids[, folder_id]}` move or delete up to 500 of your own images at once.
- Folders: one name per level, the top level included (409), never blank; a folder
  deletes WITH its subfolders (cascade) and every image inside returns to Unsorted.
- The Archive says when a load failed (world list, folders, images) with Retry, never a
  false empty state; a world that is not the account's shows "isn't in your atlas". Upload
  feedback names each file that was skipped or failed and why; progress is the real transfer.
  The lightbox renames and captions; Esc there closes only the top layer.
- The workspace picker says what it is for (art for X / backdrop for Y / art from a moment),
  marks the current image, pages and searches the whole archive, validates before sending,
  sits above the dialog that opened it, and ✦ Paint from the period picker ADDS a timed
  backdrop (`start_time` on the forge route) instead of replacing the base art. The backdrop
  controls say which art is on screen (a period's, or the base) and change that one.
- `utils/images.js` (`usesOf`, `describeUse`, `ACCEPT`) is the one vocabulary for an image's
  uses: base art of N maps · art for N timed periods · art of N nodes · the Forge's anchor.

## Map surface rules
- A clean tap on empty space deselects; a pan never does. A thread, a search hit or a
  footstep tick SHOWS the thing: its pin is selected and framed (`focusAt` on MapPlane;
  `/locate?map=` prefers a placement on the current map and names `interiorMapId`); ◎ is
  the explicit way inside.
- Outlines: the name anchor sits on the shape (the centroid, moved on every redraw); a
  SELECTED outline drags in Edit (its shape rides along); a new outline starts as the
  remembered kind, an existing one as its own; toggles store only what differs from the
  kind's preset (a kind change resets them); removing an outline clears kind and style
  too; right-click while tracing undoes a corner. An outline in progress, an open dialog
  and the legend's filter end with the map or the posture they were started in — nothing
  is traced or saved from View/Player or onto another map. No outline tools on lists.
- The legend's category filter applies only where the legend shows (a map with two or
  more kinds); it resets per map. Pins sharing a spot fan out in a ring (`stackOffsets`);
  the selected pin sits above its neighbours; only the primary mouse button drags, and a
  right-click on a pin opens that pin's own menu.
- A place never stands inside its own interior (400); the tree files a self-owned or
  cyclic space under Unplaced; an ancestor of the open map cannot fold (the caret says so).
  The tree remounts per world (folds are per world). Its thumbnail follows the backdrop.
- SVG filters on regions are in user units of the 0–100 viewBox (a 5px blur is 5% of the
  plane): glow is ~0.35 units; the pop's shadow sits on a wrapper OUTSIDE the clipped group.

## Vocabulary (one word for one thing, in every string players or the DM read)
- **map** — every map: the root, an interior, a list-view map. Never "space", "place" (for a
  map), "plane". "interior map" is the adjective form ("＋ Interior map"); entering one is "◎ Go inside".
- **entry** — a node, in UI text ("＋ Add entry", "Find an entry…", "Who can see this entry").
  The code keeps `node`. A player's own entry is a **marker**. **pin** is the drawn thing on
  the map; an outlined entry is an **outline** (the code's `shape`/`region`), whose drawn
  edge is the **Edge** toggle.
- **thread** — a link, everywhere (editor, reader, sheet, Forge cards). **description** — the
  body; **period text** — a timed description. **image** — never "art" or "pieces" in the
  Archive (the page's own name stays "the Archive"). **backdrop** — a map's image.
- **canon** — the players' moment, in DM copy; **now** — the same moment, in player copy.
- **lantern** — the DM's pointer to one entry ("🔦 Light the lantern here" / "Put the lantern
  out"; the code's `spotlight`). **trail** and **footprints** are the party's only.
- **editor** — the right-hand panel (the code's `Inspector`). **share link** — the one link.
- Copy rule: short and factual, no scene-setting; a control's label says what it does;
  names in curly quotes (“X”); a one-sentence flash has no trailing period; "…" not "...";
  sentence case; ＋ in buttons.

## Inspector rules
- Links are THREADS and they are public: players see a thread (label included) between two
  things they can both see. The editor says so; one thread per pair (a second is a 409),
  ordered by id, manageable (label, remove) from either end.
- Reveal lands where players read: when a period text covers CANON, the note is appended
  to THAT period (the reply carries `factId`), else to the description. The button names its
  target.
- A name follows its owner while it still matches: an interior named after its node is
  renamed with the node, and the default root map ('<world> — World Map') follows a world
  rename. A space or root the DM named on purpose keeps its own name.
- A player's marker (`visibility='player'`) shows a marker bar — Keep as canon / Hide /
  Delete — and neither visibility button lit. A just-dropped node opens with its title
  focused and selected; the editor scrolls to the top for each newly selected thing.
- Pickers say what they left out ("Already on this map: …", "Already threaded: …") and
  show a loading line, never an empty-state lie.

## Input rules (server-side, `server/lib/validate.js`)
- Every write route cleans its body first: text is clamped to its column (titles 255, era
  names 120, the clock unit 50, link labels 255, bodies and notes 20k), moments are whole
  numbers, enums are checked (category, visibility, stance, pin, view), positions are
  clamped onto the plane, and a bad value is a 400 with a plain sentence — never a Postgres
  error dressed as 'Server error'. A blank node title stores as 'Untitled'.
- Ranges are ordered: a lifespan, focus period, era, period text or backdrop whose end is
  before its start is refused, and a PATCH of one bound is judged against the STORED other
  bound. The client HOLDS a reversed pair instead of sending it (a hint under the inputs,
  `periodBlur` / `setLifespan` in AtlasWorkspace) and never retries a refused (4xx) save:
  the stored value comes back (`refused()` in `services/http.js`).
- Ids have one spelling: `router.param` answers 404 for `60.0`, `abc`, `-1` in every router.
  A map opened under the wrong world redirects to its own (the map payload carries `worldId`).
- One world-name rule on every path (create, rename, clone): text of 1–255 characters, unique
  among your worlds (409 otherwise).
- The DM reads one sentence per failure: `errText(e, fallback)` in `services/http.js` shows
  the server's own 4xx message, the caller's fallback for a 5xx, and adds "check your
  connection" when nothing answered; every service rejects with the same (axios) error.
  Forge and voice routes log the raw provider error and answer with `err.userMessage` or a
  generic line — provider JSON, SQL and dev-speak never reach the DM.
- A world that fails to load shows a Try-again panel (a 404 sends the DM to the dashboard
  with a notice); a space that is gone (404) shows 'This space no longer exists' with a way
  to the world map, and no editor chrome is armed until a map is loaded.

## Known gaps (the honest list)
- Mobile is view-only BY DESIGN (Bennett: editing happens on a PC; only player/viewing
  surfaces need to be mobile-first)
- From the "later" shelf: per-fact visibility, branching campaigns,
  @-mention-to-link
