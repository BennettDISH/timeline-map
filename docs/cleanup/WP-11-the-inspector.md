# WP-11 · The inspector

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Fix the inspector's remaining wrong or confusing behaviour: Reveal, claiming player markers, links, interior names and focus after creating a node.

**Do after:** [WP-03](WP-03-autosave-that-tells-the-truth.md)

**Notes:** Do this after WP-03, which changes how the inspector saves. inspector-06: Reveal should write into the text players see at canon (the active period), or say which text it changed. journey-12: tell the DM in the editor that links and their labels are public. maps-09 and dashboard-15 are the same pattern, a title copied once at creation. Fix both so the interior or root map follows a rename.

## Checklist

- [ ] **C010** · medium · xs · Players see links and their labels as 'Threads', but the DM's editor never says links are public
- [ ] **C012** · medium · s · Claiming a player's marker points to a 'Who can see it' control that doesn't exist; the right button is already lit
- [ ] **C015** · medium · s · Reveal adds the secret to the default description, which players don't see while a period's text covers canon
- [ ] **C017** · medium · s · An interior's name is copied from the node's title when it's created and never follows a rename
- [ ] **P030** · medium · xs · After dropping a node the title isn't focused: typing the name does nothing, and its first 'n' re-arms Add-node mode
- [ ] **C055** · low · xs · The remove-interior dialog only says 'The interior is empty' when the impact request failed
- [ ] **C058** · low · xs · With voice on, 'The story by period' and 'Image' appear under the Voice header
- [ ] **C067** · low · xs · Renaming a world leaves its root map, breadcrumb and tree under the old name ('<old name> — World Map')
- [ ] **P049** · low · xs · Editor keeps its scroll position between things, and a new thing's title isn't focused
- [ ] **P056** · low · xs · Pickers show 'nothing here' while still loading, and hide already-placed things without saying why
- [ ] **P064** · low · xs · Node picker says 'No matching nodes.' while it is still loading, hides load errors, and Enter does nothing
- [ ] **P065** · low · s · Linking allows duplicates, and incoming links can't be removed or labelled from the node they point at
- [ ] **P066** · low · xs · Link rows reorder after a label edit: the edited link jumps to the bottom
- [ ] **P084** · low · xs · Link jump targets are anchors without href (not keyboard-reachable); 'refers here' is drawn in the border colour

## Items

### C010 · Players see links and their labels as 'Threads', but the DM's editor never says links are public

Confusing · medium · effort xs · found by `journey`

- **Where:** Atlas › Edit › editor › Connections › 'Links — references to other nodes' / link label ✎; client/src/pages/AtlasWorkspace.jsx:1991-2026
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1991`, `client/src/pages/AtlasWorkspace.jsx:1998`, `client/src/pages/AtlasWorkspace.jsx:1408`, `client/src/pages/PlayerView.jsx:338`
- **What happens:** I linked The Salt Market → Warden Brakk and labelled it 'sells him word of the party' (placeholder: 'why they're connected…'). The phone player sheet then showed 'THREADS › Warden Brakk — sells him word of the party ⌖', which reveals the secret connection. Other fields say '🔒 … players never see this', but the link section gives no hint that players see it. The same thing is called 'Connections'/'Links' in the editor and 'Threads' in the View reader and on the player sheet.
- **Why it matters:** The DM knows which text players will read. One name for the concept.
- **Fix:** Rename the editor section to 'Threads — players see threads between things they can see'. Change the label placeholder to 'shown to players, e.g. owes money to'. Use 'Threads' consistently (AtlasWorkspace.jsx:1991-1992, 2026).
- **Repro:** World 35: select The Salt Market › ＋ Link to another node › Warden Brakk › ✎ label › open /p/<token> on a phone › tap The Salt Market. Script: lanes/journey/s18.mjs
- **Evidence:** s18 'player sheet: … THREADS | ☻ | Warden Brakk — sells him word of the party | ⌖'. Screenshot shots/p12-threads.png
- **Re-proved:** Code: the editor section is 'Connections' (AtlasWorkspace.jsx:1991) with the label 'Links — references to other nodes' (1992). The label input placeholder is 'why they're connected…' (1998), and the section does not mention players. The View reader heading is 'Threads' (1408), and so is the player sheet (PlayerView.jsx:338). share.js:317-330 sends l.label to players whenever the other end is not DM-only. Live on my clone: I linked Probe A → Probe B with the label 'SECRET CONNECTION LABEL'. GET …

### C012 · Claiming a player's marker points to a 'Who can see it' control that doesn't exist; the right button is already lit

Confusing · medium · effort s · found by `journey` (+3 other lanes)

- **Where:** Atlas › Edit › select a dashed-green marker › editor; client/src/pages/AtlasWorkspace.jsx:1832-1834, 1857-1860
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1833`, `client/src/pages/AtlasWorkspace.jsx:1857`
- **What happens:** The editor says: '✍ A player placed this, signed “Kira” — … Set “Who can see it” to claim it into canon or hide it.' No control carries that label. Visibility is two bare emoji buttons (👁 / 🔒) inside a div titled 'Who can see this node'. For a 'player' marker, 👁 already renders as 'on' (n.visibility !== 'dm'), so claiming means clicking a button that already looks active. It worked (visibility → 'shared'), but there was no flash or confirmation, and the signature line disappeared. The legend counts markers as plain 'Note 2'.
- **Why it matters:** Explicit 'Keep it (make it canon)' / 'Hide it' / 'Delete' actions for a marker, with feedback.
- **Fix:** In Inspector, when n.visibility === 'player', light neither visseg button. Render a marker bar with '✓ Keep as canon' (onVis('shared')), '🔒 Hide' (onVis('dm')) and 'Delete' buttons plus a flash. Give visseg visible text labels ('Players' / 'DM only').
- **Repro:** Player drops a marker (lanes/journey/p2.mjs) › DM selects it on /w/35/m/103 › read the editor › click 👁 → GET node visibility 'shared', no flash. Script: lanes/journey/s12.mjs
- **Evidence:** s12: 'visseg: Everyone can see it[on] / DM only — hidden from players', 'any claim button: 0', 'after 👁: node.vis=shared flash=(no flash)'. Screenshot shots/25-marker-insp.png
- **Re-proved:** Code: the note at AtlasWorkspace.jsx:1832-1834 reads 'Set “Who can see it” to claim it into canon or hide it.' The visseg div at 1857 only has the tooltip 'Who can see this node'. Its buttons are bare 👁/🔒 (1858-1859), and 👁 gets class 'on' when n.visibility !== 'dm', so it is lit for a 'player' marker. onVis is saveNode (1493), a debounced PATCH with no flash. The legend (792-796) counts by category only. Live on my clone: I placed one real marker ('Verify marker', signed Kira) and selected …
- **Also found as:** "Claiming a player's marker means clicking a 👁 button that already shows as act…" (client-dead); "A player-marker note points to a 'Who can see it' control that no longer exists…" (inspector); "A player marker's inspector says to set “Who can see it”, but there is no contr…" (copy)

### C015 · Reveal adds the secret to the default description, which players don't see while a period's text covers canon

Confusing · medium · effort s · found by `inspector` (+1 other lane)

- **Where:** Inspector › 🔒 DM notes › 👁 Reveal — move into the description (AtlasWorkspace.jsx:1881-1891)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1881`, `server/routes/share.js:307`
- **What happens:** Reveal always appends the note to nodes.body. When a node_fact covers the canon moment, share.js serves the fact text instead. Live: The Keep had a period from day 1 reading 'Half drowned since the flood.' After Reveal, the server body ended with 'The warden sold the keys.', but the player API still returned only 'Half drowned since the flood.'. Nothing in the UI warns about this. The tooltip says 'this is how a secret becomes known'.
- **Why it matters:** Revealed secrets reach players, or the button says where they will appear.
- **Fix:** When a fact covers canon (resolve with world.timeline.current), append the note to that fact's body, or offer both targets ('into the text for day 1–…' / 'into the default'). At least show 'Players currently read the period text for …' under the button.
- **Repro:** POST /api/atlas/nodes/317/facts {body:'Half drowned…', start_time:1}, PATCH dm_note, then click Reveal in the inspector and GET /api/share/<token>/nodes/317 (lanes/inspector/s14.mjs RV1).
- **Evidence:** s14: 'RV1 server body now ends with note: true | player sees: "Half drowned since the flood."'; shots/36-reveal-with-period.png
- **Re-proved:** Code: Reveal (AtlasWorkspace.jsx:1881-1891) always sends onSave(n.id, {body: merged, dm_note: ''}), which is nodes.body. Its tooltip reads 'Moves the note into the public description — this is how a secret becomes known'. share.js:307-315 serves the covering node_fact instead of nodes.body. Live on my clone: fact 'Half drowned since the flood.' from 1, then body set to 'Base text.\n\nThe warden sold the keys.' with dm_note '' (exactly the Reveal patch). The player API returned 'Half drowned sin…
- **Also found as:** "'Reveal' in the editor often reveals nothing to players, and 👁 means three dif…" (journey)

### C017 · An interior's name is copied from the node's title when it's created and never follows a rename

Confusing · medium · effort s · found by `maps` (+1 other lane)

- **Where:** Inspector Title vs breadcrumb / Maps tree / 'Rename this space'; server/routes/atlas.js:517-519
- **Files:** `server/routes/atlas.js:517-519`, `server/routes/atlas.js:62-74`, `client/src/pages/AtlasWorkspace.jsx:1656-1668`
- **What happens:** I gave 'The Flood' an interior (map 121, titled 'The Flood'), renamed the space to 'Flood Plain', then renamed the node to 'The Great Flood'. The pin reads 'The Great Flood' while the crumb and tree read 'Flood Plain'. Renaming only the node leaves the crumb showing the node's old name. Nothing in the UI says these are two separate names.
- **Why it matters:** An interior shows its owner's title unless the DM deliberately gave the space its own name, or the rename field says 'Space name (the node is called …)'.
- **Fix:** Keep maps.title empty for interiors and fall back to the owner node's title in breadcrumb() (atlas.js:62-74), GET /worlds/:id/maps and share.js. Or update maps.title in PATCH /nodes when the title changes and the interior still carries the old title.
- **Repro:** /w/38/m/112 › select a node › ＋ Interior map › go back up › edit the node's Title › open the interior. The crumb still shows the old title.
- **Evidence:** t9 output: maps now [[121,"Flood Plain",335]] while pin 'The Great Flood' / earlier 'crumbs inside after node rename: The Sunken Keep ▸ Flood Plain'
- **Re-proved:** Code: POST /nodes/:id/interior inserts maps.title = node.title (atlas.js:517-519). PATCH /nodes/:id (495-508) never touches maps. breadcrumb() (62-74), GET /worlds/:id/maps and the space panel all read maps.title. Reproduced on clone 74: I gave 'The Flood' (789) an interior (map 252), went up, changed the inspector Title to 'The Great Flood' (the pin updated), then opened the interior. The crumbs still read 'The Sunken Keep ▸ The Flood', the space title read 'The Flood' and the tree row read 'T…
- **Also found as:** "Renaming a node leaves its interior map's title behind (tree and breadcrumb kee…" (inspector)

### P030 · After dropping a node the title isn't focused: typing the name does nothing, and its first 'n' re-arms Add-node mode

Product polish · medium · effort xs · found by `canvas`

- **Where:** Workspace (Edit) › ＋ Add node › click map › start typing; client/src/pages/AtlasWorkspace.jsx:308
- **Files:** `client/src/pages/AtlasWorkspace.jsx:305-309`, `client/src/pages/AtlasWorkspace.jsx:724-727`, `client/src/pages/AtlasWorkspace.jsx:1829-1831`
- **What happens:** After the drop, document.activeElement is BODY. Typing 'north gate' left the title as 'New node', and the 'n' keystroke switched placing mode back on (the hint 'Click the map to drop the new node…' reappeared). Every node starts as a literal 'New node', so the DM must click the field, select the text and retype.
- **Why it matters:** A new node's Title field is focused with its text selected, ready to type.
- **Fix:** Pass an autoFocusTitle flag (e.g. a justCreated ref matching the new placementId) to Inspector. There, focus and select() the title input on mount when set.
- **Repro:** /w/33/m/122 › ＋ Add node › click the map › type 'north gate'.
- **Evidence:** s23.mjs: title field value 'New node', 'placing mode now on? Click the map to drop the new node…'; lanes/canvas/shots/A5-typed-after-drop.png
- **Re-proved:** dropNode (AtlasWorkspace.jsx:305-309) only runs setSelId and setPlacing(null). The Inspector Title input (:1829-1831) has no autoFocus, and no focus()/select() call targets it. The N handler (:724-727) re-arms placing whenever focus is not in an input. The server default title is 'New node' (server/routes/atlas.js:382). Live, on my clone: I clicked ＋ Add node, then the map. document.activeElement was BODY and the title read 'New node'. After typing 'north gate' the title was still 'New node', t…

### C055 · The remove-interior dialog only says 'The interior is empty' when the impact request failed

Confusing · low · effort xs · found by `inspector`

- **Where:** Inspector › ✕ (Remove the interior) dialog (AtlasWorkspace.jsx:1560-1570)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1560`, `client/src/pages/AtlasWorkspace.jsx:1568`
- **What happens:** Any node with an interior has interiorMaps ≥ 1, so the else branch 'The interior is empty — nothing else is affected.' can only render when nodeImpact() failed (impact null). In that case it confidently claims the interior is empty. A really empty interior instead gets 'The space inside (1 map) is deleted.' The dialog also doesn't mention that the space's own map notes, backdrops and ambience go with it.
- **Why it matters:** An honest fallback ('Couldn't check what's inside') and a mention of map notes/art.
- **Fix:** Branch on impact == null → 'Couldn't check what's inside — Undo will still be offered.' Branch on nodesInside === 0 → 'Nothing is placed inside.' Add a line for map notes/backdrops.
- **Repro:** Read the branch. Live: Old Gate's empty interior showed 'The space inside (1 map) is deleted.' (s7 I3).
- **Evidence:** s7: 'I3 confirm modal: "…The space inside (1 map) is deleted.…"'; shots/14-remove-interior-confirm.png
- **Re-proved:** The dialog is at AtlasWorkspace.jsx:1555-1576. The impact branch is `confirmInterior.impact && impact.interiorMaps > 0`, and the else branch (1568-1569) says 'The interior is empty — nothing else is affected.' GET /nodes/:id/impact (server/routes/atlas.js:468-491) seeds the recursive tree with the node's own interior_map_id, so interiorMaps is at least 1 whenever the ✕ button shows (it only shows when n.hasInterior, 1844-1849). The else branch can therefore only render when askRemoveInterior's …

### C058 · With voice on, 'The story by period' and 'Image' appear under the Voice header

Confusing · low · effort xs · found by `inspector`

- **Where:** Inspector section order (AtlasWorkspace.jsx:1874-1975)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1893`, `client/src/pages/AtlasWorkspace.jsx:1931`
- **What happens:** The order is: Story header → Description → DM notes → Voice header → voice select/style/line/Say it → 'The story by period…' → Image → Time. The timed description and the image fields therefore read as part of the Voice section (see screenshot 25, where they sit right under 'Say it').
- **Why it matters:** Period text sits under Story next to the description; Image gets its own header.
- **Fix:** Move the `{timeline?.enabled && facts}` block (1931-1950) up to just after DM notes, and give Image an `.isect` header, before rendering the Voice block.
- **Repro:** Select any node on the live site (voice provider gemini is enabled) and scroll the inspector.
- **Evidence:** shots/25-image-pin-size.png, shots/02-keep-selected.png
- **Re-proved:** AtlasWorkspace.jsx Inspector renders in this order: isect 'Story' (1874) → Description → DM notes → {voiceOn && isect 'Voice' + select/style/line/Say it} (1893-1930) → {timeline?.enabled && 'The story by period…'} (1931-1950) → 'Image' fld (1951, no isect) → isect 'Time' (1976-1978). The period text and Image have no header of their own, so they sit under Voice. The finder's shots/25-image-pin-size.png shows exactly this on the live site, with the 'VOICE · gemini' header above 'The story by per…

### C067 · Renaming a world leaves its root map, breadcrumb and tree under the old name ('<old name> — World Map')

Confusing · low · effort xs · found by `dashboard`

- **Where:** Root map lazy creation (server/routes/atlas.js:79-87) + Edit details rename (client/src/pages/Dashboard.jsx:129-139)
- **Files:** `server/routes/atlas.js:79-87`, `server/routes/atlas.js:135-155`
- **What happens:** I created '[audit] dashboard-rename', opened it (the root map was auto-created), then renamed it to '[audit] dashboard-renamed'. Its only map is still titled '[audit] dashboard-rename — World Map', and that title is what the Atlas breadcrumb and map tree show.
- **Why it matters:** A renamed world's default root map should follow the new name, or not embed the world name at all.
- **Fix:** Name the lazily created root map just 'World map' (atlas.js:85). Or, in the world PATCH, when name changes and the root map title still equals `${oldName} — World Map`, update it in the same request.
- **Repro:** lanes/dashboard/api1.mjs: POST /api/worlds, GET /api/atlas/worlds/:id, PATCH {name}, GET /api/atlas/worlds/:id/maps.
- **Evidence:** api1 output: 'root map after rename: ["[audit] dashboard-rename — World Map"]'. Screenshot lanes/dashboard/shots/11-blank-world-atlas.png shows the '<world> — World Map' naming.
- **Re-proved:** Code: atlas.js:84 builds the lazily created root map's title as `${w.name} — World Map`. PATCH /worlds/:worldId (atlas.js:133-155) only updates world columns and never touches maps. Live check (verify/dashboard-b3/run1.mjs): POST /api/worlds created '[audit] verify-dashboard-b3 rename' (id 161). GET /api/atlas/worlds/161 created root map 505. I then PATCHed the name to '[audit] verify-dashboard-b3 renamed'. GET /api/atlas/worlds/161/maps still returned title '[audit] verify-dashboard-b3 rename …

### P049 · Editor keeps its scroll position between things, and a new thing's title isn't focused

Product polish · low · effort xs · found by `journey`

- **Where:** Atlas › Edit › editor panel (.insp); AtlasWorkspace.jsx:1422-1506, 1829-1831
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1422`, `client/src/pages/AtlasWorkspace.jsx:1830`
- **What happens:** After scrolling down to Image on one place and then selecting another, the editor opened at scrollTop 689 (Voice / 'Say it'), with Title off-screen. A just-dropped node leaves focus on BODY. Its title stays 'New node', so the DM has to click into the field and select the text before typing. Typing a name containing 'n' at that point toggles N (Add node) placing mode.
- **Why it matters:** A newly selected thing opens at its title; a newly created one has its title focused and selected.
- **Fix:** Reset the .insp scrollTop to 0 when selId changes (useEffect on selId with an insp ref). Pass a justCreated flag from dropNode so the Inspector title input gets autoFocus and select().
- **Repro:** World 35: select Harbor Chapel › scroll the editor down › select The Salt Market → still scrolled. Press N › click the map → document.activeElement is BODY. Scripts: lanes/journey/s9.mjs, s20.mjs
- **Evidence:** s9: 'insp scrollTop set: 689' / 'after selecting another node: 689'; s20: 'active element after drop: BODY', 'title after typing: New node'. Screenshot shots/19-insp-scroll-carried.png
- **Re-proved:** Reproduced on my own clone of world 30 (world 64, since deleted). I selected The Great Hall on map 211, set .insp scrollTop to 478 and selected Warden Brakk. The editor showed Warden Brakk with scrollTop still 478. The code matches: .insp (AtlasWorkspace.jsx:1422-1423) stays mounted across selections, only <Inspector key={sel.id}> (1481) remounts, and a grep for scrollTop, autoFocus and focus() finds no reset or focus logic for the editor. Then I pressed N and clicked the map. document.activeEl…

### P056 · Pickers show 'nothing here' while still loading, and hide already-placed things without saying why

Product polish · low · effort xs · found by `journey` (+1 other lane)

- **Where:** Choose image modal; Place which node? / Link to… modals; AtlasWorkspace.jsx:2063, 2127, 2136-2158
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2063`, `client/src/pages/AtlasWorkspace.jsx:2127`, `client/src/pages/AtlasWorkspace.jsx:2158`
- **What happens:** ImagePicker starts with images=[] and shows 'No images in this world yet — upload one above.' until the fetch lands (about 90 ms here, longer on a slow link). The 'Link to…' picker likewise shows 'No matching nodes.' while loading. When the DM searches 'party' in Place existing on a map where the party already stands, the picker says 'No matching nodes.' although the node exists; it's filtered by excludeIds with no explanation. The image tiles carry no names (only a ◈ badge; names are in hover titles).
- **Why it matters:** A loading state, then either results or an honest empty state ('The Party is already on this map').
- **Fix:** Initialise images and nodes to null and render 'Loading…' while null. In NodePicker, count query matches among excludeIds and show 'Already on this map: …'. Show originalName under each image tile.
- **Repro:** World 35 › select a place › ＋ Add image → read the grid text right away. Place existing › type 'party' on /w/35/m/104. Scripts: lanes/journey/s8.mjs, s18.mjs, s6.mjs
- **Evidence:** s8: 'picker immediately: No images in this world yet — upload one above.' then 'picker images after 91ms: 2'; s18: 'link picker immediately: No matching nodes.'
- **Re-proved:** In the code, ImagePicker (AtlasWorkspace.jsx:2062) starts with useState([]). The fetch at 2081-2083 fills it later, with a silent catch. Line 2131 renders 'No images in this world yet — upload one above.' whenever images.length===0, so the empty message shows during loading and also when the fetch fails. NodePicker (2138) starts nodes as [] and shows 'No matching nodes.' at 2158 whenever the list is empty, including while loading. Both place pickers (1536-1537, 1546-1547) pass excludeIds = ever…
- **Also found as:** "The image picker says 'No images in this world yet' while it loads, and permane…" (maps)

### P064 · Node picker says 'No matching nodes.' while it is still loading, hides load errors, and Enter does nothing

Product polish · low · effort xs · found by `inspector` (+1 other lane)

- **Where:** Inspector › ＋ Link to another node › 'Link to…' modal (NodePicker, AtlasWorkspace.jsx:2135-2163)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2136`, `client/src/pages/AtlasWorkspace.jsx:2158`
- **What happens:** With the nodes request delayed 1.5s, the modal showed 'No matching nodes.' until data arrived. A failed load is swallowed (.catch(() => {})) and looks the same as an empty world. Typing an exact match and pressing Enter did not pick it, although the global search does.
- **Why it matters:** A loading line, an error line, and Enter picking the top match.
- **Fix:** Keep nodes as null until loaded ('Loading…'), store an error string on catch, and add onKeyDown Enter → pick list[0].
- **Repro:** lanes/inspector/s6.mjs L0 (page.route delays /api/atlas/worlds/36/nodes).
- **Evidence:** shots/10-picker-loading.png; s6: 'L0 picker while loading: "Link to…\n✕\nNo matching nodes."'
- **Re-proved:** NodePicker (AtlasWorkspace.jsx:2135-2163): nodes starts as [] (2136), the load's catch is swallowed (2138: .catch(() => {})), 'No matching nodes.' renders whenever list is empty (2158), and the search input (2148) has no onKeyDown. The global search does pick matches[0] on Enter (929). Live, with /api/atlas/worlds/58/nodes delayed 1.5s, the modal read 'Link to…\n✕\nNo matching nodes.' while loading. Typing 'Old Gate' and pressing Enter left the modal open (count 1).
- **Also found as:** "Place-existing picker says 'No matching nodes.' while it is still loading" (canvas)

### P065 · Linking allows duplicates, and incoming links can't be removed or labelled from the node they point at

Product polish · low · effort s · found by `inspector`

- **Where:** Inspector › ＋ Link to another node (NodePicker) and Links rows (AtlasWorkspace.jsx:1531-1533, 2018-2023; atlas.js:727-736)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1532`, `client/src/pages/AtlasWorkspace.jsx:2018`, `server/routes/atlas.js:727`
- **What happens:** The link picker still offers nodes that are already linked, and POST /links inserts again. Linking The Flood→The Keep twice gave two identical '→ The Keep' rows, and The Keep showed '← The Flood refers here' twice. Incoming rows have no ✎ or ✕, so a DM has to find the other node to remove a link that CLAUDE.md calls a 'first-class bidirectional edge'.
- **Why it matters:** No duplicate links. Every link shown can be managed from either end.
- **Fix:** Pass excludeIds={[...links.out, ...links.in].map(l => l.otherId)} to the link NodePicker. Add a unique check (or ON CONFLICT with a unique index on from/to) in POST /links. Render ✎/✕ on '.lrow.in' rows too (the same patch/delete endpoints work by link id).
- **Repro:** Select The Flood, add a link to The Keep twice, then GET /api/atlas/nodes/314 (lanes/inspector/s6.mjs L2/L6).
- **Evidence:** s6: 'L2 links out after 2nd pick: [[109,"The Keep"],[110,"The Keep"]]'; 'L6 remove buttons on incoming rows: 0'; shots/11-duplicate-links.png, 12-incoming-links.png
- **Re-proved:** The link NodePicker at AtlasWorkspace.jsx:1531-1533 gets only excludeId={sel.node.id}. POST /links (atlas.js:727-736) inserts with no duplicate check. The links table (schema.sql:144-153) has no unique constraint, only the non-unique idx_links_from/idx_links_to (330-331). The incoming rows (2018-2023) render only the jump link and a 'refers here' span, with no buttons. Live: POSTing the same from/to twice returned 201 both times; GET showed two out rows (ids 176 and 177), and the target showed …

### P066 · Link rows reorder after a label edit: the edited link jumps to the bottom

Product polish · low · effort xs · found by `inspector`

- **Where:** Inspector › Links (server/routes/atlas.js:413-414)
- **Files:** `server/routes/atlas.js:413`, `server/routes/atlas.js:414`
- **What happens:** GET /nodes/:id selects links with no ORDER BY, so Postgres returns updated rows last. Rows were [Warden Brakk, Supply Chest, Old Gate]. After labelling the first row they were [Supply Chest, Old Gate, Warden Brakk — first-row label].
- **Why it matters:** Stable order.
- **Fix:** Add ORDER BY l.id (or n2.title) to both link queries at atlas.js:413-414, and to the same queries in share.js linkSql.
- **Repro:** Select a node with 2+ out-links and label the first one (lanes/inspector/s15.mjs LB1/LB2).
- **Evidence:** s15: 'LB1 … ["→ Warden Brakk","→ Supply Chest","→ Old Gate"]' → 'LB2 … ["→ Supply Chest","→ Old Gate","→ Warden Brakk — first-row label"]'
- **Re-proved:** atlas.js:413-414: both link SELECTs lack ORDER BY. share.js:317-320 (linkSql) lacks it too. Live on my clone, the out-links of 'Your first node' before the edit were ids [178,179,180]. After PATCH /links/178 {label:'first-row label'}, GET returned [179,180,178], so the labelled row moved to the bottom. The inspector UI showed the same order.

### P084 · Link jump targets are anchors without href (not keyboard-reachable); 'refers here' is drawn in the border colour

Product polish · low · effort xs · found by `inspector` (+1 other lane)

- **Where:** Shift+Tab from ✎ does not land on <body>. It lands on the lifespan 'to' input (INPUT type=number placeholder='to', Inspector Time section, AtlasWorkspace.jsx ~1983). The finder read the empty className/textContent '|' as body. This still proves that the .lgo anchor in between is skipped. The ✎/✕ glyphs are 11px font in a 9x13px box, not '10px'.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2011`, `client/src/pages/AtlasWorkspace.jsx:2020`, `client/src/styles/atlas.scss:191`, `client/src/styles/atlas.scss:194`
- **What happens:** '→ Title' and '← Title' are <a onClick> with no href or role, so Tab skips them: Shift+Tab from the ✎ button landed on <body>. The ✎/✕ buttons are about 10px glyphs. The '.lref' 'refers here' text uses color:var(--line) at 10px italic and is barely visible (screenshot 39).
- **Why it matters:** Buttons that are focusable and readable.
- **Fix:** Render .lgo as <button type="button" className="lgo"> (keep the styling). Give .lx a 24px min hit area. Change .lref to color:var(--muted).
- **Repro:** lanes/inspector/s12.mjs K1; screenshot shots/39-inspector-1280-bottom.png.
- **Evidence:** s12: 'K1 Shift+Tab from ✎ lands on: |' (body)
- **Re-proved:** Code: AtlasWorkspace.jsx:2011 and :2020 render <a className="lgo" onClick> with no href, role or tabindex. atlas.scss:193 has .lx font-size:11px. atlas.scss:194 has .lref color:var(--line), which is #3a3f47, at 10px italic. Live on my clone (selected The Flood, which has one out-link and one in-link): both a.lgo have href/role/tabindex null. Tabbing 12 times forward never landed on an A. Computed .lref is rgb(58,63,71) 10px italic, and .lx measures 9x13px. The core claim holds. _(partly — the corrected location is used above)_
- **Also found as:** "'refers here' backlink label is nearly invisible (1.4:1 contrast)" (a11y-polish)

