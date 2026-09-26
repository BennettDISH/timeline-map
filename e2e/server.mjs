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

  // input rules: a bad value is a 400 with a sentence, never a 500 'Server error'; ids have one spelling
  const probe = await json(await dm('POST', `/maps/${cfg.root}/nodes`, { title: 'server-probe-validation', x: 5, y: 5 }));
  if (probe?.nodeId) {
    const t = async (name, method, path, body, want, test) => {
      const r = await dm(method, path, body); const b = await json(r);
      step(name, r.status === want && (!test || test(b)), `${r.status} ${b?.message || ''}`.trim());
    };
    await t('a 300-character title is refused with a sentence', 'PATCH', `/nodes/${probe.nodeId}`, { title: 'L'.repeat(300) }, 400, (b) => /255/.test(b?.message || ''));
    await t('a decimal lifespan is refused with a sentence', 'PATCH', `/placements/${probe.placementId}`, { start_time: 2.5 }, 400, (b) => /whole/.test(b?.message || ''));
    await t('a reversed lifespan is refused', 'PATCH', `/placements/${probe.placementId}`, { start_time: 15, end_time: 5 }, 400, (b) => /after/.test(b?.message || ''));
    await t('a lifespan bound is judged against the stored other bound', 'PATCH', `/placements/${probe.placementId}`, { start_time: 3, end_time: 7 }, 200);
    await t('…so a start past the stored end is refused', 'PATCH', `/placements/${probe.placementId}`, { start_time: 9 }, 400, (b) => /after/.test(b?.message || ''));
    await t('a position off the plane is clamped onto it', 'PATCH', `/placements/${probe.placementId}`, { x: 500 }, 200);
    const m3 = await json(await dm('GET', `/maps/${cfg.root}`)); const pl = (m3?.placements || []).find((p) => p.id === probe.placementId);
    step('…the pin sits at the edge, with its lifespan kept', pl && pl.x === 100 && pl.start === 3 && pl.end === 7, `x=${pl?.x} [${pl?.start},${pl?.end}]`);
    await t('a reversed era is refused', 'POST', `/worlds/${cfg.worldId}/eras`, { name: 'probe', start_time: 49, end_time: 40 }, 400, (b) => /after/.test(b?.message || ''));
    await t('a self-link is refused', 'POST', '/links', { from_node_id: probe.nodeId, to_node_id: probe.nodeId }, 400, (b) => /different/.test(b?.message || ''));
    await t('an empty world name is refused', 'PATCH', `/worlds/${cfg.worldId}`, { name: '' }, 400, (b) => /name/.test(b?.message || ''));
    await t('a stance outside the vocabulary is refused', 'PATCH', `/nodes/${probe.nodeId}`, { stance: 'enemy-of-all' }, 400);
    await t('a blank title is accepted', 'PATCH', `/nodes/${probe.nodeId}`, { title: '' }, 200);
    const n3 = await json(await dm('GET', `/nodes/${probe.nodeId}`));
    step('…and the pin keeps a visible name', n3?.node?.title === 'Untitled', String(n3?.node?.title));
    await t('a non-numeric world id is a 404, not a 500', 'GET', '/worlds/abc', null, 404);
    await t('a huge node id is a 404, not a 500', 'GET', '/nodes/99999999999', null, 404);
    await t('a map payload names its world', 'GET', `/maps/${cfg.root}`, null, 200, (b) => b?.map?.worldId === cfg.worldId);
    const del = await dm('DELETE', `/nodes/${probe.nodeId}`);
    step('the validation probe node is removed again', del.ok, String(del.status));
  } else step('a probe node for the input rules', false, JSON.stringify(probe));
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
