/**
 * THE CLAIM: two plants at IDENTICAL TOTAL CAPACITY behave differently because
 * their power SHAPE differs — and neither is better, they are good at different
 * machines (§3.2).
 *
 * That is a falsifiable statement and this is the falsification attempt. Two
 * arms, same Cores spent, same everything else:
 *
 *   FLOW-HEAVY   every rank in Draught
 *   SURGE-HEAVY  every rank in Reservoir
 *
 * The claim FAILS if either arm wins on both machines, or if the two arms come
 * out the same. It only holds if each arm wins the machine its shape suits and
 * loses the other.
 *
 *   npx tsx scripts/sim-plant-shape.ts
 */
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine/types';
import { addMaterial } from '../src/engine/systems/forge';
import { crush } from '../src/engine/systems/crusher';
import { ensurePlant, flowCap, surgeCap } from '../src/engine/systems/plant';
import type { PurityBand } from '../src/engine/materials';

const RANKS = 10;          // the same number of Core-tree ranks in both arms
const SECONDS = 900;       // fifteen minutes of plant
const STEP = 0.1;

interface Arm { name: string; flow: number; surge: number }

function run(arm: Arm): { bricks: number; batches: number; flowCap: number; surgeCap: number } {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;

  // Identical starting plant in both arms. Only the two node levels differ.
  s.kiln.built = true;
  s.kiln.feeding = true;
  s.kiln.heat = 1;
  s.collapse.nodes['flowCapacity'] = arm.flow;
  s.collapse.nodes['surgeCapacity'] = arm.surge;
  ensurePlant(s).tiers['crusher'] = 2;
  ensurePlant(s).tiers['refinery'] = 1; // a second Flow drawer, so Flow can bite
  ensurePlant(s).surge = surgeCap(s);

  // Dust and stone are NOT the constraint here — the plant is. Both arms get
  // more of each than they can possibly consume, so the only thing that can
  // separate them is the shape of their power.
  s.currencies['dust'] = (s.currencies['dust'] ?? { add: () => null } as never);
  engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e12 });

  let batches = 0;
  let sinceTry = 0;
  for (let t = 0; t < SECONDS; t += STEP) {
    engine.tick(STEP);
    // The Crusher is fired by hand; a player tries roughly twice a second and
    // gets a batch whenever the bank has come back. Both arms try identically.
    sinceTry += STEP;
    if (sinceTry >= 0.5) {
      sinceTry = 0;
      const st = engine.getState() as GameState;
      addMaterial(st, 'marl', 50, 8); // stone is never the limit
      const r = crush(st, { emit() {}, dirty() {} }, 'marl', 'fair' as PurityBand);
      if (r.ok) batches += 1;
    }
  }

  const end = engine.getState() as GameState;
  return {
    bricks: Number(end.stats.bricksFired.toString()),
    batches,
    flowCap: flowCap(end),
    surgeCap: surgeCap(end),
  };
}

const arms: Arm[] = [
  { name: 'FLOW-HEAVY  (Draught 10, Reservoir 0)', flow: RANKS, surge: 0 },
  { name: 'SURGE-HEAVY (Draught 0, Reservoir 10)', flow: 0, surge: RANKS },
];

console.log(`Two plants, ${RANKS} Core ranks each, ${SECONDS}s.\n`);
const out = arms.map((a) => ({ arm: a, r: run(a) }));
console.log('arm                                    flowCap  surgeCap   BRICKS  BATCHES');
for (const { arm, r } of out) {
  console.log(
    `${arm.name.padEnd(38)} ${r.flowCap.toFixed(1).padStart(7)} ${String(r.surgeCap).padStart(9)} `
    + `${String(r.bricks).padStart(8)} ${String(r.batches).padStart(8)}`,
  );
}

const [flowArm, surgeArm] = out;
const brickWin = flowArm!.r.bricks > surgeArm!.r.bricks;
const batchWin = surgeArm!.r.batches > flowArm!.r.batches;
console.log('');
console.log(`  Kiln (pure Flow)    won by ${brickWin ? 'FLOW-HEAVY' : 'SURGE-HEAVY'}`
  + `  ${flowArm!.r.bricks} vs ${surgeArm!.r.bricks} bricks`);
console.log(`  Crusher (pure Surge) won by ${batchWin ? 'SURGE-HEAVY' : 'FLOW-HEAVY'}`
  + `  ${surgeArm!.r.batches} vs ${flowArm!.r.batches} batches`);
console.log('');
if (brickWin && batchWin) {
  console.log('CLAIM HOLDS — each arm wins the machine its shape suits and loses the other.');
} else if (!brickWin && !batchWin) {
  console.log('CLAIM FAILS — one arm won BOTH. That is a better plant, not a different one.');
} else {
  console.log('CLAIM FAILS — the arms did not separate on the machine they should have.');
}
process.exit(brickWin && batchWin ? 0 : 1);
