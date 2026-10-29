# Browser suites

Real-browser and API checks, run against the local stack (below) before a push, and against the
live deploy (Railway) only on purpose: `dm.mjs`, `undo.mjs`, `doors.mjs` and `server.mjs` write,
and refuse any server off this machine unless `E2E_LIVE=1`. They complement the API suite
(`npm run test:live` in `server/`, live only and read-only).

## The local stack: test before a push

`e2e/local.mjs` runs the whole Atlas on this machine: the real server against an in-memory
Postgres (PGlite on a socket, a devDependency of `e2e` and never of the server). It seeds one DM
and a world laid out like the proving ground: a footstep clock (canon 37), a DM-only era plus
Sessions 1–3 (player-visible), revealed places, the Keep's interior, the Party's footsteps from
the world map (15) into the interior (30), and a DM-only vault with a hidden interior. Then it
writes `e2e/local.config.json` (gitignored), which every suite reads when `E2E_CONFIG` names it.
Outside services are off whatever the shell holds: no R2 (images stay in the database), no
Waypoint, Forge, voices or bug widget. A second server on the same database (`LOCAL_PORT` + 1,
`paid` in the config) has the Forge, voices, ambience and R2 switched on, answered by stubs
(`e2e/stubs.cjs`, loaded with `node --require`; nothing leaves the machine), with tiny daily caps
so the server suite can drive the spend guard to its limits. Its control port (`LOCAL_PORT` + 2)
counts the calls that reached a stub, clears today's counters and mints throwaway accounts. The
database lives as long as the process; Ctrl+C drops it.

```bash
cd e2e && npm install                                   # once
node e2e/local.mjs --build                              # from the repo root; --build rebuilds client/dist
E2E_CONFIG=e2e/local.config.json bash e2e/watch.sh      # every suite but the live secrecy suite
E2E_CONFIG=e2e/local.config.json node e2e/doors.mjs     # or one suite
```

The server reads `client/dist/index.html` once at boot, so rebuild (`--build`) and restart after a
client change. `LOCAL_PORT` (5099) and `LOCAL_DB_PORT` (5433) move the ports. The DM workspace is
at the printed `/w/…` URL once the browser holds the config's token
(`localStorage.setItem('auth_token', …)`); the Player View link is printed too. In the desktop
app's browser pane it starts as `atlas-local` from `~/repos/.claude/launch.json`. On 2026-10-17
every suite passed against it (player 17, dm 72, undo 17, doors 27, server 55, contract 5).

`node e2e/seed.mjs` (`npm run seed` here) checks the sample world's seed on its own: a fresh
in-memory Postgres gets `schema.sql` and one account, then `server/scripts/seed-sample.js` runs
twice, unmodified. The first run must build the whole template, the second must add nothing.
It needs no server and no config (`SEED_DB_PORT`, 5434, moves the port). The server's `npm test`
checks the same seed against the columns `schema.sql` leaves (`server/test/seed-sample.test.js`).

## The suites

- `player.mjs` — the public Player View: pins and outlined places open sheets, the party pin
  reads its footstep story, ◎ enters an interior and ⬆ comes back, a ghost footprint is
  clickable, the era bar scrubs into the past, no page errors. When canon has no footstep yet
  (a new session), the party checks run at the party's last footstep in a revealed era, and
  with none there they are skipped, named as such. Needs a share token of a world that has a
  party trail and at least one player-visible era (`player.config.json` or `SHARE_TOKEN`).
- `server.mjs` — API only: non-canonical map ids 404 before any write (read-only on the fixture world), a marker lands whole on the throwaway world and is removed again, the input rules hold (an over-long title, a decimal or reversed lifespan, a reversed era, a self-link and an empty world name are 400s with a sentence; a position off the plane is clamped; a blank title reads Untitled; odd ids are 404s), the inspector rules hold (one thread per pair, a stable thread order, an interior and the default root map follow a rename, Reveal lands in the period text at canon, locate shows the thing and names its interior, a place cannot stand inside itself), loose ends list a new entry and never the Party or an entry whose story ended before canon, and editing a period text brings an entry up, players read a mention of an entry they can see without its moment and one of a hidden entry as its bare name, locate at a moment finds the footstep then, the image rules hold (bytes decide the type, names clamp, list parameters and search are checked, rename/caption, one folder-name rule, bulk move and delete, folders delete with their subfolders), a POST with no body at all reaches its route as an empty one (a 400, never a 500), and the server answers. On the local stack only, the spend guard: a chat turn and each painting are one use, a proposal wanting more paintings than are left changes nothing, past the cap every paid route is a 429 with a sentence and no call reaches the provider, the count is read back by the other server process (it lives in the database), the guest cap and a cap of 0, parallel paintings never pass the cap, the daily ceiling stops an account with uses left, an admin is never capped, voice has its own cap and ceiling, and a world with a Forge card waiting is not copied until the card is kept. Live, it makes no paid call.
- `admin.mjs` — API only, local stack only (it skips anywhere else): the admin browse against a real Postgres. Signed out is a 401 and a DM or a guest a 403 on every admin route; accounts page at 50 with no account on two pages; search is case-blind with % and _ taken literally, `#id` finds an id, and a world or owner filter narrows; a world, a map (DM-only pins included) and an entry open whole; no answer carries a password hash, a token, the share token or image bytes. It mints throwaway accounts on the local database through the stubs' control port and writes nothing else.
- `server/test/admin.test.js` — local, no database: the admin gate on every admin route, 50 a page, search escaping and filters, and no hash, token or image bytes in any answer whatever the database returns.
- `server/test/contract.test.js` — local, no database: the Forge validator never throws on malformed entries.
- `server/test/spend.test.js` — local, no database: who gets which daily cap, how the cap settings are read, and the sentences a refused DM reads.
- `undo.mjs` — API only, on the throwaway world: Undo restores every column (DM note, stance, body, interior notes and focus) and the delete impact tells the truth.
- `doors.mjs` — API only, on the throwaway world: an entry that leads to a map it does not own (a new map beside the one it stands on, or any map that exists) files that map beside the other in the tree and the crumb, never renames or deletes it, opens to players only through a door they can see, carries the lantern through, and undoes whole; everything it makes is deleted at the end (`E2E_CONFIG` points it at another config, such as a local server's).
- `dm.mjs` — the DM workspace on a THROWAWAY world: View posture reader, timebar ticks
  (nothing may cover them), a tick moves the lens, the Party reader's "Then on to" link
  changes map without the error boundary, double-click on a pin without an interior stays
  put; an unknown world lands on the dashboard with a notice, a missing space offers the
  world map with no editor armed, the title input stops at 255, the editor opens at the top
  for each selection, a just-dropped node's title is focused and selected, at 1280px the top bar and editor
  fit the window, the View scrubber keeps a track and the Forge clears the ? button, a pan keeps the
  selection while a clean tap clears it, a search hit is framed, an outline ends with the
  posture, Fit swallows its double-click, a pin's right-click menu is its own, Ctrl+Shift+B reaches the
  bug widget from inside the 🎭 frame, the ⚙ timeline panel (Edit only) saves as it goes and holds a
  range that would move canon, an era outside the clock is flagged, and a lens outside a map's focus
  period widens the bar (the clock and the interior's focus period are put back after). Needs `dm.config.json`: a throwaway account's JWT + user, its world, a root map with
  a party placement, and one interior the party walks into.

`E2E_CONFIG=e2e/local.config.json bash e2e/watch.sh` runs every suite against the local stack (no wait, no token renewal, no live secrecy suite). `E2E_LIVE=1 bash e2e/watch.sh` waits for the live deploy to reach the local HEAD (the `/health` check names the deployed commit) and then runs every suite in order there; `SKIP_WAIT=1` runs them at once. With neither, it stops.

Both configs are gitignored — copy the `*.config.example.json` files. A FAIL step makes the run exit
non-zero, so `npm run all` stops on the first red suite.

The DM suite expects a throwaway world laid out like the proving ground (world 30): a clock in
footsteps with three sessions as eras (one DM-only era named differently), a Party node with a
footstep on the root map and one in the interior, and the world's own share token (`shareToken`)
for the player-side outline checks. `dm.config.json` also keeps the account's
Waypoint login (`login: {email, password}`), so `node e2e/login.mjs` mints a fresh JWT (it
expires after `JWT_EXPIRES_IN`, 24 h by default) and writes it back; `watch.sh` does that on its
own when the stored token is dead, and skips the signed-in suites if it cannot. The suite creates outlined
places and deletes only the ones it made.

```bash
cd e2e && npm install && npx playwright install chromium
npm run player
npm run dm
```

Node 18 runs the suites with the pinned Playwright; the local stack builds the client and so needs
Node 22 (Vite needs 20.19+). On WSL without root, Chromium's shared libraries
(`libnss3`, `libnspr4`, `libasound2`) can be unpacked from `apt-get download` + `dpkg-deb -x`
into a folder and pointed at with `LD_LIBRARY_PATH=<folder>/usr/lib/x86_64-linux-gnu`
plus `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`. On Bennett's machine that folder is
`~/.cache/atlas-e2e-libs`:

```bash
cd e2e && LD_LIBRARY_PATH=$HOME/.cache/atlas-e2e-libs/usr/lib/x86_64-linux-gnu PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npm run all
```

Note: `page.waitForFunction` is blocked by the site's Content Security Policy (no
`unsafe-eval`); use locator waits instead.
