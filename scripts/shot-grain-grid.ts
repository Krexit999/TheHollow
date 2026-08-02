/**
 * THE GRID, LEGIBLE. A 380px face — the real target width, real layout — but
 * captured at 3x device scale and cropped to the rock, because the whole
 * question is whether two ticks point at each other and that is unanswerable
 * at a 36px tile in a 1x screenshot.
 *
 *   npx tsx scripts/shot-grain-grid.ts [port]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-grain';

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({
    viewport: { width: 380, height: 820 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  page.on('pageerror', (e) => console.log('  PAGEERROR:', e.message));
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f;
  });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(1800);

  // Clear the disclosure card off the rock — it is not what is being looked at.
  for (const label of [/Go on, then/, /One at a time/]) {
    const b = page.getByRole('button', { name: label }).first();
    if ((await b.count()) > 0) await b.click({ timeout: 800 }).catch(() => {});
  }
  await page.waitForTimeout(600);

  const geo = await page.evaluate(() => {
    const v = (window as unknown as Record<string, unknown>)['__faceView'] as unknown as
      { cellSize: number; gridX: number; gridY: number; faceW: number; faceH: number };
    const el = document.querySelector('canvas')!.getBoundingClientRect();
    return {
      x: el.x + v.gridX - 6,
      y: el.y + v.gridY - 6,
      width: v.cellSize * v.faceW + 12,
      height: v.cellSize * v.faceH + 12,
    };
  });
  await page.screenshot({ path: `${OUT}/grid-3x.png`, clip: geo });
  console.log(`shot ${OUT}/grid-3x.png  (380px layout, 3x scale)`);

  // The same field as data, so the picture can be checked against the numbers
  // rather than trusted — this session has had three instruments disagree with
  // the screen already.
  const audit = await page.evaluate(() => {
    const e = (window as unknown as Record<string, { getState: () => never }>)['__engine']!;
    const s = e.getState() as unknown as { face: { w: number; cells: number[]; grain?: number[]; grainGen?: number } };
    const g = s.face.grain ?? [];
    const w = s.face.w;
    const h = s.face.cells.length / w;
    const next = (c: number): number => {
      const x = c % w, y = Math.floor(c / w), d = g[c]!;
      return d === 0 ? (y > 0 ? c - w : -1) : d === 1 ? (x < w - 1 ? c + 1 : -1)
        : d === 2 ? (y < h - 1 ? c + w : -1) : (x > 0 ? c - 1 : -1);
    };
    let facing = 0, outward = 0;
    const rows: string[] = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) row += ' NESW'[g[y * w + x]! + 1];
      rows.push(row.trim().split('').join(' '));
    }
    for (let c = 0; c < g.length; c++) {
      const nx = next(c);
      if (nx < 0) outward++;
      else if (next(nx) === c) facing += 0.5;
    }
    return { rows, facing, outward, gen: s.face.grainGen };
  });
  console.log(`\nthe same field as letters (gen ${audit.gen}):`);
  for (const r of audit.rows) console.log(`  ${r}`);
  console.log(`\nfacing pairs ${audit.facing}   cells pointing off the board ${audit.outward}`);
  await browser.close();
}

void main();
