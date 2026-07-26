/**
 * A.45 — verify THE COLLAPSE panel renders, desktop and 380px.
 *
 * Uses the DEV hooks `main.tsx` exposes for exactly this ("...without brittle
 * role selectors"). The state is stipulated because this is a LAYOUT check;
 * the panel's behaviour is unit-tested in systems.test.ts. What is NOT
 * stipulated is the panel's own data: the traces, lastRun and Core prices it
 * draws are produced by dispatching REAL collapses through the engine, so a
 * wrong reducer still shows up here.
 *
 *   npx tsx scripts/shot-collapse.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5174';
const OUT = process.argv[3] ?? 'sim-out/shots';
const URL = `http://localhost:${PORT}`;

/** Runs in the page with (engine, ui) in scope. Three REAL collapses at
 *  different depths and fall types, so the trace strip, the "vs last run"
 *  deltas and the what-this-buys line all have honest data behind them. */
const SEED = `
  const d = (a) => engine.dispatch(a);
  d({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e7 });
  const st = engine.getState();
  st.upgrades['blade'] = 24; st.upgrades['soil'] = 12; st.upgrades['roots'] = 6;
  st.kiln.built = true; st.kiln.heat = 0.8;
  st.collapse.nodes['momentum'] = 2;
  for (const [depth, fall] of [[42,'clean'],[68,'braced'],[95,'ember'],[120,'clean']]) {
    const s = engine.getState();
    s.depth = depth; s.maxDepthRecord = Math.max(s.maxDepthRecord, depth);
    s.shaft.reached = depth;
    d({ type: 'collapse', fall });
    d({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e6 });
  }
  const f = engine.getState();
  f.depth = 137; f.maxDepthRecord = 150; f.shaft.reached = 137;
  f.stats.playTimeSec = f.collapse.runStartAt + 494;
`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors: string[] = [];

  for (const [name, width, height] of [['desktop', 1280, 1000], ['narrow', 380, 900]] as const) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', (e) => errors.push(`[${name}] [pageerror] ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`[${name}] [console] ${m.text().slice(0, 240)}`);
    });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await setup(page, SEED);
    await dismiss(page);
    await tab(page, 'collapse');
    await dismiss(page);
    // Seeding fires achievement/unlock toasts that sit over the lower panel.
    // They are transient, not layout — let them go before judging the shot.
    await page.waitForTimeout(9000);
    await dismiss(page);
    await page.screenshot({ path: `${OUT}/collapse-${name}.png`, fullPage: true });
    console.log(`  wrote ${OUT}/collapse-${name}.png`);

    if (name === 'narrow') {
      // 0px at 380 is the project's standing bar — nothing may overflow.
      const overflow = await page.evaluate(() =>
        Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
      console.log(`  horizontal overflow at 380px: ${overflow}px`);
      if (overflow > 0) errors.push(`[narrow] ${overflow}px horizontal overflow`);
      for (const fall of ['Braced', 'Ember']) {
        const b = page.getByRole('button', { name: new RegExp(`^${fall}$`) }).first();
        if ((await b.count()) > 0) {
          await b.click().catch(() => {});
          await page.waitForTimeout(200);
          await page.screenshot({ path: `${OUT}/collapse-narrow-${fall.toLowerCase()}.png`, fullPage: true });
          console.log(`  wrote ${OUT}/collapse-narrow-${fall.toLowerCase()}.png`);
        } else errors.push(`[narrow] missing fall button ${fall}`);
      }
    }

    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    console.log(`  ${name} content:`);
    for (const probe of ['Let the shaft fall', 'Depth', 'This run', 'Fall no.',
      'Clean', 'Braced', 'Ember', 'The column', 'Collapses so far']) {
      const ok = body.toLowerCase().includes(probe.toLowerCase());
      console.log(`    ${ok ? 'yes' : 'NO '}  ${probe}`);
      if (!ok) errors.push(`[${name}] missing: ${probe}`);
    }
    await page.close();
  }

  console.log(errors.length ? `\nPROBLEMS:\n  ${errors.join('\n  ')}` : '\nclean: no errors, nothing missing, no overflow');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}

main();
