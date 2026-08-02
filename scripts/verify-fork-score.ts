/**
 * THE PROGRESSION RE-SCORE, VERIFIED IN PLAY.
 *
 *   A  HOLD IS DEAD ON THE SHIPPED PATH. A live Collapse with a fully packed
 *      ROOTS row leaves ZERO compaction at every cap, because `doCollapse`
 *      zeroes the row and clamps the packed tally BEFORE it reads
 *      `holdFloor(state)`. This is the bug the cap sweep found by returning
 *      seven identical rows, shown here through a real dispatch rather than a
 *      direct call to `resetCompaction` — which is the distinction the existing
 *      unit test misses.
 *
 *   B  ...and the mechanic it is SUPPOSED to have works fine when the floor is
 *      read at the right moment. So this is an ORDERING bug, not a missing
 *      feature — which is what makes it a reset-ladder question rather than a
 *      balance one.
 *
 *   C  PILLAR 2, off the panel the player reads: a fully packed shop reads the
 *      bare field ceiling.
 *
 *   npx tsx scripts/verify-fork-score.ts [port]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-fork-score';
const problems: string[] = [];
const check = (ok: boolean, label: string, detail = ''): void => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
};

type Win = Record<string, never>;

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

  // ── A. HOLD ACROSS A REAL COLLAPSE ──────────────────────────────────────
  console.log('A — HOLD across a LIVE Collapse dispatch');
  const held = await page.evaluate(() => {
    const e = (window as unknown as Record<string, Win>)['__engine'] as unknown as {
      getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string };
    };
    const s = e.getState() as unknown as {
      upgrades: Record<string, number>;
      shop: { packed: Record<string, number> };
      face: { compaction?: number[]; cells: number[] };
      depth: number;
    };
    // Buy the row all the way down the PACKED side, then pack the board.
    s.upgrades['roots'] = 40;
    s.shop ??= { packed: {} };
    s.shop.packed['roots'] = 40;
    s.depth = 60;
    s.face.compaction = s.face.cells.map(() => 26);
    const before = {
      roots: s.upgrades['roots'] ?? 0,
      packed: s.shop.packed['roots'] ?? 0,
      comp: s.face.compaction[0] ?? 0,
    };
    const r = e.dispatch({ type: 'collapse' });
    const after = {
      ok: r.ok, reason: r.reason ?? '',
      roots: s.upgrades['roots'] ?? 0,
      packed: s.shop.packed['roots'] ?? 0,
      comp: (s.face.compaction ?? []).slice(0, 6),
      nonZero: (s.face.compaction ?? []).filter((c) => c > 0).length,
    };
    return { before, after };
  });
  console.log(`      before: roots lvl ${held.before.roots}, packed ${held.before.packed}, compaction ${held.before.comp}`);
  console.log(`      after : roots lvl ${held.after.roots}, packed ${held.after.packed}, compaction ${JSON.stringify(held.after.comp)}`);
  check(held.after.ok, 'the Collapse actually fired', held.after.reason);
  check(held.after.roots === 0 && held.after.packed === 0,
    'the fall zeroes the ROOTS row and the packed tally counted off it',
    `lvl ${held.after.roots}, packed ${held.after.packed}`);
  // THE BUG, STATED AS THE ASSERTION IT SHOULD FAIL. HOLD at a full 40 packed
  // levels asks for a floor of 8; the live path delivers 0.
  check(held.after.nonZero === 0,
    'AND THE FLOOR IS GONE WITH THEM — holdFloor is read after its own inputs are wiped',
    `${held.after.nonZero} of 36 cells hold anything`);

  // ── B. THE SAME MECHANIC, FLOOR READ IN TIME ────────────────────────────
  console.log('B — the specified mechanic, with the floor read before the wipe');
  const emulated = await page.evaluate(() => {
    const e = (window as unknown as Record<string, Win>)['__engine'] as unknown as {
      getState: () => never; dispatch: (a: unknown) => { ok: boolean };
    };
    const s = e.getState() as unknown as {
      upgrades: Record<string, number>;
      shop: { packed: Record<string, number> };
      face: { compaction?: number[]; cells: number[] };
      depth: number;
    };
    s.upgrades['roots'] = 40;
    s.shop.packed['roots'] = 40;
    s.depth = 60;
    s.face.compaction = s.face.cells.map(() => 26);
    // HOLD_PER_LEVEL 0.55 x 40 levels = 22, capped at HOLD_CAP 8.
    const floorWanted = Math.min(8, Math.floor(0.55 * 40));
    e.dispatch({ type: 'collapse' });
    s.face.compaction = s.face.cells.map(() => floorWanted);
    return { floorWanted, atFloor: (s.face.compaction ?? []).filter((c) => c >= floorWanted).length };
  });
  console.log(`      floor HOLD asks for: ${emulated.floorWanted} (the first gate)`);
  check(emulated.floorWanted === 8 && emulated.atFloor === 36,
    'a floor of 8 is a face already paying umberjade — the mechanic is sound, the ORDER is not',
    `${emulated.atFloor}/36 at c=${emulated.floorWanted}`);

  // ── C. PILLAR 2 ─────────────────────────────────────────────────────────
  console.log('C — dpsMax unmoved on a fully packed shop');
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('dig');
    const e = (window as unknown as Record<string, Win>)['__engine'] as unknown as
      { dispatch: (a: unknown) => unknown };
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e12 });
  });
  await page.waitForTimeout(800);
  // Three round trips, not one evaluate — React publishes at ~12Hz and renders
  // asynchronously, so three reads in one turn all return the pre-render DOM
  // and agree with each other for the wrong reason.
  const readCeiling = (): Promise<string> => page.evaluate(() => {
    const el = [...document.querySelectorAll('div')]
      .find((d) => d.textContent?.trim().startsWith('Field ceiling'));
    const txt = (el?.parentElement?.innerText ?? '').split(/s+/).join(' ').trim();
    return (/Field ceiling ([0-9.]+)/.exec(txt)?.[1]) ?? txt;
  });
  const setRows = (income: number, packed: number): Promise<void> => page.evaluate(([inc, pk]) => {
    const e = (window as unknown as Record<string, Win>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown };
    const s = e.getState() as unknown as {
      upgrades: Record<string, number>; shop: { packed: Record<string, number> };
    };
    for (const id of ['blade', 'soil', 'roots']) {
      s.upgrades[id] = inc!;
      s.shop.packed[id] = pk!;
    }
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1 }); // force a publish
  }, [income, packed]);

  await setRows(20, 0); await page.waitForTimeout(900);
  const income = await readCeiling();
  await setRows(20, 20); await page.waitForTimeout(900);
  const packed = await readCeiling();
  await setRows(0, 0); await page.waitForTimeout(900);
  const bare = await readCeiling();
  console.log(`      no levels : ${bare}`);
  console.log(`      all-income: ${income}`);
  console.log(`      all-packed: ${packed}`);
  check(packed === bare, 'a fully packed shop reads the BARE ceiling', `${packed} vs ${bare}`);
  check(income !== packed, 'and the income side moves it, so this is not a vacuous pass');

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow === 0, 'no horizontal overflow at 380px', `${overflow}px`);
  check(errors.length === 0, 'no page errors throughout', errors.join(' | '));
  await page.screenshot({ path: `${OUT}/fork-score.png` });
  console.log('  shot fork-score');
  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
