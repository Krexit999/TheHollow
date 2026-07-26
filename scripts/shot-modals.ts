/**
 * A.45 — the modal stack: one pre-fall surface, one post-fall surface, and
 * NOTHING stacking. Memory records the DisclosureGate shipping unplayable once
 * (a card taller than the viewport with its only dismiss button below the
 * fold), so "do two full-screen dialogs ever coexist" is a safety check, not a
 * polish one.
 *
 *   npx tsx scripts/shot-modals.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab } from './drive';

const PORT = process.argv[2] ?? '5174';
const OUT = process.argv[3] ?? 'sim-out/shots';

/** A fall deep enough to pay AND to open new rooms — the stacking case. */
const SEED = `
  const d = (a) => engine.dispatch(a);
  d({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e7 });
  const s = engine.getState();
  s.upgrades['blade'] = 20; s.kiln.built = true;
  s.seenSystems = [];
  s.depth = 130; s.maxDepthRecord = 150; s.shaft.reached = 130;
  d({ type: 'collapse', fall: 'clean' });
`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const problems: string[] = [];
  const page = await browser.newPage({ viewport: { width: 380, height: 900 } });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console] ${m.text().slice(0,200)}`); });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await setup(page, SEED);
  await page.waitForTimeout(600);

  const dialogs = async (): Promise<number> =>
    page.locator('.fixed.inset-0.z-50').filter({ has: page.locator('.panel') }).count();

  const n1 = await dialogs();
  console.log(`full-screen dialogs right after the fall: ${n1}`);
  await page.screenshot({ path: `${OUT}/modal-1-postfall.png` });
  if (n1 > 1) problems.push(`${n1} full-screen dialogs stacked after the fall`);

  const begin = page.getByRole('button', { name: /Begin again/ }).first();
  if ((await begin.count()) === 0) problems.push('no run-summary page after a hand-pulled fall');
  else {
    await begin.click();
    await page.waitForTimeout(500);
    const n2 = await dialogs();
    console.log(`after dismissing it: ${n2} (the gate should be here now)`);
    await page.screenshot({ path: `${OUT}/modal-2-gate.png` });
    if (n2 > 1) problems.push(`${n2} dialogs stacked after dismissing the summary`);
    const gate = page.getByRole('button', { name: /One at a time|Go on, then/ }).first();
    if ((await gate.count()) === 0) problems.push('the deferred disclosure gate never arrived — pending was DROPPED, not held');
    else {
      const box = await gate.boundingBox();
      const vh = page.viewportSize()!.height;
      console.log(`gate dismiss button at y=${Math.round(box?.y ?? -1)} (viewport ${vh})`);
      if (!box || box.y + box.height > vh) problems.push('gate dismiss button is below the fold — the unplayable shape');
      await gate.click();
      await page.waitForTimeout(400);
      console.log(`after dismissing the gate: ${await dialogs()} dialogs`);
    }
  }

  await tab(page, 'collapse');
  await page.waitForTimeout(400);
  const body = (await page.locator('body').innerText()).toLowerCase();
  console.log(`\n"your last fall" card still present: ${body.includes('your last fall') ? 'YES (should be gone)' : 'no'}`);
  if (body.includes('your last fall')) problems.push('the folded third surface is still rendering');
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  console.log(`horizontal overflow at 380px: ${overflow}px`);
  if (overflow > 0) problems.push(`${overflow}px overflow`);
  await page.screenshot({ path: `${OUT}/modal-3-panel.png`, fullPage: true });

  console.log(problems.length ? `\nPROBLEMS:\n  ${problems.join('\n  ')}` : '\nclean: one surface at a time, nothing stacked, no overflow');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
}
main();
