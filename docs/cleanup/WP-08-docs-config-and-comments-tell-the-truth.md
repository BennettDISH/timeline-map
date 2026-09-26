# WP-08 · Docs, config and comments tell the truth

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Bring CLAUDE.md, README, UX-REDESIGN.md, .env.example and the code comments back in line with the code, and retire docs about the deleted legacy app. Make the test fixture rebuildable.

**Do after:** [WP-07](WP-07-delete-the-dead-code.md)

**Notes:** Do this after WP-07 so the comments describe the code that survived. Follow-up sessions read CLAUDE.md first, so fix its table list, session formula, regions and resolveImageUrl lines (docs-hygiene-06). For server-dead-14 and schema-data-18, write a real fixture and have the share test delete its probe marker. schema-data-14 is a small server.js change: start listening after the schema ensure. docs-hygiene-13 and docs-hygiene-15 are deletions or moves to an archive.

## Checklist

- [ ] **O001** · medium · s · CLAUDE.md has drifted: regions listed as a gap, 4 tables missing, wrong session formula, resolveImageUrl mis-described
- [ ] **O002** · medium · s · docs/UX-REDESIGN.md describes removed behaviour, and its roadmap checkboxes are wrong in both directions
- [ ] **B079** · low · xs · README 'Getting started' fails on a fresh clone: concurrently is never installed, and migrate ignores server/.env
- [ ] **B082** · low · xs · Server starts accepting requests before the boot-time schema ensure finishes
- [ ] **C025** · low · xs · Config drift: .env.example lacks the five R2 vars, suggests a retired Forge model, and documents a CORS setting that does nothing in production
- [ ] **C041** · low · xs · Misplaced and stale comments in AtlasWorkspace, and one name used for two different things (dropNode)
- [ ] **C052** · low · s · README is stale and never says which doc to read first
- [ ] **C071** · low · s · server/test/fixture.sql contains no SQL; the fixture world the security tests depend on cannot be rebuilt
- [ ] **C072** · low · s · fixture.sql contains no SQL, and each run of the share test adds a probe marker toward the 200-marker cap
- [ ] **O004** · low · xs · Docs still list zones/regions as unbuilt, and an e2e comment refers to an 'anchor pin' that no longer exists
- [ ] **O010** · low · xs · docs/REVIEW.md audits the deleted legacy app: 19 of 38 cited paths are gone, and its open boxes are wrong
- [ ] **O011** · low · xs · Stale comments and docs in the image pipeline describe behaviour that no longer exists
- [ ] **O012** · low · xs · docs/wireframe.html is an orphaned pre-build mock from July 2026
- [ ] **O013** · low · s · Server comments still describe removed things: the legacy API, the events table, soft delete, ElevenLabs-only voice, /map/:id
- [ ] **O015** · low · xs · Root package.json, railway.toml and .gitignore carry leftovers
- [ ] **O017** · low · xs · Three different 'list of tables' in server and docs, and only migrate.js is complete
- [ ] **O018** · low · xs · Comments in the maps and image code describe removed features or sit above the wrong code
- [ ] **O020** · low · xs · Voice comments still describe the ElevenLabs-only era, and elevenlabs.enabled is a dead export
- [ ] **O021** · low · s · Comments and docs describe code that is gone or changed
- [ ] **O024** · low · xs · Stale comments and docs: 'players don't scrub'; 'All players use AudioClip'

## Items

### O001 · CLAUDE.md has drifted: regions listed as a gap, 4 tables missing, wrong session formula, resolveImageUrl mis-described

Obsolete · medium · effort s · found by `docs-hygiene` (+1 other lane)

- **Where:** (d) the redirect is at server/routes/image-base64.js:119 (not 118). (f) the V1.0 paragraph (CLAUDE.md:127-128) ends the Timeline section, right before '## Player markers' at :130; it is not in the middle of the section. (h) UX-REDESIGN checkboxes were also edited on 2026-09-02, not only 2026-08-31.
- **Files:** `CLAUDE.md:10`, `CLAUDE.md:44`, `CLAUDE.md:47`, `CLAUDE.md:104`, `CLAUDE.md:127`, `CLAUDE.md:205`, `HANDOFF.md:57`
- **What happens:** (a) Known gaps lists 'zones/regions' as future work (CLAUDE.md:205-206, also HANDOFF.md:57), yet CLAUDE.md:77-88 documents Outlines/Regions (components/Regions.jsx) as shipped. (b) 'Live tables' (:47-48) leaves out tombstones, world_minds, mind_messages and forge_batches (schema.sql:266-319; migrate.js itself says 15 tables). (c) The Architecture lists (:33-41) leave out share.js, forge.js, voice.js, storage.js, server/forge/, server/voice/, and pages PlayerView/NotFound. (d) ':44 resolveImageUrl redirects R2-backed paths' is wrong: resolveImageUrl passes absolute URLs through (utils/imageUrl.js:8-11), and the redirect lives in image-base64.js:118. (e) ':104 Session N = footsteps 10N–10N+9' doesn't match nextSession (AtlasWorkspace.jsx:577-588), which starts after the last era's end, or after timeline max when there are no eras. A world enabled via enableTimeline (0-100, unit 'days') therefore gets Session 1 at 101-110 in days. (f) The 'V1.0 — tagged 2026-08-20 … wish-shelf' paragraph (:127-128) sits in the middle of the Timeline section, and tag v1.1 exists but isn't mentioned (git tag -l). (g) ':116 The ⚑ chip was removed on 2026-09-25' is changelog text in a spec. (h) ':10-11' says UX-REDESIGN's checkboxes 'reflect verified state as of 2026-08-17', but they were edited on 2026-08-31 and contradict the code (see the UX-REDESIGN finding).
- **Why it matters:** The file a fresh session is told to trust should match the code.
- **Fix:** Edit CLAUDE.md: drop zones/regions from Known gaps (and HANDOFF.md:57); list all 15 tables; complete the Architecture lists; fix the resolveImageUrl sentence; describe the session convention the way the code does it (or change nextSession to start at 10N); move the version note into its own 'Releases' line naming v1.0.0 and v1.1; delete the chip changelog; drop the '2026-08-17 verified' sentence.
- **Repro:** Compare each cited CLAUDE.md line with the file:line given.
- **Re-proved:** (a) CLAUDE.md:205-206 and HANDOFF.md:56-57 list 'zones/regions' on the later shelf, while CLAUDE.md:77-88 documents Outlines/Regions (Regions.jsx) as shipped. True. (b) CLAUDE.md:47-48 lists 11 tables. schema.sql has 15 CREATE TABLEs; the missing ones are world_minds :266, mind_messages :282, forge_batches :295 and tombstones :313, and migrate.js:26 says 15. True. (c) The Architecture lists at :33-41 leave out share.js, forge.js, voice.js, storage.js, server/forge/, server/voice/, PlayerView an… _(partly — the corrected location is used above)_
- **Also found as:** "CLAUDE.md's Database section is wrong: the 'orphaned' tables are gone and 4 of …" (schema-data)

### O002 · docs/UX-REDESIGN.md describes removed behaviour, and its roadmap checkboxes are wrong in both directions

Obsolete · medium · effort s · found by `docs-hygiene` (+2 other lanes)

- **Where:** docs/UX-REDESIGN.md (linked from CLAUDE.md:10-11, HANDOFF.md:4, atlas.js:10, schema.sql:108)
- **Files:** `docs/UX-REDESIGN.md:111`, `docs/UX-REDESIGN.md:185`, `docs/UX-REDESIGN.md:194`, `docs/UX-REDESIGN.md:203`, `docs/UX-REDESIGN.md:221`
- **What happens:** Lines 111-113 and 168 promise that opening a node with no interior creates one, and line 194 ticks 'create-on-open'. Commit 680548e removed that on purpose (AtlasWorkspace.jsx:375-380 'never invent one on a double-click'; CLAUDE.md:120-121 says the opposite). Line 203 ticks 'portals click-to-travel', but no UI or Forge path ever sets links.kind='portal' or time_context: `git grep -n portal client/src server/routes` → 0 hits, addLink (AtlasWorkspace.jsx:282) sends only from/to, and contract.js:403 hard-codes 'reference'. Line 185 says 'The big missing piece is Phase 4's Player View', yet Phase 4 is ticked. Lines 189, 193, 202 and 206 say world switcher, tree thumbnails, undo and the time filter are 'not' done, but all four exist (AtlasWorkspace.jsx:889-910 brandsel, :1727 tthumb, tombstones, the ⏳ toggle at :1320). Line 221 keeps 'zones/regions' for later, but Outlines shipped. Lines 7-9 say all data is disposable test data.
- **Why it matters:** A doc the codebase points to as 'the vision and roadmap' should not contradict CLAUDE.md or the code.
- **Fix:** Keep the vision (lines 13-84). Delete or replace the 'Why the current app fights this vision' section and the Roadmap section with a pointer to CLAUDE.md's wish-shelf. Rewrite §1 to 'double-click enters an existing interior; interiors are created from the inspector'. Either build portals/link time_context or drop them from the model text and the links schema comment (schema.sql:142-143).
- **Repro:** Read the cited lines next to the code references.
- **Re-proved:** Read docs/UX-REDESIGN.md next to the code. Lines 111-113 and 168 promise create-on-open, and :194 ticks it. Commit 680548e removed it on purpose ('Double-clicking a pin only enters an interior that exists'). AtlasWorkspace.jsx:377-379 reads 'never invent one on a double-click', and CLAUDE.md:120-121 says interiors are created only on purpose. Line 203 ticks 'portals click-to-travel', but `git grep -n -i portal -- client/src server` hits only the schema.sql:142 comment. addLink (AtlasWorkspace.j…
- **Also found as:** "UX-REDESIGN.md (which CLAUDE.md says is verified) still describes canvas behavi…" (canvas); "docs/UX-REDESIGN.md still promises create-on-open and Enter-to-enter, and says …" (maps)

### B079 · README 'Getting started' fails on a fresh clone: concurrently is never installed, and migrate ignores server/.env

Broken · low · effort xs · found by `docs-hygiene`

- **Where:** README.md:12-18; CLAUDE.md:14-16; server/config/migrate.js
- **Files:** `README.md:13`, `README.md:15`, `server/config/migrate.js:1`, `package.json`, `CLAUDE.md:16`
- **What happens:** (1) `npm run install-all` only runs `npm install` inside server/ and client/. The root devDependency `concurrently` is installed only by a root `npm install` (via postinstall), so the next step, `npm run dev`, fails with 'concurrently: not found'. There is no root node_modules or root lockfile. (2) `cd server && npm run migrate` runs config/migrate.js → config/database.js, and neither calls dotenv: only server.js:8 does (`git grep -n dotenv server` → server.js:8 only). So the DATABASE_URL just copied into server/.env is ignored and pg falls back to local defaults. (3) The step is redundant anyway, because server.js:13-24 applies schema.sql on every boot.
- **Why it matters:** The documented commands work in order.
- **Fix:** README: replace step 1 with `npm install` (root; its postinstall installs server and client), and mark migrate as optional since boot applies the schema. Add `require('dotenv').config()` at the top of server/config/migrate.js (or change the script to `node -r dotenv/config config/migrate.js`). Update CLAUDE.md:16.
- **Repro:** Read root package.json scripts; git grep -n dotenv server; cat server/config/migrate.js server/config/database.js.
- **Re-proved:** The root package.json has `install-all`: 'cd server && npm install && cd ../client && npm install' and `dev`: 'concurrently …'. concurrently is a root devDependency, installed only by a root `npm install`, whose postinstall then runs install-all. The root has no node_modules and no package-lock.json, and `which concurrently` finds nothing, so README step 1 followed by `npm run dev` hits 'concurrently: not found'. `git grep -n dotenv -- server` (excluding the lockfile and package.json) hits only…

### B082 · Server starts accepting requests before the boot-time schema ensure finishes

Broken · low · effort xs · found by `schema-data`

- **Where:** server/server.js:17-24 vs :139
- **Files:** `server/server.js:15-24`, `server/server.js:139-142`
- **What happens:** The schema ensure is a fire-and-forget async IIFE, and app.listen at line 139 runs in the same tick. On a deploy that adds a column, requests arriving during the ~70 sequential statements can hit a SELECT or INSERT naming the new column and return 500 until the ALTER lands.
- **Why it matters:** The server listens only after applySchema resolves; per-statement failures are still tolerated.
- **Fix:** Wrap startup: `applySchema(pool, {...}).catch(log).finally(() => app.listen(PORT, …))`, keeping per-statement tolerance.
- **Repro:** Read server.js:15-24 and 139-142: the IIFE promise is never awaited before listen.
- **Evidence:** code read server.js:15-24, 139
- **Re-proved:** server.js:17-24 is an un-awaited async IIFE that calls `await applySchema(pool, ...)`. It yields at its first pool.query, and app.listen at server.js:139 runs in the same tick. The start chain does not migrate first: root package.json start is `cd server && npm start`, and server/package.json start is `node server.js`. railway.toml sets no healthcheckPath, so Railway sends traffic as soon as the port is open, while 70 statements are still running one after another. I confirmed this from the cod…

### C025 · Config drift: .env.example lacks the five R2 vars, suggests a retired Forge model, and documents a CORS setting that does nothing in production

Confusing · low · effort xs · found by `server-dead` (+1 other lane)

- **Where:** .env.example; server/server.js:82-91
- **Files:** `.env.example`, `server/server.js:82-91`, `server/storage.js:18-24`, `server/forge/gemini.js:7`, `README.md`
- **What happens:** Code reads R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL (storage.js). They are absent from .env.example, yet voice and ambience refuse to work without them (voice.js needStorage) and images otherwise fall back to Postgres. .env.example suggests FORGE_TEXT_MODEL=gemini-2.5-pro, which gemini.js:7 calls retired. FRONTEND_URL is documented 'for CORS', but the SPA is same-origin: live, a request with Origin: https://evil.example to /api/auth/config gets no Access-Control-Allow-Origin header, so FRONTEND_URL is unset and the cors() block emits nothing. express.urlencoded (server.js:91) has no form-post caller. .env.example and README say 'Sign in with bennettdishman.com', while the UI says 'Sign in with Waypoint' (Login.jsx:179).
- **Why it matters:** .env.example lists every variable the code needs, with current values.
- **Fix:** Add a commented R2_* block pointing at docs/R2-SETUP.md. Change the FORGE_TEXT_MODEL example to gemini-3.1-pro-preview. Remove FRONTEND_URL, the cors() block and express.urlencoded, or document why they stay. Rename the SSO wording to Waypoint.
- **Repro:** grep -rhoE "process\.env\.[A-Z_0-9]+" server | sort -u, compared against .env.example. Also: curl -sD - -H 'Origin: https://evil.example' https://timeline-map-production.up.railway.app/api/auth/config | grep -i access-control (no output). Local proof: cors-sim.js.
- **Re-proved:** The five R2_* variables storage.js:18-24 reads are missing from .env.example, which I compared against grep of process.env across server. voice.js:27/52/72 return 'Audio needs object storage (R2) configured' when r2Enabled is false. .env.example has '# FORGE_TEXT_MODEL=gemini-2.5-pro', while gemini.js:7 says 2.5-pro was retired and defaults to gemini-3.1-pro-preview. On CORS: with the installed cors 2.8.5, an undefined origin option means no header is set (middlewareWrapper calls next()). Live,…
- **Also found as:** ".env.example: no R2 block, a retired Forge model as the example, one voice-mode…" (docs-hygiene)

### C041 · Misplaced and stale comments in AtlasWorkspace, and one name used for two different things (dropNode)

Confusing · low · effort xs · found by `client-dead` (+3 other lanes)

- **Where:** client/src/pages/AtlasWorkspace.jsx:45,77-79,204-208,2178
- **Files:** `client/src/pages/AtlasWorkspace.jsx:77-79`, `client/src/pages/AtlasWorkspace.jsx:204-205`, `client/src/pages/AtlasWorkspace.jsx:223`, `client/src/pages/AtlasWorkspace.jsx:45`, `client/src/pages/AtlasWorkspace.jsx:2178`, `client/src/pages/AtlasWorkspace.jsx:305`
- **What happens:** The comment 'The Forge: this world's AI mind. forgeOn = …' (77-78) sits above the unrelated `trail` state (79), with forgeOn a line lower. The comment 'After the Forge lands a batch, the world (eras), the tree … refresh all three' (204-205) sits above toggleSpotlight's lantern comment, while the function it describes (forgeRefresh) is at 223, after the trail effect. The comment 'Old stored 'dm' maps to edit.' (45) describes a localStorage migration from before the three postures existed. Inside ForgePanel, `const [dropNode, setDropNode]` (2178) is a boolean meaning 'the DM removed the selection chip', while the workspace's `dropNode` (305) creates a node at x,y.
- **Why it matters:** Comments sit next to the code they describe, and one name means one thing.
- **Fix:** Move 77-78 down to line 80. Move 204-205 to just above forgeRefresh at 223. Drop the 'dm' note. Rename ForgePanel's state to `omitSel`/`setOmitSel`.
- **Repro:** Read the lines listed.
- **Re-proved:** AtlasWorkspace.jsx:77-78 is the comment 'The Forge: this world's AI mind. forgeOn = …', line 79 is `const [trail, setTrail] = useState([])` and forgeOn is on line 80. Lines 204-205 read 'After the Forge lands a batch, the world (eras), the tree …, and the canvas may all have changed — refresh all three', and sit directly above the lantern comment (206-207) and toggleSpotlight (208). forgeRefresh is defined at line 223, after the trail effect at 219-222. Line 45 says "Old stored 'dm' maps to edi…
- **Also found as:** "Comments sit above the wrong code in AtlasWorkspace (Forge comments over trail …" (canvas); "Forge comments in AtlasWorkspace sit above unrelated code" (forge-voice); "Two comments in AtlasWorkspace sit above the wrong code" (postures-share)

### C052 · README is stale and never says which doc to read first

Confusing · low · effort s · found by `docs-hygiene`

- **Where:** HANDOFF.md last commit: c8e01e5 on 2026-08-31, not 2026-09-02. 'Your most-developed app.' ends the intro paragraph (README.md:4), not the whole README.
- **Files:** `README.md:1`, `README.md:33`, `HANDOFF.md:1`, `HANDOFF.md:19`, `client/src/pages/Dashboard.jsx:299`
- **What happens:** README.md is the repo landing page. It is titled 'timeline-map', describes the product as placing 'events' across a map (the legacy events model), ends with 'Your most-developed app.' (written to Bennett, not to a reader), and its SSO section says 'Sign in with bennettdishman.com' while the UI says 'Sign in with Waypoint' (Login.jsx:179). It leaves out voice routes, guest sign-in, the API and e2e test suites, and never mentions CLAUDE.md, HANDOFF.md, docs/ or docs/R2-SETUP.md. HANDOFF.md says CLAUDE.md is the source of truth. It is itself a subset last touched 2026-09-02: no Forge, voice, player markers, outlines, party trail or e2e, and its 'How to work' (:19) says build-verify only, never mentioning `node --test server/test/share-live.test.js` or e2e/. The product has four names: timeline-map (README, Railway), fantasy-map-timeline (repo), 'Fantasy Map Timeline' (UI), and 'the Atlas' (docs, plus one UI button at Dashboard.jsx:299 'Clone it & open the Atlas').
- **Why it matters:** A newcomer should find the right entry doc in one step, and it should be current.
- **Fix:** Rewrite README as a short 'what it is + Start with CLAUDE.md + doc map (CLAUDE.md = truth, docs/R2-SETUP.md = storage setup, e2e/README.md = browser tests)'. Move HANDOFF's 'How to work' bullets into CLAUDE.md and delete HANDOFF.md. Use one product name, and change the Dashboard 'open the Atlas' button text to match it.
- **Repro:** cat README.md HANDOFF.md; git grep -n 'CLAUDE.md\|HANDOFF' README.md → nothing.
- **Re-proved:** README.md is titled 'timeline-map' (:1). Line 3 says 'place events across a map', and line 4 ends the intro with 'Your most-developed app.' Line 33 says 'Sign in with bennettdishman.com', while Login.jsx:179 says 'Sign in with Waypoint'. The routes list (:26-28) leaves out voice.js, though server/routes/voice.js exists. Guest sign-in and the e2e/ and server/test/ suites are never mentioned, and neither are CLAUDE.md, HANDOFF.md, docs/ or R2-SETUP.md. HANDOFF.md:3 calls CLAUDE.md the source of t… _(partly — the corrected location is used above)_

### C071 · server/test/fixture.sql contains no SQL; the fixture world the security tests depend on cannot be rebuilt

Confusing · low · effort s · found by `server-dead` (+1 other lane)

> ⚠ **Second pass — read before fixing:** A seed rebuilt from the contract as written makes the suite blinder: the contract leaves out 'Interlude Ghost', and with no row inside the Hidden Era, removing player_visible from share.js leaves all 17 tests green. Add a 42-48 row and Ghost's real lifespan to the contract. → **B118** in [WP-27](WP-27-tests-that-can-fail-and-docs-that-record-the-rul.md)

- **Where:** server/test/fixture.sql:1-20; server/test/share-live.test.js:3-4 and 17
- **Files:** `server/test/fixture.sql`, `server/test/share-live.test.js:3-4`, `server/test/share-live.test.js:17`
- **What happens:** fixture.sql is only comments. It says 'The full executable block lives in git history', but no commit ever put an INSERT into server/test: `git log --all -S "INSERT INTO nodes" -- server/test` returns nothing, and 6bf13db:server/test/fixture.sql contains 0 INSERTs. share-live.test.js:3-4 says the fixture world 'is seeded by server/test/fixture.sql', and line 17 says 're-seed fixture.sql'.
- **Why it matters:** The seed file for the secrecy suite can be executed.
- **Fix:** Write a real idempotent seed (DO block) from the content contract in the file, or rename it to fixture.md and change the test header to say the fixture exists only in production (world 26).
- **Repro:** cat server/test/fixture.sql; git log --all --format=%h -S "INSERT INTO nodes" -- server/test
- **Re-proved:** server/test/fixture.sql contains only comment lines (20 lines, all starting with '--'). Line 3 refers to 'the DO block below', and no such block exists. Its git history is only 6bf13db and 74416a4; `git show 6bf13db:server/test/fixture.sql | grep -ci insert` gives 0, and `git log --all -S 'INSERT INTO nodes' -- server/test` is empty. Searching all of history for 'secrecy-fixture' finds only 6bf13db (this comment file). 'Hidden Person' also appears in c28e28f, but only in a test assertion list, …
- **Also found as:** "server/test/fixture.sql has no SQL; its header points to a DO block, a SELECT a…" (docs-hygiene)

### C072 · fixture.sql contains no SQL, and each run of the share test adds a probe marker toward the 200-marker cap

Confusing · low · effort s · found by `schema-data`

- **Where:** server/test/share-live.test.js:138-140 and server/test/fixture.sql:15. The test does not start failing at the cap: on any 400 it calls t.skip('fixture marker cap reached — sweep player nodes'). The real problem is that the write-path test goes silently skipped, and its comment says 'a full cap (400)' while share.js:289 caps at 200. The fix's 'restore the executable seed from git history' is impossible: the block was never committed, so fixture.sql:15 ('The full executable block lives in git history') is itself false. The seed has to be rebuilt from the contract comments or the live DB.
- **Files:** `server/test/fixture.sql:1-20`, `server/test/share-live.test.js`, `server/routes/share.js:287-289`
- **What happens:** fixture.sql is 20 comment lines. Line 3 says 'delete the world first (the DO block below does)', but there is no block below, and line 15 says the executable block lives only in git history. Each full test run adds one 'probe-marker-<ts>' player node to world 26, which now holds 42. share.js refuses new markers once a world has 200, so after about 158 more runs the write-path test starts failing with 'The map is full of markers'.
- **Why it matters:** The seed file seeds, and the test cleans up after itself or the sweep is automatic.
- **Fix:** Restore the executable seed into fixture.sql from git history (the 2026-08-20 seed), or rename the file to FIXTURE.md. Make the test sweep its own marker. It cannot delete through the share API, so either reuse one fixed marker title and skip when it exists, or add the sweep SQL to the test README as a step to run before the test.
- **Repro:** cat server/test/fixture.sql; prod: SELECT count(*) FROM nodes WHERE world_id=26 AND visibility='player' AND title LIKE 'probe-marker-%' → 42.
- **Evidence:** file content; prod count 42
- **Re-proved:** fixture.sql is 20 lines, all `--` comments (wc -l = 20). Line 3 refers to 'the DO block below', which does not exist. The per-run marker is confirmed: share-live.test.js:133 posts `probe-marker-${Date.now()}` and never cleans it up. I checked the count through the public share API: GET /api/share/fx89…/maps/60?window=1 lists 42 probe-marker placements, all flagged player. The cap is share.js:287-289 (`>= 200` → 400 'The map is full of markers'). The 'starts failing' claim is wrong because test … _(partly — the corrected location is used above)_

### O004 · Docs still list zones/regions as unbuilt, and an e2e comment refers to an 'anchor pin' that no longer exists

Obsolete · low · effort xs · found by `outlines`

- **Where:** CLAUDE.md:205; docs/UX-REDESIGN.md:221; e2e/dm.mjs:100
- **Files:** `CLAUDE.md:205`, `docs/UX-REDESIGN.md:221`, `e2e/dm.mjs:100`
- **What happens:** CLAUDE.md 'Known gaps' → 'From the "later" shelf: … zones/regions', and UX-REDESIGN.md:221 '… zones/regions still later', while CLAUDE.md:77-88 documents the shipped Outlines feature (Regions.jsx). e2e/dm.mjs:100 says 'a click inside the region (away from its anchor pin)', but outlined places have had no pin since ebe92f9.
- **Why it matters:** The docs reflect what has shipped and say precisely what is still missing, if anything, about regions.
- **Fix:** Remove 'zones/regions' from CLAUDE.md:205 and UX-REDESIGN.md:221 (or reword as the specific missing piece, e.g. 'region-level visibility per era'). Change the e2e comment to 'away from its name anchor'.
- **Repro:** grep -n -i "zones" CLAUDE.md docs/UX-REDESIGN.md
- **Evidence:** grep output: CLAUDE.md:205, docs/UX-REDESIGN.md:221
- **Re-proved:** CLAUDE.md:205 in 'Known gaps' reads 'From the "later" shelf: per-fact visibility, branching campaigns, zones/regions, @-mention-to-link'. docs/UX-REDESIGN.md:221 reads '... per-fact visibility · branching campaigns · zones/regions still later'. Meanwhile CLAUDE.md:77-88 documents the shipped Outlines feature and names components/Regions.jsx. e2e/dm.mjs:100 says 'a click inside the region (away from its anchor pin)'. The asserts just above it (line 98) check that the new place has a region and N…

### O010 · docs/REVIEW.md audits the deleted legacy app: 19 of 38 cited paths are gone, and its open boxes are wrong

Obsolete · low · effort xs · found by `docs-hygiene`

- **Where:** docs/REVIEW.md
- **Files:** `docs/REVIEW.md:108`, `docs/REVIEW.md:121`
- **What happens:** It is a July 2026 audit of the pre-Atlas app. 19 of its 38 cited paths no longer exist (MapViewer.jsx, NodeEditor.jsx, events.js, maps.js, useMapData.js, ImageGallery.jsx, nodeSearchService.js, …). 9 boxes are unchecked: 6 refer to deleted files. Line 108 (Setup → AuthContext) is fixed (Setup.jsx:50 setSession) but unticked. Line 121 (1000-image fetch for counts) is fixed (ImageManager.jsx:76-79 reads counts from the folders endpoint) but unticked. Its R2 'plan' section is done. No doc links to it.
- **Why it matters:** No doc that points a new session at code that no longer exists.
- **Fix:** Delete docs/REVIEW.md (git history keeps it). Its one live item, AdminPanel's raw axios (line 154), is a separate finding.
- **Repro:** For each path cited in REVIEW.md, test -e it (script in this lane's transcript); git grep REVIEW.md → no inbound links.
- **Re-proved:** Read docs/REVIEW.md in full. I pulled every backticked path and ran test -e on each. 19 full repo paths are missing: ImageGallery, ImageSelector, ImageUpload, MapContainer, NodeEditor, NodesListPanel, UniversalNodeSearch, useMapData, useMapInteractions, MapManager, MapViewer, WorldSettings, nodeSearchService, mapSettings.scss.backup, mapStyles.scss, timelineStyles.scss, nodeUtils, server/routes/events.js and server/routes/maps.js. My total is 39-40 unique full paths depending on whether ../cont…

### O011 · Stale comments and docs in the image pipeline describe behaviour that no longer exists

Obsolete · low · effort xs · found by `images`

- **Where:** docs/REVIEW.md:111-115 (ImageGallery.jsx, ImageSelector.jsx, MapManager.jsx, events.js), 137 and 143 (ImageSelector.jsx), 146 (MapManager.jsx) and 73-74 (events.js), not 96-104. Every other cited location is correct.
- **Files:** `server/routes/image-base64.js:48`, `server/routes/image-base64.js:115-117`, `server/routes/imageFolders.js:213`, `server/storage.js:53`, `server/routes/worlds.js:154`, `server/routes/worlds.js:169`, `client/src/services/imageServiceBase64.js:16`, `client/src/services/imageServiceBase64.js:46`, `CLAUDE.md:44`, `docs/REVIEW.md:96-104`
- **What happens:** image-base64.js:116 refers to 'URLs embedded in event tooltip blobs': the events system was deleted in Aug 2026. Line 48 calls /serve a 'legacy serve endpoint', while README says it is the live fallback and is what every base64 clone (including the sample world's SVGs) is served from. imageFolders.js:213 says 'remove any image associations via cascade', but images.folder_id is ON DELETE SET NULL (schema.sql:71) and images go to Unsorted. storage.js:53 says deletePrefix is 'for future world/folder purges', but it has been used by world delete (worlds.js:175) for some time. worlds.js:154 says '(soft delete)' while line 169 does a hard delete that 'reclaims … events'. imageServiceBase64.js:46 says 'reuse from regular image service', but imageService.js was deleted in b855a2b. Line 16 promises 'progress tracking', but the values are fixed. CLAUDE.md:44 says 'resolveImageUrl redirects R2-backed paths', but resolveImageUrl (utils/imageUrl.js:7-11) only passes absolute URLs through; the redirect lives in image-base64.js:118-119. docs/REVIEW.md's image items cite deleted files (ImageGallery.jsx, ImageSelector.jsx, MapManager.jsx, events.js).
- **Why it matters:** Comments and docs should match the code.
- **Fix:** Rewrite each comment to the current behaviour (drop the tooltip-blob mention; 'fallback serve endpoint'; 'images return to Unsorted (SET NULL)'; 'used by world delete'; 'Hard delete'; drop the 'regular image service' and 'progress tracking' claims). Fix CLAUDE.md:44 to say the /serve route redirects R2-backed rows. Archive or trim the image sections of docs/REVIEW.md.
- **Repro:** Read the cited lines against schema.sql:71, worlds.js:173-177 and `git log --diff-filter=D -- client/src/services/imageService.js`.
- **Evidence:** grep output lines cited; git log shows client/src/services/imageService.js deleted in b855a2b
- **Re-proved:** image-base64.js:116 still mentions 'URLs embedded in event tooltip blobs', but the events system is deleted (CLAUDE.md:9-10). Line 48 calls /serve a 'legacy serve endpoint', while README.md:44-47 calls it the deliberate live fallback and the path clones use (atlas.js:192). I confirmed this on my own clone of 27 (world 131, since deleted): the sample map backdrops come back as /api/images-base64/serve/clone-….svg. imageFolders.js:213 says 'via cascade', but schema.sql:71 has images.folder_id … O… _(partly — the corrected location is used above)_

### O012 · docs/wireframe.html is an orphaned pre-build mock from July 2026

Obsolete · low · effort xs · found by `docs-hygiene`

- **Where:** docs/wireframe.html
- **Files:** `docs/wireframe.html`
- **What happens:** A 465-line static mock ('timeline-map — redesign wireframe'). `git grep -n wireframe` finds only its own <title>, so no doc or code links to it, and it shows a UI that has since been built differently.
- **Why it matters:** No orphaned design artefacts in docs/.
- **Fix:** Delete it (it lives in commit 8549ac0 if ever wanted).
- **Repro:** git grep -n wireframe
- **Re-proved:** git grep -n -i wireframe returns only docs/wireframe.html:6 (<title>timeline-map — redesign wireframe</title>). A wider grep over *.md/js/jsx/json/toml also finds no other reference. wc -l gives 465. git log shows a single commit, 8549ac0 (2026-07-13, 'docs: ground-up UX redesign plan + clickable wireframe'). The body is a static mock with a sample world (Aldermoor, a 'Library' rail, 'Filter by time'), not the shipped Atlas UI.

### O013 · Server comments still describe removed things: the legacy API, the events table, soft delete, ElevenLabs-only voice, /map/:id

Obsolete · low · effort s · found by `server-dead` (+2 other lanes)

- **Where:** Drop share-live.test.js:138 from the list, because '(400)' is the HTTP status, not the cap. imageFolders.js:213 is at most a wording nit ('cascade' vs SET NULL); the effect it describes is correct. Add server/routes/worlds.js:154 ('Delete world (soft delete)'), which sits above a hard DELETE at line 170. The rest stands as cited.
- **Files:** `server/routes/atlas.js:9`, `server/config/schema.sql:104-108`, `server/routes/worlds.js:169`, `server/routes/image-base64.js:115-117`, `server/server.js:104`, `server/server.js:118`, `server/routes/voice.js:1-3`, `server/config/schema.sql:190-192`, `server/voice/elevenlabs.js:1-3`, `server/storage.js:53`, `server/routes/imageFolders.js:213`, `server/routes/atlas.js:700-701`, `server/test/share-live.test.js:138`
- **What happens:** atlas.js:9 says 'Additive to the legacy API', and schema.sql:107 says 'Additive to the legacy tables above'; the legacy system was deleted on 2026-08-17. worlds.js:169 says the cascade reclaims 'maps, images, folders, and events'. image-base64.js:115-117 mentions 'URLs embedded in event tooltip blobs'. server.js:104, voice.js:2 and schema.sql:190-192 say voice is 'inert without ELEVENLABS_API_KEY' and produces MP3; there are now three providers and Gemini produces WAV. elevenlabs.js:1-3 calls itself 'The only outward connection of the voice layer'. server.js:118 cites the client route '/map/:id', which no longer exists (App.jsx uses /w/:worldId/m/:mapId). storage.js:53 says deletePrefix is 'for future world/folder purges'; world delete already uses it. imageFolders.js:213 says deleting a folder removes image associations 'via cascade' (it is ON DELETE SET NULL). atlas.js:700-701 puts a note about link-label clamping under the Eras heading. share-live.test.js:138 says the marker cap is 400; share.js:289 enforces 200.
- **Why it matters:** Comments describe the current code.
- **Fix:** Reword or delete each comment at the listed lines. Move the link-label note in atlas.js:701 down to PATCH /links at line 737.
- **Repro:** grep -rn -i "legacy\|events\b\|tooltip\|ELEVENLABS_API_KEY\|/map/:id\|future world\|soft delete\|cap (400)" server (excluding node_modules)
- **Re-proved:** I opened each cited line. These are stale, as the finding says: atlas.js:9 ('Additive to the legacy API') and schema.sql:107 ('Additive to the legacy tables above'). The legacy stack was removed in a140976 on 2026-08-17, and the tables 'above' (users, worlds, images, maps) are the live Atlas tables. worlds.js:169 still lists 'events', a table dropped in a140976. image-base64.js:115-117 still mentions 'event tooltip blobs'. server.js:104, voice.js:2 ('without ELEVENLABS_API_KEY every route but /… _(partly — the corrected location is used above)_
- **Also found as:** "Route and schema comments describe behaviour that no longer exists" (api-contract); "Schema and route comments describe things that no longer exist (ElevenLabs-only…" (schema-data)

### O015 · Root package.json, railway.toml and .gitignore carry leftovers

Obsolete · low · effort xs · found by `server-dead` (+3 other lanes)

- **Where:** One detail is wrong: there is no root package-lock.json (only server/ and client/ have lockfiles), so nixpacks runs `npm i` in its install phase, not `npm ci`. Postinstall still runs, so the double install holds. A smaller point: Railway config-as-code does accept an `environments.<name>` table for overrides (build/deploy), so the header itself is valid. Only `variables = {}` inside it, plus [[services]] and [services.web], are not config keys.
- **Files:** `package.json`, `railway.toml`, `.gitignore`
- **What happens:** Root package.json has "main": "server.js", but there is no ./server.js; its description ('plotting events across time and space') and 'events' keyword describe the removed model. `postinstall` runs install-all and `build` runs install-all again, so a nixpacks deploy (npm ci, then npm run build) installs server and client twice. railway.toml's [[services]], [services.web] tcpProxies and [environments.production] variables = {} blocks are scaffold, not Railway config-as-code keys, and [deploy] has no healthcheckPath although /health exists. .gitignore keeps `server/uploads/*` / `!server/uploads/.gitkeep` for a disk-upload path nothing uses (`grep -rn uploads server` finds only comments; there is no server/uploads dir).
- **Why it matters:** Manifests describe the current app.
- **Fix:** Remove root `main`, update the description and keywords, drop install-all from `build` (postinstall already ran it), trim railway.toml to [build] and [deploy] and add healthcheckPath = "/health", and delete the server/uploads lines from .gitignore.
- **Repro:** ls server.js (none); cat package.json railway.toml; grep -n uploads .gitignore
- **Re-proved:** `ls` at the repo root shows no server.js, but package.json:5 has "main": "server.js". The description 'Interactive fantasy map timeline tool for plotting events across time and space' and the 'events' keyword are still there, and CLAUDE.md:9 says the worlds→maps→events model was deleted in August 2026. `postinstall` runs install-all and `build` runs `npm run install-all && cd client && npm run build`, so a nixpacks deploy installs twice. railway.toml has [[services]] name="web", [services.web] … _(partly — the corrected location is used above)_
- **Also found as:** "Root package.json and client manifest leftovers: phantom main, legacy 'events' …" (docs-hygiene); "railway.toml carries non-Railway scaffold blocks from July 2025" (docs-hygiene); ".gitignore keeps rules for an uploads folder that was removed, plus unrelated b…" (docs-hygiene)

### O017 · Three different 'list of tables' in server and docs, and only migrate.js is complete

Obsolete · low · effort xs · found by `server-dead` (+1 other lane)

- **Where:** server/routes/admin.js:23; CLAUDE.md:47-48; server/config/migrate.js:26
- **Files:** `server/routes/admin.js:23`, `CLAUDE.md:47-48`
- **What happens:** schema.sql creates 15 tables. admin.js db-status 'expectedTables' lists 8 and would report needsMigration=false even with eras, map_backdrops, node_facts, world_minds, mind_messages, forge_batches and tombstones missing. CLAUDE.md 'Live tables' lists 11 and omits world_minds, mind_messages, forge_batches and tombstones.
- **Why it matters:** One source of truth for which tables must exist.
- **Fix:** Build expectedTables in admin.js by parsing `CREATE TABLE IF NOT EXISTS (\w+)` from readStatements(). Add the four missing tables to CLAUDE.md.
- **Repro:** grep -c "CREATE TABLE IF NOT EXISTS" server/config/schema.sql -> 15; compare with admin.js:23 and CLAUDE.md:47.
- **Re-proved:** `grep -c 'CREATE TABLE IF NOT EXISTS' server/config/schema.sql` returns 15: users, worlds, image_folders, images, maps, nodes, placements, links, node_facts, eras, map_backdrops, world_minds, mind_messages, forge_batches, tombstones. admin.js:23 expectedTables lists 8, and needsMigration = missingTables.length > 0 (admin.js:39), so the other 7 tables could be missing without being reported. CLAUDE.md:47-48 'Live tables' lists 11 and omits world_minds, mind_messages, forge_batches and tombstones…
- **Also found as:** "Schema knowledge copied by hand outside schema.sql has drifted: the admin DB ch…" (schema-data)

### O018 · Comments in the maps and image code describe removed features or sit above the wrong code

Obsolete · low · effort xs · found by `maps` (+3 other lanes)

- **Where:** server/routes/atlas.js:9, 282, 337, 394; server/server.js:118; server/routes/image-base64.js:116; client/src/pages/AtlasWorkspace.jsx:38, 51, 77-79, 204-207
- **Files:** `server/routes/atlas.js:9`, `server/routes/atlas.js:282`, `server/routes/atlas.js:337`, `server/routes/atlas.js:394`, `server/server.js:118`, `server/routes/image-base64.js:116`, `client/src/pages/AtlasWorkspace.jsx:38`, `client/src/pages/AtlasWorkspace.jsx:51`, `client/src/pages/AtlasWorkspace.jsx:77-79`, `client/src/pages/AtlasWorkspace.jsx:204-207`
- **What happens:** atlas.js:9 says 'Additive to the legacy API' (the legacy API was deleted). atlas.js:282 and 394 say 'drag-to-place' and 'drag from the index', but nodes are placed with the Place existing picker and there is no drag from any index. atlas.js:337 says 'title / view / backdrop image', but the route also takes focus_start, focus_end and dm_note. server.js:118 lists '/map/:id' as a client route, which no longer exists. image-base64.js:116 mentions 'URLs embedded in event tooltip blobs' (the events table is gone). AtlasWorkspace.jsx:38 documents picker kinds 'node'|'backdrop' (it's missing 'backdrop-timed'). Line 51 lists nodePicker 'link'|'place' (missing 'place-here'). The Forge comment at 77-79 sits above the trail state, and the Forge-refresh comment at 204-205 sits above toggleSpotlight instead of forgeRefresh (223).
- **Why it matters:** Comments describe the code beside them.
- **Fix:** Delete or rewrite each comment. Move the 204-205 comment down to forgeRefresh and the 77-78 comment next to forgeOn.
- **Repro:** Read the cited lines.
- **Evidence:** grep -n 'legacy\|drag-to-place\|drag from the index' server/routes/atlas.js; grep -n 'map/:id\|tooltip' server/server.js server/routes/image-base64.js
- **Re-proved:** atlas.js:9 says 'Additive to the legacy API', but the legacy API was deleted in commit a140976. atlas.js:282 says 'drag-to-place' and :394 says 'drag from the index', yet `grep -rn "draggable\|onDragStart\|dataTransfer" client/src` finds only image-drag suppression and ImageManager file upload. atlas.js:337 says 'title / view / backdrop image', but cols at :340 also take focus_start, focus_end and dm_note. server.js:118 names '/map/:id', but App.jsx has no such route (routes are /w/:worldId/m/:…
- **Also found as:** "Stale comments still describe drag-from-index placing and a legacy API that wer…" (canvas); "atlas.js comments contradict the time model: 'scrub position', 'Additive to the…" (time); "Stale comments around the inspector's routes: 'Additive to the legacy API', Ele…" (inspector)

### O020 · Voice comments still describe the ElevenLabs-only era, and elevenlabs.enabled is a dead export

Obsolete · low · effort xs · found by `docs-hygiene` (+1 other lane)

- **Where:** server/server.js:104, server/routes/voice.js:1-2, server/config/schema.sql:190-192, server/voice/elevenlabs.js:1-6,59
- **Files:** `server/server.js:104`, `server/routes/voice.js:1`, `server/config/schema.sql:190`, `server/voice/elevenlabs.js:6`
- **What happens:** server.js:104 says the voice route is 'inert without ELEVENLABS_API_KEY'. voice.js:1-2 says 'without ELEVENLABS_API_KEY every route but /status answers 404'. schema.sql:190 says 'Voice (ElevenLabs, inert without ELEVENLABS_API_KEY) … (MP3 in R2)'. elevenlabs.js:1-2 says it is 'The only outward connection of the voice layer'. In fact providers.js picks Gemini, then OpenAI, then ElevenLabs (:34-38), and Gemini lines are WAV (:87). elevenlabs.js exports `enabled` (:6, :59), but nothing reads it (`git grep -n 'eleven.enabled'` → none; providers.js only uses listVoices/speak/soundscape).
- **Why it matters:** Comments match the three-provider design documented in CLAUDE.md:185-192.
- **Fix:** Reword the four comments to 'inert with no voice key (Gemini/OpenAI/ElevenLabs) or VOICE_ENABLED=0'. Drop 'MP3'. Remove `enabled` from elevenlabs.js.
- **Repro:** git grep -n ELEVENLABS_API_KEY -- server; git grep -n 'eleven\.' server/voice/providers.js
- **Re-proved:** server/server.js:104 reads '// voices and ambience — inert without ELEVENLABS_API_KEY'. server/routes/voice.js:1-2 reads 'without ELEVENLABS_API_KEY every route but /status answers 404', but the gate at :17 is voice.status().enabled, which is true with any of the Gemini/OpenAI/ElevenLabs keys. schema.sql:190-191 reads 'Voice (ElevenLabs, inert without ELEVENLABS_API_KEY) ... (MP3 in R2)'. elevenlabs.js:1-2 reads 'The only outward connection of the voice layer'. providers.js:33-38 tries a pinned…
- **Also found as:** "Comments and env docs still describe voice as ElevenLabs-only and the Forge's o…" (forge-voice)

### O021 · Comments and docs describe code that is gone or changed

Obsolete · low · effort s · found by `confusing-code` (+1 other lane)

- **Where:** Some details are wrong. The storage.js 'for future world/folder purges' comment is at server/storage.js:53, not :66. partyNextFrom is defined at client/src/utils/moment.js:26 (its comment is at 24), not :22. On links.kind/time_context: the server does SELECT them and return them (atlas.js:319-321, 413-415) and copies them on clone and restore (227-228, 625-626). The accurate claim is that no client code consumes them, not that nothing reads them.
- **Files:** `server/routes/atlas.js:9`, `server/routes/atlas.js:282`, `server/routes/atlas.js:394`, `server/routes/atlas.js:494`, `server/routes/atlas.js:700`, `server/routes/worlds.js:154`, `server/server.js:104`, `server/routes/voice.js:1`, `server/config/schema.sql:190`, `server/routes/share.js:104`, `client/src/components/EraScrub.jsx:6`, `client/src/pages/AtlasWorkspace.jsx:204`, `client/src/utils/moment.js:1`, `README.md:3`, `.env.example:19`, `CLAUDE.md:47`
- **What happens:** atlas.js:9 'Additive to the legacy API' (legacy deleted Aug 2026) and schema.sql:107 'Additive to the legacy tables'; atlas.js:282 '(for browse + drag-to-place)' and 394 '(drag from the index)' — no drag-to-place exists (grep dataTransfer/onDragStart: only ImageManager); atlas.js:337 PATCH maps comment omits focus/dm_note; atlas.js:494 PATCH nodes comment omits dm_note/stance/pin/pin_size and the placement-reveal side effect; atlas.js:700-701 link-label note sits above the eras routes; worlds.js:154 'soft delete' while 169-170 hard-deletes (and 169 mentions the dropped events table) — is_active is never set false anywhere (grep 'is_active = false' → none), so every is_active=true check is vestigial; server.js:104, voice.js:1-2, schema.sql:190 say voice is ElevenLabs-gated (three providers; live provider is gemini); server.js:118 cites a /map/:id route; image-base64.js:115-117 'event tooltip blobs'; storage.js:66 'for future world/folder purges' (used by world delete); share.js:104 'No min/max: players don't scrub' (they scrub revealed eras; the response carries eras); EraScrub.jsx:6 'the commit only fires when the drag ends' and 29-31 describe a non-live mode no caller uses (both pass `live`: AtlasWorkspace.jsx:1330, PlayerView.jsx:292); AtlasWorkspace.jsx:77-78 Forge comment sits above the trail state, 204-205 'After the Forge lands a batch…' sits above the lantern code, 20 lines from forgeRefresh (223); moment.js:1-3 documents momentLabel at the top of the file but the function is at 55; partyNextFrom (moment.js:22) has no caller since 4c1baa7; admin.js:23 expectedTables list is stale; README.md:3-4 'place events across a map… Your most-developed app', README.md:33 and .env.example:19 'Sign in with bennettdishman.com' while the button says 'Sign in with Waypoint' (Login.jsx:179); package.json:4 'plotting events'; CLAUDE.md:47 table list omits tombstones, world_minds, mind_messages, forge_batches; links.kind/time_context documented as 'reference or portal … pinned to a moment' (schema.sql:142) but nothing reads them.
- **Why it matters:** Comments describe the current code.
- **Fix:** Edit or delete each listed comment; delete EraScrub's non-live branch and partyNextFrom; update README/.env.example/package.json/CLAUDE.md table list.
- **Repro:** Each line cited above; grep -rn 'portal' finds only schema.sql:142 and a doc checkbox.
- **Re-proved:** I opened every cited line at HEAD 32ef89c. Almost all of them are as the finder describes. atlas.js:9 and schema.sql:107 say 'Additive to the legacy...', but git log --diff-filter=D shows maps.js and events.js were deleted in a140976 (2026-08-17). atlas.js:282 says 'drag-to-place' and :394 says 'drag from the index', but grep for dataTransfer, onDragStart and draggable in client/src finds only ImageManager file drops and draggable={false} on images. atlas.js:337 is commented 'title / view / bac… _(partly — the corrected location is used above)_
- **Also found as:** "Comments that describe behaviour the code no longer has" (docs-hygiene)

### O024 · Stale comments and docs: 'players don't scrub'; 'All players use AudioClip'

Obsolete · low · effort xs · found by `player-desktop` (+1 other lane)

- **Where:** The CLAUDE.md part is imprecise, not obsolete. 'All players use components/AudioClip.jsx' (CLAUDE.md:195-196) was added in 680548e, when the Player View ambience was already a raw tap toggle. The same sentence says 'a map's ambience is a tap-to-play toggle in the top bar', and the hidden <audio> has no native controls, so the palette caveat never applied to it. Nothing overwrote the doc; it is loosely worded. The stale share.js:104 comment and the swallowed play() rejection at PlayerView.jsx:42 stand as stated.
- **Files:** `server/routes/share.js:104`, `client/src/pages/PlayerView.jsx:36-43`, `client/src/pages/PlayerView.jsx:177-182`, `CLAUDE.md`
- **What happens:** share.js:104 says '/world — … No min/max: players don't scrub.' Players have scrubbed the revealed past since dd7888c (and /world returns eras for exactly that). CLAUDE.md says 'All players use components/AudioClip.jsx', but the Player View's ambience toggle is a raw <audio> plus a custom 🔈 button (PlayerView.jsx:177-182). Its play() failure is swallowed (.catch(() => {})), with no feedback.
- **Why it matters:** Comments and docs match the code.
- **Fix:** Change the share.js comment to 'No min/max: players scrub only the revealed eras returned here'. Change CLAUDE.md to 'voice lines use AudioClip; ambience in the Player View is a tap toggle'. Show an error state when ambRef.play() rejects.
- **Repro:** Read share.js:104 and PlayerView.jsx:36-43 and 177-182.
- **Evidence:** git log -S "players don't scrub" → 3d57653 (the original share link); scrubbing added in dd7888c
- **Re-proved:** share.js:104 reads '// GET /:token/world — … No min/max: players don't scrub.' `git log -S` traces it to 3d57653. Players have scrubbed since dd7888c ('Eras: players scrub the revealed past'), and a live /world returned the eras array used for that. PlayerView.jsx:42 has `a.play().then(() => setAmbOn(true)).catch(() => {})`, so a failed play() gives no feedback. PlayerView.jsx:177-182 uses a raw hidden <audio> plus a custom ambbtn button, while the voice line uses AudioClip (line 318). _(partly — the corrected location is used above)_
- **Also found as:** "Stale comments in share.js say players don't scrub and see nothing outside the …" (postures-share)

