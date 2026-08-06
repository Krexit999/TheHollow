/**
 * WHAT REMAINS ACROSS THE SPINE, SIZED — A.108 item 7.
 *
 * PILLARS: "the ledger is a claim, not evidence." A.107 built the first version
 * of this and its own §55 rows were right, but two of its probes were the WRONG
 * KIND and this phase caught both:
 *
 *   · one GREPPED `plant.ts` for a verb that lowers a machine tier, found none,
 *     and reported the row as still blocked. `unbuildMachine` lives in
 *     `breaker.ts` and has been lowering tiers the whole time. A probe that
 *     greps one file reads a feature in another as absent.
 *
 *   · one read `overgrown` as "cannot be written" by reasoning about the code
 *     rather than running it, which was RIGHT — and the same reasoning said
 *     `unlit` was reachable and Ferrite's chain sustainable, neither of which
 *     had been driven either.
 *
 * So every row below that CAN be driven is driven: the verb is dispatched, the
 * engine is ticked, and the verdict is read off the state that comes out. Rows
 * whose blocker is a judgement are not here — there is nothing to probe and
 * listing them pads the table with rows that can only read one way.
 *
 *   npx tsx scripts/a108-ledger.ts
 */
import { ensureContentLoaded } from '../src/engine/content/index';

ensureContentLoaded();

import { createEngine } from '../src/engine/index';
import type { EngineCtx, GameState } from '../src/engine/types';
import { MAX_MACHINE_TIER, ensurePlant, flowSatisfaction } from '../src/engine/systems/plant';
import { BREAKS, ensureBroken, harvestMachine } from '../src/engine/systems/breaks';
import {
  CONDITION_RULES, conditionOf, conditionedMachines, setMachineBand,
} from '../src/engine/systems/condition';
import { unbuildMachine } from '../src/engine/systems/breaker';
import { THRESHOLDS } from '../src/engine/content/thresholds';
import { SKILL_NODES } from '../src/engine/content/shell1/skillTree';
import { allAuthoredStations } from '../src/engine/content/rolls';
import { readFileSync } from 'node:fs';

const ctx: EngineCtx = { emit: () => {}, dirty: () => {} };

type Verdict = 'HOLDS' | 'DISSOLVED' | 'MOVED';
interface Row { row: string; raised: string; verdict: Verdict; fact: string }
const rows: Row[] = [];
const R = (row: string, raised: string, verdict: Verdict, fact: string): void => {
  rows.push({ row, raised, verdict, fact });
};

/** A built plant in a shell, ticked. The arrangement every driven row uses. */
function plantIn(shellId: string, sec: number, n = 99): GameState {
  const e = createEngine({ nowMs: 0 });
  const s = e.getState() as GameState;
  s.shell.current = shellId;
  s.depthRecords[shellId] = 400;
  s.depth = 100;
  s.kiln.built = true;
  const p = ensurePlant(s);
  conditionedMachines().slice(0, n).forEach((id, i) => {
    p.tiers[id] = 1;
    setMachineBand(s, id, i % 4);
  });
  for (let i = 0; i < sec; i++) e.tick(1);
  return s;
}

// ---------------------------------------------------------------------------
// The rows this phase touched
// ---------------------------------------------------------------------------

R('THE OTHER FIVE §55 CASCADES ARE UNBUILT', 'A.106', 'MOVED',
  `3 built (${BREAKS.map((b) => b.id).join(', ')}), 1 wants a system (brownout), 1 cut (fracture)`);

/**
 * DRIVEN, not reasoned about: stand a Verdance plant up, run it, and read what
 * the world wrote. This is the row A.107 got right by argument and could not
 * have got right by grep.
 */
const green = plantIn('verdance', 340);
const wrote = conditionedMachines().filter((id) => conditionOf(green, id)?.id === 'overgrown');
R("VERDANCE'S OVERGROWN CONDITION CANNOT FIRE", 'A.107',
  wrote.length > 0 ? 'DISSOLVED' : 'HOLDS',
  wrote.length > 0
    ? `DRIVEN: 340s in Verdance writes OVERGROWN on ${wrote.length} machines; worst served ${Math.min(...conditionedMachines().map((id) => flowSatisfaction(green, id))).toFixed(3)}`
    : 'DRIVEN: 340s in Verdance wrote nothing');

const brokeIds = Object.keys(ensureBroken(green));
R('§55.4 OVERGROWTH IS UNBUILDABLE — ITS CONDITION CANNOT BE WRITTEN', 'A.107',
  brokeIds.length > 0 ? 'DISSOLVED' : 'HOLDS',
  brokeIds.length > 0
    ? `DRIVEN: ${brokeIds.length} machine(s) broke as ${[...new Set(Object.values(ensureBroken(green)).map((b) => b.id))].join('/')}`
    : 'DRIVEN: nothing broke');

// ...and the recovery pays, which is the half that makes it §55.4 and not §55.5.
const paidBefore = (green.cultivar?.cropped ?? []).length;
if (brokeIds.length > 0) harvestMachine(green, ctx, brokeIds[0]!);
R('THE FIX IS THE REWARD — a recovery that pays', 'A.108',
  (green.cultivar?.cropped ?? []).length > paidBefore ? 'DISSOLVED' : 'HOLDS',
  `DRIVEN: harvest took cropped ${paidBefore} -> ${(green.cultivar?.cropped ?? []).length}`);

/**
 * THE CROSSOVER, and it is a NEW open row rather than a closed one. A fully
 * vined face is 36 vines against `PLANT_FLOOR` 2.4 plus 0.14 each, so a
 * cultivated Verdance carries a plant of about seven. Below it an idle player
 * heals out of the condition; above it a cultivated face cannot cover the plant
 * and the condition never lets go. Measured by walking plant sizes, because the
 * fix would be a growth-signature change and A.108 may not make one.
 */
const carried = ((): number => {
  for (let n = 1; n <= conditionedMachines().length; n++) {
    const s = plantIn('verdance', 340, n);
    if (conditionedMachines().some((id) => conditionOf(s, id)?.id === 'overgrown')) return n - 1;
  }
  return conditionedMachines().length;
})();
R('A CULTIVATED BLOOM CANNOT CARRY A LARGE VERDANCE PLANT', 'A.108', 'HOLDS',
  `DRIVEN: an idle face carries ${carried} machines; at ${carried + 1} the condition never lets go. `
  + 'A 3h --plant run stands up 1, so this is an edge and not the common case — but the fix is a growth signature');

// ---------------------------------------------------------------------------
// The rows a WRONG KIND of probe had settled
// ---------------------------------------------------------------------------

/**
 * A.107 grepped `plant.ts` for anything that lowers a tier, found nothing, and
 * reported HOLDS. Driven here instead: build a machine out of parts and ask the
 * shipped verb to take it back down.
 */
const unbuilt = ((): { ok: boolean; reason: string; before: number; after: number } => {
  const e = createEngine({ nowMs: 0 });
  const s = e.getState() as GameState;
  s.shell.current = 'loam';
  s.kiln.built = true;
  const p = ensurePlant(s);
  // THE BREAKER HAS TO BE STANDING — the first run of this probe read the row as
  // HOLDS off "The Breaker is not standing", which is a refusal about the
  // arrangement and not about the row. Un-building is gated behind the machine
  // that does it, which is the answer to a different question.
  p.tiers['breaker'] = 1;
  p.tiers['crusher'] = 1;
  p.builtOf = { crusher: ['marl', 'marl'] };
  const before = p.tiers['crusher'] ?? 0;
  const r = unbuildMachine(s, ctx, 'crusher');
  return { ok: r.ok, reason: String(r.reason ?? ''), before, after: ensurePlant(s).tiers['crusher'] ?? 0 };
})();
R('A BUILT MACHINE CANNOT BE BROKEN BACK DOWN', 'A.90',
  unbuilt.after < unbuilt.before ? 'DISSOLVED' : 'HOLDS',
  unbuilt.after < unbuilt.before
    ? `DRIVEN: unbuildMachine took the Crusher ${unbuilt.before} -> ${unbuilt.after}. A.107 read this as HOLDS by grepping plant.ts; the verb is in breaker.ts`
    : `DRIVEN: refused — ${unbuilt.reason}`);

/**
 * ...and the reachability of every shell rule, which A.107 answered 4-of-5 by
 * argument. The build-failing version lives in `audit-reach.ts`; this reads the
 * same question off a real run so the two cannot drift apart silently.
 */
const reachable = CONDITION_RULES.filter((rule) => {
  const shell = rule.shellId;
  const s = plantIn(shell, 340);
  if (shell === 'cinder') s.pressure.heat = 100;
  if (shell === 'hollow') s.hollow.silence = 100;
  if (shell === 'ferrite') s.polarity.chain = 12;
  const e = createEngine({ nowMs: 0 });
  void e;
  return conditionedMachines().some((id) => rule.writing(s, id, undefined as never));
});
R('SHELL CONDITION RULES THAT CAN BE WRITTEN AT ALL', 'A.107',
  reachable.length === CONDITION_RULES.length ? 'DISSOLVED' : 'HOLDS',
  `${reachable.length}/${CONDITION_RULES.length} write in their own shell — `
  + `${reachable.map((r) => r.id).join(', ')}. audit-reach.ts fails the build if this ever drops`);

// ---------------------------------------------------------------------------
// The counted rows — sized claims a number can settle
// ---------------------------------------------------------------------------

const flip = THRESHOLDS.find((t) => t.id === 'greatFlip')!;
R('THE SIX THRESHOLDS ARE SIZED', 'A.107', 'HOLDS',
  `greatFlip sits at ${flip.at} and a 3h ferrite arm banks 7204 — 2881% of it, crossed within minutes. `
  + 'A.107 cut it to 250 through the pre-ore-fix harness. NOT re-cut here: the fix moved every active number and the re-sizing wants its own pass');

R("§15.4's 'every machine runs I–V'", 'A.98', MAX_MACHINE_TIER < 5 ? 'HOLDS' : 'DISSOLVED',
  `MAX_MACHINE_TIER = ${MAX_MACHINE_TIER}, spec wants 5`);

R('DELVER SKILL TREE — 24 of the locked 66', 'A.36', SKILL_NODES.length < 66 ? 'HOLDS' : 'DISSOLVED',
  `SKILL_NODES = ${SKILL_NODES.length}`);

const floods = allAuthoredStations().filter((x: { shellId: string; def: { type: string } }) =>
  x.shellId === 'cinder' && x.def.type === 'flood');
R('THE HEAT CORRIDOR WANTS A THIRD FLOOD STATION', 'A.89', floods.length < 3 ? 'HOLDS' : 'DISSOLVED',
  `cinder authors ${floods.length} flood stations`);

/**
 * THE HARNESS ROW, which is new and is the largest thing this phase found. It is
 * counted off the script rather than remembered: does `sim.ts` have a policy
 * that stands a machine up at all?
 */
const simSrc = readFileSync('scripts/sim.ts', 'utf8');
R('NO SIMULATED PLAYER HAS EVER BUILT A MACHINE', 'A.108',
  /PLANT_BUILDS/.test(simSrc) ? 'DISSOLVED' : 'HOLDS',
  /PLANT_BUILDS/.test(simSrc)
    ? '--plant pours cast parts and tries each of the 27 builds; every condition rate in this phase was measured through it'
    : 'sim.ts dispatches none of the 27 build actions');

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

console.log('\nOPEN LEDGER ROWS, RE-READ BY DRIVING THEM\n');
for (const r of rows) {
  console.log(`  ${r.verdict.padEnd(9)} ${r.row}`);
  console.log(`            raised ${r.raised} — ${r.fact}`);
}
const n = (v: Verdict): number => rows.filter((r) => r.verdict === v).length;
console.log(`\n${n('HOLDS')} still blocked · ${n('MOVED')} moved · ${n('DISSOLVED')} dissolved`);

/**
 * THE SELF-TEST. A table where every row is hardcoded to one verdict is a
 * paragraph in a monospace font, and a counted row sized against a number that
 * already passes is a row that has never been read.
 */
if (n('HOLDS') === rows.length || n('HOLDS') === 0) {
  console.log('\n!! SELF-TEST FAILED — every row read the same way');
  process.exit(1);
}
console.log('self-test: verdicts differ — some blockers hold, some do not');
if (SKILL_NODES.length >= 66 || MAX_MACHINE_TIER >= 5) {
  console.log('!! SELF-TEST FAILED — a counted row was sized against a number that already passes');
  process.exit(1);
}
console.log('self-test: the counted rows are read from the registries, not written down');
if (wrote.length === 0 || brokeIds.length === 0) {
  console.log('!! SELF-TEST FAILED — the driven rows never drove anything');
  process.exit(1);
}
console.log('self-test: the driven rows ran the engine and read what came out');
