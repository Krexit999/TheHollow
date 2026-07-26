/**
 * A.45 — verify THE COLLAPSE panel in the real app.
 *
 * The Browser pane renders 0x0/empty in this environment, so playwright is the
 * working route (same as scripts/shot.ts).
 *
 * Drives a REAL game rather than injecting a save: the panel reads
 * `collapse.lastRun`, `collapse.traces` and live core-node prices, and a
 * hand-built save would let all three be wrong while the screenshot looked
 * fine — the same trap as the recursion scenario that was handed its Echoes.
 *
 * WHERE THIS GETS TO, HONESTLY: depth ~8. The Collapse room needs
 * maxDepthRecord >= 15 (nav.ts) and a paying fall needs depth 26+, but
 * `dustCost(d) = 25·1.09^d` outruns hand-chipping long before either — the
 * face depletes between clicks and regen is the real income until the Kiln is
 * up. So this verifies the app mounts, the rooms navigate, and nothing throws;
 * it does NOT yet reach the panel it is named for. Finishing it means teaching
 * it to raise the Kiln and buy drills, which is a real (small) piece of work
 * and not the same thing as the panel being unverified-by-accident.
 *
 * Until then the Collapse panel's BEHAVIOUR is covered by unit tests
 * (systems.test.ts: core-neutrality, clean-is-default, braced, ember, bounded
 * traces) and its rendering is unverified in-browser. Said plainly rather than
 * implied by a green script.
 *
 *   npx tsx scripts/shot-collapse.ts [port] [outDir]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots';
const URL = `http://localhost:${PORT}`;

async function chip(page: Page, times: number): Promise<void> {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no face canvas — the game did not mount');
  for (let i = 0; i < times; i++) {
    await page.mouse.click(
      box.x + box.width * (0.2 + 0.6 * Math.random()),
      box.y + box.height * (0.2 + 0.6 * Math.random()),
    );
  }
}

/**
 * Descend and Collapse are HOLD controls. A plain click does nothing at all,
 * which is how the first cut of this driver spent fourteen rounds "descending"
 * and never left depth 0 — the button reported enabled, every click reported
 * success, and the game correctly ignored all of them.
 */
async function hold(page: Page, label: RegExp, ms = 1200): Promise<boolean> {
  const b = page.getByRole('button', { name: label }).first();
  if ((await b.count()) === 0) return false;
  if (await b.isDisabled().catch(() => true)) return false;
  await b.hover().catch(() => {});
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await page.waitForTimeout(120);
  return true;
}

async function spam(page: Page, label: RegExp, rounds: number): Promise<number> {
  let hits = 0;
  for (let i = 0; i < rounds; i++) {
    const b = page.getByRole('button', { name: label }).first();
    if ((await b.count()) === 0) break;
    if (await b.isDisabled().catch(() => true)) break;
    await b.click({ timeout: 800 }).catch(() => {});
    hits++;
  }
  return hits;
}

const deepest = async (page: Page): Promise<number> =>
  Number((await page.locator('body').innerText()).match(/Deepest: (\d+)/)?.[1] ?? 0);

async function openCollapse(page: Page): Promise<void> {
  const direct = page.getByRole('button', { name: /Collapse/ }).first();
  if ((await direct.count()) > 0) { await direct.click().catch(() => {}); return; }
  const prog = page.getByText('PROGRESS', { exact: false }).first();
  if ((await prog.count()) > 0) await prog.click().catch(() => {});
  await page.waitForTimeout(300);
  const t = page.getByRole('button', { name: /Collapse/ }).first();
  if ((await t.count()) > 0) await t.click().catch(() => {});
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 300)}`);
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // The Collapse room opens at maxDepthRecord >= 15 (nav.ts); the fall itself
  // needs depth 26+ to pay a Core.
  for (let round = 0; round < 45; round++) {
    await chip(page, 70);
    await spam(page, /^Buy ×1/, 10);
    for (let d = 0; d < 6; d++) if (!(await hold(page, /^Descend/, 1000))) break;
    const rec = await deepest(page);
    if (round % 10 === 0) console.log(`  round ${round}: deepest ${rec}`);
    if (rec >= 30) { console.log(`  reached deepest ${rec} at round ${round}`); break; }
  }

  await openCollapse(page);
  await page.waitForTimeout(700);

  const shot = async (name: string): Promise<void> => {
    await page.screenshot({ path: `${OUT}/collapse-${name}.png` });
    console.log(`  wrote ${OUT}/collapse-${name}.png`);
  };
  await shot('panel');

  for (const fall of ['Braced', 'Ember', 'Clean']) {
    const b = page.getByRole('button', { name: new RegExp(`^${fall}$`) }).first();
    if ((await b.count()) > 0) {
      await b.click().catch(() => {});
      await page.waitForTimeout(200);
      await shot(fall.toLowerCase());
    } else console.error(`  MISSING fall button: ${fall}`);
  }

  // Fall a few times so "vs last run" and the trace strip have real data.
  for (let i = 0; i < 3; i++) {
    if (!(await hold(page, /Hold for the/, 1300))) { console.error('  collapse unavailable'); break; }
    const face = page.getByText('THE FACE', { exact: false }).first();
    if ((await face.count()) > 0) await face.click().catch(() => {});
    for (let r = 0; r < 12; r++) {
      await chip(page, 60);
      await spam(page, /^Buy ×1/, 8);
      for (let d = 0; d < 6; d++) if (!(await hold(page, /^Descend/, 900))) break;
    }
    await openCollapse(page);
    await page.waitForTimeout(400);
  }
  await shot('after-falls');

  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  console.log('\npanel content:');
  for (const probe of ['Let the shaft fall', 'This run', 'Fall no.', 'Clean', 'Braced', 'Ember', 'The column']) {
    console.log(`  ${body.includes(probe) ? 'yes' : 'NO '}  ${probe}`);
  }
  console.log(errors.length ? `\nERRORS:\n${errors.join('\n')}` : '\nno console errors, no page errors');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}

main();
