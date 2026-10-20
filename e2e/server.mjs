// API probes against the live deploy for the server-resilience package. Read-only probes run
// on the public fixture world; the write probes (player markers) run on the throwaway world in
// dm.config.json and are cleaned up through the DM API, so nothing lands on a real world.
// E2E_CONFIG names another config; the local one (e2e/local.mjs) names its own world as the
// fixture (`fixtureToken`), since the live fixture world is not there.
import { liveOptIn } from './live.mjs';
import { readFileSync, existsSync } from 'fs';
const cfgUrl = process.env.E2E_CONFIG || new URL('./dm.config.json', import.meta.url);
const cfg = existsSync(cfgUrl) ? JSON.parse(readFileSync(cfgUrl)) : null;
const BASE = process.env.BASE_URL || cfg?.baseUrl || 'https://timeline-map-production.up.railway.app';
liveOptIn(BASE);
const FIXTURE = process.env.SHARE_TOKEN || cfg?.fixtureToken || 'fx89ef1c8ec74cadc99ae56b256c46b337';
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
  const mark = (mapId, title, more = {}) => fetch(`${BASE}/api/share/${cfg.shareToken}/maps/${mapId}/nodes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, x: 1, y: 1, ...more }),
  });
  // a signed-in answer is never cached, nor answered 304: a browser hands a stored response's
  // headers back on a 304, and a cached X-Refreshed-Token came back expired after every sign-in
  {
    const first = await dm('GET', `/worlds/${cfg.worldId}`);
    const etag = first.headers.get('etag');
    step('a signed-in answer tells the browser not to store it', /no-store/.test(first.headers.get('cache-control') || ''), first.headers.get('cache-control') || 'no Cache-Control');
    // max-age=0 is what a browser revalidates with; without it fetch adds no-cache, which Express
    // never answers with a 304, so the check would pass on a server that still sends them
    const again = await fetch(`${BASE}/api/atlas/worlds/${cfg.worldId}`, { headers: { ...H, 'If-None-Match': etag || '', 'Cache-Control': 'max-age=0' } });
    step('…and a matching If-None-Match still gets the whole answer, never a 304', etag && again.status === 200, `${again.status}${etag ? '' : ' (no ETag to match)'}`);
  }
  // a moment the clock can't hold is no moment players may stand at: it resolves to now, never a 500
  {
    const at = (path) => fetch(`${BASE}/api/share/${cfg.shareToken}${path}`);
    const nodeId = (await json(await at(`/maps/${cfg.root}`)))?.placements?.[0]?.node?.id;
    for (const t of ['-99999999999', '99999999999', '-2147483649']) {
      const rs = [await at(`/maps/${cfg.root}?t=${t}`), await at(`/maps/${cfg.root}?t=${t}&window=1`),
        ...(nodeId ? [await at(`/nodes/${nodeId}?t=${t}`), await at(`/nodes/${nodeId}/locate?t=${t}`)] : [])];
      step(`a moment past the clock's range (t=${t}) resolves to now on the map${nodeId ? ', an entry and its locate' : ''}`, rs.every((r) => r.status === 200), rs.map((r) => r.status).join('/'));
    }
  }
  for (const spelled of [`${cfg.root}.0`, `${cfg.root}e0`, `0${cfg.root}`]) {
    const r = await mark(spelled, 'server-probe');
    step(`a marker on a non-canonical map id (${spelled}) is refused before anything is written`, r.status === 404, String(r.status));
  }
  const title = `server-probe-${Date.now()}`;
  const made = await mark(cfg.root, title, { author: 'The Probe' });
  const body = await json(made);
  step('a marker on the canonical id lands whole (node + placement in one statement)', made.status === 201 && body?.nodeId, `${made.status} ${JSON.stringify(body)}`);
  // what players then see (this was the live share suite's one write, onto the fixture world)
  const seen = (await json(await fetch(`${BASE}/api/share/${cfg.shareToken}/maps/${cfg.root}?window=1`)))
    ?.placements?.find((p) => p.node?.title === title);
  step('…players see it in the server-forced player tier, signed as sent', seen?.node?.player === true && seen?.node?.author === 'The Probe', JSON.stringify(seen?.node ?? null).slice(0, 160));
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
    await t('a clock moment past what the clock can hold is refused with a sentence, not a 500', 'PATCH', `/worlds/${cfg.worldId}`, { timeline_max_time: 99999999999 }, 400, (b) => /whole/.test(b?.message || ''));
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
  // secrecy through the DM's own acts: a placement hidden on one map stays hidden when 👁 Players
  // is pressed again on an entry players already see (or a marker is kept as canon); only an entry
  // that was DM-only brings its DM-only placements out with it
  {
    const n = await json(await dm('POST', `/maps/${cfg.root}/nodes`, { title: 'server-probe-hidden-here', x: 3, y: 3 }));
    const second = n?.nodeId && await json(await dm('POST', `/maps/${cfg.root}/placements`, { node_id: n.nodeId, x: 4, y: 4 }));
    if (n?.nodeId && second?.placementId) {
      const seen = async () => (await json(await fetch(`${BASE}/api/share/${cfg.shareToken}/maps/${cfg.root}?window=1`)))?.placements?.map((p) => p.id) || [];
      await dm('PATCH', `/nodes/${n.nodeId}`, { visibility: 'shared' });
      await dm('PATCH', `/placements/${second.placementId}`, { visibility: 'dm' });
      let ids = await seen();
      step('a placement hidden on its map is left out of the Player View', ids.includes(n.placementId) && !ids.includes(second.placementId), ids.includes(n.placementId) ? '' : 'the shown placement is missing too');
      await dm('PATCH', `/nodes/${n.nodeId}`, { visibility: 'shared' });
      ids = await seen();
      step('…and stays hidden when 👁 Players is pressed again on the shared entry', !ids.includes(second.placementId));
      await dm('PATCH', `/placements/${second.placementId}`, { visibility: 'dm' });
      await dm('PATCH', `/nodes/${n.nodeId}`, { visibility: 'player' });
      await dm('PATCH', `/nodes/${n.nodeId}`, { visibility: 'shared' });
      ids = await seen();
      step('…and when a marker is kept as canon', !ids.includes(second.placementId));
      await dm('PATCH', `/placements/${second.placementId}`, { visibility: 'dm' });
      await dm('PATCH', `/nodes/${n.nodeId}`, { visibility: 'dm' });
      await dm('PATCH', `/nodes/${n.nodeId}`, { visibility: 'shared' });
      ids = await seen();
      step('revealing a DM-only entry brings its DM-only placements out with it', ids.includes(n.placementId) && ids.includes(second.placementId));
    } else step('a probe entry placed twice for the hide-here rule', false, JSON.stringify([n, second]));
    // a map's focus period is a DM tool: players get only moments they may stand at, in both forms
    const inner = n?.nodeId && await json(await dm('POST', `/nodes/${n.nodeId}/interior`, { view: 'map' }));
    const pw = await json(await fetch(`${BASE}/api/share/${cfg.shareToken}/world`));
    const tl = pw?.world?.timeline;
    if (inner?.mapId && tl?.enabled && tl.current != null) {
      const env = [...(pw.world.eras || []).map((e) => [e.start, e.end]), [tl.current, tl.current]];
      const first = Math.min(...env.map(([a]) => a));
      await dm('PATCH', `/nodes/${n.nodeId}`, { visibility: 'shared' });
      const set = await dm('PATCH', `/maps/${inner.mapId}`, { focus_start: first - 3, focus_end: tl.current + 3 });
      const allowed = (v) => v == null || env.some(([a, b]) => v >= a && v <= b);
      for (const [form, q] of [['one-moment', ''], ['windowed', '?window=1']]) {
        const m = (await json(await fetch(`${BASE}/api/share/${cfg.shareToken}/maps/${inner.mapId}${q}`)))?.map;
        step(`a focus period reaching into hidden time sends only moments players may stand at (${form})`, set.ok && m && allowed(m.focusStart) && allowed(m.focusEnd), `${m?.focusStart}–${m?.focusEnd}`);
      }
    } else step('a focus period reaching into hidden time (needs the clock on the throwaway world)', !tl?.enabled, 'skipped');
    if (n?.nodeId) step('the hide-here probe entry is removed again', (await dm('DELETE', `/nodes/${n.nodeId}`)).ok);
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
  // a world named to the full 255 characters still opens: its root map's title gives up the
  // name's tail rather than overflowing the column (it used to fail, and the world never opened)
  {
    const stamp = String(Date.now()), name = `long-name-probe-${'x'.repeat(255 - 16 - stamp.length)}${stamp}`;
    const made = await fetch(`${BASE}/api/worlds`, { method: 'POST', headers: H, body: JSON.stringify({ name }) });
    const wid = (await json(made))?.world?.id;
    try {
      const opened = await dm('GET', `/worlds/${wid}`); const w = (await json(opened))?.world;
      const root = w?.rootMapId ? (await json(await dm('GET', `/maps/${w.rootMapId}`)))?.map : null;
      step('a world with a 255-character name opens, its world map titled within the column', made.status === 201 && opened.status === 200 && root?.title?.endsWith(' — World Map') && root.title.length <= 255,
        `${made.status}/${opened.status} ${root?.title?.length ?? 'no root'}`);
    } finally {
      if (wid) await fetch(`${BASE}/api/worlds/${wid}`, { method: 'DELETE', headers: H });
    }
  }
} else {
  step('marker probes need dm.config.json (shareToken, token, root)', false, 'skipped');
}

// The spend guard, on the local stack only: its second server (cfg.paid) runs the Forge, voices
// and R2 against stubs (e2e/stubs.cjs) with tiny daily caps, and its control port counts the
// calls that reach a provider and mints throwaway accounts. Live, no paid call is ever made.
if (cfg?.paid) {
  const P = cfg.paid, caps = P.caps;
  const ctl = async (p, body) => json(await fetch(`${P.stubUrl}${p}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}));
  const as = (u, base = P.baseUrl) => async (method, p, body) => {
    const r = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await json(r) };
  };
  const made = [];
  // a fresh account with a world, its world map and one entry on it
  const account = async (kind = {}) => {
    const u = await ctl('/user', kind);
    const call = as(u);
    const wid = (await call('POST', '/api/worlds', { name: `spend-probe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })).body?.world?.id;
    if (wid) made.push([call, wid]);
    const root = (await call('GET', `/api/atlas/worlds/${wid}`)).body?.world?.rootMapId;
    const node = (await call('POST', `/api/atlas/maps/${root}/nodes`, { title: 'Spend probe', x: 50, y: 50 })).body?.nodeId;
    return { ...u, call, wid, root, node };
  };
  const chat = (u, message) => u.call('POST', `/api/forge/worlds/${u.wid}/chat`, { message });
  const paint = (u) => u.call('POST', `/api/forge/nodes/${u.node}/art`, {});
  const said = (r) => r.body?.message || '';
  const allowance = async (u, kind = 'forge', base) => (await as(u, base)('GET', `/api/${kind}/status`)).body?.allowance;
  try {
    await ctl('/reset', {}); // today's counters start empty, so a rerun on the same stack holds
    const dm = await account();
    const a0 = await allowance(dm);
    step('the Forge status tells an account its allowance for today', a0?.limit === caps.FORGE_DAILY_CAP && a0.used === 0 && a0.left === caps.FORGE_DAILY_CAP && !!a0.resetsAt, JSON.stringify(a0));

    let c0 = await ctl('/calls');
    let r = await chat(dm, 'paint 1');
    let c1 = await ctl('/calls');
    step('a chat turn that paints one picture spends two uses: the turn and the painting', r.status === 200 && r.body?.batch && c1.text - c0.text === 1 && c1.image - c0.image === 1 && (await allowance(dm))?.used === 2,
      `${r.status} ${c1.text - c0.text} text, ${c1.image - c0.image} image, ${r.body?.applyError || ''}`);
    r = await chat(dm, 'paint 3');
    const c2 = await ctl('/calls');
    step('a proposal wanting more paintings than are left changes nothing and says how many are left', r.status === 200 && !r.body?.batch && c2.image === c1.image
      && /wanted 3 paintings and only 1 Forge use is left today/.test(r.body?.applyError || ''), `${r.status} ${r.body?.applyError}`);
    r = await paint(dm);
    step('✦ Paint on an entry is one use', r.status === 200 && r.body?.image?.id && (await allowance(dm))?.used === caps.FORGE_DAILY_CAP, `${r.status} ${said(r)}`);

    c0 = await ctl('/calls');
    const past = [await paint(dm), await dm.call('POST', `/api/forge/maps/${dm.root}/backdrop`, {}), await chat(dm, 'one more')];
    c1 = await ctl('/calls');
    const want = new RegExp(`^You've used today's ${caps.FORGE_DAILY_CAP} Forge uses \\(chat turns and paintings\\) — they come back at midnight UTC, in `);
    step('past the cap a painting, a backdrop and a chat turn are 429s with one sentence, and none reaches the provider',
      past.every((x) => x.status === 429 && want.test(said(x))) && c1.text === c0.text && c1.image === c0.image, `${past.map((x) => x.status).join('/')} ${said(past[2])}`);
    const tail = (await dm.call('GET', `/api/forge/worlds/${dm.wid}`)).body?.messages || [];
    step('…and the refused turn is not stored as said to the mind', tail.length && !tail.some((m) => m.content === 'one more'), (tail.slice(-1)[0]?.content || '').replace(/\n/g, ' '));
    const a1 = await allowance(dm);
    const a2 = await allowance(dm, 'forge', BASE);
    step('the count is in the database: the other server process (never sent a call) reads the same uses, so a restart keeps them',
      a1?.used === caps.FORGE_DAILY_CAP && a1.left === 0 && a2?.used === caps.FORGE_DAILY_CAP, `paid ${JSON.stringify(a1)} / other ${JSON.stringify(a2)}`);

    const guest = await account({ guest: true });
    const g = [await chat(guest, 'hello'), await chat(guest, 'hello again')];
    step(`a guest gets the guest cap (${caps.FORGE_DAILY_CAP_GUEST}) and its own sentence`, g[0].status === 200 && g[1].status === 429
      && new RegExp(`^Guests get ${caps.FORGE_DAILY_CAP_GUEST} Forge use${caps.FORGE_DAILY_CAP_GUEST === 1 ? '' : 's'} a day, and today's are used`).test(said(g[1])), `${g.map((x) => x.status).join('/')} ${said(g[1])}`);
    await guest.call('POST', `/api/voice/nodes/${guest.node}/voice`, { voice_id: 'Kore', voice_name: 'Kore' });
    r = await guest.call('POST', `/api/voice/nodes/${guest.node}/line`, { text: 'Hello' });
    step('a guest cap of 0 shuts the door with a sentence (voice here)', r.status === 429 && /^Voice is not open to guests/.test(said(r)), `${r.status} ${said(r)}`);

    const racer = await account();
    const race = await Promise.all(Array.from({ length: caps.FORGE_DAILY_CAP + 2 }, () => paint(racer)));
    step(`${caps.FORGE_DAILY_CAP + 2} paintings at once on a cap of ${caps.FORGE_DAILY_CAP}: exactly ${caps.FORGE_DAILY_CAP} are made, the rest are 429s`,
      race.filter((x) => x.status === 200).length === caps.FORGE_DAILY_CAP && race.filter((x) => x.status === 429).length === 2, race.map((x) => x.status).join('/'));

    // everyone so far: the dm's cap, the guest's one, the racer's cap; the next account reaches the ceiling
    const other = await account();
    const room = caps.FORGE_DAILY_CEILING - 2 * caps.FORGE_DAILY_CAP - caps.FORGE_DAILY_CAP_GUEST;
    const fills = [];
    for (let i = 0; i < room; i++) fills.push(await paint(other));
    r = await chat(other, 'hello');
    const ao = await allowance(other);
    step('the daily ceiling stops an account that still has uses of its own, with its own sentence', room > 0 && room < caps.FORGE_DAILY_CAP && fills.every((x) => x.status === 200)
      && r.status === 429 && /^The Forge has reached its daily limit for everyone — it opens again at midnight UTC/.test(said(r)) && ao?.used === room && ao.left === 0,
    `${fills.map((x) => x.status).join('/')} then ${r.status} ${said(r)} ${JSON.stringify(ao)}`);

    const admin = await account({ admin: true });
    c0 = await ctl('/calls');
    r = await chat(admin, 'paint 2');
    c1 = await ctl('/calls');
    const aa = await allowance(admin);
    const still = await chat(other, 'and now?');
    step('an admin is never capped, even past the ceiling, and does not spend it; their use is still counted', r.status === 200 && r.body?.batch && c1.image - c0.image === 2
      && aa?.limit === null && aa.used === 3 && still.status === 429, `${r.status} ${r.body?.applyError || ''} ${JSON.stringify(aa)} other ${still.status}`);

    // a copy carries no Forge cards, so a pending batch's work would land in it as kept work that
    // its players see at once: the copy waits until the card is kept or unmade
    const pending = r.body?.batch?.batchId;
    const copy = () => admin.call('POST', '/api/atlas/worlds/clone', { source_id: admin.wid, name: `copy-probe-${Date.now()}` });
    let cp = await copy();
    if (cp.body?.worldId) made.push([admin.call, cp.body.worldId]);
    step("a world with a Forge card waiting can't be copied, and the DM is told why", pending && cp.status === 409 && /^Keep or Unmake the Forge's cards in /.test(said(cp)), `${cp.status} ${said(cp)}`);
    const kept = await admin.call('POST', `/api/forge/worlds/${admin.wid}/batches/${pending}/keep`);
    cp = await copy();
    if (cp.body?.worldId) made.push([admin.call, cp.body.worldId]);
    step('…and once the card is kept the copy is made', kept.status === 200 && cp.status === 201 && !!cp.body?.worldId, `${kept.status} then ${cp.status} ${said(cp)}`);

    // voice: a line and an ambience are one use each
    await dm.call('POST', `/api/voice/nodes/${dm.node}/voice`, { voice_id: 'Kore', voice_name: 'Kore' });
    c0 = await ctl('/calls');
    const lines = [];
    for (const text of ['One', 'Two', 'Three']) {
      lines.push(await dm.call('POST', `/api/voice/nodes/${dm.node}/line`, { text }));
      await dm.call('DELETE', `/api/voice/nodes/${dm.node}/line`);
    }
    const amb = await dm.call('POST', `/api/voice/maps/${dm.root}/ambience`, { prompt: 'rain on the roof' });
    c1 = await ctl('/calls');
    const vwant = new RegExp(`^You've used today's ${caps.VOICE_DAILY_CAP} voice recordings \\(lines and ambiences\\) — they come back at midnight UTC`);
    step(`voice: ${caps.VOICE_DAILY_CAP} lines on a cap of ${caps.VOICE_DAILY_CAP}, then a line and an ambience are 429s, and neither reaches the provider`,
      lines.slice(0, 2).every((x) => x.status === 200) && [lines[2], amb].every((x) => x.status === 429 && vwant.test(said(x))) && c1.speech - c0.speech === 2 && c1.ambience === c0.ambience,
      `${lines.map((x) => x.status).join('/')} ${amb.status} ${said(amb)} speech ${c1.speech - c0.speech}`);
    await other.call('POST', `/api/voice/nodes/${other.node}/voice`, { voice_id: 'Kore', voice_name: 'Kore' });
    const oamb = await other.call('POST', `/api/voice/maps/${other.root}/ambience`, { prompt: 'wind in the reeds' });
    const oline = await other.call('POST', `/api/voice/nodes/${other.node}/line`, { text: 'Hello' });
    const av = await allowance(dm, 'voice');
    step('voice has its own ceiling: an ambience fills it, the next line is refused for everyone', oamb.status === 200 && oline.status === 429
      && /^Voice has reached its daily limit for everyone/.test(said(oline)) && av?.used === caps.VOICE_DAILY_CAP && av.left === 0, `${oamb.status} ${said(oamb)} / ${oline.status} ${said(oline)}`);
  } finally {
    for (const [call, wid] of made) await call('DELETE', `/api/worlds/${wid}`);
  }
}

// a JSON body of `null` is the caller's mistake: a 400 before the route, never a 500 (sign-out sends {})
const nullBody = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' });
step('a malformed JSON body is answered with a 4xx, not a 500', nullBody.status >= 400 && nullBody.status < 500, String(nullBody.status));
// no body at all reads as an empty one (Express 5's parser leaves it undefined): the route answers
// for itself — here a folder with no name is a 400 with a sentence, and nothing is written
if (cfg?.token) {
  const bare = await fetch(`${BASE}/api/image-folders/`, { method: 'POST', headers: { Authorization: `Bearer ${cfg.token}` } });
  step('a POST with no body is answered by its route, never a 500', bare.status === 400, `${bare.status} ${(await json(bare))?.message || ''}`);
}
const health = await fetch(`${BASE}/health`);
step('the server answers /health', health.status === 200, String(health.status));
const failed = steps.filter((s) => !s).length;
console.log(JSON.stringify({ pass: steps.length - failed, fail: failed }));
process.exitCode = failed ? 1 : 0;
