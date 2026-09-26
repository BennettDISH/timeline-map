# WP-13 · The map surface: canvas, tree and outlines

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Fix what goes wrong while moving around and drawing on the map: outline state that follows you, lost selection, hidden categories, stacked pins, and outlines that cannot be moved or styled.

**Do after:** [WP-07](WP-07-delete-the-dead-code.md)

**Notes:** Do confusing-code-04 first: an outline begun on one map can land on another. maps-06 can blank a list interior with no way back. This comes after WP-07, which deletes the outline drag code and the unused Regions props. outlines-03 needs a way to move an outline and its name anchor. Re-run e2e/dm.mjs afterwards, since it traces outlines.

## Checklist

- [ ] **B025** · medium · xs · Drawing HUD clips its own 'Area' button at every desktop width (fully hidden at 1280px and below)
- [ ] **B026** · medium · s · You cannot move an outlined place or its name anchor; outlining an existing pin leaves its name at the old pin spot
- [ ] **B033** · medium · xs · Outline drawing survives a posture switch and map navigation: View/Player can still trace and save, and Done lands the shape on the wrong map
- [ ] **B046** · medium · xs · A category hidden on one map stays hidden on every map, and list spaces or one-category maps go blank with no way to show it again
- [ ] **C011** · medium · s · One toggle click saves all five style keys, so the Button/Area kind (and the HUD's kind on redraw) stops doing anything
- [ ] **C024** · medium · s · Panning the map deselects the node being edited (the inspector falls back to 'This space')
- [ ] **P029** · medium · s · Selecting a node from search (or a thread link) on the same map leaves its pin off-screen; the UX doc marks 'selection frames on map' as done
- [ ] **B066** · low · xs · A list-view interior still offers '◌ Outline on the map', which opens a drawing HUD with nothing to draw on
- [ ] **B068** · low · xs · DM-only outlined places show their name all the time; other outlines show it only on hover
- [ ] **B074** · low · s · An interior whose owner node stands only inside itself disappears from the Maps tree, and its crumb reads 'X ▸ X'
- [ ] **B075** · low · xs · The Maps tree thumbnail stays stale after the backdrop is changed or removed
- [ ] **B083** · low · s · The 'Glow' style toggle has no visible effect, and the 'Pop' shadow is clipped away
- [ ] **B085** · low · xs · After 'Switch world', the Maps tree keeps the previous world's folds and overwrites the new world's saved folds
- [ ] **B086** · low · xs · Double-clicking the zoom ＋/−/⊡ buttons also fires the map's double-click zoom
- [ ] **B089** · low · s · Right mouse button drags pins, and right-clicking a pin offers only map actions
- [ ] **C029** · low · xs · The Map ▾ menu is inconsistent: 'Show as' keeps it open, Footprints shows in worlds with no party, and global settings sit in a 'This space' menu
- [ ] **C032** · low · xs · Outlining an existing pin always starts as 'Area'; a new outline starts as the remembered kind or 'Button'
- [ ] **C045** · low · xs · The '?' help only describes pins; outlined places and the Outline tool are missing
- [ ] **C060** · low · xs · Map tree: folding an ancestor of the current map silently does nothing, then takes effect later
- [ ] **C066** · low · s · Clicking a thread or search result enters the target's interior if it has one, instead of showing the target
- [ ] **C079** · low · xs · In a list view, ＋ Add node and the N key create a node instantly with no feedback, while the hints say 'then click the map'
- [ ] **P047** · low · xs · Right-click in the middle of a trace opens the menu, and picking 'Outline a place from here' silently discards the trace
- [ ] **P069** · low · s · Co-located pins stack exactly: the lower one can't be seen, hovered or clicked (only footprints fan out)
- [ ] **P089** · low · xs · No cursor change in placing mode: the only cue is a small italic hint in the corner

## Items

### B025 · Drawing HUD clips its own 'Area' button at every desktop width (fully hidden at 1280px and below)

Broken · medium · effort xs · found by `outlines` (+1 other lane)

- **Where:** Atlas › Edit › ◌ Outline › drawing HUD (Button | Area); client/src/styles/atlas.scss:770
- **Files:** `client/src/styles/atlas.scss:767-772`, `client/src/pages/AtlasWorkspace.jsx:1210-1221`
- **What happens:** `.atlas .drawhud span{overflow:hidden;text-overflow:ellipsis}` is meant for the instruction text but also hits the `<span className="kindsel">`. Measured with the inspector open: at 1920px, 32 of Area's 45px are visible; at 1440px 18px ('A'); at 1280px 1px; at 1024px 0px, and 'Button' is cut too. At every width the instruction line is also cut off ('...Esc canc…'), so 'hold Space to pan' is never readable.
- **Why it matters:** Both kind presets and the Done/✕ buttons are always fully visible. Only the instruction text should shrink.
- **Fix:** In atlas.scss:770, scope the ellipsis rule to the text span only, e.g. give the instruction span a class (`.dhtext{overflow:hidden;text-overflow:ellipsis;min-width:0}`) and add `.kindsel{flex:none}`. Or let the HUD wrap onto two lines when it is narrow.
- **Repro:** Open /w/73/m/244 in Edit at 1280x900 → click ◌ Outline → look at the teal HUD: only 'Button' shows. Script lanes/outlines/s2.mjs prints the kindsel button widths per viewport.
- **Evidence:** shots/s2-hud-1920.png, shots/s2-hud-1280.png, shots/s1-03-square-before-close.png (under lanes/outlines/). s2 output at vw 1280: Area visibleW 1.
- **Re-proved:** I measured this on my own clone (world 122, a copy of 27, now deleted) with the inspector open, using hud.mjs in verify/outlines-b1. I opened /w/122/m/392 in Edit and clicked ◌ Outline. Visible width of Area (46px wide): 32px at 1920, 18px at 1440, 1px at 1280, 0px at 1024. At 1024 only 38 of Button's 58px show. The instruction span is cut at every width (733px shown of its 851px scrollWidth at 1920). Screenshot shots/hud-1280.png shows only 'Button' and '...double-c...'. Code: atlas.scss:770 `…
- **Also found as:** "Outline-drawing bar hides the Button/Area choice and its instructions on narrow…" (a11y-polish)

### B026 · You cannot move an outlined place or its name anchor; outlining an existing pin leaves its name at the old pin spot

Broken · medium · effort s · found by `outlines`

- **Where:** Atlas › Edit › inspector › ◌ Outline on the map / ◌ Redraw the outline; AtlasWorkspace.jsx:342-344, 664-676, 1061
- **Files:** `client/src/pages/AtlasWorkspace.jsx:334-349`, `client/src/pages/AtlasWorkspace.jsx:660-677`, `client/src/pages/AtlasWorkspace.jsx:1061`
- **What happens:** Outlined places draw no pin (line 1061 filters them out), and regions do not drag, so the DM has no way to move an outlined place or its x/y anchor, where the name floats. When I outlined 'Your first node' (pin at 70,30) around 80–95 × 55–75, x/y stayed 70,30. Its hover label floats in empty sky, about 200px from the outline. 'Remove outline' then puts the pin back at 70,30, not at the shape. Concave shapes put the anchor outside the outline too, because outline-first anchors use the centroid. The drag code that makes 'an outline ride along with its anchor' (664-668, 676) is only reachable for Party placements, whose outlines are never drawn.
- **Why it matters:** The name sits on the outline, and the DM can move an outlined place.
- **Fix:** In finishOutline (AtlasWorkspace.jsx:341-344), PATCH x/y to the ring's centroid (or pole of inaccessibility) along with the shape when redrawing. Also let the DM drag the anchor label (or the region with a modifier key) in Edit, reusing the existing onPinDown/onDragUp shape-follow code. Otherwise delete that code as dead.
- **Repro:** /w/73/m/244 Edit → click the 'Your first node' pin → inspector ◌ Outline on the map → click corners at 80,55 / 95,55 / 95,75 / 80,75 → Enter → deselect → hover the new outline: the name appears far up and left. Script s6.mjs (label box [799,320] vs region box [939,467,130,108]).
- **Evidence:** shots/s6-01-label-far-from-outline.png; API after redraw: 894 {x:70,y:30,kind:'area',n:4}
- **Re-proved:** Code: pins render only for `!p.shape || category==='party'` (AtlasWorkspace.jsx:1061). Regions items exclude party (1047), and the polygons have no drag handler (Regions.jsx:119-124). .rlabel is pointer-events:none (atlas.scss:736). finishOutline for an existing placement PATCHes only shape and shape_kind (342), and clearOutline only shape:null (351). So onPinDown/onDragUp only ever get a non-null d.shape for party pins, whose outlines are not drawn. centroid() in utils/geometry.js:45 is the ar…

### B033 · Outline drawing survives a posture switch and map navigation: View/Player can still trace and save, and Done lands the shape on the wrong map

Broken · medium · effort xs · found by `confusing-code` (+2 other lanes)

- **Where:** Atlas workspace › ◌ Outline, then 👁 View / 🎭 Player or click another map in the tree; client/src/pages/AtlasWorkspace.jsx:246-256, 473-478
- **Files:** `client/src/pages/AtlasWorkspace.jsx:246`, `client/src/pages/AtlasWorkspace.jsx:473`, `client/src/pages/AtlasWorkspace.jsx:1055`, `client/src/pages/AtlasWorkspace.jsx:1210`, `client/src/pages/AtlasWorkspace.jsx:334`
- **What happens:** `drawing` is only cleared by finish/Esc/✕ (grep setDrawing: 323, 325, 340, 744, 1056, 1131, 1219). switchMode (473-478) resets placing/picker/nodePicker/tlEdit/mapMenu but not drawing; the mapId effect (246-256) resets selId/placing/ctx/focusExpand but not drawing. The draw HUD (1210-1221) and Regions' drawing prop (1055-1056) are not gated on mode, so in View or Player posture the DM can keep adding corners and '✓ Done' runs finishOutline → dropNode (a write from a read-only posture). After navigating to another map, Done calls dropNode(cx, cy, pts) with the NEW mapId (305-306, 346-347): a place is created on map B with a shape traced over map A's art.
- **Why it matters:** Leaving Edit or leaving the map cancels the outline (and other edit-only tools/modals).
- **Fix:** setDrawing(null) in switchMode and in the mapId effect; also clear bdsOpen/focusEdit/renaming/confirmDel/confirmInterior there. Longer term collapse placing/drawing/picker/nodePicker/modals into one `tool` reducer that resets on mode or map change.
- **Repro:** Code trace: Edit → ◌ Outline → click 3 corners → click another map in the Maps rail → ✓ Done (3) → new node on the new map with the old shape.
- **Evidence:** grep -n setDrawing client/src/pages/AtlasWorkspace.jsx (no call in 246-256 or 473-478)
- **Re-proved:** Code: switchMode (473-478) and the mapId effect (246-256) never call setDrawing. The draw HUD (1210-1221) and the Regions drawing prop (1055-1056) are not gated on mode. Browser repro on world 92: Edit, ◌ Outline, 3 corners, then 👁 View. The drawhud stayed visible and a 4th corner was accepted ('✓ Done (4)'). Clicking Done in View created placement 1099 'New node' with a shape on root map 298 (screenshot lanes/verify-confusing-code-b1/shots/f4-view-drawing.png shows the View posture with the o…
- **Also found as:** "An outline in progress survives a map change and a posture switch, so points fr…" (outlines); "An outline in progress follows you to another map (and into View), and Enter th…" (resilience)

### B046 · A category hidden on one map stays hidden on every map, and list spaces or one-category maps go blank with no way to show it again

Broken · medium · effort xs · found by `maps` (+1 other lane)

- **Where:** Legend chips (bottom-left) › hide a category, then open a list interior or a map with one category; AtlasWorkspace.jsx:52, 870-873, 1183
- **Files:** `client/src/pages/AtlasWorkspace.jsx:52`, `client/src/pages/AtlasWorkspace.jsx:870-873`, `client/src/pages/AtlasWorkspace.jsx:1183`, `client/src/pages/AtlasWorkspace.jsx:1088-1115`
- **What happens:** On /w/38/m/113 I clicked the 'Item' legend chip, then opened 'Chest contents' (a list of two items) from the tree. The list showed only its header: 0 rows, no legend (the legend renders only when !isList), and no empty-state message (placements.length is 2). Switched to map view it was still blank: 0 pins, no legend (legend needs more than one category), no empty-map message. hiddenCats is never reset when the map changes, and visible() applies it in list view too.
- **Why it matters:** The filter applies only where its legend is shown. Or it resets per map, or hidden rows are counted ('2 hidden by filter — Show all').
- **Fix:** In visible() (AtlasWorkspace.jsx:870-873), apply hiddenCats only when the legend is on screen (!isList && legend.length > 1). Also clear hiddenCats in the mapId effect (246-256), or show a 'N hidden — Show all' chip whenever a hidden category has placements on this map.
- **Repro:** /w/38/m/113 › legend 'Item' chip › Maps tree 'Chest contents'. The list is empty. Map ▾ › Show as 🗺 Map: still empty, with no chips.
- **Evidence:** t7 output: 'list rows visible: 0 legend present: 0 empty msg: 0'; 'as map: pins 0 legend 0 empty-map 0'; lanes/maps/shots/14-list-hidden-by-legend.png, 15-list-as-map-hidden.png
- **Re-proved:** Code: hiddenCats (AtlasWorkspace.jsx:52) changes only through toggleCat (797) and 'Show all' (1192). The mapId effect (246-256) never resets it. visible() (870-873) applies it in list view too. The legend renders only when !isList && legend.length > 1 (1183), and both empty states need placements.length === 0 (list 1104, map 1196). Live, world 72: I double-clicked The Keep and got into 'The Keep — Inside', whose legend was Place 1, Person 1, Item 1. I clicked the 'Item' chip, then 'Chest conten…
- **Also found as:** "Hiding a category in the legend sticks across maps; on a list or single-categor…" (canvas)

### C011 · One toggle click saves all five style keys, so the Button/Area kind (and the HUD's kind on redraw) stops doing anything

Confusing · medium · effort s · found by `outlines`

- **Where:** Atlas › Edit › inspector › Outline style; AtlasWorkspace.jsx:1502, 330-333, 341-342
- **Files:** `client/src/pages/AtlasWorkspace.jsx:326-333`, `client/src/pages/AtlasWorkspace.jsx:341-342`, `client/src/pages/AtlasWorkspace.jsx:350-353`, `client/src/pages/AtlasWorkspace.jsx:1500-1502`
- **What happens:** onOutlineStyle saves `{ ...styleOf(sel), [k]: v }`, so the first toggle click stores every key, e.g. {pop,fill,glow,grow,stroke}. The preset then never shows through again. I clicked 'Fill' on The Keep (kind button), then used ◌ Redraw the outline and picked 'Area' in the HUD. The PATCH saved shape_kind 'area' but kept style {pop:true,fill:true,glow:true,grow:true,stroke:true}. The inspector now highlights 'Area' while Fill/Outline/Grow/Glow/Pop are all on, and the region still grows, glows and pops. After 'Remove outline', the old kind and style stay on the row and silently apply to the next outline.
- **Why it matters:** Either the kind means something (toggles store only overrides that differ from the preset, and a kind change from the HUD resets them), or the kind is just a one-time preset button that is not shown as the current state.
- **Fix:** AtlasWorkspace.jsx:1502: store only keys that differ from OUTLINE_PRESETS[kind] (null when nothing differs). finishOutline (342): send shape_style: null when d.kind differs from the placement's current kind. clearOutline (351): also send shape_kind/shape_style null.
- **Repro:** /w/73/m/244 Edit → select The Keep → inspector Fill toggle → GET shows a full style object → ◌ Redraw the outline → HUD Area → trace → Enter → GET 892 {kind:'area', style:{…all true}}. Script s17.mjs.
- **Evidence:** s17 output: after redraw as Area {kind:'area',style:{pop:true,fill:true,glow:true,grow:true,stroke:true}}; inspector kind/toggles [['Area'],['Fill','Outline','Grow','Glow','Pop']]
- **Re-proved:** Code: AtlasWorkspace.jsx:1502 sends `{ ...styleOf(sel), [k]: v }`, the full merged object. cleanStyle (server/routes/atlas.js:52-58) stores every key present. finishOutline (342) never touches shape_style. clearOutline (351) sends only shape:null, and the PATCH handler (atlas.js:665-688) clears nothing else. Reproduced with style.mjs on clone 122. The Keep was set to kind button via the API; the inspector showed [Button] with Outline/Grow/Glow/Pop on. After clicking 'Fill', the GET showed style…

### C024 · Panning the map deselects the node being edited (the inspector falls back to 'This space')

Confusing · medium · effort s · found by `canvas`

- **Where:** Workspace › drag empty map space with a node selected; client/src/pages/AtlasWorkspace.jsx:848
- **Files:** `client/src/pages/AtlasWorkspace.jsx:848`, `client/src/components/MapPlane.jsx:145-147`
- **What happens:** I selected 'The Flood' (the inspector showed its editor), then dragged empty space 100px to pan. The inspector switched to the 'This space' panel. onEmptyPointerDown runs setSelId(null) on every pointerdown on the viewport, before MapPlane knows whether the press is a tap or a pan. In View posture the same code closes the node's reader.
- **Why it matters:** A pan keeps the selection. Only a clean tap on empty space should deselect.
- **Fix:** Move the deselect from onEmptyPointerDown into the tap path: MapPlane already sends only non-panned taps to onWorldClick (endPointer). In AtlasWorkspace.onWorldClick, when not placing and no region was hit, call setSelId(null). Drop the setSelId from onEmptyPointerDown.
- **Repro:** /w/33/m/97 › click the 'The Flood' pin › drag empty map space. The node editor is gone.
- **Evidence:** s2.mjs: 'insp title after select The Flood' → 'after pan, inspector shows space panel (deselected)'; lanes/canvas/shots/12-after-pan.png
- **Re-proved:** MapPlane.onPointerDown (MapPlane.jsx:145-147) calls onEmptyPointerDown on every viewport pointerdown, before it knows whether the press is a tap or a pan. AtlasWorkspace.onEmptyPointerDown (848) calls setSelId(null) whenever not placing and not on a .region. Reproduced on world 68: clicked 'The Flood', and the inspector showed the node editor ('TITLE … Event … STORY'). Then I dragged empty space about 100px. The inspector changed to 'THIS SPACE / The Sunken Keep' and .insp .spacepanel count was…

### P029 · Selecting a node from search (or a thread link) on the same map leaves its pin off-screen; the UX doc marks 'selection frames on map' as done

Product polish · medium · effort s · found by `canvas`

- **Where:** Workspace › Find a node… › Enter while zoomed in; client/src/pages/AtlasWorkspace.jsx:293-302
- **Files:** `client/src/pages/AtlasWorkspace.jsx:293-302`, `client/src/components/MapPlane.jsx:29-41`, `docs/UX-REDESIGN.md:157`, `docs/UX-REDESIGN.md:197`
- **What happens:** Zoomed into the top-left of the root map, I searched 'Drowned' and pressed Enter. The inspector switched to 'The Drowned Vault', but its pin sits at screen (11112, 9164) while the viewport is 900×788 at (230,46). jump() only calls setSelId, and MapPlane has no pan-to or frame API.
- **Why it matters:** Jumping to a node brings its pin into view, as the docs say is done.
- **Fix:** Expose a frame(xPct,yPct) from MapPlane (via a ref or a `focus` prop) that recentres the plane on that point, clamping zoom. Call it from jump(), footstep jumps and pendingSelect after navigation.
- **Repro:** On /w/33/m/97, wheel-zoom into the top-left corner, type 'Drowned' in 'Find a node…' and press Enter.
- **Evidence:** s24.mjs: selected pin in viewport? {inView:false, pin:[11112,9164]}; lanes/canvas/shots/A6-search-select-offscreen.png
- **Re-proved:** AtlasWorkspace.jsx:293-302: on the same map, jump() only calls setSelId(loc.placementId). Nothing else reacts to selId to move the view (grep for selId and scrollIntoView finds only class names and the links effect). MapPlane.jsx has no pan-to, frame or focus prop or ref: its props (lines 29-41) are mapKey, backdropUrl, worldRef, the click, context-menu and double-click handlers, controlsOffset, dblZoom and grid. Its only view setters are fit(), zoomAt() and the pan/pinch handlers. Reproduced o…

### B066 · A list-view interior still offers '◌ Outline on the map', which opens a drawing HUD with nothing to draw on

Broken · low · effort xs · found by `outlines` (+1 other lane)

- **Where:** Atlas › Edit › a list interior (e.g. 'Chest contents') › select a row › inspector › On this map › ◌ Outline on the map; AtlasWorkspace.jsx:1500
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1500`, `client/src/pages/AtlasWorkspace.jsx:2029-2050`
- **What happens:** The toolbar hides ◌ Outline when isList (line 1128), but the Inspector always gets onOutline. On map 246 (view 'list'), clicking it showed the teal HUD 'Outlining A coil of rope…' over the list header with no Regions SVG on the page (svg.regions count 0). Clicks do nothing, Enter says 'An outline needs at least three corners', and only Esc/✕ gets out.
- **Why it matters:** No outline controls on list interiors.
- **Fix:** AtlasWorkspace.jsx:1500: pass `onOutline={isList || sel.node.category === 'party' ? undefined : () => startOutline(sel.id)}`. The Inspector already hides the section when onOutline is falsy.
- **Repro:** /w/73/m/246 Edit → click 'A coil of rope' → scroll the inspector to On this map → ◌ Outline on the map. Script s6.mjs.
- **Evidence:** shots/s6-03-list-outline.png; s6 output: regions svg 0
- **Re-proved:** Code: toolbar ◌ Outline is wrapped in {!isList && …} at AtlasWorkspace.jsx:1128, but the Inspector gets onOutline={() => startOutline(sel.id)} unconditionally at line 1500 and renders the button whenever onOutline is set (lines 2029-2035). The .drawhud (line 1210) renders whenever `drawing` is set, while MapPlane and Regions only mount when !isList (line 1035). Reproduced on my clone (world 123, list map 398 'Chest contents'): in Edit the toolbar showed only ['＋ Add node','⤓ Place existing','Ma…
- **Also found as:** "Outlining the Party saves a shape that is never drawn, and the inspector then s…" (outlines)

### B068 · DM-only outlined places show their name all the time; other outlines show it only on hover

Broken · low · effort xs · found by `outlines`

- **Where:** Atlas › Edit/View › map with a DM-only outlined place; client/src/styles/atlas.scss:743
- **Files:** `client/src/styles/atlas.scss:743-745`
- **What happens:** `.atlas .rlabel.secret{opacity:.45}` overrides the base `.rlabel{opacity:0}`, so a DM-only region's tag is always visible at 45%. Measured idle opacities: every label 0 except '🔒The Drowned Vault' 0.45. So secret places are the only outlines whose names always show, the opposite of their 'faint' treatment elsewhere.
- **Why it matters:** DM-only labels follow the same show rules (hover / selected / labels-always / touch), just fainter when shown.
- **Fix:** atlas.scss:743-744: change to `.atlas .rlabel.secret.on{opacity:.7}` only, and for touch `@media (hover:none){.atlas .rlabel.secret{opacity:.45}}`.
- **Repro:** /w/73/m/244 Edit, mouse off the map → 'The Drowned Vault' tag is visible while others are hidden. Script s15.mjs.
- **Evidence:** shots/s7-01-edit-all.png; s15 output label opacity idle […['🔒The Drowned Vaul','rlabel secret','0.45']…]
- **Re-proved:** atlas.scss:736-746: the base `.atlas .rlabel{opacity:0}` has 2 classes, and `.atlas .rlabel.secret{opacity:.45}` (line 743) has 3, so the secret rule wins even when the label is not .on. Reproduced with desktop hover emulation on my clone after giving the DM-only 'The Drowned Vault' an outline. The idle label opacities were [['Your first node','rlabel','0'],['Old Gate','rlabel','0'],['🔒The Drowned Vault','rlabel secret','0.45']]. The screenshots (and the finder's s12-01) show the Vault tag vis…

### B074 · An interior whose owner node stands only inside itself disappears from the Maps tree, and its crumb reads 'X ▸ X'

Broken · low · effort s · found by `maps`

- **Where:** Maps tree / breadcrumb; AtlasWorkspace.jsx:1691-1700; server/routes/atlas.js:62-74, 262
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1691-1700`, `server/routes/atlas.js:262`, `server/routes/atlas.js:62-74`
- **What happens:** I placed Supply Chest inside its own interior 'Chest contents' (114) and removed its placement on the parent. GET /worlds/38/maps then gave 114 parentMapId = 114. MapTree files it under itself, so it shows neither in the tree nor under 'Unplaced'. The search's Unplaced filter doesn't list the owner either (it counts as placed), and the crumb inside reads 'Chest contents ▸ Chest contents'. Reachable in the UI with ⤓ Place existing inside the interior plus ⤒ Remove from map on the parent.
- **Why it matters:** Self-owned or cyclic interiors appear under 'Unplaced', and the crumb doesn't repeat the space.
- **Fix:** In MapTree's kids builder, treat m.parentMapId === m.id (or any parent chain that doesn't reach rootId) as an orphan (pid null). In SQL, exclude p.map_id = m.id when picking parent_map_id (atlas.js:262) and in breadcrumb(). Or refuse placing a node on its own interior.
- **Repro:** POST /api/atlas/maps/114/placements {node_id:341} then DELETE /api/atlas/placements/433. Open /w/38/m/112: 'Chest contents' is missing from the tree.
- **Evidence:** t20 output: maps [[114,"Chest contents",114]]; tree 'The Sunken Keep | The Keep — Inside' (no Chest contents, no Unplaced); '114 crumbs: Chest contents ▸ Chest contents'. State restored afterwards.
- **Re-proved:** No guard stops a node being placed on its own interior: POST /maps/:mapId/placements (server/routes/atlas.js:395-406) checks only the world. On my clone (world 76) I POSTed node 815 (Supply Chest, owner of map 258 'Chest contents') onto 258 and got 201, then deleted its placement on 257. GET /worlds/76/maps then returned [258,'Chest contents',815,258], so parentMapId equals the map's own id. In MapTree (AtlasWorkspace.jsx:1691-1700) that files 258 under itself, so it is neither a root child nor…

### B075 · The Maps tree thumbnail stays stale after the backdrop is changed or removed

Broken · low · effort xs · found by `maps`

- **Where:** Maps tree row thumbnail; AtlasWorkspace.jsx:433-434
- **Files:** `client/src/pages/AtlasWorkspace.jsx:433-434`
- **What happens:** After 'Remove current image' cleared map 112's base (GET returned backdropUrl null), the root row in the tree still showed the old thumbnail. setBackdrop refreshes the map but not the tree. The thumbnail also always shows the base art, never the period art on screen.
- **Why it matters:** The tree thumbnail updates when the backdrop changes.
- **Fix:** Call refreshTree() in setBackdrop's .then (line 434), as renameMap does.
- **Repro:** /w/38/m/112 › Change the backdrop… › Remove current image. The tree row keeps its thumbnail until reload.
- **Evidence:** t17 output: 'after Remove current image: base null tree thumb (stale?) e/clone-a9bf26cf371e3eafc8.svg'; shots/10-base-removed-timed-visible.png (red thumb after base removed)
- **Re-proved:** Code: setBackdrop (AtlasWorkspace.jsx:433-434) only chains refreshMap. It doesn't call refreshTree, unlike renameMap (771) and doUndo (150). The tree thumbnail comes from maps.image_id alone (server/routes/atlas.js:257-265: LEFT JOIN images i ON m.image_id=i.id), so it is always the base art and never period art. Live on my clone (world 77): the root row's img.tthumb src was .../clone-e06021d621311bb754.svg. I used Map ▾ › Change the backdrop… › Remove current image. The server then returned ba…

### B083 · The 'Glow' style toggle has no visible effect, and the 'Pop' shadow is clipped away

Broken · low · effort s · found by `outlines`

- **Where:** The inspector tooltips (AtlasWorkspace.jsx:2045) are Glow 'A halo under the pointer' and Pop 'The art inside lifts out of the map under the pointer'. Neither says 'with a shadow'. The shadow promise is in the prose: Regions.jsx:8 comment ('lifted 5% with a shadow'), atlas.scss:730 comment and CLAUDE.md:80-81. Those should be fixed or updated together with atlas.scss:725/731 and Regions.jsx:110-116.
- **Files:** `client/src/styles/atlas.scss:725`, `client/src/styles/atlas.scss:731`, `client/src/components/Regions.jsx:110-116`
- **What happens:** CSS filter lengths on SVG elements are in user units of the 0–100 viewBox. `drop-shadow(0 0 5px …)` blurs a 1.5px stroke over about 5% of the plane, and a pixel diff of the hovered Keep with and without the region filter changed 2 pixels (max delta 5/765). A controlled test (same scaled viewBox, stroke-only polygon) showed 0 changed pixels at 5px and a visible halo at 0.3px. Pop's `drop-shadow(0 6px 10px)` sits on the same `<g>` as the clip-path, and filters run before clipping, so the shadow never shows outside the outline. The diff found no changed pixels outside the grown outline's bbox. 'Lifts out of the map … with a shadow' is really a 5% zoom plus brightness inside the outline.
- **Why it matters:** Glow shows a halo and Pop shows a lifted shadow, as the tooltips say.
- **Fix:** Regions.jsx: move the filters off the SVG user space. Wrap the popped `<g>` in an outer `<g>` that carries the drop-shadow (so the clip applies inside it), and express blur and offset in user units scaled by --pinscale (about 0.2–0.4 units). Or use an SVG `<filter>` with filterUnits/primitiveUnits sized for the 0–100 box. Same for .region.s-glow (atlas.scss:725).
- **Repro:** Player View /p/vBS6xCFNx7TljWw10CfHoFiv desktop → hover The Keep → screenshot with and without `.atlas .region{filter:none}` / `.atlas .rpop{filter:none}`. Scripts s9.mjs + diff.mjs; controlled test filt.mjs.
- **Evidence:** diff.mjs s9-03 vs s9-04: {changed:2,maxd:5}; s9-02 vs s9-03 bbox [189,125,354,276] only; filt.mjs 5px: changed 0, 0.3px: changed 8541
- **Re-proved:** Controlled test (filt.mjs, local page, 100x100 viewBox stretched to 1000x700, 1.5px non-scaling stroke). drop-shadow 5px changed pixels by at most 4/765, which is invisible, while 0.3px gave maxd 65, a visible halo. A drop-shadow on a <g> that also carries the clip-path changed 0 pixels inside or outside the clip, because filter runs before clip. Live check (glow.mjs, Player View of clone 122, The Keep as kind button, hovered): computed filter was drop-shadow(rgba(233,205,140,.55) 0 0 5px). Dis… _(partly — the corrected location is used above)_

### B085 · After 'Switch world', the Maps tree keeps the previous world's folds and overwrites the new world's saved folds

Broken · low · effort xs · found by `maps`

- **Where:** Top-left world select (title 'Switch world') › Maps tree carets; AtlasWorkspace.jsx:1684-1689
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1011`, `client/src/pages/AtlasWorkspace.jsx:1684-1689`
- **What happens:** World 39 had 'The Keep — Inside' folded (localStorage atlas_tree_39 = [116]). From world 38 I switched to 39 with the brand select. The tree showed the branch unfolded, because MapTree stays mounted and useState read the old key only once. Folding the root in 39 then wrote atlas_tree_39 = [115], losing [116].
- **Why it matters:** Each world's saved fold state is loaded when switching to it.
- **Fix:** Render <MapTree key={worldId} …/> at AtlasWorkspace.jsx:1011, or reload folded in a useEffect keyed on worldId.
- **Repro:** Fold a branch in world B. Open world A, use the brand select to switch to B, and check the folds and localStorage atlas_tree_<B>.
- **Evidence:** t11 output: after in-app switch tree shows 'The Keep — Inside | Chest contents' unfolded; after toggling root: { t39: '[115]' } (was '[116]')
- **Re-proved:** Code: MapTree (AtlasWorkspace.jsx:1684-1689) computes key=`atlas_tree_${worldId}` on every render. The folded Set comes from a useState initialiser that runs once. The MapTree at line 1011 has no key. On a world switch, world state is not cleared, so the 'Loading world…' early return (876) doesn't unmount the tree. Live repro with my own clones of 27 (worlds 77 = A and 78 = B, both deleted afterwards): - In B, folded 'The Keep — Inside'. localStorage atlas_tree_78 = [263], and the rows showed o…

### B086 · Double-clicking the zoom ＋/−/⊡ buttons also fires the map's double-click zoom

Broken · low · effort xs · found by `canvas`

- **Where:** Workspace › zoom controls (bottom-right of the map); client/src/components/MapPlane.jsx:248-255
- **Files:** `client/src/components/MapPlane.jsx:224-229`, `client/src/components/MapPlane.jsx:248-255`
- **What happens:** From fit (scale 0.3375): double-clicking ⊡ 'Fit the whole map' ended zoomed 1.7× toward the bottom-right (0.574). Double-clicking '−' ended at 0.255 instead of 0.15. Double-clicking '＋' ended at 1.29 instead of 0.76. The buttons stop pointerdown and click but not dblclick, which bubbles to .mp-viewport's onDoubleClick. Footprint buttons (.fstep) leak the same way.
- **Why it matters:** Rapid clicks on a zoom control act only as that control.
- **Fix:** Add onDoubleClick={(e) => e.stopPropagation()} to .mp-controls at MapPlane.jsx:248 (and to the .fstep buttons in PartyTrail.jsx:49). Or have the viewport's onDoubleClick ignore targets inside button elements.
- **Repro:** /w/33/m/97 › double-click the ⊡ button. The map zooms in instead of fitting.
- **Evidence:** s25.mjs: 'after double-clicking Fit translate(-579.8px, -321.2px) scale(0.57375)'; lanes/canvas/shots/A7-dblclick-fit.png
- **Re-proved:** MapPlane.jsx:248-255: the ＋/−/⊡ buttons stop onClick and onPointerDown but have no onDoubleClick. The viewport's onDoubleClick (:224-229) zooms 1.7x. PartyTrail.jsx:49-54 .fstep likewise stops only pointerdown and click. Live, on my clone, fit gives scale(0.3375). Double-clicking ⊡ ended at translate(-579.8px,-321.2px) scale(0.57375). Double-clicking − ended at scale(0.255). Double-clicking ＋ ended at scale(1.29094). All match the finder's numbers exactly.

### B089 · Right mouse button drags pins, and right-clicking a pin offers only map actions

Broken · low · effort s · found by `canvas`

- **Where:** Workspace (Edit) › right-press on a pin; client/src/pages/AtlasWorkspace.jsx:671-679
- **Files:** `client/src/pages/AtlasWorkspace.jsx:671-679`, `client/src/pages/AtlasWorkspace.jsx:849-857`, `client/src/pages/AtlasWorkspace.jsx:1593-1602`
- **What happens:** onPinDown ignores e.button. Holding the right button on 'Your first node' and moving it moved the pin from (70,30) to (82.0,43.7), and it saved. A right-click on a pin selects it and opens the generic menu: '＋ New node here' (which would drop a node on top of the pin), 'Outline a place from here', 'Outline “Your first node” from here', 'Place an existing node here…'. There are no pin actions (open interior, remove from map, delete).
- **Why it matters:** Only the primary button drags. Right-clicking a pin offers that pin's actions.
- **Fix:** In onPinDown, return early when e.pointerType==='mouse' && e.button!==0. Add a pin branch to the context menu, e.g. an onContextMenu on .pin that sets ctx with {placementId}, listing Open interior / Outline / Remove from this map / Delete….
- **Repro:** /w/33/m/97 › right-press 'Your first node', drag 120px and release. GET /api/atlas/maps/97 shows it moved.
- **Evidence:** s5.mjs 'right-drag moved pin? {before:[70,30],after:[82.03,43.70]}'; lanes/canvas/shots/35-ctx-on-pin.png
- **Re-proved:** onPinDown (AtlasWorkspace.jsx:671-679) never checks e.button. In contrast, MapPlane's onPointerDown (MapPlane.jsx:145) ignores non-primary mouse buttons. Live, on my clone: I right-pressed 'Your first node', moved 120,90 and released. GET /api/atlas/maps/235 then showed it moved from [70,30] to [82.04,43.70]. A plain right-click on 'The Flood' selected it (the Inspector title read 'The Flood'). The menu listed only ['＋ New node here','◌ Outline a place from here','◌ Outline “The Flood” from her…

### C029 · The Map ▾ menu is inconsistent: 'Show as' keeps it open, Footprints shows in worlds with no party, and global settings sit in a 'This space' menu

Confusing · low · effort xs · found by `maps`

- **Where:** ✏ Edit › Map ▾ ('This space: backdrop art, name, map or list'); AtlasWorkspace.jsx:1133-1175
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1150-1160`, `client/src/pages/AtlasWorkspace.jsx:1168-1172`
- **What happens:** (1) Every menu item closes the menu except the '🗺 Map / ☰ List' buttons, which leave it open. (2) '👣 Footprints ✓' is offered whenever the timeline is on, even in world 38, where GET /worlds/38/trail is {steps:[]} and there's no party. (3) Grid, 'Always show names' and Footprints are per-browser settings for every map (localStorage atlas_grid, atlas_labels, atlas_prints), inside a menu whose tooltip says it's about 'This space'.
- **Why it matters:** Consistent close behaviour. Footprints hidden when the world has no party trail. View settings grouped under a 'View' label, or separated from the space's own settings.
- **Fix:** Call setMapMenu(false) in setMapView's buttons. Render Footprints only when trail.length > 0. Put a small 'View (all maps)' divider above Grid, names and Footprints.
- **Repro:** /w/38/m/114 › Map ▾ › click ☰ List: the menu stays open. /w/38/m/112 › Map ▾ shows 'Footprints ✓' in a party-less world.
- **Evidence:** t7b output 'menu still open after List click: 1'; t18 output menu includes '👣 Footprints ✓' with trail steps []
- **Re-proved:** All three parts reproduced live on my clone of 27 (world 77). (1) Show as does not close the menu. The Show as buttons (AtlasWorkspace.jsx:1170-1171) call only setMapView, while every other item calls setMapMenu(false). After clicking ☰ List, .mapmenu .apop count was still 1, and still 1 after clicking 🗺 Map. (2) Footprints shows without a party trail. The Footprints item is gated only on !isList && tl?.enabled (1156-1159). The menu listed '👣 Footprints ✓' while GET /api/atlas/worlds/77/trail…

### C032 · Outlining an existing pin always starts as 'Area'; a new outline starts as the remembered kind or 'Button'

Confusing · low · effort xs · found by `outlines`

- **Where:** Atlas › ◌ Outline vs inspector ◌ Outline on the map / right-click 'Outline “X” from here'; AtlasWorkspace.jsx:322
- **Files:** `client/src/pages/AtlasWorkspace.jsx:319-324`, `server/config/schema.sql:186`
- **What happens:** startOutline uses `cur?.shapeKind || localStorage || 'button'`. Every placement row has shape_kind NOT NULL DEFAULT 'area' (schema.sql:186), so the first outline of an existing pin always starts as Area, ignoring the remembered HUD choice (atlas_outline_kind). A brand-new place from the toolbar starts as Button. Seen: toolbar outline saved kind 'button'; outlining The Keep and 'Your first node' showed 'Area' selected in the HUD.
- **Why it matters:** One default rule: the remembered kind, or the placement's kind only when it already has an outline.
- **Fix:** AtlasWorkspace.jsx:322: `const kind = (cur?.shape && cur.shapeKind) || localStorage.getItem('atlas_outline_kind') || 'button'`.
- **Repro:** Edit → ◌ Outline → HUD shows Button; select a plain pin → ◌ Outline on the map → HUD shows Area. Scripts s1.mjs, s4.mjs, s6.mjs.
- **Evidence:** s4 output: hud kind on ['Area'] for The Keep; s1: new place saved kind 'button'
- **Re-proved:** AtlasWorkspace.jsx:322 is `const kind = cur?.shapeKind || localStorage.getItem('atlas_outline_kind') || 'button'`. server/routes/atlas.js:309 maps every placement to `shapeKind: r.shape_kind || 'area'`, and schema.sql:186 has `shape_kind VARCHAR(10) NOT NULL DEFAULT 'area'`. So for any existing placement, cur.shapeKind is always truthy: 'area' for a plain pin. The remembered kind (setDrawKind at line 325 writes atlas_outline_kind) is never reached. Callers: toolbar ◌ Outline at line 1131 calls …

### C045 · The '?' help only describes pins; outlined places and the Outline tool are missing

Confusing · low · effort xs · found by `outlines`

- **Where:** Core is true for AtlasWorkspace.jsx:1235-1236, and nothing covers the Outline tool. Three details are wrong. (1) The legend at line 1241 already mentions outlined places ('gold shapes = outlined places (hover for the name)'), so outlined places are not entirely missing. (2) The legend's 'faint = DM-only' and 'dashed purple = not here at this moment' entries cover shapes too: atlas.scss:726 .region.secret has opacity .45 and :727 .region.ghost has a purple dashed stroke. (3) The 'no hover on touch' objection does not hold, because atlas.scss:745 '@media (hover: none){.atlas .rlabel{opacity:1}}' shows the names all the time on touch screens. Also, the drawing HUD at AtlasWorkspace.jsx:1211-1213 lists the outline keys (Enter/double-click closes, Backspace, Esc, Space) while drawing. What is missing is only the discoverability of the tool in the help.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1233-1242`
- **What happens:** The help says 'Click a pin to read it · drag a pin to move it' and 'Double-click a ◎ pin to step inside', but outlined places have no pin (click the shape, double-click to enter, and they can't be dragged). It never mentions ◌ Outline or its keys (Enter/double-click closes, Backspace, Esc, Space). The legend says 'gold shapes = outlined places (hover for the name)', but there is no hover on touch, DM-only shapes are faint, and out-of-time shapes are dashed purple.
- **Why it matters:** The help covers outlined places the same way it covers pins.
- **Fix:** AtlasWorkspace.jsx:1235-1236: say 'Click a pin or outlined place to read it · double-click one with ◎ to step inside'. Add an Edit-only line: '◌ Outline: click corners or drag · Enter closes · Backspace undoes · Esc cancels'.
- **Repro:** Edit → click ? → read the popover.
- **Evidence:** shots under lanes/canvas/ show the same popover; read in source at AtlasWorkspace.jsx:1233-1242
- **Re-proved:** AtlasWorkspace.jsx:1234-1242 (help popover). The interaction lines talk only about pins: 'Click a pin to read it · drag a pin to move it', 'Double-click a ◎ pin to step inside'. No line mentions the ◌ Outline tool or its keys. Outlined places draw no pin (line 1061 filters !p.shape) and cannot be dragged, since regions have no drag handler and a press on them pans the map (Regions.jsx:15). _(partly — the corrected location is used above)_

### C060 · Map tree: folding an ancestor of the current map silently does nothing, then takes effect later

Confusing · low · effort xs · found by `canvas`

- **Where:** Maps rail › ▾ caret or 'collapse all' while on a nested map; client/src/pages/AtlasWorkspace.jsx:1703-1712
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1703-1712`, `client/src/pages/AtlasWorkspace.jsx:1724-1725`
- **What happens:** On 'Chest contents', 'collapse all' and clicking the ▾ caret (titled 'Fold this branch') on 'The Keep — Inside' left the tree unchanged, because isFolded ignores folds on the open path. toggle() still records the fold in localStorage, so the branch collapses later when the DM navigates elsewhere, with no link to the earlier click.
- **Why it matters:** Either the caret visibly folds (the current row can hide under a folded parent that stays marked), or the caret is disabled with a tooltip like 'contains the map you're on'.
- **Fix:** Render carets on openPath ancestors as disabled with an explanatory title and skip recording those folds. Or let them fold and keep the current row highlighted in its folded parent.
- **Repro:** Open 'Chest contents' from the tree, click 'collapse all'. Nothing changes.
- **Evidence:** s7.mjs 'collapse all while on a deep map ["▾The Sunken Keep","▾The Keep — Inside","Chest contents [on]"]'
- **Re-proved:** Code at AtlasWorkspace.jsx:1703-1712 matches the finding. openPath collects the current map's ancestors. isFolded = folded.has(id) && !openPath.has(id), so a fold on an ancestor never shows. toggle() and foldAll() still write the fold to localStorage via remember(). The caret title is 'Fold this branch' while the branch is not closed (:1724). Live check on my clone of 27: on 'Chest contents', 'collapse all' left the rows as ['▾The Sunken Keep','▾The Keep — Inside','Chest contents [on]']. The 'T…

### C066 · Clicking a thread or search result enters the target's interior if it has one, instead of showing the target

Confusing · low · effort s · found by `confusing-code`

- **Where:** Reader › Threads, Inspector › Links, top search; client/src/pages/AtlasWorkspace.jsx:293-302; server/routes/atlas.js:455-463
- **Files:** `client/src/pages/AtlasWorkspace.jsx:293`, `server/routes/atlas.js:455`
- **What happens:** jump() calls /nodes/:id/locate, which returns the node's interior map first and only otherwise a placement (atlas.js:459-462). A thread to a person selects the person on their map and opens their story; a thread to 'The Tavern' (has an interior) drops the DM inside the tavern with nothing selected, so the tavern's own description never shows. Same click, different outcome depending on a property the DM can't see. Used by search (929, 940), reader threads (1410) and inspector links (2011, 2020).
- **Why it matters:** A thread shows the linked thing; '◎ Look inside' is the explicit way in.
- **Fix:** Have locate return both { placementMapId, placementId, interiorMapId } and let jump select the placement; rename to showNode.
- **Repro:** Code trace.
- **Re-proved:** atlas.js:455-463 (GET /nodes/:id/locate) returns `{ mapId: n.interior_map_id }` with no placementId whenever the node has an interior (line 460), and falls back to its first placement only otherwise (461-462). jump() (AtlasWorkspace.jsx:293-302) selects a placement only when loc.placementId is set. For a node with an interior it navigates to that interior with nothing selected, or, if already inside it, returns without doing anything. With nothing selected, the View reader (1335-1349) shows the…

### C079 · In a list view, ＋ Add node and the N key create a node instantly with no feedback, while the hints say 'then click the map'

Confusing · low · effort xs · found by `canvas`

- **Where:** The problem is 'no toast or undo after one keypress, and hint text that doesn't match lists'. It is not 'no feedback': the new row gets selected and the ✓ Saved chip shows. The hints are at AtlasWorkspace.jsx:1478 (sphint) and :1238 (help popover). The toolbar title 'Create a brand-new node on this map' is at :1120.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:724-727`, `client/src/pages/AtlasWorkspace.jsx:1119-1124`, `client/src/pages/AtlasWorkspace.jsx:1478`, `client/src/pages/AtlasWorkspace.jsx:1238`
- **What happens:** One stray N keypress on 'Chest contents' created 'New node' (id 464) with no toast. On a map, N only toggles a harmless placing mode. The inspector's space panel on the list still says 'Click a node to edit it — or use + Add node, then click the map.', and the help says 'N starts a new node · Enter drops it at the cursor'.
- **Why it matters:** N and the button behave the same on maps and lists (e.g. a toast 'Added “New node” — Undo'), and the hint text matches the view.
- **Fix:** On lists, show an ok flash with the undo pattern after dropNode, or require Enter to confirm. Make the sphint and toolbar title depend on isList ('adds a row to this list').
- **Repro:** /w/33/m/99 › click the list background › press n. GET /api/atlas/maps/99 shows a new node.
- **Evidence:** s15.mjs 'E N pressed once in a list: nodes created [[464,"New node"]]', 'E hint/feedback null'
- **Re-proved:** Checked against the code at HEAD 32ef89c, which matches origin/main. In a list, the N keydown handler at AtlasWorkspace.jsx:724-727 and the toolbar button at :1119-1124 both call dropNode(50, 50) straight away. On a map they only toggle placing mode. dropNode (:305-309) has no setFlash, so no toast and no undo offer appear. The hint text doesn't change for lists either. The space-panel sphint at :1478 ('then click the map') isn't gated by isList, and the help line at :1238 ('N starts a new node… _(partly — the corrected location is used above)_

### P047 · Right-click in the middle of a trace opens the menu, and picking 'Outline a place from here' silently discards the trace

Product polish · low · effort xs · found by `outlines`

- **Where:** Atlas › Edit › ◌ Outline (tracing) › right-click; AtlasWorkspace.jsx:849-857, 1042, 1131, 1596
- **Files:** `client/src/pages/AtlasWorkspace.jsx:849-857`, `client/src/pages/AtlasWorkspace.jsx:1042`, `client/src/pages/AtlasWorkspace.jsx:1129-1131`
- **What happens:** The plane's onContextMenu still fires while drawing. After 2 corners, a right-click opened '＋ New node here / ◌ Outline a place from here / ⤓ Place an existing node here…'. Picking 'Outline a place from here' restarted the trace with 1 point, and the 2 corners were lost without warning. '＋ New node here' drops a node while the trace is still open. Also, during a redraw (◌ Redraw the outline) the toolbar's ◌ Outline is not highlighted, yet clicking it cancels the redraw instead of starting a new place.
- **Why it matters:** The context menu is off while drawing (or right-click undoes the last corner). The toolbar button reflects any drawing in progress.
- **Fix:** AtlasWorkspace.jsx:1042: `onWorldContextMenu={mode === 'edit' && !drawing ? onWorldContext : undefined}` (or call e.preventDefault() and pop a corner). Line 1129: mark the tool 'on' for any `drawing` and give it a title like 'Cancel the outline' while drawing.
- **Repro:** /w/73/m/244 Edit → ◌ Outline → click 2 corners → right-click the map → ◌ Outline a place from here → corner count drops to 1. Script s12.mjs / s19.mjs.
- **Evidence:** shots/s12-01-ctx-while-drawing.png; s12 output: ctx menu while drawing [...], pts 2 → after ctx Outline-from-here pts 1
- **Re-proved:** Code: onWorldContextMenu={mode === 'edit' ? onWorldContext : undefined} (AtlasWorkspace.jsx:1042) has no `drawing` guard. MapPlane.jsx:240 fires it on the plane, and Regions' onDown ignores non-primary buttons, so the contextmenu event bubbles up. The ctx item calls startOutline(null,[px,py]) (line 1596), which resets pts to [firstPt] (line 323). dropNode never clears `drawing`. The toolbar button is 'on' only for `drawing && !drawing.placementId` and its onClick is `drawing ? setDrawing(null) …

### P069 · Co-located pins stack exactly: the lower one can't be seen, hovered or clicked (only footprints fan out)

Product polish · low · effort s · found by `canvas`

- **Where:** One detail is wrong: selecting the lower pin via search does not leave it fully hidden. Its selection ring and its name label 'Your first node' do show (verify/canvas-b3/shots/13-lower-selected.png). Only its icon stays covered by the top pin's icon, and clicking that spot still selects the top node. Also, a placing-mode click on a pin drops the node at the click point (onWorldClick converts clientX/Y), not exactly at the pin's x/y. The file citations are accurate.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1061-1066`, `client/src/pages/AtlasWorkspace.jsx:701-716`, `client/src/pages/AtlasWorkspace.jsx:673`, `client/src/components/PartyTrail.jsx:18-35`
- **What happens:** Pressing N, Enter, N, Enter without moving the mouse created placements 462 and 463, both at (15,85). Their pins have identical boxes, clicking always selects the top one, and hover shows only its name. With 'Always show names' on, the two labels overprint into garbage ('TheYour first node Vault', screenshot 72). Clicking an existing pin in placing mode also drops the new node exactly on it (by design, so the click reaches the plane). The selected pin isn't raised, so selecting the lower one via search leaves it hidden. PartyTrail fans out co-located footprints, but ordinary pins get nothing.
- **Why it matters:** Every placed node stays reachable on the map.
- **Fix:** Reuse PartyTrail's screen-pixel fan-out (group by rounded x/y, offset later pins via --ox/--oy) for all pins. Give .pin.sel a z-index above its neighbours. Optionally nudge keyboard and ctx drops that would land on an existing pin.
- **Repro:** /w/34/m/100: PATCH placement 391 to x 70, y 30 (the same spot as 'Your first node'), then click that spot twice. 'The Drowned Vault' is selected both times.
- **Evidence:** s15.mjs 'D two N+Enter drops [[462,15,85],[463,15,85]]'; s10.mjs stacked pins same box, 'click on stacked spot selects The Drowned Vault' twice; lanes/canvas/shots/72-stacked-labels-on.png
- **Re-proved:** Code: pins are absolutely positioned at left/top % with z-index:3 (atlas.scss:73). Only :hover raises one to 5 (atlas.scss:618); .pin.sel (atlas.scss:79) has no z-index. Only PartyTrail fans out co-located steps (PartyTrail.jsx:18-35). keyboardDropPoint (AtlasWorkspace.jsx:701-716) drops at the cursor, and onPinDown (:673) lets placing-mode presses through. Live, on my clone of world 27 (id 70, since deleted): N,Enter,N,Enter without moving the mouse made placements 880 and 881, both at (15.0,8… _(partly — the corrected location is used above)_

### P089 · No cursor change in placing mode: the only cue is a small italic hint in the corner

Product polish · low · effort xs · found by `canvas`

- **Where:** The missing cursor belongs on .mp-viewport at client/src/styles/atlas.scss:45, and the pin grab cursor is at :74. The hint styling is at :65-67. The root class list for the suggested 'placing' class is at AtlasWorkspace.jsx:885.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:885`, `client/src/styles/atlas.scss:63-66`
- **What happens:** While placing, the computed cursor over .mp-viewport is 'auto' (outline drawing gets crosshair via `.regions.drawing`). Pins still show the grab cursor even though clicking them drops the new node on top.
- **Why it matters:** A crosshair or copy cursor while placing.
- **Fix:** Add a 'placing' class to the .atlas root when placing is set. Style `.atlas.placing .mp-viewport, .atlas.placing .pin{cursor:crosshair}`.
- **Repro:** Click ＋ Add node and move the mouse over the map.
- **Evidence:** s4.mjs 'cursor on plane while placing auto'
- **Re-proved:** No stylesheet sets a cursor for placing mode. The .mp-viewport rule at atlas.scss:45 has no cursor. Grepping client/src for 'placing' in styles finds nothing, and the root div at AtlasWorkspace.jsx:885 adds only the labelson and drawing classes, never a placing class. The only crosshair rule is `.atlas .regions.drawing` (atlas.scss:712). `.pin` keeps cursor:grab at all times (atlas.scss:74). In placing mode, onPinDown (:671-673) returns without stopPropagation, so a press on a pin reaches MapPl… _(partly — the corrected location is used above)_

