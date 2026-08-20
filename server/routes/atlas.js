const crypto = require('crypto');
const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { resolveImageUrl } = require('../utils/imageUrl');
const router = express.Router();

// The redesigned "Atlas" API: one world = a graph of typed nodes seen through nested maps,
// filtered by the world timeline, with a DM/Player reveal layer. Additive to the legacy API.
// See docs/UX-REDESIGN.md. All routes require auth and are scoped to worlds the caller owns.
router.use(authenticateToken);

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => { console.error('atlas error:', err); res.status(500).json({ message: 'Server error' }); });

// ---- ownership resolution (a caller may only touch their own worlds) ----
async function ownsWorld(worldId, userId) {
  const r = await pool.query('SELECT id FROM worlds WHERE id=$1 AND created_by=$2 AND is_active=true', [worldId, userId]);
  return r.rows.length > 0;
}
const worldIdOfMap = async (id) => (await pool.query('SELECT world_id FROM maps WHERE id=$1', [id])).rows[0]?.world_id;
const worldIdOfNode = async (id) => (await pool.query('SELECT world_id FROM nodes WHERE id=$1', [id])).rows[0]?.world_id;
const worldIdOfEra = async (id) => (await pool.query('SELECT world_id FROM eras WHERE id=$1', [id])).rows[0]?.world_id;
const worldIdOfPlacement = async (id) =>
  (await pool.query('SELECT m.world_id FROM placements p JOIN maps m ON p.map_id=m.id WHERE p.id=$1', [id])).rows[0]?.world_id;

// Build the breadcrumb from a map up to its world root, following owner_node -> a placement's map.
async function breadcrumb(mapId) {
  const chain = []; let mid = mapId; const seen = new Set();
  while (mid && !seen.has(mid)) {
    seen.add(mid);
    const m = (await pool.query('SELECT id, title, owner_node_id FROM maps WHERE id=$1', [mid])).rows[0];
    if (!m) break;
    chain.unshift({ mapId: m.id, title: m.title });
    if (!m.owner_node_id) break;
    const p = (await pool.query('SELECT map_id FROM placements WHERE node_id=$1 ORDER BY id LIMIT 1', [m.owner_node_id])).rows[0];
    mid = p?.map_id;
  }
  return chain;
}

// GET /worlds/:worldId — world + timeline; lazily ensures a root map exists.
router.get('/worlds/:worldId', wrap(async (req, res) => {
  const { worldId } = req.params;
  if (!(await ownsWorld(worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const w = (await pool.query('SELECT * FROM worlds WHERE id=$1', [worldId])).rows[0];
  if (!w.root_map_id) {
    const m = (await pool.query(
      `INSERT INTO maps (title, world_id, view, created_by) VALUES ($1,$2,'map',$3) RETURNING id`,
      [`${w.name} — World Map`, worldId, req.user.id])).rows[0];
    await pool.query('UPDATE worlds SET root_map_id=$1 WHERE id=$2', [m.id, worldId]);
    w.root_map_id = m.id;
  }
  const eras = (await pool.query(
    'SELECT id, name, start_time, end_time, player_visible FROM eras WHERE world_id=$1 ORDER BY start_time, id',
    [worldId])).rows.map((e) => ({ id: e.id, name: e.name, start: e.start_time, end: e.end_time, playerVisible: e.player_visible }));
  res.json({ world: {
    id: w.id, name: w.name, description: w.description, rootMapId: w.root_map_id,
    shareToken: w.share_token || null,
    timeline: { enabled: w.timeline_enabled, min: w.timeline_min_time, max: w.timeline_max_time,
                current: w.timeline_current_time, unit: w.timeline_time_unit },
    eras,
  } });
}));

// POST /worlds/:worldId/share — mint (or rotate, revoking the old link) the share token.
// DELETE /worlds/:worldId/share — turn sharing off.
router.post('/worlds/:worldId/share', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const token = crypto.randomBytes(18).toString('base64url');
  await pool.query('UPDATE worlds SET share_token=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [token, req.params.worldId]);
  res.status(201).json({ token });
}));
router.delete('/worlds/:worldId/share', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  await pool.query('UPDATE worlds SET share_token=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [req.params.worldId]);
  res.json({ ok: true });
}));

// PATCH /worlds/:worldId — world name/description + timeline (enable, range, scrub position).
router.patch('/worlds/:worldId', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  // Keep the timeline invariant (min < max, current within range) against partial updates.
  if ('timeline_min_time' in req.body || 'timeline_max_time' in req.body || 'timeline_current_time' in req.body) {
    const stored = (await pool.query(
      'SELECT timeline_min_time, timeline_max_time, timeline_current_time FROM worlds WHERE id=$1', [req.params.worldId])).rows[0];
    const min = req.body.timeline_min_time ?? stored.timeline_min_time;
    const max = req.body.timeline_max_time ?? stored.timeline_max_time;
    const cur = req.body.timeline_current_time ?? stored.timeline_current_time;
    if (min >= max) return res.status(400).json({ message: 'Timeline start must be before its end' });
    if (cur < min || cur > max) req.body.timeline_current_time = Math.min(Math.max(cur, min), max);
  }
  const cols = {
    name: 'name', description: 'description',
    timeline_enabled: 'timeline_enabled', timeline_min_time: 'timeline_min_time',
    timeline_max_time: 'timeline_max_time', timeline_current_time: 'timeline_current_time',
    timeline_time_unit: 'timeline_time_unit',
  };
  const sets = [], vals = []; let i = 1;
  for (const k in cols) if (k in req.body) { sets.push(`${cols[k]}=$${i++}`); vals.push(req.body[k]); }
  if (sets.length) { vals.push(req.params.worldId); await pool.query(`UPDATE worlds SET ${sets.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${i}`, vals); }
  res.json({ ok: true });
}));

// GET /worlds/:worldId/maps — flat list for the nesting tree (client builds the tree from parentMapId).
router.get('/worlds/:worldId/maps', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const rows = (await pool.query(`
    SELECT m.id, m.title, m.owner_node_id,
      (SELECT p.map_id FROM placements p WHERE p.node_id=m.owner_node_id ORDER BY p.id LIMIT 1) AS parent_map_id
    FROM maps m WHERE m.world_id=$1 AND m.is_active=true ORDER BY m.id`, [req.params.worldId])).rows;
  res.json({ maps: rows.map((m) => ({ id: m.id, title: m.title, ownerNodeId: m.owner_node_id, parentMapId: m.parent_map_id })) });
}));

// GET /worlds/:worldId/nodes — the world's node index (for browse + drag-to-place).
router.get('/worlds/:worldId/nodes', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const rows = (await pool.query(
    'SELECT id, title, category, visibility, interior_map_id FROM nodes WHERE world_id=$1 ORDER BY title', [req.params.worldId])).rows;
  res.json({ nodes: rows.map((n) => ({ id: n.id, title: n.title, category: n.category, visibility: n.visibility, hasInterior: !!n.interior_map_id })) });
}));

// GET /maps/:mapId — everything the canvas needs: the map, its placements+nodes, links among them, breadcrumb.
router.get('/maps/:mapId', wrap(async (req, res) => {
  const wid = await worldIdOfMap(req.params.mapId);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  const map = (await pool.query(
    'SELECT m.*, i.file_path AS backdrop_path FROM maps m LEFT JOIN images i ON m.image_id=i.id WHERE m.id=$1', [req.params.mapId])).rows[0];
  const pl = (await pool.query(`
    SELECT p.id AS placement_id, p.x, p.y, p.start_time, p.end_time, p.visibility AS placement_vis,
           n.id AS node_id, n.title, n.category, n.visibility AS node_vis, n.body, n.interior_map_id,
           ni.file_path AS node_image_path, im.view AS interior_view
    FROM placements p
    JOIN nodes n ON p.node_id = n.id
    LEFT JOIN images ni ON n.image_id = ni.id
    LEFT JOIN maps im ON n.interior_map_id = im.id
    WHERE p.map_id=$1 ORDER BY p.id`, [req.params.mapId])).rows;
  const placements = pl.map((r) => ({
    id: r.placement_id, x: Number(r.x), y: Number(r.y), start: r.start_time, end: r.end_time, visibility: r.placement_vis,
    node: { id: r.node_id, title: r.title, category: r.category, visibility: r.node_vis, body: r.body,
            hasInterior: !!r.interior_map_id, interiorMapId: r.interior_map_id, interiorView: r.interior_view,
            imageUrl: resolveImageUrl(req, r.node_image_path) },
  }));
  const nodeIds = placements.map((p) => p.node.id);
  let links = [];
  if (nodeIds.length) {
    links = (await pool.query(
      `SELECT id, from_node_id, to_node_id, kind, label, time_context
       FROM links WHERE from_node_id = ANY($1::int[]) AND to_node_id = ANY($1::int[])`, [nodeIds])).rows
      .map((l) => ({ id: l.id, from: l.from_node_id, to: l.to_node_id, kind: l.kind, label: l.label, timeContext: l.time_context }));
  }
  res.json({
    map: { id: map.id, title: map.title, view: map.view, ownerNodeId: map.owner_node_id, backdropUrl: resolveImageUrl(req, map.backdrop_path) },
    placements, links, breadcrumb: await breadcrumb(req.params.mapId),
  });
}));

// PATCH /maps/:mapId — title / view / backdrop image.
router.patch('/maps/:mapId', wrap(async (req, res) => {
  const wid = await worldIdOfMap(req.params.mapId);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  const cols = { title: 'title', view: 'view', image_id: 'image_id' };
  const sets = [], vals = []; let i = 1;
  for (const k in cols) if (k in req.body) { sets.push(`${cols[k]}=$${i++}`); vals.push(req.body[k]); }
  if (sets.length) { vals.push(req.params.mapId); await pool.query(`UPDATE maps SET ${sets.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${i}`, vals); }
  res.json({ ok: true });
}));

// POST /maps/:mapId/nodes — drop a NEW node on this map (create node + placement).
router.post('/maps/:mapId/nodes', wrap(async (req, res) => {
  const wid = await worldIdOfMap(req.params.mapId);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  const { title = 'New node', category = 'note', x = 50, y = 50, body = null } = req.body;
  const n = (await pool.query(
    'INSERT INTO nodes (world_id, title, category, body, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [wid, title, category, body, req.user.id])).rows[0];
  const p = (await pool.query('INSERT INTO placements (node_id, map_id, x, y) VALUES ($1,$2,$3,$4) RETURNING id',
    [n.id, req.params.mapId, x, y])).rows[0];
  res.status(201).json({ nodeId: n.id, placementId: p.id });
}));

// POST /maps/:mapId/placements — place an EXISTING node on this map (drag from the index).
router.post('/maps/:mapId/placements', wrap(async (req, res) => {
  const wid = await worldIdOfMap(req.params.mapId);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  const { node_id, x = 50, y = 50 } = req.body;
  if ((await worldIdOfNode(node_id)) !== wid) return res.status(400).json({ message: 'Node is not in this world' });
  const p = (await pool.query('INSERT INTO placements (node_id, map_id, x, y) VALUES ($1,$2,$3,$4) RETURNING id',
    [node_id, req.params.mapId, x, y])).rows[0];
  res.status(201).json({ placementId: p.id });
}));

// GET /nodes/:id — full node detail incl. links + backlinks (for the inspector).
router.get('/nodes/:id', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const n = (await pool.query('SELECT n.*, i.file_path AS img FROM nodes n LEFT JOIN images i ON n.image_id=i.id WHERE n.id=$1', [req.params.id])).rows[0];
  const out = (await pool.query('SELECT l.id, l.kind, l.label, l.time_context, l.to_node_id AS other, n2.title, n2.category AS other_cat FROM links l JOIN nodes n2 ON l.to_node_id=n2.id WHERE l.from_node_id=$1', [req.params.id])).rows;
  const back = (await pool.query('SELECT l.id, l.kind, l.label, l.time_context, l.from_node_id AS other, n2.title, n2.category AS other_cat FROM links l JOIN nodes n2 ON l.from_node_id=n2.id WHERE l.to_node_id=$1', [req.params.id])).rows;
  const shape = (l, dir) => ({ id: l.id, dir, kind: l.kind, label: l.label, timeContext: l.time_context, otherId: l.other, otherTitle: l.title, otherCategory: l.other_cat });
  res.json({
    node: { id: n.id, title: n.title, body: n.body, category: n.category, visibility: n.visibility,
            hasInterior: !!n.interior_map_id, interiorMapId: n.interior_map_id, imageUrl: resolveImageUrl(req, n.img) },
    links: out.map((l) => shape(l, 'out')), backlinks: back.map((l) => shape(l, 'in')),
  });
}));

// GET /nodes/:id/locate — where to jump to this node: its interior, else a map it's placed on.
router.get('/nodes/:id/locate', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const n = (await pool.query('SELECT interior_map_id FROM nodes WHERE id=$1', [req.params.id])).rows[0];
  if (n?.interior_map_id) return res.json({ mapId: n.interior_map_id });
  const p = (await pool.query('SELECT id, map_id FROM placements WHERE node_id=$1 ORDER BY id LIMIT 1', [req.params.id])).rows[0];
  res.json(p ? { mapId: p.map_id, placementId: p.id } : {});
}));

// GET /nodes/:id/impact — what deleting this node takes with it: how many maps it sits on,
// and (walking its interior tree, cycles-safe via UNION) how many maps and nodes live inside.
// The client shows this before the delete so "honest delete" isn't a guess.
router.get('/nodes/:id/impact', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const r = (await pool.query(`
    WITH RECURSIVE tree(map_id) AS (
      SELECT interior_map_id FROM nodes WHERE id = $1 AND interior_map_id IS NOT NULL
      UNION
      SELECT n.interior_map_id
      FROM tree t
      JOIN placements p ON p.map_id = t.map_id
      JOIN nodes n ON n.id = p.node_id
      WHERE n.interior_map_id IS NOT NULL
    )
    SELECT
      (SELECT COUNT(*) FROM placements WHERE node_id = $1) AS placements,
      (SELECT COUNT(*) FROM tree) AS interior_maps,
      (SELECT COUNT(DISTINCT p.node_id) FROM placements p
        WHERE p.map_id IN (SELECT map_id FROM tree) AND p.node_id != $1) AS nodes_inside`,
    [req.params.id])).rows[0];
  res.json({
    placements: parseInt(r.placements),
    interiorMaps: parseInt(r.interior_maps),
    nodesInside: parseInt(r.nodes_inside),
  });
}));

// PATCH /nodes/:id — title / body / category / visibility / image.
router.patch('/nodes/:id', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const cols = { title: 'title', body: 'body', category: 'category', visibility: 'visibility', image_id: 'image_id' };
  const sets = [], vals = []; let i = 1;
  for (const k in cols) if (k in req.body) { sets.push(`${cols[k]}=$${i++}`); vals.push(req.body[k]); }
  if (sets.length) { vals.push(req.params.id); await pool.query(`UPDATE nodes SET ${sets.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${i}`, vals); }
  res.json({ ok: true });
}));

// POST /nodes/:id/interior — give a node an interior map (its zoom-in space); idempotent.
router.post('/nodes/:id/interior', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const node = (await pool.query('SELECT title, interior_map_id FROM nodes WHERE id=$1', [req.params.id])).rows[0];
  if (node.interior_map_id) return res.json({ mapId: node.interior_map_id });
  const view = req.body.view === 'list' ? 'list' : 'map';
  const m = (await pool.query(
    'INSERT INTO maps (title, world_id, view, owner_node_id, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [node.title, wid, view, req.params.id, req.user.id])).rows[0];
  await pool.query('UPDATE nodes SET interior_map_id=$1 WHERE id=$2', [m.id, req.params.id]);
  res.status(201).json({ mapId: m.id });
}));

// DELETE /nodes/:id — delete the node everywhere (cascades placements, links, and its interior map).
router.delete('/nodes/:id', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  await pool.query('DELETE FROM nodes WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

// PATCH /placements/:id — move / lifespan / visibility.
router.patch('/placements/:id', wrap(async (req, res) => {
  const wid = await worldIdOfPlacement(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Placement not found' });
  const cols = { x: 'x', y: 'y', start_time: 'start_time', end_time: 'end_time', visibility: 'visibility' };
  const sets = [], vals = []; let i = 1;
  for (const k in cols) if (k in req.body) { sets.push(`${cols[k]}=$${i++}`); vals.push(req.body[k]); }
  if (sets.length) { vals.push(req.params.id); await pool.query(`UPDATE placements SET ${sets.join(', ')} WHERE id=$${i}`, vals); }
  res.json({ ok: true });
}));

// DELETE /placements/:id — remove the node from THIS map (the node itself survives).
router.delete('/placements/:id', wrap(async (req, res) => {
  const wid = await worldIdOfPlacement(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Placement not found' });
  await pool.query('DELETE FROM placements WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

// Eras: named periods of history. player_visible ones are scrubbable in the Player View.
router.post('/worlds/:worldId/eras', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const { name = 'An age', start_time = 0, end_time = 0, player_visible = false } = req.body;
  const r = (await pool.query(
    'INSERT INTO eras (world_id, name, start_time, end_time, player_visible) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [req.params.worldId, String(name).slice(0, 120), parseInt(start_time, 10) || 0, parseInt(end_time, 10) || 0, !!player_visible])).rows[0];
  res.status(201).json({ id: r.id });
}));
router.patch('/eras/:id', wrap(async (req, res) => {
  const wid = await worldIdOfEra(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Era not found' });
  const cols = { name: 'name', start_time: 'start_time', end_time: 'end_time', player_visible: 'player_visible' };
  const sets = [], vals = []; let i = 1;
  for (const k in cols) if (k in req.body) { sets.push(`${cols[k]}=$${i++}`); vals.push(req.body[k]); }
  if (sets.length) { vals.push(req.params.id); await pool.query(`UPDATE eras SET ${sets.join(', ')} WHERE id=$${i}`, vals); }
  res.json({ ok: true });
}));
router.delete('/eras/:id', wrap(async (req, res) => {
  const wid = await worldIdOfEra(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Era not found' });
  await pool.query('DELETE FROM eras WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

// POST /links — connect two nodes in the same world; DELETE /links/:id.
router.post('/links', wrap(async (req, res) => {
  const { from_node_id, to_node_id, kind = 'reference', label = null, time_context = null } = req.body;
  const wid = await worldIdOfNode(from_node_id);
  if (!wid || wid !== (await worldIdOfNode(to_node_id)) || !(await ownsWorld(wid, req.user.id)))
    return res.status(400).json({ message: 'Invalid link' });
  const l = (await pool.query(
    'INSERT INTO links (world_id, from_node_id, to_node_id, kind, label, time_context) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [wid, from_node_id, to_node_id, kind, label, time_context])).rows[0];
  res.status(201).json({ id: l.id });
}));
router.delete('/links/:id', wrap(async (req, res) => {
  const r = (await pool.query('SELECT world_id FROM links WHERE id=$1', [req.params.id])).rows[0];
  if (!r || !(await ownsWorld(r.world_id, req.user.id))) return res.status(404).json({ message: 'Link not found' });
  await pool.query('DELETE FROM links WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
