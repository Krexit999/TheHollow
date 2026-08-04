/**
 * A.90 DRIVEN IN THE REAL GAME — two shells, one blocking mechanic, three
 * first-build machines.
 *
 *   A  HOLLOW and ALEPH in the Shaft: three legible ahead, the floor pinned,
 *      and NO WALLS — with the five wall-bearing shells as the control
 *   B  each new shell's gates paying ITS materials, Aleph's ladder two rungs
 *   C  the last four orphans dropping, with where from, plus barren controls
 *   D  E2: a machine's condition WRITTEN BY THE WORLD and READ BY THE CIRCUIT
 *   E  Glassmere's §7.2 rule firing, and the trade it offers
 *   F  each machine raised from CAST PARTS at its own wreck
 *   G  a Sieve filter set, a machine obeying it, "crush only stone under Fair"
 *      expressed and honoured, and the Circuit taking FILTER as an action
 *   H  a trap distilled, measured through the Forge's own derivation
 *   I  a part broken back to material; DESIGN is cut and says so
 *   J  a drift un-shored returning its timber
 *   K  tier I vs II vs III each doing something DIFFERENT, per machine
 *   L  the clone checks green, and RED-TESTED in the live module
 *   M  dpsMax unmoved at equal depth with all of it live
 *   N  §23's opening beats, 380px, 0 overflow, 0 page errors
 *
 * Every assertion goes through `check(actual, want, bad, label)`; a known-bad
 * equal to the expected value is reported VACUOUS rather than passing.
 *
 *   npx tsx scripts/verify-a90.ts [port] [outDir]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { setup, tab, dismiss } from './drive';

const PORT = process.argv[2] ?? '5173';
const OUT = process.argv[3] ?? 'sim-out/shots-a90';
const W = 380, H = 1700;

const problems: string[] = [];

/**
 * NO NAMED FUNCTION MAY BE DECLARED INSIDE A `page.evaluate` BODY.
 *
 * tsx compiles this file with esbuild's `keepNames`, which rewrites
 * `const f = () => {}` into `const f = __name(() => {}, "f")` — and `__name` is
 * a module-scope helper that does not exist in the page. The evaluate then dies
 * with `ReferenceError: __name is not defined`, which reads exactly like a game
 * error and is not one. Found here, cost one run.
 *
 * So every block below inlines its repetition. Where a helper is genuinely
 * needed it is passed in as a STRING and built with `new Function`, which
 * esbuild cannot touch.
 */

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

interface ShellCase {
  id: string;
  stations: number;
  floor: number;
  floorName: string;
  gates: [number, string][];
  orphans: string[];
  barren: number;
  rest: [number, string, number];
  at: [number, string, string];
}

const SHELLS: ShellCase[] = [
  {
    id: 'hollow', stations: 16, floor: 560, floorName: 'NOTHING AT ALL',
    gates: [[8, 'silencesteel'], [14, 'nothingstone'], [20, 'nothingstar']],
    orphans: ['quietsinew', 'hollowplate', 'unheart'],
    barren: 300, rest: [125, 'The Long Absence', 200], at: [76, 'The Unsound', 'hazard'],
  },
  {
    id: 'aleph', stations: 6, floor: 40, floorName: 'THE CORE',
    // TWO RUNGS. §16.2 writes an em-dash at Aleph's c>=14, so 14 pays the c>=8
    // stone — the only shell in the game where that is true.
    gates: [[8, 'sigilstone'], [14, 'sigilstone'], [20, 'record']],
    orphans: ['authorsInk'],
    barren: 20, rest: [24, 'The Long Sentence', 16], at: [40, 'THE CORE', 'floor'],
  },
];

async function shellBlock(page: Page, c: ShellCase): Promise<void> {
  console.log(`\n== ${c.id.toUpperCase()} ============================================`);
  await setup(page, `
    const s = engine.getState();
    s.shell.current = '${c.id}';
    s.shell.breachCount = 6;
    s.depthRecords['${c.id}'] = ${c.floor};
    s.maxDepthRecord = ${c.floor};
    s.depth = 0;
    // THE LAMP DOES NOT CARRY BETWEEN BLOCKS (A.89's harness leak: Sable's Lamp
    // reads one station further, so a gear check in the first shell made the
    // fog check in the second read four ahead).
    s.gear = s.gear || {}; s.gear.worn = {}; s.gear.owned = [];
  `);

  // ── A — the Roll, and NO WALLS ───────────────────────────────────────────
  await tab(page, 'shaft');
  await dismiss(page);
  await page.waitForTimeout(400);
  const rolled = await page.evaluate(async (floorName) => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number };
    const rows = [...document.querySelectorAll('[data-testid^="station-"]')];
    const r = roll.rollRows(s) as { legible: boolean; behind: boolean; def: { name: string; type: string } }[];
    const ahead = r.filter((x) => !x.behind);
    return {
      n: roll.shellRoll(s).length,
      rendered: rows.length,
      floorPinned: rows.some((x) => (x as HTMLElement).innerText.includes(floorName as string)),
      aheadLegible: ahead.filter((x) => x.legible).length,
      next: ahead.filter((x) => x.legible).map((x) => x.def.name),
      walls: r.filter((x) => x.def.type === 'wall').length,
    };
  }, c.floorName);
  check(rolled.n, c.stations, 0, `A — ${c.stations} stations`);
  check(rolled.floorPinned, true, false, `A — ${c.floorName} pinned from arrival`);
  check(rolled.aheadLegible, 3, 0, `A — three legible ahead (${rolled.next.join(', ')})`);
  check(rolled.walls, 0, 3, 'A — NO WALL STATIONS: there is no rock to be hard');
  await page.screenshot({ path: `${OUT}/a90-${c.id}-roll.png`, fullPage: true }).catch(() => {});

  // ── A(b) — nothing is ever CLEARED, and everything is looted ────────────
  const walked = await page.evaluate(async (floor) => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { roll: { cleared: string[]; looted: string[] } };
    roll.markReached(s, floor as number, 15);
    return { cleared: s.roll.cleared.length, looted: s.roll.looted.length };
  }, c.floor);
  check(rolled.walls === 0 && walked.cleared === 0, true, false,
    `A — walking the whole shaft CLEARS NOTHING (${walked.looted} wrecks looted)`);

  // ── B — the gates ────────────────────────────────────────────────────────
  const gates = await page.evaluate(async () => {
    const comp = await import(/* @vite-ignore */ '/src/engine/systems/compaction' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState();
    const ctx = { emit() {}, dirty() {} };
    const out: Record<number, string[]> = {};
    for (const cc of [8, 14, 20]) {
      const got = new Set<string>();
      for (let i = 0; i < 4000; i++) { const id = comp.rollDeepEntry(s, ctx, cc); if (id) got.add(id); }
      out[cc] = [...got];
    }
    return out;
  });
  for (const [at, id] of c.gates) {
    check(gates[at], [id], ['deepgrave'], `B — c>=${at} pays ${id}, not Loam's`);
  }

  // ── C — the orphans ──────────────────────────────────────────────────────
  const drops = await page.evaluate(async (arg) => {
    const [ids, barren] = arg as [string[], number];
    const w = window as unknown as Record<string, never>;
    const e = w['__engine'] as unknown as { getState: () => never };
    const dropsMod = await import(/* @vite-ignore */ '/src/engine/systems/drops' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const s = e.getState() as unknown as { depth: number };
    const cache = new modsMod.ModifierCache();
    const ctx = { emit() {}, dirty() {} };
    const found: Record<string, string[]> = {};
    for (const st of roll.shellRoll(s) as { depth: number; name: string }[]) {
      const before: Record<string, number> = {};
      for (const id of ids) before[id] = forge.materialCount(s, id);
      s.depth = st.depth;
      cache.invalidate();
      for (let i = 0; i < 2500; i++) dropsMod.rollForDrop(s, cache, ctx, 1);
      for (const id of ids) {
        if (forge.materialCount(s, id) > before[id]!) (found[id] ??= []).push(st.name);
      }
    }
    return { found, barren: mats.remainsAt((s as unknown as { shell: { current: string } }).shell.current, barren).length };
  }, [c.orphans, c.barren] as never);
  for (const id of c.orphans) {
    const where = drops.found[id] ?? [];
    check(where.length > 0, true, false, `C — ${id} drops, at ${where.join(' / ') || 'NOWHERE'}`);
  }
  check(drops.barren, 0, 1, `C — depth ${c.barren} is barren: nothing was added to the pool`);

  // ── the Circuit reads a station here ─────────────────────────────────────
  const at = await page.evaluate(async (arg) => {
    const [depth] = arg as [number];
    const circ = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number };
    s.depth = depth;
    const here = circ.stationHere(s) as { name: string; type: string } | null;
    return { name: here?.name ?? '', type: here?.type ?? '' };
  }, [c.at[0]] as never);
  check([at.name, at.type], [c.at[1], c.at[2]], ['', ''],
    `H — the Circuit reads ${c.at[1]} at ${c.at[0]}m`);

  // ── gear at a REST ───────────────────────────────────────────────────────
  const rest = await page.evaluate(async (arg) => {
    const [restDepth, elsewhere] = arg as [number, number];
    const gear = await import(/* @vite-ignore */ '/src/engine/systems/gear' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { depth: number };
    s.depth = restDepth;
    const here = gear.atRest(s) as { ok: boolean; station?: string };
    s.depth = elsewhere;
    return { name: here.station ?? '', away: (gear.atRest(s) as { ok: boolean }).ok };
  }, [c.rest[0], c.rest[2]] as never);
  check([rest.name, rest.away], [c.rest[1], false], ['', true],
    `F — a REST at ${c.rest[0]}m (${c.rest[1]}), refused at ${c.rest[2]}m`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  /**
   * §23'S OPENING IS READ FIRST, and the order is the fix rather than a
   * preference. `setup` runs a function against the LIVE state and resets
   * nothing; the game also autosaves, so a reload restores whatever the last
   * block drove. The first draft read the opening at the END and got 17.54
   * dust/sec at depth 48 — which looks exactly like a pillar-2 violation and is
   * a dirty fixture. The one measurement that must come from a player who has
   * done nothing is taken before anything is done.
   */
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
      fullField: !!(s as unknown as { achievements: { unlocked: Record<string, boolean> } })
        .achievements.unlocked['fullField'],
    };
  });
  await page.screenshot({ path: `${OUT}/a90-opening.png`, fullPage: true }).catch(() => {});

  for (const c of SHELLS) await shellBlock(page, c);

  // ═══ D — E2: THE WORLD WRITES A MACHINE ══════════════════════════════════
  console.log('\n== E2 — THE MACHINE\'S OWN CONDITION ===========================');
  await setup(page, `
    const s = engine.getState();
    s.shell.current = 'cinder';
    s.shell.breachCount = 5;
    s.kiln.built = true;
    s.plant.tiers['crusher'] = 1;
    s.plant.builtOf = { kiln: ['emberflake'], crusher: ['quietchalk'] };
    s.pressure.heat = 100;
  `);
  const e2 = await page.evaluate(async () => {
    const cond = await import(/* @vite-ignore */ '/src/engine/systems/condition' + '.ts');
    const circ = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState();
    const m = new modsMod.ModifierCache(); m.invalidate();
    const before = {
      kiln: cond.machineSpeed(s, 'kiln'),
      crusher: cond.machineSpeed(s, 'crusher'),
      line: cond.conditionLine(s, 'kiln'),
    };
    // FOUR MINUTES OF THE WORLD BEING HOT. Nothing here touches a machine.
    for (let i = 0; i < 250; i++) cond.tickCondition(s, m, 1);
    const read = circ.availableReads(s).find((r: { id: string }) => r.id === 'condition');
    return {
      before,
      warmFaster: cond.machineSpeed(s, 'kiln') > 1,
      brittleSeized: cond.machineSpeed(s, 'crusher') === 0,
      line: cond.conditionLine(s, 'kiln'),
      crackLine: cond.conditionLine(s, 'crusher'),
      readOffered: !!read,
      readsKiln: read ? String(read.read(s, m, 'kiln')) : '',
      readsCrusher: read ? String(read.read(s, m, 'crusher')) : '',
    };
  });
  check([e2.before.kiln, e2.before.crusher], [1, 1], [0, 0], 'D — before: both machines run plain');
  check(e2.warmFaster, true, false, `D — a WARM kiln runs quicker: ${e2.line}`);
  check(e2.brittleSeized, true, false, `D — a BRITTLE crusher CRACKED: ${e2.crackLine}`);
  check(e2.readOffered, true, false, 'D — the Circuit is offered the condition read');
  check([e2.readsKiln, e2.readsCrusher], ['baked', 'seized'], ['none', 'none'],
    'D — and it reads the strip\'s OWN machine, not a global');

  // the re-cast, through the real dispatch
  const recast = await page.evaluate(async () => {
    const cond = await import(/* @vite-ignore */ '/src/engine/systems/condition' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string } }>;
    const s = w['__engine']!.getState() as unknown as { casting: { rack: unknown[]; nextId: number } };
    const blockedBroke = cond.recastBlocker(s, 'crusher');
    s.casting.rack = [1, 2, 3].map((i) => ({ id: 900 + i, materialId: 'marl', type: 'head', purity: 50 }));
    const r = w['__engine']!.dispatch({ type: 'recastMachine', machineId: 'crusher' });
    return {
      blockedBroke,
      ok: r.ok,
      speed: cond.machineSpeed(s as never, 'crusher'),
      left: s.casting.rack.length,
    };
  });
  check(recast.blockedBroke !== null, true, false, `D — with an empty rack it refuses: "${recast.blockedBroke}"`);
  check([recast.ok, recast.speed, recast.left], [true, 1, 1], [false, 0, 3],
    'D — a re-cast clears it, spends two parts, and it runs again');

  // ═══ E — GLASSMERE'S §7.2 RULE ═══════════════════════════════════════════
  console.log('\n== E — GLASSMERE, THE ONE CONDITION YOU CAN AIM ================');
  /**
   * THE SPLIT IS THE GATE, and finding that out is half of what this block
   * proves. `litBands` treats WHITE (colour 0) as lighting all six, because a
   * pre-Split beam carries the whole gift at once — so Glassmere's UNLIT rule
   * CANNOT FIRE until `splitUnlocked` (glassmere mastery 25, i.e. a depth
   * record of 250+). The first draft of this block seeded the beam by hand,
   * measured "every band is lit" and read it as a bug in the rule. It is the
   * rule working: the shell's own system is what makes the condition possible.
   */
  await setup(page, `
    const s = engine.getState();
    s.shell.current = 'glassmere';
    s.shell.breachCount = 4;
    s.depthRecords['glassmere'] = 380;
    s.maxDepthRecord = 380;
    s.kiln.built = true;
    s.plant.tiers['crusher'] = 1;
  `);
  const glass = await page.evaluate(async () => {
    const cond = await import(/* @vite-ignore */ '/src/engine/systems/condition' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean } }>;
    const refr = await import(/* @vite-ignore */ '/src/engine/systems/refraction' + '.ts');
    const s = w['__engine']!.getState();
    const m = new modsMod.ModifierCache(); m.invalidate();
    // WHAT THE LIVE BEAM IS ACTUALLY CARRYING. Read, never seeded: the engine
    // re-traces every tick, so a hand-written path is gone by the next frame.
    const bands = [...(cond.litBands(s) as Set<number>)];
    const split = refr.splitUnlocked(s) as boolean;
    const darkBand = [0, 1, 2, 3, 4, 5].find((b) => !bands.includes(b));
    const litBand = bands[0];
    // IN A LIT BAND: nothing happens.
    w['__engine']!.dispatch({ type: 'setMachineBand', machineId: 'crusher', band: litBand });
    for (let i = 0; i < 250; i++) cond.tickCondition(s, m, 1);
    const lit = { cond: cond.conditionOf(s, 'crusher'), speed: cond.machineSpeed(s, 'crusher') };
    // MOVE IT INTO THE DARK: half speed, and the band survives at tier I.
    w['__engine']!.dispatch({ type: 'setMachineBand', machineId: 'crusher', band: darkBand });
    const tierIRetains = plant.retainsBand(s, 'crusher');
    for (let i = 0; i < 250; i++) cond.tickCondition(s, m, 1);
    return {
      split, bands, litBand, darkBand,
      litSpeed: lit.speed,
      litCond: lit.cond === null,
      tierIRetainsBefore: tierIRetains,
      unlit: cond.conditionOf(s, 'crusher')?.id ?? 'none',
      unlitSpeed: cond.machineSpeed(s, 'crusher'),
      unlitRetains: plant.retainsBand(s, 'crusher'),
    };
  });
  check(glass.split, true, false, 'E — THE SPLIT is the gate: white lights everything');
  check([glass.litCond, glass.litSpeed], [true, 1], [false, 0.5],
    `E — a machine in band ${glass.litBand} (lit: ${glass.bands.join(',')}) is untouched`);
  check(glass.darkBand !== undefined, true, false,
    `E — the beam leaves band ${glass.darkBand} dark`);
  check([glass.unlit, glass.unlitSpeed], ['unlit', 0.5], ['none', 1],
    'E — in the DARK it runs at half');
  check([glass.tierIRetainsBefore, glass.unlitRetains], [false, true], [true, true],
    'E — ...and a TIER-I machine keeps the band it would have lost');
  await tab(page, 'plant').catch(() => {});
  await page.screenshot({ path: `${OUT}/a90-glassmere-condition.png`, fullPage: true }).catch(() => {});

  // ═══ F/G/H/I/J/K — THE THREE MACHINES ════════════════════════════════════
  console.log('\n== THE THREE MACHINES =========================================');
  await setup(page, `
    const s = engine.getState();
    s.shell.current = 'ferrite';
    s.shell.breachCount = 4;
    s.depthRecords['ferrite'] = 250;
    s.maxDepthRecord = 250;
    s.kiln.built = true;
    s.plant.tiers['crusher'] = 1;
    s.currencies['flux'] = engine.getState().currencies['flux'];
  `);
  const machines = await page.evaluate(async () => {
    const roll = await import(/* @vite-ignore */ '/src/engine/systems/roll' + '.ts');
    const sieve = await import(/* @vite-ignore */ '/src/engine/systems/sieve' + '.ts');
    const still = await import(/* @vite-ignore */ '/src/engine/systems/still' + '.ts');
    const breaker = await import(/* @vite-ignore */ '/src/engine/systems/breaker' + '.ts');
    const plant = await import(/* @vite-ignore */ '/src/engine/systems/plant' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string } }>;
    const s = w['__engine']!.getState() as unknown as {
      casting: { rack: unknown[]; nextId: number }; roll: { looted: string[] };
    };
    // BEFORE THE WALK: found nowhere, and each says which wreck holds it.
    s.roll.looted = [];
    s.casting.rack = Array.from({ length: 30 }, (_, i) =>
      ({ id: 1000 + i, materialId: 'marl', type: 'head', purity: 40 + i }));
    s.casting.nextId = 1030;
    const before = {
      sieve: (w['__engine']!.dispatch({ type: 'buildSieve' }) as { reason?: string }).reason ?? '',
      still: (w['__engine']!.dispatch({ type: 'buildStill' }) as { reason?: string }).reason ?? '',
      breaker: (w['__engine']!.dispatch({ type: 'buildBreaker' }) as { reason?: string }).reason ?? '',
    };
    // WALK FERRITE, AND VERDANCE FOR THE STILL.
    roll.markReached(s, 250, 15);
    const shell = (s as unknown as { shell: { current: string } }).shell;
    shell.current = 'verdance';
    roll.markReached(s, 290, 15);
    shell.current = 'ferrite';

    const found = {
      sieve: sieve.sieveFound(s), still: still.stillFound(s), breaker: breaker.breakerFound(s),
    };
    const rackBefore = s.casting.rack.length;
    const built: Record<string, number> = {};
    for (let t = 0; t < 3; t++) {
      w['__engine']!.dispatch({ type: 'buildSieve' });
      w['__engine']!.dispatch({ type: 'buildStill' });
      w['__engine']!.dispatch({ type: 'buildBreaker' });
    }
    for (const id of ['sieve', 'still', 'breaker']) built[id] = plant.tierOf(s, id);
    return {
      before, found, rackSpent: rackBefore - s.casting.rack.length, built,
      madeOf: (s as unknown as { plant: { builtOf: Record<string, string[]> } }).plant.builtOf,
      station: {
        sieve: sieve.sieveStation(), still: still.stillStation(), breaker: breaker.breakerStation(),
      },
    };
  });
  check(machines.before.sieve.includes("Siever's Rest"), true, false,
    `F — before the walk the Sieve says where it is: "${machines.before.sieve}"`);
  check(machines.before.still.includes("Stillwright's Bower"), true, false,
    `F — the Still: "${machines.before.still}"`);
  check(machines.before.breaker.includes("Breaker's Yard"), true, false,
    `F — the Breaker: "${machines.before.breaker}"`);
  check([machines.found.sieve, machines.found.still, machines.found.breaker], [true, true, true],
    [false, false, false], 'F — after the walk, all three are found');
  check(machines.built, { sieve: 3, still: 3, breaker: 3 }, { sieve: 0, still: 0, breaker: 0 },
    'F — all three raised to tier III, FROM CAST PARTS');
  check(machines.rackSpent, 30, 0, 'F — and it cost 30 parts off the rack');
  check(
    ['sieve', 'still', 'breaker'].every((id) => (machines.madeOf[id] ?? []).length > 0),
    true, false, 'F — each one remembers what it was cast from (§11.2)',
  );

  // ── G — SORTING, and §25.5's sentence ────────────────────────────────────
  console.log('\n-- G: crush only stone under Fair ------------------------------');
  const sorting = await page.evaluate(async () => {
    const sieve = await import(/* @vite-ignore */ '/src/engine/systems/sieve' + '.ts');
    const crusher = await import(/* @vite-ignore */ '/src/engine/systems/crusher' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const circ = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string; data?: unknown } }>;
    const s = w['__engine']!.getState() as unknown as { plant: { surge: number }; drills: { bayBuilt: boolean; units: unknown[] } };
    const m = new modsMod.ModifierCache(); m.invalidate();
    for (let i = 0; i < 8; i++) forge.addMaterial(s, 'rustmarrow', 30);   // poor
    for (let i = 0; i < 8; i++) forge.addMaterial(s, 'rustmarrow', 90);   // fine
    const bandsBefore = (crusher.crushable(s) as { materialId: string; band: string }[])
      .filter((c) => c.materialId === 'rustmarrow').map((c) => c.band).sort();

    const add = w['__engine']!.dispatch({ type: 'addFilter', clauses: [{ kind: 'band', op: 'atMost', band: 'fair' }] });
    const id = (add.data as { id: string }).id;
    const sentence = sieve.filterSentence(sieve.ensureSorting(s).filters[0]);
    w['__engine']!.dispatch({ type: 'assignFilter', machineId: 'crusher', filterId: id });
    const bandsAfter = (crusher.crushable(s) as { materialId: string; band: string }[])
      .filter((c) => c.materialId === 'rustmarrow').map((c) => c.band).sort();

    s.plant.surge = 999;
    const refused = w['__engine']!.dispatch({ type: 'crush', materialId: 'rustmarrow', band: 'fine' });
    s.plant.surge = 999;
    const taken = w['__engine']!.dispatch({ type: 'crush', materialId: 'rustmarrow', band: 'poor' });
    const stillHeld = forge.materialCount(s, 'rustmarrow');

    // THE CIRCUIT TAKES IT AS AN ACTION.
    w['__engine']!.dispatch({ type: 'assignFilter', machineId: 'crusher', filterId: null });
    const acts = (circ.availableActs(s, 'crusher') as { id: string; label: string }[]);
    const row = acts.find((a) => a.id === `filter:crusher:${id}`);
    const circuit = await import(/* @vite-ignore */ '/src/engine/systems/circuit' + '.ts');
    const c = circuit.ensureCircuit(s) as { opened: boolean; strips: Record<string, unknown>; last: Record<string, number> };
    c.opened = true;
    c.strips['crusher'] = [{ read: 'depth', op: 'gt', value: -1, act: `filter:crusher:${id}` }];
    c.last['crusher'] = -1;
    const beforeThrow = sieve.filterOf(s, 'crusher') === null;
    circuit.tickCircuit(s, m, { emit() {}, dirty() {} }, 2);
    return {
      bandsBefore, bandsAfter, sentence,
      refused: refused.reason ?? '', taken: taken.ok, stillHeld,
      actLabel: row?.label ?? '', hasUnfilter: acts.some((a) => a.id === 'unfilter:crusher'),
      beforeThrow, afterThrow: sieve.filterOf(s, 'crusher')?.id === id,
    };
  });
  check(sorting.bandsBefore, ['fine', 'poor'], [], 'G — BEFORE: the Crusher is offered both bands');
  check(sorting.sentence, 'is under fair', 'anything', 'G — the filter reads as English');
  check(sorting.bandsAfter, ['poor'], ['fine', 'poor'], 'G — AFTER: it is offered one');
  check(sorting.refused.includes('is under fair'), true, false,
    `G — and the fine stack is refused BY NAME: "${sorting.refused}"`);
  check([sorting.taken, sorting.stillHeld >= 8], [true, true], [false, false],
    'G — the poor stack goes through, and the fine one is still in the Hold');
  check(sorting.actLabel, 'take only what is under fair', '',
    'G — the Circuit offers FILTER as an action');
  check(sorting.hasUnfilter, true, false, 'G — ...and a row that takes it back off');
  check([sorting.beforeThrow, sorting.afterThrow], [true, true], [false, false],
    'G — a live strip THROWS it: the machine ends up filtered');

  // ── H — a trap distilled ─────────────────────────────────────────────────
  console.log('\n-- H: a trap distilled -----------------------------------------');
  const distil = await page.evaluate(async () => {
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const traps = await import(/* @vite-ignore */ '/src/engine/content/traps' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cfp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string } }>;
    const s = w['__engine']!.getState();
    // `new Function`, not a const arrow — see the note at the top of this file.
    const worth = new Function('id', 'type', 'fp', 'cfp', `
      const d = fp.derivePart(fp.makePart(type, id, 80));
      return cfp.TOOL_STATS.reduce((n, k) => n + d.stats[k] / cfp.STAT_BASE[k], 0);
    `) as (id: string, type: string, a: unknown, b: unknown) => number;
    const t = (traps.TRAPS as { materialId: string; trait: string; part: string }[])[0]!;
    forge.addMaterial(s, t.materialId, 80);
    const before = worth(t.materialId, t.part, fp, cfp);
    const r = w['__engine']!.dispatch({ type: 'distil', materialId: t.materialId, band: 'fine', trait: t.trait });
    const into = traps.stilledId(t.materialId, t.trait);
    return {
      trap: t.materialId, trait: t.trait, part: t.part,
      ok: r.ok, reason: r.reason ?? '',
      gone: forge.materialCount(s, t.materialId),
      made: forge.materialCount(s, into),
      name: (() => { try { return mats.materialDef(into).name; } catch { return ''; } })(),
      gain: Math.round((worth(into, t.part, fp, cfp) / before - 1) * 1000) / 10,
      leftTraits: (await import(/* @vite-ignore */ '/src/engine/traits' + '.ts')).traitsOf(into),
    };
  });
  check([distil.ok, distil.gone, distil.made], [true, 0, 1], [false, 1, 0],
    `H — ${distil.trap} at fine, ${distil.trait} out — one unit in, one out`);
  check(distil.gain > 15, true, false,
    `H — and it is a better ${distil.part}: +${distil.gain}% (now ${distil.name}, ${distil.leftTraits.join('+')})`);

  // ── I — a part broken back, and DESIGN cut ───────────────────────────────
  console.log('\n-- I: a part back to the Hold ----------------------------------');
  const broke = await page.evaluate(async () => {
    const breaker = await import(/* @vite-ignore */ '/src/engine/systems/breaker' + '.ts');
    const forge = await import(/* @vite-ignore */ '/src/engine/systems/forge' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string } }>;
    const s = w['__engine']!.getState() as unknown as { casting: { rack: { id: number }[]; nextId: number }; materials: { totalDrops: number } };
    s.casting.rack = [{ id: 5000, materialId: 'ironbloom', type: 'head', purity: 70 } as never];
    const rows = breaker.breakable(s) as { partId: number; units: number; name: string }[];
    const held = forge.materialCount(s, 'ironbloom');
    const drops = s.materials.totalDrops;
    const r = w['__engine']!.dispatch({ type: 'breakPart', partId: 5000 });
    const dump = JSON.stringify(s).toLowerCase();
    return {
      offered: rows.length, units: rows[0]?.units ?? 0, name: rows[0]?.name ?? '',
      ok: r.ok, gained: forge.materialCount(s, 'ironbloom') - held,
      rackLeft: s.casting.rack.length,
      driftsInDrops: s.materials.totalDrops - drops,
      design: dump.includes('blueprint') || dump.includes('design'),
    };
  });
  check([broke.ok, broke.gained === broke.units, broke.rackLeft], [true, true, 0], [false, false, 1],
    `I — one ${broke.name} part -> ${broke.units} units in the Hold`);
  check(broke.driftsInDrops, 0, broke.units, 'I — a return is not a find: `totalDrops` does not move');
  check(broke.design, false, true, 'I — "back to DESIGN" is CUT — no design, no blueprint, anywhere');

  // ── J — un-shoring returns the timber ────────────────────────────────────
  console.log('\n-- J: un-shoring returns the timber ----------------------------');
  const timber = await page.evaluate(async () => {
    const shoring = await import(/* @vite-ignore */ '/src/engine/systems/shoring' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean; reason?: string; data?: unknown } }>;
    const s = w['__engine']!.getState() as unknown as {
      roll: { rig: boolean; shored: string[] }; casting: { rack: unknown[]; nextId: number };
      currencies: Record<string, unknown>; plant: { tiers: Record<string, number> };
    };
    const D = (await import(/* @vite-ignore */ '/src/engine/decimal' + '.ts')).D;
    s.roll.rig = true;
    s.currencies['flux'] = D('1e18');
    const out: { cost: number; drift: number; back: number; rackDelta: number; shoredAfter: number }[] = [];
    for (const tier of [1, 2]) {
      s.plant.tiers['breaker'] = tier;
      s.roll.shored = [];
      s.casting.rack = Array.from({ length: 12 }, (_, i) =>
        ({ id: 7000 + tier * 100 + i, materialId: 'marl', type: 'head', purity: 50 }));
      s.casting.nextId = 7500 + tier * 100;
      const cost = (shoring.shoreCost(s, 'lodestonecut') as { parts: number }).parts;
      w['__engine']!.dispatch({ type: 'shoreBand', stationId: 'lodestonecut' });
      const drift = shoring.driftDepth(s);
      const rackBefore = s.casting.rack.length;
      const r = w['__engine']!.dispatch({ type: 'unshoreBand', stationId: 'lodestonecut' });
      out.push({
        cost, drift, back: (r.data as { partsBack: number })?.partsBack ?? -1,
        rackDelta: s.casting.rack.length - rackBefore, shoredAfter: s.roll.shored.length,
      });
    }
    return { one: out[0]!, two: out[1]! };
  });
  check([timber.one.drift, timber.one.back, timber.one.rackDelta], [14, 0, 0], [0, 1, 1],
    'J — a tier-I Breaker gives nothing back — the old behaviour exactly');
  check([timber.two.drift, timber.two.back > 0, timber.two.rackDelta === timber.two.back],
    [14, true, true], [0, false, false],
    `J — a tier-II one hands ${timber.two.back} of ${timber.two.cost} props back`);
  check(timber.two.shoredAfter, 0, 1, 'J — and the drift is gone either way');

  // ── K — tiers do DIFFERENT things, not more ──────────────────────────────
  console.log('\n-- K: I vs II vs III ------------------------------------------');
  const tiers = await page.evaluate(async () => {
    const sieve = await import(/* @vite-ignore */ '/src/engine/systems/sieve' + '.ts');
    const still = await import(/* @vite-ignore */ '/src/engine/systems/still' + '.ts');
    const breaker = await import(/* @vite-ignore */ '/src/engine/systems/breaker' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never }>;
    const s = w['__engine']!.getState() as unknown as { plant: { tiers: Record<string, number> } };
    const rows: number[][] = [];
    for (const t of [1, 2, 3]) {
      s.plant.tiers['sieve'] = t; s.plant.tiers['still'] = t; s.plant.tiers['breaker'] = t;
      rows.push([
        sieve.clauseLimit(s), sieve.rejectsRoute(s) ? 1 : 0,
        still.canTake(s, 'millstone', 'dense') ? 1 : 0, still.canTake(s, 'umberjade', 'brittle') ? 1 : 0,
        breaker.returnsProps(s) ? 1 : 0, breaker.breaksInBulk(s) ? 1 : 0,
      ]);
    }
    return { i: rows[0]!, ii: rows[1]!, iii: rows[2]! };
  });
  check(tiers.i, [1, 0, 0, 0, 0, 0], [2, 1, 1, 1, 1, 1], 'K — tier I: one clause, the named fault, one part');
  check(tiers.ii, [2, 0, 1, 0, 1, 0], tiers.i, 'K — tier II: two clauses, any trap trait, props back');
  check(tiers.iii, [2, 1, 1, 1, 1, 1], tiers.ii, 'K — tier III: rejects route, any stone, the whole rack');

  // ═══ L — THE CLONE CHECKS, RED-TESTED ════════════════════════════════════
  console.log('\n== L — THE CLONE CHECKS =======================================');
  const clones = await page.evaluate(async () => {
    const mats = await import(/* @vite-ignore */ '/src/engine/materials' + '.ts');
    const fp = await import(/* @vite-ignore */ '/src/engine/systems/forgeParts' + '.ts');
    const cfp = await import(/* @vite-ignore */ '/src/engine/content/forgeParts' + '.ts');
    const traits = await import(/* @vite-ignore */ '/src/engine/traits' + '.ts');
    const table = traits.MATERIAL_TRAITS as Record<string, string[]>;
    const mined = (mats.MATERIALS as { id: string; name: string; shellId: string; worked?: boolean; source?: string }[])
      .filter((m) => !m.worked && m.source !== 'combat');
    // `new Function` rather than a const arrow: esbuild's `keepNames` rewrites
    // a named function inside an evaluate into `__name(...)`, and `__name` does
    // not exist in the page. See the note at the top of this file.
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
    // RED-TEST: put the three A.90 clones back, one at a time.
    const red: string[] = [];
    for (const [id, was, shell] of [
      ['nullchalk', ['light', 'hollow'], 'hollow'],
      ['lacuna', ['hollow', 'charged'], 'hollow'],
      ['authorsInk', ['trueseated', 'charged'], 'aleph'],
    ] as [string, string[], string][]) {
      const keep = table[id];
      table[id] = was;
      red.push(...scan(shell, mined, fp, cfp));
      table[id] = keep!;
    }
    return { counts, green, red: [...new Set(red)].sort() };
  });
  check(clones.green, [], ['x'],
    `L — no clones: ${Object.entries(clones.counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  check(clones.red, ['Lacuna Stone = Absencia', "The Author's Ink = Ruleshard", 'Nullchalk = Nothingstone'].sort(), [],
    'L — RED-TESTED: the old traits fail it, by name');

  // ═══ M — PILLAR 2 ════════════════════════════════════════════════════════
  console.log('\n== M — PILLAR 2 ===============================================');
  const pillar = await page.evaluate(async () => {
    const face = await import(/* @vite-ignore */ '/src/engine/systems/face' + '.ts');
    const cond = await import(/* @vite-ignore */ '/src/engine/systems/condition' + '.ts');
    const modsMod = await import(/* @vite-ignore */ '/src/engine/modifiers' + '.ts');
    const w = window as unknown as Record<string, { getState: () => never; dispatch: (a: unknown) => { ok: boolean } }>;
    const s = w['__engine']!.getState() as unknown as {
      depth: number; plant: { tiers: Record<string, number> };
    };
    s.depth = 48;                       // THE SAME DEPTH IN BOTH ARMS
    s.plant.tiers = {};
    let m = new modsMod.ModifierCache(); m.invalidate();
    const bare = Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 1e6);
    // EVERYTHING LIVE: three machines at tier III, every condition written.
    for (const id of ['sieve', 'still', 'breaker', 'crusher', 'refinery']) s.plant.tiers[id] = 3;
    for (const id of cond.conditionedMachines() as string[]) {
      cond.ensureCondition(s)[id] = { id: 'baked', level: 1, seized: true };
    }
    w['__engine']!.dispatch({ type: 'addFilter', clauses: [{ kind: 'trait', trait: 'dense' }] });
    m = new modsMod.ModifierCache(); m.invalidate();
    const loaded = Math.round((face.dpsMax(s, m) as { toNumber: () => number }).toNumber() * 1e6);
    return { bare, loaded, depth: s.depth };
  });
  check(pillar.loaded, pillar.bare, pillar.bare + 1,
    `M — dpsMax at depth ${pillar.depth} is identical bare and fully loaded (${pillar.bare})`);

  // ═══ N — §23, 380px, errors ══════════════════════════════════════════════
  console.log('\n== N — the opening, 380px, page errors ========================');
  /**
   * §23 SAYS 2.88 AND A LIVE PAGE READS 2.97, AND THE GAP IS EXPLAINED RATHER
   * THAN TOLERATED.
   *
   * Headless at t=0 the engine gives exactly 2.88 (`6x6 x cap 8 x regen 0.08`).
   * Five seconds later a FRESH save reads 2.9664, because the face starts every
   * cell AT CAP and the `fullField` achievement is therefore true on the first
   * tick — it fires before the player has done anything and pays about +3.1%.
   * So §23's headline number is true for one tick of a game nobody is playing.
   *
   * Not this pass's doing, not obviously a defect (a free achievement in the
   * first second is a fine opening beat), and worth writing down: the number
   * every pacing document quotes is the pre-achievement one.
   */
  check([opening.cells, opening.depth, opening.fullField], [36, 0, true], [0, 1, false],
    'N — §23 opening: 36 cells, depth 0, and `fullField` already unlocked');
  check(opening.dps, 2.97, 2.88,
    `N — ...so a LIVE fresh page reads ${opening.dps}, not §23's 2.88 (headless t=0 is exactly 2.88)`);

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
  check(layout.over, 0, 1, `N — 0 elements overflow 380px (doc ${layout.doc}px)`);
  if (layout.over > 0) console.log(`      ${layout.first.join(' | ')}`);
  check(layout.clipped, [], ['x'], 'N — 0 labels clipped to nothing');
  check(errors.length, 0, 1, 'N — 0 page errors');
  for (const e of errors.slice(0, 5)) console.log(`      ${e}`);

  console.log(`\n${problems.length === 0 ? 'ALL PASS' : `${problems.length} PROBLEM(S)`}`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log(`shots in ${OUT}/`);
  await browser.close();
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
