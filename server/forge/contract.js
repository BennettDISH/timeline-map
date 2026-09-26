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
const { CATEGORIES: CATS } = require('../lib/vocab');

const CAPS = { images: 8, maps: 8, nodes: 60, links: 100, eras: 8, backdrops: 10, enrich: 40, enrichMaps: 20, placements: 120, factsPerNode: 12, placementsPerNode: 6, asks: 40 };
const STANCES = ['friend', 'neutral', 'foe'];

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
  for (const k of ['images', 'maps', 'nodes', 'links', 'eras', 'backdrops', 'enrich', 'enrich_maps']) {
    if (batch[k] == null) batch[k] = [];
    if (!Array.isArray(batch[k])) { errs.push(`${k} must be an array`); batch[k] = []; }
  }
  // a null or bare-string entry is a validator error like any other, never a crash
  const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
  const objectsOnly = (list, name) => list.filter((v, i) => { if (isObj(v)) return true; errs.push(`${name}[${i}] must be an object`); return false; });
  for (const k of ['images', 'maps', 'nodes', 'links', 'eras', 'backdrops', 'enrich', 'enrich_maps']) batch[k] = objectsOnly(batch[k], k);
  batch.summary = s(batch.summary, 300) || 'A generation';

  const min = world?.timeline_min_time ?? -1000000, max = world?.timeline_max_time ?? 1000000;
  const clampT = (v) => { const n = num(v); return n == null ? null : Math.max(min, Math.min(max, Math.round(n))); };
  // "{start:0,end:0}" is the classic way a model writes "always" — a single-instant lifespan
  // pinned to the world's dawn means open-ended, not one year long. (A real one-year moment
  // anywhere else on the clock is left alone.)
  const openEnded = (o) => { if (o.start != null && o.start === o.end && o.start === min) { o.start = null; o.end = null; } };

  for (const [k, cap] of Object.entries({ images: CAPS.images, maps: CAPS.maps, nodes: CAPS.nodes, links: CAPS.links, eras: CAPS.eras, backdrops: CAPS.backdrops, enrich: CAPS.enrich, enrich_maps: CAPS.enrichMaps }))
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
    n.dm_note = s(n.dm_note, 2000) || null;
    n.category = CATS.includes(n.category) ? n.category : 'note';
    n.pin = n.pin === 'image' ? 'image' : 'chip';
    n.pin_size = Math.max(24, Math.min(256, num(n.pin_size) ?? 64));
    if (n.image != null && !imgKeys.has(n.image)) { errs.push(`node "${n.key}" references unknown image "${n.image}"`); n.image = null; }
    if (n.pin === 'image' && n.image == null) n.pin = 'chip';
    n.placements = Array.isArray(n.placements) ? objectsOnly(n.placements, `node "${n.key}" placements`).slice(0, CAPS.placementsPerNode) : [];
    for (const p of n.placements) {
      p.x = Math.max(0, Math.min(100, num(p.x) ?? 50));
      p.y = Math.max(0, Math.min(100, num(p.y) ?? 50));
      p.start = clampT(p.start); p.end = clampT(p.end);
      if (p.start != null && p.end != null && p.start > p.end) [p.start, p.end] = [p.end, p.start];
      openEnded(p);
    }
    n.facts = Array.isArray(n.facts) ? objectsOnly(n.facts, `node "${n.key}" facts`).slice(0, CAPS.factsPerNode) : [];
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
    en.dm_note = s(en.dm_note, 2000) || null;
    en.dm_note_append = s(en.dm_note_append, 2000) || null;
    if (en.stance != null && !STANCES.includes(en.stance)) { errs.push(`an enrich of node ${en.node} has unknown stance "${en.stance}" (friend | neutral | foe)`); en.stance = null; }
    if (en.image != null && !imgKeys.has(en.image)) { errs.push(`an enrich of node ${en.node} references unknown image "${en.image}"`); en.image = null; }
    en.facts = Array.isArray(en.facts) ? objectsOnly(en.facts, `enrich of node ${en.node} facts`).slice(0, CAPS.factsPerNode) : [];
    for (const f of en.facts) {
      f.body = s(f.body, 2000);
      if (!f.body) errs.push(`a fact enriching node ${en.node} is empty`);
      f.start = clampT(f.start); f.end = clampT(f.end);
      if (f.start != null && f.end != null && f.start > f.end) [f.start, f.end] = [f.end, f.start];
    }
    en.place = Array.isArray(en.place) ? objectsOnly(en.place, `enrich of node ${en.node} place`).slice(0, CAPS.placementsPerNode) : [];
    for (const p of en.place) {
      p.x = Math.max(0, Math.min(100, num(p.x) ?? 50));
      p.y = Math.max(0, Math.min(100, num(p.y) ?? 50));
      p.start = clampT(p.start); p.end = clampT(p.end);
      if (p.start != null && p.end != null && p.start > p.end) [p.start, p.end] = [p.end, p.start];
      openEnded(p);
    }
  }

  // enrich_maps: additive running notes on EXISTING maps (DM-only, so no permission needed)
  for (const em of batch.enrich_maps) {
    if (!Number.isInteger(em.map)) errs.push('an enrich_maps entry needs an existing map\'s numeric id');
    em.dm_note_append = s(em.dm_note_append, 2000) || null;
    if (!em.dm_note_append) errs.push(`enrich_maps for map ${em.map} has nothing to append`);
  }

  // asks: privileged acts on EXISTING things — shape-checked here, executed only when the
  // DM clicks Allow (ids are re-validated against the world at execution time).
  if (batch.asks == null) batch.asks = [];
  if (!Array.isArray(batch.asks)) { errs.push('asks must be an array'); batch.asks = []; }
  batch.asks = objectsOnly(batch.asks, 'asks');
  if (batch.asks.length > CAPS.asks) errs.push(`too many asks (${batch.asks.length} > ${CAPS.asks})`);
  for (const a of batch.asks) {
    if (a.op === 'move') {
      if (!Number.isInteger(a.node) || !Number.isInteger(a.map)) errs.push('a move ask needs numeric node and map ids');
      a.x = Math.max(0, Math.min(100, num(a.x) ?? 50));
      a.y = Math.max(0, Math.min(100, num(a.y) ?? 50));
      if (a.to_map != null && !Number.isInteger(a.to_map)) errs.push('a move ask to_map must be a numeric map id');
    } else if (a.op === 'edit') {
      if (!Number.isInteger(a.node)) errs.push('an edit ask needs a numeric node id');
      if (a.title != null) a.title = s(a.title, 255);
      if (a.body != null) a.body = s(a.body, 4000);
      if (a.dm_note != null) a.dm_note = s(a.dm_note, 2000);
      if (a.category != null && !CATS.includes(a.category)) { errs.push(`an edit ask has unknown category "${a.category}"`); a.category = null; }
      if (a.title == null && a.body == null && a.category == null && a.dm_note == null) errs.push('an edit ask changes nothing');
    } else if (a.op === 'drop_era') {
      if (!Number.isInteger(a.era)) errs.push('a drop_era ask needs a numeric era id');
    } else if (a.op === 'reveal') {
      if (!Number.isInteger(a.node)) errs.push('a reveal ask needs a numeric node id');
    } else errs.push(`unknown ask op "${a.op}" (move | edit | drop_era | reveal)`);
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
    // a focus window is a STRETCH of history; an instant (or the dawn-pinned 0/0) means none
    if (m.focus_start != null && m.focus_end != null && m.focus_start >= m.focus_end) { m.focus_start = null; m.focus_end = null; }
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
    if (!mapRef(b.map)) errs.push(`a backdrop references unknown map "${b.map}"`);
    if (!imgKeys.has(b.image)) errs.push(`a backdrop references unknown image "${b.image}"`);
    // start null = set the map's STANDING backdrop; a number starts a timed override.
    // A single-instant cover is never meant — treat it as open-ended from its start.
    b.start = clampT(b.start);
    b.end = clampT(b.end);
    if (b.end != null && b.end === b.start) b.end = null;
  }
  return errs;
}

// ---- images ----------------------------------------------------------------------

// The style anchor: the world's first painted image, sent as a reference with every later
// generation so the artwork stays one hand. Bytes come from R2 (or Postgres-fallback rows).
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
  const anchored = (await pool.query(
    `UPDATE world_minds SET style_image_id=$1, updated_at=CURRENT_TIMESTAMP WHERE world_id=$2 AND style_image_id IS NULL RETURNING world_id`,
    [row.id, worldId])).rowCount > 0;
  return { id: row.id, url: row.file_path, storageKey, anchored };
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
  for (const em of batch.enrich_maps) wantMaps.add(em.map);
  if (wantNodes.size) {
    const r = await pool.query('SELECT id, interior_map_id FROM nodes WHERE id = ANY($1) AND world_id=$2', [[...wantNodes], worldId]);
    if (r.rows.length !== wantNodes.size) throw Object.assign(new Error('the batch references nodes that are not in this world'), { userMessage: 'the mind pointed at things that are not in this world — ask again' });
    const interiors = new Map(r.rows.map((x) => [x.id, x.interior_map_id]));
    for (const m of batch.maps)
      if (typeof m.owner === 'number' && interiors.get(m.owner) != null)
        throw Object.assign(new Error(`node ${m.owner} already has an interior — it cannot get a second one`), { userMessage: 'the mind tried to give a place a second interior — ask again' });
  }
  if (wantMaps.size) {
    const r = await pool.query('SELECT id FROM maps WHERE id = ANY($1) AND world_id=$2', [[...wantMaps], worldId]);
    if (r.rows.length !== wantMaps.size) throw Object.assign(new Error('the batch references maps that are not in this world'), { userMessage: 'the mind pointed at maps that are not in this world — ask again' });
  }

  // Paint. Sequential, not parallel — each painting after the first can only match the
  // anchor once the anchor exists, and the anchor is the first painting.
  const images = new Map(); // key -> { id, url, storageKey }
  const created = { images: [], nodes: [], maps: [], placements: [], links: [], eras: [], backdrops: [], facts: [], enrichedBodies: [], enrichedNotes: [], enrichedImages: [], noteAppends: [], stanceChanges: [], mapNoteAppends: [], mapBases: [] };
  try {
    for (const im of batch.images) {
      const stored = await paintAndStore({ worldId, userId, kind: im.kind, prompt: im.prompt, artStyle, name: im.name });
      images.set(im.key, stored);
      created.images.push(stored.id);
      if (stored.anchored && created.anchorSet == null) created.anchorSet = stored.id; // unmake clears an anchor this batch set, never one the DM chose
    }
  } catch (e) {
    await cleanupImages(created.images, images);
    throw Object.assign(new Error(`painting failed: ${e.message}`), { userMessage: `a painting failed — ${e.userMessage || 'try again'}` });
  }

  const client = await pool.connectTx();
  try {
    await client.query('BEGIN');
    const nodeIds = new Map(); // key -> id
    for (const n of batch.nodes) {
      const r = await client.query(
        `INSERT INTO nodes (world_id, title, body, dm_note, category, image_id, pin, pin_size, visibility, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'dm',$9) RETURNING id`,
        [worldId, n.title, n.body, n.dm_note, n.category, n.image != null ? images.get(n.image).id : null, n.pin, n.pin_size, userId]);
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
        if (r.rows.length) created.enrichedBodies.push({ node: en.node, wrote: en.body });
      }
      if (en.dm_note) {
        const r = await client.query(
          `UPDATE nodes SET dm_note=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND (dm_note IS NULL OR dm_note='') RETURNING id`,
          [en.dm_note, en.node]);
        if (r.rows.length) created.enrichedNotes.push({ node: en.node, wrote: en.dm_note });
      }
      if (en.image != null) {
        // attach this batch's painting to the existing node; bare nodes flip to image pins.
        // prior art/pin recorded so unmake restores exactly what was there.
        const prev = (await client.query('SELECT image_id, pin FROM nodes WHERE id=$1', [en.node])).rows[0];
        await client.query(
          `UPDATE nodes SET image_id=$1, pin=CASE WHEN image_id IS NULL THEN 'image' ELSE pin END, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
          [images.get(en.image).id, en.node]);
        created.enrichedImages.push({ node: en.node, prevImage: prev?.image_id ?? null, prevPin: prev?.pin || 'chip', wrote: images.get(en.image).id });
      }
      if (en.dm_note_append) {
        // additive: DM-only notes grow (a recap's "what changed"); unmake restores the prior text
        const prev = (await client.query('SELECT dm_note FROM nodes WHERE id=$1', [en.node])).rows[0];
        await client.query(
          `UPDATE nodes SET dm_note = CASE WHEN dm_note IS NULL OR dm_note='' THEN $1 ELSE dm_note || E'\n' || $1 END, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
          [en.dm_note_append, en.node]);
        created.noteAppends.push({ node: en.node, prev: prev?.dm_note ?? null, wrote: en.dm_note_append });
      }
      if (en.stance != null) {
        const prev = (await client.query('SELECT stance FROM nodes WHERE id=$1', [en.node])).rows[0];
        await client.query('UPDATE nodes SET stance=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [en.stance, en.node]);
        created.stanceChanges.push({ node: en.node, prev: prev?.stance ?? null, wrote: en.stance });
      }
      // an existing node's new facts and extra placements (these once sat in the map loop
      // below by mistake, where `en` did not exist — every recap with map notes crashed)
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
    for (const em of batch.enrich_maps) {
      const prev = (await client.query('SELECT dm_note FROM maps WHERE id=$1', [em.map])).rows[0];
      await client.query(
        `UPDATE maps SET dm_note = CASE WHEN dm_note IS NULL OR dm_note='' THEN $1 ELSE dm_note || E'\n' || $1 END, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
        [em.dm_note_append, em.map]);
      created.mapNoteAppends.push({ map: em.map, prev: prev?.dm_note ?? null, wrote: em.dm_note_append });
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
      const imgId = images.get(b.image).id;
      if (b.start == null) {
        // set the map's standing backdrop; remember what it replaced so unmake can restore it
        const prev = (await client.query('SELECT image_id FROM maps WHERE id=$1', [mid])).rows[0];
        await client.query('UPDATE maps SET image_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [imgId, mid]);
        created.mapBases.push({ map: mid, prev: prev?.image_id ?? null, wrote: imgId });
      } else {
        const r = await client.query(
          `INSERT INTO map_backdrops (map_id, image_id, start_time, end_time) VALUES ($1,$2,$3,$4) RETURNING id`,
          [mid, imgId, b.start, b.end]);
        created.backdrops.push(r.rows[0].id);
      }
    }
    const bres = await client.query(
      `INSERT INTO forge_batches (world_id, summary, created, status, asks, asks_state) VALUES ($1,$2,$3,'pending',$4,$5) RETURNING id`,
      [worldId, batch.summary, JSON.stringify(created), JSON.stringify(batch.asks || []),
       (batch.asks || []).length ? 'pending' : 'none']);
    await client.query('COMMIT');
    const counts = Object.fromEntries(Object.entries(created).filter(([, v]) => Array.isArray(v) && v.length > 0).map(([k, v]) => [k, v.length]));
    return { batchId: bres.rows[0].id, summary: batch.summary, counts, askCount: (batch.asks || []).length };
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

// ---- asks ------------------------------------------------------------------------

// Execute a pending batch's asks — the DM clicked Allow. Every id is re-checked against
// the world NOW (the world may have moved on since the mind asked; vanished targets are
// skipped, not errors), and each act records how to undo it so Unmake can revert.
async function allowAsks({ worldId, batchId }) {
  const b = (await pool.query(
    `SELECT id, asks FROM forge_batches WHERE id=$1 AND world_id=$2 AND status='pending' AND asks_state='pending'`,
    [batchId, worldId])).rows[0];
  if (!b) return null;
  const undo = [];
  let skipped = 0; // targets that no longer exist — reported, never errors
  const client = await pool.connectTx();
  try {
    await client.query('BEGIN');
    for (const a of b.asks || []) {
      const before = undo.length;
      if (a.op === 'move') {
        const p = (await client.query(
          `SELECT p.id, p.map_id, p.x, p.y, p.shape FROM placements p JOIN maps m ON m.id=p.map_id
           WHERE p.node_id=$1 AND p.map_id=$2 AND m.world_id=$3 ORDER BY p.id LIMIT 1`,
          [a.node, a.map, worldId])).rows[0];
        if (!p) continue;
        if (a.to_map != null) {
          const m2 = (await client.query('SELECT id FROM maps WHERE id=$1 AND world_id=$2', [a.to_map, worldId])).rows[0];
          if (!m2) continue;
        }
        // an outline traced on this map's art travels with a move here, and is cleared by a
        // move onto another map (its ring would mean nothing over different art)
        const crossing = a.to_map != null && Number(a.to_map) !== Number(p.map_id);
        let shape = p.shape || null;
        if (shape) {
          const c = (v) => Math.round(Math.max(0, Math.min(100, v)) * 100) / 100;
          const dx = a.x - Number(p.x), dy = a.y - Number(p.y);
          shape = crossing ? null : shape.map(([x, y]) => [c(x + dx), c(y + dy)]);
        }
        undo.push({ op: 'move', placement: p.id, map_id: p.map_id, x: p.x, y: p.y, shape: p.shape || null });
        await client.query('UPDATE placements SET map_id=$1, x=$2, y=$3, shape=$4 WHERE id=$5',
          [a.to_map != null ? a.to_map : p.map_id, a.x, a.y, shape ? JSON.stringify(shape) : null, p.id]);
      } else if (a.op === 'edit') {
        const n = (await client.query(
          'SELECT id, title, body, category, dm_note FROM nodes WHERE id=$1 AND world_id=$2', [a.node, worldId])).rows[0];
        if (!n) continue;
        undo.push({ op: 'edit', node: n.id, title: n.title, body: n.body, category: n.category, dm_note: n.dm_note,
          wrote: { title: a.title ?? null, body: a.body ?? null, category: a.category ?? null, dm_note: a.dm_note ?? null } });
        await client.query(
          `UPDATE nodes SET title=COALESCE($1,title), body=COALESCE($2,body), category=COALESCE($3,category), dm_note=COALESCE($4,dm_note), updated_at=CURRENT_TIMESTAMP WHERE id=$5`,
          [a.title ?? null, a.body ?? null, a.category ?? null, a.dm_note ?? null, n.id]);
      } else if (a.op === 'reveal') {
        const n = (await client.query('SELECT id, visibility FROM nodes WHERE id=$1 AND world_id=$2', [a.node, worldId])).rows[0];
        if (!n || n.visibility !== 'dm') continue;
        await client.query(`UPDATE nodes SET visibility='shared', updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [n.id]);
        const lifted = (await client.query(
          `UPDATE placements SET visibility='shared' WHERE node_id=$1 AND visibility='dm' RETURNING id`, [n.id])).rows.map((r) => r.id);
        undo.push({ op: 'reveal', node: n.id, prevVis: n.visibility, placements: lifted });
      } else if (a.op === 'drop_era') {
        const e = (await client.query(
          'SELECT id, name, start_time, end_time, player_visible FROM eras WHERE id=$1 AND world_id=$2',
          [a.era, worldId])).rows[0];
        if (!e) continue;
        undo.push({ op: 'drop_era', row: e });
        await client.query('DELETE FROM eras WHERE id=$1', [e.id]);
      }
      if (undo.length === before) skipped++;
    }
    await client.query(`UPDATE forge_batches SET asks_state='allowed', asks_undo=$1 WHERE id=$2`,
      [JSON.stringify(undo), batchId]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return { granted: undo.length, requested: (b.asks || []).length, skipped };
}

// ---- discard ---------------------------------------------------------------------

// Remove what a pending batch created, as a unit — and ONLY that. Before anything is touched
// it looks for what the DM built on top: things placed inside the batch's maps and spaces
// hung on the batch's nodes would go with the cascade, so they BLOCK the unmake (the DM
// moves them out first, and the card says which). Paintings the DM has since used elsewhere
// are kept. Everything written INTO existing things is reverted only while it still holds
// exactly what the batch wrote; a granted move goes home only if its map still exists.
// R2 objects of the images actually deleted are swept best-effort afterwards.
async function discardBatch({ worldId, batchId }) {
  const b = (await pool.query(
    `SELECT id, created, asks_state, asks_undo FROM forge_batches WHERE id=$1 AND world_id=$2 AND status='pending'`,
    [batchId, worldId])).rows[0];
  if (!b) return null;
  const c = b.created || {};
  const ids = (k) => (Array.isArray(c[k]) ? c[k] : []);

  // the maps the cascade would take: the batch's own, plus any the DM hung on batch nodes
  const doomed = (await pool.query(
    `SELECT id, title, (id = ANY($1::int[])) AS own FROM maps
     WHERE world_id=$2 AND (id = ANY($1::int[]) OR owner_node_id = ANY($3::int[]))`,
    [ids('maps'), worldId, ids('nodes')])).rows;
  const blocked = { maps: doomed.filter((m) => !m.own).map((m) => m.title), placements: [] };
  if (doomed.length) {
    blocked.placements = (await pool.query(
      `SELECT n.title, m.title AS map FROM placements p JOIN nodes n ON n.id=p.node_id JOIN maps m ON m.id=p.map_id
       WHERE p.map_id = ANY($1::int[]) AND NOT (p.id = ANY($2::int[])) AND NOT (p.node_id = ANY($3::int[]))
       ORDER BY p.id LIMIT 50`, [doomed.map((m) => m.id), ids('placements'), ids('nodes')])).rows;
  }
  if (blocked.maps.length || blocked.placements.length) return { blocked };

  // paintings the DM has used outside the batch stay (the batch's own uses are reverted below);
  // the style anchor counts as a use unless this very batch set it
  const keep = new Set();
  if (ids('images').length) {
    const ownNodes = ids('nodes').concat((c.enrichedImages || []).map((e) => e.node));
    const ownMaps = ids('maps').concat((c.mapBases || []).map((m) => m.map));
    const used = (await pool.query(
      `SELECT image_id FROM nodes WHERE image_id = ANY($1::int[]) AND NOT (id = ANY($2::int[]))
       UNION SELECT image_id FROM maps WHERE image_id = ANY($1::int[]) AND NOT (id = ANY($3::int[]))
       UNION SELECT image_id FROM map_backdrops WHERE image_id = ANY($1::int[]) AND NOT (id = ANY($4::int[]))
       UNION SELECT style_image_id FROM world_minds WHERE world_id=$5 AND style_image_id = ANY($1::int[]) AND style_image_id IS DISTINCT FROM $6`,
      [ids('images'), ownNodes, ownMaps, ids('backdrops'), worldId, c.anchorSet ?? null])).rows;
    for (const r of used) keep.add(r.image_id);
  }
  const dropImages = ids('images').filter((id) => !keep.has(id));
  const keys = (await pool.query('SELECT storage_key FROM images WHERE id = ANY($1::int[]) AND storage_key IS NOT NULL', [dropImages])).rows;
  const skipped = [];
  const client = await pool.connectTx();
  try {
    await client.query('BEGIN');
    // What the batch wrote INTO existing things goes back first — while the field still
    // holds exactly what the batch wrote: a line the DM edited since is theirs and stays.
    // (Batches from before this rule carry plain ids and no `wrote`; those revert as before.)
    const appended = (prev, wrote) => (prev == null || prev === '' ? wrote : `${prev}\n${wrote}`);
    for (const mb of (c.mapBases || [])) {
      if (mb.wrote == null) await client.query('UPDATE maps SET image_id=(SELECT id FROM images WHERE id=$1) WHERE id=$2', [mb.prev, mb.map]);
      else await client.query('UPDATE maps SET image_id=(SELECT id FROM images WHERE id=$1) WHERE id=$2 AND image_id IS NOT DISTINCT FROM $3', [mb.prev, mb.map, mb.wrote]);
    }
    for (const ei of (c.enrichedImages || [])) {
      if (ei.wrote == null) await client.query(
        `UPDATE nodes SET image_id=(SELECT id FROM images WHERE id=$1), pin=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3`,
        [ei.prevImage, ei.prevPin, ei.node]);
      else await client.query(
        `UPDATE nodes SET image_id=(SELECT id FROM images WHERE id=$1), pin=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3 AND image_id IS NOT DISTINCT FROM $4`,
        [ei.prevImage, ei.prevPin, ei.node, ei.wrote]);
    }
    for (const eb of (c.enrichedBodies || [])) {
      const id = typeof eb === 'number' ? eb : eb.node, wrote = typeof eb === 'number' ? null : eb.wrote;
      if (wrote == null) await client.query(`UPDATE nodes SET body=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [id]);
      else await client.query(`UPDATE nodes SET body=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND body=$2`, [id, wrote]);
    }
    for (const en of (c.enrichedNotes || [])) {
      const id = typeof en === 'number' ? en : en.node, wrote = typeof en === 'number' ? null : en.wrote;
      if (wrote == null) await client.query(`UPDATE nodes SET dm_note=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [id]);
      else await client.query(`UPDATE nodes SET dm_note=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND dm_note=$2`, [id, wrote]);
    }
    for (const na of (c.noteAppends || [])) {
      if (na.wrote == null) await client.query('UPDATE nodes SET dm_note=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [na.prev, na.node]);
      else await client.query('UPDATE nodes SET dm_note=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND dm_note=$3', [na.prev, na.node, appended(na.prev, na.wrote)]);
    }
    for (const sc of (c.stanceChanges || [])) {
      if (sc.wrote == null) await client.query('UPDATE nodes SET stance=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [sc.prev, sc.node]);
      else await client.query('UPDATE nodes SET stance=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND stance IS NOT DISTINCT FROM $3', [sc.prev, sc.node, sc.wrote]);
    }
    for (const ma of (c.mapNoteAppends || [])) {
      if (ma.wrote == null) await client.query('UPDATE maps SET dm_note=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [ma.prev, ma.map]);
      else await client.query('UPDATE maps SET dm_note=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND dm_note=$3', [ma.prev, ma.map, appended(ma.prev, ma.wrote)]);
    }
    // granted asks revert too: moves go home (if home still exists), rewrites restore, dropped eras rise again
    if (b.asks_state === 'allowed') {
      for (const u of (b.asks_undo || [])) {
        if (u.op === 'move') {
          const r = u.shape === undefined
            ? await client.query(
              'UPDATE placements SET map_id=$1, x=$2, y=$3 WHERE id=$4 AND EXISTS (SELECT 1 FROM maps WHERE id=$1 AND is_active=true)',
              [u.map_id, u.x, u.y, u.placement])
            : await client.query(
              'UPDATE placements SET map_id=$1, x=$2, y=$3, shape=$4 WHERE id=$5 AND EXISTS (SELECT 1 FROM maps WHERE id=$1 AND is_active=true)',
              [u.map_id, u.x, u.y, u.shape ? JSON.stringify(u.shape) : null, u.placement]);
          if (!r.rowCount) skipped.push('a moved pin stays where it is — the map it came from is gone');
        } else if (u.op === 'edit') {
          if (!u.wrote) {
            await client.query(
              'UPDATE nodes SET title=$1, body=$2, category=$3, dm_note=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5',
              [u.title, u.body, u.category, u.dm_note ?? null, u.node]);
          } else {
            // per field: put the old value back only where the ask's value still stands
            for (const f of ['title', 'body', 'category', 'dm_note']) {
              if (u.wrote[f] == null) continue;
              await client.query(`UPDATE nodes SET ${f}=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND ${f} IS NOT DISTINCT FROM $3`, [u[f] ?? null, u.node, u.wrote[f]]);
            }
          }
        } else if (u.op === 'drop_era') {
          await client.query(
            `INSERT INTO eras (id, world_id, name, start_time, end_time, player_visible)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
            [u.row.id, worldId, u.row.name, u.row.start_time, u.row.end_time, u.row.player_visible]);
        } else if (u.op === 'reveal') {
          await client.query('UPDATE nodes SET visibility=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [u.prevVis, u.node]);
          if (u.placements && u.placements.length)
            await client.query(`UPDATE placements SET visibility='dm' WHERE id = ANY($1)`, [u.placements]);
        }
      }
      await client.query(`SELECT setval(pg_get_serial_sequence('eras','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM eras), 1))`);
    }
    // then what the batch made goes, as a unit (nodes cascade their own placements, links,
    // facts and interiors; a kept painting is left in the gallery)
    for (const [table, list] of [
      ['placements', ids('placements')], ['links', ids('links')], ['node_facts', ids('facts')], ['map_backdrops', ids('backdrops')],
      ['nodes', ids('nodes')], ['maps', ids('maps')], ['eras', ids('eras')], ['images', dropImages],
    ]) {
      if (list.length) await client.query(`DELETE FROM ${table} WHERE id = ANY($1::int[])`, [list]);
    }
    await client.query(`UPDATE forge_batches SET status='discarded' WHERE id=$1`, [batchId]);
    await client.query(`UPDATE mind_messages SET content = content || E'\n↩ Unmade — none of this stands.' WHERE batch_id=$1 AND world_id=$2`, [batchId, worldId]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  for (const { storage_key } of keys) { try { await deleteObject(storage_key); } catch (e) { /* best-effort */ } }
  return { ok: true, keptImages: keep.size, skipped };
}

module.exports = { validateBatch, applyBatch, discardBatch, allowAsks, paintAndStore, CAPS };
