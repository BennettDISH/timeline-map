// The sample world's seed (scripts/seed-sample.js) against the columns a FRESH database has, run
// locally: the tables and columns come from schema.sql as the boot applies it (CREATE TABLE, then
// every ADD COLUMN and DROP COLUMN in order), and a stand-in database refuses any statement that
// names a table or column that list lacks. A retired column left in the seed (links.kind, dropped
// in 349ce20) fails here instead of on the next fresh deploy. `node e2e/seed.mjs` runs the same
// script on a real in-memory Postgres.
//
//   node --test server/test/seed-sample.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { readStatements } = require('../config/apply-schema');
const { seedSample } = require('../scripts/seed-sample');
const seed = require('./sample-world.json');

/** The parts of a list at paren depth 0: `a INT, CHECK (b IN (1, 2))` -> two parts. */
const topLevel = (s) => {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

/** table -> Set of columns, as a fresh database has them once schema.sql has run. */
function freshColumns() {
  const tables = new Map();
  for (const s of readStatements()) {
    let m = s.match(/^CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*)\)$/);
    if (m) {
      const cols = topLevel(m[2]).map((d) => d.match(/^\w+/)[0]).filter((c) => !/^(PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)$/i.test(c));
      tables.set(m[1], new Set(cols));
      continue;
    }
    m = s.match(/^ALTER TABLE (\w+) ([\s\S]*)$/);
    if (!m) continue;
    for (const [, c] of m[2].matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)) tables.get(m[1]).add(c);
    for (const [, c] of m[2].matchAll(/DROP COLUMN IF EXISTS (\w+)/g)) tables.get(m[1]).delete(c);
  }
  return tables;
}

const literal = (t) => (t === 'true' ? true : t === 'false' ? false : t === 'NULL' ? null : t.replace(/^'|'$/g, ''));

/** A database with a fresh schema's columns: it keeps the rows the seed writes, and throws on a
 *  table or column that schema lacks, or a statement whose values do not line up. */
function freshDb() {
  const columns = freshColumns();
  const rows = new Map([...columns.keys()].map((t) => [t, []]));
  let nextId = 100;
  const has = (table, col) => {
    if (!columns.has(table)) throw new Error(`a fresh database has no table ${table}`);
    if (!columns.get(table).has(col)) throw new Error(`${table} has no column ${col} in a fresh database`);
  };
  const query = async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
    if (params.some((p) => p === undefined)) throw new Error(`an id that was never remapped: ${s} ${JSON.stringify(params)}`);
    const placeholders = Math.max(0, ...[...s.matchAll(/\$(\d+)/g)].map((x) => Number(x[1])));
    if (placeholders !== params.length) throw new Error(`${placeholders} placeholders, ${params.length} values: ${s}`);
    let m = s.match(/^INSERT INTO (\w+) \(([^)]*)\) VALUES \((.*)\)( RETURNING id)?$/);
    if (m) {
      const cols = m[2].split(',').map((c) => c.trim());
      const vals = topLevel(m[3]).map((t) => (/^\$\d+$/.test(t) ? params[Number(t.slice(1)) - 1] : literal(t)));
      if (cols.length !== vals.length) throw new Error(`${cols.length} columns, ${vals.length} values: ${s}`);
      cols.forEach((c) => has(m[1], c));
      const row = { id: nextId++, ...Object.fromEntries(cols.map((c, i) => [c, vals[i]])) };
      rows.get(m[1]).push(row);
      return { rows: [{ id: row.id }] };
    }
    m = s.match(/^UPDATE (\w+) SET (\w+)=\$1 WHERE id=\$2$/);
    if (m) {
      has(m[1], m[2]);
      const row = rows.get(m[1]).find((r) => r.id === params[1]);
      if (!row) throw new Error(`no ${m[1]} row ${params[1]}`);
      row[m[2]] = params[0];
      return { rows: [], rowCount: 1 };
    }
    if (s === 'SELECT id FROM worlds WHERE is_template = true AND name = $1') {
      ['is_template', 'name'].forEach((c) => has('worlds', c));
      return { rows: rows.get('worlds').filter((w) => w.is_template === true && w.name === params[0]).map((w) => ({ id: w.id })) };
    }
    if (s === 'SELECT id FROM users ORDER BY id LIMIT 1') return { rows: [{ id: 7 }] };
    throw new Error(`unexpected query: ${s}`);
  };
  const pool = { query, connectTx: async () => ({ query, release() {} }) };
  return { pool, rows, columns };
}

test('a fresh schema has dropped the retired columns (the check bites)', () => {
  const cols = freshColumns();
  assert.ok(cols.get('links').has('label'));
  assert.ok(!cols.get('links').has('kind'), 'links.kind was dropped in 349ce20');
  assert.ok(!cols.get('maps').has('parent_map_id'));
  assert.ok(cols.get('maps').has('owner_node_id'), 'ADD COLUMN after CREATE TABLE counts');
  const { pool } = freshDb();
  return assert.rejects(pool.query(`INSERT INTO links (world_id, kind) VALUES ($1,'reference')`, [1]), /links has no column kind/);
});

test('the seed writes only columns a fresh database has, and remaps every id', async () => {
  const { pool, rows } = freshDb();
  const said = [];
  const out = await seedSample({ pool, log: (s) => said.push(s) });
  assert.equal(out.created, true);
  assert.match(said[0], /^seeded template world \d+/);
  const counts = Object.fromEntries([...rows].map(([t, r]) => [t, r.length]));
  assert.deepEqual(
    { worlds: counts.worlds, images: counts.images, nodes: counts.nodes, maps: counts.maps, placements: counts.placements, links: counts.links, eras: counts.eras, node_facts: counts.node_facts, map_backdrops: counts.map_backdrops },
    { worlds: 1, images: seed.images.length, nodes: seed.nodes.length, maps: seed.maps.length, placements: seed.placements.length, links: seed.links.length, eras: seed.eras.length, node_facts: seed.facts.length, map_backdrops: seed.backdrops.length },
  );
  const [world] = rows.get('worlds');
  assert.equal(world.is_template, true);
  assert.equal(world.created_by, 7, 'the lowest user owns it');
  assert.ok(rows.get('maps').some((m) => m.id === world.root_map_id), 'the root map is one of the new maps');
  assert.equal(rows.get('nodes').filter((n) => n.interior_map_id).length, seed.nodes.filter((n) => n.interior_map_id).length);
});

test('a second run finds the template and writes nothing', async () => {
  const { pool, rows } = freshDb();
  const first = await seedSample({ pool, owner: 3, log: () => {} });
  const before = JSON.stringify([...rows]);
  const said = [];
  const again = await seedSample({ pool, log: (s) => said.push(s) });
  assert.deepEqual(again, { worldId: first.worldId, created: false });
  assert.deepEqual(said, [`template already present: world ${first.worldId}`]);
  assert.equal(JSON.stringify([...rows]), before);
  assert.equal(rows.get('worlds')[0].created_by, 3, 'SEED_OWNER_ID picks the owner');
});
