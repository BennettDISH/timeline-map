// The DM workspace in a real browser, on a throwaway world: the footstep-link crash path,
// the double-click guard, timebar ticks, and no error boundary anywhere.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
// config: dm.config.json beside this file (gitignored) — a throwaway DM account + world, see README.md
const cfg = JSON.parse(readFileSync(new URL('./dm.config.json', import.meta.url)));
const BASE = process.env.BASE_URL || cfg.baseUrl || 'https://timeline-map-production.up.railway.app';
const out = { errors: [], steps: [] };
const step = (name, ok, note = '') => { out.steps.push({ name, ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(({ token, user }) => { localStorage.setItem('auth_token', token); localStorage.setItem('user', JSON.stringify(user)); }, { token: cfg.token, user: cfg.user });
const page = await ctx.newPage();
page.on('pageerror', (e) => out.errors.push(`pageerror: ${e.message.slice(0, 160)}`));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|widget/i.test(m.text())) out.errors.push(`console: ${m.text().slice(0, 160)}`); });
const boundary = async () => (await page.locator('.app-error-boundary').count()) > 0;
try {
  await page.goto(`${BASE}/w/${cfg.worldId}/m/${cfg.root}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForSelector('.atlas .pin', { timeout: 30000 });
  step('workspace opens with pins', (await page.locator('.atlas .pin').count()) > 0);
  // View posture: the running surface
  await page.locator('.mode button', { hasText: 'View' }).click();
  await page.waitForTimeout(500);
  step('View posture shows the space reader', (await page.locator('.reader').count()) > 0);
  // the party pin at the lens moment (canon 37 → inside the interior; on the root it is a past print)
  // move the lens to footstep 15 so the party stands on the root map, then open it
  const tick = page.locator('.timebar .tstep').first();
  const ticks = await page.locator('.timebar .tstep').count();
  step('timebar shows footstep ticks', ticks >= 2, `${ticks} ticks`);
  // nothing may sit on top of a tick (the party chip once did)
  const covered = await page.evaluate(() => [...document.querySelectorAll('.timebar .tstep')].map((t) => { const b = t.getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return el === t ? null : (el ? el.className : 'nothing'); }).filter(Boolean));
  step('every tick is the topmost element at its centre', covered.length === 0, covered.length ? `covered by: ${covered.join(', ')}` : '');
  const labelBefore = (await page.locator('.timebar .tnowbtn').textContent()).trim();
  await tick.click();
  await page.waitForTimeout(800);
  const labelAfter = (await page.locator('.timebar .tnowbtn').textContent()).trim();
  step('a tick moves the lens (era-relative label)', labelAfter !== labelBefore && /footstep/.test(labelAfter), `${labelBefore} → ${labelAfter}`);
  const party = page.locator('.atlas .pin.party').first();
  step('the party pin is on the map at that moment', (await party.count()) > 0);
  await party.click({ force: true });
  await page.waitForTimeout(800);
  const link = page.locator('.reader .rtrail a', { hasText: 'Then on to' });
  step('the Party reader offers "Then on to …"', (await link.count()) > 0);
  if (await link.count()) {
    await link.click();
    await page.waitForTimeout(2500);
    const crashed = await boundary();
    step('following "Then on to" changes map WITHOUT the error boundary', !crashed && page.url().includes(`/m/${cfg.interior}`), crashed ? 'BOUNDARY SHOWN' : page.url().split('/m/')[1]);
    if (!crashed) step('the lens moved to the destination footstep', /Session 3/.test(await page.locator('.timebar .tnowbtn').textContent()), (await page.locator('.timebar .tnowbtn').textContent()).trim());
  }
  // Edit posture: double-clicking a pin without an interior must not navigate or create one
  await page.locator('.mode button', { hasText: 'Edit' }).click();
  await page.waitForTimeout(500);
  const before = page.url();
  const plain = page.locator('.atlas .pin:not(.open2):not(.party)').first();
  if (await plain.count()) {
    await plain.dblclick({ force: true });
    await page.waitForTimeout(1500);
    step('double-click on a pin without an interior stays put', page.url() === before, page.url() === before ? 'no navigation' : 'navigated!');
  } else step('a pin without an interior exists to test', false);
  step('no error boundary at the end', !(await boundary()));
  step('no page errors', out.errors.length === 0, out.errors.slice(0, 3).join(' | '));
} catch (e) { step('run completed', false, e.message.slice(0, 200)); }
await browser.close();
console.log(JSON.stringify({ pass: out.steps.filter((s) => s.ok).length, fail: out.steps.filter((s) => !s.ok).length }));
