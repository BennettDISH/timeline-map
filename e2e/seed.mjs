// The sample world's seed (server/scripts/seed-sample.js) end to end on a FRESH database: a
// throwaway Postgres held in memory (PGlite on a socket, as in local.mjs) gets schema.sql the way
// the boot applies it and one account, then the unmodified script runs against it twice. The
// first run must build the whole template, the second must find it and write nothing. A column
// retired from schema.sql but still in the seed fails here (links.kind did, after 349ce20).
// Nothing here touches Railway, and the database dies with the process.
//
//   cd e2e && npm install      once
//   node e2e/seed.mjs          from the repo root (SEED_DB_PORT, 5434 by default, moves the port)
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const DB_PORT = Number(process.env.SEED_DB_PORT || 5434);
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;
const serverRequire = createRequire(`${root}server/package.json`);
const { Pool } = serverRequire('pg');
const { applySchema } = serverRequire('./config/apply-schema.js');
const seed = serverRequire('./test/sample-world.json');

const steps = [];
const step = (name, ok, note = '') => { steps.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`); };

// the script reads server/.env, but dotenv never overrides what the environment already holds:
// DATABASE_URL and NODE_ENV (no SSL) given here win over whatever that file names
const runSeed = () => new Promise((resolve) => {
  const child = spawn(process.execPath, ['scripts/seed-sample.js'], {
    cwd: `${root}server`, env: { ...process.env, DATABASE_URL, NODE_ENV: 'development', SEED_OWNER_ID: '' },
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('exit', (code) => resolve({ code, out }));
});
// what a run said: its error line when it failed, else its last line
const said = (out) => (out.split('\n').find((l) => /^\w*Error\b|^error:/.test(l.trim())) || out.trim().split('\n').pop()).trim();

const db = await PGlite.create();
const sock = new PGLiteSocketServer({ db, port: DB_PORT, host: '127.0.0.1', maxConnections: 10 });
await sock.start();
const pool = new Pool({ connectionString: DATABASE_URL });
try {
  const schema = await applySchema(pool);
  step('schema.sql applies whole to an empty database', schema.failed.length === 0,
    schema.failed.length ? schema.failed.map((f) => `${f.statement.split('\n')[0].slice(0, 60)}: ${f.message}`).join('; ') : `${schema.applied} statements`);
  const owner = (await pool.query(`INSERT INTO users (username, password_hash) VALUES ('sample-owner', 'not-a-hash') RETURNING id`)).rows[0].id;

  const first = await runSeed();
  const made = first.out.match(/seeded template world (\d+)/);
  step('the seed builds the template on a fresh database', first.code === 0 && made, said(first.out));
  const worldId = made ? Number(made[1]) : null;

  const world = worldId && (await pool.query('SELECT * FROM worlds WHERE id = $1', [worldId])).rows[0];
  step('the template is a template, named and owned as the sample says', world?.is_template === true && world.name === seed.world.name && world.created_by === owner,
    JSON.stringify(world && { is_template: world.is_template, name: world.name, created_by: world.created_by }));
  const count = async (sql) => Number((await pool.query(sql, [worldId])).rows[0].n);
  const counts = {
    images: await count('SELECT count(*) AS n FROM images WHERE world_id = $1'),
    nodes: await count('SELECT count(*) AS n FROM nodes WHERE world_id = $1'),
    maps: await count('SELECT count(*) AS n FROM maps WHERE world_id = $1'),
    placements: await count('SELECT count(*) AS n FROM placements p JOIN nodes n ON n.id = p.node_id WHERE n.world_id = $1'),
    links: await count('SELECT count(*) AS n FROM links WHERE world_id = $1'),
    eras: await count('SELECT count(*) AS n FROM eras WHERE world_id = $1'),
    facts: await count('SELECT count(*) AS n FROM node_facts f JOIN nodes n ON n.id = f.node_id WHERE n.world_id = $1'),
    backdrops: await count('SELECT count(*) AS n FROM map_backdrops b JOIN maps m ON m.id = b.map_id WHERE m.world_id = $1'),
  };
  const want = Object.fromEntries(Object.keys(counts).map((k) => [k, seed[k].length]));
  step('every row of the sample lands', JSON.stringify(counts) === JSON.stringify(want), JSON.stringify(counts));
  const rootMap = world && (await pool.query('SELECT id FROM maps WHERE id = $1 AND world_id = $2', [world.root_map_id, worldId])).rows[0];
  const interiors = await count('SELECT count(*) AS n FROM nodes n JOIN maps m ON m.id = n.interior_map_id WHERE n.world_id = $1 AND m.world_id = $1');
  step('the root map and the interiors point at the new maps', !!rootMap && interiors === seed.nodes.filter((n) => n.interior_map_id).length,
    `root ${world?.root_map_id}, ${interiors} interiors`);

  const again = await runSeed();
  const templates = Number((await pool.query('SELECT count(*) AS n FROM worlds WHERE is_template = true')).rows[0].n);
  step('a second run finds the template and adds nothing', again.code === 0 && again.out.includes(`template already present: world ${worldId}`) && templates === 1,
    `${said(again.out)} (${templates} template)`);
} catch (e) {
  step('the check ran to the end', false, e.message);
} finally {
  await pool.end().catch(() => {});
  await sock.stop().catch(() => {});
  await db.close().catch(() => {});
}
const failed = steps.filter((s) => !s).length;
console.log(JSON.stringify({ pass: steps.length - failed, fail: failed }));
process.exitCode = failed ? 1 : 0;
