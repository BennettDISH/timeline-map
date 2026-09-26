# WP-12 · Confirm before destroying

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Give every one-click destructive control a confirm or an undo, using one shared pattern.

**Do after:** [WP-02](WP-02-protect-the-live-campaign-data-undo-clone-and-ba.md)

**Notes:** Prefer undo where tombstones exist (WP-02 makes undo reliable), and use a confirm where there are none. Regenerate and Turn off on the share link must confirm, because they break every player's link mid-session. Build one confirm modal; WP-18 then makes it a proper dialog. Forge Unmake (forge-voice-14) and the paid voice line (forge-voice-16) are handled in WP-06.

## Checklist

- [x] **P012** · medium · m · Many destructive one-click controls skip both the confirm and the undo system (outline, period text, era, backdrops, image, link, voice line, share link, Forge Unmake) — done 7ff296a (tombstones for facts, links, eras and timed backdrops; local undo for the base backdrop, node image and outlines; two-click share breaking; ambience ✕ asks; voice ✕ and Unmake done in WP-06; Disable timeline already asked)
- [x] **P013** · medium · s · Regenerate and Turn off kill every player's link in one click with no confirmation and no feedback — done 7ff296a (the button asks for 4 s, then acts, then the toast says what happened)
- [x] **P015** · medium · s · Small ✕ buttons delete a period's text or a link (with its label) at once, with no confirm and no undo — done 7ff296a
- [x] **P050** · low · s · '✕ Remove outline' and '◌ Redraw' throw away a traced outline with no confirm and no Undo — done 7ff296a (the old ring, kind and style come back from the toast)
- [x] **P055** · low · s · Removing a timed backdrop or the base backdrop happens instantly, with no confirmation and no undo — done 7ff296a
- [x] **P059** · low · s · Deleting an era is one click with no confirmation and no Undo — done 7ff296a

## Items

### P012 · Many destructive one-click controls skip both the confirm and the undo system (outline, period text, era, backdrops, image, link, voice line, share link, Forge Unmake)

Product polish · medium · effort m · found by `resilience` (+1 other lane)

- **Where:** Atlas › Edit › inspector, timeline ⚙, Map ▾, Share popover, Forge cards
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2034`, `client/src/pages/AtlasWorkspace.jsx:1941`, `client/src/pages/AtlasWorkspace.jsx:1803`, `client/src/pages/AtlasWorkspace.jsx:1144`, `client/src/pages/AtlasWorkspace.jsx:1625`, `client/src/pages/AtlasWorkspace.jsx:1957`, `client/src/pages/AtlasWorkspace.jsx:2013`, `client/src/pages/AtlasWorkspace.jsx:1926`, `client/src/pages/AtlasWorkspace.jsx:1473`, `client/src/pages/AtlasWorkspace.jsx:975`, `client/src/pages/AtlasWorkspace.jsx:2295`
- **What happens:** Only node delete, remove-from-map and remove-interior create tombstones. Clicked live: '✕ Remove outline' erased the traced shape (server shape null), '✕ Remove this period's text' removed the fact, and '✕ Delete this era' removed the era. Each took one click, with no modal and no undo toast. Same pattern in code: Remove the backdrop (1144), ✕ timed backdrop (1625), image Remove (1957), ✕ link (2013), ✕ voice line (1926, a paid generation), ✕ ambience (1473, paid), Share 'Regenerate'/'Turn off' (975-976, breaks every player's link), 'Disable timeline' (1810), and Forge 'Unmake' (2295, deletes the whole batch and its R2 images, next to 'Keep').
- **Why it matters:** Destructive acts are undoable, or at least confirmed when they can't be undone, the way node delete is.
- **Fix:** Extend tombstone() to kinds 'outline', 'fact', 'era', 'backdrop', 'link' (snapshot the row, restore in POST /undo/:id) and show the undo toast for them. Confirm before Share Regenerate/Turn off, voice/ambience ✕, Unmake and Disable timeline.
- **Repro:** lanes/resilience/s18.mjs (outline, period text, era); the rest by reading the listed lines.
- **Evidence:** s18: '1 remove outline: modal= 0 toast= null undo btn= 0 server shape= null', '2 remove period text: rows 4 -> 3 modal= 0 undo btn= 0', '3 delete era: rows 5 -> 4 modal= 0 undo btn= 0'
- **Re-proved:** Read every cited line in client/src/pages/AtlasWorkspace.jsx. Each is a single onClick that goes straight to the service, with no confirm or modal, and none of them is followed by an undoId toast: 975 Regenerate→shareOn (617), 976 Turn off→shareOff (619), 1144 Remove the backdrop→setBackdrop(null) (433), 1473 ambience ✕→clearAmbience (196), 1625 timed backdrop ✕→deleteBackdrop (460), 1803 era ✕→eraDelete (575), 1810 Disable timeline→disableTimeline (609), 1926 voice ✕→clearLine (188), 1941 fact…
- **Also found as:** "One-click destructive controls with no confirm and no undo: share link off/rege…" (copy)

### P013 · Regenerate and Turn off kill every player's link in one click with no confirmation and no feedback

Product polish · medium · effort s · found by `postures-share` (+1 other lane)

- **Where:** Edit › 🔗 Share popover › Regenerate / Turn off (AtlasWorkspace.jsx:975-976)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:616-620`, `client/src/pages/AtlasWorkspace.jsx:970-986`
- **What happens:** Regenerate (warning only in its tooltip) and Turn off (danger-coloured) act on the first click. No dialog or inline confirm appeared (0 dialogs captured), and no toast followed (.aflash null). The URL text silently changes (Regenerate), or the popover flips back to 'Create share link' (Turn off). I checked that the old links really die: /api/share/<old>/world, maps, nodes, locate and marker POST all 404, and an open player tab turns into 'This link isn't active' on its next refresh. Turning the link back on mints a new token, so an accidental click can't be undone. The table has to be sent a new link.
- **Why it matters:** A destructive, irreversible action that affects the whole table should ask first and say what happened ('New link made — the old one no longer works; send this one to your players').
- **Fix:** Add an inline two-step confirm in the popover (e.g. the button becomes 'Really? Players' current link stops working' for 4 s), then setFlash with the outcome after shareOn/shareOff resolve. Tell the two cases apart: shareOn with an existing token is a rotation.
- **Repro:** Run b6.mjs: open the Share popover in Edit, click Regenerate, then Turn off. dialogs [], flashAfterRegen null, flashAfterOff null, and oldTabAfterRegen shows the dead-link page.
- **Evidence:** b6.json dialogsAfterRegen [], flashAfterRegen null, dialogsAfterOff [], flashAfterOff null, oldTabAfterRegen 'This link isn't active…'; rotate.mjs: 'old after rotate: world 404 map 404 node 404 locate 404'
- **Re-proved:** Code: in client/src/pages/AtlasWorkspace.jsx, shareOn and shareOff (lines 616-620) only call track(...) and update state. They show no confirm and never call setFlash on success. The Regenerate and Turn off buttons are at lines 975-976, and Regenerate's warning is only in its title attribute. On the server, POST /worlds/:id/share (server/routes/atlas.js:101-107) always mints a fresh token, so recreating a link can't bring the old one back. Live, on my own clone of world 30 (id 141, now deleted)…
- **Also found as:** "Table-breaking share actions and era deletes happen instantly, with no confirm …" (journey)

### P015 · Small ✕ buttons delete a period's text or a link (with its label) at once, with no confirm and no undo

Product polish · medium · effort s · found by `inspector`

- **Where:** Inspector › '✕ Remove this period's text' and '✕ Remove link' (AtlasWorkspace.jsx:1941, 2013; removeLink 285-288, factDelete 392-393)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1941`, `client/src/pages/AtlasWorkspace.jsx:2013`, `server/routes/atlas.js:448`, `server/routes/atlas.js:747`
- **What happens:** Clicking the ✕ next to a period's To field deleted the fact at once: no dialog, no flash, no Undo, and the text was gone (GET facts []). Link ✕ also deleted at once with no feedback, losing the label. Node delete, remove-from-map and remove-interior all get Undo.
- **Why it matters:** Destructive clicks are undoable like the rest of the inspector, or at least confirmed.
- **Fix:** Tombstone facts and links in DELETE /facts/:id and DELETE /links/:id (kinds 'fact' / 'link'), return undoId, and have factDelete/removeLink setFlash with undoId. Undo handles the new kinds in atlas.js:606+.
- **Repro:** Select a node with a period, click its ✕, then GET /api/atlas/nodes/:id (lanes/inspector/s5.mjs F5; s6.mjs L9).
- **Evidence:** s5: 'F5 facts after ✕: [] flash: none'; s6: 'L9 links out after removing: [] flash: none'
- **Re-proved:** Code: the fact ✕ (AtlasWorkspace.jsx:1941) calls factDelete (392-393) and the link ✕ (2013) calls removeLink (285-288). Both are plain track(delete) calls with no setFlash, no confirm and no undoId. Server: DELETE /facts/:id (atlas.js:448-453) and DELETE /links/:id (747-752) hard-delete with no tombstone() call. Tombstones exist only for interior, node and placement (538, 563, 696). Undo kinds are handled at atlas.js:606-645 (POST /undo starts at 567). Live repro on my clone (world 57): clickin…

### P050 · '✕ Remove outline' and '◌ Redraw' throw away a traced outline with no confirm and no Undo

Product polish · low · effort s · found by `outlines`

- **Where:** Atlas › Edit › inspector › On this map › ✕ Remove outline / ◌ Redraw the outline; AtlasWorkspace.jsx:350-353, 341-344
- **Files:** `client/src/pages/AtlasWorkspace.jsx:334-353`, `client/src/pages/AtlasWorkspace.jsx:1670-1674`
- **What happens:** clearOutline PATCHes shape:null and just refreshes: no flash, no ↩ Undo (unlike '⤒ Remove from map' right below it, which offers Undo). Redraw overwrites the old ring the same way. A freehand trace of up to 200 corners is gone for good after one click.
- **Why it matters:** Removing or replacing an outline offers ↩ Undo, like the other destructive map actions.
- **Fix:** In clearOutline/finishOutline, keep the previous {shape, shape_kind, shape_style} and show `setFlash({kind:'ok', text:'Outline removed', undo: …})`, with a client-side undo that PATCHes the old values back. The flash already renders an ↩ Undo button (line 1673); extend it to accept a local callback as well as a tombstone id.
- **Repro:** Select an outlined place → ✕ Remove outline → no toast or undo; GET shows shape null. Script s6.mjs (flash null, undo button 0).
- **Evidence:** s6 output: after remove: api {n:null}, flash null, undo button 0
- **Re-proved:** Code: clearOutline (AtlasWorkspace.jsx:350-353) only PATCHes {shape:null} and calls refreshMap(), with no setFlash and no undoId. finishOutline's redraw branch (lines 341-344) overwrites the shape the same way. By contrast removeFromMap (line 421-425) sets a flash with undoId, and the flash only renders ↩ Undo for undoId (line 1673). The server caps shapes at 200 points (atlas.js cleanShape, line 39). Reproduced: I outlined 'Your first node' (4 corners, saved) and clicked '✕ Remove outline'. Th…

### P055 · Removing a timed backdrop or the base backdrop happens instantly, with no confirmation and no undo

Product polish · low · effort s · found by `maps`

- **Where:** Backdrops over time › ✕ 'Remove this period's art'; Map ▾ › Remove the backdrop; picker › Remove current image
- **Files:** `client/src/pages/AtlasWorkspace.jsx:460-461`, `client/src/pages/AtlasWorkspace.jsx:1625`, `client/src/pages/AtlasWorkspace.jsx:1143-1145`, `server/routes/atlas.js:371-376`
- **What happens:** The ✕ on a period row deleted map_backdrops row 22 immediately: no dialog, no toast, no Undo. Its time range is gone and has to be retyped. 'Remove the backdrop' also clears the base straight away. Deleting nodes, placements and interiors all offer ↩ Undo, so this is inconsistent. The period ✕ also looks exactly like the dialog's close ✕.
- **Why it matters:** An Undo toast, as other destructive actions have, and a delete control that doesn't look like the close button.
- **Fix:** Give DELETE /backdrops/:id a tombstone (kind 'backdrop', restored by insertBackdrop) and show the undo toast. Have setBackdrop(null) show a toast with the old image id so the DM can put it back. Use a trash icon for the row delete.
- **Repro:** /w/38/m/112 › 🕓 Backdrops over time… › ✕ on a period row. GET /api/atlas/maps/112 shows the row gone.
- **Evidence:** t5 output: 'rows after 1 … flash: null', server bds [[20,275,9,null]]; 'after remove: … flash: null'
- **Re-proved:** Code: deleteBackdrop (client/src/pages/AtlasWorkspace.jsx:460-461) is track(...).then(refreshMap) with no setFlash and no undoId. Server DELETE /backdrops/:id (server/routes/atlas.js:371-376) returns {ok:true} and never calls tombstone(). Only interior, node and placement deletes do (atlas.js:538, 563, 696). setBackdrop(null) (AtlasWorkspace.jsx:433-434) is reached from Map ▾ › 'Remove the backdrop' (1144) and from picker › 'Remove current image' (2115, via handlePick 437). It shows no flash ei…

### P059 · Deleting an era is one click with no confirmation and no Undo

Product polish · low · effort s · found by `time`

- **Where:** Detail wrong: node and placement deletes do not 'offer Undo for 24 h'. The ↩ Undo toast shows for 9 s (flash timer at AtlasWorkspace.jsx:142); only the server tombstone is kept for 24 h (server/routes/atlas.js:27-29).
- **Files:** `client/src/pages/AtlasWorkspace.jsx:575`, `client/src/pages/AtlasWorkspace.jsx:1803`, `server/routes/atlas.js:719-724`
- **What happens:** World 61: ✕ on 'Behind the Screen', the era the lens sat in. It was deleted at once: no dialog, no toast, no ↩ Undo (flash [] and .aundo count 0). The DELETE route writes no tombstone, while node and placement deletes elsewhere offer Undo for 24 h. Deleting a 🎭 era also silently closes that stretch of the past to players.
- **Why it matters:** Destructive acts in the workspace are undoable, the same as every other delete.
- **Fix:** Tombstone the era row in DELETE /eras/:id, return undoId, handle kind 'era' in POST /undo/:id, and show the standard Undo toast in eraDelete.
- **Repro:** ⚙ → ✕ on any era row.
- **Evidence:** s10.mjs: "dialogs [] flash [] undo btn 0"; era 152 gone from GET
- **Re-proved:** Code: eraDelete (AtlasWorkspace.jsx:575) is track(deleteEra).then(refresh), with no confirm and no undoId. The ✕ is at :1803. DELETE /eras/:id (server/routes/atlas.js:719-724) writes no tombstone. POST /undo handles only the node, placement and interior kinds (atlas.js:572-655). Reproduced on clone 110: ✕ on the 'Session 4' row took the rows from 6 to 5 at once, with dialogs [], .aflash count 0 and .aundo count 0, and the era was gone from GET. _(partly — the corrected location is used above)_

