# WP-09 · The Player View on phones

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Players mostly use phones. Make the Player View fit 390px and 320px screens, keep pins tappable and pinch-zoom working, and stop the DM's Edit posture from moving pins on touch.

**Do after:** [WP-05](WP-05-the-player-view-never-strands-a-player.md)

**Notes:** Test at 390px and 320px, in portrait and landscape. mobile-01 comes from the .atlas grid at atlas.scss:6, the same rule as a11y-polish-01 in WP-17: fix it once here and re-check the desktop widths. scss-dead-02 is the atlas.scss:613 rule that hides ◎ on hover screens, and fixing it also fixes the DM pins. mobile-02 and mobile-03 are the DM on a phone: open in View and require a deliberate gesture to drag. copy-15: icon-only buttons need visible or aria labels, because phones never show title=.

## Checklist

- [ ] **B038** · medium · xs · On a touch screen the Edit posture is live: a swipe that starts on a pin moves it and autosaves, with no undo
- [ ] **B048** · medium · xs · A node's picture in the phone bottom sheet is squashed to a strip (109px of a 244px image; 39px on a 320px phone)
- [ ] **B052** · medium · s · On phones the page is wider than the screen, so crumbs, the canon chip, and the DM's posture switch and Exit are off-screen and can't be reached
- [ ] **B053** · medium · s · Player View ◎ 'go inside' button on chip pins is display:none on every hover-capable screen
- [ ] **B055** · medium · s · Pinch-zoom fails when either finger starts on a pin: the map pans instead
- [ ] **B056** · medium · m · The DM workspace has no phone layout: it opens in Edit with fixed side columns, and View hides the map behind a reader with no ✕
- [ ] **P018** · medium · s · Player era bar on phones: a fixed 260px label zone shrinks the scrubber to 90px (20px on a 320px phone) and truncates era names to 'B', 'S…'
- [ ] **P019** · medium · s · On phones, region name tags cover pins and each other (labels are z-index 4, pins 3)
- [ ] **P020** · medium · m · On phones pins pile up and steal each other's taps: tapping Warden Brakk opens The Party
- [ ] **P021** · medium · s · Tap targets on the phone Player View are far below 44px; '◎ go inside' is 19×15px
- [ ] **C063** · low · s · The ◎ on an outlined place's name tag looks like the 'go inside' button but only opens the sheet
- [ ] **P060** · low · xs · Page title never changes on the workspace, Player View, 404 or login; the players' tab never shows the world
- [ ] **P073** · low · xs · Sheet header: the ✕ covers the category label and the category icon renders as a thin unstyled sliver
- [ ] **P075** · low · xs · Marker form, era input and create-world inputs are 13–14px, so iOS zooms the page when they get focus
- [ ] **P077** · low · s · Icon-only buttons rely on title=, which phones never show, and the whole client has one aria-label
- [ ] **P078** · low · s · Fixed chrome leaves phones little map: the lantern trail wraps to 128px, and in landscape the sheet leaves about 70px

## Items

### B038 · On a touch screen the Edit posture is live: a swipe that starts on a pin moves it and autosaves, with no undo

Broken · medium · effort xs · found by `mobile`

- **Where:** DM workspace › Edit posture (the default) on a phone › drag on a pin; AtlasWorkspace.jsx:671-679
- **Files:** `client/src/pages/AtlasWorkspace.jsx:671-679`, `client/src/pages/AtlasWorkspace.jsx:655-669`
- **What happens:** On iPhone 13, fresh profile, /w/66, I touch-dragged 60px down starting on the 'Your first node' label. The overlapping tower pin was on top and took the drag. GET /api/atlas/maps/217 showed placement 832 moved from (78,22) to (67.42,72.80), about half the plane, because the stage is only 197px wide. The header chip showed '✓ Saved'. There is no undo for moves: undoId exists only for delete and remove-interior flashes (AtlasWorkspace.jsx:406,419,425). I restored the placement via PATCH.
- **Why it matters:** Editing on phones is view-only by design. Trying to pan the map from a pin must not rewrite world data.
- **Fix:** In onPinDown, when `e.pointerType === 'touch'` (or `matchMedia('(pointer:coarse)')` matches), select only and never start a drag. Combined with forcing View on phones, this removes the path completely.
- **Repro:** Mobile lane dm1.mjs: open /w/<id> on iPhone 13, CDP touchStart on a pin, touchMove 60px, touchEnd, then GET /api/atlas/maps/<root> and compare x/y.
- **Re-proved:** Code: onPinDown (AtlasWorkspace.jsx:671-679) returns early only when mode !== 'edit' or while placing. It never checks pointerType, so a touch press starts dragRef. onDragUp (:655-669) calls patchPlacement once the pointer has moved more than 3px. A grep for undoId finds only the flashes at :406, :419 and :425 (remove interior, delete, remove from map), so a move has no undo. Live on my own clone, iPhone 13, fresh profile, default Edit posture (the .mode 'on' button read '✏ Edit', main class 'm…

### B048 · A node's picture in the phone bottom sheet is squashed to a strip (109px of a 244px image; 39px on a 320px phone)

Broken · medium · effort xs · found by `mobile`

- **Where:** Player View › tap a node that has an image › bottom sheet hero; atlas.scss:153 + 418
- **Files:** `client/src/styles/atlas.scss:153-155`, `client/src/styles/atlas.scss:415-421`, `client/src/pages/PlayerView.jsx:302-305`
- **What happens:** `.sheet` is a flex column with `max-height:48vh;overflow:auto`. `.shero` has `overflow:hidden`, so its min-height resolves to 0 and it takes all the flex shrink. On iPhone 13, The Flood (240×150 art): .shero is 109px tall while its img renders 244px (expected 239), so the tower in the art is cut off. The sheet's scrollHeight equals its height, so nothing scrolls. iPhone SE: 39px. On iPad landscape (side panel) the hero is fine at 269px.
- **Why it matters:** The hero shows the whole image (up to 36vh) and the sheet scrolls.
- **Fix:** Add `flex:none` to `.pview .sheet .shero` and `.sinner` (atlas.scss:418/421) so overflow scrolls instead of shrinking the hero.
- **Repro:** Give a node an image (PATCH /api/atlas/nodes/:id {image_id}), then on iPhone 13 open /p/<token> and tap it. Mobile lane pv9.mjs; shots: lanes/mobile/shots/iPhone_13-43-hero.png, iPhone_SE-41-hero-sheet.png.
- **Re-proved:** Code: atlas.scss:153-155 sets `.pview .sheet` to a fixed flex column with max-height:48vh and overflow:auto. atlas.scss:418 sets `.shero` to max-height:36vh with overflow:hidden, so its min-height is auto→0 and flex-shrink is 1. `.sinner` (421) has neither. Read-only probe of the finder's world 66 via /p/zDLrx1z4pjuvdvzaxi2k4h9p, tapping The Flood. On iPhone 13 the sheet is 319px with scrollHeight 318, the hero 109px, the img 244px, and the expected hero 239px. On iPhone SE the sheet is 273/272…

### B052 · On phones the page is wider than the screen, so crumbs, the canon chip, and the DM's posture switch and Exit are off-screen and can't be reached

Broken · medium · effort s · found by `mobile`

- **Where:** The '👁 View' detail is state-dependent, not as stated. On a fresh profile with no save chip, View sits at x=341-392 and Playwright's tap succeeds. It goes off-screen only after an edit, once the '✓ Saved' chip is in the top bar (after a drag my second tap on View failed with 'outside of the viewport'). The reader ✕ x-position depends on the world name (557 here, not 486). The 'offline?' chip position was not reproduced, because it only appears after a failed refresh.
- **Files:** `client/src/styles/atlas.scss:6`, `client/src/styles/atlas.scss:20`, `client/src/styles/atlas.scss:644`, `client/src/pages/PlayerView.jsx:159-183`, `client/src/pages/AtlasWorkspace.jsx:886-1000`
- **What happens:** `.atlas` sets only `grid-template-rows`. Its single implicit column therefore grows to the top bar's min-content width, and `position:fixed` means the page never scrolls. On iPhone 13 (390px wide): Player View on map 228 gives the .atlas column 1625.78px. .crumbs runs from 148 to 1400px with scrollWidth equal to clientWidth (1252), and scrollLeft stays 0 after a touch-drag and after setting scrollLeft=9999. The current crumb (.here) sits at x=1055–1400, the 🕓 canon chip at x=1412–1614, and the 'offline?' chip at x=424–483 inside an interior. On the root map the canon chip is cut off after 'Session 3'. DM workspace in Edit posture: the column is 737px (Pixel 7: 742px). View, Player, Share, Forge, Archive and Exit sit at x=420–804, and Playwright's tap fails with 'Element is outside of the viewport'. In Player posture, a pin opens a reader whose ✕ is at x=486, so the reader can't be closed. This makes CLAUDE.md's 'crumbs kept visible (scrolling) on phones' false.
- **Why it matters:** Nothing should sit outside the viewport. Crumbs should scroll horizontally, the current crumb and canon moment should be visible, and the posture switch, Exit and reader ✕ should be reachable.
- **Fix:** In atlas.scss add `grid-template-columns:minmax(0,1fr)` to `.atlas` and `min-width:0` to `.top`. Give `.top .brand` `min-width:0;overflow:hidden;text-overflow:ellipsis;max-width:40vw`. In PlayerView, scroll `.crumbs .here` into view on map change. Let the DM top bar wrap or hide secondary buttons (Share, Forge, Archive) below 700px so the posture switch and Exit stay on screen.
- **Repro:** Mobile lane, iPhone 13 emulation: open /p/<token>/m/<deep map id> and run getComputedStyle(document.querySelector('.atlas')).gridTemplateColumns, which returns '1625.78px'. Then sign in, open /w/<id> on a fresh profile (defaults to Edit) and try to tap '👁 View'. Shots: lanes/mobile/shots/iPhone_13-09-reliq-list.png, iPhone_13-01-root.png, dm-iPhone_13-02-after-drag.png, dm-player-iPhone_13-03-after-close.png
- **Re-proved:** Reproduced on my own clone of world 30 (id 115, since deleted) with iPhone 13 emulation. Code: atlas.scss:6 gives .atlas only grid-template-rows, and PlayerView.jsx:159-183 / AtlasWorkspace.jsx:886-1000 are the top bars as cited. Player View at the root map: getComputedStyle(.atlas).gridTemplateColumns is '572.703px' on a 390px screen, and the canon chip '🕓 Session 3 · footstep 8' sits at x=359-561, cut off after the clock icon. Inside the Keep interior (/p/<token>/m/372) the column is '709.53… _(partly — the corrected location is used above)_

### B053 · Player View ◎ 'go inside' button on chip pins is display:none on every hover-capable screen

Broken · medium · effort s · found by `scss-dead` (+1 other lane)

- **Where:** The e2e detail and the last fix step are wrong. Headless Chromium matches (hover: none): matchMedia('(hover: hover)') returned false in both the headless shell and channel 'chromium'. So in e2e/player.mjs:61-63 the ◎ is actually visible, and a non-forced click on it succeeded in my default headless run. {force:true} is not what hides the bug, and removing it would not let the suite catch it. A suite check would need to emulate a hover device, e.g. by flipping the (hover: hover) media rule to 'all' as I did, or asserting via CSSOM.
- **Files:** `client/src/styles/atlas.scss:606-619`, `client/src/pages/PlayerView.jsx:246-250`, `client/src/styles/atlas.scss:474`, `e2e/player.mjs:61-63`
- **What happens:** PlayerView.jsx:246 renders the single-tap enter button as <button className="open enter"> inside .pin. The collapsed-pin rule `@media (hover:hover){ .atlas:not(.labelson) .pin:not(.ipin) .open{display:none} }` (atlas.scss:613, from 96a688d on 2026-08-25) was written to hide the passive ◎ glyph. It also hides this button, which reused the `open` class when it arrived in 4dceaee on 2026-09-24. The Player View root (`atlas pview`) is never `.labelson`, so on any mouse device chip pins with interiors have no ◎. It stays hidden on hover too, because only `.lbl` is revealed. Image pins (.ipin) keep it via atlas.scss:474, and touch screens (hover:none) keep it. e2e/player.mjs:61-63 clicks `.pview .pin .enter` with {force:true} at 1280×800, which skips the visibility check.
- **Why it matters:** CLAUDE.md, 'Player View navigation': '◎ on pins/list rows is a single-tap "go inside"'. That should hold for chip pins on desktop too.
- **Fix:** Give the button its own class and drop `open` from it, e.g. className="enter" in PlayerView.jsx:246 and :263 (list rows need the muted colour from `.lsrow .open`, so give `.enter` that colour). In the (hover:hover) block, position `.pin:not(.ipin) .enter` as an absolute corner badge like `.pin.ipin .open` (atlas.scss:474) so it fits the 32px collapsed circle without colliding with .psig/.stag. Then remove {force:true} from e2e/player.mjs:63 so the suite can catch this.
- **Repro:** Code: atlas.scss:613 selector specificity 0,5,0 → display:none applies to PlayerView.jsx:246's button whenever (hover:hover). UI (not driven): open a share link on a laptop and hover a plain chip pin that has an interior. No ◎ appears. Only double-click or the sheet's '◎ Look inside' enters.
- **Evidence:** git log -S'className="open enter"' → 4dceaee 2026-09-24; git log -S':not(.ipin) .open' → 96a688d 2026-08-25.
- **Re-proved:** Core confirmed. PlayerView.jsx:246 and :263 render `<button className="open enter">`. No stylesheet sets display on `.enter`: atlas.scss:649 `.atlas.pview .pin .enter` sets only background, border, colour, font and padding. atlas.scss:613 `.atlas:not(.labelson) .pin:not(.ipin) .open` (0,5,0) sets display:none inside @media (hover:hover). The PlayerView root is always `atlas pview` (PlayerView.jsx:126/136/158), and labelson exists only at AtlasWorkspace.jsx:885. Live on my clone (world 80, delet… _(partly — the corrected location is used above)_
- **Also found as:** "Interior pins lose their ◎ marker in the default collapsed-name mode, yet the h…" (canvas)

### B055 · Pinch-zoom fails when either finger starts on a pin: the map pans instead

Broken · medium · effort s · found by `mobile`

- **Where:** The footprint stopPropagation is at client/src/components/PartyTrail.jsx:52 (onPointerDown on .fstep). PartyTrail.jsx is only 58 lines, so the cited line 297 does not exist. The PlayerView and MapPlane citations are correct.
- **Files:** `client/src/components/MapPlane.jsx:13-17`, `client/src/components/MapPlane.jsx:145-166`, `client/src/pages/PlayerView.jsx:228`, `client/src/pages/PlayerView.jsx:246`, `client/src/components/PartyTrail.jsx:297`
- **What happens:** Pins, the ◎ button and footprints call stopPropagation on pointerdown, so MapPlane never registers that finger and treats the other finger as a one-pointer pan. On iPhone 13 at fit zoom, a pinch with both fingers on empty map zoomed (scale 0.146→0.256). The same pinch with one finger on The Flood's label left the scale at 0.14625 and only panned (translate 7.8,95 → 63.5,72.9). On a landscape phone the pinch in the lane's standard script also failed to zoom. On phones pins are full labeled chips (130–220px) covering much of a 375px-wide map, so this happens often.
- **Why it matters:** A two-finger pinch should zoom wherever the fingers land.
- **Fix:** In MapPlane, register pointers in `onPointerDownCapture` so every touch is counted for pinch detection. Pins should claim only single-pointer taps: don't stopPropagation for pointerType 'touch', and resolve pin taps through onWorldClick via elementFromPoint, as regions already do.
- **Repro:** Mobile lane pv7.mjs: CDP Input.dispatchTouchEvent with two touchPoints moving apart, one starting on `.pview .pin` 'The Flood'; compare .mp-world transform before and after.
- **Re-proved:** Code: player pins (PlayerView.jsx:228), the ◎ buttons (:246, :263) and the footprints stopPropagation on pointerdown. MapPlane.jsx:145-166 adds a pointer to `pointers` only when it reaches the viewport, and with one pointer registered it starts a 'pan'. onPointerMove ignores pointers it does not hold. Live on my clone, iPhone 13, at fit zoom, via CDP two-point touches: with both fingers on empty map (elementFromPoint 'mp-viewport') the transform went from scale(0.14625) to scale(0.274219), a zo… _(partly — the corrected location is used above)_

### B056 · The DM workspace has no phone layout: it opens in Edit with fixed side columns, and View hides the map behind a reader with no ✕

Broken · medium · effort m · found by `mobile` (+1 other lane)

- **Where:** The iPad timebar track is not 'about 40px'. .ttrack measured x=278-278, so it is 0px wide and collapsed, with the handle sitting between the '10' and '39' labels (shot lanes/verify-mobile-b1/shots/iPad_gen_7_-dm4-view.png). Everything else checked out as stated.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:46`, `client/src/pages/AtlasWorkspace.jsx:97-102`, `client/src/pages/AtlasWorkspace.jsx:861`, `client/src/pages/AtlasWorkspace.jsx:1003-1007`, `client/src/pages/AtlasWorkspace.jsx:1335-1349`, `client/src/styles/atlas.scss:329-332`
- **What happens:** Posture comes from localStorage and defaults to 'edit', so a phone opens Edit. The grid is 230px rail + stage + 310px inspector, which leaves the map 197px wide on a 390px iPhone. In View posture `readerOpen` is always true. Below 700px the reader is `position:absolute;inset:0`, so the 'This space' panel ('No map notes yet — write them in ✏ Edit…') covers the whole stage. That panel has no ✕, so the map is never visible. A tap where The Flood pin should be lands on the reader. On iPad portrait (810px), View leaves the stage 240px between the rail and a 340px reader, with the timebar track about 40px. The only phone-related code is `wide` (line 97), which changes the reader's width, not whether it is shown.
- **Why it matters:** CLAUDE.md says mobile is view-only by design, so a phone should land in a readable View: map visible, reader opening only on selection and closable, rail collapsed.
- **Fix:** When `matchMedia('(max-width:700px)')` or `(pointer:coarse)` matches, force the posture to 'view' (or hide Edit), start with the rail closed, and don't auto-open the space reader. Open the reader on selection only and render the `.rclose` ✕ on the space panel too (AtlasWorkspace.jsx:1335). Below 900px, let the View reader overlay the map instead of taking a column.
- **Repro:** iPhone 13, signed in: set localStorage atlas_mode='view', open /w/66. Shots: lanes/mobile/shots/dm-view-iPhone_13-01.png (full-screen space panel, no map) and dm3-iPad_gen_7_-view.png (240px stage).
- **Re-proved:** Code: AtlasWorkspace.jsx:46-49 reads atlas_mode from localStorage and defaults to 'edit'. :97-102 `wide` is the only width-dependent logic; a grep for matchMedia, coarse or pointerType in AtlasWorkspace finds nothing. :861-863 sets readerOpen = true whenever mode === 'view'. The space panel at :1335-1349 renders no .rclose, while the node readers at :1354 and :1370 do. atlas.scss:329-332 makes .reader position:absolute;inset:0;z-index:12 below 700px. The rail is open by default (atlas_rail !== … _(partly — the corrected location is used above)_
- **Also found as:** "On a phone, View posture covers the map with a reader that cannot be closed, an…" (postures-share)

### P018 · Player era bar on phones: a fixed 260px label zone shrinks the scrubber to 90px (20px on a 320px phone) and truncates era names to 'B', 'S…'

Product polish · medium · effort s · found by `mobile` (+1 other lane)

> **Second pass — see also:** Era names also vanish at full desktop width once a campaign has more than about 5 sessions (DM bar) or 15 (player bar). The phone-only fix does not reach that. → **P110** in [WP-26](WP-26-the-party-the-clock-and-a-long-campaign.md)

- **Where:** Player View › era bar (EraScrub) on phones; atlas.scss:409
- **Files:** `client/src/styles/atlas.scss:399-411`, `client/src/components/EraScrub.jsx:59-98`
- **What happens:** `.ezone{width:260px;flex:none}`. Track widths: 90px on iPhone 13 (390), 112px on Pixel 7, 20px on iPhone SE (320). The four era bands are 18–28px wide and read 'B', 'S..', 'S..', 'S'. With about 37 footsteps across 90px, one footstep is 2.4px of thumb travel. The 'tap the label to type a moment' affordance is a title tooltip only, which never shows on touch, and it says 'Click to type a year' when the clock counts footsteps or days (EraScrub.jsx:90).
- **Why it matters:** On a phone the scrubber should use most of the width, with era names readable.
- **Fix:** Below about 600px, put `.ezone` on its own row under the track (flex-wrap, or a two-row grid with `width:auto`) and hide the band <em> labels except the current era's. Change the tooltip copy to name the world's unit, and make the tap-to-type affordance visible (e.g., a ✎ icon).
- **Repro:** Open /p/<token> of a world with player-visible eras on iPhone 13 or iPhone SE and measure .etrack. Shots: lanes/mobile/shots/iPhone_13-01-root.png, iPhone_SE-40-root.png.
- **Re-proved:** atlas.scss:409 is `.ezone{...width:260px;flex:none}` and .etrack is flex:1 (line 401). Live Player View on my clone: .etrack is 90px wide on iPhone 13 (x=14-104) and 20px on iPhone SE (x=14-34). On iPhone 13 the era bands are 18, 23, 23 and 18px wide, every <em> overflows, and they render 'B', 'S..', 'S..', 'S' (shot lanes/verify-mobile-b1/shots/iPhone_13-root.png). The range runs 1-37, about 2.5px per footstep. The label button (EraScrub.jsx:90) has title 'Click to type a year — it snaps into …
- **Also found as:** "Player View on a phone: top bar overflows, era names unreadable, sheet label un…" (journey)

### P019 · On phones, region name tags cover pins and each other (labels are z-index 4, pins 3)

Product polish · medium · effort s · found by `outlines`

- **Where:** Player View /p/:token on a phone (and any touch screen); client/src/styles/atlas.scss:736,745
- **Files:** `client/src/styles/atlas.scss:736-746`, `client/src/components/Regions.jsx:129-136`, `CLAUDE.md:87`
- **What happens:** Touch screens always show region labels (`@media (hover:none){.rlabel{opacity:1}}`), and `.rlabel` has z-index 4 against the pins' 3. On an iPhone 13 at fit zoom, the region label 'New node' fully covered 'The Flood' pin (only a sliver of the red icon showed), 'The Keep ◎' covered the 'x' pin, and 'Inner Shed' sat on top of 'Outer District' ('…ct' visible). The inner 5% outline was hidden under its own tag. CLAUDE.md:87 says 'pins always float above regions', which is not true of their names.
- **Why it matters:** Pins stay visible above region names, and nested or crowded region names don't stack on top of each other.
- **Fix:** atlas.scss:736: put .rlabel under pins (z-index 2, below .fstep/pins), or on touch show only the selected region's label plus labels whose on-screen region is big enough (compute from the region's bbox in Regions.jsx). Update CLAUDE.md:87 to match.
- **Repro:** Open /p/vBS6xCFNx7TljWw10CfHoFiv on iPhone 13 emulation. Script s18.mjs measures the overlaps: label/pin 'New node'/'The Flood', 'The Keep'/'x', label/label 'Inner Shed'/'Outer District'.
- **Evidence:** shots/s18-01-mobile-overlaps.png, shots/s10-01-mobile-pv.png
- **Re-proved:** CSS: .rlabel has z-index:4 (atlas.scss:736) and .pin z-index:3 (atlas.scss:73), and both are children of the same plane element (I checked sameParent=true in the page). `@media (hover: none){.atlas .rlabel{opacity:1}}` is at atlas.scss:745. CLAUDE.md:87 reads 'pins always float above regions'. I viewed the finder's share link /p/vBS6xCFNx7TljWw10CfHoFiv (read-only) in iPhone 13 emulation with phone.mjs. Computed z-index: label 4, pin 3, every label at opacity 1. Overlaps: the 'New node' label c…

### P020 · On phones pins pile up and steal each other's taps: tapping Warden Brakk opens The Party

Product polish · medium · effort m · found by `mobile`

- **Where:** Player View map on phones (also the DM workspace); atlas.scss:73-75 and 606-620
- **Files:** `client/src/styles/atlas.scss:73-75`, `client/src/styles/atlas.scss:606-620`
- **What happens:** Pins keep a fixed screen size (counter-scaled) and, on touch screens (hover:none), stay full labeled chips; only `@media (hover:hover)` collapses them to 32px circles. On iPhone 13 the Keep interior plane fits at 374×234px, and the four pins (Great Hall, Warden Brakk, Supply Chest, The Party, stored 12–24% apart) are 103–156px wide and stacked. Tapping the centre of 'Warden Brakk' opened 'The Party', and its label reads 'Ward…'. On the root map, 'Your first node' is hidden under the tower pin (max-width 220px). The DM's desktop view (collapsed circles) shows no overlap, so the DM has no way to see this.
- **Why it matters:** Players on phones can see and tap every place at fit zoom, or zooming separates them in an obvious way.
- **Fix:** On `(hover:none)`, collapse pins to icon chips (with a short label) when the plane scale is below a threshold and show full labels on the selected pin or when zoomed. Or cap the pin max-width at about 40vw on narrow screens and nudge overlapping chips apart.
- **Repro:** Mobile lane pv12.mjs on /p/<token>/m/218 (clone of world 30), iPhone 13: tap each pin centre and read `.sheet h3`. Shots: lanes/mobile/shots/iPhone_13-06-interior.png, iPhone_13-01-root.png.
- **Re-proved:** CSS: .pin (atlas.scss:73-75) is a full labelled chip with max-width 220px. Only `@media (hover: hover)` (atlas.scss:606-620) collapses pins to 32px circles, so touch screens keep the full chips and the desktop DM sees circles. Live Player View on my clone of world 30, Keep interior /p/<token>/m/372, iPhone 13: the pins are 103-156px wide and stacked (shot lanes/verify-mobile-b1/shots/iPhone_13-keep.png). 'Warden Brakk' is covered by 'The Party' and only 'Ward…' shows. I tapped the centre of eac…

### P021 · Tap targets on the phone Player View are far below 44px; '◎ go inside' is 19×15px

Product polish · medium · effort s · found by `mobile`

- **Where:** Player View on phones: pins' ◎, footprints, sheet threads, Mark button, zoom, back, Now, ✕
- **Files:** `client/src/styles/atlas.scss:647`, `client/src/styles/atlas.scss:55-59`, `client/src/styles/atlas.scss:507`, `client/src/styles/atlas.scss:62`, `client/src/styles/atlas.scss:113`
- **What happens:** Measured on iPhone 13: pin ◎ (the documented single-tap 'go inside') 19×15; party footprints 12×12; thread names (.lgo) 19px tall and ⌖ 30×27; party '◂ From …' links 19px; lantern hops 19px; '✍ Mark the map' 128×27; ⬆ back 149×27; '⦿ Now' 63×27; zoom ＋−⊡ 32×32; sheet ✕ 28×28; marker-form ✕ 13×19; Cancel/Place 27px tall.
- **Why it matters:** Touch targets of about 44×44px on a surface the table uses on phones.
- **Fix:** Add a `@media (pointer:coarse)` block in atlas.scss that pads `.pview .pin .enter`, `.fstep`, `.lrow .lgo`, `.rtrail a`, `.dmtrail a`, `.tool`, `.mp-controls button`, `.modal-head button` and `.sclose` to a 44px hit box (padding or an ::after hit area), and spaces the ◎ away from the pin label.
- **Repro:** Mobile lane metrics.mjs `probe()` on /p/<token> (iPhone 13), 'small' list; out-*.json in lanes/mobile.
- **Re-proved:** Measured on iPhone 13 on my clone and read-only on world 66. Values match the finding: pin ◎ .enter 19x15, .fstep 12x12, ✍ Mark the map 128x27, zoom ＋−⊡ 32x32, sheet ✕ 28x28, .lgo thread name 19px tall, ⌖ 30x27, single-line lantern hops (.dmtrail a) 19px, ⬆ back 149x27, ⦿ Now 63x27, marker-form ✕ 13x19, Cancel/Place 27px tall. I did not measure the party '◂ From …' link, but in code it is an inline <a> at 12.5px (atlas.scss:690-691, PlayerView.jsx:328), so about 19px is consistent. Code sources…

### C063 · The ◎ on an outlined place's name tag looks like the 'go inside' button but only opens the sheet

Confusing · low · effort s · found by `outlines`

- **Where:** Player View (phone) › an outlined place with an interior › tap ◎ on its tag; Regions.jsx:134, atlas.scss:736
- **Files:** `client/src/components/Regions.jsx:129-136`, `client/src/pages/PlayerView.jsx:243-247`
- **What happens:** On pins, ◎ is a real single-tap 'Go inside' button (PlayerView.jsx:245). On a region tag it is a decorative `<em>` inside a pointer-events:none label. Tapping the ◎ on 'The Keep ◎' on an iPhone hit the polygon underneath and opened the sheet; the URL did not change.
- **Why it matters:** The same glyph does the same thing everywhere: either make the tag's ◎ a button that enters, or use a different mark.
- **Fix:** Regions.jsx:134: render the ◎ as a `<button className="open enter">` with pointer-events:auto, calling an `onEnter(it)` prop (PlayerView passes enter, AtlasWorkspace passes openInterior). Or drop the glyph from region tags.
- **Repro:** /p/vBS6xCFNx7TljWw10CfHoFiv on iPhone 13 → zoom in twice → tap the ◎ in 'The Keep ◎' → the sheet opens, no navigation. Script s20.mjs.
- **Evidence:** shots/s20-01-tap-label-glyph.png; s20 output: element under ◎ = polygon.region, url unchanged, sheet 'The Keep'
- **Re-proved:** Regions.jsx:134 renders the tag's ◎ as `<em className="open" title="Has an interior">` inside `.rlabel`. atlas.scss:736 gives `.atlas .rlabel` `pointer-events:none`, and nothing re-enables it on `.open`, so a tap passes through to whatever is underneath. In PlayerView the plane's onWorldClick is onRegionTap (PlayerView.jsx:100/212), which calls openNode, so the sheet opens. Entering the interior needs the double-tap path (line 213). On pins, PlayerView.jsx:244-247 renders a real `<button classN…

### P060 · Page title never changes on the workspace, Player View, 404 or login; the players' tab never shows the world

Product polish · low · effort xs · found by `a11y-polish` (+4 other lanes)

- **Where:** document.title per route
- **Files:** `client/src/pages/AtlasWorkspace.jsx:229-244`, `client/src/pages/PlayerView.jsx:47-60`, `client/src/pages/NotFound.jsx:6`, `client/index.html`
- **What happens:** The titles are 'Your worlds · Fantasy Map Timeline' on /dashboard and 'The Archive · <world>' on the Archive, but 'Fantasy Map Timeline' on /w/:id/m/:map (every map and posture), /p/:token (the players' tab), the 404 page, /login and the dead-link page. Only Dashboard.jsx:76 and ImageManager.jsx:71 set document.title.
- **Why it matters:** The tab names the world and the map, e.g. 'The Keep — Inside · Sunken Keep', and players see the world's name.
- **Fix:** Add useEffect title setters: in AtlasWorkspace `${map.title} · ${world.name}`, in PlayerView `${world.name}` (and 'Link not active' when gone), and 'Page not found' in NotFound.
- **Repro:** Print page.title() on each route (s1.mjs, s11.mjs).
- **Evidence:** {dashboard:'Your worlds · Fantasy Map Timeline', workspace:'Fantasy Map Timeline', archive:'The Archive · [audit] a11y-polish sample', pview:'Fantasy Map Timeline', notfound:'Fantasy Map Timeline'}
- **Re-proved:** Only Dashboard.jsx:76-77 and ImageManager.jsx:71-72 assign document.title in client/src (grep for document.title and '.title ='; no Helmet dependency). Both cleanups reset the title to 'Fantasy Map Timeline', which is also the static title in index.html. AtlasWorkspace, PlayerView, NotFound and Login never set it. Live page.title(): /dashboard = 'Your worlds · Fantasy Map Timeline'; /w/150/m/476 = 'Fantasy Map Timeline'; /p/<token> = 'Fantasy Map Timeline'; an unknown route (404 voidstate) = 'F…
- **Also found as:** "The Player View and the Atlas never set document.title, so every player's tab r…" (client-dead); "The workspace and Player View never set the browser tab title" (copy); "Player View never sets the tab title" (player-desktop); "Player View never sets the page title: every player's tab or home-screen bookma…" (mobile)

### P073 · Sheet header: the ✕ covers the category label and the category icon renders as a thin unstyled sliver

Product polish · low · effort xs · found by `player-desktop` (+2 other lanes)

- **Where:** Player View › any sheet without a hero image; client/src/styles/atlas.scss:156-160, 415-417
- **Files:** `client/src/styles/atlas.scss:156-160`, `client/src/styles/atlas.scss:415-417`, `client/src/pages/PlayerView.jsx:303-311`
- **What happens:** The .sclose button is absolutely positioned (top 10, right 12, 28×28) with no room reserved, so it sits on top of the .scat label ('Place', 'The party', 'Item' read as 'Pl✕'). Measured: scat x 1392–1422 / y 69–85, close x 1400–1428 / y 56–84. .shead .ic has no size rule in the pview sheet, so the icon renders 10×19 px, a coloured bar rather than a round badge. The existing rule '.pview .shead .sclose' (atlas.scss:159) never matches, because the button is a direct child of .sheet, not of .shead. '.pview .simg' (atlas.scss:160) is used by no element.
- **Why it matters:** Category label readable and a round category icon, as on pins.
- **Fix:** Add '&.pview .shead .ic{width:22px;height:22px;border-radius:50%;line-height:22px;text-align:center;color:#fff;flex:none}' and 'padding-right:40px' on .sinner .shead (or move .scat below the title). Delete the dead '.pview .shead .sclose' and '.pview .simg' rules.
- **Repro:** /p/<token> → click The Keep. Screenshots: /tmp/claude-1000/-home-bennett-repos/fad7b677-1261-40ae-b46f-e65ab93eee86/scratchpad/audit/lanes/player-desktop/shots/100-shead.png, 02-sheet-keep.png
- **Evidence:** header geometry {ic:[10,18.8], scat:[1392.75,1422,69.4,85.4], close:[1400,1428,56,84]}
- **Re-proved:** CSS: atlas.scss:415-417 makes .sclose absolute (top:10px, right:12px, 28x28) inside .sheet, and .sinner/.shead reserve no right padding for it. No .ic size rule applies to '.pview .shead .ic'. I grepped every .ic rule in client/src/styles: they are scoped to .pin, .chip, .nrow, .gresults, .lchip, .lsrow, .rhead and .rlink, not .shead. .sclose is a direct child of .sheet (PlayerView.jsx:303), not of .shead (306), so '.pview .shead .sclose' (atlas.scss:159) never matches. 'simg' appears nowhere e…
- **Also found as:** "In the phone bottom sheet the ✕ covers the category label, and the header icon …" (mobile); "Player View sheet header on desktop: the category icon is squashed and the 'Pla…" (a11y-polish)

### P075 · Marker form, era input and create-world inputs are 13–14px, so iOS zooms the page when they get focus

Product polish · low · effort xs · found by `mobile`

- **Where:** Player View › Mark the map form; era bar typed moment; Dashboard › Found a new world / Edit details
- **Files:** `client/src/styles/atlas.scss:197`, `client/src/styles/atlas.scss:516`, `client/src/styles/atlas.scss:490`, `client/src/styles/shell.scss:147-156`, `client/src/pages/PlayerView.jsx:378`, `client/src/pages/Dashboard.jsx:282`
- **What happens:** The marker title, note and signature inputs compute to 13px (`font:inherit` from .atlas 13px), and the title has autoFocus, so iOS Safari zooms as soon as the form opens. The era bar's typed-moment input (.tnowedit) is 13px. The Dashboard create and edit modal name/chronicle inputs are 14px (.sinput/.stext `font:inherit`), also with autoFocus. Login inputs are 16px (fine).
- **Why it matters:** Inputs at 16px or more on touch devices so focusing them doesn't zoom the page.
- **Fix:** Add `@media (pointer:coarse){ input, textarea, select { font-size:16px } }` in atlas.scss and shell.scss, or set 16px on .nsearch, .mnotearea, .tnowedit, .sinput and .stext.
- **Repro:** iPhone 13: /p/<token> › ✍ Mark the map › tap the map, then read getComputedStyle(input).fontSize ('13px'). Dashboard › Found a new world: '14px'. Lane scripts pv5.mjs and dash2.mjs.
- **Re-proved:** Code: `.nsearch` (atlas.scss:197), `.mnotearea` (516-517) and `.tnowedit` (490-491) all use font:inherit from `.atlas`'s 13px (atlas.scss:9). `.sinput`/`.stext` (shell.scss:147-156) use font:inherit from `.shell`'s 14px. index.html's viewport meta has no maximum-scale, and no global pointer:coarse or 16px input rule exists. The title input has autoFocus (PlayerView.jsx:378), and so do the Dashboard name inputs (Dashboard.jsx:282, 316). Measured on iPhone 13: all three marker-form inputs are 13p…

### P077 · Icon-only buttons rely on title=, which phones never show, and the whole client has one aria-label

Product polish · low · effort s · found by `copy`

- **Where:** Player View (phones) and workspace — every icon-only control
- **Files:** `client/src/components/AudioClip.jsx:36`, `client/src/pages/PlayerView.jsx:303`, `client/src/pages/PlayerView.jsx:346`, `client/src/pages/PlayerView.jsx:171`, `client/src/pages/AtlasWorkspace.jsx:1219`, `client/src/pages/AtlasWorkspace.jsx:1559`, `client/src/pages/AtlasWorkspace.jsx:1858`, `client/src/pages/ImageManager.jsx:487`, `client/src/pages/Dashboard.jsx:58`
- **What happens:** grep -rn "aria-label" client/src returns 1 hit (AudioClip.jsx:36). Icon-only buttons with no accessible name, or only a title, include: Player View ‘⌖’ (Go there, L346), ‘◎’ (Go inside, L246/263), sheet ‘✕’ (no title, L303), MarkerForm ‘✕’ (L377), the ‘offline?’ chip (explained only by its title, L171) and ‘✍’ (L231). In the workspace: ‘◂/☰’ rail, ‘▸/✎’ editor, ‘?’, ‘⤢/⤡’, ‘↩’, ‘⏳’, ‘⚙’, era ‘🎭’/‘✕’, visibility ‘👁’/‘🔒’, drawhud ‘✕’ (no title, L1219), all modal ‘✕’ (L1559,1583,1607,1638,1659,2098,2147, no title), MapPlane ‘＋ − ⊡’, the timebar footstep ticks and PartyTrail prints (no text at all), Dashboard ‘⋯’ and modal ‘✕’ (Dashboard.jsx:58), Archive folder ‘⋯’ (ImageManager.jsx:487, no title) and modal ‘✕’ (517). On a phone at the table, a player has no way to learn what ⌖ does.
- **Why it matters:** Every icon-only control has an aria-label, and the player-facing ones (⌖, ◎, ✕) carry a visible word or a first-run hint on touch.
- **Fix:** Add aria-label equal to the title on each listed button, and aria-label="Close" on all ✕. PlayerView.jsx:346 → render ‘⌖ Go’, and 246/263 → ‘◎ Inside’ on touch (matchMedia('(pointer: coarse)')), or at least aria-labels. Change the ‘offline?’ chip to ‘Offline — showing last update’.
- **Repro:** grep -rn "aria-label" client/src | wc -l → 1. grep -rnoE "<button[^>]*>[^<a-zA-Z0-9{]{1,3}</button>" client/src lists the single-line ones; the multi-line ones are cited above.
- **Evidence:** grep result above; the mobile Player View screenshot shots/pv-marker-fail.png shows the unlabeled controls.
- **Re-proved:** grep -rn 'aria-label' client/src returns exactly one hit, AudioClip.jsx:36. Other aria-* uses are aria-hidden or progressbar values only. The icon-only buttons check out. PlayerView.jsx: 303 sheet '✕' has no title; 377 MarkerForm '✕' has no title; 246/263 '◎' and 346 '⌖' have only a title. The 171 'offline?' chip is a span explained only by its title, and 231 '✍' is a span with a title. AtlasWorkspace.jsx: drawhud '✕' at 1219 and the modal '✕' buttons at 1559, 1583, 1607, 1638, 1659, 2098 and 2…

### P078 · Fixed chrome leaves phones little map: the lantern trail wraps to 128px, and in landscape the sheet leaves about 70px

Product polish · low · effort s · found by `mobile`

- **Where:** Player View on phones: .dmtrail, .erabar, bottom .sheet; atlas.scss:567, 399, 153
- **Files:** `client/src/styles/atlas.scss:567-574`, `client/src/styles/atlas.scss:399-400`, `client/src/styles/atlas.scss:153-155`
- **What happens:** The lantern (.dmtrail, `flex-wrap:wrap`, no truncation) wraps three long hop titles to 128px on iPhone 13, about 19% of the screen, and 5 lines on iPhone SE. With the 46px top bar and 66px era bar, the stage is 424 of 664px in portrait and 170 of 342px on a landscape iPhone. The 48vh bottom sheet then covers everything below y=178 in landscape, about 70px of map left, and on every phone it also hides the era bar, the zoom buttons and '✍ Mark the map' while open. The sheet has no drag or swipe to resize.
- **Why it matters:** The map stays the main thing on screen: one-line lantern, and a sheet sized for landscape.
- **Fix:** Make .dmtrail `flex-wrap:nowrap;overflow-x:auto` with ellipsised hops, or show only '🔦 … ▸ last hop' on narrow screens. Add `@media (max-height:500px)` so the sheet becomes a right-side panel (like the ≥900px rule at atlas.scss:426) and the era bar collapses.
- **Repro:** Lane pv2.mjs on 'iPhone 13' and 'iPhone 13 landscape' ('dmtrail' and 'sheetGeom' lines). Shots: lanes/mobile/shots/iPhone_13_landscape-03-keep-sheet.png, iPhone_SE-40-root.png.
- **Re-proved:** atlas.scss:567 has .dmtrail with flex-wrap:wrap and no truncation. atlas.scss:399-400 sets .erabar height to 66px. atlas.scss:153-155 makes .sheet position:fixed with max-height:48vh. PlayerView.jsx:303 gives the sheet no resize or drag handlers, and grep finds no grip, touch or swipe code there. Measured on world 66 (read-only). iPhone 13 portrait (390x664): .dmtrail is 125px tall and the stage is 427px. iPhone 13 landscape (750x342): .dmtrail is 60px, the stage 170px (y 106-276) and the Keep …

