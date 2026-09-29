// Mint a fresh DM token for the throwaway account (a token lasts 24 h) from the login kept in
// dm.config.json, check it is that account's, and write it back. watch.sh runs this whenever the
// stored token is dead: a dead token loops the browser suite on the sign-in redirect and trips
// the sign-in rate limit.
import { readFileSync, writeFileSync } from 'fs';
const url = new URL('./dm.config.json', import.meta.url);
const cfg = JSON.parse(readFileSync(url, 'utf8'));
const BASE = process.env.BASE_URL || cfg.baseUrl || 'https://timeline-map-production.up.railway.app';
if (!cfg.login?.email || !cfg.login?.password) { console.error('dm.config.json has no login {email, password} — see README.md'); process.exit(2); }
const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: cfg.login.email, password: cfg.login.password }) });
const j = await r.json().catch(() => ({}));
if (!j.token) { console.error(`sign-in refused: ${r.status} ${j.message || ''}`); process.exit(1); }
const me = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${j.token}` } });
const u = (await me.json().catch(() => ({}))).user;
if (me.status !== 200 || u?.id !== cfg.user?.id) { console.error(`that token is not user ${cfg.user?.id}'s: ${me.status} ${u?.id}`); process.exit(1); }
cfg.token = j.token;
writeFileSync(url, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
const exp = JSON.parse(Buffer.from(j.token.split('.')[1], 'base64url').toString()).exp;
console.log(`token for user ${u.id} until ${new Date(exp * 1000).toISOString()}`);
