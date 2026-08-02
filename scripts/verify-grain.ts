/**
 * PROOF #1 VERIFICATION — the face with grain, driven through the LIVE PATH.
 *
 * A number in a report is a claim until it comes from the live path, so nothing
 * here calls the engine's chip function directly. Every strike below is a real
 * pointer click on the real Pixi canvas, through the real cooldown, the real
 * dispatch and the real renderer.
 *
 * TWO PLAYER MODELS, because the proof's question is about AIM and only one of
 * them contains any:
 *
 *   flat   opens every wave on the fullest cell. No aim at all — this is the
 *          floor, what the system gives somebody poking at it.
 *   aimed  walks the grain field first and opens the wave on the cell with the
 *          longest live path ahead of it. This is the model that actually tests
 *          whether the field can be aimed ALONG.
 *
 * The gap between them is the measurement. If they come out the same, the grain
 * is decoration.
 *
 * THREE STIPULATIONS, STATED RATHER THAN HIDDEN:
 *   1. `soil` is set high so cells refill in seconds. A 6x6 face at 0.08
 *      charge/sec/cell yields ~36 chips and then nothing for two minutes. It
 *      changes HOW OFTEN a cell is workable; it cannot change front length or
 *      which gate a compaction count opens.
 *   2. Every room is pre-marked seen. The disclosure gate covers the canvas and
 *      eats taps, and the first run of this script lost 95% of its clicks to it
 *      while reporting success.
 *   3. chips/min is the DRIVER's cadence, not a human's. That one metric is not
 *      evidence about rhythm; every other one is.
 *
 *   npm run dev, then:  npx tsx scripts/verify-grain.ts [outDir] [flat|aimed] [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dismiss } from './drive';

const OUT = process.argv[2] ?? 'sim-out/shots-grain';
const MODEL: 'flat' | 'aimed' = (process.argv[3] as 'flat' | 'aimed') ?? 'flat';
const URL = `http://localhost:${process.argv[4] ?? '5173'}`;
const W = 380, H = 820;
/** Enough charge to be worth a swing — below this THE UNEMPTYING refuses it. */
const WORTH_STRIKING = 3;

interface Board {
  cells: number[];
  comp: number[];
  ore: string[];
  grain: number[];
  front: { cell: number; hops: number; alive: boolean } | null;
  w: number;
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  shot ${name}`);
}

/** Screen position of a cell index, read from the renderer's own geometry. */
async function cellBox(page: Page): Promise<(cell: number) => { x: number; y: number }> {
  const geo = await page.evaluate(() => {
    const v = (window as unknown as Record<string, unknown>)['__faceView'] as unknown as
      { cellSize: number; gridX: number; gridY: number; faceW: number };
    const el = document.querySelector('canvas')!.getBoundingClientRect();
    return { size: v.cellSize, gx: v.gridX, gy: v.gridY, w: v.faceW, ox: el.x, oy: el.y };
  });
  return (cell: number) => ({
    x: geo.ox + geo.gx + (cell % geo.w) * geo.size + geo.size / 2,
    y: geo.oy + geo.gy + Math.floor(cell / geo.w) * geo.size + geo.size / 2,
  });
}

const chipCount = (page: Page): Promise<number> => page.evaluate(() => {
  const e = (window as unknown as Record<string, { getState: () => never }>)['__engine']!;
  return (e.getState() as unknown as { stats: { manualChips: number } }).stats.manualChips;
});

const face = (page: Page): Promise<Board> => page.evaluate(() => {
  const e = (window as unknown as Record<string, { getState: () => never }>)['__engine']!;
  const s = e.getState() as unknown as {
    face: {
      w: number; cells: number[]; compaction?: number[]; ore?: string[]; grain?: number[];
      front?: { cell: number; hops: number; alive: boolean };
    };
  };
  return {
    w: s.face.w,
    cells: s.face.cells,
    comp: s.face.compaction ?? [],
    ore: s.face.ore ?? [],
    grain: s.face.grain ?? [],
    front: s.face.front ?? null,
  };
});

/**
 * How many hops a wave opened here could take right now, walking the grain
 * through rock that is not a pocket. This is what "aiming along the grain"
 * MEANS, and it is the only thing separating the two models.
 */
function pathAhead(f: Board, cell: number): number {
  const h = f.cells.length / f.w;
  let at = cell, hops = 0;
  const seen = new Set<number>();
  while (!seen.has(at) && hops < 40) {
    seen.add(at);
    const x = at % f.w, y = Math.floor(at / f.w), d = f.grain[at] ?? 1;
    const next = d === 0 ? (y > 0 ? at - f.w : -1)
      : d === 1 ? (x < f.w - 1 ? at + 1 : -1)
        : d === 2 ? (y < h - 1 ? at + f.w : -1) : (x > 0 ? at - 1 : -1);
    if (next < 0 || f.ore[next]) break;
    at = next; hops++;
  }
  return hops;
}

/** Where this model would OPEN a new wave. A pocket is never a tap target — it
 *  is permanently the fullest cell on the board and refuses a swing by design,
 *  which cost this script two runs before anyone noticed. */
function openAt(f: Board): number {
  let best = -1, bestScore = -1;
  for (let c = 0; c < f.cells.length; c++) {
    if (f.ore[c] || f.cells[c]! <= WORTH_STRIKING) continue;
    const score = MODEL === 'aimed' ? pathAhead(f, c) * 100 + f.cells[c]! : f.cells[c]!;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

async function setStrike(page: Page, mode: 'with' | 'across'): Promise<void> {
  await page.evaluate((m) => {
    const ui = (window as unknown as Record<string, { getState: () => { setGrainStrike: (x: string) => void } }>)['__ui']!;
    ui.getState().setGrainStrike(m);
  }, mode);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.log('  PAGEERROR:', e.message));
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    const e = (window as unknown as Record<string, {
      getState: () => { upgrades: Record<string, number> };
      dispatch: (a: unknown) => unknown; tick: (n: number) => void;
    }>)['__engine']!;
    e.getState().upgrades['soil'] = 120;
    e.dispatch({
      type: 'markSystemsSeen',
      ids: ['dig', 'kiln', 'drills', 'vents', 'hollow', 'lattice', 'crucible', 'foundry',
        'greenhouse', 'mycelium', 'loom', 'bench', 'array', 'chamber', 'hold', 'forge',
        'runes', 'brew', 'guild', 'bestiary', 'warrens', 'observatory', 'journal', 'wells',
        'delver', 'collapse', 'rewrite', 'parallel', 'grid', 'vault', 'relics', 'shaft',
        'museum', 'compendium', 'refinery', 'casting', 'station'],
    });
    e.tick(0.2);
  });
  await page.waitForTimeout(1500);

  const at = await cellBox(page);
  const click = async (cell: number): Promise<void> => {
    const p = at(cell);
    await page.mouse.click(p.x, p.y);
  };

  console.log(`model: ${MODEL}`);
  await shoot(page, '1-fresh-band');

  // ── PHASE A: sixty with-grain chips. What a player does before they know. ──
  console.log('phase A — 60 with-grain, unaimed');
  const pA = await chipCount(page);
  await setStrike(page, 'with');
  for (let i = 0; i < 60; i++) {
    const f = await face(page);
    const t = openAt(f);
    if (t >= 0) await click(t);
    await page.waitForTimeout(190);
    if (i % 10 === 9) await dismiss(page);
  }
  console.log(`  phase A landed ${(await chipCount(page)) - pA} of 60`);

  // ── PHASE B: a hundred and twenty across-grain chips, STEERED. ────────────
  // Strike the head whenever it holds something; otherwise open a new wave
  // where this model says to. The whole front-length metric is this loop.
  console.log('phase B — 120 across-grain, steering the front');
  const pB = await chipCount(page);
  await setStrike(page, 'across');
  let midShot = false;
  for (let i = 0; i < 120; i++) {
    const f = await face(page);
    const head = f.front?.alive ? f.front.cell : -1;
    // THE WAVE IS PACED BY REGEN, and that is the rock's answer rather than a
    // driver detail: a front walks four or five cells and comes back round to
    // rock it just emptied, which refuses the chip (THE UNEMPTYING).
    const target = head >= 0 && !f.ore[head] && f.cells[head]! > WORTH_STRIKING
      ? head : openAt(f);
    if (target >= 0) await click(target);
    await page.waitForTimeout(330);
    if (i % 10 === 9) await dismiss(page);
    if (!midShot && (f.front?.hops ?? 0) >= 3) {
      await shoot(page, '2-mid-wave-front-and-trail');
      midShot = true;
    }
  }
  if (!midShot) await shoot(page, '2-mid-wave-front-and-trail');
  console.log(`  phase B landed ${(await chipCount(page)) - pB} of 120`);

  // ── PHASE C: forty chips working the deepest rock on the board. ───────────
  console.log('phase C — 40 chips working the deepest rock');
  const pC = await chipCount(page);
  for (let i = 0; i < 40; i++) {
    const f = await face(page);
    let target = -1, bestScore = -1;
    for (let c = 0; c < f.cells.length; c++) {
      if (f.ore[c] || f.cells[c]! <= WORTH_STRIKING) continue;
      const score = (f.comp[c] ?? 0) * 10 + f.cells[c]!;
      if (score > bestScore) { bestScore = score; target = c; }
    }
    if (target >= 0) await click(target);
    await page.waitForTimeout(300);
    if (i % 10 === 9) await dismiss(page);
  }
  console.log(`  phase C landed ${(await chipCount(page)) - pC} of 40`);

  // WHERE THE BOARD ENDED UP. Compaction never falls inside a run, so the share
  // of cells sitting at each gate at the end is what the rest of the run pays.
  const end = await face(page);
  const gates = { g8: 0, g14: 0, g20: 0 };
  for (let c = 0; c < end.cells.length; c++) {
    const v = end.comp[c] ?? 0;
    if (v >= 20) gates.g20++; else if (v >= 14) gates.g14++; else if (v >= 8) gates.g8++;
  }
  console.log(`  board at end (of ${end.cells.length}): >=20 ${gates.g20} · 14-19 ${gates.g14} · 8-13 ${gates.g8}`);

  // ── 3. A CELL AT THE DEEPEST GATE ────────────────────────────────────────
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, {
      getState: () => { face: { compaction?: number[] } }; tick: (n: number) => void;
    }>)['__engine']!;
    const s = e.getState();
    // One of each band in a row, so the shot shows the ladder rather than one
    // cell in isolation: quiet, numbered, numbered-deeper, rung.
    [0, 8, 14, 20].forEach((v, i) => { s.face.compaction![16 + i] = v; });
    e.tick(0.2);
  });
  await shoot(page, '3-compaction-ladder');

  // ── 4. THE THREE DRILL MODES ─────────────────────────────────────────────
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, {
      getState: () => never; tick: (n: number) => void;
    }>)['__engine']!;
    const s = e.getState() as unknown as { drills: { bayBuilt: boolean; units: unknown[] } };
    s.drills.bayBuilt = true;
    s.drills.units = [
      { level: 6, timer: 0, lastCell: 0, use: {}, name: 'Bess', grainMode: 'with' },
      { level: 6, timer: 0, lastCell: 12, use: {}, name: 'Old Tom', grainMode: 'across' },
      { level: 6, timer: 0, lastCell: 24, use: {}, name: 'The Mole', grainMode: 'follow' },
    ];
    e.tick(0.2);
  });
  await page.waitForTimeout(4000);
  await shoot(page, '4a-three-drill-modes-on-the-face');
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('drills');
  });
  await page.waitForTimeout(600);
  await page.getByTestId('route-1').click({ timeout: 3000 })
    .catch(() => console.log('  (routing button not found)'));
  await page.waitForTimeout(700);
  // The painter renders under the drill row it belongs to, which with three
  // machines is a screen and a half down. Scroll to the control being shot.
  await page.getByTestId('grain-across').scrollIntoViewIfNeeded({ timeout: 3000 })
    .catch(() => console.log('  (grain mode buttons not found)'));
  await page.waitForTimeout(500);
  await shoot(page, '4b-drill-grain-modes-panel');
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('dig');
  });
  await page.waitForTimeout(700);

  // ── 5. THE BAND-SCOPE FALLBACK ───────────────────────────────────────────
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setGrainScope: (x: string) => void } }>)['__ui']!;
    ui.getState().setGrainScope('band');
  });
  await page.waitForTimeout(900);
  await shoot(page, '5-grainscope-band');
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setGrainScope: (x: string) => void } }>)['__ui']!;
    ui.getState().setGrainScope('cell');
  });

  // ── THE REPORT ───────────────────────────────────────────────────────────
  console.log(`\nclicks attempted 220 · chips landed ${await chipCount(page)}`);
  const report = await page.evaluate(() => {
    const e = (window as unknown as Record<string, { faceReport: () => string }>)['__engine']!;
    return e.faceReport();
  });
  const held = await page.evaluate(() => {
    const e = (window as unknown as Record<string, { getState: () => never }>)['__engine']!;
    const s = e.getState() as unknown as { materials: { stacks: Record<string, unknown> } };
    return Object.keys(s.materials.stacks ?? {});
  });
  console.log(`\nMODEL: ${MODEL}`);
  console.log(report);
  console.log(`\ndeep-entry held: ${held.filter((k) => /deepgrave|graveclaydeep|umberjade/.test(k)).join(', ') || 'none'}`);
  writeFileSync(`${OUT}/facereport.txt`, `MODEL: ${MODEL}\n\n${report}\n\nheld: ${held.join(', ')}\n`);

  await browser.close();
}

void main();
