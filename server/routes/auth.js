const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit, waypointUser } = require('fleet-kit/server');
const pool = require('../config/database');
const { wp, findOrCreateLocalUser, shape } = require('../config/auth');
const router = express.Router();

// The Atlas's own email-or-username and password form (login, behind /login?local): through
// Waypoint's proxy when SSO is on, against the local table only in the no-Waypoint dev mode.
// Signing UP is Waypoint's alone: "Create account" opens its sign-up form (/sso/login?prompt=create),
// which comes straight back here with no recovery-code screen. The Atlas's own sign-up form and
// its POST /register (which showed Waypoint's one-time recovery code) were retired on 2026-11-16.
// Everything else about signing in is fleet-kit's router, mounted below: /config, /sso/login
// (?prompt=login is "Switch account", ?prompt=create "Create account"), /me, /logout (every
// device), /logout-all and /guest. Waypoint comes back to /auth/callback (server.js). Every
// answer that signs someone in sets the session cookie.

// Throttle the password form to blunt brute-forcing: each try is a call to Waypoint, which caps
// per calling address and sees only this server's. (The kit limits its own: the code exchange
// and the guest button.)
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many attempts. Please try again in a few minutes.' });

// The session for an account, and the account for the page.
const signIn = (res, user) => {
  wp.session.set(res, user);
  return shape(user);
};

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    if (wp.client.configured()) {
      const r = await wp.client.login(username, password);
      if (r.status !== 200 || !r.json?.central_user_id) {
        return res.status(r.status >= 400 ? r.status : 502).json({ message: r.json?.error || 'Invalid credentials' });
      }
      const localUser = await findOrCreateLocalUser(waypointUser(r.json));
      return res.json({ message: 'Login successful', user: signIn(res, localUser) });
    }

    // Fallback: local auth
    const result = await pool.query(
      'SELECT id, username, email, password_hash, role, token_version, central_user_id, is_guest FROM users WHERE username = $1 OR email = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { password_hash: hash, ...user } = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    await pool.query('UPDATE users SET updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    res.json({ message: 'Login successful', user: signIn(res, user) });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

router.use(wp.router);

module.exports = router;
