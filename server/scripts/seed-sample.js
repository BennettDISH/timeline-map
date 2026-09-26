#!/usr/bin/env node
// Seeds the sample template world ("Begin from the sample world" on the Dashboard) from
// server/test/sample-world.json into the database at DATABASE_URL. A fresh deploy has no
// template row otherwise. Idempotent: it does nothing when a template with that name exists.
//
//   SEED_OWNER_ID=<users.id> node server/scripts/seed-sample.js
//
// The owner defaults to the lowest user id. Art is stored as base64 rows (the sample's two
// SVGs), the same fallback the app uses without R2; a later clone lifts them into R2.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const pool = require('../config/database');
const seed = require(path.join(__dirname, '..', 'test', 'sample-world.json'));

async function main() {
  const existing = (await pool.query('SELECT id FROM worlds WHERE is_template = true AND name = $1', [seed.world.name])).rows[0];
  if (existing) { console.log(`template already present: world ${existing.id}`); return; }
  const owner = Number(process.env.SEED_OWNER_ID) || (await pool.query('SELECT id FROM users ORDER BY id LIMIT 1')).rows[0]?.id;
  if (!owner) throw new Error('no user to own the template — sign in once first, or set SEED_OWNER_ID');
  const client = await pool.connectTx();
  try {
    await client.query('BEGIN');
    const w = (await client.query(
      `INSERT INTO worlds (name, description, created_by, is_template, timeline_enabled, timeline_min_time, timeline_max_time, timeline_current_time, timeline_time_unit)
       VALUES ($1,$2,$3,true,$4,$5,$6,$7,$8) RETURNING id`,
      [seed.world.name, seed.world.description, owner, seed.world.timeline_enabled, seed.world.timeline_min_time, seed.world.timeline_max_time, seed.world.timeline_current_time, seed.world.timeline_time_unit])).rows[0];
    const img = new Map(), maps = new Map(), nodes = new Map();
    for (const im of seed.images) {
      const r = (await client.query(
        `INSERT INTO images (filename, original_name, file_path, file_size, mime_type, world_id, uploaded_by, base64_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [im.filename, im.original_name, `/api/images-base64/serve/${im.filename}`, im.file_size, im.mime_type, w.id, owner, im.base64_data])).rows[0];
      img.set(im.id, r.id);
    }
    for (const n of seed.nodes) {
      const r = (await client.query(
        `INSERT INTO nodes (world_id, title, body, category, visibility, created_by, image_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [w.id, n.title, n.body || null, n.category, n.visibility || 'shared', owner, n.image_id ? img.get(n.image_id) : null])).rows[0];
      nodes.set(n.id, r.id);
    }
    for (const m of seed.maps) {
      const r = (await client.query(
        `INSERT INTO maps (world_id, title, view, image_id, owner_node_id, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [w.id, m.title, m.view || 'map', m.image_id ? img.get(m.image_id) : null, m.owner_node_id ? nodes.get(m.owner_node_id) : null, owner])).rows[0];
      maps.set(m.id, r.id);
    }
    for (const n of seed.nodes) if (n.interior_map_id) await client.query('UPDATE nodes SET interior_map_id=$1 WHERE id=$2', [maps.get(n.interior_map_id), nodes.get(n.id)]);
    await client.query('UPDATE worlds SET root_map_id=$1 WHERE id=$2', [maps.get(seed.world.root_map), w.id]);
    for (const p of seed.placements) {
      await client.query(
        `INSERT INTO placements (node_id, map_id, x, y, start_time, end_time, visibility) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [nodes.get(p.node_id), maps.get(p.map_id), p.x, p.y, p.start_time ?? null, p.end_time ?? null, p.visibility || 'shared']);
    }
    for (const l of seed.links) {
      await client.query(`INSERT INTO links (world_id, from_node_id, to_node_id, kind, label) VALUES ($1,$2,$3,'reference',$4)`,
        [w.id, nodes.get(l.from_node_id), nodes.get(l.to_node_id), l.label || null]);
    }
    for (const e of seed.eras) {
      await client.query(`INSERT INTO eras (world_id, name, start_time, end_time, player_visible) VALUES ($1,$2,$3,$4,$5)`,
        [w.id, e.name, e.start_time, e.end_time, !!e.player_visible]);
    }
    for (const f of seed.facts) {
      await client.query(`INSERT INTO node_facts (node_id, body, start_time, end_time) VALUES ($1,$2,$3,$4)`,
        [nodes.get(f.node_id), f.body, f.start_time ?? null, f.end_time ?? null]);
    }
    for (const b of seed.backdrops) {
      await client.query(`INSERT INTO map_backdrops (map_id, image_id, start_time, end_time) VALUES ($1,$2,$3,$4)`,
        [maps.get(b.map_id), img.get(b.image_id), b.start_time ?? null, b.end_time ?? null]);
    }
    await client.query('COMMIT');
    console.log(`seeded template world ${w.id}: ${seed.nodes.length} nodes, ${seed.maps.length} maps, ${seed.placements.length} placements`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

main().then(() => pool.end()).catch((e) => { console.error(e); pool.end(); process.exit(1); });
