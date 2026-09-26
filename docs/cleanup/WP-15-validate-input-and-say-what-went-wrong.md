# WP-15 · Validate input and say what went wrong

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Reject bad values with a clear 400 instead of a 500, and show the server's message instead of axios text. Replace the endless 'Opening…' with a real not-found state.

**Do after:** [WP-07](WP-07-delete-the-dead-code.md)

**Notes:** Write one validation helper for atlas.js (length, integer, enum, ordered range) instead of separate checks in each route. maps-12: GET /maps/:mapId must check that the map belongs to the world in the URL. Settle resilience-16 and confusing-code-19 together as one client error shape. To re-check: a 300-character title, a decimal lifespan, a reversed era and /w/999999 should each give a readable message.

## Checklist

- [x] **B018** · medium · s · Decimal or over-long time input returns 500 with a bare 'Server error' toast, and the UI keeps showing the unsaved value — done 56fdd1b (whole-number moments and a 50-character unit are enforced server-side with a sentence; the inputs step by 1 and cap their length; a refused save puts the stored value back)
- [x] **B044** · medium · s · Title over 255 characters or a decimal time gives a raw 500 'Server error'; an empty title is saved as a blank pin — done 56fdd1b (title input capped at 255 and clamped server-side; a blank title stores as Untitled; decimals are 400s)
- [x] **B050** · medium · s · A missing map (back into a removed interior, /m/999999) is a retry-only dead end, and typing in Map notes there throws — done 56fdd1b (a 404 map shows "This space no longer exists" with a way to the world map, no editor chrome until a map is loaded, and the last location is cleared)
- [x] **P005** · medium · s · A world that can't load (deleted, wrong id, stale '/' resume, or a 5xx) leaves a fully armed editor stuck on 'Opening…' or with no world — done 56fdd1b (a world that fails to load shows Try again + To your worlds; a 404 lands on the dashboard with a notice; non-numeric ids are 404s)
- [x] **P006** · medium · s · Time ranges are never validated: reversed eras, focus periods and lifespans save silently and break quietly — done 56fdd1b (reversed lifespans, focus periods, eras, period texts and backdrops are refused, judged against the stored bound on a PATCH; the client holds a reversed pair with a hint; the ✓ keys on focusOk)
- [x] **P014** · medium · xs · Error toasts show raw axios or server strings ('Network Error', 'Server error', 'Request failed with status code 502'); the friendly messages never appear — done 56fdd1b (errText in services/http.js: the server's 4xx sentence, the caller's fallback for a 5xx, a connection hint when nothing answered)
- [x] **P022** · medium · s · The map and backdrop routes don't validate input: bad values cause 500s, and the rejected value stays on screen — done 56fdd1b (map PATCH validates title/view/focus/image; backdrops validate and order their bounds; rename and focus roll back when refused)
- [x] **P023** · medium · m · Atlas writes have almost no input validation: UI-reachable over-length text and decimals return 500 and drop batched edits — done 56fdd1b (server/lib/validate.js cleans every Atlas write; router.param 404s odd ids; self-links and off-plane positions handled; maxLength on the inputs)
- [x] **C036** · low · s · Client services use two error conventions, so some flashes show 'Request failed with status code 500'; AdminPanel bypasses the shared http client — done 56fdd1b (every service rejects with the axios error; callers use errText; AdminPanel already used http.js)
- [x] **C046** · low · xs · World name rules differ between create, rename and clone: empty names accepted, over-length names return 500 — done 56fdd1b (worldName() on create, rename and clone: 1–255 characters, 409 on a duplicate)
- [x] **C049** · low · xs · /w/A/m/<map of world B> shows B's map with A's name, tree, clock and eras, and saves that pair as the '/' resume location — done 56fdd1b (the map payload carries worldId; the workspace redirects to the map's own world)
- [x] **P035** · low · s · Server error text reaches the DM raw: provider JSON, SQL errors, and words like ‘tombstone’, ‘batch’, ‘placement’, ‘fact’ — done 56fdd1b (forge/voice wrap() answer with err.userMessage or a generic line; provider errors carry a plain sentence; tombstone/batch/placement/fact wording replaced)
- [x] **P061** · low · xs · A non-numeric world id returns 500 'Server error' instead of 404 — done 56fdd1b (router.param guards in atlas, worlds, images, folders, forge and voice)

## Items

### B018 · Decimal or over-long time input returns 500 with a bare 'Server error' toast, and the UI keeps showing the unsaved value

Broken · medium · effort s · found by `time`

- **Where:** ⚙ From/To/Unit, era name/bounds, Focus period, Lifespan; server/routes/atlas.js:133-156, 338-347, 665-689, 710-717
- **Files:** `server/routes/atlas.js:133-156`, `server/routes/atlas.js:338-347`, `server/routes/atlas.js:665-689`, `server/routes/atlas.js:710-717`, `client/src/pages/AtlasWorkspace.jsx:19`, `client/src/pages/AtlasWorkspace.jsx:599-607`, `client/src/pages/AtlasWorkspace.jsx:813`
- **What happens:** The routes pass raw values into INTEGER and VARCHAR(50/120) columns. World 61: To 20.5 → 500 PATCH /api/atlas/worlds/61, toast 'Server error', and the timebar kept '1 … 20.5' until reload. A 60-char unit → 500, and the label kept the long unit, squeezing the track to nothing (shots/s8-longunit.png). Era To 65.5 and a 135-char era name → 500 PATCH /api/atlas/eras/150, with both inputs still showing the rejected values. Focus 20.5 → 500 PATCH /maps/197, track showing 20.5…29. Lifespan 10.5 → 500. PATCH era {name:null} or {start_time:'abc'} → 500. The era POST slices the name to 120 but the PATCH doesn't. errText (:19) prefers the server's generic 'Server error' over the specific fallback such as "Couldn't save the era".
- **Why it matters:** Friendly 400s (or input constraints that stop bad values) and an optimistic state that rolls back when the save fails.
- **Fix:** Server: Number.isInteger checks and length clamps returning 400 (slice the era name to 120 in the PATCH as the POST does, the unit to 50). Client: step=1 with Math.round, maxLength 50 on Unit and 120 on era name, revert setWorld/setData on failure. Make errText ignore the generic 'Server error' message and use the fallback.
- **Repro:** ⚙ → To = 20.5 → Save.
- **Evidence:** log.http ['500 PATCH /api/atlas/worlds/61','500 PATCH /api/atlas/eras/150','500 PATCH /api/atlas/maps/197']; s8 '== after Save 1-20.5 {tl:"1 … 20.5",flash:"Server error",save:"⚠ Not saved"}'
- **Re-proved:** Code: server/routes/atlas.js:133-156 (world PATCH), :338-347 (map PATCH), :665-689 (placement PATCH), :710-717 (era PATCH) pass raw body values into INTEGER / VARCHAR(50) / VARCHAR(120) NOT NULL columns (schema.sql:38-41, 136-137, 217-218, 237-239) with no type or length checks. The era POST at :702-708 slices the name to 120, but the PATCH does not. wrap() (:13-14) turns every DB error into 500 {message:'Server error'}. errText (AtlasWorkspace.jsx:19) prefers response.data.message, so the gene…

### B044 · Title over 255 characters or a decimal time gives a raw 500 'Server error'; an empty title is saved as a blank pin

Broken · medium · effort s · found by `inspector`

- **Where:** Inspector › Title, Lifespan, period From/To (AtlasWorkspace.jsx:1830, 1936-1940, 1981-1985; atlas.js:495-508, 439-447, 665-688)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1830`, `client/src/pages/AtlasWorkspace.jsx:1981`, `client/src/pages/AtlasWorkspace.jsx:1936`, `server/routes/atlas.js:498`, `server/routes/atlas.js:668`, `server/routes/atlas.js:442`
- **What happens:** The title input has no maxLength and the PATCH does no validation. A 300-char title returned 500 and flashed 'Server error' and the chip said '⚠ Not saved', while the inspector and pin kept showing the 300-char title the server never stored. Lifespan 'from 2.5' (type=number, no step) returned 500 'Server error' because the column is INTEGER, and fact/era inputs share this. Clearing the title saved '' and the pin became a bare icon with no name (screenshot 28).
- **Why it matters:** Inputs are clamped and validated with human messages. An empty title falls back to something visible.
- **Fix:** Add maxLength={255} to the title input. In atlas.js PATCH /nodes, slice title to 255 and reject or trim empty to 'Untitled'. Add step="1" to number inputs and Math.round them client-side. Server-side, parseInt the time fields in placements/facts/backdrops/eras and return 400 with a readable message instead of letting pg throw.
- **Repro:** Select The Flood and fill the title with 300 'L's → 500 PATCH /api/atlas/nodes/314. Fill Lifespan 'from' with 2.5 → 500 PATCH /api/atlas/placements/407 (lanes/inspector/s11.mjs T1/T2, s12.mjs LS3).
- **Evidence:** s11: 'T2 300-char title saved length: 0 flash: "Server error" http: ["500 PATCH /api/atlas/nodes/314"]'; s12: 'LS3 decimal from saved: null flash: "Server error" http: ["500 PATCH /api/atlas/placements/407"]'; shots/28-empty-title.png, 29-long-title.png
- **Re-proved:** Code: the title input at AtlasWorkspace.jsx:1830 has no maxLength. saveNode (366-372) calls localPatchNode before the PATCH, and nothing reverts it on failure. PATCH /nodes (atlas.js:495-508) writes req.body straight into nodes.title VARCHAR(255) (schema.sql:117). wrap (atlas.js:13-14) turns any pg error into 500 {message:'Server error'}, and track/errText (127-137, 19) flashes that text. The lifespan, fact and era inputs pass Number(value) or num() unrounded (1936/1939, 1981/1984, 1796), and e…

### B050 · A missing map (back into a removed interior, /m/999999) is a retry-only dead end, and typing in Map notes there throws

Broken · medium · effort s · found by `maps`

- **Where:** Remove or narrow the '/' resume sentence. It applies only when the interior is removed from another tab or device, or by a Forge Unmake while the DM is inside it. The normal remove-then-Back flow leaves the last location at the parent. Everything else stands, including the line refs AtlasWorkspace.jsx:156-169, 1026-1032 and 1460.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:156-169`, `client/src/pages/AtlasWorkspace.jsx:1026-1032`, `client/src/pages/AtlasWorkspace.jsx:1455-1463`
- **What happens:** After removing an interior, browser Back (or /w/38/m/999999) shows 'Couldn't load this map.' with '⟳ Try again', which can never succeed on a 404. The crumbs are empty and there's no link to the world map. The whole editing chrome stays live: Add node, Outline, Map ▾, a nameless 'This space ✎', 'Set a backdrop image…', 'Backdrops over time…' (does nothing), and the Map notes box. Typing in Map notes and clicking away throws 'Cannot read properties of undefined (reading 'id')', because the onBlur calls patchMap(map.id) with map undefined. The '/' resume link can land here too, since the last location isn't cleared when an interior is removed.
- **Why it matters:** A 404 shows 'This space no longer exists' with a button to the world's root map, and the editing chrome is hidden until a map loads.
- **Fix:** Keep the 404 status in loadMap's catch (e.response?.status) and render a not-found panel with navigate(`/w/${worldId}/m/${world.rootMapId}`). Hide the toolbar, space panel and rail actions when loadState !== 'ok'. In the map notes onBlur, return early if !map (line 1460).
- **Repro:** /w/38/m/999999 › click Map notes, type 'x', click the 'This space' heading. Console pageerror.
- **Evidence:** t10 output: '[A notes-blur] pageErrors=["Cannot read properties of undefined (reading 'id')"]', http 404 GET /api/atlas/maps/999999; t9: 'back url …/m/121 state: … Couldn't load this map. | ⟳ Try again | ＋ Add node…'; shots/19-back-into-removed-interior.png, 20-missing-map.png
- **Re-proved:** Code: loadMap's catch only sets loadState 'err' (AtlasWorkspace.jsx:156-169). The err panel (1026-1032) offers only '⟳ Try again'. The toolbar and space panel render whenever mode==='edit', whatever the loadState. The Map notes onBlur calls atlasService.patchMap(map.id, …) at line 1460 with map = data?.map undefined. The Backdrops-over-time modal renders only when `bdsOpen && map` (1604), so that button does nothing. Reproduced on clone 74: I opened The Keep's interior (248), went up, removed t… _(partly — the corrected location is used above)_

### P005 · A world that can't load (deleted, wrong id, stale '/' resume, or a 5xx) leaves a fully armed editor stuck on 'Opening…' or with no world

Product polish · medium · effort s · found by `resilience` (+4 other lanes)

- **Where:** /w/:worldId and /w/:worldId/m/:mapId. AtlasWorkspace.jsx:229-244 (world load), 156-158 (loadMap no-op without mapId), 876-878
- **Files:** `client/src/pages/AtlasWorkspace.jsx:229`, `client/src/pages/AtlasWorkspace.jsx:156`, `client/src/pages/AtlasWorkspace.jsx:1033`
- **What happens:** /w/999999 and /w/abc showed 'Opening…' forever under the full edit chrome: '+ Add node', '🕓 Timeline', Map ▾, a map-notes box and a brand select reading '…'. The only feedback was a 4 s toast ('World not found', or a 500 for 'abc'), then nothing. /w/111/m/999999 shows 'Couldn't load this map. ⟳ Try again', which can never succeed. When GET world fails once (502), the workspace renders with world=null: empty Maps tree, no timebar, toast 'Request failed with status code 502', and the '🕓 Timeline' button that resets the clock (see the timeline finding). '/' resumes to the last location, so a world deleted on another device lands here.
- **Why it matters:** A clear 'This world isn't available' state with 'Back to your worlds' and Retry, and no edit controls until the world has loaded.
- **Fix:** Track a worldState ('loading'|'ok'|'err'|'missing') in the world effect. On 404 clear worldService's last location and render a full-page message with a Dashboard link. On 5xx/network render Retry. Render the toolbar, space panel and '🕓 Timeline' only when world is loaded. Have the server return 404, not 500, for non-numeric ids.
- **Repro:** lanes/resilience/s10.mjs (all four URLs plus world-500); screenshots lanes/resilience/shots/s10-world-missing.png, s10-world-500.png, s25-world502.png.
- **Evidence:** s10: 'world-missing: url=/w/999999 … Opening… ＋ Add node … 🕓 Timeline'; 'world-500: … 🧭 … The Sunken Keep … (no tree rows)'; http '500 GET /api/atlas/worlds/abc'
- **Re-proved:** Code: the world effect at AtlasWorkspace.jsx:229-244 only flashes on failure. world stays null, and the tree is set only inside the success path. loadMap returns early without a mapId (157), so loadState stays 'loading' and the canvas shows 'Opening…' (1033). The edit toolbar (1116ff) and '🕓 Timeline' (1176-1178, shown whenever !tl?.enabled, which is true with world=null) are not gated on the world loading. Live, my own run: /w/999999 showed the toast 'World not found' (gone after 4 s), and af…
- **Also found as:** "A world or map you can't open shows 'Opening…' forever (or a useless 'Try again…" (canvas); "An unknown or deleted world URL shows 'Opening…' forever under the full editing…" (maps); "A world you can't open shows the full editor stuck on 'Opening…'; the only 'Wor…" (auth); "A deleted, foreign or malformed world URL (and '/' resuming one) leaves the use…" (dashboard)

### P006 · Time ranges are never validated: reversed eras, focus periods and lifespans save silently and break quietly

Product polish · medium · effort s · found by `time` (+1 other lane)

- **Where:** ⚙ era From/To; Map ▾ › 🎯 Focus period…; inspector Lifespan; server/routes/atlas.js:710-717, 338-347, 665-689
- **Files:** `server/routes/atlas.js:710-717`, `server/routes/atlas.js:338-347`, `server/routes/atlas.js:665-689`, `client/src/pages/AtlasWorkspace.jsx:807-815`, `client/src/pages/AtlasWorkspace.jsx:1164`, `client/src/pages/AtlasWorkspace.jsx:1451`
- **What happens:** Era 'Session 3' From set to 60 (To 39): saved as [60-39] with no message, and it vanished from the timebar bands and the player bar. Focus 29→20: saved; Map ▾ shows '🎯 Focus period… ✓' but nothing zooms and there's no ⤢. Focus 50–60 on a 10–39 clock: saved and silently ignored. API: PATCH placement {start_time:15,end_time:5} → 200; PATCH era {start_time:49,end_time:40} → 200.
- **Why it matters:** The DM is told when a range is backwards or outside the clock, and the ✓ is not shown for a focus that does nothing.
- **Fix:** Server: 400 with a readable message when start > end in the era POST/PATCH, the map focus PATCH and the placement PATCH. Client: disable Save or show an inline hint, and base the ✓ on focusOk rather than hasFocus.
- **Repro:** Map ▾ → Focus period… → 29 → 20 → Save; reopen Map ▾ (✓ shown, timebar unchanged).
- **Evidence:** s7.mjs '150:Session 3 — The Lantern Room[60-39]pv'; s13.mjs '== focus 29-20 … fexp:[]' + 'menu focus item 🎯 Focus period… ✓'; chk2.mjs 'placement start>end 200', 'focus reversed 200'
- **Re-proved:** Code: era POST (server/routes/atlas.js:702-709), era PATCH (:710-717), map PATCH (:338-347) and placement PATCH (:665-689) all write start/end with no ordering check. The client saveFocus (AtlasWorkspace.jsx:807-815) and the inspector Lifespan (:633-638, :1979-1986) don't check either. The ✓ at :1164 and :1451 keys on hasFocus (:800), while the zoom and ⤢ key on focusOk (:803). Live on clone 110: Map ▾ → Focus period… → 29 → 20 → Save gave DB focus 29/20, .fexp count 0, and the menu item read '…
- **Also found as:** "A lifespan or period whose end is before its start is accepted silently, so the…" (inspector)

### P014 · Error toasts show raw axios or server strings ('Network Error', 'Server error', 'Request failed with status code 502'); the friendly messages never appear

Product polish · medium · effort xs · found by `resilience` (+1 other lane)

- **Where:** Every failure toast in the workspace. client/src/pages/AtlasWorkspace.jsx:18 (errText), used by track() at 135 and ~25 call sites
- **Files:** `client/src/pages/AtlasWorkspace.jsx:18`, `client/src/pages/AtlasWorkspace.jsx:135`
- **What happens:** errText returns e.response.data.message, else e.message, else the fallback. Axios errors always have e.message, so the fallback is never reached. Observed toasts: 'Server error' (PATCH/POST 500), 'Network Error' (aborted request), 'Request failed with status code 502' (world load), 'Node not found' (editing a node deleted in another tab). The carefully written fallbacks ('Couldn't save — check your connection', 'Couldn't add the node', 'Couldn't load this world') are dead text. Each toast also disappears after 4 s.
- **Why it matters:** Plain wording that says what failed and what to do. Server detail only when it's meaningful.
- **Fix:** Change errText to use the caller's fallback when there is no response or status >= 500, and use data.message only for 4xx. For network errors append ' — check your connection'. Keep error toasts on screen until dismissed, or at least longer than 4 s.
- **Repro:** lanes/resilience/s3.mjs (500 and abort), s25.mjs (502), s8.mjs (404).
- **Evidence:** s3: 'flash= "Server error"', '2 abort: flash= "Network Error"'; s25: 'toast "Request failed with status code 502"'; s8: 'flash= "Node not found"'; screenshot lanes/resilience/shots/s3-abort.png
- **Re-proved:** errText is at client/src/pages/AtlasWorkspace.jsx:19 (the finder cited 18, off by one): `e?.response?.data?.message || e?.message || fallback`. Axios errors always carry .message, and http.js's interceptor rejects with the original axios error, so the fallback is reached only for non-axios rejections. track() (135) feeds it, with 37 track() call sites plus 16 direct errText calls. Live on my clone: an aborted PATCH /maps/434 (Map ▾ → 🗺 Map) showed the toast 'Network Error'. A 500 on the same P…
- **Also found as:** "The friendly fallback error messages never show; the DM sees “Network Error” or…" (copy)

### P022 · The map and backdrop routes don't validate input: bad values cause 500s, and the rejected value stays on screen

Product polish · medium · effort s · found by `maps`

- **Where:** Rename this space; Backdrops over time from/to inputs; Focus period; server/routes/atlas.js:338-376
- **Files:** `server/routes/atlas.js:338-346`, `server/routes/atlas.js:349-370`, `client/src/pages/AtlasWorkspace.jsx:766-772`, `client/src/pages/AtlasWorkspace.jsx:1620-1624`
- **What happens:** (a) Renaming a space to 300 characters returned 500, with toast 'Server error' and '⚠ Not saved'. renameMap had already put the 300-character title in the inspector heading and never rolled it back, while the crumb and tree kept the old name. (b) A period start of 15.5 in 'Backdrops over time' returned 500 'Server error', and the input kept showing 15.5. (c) Setting a period's end (5) before its start (15) saved silently, leaving a row that can never be active. (d) PATCH /maps with focus_start 3.5 returned 500. With view 'banana' it returned 200 and stored 'banana'. An empty title returned 200 and stored ''.
- **Why it matters:** The routes clamp or reject bad input with a 400 and a readable message. The UI blocks impossible ranges, and optimistic changes roll back when a save fails.
- **Fix:** In PATCH /maps: validate title (trimmed, 1–255 characters), view ∈ {map, list}, and focus_* as integers or null. In POST/PATCH /backdrops: coerce start/end with parseInt and return 400 when end < start. On the client: give the rename input maxLength={255}, use step=1 on the number inputs, and revert data.map.title in renameMap's catch.
- **Repro:** /w/38/m/113 › ✎ › paste 300 characters › Rename. Backdrops over time › set 'from' to 15.5 and click away. Set 'to' below 'from'.
- **Evidence:** t13 output 'after 300-char rename: flash Server error | chip ⚠ Not saved; ui title len: 302 server title: "The Keep — Inside"' (shots/24-rename-300-fail.png); t4 'bds after end=5: [22,279,15,5]' and 'start=15.5 … flash: Server error'; t12 focus_start 3.5 → 500, view banana → 200 stored
- **Re-proved:** Code: PATCH /maps/:mapId (atlas.js:338-346) and PATCH /backdrops/:id (atlas.js:361-369) pass body values straight into SQL without validating them, and wrap() (atlas.js:13-14) turns DB errors into 500 'Server error'. The schema has maps.title VARCHAR(255), view VARCHAR(10), focus_* INTEGER and map_backdrops start/end INTEGER. renameMap (AtlasWorkspace.jsx:766-772) sets data.map.title optimistically, and its catch is empty with no rollback. The backdrop inputs (1620-1624) are uncontrolled defaul…

### P023 · Atlas writes have almost no input validation: UI-reachable over-length text and decimals return 500 and drop batched edits

Product polish · medium · effort m · found by `api-contract` (+2 other lanes)

- **Where:** server/routes/atlas.js PATCH/POST handlers; inspector title, map rename, era name, timeline unit inputs
- **Files:** `server/routes/atlas.js:341-344`, `server/routes/atlas.js:382-390`, `server/routes/atlas.js:431-434`, `server/routes/atlas.js:442-445`, `server/routes/atlas.js:498-501`, `server/routes/atlas.js:668-670`, `server/routes/atlas.js:704-716`, `server/routes/atlas.js:728-744`, `server/routes/share.js:298-306`, `client/src/pages/AtlasWorkspace.jsx:1660`, `client/src/pages/AtlasWorkspace.jsx:1783`, `client/src/pages/AtlasWorkspace.jsx:1793`, `client/src/pages/AtlasWorkspace.jsx:1830`, `client/src/pages/AtlasWorkspace.jsx:366-371`
- **What happens:** All of these returned 500 'Server error' live on world 44: - node title null or 300 chars; category 60 chars; stance 'enemy-of-all' (VARCHAR 10); pin_size 'big'; image_id 99999999 - POST node with title null, x 'left' or a 60-char category - placement x 'left' or start_time 12.5 - fact body null or start_time 'dawn' - era PATCH name 200 chars (POST clamps to 120, PATCH does not), start 'dawn' or null - link label 300 chars (PATCH clamps, POST does not) or kind 30 chars - map title null, view 20 chars, focus 'dawn', image 99999999 - backdrop start 'dawn'; world name null, unit 60 chars - spotlight nodeId 'abc'; clone source_id 'abc' - non-numeric or huge ids: /maps/abc, /nodes/abc, /undo/abc, /nodes/99999999999, /api/share/<t>/nodes/abc. These values are accepted with 200/201 when they should not be: placement x 500 (off the plane), start 30 > end 10, era start 5 > end 1, a self-link, and world name ''. Several of the 500s are reachable from the UI: the inspector Title, map rename, era name and Unit inputs have no maxLength, and the number inputs accept 2.5 for integer columns. saveNode batches edits for 500 ms, so the body typed in the same window fails with an over-long title.
- **Why it matters:** Bad input gets a 400 with a plain message, or is clamped the way the player-marker route does (share.js:279-286). Unknown or non-numeric ids get a 404.
- **Fix:** Add a small validator module in server/routes (intParam guard returning 404 via router.param for mapId/id/worldId; clampText(len); int() for *_time/x/y; FK-in-world checks) and use it in every atlas.js write. Clamp consistently: title and label to 255, era name to 120, unit to 50. Reject start>end and self-links. Add maxLength={255} to the title and rename inputs, 120 to the era name and 50 to the unit, and step=1 on the number inputs.
- **Repro:** PATCH /api/atlas/nodes/<id> {"title":"x"*300} → 500; GET /api/atlas/maps/abc → 500; POST /api/atlas/links {from_node_id:A,to_node_id:A} → 201. The full list is in lanes/api-contract/validation.txt.
- **Evidence:** validation.txt, e.g. '500 node title 300 chars', '500 era PATCH name 200', '201 link self', '200 placement x 500'
- **Re-proved:** Read atlas.js. The PATCH handlers for maps (341-344), facts (442-445), nodes (498-501), placements (668-670), eras (713-716) and links (741-744) copy req.body straight into the UPDATE. POST node (382-390), fact (431-434) and link (728-734) insert without checks. POST era clamps name to 120 (707) and PATCH link clamps label to 255 (738), but PATCH era and POST link do not. I reproduced on my own clone of world 27 (world 98, since deleted); output is in verify/api-contract-b2/v1.mjs and v1.txt. T…
- **Also found as:** "Visibility and other enum fields accept any string, and share.js treats anythin…" (api-contract); "Atlas write routes send values straight to Postgres: long text returns 500, enu…" (schema-data)

### C036 · Client services use two error conventions, so some flashes show 'Request failed with status code 500'; AdminPanel bypasses the shared http client

Confusing · low · effort s · found by `confusing-code` (+2 other lanes)

- **Where:** CLAUDE.md:55 (not :57) holds 'Use the service layer in client/src/services/ — do NOT create raw axios instances in components'. Everything else is cited correctly. Setup.jsx:3 also imports raw axios, which the finding does not mention.
- **Files:** `client/src/services/worldService.js:12`, `client/src/services/atlasService.js:12`, `client/src/pages/Dashboard.jsx:137`, `client/src/pages/AtlasWorkspace.jsx:2091`, `client/src/pages/AdminPanel.jsx:5`
- **What happens:** atlasService/forgeService/voiceService/shareService reject with the raw axios error (message under e.response.data.message); worldService/imageServiceBase64/imageFolderService/authService catch and rethrow error.response?.data, a plain {message} with no status (e.g. worldService.js:12). Callers guess: Dashboard createWorld reads e?.response?.data?.message || e.message (125); saveWorld (137) reads only e.message although it calls atlasService.patchWorld, so a server rejection shows axios's generic 'Request failed with status code …'; ImagePicker re-implements errText inline (AtlasWorkspace.jsx:2091). AdminPanel builds its own axios instance with the token (AdminPanel.jsx:5-11), skipping http.js's dead-token handling, against CLAUDE.md:57 ('do NOT create raw axios instances in components').
- **Why it matters:** Every service rejects with the same Error shape carrying the server's message and status.
- **Fix:** In the http.js response interceptor, reject with an Error whose .message is the server message and .status the HTTP status; delete the per-method try/catch in the four services; use http.js in AdminPanel.
- **Repro:** Read the listed lines.
- **Re-proved:** Read all nine files in client/src/services. atlasService, forgeService, voiceService and shareService return the raw promise, so callers get the axios error; forgeService.status and voiceService.status are the only ones that catch. worldService.js:12 (and every method there, plus imageServiceBase64, imageFolderService and authService) rethrows `error.response?.data || {message}`. Dashboard.jsx:125 reads `e?.response?.data?.message || e.message` because createWorld mixes atlasService.cloneWorld … _(partly — the corrected location is used above)_
- **Also found as:** "Services disagree on what they throw, so some error toasts show axios text inst…" (api-contract); "A failed Edit details save shows axios text 'Request failed with status code 50…" (dashboard)

### C046 · World name rules differ between create, rename and clone: empty names accepted, over-length names return 500

Confusing · low · effort xs · found by `api-contract` (+1 other lane)

- **Where:** Dashboard › New world / Edit world; POST /api/worlds vs PATCH /api/atlas/worlds/:id vs POST /api/atlas/worlds/clone
- **Files:** `server/routes/worlds.js:109-125`, `server/routes/atlas.js:145-153`, `server/routes/atlas.js:168-183`
- **What happens:** POST /api/worlds trims, requires a name, caps it at 255 and returns 409 on a duplicate. PATCH /api/atlas/worlds/44 {name:''} returns 200 (a nameless world); {name:null} and 300 chars return 500. Clone neither trims nor checks duplicates (the fleet created many same-named worlds). POST /api/worlds {name:12345} returns 500 (name.trim is not a function).
- **Why it matters:** One rule for world names on every path.
- **Fix:** Add a shared cleanWorldName() (String, trim, 1–255, per-user uniqueness if that rule is kept) and use it in worlds.js POST, atlas.js PATCH /worlds and clone.
- **Repro:** PATCH /api/atlas/worlds/<id> {"name":""} → 200; POST /api/worlds {"name":12345} → 500 (validation.txt, general.txt).
- **Evidence:** validation.txt: '200 world name empty', '500 world name null'; general.txt: '500 worlds POST name number'
- **Re-proved:** Reproduced on my own clone (world 100 from template 27, since deleted). PATCH /api/atlas/worlds/100 {name:''} returned 200 and GET-back showed name "". {name:' '} returned 200 and stored " ". {name:null} and a 300-char name both returned 500 'Server error'. POST /api/worlds {name:12345} returned 500, while POST with 300 chars returned 400 'must be less than 255'. Code: worlds.js:109-125 trims, requires a name, checks 255 and rejects duplicates with 409. The atlas.js PATCH handler (starts at lin…
- **Also found as:** "World-name rules differ by path: create refuses duplicates, but clone and renam…" (dashboard)

### C049 · /w/A/m/<map of world B> shows B's map with A's name, tree, clock and eras, and saves that pair as the '/' resume location

Confusing · low · effort xs · found by `maps`

- **Where:** Deep link /w/38/m/115 (115 belongs to world 39); AtlasWorkspace.jsx:156-169; server/routes/atlas.js:293-335
- **Files:** `client/src/pages/AtlasWorkspace.jsx:156-169`, `server/routes/atlas.js:327-331`
- **What happens:** GET /maps/:mapId checks only that the caller owns the map's own world, and the payload has no worldId. The workspace rendered world 39's root (with its Party pin) under '[audit] maps A': world 38's tree with no row highlighted, world 38's timebar (1–20 days, day 12) instead of world 39's (10–39 footsteps, canon 37), and the Party tag worked out from world 38's eras. localStorage atlas_last_location became {worldId:'38',mapId:'115'}. Edits and 'Set canon' here would write to two different worlds.
- **Why it matters:** A map URL under the wrong world redirects to /w/<its world>/m/<map>, or shows a not-found state.
- **Fix:** Return worldId in GET /maps/:mapId's map object. In loadMap, if String(d.map.worldId) !== String(worldId), navigate(`/w/${d.map.worldId}/m/${mapId}`, {replace:true}) before calling setData or setLastLocation.
- **Repro:** Own two worlds, then open /w/<world A>/m/<a map id from world B>.
- **Evidence:** lanes/maps/shots/21-foreign-world-map.png; t10 output B: brand '[audit] maps A', tree selected row 0, timebar '1 … 20 … day 12', lastLocation {worldId:'38',mapId:'115'}
- **Re-proved:** Code: GET /maps/:mapId (atlas.js:293-335) checks only ownsWorld(worldIdOfMap), and the map object it returns (327-331) has no worldId. loadMap (AtlasWorkspace.jsx:156-169) calls setData and setLastLocation(worldId, mapId) with no world check. POST /maps/:mapId/nodes (atlas.js:379-392) derives world_id from the map, while Set canon PATCHes /worlds/<URL worldId>, so edits would split across two worlds. Reproduced read-only: I opened /w/74/m/115 (115 is world 39's root; 74 was my clone). The brand…

### P035 · Server error text reaches the DM raw: provider JSON, SQL errors, and words like ‘tombstone’, ‘batch’, ‘placement’, ‘fact’

Product polish · low · effort s · found by `copy`

- **Where:** 'Unknown tombstone' (atlas.js:645) is effectively unreachable from the undo flash. It fires only when a tombstone's kind is not node, interior or placement, and those are the only three kinds ever written (atlas.js:538, 563, 696). The real 'can't undo any more' case (a used or expired tombstone) returns 'Nothing to undo' at atlas.js:574, which is already plain. So the proposed rewording of atlas.js:645 targets the wrong line. Also, the auth.js:126/193 'Database not initialized' messages come from the login/SSO flow, not from the workspace errText.
- **Files:** `server/routes/forge.js:27`, `server/routes/voice.js:21`, `server/routes/voice.js:27`, `server/routes/atlas.js:645`, `server/routes/forge.js:169`, `server/routes/forge.js:182`, `server/forge/contract.js:275`, `server/voice/elevenlabs.js:11`, `server/routes/auth.js:126`, `client/src/pages/AtlasWorkspace.jsx:2245`
- **What happens:** The forge and voice wrap() handlers return err.message for any thrown error, and errText shows it. Examples: ‘ElevenLabs sound 401: {"detail":…’ (voice/elevenlabs.js:11), ‘OpenAI speech 429: …’ (providers.js:103), ‘Gemini responded 503’ (gemini.js:22), ‘The mind returned malformed JSON’, ‘the batch references nodes that are not in this world’, ‘node 812 already has an interior…’ (contract.js:275-283), ‘Audio needs object storage (R2) configured’, plus raw pg errors. Other routes send dev-speak that errText shows as-is: ‘Unknown tombstone’ (atlas.js:645, the undo flash), ‘No such pending batch’ / ‘No pending asks on that batch’ (forge.js:169,182), ‘Placement not found’, ‘Fact not found’, ‘Invalid link’, ‘World not found or access denied’, ‘Not authorized to update this image’, ‘Database not initialized. Please contact an administrator to run the migration.’ (auth.js:126,193). The Forge flash ‘The mind spoke, but the creation failed: ${applyError}’ (AtlasWorkspace.jsx:2245) passes contract errors through too.
- **Why it matters:** Log the internal error server-side. Send the DM one plain sentence per failure type, e.g. ‘The voice service rejected the request — check the API key’ or ‘That creation is already kept or unmade’.
- **Fix:** In forge.js and voice.js wrap(): log err, then respond {message: err.userMessage || 'The Forge hit a problem — try again'} (voice: 'Couldn't make the audio — try again'). Throw errors carrying a userMessage from gemini.js, providers.js, elevenlabs.js and contract.js where the reason is useful. Reword atlas.js:645 ‘Unknown tombstone’ → ‘That can't be undone any more’, forge.js:169/182 → ‘That card was already kept or unmade’, and the ‘Placement’/‘Fact’ not-found strings to ‘That pin/entry no longer exists’.
- **Repro:** grep -rnoE "(message|error)\s*:\s*['\`\"][^'\`\"]{3,}['\`\"]" server/routes server/middleware; read the wrap() in forge.js:26-27 and voice.js:20-21.
- **Evidence:** Code reading plus the grep output quoted in covered; no paid calls were made, so the provider errors were not triggered live.
- **Re-proved:** Code confirms the core. forge.js:26-27 and voice.js:20-21 wrap() respond with err.message. The provider errors embed raw bodies: elevenlabs.js:11 'ElevenLabs ${what} ${status}: <body>', providers.js:103 'OpenAI speech ${status}: <body>', gemini.js:22 'Gemini responded ${status}', gemini.js:45 'The mind returned malformed JSON'. Contract errors (contract.js:275, 279, 283) reach the DM through mind.js:182 applyError and the AtlasWorkspace.jsx:2245 flash 'The mind spoke, but the creation failed: …… _(partly — the corrected location is used above)_

### P061 · A non-numeric world id returns 500 'Server error' instead of 404

Product polish · low · effort xs · found by `dashboard`

- **Where:** GET /api/atlas/worlds/:worldId and /trail (server/routes/atlas.js:17-20, 79-81)
- **Files:** `server/routes/atlas.js:17-20`, `server/routes/worlds.js:59-72`
- **What happens:** Visiting /w/abc made GET /api/atlas/worlds/abc and GET /api/atlas/worlds/abc/trail both return 500. ownsWorld passes 'abc' straight into an integer comparison and Postgres throws.
- **Why it matters:** 404 'World not found' (or 400) for malformed ids, so logs aren't filled with fake server errors.
- **Fix:** Add router.param('worldId', …) (and mapId/id) in atlas.js that 404s when !/^\d+$/.test(value), or make ownsWorld return false for non-integers. worlds.js routes need the same.
- **Repro:** While signed in, open /w/abc and watch the network (lanes/dashboard/run4.mjs).
- **Evidence:** run4 log.http: '500 GET /api/atlas/worlds/abc/trail', '500 GET /api/atlas/worlds/abc'
- **Re-proved:** atlas.js:17-20: ownsWorld passes the raw param into `WHERE id=$1` with no check. The GET /worlds/:worldId handler (77-81) and /trail (270-272) both call it inside wrap(), which turns any throw into a 500 'Server error'. No router.param or integer validation exists in server/routes or server.js (grep router.param|app.param found nothing). Live, with the fleet token: GET /api/atlas/worlds/abc returned 500, /api/atlas/worlds/abc/trail 500, /api/atlas/worlds/1.5 500, and /api/worlds/abc (worlds.js …

