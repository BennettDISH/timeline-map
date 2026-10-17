// API check against the live deploy: doors. An entry may lead to a map it does not own — a new
// map beside the one it stands on (＋ New map beside), or any map that exists (↪ Lead to another
// map) — without nesting it: the tree and the crumb file that map beside the other, the door
// never renames or deletes it, players reach it only through a door they can see, the lantern
// walks through the door, and every delete around it undoes whole. Runs on the throwaway world
// in dm.config.json (E2E_CONFIG names another file) and deletes everything it made.
import { readFileSync } from 'fs';
const cfg = JSON.parse(readFileSync(process.env.E2E_CONFIG || new URL('./dm.config.json', import.meta.url)));
const BASE = process.env.BASE_URL || cfg.baseUrl || 'https://timeline-map-production.up.railway.app';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` };
const api = async (method, path, body) => {
  const r = await fetch(`${BASE}/api/atlas${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const pv = async (path) => {
  const r = await fetch(`${BASE}/api/share/${cfg.shareToken}${path}`);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const steps = [];
const step = (name, ok, note = '') => { steps.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`); };
const tag = `door-probe-${Date.now()}`;
const made = []; // node ids to delete at the end (their maps go with them)
const add = async (mapId, title) => {
  const r = await api('POST', `/maps/${mapId}/nodes`, { title: `${tag} ${title}`, x: 3, y: 3 });
  if (r.body.nodeId) made.push(r.body.nodeId);
  return r.body;
};
const pinOn = async (mapId, nodeId) => (await api('GET', `/maps/${mapId}`)).body.placements?.find((p) => p.node.id === nodeId);
const litBefore = (await api('GET', `/worlds/${cfg.worldId}`)).body.world?.spotlightNodeId ?? null;

try {
  // a hall with its interior (room A); a door in room A makes room B beside it
  const hall = (await add(cfg.root, 'hall')).nodeId;
  const roomA = (await api('POST', `/nodes/${hall}/interior`, {})).body.mapId;
  const door = (await add(roomA, 'door')).nodeId;
  const mk = await api('POST', `/nodes/${door}/interior`, { beside_map_id: roomA });
  const roomB = mk.body.mapId;
  step('＋ New map beside makes a map', mk.status === 201 && !!roomB, `${mk.status}`);
  const tree = (await api('GET', `/worlds/${cfg.worldId}/maps`)).body.maps || [];
  const tA = tree.find((m) => m.id === roomA), tB = tree.find((m) => m.id === roomB);
  step('…owned by the hall and filed beside room A', tB?.ownerNodeId === hall && tB?.parentMapId === tA?.parentMapId, JSON.stringify({ owner: tB?.ownerNodeId, up: [tB?.parentMapId, tA?.parentMapId] }));
  const b = (await api('GET', `/maps/${roomB}`)).body;
  step('…its crumb is the root › room B, not room A › room B', JSON.stringify(b.breadcrumb?.map((c) => c.mapId)) === JSON.stringify([cfg.root, roomB]));
  step('…and it says it stands beside another', b.map?.beside === true && (await api('GET', `/maps/${roomA}`)).body.map?.beside === false);
  step('the door leads to room B', (await pinOn(roomA, door))?.node.interiorMapId === roomB);
  step('nothing stands beside the world map', (await api('POST', `/nodes/${(await add(cfg.root, 'gate')).nodeId}/interior`, { beside_map_id: cfg.root })).status === 400);

  // a door on room B leads back to room A, which exists
  const back = (await add(roomB, 'back door')).nodeId;
  step('↪ Lead to another map points at a map that exists', (await api('PUT', `/nodes/${back}/leads-to`, { map_id: roomA })).status === 200);
  step('…a second way out is a 409', (await api('PUT', `/nodes/${back}/leads-to`, { map_id: cfg.root })).status === 409);
  step('…the map it stands on is a 400', (await api('PUT', `/nodes/${(await add(roomB, 'lamp')).nodeId}/leads-to`, { map_id: roomB })).status === 400);
  step('a door cannot stand on the map it leads to', (await api('POST', `/maps/${roomB}/placements`, { node_id: door, x: 1, y: 1 })).status === 400);
  step('the hall cannot stand on a map beside its interior', (await api('POST', `/maps/${roomB}/placements`, { node_id: hall, x: 1, y: 1 })).status === 400);
  await api('PATCH', `/nodes/${door}`, { title: `${tag} oak door` });
  step('renaming the door leaves room B its name', (await api('GET', `/maps/${roomB}`)).body.map?.title === `${tag} door`);

  if (cfg.shareToken) {
    await api('PATCH', `/nodes/${hall}`, { visibility: 'shared' });
    step('players reach room A once the hall is revealed', (await pv(`/maps/${roomA}`)).status === 200);
    step('…but not room B behind its DM-only door', (await pv(`/maps/${roomB}`)).status === 404);
    await api('PATCH', `/nodes/${door}`, { visibility: 'shared' });
    const pb = await pv(`/maps/${roomB}?window=1`);
    step('a revealed door opens room B', pb.status === 200, `${pb.status}`);
    step('…with the root › room B crumb and nothing more', JSON.stringify(pb.body.breadcrumb?.map((c) => Object.keys(c).sort().join())) === JSON.stringify(['mapId,title', 'mapId,title']) && pb.body.breadcrumb?.[1]?.mapId === roomB);
    const pd = (await pv(`/maps/${roomA}?window=1`)).body.placements?.find((p) => p.node.id === door);
    step('…and the door offers ◎ into it', pd?.node.hasInterior === true && pd?.node.interiorMapId === roomB);
    const doorPin = (await pinOn(roomA, door))?.id;
    await api('PATCH', `/placements/${doorPin}`, { visibility: 'dm' });
    step('a door hidden on its map hides the room again', (await pv(`/maps/${roomB}`)).status === 404);
    await api('PATCH', `/placements/${doorPin}`, { visibility: 'shared' });
    step('locating the door lands where it stands', (await pv(`/nodes/${door}/locate`)).body.mapId === roomA);
    const chest = (await add(roomB, 'chest')).nodeId;
    await api('PATCH', `/nodes/${chest}`, { visibility: 'shared' });
    const trail = ((await api('POST', `/worlds/${cfg.worldId}/spotlight`, { node_id: chest })).body.trail || []).map((s) => `${s.nodeId}@${s.mapId}`);
    step('the lantern walks hall → door → chest', JSON.stringify(trail) === JSON.stringify([`${hall}@${cfg.root}`, `${door}@${roomA}`, `${chest}@${roomB}`]), JSON.stringify(trail));
  }

  // letting go, removing, undo
  const go = await api('DELETE', `/nodes/${back}/interior`);
  step('✕ on a door lets go and keeps the map', go.body.kept === roomA && (await api('GET', `/maps/${roomA}`)).status === 200, JSON.stringify(go.body));
  await api('PUT', `/nodes/${back}/leads-to`, { map_id: roomA });
  const imp = (await api('GET', `/nodes/${hall}/impact`)).body;
  step('the hall\'s delete names both maps it owns and both doors in', imp.interiorMaps === 2 && imp.doorsIn === 2, JSON.stringify(imp));
  step('a door\'s delete takes no map', (await api('GET', `/nodes/${door}/impact`)).body.leadsElsewhere === true);
  const rm = await api('DELETE', `/maps/${roomB}`);
  step('✕ Remove this map removes room B alone', rm.status === 200 && !(await pinOn(roomA, door))?.node.interiorMapId && (await pinOn(cfg.root, hall))?.node.interiorMapId === roomA);
  step('…and undo puts it back with the door leading in', (await api('POST', `/undo/${rm.body.undoId}`)).status === 200 && (await pinOn(roomA, door))?.node.interiorMapId === roomB);
  const del = await api('DELETE', `/nodes/${hall}`);
  step('deleting the hall takes room A and room B', (await api('GET', `/maps/${roomA}`)).status === 404 && (await api('GET', `/maps/${roomB}`)).status === 404);
  const un = await api('POST', `/undo/${del.body.undoId}`);
  step('…undo restores both and points the doors back', un.status === 200 && (await pinOn(roomA, door))?.node.interiorMapId === roomB
    && (await pinOn(roomB, back))?.node.interiorMapId === roomA && (await api('GET', `/maps/${roomB}`)).body.map?.beside === true, `${un.status}`);
} finally {
  if (cfg.shareToken) await api(litBefore ? 'POST' : 'DELETE', `/worlds/${cfg.worldId}/spotlight`, litBefore ? { node_id: litBefore } : undefined);
  for (const id of made.reverse()) await api('DELETE', `/nodes/${id}`);
}
const failed = steps.filter((s) => !s).length;
console.log(failed ? `${failed} of ${steps.length} FAILED` : `all ${steps.length} passed`);
process.exit(failed ? 1 : 0);
