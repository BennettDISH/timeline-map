# WP-10 · Sessions, clock labels and the Party

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Number sessions from the era, read every clock label through momentLabel, and let the DM record a new Party footstep on any map.

**Do after:** [WP-04](WP-04-nothing-reaches-players-by-accident.md)

**Notes:** time-06: sessionOf (moment.js:9-13) counts every era. Count only session eras, or read the number from the era's name, and check that the DM and Player View tags agree. journey-06 routes about fifteen raw-number readouts through momentLabel. journey-01 (m) lets a node be placed again, as a new footstep, on a map where it already has a placement. api-contract-09 is here because Forge and Party placements are the main source of DM-only placements on shared nodes. The workspace needs to draw them as DM-only and let the DM flip them.

## Checklist

- [ ] **B005** · high · m · No way to record a new party footstep on a map the party has already visited
- [ ] **B022** · medium · xs · The Party's '◂ From …' / 'Then on to … ▸' links lose the Party: a same-map link dead-ends in 'Nothing is known of this'
- [ ] **B039** · medium · s · Lantern on the Party (or any node with an out-of-time first placement) shows players nothing, while the DM is told 'Players now see the golden trail'
- [ ] **B057** · medium · s · Session numbers (S3·7 tag, tick/print titles, session colours) count every era, so DM-only and overlapping eras make them wrong
- [ ] **C013** · medium · s · A shared node's DM-only placement is drawn as public in the DM workspace, and nothing can change it
- [ ] **C020** · medium · s · The clock appears as raw numbers in most places while the timebar and players read 'Session 4 · footstep 1'
- [ ] **C022** · medium · s · '＋ Next session' is the primary button in every world but assumes footsteps and counts the wrong eras
- [ ] **B073** · low · xs · With the clock off, every Party footstep is drawn as a live pin plus the ghost trail, and the Footprints toggle disappears
- [ ] **B077** · low · s · Era bar: arrow keys cannot cross a gap between revealed eras
- [ ] **B084** · low · xs · A CSS override lifts the timebar slider above the era bands and over the bar's top border
- [ ] **C033** · low · xs · Ghost reader prints an inverted range: 'Its story runs 10 – 8 footsteps'
- [ ] **C062** · low · xs · Typed-moment box says 'year', expects raw clock numbers, and an empty entry jumps to the earliest moment
- [ ] **C077** · low · s · Inside a map with a focus period, the player's era bar can't reach 'now' and players have no ⤢
- [ ] **C087** · low · xs · Hiding 'The party' in the legend hides its pin but leaves its footprints and trail on the map
- [ ] **C089** · low · xs · The Party's own inspector offers ‘How they stand toward the party’ (Friend/Neutral/Foe) and a voice for the party itself
- [ ] **C092** · low · xs · Clock wording hard-codes 'footstep' and 'year' whatever the world's unit is
- [ ] **P096** · low · s · Overlapping eras print their names on top of each other on the DM timebar (visible in every clone of the sample world)

## Items

### B005 · No way to record a new party footstep on a map the party has already visited

Broken · high · effort m · found by `journey` (+1 other lane)

- **Where:** Atlas › Edit › toolbar ⤓ Place existing / right-click ⤓ Place an existing node here… / The Party's editor; client/src/pages/AtlasWorkspace.jsx:1535-1553
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1535`, `client/src/pages/AtlasWorkspace.jsx:1545`, `client/src/pages/AtlasWorkspace.jsx:1061`, `client/src/pages/AtlasWorkspace.jsx:657`, `client/src/pages/AtlasWorkspace.jsx:1868`, `server/routes/atlas.js:395`
- **What happens:** On The Keep — Inside (104) and on the root map (103), Place existing and right-click › Place an existing node here… both search 'party' and show 'No matching nodes.' because excludeIds drops every node already on the map (AtlasWorkspace.jsx:1537,1547). The Party only showed up on 'Chest contents', which is a LIST. The only way to add a footstep was to make a brand-new interior (Great Hall › ＋ Interior map), place the Party there and type both lifespan numbers by hand: about 10 actions. The new placement starts with a blank lifespan, so for that moment the party is present at ALL times, and its tag read 'S5·8'. Once the lifespan was set (38→41) the pin vanished from the map, because party pins never draw as ghosts (1061). Dragging the live Party pin only moves the existing footstep (onDragUp 657-670), which rewrites history. The Party's editor has no footstep control, but it does show controls that make no sense for the party itself: 'Friend/Neutral/Foe — how they stand toward the party', '🔦 Show players the way here', '＋ Interior map', Voice.
- **Why it matters:** CLAUDE.md's table convention is 'a placement + fact per footstep, following the players', and the ＋ Next session flash says 'set canon as the party moves'. Moving the party one footstep, on the same map or across maps, should be a one-click core action.
- **Fix:** Add '👣 Party moves here' to the right-click menu and a 'Next footstep' button in the Party's editor. It PATCHes the live footstep's end_time to now and POSTs a new placement at the click point with start_time=now+1 (end null). The server already allows a second placement of a node on the same map (atlas.js:395). Stop excluding category 'party' in excludeIds. Default any new party placement's start to the lens moment. Hide stance, lantern, interior and voice for category 'party'.
- **Repro:** World 35: open /w/35/m/104 › ⤓ Place existing › type 'party' → 'No matching nodes.' Same on /w/35/m/103 and with right-click › Place an existing node here…. Only Chest contents (a list) offers ⚑ The Party. Script: lanes/journey/s6.mjs and s7.mjs.
- **Evidence:** s6 output: 'interior place-existing list: … (no Party)', 'root search party: ' (empty), 'chest(list) search party: ⚑ The Party'. s7: 'new placement lifespan: → ', pin 'S5·8', then 'pins after lifespan: ' (empty). Screenshots: shots/10-place-existing-party.png, shots/12-party-placed.png
- **Re-proved:** Code: both NodePicker call sites pass excludeIds={(data?.placements||[]).map(p=>p.node.id)} (AtlasWorkspace.jsx:1537 for right-click 'place-here', 1547 for toolbar 'place'), and NodePicker drops every id in that set (2139-2141). That means a node with any placement on the current map, in or out of time, can never be picked there. placeExisting (310-316) POSTs only {node_id,x,y}, so a new placement always starts with a null lifespan. Pin render line 1061 filters `p.node.category !== 'party' || p…
- **Also found as:** "There is no way in the UI to add a new Party footstep on a map the Party alread…" (time)

### B022 · The Party's '◂ From …' / 'Then on to … ▸' links lose the Party: a same-map link dead-ends in 'Nothing is known of this'

Broken · medium · effort xs · found by `time`

- **Where:** 👁 View › select The Party › reader links; client/src/pages/AtlasWorkspace.jsx:1391-1401, 258-263
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1391-1401`, `client/src/pages/AtlasWorkspace.jsx:258-263`, `client/src/pages/AtlasWorkspace.jsx:245-257`, `client/src/pages/AtlasWorkspace.jsx:1351-1365`
- **What happens:** World 60, View, lens 17, Party selected (footstep placement 15–19). Clicking 'Then on to The Sunken Keep · S2·20 ▸' (same map) moves the lens to 20 but keeps the old placement selected, so the reader says 'The Party — Nothing is known of this at 20 footsteps. Its story runs 15 – 19 footsteps.' while the Party pin stands on the map (shots/s18-then-same-map.png). A cross-map link clears the selection (setSelId(null) on map change), so the reader closes and walking the trail means finding and clicking the pin again at every step.
- **Why it matters:** Following the Party's trail keeps the Party open at its next or previous footstep.
- **Fix:** Pass the target step's placement id through goToMoment. On the same map call setSelId(step.id) after setNow; on another map set pendingSelect.current = step.id before navigating (pendingSelect already exists for jump()).
- **Repro:** /w/60/m/197 in View, type 17 in the moment label, click the Party pin, click 'Then on to …'.
- **Evidence:** s18.mjs: 'reader after Then on to (same map): ✕ | ⚑ | The Party | Nothing is known of this at 20 footsteps. | 🕓 Its story runs 15 – 19 footsteps.'
- **Re-proved:** Code: goToMoment (AtlasWorkspace.jsx:259-264) only calls setNow on the same map. On another map it navigates, and the [mapId] effect (:246-256) calls setSelId(null) with no pendingSelect. The rtrail links are at :1389-1399. Reproduced on clone 110 after splitting the Party into footsteps 10-14 and 15-29 on the root map (View mode, lens 12). Party selected, then 'Then on to The Sunken Keep · S2·15 ▸' gave the reader 'The Party Nothing is known of this at 15 footsteps. 🕓 Its story runs 10 – 14 f…

### B039 · Lantern on the Party (or any node with an out-of-time first placement) shows players nothing, while the DM is told 'Players now see the golden trail'

Broken · medium · effort s · found by `postures-share`

- **Where:** Edit › inspector › '🔦 Show players the way here'; server/routes/share.js:73-102; AtlasWorkspace.jsx:208-217
- **Files:** `server/routes/share.js:73-102`, `server/routes/atlas.js:118-125`, `client/src/pages/AtlasWorkspace.jsx:208-217`
- **What happens:** spotlightTrail picks each step's placement with ORDER BY (visibility='dm') ASC, id LIMIT 1, without checking the time. It then stops the trail at the first step that is not alive at canon. For The Party, the lowest-id placement is the old root footstep (10–29), which is dead at canon 37. So the trail is empty even though the Party is visible inside The Keep. The DM clicked 'Show players the way here' on The Party and got the toast 'Players now see the golden trail to “The Party”.', but the real /p/<token>/m/390 had no .dmtrail bar and no glowing pin. The same false 'now see' toast appears for 'Future Tower' (its trail is also []) and for 'Den Guard' inside a DM-only interior. The toast only warns when the node itself is DM-only.
- **Why it matters:** Pointing the lantern at the party's current position should light the way to it. When the trail is pruned for a reason other than the node's own visibility, the DM should be told what players actually see.
- **Fix:** In spotlightTrail, choose each step's placement by ORDER BY (visibility='dm') ASC, alive-at-canon DESC, id. Better still, walk up through a non-DM placement that is present at canon, like walkUp does. Have POST /worlds/:id/spotlight return the resolved player trail (reuse spotlightTrail), and build the toast from it: 'Players see: The Keep ▸ Supply Chest', or 'Players can't see any of the way yet — <first hidden step> is hidden or not here at canon'.
- **Repro:** POST /api/atlas/worlds/121/spotlight {nodeId:1278}, then GET /api/share/<token>/maps/390?window=1 returns spotlight: [] (spotcheck.mjs). In the UI (b5.mjs), open /w/121/m/390 in Edit, select The Party, click '🔦 Show players the way here', read the toast, then open /p/<token>/m/390.
- **Evidence:** spotcheck.mjs: 'party 200 root.spotlight [] keep.spotlight []'; b5.json flashParty 'Players now see the golden trail to “The Party”.', realKeepSpotsParty [], realTrailBarParty null; flashTower same with towerSpotPayload []
- **Re-proved:** Code: spotlightTrail (share.js:84-86) picks each step's placement with ORDER BY (visibility='dm') ASC, id LIMIT 1 and ignores time. It then breaks at the first step that is not alive at canon (98). toggleSpotlight (AtlasWorkspace.jsx:208-217) shows 'Players now see the golden trail to “X”.' unless node.visibility === 'dm'. The POST route (atlas.js:118-125) returns only {ok:true}. Live on clone 144: I spotlit The Party (1531; lowest-id placement 1678 on the root, 10–29) while its placement 1679 …

### B057 · Session numbers (S3·7 tag, tick/print titles, session colours) count every era, so DM-only and overlapping eras make them wrong

Broken · medium · effort s · found by `time` (+10 other lanes)

- **Where:** The side claim 'All root prints share one colour' does not hold for world 60 as it stands. The root trail steps (GET /worlds/60/trail) start at 10, 15, 20 and 25. At canon 37 the DM view colours 10, 15 and 20 with idx 1 (Behind the Screen's hue) and 25 with idx 3; the correct split is 10/15 = Session 1 and 20/25 = Session 2. The Player View gives two colours. The claim was most likely seen while the finder's own time-04 test had widened Session 4 to 0–49, which puts it first and gives every print idx 0. The real colour defect is wrong session hues, not a single colour. The cited lines are correct.
- **Files:** `client/src/utils/moment.js:9-13`, `client/src/utils/moment.js:55-60`, `client/src/pages/AtlasWorkspace.jsx:1064`, `client/src/pages/AtlasWorkspace.jsx:1082`, `client/src/pages/AtlasWorkspace.jsx:1261-1265`, `client/src/pages/AtlasWorkspace.jsx:1394`, `client/src/components/PartyTrail.jsx:45-50`, `client/src/pages/PlayerView.jsx:227`, `client/src/pages/PlayerView.jsx:249`, `client/src/pages/PlayerView.jsx:324`
- **What happens:** sessionOf returns the index among ALL eras sorted by start, and every caller prints `Session ${idx+1}`. momentLabel takes the first era in list order that contains t. On world 60 (a clone of the E2E proving ground: 'Before the Flood' 1–8, hidden 'Behind the Screen' 1–20, Sessions 1–3), footstep 30 is tagged 'S5·1' right next to the timebar's 'Session 3 · footstep 1' (shots/s3-tick2.png). Footstep 10's tick reads 'Session 2 · footstep 10' while the label reads 'Behind the Screen · footstep 10'; the right reading is Session 1 · footstep 1. In the real Player View (/p/<token>) the same footstep is tagged 'S4·1' next to the players' own clock 'Session 3 · footstep 8', and the print for footstep 10 reads 'Session 2 · footstep 1'. All root prints share one colour.
- **Why it matters:** CLAUDE.md: an `S3·7` tag and 'Session 3 · footstep 7' labels. DM and players should read the same number, and it should match the era called 'Session N'.
- **Fix:** Make session identity explicit: parse /^Session\s+(\d+)/ from the era name (or add an eras.kind/session flag) and number from that, not from the index. In momentLabel, when several eras contain t, prefer the session era or the narrowest one. Add a small unit test for utils/moment.js with overlapping eras.
- **Repro:** Open /w/60/m/197 → click the second timebar tick → compare the party pin tag with the moment label.
- **Evidence:** s1/s3/s17 dumps: ticks ['Session 2 · footstep 10 …','Session 4 · footstep 6 …','Session 5 · footstep 1 …'], stags ['S5·1']; s15 Player View: stag ['S4·1'], clock '🕓 Session 3 · footstep 8'
- **Re-proved:** The core is confirmed. sessionOf (moment.js:9-13) indexes into ALL eras sorted by start, and every caller prints idx+1: AtlasWorkspace.jsx:1064, 1082, 1261-1265, 1394; PartyTrail.jsx:45-50; PlayerView.jsx:227, 249, 324. momentLabel (:55-60) takes the first containing era in list order. World 60's eras via GET /api/atlas/worlds/60: Before the Flood 1–8, hidden Behind the Screen 1–20, Session 1 10–19, Session 2 20–29, Session 3 30–39, Session 4 40–49. Working these through: t=30 → sessionOf idx 4… _(partly — the corrected location is used above)_
- **Also found as:** "Session number is the index among ALL eras, so 'S2·5' tags and ticks disagree w…" (client-dead); "Party session tag counts every era as a session: shows 'S5·1' for an era named …" (inspector); "Session numbers are wrong and DM, player and clock labels contradict each other…" (journey); "Party pin tag, footprint tooltips and session colours count every era as a sess…" (canvas); "Session tags (S3·7) number every era, not the session, so DM tag, player tag an…" (docs-hygiene); "One moment, two labels: the S-tag/tick/footprint 'Session N' numbers eras by in…" (confusing-code); "Session tags and footstep ticks number eras by position among ALL eras, so they…" (copy); "Session tags, footprint titles and the From/Then-on trail count every era as a …" (player-desktop); "Session tags (S#·#) count every era as a session, so they contradict the clock …" (postures-share); "Party session numbers are the era's index, not the session: 'S4·1' next to 'Ses…" (mobile)

### C013 · A shared node's DM-only placement is drawn as public in the DM workspace, and nothing can change it

Confusing · medium · effort s · found by `api-contract` (+2 other lanes)

- **Where:** Atlas › edit posture › pins/regions and inspector 👁/🔒; Forge enrich placements
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1050-1051`, `client/src/pages/AtlasWorkspace.jsx:1063`, `client/src/pages/AtlasWorkspace.jsx:1079`, `client/src/pages/AtlasWorkspace.jsx:871`, `client/src/pages/AtlasWorkspace.jsx:1858-1859`, `server/forge/contract.js:393-394`, `server/routes/atlas.js:668`
- **What happens:** placements.visibility can be 'dm' while the node is 'shared'. The Forge's enrich path inserts extra placements for EXISTING nodes as 'dm' (contract.js:393-394). The workspace's secret/faint classes and 🔒 badge only test p.node.visibility === 'dm', so such a pin looks fully public, and the inspector's 👁 shows 'Everyone can see it' as active. The Player preview (line 871) and share.js hide it. The client never sends placement visibility (grep 'visibility:' in AtlasWorkspace.jsx finds only the node toggle at 1493). The only way to un-hide it is to click 👁 on an already-'shared' node, which fires the reveal side effect at atlas.js:504-506. Live: world 44 placement 547 (Ghost G) — GET /api/atlas/maps/143 returns visibility 'dm' with node visibility 'shared', and the share map omits it.
- **Why it matters:** CLAUDE.md: 'DM-only things are FAINT'. A placement players can't see should look hidden to the DM, and its visibility should have an explicit control.
- **Fix:** In AtlasWorkspace.jsx, compute secret = p.visibility === 'dm' || p.node.visibility === 'dm' and use it for the pin/region classes (1051, 1063), the 🔒 badge (1079) and Regions' `secret` (1050). In the inspector's 'On this map' section, add a 'Hidden on this map' toggle that calls patchPlacement(id, {visibility}).
- **Repro:** GET /api/atlas/maps/143 → placement 547 {visibility:'dm', node.visibility:'shared'}; GET /api/share/NBXCV-FMo_xIkMhCPOW6aeiY/maps/143?window=1 omits 'Ghost G'; in the workspace the Ghost G pin has no 'secret' class.
- **Evidence:** tidy.mjs output row [547,441,"Ghost G","dm","shared",null,null]
- **Re-proved:** Code: contract.js:393-394 (enrich.place on EXISTING nodes) inserts placements with visibility 'dm'. contract.js:329-330 does the same for new nodes. The workspace's secret checks read only p.node.visibility: Regions secret and cls (1050-1051), the pin className (1063), the 🔒 badge (1079), and also the list row at 1099. By contrast, the player preview's visible() (871) and readerOpen (862) check p.visibility. The client never sends placement visibility: the only visibility write is saveNode at …
- **Also found as:** "A node with a DM-only placement looks public in the workspace (normal pin, 👁 o…" (inspector); "A DM-only placement of a shared node looks like a normal public pin to the DM, …" (postures-share)

### C020 · The clock appears as raw numbers in most places while the timebar and players read 'Session 4 · footstep 1'

Confusing · medium · effort s · found by `journey` (+10 other lanes)

- **Where:** Set canon flash, Share popover, Player-posture chip, reader, fact/backdrop buttons, Dashboard badge, number inputs; AtlasWorkspace.jsx:568, 587, 978, 998, 1291, 1312, 1360-1362, 1381, 1629, 1639, 1947; Dashboard.jsx:41; EraScrub.jsx:90
- **Files:** `client/src/pages/AtlasWorkspace.jsx:568`, `client/src/pages/AtlasWorkspace.jsx:978`, `client/src/pages/AtlasWorkspace.jsx:998`, `client/src/pages/AtlasWorkspace.jsx:1381`, `client/src/pages/AtlasWorkspace.jsx:1639`, `client/src/components/EraScrub.jsx:90`, `client/src/pages/Dashboard.jsx:41`
- **What happens:** With the lens on 'Session 4 · footstep 1', every other place shows a bare number: - Set canon flash: 'Canon moment set to 40 footsteps — that's what players now see.' - Share popover: '(40 footsteps)'. - Player-posture chip: '🕓 40 footsteps', while the real Player View chip reads 'Session 4 · footstep 1'. - ↩ tooltip: 'Back to the canon moment (37)'; canon mark: 'Canon moment (what players see): 37'. - Reader: '🕓 38 – 41 footsteps'; ghost reader: 'Nothing is known of this at 40 footsteps.' - '＋ Story for a period (from 40)', '＋ Add art for a period (starts at 40 footsteps)', and the ＋ Next session flash 'Session 4 begins at footstep 40'. - Dashboard badge '🕓 40 footsteps'; timebar ends '10'/'49'. Every input (lifespan, era from/to, fact from/to, focus period, exact moment) takes absolute footsteps with no era-relative hint, so the DM has to work out 10N+k by hand. Word choice is off too: the Focus period text says 'zooms to the years its story spans', and the player era bar tooltip says 'Click to type a year'.
- **Why it matters:** CLAUDE.md: 'Every clock label reads era-relative via utils/moment.js'. One way of naming a moment across DM and player screens.
- **Fix:** Route every label through momentLabel(t, eras, unit): flash (568), share popover (978), player chip (998), tooltips (1291, 1312), reader lines (1360-1362, 1381), buttons (1629, 1947), Next-session flash (587), Dashboard badge. Next to each number input, show a live '= Session 4 · footstep 1' hint. Replace 'years'/'year' with tl.unit (1639, EraScrub.jsx:90).
- **Repro:** World 35: move the lens to 40 › 📍 Set canon › open 🔗 Share › switch to 🎭 Player › select The Party in View. Scripts: lanes/journey/s11.mjs, s13.mjs, s15.mjs
- **Evidence:** s11: 'flash after Set canon: Canon moment set to 40 footsteps…', 'share pop (after): … (40 footsteps)', 'player posture top: … 🕓 40 footsteps'; p1: real player chip '🕓 Session 4 · footstep 1'; s13: 'ghost reader: … Nothing is known of this at 40 footsteps.', 'focus modal: … zooms to the years its story spans'
- **Re-proved:** Every cited line prints the raw number. Line 568: flash `Canon moment set to ${now} ${tl.unit}`. 587: `Session ${n} begins at footstep ${start}`. 978: share popover `(${canon} ${tl.unit})`. 998: player-posture chip `🕓 {canon} {tl.unit}`. 1291: canonmark title. 1312: the ↩ title. 1360/1362: ghost reader. 1381: rwhen. 1629: Add art button. 1947: Story for a period button. Dashboard.jsx:41: badge from timelineSettings.currentTime. The timebar ends print {dispMin}/{dispMax}. The number inputs (130…
- **Also found as:** "Raw clock numbers appear next to era-relative labels, and the 🎭 Player posture…" (client-dead); "Inspector time fields use raw clock numbers while the timebar speaks 'Session 3…" (inspector); "'Every clock label reads era-relative' is false: canon chip, Set-canon toast an…" (docs-hygiene); "Clock labels bypass momentLabel (CLAUDE.md says they all go through it) and the…" (confusing-code); "Moments show as raw numbers in about 15 places, while the scrubber and Player V…" (copy); "Some clock labels show raw numbers ('23 footsteps') although CLAUDE.md says eve…" (schema-data); "Many clock readouts show raw numbers ('37 footsteps') instead of the era-relati…" (time); "Posture and share surfaces print the raw clock number ('37 footsteps') where th…" (postures-share); "The DM's 🎭 Player preview shows the canon as '🕓 37 footsteps'; the real Playe…" (mobile); "The card's clock badge shows a raw number ('🕓 37 footsteps') that reads like a…" (dashboard)

### C022 · '＋ Next session' is the primary button in every world but assumes footsteps and counts the wrong eras

Confusing · medium · effort s · found by `time`

- **Where:** Timebar › ⚙ › ＋ Next session; client/src/pages/AtlasWorkspace.jsx:578-590, 1807
- **Files:** `client/src/pages/AtlasWorkspace.jsx:578-590`, `client/src/pages/AtlasWorkspace.jsx:1807`
- **What happens:** World 61 (clock in days, no sessions): Next session created 'Session 1' at days 21–30, because it starts after the max END of all eras, here the hidden lore era 'Behind the Screen' (1–20). It grew the clock to 30 and flashed 'Session 1 begins at footstep 21 — set canon as the party moves'. The button is styled `tool on` (primary) in every world. The session number is count(names matching /^session \d+/)+1, so deleting Session 2 of three gives a second 'Session 3' (code-evident at :581).
- **Why it matters:** A days or years campaign isn't nudged into the footstep convention by its most prominent button, and session numbers never collide.
- **Fix:** Show Next session only when the unit is footsteps or a 'Session N' era exists, and make it secondary. Start after the last Session era's end, number from max(N)+1, and use tl.unit in the toast.
- **Repro:** On a world with unit 'days' and a lore era: ⚙ → ＋ Next session → read the new era row and the toast.
- **Evidence:** s10.mjs: '-- db after next session … "180:Session 1[21-30]pv"', flash 'Session 1 begins at footstep 21 — set canon as the party moves'; shots/s10-days-nextsession.png
- **Re-proved:** Code at AtlasWorkspace.jsx:580: last = max(e.end) over ALL eras, lore/hidden ones included. :581: n = count of /^session\s+\d+/ names + 1, so deleting a middle session gives a duplicate number. :587: the toast hardcodes 'footstep' whatever tl.unit is. :1807: the button is className 'tool on'. Live on clone 110: the button class read 'tool on' and the flash read 'Session 4 begins at footstep 40 — set canon as the party moves'. World 61 (read only) still holds the lore era 'Behind the Screen'[1-2…

### B073 · With the clock off, every Party footstep is drawn as a live pin plus the ghost trail, and the Footprints toggle disappears

Broken · low · effort xs · found by `time`

- **Where:** Map with party footsteps while timeline_enabled=false; client/src/pages/AtlasWorkspace.jsx:560, 1057-1061, 1156-1160
- **Files:** `client/src/pages/AtlasWorkspace.jsx:560`, `client/src/pages/AtlasWorkspace.jsx:1057-1061`, `client/src/pages/AtlasWorkspace.jsx:1156-1160`
- **What happens:** World 60 with the clock disabled: four '⚑ The Party' pins on the root map at once, plus ghost prints titled 'Session 4 · footstep 6' computed from a stale lens. Map ▾ hides '👣 Footprints' when the clock is off, so the prints can't be turned off (shots/s22-clock-off-party.png).
- **Why it matters:** Without a clock there is one party, and anything drawn can be toggled.
- **Fix:** Render PartyTrail only when tl.enabled. When the clock is off, draw only the latest party placement per map (highest start).
- **Repro:** Disable the clock on a world with several party placements on one map and open that map.
- **Evidence:** s22.mjs: {party:[4× '⚑The Party'], prints:[…'Session 4 · footstep 6 …'], trail:1}
- **Re-proved:** Code: presentAt (:560) returns true for every placement when !tl.enabled, so the party filter at :1061 keeps every Party placement as a pin. PartyTrail (:1057-1060) renders whenever printsOn, with no tl.enabled check, using t = now. The 👣 Footprints item (:1156-1159) is gated on tl?.enabled. Reproduced on my clone 114 (deleted): I added two Party placements to the root (35–36, 37–39) next to the existing 10–29 and PATCHed timeline_enabled false. Reloading in Edit showed 3 '⚑The Party' pins, 2 …

### B077 · Era bar: arrow keys cannot cross a gap between revealed eras

Broken · low · effort s · found by `player-desktop`

- **Where:** Player View › era bar range input; client/src/components/EraScrub.jsx:37-55
- **Files:** `client/src/components/EraScrub.jsx:37-55`
- **What happens:** With the range focused, Home and then ArrowRight ×8 reach 8 (end of 'Before the Flood'). The next ArrowRight gives 9, which snap() pulls back to 8 because the nearest edges tie (8 and 10) and the earlier one wins. Every further ArrowRight stays on 8, so a keyboard user can never reach the sessions. With a gap wider than one step, ArrowLeft gets stuck the same way. Mouse dragging jumps the gap fine.
- **Why it matters:** Arrow keys step into the next revealed stretch in the direction pressed.
- **Fix:** In move(), compare the raw value with the current dv. Moving right, snap to the start of the next segment. Moving left, snap to the end of the previous one. Alternatively, handle ArrowLeft/ArrowRight in onKeyDown by jumping between segments.
- **Repro:** /p/<token> → Tab to the era range → Home → ArrowRight repeatedly: the chip freezes at 'Before the Flood · footstep 8'.
- **Evidence:** b6 output: 'Home+9' and 'Home+10' both report range 8, chip 'Before the Flood · footstep 8'
- **Re-proved:** Code: EraScrub.jsx:37-47 snap() keeps the first edge on a tie (strict <), and move() (49-55) snaps the raw value with no direction. Live on my clone, era range focused: Home → 1, then ArrowRight gave 2..8 and every further press stayed at 8 ('Before the Flood · footstep 8'). The 8th through 11th presses all returned 8. For the wider-gap claim, I patched my clone's 'Before the Flood' to end at 6, leaving a 7-9 gap. From 12, ArrowLeft went 11, 10, then stayed at 10 ('Session 1 · footstep 1') for …

### B084 · A CSS override lifts the timebar slider above the era bands and over the bar's top border

Broken · low · effort xs · found by `time` (+1 other lane)

- **Where:** Timebar; client/src/styles/atlas.scss:126 vs :171
- **Files:** `client/src/styles/atlas.scss:119-126`, `client/src/styles/atlas.scss:171`, `client/src/styles/atlas.scss:133`
- **What happens:** `.timebar .ttrack input{position:relative}` (:171) has the same specificity as `.timebar input[type=range]{position:absolute;bottom:8px}` (:126) and comes later, so the slider becomes relative and bottom:8px shifts it 8px UP. Measured: input y=827–843 while .timebar starts at y=834, so the thumb sits on the top border above the bands. The comment at :119-120 says 'named eras on their own line, slider beneath', and the lifespan ticks (.ttick bottom:4px) end up 45px from the slider (shots/s2-tb-zoom.png). `.timebar .tnow em` (:133) styles an <em> the label no longer renders.
- **Why it matters:** Bands on top, slider beneath with the lifespan ticks under it, matching the player era bar.
- **Fix:** Delete line 171 (the input is already absolute from :126) and delete the dead :133 rule.
- **Repro:** Look at the timebar on any world with a clock; inspect the range input's bounding box.
- **Evidence:** s2.mjs boxes: '.timebar' [230,834,900,66], 'input[type=range]' [278,827,415,16], inpStyle 'relative 8px -8px'
- **Re-proved:** atlas.scss:126 `.timebar input[type=range]{position:absolute;...bottom:8px}` and :171 `.timebar .ttrack input{position:relative}` both have specificity (0,2,1) in the same nesting, so :171 wins. The live computed style on my clone was 'relative bottom=8px top=-8px'. Measured boxes: .timebar [230,834,900,66] and input[type=range] [278,827,415,16], so the slider starts 7px above the bar's top edge. Screenshot lanes/verify-time-b3/shots/t18-timebar-clip.png shows the thumb on the top border above …
- **Also found as:** "DM timebar slider sits on the bar's top border, above the era bands, because on…" (a11y-polish)

### C033 · Ghost reader prints an inverted range: 'Its story runs 10 – 8 footsteps'

Confusing · low · effort xs · found by `journey`

- **Where:** Atlas › 👁 View › select a thing not present at the lens; AtlasWorkspace.jsx:1362
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1362`
- **What happens:** Old Gate has start null and end 8, and the timeline min is 10. The reader substitutes tl.min for the missing start and prints 'Its story runs 10 – 8 footsteps.'
- **Why it matters:** Open-start ranges read as 'until …', e.g. 'until Before the Flood · footstep 8'.
- **Fix:** When sel.start == null render `until ${momentLabel(sel.end…)}` (and 'from …' when end is null) instead of substituting tl.min.
- **Repro:** /w/35/m/103 › 👁 View › click Old Gate. Script: lanes/journey/s13.mjs ('ghost reader')
- **Evidence:** s13: 'ghost reader: ✕ | ▲ | Old Gate | Nothing is known of this at 40 footsteps. | 🕓 Its story runs 10 – 8 footsteps.'
- **Re-proved:** client/src/pages/AtlasWorkspace.jsx:1362 is `<p className="rwhen">🕓 Its story runs {sel.start ?? tl?.min} – {sel.end ?? '…'} {tl?.unit}.</p>`, inside the `readerOpen && sel && !present(sel)` ghost reader, shown only when mode === 'view'. A null start falls back to tl.min. A read-only GET of world 35 returned timeline {min:10,max:49,current:40,unit:'footsteps'}, and placement 402 'Old Gate' has start null and end 8. I reproduced it on world 35 without modifying anything: /w/35/m/103 › View › cl…

### C062 · Typed-moment box says 'year', expects raw clock numbers, and an empty entry jumps to the earliest moment

Confusing · low · effort xs · found by `player-desktop`

- **Where:** Player View › era bar › time label button; client/src/components/EraScrub.jsx:76-92
- **Files:** `client/src/components/EraScrub.jsx:76-92`
- **What happens:** The tooltip reads 'Click to type a year — it snaps into the revealed past' on a footstep clock. The box needs the raw clock number (25) while every label reads 'Session 2 · footstep 6', so a player cannot know what to type. Clearing the box and pressing Enter runs Number('') = 0 and snaps to the earliest revealed moment ('Before the Flood · footstep 1') instead of cancelling.
- **Why it matters:** Wording in the clock's unit, input accepted in the format the labels use, and an empty entry that cancels.
- **Fix:** Use tl.unit in the title ('Type a footstep number'). Treat typed.trim() === '' as cancel in both the Enter and blur handlers. Optionally parse 'S2·6' or 'Session 2 footstep 6'.
- **Repro:** Click the time label → clear it → Enter → the chip becomes 'Before the Flood · footstep 1 · the past'.
- **Evidence:** b7 output: 'typed empty Enter | top: 🕓 Before the Flood · footstep 1 · the past'
- **Re-proved:** The tooltip at EraScrub.jsx:90 reads exactly 'Click to type a year — it snaps into the revealed past'. The input is type="number" (line 76) and was prefilled with the raw clock value '37', while the label read 'now · Session 3 · footstep 8'. The Enter and blur handlers (lines 79-81 and 84-87) both run Number(typed); Number('') is 0, which counts as finite, and snap(0) goes to the earliest segment. I reproduced both paths. Clearing the box and pressing Enter changed the chip to '🕓 Before the Fl…

### C077 · Inside a map with a focus period, the player's era bar can't reach 'now' and players have no ⤢

Confusing · low · effort s · found by `player-desktop`

- **Where:** The claim that players 'can't reach now' from the bar is wrong. Only dragging can't reach it: the right end of the track is focus_end (33), not canon. The bar's own ⦿ Now button (client/src/components/EraScrub.jsx:95-96) appears as soon as the value is in the past and returns to now. The real problems are these three: the thumb sits at 33 labelled 'now' while dragging to that same spot means 33 in the past; revealed eras before focus_start are hidden; and players have no ⤢. The cited lines are correct: PlayerView.jsx:292-293 and EraScrub.jsx:13-25.
- **Files:** `client/src/pages/PlayerView.jsx:292-293`, `client/src/components/EraScrub.jsx:13-25`
- **What happens:** With map 180 focused on 20–33 and canon at 37, the track spans 20–33. The thumb sits at the right end labelled 'now · Session 3 · footstep 8', but dragging back to that end gives 33 ('the past'), not now. The revealed eras before 20 vanish from the bar, and the Player View has no ⤢ to expand the track as the DM can.
- **Why it matters:** Players can always get back to now from the bar and see all of the revealed past. Otherwise the bar needs to show that it is zoomed in.
- **Fix:** Either stop passing win to EraScrub in PlayerView, or keep hi = canon for players, or add the same ⤢ expand toggle the DM timebar has.
- **Repro:** PATCH /api/atlas/maps/180 {focus_start:20, focus_end:33} → /p/<token>/m/180. Screenshot: /tmp/claude-1000/-home-bennett-repos/fad7b677-1261-40ae-b46f-e65ab93eee86/scratchpad/audit/lanes/player-desktop/shots/110-focus.png
- **Evidence:** range min/max 20 33, value 33, einfo 'now · Session 3 · footstep 8'
- **Re-proved:** I sent PATCH /api/atlas/maps/350 {focus_start:20, focus_end:33} with canon at 37. The range then ran from 20 to 33 with value 33, and the label read 'now · Session 3 · footstep 8'. The segments were only Session 2 and Session 3, so 'Before the Flood' and 'Session 1' disappeared from the bar. Pressing Home then End gave value 33 and the chip read 'Session 3 · footstep 4 · the past'. The Player View has no ⤢ control: the only ⤢ is at AtlasWorkspace.jsx:1297. However, once the bar is off 'now', it… _(partly — the corrected location is used above)_

### C087 · Hiding 'The party' in the legend hides its pin but leaves its footprints and trail on the map

Confusing · low · effort xs · found by `canvas`

- **Where:** Workspace › legend › 'The party' chip; client/src/pages/AtlasWorkspace.jsx:1057-1060
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1057-1060`
- **What happens:** At lens 20 on /w/34/m/100 there were 1 party pin, 4 prints and 1 dotted trail. After clicking the chip there were 0 pins, 4 prints and 1 trail. PartyTrail gets the unfiltered data.placements.
- **Why it matters:** Hiding a category hides everything drawn for it.
- **Fix:** Skip rendering PartyTrail when hiddenCats.has('party'), or pass it the visible() placements.
- **Repro:** /w/34/m/100 › set the moment to 20 › click the '⚑ The party' legend chip.
- **Evidence:** s21.mjs 'after hiding The party: pins / prints / trail [0,4,1]'
- **Re-proved:** Code: at AtlasWorkspace.jsx:1057-1060, PartyTrail gets `placements={data?.placements}`, which is unfiltered, and only `printsOn` gates it. The legend's hiddenCats only affects `visible()` (:870-873), which filters the pins (:1061) and regions (:1048). PartyTrail (client/src/components/PartyTrail.jsx:12-14) filters by category === 'party' and start <= t only, with no hidden-category input. Hiding the '⚑ The party' chip therefore removes the live pin but keeps the prints and the dotted trail. The…

### C089 · The Party's own inspector offers ‘How they stand toward the party’ (Friend/Neutral/Foe) and a voice for the party itself

Confusing · low · effort xs · found by `copy`

- **Where:** Workspace › select The Party › inspector — client/src/pages/AtlasWorkspace.jsx:1868
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1868`, `client/src/pages/AtlasWorkspace.jsx:1081`
- **What happens:** The stance row (title ‘How they stand toward the party — your eyes only’) and the voice block render for every node, including category ‘party’. On The Party they ask how the party stands toward itself. The pin then shows a stance dot ‘Stands as foe to the party’ (L1081). ‘🔦 Show players the way here’ is offered for the party pin too.
- **Why it matters:** Controls that don't apply to the Party node are hidden for category === 'party'.
- **Fix:** AtlasWorkspace.jsx:1862-1873 and 1893: wrap in `n.category !== 'party' &&`.
- **Repro:** Clone world 30 → click The Party pin → read the inspector (ws.mjs output ‘🟢 Friend | ⚪ Neutral | 🔴 Foe … VOICE’). Screenshot shots/insp-party.png.
- **Evidence:** ws.mjs inspector labels dump; shots/insp-party.png.
- **Re-proved:** Inspector (AtlasWorkspace.jsx:1815 onward) has no category check on these controls. An awk scan of L1815-2060 for 'party' finds only the stance-row title at L1868. The spotlight button at L1862-1866, the stance row at L1868-1872 (title 'How they stand toward the party — your eyes only, never shown to players') and the voice block at L1893 (`{voiceOn && (`) all render for category 'party'. Once a stance is set, the pin at L1081 shows the dot titled `Stands as ${stance} to the party`. The finder'…

### C092 · Clock wording hard-codes 'footstep' and 'year' whatever the world's unit is

Confusing · low · effort xs · found by `time`

- **Where:** yearEdit useState is client/src/pages/AtlasWorkspace.jsx:74 (not :73). Also the stale 'exact year' comment at client/src/components/EraScrub.jsx:27.
- **Files:** `client/src/components/PartyTrail.jsx:46`, `client/src/pages/AtlasWorkspace.jsx:587`, `client/src/pages/AtlasWorkspace.jsx:1082`, `client/src/pages/AtlasWorkspace.jsx:1265`, `client/src/pages/AtlasWorkspace.jsx:1807`, `client/src/components/EraScrub.jsx:90`, `client/src/pages/AtlasWorkspace.jsx:1639`, `client/src/pages/AtlasWorkspace.jsx:73`, `client/src/pages/AtlasWorkspace.jsx:817`
- **What happens:** Days world: toast 'Session 1 begins at footstep 21'. Footstep world: the player bar tooltip says 'Click to type a year — it snaps into the revealed past', and the Focus dialog says 'the scrubber's track zooms to the years its story spans'. Commit 680548e renamed the workspace's 'exact year' to 'exact moment' but left EraScrub and the yearEdit/commitYear state names behind.
- **Why it matters:** Labels follow tl.unit or use neutral words ('moment').
- **Fix:** Use tl.unit (with a singular helper) or 'moment' in these strings. Rename yearEdit/commitYear to momentEdit/commitMoment.
- **Repro:** 🎭 Player → hover the moment button; Map ▾ → Focus period…
- **Evidence:** s23.mjs: 'einfo … | Click to type a year — it snaps into the revealed past'; s13 modal text
- **Re-proved:** All the strings exist as described. PartyTrail.jsx:46 hard-codes 'Session N · footstep N' / 'footstep N'. AtlasWorkspace.jsx:587 has the toast 'Session ${n} begins at footstep ${start}', :1082 the stag title, :1265 the tstep title, :1807 'ten footsteps', and :1639 'zooms to the years its story spans'. EraScrub.jsx:90 has the title 'Click to type a year — it snaps into the revealed past'. Live on my clone: the 🎭 era bar button title read exactly that, and the Focus modal read '...the scrubber's… _(partly — the corrected location is used above)_

### P096 · Overlapping eras print their names on top of each other on the DM timebar (visible in every clone of the sample world)

Product polish · low · effort s · found by `a11y-polish` (+2 other lanes)

- **Where:** Workspace timebar era bands; AtlasWorkspace.jsx:1270-1279, atlas.scss:172-177
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1270-1279`, `client/src/styles/atlas.scss:172-177`
- **What happens:** Every era band is absolutely positioned at the same top:10px. The sample world's eras 'Before the Flood' (1–8, shown to players) and 'Behind the Screen' (1–20, DM-only) both start at 1, so their labels overprint as 'Befone the Floodn'. axe also flags the DM-only band's label at 4.27:1 contrast (10.5px text).
- **Why it matters:** Overlapping eras stay readable, each on its own lane or with the outer era's label placed elsewhere.
- **Fix:** Assign each era a lane index (greedy interval partitioning) and offset top by lane, or draw only the innermost era's label where bands overlap. Raise the non-player-visible label to ≥4.5:1 (drop the opacity:.8 on line 177).
- **Repro:** Open /w/125/m/402 (a clone of sample world 27) at any size and look at the timebar. Screenshots: shots/z2-timebar.png, sz1920-edit-sel.png.
- **Evidence:** eras from GET /api/atlas/worlds/125: {Before the Flood 1–8 pv}, {Behind the Screen 1–20}; axe edit.json color-contrast 4.27 on .teraband em
- **Re-proved:** Cloning world 27 gives eras 'Before the Flood' 1-8 (playerVisible) and 'Behind the Screen' 1-20 (not playerVisible). Both .teraband spans render at x=278, y=845, h=20 (all at top:10px per atlas.scss:172). My timebar screenshot shows the two labels overprinted and unreadable ('Befone the Floodn'-style garble). axe color-contrast flagged `.teraband:nth-child(2) > em` 'Behind the Screen' at 4.27:1 (10.5px). atlas.scss:177 carries `opacity:.8` on the non-pv label.
- **Also found as:** "DM timebar draws overlapping eras in one row, so their names print on top of ea…" (journey); "Overlapping eras print their band labels on top of each other" (time)

