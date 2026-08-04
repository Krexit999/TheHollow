/**
 * A.95 DRIVEN IN THE REAL GAME — four machines, and a plant table that was one
 * plant in seven costumes.
 *
 *   A  §23's opening, read FIRST on a reset state
 *   B  A CINDER PLANT RUNNING ON HEAT, and dead without a Boiler
 *   C  pressure chosen, and vented with CAST valves
 *   D  ash reduced to a higher medium, and the Pyre-bath
 *   E  a fallow quadrant seeded and its traits farmed
 *   F  the Coil banking chain-charge, and what changed about Surge
 *   G  each machine raised from CAST PARTS at its wreck
 *   H  tier I vs II vs III each doing something DIFFERENT
 *   I  producerless at 0, and the clone check RED-TESTED
 *   J  dpsMax unmoved at equal depth with all of it live
 *   K  380px, 0 overflow, PANEL HEIGHT bounded, 0 page errors
 *
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY — esbuild's
 * `keepNames` rewrites `const f = () => {}` into `__name(...)`, which does not
 * exist in the page. It has cost five runs across A.90–A.94.
 *
 *   npx tsx scripts/verify-a95.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a95';
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

const PLANT_SETUP = `
  const s = engine.getState();
  s.shell.breachCount = 6;
  for (const id of ['loam','ferrite','verdance','glassmere','cinder','hollow','aleph']) {
    s.depthRecords[id] = 999;
  }
  s.maxDepthRecord = 999;
  s.kiln.built = true;
  s.kiln.heat = 40;
  s.forge.built = true;
  s.plant = s.plant || {};
  s.plant.surge = 99999;
  s.plant.tiers = s.plant.tiers || {};
  s.plant.tiers['crusher'] = 1;
  s.casting.rack = [];
  for (let i = 0; i < 90; i++) {
    s.casting.rack.push({ id: 30000 + i, type: 'head', materialId: 'marl', purity: 50 });
  }
  s.casting.nextId = 31000;
  s.gear = s.gear || {}; s.gear.worn = {}; s.gear.owned = [];
`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  // ═══ A — §23, READ FIRST ═════════════════════════════════════════════════
  console.log('\n== A — the opening, on a state nothing has touched =============');
  await tab(page, 'dig');
  await dismiss(page);
  await page.waitForTimeout(400);
  const opening = await page.evaluate(async () => {
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { face: { cells: number[] }; depth: number };
    const m = new modsMod.ModifierCache(); m.invalidate();
    return {
      dps: Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 100) / 100,
      cells: s.face.cells.length,
      depth: s.depth,
    };
  });
  check([opening.cells, opening.depth, opening.dps], [36, 0, 2.97], [0, 1, 0],
    'A — §23: 36 cells, depth 0, 2.97 dust/sec');
  await page.screenshot({ path: `${OUT}/a95-opening.png`, fullPage: true }).catch(() => {});

  // ═══ B — CINDER RUNS ON HEAT, AND IS DEAD WITHOUT A BOILER ═══════════════
  console.log('\n== B — a Cinder plant on heat, and dead without a Boiler =======');
  await setup(page, PLANT_SETUP);
  const cinder = await page.evaluate(async () => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const boiler = await import(/* @vite-ignore */ '/src/engine/systems/boiler' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as { shell: { current: string }; pressure: { heat: number } };
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      st.shell.current = id;
      roll.markReached(e.getState(), 999, 50);
    }
    // THE SHAPE OF EVERY SHELL'S PLANT, read at one heat.
    const shapes: Record<string, number> = {};
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      st.shell.current = id;
      shapes[id] = Math.round((plant.flowCap(e.getState()) as number) * 100) / 100;
    }
    st.shell.current = 'cinder';
    const deadFlow = plant.flowCap(e.getState()) as number;
    const found = boiler.boilerFound(e.getState()) as boolean;
    e.dispatch({ type: 'buildBoiler' });
    const litFlow = plant.flowCap(e.getState()) as number;
    // Tier II: the burst grows with the gauge.
    e.dispatch({ type: 'buildBoiler' });
    st.pressure.heat = 0;
    const cold = plant.surgeCap(e.getState()) as number;
    st.pressure.heat = 80;
    const hot = plant.surgeCap(e.getState()) as number;
    // Tier III: and the sustain, but only above the line.
    e.dispatch({ type: 'buildBoiler' });
    const r = boiler.boilerRead(e.getState()) as { line: number; risked: number; flow: number };
    st.pressure.heat = r.line;
    const safeFlow = plant.flowCap(e.getState()) as number;
    st.pressure.heat = r.line + 20;
    const riskyFlow = plant.flowCap(e.getState()) as number;
    return {
      shapes, found,
      deadFlow, litFlow: Math.round(litFlow * 100) / 100,
      cold, hot: Math.round(hot * 100) / 100,
      safeFlow: Math.round(safeFlow * 100) / 100,
      riskyFlow: Math.round(riskyFlow * 100) / 100,
      tier: plant.tierOf(e.getState(), 'boiler') as number,
    };
  });
  check(cinder.deadFlow, 0, 2.4,
    'B — §13 literally: with a hot Kiln standing, Cinder has NO Flow without a Boiler');
  check([cinder.found, cinder.litFlow > 0, cinder.tier], [true, true, 3], [false, false, 0],
    `B — a Boiler lights it: ${cinder.litFlow}/s`);
  check(cinder.hot > cinder.cold, true, false,
    `B — tier II: the burst grows with the gauge (${cinder.cold} cold → ${cinder.hot} at 80°)`);
  check(cinder.riskyFlow > cinder.safeFlow, true, false,
    `B — tier III: sustain only ABOVE the line (${cinder.safeFlow} safe → ${cinder.riskyFlow} risking 20°)`);
  console.log(`        every shell's flow: ${JSON.stringify(cinder.shapes)}`);

  // ═══ C — PRESSURE CHOSEN, VENTED WITH CAST VALVES ════════════════════════
  console.log('\n== C — pressure chosen, and vented with cast valves ============');
  const vents = await page.evaluate(async () => {
    const v = await import(/* @vite-ignore */ '/src/engine/systems/vents' + '.ts');
    const pres = await import(/* @vite-ignore */ '/src/engine/systems/pressure' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as { casting: { rack: unknown[] }; pressure: { choke: boolean } };
    const found = v.ventArrayFound(e.getState()) as boolean;
    const ventBefore = pres.ventRate(e.getState()) as number;
    e.dispatch({ type: 'buildVentArray' });
    const rackBefore = st.casting.rack.length;
    // A cell with NO route to any outlet — the one thing pipe cannot do.
    const set = e.dispatch({ type: 'setValve', cell: 15 }) as { ok: boolean };
    const spentOnValve = rackBefore - st.casting.rack.length;
    const ventAfter = pres.ventRate(e.getState()) as number;
    const slotsAtI = v.valveSlots(e.getState()) as number;
    // FILL the tier-I array before asking what a third valve says, or the
    // blocker is honestly null and the check reads its own sequencing.
    e.dispatch({ type: 'setValve', cell: 16 });
    const blocked = v.valveBlocker(e.getState(), 17) as string | null;

    // Tier II: the line becomes a setting, and only ever a cooler one.
    e.dispatch({ type: 'buildVentArray' });
    const derived = pres.holdLine(e.getState()) as number;
    e.dispatch({ type: 'setHoldLine', line: Math.floor(derived) - 4 });
    const asked = pres.holdLine(e.getState()) as number;
    e.dispatch({ type: 'setHoldLine', line: 200 });
    const clamped = pres.holdLine(e.getState()) as number;

    // Tier III: it answers the klaxon, once.
    e.dispatch({ type: 'buildVentArray' });
    st.pressure.choke = true;
    const first = v.answerKlaxon(e.getState(), { emit() {}, dirty() {} }) as boolean;
    const opened = !st.pressure.choke;
    st.pressure.choke = true;
    const second = v.answerKlaxon(e.getState(), { emit() {}, dirty() {} }) as boolean;
    st.pressure.choke = false;
    return {
      found, setOk: set.ok, spentOnValve,
      ventBefore: Math.round(ventBefore * 100) / 100,
      ventAfter: Math.round(ventAfter * 100) / 100,
      slotsAtI, blocked: (blocked ?? '').slice(0, 40),
      derived: Math.round(derived * 10) / 10, asked, clamped: Math.round(clamped * 10) / 10,
      first, opened, second,
    };
  });
  check([vents.found, vents.setOk, vents.spentOnValve], [true, true, 1], [false, false, 0],
    'C — a valve is CAST off the rack, not bought in Obsidian');
  check(vents.ventAfter > vents.ventBefore, true, false,
    `C — and it vents where it stands, with no route: ${vents.ventBefore} → ${vents.ventAfter}°/s`);
  check([vents.slotsAtI, vents.blocked.includes('holds 2')], [2, true], [0, false],
    'C — the SLOTS are the capability; a tier-I array holds two');
  check([vents.asked === Math.floor(vents.derived) - 4, vents.clamped <= vents.derived],
    [true, true], [false, false],
    `C — tier II sets the line (${vents.asked}), and asking for 200 gets the plumbing's ${vents.clamped}`);
  check([vents.first, vents.opened, vents.second], [true, true, false], [false, false, true],
    'C — tier III answers the klaxon, and ONCE per run');

  // ═══ D — ASH REDUCED TO A HIGHER MEDIUM ══════════════════════════════════
  console.log('\n== D — ash reduced, and §17\'s Pyre-bath =======================');
  const retort = await page.evaluate(async () => {
    const ret = await import(/* @vite-ignore */ '/src/engine/systems/retort' + '.ts');
    const red = await import(/* @vite-ignore */ '/src/engine/content/reductions' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const q = await import(/* @vite-ignore */ '/src/engine/systems/quench' + '.ts');
    const tmp = await import(/* @vite-ignore */ '/src/engine/systems/tempering' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as { materials: { stacks: Record<string, object> }; pressure: { heat: number } };
    const found = ret.retortFound(e.getState()) as boolean;
    e.dispatch({ type: 'buildRetort' });

    const rows = red.REDUCTIONS as { from: string; pyre: string; to: string; pyreBath?: boolean }[];
    const plain = rows.find((r) => !r.pyreBath)!;
    forge.addMaterial(e.getState(), plain.from, 60, 2);
    forge.addMaterial(e.getState(), plain.pyre, 60, 2);
    const band = Object.keys(st.materials.stacks[plain.from]!)[0]!;
    const did = e.dispatch({ type: 'reduce', fromId: plain.from, band }) as { ok: boolean };
    const made = forge.materialCount(e.getState(), plain.to) as number;
    const climbed = ret.climbsRarity(plain) as boolean;
    const fromR = (mats.materialDef(plain.from) as { rarity: string }).rarity;
    const toR = (mats.materialDef(plain.to) as { rarity: string }).rarity;

    // Tier III: the Pyre-bath, which nothing under it reaches.
    const bath = rows.find((r) => r.pyreBath)!;
    forge.addMaterial(e.getState(), bath.from, 60, 2);
    forge.addMaterial(e.getState(), bath.pyre, 60, 2);
    const bathBand = Object.keys(st.materials.stacks[bath.from]!)[0]!;
    const tooShallow = ret.reduceBlocker(e.getState(), bath.from, bathBand) as string | null;
    e.dispatch({ type: 'buildRetort' });
    e.dispatch({ type: 'buildRetort' });
    const deep = e.dispatch({ type: 'reduce', fromId: bath.from, band: bathBand }) as { ok: boolean };
    const baths = forge.materialCount(e.getState(), red.PYRE_BATH) as number;

    const pyreTemper = (tmp.TEMPERS as { id: string; medium: string }[])
      .find((t) => t.medium === red.PYRE_BATH)!;
    const takesAll = ['marl', 'voidstar', 'axiomdust', 'obsidianheart']
      .every((m) => q.mediumTakes(pyreTemper.id, m) as boolean);
    const others = (tmp.TEMPERS as { id: string; medium: string }[])
      .filter((t) => t.medium !== red.PYRE_BATH)
      .filter((t) => !(q.mediumTakes(t.id, 'marl') as boolean)).length;
    return {
      found, didOk: did.ok, made, climbed, fromR, toR,
      tooShallow: (tooShallow ?? '').slice(0, 40), deepOk: deep.ok, baths,
      takesAll, others, rows: rows.length,
    };
  });
  check([retort.found, retort.didOk, retort.made], [true, true, 1], [false, false, 0],
    'D — two of a medium and a pyre stone reduce to one of the band above');
  check([retort.climbed, retort.fromR, retort.toR], [true, 'common', 'rich'], [false, 'x', 'x'],
    `D — and it CLIMBS A RARITY: ${retort.fromR} → ${retort.toR}, which nothing else in the game does`);
  check([retort.tooShallow.includes('deepest Retort'), retort.deepOk, retort.baths],
    [true, true, 1], [false, false, 0],
    'D — the Pyre-bath wants tier III, and nothing under it reaches one');
  check([retort.takesAll, retort.others > 0], [true, true], [false, false],
    `D — §17: the Pyre-bath refuses NO part, and ${retort.others} other media refuse a plain Marl`);

  // ═══ E — A FALLOW QUADRANT, SEEDED AND FARMED ════════════════════════════
  console.log('\n== E — a fallow quadrant seeded, and its traits farmed =========');
  const farm = await page.evaluate(async () => {
    const cul = await import(/* @vite-ignore */ '/src/engine/systems/cultivar' + '.ts');
    const strains = await import(/* @vite-ignore */ '/src/engine/content/strains' + '.ts');
    const growth = await import(/* @vite-ignore */ '/src/engine/systems/growth' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const traits = await import(/* @vite-ignore */ '/src/engine/traits' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as {
      shell: { current: string }; growth: { stage: number[]; fruit: number[]; age: number[]; fullSince: number[] };
      face: { cells: number[] };
    };
    st.shell.current = 'verdance';
    const found = cul.cultivarFound(e.getState()) as boolean;
    e.dispatch({ type: 'buildCultivarBench' });

    // The growth constants, before and after — the LOCKED signature.
    const locked = [growth.CAPTURE, growth.STAGE_UP_SEC.join('|'), growth.HARVEST_BONUS.join('|')];

    const strain = (strains.STRAINS as { id: string; trait: string }[])[0]!;
    const seeded = e.dispatch({ type: 'seedBed', quad: 'nw', strainId: strain.id }) as { ok: boolean };
    const notRipe = cul.cropBlocker(e.getState(), 'nw') as string | null;
    // Grow it the way growth would have: vines standing, fruit banked.
    const n = st.face.cells.length;
    while (st.growth.stage.length < n) st.growth.stage.push(0);
    while (st.growth.fruit.length < n) st.growth.fruit.push(0);
    while (st.growth.age.length < n) st.growth.age.push(0);
    while (st.growth.fullSince.length < n) st.growth.fullSince.push(0);
    for (const c of cul.cellsOf(e.getState(), 'nw') as number[]) {
      st.growth.stage[c] = 3; st.growth.fruit[c] = cul.FRUIT_PER_UNIT;
    }
    const standing = cul.bedFruit(e.getState(), 'nw') as number;
    const p = cul.cropPreview(e.getState(), 'nw') as { units: number; materialId: string };
    const cropped = e.dispatch({ type: 'cropBed', quad: 'nw' }) as { ok: boolean };
    const held = forge.materialCount(e.getState(), p.materialId) as number;
    const after = cul.bedFruit(e.getState(), 'nw') as number;
    const carries = (traits.traitsOf(p.materialId) as string[]).includes(strain.trait);
    const cleared = (cul.cellsOf(e.getState(), 'nw') as number[]).every((c) => st.growth.stage[c] === 0);

    // Tier II: the bed KEEPS.
    e.dispatch({ type: 'buildCultivarBench' });
    for (const c of cul.cellsOf(e.getState(), 'nw') as number[]) {
      st.growth.stage[c] = 3; st.growth.fruit[c] = cul.FRUIT_PER_UNIT;
    }
    e.dispatch({ type: 'cropBed', quad: 'nw' });
    const kept = (cul.cellsOf(e.getState(), 'nw') as number[]).every((c) => st.growth.stage[c] === 3);
    const lockedAfter = [growth.CAPTURE, growth.STAGE_UP_SEC.join('|'), growth.HARVEST_BONUS.join('|')];
    return {
      found, seededOk: seeded.ok, notRipe: (notRipe ?? '').slice(0, 30),
      standing, units: p.units, materialId: p.materialId, croppedOk: cropped.ok, held,
      after, carries, cleared, kept, trait: strain.trait,
      lockedSame: JSON.stringify(locked) === JSON.stringify(lockedAfter),
    };
  });
  check([farm.found, farm.seededOk, farm.notRipe.includes('Not ripe')], [true, true, true], [false, false, false],
    'E — a bed is seeded, and pays nothing until it is ripe');
  check([farm.croppedOk, farm.held === farm.units, farm.carries], [true, true, true], [false, false, false],
    `E — cropped ${farm.units}× ${farm.materialId}, and it carries ${farm.trait}`);
  check([farm.after, farm.standing > 0], [0, true], [-1, false],
    'E — THE TRADE: the crop TOOK the fruit, so the charge it would have paid is what it cost');
  check([farm.cleared, farm.kept], [true, true], [false, false],
    'E — tier I clears the bed as a harvest does; tier II leaves the vines standing');
  check(farm.lockedSame, true, false,
    'E — and every growth constant is where it was — the signature is untouched');

  // ═══ F — THE COIL ════════════════════════════════════════════════════════
  console.log('\n== F — the Coil, and what changed about Surge ==================');
  const coil = await page.evaluate(async () => {
    const c = await import(/* @vite-ignore */ '/src/engine/systems/coil' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as {
      shell: { current: string }; polarity: { chain: number; bestChain: number };
      collapse: { nodes: Record<string, number> }; plant: { tiers: Record<string, number> };
    };
    st.shell.current = 'ferrite';
    st.collapse.nodes = {};                        // an empty purse, as a Breach leaves it
    delete st.plant.tiers['coil'];
    const floor = plant.surgeCap(e.getState()) as number;
    const lineWants = (plant.demandOf('line') as { surge: number }).surge;
    const found = c.coilFound(e.getState()) as boolean;
    e.dispatch({ type: 'buildCoil' });
    const withCoil = plant.surgeCap(e.getState()) as number;
    // Tier II: the chain banks.
    e.dispatch({ type: 'buildCoil' });
    st.polarity.chain = 0;
    const noChain = plant.surgeCap(e.getState()) as number;
    st.polarity.chain = 10;
    const chained = plant.surgeCap(e.getState()) as number;
    // Tier III: it remembers the best.
    st.polarity.chain = 0;
    st.polarity.bestChain = 14;
    const forgotten = c.chainRead(e.getState()) as number;
    e.dispatch({ type: 'buildCoil' });
    const remembered = c.chainRead(e.getState()) as number;
    const before = { chain: st.polarity.chain, best: st.polarity.bestChain };
    c.coilSurge(e.getState());
    const untouched = st.polarity.chain === before.chain && st.polarity.bestChain === before.best;
    return {
      floor, lineWants, found,
      withCoil: Math.round(withCoil * 10) / 10,
      noChain: Math.round(noChain * 10) / 10,
      chained: Math.round(chained * 10) / 10,
      forgotten, remembered, untouched,
    };
  });
  check([coil.floor < coil.lineWants, coil.floor, coil.lineWants], [true, 14, 18], [false, 0, 0],
    'F — ITEM 11: a bare plant CANNOT fire a Line — 14 against 18, on an empty purse');
  check([coil.found, coil.withCoil >= coil.lineWants], [true, true], [false, false],
    `F — a tier-I Coil clears it on its own: ${coil.withCoil}`);
  check(coil.chained > coil.noChain, true, false,
    `F — tier II: a ten-link chain banks (${coil.noChain} → ${coil.chained})`);
  check([coil.forgotten, coil.remembered, coil.untouched], [0, 14, true], [14, 0, false],
    'F — tier III remembers the best chain, and polarity is written by nobody');

  // ═══ G — THE MACHINES, FROM CAST PARTS ═══════════════════════════════════
  console.log('\n== G — each machine raised from cast parts at its wreck ========');
  const raised = await page.evaluate(async () => {
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const boiler = await import(/* @vite-ignore */ '/src/engine/systems/boiler' + '.ts');
    const v = await import(/* @vite-ignore */ '/src/engine/systems/vents' + '.ts');
    const ret = await import(/* @vite-ignore */ '/src/engine/systems/retort' + '.ts');
    const cul = await import(/* @vite-ignore */ '/src/engine/systems/cultivar' + '.ts');
    const c = await import(/* @vite-ignore */ '/src/engine/systems/coil' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const e = w['__engine']!;
    const s = e.getState() as unknown as { plant: { builtOf: Record<string, string[]> } };
    return {
      tiers: ['boiler', 'vents', 'retort', 'cultivar', 'coil']
        .map((id) => plant.tierOf(e.getState(), id) as number),
      builtOf: ['boiler', 'vents', 'retort', 'cultivar', 'coil']
        .map((id) => (s.plant.builtOf[id] ?? []).length > 0),
      stations: {
        boiler: boiler.boilerStation(), vents: v.ventStation(), retort: ret.retortStation(),
        cultivar: cul.cultivarStation(), coil: c.coilStation(),
      },
    };
  });
  check(raised.tiers, [3, 3, 3, 2, 3], [0, 0, 0, 0, 0],
    'G — five machines standing, every tier bought with cast parts');
  check(raised.builtOf, [true, true, true, true, true], [false, false, false, false, false],
    'G — §11.2: each remembers what it was cast from');
  for (const [k, v] of Object.entries(raised.stations)) console.log(`        ${k.padEnd(9)} ${JSON.stringify(v)}`);

  // ═══ H — THE TIERS ═══════════════════════════════════════════════════════
  console.log('\n== H — tier I vs II vs III, each a different sentence ==========');
  const tiers = await page.evaluate(async () => {
    const boiler = await import(/* @vite-ignore */ '/src/engine/systems/boiler' + '.ts');
    const v = await import(/* @vite-ignore */ '/src/engine/systems/vents' + '.ts');
    const ret = await import(/* @vite-ignore */ '/src/engine/systems/retort' + '.ts');
    const cul = await import(/* @vite-ignore */ '/src/engine/systems/cultivar' + '.ts');
    const c = await import(/* @vite-ignore */ '/src/engine/systems/coil' + '.ts');
    return {
      boiler: (boiler.TIER_CAPABILITY_BOILER as readonly string[]).slice(1),
      vents: (v.TIER_CAPABILITY_VENTS as readonly string[]).slice(1),
      retort: (ret.TIER_CAPABILITY_RETORT as readonly string[]).slice(1),
      cultivar: (cul.TIER_CAPABILITY_CULTIVAR as readonly string[]).slice(1),
      coil: (c.TIER_CAPABILITY_COIL as readonly string[]).slice(1),
    };
  });
  for (const [name, rows] of Object.entries(tiers)) {
    check([rows.length, new Set(rows).size], [3, 3], [3, 1], `H — ${name}: three DISTINCT sentences`);
  }

  // ═══ I — THE CLONE CHECK ═════════════════════════════════════════════════
  console.log('\n== I — the clone check, green and RED-TESTED ===================');
  const clonePage = await browser.newPage({ viewport: { width: W, height: H } });
  await clonePage.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  const clones = await clonePage.evaluate(async () => {
    // A.93's finding, kept: import the URL the app actually loaded, or a bare
    // specifier gives you a SECOND live registry.
    const url = performance.getEntriesByType('resource').map((r) => r.name)
      .filter((n) => n.includes('/src/engine/materials.ts'))
      .sort((a, b) => b.length - a.length)[0] ?? '/src/engine/materials.ts';
    const mats = await import(/* @vite-ignore */ url);
    const traitsUrl = performance.getEntriesByType('resource').map((r) => r.name)
      .filter((n) => n.includes('/src/engine/traits.ts'))
      .sort((a, b) => b.length - a.length)[0] ?? '/src/engine/traits.ts';
    const traits = await import(/* @vite-ignore */ traitsUrl);
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cfp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const washer = await import(/* @vite-ignore */ '/src/engine/systems/washer' + '.ts');
    washer.ensureWashProducts();
    const key = new Function('fp', 'cfp', 'return function (id) { return cfp.TOOL_STATS.map(function (s) { return fp.derivePart(fp.makePart("head", id, 60)).stats[s].toFixed(3); }).join("|"); };')(fp, cfp) as (id: string) => string;
    const seen = new Map<string, string>();
    const found: string[] = [];
    for (const m of mats.MATERIALS as { id: string; name: string; worked?: boolean; source?: string }[]) {
      if (m.worked || m.source === 'combat') continue;
      const k = key(m.id);
      if (seen.has(k)) found.push(`${m.name} = ${seen.get(k)}`);
      else seen.set(k, m.name);
    }
    const src = (mats.MATERIALS as { id: string; name: string }[]).find((m) => m.id === 'lodestone')!;
    mats.registerMaterial({ ...src, id: '__twin__', name: 'Twin Lodestone' });
    (traits.MATERIAL_TRAITS as Record<string, unknown>)['__twin__'] = [...(traits.traitsOf('lodestone') as string[])];
    const redSeen = new Map<string, string>();
    const red: string[] = [];
    for (const m of mats.MATERIALS as { id: string; name: string; worked?: boolean; source?: string }[]) {
      if (m.worked || m.source === 'combat') continue;
      const k = key(m.id);
      if (redSeen.has(k)) red.push(`${m.name} = ${redSeen.get(k)}`);
      else redSeen.set(k, m.name);
    }
    return { population: seen.size, found, red: red.length, redSays: red[0] ?? '' };
  });
  check(clones.found, [], ['x'], `I — zero clones across ${clones.population} materials`);
  check(clones.red, 1, 0, `I — RED-TESTED: a deliberate twin IS caught (${clones.redSays})`);
  await clonePage.close();

  // ═══ J — PILLAR 2 ════════════════════════════════════════════════════════
  console.log('\n== J — dpsMax at the SAME depth, with all of it live ===========');
  const ceiling = await page.evaluate(async () => {
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as {
      depth: number; pressure: { heat: number }; polarity: { chain: number };
      plant: { tiers: Record<string, number>; condition: Record<string, unknown> };
      vents?: unknown; cultivar?: unknown;
    };
    s.depth = 48;                                   // THE SAME DEPTH IN BOTH ARMS
    s.pressure.heat = 95;
    s.polarity.chain = 40;
    const m = new modsMod.ModifierCache(); m.invalidate();
    const live = Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 1e6);
    const grewFlow = Math.round((plant.flowCap(s) as number) * 100) / 100;
    const grewSurge = Math.round((plant.surgeCap(s) as number) * 10) / 10;
    const keep = { tiers: s.plant.tiers, cond: s.plant.condition, v: s.vents, c: s.cultivar };
    s.plant.tiers = {}; s.plant.condition = {};
    delete s.vents; delete s.cultivar;
    m.invalidate();
    const bare = Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 1e6);
    s.plant.tiers = keep.tiers; s.plant.condition = keep.cond;
    s.vents = keep.v; s.cultivar = keep.c;
    return { live, bare, grewFlow, grewSurge };
  });
  check(ceiling.live, ceiling.bare, -1,
    `J — the ceiling at depth 48 is identical bare and with all of A.95 live (${ceiling.live})`);
  console.log(`        ...and the plant really grew: Flow ${ceiling.grewFlow}/s, Surge ${ceiling.grewSurge}`);

  // ═══ K — THE PANELS, AT 380px ════════════════════════════════════════════
  console.log('\n== K — the panels, at 380px ===================================');
  await tab(page, 'kiln');
  await dismiss(page);
  await page.waitForTimeout(500);
  for (const id of ['retort-panel', 'cultivar-panel', 'coil-panel']) {
    const el = page.locator(`[data-testid="${id}"]`).first();
    const there = (await el.count()) > 0;
    check(there, true, false, `K — ${id} is on the screen`);
    if (!there) continue;
    const h = await el.evaluate((n) => Math.round(n.getBoundingClientRect().height));
    check(h < 1400, true, false, `K — ${id} is ${h}px tall, not a wall`);
    await el.screenshot({ path: `${OUT}/a95-${id}.png` }).catch(() => {});
  }
  await page.screenshot({ path: `${OUT}/a95-plant.png`, fullPage: true }).catch(() => {});

  // ...and Cinder's two, which live in the shaft and the vent gallery.
  await tab(page, 'dig');
  await dismiss(page);
  await page.waitForTimeout(400);
  const boilerEl = page.locator('[data-testid="boiler-panel"]').first();
  check((await boilerEl.count()) > 0, true, false, 'K — boiler-panel is on the screen');
  if ((await boilerEl.count()) > 0) await boilerEl.screenshot({ path: `${OUT}/a95-boiler-panel.png` }).catch(() => {});
  /**
   * BACK TO CINDER FIRST. Block E stood the player in Verdance to farm a bed,
   * and `VentsPanel` correctly shows bare rock to anyone who is neither in
   * Cinder nor carrying pressure — so the first run of this block photographed
   * a placeholder and called the panel missing. The driver's sequencing, not
   * the component's.
   */
  await page.evaluate(() => {
    const w = window as unknown as Record<string, { getState: () => { shell: { current: string } } }>;
    w['__engine']!.getState().shell.current = 'cinder';
  });
  await tab(page, 'vents');
  await dismiss(page);
  await page.waitForTimeout(400);
  const arrayEl = page.locator('[data-testid="vent-array-panel"]').first();
  check((await arrayEl.count()) > 0, true, false, 'K — vent-array-panel is on the screen');
  if ((await arrayEl.count()) > 0) {
    const h = await arrayEl.evaluate((n) => Math.round(n.getBoundingClientRect().height));
    check(h < 1400, true, false, `K — vent-array-panel is ${h}px tall, not a wall`);
    await arrayEl.screenshot({ path: `${OUT}/a95-vent-array.png` }).catch(() => {});
  }
  await page.screenshot({ path: `${OUT}/a95-vents.png`, fullPage: true }).catch(() => {});

  const overflow = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1)) {
        out.push(`${el.tagName}.${(el.className || '').toString().slice(0, 30)}`);
      }
    }
    return out.slice(0, 6);
  });
  check(overflow, [], ['x'], 'K — nothing overflows 380px');
  check(errors, [], ['x'], 'K — no page errors');

  await browser.close();
  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  if (problems.length) { for (const p of problems) console.log(`  - ${p}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
