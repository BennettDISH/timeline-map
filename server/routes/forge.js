// The Forge API: the DM's doorway to their world's mind. The whole feature is a harness —
// without GEMINI_API_KEY (or with FORGE_ENABLED=0) every route except /status answers 404
// and nothing here ever runs, calls out, or writes. All routes require auth and are scoped
// to worlds the caller owns; nothing Forge-related is ever reachable from the share link.

const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { resolveImageUrl } = require('../utils/imageUrl');
const { enabled } = require('../forge/gemini');
const { converse, ensureMind } = require('../forge/mind');
const { discardBatch, allowAsks, paintAndStore } = require('../forge/contract');
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
  const rows = (await pool.query(
    `SELECT id, summary, created, asks, asks_state, created_at FROM forge_batches WHERE world_id=$1 AND status='pending' ORDER BY id DESC LIMIT 20`,
    [worldId])).rows;
  // plain-word lines for pending asks, with titles resolved so the DM reads names, not ids
  const nids = new Set(), eids = new Set(), mids = new Set();
  for (const b of rows) if (b.asks_state === 'pending') for (const a of (b.asks || [])) {
    if (a.node != null) nids.add(a.node);
    if (a.era != null) eids.add(a.era);
    if (a.map != null) mids.add(a.map);
    if (a.to_map != null) mids.add(a.to_map);
  }
  const nameOf = async (table, ids, col) => {
    if (!ids.size) return new Map();
    const r = await pool.query(`SELECT id, ${col} AS t FROM ${table} WHERE id = ANY($1)`, [[...ids]]);
    return new Map(r.rows.map((x) => [x.id, x.t]));
  };
  const nT = await nameOf('nodes', nids, 'title'), eT = await nameOf('eras', eids, 'name'), mT = await nameOf('maps', mids, 'title');
  const askLine = (a) => {
    const nn = nT.get(a.node) || `#${a.node}`;
    if (a.op === 'move') return a.to_map != null
      ? `Move “${nn}” onto “${mT.get(a.to_map) || `#${a.to_map}`}”`
      : `Move “${nn}” to a new spot on “${mT.get(a.map) || `#${a.map}`}”`;
    if (a.op === 'edit') {
      const what = [a.title != null && 'title', a.body != null && 'description', a.category != null && 'category'].filter(Boolean).join(', ');
      return `Rewrite the ${what} of “${nn}”`;
    }
    if (a.op === 'drop_era') return `Remove the era “${eT.get(a.era) || `#${a.era}`}”`;
    return 'Something unrecognized';
  };
  const batches = rows.map((b) => ({
    id: b.id, summary: b.summary,
    counts: Object.fromEntries(Object.entries(b.created || {}).map(([k, v]) => [k, v.length]).filter(([, v]) => v > 0)),
    asksState: b.asks_state,
    asksText: b.asks_state === 'pending' ? (b.asks || []).map(askLine) : [],
  }));
  let styleImage = null;
  if (mind.style_image_id) {
    const im = (await pool.query('SELECT id, file_path FROM images WHERE id=$1', [mind.style_image_id])).rows[0];
    if (im) styleImage = { id: im.id, url: resolveImageUrl(req, im.file_path) };
  }
  res.json({
    artStyle: mind.art_style || '', lore: mind.lore || '', bible: mind.bible || '',
    genSize: mind.gen_size || 'medium', styleImage,
    messages, batches,
  });
}));

// PATCH /worlds/:worldId/mind — the DM's hands on the mind itself: art style, memory,
// creation size, and the style anchor (an image of this world, or null to let the next
// painting become the anchor). Everything the mind runs on stays inspectable and editable.
router.patch('/worlds/:worldId/mind', wrap(async (req, res) => {
  const { worldId } = req.params;
  if (!(await ownsWorld(worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  await ensureMind(worldId);
  const sets = [], vals = [];
  const b = req.body || {};
  if ('art_style' in b) {
    if (typeof b.art_style !== 'string') return res.status(400).json({ message: 'art_style must be text' });
    sets.push(`art_style=$${vals.push(b.art_style.trim().slice(0, 4000))}`);
  }
  if ('lore' in b) {
    if (typeof b.lore !== 'string') return res.status(400).json({ message: 'lore must be text' });
    sets.push(`lore=$${vals.push(b.lore.slice(0, 20000))}`);
  }
  if ('bible' in b) {
    if (typeof b.bible !== 'string') return res.status(400).json({ message: 'bible must be text' });
    sets.push(`bible=$${vals.push(b.bible.slice(0, 100000))}`);
  }
  if ('gen_size' in b) {
    if (!['small', 'medium', 'large'].includes(b.gen_size)) return res.status(400).json({ message: 'gen_size must be small, medium, or large' });
    sets.push(`gen_size=$${vals.push(b.gen_size)}`);
  }
  if ('style_image_id' in b) {
    if (b.style_image_id === null) sets.push('style_image_id=NULL');
    else {
      const id = Number(b.style_image_id);
      const im = (await pool.query('SELECT id FROM images WHERE id=$1 AND world_id=$2', [id, worldId])).rows[0];
      if (!im) return res.status(400).json({ message: 'That image is not in this world' });
      sets.push(`style_image_id=$${vals.push(id)}`);
    }
  }
  if (sets.length) {
    vals.push(worldId);
    await pool.query(`UPDATE world_minds SET ${sets.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE world_id=$${vals.length}`, vals);
  }
  res.json({ ok: true });
}));

// POST /worlds/:worldId/chat — one turn with the mind. May create (staged, DM-only).
router.post('/worlds/:worldId/chat', wrap(async (req, res) => {
  const { worldId } = req.params;
  if (!(await ownsWorld(worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 4000) : '';
  if (!message) return res.status(400).json({ message: 'Say something to the mind' });
  // where the DM is standing — verified against this world, never trusted from the client
  const context = {};
  const mapId = Number(req.body?.context?.mapId);
  if (Number.isInteger(mapId)) {
    const m = (await pool.query('SELECT id, title FROM maps WHERE id=$1 AND world_id=$2', [mapId, worldId])).rows[0];
    if (m) { context.mapId = m.id; context.mapTitle = m.title; }
  }
  const nodeId = Number(req.body?.context?.nodeId);
  if (Number.isInteger(nodeId)) {
    const n = (await pool.query('SELECT id, title FROM nodes WHERE id=$1 AND world_id=$2', [nodeId, worldId])).rows[0];
    if (n) { context.nodeId = n.id; context.nodeTitle = n.title; }
  }
  const out = await converse({ worldId: Number(worldId), userId: req.user.id, message, context });
  res.json(out);
}));

// Batches: keep (it stays, card goes away) or discard (everything it made is removed).
router.post('/worlds/:worldId/batches/:id/keep', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  // keeping a batch lapses any still-pending asks — permission is never granted by inaction
  await pool.query(
    `UPDATE forge_batches SET status='kept',
       asks_state = CASE WHEN asks_state='pending' THEN 'refused' ELSE asks_state END
     WHERE id=$1 AND world_id=$2 AND status='pending'`,
    [req.params.id, req.params.worldId]);
  res.json({ ok: true });
}));

// The permission gate on a batch's asks: Allow executes them (undo recorded for Unmake),
// Refuse lets them lapse. Either way the batch's creations are untouched.
router.post('/worlds/:worldId/batches/:id/allow', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const out = await allowAsks({ worldId: Number(req.params.worldId), batchId: Number(req.params.id) });
  if (!out) return res.status(404).json({ message: 'No pending asks on that batch' });
  res.json(out);
}));
router.post('/worlds/:worldId/batches/:id/refuse', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  await pool.query(
    `UPDATE forge_batches SET asks_state='refused' WHERE id=$1 AND world_id=$2 AND asks_state='pending'`,
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
