const { isAdmin: kitIsAdmin } = require('fleet-kit/server');
const { wp } = require('../config/auth');

// Admin is a Waypoint IDENTITY, never a local role: the central ids listed in
// ADMIN_CENTRAL_USER_IDS (comma-separated; unset is central id 1, see config/auth.js). A guest
// is never an admin, and a row with no central id (the no-Waypoint dev mode) is never an admin
// either. Read on every check, so a Railway variable change needs no deploy.
const isAdmin = (u) => kitIsAdmin(u);

// The session check every signed-in route runs: the httpOnly session cookie (fleet-kit), read
// against the account's row on every request, so a signed-out (token_version), deleted or swept
// account is a 401 at once. Every dead session is a 401, so the client can end it on the status
// alone; 403 means a live session that lacks permission (admin routes). req.user is the row.
const authenticateToken = (req, res, next) => {
  // A signed-in answer is never stored by the browser, nor revalidated into use from a copy it
  // stored before
  res.set('Cache-Control', 'no-store');
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  return wp.requireUser(req, res, () => {
    req.user.isAdmin = Boolean(req.user.is_admin);
    next();
  });
};

// Middleware for admin-only routes
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (!req.user.isAdmin) return res.status(403).json({ message: 'Insufficient permissions' });
  next();
};

module.exports = { authenticateToken, requireAdmin, isAdmin };
