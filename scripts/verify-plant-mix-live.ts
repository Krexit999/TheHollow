/**
 * Ties scripts/sim-plant-mix.ts's numbers to the LIVE UI: build the Kiln,
 * dial the Core tree to a 5/5 Draught/Reservoir split (the sim's middle
 * point), and read the Hearth panel's Flow/Surge caps off the rendered page.
 * They should match the sim's 10.9 flowCap / 54 surgeCap for that split.
 *
 *   npx tsx scripts/verify-plant-mix-live.ts [port]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-plant-mix';

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 900 }, isMobile: true, hasTouch: true });
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f;
  });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(2500);

  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    const s = e.getState() as unknown as {
      kiln: { built: boolean; feeding: boolean; heat: number };
      collapse: { nodes: Record<string, number> };
    };
    e.dispatch({ type: 'markSystemsSeen', ids: ['dig', 'shaft', 'kiln', 'hold', 'collapse'] });
    s.kiln.built = true; s.kiln.feeding = true; s.kiln.heat = 1;
    // The sim's middle split: 5 Draught, 5 Reservoir.
    s.collapse.nodes['flowCapacity'] = 5;
    s.collapse.nodes['surgeCapacity'] = 5;
    e.tick(0.3);
  });
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('kiln');
  });
  await page.waitForTimeout(800);

  const text = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('div')]
      .filter((d) => d.textContent?.trim().startsWith('The Hearth'));
    const panel = heads[heads.length - 1]?.closest('.panel');
    return panel ? (panel as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
  });
  console.log(text);
  // flowCap reads directly (10.9/s of ... wanted); surgeCap is the bank's
  // DENOMINATOR (current fill / cap) — the sim's 54 is the cap, not the fill,
  // which is why "18 / 54" is a match, not a mismatch.
  const ok = /10\.9\/s/.test(text) && /\/\s*54\b/.test(text);
  console.log(ok ? 'PASS  live panel reads flowCap 10.9, surgeCap 54 — matches the sim\'s 5/5 row' : 'FAIL  panel does not match the sim row');

  const el = page.locator('.panel').filter({ hasText: 'The Hearth' }).first();
  await el.screenshot({ path: `${OUT}/5-5-split.png` }).catch(() => {});
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  console.log(`overflow: ${overflow}px`);
  await browser.close();
  process.exit(ok && overflow === 0 ? 0 : 1);
}

void main();
