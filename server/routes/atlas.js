const crypto = require('crypto');
const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { resolveImageUrl } = require('../utils/imageUrl');
const { r2Enabled, putObject, copyObject } = require('../storage');
const { spotlightTrail, pendingForge } = require('./share');
const { isId, whole, text, oneOf, bool, ordered, pct, worldName, cleanBody, idParam } = require('../lib/validate');
const { wrap: wrapWith, ownsWorld, notFound } = require('../lib/route');
const { MAX_CORNERS, INT_MAX } = require('../lib/validate');
const { CATEGORIES } = require('../lib/vocab');
const spend = require('../lib/spend');
const { looseEnds } = require('../lib/looseEnds');
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

const wrap = wrapWith('atlas');

// ---- ownership resolution (ownsWorld from lib/route: a caller may only touch their own worlds) ----
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
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > MAX_CORNERS) return undefined;
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
  'owner_node_id', 'view', 'focus_start', 'focus_end', 'dm_note', 'ambience_prompt', 'ambience_url', 'is_main', 'tree_parent_id', 'tree_order'];
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

// Owning and leading are two things. A map's owner_node_id is the entry it belongs to: that
// decides the tree, the crumb, what players must see to reach it, and what a delete takes. A
// node's interior_map_id is only where it LEADS (◎ Go inside). Usually the node owns the map it
// leads to (its interior), but it may lead to a map of someone else's: a door into the room
// beside this one, or any map the DM points it at. Such a door never owns, renames or deletes
// the map behind it.
const mapSnapshot = async (mapId) => ({
  map: (await pool.query('SELECT * FROM maps WHERE id=$1', [mapId])).rows[0],
  placements: await rowsOf('SELECT * FROM placements WHERE map_id=$1', [mapId]),
  backdrops: await rowsOf('SELECT * FROM map_backdrops WHERE map_id=$1', [mapId]),
});
// the other entries that lead into these maps: a delete leaves them leading nowhere (the FK
// sets NULL), so the snapshot keeps them and an undo points them back
const doorsInto = async (mapIds, exceptNodeId = null) => (mapIds.length ? (await pool.query(
  'SELECT id AS node_id, interior_map_id AS map_id FROM nodes WHERE interior_map_id = ANY($1::int[]) AND id IS DISTINCT FROM $2 ORDER BY id',
  [mapIds, exceptNodeId])).rows.map((r) => ({ nodeId: r.node_id, mapId: r.map_id })) : []);
// delete one map with an undoable tombstone (kind 'interior'): `leads` says whether its owner
// led into it, so an undo knows whether to point the owner back
async function removeMap(wid, userId, mapId) {
  const snap = await mapSnapshot(mapId);
  const owner = snap.map.owner_node_id
    ? (await pool.query('SELECT interior_map_id FROM nodes WHERE id=$1', [snap.map.owner_node_id])).rows[0] : null;
  const payload = { ownerNodeId: snap.map.owner_node_id, leads: owner?.interior_map_id === mapId, ...snap,
    doorsIn: await doorsInto([mapId], snap.map.owner_node_id) };
  await pool.query('DELETE FROM maps WHERE id=$1', [mapId]);
  return tombstone(wid, userId, 'interior', payload);
}

// GET /worlds/:worldId — world + timeline; lazily ensures a root map exists.
// The root map made at first open is '<world> — World Map'. Its title column holds 255, like the
// world's name, so a long name gives up its tail: a title that overflowed failed the insert, and
// the world could never be opened.
const rootTitle = (name) => `${String(name).slice(0, 255 - ' — World Map'.length)} — World Map`;

router.get('/worlds/:worldId', wrap(async (req, res) => {
  const { worldId } = req.params;
  if (!(await ownsWorld(worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const w = (await pool.query('SELECT * FROM worlds WHERE id=$1', [worldId])).rows[0];
  if (!w.root_map_id) {
    const m = (await pool.query(
      `INSERT INTO maps (title, world_id, view, created_by) VALUES ($1,$2,'map',$3) RETURNING id`,
      [rootTitle(w.name), worldId, req.user.id])).rows[0];
    await pool.query('UPDATE worlds SET root_map_id=$1 WHERE id=$2', [m.id, worldId]);
    w.root_map_id = m.id;
  }
  const eras = (await pool.query(
    'SELECT id, name, start_time, end_time, player_visible, prep_note, recap_note FROM eras WHERE world_id=$1 ORDER BY start_time, id',
    [worldId])).rows.map((e) => ({ id: e.id, name: e.name, start: e.start_time, end: e.end_time, playerVisible: e.player_visible,
      prepNote: e.prep_note || '', recapNote: e.recap_note || '' }));
  res.json({ world: {
    id: w.id, name: w.name, description: w.description, rootMapId: w.root_map_id,
    shareToken: w.share_token || null,
    spotlightNodeId: w.spotlight_node_id ?? null,
    looseEnds: !!w.loose_ends,
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
  const raw = req.body.node_id ?? req.body.nodeId; // snake_case like every other body; nodeId is the older spelling
  if (!isId(raw)) return bad(res, 'That node is not in this world');
  const nodeId = Number(raw);
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
    loose_ends: [bool, 'Loose ends are on or off'],
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
      // ...and one the clock's column can hold (Postgres INTEGER), so it is a 400, never a 500
      if (req.body[k] == null || !Number.isInteger(v) || Math.abs(v) > INT_MAX) return res.status(400).json({ message: 'Timeline moments must be whole numbers' });
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
    timeline_time_unit: 'timeline_time_unit', loose_ends: 'loose_ends',
  };
  const sets = [], vals = []; let i = 1;
  for (const k in cols) if (k in req.body) { sets.push(`${cols[k]}=$${i++}`); vals.push(req.body[k]); }
  const was = 'name' in c.vals ? (await pool.query('SELECT name, root_map_id FROM worlds WHERE id=$1', [req.params.worldId])).rows[0] : null;
  if (sets.length) { vals.push(req.params.worldId); await pool.query(`UPDATE worlds SET ${sets.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${i}`, vals); }
  // the root map made at first open is '<world> — World Map': it follows a rename while it
  // still reads that way (a root the DM renamed keeps its own name)
  if (was?.root_map_id && c.vals.name !== was.name) {
    await pool.query('UPDATE maps SET title=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND title=$3',
      [rootTitle(c.vals.name), was.root_map_id, rootTitle(was.name)]);
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
  // a pending Forge batch is only the DM's preview: the copy has no forge_batches rows, so its
  // work would land there as kept work with no card to Unmake, and share.js would no longer
  // hold it back from the copy's players. Settle the cards first.
  if ((await pool.query(`SELECT 1 FROM forge_batches WHERE world_id=$1 AND status='pending' LIMIT 1`, [src.id])).rows.length) {
    return res.status(409).json({ message: src.created_by === req.user.id
      ? `Keep or Unmake the Forge's cards in “${src.name}” first — a copy would keep their work`
      : 'That world is being changed right now — try again later, or start an empty world' });
  }
  // the copy owns its art — every image is copied — so it adds the source's image bytes to
  // storage, and spends them from the day's upload allowance as uploading them would
  // (lib/spend.js): copy, delete, copy again went round the 50-worlds backstop above
  const art = (await pool.query('SELECT COALESCE(SUM(file_size), 0) AS bytes FROM images WHERE world_id=$1', [src.id])).rows[0];
  const artKb = Math.ceil(Number(art.bytes) / 1024);
  if (artKb > 0 && !(await spend.charge(req, res, 'upload', artKb))) return;

  const client = await pool.connectTx();
  try {
  await client.query('BEGIN');
  const rowsOfC = async (sql, args) => (await client.query(sql, args)).rows;
  // the caller's description wins, even an empty one — a template's blurb never lands on their world
  const desc = description === undefined ? src.description : (String(description || '').trim().slice(0, 2000) || null);
  const w = (await client.query(
    `INSERT INTO worlds (name, description, created_by, timeline_enabled, timeline_min_time, timeline_max_time, timeline_current_time, timeline_time_unit, loose_ends)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [cleanName, desc, req.user.id, src.timeline_enabled,
     src.timeline_min_time, src.timeline_max_time, src.timeline_current_time, src.timeline_time_unit, !!src.loose_ends])).rows[0];

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
      if (im.storage_key) { filePath = await copyObject(im.storage_key, key, im.mime_type); storageKey = key; }
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
    const r = await insertRow(client, 'maps', without(MAP_COLS, 'id', 'created_at', 'updated_at', 'owner_node_id', 'tree_parent_id'), m,
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
  for (const m of maps) if (m.tree_parent_id && mapMap.has(m.tree_parent_id)) {
    await client.query('UPDATE maps SET tree_parent_id=$1 WHERE id=$2', [mapMap.get(m.tree_parent_id), mapMap.get(m.id)]);
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
    await client.query('INSERT INTO eras (world_id, name, start_time, end_time, player_visible, prep_note, recap_note) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [w.id, e.name, e.start_time, e.end_time, e.player_visible, e.prep_note, e.recap_note]);
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
// POST /worlds/:worldId/tree-order — the DM's order for one set of siblings in the Maps tree:
// { ids } in the order wanted; each gets its position. Only the tree reads it.
router.post('/worlds/:worldId/tree-order', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const ids = req.body.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || !ids.every(isId) || new Set(ids.map(Number)).size !== ids.length)
    return bad(res, 'An order is a list of maps');
  const mine = (await pool.query('SELECT count(*)::int AS n FROM maps WHERE id = ANY($1::int[]) AND world_id = $2', [ids.map(Number), req.params.worldId])).rows[0].n;
  if (mine !== ids.length) return bad(res, 'That map is not in this world');
  await pool.query(
    `UPDATE maps m SET tree_order = v.ord FROM unnest($1::int[]) WITH ORDINALITY AS v(id, ord)
     WHERE m.id = v.id AND m.world_id = $2`, [ids.map(Number), req.params.worldId]);
  res.json({ ok: true });
}));

router.get('/worlds/:worldId/maps', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const rows = (await pool.query(`
    SELECT m.id, m.title, m.owner_node_id, m.is_main, m.tree_parent_id, m.tree_order, i.file_path AS backdrop_path,
      (SELECT p.map_id FROM placements p WHERE p.node_id=m.owner_node_id AND p.map_id <> m.id ORDER BY p.id LIMIT 1) AS owner_map_id
    FROM maps m LEFT JOIN images i ON m.image_id=i.id
    WHERE m.world_id=$1 ORDER BY m.id`, [req.params.worldId])).rows;
  res.json({ maps: rows.map((m) => ({ id: m.id, title: m.title, ownerNodeId: m.owner_node_id, parentMapId: m.owner_map_id,
    isMain: !!m.is_main, filedUnder: m.tree_parent_id ?? null, order: m.tree_order ?? null, thumbUrl: resolveImageUrl(req, m.backdrop_path) })) });
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

// GET /worlds/:worldId/loose-ends — every entry with when it last came up, oldest first: the
// rail's Loose ends list, which picks how long is too quiet. The rule is lib/looseEnds.js.
router.get('/worlds/:worldId/loose-ends', wrap(async (req, res) => {
  const wid = req.params.worldId;
  if (!(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'World not found' });
  // `now` is the database's clock with no zone, read the way the stored timestamps are (they carry
  // none): a server process in another zone than the database would otherwise age every entry by hours
  const w = (await pool.query('SELECT timeline_enabled, timeline_current_time, LOCALTIMESTAMP AS now FROM worlds WHERE id=$1', [wid])).rows[0];
  const canon = w?.timeline_enabled && w.timeline_current_time != null ? w.timeline_current_time : null;
  // GREATEST skips NULLs: an entry with no period text, thread or placement is judged by its own edits
  const rows = (await pool.query(`
    SELECT n.id, n.title, n.category, n.visibility, n.interior_map_id,
      GREATEST(n.created_at, n.updated_at,
        (SELECT MAX(f.created_at) FROM node_facts f WHERE f.node_id = n.id),
        (SELECT MAX(l.created_at) FROM links l WHERE l.from_node_id = n.id OR l.to_node_id = n.id),
        (SELECT MAX(p.created_at) FROM placements p WHERE p.node_id = n.id)) AS touched,
      (SELECT COUNT(*)::int FROM placements p WHERE p.node_id = n.id) AS placed,
      (SELECT COUNT(*)::int FROM placements p WHERE p.node_id = n.id
        AND ($2::int IS NULL OR p.end_time IS NULL OR p.end_time >= $2::int)) AS live
    FROM nodes n WHERE n.world_id = $1 AND n.category <> 'party'`, [wid, canon])).rows;
  const eras = (await pool.query('SELECT name, start_time, prep_note, recap_note, created_at FROM eras WHERE world_id=$1', [wid])).rows;
  res.json({ entries: looseEnds(rows, eras, { clockOn: canon != null }), now: new Date(w.now).toISOString() });
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
  // A node's long text (body, DM note, voice line and style) travels once, on its FIRST
  // placement here; its other placements carry every other field and leave those keys out,
  // and the client copies them across (atlasService.getMap). The Party is placed once per
  // footstep, and its growing DM note was being sent once per footstep.
  const texted = new Set();
  const placements = pl.map((r) => {
    const first = !texted.has(r.node_id);
    texted.add(r.node_id);
    return {
      id: r.placement_id, x: Number(r.x), y: Number(r.y), start: r.start_time, end: r.end_time, visibility: r.placement_vis, shape: r.shape || null, shapeKind: r.shape_kind || 'area', shapeStyle: r.shape_style || null,
      node: { id: r.node_id, title: r.title, category: r.category, visibility: r.node_vis, stance: r.stance,
              voiceId: r.voice_id, voiceName: r.voice_name, voiceUrl: r.voice_url,
              ...(first && { body: r.body, dmNote: r.dm_note, voiceLine: r.voice_line, voiceStyle: r.voice_style }),
              pin: r.pin, pinSize: r.pin_size, author: r.author, hasInterior: !!r.interior_map_id, interiorMapId: r.interior_map_id,
              imageId: r.image_id, imageUrl: resolveImageUrl(req, r.node_image_path) },
    };
  });
  const bds = (await pool.query(
    `SELECT b.id, b.image_id, b.start_time, b.end_time, i.file_path
     FROM map_backdrops b JOIN images i ON i.id = b.image_id
     WHERE b.map_id = $1 ORDER BY b.start_time NULLS FIRST, b.id`, [req.params.mapId])).rows;
  // a map beside another: its owner leads elsewhere, so only a door leads here, and the map is
  // removed on its own rather than through its owner
  const owner = map.owner_node_id ? (await pool.query('SELECT interior_map_id FROM nodes WHERE id=$1', [map.owner_node_id])).rows[0] : null;
  res.json({
    map: { id: map.id, worldId: map.world_id, title: map.title, view: map.view, ownerNodeId: map.owner_node_id, imageId: map.image_id,
           beside: !!owner && owner.interior_map_id !== map.id,
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
    is_main: [bool, 'A map is a main map or not'],
    tree_parent_id: [idOrNull, 'That map is not in this world'],
  });
  if (c.bad) return bad(res, c.bad);
  if (c.vals.image_id != null && !(await imageInWorld(c.vals.image_id, wid))) return badImage(res);
  if (c.vals.tree_parent_id != null) {
    // filed under a map of this world, never under itself or anything filed beneath it
    if (c.vals.tree_parent_id === Number(req.params.mapId)) return bad(res, "A map can't be filed under itself");
    if ((await worldIdOfMap(c.vals.tree_parent_id)) !== wid) return bad(res, 'That map is not in this world');
    const loop = (await pool.query(`
      WITH RECURSIVE up(id, g) AS (SELECT $1::int, 0 UNION ALL
        SELECT m.tree_parent_id, up.g + 1 FROM maps m JOIN up ON m.id = up.id WHERE m.tree_parent_id IS NOT NULL AND up.g < 200)
      SELECT 1 FROM up WHERE id = $2 LIMIT 1`, [c.vals.tree_parent_id, req.params.mapId])).rows.length;
    if (loop) return bad(res, "A map can't be filed under a map filed beneath it");
  }
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
  if (sh === undefined) return res.status(400).json({ message: `An outline needs 3 to ${MAX_CORNERS} corners` });
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
  // a place never stands inside itself (any map it owns): the tree and the crumb would loop;
  // and a door never stands in the room it opens onto
  const own = (await pool.query(
    'SELECT n.interior_map_id, (SELECT owner_node_id FROM maps WHERE id=$2) = n.id AS owns_here FROM nodes n WHERE n.id=$1',
    [node_id, req.params.mapId])).rows[0];
  if (own?.owns_here) return bad(res, "A place can't stand inside its own interior");
  if (own?.interior_map_id === Number(req.params.mapId)) return bad(res, "An entry can't stand on the map it leads to");
  const sh = cleanShape(shape), kind = shapeKind(shape_kind);
  if (sh === undefined) return bad(res, `An outline needs 3 to ${MAX_CORNERS} corners`);
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
  await pool.query('UPDATE nodes SET updated_at=CURRENT_TIMESTAMP WHERE id=$1', [req.params.id]); // a period text is work on the entry
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
  if (Object.keys(c.vals).length) await pool.query('UPDATE nodes SET updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT node_id FROM node_facts WHERE id=$1)', [req.params.id]);
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
  // alongside; only an unplaced owner lands inside. With ?t= (a mention's moment) a placement
  // standing at that moment comes first: the Party's footstep then, not its first one.
  const here = isId(req.query.map) ? Number(req.query.map) : null;
  const at = whole(req.query.t);
  if (at === undefined) return bad(res, 'A moment is a whole number on the clock');
  const n = (await pool.query('SELECT interior_map_id FROM nodes WHERE id=$1', [req.params.id])).rows[0];
  const p = (await pool.query(`SELECT id, map_id FROM placements WHERE node_id=$1
    ORDER BY ($3::int IS NULL OR ((start_time IS NULL OR start_time <= $3::int) AND (end_time IS NULL OR end_time >= $3::int))) DESC,
      (map_id = $2) DESC NULLS LAST, id LIMIT 1`, [req.params.id, here, at])).rows[0];
  if (p) return res.json({ mapId: p.map_id, placementId: p.id, interiorMapId: n?.interior_map_id ?? null });
  if (n?.interior_map_id) return res.json({ mapId: n.interior_map_id, interiorMapId: n.interior_map_id });
  res.json({});
}));

// What removing these maps takes with it: the entries left with nowhere to stand (every
// placement they have is on these maps), the maps nested deeper (owned by entries that stood
// here: their owners keep them, under "Unplaced"; cycles-safe via UNION), and the other
// entries that lead into them, which an undo points back. exceptId is the entry doing the
// removing (or the map's owner), never counted.
async function mapsImpact(direct, exceptId) {
  const r = (await pool.query(`
    WITH RECURSIVE tree(map_id) AS (
      SELECT unnest($1::int[])
      UNION
      SELECT m.id FROM tree t
      JOIN placements p ON p.map_id = t.map_id
      JOIN maps m ON m.owner_node_id = p.node_id
    )
    SELECT
      GREATEST((SELECT COUNT(*) FROM tree) - cardinality($1::int[]), 0) AS nested_maps,
      (SELECT COUNT(*) FROM nodes n WHERE n.id IS DISTINCT FROM $2
         AND EXISTS (SELECT 1 FROM placements p WHERE p.node_id = n.id AND p.map_id = ANY($1::int[]))
         AND NOT EXISTS (SELECT 1 FROM placements p2 WHERE p2.node_id = n.id AND NOT (p2.map_id = ANY($1::int[])))) AS nodes_inside,
      (SELECT COUNT(*) FROM nodes n WHERE n.interior_map_id = ANY($1::int[]) AND n.id IS DISTINCT FROM $2) AS doors_in`,
    [direct, exceptId])).rows[0];
  return { nestedMaps: parseInt(r.nested_maps), nodesInside: parseInt(r.nodes_inside), doorsIn: parseInt(r.doors_in) };
}

// GET /nodes/:id/impact — what deleting this node takes with it: how many maps it sits on,
// and every map it owns (maps.owner_node_id cascades one level) with what lives inside them.
// ?scope=interior asks only about its interior (the ✕ beside ◎ Go inside). A node that leads
// to a map it does not own takes nothing with it there (leadsElsewhere).
// The client shows this before the delete so "honest delete" isn't a guess.
router.get('/nodes/:id/impact', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const id = Number(req.params.id);
  const n = (await pool.query('SELECT interior_map_id FROM nodes WHERE id=$1', [id])).rows[0];
  const owned = (await pool.query('SELECT id FROM maps WHERE owner_node_id=$1 ORDER BY id', [id])).rows.map((r) => r.id);
  const direct = req.query.scope === 'interior' ? owned.filter((m) => m === n.interior_map_id) : owned;
  const c = (await pool.query('SELECT COUNT(*) AS placements, COUNT(DISTINCT map_id) AS maps FROM placements WHERE node_id=$1', [id])).rows[0];
  res.json({
    placements: parseInt(c.placements),
    maps: parseInt(c.maps),
    interiorMaps: direct.length,
    ...(await mapsImpact(direct, id)),
    leadsElsewhere: n.interior_map_id != null && !owned.includes(n.interior_map_id),
  });
}));

// GET /maps/:mapId/impact — the same, for removing one map on its own (a map beside another).
router.get('/maps/:mapId/impact', wrap(async (req, res) => {
  const wid = await worldIdOfMap(req.params.mapId);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  const m = (await pool.query('SELECT owner_node_id FROM maps WHERE id=$1', [req.params.mapId])).rows[0];
  res.json({ interiorMaps: 1, ...(await mapsImpact([Number(req.params.mapId)], m.owner_node_id)) });
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
  const before = ('title' in c.vals || 'visibility' in c.vals)
    ? (await pool.query('SELECT title, interior_map_id, visibility FROM nodes WHERE id=$1', [req.params.id])).rows[0] : null;
  await updateCols('nodes', req.params.id, c.vals, true);
  // an interior still carrying its node's old name follows the rename; a space the DM named
  // on purpose keeps its own name, and so does a map the node only leads to (a door's room)
  if ('title' in c.vals && before?.interior_map_id && c.vals.title !== before.title) {
    await pool.query('UPDATE maps SET title=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND title=$3 AND owner_node_id=$4',
      [c.vals.title, before.interior_map_id, before.title, req.params.id]);
  }
  // Revealing a node reveals where it stands: the Forge births placements DM-only, so a
  // "revealed" node would otherwise stay invisible to players behind its hidden placement.
  // Only a node that WAS DM-only is revealed: pressing 👁 Players again on a shared entry, or
  // keeping a marker as canon, leaves a placement the DM hid on one map hidden.
  if ('visibility' in c.vals && c.vals.visibility !== 'dm' && before?.visibility === 'dm') {
    await pool.query(`UPDATE placements SET visibility='shared' WHERE node_id=$1 AND visibility='dm'`, [req.params.id]);
  }
  res.json({ ok: true });
}));

// POST /nodes/:id/interior — give a node a map to lead to (its zoom-in space); idempotent. By
// default the map is the node's own interior, nested inside it. With beside_map_id it is a NEW
// map beside that one instead: the same owner and the same spot in the tree, so it is the room
// next door rather than a room inside the door, and the node leads there without owning it.
router.post('/nodes/:id/interior', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const node = (await pool.query('SELECT title, interior_map_id FROM nodes WHERE id=$1', [req.params.id])).rows[0];
  if (node.interior_map_id) return res.json({ mapId: node.interior_map_id });
  const view = req.body.view === 'list' ? 'list' : 'map';
  let owner = Number(req.params.id), filed = null, main = false;
  if (req.body.beside_map_id != null) {
    const b = isId(req.body.beside_map_id)
      ? (await pool.query('SELECT world_id, owner_node_id, tree_parent_id, is_main FROM maps WHERE id=$1', [req.body.beside_map_id])).rows[0] : null;
    if (!b || b.world_id !== wid) return bad(res, 'That map is not in this world');
    if (!b.owner_node_id) return bad(res, 'Nothing stands beside the world map — give the entry an interior map instead');
    owner = b.owner_node_id; filed = b.tree_parent_id; main = b.is_main;
  }
  const m = (await pool.query(
    'INSERT INTO maps (title, world_id, view, owner_node_id, tree_parent_id, is_main, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [node.title, wid, view, owner, filed, main, req.user.id])).rows[0];
  // exactly one interior per node, even under a double click: the claim is atomic
  const claimed = await pool.query('UPDATE nodes SET interior_map_id=$1 WHERE id=$2 AND interior_map_id IS NULL RETURNING id', [m.id, req.params.id]);
  if (!claimed.rows.length) {
    await pool.query('DELETE FROM maps WHERE id=$1', [m.id]);
    const cur = (await pool.query('SELECT interior_map_id FROM nodes WHERE id=$1', [req.params.id])).rows[0];
    return res.json({ mapId: cur.interior_map_id });
  }
  res.status(201).json({ mapId: m.id });
}));

// PUT /nodes/:id/leads-to — point a node at a map that already exists (the door to the room
// beside, the stair back up): it leads there without owning it. A node leads one way, so one
// that already leads somewhere is a 409 until that is removed (DELETE /nodes/:id/interior).
router.put('/nodes/:id/leads-to', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const mapId = isId(req.body.map_id) ? Number(req.body.map_id) : null;
  if (!mapId || (await worldIdOfMap(mapId)) !== wid) return bad(res, 'That map is not in this world');
  if ((await pool.query('SELECT 1 FROM placements WHERE node_id=$1 AND map_id=$2', [req.params.id, mapId])).rows.length)
    return bad(res, "An entry can't lead to the map it stands on");
  const r = await pool.query('UPDATE nodes SET interior_map_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND interior_map_id IS NULL RETURNING id', [mapId, req.params.id]);
  if (!r.rows.length) {
    const cur = (await pool.query('SELECT interior_map_id FROM nodes WHERE id=$1', [req.params.id])).rows[0];
    if (cur?.interior_map_id !== mapId) return res.status(409).json({ message: 'It already leads to another map — remove that first' });
  }
  res.json({ ok: true });
}));

// DELETE /nodes/:id/interior — the node stops leading anywhere. Its OWN interior is deleted
// (its placements cascade; nodes placed only there are left unplaced; undoable) and the node
// stays. A map it only led to stays exactly as it was: the door lets go, the room is untouched
// (`kept` names it, for the client's local undo).
router.delete('/nodes/:id/interior', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const n = (await pool.query(
    'SELECT n.interior_map_id, m.owner_node_id FROM nodes n LEFT JOIN maps m ON m.id = n.interior_map_id WHERE n.id=$1', [req.params.id])).rows[0];
  if (!n?.interior_map_id) return res.json({ ok: true });
  if (n.owner_node_id !== Number(req.params.id)) {
    await pool.query('UPDATE nodes SET interior_map_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [req.params.id]);
    return res.json({ ok: true, kept: n.interior_map_id });
  }
  const undoId = await removeMap(wid, req.user.id, n.interior_map_id);
  res.json({ ok: true, undoId });
}));

// DELETE /maps/:mapId — remove one map on its own (✕ Remove this map): a map beside another,
// or one whose owner stands nowhere. Undoable like an interior; the world map stays.
router.delete('/maps/:mapId', wrap(async (req, res) => {
  const wid = await worldIdOfMap(req.params.mapId);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  const m = (await pool.query('SELECT owner_node_id FROM maps WHERE id=$1', [req.params.mapId])).rows[0];
  if (!m.owner_node_id) return bad(res, "The world map can't be removed");
  const undoId = await removeMap(wid, req.user.id, Number(req.params.mapId));
  res.json({ ok: true, undoId });
}));

// DELETE /nodes/:id — delete the node everywhere (cascades placements, links, and every map it
// owns). Everything removed is snapshotted first, so it can be undone: the maps it owned, the
// other entries that led into them, and the map it only led to (which stays).
router.delete('/nodes/:id', wrap(async (req, res) => {
  const wid = await worldIdOfNode(req.params.id);
  if (!wid || !(await ownsWorld(wid, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const node = (await pool.query('SELECT * FROM nodes WHERE id=$1', [req.params.id])).rows[0];
  const owned = (await pool.query('SELECT id FROM maps WHERE owner_node_id=$1 ORDER BY id', [node.id])).rows.map((r) => r.id);
  const ownsInterior = node.interior_map_id != null && owned.includes(node.interior_map_id);
  const snapshot = {
    node,
    placements: await rowsOf('SELECT * FROM placements WHERE node_id=$1', [node.id]),
    links: await rowsOf('SELECT * FROM links WHERE from_node_id=$1 OR to_node_id=$1', [node.id]),
    facts: await rowsOf('SELECT * FROM node_facts WHERE node_id=$1', [node.id]),
    interior: ownsInterior ? await mapSnapshot(node.interior_map_id) : null,
    sideMaps: [],
    leadsTo: node.interior_map_id != null && !ownsInterior ? node.interior_map_id : null,
    doorsIn: await doorsInto(owned, node.id),
    // the lantern goes out with its node (ON DELETE SET NULL) — undo relights it
    spotlit: (await pool.query('SELECT 1 FROM worlds WHERE id=$1 AND spotlight_node_id=$2', [wid, node.id])).rows.length > 0,
  };
  // the maps beside its interior that it owns go with it too
  for (const id of owned) if (id !== node.interior_map_id) snapshot.sideMaps.push(await mapSnapshot(id));
  await pool.query('DELETE FROM nodes WHERE id=$1', [req.params.id]);
  const undoId = await tombstone(wid, req.user.id, 'node', snapshot);
  res.json({ ok: true, undoId });
}));

// GET /worlds/:worldId/tombstones — what can still be undone (the last 24 hours), newest
// first, each named the way the DM knows it: the workspace's "Recently deleted" list. Names
// are read as they stand now, the snapshot's own where the thing itself is gone; `t` is the
// clock moment a period text or period art began, for the client to label.
router.get('/worlds/:worldId/tombstones', wrap(async (req, res) => {
  if (!(await ownsWorld(req.params.worldId, req.user.id))) return res.status(404).json({ message: 'World not found' });
  const rows = (await pool.query(
    `SELECT id, kind, payload, EXTRACT(EPOCH FROM (NOW() - created_at))::int AS age FROM tombstones
     WHERE world_id=$1 AND created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC, id DESC LIMIT 100`,
    [req.params.worldId])).rows;
  const nodeIds = new Set(), mapIds = new Set();
  for (const { kind, payload: p } of rows) {
    if (kind === 'interior') nodeIds.add(p.ownerNodeId);
    if (kind === 'placement') { nodeIds.add(p.placement?.node_id); mapIds.add(p.placement?.map_id); }
    if (kind === 'fact') nodeIds.add(p.fact?.node_id);
    if (kind === 'link') { nodeIds.add(p.link?.from_node_id); nodeIds.add(p.link?.to_node_id); }
    if (kind === 'backdrop') mapIds.add(p.backdrop?.map_id);
  }
  const titles = async (table, ids) => new Map((await pool.query(`SELECT id, title FROM ${table} WHERE id = ANY($1::int[])`,
    [[...ids].filter(Number.isInteger)])).rows.map((r) => [r.id, r.title]));
  const nodeT = await titles('nodes', nodeIds), mapT = await titles('maps', mapIds);
  const q = (title, gone) => (title ? `“${title}”` : gone);
  const say = ({ kind, payload: p }) => {
    switch (kind) {
      case 'node': return [`The entry ${q(p.node?.title, '(untitled)')}`, null];
      case 'interior': return [p.leads === false ? `The map ${q(p.map?.title, '(untitled)')}`
        : `The interior map of ${q(nodeT.get(p.ownerNodeId), q(p.map?.title, 'an entry'))}`, null];
      case 'placement': return [`${q(nodeT.get(p.placement?.node_id), 'An entry')} on the map ${q(mapT.get(p.placement?.map_id), '(gone)')}`, null];
      case 'era': return [`The era ${q(p.era?.name, '(unnamed)')}`, null];
      case 'fact': return [`A period text of ${q(nodeT.get(p.fact?.node_id), 'an entry')}`, p.fact?.start_time ?? null];
      case 'link': return [`The thread ${q(nodeT.get(p.link?.from_node_id), 'an entry')} – ${q(nodeT.get(p.link?.to_node_id), 'an entry')}`, null];
      case 'backdrop': return [`Period art on the map ${q(mapT.get(p.backdrop?.map_id), '(gone)')}`, p.backdrop?.start_time ?? null];
      default: return ['Something deleted', null];
    }
  };
  res.json({ tombstones: rows.map((r) => { const [label, t] = say(r); return { id: r.id, kind: r.kind, label, t, ageSeconds: r.age }; }) });
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
      const filed = (await exists('maps', m.tree_parent_id)) ? m.tree_parent_id : null;
      await insertRow(client, 'maps', MAP_COLS, m, { image_id: imageId, owner_node_id: ownerNodeId, tree_parent_id: filed });
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
    // the entries that led into a removed map lead there again, unless they lead elsewhere now
    const pointBack = async (doors) => {
      for (const d of doors || []) {
        if (!(await exists('maps', d.mapId))) continue;
        await client.query('UPDATE nodes SET interior_map_id=$1 WHERE id=$2 AND interior_map_id IS NULL', [d.mapId, d.nodeId]);
      }
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
      for (const s of p.sideMaps || []) {
        await insertMap(s.map, n.id);
        for (const pl of s.placements || []) await insertPlacement(pl);
        for (const b of s.backdrops || []) await insertBackdrop(b);
      }
      if (p.leadsTo) await pointBack([{ nodeId: n.id, mapId: p.leadsTo }]);
      await pointBack(p.doorsIn);
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
      // a map beside another was not where its owner led (older tombstones always were)
      const leads = p.leads !== false;
      const owner = (await client.query('SELECT interior_map_id FROM nodes WHERE id=$1', [p.ownerNodeId])).rows[0];
      if (leads && owner.interior_map_id) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'The node has a new interior now' }); }
      await insertMap(p.map, p.ownerNodeId);
      if (leads) await client.query('UPDATE nodes SET interior_map_id=$1 WHERE id=$2', [p.map.id, p.ownerNodeId]);
      for (const pl of p.placements || []) await insertPlacement(pl);
      for (const b of p.backdrops || []) await insertBackdrop(b);
      await pointBack(p.doorsIn);
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
        'INSERT INTO eras (id, world_id, name, start_time, end_time, player_visible, prep_note, recap_note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING',
        [e.id, e.world_id, e.name, e.start_time, e.end_time, e.player_visible, e.prep_note ?? null, e.recap_note ?? null]);
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
    if (sh === undefined) return res.status(400).json({ message: `An outline needs 3 to ${MAX_CORNERS} corners` });
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
    prep_note: [long, 'Session notes are text'],
    recap_note: [long, 'Session notes are text'],
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
  if (!isId(from_node_id) || !isId(to_node_id)) return bad(res, 'A link joins two nodes');
  if (String(from_node_id) === String(to_node_id)) return bad(res, 'A link joins two different nodes');
  const label = text(req.body.label, 255);
  if (label === undefined) return bad(res, 'A link label is text of up to 255 characters');
  const wid = await worldIdOfNode(from_node_id), wid2 = await worldIdOfNode(to_node_id);
  if (!wid || !wid2 || !(await ownsWorld(wid, req.user.id)) || !(await ownsWorld(wid2, req.user.id))) return notFound(res); // not yours: as if absent
  if (wid !== wid2) return bad(res, 'A link joins two nodes of the same world');
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
