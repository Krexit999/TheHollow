/**
 * THE TWO LIVE-REPORT BUGS, DRIVEN THROUGH THE REAL PATH.
 *
 *  A — THE BRICK. Kill every cell you can and confirm the face never drops
 *      below its live floor, that income keeps coming, and that a save which
 *      was ALREADY killed repairs itself on load. The report was "now i cant do
 *      anything", and it was right: the only recovery from a dead board was a
 *      Collapse a dead board could not pay for.
 *
 *  B — THE POCKET BEHIND THE X. A pocket used to spawn on locked rock and stay
 *      fully workable, paying its guaranteed rolls for no charge. Run the ore
 *      trickle hard over a board with dead cells in it and confirm none lands.
 *
 *   npx tsx scripts/verify-lockfloor.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const PORT = process.argv[2] ?? '5173';
const URL = `http://localhost:${PORT}`;

const problems: string[] = [];
const check = (ok: boolean, label: string, detail = ''): void => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
};

const board = (page: Page) => page.evaluate(() => {
  const e = (window as unknown as Record<string, { getState: () => never }>)['__engine']!;
  const s = e.getState() as unknown as {
    face: { cells: number[]; compaction?: number[]; locked?: boolean[]; ore?: string[] };
    currencies: Record<string, unknown>;
  };
  const locked = s.face.locked ?? [];
  return {
    n: s.face.cells.length,
    dead: locked.filter(Boolean).length,
    live: locked.filter((l) => !l).length,
    oreOnDead: locked.reduce((acc, l, i) => acc + (l && s.face.ore?.[i] ? 1 : 0), 0),
    dust: Number(String((s.currencies['dust'] as { toString(): string })?.toString() ?? '0')),
  };
});

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 820 }, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.log('  PAGEERROR:', e.message));
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(1500);

  // ── A. TRY TO KILL THE WHOLE BOARD, through manualChip on the live engine ──
  console.log('A — trying to kill every cell');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { upgrades: Record<string, number> }; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    e.getState().upgrades['soil'] = 120;
    e.tick(0.2);
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { face: { cells: number[]; compaction?: number[] } }; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    // Five passes, every cell driven to the edge and struck across the grain.
    for (let pass = 0; pass < 5; pass++) {
      const s = e.getState();
      for (let c = 0; c < s.face.cells.length; c++) {
        s.face.compaction![c] = 20;
        s.face.cells[c] = 99;
        e.dispatch({ type: 'chip', cell: c, strike: 'across' });
      }
      e.tick(0.5);
    }
  });
  await page.waitForTimeout(600);
  const killed = await board(page);
  const floor = Math.ceil(killed.n * 0.25);
  check(killed.live >= floor, 'the face keeps a live floor',
    `${killed.live} live of ${killed.n} (floor ${floor}), ${killed.dead} dead`);

  mkdirSync('sim-out/shots-lockfloor', { recursive: true });
  await page.screenshot({ path: 'sim-out/shots-lockfloor/wrecked-board-holds.png' });

  // ...and the survivors still earn, which is the whole reason for the floor.
  const dustBefore = (await board(page)).dust;
  await page.waitForTimeout(4000);
  const dustAfter = (await board(page)).dust;
  check(dustAfter > dustBefore, 'a wrecked board still earns — the Collapse is reachable',
    `${dustBefore.toFixed(1)} -> ${dustAfter.toFixed(1)} Dust`);

  // ── B. THE ORE TRICKLE OVER DEAD ROCK ────────────────────────────────────
  console.log('B — running the ore trickle hard over a board with dead cells');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { dispatch: (a: unknown) => unknown };
    e.dispatch({ type: 'debug', op: 'warp', seconds: 1800 });
  });
  await page.waitForTimeout(1500);
  const trickled = await board(page);
  check(trickled.oreOnDead === 0, 'no pocket ever lands on dead rock',
    `${trickled.oreOnDead} pockets on ${trickled.dead} dead cells after 30 min of trickle`);

  // ── C. A BOARD KILLED BEFORE THE FIX REPAIRS ITSELF ──────────────────────
  console.log('C — a save that was already bricked');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => { face: { cells: number[]; locked?: boolean[]; compaction?: number[] } }; tick: (n: number) => void };
    const s = e.getState();
    s.face.locked = s.face.cells.map(() => true);   // exactly the reported state
    s.face.compaction = s.face.cells.map(() => 24);
    e.tick(0.5);
  });
  await page.waitForTimeout(800);
  const repaired = await board(page);
  check(repaired.live >= floor, 'a fully-dead board comes back on the next tick',
    `${repaired.live} live of ${repaired.n}`);

  // ── D. ABANDON THE DIG ───────────────────────────────────────────────────
  console.log('D — abandon the dig');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    e.dispatch({ type: 'hardReset' });
    e.tick(0.5);
  });
  await page.waitForTimeout(800);
  const reset = await board(page);
  check(reset.dead === 0, 'erasing everything gives back clean rock', `${reset.dead} dead`);

  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
