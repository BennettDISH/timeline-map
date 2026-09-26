# WP-01 · Close the leaks in the share API and image ids

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Stop the public share API from giving players nodes they should not see, and stop any account from pointing its maps or nodes at another account's images. Close the smaller holes on the same public and auth edges.

**Notes:** Do api-contract-01 first. The node endpoint must apply the same walkUp, allowed-time and visibility rules as the map endpoint, and prune links to hidden ends. Add share-live tests for a future-only node id and a DM-branch node id, then run `node --test server/test/share-live.test.js` and e2e/player.mjs. images-01 needs one ownership check on image_id in three PATCH handlers. api-contract-06 belongs with the world PATCH invariant that CLAUDE.md promises: today a null canon turns off all time secrecy. For docs-hygiene-19, either keep the bug-tracker key out of the /p/ bundle or correct the comment. Ask Bennett which.

## Checklist

- [x] **B010** · high · m · Share node endpoint serves future, DM-placed, hidden-branch and unplaced nodes, and lists them as links — done 2a657dc
- [x] **B011** · high · s · Any image id, from any world or account, is accepted as node art, map backdrop or timed backdrop, and its URL comes back — done 2a657dc
- [x] **B023** · medium · xs · Forge panel looks up ask titles across all worlds; ask ids are not world-checked until Allow — done 2a657dc (names resolve only inside the world; Allow already re-checks ids)
- [x] **B049** · medium · xs · Guest sign-in has no rate limit of its own and can drain Waypoint's app-wide 500/hour guest quota — done 2a657dc
- [x] **B071** · low · s · Windowed share payload gives players exact times inside hidden stretches and the map's full focus window — done 2a657dc
- [x] **B076** · low · s · World PATCH lets a null or non-integer timeline through, and a null canon turns off all player time secrecy — done 2a657dc
- [x] **B081** · low · xs · Malformed node ids on the public share API return 500 instead of 404 — done 2a657dc
- [x] **C037** · low · xs · main.jsx says players never get the bug-tracker API key, but the key ships in the bundle /p/ loads — done 7ae8390 (the widget is injected server-side on DM pages only; the key never ships in the bundle)
- [x] **P083** · low · xs · Player View image loads count against the same rate-limit bucket as the DM's world, image and auth calls — done 2a657dc

## Items

### B010 · Share node endpoint serves future, DM-placed, hidden-branch and unplaced nodes, and lists them as links

Broken · high · effort m · found by `api-contract` (+4 other lanes)

- **Where:** Player View › tap any pin › Threads; server/routes/share.js:297-333
- **Files:** `server/routes/share.js:302-306`, `server/routes/share.js:317-322`, `client/src/pages/PlayerView.jsx:336-345`, `client/src/pages/AtlasWorkspace.jsx:763`, `server/test/share-live.test.js:75-95`
- **What happens:** GET /api/share/:token/nodes/:id only checks n.visibility != 'dm'. It never checks that the node is placed anywhere the player can reach at an allowed moment. The link queries prune only dm-visibility nodes. Public fixture token (canon 50): /nodes/101 returns 200 {title:'Future Thing', body:'starts 80'}, /nodes/103 returns 200 'Inner Loot' / 'inside a hidden branch', and /nodes/99 returns 200 'Ghost Spot' (DM-only placement). Their /locate calls correctly 404. In my world 44 (canon 37), /api/share/NBXCV-FMo_xIkMhCPOW6aeiY/nodes/423 (Old Gate) returns links to 440 'Future Secret F' (starts at 39), 441 'Ghost G' (DM-only placement), 442 'Vault Hoard H' (inside the DM-only Drowned Vault; its map 149 correctly 404s) and 443 'Unplaced U'. Each /nodes/44x returns 200 with the full body, voiceUrl, imageUrl and interiorMapId. In the UI, a player taps a visible node, sees these titles under 'Threads', and taps one to read its sheet. Node ids are sequential, so the endpoint can also be enumerated. The DM's Player preview filters links the same wrong way (AtlasWorkspace.jsx:763), so the preview does not show the leak either.
- **Why it matters:** CLAUDE.md: 'out-of-time placements never leave the DB… deep links into hidden/future branches 404 via walkUp'. A node, and any link to it, should be readable only when the node is reachable, meaning it has a non-dm placement alive inside the allowed envelope on a map that passes walkUp, or it owns an interior that passes walkUp.
- **Fix:** In share.js, add a reachableNode(nodeId, w, t) helper. It is true when the node has a placement with visibility != 'dm' alive at any moment of the allowed envelope (the same ivs that ?window=1 uses, so Brief Fair at 20-40 stays readable and the existing 'Brief Fair' link test still passes) and walkUp(map) succeeds. Return 404 from /nodes/:id when that is false, and filter the out/back link rows through the same helper. Mirror the rule in AtlasWorkspace.jsx:763 for the preview. Add share-live tests asserting /nodes/99, /nodes/101 and /nodes/103 return 404 and that Open Landmark's links never include them.
- **Repro:** curl https://timeline-map-production.up.railway.app/api/share/fx89ef1c8ec74cadc99ae56b256c46b337/world (current 50), then .../nodes/101, .../nodes/103 and .../nodes/99. All return 200 with title and body. Compare .../nodes/101/locate, which returns 404. Script: lanes/api-contract/fixture-probe.mjs and share-probe.mjs.
- **Evidence:** fixture-probe.mjs output: 'node 101 200 {"t":"Future Thing","body":"starts 80"} locate 404'; share-probe.mjs output: 'Old Gate links [[440,"Future Secret F"],[441,"Ghost G"],[442,"Vault Hoard H"],[443,"Unplaced U"]]'
- **Re-proved:** Code: share.js:302-305 selects the node with only `n.world_id=$2 AND n.visibility != 'dm'`. There is no placement, time or walkUp check. linkSql (317-320) prunes only `n2.visibility != 'dm'`. /locate (337-351) does check PRESENT and walkUp. Live GETs against the fixture token fx89ef…337 (canon 50): /nodes/101 returned 200 'Future Thing'/'starts 80' while its /locate returned 404. /nodes/103 returned 200 'Inner Loot'/'inside a hidden branch' (locate 404). /nodes/99 returned 200 'Ghost Spot'/'sha…
- **Also found as:** "Share API node detail returns future, DM-placed and hidden-branch nodes to anyo…" (server-dead); "Player share API: /nodes/:id returns future, DM-placed and hidden-branch nodes …" (schema-data); "Share node endpoint and Threads leak shared nodes that live only in a DM-only b…" (player-desktop); "Player View shows the full description of shared nodes that are hidden by a DM-…" (postures-share)

### B011 · Any image id, from any world or account, is accepted as node art, map backdrop or timed backdrop, and its URL comes back

Broken · high · effort s · found by `images` (+3 other lanes)

- **Where:** server/routes/atlas.js:338 (PATCH /maps/:mapId), :362 (PATCH /backdrops/:id), :495 (PATCH /nodes/:id)
- **Files:** `server/routes/atlas.js:338-347`, `server/routes/atlas.js:362-370`, `server/routes/atlas.js:495-500`, `server/routes/atlas.js:349-354`, `server/routes/forge.js:114-121`, `server/routes/share.js:170-199`
- **What happens:** PATCH /api/atlas/nodes/1104 {image_id:421} returned 200. Node 1104 is in world 106 and image 421 belonged to world 107. GET /api/atlas/maps/344 then gave node 1104 imageUrl = world 107's image URL. PATCH /api/atlas/maps/344 {image_id:421} returned 200 and backdropUrl became world 107's image. PATCH /api/atlas/backdrops/87 {image_id:422} returned 200. Only POST /maps/:id/backdrops checks the world: {image_id:421} there gave 400 'Image is not in this world'. A nonexistent id (999999999) gives 500 'Server error' (FK violation). Image ids are sequential integers, and R2 URLs and /api/images-base64/serve are unauthenticated, so any account (a one-click guest included) can PATCH its own node through ids 1..N and read every user's art. That includes Forge paintings for DM-only nodes.
- **Why it matters:** image_id must be null or an image in the same world, as POST /maps/:id/backdrops and the Forge anchor PATCH (forge.js:117-119) already require. Anything else should get a 400.
- **Fix:** Add one helper in atlas.js, e.g. imageInWorld(id, wid), that runs SELECT 1 FROM images WHERE id=$1 AND world_id=$2. In PATCH /maps/:mapId, PATCH /backdrops/:id and PATCH /nodes/:id, return 400 when image_id is present, non-null and fails the check. Reuse the helper in POST /maps/:id/backdrops. That also turns the FK-violation 500 into a 400.
- **Repro:** As one account with two worlds: PATCH /api/atlas/nodes/<node in world X> {"image_id": <image id from world Y>} gives 200. Then GET /api/atlas/maps/<map in X>: that node's imageUrl is world Y's image. Verified with worlds 106 and 107 of the fleet account only; not tried across accounts.
- **Evidence:** a3.mjs output: 'cross-world node image_id=421 (world B): 200 {"ok":true}', 'cross-world timed backdrop POST (guarded): 400', 'cross-world PATCH backdrop 87 image_id=422: 200', 'nonexistent image id: 500'. Also 'world B 421 usage (used by world A node): {"maps":1,"nodes":1}'
- **Re-proved:** Code: atlas.js:338-347 (PATCH /maps/:mapId), :362-370 (PATCH /backdrops/:id) and :495-500 (PATCH /nodes/:id) copy image_id straight into the UPDATE with no world or owner check. Only POST /maps/:id/backdrops (:350-354) and forge.js:114-121 (style_image_id) check that the image belongs to the world. GET /maps/:mapId joins images by id with no world filter (:296-313), so the foreign URL comes back. Reproduced on my own clones: world 127 (clone of 27), plus an R2 image 584 in world 128 (clone of 1…
- **Also found as:** "PATCH /maps and /backdrops accept an image_id from any world, so any account ca…" (maps); "Any signed-in user can point their map, node or timed backdrop at another user'…" (schema-data); "image_id in node, map and backdrop PATCH is not checked for ownership: any user…" (api-contract)

### B023 · Forge panel looks up ask titles across all worlds; ask ids are not world-checked until Allow

Broken · medium · effort xs · found by `api-contract`

- **Where:** Atlas › ✦ Forge panel › batch card ask lines; GET /api/forge/worlds/:worldId
- **Files:** `server/routes/forge.js:52-57`, `server/forge/contract.js:116-140`, `server/forge/contract.js:454-460`
- **What happens:** validateBatch only shape-checks ask ids (comment: 're-validated against the world at execution time'). The GET route's nameOf runs `SELECT id, title FROM nodes WHERE id = ANY($1)` (the same for eras and maps) with no world_id filter. An ask the mind emits with a foreign id (it only sees its own digest, but the contract says it doesn't trust the mind) would render another user's node, map or era title on this DM's card. Not reproduced live: that would need paid Forge calls.
- **Why it matters:** Cross-world names never resolve.
- **Fix:** Add `AND world_id=$2` (pass worldId) in nameOf, and drop asks referencing ids outside the world when the batch is stored (contract.js validate/apply).
- **Repro:** Code read: forge.js:54 `SELECT id, ${col} AS t FROM ${table} WHERE id = ANY($1)`.
- **Evidence:** forge.js:52-57
- **Re-proved:** server/routes/forge.js:52-57: nameOf runs `SELECT id, ${col} AS t FROM ${table} WHERE id = ANY($1)` with only the id array bound and no world_id filter, and it is used for nodes, eras and maps (line 57). server/forge/contract.js:116-140 only shape-checks asks (Number.isInteger), and the comment at 116-117 says ids are re-validated at execution time. validateBatch(batch, world) uses `world` only for timeline clamps (line 34). The batch is stored as-is at contract.js:429-431 (INSERT INTO forge_ba…

### B049 · Guest sign-in has no rate limit of its own and can drain Waypoint's app-wide 500/hour guest quota

Broken · medium · effort xs · found by `auth` (+1 other lane)

- **Where:** POST /api/auth/guest; server/routes/auth.js:273
- **Files:** `server/routes/auth.js:22-26`, `server/routes/auth.js:273`, `server/server.js:72-77`, `server/routes/auth.js:83-88`
- **What happens:** authLimiter (20 per 15 min) sits on /register and /login but not on /guest. /guest is limited only by the general 300 per 15 min per-IP bucket. Every call creates a central Waypoint user plus a local users row. Waypoint caps /api/auth/proxy/guest at 500 per hour per CLIENT APP (auth-service server.js:85-91), and its comment says 'the client app is responsible for limiting its own users'. One IP can therefore mint about 500 guests in roughly 25 minutes and turn 'Continue as guest' off for everyone for the rest of the hour, while filling this app's users table.
- **Why it matters:** A tight per-IP limit on guest creation in this app, as Waypoint expects.
- **Fix:** Add `const guestLimiter = rateLimit({ windowMs: 60*60*1000, max: 10, message: {...} })` and mount it on router.post('/guest', guestLimiter, ...).
- **Repro:** Read server/routes/auth.js:273 (no limiter argument) next to :107 and :179 (authLimiter). Not exercised live, to keep the fleet's shared bucket intact.
- **Evidence:** code: router.post('/guest', async ...) vs router.post('/login', authLimiter, ...); auth-service/server.js:85-91 comment
- **Re-proved:** server/routes/auth.js:22-26 defines authLimiter (20 per 15 min) and mounts it on /register (:107) and /login (:179). /guest (:273) has no limiter argument. It is covered only by the general 300-per-15-min per-IP limiter at server.js:72-77. Each call reaches findOrCreateLocalUser, whose INSERT is at auth.js:83-88, so every call creates a local users row. In auth-service/server.js:85-91, /api/auth/proxy/guest is limited to 500 per hour, and the comment at :82-84 says 'the client app is responsibl…
- **Also found as:** "POST /api/auth/guest has no credential rate limit and creates two accounts per …" (api-contract)

### B071 · Windowed share payload gives players exact times inside hidden stretches and the map's full focus window

Broken · low · effort s · found by `api-contract`

- **Where:** GET /api/share/:token/maps/:mapId?window=1
- **Files:** `server/routes/share.js:141-143`, `server/routes/share.js:191-195`, `server/routes/share.js:212-216`, `server/routes/share.js:249-251`, `server/routes/share.js:257-258`
- **What happens:** Lifespans are clamped only to [lo, canon], not to the allowed envelope (the union of revealed eras plus canon). Fixture /maps/60?window=1 returns backdrop start 40 and 'Brief Fair' end 40, and 40 lies inside the fixture's Hidden Era (40-60). In world 44, a placement starting at 9 (a footstep in no player-visible era) comes back as start 9. The map's focusStart and focusEnd are sent raw: focus_end 90 reached players while canon was 37, even though /world deliberately withholds min and max.
- **Why it matters:** Only moments players may visit leave the server (brief: no hidden era times).
- **Fix:** In share.js, snap each start up to the first allowed moment at or after it and each end down to the last allowed moment at or before it, using ivs. This keeps the client's scrubbing identical, because players can only stand at allowed moments. Clamp focusStart and focusEnd into [lo, canon] too.
- **Repro:** curl …/api/share/fx89ef1c8ec74cadc99ae56b256c46b337/maps/60?window=1 → backdrops[0].start 40, Brief Fair end 40 (lanes/api-contract/window-leak.mjs, share2.mjs for focus).
- **Evidence:** window-leak.mjs: 'fixture windowed backdrops [{"id":5,"start":40…}]', 'my windowed F [["Future Secret F",9,null]]'; share2.mjs: 'focus sent to players 30 90 canon 37'
- **Re-proved:** share.js:141-143 builds ivs (the revealed eras clipped to canon, plus [canon,canon]) and lo. The placement, backdrop and partyTrail start and end values (193-194, 214-215, 250-251) are clamped only against lo and canonT, never snapped to ivs. The map focusStart and focusEnd are sent raw (257-258). Live: on a stock clone of the sample world (open era 1-8, canon 12), GET share /maps/318?window=1 returned backdrop {id:78, start:9}. Day 9 is inside the hidden stretch between 8 and 12, and a player …

### B076 · World PATCH lets a null or non-integer timeline through, and a null canon turns off all player time secrecy

Broken · low · effort s · found by `api-contract` (+1 other lane)

- **Where:** PATCH /api/atlas/worlds/:worldId; server/routes/share.js allowedTime/PRESENT
- **Files:** `server/routes/atlas.js:136-144`, `server/routes/atlas.js:151-153`, `server/routes/share.js:29-43`
- **What happens:** The invariant block uses `req.body.x ?? stored` for the check but then writes the raw body value. PATCH {timeline_current_time:null} returned 200 and stored current=null. After that, /api/share/<t>/world reported current null, and the share root map listed 'Future Secret F' (starts 39, past canon) plus the out-of-time 'Old Gate' and 'The Party': PRESENT($n::int IS NULL) collapses to no filter. PATCH {timeline_min_time:null} stored min=null and moved current to 10. PATCH {timeline_min_time:'5', timeline_max_time:'10'} returned 400 'Timeline start must be before its end' because '5' >= '10' is compared as strings. {timeline_current_time:'now'} returned 500.
- **Why it matters:** CLAUDE.md: 'Timeline invariant (min < max, current clamped into range) is enforced server-side in the Atlas world PATCH'. Nulls and non-integers should get a 400, and share.js should fail closed when canon is null.
- **Fix:** In atlas.js PATCH /worlds, coerce each timeline field with Number and require Number.isInteger (400 otherwise, including null), compare numbers, and write the coerced values. In share.js allowedTime, when timeline_enabled is true and canon is null, treat it as an error or as 'nothing is present' instead of passing null into PRESENT.
- **Repro:** PATCH /api/atlas/worlds/44 {"timeline_current_time":null} → 200; GET /api/share/NBXCV-FMo_xIkMhCPOW6aeiY/maps/143 now includes future and DM-timed placements (lanes/api-contract/nullcanon.mjs; world restored afterwards).
- **Evidence:** nullcanon.mjs: 'share root with null canon ["The Keep","The Flood","Your first node","Old Gate","The Party","Future Secret F","Ghost G"]'
- **Re-proved:** Code: atlas.js:136-144 validates with `req.body.x ?? stored` but writes the raw body value (151-153). share.js allowedTime (29-38) returns canon unchanged even when it is null, and PRESENT (42-43) collapses when $n is null. Live on my world 96 (canon 12, range 1-20), with the share token minted: the share root at canon listed ['The Keep','The Flood','Your first node']. PATCH {timeline_current_time:null} returned 200. /share/world then reported current null, and the share root listed ['The Keep'…
- **Also found as:** "The world PATCH timeline invariant can be bypassed from the API: null min is st…" (time)

### B081 · Malformed node ids on the public share API return 500 instead of 404

Broken · low · effort xs · found by `player-desktop`

> **Second pass — see also:** The marker POST has the same Number()-versus-raw split on :mapId. There a non-canonical id like 60.0 writes the node before the 500, leaving an unplaced player node that counts toward the cap. The node-handler fix does not reach it. → **B094** in [WP-21](WP-21-the-server-stays-up-and-sign-in-keeps-working.md)

- **Where:** server/routes/share.js:298-305, 337-343
- **Files:** `server/routes/share.js:298-305`, `server/routes/share.js:337-343`
- **What happens:** GET /api/share/<token>/nodes/abc, /nodes/1.5, /nodes/99999999999 and /nodes/abc/locate all return 500 {message:'Server error'}: the Postgres integer cast fails and each one logs a 'share error' on the server. /maps/abc already returns 404.
- **Why it matters:** 404 for any id that is not a valid int4.
- **Fix:** At the top of both handlers: const id = Number(req.params.id); if (!Number.isInteger(id) || id < 1 || id > 2147483647) return notFound(res).
- **Repro:** curl https://timeline-map-production.up.railway.app/api/share/<token>/nodes/abc → 500
- **Evidence:** probe4: '/nodes/abc/locate 500', '/nodes/1.5 500', '/nodes/99999999999 500'
- **Re-proved:** Live probes with a share token on my clone (world 109) returned: /nodes/abc 500, /nodes/1.5 500, /nodes/99999999999 500, /nodes/abc/locate 500 and /nodes/1.5/locate 500, each with {message:'Server error'}. /maps/abc and /maps/abc?window=1 returned 404. The code agrees: share.js:305 and 343 pass req.params.id raw as $1 to an int column, so the Postgres cast error lands in wrap() at share.js:13-14, which logs 'share error' and returns 500. The maps route goes through walkUp(Number(...)), and NaN …

### C037 · main.jsx says players never get the bug-tracker API key, but the key ships in the bundle /p/ loads

Confusing · low · effort xs · found by `docs-hygiene` (+2 other lanes)

- **Where:** client/src/main.jsx:6-17
- **Files:** `client/src/main.jsx:6`
- **What happens:** The comment says the widget moved out of index.html 'so the public Player View (/p/*) never loads it — anonymous players shouldn't get an internal reporting tool (or its API key)'. The key is a string literal in main.jsx:15, and /p/:token loads the same index bundle. Live: `curl /p/not-a-token` → assets/index-CMhfuHKj.js, which contains <the widget key literal in client/src/main.jsx> .
- **Why it matters:** Either the key is kept off the public page, or the comment doesn't claim it is.
- **Fix:** If the key is harmless (it is an ingest key, and /login is public anyway), change the comment to say only the widget UI is kept off /p/. Otherwise have the server inject the widget tag for non-/p paths (server.js SPA fallback) so the key isn't in the shared bundle.
- **Repro:** curl -s https://timeline-map-production.up.railway.app/p/not-a-token | grep -o '/assets/index-[^"]*js' then grep that bundle for <the widget key literal in client/src/main.jsx>
- **Re-proved:** client/src/main.jsx:6-10 has the comment saying players shouldn't get the reporting tool 'or its API key'. Line 15 sets data-api-key to the literal <the widget key literal in client/src/main.jsx>, inside a runtime pathname check in the same module, so the string is compiled into the shared bundle. Live check: `curl -s .../p/not-a-token` has a single script tag, src=/assets/index-CMhfuHKj.js. Grepping that bundle for <the widget key literal in client/src/main.jsx> returns the full 64-hex key. The /p/ page gets …
- **Also found as:** "main.jsx comment claims players never get the bug-tracker API key, but it ships…" (postures-share); "main.jsx comment says players never get the bug-tracker API key, but the key sh…" (auth)

### P083 · Player View image loads count against the same rate-limit bucket as the DM's world, image and auth calls

Product polish · low · effort xs · found by `api-contract`

- **Where:** server/server.js:72-79; GET /api/images-base64/serve/:filename
- **Files:** `server/server.js:72-79`, `server/routes/image-base64.js:101-145`
- **What happens:** The general limiter skips only /share and /atlas. Every base64 image served to Player View phones (sample clones use base64 art) is counted in the 300-per-15-min bucket shared with the DM's /api/images, /api/worlds, /api/auth, /api/forge and /api/voice calls, all from one venue IP. curl on a serve URL shows x-ratelimit-limit: 300. The Cache-Control max-age of 86400 softens repeat loads but not first loads across several phones.
- **Why it matters:** Public art loads have their own budget, as /api/share does.
- **Fix:** Extend the skip in server.js to req.path.startsWith('/images-base64/serve') and give it its own generous limiter.
- **Repro:** curl -D - https://timeline-map-production.up.railway.app/api/images-base64/serve/clone-876946a30583e68581.svg → x-ratelimit-limit: 300
- **Evidence:** curl headers: 'x-ratelimit-limit: 300', 'x-ratelimit-remaining: 188'
- **Re-proved:** server.js:72-76: the general limiter (max 300 per 15 min) skips only paths starting '/share' or '/atlas', and server.js:99 mounts /api/images-base64 under it. image-base64.js:101 serve route is public. utils/imageUrl.js:4-10 turns base64 rows into /api/images-base64/serve/<file> URLs, and share and atlas payloads hand those URLs to players. Live curl on GET /api/images-base64/serve/clone-876946a30583e68581.svg: HTTP 200, content-type image/svg+xml, cache-control: public, max-age=86400, x-rateli…

