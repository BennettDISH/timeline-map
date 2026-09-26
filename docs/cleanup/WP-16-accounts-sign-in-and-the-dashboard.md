# WP-16 · Accounts, sign-in and the Dashboard

Part of the [Atlas cleanup list](README.md) (2026-09-26).

**Goal:** Make sign-out revoke the token and clear per-user state, and stop transient errors from signing the DM out. Settle what guest accounts are, and remove the setup pages left over from before SSO.

**Notes:** auth-01 is xs: sign-out posts a JSON null body and the server answers 500. auth-04 stops a 503 during a Railway deploy from signing Bennett out. server-dead-19: gate admin on Waypoint central id 1 (Bennett's convention across his apps) before deleting Setup and EnvSetup (auth-16, server-dead-21, client-dead-16). auth-03 and auth-20 (guest accounts) need Bennett's decision first. Read the Waypoint SSO guide in auth-service/docs before changing auth.

## Checklist

- [x] **B007** · high · xs · Sign out never revokes the token: the UI posts a JSON `null` body, the server answers 500, and the token stays valid — done ffb0b27 (sign-out POSTs {}; a malformed body is a 400 before any route; e2e/server.mjs probes it)
- [x] **B012** · high · m · 'Continue as guest' accounts can never be kept, so sign-out, 24h idle or cleared storage loses all their worlds for good — done ffb0b27 — partial: users.is_guest from Waypoint, "Guest" in the menu, a warning before a guest signs out, and honest copy ("a guest lives in this browser only"); a claim path needs a Waypoint proxy-claim endpoint — Bennett's call
- [x] **B016** · medium · s · Sign-in and sign-up swap the whole card for a grey 'Loading...' page: a wrong password wipes the form, a failed sign-up returns you to Sign in — done ffb0b27 (initializing vs submitting: the card never unmounts mid-request; values and mode stay on error)
- [x] **B040** · medium · s · Any non-auth failure of /api/auth/me (500, network drop, 429) signs the user out of this browser — done ffb0b27 (only a 401 / token 403 drops the session; a blip keeps the token — cached user or a retry screen)
- [x] **B054** · medium · xs · Sign-out leaves the last world and map in localStorage, so the next account on the browser lands in someone else's map — done ffb0b27 (clearLocalSession forgets the last map and current world, used by sign-out and the dead-token bounce; a 404 world forgets its pointer and goes to the dashboard)
- [x] **C001** · medium · xs · The sign-in card offers several doors into one Waypoint account without saying so, and Waypoint calls the app 'fantasy-map-timeline' — done ffb0b27 — partial: the form is labelled "Waypoint username or email" and sign-up says it makes a Waypoint account; renaming the app on Waypoint is an auth-service admin change
- [x] **C018** · medium · s · Admin is a local role granted only by first-run setup, not central id 1; every DM is stored as 'viewer'; admin can edit other users' images — done ffb0b27 (ADMIN_CENTRAL_USER_IDS, unset = central id 1, guests never; role reads admin|dm; image rights follow the world owner, no admin override)
- [x] **P001** · medium · xs · When the world list fails to load, the dashboard tells the user they have no worlds and offers 'Found your first world' — done ffb0b27 (an error panel with Try again, never the first-run state)
- [x] **P002** · medium · s · The app never leads to Waypoint account management: no 'forgot password', recovery code discarded at sign-up, no account link — done ffb0b27 (the recovery code is shown once; Forgot password? and Account settings link to Waypoint via /api/auth/config accountUrl)
- [x] **B070** · low · xs · Selecting text in the create or edit dialog and releasing the mouse outside it closes the dialog and discards what was typed — done ffb0b27 (press AND release on the backdrop, in the Dashboard and the Archive)
- [x] **C026** · low · s · 'Most recently charted' ignores map and node work: world order only moves on world-level edits — done ffb0b27 (worlds order by the latest edit anywhere: world, node or map)
- [x] **C027** · low · xs · First run: the empty state says 'begins with a blank map' but the default is cloning the sample, and the sample tick can race — done ffb0b27 (the empty state names the sample; the default holds when templates arrive)
- [x] **C047** · low · s · Two separate 'where you left off' memories disagree: the Dashboard's 'Pick up where you left off' ignores the world you were actually just in — done ffb0b27 (the featured world is the last map opened — the same memory "/" resumes)
- [x] **D002** · low · xs · Setup.jsx declares migration state (migrating, showMigration, migrationSuccess) that is never read or set — done ffb0b27 (Setup.jsx is gone)
- [x] **D003** · low · s · Dead auth plumbing: a write-only 'user' key, unused helpers, a no-op validation branch, an unreachable local-password path — done ffb0b27 (getToken, requireRole, the DB probes and the silent validation branch are gone; SSO needs all three envs; the stored user is now the offline cache)
- [x] **O014** · low · s · Setup and EnvSetup are pre-SSO leftovers: public, unreachable in practice, stale claims, and /api/setup/status leaks the user count — done ffb0b27 (Setup, EnvSetup, their routes, styles and /api/setup deleted)
- [x] **O019** · low · xs · First-run setup re-runs the whole schema (redundant with the boot-time ensure) and deletes a default admin that no longer exists — done ffb0b27 (with setup.js)
- [x] **P036** · low · s · Admin panel: a dead end with no navigation, a raw axios instance, 'No users found' shown on failure, and a stale table checklist — done ffb0b27 (in the shell with TopBar, on http.js, an error state with retry, expected tables read from schema.sql)
- [x] **P037** · low · xs · Accessibility holes on auth surfaces: errors are not announced, the account menu has no ARIA state — done ffb0b27 (role=alert on errors, aria-haspopup/expanded + role=menu, a Link back)
- [x] **P079** · low · s · Auth redirects add history entries, forget where you were going and never say why you were signed out — done ffb0b27 (replace + state.from; sso_next for the redirect flow; ?reason=expired&next= on a dead token)
- [ ] **P081** · low · m · Guest accounts and everything they made are never cleaned up; Waypoint prunes its side after 30 days, this app never does

## Items

### B007 · Sign out never revokes the token: the UI posts a JSON `null` body, the server answers 500, and the token stays valid

Broken · high · effort xs · found by `auth`

- **Where:** Dashboard/Archive/404 › account menu › Sign out; client/src/services/authService.js:63
- **Files:** `client/src/services/authService.js:63`, `server/server.js:90`, `server/server.js:126-132`, `server/routes/auth.js:318-329`
- **What happens:** Signed in as a fresh guest, clicked Account ▾ › Sign out. The browser logged `500 POST /api/auth/logout`, and afterwards `GET /api/auth/me` with that guest's token still returned 200 {user:{id:30,...}}. So the token was never revoked. A mocked capture of the same click shows the request body is the string "null" with Content-Type application/json. express.json() in strict mode rejects that body, and the catch-all error handler in server.js turns the parser's 400 into a 500 "Something went wrong!". The client swallows the error ("Already signed out here"). Posting to /api/auth/logout directly with no body works: 200, then /me returns 403 "Token no longer valid". The null-body call dates from commit 16b200d (2026-08-31, "revoke JWTs on logout"), so revoking on sign-out has never worked from the UI.
- **Why it matters:** Sign out should bump token_version so every copy of the token dies, as authService.js:52-57 and auth.js:313-317 promise.
- **Fix:** In authService.logout, send `{}` or leave the body undefined (`api.post('/api/auth/logout', {}, {...})`). Also make the server.js error middleware honour err.status/err.statusCode (body-parser sets 400) so malformed JSON anywhere returns 400 instead of 500. Add a logout check to e2e/dm.mjs: sign out, then prove the old token gets 403.
- **Repro:** curl -X POST -H 'Content-Type: application/json' --data 'null' https://timeline-map-production.up.railway.app/api/auth/logout → 500 {"message":"Something went wrong!"} (without a body the same call gives 401 "Access token required", which proves the body parser fails before the route runs). In the browser: sign in as a guest › Account ▾ › Sign out › GET /api/auth/me with the old token → 200.
- **Evidence:** lanes/auth/guest.log: http ['500 POST /api/auth/logout'], guestMeAfterLogout [200,{user:{id:30}}]; mock.mjs logoutRequest {body:'null', ct:'application/json'}; logout-guest.mjs: API logout 200 then me 403
- **Re-proved:** The code matches the finding. authService.js:63 calls `api.post('/api/auth/logout', null, ...)` on the shared http instance, and that instance sets Content-Type: application/json (http.js:7). server.js:90 uses express.json() in its default strict mode. The error middleware at server.js:126-132 always answers 500 and ignores err.status. auth.js:318 runs authenticateToken only after the body parser. I reproduced it locally in verify/auth-b1/axios-null.cjs, using the repo's own axios 1.11.0 and ex…

### B012 · 'Continue as guest' accounts can never be kept, so sign-out, 24h idle or cleared storage loses all their worlds for good

Broken · high · effort m · found by `auth` (+1 other lane)

- **Where:** The account-menu button shows the generated username, for example 'guest-lucky-heron-1049 ▾' (see the finder's own guest-result.json userBtn), not 'Account ▾'. So the word 'guest' is visible, but nothing explains it, there is no option to keep the account, and nothing warns before sign-out. The TTL lives at server/utils/token.js:11, not :10.
- **Files:** `client/src/pages/Login.jsx:183-196`, `server/routes/auth.js:273-291`, `server/config/sso.js:23-32`, `server/utils/token.js:10`, `client/src/components/TopBar.jsx:50-55`
- **What happens:** The login page says 'No account needed. Keep it later by adding a username and password.' The app's guest button calls Waypoint's server-to-server /api/auth/proxy/guest. Per auth-service routes/auth.js:186-207 that returns no Waypoint token, and the app throws the Waypoint identity away and mints only its own 24h JWT. Claiming a guest (auth-service routes/account.js:190, POST /claim) needs a Waypoint bearer token, and there is no proxy claim route, so an app-minted guest has no way to add a username and password, either here or on Waypoint. The guest's only credential is the app JWT in that one browser (decoded TTL = 24h). Signing out, leaving it idle for 24h, clearing site data or switching device loses every world for good. The live guest account menu showed only 'Sign out', with no warning, no guest label and no 'keep this account' option. Waypoint's own 'Try it without an account' on its sign-in page, which IS claimable, is a different path that the app's copy does not mention.
- **Why it matters:** Either the promise holds (the guest can be claimed from inside the app), or the guest path goes through Waypoint's claimable guest, and signing out as a guest warns that access will be lost.
- **Fix:** Pick one. (a) Remove the app's guest button and let 'Sign in with Waypoint' carry people to Waypoint's claimable 'Try it without an account'. (b) Add POST /api/auth/claim that proxies to a new Waypoint proxy-claim endpoint, keyed on central_user_id, plus a 'Keep this account' form in the TopBar menu for guests. Whichever you pick: store is_guest on users (Waypoint returns it), show 'Guest' in the account menu, and confirm before a guest signs out.
- **Repro:** /login › Continue as guest › Found your first world (sample) › Exit › Account ▾: only 'Sign out' exists. Nothing in the app leads to a claim form. Decode the guest JWT: exp - iat = 86400s.
- **Evidence:** lanes/auth/guest-result.json: guestUser guest-lucky-heron-1049, guestTtlHours 24, guestMenu 'Sign out'; screenshots lanes/auth/shots/guest-menu.png, guest-firstrun.png, login-desktop.png
- **Re-proved:** The core claim holds. Login.jsx:194 promises 'No account needed. Keep it later by adding a username and password.' Guests come from auth.js:273-291 → sso.js:25-32 → Waypoint /api/auth/proxy/guest (auth-service routes/auth.js:186-207). That route returns only central_user_id, username and is_guest: true, with no Waypoint token. createGuestUser (auth-service routes/auth.js:40-58) stores an unusable random password. Waypoint's claim route (routes/account.js:190) requires a Waypoint bearer token. T… _(partly — the corrected location is used above)_
- **Also found as:** "Guests are told “Keep it later by adding a username and password”, but the app …" (copy)

### B016 · Sign-in and sign-up swap the whole card for a grey 'Loading...' page: a wrong password wipes the form, a failed sign-up returns you to Sign in

Broken · medium · effort s · found by `auth`

- **Where:** /login › Sign In / Create Account / Continue as guest; client/src/utils/AuthContext.jsx:8-9 + client/src/App.jsx:29-36
- **Files:** `client/src/utils/AuthContext.jsx:8-9`, `client/src/utils/AuthContext.jsx:77`, `client/src/utils/AuthContext.jsx:95`, `client/src/App.jsx:29-36`, `client/src/pages/Login.jsx:120-122`, `client/src/pages/Login.jsx:161-163`, `client/src/pages/Login.jsx:191`
- **What happens:** LOGIN_START sets the same `loading` flag that PublicRoute uses for the first token check. While a sign-in is in flight, PublicRoute unmounts <Login> and shows a bare light-grey 'Loading...' page. When the request fails, Login remounts with fresh state. Results: after 'Invalid credentials' both fields are empty (the typed username is gone). After a failed sign-up the card is back on 'Sign in to your account' with every sign-up field wiped. The 'Signing in...', 'Creating account...' and 'Starting…' button labels and the disabled inputs never show.
- **Why it matters:** The card stays up with a busy button; on error the typed values and the current mode (sign in / sign up) stay put.
- **Fix:** Split the reducer state into `initializing` (initial /me check, read by ProtectedRoute/PublicRoute/Home) and `submitting` (login/register/guest, read by Login only). LOGIN_START sets submitting, not initializing.
- **Repro:** /login › type any username + wrong password › Sign In: mid-request the page shows only 'Loading...'; after the error the fields are empty. Sign up › leave email empty with validation bypassed › Create Account: 'All fields are required' appears on the Sign in form.
- **Evidence:** lanes/auth/anon2.mjs: inflightText 'Loading...', inflightHasForm 0, afterUser '', regSubtitle 'Sign in to your account', regFieldsPresent {regUser:0, loginUser:1}; screenshots lanes/auth/shots/login-inflight.png, login-wrongcreds.png, register-error.png
- **Re-proved:** LOGIN_START (AuthContext.jsx:8-9) sets the shared `loading` flag. login and register dispatch it at :77 and :95, and guestLogin does too at :131. PublicRoute (App.jsx:29-37) swaps children for <div class="loading">Loading...</div> while loading, which unmounts Login and discards its state. Mocked repro in verify/auth-b1/auth-verify.mjs, with login, register and guest delayed 2s and then failing. During sign-in the page showed only 'Loading...': 0 forms, 0 'Signing in...' (screenshot D-inflight.…

### B040 · Any non-auth failure of /api/auth/me (500, network drop, 429) signs the user out of this browser

Broken · medium · effort s · found by `auth` (+2 other lanes)

- **Where:** Every authed page load; client/src/utils/AuthContext.jsx:61-66
- **Files:** `client/src/utils/AuthContext.jsx:61-66`
- **What happens:** checkAuth's catch calls authService.clearSession() for ANY error. With /api/auth/me mocked to 500 or to a network failure, opening /dashboard sent the user to /login with auth_token removed from localStorage. The same thing happened for real during this audit when the shared general rate-limit bucket ran out (/api/auth/me 429). The code comment says the branch only avoids revoking OTHER devices, but it still throws away this browser's token over a server blip. A Railway deploy window (502s) does the same. For a guest (finding above) that token is the only credential, so one blip loses the account for good.
- **Why it matters:** Only drop the token when the server says the token itself is bad (401, or 403 with a token message). On 5xx, 429 or network errors, keep it and show a retry.
- **Fix:** In AuthContext checkAuth, look at error.status or message: clearSession only on 401, or on 403 matching the TOKEN_MSG regex from http.js. Otherwise keep the token, dispatch LOGIN_SUCCESS with the cached user if there is one, or show a 'Can't reach the server — Retry' state instead of redirecting.
- **Repro:** page.route('**/api/auth/me', r => r.fulfill({status:500})) › goto /dashboard › URL becomes /login and localStorage.auth_token is null.
- **Evidence:** lanes/auth/mock.mjs output: me500 {url:'/login', tokenLeft:false}, meNetFail {url:'/login', tokenLeft:false}; signed.mjs run hit a real 429 on /api/auth/me and landed on /login
- **Re-proved:** AuthContext.jsx:61-66 calls authService.clearSession() and dispatches LOGOUT for any error from getCurrentUser. For a 500, a 429 or a network failure, the http.js interceptor does not redirect (not tokenDead), but checkAuth still wipes the token, and ProtectedRoute (App.jsx:25) sends the user to /login. Repro in verify/auth-b1/auth-verify.mjs with /api/auth/me mocked to 500, to route.abort(), and to 429: all three runs went /dashboard → /login with localStorage auth_token null. It also happened…
- **Also found as:** "Any failure of /api/auth/me on page load (a 503 during a deploy, a network blip…" (resilience); "Any non-401 failure of /api/auth/me on page load (429, 503, network blip) signs…" (dashboard)

### B054 · Sign-out leaves the last world and map in localStorage, so the next account on the browser lands in someone else's map

Broken · medium · effort xs · found by `auth`

- **Where:** The fix direction is wrong on one point: http.js does NOT use clearSession. The dead-token interceptor removes auth_token and user inline at client/src/services/http.js:33-34 and then hard-redirects (line 35). A fix must also change http.js:33-34 (make it call a shared clear, or remove the three extra keys there too). Otherwise an expired or revoked session still leaves the pointers behind. Also, the '…' 'title' is the top-bar world-switcher label (AtlasWorkspace.jsx:907); document.title stays 'Fantasy Map Timeline'.
- **Files:** `client/src/services/authService.js:47-50`, `client/src/services/worldService.js:59-97`, `client/src/App.jsx:48-49`, `client/src/pages/Login.jsx:17`
- **What happens:** clearSession removes only auth_token and user. After the guest signed out, localStorage still held atlas_last_location {worldId:'138',mapId:'441'}, current_world and current_world_id. When a different account signed in on that browser, '/' sent it straight to /w/138/m/441: 404s on /api/atlas/worlds/138, /trail and /maps/441, 'Couldn't load this map.', and a title of '…' inside the full editor. The next user's first view is a broken workspace for a world that isn't theirs. It also shows the previous user's world id and name in storage.
- **Why it matters:** Signing out forgets per-account pointers, or they are keyed by user id, and '/' checks the remembered world belongs to the current user.
- **Fix:** In authService.clearSession (used by logout and http.js), also remove atlas_last_location, current_world and current_world_id, or store them under a key containing user.id. In AtlasWorkspace, on a 404 world load call worldService.clearLastLocation(worldId) and navigate to /dashboard.
- **Repro:** Continue as guest › create a world (lands on /w/138/m/441) › Exit › Account ▾ › Sign out › set another account's token › open '/' → /w/138/m/441 'Couldn't load this map.'
- **Evidence:** lanes/auth/guest-result.json: lsAfterSignout keeps atlas_last_location/current_world/current_world_id; nextAccountRoot '/w/138/m/441'; http 404 x3; screenshot lanes/auth/shots/next-account-root.png
- **Re-proved:** Code: authService.clearSession (client/src/services/authService.js:47-50) removes only auth_token and user. Nothing else clears atlas_last_location / current_world / current_world_id. The only clearLastLocation caller is Dashboard.jsx:146, on world delete. The AtlasWorkspace load catches (AtlasWorkspace.jsx:164-167, 240) never clear it. Home (App.jsx:48-49) navigates to the remembered location without checking who owns it. Live check on my own profile, signed in as the fleet account (id 28): I … _(partly — the corrected location is used above)_

### C001 · The sign-in card offers several doors into one Waypoint account without saying so, and Waypoint calls the app 'fantasy-map-timeline'

Confusing · medium · effort xs · found by `auth`

- **Where:** /login and the Waypoint authorize page
- **Files:** `client/src/pages/Login.jsx:97-197`, `server/routes/auth.js:200-212`
- **What happens:** The 'Username or Email / Password' form is sent to Waypoint (auth.js:200-212 while SSO is on), yet it sits above 'OR — Sign in with Waypoint' as if it were a separate local account. The app's 'Continue as guest' (not claimable) sits on the same card as a link to Waypoint, whose own page offers a different, claimable 'Try it without an account'. After clicking 'Sign in with Waypoint', the Waypoint page reads 'Sign in to Waypoint to continue to fantasy-map-timeline': the client app is registered under its repo slug, not the product name.
- **Why it matters:** One clearly labelled way to sign in with a Waypoint account, one guest path, and the product name on Waypoint's consent page.
- **Fix:** Label the form 'Waypoint username or email', or remove it in favour of the redirect. Rename the client app to 'Fantasy Map Timeline' in Waypoint admin › Apps (auth-service DB, no code change here).
- **Repro:** /login › Sign in with Waypoint › read the Waypoint page subtitle.
- **Evidence:** lanes/auth/anon1.mjs ssoLandingText 'Sign in to Waypoint to continue to fantasy-map-timeline'; screenshot lanes/auth/shots/sso-landing.png
- **Re-proved:** Login.jsx:97-123 is the 'Username or Email' / 'Password' form. server/routes/auth.js:200-212 sends it to centralLogin (Waypoint's proxy/login) whenever SSO_ENABLED is true, and live /api/auth/config reports ssoEnabled:true. The divider ('or', lowercase in code) and 'Sign in with Waypoint' come after the form at Login.jsx:167-181. The app's guest button (Login.jsx:183-196) calls auth-service /api/auth/proxy/guest (server/config/sso.js:25-32). That route (auth-service routes/auth.js:186-206) retu…

### C018 · Admin is a local role granted only by first-run setup, not central id 1; every DM is stored as 'viewer'; admin can edit other users' images

Confusing · medium · effort s · found by `server-dead` (+2 other lanes)

> **Second pass — see also:** Gating admin on central id 1 closes only the admin half. findOrCreateLocalUser still hands any unclaimed pre-SSO row, with its worlds, to whoever registers that email on Waypoint, and Waypoint does not verify emails. → **B092** in [WP-21](WP-21-the-server-stays-up-and-sign-in-keeps-working.md)

- **Where:** One detail is wrong: the images override is not 'the only cross-tenant power in the API'. GET /api/admin/users (server/routes/admin.js:57-77) also lets role 'admin' list every user's username and email across tenants. The images PUT/DELETE override is the only cross-tenant WRITE. The images routes also check uploaded_by, not world ownership, so the fix is a switch to the world-owner check rather than just dropping the admin clause.
- **Files:** `server/middleware/auth.js:17-19`, `server/middleware/auth.js:54-69`, `server/routes/auth.js:87`, `server/routes/auth.js:160`, `server/routes/images.js:167`, `server/routes/images.js:236`, `server/routes/setup.js:114-117`
- **What happens:** requireAdmin checks users.role === 'admin'. The only code that assigns 'admin' is POST /api/setup/init-admin, which works only when the users table is empty. Every SSO or registered account is inserted as 'viewer' (auth.js:87,160), although 'viewer' accounts create and run worlds; that is a misnomer. An SSO account becomes admin only by email-adopting the setup row (findOrCreateLocalUser). Bennett's fleet rule (memory: waypoint_admin_is_central_id_1) says every app gates admin on central user id 1. images.js PUT and DELETE let role 'admin' modify or delete any user's image, the only cross-tenant power in the API, while every other route is strictly world-owner.
- **Why it matters:** Admin is gated on central_user_id = 1 as in the rest of the fleet, and role names mean what they say.
- **Fix:** Gate requireAdmin on req.user.central_user_id === 1 (select central_user_id in authenticateToken) and have /api/auth/me report admin from the same rule. Drop the 'viewer'/'creator' vocabulary (or default to 'dm'). Remove the admin override from images.js PUT and DELETE, which should use the world-owner check like everything else.
- **Repro:** grep -rn "'admin'" server/routes server/middleware; grep -rn "'viewer'" server/routes
- **Re-proved:** Read server/middleware/auth.js:17-19 (SELECT id, username, email, role, token_version; no central_user_id) and :54-69 (requireAdmin = requireRole(['admin'])). A repo-wide `git grep` for admin role assignment finds only setup.js:114-117 ('admin'), which runs only when COUNT(*) FROM users is 0 (setup.js:70-74). auth.js:84-87 (SSO findOrCreateLocalUser) and auth.js:158-160 (local register) insert 'viewer', and schema.sql:7 defaults role to 'viewer' with CHECK IN ('admin','creator','viewer'). Email… _(partly — the corrected location is used above)_
- **Also found as:** "users.role is misleading: every DM is stored as 'viewer', 'creator' is never us…" (schema-data); "Every account, including the DM who owns and edits the worlds, has role 'viewer…" (auth)

### P001 · When the world list fails to load, the dashboard tells the user they have no worlds and offers 'Found your first world'

Product polish · medium · effort xs · found by `dashboard` (+1 other lane)

- **Where:** /dashboard load error (client/src/pages/Dashboard.jsx:80-84, 186-193)
- **Files:** `client/src/pages/Dashboard.jsx:80-84`, `client/src/pages/Dashboard.jsx:186-193`
- **What happens:** When GET /api/worlds/ returns 500, load() sets worlds to [], so the page renders the empty state 'Every campaign begins with a blank map … Found your first world'. The only sign of the failure is a 'Server error' toast that disappears after 3.5s. Clicking the CTA opens the create dialog with 'Begin from the sample world' pre-checked, as it would for a brand-new user.
- **Why it matters:** A load failure should show an error panel ('Couldn't load your worlds' + Try again), never the first-run empty state, which suggests the user's worlds are gone.
- **Fix:** Add a loadError state in Dashboard: on catch, keep worlds null (or set loadError) and render an error block with a button that calls load(). Show the voidstate only when the request succeeded with zero worlds.
- **Repro:** page.route('**/api/worlds/' GET → 500), goto /dashboard (lanes/dashboard/run5.mjs step b).
- **Evidence:** Screenshot lanes/dashboard/shots/27-error.png; run5 output '500 text … Every campaign begins with a blank map … Found your first world Server error'
- **Re-proved:** Code: Dashboard.jsx:80-84 load().catch calls setWorlds([]) and flashes an error. The voidstate at 186-193 renders whenever worlds.length === 0. The flash times out at 3500ms (94-98). CreateModal gets defaultSample={worlds.length === 0} (255), so the sample checkbox starts ticked. Reproduced: GET /api/worlds/ routed to 500 → body reads 'Every campaign begins with a blank map … Found your first world Server error' (verify/dashboard-b1/shots/C-worlds-500.png).
- **Also found as:** "If loading the world list fails, the dashboard tells an existing DM 'Every camp…" (auth)

### P002 · The app never leads to Waypoint account management: no 'forgot password', recovery code discarded at sign-up, no account link

Product polish · medium · effort s · found by `auth`

- **Where:** /login (sign-in and sign-up forms) and the TopBar account menu
- **Files:** `server/routes/auth.js:133-145`, `client/src/pages/Login.jsx:97-165`, `client/src/components/TopBar.jsx:50-55`
- **What happens:** The sign-up form is proxied to Waypoint's /api/auth/proxy/register. That call returns a one-time `recovery_code` (auth-service routes/auth.js:280-286: 'Returned once, so a client app can show the user their recovery code'). auth.js:133-145 drops it and the user never sees it. The sign-in form has no 'Forgot password?' link, and the account menu offers only 'Admin panel' (admins) and 'Sign out'. Someone who signs up here cannot recover their account or change their password without already knowing Waypoint exists and where it is. The sign-up form also requires an email that Waypoint treats as optional.
- **Why it matters:** After sign-up, show the recovery code once, and link to Waypoint for forgot-password and account settings. Or drop the local sign-up form and send people to Waypoint.
- **Fix:** Return recovery_code from /api/auth/register and show it on a one-time screen before navigating. Add 'Forgot password?' and an 'Account settings' menu item pointing at the Waypoint URL (expose it through /api/auth/config).
- **Repro:** Read server/routes/auth.js:133-145 (centralRes.data.recovery_code unused). Open /login: no forgot-password link. Open Account ▾ on /dashboard: only 'Sign out' (and 'Admin panel' for admins).
- **Evidence:** code; lanes/auth/anon1.mjs loginText; mock.mjs dashMenu 'Sign out'
- **Re-proved:** server/routes/auth.js:133-145: on the SSO path it calls centralRegister, then returns only {message, token, user}. centralRes.data.recovery_code is never read (grep for recovery/forgot/reset-password/change-password in client/src and server/routes finds nothing). ~/repos/auth-service/routes/auth.js:219-287 (/proxy/register) returns recovery_code (comment at 277-278: 'Returned once, so a client app can show the user their recovery code'). That route requires only username+password; email is opti…

### B070 · Selecting text in the create or edit dialog and releasing the mouse outside it closes the dialog and discards what was typed

Broken · low · effort xs · found by `dashboard`

- **Where:** Dashboard Modal backdrop (client/src/pages/Dashboard.jsx:54)
- **Files:** `client/src/pages/Dashboard.jsx:54`, `client/src/pages/ImageManager.jsx:513`
- **What happens:** I typed a name in 'Found a new world', pressed the mouse down inside the Name field, dragged left past the dialog edge and released. The dialog closed and the typed name and description were lost. The backdrop's onClick fires because the click's common ancestor is .modal-back.
- **Why it matters:** Only a press-and-release that both happen on the backdrop should close the dialog.
- **Fix:** In Modal, record the pointerdown target on .modal-back and call onClose only when both pointerdown and click targets are the backdrop itself (e.target === e.currentTarget). Apply it in the shared Modal from the accessibility finding.
- **Repro:** lanes/dashboard/run7.mjs, 'drag-select' step: mouse.down at the input's right edge, move 150px left of the dialog, mouse.up → .smodal count 0.
- **Evidence:** run7 output: 'after drag-select ending outside: modal open 0'
- **Re-proved:** Dashboard.jsx:54 closes on any click whose handler runs on .modal-back, and :55 stops propagation only for clicks targeted inside .smodal. A press inside and release outside dispatches the click on the common ancestor, .modal-back. Live repro (verify/dashboard-b2/ui.mjs): in 'Found a new world' I filled the name and description, pressed the mouse at the input's right edge, dragged to 150px left of the dialog and released. The .smodal count went to 0, and reopening the dialog showed an empty Nam…

### C026 · 'Most recently charted' ignores map and node work: world order only moves on world-level edits

Confusing · low · effort s · found by `dashboard` (+1 other lane)

- **Where:** /dashboard order and featured kicker (server/routes/worlds.js:27; client/src/pages/Dashboard.jsx:206)
- **Files:** `server/routes/worlds.js:16-28`, `server/routes/atlas.js:498-501`, `client/src/pages/Dashboard.jsx:206`
- **What happens:** GET /api/worlds orders by worlds.updated_at, which is bumped only by world-level writes (rename, timeline/canon, share, spotlight: atlas.js:106-153). PATCHing a node title in world 143 left its updatedAt at 2026-09-26T06:57:35.465Z and its list position at 3. A world the DM spent a whole session building can sit below one they only renamed, and a fresh browser labels the top world 'Most recently charted'.
- **Why it matters:** 'Most recently charted' should reflect the last edit anywhere in the world, or the label should say what it measures.
- **Fix:** Either touch worlds.updated_at in the node, map, placement and link write paths in atlas.js (a small helper touchWorld(worldId)), or compute GREATEST(w.updated_at, max(nodes.updated_at), max(maps.updated_at)) in the worlds.js list query and order by it.
- **Repro:** lanes/dashboard/api1.mjs: GET /api/worlds, PATCH /api/atlas/nodes/<node in 143> {title}, GET /api/worlds again, then compare updatedAt and index.
- **Evidence:** api1 output: 'node patch status 200 | world updatedAt before 2026-09-26T06:57:35.465Z after 2026-09-26T06:57:35.465Z | position before 3 after 3'
- **Re-proved:** worlds.js:27 orders by w.updated_at DESC. A repo-wide grep for 'UPDATE worlds' in server/ finds only atlas.js:85, 106, 111, 123, 128, 153 and 245. None is in a node, map, placement or link path, and schema.sql has no triggers. The node PATCH (atlas.js:495-501) updates only nodes.updated_at. Live on my clone 155: I PATCHed node 1628's title (200) and the root map's description (200). World updatedAt stayed 2026-09-26T07:25:56.921Z and its list index stayed 1. On a fresh profile the featured kick…
- **Also found as:** "The Dashboard's “Most recently charted” card is really the last world whose set…" (copy)

### C027 · First run: the empty state says 'begins with a blank map' but the default is cloning the sample, and the sample tick can race

Confusing · low · effort xs · found by `auth`

- **Where:** /dashboard with zero worlds › Found your first world; client/src/pages/Dashboard.jsx:84, 186-193, 272
- **Files:** `client/src/pages/Dashboard.jsx:84`, `client/src/pages/Dashboard.jsx:186-193`, `client/src/pages/Dashboard.jsx:272`
- **What happens:** As a new guest the next step is obvious: there is one CTA, and the modal pre-ticks 'Begin from the sample world' (sampleChecked true, button 'Clone it & open the Atlas'). But the empty state never mentions the sample and says 'Every campaign begins with a blank map', the opposite of what the button does by default. useSample is computed once at modal mount (`useState(defaultSample && templates.length > 0)`), so a click before /api/atlas/templates returns leaves the box unticked when it appears. A templates failure is swallowed (`.catch(() => {})`) and the sample option just isn't there.
- **Why it matters:** The empty state names both options (start from the sample keep, or a blank world), and the default holds whenever templates arrive.
- **Fix:** Word the empty state plainly, e.g. 'No worlds yet. Start from the sample keep or a blank world.', optionally with two buttons. In CreateModal, add useEffect(() => { if (defaultSample && templates.length) setUseSample(true) }, [templates.length]).
- **Repro:** Continue as guest › read the empty state › Found your first world.
- **Evidence:** lanes/auth/guest-result.json firstRunText, sampleChecked true, modalText; screenshots lanes/auth/shots/guest-firstrun.png, guest-createmodal.png
- **Re-proved:** Dashboard.jsx:189-191: the empty state reads 'Every campaign begins with a blank map' / 'Found your first world, give it a face, and start dropping the places, people, and secrets your party will find.' and never mentions the sample. Dashboard.jsx:255 passes defaultSample when there are zero worlds. :272 `useState(defaultSample && templates.length > 0)` is computed once, at modal mount. :84 swallows a templates failure with `.catch(() => {})`. :290 hides the sample row when there are no templat…

### C047 · Two separate 'where you left off' memories disagree: the Dashboard's 'Pick up where you left off' ignores the world you were actually just in

Confusing · low · effort s · found by `client-dead` (+1 other lane)

- **Where:** Dashboard featured card kicker; client/src/pages/Dashboard.jsx:100-107,206
- **Files:** `client/src/pages/Dashboard.jsx:100-104`, `client/src/pages/Dashboard.jsx:206`, `client/src/services/worldService.js:59-72`, `client/src/services/worldService.js:74-97`, `client/src/pages/AtlasWorkspace.jsx:163`, `client/src/pages/ImageManager.jsx:295`, `client/src/App.jsx:48-49`
- **What happens:** '/' resumes from `atlas_last_location`, which every map load sets (AtlasWorkspace:163). The Dashboard features `current_world`, which only Dashboard.open, Dashboard.saveWorld and the Atlas brand dropdown set, and labels it 'Pick up where you left off'. Entering a world any other way leaves current_world stale: the Archive's 'Open the Atlas ▸' (ImageManager:295), '/' resume, or a direct link. Example: open A from the Dashboard, go to the Archive, switch to B, click 'Open the Atlas ▸', then Exit. The Dashboard features A as 'Pick up where you left off', while '/' resumes B.
- **Why it matters:** One source of truth for the last world.
- **Fix:** Have Dashboard pick `featured` from worldService.getLastLocation()?.worldId (falling back to worlds[0]) and remove current_world / setCurrentWorld entirely.
- **Repro:** grep -rn 'setCurrentWorld\|setLastLocation' client/src → current_world is set in 3 places, atlas_last_location on every map load.
- **Re-proved:** Dashboard.jsx:100-104 picks featured from worldService.getCurrentWorld() (the 'current_world' key), falling back to worlds[0]. Line 206 shows the kicker 'Pick up where you left off' when stored?.id === featured.id. setCurrentWorld is called only at Dashboard:107 (open), 134 (saveWorld), 145 (delete, set to null) and AtlasWorkspace:902 (brand dropdown). ImageManager reads current_world at line 58 but never writes it. Its world switcher at line 281 only navigates, and 'Open the Atlas ▸' at 295 is…
- **Also found as:** "'Pick up where you left off' and the '/' resume track two different 'last world…" (dashboard)

### D002 · Setup.jsx declares migration state (migrating, showMigration, migrationSuccess) that is never read or set

Dead code · low · effort xs · found by `client-dead`

- **Where:** client/src/pages/Setup.jsx:11-13
- **Files:** `client/src/pages/Setup.jsx:11-13`
- **What happens:** Three useState pairs (six identifiers). Each name appears only in its own declaration. They are left over from the Migration page, which was deleted in b855a2b.
- **Why it matters:** No unused state.
- **Fix:** Delete lines 11-13.
- **Repro:** grep -n 'migrat' client/src/pages/Setup.jsx → only lines 11-13.
- **Re-proved:** Setup.jsx lines 11-13 declare migrating/setMigrating, showMigration/setShowMigration and migrationSuccess/setMigrationSuccess. A word-boundary grep counts each identifier exactly once, in its declaration, and `grep -n -i migrat` finds only lines 11-13. `git log -S setShowMigration` shows the state was added in 426dfc6 ('Add database migration page') and last touched in b855a2b, which removed Migration.jsx and the migration UI.

### D003 · Dead auth plumbing: a write-only 'user' key, unused helpers, a no-op validation branch, an unreachable local-password path

Dead code · low · effort s · found by `auth`

- **Where:** client/src/services/authService.js; client/src/pages/Login.jsx; server/middleware/auth.js; server/routes/auth.js
- **Files:** `client/src/services/authService.js:16`, `client/src/services/authService.js:35`, `client/src/services/authService.js:88`, `client/src/services/authService.js:97-100`, `client/src/services/authService.js:108`, `client/src/services/authService.js:123`, `client/src/services/authService.js:133-135`, `client/src/pages/Login.jsx:59-61`, `server/middleware/auth.js:54-75`, `server/routes/auth.js:10`, `server/routes/auth.js:147-170`, `server/routes/auth.js:214-237`
- **What happens:** localStorage 'user' is written in five places and removed in two (authService.js:49, http.js:34), but it is only read by authService.getUser(), which has no callers; getToken() has none either (grep '\.getUser\b|\.getToken' outside authService.js → no hits). Login.jsx:59-61 returns silently with the comment 'Validation will show error', but nothing shows, and the input's minLength=6 blocks the submit first anyway. requireRole is exported but used only to build requireAdmin (grep requireRole → middleware/auth.js only). The local bcrypt login/register fallback runs only when AUTH_SERVICE_URL is unset, and production reports ssoEnabled:true. SSO_ENABLED checks only AUTH_SERVICE_URL, while the canonical Waypoint guide says to require URL, client id and secret.
- **Why it matters:** No code paths that nothing reaches, and an SSO switch that reflects a complete configuration.
- **Fix:** Drop the 'user' writes/removals and getUser/getToken. Delete the Login.jsx:59-61 branch. Stop exporting requireRole (or inline it). Decide whether the local-password fallback is still wanted: delete it with bcryptjs, or document it as the no-Waypoint dev mode. Make SSO_ENABLED = !!(AUTH_SERVICE_URL && SSO_CLIENT_ID && SSO_CLIENT_SECRET).
- **Repro:** grep -rn "'user'" client/src; grep -rn "\.getToken\|\.getUser\b" client/src | grep -v authService.js; grep -rn requireRole server --include=*.js | grep -v node_modules
- **Evidence:** search output quoted above; /api/auth/config → {ssoEnabled:true}
- **Re-proved:** `grep -rn "'user'" client/src` finds localStorage.setItem('user') at authService.js:16, 35, 88, 108 and 123 (five places) and removeItem at authService.js:49 and http.js:34. The only getItem('user') is authService.js:98, inside getUser(). `grep -rn 'getUser\b|getToken\b' client/src e2e server` finds only the definitions at authService.js:97 and :133, and the only authService consumer, AuthContext.jsx, calls neither. The e2e/dm.mjs:12 and fleet-harness writes of 'user' are test setup, not reader…

### O014 · Setup and EnvSetup are pre-SSO leftovers: public, unreachable in practice, stale claims, and /api/setup/status leaks the user count

Obsolete · low · effort s · found by `auth`

- **Where:** Four details are wrong. (1) The boot-time schema apply is at server/server.js:13-24, not the repo-root 'server.js:17-24'. (2) Signed in, /setup does not end on /login: Setup calls navigate('/login'), then PublicRoute (App.jsx:29-37) redirects to '/' and Home sends the user to the dashboard or the last map. The finder's own shots/signed-setupWhileIn.png shows the dashboard. Signed out, it does end at /login. (3) Login's DB_NOT_INITIALIZED branch is not the only entry to /setup: EnvSetup.jsx:84 also links there ('Try Setup Again'), although EnvSetup is itself reachable only from Setup. (4) userCount is now 7, not 6; the number changes with sign-ups. The setup SCSS to delete is client/src/styles/main.scss about lines 364-660 (.setup-page through .retry-button/.refresh-button).
- **Files:** `client/src/pages/Setup.jsx:11-13`, `client/src/pages/Setup.jsx:28-29`, `client/src/pages/Setup.jsx:61-63`, `client/src/pages/Setup.jsx:101-109`, `client/src/pages/EnvSetup.jsx:20`, `client/src/App.jsx:56-63`, `server/routes/setup.js:14-18`, `server/routes/setup.js:82-112`, `client/src/pages/Login.jsx:48-50`, `client/src/pages/Login.jsx:68-70`, `server/routes/auth.js:120-131`, `server/routes/auth.js:187-198`
- **What happens:** /setup checks status and bounces to /login (verified signed out and signed in). Its only entry is Login's DB_NOT_INITIALIZED branch, which can't happen: server.js:17-24 applies schema.sql on every boot, so the users table always exists. Yet auth.js still probes 'SELECT 1 FROM users' on every login/register. Setup.jsx declares migrating/showMigration/migrationSuccess and never reads or sets them. It tells the user setup will 'Create all database tables', which boot already does. setup.js:111-112 deletes a default 'admin' row 'from schema' that was removed from schema.sql in b855a2b (2026-03-05). If the status check fails, the form shows to anyone (Setup.jsx:28-29). /env-setup is publicly routed, reachable only from Setup's JWT_SECRET error branch, uses alert('Copied to clipboard!'), and gives Railway instructions to any visitor. GET /api/setup/status tells anonymous callers how many accounts exist (live: userCount 6). With SSO on, the local-password admin that init-admin creates can't sign in through the Waypoint-proxied form afterwards.
- **Why it matters:** A first-run path that matches how the app is deployed today (boot-time schema, Waypoint identity), with no public page telling visitors how to configure the server.
- **Fix:** Delete Setup.jsx, EnvSetup.jsx, their routes in App.jsx, the setup/env-setup SCSS in main.scss, the DB_NOT_INITIALIZED branches in Login.jsx and auth.js, and server/routes/setup.js (or reduce /status to {needsSetup} only). Grant admin by central id (ADMIN_CENTRAL_USER_IDS, as the Waypoint guide says) instead of a local setup form.
- **Repro:** curl https://timeline-map-production.up.railway.app/api/setup/status → {needsSetup:false,userCount:6,...}; open /env-setup signed out; git show b855a2b -- server/config/schema.sql (removes the default admin INSERT).
- **Evidence:** lanes/auth/probe.mjs setupStatus; anon1.mjs setup finalUrl '/login', envText; screenshot lanes/auth/shots/env-setup.png
- **Re-proved:** Code checks: Setup.jsx:11-13 declares migrating, showMigration and migrationSuccess, and grep finds no other reference in the file. Setup.jsx:28-29 swallows a failed status check and shows the form. Setup.jsx:61-63 routes to /env-setup. Setup.jsx:104 says 'Create all database tables'. EnvSetup.jsx:20 calls alert('Copied to clipboard!'). App.jsx:56-63 registers /setup and /env-setup with no guard. Login.jsx:48-50 and :68-70 hold the DB_NOT_INITIALIZED branches, and auth.js:120-131 and :187-198 r… _(partly — the corrected location is used above)_

### O019 · First-run setup re-runs the whole schema (redundant with the boot-time ensure) and deletes a default admin that no longer exists

Obsolete · low · effort xs · found by `server-dead`

- **Where:** server/routes/setup.js:82-112
- **Files:** `server/routes/setup.js:82-112`, `server/server.js:13-24`
- **What happens:** server.js:13-24 already applies schema.sql on every boot, tolerating per-statement failures. init-admin then re-runs every statement again in one all-or-nothing transaction, unlike applySchema, so a single failing statement 500s the whole setup. It then runs `DELETE FROM users WHERE username = 'admin'` 'to override any default admin from schema'. The schema's default admin was removed in b855a2b, and the route only reaches this line when COUNT(*) FROM users is 0, so the DELETE can never match.
- **Why it matters:** Setup only creates the first admin.
- **Fix:** Delete setup.js:82-105 (the migration) and 111-112 (the DELETE). If schema readiness matters, call applySchema(pool) and report its failed[] list.
- **Repro:** git log -S "INSERT INTO users" -- server/config/schema.sql -> removed in b855a2b. Read setup.js:70-80 (zero-user precondition) and 111-112.
- **Re-proved:** server.js:13-24 runs applySchema(pool) on every boot, tolerating per-statement errors (apply-schema.js:19-33). setup.js:82-103 calls readStatements() and runs every statement again inside one BEGIN/COMMIT, rolling back and throwing on the first error, which becomes a 500 via the catch at 135-141. setup.js:111-112 runs `DELETE FROM users WHERE username='admin'` with the comment 'override any default admin from schema'. `git log -S 'INSERT INTO users' -- server/config/schema.sql` returns b855a2b,…

### P036 · Admin panel: a dead end with no navigation, a raw axios instance, 'No users found' shown on failure, and a stale table checklist

Product polish · low · effort s · found by `auth` (+2 other lanes)

- **Where:** /admin; client/src/pages/AdminPanel.jsx; server/routes/admin.js:23
- **Files:** `client/src/pages/AdminPanel.jsx:5-11`, `client/src/pages/AdminPanel.jsx:35-39`, `client/src/pages/AdminPanel.jsx:42-51`, `client/src/pages/AdminPanel.jsx:53-106`, `server/routes/admin.js:23`
- **What happens:** As a viewer, /admin shows 'Access Denied' with zero links or buttons (count 0): no TopBar, no way back but the browser. The admin view also renders no TopBar or link back. createAuthAPI builds a raw axios instance that captures the token once and bypasses http.js's dead-token handling, which contradicts CLAUDE.md ('do NOT create raw axios instances'; 'all authed services share services/http.js'). On any failure it only console.errors, so the Users section reads 'No users found.' and the status section 'Failed to load database status.' with no retry. admin.js:23 still checks only 8 tables, while schema.sql creates 15 (node_facts, eras, map_backdrops, world_minds, mind_messages, forge_batches and tombstones are never flagged as missing).
- **Why it matters:** Admin pages use TopBar and http.js, say when loading failed, and check the tables schema.sql actually creates.
- **Fix:** Wrap AdminPanel in the shell with <TopBar crumb="Admin" />. Replace createAuthAPI with `import http from '../services/http'`. Add an error state and distinguish it from an empty list. Derive expectedTables from readStatements() in config/apply-schema.js (parse CREATE TABLE names) instead of the hand list.
- **Repro:** Signed in as the viewer account › /admin. Admin view not reachable with this account (code-read).
- **Evidence:** lanes/auth/signed.mjs admin body 'Access Denied…', adminLinks 0; screenshot lanes/auth/shots/signed-admin.png; grep CREATE TABLE in schema.sql → 15 tables
- **Re-proved:** client/src/pages/AdminPanel.jsx:42-51: the Access Denied branch renders only an h2 and a p, with no link or button. The finder's signed-admin.png matches. App.jsx:81-88 renders AdminPanel inside ProtectedRoute only, and no TopBar is mounted there or globally in AppRoutes, so the admin view has no way back either. AdminPanel.jsx:5-11 is a raw axios.create that reads the token once, bypassing services/http.js, which breaks the rule at CLAUDE.md:39 and :55. Lines 35-39 only console.error on failur…
- **Also found as:** "AdminPanel builds its own axios instance (bypassing http.js) and is a dead-end …" (client-dead); "AdminPanel builds its own axios instance, against the rule in CLAUDE.md" (docs-hygiene)

### P037 · Accessibility holes on auth surfaces: errors are not announced, the account menu has no ARIA state

Product polish · low · effort xs · found by `auth`

- **Where:** /login, /auth/callback, TopBar account menu
- **Files:** `client/src/pages/Login.jsx:90-94`, `client/src/pages/AuthCallback.jsx:38-39`, `client/src/components/TopBar.jsx:47-49`
- **What happens:** Login and callback errors render in a plain <div className="error-message"> with no role="alert"/aria-live, so screen readers don't announce 'Invalid credentials'. Worse, the failed sign-in remounts the form (see the remount finding), so focus is lost too. The account button has no aria-haspopup/aria-expanded, and the menu has no role. AuthCallback's 'Back to login' is a raw <a href> that reloads the whole app. Keyboard tab order on /login is sensible (username, password, Sign In, Waypoint, guest, Sign up).
- **Why it matters:** Errors announced, and menu state exposed to assistive tech.
- **Fix:** Add role="alert" to .error-message divs, and aria-haspopup="menu" plus aria-expanded={open} to .userbtn with role="menu" on .menupop. Use <Link to="/login"> in AuthCallback.
- **Repro:** Read the cited lines; tab order checked live.
- **Evidence:** lanes/auth/anon2.mjs tabOrder; code
- **Re-proved:** Login.jsx:90-94 and AuthCallback.jsx:38 render errors as a bare <div className="error-message">. grep for role="alert", aria-live, aria-expanded and aria-haspopup across client/src returned nothing. TopBar.jsx:47-49 .userbtn has no aria-haspopup or aria-expanded, and .menupop (line 51) has no role. AuthCallback.jsx:39 is a raw <a href="/login">Back to login</a>. The remount claim holds: AuthContext.jsx:8-9 LOGIN_START sets loading:true, and PublicRoute (App.jsx:29-36) renders <div className="lo…

### P079 · Auth redirects add history entries, forget where you were going and never say why you were signed out

Product polish · low · effort s · found by `auth`

- **Where:** ProtectedRoute/PublicRoute in client/src/App.jsx:25,36; Login navigate('/'); http.js hard redirect
- **Files:** `client/src/App.jsx:25`, `client/src/App.jsx:36`, `client/src/pages/Login.jsx:17`, `client/src/pages/Login.jsx:45`, `client/src/pages/Login.jsx:65`, `client/src/services/http.js:35`
- **What happens:** (1) Back-button trap: from /p/garbage, open /dashboard signed out → /login. Back stays on /login, and Back again still /login (each Back re-hits /dashboard, which pushes /login again), so you can never get back to where you came from. (2) The destination is dropped: opening /w/133/m/424 signed out → /login → sign in → you land on /dashboard (or on whatever map was last remembered), not the link you followed. (3) When a stale or revoked token is dropped (http.js:35 does a full-page window.location to /login, and AuthContext does the same silently), the login page shows no message. The user just finds themselves signed out.
- **Why it matters:** Redirects to /login use replace and carry state.from; after sign-in the user returns to it; a dropped session says 'Your session ended — sign in again.'
- **Fix:** ProtectedRoute: `<Navigate to="/login" replace state={{ from: location }} />`. PublicRoute: add replace. Login/AuthCallback: navigate(location.state?.from?.pathname || '/', { replace: true }). For SSO, stash `from` in sessionStorage next to sso_state. http.js: redirect to `/login?reason=expired&next=...` and have Login show a one-line notice.
- **Repro:** Fresh profile: /p/garbage › /dashboard (→ /login) › browser Back ×2 → still /login. Signed out: open /w/133/m/424 › Continue as guest → /dashboard.
- **Evidence:** lanes/auth/mock.mjs: trapAfterDash/trapAfterBack/trapAfterBack2 all '/login'; guest-result.json deepLinkLanding '/login', afterGuestUrl '/dashboard'; garbage.mjs dash-garbage body has no error text
- **Re-proved:** Code: ProtectedRoute's `<Navigate to="/login" />` (App.jsx:25) and PublicRoute's `<Navigate to="/" />` (App.jsx:36) have no replace. react-router-dom 6.30.1 BrowserRouter pushes by default. Neither passes state.from. Login.jsx:17/45/65 and AuthCallback.jsx:29 all navigate('/'), which goes to the last location or /dashboard. http.js:33-35 sets window.location.href='/login' with no reason param. AuthContext.jsx:61-65 does clearSession + LOGOUT with no error message, and Login only shows context `…

### P081 · Guest accounts and everything they made are never cleaned up; Waypoint prunes its side after 30 days, this app never does

Product polish · low · effort m · found by `auth`

- **Where:** server/routes/auth.js:273-291 + users table
- **Files:** `server/routes/auth.js:83-88`, `server/routes/auth.js:273-291`
- **What happens:** Each guest sign-in inserts a local users row (auth.js:83-88) that is never flagged as a guest; the Waypoint response's is_guest is dropped. Waypoint deletes unclaimed central guests after GUEST_RETENTION_DAYS (auth-service server.js:119-145), but this app has no matching sweep: grep 'DELETE FROM users' → only server/routes/setup.js:112. Guests created here can never be reclaimed (see the guest finding), so their worlds, maps and R2 images become permanent orphans. This audit left one: user id 30 'guest-lucky-heron-1049', whose world was deleted.
- **Why it matters:** Guest rows are marked and swept after a retention window, together with their worlds and R2 objects.
- **Fix:** Add `users.is_guest BOOLEAN DEFAULT false` (set from the Waypoint payload in findOrCreateLocalUser), and a daily in-process sweep that deletes guest users idle for more than N days along with their worlds (reusing the world-delete path that removes R2 objects).
- **Repro:** grep -rn "DELETE FROM users\|is_guest" server --include=*.js | grep -v node_modules
- **Evidence:** search output: only setup.js:112; no is_guest column in schema.sql
- **Re-proved:** server/routes/auth.js:83-88 INSERTs (username, email, password_hash, role, central_user_id) and has no guest flag. The /guest route at auth.js:272-291 passes result.data straight to findOrCreateLocalUser, which ignores is_guest. auth-service/routes/auth.js:201 does return `is_guest: true` in the proxy/guest payload. grep -rn 'DELETE FROM users|is_guest|isGuest' over server/ (*.js, *.sql, no node_modules) found only server/routes/setup.js:112 (`DELETE FROM users WHERE username = 'admin'`). There…

