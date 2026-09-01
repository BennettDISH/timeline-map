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

// ---- undo: snapshot what a destructive delete removes; restorable for 24 hours ----
async function tombstone(worldId, userId, kind, payload) {
  await pool.query(`DELETE FROM tombstones WHERE created_at < NOW() - INTERVAL '24 hours'`);
  const r = await pool.query(
    'INSERT INTO tombstones (world_id, user_id, kind, payload) VALUES ($1,$2,$3,$4) RETURNING id',
    [worldId, userId, kind, JSON.stringify(payload)]);
  return r.rows[0].id;
}
const rowsOf = async (sql, args) => (await pool.query(sql, args)).rows;
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
    spotlightNodeId: w.spotlight_node_id ?? null,
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

// POST /worlds/:worldId/spotlight — light the players' trail toward one node; DELETE puts
// it out. share.js resolves the trail and prunes it at the first hidden step, so pointing
// at a secret shows players the way only as far as they may see.
router.post('/worlds/:worldId/spotlight', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const nodeId = Number(req.body?.nodeId);
  const n = (await pool.query('SELECT id FROM nodes WHERE id=$1 AND world_id=$2', [nodeId, req.params.worldId])).rows[0];
  if (!n) return res.status(400).json({ message: 'That node is not in this world' });
  await pool.query('UPDATE worlds SET spotlight_node_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [nodeId, req.params.worldId]);
  res.json({ ok: true });
}));
router.delete('/worlds/:worldId/spotlight', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  await pool.query('UPDATE worlds SET spotlight_node_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [req.params.worldId]);
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

// GET /templates — worlds any signed-in user may clone (the sample world).
router.get('/templates', wrap(async (req, res) => {
  const rows = await rowsOf('SELECT id, name, description FROM worlds WHERE is_template=true AND is_active=true ORDER BY id', []);
  res.json({ templates: rows });
}));

// POST /worlds/clone — deep-copy a world (a template, or one you own) into a new world the
// caller owns. Every id is remapped. Image ROWS are duplicated with storage_key NULL so
// clones never share — or cascade-delete — each other's R2 objects; base64 art is copied,
// R2-backed art keeps pointing at the original URL.
router.post('/worlds/clone', wrap(async (req, res) => {
  const { source_id, name } = req.body;
  const src = (await pool.query('SELECT * FROM worlds WHERE id=$1 AND is_active=true', [source_id])).rows[0];
  if (!src || (!src.is_template && src.created_by !== req.user.id)) return res.status(404).json({ message: 'World not found' });
  // storage-amplification backstop: cloning duplicates base64 art rows per clone
  const owned = (await pool.query('SELECT COUNT(*) FROM worlds WHERE created_by=$1 AND is_active=true', [req.user.id])).rows[0];
  if (parseInt(owned.count) >= 50) return res.status(400).json({ message: 'That is a lot of worlds — delete some first' });

  const client = await pool.connect();
  try {
  await client.query('BEGIN');
  const rowsOfC = async (sql, args) => (await client.query(sql, args)).rows;
  const w = (await client.query(
    `INSERT INTO worlds (name, description, created_by, timeline_enabled, timeline_min_time, timeline_max_time, timeline_current_time, timeline_time_unit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [String(name || src.name).slice(0, 255), src.description, req.user.id, src.timeline_enabled,
     src.timeline_min_time, src.timeline_max_time, src.timeline_current_time, src.timeline_time_unit])).rows[0];

  const imgMap = new Map(); const mapMap = new Map(); const nodeMap = new Map();
  for (const im of await rowsOfC('SELECT * FROM images WHERE world_id=$1', [src.id])) {
    const ext = im.filename.includes('.') ? im.filename.split('.').pop() : 'png';
    const fname = `clone-${crypto.randomBytes(9).toString('hex')}.${ext}`;
    const r = (await client.query(
      `INSERT INTO images (filename, original_name, file_path, file_size, mime_type, world_id, uploaded_by, alt_text, tags, base64_data, storage_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL) RETURNING id`,
      [fname, im.original_name, im.base64_data ? `/api/images-base64/serve/${fname}` : im.file_path,
       im.file_size, im.mime_type, w.id, req.user.id, im.alt_text, im.tags, im.base64_data])).rows[0];
    imgMap.set(im.id, r.id);
  }
  const maps = await rowsOfC('SELECT * FROM maps WHERE world_id=$1 AND is_active=true', [src.id]);
  for (const m of maps) {
    const r = (await client.query(
      `INSERT INTO maps (title, description, world_id, image_id, created_by, view, focus_start, focus_end)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [m.title, m.description, w.id, m.image_id ? (imgMap.get(m.image_id) || null) : null,
       req.user.id, m.view, m.focus_start, m.focus_end])).rows[0];
    mapMap.set(m.id, r.id);
  }
  const nodes = await rowsOfC('SELECT * FROM nodes WHERE world_id=$1', [src.id]);
  for (const n of nodes) {
    const r = (await client.query(
      `INSERT INTO nodes (world_id, title, body, category, image_id, visibility, pin, pin_size, author, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [w.id, n.title, n.body, n.category, n.image_id ? (imgMap.get(n.image_id) || null) : null,
       n.visibility, n.pin || 'chip', n.pin_size || 64, n.author, req.user.id])).rows[0];
    nodeMap.set(n.id, r.id);
  }
  for (const m of maps) if (m.owner_node_id && nodeMap.has(m.owner_node_id)) {
    await client.query('UPDATE maps SET owner_node_id=$1 WHERE id=$2', [nodeMap.get(m.owner_node_id), mapMap.get(m.id)]);
  }
  for (const n of nodes) if (n.interior_map_id && mapMap.has(n.interior_map_id)) {
    await client.query('UPDATE nodes SET interior_map_id=$1 WHERE id=$2', [mapMap.get(n.interior_map_id), nodeMap.get(n.id)]);
  }
  for (const pl of await rowsOfC('SELECT p.* FROM placements p JOIN maps m ON m.id=p.map_id WHERE m.world_id=$1', [src.id])) {
    if (!nodeMap.has(pl.node_id) || !mapMap.has(pl.map_id)) continue;
    await client.query('INSERT INTO placements (node_id, map_id, x, y, start_time, end_time, visibility) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [nodeMap.get(pl.node_id), mapMap.get(pl.map_id), pl.x, pl.y, pl.start_time, pl.end_time, pl.visibility]);
  }
  for (const l of await rowsOfC('SELECT * FROM links WHERE world_id=$1', [src.id])) {
    if (!nodeMap.has(l.from_node_id) || !nodeMap.has(l.to_node_id)) continue;
    await client.query('INSERT INTO links (world_id, from_node_id, to_node_id, kind, label, time_context) VALUES ($1,$2,$3,$4,$5,$6)',
      [w.id, nodeMap.get(l.from_node_id), nodeMap.get(l.to_node_id), l.kind, l.label, l.time_context]);
  }
  for (const e of await rowsOfC('SELECT * FROM eras WHERE world_id=$1', [src.id])) {
    await client.query('INSERT INTO eras (world_id, name, start_time, end_time, player_visible) VALUES ($1,$2,$3,$4,$5)',
      [w.id, e.name, e.start_time, e.end_time, e.player_visible]);
  }
  for (const b of await rowsOfC('SELECT b.* FROM map_backdrops b JOIN maps m ON m.id=b.map_id WHERE m.world_id=$1', [src.id])) {
    if (!mapMap.has(b.map_id) || !imgMap.has(b.image_id)) continue;
    await client.query('INSERT INTO map_backdrops (map_id, image_id, start_time, end_time) VALUES ($1,$2,$3,$4)',
      [mapMap.get(b.map_id), imgMap.get(b.image_id), b.start_time, b.end_time]);
  }
  for (const f of await rowsOfC('SELECT f.* FROM node_facts f JOIN nodes n ON n.id=f.node_id WHERE n.world_id=$1', [src.id])) {
    if (!nodeMap.has(f.node_id)) continue;
    await client.query('INSERT INTO node_facts (node_id, body, start_time, end_time) VALUES ($1,$2,$3,$4)',
      [nodeMap.get(f.node_id), f.body, f.start_time, f.end_time]);
  }
  if (src.root_map_id && mapMap.has(src.root_map_id)) {
    await client.query('UPDATE worlds SET root_map_id=$1 WHERE id=$2', [mapMap.get(src.root_map_id), w.id]);
  }
  await client.query('COMMIT');
  res.status(201).json({ worldId: w.id });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}));

// GET /worlds/:worldId/maps — flat list for the nesting tree (client builds the tree from parentMapId).
router.get('/worlds/:worldId/maps', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const rows = (await pool.query(`
    SELECT m.id, m.title, m.owner_node_id, i.file_path AS backdrop_path,
      (SELECT p.map_id FROM placements p WHERE p.node_id=m.owner_node_id ORDER BY p.id LIMIT 1) AS parent_map_id
    FROM maps m LEFT JOIN images i ON m.image_id=i.id
    WHERE m.world_id=$1 AND m.is_active=true ORDER BY m.id`, [req.params.worldId])).rows;
  res.json({ maps: rows.map((m) => ({ id: m.id, title: m.title, ownerNodeId: m.owner_node_id, parentMapId: m.parent_map_id, thumbUrl: resolveImageUrl(req, m.backdrop_path) })) });
}));

// GET /worlds/:worldId/nodes — the world's node index (for browse + drag-to-place).
router.get('/worlds/:worldId/nodes', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const rows = (await pool.query(`
    SELECT id, title, category, visibility, interior_map_id,
      EXISTS(SELECT 1 FROM placements p WHERE p.node_id = n.id) AS placed
    FROM nodes n WHERE world_id=$1 ORDER BY title`, [req.params.worldId])).rows;
  res.json({ nodes: rows.map((n) => ({ id: n.id, title: n.title, category: n.category, visibility: n.visibility, hasInterior: !!n.interior_map_id, placed: n.placed })) });
}));

// GET /maps/:mapId — everything the canvas needs: the map, its placements+nodes, links among them, breadcrumb.
router.get('/maps/:mapId', wrap(async (req, res) => {
  const wid = await worldIdOfMap(req.params.mapId);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  const map = (await pool.query(
    'SELECT m.*, i.file_path AS backdrop_path FROM maps m LEFT JOIN images i ON m.image_id=i.id WHERE m.id=$1', [req.params.mapId])).rows[0];
  const pl = (await pool.query(`
    SELECT p.id AS placement_id, p.x, p.y, p.start_time, p.end_time, p.visibility AS placement_vis,
           n.id AS node_id, n.title, n.category, n.visibility AS node_vis, n.body, n.dm_note, n.stance, n.interior_map_id, n.pin, n.author, n.pin_size,
           ni.file_path AS node_image_path, im.view AS interior_view
    FROM placements p
    JOIN nodes n ON p.node_id = n.id
    LEFT JOIN images ni ON n.image_id = ni.id
    LEFT JOIN maps im ON n.interior_map_id = im.id
    WHERE p.map_id=$1 ORDER BY p.id`, [req.params.mapId])).rows;
  const placements = pl.map((r) => ({
    id: r.placement_id, x: Number(r.x), y: Number(r.y), start: r.start_time, end: r.end_time, visibility: r.placement_vis,
    node: { id: r.node_id, title: r.title, category: r.category, visibility: r.node_vis, body: r.body, dmNote: r.dm_note, stance: r.stance,
            pin: r.pin, pinSize: r.pin_size, author: r.author, hasInterior: !!r.interior_map_id, interiorMapId: r.interior_map_id, interiorView: r.interior_view,
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
  const bds = (await pool.query(
    `SELECT b.id, b.image_id, b.start_time, b.end_time, i.file_path
     FROM map_backdrops b JOIN images i ON i.id = b.image_id
     WHERE b.map_id = $1 ORDER BY b.start_time NULLS FIRST, b.id`, [req.params.mapId])).rows;
  res.json({
    map: { id: map.id, title: map.title, view: map.view, ownerNodeId: map.owner_node_id,
           focusStart: map.focus_start, focusEnd: map.focus_end, dmNote: map.dm_note,
           backdropUrl: resolveImageUrl(req, map.backdrop_path) },
    backdrops: bds.map((b) => ({ id: b.id, imageId: b.image_id, start: b.start_time, end: b.end_time, url: resolveImageUrl(req, b.file_path) })),
    placements, links, breadcrumb: await breadcrumb(req.params.mapId),
  });
}));

// PATCH /maps/:mapId — title / view / backdrop image.
router.patch('/maps/:mapId', wrap(async (req, res) => {
  const wid = await worldIdOfMap(req.params.mapId);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  const cols = { title: 'title', view: 'view', image_id: 'image_id', focus_start: 'focus_start', focus_end: 'focus_end', dm_note: 'dm_note' };
  const sets = [], vals = []; let i = 1;
  for (const k in cols) if (k in req.body) { sets.push(`${cols[k]}=$${i++}`); vals.push(req.body[k]); }
  if (sets.length) { vals.push(req.params.mapId); await pool.query(`UPDATE maps SET ${sets.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${i}`, vals); }
  res.json({ ok: true });
}));

// Timed backdrops: the map's art for a period of history.
router.post('/maps/:mapId/backdrops', wrap(async (req, res) => {
  const wid = await worldIdOfMap(req.params.mapId);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  const { image_id, start_time = null, end_time = null } = req.body;
  const img = (await pool.query('SELECT world_id FROM images WHERE id=$1', [image_id])).rows[0];
  if (!img || img.world_id !== wid) return res.status(400).json({ message: 'Image is not in this world' });
  const r = (await pool.query(
    'INSERT INTO map_backdrops (map_id, image_id, start_time, end_time) VALUES ($1,$2,$3,$4) RETURNING id',
    [req.params.mapId, image_id, start_time, end_time])).rows[0];
  res.status(201).json({ id: r.id });
}));
const worldIdOfBackdrop = async (id) =>
  (await pool.query('SELECT m.world_id FROM map_backdrops b JOIN maps m ON b.map_id=m.id WHERE b.id=$1', [id])).rows[0]?.world_id;
router.patch('/backdrops/:id', wrap(async (req, res) => {
  const wid = await worldIdOfBackdrop(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Backdrop not found' });
  const cols = { start_time: 'start_time', end_time: 'end_time', image_id: 'image_id' };
  const sets = [], vals = []; let i = 1;
  for (const k in cols) if (k in req.body) { sets.push(`${cols[k]}=$${i++}`); vals.push(req.body[k]); }
  if (sets.length) { vals.push(req.params.id); await pool.query(`UPDATE map_backdrops SET ${sets.join(', ')} WHERE id=$${i}`, vals); }
  res.json({ ok: true });
}));
router.delete('/backdrops/:id', wrap(async (req, res) => {
  const wid = await worldIdOfBackdrop(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Backdrop not found' });
  await pool.query('DELETE FROM map_backdrops WHERE id=$1', [req.params.id]);
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
  const facts = (await pool.query(
    'SELECT id, body, start_time, end_time FROM node_facts WHERE node_id=$1 ORDER BY start_time NULLS FIRST, id',
    [req.params.id])).rows.map((f) => ({ id: f.id, body: f.body, start: f.start_time, end: f.end_time }));
  res.json({
    node: { id: n.id, title: n.title, body: n.body, category: n.category, visibility: n.visibility,
            hasInterior: !!n.interior_map_id, interiorMapId: n.interior_map_id, imageUrl: resolveImageUrl(req, n.img) },
    links: out.map((l) => shape(l, 'out')), backlinks: back.map((l) => shape(l, 'in')),
    facts,
  });
}));

// Timed facts: a node's description for a period of history.
router.post('/nodes/:id/facts', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const { body = '', start_time = null, end_time = null } = req.body;
  const r = (await pool.query(
    'INSERT INTO node_facts (node_id, body, start_time, end_time) VALUES ($1,$2,$3,$4) RETURNING id',
    [req.params.id, body, start_time, end_time])).rows[0];
  res.status(201).json({ id: r.id });
}));
const worldIdOfFact = async (id) =>
  (await pool.query('SELECT n.world_id FROM node_facts f JOIN nodes n ON f.node_id=n.id WHERE f.id=$1', [id])).rows[0]?.world_id;
router.patch('/facts/:id', wrap(async (req, res) => {
  const wid = await worldIdOfFact(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Fact not found' });
  const cols = { body: 'body', start_time: 'start_time', end_time: 'end_time' };
  const sets = [], vals = []; let i = 1;
  for (const k in cols) if (k in req.body) { sets.push(`${cols[k]}=$${i++}`); vals.push(req.body[k]); }
  if (sets.length) { vals.push(req.params.id); await pool.query(`UPDATE node_facts SET ${sets.join(', ')} WHERE id=$${i}`, vals); }
  res.json({ ok: true });
}));
router.delete('/facts/:id', wrap(async (req, res) => {
  const wid = await worldIdOfFact(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Fact not found' });
  await pool.query('DELETE FROM node_facts WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
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
  const cols = { title: 'title', body: 'body', dm_note: 'dm_note', stance: 'stance', category: 'category', visibility: 'visibility', image_id: 'image_id', pin: 'pin', pin_size: 'pin_size' };
  const sets = [], vals = []; let i = 1;
  for (const k in cols) if (k in req.body) { sets.push(`${cols[k]}=$${i++}`); vals.push(req.body[k]); }
  if (sets.length) { vals.push(req.params.id); await pool.query(`UPDATE nodes SET ${sets.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${i}`, vals); }
  // Revealing a node reveals where it stands: the Forge births placements DM-only, so a
  // "revealed" node would otherwise stay invisible to players behind its hidden placement.
  if ('visibility' in req.body && req.body.visibility !== 'dm') {
    await pool.query(`UPDATE placements SET visibility='shared' WHERE node_id=$1 AND visibility='dm'`, [req.params.id]);
  }
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

// DELETE /nodes/:id/interior — remove a node's interior space. The map inside is deleted
// (its placements cascade; nodes placed only there are left unplaced); the node stays.
router.delete('/nodes/:id/interior', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const n = (await pool.query('SELECT interior_map_id FROM nodes WHERE id=$1', [req.params.id])).rows[0];
  if (!n?.interior_map_id) return res.json({ ok: true });
  const snapshot = {
    ownerNodeId: Number(req.params.id),
    map: (await pool.query('SELECT * FROM maps WHERE id=$1', [n.interior_map_id])).rows[0],
    placements: await rowsOf('SELECT * FROM placements WHERE map_id=$1', [n.interior_map_id]),
    backdrops: await rowsOf('SELECT * FROM map_backdrops WHERE map_id=$1', [n.interior_map_id]),
  };
  await pool.query('DELETE FROM maps WHERE id=$1', [n.interior_map_id]);
  const undoId = await tombstone(wid, req.user.id, 'interior', snapshot);
  res.json({ ok: true, undoId });
}));

// DELETE /nodes/:id — delete the node everywhere (cascades placements, links, and its
// interior map). Everything removed is snapshotted first, so it can be undone.
router.delete('/nodes/:id', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const node = (await pool.query('SELECT * FROM nodes WHERE id=$1', [req.params.id])).rows[0];
  const snapshot = {
    node,
    placements: await rowsOf('SELECT * FROM placements WHERE node_id=$1', [node.id]),
    links: await rowsOf('SELECT * FROM links WHERE from_node_id=$1 OR to_node_id=$1', [node.id]),
    facts: await rowsOf('SELECT * FROM node_facts WHERE node_id=$1', [node.id]),
    interior: null,
  };
  if (node.interior_map_id) {
    snapshot.interior = {
      map: (await pool.query('SELECT * FROM maps WHERE id=$1', [node.interior_map_id])).rows[0],
      placements: await rowsOf('SELECT * FROM placements WHERE map_id=$1', [node.interior_map_id]),
      backdrops: await rowsOf('SELECT * FROM map_backdrops WHERE map_id=$1', [node.interior_map_id]),
    };
  }
  await pool.query('DELETE FROM nodes WHERE id=$1', [req.params.id]);
  const undoId = await tombstone(wid, req.user.id, 'node', snapshot);
  res.json({ ok: true, undoId });
}));

// POST /undo/:id — put back what a tombstoned delete removed, with original ids.
// The whole restore runs in ONE transaction: it either fully applies or fully rolls
// back, so a mid-restore failure can never half-resurrect a node or brick the
// tombstone. References that vanished in the meantime (an image deleted since, a
// linked node gone) are skipped rather than failing the restore.
router.post('/undo/:id', wrap(async (req, res) => {
  const t = (await pool.query('SELECT * FROM tombstones WHERE id=$1', [req.params.id])).rows[0];
  if (!t || !(await ownsWorld(t.world_id, req.user.id))) return res.status(404).json({ message: 'Nothing to undo' });
  const p = t.payload;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = async (table, id) =>
      id != null && (await client.query(`SELECT 1 FROM ${table} WHERE id=$1`, [id])).rows.length > 0;

    const insertMap = async (m, ownerNodeId) => {
      const imageId = (await exists('images', m.image_id)) ? m.image_id : null;
      await client.query(
        `INSERT INTO maps (id, title, description, world_id, image_id, parent_map_id, created_by, created_at, updated_at,
                           is_active, zoom_level, map_order, owner_node_id, view, focus_start, focus_end)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [m.id, m.title, m.description, m.world_id, imageId, m.parent_map_id, m.created_by, m.created_at, m.updated_at,
         m.is_active, m.zoom_level, m.map_order, ownerNodeId, m.view, m.focus_start, m.focus_end]);
    };
    const insertPlacement = async (pl) => {
      if (!(await exists('nodes', pl.node_id)) || !(await exists('maps', pl.map_id))) return;
      await client.query(
        `INSERT INTO placements (id, node_id, map_id, x, y, start_time, end_time, visibility, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        [pl.id, pl.node_id, pl.map_id, pl.x, pl.y, pl.start_time, pl.end_time, pl.visibility, pl.created_at]);
    };
    const insertBackdrop = async (b) => {
      if (!(await exists('images', b.image_id))) return;
      await client.query(
        'INSERT INTO map_backdrops (id, map_id, image_id, start_time, end_time, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [b.id, b.map_id, b.image_id, b.start_time, b.end_time, b.created_at]);
    };

    if (t.kind === 'node') {
      const n = p.node;
      const imageId = (await exists('images', n.image_id)) ? n.image_id : null;
      await client.query(
        `INSERT INTO nodes (id, world_id, title, body, category, interior_map_id, image_id, visibility, pin, pin_size, author, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [n.id, n.world_id, n.title, n.body, n.category, imageId, n.visibility, n.pin || 'chip', n.pin_size || 64, n.author || null, n.created_by, n.created_at, n.updated_at]);
      if (p.interior && p.interior.map) {
        await insertMap(p.interior.map, n.id);
        await client.query('UPDATE nodes SET interior_map_id=$1 WHERE id=$2', [p.interior.map.id, n.id]);
        for (const pl of p.interior.placements || []) await insertPlacement(pl);
        for (const b of p.interior.backdrops || []) await insertBackdrop(b);
      }
      // a node CAN be placed on its own interior map — that row appears in both
      // snapshot lists; insertPlacement's ON CONFLICT makes the second pass a no-op
      for (const pl of p.placements || []) await insertPlacement(pl);
      for (const l of p.links || []) {
        if (!(await exists('nodes', l.from_node_id)) || !(await exists('nodes', l.to_node_id))) continue;
        await client.query(
          'INSERT INTO links (id, world_id, from_node_id, to_node_id, kind, label, time_context, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [l.id, l.world_id, l.from_node_id, l.to_node_id, l.kind, l.label, l.time_context, l.created_at]);
      }
      for (const f of p.facts || []) {
        await client.query(
          'INSERT INTO node_facts (id, node_id, body, start_time, end_time, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
          [f.id, f.node_id, f.body, f.start_time, f.end_time, f.created_at]);
      }
    } else if (t.kind === 'placement') {
      await insertPlacement(p.placement);
    } else if (t.kind === 'interior') {
      if (!(await exists('nodes', p.ownerNodeId))) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'The node is gone' }); }
      const owner = (await client.query('SELECT interior_map_id FROM nodes WHERE id=$1', [p.ownerNodeId])).rows[0];
      if (owner.interior_map_id) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'The node has a new interior now' }); }
      await insertMap(p.map, p.ownerNodeId);
      await client.query('UPDATE nodes SET interior_map_id=$1 WHERE id=$2', [p.map.id, p.ownerNodeId]);
      for (const pl of p.placements || []) await insertPlacement(pl);
      for (const b of p.backdrops || []) await insertBackdrop(b);
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Unknown tombstone' });
    }

    for (const table of ['nodes', 'maps', 'placements', 'links', 'node_facts', 'map_backdrops']) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${table}','id'),
           GREATEST((SELECT COALESCE(MAX(id),1) FROM ${table}), (SELECT last_value FROM ${table}_id_seq)))`);
    }
    await client.query('DELETE FROM tombstones WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
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
  const row = (await pool.query('SELECT * FROM placements WHERE id=$1', [req.params.id])).rows[0];
  await pool.query('DELETE FROM placements WHERE id=$1', [req.params.id]);
  const undoId = await tombstone(wid, req.user.id, 'placement', { placement: row });
  res.json({ ok: true, undoId });
}));

// Eras: named periods of history. player_visible ones are scrubbable in the Player View.
// (link labels are clamped to the links.label VARCHAR(255) in the PATCH below)
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
router.patch('/links/:id', wrap(async (req, res) => {
  if (typeof req.body.label === 'string') req.body.label = req.body.label.slice(0, 255) || null;
  const r = (await pool.query('SELECT world_id FROM links WHERE id=$1', [req.params.id])).rows[0];
  if (!r || !(await ownsWorld(r.world_id, req.user.id))) return res.status(404).json({ message: 'Link not found' });
  const cols = { label: 'label', kind: 'kind' };
  const sets = [], vals = []; let i = 1;
  for (const k in cols) if (k in req.body) { sets.push(`${cols[k]}=$${i++}`); vals.push(req.body[k]); }
  if (sets.length) { vals.push(req.params.id); await pool.query(`UPDATE links SET ${sets.join(', ')} WHERE id=$${i}`, vals); }
  res.json({ ok: true });
}));
router.delete('/links/:id', wrap(async (req, res) => {
  const r = (await pool.query('SELECT world_id FROM links WHERE id=$1', [req.params.id])).rows[0];
  if (!r || !(await ownsWorld(r.world_id, req.user.id))) return res.status(404).json({ message: 'Link not found' });
  await pool.query('DELETE FROM links WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
