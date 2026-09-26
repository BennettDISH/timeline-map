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
  // the reader resizes from its own edge in View posture (the editor already did in Edit)
  {
    const reader = page.locator('.reader').first();
    const before = (await reader.boundingBox())?.width || 0;
    const grip = page.locator('.reader .rgrip').first();
    if (await grip.count()) {
      const gb = await grip.boundingBox();
      await page.mouse.move(gb.x + 3, gb.y + 200); await page.mouse.down();
      await page.mouse.move(gb.x - 60, gb.y + 200, { steps: 6 }); await page.mouse.move(gb.x - 120, gb.y + 200, { steps: 6 }); await page.mouse.up();
      await page.waitForTimeout(400);
      const after = (await reader.boundingBox())?.width || 0;
      step('the reader resizes from its edge', after > before + 80, `${Math.round(before)} → ${Math.round(after)}px`);
      await grip.dblclick(); await page.waitForTimeout(300);
    } else step('the reader has a resize grip', false);
  }
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
  step('a tick moves the lens (session label)', labelAfter !== labelBefore && /^Session \d+ · footstep \d+$/.test(labelAfter), `${labelBefore} → ${labelAfter}`);
  const party = page.locator('.atlas .pin.party').first();
  step('the party pin is on the map at that moment', (await party.count()) > 0);
  await party.click({ force: true });
  await page.waitForTimeout(800);
  const link = page.locator('.reader .rtrail a', { hasText: 'Then on to' });
  step('the Party reader offers "Then on to …"', (await link.count()) > 0);
  if (await link.count()) {
    const partyTitle = (await page.locator('.reader h3').first().textContent().catch(() => '')).trim();
    await link.click();
    await page.waitForTimeout(2500);
    const crashed = await boundary();
    step('following "Then on to" changes map WITHOUT the error boundary', !crashed && page.url().includes(`/m/${cfg.interior}`), crashed ? 'BOUNDARY SHOWN' : page.url().split('/m/')[1]);
    if (!crashed) step('the lens moved to the destination footstep', /Session 3/.test(await page.locator('.timebar .tnowbtn').textContent()), (await page.locator('.timebar .tnowbtn').textContent()).trim());
    const readerNow = (await page.locator('.reader h3').first().textContent().catch(() => '')).trim();
    step('the Party stays open on the other map', !crashed && readerNow === partyTitle, `reader: “${readerNow}”`);
  }
  // Edit posture: double-clicking a pin without an interior must not navigate or create one
  await page.locator('.mode button', { hasText: 'Edit' }).click();
  await page.waitForTimeout(500);
  const before = page.url();
  const plain = page.locator('.atlas .pin:not(.open2):not(.party)').first();
  if (await plain.count()) {
    await plain.dblclick({ force: true });
    await page.waitForTimeout(1500);
    const refusal = (await page.locator('.aflash').textContent().catch(() => '')).trim();
    // the click must have REACHED the pin and been refused, not just missed it
    step('double-click on a pin without an interior stays put', page.url() === before && /no interior/.test(refusal), page.url() === before ? (refusal ? `refused: “${refusal.slice(0, 50)}”` : 'no navigation, but no refusal shown') : 'navigated!');
  } else step('a pin without an interior exists to test', false);
  // the outline tool: three corners, Enter closes, a region appears and the new place is selected
  if (await page.locator('.toolbar button', { hasText: 'Outline' }).count()) {
    const regionsBefore = await page.locator('.atlas .region').count();
    // remember which outlined places already existed: the cleanup deletes only what this run makes
    const dmAuthH = { headers: { Authorization: `Bearer ${cfg.token}` } };
    const shapedIds = async () => new Set(((await (await fetch(`${BASE}/api/atlas/maps/${page.url().split('/m/')[1]}`, dmAuthH)).json()).placements || []).filter((x) => x.shape).map((x) => x.id));
    const shapedBefore = await shapedIds();
    const removeNew = async (label) => {
      try {
        const mapNowC = page.url().split('/m/')[1];
        const m = await (await fetch(`${BASE}/api/atlas/maps/${mapNowC}`, dmAuthH)).json();
        let removed = 0;
        for (const pl of (m.placements || []).filter((x) => x.shape && !shapedBefore.has(x.id))) { const r = await fetch(`${BASE}/api/atlas/nodes/${pl.node.id}`, { ...dmAuthH, method: 'DELETE' }); if (r.ok) removed++; }
        step(label, removed >= 1, `${removed} removed`);
      } catch (e) { step(label, false, e.message.slice(0, 120)); }
    };
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
    step('the new place is selected as a region, with no pin', (await page.locator('.atlas .region.sel').count()) === 1 && (await page.locator('.atlas .pin.sel').count()) === 0);
    step('the selected region shows its name label', (await page.locator('.atlas .rlabel.on').count()) >= 1);
    // selecting something else, then a click inside the region (away from its name anchor) selects it again
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
        // a new place is born DM-only: reveal it first, as the DM would, so the table can see the outline
        const dmAuth = { headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' } };
        const dmMap = await (await fetch(`${BASE}/api/atlas/maps/${mapNow}`, dmAuth)).json();
        for (const pl of (dmMap.placements || []).filter((x) => x.shape && x.node.visibility === 'dm')) {
          await fetch(`${BASE}/api/atlas/nodes/${pl.node.id}`, { ...dmAuth, method: 'PATCH', body: JSON.stringify({ visibility: 'shared' }) });
        }
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
    // clean up: the throwaway world does not keep the test's place (only the ones this run made)
    await removeNew('the outlined test place is removed again');
    // freehand: press and drag around a loop, Enter closes it into a region (the page still
    // shows the first, now-deleted region until it refreshes, so count relative to now)
    const before2 = await page.locator('.atlas .region').count();
    await page.locator('.toolbar button', { hasText: 'Outline' }).click();
    await page.waitForTimeout(300);
    const [cx, cy] = at(ox + 0.075, oy + 0.075);
    const rx = (R - L) * 0.06, ry = (B - T) * 0.06;
    await page.mouse.move(cx + rx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; await page.mouse.move(cx + rx * Math.cos(a), cy + ry * Math.sin(a)); }
    await page.mouse.up();
    await page.waitForTimeout(300);
    const traced = await page.locator('.atlas .ovtx').count();
    step('a freehand drag traces a loop of corners', traced >= 6 && traced <= 40, `${traced} corners after simplifying`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    // proof a NEW region exists: the drawing corners are gone, and the server holds a shaped
    // placement this run did not have before (the stale first region cannot satisfy that)
    const after2 = await page.locator('.atlas .region').count();
    const sel2 = await page.locator('.atlas .region.sel').count();
    const ovtx2 = await page.locator('.atlas .ovtx').count();
    const m2 = await (await fetch(`${BASE}/api/atlas/maps/${page.url().split('/m/')[1]}`, dmAuthH)).json().catch(() => ({}));
    const fresh = (m2.placements || []).filter((x) => x.shape && !shapedBefore.has(x.id)).length;
    step('Enter closes the traced loop into a region', after2 >= 1 && sel2 === 1 && ovtx2 === 0 && fresh >= 1, `${before2} → ${after2} region(s), ${sel2} selected, ${ovtx2} corners left, ${fresh} new on the server`);
    await removeNew('the traced test place is removed again');
  } else step('the toolbar offers ◌ Outline', false);
  // a DM note survives reselecting the node (it used to land under the wrong key and go stale)
  {
    const first = page.locator('.atlas .pin:not(.party)').first();
    if (await first.count()) {
      await first.click({ force: true }); await page.waitForTimeout(400);
      const notes = page.locator('.insp .dmnotes textarea');
      if (await notes.count()) {
        const before = await notes.inputValue();
        const probe = `probe-note-${Date.now()}`;
        await notes.fill(probe); await page.waitForTimeout(1200); // debounce + PATCH
        const other = page.locator('.atlas .pin:not(.party):not(.sel)').first();
        if (await other.count()) { await other.click({ force: true }); await page.waitForTimeout(300); }
        await first.click({ force: true }); await page.waitForTimeout(400);
        const shown = await page.locator('.insp .dmnotes textarea').inputValue();
        step('a DM note survives reselecting the node', shown === probe, shown.slice(0, 40));
        await page.locator('.insp .dmnotes textarea').fill(before); await page.waitForTimeout(1200);
      } else step('the inspector shows DM notes', false);
    }
  }
  // the map surface: a pan keeps the selection, a search hit is framed, an outline ends with the
  // posture, the zoom controls swallow their double-clicks, a pin has its own menu
  {
    const plain = page.locator('.atlas .pin:not(.party)').first();
    if (await plain.count()) {
      await plain.click({ force: true }); await page.waitForTimeout(400);
      const vb = await page.locator('.mp-viewport').boundingBox();
      const boxes = await page.evaluate(() => [...document.querySelectorAll('.atlas .pin, .atlas .region')].map((el) => { const b = el.getBoundingClientRect(); return [b.x - 16, b.y - 16, b.right + 16, b.bottom + 16]; }));
      const spots = [[0.5, 0.92], [0.08, 0.92], [0.92, 0.92], [0.08, 0.08], [0.92, 0.08], [0.5, 0.5]];
      const free = spots.map(([fx, fy]) => [vb.x + vb.width * fx, vb.y + vb.height * fy]).find(([x, y]) => !boxes.some(([a, b, c, d]) => x > a && x < c && y > b && y < d)) || [vb.x + vb.width / 2, vb.y + vb.height * 0.92];
      await page.mouse.move(free[0], free[1]); await page.mouse.down();
      await page.mouse.move(free[0] - 60, free[1] - 40, { steps: 6 }); await page.mouse.move(free[0] - 120, free[1] - 80, { steps: 6 }); await page.mouse.up();
      await page.waitForTimeout(400);
      step('a pan keeps the selected node in the editor', (await page.locator('.insp input[data-fld="title"]').count()) === 1);
      await page.mouse.click(free[0] - 120, free[1] - 80); await page.waitForTimeout(400);
      step('a clean tap on empty space deselects', (await page.locator('.insp input[data-fld="title"]').count()) === 0);
    }
    // a search hit off-screen is brought into view
    for (let i = 0; i < 5; i++) { await page.locator('.mp-controls button[aria-label="Zoom in"]').click(); await page.waitForTimeout(120); }
    const target = page.locator('.atlas .pin:not(.party) .lbl').first();
    const name = (await target.textContent().catch(() => '')).trim();
    if (name) {
      await page.keyboard.press('/'); await page.waitForTimeout(300);
      await page.keyboard.type(name.slice(0, 12)); await page.waitForTimeout(500);
      await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
      const sel = page.locator('.atlas .pin.sel').first();
      const sb = await sel.boundingBox().catch(() => null); const vb2 = await page.locator('.mp-viewport').boundingBox();
      const inView = !!sb && sb.x + sb.width / 2 > vb2.x && sb.x + sb.width / 2 < vb2.x + vb2.width && sb.y + sb.height / 2 > vb2.y && sb.y + sb.height / 2 < vb2.y + vb2.height;
      step('a search hit is framed on the map', inView, sb ? `pin at ${Math.round(sb.x)},${Math.round(sb.y)} in ${Math.round(vb2.x)}..${Math.round(vb2.x + vb2.width)}` : 'no selected pin');
    }
    const before = await page.locator('.mp-world').getAttribute('style');
    await page.locator('.mp-controls button[aria-label="Fit the whole map"]').dblclick(); await page.waitForTimeout(500);
    const fitOnce = await page.locator('.mp-world').getAttribute('style');
    await page.locator('.mp-controls button[aria-label="Fit the whole map"]').click(); await page.waitForTimeout(500);
    step('double-clicking Fit only fits (no zoom underneath)', fitOnce === (await page.locator('.mp-world').getAttribute('style')), before === fitOnce ? 'unchanged' : 'refit');
    // an outline begun in Edit ends with the posture
    const outlineBtn = page.locator('.toolbar button', { hasText: 'Outline' });
    if (await outlineBtn.count()) {
      await outlineBtn.click(); await page.waitForTimeout(200);
      const vb3 = await page.locator('.mp-viewport').boundingBox();
      await page.mouse.click(vb3.x + vb3.width * 0.3, vb3.y + vb3.height * 0.3); await page.waitForTimeout(200);
      await page.locator('.mode button', { hasText: 'View' }).click(); await page.waitForTimeout(400);
      step('switching posture cancels an outline in progress', (await page.locator('.drawhud').count()) === 0 && (await page.locator('.atlas .ovtx').count()) === 0);
      await page.locator('.mode button', { hasText: 'Edit' }).click(); await page.waitForTimeout(400);
    }
    // 🎭 Player posture is the real Player View, framed from the share link at the current map
    await page.locator('.mode button', { hasText: 'Player' }).click(); await page.waitForTimeout(600);
    if (cfg.shareToken) {
      const frameEl = page.locator('.atlas iframe.pframe');
      const src = (await frameEl.count()) ? await frameEl.getAttribute('src') : null;
      step('Player posture frames the share link at the current map', !!src && src.includes(`/p/${cfg.shareToken}/m/`), src || 'no frame');
      const inner = page.frameLocator('.atlas iframe.pframe');
      await inner.locator('.atlas.pview .pin, .atlas.pview .region, .atlas.pview .empty-map').first().waitFor({ timeout: 30000 }).catch(() => {});
      step('…and the framed Player View renders', (await inner.locator('.atlas.pview').count()) === 1);
      step('…with none of the DM chrome around it', (await page.locator('.atlas .rail, .atlas .insp, .atlas .gsearch, .atlas .timebar').count()) === 0);
    } else step('Player posture without a share link says so', (await page.locator('.atlas .preview-off').count()) === 1);
    await page.locator('.mode button', { hasText: 'Edit' }).click(); await page.waitForTimeout(400);
    // a right-click on a pin offers that pin's actions
    const pin2 = page.locator('.atlas .pin:not(.party)').first();
    if (await pin2.count()) {
      await pin2.click({ button: 'right', force: true }); await page.waitForTimeout(300);
      const items = (await page.locator('.ctxmenu button').allTextContents()).join(' | ');
      step("a right-click on a pin offers the pin's own actions", /Remove from this map/.test(items) && /Delete/.test(items), items.slice(0, 80));
      await page.keyboard.press('Escape'); await page.mouse.click(10, 300); await page.waitForTimeout(200);
    }
  }
  // the editor opens at the top for each newly selected thing; a just-dropped node opens with
  // its title focused and selected, ready to be typed over
  {
    const H2 = { headers: { Authorization: `Bearer ${cfg.token}` } };
    const pins = page.locator('.atlas .pin:not(.party)');
    if (await pins.count() >= 2) {
      await pins.nth(0).click({ force: true }); await page.waitForTimeout(400);
      await page.evaluate(() => { const el = document.querySelector('.insp'); if (el) el.scrollTop = 400; });
      await pins.nth(1).click({ force: true }); await page.waitForTimeout(400);
      const top = await page.evaluate(() => document.querySelector('.insp')?.scrollTop);
      step('the editor opens at the top for a newly selected thing', top === 0, `scrollTop ${top}`);
    }
    const addBtn = page.locator('.toolbar button', { hasText: 'Add entry' });
    if (await addBtn.count()) {
      await addBtn.click(); await page.waitForTimeout(300);
      const wb = await page.locator('.mp-world').boundingBox(); const vb = await page.locator('.mp-viewport').boundingBox();
      const L = Math.max(wb.x, vb.x), T = Math.max(wb.y, vb.y), R = Math.min(wb.x + wb.width, vb.x + vb.width), B = Math.min(wb.y + wb.height, vb.y + vb.height);
      const boxes = await page.evaluate(() => [...document.querySelectorAll('.atlas .pin, .atlas .region')].map((el) => { const b = el.getBoundingClientRect(); return [b.x - 16, b.y - 16, b.right + 16, b.bottom + 16]; }));
      const spots = [[0.5, 0.9], [0.1, 0.9], [0.9, 0.9], [0.1, 0.1], [0.9, 0.1], [0.5, 0.5], [0.3, 0.7], [0.7, 0.3]];
      const free = spots.map(([fx, fy]) => [L + (R - L) * fx, T + (B - T) * fy]).find(([x, y]) => !boxes.some(([a, b, c, d]) => x > a && x < c && y > b && y < d)) || [L + (R - L) / 2, T + (B - T) * 0.9];
      await page.mouse.click(free[0], free[1]);
      await page.waitForTimeout(2500);
      const focused = await page.evaluate(() => { const el = document.activeElement; return el && el.matches('input[data-fld="title"]') ? { sel: el.selectionStart === 0 && el.selectionEnd === el.value.length, value: el.value } : null; });
      step('a just-dropped node opens with its title focused and selected', !!focused?.sel, JSON.stringify(focused));
      await page.keyboard.type('Probe Drop'); await page.waitForTimeout(1200);
      const titleNow = await page.locator('.insp input[data-fld="title"]').inputValue().catch(() => '');
      step('typing replaces the placeholder name', titleNow === 'Probe Drop', titleNow);
      const m = await (await fetch(`${BASE}/api/atlas/maps/${page.url().split('/m/')[1]}`, H2)).json().catch(() => ({}));
      let removed = 0;
      for (const pl of (m.placements || []).filter((x) => /^(Probe Drop|New node|New entry)$/.test(x.node.title))) { const r = await fetch(`${BASE}/api/atlas/nodes/${pl.node.id}`, { ...H2, method: 'DELETE' }); if (r.ok) removed++; }
      step('the dropped probe node is removed again', removed >= 1, `${removed} removed`);
    } else step('the toolbar offers ＋ Add entry', false);
  }
  // laptop widths: the workspace fits the window, the scrubber keeps a track, the Forge folds the editor
  {
    await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(600);
    const fits = await page.evaluate(() => { const t = document.querySelector('.atlas .top')?.getBoundingClientRect(); const i = document.querySelector('.atlas .insp')?.getBoundingClientRect(); return { top: t ? Math.round(t.right) : null, insp: i ? Math.round(i.right) : null, w: window.innerWidth }; });
    step('at 1280 the top bar and the editor end inside the window', fits.top <= fits.w && (fits.insp == null || fits.insp <= fits.w), JSON.stringify(fits));
    await page.locator('.mode button', { hasText: 'View' }).click(); await page.waitForTimeout(400);
    const first = page.locator('.atlas .pin:not(.party)').first();
    if (await first.count()) { await first.click({ force: true }); await page.waitForTimeout(400); }
    const track = await page.locator('.timebar .ttrack').boundingBox().catch(() => null);
    step('in View with the reader open the scrubber keeps a track', !!track && track.width >= 160, `track ${Math.round(track?.width || 0)}px`);
    await page.locator('.mode button', { hasText: 'Edit' }).click(); await page.waitForTimeout(400);
    const forgeBtn = page.locator('.forgebtn');
    if (await forgeBtn.count()) {
      const wasOpen = (await forgeBtn.getAttribute('class') || '').includes('on');
      if (!wasOpen) { await forgeBtn.click(); await page.waitForTimeout(500); }
      const gap = await page.evaluate(() => { const tb = document.querySelector('.atlas .toolbar')?.getBoundingClientRect(); const h = document.querySelector('.atlas .helpwrap')?.getBoundingClientRect(); const f = document.querySelector('.atlas .forge')?.getBoundingClientRect(); const s = document.querySelector('.atlas .stagecol')?.getBoundingClientRect(); return { overlap: !!(tb && h && tb.right > h.left && tb.top < h.bottom && tb.bottom > h.top), forge: f ? Math.round(f.width) : null, stage: s ? Math.round(s.width) : null, insp: document.querySelectorAll('.atlas .insp').length }; });
      step('with the Forge open at 1280 the toolbar clears the ? button and the canvas keeps room', !gap.overlap && gap.stage >= 500, JSON.stringify(gap));
      await forgeBtn.click(); await page.waitForTimeout(300);
      if (wasOpen) { await forgeBtn.click(); await page.waitForTimeout(300); }
      if (!(await page.locator('.atlas .insp').count())) { await page.locator('.insptoggle').click().catch(() => {}); await page.waitForTimeout(300); }
    }
    await page.setViewportSize({ width: 1400, height: 900 }); await page.waitForTimeout(500);
  }
  // keyboard and dialogs: Escape closes the nearest thing and focus returns; a pin is reachable by Tab
  {
    const pinK = page.locator('.atlas .pin:not(.party)').first();
    if (await pinK.count()) {
      await pinK.click({ force: true }); await page.waitForTimeout(400);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      step('Escape with nothing else open closes the editor', (await page.locator('.insp input[data-fld="title"]').count()) === 0);
      const rename = page.locator('.spacepanel .sptitle .lx');
      if (await rename.count()) {
        await rename.focus(); await rename.press('Enter'); await page.waitForTimeout(300);
        const dlg = page.locator('[role="dialog"]');
        const inside = await page.evaluate(() => !!document.activeElement?.closest?.('[role="dialog"]'));
        step('the rename dialog is a dialog and takes focus', (await dlg.count()) === 1 && inside);
        await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        const back = await page.evaluate(() => document.activeElement?.classList?.contains('lx'));
        step('Escape closes the dialog and focus returns to the ✎ that opened it', (await dlg.count()) === 0 && !!back);
      }
      await pinK.click({ button: 'right', force: true }); await page.waitForTimeout(300);
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      step("Escape closes the pin's menu", (await page.locator('.ctxmenu').count()) === 0);
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      await page.locator('.atlas .top').click({ position: { x: 5, y: 5 } }).catch(() => {});
      let found = false;
      for (let i = 0; i < 60 && !found; i++) { await page.keyboard.press('Tab'); found = await page.evaluate(() => document.activeElement?.classList?.contains('pin')); }
      step('a pin is reachable by Tab', found);
      if (found) { await page.keyboard.press('Enter'); await page.waitForTimeout(400); step('Enter on a focused pin opens it in the editor', (await page.locator('.insp input[data-fld="title"]').count()) === 1); }
    }
  }
  // a world that can't be opened: the dashboard says so; a space that is gone: a way out and no editor armed
  {
    await page.goto(`${BASE}/w/999999`, { timeout: 60000 });
    const notice = await page.waitForSelector('.flash', { timeout: 15000 }).then((el) => el.textContent()).catch(() => '');
    step('an unknown world lands on the dashboard with a word about why', page.url().includes('/dashboard') && /isn't in your atlas/.test(notice), `${page.url().split('/').pop()} — “${notice.trim().slice(0, 48)}”`);
    await page.goto(`${BASE}/w/${cfg.worldId}/m/999999`, { timeout: 60000 });
    await page.waitForSelector('.empty-map.gone', { timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(500);
    const wayOut = page.locator('.empty-map.gone button', { hasText: 'world map' });
    step('a missing space says so and offers the world map, with no editor armed', (await page.locator('.empty-map.gone').count()) === 1 && (await page.locator('.toolbar').count()) === 0 && (await wayOut.count()) === 1);
    if (await wayOut.count()) {
      await wayOut.click();
      await page.waitForSelector('.atlas .pin', { timeout: 30000 });
      step('…and the way out reaches the world map', page.url().includes(`/m/${cfg.root}`), page.url().split('/m/')[1]);
    }
    // the title input can't take more than a name's worth
    if (await page.locator('.mode button', { hasText: 'Edit' }).count()) { await page.locator('.mode button', { hasText: 'Edit' }).click(); await page.waitForTimeout(400); }
    const pin = page.locator('.atlas .pin:not(.party)').first();
    if (await pin.count()) {
      await pin.click({ force: true }); await page.waitForTimeout(500);
      const maxLen = await page.locator('.insp input[data-fld="title"]').getAttribute('maxlength').catch(() => null);
      step('the title input stops at 255 characters', maxLen === '255', `maxlength=${maxLen}`);
    }
  }
  step('no page errors', out.errors.filter((m) => !/404/.test(m)).length === 0, out.errors.filter((m) => !/404/.test(m)).slice(0, 3).join(' | '));
} catch (e) { step('run completed', false, e.message.slice(0, 200)); }
await browser.close();
const failed = out.steps.filter((s) => !s.ok).length;
console.log(JSON.stringify({ pass: out.steps.filter((s) => s.ok).length, fail: failed }));
process.exitCode = failed ? 1 : 0; // a red step is a red run
