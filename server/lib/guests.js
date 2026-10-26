// Guests follow Waypoint's rule: an unclaimed guest nobody has seen for GUEST_RETENTION_DAYS
// (30 by default, the same setting and the same window Waypoint prunes its own guests by) is
// removed together with everything it made. "Seen" is users.last_seen_at — every sign-in, and
// every daily renewal of a session in use (config/auth.js; fleet-kit also tells Waypoint then,
// so both sides forget an idle guest on the same day) — so a guest in use is never swept, and a
// session (30 days from its last renewal) never outlives its row being swept unseen. A guest who
// claimed their Waypoint account is no longer is_guest (the next sign-in syncs it) and is never
// touched.
// Waypoint has the last word, though: the idle guests are asked about first (fleet-kit's checkGuests), because a
// guest who claimed their account there keeps the same id yet stays is_guest here until the next
// sign-in. One that claimed stays (and stops being a guest here); one Waypoint does not link to this
// app stays and is logged; only an unclaimed guest, or an id no Waypoint account has any more, is
// removed. If Waypoint cannot answer (no answer, an error, not deployed yet) nobody is removed that run.
// The sweep runs a minute after boot and then daily; GUEST_CLEANUP_ENABLED=false turns it off.
const pool = require('../config/database');
const { r2Enabled, deletePrefix } = require('../storage');
const { checkGuests } = require('fleet-kit/server');

const LOCK = 7300181; // one sweeper at a time, even while an old and a new deploy overlap

async function sweepGuests({ days = Number(process.env.GUEST_RETENTION_DAYS || 30), dryRun = false, check = checkGuests } = {}) {
  if (!Number.isFinite(days) || days < 1) throw new Error(`GUEST_RETENTION_DAYS must be a positive number, got ${days}`);
  const client = await pool.connectTx();
  try {
    if (!(await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK])).rows[0].ok) return { skipped: 'another sweep is running' };
    try {
      const idle = (await client.query(
        `SELECT u.id, u.username, u.last_seen_at, u.central_user_id, array_remove(array_agg(w.id), NULL) AS worlds
           FROM users u LEFT JOIN worlds w ON w.created_by = u.id
          WHERE u.is_guest AND u.last_seen_at < NOW() - ($1 || ' days')::interval
          GROUP BY u.id`, [days])).rows;
      if (!idle.length) return { stale: idle, removed: 0 };
      // Waypoint's word first: no answer, nobody goes
      const verdict = await check(idle.map((g) => g.central_user_id));
      if (!verdict.ok) return { stale: idle, removed: 0, held: verdict.reason };
      if (verdict.unknown.length) console.error(`Guest sweep: ${verdict.unknown.length} idle guest(s) left in place, Waypoint does not link them to this app: ${verdict.unknown.slice(0, 20).join(', ')}`);
      if (verdict.claimed.length && !dryRun) await client.query('UPDATE users SET is_guest = false WHERE central_user_id = ANY($1::int[])', [verdict.claimed.map(Number)]);
      const clear = new Set(verdict.clear);
      const stale = idle.filter((g) => clear.has(String(g.central_user_id)));
      const noted = { ...(verdict.claimed.length ? { claimed: verdict.claimed.length } : {}), ...(verdict.unknown.length ? { unknown: verdict.unknown.length } : {}) };
      if (dryRun || !stale.length) return { stale, removed: 0, ...noted };
      let removed = 0, worlds = 0;
      for (const g of stale) {
        // the user row takes its worlds with it (ON DELETE CASCADE), and each world its maps,
        // nodes, images, folders, eras, mind and tombstones; the guard re-checks both
        // conditions, so a guest who signed in or was claimed since the select is kept
        const r = await client.query(
          `DELETE FROM users WHERE id = $1 AND is_guest AND last_seen_at < NOW() - ($2 || ' days')::interval RETURNING id`, [g.id, days]);
        if (!r.rowCount) continue;
        removed++; worlds += g.worlds.length;
        // the art, voices and ambience live under each world's prefix, as a world delete leaves them
        if (r2Enabled) for (const wid of g.worlds) await deletePrefix(`worlds/${wid}/`).catch((e) => console.error(`guest sweep: R2 worlds/${wid}/ not removed:`, e.message));
      }
      return { stale, removed, worlds, ...noted };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

// on unless GUEST_CLEANUP_ENABLED=false (the admin page shows it, routes/admin.js)
const guestSweepOn = () => process.env.GUEST_CLEANUP_ENABLED !== 'false';

function scheduleGuestSweep() {
  if (!guestSweepOn()) { console.log('Guest sweep off (GUEST_CLEANUP_ENABLED=false)'); return; }
  const run = async () => {
    try {
      const r = await sweepGuests();
      if (r.held) console.error(`Guest sweep paused, nobody removed (${r.stale.length} idle guest(s) waiting): ${r.held}. It runs again tomorrow.`);
      else if (r.removed) console.log(`Guest sweep: removed ${r.removed} guest(s) unseen for ${process.env.GUEST_RETENTION_DAYS || 30} days, with ${r.worlds} world(s)`);
    } catch (e) {
      console.error('Guest sweep failed (it runs again tomorrow):', e.message); // a background chore never takes the server down
    }
  };
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}

module.exports = { sweepGuests, scheduleGuestSweep, guestSweepOn };
