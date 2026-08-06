/**
 * THE BLOOM CEILING — machines against coverage (A.109 item 8).
 *
 * A.108 found the edge and sized it at one number: a cultivated Verdance face
 * carries about six machines, and past that `overgrown` never lets go. This is
 * the CURVE behind that number, because one number cannot say whether the wall
 * is a cliff or a slope, and the ruling wants to know which.
 *
 * WHAT IT MEASURES. `bloomFlow` = PLANT_FLOOR + BLOOM_PER_VINE x vinedCells, so
 * the supply a Verdance plant can offer is set by how much of the face you have
 * LEFT ALONE. Demand is whatever you built. Coverage is supply/demand, and
 * `overgrown` writes on any drawer whose share falls under 1.
 *
 * Two faces, on purpose:
 *   IDLE — nothing clears, every cell vines over. The best case the shell offers.
 *   WORKED — a hand is clearing, so vines never establish. The active case.
 *
 * NOTHING HERE CHANGES THE SIGNATURE. A.109 measures; the ruling is the user's.
 *
 *   npx tsx scripts/a109-bloom.ts
 */
import { ensureContentLoaded } from '../src/engine/content/index';

ensureContentLoaded();

import { createEngine } from '../src/engine/index';
import type { GameState } from '../src/engine/types';
import { conditionOf, conditionedMachines } from '../src/engine/systems/condition';
import { MACHINE_DEMAND, ensurePlant, flowDrawers, flowSatisfaction } from '../src/engine/systems/plant';
import { bloomFlow, PLANT_FLOOR, BLOOM_PER_VINE } from '../src/engine/systems/shellPlants';

/** Stand up `n` machines in Verdance and run. `work` clears the face each tick. */
function run(n: number, work: boolean, sec = 400): {
  vines: number; supply: number; demand: number; cover: number; under: number;
} {
  const e = createEngine({ nowMs: 0 });
  const s = e.getState() as GameState;
  s.shell.current = 'verdance';
  s.depthRecords['verdance'] = 400;
  s.depth = 100;
  s.kiln.built = true;
  const p = ensurePlant(s);
  const ids = conditionedMachines().slice(0, n);
  for (const id of ids) p.tiers[id] = 1;

  for (let t = 0; t < sec; t++) {
    if (work) {
      // The corrected hand: never swing at a pocket, and take the fullest cell.
      for (let k = 0; k < 4; k++) {
        let best = -1, bestCharge = 0;
        for (let i = 0; i < s.face.cells.length; i++) {
          if (s.face.ore?.[i]) continue;
          const c = s.face.cells[i]!;
          if (c > bestCharge) { bestCharge = c; best = i; }
        }
        if (best >= 0 && bestCharge >= 1) e.dispatch({ type: 'chip', cell: best });
      }
    }
    e.tick(1);
  }

  const vines = (s.growth?.stage ?? []).filter((x) => x > 0).length;
  /**
   * DEMAND IS WHAT THE PLANT ACTUALLY DRAWS, and the first cut of this got it
   * wrong: it summed `MACHINE_DEMAND` over every conditioned machine, which
   * includes three that are not drawers — the Kiln draws only while FEEDING,
   * and the Axiom Engine and the Seating never draw Flow at all. That read
   * 33.40 against a live 29.00, and the panel on screen says 29.0.
   *
   * Caught by comparing a screenshot to the table. `flowDrawers` is the engine's
   * own list and is the only honest source for this column; the crossover rows
   * were always right because they come from `conditionOf`, which asks the
   * engine rather than this file.
   */
  const drawers = flowDrawers(s);
  const demand = drawers.reduce((sum, id) => sum + (MACHINE_DEMAND[id]?.flow ?? 0), 0);
  const supply = bloomFlow(s);
  return {
    vines,
    supply,
    demand,
    cover: demand > 0 ? Math.min(1, supply / demand) : 1,
    under: conditionedMachines().filter((id) => conditionOf(s, id)?.id === 'overgrown').length,
  };
}

console.log('\nTHE BLOOM CEILING — what a Verdance plant can be fed\n');
console.log(`  floor ${PLANT_FLOOR} Flow · ${BLOOM_PER_VINE} per vine · a full face is 36 vines `
  + `= ${(PLANT_FLOOR + BLOOM_PER_VINE * 36).toFixed(2)} Flow at the very best\n`);

console.log('  IDLE FACE — nothing clears, every cell vines over (the best the shell offers)');
console.log('   machines   vines   supply   demand   coverage   overgrown');
let idleEdge = 0;
for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 20, 29]) {
  const r = run(n, false);
  if (r.under === 0) idleEdge = n;
  console.log(
    `   ${String(n).padStart(8)}   ${String(r.vines).padStart(5)}   ${r.supply.toFixed(2).padStart(6)}   `
    + `${r.demand.toFixed(2).padStart(6)}   ${(r.cover * 100).toFixed(0).padStart(7)}%   ${String(r.under).padStart(9)}`,
  );
}

console.log('\n  WORKED FACE — a hand is clearing, so vines never establish');
console.log('   machines   vines   supply   demand   coverage   overgrown');
let workedEdge = 0;
for (const n of [1, 2, 3, 4, 6, 8, 12, 29]) {
  const r = run(n, true);
  if (r.under === 0) workedEdge = n;
  console.log(
    `   ${String(n).padStart(8)}   ${String(r.vines).padStart(5)}   ${r.supply.toFixed(2).padStart(6)}   `
    + `${r.demand.toFixed(2).padStart(6)}   ${(r.cover * 100).toFixed(0).padStart(7)}%   ${String(r.under).padStart(9)}`,
  );
}

console.log(`\n  the idle face carries ${idleEdge} machines · a worked face carries ${workedEdge}`);
console.log('  the gap between those two IS the mechanic: clearing writes it, letting be clears it.');

/**
 * THE SELF-TEST. A curve where every row reads the same way is a constant, and a
 * coverage number that never falls under 1 would make the whole table vacuous.
 */
const lo = run(1, false), hi = run(29, false);
if (!(lo.cover > hi.cover)) {
  console.log('\n!! SELF-TEST FAILED — coverage did not fall as the plant grew');
  process.exit(1);
}
if (lo.under !== 0 || hi.under === 0) {
  console.log('\n!! SELF-TEST FAILED — the condition did not separate the two ends');
  process.exit(1);
}
console.log('  self-test: coverage falls with plant size, and the ends differ');

/** ...and the demand table is READ, never transcribed. */
console.log('  self-test: demand is flowDrawers(), the engine list — not every conditioned machine');
void flowSatisfaction;
