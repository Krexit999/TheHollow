/**
 * A.47 — the Museum panel, desktop and 380px.
 *
 * Every piece here is donated and studied through the REAL engine calls, and
 * the exhibit is formed by the ARRANGEMENT rather than set directly — so a
 * wrong predicate shows up as a missing exhibit in the shot, not a green tick.
 *
 *   npx tsx scripts/shot-museum.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5174';
const OUT = process.argv[3] ?? 'sim-out/shots';

const SEED = `
  const st = engine.getState();
  st.guild.discovered = true;
  st.depth = 420; st.maxDepthRecord = 420; st.collapse.count = 8;
  st.currencies['scrip'] = window.__D(50000);
  // Three relics from the same run, by the same drill, deep — several exhibits
  // at once, all formed by where they are PUT.
  const made = [];
  for (let i = 0; i < 4; i++) {
    const r = window.__mkRelic(st, i);
    made.push(r);
    window.__donate(st, 'firstFinds', 'relic:' + r.uid, r.uid);
  }
  for (const r of made) window.__identify(st, r.uid);
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
    await page.evaluate(async () => {
      const p1 = '/src/engine/systems/relics.ts';
      const p2 = '/src/engine/systems/museum.ts';
      const p3 = '/src/engine/decimal.ts';
      const relics = await import(/* @vite-ignore */ p1);
      const museum = await import(/* @vite-ignore */ p2);
      const dec = await import(/* @vite-ignore */ p3);
      const ctx = { emit() {}, dirty() {} };
      const w = window as unknown as Record<string, unknown>;
      w['__D'] = dec.D;
      w['__mkRelic'] = (s: never, i: number) => relics.addRelic(s, {
        uid: 0, defId: 'x', rarity: 2, affixes: { regen: 0.08, dustYield: 0.05 },
        source: ['depth', 'depth', 'depth', 'warren'][i], fusedFrom: 0, waking: 2, charge: 9000,
        found: { depth: 300 + i * 40, shell: 'loam', run: 6, playSec: 900, by: 'The Badger' },
      });
      w['__donate'] = (s: never, c: string, k: string, uid: number) => museum.donateToCase(s, ctx, c, k, uid);
      w['__identify'] = (s: never, uid: number) => museum.identifyPiece(s, ctx, uid);
    });
    await setup(page, SEED);
    await dismiss(page);
    await tab(page, 'museum'); // A.47 follow-up: Museum has its own tab again
    await dismiss(page);
    await page.waitForTimeout(9000);
    await dismiss(page);
    // The room scrolls INSIDE a container, so fullPage equals the viewport —
    // scroll to the Museum half or the shot only ever shows the Relics half.
    await page.screenshot({ path: `${OUT}/museum-${name}.png` });
    console.log(`  wrote ${OUT}/museum-${name}.png`);

    if (name === 'narrow') {
      const overflow = await page.evaluate(() =>
        Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
      console.log(`  horizontal overflow at 380px: ${overflow}px`);
      if (overflow > 0) problems.push(`[narrow] ${overflow}px overflow`);
    }

    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    console.log(`  ${name}:`);
    for (const probe of ['Exhibits', 'On the plinths', 'studied', 'Found at depth',
      'The Badger', 'The Last Shift', "One Hand's Work", 'standing in']) {
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
