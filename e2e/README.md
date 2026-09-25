# Browser suites

Real-browser checks against the live deploy (Railway), because there is no local server.
They complement the API suite (`node --test server/test/share-live.test.js`, run from the repo root).

- `player.mjs` — the public Player View: pins open sheets, the party pin reads its footstep
  story, ◎ enters an interior and ⬆ comes back, a ghost footprint is clickable, the era bar
  scrubs into the past, no page errors. Needs a share token of a world that has a party
  trail and at least one player-visible era (`player.config.json` or `SHARE_TOKEN`).
- `dm.mjs` — the DM workspace on a THROWAWAY world: View posture reader, timebar ticks
  (nothing may cover them), a tick moves the lens, the Party reader's "Then on to" link
  changes map without the error boundary, double-click on a pin without an interior stays
  put. Needs `dm.config.json`: a throwaway account's JWT + user, its world, a root map with
  a party placement, and one interior the party walks into.

Both configs are gitignored — copy the `*.config.example.json` files.

```bash
cd e2e && npm install && npx playwright install chromium
npm run player
npm run dm
```

Node 18 works with the pinned Playwright. On WSL without root, Chromium's shared libraries
(`libnss3`, `libnspr4`, `libasound2`) can be unpacked from `apt-get download` + `dpkg-deb -x`
into a folder and pointed at with `LD_LIBRARY_PATH=<folder>/usr/lib/x86_64-linux-gnu`
plus `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`.

Note: `page.waitForFunction` is blocked by the site's Content Security Policy (no
`unsafe-eval`); use locator waits instead.
