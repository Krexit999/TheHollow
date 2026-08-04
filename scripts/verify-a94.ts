/**
 * A.94 DRIVEN IN THE REAL GAME — the bench's missing rule, a dead gate, two
 * machines.
 *
 *   A  §23's opening, read FIRST on a reset state
 *   B  THE REACTION BENCH: the measurement, the catalyst, and what it costs
 *   C  THE STEELCASTING GATE: made through the real route, and the gate opened
 *   D  the LAPIDARY raised at THE LENSWORK, a gem cut, the row reading through
 *   E  a rune sequence where ADJACENCY changes the result
 *   F  the QUENCH TANK raised at THE SLAKE, a part treated in a real medium
 *   G  tier I vs II vs III each doing something DIFFERENT, per machine
 *   H  producerless materials at 0, and the clone check RED-TESTED
 *   I  dpsMax unmoved at equal depth with all of it live
 *   J  380px, 0 overflow, 0 page errors
 *
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY — tsx
 * compiles this with esbuild's `keepNames`, which rewrites `const f = () => {}`
 * into `__name(...)`, and `__name` does not exist in the page. It has cost four
 * runs across A.90–A.93.
 *
 * A WRECK IS FOUND BY BEING WALKED INTO, not by the depth record.
 *
 *   npx tsx scripts/verify-a94.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a94';
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
  await page.screenshot({ path: `${OUT}/a94-opening.png`, fullPage: true }).catch(() => {});

  // ═══ B — THE REACTION BENCH ══════════════════════════════════════════════
  console.log('\n== B — the bench: the measurement, then the catalyst ===========');
  await setup(page, PLANT_SETUP);
  const bench = await page.evaluate(async () => {
    const ref = await import(/* @vite-ignore */ '/src/engine/systems/refinery' + '.ts');
    const rx = await import(/* @vite-ignore */ '/src/engine/systems/reaction' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const traits = await import(/* @vite-ignore */ '/src/engine/traits' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const chains = ref.CHAINS as { id: string; a: string; b: string; out: string; cost: number; yield?: number }[];

    // THE MEASUREMENT: how much of §17's heuristic was true.
    let shares = 0, opposed = 0, strangers = 0;
    for (const c of chains) {
      const k = rx.pairClass(c.a, c.b) as string;
      if (k === 'shares') shares += 1; else if (k === 'opposed') opposed += 1; else strangers += 1;
    }

    // AN OPPOSED PAIR, POURED THREE WAYS.
    const s = e.getState() as unknown as { shell: { current: string }; materials: { stacks: Record<string, unknown> } };
    s.shell.current = 'ferrite';
    const chain = chains.find((c) => c.id === 'bonemeal')!;
    forge.addMaterial(e.getState(), chain.a, 60, 40);
    forge.addMaterial(e.getState(), chain.b, 60, 40);
    const cls = rx.pairClass(chain.a, chain.b) as string;
    const axis = rx.opposedAxis(chain.a, chain.b) as string;

    // 1. no catalyst — refused, and nothing spent.
    const heldA = forge.materialCount(e.getState(), chain.a) as number;
    const bare = e.dispatch({ type: 'transmute', a: chain.a, b: chain.b }) as { ok: boolean; reason?: string };
    const untouched = (forge.materialCount(e.getState(), chain.a) as number) === heldA;

    // 2. a stone that does NOT bridge — refused too.
    const dud = (traits.MATERIAL_TRAITS as Record<string, string[]>);
    void dud;
    /**
     * NOT THE SLAG. `allBridges` returns registry order and `refineslag`
     * (dense+brittle) genuinely bridges bonechalk and graveclay — but every
     * pour GRANTS slag, so a slag catalyst reads as "spent −1" no matter what
     * the machine did. The first run of this driver failed on exactly that and
     * it was the instrument, not the engine.
     */
    const bridges = (rx.allBridges(chain.a, chain.b) as string[]).filter((id) => id !== ref.SLAG_MATERIAL);
    const cat = bridges[0]!;
    forge.addMaterial(e.getState(), cat, 60, 4);
    const notABridge = 'ochre';
    const wrong = e.dispatch({ type: 'transmute', a: chain.a, b: chain.b, catalyst: notABridge }) as { ok: boolean };

    // 3. with the go-between — it goes, heavier, and the catalyst COMES BACK.
    const catBefore = forge.materialCount(e.getState(), cat) as number;
    const outBefore = forge.materialCount(e.getState(), chain.out) as number;
    const hit = e.dispatch({ type: 'transmute', a: chain.a, b: chain.b, catalyst: cat }) as
      { ok: boolean; data?: { units: number; violent: boolean } };
    const catAfter = forge.materialCount(e.getState(), cat) as number;
    const madeUnits = (forge.materialCount(e.getState(), chain.out) as number) - outBefore;

    // 4. A MISS EATS IT. Two stones with no chain between them.
    forge.addMaterial(e.getState(), 'ochre', 60, 20);
    forge.addMaterial(e.getState(), 'rimeiron', 60, 20);
    const missBridges = (rx.allBridges('ochre', 'rimeiron') as string[]).filter((id) => id !== ref.SLAG_MATERIAL);
    const missCat = missBridges[0]!;
    forge.addMaterial(e.getState(), missCat, 60, 4);
    const missBefore = forge.materialCount(e.getState(), missCat) as number;
    const miss = e.dispatch({ type: 'transmute', a: 'ochre', b: 'rimeiron', catalyst: missCat }) as
      { ok: boolean; data?: { found: string | null; catalystSpent: boolean } };
    const missAfter = forge.materialCount(e.getState(), missCat) as number;

    // THE READING says which class before anything is spent, and names no output.
    const read = ref.benchReading(e.getState(), chain.a, chain.b, null) as
      { klass: string; catalyst: { needed: boolean; ok: boolean; line: string } };
    return {
      total: chains.length, shares, opposed, strangers,
      cls, axis,
      bareOk: bare.ok, bareSays: (bare.reason ?? '').slice(0, 60), untouched,
      wrongOk: wrong.ok,
      hitOk: hit.ok, violent: hit.data?.violent ?? false, units: madeUnits,
      catKept: catAfter === catBefore,
      // `?? ` WOULD TURN THE ANSWER INTO THE FAILURE: a miss returns found:null,
      // and null is nullish. Ask whether the pour landed instead.
      missFound: miss.ok && miss.data != null && miss.data.found === null, missAte: missBefore - missAfter,
      readClass: read.klass, needed: read.catalyst.needed, readOk: read.catalyst.ok,
      namesOutput: read.catalyst.line.toLowerCase().includes('binding'),
      opposedPairs: (traits.opposedPairs() as unknown[]).length,
    };
  });
  check([bench.total, bench.shares, bench.opposed + bench.strangers], [29, 16, 13], [0, 0, 0],
    `B — §17's heuristic was 45% FALSE: ${bench.shares}/${bench.total} share a trait, ${bench.opposed + bench.strangers} do not`);
  check(bench.opposedPairs, 15, 0, 'B — opposition DERIVED from the factor table: 15 pairs, 0 authored');
  check([bench.cls, bench.bareOk, bench.untouched], ['opposed', false, true], ['shares', true, false],
    `B — an OPPOSED pair (${bench.axis}) refuses without a catalyst, and nothing is spent`);
  check(bench.wrongOk, false, true, 'B — a stone that bridges only one side is refused too');
  check([bench.hitOk, bench.violent, bench.units, bench.catKept], [true, true, 2, true], [false, false, 1, false],
    'B — with the go-between it goes VIOLENTLY (2 out, not 1) and the catalyst comes back');
  check([bench.missFound, bench.missAte], [true, 1], [false, 0],
    'B — §17 verbatim: a MISS is what eats the catalyst');
  check([bench.readClass, bench.needed, bench.readOk, bench.namesOutput],
    ['opposed', true, false, false], ['shares', false, true, true],
    'B — the reading names the CLASS before any spend, and never the output (LAW 3)');
  console.log(`        "${bench.bareSays}"`);

  // ═══ C — THE STEELCASTING GATE ═══════════════════════════════════════════
  console.log('\n== C — the gate: a casting MADE, not granted ===================');
  const gate = await page.evaluate(async () => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const cen = await import(/* @vite-ignore */ '/src/engine/systems/centrifuge' + '.ts');
    const key = await import(/* @vite-ignore */ '/src/engine/systems/keystones' + '.ts');
    const breach = await import(/* @vite-ignore */ '/src/engine/systems/breach' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const splits = await import(/* @vite-ignore */ '/src/engine/content/splits' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as {
      shell: { current: string; breachCount: number }; depth: number;
      keystones: { placed: string[] }; currencies: Record<string, unknown>;
      materials: { stacks: Record<string, unknown> };
    };
    // Walk every shell so the wrecks are LOOTED, not merely deep.
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      st.shell.current = id;
      roll.markReached(e.getState(), 999, 50);
    }
    st.shell.current = 'ferrite';
    st.depth = 250;
    st.keystones.placed = [];
    delete st.materials.stacks['steelcasting'];
    const shut = breach.canBreach(e.getState()) as boolean;
    const def = key.keystoneFor('ferrite') as { craft: { source: string; materials: { id: string; count: number }[] } };

    e.dispatch({ type: 'buildCentrifuge' });
    const built = cen.centrifugeBuilt(e.getState()) as boolean;
    const split = (splits.SPLITS as { from: string; units: number; out: string[] }[])
      .find((s) => s.out[0] === 'steelcasting')!;
    forge.addMaterial(e.getState(), split.from, 70, split.units);
    const band = Object.keys((e.getState() as unknown as { materials: { stacks: Record<string, object> } })
      .materials.stacks[split.from]!)[0]!;
    const spun = e.dispatch({ type: 'spin', materialId: split.from, band }) as { ok: boolean };
    const made = forge.materialCount(e.getState(), 'steelcasting') as number;

    const cur = e.getState() as unknown as { currencies: Record<string, { add: (n: number) => unknown }> };
    const D = (await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts')).D;
    cur.currencies['scale'] = D(50);
    const placed = e.dispatch({ type: 'placeKeystone', leg: 'craft' }) as { ok: boolean; reason?: string };
    return {
      shut, source: def.craft.source, wants: def.craft.materials[0]!.id,
      built, spinOk: spun.ok, made,
      placedOk: placed.ok, placedSays: (placed.reason ?? '').slice(0, 50),
      open: breach.canBreach(e.getState()) as boolean,
      station: cen.centrifugeStation(),
    };
  });
  check([gate.shut, gate.wants], [false, 'steelcasting'], [true, 'x'],
    'C — the Ferrite floor is SHUT, and the craft leg wants one steelcasting');
  check(gate.source.includes('Centrifuge'), true, false,
    `C — and the refusal now names the machine that makes it: "${gate.source}"`);
  check([gate.built, gate.spinOk, gate.made], [true, true, 1], [false, false, 0],
    'C — a Centrifuge stood at The Long Spin splits Ferrite ore INTO one');
  check([gate.placedOk, gate.open], [true, true], [false, false],
    'C — the Cast Anchor is placed and the floor opens (dead from A.40 to A.93)');

  // ═══ D — THE LAPIDARY ════════════════════════════════════════════════════
  console.log('\n== D — the Lapidary at THE LENSWORK, and the row it unblocks ===');
  const lap = await page.evaluate(async () => {
    const lapid = await import(/* @vite-ignore */ '/src/engine/systems/lapidary' + '.ts');
    const sock = await import(/* @vite-ignore */ '/src/engine/systems/toolSockets' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const cfp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const shells = await import(/* @vite-ignore */ '/src/engine/shells' + '.ts');
    const D = (await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts')).D;
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as {
      shell: { current: string }; casting: { tool: unknown[]; sockets: unknown[]; rack: unknown[] };
      materials: { gems: Record<string, number> }; currencies: Record<string, unknown>;
    };
    st.shell.current = 'glassmere';
    const found = lapid.lapidaryFound(e.getState()) as boolean;
    const rackBefore = st.casting.rack.length;
    e.dispatch({ type: 'buildLapidary' });
    const tier = plant.tierOf(e.getState(), 'lapidary') as number;
    const spent = rackBefore - st.casting.rack.length;

    // A tool with a DEEP sockets stone, so the row has a middle.
    st.casting.tool = (cfp.PART_TYPES as string[]).map((t, i) => ({
      ...(fp.makePart(t, t === 'sockets' ? 'voidstar' : 'marl', 60) as object), id: i + 1,
    }));
    st.casting.sockets = [
      { kind: 'rune', id: 'kel' }, { kind: 'gem', id: 'bloodgarnet' }, { kind: 'rune', id: 'thur' },
      null, null,
    ];
    const uncut = sock.socketRunePairs(e.getState()) as string[];

    st.materials.gems['bloodgarnet'] = 6;
    st.currencies[shells.convCurrencyId(e.getState()) as string] = D(100000);
    const cut = e.dispatch({ type: 'cutGem', gemId: 'bloodgarnet', shape: 'table' }) as { ok: boolean; reason?: string };
    const after = sock.socketRunePairs(e.getState()) as string[];
    const gemsLeft = st.materials.gems['bloodgarnet'];
    return {
      found, tier, spent, station: lapid.lapidaryStation(),
      sockets: (sock.socketRow(e.getState()) as unknown[]).length,
      uncutHasPair: uncut.includes('kel|thur'),
      cutOk: cut.ok, cutSays: (cut.reason ?? '').slice(0, 50),
      cutHasPair: after.includes('kel|thur'),
      gemsLeft,
      shapes: (lapid.shapesAvailable(e.getState()) as { id: string }[]).map((c) => c.id),
    };
  });
  check([lap.found, lap.tier, lap.spent], [true, 1, 2], [false, 0, 0],
    `D — THE LENSWORK ${JSON.stringify(lap.station)} — authored long before, never claimed`);
  check([lap.sockets, lap.uncutHasPair], [5, false], [0, true],
    'D — THE FINDING: an UNCUT gem between two runes eats their pair, silently');
  check([lap.cutOk, lap.cutHasPair, lap.gemsLeft], [true, true, 5], [false, false, 6],
    'D — a TABLE cut and the row reads through it (and one stone was ground away)');
  check(lap.shapes, ['table'], ['table', 'star', 'water'],
    'D — a tier-I wheel grinds one shape, not three');

  // ═══ E — ADJACENCY ═══════════════════════════════════════════════════════
  console.log('\n== E — a rune sequence where adjacency changes the result ======');
  const runes = await page.evaluate(async () => {
    const r = await import(/* @vite-ignore */ '/src/engine/content/shell4/runes' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as { runes: { found: Record<string, number>; inscriptions: Record<string, unknown>; pairsSeen: string[] } };
    st.runes.found['kel'] = 4; st.runes.found['thur'] = 4;
    st.runes.inscriptions = {}; st.runes.pairsSeen = [];
    const one = e.dispatch({ type: 'inscribe', target: 'tool', sequence: ['kel', 'thur', null] }) as { ok: boolean };
    const seenA = [...st.runes.pairsSeen];
    const two = e.dispatch({ type: 'inscribe', target: 'tool', sequence: ['thur', 'kel', null] }) as { ok: boolean };
    const seenB = st.runes.pairsSeen.filter((p) => !seenA.includes(p));
    const P = r.RUNE_PAIRS as Record<string, { bucket: string; name: string }>;
    return {
      ok: one.ok && two.ok,
      forward: seenA[0] ?? '', back: seenB[0] ?? '',
      buckets: [P['kel|thur']!.bucket, P['thur|kel']!.bucket],
      names: [P['kel|thur']!.name, P['thur|kel']!.name],
    };
  });
  check([runes.ok, runes.forward, runes.back], [true, 'kel|thur', 'thur|kel'], [false, '', ''],
    'E — INSCRIPTION is a live verb, and the two orders are two different pairs');
  check(runes.buckets[0] === runes.buckets[1], false, true,
    `E — and they do different things: ${runes.names[0]} (${runes.buckets[0]}) vs ${runes.names[1]} (${runes.buckets[1]})`);
  console.log('        §13 wants a RUNE BENCH for this. It is built, it has a panel, and');
  console.log('        the socket row reads the same alphabet — so no machine was added.');

  // ═══ F — THE QUENCH TANK ═════════════════════════════════════════════════
  console.log('\n== F — the Quench Tank at THE SLAKE, treating a real part ======');
  const quench = await page.evaluate(async () => {
    const q = await import(/* @vite-ignore */ '/src/engine/systems/quench' + '.ts');
    const tm = await import(/* @vite-ignore */ '/src/engine/systems/toolMods' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const inf = await import(/* @vite-ignore */ '/src/engine/systems/infuser' + '.ts');
    const tmp = await import(/* @vite-ignore */ '/src/engine/systems/tempering' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => unknown }>;
    const e = w['__engine']!;
    const st = e.getState() as unknown as {
      shell: { current: string }; casting: { tool: { id: number; materialId: string; quench?: string }[] };
    };
    st.shell.current = 'cinder';
    const found = q.quenchFound(e.getState()) as boolean;
    e.dispatch({ type: 'buildQuenchTank' });
    const tier1 = plant.tierOf(e.getState(), 'quench') as number;

    forge.addMaterial(e.getState(), 'temperash', 60, 40);
    for (const t of tmp.TEMPERS as { medium: string; mediumCost: number }[]) {
      if (t.mediumCost > 0) forge.addMaterial(e.getState(), t.medium, 60, 20);
    }
    const seated = st.casting.tool[0]!;
    const media = (q.mediaFor(seated.materialId) as { id: string; name: string }[]).map((m) => m.id);
    const refused = (tmp.TEMPERS as { id: string }[]).map((t) => t.id).filter((id) => !media.includes(id));

    // TIER I refuses a seated part by name.
    const atI = q.quenchBlocker(e.getState(), seated.id, media[0]!) as string | null;
    e.dispatch({ type: 'buildQuenchTank' });   // → tier II
    const tier2 = plant.tierOf(e.getState(), 'quench') as number;
    const steadyBefore = (tm.instability(e.getState()) as { steady: number }).steady;
    const dipped = e.dispatch({ type: 'quenchPart', partId: seated.id, mediumId: media[0]! }) as { ok: boolean; reason?: string };
    const steadyAfter = (tm.instability(e.getState()) as { steady: number }).steady;

    // TIER III: §19's Hollow row. An over-filled stone stops shaking for it.
    inf.registerInfusedForm('marl', 'warm');
    const overfilled = inf.resultOf('marl', 'warm') as string;
    const second = st.casting.tool[1]!;
    second.materialId = overfilled;
    const rawShaken = (tm.instability(e.getState()) as { raw: number }).raw;
    const m2 = (q.mediaFor(overfilled) as { id: string }[])[0]!.id;
    e.dispatch({ type: 'quenchPart', partId: second.id, mediumId: m2 });
    const rawAtII = (tm.instability(e.getState()) as { raw: number }).raw;
    e.dispatch({ type: 'buildQuenchTank' });   // → tier III
    const tier3 = plant.tierOf(e.getState(), 'quench') as number;
    const rawAtIII = (tm.instability(e.getState()) as { raw: number }).raw;
    return {
      found, tier1, tier2, tier3, station: q.quenchStation(),
      mediaCount: media.length, refusedCount: refused.length,
      atI: atI ?? '',
      dippedOk: dipped.ok, dippedSays: (dipped.reason ?? '').slice(0, 50),
      steadyMoved: Math.round((steadyAfter - steadyBefore) * 100) / 100,
      rawShaken, rawAtII, rawAtIII,
      quenched: st.casting.tool.filter((p) => p.quench).length,
    };
  });
  check([quench.found, quench.tier1], [true, 1], [false, 0],
    `F — THE SLAKE ${JSON.stringify(quench.station)} — authored this pass, buries nothing`);
  check(quench.mediaCount > 0 && quench.refusedCount > 0, true, false,
    `F — ${quench.mediaCount} of 6 media will take this part; ${quench.refusedCount} have nothing in common with it`);
  check(quench.atI.includes('off the rack'), true, false,
    `F — tier I refuses a SEATED part by name: "${quench.atI}"`);
  check([quench.tier2, quench.dippedOk, quench.steadyMoved], [2, true, 7], [1, false, 0],
    'F — tier II takes it without breaking the tool, and it comes out 7 steadier');
  check([quench.rawShaken > quench.rawAtII, quench.rawAtII > quench.rawAtIII],
    [false, true], [true, false],
    `F — §19: tier II does NOT forget (${quench.rawAtII}); tier III does (${quench.rawAtIII})`);

  // ═══ G — THE TIERS ═══════════════════════════════════════════════════════
  console.log('\n== G — tier I vs II vs III, each a different sentence ==========');
  const tiers = await page.evaluate(async () => {
    const lapid = await import(/* @vite-ignore */ '/src/engine/systems/lapidary' + '.ts');
    const q = await import(/* @vite-ignore */ '/src/engine/systems/quench' + '.ts');
    return {
      lapidary: (lapid.TIER_CAPABILITY_LAPIDARY as readonly string[]).slice(1),
      quench: (q.TIER_CAPABILITY_QUENCH as readonly string[]).slice(1),
      cuts: (lapid.CUTS as { id: string; tier: number; does: string }[]).map((c) => [c.tier, c.does]),
    };
  });
  for (const [name, rows] of [['lapidary', tiers.lapidary], ['quench', tiers.quench]] as [string, string[]][]) {
    check([rows.length, new Set(rows).size], [3, 3], [3, 1], `G — ${name}: three tiers, three DISTINCT sentences`);
    for (const r of rows) console.log(`        ${name}  ${r}`);
  }

  // ═══ H — THE PRODUCER AUDIT AND THE CLONE CHECK ══════════════════════════
  console.log('\n== H — the clone check, green and RED-TESTED ===================');
  const clonePage = await browser.newPage({ viewport: { width: W, height: H } });
  await clonePage.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  const clones = await clonePage.evaluate(async () => {
    /**
     * IMPORT THE URL THE APP ACTUALLY LOADED (A.93's finding, kept). Vite
     * serves the app's copy under `materials.ts?t=<stamp>`, so a bare specifier
     * is a SECOND live registry and every answer from it is about a game
     * nobody is playing.
     */
    const url = performance.getEntriesByType('resource')
      .map((r) => r.name)
      .filter((n) => n.includes('/src/engine/materials.ts'))
      .sort((a, b) => b.length - a.length)[0] ?? '/src/engine/materials.ts';
    const mats = await import(/* @vite-ignore */ url);
    const traitsUrl = performance.getEntriesByType('resource')
      .map((r) => r.name)
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
  check(clones.found, [], ['x'], `H — zero clones across ${clones.population} materials`);
  check(clones.red, 1, 0, `H — RED-TESTED: a deliberate twin IS caught (${clones.redSays})`);
  await clonePage.close();

  // ═══ I — PILLAR 2 ════════════════════════════════════════════════════════
  console.log('\n== I — dpsMax at the SAME depth, with all of it live ===========');
  const ceiling = await page.evaluate(async () => {
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as {
      depth: number; plant: { tiers: Record<string, number>; condition: Record<string, unknown> };
      lapidary?: unknown; casting: { tool: { quench?: string }[]; sockets: unknown[] };
    };
    s.depth = 48;                                   // THE SAME DEPTH IN BOTH ARMS
    const m = new modsMod.ModifierCache(); m.invalidate();
    const live = Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 1e6);
    const keep = {
      tiers: s.plant.tiers, cond: s.plant.condition, lap: s.lapidary,
      quenches: s.casting.tool.map((p) => p.quench),
    };
    s.plant.tiers = {}; s.plant.condition = {};
    delete s.lapidary;
    for (const p of s.casting.tool) delete p.quench;
    m.invalidate();
    const bareNow = Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 1e6);
    s.plant.tiers = keep.tiers; s.plant.condition = keep.cond; s.lapidary = keep.lap;
    s.casting.tool.forEach((p, i) => { if (keep.quenches[i]) p.quench = keep.quenches[i]; });
    return { live, bare: bareNow };
  });
  check(ceiling.live, ceiling.bare, -1,
    `I — the ceiling at depth 48 is identical bare and with all of A.94 live (${ceiling.live})`);

  // ═══ J — THE PANELS, AT 380px ════════════════════════════════════════════
  console.log('\n== J — the panels, at 380px ===================================');
  // THE PLANT CLUSTER LIVES IN THE KILN ROOM (`panels.tsx` renders it inside
  // `KilnPanel`, because §3.2's Hearth IS the Kiln).
  await tab(page, 'kiln');
  await dismiss(page);
  await page.waitForTimeout(500);
  for (const id of ['lapidary-panel', 'quench-panel']) {
    const el = page.locator(`[data-testid="${id}"]`).first();
    const there = (await el.count()) > 0;
    check(there, true, false, `J — ${id} is on the screen`);
    if (!there) continue;
    /**
     * ...AND FITS ON IT. The rack is unbounded, so any panel that lists it has
     * to cap itself — this driver's own fixture leaves ninety parts on the
     * rack, which is an ordinary state for anyone who has been pouring, and
     * the first run drew a SEVEN-THOUSAND-PIXEL panel with no way past it.
     * The harness noticing is the bug report; the fix went in the component.
     */
    const h = await el.evaluate((n) => Math.round(n.getBoundingClientRect().height));
    check(h < 1400, true, false, `J — ${id} is ${h}px tall, not a wall`);
    await el.screenshot({ path: `${OUT}/a94-${id}.png` }).catch(() => {});
  }
  await page.screenshot({ path: `${OUT}/a94-plant.png`, fullPage: true }).catch(() => {});

  // ...and the bench's third slot, which lives in the Refinery room.
  await tab(page, 'refinery');
  await dismiss(page);
  await page.waitForTimeout(500);
  /**
   * THE THIRD SLOT ONLY EXISTS WHEN THE PAIR WANTS ONE, so it has to be driven
   * into being: pick two stones that pull against each other through the real
   * combobox (trigger, then the option by its accessible name), and the row
   * appears. A screenshot of an empty bench would prove nothing.
   */
  await page.getByRole('combobox', { name: 'Refinery slot A' }).click().catch(() => {});
  await page.getByRole('option', { name: /Bonechalk/ }).first().click().catch(() => {});
  await page.getByRole('combobox', { name: 'Refinery slot B' }).click().catch(() => {});
  await page.getByRole('option', { name: /Grave Clay|Graveclay/ }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  const slot = page.locator('[data-testid="catalyst-slot"]').first();
  const slotThere = (await slot.count()) > 0;
  check(slotThere, true, false, 'J — the third slot appears for a pair that pulls against itself');
  if (slotThere) {
    const reading = await page.locator('[data-testid="catalyst-reading"]').first().getAttribute('data-ok');
    check(reading, '0', '1', 'J — and says, on screen, that it will not go like this');
    await slot.screenshot({ path: `${OUT}/a94-catalyst.png` }).catch(() => {});
  }
  await page.screenshot({ path: `${OUT}/a94-bench.png`, fullPage: true }).catch(() => {});

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
  check(overflow, [], ['x'], 'J — nothing overflows 380px');
  check(errors, [], ['x'], 'J — no page errors');

  await browser.close();
  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  if (problems.length) { for (const p of problems) console.log(`  - ${p}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
