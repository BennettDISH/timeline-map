// Signing in and the session: fleet-kit's (its CommonJS build). Waypoint's authorize URL is
// built on the server, the code is exchanged server to server at /auth/callback (the address
// Waypoint has registered for the Atlas), one-click guests are minted through Waypoint, and the
// session is an httpOnly __Host-atlas_session cookie the browser sends with every call. What is
// the Atlas's own is here: the users row, the admin rule's default, and moving browsers off the
// old token.
const { createWaypoint, verifyJwt, isAdmin } = require('fleet-kit/server');
const pool = require('./database');

// Admin is a Waypoint IDENTITY, never a local role: the central ids in ADMIN_CENTRAL_USER_IDS.
// The Atlas's rule is that unset means the fleet convention, central id 1 (Bennett), while an
// explicitly empty value grants nobody. The kit reads the variable on every check and grants
// nobody when it is unset, so the Atlas's default is written in once, at boot. A guest, and a row
// with no central id (the no-Waypoint dev mode), is never an admin.
if (process.env.ADMIN_CENTRAL_USER_IDS === undefined) process.env.ADMIN_CENTRAL_USER_IDS = '1';

const ACCOUNT = 'id, username, email, role, token_version, central_user_id, is_guest';

/** The account a session names, or null when it is gone. */
async function account(id) {
  if (!Number.isInteger(id) || id <= 0) return null;
  return (await pool.query(`SELECT ${ACCOUNT} FROM users WHERE id = $1`, [id])).rows[0] || null;
}

// Returns `desired` if no other local row holds it, otherwise a central-id-suffixed variant.
async function freeUsername(desired, centralUserId) {
  const taken = await pool.query('SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)', [desired]);
  return taken.rows.length === 0 ? desired : `${desired}#${centralUserId}`;
}

// Returns `desired` only if no other local row holds it; NULL otherwise, since a duplicate
// would violate users_email_key. The address stays on whoever already had it.
async function freeEmail(desired) {
  const taken = await pool.query('SELECT 1 FROM users WHERE email = $1', [desired]);
  return taken.rows.length === 0 ? desired : null;
}

// Find or create a local user from central auth data, sync profile on login
async function findOrCreateLocalUser(centralUser) {
  // Check if we already have this central user linked
  const existing = await pool.query(
    'SELECT * FROM users WHERE central_user_id = $1',
    [centralUser.central_user_id]
  );

  if (existing.rows.length > 0) {
    const local = existing.rows[0];
    // Sync profile data from central on each login — but a username or email another local
    // row holds, or one wider than the column, is skipped rather than allowed to 500 the
    // sign-in forever (the central id is the identity; these are just labels)
    const want = {};
    if (centralUser.username && centralUser.username !== local.username) {
      const u = String(centralUser.username).slice(0, 100);
      const taken = (await pool.query('SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2', [u, local.id])).rows.length > 0;
      if (!taken) want.username = u;
    }
    if (centralUser.email && centralUser.email !== local.email) {
      const e = String(centralUser.email).slice(0, 255);
      const taken = (await pool.query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2', [e, local.id])).rows.length > 0;
      if (!taken) want.email = e;
    }
    if (typeof centralUser.is_guest === 'boolean' && centralUser.is_guest !== !!local.is_guest) want.is_guest = centralUser.is_guest;
    // every sign-in is a sighting: a guest unseen for GUEST_RETENTION_DAYS is swept (lib/guests.js)
    await pool.query('UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1', [local.id]);
    const keys = Object.keys(want);
    if (keys.length) {
      try {
        await pool.query(
          `UPDATE users SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${keys.length + 1}`,
          [...keys.map((k) => want[k]), local.id]);
        return { ...local, ...want };
      } catch (e) {
        if (e.code === '23505' || e.code === '22001') { console.warn('profile sync skipped:', e.message); return local; }
        throw e;
      }
    }
    return local;
  }

  // A first Waypoint sign-in always gets a FRESH row. An older local row is never adopted by
  // its email: Waypoint never verifies an address, so anyone who signed up there with someone
  // else's email was handed that person's worlds — the first-run admin row included (B092). A
  // row from before Waypoint is linked by hand (set its users.central_user_id).
  //
  // The email or username may still be held by another row (an older local account, or a
  // profile sync that skipped it). `users.username` is UNIQUE NOT NULL and `users.email` is
  // UNIQUE, so reusing either verbatim would raise 23505 and 500 the sign-in. Give up the email
  // (NULL never collides) and disambiguate the username with the central id, which is itself
  // unique.
  const username = await freeUsername(centralUser.username, centralUser.central_user_id);
  const email = centralUser.email ? await freeEmail(centralUser.email) : null;

  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash, role, central_user_id, is_guest, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     RETURNING *`,
    [username, email, '', 'viewer', centralUser.central_user_id, !!centralUser.is_guest]
  );

  return result.rows[0];
}

// What the client learns about an account: admin is computed from the Waypoint identity, every
// DM is a 'dm', and a guest is flagged so the UI can say so. /me and every sign-in answer it.
const shape = (u) => {
  const admin = u.is_admin ?? isAdmin(u);
  return { id: u.id, username: u.username, email: u.email ?? null, role: admin ? 'admin' : 'dm', isAdmin: Boolean(admin), isGuest: !!u.is_guest };
};

const wp = createWaypoint({
  app: 'atlas',
  appName: 'the Atlas',
  // Guests: yes. Spellforge's Map tab opens the Atlas for guests, and a try-it door suits a table
  // game; their AI, voice and upload use is capped per guest and idle guests are swept.
  guests: 'allow',
  callbackPath: '/auth/callback',
  signInPage: '/login',
  onSignIn: (u) => findOrCreateLocalUser(u),
  publicUser: shape,
  session: {
    load: (claims) => account(Number(claims.sub)),
    // Signing out ends the session on every device (token_version): the lever to pull when a
    // session may have escaped.
    onSignOut: async (claims) => {
      await pool.query('UPDATE users SET token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND token_version = $2', [Number(claims.sub), Number(claims.tv ?? 0)]);
    },
    // A session in use renews once a day (every page load asks /me): a sighting for the guest
    // sweep, which reads last_seen_at. The kit also tells Waypoint a guest is still here, so
    // Waypoint never drops a guest the Atlas keeps signed in.
    onRenew: async (user) => {
      await pool.query('UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    },
    // Until 2026-10 the session was a JWT ({ userId, tv }) the page kept in localStorage
    // ('auth_token') and sent as a bearer header. A page that still holds one sends it once with
    // its first /api/auth/me, which swaps it for the cookie with the end it had, so nobody is
    // signed out by the move; a revoked one (tv behind the row's) is refused as before. The
    // local e2e stack still signs its DM in this way (e2e/local.mjs, e2e/stubs.cjs), so the
    // reader goes when those move to the cookie.
    legacy: [{
      bearer: true,
      read: (token) => {
        const c = verifyJwt(token, process.env.JWT_SECRET);
        return c && Number.isInteger(c.userId) && Number.isInteger(c.tv) ? { sub: String(c.userId), tv: c.tv, exp: c.exp } : null;
      },
    }],
  },
});

module.exports = { wp, account, findOrCreateLocalUser, shape };
