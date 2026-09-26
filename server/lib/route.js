const pool = require('../config/database');

// Shared by every router: one error wrapper, one ownership rule, one "not yours" answer.
// wrap(tag, fallback): the raw error (provider JSON, SQL, a stack) goes to the log under the
// tag; the client gets err.userMessage when a provider set one, else the router's fallback.
const wrap = (tag, fallback = 'Server error') => (fn) => (req, res) =>
  fn(req, res).catch((err) => { console.error(`${tag} error:`, err); res.status(500).json({ message: err.userMessage || fallback }); });

// A caller may only touch their own worlds (worlds are hard-deleted, so a row is a live world).
async function ownsWorld(worldId, userId) {
  const r = await pool.query('SELECT 1 FROM worlds WHERE id=$1 AND created_by=$2', [worldId, userId]);
  return r.rows.length > 0;
}

// Something that is not the caller's is answered as if it did not exist — never a hint that
// it does (403) and never a validation complaint (400).
const notFound = (res, what = 'Not found') => res.status(404).json({ message: what });

module.exports = { wrap, ownsWorld, notFound };
