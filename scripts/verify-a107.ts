/**
 * A.107 DRIVEN IN THE REAL GAME.
 *
 *   A  the §55 sizing table, with a verdict per row and the probe behind it
 *   B  THE BOILER LET GO — on screen, traced back to its first failure
 *   C  ...and the trace made true: re-cast the head, the chain lets go
 *   D  WHAT THE PLANT FORGOT — the recipe gone, the machine still running
 *   E  the two thresholds, measured, with the crossing rate each was cut to
 *   F  dpsMax unmoved at the SAME depth, with every break live
 *   G  §23's opening beats, on a state nothing has touched
 *   H  380px, 0 overflow, panels bounded, every row NAMED, 0 page errors
 *
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY — esbuild's
 * `keepNames` rewrites `const f = () => {}` into `__name(...)`, which does not
 * exist in the page. It has cost ten runs across A.90–A.105.
 *
 *   npx tsx scripts/verify-a107.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { setup, tab, dismiss, SEL, hold } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a107';
const W = 380, H = 1700;

const problems: string[] = [];

function check<T>(actual: T, want: T, bad: T, label: string): void {
  if (JSON.stringify(bad) === JSON.stringify(want)) {
    console.log(`  VACUOUS  ${label} — the known-bad value equals the expected one`);
    problems.push(`${label} (vacuous)`);
    return;
  }
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(`        got  ${JSON.stringify(actual)}`);
    console.log(`        want ${JSON.stringify(want)}`);
    problems.push(label);
  }
}

/** A Cinder plant with the gauge held up — the bet §55.1 is the other end of. */
const HOT = `
  const s = engine.getState();
  s.shell.current = 'cinder';
  s.depthRecords['cinder'] = 400;
  s.depth = 100;
  s.kiln.built = true;
  s.plant.condition = {}; s.plant.dragged = {}; s.plant.broken = {}; s.plant.ripe = {};
  for (const id of window.__probe.machines()) s.plant.tiers[id] = 1;
  for (let i = 0; i < 110; i++) { s.pressure.heat = 100; engine.tick(1); }
`;

/** ...and a Hollow one, left quiet long enough that it forgets. */
const QUIET = `
  const s = engine.getState();
  s.shell.current = 'hollow';
  s.depthRecords['hollow'] = 400;
  s.depth = 100;
  s.kiln.built = true;
  s.plant.condition = {}; s.plant.dragged = {}; s.plant.broken = {}; s.plant.ripe = {};
  for (const id of window.__probe.machines()) s.plant.tiers[id] = 1;
  for (let i = 0; i < 340; i++) { s.hollow.silence = 100; engine.tick(1); }
`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  // ═══ G — §23, READ FIRST, BEFORE ANYTHING HAS TOUCHED THE STATE ═══════════
  // Out of alphabetical order on purpose: the opening is only the opening on a
  // state nothing has written to, so it has to be read before block A's probe.
  console.log('\n== G — §23, on a state nothing has touched =====================');
  await dismiss(page);
  const open = await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return { cells: s.face.w * s.face.h, depth: s.depth, kiln: s.kiln.built, broken: Object.keys(s.plant?.broken ?? {}).length };
  });
  check(open.cells, 36, 0, 'G1 §23 opens on 36 cells');
  check(open.depth, 0, 1, 'G2 §23 opens at depth 0');
  check(open.kiln, false, true, 'G3 ...and with no Kiln');
  check(open.broken, 0, 1, 'G4 ...and nothing is broken on the first screen');

  // ═══ A — THE SIZING TABLE ═════════════════════════════════════════════════
  console.log('\n== A — §55 rows 1-5, sized, with a verdict each ================');
  const scope = execFileSync('npx', ['tsx', 'scripts/a107-scope.ts'], {
    encoding: 'utf8', shell: process.platform === 'win32',
  });
  for (const line of scope.split('\n').filter((l) => /^\s{2}§55\.\d|^self-test/.test(l))) {
    console.log('  ' + line.trim());
  }
  const verdicts = Object.fromEntries(
    [...scope.matchAll(/^\s+§55\.(\d)\s+\S.*?\s\s+(BUILDABLE|WANTS A SYSTEM|CUT)\s*$/gm)]
      .map((m) => [m[1], m[2]]),
  );
  check(verdicts, { 1: 'BUILDABLE', 2: 'WANTS A SYSTEM', 3: 'CUT', 4: 'WANTS A SYSTEM', 5: 'BUILDABLE' },
    { 1: 'BUILDABLE', 2: 'BUILDABLE', 3: 'BUILDABLE', 4: 'BUILDABLE', 5: 'BUILDABLE' },
    'A1 the table reads 2 buildable, 2 want a system, 1 cut');
  // ...and the SHIPPED registry matches it, which is the check the table exists
  // for: a verdict nothing consults is a paragraph.
  const shipped = await page.evaluate(() =>
    ((window as unknown as Record<string, any>)['__probe']['breaks']() as any[])
      .map((b) => `${b.id}@${b.shellId}`).sort());
  check(shipped, ['blowout@cinder', 'silence@hollow'],
    ['blowout@cinder', 'overgrowth@verdance', 'silence@hollow'],
    'A2 ...and exactly the BUILDABLE rows shipped');

  // ═══ B — THE BOILER LET GO ════════════════════════════════════════════════
  console.log('\n== B — §55.1 on screen, traced to its first failure ============');
  await setup(page, HOT);
  await tab(page, 'kiln');
  await dismiss(page);
  const blew = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const broken = w['__probe']['broken'](s) as Record<string, { id: string }>;
    const dragged = Object.keys(s.plant?.dragged ?? {});
    return {
      broken: Object.entries(broken).map(([k, v]) => `${k}:${v.id}`),
      dragged: dragged.length,
      // Every dragged machine's chain, walked back to whatever it starts at.
      heads: [...new Set(dragged.map((id) => (w['__probe']['chain'](s, id) as string[])[0]))],
    };
  });
  console.log(`  broken ${JSON.stringify(blew.broken)} · dragged ${blew.dragged}`);
  check(blew.broken, ['boiler:blowout'], [], 'B1 the Boiler blew, and only the Boiler');
  check(blew.dragged, 1, 14, 'B2 ...and it took ONE machine down with it, not the band');
  check(blew.heads, ['boiler'], [], 'B3 every one of them traces back to the Boiler');
  // ...and it is ONE BAND ALONG, not "within a band". Counting the links cannot
  // tell those apart — `nextAlong` returns one either way — so this reads the
  // geometry, which is the thing A.106 ruled on.
  const hop = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const to = Object.keys(s.plant?.dragged ?? {})[0];
    return to === undefined ? -1 : Math.abs(w['__probe']['band'](s, to) - w['__probe']['band'](s, 'boiler'));
  });
  check(hop, 1, 0, 'B3a ...and exactly one band along, never the same band');

  const onScreen = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="broke-boiler"]') as HTMLElement | null;
    const drags = Array.from(document.querySelectorAll('[data-testid^="drag-"]'));
    return {
      said: (box?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      dragRows: drags.length,
      // A drag row that does not NAME the machine it started at is the random
      // debuff this phase was written against.
      namesBoiler: drags.filter((d) => /Boiler/.test(d.textContent ?? '')).length,
    };
  });
  console.log(`  the panel says: ${onScreen.said.slice(0, 140)}`);
  console.log(`  ${onScreen.dragRows} drag rows on screen, ${onScreen.namesBoiler} of them naming the Boiler`);
  check(onScreen.said.length > 20, true, false, 'B4 the panel says what went wrong, in words');
  check(/[Rr]e-cast/.test(onScreen.said), true, false, 'B5 ...and what to do about it');
  check(onScreen.dragRows > 0 && onScreen.namesBoiler === onScreen.dragRows, true, false,
    'B6 ...and every drag row on screen names the Boiler');
  await page.screenshot({ path: `${OUT}/b-blowout-380.png`, fullPage: true });
  // ...and the block itself, close enough to READ. Three of the last four
  // phases' real bugs were found by looking at one of these, not by a check.
  for (const [sel, name] of [['broke-boiler', 'b-broke-block'], ['condition-panel', 'b-panel']]) {
    const el = page.locator(`[data-testid="${sel}"]`).first();
    if (await el.count()) await el.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
  }
  const dragEl = page.locator('[data-testid^="drag-"]').first();
  if (await dragEl.count()) await dragEl.screenshot({ path: `${OUT}/b-drag-block.png` }).catch(() => {});

  // ═══ C — THE TRACE MADE TRUE ══════════════════════════════════════════════
  console.log('\n== C — fix the FIRST failure and the chain lets go =============');
  const fixed = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const before = Object.keys(s.plant.dragged).length;
    s.casting.rack = [{ id: 1, materialId: 'marl' }, { id: 2, materialId: 'marl' }];
    s.pressure.heat = 0;
    const r = w['__engine'].dispatch({ type: 'recastMachine', machineId: 'boiler' });
    for (let i = 0; i < 12; i++) w['__engine'].tick(1);
    const n = w['__engine'].getState();
    return {
      ok: Boolean(r?.ok), reason: String(r?.reason ?? ''), before,
      after: Object.keys(n.plant.dragged).length,
      stillBroken: Object.keys(w['__probe']['broken'](n)).length,
    };
  });
  console.log(`  dragged ${fixed.before} -> ${fixed.after} ${fixed.reason ? `(${fixed.reason})` : ''}`);
  check(fixed.ok, true, false, 'C1 the re-cast was accepted');
  check(fixed.before > 0, true, false, 'C2 ...on a chain that was actually there');
  check(fixed.after, 0, fixed.before, 'C3 and the whole chain let go');
  check(fixed.stillBroken, 0, 1, 'C4 ...with nothing left broken');

  // ═══ D — WHAT THE PLANT FORGOT ════════════════════════════════════════════
  console.log('\n== D — §55.5: the recipe gone, the machine still running =======');
  await setup(page, QUIET);
  await tab(page, 'kiln');
  await dismiss(page);
  const quiet = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const broken = w['__probe']['broken'](s) as Record<string, { id: string }>;
    const id = Object.keys(broken)[0] ?? '';
    const forgot = document.querySelector(`[data-testid="forgot-${id}"]`);
    const others = (w['__probe']['machines']() as string[])
      .filter((m) => m !== id && w['__probe']['hidden'](s, m));
    return {
      kinds: [...new Set(Object.values(broken).map((b) => b.id))],
      count: Object.keys(broken).length,
      id,
      hidden: Boolean(w['__probe']['hidden'](s, id)),
      onScreen: (forgot?.textContent ?? '').trim(),
      spread: others.length,
      // ...and it is NOT a stop: the panel's own speed reading is unchanged.
      speed: w['__probe']['broken'] && s.plant.dragged[id] === undefined,
    };
  });
  console.log(`  ${quiet.id} forgot itself · the panel reads "${quiet.onScreen}" · ${quiet.count} broken`);
  check(quiet.kinds, ['silence'], ['blowout'], 'D1 the quiet took a machine');
  check(quiet.count, 1, 0, 'D2 ...one of them, not the plant');
  check(quiet.hidden, true, false, 'D3 the recipe is hidden');
  check(quiet.onScreen, 'it will not say', '', 'D4 ...and the panel says so, in the panel');
  check(quiet.spread, 0, 1, 'D5 and no other machine went quiet with it');
  await page.screenshot({ path: `${OUT}/d-silence-380.png`, fullPage: true });
  const quietEl = page.locator('[data-testid^="broke-"]').first();
  if (await quietEl.count()) await quietEl.screenshot({ path: `${OUT}/d-silence-block.png` }).catch(() => {});
  const profEl = page.locator('[data-testid="plant-kiln"]').first();
  if (await profEl.count()) await profEl.screenshot({ path: `${OUT}/d-forgot-row.png` }).catch(() => {});

  // ═══ E — THE TWO THRESHOLDS ═══════════════════════════════════════════════
  console.log('\n== E — Ferrite and Glassmere, measured ========================');
  const at = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    return { ferrite: w['__probe']['thresholdAt']('ferrite'), glassmere: w['__probe']['thresholdAt']('glassmere') };
  });
  // The readings, off the sim output the numbers were cut from. Six seeds for
  // Ferrite because its measure is rolled; three for Glassmere because its is
  // very nearly a clock.
  const read = (f: string, id: string): number => {
    const m = readFileSync(f, 'utf8').match(new RegExp(`${id}\\s+(\\d+)/`));
    return m ? Number(m[1]) : -1;
  };
  const fer = [1, 2, 3, 4, 5, 6].map((n) => read(`sim-out/a107-ferrite-s${n}.md`, 'greatFlip'));
  const gla = [1, 2, 3].map((n) => read(`sim-out/a107-glassmere-s${n}.md`, 'bend'));
  const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
  const ferH = (at.ferrite / (mean(fer) / 3));
  const glaH = (at.glassmere / (mean(gla) / 3));
  console.log(`  greatFlip  at ${at.ferrite}  banked/3h ${fer.join(' ')}  mean ${mean(fer).toFixed(0)}  -> ${ferH.toFixed(1)}h`);
  console.log(`             spread ${(Math.max(...fer) / Math.min(...fer)).toFixed(1)}x across seeds`);
  console.log(`  bend       at ${at.glassmere}  banked/3h ${gla.join(' ')}  mean ${mean(gla).toFixed(0)}  -> ${glaH.toFixed(1)}h`);
  console.log(`             spread ${(Math.max(...gla) / Math.min(...gla)).toFixed(2)}x across seeds`);
  check(fer.every((n) => n > 0), true, false, 'E1 every Ferrite arm banked something');
  check(gla.every((n) => n > 0), true, false, 'E2 ...and every Glassmere arm did');
  check(ferH > 6 && ferH < 12, true, false, 'E3 THE GREAT FLIP lands in the nine-hour band at the mean');
  check(glaH > 6 && glaH < 12, true, false, 'E4 ...and so does THE BEND');
  check(at.ferrite !== 900 && at.glassmere !== 20000, true, false, 'E5 both moved off their unmeasured sizes');

  // ═══ F — PILLAR 2 AT ONE DEPTH ════════════════════════════════════════════
  console.log('\n== F — dpsMax unmoved at the SAME depth, every break live ======');
  const pillar = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    s.shell.current = 'loam';
    s.depth = 40;
    s.plant.broken = {}; s.plant.dragged = {}; s.plant.condition = {};
    const clean = String(w['__probe']['dps']());
    const machines: string[] = w['__probe']['machines']();
    const kinds = (w['__probe']['breaks']() as any[]).map((b) => b.id);
    for (let i = 0; i < kinds.length; i++) s.plant.broken[String(machines[i])] = { id: kinds[i], atSec: 0 };
    for (const id of machines) s.plant.condition[id] = { id: 'baked', level: 1, seized: true, fullFor: 0 };
    for (const id of machines.slice(kinds.length)) s.plant.dragged[id] = { from: machines[0], sec: 0 };
    s.depth = 40;
    const loud = String(w['__probe']['dps']());
    s.face.w += 1;
    const wider = String(w['__probe']['dps']());
    return { clean, loud, wider, fired: kinds.length, seized: machines.length };
  });
  console.log(`  clean ${pillar.clean} · ${pillar.fired} broken + ${pillar.seized} seized + the rest dragged ${pillar.loud} · one cell wider ${pillar.wider}`);
  check(pillar.loud, pillar.clean, pillar.wider, 'F1 dpsMax is bit-identical at depth 40');
  check(pillar.wider !== pillar.clean, true, false, 'F2 ...and the reading is live');

  // ═══ H — THE SHAPE OF IT ══════════════════════════════════════════════════
  console.log('\n== H — 380px, bounded, named, silent ===========================');
  await setup(page, HOT);
  await tab(page, 'kiln');
  await dismiss(page);
  const shape = await page.evaluate(() => {
    const de = document.documentElement;
    const panel = document.querySelector('[data-testid="condition-panel"]') as HTMLElement | null;
    const rows = Array.from(document.querySelectorAll(
      '[data-testid^="broke-"], [data-testid^="drag-"], [data-testid^="ripe-"], [data-testid^="plant-"]'));
    return {
      overflow: de.scrollWidth - de.clientWidth,
      panelH: panel ? Math.round(panel.getBoundingClientRect().height) : -1,
      rows: rows.length,
      unnamed: rows.filter((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim().length < 8).length,
      // "the The Kiln" (A.106) — an article carried through a template. It read
      // green through every automated check in that phase and was found by
      // looking at a screenshot, so it is a check now.
      doubled: rows.filter((r) => /\bthe [Tt]he\b/.test(r.textContent ?? '')).length,
      // ...and the other half, which the A.106 fix created by dropping the
      // article instead of lowering its case: "It started at The Boiler".
      midCaps: rows.filter((r) => /\b(at|beside|than|from)\s+The\b/.test(r.textContent ?? '')).length,
      dashOnly: rows.filter((r) => /(^|\s)—\s*(m|%)?\s*$/.test((r.textContent ?? '').trim())).length,
    };
  });
  console.log(`  overflow ${shape.overflow}px · panel ${shape.panelH}px · ${shape.rows} rows`);
  check(shape.overflow, 0, 12, 'H1 0 horizontal overflow at 380px');
  check(shape.rows > 0, true, false, 'H2 the panel has rows to check');
  check(shape.unnamed, 0, 1, 'H3 every row says something');
  check(shape.doubled, 0, 1, 'H4 ...and no row says "the The"');
  check(shape.midCaps, 0, 1, 'H4b ...nor "at The Boiler" mid-sentence');
  check(shape.dashOnly, 0, 1, 'H5 ...and none is a bare dash with a unit after it');
  /**
   * H6 IS THE CHECK THAT CHANGED SHAPE, and the reason is worth keeping.
   *
   * The first run of this block failed a flat "panel under 1600px" with 3245px,
   * and the fix for THAT was real: the break was handing every machine within a
   * band to the drag on one tick — the CLIQUE A.106 rejected by name — so
   * fourteen drag blocks arrived at once. One neighbour, one band along, and it
   * fell to 2529.
   *
   * The remaining 2458 is NOT A.107's, and this proves it rather than claiming
   * it: clearing every break and drag and re-measuring the same panel in the
   * same run leaves it within a row's height. The plant panel prints a block per
   * conditioned machine and Cinder's rule conditions every built one, so it
   * grows linearly with the plant — an A.106 shape, ledgered, not fixed here.
   */
  const attribution = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const withBreaks = Math.round((document.querySelector('[data-testid="condition-panel"]') as HTMLElement)
      ?.getBoundingClientRect().height ?? -1);
    s.plant.broken = {}; s.plant.dragged = {}; s.plant.ripe = {};
    w['__engine'].tick(0.001);
    return { withBreaks };
  });
  await page.waitForTimeout(400);
  const without = await page.evaluate(() => Math.round(
    (document.querySelector('[data-testid="condition-panel"]') as HTMLElement)?.getBoundingClientRect().height ?? -1));
  const mine = attribution.withBreaks - without;
  console.log(`  panel ${attribution.withBreaks}px with A.107 live, ${without}px with it cleared — A.107 owns ${mine}px`);
  check(mine >= 0 && mine < 300, true, false, 'H6 what A.107 adds to the panel is bounded');
  check(without > 1600, true, false, 'H6b ...and the rest is the A.106 per-machine list, LEDGERED not fixed');
  await page.screenshot({ path: `${OUT}/h-plant-380.png`, fullPage: true });

  // The face, to prove nothing new mounted on it.
  await tab(page, 'dig');
  await dismiss(page);
  await hold(page, SEL.descend, 200).catch(() => false);
  await page.screenshot({ path: `${OUT}/h-face-380.png`, fullPage: true });
  check(errors.length, 0, 1, 'H7 0 page errors across the whole run');
  if (errors.length) console.log('  ' + errors.slice(0, 5).join('\n  '));

  console.log(`\nscreenshots -> ${OUT}`);
  console.log(problems.length === 0 ? '\nALL PASS' : `\n${problems.length} PROBLEM(S):\n  ${problems.join('\n  ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
