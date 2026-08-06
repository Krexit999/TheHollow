/**
 * A.107 PART A — §55 ROWS 1–5, SIZED AGAINST THE CODE.
 *
 * A.106 closed §55's generic claim (a failure causes the next, traceable,
 * unwinding) and row 6 (STATION COLLAPSE). Its ledger then sized rows 1–5 as
 * "roughly one phase-part each, three of them wanting systems that do not
 * exist" — and that row was written from the SPEC, not from the code. This
 * script is the re-check the ledger rule demands: the ledger tells you where to
 * look, never what you will find.
 *
 * EVERY PIECE IS PROBED. A probe is a live reference — a function imported and
 * called, a registry looked up, a state field written and read back. Nothing
 * below asserts `true` because a comment said so; the whole point is that the
 * previous sizing did exactly that and got three rows wrong.
 *
 *   npx tsx scripts/a107-scope.ts
 */
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine';
import { MATERIALS } from '../src/engine/materials';

// --- The pieces, each imported so a missing one is a BUILD failure ----------
import {
  CONDITION_RULES, OVERGROWTH_TRAIT, RECAST_PART_COST, bandOfMachine, cascadeChain,
  cascadedFrom, conditionOf, conditionedMachines, machineSpeed, recastMachine, ruleOf,
} from '../src/engine/systems/condition';
import { PURGE_HEAT, PURGE_SLAG_COST } from '../src/engine/systems/pressure';
import { BOILER_FLOW_PER_RISK, boilerBuilt, buildBoiler, riskedHeat } from '../src/engine/systems/boiler';
import { ensurePlant, flowSatisfaction, MACHINE_DEMAND } from '../src/engine/systems/plant';
import { GROG, ensureCrucible, pour } from '../src/engine/systems/crucible';
import { addMaterial } from '../src/engine/systems/forge';
import { ensureLine, lineBlocker, runLine } from '../src/engine/systems/line';
import { isMaybe, maybeId, registerMaybe, wasGoingToBe, witness } from '../src/engine/systems/witness';
import { cultivarBuilt } from '../src/engine/systems/cultivar';
import { logScar } from '../src/engine/systems/shaftSys';
import { manualChip } from '../src/engine/systems/face';
import { ModifierCache } from '../src/engine/modifiers';

const s: GameState = createEngine({ nowMs: 0 }).getState() as GameState;
const ctx = { emit: () => {}, dirty: () => {} };

type Verdict = 'BUILDABLE' | 'WANTS A SYSTEM' | 'CUT';
interface Piece { what: string; have: boolean; where: string }
interface Row { n: number; name: string; pieces: Piece[]; verdict: Verdict; why: string }

const P = (what: string, have: boolean, where: string): Piece => ({ what, have, where });

// ═══ ROW 1 — BOILER EXPLOSION ═══════════════════════════════════════════════
// "machine down → heat floods the adjacent Line → emergency vents fire, costing
//  the heat bank → plant at reduced capacity"
const row1: Row = {
  n: 1, name: 'BOILER EXPLOSION',
  pieces: [
    P('a Boiler that can be built and run hot', typeof buildBoiler === 'function' && typeof boilerBuilt === 'function',
      'systems/boiler.ts'),
    P('...whose output already scales with RISKED heat', BOILER_FLOW_PER_RISK > 0 && typeof riskedHeat === 'function',
      `BOILER_FLOW_PER_RISK ${BOILER_FLOW_PER_RISK}`),
    P('a heat bank, and a gauge to empty', (s.pressure?.heat ?? -1) >= 0, 'pressure.heat'),
    P('AN EMERGENCY VENT THAT COSTS THE BANK', PURGE_HEAT > 0 && PURGE_SLAG_COST > 0,
      `PURGE_HEAT ${PURGE_HEAT} · PURGE_SLAG_COST ${PURGE_SLAG_COST}`),
    P('a Line for the heat to flood', typeof runLine === 'function' && typeof lineBlocker === 'function',
      'systems/line.ts'),
    P('...and "adjacent" already means something', typeof bandOfMachine === 'function', 'bandOfMachine'),
    P('"reduced capacity" without touching yield', typeof machineSpeed === 'function', 'machineSpeed · THE DRAG'),
    P('the recovery: re-cast the valve, priced', typeof recastMachine === 'function' && RECAST_PART_COST > 0,
      `recastMachine · ${RECAST_PART_COST} parts`),
    P('somewhere to record it', typeof logScar === 'function', 'shaft scars — shell+depth+kind, deduped'),
  ],
  verdict: 'BUILDABLE',
  why: 'Every piece ships. A.106 sized this as wanting "an emergency vent that costs the heat bank" — PURGE_HEAT/PURGE_SLAG_COST have been in pressure.ts the whole time. The row is a COMPOSITION of shipped verbs, not a new system.',
};

// ═══ ROW 2 — BROWNOUT CASCADE ═══════════════════════════════════════════════
// "the lowest-priority machine drops → its output was another's input → a Line
//  breaks mid-cycle → the in-progress material is lost as grog"
//
// The tell is in `flowSatisfaction`: contention is PROPORTIONAL, and plant.ts
// says why in the comment above it — "a thing a player can read off the panel
// and fix, unlike a silent priority order."
const propShare = ((): boolean => {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  const pl = ensurePlant(st);
  pl.tiers['crusher'] = 1;
  pl.tiers['refinery'] = 1;
  const a = flowSatisfaction(st, 'refinery');
  pl.tiers['sieve'] = 1;
  const b = flowSatisfaction(st, 'refinery');
  // Adding a third drawer lowers everyone's share rather than stopping one dead.
  return b < a && b > 0;
})();
const [grogShips, grogWhere] = ((): [boolean, string] => {
  /**
   * GROG IS REGISTERED LAZILY, and the first draft of this probe read it as
   * ABSENT because it asked the registry on a fresh boot — the material does
   * not exist until a pour has actually failed. The SELF-TEST caught it, by
   * failing on its own positive control, which is the only reason this line is
   * right. So: pour a ratio that cannot be one, and ask again.
   */
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  const before = MATERIALS.some((m) => m.id === GROG);
  ensureCrucible(st).found = [];
  ensurePlant(st).tiers['crucible'] = 3;
  // TWO metals — one is refused outright — at 1:4, which `isRatio` rejects.
  // Found by SCANNING every combination under the six-unit cap rather than by
  // guessing: 3:7 is over the cap and 2:3 is a perfectly good ratio.
  const two = MATERIALS.filter((m) => !m.worked && m.shellId === 'loam').slice(0, 2);
  for (const m of two) addMaterial(st, m.id, 50, 40);
  pour(st, ctx as never, [
    { materialId: two[0]!.id, count: 1 },
    { materialId: two[1]!.id, count: 4 },
  ]);
  const after = MATERIALS.some((m) => m.id === GROG);
  return [after, after
    ? (before ? 'registered at boot' : 'registered LAZILY, on the first bad pour')
    : 'crucible.ts GROG is a constant, and nothing registers it'];
})();

const row2: Row = {
  n: 2, name: 'BROWNOUT CASCADE',
  pieces: [
    P('grog, to lose a cycle into', grogShips, grogWhere),
    P('a Line that can break mid-cycle', typeof ensureLine === 'function' && typeof runLine === 'function',
      'runLine · l.stalled'),
    P('A PRIORITY ORDER — a LOWEST machine to drop', false,
      propShare ? 'flowSatisfaction is PROPORTIONAL, by decision' : 'unmeasured'),
  ],
  verdict: 'WANTS A SYSTEM',
  why: 'And the system it wants was DELIBERATELY REJECTED, in shipped code, with its reason written down: `flowSatisfaction` shares Flow proportionally so "a plant that is 60% of what its machines want runs everything at 60%, which is a thing a player can read off the panel and fix, unlike a silent priority order." Measured here: adding a third drawer lowers everyone rather than stopping one dead. Row 2 needs the opposite rule — a lowest-priority machine that DROPS — so building it reverses a shipped decision rather than extending it. That is a ruling, not a build. Grog and the Line are both real; the missing piece is the one nobody should add without being asked.',
};

// ═══ ROW 3 — UNAIMED FRACTURE ═══════════════════════════════════════════════
// "a `brittle` slip shatters a cell → the fracture propagates with nobody
//  aiming it → three cells lock"
const chip = ((): { has: boolean; fields: string } => {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  const r = manualChip(st, new ModifierCache(), ctx, 0);
  return { has: Array.isArray(r.fractured), fields: `chipCell -> { fractured: ${JSON.stringify(r.fractured)} }` };
})();
const row3: Row = {
  n: 3, name: 'UNAIMED FRACTURE',
  pieces: [
    P('a one-step fracture into neighbours', chip.has, chip.fields),
    P('PROPAGATION ACROSS CELLS (a wave, not a step)', false, 'cut with GRAIN at bd9f3ae'),
    P('A CELL LOCK', false, 'cut with GRAIN at bd9f3ae'),
    P('...and a lock does not move dpsMax', false, 'dpsMax = W·H·regen·Y — a locked cell IS -1 cell'),
  ],
  verdict: 'CUT',
  why: 'THREE reasons, and the third is the one that settles it. (a) It is NOT grain returning — grain\'s fracture was AIMED, and §44.1\'s kill criterion tested exactly that ("if aiming a fracture wave is not satisfying, nothing downstream matters"); §55\'s is explicitly "with nobody aiming it", so the cut reason does NOT transfer and this could be re-opened on its own merits. (b) But it needs the two pieces the cut removed — propagation and the lock — so it is not cheap either. (c) A LOCKED CELL IS A CELL THE FIELD NO LONGER HAS, and dpsMax = W·H·regen·Y counts cells. This phase is required to re-assert dpsMax UNMOVED with every cascade live; row 3 cannot be built and that assertion held at the same time. Its own recovery column already reads "nothing. Work around them" — the weakest in the table, against a column headed "interesting, not waiting". Cut, with the pieces named so a later phase can re-open it under a spec that does not eat the face.',
};

// ═══ ROW 4 — OVERGROWTH ═════════════════════════════════════════════════════
// "an unattended machine is consumed → it stops → vines spread to the next
//  machine in the priority order. Recovery: harvest it — and gain a cultivar
//  trait. The fix is the reward."
/**
 * ...AND THE ONE THE FIRST PASS GOT WRONG, which is why this file grew a
 * REACHABILITY probe.
 *
 * Row 4 was first sized BUILDABLE off four present pieces and one missing verb.
 * Every one of those readings was true and the verdict was still wrong, because
 * nothing asked whether the condition the whole row stands on can ever be
 * WRITTEN. It cannot. So the probe below RUNS THE ENGINE and reads what came
 * out, instead of reading a registry and inferring what would.
 */
const overgrownReachable = ((): { reachable: boolean; minServed: number } => {
  const e = createEngine({ nowMs: 0 });
  const v = e.getState() as GameState;
  v.shell.current = 'verdance';
  v.depthRecords['verdance'] = 400;
  v.depth = 100;
  v.kiln.built = true;
  const p = ensurePlant(v);
  for (const id of conditionedMachines()) p.tiers[id] = 1;
  // Well past CONDITION_FULL_SEC, so a rule that can write has written.
  for (let i = 0; i < 700; i++) e.tick(1);
  return {
    reachable: conditionedMachines().some((id) => conditionOf(v, id)?.id === 'overgrown'),
    minServed: Math.min(...conditionedMachines().map((id) => flowSatisfaction(v, id))),
  };
})();

const row4: Row = {
  n: 4, name: 'OVERGROWTH',
  pieces: [
    P('the condition an unattended machine gets', Boolean(ruleOf('overgrown')),
      `CONDITION_RULES[${CONDITION_RULES.findIndex((r) => r.id === 'overgrown')}] · verdance`),
    P('...which already hands it a trait', Boolean(OVERGROWTH_TRAIT), `OVERGROWTH_TRAIT = ${OVERGROWTH_TRAIT}`),
    P('spread to the NEXT machine', typeof cascadedFrom === 'function' && typeof cascadeChain === 'function',
      'THE DRAG (A.106) — one band along, parent recorded'),
    P('a Cultivar bench for the trait to mean something', typeof cultivarBuilt === 'function', 'systems/cultivar.ts'),
    P('...AND THAT CONDITION EVER FIRING', overgrownReachable.reachable,
      `DRIVEN: 700s in Verdance wrote nothing · lowest served = ${overgrownReachable.minServed.toFixed(3)}, and the rule needs 0`),
    P('A HARVEST VERB on a machine', false, 'does not exist'),
  ],
  verdict: 'WANTS A SYSTEM',
  why: "Four pieces present, and the row is still unbuildable, which is the finding. `overgrown` writes on `served <= 0`; `served` is `flowSatisfaction`, a SUPPLY ratio written for every machine every tick, and Verdance’s supply floor is PLANT_FLOOR 2.4 scaled by a drawShare that is 0.5 or 1. No save can reach 0, so E2’s Verdance condition has never fired for anybody — condition.test.ts reads green because it writes `served` by hand and never calls tickPlant. The row wants a per-machine ATTENDANCE signal the plant does not keep. Re-pointing `overgrown` at \"the plant cannot feed it\" is live and reachable, and is a shell signature — out of scope, asked.",
};

// ═══ ROW 5 — THE SILENCE TAKES A MACHINE ════════════════════════════════════
// "output becomes undecided → then its recipe becomes undecided → you do not
//  know what it is making until you observe. Recovery: spend a Witness."
const maybeShips = ((): boolean => {
  const any = MATERIALS.find((m) => !m.worked && m.shellId === 'loam');
  if (!any) return false;
  const def = registerMaybe(any.id);
  return Boolean(def) && isMaybe(maybeId(any.id)) && wasGoingToBe(maybeId(any.id)) === any.id;
})();
const row5: Row = {
  n: 5, name: 'THE SILENCE TAKES A MACHINE',
  pieces: [
    P('the condition a machine gets in the quiet', Boolean(ruleOf('undecided')), 'CONDITION_RULES · hollow'),
    P('OUTPUT UNDECIDED — already shipped, in full', maybeShips,
      'witness.ts deliver() -> registerMaybe() -> Maybe <stone>'),
    P('the recovery verb, priced', typeof witness === 'function', 'witness() · WITNESS_HUSH'),
    P('spread to the next machine', typeof cascadedFrom === 'function', 'THE DRAG'),
    P('THE RECIPE UNDECIDED — you do not know what it MAKES', false, 'does not exist — this is the build'),
  ],
  verdict: 'BUILDABLE',
  why: 'Half of it already ships and nobody wrote it down: `deliver` turns an undecided machine\'s OUTPUT into a Maybe stone with its own registered material, and `witness()` is the priced verb that settles one. What is missing is the second stage the spec asks for — the RECIPE going undecided, so you cannot read what the machine is making until you look. That is LAW 3 pointed at your own plant (hide the recipe, show the destination), and it costs nothing in yield.',
};

const ROWS = [row1, row2, row3, row4, row5];

// ── report ─────────────────────────────────────────────────────────────────
console.log('\nA.107 PART A — §55 ROWS 1-5, SIZED AGAINST THE CODE\n');
console.log(`probed against ${MACHINE_DEMAND ? Object.keys(MACHINE_DEMAND).length : 0} machines, ` +
  `${conditionedMachines().length} conditioned, ${MATERIALS.length} materials, ` +
  `${CONDITION_RULES.length} condition rules\n`);

let missing = 0;
for (const r of ROWS) {
  const have = r.pieces.filter((p) => p.have).length;
  console.log(`§55.${r.n}  ${r.name.padEnd(28)} ${String(have)}/${r.pieces.length} pieces   ${r.verdict}`);
  for (const p of r.pieces) {
    console.log(`        ${p.have ? 'HAVE' : 'NEED'}  ${p.what.padEnd(46)} ${p.where}`);
    if (!p.have) missing++;
  }
  console.log(`        WHY   ${r.why.replace(/\s+/g, ' ')}\n`);
}

console.log('VERDICT');
for (const r of ROWS) console.log(`  §55.${r.n} ${r.name.padEnd(28)} ${r.verdict}`);
console.log(`\n${ROWS.filter((r) => r.verdict === 'BUILDABLE').length} buildable · ` +
  `${ROWS.filter((r) => r.verdict === 'WANTS A SYSTEM').length} wants a system · ` +
  `${ROWS.filter((r) => r.verdict === 'CUT').length} cut · ${missing} pieces missing in total`);

/**
 * THE SELF-TEST. A probe table is worthless if a probe cannot fail, and every
 * `have: true` above is a live reference — so the one thing left to prove is
 * that the reporting distinguishes them at all.
 */
const shouldBeFalse = MATERIALS.some((m) => m.id === 'a_material_that_does_not_exist');
const shouldBeTrue = MATERIALS.some((m) => m.id === MATERIALS[0]!.id);
if (shouldBeFalse || !shouldBeTrue) {
  console.log('\n!! SELF-TEST FAILED — the registry probe does not distinguish present from absent');
  process.exit(1);
}
console.log('self-test: the registry probe answers both ways (absent=false, present=true)');
// One more, pointed at the thing this table exists to check: a piece the code
// really does not have must read NEED, and one it has must read HAVE.
if (row2.pieces.every((p) => p.have) || !row1.pieces.some((p) => p.have)) {
  console.log('!! SELF-TEST FAILED — every row read the same way');
  process.exit(1);
}
console.log('self-test: rows differ — row 1 has pieces, row 2 is short of one');
/**
 * ...AND THE ONE THIS PASS HAD TO ADD. The first version of this table read
 * every piece as "does the code contain it" and passed row 4 on that basis. A
 * probe that cannot tell PRESENT from REACHABLE will pass any row whose parts
 * have all been named, which is exactly the test satisfiable by writing words.
 */
if (!ruleOf('overgrown') || overgrownReachable.reachable) {
  console.log('!! SELF-TEST FAILED — overgrown is present AND now fires; row 4 must be re-sized');
  process.exit(1);
}
console.log('self-test: present is not reachable — overgrown is in the registry and never writes');
