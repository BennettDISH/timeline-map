// The generation contract: the ONLY doorway from the mind's imagination into the world's
// tables. The mind proposes a batch (plain JSON); validateBatch normalizes and rejects
// anything structurally unsound; applyBatch paints the images (Nano Banana), uploads them,
// and lands every row in one transaction — recorded in forge_batches so the whole
// generation can be discarded as a unit. Everything generated is born DM-only: the mind
// never decides what players see, the DM reveals per node exactly as with hand-made work.

const crypto = require('crypto');
const pool = require('../config/database');
const { r2Enabled, putObject, deleteObject } = require('./../storage');
const { generateImage } = require('./gemini');

const CATS = ['note', 'place', 'person', 'item', 'lore', 'event'];
const CAPS = { images: 4, maps: 8, nodes: 40, links: 60, eras: 8, backdrops: 10, enrich: 20, placements: 80, factsPerNode: 12, placementsPerNode: 6 };

const s = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// ---- validation ------------------------------------------------------------------
// Normalizes the batch IN PLACE (clamps coords/times, defaults, trims) and returns a list
// of human-readable errors. Structural problems (missing keys, dangling refs, blown caps)
// are errors; out-of-range values are clamped, because a mind that put a city at x=104
// meant "far right", not "reject my whole batch".
function validateBatch(batch, world) {
  const errs = [];
  if (!batch || typeof batch !== 'object') return ['batch must be an object'];
  for (const k of ['images', 'maps', 'nodes', 'links', 'eras', 'backdrops', 'enrich']) {
    if (batch[k] == null) batch[k] = [];
    if (!Array.isArray(batch[k])) { errs.push(`${k} must be an array`); batch[k] = []; }
  }
  batch.summary = s(batch.summary, 300) || 'A generation';

  const min = world?.timeline_min_time ?? -1000000, max = world?.timeline_max_time ?? 1000000;
  const clampT = (v) => { const n = num(v); return n == null ? null : Math.max(min, Math.min(max, Math.round(n))); };

  for (const [k, cap] of Object.entries({ images: CAPS.images, maps: CAPS.maps, nodes: CAPS.nodes, links: CAPS.links, eras: CAPS.eras, backdrops: CAPS.backdrops, enrich: CAPS.enrich }))
    if (batch[k].length > cap) errs.push(`too many ${k} (${batch[k].length} > ${cap})`);

  const imgKeys = new Set(), mapKeys = new Set(), nodeKeys = new Set();
  for (const im of batch.images) {
    im.key = s(im.key, 60);
    if (!im.key || imgKeys.has(im.key)) errs.push(`image needs a unique key ("${im.key}")`);
    imgKeys.add(im.key);
    im.name = s(im.name, 120) || im.key;
    im.kind = im.kind === 'backdrop' ? 'backdrop' : 'art';
    im.prompt = s(im.prompt, 1200);
    if (!im.prompt) errs.push(`image "${im.key}" needs a prompt`);
  }
  for (const n of batch.nodes) {
    n.key = s(n.key, 60);
    if (!n.key || nodeKeys.has(n.key)) errs.push(`node needs a unique key ("${n.key}")`);
    nodeKeys.add(n.key);
    n.title = s(n.title, 255);
    if (!n.title) errs.push(`node "${n.key}" needs a title`);
    n.body = s(n.body, 4000) || null;
    n.category = CATS.includes(n.category) ? n.category : 'note';
    n.pin = n.pin === 'image' ? 'image' : 'chip';
    n.pin_size = Math.max(24, Math.min(256, num(n.pin_size) ?? 64));
    if (n.image != null && !imgKeys.has(n.image)) { errs.push(`node "${n.key}" references unknown image "${n.image}"`); n.image = null; }
    if (n.pin === 'image' && n.image == null) n.pin = 'chip';
    n.placements = Array.isArray(n.placements) ? n.placements.slice(0, CAPS.placementsPerNode) : [];
    for (const p of n.placements) {
      p.x = Math.max(0, Math.min(100, num(p.x) ?? 50));
      p.y = Math.max(0, Math.min(100, num(p.y) ?? 50));
      p.start = clampT(p.start); p.end = clampT(p.end);
      if (p.start != null && p.end != null && p.start > p.end) [p.start, p.end] = [p.end, p.start];
    }
    n.facts = Array.isArray(n.facts) ? n.facts.slice(0, CAPS.factsPerNode) : [];
    for (const f of n.facts) {
      f.body = s(f.body, 2000);
      if (!f.body) errs.push(`a fact on "${n.key}" is empty`);
      f.start = clampT(f.start); f.end = clampT(f.end);
      if (f.start != null && f.end != null && f.start > f.end) [f.start, f.end] = [f.end, f.start];
    }
  }
  // enrich: additive touches on EXISTING nodes — facts, placements, and a body that only
  // ever fills an empty one (the mind never overwrites the DM's words).
  for (const en of batch.enrich) {
    if (typeof en.node !== 'number' || !Number.isInteger(en.node)) errs.push('an enrich entry needs an existing node\'s numeric id');
    en.body = s(en.body, 4000) || null;
    en.facts = Array.isArray(en.facts) ? en.facts.slice(0, CAPS.factsPerNode) : [];
    for (const f of en.facts) {
      f.body = s(f.body, 2000);
      if (!f.body) errs.push(`a fact enriching node ${en.node} is empty`);
      f.start = clampT(f.start); f.end = clampT(f.end);
      if (f.start != null && f.end != null && f.start > f.end) [f.start, f.end] = [f.end, f.start];
    }
    en.place = Array.isArray(en.place) ? en.place.slice(0, CAPS.placementsPerNode) : [];
    for (const p of en.place) {
      p.x = Math.max(0, Math.min(100, num(p.x) ?? 50));
      p.y = Math.max(0, Math.min(100, num(p.y) ?? 50));
      p.start = clampT(p.start); p.end = clampT(p.end);
      if (p.start != null && p.end != null && p.start > p.end) [p.start, p.end] = [p.end, p.start];
    }
  }

  const nodeRef = (v) => (typeof v === 'number' && Number.isInteger(v)) || nodeKeys.has(v);
  const mapRef = (v) => (typeof v === 'number' && Number.isInteger(v)) || mapKeys.has(v);
  const owners = new Set();
  for (const m of batch.maps) {
    if (m.owner != null && owners.has(m.owner)) errs.push(`two maps claim the same owner ("${m.owner}") — a node has ONE interior`);
    owners.add(m.owner);
    m.key = s(m.key, 60);
    if (!m.key || mapKeys.has(m.key)) errs.push(`map needs a unique key ("${m.key}")`);
    mapKeys.add(m.key);
    m.title = s(m.title, 255);
    if (!m.title) errs.push(`map "${m.key}" needs a title`);
    m.view = m.view === 'list' ? 'list' : 'map';
    if (!nodeRef(m.owner)) errs.push(`map "${m.key}" needs an owner — the node it is the interior of (a new node's key or an existing node's numeric id)`);
    if (m.backdrop != null && !imgKeys.has(m.backdrop)) { errs.push(`map "${m.key}" references unknown image "${m.backdrop}"`); m.backdrop = null; }
    m.focus_start = clampT(m.focus_start); m.focus_end = clampT(m.focus_end);
  }
  // placements were parsed before mapKeys existed; check their map refs now
  let totalPlacements = 0;
  for (const n of batch.nodes) {
    totalPlacements += n.placements.length;
    for (const p of n.placements)
      if (!mapRef(p.map)) errs.push(`a placement of "${n.key}" references unknown map "${p.map}"`);
  }
  for (const en of batch.enrich) {
    totalPlacements += en.place.length;
    for (const p of en.place)
      if (!mapRef(p.map)) errs.push(`a placement enriching node ${en.node} references unknown map "${p.map}"`);
  }
  if (totalPlacements > CAPS.placements) errs.push(`too many placements (${totalPlacements} > ${CAPS.placements})`);
  for (const l of batch.links) {
    if (!nodeRef(l.from) || !nodeRef(l.to)) errs.push('a link references an unknown node');
    if (l.from === l.to) errs.push('a link points at itself');
    l.label = s(l.label, 255) || null;
  }
  for (const e of batch.eras) {
    e.name = s(e.name, 120);
    if (!e.name) errs.push('an era needs a name');
    e.start = clampT(e.start) ?? min; e.end = clampT(e.end) ?? max;
    if (e.start > e.end) [e.start, e.end] = [e.end, e.start];
  }
  for (const b of batch.backdrops) {
    if (!mapRef(b.map)) errs.push(`a timed backdrop references unknown map "${b.map}"`);
    if (!imgKeys.has(b.image)) errs.push(`a timed backdrop references unknown image "${b.image}"`);
    b.start = clampT(b.start);
    if (b.start == null) errs.push('a timed backdrop needs a start time');
    b.end = clampT(b.end);
  }
  return errs;
}

// ---- images ----------------------------------------------------------------------

// The style anchor: the world's first painted image, sent as a reference with every later
// generation so the artwork stays one hand. Bytes come from R2 (or legacy base64 rows).
async function loadAnchor(worldId) {
  try {
    const r = await pool.query(
      `SELECT i.mime_type, i.base64_data, i.file_path FROM world_minds wm
       JOIN images i ON i.id = wm.style_image_id WHERE wm.world_id=$1`, [worldId]);
    const row = r.rows[0];
    if (!row) return null;
    if (row.base64_data) {
      const m = row.base64_data.match(/^data:image\/[^;]+;base64,(.+)$/);
      if (m) return { mimeType: row.mime_type || 'image/png', data: m[1] };
    }
    if (/^https?:\/\//i.test(row.file_path || '')) {
      const res = await fetch(row.file_path, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 8 * 1024 * 1024) return null;
      return { mimeType: row.mime_type || 'image/png', data: buf.toString('base64') };
    }
  } catch (e) { console.error('forge anchor load failed (continuing without):', e.message); }
  return null;
}

// Paint one image and store it through the same pipeline hand uploads use (R2 when
// configured, base64-in-Postgres otherwise). Returns the images row (+ url).
// If this world has no style anchor yet, the first painting becomes it.
async function paintAndStore({ worldId, userId, kind, prompt, artStyle, name }) {
  const anchor = await loadAnchor(worldId);
  const style = (artStyle || '').trim();
  const full = [
    style && `ART STYLE (obey exactly): ${style}`,
    anchor && 'Match the artistic style, palette, and rendering technique of the reference image exactly. Do not copy its content.',
    kind === 'backdrop'
      ? `Paint a top-down fantasy map backdrop, no text or labels anywhere in the image: ${prompt}`
      : `Paint a single subject on a clean dark background, suitable as a map token, no text: ${prompt}`,
  ].filter(Boolean).join('\n\n');
  const img = await generateImage({ prompt: full, refs: anchor ? [anchor] : [], aspect: kind === 'backdrop' ? '16:9' : '1:1' });

  const ext = (img.mimeType.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const filename = `forge-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const buffer = Buffer.from(img.data, 'base64');
  let filePath = `/api/images-base64/serve/${filename}`, storageKey = null, base64ToStore = `data:${img.mimeType};base64,${img.data}`;
  if (r2Enabled) {
    storageKey = `worlds/${worldId}/${filename}`;
    filePath = await putObject(storageKey, buffer, img.mimeType);
    base64ToStore = null;
  }
  const row = (await pool.query(
    `INSERT INTO images (filename, original_name, file_path, file_size, mime_type, world_id, uploaded_by, alt_text, base64_data, storage_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, file_path`,
    [filename, name || filename, filePath, buffer.length, img.mimeType, worldId, userId, 'Painted by the Forge', base64ToStore, storageKey])).rows[0];
  await pool.query(
    `UPDATE world_minds SET style_image_id=$1, updated_at=CURRENT_TIMESTAMP WHERE world_id=$2 AND style_image_id IS NULL`,
    [row.id, worldId]);
  return { id: row.id, url: row.file_path, storageKey };
}

// ---- apply -----------------------------------------------------------------------

// Land a validated batch. Images are painted and uploaded FIRST (outside the transaction —
// they're slow and external); every DB row then lands in one transaction. On failure the
// just-created image rows/objects are cleaned up. Returns { batchId, counts }.
async function applyBatch({ worldId, userId, batch, artStyle }) {
  // Existing-id references must belong to THIS world (the mind only ever sees its own
  // digest, but the contract doesn't trust the mind).
  const wantNodes = new Set(), wantMaps = new Set();
  for (const m of batch.maps) if (typeof m.owner === 'number') wantNodes.add(m.owner);
  for (const l of batch.links) { if (typeof l.from === 'number') wantNodes.add(l.from); if (typeof l.to === 'number') wantNodes.add(l.to); }
  for (const n of batch.nodes) for (const p of n.placements) if (typeof p.map === 'number') wantMaps.add(p.map);
  for (const b of batch.backdrops) if (typeof b.map === 'number') wantMaps.add(b.map);
  for (const en of batch.enrich) {
    wantNodes.add(en.node);
    for (const p of en.place) if (typeof p.map === 'number') wantMaps.add(p.map);
  }
  if (wantNodes.size) {
    const r = await pool.query('SELECT id, interior_map_id FROM nodes WHERE id = ANY($1) AND world_id=$2', [[...wantNodes], worldId]);
    if (r.rows.length !== wantNodes.size) throw new Error('the batch references nodes that are not in this world');
    const interiors = new Map(r.rows.map((x) => [x.id, x.interior_map_id]));
    for (const m of batch.maps)
      if (typeof m.owner === 'number' && interiors.get(m.owner) != null)
        throw new Error(`node ${m.owner} already has an interior — it cannot get a second one`);
  }
  if (wantMaps.size) {
    const r = await pool.query('SELECT id FROM maps WHERE id = ANY($1) AND world_id=$2', [[...wantMaps], worldId]);
    if (r.rows.length !== wantMaps.size) throw new Error('the batch references maps that are not in this world');
  }

  // Paint. Sequential, not parallel — each painting after the first can only match the
  // anchor once the anchor exists, and the anchor is the first painting.
  const images = new Map(); // key -> { id, url, storageKey }
  const created = { images: [], nodes: [], maps: [], placements: [], links: [], eras: [], backdrops: [], facts: [], enrichedBodies: [] };
  try {
    for (const im of batch.images) {
      const stored = await paintAndStore({ worldId, userId, kind: im.kind, prompt: im.prompt, artStyle, name: im.name });
      images.set(im.key, stored);
      created.images.push(stored.id);
    }
  } catch (e) {
    await cleanupImages(created.images, images);
    throw new Error(`painting failed: ${e.message}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nodeIds = new Map(); // key -> id
    for (const n of batch.nodes) {
      const r = await client.query(
        `INSERT INTO nodes (world_id, title, body, category, image_id, pin, pin_size, visibility, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'dm',$8) RETURNING id`,
        [worldId, n.title, n.body, n.category, n.image != null ? images.get(n.image).id : null, n.pin, n.pin_size, userId]);
      nodeIds.set(n.key, r.rows[0].id);
      created.nodes.push(r.rows[0].id);
    }
    const mapIds = new Map();
    for (const m of batch.maps) {
      const ownerId = typeof m.owner === 'number' ? m.owner : nodeIds.get(m.owner);
      const r = await client.query(
        `INSERT INTO maps (world_id, title, view, image_id, owner_node_id, focus_start, focus_end, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [worldId, m.title, m.view, m.backdrop != null ? images.get(m.backdrop).id : null, ownerId, m.focus_start, m.focus_end, userId]);
      mapIds.set(m.key, r.rows[0].id);
      created.maps.push(r.rows[0].id);
      await client.query('UPDATE nodes SET interior_map_id=$1 WHERE id=$2', [r.rows[0].id, ownerId]);
    }
    for (const n of batch.nodes) {
      const nid = nodeIds.get(n.key);
      for (const p of n.placements) {
        const mid = typeof p.map === 'number' ? p.map : mapIds.get(p.map);
        const r = await client.query(
          `INSERT INTO placements (node_id, map_id, x, y, start_time, end_time, visibility)
           VALUES ($1,$2,$3,$4,$5,$6,'dm') RETURNING id`, [nid, mid, p.x, p.y, p.start, p.end]);
        created.placements.push(r.rows[0].id);
      }
      for (const f of n.facts) {
        const r = await client.query(
          `INSERT INTO node_facts (node_id, body, start_time, end_time) VALUES ($1,$2,$3,$4) RETURNING id`,
          [nid, f.body, f.start, f.end]);
        created.facts.push(r.rows[0].id);
      }
    }
    for (const en of batch.enrich) {
      if (en.body) {
        // only ever fills an EMPTY body; RETURNING tells us whether it actually landed,
        // so unmake can null exactly those (and nothing the DM wrote)
        const r = await client.query(
          `UPDATE nodes SET body=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND (body IS NULL OR body='') RETURNING id`,
          [en.body, en.node]);
        if (r.rows.length) created.enrichedBodies.push(en.node);
      }
      for (const f of en.facts) {
        const r = await client.query(
          `INSERT INTO node_facts (node_id, body, start_time, end_time) VALUES ($1,$2,$3,$4) RETURNING id`,
          [en.node, f.body, f.start, f.end]);
        created.facts.push(r.rows[0].id);
      }
      for (const p of en.place) {
        const mid = typeof p.map === 'number' ? p.map : mapIds.get(p.map);
        const r = await client.query(
          `INSERT INTO placements (node_id, map_id, x, y, start_time, end_time, visibility)
           VALUES ($1,$2,$3,$4,$5,$6,'dm') RETURNING id`, [en.node, mid, p.x, p.y, p.start, p.end]);
        created.placements.push(r.rows[0].id);
      }
    }
    for (const l of batch.links) {
      const from = typeof l.from === 'number' ? l.from : nodeIds.get(l.from);
      const to = typeof l.to === 'number' ? l.to : nodeIds.get(l.to);
      if (from === to) continue;
      const r = await client.query(
        `INSERT INTO links (world_id, from_node_id, to_node_id, kind, label) VALUES ($1,$2,$3,'reference',$4) RETURNING id`,
        [worldId, from, to, l.label]);
      created.links.push(r.rows[0].id);
    }
    for (const e of batch.eras) {
      const r = await client.query(
        `INSERT INTO eras (world_id, name, start_time, end_time, player_visible) VALUES ($1,$2,$3,$4,false) RETURNING id`,
        [worldId, e.name, e.start, e.end]);
      created.eras.push(r.rows[0].id);
    }
    for (const b of batch.backdrops) {
      const mid = typeof b.map === 'number' ? b.map : mapIds.get(b.map);
      const r = await client.query(
        `INSERT INTO map_backdrops (map_id, image_id, start_time, end_time) VALUES ($1,$2,$3,$4) RETURNING id`,
        [mid, images.get(b.image).id, b.start, b.end]);
      created.backdrops.push(r.rows[0].id);
    }
    const bres = await client.query(
      `INSERT INTO forge_batches (world_id, summary, created, status) VALUES ($1,$2,$3,'pending') RETURNING id`,
      [worldId, batch.summary, JSON.stringify(created)]);
    await client.query('COMMIT');
    const counts = Object.fromEntries(Object.entries(created).map(([k, v]) => [k, v.length]).filter(([, v]) => v > 0));
    return { batchId: bres.rows[0].id, summary: batch.summary, counts };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    await cleanupImages(created.images, images);
    throw e;
  } finally {
    client.release();
  }
}

async function cleanupImages(ids, images) {
  if (!ids.length) return;
  try { await pool.query('DELETE FROM images WHERE id = ANY($1)', [ids]); } catch (e) { console.error('forge image cleanup:', e.message); }
  for (const { storageKey } of images.values()) {
    if (storageKey) { try { await deleteObject(storageKey); } catch (e) { /* best-effort */ } }
  }
}

// ---- discard ---------------------------------------------------------------------

// Remove everything a pending batch created, as a unit. Deleting the nodes cascades their
// placements/links/facts and any interior maps born with them; maps hung on pre-existing
// nodes are deleted explicitly (nodes.interior_map_id is ON DELETE SET NULL, so the owner
// simply reverts to having no interior). R2 objects are swept best-effort afterwards.
async function discardBatch({ worldId, batchId }) {
  const b = (await pool.query(
    `SELECT id, created FROM forge_batches WHERE id=$1 AND world_id=$2 AND status='pending'`,
    [batchId, worldId])).rows[0];
  if (!b) return null;
  const c = b.created || {};
  const keys = (await pool.query('SELECT storage_key FROM images WHERE id = ANY($1) AND storage_key IS NOT NULL', [c.images || []])).rows;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [table, ids] of [
      ['placements', c.placements], ['links', c.links], ['node_facts', c.facts], ['map_backdrops', c.backdrops],
      ['nodes', c.nodes], ['maps', c.maps], ['eras', c.eras], ['images', c.images],
    ]) {
      if (ids && ids.length) await client.query(`DELETE FROM ${table} WHERE id = ANY($1)`, [ids]);
    }
    // bodies the batch filled (only ever onto empty nodes) go back to empty
    if (c.enrichedBodies && c.enrichedBodies.length)
      await client.query(`UPDATE nodes SET body=NULL, updated_at=CURRENT_TIMESTAMP WHERE id = ANY($1)`, [c.enrichedBodies]);
    await client.query(`UPDATE forge_batches SET status='discarded' WHERE id=$1`, [batchId]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  for (const { storage_key } of keys) { try { await deleteObject(storage_key); } catch (e) { /* best-effort */ } }
  return true;
}

module.exports = { validateBatch, applyBatch, discardBatch, paintAndStore, CAPS, CATS };
