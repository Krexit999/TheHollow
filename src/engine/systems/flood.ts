/**
 * THE FLOODGATE (§36.1) — you may deliberately FLOOD a station.
 *
 * Not the run. A station. It costs, it is irreversible, and afterwards that
 * place is a different place forever — through every Collapse and every Breach.
 *
 * WHAT A FLOOD ACTUALLY CHANGES, which is the question that separates it from a
 * HAZARD with a new word:
 *
 *   BEFORE  the station's seam re-rolls at every Collapse (§1.1), so what it
 *           holds is a question the Assay Bench has to be re-asked every run and
 *           a Circuit row keyed on it is a rule that keeps coming untrue. Its
 *           type is `flood` and nothing waits there.
 *   AFTER   the seam is FIXED, drawn once from the shell's own deep stock, and
 *           the re-roll never touches it again. The station reads as a HAZARD
 *           for the rest of the game — so a Deepwrought stands in it, at full
 *           intensity, and everything the hazard rules do applies.
 *
 * So the trade is: a permanently KNOWN place, bought with a permanently
 * DANGEROUS one. It is the Shoring trade (§9.4) turned the other way up —
 * shoring freezes contents to buy travel, flooding freezes contents to buy
 * certainty, and both give up the thing that keeps the Roll from becoming
 * scenery. §36.1's own LAW 5 line: *"I made the richest station in the shell and
 * locked myself out of it."*
 *
 * AND IT DOES NOT PAY. A seam is INFORMATION in this build — it is read by the
 * Assay Bench, by the Circuit and by the Standoff, and by nothing in the drop
 * table. §36.1 describes a flooded station as "a reliable source of the shell's
 * best material", and a flood that actually raised what fell out of the rock
 * would be a yield event, which this may not be. What it buys is RELIABILITY:
 * the Bench never has to re-read it, and a Circuit row keyed on that seam is
 * true forever. Reach and legibility, never rate. `flood.test.ts` asserts the
 * drop table is bit-identical either side of a flood.
 *
 * WHAT §36.1 ASKS FOR THAT THIS BUILD CANNOT GIVE, cut rather than faked:
 *
 *   "its grain collapses to a single direction"  — GRAIN IS CUT (bd9f3ae).
 *                                                  There is no direction to set.
 *   "its heat leaks into any machine working
 *    there (§7.2)"                              — E2 is not built. A machine has
 *                                                  tiers, served-Flow and the
 *                                                  parts it was cast from, and no
 *                                                  CONDITION a station could warp.
 *                                                  Ledgered unbuilt since A.85.
 *
 * THE PRICE IS EMBER, NOT THE HEAT BANK. §36.1 says "a full heat bank"; Cinder's
 * heat lives in `systems/pressure.ts`, which is the shell's LOCKED signature, and
 * nothing here touches it. Ember is banked heat by the shell's own fiction — the
 * Slagworks "runs Slag down into Ember" — so the flood is paid for in the
 * currency that heat becomes, through the same `convCurrencyId` seam every other
 * station-scale purchase in the game uses.
 */
import { Decimal, D } from '../decimal';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { descendCost } from '../prestigeMath';
import { KILN_DUST_PER_BRICK } from './kiln';
import { convCurrencyId } from '../shells';
import { currencyDef, getCurrency, spendCurrency } from '../resources';
import { ensureRoll, isFlooded, shellRoll, HAZARD_MAX } from './roll';
import { noteBuiltOf } from './plant';
import type { StationDef } from '../content/shell1/roll';

/** The wreck that holds the gate. A shell without one cannot flood, and says so. */
export const FLOODGATE_WRECK = 'THE FLOODGATE';

/**
 * WHAT A FLOOD COSTS: the whole climb to that station, once, converted.
 *
 * Derived rather than authored, the way shoring's price is — it is what getting
 * there from the surface costs in chip currency, at the Kiln's own exchange. So
 * a shallow station is a decision you can make early and a deep one is a
 * commitment, and the curve does the sizing rather than a table.
 */
export function floodCost(depth: number): { conv: Decimal; parts: number } {
  let dust = D(0);
  for (let d = 1; d <= depth; d++) dust = dust.add(descendCost(d));
  return { conv: dust.div(KILN_DUST_PER_BRICK).ceil(), parts: 2 + Math.floor(depth / 100) };
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export function floodgateStation(state: GameState): StationDef | null {
  return shellRoll(state).find((d) => d.wreck === FLOODGATE_WRECK) ?? null;
}

/** Found — the wreck has been walked to, so the gate can be raised. */
export function floodgateFound(state: GameState): boolean {
  const def = floodgateStation(state);
  if (!def) return false;
  ensureRoll(state);
  return state.roll!.looted.includes(def.id);
}

/** Raised. Like the Shoring Rig it is a TECHNIQUE and survives everything. */
export function floodgateBuilt(state: GameState): boolean {
  ensureRoll(state);
  return state.roll?.floodgate === true;
}

// ---------------------------------------------------------------------------
// Flooding
// ---------------------------------------------------------------------------

/** Re-exported from `roll.ts`, where it lives to keep the graph one-way. */
export { isFlooded };

/** Stations that CAN be drowned — authored `type: 'flood'`, and not yet. */
export function floodable(state: GameState): StationDef[] {
  return shellRoll(state).filter((d) => d.type === 'flood' && !isFlooded(state, d.id));
}

/** Why this station cannot be flooded right now, or null. */
export function floodBlocker(state: GameState, stationId: string): string | null {
  if (!floodgateBuilt(state)) return 'The Floodgate is not standing.';
  const def = shellRoll(state).find((d) => d.id === stationId);
  if (!def) return 'Nothing to flood there.';
  if (def.type !== 'flood') return 'That place will not take the heat.';
  if (isFlooded(state, stationId)) return 'Already drowned.';
  // YOU CANNOT FLOOD AHEAD OF YOURSELF, for the reason shoring cannot be bought
  // ahead of your record: you have to have stood in it.
  const record = state.depthRecords[state.shell.current] ?? 0;
  if (record < def.depth) return 'You have not been down there yet.';
  const cost = floodCost(def.depth);
  const rack = state.casting.rack ?? [];
  if (rack.length < cost.parts) return `Needs ${cost.parts} cast parts (the rack has ${rack.length}).`;
  const conv = currencyDef(convCurrencyId(state)).name;
  if (getCurrency(state, convCurrencyId(state)).lt(cost.conv)) return `Not enough ${conv}.`;
  return null;
}

/**
 * DROWN IT. Irreversible — there is deliberately no `unflood`, unlike shoring's
 * `unshoreBand`. §36.1 is explicit that this one does not come back, and the
 * whole LAW 5 line depends on it: a mistake you can pay to undo is not a
 * mistake, it is a fee.
 */
export function floodStation(
  state: GameState, ctx: EngineCtx, stationId: string, rng: () => number = Math.random,
): ActionResult {
  const blocked = floodBlocker(state, stationId);
  if (blocked) return { ok: false, reason: blocked };
  const def = shellRoll(state).find((d) => d.id === stationId)!;
  const cost = floodCost(def.depth);
  const rack = state.casting.rack ?? [];
  const taken = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0)).slice(0, cost.parts);
  if (!spendCurrency(state, convCurrencyId(state), cost.conv)) {
    return { ok: false, reason: `Not enough ${currencyDef(convCurrencyId(state)).name}.` };
  }
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, `flood:${stationId}`, taken.map((p) => p.materialId));

  ensureRoll(state);
  const r = state.roll!;
  /**
   * THE SEAM IS DRAWN ONCE AND KEPT. `floodSeams` is the station's own
   * deep-stock pool, authored beside its ordinary one — the shell's native
   * material rather than whatever the band happened to offer. After this
   * `rerollRoll` skips the station entirely, so this is the last time its
   * contents ever move.
   */
  const pool = def.floodSeams ?? def.seams ?? [];
  const held = r.rolled[stationId];
  if (held && pool.length > 0) {
    held.seam = pool[Math.floor(rng() * pool.length)]!;
    // A DROWNED STATION IS THE WORST OF THEM. It reads as a hazard forever, so
    // it gets the intensity to match rather than the 0 a non-hazard carries.
    held.hazard = HAZARD_MAX;
  }
  (r.flooded ??= []).push(stationId);
  ctx.dirty();
  ctx.emit({ type: 'stationFlooded', stationId, depth: def.depth });
  return { ok: true, data: { stationId, seam: held?.seam ?? '' } };
}
