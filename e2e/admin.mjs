// The admin's look-only browse against a real Postgres: the local stack only (e2e/local.mjs), on
// its "paid" server, whose ADMIN_CENTRAL_USER_IDS names the account the stubs' control port mints
// as admin. It mints its own throwaway accounts there (enough to need a second page) and reads
// the seeded "Proving ground"; it never writes a world. Live it does nothing: the live Atlas has
// no control port, and its admin is Bennett.
//
//   E2E_CONFIG=e2e/local.config.json node e2e/admin.mjs
import { readFileSync, existsSync } from 'fs';
const cfgUrl = process.env.E2E_CONFIG || new URL('./dm.config.json', import.meta.url);
const cfg = existsSync(cfgUrl) ? JSON.parse(readFileSync(cfgUrl)) : null;
if (!cfg?.paid) {
  console.log('skipped: the admin suite runs on the local stack only (E2E_CONFIG=e2e/local.config.json)');
  process.exit(0);
}
const BASE = cfg.paid.baseUrl;
const steps = [];
const step = (name, ok, note = '') => { steps.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`); };
const mint = async (kind = {}) => (await fetch(`${cfg.paid.stubUrl}/user`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kind) })).json();
const as = (who) => async (path) => {
  const r = await fetch(`${BASE}/api/admin${path}`, { headers: who ? { Authorization: `Bearer ${who.token}` } : {} });
  const text = await r.text();
  let body = null; try { body = JSON.parse(text); } catch (e) { /* not JSON */ }
  return { status: r.status, body, text };
};

const LISTS = ['/users', '/worlds', '/maps', '/nodes', '/eras', '/images', '/forge/messages', '/forge/batches'];
const dm = await mint();
const admin = await mint({ admin: true });
const guest = await mint({ guest: true });
const A = as(admin);

// who gets in
{
  const outs = [];
  for (const path of [...LISTS, '/summary', `/worlds/${cfg.worldId}`, `/maps/${cfg.root}`]) {
    outs.push([path, (await as(null)(path)).status, (await as(dm)(path)).status, (await as(guest)(path)).status]);
  }
  step('signed out is a 401, a DM and a guest get 403, on every admin route', outs.every(([, a, b, c]) => a === 401 && b === 403 && c === 403),
    outs.filter(([, a, b, c]) => a !== 401 || b !== 403 || c !== 403).map((o) => o.join(' ')).join('; '));
  const all = [];
  for (const path of LISTS) all.push([path, await A(path)]);
  step('the admin reads every list from the real database', all.every(([, r]) => r.status === 200 && Array.isArray(r.body?.items)),
    all.filter(([, r]) => r.status !== 200).map(([p, r]) => `${p} ${r.status} ${r.body?.message || ''}`).join('; '));
}

// paging: enough accounts for a second page, and the two pages never overlap
{
  for (let i = 0; i < 52; i++) await mint();
  const p1 = await A('/users'), p2 = await A('/users?page=2');
  const ids1 = new Set(p1.body.items.map((u) => u.id));
  step('accounts come 50 a page, the second page holds the rest, and no account is on both',
    p1.body.items.length === 50 && p1.body.total > 50 && p2.body.items.length === p1.body.total - 50 && p2.body.items.every((u) => !ids1.has(u.id))
      && p1.body.pages === Math.ceil(p1.body.total / 50),
    `total ${p1.body.total}, page 1 ${p1.body.items.length}, page 2 ${p2.body.items.length}`);
  const far = await A('/users?page=999');
  step('a page past the end is empty, not an error', far.status === 200 && far.body.items.length === 0 && far.body.page === 999, String(far.status));
}

// search
{
  const byName = await A('/users?q=LOCAL-DM');
  step('search is case-blind', byName.body?.items?.some((u) => u.username === 'local-dm'), JSON.stringify(byName.body?.items?.map((u) => u.username)));
  const pct = await A(`/users?q=${encodeURIComponent('%')}`), under = await A('/users?q=_');
  step('% and _ are plain characters, not wildcards', pct.body?.total === 0 && under.body?.total === 0, `% ${pct.body?.total}, _ ${under.body?.total}`);
  const byId = await A(`/worlds?q=%23${cfg.worldId}`);
  step('#id finds a world by its id', byId.body?.items?.some((w) => w.id === cfg.worldId), JSON.stringify(byId.body?.items?.map((w) => w.id)));
  const keep = await A(`/nodes?world=${cfg.worldId}&q=keep`);
  step('entries search within one world', keep.body?.items?.some((n) => n.title === 'The Keep') && keep.body.items.every((n) => n.worldId === cfg.worldId),
    JSON.stringify(keep.body?.items?.map((n) => n.title)));
  const owner = await A(`/worlds?owner=${cfg.user.id}`);
  step("an account's worlds", owner.body?.items?.some((w) => w.name === 'Proving ground') && owner.body.items.every((w) => w.owner?.id === cfg.user.id),
    JSON.stringify(owner.body?.items?.map((w) => w.name)));
  const bad = await A('/nodes?world=abc');
  step('a world filter that is not an id is a 400', bad.status === 400, String(bad.status));
}

// the read-only world
{
  const w = (await A(`/worlds/${cfg.worldId}`)).body?.world;
  step('a world opens with its clock, eras, maps and counts', w?.name === 'Proving ground' && w.eras.length === 4 && w.maps.some((m) => m.isRoot && m.id === cfg.root)
    && w.timeline.unit === 'footsteps' && w.counts.nodes >= 5, JSON.stringify({ eras: w?.eras?.length, maps: w?.maps?.length, counts: w?.counts }));
  const m = (await A(`/maps/${cfg.root}`)).body;
  const vault = m?.placements?.find((p) => p.node.title === 'Sealed Vault');
  step('a map shows every placement, DM-only ones too', m?.placements?.some((p) => p.node.title === 'The Keep') && vault?.node.visibility === 'dm',
    JSON.stringify(m?.placements?.map((p) => `${p.node.title}:${p.node.visibility}`)));
  const party = (await A(`/nodes?world=${cfg.worldId}&q=party`)).body?.items?.find((n) => n.title === 'The Party');
  const n = party && (await A(`/nodes/${party.id}`)).body?.node;
  step('an entry opens whole: its facts through time and every placement', n?.facts?.length === 2 && n.placements.length === 2 && n.body === 'Four travellers.',
    JSON.stringify({ facts: n?.facts?.length, placements: n?.placements?.length }));
  const missing = await A('/worlds/999999');
  step('a world that is not there is a 404', missing.status === 404, String(missing.status));
}

// nothing secret in any answer
{
  const texts = [];
  for (const path of [...LISTS, '/summary', `/worlds/${cfg.worldId}`, `/maps/${cfg.root}`]) texts.push([path, (await A(path)).text]);
  const leaks = texts.filter(([, t]) => t.includes(cfg.shareToken) || /password_hash|token_version|base64_data|storage_key|shareToken/.test(t) || t.includes('data:image'));
  step('no answer carries a password hash, a token, the share token or image bytes', leaks.length === 0, leaks.map(([p]) => p).join(', '));
}

const failed = steps.filter((s) => !s).length;
console.log(JSON.stringify({ pass: steps.length - failed, fail: failed }));
process.exitCode = failed ? 1 : 0;
