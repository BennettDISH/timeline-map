# WP-19 · One word for one thing

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Pick one name for each thing (node, map, lantern, links, the players' moment). Replace scene-setting copy with short labels that say what a control does.

**Do after:** [WP-10](WP-10-sessions-clock-labels-and-the-party.md), [WP-11](WP-11-the-inspector.md)

**Notes:** The words are chosen and written into CLAUDE.md (Vocabulary) — Bennett vetoes there.  His copy rule applies: short and factual, with no metaphors or scene-setting. Do this after the packages that change the UI, so strings are not rewritten twice. Rename code identifiers (spotlight vs lantern) in WP-20, not here — never invite* to share*: those names dodge ad-blocker social filters (1224c84, C101).

## Checklist

- [x] **P028** · medium · m · Written-for-effect prose replaces plain labels on the Dashboard, Archive, 404, workspace flashes and Forge — done d76717c
- [x] **C035** · low · m · UI vocabulary drifts: 'node', map vs space, editor vs inspector, lantern vs two kinds of 'trail' — done d76717c
- [x] **C048** · low · xs · One share link, three names: 'share link', 'party link live', and invite* in code — done d76717c (the Dashboard badge only; the invite* class names stay on purpose)
- [x] **C054** · low · s · The lantern has five names, and ‘trail’ means both the lantern and the party's footprints — done d76717c (UI copy; the PlayerView trail→lanternPath identifier rename belongs to WP-20)
- [x] **C056** · low · xs · Inspector copy: 'The painter' jargon in the DM-notes placeholder and an ambiguous 'The trail is out.' flash — done d76717c
- [x] **C057** · low · xs · 'Outline' names two different things: the whole feature and the stroke toggle; code also calls it shape and region — done d76717c
- [x] **C059** · low · s · Several other things have 3–5 names: links, descriptions, images, and the players' moment — done d76717c (“thread” chosen over “Links”: the editor and the Player sheet already said Threads)
- [x] **C074** · low · xs · Map UI text is wrong in list spaces, mislabels the base art, and uses flavour prose where it should say what a control does — done d76717c
- [x] **C076** · low · xs · Share popover tells a DM with the clock off to use a scrubber and 'Set canon' that don't exist — done d76717c
- [x] **C080** · low · s · One thing, many names: 'Archive' / images / art / pieces, an 'imageServiceBase64' that isn't base64, and scene-setting copy — done d76717c (copy; the imageServiceBase64 rename and an /api/images/upload alias belong to WP-20)
- [x] **C086** · low · xs · Some tooltips mislead or bury what the control does — done d76717c
- [x] **C088** · low · xs · The 'Always show names' tooltip reads as the opposite of what it does — done d76717c
- [x] **C091** · low · xs · A map is called map, space, place, interior, plane, list and world map — done d76717c
- [x] **P058** · low · xs · Legend chip tooltips build plurals by appending 's' ('Hide the partys', 'Hide lores') — done d76717c
- [x] **P088** · low · xs · Player-facing copy reads as scene-setting rather than saying what the control does — done d76717c
- [x] **P092** · low · s · Punctuation and casing drift: straight vs curly quotes, trailing periods, ‘...’ vs ‘…’, lowercase labels, ＋ vs +, ‘Hide the partys’ — done d76717c

## Items

### P028 · Written-for-effect prose replaces plain labels on the Dashboard, Archive, 404, workspace flashes and Forge

Product polish · medium · effort m · found by `copy` (+2 other lanes)

- **Where:** Two details are wrong. First, 'Talk to the world…' does not exist as quoted: the text is the Forge chat's empty-state intro at AtlasWorkspace.jsx:2363, 'Talk to the world. Ask what anyone knows…'. It is not a placeholder, and the placeholder at 2393 is different. Second, the fix line-map is scrambled. 1608 and 1790 are explanatory paragraphs: rewrite them plainly rather than replacing them with 'Saved'. 2197 is the settings-saved flash → 'Saved'. 2247 is an error flash ('The mind did not answer' → e.g. 'Forge request failed'), not a button. 2355 is the 'Save the mind' button → 'Save settings'.
- **Files:** `client/src/pages/Dashboard.jsx:149`, `client/src/pages/Dashboard.jsx:189`, `client/src/pages/Dashboard.jsx:245`, `client/src/pages/ImageManager.jsx:373`, `client/src/pages/NotFound.jsx:13`, `client/src/pages/AtlasWorkspace.jsx:151`, `client/src/pages/AtlasWorkspace.jsx:572`, `client/src/pages/AtlasWorkspace.jsx:2197`, `client/src/pages/AtlasWorkspace.jsx:2360`, `client/src/pages/PlayerView.jsx:188`
- **What happens:** Bennett has flagged this voice in his other projects. Examples, with what the control actually does: Dashboard ‘Every campaign begins with a blank map’, ‘Found your first world, give it a face, and start dropping the places, people, and secrets your party will find.’ (a create button: ‘Found’ reads as the past tense of find), ‘A blank map, a fresh age’, ‘Most recently charted’, ‘Chart another’, ‘Founding…’, ‘Erasing…’, delete success ‘“X” has passed out of all knowledge.’, placeholder ‘A drowned empire lit by whale-oil lanterns…’. Archive: ‘The archive awaits a world’, ‘Unrolling…’ (loading more), ‘2 new pieces in the archive’. 404: ‘This page is on no map / The path you followed leads nowhere.’, crumb ‘Uncharted’. Workspace: ‘Put back the way it was.’ (undo), ‘They spoke — players hear it on their sheet’, ‘The place has a sound now’, ‘No voice came back’, default era name ‘A remembered age’, ‘History can redraw this map.’, ‘Name the ages of your world.’. Forge: ‘Waking the mind…’ (loading), ‘The mind took it in’ (settings saved), ‘The mind did not answer’, ‘Save the mind’, ‘Talk to the world…’. Player View: ‘Your DM is showing the way — follow the glow’, ‘Hear this place’ / ‘Quiet the ambience’.
- **Why it matters:** Short, factual labels that say what happened or what the control does, e.g. ‘Create world’, ‘World deleted’, ‘Loading…’, ‘Settings saved’, ‘Undone’.
- **Fix:** Rewrite: Dashboard.jsx:189-191 → ‘No worlds yet’ / ‘Create a world to start placing maps and pins.’ / ‘Create a world’. 245-246 → ‘New world’. 206 → ‘Last opened’. 222 → ‘Your worlds’. 149 → ‘Deleted “X”.’. 286 ‘Chronicle — what is this place?’ → ‘Description (optional)’. 299 → ‘Creating…’ / ‘Create and open’. 342 → ‘Deleting…’. ImageManager.jsx:143 → ‘Uploaded N images’, 259-260 → ‘No worlds yet — create one first’, 373 → ‘Loading…’. NotFound.jsx:13-14 → ‘Page not found’. AtlasWorkspace.jsx:151 → ‘Undone.’, 185 → ‘Line recorded’, 193 → ‘Ambience ready’, 572 → ‘New era’, 1608, 1790, 2197 → ‘Saved’, 2247, 2355 → ‘Save settings’, 2360 → ‘Loading…’. PlayerView.jsx:178, 188.
- **Repro:** Read the cited lines; Dashboard/404 text captured live in ws.mjs and scaffold.mjs.
- **Evidence:** Live: scaffold.mjs ‘404 anon: … This page is on no map | The path you followed leads nowhere.’; dashboard text via ws.mjs.
- **Re-proved:** Every quoted string is in the code at the cited lines. Dashboard.jsx:149 has '"X" has passed out of all knowledge.'; lines 189-191 have 'Every campaign begins with a blank map', 'Found your first world, give it a face…' and the 'Found your first world' button. Also: 206 'Most recently charted', 222 'Chart another', 246 'A blank map, a fresh age', 286 'Chronicle — what is this place?', 288 the 'A drowned empire lit by whale-oil lanterns…' placeholder, 299 'Founding…', 342 'Erasing…'. ImageManage… _(partly — the corrected location is used above)_
- **Also found as:** "Dashboard and 404 copy uses flowery prose and unexplained themed words instead …" (dashboard); "Poetic or AI-voiced copy and vendor jargon in workspace flashes and tooltips" (journey)

### C035 · UI vocabulary drifts: 'node', map vs space, editor vs inspector, lantern vs two kinds of 'trail'

Confusing · low · effort m · found by `journey` (+1 other lane)

- **Where:** Atlas workspace and Dashboard strings; AtlasWorkspace.jsx:213-215, 379, 925, 978, 1023, 1110-1127, 1134, 1167, 1241, 1426, 1536, 1857, 1866, 2026; Dashboard.jsx:42
- **Files:** `client/src/pages/AtlasWorkspace.jsx:379`, `client/src/pages/AtlasWorkspace.jsx:213`, `client/src/pages/AtlasWorkspace.jsx:978`, `client/src/pages/AtlasWorkspace.jsx:1023`, `client/src/pages/AtlasWorkspace.jsx:1167`, `client/src/pages/Dashboard.jsx:42`
- **What happens:** - Developer word 'node' throughout: '＋ Add node', 'Find a node…', 'Place which node?', 'Who can see this node', 'Players see shared nodes only', '“The Party” placed here — same node, new spot.', Dashboard '4 maps · 15 nodes'. The Dashboard itself speaks of 'places, people, and secrets', and players see 'marker'. - 'Map' and 'space' mean the same thing: 'Map ▾' menu vs '✎ Rename this space…', 'This space', 'Map notes'. - The side panel is 'the editor' in its toggle ('Show the editor') but 'the inspector' in a flash ('give it one from the inspector (＋ Interior map)'). - The lantern is '🔦 Show players the way here' on the button, 'the lantern' in help, 'golden trail' in flashes and 'The trail is out.' on turn-off. 'Trail' also means the party's footprint trail. - Entering a place: 'Open interior ▸' / '◎ Look inside' / 'Go inside' / 'step inside'. - Sharing: 'Share' / 'Create share link' / Dashboard '🔗 party link live'.
- **Why it matters:** One plain word per concept that a DM (and a player) would use.
- **Fix:** Glossary pass: node → 'thing' or 'entry' in UI text (keep 'node' in code); pick 'map' over 'space'; call the panel 'editor' everywhere (fix the flash at 379); name the lantern consistently and stop calling it a 'trail' (213-215) so 'trail' only means footprints; standardize on '◎ Go inside'; use 'share link' on the Dashboard badge.
- **Repro:** Read the strings on /w/35/m/103 in Edit and View, the help popover and the Dashboard. Scripts: lanes/journey/s13.mjs (tooltip dump), s15.mjs
- **Evidence:** s13 TOOLTIPS dump; help text 'gold glow = the lantern'; s14 'lantern flash: Players now see the golden trail to “Warden Brakk”.'; s15 'featured: … 4 maps · 15 nodes … 🔗 party link live'
- **Re-proved:** Grepped every quoted string at HEAD 32ef89c. 'node' appears in UI text at AtlasWorkspace.jsx:1110, 1124, 1201, 1478 ('＋ Add node'), 925 ('Find a node…'), 1536/1546 ('Place which node here?' / 'Place which node?'), 1857 ('Who can see this node'), 978 ('Players see shared nodes only'), 315 ('placed here — same node, new spot.'), 1238/1239 in the help, 2026 ('＋ Link to another node') and 2148 ('Search nodes…'). The Dashboard shows node counts at Dashboard.jsx:31 and 335, while its copy at :190 say…
- **Also found as:** "UI uses several words for the same thing: node/place/thing, map/space, Links/Th…" (confusing-code)

### C048 · One share link, three names: 'share link', 'party link live', and invite* in code

Confusing · low · effort xs · found by `postures-share`

> ⚠ **Second pass — read before fixing:** Do not rename invite* back to share*: commit 1224c84 chose invite* on purpose, because ad-blocker 'social sharing' filters hide share-named elements and so hid the DM's Share button. Change only the Dashboard badge, drop 'invite vs share' from WP-19's notes, and add a comment recording why. → **C101** in [WP-27](WP-27-tests-that-can-fail-and-docs-that-record-the-rul.md)

- **Where:** Dashboard world card badge; workspace Share popover; atlas.scss
- **Files:** `client/src/pages/Dashboard.jsx:42`, `client/src/pages/AtlasWorkspace.jsx:964-969`, `client/src/styles/atlas.scss:135-145`
- **What happens:** The workspace says '🔗 Share', 'Create share link', and 'Player shows exactly what the share link shows'. The Player View says 'Ask your DM for a fresh share link'. The Dashboard badge for the same thing says '🔗 party link live' (Dashboard.jsx:42). The code calls the popover invitewrap/invitebtn/invitepop.
- **Why it matters:** One name for one thing.
- **Fix:** Change the Dashboard badge to '🔗 Shared with players' or 'Share link on', and rename the invite* classes to share* in AtlasWorkspace.jsx:964-969 and atlas.scss:135-145.
- **Repro:** grep -rn "party link\|share link\|invite" client/src
- **Evidence:** grep output listed above
- **Re-proved:** Ran grep over client/src. Dashboard.jsx:42 has the badge text '🔗 party link live', and its title says 'through its share link'. In AtlasWorkspace.jsx the button reads '🔗 Share' (965-967), the popover button reads 'Create share link' (983), and the posture tooltip (958) and help line (1242) say 'Player shows exactly what the share link shows'. PlayerView.jsx:130 reads 'Ask your DM for a fresh share link.' The code names the popover invitewrap, invitebtn and invitepop (AtlasWorkspace.jsx:964, 9…

### C054 · The lantern has five names, and ‘trail’ means both the lantern and the party's footprints

Confusing · low · effort s · found by `copy` (+2 other lanes)

- **Where:** Inspector ‘🔦 Show players the way here’; flashes; help legend; Player View strip; code
- **Files:** `client/src/pages/AtlasWorkspace.jsx:213`, `client/src/pages/AtlasWorkspace.jsx:1241`, `client/src/pages/AtlasWorkspace.jsx:1863`, `client/src/pages/PlayerView.jsx:146`, `client/src/pages/PlayerView.jsx:188`
- **What happens:** The help legend calls it ‘the lantern’ (AtlasWorkspace.jsx:1241, CLAUDE.md). The button says ‘🔦 Show players the way here’ / ‘Stop showing the way’. Tooltips and flashes say ‘golden trail’: ‘Light a golden trail…’, ‘Players now see the golden trail to …’, ‘The trail is out.’, “Couldn't light the trail”. The API and state say spotlight (toggleSpotlight, data.spotlight), the emoji is a flashlight, and the Player View tooltip reads ‘Your DM is showing the way — follow the glow’. Meanwhile ‘trail’ is also the party's footprints: ‘The party's ghost-print trail on this map’ (L1158), components/PartyTrail. In PlayerView.jsx:146 the local `trail` variable is the lantern path while `partyTrail` is the footprints.
- **Why it matters:** One name for the lantern in UI and code, and ‘trail’ only for footprints.
- **Fix:** Use ‘lantern’ in UI copy: ‘🏮 Light the lantern here’ / ‘Put the lantern out’, and flashes ‘Players see the lantern's path to “X”.’ (AtlasWorkspace.jsx:213-216, 1863-1866; PlayerView.jsx:188). Rename PlayerView.jsx:146 `trail`/`trailIds` → `lanternPath`/`lanternIds`. Optionally rename API spotlight → lantern later.
- **Repro:** grep -rnoiE "\b(lantern|spotlight|golden trail|show(ing)? (players )?the way|the trail)\b" client/src --include=*.jsx
- **Evidence:** grep output (AtlasWorkspace.jsx:206,213-216,1241,1863-1866; PlayerView.jsx:146,188).
- **Re-proved:** AtlasWorkspace.jsx:1241 help legend reads 'gold glow = the lantern', as does CLAUDE.md:91. The button (L1866) says '🔦 Show players the way here' / '🔦 Stop showing the way'. The tooltips at L1863-1864 and the flashes at L213-216 say 'golden trail', 'The trail is out.' and "Couldn't light the trail". The code names are toggleSpotlight (L208) and data.spotlight. PlayerView.jsx:188 has title 'Your DM is showing the way — follow the glow'. 'Trail' also means the footprints: the L1158 tooltip "The …
- **Also found as:** "'Trail' means both the lantern/spotlight path and the party's footsteps" (api-contract); "The 'lantern' in the legend has no control of that name: the UI says 'Show play…" (docs-hygiene)

### C056 · Inspector copy: 'The painter' jargon in the DM-notes placeholder and an ambiguous 'The trail is out.' flash

Confusing · low · effort xs · found by `inspector`

- **Where:** Inspector › DM notes placeholder (AtlasWorkspace.jsx:1879); 🔦 Stop showing the way flash (AtlasWorkspace.jsx:213)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1879`, `client/src/pages/AtlasWorkspace.jsx:213`
- **What happens:** The placeholder says 'Secrets, truths, plans — yours alone. The painter never reads this either.' 'The painter' is internal Forge jargon, meaningless to a DM who hasn't used ✦ Forge. After clicking '🔦 Stop showing the way' the flash reads 'The trail is out.', which can be read as 'the trail is now showing'.
- **Why it matters:** Plain statements of what happened.
- **Fix:** Placeholder: 'Only you see this — not players, not the Forge's image generator.' Flash: 'Players no longer see a trail to “X”.'
- **Repro:** s9 S2: flash 'The trail is out.' after stopping the spotlight.
- **Evidence:** s9: 'S2 spotlight after stop: null flash: "The trail is out."'
- **Re-proved:** client/src/pages/AtlasWorkspace.jsx:1879 has the placeholder "Secrets, truths, plans — yours alone. The painter never reads this either." A case-insensitive search for 'painter' across client/src finds only this line. No other UI string names 'the painter' (the Forge UI says 'paint'/'painting'/'Nano Banana paints'), so the term is not explained anywhere in the UI. AtlasWorkspace.jsx:213: in toggleSpotlight, when the spotlight is already on (`on` is true), clearSpotlight runs and the flash is `{…

### C057 · 'Outline' names two different things: the whole feature and the stroke toggle; code also calls it shape and region

Confusing · low · effort xs · found by `outlines`

- **Where:** Inspector › On this map; AtlasWorkspace.jsx:2032-2045; Regions.jsx; atlas.js
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2029-2050`, `client/src/components/Regions.jsx:1-22`
- **What happens:** Under '◌ Redraw the outline / ✕ Remove outline' and 'Outline style', one toggle chip is also labelled 'Outline' (it is `stroke`). Turning 'Outline' off does not remove the outline; it hides the edge. A maintainer also meets three names for one object: `shape`/`shape_kind`/`shape_style` (DB and API), 'outline' (UI, CLAUDE.md, handlers) and 'region' (Regions.jsx, `.region` CSS, regionIdAt). The kind switch is called 'Outline style' (label), 'Presets' (tooltip) and 'kind' (code).
- **Why it matters:** The stroke toggle says what it does ('Edge' or 'Border'), and the code uses one noun.
- **Fix:** AtlasWorkspace.jsx:2045: rename the chip label 'Outline' → 'Edge' (tooltip 'The drawn edge'). Add a sentence to the Regions.jsx header mapping shape (data) = outline (UI) = region (SVG polygon).
- **Repro:** Select an outlined place → scroll to On this map → the chips read Fill · Outline · Grow · Glow · Pop, right under '✕ Remove outline'. Screenshot s3-01-style-button.png.
- **Evidence:** shots/s3-01-style-button.png
- **Re-proved:** AtlasWorkspace.jsx:2029-2050: the '◌ Redraw the outline' and '✕ Remove outline' buttons, then a field labelled 'Outline style' holding the Button/Area presets (tooltip 'Presets — they reset the toggles') and the toggles [['fill','Fill'],['stroke','Outline','The drawn edge'],['grow','Grow'],['glow','Glow'],['pop','Pop']]. The stroke toggle is labelled 'Outline'. The three names are all in use: shape/shape_kind/shape_style in the DB and API (schema.sql:186-188, atlas.js:222, 299); 'outline' in th…

### C059 · Several other things have 3–5 names: links, descriptions, images, and the players' moment

Confusing · low · effort s · found by `copy` (+1 other lane)

- **Where:** Inspector, reader, Player sheet, Dashboard, Archive, timebar
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1408`, `client/src/pages/AtlasWorkspace.jsx:1991`, `client/src/pages/PlayerView.jsx:338`, `client/src/pages/Dashboard.jsx:236`, `client/src/pages/ImageManager.jsx:143`, `client/src/pages/PlayerView.jsx:173`
- **What happens:** LINKS are called ‘Links — references to other nodes’, ‘Connections’ (section), ‘Threads’ (reader L1408, Player sheet L338, Forge chip), and ‘refers here’. DESCRIPTIONS are ‘Chronicle’ on the Dashboard (‘No chronicle written yet.’), ‘Description’ and ‘Story’ in the inspector, ‘public description’ (Reveal), ‘bodies filled’ on Forge cards, and ‘entry’ / ‘this period's text’ for timed facts (“Couldn't add the entry”). IMAGES are ‘art’ (‘⬆ Add art’, ‘All art’), ‘image’ (‘Choose image’, ‘＋ Add image’), ‘piece’ (‘2 new pieces in the archive’) and ‘painting’. THE PLAYERS' MOMENT is ‘canon moment’, ‘canon’, ‘The current moment, set by your DM’ (PlayerView L173), ‘the present’ (EraScrub ‘Back to the present’), ‘now’ (‘⦿ Now’) and ‘The world's current moment’ (Dashboard L41).
- **Why it matters:** One word per concept, e.g. Links, Description, Image, Canon (DM side) / Now (player side).
- **Fix:** Pick: ‘Links’ everywhere (AtlasWorkspace.jsx:1408,1991-1992,2021,2384; PlayerView.jsx:338). ‘Description’ for body and world description (Dashboard.jsx:236,286,319; COUNT_LABELS 2275). ‘Image’ in Archive copy (ImageManager.jsx:143,302,310,341,346). ‘Canon’ in all DM copy, ‘Now’ in player copy (PlayerView.jsx:173, EraScrub.jsx:96, Dashboard.jsx:41).
- **Repro:** Read the cited lines.
- **Evidence:** Code reading; live inspector text captured in ws.mjs output.
- **Re-proved:** Every cited string exists. Links: AtlasWorkspace.jsx:1408 'Threads', :1991 'Connections', :1992 'Links — references to other nodes', :2021 'refers here', :2384 'story, notes, threads', and PlayerView.jsx:338 'Threads'. Descriptions: Dashboard.jsx:236 'No chronicle written yet.', :286 'Chronicle — what is this place?', :319 'Chronicle'; inspector L1874 'Story' section with L1875 'Description'; L1883 'public description'; L2275 'bodies filled'; L388 "Couldn't add the entry"; L1941 "Remove this pe…
- **Also found as:** "Links and Threads are two names for the same thing: the inspector says Connecti…" (client-dead)

### C074 · Map UI text is wrong in list spaces, mislabels the base art, and uses flavour prose where it should say what a control does

Confusing · low · effort xs · found by `maps`

- **Where:** Space panel, list view, Backdrops over time modal, Map ▾ tooltips
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1090`, `client/src/pages/AtlasWorkspace.jsx:1147`, `client/src/pages/AtlasWorkspace.jsx:1154`, `client/src/pages/AtlasWorkspace.jsx:1162`, `client/src/pages/AtlasWorkspace.jsx:1438`, `client/src/pages/AtlasWorkspace.jsx:1478`, `client/src/pages/AtlasWorkspace.jsx:1611`, `client/src/pages/AtlasWorkspace.jsx:1639`
- **What happens:** (1) In a LIST space the inspector says 'Click a node to edit it — or use + Add node, then click the map.' (line 1478), but there's no map, and Add node drops a node immediately. (2) The list header reads 'An interior list — inventory, notes, what's inside. Same nodes, no map.' (1090). (3) The base row is labelled 'Base — always' (1611), but it only shows outside every period. (4) The Backdrops over time tooltip is 'Different map art for different periods — the asteroid falls, the chart changes' (1147). (5) The Focus tooltip is 'The stretch of history this place's story spans…' (1162, 1449). (6) The Focus dialog says 'Still the one world clock — but inside this space, the scrubber's track zooms to the years its story spans' (1639). (7) The empty backdrop line is 'No art yet — this space is a blank plane.' (1438). (8) 'Keep every pin's name out instead of showing it on hover' (1154) is unclear. Bennett has flagged this kind of scene-setting prose as a problem.
- **Why it matters:** Short, literal text: 'Shows whenever no period below covers the moment', 'Use different backdrop art for a range of time', 'Always show pin names', 'No backdrop set'. List spaces get 'Select an item to edit it, or ＋ Add node.'
- **Fix:** Rewrite the strings at the cited lines. Branch the sphint text on isList.
- **Repro:** /w/38/m/114 (list) › read the inspector hint and header. /w/38/m/112 › Backdrops over time… › read the base row.
- **Evidence:** lanes/maps/shots/13-list-interior.png (list hint + header), 06-bds.png / t3 bds text 'Base — always'; t1 menu titles
- **Re-proved:** Every string is at its cited line. :1090 is the listhead 'An interior list — inventory, notes, what's inside. Same nodes, no map.' :1147 is the Backdrops-over-time title about the asteroid. :1154 is 'Keep every pin's name out instead of showing it on hover'. :1162 and :1449 are the Focus titles. :1438 is 'No art yet — this space is a blank plane.' :1478 is the sphint 'Click a node to edit it — or use + Add node, then click the map.', and it isn't gated on isList. :1611 is 'Base — always'. :1639…

### C076 · Share popover tells a DM with the clock off to use a scrubber and 'Set canon' that don't exist

Confusing · low · effort xs · found by `postures-share`

- **Where:** The 'shared nodes only' inaccuracy applies to player markers (visibility='player' nodes, share.js:184), not to the lantern trail, which only highlights nodes players can already see (share.js:70-100).
- **Files:** `client/src/pages/AtlasWorkspace.jsx:978`
- **What happens:** With timeline_enabled=false the popover reads: 'Players see shared nodes only, at the canon moment. Scrubbing your timeline doesn't move them — “Set canon” does.' There is no timebar (count 0) and no Set canon button in that state. 'Shared nodes only' is also inaccurate, because player markers and the lantern trail show too.
- **Why it matters:** The text should describe what players actually see, e.g. 'Players see every shared node — there's no clock, so nothing is hidden by time.'
- **Fix:** Branch the sentence on tl?.enabled. When enabled, use momentLabel(canon, world.eras, tl.unit) instead of the raw '37 footsteps'.
- **Repro:** PATCH timeline_enabled false, open 🔗 Share (b6.json popTextClockOff, shots/54-share-pop-clock-off.png).
- **Evidence:** b6.json popTextClockOff and timebarClockOff 0
- **Re-proved:** The core claim holds. Line 978 of AtlasWorkspace.jsx branches only the '(canon unit)' parenthetical on tl?.enabled, so the sentence about scrubbing and “Set canon” always shows. The timebar and Set canon only render when mode !== 'player' && tl?.enabled (line 1248). Live on clone 141, after Disable timeline the popover read 'Players see shared nodes only, at the canon moment. Scrubbing your timeline doesn't move them — “Set canon” does.' The page had 0 .timebar elements and 0 'Set canon' button… _(partly — the corrected location is used above)_

### C080 · One thing, many names: 'Archive' / images / art / pieces, an 'imageServiceBase64' that isn't base64, and scene-setting copy

Confusing · low · effort s · found by `images`

- **Where:** The route comment is at server/routes/image-base64.js:8, not :7. The naming problem: the client service DOES base64-encode the upload payload (imageServiceBase64.js:7-14,22). The misleading part is that storage is R2 and four of its five calls go through /api/images, not that nothing is base64.
- **Files:** `client/src/pages/ImageManager.jsx:143`, `client/src/pages/ImageManager.jsx:203`, `client/src/pages/ImageManager.jsx:259-260`, `client/src/pages/ImageManager.jsx:302`, `client/src/pages/ImageManager.jsx:310`, `client/src/pages/ImageManager.jsx:346`, `client/src/pages/ImageManager.jsx:373`, `client/src/services/imageServiceBase64.js:3`, `server/routes/image-base64.js:7`
- **What happens:** The page is 'The Archive' at route /worlds/:id/images, the workspace link reads '🗃 Archive' and the picker 'Choose image'. The UI switches nouns: 'Add art', 'All art', upload flash '4 new pieces in the archive', delete flash '2 images removed from the archive', bulk bar '3 images selected'. The client service imageServiceBase64 does list, move and delete through /api/images, and its upload goes to /api/images-base64/upload, which stores bytes on R2, not as base64. Scene-setting copy of the kind Bennett has flagged: 'The archive awaits a world', 'Found one first, then fill its archive with maps and portraits.', 'Maps, portraits, handouts — it all lives here.', 'Unrolling…' (the Show more loading label).
- **Why it matters:** One noun ('image') in the UI, plain labels that say what a control does, and service/route names that match what they do.
- **Fix:** Use 'image(s)' in every flash and label ('Upload images', 'All images'). Replace the empty-state and loading copy with plain text ('No worlds yet — create one on the dashboard', 'Loading…'). Rename imageServiceBase64 to imageService, and add an /api/images/upload alias (keep /api/images-base64/serve for stored URLs).
- **Repro:** Upload 4 files (flash says 'pieces'), then delete 2 (flash says 'images'). Click 'Show more' ('Unrolling…').
- **Evidence:** s2 'batch1 flashes: ["4 new pieces in the archive"]'; s5 'flash: 2 images removed from the archive'; s3 bulkbar '3 images selected'
- **Re-proved:** Every copy string exists exactly as quoted. ImageManager.jsx:143 builds plural(n,'new piece')+' in the archive' ('4 new pieces in the archive'). Line 203: '… images removed from the archive'. Line 406: '{n} images selected'. Line 302: '⬆ Add art'. Line 310: 'All art'. Lines 259-260: 'The archive awaits a world' / 'Art lives inside a world. Found one first, then fill its archive with maps and portraits.' Line 346: '…Maps, portraits, handouts — it all lives here.' Line 373: 'Unrolling…'. The rout… _(partly — the corrected location is used above)_

### C086 · Some tooltips mislead or bury what the control does

Confusing · low · effort xs · found by `copy`

- **Where:** Two small details are off. The mode-switch title at L958 is 99 characters (measured), not 110. The ⏳ title at L1319 is one sentence with a dash clause ('Things not present at this moment are shown with a dashed purple edge — click to hide them'), not two sentences. The rest stands.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1154`, `client/src/pages/AtlasWorkspace.jsx:1147`, `client/src/pages/AtlasWorkspace.jsx:2102`, `client/src/pages/AtlasWorkspace.jsx:1177`, `client/src/pages/AtlasWorkspace.jsx:1319`
- **What happens:** ‘🏷 Always show names’ has the tooltip ‘Keep every pin's name out instead of showing it on hover’, which reads as ‘hide the names’ (L1154). Backdrops-over-time: ‘Different map art for different periods — the asteroid falls, the chart changes’ (L1147). The ✦ Paint button: ‘Nano Banana paints in this world's style and attaches it right here’, a model codename a DM won't know (L2102). ‘🕓 Timeline’: ‘Give the world a clock: lifespans, a scrubber, a canon moment’, all undefined jargon at the point of first use (L1177). The ⏳ toggle has a two-sentence tooltip (L1319). The mode switch tooltip is a single 110-character string (L958). The lantern button tooltip (L1864) is poetic. Tooltips are also the only explanation for many controls, and phones never show them (see the symbol-button finding).
- **Why it matters:** One short sentence stating the effect: ‘Show every pin's name all the time’, ‘Use different backdrop art for different periods’, ‘Generate an image in this world's art style’, ‘Turn on the timeline’.
- **Fix:** Rewrite titles at AtlasWorkspace.jsx:958, 992, 1147, 1154, 1162, 1177, 1319, 1864, 2102 and 2308 as single factual sentences.
- **Repro:** Hover the controls in Edit posture; read the cited lines.
- **Evidence:** Code reading; help popover text captured live (ws.mjs).
- **Re-proved:** The cited titles in AtlasWorkspace.jsx are verbatim. 1154: 'Keep every pin's name out instead of showing it on hover' on '🏷 Always show names'. 1147: 'Different map art for different periods — the asteroid falls, the chart changes'. 2102: 'Nano Banana paints in this world's style and attaches it right here'. 1177: 'Give the world a clock: lifespans, a scrubber, a canon moment'. 1162: the focus-period title. 1864: the lantern text 'Light a golden trail for players: on each map along the way, th… _(partly — the corrected location is used above)_

### C088 · The 'Always show names' tooltip reads as the opposite of what it does

Confusing · low · effort xs · found by `canvas`

- **Where:** Workspace › Map ▾ › 🏷 Always show names (tooltip); client/src/pages/AtlasWorkspace.jsx:1154
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1154`
- **What happens:** The tooltip says "Keep every pin's name out instead of showing it on hover". 'Keep … out' usually means exclude or hide, but the toggle SHOWS every name.
- **Why it matters:** Plain wording, e.g. "Show every pin's name all the time, not just on hover".
- **Fix:** Rewrite the title string at AtlasWorkspace.jsx:1154.
- **Repro:** Hover 'Map ▾ › 🏷 Always show names'.
- **Evidence:** s1.mjs mapmenu titles
- **Re-proved:** AtlasWorkspace.jsx:1154 reads `title="Keep every pin's name out instead of showing it on hover"` on the '🏷 Always show names' button (:1155), which calls toggleLabels(). Live check on my clone: Map ▾ › 'Always show names' has the title "Keep every pin's name out instead of showing it on hover", word for word.

### C091 · A map is called map, space, place, interior, plane, list and world map

Confusing · low · effort xs · found by `copy`

- **Where:** Workspace rail, Map ▾ menu, inspector ‘This space’ panel, reader, modals
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1134`, `client/src/pages/AtlasWorkspace.jsx:1167`, `client/src/pages/AtlasWorkspace.jsx:1426`, `client/src/pages/AtlasWorkspace.jsx:1438`, `client/src/pages/AtlasWorkspace.jsx:1659`
- **What happens:** The rail header says ‘Maps’. The Map ▾ menu has ‘✎ Rename this space…’ and the tooltip ‘This space: backdrop art, name, map or list’. The inspector heading is ‘This space’ with ‘No art yet — this space is a blank plane.’ The interior delete says ‘The space inside (1 map) is deleted.’ Other labels say ‘place’: ‘Back to this place's period’, ‘The stretch of history this place's story spans’, PlayerView ‘Hear this place’. Others say interior: ‘＋ Interior map’, ‘◎ Open interior ▸’. The root falls back to ‘World map’, and the Forge option reads ‘a lived-in space’. ‘Plane’ is a code word (MapPlane).
- **Why it matters:** ‘Map’ for every map, including list-view maps and interiors (‘this map’, ‘Rename this map…’, ‘No backdrop yet’).
- **Fix:** Replace ‘space’ and ‘place’ (when it means a map) with ‘map’ at the lines above, and drop ‘blank plane’. Keep ‘interior’ only as the adjective in ‘interior map’.
- **Repro:** Read AtlasWorkspace.jsx:1134,1167,1296,1343,1426,1438,1449,1562,1659,1728,2348; PlayerView.jsx:178.
- **Evidence:** Live inspector text in ws.mjs/ shots/insp-party.png: ‘THIS SPACE’, ‘No art yet — this space is a blank plane.’
- **Re-proved:** Every cited line matches the finding. L1010 <h4>Maps</h4>; L1134 title 'This space: backdrop art, name, map or list'; L1167 '✎ Rename this space…'; L1659 modal <h4>Rename this space</h4>; L1343 reader 'This space'; L1426 isect 'This space'; L1438 'No art yet — this space is a blank plane.'; L1562 'The space inside (N map) is deleted.'; L1296 "Back to this place's period"; L1449 "The stretch of history this place's story spans" (the map's focus period); L1728 'World map' fallback for the root; L…

### P058 · Legend chip tooltips build plurals by appending 's' ('Hide the partys', 'Hide lores')

Product polish · low · effort xs · found by `canvas` (+1 other lane)

- **Where:** client/src/utils/categories.js:3-12 (the CATS map; the file has 14 lines), not :63-72. The AtlasWorkspace.jsx:1187 citation is correct.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1187`, `client/src/utils/categories.js:63-72`
- **What happens:** The tooltips read 'Hide places', 'Hide lores', 'Hide the partys' and 'Show the partys'.
- **Why it matters:** 'Hide lore', 'Hide the party'.
- **Fix:** Add a plural (or filter-label) field to each CATS entry in utils/categories.js and use it at AtlasWorkspace.jsx:1187.
- **Repro:** Hover the legend chips on /w/34/m/100.
- **Evidence:** s3.mjs legend w34 [...,["⚑The party 1","Hide the partys"]]; s21.mjs 'Show the partys'
- **Re-proved:** Tooltip code at AtlasWorkspace.jsx:1187 is `Show ${cat(k).label.toLowerCase()}s` / `Hide ${...}s`. client/src/utils/categories.js labels are 'Lore' and 'The party' (plus 'Person'), which gives 'Hide lores', 'Hide the partys' and 'Hide persons'. Live check on my clone of 27: the legend titles were [['▲Place 2','Hide places'],['✷Event 1','Hide events'],['•Note 1','Hide notes'],['✦Lore 1','Hide lores']]. The party chip text comes from the same template. The cited location is wrong: categories.js i… _(partly — the corrected location is used above)_
- **Also found as:** "Legend chip tooltips pluralise blindly ('Hide the partys', 'Hide lores')" (journey)

### P088 · Player-facing copy reads as scene-setting rather than saying what the control does

Product polish · low · effort xs · found by `player-desktop`

- **Where:** The footprint dots do have an explanation: a hover tooltip. PartyTrail.jsx:46 and :51 set the .fstep title to 'Session N · footstep M — click to look at this moment'. Only the S#·# stag at PlayerView.jsx:249 has no tooltip or explanation at all. Separately, the EraScrub.jsx:90 tooltip says 'year' even on a world whose unit is footsteps.
- **Files:** `client/src/pages/PlayerView.jsx:173`, `client/src/pages/PlayerView.jsx:178`, `client/src/pages/PlayerView.jsx:188`, `client/src/pages/PlayerView.jsx:317`, `client/src/pages/PlayerView.jsx:394`, `client/src/components/EraScrub.jsx:90`
- **What happens:** Tooltips and labels: 'Your DM is showing the way — follow the glow' (spotlight bar, the only explanation of the 🔦 bar, and hover-only), 'Hear this place' / 'Quiet the ambience', 'A remembered moment — the era bar goes back to now' (nowchip), 'In their own voice' (voice heading), 'Place it — everyone sees it' (submit), 'Click to type a year — it snaps into the revealed past'. The gold footprint dots and the 'S3·7' tags have no visible explanation at all.
- **Why it matters:** Short, factual wording (Bennett's copy rule): 'Your DM highlighted: …', 'Play ambience' / 'Stop ambience', 'Viewing the past — ⦿ Now returns to the present', 'Voice line', 'Place marker (everyone can see it)'.
- **Fix:** Rewrite those strings. Give the spotlight bar a visible short label ('DM is pointing at:'), and give footprints a one-line legend or tooltip wording such as 'Party was here · Session 2, footstep 1'.
- **Repro:** Hover the controls on /p/<token> with a spotlight set (POST /api/atlas/worlds/:id/spotlight). Screenshot: /tmp/claude-1000/-home-bennett-repos/fad7b677-1261-40ae-b46f-e65ab93eee86/scratchpad/audit/lanes/player-desktop/shots/60-spotlight-root.png
- **Evidence:** dmtrail title attribute: 'Your DM is showing the way — follow the glow'; einfo title: 'Click to type a year — it snaps into the revealed past'
- **Re-proved:** Checked in my clone's Player View. Rendered: the dmtrail title 'Your DM is showing the way — follow the glow' (text only '🔦The Keep', no visible label), the nowchip in the past 'A remembered moment — the era bar goes back to now', the einfo title 'Click to type a year — it snaps into the revealed past', and the marker submit 'Place it — everyone sees it'. Checked in code: 'Hear this place' / 'Quiet the ambience' (PlayerView.jsx:178) and 'In their own voice' (line 317). The party pin's 'S4·1' s… _(partly — the corrected location is used above)_

### P092 · Punctuation and casing drift: straight vs curly quotes, trailing periods, ‘...’ vs ‘…’, lowercase labels, ＋ vs +, ‘Hide the partys’

Product polish · low · effort s · found by `copy`

- **Where:** Three details are wrong. (1) The 'canon' chip (AtlasWorkspace.jsx:1315) is not a lowercase label on screen: .canonchip has text-transform:uppercase (atlas.scss:128-129), so it renders 'CANON'. Drop it from the list. (2) client/src/utils/categories.js has only 14 lines, so :64 is wrong; CATS is at categories.js:3-11, and that is where the `plural` field goes. (3) Flash periods are closer to a third than half: 9 flashes end with a period and 18 do not.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:315`, `client/src/pages/AtlasWorkspace.jsx:1187`, `client/src/pages/AtlasWorkspace.jsx:1201`, `client/src/pages/AtlasWorkspace.jsx:1740`, `client/src/pages/AtlasWorkspace.jsx:925`, `client/src/pages/PlayerView.jsx:286`, `client/src/utils/categories.js:64`, `client/src/App.jsx:22`
- **What happens:** Titles are quoted straight in some flashes ("X" at Dashboard.jsx:149, ImageManager.jsx:232, AtlasWorkspace.jsx:315,406,419,425,1226) and curly in the rest (“X” at AtlasWorkspace.jsx:214,215,379 and every modal title). About half the flashes end with a period (‘Put back the way it was.’, ‘"X" is gone.’) and half don't (‘The place has a sound now’, ‘Painted and attached’). Loaders mix ‘Loading...’ (App.jsx), ‘Loading world…’, ‘Opening…’, ‘Opening the world…’ and ‘Waking the mind…’. Some labels start lowercase among sentence-case siblings: ‘expand all’ / ‘collapse all’ (L1740-1741), ‘canon’ chip, ‘✕ cancel’ (PlayerView.jsx:286), ‘○ unplaced’, ‘refers here’, ‘offline?’. The ‘＋ Add node’ button uses fullwidth ＋ (U+FF0B) while the help text says ‘+ Add node’ in ASCII (L1201,1478). The fullwidth glyph rendered as a tofu box in the headless Chromium on this machine (shots/insp-party.png), so fonts without U+FF0B lose the plus. The legend tooltip builds plurals by appending ‘s’: ‘Hide the partys’, ‘Show persons’, ‘Show lores’ (L1187). The search placeholder has a double space: ‘Find a node… ( / )’ (L925).
- **Why it matters:** One quote style (curly), one ellipsis (…), sentence case, one plus glyph, and hand-written plural labels.
- **Fix:** Switch the 7 straight-quote flashes to “”. Settle on flashes without a trailing period, or with one, and apply it. Replace ‘...’ with ‘…’ (App.jsx:22,33,44, AdminPanel.jsx:62, Login.jsx:121,162, AuthCallback.jsx:48, Setup.jsx:85,162). Capitalise the lowercase labels. Use one plus glyph: ASCII ‘+’, or the same ＋ in help text. Add a `plural` field to CATS (categories.js) and use it at L1187 (‘people’, ‘the party’, ‘lore’). Remove the double space at L925.
- **Repro:** grep -rnE '`[^`]*"\$\{[^}]*\}"[^`]*`' client/src (straight quotes); grep -rnE "[A-Za-z]\.\.\.['\"<]" client/src (ASCII ellipses).
- **Evidence:** grep outputs in this lane; the tofu is visible in shots/insp-party.png and dm-session-labels.png (‘▯ Add node’, ‘▯ Interior map’).
- **Re-proved:** Straight-quote flashes are confirmed at exactly the 7 cited places (Dashboard.jsx:149, ImageManager.jsx:232, AtlasWorkspace.jsx:315,406,419,425,1226), and curly ones at AtlasWorkspace.jsx:214,215,379 and in the modal titles (Dashboard.jsx:333, ImageManager.jsx:457). Trailing periods are mixed: 'Put back the way it was.' L151, 'The place has a sound now' L193, 'Painted and attached' L1529. Loader wording is confirmed: 'Loading...' at App.jsx:22,33,44; 'Loading world…' L877; 'Opening…' L1033; 'Wa… _(partly — the corrected location is used above)_

