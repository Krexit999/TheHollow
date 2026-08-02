/**
 * THE CUT, VERIFIED ON THE LIVE PATH. Boots, chips, compacts, drills — and
 * carries nothing named grain. A green suite is not proof the game runs.
 *
 *   npx tsx scripts/verify-nograin.ts [port]
 */
import { chromium } from 'playwright';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const problems: string[] = [];
const check = (ok: boolean, label: string, detail = ''): void => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
};

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 820 }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f;
  });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(2000);
  check(errors.length === 0, 'the game boots with no page errors', errors.join(' | '));

  // A save from the grain build, loaded cold: every dead key still on it.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { face: Record<string, unknown>; upgrades: Record<string, number> }; tick: (n: number) => void };
    const f = e.getState().face;
    f['grain'] = new Array(36).fill(1);
    f['grainGen'] = 2;
    f['grainScope'] = 'cell';
    f['bandGrain'] = 1;
    f['locked'] = new Array(36).fill(false);
    f['front'] = { cell: 3, hops: 2, alive: true, trail: [1, 2], path: [1, 2, 3] };
    e.getState().upgrades['soil'] = 120;
    e.tick(0.5);
  });
  await page.waitForTimeout(1200);

  const geo = await page.evaluate(() => {
    const v = (window as unknown as Record<string, unknown>)['__faceView'] as unknown as
      { cellSize: number; gridX: number; gridY: number; faceW: number };
    const el = document.querySelector('canvas')!.getBoundingClientRect();
    return { size: v.cellSize, gx: v.gridX, gy: v.gridY, w: v.faceW, ox: el.x, oy: el.y };
  });
  const before = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { stats: { manualChips: number } } };
    return e.getState().stats.manualChips;
  });
  for (let i = 0; i < 24; i++) {
    const cell = i % 36;
    await page.mouse.click(
      geo.ox + geo.gx + (cell % geo.w) * geo.size + geo.size / 2,
      geo.oy + geo.gy + Math.floor(cell / geo.w) * geo.size + geo.size / 2,
    );
    await page.waitForTimeout(120);
  }
  const after = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { stats: { manualChips: number }; face: { compaction?: number[] } } };
    const s = e.getState();
    return { chips: s.stats.manualChips, comp: (s.face.compaction ?? []).reduce((a, b) => a + b, 0) };
  });
  check(after.chips > before, 'chipping works', `${before} -> ${after.chips} chips`);
  check(after.comp > 0, 'chipping compacts the rock', `total compaction ${after.comp}`);

  // Drills, on the same board.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; tick: (n: number) => void };
    const s = e.getState() as unknown as { drills: { bayBuilt: boolean; units: unknown[] } };
    s.drills.bayBuilt = true;
    s.drills.units = [{ level: 6, timer: 0, lastCell: 0, use: {}, name: 'Bess' }];
    e.tick(0.5);
  });
  const dBefore = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { stats: { drillStrikes: number } } };
    return e.getState().stats.drillStrikes;
  });
  await page.waitForTimeout(4000);
  const dAfter = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { stats: { drillStrikes: number } } };
    return e.getState().stats.drillStrikes;
  });
  check(dAfter > dBefore, 'drills work', `${dBefore} -> ${dAfter} strikes`);

  const keys = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { face: Record<string, unknown> } };
    const f = e.getState().face;
    return ['grain', 'grainGen', 'grainScope', 'bandGrain', 'front', 'locked'].filter((k) => f[k] !== undefined);
  });
  check(keys.length === 0, 'a grain-era save sheds every dead key', keys.join(', ') || 'none left');
  check(errors.length === 0, 'still no page errors after all of it', errors.join(' | '));

  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}
void main();
