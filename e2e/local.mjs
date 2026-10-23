// The whole Atlas on this machine, to test a change before it is pushed: a throwaway Postgres
// held in memory (PGlite, served on a socket so the server's `pg` pool can reach it), the real
// server against it, and a seeded throwaway world laid out like the proving ground (a clock in
// footsteps, two player-visible sessions and a DM-only era, revealed places, an interior, and the
// Party's footsteps from the world map into it). It writes e2e/local.config.json (gitignored),
// which every suite reads when E2E_CONFIG points at it. Nothing here touches Railway, and the
// database lives exactly as long as this process. PGlite is a devDependency of e2e, never of the
// server.
//
//   cd e2e && npm install            once
//   node e2e/local.mjs --build       from the repo root; --build rebuilds client/dist first (the
//                                    server reads index.html once at boot, so build before starting)
//   E2E_CONFIG=e2e/local.config.json bash e2e/watch.sh     every suite, in another shell
//
// A second server ("paid", LOCAL_PORT + 1) shares the database with the Forge, voices, ambience
// and R2 switched on but answered by stubs (e2e/stubs.cjs, nothing leaves the machine) and tiny
// daily caps, so the server suite can drive the spend guard to its limits. Its control port
// (LOCAL_PORT + 2) is for the suites only.
//
// LOCAL_PORT (5099) and LOCAL_DB_PORT (5433) move the ports. Ctrl+C stops everything.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
import { writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.LOCAL_PORT || 5099), DB_PORT = Number(process.env.LOCAL_DB_PORT || 5433);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'local-only-not-a-secret';
const jwt = createRequire(`${root}server/package.json`)('jsonwebtoken'); // the server's own, so tokens match
const say = (s) => console.log(`[local] ${s}`);

if (process.argv.includes('--build')) {
  say('building the client…');
  if (spawnSync('npm', ['run', 'build'], { cwd: `${root}client`, stdio: 'inherit' }).status !== 0) process.exit(1);
}
if (!existsSync(`${root}client/dist/index.html`)) say('no client/dist: the API runs, the pages do not (add --build)');

const db = await PGlite.create();
const sock = new PGLiteSocketServer({ db, port: DB_PORT, host: '127.0.0.1', maxConnections: 50 });
await sock.start();
say(`database on 127.0.0.1:${DB_PORT} (in memory)`);

// every outside service is switched off, whatever the shell holds: uploads answer 503
// (no R2), no Waypoint sign-in, no Forge or voice calls, no bug widget
const OFF = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL', 'AUTH_SERVICE_URL', 'SSO_CLIENT_ID',
  'SSO_CLIENT_SECRET', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'ELEVENLABS_API_KEY', 'BUG_WIDGET_KEY'];
const server = spawn(process.execPath, ['server.js'], {
  cwd: `${root}server`, stdio: 'inherit',
  env: { ...process.env, ...Object.fromEntries(OFF.map((k) => [k, ''])), DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`,
    JWT_SECRET: SECRET, PORT: String(PORT), NODE_ENV: 'development', GUEST_CLEANUP_ENABLED: 'false', FORGE_ENABLED: '0', VOICE_ENABLED: '0' },
});
let paid = null;
const stop = async (code = 0) => { server.kill(); paid?.kill(); await sock.stop().catch(() => {}); process.exit(code); };
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
server.on('exit', (code) => { say(`server stopped (${code})`); stop(code || 1); });

// the server listens once the schema is applied
for (let i = 0; ; i++) {
  if (await fetch(`${BASE}/health`).then((r) => r.ok, () => false)) break;
  if (i > 120) { say('the server never answered /health'); await stop(1); }
  await new Promise((r) => setTimeout(r, 500));
}

// ---- the paid server: same database, every paid service stubbed, caps small enough to reach ----
// (started once the first server has applied the schema, so the two never apply it at once)
const PAID_PORT = PORT + 1, STUB_PORT = PORT + 2, PAID_BASE = `http://127.0.0.1:${PAID_PORT}`;
const PAID_CAPS = { FORGE_DAILY_CAP: 4, FORGE_DAILY_CAP_GUEST: 1, FORGE_DAILY_CEILING: 12, VOICE_DAILY_CAP: 2, VOICE_DAILY_CAP_GUEST: 0, VOICE_DAILY_CEILING: 3 };
paid = spawn(process.execPath, ['--require', `${root}e2e/stubs.cjs`, 'server.js'], {
  cwd: `${root}server`, stdio: 'inherit',
  env: { ...process.env, ...Object.fromEntries(OFF.map((k) => [k, ''])), DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`,
    JWT_SECRET: SECRET, PORT: String(PAID_PORT), NODE_ENV: 'development', GUEST_CLEANUP_ENABLED: 'false', FORGE_ENABLED: '1', VOICE_ENABLED: '1',
    VOICE_PROVIDER: '', GEMINI_API_KEY: 'stub', ELEVENLABS_API_KEY: 'stub', R2_ACCOUNT_ID: 'stub', R2_ACCESS_KEY_ID: 'stub', R2_SECRET_ACCESS_KEY: 'stub',
    R2_BUCKET: 'stub', R2_PUBLIC_URL: 'https://r2.stub.invalid', ADMIN_CENTRAL_USER_IDS: '990001', STUB_PORT: String(STUB_PORT),
    ...Object.fromEntries(Object.entries(PAID_CAPS).map(([k, v]) => [k, String(v)])) },
});
paid.on('exit', (code) => { say(`paid server stopped (${code})`); stop(code || 1); });
for (let i = 0; ; i++) {
  if (await fetch(`${PAID_BASE}/health`).then((r) => r.ok, () => false)) break;
  if (i > 120) { say('the paid server never answered /health'); await stop(1); }
  await new Promise((r) => setTimeout(r, 500));
}
say(`paid server (stubbed Forge, voices, R2) on ${PAID_BASE}`);

// ---- the seed: one DM, one world shaped like the proving ground ----
const u = (await db.query(
  `INSERT INTO users (username, email, password_hash) VALUES ('local-dm', 'local-dm@example.invalid', 'x')
   RETURNING id, token_version`)).rows[0];
const token = jwt.sign({ userId: u.id, tv: u.token_version }, SECRET, { expiresIn: '30d' });
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
const call = async (method, path, body) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { say(`seed failed: ${method} ${path} → ${r.status} ${JSON.stringify(j)}`); await stop(1); }
  return j;
};
const A = (method, path, body) => call(method, `/api/atlas${path}`, body);
const user = (await call('GET', '/api/auth/me')).user;
const worldId = (await call('POST', '/api/worlds', { name: 'Proving ground' })).world.id;
const rootMap = (await A('GET', `/worlds/${worldId}`)).world.rootMapId;
// the table convention, as on the proving ground (world 30): footsteps, ten per session, a
// DM-only era named otherwise, canon 37 with the party inside the interior since Session 3
await A('PATCH', `/worlds/${worldId}`, { timeline_enabled: true, timeline_time_unit: 'footsteps', timeline_min_time: 0, timeline_max_time: 39, timeline_current_time: 37 });
await A('POST', `/worlds/${worldId}/eras`, { name: 'Before the story', start_time: 0, end_time: 9, player_visible: false });
for (const s of [1, 2, 3]) await A('POST', `/worlds/${worldId}/eras`, { name: `Session ${s}`, start_time: s * 10, end_time: s * 10 + 9, player_visible: true });
const node = async (mapId, title, category, x, y, body) => {
  const n = await A('POST', `/maps/${mapId}/nodes`, { title, category, x, y, body });
  await A('PATCH', `/nodes/${n.nodeId}`, { visibility: 'shared' }); // born DM-only, like every entry
  return n;
};
const keep = await node(rootMap, 'The Keep', 'place', 60, 40, 'A grey keep on the hill.');
const interior = (await A('POST', `/nodes/${keep.nodeId}/interior`, {})).mapId;
await node(rootMap, 'Old Mill', 'place', 25, 70, 'The wheel still turns.');
await node(interior, 'The Steward', 'person', 50, 40, 'She keeps the keys.');
// the party: a footstep on the world map from 15, then inside the keep from Session 3
const party = await node(rootMap, 'The Party', 'party', 40, 55, 'Four travellers.');
await A('PATCH', `/placements/${party.placementId}`, { start_time: 15, end_time: 29 });
await A('POST', `/maps/${interior}/placements`, { node_id: party.nodeId, x: 50, y: 70, start_time: 30 });
await A('POST', `/nodes/${party.nodeId}/facts`, { body: 'They walk the old road up to the keep.', start_time: 15, end_time: 29 });
await A('POST', `/nodes/${party.nodeId}/facts`, { body: 'Inside the keep, the steward is waiting.', start_time: 30, end_time: null });
// a secret: a DM-only vault whose interior players can never open (the Player View's
// "isn't on your map" check deep-links to it)
const vault = (await A('POST', `/maps/${rootMap}/nodes`, { title: 'Sealed Vault', category: 'place', x: 80, y: 80 })).nodeId;
const hiddenMap = (await A('POST', `/nodes/${vault}/interior`, {})).mapId;
const shareToken = (await A('POST', `/worlds/${worldId}/share`)).token;

const cfg = { baseUrl: BASE, token, user, worldId, root: rootMap, interior, shareToken, fixtureToken: shareToken, hiddenMap, local: true,
  paid: { baseUrl: PAID_BASE, stubUrl: `http://127.0.0.1:${STUB_PORT}`, caps: PAID_CAPS } };
const cfgPath = `${root}e2e/local.config.json`;
writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
say(`seeded “Proving ground” (world ${worldId}: root map ${rootMap}, interior ${interior})`);
say(`config: ${cfgPath}`);
say(`run a suite:   E2E_CONFIG=e2e/local.config.json node e2e/undo.mjs`);
say(`run them all:  E2E_CONFIG=e2e/local.config.json bash e2e/watch.sh`);
say(`DM workspace:  ${BASE}/w/${worldId}/m/${rootMap}  (sign in from the browser console: localStorage.setItem('auth_token', '<token from the config>'))`);
say(`Player View:   ${BASE}/p/${shareToken}`);
say('Ctrl+C stops the server and drops the database');
