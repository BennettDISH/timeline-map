const express = require('express');
const pool = require('../config/database');
const { resolveImageUrl } = require('../utils/imageUrl');
const router = express.Router();

// The public Player View API (UX-REDESIGN Phase 4's "shareable link"). No auth — the token in
// the URL is the capability, minted and revoked by the world owner in the Atlas Share popover.
// Everything is filtered SERVER-SIDE: DM-only nodes and placements never leave the database,
// and while the timeline is enabled neither does anything outside the current moment. The
// DM-side "Player" toggle is just a preview of what these routes actually enforce.

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => { console.error('share error:', err); res.status(500).json({ message: 'Server error' }); });

const notFound = (res) => res.status(404).json({ message: 'Not found' });

async function worldOf(token) {
  if (!token || token.length < 10) return null;
  const r = await pool.query(
    `SELECT id, name, root_map_id, timeline_enabled, timeline_current_time, timeline_time_unit
     FROM worlds WHERE share_token = $1 AND is_active = true`, [token]);
  return r.rows[0] || null;
}

// The moment players see. Default: the canon moment (the world clock). A ?t= request is
// honored ONLY when it is ≤ canon AND falls inside a player_visible era — the DM decides
// which stretches of the past are open; the future never leaves the database.
async function allowedTime(w, tRaw) {
  if (!w.timeline_enabled) return null;
  const canon = w.timeline_current_time;
  const t = parseInt(tRaw, 10);
  if (!Number.isFinite(t) || t >= canon) return canon;
  const r = await pool.query(
    'SELECT 1 FROM eras WHERE world_id=$1 AND player_visible AND start_time <= $2 AND end_time >= $2 LIMIT 1',
    [w.id, t]);
  return r.rows.length ? t : canon;
}

// Presence filter fragment — a placement exists now if its lifespan is unbounded or spans $N.
// ($N::int IS NULL collapses the whole clause when the timeline is off.)
const PRESENT = (n) =>
  `($${n}::int IS NULL OR ((p.start_time IS NULL OR p.start_time <= $${n}) AND (p.end_time IS NULL OR p.end_time >= $${n})))`;

// Walk a map up its owner chain to the world root. Returns the breadcrumb (root → here) when
// every step is player-visible RIGHT NOW, else null. This is what makes deep links safe: a map
// inside a hidden or not-yet-existing branch is unreachable no matter how you got its id.
async function walkUp(mapId, w, t) {
  const chain = []; let mid = mapId; const seen = new Set();
  while (true) {
    if (!mid || seen.has(mid)) return null;
    seen.add(mid);
    const m = (await pool.query(
      'SELECT id, title, world_id, owner_node_id FROM maps WHERE id = $1 AND is_active = true', [mid])).rows[0];
    if (!m || m.world_id !== w.id) return null;
    chain.unshift({ mapId: m.id, title: m.title });
    if (!m.owner_node_id) return m.id === w.root_map_id ? chain : null;
    const owner = (await pool.query('SELECT visibility FROM nodes WHERE id = $1', [m.owner_node_id])).rows[0];
    if (!owner || owner.visibility === 'dm') return null;
    const up = (await pool.query(
      `SELECT p.map_id FROM placements p
       WHERE p.node_id = $1 AND p.visibility != 'dm' AND ${PRESENT(2)}
       ORDER BY p.id LIMIT 1`, [m.owner_node_id, t])).rows[0];
    if (!up) return null;
    mid = up.map_id;
  }
}

// GET /:token/world — name, where to start, and what time it is. No min/max: players don't scrub.
router.get('/:token/world', wrap(async (req, res) => {
  const w = await worldOf(req.params.token);
  if (!w) return notFound(res);
  let eras = [];
  if (w.timeline_enabled) {
    eras = (await pool.query(
      `SELECT id, name, start_time, end_time FROM eras
       WHERE world_id = $1 AND player_visible AND start_time <= $2 ORDER BY start_time, id`,
      [w.id, w.timeline_current_time])).rows
      .map((e) => ({ id: e.id, name: e.name, start: e.start_time, end: Math.min(e.end_time, w.timeline_current_time) }));
  }
  res.json({ world: {
    name: w.name, rootMapId: w.root_map_id,
    timeline: { enabled: w.timeline_enabled, current: w.timeline_current_time, unit: w.timeline_time_unit },
    eras,
  } });
}));

// GET /:token/maps/:mapId — the filtered canvas: visible present placements, links among them.
router.get('/:token/maps/:mapId', wrap(async (req, res) => {
  const w = await worldOf(req.params.token);
  if (!w) return notFound(res);
  const t = await allowedTime(w, req.query.t);
  const breadcrumb = await walkUp(Number(req.params.mapId), w, t);
  if (!breadcrumb) return notFound(res);

  const map = (await pool.query(
    'SELECT m.id, m.title, m.view, i.file_path AS backdrop_path FROM maps m LEFT JOIN images i ON m.image_id = i.id WHERE m.id = $1',
    [req.params.mapId])).rows[0];
  if (w.timeline_enabled) {
    // history may have redrawn this map: the latest-starting timed backdrop covering the
    // allowed moment wins; none covering it keeps the base art
    const bd = (await pool.query(
      `SELECT i.file_path FROM map_backdrops b JOIN images i ON i.id = b.image_id
       WHERE b.map_id = $1 AND (b.start_time IS NULL OR b.start_time <= $2)
         AND (b.end_time IS NULL OR b.end_time >= $2)
       ORDER BY b.start_time DESC NULLS LAST, b.id DESC LIMIT 1`, [req.params.mapId, t])).rows[0];
    if (bd) map.backdrop_path = bd.file_path;
  }

  const rows = (await pool.query(
    `SELECT p.id AS placement_id, p.x, p.y,
            n.id AS node_id, n.title, n.category, n.interior_map_id, n.pin,
            i.file_path AS node_image_path
     FROM placements p
     JOIN nodes n ON p.node_id = n.id
     LEFT JOIN images i ON n.image_id = i.id
     WHERE p.map_id = $1 AND p.visibility != 'dm' AND n.visibility != 'dm' AND ${PRESENT(2)}
     ORDER BY p.id`, [req.params.mapId, t])).rows;

  const placements = rows.map((r) => ({
    id: r.placement_id, x: Number(r.x), y: Number(r.y),
    node: { id: r.node_id, title: r.title, category: r.category, pin: r.pin,
            hasInterior: !!r.interior_map_id, interiorMapId: r.interior_map_id,
            imageUrl: resolveImageUrl(req, r.node_image_path) },
  }));

  const nodeIds = placements.map((p) => p.node.id);
  let links = [];
  if (nodeIds.length) {
    links = (await pool.query(
      `SELECT id, from_node_id, to_node_id, kind, label
       FROM links WHERE from_node_id = ANY($1::int[]) AND to_node_id = ANY($1::int[])`, [nodeIds])).rows
      .map((l) => ({ id: l.id, from: l.from_node_id, to: l.to_node_id, kind: l.kind, label: l.label }));
  }

  res.json({
    map: { id: map.id, title: map.title, view: map.view, backdropUrl: resolveImageUrl(req, map.backdrop_path) },
    placements, links, breadcrumb,
  });
}));

// GET /:token/nodes/:id — the inspector, links pruned to what the player may know exists.
router.get('/:token/nodes/:id', wrap(async (req, res) => {
  const w = await worldOf(req.params.token);
  if (!w) return notFound(res);
  const t = await allowedTime(w, req.query.t);
  const n = (await pool.query(
    `SELECT n.id, n.title, n.body, n.category, n.interior_map_id, i.file_path AS img
     FROM nodes n LEFT JOIN images i ON n.image_id = i.id
     WHERE n.id = $1 AND n.world_id = $2 AND n.visibility != 'dm'`, [req.params.id, w.id])).rows[0];
  if (!n) return notFound(res);
  if (w.timeline_enabled) {
    // the story as it reads AT the allowed moment; other eras' text stays home
    const fact = (await pool.query(
      `SELECT body FROM node_facts
       WHERE node_id = $1 AND (start_time IS NULL OR start_time <= $2)
         AND (end_time IS NULL OR end_time >= $2)
       ORDER BY start_time DESC NULLS LAST, id DESC LIMIT 1`, [n.id, t])).rows[0];
    if (fact) n.body = fact.body;
  }

  const linkSql = (dir) => `
    SELECT l.id, l.kind, l.label, l.${dir === 'out' ? 'to' : 'from'}_node_id AS other, n2.title, n2.category AS other_cat
    FROM links l JOIN nodes n2 ON l.${dir === 'out' ? 'to' : 'from'}_node_id = n2.id
    WHERE l.${dir === 'out' ? 'from' : 'to'}_node_id = $1 AND n2.visibility != 'dm'`;
  const out = (await pool.query(linkSql('out'), [n.id])).rows;
  const back = (await pool.query(linkSql('in'), [n.id])).rows;
  const shape = (l, dir) => ({ id: l.id, dir, kind: l.kind, label: l.label, otherId: l.other, otherTitle: l.title, otherCategory: l.other_cat });

  res.json({
    node: { id: n.id, title: n.title, body: n.body, category: n.category,
            hasInterior: !!n.interior_map_id, interiorMapId: n.interior_map_id,
            imageUrl: resolveImageUrl(req, n.img) },
    links: out.map((l) => shape(l, 'out')), backlinks: back.map((l) => shape(l, 'in')),
  });
}));

// GET /:token/nodes/:id/locate — where "go there" goes: the node's interior, else the first
// visible present placement. 404 when the node exists nowhere the player can see right now.
router.get('/:token/nodes/:id/locate', wrap(async (req, res) => {
  const w = await worldOf(req.params.token);
  if (!w) return notFound(res);
  const t = await allowedTime(w, req.query.t);
  const n = (await pool.query(
    `SELECT interior_map_id FROM nodes WHERE id = $1 AND world_id = $2 AND visibility != 'dm'`,
    [req.params.id, w.id])).rows[0];
  if (!n) return notFound(res);
  if (n.interior_map_id && (await walkUp(n.interior_map_id, w, t))) return res.json({ mapId: n.interior_map_id });
  const p = (await pool.query(
    `SELECT p.map_id FROM placements p
     WHERE p.node_id = $1 AND p.visibility != 'dm' AND ${PRESENT(2)}
     ORDER BY p.id LIMIT 1`, [req.params.id, t])).rows[0];
  if (p && (await walkUp(p.map_id, w, t))) return res.json({ mapId: p.map_id });
  return notFound(res);
}));

module.exports = router;
