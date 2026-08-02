/**
 * DOES THE LIVE FACE ACTUALLY USE THE SHIPPED GENERATOR?
 *
 * It did not, and nothing caught it. `ensureBand` rebuilt the grain array only
 * when it was MISSING or the WRONG LENGTH, so a save carrying a full-length
 * field from a superseded generator kept it forever. The seam generator went
 * in, this project's own script measured 0.17 facing pairs on fresh boards, and
 * the board on screen was still the old per-cell roll with arrows pointing at
 * each other. Live code that had never run.
 *
 * So this checks the thing the metric could not: plant a hostile field on a
 * LIVE save — every square pointing at its neighbour, exactly what was on
 * screen — and confirm the game replaces it, on load, without a Collapse.
 *
 *   npx tsx scripts/verify-stale-field.ts [port]
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
  page.on('pageerror', (e) => console.log('  PAGEERROR:', e.message));
  // esbuild names arrow functions inside evaluate(); the page has no __name.
  await page.addInitScript(() => { (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f; });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(1500);

  /** Read the field the RENDERER is drawing from, and count its defects. */
  const audit = () => page.evaluate(() => {
    const e = (window as unknown as Record<string, { getState: () => never }>)['__engine']!;
    const s = e.getState() as unknown as {
      face: { w: number; cells: number[]; grain?: number[]; grainGen?: number };
    };
    const g = s.face.grain ?? [];
    const w = s.face.w;
    const h = s.face.cells.length / w;
    const next = (c: number): number => {
      const x = c % w, y = Math.floor(c / w), d = g[c]!;
      return d === 0 ? (y > 0 ? c - w : -1) : d === 1 ? (x < w - 1 ? c + 1 : -1)
        : d === 2 ? (y < h - 1 ? c + w : -1) : (x > 0 ? c - 1 : -1);
    };
    let facing = 0, outward = 0, walkSum = 0;
    for (let c = 0; c < g.length; c++) {
      const nx = next(c);
      if (nx < 0) outward++;
      else if (next(nx) === c) facing += 0.5;
      let at = c, hops = 0;
      const seen = new Set<number>();
      while (!seen.has(at) && hops < 200) {
        seen.add(at);
        const q = next(at);
        if (q < 0) break;
        at = q; hops++;
      }
      walkSum += hops;
    }
    return { gen: s.face.grainGen, facing, outward, walk: walkSum / g.length, n: g.length };
  });

  const fresh = await audit();
  console.log(`FRESH BOARD  gen ${fresh.gen}  facing ${fresh.facing}  outward ${fresh.outward}  mean walk ${fresh.walk.toFixed(2)}`);
  check(fresh.gen === 2, 'the live face is drawn by the shipped generator', `grainGen ${fresh.gen}`);
  check(fresh.facing === 0, 'no squares point at each other', `${fresh.facing} pairs`);
  check(fresh.outward === 0, 'no squares point off the board', `${fresh.outward} cells`);

  // Now the case that actually shipped broken: a save whose field came from an
  // older generator. Every cell pointing east/west in alternating columns is
  // the worst version of what was on screen.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { face: { w: number; cells: number[]; grain?: number[]; grainGen?: number } }; tick: (n: number) => void };
    const s = e.getState();
    s.face.grain = s.face.cells.map((_, i) => ((i % s.face.w) % 2 === 0 ? 1 : 3));
    s.face.grainGen = 1; // stamped by a superseded generator
    e.tick(0.5);
  });
  await page.waitForTimeout(800);
  const repaired = await audit();
  console.log(`STALE SAVE   gen ${repaired.gen}  facing ${repaired.facing}  outward ${repaired.outward}  mean walk ${repaired.walk.toFixed(2)}`);
  check(repaired.gen === 2, 'a field from an older generator is replaced on load');
  check(repaired.facing === 0, 'and the replacement has no facing pairs', `${repaired.facing} pairs`);

  // ...and it does NOT re-roll every tick, which would reshuffle the grain
  // under the player's hand while they were aiming along it.
  const a = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { face: { grain?: number[] } } };
    return (e.getState().face.grain ?? []).join(',');
  });
  await page.waitForTimeout(1500);
  const b = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { face: { grain?: number[] } } };
    return (e.getState().face.grain ?? []).join(',');
  });
  check(a === b, 'and it stays put afterwards — the field is stable');

  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
