# WP-04 · Nothing reaches players by accident

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** The canon moment, the timeline switch and new content should change what players see only when the DM means it to. Fix the timeline panel so Save keeps canon, Enable keeps the clock, and a blank box is not read as 0.

**Notes:** time-01 and time-03 are one-line fixes in AtlasWorkspace.jsx:591-607. saveTimeline must not send the DM's lens as timeline_current_time, and enableTimeline must only flip timeline_enabled. time-02 needs a confirm that says players will see every moment. time-04: a blank box means 'no change'. inspector-04: skip empty facts when resolving descriptions, in share.js:307-315 and in the reader. journey-07 changes a default (new nodes DM-only, or present from canon onward), so ask Bennett before shipping it. Afterwards, keep a Player View tab open and confirm canon does not move on Save, Disable or Enable.

## Checklist

- [ ] **B013** · high · s · A blank time field is read as 0: clearing an era bound silently widens a player-visible era over hidden history
- [ ] **B014** · high · xs · Saving the timeline panel silently moves the canon moment (what players see) to the DM's local lens
- [ ] **B015** · high · xs · Re-enabling the clock ('🕓 Timeline') overwrites the saved range, unit and canon with 0–100 days, canon 0
- [ ] **B043** · medium · xs · '＋ Story for a period' creates an empty period that blanks the node's description for players at once
- [ ] **B059** · medium · xs · '＋ Next session' leaves the open panel showing the old range; pressing Save then shrinks the clock and strands the new session
- [ ] **C009** · medium · s · New places are born public and present at all times, so session prep appears on players' phones immediately
- [ ] **C023** · medium · s · The timeline panel mixes three save models, has no title, and 'Close' silently throws away range edits
- [ ] **P026** · medium · s · 'Disable timeline' instantly shows players every out-of-time thing (future and ended), with no confirmation
- [ ] **C081** · low · xs · On a map with a focus period, a lens outside the window pins the thumb to the edge, and the first nudge jumps the lens
- [ ] **C085** · low · s · Eras can sit outside the clock: the DM timebar hides them and the lens can't reach them, but players can scrub there

## Items

### B013 · A blank time field is read as 0: clearing an era bound silently widens a player-visible era over hidden history

Broken · high · effort s · found by `time` (+1 other lane)

- **Where:** Timebar › ⚙ › era From/To boxes; also timeline From/To, click-to-type moment, the player era bar's typed moment
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1778`, `client/src/pages/AtlasWorkspace.jsx:1795-1799`, `client/src/pages/AtlasWorkspace.jsx:1781-1787`, `client/src/pages/AtlasWorkspace.jsx:817-824`, `client/src/components/EraScrub.jsx:78-87`
- **What happens:** `Number('') === 0` passes every isFinite guard. (1) World 60: cleared player-visible 'Session 4' From and tabbed away. GET era 166 → [0-49] pv, so it now covers the DM-hidden 'Behind the Screen' (1–20) and players could scrub footsteps 1–37. The row jumped to the top of the list with its From box still empty, and the timebar label turned into 'Session 4 · footstep 38'. (2) Timeline From cleared + Save → min 0 (world 61). (3) Click-to-type: an empty field + Enter or blur, or 'abc', sends the lens to the clock start ('Behind the Screen · footstep 10'). (4) 🎭 era bar typed ''/'abc' → 'Before the Flood · footstep 1'.
- **Why it matters:** An empty or invalid entry means no change: the box reverts, and nothing is saved or moved.
- **Fix:** Make num() return null for '' (`v === '' ? null : …`) and revert the defaultValue input. In commitYear and the EraScrub Enter/blur handlers, bail when the trimmed string is empty. Disable Save in TimelineConfig when From or To is blank.
- **Repro:** ⚙ → select an era's From number → delete it → Tab. GET /api/atlas/worlds/<id>: that era's start is 0.
- **Evidence:** s7.mjs: '-- db a. cleared From of Session 4 … "166:Session 4[0-49]pv"'; s3.mjs: 'typed [] … Enter -> Behind the Screen · footstep 10'; s23.mjs: 'typed [] -> Before the Flood · footstep 1'
- **Re-proved:** All four paths check out in code. (1) TimelineConfig num() at :1778 is `Number.isFinite(Number(v)) ? Number(v) : null`, so '' becomes 0. The era From/To onBlur (:1796, :1799) then sends start_time 0 or end_time 0. PATCH /eras/:id (atlas.js:710-717) writes the value with no validation. Eras are re-fetched ORDER BY start_time (atlas.js:88-89), so the row moves to the top. The uncontrolled defaultValue box stays blank. momentLabel picks the first containing era, so the label becomes 'Session 4 · f…
- **Also found as:** "Clearing an era's From/To box saves 0 instead of leaving the value alone" (api-contract)

### B014 · Saving the timeline panel silently moves the canon moment (what players see) to the DM's local lens

Broken · high · effort xs · found by `time`

- **Where:** Timebar › ⚙ (Timeline range, unit & eras) › Save; client/src/pages/AtlasWorkspace.jsx:599-607
- **Files:** `client/src/pages/AtlasWorkspace.jsx:599-607`, `server/routes/atlas.js:133-156`
- **What happens:** World 61: canon 12 (GET /api/atlas/worlds/61 → current 12). Typed 18 into the lens to preview the future, opened ⚙, pressed Save without changing anything. GET → current 18. The chip flipped to CANON, no toast. Players now see day 18, which is the future. The same thing happened by accident in an earlier run: lens 13, Save range, canon became 13. saveTimeline computes `cur = clamp(now, min, max)` and sends it as timeline_current_time.
- **Why it matters:** CLAUDE.md: the scrubber is a local lens that is never saved, and canon moves only through the explicit 'Set canon' button. Saving the range or unit must leave canon alone.
- **Fix:** In saveTimeline, stop sending timeline_current_time, because the server already clamps canon into a new range (atlas.js:136-143). Clamp `now` locally only. If the client needs to mirror the clamp, use tl.current, not now.
- **Repro:** Open /w/61/m/200 in Edit. Click the moment label, type 18, press Enter. ⚙ → Save. GET /api/atlas/worlds/61: timeline.current is now 18.
- **Evidence:** s9.mjs output: 'canon before {current:12}' → lens 18 → Save → 'canon after {current:18}'; s8.mjs 'restored' showed current 13 after an ArrowRight + Save
- **Re-proved:** client/src/pages/AtlasWorkspace.jsx:599-607. saveTimeline does `const cur = Math.min(Math.max(now, min), max)` (now is the DM's lens), then setWorld(current: cur), setNow(cur), and PATCHes `timeline_current_time: cur`. It shows no flash. It is wired as TimelineConfig onSave (line 1325). Whenever lens ≠ canon, Save writes the lens as canon. The live bundle /assets/index-CMhfuHKj.js has the same code: `Ua=(t,a,d)=>{...const A=Math.min(Math.max(ee,t),a);...patchWorld(s,{timeline_min_time:t,timelin…

### B015 · Re-enabling the clock ('🕓 Timeline') overwrites the saved range, unit and canon with 0–100 days, canon 0

Broken · high · effort xs · found by `time` (+3 other lanes)

- **Where:** Toolbar › 🕓 Timeline (shown after disabling); client/src/pages/AtlasWorkspace.jsx:591-598
- **Files:** `client/src/pages/AtlasWorkspace.jsx:591-598`
- **What happens:** World 61 had 1–20 days, canon 12. Disable timeline, then '🕓 Timeline' (tooltip 'Give the world a clock…'). GET /api/atlas/worlds/61 → {enabled:true,min:0,max:100,current:0,unit:'days'}. Players' canon jumped to 0, and the old range and unit are gone. A footstep world would be switched to 'days'. The share world endpoint now reports current 0.
- **Why it matters:** Turning the clock back on should restore the world's own clock. The DB still held min/max/current/unit while it was disabled.
- **Fix:** In enableTimeline, if world.timeline has min<max (the values survive while disabled), PATCH only {timeline_enabled:true} and keep them. Use the 0–100 days defaults only when no range was ever set.
- **Repro:** On a world with a custom clock: ⚙ → Disable timeline → toolbar '🕓 Timeline' → GET the world.
- **Evidence:** s12.mjs: '-- db clock off {enabled:false,min:1,max:20,current:12}' → '-- db re-enabled {enabled:true,min:0,max:100,current:0,unit:days}'; shots/s12-reenabled.png
- **Re-proved:** AtlasWorkspace.jsx:591-598: enableTimeline hardcodes local state {enabled:true,min:0,max:100,current:0,unit:'days'}, calls setNow(0), and PATCHes timeline_enabled:true, min 0, max 100, current 0, unit 'days'. It ignores world.timeline, even though disableTimeline (:609-613) only flips timeline_enabled and the GET world route (atlas.js:95-96) still returns the stored min, max, current and unit. The '🕓 Timeline' button (:1176-1178, title 'Give the world a clock…') shows only when !tl?.enabled. T…
- **Also found as:** "Re-enabling the timeline from the toolbar wipes the saved range, unit and canon…" (canvas); "Disable timeline and then '🕓 Timeline' wipes the world clock: range, unit and …" (resilience); "Disable timeline has no confirm and reveals every moment to players; re-enablin…" (journey)

### B043 · '＋ Story for a period' creates an empty period that blanks the node's description for players at once

Broken · medium · effort xs · found by `inspector`

- **Where:** Inspector › The story by period › ＋ Story for a period (from N) (client/src/pages/AtlasWorkspace.jsx:387-389, 1947; server/routes/share.js:307-315)
- **Files:** `client/src/pages/AtlasWorkspace.jsx:387`, `client/src/pages/AtlasWorkspace.jsx:864`, `server/routes/share.js:307`
- **What happens:** factAdd POSTs body '' from the lens moment onward. Both resolvers treat '' as a real override: share.js does `if (fact) n.body = fact.body`, and the client resolveFact returns '' with `?? sel.node.body`. Live: before, the player API returned 'Double-click my ◎ to step inside…' for The Keep. After one click on the button, GET /api/share/<token>/nodes/317 returned body "" and the DM's View reader showed no description.
- **Why it matters:** Adding a period does not wipe what players read until the DM writes the period text.
- **Fix:** Prefill the new fact with the currently resolved text (resolveFact(facts, now) ?? node.body) in factAdd, and ignore blank facts when resolving: `AND body <> ''` in share.js:310 and `.filter(f => f.body?.trim())` in resolveFact (AtlasWorkspace.jsx:864).
- **Repro:** World 36: select The Keep, click '＋ Story for a period (from 12)', then GET /api/share/<token>/nodes/317 (lanes/inspector/s5.mjs F1).
- **Evidence:** s5: 'F0 player body before: "Double-click my ◎ …"' / 'F1 player body after adding an empty period: ""'; shots/07-empty-fact.png, shots/08-view-reader-empty-fact.png
- **Re-proved:** Code: factAdd (AtlasWorkspace.jsx:387-389) POSTs body '' with start_time=round(now). The server stores it as is (atlas.js:428-435). share.js:307-315 does `if (fact) n.body = fact.body` with no blank check. Client resolveFact (864-869) returns '' and `'' ?? sel.node.body` stays '' (1384), so the View reader renders no description. Live (apichecks.mjs), POSTing the same payload the button sends (body '', start_time = canon 12): before, the player body was 'Double-click my ◎ to step inside. Every …

### B059 · '＋ Next session' leaves the open panel showing the old range; pressing Save then shrinks the clock and strands the new session

Broken · medium · effort xs · found by `time` (+1 other lane)

- **Where:** Timebar › ⚙ › ＋ Next session, then Save; client/src/pages/AtlasWorkspace.jsx:1773-1776
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1773-1776`, `client/src/pages/AtlasWorkspace.jsx:578-590`
- **What happens:** TimelineConfig copies tl.min/max/unit into useState once and never re-syncs. World 60: panel open → Next session → DB max 49, the timebar reads 10…49, but the panel's To box still says 39 (shots/s6-after-next.png). Edited the unit and pressed Save → DB max back to 39. 'Session 4' [40–49] now lies past the end of the clock, where the scrubber and Set canon cannot reach it. Same stale To box in the days world (20 after max grew to 30).
- **Why it matters:** The panel shows the clock as it is now, and Save never undoes the growth Next session just made.
- **Fix:** Resync the panel when tl changes: key <TimelineConfig> on `${tl.min}:${tl.max}:${tl.unit}` or add a useEffect. Better still, have onSave send only the fields the DM changed.
- **Repro:** ⚙ → ＋ Next session → change Unit (or nothing) → Save → GET the world: timeline.max is back to the old value.
- **Evidence:** s6.mjs: '-- cfg after next session {labels:["10","39",…]}' with '-- db … max:49' → after Save '-- db … max:39' and era 166 Session 4[40-49]
- **Re-proved:** Code: TimelineConfig (client/src/pages/AtlasWorkspace.jsx:1773-1776) seeds min/max/unit with useState(tl.*) once. It is rendered unkeyed at :1324-1326 and stays open after nextSession (:578-590), which patches timeline_max_time and refreshes the world. saveTimeline (:599-608) then sends the stale max. Reproduced on my own clone of world 30 (id 110, now deleted): the cfg inputs read ['10','39','footsteps'] before; after ＋ Next session the DB had max 49 plus 'Session 4[40-49]', but the inputs sti…
- **Also found as:** "Timeline panel keeps a stale 'To' after ＋ Next session; its Save shrinks the cl…" (journey)

### C009 · New places are born public and present at all times, so session prep appears on players' phones immediately

Confusing · medium · effort s · found by `journey`

- **Where:** Atlas › Edit › ＋ Add node / right-click ＋ New node here / ◌ Outline; server/routes/atlas.js:379-393, server/config/schema.sql:122
- **Files:** `server/routes/atlas.js:379`, `server/config/schema.sql:122`, `client/src/pages/AtlasWorkspace.jsx:305`
- **What happens:** Every node I added while prepping ('New node' → The Salt Market, Harbor Chapel) was saved with visibility 'shared' and no lifespan. With the share link live, players saw them on their next poll without the DM ever revealing anything; a player would first see 'New node' until it was renamed. Nothing in the UI says a new place is already public. Forge-born nodes are DM-only by design, so manual and AI-made content behave the opposite way.
- **Why it matters:** A DM preparing the next session can drop places without leaking them. The default is hidden (or 'from the next footstep'), or at least a clear notice says players can see it now.
- **Fix:** When worlds.share_token is set, create manual nodes with visibility 'dm' (atlas.js:379 INSERT). Or keep the default but flash 'Players can see this — 🔒 to hide' with a one-click hide. Either way, say it in the ＋ Add node tooltip.
- **Repro:** World 35 with a live link: ＋ Add node › click map › GET /api/share/<token>/maps/103 → 'New node' is listed. The player phone view (lanes/journey/p1.mjs) listed The Salt Market and Harbor Chapel, which were never revealed.
- **Evidence:** s8 server placements: ["The Salt Market","place","shared","shared",true,null,null…], ["Harbor Chapel","place","shared","shared"…]; p1 pins: '… The Salt Market || Harbor Chapel'
- **Re-proved:** Code: server/routes/atlas.js:379-393. The INSERT at line 387 sets no visibility, so it takes the schema default 'shared' (schema.sql:122 for nodes, :138 for placements). The placement INSERT sets no start/end, so the node is always present. Client dropNode (AtlasWorkspace.jsx:305-309) sends only {x,y[,shape,shape_kind]} and shows no flash. The ＋ Add node button (1122), right-click '＋ New node here' (1595) and the Outline finish (347) all go through dropNode. The ＋ Add node tooltip is just 'Crea…

### C023 · The timeline panel mixes three save models, has no title, and 'Close' silently throws away range edits

Confusing · medium · effort s · found by `time`

- **Where:** Timebar › ⚙; client/src/pages/AtlasWorkspace.jsx:1773-1812
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1773-1812`, `client/src/pages/AtlasWorkspace.jsx:1321`
- **What happens:** From/To/Unit need Save, and Close discards them (edited To 30 → Close → DB still 20, no hint). Era name and bounds save on blur, while 🎭, ✕ and ＋ save instantly. The panel has no heading; 'Timeline range, unit & eras' exists only as the ⚙ tooltip. The ⚙ also shows in 👁 View ('reads with DM eyes'), where it can disable the clock and delete eras.
- **Why it matters:** One save model per panel (docs/UX-REDESIGN.md: 'Everything commits the same way'), a visible title, and reading posture free of destructive settings.
- **Fix:** Autosave From/To/Unit on blur with validation (like eras), or show an 'unsaved' state on Close. Add a panel heading. Render the ⚙ only in Edit.
- **Repro:** ⚙ → change To → Close → reopen: the change is gone.
- **Evidence:** s8.mjs: '-- db after edit 1-30 then Close {min:1,max:20}'
- **Re-proved:** Code: TimelineConfig (:1773-1812) holds From/To/Unit in local useState and writes them only on Save. Close is onClose → setTlEdit(false), which unmounts the panel and drops the edits. Era name/start/end are defaultValue inputs saved onBlur, while 🎭, ✕, ＋ Next session and ＋ Add an era call the API on click. Reproduced on clone 114 (deleted). The panel's first lines were From/To/Unit/Save, and its only heading is 'Eras'. I set To from 39 to 45 and pressed Close: the GET-back showed max 39, reope…

### P026 · 'Disable timeline' instantly shows players every out-of-time thing (future and ended), with no confirmation

Product polish · medium · effort s · found by `time` (+1 other lane)

- **Where:** Timebar › ⚙ › Disable timeline; client/src/pages/AtlasWorkspace.jsx:609-613, 1810
- **Files:** `client/src/pages/AtlasWorkspace.jsx:609-613`, `client/src/pages/AtlasWorkspace.jsx:1810`, `server/routes/share.js:29-30`, `server/routes/share.js:40-42`
- **What happens:** World 61: canon day 12, a shared node '[audit] Future ambush' with lifespan 18→. Share map with the clock on: [The Keep, The Flood, Your first node]. One click on 'Disable timeline' gave no dialog, no toast and no undo. The share map immediately returned [The Keep, The Flood, Your first node, Old Gate, [audit] Future ambush]: a future event plus a place that ended on day 8. share.js drops all lifespan filtering when timeline_enabled is false (allowedTime returns null, so PRESENT collapses).
- **Why it matters:** The share link keeps 'the future' secret (CLAUDE.md: out-of-time placements never leave the DB). A control that reveals every future placement to the table should at least warn and confirm.
- **Fix:** Put a confirm modal on Disable that names the consequence ('N things have lifespans; players will see all of them, including the future'). Better: when the clock is off, keep share.js filtering at the stored canon for placements that have lifespans, or grey out Disable while timed placements exist.
- **Repro:** Add a shared node with lifespan starting after canon. In the workspace: ⚙ → Disable timeline. GET /api/share/<token>/maps/<root> as anonymous: the future node is listed.
- **Evidence:** s12.mjs output: '-- share clock on [The Keep,The Flood,Your first node]' vs '-- share clock off [...,"Old Gate","[audit] Future ambush"]', dialogs []
- **Re-proved:** AtlasWorkspace.jsx:609-613: disableTimeline sets enabled:false locally and PATCHes {timeline_enabled:false}. It has no confirm, no flash and no undo. The button at :1810 calls onDisable={disableTimeline} directly (:1325). In server/routes/share.js:29-30, allowedTime returns null when !timeline_enabled, and PRESENT(n) at :40-43 collapses to true for a null moment (`$n::int IS NULL OR ...`). So the share map, locate and node endpoints drop all lifespan filtering, and future and ended placements a…
- **Also found as:** "'Disable timeline' instantly shows players every future and past-only placement…" (postures-share)

### C081 · On a map with a focus period, a lens outside the window pins the thumb to the edge, and the first nudge jumps the lens

Confusing · low · effort xs · found by `time`

- **Where:** The slider clamp is at client/src/pages/AtlasWorkspace.jsx:1280-1282 (<input type="range"> value={Math.min(Math.max(now, dispMin), dispMax)}); lines 1283-1287 are the placement ticks. :800-805 (fMin/fMax/dispMin/dispMax) and :823 (commitYear widening) are correct.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:800-805`, `client/src/pages/AtlasWorkspace.jsx:1284-1286`, `client/src/pages/AtlasWorkspace.jsx:823`
- **What happens:** World 60 root with focus 20–29, lens 37: the slider thumb sits at 29 (v=29) while the label says 'Session 3 · footstep 8' and the chip says CANON. ArrowLeft once → lens 28. commitYear already widens the window when a typed moment falls outside it (:823), but arriving on the map or moving the lens elsewhere doesn't.
- **Why it matters:** The thumb shows where the lens is, or the bar says the lens is outside this place's period.
- **Fix:** When now is outside [fMin,fMax], auto-set focusExpand (same rule as commitYear) or render an 'outside this period ⤢' hint.
- **Repro:** Map ▾ → Focus period 20–29 → Save while the lens is 37 → press ← on the slider.
- **Evidence:** s13.mjs: '== focus 20-29, lens 37 {now:"Session 3 · footstep 8",tl:"20 … 29",slider:"20-29 v=29"}' → ArrowLeft 'Session 2 · footstep 9'
- **Re-proved:** Behaviour confirmed on my clone 114 (deleted). Lens and canon were 37. I set the focus period to 20–29 through Map ▾ → Focus period… → Save (the DB then held focusStart 20 / focusEnd 29). The slider read '20-29 v=29' while the label still said 'Session 3 · footstep 8' and the chip said CANON. One ArrowLeft on the slider gave v=28, label 'Session 2 · footstep 9', and the chip changed to '📍 Set canon ↩'. Code: the slider value is clamped with Math.min(Math.max(now, dispMin), dispMax). setFocusEx… _(partly — the corrected location is used above)_

### C085 · Eras can sit outside the clock: the DM timebar hides them and the lens can't reach them, but players can scrub there

Confusing · low · effort s · found by `time`

- **Where:** Timebar era bands / ⚙ era list vs Player View era bar; client/src/pages/AtlasWorkspace.jsx:1271-1283, 821; server/routes/share.js:29-38
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1271-1283`, `client/src/pages/AtlasWorkspace.jsx:821`, `server/routes/share.js:29-38`
- **What happens:** World 60 (from the E2E proving ground): clock 10–39, era 'Before the Flood' 1–8 is 🎭 player-visible. The DM timebar draws no such band, and typing 5 in the lens clamps to 10. The Player View era bar offers 'Before the Flood', and allowedTime accepts footsteps 1–8 because it never checks the clock range. The ⚙ panel lists the era with no hint that it lies outside the clock.
- **Why it matters:** What players can reach, the DM can see and preview on the same clock, or the panel warns.
- **Fix:** In TimelineConfig, flag eras outside [min,max] (e.g. 'outside the clock — players can still scrub it') and offer to grow the clock. Alternatively clamp allowedTime and the share eras to the clock range.
- **Repro:** /w/60/m/197 timebar vs /p/<token> era bar.
- **Evidence:** s1 bands list ['Behind the Screen','Session 1 — Landfall(pv)',…] (no 'Before the Flood'); s15 Player View erabar 'Before the Flood | Session 1 — Landfall | …'
- **Re-proved:** The clone of world 30 has clock 10–39 and era 'Before the Flood' 1–8 with player_visible=true. AtlasWorkspace.jsx:1270-1272 clamps bands to [dispMin,dispMax] and filters s<e, so the band is dropped. Measured DM bands: ['Behind the Screen','Session 1 — Landfall','Session 2 — The Stakeout','Session 3 — The Lantern Room']. commitYear (:817-823, clamp at :821) turned a typed 5 into 10 (label read 'Behind the Screen · footstep 10'). share.js allowedTime (:29-38) and GET /:token/world (:108-115) neve…

