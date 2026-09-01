const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// Middleware to verify JWT token
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
      'SELECT id, username, email, role, token_version FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(403).json({ message: 'User not found' });
    }

    const { token_version: tokenVersion, ...user } = userResult.rows[0];

    // The revocation check. A signed, unexpired token is not enough — its `tv` claim must
    // still match users.token_version, so bumping that column (logout) kills every token
    // already handed out for this user. A token with no `tv` predates this check and is
    // therefore one of the unrevocable ones; refuse it rather than honour it for a week.
    if (!Number.isInteger(decoded.tv) || decoded.tv !== tokenVersion) {
      return res.status(403).json({ message: 'Token no longer valid. Please sign in again.' });
    }

    req.user = user;
    req.tokenVersion = tokenVersion;
    req.tokenPayload = decoded;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ message: 'Token expired' });
    }
    
    console.error('Auth middleware error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Middleware to check user roles
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
};

// Middleware for admin-only routes
const requireAdmin = requireRole(['admin']);

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin
};