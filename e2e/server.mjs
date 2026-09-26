// API probes against the live deploy for the server-resilience package. Read-only probes run
// on the public fixture world; the write probes (player markers) run on the throwaway world in
// dm.config.json and are cleaned up through the DM API, so nothing lands on a real world.
import { readFileSync, existsSync } from 'fs';
const cfgUrl = new URL('./dm.config.json', import.meta.url);
const cfg = existsSync(cfgUrl) ? JSON.parse(readFileSync(cfgUrl)) : null;
const BASE = process.env.BASE_URL || cfg?.baseUrl || 'https://timeline-map-production.up.railway.app';
const FIXTURE = process.env.SHARE_TOKEN || 'fx89ef1c8ec74cadc99ae56b256c46b337';
const steps = [];
const step = (name, ok, note = '') => { steps.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`); };
const json = async (r) => { try { return await r.json(); } catch (e) { return null; } };

// ids have one spelling: anything else is a 404 before any query runs
for (const id of ['60.0', '6e1', '060', 'abc', '-1']) {
  const r = await fetch(`${BASE}/api/share/${FIXTURE}/maps/${id}`);
  step(`a non-canonical map id (${id}) is a 404, not a 500`, r.status === 404, String(r.status));
}

if (cfg?.shareToken && cfg?.token && cfg?.root) {
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` };
  const dm = (method, path, body) => fetch(`${BASE}/api/atlas${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const mark = (mapId, title) => fetch(`${BASE}/api/share/${cfg.shareToken}/maps/${mapId}/nodes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, x: 1, y: 1 }),
  });
  for (const spelled of [`${cfg.root}.0`, `${cfg.root}e0`, `0${cfg.root}`]) {
    const r = await mark(spelled, 'server-probe');
    step(`a marker on a non-canonical map id (${spelled}) is refused before anything is written`, r.status === 404, String(r.status));
  }
  const title = `server-probe-${Date.now()}`;
  const made = await mark(cfg.root, title);
  const body = await json(made);
  step('a marker on the canonical id lands whole (node + placement in one statement)', made.status === 201 && body?.nodeId, `${made.status} ${JSON.stringify(body)}`);
  // cleanup: every probe marker on the throwaway root, this run's and any stray from a failed run
  const map = await json(await dm('GET', `/maps/${cfg.root}`));
  const strays = (map?.placements || []).filter((p) => /^server-probe/.test(p.node?.title || ''));
  let removed = 0;
  for (const p of strays) { const r = await dm('DELETE', `/nodes/${p.node.id}`); if (r.ok) removed++; }
  step('the probe markers are removed again', removed === strays.length && strays.length >= (made.status === 201 ? 1 : 0), `${removed} removed`);
} else {
  step('marker probes need dm.config.json (shareToken, token, root)', false, 'skipped');
}

// a JSON body of `null` is the caller's mistake: a 400 before the route, never a 500 (sign-out sends {})
const nullBody = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' });
step('a malformed JSON body is answered with a 4xx, not a 500', nullBody.status >= 400 && nullBody.status < 500, String(nullBody.status));
const health = await fetch(`${BASE}/health`);
step('the server answers /health', health.status === 200, String(health.status));
const failed = steps.filter((s) => !s).length;
console.log(JSON.stringify({ pass: steps.length - failed, fail: failed }));
process.exitCode = failed ? 1 : 0;
