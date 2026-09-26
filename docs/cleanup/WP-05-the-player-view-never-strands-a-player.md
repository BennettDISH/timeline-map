# WP-05 · The Player View never strands a player

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** A working share link should always leave the player on a map with a way back. Tell a dead token apart from a map that is missing, hidden or not yet built, and make marker failures and stale sheets visible.

**Do after:** [WP-01](WP-01-close-the-leaks-in-the-share-api-and-image-ids.md)

**Notes:** player-desktop-02 and player-desktop-03 share one cause: load() in PlayerView.jsx treats any 404 as a dead link. Tell a token 404 apart from a map 404 and fall back to the nearest visible map. auth-02: the /p/ route must not run the DM's dead-token redirect. This comes after WP-01 because the node endpoint's 404 cases change there. Re-run e2e/player.mjs on desktop and at phone width.

## Checklist

- [ ] **B009** · high · s · Scrubbing the past inside a later-built place turns the Player View into a permanent 'This link isn't active' screen
- [ ] **B017** · medium · s · Share link bounces a player to the DM login page when the browser holds a stale auth token
- [ ] **C002** · medium · s · A deep link to a hidden or missing map says the share link is dead and offers no way back to the map
- [ ] **C019** · medium · s · Threads show incoming links like outgoing ones, so a backlink's label reads backwards
- [ ] **P004** · medium · s · If the first load fails (network or 500), the page shows 'Opening the world…' indefinitely
- [ ] **P017** · medium · xs · Player marker failures are silent, and Enter doesn't submit the marker form
- [ ] **C030** · low · xs · The 404 page shows 'Account ▾ › Sign out' to signed-out visitors and sends players with a mangled share link to 'your worlds'
- [ ] **C061** · low · xs · Category list defined three times; the Player View marker form offers '⚑ The party', which the server silently saves as a Note
- [ ] **C075** · low · xs · The lantern hop for the current map looks like a link but does nothing when tapped
- [ ] **C082** · low · s · ⌖ 'Go there' on a thread to something that exists only in the revealed past always fails with 'try again'
- [ ] **P034** · low · s · Player View has no legend or help, so first-time players can't decode the map symbols
- [ ] **P071** · low · xs · Marker form: while marking, a tap on a pin opens its sheet; the Return key doesn't submit
- [ ] **P072** · low · s · Offline navigation moves the URL but leaves the previous map on screen
- [ ] **P074** · low · xs · Dragging the map closes the open sheet
- [ ] **P076** · low · xs · An open player sheet never refreshes on the 45 s poll, so a reveal doesn't show while it's open

## Items

### B009 · Scrubbing the past inside a later-built place turns the Player View into a permanent 'This link isn't active' screen

Broken · high · effort s · found by `player-desktop`

- **Where:** Player View › inside an interior › era bar; client/src/pages/PlayerView.jsx:47-60, 26, 124-133
- **Files:** `client/src/pages/PlayerView.jsx:52`, `client/src/pages/PlayerView.jsx:57`, `client/src/pages/PlayerView.jsx:26`, `server/routes/share.js:127-129`
- **What happens:** I opened Watchtower (placement start 30) on /p/<token>, went inside (◎), pressed Home on the era bar ('Before the Flood · footstep 1'), then the next refresh ran (45 s poll or tab refocus). load() sends viewTRef.current as ?t= on the windowed map fetch. walkUp runs at t=1, when the owner's placement did not exist yet, so the server returns 404, setGone(true) fires, and the page shows 'This link isn't active — Ask your DM for a fresh share link.' gone is never reset, and the same PlayerView instance serves /p/:token and /p/:token/m/:id. Browser Back to the valid root map (/p/<token>) still shows the dead-link page. Only a full reload recovers.
- **Why it matters:** A working link never shows as dead. The windowed payload already covers every allowed moment, so the map fetch has no need to walk at the scrubbed moment. A 404 on one map should not poison later navigation.
- **Fix:** PlayerView.jsx:52: stop passing viewTRef.current to getMap. The windowed fetch should walk at canon, or share.js should walk with the window envelope. Call setGone(false) at the start of the [token, mapId] effect. Distinguish a world 404 (a real dead link) from a map 404 (see the deep-link finding). The spotlight-trail links and the 'Then on to' links hit the same code path whenever viewT is in the past.
- **Repro:** /p/<token> → Watchtower ◎ → focus the era range → Home → wait 45 s, or switch tabs and come back → dead-link page → browser Back → still dead. Screenshot: /tmp/claude-1000/-home-bennett-repos/fad7b677-1261-40ae-b46f-e65ab93eee86/scratchpad/audit/lanes/player-desktop/shots/31-tower-past-after-refresh.png
- **Evidence:** log.http: '404 GET /api/share/<token>/maps/190' after the refresh; after goBack the url is /p/<token> and .deadlink count is 1
- **Re-proved:** Code: PlayerView.jsx:52 passes viewTRef.current to getMap. share.js:127-129 runs walkUp at that allowed t and 404s. PlayerView.jsx:57 calls setGone(true) on a 404, and nothing resets it: setGone(false) appears nowhere. App.jsx:106-107 mounts the same <PlayerView/> element for /p/:token and /p/:token/m/:mapId, so its state carries over. Live on my clone: I made a shared 'Verify Tower' placed from start 30 and gave it an interior. API: interior at canon returns 200; ?t=1&window=1 and ?t=12&window…

### B017 · Share link bounces a player to the DM login page when the browser holds a stale auth token

Broken · medium · effort s · found by `auth`

- **Where:** /p/:token (Player View) on any browser with a dead auth_token in localStorage; client/src/utils/AuthContext.jsx:52-74 + client/src/services/http.js:31-36
- **Files:** `client/src/App.jsx:115-124`, `client/src/utils/AuthContext.jsx:52-74`, `client/src/services/http.js:31-36`
- **What happens:** AuthProvider wraps every route, including the public /p/*. With a bad token in localStorage (garbage, or a JWT signed with the wrong secret), opening a valid share link /p/6S1IiS6FOueKWmSR6IGnZNHJ calls /api/auth/me and gets 403. The http.js interceptor then sets window.location.href = '/login', so the player lands on 'Fantasy Map Timeline – Sign in to your account' instead of the map. Navigations recorded: /p/… → /login. The same link with no token opens the Player View normally. Real ways to get a dead token: the DM's own phone after 24h idle, a sign-out on another device (once revocation works), or a player who once clicked 'Continue as guest'. It also spends one general-bucket request (/api/auth/me) on every Player View load for anyone holding a live token.
- **Why it matters:** The Player View is public and should never look at, or act on, the DM session.
- **Fix:** Skip checkAuth for public routes, either by moving <AuthProvider> inside the Router and wrapping only the authed routes, or by having checkAuth return early when location.pathname starts with /p/. Also make the http.js interceptor never hard-redirect while window.location.pathname starts with '/p/'.
- **Repro:** Fresh profile › localStorage.setItem('auth_token','garbage') › open https://timeline-map-production.up.railway.app/p/<valid token> › you end up on /login.
- **Evidence:** lanes/auth/garbage.mjs output: player-garbage and player-wrongsecret finalUrl '/login', http ['403 GET /api/auth/me']; player-notoken stays on /p/…; screenshots lanes/auth/shots/player-garbage.png, player-wrongsecret.png
- **Re-proved:** In App.jsx:115-124, AuthProvider wraps the whole Router, so the mount effect at AuthContext.jsx:52-74 runs on /p/:token too. With any token in localStorage it calls /api/auth/me. For a garbage token, middleware/auth.js:41-45 returns 403 'Invalid token' (or 'Token expired'). That message matches TOKEN_MSG in http.js:23, and /auth/me does not match CREDENTIAL_URL, so http.js:32-36 sets window.location.href='/login'. Live repro in verify/auth-b1/auth-verify2.mjs: a clean browser context with local…

### C002 · A deep link to a hidden or missing map says the share link is dead and offers no way back to the map

Confusing · medium · effort s · found by `player-desktop` (+3 other lanes)

- **Where:** /p/<token>/m/<DM-only or bad map id>; client/src/pages/PlayerView.jsx:124-133
- **Files:** `client/src/pages/PlayerView.jsx:47-60`, `client/src/pages/PlayerView.jsx:124-133`
- **What happens:** /p/<token>/m/189 (a DM-only interior), /m/999999, /m/abc and /m/1 (another world's map) all render 'This link isn't active — Ask your DM for a fresh share link.' The token is valid: GET /world succeeded just before. The page has no link to the world's root map and the tab title stays 'Fantasy Map Timeline'.
- **Why it matters:** The server 404 is correct, but the page should say something like 'This place isn't on your map' and offer a button to /p/<token>. 'This link isn't active' should appear only when /world itself returns 404.
- **Fix:** In load(), keep separate states for world-404 (dead link) and map-404 (place unavailable). For the latter, render the top bar with the world name and a '⬆ Back to <root title>' button that navigates to /p/:token. The same fix also covers the case where the DM hides a branch while a player is inside it (the poll 404s).
- **Repro:** Open /p/<token>/m/<id of a DM-only interior>. Screenshots: /tmp/claude-1000/-home-bennett-repos/fad7b677-1261-40ae-b46f-e65ab93eee86/scratchpad/audit/lanes/player-desktop/shots/40-deeplink-dm-map.png, 45-other-world-map.png
- **Evidence:** log.http: 404 GET /api/share/<token>/maps/189, /maps/999999, /maps/abc, /maps/1; all show the same dead-link copy
- **Re-proved:** Code: PlayerView.jsx:55-57 treats any 404 from getWorld or getMap the same way (setGone). The gone render (124-133) contains only the emoji, 'This link isn't active' and 'Ask your DM for a fresh share link.', with no link or button. No document.title is set in PlayerView: the only setters are in Dashboard.jsx:76 and ImageManager.jsx:71, and index.html:10 is 'Fantasy Map Timeline'. Live on my clone with a valid token, fresh loads of /p/<token>/m/339 (a DM-only node's interior), /m/999999 and /m/…
- **Also found as:** "A valid share link opened on a missing or hidden map says “This link isn't acti…" (copy); "A missing or hidden map under a working link shows 'This link isn't active' and…" (mobile); "A player inside an interior the DM hides gets 'This link isn't active — ask for…" (postures-share)

### C019 · Threads show incoming links like outgoing ones, so a backlink's label reads backwards

Confusing · medium · effort s · found by `player-desktop`

- **Where:** Player View › node sheet › Threads; client/src/pages/PlayerView.jsx:340-347
- **Files:** `client/src/pages/PlayerView.jsx:340-347`, `client/src/pages/AtlasWorkspace.jsx:2018-2021`
- **What happens:** Links and backlinks are merged and rendered the same way, '<other> — <label>'. Only the text colour differs (.lrow.in is muted). The link 'The Keep → Warden Brakk: commanded by' shows on Brakk's sheet as 'The Keep — commanded by', which reads as if Brakk is commanded by the Keep. Old Gate's sheet likewise shows 'The Keep — guarded by, once'. The DM reader marks backlinks with '← … refers here' (AtlasWorkspace.jsx:2018-2021).
- **Why it matters:** The direction of each link should be readable.
- **Fix:** Render backlinks the way the DM reader does ('← <title> — <label>', plus 'refers here'), or split them into two groups ('Links' / 'Mentioned by').
- **Repro:** /p/<token> → Keep ◎ → click Warden Brakk → Threads. Screenshot: /tmp/claude-1000/-home-bennett-repos/fad7b677-1261-40ae-b46f-e65ab93eee86/scratchpad/audit/lanes/player-desktop/shots/103-image-sheet.png
- **Evidence:** Brakk sheet text: 'THREADS | The Keep — commanded by' for link 172 (from 556 to 564)
- **Re-proved:** Code: PlayerView.jsx:340-347 merges [...detail.links, ...detail.backlinks] and renders every row the same way, '{otherTitle} — {label}'. Only the lrow class differs; atlas.scss:192 '.lrow.in .lgo{color:var(--muted)}' mutes the text. The DM reader at AtlasWorkspace.jsx:2019-2021 renders '← {title} — label' plus 'refers here'. World 55's API shows link 172 (The Keep → Warden Brakk, 'commanded by') as a backlink on Brakk. On my clone I added the same link. Brakk's player sheet showed THREADS '▲The…

### P004 · If the first load fails (network or 500), the page shows 'Opening the world…' indefinitely

Product polish · medium · effort s · found by `player-desktop`

- **Where:** /p/<token> initial load; client/src/pages/PlayerView.jsx:55-59, 135-137
- **Files:** `client/src/pages/PlayerView.jsx:55-59`, `client/src/pages/PlayerView.jsx:135-137`
- **What happens:** With /api/share aborted, or answering 500, on first load, the page showed only 'Opening the world…' (checked at 4–6 s). The catch sets stale=true, but the stale chip lives in the top bar, which is not rendered until world and data exist. Nothing changes until the 45 s poll happens to succeed.
- **Why it matters:** An error state with a retry button, such as 'Couldn't reach the map — Try again'.
- **Fix:** When !world || !data and stale is true, render an error message with a button that calls load(). Optionally retry with backoff instead of waiting for the 45 s interval.
- **Repro:** Block /api/share/** and open /p/<token>. Screenshot: /tmp/claude-1000/-home-bennett-repos/fad7b677-1261-40ae-b46f-e65ab93eee86/scratchpad/audit/lanes/player-desktop/shots/48-initial-net-fail.png
- **Evidence:** #root text after 6 s of network abort: 'Opening the world…'; same with a mocked 500
- **Re-proved:** Code: PlayerView.jsx:55-59. The catch sets stale=true for anything that is not a 404 or 410. :135-137 returns only the 'Opening the world…' loading div while !world || !data, and the stalechip (line 171) sits inside the top bar, which never renders in that state. Reproduced on my clone: with /api/share/** aborted, #root text after 6 s was exactly 'Opening the world…'. The same text showed with /api/share/** answering 500. One small addition: a visibilitychange (returning to the tab) also calls …

### P017 · Player marker failures are silent, and Enter doesn't submit the marker form

Product polish · medium · effort xs · found by `journey` (+4 other lanes)

- **Where:** Player View › ✍ Mark the map › form; client/src/pages/PlayerView.jsx:111-123, 369-405
- **Files:** `client/src/pages/PlayerView.jsx:120`, `client/src/pages/PlayerView.jsx:369`, `server/routes/share.js:281`
- **What happens:** submitMarker's catch is empty ('/* the form stays open to retry */'). The server's messages 'A marker needs a name', 'The map is full of markers — ask your DM to tidy up' (share.js:281, 289) and the 40/hour 429 never reach the player; the button just flips back from 'Placing…'. After a success there's no confirmation either, and a player has no way to fix or remove their own marker. Pressing Enter in 'What is here?' did nothing (the modal stayed open, 0 POSTs).
- **Why it matters:** A player at the table who can't place a marker is told why. Enter submits.
- **Fix:** Keep an error state in MarkerForm and show err.response.data.message (or 'Too many markers from this table — try again later' on 429). Wrap the inputs in <form onSubmit={submit}>. Flash 'Placed — everyone sees it' on success.
- **Repro:** On a phone, open /p/<token> › ✍ Mark the map › tap the map › type a title › press Enter → nothing. Code: PlayerView.jsx:120. Script: lanes/journey/p2.mjs
- **Evidence:** p2: 'after Enter in title: modal still open=1 posts=0'; PlayerView.jsx:120 `} catch (err) { /* the form stays open to retry */ }`
- **Re-proved:** Code: PlayerView.jsx:120 is `} catch (err) { /* the form stays open to retry */ }`. There is no error state, and success only calls setMarkForm(null) + load() with no flash. MarkerForm has no <form> element, and submit is attached only to the button's onClick, so Enter does nothing. share.js has only POST for markers (line 274), with no player PATCH/DELETE. Live, mobile iPhone 13, on my clone: after ✍ Mark the map › tap plane › type title › Enter, the modal stayed open with 0 POSTs. I intercept…
- **Also found as:** "A failed player marker gives no feedback: the error is swallowed and the button…" (client-dead); "Player marker submit failures are silent: the form just stays open" (player-desktop); "A marker that fails to save shows no message: the form just resets its button" (mobile); "A failed player marker shows no message, and a player who picks “The party” cat…" (copy)

### C030 · The 404 page shows 'Account ▾ › Sign out' to signed-out visitors and sends players with a mangled share link to 'your worlds'

Confusing · low · effort xs · found by `auth` (+2 other lanes)

- **Where:** Any unknown path, e.g. /definitely/not/a/page, /p, /p/, /p/abc/m/; client/src/pages/NotFound.jsx, client/src/components/TopBar.jsx:46-56
- **Files:** `client/src/components/TopBar.jsx:46-56`, `client/src/pages/NotFound.jsx:15-20`, `client/src/App.jsx:106-109`
- **What happens:** Signed out, the 404 shows an 'Account ▾' button whose menu offers 'Sign out'. A player whose share link was truncated (/p, /p/, /p/abc/m/, checked on an iPhone viewport) gets this DM-side 'This page is on no map … head back to your worlds' page with a 'To your worlds' button that leads to the DM login. A mistyped token (/p/garbage) instead gets the player-friendly 'This link isn't active — Ask your DM for a fresh share link.'
- **Why it matters:** No account menu when signed out, and anything under /p/ answered in player terms.
- **Fix:** In TopBar, render the usermenu only when `user` is set (show a 'Sign in' link otherwise). Add `<Route path="/p/*" element={<PlayerLinkDead />} />` (reuse PlayerView's gone screen) before the catch-all.
- **Repro:** Signed out › open /definitely/not/a/page › click Account ▾. On a phone, open /p/ or /p/abc/m/.
- **Evidence:** lanes/auth/anon1.mjs nfMenu 'Sign out'; ptrunc.mjs output for /p, /p/, /p/abc/m/; screenshots lanes/auth/shots/notfound-signedout.png, notfound-menu.png, p-truncated-mobile.png
- **Re-proved:** Code: client/src/components/TopBar.jsx:46-56 always renders the .usermenu. The button shows `user?.username || 'Account'` and the menu always contains <button onClick={signOut}>Sign out</button>, with no check on `user`. client/src/App.jsx:106-107 only routes /p/:token and /p/:token/m/:mapId, so /p, /p/ and /p/abc/m/ (react-router 6.20, where the trailing slash is dropped and a dynamic segment cannot be empty) fall through to the catch-all `*` → NotFound (App.jsx:109). NotFound.jsx:13-15 shows …
- **Also found as:** "Signed-out visitors on the 404 page get an 'Account ▾' menu whose only item is …" (dashboard); "Mistyped /p/ URLs land on the DM's NotFound page with 'Account ▾' and 'To your …" (player-desktop)

### C061 · Category list defined three times; the Player View marker form offers '⚑ The party', which the server silently saves as a Note

Confusing · low · effort xs · found by `confusing-code` (+4 other lanes)

- **Where:** Player View › ✍ Mark the map › category dots; client/src/pages/PlayerView.jsx:381-385
- **Files:** `client/src/pages/PlayerView.jsx:381`, `client/src/utils/categories.js:3`, `server/routes/share.js:273`, `server/routes/share.js:283`, `server/forge/contract.js:13`
- **What happens:** client/src/utils/categories.js CATS has 7 keys including party. server/routes/share.js:273 MARK_CATS and server/forge/contract.js:13 CATS have 6 (no party). MarkerForm renders every CATS entry, and share.js:283 turns anything not in MARK_CATS into 'note' with no message, so a player who picks the party icon gets a • Note pin. Atlas hand-edit routes accept any category string (atlas.js:382-388, 498).
- **Why it matters:** The form offers only what the server accepts, from one list.
- **Fix:** Export a MARKABLE list (or a `markable` flag on CATS) and use it in MarkerForm; on the server, one CATEGORIES constant (e.g. server/lib/vocab.js) shared by share.js, contract.js and atlas.js validation.
- **Repro:** Code trace (no marker budget): PlayerView.jsx:381 Object.entries(CATS) vs share.js:273.
- **Re-proved:** categories.js:3-12 CATS has 7 keys, including party ('⚑', 'The party'). PlayerView.jsx:381 MarkerForm renders `Object.entries(CATS)` with no filter, and submitMarker passes the chosen category straight to the server. share.js:273 MARK_CATS has 6 entries with no party, and share.js:283 quietly replaces anything outside that list with 'note'. contract.js:13 CATS also has 6. schema.sql:119 has no CHECK on category. Live check on my own clone (world 94, since deleted): PATCH /api/atlas/nodes/969 {c…
- **Also found as:** "Marker form offers '⚑ The party', but the server silently saves the marker as a…" (journey); "The marker form offers a 'The party' (⚑) category that the server silently turn…" (player-desktop); "The marker form offers '⚑ The party' but the server saves it as a Note without …" (mobile); "The player marker form offers 'The party' category, which the server silently t…" (client-dead)

### C075 · The lantern hop for the current map looks like a link but does nothing when tapped

Confusing · low · effort xs · found by `mobile`

- **Where:** The .here hop has no dotted underline. It is a gold box with a solid border on all sides (atlas.scss:572 sets border:1px solid and border-bottom-style:solid; computed border-bottom-style is 'solid'). The dotted underline is only on the other hops. The no-op also applies to any hop whose mapId is the current map, not only the lit last node. On map 217 it was the first hop, while the lit node sits on map 227.
- **Files:** `client/src/pages/PlayerView.jsx:190-195`
- **What happens:** `onClick={() => { if (s.mapId !== map?.id) navigate(...) }}`. On the map where the lit node sits, its hop (gold box, pointer cursor, dotted underline) is a no-op. Tapping 'The Very Long Named Tower…' left the URL unchanged and opened no sheet.
- **Why it matters:** Tapping the lit node opens its sheet, or at least doesn't look tappable.
- **Fix:** When `s.mapId === map.id`, call `openNode(s.nodeId)` instead of doing nothing.
- **Repro:** Set a spotlight (POST /api/atlas/worlds/:id/spotlight), open /p/<token> on iPhone 13, tap `.dmtrail a.here`. Lane pv10.mjs.
- **Re-proved:** PlayerView.jsx:190-195: onClick={() => { if (s.mapId !== map?.id) navigate(...) }}, so any hop on the current map does nothing. Live on iPhone 13 at /p/<66 token>/m/217: the .dmtrail a.here hop is 'The Very Long Named Tower…' with cursor:pointer and a gold background. Tapping it left the URL unchanged, and .sheet count stayed 0. _(partly — the corrected location is used above)_

### C082 · ⌖ 'Go there' on a thread to something that exists only in the revealed past always fails with 'try again'

Confusing · low · effort s · found by `player-desktop` (+1 other lane)

- **Where:** The title says it 'always fails'. It fails only while the era bar is at a moment when the target is not placed (canon here). If the player first scrubs the era bar into the revealed past (t ≤ 8), goTo passes viewT and ⌖ succeeds. The misleading 'try again' at canon is real.
- **Files:** `client/src/pages/PlayerView.jsx:93-96`, `server/routes/share.js:337-352`
- **What happens:** The Keep's thread 'Old Gate' (placement ends at 8, in the revealed 'Before the Flood' era) opens fine, but its ⌖ at canon calls /nodes/559/locate, gets 404 and flashes 'Couldn't find where that is — try again.' Trying again can never succeed.
- **Why it matters:** Either locate within the revealed past (and move the era bar to a moment when it exists) or say that it is not on any map right now.
- **Fix:** On a 404, flash 'Not on any map at this moment'. Better: have /locate (share.js:337-352) fall back to the latest allowed moment when the node was placed, return {mapId, t}, and have goTo call setViewT(t).
- **Repro:** /p/<token> → The Keep → Threads → ⌖ next to Old Gate. Screenshot: /tmp/claude-1000/-home-bennett-repos/fad7b677-1261-40ae-b46f-e65ab93eee86/scratchpad/audit/lanes/player-desktop/shots/104-oldgate-flash.png
- **Evidence:** log.http '404 GET /api/share/<token>/nodes/559/locate'; flash text "Couldn't find where that is — try again."
- **Re-proved:** Code: goTo (PlayerView.jsx:93-96) flashes "Couldn't find where that is — try again." on any error. /locate (share.js:337-352) returns 404 when the node has no present placement at the resolved moment t. Reproduced on my clone of world 27. Old Gate's placement ends at 8, the 'Before the Flood' era (1–8) is revealed, and canon is 12. The Keep → Threads → ⌖ on 'Old Gate — guarded by, once' gave 404 GET /nodes/1093/locate and the flash "Couldn't find where that is — try again."; the URL did not cha… _(partly — the corrected location is used above)_
- **Also found as:** "'Go there' (⌖) on a thread to something not on any map right now says 'try agai…" (mobile)

### P034 · Player View has no legend or help, so first-time players can't decode the map symbols

Product polish · low · effort s · found by `journey`

- **Where:** 'The only hint is the tooltip Click to type a year' is wrong. The Player View has many title tooltips: nowchip 'The current moment, set by your DM', footprint '… — click to look at this moment', ◎ 'Go inside', '✍ Add your own marker to the map', '⦿ Back to the present', the dmtrail 'Your DM is showing the way — follow the glow' (PlayerView.jsx:183) and psig 'A player's marker, signed …' (224). All of them are tooltips, so touch screens never show them. The only visible text hint is the markhint 'Tap the map where you want your marker.' (PlayerView.jsx:287).
- **Files:** `client/src/pages/PlayerView.jsx:148`, `client/src/pages/AtlasWorkspace.jsx:1230`
- **What happens:** The DM workspace has a '?' popover explaining ◎, faint / dashed purple / dashed green / gold glow and the gestures. The Player View has none (0 help buttons). A first-time player at the table sees ◎ buttons, 'S4·9' tags on the party, gold footprint dots, dashed-green ✍ pins, a gold 🔦 bar, era chips reading 'B / S. / S.', and '⦿ Now', with nothing explaining them. The only hint is the tooltip 'Click to type a year', which touch screens never show.
- **Why it matters:** A short, plain legend available to players.
- **Fix:** Add a '?' tool in PlayerView's stage (reuse .helpwrap/.helppop) listing: tap a pin to read · ◎ go inside · ✍ a player's marker · gold 🔦 = your DM is pointing here · dots = where the party has been (tap to look back) · S3·7 = session 3, footstep 7.
- **Repro:** Open /p/<token> on a phone and look for any help. Script: lanes/journey/s14.mjs ('player help buttons: 0')
- **Evidence:** s14: 'player help buttons: 0'; AtlasWorkspace.jsx:1230-1245 has the DM-only legend
- **Re-proved:** PlayerView.jsx (all 402 lines read) has no help or '?' button and no legend. On my clone's phone Player View I counted 0 .helpwrap/.helppop/'?' buttons and 0 .legend. The DM-only help popover is at AtlasWorkspace.jsx:1230-1245 and holds the colour and gesture legend. _(partly — the corrected location is used above)_

### P071 · Marker form: while marking, a tap on a pin opens its sheet; the Return key doesn't submit

Product polish · low · effort xs · found by `mobile`

- **Where:** Player View › ✍ Mark the map (armed) and MarkerForm; PlayerView.jsx:224-230, 375-397
- **Files:** `client/src/pages/PlayerView.jsx:224-230`, `client/src/pages/PlayerView.jsx:283-289`, `client/src/pages/PlayerView.jsx:375-397`
- **What happens:** Armed ('Tap the map where you want your marker.'), a tap on The Flood opened The Flood's sheet and marking stayed armed. On phones, where labels cover much of the map, you can't mark anywhere a label covers. In the form, pressing Enter in the title or signature field sends nothing (0 POSTs, modal stays open) because the inputs aren't in a <form>, so the phone keyboard's Go/Return key does nothing.
- **Why it matters:** While marking, the whole map takes the drop. Return places the marker when the title is filled.
- **Fix:** While `marking`, add a class that sets `.pview .pin{pointer-events:none}` (as `.regions.inert` already does). Wrap MarkerForm's fields in `<form onSubmit={submit}>` with the Place button as `type=submit`.
- **Repro:** Lane pv5.mjs ('armedPinTap') and pv11.mjs (route-intercepted POST counter), iPhone 13.
- **Re-proved:** Code: in PlayerView.jsx:224-230 the pin's onPointerDown/onClick stop propagation and call openNode without checking `marking`. MapPlane.endPointer only counts a world tap when the viewport saw the pointerdown, so a pin tap never reaches onMarkClick. Only `.regions.inert .region` gets pointer-events:none (atlas.scss:733); pins get nothing. MarkerForm (375-397) has no <form> and no key handler. I reproduced it on my own clone 120 (iPhone 13, verify/mobile-b4/pv.mjs). With marking armed, a tap on …

### P072 · Offline navigation moves the URL but leaves the previous map on screen

Product polish · low · effort s · found by `player-desktop`

- **Where:** Player View › ⬆ back / crumbs while the share API is unreachable; client/src/pages/PlayerView.jsx:47-60
- **Files:** `client/src/pages/PlayerView.jsx:47-60`, `client/src/pages/PlayerView.jsx:167`
- **What happens:** With /api/share aborted inside the 'Poll Test Pin' interior, clicking ⬆ changed the URL to /m/179, but the crumbs, back button and empty interior of the old map stayed. The only sign was the small 'offline?' chip. The back button then points at the map you are supposedly already on.
- **Why it matters:** A failed navigation says so ('Couldn't open that place — retry') instead of keeping a different map under the new URL.
- **Fix:** When a fetch fails and data.map.id differs from the requested mapId, show a retry state for the requested map rather than the last good data. Keep the stale-view behaviour only for polls of the same map.
- **Repro:** Enter an interior → block /api/share/** → click ⬆. Screenshot: /tmp/claude-1000/-home-bennett-repos/fad7b677-1261-40ae-b46f-e65ab93eee86/scratchpad/audit/lanes/player-desktop/shots/107-nav-offline.png
- **Evidence:** after the click the URL is /p/<token>/m/179, but the page text still has crumbs 'The Sunken Keep ▸ Poll Test Pin' and 'offline?'
- **Re-proved:** The code matches the claim. A change of mapId re-creates load(), and when both fetches fail the catch only calls setStale(true), so data keeps the previous map (lines 55-59). I reproduced it: entered The Keep (URL /m/351), made every **/api/share/** request abort, then clicked '⬆ The Sunken Keep'. The URL became /m/350 (the root), but the crumbs still read 'The Sunken Keep ▸ The Keep — Inside', the back button still read '⬆ The Sunken Keep', the interior pins (Great Hall, Warden Brakk, Supply C…

### P074 · Dragging the map closes the open sheet

Product polish · low · effort xs · found by `player-desktop`

- **Where:** Player View › map with a sheet open; client/src/pages/PlayerView.jsx:211
- **Files:** `client/src/pages/PlayerView.jsx:211`, `client/src/pages/PlayerView.jsx:101`
- **What happens:** onEmptyPointerDown runs setDetail(null) on every pointerdown on the plane, including the start of a pan. On desktop the sheet is a side panel, and dragging the map to look around while reading closes it (sheet count 1 → 0 after a drag).
- **Why it matters:** The sheet closes on a clean tap on empty map, not when a drag starts.
- **Fix:** Move the close into the tap path: in onRegionTap, if no region was hit (and the tap was not a pan), setDetail(null). Drop it from onEmptyPointerDown.
- **Repro:** /p/<token> → click The Flood → drag the map → the sheet disappears.
- **Evidence:** b8 output 'sheet after pan 0'
- **Re-proved:** The code matches the claim. MapPlane.jsx:145-147 calls onEmptyPointerDown on every pointerdown that reaches the viewport, before any pan or tap check. PlayerView.jsx:211 runs setDetail(null) unless the target is inside .region. atlas.scss:426-430 makes the sheet a relative side panel at 900px and wider. I reproduced it on my own clone of world 30 (world 108, since deleted) at 1440x900: clicked the pin 'The Flood', the sheet count was 1, then dragged 150px from an empty spot on .mp-viewport and …

### P076 · An open player sheet never refreshes on the 45 s poll, so a reveal doesn't show while it's open

Product polish · low · effort xs · found by `journey` (+1 other lane)

- **Where:** Player View › open any sheet; client/src/pages/PlayerView.jsx:47-68
- **Files:** `client/src/pages/PlayerView.jsx:47`, `client/src/pages/PlayerView.jsx:62`
- **What happens:** With The Salt Market's sheet open on a phone, the DM changed its description. Over 52 s the page polled only /world and /maps/103, and the open sheet still showed the old text. Re-tapping the pin showed the new text. The page comment promises 'the world updates when the DM … reveals something'.
- **Why it matters:** A player reading a sheet when the DM reveals something sees the new text on the next poll.
- **Fix:** In load(), after the map fetch, if detail is open, refetch shareService.getNode(token, detail.node.id, viewTRef.current). On 404 (node hidden again), close the sheet.
- **Repro:** On a phone, open /p/<token> › tap The Salt Market › DM PATCHes its body › wait 52 s › the sheet is unchanged. Script: lanes/journey/p4.mjs
- **Evidence:** p4: 'share requests during 52s: ["…/world","…/maps/103"]', 'sheet after 52s (still open): … (old text)', 'sheet after re-tap: … Oda the fishmonger sells word…'
- **Re-proved:** Code: PlayerView.jsx load() (47-59) refetches only getWorld + getMap. The poll runs load every 45 s (63-68). The open sheet (detail) is refetched only by the effect keyed on [viewT] (84-92), and viewT stays null at canon. The header comment (lines 16-17) says 'so the world updates when the DM advances the clock or reveals something'. Live, mobile, on my clone: I opened the 'Sheet Probe' sheet (body 'OLD TEXT') and the DM PATCHed the body to 'NEW TEXT'. Over 52 s the only share requests were GET…
- **Also found as:** "An open sheet is not refreshed by the poll and keeps showing text the DM has si…" (player-desktop)

