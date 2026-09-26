const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { AUTH_SERVICE_URL, SSO_CLIENT_ID, centralRegister, centralLogin, centralGuest, exchangeCode } = require('../config/sso');
const rateLimit = require('express-rate-limit');
const { generateToken, refreshIfStale } = require('../utils/token');
const router = express.Router();

// SSO is configured only when all three of URL / client id / client secret exist
const SSO_ENABLED = !!(process.env.AUTH_SERVICE_URL && process.env.SSO_CLIENT_ID && process.env.SSO_CLIENT_SECRET);
// what the client learns about an account: admin is computed from the Waypoint identity,
// every DM is a 'dm', and a guest is flagged so the UI can say so
const shape = (u) => ({ id: u.id, username: u.username, email: u.email, role: isAdmin(u) ? 'admin' : 'dm', isAdmin: isAdmin(u), isGuest: !!u.is_guest });

// The client OAuth callback route (a client-side React route). Both the authorize redirect_uri
// and the token-exchange redirect_uri point here.
const CALLBACK_PATH = '/auth/callback';

// Absolute base URL of this app — prefer an explicit env (exact match to the registered
// redirect_uri), else the request origin (correct in prod behind Railway with trust proxy set).
const baseUrl = (req) => (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

// Throttle credential endpoints (login/register) to blunt brute-forcing, without touching the
// frequently-hit /me check that the app calls on every load.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many attempts. Please try again in a few minutes.' }
});
// Guest sign-in mints a central Waypoint user AND a local row per call, and Waypoint caps the
// whole app at 500 guests an hour — one IP must not be able to spend that for everyone.
const guestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { message: 'Too many guest sign-ins from here. Please try again in an hour.' }
});

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

  // Adopt a pre-migration local row by email — but ONLY if it is unclaimed.
  //
  // `AND central_user_id IS NULL` is the load-bearing part. Without it, a local row that
  // already belongs to central account A gets silently reassigned to central account B the
  // moment B's email matches it: B inherits A's worlds, maps and images, and A's next login
  // creates a fresh empty row so their data looks deleted. Emails move between central
  // accounts (the admin address is deliberately reassignable), so this is reachable, not
  // theoretical. An unclaimed row has no owner to steal from, which is why it is safe.
  //
  // Central accounts may also have no email at all — only match when there IS one, or every
  // emailless user would link onto the same local row.
  if (centralUser.email) {
    const byEmail = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND central_user_id IS NULL',
      [centralUser.email]
    );

    if (byEmail.rows.length > 0) {
      await pool.query(
        'UPDATE users SET central_user_id = $1 WHERE id = $2',
        [centralUser.central_user_id, byEmail.rows[0].id]
      );
      return { ...byEmail.rows[0], central_user_id: centralUser.central_user_id };
    }
  }

  // Falling through to INSERT means the email/username may still be spoken for by a row we
  // just refused to adopt. `users.username` is UNIQUE NOT NULL and `users.email` is UNIQUE,
  // so reusing either verbatim would raise 23505 and 500 the login. Give up the email
  // (NULL never collides) and disambiguate the username with the central id, which is
  // itself unique.
  const username = await freeUsername(centralUser.username, centralUser.central_user_id);
  const email = centralUser.email ? await freeEmail(centralUser.email) : null;

  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash, role, central_user_id, is_guest)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [username, email, '', 'viewer', centralUser.central_user_id, !!centralUser.is_guest]
  );

  return result.rows[0];
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

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    if (SSO_ENABLED) {
      const centralRes = await centralRegister({ username, email, password });
      if (!centralRes.ok) {
        return res.status(centralRes.status).json({ message: centralRes.data.error || 'Registration failed' });
      }
      const localUser = await findOrCreateLocalUser(centralRes.data);
      const token = generateToken(localUser.id, localUser.token_version);
      // Waypoint hands the one-time recovery code back exactly once: pass it on, so the new
      // account is recoverable without the person ever having heard of Waypoint
      return res.status(201).json({
        message: 'User created successfully',
        token,
        user: shape(localUser),
        recoveryCode: centralRes.data.recovery_code || null,
      });
    }

    // Fallback: local auth
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, created_at, token_version',
      [username, email, hashedPassword, 'viewer']
    );

    const user = result.rows[0];
    const token = generateToken(user.id, user.token_version);

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: { ...shape(user), createdAt: user.created_at }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    if (SSO_ENABLED) {
      const centralRes = await centralLogin({ email: username, password });
      if (!centralRes.ok) {
        return res.status(centralRes.status).json({ message: centralRes.data.error || 'Invalid credentials' });
      }
      const localUser = await findOrCreateLocalUser(centralRes.data);
      const token = generateToken(localUser.id, localUser.token_version);
      return res.json({ message: 'Login successful', token, user: shape(localUser) });
    }

    // Fallback: local auth
    const result = await pool.query(
      'SELECT id, username, email, password_hash, role, token_version FROM users WHERE username = $1 OR email = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user.id, user.token_version);
    await pool.query('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    res.json({ message: 'Login successful', token, user: shape(user) });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// POST /api/auth/sso-callback — exchange authorization code for user info
router.post('/sso-callback', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body;
    if (!code) {
      return res.status(400).json({ message: 'Authorization code is required' });
    }

    const result = await exchangeCode(code, redirect_uri);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.data.error || 'SSO login failed' });
    }

    const localUser = await findOrCreateLocalUser(result.data);
    const token = generateToken(localUser.id, localUser.token_version);

    res.json({ message: 'SSO login successful', token, user: shape(localUser) });
  } catch (error) {
    console.error('SSO callback error:', error);
    res.status(500).json({ message: 'SSO login failed' });
  }
});

// POST /api/auth/guest — one-click guest: mint a central guest account and sign in as it.
router.post('/guest', guestLimiter, async (req, res) => {
  if (!SSO_ENABLED) return res.status(503).json({ message: 'Guest sign-in is not available' });
  try {
    const result = await centralGuest();
    if (!result.ok) {
      return res.status(result.status).json({ message: result.data.error || 'Could not start a guest session' });
    }
    const localUser = await findOrCreateLocalUser(result.data);
    const token = generateToken(localUser.id, localUser.token_version);
    res.json({ message: 'Guest session started', token, user: shape(localUser) });
  } catch (error) {
    console.error('Guest login error:', error);
    res.status(500).json({ message: 'Could not start a guest session' });
  }
});

// GET /api/auth/config — public. Lets the client decide whether to show the SSO button
// without any build-time (VITE) vars; SSO is configured entirely server-side now.
router.get('/config', (req, res) => {
  // accountUrl: where passwords are reset and accounts managed — Waypoint, when SSO is on
  res.json({ ssoEnabled: SSO_ENABLED, accountUrl: SSO_ENABLED ? AUTH_SERVICE_URL : null });
});

// GET /api/auth/sso/login — begin SSO. Bounce to the auth-service authorize endpoint with the
// SERVER-held client_id, so the client_id / auth-service URL never get baked into the browser
// bundle. State is generated client-side and stored in sessionStorage before landing here; it is
// echoed back to the callback for validation.
router.get('/sso/login', (req, res) => {
  if (!SSO_ENABLED) return res.status(503).send('SSO is not configured');
  const state = req.query.state || '';
  const url = new URL(`${AUTH_SERVICE_URL}/oauth/authorize`);
  url.searchParams.set('client_id', SSO_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${baseUrl(req)}${CALLBACK_PATH}`);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

// POST /api/auth/logout — actually ends the session instead of only forgetting it.
// Clearing localStorage leaves the token itself valid until it expires, so a copy taken
// before sign-out keeps working. Bumping token_version makes the middleware refuse it.
// This signs the user out of every device, which is the point: it is the lever you pull
// when you think a token has escaped.
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [req.user.id]
    );
    res.json({ message: 'Signed out' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during sign out' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const body = { user: shape(req.user) };

    // The app calls this on every load, which makes it the natural place to slide the
    // session forward: past the halfway mark, hand back a fresh token. Without it the
    // short TTL would sign an active user out mid-campaign; with it only a browser left
    // idle for a whole window has to log in again.
    const refreshed = refreshIfStale(req.tokenPayload, req.tokenVersion);
    if (refreshed) body.token = refreshed;

    res.json(body);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
