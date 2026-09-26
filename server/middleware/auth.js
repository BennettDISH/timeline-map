const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { refreshIfStale } = require('../utils/token');

// Admin is a Waypoint IDENTITY, never a local role: the central ids listed in
// ADMIN_CENTRAL_USER_IDS (comma-separated). Unset means the fleet convention — central id 1,
// Bennett — while an explicitly empty value grants nobody. A guest is never an admin, and a
// row with no central id (the no-Waypoint dev mode) is never an admin either.
const ADMIN_IDS = new Set((process.env.ADMIN_CENTRAL_USER_IDS ?? '1').split(',')
  .map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0));
const isAdmin = (u) => !!u && !u.is_guest && u.central_user_id != null && ADMIN_IDS.has(Number(u.central_user_id));

// Middleware to verify JWT token. Every way a session can be dead — no token, a bad one, an
// expired one, a revoked one, a deleted user — is a 401, so the client can end the session on
// the status alone; 403 means a live session that lacks permission (admin routes).
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists and session is valid
    const userResult = await pool.query(
      'SELECT id, username, email, role, token_version, central_user_id, is_guest FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'User not found' });
    }

    const { token_version: tokenVersion, ...user } = userResult.rows[0];

    // The revocation check. A signed, unexpired token is not enough — its `tv` claim must
    // still match users.token_version, so bumping that column (logout) kills every token
    // already handed out for this user. A token with no `tv` predates this check and is
    // therefore one of the unrevocable ones; refuse it rather than honour it for a week.
    if (!Number.isInteger(decoded.tv) || decoded.tv !== tokenVersion) {
      return res.status(401).json({ message: 'Token no longer valid. Please sign in again.' });
    }

    req.user = { ...user, isAdmin: isAdmin(user) };
    req.tokenVersion = tokenVersion;
    req.tokenPayload = decoded;
    // sliding session: an actively used browser never meets the expiry mid-edit
    try { const fresh = refreshIfStale(decoded, tokenVersion); if (fresh) res.setHeader('X-Refreshed-Token', fresh); } catch (e) { /* JWT_SECRET missing: nothing to slide */ }
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Middleware for admin-only routes
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (!req.user.isAdmin) return res.status(403).json({ message: 'Insufficient permissions' });
  next();
};

module.exports = { authenticateToken, requireAdmin, isAdmin };
