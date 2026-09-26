# WP-14 · Images, backdrops and the Archive

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Make uploads up to the stated 10 MB work and explain any failure, and let the picker reach every image. Make the timed-backdrop and Archive controls do what they say.

**Do after:** [WP-02](WP-02-protect-the-live-campaign-data-undo-clone-and-ba.md)

**Notes:** api-contract-08: size the JSON limit for base64 overhead (a 10 MB file is about 13.4 MB of body) and let the error handler pass 400 and 413 through. images-02: add paging or search to the picker. In maps-03 and maps-05 the picker opens underneath the Backdrops over time modal, and Paint in it writes to the base backdrop. This comes after WP-02 because clone and image delete change there.

## Checklist

- [ ] **B019** · medium · xs · 'Backdrops over time' opens the image picker underneath itself, so 'Add art for a period' and 'Change…' look like they do nothing
- [ ] **B034** · medium · xs · ✦ Paint in the 'Add art for a period' picker overwrites the map's base backdrop instead of adding a period
- [ ] **B042** · medium · s · Global error handler turns body-parser 400/413 into 500s, so 7.5–10 MB image uploads fail with 'Something went wrong!'
- [ ] **B047** · medium · s · Workspace image picker only lists the 50 newest images: older art, even a map's current backdrop, cannot be picked
- [ ] **C003** · medium · s · The backdrop controls change the base art while a timed backdrop is what's on screen, so they seem to do nothing
- [ ] **C008** · medium · s · 'In use' is described wrongly: timed backdrops show as 'In use —' / '0 maps, 0 nodes', and deleting one silently removes the backdrop period
- [ ] **P010** · medium · s · Upload feedback hides what went wrong: failure reasons dropped, only the last rejection shown, progress bar is fake
- [ ] **P011** · medium · s · Load failures show false empty states: 'The archive awaits a world', 'The archive is empty', 'All art 0'
- [ ] **B064** · low · xs · Esc on the 'Delete this image?' dialog closes the lightbox behind it and leaves the dialog open
- [ ] **B065** · low · xs · Switching worlds with a folder selected fires a query using the old world's folder id, with no stale-response guard
- [ ] **B072** · low · xs · Image pins drawn from SVG art ignore 'Size on the map' and are capped at the width of their name label
- [ ] **B080** · low · s · Upload accepts non-images and over-long names: a text file saved as .png becomes a broken tile; a 300-char name 500s and orphans the R2 object
- [ ] **C028** · low · xs · A bad or foreign world id in /worlds/:id/images silently shows another world's Archive; the ?world= / last-used fallbacks are dead
- [ ] **C031** · low · xs · Duplicate folder names are allowed at the top level but refused inside a folder; the API also accepts a blank name
- [ ] **C053** · low · xs · The picker accepts SVGs and then rejects them with 'Invalid image data format', while the sample world's own maps are SVGs
- [ ] **P043** · low · s · Bulk upload, move and delete send one request per image into the shared 300-per-15-min limiter; a failed folder assignment on upload is swallowed
- [ ] **P044** · low · xs · Deleting a folder that has subfolders: the dialog warns but its Delete button stays live and fails with a 400
- [ ] **P045** · low · s · Folder rail and upload button are unreachable by keyboard; folder ⋯ menu items also switch folders
- [ ] **P052** · low · xs · Workspace picker uploads skip client validation and show jargon errors; its file input is never reset
- [ ] **P054** · low · s · The image picker doesn't say what it's for, which image is current, or what the thumbnails are called
- [ ] **P062** · low · xs · Image and folder routes 500 on non-numeric params, and search treats _ and % as wildcards
- [ ] **P093** · low · s · Images can't be renamed or captioned: pasted files are all 'image.png' forever; alt text is hidden but searched and can't be cleared

## Items

### B019 · 'Backdrops over time' opens the image picker underneath itself, so 'Add art for a period' and 'Change…' look like they do nothing

Broken · medium · effort xs · found by `maps`

- **Where:** ✏ Edit › Map ▾ (or inspector) › 🕓 Backdrops over time… › '＋ Add art for a period' / base row 'Change…'; AtlasWorkspace.jsx:1523-1530 vs 1604-1633
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1523`, `client/src/pages/AtlasWorkspace.jsx:1604`, `client/src/pages/AtlasWorkspace.jsx:1612`, `client/src/pages/AtlasWorkspace.jsx:1628`, `client/src/styles/atlas.scss:109`
- **What happens:** Clicking '＋ Add art for a period (starts at 12 days)' mounts the picker, but both modals share .modal-back z-index 50. The picker comes first in the DOM (line 1523) and the Backdrops modal after it (line 1604), so the picker renders behind. The screen just gets darker, with the picker's edges showing around the Backdrops dialog. document.elementFromPoint at the centre hit 'Backdrops over time'. The picker only becomes usable after the user closes the Backdrops dialog, which isn't obvious.
- **Why it matters:** The picker opens on top of the Backdrops dialog, which stays open behind it and shows the new period row when the picker closes.
- **Fix:** Move the {picker && <ImagePicker…/>} block after the bdsOpen modal in AtlasWorkspace.jsx, or give the picker's .modal-back a higher z-index (a .modal-back.top class at 55).
- **Repro:** /w/38/m/112 (timeline on) › inspector '🕓 Backdrops over time…' › '＋ Add art for a period…'. Screenshot: the picker is hidden behind.
- **Evidence:** lanes/maps/shots/07-bds-then-picker.png; t3 output: modal heads in DOM order ["Choose image","Backdrops over time"], topmost modal at center: Backdrops over time
- **Re-proved:** Code: in AtlasWorkspace.jsx, {picker && <ImagePicker/>} sits at 1523 and the bdsOpen modal at 1604. Both use .modal-back, which is position:fixed with z-index:50 (atlas.scss:109), so the one later in the DOM (Backdrops) paints on top. Base 'Change…' (1612) and '＋ Add art for a period' (1628) both call setPicker without closing bdsOpen. Live, world 72 /w/72/m/241: Map ▾ › Backdrops over time… › ＋ Add art for a period. Modal heads in DOM order were ["Choose image","Backdrops over time"], and elem…

### B034 · ✦ Paint in the 'Add art for a period' picker overwrites the map's base backdrop instead of adding a period

Broken · medium · effort xs · found by `maps` (+1 other lane)

- **Where:** Backdrops over time › ＋ Add art for a period › picker '✦ Paint this map a backdrop'; AtlasWorkspace.jsx:1526-1528
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1526-1528`, `server/routes/forge.js:204-220`
- **What happens:** When opened for a timed backdrop (picker.kind === 'backdrop-timed'), the picker still shows '✦ Paint this map a backdrop'. That button calls forgeService.mapBackdrop(map.id), whose route (server/routes/forge.js:204-220) runs UPDATE maps SET image_id: it replaces the base art and adds no map_backdrops row. A DM who wants art for 'after the flood' loses the base backdrop instead. I did not click it (paid AI call); I confirmed the label in the timed picker live and the behaviour from the code.
- **Why it matters:** Paint from the period picker adds a timed row starting at the lens moment, or the Paint button isn't offered there.
- **Fix:** Pass generate=null when picker.kind === 'backdrop-timed'. Or add a forge option such as {start_time} so the route inserts into map_backdrops instead of updating maps.image_id, and label it 'Paint art for this period'.
- **Repro:** /w/38/m/112 › 🕓 Backdrops over time… › ＋ Add art for a period › close the Backdrops dialog to reveal the picker. It shows '✦ Paint this map a backdrop'. Code path: AtlasWorkspace.jsx:1526-1528 → forgeService.mapBackdrop → forge.js:219.
- **Evidence:** t4 output: 'timed picker paint label: ✦ Paint this map a backdrop'; server/routes/forge.js:219 'UPDATE maps SET image_id=$1'
- **Re-proved:** Code: in AtlasWorkspace.jsx 1526-1528, generate is the node paint only when picker.kind === 'node'. Every other kind, including 'backdrop-timed', gets { label: 'Paint this map a backdrop', run: forgeService.mapBackdrop(map.id) }. forgeService.js:20 posts to /api/forge/maps/:id/backdrop, and forge.js:204-221 ends with 'UPDATE maps SET image_id=$1' at line 219. No map_backdrops insert, and nothing passes a start time. Live, world 72: the picker opened from '＋ Add art for a period' showed '✦ Paint…
- **Also found as:** "✦ Paint in 'Backdrops over time → ＋ Add art for a period' replaces the map's BA…" (confusing-code)

### B042 · Global error handler turns body-parser 400/413 into 500s, so 7.5–10 MB image uploads fail with 'Something went wrong!'

Broken · medium · effort s · found by `api-contract` (+4 other lanes)

- **Where:** Image manager / picker › Upload; server/server.js error middleware
- **Files:** `server/server.js:90-91`, `server/server.js:126-132`, `server/routes/image-base64.js:36-39`, `client/src/services/imageServiceBase64.js:98-108`
- **What happens:** The client allows files up to 10 MB, and the upload route checks 10 MB of decoded bytes. The body is base64 JSON, about 4/3 of the file size, so anything above roughly 7.5 MB exceeds express.json's 10mb limit. The error middleware ignores err.status and returns 500 {message:'Something went wrong!'}. Live: uploading an 8 MB PNG (10.67 MB JSON) to world 44 returned 500 'Something went wrong!', and that text is what the DM sees. Malformed JSON on any route (POST /api/atlas/links with body '{bad json') also returns 500 instead of 400. express.urlencoded (server.js:91) is registered, but no client sends form bodies.
- **Why it matters:** Oversized uploads get a 413 with a clear 'Image must be under N MB' message, and the client limit matches what the server can actually take. Malformed JSON gets a 400.
- **Fix:** In server.js's error handler, use err.status || err.statusCode (400 for type 'entity.parse.failed', 413 with a friendly message for 'entity.too.large'). Either give /api/images-base64/upload its own express.json({limit:'14mb'}) mounted before the global parser, or lower the client's validateImage cap to about 7 MB, and make the two agree. Drop express.urlencoded.
- **Repro:** node lanes/api-contract/bigupload.mjs (POST /api/images-base64/upload with 8 MB of data) → 500 {"message":"Something went wrong!","error":{}}
- **Evidence:** bigupload.mjs: 'json body MB 10.67' → '500 {"message":"Something went wrong!","error":{}}'
- **Re-proved:** server.js:90 sets express.json({limit:'10mb'}). The error middleware at 126-132 always returns 500 {message:'Something went wrong!'}. image-base64.js:36-39 checks 10485760 decoded bytes, and imageServiceBase64.validateImage (98-108) allows 10 MB. Live (verify/api-contract-b2/v2.mjs): an 8 MiB payload, 10.67 MiB of JSON, to /api/images-base64/upload on my clone returned 500 {"message":"Something went wrong!","error":{}}. POST /api/atlas/links with Content-Type application/json and body '{bad jso…
- **Also found as:** "Images of 7.5–10 MB pass both size checks, then fail with 'Something went wrong…" (server-dead); "Images between ~7.9 MB and 10 MB pass the client's 10 MB check but the server r…" (client-dead); "Images between about 7.5 and 10 MB fail with 'Something went wrong!' although t…" (maps); "Images of about 7.5–10 MB pass the '10MB' check, then fail with a 500 'Somethin…" (images)

### B047 · Workspace image picker only lists the 50 newest images: older art, even a map's current backdrop, cannot be picked

Broken · medium · effort s · found by `images` (+3 other lanes)

- **Where:** Names are not entirely absent: each thumbnail has title={originalName + in-use note} and alt={originalName} (AtlasWorkspace.jsx:2117-2118). They are only missing as visible text. Everything else is as stated.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2081`, `client/src/pages/AtlasWorkspace.jsx:2116-2128`, `client/src/services/imageServiceBase64.js:49`, `server/routes/images.js:14`
- **What happens:** World 106 had 62 images. The Archive showed 60 plus 'Show more (2 remain)'. The Choose image picker showed exactly 50 tiles, all of them the newest bulk uploads. nodeart.png, backdrop.png, small.png and 'The Keep, dry.svg' (the root map's own backdrop) were absent. The picker has no paging, search, folder filter or names, only unlabeled thumbnails. The API reports total 62 and hasMore true, and the picker ignores both.
- **Why it matters:** The picker should reach every image in the world. A Forge-heavy campaign passes 50 images quickly (up to 8 per batch).
- **Fix:** In ImagePicker (AtlasWorkspace.jsx:2062-2131), page through getImages({worldId, limit, offset}) using r.total and add a 'Show more' like ImageManager does. Add a search input (the server already supports ?search=) and the file name under each thumbnail. Alternatively, raise the picker's limit to a real maximum and add search.
- **Repro:** Have a world with more than 50 images. Open /w/<id>/m/<map>, Edit, select a pin › '＋ Add image'. Count the .pick-grid .pick tiles: 50. The oldest images are missing.
- **Evidence:** shots/12-picker.png; s4 output 'picker tiles: 50 has dry.svg: false has small.png: false has nodeart: false'; a2 output 'default-limit GET: returned 50 of total 62 hasMore true'
- **Re-proved:** ImagePicker (AtlasWorkspace.jsx:2080-2082) calls imageServiceBase64.getImages({ worldId }) once. The default is limit=50 (imageServiceBase64.js:49) and the server orders by created_at DESC (images.js:74). The picker has no offset, total or hasMore handling, and no search or folder filter. The picker is reached from node '＋ Add image' (:1485/:1973), map backdrop (:1139, :1439, :1612) and Backdrops over time (:1628). Live check: GET /api/images?world_id=106 (the finder's world, read only) returne… _(partly — the corrected location is used above)_
- **Also found as:** "The Atlas image picker shows only the 50 newest images of the world, with no 's…" (client-dead); "The image picker only ever shows the 50 newest images of a world" (maps); "Atlas image picker loads only the newest 50 images, with no paging or search" (api-contract)

### C003 · The backdrop controls change the base art while a timed backdrop is what's on screen, so they seem to do nothing

Confusing · medium · effort s · found by `maps`

- **Where:** ✏ Edit › inspector 'This space' › Backdrop; Map ▾ › Change/Set/Remove the backdrop; AtlasWorkspace.jsx:1139-1145, 1436-1441
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1139-1145`, `client/src/pages/AtlasWorkspace.jsx:1436-1441`, `client/src/pages/AtlasWorkspace.jsx:827-835`, `client/src/pages/AtlasWorkspace.jsx:433-434`
- **What happens:** World 38's root has base art plus a timed backdrop from day 9 onward, and the lens is at day 12. The inspector thumbnail shows the timed art (activeBackdropUrl), but the button under it, '🖼 Change the backdrop…', changes the BASE (maps.image_id). I uploaded a new PNG with it: the base changed on the server, the canvas and the thumbnail stayed the same, and the only feedback was '✓ Saved'. 'Remove the backdrop' then cleared the base while the timed art stayed on screen, and the menu and inspector switched to '🖼 Set a backdrop image…' with art still showing. The picker's 'Remove current image' removes the base too. The Maps tree thumbnail also uses the base only.
- **Why it matters:** The backdrop section says which art is showing and why (for example 'Showing: period art from day 9 — base art hidden until then'), and offers 'Change this period's art' and 'Change base art' separately. Or it warns when the base being changed is currently hidden.
- **Fix:** In the space panel (AtlasWorkspace.jsx:1433-1446), compute which timed row is active (the same logic as activeBackdropUrl at 827-835). When a timed row wins, label the thumbnail 'Period art (from N)' and add a line like 'Base art shows outside every period'. Give Map ▾ buttons and the picker's hasCurrent the same distinction.
- **Repro:** /w/38/m/112 at day 12 › inspector '🖼 Change the backdrop…' › upload a PNG. The map doesn't change, and GET /api/atlas/maps/112 shows the new base URL. Then Map ▾ › 'Remove the backdrop': the art stays and the label reads 'Set a backdrop image…'.
- **Evidence:** t2 output: after upload base = …img-1790394394800….png but 'plane after (at now=canon 12): …clone-b322d9dda97a33f6fa.svg'; t5 output: after remove base null, plane still the timed svg, menu ['🖼 Set a backdrop image…',…]; lanes/maps/shots/10-base-removed-timed-visible.png
- **Re-proved:** Code: the inspector thumbnail uses activeBackdropUrl (AtlasWorkspace.jsx:1436-1438, computed at 826-835, where the timed row wins). The button under it (1439-1441) and Map ▾ 'Change/Set the backdrop' (1139-1141) open picker kind 'backdrop' → handlePick → setBackdrop (433-434) → PATCH maps image_id, which is the base. Map ▾ 'Remove the backdrop' (1143-1145) is setBackdrop(null). Both labels depend only on map.backdropUrl, which is the base, and the picker's 'Remove current image' is onPick(null)…

### C008 · 'In use' is described wrongly: timed backdrops show as 'In use —' / '0 maps, 0 nodes', and deleting one silently removes the backdrop period

Confusing · medium · effort s · found by `images` (+2 other lanes)

- **Where:** Archive › tile ◈ tooltip, Lightbox use line, Delete confirmation; client/src/pages/ImageManager.jsx:364, :581-587, :546-556
- **Files:** `client/src/pages/ImageManager.jsx:12-14`, `client/src/pages/ImageManager.jsx:364`, `client/src/pages/ImageManager.jsx:581-587`, `client/src/pages/ImageManager.jsx:551-557`, `server/routes/images.js:65-72`, `server/config/schema.sql:251`
- **What happens:** 'The Keep, flooded.svg' has usage {maps:0,nodes:0,backdrops:1,anchor:0} (a timed backdrop from day 9). Its tile tooltip read 'Placed in your world — 0 maps, 0 nodes'. The Lightbox line read '◈In use —' with nothing after it: only usage.maps and usage.nodes are phrased, while backdrops and the Forge style anchor are counted but never named. The separator hack `.replace('maps art', …)` only covers plural maps, so one map plus one node reads 'backdrop of 1 map art of 1 node'. Single-image delete confirm: 'One of them is placed in your world — maps and nodes using it will lose their art.' After deleting, GET /api/atlas/maps/344 returned backdrops: []. map_backdrops.image_id is ON DELETE CASCADE, so the whole day-9 period entry is gone, not just its art. No warning names which map or node, and there is no undo.
- **Why it matters:** The use line and warning should name every kind of use: base backdrop, timed backdrop (with period), node art and Forge style anchor. For a single image, the warning should read 'This image is used…'. It should also say that the timed backdrop period itself will be removed.
- **Fix:** Replace useLine and the tile title with one describeUse(usage) helper covering maps/backdrops/nodes/anchor with correct singulars, and share it with AtlasWorkspace.jsx:2076, which duplicates usesOf. In ConfirmDelete, use singular wording for one image and state 'removes N timed backdrop period(s)'. Optionally have GET /api/images return the map and node titles so the warning can name them.
- **Repro:** Clone world 27 › Archive › click 'The Keep, flooded.svg' ('In use —') › Delete (read the text) › Delete. Then GET /api/atlas/maps/<root> shows backdrops: [].
- **Evidence:** shots/02-lightbox-flooded.png; shots/15-confirm-delete-timed-backdrop.png; s1 'tiles: … The Keep, flooded.svg | inuse=Placed in your world — 0 maps, 0 nodes'; s5 'flooded lbuse: "◈In use —"', 'API map backdropUrl: null backdrops: []'
- **Re-proved:** In code, the tile tooltip (ImageManager.jsx:364) phrases only usage.maps and usage.nodes. The Lightbox useLine (:581-587) phrases only maps and nodes, and its .replace('maps art','maps · art') only matches the plural. With 1 map and 1 node it reads 'In use — backdrop of 1 map art of 1 node'. ConfirmDelete (:546-557) says 'One of them is placed in your world — maps and nodes using it will lose their art' even when deleting a single image. schema.sql:251 sets map_backdrops.image_id ON DELETE CASC…
- **Also found as:** "The Archive's 'in use' text ignores timed backdrops and the style anchor, and 1…" (client-dead); "The Archive's in-use text ignores backdrops and the style anchor: ‘In use —’ fo…" (copy)

### P010 · Upload feedback hides what went wrong: failure reasons dropped, only the last rejection shown, progress bar is fake

Product polish · medium · effort s · found by `images`

- **Where:** Archive › ⬆ Add art / drag-drop / paste; client/src/pages/ImageManager.jsx:118-145
- **Files:** `client/src/pages/ImageManager.jsx:120-124`, `client/src/pages/ImageManager.jsx:132-137`, `client/src/pages/ImageManager.jsx:141-143`, `client/src/services/imageServiceBase64.js:16-38`
- **What happens:** (1) The per-file catch only counts failures (`catch (e) { fails += 1 }`), so the server's message never reaches the user. A 300-character filename gave 'Added 0 of 1 image — 1 failed' while the server said 'Upload failed'. (2) Choosing vector.svg and huge-11mb.png together flashed only 'huge-11mb.png: File size must be less than 10MB': each rejection's setFlash overwrites the previous one. (3) In a mixed batch, the SVG rejection flash was replaced by '1 new piece in the archive' when the batch ended, with no mention of the skipped file. (4) The progress bar steps through hard-coded 10/30/60/100% (imageServiceBase64.js:19-38). The service comment calls this 'progress tracking'. A large file sits at 60% for the whole transfer.
- **Why it matters:** The summary should list the files that were skipped or failed and why. Progress should reflect the real upload, or be an indeterminate spinner.
- **Fix:** Collect rejections and per-file errors (e.message) into a list. Show them in the final flash or a small results panel ('2 added · vector.svg: SVG not supported · big.png: too large'). Use axios onUploadProgress in uploadImage instead of the fixed stages, and fix the comment.
- **Repro:** Archive › ⬆ Add art › select vector.svg + huge-11mb.png. Only one error flash appears. Then select vector.svg + a small PNG. The final flash says '1 new piece in the archive' and nothing else.
- **Evidence:** s10 'two rejected files -> flashes seen: ["huge-11mb.png: File size must be less than 10MB"]'; s2 'mixed flashes: ["vector.svg: File must be an image (JPEG, PNG, GIF, WebP)","1 new piece in the archive"]'; s2 'long name flashes: ["Added 0 of 1 image — 1 failed"]'
- **Re-proved:** ImageManager.jsx:120-124 calls setFlash once per rejected file, so each flash overwrites the one before. :135-137 is `catch (e) { fails += 1 }` and drops e.message. :141-143 then overwrites any rejection flash with the batch summary. imageServiceBase64.js:16 carries the comment 'Upload image as base64 with progress tracking', and :19-38 calls onProgress(10/30/60/100) at fixed points, with 60 set before the http.post that does the whole transfer. Live, in the Archive of my clone world 127: I set…

### P011 · Load failures show false empty states: 'The archive awaits a world', 'The archive is empty', 'All art 0'

Product polish · medium · effort s · found by `images`

- **Where:** Archive page on /api/worlds, /api/image-folders or /api/images failure; workspace picker on /api/images failure
- **Files:** `client/src/pages/ImageManager.jsx:66`, `client/src/pages/ImageManager.jsx:253-265`, `client/src/pages/ImageManager.jsx:76-80`, `client/src/pages/ImageManager.jsx:95-97`, `client/src/pages/ImageManager.jsx:335-349`, `client/src/pages/AtlasWorkspace.jsx:2081`, `client/src/pages/AtlasWorkspace.jsx:2127`
- **What happens:** Failures were simulated with page.route returning 500. /api/worlds failing rendered 'The archive awaits a world — Art lives inside a world. Found one first…' (tells a DM with worlds they have none). The 'Could not load your worlds' flash is set but never rendered, because that early return has no flash element. /api/image-folders failing was silent: the rail showed 'All art 0 / Unsorted 0' and no folders, while 60 tiles displayed. /api/images failing rendered 'The archive is empty — Drop images anywhere…' plus a 3.5 s 'Server error' flash. In the picker, a failed load is swallowed (.catch(() => {})) and shows 'No images in this world yet — upload one above.'
- **Why it matters:** A failed load should say it failed and offer Retry, not say the archive is empty or the world doesn't exist.
- **Fix:** Add a loadError state in ImageManager (and ImagePicker) that renders an error block with a Retry button instead of the empty state. Render {flash} in the early-return branch. Stop swallowing the folder-load error at line 80.
- **Repro:** In Playwright, page.route(/\/api\/images\/?\?/, r => r.fulfill({status:500})) › open /worlds/<id>/images: the 'archive is empty' state appears. Repeat with /api/worlds and /api/image-folders.
- **Evidence:** s7 output: 'worlds 500 -> page text: …The archive awaits a world…', 'folders 500 -> rail: "❖\nAll art\n0\n◌\nUnsorted\n0\n＋ New folder" flash: (none)', 'images 500 -> gallery: "The archive is empty…" flash: Server error'; shots/19-worlds-fail.png, 20-folders-fail.png, 21-images-fail.png
- **Re-proved:** Code: ImageManager.jsx:66 catches the worlds failure by setting worlds=[] and a flash. The :253-265 early return renders the 'archive awaits a world' voidstate and has no {flash} element (flash renders only at :467). loadFolders at :80 is .catch(() => {}). The loadImages catch at :95-97 sets a flash, but images stays [], so :345 shows 'The archive is empty'. In AtlasWorkspace.jsx the picker load at :2081 is .catch(() => {}) and :2127 shows 'No images in this world yet — upload one above.' Repro…

### B064 · Esc on the 'Delete this image?' dialog closes the lightbox behind it and leaves the dialog open

Broken · low · effort xs · found by `images`

> **Second pass — see also:** Esc on the Archive's bulk 'Delete N images?' confirm runs the select-mode listener instead: it clears the selection and leaves the confirm armed. The Lightbox `blocked` prop does not reach this listener. → **B127** in [WP-28](WP-28-one-click-does-one-thing-and-the-map-s-cues-tell.md)

- **Where:** Archive › click a tile (lightbox) › Delete › press Esc; client/src/pages/ImageManager.jsx:506-511 and :567-575
- **Files:** `client/src/pages/ImageManager.jsx:448-455`, `client/src/pages/ImageManager.jsx:506-511`, `client/src/pages/ImageManager.jsx:567-575`
- **What happens:** With the confirm modal open over the lightbox, pressing Escape removed the lightbox (count 0) and left the confirm open (count 1). Reproduced on two runs. Both components listen for keydown on document. The Lightbox listener runs first; React flushes its setBox(-1) re-render between listeners, which re-registers the Modal's listener (its onClose prop is a fresh inline arrow each render). The re-added listener does not receive the current event, so the Modal's Esc never fires.
- **Why it matters:** Esc should close only the topmost layer (the confirm) and leave the lightbox open.
- **Fix:** Ignore Esc and the arrow keys in Lightbox while a confirm is open: pass a `blocked={!!confirmDel}` prop and return early. Alternatively, register the Modal's keydown in the capture phase and call stopImmediatePropagation. Also memoise the onClose callbacks so the listener is not re-registered every render.
- **Repro:** Archive › click any tile › Delete › press Esc. The dialog stays. The image viewer behind it disappears.
- **Evidence:** s5 output 'after Esc: confirm open= 1 lightbox open= 0' (twice); shots/15b-after-esc.png
- **Re-proved:** Code: Lightbox (ImageManager.jsx:566-575) and Modal (:506-511) both add keydown listeners on document. Lightbox mounts first, so its listener runs first and calls setBox(-1). ConfirmDelete gets a fresh inline onClose each render (:452), so Modal's effect deps change, and its listener is removed and re-added mid-dispatch (React 18.3.1 createRoot flushes sync-lane passive effects). Reproduced on my own clone (world 129, since deleted): Archive › first tile › Delete › Escape. Before Esc: lightbox=…

### B065 · Switching worlds with a folder selected fires a query using the old world's folder id, with no stale-response guard

Broken · low · effort xs · found by `images`

- **Where:** Archive header › world select while a folder is selected; client/src/pages/ImageManager.jsx:81, :85-99
- **Files:** `client/src/pages/ImageManager.jsx:81`, `client/src/pages/ImageManager.jsx:85-99`
- **What happens:** With folder 'Regions' (id 26, world 106) selected, switching the header select to world 117 fired two requests at once: '/api/images/?world_id=117&folder_id=26&limit=60&offset=0' (world 117 has no folder 26) and '/api/images/?world_id=117&limit=60&offset=0'. loadImages has no request sequencing, so whichever response lands last sets the grid. This run ended correctly (59 tiles, All art highlighted). Search typing has the same unguarded pattern.
- **Why it matters:** Changing worlds should reset the folder before querying, and a late response should never overwrite a newer view.
- **Fix:** Key the page on the world (<ImageManager key={worldId}/>) or reset folderSel in the same state update as setWorld. Give loadImages a request counter or AbortController and ignore stale responses.
- **Repro:** Archive › select a folder › switch world in the header select › watch the network panel: two /api/images calls, one with the previous world's folder_id.
- **Evidence:** s6 'requests fired: ["/api/image-folders/?world_id=117","/api/images/?world_id=117&folder_id=26&limit=60&offset=0","/api/images/?world_id=117&limit=60&offset=0",…]'
- **Re-proved:** Code: ImageManager.jsx:81 calls setFolderSel('all') inside a [world?.id] effect. In the same commit, the :99 effect calls loadImages(true), whose useCallback (:85-98) still closes over the old folderSel. loadImages has no request sequencing or abort. Live on my clone: I selected Regions (folder 32, world 130) and switched the header select to world 132. It fired '/api/images/?world_id=132&folder_id=32…' and '/api/images/?world_id=132&limit=60…' at the same time. I ran this twice. In run 0 the s…

### B072 · Image pins drawn from SVG art ignore 'Size on the map' and are capped at the width of their name label

Broken · low · effort xs · found by `canvas`

- **Where:** Inspector › Image › 'Pin: the image' › 'Size on the map' slider; client/src/pages/AtlasWorkspace.jsx:1069-1070
- **Files:** `client/src/pages/AtlasWorkspace.jsx:1069-1070`, `client/src/styles/atlas.scss:467-468`
- **What happens:** The sample world's art is SVG with only a viewBox (no width/height). With title 'Your first node' the art renders 32/64/94/94px wide at slider 32/64/96/144. With title 'Inn' it's 34×22px at both 64 and 144. pin_size=144 is saved (GET confirms) but has no effect. The image fills only as wide as the label because the pin is a shrink-to-fit column flexbox and the <img> has only max-width/max-height. A square 1024px raster swapped in at runtime grew to 144 correctly.
- **Why it matters:** The slider sets the art size whatever the image format or title length.
- **Fix:** Give .iart explicit dimensions: style={{ width: size, height: size, objectFit: 'contain' }}, or width:size with height:auto plus max-height:size and object-fit:contain. Keep .ilbl max-width at 120px.
- **Repro:** Give a node image 264 ('The Keep, dry.svg'), rename it 'Inn', choose 'Pin: the image' and drag 'Size on the map' to max. The art stays 34px wide.
- **Evidence:** s12.mjs sizes (layout [32,20],[64,40],[94,59],[94,59]); s13.mjs 'Inn @144 {img:[34,22]}'; s15.mjs raster PNG '{img:[144,144]}'; lanes/canvas/shots/82-inn-144.png
- **Re-proved:** AtlasWorkspace.jsx:1069-1070 renders `<img className="iart" style={{ maxWidth: pinSize||64, maxHeight: pinSize||64 }}>` with no width or height. atlas.scss:467-468 makes .pin.ipin a column flexbox with max-width:none and gives .iart only max-width/max-height; .ilbl is capped at 120px. On my clone I gave node 733 backdrop image 345 (an SVG with only viewBox='0 0 1600 1000', no width/height) and set pin 'image'. As 'Your first node', pin_size 32/64/96/144 rendered the art at 32×20, 64×40, 94×59 a…

### B080 · Upload accepts non-images and over-long names: a text file saved as .png becomes a broken tile; a 300-char name 500s and orphans the R2 object

Broken · low · effort s · found by `images`

- **Where:** server/routes/image-base64.js:28-95 (POST /api/images-base64/upload)
- **Files:** `server/routes/image-base64.js:28`, `server/routes/image-base64.js:51-66`, `server/routes/image-base64.js:95-98`, `server/config/schema.sql:61`
- **What happens:** notanimage.png (plain text) passed both the client and the server: only the data-URL prefix is checked, never the bytes. It was stored on R2 as image/png (id 432), and its tile renders a broken-image icon with naturalWidth 0. A file named 'L'+'o'×290+'ng.png' gave 500 {"message":"Upload failed"}: original_name is VARCHAR(255). putObject to R2 runs (lines 51-54) before the INSERT (line 59), and the catch does not delete the object, so each such failure leaves an unreferenced file in the bucket.
- **Why it matters:** Reject files whose bytes aren't PNG/JPEG/GIF/WebP with a clear message. Truncate or reject over-long names before storing anything. Never leave R2 objects behind a failed insert.
- **Fix:** In image-base64.js, check magic bytes (89 50 4E 47 / FF D8 FF / 47 49 46 38 / RIFF…WEBP) after decoding. Slice originalName to 255. Wrap the INSERT so that on error it calls deleteObject(storageKey) before responding.
- **Repro:** Archive › ⬆ Add art › a text file renamed x.png → '1 new piece in the archive' and a broken tile. API: POST /api/images-base64/upload with a 300-char originalName → 500.
- **Evidence:** s2 'fake png naturalWidth: 0x0 complete=true'; shots/06-after-uploads.png (broken tile); a1 'longname: 500 {"message":"Upload failed"}'
- **Re-proved:** Code: the server check is the data-URL prefix regex only (image-base64.js:28), with no magic-byte check. The client validateImage (imageServiceBase64.js:98-115) checks only file.type, which the browser derives from the extension. putObject runs at :51-56 before the INSERT (:58-74), and the catch at :95-98 never deletes the object. original_name has been VARCHAR(255) since the initial commit 12b043b, with no ALTER in schema.sql. API test on my clone: POST upload of 'this is not an image\n' as da…

### C028 · A bad or foreign world id in /worlds/:id/images silently shows another world's Archive; the ?world= / last-used fallbacks are dead

Confusing · low · effort xs · found by `images`

- **Where:** /worlds/999999/images; client/src/pages/ImageManager.jsx:52-68
- **Files:** `client/src/pages/ImageManager.jsx:52`, `client/src/pages/ImageManager.jsx:58-62`, `client/src/App.jsx:89-96`
- **What happens:** /worlds/999999/images redirected without any notice to /worlds/111/images, the first world in the list (here another lane's '[audit] resilience'). Uploads made there would land in that world. The comment promises '/worlds/:id/images → ?world= → last used → first', but the only route always supplies :worldId (App.jsx:90), so searchParams.get('world') and worldService.getCurrentWorld() are never consulted.
- **Why it matters:** A stale or deleted world link should say 'World not found' with a link to the dashboard, not switch worlds quietly.
- **Fix:** When paramWorldId matches none of the user's worlds, render a not-found state with a link to /dashboard. Delete the ?world= and getCurrentWorld branches (and the useSearchParams import) and update the comment.
- **Repro:** Open https://timeline-map-production.up.railway.app/worlds/999999/images: the URL becomes another world's id.
- **Evidence:** s6 output 'bad id -> url: https://timeline-map-production.up.railway.app/worlds/111/images heading world: [audit] resilience'
- **Re-proved:** Code: ImageManager.jsx:58 is `paramWorldId || searchParams.get('world') || worldService.getCurrentWorld()?.id`. :59 falls back to ws[0] when no world matches. :61 then navigates with replace and shows no notice. App.jsx has exactly one ImageManager route, /worlds/:worldId/images (line 90), so paramWorldId is always set and the ?world= and getCurrentWorld branches never run. Commit ce51e24 ('drop duplicate /images route') removed the route that used to supply them. Live: /worlds/999999/images be…

### C031 · Duplicate folder names are allowed at the top level but refused inside a folder; the API also accepts a blank name

Confusing · low · effort xs · found by `images` (+1 other lane)

- **Where:** Archive › ＋ New folder / Rename; server/config/schema.sql:54, server/routes/imageFolders.js:74,159
- **Files:** `server/config/schema.sql:54`, `server/routes/imageFolders.js:74`, `server/routes/imageFolders.js:105`, `server/routes/imageFolders.js:152-159`
- **What happens:** Creating 'Maps' twice at the top level succeeded (folders 23 and 25), and both then appear as identical '▸ Maps' entries in the File under menu and the Lightbox select. Creating 'Regions' twice inside Maps was refused with 'A folder with this name already exists in this location'. UNIQUE(name, world_id, parent_id) treats NULL parent_id values as distinct. PUT /api/image-folders/25 {name:' '} returned 200 with name '' (a blank-named folder now sits in the rail). POST with a whitespace name passes the `!name` check the same way.
- **Why it matters:** The same name rule at every level, and no blank names.
- **Fix:** Replace the constraint with a unique index on (world_id, COALESCE(parent_id,0), lower(name)), or check it in POST/PUT. In POST and PUT, reject names that are empty after trim with a 400.
- **Repro:** Archive › ＋ New folder 'Maps' › ＋ New folder 'Maps' → two identical rows. API: PUT /api/image-folders/<id> {"name":" "} → 200, name ''.
- **Evidence:** s1 folders API: [{id:23,name:'Maps',parentId:null},{id:25,name:'Maps',parentId:null},…]; shots/09-bulk-move-menu.png (two '▸ Maps'); API probe 'rename to spaces: 200 {"id":25,"name":""…}'
- **Re-proved:** Code: schema.sql:54 is UNIQUE(name, world_id, parent_id). In Postgres NULL parent_id values count as distinct, and no migration or NULLS NOT DISTINCT exists (grep over server/). imageFolders.js:74 checks only `!name`, so ' ' is truthy, and :105 inserts name.trim(), which is ''. PUT :154/:159 does COALESCE($1,name) with name?.trim(), and '' is not NULL, so the name becomes blank. Reproduced on my own clone (world 130, since deleted): POST 'Maps' at top level twice → 200 (ids 30 and 31). POST 'Re…
- **Also found as:** "Two top-level image folders can have the same name: the folder UNIQUE constrain…" (schema-data)

### C053 · The picker accepts SVGs and then rejects them with 'Invalid image data format', while the sample world's own maps are SVGs

Confusing · low · effort xs · found by `maps`

- **Where:** Image picker › ⬆ Upload new image; AtlasWorkspace.jsx:2113; server/routes/image-base64.js:28-31
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2113`, `server/routes/image-base64.js:28-31`
- **What happens:** The file input is accept="image/*", so SVG, HEIC, BMP and TIFF can all be chosen. Uploading a tiny .svg returned 400, and the picker showed 'Invalid image data format'. The template world's backdrops are 'The Keep, dry.svg' and 'The Keep, flooded.svg' (image/svg+xml, copied by clone), so SVG looks supported.
- **Why it matters:** Only accepted types can be chosen, and a refusal says why in plain words (for example 'Use PNG, JPG, GIF or WebP').
- **Fix:** Set accept="image/png,image/jpeg,image/gif,image/webp" on the picker input. Change the server message to 'Only PNG, JPG, GIF or WebP images can be uploaded'. Or support SVG deliberately, after sanitising it.
- **Repro:** /w/38/m/113 › Set a backdrop image… › upload a .svg file.
- **Evidence:** lanes/maps/shots/29-svg-upload.png; t15 output '[svg] … 400 POST /api/images-base64/upload'; imgs.mjs: world 38 images 274/275 image/svg+xml
- **Re-proved:** AtlasWorkspace.jsx:2113 is <input type="file" accept="image/*">. image-base64.js:28-31 accepts only jpeg|jpg|png|gif|webp data URLs and otherwise returns 400 'Invalid image data format'. Repro: an API upload of the finder's tiny.svg as data:image/svg+xml to my clone returned 400 {"message":"Invalid image data format"}. GET /api/images?world_id=75 on my fresh clone of 27 listed [356,'The Keep, dry.svg','image/svg+xml'] and [357,'The Keep, flooded.svg','image/svg+xml'], so the template's own back…

### P043 · Bulk upload, move and delete send one request per image into the shared 300-per-15-min limiter; a failed folder assignment on upload is swallowed

Product polish · low · effort s · found by `images`

- **Where:** Archive › bulk bar File under / Delete, uploads into a selected folder; client/src/pages/ImageManager.jsx:129-139, :181-209
- **Files:** `client/src/pages/ImageManager.jsx:134`, `client/src/pages/ImageManager.jsx:183-185`, `client/src/pages/ImageManager.jsx:198-200`, `server/server.js:72-77`, `server/routes/image-base64.js:11`
- **What happens:** Every image in a batch is a separate sequential request: upload, then, when a folder is selected, a second PUT /api/images/:id to set folder_id, because the upload endpoint ignores folder_id. The PUT's failure is discarded (`.catch(() => {})`), so the image silently lands in Unsorted. /api/images* sits in the general 300-requests-per-15-min bucket, so uploading 150 maps into a folder (300 requests) runs into the limiter partway through, reported only as 'N failed'. Observed cost: the 15-file upload made 15 uploads plus 2 reloads.
- **Why it matters:** One request per file at most, folder assignment in the same call, and bulk move/delete in one call.
- **Fix:** Accept folder_id in POST /api/images-base64/upload (validate it belongs to world_id). Add PUT /api/images/bulk {ids, folder_id} and DELETE /api/images/bulk {ids}. Consider giving /api/images* its own limiter bucket like /api/atlas.
- **Repro:** Archive › select a folder › ⬆ Add art with many files: 2 requests per file in the network panel.
- **Evidence:** code at cited lines; s2 folder upload stored folder_id=23 via the follow-up PUT
- **Re-proved:** Code: ImageManager.jsx:129-139 uploads files one at a time. At :134, when a folder is selected it sends a second PUT /api/images/:id with `.catch(() => {})`, so a failed assignment is silent and the success flash still shows. moveImages :183-185 and deleteImages :198-200 loop one request per id. image-base64.js:11 destructures only imageData, originalName, world_id, alt_text, tags, so folder_id is ignored and the INSERT at :58-60 has no folder_id column. server.js:72-77 applies the 300-per-15-m…

### P044 · Deleting a folder that has subfolders: the dialog warns but its Delete button stays live and fails with a 400

Product polish · low · effort xs · found by `images`

- **Where:** Archive › folder ⋯ › Delete… (on a folder with a subfolder); client/src/pages/ImageManager.jsx:456-465
- **Files:** `client/src/pages/ImageManager.jsx:459-462`, `server/routes/imageFolders.js:203-211`
- **What happens:** The modal read 'The folder goes; its 2 images stay … It has subfolders — delete those first.' with 'Delete folder' enabled (isDisabled=false). Clicking it gave 400 DELETE /api/image-folders/23 and the flash 'Cannot delete folder that contains subfolders. Delete subfolders first.' This is a dead-end button.
- **Why it matters:** Disable the button, or offer 'Delete with its subfolders (images go to Unsorted)'.
- **Fix:** In the confirmFolderDel modal, set disabled={confirmFolderDel.children?.length > 0} on the Delete button, or implement a recursive delete server-side: the FK is already ON DELETE CASCADE for parent_id, so drop the children check at imageFolders.js:203-211 and delete the subtree.
- **Repro:** Archive › ＋ New folder 'Maps' › ⋯ › New subfolder 'Regions' › Maps ⋯ › Delete… › Delete folder → error flash.
- **Evidence:** s3 'parent folder delete modal: …It has subfolders — delete those first.\n\nKeep it\nDelete folder" delete btn disabled: false', 'parent delete flashes: ["Cannot delete folder that contains subfolders. Delete subfolders first."]'; shots/11-parent-folder-delete.png
- **Re-proved:** Code: the Delete folder button at ImageManager.jsx:462 has no disabled prop, even though :459 warns 'It has subfolders — delete those first.' server/routes/imageFolders.js:203-211 returns 400 when children exist. schema.sql:48 has parent_id … ON DELETE CASCADE and :71 has images.folder_id ON DELETE SET NULL, as the fix says. Reproduced on my clone: created 'Maps' with subfolder 'Regions' through the API, then Maps ⋯ › Delete…. The modal read 'The folder goes; its 0 images stay… It has subfolder…

### P045 · Folder rail and upload button are unreachable by keyboard; folder ⋯ menu items also switch folders

Product polish · low · effort s · found by `images`

- **Where:** Archive › left rail and ⬆ Add art; client/src/pages/ImageManager.jsx:477-495, :301-304; AtlasWorkspace.jsx:2111-2114
- **Files:** `client/src/pages/ImageManager.jsx:477-482`, `client/src/pages/ImageManager.jsx:487-493`, `client/src/pages/ImageManager.jsx:301-304`, `client/src/pages/AtlasWorkspace.jsx:2111-2114`
- **What happens:** Folder rows are <div onClick> with tabIndex -1, and the caret is a <span onClick>, so keyboard users cannot open a folder. Tabbing from the search box went 'Open the Atlas ▸ → Select → All art → Unsorted → ⋯ → ⋯ → ⋯ → ＋ New folder → tiles' and skipped '⬆ Add art' entirely: it is a <label> around a hidden input. The picker's '⬆ Upload new image' is built the same way. The ⋯ buttons have no title or aria-label. Clicking Rename, New subfolder or Delete… in a ⋯ menu also selects that folder, because the click bubbles to the row's onClick: after 'New subfolder' on Maps, the gallery had switched to Maps.
- **Why it matters:** Folder rows, the caret and the upload control should be focusable buttons. ⋯ should carry a label. Menu actions shouldn't navigate.
- **Fix:** Render folder rows as <button> (or role='button' tabIndex=0 with an Enter handler) and the caret as a button. Make Add art a <button> that calls inputRef.current.click(). Add aria-label='Folder options' to .fdots. Call e.stopPropagation() in the menupop buttons at lines 490-492.
- **Repro:** Archive › click the search box › press Tab repeatedly: Add art is never focused and folder rows are skipped.
- **Evidence:** s6 'rail focusability: ["BUTTON tabIndex=0","BUTTON tabIndex=0","DIV.fdir tabIndex=-1",…]', 'tab order after search: ["A.sbtn:Open the Atlas ▸","BUTTON.sbtn:Select","BUTTON.frow:❖ All art 58",…]', 'fdots labels: [{"title":"","aria":null,"text":"⋯"}…]'; shots/03-folders.png (Maps selected after New subfolder)
- **Re-proved:** Code: ImageManager.jsx:477-478 renders the folder row as a <div onClick>. :479-482 renders the caret as a <span onClick>. :487 is the .fdots button with no title or aria-label. :490-492 are menu buttons without stopPropagation, and .fmenu (:486) stops only pointerdown, so a click bubbles to the row's onSel. :301-304 wraps a hidden input in <label className='sbtn primary'>. AtlasWorkspace.jsx:2111-2114 builds '⬆ Upload new image' the same way. Live on my clone: every folder row is DIV.frow.fdir …

### P052 · Workspace picker uploads skip client validation and show jargon errors; its file input is never reset

Product polish · low · effort xs · found by `images`

- **Where:** Atlas workspace › Choose image › ⬆ Upload new image; client/src/pages/AtlasWorkspace.jsx:2084-2093, :2113
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2084-2093`, `client/src/pages/AtlasWorkspace.jsx:2113`, `client/src/pages/ImageManager.jsx:303`
- **What happens:** Choosing vector.svg in the picker posted to the server and showed 'Invalid image data format', which doesn't say which formats work. An 8.5 MB PNG showed 'Something went wrong!'. validateImage (used by the Archive) is never called here, and accept='image/*' offers SVG, AVIF, HEIC and others. The input's value is never cleared, unlike ImageManager.jsx:303 (`e.target.value = ''`), so re-choosing the same file after an error fires no change event in Chrome.
- **Why it matters:** The picker should validate like the Archive and say in plain words what's allowed (PNG, JPEG, GIF, WebP up to N MB).
- **Fix:** Call imageServiceBase64.validateImage(file) in ImagePicker.upload before posting and show v.error. Reset e.target.value in the onChange. Change the server message at image-base64.js:30 to 'Only PNG, JPEG, GIF or WebP images can be uploaded'. Narrow accept to 'image/png,image/jpeg,image/gif,image/webp' in both inputs.
- **Repro:** Workspace › select a pin › ＋ Add image › ⬆ Upload new image › choose an .svg → 'Invalid image data format'.
- **Evidence:** s8 output 'svg via picker -> ["Invalid image data format"]', '8.5MB via picker -> ["Something went wrong!"]'; http 400/500 POST /api/images-base64/upload
- **Re-proved:** Code: ImagePicker.upload (AtlasWorkspace.jsx:2084-2093) never calls validateImage. The input at :2113 is accept="image/*" and its value is never reset (ImageManager.jsx:303 does reset it). The error shown is e.message from the service's thrown response.data. API test on my clone: svg data URL gave 400 {"message":"Invalid image data format"}. An 8.5 MB payload gave 500 {"message":"Something went wrong!","error":{}}: express.json limit '10mb' (server/server.js:90) trips the generic handler at :12…

### P054 · The image picker doesn't say what it's for, which image is current, or what the thumbnails are called

Product polish · low · effort s · found by `maps`

- **Where:** AtlasWorkspace.jsx:1526-1528. The base and period pickers carry the same Paint label ('✦ Paint this map a backdrop'), so nothing tells them apart except whether 'Remove current image' shows (it only does for the base, when one is set). Two related problems the finder missed: - Painting from the period picker calls forgeService.mapBackdrop, which runs UPDATE maps SET image_id (server/routes/forge.js:204-219). It replaces the BASE backdrop, not a period row. The picker's kind 'backdrop-timed' is never passed to generate. - The picker opened from the Backdrops over time dialog renders underneath that dialog. The ImagePicker at line 1523 comes before the bdsOpen modal at 1604 in the DOM. Live, clicking the picker's ✕ timed out because the dialog's .modal-back intercepted pointer events (screenshot lanes/verify-maps-b4/shots/v2-timed-picker.png). The other sub-claims are correct at 2098, 2113, 2115, 2119-2123.
- **Files:** `client/src/pages/AtlasWorkspace.jsx:2098`, `client/src/pages/AtlasWorkspace.jsx:2113-2126`
- **What happens:** The same picker, titled 'Choose image', serves base backdrop, period art and node art. The only hint of purpose is the Paint button's label. Thumbnails have no visible names (filenames only in tooltips). The current image isn't marked; '◈' only means 'used somewhere'. 'Remove current image' is worded differently from 'Remove the backdrop'. Re-choosing the same file after a failed upload does nothing, because the input's value is never reset (line 2113).
- **Why it matters:** A heading such as 'Backdrop for The Keep — Inside' or 'Art for day 12 onward', the current image outlined, names under the thumbnails, and retry working with the same file.
- **Fix:** Pass a title prop from each picker.kind. Highlight the image whose id matches the current image_id (it needs map.imageId in the GET /maps payload). Show im.originalName under each thumbnail. Set e.target.value = '' after reading files[0].
- **Repro:** Open the picker from the space panel, then from 'Add art for a period'. The two look the same apart from the Paint label.
- **Evidence:** lanes/maps/shots/04-picker.png; t5 picker titles list
- **Re-proved:** Confirmed: - The title is hard-coded 'Choose image' (AtlasWorkspace.jsx:2098). One ImagePicker serves the base backdrop, period art, node art and the Forge style anchor (1524, 2401). - Thumbnails show a name only in title/alt (2119-2120). - Nothing marks the current image. '◈' only means usesOf>0 (2121-2123). - The picker says 'Remove current image' (2115), the menu says 'Remove the backdrop' (1144). - The file input's value is never reset (2113). After a failed upload the same element stays mo… _(partly — the corrected location is used above)_

### P062 · Image and folder routes 500 on non-numeric params, and search treats _ and % as wildcards

Product polish · low · effort xs · found by `images`

- **Where:** GET /api/images, PUT /api/images/:id, GET /api/image-folders; server/routes/images.js:14-77
- **Files:** `server/routes/images.js:44-46`, `server/routes/images.js:50-54`, `server/routes/images.js:77`, `server/routes/imageFolders.js:12-26`
- **What happens:** GET /api/images?world_id=106&limit=abc → 500 'Server error'. GET /api/images?world_id=106&folder_id=abc → 500. Searching '_' or '%' in the Archive returned all 25 images, because the value goes into ILIKE '%…%' unescaped. limit is also unbounded.
- **Why it matters:** 400 for malformed ids and limits. Search should match those characters literally.
- **Fix:** Parse and validate world_id, folder_id, limit and offset (Number.isInteger, clamp limit to 1..200), returning 400 otherwise. Escape \ % _ in the search term and add ESCAPE '\\' to the ILIKE.
- **Repro:** curl the two GETs above with the fleet token. In the Archive, type '_' in 'Search the archive…' → every image is shown.
- **Evidence:** API probe 'limit=abc: 500 {"message":"Server error"}', 'folder_id=abc: 500'; s3 'search _ : 25 tiles', 'search % : 25 tiles'
- **Re-proved:** I probed live as the fleet account against the finder's world 106, using read-only GETs plus one PUT to a non-existent id. GET /api/images?world_id=106&limit=abc → 500 {"message":"Server error"}. GET …&folder_id=abc → 500, retried after a 429 wait so it is not a rate-limit artefact. GET /api/images?world_id=abc → 500. GET /api/image-folders?world_id=abc → 500. PUT /api/images/abc → 500. search=_ and search=% both returned total 58 (every image), while search=zzqqxxnomatch returned 0, so the fil…

### P093 · Images can't be renamed or captioned: pasted files are all 'image.png' forever; alt text is hidden but searched and can't be cleared

Product polish · low · effort s · found by `images`

- **Where:** Two details are wrong. (1) The workspace picker does show names, but only in a hover title tooltip on each tile (AtlasWorkspace.jsx:2120, title={im.originalName…}), with no visible label. On touch, and among identical 'image.png' names, they still can't be told apart. (2) The Forge alt text 'Painted by the Forge' is at server/forge/contract.js:248 (the INSERT spans 246-248), not :247.
- **Files:** `client/src/pages/ImageManager.jsx:596-618`, `server/routes/images.js:155`, `server/routes/images.js:189-192`, `server/routes/images.js:42-47`, `server/forge/contract.js:247`
- **What happens:** A pasted image arrived as originalName 'image.png' (browser default), and every paste will. The Lightbox has no rename field, and PUT /api/images/:id cannot change original_name: it only reads alt_text, tags and folder_id. The workspace picker shows no names at all, so several 'image.png' entries can't be told apart. alt_text has no UI, but search matches it: after PUT alt_text 'a castle', searching 'castle' returned small.png with no visible reason. Every Forge painting carries alt_text 'Painted by the Forge'. PUT {alt_text:''} left it as 'a castle' (`alt_text || image.alt_text`). The grid has no sort control; it is always newest first.
- **Why it matters:** A DM should be able to rename an image in the Lightbox (and, if kept, edit or clear its caption), and sort by name or date.
- **Fix:** Accept original_name (trimmed, ≤255) in PUT /api/images/:id. Build the SET clause from the keys present so '' or null clears alt_text. Add an inline-editable title (and optional caption) in the Lightbox that calls updateImage. Optionally add a sort select (newest / name) passed as ?sort= to images.js.
- **Repro:** Archive › paste an image from the clipboard › open it: the title is 'image.png' and nothing is editable. API: PUT /api/images/<id> {alt_text:''} → alt text unchanged.
- **Evidence:** s3 API listing '457 image.png folder=null' (the pasted file); API probe 'set alt: 200 a castle', 'clear alt: 200 "a castle"', 'search by alt text hits: 1'
- **Re-proved:** Checked and true: PUT /api/images/:id reads only alt_text, tags and folder_id (server/routes/images.js:155). The SET uses `alt_text || image.alt_text` (:190). Search matches alt_text (:45). Nothing anywhere writes original_name after insert (grep of original_name/originalName). The Lightbox (ImageManager.jsx:596-618) has no editable field. ORDER BY i.created_at DESC (images.js:76), and the page has no sort UI. API test on my clone: set alt 'a castle' gave 200. PUT alt_text '' gave 200 and the v… _(partly — the corrected location is used above)_

