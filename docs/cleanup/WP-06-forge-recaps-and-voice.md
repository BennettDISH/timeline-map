# WP-06 · Forge recaps and voice

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Make Forge recaps apply again, and stop the Forge from losing the DM's message, memory and settings. Stop voice lines from being lost or left behind in R2.

**Notes:** forge-voice-01 is a mis-nested loop in applyBatch in contract.js: the facts and place loops sit inside the enrich_maps loop and reference `en`. Move them back into the enrich loop. Once that is fixed, Forge placements land as visibility 'dm', so api-contract-09 (WP-10) will show up more often. forge-voice-03, 04, 10 and 19 all come from the ⚙ mind state being loaded once and saved whole: refetch before saving, or send only the changed fields. forge-voice-14 needs a confirm, plus a check that the node was not edited after the batch. Test a real recap end to end after the fix.

## Checklist

- [ ] **B001** · high · s · Saving the ⚙ mind settings overwrites memory the mind wrote since the panel opened (recap summaries lost)
- [ ] **B002** · high · s · Unmake deletes a whole creation in one click with no confirm, and restores snapshots that wipe the DM's later edits
- [ ] **B003** · high · xs · Forge contract: enrich facts/placements never land, and any batch with map notes (every recap) crashes with 'en is not defined'
- [ ] **B020** · medium · s · A failed Forge send throws the DM's message away: box cleared, bubble shown as sent, gone on reopen
- [ ] **B021** · medium · s · When the Forge state fails to load, the panel shows the empty-conversation intro and blank settings, and Save would wipe the bible and memory
- [ ] **B041** · medium · s · Forge 'move' asks move an outlined place's name but leave its outline behind, even when carrying it to another map
- [ ] **B045** · medium · xs · Changing a voice style then clicking Say sends the line before the new style is saved
- [ ] **C004** · medium · xs · The mind reads only part of the bible and memory that the ⚙ partition says it reads every turn
- [ ] **C005** · medium · s · Allow asks the DM to approve a rewrite without showing the new text ('Rewrite the title of "Supply Chest"')
- [ ] **C006** · medium · xs · Keep on a card with a pending request silently refuses the request
- [ ] **C007** · medium · s · Conversation history keeps the mind's success claims after a failed or unmade creation, and the failure exists only as a 4-second flash
- [ ] **P007** · medium · s · Unsaved ⚙ edits (including a loaded .md bible) vanish when the Forge closes, with no unsaved marker
- [ ] **P009** · medium · xs · Forge messages over 12,000 characters are cut silently: the composer has no limit or counter
- [ ] **P016** · medium · s · Remove the line (✕) drops a paid voice line with one click and leaves the audio public in R2; the line box stays editable while a line exists
- [ ] **B063** · low · xs · Saving the mind during a running chat clears the 'Working…' state and allows a second concurrent message
- [ ] **C073** · low · xs · VOICE_TTS_MODEL names a model for two different providers
- [ ] **O016** · low · xs · The Forge rulebook assumes years and six categories, but the world clock counts footsteps and the digest includes 'party' nodes
- [ ] **P038** · low · xs · Batch card copy: raw keys, plural errors, placeholder summary 'A generation', and a DM-only note on cards with nothing new
- [ ] **P039** · low · xs · Clicking Keep shows the spinner on Unmake (and Refuse shows it on Allow)
- [ ] **P046** · low · xs · Internal names shown in the DM UI: raw Forge count keys ('1 nodes', '2 placements', '3 facts'), the voice provider id, and 'Nano Banana'
- [ ] **P053** · low · xs · Disabled buttons look enabled across the Forge and voice (Send, Keep/Unmake, Allow/Refuse, Say it)
- [ ] **P082** · low · s · Clearing a voice line or ambience (or deleting its node) leaves the audio file in R2

## Items

### B001 · Saving the ⚙ mind settings overwrites memory the mind wrote since the panel opened (recap summaries lost)

Broken · high · effort s · found by `forge-voice`

- **Where:** ✦ Forge › ⚙ › Save the mind; client/src/pages/AtlasWorkspace.jsx:2182-2200
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2182`, `client/src/pages/AtlasWorkspace.jsx:2194`, `server/routes/forge.js:102`
- **What happens:** ForgePanel loads the mind (lore, art style, bible, size) once per worldId, and no chat turn refreshes it. saveMind PATCHes all four fields from that stale copy. Live test: the panel was opened, then chat 4 (a recap) made the mind append 'Session (2026-09-26): The party met Marra Vell by her lamp…' to lore on the server. The ⚙ Memory box still showed the old lore. Changing only the art style and clicking Save the mind flashed 'The mind took it in', and a GET back showed the new session line was gone.
- **Why it matters:** Settings saves never destroy memory the mind has written. The memory box shows the current lore.
- **Fix:** In ForgePanel, re-fetch getWorld after every chat reply (or at least when opening ⚙) and track which fields the DM actually edited. saveMind should PATCH only those fields. Optionally the server could reject a lore PATCH whose base doesn't match (send an updated_at check).
- **Repro:** Open ✦ Forge, send any recap that appends lore, open ⚙, change the art style, then Save the mind and GET /api/forge/worlds/116 → lore (script lanes/forge-voice/p9.mjs).
- **Evidence:** p9.mjs: 'lore on server after chat' ends with '…Session (2026-09-26): The party met Marra Vell…'; 'lore on server after Save' no longer contains that line.
- **Re-proved:** client/src/pages/AtlasWorkspace.jsx: the only setMind that reads server data is at 2188, inside the useEffect keyed on [worldId] (2182-2192). send() (2225-2250) never refreshes mind. Its only getWorld call, on askCount, only runs setBatches. saveMind (2194-2200) PATCHes art_style, lore, bible and gen_size all together from the local state. On the server, mind.js:199-208 appends lore_append (and sets art_style when it is empty) during chat. The PATCH route (server/routes/forge.js:102-105) overwr…

### B002 · Unmake deletes a whole creation in one click with no confirm, and restores snapshots that wipe the DM's later edits

Broken · high · effort s · found by `forge-voice`

- **Where:** ✦ Forge › batch card › Unmake; server/forge/contract.js:538-575
- **Files:** `server/forge/contract.js:541`, `server/forge/contract.js:550`, `server/forge/contract.js:561`, `client/src/pages/AtlasWorkspace.jsx:2295`
- **What happens:** Unmake has no confirm and no undo: clicking it on batch 23 fired no dialog, immediately flashed 'Unmade — everything that creation added is gone', and its R2 images are deleted. discardBatch also restores blindly. enrichedBodies are set to NULL, and noteAppends, stanceChanges and mapNoteAppends are overwritten with the text captured when the batch landed. An allowed edit ask restores the old title, body, category and dm_note. Any edit the DM made to those fields while the card was pending is erased. Nodes the batch created are deleted along with any links or notes the DM added to them.
- **Why it matters:** Confirm before deleting N things, and revert a field only if it still holds exactly what the batch wrote.
- **Fix:** Client: confirm with counts ('Unmake 3 nodes, 1 painting…?'). Server (contract.js:541-555): use compare-and-set updates, e.g. `UPDATE nodes SET body=NULL WHERE id=$1 AND body=$2`, where the batch records what it wrote (store `wrote` next to `prev` in created.*), and skip fields the DM has changed since.
- **Repro:** Code read of discardBatch, plus the live Unmake of batch 23 with dialog=null (p6.mjs). Scenario: the mind appends to Brakk's DM notes, the DM adds a line, then clicks Unmake. The DM's line is gone.
- **Evidence:** p6.mjs: "after Unmake flash=Unmade — everything that creation added is gone dialog=null"
- **Re-proved:** In AtlasWorkspace.jsx:2262-2272 batchAct calls discardBatch straight away, with no confirm and no undo path, then flashes 'Unmade — everything that creation added is gone'. contract.js discardBatch (522-587) does the following. It deletes created rows, and nodes cascade their placements, links and facts (schema.sql:132,147-148,206 ON DELETE CASCADE). Line 543 sets body to NULL and 545 sets dm_note to NULL for enrichedBodies/enrichedNotes. Lines 550-555 overwrite dm_note, stance and map dm_note …

### B003 · Forge contract: enrich facts/placements never land, and any batch with map notes (every recap) crashes with 'en is not defined'

Broken · high · effort xs · found by `forge-voice` (+1 other lane)

- **Where:** ✦ Forge › chat › recap / 'give X a fact' / 'place X on map Y'; server/forge/contract.js:340-397
- **Files:** `server/forge/contract.js:340`, `server/forge/contract.js:378`, `server/forge/contract.js:384`, `server/forge/contract.js:390`
- **What happens:** In applyBatch the `for (const em of batch.enrich_maps)` loop (contract.js:378) was inserted in the middle of the enrich loop in commit 2c42802, so the `for (const f of en.facts)` and `for (const p of en.place)` blocks (384-396) now sit inside the enrich_maps loop where `en` is out of scope. Result 1: any batch that carries enrich_maps (a recap that writes map notes) throws ReferenceError, rolls back, and the DM gets the flash 'The mind spoke, but the creation failed: en is not defined'. Live chat 1 (a recap asking for a map-note line and a Brakk note line): response {batch:null, applyError:'en is not defined'}; map 375 dmNote stayed null and Brakk's dmNote stayed null. Result 2: enrich.facts and enrich.place are silently dropped whenever there are no enrich_maps. Live chat 2 ('give The Great Hall a timed fact for days 9-20 and place it on map 374'): batch 23 landed with counts {} and the mind said 'I've added the flooded floor fact… and placed it out on the root map'. GET /api/atlas/nodes/1222 returned facts [], and map 374 has no Great Hall placement. An offline probe that loads contract.js with a stub pool reproduces both results: 'apply1 counts {} | facts/placement inserts seen: 0' and 'apply2 THREW: ReferenceError en is not defined'.
- **Why it matters:** CLAUDE.md calls the recap 'the most important act' the mind performs. enrich_maps should append map notes, and enrich facts/place should insert node_facts and placements (unmake already knows how to remove them).
- **Fix:** In server/forge/contract.js, move the two blocks `for (const f of en.facts) {…}` and `for (const p of en.place) {…}` (currently lines 384-396) back inside `for (const en of batch.enrich)` before its closing brace at line 377. Leave the enrich_maps loop with only the map-note append. Keep contract-probe.cjs (or an equivalent unit test) as a regression check.
- **Repro:** World 116, map 375, select Warden Brakk, then in ✦ Forge send 'Recap: … add a line to THIS MAP's DM notes and to Brakk's notes'. Or run scratchpad/audit/lanes/forge-voice/contract-probe.cjs, which needs no network.
- **Evidence:** Live chat 1 response: {"say":"I've logged the standoff. Brakk's notes now reflect…","batch":null,"applyError":"en is not defined"}. Screenshot lanes/forge-voice/shots/c1-full.png and mocked flash 13-apply-error.png. Offline probe output as quoted. git log -L378,397 shows the loop header was added in 2c42802.
- **Re-proved:** Read server/forge/contract.js:340-397. `for (const en of batch.enrich)` closes at line 377. `for (const em of batch.enrich_maps)` starts at 378, and the `for (const f of en.facts)` block (384) and the `for (const p of en.place)` block (390) sit inside the enrich_maps loop, where `en` is out of scope. validateBatch (lines 92-106) still normalizes en.facts and en.place, so they pass validation and are then never inserted. `git log -S` shows the enrich_maps loop header came in with 2c42802. I wrot…
- **Also found as:** "Forge recaps fail: any enrich_maps entry throws 'en is not defined', and enrich…" (server-dead)

### B020 · A failed Forge send throws the DM's message away: box cleared, bubble shown as sent, gone on reopen

Broken · medium · effort s · found by `forge-voice` (+1 other lane)

- **Where:** ✦ Forge › composer › Send when the request fails; AtlasWorkspace.jsx:2224-2248, server/forge/mind.js:191
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2228`, `client/src/pages/AtlasWorkspace.jsx:2247`, `server/forge/mind.js:191`
- **What happens:** send() calls setText('') and appends the user bubble before the request and never restores anything on failure. The server stores the user message only after the model call succeeds (mind.js:191), so a timeout, safety block or malformed-JSON 500 stores nothing. Test with the request aborted: the composer was emptied, the bubble stayed in the log looking delivered, and the only feedback was a 4-second flash 'Network Error' (the raw axios text). After closing and reopening the panel, the bubble was gone and the empty-state intro returned. With a mocked 500 the flash read 'The mind returned malformed JSON' and the text was likewise lost. For a long session recap this is lost work.
- **Why it matters:** On failure the text returns to the composer (or the bubble is marked failed with Retry), and the wording says nothing was sent.
- **Fix:** In send(), keep the message and on .catch put it back with setText(message) and mark the optimistic bubble {failed:true} with a Retry action. Map axios network errors to readable text. Server: insert the user row into mind_messages before calling generateJSON so the history keeps what the DM said.
- **Repro:** page.route('**/api/forge/worlds/116/chat', abort), type a recap and press Enter, then close and reopen the Forge (lanes/forge-voice/p3.mjs part A/B).
- **Evidence:** p3.mjs: 'A abort: textarea now="" bubbles=[…the message…] flash=Network Error'; 'A after reopen bubbles=[] intro=1'. Screenshots shots/10-chat-abort.png, 11-chat-500.png.
- **Re-proved:** AtlasWorkspace.jsx:2225-2250: send() calls setText('') at 2228 and appends the optimistic user bubble before the request. The .catch at 2247 only calls onFlash(errText(e,…)) and never restores the text or marks the bubble. errText (line 19) falls back to e.message, which is axios's 'Network Error' when there is no response. The flash clears after 4000 ms (line 142). ForgePanel only renders while forgeOpen (1517), so closing it unmounts the panel and reopening refetches history. server/forge/min…
- **Also found as:** "Forge: a failed turn wipes the composer but leaves the message in the log as if…" (resilience)

### B021 · When the Forge state fails to load, the panel shows the empty-conversation intro and blank settings, and Save would wipe the bible and memory

Broken · medium · effort s · found by `forge-voice`

- **Where:** ✦ Forge (open) with a failed GET /api/forge/worlds/:id; AtlasWorkspace.jsx:2182-2200
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2190`, `client/src/pages/AtlasWorkspace.jsx:2196`
- **What happens:** `.catch(() => { if (live) setMsgs([]) })` treats a load failure as 'no history'. With GET /api/forge/worlds/116 forced to 500, the panel showed the first-run intro 'Talk to the world…' with no error. The ⚙ bible, art style and memory boxes were all empty and the anchor was missing. Changing only the creation size and clicking Save the mind sent PATCH {"art_style":"","lore":"","bible":"","gen_size":"large"}. The test aborted that request; had it gone through, it would have erased the 137-character bible, the art style and the 306-character memory.
- **Why it matters:** A load error says so and offers a retry, and settings cannot be saved until they have loaded.
- **Fix:** Add an error state to ForgePanel (e.g. msgs = 'err' with a Retry button) instead of setMsgs([]). Disable 'Save the mind' until the mind has loaded, and PATCH only the fields that changed (same change as the stale-lore finding).
- **Repro:** page.route('**/api/forge/worlds/116', 500 on GET), open ✦ Forge › ⚙, pick a size and Save (script lanes/forge-voice/p8.mjs part A, with the PATCH intercepted).
- **Evidence:** p8.mjs: 'A Save would PATCH: {"art_style":"","lore":"","bible":"","gen_size":"large"}'. Screenshot shots/50-mind-failed-load.png.
- **Re-proved:** AtlasWorkspace.jsx:2190 is `.catch(() => { if (live) setMsgs([]) })`. msgs=[] renders the first-run 'Talk to the world…' intro (2360-2366), and there is no error state. mind keeps its initial value {artStyle:'', lore:'', bible:'', genSize:'medium', styleImage:null} from 2176, so the anchor shows 'Choose an image…'. 'Save the mind' is disabled only while busy==='mind' (2355), so it stays clickable. saveMind sends {art_style:'', lore:'', bible:'', gen_size}. The PATCH route (forge.js:98-110) acce…

### B041 · Forge 'move' asks move an outlined place's name but leave its outline behind, even when carrying it to another map

Broken · medium · effort s · found by `outlines`

- **Where:** Forge › batch card › Allow on a `move` ask; server/forge/contract.js:466-479
- **Files:** `server/forge/contract.js:466-479`, `server/forge/contract.js:558-561`
- **What happens:** The allow path runs `UPDATE placements SET map_id=$1, x=$2, y=$3` and never touches `shape`. For an outlined placement the name anchor moves but the region stays at the old coordinates. With `to_map`, a ring traced on map A's art gets drawn over map B's art. (Code-read only: no paid AI budget in this lane.)
- **Why it matters:** A move shifts the ring by the same dx/dy (or clears it when the map changes), like the DM drag code at AtlasWorkspace.jsx:664-668 intends.
- **Fix:** In contract.js move: SELECT p.shape as well. If to_map differs from the current map, set shape=NULL (and record the old shape in undo). Otherwise translate every point by (a.x-p.x, a.y-p.y), clamped to 0..100. Extend the undo entry (line 477, reverted at 560) to restore the shape.
- **Repro:** Read server/forge/contract.js:466-479. A live repro would need an allowed move ask on a placement whose shape is not null.
- **Evidence:** grep: server/forge/contract.js:478 'UPDATE placements SET map_id=$1, x=$2, y=$3 WHERE id=$4' — no shape column
- **Re-proved:** server/forge/contract.js:467-479: the move branch runs SELECT p.id, p.map_id, p.x, p.y (no shape), then at 478-479 `UPDATE placements SET map_id=$1, x=$2, y=$3 WHERE id=$4`. The shape column is never touched, and nothing filters out outlined placements. The undo entry at line 477 stores only map_id/x/y, and the revert at 559-560 is the same shape-less UPDATE. mind.js:61 tells the model that to_map carries a pin onto another map, so a shape traced on the old map's art would stay on the new map. …

### B045 · Changing a voice style then clicking Say sends the line before the new style is saved

Broken · medium · effort xs · found by `forge-voice`

- **Where:** Inspector › Voice › 'How they sound' then 🔊 Say it; AtlasWorkspace.jsx:1908-1923
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1912`, `client/src/pages/AtlasWorkspace.jsx:1922`, `server/routes/voice.js:48`
- **What happens:** The style is saved only on blur. Typing a new style and clicking Say it directly fires POST /voice (new style) and POST /line together. Recorded order: t=0 req /voice {voice_style:'bright and cheerful…'}, t=4 ms req /line, t=98 ms res /voice. The /line route reads nodes.voice_style at its start (voice.js:48), so the line can be generated with the old style. Lines can't be overwritten (409), so fixing a wrong-style line means Remove the line and paying again.
- **Why it matters:** Say always uses the style shown in the box.
- **Fix:** In Inspector, have the Say handler flush the style first (await onVoice(... vstyle) when it differs from n.voiceStyle), or send voice_style in the POST /line body and have voice.js use it.
- **Repro:** Select Warden Brakk with a voice set, click into 'How they sound', type a new style, then click Say it (the test aborted /line to avoid a paid call; lanes/forge-voice/p5.mjs race2).
- **Evidence:** p5.mjs race2: [[0,'req','voice',…],[4,'req','line',…],[98,'res','voice','200']]
- **Re-proved:** The code shows the race. In AtlasWorkspace.jsx:1912 the style input saves only in onBlur, through onVoice → setNodeVoice → voiceService.setVoice, which POSTs /voice. The Say button's onClick at 1922 calls onSay(line) → POST /line without waiting for that save. Blur fires on mousedown, before the click, so the two requests are in flight together. voice.js:48 reads `voice_style` in the /line handler's first query. The /voice route only runs its UPDATE after two earlier queries (SELECT node, ownsW…

### C004 · The mind reads only part of the bible and memory that the ⚙ partition says it reads every turn

Confusing · medium · effort xs · found by `forge-voice` (+1 other lane)

- **Where:** ✦ Forge › ⚙ hints; server/forge/mind.js:132-134, server/routes/forge.js:104
- **Files:** `server/forge/mind.js:132`, `server/forge/mind.js:134`, `server/routes/forge.js:104`, `server/forge/mind.js:200`, `client/src/pages/AtlasWorkspace.jsx:2315`, `client/src/pages/AtlasWorkspace.jsx:2352`
- **What happens:** The UI accepts a 100,000-character bible and says 'the mind treats it as canon on every turn', but converse() sends only the first 60,000 characters (mind.js:132). The memory hint says 'It reads this every turn', but only the last 6,000 of up to 20,000 characters are sent (mind.js:134). The two trims also disagree: saving memory from the panel keeps the first 20,000 characters (forge.js:104 slice(0,20000)), dropping the newest session summaries, while the mind's own appends keep the last 20,000 (mind.js:200 slice(-20000)).
- **Why it matters:** The hints state what the mind actually reads, the counter warns past 60k, and both trims keep the newest memory.
- **Fix:** Align the numbers: either raise mind.js:132 to 100000 or cap the bible at 60,000 in forge.js:108 and the client (AtlasWorkspace.jsx:2214). Change the hints to say what is read ('the latest 6,000 characters of memory'). Make forge.js:104 use slice(-20000).
- **Repro:** Code read. Load big-bible.md (112k characters): the box keeps 100,000 and flashes 'trimmed to 100,000', and nothing mentions the 60k cut.
- **Evidence:** grep: mind.js:132 `mind.bible.slice(0, 60000)`; mind.js:134 `mind.lore.slice(-6000)`; forge.js:104 `b.lore.slice(0, 20000)`; mind.js:200 `.slice(-20000)`. shots/05-bible-big.png
- **Re-proved:** All four cited lines check out. mind.js:132 `mind.bible.slice(0, 60000)`: only the model is told 'shown truncated', never the DM. mind.js:134 `mind.lore.slice(-6000)`. forge.js:104 PATCH `b.lore.slice(0, 20000)` keeps the oldest. mind.js:200 lore_append `.slice(-20000)` keeps the newest. forge.js:108 and client 2214-2215 cap the bible at 100,000 and flash 'The bible was trimmed to 100,000 characters'. The UI hints say 'the mind treats it as canon on every turn' (2315) and 'It reads this every t…
- **Also found as:** "The campaign bible accepts 100k characters, but the mind only ever sees the fir…" (docs-hygiene)

### C005 · Allow asks the DM to approve a rewrite without showing the new text ('Rewrite the title of "Supply Chest"')

Confusing · medium · effort s · found by `forge-voice`

- **Where:** ✦ Forge › batch card › 'It asks permission to:'; server/routes/forge.js:58-70
- **Files:** `server/routes/forge.js:63`
- **What happens:** askLine lists only which fields an edit ask changes, never the proposed values. Batch 23's card read '• Rewrite the title of "Supply Chest"'. Clicking Allow renamed it to 'Tideworn Supply Chest', a value the card never showed. For body or dm_note rewrites the DM would overwrite their own prose without seeing the replacement.
- **Why it matters:** The card shows the proposed title/category verbatim and an excerpt of (or an expander for) body and DM-note rewrites.
- **Fix:** In forge.js askLine for op 'edit', append the new values, e.g. `Rename “A” → “B”` and `Rewrite the description of “A”: “first 120 chars…”`. Optionally return the full proposed text so the client can show a toggle.
- **Repro:** Ask the mind to 'ask my permission to rename Supply Chest to …' and read the card (shots/c2-reply.png), then Allow.
- **Evidence:** after2.mjs: asksText ["Rewrite the title of “Supply Chest”"]; p6.mjs: after Allow title=Tideworn Supply Chest
- **Re-proved:** forge.js:63-65 askLine for op 'edit' builds only the field names ('title', 'description', 'category', 'DM notes') into `Rewrite the ${what} of “${nn}”`. The proposed values are on the ask (validated at contract.js:127-133) but never rendered. The client card (AtlasWorkspace.jsx:2282-2285) shows only asksText. Allow applies them straight away via COALESCE at contract.js:480-486, which overwrites title/body/category/dm_note (Unmake can revert through the recorded undo). I could not re-view batch …

### C006 · Keep on a card with a pending request silently refuses the request

Confusing · medium · effort xs · found by `forge-voice`

- **Where:** ✦ Forge › batch card with 'It asks permission to:' › Keep
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2284`, `server/routes/forge.js:155`
- **What happens:** The card shows two button rows, Allow/Refuse and Keep/Unmake, with Keep styled as primary like Allow. The keep route (forge.js:155-160) sets asks_state 'refused' for pending asks, but nothing on the card says so. Live: batch 25 asked to 'Reveal "Marra Vell" to players'. Clicking Keep removed the card with no flash, and Marra stayed visibility 'dm'. A DM who reads Keep as 'accept' loses the reveal without noticing.
- **Why it matters:** Keep is disabled until the asks are answered, or it is labelled and confirmed ('Keep — decline the request'), or a flash says the request was declined.
- **Fix:** In ForgePanel card(), when b.asksState==='pending', disable Keep with a title 'Answer the request first', or show a flash 'Kept — the request to … was declined'. CLAUDE.md documents the lapse, so this is about making it visible in the UI.
- **Repro:** Get a batch with a reveal ask, click Keep, then GET /api/atlas/maps/375 → node 1314 visibility (p9.mjs).
- **Evidence:** p9.mjs: 'after Keep: cards=0 flash=(no flash)'; 'Marra visibility after Keep: dm'. shots/60-reveal-ask.png
- **Re-proved:** The code is enough to settle this. forge.js:152-161 (keep route) runs `asks_state = CASE WHEN asks_state='pending' THEN 'refused' ...`. In AtlasWorkspace.jsx batchAct (2262-2272), the card is removed on success and onFlash is called only when `!keep`, so Keep never shows a flash. The Keep button (2294) has className 'tool on', the same as Allow (2287). The card only says 'It asks permission to:' (2284) and gives no hint that Keep declines. CLAUDE.md:159 documents the lapse ('Refuse/Keep lapse t…

### C007 · Conversation history keeps the mind's success claims after a failed or unmade creation, and the failure exists only as a 4-second flash

Confusing · medium · effort s · found by `forge-voice` (+1 other lane)

- **Where:** ✦ Forge log; server/forge/mind.js:180-203
- **Files:** `server/forge/mind.js:189`, `server/forge/mind.js:199`, `server/forge/contract.js:578`
- **What happens:** When applyBatch fails, converse() still stores the mind's `say` without the error (the stored text is `applied ? say+⚒ : say`), and lore_append is still written. After chat 1 the stored reply read 'I've logged the standoff. Brakk's notes now reflect his lingering suspicion, and the Keep's interior map notes record the confrontation' while both notes were null. The lore did gain 'Session (2026-09-26): The party confronted Warden Brakk…'. The error was a 4-second flash that disappears (flash timeout, AtlasWorkspace.jsx:142). This history is replayed to the model (LIMIT 16), so the mind also believes it did the work. Similarly, after Unmake (batch 23) the reply bubble still ends '⚒ Flooding the Great Hall and renaming the chest.' with no sign it was undone.
- **Why it matters:** The log shows what actually happened: failed creations are marked, unmade ones are marked, and a failed recap doesn't half-apply (lore written, notes not).
- **Fix:** In mind.js converse(), when applyError is set, append a line such as '⚠ Nothing was changed: <error>' to the stored mind message and skip lore_append (or record it with a failure note). In discardBatch, append a system/mind message 'Unmade: <summary>' (or flag mind_messages.batch_id rows) so the panel can grey out the ⚒ line.
- **Repro:** Send the chat-1 recap on world 116, map 375 (or any batch that fails), then reload the Forge and read the last reply. GET /api/forge/worlds/116 → messages.
- **Evidence:** after1.mjs: messages[1].content = "I've logged the standoff…"; map375 dmNote null; brakk dmNote null; lore gained the Session line.
- **Re-proved:** server/forge/mind.js:189-192: `stored = applied ? say+'\n⚒ '+summary : say`. When applyError is set, the mind's success-claiming `say` is stored without any error marker. The lore_append block (199-202) runs whether or not applyError is set, so the lore is written even when the batch failed. The tail replayed to the model is LIMIT 16 (125-126). discardBatch (contract.js:522-588) sets forge_batches.status='discarded' at 578 and never touches mind_messages. The client batchAct (AtlasWorkspace.jsx…
- **Also found as:** "A failed Forge turn still saves the mind's 'here is what I logged' reply and it…" (server-dead)

### P007 · Unsaved ⚙ edits (including a loaded .md bible) vanish when the Forge closes, with no unsaved marker

Product polish · medium · effort s · found by `forge-voice`

- **Where:** ✦ Forge › ⚙ › Load a .md file… / Campaign bible / Art style / Memory → ✕
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2206`, `client/src/pages/AtlasWorkspace.jsx:2356`
- **What happens:** The ⚙ fields are local state until 'Save the mind', a button at the bottom of a scrolling pane. Loading small-bible.md filled the box ('137 characters') with no hint that it wasn't saved yet. Closing the Forge with ✕ and reopening showed an empty bible, and the panel reopens on chat, not ⚙. Nothing warns about the discarded edit.
- **Why it matters:** Either autosave on blur, as the inspector does for node fields, or a visible 'Unsaved changes' state and a warning on close.
- **Fix:** In ForgePanel, keep a dirty flag. Save each field on blur (PATCH only that field, as the inspector's autosave does) or show 'Unsaved' next to the gear and confirm on ✕. After a file load, say 'Loaded — Save to keep it'.
- **Repro:** ✦ Forge › ⚙ › Load a .md file… (any small .md), then ✕, then ✦ Forge › ⚙ (lanes/forge-voice/p2.mjs).
- **Evidence:** p2.mjs: 'bible after upload: "# The Test Bible…"' then 'bible after close/reopen w/o save: ""'. shots/04-bible-loaded.png
- **Re-proved:** The ForgePanel is conditionally mounted at AtlasWorkspace.jsx:1517 (`forgeOpen && <ForgePanel…/>`), so ✕ unmounts it. On reopen it refetches from the server and view starts at 'chat' (2175). ⚙ edits live only in local state until saveMind (2194-2200, 'Save the mind' button at 2355). loadBibleFile (2207-2218) only calls setMind. There is no dirty flag. Browser repro on my clone: in ⚙ I filled the bible with 'UNSAVED EDIT' and found no 'unsaved' text anywhere in the panel. After ✕ then ✦ Forge, t…

### P009 · Forge messages over 12,000 characters are cut silently: the composer has no limit or counter

Product polish · medium · effort xs · found by `forge-voice`

- **Where:** ✦ Forge › composer; server/routes/forge.js:134
- **Files:** `server/routes/forge.js:134`, `client/src/pages/AtlasWorkspace.jsx:2392`
- **What happens:** The composer accepted 13,154 characters with no counter or warning, and the client sent all 12,538 characters of the test recap. The server slices to 12,000 (forge.js:134) and stores exactly 12,000. The line placed after character 12,000 ('FINAL-LINE-AFTER-12K: Brakk also dropped a brass token…') never reached the mind and is not in the stored history.
- **Why it matters:** The DM sees the limit before sending (a counter or maxLength), or the server refuses with a clear message instead of truncating.
- **Fix:** Add maxLength={12000} and a live 'n / 12,000' counter to the composer textarea (AtlasWorkspace.jsx:2392). Server: return 413/400 'Messages are limited to 12,000 characters' rather than slicing.
- **Repro:** Paste 12.5k characters into the composer and send, then GET /api/forge/worlds/116 → messages[].content.length.
- **Evidence:** chat.mjs c1: 'client sent len=12538'; after1.mjs: user message len 12000, hasFinal false. p3.mjs F: composer len=13154 with no counter text in .fcompose.
- **Re-proved:** Code: server/routes/forge.js:134 `req.body.message.trim().slice(0, 12000)`, and mind.js:191 stores message.slice(0,12000). Nothing returns an error. forgeService.chat (client/src/services/forgeService.js) sends the text untrimmed. The composer textarea at AtlasWorkspace.jsx:2392-2395 has no maxLength and no counter. In the browser on my clone (world 137, 1440x900), I filled the composer with 13,154 chars: value.length=13154, maxLength=-1, and .fcompose innerText was only 'in The Sunken Keep\nSe…

### P016 · Remove the line (✕) drops a paid voice line with one click and leaves the audio public in R2; the line box stays editable while a line exists

Product polish · medium · effort s · found by `forge-voice`

- **Where:** Inspector › Voice › ✕ 'Remove the line'; server/routes/voice.js:61-66
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1915`, `client/src/pages/AtlasWorkspace.jsx:1926`, `server/routes/voice.js:64`, `server/routes/voice.js:84`
- **What happens:** Clicking ✕ produced no confirm, no flash and no undo. voice_line and voice_url were nulled, yet the old WAV at pub-…r2.dev/worlds/116/voice-1223-….wav still returned 200: DELETE never deletes the R2 object, and ambience DELETE at voice.js:84 behaves the same. The server's no-overwrite rule (409 'They already have a line — clear it before recording another') is explained only by a hover tooltip on a Say button that doesn't look disabled. The line textarea stays editable: typing 'A different line typed after the fact' changed nothing on the server, so the box and the audio disagree until the line is removed.
- **Why it matters:** Removing a paid line asks first (or offers Undo), the storage object is removed, and while a line exists the box is read-only with an inline note: 'Remove the line to record a new one'.
- **Fix:** AtlasWorkspace.jsx:1915-1926: set readOnly on the textarea when n.voiceUrl, add an inline hint, and put a confirm (or an undo flash) on ✕. voice.js DELETE line/ambience: select voice_url/ambience_url first, derive the R2 key (worlds/<id>/voice-…) and call storage.deleteObject after the UPDATE.
- **Repro:** Select Warden Brakk with a line, type into the line box, click ✕, then fetch the old voiceUrl (p5.mjs).
- **Evidence:** p5.mjs: '409 test: 409 {"message":"They already have a line — clear it before recording another"}'; 'remove: dialog=null flash=(no flash) … voiceUrl:null'; 'old audio after removal GET 200'. shots/24-line-removed.png
- **Re-proved:** AtlasWorkspace.jsx:1926: the ✕ button's onClick={onClearLine} → clearLine (186-189) has no confirm, no success flash and no undo. voice.js DELETE /nodes/:id/line (61-66) and DELETE /maps/:id/ambience (83-88) only null the DB columns. voice.js imports only `putObject` from ../storage and never calls deleteObject, so the R2 audio is left behind. At 1915-1918 the line textarea has no readOnly, even when n.voiceUrl is set. The only explanation of the rule is the Say button's title attribute at 1921…

### B063 · Saving the mind during a running chat clears the 'Working…' state and allows a second concurrent message

Broken · low · effort xs · found by `forge-voice`

- **Where:** ✦ Forge › send, then ⚙ › Save the mind while waiting; AtlasWorkspace.jsx:2194-2200
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2195`, `client/src/pages/AtlasWorkspace.jsx:2199`
- **What happens:** Chat and settings share one `busy` slot. saveMind sets busy='mind' and then null in finally, overwriting 'chat'. Test: while a slow chat was in flight, Save the mind removed the 'Working… paintings take a minute.' bubble and re-enabled Send. A second message went out concurrently (2 chat requests in flight).
- **Why it matters:** Saving settings doesn't cancel the chat's busy state, and a second turn waits.
- **Fix:** Use separate state (e.g. savingMind) for saveMind, or guard saveMind with `if (busy) return`.
- **Repro:** Mock a 9-second chat, send, then ⚙ › Save, return to chat and send again (p11.mjs).
- **Evidence:** p11.mjs: 'after Save during chat: waiting bubble=0 send disabled=false'; 'chat requests sent concurrently: 2'. shots/80-busy-cleared.png
- **Re-proved:** Checked in the code at client/src/pages/AtlasWorkspace.jsx. Line 2174 declares one shared slot: `const [busy, setBusy] = useState(null) // null | 'chat' | 'mind' | batch id`. saveMind (2194-2200) calls setBusy('mind') and then setBusy(null) in finally, with no busy guard. The Save button at 2355 is only `disabled={busy === 'mind'}`, so it stays enabled while busy==='chat'. The waiting bubble at 2379 renders only when busy==='chat'. The Send button at 2396 is `disabled={!!busy || ...}`, and send…

### C073 · VOICE_TTS_MODEL names a model for two different providers

Confusing · low · effort xs · found by `server-dead`

- **Where:** server/voice/providers.js:65; server/voice/elevenlabs.js:38; .env.example
- **Files:** `server/voice/providers.js:65`, `server/voice/elevenlabs.js:38`, `.env.example`
- **What happens:** speakGemini uses process.env.VOICE_TTS_MODEL || 'gemini-2.5-flash-tts', and ElevenLabs speak uses process.env.VOICE_TTS_MODEL || 'eleven_multilingual_v2'. .env.example gives the example value VOICE_TTS_MODEL=gemini-2.5-flash-tts. If that is set and the provider is ElevenLabs (pinned via VOICE_PROVIDER, or the Gemini key removed), ElevenLabs receives model_id 'gemini-2.5-flash-tts' and every line fails. OpenAI already has its own variable (VOICE_TTS_MODEL_OPENAI).
- **Why it matters:** One variable per provider.
- **Fix:** Rename to VOICE_TTS_MODEL_GEMINI and VOICE_TTS_MODEL_ELEVENLABS (keeping a fallback read of the old name for Gemini only), and update .env.example and CLAUDE.md.
- **Repro:** grep -n "VOICE_TTS_MODEL" server/voice/*.js .env.example
- **Re-proved:** providers.js:65 reads `process.env.VOICE_TTS_MODEL || 'gemini-2.5-flash-tts'`, and elevenlabs.js:38 reads `model_id: process.env.VOICE_TTS_MODEL || 'eleven_multilingual_v2'`. .env.example:42 gives the example `VOICE_TTS_MODEL=gemini-2.5-flash-tts`. OpenAI has its own VOICE_TTS_MODEL_OPENAI (providers.js:97). provider() lets VOICE_PROVIDER pin elevenlabs while a Gemini key is present, in which case ElevenLabs would be sent the Gemini model id. One small correction: CLAUDE.md does not mention VOI…

### O016 · The Forge rulebook assumes years and six categories, but the world clock counts footsteps and the digest includes 'party' nodes

Obsolete · low · effort xs · found by `server-dead`

- **Where:** server/forge/mind.js:13-17, 45, 68, 81
- **Files:** `server/forge/mind.js:13-17`, `server/forge/mind.js:45`, `server/forge/mind.js:68`, `server/forge/mind.js:81`
- **What happens:** The RULEBOOK tells the mind that lifespans are 'integer years' (lines 14, 17, 45, 81) and that the six categories 'are the only categories' (line 13). The digest sends timeline.unit (e.g. 'days' from the workspace's enable flow), and CLAUDE.md's table convention counts footsteps, ten per session, with 'party' nodes that appear in the digest. The mind will narrate years and cannot reason correctly about the Party node.
- **Why it matters:** The prompt uses the world's own unit and knows the party node.
- **Fix:** Interpolate the unit (e.g. `in integer ${unit}`), mention the Party node (category 'party', one per world, a placement per footstep; never create another), and keep the category list in sync with the shared constant.
- **Repro:** grep -n "years\|only categories" server/forge/mind.js
- **Re-proved:** server/forge/mind.js:13 says '(a place, person, item, note, lore, or event — those are the only categories)'. mind.js:14 says 'lifespan [start,end] in integer years on the ONE world clock'. Years come up again at :17 (backdrop 'from a start year onward'), :45 ('timed override at that year'), :68 ('that is a single year') and :81 ('years are integers within the digest's range'). The digest (mind.js ~line 107) sends `timeline: {..., unit: w.timeline_time_unit}`. The node query in the digest has n…

### P038 · Batch card copy: raw keys, plural errors, placeholder summary 'A generation', and a DM-only note on cards with nothing new

Product polish · low · effort xs · found by `forge-voice`

- **Where:** ✦ Forge › batch card meta line; AtlasWorkspace.jsx:2274-2281, server/forge/contract.js:32
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2274`, `client/src/pages/AtlasWorkspace.jsx:2281`, `server/forge/contract.js:32`
- **What happens:** COUNT_LABELS covers only the enrich keys, so the card prints raw counters: '3 nodes · 3 placements · 1 images · 2 links · 1 backdrops set · 1 facts'. Batch 25 read '1 notes extended'. 'backdrops' (timed overrides) and 'backdrops set' (standing image) are two different things with nearly the same label. When the mind omits a summary the card title is 'A generation' (contract.js:32), as live batch 25 showed. '— new things stay DM-only until you reveal them' appears even on cards that created nothing new.
- **Why it matters:** Plain, grammatical counts ('1 painting', '3 people and places placed') and a meaningful fallback title.
- **Fix:** Give COUNT_LABELS singular/plural entries for images, nodes, maps, placements, links, eras, backdrops ('timed backdrops') and facts. Show the DM-only note only when counts.nodes>0. Make the fallback summary derive from counts (e.g. '1 note extended, 1 request').
- **Repro:** See live cards in shots/c2-reply.png and 60-reveal-ask.png, and the mocked card in 14-batch-card.png.
- **Evidence:** Card texts quoted from p3.mjs E and p9.mjs.
- **Re-proved:** COUNT_LABELS at AtlasWorkspace.jsx:2274-2277 maps only enrichedBodies, enrichedNotes, enrichedImages, noteAppends, stanceChanges, mapNoteAppends and mapBases. applyBatch's `created` object (contract.js ~289) also has images, nodes, maps, placements, links, eras, backdrops and facts. Those fall through `COUNT_LABELS[k] || k` at line 2281 as raw keys with no singular form ('1 images', '1 facts'). 'notes extended' has no singular either. In contract.js:413-426, a null-start backdrop goes into mapB…

### P039 · Clicking Keep shows the spinner on Unmake (and Refuse shows it on Allow)

Product polish · low · effort xs · found by `forge-voice`

- **Where:** ✦ Forge › batch card; AtlasWorkspace.jsx:2287, 2295
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2287`, `client/src/pages/AtlasWorkspace.jsx:2295`
- **What happens:** Both actions set busy=b.id, and only the Allow and Unmake buttons render '…' when busy===b.id. With a slow keep response, the card showed buttons ['Keep','…'], which looks as if the creation is being unmade.
- **Why it matters:** The clicked button shows the progress state.
- **Fix:** Track {id, act} in busy and render '…' on the button whose act matches.
- **Repro:** Mock a slow /batches/:id/keep, click Keep (p3.mjs E).
- **Evidence:** p3.mjs: 'E during Keep, buttons: ["Keep","…"]'; shots/15-keep-busy.png
- **Re-proved:** The code settles it. askAct (2251) and batchAct (2262) both `setBusy(b.id)`. Only Allow (2287) and Unmake (2295) render `busy === b.id ? '…'`, so Keep shows '…' on Unmake and Refuse shows it on Allow. The effect is slightly wider than stated: during Keep or Unmake, Allow (if asks are pending) also shows '…', and during Allow or Refuse, Unmake also shows '…'. I did not rerun this live because a batch needs a paid Forge call.

### P046 · Internal names shown in the DM UI: raw Forge count keys ('1 nodes', '2 placements', '3 facts'), the voice provider id, and 'Nano Banana'

Product polish · low · effort xs · found by `client-dead` (+2 other lanes)

- **Where:** Atlas › ✦ Forge batch card; Inspector › Voice header; Image picker › ✦ Paint tooltip
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2274-2281`, `server/forge/contract.js:289`, `client/src/pages/AtlasWorkspace.jsx:1895`, `client/src/pages/AtlasWorkspace.jsx:2102`
- **What happens:** COUNT_LABELS covers 7 of the 15 keys contract.js produces. images, nodes, maps, placements, links, eras, backdrops and facts fall back to the raw key with no singular form: '1 nodes · 2 placements · 3 facts · 1 eras'. 'placements' and 'facts' are internal terms (the inspector calls facts 'Story for a period'). The Voice section header shows the raw provider id ('Voice · gemini' / '· elevenlabs'). The paint button tooltip says 'Nano Banana paints in this world's style…', which is a model codename.
- **Why it matters:** Plain DM-facing words.
- **Fix:** Add singular/plural labels for all 15 keys (e.g. nodes → 'new thing(s)', placements → 'spot(s) on maps', facts → 'period text(s)'). Map provider ids to display names. Reword the tooltip to 'Paints art in this world's style and attaches it here'.
- **Repro:** Compare the COUNT_LABELS keys with `const created = {…}` at contract.js:289.
- **Re-proved:** COUNT_LABELS at AtlasWorkspace.jsx:2274-2277 maps 7 keys: enrichedBodies, enrichedNotes, enrichedImages, noteAppends, stanceChanges, mapNoteAppends, mapBases. server/forge/contract.js:289 `created` has 15 keys. The 8 unmapped ones are images, nodes, maps, placements, links, eras, backdrops and facts. Counts reach the client as raw key/length pairs filtered to >0 (contract.js:433 and routes/forge.js:73), and line 2281 renders `${v} ${COUNT_LABELS[k] || k}`, producing e.g. '1 nodes'. There is no …
- **Also found as:** "Forge cards show raw data keys with wrong plurals (‘15 placements · 4 facts · 1…" (copy); "Forge and voice UI shows vendor/model names and whimsical copy instead of sayin…" (forge-voice)

### P053 · Disabled buttons look enabled across the Forge and voice (Send, Keep/Unmake, Allow/Refuse, Say it)

Product polish · low · effort xs · found by `forge-voice`

- **Where:** atlas.scss `.tool` (63) and `.btn` (93)
- **Files:** `client/src/styles/atlas.scss:63`, `client/src/styles/atlas.scss:93`
- **What happens:** Neither `.atlas .tool` nor `.atlas .btn` has a :disabled rule, and both set color:var(--ink), which overrides the browser's grey. Send with an empty box, Keep/Unmake while busy, and '🔊 Say it' with no voice or with an existing line all render identically to their enabled state, with a pointer cursor. The 409 rule depends on the DM noticing that Say is disabled.
- **Why it matters:** Disabled controls read as disabled.
- **Fix:** Add `.atlas .tool:disabled,.atlas .btn:disabled{opacity:.5;cursor:not-allowed}` in client/src/styles/atlas.scss.
- **Repro:** Compare 🔊 Say it with no voice (shots/20-voice-empty.png) and with a voice picked. Compare Send with an empty composer (shots/01-forge-empty.png).
- **Evidence:** grep ':disabled' client/src/styles/atlas.scss → only the dead .fquick rule at 530-531
- **Re-proved:** atlas.scss:63 `.tool{...color:var(--ink);...cursor:pointer}` and :93 `.btn{...color:var(--ink);...cursor:pointer}` have no :disabled rule. The only :disabled rule in atlas.scss is at 530-531, on `.fquick` buttons, and grep finds no 'fquick' in any jsx/js. The :disabled rules in shell.scss:144 are scoped to .shell .sbtn, and those in main.scss to login/admin/setup buttons, so none of them reach .atlas. I checked live on my clone 139 using computed styles. Send, empty and disabled=true: color rgb…

### P082 · Clearing a voice line or ambience (or deleting its node) leaves the audio file in R2

Product polish · low · effort s · found by `server-dead` (+1 other lane)

- **Where:** server/routes/voice.js:61-66 and 81-86
- **Files:** `server/routes/voice.js:61-66`, `server/routes/voice.js:81-86`, `server/storage.js`
- **What happens:** DELETE /nodes/:id/line and DELETE /maps/:id/ambience only null the DB columns. The worlds/<id>/voice-* and ambience-* objects stay in R2 until the whole world is deleted. Since a line can never be overwritten (409) and must be cleared first, every re-record orphans one object.
- **Why it matters:** Clearing audio removes the object, as image DELETE does.
- **Fix:** Before nulling, read voice_url/ambience_url, derive the key by stripping R2_PUBLIC_URL (export a keyFromUrl helper from storage.js), and deleteObject it best-effort. If node-delete undo must keep audio, leave node DELETE as is.
- **Repro:** Read voice.js:61-66 and 81-86: no deleteObject call. Compare images.js:240-247.
- **Re-proved:** voice.js:61-66 (DELETE /nodes/:id/line) and :81-86 (DELETE /maps/:id/ambience) only UPDATE the columns to NULL. voice.js imports only r2Enabled and putObject from storage (line 11), and there is no deleteObject call. voice.js:51 returns 409 when voice_url is already set, so re-recording requires a clear first, and each clear leaves one object behind. Keys are worlds/<world_id>/voice-* and ambience-* (lines 56, 76). The only cleanup is deletePrefix(`worlds/${id}/`) on world delete (worlds.js:175…
- **Also found as:** "Clearing a spoken line or an ambience leaves its audio file in R2" (schema-data)

