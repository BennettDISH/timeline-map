const crypto = require('crypto');
const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { resolveImageUrl } = require('../utils/imageUrl');
const { r2Enabled, putObject, copyObject } = require('../storage');
const { spotlightTrail, pendingForge } = require('./share');
const { isId, whole, text, oneOf, bool, ordered, pct, worldName, cleanBody, idParam } = require('../lib/validate');
const { CATEGORIES } = require('../lib/vocab');
const router = express.Router();

// The redesigned "Atlas" API: one world = a graph of typed nodes seen through nested maps,
// filtered by the world timeline, with a DM/Player reveal layer.
// See docs/UX-REDESIGN.md. All routes require auth and are scoped to worlds the caller owns.
router.use(authenticateToken);
// a non-canonical id (60.0, abc, -1) is a 404 before any query runs
router.param('worldId', idParam);
router.param('mapId', idParam);
router.param('id', idParam);
// every write reads req.body as an object; a missing or odd body is an empty one
router.use((req, res, next) => { if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) req.body = {}; next(); });

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => { console.error('atlas error:', err); res.status(500).json({ message: 'Server error' }); });

// ---- ownership resolution (a caller may only touch their own worlds) ----
async function ownsWorld(worldId, userId) {
  const r = await pool.query('SELECT id FROM worlds WHERE id=$1 AND created_by=$2', [worldId, userId]);
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
// an image may only be used inside its own world (ids are sequential and R2 URLs are public)
async function imageInWorld(imageId, wid) {
  const id = Number(imageId);
  if (!Number.isInteger(id)) return false;
  return (await pool.query('SELECT 1 FROM images WHERE id=$1 AND world_id=$2', [id, wid])).rows.length > 0;
}
const badImage = (res) => res.status(400).json({ message: 'Image is not in this world' });
// ---- input rules: a bad value is a 400 with a plain sentence (server/lib/validate.js) ----
const bad = (res, message) => res.status(400).json({ message });
const NODE_CATS = [...CATEGORIES, 'party'];
const VIS = ['dm', 'shared', 'player'];
const STANCES = ['friend', 'neutral', 'foe'];
const long = (v) => text(v, 20000, { trim: false }); // bodies and notes: TEXT columns under a generous ceiling
const idOrNull = (v) => (v == null ? null : (isId(v) ? Number(v) : undefined));
// a start/end pair on a PATCH is judged with the stored value standing in for the bound not sent
async function pairOk(table, id, vals) {
  if (!('start_time' in vals) && !('end_time' in vals)) return true;
  const row = (await pool.query(`SELECT start_time, end_time FROM ${table} WHERE id=$1`, [id])).rows[0] || {};
  return ordered('start_time' in vals ? vals.start_time : row.start_time, 'end_time' in vals ? vals.end_time : row.end_time);
}
// UPDATE the cleaned fields (column names equal the body's keys)
async function updateCols(table, id, vals, touch = false) {
  const keys = Object.keys(vals);
  if (!keys.length) return;
  await pool.query(`UPDATE ${table} SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(', ')}${touch ? ', updated_at=CURRENT_TIMESTAMP' : ''} WHERE id=$${keys.length + 1}`,
    [...keys.map((k) => vals[k]), id]);
}
// An outline is 3..200 [x,y] points in % of the plane (null clears it); undefined = bad input.
function cleanShape(raw) {
  if (raw == null) return null;
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > 200) return undefined;
  const out = [];
  for (const pt of raw) {
    const x = Number(pt?.[0]), y = Number(pt?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    out.push([Math.round(Math.min(100, Math.max(0, x)) * 100) / 100, Math.round(Math.min(100, Math.max(0, y)) * 100) / 100]);
  }
  return out;
}
const shapeParam = (sh) => (sh ? JSON.stringify(sh) : null); // pg would send a JS array as a Postgres array, not JSON
const SHAPE_KINDS = new Set(['area', 'button']);
const shapeKind = (k) => (k == null ? 'area' : (SHAPE_KINDS.has(k) ? k : undefined));
// style toggles: an object of known boolean keys (null clears — the preset applies); undefined = bad input
const STYLE_KEYS = ['fill', 'stroke', 'grow', 'glow', 'pop'];
function cleanStyle(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  for (const k of STYLE_KEYS) if (k in raw) out[k] = !!raw[k];
  return out;
}
const styleParam = (st) => (st ? JSON.stringify(st) : null);

// One list per table of the content columns a COPY (clone) or a RESTORE (undo) carries, so a
// column added later (dm_note, stance, voice_*, ambience_*) can never again be forgotten by
// one path while the other keeps it. Both paths insert from these lists.
const NODE_COLS = ['id', 'world_id', 'title', 'body', 'category', 'interior_map_id', 'image_id', 'visibility', 'pin', 'pin_size', 'author',
  'created_by', 'created_at', 'updated_at', 'dm_note', 'stance', 'voice_id', 'voice_name', 'voice_line', 'voice_url', 'voice_style'];
const MAP_COLS = ['id', 'title', 'world_id', 'image_id', 'created_by', 'created_at', 'updated_at',
  'owner_node_id', 'view', 'focus_start', 'focus_end', 'dm_note', 'ambience_prompt', 'ambience_url'];
const MIND_COLS = ['lore', 'art_style', 'style_image_id', 'gen_size', 'bible'];
const without = (cols, ...drop) => cols.filter((c) => !drop.includes(c));
// INSERT a row from a snapshot, copying every listed column the snapshot has, with overrides
// (an override of undefined drops the column). Returns the inserted row.
async function insertRow(client, table, cols, row, overrides = {}) {
  const data = {};
  for (const k of cols) if (row && row[k] !== undefined) data[k] = row[k];
  for (const [k, v] of Object.entries(overrides)) { if (v === undefined) delete data[k]; else data[k] = v; }
  const keys = Object.keys(data);
  const r = await client.query(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    keys.map((k) => data[k]));
  return r.rows[0];
}
// Build the breadcrumb from a map up to its world root, following owner_node -> a placement's map.
async function breadcrumb(mapId) {
  const chain = []; let mid = mapId; const seen = new Set();
  while (mid && !seen.has(mid)) {
    seen.add(mid);
    const m = (await pool.query('SELECT id, title, owner_node_id FROM maps WHERE id=$1', [mid])).rows[0];
    if (!m) break;
    chain.unshift({ mapId: m.id, title: m.title });
    if (!m.owner_node_id) break;
    // a footstep of the owner inside its own space is not the way up
    const p = (await pool.query('SELECT map_id FROM placements WHERE node_id=$1 AND map_id <> $2 ORDER BY id LIMIT 1', [m.owner_node_id, mid])).rows[0];
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
  if (!isId(req.body.nodeId)) return bad(res, 'That node is not in this world');
  const nodeId = Number(req.body.nodeId);
  const n = (await pool.query('SELECT id FROM nodes WHERE id=$1 AND world_id=$2', [nodeId, req.params.worldId])).rows[0];
  if (!n) return res.status(400).json({ message: 'That node is not in this world' });
  await pool.query('UPDATE worlds SET spotlight_node_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [nodeId, req.params.worldId]);
  // the reply says what players actually see: the trail as the share API resolves it
  const w = (await pool.query(
    'SELECT id, root_map_id, timeline_enabled, timeline_current_time, spotlight_node_id FROM worlds WHERE id=$1', [req.params.worldId])).rows[0];
  w.pending = await pendingForge(w.id);
  res.json({ ok: true, trail: await spotlightTrail(w) });
}));
router.delete('/worlds/:worldId/spotlight', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  await pool.query('UPDATE worlds SET spotlight_node_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [req.params.worldId]);
  res.json({ ok: true });
}));

// PATCH /worlds/:worldId — world name/description + timeline (enable, range, unit, the canon moment).
router.patch('/worlds/:worldId', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const c = cleanBody(req.body, {
    name: [worldName, 'A world needs a name of 1 to 255 characters'],
    description: [(v) => text(v, 2000), 'The description is text'],
    timeline_time_unit: [(v) => text(v, 50, { required: true }), 'The unit is a word of 1 to 50 characters'],
    timeline_enabled: [bool, 'The timeline is on or off'],
  });
  if (c.bad) return bad(res, c.bad);
  Object.assign(req.body, c.vals);
  // one world-name rule on every path (create, rename, clone): no two of yours share a name
  if ('name' in c.vals && (await pool.query('SELECT 1 FROM worlds WHERE name=$1 AND created_by=$2 AND id<>$3',
    [c.vals.name, req.user.id, req.params.worldId])).rows.length)
    return res.status(409).json({ message: 'You already have a world with this name' });
  // Keep the timeline invariant (min < max, current within range) against partial updates.
  // Every clock field must be a whole number — a null or a word would switch off the time
  // secrecy the share API builds on.
  for (const k of ['timeline_min_time', 'timeline_max_time', 'timeline_current_time']) {
    if (k in req.body) {
      const v = Number(req.body[k]);
      if (req.body[k] == null || !Number.isInteger(v)) return res.status(400).json({ message: 'Timeline moments must be whole numbers' });
      req.body[k] = v;
    }
  }
  if ('timeline_min_time' in req.body || 'timeline_max_time' in req.body || 'timeline_current_time' in req.body) {
    const stored = (await pool.query(
      'SELECT timeline_min_time, timeline_max_time, timeline_current_time FROM worlds WHERE id=$1', [req.params.worldId])).rows[0];
    const min = req.body.timeline_min_time ?? stored.timeline_min_time;
    const max = req.body.timeline_max_time ?? stored.timeline_max_time;
    const cur = req.body.timeline_current_time ?? stored.timeline_current_time ?? min;
    if (min != null && max != null) { // a never-set clock stores NULLs: nothing to hold to yet
      if (!(min < max)) return res.status(400).json({ message: 'Timeline start must be before its end' });
      if (cur != null && (cur < min || cur > max)) req.body.timeline_current_time = Math.min(Math.max(cur, min), max);
    }
  }
  const cols = {
    name: 'name', description: 'description',
    timeline_enabled: 'timeline_enabled', timeline_min_time: 'timeline_min_time',
    timeline_max_time: 'timeline_max_time', timeline_current_time: 'timeline_current_time',
    timeline_time_unit: 'timeline_time_unit',
  };
  const sets = [], vals = []; let i = 1;
  for (const k in cols) if (k in req.body) { sets.push(`${cols[k]}=$${i++}`); vals.push(req.body[k]); }
  const was = 'name' in c.vals ? (await pool.query('SELECT name, root_map_id FROM worlds WHERE id=$1', [req.params.worldId])).rows[0] : null;
  if (sets.length) { vals.push(req.params.worldId); await pool.query(`UPDATE worlds SET ${sets.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${i}`, vals); }
  // the root map made at first open is '<world> — World Map': it follows a rename while it
  // still reads that way (a root the DM renamed keeps its own name)
  if (was?.root_map_id && c.vals.name !== was.name) {
    await pool.query('UPDATE maps SET title=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND title=$3',
      [`${c.vals.name} — World Map`, was.root_map_id, `${was.name} — World Map`]);
  }
  res.json({ ok: true });
}));

// GET /templates — worlds any signed-in user may clone (the sample world).
router.get('/templates', wrap(async (req, res) => {
  const rows = await rowsOf('SELECT id, name, description FROM worlds WHERE is_template=true ORDER BY id', []);
  res.json({ templates: rows });
}));

// POST /worlds/clone — deep-copy a world (a template, or one you own) into a new world the
// caller owns. Every id is remapped and every content column travels (NODE_COLS/MAP_COLS,
// folders, the lantern, the Forge mind's style/lore/bible). The clone OWNS its art: with R2
// on, each object is copied under worlds/<newId>/ (base64 rows are lifted into R2 too), so
// deleting anything in the source can never break the clone, and vice versa.
router.post('/worlds/clone', wrap(async (req, res) => {
  const { source_id, name, description } = req.body;
  if (!isId(source_id)) return res.status(404).json({ message: 'World not found' });
  const src = (await pool.query('SELECT * FROM worlds WHERE id=$1', [source_id])).rows[0];
  if (!src || (!src.is_template && src.created_by !== req.user.id)) return res.status(404).json({ message: 'World not found' });
  const cleanName = name == null ? String(src.name).slice(0, 255) : worldName(name);
  if (cleanName === undefined) return bad(res, 'A world needs a name of 1 to 255 characters');
  if ((await pool.query('SELECT 1 FROM worlds WHERE name=$1 AND created_by=$2', [cleanName, req.user.id])).rows.length)
    return res.status(409).json({ message: 'You already have a world with this name' });
  // storage-amplification backstop: cloning duplicates base64 art rows per clone
  const owned = (await pool.query('SELECT COUNT(*) FROM worlds WHERE created_by=$1', [req.user.id])).rows[0];
  if (parseInt(owned.count) >= 50) return res.status(400).json({ message: 'That is a lot of worlds — delete some first' });

  const client = await pool.connectTx();
  try {
  await client.query('BEGIN');
  const rowsOfC = async (sql, args) => (await client.query(sql, args)).rows;
  // the caller's description wins, even an empty one — a template's blurb never lands on their world
  const desc = description === undefined ? src.description : (String(description || '').trim().slice(0, 2000) || null);
  const w = (await client.query(
    `INSERT INTO worlds (name, description, created_by, timeline_enabled, timeline_min_time, timeline_max_time, timeline_current_time, timeline_time_unit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [cleanName, desc, req.user.id, src.timeline_enabled,
     src.timeline_min_time, src.timeline_max_time, src.timeline_current_time, src.timeline_time_unit])).rows[0];

  const imgMap = new Map(); const mapMap = new Map(); const nodeMap = new Map(); const folderMap = new Map();
  const folders = await rowsOfC('SELECT * FROM image_folders WHERE world_id=$1 ORDER BY id', [src.id]);
  for (const f of folders) {
    const r = (await client.query(
      'INSERT INTO image_folders (name, world_id, created_by, color, icon) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [f.name, w.id, req.user.id, f.color, f.icon])).rows[0];
    folderMap.set(f.id, r.id);
  }
  for (const f of folders) if (f.parent_id && folderMap.has(f.parent_id)) {
    await client.query('UPDATE image_folders SET parent_id=$1 WHERE id=$2', [folderMap.get(f.parent_id), folderMap.get(f.id)]);
  }
  // every copy runs in id order: the copy's serials keep the source's relative order, so the
  // same placement stays each node's home, the same fact or backdrop wins ties, and players
  // can reach exactly what they could in the source
  for (const im of await rowsOfC('SELECT * FROM images WHERE world_id=$1 ORDER BY id', [src.id])) {
    const ext = im.filename.includes('.') ? im.filename.split('.').pop() : 'png';
    const fname = `clone-${crypto.randomBytes(9).toString('hex')}.${ext}`;
    let filePath = im.file_path, storageKey = null, base64 = im.base64_data;
    if (r2Enabled) {
      const key = `worlds/${w.id}/${fname}`;
      if (im.storage_key) { filePath = await copyObject(im.storage_key, key); storageKey = key; }
      else if (im.base64_data) {
        const m = /^data:[^;]+;base64,(.+)$/.exec(im.base64_data);
        filePath = await putObject(key, Buffer.from(m ? m[1] : im.base64_data, 'base64'), im.mime_type || 'image/png');
        storageKey = key; base64 = null;
      }
    } else if (im.base64_data) filePath = `/api/images-base64/serve/${fname}`;
    const r = (await client.query(
      `INSERT INTO images (filename, original_name, file_path, file_size, mime_type, world_id, uploaded_by, alt_text, base64_data, storage_key, folder_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12, CURRENT_TIMESTAMP)) RETURNING id`,
      [fname, im.original_name, filePath, im.file_size, im.mime_type, w.id, req.user.id, im.alt_text, base64, storageKey,
       im.folder_id ? (folderMap.get(im.folder_id) || null) : null, im.created_at || null])).rows[0];
    imgMap.set(im.id, r.id);
  }
  const maps = await rowsOfC('SELECT * FROM maps WHERE world_id=$1 ORDER BY id', [src.id]);
  for (const m of maps) {
    const r = await insertRow(client, 'maps', without(MAP_COLS, 'id', 'created_at', 'updated_at', 'owner_node_id'), m,
      { world_id: w.id, created_by: req.user.id, image_id: m.image_id ? (imgMap.get(m.image_id) || null) : null });
    mapMap.set(m.id, r.id);
  }
  const nodes = await rowsOfC('SELECT * FROM nodes WHERE world_id=$1 ORDER BY id', [src.id]);
  for (const n of nodes) {
    const r = await insertRow(client, 'nodes', without(NODE_COLS, 'id', 'created_at', 'updated_at'), n,
      { world_id: w.id, created_by: req.user.id, interior_map_id: null, image_id: n.image_id ? (imgMap.get(n.image_id) || null) : null,
        pin: n.pin || 'chip', pin_size: n.pin_size || 64 });
    nodeMap.set(n.id, r.id);
  }
  for (const m of maps) if (m.owner_node_id && nodeMap.has(m.owner_node_id)) {
    await client.query('UPDATE maps SET owner_node_id=$1 WHERE id=$2', [nodeMap.get(m.owner_node_id), mapMap.get(m.id)]);
  }
  for (const n of nodes) if (n.interior_map_id && mapMap.has(n.interior_map_id)) {
    await client.query('UPDATE nodes SET interior_map_id=$1 WHERE id=$2', [mapMap.get(n.interior_map_id), nodeMap.get(n.id)]);
  }
  for (const pl of await rowsOfC('SELECT p.* FROM placements p JOIN maps m ON m.id=p.map_id WHERE m.world_id=$1 ORDER BY p.id', [src.id])) {
    if (!nodeMap.has(pl.node_id) || !mapMap.has(pl.map_id)) continue;
    await client.query('INSERT INTO placements (node_id, map_id, x, y, start_time, end_time, visibility, shape, shape_kind, shape_style) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [nodeMap.get(pl.node_id), mapMap.get(pl.map_id), pl.x, pl.y, pl.start_time, pl.end_time, pl.visibility, shapeParam(pl.shape), pl.shape_kind || 'area', styleParam(pl.shape_style)]);
  }
  for (const l of await rowsOfC('SELECT * FROM links WHERE world_id=$1 ORDER BY id', [src.id])) {
    if (!nodeMap.has(l.from_node_id) || !nodeMap.has(l.to_node_id)) continue;
    await client.query('INSERT INTO links (world_id, from_node_id, to_node_id, label) VALUES ($1,$2,$3,$4)',
      [w.id, nodeMap.get(l.from_node_id), nodeMap.get(l.to_node_id), l.label]);
  }
  for (const e of await rowsOfC('SELECT * FROM eras WHERE world_id=$1 ORDER BY id', [src.id])) {
    await client.query('INSERT INTO eras (world_id, name, start_time, end_time, player_visible) VALUES ($1,$2,$3,$4,$5)',
      [w.id, e.name, e.start_time, e.end_time, e.player_visible]);
  }
  for (const b of await rowsOfC('SELECT b.* FROM map_backdrops b JOIN maps m ON m.id=b.map_id WHERE m.world_id=$1 ORDER BY b.id', [src.id])) {
    if (!mapMap.has(b.map_id) || !imgMap.has(b.image_id)) continue;
    await client.query('INSERT INTO map_backdrops (map_id, image_id, start_time, end_time) VALUES ($1,$2,$3,$4)',
      [mapMap.get(b.map_id), imgMap.get(b.image_id), b.start_time, b.end_time]);
  }
  for (const f of await rowsOfC('SELECT f.* FROM node_facts f JOIN nodes n ON n.id=f.node_id WHERE n.world_id=$1 ORDER BY f.id', [src.id])) {
    if (!nodeMap.has(f.node_id)) continue;
    await client.query('INSERT INTO node_facts (node_id, body, start_time, end_time) VALUES ($1,$2,$3,$4)',
      [nodeMap.get(f.node_id), f.body, f.start_time, f.end_time]);
  }
  if (src.root_map_id && mapMap.has(src.root_map_id)) {
    await client.query('UPDATE worlds SET root_map_id=$1 WHERE id=$2', [mapMap.get(src.root_map_id), w.id]);
  }
  if (src.spotlight_node_id && nodeMap.has(src.spotlight_node_id)) {
    await client.query('UPDATE worlds SET spotlight_node_id=$1 WHERE id=$2', [nodeMap.get(src.spotlight_node_id), w.id]);
  }
  // the Forge mind travels too (art style, lore, bible, size, anchor): a clone is a deep copy,
  // and a newcomer's sample world should think like the original
  const mind = (await client.query('SELECT * FROM world_minds WHERE world_id=$1', [src.id])).rows[0];
  if (mind) {
    await insertRow(client, 'world_minds', MIND_COLS, mind,
      { world_id: w.id, style_image_id: mind.style_image_id ? (imgMap.get(mind.style_image_id) || null) : null });
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
      (SELECT p.map_id FROM placements p WHERE p.node_id=m.owner_node_id AND p.map_id <> m.id ORDER BY p.id LIMIT 1) AS owner_map_id
    FROM maps m LEFT JOIN images i ON m.image_id=i.id
    WHERE m.world_id=$1 ORDER BY m.id`, [req.params.worldId])).rows;
  res.json({ maps: rows.map((m) => ({ id: m.id, title: m.title, ownerNodeId: m.owner_node_id, parentMapId: m.owner_map_id, thumbUrl: resolveImageUrl(req, m.backdrop_path) })) });
}));

// GET /worlds/:worldId/trail — every footstep of party-category nodes across the world:
// the placements, with the map each sits on, ordered by when they happened.
router.get('/worlds/:worldId/trail', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const rows = (await pool.query(`
    SELECT p.id, p.node_id, p.map_id, m.title AS map_title, m.owner_node_id, p.start_time, p.end_time
    FROM placements p JOIN nodes n ON n.id = p.node_id JOIN maps m ON m.id = p.map_id
    WHERE n.world_id = $1 AND n.category = 'party'
    ORDER BY p.start_time NULLS FIRST, (m.owner_node_id IS NULL) DESC, p.id`, [req.params.worldId])).rows;
  res.json({ steps: rows.map((r) => ({
    id: r.id, nodeId: r.node_id, mapId: r.map_id, mapTitle: r.map_title, interior: !!r.owner_node_id,
    start: r.start_time, end: r.end_time })) });
}));

// GET /worlds/:worldId/nodes — the world's node index (search, the Place existing and Thread pickers).
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
    SELECT p.id AS placement_id, p.x, p.y, p.start_time, p.end_time, p.visibility AS placement_vis, p.shape, p.shape_kind, p.shape_style,
           n.id AS node_id, n.title, n.category, n.visibility AS node_vis, n.body, n.dm_note, n.stance, n.interior_map_id, n.pin, n.author, n.pin_size, n.image_id,
           n.voice_id, n.voice_name, n.voice_line, n.voice_url, n.voice_style,
           ni.file_path AS node_image_path
    FROM placements p
    JOIN nodes n ON p.node_id = n.id
    LEFT JOIN images ni ON n.image_id = ni.id
    WHERE p.map_id=$1 ORDER BY p.id`, [req.params.mapId])).rows;
  const placements = pl.map((r) => ({
    id: r.placement_id, x: Number(r.x), y: Number(r.y), start: r.start_time, end: r.end_time, visibility: r.placement_vis, shape: r.shape || null, shapeKind: r.shape_kind || 'area', shapeStyle: r.shape_style || null,
    node: { id: r.node_id, title: r.title, category: r.category, visibility: r.node_vis, body: r.body, dmNote: r.dm_note, stance: r.stance,
            voiceId: r.voice_id, voiceName: r.voice_name, voiceLine: r.voice_line, voiceUrl: r.voice_url, voiceStyle: r.voice_style,
            pin: r.pin, pinSize: r.pin_size, author: r.author, hasInterior: !!r.interior_map_id, interiorMapId: r.interior_map_id,
            imageId: r.image_id, imageUrl: resolveImageUrl(req, r.node_image_path) },
  }));
  const bds = (await pool.query(
    `SELECT b.id, b.image_id, b.start_time, b.end_time, i.file_path
     FROM map_backdrops b JOIN images i ON i.id = b.image_id
     WHERE b.map_id = $1 ORDER BY b.start_time NULLS FIRST, b.id`, [req.params.mapId])).rows;
  res.json({
    map: { id: map.id, worldId: map.world_id, title: map.title, view: map.view, ownerNodeId: map.owner_node_id, imageId: map.image_id,
           focusStart: map.focus_start, focusEnd: map.focus_end, dmNote: map.dm_note,
           ambienceUrl: map.ambience_url, ambiencePrompt: map.ambience_prompt,
           backdropUrl: resolveImageUrl(req, map.backdrop_path) },
    backdrops: bds.map((b) => ({ id: b.id, imageId: b.image_id, start: b.start_time, end: b.end_time, url: resolveImageUrl(req, b.file_path) })),
    placements, breadcrumb: await breadcrumb(req.params.mapId),
  });
}));

// PATCH /maps/:mapId — title / view / base art / focus period / DM notes.
router.patch('/maps/:mapId', wrap(async (req, res) => {
  const wid = await worldIdOfMap(req.params.mapId);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  const c = cleanBody(req.body, {
    title: [(v) => text(v, 255, { required: true }), 'A space needs a name of 1 to 255 characters'],
    view: [(v) => oneOf(v, ['map', 'list']), 'A space is a map or a list'],
    image_id: [idOrNull, 'Image is not in this world'],
    focus_start: [whole, 'A focus period is whole numbers on the clock'],
    focus_end: [whole, 'A focus period is whole numbers on the clock'],
    dm_note: [long, 'Map notes are text'],
  });
  if (c.bad) return bad(res, c.bad);
  if (c.vals.image_id != null && !(await imageInWorld(c.vals.image_id, wid))) return badImage(res);
  if ('focus_start' in c.vals || 'focus_end' in c.vals) {
    const row = (await pool.query('SELECT focus_start, focus_end FROM maps WHERE id=$1', [req.params.mapId])).rows[0];
    if (!ordered('focus_start' in c.vals ? c.vals.focus_start : row.focus_start, 'focus_end' in c.vals ? c.vals.focus_end : row.focus_end))
      return bad(res, 'A focus period ends after it starts');
  }
  await updateCols('maps', req.params.mapId, c.vals, true);
  res.json({ ok: true });
}));

// Timed backdrops: the map's art for a period of history.
router.post('/maps/:mapId/backdrops', wrap(async (req, res) => {
  const wid = await worldIdOfMap(req.params.mapId);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  const { image_id } = req.body;
  const st = whole(req.body.start_time), en = whole(req.body.end_time);
  if (st === undefined || en === undefined) return bad(res, 'A period is whole numbers on the clock');
  if (!ordered(st, en)) return bad(res, 'A period ends after it starts');
  if (!(await imageInWorld(image_id, wid))) return badImage(res);
  const r = (await pool.query(
    'INSERT INTO map_backdrops (map_id, image_id, start_time, end_time) VALUES ($1,$2,$3,$4) RETURNING id',
    [req.params.mapId, Number(image_id), st, en])).rows[0];
  res.status(201).json({ id: r.id });
}));
const worldIdOfBackdrop = async (id) =>
  (await pool.query('SELECT m.world_id FROM map_backdrops b JOIN maps m ON b.map_id=m.id WHERE b.id=$1', [id])).rows[0]?.world_id;
router.patch('/backdrops/:id', wrap(async (req, res) => {
  const wid = await worldIdOfBackdrop(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: "That period's art no longer exists" });
  const c = cleanBody(req.body, {
    start_time: [whole, 'A period is whole numbers on the clock'],
    end_time: [whole, 'A period is whole numbers on the clock'],
    image_id: [(v) => (isId(v) ? Number(v) : undefined), 'Image is not in this world'], // a backdrop always has art
  });
  if (c.bad) return bad(res, c.bad);
  if ('image_id' in c.vals && !(await imageInWorld(c.vals.image_id, wid))) return badImage(res);
  if (!(await pairOk('map_backdrops', req.params.id, c.vals))) return bad(res, 'A period ends after it starts');
  await updateCols('map_backdrops', req.params.id, c.vals);
  res.json({ ok: true });
}));
router.delete('/backdrops/:id', wrap(async (req, res) => {
  const wid = await worldIdOfBackdrop(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: "That period's art no longer exists" });
  const row = (await pool.query('SELECT * FROM map_backdrops WHERE id=$1', [req.params.id])).rows[0];
  await pool.query('DELETE FROM map_backdrops WHERE id=$1', [req.params.id]);
  const undoId = await tombstone(wid, req.user.id, 'backdrop', { backdrop: row });
  res.json({ ok: true, undoId });
}));

// POST /maps/:mapId/nodes — drop a NEW node on this map (create node + placement).
router.post('/maps/:mapId/nodes', wrap(async (req, res) => {
  const wid = await worldIdOfMap(req.params.mapId);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  if (req.body?.category === 'party' && (await pool.query(`SELECT 1 FROM nodes WHERE world_id=$1 AND category='party'`, [wid])).rows.length)
    return res.status(409).json({ message: 'This world already has a Party — there is one per world' });
  const c = cleanBody(req.body, {
    title: [(v) => text(v, 255), 'A title is text of up to 255 characters'],
    category: [(v) => oneOf(v, NODE_CATS), 'That is not a kind of node'],
    body: [long, 'A description is text'],
    x: [(v) => pct(v), 'A position is a % of the map'],
    y: [(v) => pct(v), 'A position is a % of the map'],
  });
  if (c.bad) return bad(res, c.bad);
  const { shape = null, shape_kind = null } = req.body;
  const title = c.vals.title || 'New entry', category = c.vals.category || 'note', body = c.vals.body ?? null, x = c.vals.x ?? 50, y = c.vals.y ?? 50;
  const sh = cleanShape(shape), kind = shapeKind(shape_kind);
  if (sh === undefined) return res.status(400).json({ message: 'An outline needs 3 to 200 corners' });
  if (kind === undefined) return res.status(400).json({ message: 'An outline is an area or a button' });
  // born DM-only, like Forge-born nodes: session prep never reaches players until the DM
  // reveals it on purpose (the one exception is a player's own marker, in share.js)
  const n = (await pool.query(
    'INSERT INTO nodes (world_id, title, category, body, created_by, visibility) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [wid, title, category, body, req.user.id, 'dm'])).rows[0];
  const p = (await pool.query('INSERT INTO placements (node_id, map_id, x, y, shape, shape_kind) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [n.id, req.params.mapId, x, y, shapeParam(sh), kind])).rows[0];
  res.status(201).json({ nodeId: n.id, placementId: p.id });
}));

// POST /maps/:mapId/placements — place an EXISTING node on this map (the Place existing picker).
router.post('/maps/:mapId/placements', wrap(async (req, res) => {
  const wid = await worldIdOfMap(req.params.mapId);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  const { node_id, shape = null, shape_kind = null } = req.body;
  if (!isId(node_id) || (await worldIdOfNode(node_id)) !== wid) return bad(res, 'Node is not in this world');
  // a place never stands inside itself: the tree and the crumb would loop
  const own = (await pool.query('SELECT interior_map_id FROM nodes WHERE id=$1', [node_id])).rows[0];
  if (own?.interior_map_id === Number(req.params.mapId)) return bad(res, "A place can't stand inside its own interior");
  const sh = cleanShape(shape), kind = shapeKind(shape_kind);
  if (sh === undefined) return bad(res, 'An outline needs 3 to 200 corners');
  if (kind === undefined) return bad(res, 'An outline is an area or a button');
  const x = pct(req.body.x), y = pct(req.body.y);
  if (x === undefined || y === undefined) return bad(res, 'A position is a % of the map');
  // a footstep is born with its moment: start/end are whole numbers on the world clock or null
  const st = whole(req.body.start_time), en = whole(req.body.end_time);
  if (st === undefined || en === undefined) return bad(res, 'A lifespan is whole numbers on the clock');
  if (!ordered(st, en)) return bad(res, 'A lifespan ends after it starts');
  const p = (await pool.query('INSERT INTO placements (node_id, map_id, x, y, shape, shape_kind, start_time, end_time) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [Number(node_id), req.params.mapId, x, y, shapeParam(sh), kind, st, en])).rows[0];
  res.status(201).json({ placementId: p.id });
}));

// GET /nodes/:id — full node detail incl. links + backlinks (for the inspector).
router.get('/nodes/:id', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const n = (await pool.query('SELECT n.*, i.file_path AS img FROM nodes n LEFT JOIN images i ON n.image_id=i.id WHERE n.id=$1', [req.params.id])).rows[0];
  const out = (await pool.query('SELECT l.id, l.label, l.to_node_id AS other, n2.title, n2.category AS other_cat FROM links l JOIN nodes n2 ON l.to_node_id=n2.id WHERE l.from_node_id=$1 ORDER BY l.id', [req.params.id])).rows;
  const back = (await pool.query('SELECT l.id, l.label, l.from_node_id AS other, n2.title, n2.category AS other_cat FROM links l JOIN nodes n2 ON l.from_node_id=n2.id WHERE l.to_node_id=$1 ORDER BY l.id', [req.params.id])).rows;
  const shape = (l, dir) => ({ id: l.id, dir, label: l.label, otherId: l.other, otherTitle: l.title, otherCategory: l.other_cat });
  const facts = (await pool.query(
    'SELECT id, body, start_time, end_time FROM node_facts WHERE node_id=$1 ORDER BY start_time NULLS FIRST, id',
    [req.params.id])).rows.map((f) => ({ id: f.id, body: f.body, start: f.start_time, end: f.end_time }));
  res.json({
    node: { id: n.id, title: n.title, body: n.body, category: n.category, visibility: n.visibility,
            dmNote: n.dm_note, stance: n.stance, author: n.author, pin: n.pin || 'chip', pinSize: n.pin_size || 64, imageId: n.image_id,
            voiceId: n.voice_id, voiceName: n.voice_name, voiceStyle: n.voice_style, voiceLine: n.voice_line, voiceUrl: n.voice_url,
            hasInterior: !!n.interior_map_id, interiorMapId: n.interior_map_id, imageUrl: resolveImageUrl(req, n.img) },
    links: out.map((l) => shape(l, 'out')), backlinks: back.map((l) => shape(l, 'in')),
    facts,
  });
}));

// Timed facts: a node's description for a period of history.
router.post('/nodes/:id/facts', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const body = req.body.body == null ? '' : long(req.body.body);
  const st = whole(req.body.start_time), en = whole(req.body.end_time);
  if (body === undefined) return bad(res, 'A period text is text');
  if (st === undefined || en === undefined) return bad(res, 'A period is whole numbers on the clock');
  if (!ordered(st, en)) return bad(res, 'A period ends after it starts');
  const r = (await pool.query(
    'INSERT INTO node_facts (node_id, body, start_time, end_time) VALUES ($1,$2,$3,$4) RETURNING id',
    [req.params.id, body, st, en])).rows[0];
  res.status(201).json({ id: r.id });
}));
const worldIdOfFact = async (id) =>
  (await pool.query('SELECT n.world_id FROM node_facts f JOIN nodes n ON f.node_id=n.id WHERE f.id=$1', [id])).rows[0]?.world_id;
router.patch('/facts/:id', wrap(async (req, res) => {
  const wid = await worldIdOfFact(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'That period text no longer exists' });
  const c = cleanBody(req.body, {
    body: [(v) => (v == null ? '' : long(v)), 'A period text is text'],
    start_time: [whole, 'A period is whole numbers on the clock'],
    end_time: [whole, 'A period is whole numbers on the clock'],
  });
  if (c.bad) return bad(res, c.bad);
  if (!(await pairOk('node_facts', req.params.id, c.vals))) return bad(res, 'A period ends after it starts');
  await updateCols('node_facts', req.params.id, c.vals);
  res.json({ ok: true });
}));
router.delete('/facts/:id', wrap(async (req, res) => {
  const wid = await worldIdOfFact(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'That period text no longer exists' });
  const row = (await pool.query('SELECT * FROM node_facts WHERE id=$1', [req.params.id])).rows[0];
  await pool.query('DELETE FROM node_facts WHERE id=$1', [req.params.id]);
  const undoId = await tombstone(wid, req.user.id, 'fact', { fact: row });
  res.json({ ok: true, undoId });
}));

// GET /nodes/:id/locate — where to jump to this node: its interior, else a map it's placed on.
router.get('/nodes/:id/locate', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  // a thread or a search result SHOWS the thing: its pin on a map (the one the DM is on,
  // when it stands there), story open. Its interior is the explicit way in (◎), named
  // alongside; only an unplaced owner lands inside.
  const here = isId(req.query.map) ? Number(req.query.map) : null;
  const n = (await pool.query('SELECT interior_map_id FROM nodes WHERE id=$1', [req.params.id])).rows[0];
  const p = (await pool.query('SELECT id, map_id FROM placements WHERE node_id=$1 ORDER BY (map_id = $2) DESC NULLS LAST, id LIMIT 1', [req.params.id, here])).rows[0];
  if (p) return res.json({ mapId: p.map_id, placementId: p.id, interiorMapId: n?.interior_map_id ?? null });
  if (n?.interior_map_id) return res.json({ mapId: n.interior_map_id, interiorMapId: n.interior_map_id });
  res.json({});
}));

// GET /nodes/:id/impact — what deleting this node takes with it: how many maps it sits on,
// and (walking its interior tree, cycles-safe via UNION) how many maps and nodes live inside.
// The client shows this before the delete so "honest delete" isn't a guess.
router.get('/nodes/:id/impact', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  // Only the DIRECT interior is deleted (maps.owner_node_id cascades one level). Spaces
  // nested deeper keep their owner nodes and survive under "Unplaced"; a node counts as
  // stranded only when every placement it has sits on the deleted map.
  const r = (await pool.query(`
    WITH RECURSIVE tree(map_id) AS (
      SELECT interior_map_id FROM nodes WHERE id = $1 AND interior_map_id IS NOT NULL
      UNION
      SELECT n.interior_map_id
      FROM tree t
      JOIN placements p ON p.map_id = t.map_id
      JOIN nodes n ON n.id = p.node_id
      WHERE n.interior_map_id IS NOT NULL
    ), direct AS (SELECT interior_map_id AS map_id FROM nodes WHERE id = $1 AND interior_map_id IS NOT NULL)
    SELECT
      (SELECT COUNT(*) FROM placements WHERE node_id = $1) AS placements,
      (SELECT COUNT(DISTINCT map_id) FROM placements WHERE node_id = $1) AS maps,
      (SELECT COUNT(*) FROM direct) AS interior_maps,
      GREATEST((SELECT COUNT(*) FROM tree) - (SELECT COUNT(*) FROM direct), 0) AS nested_maps,
      (SELECT COUNT(*) FROM nodes n WHERE n.id != $1
         AND EXISTS (SELECT 1 FROM placements p JOIN direct d ON d.map_id = p.map_id WHERE p.node_id = n.id)
         AND NOT EXISTS (SELECT 1 FROM placements p2 WHERE p2.node_id = n.id AND p2.map_id NOT IN (SELECT map_id FROM direct))) AS nodes_inside`,
    [req.params.id])).rows[0];
  res.json({
    placements: parseInt(r.placements),
    maps: parseInt(r.maps),
    interiorMaps: parseInt(r.interior_maps),
    nestedMaps: parseInt(r.nested_maps),
    nodesInside: parseInt(r.nodes_inside),
  });
}));

// PATCH /nodes/:id — title / body / DM note / stance / category / visibility / image / pin.
// Revealing (visibility ≠ dm) also lifts the node's DM-only placements to shared; `reveal: true`
// merges the DM note into the text players read.
router.patch('/nodes/:id', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  // one Party per world: a second 'party' node would merge its footsteps into the one trail
  if (req.body?.category === 'party' && (await pool.query(`SELECT 1 FROM nodes WHERE world_id=$1 AND category='party' AND id<>$2`, [wid, req.params.id])).rows.length)
    return res.status(409).json({ message: 'This world already has a Party — there is one per world' });
  const c = cleanBody(req.body, {
    title: [(v) => (v == null ? '' : text(v, 255)), 'A title is text of up to 255 characters'], // a number or an object is unusable, not blank
    body: [long, 'A description is text'],
    dm_note: [long, 'A DM note is text'],
    stance: [(v) => (v == null ? null : oneOf(v, STANCES)), 'A stance is friend, neutral or foe'],
    category: [(v) => oneOf(v, NODE_CATS), 'That is not a kind of node'],
    visibility: [(v) => oneOf(v, VIS), 'Visibility is dm, shared or player'],
    image_id: [idOrNull, 'Image is not in this world'],
    pin: [(v) => oneOf(v, ['chip', 'image']), 'A pin is a chip or an image'],
    pin_size: [(v) => { const n = whole(v); return n == null || n < 16 || n > 256 ? undefined : n; }, 'A pin size is 16 to 256 pixels'],
  });
  if (c.bad) return bad(res, c.bad);
  if ('title' in c.vals && !c.vals.title) c.vals.title = 'Untitled'; // a pin always has a visible name
  if (c.vals.image_id != null && !(await imageInWorld(c.vals.image_id, wid))) return badImage(res);
  if (req.body.reveal) {
    // Reveal merges the secret into the CURRENT text here, so a stale tab can never paste an
    // old body over a newer one; the note is emptied in the same statement. Players read the
    // period text covering CANON when one exists (share.js's rule: latest start wins), so
    // that is where the secret goes — a note appended to the description alone would stay
    // unseen behind it.
    const w = (await pool.query('SELECT timeline_enabled, timeline_current_time FROM worlds WHERE id=$1', [wid])).rows[0];
    const canon = w?.timeline_enabled ? w.timeline_current_time : null;
    const fact = canon == null ? null : (await pool.query(
      `SELECT id FROM node_facts WHERE node_id = $1 AND body <> '' AND (start_time IS NULL OR start_time <= $2)
         AND (end_time IS NULL OR end_time >= $2) ORDER BY start_time DESC NULLS LAST, id DESC LIMIT 1`, [req.params.id, canon])).rows[0];
    if (fact) {
      // the note is read BEFORE it is emptied (an UPDATE's RETURNING would hand back the new,
      // blank value); every part of the statement sees the same snapshot
      const r = await pool.query(
        `WITH cur AS (SELECT btrim(COALESCE(dm_note, '')) AS note FROM nodes WHERE id = $2),
              n AS (UPDATE nodes SET dm_note = '', updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2 AND (SELECT note FROM cur) <> '' RETURNING 1)
         UPDATE node_facts f SET body = CASE WHEN btrim(COALESCE(f.body, '')) = '' THEN cur.note ELSE btrim(f.body) || E'\n\n' || cur.note END
         FROM cur WHERE f.id = $1 AND cur.note <> '' RETURNING f.body`, [fact.id, req.params.id]);
      const body = (await pool.query('SELECT body FROM nodes WHERE id=$1', [req.params.id])).rows[0]?.body ?? null;
      const factBody = r.rows[0]?.body ?? (await pool.query('SELECT body FROM node_facts WHERE id=$1', [fact.id])).rows[0]?.body ?? null;
      return res.json({ ok: true, body, factId: fact.id, factBody });
    }
    const r = await pool.query(
      `UPDATE nodes SET body = CASE WHEN btrim(COALESCE(dm_note, '')) = '' THEN body
                                    WHEN btrim(COALESCE(body, '')) = '' THEN btrim(dm_note)
                                    ELSE btrim(body) || E'\n\n' || btrim(dm_note) END,
                        dm_note = '', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING body`, [req.params.id]);
    return res.json({ ok: true, body: r.rows[0]?.body ?? null, factId: null });
  }
  const before = 'title' in c.vals ? (await pool.query('SELECT title, interior_map_id FROM nodes WHERE id=$1', [req.params.id])).rows[0] : null;
  await updateCols('nodes', req.params.id, c.vals, true);
  // an interior still carrying its node's old name follows the rename; a space the DM named
  // on purpose keeps its own name
  if (before?.interior_map_id && c.vals.title !== before.title) {
    await pool.query('UPDATE maps SET title=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND title=$3', [c.vals.title, before.interior_map_id, before.title]);
  }
  // Revealing a node reveals where it stands: the Forge births placements DM-only, so a
  // "revealed" node would otherwise stay invisible to players behind its hidden placement.
  if ('visibility' in c.vals && c.vals.visibility !== 'dm') {
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
  // exactly one interior per node, even under a double click: the claim is atomic
  const claimed = await pool.query('UPDATE nodes SET interior_map_id=$1 WHERE id=$2 AND interior_map_id IS NULL RETURNING id', [m.id, req.params.id]);
  if (!claimed.rows.length) {
    await pool.query('DELETE FROM maps WHERE id=$1', [m.id]);
    const cur = (await pool.query('SELECT interior_map_id FROM nodes WHERE id=$1', [req.params.id])).rows[0];
    return res.json({ mapId: cur.interior_map_id });
  }
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
    // the lantern goes out with its node (ON DELETE SET NULL) — undo relights it
    spotlit: (await pool.query('SELECT 1 FROM worlds WHERE id=$1 AND spotlight_node_id=$2', [wid, node.id])).rows.length > 0,
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
  const t = (await pool.query(`SELECT * FROM tombstones WHERE id=$1 AND created_at > NOW() - INTERVAL '24 hours'`, [req.params.id])).rows[0];
  if (!t || !(await ownsWorld(t.world_id, req.user.id))) return res.status(404).json({ message: 'Nothing to undo' });
  const p = t.payload;

  const client = await pool.connectTx();
  try {
    await client.query('BEGIN');
    const exists = async (table, id) =>
      id != null && (await client.query(`SELECT 1 FROM ${table} WHERE id=$1`, [id])).rows.length > 0;

    const insertMap = async (m, ownerNodeId) => {
      const imageId = (await exists('images', m.image_id)) ? m.image_id : null;
      await insertRow(client, 'maps', MAP_COLS, m, { image_id: imageId, owner_node_id: ownerNodeId });
    };
    const insertPlacement = async (pl) => {
      if (!(await exists('nodes', pl.node_id)) || !(await exists('maps', pl.map_id))) return;
      await client.query(
        `INSERT INTO placements (id, node_id, map_id, x, y, start_time, end_time, visibility, created_at, shape, shape_kind, shape_style)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
        [pl.id, pl.node_id, pl.map_id, pl.x, pl.y, pl.start_time, pl.end_time, pl.visibility, pl.created_at, shapeParam(pl.shape), pl.shape_kind || 'area', styleParam(pl.shape_style)]);
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
      await insertRow(client, 'nodes', NODE_COLS, n, { interior_map_id: null, image_id: imageId, pin: n.pin || 'chip', pin_size: n.pin_size || 64 });
      if (p.spotlit) await client.query('UPDATE worlds SET spotlight_node_id=$1 WHERE id=$2 AND spotlight_node_id IS NULL', [n.id, t.world_id]);
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
          'INSERT INTO links (id, world_id, from_node_id, to_node_id, label, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
          [l.id, l.world_id, l.from_node_id, l.to_node_id, l.label, l.created_at]);
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
    } else if (t.kind === 'fact') {
      const f = p.fact;
      if (!(await exists('nodes', f.node_id))) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'The node is gone' }); }
      await client.query(
        'INSERT INTO node_facts (id, node_id, body, start_time, end_time, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
        [f.id, f.node_id, f.body, f.start_time, f.end_time, f.created_at]);
    } else if (t.kind === 'link') {
      const l = p.link;
      if (!(await exists('nodes', l.from_node_id)) || !(await exists('nodes', l.to_node_id))) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'One end of the link is gone' }); }
      await client.query(
        'INSERT INTO links (id, world_id, from_node_id, to_node_id, label, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
        [l.id, l.world_id, l.from_node_id, l.to_node_id, l.label, l.created_at]);
    } else if (t.kind === 'era') {
      const e = p.era;
      await client.query(
        'INSERT INTO eras (id, world_id, name, start_time, end_time, player_visible) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
        [e.id, e.world_id, e.name, e.start_time, e.end_time, e.player_visible]);
    } else if (t.kind === 'backdrop') {
      const b = p.backdrop;
      if (!(await exists('maps', b.map_id))) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'The map is gone' }); }
      if (!(await exists('images', b.image_id))) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'That image has been deleted since' }); }
      await insertBackdrop(b);
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "That can't be undone any more" });
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

// PATCH /placements/:id — move / lifespan / visibility / outline.
router.patch('/placements/:id', wrap(async (req, res) => {
  const wid = await worldIdOfPlacement(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'That pin is no longer on the map' });
  const c = cleanBody(req.body, {
    x: [(v) => pct(v, undefined), 'A position is a % of the map'],
    y: [(v) => pct(v, undefined), 'A position is a % of the map'],
    start_time: [whole, 'A lifespan is whole numbers on the clock'],
    end_time: [whole, 'A lifespan is whole numbers on the clock'],
    visibility: [(v) => oneOf(v, VIS), 'Visibility is dm, shared or player'],
  });
  if (c.bad) return bad(res, c.bad);
  if (!(await pairOk('placements', req.params.id, c.vals))) return bad(res, 'A lifespan ends after it starts');
  const sets = [], vals = []; let i = 1;
  for (const k of Object.keys(c.vals)) { sets.push(`${k}=$${i++}`); vals.push(c.vals[k]); }
  if ('shape' in req.body) {
    const sh = cleanShape(req.body.shape);
    if (sh === undefined) return res.status(400).json({ message: 'An outline needs 3 to 200 corners' });
    sets.push(`shape=$${i++}`); vals.push(shapeParam(sh));
  }
  if ('shape_kind' in req.body) {
    const kind = shapeKind(req.body.shape_kind);
    if (kind === undefined) return res.status(400).json({ message: 'An outline is an area or a button' });
    sets.push(`shape_kind=$${i++}`); vals.push(kind);
  }
  if ('shape_style' in req.body) {
    const st = cleanStyle(req.body.shape_style);
    if (st === undefined) return res.status(400).json({ message: 'Outline style is a set of on/off toggles' });
    sets.push(`shape_style=$${i++}`); vals.push(styleParam(st));
  }
  if (sets.length) { vals.push(req.params.id); await pool.query(`UPDATE placements SET ${sets.join(', ')} WHERE id=$${i}`, vals); }
  res.json({ ok: true });
}));

// DELETE /placements/:id — remove the node from THIS map (the node itself survives).
router.delete('/placements/:id', wrap(async (req, res) => {
  const wid = await worldIdOfPlacement(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'That pin is no longer on the map' });
  const row = (await pool.query('SELECT * FROM placements WHERE id=$1', [req.params.id])).rows[0];
  await pool.query('DELETE FROM placements WHERE id=$1', [req.params.id]);
  const undoId = await tombstone(wid, req.user.id, 'placement', { placement: row });
  res.json({ ok: true, undoId });
}));

// Eras: named periods of history. player_visible ones are scrubbable in the Player View.
router.post('/worlds/:worldId/eras', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const name = req.body.name == null ? 'An age' : text(req.body.name, 120);
  const st = req.body.start_time == null ? 0 : whole(req.body.start_time), en = req.body.end_time == null ? 0 : whole(req.body.end_time);
  if (name === undefined) return bad(res, 'An era name is text of up to 120 characters');
  if (st === undefined || en === undefined) return bad(res, 'An era is whole numbers on the clock');
  if (!ordered(st, en)) return bad(res, 'An era ends after it starts');
  const r = (await pool.query(
    'INSERT INTO eras (world_id, name, start_time, end_time, player_visible) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [req.params.worldId, name || 'An age', st, en, !!req.body.player_visible])).rows[0];
  res.status(201).json({ id: r.id });
}));
router.patch('/eras/:id', wrap(async (req, res) => {
  const wid = await worldIdOfEra(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'That era no longer exists' });
  const c = cleanBody(req.body, {
    name: [(v) => text(v, 120, { required: true }), 'An era needs a name of 1 to 120 characters'],
    start_time: [(v) => (v == null ? undefined : whole(v)), 'An era is whole numbers on the clock'],
    end_time: [(v) => (v == null ? undefined : whole(v)), 'An era is whole numbers on the clock'],
    player_visible: [bool, 'An era is open to players or not'],
  });
  if (c.bad) return bad(res, c.bad);
  if (!(await pairOk('eras', req.params.id, c.vals))) return bad(res, 'An era ends after it starts');
  await updateCols('eras', req.params.id, c.vals);
  res.json({ ok: true });
}));
router.delete('/eras/:id', wrap(async (req, res) => {
  const wid = await worldIdOfEra(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'That era no longer exists' });
  const row = (await pool.query('SELECT * FROM eras WHERE id=$1', [req.params.id])).rows[0];
  await pool.query('DELETE FROM eras WHERE id=$1', [req.params.id]);
  const undoId = await tombstone(wid, req.user.id, 'era', { era: row });
  res.json({ ok: true, undoId });
}));

// POST /links — connect two nodes in the same world; DELETE /links/:id.
router.post('/links', wrap(async (req, res) => {
  const { from_node_id, to_node_id } = req.body;
  if (!isId(from_node_id) || !isId(to_node_id)) return bad(res, 'A link joins two nodes of the same world');
  if (String(from_node_id) === String(to_node_id)) return bad(res, 'A link joins two different nodes');
  const label = text(req.body.label, 255);
  if (label === undefined) return bad(res, 'A link label is text of up to 255 characters');
  const wid = await worldIdOfNode(from_node_id);
  if (!wid || wid !== (await worldIdOfNode(to_node_id)) || !(await ownsWorld(wid, req.user.id)))
    return bad(res, 'A link joins two nodes of the same world');
  // one thread between two things, whichever end it was made from
  if ((await pool.query('SELECT 1 FROM links WHERE (from_node_id=$1 AND to_node_id=$2) OR (from_node_id=$2 AND to_node_id=$1)', [from_node_id, to_node_id])).rows.length)
    return res.status(409).json({ message: 'Those two are already threaded' });
  const l = (await pool.query(
    'INSERT INTO links (world_id, from_node_id, to_node_id, label) VALUES ($1,$2,$3,$4) RETURNING id',
    [wid, Number(from_node_id), Number(to_node_id), label || null])).rows[0];
  res.status(201).json({ id: l.id });
}));
router.patch('/links/:id', wrap(async (req, res) => {
  const r = (await pool.query('SELECT world_id FROM links WHERE id=$1', [req.params.id])).rows[0];
  if (!r || !(await ownsWorld(r.world_id, req.user.id))) return res.status(404).json({ message: 'That link no longer exists' });
  const c = cleanBody(req.body, {
    label: [(v) => { const t = text(v, 255); return t === undefined ? undefined : (t || null); }, 'A link label is text of up to 255 characters'],
  });
  if (c.bad) return bad(res, c.bad);
  await updateCols('links', req.params.id, c.vals);
  res.json({ ok: true });
}));
router.delete('/links/:id', wrap(async (req, res) => {
  const r = (await pool.query('SELECT world_id FROM links WHERE id=$1', [req.params.id])).rows[0];
  if (!r || !(await ownsWorld(r.world_id, req.user.id))) return res.status(404).json({ message: 'That link no longer exists' });
  const row = (await pool.query('SELECT * FROM links WHERE id=$1', [req.params.id])).rows[0];
  await pool.query('DELETE FROM links WHERE id=$1', [req.params.id]);
  const undoId = await tombstone(r.world_id, req.user.id, 'link', { link: row });
  res.json({ ok: true, undoId });
}));

module.exports = router;
