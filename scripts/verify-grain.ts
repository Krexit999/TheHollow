/**
 * PROOF #1 VERIFICATION — the face with grain, driven through the LIVE PATH.
 *
 * A number in a report is a claim until it comes from the live path, so nothing
 * here calls the engine's chip function directly. Every strike below is a real
 * pointer click on the real Pixi canvas, through the real cooldown, the real
 * dispatch and the real renderer — which is also the only way to find out
 * whether the wave is watchable, since a headless run cannot see a trail.
 *
 * TWO STIPULATIONS, BOTH STATED RATHER THAN HIDDEN:
 *   1. `soil` is set high so cells refill in a few seconds. Without it a 6x6
 *      face at 0.08 charge/sec/cell yields about 36 chips and then nothing for
 *      two minutes, and a 200-chip session would take an hour of wall clock.
 *      It changes HOW OFTEN a cell is workable. It cannot change front length,
 *      lock behaviour, or which gate a compaction count opens.
 *   2. The driver's chips/min is the DRIVER's cadence, not a human's. That one
 *      metric in the report below is therefore not evidence about rhythm; every
 *      other one is.
 *
 *   npm run dev, then:  npx tsx scripts/verify-grain.ts [outDir]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dismiss } from './drive';

const OUT = process.argv[2] ?? 'sim-out/shots-grain';
/**
 * TWO PLAYER MODELS, because one of §9's metrics cannot be measured by a script
 * that does not look at the screen.
 *
 *   blind      strikes the head whatever state it is in. Every lock it causes
 *              is a lock the TELEGRAPH had no chance to prevent, so this is the
 *              floor: what the system does to somebody who never reads it.
 *   telegraph  refuses to take a cell at 18+ across the grain, and abandons the
 *              wave instead. This is a player who reads the red ring and
 *              believes it.
 *
 *   aimed      reads the telegraph AND chooses where to OPEN a wave by walking
 *              the grain field first, taking the cell with the longest live
 *              path ahead of it. This is the only model that tests the proof's
 *              actual question — whether the field can be aimed ALONG — because
 *              the other two open every wave on 'the fullest cell', which is a
 *              policy with no aim in it at all and puts a floor under nothing.
 *
 * The gap between the models is the whole measurement. A blind run's
 * 'accidental locks' figure on its own says nothing about whether the warning
 * works — only that a script cannot see it.
 */
const MODEL: 'blind' | 'telegraph' | 'aimed' = (process.argv[3] as never) ?? 'blind';
const TELEGRAPH_FROM = 18;
const URL = 'http://localhost:5173';
const W = 380, H = 820;

type Cell = { x: number; y: number };

async function shoot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  shot ${name}`);
}

/** Screen position of a cell index, read from the renderer's own geometry. */
async function cellBox(page: Page): Promise<(cell: number) => Cell> {
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

const chipCount = (page: Page) => page.evaluate(() => {
  const e = (window as unknown as Record<string, { getState: () => never }>)['__engine']!;
  return (e.getState() as unknown as { stats: { manualChips: number } }).stats.manualChips;
});

const buttons = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll('button')].map((b) => b.textContent?.trim()).filter(Boolean).slice(0, 14));

const face = (page: Page) => page.evaluate(() => {
  const e = (window as unknown as Record<string, { getState: () => never }>)['__engine']!;
  const s = e.getState() as unknown as {
    face: {
      cells: number[]; compaction?: number[]; locked?: boolean[]; ore?: string[]; grain?: number[];
      front?: { cell: number; hops: number; alive: boolean };
    };
  };
  return {
    cells: s.face.cells,
    comp: s.face.compaction ?? [],
    locked: s.face.locked ?? [],
    ore: s.face.ore ?? [],
    grain: s.face.grain ?? [],
    front: s.face.front ?? null,
  };
});

/** How many hops a wave opened at  could take right now, through rock
 *  that is alive, unlocked, not a pocket, and holding something. */
function pathAhead(f: { grain: number[]; cells: number[]; locked: boolean[]; ore: string[] }, cell: number): number {
  const W6 = 6;
  const h = f.cells.length / W6;
  let at = cell, hops = 0;
  const seen = new Set<number>();
  while (!seen.has(at) && hops < 40) {
    seen.add(at);
    const x = at % W6, y = Math.floor(at / W6), d = f.grain[at] ?? 1;
    const next = d === 0 ? (y > 0 ? at - W6 : -1)
      : d === 1 ? (x < W6 - 1 ? at + 1 : -1)
        : d === 2 ? (y < h - 1 ? at + W6 : -1) : (x > 0 ? at - 1 : -1);
    if (next < 0 || f.locked[next] || f.ore[next]) break;
    at = next; hops++;
  }
  return hops;
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

  // Stipulation 1 — see the header. Regen only.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, {
      getState: () => { upgrades: Record<string, number> };
      dispatch: (a: unknown) => unknown; tick: (n: number) => void;
    }>)['__engine']!;
    // NOTHING IS GRANTED. The first pass gave the player a billion Dust to get
    // going and lost 95% of its clicks: the windfall unlocked several systems
    // at once and the disclosure gate sat over the canvas swallowing every tap,
    // while the driver reported success. Regen is the only thing touched here.
    e.getState().upgrades['soil'] = 120;
    // ...and even without the windfall, a high-regen face earns fast enough to
    // open a system every few seconds, so the gate would keep coming back. Mark
    // every room already seen: the disclosure card is not what is being tested,
    // and an instrument that cannot tell "did nothing" from "did the thing" is
    // this project's standing failure mode.
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

  // ── 1. THE FRESH BAND ────────────────────────────────────────────────────
  await shoot(page, '1-fresh-band');

  // ── PHASE A: sixty with-grain chips, no aim. What a player does first. ────
  console.log(`model: ${MODEL}`);
  console.log('phase A — 60 with-grain, unaimed');
  const pA = await chipCount(page);
  await setStrike(page, 'with');
  for (let i = 0; i < 60; i++) {
    const f = await face(page);
    let best = -1, bestC = -1;
    for (let c = 0; c < f.cells.length; c++) {
      // A POCKET IS NOT A TAP TARGET, and finding that out cost this script two
      // runs. An ore raises its cell's CAP, so it is permanently the fullest
      // cell on the board — and it refuses a swing by design (it has to be
      // WORKED with a hold). A driver that picks 'the fullest cell' therefore
      // locks onto the first pocket that spawns and chips nothing ever again,
      // while every click reports as delivered.
      if (f.locked[c] || f.ore[c]) continue;
      if (f.cells[c]! > bestC) { bestC = f.cells[c]!; best = c; }
    }
    if (best >= 0) await click(best);
    await page.waitForTimeout(190);
    // THE GATE EATS TAPS AND REPORTS NOTHING. Income at this regen unlocks a
    // system every few seconds, and the disclosure modal covers the canvas —
    // the first run of this script lost 95% of its clicks to it and called the
    // session a success. Clear it on a beat rather than hoping.
    if (i % 10 === 9) await dismiss(page);
  }

  // ── PHASE B: a hundred and twenty across-grain chips, STEERED. ────────────
  // Strike the front's head whenever it is alive and workable; otherwise open
  // a new wave on the fullest cell. This is a player who has understood the
  // system, and it is what the front-length metric is measuring.
  console.log(`  phase A landed ${(await chipCount(page)) - pA} of 60`);
  console.log('phase B — 120 across-grain, steering the front');
  const pB = await chipCount(page);
  console.log('  visible buttons: ' + JSON.stringify(await buttons(page)));
  await setStrike(page, 'across');
  let midShot = false;
  for (let i = 0; i < 120; i++) {
    const f = await face(page);
    let target = -1;
    // THE WAVE IS PACED BY REGEN, and that is the rock's answer rather than a
    // driver detail: a front walks 4-5 cells and comes back round to rock it
    // just emptied, and an empty cell refuses the chip (THE UNEMPTYING). So the
    // head is only struck when it actually holds something — which is what a
    // player does too, because a swing at flat rock gives nothing back.
    const head = f.front?.alive ? f.front.cell : -1;
    const headSafe = MODEL === 'blind' || (f.comp[head] ?? 0) < TELEGRAPH_FROM;
    if (head >= 0 && headSafe && !f.locked[head] && !f.ore[head] && f.cells[head]! > 3) {
      target = head;
    } else {
      let bestScore = -1;
      for (let c = 0; c < f.cells.length; c++) {
        if (f.locked[c] || f.ore[c]) continue;
        if (MODEL !== 'blind' && (f.comp[c] ?? 0) >= TELEGRAPH_FROM) continue;
        if (f.cells[c]! <= 3) continue;
        // AIMED: score the cell by how far a wave opened there could actually
        // run — the grain walked forward through live, charged rock. That is
        // what 'aiming along the grain' MEANS, and no other model does it.
        const score = MODEL === 'aimed' ? pathAhead(f, c) * 100 + f.cells[c]! : f.cells[c]!;
        if (score > bestScore) { bestScore = score; target = c; }
      }
    }
    if (target >= 0) await click(target);
    await page.waitForTimeout(330);
    if (i % 10 === 9) await dismiss(page);
    if (!midShot && (f.front?.hops ?? 0) >= 3) {
      await shoot(page, '2-mid-wave-front-and-trail');
      midShot = true;
    }
  }
  if (!midShot) await shoot(page, '2-mid-wave-front-and-trail');

  // ── PHASE C: forty chips chasing the deepest cell on the board. ───────────
  // The greedy read: whatever is most compacted is worth the most, right up
  // until the strike that kills it.
  console.log(`  phase B landed ${(await chipCount(page)) - pB} of 120`);
  console.log('  visible buttons: ' + JSON.stringify(await buttons(page)));
  console.log('phase C — 40 chips chasing compaction');
  const pC = await chipCount(page);
  for (let i = 0; i < 40; i++) {
    const f = await face(page);
    let target = -1, bestScore = -1;
    for (let c = 0; c < f.cells.length; c++) {
      if (f.locked[c] || f.ore[c] || f.cells[c]! < 1) continue;
      const score = (f.comp[c] ?? 0) * 10 + f.cells[c]!;
      if (score > bestScore) { bestScore = score; target = c; }
    }
    await setStrike(page, (f.comp[target] ?? 0) >= 18 ? 'with' : 'across');
    if (target >= 0) await click(target);
    await page.waitForTimeout(300);
    if (i % 10 === 9) await dismiss(page);
  }

  console.log(`  phase C landed ${(await chipCount(page)) - pC} of 40`);
  // WHERE THE BOARD ENDED UP. The equilibrium matters more than the peak:
  // compaction never falls, so whatever share of cells sits at the terminal
  // gate at the end of a session sits there for the rest of the arc.
  const endState = await face(page);
  const atGate = { g8: 0, g14: 0, g20: 0, dead: 0 };
  for (let c = 0; c < endState.cells.length; c++) {
    if (endState.locked[c]) { atGate.dead++; continue; }
    const v = endState.comp[c] ?? 0;
    if (v >= 20) atGate.g20++; else if (v >= 14) atGate.g14++; else if (v >= 8) atGate.g8++;
  }
  console.log(`  board at end of session (of ${endState.cells.length} cells): >=20 ${atGate.g20} · 14-19 ${atGate.g14} · 8-13 ${atGate.g8} · dead ${atGate.dead}`);
  // ── 3. THE TELEGRAPH, at 19 ──────────────────────────────────────────────
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, {
      getState: () => { face: { compaction?: number[]; cells: number[] } }; tick: (n: number) => void;
    }>)['__engine']!;
    const s = e.getState();
    // A row of cells across the telegraph band, so the shot shows the boundary
    // rather than one cell in isolation: 17 is safe, 18/19/20 are not.
    [16, 17, 18, 19].forEach((cell, i) => { s.face.compaction![cell] = 17 + i; });
    s.face.compaction![8] = 8; s.face.compaction![9] = 14;
    e.tick(0.2);
  });
  await shoot(page, '3-telegraph-at-19');

  // ── 4. A LOCKED CELL, killed through the live path ───────────────────────
  await setStrike(page, 'across');
  await click(19); // sitting at 20 — one across-grain take from dead
  await page.waitForTimeout(400);
  const afterKill = await face(page);
  console.log(`  cell 19 locked: ${afterKill.locked[19]}`);
  await shoot(page, '4-locked-cell');

  // ── 5. THE THREE DRILL MODES ─────────────────────────────────────────────
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, {
      getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void;
    }>)['__engine']!;
    const s = e.getState() as unknown as {
      drills: { bayBuilt: boolean; units: unknown[] };
    };
    s.drills.bayBuilt = true;
    s.drills.units = [
      { level: 6, timer: 0, lastCell: 0, use: {}, name: 'Bess', grainMode: 'with' },
      { level: 6, timer: 0, lastCell: 12, use: {}, name: 'Old Tom', grainMode: 'across' },
      { level: 6, timer: 0, lastCell: 24, use: {}, name: 'The Mole', grainMode: 'follow' },
    ];
    e.tick(0.2);
  });
  await page.waitForTimeout(4000); // let them work, so the shot shows them ON rock
  await shoot(page, '5a-three-drill-modes-on-the-face');
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('drills');
  });
  await page.waitForTimeout(600);
  await page.getByTestId('route-1').click({ timeout: 3000 })
    .catch(() => console.log('  (routing button not found)'));
  await page.waitForTimeout(700);
  // THE PANEL OPENS BELOW THE FOLD. The painter renders under the drill row it
  // belongs to, and with three machines that is a screen and a half down — the
  // first shot of this state was a picture of the face with an empty grid
  // peeking in at the bottom. Scroll to the control being photographed.
  await page.getByTestId('grain-safety').scrollIntoViewIfNeeded({ timeout: 3000 })
    .catch(() => console.log('  (grain mode buttons not found)'));
  await page.waitForTimeout(500);
  await shoot(page, '5b-drill-grain-modes-panel');
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab('dig');
  });
  await page.waitForTimeout(700);

  // ── 6. THE BAND-SCOPE FALLBACK ───────────────────────────────────────────
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setGrainScope: (x: string) => void } }>)['__ui']!;
    ui.getState().setGrainScope('band');
  });
  await page.waitForTimeout(900);
  await shoot(page, '6-grainscope-band');
  await page.evaluate(() => {
    const ui = (window as unknown as Record<string, { getState: () => { setGrainScope: (x: string) => void } }>)['__ui']!;
    ui.getState().setGrainScope('cell');
  });

  // ── THE REPORT ───────────────────────────────────────────────────────────
  const landed = await chipCount(page);
  console.log(`
clicks attempted 220 · chips landed ${landed}`);
  const report = await page.evaluate(() => {
    const e = (window as unknown as Record<string, { faceReport: () => string }>)['__engine']!;
    return e.faceReport();
  });
  const held = await page.evaluate(() => {
    const e = (window as unknown as Record<string, { getState: () => never }>)['__engine']!;
    const s = e.getState() as unknown as { materials: { stacks: Record<string, unknown> } };
    return Object.keys(s.materials.stacks ?? {});
  });
  console.log('\n' + report);
  console.log(`\ndeep-entry materials held: ${held.filter((k) => /deepgrave|graveclaydeep|umberjade/.test(k)).join(', ') || 'none'}`);
  writeFileSync(`${OUT}/facereport.txt`, `${report}\n\nheld: ${held.join(', ')}\n`);

  await browser.close();
}

void main();
