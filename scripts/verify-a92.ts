/**
 * A.92 DRIVEN IN THE REAL GAME — four machines, four first builds.
 *
 *   A  §23's opening, read FIRST on a reset state (the A.90 lesson)
 *   B  each machine raised from CAST PARTS at its own wreck
 *   C  a trait stripped into a VIAL and INFUSED into another stone, with the
 *      source losing it — and the uphill refusal
 *   D  a billet pressed to PLATE, ROD and WIRE, and a worked shape cast that
 *      raw stone is refused for
 *   E  a Hollow machine handing over UNDECIDED material, and that material
 *      WITNESSED into a named one
 *   F  a Hollow machine COMMITTING to a band because somebody looked
 *   G  the Governor OVERCLOCKED, and the off-spec risk LANDING
 *   H  tier I vs II vs III each doing something DIFFERENT, per machine
 *   I  the clone check green, and RED-TESTED in the live module
 *   J  dpsMax unmoved at equal depth with all of it live
 *   K  380px, 0 overflow, 0 page errors
 *
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY — tsx
 * compiles this with esbuild's `keepNames`, which rewrites `const f = () => {}`
 * into `__name(...)`, and `__name` does not exist in the page. It cost two runs
 * at A.90 and one more at A.91, despite the rule being written here first.
 * Every block inlines its repetition or builds helpers with `new Function`.
 *
 *   npx tsx scripts/verify-a92.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a92';
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

/** Stand the player at every wreck, with a deep rack and a full bank. */
const PLANT_SETUP = `
  const s = engine.getState();
  s.shell.breachCount = 6;
  for (const id of ['loam','ferrite','verdance','glassmere','cinder','hollow','aleph']) {
    s.depthRecords[id] = 999;
  }
  s.maxDepthRecord = 999;
  s.kiln.built = true;
  s.kiln.heat = 100;
  s.forge.built = true;
  s.plant = s.plant || {};
  s.plant.surge = 99999;
  s.casting.rack = [];
  for (let i = 0; i < 90; i++) {
    s.casting.rack.push({ id: 20000 + i, type: 'head', materialId: 'marl', purity: 50 });
  }
  s.casting.nextId = 21000;
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
    'A — §23: 36 cells, depth 0, 2.97 dust/sec (headless t=0 is exactly 2.88)');
  await page.screenshot({ path: `${OUT}/a92-opening.png`, fullPage: true }).catch(() => {});

  // ═══ B — FOUR MACHINES, RAISED FROM CAST PARTS ═══════════════════════════
  console.log('\n== B — each machine raised at its own wreck ====================');
  await setup(page, PLANT_SETUP);
  const raised = await page.evaluate(async () => {
    const inf = await import(/* @vite-ignore */ '/src/engine/systems/infuser' + '.ts');
    const pre = await import(/* @vite-ignore */ '/src/engine/systems/press' + '.ts');
    const wit = await import(/* @vite-ignore */ '/src/engine/systems/witness' + '.ts');
    const gov = await import(/* @vite-ignore */ '/src/engine/systems/governor' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    /**
     * A WRECK IS FOUND BY BEING WALKED INTO, NOT BY THE DEPTH RECORD.
     * `markReached` writes `roll.looted` for the shell you are STANDING in, so
     * a depth record of 999 in all seven worlds still leaves every wreck
     * sealed. The driver's first run read five `found: false` for exactly that
     * reason — the setup was a claim about the player, not about the Roll.
     */
    const st0 = e.getState() as unknown as { shell: { current: string } };
    const was = st0.shell.current;
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      st0.shell.current = id;
      roll.markReached(e.getState(), 999, 50);
    }
    st0.shell.current = was;
    const before = (e.getState() as unknown as { casting: { rack: unknown[] } }).casting.rack.length;
    const found = {
      infuser: inf.infuserFound(e.getState()),
      press: pre.pressFound(e.getState()),
      condenser: wit.condenserFound(e.getState()),
      witness: wit.witnessFound(e.getState()),
      governor: gov.governorFound(e.getState()),
    };
    for (const a of ['buildInfuser', 'buildPress', 'buildCondenser', 'buildWitness', 'buildGovernor']) {
      e.dispatch({ type: a });
    }
    const s = e.getState() as unknown as {
      casting: { rack: unknown[] };
      plant: { builtOf: Record<string, string[]> };
    };
    return {
      found,
      tiers: ['infuser', 'press', 'condenser', 'witness', 'governor']
        .map((id) => plant.tierOf(e.getState(), id) as number),
      spent: before - s.casting.rack.length,
      builtOf: ['infuser', 'press', 'condenser', 'witness', 'governor']
        .map((id) => (s.plant.builtOf[id] ?? []).length),
      stations: {
        infuser: inf.infuserStation(),
        press: pre.pressStation(),
        condenser: wit.condenserStation(),
        witness: wit.witnessStation(),
        governor: gov.governorStation(),
      },
    };
  });
  check(Object.values(raised.found), [true, true, true, true, true], [false, false, false, false, false],
    'B — all five wrecks found by a player who walked every shell');
  check(raised.tiers, [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], 'B — five machines standing at tier I');
  check(raised.spent, 10, 0, 'B — ten cast parts spent (two each), off the rack');
  check(raised.builtOf, [2, 2, 2, 2, 2], [0, 0, 0, 0, 0],
    'B — §11.2: each remembers the two parts it was cast from');
  console.log(`        infuser  ${JSON.stringify(raised.stations.infuser)}`);
  console.log(`        press    ${JSON.stringify(raised.stations.press)}`);
  console.log(`        condens. ${JSON.stringify(raised.stations.condenser)}`);
  console.log(`        witness  ${JSON.stringify(raised.stations.witness)}`);
  console.log(`        governor ${JSON.stringify(raised.stations.governor)}`);

  // ═══ C — A TRAIT MOVED ═══════════════════════════════════════════════════
  console.log('\n== C — a trait stripped into a vial and put into another stone ==');
  const moved = await page.evaluate(async () => {
    const inf = await import(/* @vite-ignore */ '/src/engine/systems/infuser' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const traits = await import(/* @vite-ignore */ '/src/engine/traits' + '.ts');
    const traps = await import(/* @vite-ignore */ '/src/engine/content/traps' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    e.dispatch({ type: 'buildStill' }); e.dispatch({ type: 'buildStill' }); e.dispatch({ type: 'buildStill' });
    e.dispatch({ type: 'buildInfuser' });   // tier II: any stone
    forge.addMaterial(e.getState(), 'millstone', 88, 2);
    forge.addMaterial(e.getState(), 'ochre', 88, 1);

    const beforeSrc = [...(traits.traitsOf('millstone') as string[])];
    const beforeTgt = [...(traits.traitsOf('ochre') as string[])];
    e.dispatch({ type: 'distil', materialId: 'millstone', band: 'fine', trait: 'brittle' });
    const stilledIdName = traps.stilledId('millstone', 'brittle') as string;
    const vials = inf.vialsHeld(e.getState()) as { trait: string; fromId: string; count: number }[];
    const vial = vials[0]!;

    /**
     * PICK AN UPHILL TARGET OFF THE REGISTRY, not by name. The first run named
     * `wormsteel`, which is PURE, against a vial drawn out of FLAWLESS
     * millstone — i.e. a downhill pour, correctly allowed, asserted as a
     * refusal. Read the rarity ladder instead of assuming it.
     */
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const order = mats.RARITIES as string[];
    const src = mats.materialDef('millstone') as { rarity: string };
    const dearer = (mats.MATERIALS as { id: string; rarity: string; worked?: boolean; source?: string }[])
      .find((m) => !m.worked && !m.source && order.indexOf(m.rarity) > order.indexOf(src.rarity))!;
    const uphill = inf.infuseBlocker(e.getState(), vial, dearer.id, 'fine') as string | null;
    e.dispatch({ type: 'infuse', vial, materialId: 'ochre', band: 'fine' });
    const into = inf.infusedId('ochre', 'brittle') as string;
    return {
      beforeSrc, beforeTgt,
      stilledTraits: traits.traitsOf(stilledIdName) as string[],
      vial: { trait: vial.trait, fromId: vial.fromId },
      vialsLeft: (inf.vialsHeld(e.getState()) as unknown[]).length,
      intoTraits: traits.traitsOf(into) as string[],
      heldInto: forge.materialCount(e.getState(), into) as number,
      heldOchre: forge.materialCount(e.getState(), 'ochre') as number,
      uphillSaysDownhill: (uphill ?? '').includes('downhill'),
    };
  });
  check(moved.stilledTraits, moved.beforeSrc.filter((t) => t !== 'brittle'), moved.beforeSrc,
    'C — THE SOURCE LOSES IT: the stilled stone is millstone minus `brittle`');
  check([moved.vial.trait, moved.vial.fromId], ['brittle', 'millstone'], ['', ''],
    'C — the vial carries the trait AND remembers the stone it came out of');
  check(moved.intoTraits, [...moved.beforeTgt, 'brittle'], moved.beforeTgt,
    'C — THE TARGET GAINS IT: ochre + brittle');
  check([moved.heldInto, moved.heldOchre, moved.vialsLeft], [1, 0, 0], [0, 1, 1],
    'C — one unit in, one unit out, and the vial is spent');
  check(moved.uphillSaysDownhill, true, false,
    'C — a common vial into a pure stone is refused: essence runs downhill');

  // ═══ D — THE PRESS ═══════════════════════════════════════════════════════
  console.log('\n== D — a billet pressed to plate, rod and wire =================');
  const pressed = await page.evaluate(async () => {
    const pre = await import(/* @vite-ignore */ '/src/engine/systems/press' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const casting = await import(/* @vite-ignore */ '/src/engine/systems/casting' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    e.dispatch({ type: 'buildPress' }); e.dispatch({ type: 'buildPress' });  // -> tier III
    forge.addMaterial(e.getState(), 'marl', 90, 20);
    const before = forge.materialCount(e.getState(), 'marl') as number;
    for (const f of ['plate', 'rod', 'wire']) {
      e.dispatch({ type: 'press', materialId: 'marl', band: 'fine', form: f });
    }
    // MEASURED HERE, not at the end of the block: the second half of this
    // evaluate adds twenty more units and presses twice more, and reading
    // `spent` afterwards produced a NEGATIVE number on the first run.
    const spent = before - (forge.materialCount(e.getState(), 'marl') as number);
    const held = (pre.stockHeld(e.getState()) as { id: string; form: string; count: number }[])
      .map((s) => s.form).sort();

    // A worked shape, poured from RAW stone: refused, by name.
    const s = e.getState() as unknown as { casting: { crucible: { queue: { molten: number; solid: number }[] } } };
    casting.chargeCrucible(e.getState(), { emit() {}, dirty() {} }, 'marl', 8);
    s.casting.crucible.queue[0]!.molten = 80; s.casting.crucible.queue[0]!.solid = 0;
    const raw = casting.castPart(e.getState(), { emit() {}, dirty() {} }, 'core', 'rolled') as { ok: boolean; reason?: string };
    // ...and the same shape with PLATE in the tub.
    s.casting.crucible.queue.length = 0;
    forge.addMaterial(e.getState(), 'marl', 90, 20);
    e.dispatch({ type: 'press', materialId: 'marl', band: 'fine', form: 'plate' });
    e.dispatch({ type: 'press', materialId: 'marl', band: 'fine', form: 'plate' });
    casting.chargeCrucible(e.getState(), { emit() {}, dirty() {} }, pre.stockId('marl', 'plate'), 2);
    s.casting.crucible.queue[0]!.molten = 80; s.casting.crucible.queue[0]!.solid = 0;
    const rackBefore = (e.getState() as unknown as { casting: { rack: unknown[] } }).casting.rack.length;
    const worked = casting.castPart(e.getState(), { emit() {}, dirty() {} }, 'core', 'rolled') as { ok: boolean; reason?: string };
    const rack = (e.getState() as unknown as { casting: { rack: { shape?: string }[] } }).casting.rack;
    return {
      held,
      spent,
      rawOk: raw.ok, rawSaysPoured: (raw.reason ?? '').includes('cannot be poured'),
      workedOk: worked.ok,
      newPart: rack.length - rackBefore,
      shape: rack.at(-1)?.shape ?? null,
    };
  });
  check(pressed.held, ['plate', 'rod', 'wire'], [], 'D — all three forms drawn from one stone');
  check(pressed.spent, 6, 0, 'D — six units in for three units of stock: two per billet, strictly lossy');
  check([pressed.rawOk, pressed.rawSaysPoured], [false, true], [true, false],
    'D — a Rolled core CANNOT be poured from raw stone, and the refusal says why');
  check([pressed.workedOk, pressed.newPart, pressed.shape], [true, 1, 'rolled'], [false, 0, null],
    'D — ...and it casts the moment plate is in the tub');

  // ═══ E — UNDECIDED, THEN WITNESSED ═══════════════════════════════════════
  console.log('\n== E — an unwatched machine, and the naming of what it made ====');
  const named = await page.evaluate(async () => {
    const cond = await import(/* @vite-ignore */ '/src/engine/systems/condition' + '.ts');
    const wit = await import(/* @vite-ignore */ '/src/engine/systems/witness' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const casting = await import(/* @vite-ignore */ '/src/engine/systems/casting' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    e.dispatch({ type: 'buildWitness' }); e.dispatch({ type: 'buildWitness' });  // tier III
    e.dispatch({ type: 'buildCondenser' });

    // The world writes UNDECIDED onto the Still, and residue accrues from it.
    cond.ensureCondition(e.getState())['still'] = { id: 'undecided', level: 1 };
    wit.tickResidue(e.getState(), 600);
    const residue = (wit.ensureWitness(e.getState()) as { residue: number }).residue;
    e.dispatch({ type: 'condense' });
    const hush = (wit.ensureWitness(e.getState()) as { hush: number }).hush;

    // ...and what that Still makes arrives as a MAYBE. The tub is DRAINED
    // first: block D left plate in it, and a full tub refuses everything for a
    // reason that has nothing to do with the rule under test.
    (e.getState() as unknown as { casting: { crucible: { queue: unknown[] } } })
      .casting.crucible.queue.length = 0;
    forge.addMaterial(e.getState(), 'millstone', 88, 1);
    const r = e.dispatch({ type: 'distil', materialId: 'millstone', band: 'fine', trait: 'brittle' }) as
      { ok: boolean; data?: { into: string } };
    const got = r.data?.into ?? '';
    const tub = casting.chargeCrucible(e.getState(), { emit() {}, dirty() {} }, got, 1) as
      { ok: boolean; reason?: string };

    const was = wit.wasGoingToBe(got) as string | null;
    const options = wit.couldBe(e.getState(), got) as string[];
    const before = forge.materialCount(e.getState(), was ?? '') as number;
    const wr = e.dispatch({ type: 'witness', materialId: got, band: 'fine', into: was }) as { ok: boolean; reason?: string };
    return {
      residue: Math.round(residue * 10) / 10,
      hush: Math.round(hush * 10) / 10,
      got, isMaybe: wit.isMaybe(got) as boolean,
      tubOk: tub.ok, tubSays: (tub.reason ?? '').includes('has not decided'),
      was, options: options.length,
      wrOk: wr.ok, wrReason: wr.reason ?? '',
      maybesLeft: forge.materialCount(e.getState(), got) as number,
      gained: (forge.materialCount(e.getState(), was ?? '') as number) - before,
      hushLeft: Math.round((wit.ensureWitness(e.getState()) as { hush: number }).hush * 10) / 10,
    };
  });
  // The Condenser reached TIER II here (block B raised it once, this block
  // again), so it condenses on its own and residue reads zero by design — the
  // first run asserted 30 residue and was reading the tier-II capability.
  check([named.residue, named.hush], [0, 12], [0, 0],
    'E — ten minutes of one unwatched machine: 30 residue, auto-condensed to 12 Hush at 40%');
  check(named.isMaybe, true, false, 'E — the Still\'s output arrived UNDECIDED');
  check([named.tubOk, named.tubSays], [false, true], [true, false],
    'E — and a maybe is not stock: the tub refuses it by name');
  check([named.wrOk, named.maybesLeft, named.gained, named.hushLeft], [true, 0, 1, 8], [false, 1, 0, 12],
    'E — WITNESSED: one maybe out, one named stone in, four Hush spent');
  console.log(`        it was going to be ${named.was}; a tier-III Witness offered ${named.options} names`);

  // ═══ F — THE PLANT, LOOKED AT ═══════════════════════════════════════════
  console.log('\n== F — a Hollow machine committing because somebody looked =====');
  const looked = await page.evaluate(async () => {
    const cond = await import(/* @vite-ignore */ '/src/engine/systems/condition' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const e = w['__engine']!;
    const s = e.getState() as unknown as { plant: { tiers: Record<string, number> } };
    s.plant.tiers['refinery'] = 2;                    // a tier-II machine: retains the band
    const clean = plant.retainsBand(e.getState(), 'refinery') as boolean;
    cond.ensureCondition(e.getState())['refinery'] = { id: 'undecided', level: 1 };
    const undecided = plant.retainsBand(e.getState(), 'refinery') as boolean;
    const settled = cond.observePlant(e.getState()) as number;      // somebody looks
    return { clean, undecided, after: plant.retainsBand(e.getState(), 'refinery') as boolean, settled };
  });
  check([looked.clean, looked.undecided, looked.after], [true, false, true], [true, true, true],
    'F — a tier-II machine will not commit while unwatched, and does the moment it is seen');
  check(looked.settled >= 1, true, false, 'F — ...and looking is what settled it');

  // ═══ G — THE GOVERNOR ════════════════════════════════════════════════════
  console.log('\n== G — overclocked, and the off-spec risk landing ==============');
  const gov = await page.evaluate(async () => {
    const g = await import(/* @vite-ignore */ '/src/engine/systems/governor' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const wit = await import(/* @vite-ignore */ '/src/engine/systems/witness' + '.ts');
    const cond = await import(/* @vite-ignore */ '/src/engine/systems/condition' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    e.dispatch({ type: 'buildGovernor' });     // -> tier II, the whole plant
    const s = e.getState() as unknown as {
      plant: { condition: Record<string, unknown> }; kiln: { heat: number; feeding: boolean };
    };
    delete s.plant.condition['still'];         // stop it being undecided for this block
    /**
     * A REALISTIC HEARTH. The driver's setup runs the Kiln at heat 100, which
     * is a Flow cap of ~252 against a plant that wants ~15 — so nothing is ever
     * contended and the first run read the Kiln at 1.000 both sides. Contention
     * is the half of this machine that makes it a decision, so it has to be
     * measured on a plant that has to choose.
     */
    s.kiln.heat = 0;
    s.kiln.feeding = true;

    const kilnBefore = Math.round((plant.flowSatisfaction(e.getState(), 'kiln') as number) * 1000) / 1000;
    const r = e.dispatch({ type: 'setOverclock', machineId: 'still', steps: 3 }) as { ok: boolean };
    const kilnAfter = Math.round((plant.flowSatisfaction(e.getState(), 'kiln') as number) * 1000) / 1000;
    const speed = Math.round((cond.machineSpeed(e.getState(), 'still') as number) * 100) / 100;
    const draw = Math.round((g.overclockDraw(e.getState(), 'still') as number) * 100) / 100;
    const chance = Math.round((g.offSpecChance(e.getState(), 'still') as number) * 100) / 100;

    // THE RISK LANDS: an RNG that always fires, through the delivery seam.
    const always = new Function('return function () { return 0; };')() as () => number;
    const spoiled = wit.deliver(e.getState(), 'still', 'ochre', 90, 1, always) as string;
    const st = e.getState() as unknown as { materials: { stacks: Record<string, Record<string, unknown>> } };
    const bands = Object.keys(st.materials.stacks[spoiled] ?? {});
    return {
      ok: r.ok, kilnBefore, kilnAfter, speed, draw, chance,
      bands,
      offSpec: (g.ensureGovernor(e.getState()) as { offSpec: number; lastOffSpec?: string }).offSpec,
      last: (g.ensureGovernor(e.getState()) as { lastOffSpec?: string }).lastOffSpec ?? '',
    };
  });
  check([gov.ok, gov.speed, gov.draw, gov.chance], [true, 2.05, 2.8, 0.45], [false, 1, 1, 0],
    'G — three steps: converts x2.05, takes x2.80, 45% comes off spoiled');
  check(gov.kilnAfter < gov.kilnBefore, true, false,
    `G — THE PRICE IS CONTENDED: the Kiln fell ${gov.kilnBefore} -> ${gov.kilnAfter} because the Still was pushed`);
  check([gov.bands, gov.offSpec, gov.last], [['good'], 1, 'still'], [['fine'], 0, ''],
    'G — THE RISK LANDS: a Fine unit arrived Good, counted, and named its machine');

  // ═══ H — TIER I vs II vs III ═════════════════════════════════════════════
  console.log('\n== H — every tier a different sentence, not a bigger number ====');
  const tiers = await page.evaluate(async () => {
    const inf = await import(/* @vite-ignore */ '/src/engine/systems/infuser' + '.ts');
    const pre = await import(/* @vite-ignore */ '/src/engine/systems/press' + '.ts');
    const wit = await import(/* @vite-ignore */ '/src/engine/systems/witness' + '.ts');
    const g = await import(/* @vite-ignore */ '/src/engine/systems/governor' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const e = w['__engine']!;
    const s = e.getState() as unknown as { plant: { tiers: Record<string, number> } };
    const rows: Record<string, unknown[]> = {};
    // INFUSER: how many traits a stone may end up carrying.
    rows['infuser'] = [1, 2, 3].map((t) => { s.plant.tiers['infuser'] = t; return inf.traitCeiling(e.getState(), 'marl'); });
    // PRESS: which forms it can draw.
    rows['press'] = [1, 2, 3].map((t) => { s.plant.tiers['press'] = t; return (pre.formsAvailable(e.getState()) as unknown[]).length; });
    // CONDENSER: by hand / on its own / every condition.
    rows['condenser'] = [1, 2, 3].map((t) => {
      s.plant.tiers['condenser'] = t;
      return [wit.condensesItself(e.getState()), wit.readsEveryCondition(e.getState())];
    });
    // WITNESS: what it can name a maybe as.
    wit.registerMaybe('ochre');
    rows['witness'] = [1, 2, 3].map((t) => { s.plant.tiers['witness'] = t; return (wit.couldBe(e.getState(), wit.maybeId('ochre')) as unknown[]).length; });
    // GOVERNOR: how many machines, and whether it regulates.
    rows['governor'] = [1, 2, 3].map((t) => {
      s.plant.tiers['governor'] = t;
      return [g.machineLimit(e.getState()) === Infinity ? 'all' : g.machineLimit(e.getState()), g.regulates(e.getState())];
    });
    return rows;
  });
  for (const [id, row] of Object.entries(tiers)) {
    const distinct = new Set(row.map((x) => JSON.stringify(x))).size;
    check(distinct, 3, 1, `H — ${id}: I/II/III are three different things  ${JSON.stringify(row)}`);
  }

  // ═══ I — THE CLONE CHECK ═════════════════════════════════════════════════
  console.log('\n== I — the clone check, green and RED-TESTED ===================');
  const clones = await page.evaluate(async () => {
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const traits = await import(/* @vite-ignore */ '/src/engine/traits' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cfp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const inf = await import(/* @vite-ignore */ '/src/engine/systems/infuser' + '.ts');
    // Every reachable infusion, minted: the space this pass opened.
    let minted = 0;
    for (const m of (mats.MATERIALS as { id: string; worked?: boolean; source?: string }[]).slice()) {
      if (m.worked || m.source) continue;
      for (const t of Object.keys(traits.TRAITS as Record<string, unknown>)) {
        if ((traits.traitsOf(m.id) as string[]).includes(t)) continue;
        if ((traits.traitsOf(m.id) as string[]).length >= 4) continue;
        const got = inf.registerInfusedForm(m.id, t) as { source?: string } | null;
        if (got?.source === 'infused') minted += 1;
      }
    }
    const key = new Function('fp', 'cfp', 'return function (id) { return cfp.TOOL_STATS.map(function (s) { return fp.derivePart(fp.makePart("head", id, 60)).stats[s].toFixed(3); }).join("|"); };')(fp, cfp) as (id: string) => string;
    const seen = new Map<string, string>();
    const found: string[] = [];
    for (const m of mats.MATERIALS as { id: string; name: string; worked?: boolean; source?: string }[]) {
      if (m.worked || m.source === 'combat') continue;
      const k = key(m.id);
      if (seen.has(k)) found.push(`${m.name} = ${seen.get(k)}`);
      else seen.set(k, m.name);
    }
    // RED-TEST: register a twin deliberately, bypassing `stoneLike`.
    const src = (mats.MATERIALS as { id: string; name: string; shellId: string; rarity: string; palette: unknown; facets: number; shimmer: string }[])
      .find((m) => m.id === 'marl')!;
    mats.registerMaterial({ ...src, id: '__twin__', name: 'Twin Marl' });
    (traits.MATERIAL_TRAITS as Record<string, unknown>)['__twin__'] = [...(traits.traitsOf('marl') as string[])];
    const redSeen = new Map<string, string>();
    const red: string[] = [];
    for (const m of mats.MATERIALS as { id: string; name: string; worked?: boolean; source?: string }[]) {
      if (m.worked || m.source === 'combat') continue;
      const k = key(m.id);
      if (redSeen.has(k)) red.push(`${m.name} = ${redSeen.get(k)}`);
      else redSeen.set(k, m.name);
    }
    return { minted, population: seen.size, found, red: red.length, redSays: red[0] ?? '' };
  });
  check(clones.found, [], ['x'], `I — zero clones across ${clones.population} materials (${clones.minted} infusions minted)`);
  check(clones.red, 1, 0, `I — RED-TESTED: a deliberate twin IS caught (${clones.redSays})`);

  // ═══ J — PILLAR 2 ════════════════════════════════════════════════════════
  console.log('\n== J — dpsMax at the SAME depth, with all of it live ===========');
  const ceiling = await page.evaluate(async () => {
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number };
    s.depth = 48;                                  // THE SAME DEPTH IN BOTH ARMS
    const m = new modsMod.ModifierCache(); m.invalidate();
    return Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 1e6);
  });
  const bare = await page.evaluate(async () => {
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as {
      depth: number; plant: { tiers: Record<string, number>; condition: Record<string, unknown> };
      governor?: unknown; witness?: unknown; essence?: unknown;
    };
    s.depth = 48;
    // STRIPPED AND PUT BACK. Block K runs after this and needs the four
    // machines still standing; the first version wiped them and read four
    // panels as absent, which is the same harness-vs-game confusion this file
    // exists to avoid.
    const keep = {
      tiers: s.plant.tiers, condition: s.plant.condition,
      governor: s.governor, witness: s.witness, essence: s.essence,
    };
    s.plant.tiers = {};
    s.plant.condition = {};
    delete s.governor; delete s.witness; delete s.essence;
    const m = new modsMod.ModifierCache(); m.invalidate();
    const out = Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 1e6);
    s.plant.tiers = keep.tiers; s.plant.condition = keep.condition;
    s.governor = keep.governor; s.witness = keep.witness; s.essence = keep.essence;
    return out;
  });
  check(ceiling, bare, -1, `J — the ceiling at depth 48 is identical bare and with all four machines (${ceiling})`);

  // ═══ K — THE PANELS, AT 380px ════════════════════════════════════════════
  console.log('\n== K — the panels, at 380px ===================================');
  // THE PLANT CLUSTER LIVES IN THE KILN ROOM — `panels.tsx` renders it inside
  // `KilnPanel`, because §3.2's Hearth IS the Kiln. There is no 'plant' tab and
  // the driver's first run asked for one, so four panels read as absent.
  await tab(page, 'kiln');
  await dismiss(page);
  await page.waitForTimeout(500);
  for (const id of ['infuser-panel', 'press-panel', 'witness-panel', 'governor-panel']) {
    const el = page.locator(`[data-testid="${id}"]`).first();
    const there = (await el.count()) > 0;
    check(there, true, false, `K — ${id} is on the screen`);
    if (there) await el.screenshot({ path: `${OUT}/a92-${id}.png` }).catch(() => {});
  }
  await page.screenshot({ path: `${OUT}/a92-plant.png`, fullPage: true }).catch(() => {});
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
