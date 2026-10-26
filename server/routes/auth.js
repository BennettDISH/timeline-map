const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit, waypointUser } = require('fleet-kit/server');
const pool = require('../config/database');
const { wp, findOrCreateLocalUser, shape } = require('../config/auth');
const router = express.Router();

// The Atlas's own email-or-username and password forms (register and login): through Waypoint's
// proxy when SSO is on, against the local table only in the no-Waypoint dev mode. Everything else
// about signing in is fleet-kit's router, mounted below: /config, /sso/login (?prompt=login is
// "Switch account"), /me, /logout (every device), /logout-all and /guest. Waypoint comes back to
// /auth/callback (server.js). Every answer that signs someone in sets the session cookie.

// Throttle credential endpoints (login/register) to blunt brute-forcing: each is a call to
// Waypoint, which caps per calling address and sees only this server's. (The kit limits its own:
// the code exchange and the guest button.)
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many attempts. Please try again in a few minutes.' });

// The session for an account, and the account for the page.
const signIn = (res, user) => {
  wp.session.set(res, user);
  return shape(user);
};

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password || typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    if (wp.client.configured()) {
      const r = await wp.client.register({ username, email, password });
      if ((r.status !== 200 && r.status !== 201) || !r.json?.central_user_id) {
        return res.status(r.status >= 400 ? r.status : 502).json({ message: r.json?.error || 'Registration failed' });
      }
      const localUser = await findOrCreateLocalUser(waypointUser(r.json, { guest: false }));
      // Waypoint hands the one-time recovery code back exactly once: pass it on, so the new
      // account is recoverable without the person ever having heard of Waypoint
      return res.status(201).json({
        message: 'User created successfully',
        user: signIn(res, localUser),
        recoveryCode: r.json.recovery_code || null,
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
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, created_at, token_version, central_user_id, is_guest',
      [username, email, hashedPassword, 'viewer']
    );

    const user = result.rows[0];
    res.status(201).json({
      message: 'User created successfully',
      user: { ...signIn(res, user), createdAt: user.created_at }
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
