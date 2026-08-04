/**
 * A.91 DRIVEN IN THE REAL GAME — one gate fix, one capability, three machines.
 *
 *   A  §23's opening, read FIRST on a reset state (the A.90 lesson)
 *   B  alephite / worldseed / paradoxa ROLLING in Aleph, and the per-shell
 *      gate-starvation report
 *   C  each machine raised from CAST PARTS at its own wreck
 *   D  a machine UN-BUILT: parts returned, tier gone, re-tiering from I
 *   E  an alloy poured from a ratio, its traits blended — and a diggable set
 *      refused as grog
 *   F  a Line chaining four machines on ONE Surge draw
 *   G  the Circuit HOLDING the Line (§7.3's cut act)
 *   H  a Balance conversion showing its worth loss, and the cross-shell tier
 *   I  tier I vs II vs III each doing something DIFFERENT, per machine
 *   J  the clone check green, and RED-TESTED in the live module
 *   K  dpsMax unmoved at equal depth with all of it live
 *   L  380px, 0 overflow, 0 page errors
 *
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY — tsx
 * compiles this with esbuild's `keepNames`, which rewrites `const f = () => {}`
 * into `__name(...)`, and `__name` does not exist in the page. It cost two runs
 * at A.90. Every block inlines its repetition or builds helpers with
 * `new Function` from a string esbuild cannot touch.
 *
 *   npx tsx scripts/verify-a91.ts [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a91';
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
  s.plant.surge = 99999;
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
  // A.90 measured this: the face starts every cell AT CAP so `fullField` is
  // true on the first tick and pays ~3.1% before the player has done anything.
  check([opening.cells, opening.depth, opening.dps], [36, 0, 2.97], [0, 1, 0],
    'A — §23: 36 cells, depth 0, 2.97 dust/sec (headless t=0 is exactly 2.88)');
  await page.screenshot({ path: `${OUT}/a91-opening.png`, fullPage: true }).catch(() => {});

  // ═══ B — THE GATES ═══════════════════════════════════════════════════════
  console.log('\n== B — the rarity gates, re-keyed ============================');
  const gates = await page.evaluate(async () => {
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const shells = await import(/* @vite-ignore */ '/src/engine/shells' + '.ts');
    const rows: Record<string, number[]> = {};
    const starved: string[] = [];
    for (const sh of shells.allShells() as { id: string; floorDepth: number }[]) {
      rows[sh.id] = (mats.RARITIES as string[]).map((r) => mats.gateDepth(sh.id, r) as number);
      for (const m of (mats.MATERIALS as { id: string; shellId: string; worked?: boolean; source?: string; rarity: string }[])) {
        if (m.shellId !== sh.id || m.worked || m.source) continue;
        if ((mats.gateDepth(sh.id, m.rarity) as number) > sh.floorDepth) starved.push(`${sh.id}/${m.id}`);
      }
    }
    /**
     * A SEEDED GENERATOR BUILT WITH `new Function`, never a const arrow —
     * esbuild's `keepNames` rewrites the latter into `__name(...)` and kills
     * the evaluate. Assigning the RESULT of a call is safe; assigning a
     * function literal is not.
     */
    const rng = (new Function(`
      let a = 20260906;
      return function () { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
    `) as () => () => number)();
    // AT DEPTH 40, where all three are open. A sweep across 0-40 puts only a
    // twenty-fifth of its rolls where `aberrant` can appear at all, and at a
    // weight of 0.8 in 152 that expects FIVE hits in a run — which is a flake,
    // not a measurement. The first draft of this block did exactly that and
    // reported paradoxa missing when the unit suite finds it every time.
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const d = mats.rollDrop('aleph', 40, rng) as { kind: string; materialId?: string };
      if (d.kind === 'material') seen.add(d.materialId!);
    }
    return {
      rows, starved,
      three: ['alephite', 'worldseed', 'paradoxa'].filter((id) => seen.has(id)),
      dug: [...seen].length,
    };
  });
  check(gates.three, ['alephite', 'worldseed', 'paradoxa'], [],
    `B — all three roll in Aleph now (${gates.dug} distinct stones, 20,000 rolls at the floor)`);
  check(gates.starved, [], ['x'], 'B — NO shell starves a band it owns');
  check(gates.rows['aleph'], [0, 3, 11, 19, 29, 40], [0, 10, 40, 70, 110, 150],
    'B — Aleph\'s ladder compresses into forty depths');
  console.log('      per shell — the starvation report the brief asked for:');
  for (const [id, row] of Object.entries(gates.rows)) {
    const moved = JSON.stringify(row) !== JSON.stringify([0, 10, 40, 70, 110, 150]);
    console.log(`        ${id.padEnd(10)} ${row.map((n) => String(n).padStart(4)).join('')}  ${moved ? '<- MOVED' : 'unchanged'}`);
  }
  for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow']) {
    check(gates.rows[id], [0, 10, 40, 70, 110, 150], [0, 3, 11, 19, 29, 40],
      `B — ${id} is untouched — the shaft is long enough to hold the ladder`);
  }

  // ═══ C — THE MACHINES, AT THEIR WRECKS ═══════════════════════════════════
  console.log('\n== C — five machines raised from cast parts ===================');
  await setup(page, PLANT_SETUP);
  const built = await page.evaluate(async () => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const sieve = await import(/* @vite-ignore */ '/src/engine/systems/sieve' + '.ts');
    const still = await import(/* @vite-ignore */ '/src/engine/systems/still' + '.ts');
    const breaker = await import(/* @vite-ignore */ '/src/engine/systems/breaker' + '.ts');
    const cruc = await import(/* @vite-ignore */ '/src/engine/systems/crucible' + '.ts');
    const line = await import(/* @vite-ignore */ '/src/engine/systems/line' + '.ts');
    const bal = await import(/* @vite-ignore */ '/src/engine/systems/balance' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string } }>;
    const s = w['__engine']!.getState() as unknown as {
      shell: { current: string }; casting: { rack: unknown[]; nextId: number };
      roll: { looted: string[] }; plant: { builtOf: Record<string, string[]> };
    };
    // BEFORE THE WALK: each names its own wreck.
    s.roll.looted = [];
    s.casting.rack = Array.from({ length: 90 }, (_, i) =>
      ({ id: 6000 + i, materialId: 'marl', type: 'head', purity: 40 + (i % 30) }));
    s.casting.nextId = 6100;
    const before: Record<string, string> = {};
    for (const t of ['buildCrucible', 'buildLine', 'buildBalance']) {
      before[t] = (w['__engine']!.dispatch({ type: t }) as { reason?: string }).reason ?? '';
    }
    // Walk every shell so every wreck is looted.
    for (const id of ['ferrite', 'verdance', 'glassmere', 'cinder']) {
      s.shell.current = id;
      roll.markReached(s, 999, 15);
    }
    s.shell.current = 'ferrite';
    const found = {
      sieve: sieve.sieveFound(s), still: still.stillFound(s), breaker: breaker.breakerFound(s),
      crucible: cruc.crucibleFound(s), line: line.lineFound(s), balance: bal.balanceFound(s),
    };
    const rackBefore = s.casting.rack.length;
    for (let t = 0; t < 3; t++) {
      for (const type of ['buildSieve', 'buildStill', 'buildBreaker', 'buildCrucible', 'buildLine', 'buildBalance']) {
        w['__engine']!.dispatch({ type });
      }
    }
    const tiers: Record<string, number> = {};
    for (const id of ['sieve', 'still', 'breaker', 'crucible', 'line', 'balance']) {
      tiers[id] = plant.tierOf(s, id) as number;
    }
    return {
      before, found, tiers, spent: rackBefore - s.casting.rack.length,
      madeOf: Object.fromEntries(Object.keys(tiers).map((id) => [id, (s.plant.builtOf[id] ?? []).length])),
      stations: {
        crucible: cruc.crucibleStation(), line: line.lineStation(), balance: bal.balanceStation(),
      },
    };
  });
  check(built.before['buildCrucible']!.includes("Alloyer's End"), true, false,
    `C — the Crucible names its wreck first: "${built.before['buildCrucible']}"`);
  check(built.before['buildLine']!.includes("Linewright's Fall"), true, false,
    `C — the Line: "${built.before['buildLine']}"`);
  check(built.before['buildBalance']!.includes('The Balance House'), true, false,
    `C — the Balance: "${built.before['buildBalance']}"`);
  check(built.found, {
    sieve: true, still: true, breaker: true, crucible: true, line: true, balance: true,
  }, {
    sieve: false, still: false, breaker: false, crucible: false, line: false, balance: false,
  }, 'C — after the walk, all six are found');
  check(built.tiers, {
    sieve: 3, still: 3, breaker: 3, crucible: 3, line: 3, balance: 3,
  }, {
    sieve: 0, still: 0, breaker: 0, crucible: 0, line: 0, balance: 0,
  }, 'C — all six raised to tier III, FROM CAST PARTS');
  check(built.spent, 60, 0, 'C — and it cost 60 parts off the rack (2+3+5 x 6)');
  check(Object.values(built.madeOf).every((n) => n === 10), true, false,
    'C — each one remembers all ten parts it was cast from (§11.2)');

  // ═══ D — UN-BUILDING ═════════════════════════════════════════════════════
  console.log('\n== D — a machine taken apart ==================================');
  const unbuilt = await page.evaluate(async () => {
    const breaker = await import(/* @vite-ignore */ '/src/engine/systems/breaker' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string } }>;
    const s = w['__engine']!.getState() as unknown as {
      casting: { rack: { materialId: string }[] }; plant: { builtOf: Record<string, string[]> };
    };
    const offered = (breaker.unbuildable(s) as { machineId: string }[]).map((u) => u.machineId).sort();
    const spent = [...(s.plant.builtOf['crucible'] ?? [])];
    const rackBefore = s.casting.rack.length;
    const tierBefore = plant.tierOf(s, 'crucible') as number;
    const r = w['__engine']!.dispatch({ type: 'unbuildMachine', machineId: 'crucible' });
    const back = s.casting.rack.slice(rackBefore).map((p) => p.materialId).sort();
    // ...and re-tiering starts at ONE and costs the ladder again.
    w['__engine']!.dispatch({ type: 'buildCrucible' });
    return {
      offered, ok: r.ok, tierBefore,
      parts: spent.length, gained: s.casting.rack.length - rackBefore - 2,
      same: JSON.stringify(back) === JSON.stringify([...spent].sort()),
      after: plant.tierOf(s, 'crucible') as number,
      forgotten: s.plant.builtOf['crucible']?.length ?? 0,
    };
  });
  check(unbuilt.offered.includes('kiln'), false, true,
    'D — the KILN is never offered — it is not a plant tier (§3.2)');
  check([unbuilt.ok, unbuilt.tierBefore, unbuilt.parts], [true, 3, 10], [false, 0, 0],
    'D — a tier-III Crucible comes apart: 10 parts back');
  check(unbuilt.same, true, false, 'D — and they are the SAME stone that went in');
  check(unbuilt.after, 1, 3, 'D — re-tiering restarts at I. The TIER is the loss.');
  check(unbuilt.forgotten, 2, 10, 'D — and it only remembers what it was just re-cast from');

  // ═══ E — AN ALLOY ════════════════════════════════════════════════════════
  console.log('\n== E — a ratio, and a blend ===================================');
  const alloy = await page.evaluate(async () => {
    const cruc = await import(/* @vite-ignore */ '/src/engine/systems/crucible' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const traits = await import(/* @vite-ignore */ '/src/engine/traits' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string; data?: unknown } }>;
    const s = w['__engine']!.getState() as unknown as { plant: { tiers: Record<string, number> } };
    s.plant.tiers['crucible'] = 3;
    for (const id of ['ironbloom', 'rustmarrow', 'greyflux']) {
      for (let i = 0; i < 12; i++) forge.addMaterial(s, id, 60);
    }
    const parts = [
      { materialId: 'ironbloom', count: 1 },
      { materialId: 'rustmarrow', count: 1 },
      { materialId: 'greyflux', count: 1 },
    ];
    const preview = cruc.pourPreview(s, parts) as { ok: boolean; traits: string[]; name: string };
    const held = forge.materialCount(s, 'ironbloom') as number;
    const r = w['__engine']!.dispatch({ type: 'pour', parts });
    const id = (r.data as { alloyId?: string }).alloyId ?? '';
    // A 5:1 pour keeps only the majority metal — a stone you can dig, so grog.
    const digg = [{ materialId: 'ironbloom', count: 5 }, { materialId: 'greyflux', count: 1 }];
    const dp = cruc.pourPreview(s, digg) as { ok: boolean; reason?: string };
    const gr = w['__engine']!.dispatch({ type: 'pour', parts: digg });
    // ...and 2:2 is not a ratio at all.
    const notRatio = cruc.isRatio([
      { materialId: 'ironbloom', count: 2 }, { materialId: 'greyflux', count: 2 },
    ]) as boolean;
    return {
      ok: preview.ok, name: preview.name, traits: preview.traits,
      made: forge.materialCount(s, id) as number,
      spent: held - (forge.materialCount(s, 'ironbloom') as number),
      alloyTraits: traits.traitsOf(id) as string[],
      diggableRefused: !dp.ok, diggableReason: dp.reason ?? '',
      gotGrog: (gr.data as { grog?: boolean }).grog === true,
      notRatio,
    };
  });
  check([alloy.ok, alloy.made], [true, 1], [false, 0],
    `E — 1:1:1 of three Ferrite commons -> ${alloy.name}`);
  check(alloy.alloyTraits.length >= 3, true, false,
    `E — and it carries ${alloy.alloyTraits.join('+')} — no Ferrite stone can be dug with three`);
  check([alloy.diggableRefused, alloy.gotGrog], [true, true], [false, false],
    `E — a 5:1 pour is refused: "${alloy.diggableReason}"`);
  check(alloy.notRatio, false, true, 'E — and 2:2 is not a ratio — it is 1:1 poured twice');

  // ═══ F/G — THE LINE ══════════════════════════════════════════════════════
  console.log('\n== F — four machines, one draw ================================');
  const line = await page.evaluate(async () => {
    const lineMod = await import(/* @vite-ignore */ '/src/engine/systems/line' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string; data?: unknown } }>;
    const s = w['__engine']!.getState() as unknown as {
      shell: { current: string }; plant: { surge: number; tiers: Record<string, number> };
      casting: { rack: unknown[]; nextId: number }; depthRecords: Record<string, number>;
    };
    s.shell.current = 'ferrite';
    s.plant.tiers['line'] = 3;
    s.plant.tiers['refinery'] = 1;
    // THE CRUSHER TOO. The first draft asked for four members without building
    // this one, so `setLine` seated three, the Line drew for three, and the
    // check compared it against a four-member quote — a harness bug that read
    // exactly like the Line under-charging.
    s.plant.tiers['crusher'] = 1;
    s.plant.surge = 99999;
    s.casting.rack = Array.from({ length: 12 }, (_, i) =>
      ({ id: 8000 + i, materialId: 'ironbloom', type: 'head', purity: 50 }));
    s.casting.nextId = 8100;
    for (let i = 0; i < 12; i++) forge.addMaterial(s, 'ironbloom', 30);
    for (let i = 0; i < 8; i++) forge.addMaterial(s, 'rustmarrow', 30);
    for (let i = 0; i < 6; i++) forge.addMaterial(s, 'millstone', 80);

    const members = ['crusher', 'still', 'breaker', 'refinery'];
    w['__engine']!.dispatch({ type: 'setLine', members });
    // READ THE MEMBERS BACK: `setLine` drops anything not built, and quoting a
    // draw for a list the Line does not hold is the same readout bug the
    // double-charge was.
    const seated = (lineMod.ensureLine(s) as { members: string[] }).members;
    const draw = lineMod.lineDraw(seated) as number;
    const before = s.plant.surge;
    const r = w['__engine']!.dispatch({ type: 'runLine' });
    const spent = before - s.plant.surge;
    const ran = (r.data as { ran?: string[] }).ran ?? [];
    return {
      ok: r.ok, reason: r.reason ?? '', ran, draw, spent, seated,
      eff: Math.round((lineMod.efficiency(seated) as number) * 100),
    };
  });
  check([line.ok, line.seated.length], [true, 4], [false, 0],
    `F — four seated (${line.seated.join(', ')}), and it fired: ${line.ran.join(' -> ')}`);
  check(line.spent, line.draw, line.draw + 1,
    `F — ONE draw of ${line.draw} Surge for ${line.ran.length} machines (efficiency ${line.eff}%)`);

  console.log('\n== G — the Circuit holds the Line (§7.3) ======================');
  const hold = await page.evaluate(async () => {
    const lineMod = await import(/* @vite-ignore */ '/src/engine/systems/line' + '.ts');
    const circ = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number };
    const m = new modsMod.ModifierCache(); m.invalidate();
    const acts = (circ.availableActs(s, 'line') as { id: string; label: string }[]).map((a) => a.id).sort();
    const c = circ.ensureCircuit(s) as { opened: boolean; strips: Record<string, unknown>; last: Record<string, number>; clock: number };
    c.opened = true;
    // §7.3's own example, verbatim.
    c.strips['line'] = [
      { read: 'station', op: 'is', value: 'hazard', act: 'lineHold' },
      { read: 'depth', op: 'gt', value: -1, act: 'lineRelease' },
    ];
    c.last['line'] = -1;
    s.depth = 85;                       // The Attracting Dark — Ferrite's hazard
    circ.tickCircuit(s, m, { emit() {}, dirty() {} }, 2);
    const atHazard = (lineMod.ensureLine(s) as { held: boolean }).held;
    const blocked = lineMod.lineBlocker(s) as string | null;
    s.depth = 112;                      // Iron Vespers — a REST
    c.clock = 0;
    circ.tickCircuit(s, m, { emit() {}, dirty() {} }, 2);
    return {
      acts, atHazard, blocked,
      elsewhere: (lineMod.ensureLine(s) as { held: boolean }).held,
    };
  });
  check(hold.acts, ['lineHold', 'lineRelease', 'lineRun'], [],
    'G — the Line carries a strip, and A.85\'s cut act is on it');
  check([hold.atHazard, hold.blocked], [true, 'The Line is held.'], [false, null],
    'G — WHEN the station is a hazard -> hold the Line (§7.3, verbatim)');
  check(hold.elsewhere, false, true, 'G — and it lets it go at a REST');

  // ═══ H — THE BALANCE ═════════════════════════════════════════════════════
  console.log('\n== H — anything to anything, at a loss ========================');
  const bal = await page.evaluate(async () => {
    const b = await import(/* @vite-ignore */ '/src/engine/systems/balance' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string; data?: unknown } }>;
    const s = w['__engine']!.getState() as unknown as { plant: { tiers: Record<string, number> } };
    s.plant.tiers['balance'] = 1;
    for (let i = 0; i < 80; i++) forge.addMaterial(s, 'ironbloom', 60);
    const cross = b.balanceBlocker(s, 'ironbloom', 'marl', 40) as string | null;
    s.plant.tiers['balance'] = 2;
    const crossOk = b.balanceBlocker(s, 'ironbloom', 'marl', 40) as string | null;
    const p = b.balancePreview(s, 'ironbloom', 'marl', 40) as { out: number; lost: number; rate: number };
    const before = forge.materialCount(s, 'ironbloom') as number;
    const r = w['__engine']!.dispatch({ type: 'convert', fromId: 'ironbloom', toId: 'marl', units: 40 });
    // ...and a round trip loses, at the BEST tier.
    s.plant.tiers['balance'] = 3;
    const there = (b.balancePreview(s, 'ironbloom', 'marl', 1000) as { out: number }).out;
    const back = (b.balancePreview(s, 'marl', 'ironbloom', there) as { out: number }).out;
    return {
      cross: cross ?? '', crossOk, rate: p.rate, out: p.out, lost: p.lost,
      ok: r.ok, spent: before - (forge.materialCount(s, 'ironbloom') as number),
      got: forge.materialCount(s, 'marl') as number,
      ledger: (b.ledgerKnows(s) as { id: string; units: number }[]).map((e) => `${e.id}:${e.units}`),
      roundTrip: back,
    };
  });
  check(bal.cross.includes('inside one shell'), true, false,
    `H — a tier-I Balance refuses a cross-shell trade: "${bal.cross}"`);
  check(bal.crossOk, null, 'x',
    'H — a tier-II one takes it — §14.4\'s "the only route back"');
  check([bal.ok, bal.spent, bal.got], [true, 40, bal.out], [false, 0, 0],
    `H — 40 Ferrite Ironbloom -> ${bal.out} Loam Marl at ${Math.round(bal.rate * 100)}%, ${bal.lost} units of worth lost`);
  check(bal.ledger, ['ironbloom:40'], [], 'H — and the worth ledger wrote it down');
  check(bal.roundTrip < 1000, true, false,
    `H — a 1,000-unit round trip returns ${bal.roundTrip}. It is not a faucet.`);

  // ═══ I — TIERS ═══════════════════════════════════════════════════════════
  console.log('\n== I — I vs II vs III, per machine ============================');
  const tiers = await page.evaluate(async () => {
    const sieve = await import(/* @vite-ignore */ '/src/engine/systems/sieve' + '.ts');
    const still = await import(/* @vite-ignore */ '/src/engine/systems/still' + '.ts');
    const breaker = await import(/* @vite-ignore */ '/src/engine/systems/breaker' + '.ts');
    const cruc = await import(/* @vite-ignore */ '/src/engine/systems/crucible' + '.ts');
    const lineMod = await import(/* @vite-ignore */ '/src/engine/systems/line' + '.ts');
    const bal = await import(/* @vite-ignore */ '/src/engine/systems/balance' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { plant: { tiers: Record<string, number> } };
    const rows: number[][] = [];
    for (const t of [1, 2, 3]) {
      for (const id of ['sieve', 'still', 'breaker', 'crucible', 'line', 'balance']) {
        s.plant.tiers[id] = t;
      }
      rows.push([
        sieve.clauseLimit(s) as number, (sieve.rejectsRoute(s) as boolean) ? 1 : 0,
        (still.canTake(s, 'millstone', 'dense') as boolean) ? 1 : 0,
        (still.canTake(s, 'umberjade', 'brittle') as boolean) ? 1 : 0,
        (breaker.returnsProps(s) as boolean) ? 1 : 0, (breaker.breaksInBulk(s) as boolean) ? 1 : 0,
        cruc.metalLimit(s) as number,
        lineMod.lineSlots(s) as number, (lineMod.skipsIdle(s) as boolean) ? 1 : 0,
        Math.round((bal.balanceRate(s) as number) * 100),
        (bal.crossesShells(s) as boolean) ? 1 : 0,
      ]);
    }
    return { i: rows[0]!, ii: rows[1]!, iii: rows[2]! };
  });
  check(tiers.i, [1, 0, 0, 0, 0, 0, 2, 3, 0, 40, 0], tiers.ii,
    'I — tier I: one clause · named fault · one part · two metals · 3 slots · 40%');
  check(tiers.ii, [2, 0, 1, 0, 1, 0, 3, 4, 0, 50, 1], tiers.iii,
    'I — tier II: two clauses · props back · three metals · 4 slots · 50% · cross-shell');
  check(tiers.iii, [2, 1, 1, 1, 1, 1, 4, 6, 1, 65, 1], tiers.i,
    'I — tier III: rejects route · any stone · the rack · four metals · 6 slots · 65%');

  // ═══ J — CLONES ══════════════════════════════════════════════════════════
  console.log('\n== J — the clone check =======================================');
  const clones = await page.evaluate(async () => {
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cfp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const traits = await import(/* @vite-ignore */ '/src/engine/traits' + '.ts');
    const table = traits.MATERIAL_TRAITS as Record<string, string[]>;
    const mined = (mats.MATERIALS as { id: string; name: string; shellId: string; worked?: boolean; source?: string }[])
      .filter((m) => !m.worked && m.source !== 'combat');
    // `new Function`: esbuild's keepNames would rewrite a const arrow here.
    const scan = new Function('shell', 'mined', 'fp', 'cfp', `
      const seen = new Map(); const hits = [];
      for (const m of mined.filter((x) => x.shellId === shell)) {
        const d = fp.derivePart(fp.makePart('head', m.id, 60));
        const k = cfp.TOOL_STATS.map((x) => d.stats[x].toFixed(3)).join('|');
        if (seen.has(k)) hits.push(m.name + ' = ' + seen.get(k));
        seen.set(k, m.name);
      }
      return hits;
    `) as (shell: string, m: unknown, a: unknown, b: unknown) => string[];
    const counts: Record<string, number> = {};
    const green: string[] = [];
    for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      counts[shell] = mined.filter((x) => x.shellId === shell).length;
      green.push(...scan(shell, mined, fp, cfp));
    }
    /**
     * RED-TEST 1: the two Hollow clones, put back one at a time.
     *
     * `authorsInk` IS NOT ON THIS LIST ANY MORE, and that is the finding rather
     * than an omission. A.90's clone #8 existed only because the stone had been
     * demoted to `pure`, where it collided with Ruleshard; A.91 restored it to
     * `flawless` (the gate re-keying dissolved the reason for the demotion), and
     * at `flawless` the old traits do not collide with anything. The clone was
     * not fixed — its CAUSE was removed.
     */
    const red: string[] = [];
    for (const [id, was, shell] of [
      ['nullchalk', ['light', 'hollow'], 'hollow'],
      ['lacuna', ['hollow', 'charged'], 'hollow'],
    ] as [string, string[], string][]) {
      const keep = table[id];
      table[id] = was;
      red.push(...scan(shell, mined, fp, cfp));
      table[id] = keep!;
    }
    /**
     * RED-TEST 2: the clone A.91's own CRUCIBLE would have made on demand.
     *
     * A 5:1 pour keeps only the majority metal's traits, so registering that
     * alloy produces a stone identical to Ironbloom. `diggableWith` is the guard
     * that turns such a pour into grog; this bypasses it by registering the
     * alloy directly, and the scan must name the collision.
     */
    const cruc = await import(/* @vite-ignore */ '/src/engine/systems/crucible' + '.ts');
    const trueTraits = traits.traitsOf('ironbloom') as string[];
    cruc.ensureAlloy('ferrite', trueTraits, 'common');
    const minedNow = (mats.MATERIALS as { id: string; name: string; shellId: string; worked?: boolean; source?: string }[])
      .filter((m) => !m.worked && m.source !== 'combat');
    const crucRed = scan('ferrite', minedNow, fp, cfp);
    return { counts, green, red: [...new Set(red)].sort(), crucRed };
  });
  check(clones.green, [], ['x'],
    `J — no clones: ${Object.entries(clones.counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  check(clones.red, ['Lacuna Stone = Absencia', 'Nullchalk = Nothingstone'].sort(), [],
    'J — RED-TESTED: the two Hollow clones fail it, by name');
  check(clones.crucRed, ['Tough-Dense Alloy = Ironbloom'], [],
    'J — ...and RED-TESTED for the CRUCIBLE: the guard is what stops a poured clone');

  // ═══ K — PILLAR 2 ════════════════════════════════════════════════════════
  console.log('\n== K — PILLAR 2 ==============================================');
  const pillar = await page.evaluate(async () => {
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const cond = await import(/* @vite-ignore */ '/src/engine/systems/condition' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as {
      depth: number; plant: { tiers: Record<string, number> };
    };
    s.depth = 48;                       // THE SAME DEPTH IN BOTH ARMS
    s.plant.tiers = {};
    let m = new modsMod.ModifierCache(); m.invalidate();
    const bare = Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 1e6);
    for (const id of ['sieve', 'still', 'breaker', 'crucible', 'line', 'balance', 'crusher', 'refinery']) {
      s.plant.tiers[id] = 3;
    }
    for (const id of cond.conditionedMachines() as string[]) {
      cond.ensureCondition(s)[id] = { id: 'baked', level: 1, seized: true };
    }
    m = new modsMod.ModifierCache(); m.invalidate();
    const loaded = Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 1e6);
    return { bare, loaded, depth: s.depth };
  });
  check(pillar.loaded, pillar.bare, pillar.bare + 1,
    `K — dpsMax at depth ${pillar.depth} identical bare and with all ten machines at III (${pillar.bare})`);

  // ═══ L — 380px ═══════════════════════════════════════════════════════════
  console.log('\n== L — 380px, page errors ====================================');
  await tab(page, 'plant').catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/a91-plant.png`, fullPage: true }).catch(() => {});
  const layout = await page.evaluate(() => {
    const over: string[] = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
        over.push(`${el.tagName}.${(el.className || '').toString().slice(0, 40)}`);
      }
    }
    const clipped: string[] = [];
    for (const el of document.querySelectorAll('.truncate')) {
      const e = el as HTMLElement;
      if (!e.innerText.trim()) continue;
      if (e.getBoundingClientRect().width >= 24) continue;
      if (e.scrollWidth <= e.clientWidth + 2) continue;
      clipped.push(`"${e.innerText.trim().slice(0, 20)}"`);
    }
    return { over: over.length, first: over.slice(0, 3), clipped, doc: document.documentElement.scrollWidth };
  });
  check(layout.over, 0, 1, `L — 0 elements overflow 380px (doc ${layout.doc}px)`);
  if (layout.over > 0) console.log(`      ${layout.first.join(' | ')}`);
  check(layout.clipped, [], ['x'], 'L — 0 labels clipped to nothing');
  check(errors.length, 0, 1, 'L — 0 page errors');
  for (const e of errors.slice(0, 5)) console.log(`      ${e}`);

  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log(`shots in ${OUT}/`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
