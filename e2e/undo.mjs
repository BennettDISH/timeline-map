// API check against the live deploy: Undo puts back EVERY column it snapshotted (DM note,
// stance, body, the interior's notes and focus), and the delete impact tells the truth.
// Needs dm.config.json (a throwaway DM account + world) — see README.md.
import { readFileSync } from 'fs';
const cfg = JSON.parse(readFileSync(new URL('./dm.config.json', import.meta.url)));
const BASE = process.env.BASE_URL || cfg.baseUrl || 'https://timeline-map-production.up.railway.app';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` };
const api = async (method, path, body) => {
  const r = await fetch(`${BASE}/api/atlas${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const steps = [];
const step = (name, ok, note = '') => { steps.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`); };

const made = await api('POST', `/maps/${cfg.root}/nodes`, { title: `undo-probe-${Date.now()}`, category: 'place', x: 5, y: 5 });
step('a node is created', made.status === 201, made.status !== 201 ? JSON.stringify(made.body) : '');
const nodeId = made.body.nodeId;
if (nodeId) {
  await api('PATCH', `/nodes/${nodeId}`, { dm_note: 'SECRET-NOTE', stance: 'foe', body: 'BODY' });
  // the lantern points at the probe: deleting the node puts it out, undo must relight it
  await api('POST', `/worlds/${cfg.worldId}/spotlight`, { nodeId });
  const lit = (await api('GET', `/worlds/${cfg.worldId}`)).body.world?.spotlightNodeId;
  step('the lantern points at the probe before the delete', lit === nodeId, String(lit));
  // a footstep is born with its moment: the placements POST takes a lifespan
  const born = await api('POST', `/maps/${cfg.root}/placements`, { node_id: nodeId, x: 6, y: 6, start_time: 3, end_time: 7 });
  const bornRow = (await api('GET', `/maps/${cfg.root}`)).body.placements?.find((p) => p.id === born.body?.placementId);
  step('a placement can be born with its lifespan', born.status === 201 && bornRow?.start === 3 && bornRow?.end === 7, `${born.status} ${JSON.stringify(bornRow && [bornRow.start, bornRow.end])}`);
  // a period's text deleted by its ✕ is one Undo away, like everything else
  const fact = await api('POST', `/nodes/${nodeId}/facts`, { body: 'PERIOD-TEXT', start_time: 1, end_time: 2 });
  const factId = fact.body?.id ?? fact.body?.fact?.id ?? fact.body?.factId;
  const factDel = await api('DELETE', `/facts/${factId}`);
  step('deleting a period text returns an undo id', factDel.status === 200 && !!factDel.body?.undoId, JSON.stringify(factDel.body));
  const factUndo = await api('POST', `/undo/${factDel.body?.undoId}`);
  const factsAfter = (await api('GET', `/nodes/${nodeId}`)).body?.facts || [];
  step('undo brings the period text back', factUndo.status === 200 && factsAfter.some((f) => f.body === 'PERIOD-TEXT'), `${factUndo.status} ${JSON.stringify(factsAfter.map((f) => f.body))}`);
  const interior = await api('POST', `/nodes/${nodeId}/interior`, { view: 'map' });
  const mapId = interior.body.mapId;
  await api('PATCH', `/maps/${mapId}`, { dm_note: 'INTERIOR-NOTE', focus_start: 1, focus_end: 5 });
  const before = (await api('GET', `/maps/${cfg.root}`)).body.placements?.find((p) => p.node.id === nodeId);
  step('new nodes are born DM-only, and the note and stance are on before the delete',
    before?.node.visibility === 'dm' && before?.node.dmNote === 'SECRET-NOTE' && before?.node.stance === 'foe',
    JSON.stringify({ vis: before?.node.visibility, dmNote: before?.node.dmNote, stance: before?.node.stance }));
  const del = await api('DELETE', `/nodes/${nodeId}`);
  step('delete returns an undo id', del.status === 200 && del.body.undoId != null);
  const undo = await api('POST', `/undo/${del.body.undoId}`);
  const relit = (await api('GET', `/worlds/${cfg.worldId}`)).body.world?.spotlightNodeId;
  step('after undo the lantern is lit again on the restored node', relit === nodeId, String(relit));
  await api('DELETE', `/worlds/${cfg.worldId}/spotlight`);
  step('undo succeeds', undo.status === 200, undo.status === 200 ? '' : JSON.stringify(undo.body).slice(0, 100));
  const after = (await api('GET', `/maps/${cfg.root}`)).body.placements?.find((p) => p.node.id === nodeId);
  step('after undo the DM note, stance and body are all back',
    after?.node.dmNote === 'SECRET-NOTE' && after?.node.stance === 'foe' && after?.node.body === 'BODY',
    JSON.stringify({ dmNote: after?.node.dmNote, stance: after?.node.stance, body: after?.node.body }));
  const im = (await api('GET', `/maps/${mapId}`)).body;
  step('after undo the interior map keeps its notes and focus period',
    im.map?.dmNote === 'INTERIOR-NOTE' && im.map?.focusStart === 1 && im.map?.focusEnd === 5,
    JSON.stringify({ dmNote: im.map?.dmNote, focus: [im.map?.focusStart, im.map?.focusEnd] }));
  const impact = (await api('GET', `/nodes/${nodeId}/impact`)).body;
  step('the delete impact separates the direct interior from nested spaces', impact.interiorMaps === 1 && impact.nestedMaps === 0 && impact.nodesInside === 0, JSON.stringify(impact));
  const again = await api('POST', `/nodes/${nodeId}/interior`, { view: 'map' });
  step('asking for an interior twice returns the same map', again.body.mapId === mapId, `${again.body.mapId} vs ${mapId}`);
  const gone = await api('DELETE', `/nodes/${nodeId}`);
  step('the probe node is removed again', gone.status === 200);
}
const failed = steps.filter((s) => !s).length;
console.log(JSON.stringify({ pass: steps.length - failed, fail: failed }));
process.exitCode = failed ? 1 : 0;
