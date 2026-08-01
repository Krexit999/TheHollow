/**
 * Offline calculation — uncapped duration, closed-form (no tick loop), so a
 * month away resolves instantly.
 *
 *   efficiency = 0.55 + 0.03 * Persistence   (clamped 0.95)
 *
 * Model (documented in DESIGN.md appendix):
 *   - Cells fill from regen at full rate (the field is physical storage;
 *     efficiency applies to *harvest*, not to the rock itself).
 *   - Drill income = min(drill throughput, field regen ceiling) * Y * eff.
 *     No drills -> no harvest; the face just fills up. Pillar 2 holds.
 *   - Kiln consumes from (bank + drill income) at its rate * eff, converting
 *     at 85% of peak heat efficiency (it banks down and re-stokes untended).
 *   - Drill XP accrues at the same effective strike rate.
 *   - Depth NEVER advances offline.
 */
import { D, Decimal } from '../decimal';
import type { ModifierCache } from '../modifiers';
import { allCraftSystems } from '../craft';
import { addCurrency, getCurrency } from '../resources';
import type { EngineCtx, GameState, OfflineSummary } from '../types';
import { offlineEfficiency } from '../prestigeMath';
import { cellCap, cellRegen, chipYield, SEEP_EFFICIENCY, seepStrength } from './face';
import { drillThroughput } from './drills';
import { KILN_DUST_PER_BRICK, kilnRate } from './kiln';
import { grantXP } from './xp';
import { chipCurrencyId, convCurrencyId } from '../shells';
import { offlineHawkerScrip } from '../guild/hirelings';
import { lawNum, sealed } from '../laws';
import { settleOffline } from './settle';

export function currentOfflineEfficiency(state: GameState, mods: ModifierCache): number {
  // THE INSOMNIAC CAMP (law): the cap itself rises to 1.0. The formula's
  // 0.95 clamp stays inside prestigeMath; the law caps ABOVE it.
  return Math.min(lawNum(state, 'offlineEffCap'), offlineEfficiency(mods.get(state, 'offlineEffAdd').toNumber()) + (lawNum(state, 'offlineEffCap') > 0.95 ? 0.05 : 0));
}

export function applyOfflineProgress(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  seconds: number,
): OfflineSummary {
  // THE UNLIT (challenge): the world only runs while it is watched.
  const eff = sealed(state, 'sealOffline') ? 0 : currentOfflineEfficiency(state, mods);
  const levelBefore = state.delver.level;
  // Nobody was on the face: the shaft settled the whole time (A.42). Depth
  // still does not advance offline — this only cheapens the step you take.
  settleOffline(state, seconds);

  // --- 1. Field: cells fill toward cap. -----------------------------------
  const cap = cellCap(state, mods);
  const regen = cellRegen(state, mods);
  const cells = state.face.cells;
  const cellsBefore = [...cells];
  let chargeFilled = 0;
  const fill = regen * seconds;
  for (let i = 0; i < cells.length; i++) {
    const before = cells[i]!;
    const after = Math.min(cap, before + fill);
    chargeFilled += after - before;
    cells[i] = after;
  }

  // --- 2. Drills harvest, regen-capped; else full cells SEEP (pillar 1's
  //        idle floor: thin, never absent). --------------------------------
  const chipId = chipCurrencyId(state);
  let dust = D(0);
  let xp = D(0);
  let harvestedCharge = 0; // pillar-2 numerator, charge domain
  const throughput = drillThroughput(state, mods); // charge/sec the bay wants
  if (state.drills.bayBuilt && throughput > 0) {
    const ceiling = cells.length * regen; // pillar 2: the hard ceiling
    const chargePerSec = Math.min(throughput, ceiling);
    const harvested = chargePerSec * seconds * eff;
    dust = chipYield(state, mods).mul(harvested);
    addCurrency(state, chipId, dust);
    state.stats.totalChargeChipped = state.stats.totalChargeChipped.add(harvested);
    harvestedCharge = harvested;
    // Same XP-per-charge formula the live drills use.
    xp = D(0.12 * (1 + 0.08 * state.depth) * (harvested / 8));
  } else {
    // No drills: each cell fills, then Seepage (signature-scaled) leaks.
    const strength = seepStrength(state);
    if (strength > 0) {
      let overflow = 0;
      for (const before of cellsBefore) {
        const fillSec = Math.max(0, (cap - before) / Math.max(regen, 1e-9));
        overflow += regen * Math.max(0, seconds - fillSec);
      }
      if (overflow > 0) {
        harvestedCharge = overflow * SEEP_EFFICIENCY * strength * eff;
        dust = chipYield(state, mods).mul(harvestedCharge);
        addCurrency(state, chipId, dust);
      }
    }
  }

  // Both branches above are field harvest, so both feed the pillar-2 numerator.
  // Charge, not currency — no yield multiplier can inflate it.
  state.stats.fieldChargeHarvested = state.stats.fieldChargeHarvested.add(harvestedCharge);

  // --- 3. The converter eats from the bank + fresh income. ----------------
  let brick = D(0);
  if (state.kiln.built && state.kiln.feeding) {
    const want = kilnRate(state, mods).mul(seconds * eff);
    const available = getCurrency(state, chipId);
    const eaten = Decimal.min(want, available);
    if (eaten.gt(0)) {
      state.currencies[chipId] = available.sub(eaten);
      const progress = state.kiln.progress.add(eaten.mul(0.85));
      brick = progress.div(KILN_DUST_PER_BRICK).floor().mul(mods.get(state, 'brickYield')).floor();
      state.kiln.progress = progress.sub(
        progress.div(KILN_DUST_PER_BRICK).floor().mul(KILN_DUST_PER_BRICK),
      );
      if (brick.gt(0)) {
        addCurrency(state, convCurrencyId(state), brick);
        state.stats.bricksFired = state.stats.bricksFired.add(brick);
        xp = xp.add(brick.mul(2));
      }
      state.kiln.heat = Math.max(state.kiln.heat, 0.8); // came back to a warm kiln
    }
  }

  if (xp.gt(0)) grantXP(state, mods, ctx, xp);

  // --- 4. Craft-systems accrue (passive rank, Motif trickle, the Press). --
  const motifsBefore = getCurrency(state, 'motif');
  const ranksBefore = state.lattice.passiveRank;
  for (const cs of allCraftSystems()) {
    if (cs.unlocked(state)) cs.offlineTick(state, mods, ctx, seconds, eff);
  }

  state.stats.playTimeSec += seconds * eff;

  // --- 5. The Guild clock keeps time while you're away (stock windows and
  //        caravan drift move on — opportunity, never decay), and the hawker
  //        keeps selling surplus at his usual cadence. -----------------------
  state.guild.clockMs += seconds * 1000;
  const scrip = offlineHawkerScrip(state, mods, seconds * eff);

  const summary: OfflineSummary = {
    seconds,
    efficiency: eff,
    dust,
    brick,
    xp,
    levelsGained: state.delver.level - levelBefore,
    chargeFilled,
    motifs: getCurrency(state, 'motif').sub(motifsBefore),
    passiveRanks: state.lattice.passiveRank - ranksBefore,
    scrip,
  };
  return summary;
}
