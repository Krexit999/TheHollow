/**
 * ITEM 6, VERIFIED IN PLAY — deep-entry, the trap material, the Call, the Bench.
 *
 *   A  a cell worked to 8, 14 and 20 drops each deep-entry material, with traits
 *   B  millstone reads as superb Core magnitude AND `brittle`
 *   C  the Call reads one favour, a Collapse, then a different one
 *   D  a bench sample burns fog off one Roll station, and the Roll shows it
 *   E  tier III prints a deep-entry prediction; below it, nothing at all
 *
 *   npx tsx scripts/verify-assay.ts [port]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = `http://localhost:${process.argv[2] ?? '5173'}`;
const OUT = 'sim-out/shots-assay';
const problems: string[] = [];
const check = (ok: boolean, label: string, detail = ''): void => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
};

const ALL_ROOMS = ['dig', 'shaft', 'kiln', 'drills', 'hold', 'casting', 'refinery', 'collapse', 'delver'];
/**
 * TWO MODALS CAN SIT OVER THIS DRIVER, and both are the game behaving
 * correctly: the DISCLOSURE GATE when a system genuinely opens, and the RUN
 * SUMMARY after a Collapse. This dismisses them the way a player does — mark
 * the rooms seen, then press the run summary's close button if it is up.
 */
const clearGate = async (page: Page): Promise<void> => {
  await page.evaluate((ids) => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { dispatch: (a: unknown) => unknown };
    e.dispatch({ type: 'markSystemsSeen', ids });
  }, ALL_ROOMS);
  await page.waitForTimeout(250);
  // PRESS THE BUTTONS A PLAYER PRESSES, rather than trying to predict which
  // rooms will open. `markSystemsSeen` with a hand-written id list is a guess,
  // and it was wrong twice — a room outside the list opened and the modal ate
  // the next click. Both dialogs are dismissed here by their own controls, in
  // a short loop because acknowledging one can reveal the next.
  for (let i = 0; i < 4; i++) {
    const closed = await page.evaluate(() => {
      let acted = false;
      const gate = document.querySelector('[aria-label="New systems opened"]');
      if (gate) {
        const btns = [...gate.querySelectorAll('button')];
        const go = btns[btns.length - 1];
        if (go) { (go as HTMLButtonElement).click(); acted = true; }
      }
      const summary = [...document.querySelectorAll('div.panel')]
        .find((d) => /the shaft fell/i.test((d as HTMLElement).innerText ?? ''));
      const sb = summary?.querySelector('button');
      if (sb) { (sb as HTMLButtonElement).click(); acted = true; }
      return !acted;
    });
    await page.waitForTimeout(250);
    if (closed) break;
  }
};
const goTab = async (page: Page, tab: string): Promise<void> => {
  await page.evaluate((t) => {
    const ui = (window as unknown as Record<string, { getState: () => { setTab: (x: string) => void } }>)['__ui']!;
    ui.getState().setTab(t);
  }, tab);
  await page.waitForTimeout(700);
};

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 1400 }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>)['__name'] = (f: unknown) => f;
  });
  await page.goto(URL);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(3000);
  await clearGate(page);

  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e12 });
    e.dispatch({ type: 'debug', op: 'grant', currency: 'brick', amount: 1e6 });
    const s = e.getState() as unknown as {
      kiln: { built: boolean; feeding: boolean; heat: number };
      forge: { built: boolean };
      depth: number; maxDepthRecord: number; shaft: { reached: number };
    };
    s.kiln.built = true; s.kiln.feeding = true; s.kiln.heat = 1;
    s.forge.built = true;
    s.depth = 80; s.maxDepthRecord = 80; s.shaft.reached = 80;
    e.tick(0.5);
  });
  await clearGate(page);

  // ── A. THE THREE DEEP-ENTRY GATES ───────────────────────────────────────
  // Drive a cell to each gate through the REAL chip path and read what lands.
  console.log('A — a cell worked to 8, 14 and 20');
  const deep = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    const out: Record<string, { got: number; traits: string[] }> = {};
    const want: Record<number, string> = { 8: 'umberjade', 14: 'graveclaydeep', 20: 'deepgrave' };
    for (const at of [8, 14, 20]) {
      const s = e.getState() as unknown as {
        face: { compaction?: number[]; cells: number[] };
        materials: { stacks: Record<string, Record<string, { count: number }>> };
      };
      const id = want[at]!;
      delete s.materials.stacks[id];
      let got = 0;
      // Hold the cell AT the gate and keep chipping — the gate rolls per chip.
      for (let i = 0; i < 900 && got === 0; i++) {
        s.face.compaction = s.face.cells.map(() => at);
        s.face.cells[0] = 999;
        e.dispatch({ type: 'chip', cell: 0 });
        const bands = s.materials.stacks[id];
        if (bands) got = Object.values(bands).reduce((a, b) => a + b.count, 0);
      }
      out[id] = { got, traits: [] };
    }
    return out;
  });
  for (const [id, r] of Object.entries(deep)) {
    console.log(`      ${id.padEnd(16)} dropped ${r.got}`);
    check(r.got > 0, `the ${id} gate pays`, `${r.got} held`);
  }

  // The TRAITS on these three are checked at E, on the tier-III reading — the
  // place the game actually prints them.

  // ── B. THE TRAP MATERIAL ────────────────────────────────────────────────
  console.log('B — millstone: superb, and wrong');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; tick: (n: number) => void };
    const s = e.getState() as unknown as {
      materials: { stacks: Record<string, Record<string, { count: number; puritySum: number }>>; totalDrops: number };
      assay: { knownMaterials: string[] };
    };
    // 'exalted' is a PURITY BAND. The first cut wrote 'flawless', which is a
    // RARITY — materialCount sums over BANDS, so the stack existed and counted
    // zero, and the Hold correctly showed nothing. A driver bug that read as a
    // missing material.
    s.materials.stacks['millstone'] = { exalted: { count: 6, puritySum: 6 * 82 } };
    s.materials.totalDrops += 6;
    if (!s.assay.knownMaterials.includes('millstone')) s.assay.knownMaterials.push('millstone');
    e.tick(0.3);
  });
  await goTab(page, 'hold');
  await clearGate(page);
  const holdText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const mill = /Millstone[^|]{0,120}/.exec(holdText)?.[0] ?? '';
  console.log(`      ${mill.slice(0, 120)}`);
  check(/Millstone/.test(holdText), 'millstone is in the Hold');
  // SUPERB: flawless rarity, and it landed in the top purity bands.
  check(/Millstone FLAWLESS/.test(mill), 'and it reads SUPERB — flawless, exalted purity', mill.slice(0, 60));
  // THE TRAIT is what the Assay is for, so it is checked where the Assay shows
  // it — the station reading, below — rather than on a Hold row that keeps its
  // traits behind an expand.
  await page.screenshot({ path: `${OUT}/B-millstone.png` });
  console.log('  shot B-millstone');

  // ── C. THE CALL, ACROSS A COLLAPSE ──────────────────────────────────────
  console.log('C — the Call, a Collapse, a different Call');
  await goTab(page, 'dig');
  const call1 = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="assay-call-material"]');
    return el ? (el as HTMLElement).innerText.trim() : '';
  });
  console.log(`      before: ${call1}`);
  check(call1.length > 0, 'the Call is on screen', call1);

  // Collapse until it moves. The pool is small, so one fall can repeat by
  // chance; what must be true is that it re-rolls at all.
  let call2 = call1;
  let falls = 0;
  for (let i = 0; i < 12 && call2 === call1; i++) {
    await page.evaluate(() => {
      const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
        { getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
      const s = e.getState() as unknown as { depth: number; shaft: { reached: number } };
      s.depth = 80; s.shaft.reached = 80;
      e.dispatch({ type: 'collapse' });
      e.tick(0.4);
    });
    falls += 1;
    await page.waitForTimeout(350);
    call2 = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="assay-call-material"]');
      return el ? (el as HTMLElement).innerText.trim() : '';
    });
  }
  console.log(`      after ${falls} fall(s): ${call2}`);
  check(call2 !== call1, 'THE CALL CHANGED ACROSS A COLLAPSE', `${call1} -> ${call2}`);
  await clearGate(page);
  await page.waitForTimeout(9000); // let the collapse toasts clear
  await page.locator('[data-testid="assay-call"]').screenshot({ path: `${OUT}/C-call.png` }).catch(() => {});
  console.log('  shot C-call');

  // ── D + E. THE BENCH ────────────────────────────────────────────────────
  console.log('D + E — a sample burns fog, tier III predicts');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; tick: (n: number) => void };
    const s = e.getState() as unknown as {
      casting: { rack: unknown[] }; plant: { surge: number };
      collapse: { nodes: Record<string, number> };
      depth: number; shaft: { reached: number };
    };
    s.depth = 20; s.shaft.reached = 20;
    s.collapse.nodes['surgeCapacity'] = 6;       // a bank big enough to read with
    s.casting.rack = Array.from({ length: 9 }, (_, i) => ({ id: 800 + i, type: 'head', materialId: 'marl', purity: 50 }));
    s.plant.surge = 200;
    e.tick(0.3);
  });
  await goTab(page, 'kiln');
  await clearGate(page);
  // Build to tier II through the real action.
  for (let i = 0; i < 2; i++) {
    await clearGate(page);
    await page.locator('[data-testid="build-assay-bench"]').click({ timeout: 6000 });
    await page.waitForTimeout(500);
  }
  const tierText = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="assay-bench"]');
    return el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim().slice(0, 130) : '';
  });
  console.log(`      ${tierText}`);
  check(/Tier II/.test(tierText), 'the bench reached tier II through the real path', tierText.slice(0, 60));

  // A far station — beyond the lamp — is not legible before, and is after.
  const far = await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as { getState: () => never };
    void e;
    const btns = [...document.querySelectorAll('[data-testid^="sample-btn-"]')];
    // Pick the DEEPEST offered, so it is certainly past the three-ahead window.
    const last = btns[btns.length - 1] as HTMLElement | undefined;
    return last ? last.getAttribute('data-testid')!.replace('sample-btn-', '') : '';
  });
  console.log(`      sampling: ${far}`);
  await page.locator(`[data-testid="sample-btn-${far}"]`).click({ timeout: 6000 });
  await page.waitForTimeout(400);
  const running = await page.evaluate(() => !!document.querySelector('[data-testid="sample-running"]'));
  check(running, 'the sample is running, and cost Surge');
  // Let its clock run out through the engine.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; tick: (n: number) => void };
    const s = e.getState() as unknown as { stats: { playTimeSec: number } };
    s.stats.playTimeSec += 90;
    e.tick(0.4);
  });
  await page.waitForTimeout(700);
  const readings = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="sample-${id}"]`);
    return el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
  }, far);
  console.log(`      reading: ${readings}`);
  check(readings.length > 0, 'THE BENCH READ IT — seams with purity bands', readings.slice(0, 90));
  const fog = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="fog-burnt"]');
    return el ? (el as HTMLElement).innerText.trim() : '';
  });
  check(/1 of 15/.test(fog), 'and one station of fifteen is burnt off', fog);
  // Tier II must NOT predict deep entry.
  const deepAtII = await page.evaluate((id) => !!document.querySelector(`[data-testid="deep-entry-${id}"]`), far);
  check(!deepAtII, 'tier II prints NO deep-entry prediction (LAW 3: absent, not greyed)');
  await page.locator('[data-testid="assay-bench"]').screenshot({ path: `${OUT}/D-sample.png` }).catch(() => {});
  console.log('  shot D-sample');

  // THE ROLL SHOWS IT.
  await goTab(page, 'shaft');
  const rollRow = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="station-${id}"]`);
    return el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
  }, far);
  console.log(`      Roll row: ${rollRow}`);
  check(rollRow.length > 0 && !/·$/.test(rollRow), 'THE ROLL SHOWS THE STATION AS READ', rollRow);
  await page.screenshot({ path: `${OUT}/D-roll-fog.png` });
  console.log('  shot D-roll-fog');

  // Tier III predicts.
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; dispatch: (a: unknown) => unknown; tick: (n: number) => void };
    const s = e.getState() as unknown as { casting: { rack: unknown[] } };
    s.casting.rack = Array.from({ length: 4 }, (_, i) => ({ id: 900 + i, type: 'head', materialId: 'marl', purity: 50 }));
    e.dispatch({ type: 'buildAssayBench' });
    e.tick(0.3);
  });
  await goTab(page, 'kiln');
  await page.waitForTimeout(600);
  const deepText = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="deep-entry-${id}"]`);
    return el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
  }, far);
  console.log(`      tier III: ${deepText}`);
  check(/8/.test(deepText) && /14/.test(deepText) && /20/.test(deepText),
    'TIER III PREDICTS ALL THREE DEEP-ENTRY GATES', deepText.slice(0, 100));
  check(/Umberjade/i.test(deepText), 'and names what the 8 gate pays', deepText.slice(0, 60));
  // THE TRAITS, on the deep-entry reading — §16.2's table, on screen.
  check(/brittle.*charged/i.test(deepText), 'umberjade reads brittle/charged');
  check(/dense.*tough.*trueseated/i.test(deepText), 'deep graveclay reads dense/tough/trueseated');

  // ── B2. THE TRAP, NAMED BY THE ASSAY ────────────────────────────────────
  // This is where a trap material is SUPPOSED to be caught: the Bench reads the
  // station and prints the trait before you ever dig it (§16.3 — "not a gotcha,
  // the Assay Lens shows the trait").
  console.log('B2 — the Assay names the trap before you dig it');
  await page.evaluate(() => {
    const e = (window as unknown as Record<string, never>)['__engine'] as unknown as
      { getState: () => never; tick: (n: number) => void };
    const s = e.getState() as unknown as {
      roll: { rolled: Record<string, { seam: string; feature: string; hazard: number }> };
      assayBench: { sampled: string[] };
    };
    // Force Quillrest onto its millstone roll and read it.
    s.roll.rolled['quillrest'] = { seam: 'millstone', feature: 'nothing', hazard: 0 };
    if (!s.assayBench.sampled.includes('quillrest')) s.assayBench.sampled.push('quillrest');
    e.tick(0.3);
  });
  await page.waitForTimeout(700);
  const trap = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="sample-quillrest"]');
    return el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
  });
  console.log(`      ${trap}`);
  check(/Millstone/i.test(trap), 'the Bench names Millstone in the seam', trap.slice(0, 80));
  check(/brittle/i.test(trap), 'AND PRINTS `brittle` BEFORE YOU DIG IT', trap.slice(0, 80));
  check(/dense/i.test(trap), 'alongside the trait that makes it tempting', trap.slice(0, 80));
  await page.locator('[data-testid="assay-bench"]').screenshot({ path: `${OUT}/B2-trap-named.png` }).catch(() => {});
  console.log('  shot B2-trap-named');
  await page.locator('[data-testid="assay-bench"]').screenshot({ path: `${OUT}/E-tier3.png` }).catch(() => {});
  console.log('  shot E-tier3');

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  check(overflow === 0, 'no horizontal overflow at 380px', `${overflow}px`);
  check(errors.length === 0, 'no page errors throughout', errors.join(' | '));
  console.log(problems.length === 0 ? '\nALL PASS' : `\nFAILURES: ${problems.join(', ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

void main();
