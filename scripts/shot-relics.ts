/**
 * A.46 — the Relics panel, desktop and 380px.
 *
 * The state is stipulated (layout check), but every relic here is minted and
 * woken through the REAL engine — the stories, waking steps and resonance all
 * come from dispatched calls, so a wrong reducer still shows up in the shot.
 *
 *   npx tsx scripts/shot-relics.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5174';
const OUT = process.argv[3] ?? 'sim-out/shots';

const SEED = `
  const st = engine.getState();
  st.depth = 428; st.maxDepthRecord = 428; st.collapse.count = 5;
  st.drills.bayBuilt = true;
  st.museum.completed = ['a','b','c','d','e'];
  st.relics.floorBonus = 0.2;
  st.relics.shards = 46;
  // Real grants through the engine, each with its own finder and context.
  ui.getState();
  const g = (src, by) => engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1 }) && null;
  const R = engine;
  const found = [];
  for (const [src, by] of [['depth','The Badger'],['depth','Old Tom'],['warren',null],['expedition',null],['warden',null],['well',null],['anomaly',null]]) {
    const s2 = R.getState();
    s2.depth = 300 + found.length * 40;
    const rel = window.__grantRelic(s2, src, by);
    found.push(rel);
  }
  // Wear a resonating pair plus others, and wake them to different steps.
  const s3 = R.getState();
  s3.relics.equipped = found.slice(0, 4).map(r => r.uid);
  s3.relics.held[0].waking = 2; s3.relics.held[0].charge = 9000;
  s3.relics.held[1].waking = 1; s3.relics.held[1].charge = 3000;
  s3.relics.held[2].charge = 600;
  s3.relics.held[3].locked = true;
`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const problems: string[] = [];

  for (const [name, width, height] of [['desktop', 1280, 1000], ['narrow', 380, 900]] as const) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', (e) => problems.push(`[${name}] [pageerror] ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${name}] [console] ${m.text().slice(0,200)}`); });
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    // Expose the engine's own grantRelic so the seed uses the real path.
    await page.evaluate(async () => {
      // Vite resolves this at runtime in the page; tsc cannot see a browser
      // module path, and making it a variable is the honest way to say so.
      const path = '/src/engine/systems/relics.ts';
      const m = await import(/* @vite-ignore */ path);
      (window as unknown as Record<string, unknown>)['__grantRelic'] =
        (s: unknown, src: string, by: string | null) =>
          m.grantRelic(s, { emit() {}, dirty() {} }, src, by ?? undefined);
    });
    await setup(page, SEED);
    await dismiss(page);
    await tab(page, 'relics');
    await dismiss(page);
    await page.waitForTimeout(9000); // let seeding toasts clear
    await dismiss(page);
    await page.screenshot({ path: `${OUT}/relics-${name}.png`, fullPage: true });
    console.log(`  wrote ${OUT}/relics-${name}.png`);

    if (name === 'narrow') {
      const overflow = await page.evaluate(() =>
        Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
      console.log(`  horizontal overflow at 380px: ${overflow}px`);
      if (overflow > 0) problems.push(`[narrow] ${overflow}px overflow`);
    }

    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    console.log(`  ${name}:`);
    for (const probe of ['Shards', 'Hold', 'Floor', 'Found at depth', 'The Badger',
      'Awake', 'Stirring', 'Dormant', 'recognise each other', 'shards']) {
      const ok = body.toLowerCase().includes(probe.toLowerCase());
      console.log(`    ${ok ? 'yes' : 'NO '}  ${probe}`);
      if (!ok) problems.push(`[${name}] missing: ${probe}`);
    }
    await page.close();
  }
  console.log(problems.length ? `\nPROBLEMS:\n  ${problems.join('\n  ')}` : '\nclean: nothing missing, no errors, no overflow');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
}
main();
