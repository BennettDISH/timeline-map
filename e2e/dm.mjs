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
  // the outline tool: three corners, Enter closes, a region appears and the new place is selected
  if (await page.locator('.toolbar button', { hasText: 'Outline' }).count()) {
    const regionsBefore = await page.locator('.atlas .region').count();
    await page.locator('.toolbar button', { hasText: 'Outline' }).click();
    await page.waitForTimeout(300);
    const wb = await page.locator('.mp-world').boundingBox();
    const vb = await page.locator('.mp-viewport').boundingBox();
    const L = Math.max(wb.x, vb.x), T = Math.max(wb.y, vb.y), R = Math.min(wb.x + wb.width, vb.x + vb.width), B = Math.min(wb.y + wb.height, vb.y + vb.height);
    const at = (fx, fy) => [L + (R - L) * fx, T + (B - T) * fy];
    // a triangle 15% wide in a spot no pin touches, so the probes hit the region and not a pin
    const pinBoxes = await page.evaluate(() => [...document.querySelectorAll('.atlas .pin')].map((el) => { const b = el.getBoundingClientRect(); return [b.x - 12, b.y - 12, b.right + 12, b.bottom + 12]; }));
    const free = ([fx, fy]) => { const [x0, y0] = at(fx, fy), [x1, y1] = at(fx + 0.15, fy + 0.15); return !pinBoxes.some(([a, b, c, d]) => a < x1 && c > x0 && b < y1 && d > y0); };
    const origin = [[0.55, 0.55], [0.08, 0.75], [0.75, 0.08], [0.08, 0.08], [0.75, 0.75], [0.4, 0.3], [0.3, 0.6]].find(free) || [0.55, 0.55];
    const [ox, oy] = origin;
    const corners = [[ox, oy], [ox + 0.15, oy], [ox + 0.07, oy + 0.15]];
    for (const [fx, fy] of corners) { const [x, y] = at(fx, fy); await page.mouse.click(x, y); await page.waitForTimeout(200); }
    const dots = await page.locator('.atlas .ovtx').count();
    step('three corners show while outlining', dots === 3, `${dots} corner dots`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    const regionsAfter = await page.locator('.atlas .region').count();
    step('Enter closes the outline into a region', regionsAfter === regionsBefore + 1, `${regionsBefore} → ${regionsAfter}`);
    step('the new place is selected (region + pin)', (await page.locator('.atlas .region.sel').count()) === 1 && (await page.locator('.atlas .pin.sel').count()) === 1);
    // selecting something else, then a click inside the region (away from its anchor pin) selects it again
    const other = page.locator('.atlas .pin:not(.sel)').first();
    if (await other.count()) { await other.click({ force: true }); await page.waitForTimeout(400); }
    const [ix, iy] = at(ox + 0.03, oy + 0.02);
    const top = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? el.tagName + '.' + (el.getAttribute('class') || '') : 'nothing'; }, [ix, iy]);
    step('the region is the topmost element inside its outline', /^polygon\.region/.test(top), top);
    await page.mouse.click(ix, iy);
    await page.waitForTimeout(500);
    step('a click inside the region selects it', (await page.locator('.atlas .region.sel').count()) === 1);
    // players get the outline too: the share payload carries it and the Player View draws it
    const mapNow = page.url().split('/m/')[1];
    if (cfg.shareToken) {
      try {
        const sm = await (await fetch(`${BASE}/api/share/${cfg.shareToken}/maps/${mapNow}`)).json();
        const shaped = (sm.placements || []).filter((x) => Array.isArray(x.shape) && x.shape.length >= 3).length;
        step('the share payload carries the outline', shaped >= 1, `${shaped} outlined placement(s) for players`);
        const pp = await ctx.newPage();
        await pp.goto(`${BASE}/p/${cfg.shareToken}/m/${mapNow}`, { waitUntil: 'networkidle', timeout: 90000 });
        await pp.waitForSelector('.pview .mp-world', { timeout: 30000 });
        await pp.waitForTimeout(800);
        const pr = await pp.locator('.pview .region').count();
        step('the Player View draws the region', pr >= 1, `${pr} region(s)`);
        if (pr) {
          const rb = await pp.locator('.pview .region').first().boundingBox();
          await pp.mouse.click(rb.x + rb.width * 0.3, rb.y + rb.height * 0.2);
          const opened = await pp.locator('.pview .sheet').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
          step('tapping the region opens its sheet for players', opened);
        }
        await pp.close();
      } catch (e) { step('player-side outline checks ran', false, e.message.slice(0, 120)); }
    } else step('player-side outline checks (needs shareToken in dm.config.json)', true, 'skipped');
    // clean up: the throwaway world does not keep the test's place
    try {
      const auth = { headers: { Authorization: `Bearer ${cfg.token}` } };
      const m = await (await fetch(`${BASE}/api/atlas/maps/${mapNow}`, auth)).json();
      let removed = 0;
      for (const pl of (m.placements || []).filter((x) => x.shape)) { const r = await fetch(`${BASE}/api/atlas/nodes/${pl.node.id}`, { ...auth, method: 'DELETE' }); if (r.ok) removed++; }
      step('the outlined test place is removed again', removed >= 1, `${removed} removed`);
    } catch (e) { step('the outlined test place is removed again', false, e.message.slice(0, 120)); }
  } else step('the toolbar offers ◌ Outline', false);
  step('no error boundary at the end', !(await boundary()));
  step('no page errors', out.errors.length === 0, out.errors.slice(0, 3).join(' | '));
} catch (e) { step('run completed', false, e.message.slice(0, 200)); }
await browser.close();
console.log(JSON.stringify({ pass: out.steps.filter((s) => s.ok).length, fail: out.steps.filter((s) => !s.ok).length }));
