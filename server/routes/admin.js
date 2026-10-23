const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireAdmin, isAdmin } = require('../middleware/auth');
const { readStatements } = require('../config/apply-schema');
const { isId, idParam } = require('../lib/validate');
const { wrap: wrapWith } = require('../lib/route');
const { resolveImageUrl } = require('../utils/imageUrl');
const { noteText } = require('../forge/notes');
const { enabled: forgeOn } = require('../forge/gemini');
const voice = require('../voice/providers');
const { KINDS, setting } = require('../lib/spend');
const { guestSweepOn } = require('../lib/guests');
const { r2Enabled } = require('../storage');
const router = express.Router();
const wrap = wrapWith('admin');

// the tables schema.sql creates, read from the file itself — never a hand list that drifts
const expectedTables = readStatements()
  .map((st) => /CREATE TABLE IF NOT EXISTS\s+(\w+)/i.exec(st)).filter(Boolean).map((m) => m[1].toLowerCase());

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);
// a non-canonical id (60.0, abc, -1) is a 404 before any query runs
router.param('worldId', idParam);
router.param('mapId', idParam);
router.param('id', idParam);

// GET /api/admin/db-status - Check database status
router.get('/db-status', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');

    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tables = tablesResult.rows.map(row => row.table_name);
    const missingTables = expectedTables.filter(table => !tables.includes(table));

    let userCount = 0;
    if (tables.includes('users')) {
      const userResult = await pool.query('SELECT COUNT(*) FROM users');
      userCount = parseInt(userResult.rows[0].count);
    }

    res.json({
      success: true,
      message: `Database connected successfully. ${tables.length} tables found.`,
      details: {
        tablesFound: tables,
        missingTables: missingTables,
        userCount: userCount,
        needsMigration: missingTables.length > 0
      }
    });

  } catch (error) {
    console.error('Database status check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Database connection failed: ' + error.message,
      details: {
        error: error.code || 'Unknown error',
        hint: 'Check if DATABASE_URL is set correctly in Railway'
      }
    });
  }
});

// GET /api/admin/site — the switches that live in Railway variables, as they stand: on or off, or
// a plain number, never a key or a secret (a key shows only as set up or not). Changing one is
// done in Railway; nothing here writes.
router.get('/site', (req, res) => {
  const days = Number(process.env.GUEST_RETENTION_DAYS || 30);
  const caps = (kind, unit) => {
    const k = KINDS[kind];
    const n = (suffix, dflt) => setting(`${k.env}_DAILY_${suffix}`, dflt);
    return `${n('CAP', k.defaults.cap)} an account, ${n('CAP_GUEST', k.defaults.guest)} a guest, ${n('CEILING', k.defaults.ceiling)} in all — ${unit} a day`;
  };
  res.json({
    switches: [
      { key: 'GEMINI_API_KEY, FORGE_ENABLED', label: 'The Forge', on: forgeOn() },
      { key: 'VOICE_ENABLED, VOICE_PROVIDER, a voice key', label: 'Voices', on: !!voice.status().enabled },
      { key: 'GUEST_CLEANUP_ENABLED', label: 'Daily guest cleanup', on: guestSweepOn() },
      { key: 'GUEST_RETENTION_DAYS', label: 'Guests kept after their last visit',
        value: Number.isFinite(days) && days >= 1 ? `${days} days` : 'not valid — the guest sweep will not run' },
      { key: 'FORGE_DAILY_CAP, _CAP_GUEST, _CEILING', label: 'Forge allowance', value: caps('forge', 'uses') },
      { key: 'VOICE_DAILY_CAP, _CAP_GUEST, _CEILING', label: 'Voice allowance', value: caps('voice', 'recordings') },
      { key: 'UPLOAD_DAILY_CAP, _CAP_GUEST, _CEILING', label: 'Upload allowance', value: caps('upload', 'MB') },
      { key: 'R2_*', label: 'Image storage (R2) set up', on: r2Enabled },
      { key: 'AUTH_SERVICE_URL, SSO_CLIENT_ID, SSO_CLIENT_SECRET', label: 'Waypoint sign-in set up',
        on: !!(process.env.AUTH_SERVICE_URL && process.env.SSO_CLIENT_ID && process.env.SSO_CLIENT_SECRET) },
    ],
  });
});

// ---- Browse: everything on the site, look-only -------------------------------------------------
// Every list takes ?q= (case-blind; % and _ are plain characters; "12" or "#12" also finds id 12)
// and ?page= (from 1, 50 a page), and answers { items, total, page, pages, pageSize, q }. Nothing
// here writes. What never leaves: password hashes, token versions, share tokens (only whether a
// world's link is on), image bytes and storage keys. Every row is built field by field, so a
// column selected by mistake still stays in the database.
const PAGE_SIZE = 50;
function paging(query) {
  const n = Number(query.page);
  const page = Number.isInteger(n) && n >= 1 && n <= 1e6 ? n : 1;
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  return { page, q, offset: (page - 1) * PAGE_SIZE };
}
const likeOf = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// One paged, searchable list: from (the tables), select, idCol (what "#12" finds), search (the
// columns q is looked for in), filters ({ query key: id column }), order, row (a row → what is sent)
async function list(req, res, { from, select, idCol, search, filters = {}, order, row }) {
  const { page, q, offset } = paging(req.query);
  const where = [], args = [];
  const arg = (v) => { args.push(v); return `$${args.length}`; };
  for (const [key, col] of Object.entries(filters)) {
    const v = req.query[key];
    if (v === undefined || v === '') continue;
    if (!isId(v)) return res.status(400).json({ message: `${key} must be an id` });
    where.push(`${col} = ${arg(Number(v))}`);
  }
  if (q) {
    const text = arg(likeOf(q));
    const id = /^#?(\d{1,9})$/.exec(q);
    where.push(`(${[...search.map((c) => `${c} ILIKE ${text}`), ...(id ? [`${idCol} = ${arg(Number(id[1]))}`] : [])].join(' OR ')})`);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await pool.query(`SELECT count(*)::int AS n FROM ${from} ${w}`, args)).rows[0].n;
  const rows = (await pool.query(
    `SELECT ${select} FROM ${from} ${w} ORDER BY ${typeof order === 'function' ? order(req.query) : order} LIMIT ${PAGE_SIZE} OFFSET ${offset}`, args)).rows;
  res.json({ items: rows.map((r) => row(r, req)), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), pageSize: PAGE_SIZE, q });
}
const inWorld = (query) => query.world !== undefined && query.world !== '';
const count = (table, col, of) => `(SELECT count(*)::int FROM ${table} x WHERE x.${col} = ${of})`;

// GET /api/admin/summary — how many of each there are, for the tabs
router.get('/summary', wrap(async (req, res) => {
  const tables = { users: 'users', worlds: 'worlds', maps: 'maps', nodes: 'nodes', eras: 'eras', images: 'images', messages: 'mind_messages', batches: 'forge_batches' };
  const r = (await pool.query(`SELECT ${Object.entries(tables).map(([k, t]) => `(SELECT count(*)::int FROM ${t}) AS ${k}`).join(', ')}`)).rows[0];
  res.json({ counts: Object.fromEntries(Object.keys(tables).map((k) => [k, r[k]])) });
}));

// GET /api/admin/users — every account, newest first
const userRow = (u) => ({
  id: u.id, username: u.username, email: u.email, centralUserId: u.central_user_id, isGuest: u.is_guest, isAdmin: isAdmin(u),
  createdAt: u.created_at, lastSeenAt: u.last_seen_at, worlds: u.worlds,
});
router.get('/users', wrap((req, res) => list(req, res, {
  from: 'users u',
  select: `u.id, u.username, u.email, u.central_user_id, u.is_guest, u.created_at, u.last_seen_at, ${count('worlds', 'created_by', 'u.id')} AS worlds`,
  idCol: 'u.id', search: ['u.username', 'u.email'], order: 'u.created_at DESC NULLS LAST, u.id DESC', row: userRow,
})));

// GET /api/admin/worlds — every world with its owner and sizes (?owner= an account id)
const WORLD_FROM = 'worlds w LEFT JOIN users u ON u.id = w.created_by';
const WORLD_SELECT = `w.id, w.name, w.description, w.created_at, w.updated_at, w.is_template, (w.share_token IS NOT NULL) AS shared,
  w.timeline_enabled, u.id AS owner_id, u.username AS owner, u.is_guest AS owner_guest,
  ${count('maps', 'world_id', 'w.id')} AS maps, ${count('nodes', 'world_id', 'w.id')} AS nodes, ${count('images', 'world_id', 'w.id')} AS images,
  ${count('eras', 'world_id', 'w.id')} AS eras, ${count('mind_messages', 'world_id', 'w.id')} AS messages`;
const worldRow = (w) => ({
  id: w.id, name: w.name, description: w.description, createdAt: w.created_at, updatedAt: w.updated_at,
  isTemplate: w.is_template, shared: !!w.shared, timelineOn: !!w.timeline_enabled,
  owner: w.owner_id ? { id: w.owner_id, username: w.owner, isGuest: w.owner_guest } : null,
  counts: { maps: w.maps, nodes: w.nodes, images: w.images, eras: w.eras, messages: w.messages },
});
router.get('/worlds', wrap((req, res) => list(req, res, {
  from: WORLD_FROM, select: WORLD_SELECT, idCol: 'w.id', search: ['w.name', 'w.description', 'u.username'],
  filters: { owner: 'w.created_by' }, order: 'w.updated_at DESC NULLS LAST, w.id DESC', row: worldRow,
})));

// GET /api/admin/maps — every map (?world=)
router.get('/maps', wrap((req, res) => list(req, res, {
  from: 'maps m JOIN worlds w ON w.id = m.world_id LEFT JOIN images i ON i.id = m.image_id LEFT JOIN nodes o ON o.id = m.owner_node_id',
  select: `m.id, m.title, m.view, m.world_id, w.name AS world, (w.root_map_id = m.id) AS is_root, o.title AS owner_title, i.file_path AS backdrop,
    ${count('placements', 'map_id', 'm.id')} AS placements, m.created_at, m.updated_at`,
  idCol: 'm.id', search: ['m.title', 'w.name', 'o.title'], filters: { world: 'm.world_id' },
  order: (q) => (inWorld(q) ? 'm.owner_node_id IS NULL DESC, m.title, m.id' : 'm.updated_at DESC NULLS LAST, m.id DESC'),
  row: (m, req) => ({
    id: m.id, title: m.title, view: m.view, worldId: m.world_id, world: m.world, isRoot: !!m.is_root, inside: m.owner_title,
    thumbUrl: resolveImageUrl(req, m.backdrop), placements: m.placements, createdAt: m.created_at, updatedAt: m.updated_at,
  }),
})));

// GET /api/admin/nodes — every entry (?world=); q looks in the title, the text and the DM note
router.get('/nodes', wrap((req, res) => list(req, res, {
  from: 'nodes n JOIN worlds w ON w.id = n.world_id',
  select: `n.id, n.title, n.category, n.visibility, n.author, left(n.body, 200) AS excerpt, n.interior_map_id, n.world_id, w.name AS world,
    ${count('placements', 'node_id', 'n.id')} AS placements, n.created_at, n.updated_at`,
  idCol: 'n.id', search: ['n.title', 'n.body', 'n.dm_note'], filters: { world: 'n.world_id' },
  order: (q) => (inWorld(q) ? 'n.title, n.id' : 'n.updated_at DESC NULLS LAST, n.id DESC'),
  row: (n) => ({
    id: n.id, title: n.title, category: n.category, visibility: n.visibility, author: n.author, excerpt: n.excerpt,
    interiorMapId: n.interior_map_id, worldId: n.world_id, world: n.world, placements: n.placements, createdAt: n.created_at, updatedAt: n.updated_at,
  }),
})));

// GET /api/admin/eras — every era (?world=); q looks in the name and the session notes too
router.get('/eras', wrap((req, res) => list(req, res, {
  from: 'eras e JOIN worlds w ON w.id = e.world_id',
  select: `e.id, e.name, e.start_time, e.end_time, e.player_visible, e.world_id, w.name AS world, w.timeline_time_unit AS unit,
    (COALESCE(e.prep_note, '') <> '') AS has_prep, (COALESCE(e.recap_note, '') <> '') AS has_recap, e.created_at`,
  idCol: 'e.id', search: ['e.name', 'w.name', 'e.prep_note', 'e.recap_note'], filters: { world: 'e.world_id' },
  order: (q) => (inWorld(q) ? 'e.start_time, e.id' : 'e.created_at DESC NULLS LAST, e.id DESC'),
  row: (e) => ({
    id: e.id, name: e.name, start: e.start_time, end: e.end_time, playerVisible: e.player_visible, worldId: e.world_id, world: e.world,
    unit: e.unit, hasPrep: e.has_prep, hasRecap: e.has_recap, createdAt: e.created_at,
  }),
})));

// GET /api/admin/images — every image (?world=): its URL, never its bytes
router.get('/images', wrap((req, res) => list(req, res, {
  from: 'images i LEFT JOIN worlds w ON w.id = i.world_id LEFT JOIN users u ON u.id = i.uploaded_by',
  select: `i.id, i.filename, i.original_name, i.file_path, i.file_size, i.mime_type, i.alt_text, i.world_id, w.name AS world,
    u.username AS uploader, i.created_at`,
  idCol: 'i.id', search: ['i.original_name', 'i.filename', 'i.alt_text', 'w.name'], filters: { world: 'i.world_id' },
  order: 'i.created_at DESC NULLS LAST, i.id DESC',
  row: (i, req) => ({
    id: i.id, name: i.original_name, filename: i.filename, url: resolveImageUrl(req, i.file_path), size: i.file_size, mime: i.mime_type,
    alt: i.alt_text, worldId: i.world_id, world: i.world, uploader: i.uploader, createdAt: i.created_at,
  }),
})));

// GET /api/admin/forge/messages — the Forge conversations, newest first (?world=)
router.get('/forge/messages', wrap((req, res) => list(req, res, {
  from: 'mind_messages mm JOIN worlds w ON w.id = mm.world_id',
  select: 'mm.id, mm.role, mm.content, mm.batch_id, mm.world_id, w.name AS world, mm.created_at',
  idCol: 'mm.id', search: ['mm.content', 'w.name'], filters: { world: 'mm.world_id' }, order: 'mm.id DESC',
  row: (m) => ({ id: m.id, role: m.role, content: m.content, batchId: m.batch_id, worldId: m.world_id, world: m.world, createdAt: m.created_at }),
})));

// GET /api/admin/forge/batches — what the Forge proposed and how each settled (?world=)
const madeCounts = (created) => Object.fromEntries(Object.entries(created || {})
  .filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => [k, v.length]));
router.get('/forge/batches', wrap((req, res) => list(req, res, {
  from: 'forge_batches b JOIN worlds w ON w.id = b.world_id',
  select: 'b.id, b.summary, b.status, b.created, jsonb_array_length(b.asks) AS asks, b.asks_state, b.world_id, w.name AS world, b.created_at',
  idCol: 'b.id', search: ['b.summary', 'w.name'], filters: { world: 'b.world_id' }, order: 'b.id DESC',
  row: (b) => ({
    id: b.id, summary: b.summary, status: b.status, made: madeCounts(b.created), asks: b.asks, asksState: b.asks_state,
    worldId: b.world_id, world: b.world, createdAt: b.created_at,
  }),
})));

// GET /api/admin/worlds/:worldId — one world, read-only: its clock, eras with their session notes
// (as plain text), its maps and its Forge mind
router.get('/worlds/:worldId', wrap(async (req, res) => {
  const id = Number(req.params.worldId);
  const w = (await pool.query(`SELECT ${WORLD_SELECT}, w.root_map_id, w.spotlight_node_id, w.timeline_min_time, w.timeline_max_time,
      w.timeline_current_time, w.timeline_time_unit, ${count('forge_batches', 'world_id', 'w.id')} AS batches
    FROM ${WORLD_FROM} WHERE w.id = $1`, [id])).rows[0];
  if (!w) return res.status(404).json({ message: 'World not found' });
  const eras = (await pool.query(
    'SELECT id, name, start_time, end_time, player_visible, prep_note, recap_note FROM eras WHERE world_id = $1 ORDER BY start_time, id', [id])).rows;
  const maps = (await pool.query(`
    SELECT m.id, m.title, m.view, m.owner_node_id, o.title AS owner_title, m.is_main, i.file_path AS backdrop, ${count('placements', 'map_id', 'm.id')} AS placements
    FROM maps m LEFT JOIN images i ON i.id = m.image_id LEFT JOIN nodes o ON o.id = m.owner_node_id
    WHERE m.world_id = $1 ORDER BY m.owner_node_id IS NULL DESC, m.is_main DESC, m.title, m.id`, [id])).rows;
  const mind = (await pool.query(`SELECT m.lore, m.art_style, m.bible, m.gen_size, i.file_path AS style_image
    FROM world_minds m LEFT JOIN images i ON i.id = m.style_image_id WHERE m.world_id = $1`, [id])).rows[0];
  res.json({ world: {
    ...worldRow(w), rootMapId: w.root_map_id, spotlightNodeId: w.spotlight_node_id,
    timeline: { enabled: !!w.timeline_enabled, min: w.timeline_min_time, max: w.timeline_max_time, current: w.timeline_current_time, unit: w.timeline_time_unit },
    counts: { maps: w.maps, nodes: w.nodes, images: w.images, eras: w.eras, messages: w.messages, batches: w.batches },
    eras: eras.map((e) => ({ id: e.id, name: e.name, start: e.start_time, end: e.end_time, playerVisible: e.player_visible,
      prepNote: noteText(e.prep_note), recapNote: noteText(e.recap_note) })),
    maps: maps.map((m) => ({ id: m.id, title: m.title, view: m.view, isRoot: m.id === w.root_map_id, isMain: m.is_main,
      ownerNodeId: m.owner_node_id, inside: m.owner_title, placements: m.placements, thumbUrl: resolveImageUrl(req, m.backdrop) })),
    mind: mind ? { lore: mind.lore, artStyle: mind.art_style, bible: mind.bible, genSize: mind.gen_size, styleImageUrl: resolveImageUrl(req, mind.style_image) } : null,
  } });
}));

// GET /api/admin/maps/:mapId — one map as its DM sees it: every placement, whatever its time or
// visibility, its timed backdrops and its notes
router.get('/maps/:mapId', wrap(async (req, res) => {
  const id = Number(req.params.mapId);
  const m = (await pool.query(`
    SELECT m.id, m.title, m.view, m.world_id, w.name AS world, (w.root_map_id = m.id) AS is_root, m.owner_node_id, o.title AS owner_title,
      m.dm_note, m.focus_start, m.focus_end, m.ambience_url, i.file_path AS backdrop
    FROM maps m JOIN worlds w ON w.id = m.world_id LEFT JOIN images i ON i.id = m.image_id LEFT JOIN nodes o ON o.id = m.owner_node_id
    WHERE m.id = $1`, [id])).rows[0];
  if (!m) return res.status(404).json({ message: 'Map not found' });
  const pl = (await pool.query(`
    SELECT p.id, p.x, p.y, p.start_time, p.end_time, p.visibility AS placement_vis, (p.shape IS NOT NULL) AS outlined,
      n.id AS node_id, n.title, n.category, n.visibility AS node_vis, n.pin, n.pin_size, n.author, n.interior_map_id, ni.file_path AS node_image
    FROM placements p JOIN nodes n ON n.id = p.node_id LEFT JOIN images ni ON ni.id = n.image_id
    WHERE p.map_id = $1 ORDER BY p.id`, [id])).rows;
  const bds = (await pool.query(`SELECT b.id, b.start_time, b.end_time, i.file_path FROM map_backdrops b JOIN images i ON i.id = b.image_id
    WHERE b.map_id = $1 ORDER BY b.start_time NULLS FIRST, b.id`, [id])).rows;
  res.json({
    map: { id: m.id, title: m.title, view: m.view, worldId: m.world_id, world: m.world, isRoot: !!m.is_root, ownerNodeId: m.owner_node_id,
      inside: m.owner_title, dmNote: m.dm_note, focusStart: m.focus_start, focusEnd: m.focus_end, ambienceUrl: m.ambience_url,
      backdropUrl: resolveImageUrl(req, m.backdrop) },
    backdrops: bds.map((b) => ({ id: b.id, start: b.start_time, end: b.end_time, url: resolveImageUrl(req, b.file_path) })),
    placements: pl.map((p) => ({
      id: p.id, x: Number(p.x), y: Number(p.y), start: p.start_time, end: p.end_time, visibility: p.placement_vis, outlined: p.outlined,
      node: { id: p.node_id, title: p.title, category: p.category, visibility: p.node_vis, pin: p.pin, pinSize: p.pin_size, author: p.author,
        hasInterior: !!p.interior_map_id, interiorMapId: p.interior_map_id, imageUrl: resolveImageUrl(req, p.node_image) },
    })),
  });
}));

// GET /api/admin/nodes/:id — one entry whole: its text, DM note, timed facts, links and placements
router.get('/nodes/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const n = (await pool.query(`
    SELECT n.id, n.title, n.category, n.visibility, n.body, n.dm_note, n.stance, n.author, n.pin, n.interior_map_id, n.voice_name, n.voice_line,
      n.voice_url, n.world_id, w.name AS world, ni.file_path AS image, n.created_at, n.updated_at
    FROM nodes n JOIN worlds w ON w.id = n.world_id LEFT JOIN images ni ON ni.id = n.image_id WHERE n.id = $1`, [id])).rows[0];
  if (!n) return res.status(404).json({ message: 'Entry not found' });
  const facts = (await pool.query('SELECT id, body, start_time, end_time FROM node_facts WHERE node_id = $1 ORDER BY start_time NULLS FIRST, id', [id])).rows;
  const links = (await pool.query(`
    SELECT l.id, l.label, o.id AS other_id, o.title AS other_title
    FROM links l JOIN nodes o ON o.id = CASE WHEN l.from_node_id = $1 THEN l.to_node_id ELSE l.from_node_id END
    WHERE l.from_node_id = $1 OR l.to_node_id = $1 ORDER BY l.id`, [id])).rows;
  const placed = (await pool.query(`
    SELECT p.id, p.map_id, m.title AS map_title, p.x, p.y, p.start_time, p.end_time, p.visibility
    FROM placements p JOIN maps m ON m.id = p.map_id WHERE p.node_id = $1 ORDER BY p.start_time NULLS FIRST, p.id`, [id])).rows;
  res.json({ node: {
    id: n.id, title: n.title, category: n.category, visibility: n.visibility, body: n.body, dmNote: n.dm_note, stance: n.stance,
    author: n.author, pin: n.pin, interiorMapId: n.interior_map_id, voiceName: n.voice_name, voiceLine: n.voice_line, voiceUrl: n.voice_url,
    worldId: n.world_id, world: n.world, imageUrl: resolveImageUrl(req, n.image), createdAt: n.created_at, updatedAt: n.updated_at,
    facts: facts.map((f) => ({ id: f.id, body: f.body, start: f.start_time, end: f.end_time })),
    links: links.map((l) => ({ id: l.id, label: l.label, nodeId: l.other_id, title: l.other_title })),
    placements: placed.map((p) => ({ id: p.id, mapId: p.map_id, map: p.map_title, x: Number(p.x), y: Number(p.y), start: p.start_time,
      end: p.end_time, visibility: p.visibility })),
  } });
}));

module.exports = router;
