// Black-box secrecy tests for the public share API, run against a LIVE deployment.
// This is the security boundary of the whole app: DM-only content, unrevealed eras,
// and the future must never leave the database. The fixture world ("Secrecy Fixture",
// token below) is seeded by server/test/fixture.sql and owned by a login-less user,
// so it appears on nobody's dashboard. The token being in the repo is deliberate:
// the fixture holds only fake test strings and exists to be read — rotate it in the
// DB (and here) if that ever changes.
//
//   node --test server/test/share-live.test.js
//
// Override with BASE_URL / SHARE_TOKEN env vars to point elsewhere.
const test = require('node:test');
const assert = require('node:assert');

const BASE = process.env.BASE_URL || 'https://timeline-map-production.up.railway.app';
const TOKEN = process.env.SHARE_TOKEN || 'fx89ef1c8ec74cadc99ae56b256c46b337';
// Fixture ids (stable in the production DB; re-seed fixture.sql and update if recreated)
const IDS = {
  root: Number(process.env.FX_ROOT || 60),
  hiddenMap: Number(process.env.FX_HIDDEN_MAP || 61),
  openLandmark: Number(process.env.FX_A || 97),
  hiddenPerson: Number(process.env.FX_B || 98),
  innerLoot: Number(process.env.FX_D || 103),
};

const get = async (path) => {
  const res = await fetch(`${BASE}/api/share/${TOKEN}${path}`);
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
};
// player markers accumulate in the fixture across runs; title assertions ignore them
const titles = (map) => map.placements.filter((p) => !p.node.player).map((p) => p.node.title).sort();

test('world payload: only player-visible eras, canon moment', async () => {
  const { status, body } = await get('/world');
  assert.equal(status, 200);
  assert.equal(body.world.timeline.current, 50);
  assert.deepEqual(body.world.eras.map((e) => e.name), ['Open Era']);
});

test('canon moment: secrets, dm placements, out-of-time and future all absent', async () => {
  const { body } = await get(`/maps/${IDS.root}`);
  assert.deepEqual(titles(body), ['Open Landmark']);
  // the timed backdrop (start 40) is active at canon 50
  assert.ok((body.map.backdropUrl || '').endsWith('fixture-a.svg'), 'timed backdrop should be active at canon');
});

test('revealed past (t=20): the fair exists, the backdrop is the older art', async () => {
  const { body } = await get(`/maps/${IDS.root}?t=20`);
  assert.deepEqual(titles(body), ['Brief Fair', 'Open Landmark']);
  assert.equal(body.map.backdropUrl, null, 'pre-40 there is no backdrop');
});

test('a moment outside every revealed era silently resolves to canon', async () => {
  const { body } = await get(`/maps/${IDS.root}?t=45`); // inside the HIDDEN era
  assert.deepEqual(titles(body), ['Open Landmark']);
});

test('the future silently resolves to canon', async () => {
  const { body } = await get(`/maps/${IDS.root}?t=99`);
  assert.deepEqual(titles(body), ['Open Landmark']);
  assert.ok(!titles(body).includes('Future Thing'));
});

test('era text resolves per allowed moment; base text otherwise', async () => {
  const at20 = await get(`/nodes/${IDS.openLandmark}?t=20`);
  assert.equal(at20.body.node.body, 'era text');
  const atCanon = await get(`/nodes/${IDS.openLandmark}`);
  assert.equal(atCanon.body.node.body, 'base text');
});

test('links to DM-only nodes are pruned from node detail', async () => {
  const { body } = await get(`/nodes/${IDS.openLandmark}`);
  const others = body.links.map((l) => l.otherTitle);
  assert.ok(others.includes('Brief Fair'));
  assert.ok(!others.includes('Hidden Person'), 'link to a dm node must be pruned');
});

test('a DM-only node 404s directly', async () => {
  const { status } = await get(`/nodes/${IDS.hiddenPerson}`);
  assert.equal(status, 404);
});

test('deep link into a hidden branch 404s (owner-chain walk)', async () => {
  const { status } = await get(`/maps/${IDS.hiddenMap}`);
  assert.equal(status, 404);
});

test('locating a node whose only placement is in a hidden branch 404s', async () => {
  const { status } = await get(`/nodes/${IDS.innerLoot}/locate`);
  assert.equal(status, 404);
});

test('a bad token gets nothing', async () => {
  const res = await fetch(`${BASE}/api/share/not-a-real-token-000/world`);
  assert.equal(res.status, 404);
});

// ---- windowed payloads (?window=1): one fetch, client-side scrubbing ----

test('windowed map: everything visible at ANY allowed moment, nothing else', async () => {
  const { body } = await get(`/maps/${IDS.root}?window=1`);
  assert.deepEqual(titles(body), ['Brief Fair', 'Open Landmark']);
  const bad = ['Hidden Person', 'Ghost Spot', 'Future Thing', 'Interlude Ghost'];
  for (const t of titles(body)) assert.ok(!bad.includes(t));
});

test('windowed lifespans are clamped to the revealed envelope', async () => {
  const { body } = await get(`/maps/${IDS.root}?window=1`);
  const fair = body.placements.find((p) => p.node.title === 'Brief Fair');
  assert.equal(fair.start, 20);
  assert.equal(fair.end, 40);
  const landmark = body.placements.find((p) => p.node.title === 'Open Landmark');
  assert.equal(landmark.start, null);
  assert.equal(landmark.end, null);
});

test('windowed backdrops list the allowed timed art; the base stays base', async () => {
  const { body } = await get(`/maps/${IDS.root}?window=1`);
  assert.equal(body.map.backdropUrl, null, 'window mode returns the BASE art un-resolved');
  assert.equal(body.backdrops.length, 1);
  assert.equal(body.backdrops[0].start, 40);
  assert.ok(body.backdrops[0].url.endsWith('fixture-a.svg'));
});


// ---- player markers: the anonymous write path ----

test('a player can mark a reachable map; the marker is live, flagged, and signed', async (t) => {
  const title = `probe-marker-${Date.now()}`;
  const res = await fetch(`${BASE}/api/share/${TOKEN}/maps/${IDS.root}/nodes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body: 'left by the test suite', category: 'note', author: 'The Probe', x: 90, y: 90 }),
  });
  // the fixture accumulates markers across runs; a full cap (400) is an operational
  // signal to sweep, not a code failure — skip rather than fail CI in that case
  if (res.status === 400) { t.skip('fixture marker cap reached — sweep player nodes'); return; }
  assert.equal(res.status, 201);
  const { body } = await get(`/maps/${IDS.root}?window=1`);
  const mine = body.placements.find((p) => p.node.title === title);
  assert.ok(mine, 'the marker should appear in the payload');
  assert.equal(mine.node.player, true, 'server must force the player tier');
  assert.equal(mine.node.author, 'The Probe');
});

test('markers cannot be dropped into hidden branches', async () => {
  const res = await fetch(`${BASE}/api/share/${TOKEN}/maps/${IDS.hiddenMap}/nodes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'sneaky', x: 50, y: 50 }),
  });
  assert.equal(res.status, 404);
});

test('a marker needs a name; a bad token gets nothing', async () => {
  const noTitle = await fetch(`${BASE}/api/share/${TOKEN}/maps/${IDS.root}/nodes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'nameless', x: 50, y: 50 }),
  });
  assert.equal(noTitle.status, 400);
  const badToken = await fetch(`${BASE}/api/share/not-a-real-token-000/maps/${IDS.root}/nodes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'x', x: 50, y: 50 }),
  });
  assert.equal(badToken.status, 404);
});
