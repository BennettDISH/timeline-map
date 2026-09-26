// End-to-end test of the public Player View in a real browser: pins open sheets, the party
// node reads, interiors enter and exit, the era bar scrubs, and nothing throws.
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
// config: player.config.json beside this file (gitignored) or env — see README.md
const cfgUrl = new URL('./player.config.json', import.meta.url);
const cfg = existsSync(cfgUrl) ? JSON.parse(readFileSync(cfgUrl)) : {};
const BASE = process.env.BASE_URL || cfg.baseUrl || 'https://timeline-map-production.up.railway.app';
const TOKEN = process.env.SHARE_TOKEN || cfg.shareToken;
if (!TOKEN) { console.error('No share token: set SHARE_TOKEN or put shareToken in e2e/player.config.json'); process.exit(2); }
const out = { errors: [], steps: [] };
const step = (name, ok, note = '') => { out.steps.push({ name, ok, note }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`); };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => out.errors.push(`pageerror: ${e.message}`));
// a 404 the page asked for on purpose (a hidden map, an unknown token) is not a page error
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) out.errors.push(`console: ${m.text().slice(0, 200)}`); });
try {
  await page.goto(`${BASE}/p/${TOKEN}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForSelector('.pview .pin', { timeout: 30000 });
  const pins = await page.locator('.pview .pin').count();
  step('world map renders pins', pins > 0, `${pins} pins`);
  // taps the centroid of the first outlined place (regions have no pin) and returns its title
  const tapRegion = async () => {
    const c = await page.evaluate(() => {
      const poly = document.querySelector('.pview polygon.region'); if (!poly) return null;
      const pts = poly.getAttribute('points').trim().split(/\s+/).map((s) => s.split(',').map(Number));
      const w = document.querySelector('.pview .mp-world').getBoundingClientRect();
      let a = 0, cx = 0, cy = 0;
      for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; const f = x0 * y1 - x1 * y0; a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f; }
      a *= 0.5; cx /= 6 * a; cy /= 6 * a;
      return { x: w.x + w.width * cx / 100, y: w.y + w.height * cy / 100, title: poly.querySelector('title')?.textContent || '' };
    });
    if (c) await page.mouse.click(c.x, c.y);
    return c;
  };
  // a regular (non-party) pin — or, on a map where every place is outlined, a region — opens the sheet
  const regular = page.locator('.pview .pin:not(.party)').first();
  let title = '';
  if (await regular.count()) {
    title = (await regular.getAttribute('title')) || (await regular.locator('.lbl, .ilbl').first().textContent().catch(() => ''));
    await regular.click({ force: true });
  } else {
    const c = await tapRegion();
    title = c ? c.title : '';
  }
  const sheet = page.locator('.pview .sheet');
  const opened = await sheet.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  step('tapping a pin or an outlined place opens its sheet', opened, opened ? `"${(await sheet.locator('h3').first().textContent()).trim()}"` : `no sheet for "${(title || '').trim()}"`);
  if (opened) await page.locator('.pview .sclose').click();
  // the party pin reads its footstep text and the from/to trail
  const party = page.locator('.pview .pin.party').first();
  if (await party.count()) {
    await party.click({ force: true });
    const ok = await sheet.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    const body = ok ? await sheet.locator('.sbody').first().textContent().catch(() => '') : '';
    const trail = ok ? await sheet.locator('.rtrail').count() : 0;
    step('the party pin opens with its footstep story', ok && body.length > 20, `${body.slice(0, 60)}… trail links: ${trail}`);
    if (ok) await page.locator('.pview .sclose').click();
  } else step('a party pin is on the world map at canon', false, 'none found');
  // enter an interior via ◎ (a pin's button, or an outlined place's sheet) and come back via ⬆
  const enter = page.locator('.pview .pin .enter').first();
  let entered = false;
  if (await enter.count()) { await enter.click({ force: true }); entered = true; }
  else {
    await tapRegion();
    const go = page.locator('.pview .sgo');
    if (await go.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)) { await go.click(); entered = true; }
  }
  if (entered) {
    const back = await page.locator('.pview .backbtn').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    step('◎ enters an interior (back button appears)', back, back ? (await page.locator('.pview .backbtn').textContent()).trim() : '');
    if (back) {
      const inside = page.url();
      const t0 = Date.now();
      await page.locator('.pview .backbtn').click();
      const home = await page.locator('.pview .backbtn').waitFor({ state: 'detached', timeout: 45000 }).then(() => true).catch(() => false); // (waitForFunction trips the site CSP)
      step('⬆ returns to the parent map', home, `${page.url().split('/p/')[1]} in ${Date.now() - t0}ms (was ${inside.split('/p/')[1]})`);
    }
  } else step('some pin or outlined place offers ◎ to enter', false, 'no ◎ found');
  // a ghost footprint is clickable (no force) and moves the lens to that moment
  const print = page.locator('.pview .fstep').first();
  if (await print.count()) {
    const chipBefore = (await page.locator('.pview .nowchip').textContent().catch(() => '')).trim();
    const clicked = await print.click({ timeout: 8000 }).then(() => true).catch((e) => e.message.slice(0, 90));
    await page.waitForTimeout(800);
    const chipAfter = (await page.locator('.pview .nowchip').textContent().catch(() => '')).trim();
    step('a ghost footprint is clickable and moves the lens into the past', clicked === true && /past/.test(chipAfter), clicked === true ? `${chipBefore} → ${chipAfter}` : `click failed: ${clicked}`);
  } else step('ghost footprints are on the world map', false, 'no .fstep found');
  // the era bar scrubs into a revealed past without errors
  const range = page.locator('.pview input[type=range]').first();
  if (await range.count()) {
    await range.focus(); for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(800);
    const chip = (await page.locator('.pview .nowchip').textContent().catch(() => '')).trim();
    step('era bar scrubs into the past', /past/.test(chip), chip);
  } else step('era bar present', false);
  // nothing on the page threw while all of the above ran
  // the map's legend is a tap away
  const helpBtn = page.locator('.pview .helpwrap button').first();
  if (await helpBtn.count()) {
    await helpBtn.click(); await page.waitForTimeout(300);
    step('the ? legend opens for players', (await page.locator('.pview .helppop').count()) === 1);
  } else step('the ? legend button exists', false, 'no .helpwrap button');
  // the sheet survives a drag (it closes on a clean tap on empty map, never on a pan)
  const anyPin = page.locator('.pview .pin').first();
  if (await anyPin.count()) {
    await anyPin.click({ force: true }); await page.locator('.pview .sheet').first().waitFor({ timeout: 8000 }).catch(() => {});
    const before = await page.locator('.pview .sheet').count();
    const vp = await page.locator('.pview .mp-viewport').boundingBox();
    if (vp && before === 1) {
      await page.mouse.move(vp.x + vp.width * 0.5, vp.y + vp.height * 0.9);
      await page.mouse.down(); await page.mouse.move(vp.x + vp.width * 0.5 + 120, vp.y + vp.height * 0.9 - 40, { steps: 8 }); await page.mouse.up();
      await page.waitForTimeout(300);
      step('dragging the map keeps the open sheet', (await page.locator('.pview .sheet').count()) === 1);
    } else step('a sheet opened before the drag check', false, `sheets: ${before}`);
  }
  // a hidden or missing place under a WORKING link is not a dead link; an unknown token is
  const FIX = 'fx89ef1c8ec74cadc99ae56b256c46b337'; // the public secrecy fixture: map 61 is a DM-only interior
  const heading = async (url) => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('.pview .deadlink h3').first().waitFor({ timeout: 20000 }).catch(() => {});
    return (await page.locator('.pview .deadlink h3').first().textContent().catch(() => '')).trim();
  };
  const h1 = await heading(`${BASE}/p/${FIX}/m/61`);
  step('a hidden map under a working link says the PLACE is missing, not the link', /isn't on your map/.test(h1), h1);
  step('…and offers a way back to the map', (await page.locator('.pview .deadlink button').count()) === 1);
  const h2 = await heading(`${BASE}/p/not-a-real-token-000`);
  step('an unknown token is the dead-link page', /isn't active/.test(h2), h2);
  const h3 = await heading(`${BASE}/p/`);
  step('a mangled /p/ URL is answered in player terms', /isn't active/.test(h3), h3);
  step('no page errors', out.errors.length === 0, out.errors.slice(0, 3).join(' | '));
} catch (e) { step('run completed', false, e.message); }
await browser.close();
const failed = out.steps.filter((s) => !s.ok).length;
console.log(JSON.stringify({ pass: out.steps.filter((s) => s.ok).length, fail: failed, errors: out.errors.slice(0, 5) }));
process.exitCode = failed ? 1 : 0; // a red step is a red run
