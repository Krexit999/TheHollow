/**
 * THE OPENING ARC PROBE (A.43 Part A1).
 *
 * A CONTROLLED, ANALYTIC read of the d0→d40 stretch, computed from the real
 * engine functions rather than from a play policy. It exists to be checked
 * against the sim: if the arithmetic and the run disagree, one of them is lying
 * and the phase stops until it is known which. (Six harness bugs so far; the
 * A.42 rule is that a sim number is a claim until the harness is verified, and
 * the cheapest verification is a second instrument that cannot share its bugs.)
 *
 * It answers A1 directly: of the minutes an idle player spends between d15 and
 * d40, how many are the starting charge draining, how many are the seepage
 * floor, and what share the Kiln is taking out of the same purse.
 *
 *   npx tsx scripts/probe-opening.ts
 */
import { createEngine, type GameState } from '../src/engine';
import { ModifierCache } from '../src/engine/modifiers';
import { cellCap, cellRegen, chipYield, dpsMax, SEEP_EFFICIENCY, seepStrength } from '../src/engine/systems/face';
import { descendCost } from '../src/engine/prestigeMath';
import { allUpgrades } from '../src/engine/upgrades';

const engine = createEngine({ nowMs: 0 });
const s = engine.getState() as GameState;
const mods = new ModifierCache();

const cells = s.face.cells.length;
const cap = cellCap(s, mods);
const regen = cellRegen(s, mods);
const Y = chipYield(s, mods).toNumber();
const ceiling = dpsMax(s, mods).toNumber();
const seepRate = ceiling * SEEP_EFFICIENCY * seepStrength(s);

console.log('THE OPENING, as the engine actually defines it\n');
console.log(`  face            ${cells} cells, cap ${cap}, regen ${regen}/cell/s`);
console.log(`  stored at full  ${(cells * cap).toFixed(0)} charge  (= ${(cells * cap * Y).toFixed(0)} dust, once, by hand)`);
console.log(`  ceiling         ${ceiling.toFixed(3)} dust/s   (W·H·regen·Y)`);
console.log(`  seepage         ${seepRate.toFixed(3)} dust/s   (${(SEEP_EFFICIENCY * 100).toFixed(0)}% of overflow, strength ${seepStrength(s)})`);
console.log(`                  = ${(seepRate * 60).toFixed(1)} dust/min — THE IDLE FLOOR before any machine`);

const kiln = allUpgrades().find((u) => u.id === 'kilnBuild')!;
const kilnPrice = kiln.baseCost.toNumber();
console.log(`  Kiln            ${kilnPrice} dust (${kiln.currency})`);

// --- The descend ladder, in minutes at the idle floor -----------------------
console.log('\nWHAT EACH STRETCH COSTS, AND WHAT IT COSTS IN TIME AT THE FLOOR\n');
console.log('  from→to   dust      min @ seep   cumulative min');
const marks = [0, 5, 10, 15, 20, 25, 30, 35, 40];
let cum = 0;
const stretch = (a: number, b: number): number => {
  let sum = 0;
  for (let d = a + 1; d <= b; d++) sum += descendCost(d).toNumber();
  return sum;
};
for (let i = 1; i < marks.length; i++) {
  const cost = stretch(marks[i - 1]!, marks[i]!);
  const min = cost / (seepRate * 60);
  cum += min;
  console.log(
    `  ${String(marks[i - 1]).padStart(2)}→${String(marks[i]).padStart(2)}    ` +
      `${cost.toFixed(0).padStart(7)}   ${min.toFixed(1).padStart(9)}   ${cum.toFixed(1).padStart(12)}`,
  );
}

// --- How far the starting charge alone carries you --------------------------
console.log('\nHOW FAR THE STARTING CHARGE CARRIES, IF EVERY POINT OF IT IS TAKEN BY HAND\n');
const startDust = cells * cap * Y;
let d = 0;
let spent = 0;
while (spent + descendCost(d + 1).toNumber() <= startDust) {
  spent += descendCost(d + 1).toNumber();
  d++;
}
console.log(`  ${startDust.toFixed(0)} dust of stored charge reaches depth ${d} (spending ${spent.toFixed(0)})`);
console.log(`  ...and it is a ONE-OFF: nothing refills it but regen, which is the ceiling.`);

// --- The competition for the same purse -------------------------------------
console.log('\nTHE PURSE, BETWEEN THE STORE RUNNING OUT AND THE KILN\n');
const toKiln = kilnPrice / (seepRate * 60);
console.log(`  Kiln alone       ${kilnPrice} dust = ${toKiln.toFixed(1)} min at the floor`);
const d15to20 = stretch(15, 20);
console.log(`  d15→d20 alone    ${d15to20.toFixed(0)} dust = ${(d15to20 / (seepRate * 60)).toFixed(1)} min at the floor`);
console.log(`  both             ${(kilnPrice + d15to20).toFixed(0)} dust = ${((kilnPrice + d15to20) / (seepRate * 60)).toFixed(1)} min`);
console.log('\n  The Kiln does not produce dust. It buys BRICK, and brick buys the field');
console.log('  expansion and the drill bay — so it is the door out of the floor, paid for');
console.log('  out of the same trickle that is trying to buy depth.');

// --- What a floor-raise would be worth --------------------------------------
console.log('\nWHAT A HIGHER FLOOR WOULD BE WORTH (d15→d40 at the floor)\n');
const d15to40 = stretch(15, 40);
for (const mult of [1, 1.5, 2, 2.5, 3, 4]) {
  const min = d15to40 / (seepRate * mult * 60);
  console.log(
    `  seep ×${mult.toFixed(1).padStart(4)} (${(SEEP_EFFICIENCY * mult * 100).toFixed(0).padStart(2)}% of overflow)   ` +
      `d15→d40 in ${min.toFixed(1).padStart(6)} min   ` +
      `— still ${((seepRate * mult) / ceiling * 100).toFixed(0)}% of the ceiling`,
  );
}
console.log('\n  Pillar 2 binds at 100% of ceiling. Every row above is under it.');
