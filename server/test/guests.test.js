// The guest sweep (lib/guests.js) with Waypoint's word, run locally: a stand-in Waypoint
// (fleet-kit's fakeWaypoint) answers the guest check, and the database is a small table of users
// that answers just the four statements the sweep makes. The real SQL runs against the
// local stack.
//
//   node --test server/test/guests.test.js
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../config/database');
let startFakeWaypoint;
const { checkGuests } = require('fleet-kit/server');
const { sweepGuests, scheduleGuestSweep } = require('../lib/guests');

let waypoint;
before(async () => {
  ({ startFakeWaypoint } = await import('fleet-kit/test/fakeWaypoint'));
  waypoint = await startFakeWaypoint();
});
/** The id lists the sweep sent Waypoint's guest check. */
const asked = () => waypoint.requests.filter((r) => r.path === '/api/auth/proxy/guests').map((r) => r.body);
after(async () => { await waypoint.close(); pool.end().catch(() => {}); });
beforeEach(() => {
  waypoint.reset();
  Object.assign(process.env, waypoint.env());
  users.clear();
});

/** id -> { id, username, central_user_id, is_guest, idle (days), worlds } */
const users = new Map();
let n = 0;
const guest = (more = {}) => {
  n += 1;
  const u = { id: n, username: `guest-swift-otter-${n}`, central_user_id: 700 + n, is_guest: true, idle: 40, worlds: [10 * n], ...more };
  users.set(u.id, u);
  return u;
};

const client = {
  release() {},
  async query(sql, params = []) {
    const text = sql.replace(/\s+/g, ' ').trim();
    if (/pg_try_advisory_lock/.test(text)) return { rows: [{ ok: true }] };
    if (/pg_advisory_unlock/.test(text)) return { rows: [] };
    if (/^SELECT u\.id, u\.username/.test(text)) {
      return { rows: [...users.values()].filter((u) => u.is_guest && u.idle > Number(params[0])).map((u) => ({ ...u, last_seen_at: new Date() })) };
    }
    if (/^UPDATE users SET is_guest = false WHERE central_user_id = ANY/.test(text)) {
      let rowCount = 0;
      for (const u of users.values()) if (params[0].includes(u.central_user_id)) { u.is_guest = false; rowCount += 1; }
      return { rowCount, rows: [] };
    }
    if (/^DELETE FROM users WHERE id = \$1 AND is_guest/.test(text)) {
      const u = users.get(params[0]);
      if (u && u.is_guest && u.idle > Number(params[1])) { users.delete(u.id); return { rowCount: 1, rows: [{ id: u.id }] }; }
      return { rowCount: 0, rows: [] };
    }
    throw new Error(`unexpected query: ${text}`);
  },
};
pool.connectTx = async () => client;

/** A run with console.error held, and what it said. */
async function quiet(run) {
  const lines = [];
  const was = console.error;
  console.error = (...a) => lines.push(a.join(' '));
  try { return { result: await run(), said: lines.join('\n') }; } finally { console.error = was; }
}
const present = (...list) => list.map((u) => users.has(u.id));

test('a guest who claimed on Waypoint stays and stops being a guest; one Waypoint has forgotten, or still has as a guest, goes', async () => {
  const claimed = guest();
  const forgotten = guest();
  const plain = guest();
  const active = guest({ idle: 2 });
  waypoint.set({ claimed: [claimed.central_user_id], gone: [forgotten.central_user_id] });
  const r = await sweepGuests({ days: 30 });
  assert.deepEqual(present(claimed, forgotten, plain, active), [true, false, false, true]);
  assert.equal(claimed.is_guest, false);
  assert.deepEqual([r.removed, r.worlds, r.claimed, r.stale.map((g) => g.id)], [2, 2, 1, [forgotten.id, plain.id]]);
  assert.equal(asked().length, 1);
  assert.deepEqual(asked()[0].ids.sort(), [claimed, forgotten, plain].map((g) => g.central_user_id).sort(), 'only the idle were asked');
  // the claimed one is a guest no more, so it is not asked about again
  waypoint.reset();
  assert.deepEqual((await sweepGuests({ days: 30 })).stale, []);
  assert.equal(asked().length, 0);
});

test('a guest Waypoint does not link to this app stays, and is logged', async () => {
  const stranger = guest();
  const plain = guest();
  waypoint.set({ unknown: [stranger.central_user_id] });
  const { result: r, said } = await quiet(() => sweepGuests({ days: 30 }));
  assert.deepEqual(present(stranger, plain), [true, false]);
  assert.equal(stranger.is_guest, true);
  assert.equal(r.unknown, 1);
  assert.match(said, new RegExp(`1 idle guest\\(s\\) left in place, Waypoint does not link them to this app: ${stranger.central_user_id}`));
});

test('a guest with no central id is never asked about and never removed', async () => {
  const local = guest({ central_user_id: null });
  const plain = guest();
  const { result: r } = await quiet(() => sweepGuests({ days: 30 }));
  assert.deepEqual(present(local, plain), [true, false]);
  assert.equal(r.unknown, 1);
  assert.deepEqual(asked()[0].ids, [plain.central_user_id]);
});

for (const [what, set] of [
  ['an error', (w) => { w.status = 500; }],
  ['a wrong secret', (w) => { w.status = 401; }],
  ['an endpoint that is not deployed yet (404)', (w) => { w.status = 404; }],
]) {
  test(`${what} from Waypoint means nobody is removed, and the next run removes them once it answers`, async () => {
    const a = guest();
    const b = guest();
    set(waypoint);
    const r = await sweepGuests({ days: 30 });
    assert.deepEqual([r.removed, typeof r.held, r.stale.length], [0, 'string', 2]);
    assert.deepEqual(present(a, b), [true, true]);
    assert.deepEqual([a.is_guest, b.is_guest], [true, true]);
    waypoint.reset();
    assert.equal((await sweepGuests({ days: 30 })).removed, 2);
    assert.deepEqual(present(a, b), [false, false]);
  });
}

test('no answer in time, an unreachable Waypoint and no configuration mean nobody is removed', async () => {
  const a = guest();
  waypoint.delay = 300;
  const slow = await sweepGuests({ days: 30, check: (ids) => checkGuests(ids, { timeoutMs: 40 }) });
  assert.match(slow.held, /did not answer/);
  const off = await sweepGuests({ days: 30, check: (ids) => checkGuests(ids, { env: {} }) });
  assert.match(off.held, /not configured/);
  const dead = await startFakeWaypoint();
  const env = dead.env();
  await dead.close();
  const down = await sweepGuests({ days: 30, check: (ids) => checkGuests(ids, { env }) });
  assert.match(down.held, /could not be reached/);
  assert.deepEqual(present(a), [true]);
});

test('a dry run asks, says who would go, and changes nothing, even for a claimed guest', async () => {
  const claimed = guest();
  const plain = guest();
  waypoint.set({ claimed: [claimed.central_user_id] });
  const r = await sweepGuests({ days: 30, dryRun: true });
  assert.deepEqual([r.stale.map((g) => g.id), r.removed, r.claimed], [[plain.id], 0, 1]);
  assert.deepEqual(present(claimed, plain), [true, true]);
  assert.equal(claimed.is_guest, true);
});

test('the daily run says when it is paused, and never throws', async () => {
  guest();
  waypoint.status = 500;
  const timers = [];
  const real = { setTimeout, setInterval };
  global.setTimeout = (fn) => { timers.push(fn); return { unref() {} }; };
  global.setInterval = () => ({ unref() {} });
  try { scheduleGuestSweep(); } finally { Object.assign(global, real); }
  assert.equal(timers.length, 1);
  const { said } = await quiet(() => timers[0]());
  assert.match(said, /Guest sweep paused, nobody removed \(1 idle guest\(s\) waiting\): Waypoint answered 500/);
});
