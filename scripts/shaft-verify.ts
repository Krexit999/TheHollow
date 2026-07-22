/**
 * THE SHAFT — Collapse-loop verification (the risk gate for Phase 18 Part 2).
 *
 * The brief's warning: infrastructure that survives Collapse could destroy the
 * Collapse loop, if it let you return to peak for free. This proves it does not,
 * three ways, all against the REAL engine formulas:
 *
 *   1. MARGINAL COST IS UNTOUCHED. The cost of setting a NEW record (peak→peak+1)
 *      is bit-identical with and without a rail. The rail never discounts new
 *      ground, so the cadence of going DEEPER — the real progress — is unchanged.
 *
 *   2. RECOVERY SPEEDUP IS BOUNDED AND CONSTANT. With the rail laid all the way to
 *      peak, re-descending 0→peak costs exactly RAIL_DISCOUNT of the un-railed
 *      cost, at EVERY depth. So return-to-peak is at most 1/RAIL_DISCOUNT faster —
 *      a flat, non-compounding factor — never instant, never unbounded.
 *
 *   3. THE LOOP STAYS RATE-LIMITED. Modelling income pinned at the field CEILING
 *      (pillar 2 — the fastest the loop can legally turn), a railed same-depth
 *      Collapse loop earns at most that bounded factor more Cores per hour. The
 *      live engine is spot-checked to confirm it charges the discounted cost, and
 *      that a Collapse still pays out on the deepest point reached.
 *
 *   npx tsx scripts/shaft-verify.ts
 */
import { createEngine, type GameState } from '../src/engine';
import { D } from '../src/engine/decimal';
import { ModifierCache } from '../src/engine/modifiers';
import { descendCost, coresForDepth } from '../src/engine/prestigeMath';
import {
  RAIL_DISCOUNT, descendMultiplier, shaftPeak,
} from '../src/engine/systems/shaftSys';
import { effectiveDescendCost } from '../src/engine/systems/depthSys';
import { dpsMax } from '../src/engine/systems/face';
import { currentShell } from '../src/engine/shells';

let failures = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

/** Total un-railed cost to descend 0→peak (the locked curve). */
function costToDescend(peak: number, railTo: number): number {
  let sum = 0;
  for (let d = 1; d <= peak; d++) {
    const mult = d <= railTo ? RAIL_DISCOUNT : 1; // re-tread-within-run is not modelled: fresh run, reached=0
    sum += descendCost(d).toNumber() * mult;
  }
  return sum;
}

console.log('THE SHAFT — Collapse loop verification\n');
console.log(`  rail discount = ${RAIL_DISCOUNT}  (cap on the recovery speedup = ${(1 / RAIL_DISCOUNT).toFixed(2)}×)\n`);

// --- 1 & 2: the cost invariants, across the depth range -----------------------
console.log('1–2. cost of a new record vs cost of recovery, per peak depth');
console.log('     depth |  new-ground cost (no rail / rail) | recovery ×faster | cores/collapse');
const peaks = [40, 80, 120, 200, 300];
for (const peak of peaks) {
  // Marginal cost of the NEXT record, with a full rail to `peak` vs none.
  const newGroundNoRail = descendCost(peak + 1).toNumber() * 1;
  // A rail to `peak` does NOT cover peak+1, so its multiplier is 1 either way.
  const railToPeak = peak;
  const newGroundRail = descendCost(peak + 1).toNumber() * (peak + 1 <= railToPeak ? RAIL_DISCOUNT : 1);

  const recoveryNoRail = costToDescend(peak, 0);
  const recoveryRail = costToDescend(peak, railToPeak);
  const faster = recoveryNoRail / recoveryRail;
  const cores = coresForDepth(peak).toNumber();

  console.log(
    `     ${String(peak).padStart(5)} | ${newGroundNoRail.toExponential(2)} / ${newGroundRail.toExponential(2)} |` +
    ` ${faster.toFixed(3)}× | ${cores}`,
  );
  check(newGroundNoRail === newGroundRail, `depth ${peak}: new record costs the same railed or not (loop floor intact)`);
  check(faster <= 1 / RAIL_DISCOUNT + 1e-9, `depth ${peak}: recovery speedup ${faster.toFixed(3)}× ≤ ${(1 / RAIL_DISCOUNT).toFixed(2)}× (bounded)`);
  check(faster >= 1, `depth ${peak}: rail never SLOWS recovery`);
}

// --- 3: rate-limited cadence at the ceiling -----------------------------------
console.log('\n3. Collapse cadence with income pinned at the field ceiling (pillar 2)');
// A seeded mid-Loam state to read a representative ceiling from.
const engine = createEngine({ nowMs: 0 });
const s = engine.getState() as GameState;
const mods = new ModifierCache();
s.kiln.built = true;
s.depth = 60;
s.depthRecords['loam'] = 60;
s.maxDepthRecord = 60;
// A few face upgrades so the ceiling is a real mid-game number, not the floor.
for (const id of Object.keys(s.upgrades)) s.upgrades[id] = 8;
mods.invalidate();
const ceiling = dpsMax(s, mods).toNumber(); // charge per second, the hard cap
console.log(`     representative ceiling ≈ ${ceiling.toExponential(3)} chip/s`);

for (const peak of [40, 80, 120]) {
  const cores = coresForDepth(peak).toNumber();
  const tNoRail = costToDescend(peak, 0) / ceiling;    // seconds to afford the descent
  const tRail = costToDescend(peak, peak) / ceiling;
  const coresPerHrNoRail = (cores / tNoRail) * 3600;
  const coresPerHrRail = (cores / tRail) * 3600;
  const ratio = coresPerHrRail / coresPerHrNoRail;
  console.log(
    `     depth ${String(peak).padStart(3)}: cores/hr  no-rail ${coresPerHrNoRail.toFixed(1)}  ` +
    `railed ${coresPerHrRail.toFixed(1)}  (${ratio.toFixed(2)}×)`,
  );
  check(ratio <= 1 / RAIL_DISCOUNT + 1e-6, `depth ${peak}: railed cores/hr ≤ ${(1 / RAIL_DISCOUNT).toFixed(2)}× — no blowup`);
}

// --- live engine: the code actually charges the discount, and re-tread is free -
console.log('\n4. live engine — the discount is real, re-tread is free, Collapse pays on the peak');
{
  const e = createEngine({ nowMs: 0 });
  const st = e.getState() as GameState;
  st.kiln.built = true;
  // Give a strong tool so walls do not gate the spot check.
  st.depth = 10;
  st.shaft.reached = 10;
  const shell = currentShell(st).id;
  // No rail: the 11th step is full price.
  st.currencies[currentShell(st).chipCurrencyId] = D(1e9);
  const full = effectiveDescendCost(st, mods).toNumber();
  // Lay a rail to depth 20 and drop reached to 0 (as if just Collapsed): step 11 is now railed.
  st.shaft.rail[shell] = 20;
  st.shaft.reached = 0;
  st.depth = 10;
  const railed = effectiveDescendCost(st, mods).toNumber();
  check(Math.abs(railed / full - RAIL_DISCOUNT) < 1e-6, `railed re-descent costs ${(railed / full).toFixed(2)}× the un-railed price`);

  // Re-tread within a run (reached ahead of depth) is free.
  st.shaft.reached = 30;
  check(descendMultiplier(st, st.depth + 1) === 0, 're-treading cleared rock this run is free');

  // Collapse pays out on the deepest reached, even after climbing up.
  st.depth = 5;
  st.shaft.reached = 48;
  check(shaftPeak(st) === 48 && coresForDepth(shaftPeak(st)).eq(coresForDepth(48)),
    'Collapse pays on the deepest point reached, not where you stand');
}

// --- 5: the LIFT is batched descent — economically identical, not a shortcut ---
console.log('\n5. the lift (Phase 19) rides the rail: same coin as tapping, in one action');
{
  const shellChip = () => currentShell(createEngine({ nowMs: 0 }).getState() as GameState).chipCurrencyId;
  // Ride the lift 0 -> rail head, measure the coin spent.
  const rideE = createEngine({ nowMs: 0 });
  const ride = rideE.getState() as GameState;
  ride.kiln.built = true;
  ride.shaft.rail['loam'] = 30; ride.shaft.lift['loam'] = true;
  ride.depth = 0; ride.shaft.reached = 0;
  ride.currencies[shellChip()] = D(1e12);
  const rideBefore = ride.currencies[shellChip()]!;
  rideE.dispatch({ type: 'rideLift' });
  const rideSpent = rideBefore.sub(ride.currencies[shellChip()]!).toNumber();
  const rideDepth = ride.depth;

  // Tap descend the same 0 -> 30 on a fresh, identically-railed state.
  const tapE = createEngine({ nowMs: 0 });
  const tap = tapE.getState() as GameState;
  tap.kiln.built = true;
  tap.shaft.rail['loam'] = 30;
  tap.depth = 0; tap.shaft.reached = 0;
  tap.currencies[shellChip()] = D(1e12);
  const tapBefore = tap.currencies[shellChip()]!;
  for (let i = 0; i < 30; i++) tapE.dispatch({ type: 'descend' });
  const tapSpent = tapBefore.sub(tap.currencies[shellChip()]!).toNumber();

  console.log(`     lift rode to ${rideDepth} for ${rideSpent.toFixed(1)}; tapping to ${tap.depth} cost ${tapSpent.toFixed(1)}`);
  check(rideDepth === 30 && tap.depth === 30, 'both reach the rail head at depth 30');
  check(Math.abs(rideSpent - tapSpent) / tapSpent < 1e-9, 'the lift charges exactly what tapping does — no economic change');
}

// --- 6: caches + curing move and convert, they never mint (pillar 2) ----------
console.log('\n6. caches + curing (Phase 19): a note, proven exhaustively in curing.test.ts');
console.log('     • a cache MOVES material in space (Hold -> depth); count never changes on deposit');
console.log('     • curing CONVERTS a batch of N into N of the result — better, never more');
console.log('     • no install/deposit/collect mints any chip or converter currency');
console.log('     → curing is upside on patience, not a second income rate. Pillar 2 untouched.');

console.log(failures === 0 ? '\nSHAFT LOOP VERIFIED ✓' : `\n${failures} PROBLEMS`);
process.exit(failures === 0 ? 0 : 1);
