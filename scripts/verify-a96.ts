/**
 * A.96 DRIVEN IN THE REAL GAME — §3.2 finished, and the machines around it.
 *
 *   A  §23's opening, read FIRST on a reset state
 *   B  each of the three new plants running its own shape, and dead without it
 *   C  EVERY plant reader refusing to fire outside its shell
 *   D  the same Core spend buying different capability in two shells
 *   E  a face cell bought back with its physics chosen
 *   F  null residue condensed to Hush, and a Witness spending it
 *   G  each processing step as a row in its existing panel
 *   H  each machine built from cast parts at its wreck
 *   I  tier I vs II vs III each doing something DIFFERENT
 *   J  the clone check RED-TESTED
 *   K  dpsMax unmoved at equal depth with every plant at maximum
 *   L  380px, 0 overflow, PANEL HEIGHT bounded, 0 page errors
 *
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY — esbuild's
 * `keepNames` rewrites `const f = () => {}` into `__name(...)`, which does not
 * exist in the page. It has cost six runs across A.90–A.95.
 *
 *   npx tsx scripts/verify-a96.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a96';
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
  s.plant.tiers['crusher'] = 3;
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
  await page.screenshot({ path: `${OUT}/a96-opening.png`, fullPage: true }).catch(() => {});

  // ═══ B — THE THREE NEW PLANTS ════════════════════════════════════════════
  console.log('\n== B — the three new plants, each running its own shape ========');
  await setup(page, PLANT_SETUP);
  const shapes = await page.evaluate(async () => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const sp = await import(/* @vite-ignore */ '/src/engine/systems/shellPlants' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as {
      shell: { current: string; signatures: string[] };
      growth: { stage: number[] }; hollow: { silence: number };
      face: { cells: number[] }; plant: { tiers: Record<string, number> };
    };
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      st.shell.current = id;
      roll.markReached(e.getState(), 999, 50);
    }
    st.shell.signatures = [];
    const n = st.face.cells.length;

    // THE BLOOM — cells you refuse to mine.
    st.shell.current = 'verdance';
    st.growth.stage = new Array(n).fill(0);
    const bareBloom = plant.flowCap(e.getState()) as number;
    st.growth.stage = new Array(n).fill(2);
    const fullBloom = plant.flowCap(e.getState()) as number;

    // THE PRISM — dead without one, and the burst is what you did not aim.
    st.shell.current = 'glassmere';
    delete st.plant.tiers['prism'];
    const deadPrism = plant.flowCap(e.getState()) as number;
    e.dispatch({ type: 'buildPrism' });
    const litPrism = plant.flowCap(e.getState()) as number;
    // TIER II BEFORE STACKING: a tier-I Prism takes one point per band
    // (`weighted`), so three on one band is refused and this arm would have
    // read its own sequencing instead of the ceiling.
    e.dispatch({ type: 'buildPrism' });
    for (let b = 0; b < 6; b++) e.dispatch({ type: 'allocate', band: b, points: 0 });
    const unaimed = plant.surgeCap(e.getState()) as number;
    e.dispatch({ type: 'allocate', band: 1, points: 3 });
    const aimed = plant.surgeCap(e.getState()) as number;

    // THE NULL — flow that grows as the Silence worsens.
    st.shell.current = 'hollow';
    st.hollow.silence = 0;
    const quiet = plant.flowCap(e.getState()) as number;
    st.hollow.silence = 100;
    const loud = plant.flowCap(e.getState()) as number;

    // ...and what the whole table reads, at one heat.
    const table: Record<string, number> = {};
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      st.shell.current = id;
      table[id] = Math.round((plant.flowCap(e.getState()) as number) * 100) / 100;
    }
    st.shell.current = 'verdance';
    const read = sp.shellPlantRead(e.getState()) as { id: string; name: string } | null;
    return {
      bareBloom, fullBloom: Math.round(fullBloom * 100) / 100,
      deadPrism, litPrism, unaimed, aimed,
      quiet, loud: Math.round(loud * 100) / 100,
      table, readId: read?.id ?? '', readName: read?.name ?? '',
    };
  });
  check([shapes.bareBloom, shapes.fullBloom > shapes.bareBloom], [2.4, true], [0, false],
    `B — THE BLOOM: ${shapes.bareBloom}/s bare, ${shapes.fullBloom}/s with every cell left standing`);
  check([shapes.deadPrism, shapes.litPrism], [0, 2.4], [2.4, 0],
    'B — THE PRISM: Glassmere has NO plant without one, and 2.4/s with it');
  check(shapes.aimed < shapes.unaimed, true, false,
    `B — ...and the burst is what you did NOT aim: ${shapes.unaimed} unaimed → ${shapes.aimed} spent`);
  check([shapes.quiet, shapes.loud > shapes.quiet], [2.4, true], [0, false],
    `B — THE NULL: ${shapes.quiet}/s at silence 0, ${shapes.loud}/s at 100`);
  check([shapes.readId, shapes.readName], ['bloom', 'The Bloom'], ['', ''],
    'B — and the panel names the shell\'s own plant, not the Hearth');
  console.log(`        the finished table: ${JSON.stringify(shapes.table)}`);

  // ═══ C — EVERY READER HAS A SHELL CONDITION ══════════════════════════════
  console.log('\n== C — every plant reader refuses to fire outside its shell ====');
  const sweep = await page.evaluate(async () => {
    const boiler = await import(/* @vite-ignore */ '/src/engine/systems/boiler' + '.ts');
    const coil = await import(/* @vite-ignore */ '/src/engine/systems/coil' + '.ts');
    const sp = await import(/* @vite-ignore */ '/src/engine/systems/shellPlants' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as {
      shell: { current: string; signatures: string[] };
      pressure: { heat: number }; polarity: { chain: number; bestChain: number };
      hollow: { silence: number }; growth: { stage: number[] };
      plant: { tiers: Record<string, number> }; face: { cells: number[] };
    };
    // Everything on at once, so a shape that leaks has something to leak.
    st.plant.tiers['boiler'] = 3; st.plant.tiers['coil'] = 3; st.plant.tiers['prism'] = 3;
    st.pressure.heat = 90; st.polarity.chain = 20; st.polarity.bestChain = 20;
    st.hollow.silence = 80;
    st.growth.stage = new Array(st.face.cells.length).fill(2);
    st.shell.signatures = [];
    const SHELLS = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph'];
    const READERS = [
      ['boilerFlow', 'cinder', boiler.boilerFlow],
      ['boilerSurge', 'cinder', boiler.boilerSurge],
      ['coilSurge', 'ferrite', coil.coilSurge],
      ['bloomFlow', 'verdance', sp.bloomFlow],
      ['prismFlow', 'glassmere', sp.prismFlow],
      ['prismSurge', 'glassmere', sp.prismSurge],
      ['nullFlow', 'hollow', sp.nullFlow],
    ] as [string, string, (s: unknown) => number][];
    const leaks: string[] = [];
    const dead: string[] = [];
    for (const [name, home, read] of READERS) {
      for (const id of SHELLS) {
        st.shell.current = id;
        const v = read(e.getState());
        if (id === home) { if (!(v > 0)) dead.push(`${name} is dead at home`); }
        else if (v !== 0) leaks.push(`${name} fired in ${id} (${v})`);
      }
    }
    // ...and a CARRIED signature keeps it, which is §3.2's own sentence.
    st.shell.current = 'aleph';
    st.shell.signatures = ['growth', 'absence', 'pressure', 'polarity'];
    const carried = [
      sp.bloomFlow(e.getState()) as number > 0,
      sp.nullFlow(e.getState()) as number > 0,
      boiler.boilerSurge(e.getState()) as number > 0,
      coil.coilSurge(e.getState()) as number > 0,
    ];
    st.shell.signatures = [];
    return { leaks, dead, readers: READERS.length, carried };
  });
  check(sweep.leaks, [], ['x'],
    `C — ${sweep.readers} plant readers × 7 shells: nothing fires where it does not belong`);
  check(sweep.dead, [], ['x'], 'C — ...and each is worth something at home, so the sweep is not vacuous');
  check(sweep.carried, [true, true, true, true], [false, false, false, false],
    'C — but a CARRIED signature keeps it (§3.2: your power profile is a build)');

  // ═══ D — THE SAME CORE SPEND ═════════════════════════════════════════════
  console.log('\n== D — the same Core spend, two shells, different capability ===');
  const spend = await page.evaluate(async () => {
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as {
      shell: { current: string; signatures: string[] };
      collapse: { nodes: Record<string, number> };
      plant: { tiers: Record<string, number> }; polarity: { chain: number };
      growth: { stage: number[] }; face: { cells: number[] };
    };
    st.shell.signatures = [];
    st.collapse.nodes = {};
    const wants = (plant.demandOf('kiln') as { flow: number }).flow
      + (plant.demandOf('refinery') as { flow: number }).flow;

    // ONE RANK of flowCapacity, in two shells.
    st.collapse.nodes = { flowCapacity: 1 };
    st.shell.current = 'verdance';
    st.growth.stage = new Array(st.face.cells.length).fill(2);
    const verdance = Math.round((plant.flowCap(e.getState()) as number) * 100) / 100;
    st.shell.current = 'glassmere';
    delete st.plant.tiers['prism'];
    const glassmere = Math.round((plant.flowCap(e.getState()) as number) * 100) / 100;

    // ONE RANK of surgeCapacity, in two shells.
    st.collapse.nodes = { surgeCapacity: 1 };
    st.shell.current = 'ferrite';
    st.plant.tiers['coil'] = 2;
    st.polarity.chain = 20;
    const ferriteSurge = Math.round((plant.surgeCap(e.getState()) as number) * 10) / 10;
    st.shell.current = 'verdance';
    const verdanceSurge = Math.round((plant.surgeCap(e.getState()) as number) * 10) / 10;
    st.collapse.nodes = {};
    st.plant.tiers['prism'] = 3;
    return { wants, verdance, glassmere, ferriteSurge, verdanceSurge };
  });
  check([spend.verdance > spend.wants, spend.glassmere < spend.wants], [true, true], [false, false],
    `D — one rank of flowCapacity: Verdance ${spend.verdance}/s runs a Kiln AND a Refinery (${spend.wants} wanted); a Prism-less Glassmere has only the rank itself (${spend.glassmere}/s)`);
  check(spend.ferriteSurge > spend.verdanceSurge, true, false,
    `D — one rank of surgeCapacity: spare beside a chain-fed Coil (${spend.ferriteSurge}) vs the whole bank (${spend.verdanceSurge})`);

  // ═══ E — A CELL BOUGHT BACK, WITH ITS PHYSICS CHOSEN ═════════════════════
  console.log('\n== E — a face cell bought back, physics chosen =================');
  const frame = await page.evaluate(async () => {
    const fr = await import(/* @vite-ignore */ '/src/engine/systems/frame' + '.ts');
    const abs = await import(/* @vite-ignore */ '/src/engine/systems/absence' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const D = (await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts')).D;
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as {
      shell: { current: string }; depth: number; currencies: Record<string, unknown>;
      hollow: { rebuilt: number[] }; growth: { stage: number[] };
      polarity: { signs: number[] }; face: { cells: number[]; ore?: string[] };
    };
    st.shell.current = 'hollow';
    st.depth = 400;
    st.hollow.rebuilt = [];
    st.currencies['void'] = D('1e12');
    /**
     * CLEAR THE FACE FIRST. Block C fills every cell's `growth.stage` to prove
     * a Bloom leaking, so "a cell with no Frame comes back BARE" would have
     * read block C's fixture rather than the rebuild. Driver sequencing.
     */
    st.growth.stage = new Array(st.face.cells.length).fill(0);
    st.polarity.signs = new Array(st.face.cells.length).fill(-1);
    st.face.ore = [];
    const found = fr.frameFound(e.getState()) as boolean;
    const costBefore = (abs.rebuildCost(e.getState()) as { toNumber: () => number }).toNumber();

    // A cell with NO frame: bare rock, as it has always been.
    e.dispatch({ type: 'rebuildCell', cell: 0 });
    const bare = {
      vined: (st.growth.stage[0] ?? 0) > 0,
      pocket: !!st.face.ore?.[0],
      charge: st.face.cells[0],
    };

    e.dispatch({ type: 'buildFrame' });
    const costAfter = (abs.rebuildCost(e.getState()) as { toNumber: () => number }).toNumber();
    e.dispatch({ type: 'setGrain', grain: 'seeded' });
    e.dispatch({ type: 'rebuildCell', cell: 1 });
    const seeded = { vined: (st.growth.stage[1] ?? 0) > 0, charge: st.face.cells[1] };
    // Tier I SPENDS the grain.
    const spentGrain = (fr.grainsSet(e.getState()) as string[]).length === 0;

    // Tier III lays TWO on one cell.
    e.dispatch({ type: 'buildFrame' });
    e.dispatch({ type: 'buildFrame' });
    e.dispatch({ type: 'setGrain', grain: 'seeded' });
    e.dispatch({ type: 'setGrain', grain: 'poled' });
    e.dispatch({ type: 'rebuildCell', cell: 2 });
    const both = {
      vined: (st.growth.stage[2] ?? 0) > 0,
      poled: st.polarity.signs[2] === 1,
      charge: st.face.cells[2],
    };
    return {
      found, bare, seeded, spentGrain, both,
      cheapened: costAfter !== costBefore * 1.62 ? 'curve moved' : 'curve unchanged',
      tier: plant.tierOf(e.getState(), 'frame') as number,
      station: fr.frameStation(),
    };
  });
  check([frame.found, frame.bare.vined, frame.bare.pocket], [true, false, false], [false, true, true],
    `E — THE UNBUILT ${JSON.stringify(frame.station)} — and a cell with no Frame comes back bare, as always`);
  check([frame.seeded.vined, frame.seeded.charge, frame.spentGrain], [true, 0, true], [false, 8, false],
    'E — SEEDED: the cell comes back vined, still empty of charge, and tier I spends the grain');
  check([frame.both.vined, frame.both.poled, frame.both.charge], [true, true, 0], [false, false, 8],
    `E — tier ${frame.tier}: two grains on one cell, and it STILL begins empty`);
  check(frame.cheapened, 'curve unchanged', 'curve moved',
    'E — and the Frame did not touch the signature\'s cost curve');

  // ═══ F — RESIDUE → HUSH → A WITNESS ══════════════════════════════════════
  console.log('\n== F — null residue condensed, and a Witness spending it =======');
  const hush = await page.evaluate(async () => {
    const wit = await import(/* @vite-ignore */ '/src/engine/systems/witness' + '.ts');
    const cond = await import(/* @vite-ignore */ '/src/engine/systems/condition' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as {
      shell: { current: string }; hollow: { silence: number };
      plant: { tiers: Record<string, number>; condition: Record<string, unknown> };
      witness?: { residue: number; hush: number }; materials: { stacks: Record<string, object> };
    };
    st.shell.current = 'hollow';
    st.plant.tiers['condenser'] = 1;
    st.plant.tiers['witness'] = 1;
    st.plant.condition = {};
    st.hollow.silence = 100;
    const m = new modsMod.ModifierCache(); m.invalidate();
    cond.tickCondition(e.getState(), m, 600);
    const bit = cond.biting(e.getState(), 'kiln', 'undecided') as boolean;
    wit.ensureWitness(e.getState());
    wit.tickResidue(e.getState(), 200);
    const residue = st.witness!.residue;
    e.dispatch({ type: 'condense' });
    const madeHush = st.witness!.hush;
    const maybe = wit.registerMaybe('marl') as { id: string };
    forge.addMaterial(e.getState(), maybe.id, 60, 2);
    st.witness!.hush = 99;
    const band = Object.keys(st.materials.stacks[maybe.id]!)[0]!;
    const options = wit.couldBe(e.getState(), maybe.id) as string[];
    const named = e.dispatch({ type: 'witness', materialId: maybe.id, band, into: 'marl' }) as { ok: boolean; reason?: string };
    return {
      bit, residue: Math.round(residue * 1000) / 1000,
      madeHush: Math.round(madeHush * 1000) / 1000,
      spent: 99 - st.witness!.hush,
      wasOnList: options[0] === 'marl',
      namedOk: named.ok, says: (named.reason ?? '').slice(0, 40),
      marl: forge.materialCount(e.getState(), 'marl') as number,
    };
  });
  check([hush.bit, hush.residue > 0, hush.madeHush > 0], [true, true, true], [false, false, false],
    `F — the world wrote ${hush.residue} residue on a plant nobody looked at, and the Condenser made ${hush.madeHush} Hush of it`);
  check([hush.wasOnList, hush.namedOk, hush.spent > 0], [true, true, true], [false, false, false],
    `F — ...and a Witness spent ${hush.spent} of it to say what the maybe WAS (${hush.marl} Marl in hand)`);

  // ═══ G — THE PROCESSING STEPS ════════════════════════════════════════════
  console.log('\n== G — each processing step, a row in an existing panel ========');
  const rows = await page.evaluate(async () => {
    const cr = await import(/* @vite-ignore */ '/src/engine/systems/crusher' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const res = await import(/* @vite-ignore */ '/src/engine/resources' + '.ts');
    const shells = await import(/* @vite-ignore */ '/src/engine/shells' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as {
      shell: { current: string }; casting: { rack: unknown[] };
      plant: { surge: number; condition: Record<string, unknown> };
    };
    st.shell.current = 'loam';
    st.plant.surge = 9999;
    /**
     * CLEAR THE CONDITIONS. Block F deliberately writes UNDECIDED to every
     * machine in the Hollow, and an undecided Crusher does not retain its band
     * (§7.2) — so the Mill's arm would have measured E2's rule instead of the
     * fineness. The condition is real; reading it here is the driver's error.
     */
    st.plant.condition = {};
    const rackBefore = st.casting.rack.length;

    // THE MILL: coarse vs fine, on the same stone.
    forge.addMaterial(e.getState(), 'marl', 65, cr.CRUSH_BATCH * 2);
    const coarse = cr.crushPreview(e.getState(), 'marl', 'good') as { outBand: string; byproduct: number };
    e.dispatch({ type: 'setFineness', how: 'fine' });
    const fine = cr.crushPreview(e.getState(), 'marl', 'good') as { outBand: string; byproduct: number };
    e.dispatch({ type: 'setFineness', how: 'coarse' });
    e.dispatch({ type: 'crush', materialId: 'marl', band: 'good' });
    const tailings = forge.materialCount(e.getState(), cr.CRUSH_BYPRODUCT) as number;

    // THE LEACH VAT: what a reject is worth.
    forge.addMaterial(e.getState(), cr.CRUSH_BYPRODUCT, 50, cr.LEACH_BATCH);
    const id = shells.convCurrencyId(e.getState()) as string;
    const before = (res.getCurrency(e.getState(), id) as { toNumber: () => number }).toNumber();
    const did = e.dispatch({ type: 'leach' }) as { ok: boolean };
    const after = (res.getCurrency(e.getState(), id) as { toNumber: () => number }).toNumber();
    return {
      coarseBand: coarse.outBand, coarseTail: coarse.byproduct,
      fineBand: fine.outBand, fineTail: fine.byproduct,
      tailings, leachOk: did.ok, paid: Math.round(after - before), currency: id,
      spentParts: rackBefore - st.casting.rack.length,
    };
  });
  check([rows.coarseBand, rows.coarseTail, rows.fineBand, rows.fineTail],
    ['good', 1, 'fine', 0], ['good', 1, 'good', 1],
    'G — THE MILL: coarse lands in `good` with tailings; FINE lands in `fine` with none');
  // LOAM'S CONVERTED CURRENCY IS BRICK. Dust is the CHIP currency — the
  // Washer's rule is about the converted one, and the first run of this driver
  // asserted the wrong half of the pair.
  check([rows.leachOk, rows.paid, rows.currency], [true, rows.paid, 'brick'], [false, 0, 'x'],
    `G — THE LEACH VAT: ${rows.tailings} tailings leach down to ${rows.paid} ${rows.currency}`);
  check(rows.spentParts, 0, 1,
    'G — and neither spent a cast part: a processing step is a ROW, not a construction event (§37)');

  // ═══ H — THE MACHINES ════════════════════════════════════════════════════
  console.log('\n== H — machines from cast parts, at their wrecks ===============');
  const built = await page.evaluate(async () => {
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const fr = await import(/* @vite-ignore */ '/src/engine/systems/frame' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const e = w['__engine']!;
    const s = e.getState() as unknown as { plant: { builtOf: Record<string, string[]> } };
    return {
      tier: plant.tierOf(e.getState(), 'frame') as number,
      builtOf: (s.plant.builtOf['frame'] ?? []).length,
      station: fr.frameStation(),
      caps: (fr.TIER_CAPABILITY_FRAME as readonly string[]).slice(1),
    };
  });
  check([built.tier, built.builtOf > 0], [3, true], [0, false],
    'H — the Frame stands at tier III, and remembers what it was cast from (§11.2)');
  check([built.caps.length, new Set(built.caps).size], [3, 3], [3, 1],
    'I — three tiers, three DISTINCT sentences');
  for (const c of built.caps) console.log(`        ${c}`);

  // ═══ J — THE CLONE CHECK ═════════════════════════════════════════════════
  console.log('\n== J — the clone check, green and RED-TESTED ===================');
  const clonePage = await browser.newPage({ viewport: { width: W, height: H } });
  await clonePage.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  const clones = await clonePage.evaluate(async () => {
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
  check(clones.found, [], ['x'], `J — zero clones across ${clones.population} materials`);
  check(clones.red, 1, 0, `J — RED-TESTED: a deliberate twin IS caught (${clones.redSays})`);
  await clonePage.close();

  // ═══ K — PILLAR 2 ════════════════════════════════════════════════════════
  console.log('\n== K — dpsMax at the SAME depth, every plant at maximum ========');
  const ceiling = await page.evaluate(async () => {
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as {
      depth: number; shell: { current: string; signatures: string[] };
      pressure: { heat: number }; polarity: { chain: number; bestChain: number };
      hollow: { silence: number }; growth: { stage: number[] };
      plant: { tiers: Record<string, number>; condition: Record<string, unknown> };
      face: { cells: number[] };
    };
    s.shell.current = 'hollow';
    s.shell.signatures = ['growth', 'absence', 'pressure', 'polarity', 'refraction'];
    s.depth = 48;                                   // THE SAME DEPTH IN BOTH ARMS
    s.pressure.heat = 95;
    s.polarity.chain = 40; s.polarity.bestChain = 40;
    s.hollow.silence = 100;
    s.growth.stage = new Array(s.face.cells.length).fill(2);
    const m = new modsMod.ModifierCache(); m.invalidate();
    const live = Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 1e6);
    const grewFlow = Math.round((plant.flowCap(s) as number) * 100) / 100;
    const grewSurge = Math.round((plant.surgeCap(s) as number) * 10) / 10;
    const keep = { tiers: s.plant.tiers, cond: s.plant.condition, sigs: s.shell.signatures };
    s.plant.tiers = {}; s.plant.condition = {};
    s.shell.signatures = [];
    s.pressure.heat = 0; s.polarity.chain = 0; s.polarity.bestChain = 0; s.hollow.silence = 0;
    s.growth.stage = new Array(s.face.cells.length).fill(0);
    m.invalidate();
    const bare = Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 1e6);
    const bareFlow = Math.round((plant.flowCap(s) as number) * 100) / 100;
    s.plant.tiers = keep.tiers; s.plant.condition = keep.cond; s.shell.signatures = keep.sigs;
    return { live, bare, grewFlow, grewSurge, bareFlow };
  });
  check(ceiling.live, ceiling.bare, -1,
    `K — the ceiling at depth 48 is identical bare and with every plant at maximum (${ceiling.live})`);
  console.log(`        ...and the plant really grew: Flow ${ceiling.bareFlow} → ${ceiling.grewFlow}/s, Surge ${ceiling.grewSurge}`);

  // ═══ L — THE PANELS, AT 380px ════════════════════════════════════════════
  console.log('\n== L — the panels, at 380px ===================================');
  await page.evaluate(() => {
    const w = window as unknown as Record<string, { getState: () => { shell: { current: string } } }>;
    w['__engine']!.getState().shell.current = 'hollow';
  });
  await tab(page, 'hollow');
  await dismiss(page);
  await page.waitForTimeout(500);
  const frameEl = page.locator('[data-testid="frame-panel"]').first();
  check((await frameEl.count()) > 0, true, false, 'L — frame-panel is on the screen');
  if ((await frameEl.count()) > 0) {
    const h = await frameEl.evaluate((n) => Math.round(n.getBoundingClientRect().height));
    check(h < 1400, true, false, `L — frame-panel is ${h}px tall, not a wall`);
    await frameEl.screenshot({ path: `${OUT}/a96-frame-panel.png` }).catch(() => {});
  }
  await page.screenshot({ path: `${OUT}/a96-hollow.png`, fullPage: true }).catch(() => {});

  await tab(page, 'kiln');
  await dismiss(page);
  await page.waitForTimeout(500);
  for (const id of ['plant-card', 'mill-row', 'leach-row']) {
    const el = page.locator(`[data-testid="${id}"]`).first();
    const there = (await el.count()) > 0;
    check(there, true, false, `L — ${id} is on the screen`);
    if (!there) continue;
    const h = await el.evaluate((n) => Math.round(n.getBoundingClientRect().height));
    check(h < 1400, true, false, `L — ${id} is ${h}px tall, not a wall`);
    await el.screenshot({ path: `${OUT}/a96-${id}.png` }).catch(() => {});
  }
  // ...AND EVERY ROW IN THE DEMAND PROFILE HAS A NAME. The first run of this
  // driver photographed twenty-three anonymous rows: the panel was never too
  // tall, it was too empty, and only a screenshot could see that.
  const blanks = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('[data-testid^="plant-"]'))) {
      const first = el.querySelector('span');
      if (first && !(first.textContent ?? '').trim()) out.push(el.getAttribute('data-testid') ?? '?');
    }
    return out.slice(0, 6);
  });
  check(blanks, [], ['x'], 'L — every row in the demand profile is named');
  const named = await page.locator('[data-testid="plant-card"]').first().getAttribute('data-plant');
  check(named, 'null', 'hearth', 'L — and the plant card names the NULL, not the Hearth');
  await page.screenshot({ path: `${OUT}/a96-plant.png`, fullPage: true }).catch(() => {});

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
  check(overflow, [], ['x'], 'L — nothing overflows 380px');
  check(errors, [], ['x'], 'L — no page errors');

  await browser.close();
  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  if (problems.length) { for (const p of problems) console.log(`  - ${p}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
