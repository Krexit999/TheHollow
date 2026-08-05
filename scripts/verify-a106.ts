/**
 * A.106 DRIVEN IN THE REAL GAME.
 *
 *   A  §23's opening, read FIRST, on a state nothing has touched
 *   B  each of the six wrecks raised by WALKING, and gating its machine
 *   C  a cascade running, on screen, traced back to its first failure
 *   D  ...and unwinding when the FIRST failure is fixed — the trace made true
 *   E  a threshold crossed, the Roll different, and a station GONE
 *   F  a second Recursion arriving with every threshold uncrossed
 *   G  strikePower wired — the tool shelf's number reaching the Standoff
 *   H  dpsMax unmoved at the SAME depth, with wrecks raised and thresholds crossed
 *   I  380px, 0 overflow, panels bounded, every row NAMED, 0 page errors
 *
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY — esbuild's
 * `keepNames` rewrites `const f = () => {}` into `__name(...)`, which does not
 * exist in the page. It has cost ten runs across A.90–A.105.
 *
 *   npx tsx scripts/verify-a106.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss, hold, SEL } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a106';
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

/** A hot Cinder plant, so the condition panel has something to say. */
const CONDITIONED = `
  const s = engine.getState();
  s.shell.current = 'cinder';
  s.depthRecords['cinder'] = 400;
  s.kiln.built = true;
  s.pressure.heat = 90;
`;

/** Enough purse to walk Loam, and NOTHING that reaches past a gate. */
const WALKABLE = `
  const s = engine.getState();
  s.currencies['dust'] = s.currencies['dust'].mul(0).add(1e30);
  s.depthRecords['loam'] = 0;
  s.depth = 0;
`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  // ═══ A — §23, READ FIRST ══════════════════════════════════════════════════
  console.log('\n== A — the opening, on a state nothing has touched =============');
  await dismiss(page);
  const open = await page.evaluate(() => {
    const s = (window as unknown as Record<string, any>)['__engine'].getState();
    return { cells: s.face.w * s.face.h, depth: s.depth, kiln: s.kiln.built };
  });
  check(open.cells, 36, 0, 'A1 §23 opens on 36 cells');
  check(open.depth, 0, 1, 'A2 §23 opens at depth 0');
  check(open.kiln, false, true, 'A3 ...and with no Kiln');

  // ═══ B — THE SIX WRECKS, RAISED BY WALKING ════════════════════════════════
  console.log('\n== B — each wreck raised by walking, and gating its machine ====');
  await setup(page, WALKABLE);
  await tab(page, 'dig');
  await dismiss(page);

  const shut = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    return {
      kilnOffered: (w['__probe']['upgrades'](s) as string[]).includes('kilnBuild'),
      crusher: w['__engine'].dispatch({ type: 'buildCrusher' }),
    };
  });
  check(shut.kilnOffered, false, true, 'B1 the Kiln is not offered before Kiln Yard is walked');
  check(Boolean(shut.crusher?.ok), false, true, 'B2 ...and the Crusher refuses before The Undersill');
  console.log(`  the Crusher says: ${String(shut.crusher?.reason ?? '').slice(0, 90)}`);
  const wreckMap = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__probe']['wrecks']()) as Record<string, any>;
  console.log('  the registry says: ' + JSON.stringify(wreckMap));
  check(String(shut.crusher?.reason ?? '').includes(String(wreckMap['CRUSHER']?.name)), true, false,
    'B3 ...and it says WHERE, by name — the station the REGISTRY puts it at');

  // Walk. The first step on the real button, to prove the button walks; the
  // rest dispatched, because a station toast eats the click and the point of
  // this block is the WRECKS, not the toast. Nothing is written either way.
  await hold(page, SEL.descend, 900);
  const clicked = await page.evaluate(() =>
    (window as unknown as Record<string, any>)['__engine'].getState().depth);
  check(clicked > 0, true, false, 'B3a the descend button actually walks');
  await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    for (let i = 0; i < 400 && s.depth < 100; i++) w['__engine'].dispatch({ type: 'descend' });
  });
  const raised = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    return { depth: s.depth, looted: [...(s.roll?.looted ?? [])] };
  });
  console.log(`  walked to depth ${raised.depth}; looted ${raised.looted.length} wrecks`);
  check(raised.depth >= 98, true, false, 'B4 the driver actually walked past Quillrest (98)');
  // PROBED, NOT TRANSCRIBED. The first draft hardcoded five station ids and had
  // two of them wrong — The Undersill holds A DRILL and The Long Cut holds the
  // CRUSHER, not the other way round. An instrument that asserts its own fixture
  // is not an instrument.
  for (const [wreck, at] of Object.entries(wreckMap)) {
    if (at.depth > 100) continue;   // Shoring Deep and below are past this walk
    check(raised.looted.includes(at.id), true, false,
      'B5 ' + at.name + ' ' + at.depth + ' — ' + wreck + ' is raised');
  }
  const nowOpen = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    return {
      kilnOffered: (w['__probe']['upgrades'](s) as string[]).includes('kilnBuild'),
      crusher: w['__engine'].dispatch({ type: 'buildCrusher' }),
    };
  });
  check(nowOpen.kilnOffered, true, false, 'B6 the Kiln is offered once the Yard is walked');
  check(String(nowOpen.crusher?.reason ?? '').includes('Undersill'), false, true,
    'B7 ...and the Crusher no longer names the wreck as its blocker');

  // ═══ C — A CASCADE, RUNNING, TRACED ═══════════════════════════════════════
  console.log('\n== C — one failure causing the next, on screen =================');
  /**
   * GLASSMERE, and the choice matters. Verdance's rule reads `served`, which
   * `tickPlant` rewrites every tick — the first draft of this block set one
   * machine idle by hand and the plant served it again a tick later, so nothing
   * ever broke and the whole section read zero. Glassmere's rule reads the BAND,
   * which is the one thing about a machine the player sets and the engine does
   * not overwrite. One machine in a dark band is one failure in a lit plant,
   * which is the only arrangement where a chain can be told from a wipe.
   *
   * The beam carries 1, 2 and 3; the row sits at 0, 1, 2, 3. Band 0 is the only
   * dark one in the plant, so the head is the only thing the shell is doing
   * anything to, and every link after it has to come from the link before.
   */
  const CASCADE = `
    const s = engine.getState();
    s.shell.current = 'glassmere';
    s.depthRecords['glassmere'] = 400;
    s.kiln.built = true;
    s.plant.bands = {};
    s.plant.condition = {};
    s.plant.dragged = {};
    s.plant.cascadeIn = 0;
    s.refraction.path = [1, 2, 3].map((c) => ({ cell: c, color: c, dir: 0, amplified: false }));
    s.refraction.pathDirty = false;
    s.refraction.lastTraceSec = 1e9;
  `;
  await setup(page, CASCADE);
  const cascade = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const p = w['__probe'];
    const ids: string[] = p.machines();
    const row: string[] = ids.slice(0, 4) as string[];
    for (const id of ids) { s.plant.tiers[id] = 1; s.plant.bands[id] = 1; }
    row.forEach((id: string, i: number) => { s.plant.bands[id] = i; });
    for (let i = 0; i < 240 + 120 * 4; i++) w['__engine'].tick(1);
    const drags = s.plant.dragged ?? {};
    const chain = w['__probe']['chain'] ? w['__probe']['chain'](s, String(row[3])) : [];
    return { row, dragged: Object.keys(drags).sort(), chain, from: drags[String(row[3])]?.from ?? null };
  });
  console.log(`  the row: ${JSON.stringify(cascade.row)}`);
  console.log(`  dragged: ${JSON.stringify(cascade.dragged)}`);
  console.log(`  chain:   ${JSON.stringify(cascade.chain)}`);
  check(cascade.dragged.length >= 3, true, false, 'C1 the cascade walked the row');
  check(cascade.chain, cascade.row, [], 'C2 the chain IS the row, oldest first');
  check(cascade.from, cascade.row[2], null, 'C3 the last link names the one before it, not the head');

  // The condition strip lives under the machines it is about, in the KILN room
  // — there is no 'plant' room, and asking for one silently landed on whatever
  // was already open, which is how this block read zero rows twice.
  await tab(page, 'kiln');
  await dismiss(page);
  const said = await page.evaluate(() => {
    const el = document.querySelector('[data-testid^="drag-"]');
    return {
      text: (el?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      count: document.querySelectorAll('[data-testid^="drag-"]').length,
    };
  });
  console.log(`  on screen: ${said.text.slice(0, 170)}`);
  check(said.count >= 3, true, false, 'C4 the panel shows a row for every dragged machine');
  check(said.text.includes('Dragged'), true, false, 'C5 ...and says it is being dragged');
  check(said.text.includes('It started at'), true, false, 'C6 ...and names where it started');
  check(/→/.test(said.text), true, false, 'C7 ...and prints the links themselves');
  // ELEMENT-SCOPED, not fullPage. A fullPage shot of a long room puts the
  // thing being checked a thousand pixels below the fold, and "look at the
  // screenshots" then means looking at the demand profile instead.
  const dragEl = page.locator("[data-testid^=\"drag-\"]").first();
  await dragEl.scrollIntoViewIfNeeded();
  await page.locator("[data-testid=\"condition-panel\"]").screenshot({ path: OUT + "/c-cascade-traced.png" });

  // ═══ D — FIX THE HEAD AND WATCH IT LET GO ═════════════════════════════════
  console.log('\n== D — the trace made true: fix the FIRST failure ==============');
  const unwound = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const ids: string[] = w['__probe']['machines'] ? w['__probe']['machines']() : [];
    const head = ids[0];
    const before = Object.keys(s.plant.dragged ?? {}).length;
    s.plant.bands[String(head)] = 1;               // the head is put back in the light
    const steps: number[] = [];
    for (let i = 0; i < 6; i++) { w['__engine'].tick(1); steps.push(Object.keys(s.plant.dragged ?? {}).length); }
    return { before, steps };
  });
  console.log(`  dragged over six ticks: ${unwound.before} -> ${JSON.stringify(unwound.steps)}`);
  check(unwound.steps[0]! < unwound.before, true, false, 'D1 the machine beside the head let go first');
  check(unwound.steps.at(-1), 0, unwound.before, 'D2 ...and the whole chain came back');
  check(unwound.steps[0]! > 0, true, false, 'D3 ...one link at a time, not all at once');

  // ═══ E — A THRESHOLD CROSSED, AND THE WORLD DIFFERENT ═════════════════════
  console.log('\n== E — the shell notices ======================================');
  const THRESH = `
    const s = engine.getState();
    s.shell.current = 'loam';
    s.depthRecords['loam'] = 200;
    s.depth = 0;
    s.currencies['dust'] = s.currencies['dust'].mul(0).add(1e30);
  `;
  await setup(page, THRESH);
  await tab(page, 'shaft');
  await dismiss(page);
  const before = await page.evaluate(() => ({
    marks: document.querySelectorAll('[data-testid^="station-mark-"]').length,
    gone: document.querySelectorAll('[data-testid^="station-gone-"]').length,
  }));
  check(before.marks, 0, 1, 'E1 nothing is marked before the threshold');
  await page.locator(".panel").filter({ hasText: "The Roll" }).first().screenshot({ path: OUT + "/e1-roll-before.png" });

  const crossed = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const at = w['__probe']['thresholdAt'] ? w['__probe']['thresholdAt']('loam') : 2500;
    s.thresholds = { taken: { loam: at + 1 }, seen: {}, crossed: [] };
    w['__engine'].tick(1);
    return { crossed: [...(s.thresholds?.crossed ?? [])], unstable: w['__probe']['unstable'] ? w['__probe']['unstable'](s) : null };
  });
  console.log(`  crossed: ${JSON.stringify(crossed.crossed)}; unstable station: ${crossed.unstable}`);
  check(crossed.crossed, ['subsidence'], [], 'E2 SUBSIDENCE crossed by taking enough out of Loam');

  await page.waitForTimeout(400);
  const marked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[data-testid^="station-mark-"]'));
    return { n: els.length, word: (els[0]?.textContent ?? '').trim() };
  });
  check(marked.n > 0, true, false, 'E3 the Roll carries the mark');
  check(marked.word, 'CRACKED', '', 'E4 ...in the threshold\'s own word');
  await page.locator(".panel").filter({ hasText: "The Roll" }).first().screenshot({ path: OUT + "/e2-roll-cracked.png" });

  // ...and walk into the one that is unstable.
  const fell = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const id = w['__probe']['unstable'](s);
    const at = (w['__probe']['shellRoll'](s) as any[]).find((d) => d.id === id);
    // ONE step in, and STOP the moment it gives way. The first draft kept
    // descending afterwards and walked straight back down into the hole it had
    // just been thrown out of.
    s.depth = at.depth - 1;
    for (let i = 0; i < 60 && s.depth < at.depth; i++) {
      if (!w['__engine'].dispatch({ type: 'descend' }).ok) break;
      if ((s.roll?.gone ?? []).includes(id)) break;
    }
    return { id, want: at.depth, landed: s.depth, gone: [...(s.roll?.gone ?? [])] };
  });
  console.log(`  walked into ${fell.id} at ${fell.want}; came out at ${fell.landed}`);
  check(fell.gone.includes(fell.id), true, false, 'E5 the station is off the Roll for good');
  check(fell.landed < fell.want, true, false, 'E6 ...and it put you back up the shaft');
  await page.waitForTimeout(400);
  const holeShown = await page.evaluate(() =>
    document.querySelectorAll('[data-testid^="station-gone-"]').length);
  check(holeShown > 0, true, false, 'E7 ...and the hole is on the Roll, struck through');
  await page.locator(".panel").filter({ hasText: "The Roll" }).first().screenshot({ path: OUT + "/e3-roll-gone.png" });

  // ═══ F — A SECOND WORLD ARRIVES UNCROSSED ═════════════════════════════════
  console.log('\n== F — the next world has not been mined yet ===================');
  const recursed = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const wasCount = s.recursion.count;
    const wasCrossed = [...(s.thresholds?.crossed ?? [])];
    const wasGone = [...(s.roll?.gone ?? [])];
    s.shell.current = 'aleph';
    s.aleph.coreTouched = true;
    const r = w['__engine'].dispatch({ type: 'recurse' });
    const n = w['__engine'].getState();
    return {
      ok: Boolean(r?.ok), wasCount, wasCrossed, wasGone,
      count: n.recursion.count,
      crossed: [...(n.thresholds?.crossed ?? [])],
      gone: [...(n.roll?.gone ?? [])],
    };
  });
  console.log(`  Recursion ${recursed.wasCount} -> ${recursed.count}`);
  check(recursed.ok, true, false, 'F1 the Recursion happened');
  check(recursed.wasCrossed.length > 0, true, false, 'F2 ...and it had something to wash');
  check(recursed.crossed, [], recursed.wasCrossed, 'F3 the new world arrives with nothing crossed');
  check(recursed.gone, [], recursed.wasGone, 'F4 ...and the hole is dug back in');

  // ═══ G — strikePower, WIRED ═══════════════════════════════════════════════
  console.log('\n== G — the tool shelf\'s Strike number reaches the Standoff =====');
  const strike = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    const t = s.forge.tools[s.forge.equipped];
    t.chipPower = 1; t.strikePower = 3;
    const plain = w['__probe']['strike'](s, false);
    t.strikePower = 9;
    const heavy = w['__probe']['strike'](s, false);
    t.chipPower = 3; t.strikePower = 3;
    const light = w['__probe']['strike'](s, false);
    t.chipPower = 1; t.strikePower = 1000;
    const absurd = w['__probe']['strike'](s, false);
    return { plain, heavy, light, absurd };
  });
  console.log(`  plain ${strike.plain} · strike-leaning ${strike.heavy} · chip-leaning ${strike.light} · absurd ${strike.absurd}`);
  check(strike.heavy > strike.plain, true, false, 'G1 a strike-leaning tool hits harder');
  check(strike.light < strike.plain, true, false, 'G2 ...and a chip-leaning one softer');
  check(strike.absurd, strike.heavy, strike.plain, 'G3 ...and it is clamped, not a second power curve');

  // ═══ H — PILLAR 2 AT ONE DEPTH ════════════════════════════════════════════
  console.log('\n== H — dpsMax unmoved at the SAME depth ========================');
  const pillar = await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    s.shell.current = 'loam';
    s.depth = 40;
    s.thresholds = { taken: {}, seen: {}, crossed: [] };
    s.roll.looted = [];
    s.plant.dragged = {};
    const clean = String(w['__probe']['dps']());
    s.thresholds.crossed = w['__probe']['thresholdIds']();
    s.roll.looted = w['__probe']['shellRoll'](s).filter((d: any) => d.type === 'wreck').map((d: any) => d.id);
    const machines: string[] = w['__probe']['machines']();
    for (const id of machines.slice(1, 5)) s.plant.dragged[id] = { from: machines[0], sec: 0 };
    const loud = String(w['__probe']['dps']());
    s.face.w += 1;
    const wider = String(w['__probe']['dps']());
    return { clean, loud, wider, depth: s.depth };
  });
  console.log(`  clean ${pillar.clean} · everything crossed and raised ${pillar.loud} · one cell wider ${pillar.wider}`);
  check(pillar.loud, pillar.clean, pillar.wider, 'H1 dpsMax is bit-identical at depth 40');
  check(pillar.wider !== pillar.clean, true, false, 'H2 ...and the reading is live');

  // ═══ I — THE SHAPE OF IT ══════════════════════════════════════════════════
  console.log('\n== I — 380px, bounded, named, silent ===========================');
  await setup(page, CONDITIONED);
  await page.evaluate(() => {
    const w = (window as unknown as Record<string, any>);
    const s = w['__engine'].getState();
    for (const id of w['__probe'].machines()) s.plant.tiers[id] = 1;
    for (let i = 0; i < 500; i++) w['__engine'].tick(1);
  });
  await tab(page, 'kiln');
  await dismiss(page);
  const shape = await page.evaluate(() => {
    const de = document.documentElement;
    const panel = document.querySelector('[data-testid="condition-panel"]') as HTMLElement | null;
    const rows = Array.from(document.querySelectorAll('[data-testid^="condition-"]'))
      .filter((e) => (e.getAttribute('data-testid') ?? '').startsWith('condition-') &&
        !(e.getAttribute('data-testid') ?? '').startsWith('condition-line') &&
        !(e.getAttribute('data-testid') ?? '').startsWith('condition-band') &&
        (e.getAttribute('data-testid') ?? '') !== 'condition-panel');
    return {
      overflow: de.scrollWidth - de.clientWidth,
      panelH: panel ? Math.round(panel.getBoundingClientRect().height) : -1,
      rows: rows.length,
      unnamed: rows.filter((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim().length < 8).length,
      dashOnly: rows.filter((r) => /(^|\s)—\s*(m|%)?\s*$/.test((r.textContent ?? '').trim())).length,
    };
  });
  console.log(`  overflow ${shape.overflow}px · panel ${shape.panelH}px · ${shape.rows} rows`);
  check(shape.overflow, 0, 12, 'I1 0 horizontal overflow at 380px');
  check(shape.rows > 0, true, false, 'I2 the panel has rows to check');
  check(shape.unnamed, 0, 1, 'I3 every row says something');
  check(shape.dashOnly, 0, 1, 'I4 ...and no row is a bare dash with a unit after it');
  check(shape.panelH > 0 && shape.panelH < 1400, true, false, 'I5 the panel is bounded');
  await page.screenshot({ path: `${OUT}/i-plant-380.png`, fullPage: true });
  check(errors.length, 0, 1, 'I6 0 page errors across the whole run');
  if (errors.length) console.log('  ' + errors.slice(0, 5).join('\n  '));

  console.log(`\nscreenshots -> ${OUT}`);
  console.log(problems.length === 0 ? '\nALL PASS' : `\n${problems.length} PROBLEM(S):\n  ${problems.join('\n  ')}`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
