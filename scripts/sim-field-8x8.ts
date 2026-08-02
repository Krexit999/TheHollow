/**
 * §23 says the field is 8x8 by 12:00. The live path says ~30:00 under the
 * FASTEST policy the current formulas allow (every Brick into `expand`, nothing
 * into bellows or firebrick). This measures WHAT WOULD HAVE TO CHANGE.
 *
 * Two candidate levers, and the point is to price each honestly rather than
 * pick one:
 *
 *   KILN_BASE_RATE   dust/sec the Kiln can eat. Brick income is capped by this
 *                    and nothing else once heat saturates, however much Dust
 *                    the player has.
 *   expand cost      baseCost 12, ratio 1.75 -> levels 1-4 cost
 *                    12 + 21 + 36.75 + 64.31 = 134.06 Brick cumulative.
 *
 * MEASUREMENT ONLY. Nothing here is applied; the arms are run by overriding the
 * value in a fresh engine per arm and reading back when `expand` hits level 4.
 *
 *   npx tsx scripts/sim-field-8x8.ts
 */
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine/types';
import { fieldDims } from '../src/engine/systems/face';
import { allUpgrades, nextCost, upgradeLevel } from '../src/engine/upgrades';
import { D } from '../src/engine/decimal';
import * as kiln from '../src/engine/systems/kiln';

const STEP = 0.1;
const MINUTES = 60;
const TARGET_SEC = 12 * 60;

/** Cumulative Brick to reach expand level 4 (8x8), at a given base/ratio. */
function cumulativeExpandCost(base: number, ratio: number, levels = 4): number {
  let total = 0;
  for (let i = 0; i < levels; i++) total += base * Math.pow(ratio, i);
  return total;
}

/**
 * THE RIG, AND THE FIRST VERSION OF IT WAS A LIAR.
 *
 * The first cut "applied" a cheaper expand row by comparing the bank against a
 * SCALED price and then dispatching `buyUpgrade` — which charges the REAL one.
 * So the buy simply failed until the player could afford the shipped price, and
 * every arm from x0.75 down to x0.25 came back at 29.5-29.8m. That reads as
 * "the cost curve is not the constraint", which is a finding, and it was an
 * artifact of the instrument. The registry def is a live object, so the arm
 * mutates `baseCost` for real and the engine charges what the arm says.
 *
 * `bellowsLevels` is the Kiln-rate arm. KILN_BASE_RATE is a frozen ESM binding
 * and cannot be varied from here, but `kilnRate = mods.get('kilnRate') *
 * KILN_BASE_RATE` and the `upgrade.bellows` modifier is `1 + 0.2*level` on that
 * same bucket — so N levels is a x(1+0.2N) intake multiplier, arithmetically
 * identical to raising the base rate. It is written straight onto state rather
 * than bought, because the question is what the RATE is worth in isolation, not
 * what it costs to buy.
 */
function run(
  { expandScale = 1, bellowsLevels = 0, minutes = MINUTES }:
  { expandScale?: number; bellowsLevels?: number; minutes?: number },
): number | null {
  // createEngine FIRST — the upgrade registry is empty until it has run
  // `ensureContentLoaded`, so looking the def up before this returns undefined.
  const engine = createEngine({ nowMs: 0 });
  const expandDef = allUpgrades().find((u) => u.id === 'expand')!;
  const shippedBase = expandDef.baseCost;
  if (expandScale !== 1) {
    (expandDef as { baseCost: typeof shippedBase }).baseCost = shippedBase.mul(expandScale);
  }
  try {
    let cursor = 0;
    for (let t = 0; t < minutes * 60; t += STEP) {
      engine.tick(STEP);
      const s = engine.getState() as GameState;
      if (bellowsLevels > 0 && upgradeLevel(s, 'bellows') !== bellowsLevels) {
        s.upgrades['bellows'] = bellowsLevels;
      }
      const dims = fieldDims(upgradeLevel(s, 'expand'));

      if (Math.floor(t / 0.5) !== Math.floor((t - STEP) / 0.5)) {
        engine.dispatch({ type: 'chip', cell: cursor % (dims.w * dims.h) });
        cursor++;
      }
      if (Math.floor(t) !== Math.floor(t - STEP)) {
        if (upgradeLevel(s, 'kilnBuild') === 0) engine.dispatch({ type: 'buyUpgrade', id: 'kilnBuild' });
        const level = upgradeLevel(s, 'expand');
        if (s.kiln.built && level < expandDef.maxLevel) {
          const cost = nextCost(expandDef, level);
          if ((s.currencies['brick'] ?? D(0)).gte(cost)) {
            engine.dispatch({ type: 'buyUpgrade', id: 'expand' });
          }
        }
      }
      if (dims.w === 8 && dims.h === 8) return (engine.getState() as GameState).stats.playTimeSec;
    }
    return null;
  } finally {
    (expandDef as { baseCost: typeof shippedBase }).baseCost = shippedBase;
  }
}

const mins = (sec: number | null): string => (sec === null ? '  never' : `${(sec / 60).toFixed(1)}m`);

console.log('§23 BEAT: "12:00 — Field is 8x8". Measured against the live path.\n');

const baseline = run({});
console.log(`  BASELINE (as shipped)                          ${mins(baseline)}`);
console.log(`  target                                          12.0m\n`);

// ---------------------------------------------------------------------------
// LEVER A — the expand cost curve
// ---------------------------------------------------------------------------
console.log('LEVER A — expand cost. baseCost 12, ratio 1.75.');
console.log(`  cumulative to level 4 as shipped: ${cumulativeExpandCost(12, 1.75).toFixed(1)} Brick\n`);
for (const scale of [0.75, 0.5, 0.4, 0.3, 0.25]) {
  const at = run({ expandScale: scale });
  console.log(
    `  baseCost ${(12 * scale).toFixed(2).padStart(5)}  ->  cumulative ${(cumulativeExpandCost(12, 1.75) * scale).toFixed(1).padStart(6)} Brick`
    + `   8x8 at ${mins(at)}`,
  );
}

// ---------------------------------------------------------------------------
// LEVER B — the Kiln's intake
// ---------------------------------------------------------------------------
console.log(`\nLEVER B — Kiln intake. KILN_BASE_RATE ${kiln.KILN_BASE_RATE} dust/sec, driven here`);
console.log('  through the kilnRate bucket (1 + 0.2/bellows level), which multiplies it.\n');
for (const lv of [2, 5, 10, 15, 20]) {
  const at = run({ bellowsLevels: lv });
  console.log(
    `  x${(1 + 0.2 * lv).toFixed(1).padStart(4)} intake  (${(kiln.KILN_BASE_RATE * (1 + 0.2 * lv)).toFixed(1).padStart(5)} dust/sec)`
    + `   8x8 at ${mins(at)}`,
  );
}

// ---------------------------------------------------------------------------
// BOTH
// ---------------------------------------------------------------------------
console.log('\nBOTH TOGETHER (half cost + x2 intake):');
console.log(`  ${mins(run({ expandScale: 0.5, bellowsLevels: 5 }))}`);

// ---------------------------------------------------------------------------
// The exact Lever-A setting that lands the beat
// ---------------------------------------------------------------------------
let lo = 0.25, hi = 0.75;
for (let i = 0; i < 7; i++) {
  const mid = (lo + hi) / 2;
  const at = run({ expandScale: mid });
  if (at === null || at > TARGET_SEC) hi = mid; else lo = mid;
}
const pick = (lo + hi) / 2;
const landed = run({ expandScale: pick });
console.log('\nLEVER A, BISECTED TO THE BEAT:');
console.log(`  baseCost ${(12 * pick).toFixed(2)} (ratio unchanged at 1.75)`);
console.log(`  cumulative to 8x8: ${(cumulativeExpandCost(12, 1.75) * pick).toFixed(1)} Brick`);
console.log(`  lands 8x8 at ${mins(landed)}`);

console.log(`
WHAT THE TWO LEVERS ACTUALLY ARE

  LEVER A SCALES. Halve the cost, roughly halve the time: 134 -> 67 Brick moves
  29.6m -> 15.9m, and the bisect above lands the beat exactly. It behaves like a
  price because it is one.

  LEVER B SATURATES, AND THAT IS THE FINDING. x1.4 intake buys 7.4 minutes.
  x2 buys another 3.9. x3, x4 and x5 buy NOTHING — 18.3m, 18.4m, 18.2m, 18.8m,
  flat inside noise. Past about 4 dust/sec the Kiln is no longer the constraint:
  a 6x6 face worked at two chips a second cannot GROW dust fast enough to feed
  it, so raising the cap raises a ceiling nothing is touching.

  So Lever B alone CANNOT reach 12:00 at any intake. Its floor is ~18m. Only
  Lever A reaches the beat alone, and the pair reach it together at gentler
  settings of each (half cost + x2 intake -> 10.2m, which overshoots).

  PILLAR 2 NOTE: neither lever touches cellCap, cellRegen or chipYield. Lever A
  is a price and Lever B is a conversion rate; the field ceiling is untouched by
  both, which is why Lever B can saturate against dust supply at all.

NOTHING WAS CHANGED. This is a measurement; the lever is the reader's to pick.`);
process.exit(0);
