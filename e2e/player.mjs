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
page.on('console', (m) => { if (m.type() === 'error') out.errors.push(`console: ${m.text().slice(0, 200)}`); });
try {
  await page.goto(`${BASE}/p/${TOKEN}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForSelector('.pview .pin', { timeout: 30000 });
  const pins = await page.locator('.pview .pin').count();
  step('world map renders pins', pins > 0, `${pins} pins`);
  // a regular (non-party) pin opens the sheet
  const regular = page.locator('.pview .pin:not(.party)').first();
  const title = (await regular.getAttribute('title')) || (await regular.locator('.lbl, .ilbl').first().textContent().catch(() => ''));
  await regular.click({ force: true });
  const sheet = page.locator('.pview .sheet');
  const opened = await sheet.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  step('tapping a pin opens its sheet', opened, opened ? `"${(await sheet.locator('h3').first().textContent()).trim()}"` : `no sheet for pin "${(title || '').trim()}"`);
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
  // enter an interior via ◎ and come back via ⬆
  const enter = page.locator('.pview .pin .enter').first();
  if (await enter.count()) {
    await enter.click({ force: true });
    const back = await page.locator('.pview .backbtn').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    step('◎ enters an interior (back button appears)', back, back ? (await page.locator('.pview .backbtn').textContent()).trim() : '');
    if (back) {
      const inside = page.url();
      const t0 = Date.now();
      await page.locator('.pview .backbtn').click();
      const home = await page.locator('.pview .backbtn').waitFor({ state: 'detached', timeout: 45000 }).then(() => true).catch(() => false); // (waitForFunction trips the site CSP)
      step('⬆ returns to the parent map', home, `${page.url().split('/p/')[1]} in ${Date.now() - t0}ms (was ${inside.split('/p/')[1]})`);
    }
  } else step('some pin offers ◎ to enter', false, 'no ◎ found');
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
  // the trail layer and party chip exist in the DOM without throwing
  step('no page errors', out.errors.length === 0, out.errors.slice(0, 3).join(' | '));
} catch (e) { step('run completed', false, e.message); }
await browser.close();
console.log(JSON.stringify({ pass: out.steps.filter((s) => s.ok).length, fail: out.steps.filter((s) => !s.ok).length, errors: out.errors.slice(0, 5) }));
