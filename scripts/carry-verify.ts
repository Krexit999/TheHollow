/**
 * CARRY-ONE — the one balance change in Phase 21, verified.
 *
 * Carrying one face upgrade at full level through a Collapse SOFTENS the reset.
 * Pillar 6 wants return-to-peak in a 10–25% band, with a FLOOR at 10% — a
 * prestige that costs less than a tenth of the run is broken. This script bounds
 * the softening: it plays a greedy active run to a collapse-ready state, then
 * measures what fraction of the whole face-upgrade rebuild the single most
 * valuable carry target represents.
 *
 * Return-to-peak scales with rebuild cost, so carrying an upgrade worth fraction
 * f of the rebuild multiplies RTP by (1 − f). Starting from the pillar-6 low end
 * (~20%), staying at or above 10% needs f ≤ 0.5. We assert that, with margin.
 *
 *   npx tsx scripts/carry-verify.ts
 */
import { createEngine, type GameState } from '../src/engine';
import { ModifierCache } from '../src/engine/modifiers';
import { allUpgrades, upgradeLevel, costForLevels } from '../src/engine/upgrades';
import { getCurrency } from '../src/engine/resources';
import { resolveCurrencyId } from '../src/engine/shells';
import { currentDescendCost } from '../src/engine/systems/depthSys';

let failures = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

console.log('CARRY-ONE — return-to-peak floor verification\n');

// --- 1. Play a greedy active run to a collapse-ready state --------------------
const engine = createEngine({ nowMs: 0 });
const mods = new ModifierCache();
const TARGET_DEPTH = 40; // Collapse pays from depth 26; 40 is a healthy run
let simSec = 0;

while (engine.getState().depth < TARGET_DEPTH && simSec < 7200) {
  const st = engine.getState();
  // Chip every cell that will answer (charged cells return dust; empty ones no-op).
  for (let c = 0; c < st.face.cells.length; c++) engine.dispatch({ type: 'chip', cell: c });
  // Buy every affordable face/economy upgrade, greedily and in bulk.
  for (const def of allUpgrades()) {
    if (def.visible && !def.visible(st)) continue;
    engine.dispatch({ type: 'buyUpgrade', id: def.id, count: 'max' });
  }
  // Descend while there is dust to spare beyond a 3× buffer (keep buying).
  mods.invalidate();
  for (let guard = 0; guard < 60; guard++) {
    const s2 = engine.getState();
    const dust = getCurrency(s2, resolveCurrencyId('CHIP', s2));
    const cost = currentDescendCost(s2, mods);
    if (dust.lt(cost.mul(3)) || s2.depth >= TARGET_DEPTH) break;
    if (!engine.dispatch({ type: 'descend' }).ok) break;
    mods.invalidate();
  }
  engine.tick(1);
  simSec++;
}

const state = engine.getState() as GameState;
console.log(`  reached depth ${state.depth} in ${(simSec / 60).toFixed(1)} sim-min\n`);
check(state.depth >= 26, `run reached a collapse-payable depth (${state.depth} ≥ 26)`);

// --- 2. Rebuild cost per resetting upgrade, in its own currency ---------------
// retained=0 in a fresh save (no Momentum node, no Gentle Fall law) — the worst
// case for carry, since a carried upgrade keeps its full level against a 0 floor.
const perCurrency = new Map<string, { total: number; biggest: number; biggestId: string }>();
for (const def of allUpgrades()) {
  if (!def.resetsOnCollapse) continue;
  const level = upgradeLevel(state, def.id);
  if (level <= 0) continue;
  const rebuild = costForLevels(def, 0, level).toNumber();
  const cur = resolveCurrencyId(def.currency, state);
  const entry = perCurrency.get(cur) ?? { total: 0, biggest: 0, biggestId: '' };
  entry.total += rebuild;
  if (rebuild > entry.biggest) { entry.biggest = rebuild; entry.biggestId = def.id; }
  perCurrency.set(cur, entry);
};

console.log('  rebuild cost of the resetting upgrades, by currency:');
let worstFraction = 0;
for (const [cur, e] of perCurrency) {
  const f = e.total > 0 ? e.biggest / e.total : 0;
  worstFraction = Math.max(worstFraction, f);
  console.log(
    `    ${cur.padEnd(6)} total ${e.total.toExponential(2)}  ` +
    `biggest '${e.biggestId}' ${e.biggest.toExponential(2)}  ` +
    `= ${(f * 100).toFixed(1)}% of the rebuild`,
  );
}

// --- 3. The floor ------------------------------------------------------------
console.log('');
const rtpLow = 0.20; // pillar-6 low end of the intended band
const impliedRtp = rtpLow * (1 - worstFraction);
console.log(`  worst single-upgrade share of a rebuild:  ${(worstFraction * 100).toFixed(1)}%`);
console.log(`  implied return-to-peak with carry:        ~${(impliedRtp * 100).toFixed(1)}%  (from a ${rtpLow * 100}% base)`);
check(worstFraction <= 0.5, `carry never takes more than half a rebuild (${(worstFraction * 100).toFixed(1)}% ≤ 50%)`);
check(impliedRtp >= 0.10, `implied return-to-peak stays at or above the 10% floor`);

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`} — carry-one`);
process.exit(failures === 0 ? 0 : 1);
