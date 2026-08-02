/**
 * COMPACTION DECAY, VERIFIED IN PLAY.
 *
 *   A  a cell parked on the terminal gate (c>=20) falls off it in real time
 *   B  the shallow end stays forgiving — c=8 does not evaporate
 *   C  a working hand outruns decay: chipping still climbs
 *   D  dpsMax is unmoved on a fully PACKED shop
 *
 * The clock is the ENGINE's, driven by `tick`, not a wall-clock sleep — the
 * claim is about simulated minutes and a driver that waited ten real minutes
 * would be testing patience.
 *
 *   npx tsx scripts/verify-decay.ts [port]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-decay';
const problems: string[] = [];
const check = (ok: boolean, label: string, detail = ''): void => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
};

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 900 }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f;
  });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { dispatch: (a: unknown) => unknown };
    e.dispatch({ type: 'markSystemsSeen', ids: ['dig', 'shaft', 'kiln', 'hold', 'collapse'] });
  });

  // ── A. OFF THE TERMINAL GATE ────────────────────────────────────────────
  console.log('A — a cell parked at 20 falls off the terminal gate');
  const decayed = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; tick: (n: number) => void };
    const s = e.getState() as unknown as { face: { compaction?: number[]; cells: number[] } };
    s.face.compaction = s.face.cells.map(() => 20);
    const atGate = (): number => (s.face.compaction ?? []).filter((c) => c >= 20).length;
    const start = atGate();
    // Ten seconds of engine time: a gate is not a timer, nothing should move.
    for (let i = 0; i < 100; i++) e.tick(0.1);
    const after10s = atGate();
    // Ten simulated minutes.
    for (let i = 0; i < 6000; i++) e.tick(0.1);
    const after10m = atGate();
    return { start, after10s, after10m, sample: (s.face.compaction ?? []).slice(0, 6) };
  });
  console.log(`      at gate: ${decayed.start} → ${decayed.after10s} (10s) → ${decayed.after10m} (10 sim-min)`);
  console.log(`      a few cells now: ${JSON.stringify(decayed.sample)}`);
  check(decayed.start >= 36, 'the whole board starts on the terminal gate', `${decayed.start} cells`);
  // At c=20 a cell sheds a point about every 101s, so over ten seconds ~10% of
  // the board is EXPECTED to slip one — the first cut allowed only 3 cells and
  // failed on the process behaving correctly. A TIMER would have taken all 36.
  check(decayed.after10s >= decayed.start * 0.7, 'TEN SECONDS costs almost nothing — it is not a timer',
    `${decayed.after10s} of ${decayed.start} still at gate`);
  check(decayed.after10m <= 2, 'TEN MINUTES and the board has fallen off it',
    `${decayed.after10m} still at gate`);

  // ── B. THE SHALLOW END IS FORGIVING ─────────────────────────────────────
  console.log('B — the shallow end does not evaporate');
  const shallow = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; tick: (n: number) => void };
    const s = e.getState() as unknown as { face: { compaction?: number[]; cells: number[] } };
    s.face.compaction = s.face.cells.map(() => 8);
    for (let i = 0; i < 1800; i++) e.tick(0.1); // 3 simulated minutes
    const held = (s.face.compaction ?? []).filter((c) => c >= 8).length;
    return { held, total: s.face.cells.length };
  });
  console.log(`      still at 8 after 3 sim-min: ${shallow.held} of ${shallow.total}`);
  check(shallow.held > shallow.total * 0.6,
    'three minutes barely touches the first gate — §23\'s opening is not a chore',
    `${shallow.held}/${shallow.total}`);

  // ── C. A WORKING HAND OUTRUNS IT ────────────────────────────────────────
  console.log('C — chipping still climbs');
  const climbed = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    const s = e.getState() as unknown as { face: { compaction?: number[]; cells: number[]; ore?: string[] } };
    s.face.compaction = s.face.cells.map(() => 0);
    // CLEAR THE POCKETS FIRST. The three simulated minutes in B are long enough
    // for tickOres to seed one on cell 0, and a pocket correctly refuses an
    // ordinary chip — so this check would fail on the ore system working. Same
    // lottery that flaked confluence.test for the life of the project.
    s.face.ore = [];
    for (let i = 0; i < 60; i++) {
      s.face.ore = [];
      s.face.cells[0] = 999;
      e.dispatch({ type: 'chip', cell: 0 });
      e.tick(0.5); // half a second of decay between strokes
    }
    return s.face.compaction?.[0] ?? 0;
  });
  console.log(`      cell 0 after 60 worked strokes: ${climbed}`);
  check(climbed >= 20, 'a hand that keeps working reaches the terminal gate', `c=${climbed}`);

  // ── D. PILLAR 2 ─────────────────────────────────────────────────────────
  console.log('D — dpsMax unmoved on a fully packed shop');
  // Read the CEILING off the panel the player reads, not off a helper.
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('dig');
  });
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { dispatch: (a: unknown) => unknown };
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e12 });
  });
  await page.waitForTimeout(800);
  /**
   * THREE READS, THREE ROUND TRIPS. The first cut did all three inside ONE
   * page.evaluate: React publishes at ~12Hz and re-renders asynchronously, so
   * every read came back with the pre-render DOM and all three ceilings were
   * identical — including the bare one, which made the pass look real.
   */
  const readCeiling = (): Promise<string> => page.evaluate(() => {
    const el = [...document.querySelectorAll('div')]
      .find((d) => d.textContent?.trim().startsWith('Field ceiling'));
    const txt = (el?.parentElement?.innerText ?? '').split(/s+/).join(' ').trim();
    return (/Field ceiling ([0-9.]+)/.exec(txt)?.[1]) ?? txt;
  });
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { dispatch: (a: unknown) => unknown };
    for (let i = 0; i < 20; i++) {
      for (const id of ['blade', 'soil', 'roots']) e.dispatch({ type: 'buyUpgrade', id, branch: 'income' });
    }
  });
  await page.waitForTimeout(900);
  const income = await readCeiling();
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as {
      upgrades: Record<string, number>; shop: { packed: Record<string, number> };
    };
    for (const id of ['blade', 'soil', 'roots']) s.shop.packed[id] = s.upgrades[id] ?? 0;
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1 });
  });
  await page.waitForTimeout(900);
  const packed = await readCeiling();
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as {
      upgrades: Record<string, number>; shop: { packed: Record<string, number> };
    };
    for (const id of ['blade', 'soil', 'roots']) { s.upgrades[id] = 0; s.shop.packed[id] = 0; }
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1 });
  });
  await page.waitForTimeout(900);
  const bare = await readCeiling();
  console.log(`      no levels : ${JSON.stringify(bare)}`);
  console.log(`      all-income: ${JSON.stringify(income)}`);
  console.log(`      all-packed: ${JSON.stringify(packed)}`);
  check(packed === bare,
    'A FULLY PACKED SHOP READS THE BARE CEILING — packed is not a formula input',
    `${packed} vs ${bare}`);
  check(income !== packed,
    'and the income side really does move it, so this is not a vacuous pass');

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow === 0, 'no horizontal overflow at 380px', `${overflow}px`);
  check(errors.length === 0, 'no page errors throughout', errors.join(' | '));
  await page.screenshot({ path: `${OUT}/decay.png` });
  console.log('  shot decay');
  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
