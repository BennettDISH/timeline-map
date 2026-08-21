// The Forge API: the DM's doorway to their world's mind. The whole feature is a harness —
// without GEMINI_API_KEY (or with FORGE_ENABLED=0) every route except /status answers 404
// and nothing here ever runs, calls out, or writes. All routes require auth and are scoped
// to worlds the caller owns; nothing Forge-related is ever reachable from the share link.

const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { enabled } = require('../forge/gemini');
const { converse, ensureMind } = require('../forge/mind');
const { discardBatch, paintAndStore } = require('../forge/contract');
const router = express.Router();

router.use(authenticateToken);

router.get('/status', (req, res) => res.json({ enabled: enabled() }));

// The harness switch: everything below simply does not exist when the Forge is off.
router.use((req, res, next) => (enabled() ? next() : res.status(404).json({ message: 'Route not found' })));

// Generations call a paid API — keep an honest ceiling well above table use.
router.use(rateLimit({ windowMs: 60 * 60 * 1000, max: 120 }));

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => { console.error('forge error:', err); res.status(500).json({ message: err.message || 'Server error' }); });

async function ownsWorld(worldId, userId) {
  const r = await pool.query('SELECT id FROM worlds WHERE id=$1 AND created_by=$2 AND is_active=true', [worldId, userId]);
  return r.rows.length > 0;
}

// GET /worlds/:worldId — the panel's state: conversation tail + pending batches.
router.get('/worlds/:worldId', wrap(async (req, res) => {
  const { worldId } = req.params;
  if (!(await ownsWorld(worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const mind = await ensureMind(worldId);
  const messages = (await pool.query(
    'SELECT role, content, created_at FROM mind_messages WHERE world_id=$1 ORDER BY id DESC LIMIT 40', [worldId])).rows.reverse();
  const batches = (await pool.query(
    `SELECT id, summary, created, created_at FROM forge_batches WHERE world_id=$1 AND status='pending' ORDER BY id DESC LIMIT 20`,
    [worldId])).rows.map((b) => ({
    id: b.id, summary: b.summary,
    counts: Object.fromEntries(Object.entries(b.created || {}).map(([k, v]) => [k, v.length]).filter(([, v]) => v > 0)),
  }));
  res.json({ hasStyle: !!mind.art_style, artStyle: mind.art_style || '', messages, batches });
}));

// POST /worlds/:worldId/chat — one turn with the mind. May create (staged, DM-only).
router.post('/worlds/:worldId/chat', wrap(async (req, res) => {
  const { worldId } = req.params;
  if (!(await ownsWorld(worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 4000) : '';
  if (!message) return res.status(400).json({ message: 'Say something to the mind' });
  const out = await converse({ worldId: Number(worldId), userId: req.user.id, message });
  res.json(out);
}));

// Batches: keep (it stays, card goes away) or discard (everything it made is removed).
router.post('/worlds/:worldId/batches/:id/keep', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  await pool.query(`UPDATE forge_batches SET status='kept' WHERE id=$1 AND world_id=$2 AND status='pending'`,
    [req.params.id, req.params.worldId]);
  res.json({ ok: true });
}));
router.post('/worlds/:worldId/batches/:id/discard', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const done = await discardBatch({ worldId: Number(req.params.worldId), batchId: Number(req.params.id) });
  if (!done) return res.status(404).json({ message: 'No such pending batch' });
  res.json({ ok: true });
}));

// POST /nodes/:id/art — paint this node's portrait/token in the world's style and attach it.
router.post('/nodes/:id/art', wrap(async (req, res) => {
  const n = (await pool.query(
    `SELECT n.id, n.world_id, n.title, n.category, n.image_id, LEFT(COALESCE(n.body,''),300) AS body
     FROM nodes n WHERE n.id=$1`, [req.params.id])).rows[0];
  if (!n || !(await ownsWorld(n.world_id, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const mind = await ensureMind(n.world_id);
  const guidance = typeof req.body?.guidance === 'string' ? req.body.guidance.slice(0, 500) : '';
  const prompt = [`${n.title} (${n.category})`, n.body, guidance].filter(Boolean).join('. ');
  const img = await paintAndStore({ worldId: n.world_id, userId: req.user.id, kind: 'art', prompt, artStyle: mind.art_style, name: `${n.title} — art` });
  // Fresh art on a bare node clearly wants to be seen: flip it to an image pin.
  // Replacing existing art keeps whatever pin the DM chose.
  if (n.image_id == null) await pool.query(`UPDATE nodes SET image_id=$1, pin='image', updated_at=CURRENT_TIMESTAMP WHERE id=$2`, [img.id, n.id]);
  else await pool.query('UPDATE nodes SET image_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [img.id, n.id]);
  res.json({ image: { id: img.id, url: img.url } });
}));

// POST /maps/:id/backdrop — paint this map's backdrop in the world's style and set it.
router.post('/maps/:id/backdrop', wrap(async (req, res) => {
  const m = (await pool.query('SELECT id, world_id, title, image_id FROM maps WHERE id=$1', [req.params.id])).rows[0];
  if (!m || !(await ownsWorld(m.world_id, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  const mind = await ensureMind(m.world_id);
  const guidance = typeof req.body?.guidance === 'string' ? req.body.guidance.slice(0, 500) : '';
  const feats = (await pool.query(
    `SELECT n.title FROM placements p JOIN nodes n ON n.id=p.node_id WHERE p.map_id=$1 ORDER BY p.id LIMIT 12`, [m.id])).rows;
  const prompt = [
    `the terrain of "${m.title}"`,
    feats.length ? `with ground for these features (do not label them): ${feats.map((f) => f.title).join(', ')}` : '',
    guidance,
  ].filter(Boolean).join('. ');
  const img = await paintAndStore({ worldId: m.world_id, userId: req.user.id, kind: 'backdrop', prompt, artStyle: mind.art_style, name: `${m.title} — backdrop` });
  await pool.query('UPDATE maps SET image_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [img.id, m.id]);
  res.json({ image: { id: img.id, url: img.url }, previousImageId: m.image_id });
}));

module.exports = router;
