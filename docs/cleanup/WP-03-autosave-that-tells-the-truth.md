# WP-03 · Autosave that tells the truth

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Every edit either reaches the server or the DM is told it did not. Split the shared debounce timer, flush on page hide, flag failed saves, and send every write through track() so the save chip is honest.

**Notes:** Do confusing-code-01 first: it is small and it overwrites the saved secret. resilience-05 needs one timer per kind or one merged pending patch. Then add a pagehide/visibilitychange flush (resilience-04), an http.js timeout (resilience-19) and a way to keep the edit when the token dies (resilience-10). client-dead-01 and journey-18 both come from the trail effect at AtlasWorkspace.jsx:219-222: refetch after a save settles, not on every local change. resilience-08 and maps-08 need in-flight guards on the create buttons. resilience-20 can be scoped down to a stale-version warning. Re-run e2e/dm.mjs and watch the chip through a forced failure.

## Checklist

- [ ] **B004** · high · m · A failed save is dropped with no retry, the edit stays on screen, and the next good save flips the chip to '✓ Saved'
- [ ] **B006** · high · s · Node DM notes go stale in the workspace: saveNode merges snake_case `dm_note` into camelCase node state, so reselecting shows the old note and typing overwrites it
- [ ] **B024** · medium · m · When the session expires mid-edit, http.js hard-navigates to /login and throws away the edit that triggered it, with no message
- [ ] **B027** · medium · m · Two tabs on the same node overwrite each other silently: the inspector never refreshes, and Reveal in a stale tab wipes the other tab's description
- [ ] **B028** · medium · s · Node autosave and lifespan autosave share one timer; the unmount flush also cancels a pending lifespan save (live proof)
- [ ] **B029** · medium · s · Map loads can arrive out of order: the URL and tree show one map, the canvas shows another, and '+ Add node' writes to the hidden one
- [ ] **B030** · medium · m · Map notes and other save-on-blur fields are lost on reload, browser Back or tab close; there is no beforeunload guard
- [ ] **B032** · medium · s · Double clicks and slow networks create duplicates: '＋ Next session' makes two 'Session 1' eras, Add node makes two nodes, 'Story for a period' makes two facts
- [ ] **B035** · medium · s · Every local edit refetches GET /worlds/:id/trail: one request per animation frame while dragging a pin, and one per keystroke
- [ ] **B058** · medium · s · Double-clicking '＋ Interior map' creates two interiors; the extra one is a phantom map that can't be removed
- [ ] **B067** · low · xs · Typing map notes while a map is loading throws 'Cannot read properties of undefined (reading id)' and the text is discarded
- [ ] **B069** · low · xs · Timebar footstep ticks lag one edit behind after a lifespan change
- [ ] **C034** · low · s · The comment says every write goes through track() so the save chip is honest, but map notes, lantern, voice, ambience and '＋ Next session' bypass it
- [ ] **P063** · low · xs · A save that never answers leaves the chip on 'Saving…' forever: http.js has no timeout
- [ ] **P080** · low · xs · Map notes save outside the save indicator, so the DM never sees 'Saving…' or '⚠ Not saved' for them

## Items

### B004 · A failed save is dropped with no retry, the edit stays on screen, and the next good save flips the chip to '✓ Saved'

Broken · high · effort m · found by `resilience`

- **Where:** Atlas › Edit › inspector autosave / header save chip. client/src/pages/AtlasWorkspace.jsx:127-138 (track), 360-365 (flushSave)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:127`, `client/src/pages/AtlasWorkspace.jsx:360`, `client/src/pages/AtlasWorkspace.jsx:880`
- **What happens:** With PATCH /api/atlas/nodes/1161 answering 500, I typed 'T-500' into Title. A toast said 'Server error' for 4 s and the chip said '⚠ Not saved'. With the route removed, I edited the Description. The chip went to '✓ Saved'. GET back: title still 'Your first node', body saved, and the inspector still showed 'T-500'. The failed patch had been removed from pendingPatch before the request, so nothing retries it. Optimistic UI changes (localPatchNode, setMapView, outline kind/style, drag position, rename, focus period) are never rolled back either. Railway restarts on every push, so a DM editing during a deploy hits this.
- **Why it matters:** A failed write keeps its patch queued and retries, or keeps the field marked unsaved. The chip must not say 'Saved' while an earlier edit is unsaved.
- **Fix:** In flushSave, put the patch back into pendingPatch on failure (merged under newer edits) and retry with backoff. In track(), keep a sticky 'failed' count so a later success can't flip the chip to Saved while failures remain, and offer a 'Retry' action in the toast. For optimistic updates, keep the previous value and restore it when the call rejects.
- **Repro:** lanes/resilience/s3.mjs step 1/1b: page.route PATCH nodes → 500, fill title, unroute, fill body, wait, GET /api/atlas/maps/359.
- **Evidence:** s3 output: '1 500: flash= "Server error" chip= ⚠ Not saved' then '1b after next good save: chip= ✓ Saved server title= Your first node body= body after failure ui title= T-500'; screenshot lanes/resilience/shots/s3-abort.png
- **Re-proved:** Code: flushSave (AtlasWorkspace.jsx:360-365) resets pendingPatch before the request and swallows the rejection. There is no retry anywhere (grep 'retry' in client/src finds only EnvSetup/PlayerView). track() (127-138) sets 'saved' whenever inflight reaches 0, so a later success hides an earlier failure. Optimistic updates have no rollback: setMapView (~464), setOutlineKind/Style (326-333), the drag commit (667-668). Live repro on clone 132 with page.route PATCH /api/atlas/nodes/1407 answering 5…

### B006 · Node DM notes go stale in the workspace: saveNode merges snake_case `dm_note` into camelCase node state, so reselecting shows the old note and typing overwrites it

Broken · high · effort s · found by `confusing-code` (+1 other lane)

- **Where:** Atlas workspace › Edit › Inspector › 🔒 DM notes (and Reveal); client/src/pages/AtlasWorkspace.jsx:354-372
- **Files:** `client/src/pages/AtlasWorkspace.jsx:354`, `client/src/pages/AtlasWorkspace.jsx:366`, `client/src/pages/AtlasWorkspace.jsx:1818`, `client/src/pages/AtlasWorkspace.jsx:1880`, `client/src/pages/AtlasWorkspace.jsx:1887`, `client/src/pages/AtlasWorkspace.jsx:1387`, `client/src/pages/AtlasWorkspace.jsx:1966`, `server/routes/atlas.js:310`
- **What happens:** Inspector writes onSave(n.id, { dm_note }) (AtlasWorkspace.jsx:1880, 1887). saveNode → localPatchNode (354-356) spreads that patch into p.node verbatim, so the local node gains a `dm_note` key while `dmNote` (the key the map payload uses, atlas.js:310, and every reader uses) keeps the old value. Nothing refetches the map after a node patch (flushSave 360-365 only PATCHes). Results: (a) deselect and reselect the node → Inspector remounts with note = p.node.dmNote (1818), i.e. the OLD note; the next keystroke saves old+typed over the new note on the server; (b) switch to 👁 View → the reader shows the old note (1387-1388); (c) after 👁 Reveal (1884-1888) View shows the secret both in the body and still in the 🔒 DM notes box, and reselecting brings the Reveal button back with the old secret. The pinSize double-send at 1966-1968 (`{ pin_size: v, pinSize: v }`, with a comment admitting the mismatch) shows the same bug was patched for one field only; map notes (1461) set camelCase correctly.
- **Why it matters:** Local state and server stay in step; reselecting a node shows what was just typed.
- **Fix:** Make saveNode take camelCase keys only and translate at the service boundary (atlasService.patchNode maps dmNote→dm_note, pinSize→pin_size, imageId→image_id), or give localPatchNode a snake→camel key map. Change Inspector calls at AtlasWorkspace.jsx:1880/1887/1968 to camelCase and delete the pinSize double-send.
- **Repro:** Code trace (code lane, no browser): Edit posture → select a pin → type 'secret' in 🔒 DM notes → wait 1s → click empty map → click the same pin: textarea shows the previous note (empty). Type one character → server note becomes that character. Confirm in browser before fixing.
- **Evidence:** grep -n 'dmNote\|dm_note' client/src/pages/AtlasWorkspace.jsx → only 1461 writes dmNote locally; 1880/1887 write dm_note; no polling/refresh after patchNode.
- **Re-proved:** Code: localPatchNode (AtlasWorkspace.jsx:354-356) spreads the patch into p.node as-is. The Inspector sends { dm_note } (1880) and { body, dm_note:'' } on Reveal (1887). The Inspector is mounted with key={sel.id} (1481) and seeds note from p.node.dmNote (1818). The map payload uses camelCase dmNote (atlas.js:310). The only other readers are the View reader (1387-1388) and map notes (1461, which correctly writes camelCase dmNote). The pinSize double-send and its comment are at 1966-1968. Nothing …
- **Also found as:** "DM note goes blank after reselecting a node; typing again overwrites the saved …" (inspector)

### B024 · When the session expires mid-edit, http.js hard-navigates to /login and throws away the edit that triggered it, with no message

Broken · medium · effort m · found by `resilience`

- **Where:** Atlas › any save while the token is dead. client/src/services/http.js:26-38; server/utils/token.js:11 (24h TTL), refreshed only in GET /api/auth/me (server/routes/auth.js:347)
- **Files:** `client/src/services/http.js:35`, `server/utils/token.js:27`, `server/routes/auth.js:347`
- **What happens:** With PATCH /nodes answering 403 {message:'Token expired'}, I typed a description and DM note. The page did a full navigation (window.location.href='/login'). The inspector and typed text were gone and the server kept the old body. The login page has no 'your session ended' text. The token only slides forward when the app reloads (/me is the only caller of refreshIfStale). A workspace tab left open past the 24 h TTL meets this on its next save.
- **Why it matters:** The DM is told the session ended, and their unsaved edits survive sign-in.
- **Fix:** In http.js, don't set window.location.href directly. Emit an 'auth-expired' event. The workspace saves pendingPatch and blur fields to localStorage ('atlas_unsaved'), shows a banner with a sign-in link, and re-applies the saved edits after login. Also slide the session on every authed request: have authenticateToken call refreshIfStale and return an X-Refreshed-Token header that the http.js response interceptor stores.
- **Repro:** lanes/resilience/s9.mjs (route PATCH nodes → 403 Token expired). In real use the token is also removed, so the user lands on the Login form.
- **Evidence:** s9: '403 PATCH /api/atlas/nodes/1161'; after 3 s the page had reloaded (no inspector); 'server body "body after failure"' (typed text not saved)
- **Re-proved:** Code: in client/src/services/http.js:31-36, a 401, or a 403 whose message matches /token|access token|user not found/i, on any non-credential URL removes auth_token and user and then sets window.location.href='/login'. server/middleware/auth.js:44-45 answers an expired JWT with 403 {message:'Token expired'}, which that regex matches. Nothing saves the pending patch before the navigation: grep finds no beforeunload and no 'atlas_unsaved' in client/src. Login.jsx has no session-ended text (grep f…

### B027 · Two tabs on the same node overwrite each other silently: the inspector never refreshes, and Reveal in a stale tab wipes the other tab's description

Broken · medium · effort m · found by `resilience`

- **Where:** Atlas › Edit › inspector in two tabs/windows. AtlasWorkspace.jsx:1816-1823 (inspector state seeded once), 1884-1888 (Reveal merge)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1816`, `client/src/pages/AtlasWorkspace.jsx:1884`
- **What happens:** Tab A set U1's description to 'body typed in tab A'. Tab B still showed 'original body', typed a DM note and clicked 'Reveal — move into the description'. The server body became 'original body\n\nnote typed in tab B', and A's text was gone with no notice. A node created elsewhere never appeared in tab B (no refresh or poll). Editing a node deleted in the other tab gave a 'Node not found' toast while its pin stayed on screen.
- **Why it matters:** A stale editor either refreshes or warns before overwriting.
- **Fix:** Refetch the map on window focus/visibilitychange. Send the node's updated_at with PATCH and have the server answer 409 when it is stale, so the client can show 'changed elsewhere — reload?'. At least make Reveal send only the note and let the server append it to the current body.
- **Repro:** lanes/resilience/s8.mjs (two pages in one context).
- **Evidence:** s8: 'B inspector body still shows: "original body"', 'server after B Reveal: body= "original body\n\nnote typed in tab B"', 'B sees node created elsewhere after 4s: 0'
- **Re-proved:** The Inspector (AtlasWorkspace.jsx:1815) seeds title/body/note/line/start/end with useState from p.node once, at lines 1816-1823. It is mounted with key={sel.id} (line 1481), so later map refreshes never reseed it. The Reveal handler (lines 1884-1888, merge built at 1885) builds `merged` from the LOCAL `body` state plus the note and sends onSave(n.id, { body: merged, dm_note: '' }). That overwrites whatever body is on the server. The PATCH /nodes/:id route (server/routes/atlas.js:494-501) writes…

### B028 · Node autosave and lifespan autosave share one timer; the unmount flush also cancels a pending lifespan save (live proof)

Broken · medium · effort s · found by `resilience` (+5 other lanes)

- **Where:** Atlas › Edit › inspector Title/Description/category + Time › Lifespan. AtlasWorkspace.jsx:366-373 (saveNode), 633-638 (setLifespan)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:366`, `client/src/pages/AtlasWorkspace.jsx:633`, `client/src/pages/AtlasWorkspace.jsx:373`
- **What happens:** Three cases lost data while the chip said '✓ Saved'. (A) I typed a title, then within 500 ms a lifespan 'from'. The title never went out until a later edit flushed it (server still 'Your first node'). (B) I set lifespan from=5, then within 500 ms clicked a category. The lifespan was lost (server kept 3). (C) New case: I typed lifespan from=7 and clicked 'Exit' at once. start stayed null, because the unmount cleanup clears saveTimer but flushSave only knows pendingPatch. (The code-read lane reported the shared timer; this adds the Exit/Archive path and the live GET-backs.)
- **Why it matters:** Every edit reaches the server regardless of order or navigation.
- **Fix:** Give setLifespan its own timer and pending payload per placement (or fold it into a pendingPlacementPatch flushed by the same flush function). Flush both in the unmount cleanup and before navigation.
- **Repro:** lanes/resilience/s1.mjs (A, B) and s17.mjs step 3; GET /api/atlas/maps/359 placement 1285.
- **Evidence:** s1: 'A: server title= Your first node start= 3 chip= ✓ Saved', 'B: ... start= 3 cat= place chip= ✓ Saved'; s17: '3 lifespan then Exit: start = null'
- **Re-proved:** Code: setLifespan (actually AtlasWorkspace.jsx:630-635, not 633-638) does clearTimeout(saveTimer.current) on the same timer that saveNode (366-372) uses. onCat is saveNode (1482). The unmount cleanup (373) clears the timer, but flushSave only knows pendingPatch. Live on clone 132, placement 1540. (A) Title 'V-A-title' followed at once by lifespan from=4 left the server title at 'Your first node', start=4 and the chip at '✓ Saved'. (B) from=5 followed at once by a category click left start at 4 …
- **Also found as:** "Node autosave and lifespan autosave share one timer and cancel each other: a li…" (client-dead); "Lifespan edits and node-field edits cancel each other's debounced save, while t…" (inspector); "Lifespan edits and node edits share one save timer: one silently cancels the ot…" (journey); "Lifespan edits and node edits share one debounce timer, so one cancels the othe…" (confusing-code); "Lifespan edits share the node autosave timer; a lifespan and a title/body edit …" (time)

### B029 · Map loads can arrive out of order: the URL and tree show one map, the canvas shows another, and '+ Add node' writes to the hidden one

Broken · medium · effort s · found by `resilience`

- **Where:** Atlas › Edit › Maps tree / crumbs on a slow connection. AtlasWorkspace.jsx:156-169 (loadMap has no staleness guard)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:156`
- **What happens:** From 'The Keep — Inside' I clicked 'The Sunken Keep' (GET delayed 4 s), then 'Chest contents' right away. After both loaded, the URL was /m/361 and the tree highlighted 'Chest contents'. But the canvas, crumb and 'This space' panel showed The Sunken Keep with its 9 pins, because the slower response landed last. '+ Add node' then a click on that canvas created a node on the Chest contents list (2 → 3), invisible to the DM. The root map stayed at 10.
- **Why it matters:** Only the response for the current mapId is applied.
- **Fix:** In loadMap, capture the requested mapId and drop the result if it no longer matches the current one (a ref updated in the [mapId] effect), or cancel the previous request with an AbortController.
- **Repro:** lanes/resilience/s15.mjs step 1/1b (page.route delays GET /api/atlas/maps/359 by 4 s).
- **Evidence:** s15: '1 url …/m/361 crumb here = "The Sunken Keep" listview= 0 map pins= 9 space title= "The Sunken Keep"', '1b add node while mismatched: list 2 -> 3 root 10 -> 10'; screenshot lanes/resilience/shots/s15-race.png
- **Re-proved:** Code: in AtlasWorkspace.jsx:156-169, loadMap takes mapId from its closure and its .then runs setData(d) with no check that the response still matches the current mapId. The [mapId] effect (206-216) calls loadMap(true) on every change and never cancels. dropNode (305) posts to the URL's mapId, not data.map.id. Reproduced independently on my own clone 134 (from 27), with GET /api/atlas/maps/429 (root) delayed 4 s, clicking the tree's 'The Sunken Keep' and then 'Chest contents' 250 ms later. Resul…

### B030 · Map notes and other save-on-blur fields are lost on reload, browser Back or tab close; there is no beforeunload guard

Broken · medium · effort m · found by `resilience` (+2 other lanes)

- **Where:** Atlas › Edit › nothing selected › '🔒 Map notes' textarea (AtlasWorkspace.jsx:1455-1463); also period text/range (1936-1944), era fields (1793-1799), timed-backdrop ranges (1620-1624), link label (1997-2008), voice style (1909-1912)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1455`, `client/src/pages/AtlasWorkspace.jsx:1936`, `client/src/pages/AtlasWorkspace.jsx:1793`, `client/src/pages/AtlasWorkspace.jsx:373`
- **What happens:** Map notes save only in onBlur. I typed map notes and pressed F5 after 1 s: dmNote null on the server. I typed map notes on 'The Keep — Inside' and pressed browser Back after 0.8 s: dmNote null (the textarea is re-keyed, so no blur fires). Clicking a tree row, a crumb or double-clicking a pin does save, because those blur first. Debounced inspector fields have the same gap: a title typed 150 ms before a reload was lost. Nothing in the code listens for beforeunload or pagehide.
- **Why it matters:** Anything typed is saved or at least kept. Leaving the page with unsaved text should flush it or warn.
- **Fix:** Save map notes through the same debounced, track()ed path as saveNode (patchMap after 500 ms of idle). Do the same for fact/era/backdrop inputs, or commit them on change. Add a window 'beforeunload' / 'pagehide' handler that runs flushSave and any pending blur values with fetch keepalive, and calls preventDefault while inflight>0 or a patch is pending.
- **Repro:** lanes/resilience/s2.mjs steps 1 and 3; s1.mjs scenario C.
- **Evidence:** s2: '1 reload: root dmNote = null', '3 back: inside dmNote = null'; s1: 'C: after reload server title= A-title-edit' (the typed 'C-before-reload' was lost)
- **Re-proved:** Code: the map notes textarea (AtlasWorkspace.jsx:1455-1463) is keyed by map?.id and saves only in onBlur. The other onBlur-only saves are at 1621/1624 (backdrop ranges), 1794-1799 (era fields), 1912 (voice style), 1937-1944 (fact/period fields) and 2003 (link label). grep 'beforeunload|pagehide|keepalive' in client/src finds nothing. The unmount flush (373) only runs on a React unmount, never on a reload. Live on clone 132: I typed map notes and pressed F5 after 1 s, and the root dmNote was nul…
- **Also found as:** "Period text saves only on blur: typing and then reloading or closing the tab lo…" (inspector); "Edits made within 500ms of a reload or tab close are lost: autosave has no flus…" (inspector)

### B032 · Double clicks and slow networks create duplicates: '＋ Next session' makes two 'Session 1' eras, Add node makes two nodes, 'Story for a period' makes two facts

Broken · medium · effort s · found by `resilience` (+1 other lane)

- **Where:** Atlas › timebar ⚙ › '＋ Next session' (AtlasWorkspace.jsx:578-589); toolbar '＋ Add node' + map click (305-309, 838-847); inspector '＋ Story for a period' (387-389)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:578`, `client/src/pages/AtlasWorkspace.jsx:305`, `client/src/pages/AtlasWorkspace.jsx:838`, `client/src/pages/AtlasWorkspace.jsx:387`
- **What happens:** Double-clicking '＋ Next session' created eras 316 and 317, both 'Session 1 [21-30]'. With POST /maps/:id/nodes delayed 2.5 s, placing mode stayed on while the first request ran, so a second map click created a second node (6 → 8). Double-clicking '＋ Story for a period' created 2 facts (1 → 3). None of these buttons disable while their request runs. nextSession also bypasses track(), so the chip shows nothing.
- **Why it matters:** One click gives one thing. Busy buttons disable, and placing mode ends on the first drop.
- **Fix:** Add a busy ref/state to nextSession, factAdd, eraAdd and dropNode that ignores re-entry and disables the button. Call setPlacing(null) before awaiting dropNode/placeExisting in onWorldClick. Derive the next session number from the highest existing 'Session N', not a count.
- **Repro:** lanes/resilience/s6.mjs; GET /api/atlas/worlds/111 (eras) and /api/atlas/nodes/1188 (facts).
- **Evidence:** s6: '1 eras after dblclick [... 316:Session 1[21-30], 317:Session 1[21-30]]', '2 placements before 6 after 8', '3 facts before 1 after dblclick 3'; screenshot lanes/resilience/shots/s6-nextsession.png
- **Re-proved:** Code: nextSession (AtlasWorkspace.jsx:578-589) reads world.eras from state, which only refreshes after the awaits. It has no busy guard and calls atlasService.addEra directly without track(). The '＋ Next session' button (1807) is never disabled. dropNode (305-309) only calls setPlacing(null) after awaiting the POST and refreshMap, and onWorldClick (838-847) has no re-entry guard. factAdd (387-389), wired to the '＋ Story for a period' button at 1947, has no guard either. The server's POST /world…
- **Also found as:** "Double-clicking the map in 'Add node' placing mode creates two stacked 'New nod…" (canvas)

### B035 · Every local edit refetches GET /worlds/:id/trail: one request per animation frame while dragging a pin, and one per keystroke

Broken · medium · effort s · found by `client-dead`

- **Where:** client/src/pages/AtlasWorkspace.jsx:219-222 (trail effect)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:219`, `client/src/pages/AtlasWorkspace.jsx:222`, `client/src/pages/AtlasWorkspace.jsx:648-654`, `client/src/pages/AtlasWorkspace.jsx:354-356`, `client/src/pages/AtlasWorkspace.jsx:366-367`, `server/server.js:79`
- **What happens:** The effect `useEffect(() => { atlasService.getTrail(worldId).then(setTrail) }, [worldId, data])` depends on the whole `data` object. `data` gets a new reference on every local change: onDragMove's rAF calls setData once per frame (648-654), saveNode→localPatchNode calls setData on every keystroke in Title, Description and DM notes, and on every tick of the pin-size slider. So one GET /api/atlas/worlds/:id/trail goes out per frame while dragging and per keystroke while typing.
- **Why it matters:** The trail should be fetched when the map loads, or after writes that can move party footsteps. /api/atlas has a 6000 per 15 min bucket (server.js:79). About 100 s of dragging, or a few thousand typed characters, can use it up, and then the DM's saves start getting 429.
- **Fix:** Stop depending on `data`. Call atlasService.getTrail inside loadMap's .then, which runs after the map loads and on refreshMap. Or depend on `mapId` plus a `trailTick` counter bumped after addNode, placeExisting, removeFromMap, setLifespan, undo and forgeRefresh.
- **Repro:** Code path: drag any pin in Edit posture. Every rAF frame runs setData(prev => ({...prev, placements: ...})) at line 653, which makes a new `data`, which fires the effect at 219, which calls GET /trail. The same happens for each character typed in the inspector Title field (onSave → saveNode → localPatchNode → setData).
- **Re-proved:** The code is as described. AtlasWorkspace.jsx:219-222 is `useEffect(() => { ... atlasService.getTrail(worldId).then(setTrail) }, [worldId, data])`. The rAF in onDragMove calls setData once per frame (line 653). Each Title keystroke goes Inspector onChange (1830) → saveNode → localPatchNode → setData (354). The pin-size slider (1968) takes the same path. I reproduced it live on my own clone of world 30 (world 53, since deleted), counting requests to /api/atlas/worlds/:id/trail. Typing 10 characte…

### B058 · Double-clicking '＋ Interior map' creates two interiors; the extra one is a phantom map that can't be removed

Broken · medium · effort s · found by `maps`

- **Where:** The title and observed text should say the phantom map can't be removed by 'Remove interior' (it only targets nodes.interior_map_id). It disappears only when the owner node is deleted (schema.sql:157, owner_node_id ON DELETE CASCADE). The rest, including the cited lines AtlasWorkspace.jsx:381-385 and 1853-1854 and atlas.js:511-522, is accurate.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:381-385`, `client/src/pages/AtlasWorkspace.jsx:1853-1854`, `server/routes/atlas.js:511-522`
- **What happens:** A double-click on '＋ Interior map' for 'Your first node' created maps 126 and 127, both owned by node 337. The node points at 127, and the tree listed 'Your first node' twice. After 'Remove interior' (DELETE /nodes/337/interior), 127 was deleted but 126 stayed in the tree as a child of the root, while the node reported hasInterior:false. The UI can't remove 126 (Remove interior only targets nodes.interior_map_id). The button doesn't disable while the request is in flight, and the server's 'idempotent' check is a read-then-insert with no lock.
- **Why it matters:** One click or many, a node gets exactly one interior.
- **Fix:** Client: disable the ＋ buttons while createInteriorAs is running. Server: in POST /nodes/:id/interior, do SELECT … FOR UPDATE inside a transaction, or set the new map with a single UPDATE nodes SET interior_map_id=$1 WHERE id=$2 AND interior_map_id IS NULL RETURNING and delete the new map if no row came back. Add a partial unique index on maps(owner_node_id).
- **Repro:** /w/38/m/112 › select a node with no interior › double-click '＋ Interior map'. GET /api/atlas/worlds/38/maps shows two maps with the same ownerNodeId.
- **Evidence:** t16 output: maps [[126,"Your first node",337,112],[127,"Your first node",337,112]]; t16b: after remove interior, 126 remains, node 337 interior null; lanes/maps/shots/31-dbl-interior.png
- **Re-proved:** Code: the '＋ Interior map' and '＋ List' buttons (AtlasWorkspace.jsx:1853-1854) are never disabled, and createInteriorAs (381-385) has no in-flight guard. POST /nodes/:id/interior (atlas.js:511-522) reads interior_map_id, then INSERTs and UPDATEs with no lock or transaction. Reproduced on clone 74: a Playwright dblclick on '＋ Interior map' for 'Your first node' (791) created maps 250 and 251, both with ownerNodeId 791. The tree listed 'Your first node' twice. After ✕ → Remove interior, 251 was d… _(partly — the corrected location is used above)_

### B067 · Typing map notes while a map is loading throws 'Cannot read properties of undefined (reading id)' and the text is discarded

Broken · low · effort xs · found by `resilience`

- **Where:** Atlas › Edit › nothing selected › space panel during a map load. AtlasWorkspace.jsx:1455-1463
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1455`, `client/src/pages/AtlasWorkspace.jsx:1460`
- **What happens:** While a map loads, the space panel renders with data=null. It shows an empty title, 'No art yet — this space is a blank plane.', a live 'Set a backdrop image…' button and an editable map-notes box. I typed into the box and blurred it before the load finished. The page threw 'Cannot read properties of undefined (reading 'id')' from atlasService.patchMap(map.id…). After the load the box was empty and dmNote stayed null.
- **Why it matters:** No editable controls until the map is loaded, and no claim that the space has no art while it is still loading.
- **Fix:** Render the space panel only when data is loaded (show a skeleton or the 'Opening…' state instead), and guard map?.id in the onBlur.
- **Repro:** lanes/resilience/s21.mjs (GET /maps/360 delayed 5 s) and s20.mjs (mid-load screenshot).
- **Evidence:** s21: pageErrors ["Cannot read properties of undefined (reading 'id')"], 'after load: textarea= "" server dmNote= null'; screenshot lanes/resilience/shots/s20-midload.png
- **Re-proved:** Code: the space panel (AtlasWorkspace.jsx:1423ff) renders whenever nothing is selected, including while data is null (map = data?.map, line 267). The textarea at 1455 has key={map?.id}, and its onBlur at 1460 calls atlasService.patchMap(map.id, …) with no guard. Live on my clone, with GET /api/atlas/maps/434 delayed 6 s: mid-load the inspector read 'THIS SPACE ✎ … No art yet — this space is a blank plane. 🖼 Set a backdrop image… 🕓 Backdrops over time… 🎯 Focus period… 🔒 MAP NOTES'. I filled …

### B069 · Timebar footstep ticks lag one edit behind after a lifespan change

Broken · low · effort xs · found by `journey`

- **Where:** Atlas › timebar footstep ticks; AtlasWorkspace.jsx:219-222, 633-638
- **Files:** `client/src/pages/AtlasWorkspace.jsx:219`, `client/src/pages/AtlasWorkspace.jsx:633`
- **What happens:** The trail refetch runs on every data change, which fires on the first keystroke in a lifespan field, 500 ms before the debounced PATCH lands. After giving the Party's new Great Hall footstep the lifespan 38→41, the timebar still showed only 2 ticks. The third tick ('… — The Great Hall') appeared only after a reload.
- **Why it matters:** A new footstep's tick appears as soon as its lifespan is saved.
- **Fix:** Refetch getTrail in the .then of the lifespan patchPlacement (and after placeExisting/deletePlacement for party nodes) instead of on every data change.
- **Repro:** World 35 › place The Party on a new interior › type from 38, to 41 › count .timebar .tstep → 2. Reload → 3. Scripts: lanes/journey/s7.mjs then s11.mjs
- **Evidence:** s7: 'trail: [[…],[…],["The Great Hall",38,41]]' from the API but only 'tick 0', 'tick 1' in the DOM; s11 after reload: 'tick 2: … The Great Hall'
- **Re-proved:** Reproduced on my own clone of world 30 (world 64, since deleted). On map 211 I selected The Party (placement 777, lifespan 30→39) and filled 'from' with 33. The network log showed GET /trail 23 ms after the keystroke, PATCH /placements/777 at +521 ms, and no trail refetch after the PATCH. Three seconds later the ticks still read 'Session 5 · footstep 1 — The Keep — Inside @68.97%', the old start 30, while GET /trail already returned start 33. After a reload the tick read 'footstep 4 … @79.31%'.…

### C034 · The comment says every write goes through track() so the save chip is honest, but map notes, lantern, voice, ambience and '＋ Next session' bypass it

Confusing · low · effort s · found by `client-dead` (+2 other lanes)

- **Where:** Atlas › Edit header save chip; client/src/pages/AtlasWorkspace.jsx:125-126
- **Files:** `client/src/pages/AtlasWorkspace.jsx:125-126`, `client/src/pages/AtlasWorkspace.jsx:1457-1463`, `client/src/pages/AtlasWorkspace.jsx:208-217`, `client/src/pages/AtlasWorkspace.jsx:179-198`, `client/src/pages/AtlasWorkspace.jsx:578-589`
- **What happens:** These call the service directly, so the header chip never shows 'Saving…' or '⚠ Not saved' for them: the Map notes textarea onBlur (1460), toggleSpotlight (210), setNodeVoice, sayLine and clearLine (179-190), setAmbience and clearAmbience (191-198), and nextSession's addEra + patchWorld (584-585). Blurring the map notes field gives no save feedback at all unless it fails.
- **Why it matters:** Either every write goes through track(), or the comment says which ones don't.
- **Fix:** Wrap those calls in track(promise, failMsg), which already raises the error toast, and drop their ad-hoc .catch flashes.
- **Repro:** grep -nE 'atlasService\.|voiceService\.' client/src/pages/AtlasWorkspace.jsx | grep -v track(
- **Re-proved:** The comment at AtlasWorkspace.jsx:125-126 reads 'every write goes through track(), so the header chip is honest'. Running grep -nE 'atlasService\.|voiceService\.' | grep -v 'track(' and reading each hit shows these writes bypass track(): voiceService.setVoice (180), sayLine (184), clearLine (188), setAmbience (192), clearAmbience (196); atlasService.clearSpotlight/setSpotlight in toggleSpotlight (210); atlasService.addEra (584) and patchWorld (585) in nextSession; and atlasService.patchMap for …
- **Also found as:** "The 'save chip is honest' comment is false: several writes bypass track()" (journey); "Comment says every write goes through track() so the Saved chip is honest; map …" (confusing-code)

### P063 · A save that never answers leaves the chip on 'Saving…' forever: http.js has no timeout

Product polish · low · effort xs · found by `resilience`

- **Where:** Header save chip. client/src/services/http.js:7
- **Files:** `client/src/services/http.js:7`
- **What happens:** With PATCH /nodes held open, the chip read 'Saving…' at +2 s, +10 s and +25 s, with no toast. The shared axios instance sets no timeout, so a stalled request on venue Wi-Fi never resolves or reports.
- **Why it matters:** Normal writes time out (for example after 20 s) and surface as a retryable failure.
- **Fix:** Set timeout: 20000 on the http instance (Forge/voice already pass their own long timeouts per call) and let track() show the failure with a retry.
- **Repro:** lanes/resilience/s15.mjs step 2.
- **Evidence:** s15: '2 hang +2s chip= Saving… flash= 0', '+10s chip= Saving…', '+25s chip= Saving… flash= 0'
- **Re-proved:** client/src/services/http.js:7 is `axios.create({ headers: { 'Content-Type': 'application/json' } })` with no timeout. A grep of client/src for `defaults.`, `AbortController` and `signal:` finds nothing, so no global timeout or abort is set anywhere else. The only timeouts in the client are per-call: forgeService.js:8 (600000) and voiceService.js:6 (180000). atlasService.js imports this instance and patchNode (line 30) passes no config. track() (AtlasWorkspace.jsx:127-138) sets 'saving' and only…

### P080 · Map notes save outside the save indicator, so the DM never sees 'Saving…' or '⚠ Not saved' for them

Product polish · low · effort xs · found by `maps`

- **Where:** Same gap at AtlasWorkspace.jsx:179-182 (setNodeVoice, used by the voice select at 1898 and the voice-style blur at 1912). Map notes are not the only autosaving field outside the save chip. Wrap both in track().
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1457-1463`
- **What happens:** Map notes save correctly on blur, including when the DM clicks a pin straight after typing (verified with GET). But the call bypasses track(), so the top-bar chip never changes: savechip was null after saving. Every other field shows the chip.
- **Why it matters:** Map notes use the same save indicator as the rest of the workspace.
- **Fix:** Wrap the patchMap call in track(…, "Couldn't save the map notes") and drop the separate catch/flash.
- **Repro:** /w/38/m/113 › type in Map notes › click outside the box. The top bar shows no Saving…/✓ Saved.
- **Evidence:** t8 output '2 after blur, server note = "Interior notes KEEP" savechip null'
- **Re-proved:** Core confirmed. - Code: the map-notes textarea onBlur (AtlasWorkspace.jsx:1457-1463) calls atlasService.patchMap directly, not through track(), so setSave is never touched. - Live on my clone (world 77): I typed in textarea.mapnotes and clicked away. Polling .savechip every 100 ms for 2 s saw only null, and GET returned dmNote 'verify b4 notes', so the save worked. - The chip is also sticky: setSave only ever goes to saving, saved or err (129-134). An earlier '⚠ Not saved' stays up while notes … _(partly — the corrected location is used above)_

