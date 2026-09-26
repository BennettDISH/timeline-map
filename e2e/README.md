# Browser suites

Real-browser checks against the live deploy (Railway), because there is no local server.
They complement the API suite (`node --test server/test/share-live.test.js`, run from the repo root).

- `player.mjs` — the public Player View: pins open sheets, the party pin reads its footstep
  story, ◎ enters an interior and ⬆ comes back, a ghost footprint is clickable, the era bar
  scrubs into the past, no page errors. Needs a share token of a world that has a party
  trail and at least one player-visible era (`player.config.json` or `SHARE_TOKEN`).
- `server.mjs` — API only: non-canonical map ids 404 before any write (read-only on the fixture world), a marker lands whole on the throwaway world and is removed again, the input rules hold (an over-long title, a decimal or reversed lifespan, a reversed era, a self-link and an empty world name are 400s with a sentence; a position off the plane is clamped; a blank title reads Untitled; odd ids are 404s), and the server answers.
- `server/test/contract.test.js` — local, no database: the Forge validator never throws on malformed entries.
- `undo.mjs` — API only, on the throwaway world: Undo restores every column (DM note, stance, body, interior notes and focus) and the delete impact tells the truth.
- `dm.mjs` — the DM workspace on a THROWAWAY world: View posture reader, timebar ticks
  (nothing may cover them), a tick moves the lens, the Party reader's "Then on to" link
  changes map without the error boundary, double-click on a pin without an interior stays
  put; an unknown world lands on the dashboard with a notice, a missing space offers the
  world map with no editor armed, and the title input stops at 255. Needs `dm.config.json`: a throwaway account's JWT + user, its world, a root map with
  a party placement, and one interior the party walks into.

`bash e2e/watch.sh` waits for the live deploy to reach the local HEAD (the `/health` check names the deployed commit) and then runs every suite in order; `SKIP_WAIT=1` runs them at once.

Both configs are gitignored — copy the `*.config.example.json` files. A FAIL step makes the run exit
non-zero, so `npm run all` stops on the first red suite.

The DM suite expects a throwaway world laid out like the proving ground (world 30): a clock in
footsteps with three sessions as eras (one DM-only era named differently), a Party node with a
footstep on the root map and one in the interior, and the world's own share token (`shareToken`)
for the player-side outline checks. To mint the JWT: `POST /api/auth/login` with the throwaway
account's username and password and copy `token` (it expires after `JWT_EXPIRES_IN`, 24 h by
default — re-mint when the suite starts failing at "workspace opens"). The suite creates outlined
places and deletes only the ones it made.

```bash
cd e2e && npm install && npx playwright install chromium
npm run player
npm run dm
```

Node 18 works with the pinned Playwright. On WSL without root, Chromium's shared libraries
(`libnss3`, `libnspr4`, `libasound2`) can be unpacked from `apt-get download` + `dpkg-deb -x`
into a folder and pointed at with `LD_LIBRARY_PATH=<folder>/usr/lib/x86_64-linux-gnu`
plus `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`. On Bennett's machine that folder is
`~/.cache/atlas-e2e-libs`:

```bash
cd e2e && LD_LIBRARY_PATH=$HOME/.cache/atlas-e2e-libs/usr/lib/x86_64-linux-gnu PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npm run all
```

Note: `page.waitForFunction` is blocked by the site's Content Security Policy (no
`unsafe-eval`); use locator waits instead.
