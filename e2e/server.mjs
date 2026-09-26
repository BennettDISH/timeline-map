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
    await t('a 300-character title is accepted and clamped to its column', 'PATCH', `/nodes/${probe.nodeId}`, { title: 'L'.repeat(300) }, 200);
    const n2 = await json(await dm('GET', `/nodes/${probe.nodeId}`));
    step('…the stored title is 255 characters', n2?.node?.title?.length === 255, `length ${n2?.node?.title?.length}`);
    await t('a title that is not text is refused with a sentence', 'PATCH', `/nodes/${probe.nodeId}`, { title: 12345 }, 400, (b) => /255/.test(b?.message || ''));
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

  // the inspector's rules: one thread between two things, a stable thread order, renames
  // that follow, and a Reveal that lands where players read
  {
    const mk = async (title) => json(await dm('POST', `/maps/${cfg.root}/nodes`, { title, x: 2, y: 2 }));
    const a = await mk('server-probe-A'), b = await mk('server-probe-B'), c = await mk('server-probe-C');
    if (a?.nodeId && b?.nodeId && c?.nodeId) {
      const ab = await dm('POST', '/links', { from_node_id: a.nodeId, to_node_id: b.nodeId });
      const abId = (await json(ab))?.id;
      const ba = await dm('POST', '/links', { from_node_id: b.nodeId, to_node_id: a.nodeId });
      step('a second thread between the same two things is refused', ab.status === 201 && ba.status === 409, `${ab.status} then ${ba.status}`);
      const ac = await json(await dm('POST', '/links', { from_node_id: a.nodeId, to_node_id: c.nodeId }));
      await dm('PATCH', `/links/${abId}`, { label: 'first-row label' });
      const na = await json(await dm('GET', `/nodes/${a.nodeId}`));
      step('threads keep their order after a label edit', (na?.links || []).map((l) => l.id).join(',') === `${abId},${ac?.id}`, (na?.links || []).map((l) => `${l.otherTitle}${l.label ? ' — ' + l.label : ''}`).join(' | '));
      const inner = await json(await dm('POST', `/nodes/${a.nodeId}/interior`, { view: 'map' }));
      await dm('PATCH', `/nodes/${a.nodeId}`, { title: 'server-probe-A2' });
      let im = await json(await dm('GET', `/maps/${inner?.mapId}`));
      step("an interior named after its node follows the node's rename", im?.map?.title === 'server-probe-A2', String(im?.map?.title));
      await dm('PATCH', `/maps/${inner?.mapId}`, { title: 'Own Name' });
      await dm('PATCH', `/nodes/${a.nodeId}`, { title: 'server-probe-A3' });
      im = await json(await dm('GET', `/maps/${inner?.mapId}`));
      step('a space the DM named keeps its name through a node rename', im?.map?.title === 'Own Name', String(im?.map?.title));
      // locate SHOWS the thing (its pin, here when it stands here) and names the way in; a place never stands inside itself
      const loc = await json(await dm('GET', `/nodes/${a.nodeId}/locate?map=${cfg.root}`));
      step('locate shows the thing on this map and names its interior', loc?.placementId === a.placementId && loc?.mapId === cfg.root && loc?.interiorMapId === inner?.mapId, JSON.stringify(loc));
      const selfP = await dm('POST', `/maps/${inner?.mapId}/placements`, { node_id: a.nodeId, x: 5, y: 5 });
      step("a place can't stand inside its own interior", selfP.status === 400, String(selfP.status));
      const wj = await json(await dm('GET', `/worlds/${cfg.worldId}`));
      const canon = wj?.world?.timeline?.current;
      if (wj?.world?.timeline?.enabled && canon != null) {
        await dm('POST', `/nodes/${b.nodeId}/facts`, { body: 'Period text at canon.', start_time: canon, end_time: canon });
        await dm('PATCH', `/nodes/${b.nodeId}`, { dm_note: 'THE SECRET', body: 'Base text.' });
        const rev = await json(await dm('PATCH', `/nodes/${b.nodeId}`, { reveal: true }));
        const nb = await json(await dm('GET', `/nodes/${b.nodeId}`));
        const f = (nb?.facts || []).find((x) => x.id === rev?.factId);
        step('Reveal lands in the period text players read at canon, and the note is emptied',
          !!rev?.factId && /THE SECRET$/.test(f?.body || '') && nb?.node?.dmNote === '' && nb?.node?.body === 'Base text.',
          `factId ${rev?.factId} · ${JSON.stringify(f?.body)} · note ${JSON.stringify(nb?.node?.dmNote)}`);
      } else step('Reveal into the covering period (needs the clock on the throwaway world)', false, 'skipped');
      let gone = 0; for (const id of [a.nodeId, b.nodeId, c.nodeId]) { const r = await dm('DELETE', `/nodes/${id}`); if (r.ok) gone++; }
      step('the thread probe nodes are removed again', gone === 3, `${gone} removed`);
    } else step('probe nodes for the thread rules', false, JSON.stringify([a, b, c]));
  }
  // images and folders: the bytes decide, names are clamped, list parameters are checked,
  // search is literal, bulk moves and deletes are one request, folder names have one rule
  {
    const api = (method, path, body) => fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const up = (name, data, extra = {}) => api('POST', '/api/images/upload', { imageData: data, originalName: name, world_id: cfg.worldId, ...extra });
    const fake = await up('notanimage.png', `data:image/png;base64,${Buffer.from('this is not an image\n').toString('base64')}`);
    step('a text file called .png is refused by its bytes', fake.status === 400 && /not a PNG/.test((await json(fake))?.message || ''), String(fake.status));
    const svg = await up('tiny.svg', `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`);
    step('an SVG upload is refused with the accepted formats named', svg.status === 400 && /PNG, JPEG, GIF or WebP/.test((await json(svg))?.message || ''), String(svg.status));
    const longName = await up(`${'L'.repeat(300)}.png`, PNG);
    const lb = await json(longName);
    step('a 300-character name is clamped, not a 500', longName.status === 200 && lb?.image?.originalName?.length === 255, `${longName.status} length ${lb?.image?.originalName?.length}`);
    const second = await json(await up('server-probe-two.png', PNG));
    const ids = [lb?.image?.id, second?.image?.id].filter(Boolean);
    if (ids.length === 2) {
      const bad = await api('GET', `/api/images/?world_id=${cfg.worldId}&limit=abc`);
      step('a bad list parameter is a 400, not a 500', bad.status === 400, String(bad.status));
      const pct = await json(await api('GET', `/api/images/?world_id=${cfg.worldId}&search=${encodeURIComponent('%')}`));
      step('a % in the search is matched literally', pct?.total === 0, `total ${pct?.total}`);
      const renamed = await api('PUT', `/api/images/${ids[0]}`, { original_name: 'server-probe-renamed.png', alt_text: 'a caption' });
      const rj = await json(renamed);
      step('an image can be renamed and captioned', renamed.ok && rj?.image?.originalName === 'server-probe-renamed.png' && rj?.image?.altText === 'a caption', `${renamed.status} ${rj?.image?.originalName} / ${rj?.image?.altText}`);
      const cleared = await json(await api('PUT', `/api/images/${ids[0]}`, { alt_text: '' }));
      step('an empty caption clears it', cleared?.image?.altText == null, JSON.stringify(cleared?.image?.altText));
      const blank = await api('POST', '/api/image-folders/', { name: '   ', world_id: cfg.worldId });
      step('a blank folder name is refused', blank.status === 400, String(blank.status));
      const f1 = await json(await api('POST', '/api/image-folders/', { name: 'server-probe-folder', world_id: cfg.worldId }));
      const dup = await api('POST', '/api/image-folders/', { name: 'Server-Probe-Folder', world_id: cfg.worldId });
      step('a second top-level folder with the same name is refused', !!f1?.folder?.id && dup.status === 409, `${f1?.folder?.id ? 'made' : 'not made'} then ${dup.status}`);
      const child = await json(await api('POST', '/api/image-folders/', { name: 'server-probe-child', world_id: cfg.worldId, parent_id: f1?.folder?.id }));
      const moved = await json(await api('PUT', '/api/images/bulk', { ids, folder_id: f1?.folder?.id }));
      step('a bulk move files every image in one request', moved?.moved === 2, JSON.stringify(moved));
      const gone = await json(await api('DELETE', `/api/image-folders/${f1?.folder?.id}`));
      const listed = await json(await api('GET', `/api/images/?world_id=${cfg.worldId}&search=server-probe`));
      step('a folder deletes with its subfolders and the images return to Unsorted', gone?.subfolders === 1 && !!child?.folder?.id && (listed?.images || []).filter((i) => ids.includes(i.id)).every((i) => i.folderId == null), `subfolders ${gone?.subfolders}`);
      const del = await json(await api('DELETE', '/api/images/bulk', { ids }));
      step('a bulk delete removes every image in one request', del?.deleted === 2, JSON.stringify(del));
    } else step('two probe images to file and delete', false, JSON.stringify([lb, second]).slice(0, 160));
  }
  // the default root map follows a world rename while it still reads '<world> — World Map'
  {
    const wj = await json(await dm('GET', `/worlds/${cfg.worldId}`));
    const maps = await json(await dm('GET', `/worlds/${cfg.worldId}/maps`));
    const root = (maps?.maps || []).find((m) => m.id === wj?.world?.rootMapId);
    if (wj?.world && root && root.title === `${wj.world.name} — World Map`) {
      const newName = `${wj.world.name}~`;
      const r1 = await dm('PATCH', `/worlds/${cfg.worldId}`, { name: newName });
      const m2 = await json(await dm('GET', `/worlds/${cfg.worldId}/maps`));
      const t2 = (m2?.maps || []).find((m) => m.id === root.id)?.title;
      await dm('PATCH', `/worlds/${cfg.worldId}`, { name: wj.world.name });
      step('the default root map follows a world rename', r1.ok && t2 === `${newName} — World Map`, String(t2));
    } else step('the default root map follows a world rename', true, 'skipped: the root has its own name');
  }
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
