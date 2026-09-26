# WP-02 · Protect the live campaign data: undo, clone and backups

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Make Undo and world clone restore every column and table they drop today, and give clones their own R2 files. Stop the docs and the e2e cleanup from treating production data as disposable.

**Notes:** Start with schema-data-07 (xs, docs) so no later session thinks the schema can be recreated. Do docs-hygiene-12 next, so the e2e suites fail loudly and stop deleting every outlined place before anyone uses them to check later work. The root cause of confusing-code-02 and api-contract-05 is hand-written column lists in atlas.js (undo at 583-612, clone at 163-252). Build both from one shared list so new columns cannot drift again. images-05 needs an R2 copy of each image at clone time. dashboard-05 (folded into api-contract-05) also notes there is no UI to duplicate your own world, although the docs mark it done: add the UI or correct the doc. Find out what world_backups is (schema-data-09) before touching it, and never drop it without Bennett. To re-check: delete a node that has a DM note and a voice, Undo, and confirm both are back. Clone the sample, delete a source image, and confirm the clone's art still loads.

## Checklist

- [ ] **B008** · high · s · Undo and world clone use hand-copied column lists that drifted: Undo silently drops DM notes, stance, voice and interior map notes — done d1f2c67 + d8c526d (one column list per table, shared by undo and clone; the API suite checks every column survives undo)
- [ ] **B036** · medium · s · World clone drops DM notes, stance, voices, map notes, ambience, spotlight, image folders and the Forge mind — done d1f2c67
- [ ] **B051** · medium · m · Cloned worlds share the source's R2 files: deleting the image or world in the source breaks the clone's art (README says the opposite) — done d1f2c67 (clones copy their R2 objects)
- [ ] **C014** · medium · xs · Design docs still say production data is disposable and the schema can be recreated, but it holds Bennett's live campaign — done d1f2c67
- [ ] **C016** · medium · s · The remove-interior and delete dialogs overstate what gets deleted (nested interiors survive as orphans) — done d1f2c67 (impact reports nested spaces; dialogs say what really goes)
- [ ] **P025** · medium · s · e2e suites exit 0 even when steps FAIL, the DM config example is incomplete, and cleanup deletes every outlined place — done d1f2c67
- [ ] **C051** · low · xs · Undo is described as a 24-hour restore, but the UI offers it for 9 seconds and the server never enforces the age — done d1f2c67 (server enforces the 24 h; the UI wording matches)
- [ ] **C064** · low · s · Template clones write base64 art back into Postgres even with R2 on, and .env.example omits the R2 settings — done d1f2c67
- [x] **C065** · low · xs · Production has an undocumented hand-made table 'world_backups' holding a full snapshot of Bennett's campaign — done (exported to ~/atlas-backups/world-29-…-2026-09-26.json and dropped, with Bennett's ok)
- [ ] **C078** · low · xs · A cloned sample world keeps the template's 'Clone it, break it, learn it.' description when the user leaves the description blank — done d1f2c67
- [ ] **P048** · low · m · Undo is a single 9-second toast: a second delete replaces it, a reload loses it, and Ctrl+Z / Delete do nothing, though tombstones live 24 h

## Items

### B008 · Undo and world clone use hand-copied column lists that drifted: Undo silently drops DM notes, stance, voice and interior map notes

Broken · high · effort s · found by `confusing-code` (+8 other lanes)

- **Where:** Flash bar ↩ Undo after Delete / Remove interior; server/routes/atlas.js:583-612 and clone at 179-243
- **Files:** `server/routes/atlas.js:609`, `server/routes/atlas.js:585`, `server/routes/atlas.js:207`, `server/routes/atlas.js:198`, `client/src/pages/AtlasWorkspace.jsx:151`
- **What happens:** Verified live on throwaway world 42: node 406 with dm_note 'SECRET-NOTE', stance 'foe', interior map note 'INTERIOR-MAP-NOTE' → DELETE /nodes/406 → POST /undo/57 → dmNote null, stance null, interior map dmNote null (body and focus survive). Remove-interior + undo (undoId 59) also returned the interior map with dmNote null while focus_start/end survived. The tombstone payload holds the full rows (SELECT *), but the restore INSERT for nodes (atlas.js:609-612) lists only id…pin_size/author, omitting dm_note, stance, voice_id, voice_name, voice_line, voice_url, voice_style; insertMap (585-590) omits dm_note, ambience_prompt, ambience_url. The clone INSERTs (nodes 207-211, maps 198-202) omit the same columns. History: undo list written in 6bf13db (2026-08-20); dm_note added bb4f7a4 (08-25), stance/map notes 61f8a14 (09-01), voice later — none back-ported. The workspace then says 'Put back the way it was.' (AtlasWorkspace.jsx:151).
- **Why it matters:** Undo restores every column it snapshotted; clones copy every content column.
- **Fix:** Define NODE_COLS / MAP_COLS / PLACEMENT_COLS once (server/routes/atlas.js or server/lib/columns.js) and build the clone and undo INSERTs from them (or from Object.keys of the snapshot row intersected with information_schema columns). Add an API test in server/test that sets every node/map column, deletes, undoes and compares.
- **Repro:** Scratch script lanes/confusing-code/undo-drift.mjs + undo-interior.mjs: clone 27, POST /api/atlas/maps/{root}/nodes, PATCH /api/atlas/nodes/{id} {dm_note, stance}, POST /nodes/{id}/interior, PATCH /maps/{interior} {dm_note}, DELETE /nodes/{id}, POST /undo/{undoId}, GET /maps/{root} → dmNote null, stance null.
- **Evidence:** Live: 'before delete: dmNote SECRET-NOTE stance foe' → 'after undo: dmNote null stance null'; 'interior map after interior-undo dmNote null' (focus 1 5 kept). git log -S dm_note: bb4f7a4, 61f8a14; undo INSERT from 6bf13db.
- **Re-proved:** Code: the node restore INSERT (atlas.js:610) lists id…pin_size, author, created_by, created_at, updated_at, with no dm_note, stance, voice_*. insertMap (586) has no dm_note or ambience_*. The clone INSERTs at 199 (maps) and 208 (nodes) omit the same columns. The snapshot uses SELECT * (544, 553, 533). Live repro on my clone (world 92, API only): node 957 PATCHed with dm_note 'SECRET-NOTE', stance 'foe', body 'BODY', and interior map 301 given dm_note plus focus 1-5. DELETE interior, then undo 8…
- **Also found as:** "Undo and world clone silently drop DM notes, stance, voices, map notes and ambi…" (server-dead); "Undo and world clone silently drop DM notes, stance, voice and map notes/ambien…" (docs-hygiene); "Undo after deleting a node or removing an interior loses DM notes, stance, voic…" (inspector); "Undo puts deleted interiors and nodes back without their DM notes, stance, voic…" (maps); "Undo after deleting a node or an interior brings it back without its DM notes, …" (schema-data); "Undo of a node or interior delete silently drops DM notes, stance, voice, map n…" (api-contract); "Undo of a node delete silently drops its DM notes, stance, voice and spoken lin…" (forge-voice); "Undo puts back a node or interior without its DM notes, stance, voice, map note…" (resilience)

### B036 · World clone drops DM notes, stance, voices, map notes, ambience, spotlight, image folders and the Forge mind

Broken · medium · effort s · found by `api-contract` (+3 other lanes)

- **Where:** Dashboard › New world › start from the sample; POST /api/atlas/worlds/clone
- **Files:** `server/routes/atlas.js:196-213`, `server/routes/atlas.js:186-194`, `server/routes/atlas.js:179-183`
- **What happens:** The clone INSERTs copy nodes (title, body, category, image, visibility, pin, pin_size, author) and maps (title, description, image, view, focus). They omit nodes.dm_note, stance, voice_id, voice_name, voice_line, voice_url, voice_style, maps.dm_note, ambience_prompt, ambience_url, worlds.spotlight_node_id, images.folder_id, image_folders and world_minds (art style, lore, bible). Live: in world 44, node 425 had dm_note 'VAULT DM NOTE' and stance 'foe', node 440 had dm_note 'F DM NOTE SECRET', map 149 had a dm_note and the spotlight was on 420. Clone 46 had all of them null (outlines were kept). The UI only clones templates, so any DM notes or voices in the sample world never reach newcomers. CLAUDE.md implies world copies are faithful ('kept by world copies').
- **Why it matters:** A clone is a deep copy of the world, including the secret half of nodes and maps.
- **Fix:** Extend the node and map INSERTs in atlas.js clone with the missing columns. Remap spotlight_node_id through nodeMap. Copy image_folders (remapping parent_id) and images.folder_id. Decide deliberately whether world_minds (lore/art_style/bible) is copied, and write the decision in a comment.
- **Repro:** PATCH /api/atlas/nodes/:id {dm_note:'x',stance:'foe'}; POST /api/atlas/worlds/clone {source_id:<world>}; GET /api/atlas/maps/<clone root>. The node's dmNote and stance are null (lanes/api-contract/clone-fid.mjs).
- **Evidence:** clone-fid.mjs: SRC root [["The Drowned Vault","VAULT DM NOTE","foe"],["Future Secret F","F DM NOTE SECRET"]] vs clone 'Future Secret F',null,null; 'X world spotlight null'; map note null
- **Re-proved:** Code: the clone INSERTs (atlas.js:179-183 worlds, 186-194 images, 196-213 maps and nodes) omit nodes.dm_note, stance and voice_*; maps.dm_note and ambience_*; worlds.spotlight_node_id; and images.folder_id. There is no copy of image_folders or world_minds anywhere in the clone handler. Live: world 96 had node 992 with dm_note 'B1 DM NOTE' and stance 'foe', interior 313 with dm_note 'B1 MAP NOTE', and the spotlight on 992. The clone, world 97, had node 1002 (the copy) with dmNote null and stance…
- **Also found as:** "World clone silently drops DM notes, stance, voices, map notes, ambience, the l…" (schema-data); "World clone drops image folders: every copied image lands in Unsorted" (images); "Cloning a world silently drops DM notes, stance, map notes, voices, ambience an…" (dashboard)

### B051 · Cloned worlds share the source's R2 files: deleting the image or world in the source breaks the clone's art (README says the opposite)

Broken · medium · effort m · found by `images` (+5 other lanes)

- **Where:** server/routes/atlas.js:163-195 (POST /worlds/clone), images.js:240-250, worlds.js:172-178; README.md:44-48
- **Files:** `server/routes/atlas.js:163-166`, `server/routes/atlas.js:186-195`, `server/routes/images.js:240-250`, `server/routes/worlds.js:172-178`, `server/forge/contract.js:586`, `README.md:44-48`
- **What happens:** World 117 was cloned from world 106. The clone's image rows point at the source's R2 objects: small.webp in world 117 = https://pub-…r2.dev/worlds/106/img-1790401712207-837859384.webp, with storage_key NULL. Before: GET of that URL returned 200. DELETE /api/images/427 (small.webp) in world 106 returned 200. After: the clone's URL returned 404, while its small.jpg (untouched) still returned 200. World 117's Archive still lists small.webp as a broken tile. Deleting the source world (deletePrefix worlds/<id>/) or a Forge 'Unmake' (contract.js:586) does the same to every clone. README.md:46 says clones 'never cascade-delete each other's R2 objects'. That holds only in the clone→source direction. The sample template's art is base64 today, so newcomers' clones are safe until R2 art is added to a template.
- **Why it matters:** A clone should own its art. Deleting something in one world should never break another world.
- **Fix:** Choose one: (a) in the clone loop (atlas.js:186-195), copy each R2 object with CopyObjectCommand to worlds/<newId>/<new filename> and store the new URL and storage_key (add copyObject to storage.js); or (b) before deleteObject/deletePrefix, skip keys whose URL is still referenced by images rows of other worlds. Then correct README.md:44-48.
- **Repro:** POST /api/atlas/worlds/clone {source_id: <a world with uploaded art>} → GET /api/images?world_id=<clone>: file_path points under worlds/<source id>/. DELETE that image in the source. Fetching the clone's URL now gives 404.
- **Evidence:** a4.mjs output: 'webp url in C: https://pub-079329e8e0ae43e8a0dc6156f45f6a42.r2.dev/worlds/106/img-…webp', 'before: C webp 200 C jpg 200', 'delete small.webp (427) in world A: 200', 'after: C webp 404 C jpg 200', 'C archive still lists small.webp: true'
- **Re-proved:** atlas.js:186-195 copies im.file_path unchanged for R2 images, with storage_key NULL. The comment at :163-166 says clones 'never share — or cascade-delete — each other's R2 objects' and in the same sentence says R2 art 'keeps pointing at the original URL'. images.js:241-250 deletes the source row's storage_key object. worlds.js:173-178 runs deletePrefix(worlds/<id>/), and contract.js:586 runs deleteObject. Live repro on my own worlds: I uploaded verify-red.png (id 581) to world 127, where it wen…
- **Also found as:** "Clones share R2 objects with their source; deleting the source world or one of …" (server-dead); "A cloned world shares the source's R2 image files: deleting the source world or…" (schema-data); "Clones point at the source world's R2 objects, so deleting the source world or …" (docs-hygiene); "Cloned worlds share the source's R2 files, so deleting a source image or world …" (api-contract); "Clone comment says clones never share R2 objects, yet they point at the source'…" (confusing-code)

### C014 · Design docs still say production data is disposable and the schema can be recreated, but it holds Bennett's live campaign

Confusing · medium · effort xs · found by `schema-data`

- **Where:** docs/UX-REDESIGN.md:7, :83, :181, :199; docs/REVIEW.md:11-13, :53, :62
- **Files:** `docs/UX-REDESIGN.md:7`, `docs/UX-REDESIGN.md:83`, `docs/UX-REDESIGN.md:181`, `docs/REVIEW.md:11-13`, `CLAUDE.md:46-51`
- **What happens:** UX-REDESIGN.md, which CLAUDE.md names as 'the vision and roadmap', states as a current 'De-risking fact' that 'the current data is disposable test data'. REVIEW.md says 'existing data is disposable test data — no backfill, no data preservation, schema may be recreated freely'. Production now holds 'Blackwater depths' (world 29): 49 nodes with DM notes, 40 R2 images, a Forge bible, a live share link and a hand-made world_backups snapshot.
- **Why it matters:** A future session reading the roadmap must not conclude it may drop or recreate tables.
- **Fix:** Add a dated banner to the top of docs/UX-REDESIGN.md and docs/REVIEW.md: 'Historical: as of Sept 2026 production holds a real campaign; migrations must be additive and preserve data.' Add one line to the CLAUDE.md Database section saying the same.
- **Repro:** grep -n -i disposable docs/*.md CLAUDE.md; compare with prod: SELECT count(*) FROM nodes WHERE world_id=29 AND dm_note<>'' → 49.
- **Evidence:** grep output lines UX-REDESIGN.md:7,83,181,199 and REVIEW.md:12,53,62; prod counts for world 29
- **Re-proved:** I read the lines myself. docs/UX-REDESIGN.md:7 is a '> **De-risking fact:** the current data is disposable test data'. Lines :83, :181 and :199 repeat it. docs/REVIEW.md:11-13 says 'existing data is **disposable test data** — no backfill, no data preservation, schema may be recreated freely', and :53 and :62 say the same. CLAUDE.md:10-11 does call UX-REDESIGN.md 'the vision and roadmap'. For the production side I did not use the DB tools, because my brief does not grant them. Instead I checked …

### C016 · The remove-interior and delete dialogs overstate what gets deleted (nested interiors survive as orphans)

Confusing · medium · effort s · found by `maps` (+2 other lanes)

- **Where:** Inspector ✕ beside '◎ Open interior ▸' → 'Remove the interior of …?' and 🗑 Delete… → DeleteImpact; server/routes/atlas.js:468-492
- **Files:** `server/routes/atlas.js:468-492`, `server/routes/atlas.js:526-540`, `client/src/pages/AtlasWorkspace.jsx:1555-1577`, `client/src/pages/AtlasWorkspace.jsx:1754-1771`
- **What happens:** For The Keep (interior 113, which holds Supply Chest with its own list interior 114), the remove dialog said 'The space inside (2 maps) is deleted. 5 nodes inside will be left unplaced'. The delete dialog said 'Its interior (2 maps) is deleted too. 5 nodes…'. After confirming the removal, only map 113 was deleted. Map 114 survived under 'Unplaced' in the tree, and its 2 nodes (rope, candles) stayed placed. Only 3 nodes became unplaced. The impact query walks the whole interior tree, but DELETE only removes the direct interior map (maps.owner_node_id cascades one level). nodes_inside also counts nodes that are placed elsewhere too.
- **Why it matters:** The dialog describes what actually happens: '1 map deleted; 3 nodes lose their spot; "Chest contents" stays (listed under Unplaced)'. Or the delete really cascades.
- **Fix:** In /nodes/:id/impact, count only the direct interior map, and only the nodes whose sole placements are on it. Return a separate count of nested interiors that will become orphans, and have DeleteImpact and the confirmInterior modal say those move to 'Unplaced'.
- **Repro:** /w/38/m/112 › select The Keep › ✕ next to Open interior. Read the dialog, click 'Remove interior', then GET /api/atlas/worlds/38/maps (114 still there) and GET /api/atlas/worlds/38/nodes (rope and candles placed:true).
- **Evidence:** t8 output: confirm text '(2 maps)… 5 nodes'; maps after: [[112…],[114,"Chest contents",341,null]]; nodes placed: rope true, candles true, Great Hall/Brakk/Supply Chest false. t18: delete dialog 'Its interior (2 maps) is deleted too. 5 nodes…'. shots/16-remove-interior-confirm.png, 17-after-remove-interior.png
- **Re-proved:** Code: GET /nodes/:id/impact (server/routes/atlas.js:468-492) walks the whole interior tree recursively and counts DISTINCT node_ids placed on any tree map, whether or not they are also placed elsewhere. DELETE /nodes/:id/interior (526-540) deletes only nodes.interior_map_id. Its placements cascade, but a nested interior's map survives because maps.owner_node_id points at the nested owner node (schema.sql:157), and that node is not deleted. DELETE /nodes/:id behaves the same way. Reproduced on m…
- **Also found as:** "Delete / Remove-interior dialogs count nested interiors that are not deleted, s…" (inspector); "The remove-interior and delete-node confirms count the whole nested interior tr…" (resilience)

### P025 · e2e suites exit 0 even when steps FAIL, the DM config example is incomplete, and cleanup deletes every outlined place

Product polish · medium · effort s · found by `docs-hygiene`

> **Second pass — see also:** player.mjs cannot pass on world 30 at all: it looks for the Party only on the root map and requires a party text over 20 characters. → **C102** in [WP-27](WP-27-tests-that-can-fail-and-docs-that-record-the-rul.md)

- **Where:** The skip is at e2e/dm.mjs:130: a single 'ok' step replaces the three player-side outline checks at :115/:121/:126. The cleanup loops are at dm.mjs:132-138 and :160-166.
- **Files:** `e2e/player.mjs:101`, `e2e/dm.mjs:131`, `e2e/dm.mjs:159`, `e2e/dm.config.example.json`, `e2e/README.md`
- **What happens:** Neither suite sets a non-zero exit code on FAIL steps (the only process.exit is player.mjs:10 for a missing token), so `npm run all` ('node player.mjs && node dm.mjs') always succeeds. dm.mjs reads cfg.shareToken (:111-117), but dm.config.example.json doesn't have that key. Without it, the four player-side outline checks are reported as 'ok … skipped' (:120). dm.mjs depends on world-30 data (canon 37, `/Session 3/` at :64), which README doesn't mention. Its cleanup (:131-135 and :159-163) DELETEs every node on the map that has an outline, not only the ones it drew. README's dm.mjs summary leaves out the reader-grip, outline and freehand checks, and doesn't say how to get the JWT or that it expires (JWT_EXPIRES_IN defaults to 24h). player.mjs:97's comment still mentions the removed 'party chip'.
- **Why it matters:** A follow-up session can trust a green run and set up the config from the example.
- **Fix:** End both scripts with `process.exitCode = fail ? 1 : 0`. Add shareToken (and a note that world 30's data is expected) to dm.config.example.json and README. Have the cleanup remember the node ids the suite created and delete only those. Document how to mint the throwaway JWT. Fix the player.mjs:97 comment.
- **Repro:** grep -n 'process.exit' e2e/*.mjs; compare the dm.mjs cfg.* keys (token,user,worldId,root,interior,baseUrl,shareToken) with dm.config.example.json.
- **Re-proved:** Confirmed: the only process.exit in e2e/ is player.mjs:10 (exit 2 when no token). Both suites log FAIL steps and end with a pass/fail JSON line (player.mjs:101, dm.mjs:172) without setting exitCode, so FAIL steps never make `npm run all` ('node player.mjs && node dm.mjs', e2e/package.json) fail. dm.mjs:111-117 reads cfg.shareToken, which dm.config.example.json doesn't have (its keys: baseUrl, token, user, worldId, root, interior). The local gitignored dm.config.json points at worldId 30 and has… _(partly — the corrected location is used above)_

### C051 · Undo is described as a 24-hour restore, but the UI offers it for 9 seconds and the server never enforces the age

Confusing · low · effort xs · found by `schema-data`

- **Where:** Flash bar ↩ Undo — AtlasWorkspace.jsx:142; atlas.js:28-34, :572-574; HANDOFF.md:45-46; schema.sql:311
- **Files:** `server/routes/atlas.js:28-34`, `server/routes/atlas.js:572-574`, `client/src/pages/AtlasWorkspace.jsx:140-151`, `HANDOFF.md:45-46`, `server/config/schema.sql:311-320`
- **What happens:** HANDOFF.md says deletes are 'restorable for 24 hours via the flash-bar Undo', but the flash with the Undo button disappears after 9000 ms and nothing else lists tombstones. POST /undo/:id does not check created_at, so a tombstone older than 24h is still restorable until the next delete anywhere triggers the global prune (atlas.js:29). tombstones.user_id is written but never read.
- **Why it matters:** One clear rule, either 'undo for a few seconds' or a real 24h restore list, and the server enforcing whatever the docs promise.
- **Fix:** Add `AND created_at > NOW() - INTERVAL '24 hours'` to the SELECT at atlas.js:573. Then either reword HANDOFF.md and schema.sql:311 to 'the flash-bar Undo (a few seconds)', or add a 'Recently deleted' list if the 24h window is meant to be usable.
- **Repro:** sed -n 142p client/src/pages/AtlasWorkspace.jsx (9000); sed -n 573p server/routes/atlas.js (no created_at filter); grep -n user_id server/routes/atlas.js → only the INSERT at :31.
- **Evidence:** code lines quoted
- **Re-proved:** AtlasWorkspace.jsx:142 has `setTimeout(() => setFlash(null), flash.undoId ? 9000 : 4000)`, and the only Undo UI is the flash button at :1673. grep for undoId, .undo( and /undo across client/src finds nothing else, and nothing lists tombstones. atlas.js:573 is `SELECT * FROM tombstones WHERE id=$1` with no created_at filter. The only prune is atlas.js:29 inside tombstone(), which runs on the next delete in any world. tombstones.user_id appears only in the INSERT at atlas.js:31, and the undo hand…

### C064 · Template clones write base64 art back into Postgres even with R2 on, and .env.example omits the R2 settings

Confusing · low · effort s · found by `schema-data`

- **Where:** POST /worlds/clone — server/routes/atlas.js:186-194; .env.example
- **Files:** `server/routes/atlas.js:186-195`, `.env.example`, `server/storage.js:18-29`, `docs/R2-SETUP.md`
- **What happens:** The sample template (27) and fixtures store their art as base64 in Postgres. Every clone copies those bytes into new Postgres rows, although production has R2 (49 R2 rows, 28 base64 rows, 16 of them in [audit] and template clones). The 50-world cap is the only brake ('storage-amplification backstop'). .env.example lists no R2_* variables, so a new deploy silently stores every upload in Postgres; the setup lives only in docs/R2-SETUP.md.
- **Why it matters:** New rows go to R2 when it is configured, and the env template names every variable the storage driver reads.
- **Fix:** In the clone, when r2Enabled and the source row is base64, decode it and putObject to worlds/<newId>/<fname>, storing storage_key and the R2 URL with base64_data NULL. Alternatively, migrate template 27's two images to R2 once. Add the five R2_* lines, commented, to .env.example with a pointer to docs/R2-SETUP.md.
- **Repro:** prod: SELECT world_id, count(*) FILTER (WHERE base64_data IS NOT NULL) FROM images GROUP BY 1 → worlds 27, 30, 33-39 all base64; grep -c R2_ .env.example → 0.
- **Evidence:** prod image breakdown per world; .env.example content
- **Re-proved:** Code: POST /worlds/clone copies base64_data into the new image row and points file_path at /api/images-base64/serve/<new name> whenever the source row is base64 (server/routes/atlas.js:186-194). The comment at :164-166 describes this, and the 50-world cap at :171-173 is labelled 'storage-amplification backstop'. Live, on my own clone (world 89, since deleted, DELETE returned 200): cloneWorld(...,27) produced 2 images with file paths /api/images-base64/serve/clone-*.svg (776 and 717 bytes, image…

### C065 · Production has an undocumented hand-made table 'world_backups' holding a full snapshot of Bennett's campaign

Confusing · low · effort xs · found by `schema-data`

- **Where:** production DB table world_backups (not in schema.sql, not referenced by any code or doc)
- **Files:** `server/config/schema.sql`, `CLAUDE.md:46-51`
- **What happens:** world_backups(id, world_id, label, taken_at, payload jsonb) has one row: world 29, label 'before the story-so-far reconciliation', taken 2026-09-26T04:49Z, 47 KB. Its payload keys are eras, maps, mind, facts, links, nodes, world and placements, with no backdrops or images. It has no FK, so it would outlive the world, and it contains the DM notes. `grep -rn world_backups` over the repo and `git log -S world_backups` both return nothing.
- **Why it matters:** Every table in production is either in schema.sql and documented, or deliberately temporary with a note saying when it can go.
- **Fix:** Ask Bennett whether the reconciliation it guarded is settled. If so, export the row to a file outside the DB and drop the table. If backups are wanted, add the table to schema.sql with a FK to worlds ON DELETE CASCADE and document it in CLAUDE.md. Never drop it without asking: it is the only copy of a pre-edit state of the real campaign.
- **Repro:** SELECT id, world_id, label, taken_at, pg_column_size(payload) FROM world_backups; grep -rn world_backups /home/bennett/repos/fantasy-map-timeline (no hits outside node_modules).
- **Evidence:** describe_table world_backups; SELECT on its one row; empty grep/git log -S
- **Re-proved:** `grep -rn world_backups` over the repo (excluding node_modules and .git) returns nothing, and `git log --all -S world_backups` is empty. The earlier session transcript has the exact DDL, run on prod at 2026-09-25T22:49Z: `CREATE TABLE IF NOT EXISTS world_backups (id SERIAL PRIMARY KEY, world_id INTEGER, label TEXT, taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, payload JSONB)`. It has no FK, so it would outlive the world. The INSERT built the payload from world, eras, maps, nodes (full rows, so …

### C078 · A cloned sample world keeps the template's 'Clone it, break it, learn it.' description when the user leaves the description blank

Confusing · low · effort xs · found by `dashboard`

- **Where:** The clone INSERT is at server/routes/atlas.js:179-183, and `src.description` is on line 182, outside the cited 176-180 and 167-180 ranges. Line 168 (`const { source_id, name } = req.body`) is correctly cited as the place to accept `description`. Dashboard.jsx:113-117 and :116 are correct.
- **Files:** `client/src/pages/Dashboard.jsx:113-117`, `server/routes/atlas.js:167-180`
- **What happens:** Every sample clone whose creator left the description empty shows 'A pocket world that shows every trick. Clone it, break it, learn it.' on its card and featured panel. The clone copies src.description, and the dashboard only PATCHes a description when one was typed. That PATCH's errors are also swallowed (.catch(() => {})), so a typed description can be lost silently.
- **Why it matters:** The user's (empty) description should win, and the template's marketing line should never land on their world.
- **Fix:** Pass the description to the clone endpoint (accept `description` in atlas.js:168 and use it instead of src.description, null when empty) and drop the follow-up patchWorld in Dashboard.jsx:116. Or at least always PATCH description (null when empty) and surface its error.
- **Repro:** Create a world with the sample box ticked and no description, then look at the card (see the cloned cards in lanes/dashboard/shots/01-dashboard.png).
- **Evidence:** Screenshot lanes/dashboard/shots/01-dashboard.png (all [audit] clones show the template blurb). run3b: sample clone with a typed description saved correctly ('Sample clone with my own description.')
- **Re-proved:** The behaviour is exactly as described. Dashboard.jsx:116 is `if (description) await atlasService.patchWorld(r.worldId, { description }).catch(() => {})`: an empty description is falsy, so nothing is PATCHed, and PATCH errors are swallowed. The clone INSERT in server/routes/atlas.js copies `src.description`. GET /api/atlas/templates returns id 27 with description 'A pocket world that shows every trick. Clone it, break it, learn it.' The finder's world 143 carries that text. My own clone (162, cl… _(partly — the corrected location is used above)_

### P048 · Undo is a single 9-second toast: a second delete replaces it, a reload loses it, and Ctrl+Z / Delete do nothing, though tombstones live 24 h

Product polish · low · effort m · found by `resilience`

- **Where:** Atlas › Edit › delete / remove toasts. AtlasWorkspace.jsx:140-152 (one `flash` slot, 9 s timer); server/routes/atlas.js:27-34 ('restorable for 24 hours')
- **Files:** `client/src/pages/AtlasWorkspace.jsx:140`, `client/src/pages/AtlasWorkspace.jsx:1670`, `server/routes/atlas.js:27`
- **What happens:** I deleted Del-A then Del-B. Only '"Del-B" is gone. ↩ Undo' remained, and nothing in the UI can restore Del-A. After a reload no undo is offered. Any other toast (a save error, 'placed here', 'Couldn't refresh the map') also replaces the undo toast. The toast doesn't pause on hover. Delete/Backspace on a selected pin and Ctrl+Z do nothing. The server keeps every tombstone for 24 hours, but only the most recent one is reachable, and only for 9 s.
- **Why it matters:** Recent destructive acts stay undoable while their tombstones exist: a small stack or 'Recently deleted' list, and Ctrl+Z for the last one.
- **Fix:** Keep an undo stack (array of {undoId, text}) separate from `flash`. Bind Ctrl/Cmd+Z (when not typing) to the newest entry. Pause the timer on hover. Add GET /api/atlas/worlds/:id/tombstones plus a 'Recently deleted' list (e.g. in Map ▾) so a delete can be undone after a reload within the 24 h window.
- **Repro:** lanes/resilience/s17.mjs steps 4–5 and s4.mjs (Delete/Backspace/Ctrl+Z).
- **Evidence:** s17: '4 after two deletes: toasts= 1 text= "\"Del-B\" is gone.↩ Undo"', '5 after reload: undo buttons = 0'; s4: 'Delete/Backspace: modal? 0 pin still there 1'
- **Re-proved:** Code: flash is one state slot (AtlasWorkspace.jsx:37). The timer effect (140-144) clears it after 9000 ms when undoId is set, else 4000 ms. Every setFlash call overwrites it, including track's error toast (134), refreshMap's 'Couldn't refresh the map' (167) and placeExisting's 'placed here' (315). doDeleteNode, removeFromMap and doRemoveInterior each replace it with their own undoId. The toast render (about 1670-1673) has no hover handlers. The only keydown handlers in the workspace are at 718-…

