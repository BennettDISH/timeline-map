# WP-17 · Layout at laptop widths and one look

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Keep the workspace inside the window from 1024 to 1440px, with and without the Forge open. Bring the login, setup and loading screens into the app's dark theme.

**Do after:** [WP-07](WP-07-delete-the-dead-code.md), [WP-09](WP-09-the-player-view-on-phones.md)

**Notes:** client-dead-03 is xs and shows every time '?' is pressed, so it can go first on its own. This package comes after WP-09 because mobile-01 and a11y-polish-01 share the .atlas grid rule, and after WP-07 so the dead CSS is already gone. Test at 1024, 1280, 1366 and 1440 in all three postures, with ✦ Forge open and with a five-level breadcrumb.

## Checklist

- [x] **B031** · medium · xs · The '?' help popover's Colours line reuses class 'legend', which is absolutely positioned, so it overlaps the other help lines — done b87af53 (the colour key has its own class and flows as a line)
- [x] **B061** · medium · s · DM time scrubber shrinks to nothing in the View posture: 0px track at 1024, 15px at 1280, 111px at 1440 — done b87af53 (the track keeps 160px, the moment label truncates, the canon zone takes its content width; the DM suite measures it at 1280)
- [x] **B062** · medium · s · Workspace and Player View overflow the window: the inspector, posture switcher and Exit go off-screen at 1024px, or at 1280px with a long map title — done b87af53 (the grid column is minmax(0,1fr); crumbs shrink with an ellipsis; the DM suite asserts the top bar and editor end inside a 1280 window)
- [x] **P003** · medium · m · Login, Setup, EnvSetup, AuthCallback and Admin still wear the stock light/purple template while the rest of the app is dark — done b87af53 (the sign-in, callback and admin pages and the error card restyled in the app's palette and serif; Setup/EnvSetup were already gone)
- [x] **P008** · medium · xs · The ⚙ partition's bible, art style and memory boxes collapse to 14 px slivers on a 1280×800 screen — done b87af53 (.fmind children are flex:none)
- [x] **P024** · medium · m · On narrower desktop windows the toolbar runs under the '?' help button and the inspector toggle, and the timebar is crushed — done b87af53 (the toolbar wraps within a right bound that leaves room for ? and ▸; the Forge folds the editor under 1400px; the DM suite asserts no overlap at 1280 with the Forge open)
- [x] **P031** · medium · s · Opening the Forge on a 1280-wide screen squeezes the canvas to 400 px and the map toolbar overlaps — done b87af53 (the Forge column has a width state and a grip; opening it on a laptop folds the editor so the canvas keeps its room)
- [x] **B087** · low · xs · Inspector resize grip is drawn inside the Forge panel when ✦ Forge is open — done b87af53 (the editor's grip is offset by the Forge column and the drag maths subtracts it)
- [x] **B088** · low · xs · Right-click menu opened near the bottom of the window is cut off (height clamp assumes 110px) — done b87af53 (the menu measures itself after render and shifts inside the window)
- [x] **C043** · low · s · shell.scss says its palette mirrors .atlas but swaps --panel and --panel2 — done b87af53 (--panel means the lighter surface in every sheet; the shell's usages were swapped so nothing changed on screen)
- [x] **P040** · low · xs · The reader's resize grip and ✕ scroll away with long text — done b87af53 (the reader is a still shell around a scrolling body)
- [x] **P041** · low · xs · Every signed-in cold load flashes a light-grey 'Loading...' screen before the dark app — done b87af53 (dark body and color-scheme meta, an inline body background in index.html, a quiet route placeholder)
- [x] **P057** · low · xs · main.scss's global `.loading{min-height:100vh}` leaks into the workspace overlay and the Setup card — done b87af53 (the global class is .route-loading; the workspace's .loading has no min-height)
- [x] **P067** · low · s · Controls that no rule reaches render with the browser's default light look inside the dark UI — done b87af53 (.shell .mclose, base .atlas .span input / .lx / .ic rules, a guest-button class)
- [x] **P068** · low · xs · Dashboard and Archive top bar on phones: the wordmark wraps to 2 lines and the account pill wraps to 3 and spills out of the bar — done b87af53 (under 480px the wordmark text and crumb hide and the account pill stays on one line)
- [x] **P070** · low · xs · Element selectors inside `.fld` reach unintended controls: the pin-size slider gets a text-field box and its label becomes a caption — done b87af53 (.fld > label and .fld input:not([type=range]):not([type=checkbox]))
- [x] **P087** · low · xs · Long world names break the dashboard layout: unbroken words overflow the featured panel, long names grow it to 9 lines, and the phone top bar wraps — done b87af53 (names wrap anywhere and clamp to three lines)
- [x] **P090** · low · xs · Brand mark and serif change between pages: Compass SVG and Cormorant on shell pages, 🧭 emoji and Georgia in the Atlas — done b87af53 (the compass mark in the Atlas and the Player View; one --serif token used by the reader and sheet headings)
- [x] **P094** · low · xs · Destructive confirm buttons in the workspace modals lose their danger styling — done b87af53 (.atlas .danger and .tool.danger reach every confirm; the scoped copies are gone)

## Items

### B031 · The '?' help popover's Colours line reuses class 'legend', which is absolutely positioned, so it overlaps the other help lines

Broken · medium · effort xs · found by `client-dead` (+2 other lanes)

- **Where:** Atlas › map › ? (help) popover; client/src/pages/AtlasWorkspace.jsx:1241
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1241`, `client/src/styles/atlas.scss:231`, `client/src/styles/atlas.scss:754`
- **What happens:** The help popover's colour-key div has className="legend". `.atlas .legend` (atlas.scss:231) is the category chip bar: position:absolute; left:10px; bottom:10px; display:flex; max-width:calc(100% - 160px). The override `.atlas .helppop .legend` (754) only sets margin, padding, border and color, so the Colours text is placed absolutely inside the popover as a narrow column that sits on top of every other help line. I rendered the compiled atlas.scss locally with the exact popover markup: computed position is absolute, and the legend box [595,95,144x237] sits inside the popover [584,46,306x297]. The screenshot shows the text overlapping and unreadable.
- **Why it matters:** The colour key should be a normal line at the bottom of the popover.
- **Fix:** Rename the help div's class (e.g. 'helpkey') and move the atlas.scss:754 rule to it. Or add `position:static;display:block;max-width:none` to `.atlas .helppop .legend`.
- **Repro:** sass client/src/styles/atlas.scss, then render the helppop markup from AtlasWorkspace.jsx:1233-1243. Screenshot: /tmp/claude-1000/-home-bennett-repos/fad7b677-1261-40ae-b46f-e65ab93eee86/scratchpad/audit/lanes/client-dead/help.png. On the live site: Atlas → click '?' on the map.
- **Evidence:** /tmp/claude-1000/-home-bennett-repos/fad7b677-1261-40ae-b46f-e65ab93eee86/scratchpad/audit/lanes/client-dead/help.png
- **Re-proved:** AtlasWorkspace.jsx:1241 is `<div className="legend">` inside .helppop. atlas.scss:231 (nested under `.atlas {`) gives .legend position:absolute; left:10px; bottom:10px; display:flex; max-width:calc(100% - 160px). The override at atlas.scss:754 only sets margin, padding, border and color. I checked on the live site (clone world 53, Atlas → '?'). The computed style of .helppop .legend was position absolute, display flex, max-width calc(100% - 160px). Its box [809,158,118,254] sits inside the popo…
- **Also found as:** "'How to drive the map' popover is garbled: its Colours line takes the category …" (canvas); "The '?' help popover's colour-legend paragraph is absolutely positioned over th…" (scss-dead)

### B061 · DM time scrubber shrinks to nothing in the View posture: 0px track at 1024, 15px at 1280, 111px at 1440

Broken · medium · effort s · found by `a11y-polish` (+2 other lanes)

- **Where:** Workspace › 👁 View › timebar (.ttrack); client/src/styles/atlas.scss:124-125, 300
- **Files:** `client/src/styles/atlas.scss:124`, `client/src/styles/atlas.scss:125`, `client/src/styles/atlas.scss:132`, `client/src/styles/atlas.scss:300`, `client/src/pages/AtlasWorkspace.jsx:1248-1322`
- **What happens:** In View with the reader open, the timebar has to fit the from/to labels, the moment label ('Behind the Screen · day 12', which wraps to four lines at 1024), a fixed 152px `.tzone`, and the ⏳ and ⚙ buttons. `.ttrack` is `flex:1` with no min-width, so it gets what is left. Measured track widths in View were 0px at 1024, 15px at 1280 and 111px at 1440. At 1024 only the thumb is visible and ⚙ is clipped at the column edge. In Edit the track is 20px at 1024 (while overflowing) and 217px at 1280.
- **Why it matters:** The DM can scrub time at every desktop size. The labels should give way before the track does.
- **Fix:** Give `.timebar .ttrack` a `min-width:160px`. Let `.tnow` truncate (`max-width` + `white-space:nowrap;overflow:hidden;text-overflow:ellipsis`) and drop `.tzone`'s fixed `width:152px` in favour of `flex:none` at its content width. Or move the moment label and canon zone to a second row when the stage column is under about 700px.
- **Repro:** Open /w/125/m/402 at 1024×768, switch to 👁 View, click the 'The Keep' pin, then measure `document.querySelector('.ttrack').getBoundingClientRect().width` (0). Screenshots: shots/sz1024-view-sel.png, sz1280-view-sel.png, d1440-view.png.
- **Evidence:** track widths in View: 1024→0, 1280→15, 1440→111, 1920→567
- **Re-proved:** atlas.scss:124 gives `.tzone` a fixed `width:152px;flex:none`. Line 125 is `.ttrack{flex:1}` with no min-width. Line 132 gives `.tnow` a `min-width:78px`, no nowrap. On my clone I opened View, selected The Keep so the reader opened, and measured `.ttrack`. Widths were 0px at 1024, 15px at 1280, 111px at 1440 and 567px at 1920, the same numbers the finder got. Edit measured 25px at 1024 while overflowing (the finder got 20; world names differ) and 217px at 1280. Screenshot v1024-view-sel.png sho…
- **Also found as:** "The DM scrubber track shrinks to 0–75 px in 👁 View posture at common laptop wi…" (time); "View posture at laptop widths squeezes the timebar to 0–104 px and crushes the …" (postures-share)

### B062 · Workspace and Player View overflow the window: the inspector, posture switcher and Exit go off-screen at 1024px, or at 1280px with a long map title

Broken · medium · effort s · found by `a11y-polish` (+2 other lanes)

- **Where:** Workspace top bar and 3-column grid (all postures); Player View top bar. client/src/styles/atlas.scss:6
- **Files:** `client/src/styles/atlas.scss:6`, `client/src/styles/atlas.scss:9`, `client/src/styles/atlas.scss:19`, `client/src/pages/PlayerView.jsx:162`
- **What happens:** `.atlas` is `display:grid; grid-template-rows:46px 1fr` with no column template, so its single implicit column sizes itself to the top bar's min-content (nowrap crumbs plus fixed-width chips). At 1024×768 in Edit the computed grid column was 1083.3px: .top/.main are 0–1083, and .insp spans 773–1083, so the right 59px of the inspector is cut off (Title input, the 👁/🔒 visibility toggle, 'Show players the way here' and Foe are all clipped). The Exit link is off-screen and the breadcrumb shrinks to 'Th'. At 1280×720, an interior titled 'The Keep — Inside, the Lower Galleries Where the Water First Came Through the Wall' pushes View/Player/Share/Forge/Archive/Exit and the whole inspector off-screen in Edit, and the reader off-screen in View. In the Player View at 1024, a long map title pushes the canon-moment chip ('🕓 12 days') to 1012–1111px, fully off-screen. A long world name cuts it to 'Session 3 · footstep'.
- **Why it matters:** The workspace always fits the window. Long names truncate with an ellipsis and never push the editor or the posture switcher off-screen.
- **Fix:** In atlas.scss:6 add `grid-template-columns:minmax(0,1fr)` to `.atlas`. Give `.crumbs` `min-width:0`, and let its last `.here` crumb ellipsize (`overflow:hidden;text-overflow:ellipsis`). Give the Player View `.top .brand` a max-width with an ellipsis, like `.brandsel`'s 24vw. Optionally collapse the Share/Forge/Archive labels to icons below about 1150px.
- **Repro:** Log in and open /w/125/m/402 at 1024×768 in Edit, then measure `getComputedStyle(document.querySelector('.atlas')).gridTemplateColumns` ('1083.3px'). Screenshots: lanes/a11y-polish/shots/sz1024-edit-sel.png, long-interior-edit-1280.png, long-interior-view-1280.png, long-map-pview-1024.png, long-world-pview-1024.png.
- **Evidence:** measured at 1024: {.top:[0,1083], .main:[0,1083], .stagecol:[230,773], .insp:[773,1083]}, atlas grid cols 1083.3px; Player View at 1024 with a long map title: nowchip 1012-1111
- **Re-proved:** atlas.scss:6 `.atlas` is `display:grid; grid-template-rows:46px 1fr` and has no column template. I checked this on my own clone of world 27 (id 146, since deleted). At 1024x768 in Edit, `gridTemplateColumns` was 1088.05px. The finder measured 1083.3px because their world name is a different length. .top/.main ran 0–1088 and .insp 778–1088. The Exit link sat at 1033–1076, past the 1024px edge. .crumbs had shrunk to 16px ('Th'). Screenshot v1024-edit-sel.png shows the Title input, the visibility …
- **Also found as:** "A deep breadcrumb or long map name pushes the whole workspace past the window: …" (canvas); "A long space name pushes the mode toggle, Share, Exit and the whole inspector o…" (maps)

### P003 · Login, Setup, EnvSetup, AuthCallback and Admin still wear the stock light/purple template while the rest of the app is dark

Product polish · medium · effort m · found by `scss-dead` (+4 other lanes)

- **Where:** /login, /auth/callback, /setup, /env-setup, /admin · client/src/styles/main.scss:8-13, :28-197, :363-709
- **Files:** `client/src/styles/main.scss:8-13`, `client/src/styles/main.scss:28-34`, `client/src/styles/main.scss:58-69`, `client/src/styles/main.scss:364-371`, `client/src/styles/main.scss:514-521`, `client/src/components/ErrorBoundary.jsx:26-35`
- **What happens:** main.scss gives `body` a light theme (#f5f5f5 background, #333 text, 'Segoe UI'). The auth and setup pages get the stock purple gradient (linear-gradient(135deg,#667eea,#764ba2), at L33, L369, L519) with white cards, Bootstrap greens (#28a745/#218838) and a monospace 'Consolas' error box (L58-69). Everything else (shell.scss, atlas.scss) is the dark gold 'study' palette with Cormorant Garamond. So the first screen a DM sees looks like a template, not the product. The light body also shows before hydration and behind the ErrorBoundary, which is itself unstyled with default buttons (ErrorBoundary.jsx:26-35).
- **Why it matters:** The sign-in and utility pages use the same palette and primitives as Dashboard/Archive (.shell, .sbtn, .sinput, a .smodal-like card), and the page background is dark from first paint.
- **Fix:** Re-skin Login/AuthCallback/Setup/EnvSetup/AdminPanel on `.shell` (wrap in <div className="shell">, use .sbtn/.sinput/.kicker). Set body{background:#12151a;color:#e8e8e6}. Give ErrorBoundary a small shell-styled card. Then delete the matching main.scss blocks.
- **Repro:** grep -n "667eea\|764ba2\|f5f5f5\|28a745" client/src/styles/main.scss → 17× #667eea, 4× #764ba2, 2× #f5f5f5, 3× #28a745
- **Re-proved:** main.scss:8-13 sets the body to Segoe UI, #333 text on #f5f5f5. Counts in main.scss: #667eea 17×, #764ba2 4× (gradients at L33, 369, 519 and 717), #f5f5f5 2×, #28a745 3×, #218838 3×. The monospace Consolas error box is at L58-69. Login.jsx and AuthCallback.jsx use .login-page and .login-container, Setup.jsx uses .setup-page, EnvSetup.jsx uses .env-setup-page, and AdminPanel.jsx uses .admin-panel/.admin-section with white cards and #333 text. client/index.html has no inline body background, and …
- **Also found as:** "Login, setup, env-setup, admin and the route loaders still carry the original t…" (copy); "Login, callback, Access Denied and the loading screen still use a stock purple …" (auth); "Login page is a generic purple-gradient template, unlike the rest of the app" (a11y-polish); "Login page on phones: 'Continue as guest' is an unstyled native button on a pur…" (mobile)

### P008 · The ⚙ partition's bible, art style and memory boxes collapse to 14 px slivers on a 1280×800 screen

Product polish · medium · effort xs · found by `forge-voice`

- **Where:** ✦ Forge › ⚙; client/src/styles/atlas.scss:551-556
- **Files:** `client/src/styles/atlas.scss:551`
- **What happens:** .fmind is a flex column with overflow:auto, and the textareas (rows 7/4/8) are shrinkable flex items with min-height 0. At 1280×800 all three measured 14 px tall (scrollHeight 175/48/157), so the campaign bible and memory show a single clipped line. At 1440×900 they shrink as soon as the style anchor image appears (about 35 px). Screenshots 51-mind-1280.png and 08-anchor-set.png.
- **Why it matters:** Each box keeps its rows-height and the partition scrolls.
- **Fix:** Add `.atlas .forge .fmind > *{flex:none}` (or `textarea{flex:none}`) in atlas.scss next to the .fmind rule.
- **Repro:** Open world 116 at 1280×800, then ✦ Forge › ⚙ with an anchor set.
- **Evidence:** p8.mjs B: [{rows:7,h:14,scrollH:175},{rows:4,h:14,scrollH:48},{rows:8,h:14,scrollH:157}]
- **Re-proved:** atlas.scss:551 has `.fmind{flex:1;overflow:auto;display:flex;flex-direction:column}` and nothing sets flex:none on its children. Computed style on the textareas: flex '0 1 auto', min-height 'auto'. That resolves to 0 because a textarea is a scroll container, so the finder's 'min-height 0' is the used value, not the computed one. Reproduced on my clone with a bible (2,149 chars), memory text and a style anchor (image 602). At 1280x800 all three boxes measured h=14 (rows 7/4/8, scrollH 1462/30/37…

### P024 · On narrower desktop windows the toolbar runs under the '?' help button and the inspector toggle, and the timebar is crushed

Product polish · medium · effort m · found by `canvas`

- **Where:** The 1024px no-Forge case is overstated: the toolbar ends at 669 and '?' starts at 668, a 1px touch with nothing hidden (screenshot 08-1024.png). The real overlaps are at 1280 and 1366 with Forge open and at 900px or narrower without it. Separately, at 1024 the top bar already pushes Exit off-screen (right edge 1048) in a world whose header has Share, Forge and Archive. That is canvas-07's grid-column cause, not the toolbar.
- **Files:** `client/src/styles/atlas.scss:62`, `client/src/styles/atlas.scss:294`, `client/src/styles/atlas.scss:360`, `client/src/pages/AtlasWorkspace.jsx:1004-1007`
- **What happens:** With the tree and inspector open, the fixed toolbar (left:52px, one nowrap row, ~390px) overlaps the '?' button (right:52px) at 1024px. With Forge open (+340px column) it overlaps at 1280 and 1366, where '?' covers 'Map ▾' (screenshot 67). At 1280 with Forge it also overlaps the ▸ inspector toggle. At 900px the buttons wrap into two-line labels and '?'/'▸' sit on top of them. At 760px the top bar overflows (Exit hidden) and the inspector is clipped. At 1366 with Forge the scrubber track is about 20px wide.
- **Why it matters:** A 1280–1366px laptop is a normal DM screen (mobile editing is out of scope, laptops are not). Controls should never overlap.
- **Fix:** Let the toolbar wrap or shrink: flex-wrap, and a right bound of calc(100% - 100px) or reserve room for .helpwrap and .insptoggle. Or move '?' into the toolbar row. Auto-collapse the tree, or cap the inspector/Forge widths, when the stage column drops below ~560px.
- **Repro:** Open /w/33/m/97 at 1366×768 and click ✦ Forge, or open at 1024×768 with the tree and inspector open.
- **Evidence:** lanes/canvas/shots/64-resized-900-fit.png, 65-resized-760.png, 67-1366-forge.png; s9.mjs overlap table (1024 no forge: overlapsHelp true; 1280/1366 forge: overlapsHelp true)
- **Re-proved:** CSS cited correctly: atlas.scss:62 `.toolbar{position:absolute;top:10px;left:52px;...display:flex}` has no wrap or right bound; atlas.scss:294 is .helpwrap; atlas.scss:360 sets `.main.m-edit .helpwrap{right:52px}`; AtlasWorkspace.jsx:1004-1007 adds the 340px Forge column. I measured on my clone with tree and inspector open. 1366 + Forge: toolbar 282–669 and '?' 634–664, so '?' sits on 'Map ▾' (608–669); screenshot 08-1366-forge.png shows 'Ma?'. 1280 + Forge: toolbar to 630, '?' 548–578 and ▸ 58… _(partly — the corrected location is used above)_

### P031 · Opening the Forge on a 1280-wide screen squeezes the canvas to 400 px and the map toolbar overlaps

Product polish · medium · effort s · found by `forge-voice`

- **Where:** Workspace (Edit) with ✦ Forge open; AtlasWorkspace.jsx:1004-1007
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1007`
- **What happens:** The Forge column is a fixed 340 px added to rail and inspector. At 1280×800 the grid was '230px 400px 310px 340px'. The toolbar wrapped ('Add node' and 'Place existing' on two lines), the ? button overlapped Outline/Map ▾, and the timebar label wrapped to four lines. Unlike the rail and inspector, the Forge column has no resize grip.
- **Why it matters:** The canvas stays usable when the Forge opens, and the Forge column resizes like the other two panes.
- **Fix:** Give the Forge column a width state plus a resize grip like inspW/railW (reuse startInspResize). Below about 1400 px, auto-collapse the inspector while the Forge is open, and let the canvas toolbar wrap to a second row without overlapping.
- **Repro:** Viewport 1280×800, /w/116/m/375, Edit posture, click ✦ Forge.
- **Evidence:** shots/51-mind-1280.png; p8.mjs C: grid columns '230px 400px 310px 340px' canvas=400
- **Re-proved:** AtlasWorkspace.jsx:1007 appends a fixed ' 340px' for the Forge column. Only .iresize (1510) and .rresize (1514) grips exist, none for the Forge. On my clone at 1280x800 in Edit posture with the Forge open, gridTemplateColumns was '230px 400px 310px 340px'. The '＋ Add node' and '⤓ Place existing' buttons were each 42 px tall (wrapped to two lines). The '?' button (x 548-578) overlaps '◌ Outline' (x 494-571) and 'Map ▾' (x 577-630). Screenshot lanes/verify-forge-voice-b2/shots/b2-1280-forge-chat.…

### B087 · Inspector resize grip is drawn inside the Forge panel when ✦ Forge is open

Broken · low · effort xs · found by `canvas`

- **Where:** Workspace (Edit) › ✦ Forge open › inspector's left-edge grip; client/src/pages/AtlasWorkspace.jsx:1509-1512
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1509-1512`, `client/src/pages/AtlasWorkspace.jsx:1007`
- **What happens:** With Forge open, the inspector starts at x=790 but .iresize is at x=1127, inside the Forge panel, because the grip is positioned at right: inspW - 3 and ignores the extra 340px column. Dragging the grip 100px left made the inspector 413px wide (computed from the window edge), which doesn't follow the pointer.
- **Why it matters:** The grip sits on the inspector's left edge and follows the pointer.
- **Fix:** Use right: inspW - 3 + (forgeOn && forgeOpen ? 340 : 0) for .iresize. In startInspResize, subtract the Forge width from the pointer computation.
- **Repro:** /w/33/m/97 › ✦ Forge › hover the inspector's left edge. No grip there, but one exists inside the Forge panel.
- **Evidence:** s8.mjs 'forge open: insp [790,310]', 'forge open: iresize [1127,6]', 'grip on inspector left edge? false'; lanes/canvas/shots/62-forge-open-grip.png
- **Re-proved:** Code: the .iresize style is `right: inspW - 3` (AtlasWorkspace.jsx:1510). The grid adds a trailing ' 340px' Forge column (:1007). .forge is an in-flow grid child (atlas.scss:523), and .iresize is absolutely positioned against .main (atlas.scss:351-352). startInspResize (:516-531) computes width as window.innerWidth - clientX and ignores the Forge column. Live check at 1440x900 on my clone with ✦ Forge open: .insp was at [x790, w310], .forge at [x1100, w340], .iresize at x=1127, and 'grip inside…

### B088 · Right-click menu opened near the bottom of the window is cut off (height clamp assumes 110px)

Broken · low · effort xs · found by `canvas` (+1 other lane)

- **Where:** Workspace (Edit) › right-click the plane near the bottom edge with a node selected; client/src/pages/AtlasWorkspace.jsx:853
- **Files:** `client/src/pages/AtlasWorkspace.jsx:853`, `client/src/pages/AtlasWorkspace.jsx:1593-1602`
- **What happens:** With a node selected the menu has 4 items and is 146px tall. It was placed at y=790 and ended at y=936 in a 900px window, so '⤓ Place an existing node here…' is partly off-screen (screenshot 33). The clamp is Math.min(clientY, innerHeight - 110).
- **Why it matters:** The menu always fits in the viewport.
- **Fix:** After render, measure the menu (a ref plus useLayoutEffect) and clamp against its real height/width. Or flip the menu upward when clientY + height > innerHeight.
- **Repro:** Zoom in so the map fills the stage, select a pin, then right-click about 15px above the timebar.
- **Evidence:** lanes/canvas/shots/33-ctx-bottom.png; s5.mjs ctx box {y:790,h:146,bottom:936,winH:900}
- **Re-proved:** AtlasWorkspace.jsx:853 is sy: Math.min(e.clientY, window.innerHeight - 110). The menu at :1593-1602 has 4 buttons when sel is set. Live, 1440x900 window: I zoomed in twice, selected 'The Flood' and right-clicked at y=819. The .ctxmenu box was y 790, height 146, bottom 936. The last item '⤓ Place an existing node here…' spans y 897.5 to 930, so only about 2px of it is on screen (verify/canvas-b3/shots/14-ctx-bottom.png). With nothing selected the 3-item menu is 113px tall and ends at 903, so it …
- **Also found as:** "Right-click menu is clamped for a 230×110 box, but it is 4 items tall and grows…" (a11y-polish)

### C043 · shell.scss says its palette mirrors .atlas but swaps --panel and --panel2

Confusing · low · effort s · found by `scss-dead` (+1 other lane)

- **Where:** client/src/styles/shell.scss:3, :9-12 vs client/src/styles/atlas.scss:3
- **Files:** `client/src/styles/atlas.scss:3`, `client/src/styles/shell.scss:3`, `client/src/styles/shell.scss:9-12`
- **What happens:** atlas.scss:3 defines `--panel:#232830; --panel2:#1b1f25` (panel = the lighter surface). shell.scss:9 says '// palette (mirrors .atlas)' and the header (L3) says 'Same palette as atlas.scss', but L11-12 define `--panel: #1b1f25; --panel2: #232830`, the reverse. So var(--panel) is the lighter surface in the workspace and the darker one on Dashboard/Archive. Workspace `.modal` sits on the light panel with darker `.fld input`s, while the shell `.smodal` sits on the dark panel with lighter inputs. A maintainer copying a rule between the two sheets gets inverted contrast.
- **Why it matters:** One token name means one colour everywhere, and the comment tells the truth.
- **Fix:** Move the shared tokens to a single partial (e.g. styles/_tokens.scss with --bg/--panel/--panel2/--ink/--muted/--line/--accent/--gold/--danger/--ok), @use it from atlas.scss and shell.scss, and settle on one meaning for panel/panel2.
- **Repro:** sed -n 3p client/src/styles/atlas.scss; sed -n 9,12p client/src/styles/shell.scss
- **Re-proved:** atlas.scss:3 has --panel:#232830; --panel2:#1b1f25. shell.scss:3 says 'Same palette as atlas.scss', and :9 says '// palette (mirrors .atlas)'. :11-12 then set --panel: #1b1f25; --panel2: #232830, the reverse. The consequence holds too. The atlas .modal (L110) uses var(--panel) (#232830) and its .fld input (L88) uses var(--panel2) (#1b1f25, darker). The shell .smodal (shell.scss:207) uses var(--panel) (#1b1f25) and .sinput (L149) uses var(--panel2) (#232830, lighter).
- **Also found as:** "shell.scss says its palette 'mirrors .atlas' but swaps --panel and --panel2" (a11y-polish)

### P040 · The reader's resize grip and ✕ scroll away with long text

Product polish · low · effort xs · found by `postures-share`

- **Where:** 👁 View / 🎭 Player reader (.reader .rgrip, .rclose)
- **Files:** `client/src/styles/atlas.scss:301-305`, `client/src/styles/atlas.scss:355`, `client/src/pages/AtlasWorkspace.jsx:1351-1372`
- **What happens:** Both are position:absolute children of the scrolling .reader. I selected 'The Flood' (40 paragraphs, scrollHeight 3149 vs 854), scrolled to the bottom, and the grip's box was at y=-2249 and ✕ at y=-2239. The element at the reader's left edge was .rinner. To resize or close, the DM has to scroll back to the top. The grip itself works: drag widened 576→720 px (clamped at 720), the width persisted into Player, and double-click reset it to 576 and cleared localStorage.
- **Why it matters:** The resize edge and close button should stay put while the text scrolls.
- **Fix:** Give .rgrip and .rclose position:sticky, or split the reader into a non-scrolling shell (grip + ✕) around an inner scroller (.rscroll with overflow-y:auto).
- **Repro:** Run b7.mjs: View, select The Flood, set .reader scrollTop to max, then query the grip and ✕ bounding boxes.
- **Evidence:** b7.json gripBoxScrolled y -2249, closeBoxScrolled y -2239, elemAtLeftEdgeScrolled 'rinner'
- **Re-proved:** Code: atlas.scss:301 .reader{position:relative;overflow-y:auto}, :304 .rclose position:absolute, :355 .reader .rgrip position:absolute top:0 bottom:0. Both are direct children of .reader (AtlasWorkspace.jsx:1353-1354 and 1369-1370), so they scroll with the content. Reproduced on my clone (world 145, cloned from 30, now deleted) with a 40-paragraph node 'VerifyLong' in View: reader scrollHeight 3065 vs clientHeight 854. Before scrolling, grip y=46 and close y=56. After setting scrollTop to max, …

### P041 · Every signed-in cold load flashes a light-grey 'Loading...' screen before the dark app

Product polish · low · effort xs · found by `a11y-polish`

- **Where:** App.jsx ProtectedRoute/PublicRoute/Home loading state; main.scss body
- **Files:** `client/src/styles/main.scss:8-13`, `client/src/styles/main.scss:190`, `client/src/App.jsx:17-49`, `client/index.html`
- **What happens:** main.scss:8-13 still sets body `background-color:#f5f5f5; color:#333` from the old light theme. While AuthContext verifies the token, App.jsx renders `<div className="loading">Loading...</div>` on that body, so the first frame of /dashboard and /w/... is light grey with dark text (filmstrip frame 1 at ≈120ms). The Player View isn't affected because it renders its own dark 'Opening the world…'.
- **Why it matters:** Loading states use the app's dark background, with no white flash.
- **Fix:** In main.scss set body `background:#12151a;color:#e8e8e6`, add `<meta name="color-scheme" content="dark">` and `style="background:#12151a"` on <body> in index.html, and style `.loading` (main.scss:190) as a centred muted line on the dark background.
- **Repro:** Cold-load /w/125/m/402 and /dashboard and screenshot every 120ms (s9.mjs). Filmstrips: shots/strip-workspace.png, strip-dash.png, strip-pview.png.
- **Re-proved:** main.scss:8-13: `body { ... color: #333; background-color: #f5f5f5; }`. main.scss:190: `.loading` has color #666 and no background. App.jsx:17-49: ProtectedRoute, PublicRoute and Home render `<div className="loading">Loading...</div>` while AuthContext.loading is true. The initial state is loading:true, and it stays true until /api/auth/me returns. index.html has no color-scheme meta and no body style. Live: I delayed /api/auth/me by 1.5s and cold-loaded /dashboard. The body computed background…

### P057 · main.scss's global `.loading{min-height:100vh}` leaks into the workspace overlay and the Setup card

Product polish · low · effort xs · found by `scss-dead`

- **Where:** client/src/styles/main.scss:190-197 · AtlasWorkspace.jsx:1033 · Setup.jsx:84
- **Files:** `client/src/styles/main.scss:190-197`, `client/src/styles/main.scss:499-511`, `client/src/styles/atlas.scss:100`, `client/src/pages/AtlasWorkspace.jsx:1033`, `client/src/pages/Setup.jsx:84-87`
- **What happens:** `.loading` is unscoped: display:flex (row), centre, min-height:100vh, 1.1rem, #666. `.atlas .loading` (atlas.scss:100) resets only colour. The map-switch overlay `<div className="loading" style={{position:'absolute',inset:0}}>Opening…</div>` (AtlasWorkspace.jsx:1033) therefore becomes at least 100vh tall inside the shorter, overflow-hidden stage. 'Opening…' centres on that box, about 56px below the stage's centre on desktop (top bar 46px plus timebar 66px). On /setup, `.setup-container .loading` (L499) inherits min-height:100vh and flex-direction row. The 'Checking system status' card grows taller than the screen, and its h2 and p sit side by side.
- **Why it matters:** Generic class names are scoped or reset where reused.
- **Fix:** Rename the global to `.route-loading` (App.jsx:22/32/43) or scope it (`.app > .loading`). Add `min-height:0` to `.atlas .loading`. Give `.setup-container .loading` `min-height:0;flex-direction:column`.
- **Repro:** Read main.scss:190-197 against atlas.scss:100 and Setup.jsx:84-87; `.setup-container .loading` sets no min-height/flex-direction.
- **Re-proved:** main.scss:190-197 defines a global `.loading` with display:flex, min-height:100vh, #666 and 1.1rem. atlas.scss:100 `.loading` (inside .atlas) sets only flex, centring and colour, with no min-height reset. main.scss:499 `.setup-container .loading` adds text-align and padding but no min-height or flex-direction, and Setup.jsx:84-87 puts an h2 and a p inside it. I checked live at 1440x900 by injecting the same element as AtlasWorkspace.jsx:1033 (className 'loading', position:absolute, inset:0) int…

### P067 · Controls that no rule reaches render with the browser's default light look inside the dark UI

Product polish · low · effort s · found by `scss-dead`

- **Where:** Login.jsx:185 detail. The Login page is a white card on a purple gradient (main.scss:28-40), not the dark UI. The guest button sits BELOW 'Sign in with Waypoint', not between .login-button and .sso-button. Also, atlas.scss:425 is .sic (the sheet link badge used as 'ic sic' at PlayerView.jsx:342), not an .ic rule. There are 8 .ic look rules plus that .sic.
- **Files:** `client/src/pages/ImageManager.jsx:619`, `client/src/styles/shell.scss:238-242`, `client/src/styles/archive.scss:277`, `client/src/pages/AtlasWorkspace.jsx:1641`, `client/src/pages/AtlasWorkspace.jsx:1644`, `client/src/styles/atlas.scss:186`, `client/src/pages/AtlasWorkspace.jsx:1941`, `client/src/styles/atlas.scss:456`, `client/src/pages/PlayerView.jsx:307`, `client/src/pages/Login.jsx:185`
- **What happens:** (1) The lightbox close `<button className="mclose lbclose">` (ImageManager.jsx:619): `.mclose` looks exist only as `.shell .smodal .mhead .mclose` (shell.scss:238), and `.lbside .lbclose` (archive.scss:277) sets position only, so it gets a default grey box. (2) The Focus-period modal's two number inputs (AtlasWorkspace.jsx:1641/1644) sit in `.span`, not `.fld`. `.atlas .span input` (L186) sets only width, so they are white default inputs on the dark modal. (3) The fact-row ✕ `lx` (AtlasWorkspace.jsx:1941) gets only margin from `.factrow .factspan .lx` (L456). The `.lx` look is defined only under .lrow/.vrow/.sptitle (L193/L653/L589), so it is a default button. (4) The Player View sheet header's category badge `<span className="ic">` (PlayerView.jsx:307) matches none of the nine per-container `.ic` rules (L76, 91, 201, 222, 234, 248, 313, 322, 425). It renders as a bare glyph on a coloured rectangle, not the round white-glyph badge used everywhere else, in every sheet a player opens. (5) Login.jsx:185 'Continue as guest' has no class, just a default button between the styled .login-button and .sso-button.
- **Why it matters:** Every interactive control uses the app's own look.
- **Fix:** Hoist `.mclose` to `.shell .mclose`. Add a base `.atlas input[type=number], .atlas input[type=text]` field rule (or make .span inputs match .fld input). Add a base `.atlas .lx` rule and keep the container variants only for layout. Add one `.atlas .ic` base rule (round, white glyph) with size modifiers, which also retires 8 copies. Give the guest button a class styled like .sso-button.
- **Repro:** Inverse structural pass (scratch lanes/scss-dead/struct.mjs → unstyled.txt / lonely.txt) lists ImageManager:619 <button.mclose.lbclose>, AtlasWorkspace:1641/1644 <input>, AtlasWorkspace:1941 <button.lx>, Login:185 <button>, and PlayerView:307 `.ic` as reached by no rule that sets background/border/color/font/padding.
- **Re-proved:** I confirmed all five live on my clone. (1) The Archive lightbox button.mclose.lbclose is bg rgb(239,239,239), black text, 2px outset border, a default grey box (shot archive-lightbox-side.png). The only .mclose rule is shell.scss:238 under .smodal .mhead, and archive.scss:277 sets position only. (2) The Focus-period inputs are bg white, black text, 2px inset border on the rgb(35,40,48) modal (shot ws-focus-modal.png). .span input (L186) sets only width. (3) After adding a period, the factrow ✕ … _(partly — the corrected location is used above)_

### P068 · Dashboard and Archive top bar on phones: the wordmark wraps to 2 lines and the account pill wraps to 3 and spills out of the bar

Product polish · low · effort xs · found by `mobile`

- **Where:** On the Dashboard the account pill wraps to 2 lines and stays inside the bar. The 3-line wrap that spills out (y=-10 to 65) happens only on the Archive, where the crumb also takes room. NotFound.jsx:10 (TopBar crumb="Uncharted") is another affected page.
- **Files:** `client/src/styles/shell.scss:44-88`, `client/src/components/TopBar.jsx:39-50`
- **What happens:** The shell bar has no narrow-screen rule. At 390px, 'Fantasy Map Timeline' wraps to two lines and the account pill 'e2e-atlas-22558 ▾' wraps to three. On the Archive it spills from y=-10 to 65 in a 56px bar, clipped into an oval.
- **Why it matters:** A one-line top bar on phones.
- **Fix:** Add `@media (max-width:480px)` to shell.scss: hide `.wm-text` (keep the compass), give `.userbtn` `white-space:nowrap;max-width:40vw;overflow:hidden;text-overflow:ellipsis`, and hide `.shellcrumb`.
- **Repro:** iPhone 13, signed in: /dashboard and /worlds/<id>/images. Shots: lanes/mobile/shots/dash-iPhone_13-01.png, archive-iPhone_13.png.
- **Re-proved:** shell.scss has 0 @media rules (grep -c), and no other stylesheet targets .shellbar, .wm-text or .userbtn. I measured on iPhone 13 (390px), signed in, with verify/mobile-b4/shell.mjs. Dashboard: .wm-text is 57px tall, 2 lines ('Fantasy Map / Timeline'). .userbtn is 54px tall, 2 lines ('e2e-atlas- / 22558 ▾'), running y=1 to 55, so inside the 56px bar. Archive: the wordmark is on 2 lines, the crumb 'The Archive' on 2 lines, and .userbtn on 3 lines at y=-10 to 65, spilling out of the 56px bar as a… _(partly — the corrected location is used above)_

### P070 · Element selectors inside `.fld` reach unintended controls: the pin-size slider gets a text-field box and its label becomes a caption

Product polish · low · effort xs · found by `scss-dead`

- **Where:** Only the label defect is visible: 'Size on the map' takes the 10px uppercase field-caption style. The range input receives the text-field background, border and padding in computed style, but Chromium does not draw them for a native-appearance range, so no frame shows.
- **Files:** `client/src/styles/atlas.scss:87`, `client/src/styles/atlas.scss:88`, `client/src/pages/AtlasWorkspace.jsx:1963-1967`
- **What happens:** `.atlas .fld input` (L88: width 100%, --panel2 background, 1px border, 6px radius, 6px 8px padding) also matches the <input type="range"> nested in the Image field (AtlasWorkspace.jsx:1966), drawing a boxed text-field frame around the slider. `.atlas .fld label` (L87: display block, 10px, uppercase, letter-spaced) matches the nested <label className="muted"> 'Size on the map', whose inline display:flex restores the layout but not the 10px uppercase italic caption styling.
- **Why it matters:** Field-caption and text-input styles apply only to the field's own caption and text inputs.
- **Fix:** Use `.fld > label` for the caption and `.fld input:not([type=range]):not([type=checkbox])` for fields.
- **Repro:** Read AtlasWorkspace.jsx:1949-1968: the range input and label sit inside <div className="fld"><label>Image</label>…
- **Re-proved:** The selectors do reach these controls. atlas.scss:87 `.fld label` and :88 `.fld input` both match the nested <label className="muted"> and <input type="range"> inside `<div className="fld"><label>Image</label>` at AtlasWorkspace.jsx:1950-1968. Live on my clone (node 876 with pin 'image'), the range input computed to bg rgb(27,31,37), border 1px solid rgb(58,63,71), radius 6px and padding 6px 8px. The 'Size on the map' label computed to 10px, uppercase, 0.6px letter-spacing, italic, and the scre… _(partly — the corrected location is used above)_

### P087 · Long world names break the dashboard layout: unbroken words overflow the featured panel, long names grow it to 9 lines, and the phone top bar wraps

Product polish · low · effort xs · found by `dashboard`

- **Where:** The featured-panel overflow and growth are confirmed. The finder's 9 lines / ~690px vs my 10 lines / 738px is only a difference in name length. Top-bar detail is wrong: .shellbar is fixed at 56px (client/src/styles/shell.scss:49), so the wrapped wordmark and username pill are crammed into a 56px bar rather than doubling it. The wrap comes from the username length ('e2e-atlas-22558') plus the 19px wordmark at 390px, not from world names. Relevant rules: shell.scss:49, 64-69, 78-88.
- **Files:** `client/src/styles/dashboard.scss:63-71`, `client/src/styles/dashboard.scss:140-147`, `client/src/styles/shell.scss:56-88`
- **What happens:** A name containing one long word runs off the right edge of the featured panel and is clipped (.fname scrollWidth - clientWidth = 2824px). A 255-char multi-word name renders as a 9-line 44px title that pushes the panel to ~690px tall. On an iPhone 13 the wordmark wraps to 'Fantasy Map / Timeline' and the username pill to 'e2e-atlas- / 22558 ▾', doubling the top bar's height. Page-level horizontal overflow stays 0.
- **Why it matters:** Names should wrap and clamp (e.g. 3 lines with an ellipsis), and the top bar should stay one line on phones.
- **Fix:** dashboard.scss: .fname, .wname { overflow-wrap: anywhere; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden } and add a title attribute with the full name. shell.scss: under 480px hide .wm-text (or shrink it) and give .userbtn max-width + text-overflow: ellipsis; white-space: nowrap.
- **Repro:** PATCH a world's name to a 150-char single word and a 255-char sentence, then view /dashboard at 1440px and on iPhone 13 (lanes/dashboard/run6.mjs).
- **Evidence:** Screenshots lanes/dashboard/shots/31-long-featured.png, 32-nospace-featured.png, 34-mobile-top.png; run6 output 'featured fname overflow 2824'
- **Re-proved:** I reproduced this on my own clone (world 160, since deleted) with verify/dashboard-b4/longname2.mjs. CSS matches the finding: dashboard.scss:63-71 .fname and :140-147 .wname have no overflow-wrap and no clamp, and shell.scss:64-69 .wm-text and :78-88 .userbtn have no nowrap/ellipsis. At 1440px a single-word name gave .fname scrollWidth-clientWidth = 2824 (3388 vs 564), and the word runs off the panel edge (shots/nospace-featured.png). Page-level horizontal overflow was 0. A 254-char sentence re… _(partly — the corrected location is used above)_

### P090 · Brand mark and serif change between pages: Compass SVG and Cormorant on shell pages, 🧭 emoji and Georgia in the Atlas

Product polish · low · effort xs · found by `a11y-polish`

- **Where:** The PlayerView brand is at client/src/pages/PlayerView.jsx:160, not 162. shell.scss's --serif token is at line 21, not 22. The other locations (AtlasWorkspace.jsx:888-889, atlas.scss:312 and 422) are correct.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:888-889`, `client/src/pages/PlayerView.jsx:162`, `client/src/styles/atlas.scss:312`, `client/src/styles/atlas.scss:422`, `client/src/styles/shell.scss:22`
- **What happens:** Shell pages use <Compass/> (TopBar.jsx) and Cormorant Garamond (shell.scss --serif). The workspace and Player View brand is the 🧭 emoji (AtlasWorkspace.jsx:888-889, PlayerView.jsx:162). The reader and sheet headings use Georgia (atlas.scss:312, 422; computed 'Georgia, "Times New Roman", serif'), and document.fonts had no Cormorant loaded in the workspace. shell.scss's header says the app should be 'one continuous place'.
- **Why it matters:** One mark and one display serif everywhere.
- **Fix:** Import Compass from components/TopBar in AtlasWorkspace/PlayerView in place of 🧭, and move --serif to a shared token used by atlas.scss:312 and 422.
- **Repro:** Compare shots/d1440-dashboard.png with d1440-view.png. Computed font of .reader h3 via s10.mjs.
- **Re-proved:** The core claim holds. TopBar.jsx:7 exports Compass, used at TopBar.jsx:41 and in Dashboard, NotFound and ImageManager. The workspace brand is the 🧭 emoji at AtlasWorkspace.jsx:888-889, and the live .top .brand text begins '🧭'. PlayerView's brand is `<span className="brand">🧭 {world.name}</span>`. atlas.scss:312 (.rhead h3) and :422 (.shead h3) use Georgia. In the live workspace (View mode, reader open) .reader .rhead h3 computed to 'Georgia, "Times New Roman", serif'. Every Cormorant FontFac… _(partly — the corrected location is used above)_

### P094 · Destructive confirm buttons in the workspace modals lose their danger styling

Product polish · low · effort xs · found by `scss-dead`

- **Where:** Workspace › inspector › 🗑 Delete… (and ◎ ✕ Remove interior) › confirm modal
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1573`, `client/src/pages/AtlasWorkspace.jsx:1587`, `client/src/styles/atlas.scss:96`, `client/src/styles/atlas.scss:145`, `client/src/styles/atlas.scss:183`, `client/src/styles/atlas.scss:547`
- **What happens:** 'Remove interior' (AtlasWorkspace.jsx:1573) and 'Delete everywhere' (:1587) are `tool danger`. `.danger` is only styled inside specific containers: `.invitepop .danger` (L145), `.tlcfg .danger` (L183), `.forge .fbrow .danger` (L547), plus `.btn.danger` (L96). No rule reaches `.modal .mrow .tool.danger`, so the destructive button looks exactly like 'Keep it' beside it.
- **Why it matters:** The destructive choice in a confirm dialog is visually marked, as it is in the Share popover, the timeline config and the Forge.
- **Fix:** Add one `.atlas .tool.danger{color:#e66;border-color:#5a2a2a}` and delete the three container-scoped copies (L145, L183, L547 first half).
- **Repro:** Structural matcher: element AtlasWorkspace.jsx:1573/1587 class `danger` is reached by no rule (scratch lonely.txt). Reading the rules: every .danger selector is container-scoped.
- **Re-proved:** AtlasWorkspace.jsx:1573 'Remove interior' and :1587 'Delete everywhere' are className="tool danger". Across all stylesheets, the only .danger rules are atlas.scss:96 .btn.danger, :145 .invitepop .danger, :183 .tlcfg .danger, :547 .forge .fbrow .danger and shell.scss:142 .sbtn.danger. None reaches .modal .mrow .tool.danger, and .mrow (L263) is layout only. I checked it live on my own clone of world 27: selected The Keep, clicked 🗑 Delete…, and read the computed styles. Both 'Keep it' and 'Delet…

