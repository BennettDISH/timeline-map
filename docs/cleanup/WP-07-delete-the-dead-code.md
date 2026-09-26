# WP-07 · Delete the dead code

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Remove routes, response fields, exports, props and CSS that nothing uses, so every later package has less code to read and change.

**Notes:** Code only. The legacy DB columns wait for WP-20. Grep for each symbol before deleting it, then run npm run build, the share-live test and both e2e suites. api-contract-14 removes the extra links query that runs on every map load. canvas-29 removes the outline drag code, so first confirm that WP-13's work on moving outlines (outlines-03) does not need it. api-contract-23: check that no dev workflow relies on cors() before removing it. Do this package before WP-19 and WP-20.

## Checklist

- [x] **B078** · low · xs · Player-marker 16kb body cap does nothing: the global 10mb JSON parser runs first — done 3ca732d (a 16 KB express.json for /api/share mounted ahead of the global parser; markBody gone; CLAUDE.md says so)
- [x] **D001** · low · xs · Regions gets props it never reads (item.kind, item.node, onDraw.cancel) and works out selection by regex on a class string — done 3ca732d (items carry a `selected` flag; `kind` and onDraw.cancel dropped; `node` stays — onEnter reads it)
- [x] **D004** · low · s · Unused service methods, plus localStorage keys that are written and never read ('user', 'current_world_id') — done 3ca732d (worldService.getWorld/getCurrentWorldId/setCurrentWorldId/getCurrentWorld/setCurrentWorld, imageServiceBase64.getImage, imageFolderService.getFolderPath and the tags option are gone; authService.getUser stays — AuthContext reads the cached user)
- [x] **D005** · low · xs · Unused world-service surface: GET /api/worlds/:id, worldService.getWorld and getCurrentWorldId, the current_world_id key, and the worlds.settings column — done 3ca732d (GET /api/worlds/:id and the settings plumbing removed; the column waits for WP-20)
- [x] **D006** · low · xs · atlas.scss selectors for markup that was removed or renamed (tree caret, save label, view toggle, Forge quick-actions, old sheet parts) — done 3ca732d (.trow .tw, .chip .ic, .saved, .shead .sclose, .simg, .viewtoggle, .fquick/.fbatches/.fguide removed)
- [x] **D007** · low · xs · The CSS rule '.atlas .labelson .rlabel' never matches anything — done 3ca732d (the rule now matches the root: .atlas.labelson .rlabel; Regions no longer takes labelsOn)
- [x] **D008** · low · xs · utils/moment.js: partyNextFrom has had no caller since the on-map 'went to' marker was removed; partyWhere is exported only for internal use; the header comment is attached to the wrong function — done 3ca732d (partyNextFrom deleted, partyWhere private, the header comment sits above momentLabel)
- [x] **D011** · low · s · Response fields the server computes and sends but no client reads — done 3ca732d (map-level links, interiorView, timeContext, the trail's x/y and previousImageId are gone; ownerNodeId, imageId and the node object are kept — the client reads them now)
- [x] **D013** · low · xs · main.scss keeps ~155 lines styling removed features: admin migration buttons, the old 404 page, an unused spin keyframe — done 3ca732d (the admin, migration, not-found and spin rules are gone; the admin table has one rule instead of inline styles)
- [x] **D014** · low · xs · GET /maps/:mapId computes data the client never reads, including an extra links query on every map load; MapPlane's controlsOffset prop is never passed — done 3ca732d (the links query and interiorView join removed; controlsOffset removed)
- [x] **D015** · low · xs · GET /maps/:mapId builds a links array the client never reads; link kind/time_context are never set or read — done 3ca732d (no map-level links; time_context no longer sent or accepted — the column stays with the schema cleanup)
- [x] **D016** · low · s · Dead image-pipeline code: unused service methods, an unused route, response fields and folder columns nobody reads — done 3ca732d (getImage + GET /images/:id, getFolderPath, hasMore, uploadedBy and its join, the folder parent/child joins and colour/icon fields, the tags filter are gone; the columns wait for WP-20)
- [x] **D017** · low · s · Share map endpoint: the per-moment branch for timeline-enabled worlds is only ever hit by tests — done 3ca732d (the one-moment path is kept for the API suite and the share route says so)
- [x] **D018** · low · xs · The cors() middleware does nothing in production — done 3ca732d (cors and its dependency removed)
- [x] **D019** · low · xs · Exports never imported anywhere — done 3ca732d (CATS, provider, elevenlabs.enabled, digest, TOKEN_TTL and migrate's export are no longer exported)
- [x] **D020** · low · xs · Props, fields and exports that nothing reads (MapPlane controlsOffset, Regions item kind/node, STYLE_KEYS import, always-true guards, file-local exports) — done 3ca732d (controlsOffset, item kind, the NodePicker default title, the windowed param and the file-local exports are gone; STYLE_KEYS and the onOutline guards are live now)
- [x] **D021** · low · s · The share map endpoint computes map links the Player View never reads; the non-windowed timed-backdrop branch is reached only by tests — done 3ca732d (the share map carries no links, asserted by the suite; the one-moment path is kept for the tests, with a comment)
- [x] **D022** · low · s · Routes with no caller: GET /api/worlds/:id and GET /api/images/:id; world CRUD split across two routers — done 3ca732d (both routes deleted with their wrappers; Railway checks /health, which the deploy watch also reads — world routes stay split)
- [x] **O003** · low · xs · Leftovers of the removed Forge quick-action rail: CLAUDE.md '📜 Build from the bible', a 'fill this out' hint, dead .fquick/.fguide/.fbatches CSS — done 3ca732d (CLAUDE.md and the Creation-size hint reworded; the rail's CSS removed)
- [x] **O005** · low · xs · EraScrub's non-live (debounced) mode is dead because both callers pass `live`, and its header comment describes that dead mode — done 3ca732d (one code path: commits on every step)
- [x] **O006** · low · xs · Left over since outlined places lost their pin: a 'hov' pin class that can never apply, and drag code that moves outlines — done 3ca732d (the hov class and its rule are gone; the outline-drag code is live again — a selected outline moves, WP-13)
- [x] **O007** · low · xs · Declarations in atlas.scss that are always overridden: inline grid columns, doubled .tlcfg/.sheet/.fsend blocks, duplicate .apop top — done 3ca732d (inline columns win alone, one .tlcfg block, one .fsend border, one helpwrap rule; the sheet's overridden padding and font-size removed)
- [x] **O008** · low · xs · Leftover native-<audio> rules styling elements AudioClip now hides — done 3ca732d (native audio sizing removed; .rvoice/.ramb keep only their width)
- [x] **O009** · low · xs · Obsolete overlay-era leftovers: a section comment for removed markers and MapPlane's never-passed controlsOffset prop — done 3ca732d (controlsOffset removed; the trail comment was already reworded)
- [x] **O022** · low · xs · Player View sheet CSS has leftovers: an unused .simg, a never-matching .shead .sclose, rules overridden later, and a comment about a removed chip — done 3ca732d (.simg and .shead .sclose removed, the sheet's overridden declarations dropped, the audio rule gone)

## Items

### B078 · Player-marker 16kb body cap does nothing: the global 10mb JSON parser runs first

Broken · low · effort xs · found by `api-contract` (+2 other lanes)

- **Where:** POST /api/share/:token/maps/:mapId/nodes
- **Files:** `server/routes/share.js:272`, `server/routes/share.js:274`, `server/server.js:90`, `server/node_modules/body-parser/lib/types/json.js:102-104`
- **What happens:** app.use(express.json({limit:'10mb'})) runs before the /api/share router, and body-parser skips any request whose body is already parsed (req._body). markBody = express.json({limit:'16kb'}) is therefore a no-op. A 60 KB JSON body to the marker route returned 404 (bad token) instead of 413. Anonymous share-link holders can send 10 MB bodies to any /api/share route. CLAUDE.md claims 'its own 16kb body parse'.
- **Why it matters:** Anonymous endpoints parse small bodies only.
- **Fix:** Mount express.json({limit:'16kb'}) for '/api/share' BEFORE the global parser (or move the 10mb parser onto the authed routers only), then delete markBody. Update CLAUDE.md accordingly.
- **Repro:** POST https://timeline-map-production.up.railway.app/api/share/not-a-real-token-0000/maps/143/nodes with a 60 KB JSON body → 404, not 413 (lanes/api-contract/markers.mjs, 1 of 6 marker budget).
- **Evidence:** markers.mjs: '60kb body, bad token -> 404 {"message":"Not found"}'
- **Re-proved:** server/server.js:90 mounts app.use(express.json({limit:'10mb'})) before app.use('/api/share', ...). share.js:272 defines markBody = express.json({limit:'16kb'}) and share.js:274 mounts it after markLimiter. body-parser 1.20.3 (server/node_modules/body-parser/lib/types/json.js:101-105) returns early with 'body already parsed' when req._body is set, so markBody never runs. CLAUDE.md:134 still claims 'its own 16kb body parse'. I reproduced it live on my own clone (world 99, cloned from 30, since d…
- **Also found as:** "The player-marker route's '16kb body parse' never runs; the global 10 MB parser…" (server-dead); "The player-marker endpoint's '16kb body parse' does nothing; the global 10mb pa…" (docs-hygiene)

### D001 · Regions gets props it never reads (item.kind, item.node, onDraw.cancel) and works out selection by regex on a class string

Dead code · low · effort xs · found by `outlines`

- **Where:** client/src/components/Regions.jsx:49,96; AtlasWorkspace.jsx:1048-1056; PlayerView.jsx:219-221
- **Files:** `client/src/components/Regions.jsx:49`, `client/src/components/Regions.jsx:96-98`, `client/src/pages/AtlasWorkspace.jsx:1048-1056`, `client/src/pages/PlayerView.jsx:219-221`
- **What happens:** Both callers pass `kind: p.shapeKind` and `node: p.node` in every item. Regions reads only id/pts/style/x/y/title/secret/hasInterior/cls, and grep finds no `it.kind` or `it.node`. The workspace passes `onDraw.cancel`, and Regions never calls it (only onDraw.add and onDraw.finish). Selection is found with `/\bsel\b/.test(it.cls)` instead of a prop, so the class string doubles as data.
- **Why it matters:** Only the props the component uses, with a real `selected` flag.
- **Fix:** Drop `kind`/`node` from both item mappers and `cancel` from onDraw (AtlasWorkspace.jsx:1056). Add `selected: selId === p.id` / `detail?.node?.id === p.node.id` to items and use `it.selected` in Regions.jsx:96-98,130.
- **Repro:** grep -n "it\.kind\|it\.node\|\.cancel" client/src/components/Regions.jsx → nothing.
- **Evidence:** grep output: no reads of it.kind / it.node / onDraw.cancel in Regions.jsx
- **Re-proved:** Regions.jsx:49 destructures items/backdropUrl/hoverId/onHover/labelsOn/inert/drawing/onDraw. The body reads it.id, pts, style, cls, x, y, title, secret and hasInterior. `grep -n "it\.kind\|it\.node\|\.cancel\|\.node\b\|\.kind\b" Regions.jsx` returns nothing (exit 1). onDraw is used only as onDraw?.add (line 91) and onDraw?.finish (lines 109, 141). AtlasWorkspace.jsx:1056 passes `cancel: () => setDrawing(null)`, which is never called. Both callers pass `kind: p.shapeKind` and `node: p.node` (Atl…

### D004 · Unused service methods, plus localStorage keys that are written and never read ('user', 'current_world_id')

Dead code · low · effort s · found by `client-dead`

- **Where:** client/src/services/worldService.js, authService.js, imageServiceBase64.js, imageFolderService.js
- **Files:** `client/src/services/worldService.js:17-25`, `client/src/services/worldService.js:47-58`, `client/src/services/authService.js:96-100`, `client/src/services/authService.js:132-135`, `client/src/services/authService.js:16`, `client/src/services/imageServiceBase64.js:17`, `client/src/services/imageServiceBase64.js:49-53`, `client/src/services/imageServiceBase64.js:67-75`, `client/src/services/imageFolderService.js:78-97`, `client/src/pages/AtlasWorkspace.jsx:903`
- **What happens:** No caller anywhere in client/src, e2e or server/test for: worldService.getWorld and getCurrentWorldId, authService.getUser and getToken, imageServiceBase64.getImage, imageFolderService.getFolderPath. Because getUser is unused, the 'user' key written in register, login, guest, ssoLogin and setSession is never read (AuthContext always calls /me). Because getCurrentWorldId is unused, 'current_world_id' (written by setCurrentWorldId, including the brand-switcher fallback at AtlasWorkspace:903) is never read. The uploadImage altText/tags params and the getImages `tags` option are never passed a value. On the server, GET /api/worlds/:id and GET /api/images/:id consequently have no client caller.
- **Why it matters:** No dead client API and no write-only storage.
- **Fix:** Delete the six methods and the tags/altText params. Stop writing 'user' and 'current_world_id', and drop setCurrentWorldId (the brand switcher can call setCurrentWorld). Flag the two server GET-by-id routes for the server lane.
- **Repro:** For each method: grep -rnE '\b<service>\.<method>\b' client/src e2e server/test → 0 hits. grep -rn "getItem('user')\|getItem('current_world_id')" client/src → only inside the unused getters. The keys were written for WorldSelector, which was deleted in 1874e7b.
- **Re-proved:** Read worldService.js, authService.js, imageServiceBase64.js and imageFolderService.js at HEAD 32ef89c. Ran grep -rnE '\b<method>\b' over client/src, e2e and server/test for getWorld, getCurrentWorldId, getUser, getToken, getImage and getFolderPath. The only getWorld hits are shareService.getWorld, forgeService.getWorld and atlasService.getWorld, which are different methods on /api/share, /api/forge and /api/atlas. Nothing calls worldService.getWorld. The other five have no hits outside their ow…

### D005 · Unused world-service surface: GET /api/worlds/:id, worldService.getWorld and getCurrentWorldId, the current_world_id key, and the worlds.settings column

Dead code · low · effort xs · found by `dashboard`

- **Where:** client/src/services/worldService.js:16-24, 46-57; server/routes/worlds.js:58-102, 107-131
- **Files:** `client/src/services/worldService.js:16-24`, `client/src/services/worldService.js:46-57`, `server/routes/worlds.js:58-102`, `server/routes/worlds.js:107-146`, `client/src/pages/AtlasWorkspace.jsx:903`
- **What happens:** worldService.getWorld has no caller. The only getWorld( calls go to atlasService, forgeService and shareService. GET /api/worlds/:id (worlds.js:58-102, a legacy JOIN-count query) has no caller in client/, e2e/ or server/test. worldService.getCurrentWorldId has no caller, so the 'current_world_id' key it reads is written (worldService.js:51-56, AtlasWorkspace.jsx:903) but never read. worlds.settings is accepted by POST (line 107, 128-131) and echoed in three responses (36, 85, 143), but no client code reads .settings.
- **Why it matters:** No dead endpoints or keys.
- **Fix:** Delete worldService.getWorld, getCurrentWorldId and setCurrentWorldId (and the fallback at AtlasWorkspace.jsx:903), the GET /:id route in worlds.js, and the settings plumbing in worlds.js. The column can go in a later schema cleanup.
- **Repro:** grep -rn "worldService\.getWorld(\|getCurrentWorldId" client/src e2e/*.mjs | grep -v services/worldService.js → no output; grep -rn "\.settings\b\|settings:" client/src → no output
- **Evidence:** grep outputs above were empty
- **Re-proved:** I read client/src/services/worldService.js. getWorld is at lines 16-24, getCurrentWorldId at 47-49 and setCurrentWorldId at 51-57. I read server/routes/worlds.js: GET /:id is lines 58-102 and uses the LEFT JOIN + GROUP BY count query; settings is destructured at 107, inserted at 128-131 and echoed at 36, 85 and 143. Searches across the repo (excluding node_modules/dist): `grep -rn "getWorld("` found only atlasService, shareService and forgeService getWorld, plus their callers in PlayerView and …

### D006 · atlas.scss selectors for markup that was removed or renamed (tree caret, save label, view toggle, Forge quick-actions, old sheet parts)

Dead code · low · effort xs · found by `scss-dead` (+2 other lanes)

- **Where:** client/src/styles/atlas.scss (lines listed)
- **Files:** `client/src/styles/atlas.scss:36`, `client/src/styles/atlas.scss:91`, `client/src/styles/atlas.scss:98`, `client/src/styles/atlas.scss:133`, `client/src/styles/atlas.scss:159`, `client/src/styles/atlas.scss:160`, `client/src/styles/atlas.scss:240-242`, `client/src/styles/atlas.scss:527-532`, `client/src/styles/atlas.scss:560-561`, `client/src/styles/atlas.scss:746`
- **What happens:** L36 `.trow .tw`: the tree row now uses `.tcaret` (L697), since 2794b75. L91 `.chip .ic`: the only chips (AtlasWorkspace.jsx:1960-1961 'Pin: icon + name / the image') contain no icon. L98 `.saved`: the save state renders as `.savechip.ok` (L207-210), since 95507f1. L133 `.timebar .tnow em`: the .tnow button's text is a momentLabel() string (AtlasWorkspace.jsx:1305-1306), and the file's only <em>s are at 1189/1278. L159 `.pview .shead .sclose`: .sclose is a direct child of .sheet (PlayerView.jsx:303), styled by L416. L160 `.pview .simg`: replaced by `.shero` in dd7888c. L240-242 `.viewtoggle`: Map/List moved into Map ▾ `.apop-row` in a4e2980. L527-532 + L560-561 `.forge .fquick`, `.fquick button`, `.fbatches`, `.fquick .fguide`: the Forge's quick-action column, guide input and batch list were removed in 2c42802 ('no modes'), and cards now thread in `.flog` (L633). L746 `.atlas .labelson .rlabel`: `labelson` is on the .atlas root itself (AtlasWorkspace.jsx:885), never a descendant, so this never matches. It is also redundant, because labelsOn already reaches Regions as a prop (AtlasWorkspace.jsx:1053 → Regions.jsx:130 adds `.on`).
- **Why it matters:** Every selector matches something rendered.
- **Fix:** Delete atlas.scss L36, L91, L98, L133, L159, L160, L240-242, L527-532, L560-561 and L746.
- **Repro:** grep -rnw -- tw|saved|simg|viewtoggle|fquick|fbatches|fguide client/src e2e/*.mjs server --include=*.js --include=*.jsx --include=*.mjs → the only hits are atlas.scss definitions ('saved' also appears as a state value, AtlasWorkspace.jsx:36/131/881, mapped to class 'ok'). Structural matcher (scratch struct.mjs) reports these selectors as matching no JSX element in any ancestor chain.
- **Evidence:** scratch lanes/scss-dead/dead-pass1.txt and struct.txt; git log -S for each class gives the removal commits named above.
- **Re-proved:** I checked each selector. L36 `.trow .tw`: `git grep -nw tw` outside styles finds nothing, and the tree uses .tcaret (L697). git log -S'className="tw"' ends at 2794b75. L91 `.chip .ic`: the only `.chip` elements are AtlasWorkspace.jsx:1960-1961, which contain text only. L98 `.saved`: 'saved' appears only as a state value (AtlasWorkspace.jsx:36/131/881), mapped to class 'ok'. L133 `.timebar .tnow em`: .tnow (AtlasWorkspace.jsx:1305) holds momentLabel(), which returns a plain string (utils/moment.…
- **Also found as:** "atlas.scss has dead rules from superseded UI (old Forge quick rail, view toggle…" (client-dead); "Dead CSS for canvas and tree markup that no longer exists (.trow .tw, .viewtogg…" (canvas)

### D007 · The CSS rule '.atlas .labelson .rlabel' never matches anything

Dead code · low · effort xs · found by `outlines`

- **Where:** client/src/styles/atlas.scss:746
- **Files:** `client/src/styles/atlas.scss:746`, `client/src/pages/AtlasWorkspace.jsx:885`
- **What happens:** `labelson` sits on the `.atlas` root itself (AtlasWorkspace.jsx:885), so a descendant selector `.atlas .labelson .rlabel` matches 0 elements. I checked with document.querySelectorAll with labels on. The feature only works because Regions adds `.on` from the labelsOn prop.
- **Why it matters:** One mechanism for 'always show names'.
- **Fix:** Delete atlas.scss:746 (or change it to `.atlas.labelson .rlabel` and stop passing labelsOn into Regions; pick one).
- **Repro:** Map ▾ → 🏷 Always show names → `document.querySelectorAll('.atlas .labelson .rlabel').length` = 0, while `.rlabel.on` = 8/8. Script s15.mjs.
- **Evidence:** s15 output: matches .atlas .labelson .rlabel 0; labelsOn: rlabel.on count / total [8,8]
- **Re-proved:** atlas.scss:746 is `.atlas .labelson .rlabel{opacity:1}`. The only place that applies `labelson` is AtlasWorkspace.jsx:885, `<div className={`atlas${labelsOn ? ' labelson' : ''}...`}>`, which puts it on the .atlas root itself. No element with class 'atlas' is nested inside another (the other .atlas roots are in PlayerView.jsx:126/136/158 and AtlasWorkspace.jsx:877, none nested). So the descendant selector matches nothing. The other labelson rules (atlas.scss:607-617, 774) correctly use `.atlas:n…

### D008 · utils/moment.js: partyNextFrom has had no caller since the on-map 'went to' marker was removed; partyWhere is exported only for internal use; the header comment is attached to the wrong function

Dead code · low · effort xs · found by `client-dead` (+3 other lanes)

> **Second pass — see also:** Something from the chip is left: the partyTrail comment at share.js:229-230 still describes the removed chip and exit marker. e2e/player.mjs:97 is the other one, and P025 covers it. → **O028** in [WP-27](WP-27-tests-that-can-fail-and-docs-that-record-the-rul.md)

- **Where:** client/src/utils/moment.js:1-4,16,26-37
- **Files:** `client/src/utils/moment.js:26-37`, `client/src/utils/moment.js:16`, `client/src/utils/moment.js:1-4`, `client/src/utils/moment.js:55`
- **What happens:** partyNextFrom has had no caller since commit 4c1baa7, when the 'went to' trail marker became text in the Party reader. partyWhere lost its last external caller in 4a1db44, when the '⚑ The party is at …' chip was removed. It is now used only inside partyNeighbors. The file's opening comment ('A moment on the world clock, read the way a table reads it…') describes momentLabel at line 55 but sits above SESSION_COLORS. Nothing else from the chip is left: `.partychip` CSS and both JSX blocks are gone.
- **Why it matters:** No dead exports, and comments next to what they describe.
- **Fix:** Delete partyNextFrom. Drop `export` from partyWhere, or keep it private. Move lines 1-3 above momentLabel.
- **Repro:** grep -rnE '\bpartyNextFrom|\bpartyWhere' client/src e2e server/test → only moment.js:16,26,48. git log -S partyNextFrom → 4c1baa7 removed both call sites (AtlasWorkspace, PlayerView).
- **Re-proved:** `git grep -nE 'partyNextFrom|partyWhere|partychip'` across the whole repo (client, server, e2e, CSS, docs) finds only moment.js:16 (export partyWhere), :26 (export partyNextFrom) and :48 (partyWhere used inside partyNeighbors). There is no partychip CSS or JSX left. `git show 4c1baa7` removes both `next={partyNextFrom(...)}` call sites (AtlasWorkspace and PlayerView) and their imports. `git show 4a1db44` removes the last external partyWhere uses (the partychip blocks in both pages, plus the .pa…
- **Also found as:** "moment.js: partyNextFrom has had no caller since the trail's 'went to' was remo…" (docs-hygiene); "partyNextFrom is unused since the 'went to' marker left the map; moment.js's he…" (player-desktop); "partyNextFrom in utils/moment.js has had no callers since the trail moved into …" (time)

### D011 · Response fields the server computes and sends but no client reads

Dead code · low · effort s · found by `api-contract` (+4 other lanes)

- **Where:** GET /api/atlas/maps/:id, /api/share/:t/maps/:id, /api/atlas/nodes/:id, /worlds/:id/maps, /worlds/:id/trail, POST /api/forge/maps/:id/backdrop
- **Files:** `server/routes/atlas.js:315-322`, `server/routes/share.js:220-227`, `server/routes/atlas.js:265`, `server/routes/atlas.js:328`, `server/routes/atlas.js:302`, `server/routes/atlas.js:306`, `server/routes/atlas.js:312`, `server/routes/atlas.js:412`, `server/routes/atlas.js:420-421`, `server/routes/atlas.js:278-279`, `server/routes/forge.js:220`
- **What happens:** (1) The map-level `links` array, which costs an extra query per map load in both the atlas and share map routes, is never read. PlayerView and AtlasWorkspace only use node-detail links (grep 'data.links|view.links' finds nothing; AtlasWorkspace uses links only at 272/276 from getNode). (2) `ownerNodeId`: grep -rn 'owner' in client/src matches only comments. (3) `interiorView` and its LEFT JOIN maps im: 0 hits. (4) GET /api/atlas/nodes/:id's whole `node` object (plus the images join): the client only reads d.links, d.backlinks and d.facts (AtlasWorkspace.jsx:272,276). (5) `timeContext`: 0 hits for timeContext or time_context in client/src. (6) Trail steps' nodeId, x and y: the timebar reads start, interior, id, mapId and mapTitle (1255-1266), and partyNeighbors reads start and end. (7) `previousImageId`: 0 hits.
- **Why it matters:** Payloads carry only what the UI uses.
- **Fix:** Delete the links queries in atlas.js GET /maps and share.js GET /maps, and the ownerNodeId, interiorView (and its join), timeContext, trail nodeId/x/y and previousImageId fields. Slim GET /nodes/:id to {links, backlinks, facts} and drop the node/images SELECT.
- **Repro:** grep -rn "timeContext\|time_context\|interiorView\|previousImageId\|ownerNodeId" client/src → no matches
- **Evidence:** grep counts: timeContext 0, time_context 0, ownerNodeId 0, interiorView 0, previousImageId 0
- **Re-proved:** Checked the code, then GET-back from a live clone. (1) Map-level links: the atlas map (atlas.js:315-322) and share map (share.js:220-227) both return `links`. Live, the atlas map payload had 2 links and the share payload had the key. No client code reads data.links: PlayerView.jsx and AtlasWorkspace.jsx use links only from getNode (AtlasWorkspace.jsx:272,276; PlayerView detail.links:336-340), and nothing spreads or destructures data. (2) ownerNodeId is sent live in the map object and in the map…
- **Also found as:** "Both map endpoints compute and ship a `links` list that no client code reads" (server-dead); "Map payloads compute a `links` array no client reads" (postures-share); "Unused response fields and request params kept alive by extra joins" (server-dead); "Server runs joins and returns fields the client never reads (interiorView, uplo…" (schema-data)

### D013 · main.scss keeps ~155 lines styling removed features: admin migration buttons, the old 404 page, an unused spin keyframe

Dead code · low · effort xs · found by `scss-dead` (+1 other lane)

- **Where:** Minor detail: AdminPanel.jsx:83-95 does not have '8 identical inline style objects'. It has 4 identical th objects ({textAlign:'left',padding:'8px',borderBottom:'2px solid #eee'}, lines 83-86) and 4 identical td objects ({padding:'8px',borderBottom:'1px solid #eee'}, lines 92-95). The fix still applies: move both into `.admin-section th/td` rules.
- **Files:** `client/src/styles/main.scss:19-23`, `client/src/styles/main.scss:25`, `client/src/styles/main.scss:249-346`, `client/src/styles/main.scss:711-760`, `client/src/pages/AdminPanel.jsx:80-95`, `client/src/pages/NotFound.jsx:9-17`
- **What happens:** (a) L249-346 `.admin-actions`, `.admin-button` (+`.migration-button`, `.test-button`), `.migration-status`, `.migration-info`, `.migration-note` belong to the AdminPanel migration buttons removed in d7dd90e/4f3bf80. AdminPanel.jsx now has none of them, and its users table uses 8 identical inline style objects instead (AdminPanel.jsx:83-95). (b) L711-760 `.not-found-page`, `.not-found-container`, `.not-found-link` were added in a057b46 and orphaned the same day by ce51e24, which moved NotFound onto the shell (`.shell .voidstate`). (c) L19-23 `@keyframes spin` ('Shared animations') has no `animation: spin` anywhere. L25 '// Import component styles' is an orphan comment with nothing under it.
- **Why it matters:** No rules for markup that no longer exists.
- **Fix:** Delete main.scss L19-25 and L249-346 (keep .admin-panel/.admin-container/.admin-section/.env-status, which AdminPanel still uses). Delete L711-760. Move the AdminPanel table's inline th/td styles into a `.admin-section table` rule.
- **Repro:** for c in admin-actions admin-button migration-button test-button migration-status migration-info migration-note not-found-page not-found-container not-found-link; do grep -rnw -- "$c" client/src e2e/*.mjs server --include=*.js --include=*.jsx --include=*.mjs; done → the only hits are main.scss definitions. grep -rn "animation[^;]*\bspin\b" client/src → 0.
- **Evidence:** Babel className extraction (scratch lanes/scss-dead/jsxclasses.mjs + scssaudit.mjs) listed these as never produced by any className in client/src; git log -S confirms the removal commits.
- **Re-proved:** `git grep -nE "admin-actions|admin-button|migration-button|test-button|migration-status|migration-info|migration-note|not-found-page|not-found-container|not-found-link"` over all tracked files (client, server, e2e, docs) returns only the main.scss definitions (249, 256, 271, 281, 292, 317, 333, 712, 721, 747). `git grep -nE "\bspin\b" -- client server e2e` returns only main.scss:20 `@keyframes spin`. main.scss:25 '// Import component styles' has nothing under it. NotFound.jsx now renders `.shel… _(partly — the corrected location is used above)_
- **Also found as:** "main.scss carries ~150 lines of rules for removed admin buttons, the migration …" (client-dead)

### D014 · GET /maps/:mapId computes data the client never reads, including an extra links query on every map load; MapPlane's controlsOffset prop is never passed

Dead code · low · effort xs · found by `maps`

- **Where:** server/routes/atlas.js:315-322, 328, 332, 312; client/src/components/MapPlane.jsx:37, 248
- **Files:** `server/routes/atlas.js:315-322`, `server/routes/atlas.js:312`, `server/routes/atlas.js:328`, `server/routes/atlas.js:265`, `client/src/components/MapPlane.jsx:37`, `client/src/components/MapPlane.jsx:248`, `client/src/pages/AtlasWorkspace.jsx:29`
- **What happens:** GET /maps/:mapId runs a links query (atlas.js:316-322) and returns links[], map.ownerNodeId, backdrops[].imageId and node.interiorView. None of these are read anywhere in client/src. `grep -rn "ownerNodeId\|interiorView\|timeContext" client/src` → no hits. `data.links` is never read (the comment at AtlasWorkspace.jsx:29 is the only mention). GET /worlds/:id/maps also returns ownerNodeId, which MapTree doesn't use. MapPlane declares controlsOffset ('lift zoom buttons above the timebar'), but neither caller (AtlasWorkspace.jsx:1036, PlayerView.jsx:207) passes it: `grep -rn controlsOffset client/src` hits only MapPlane.jsx.
- **Why it matters:** Payloads carry only what callers use.
- **Fix:** Remove the links query and links/ownerNodeId/interiorView fields from GET /maps/:mapId, or keep imageId only if the picker's current-image marker needs it. Remove the controlsOffset prop and its style branch from MapPlane. Update the comment at AtlasWorkspace.jsx:29.
- **Repro:** grep -rn "ownerNodeId\|interiorView\|timeContext\|controlsOffset" client/src
- **Evidence:** grep output in this lane: ownerNodeId / interiorView / timeContext return nothing under client/src; controlsOffset only in components/MapPlane.jsx:37,248
- **Re-proved:** atlas.js:315-322 runs the links query, :328 returns map.ownerNodeId, :312 returns node.interiorView (it needs the extra LEFT JOIN maps im), :332 returns backdrops[].imageId, and :265 returns ownerNodeId in the tree list. A live GET /maps/257 on my clone returned top-level keys map, backdrops, placements, links, breadcrumb. `grep -rn "ownerNodeId\|interiorView\|timeContext\|controlsOffset\|imageId" client/src e2e` finds no reads of ownerNodeId, interiorView or timeContext. imageId appears only a…

### D015 · GET /maps/:mapId builds a links array the client never reads; link kind/time_context are never set or read

Dead code · low · effort xs · found by `inspector`

- **Where:** server/routes/atlas.js:315-322, 333; atlas.js:728-734, 413-415; schema.sql links table
- **Files:** `server/routes/atlas.js:315`, `server/routes/atlas.js:728`, `server/routes/atlas.js:415`, `client/src/pages/AtlasWorkspace.jsx:29`
- **What happens:** The map endpoint runs an extra query for links among the map's nodes and returns `links`, but no client code reads data.links. The comment at AtlasWorkspace.jsx:29 still lists it. links.kind (always 'reference') and links.time_context (always null) are accepted by POST /links and returned by GET /nodes/:id, but no UI sets or reads them. The schema comment promises 'reference or portal, optionally pinned to a moment in time'.
- **Why it matters:** No unused payload or columns, or the feature built.
- **Fix:** Delete the links query and field from GET /maps/:mapId and the comment at AtlasWorkspace.jsx:29. Drop kind/time_context from POST /links and the node response (keep the columns or drop them with the orphaned-table cleanup).
- **Repro:** grep -rn "data?\.links\|data\.links\|timeContext\|time_context" client/src → no reader (only the useState comment at line 29).
- **Evidence:** grep output: only AtlasWorkspace.jsx:29 comment mentions map-level links; timeContext appears only in server/routes/atlas.js
- **Re-proved:** server/routes/atlas.js:316-322 runs the extra links query, which maps to {id, from, to, kind, label, timeContext}, and :333 returns `placements, links, breadcrumb`. I grepped client/src for 'links': the only readers are d.links/d.backlinks from getNode (AtlasWorkspace.jsx:272,276) and detail.links from the share node endpoint (PlayerView.jsx:336-340). Nothing reads the map payload's links. The only mentions are the useState comments at AtlasWorkspace.jsx:29 and PlayerView.jsx:24. e2e/ and serve…

### D016 · Dead image-pipeline code: unused service methods, an unused route, response fields and folder columns nobody reads

Dead code · low · effort s · found by `images`

- **Where:** server/routes/imageFolders.js:46 (parentName), 50-52 (color, icon, childCount) and 31-32/35-36 (the parent/child self-joins). Keep line 53 imageCount and the image_count subquery at line 33: ImageManager.jsx:458,485 read them. Every other cited location is correct.
- **Files:** `client/src/services/imageServiceBase64.js:67-75`, `client/src/services/imageServiceBase64.js:17`, `client/src/services/imageServiceBase64.js:49-53`, `client/src/services/imageFolderService.js:79-97`, `server/routes/images.js:110-149`, `server/routes/images.js:35-40`, `server/routes/images.js:68`, `server/routes/images.js:92`, `server/routes/images.js:101`, `server/routes/imageFolders.js:31-32`, `server/routes/imageFolders.js:50-53`, `server/routes/imageFolders.js:72`, `server/config/schema.sql:52-53`
- **What happens:** No callers found for: imageServiceBase64.getImage (grep 'getImage(' finds only its definition), server GET /api/images/:id (no client, e2e or test caller), imageFolderService.getFolderPath (definition only), getImages' `tags` option and uploadImage's altText/tags parameters (callers pass '' '' or omit them: ImageManager.jsx:133, AtlasWorkspace.jsx:2088). Response fields hasMore, uploadedBy (with its users JOIN), folder childCount / parentName (with their self-JOIN) and color / icon are never read (grep over client/src finds no use). image_folders.color/icon are written with defaults '#4CAF50'/'📁' and never shown: the UI draws ▤. images.tags has no UI anywhere.
- **Why it matters:** Remove code that nothing calls.
- **Fix:** Delete getImage, getFolderPath and the GET /:id route. Drop the tags/altText params and the tags filter unless a caption UI is built (see the rename finding). Remove hasMore, uploadedBy and the users JOIN, and the child_count/parent_name joins. Drop color/icon from the folder routes (and the columns with ALTER TABLE … DROP COLUMN IF EXISTS in schema.sql).
- **Repro:** grep -rn "getImage(\|getFolderPath\|hasMore\|childCount\|parentName\|uploadedBy\|\.color\b\|\.icon\b" client/src → only the definitions in the service files.
- **Evidence:** grep output: '== getImage(' → only imageServiceBase64.js:68; '== getFolderPath' → only imageFolderService.js:79; '== /api/images/ id route callers' → none; '== hasMore' → none; color/icon/childCount/parentName/uploadedBy → none in client/src
- **Re-proved:** I searched client/src, e2e/*.mjs and server/test (not docs). getImage is only defined at imageServiceBase64.js:68, and the only request to /api/images/${id} with GET is that definition (line 70). The GET /:id route (images.js:110-149) has no client, e2e or test caller. getFolderPath has only its definition (imageFolderService.js:79). imageFolderService is used only by ImageManager.jsx:6,77,78,215,217,227. hasMore, uploadedBy / uploaded_by_username, childCount and child_count appear nowhere in c… _(partly — the corrected location is used above)_

### D017 · Share map endpoint: the per-moment branch for timeline-enabled worlds is only ever hit by tests

Dead code · low · effort s · found by `server-dead`

- **Where:** server/routes/share.js:149-158 and 176-186
- **Files:** `server/routes/share.js:130-186`, `server/test/share-live.test.js:43-66`, `e2e/dm.mjs:113`
- **What happens:** PlayerView makes a single map call and always passes windowed=true (PlayerView.jsx:52). With the timeline on, the server therefore always takes the windowed branch. The moment-resolved backdrop (lines 149-158) and the PRESENT-at-t placement filter with a non-null t run only for requests without window=1, which come from share-live.test.js (tests at lines 43-66) and e2e/dm.mjs:113. With the timeline off, the non-windowed query does run, but t is null. So the server keeps two implementations of the secrecy filter, and four secrecy tests guard the one players never receive.
- **Why it matters:** One code path for the payload players actually receive, tested directly.
- **Fix:** Either always use the windowed path (treat timeline-off as the envelope [null,null]) and delete the non-windowed backdrop and filter code, or leave it and move the four ?t= tests to ?window=1&t= assertions. Remove the dead branch once no test needs it.
- **Repro:** grep -n "shareService.getMap" client/src/pages/PlayerView.jsx -> one call, with windowed=true.
- **Re-proved:** The only client caller of the share map endpoint is PlayerView.jsx:52, `shareService.getMap(token, mapId || w.rootMapId, viewTRef.current, true)`. shareService.js:11-12 adds window=1 when windowed is true, and there are no other shareService or /api/share callers in client/src. In share.js, windowed = window==='1' && timeline_enabled (line 134). The moment-resolved backdrop block (149-158) requires window !== '1', and the PRESENT(2) query (176-186) runs only when windowed is false. That covers …

### D018 · The cors() middleware does nothing in production

Dead code · low · effort xs · found by `api-contract`

- **Where:** server/server.js:82-87
- **Files:** `server/server.js:82-87`
- **What happens:** No response carries Access-Control-Allow-Origin or Vary: Origin, whatever the Origin (tested an evil origin and the app's own). An OPTIONS preflight to /api/atlas/templates falls through to the auth middleware and returns 401 'Access token required' instead of 204. This matches FRONTEND_URL being unset: cors 2.8.5 calls next() without doing anything when origin is undefined. The app is same-origin, so nothing breaks, but the config suggests a policy that isn't in effect.
- **Why it matters:** Config that is either real or absent.
- **Fix:** Delete the cors middleware and dependency, since the SPA and API share an origin and Spellforge only frames /p. Otherwise set an explicit origin.
- **Repro:** curl -X OPTIONS -H 'Origin: https://timeline-map-production.up.railway.app' -H 'Access-Control-Request-Method: PATCH' https://timeline-map-production.up.railway.app/api/atlas/templates → HTTP 401, no access-control headers
- **Evidence:** curl output: 'HTTP/2 401' with no access-control-* headers for either origin
- **Re-proved:** server/server.js:82-87 sets `origin: NODE_ENV==='production' ? process.env.FRONTEND_URL : 'http://localhost:5173'`. The installed cors 2.8.5 (server/node_modules/cors/lib/index.js, middlewareWrapper) calls next() without setting any header when corsOptions.origin is falsy. Live results: OPTIONS /api/atlas/templates with Origin set to the app's own URL and Access-Control-Request-Method PATCH returned HTTP/2 401 with only `vary: Accept-Encoding`. The same request with Origin https://evil.example …

### D019 · Exports never imported anywhere

Dead code · low · effort xs · found by `server-dead` (+1 other lane)

- **Where:** server/voice/elevenlabs.js:6 (definition) and :59 (export), not :7.
- **Files:** `server/forge/contract.js:590`, `server/voice/providers.js:121`, `server/voice/elevenlabs.js:7`, `server/forge/mind.js:214`, `server/utils/token.js:34`, `server/middleware/auth.js:73`, `server/config/migrate.js:53`
- **What happens:** These are exported but nothing imports them, so each is used only inside its own file or not at all: contract.CATS, providers.provider, elevenlabs.enabled (defined and exported, never called anywhere), mind.digest, token.TOKEN_TTL, middleware/auth.requireRole, and migrate.js's module.exports = runMigration (it only runs via require.main).
- **Why it matters:** Exports reflect the module's public surface.
- **Fix:** Remove these names from each module.exports, and delete elevenlabs.enabled entirely.
- **Repro:** grep -rn "CATS\|provider()\|eleven\.enabled\|digest\|TOKEN_TTL\|requireRole\|runMigration" server client/src e2e (excluding node_modules) -> hits only inside the defining files.
- **Re-proved:** I checked each exported name and found none imported outside its own file. contract.js:590 exports CATS, but its two importers take only { validateBatch, applyBatch, CAPS } (mind.js:8) and { discardBatch, allowAsks, paintAndStore } (routes/forge.js:13); the client's CATS comes from client/src/utils/categories.js. providers.js:121 exports provider, and its only importer, routes/voice.js:12, never calls voice.provider. elevenlabs.js exports enabled; its only importer, providers.js:7, calls eleven… _(partly — the corrected location is used above)_
- **Also found as:** "Unused exports and response fields in the Forge/voice modules" (forge-voice)

### D020 · Props, fields and exports that nothing reads (MapPlane controlsOffset, Regions item kind/node, STYLE_KEYS import, always-true guards, file-local exports)

Dead code · low · effort xs · found by `client-dead` (+1 other lane)

- **Where:** shareService.getMap and its `windowed` param are at client/src/services/shareService.js:11-12. The file is only 18 lines long, so the cited :108-109 does not exist. Everything else is cited correctly.
- **Files:** `client/src/components/MapPlane.jsx:37`, `client/src/components/MapPlane.jsx:248`, `client/src/pages/AtlasWorkspace.jsx:1049`, `client/src/pages/PlayerView.jsx:220`, `client/src/pages/AtlasWorkspace.jsx:12`, `client/src/pages/AtlasWorkspace.jsx:2029`, `client/src/pages/AtlasWorkspace.jsx:2037`, `client/src/pages/AtlasWorkspace.jsx:2135`, `client/src/services/shareService.js:108-109`, `client/src/pages/PlayerView.jsx:52`, `client/src/components/MapPlane.jsx:25`, `client/src/components/Regions.jsx:24`, `client/src/utils/geometry.js:35`, `client/src/utils/moment.js:5`
- **What happens:** (1) MapPlane `controlsOffset` ('lift zoom buttons above the timebar'): no caller since bced565 moved the timebar into its own row. (2) Both Regions callers pass item fields `kind` and `node`, and Regions.jsx reads neither (it reads id, pts, style, x, y, title, secret, hasInterior, cls). (3) AtlasWorkspace imports STYLE_KEYS and never uses it. (4) Inspector's `{onOutline && …}` guards are always true, because the only caller always passes onOutline. (5) NodePicker's default `title = 'Link to…'` is never used, since all three callers pass a title. (6) shareService.getMap's `windowed` argument is always true (its one caller passes `true`). (7) PLANE_W, OUTLINE_PRESETS, MAX_CORNERS and SESSION_COLORS are exported but only used in their own file.
- **Why it matters:** Component APIs should carry only what they use.
- **Fix:** Delete controlsOffset and its style branch. Drop kind/node from both items maps. Remove STYLE_KEYS from the import. Remove the two onOutline guards and the NodePicker default. Remove the `windowed` param (always send window=1). Un-export the file-local constants.
- **Repro:** grep -rn controlsOffset client/src (declaration + use only). grep -nE 'it\.(kind|node)' client/src/components/Regions.jsx (none). node script scratchpad/audit/lanes/client-dead/imports.mjs → 'AtlasWorkspace.jsx unused import STYLE_KEYS'. grep -rnE '\b(PLANE_W|OUTLINE_PRESETS|MAX_CORNERS|SESSION_COLORS)\b' client/src e2e server/test → own file only.
- **Re-proved:** Every sub-claim checks out; only the shareService line numbers are wrong. (1) `grep -rn controlsOffset client/src e2e server` finds only MapPlane.jsx:37 (the declaration) and :248 (its use). Neither MapPlane caller (PlayerView:207, AtlasWorkspace:1036) passes it or spreads props. (2) `grep -nE '\.kind|\.node|kind|node' Regions.jsx` returns nothing. Items are spread into `ordered`, but only id/pts/style/cls/title/secret/hasInterior/x/y are read. Both callers (AtlasWorkspace:1049, PlayerView:220)… _(partly — the corrected location is used above)_
- **Also found as:** "Dead code in the canvas: unused STYLE_KEYS import and a MapPlane prop nobody pa…" (canvas)

### D021 · The share map endpoint computes map links the Player View never reads; the non-windowed timed-backdrop branch is reached only by tests

Dead code · low · effort s · found by `player-desktop`

- **Where:** The non-windowed timed-backdrop branch (share.js:149-158) is reached by more than the ?t= tests at share-live.test.js:52-63. It is also reached by share-live.test.js:44-49, which calls GET /maps/root with no ?t= and asserts that the timed backdrop is active at canon, and by e2e/dm.mjs:113, a non-windowed fetch that ignores the backdrop. Deleting the branch would break the 44-49 test as well.
- **Files:** `server/routes/share.js:149-158`, `server/routes/share.js:220-227`, `client/src/pages/PlayerView.jsx:24`, `server/test/share-live.test.js:52-63`
- **What happens:** Every Player View poll runs the links query (share.js:220-227) and returns `links`, but PlayerView never reads data.links; its only mention is the state comment at PlayerView.jsx:24. The client always sends window=1 (PlayerView.jsx:52, shareService.getMap), so the block that resolves a timed backdrop for timeline-on, non-windowed requests (share.js:149-158) runs only for the ?t= calls in server/test/share-live.test.js:52-63.
- **Why it matters:** Either draw the links for players or stop computing them. Keep the non-windowed timed path only if it is deliberately kept for tests or external callers, and say so.
- **Fix:** Delete the links query and field from GET /:token/maps/:mapId, or render them. Either delete share.js:149-158 and the ?t= map tests, or comment that the non-windowed ?t= mode exists for the API tests.
- **Repro:** grep -n "links" client/src/pages/PlayerView.jsx → no read of data.links; grep -rn "window" client/src/services/shareService.js → always windowed from PlayerView.
- **Evidence:** The GET /maps/179?window=1 payload includes links:[{id:166,…}], and no client code consumes it
- **Re-proved:** Links: on my clone (world 109), a live GET /api/share/<tok>/maps/353?window=1 returned keys map, backdrops, partyTrail, placements, links, breadcrumb and spotlight, with links=[{id:291,…}]. In PlayerView.jsx the word 'links' appears only in the state comment at line 24 and in detail.links/backlinks (the node sheet, lines 336-340), never as data.links. MapPlane, Regions and PartyTrail do not read it either. The only other caller, e2e/dm.mjs:113, reads only .placements. Backdrop branch: share.js:… _(partly — the corrected location is used above)_

### D022 · Routes with no caller: GET /api/worlds/:id and GET /api/images/:id; world CRUD split across two routers

Dead code · low · effort s · found by `server-dead` (+1 other lane)

- **Where:** The reference count should read 'atlas ×37' (not 38). Everything else is as stated: worlds.js:58-102, images.js:110-150, server.js:106-109, worldService.js:17-24, imageServiceBase64.js:67-74.
- **Files:** `server/routes/worlds.js:58-102`, `server/routes/images.js:110-150`, `server/server.js:106-109`, `client/src/services/worldService.js:17-24`, `client/src/services/imageServiceBase64.js:67-74`
- **What happens:** GET /api/worlds/:id is served by worlds.js but its only client wrapper, worldService.getWorld, is never called; it was superseded by GET /api/atlas/worlds/:id. GET /api/images/:id is called only by imageServiceBase64.getImage, which is never called. /health has no caller in the repo and railway.toml sets no healthcheckPath, so it is API-only. World operations are split: list, create and delete live in /api/worlds, while read, rename/description (PATCH), clone and templates live in /api/atlas/worlds, and Dashboard calls both. CLAUDE.md calls worlds.js 'world CRUD only'. For reference, every other route in server/routes/*.js has a live client caller: auth ×8, setup ×2, admin ×2, images GET/PUT/DELETE, images-base64 upload, image-folders ×4, atlas ×38, share ×5, forge ×10, voice ×7. /api/images-base64/serve is reached only through stored file_path URLs.
- **Why it matters:** Every route has a caller, and one resource lives in one router.
- **Fix:** Delete GET /worlds/:id (worlds.js:58-102) and GET /images/:id (images.js:110-150), plus worldService.getWorld and imageServiceBase64.getImage. Either add healthcheckPath = "/health" to railway.toml [deploy] or drop the route. Consider moving POST/GET/DELETE /api/worlds into atlas.js (or all world routes into worlds.js) so worlds live in one place.
- **Repro:** grep -rnE "worldService\.getWorld\(|\.getImage\(" client/src e2e server/test -> no hits. grep -rn "/health\|healthcheck" . (excluding node_modules) -> only server/server.js:107.
- **Re-proved:** Checked GET /api/worlds/:id first. The route is at worlds.js:58-102, and its only wrapper, worldService.getWorld (worldService.js:17-24), has no caller. Every `getWorld(` call in client/src goes to atlasService, forgeService or shareService. worldService is used only by App.jsx:48 and by Dashboard.jsx (getWorlds, createWorld, deleteWorld, current world, last location). GET /api/images/:id (images.js:110-150) has imageServiceBase64.getImage (67-74) as its only wrapper, and `getImage(` matches on… _(partly — the corrected location is used above)_
- **Also found as:** "GET /api/worlds/:id and GET /api/images/:id have no callers" (api-contract)

### O003 · Leftovers of the removed Forge quick-action rail: CLAUDE.md '📜 Build from the bible', a 'fill this out' hint, dead .fquick/.fguide/.fbatches CSS

Obsolete · low · effort xs · found by `forge-voice` (+1 other lane)

- **Where:** CLAUDE.md:168; AtlasWorkspace.jsx:2345; atlas.scss:527-532, 560-561
- **Files:** `CLAUDE.md:168`, `client/src/pages/AtlasWorkspace.jsx:2345`, `client/src/styles/atlas.scss:527`, `client/src/styles/atlas.scss:532`, `client/src/styles/atlas.scss:560`
- **What happens:** Commit 2c42802 ('no modes') deleted the quick-action rail (📜 Build from the bible, ◎ Fill out its interior, ✚ Fill out this map) and the guide field. CLAUDE.md:168 still says '"📜 Build from the bible" constructs the world from it'. The Creation size hint 'How much a “fill this out” makes at once.' refers to buttons that no longer exist. The CSS for .fquick, .fquick .fguide and .fbatches remains, while grep -rn 'fquick\|fguide\|fbatches' client/src --include=*.jsx finds no users.
- **Why it matters:** Docs and hints describe the one-composer design, and the rail's CSS is gone.
- **Fix:** CLAUDE.md:168: replace with 'ask the mind to build from the bible in chat'. Reword the Creation size hint to 'How many new nodes a build request ("fill out this map") aims for'. Delete atlas.scss lines 527-532 (.fquick), 532 (.fbatches) and 560-561 (.fquick .fguide).
- **Repro:** git show 2c42802 -- client/src/pages/AtlasWorkspace.jsx | grep 'Build from the bible'; grep -rn 'Build from the bible\|📜' client/src (only an unrelated emoji at AtlasWorkspace.jsx:1108).
- **Evidence:** grep outputs quoted above
- **Re-proved:** `git show 2c42802` ('The Forge becomes one conversation: no modes') removes `<div className="fquick">`, '📜 Build from the bible', `<input className="fguide"`, '◎ Fill out its interior', '✚ Fill out this map' and `<div className="fbatches">`. CLAUDE.md:168 still says '"📜 Build from the bible" constructs the world from it'. AtlasWorkspace.jsx:2345 still reads 'How much a “fill this out” makes at once.' grep -rn 'fquick|fguide|fbatches' over client/src, e2e and server finds only atlas.scss:527 (…
- **Also found as:** "CLAUDE.md still describes a '📜 Build from the bible' button that the Forge pan…" (client-dead)

### O005 · EraScrub's non-live (debounced) mode is dead because both callers pass `live`, and its header comment describes that dead mode

Obsolete · low · effort xs · found by `client-dead` (+3 other lanes)

- **Where:** client/src/components/EraScrub.jsx:4-8,29-33,48-55,70-71
- **Files:** `client/src/components/EraScrub.jsx:4-7`, `client/src/components/EraScrub.jsx:29-33`, `client/src/components/EraScrub.jsx:52-54`, `client/src/components/EraScrub.jsx:70-71`, `client/src/pages/PlayerView.jsx:292`, `client/src/pages/AtlasWorkspace.jsx:1330`
- **What happens:** The header says 'the commit only fires when the drag ends', but both callers pass `live`, so every drag step commits right away. PlayerView became live in c28e28f (windowed fetch). That leaves the debRef timer, the 200 ms debounce in move(), the onPointerUp/onKeyUp commit handlers and the 'non-live mode debounce-commits…' comment unreachable.
- **Why it matters:** One code path, and a header comment that matches it.
- **Fix:** Drop the `live` prop and the debounce machinery (debRef, the setTimeout in move, the onPointerUp/onKeyUp handlers). Rewrite the header as 'commits on every step; the parent filters locally'.
- **Repro:** grep -rn '<EraScrub' -A2 client/src → both have `live`.
- **Re-proved:** `grep -rn EraScrub` gives exactly two callers, and both pass `live`: PlayerView.jsx:292 and AtlasWorkspace.jsx:1329-1330 (`live` is on 1330). In EraScrub.jsx, line 6 of the header says 'the commit only fires when the drag ends'. Lines 29-33 are the debounce comment, debRef and its cleanup. Lines 52-54 hold the non-live setTimeout branch in move(). Lines 70-71 are the onPointerUp/onKeyUp handlers, which are guarded by `!live`. With live always true, all of that is unreachable. `git show c28e28f`…
- **Also found as:** "EraScrub's non-live mode (debounce, commit on release) is dead and its header c…" (player-desktop); "EraScrub's non-live mode (debounce, pointer-up and key-up commits) is unreachab…" (time); "EraScrub's non-live mode can't run: both callers pass `live`, and the header co…" (mobile)

### O006 · Left over since outlined places lost their pin: a 'hov' pin class that can never apply, and drag code that moves outlines

Obsolete · low · effort xs · found by `canvas` (+2 other lanes)

- **Where:** client/src/pages/AtlasWorkspace.jsx:34, 663-668, 676, 1063; client/src/styles/atlas.scss:773-775
- **Files:** `client/src/pages/AtlasWorkspace.jsx:34`, `client/src/pages/AtlasWorkspace.jsx:663-668`, `client/src/pages/AtlasWorkspace.jsx:676`, `client/src/pages/AtlasWorkspace.jsx:1063`, `client/src/styles/atlas.scss:773-775`
- **What happens:** 262da55 lit a pin's label when its region was hovered (`hovId === p.id ? 'hov'`) and let an outline ride along when its pin was dragged. ebe92f9 stopped drawing pins for outlined placements (`filter(p => !p.shape || p.node.category === 'party')`), and Regions skips party placements. So a rendered pin never has a hovered region, and only party pins, whose shapes are never drawn, can carry a shape into onDragUp. The hovId comment at :34 ('its pin shows its name') and `.pin.hov` in atlas.scss:773-775 are unreachable. The effect for users: an outlined place can no longer be moved at all (pressing the region pans), only redrawn.
- **Why it matters:** No unreachable branches. If moving an outlined place is wanted, a way to do it.
- **Fix:** Delete `${hovId === p.id ? 'hov' : ''}` at :1063, the atlas.scss:773-775 rule, the `shape` handling in onPinDown/onDragUp, and fix the :34 comment. If moving outlines matters, add 'Move outline' to the inspector or context menu, reusing the translate math before deleting it (outline lane).
- **Repro:** Code reading: AtlasWorkspace.jsx:1048 (regions exclude party) and :1061 (pins exclude shaped non-party).
- **Evidence:** git log -S"hovId === p.id ? 'hov'" → 262da55; git show ebe92f9 (pins filter)
- **Re-proved:** Regions only receives placements that have a shape and are not party (AtlasWorkspace.jsx:1048). Pins render only when `!p.shape || category === 'party'` (:1061). setHovId is only ever passed as Regions' onHover (:1053), and Regions sets it only from polygon pointerenter and pointerleave (Regions.jsx:122). So `hovId === p.id ? 'hov'` at :1063 can't match any rendered pin, and `.pin.hov` at atlas.scss:773-775 is unreachable. hovId itself is still used, for the region and label hover in Regions.js…
- **Also found as:** "Pin 'hov' class and the `.pin.hov` CSS can never apply: region hovers only ever…" (client-dead); "Leftover pin-hover code from before outlined places dropped their pin" (outlines)

### O007 · Declarations in atlas.scss that are always overridden: inline grid columns, doubled .tlcfg/.sheet/.fsend blocks, duplicate .apop top

Obsolete · low · effort xs · found by `scss-dead` (+1 other lane)

- **Where:** client/src/styles/atlas.scss:29, :153-157, :178, :277-278, :344, :480, :543
- **Files:** `client/src/styles/atlas.scss:29`, `client/src/styles/atlas.scss:277-278`, `client/src/pages/AtlasWorkspace.jsx:1003-1007`, `client/src/styles/atlas.scss:178`, `client/src/styles/atlas.scss:385`, `client/src/styles/atlas.scss:153`, `client/src/styles/atlas.scss:157`, `client/src/styles/atlas.scss:415`, `client/src/styles/atlas.scss:422`, `client/src/styles/atlas.scss:543`, `client/src/styles/atlas.scss:641`, `client/src/styles/atlas.scss:344`, `client/src/styles/atlas.scss:282`, `client/src/styles/atlas.scss:480`, `client/src/styles/atlas.scss:467`
- **What happens:** L29 `.main{grid-template-columns:230px 1fr 310px}` and L277-278 `.main.m-view/.m-player{grid-template-columns:…}` never apply, because AtlasWorkspace.jsx:1003-1007 sets gridTemplateColumns inline for all three modes. The `m-view`/`m-player` classes feed nothing else; only `m-edit` is still used, at L360. `.tlcfg` is declared twice, and width:250px (L178) loses to 320px (L385); `left:auto` is a no-op. The Player View sheet is styled twice: L153 padding:12px 14px loses to L415 padding:0, and L157 `.shead h3{font-size:15px}` loses to L422 (24px Georgia). `.forge .fsend` border-top at L543 is cancelled by L641 `border-top:0`. L344 `.helpwrap .apop{top:calc(100% + 6px)}` duplicates L282 exactly, and its comment ('shares the stage's right edge with nothing above the zoom controls') doesn't describe the rule. L480 `.pin.ipin.open2{border:none}` is redundant, because L467 `.pin.ipin{border:none}` already beats L80 `.pin.open2` by source order.
- **Why it matters:** One live declaration per property, and a single block per component.
- **Fix:** Remove grid-template-columns from L29 and delete L277-278 (keep the m-${mode} class for L360 or rename it to m-edit only). Merge L178-183 with L385 into one .tlcfg block (width:320px) and drop left:auto. In the L149-165 Player View block, delete padding from L153, font-size from L157, and L159/L160 (see the dead-selector finding). Delete the border-top on L543 and delete L641. Delete L344 and L480.
- **Repro:** node scratch lanes/scss-dead/scssaudit.mjs, then the duplicate pass (group compiled rules by selector) prints: `.atlas .tlcfg` L178 width:250px => L385 width:320px; `.atlas.pview .sheet` L153 padding => L415 padding:0; `.atlas .forge .fsend` L543 border-top => L641 border-top:0. The inline style is at AtlasWorkspace.jsx:1004-1007.
- **Evidence:** compiled with sass + postcss, source-mapped to SCSS lines (scratch scssrules.json).
- **Re-proved:** L29 `.main{…grid-template-columns:230px 1fr 310px}` and L277-278 m-view/m-player: AtlasWorkspace.jsx:1003-1007 sets gridTemplateColumns inline for all three modes. The only other `.main` is PlayerView.jsx:185, which L150 `&.pview .main{display:flex}` turns into flex. `git grep 'm-view\|m-player'` finds only atlas.scss:277-278, and only m-edit is used (L360). .tlcfg: L178 width:250px and L385 width:320px are both `.atlas .tlcfg`, so the later one wins. The single element (AtlasWorkspace.jsx:1780…
- **Also found as:** "Posture grid CSS rules are dead: an inline style always overrides them" (postures-share)

### O008 · Leftover native-<audio> rules styling elements AudioClip now hides

Obsolete · low · effort xs · found by `scss-dead` (+1 other lane)

- **Where:** client/src/styles/atlas.scss:651-658, :677
- **Files:** `client/src/styles/atlas.scss:652`, `client/src/styles/atlas.scss:656`, `client/src/styles/atlas.scss:658`, `client/src/styles/atlas.scss:664-665`, `client/src/styles/atlas.scss:677`, `client/src/components/AudioClip.jsx:30-31`
- **What happens:** Since 680548e (2026-09-24) every player is AudioClip, whose own <audio> is display:none (atlas.scss:665). Yet L652 `.vrow audio{height:30px;flex:1;min-width:0}` and L658 `.pview .svoice audio{width:100%;height:34px}` still style that hidden element. L656 `.rvoice,.ramb{width:100%;height:32px;margin:8px 0;display:block}` was written for bare <audio> tags. Its height is patched back by L677 `.rvoice,.ramb{height:auto}`, and its display/margin lose to `.atlas .aclip` (L664, same specificity, later). Only width:100% still does anything.
- **Why it matters:** Rules describe the current component.
- **Fix:** Delete the `audio{…}` line in L652, the `audio{…}` in L658 and L677. Reduce L656 to `.atlas .rvoice,.atlas .ramb{width:100%}`, or fold it into `.aclip` usage.
- **Repro:** grep -rn "<audio" client/src → AudioClip.jsx:31 (hidden) and PlayerView.jsx:182 (no controls, not rendered). No visible <audio> remains for L652/L656/L658 to size.
- **Evidence:** git log -S'.atlas .rvoice,.atlas .ramb{height:auto}' → 680548e.
- **Re-proved:** `git grep '<audio\|new Audio'` finds only AudioClip.jsx:31, which is hidden by atlas.scss:665 `.aclip audio{display:none}`, and PlayerView.jsx:182, which has no controls attribute and sits in the top bar, not in .vrow or .svoice. .vrow (AtlasWorkspace.jsx:1470, 1919) and .svoice (PlayerView.jsx:316) contain only <AudioClip>. So L652 `.vrow audio{height…flex…}` and L658 `.svoice audio{width…height}` size the hidden element, and neither sets display. L656 `.atlas .rvoice,.atlas .ramb{width:100%;h…
- **Also found as:** "Audio CSS left over from native <audio> controls" (forge-voice)

### O009 · Obsolete overlay-era leftovers: a section comment for removed markers and MapPlane's never-passed controlsOffset prop

Obsolete · low · effort xs · found by `scss-dead`

- **Where:** client/src/styles/atlas.scss:689 · client/src/components/MapPlane.jsx:37, :248
- **Files:** `client/src/styles/atlas.scss:689`, `client/src/components/MapPlane.jsx:37`, `client/src/components/MapPlane.jsx:248`
- **What happens:** atlas.scss:689 heads a section '// ---- the trail crosses maps: an exit marker on the last print, a chip saying where they are ----'. Both `.fexit` and `.partychip` are gone: 4a1db44 removed the partychip CSS on 2026-09-25, and fexit has no markup. Only `.rtrail` (the reader's From / Then-on-to links) follows. MapPlane.jsx:37 declares `controlsOffset = 0, // lift zoom buttons above the timebar when it's shown` and applies it at :248, but no caller passes it. It lost its last caller in bced565, when the timebar became its own row under the map (atlas.scss:120 comment: 'never on top of it').
- **Why it matters:** Comments and props describe current behaviour.
- **Fix:** Rewrite atlas.scss:689 as '// ---- the Party's reader: From … / Then on to … links ----'. Remove the controlsOffset param and the style prop from MapPlane.jsx:37/:248.
- **Repro:** grep -rn controlsOffset --include=*.js --include=*.jsx --include=*.mjs . (excluding node_modules) → only MapPlane.jsx:37 and :248. git log -S'controlsOffset' -- client/src → bced565 last touched a caller. git show 029eab9 shows the .fexit/.partychip rules the comment was written for.
- **Re-proved:** The comment at atlas.scss:689 is word for word as quoted. Only .atlas .rtrail follows it. Searching the whole repo (js/jsx/mjs/scss/css, excluding node_modules and dist) for 'fexit|partychip' returns nothing, so there is neither markup nor CSS. git log -S'partychip' shows 4a1db44 ('The party is at chip is gone', Fri Sep 25 2026) removing it, and 029eab9 is where both rules were added. The controlsOffset search finds only MapPlane.jsx:37 (param) and :248 (style). The two MapPlane callers (AtlasW…

### O022 · Player View sheet CSS has leftovers: an unused .simg, a never-matching .shead .sclose, rules overridden later, and a comment about a removed chip

Obsolete · low · effort xs · found by `mobile`

- **Where:** Supporting cite is PartyTrail.jsx:8 (header comment), not :10-12. The atlas.scss locations 153-160, 415-422, 657-659 and 689 are correct.
- **Files:** `client/src/styles/atlas.scss:153-160`, `client/src/styles/atlas.scss:415-422`, `client/src/styles/atlas.scss:657-659`, `client/src/styles/atlas.scss:689`
- **What happens:** `.pview .simg` (line 160): grep -rn 'simg' client/src/pages client/src/components finds 0 uses. `.pview .shead .sclose` (159) never matches, because PlayerView.jsx:303 renders .sclose as a direct child of .sheet, not inside .shead. The sheet padding at 153-155 and `.shead h3{font-size:15px}` (157) are overridden by the later block at 415-422 (padding:0, 24px). `.svoice audio{width:100%;height:34px}` (657-658) styles an element AudioClip hides (`.aclip audio{display:none}`). The comment at 689, 'an exit marker on the last print, a chip saying where they are', describes the exit marker and the '⚑ The party is at…' chip, both gone (CLAUDE.md: chip removed 2026-09-25; PartyTrail.jsx:10-12 says the next stop is told in text).
- **Why it matters:** One rule per property, and comments that match the UI.
- **Fix:** Delete .simg and `.shead .sclose`. Fold 153-158 into the 415 block. Drop the `.svoice audio` rule. Reword the 689 comment to 'the Party's sheet links where they came from and went next'.
- **Repro:** grep -rn 'simg\|shead .sclose' client/src; compare atlas.scss:153-160 with 415-422.
- **Re-proved:** Every CSS claim holds. `simg` appears only in atlas.scss:160, with 0 hits in client/src JSX, e2e or server. The only rendered .sclose is PlayerView.jsx:303, a direct child of .sheet and not inside .shead (306), so `.pview .shead .sclose` (159) never matches. The padding at 153-155 is overridden by `padding:0` at 415, and the 15px font-size at 157 by 24px at 422 (margin/flex at 157 and position etc. at 153-155 still apply). The only child of .svoice (316-320) is AudioClip, which renders <audio> … _(partly — the corrected location is used above)_

