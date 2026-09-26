# WP-18 · Keyboard, dialogs and screen readers

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Give modals and popovers real dialog behaviour, make pins, tree rows and threads reachable by keyboard, and label icon buttons, toggles and fields.

**Do after:** [WP-12](WP-12-confirm-before-destroying.md), [WP-13](WP-13-the-map-surface-canvas-tree-and-outlines.md)

**Notes:** Build one Modal/Popover primitive (Esc closes it, focus moves in and returns, role=dialog) and replace the per-page copies. client-dead-26 in WP-20 notes the duplicated Modal. a11y-polish-06 also covers N toggling Add-node behind an open modal. This comes after WP-12 (the new confirm modal) and WP-13 (pins and regions change there).

## Checklist

- [ ] **B037** · medium · s · Dashboard: pressing Enter on ⋯ World options, 'Edit details' or the featured card's 'The Archive' opens the world instead
- [ ] **P027** · medium · m · Modals have no dialog behaviour: Escape ignored in 9 of them, focus not moved in or trapped, and dropped to <body> on close
- [ ] **P032** · medium · m · Keyboard users can't reach the map tree, breadcrumbs, pins, outlined places, list rows or thread links (DM and Player View)
- [ ] **P033** · medium · s · Icon-only buttons are announced by their glyph ('✕', '◂', '⏳', '⚙', '▲'…), and several have no label at all
- [ ] **P042** · low · s · Image upload and bible upload can't be reached by keyboard: the file inputs are hidden inside <label>s
- [ ] **P051** · low · s · World switcher: pressing an arrow key on the focused select jumps to another world immediately
- [ ] **P085** · low · s · Form fields and both time sliders have no accessible name (axe 'label' critical in every posture)
- [ ] **P086** · low · s · Toggle buttons don't expose their on/off state
- [ ] **P091** · low · s · No landmarks or h1 on the workspace, Player View, Archive or 404
- [ ] **P095** · low · s · Popovers and menus ignore Escape and expose no open state; Escape doesn't close the Player sheet or the DM reader either
- [ ] **P097** · low · xs · Keyboard focus and motion: world switchers drop the focus ring, Archive folder ⋯ is invisible when focused, no prefers-reduced-motion anywhere
- [ ] **P098** · low · s · Toasts are silent to screen readers, and Undo lives only in a 9-second toast with no keyboard route

## Items

### B037 · Dashboard: pressing Enter on ⋯ World options, 'Edit details' or the featured card's 'The Archive' opens the world instead

Broken · medium · effort s · found by `a11y-polish` (+1 other lane)

- **Where:** Dashboard › world card / featured card; client/src/pages/Dashboard.jsx:201, 231
- **Files:** `client/src/pages/Dashboard.jsx:196-202`, `client/src/pages/Dashboard.jsx:225-232`, `client/src/pages/Dashboard.jsx:85-90`
- **What happens:** Tab to a card's ⋯ ('World options') and press Enter: the page navigates to /w/125/m/402 and no menu opens. Opening the menu with Space and pressing Enter on 'Edit details' also navigates into the world, with no modal. Pressing Enter on the featured card's 'The Archive' link lands on /w/125/m/402, not the Archive. The card containers are `<section|article role="button" onKeyDown={Enter → open(w)}>`, so every Enter keydown bubbling up from a child button or link opens the world. axe also reports nested-interactive (serious) and aria-allowed-role on all 27 cards. Separately, Escape does not close the ⋯ menu.
- **Why it matters:** Enter activates the focused control. Only Enter on the card itself opens the world.
- **Fix:** In both onKeyDown handlers add `if (e.target !== e.currentTarget) return` and handle Space as well. Better: drop role=button from <section>/<article>, make the world name a real <Link to={`/w/${id}`}> or <button> with a stretched-link overlay, and keep ⋯, Open the Atlas and The Archive as siblings rather than descendants of an interactive element.
- **Repro:** On /dashboard, focus a card's ⋯ button with Tab and press Enter, then compare page.url() before and after. Scripts s2b.mjs and s17.mjs; the result reproduced on three runs.
- **Evidence:** after Enter on World options: url=/w/125/m/402 menus=0; Enter on menu item 'Edit details' -> /w/125/m/402 modal? 0; axe dashboard.json: nested-interactive x27 (serious)
- **Re-proved:** Code: Dashboard.jsx:196-202 (section.featured) and 225-232 (article.wcard) both have role=button and `onKeyDown={(e)=>{if(e.key==='Enter') open(w)}}` with no `e.target===e.currentTarget` guard. cardMenu (155-170) and .factions (211) stop only pointerdown/click from bubbling, not keydown. The menu closes only on a document pointerdown (86-91); no Escape handler exists for menuId. Live test on my own world set as the featured card: Enter on the focused featured ⋯ went to /w/146/m/466 and no menu …
- **Also found as:** "Pressing Enter on any control inside a world card (the ⋯ button, Edit details, …" (dashboard)

### P027 · Modals have no dialog behaviour: Escape ignored in 9 of them, focus not moved in or trapped, and dropped to <body> on close

Product polish · medium · effort m · found by `a11y-polish` (+5 other lanes)

- **Where:** Two details are wrong. (1) 'Tab leaves every modal (10–12 of 12 tab presses landed outside)' does not hold for the NodePicker modals. In 8 Tab presses, Link to… had 0 land outside and Place existing had 3, because the autofocused search input and the node list keep focus inside for a while. Nothing traps Tab, but the ratio applies only to the small modals (Rename 6/8; Focus, Backdrops and Choose image 8/8). (2) 'Focus stays on the trigger behind the backdrop' is true only for Delete (focus stayed on '🗑 Delete…'). Focus period, Backdrops and Choose image open from the Map ▾ menu, whose item unmounts, so focus falls to BODY. Remove interior (1555-1576) was not tested live; it has the same markup with no Escape.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:723`, `client/src/pages/AtlasWorkspace.jsx:1555-1668`, `client/src/pages/AtlasWorkspace.jsx:2096-2098`, `client/src/pages/AtlasWorkspace.jsx:2145-2147`, `client/src/pages/PlayerView.jsx:375-377`, `client/src/pages/Dashboard.jsx:47-63`, `client/src/pages/ImageManager.jsx:506-521`
- **What happens:** Escape leaves open Rename, Focus period, Backdrops over time, Choose image, Place which node?, Link to…, Delete “…”? and Mark the map (all tested live; Remove interior uses the same code). The global Escape handler (AtlasWorkspace.jsx:723) only clears placing, the context menu and search. No modal has role="dialog" or aria-modal. Focus is not moved into Focus period, Backdrops over time, Choose image or Delete: it stays on the trigger behind the backdrop. Tab leaves every modal (10–12 of 12 tab presses landed outside). Closing with ✕ drops focus to <body>. The Dashboard and Archive Modal do handle Escape (Dashboard.jsx:47-52), so modals behave inconsistently across the app.
- **Why it matters:** Escape closes any dialog. Focus moves into it, stays there, and returns to the control that opened it.
- **Fix:** Extract one shared <Modal> component (role="dialog" aria-modal="true" aria-labelledby=heading id, Escape to close, focus the first field or button on open, trap Tab, restore focus to the opener on close) and use it for the 8 workspace modals, MarkerForm, and the Dashboard/ImageManager Modal copies.
- **Repro:** Run s6.mjs. Output lines: `MODAL Rename: … tabsOutside=10/12 afterEsc=1 …`, `MODAL Delete confirm: … focusInsideOnOpen=false … afterEsc=1`, `marker form after Esc 1`.
- **Re-proved:** The global Escape handler (AtlasWorkspace.jsx:723) only clears placing, ctx and search. The only Escape handlers in the client are Dashboard.jsx:49, ImageManager.jsx:247/508/569, TopBar, EraScrub and the workspace's own. No modal markup has role=dialog or aria-modal. Live on my clone, Escape left every modal open: Rename, Focus period, Backdrops over time, Choose image, Place existing, Delete and Link (Link to…). None had role or aria-modal. Focus was not inside Focus period, Backdrops over tim… _(partly — the corrected location is used above)_
- **Also found as:** "Esc doesn't close the inspector's dialogs (delete confirm, remove-interior conf…" (inspector); "Escape doesn't close the Focus period dialog or the timeline panel" (time); "Esc closes none of the workspace's overlays; modals have no focus trap or dialo…" (resilience); "Escape closes none of the workspace dialogs, and the Maps tree and crumbs can't…" (maps); "Dashboard dialogs and menus aren't accessible: no dialog role, focus escapes th…" (dashboard)

### P032 · Keyboard users can't reach the map tree, breadcrumbs, pins, outlined places, list rows or thread links (DM and Player View)

Product polish · medium · effort m · found by `a11y-polish` (+4 other lanes)

- **Where:** Workspace rail/crumbs/canvas/reader/inspector; Player View canvas/sheet; Archive folder rail
- **Files:** `client/src/pages/AtlasWorkspace.jsx:918`, `client/src/pages/AtlasWorkspace.jsx:1062-1066`, `client/src/pages/AtlasWorkspace.jsx:1093`, `client/src/pages/AtlasWorkspace.jsx:1398-1399`, `client/src/pages/AtlasWorkspace.jsx:1410`, `client/src/pages/AtlasWorkspace.jsx:1720`, `client/src/pages/AtlasWorkspace.jsx:2011`, `client/src/pages/AtlasWorkspace.jsx:2020`, `client/src/pages/PlayerView.jsx:167`, `client/src/pages/PlayerView.jsx:193`, `client/src/pages/PlayerView.jsx:223-229`, `client/src/pages/PlayerView.jsx:256`, `client/src/pages/PlayerView.jsx:328-329`, `client/src/pages/PlayerView.jsx:343`, `client/src/components/Regions.jsx:105`, `client/src/pages/ImageManager.jsx:477`
- **What happens:** These are <div>/<span> elements with onClick, or <a> with no href, so they never get focus. That covers map-tree rows (AtlasWorkspace.jsx:1720, where only the ▾ carets are focusable), breadcrumbs (918; PlayerView 167), pins (1062-1066; PlayerView 223-229), list-view rows (1093; PlayerView 256), reader Threads (1410), inspector links (2011, 2020), the Party's 'From… / Then on to…' links (1398-1399; PlayerView 328-329), the spotlight trail crumbs (PlayerView 193), Player sheet thread titles (<span> at PlayerView 343) and Archive folder rows (ImageManager.jsx:477). Outlined regions sit in an svg with aria-hidden="true" (Regions.jsx:105). Tab walks: in Edit, none of the 45 tab stops was a tree row, crumb or pin. On the Player View root map the only stops were ◎ Go inside, the zoom buttons, Mark the map, the slider and the moment button. A keyboard player cannot open 'The Flood' or 'Your first node' at all, and a DM cannot change maps from the tree. Tab order is also out of visual order: the zoom controls (bottom-right) come before the toolbar (top-left), and '?' comes after the legend.
- **Why it matters:** Every place you can click to navigate or read is a focusable button or link, in a sensible order.
- **Fix:** Render tree rows and crumbs as <Link to=...> (a real href also restores middle-click). Render pins and list rows as <button aria-label={title}> (pins already stop propagation, so onClick keeps working). Render the thread and trail anchors as <button type="button"> or <Link>. For regions, either give each polygon tabIndex=0, role="button" and aria-label with a keydown handler, or render a visually hidden button list of outlined places. Move the MapPlane controls after the toolbar in the DOM.
- **Repro:** Run s3.mjs and s7.mjs (focusMontage), or on /p/G0n079U8w5hO7rQ2jdxYLt24 press Tab repeatedly and note that no pin receives focus. Montages: shots/focus-edit.png, focus-pview.png, focus-archive-folders.png.
- **Evidence:** PVIEW root tab order: ◎, ＋, −, ⊡, Mark the map, slider, now·12 days, BODY; ARCHIVE aria: 'text: ▤ Region maps… 0' (folder row not a control)
- **Re-proved:** Every cited element is non-focusable in code: an <a> with no href at AtlasWorkspace 918, 1398-1399, 1410, 2011, 2020 and PlayerView 167, 193, 328-329; a <div> with onClick/onPointerDown at 1062-1066, 1093, 1720, PlayerView 225-229, 256 and ImageManager.jsx:476 (FolderRow, where only ⋯ is a button); a <span> at PlayerView 343. The Regions svg gets aria-hidden='true' at Regions.jsx:106 (the element opens at 105). Live Player View root tab walk: ◎, ＋, −, ⊡, ✍ Mark the map, slider, 'now · 12 days',…
- **Also found as:** "Map pins and map-tree rows can't be reached from the keyboard" (canvas); "Pins and outlined places can't be reached or moved with the keyboard" (resilience); "Player View is mouse-only: pins, list rows, crumbs and threads cannot be reache…" (player-desktop); "Outlined places are invisible to assistive tech and unreachable by keyboard; th…" (outlines)

### P033 · Icon-only buttons are announced by their glyph ('✕', '◂', '⏳', '⚙', '▲'…), and several have no label at all

Product polish · medium · effort s · found by `a11y-polish`

- **Where:** Workspace, Player View, Dashboard, Archive
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1019-1024`, `client/src/pages/AtlasWorkspace.jsx:1318-1321`, `client/src/pages/AtlasWorkspace.jsx:1837-1838`, `client/src/pages/AtlasWorkspace.jsx:1857-1859`, `client/src/components/MapPlane.jsx:247-254`, `client/src/pages/PlayerView.jsx:303`, `client/src/pages/PlayerView.jsx:347`, `client/src/pages/ImageManager.jsx:487`, `client/src/pages/Dashboard.jsx:58`
- **What happens:** The accessibility tree names each button from its content, so `title` only becomes a description. The ARIA snapshot reads button "◂", "▸", "＋", "−", "⊡", "?", "⏳", "⚙", "▾" (tree carets), "👁", "🔒", category dots "•" "▲" "☻" "◆" "✦" "✷" "⚑", Player "◎" and "⌖", and "⋯". Some have no title either: every workspace modal ✕ (AtlasWorkspace.jsx:1559, 1583, 1607, 1638, 1659, 2098, 2147), the Mark the map ✕ (PlayerView 377), the Player sheet ✕ (PlayerView 303), the Dashboard/Archive .mclose ✕ (Dashboard 58, ImageManager 517), the outline-HUD ✕ (AtlasWorkspace 1219) and the Archive folder ⋯ (ImageManager 487).
- **Why it matters:** Every icon button has a spoken name that says what it does ('Close', 'Hide the map tree', 'Zoom in', 'Timeline settings', 'Place').
- **Fix:** Add aria-label to every icon-only button, reusing the existing title text (e.g. `aria-label={v.label}` on .cdot, `aria-label="Close"` on each ✕, `aria-label="Folder options"` on .fdots). Mark decorative glyph spans (.ic, .open ◎ on pins, ◈) aria-hidden.
- **Repro:** Run `page.locator('.atlas').ariaSnapshot()` (s6.mjs, s7.mjs).
- **Evidence:** ARIA (edit + inspector): button "◂", button "▸", button "＋", button "⏳", button "⚙", button "👁", button "🔒", button "•", button "▲"…; SHEET ARIA: button "✕", button "⌖"
- **Re-proved:** Code: none of the cited buttons has an aria-label. The only aria-labels in client/src are in AudioClip.jsx:36. All the cited ✕ buttons have no title either: AtlasWorkspace.jsx:1219, 1559, 1583, 1607, 1638, 1659, 2098, 2147; PlayerView.jsx:303, 377; Dashboard.jsx:58; ImageManager.jsx:517. The ImageManager.jsx:487 .fdots ⋯ also has no title. The rail/inspector toggles (1018-1023), ⏳/⚙ (1318-1321), .cdot (1837-1838), 👁/🔒 (1857-1859) and MapPlane ＋/−/⊡ (247-254) have only a title. I ran ariaSnaps…

### P042 · Image upload and bible upload can't be reached by keyboard: the file inputs are hidden inside <label>s

Product polish · low · effort s · found by `a11y-polish`

- **Where:** Archive › ⬆ Add art; Workspace › Choose image › ⬆ Upload new image; Forge ⚙ › Load a .md file…
- **Files:** `client/src/pages/ImageManager.jsx:301-304`, `client/src/pages/AtlasWorkspace.jsx:2111-2114`, `client/src/pages/AtlasWorkspace.jsx:2319-2322`, `client/src/styles/archive.scss:35`
- **What happens:** All three use `<label class=…>text<input type=file hidden|display:none/></label>`. A hidden input is not focusable and a label is not a tab stop, so Tab skips them. Archive tab order: Select → All art → Unsorted → New folder → tiles, with no Add art. Image picker tab order from its ✕: '✦ Paint this map a backdrop' → direction input → 'Remove current image' → tiles, with no Upload.
- **Why it matters:** Upload is a focusable button that opens the file dialog on Enter or Space.
- **Fix:** Replace each label with a `<button type="button" onClick={() => fileRef.current.click()}>` and keep the input hidden. Or keep the label and hide the input with an sr-only class (not `hidden`/display:none), adding `label:focus-within{outline:…}`.
- **Repro:** Open /worlds/125/images and Tab through the header, or in Edit open Change the backdrop… and Tab from the ✕ (s7.mjs, s8.mjs).
- **Evidence:** IMAGE PICKER tab order from ✕: ['✦ Paint this map a backdrop', INPUT, 'Remove current image', pick, pick, BODY, …]
- **Re-proved:** Code: ImageManager.jsx:301-304 is `<label className="sbtn primary">⬆ Add art<input type=file hidden/></label>` (plus archive.scss:37 `label.sbtn input{display:none}`; the finder cited :35). AtlasWorkspace.jsx:2111-2114 is a label with `<input type=file hidden>`, and 2319-2322 is a label with `style={{display:'none'}}`. Live Archive tab walk: wordmark, user, world select, search, Open the Atlas, Select, All art, Unsorted, New folder, then the two tiles. Add art never takes focus, though its labe…

### P051 · World switcher: pressing an arrow key on the focused select jumps to another world immediately

Product polish · low · effort s · found by `resilience`

- **Where:** Atlas › top bar '🧭 <world> ▾' select. AtlasWorkspace.jsx:890-910
- **Files:** `client/src/pages/AtlasWorkspace.jsx:890`
- **What happens:** I focused the world select (26 worlds) and pressed ArrowDown once. The app navigated from /w/111/m/359 to /w/117 on the first key press, because onChange navigates and Chrome fires change on each arrow key of a closed select. A keyboard user can't browse the list without loading every world in between.
- **Why it matters:** Browsing the list with the keyboard doesn't navigate until a choice is confirmed.
- **Fix:** Replace the <select> with a button + popover list (like the Map ▾ menu) that navigates on click/Enter. Or keep the select and navigate from onKeyDown Enter / onBlur only.
- **Repro:** lanes/resilience/s19.mjs (other worlds' requests answered locally with 404 so nothing else was loaded).
- **Evidence:** s19: 'options 26 url before /w/111/m/359 after ArrowDown /w/117'
- **Re-proved:** AtlasWorkspace.jsx:890-910 is the `<select className="brandsel">`. Its onChange navigates straight away: `navigate(`/w/${id}`)` after setCurrentWorld. There is no onKeyDown or confirmation step. I checked the browser behaviour locally with no network, using Playwright Chromium (the same build as the fleet): a focused closed <select> with a change listener fired change on the first ArrowDown ('change 1 -> 2') and again on the second ('change 2 -> 3'). So each arrow press on the focused switcher …

### P085 · Form fields and both time sliders have no accessible name (axe 'label' critical in every posture)

Product polish · low · effort s · found by `a11y-polish`

- **Where:** The 'relies on placeholders like 1, 20, …, ∞' detail is partly wrong. The fact From/To inputs are named by title="From"/"To" (AtlasWorkspace.jsx:1936, 1939). The lifespan placeholders are 'from'/'to' (1981, 1984), not numbers. Only the focus-period inputs (1641, 1644: tl.min/tl.max) and the backdrop inputs (1620 'start', 1623 '∞') match. The Dashboard Name fields are at Dashboard.jsx:281-283 (create) and 315-316 (edit), not 265-268. The Archive Name field is at ImageManager.jsx:533-535.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1280-1282`, `client/src/pages/AtlasWorkspace.jsx:1829-1830`, `client/src/pages/AtlasWorkspace.jsx:1875-1880`, `client/src/pages/AtlasWorkspace.jsx:1896-1898`, `client/src/pages/AtlasWorkspace.jsx:1981-1985`, `client/src/pages/AtlasWorkspace.jsx:1641-1645`, `client/src/components/EraScrub.jsx:71-76`, `client/src/pages/ImageManager.jsx:604-611`, `client/src/pages/Dashboard.jsx:265-268`
- **What happens:** The inspector wraps fields as `<div class="fld"><label>Title</label><input/></div>` with no htmlFor/id, so the Title input, Description textarea and 'Their voice' select are unnamed. The snapshot shows `textbox: Old Gate`, an unnamed description textbox and an unnamed combobox. The DM range input (AtlasWorkspace.jsx:1280) and the player EraScrub range input are flagged 'label' (critical) by axe in Edit, View, Player and /p/. The lightbox 'Filed under' select (ImageManager.jsx:606) is an unnamed combobox. The lifespan, fact, focus-period and backdrop number inputs rely on placeholders like '1', '20', '…' and '∞'. The Name fields in the Dashboard and Archive modals have unassociated labels. The world switchers are named only by title (axe label-title-only).
- **Why it matters:** Every field is announced with its visible label.
- **Fix:** Nest each input inside its <label>, or add useId() ids with htmlFor. Add aria-label="Viewing moment" to the DM range, aria-label="Moment in the revealed past" to EraScrub, aria-label="Filed under" to the lightbox select, and From/To aria-labels to the number pairs.
- **Repro:** Run axe (s1.mjs); results in lanes/a11y-polish/axe/edit.json, view.json, playerposture.json and pview.json. Snapshot in s6.mjs.
- **Evidence:** axe: critical label x1 on input[type=range] in edit/view/playerposture/pview
- **Re-proved:** Confirmed parts: .fld wraps a sibling <label> with no htmlFor or id. In my ariaSnapshot the Title input is `textbox: The Keep` and the description is an unnamed textbox. The 'Their voice' select (voice is enabled on live) is an unnamed `combobox:`. axe 'label' is critical on input[type=range] in Edit, View and /p/, and on the inspector's Title input and Description textarea. axe label-title-only fires on .brandsel, and ImageManager.jsx:278-283 .worldsel is also title-only. The lightbox select (… _(partly — the corrected location is used above)_

### P086 · Toggle buttons don't expose their on/off state

Product polish · low · effort s · found by `a11y-polish`

- **Where:** The core is true for the posture switch (959-961), visibility (1858-1859), stance (1869-1871), Pin (1960-1961), Button/Area (1215-1216, 2041-2042), Fill/Outline/Grow/Glow/Pop (2044-2046) and the Map ▾ ✓ items (1151-1159). One detail is wrong. The legend chips (1186-1187), ⏳ (1318-1319) and era 🎭 (1800-1801) do not use an 'on' class. The chips and ⏳ use an 'off' class, and the era 🎭 keeps an 'on' class. More importantly, all three swap their title with state ('Show places' vs 'Hide places'; 'Things not present… are hidden — click to show them'; 'Hidden from players — click to reveal'), so their state does reach assistive tech through the title/description. aria-pressed is still missing on them.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:959-961`, `client/src/pages/AtlasWorkspace.jsx:1151-1159`, `client/src/pages/AtlasWorkspace.jsx:1186`, `client/src/pages/AtlasWorkspace.jsx:1318`, `client/src/pages/AtlasWorkspace.jsx:1800`, `client/src/pages/AtlasWorkspace.jsx:1858-1859`, `client/src/pages/AtlasWorkspace.jsx:1869-1871`, `client/src/pages/AtlasWorkspace.jsx:1960-1961`, `client/src/pages/AtlasWorkspace.jsx:2041-2046`
- **What happens:** State is shown only by an 'on' class or a trailing '✓': ✏/👁/🎭 postures (959-961), 👁/🔒 visibility (1858-1859), Friend/Neutral/Foe (1869-1871), Pin: icon+name / the image (1960-1961), Button/Area and Fill/Outline/Grow/Glow/Pop (2041-2046, 1215-1216), legend chips (1186), ⏳ (1318), the era 🎭 toggle (1800), and Grid, Always show names and Footprints (1151-1159). None sets aria-pressed or aria-checked, so a screen reader can't tell which posture, visibility or stance is active.
- **Why it matters:** Toggles announce pressed or not pressed.
- **Fix:** Add aria-pressed={cond} to each toggle button (or role="radio"/aria-checked inside role="radiogroup" for the posture switch and the visibility and stance segments), and role="menuitemcheckbox" aria-checked for the ✓ items in Map ▾.
- **Repro:** Read the listed lines; the ARIA snapshot in s6.mjs shows e.g. button "✏ Edit" with no pressed state.
- **Re-proved:** No file in client/src sets aria-pressed, aria-checked or aria-selected (grep: 0 hits; the whole client has only 5 aria- attributes). I read each cited line: posture switch at AtlasWorkspace.jsx:959-961, 👁/🔒 at 1858-1859, Friend/Neutral/Foe at 1869-1871, Pin at 1960-1961, Button/Area at 1215-1216 and 2041-2042, Fill/Outline/Grow/Glow/Pop at 2044-2046, and the Map ▾ Grid/Always show names/Footprints items at 1151-1159. All of them show state only through className 'on' or a trailing '✓'. On my … _(partly — the corrected location is used above)_

### P091 · No landmarks or h1 on the workspace, Player View, Archive or 404

Product polish · low · effort s · found by `a11y-polish`

- **Where:** The workspace and Player View parts are exact: AtlasWorkspace.jsx:886 (.top div), :1009 (.rail div), the .stagecol div, and PlayerView.jsx:161 (.top div). The Archive and 404 are wrong in the title: both render TopBar, which is already a landmark at client/src/components/TopBar.jsx:39 `<header className="shellbar">`. The Archive also has `<aside className="frail">` at ImageManager.jsx:308, and its gallery is `<section className="agallery">` at ImageManager.jsx:330 (the finding cites :266, which is the empty-state branch). The Archive and 404 are missing only <main> and an h1. In the fix, 'use <header> for .shellbar' is already done; only .top needs it.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:886`, `client/src/pages/AtlasWorkspace.jsx:1009`, `client/src/pages/PlayerView.jsx:161`, `client/src/pages/ImageManager.jsx:266`, `client/src/pages/NotFound.jsx:10`
- **What happens:** axe 'region' fires in every posture (x24 Edit, x18 View, x8 Player and /p/). page-has-heading-one fires on the Dashboard, Archive and 404, and landmark-one-main on the Archive, 404 and login. The workspace top bar is a div, the rail a div and the stage a div. The Dashboard's only headings are h2, h3 and h4.
- **Why it matters:** <header>, <nav aria-label="Maps">, <main>, and an h1 naming the page, so screen-reader users can jump around.
- **Fix:** Use <header> for .top/.shellbar, <nav> for the map rail, <main> for .stagecol and .agallery, <aside> for the inspector and reader, and add an h1 (visually hidden in the Atlas) with the map or page name.
- **Repro:** Run axe; results in lanes/a11y-polish/axe/*.json.
- **Re-proved:** I probed the live DOM in my own browser run, looking at world 125 and share token G0n079U8w5hO7rQ2jdxYLt24 without modifying either. I retried after a 429 and the final run had no rate-limited requests. Results by page: (1) Edit, View and Player posture have no h1, no main, header, nav or aside, and .top, .rail and .stagecol are all DIVs; axe 'region' fires x25, x19 and x9. (2) Player View at /p/ and its sheet have no h1 and no landmarks; region fires x9 and x14. (3) Dashboard has main.dashmain… _(partly — the corrected location is used above)_

### P095 · Popovers and menus ignore Escape and expose no open state; Escape doesn't close the Player sheet or the DM reader either

Product polish · low · effort s · found by `a11y-polish` (+2 other lanes)

- **Where:** Workspace Map ▾, 🔗 Share, ?, timebar ⚙; Dashboard card ⋯; Archive folder ⋯; Player View sheet; View reader
- **Files:** `client/src/pages/AtlasWorkspace.jsx:626-631`, `client/src/pages/AtlasWorkspace.jsx:718-738`, `client/src/pages/AtlasWorkspace.jsx:781-789`, `client/src/pages/Dashboard.jsx:85-90`, `client/src/pages/ImageManager.jsx:106-111`, `client/src/pages/PlayerView.jsx:302-303`, `client/src/components/TopBar.jsx:27-35`
- **What happens:** Opened with the keyboard, then Escape: Map ▾, Share, ? and ⚙ timeline config all stayed open (afterEsc=1). The Dashboard card menu and Archive folder menu stayed open. The Player View sheet stayed open ('sheet after Esc 1'). The TopBar user menu does close on Escape (TopBar.jsx:31), so menus behave inconsistently. No trigger sets aria-expanded (all returned null). The ⚙ timeline config also ignores outside clicks.
- **Why it matters:** Escape closes the nearest open popover, menu, sheet or reader, and the trigger announces expanded or collapsed.
- **Fix:** Add an Escape branch to the outside-click effects (AtlasWorkspace.jsx:626-631, 781-789; Dashboard.jsx:85-90; ImageManager.jsx:106-111), close tlEdit on Escape, and clear selId/detail on Escape when nothing else is open. Set aria-expanded on the Map ▾, Share, ?, ⚙, ⋯ and fdots triggers.
- **Repro:** Run s6.mjs (POPOVER lines), s2b.mjs ('menu after Escape: 1'), s7.mjs and s8.mjs ('folder menu after Esc 1').
- **Evidence:** POPOVER Map menu: opened=1 afterEsc=1 aria-expanded=null; Share …afterEsc=1; Help ? …afterEsc=1; Timeline cfg ⚙ …afterEsc=1
- **Re-proved:** Code: the workspace keydown Escape branch (AtlasWorkspace.jsx:723) only clears placing, ctx and search. The outside-click effects for share (626-631) and Map/help (781-789) have no key handling. TimelineConfig (1773+) has no effects at all, so no Escape and no outside click. PlayerView has no keydown handler. The Dashboard (85-90) and ImageManager (109-115) menu effects are pointerdown-only. TopBar.jsx:30 does close on Escape. No aria-expanded anywhere. Live on my clone: Map ▾ opened 1, afterEs…
- **Also found as:** "Pressing a pin doesn't close open menus (right-click menu, Map ▾, ? help), and …" (canvas); "Share popover and posture switch: Escape doesn't close the popover and the togg…" (postures-share)

### P097 · Keyboard focus and motion: world switchers drop the focus ring, Archive folder ⋯ is invisible when focused, no prefers-reduced-motion anywhere

Product polish · low · effort xs · found by `scss-dead` (+2 other lanes)

- **Where:** Workspace top bar world <select>; Archive header world <select>; Archive folder rail ⋯; lantern/region/Forge/skeleton animations
- **Files:** `client/src/styles/atlas.scss:17`, `client/src/styles/archive.scss:33`, `client/src/styles/archive.scss:82-87`, `client/src/styles/dashboard.scss:210`, `client/src/styles/atlas.scss:574-579`, `client/src/styles/atlas.scss:728-729`, `client/src/styles/atlas.scss:542-546`, `client/src/styles/shell.scss:278-285`
- **What happens:** `.brandsel:focus{outline:none}` (atlas.scss:17) and `.worldsel:focus{outline:none}` (archive.scss:33) remove the focus indicator with no replacement. The Archive folder menu button `.fdots` is opacity:0 and revealed only on `.frow:hover` or an open menu (archive.scss:84-87), so tabbing lands on an invisible button, although Dashboard's `.dots` handles :focus-visible (dashboard.scss:210). Five infinite animations run with no `@media (prefers-reduced-motion)` guard in any sheet: spotglow/spotglow2 on lantern pins that players see (atlas.scss:574-579), regionglow (L728-729), forgepulse (L542/546) and shimmer skeletons (shell.scss:278-285).
- **Why it matters:** A visible focus state on every focusable control, and reduced motion honoured.
- **Fix:** Replace outline:none with a :focus-visible ring (e.g. box-shadow 0 0 0 2px var(--accent)). Add `.fmenu .fdots:focus-visible{opacity:1}`. Add one `@media (prefers-reduced-motion:reduce){ .atlas .pin.spot,.atlas .region.spot,.atlas .fmsg.fwait,.shell .skel{animation:none} }`.
- **Repro:** grep -rn "prefers-reduced-motion" client/src/styles → none; grep -n "outline:none\|outline: none" client/src/styles/*.scss
- **Re-proved:** atlas.scss:17 `&:focus{outline:none}` sits inside `.top .brandsel` (the workspace world <select>, AtlasWorkspace.jsx:891), which has border:0 and no replacement focus style. archive.scss:33 `&:focus { outline: none; }` sits on `.worldsel` (ImageManager.jsx:279), also with border:0 and no replacement. shell.scss:155 is different: it swaps in border-color, so it is not a defect. archive.scss:82-87 sets `.fdots` (ImageManager.jsx:487) to opacity:0, revealed only by `&:hover .fdots` or `.fmenu:has(…
- **Also found as:** "World-switcher dropdowns show no focus indicator" (a11y-polish); "Endless pulsing animations ignore prefers-reduced-motion" (a11y-polish)

### P098 · Toasts are silent to screen readers, and Undo lives only in a 9-second toast with no keyboard route

Product polish · low · effort s · found by `a11y-polish`

- **Where:** Wrong line numbers. The Dashboard flash is at Dashboard.jsx:264 (timer 94-98), not 249. The ImageManager flash is at ImageManager.jsx:467 (timer 103-107), not 463.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:140-152`, `client/src/pages/AtlasWorkspace.jsx:1670-1675`, `client/src/pages/Dashboard.jsx:249`, `client/src/pages/ImageManager.jsx:463`
- **What happens:** The flash elements (AtlasWorkspace.jsx:1671, Dashboard/ImageManager `.flash`) carry no role=status/alert or aria-live, so 'Saved', errors and 'Put back the way it was' are never announced (grep for aria-live/role="status" finds nothing). The ↩ Undo button is the last element in the DOM and disappears after 9s (AtlasWorkspace.jsx:142). No keyboard shortcut exists: the only ctrlKey reference in the client is the N-key guard at 724.
- **Why it matters:** Status messages are announced, and a keyboard user can reach Undo, via focus, a paused timer or Ctrl+Z.
- **Fix:** Add role="status" aria-live="polite" to the toast (role="alert" for kind 'err'). Pause the timer while the toast is hovered or focused. Add a Ctrl/Cmd+Z handler to the keydown effect that calls doUndo(flash.undoId) while an undo is on offer.
- **Repro:** Run `grep -rn "aria-live\|role=\"status\"\|ctrlKey" client/src`; read AtlasWorkspace.jsx:140-152 and 1670-1675.
- **Re-proved:** grep finds no aria-live, role="status" or role="alert" anywhere in client/src. The only ctrlKey/metaKey use is the N-key guard at AtlasWorkspace.jsx:724. The flash timer at 140-144 is a fixed 9000 ms when undoId is set (4000 otherwise), with no hover or focus pause. The toast at AtlasWorkspace.jsx:1670-1675 is a plain div, and ↩ Undo is its last child. doUndo (146) is called only from that button (1673). The Dashboard and Archive flashes are plain divs with a fixed 3500 ms timer. _(partly — the corrected location is used above)_

