const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { AUTH_SERVICE_URL, SSO_CLIENT_ID, centralRegister, centralLogin, centralGuest, exchangeCode } = require('../config/sso');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const SSO_ENABLED = !!process.env.AUTH_SERVICE_URL;

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

// Generate JWT token
const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set.');
  }
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Find or create a local user from central auth data, sync profile on login
async function findOrCreateLocalUser(centralUser) {
  // Check if we already have this central user linked
  const existing = await pool.query(
    'SELECT * FROM users WHERE central_user_id = $1',
    [centralUser.central_user_id]
  );

  if (existing.rows.length > 0) {
    const local = existing.rows[0];
    // Sync profile data from central on each login
    if (local.email !== centralUser.email || local.username !== centralUser.username) {
      await pool.query(
        'UPDATE users SET username = $1, email = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [centralUser.username, centralUser.email, local.id]
      );
      return { ...local, username: centralUser.username, email: centralUser.email };
    }
    return local;
  }

  // Check if there's a local user with matching email (pre-migration). Central accounts may
  // have no email, so only match when there IS one — otherwise every emailless user would
  // link onto the same local row.
  if (centralUser.email) {
    const byEmail = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [centralUser.email]
    );

    if (byEmail.rows.length > 0) {
      await pool.query(
        'UPDATE users SET central_user_id = $1 WHERE id = $2',
        [centralUser.central_user_id, byEmail.rows[0].id]
      );
      return byEmail.rows[0];
    }
  }

  // Create new local user with default role
  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash, role, central_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [centralUser.username, centralUser.email || null, '', 'viewer', centralUser.central_user_id]
  );

  return result.rows[0];
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

    // Check if database is set up
    try {
      await pool.query('SELECT 1 FROM users LIMIT 1');
    } catch (dbError) {
      if (dbError.code === '42P01') {
        return res.status(503).json({
          message: 'Database not initialized. Please contact an administrator to run the migration.',
          code: 'DB_NOT_INITIALIZED'
        });
      }
      throw dbError;
    }

    if (SSO_ENABLED) {
      const centralRes = await centralRegister({ username, email, password });
      if (!centralRes.ok) {
        return res.status(centralRes.status).json({ message: centralRes.data.error || 'Registration failed' });
      }
      const localUser = await findOrCreateLocalUser(centralRes.data);
      const token = generateToken(localUser.id);
      return res.status(201).json({
        message: 'User created successfully',
        token,
        user: { id: localUser.id, username: localUser.username, email: localUser.email, role: localUser.role }
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
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, created_at',
      [username, email, hashedPassword, 'viewer']
    );

    const user = result.rows[0];
    const token = generateToken(user.id);

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role, createdAt: user.created_at }
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

    // Check if database is set up
    try {
      await pool.query('SELECT 1 FROM users LIMIT 1');
    } catch (dbError) {
      if (dbError.code === '42P01') {
        return res.status(503).json({
          message: 'Database not initialized. Please contact an administrator to run the migration.',
          code: 'DB_NOT_INITIALIZED'
        });
      }
      throw dbError;
    }

    if (SSO_ENABLED) {
      const centralRes = await centralLogin({ email: username, password });
      if (!centralRes.ok) {
        return res.status(centralRes.status).json({ message: centralRes.data.error || 'Invalid credentials' });
      }
      const localUser = await findOrCreateLocalUser(centralRes.data);
      const token = generateToken(localUser.id);
      return res.json({
        message: 'Login successful',
        token,
        user: { id: localUser.id, username: localUser.username, email: localUser.email, role: localUser.role }
      });
    }

    // Fallback: local auth
    const result = await pool.query(
      'SELECT id, username, email, password_hash, role FROM users WHERE username = $1 OR email = $1',
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

    const token = generateToken(user.id);
    await pool.query('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });

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
    const token = generateToken(localUser.id);

    res.json({
      message: 'SSO login successful',
      token,
      user: { id: localUser.id, username: localUser.username, email: localUser.email, role: localUser.role }
    });
  } catch (error) {
    console.error('SSO callback error:', error);
    res.status(500).json({ message: 'SSO login failed' });
  }
});

// POST /api/auth/guest — one-click guest: mint a central guest account and sign in as it.
router.post('/guest', async (req, res) => {
  if (!SSO_ENABLED) return res.status(503).json({ message: 'Guest sign-in is not available' });
  try {
    const result = await centralGuest();
    if (!result.ok) {
      return res.status(result.status).json({ message: result.data.error || 'Could not start a guest session' });
    }
    const localUser = await findOrCreateLocalUser(result.data);
    const token = generateToken(localUser.id);
    res.json({
      message: 'Guest session started',
      token,
      user: { id: localUser.id, username: localUser.username, email: localUser.email, role: localUser.role }
    });
  } catch (error) {
    console.error('Guest login error:', error);
    res.status(500).json({ message: 'Could not start a guest session' });
  }
});

// GET /api/auth/config — public. Lets the client decide whether to show the SSO button
// without any build-time (VITE) vars; SSO is configured entirely server-side now.
router.get('/config', (req, res) => {
  res.json({ ssoEnabled: SSO_ENABLED });
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

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
