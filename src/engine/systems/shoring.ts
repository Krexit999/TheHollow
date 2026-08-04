/**
 * SHORING AND DRIFTS (§9.4, §21.1) — the Collapse fast-forward.
 *
 * Spend Brick and cast parts to SHORE a band. It becomes a DRIFT you fall
 * through instantly, and it survives the Collapse. Drifts chain: shore the
 * bands above each other and the fall runs the whole length in one act.
 *
 * WITHOUT IT THE RESET LOOP RE-WALKS GROUND YOU HAVE WALKED. That is the whole
 * reason the system exists and it is a measured number, not an intuition —
 * `scripts/sim.ts --shore` reports the share of a run's descend steps and
 * descend spend that lands at or below the record the run started with.
 *
 * AND NOW IT COSTS SOMETHING (§1.1). A shored band NO LONGER RE-ROLLS ITS
 * CONTENTS. The re-roll is what stops fifteen named stations becoming scenery
 * by hour twenty, so shoring trades a permanent seam for a permanent shortcut,
 * and the answer depends entirely on whether THIS band's current roll is one
 * worth keeping forever. §8's bottleneck — *"I froze a seam I didn't want"* —
 * has its authored answer here too: un-shoring, expensively.
 *
 * WHERE IT SITS AGAINST THE RAIL. The Shaft already has a Collapse-surviving
 * RAIL, bought with Cores, worth a flat 50% off re-descent — "a bounded
 * speedup, never free" (shaftSys.ts:106). A drift is the rung above it: free
 * rather than discounted, instant rather than tapped, and the only one of the
 * two that costs you something you cannot buy back with currency.
 *
 * PILLAR 2. A drift is REACH. It removes travel; it adds no output. Nothing
 * here reaches `cellCap`, `cellRegen` or `chipYield`, so `dpsMax = W·H·regen·Y`
 * is untouched at any depth — and because Depth Pressure is a `dustYield` term,
 * the comparison that matters is at the SAME depth, which is what the test and
 * the driver both do.
 *
 * THE ONE THING A DRIFT MUST NOT DO is pay for itself. Ground the drift hands
 * back is ground you already bought, so `shaftPeak` refuses to count it —
 * otherwise Collapse → fall → Collapse is an infinite Cores faucet at zero
 * cost. See the comment on `shaftPeak`; a run pays exactly what it always paid
 * the moment it goes one step past its own drift.
 */
import { Decimal, D } from '../decimal';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { descendCost } from '../prestigeMath';
import { KILN_DUST_PER_BRICK } from './kiln';
import { convCurrencyId, currentShell } from '../shells';
import { currencyDef, getCurrency, spendCurrency } from '../resources';
import { ensureRoll, shellRoll } from './roll';
import { noteBuiltOf } from './plant';
import { propsBack } from './breaker';
import type { StationDef } from '../content/shell1/roll';

/**
 * WHAT A BAND COSTS, EXPRESSED AS ITS OWN PAYBACK.
 *
 * A hand-sized Brick number would be a claim like any other (the drill bay's
 * draw ladder is ledgered for exactly that). So the price is derived from the
 * thing it replaces: shoring a band costs what descending it costs, three
 * times over, converted at the Kiln's own rate. It states its own answer —
 * **this pays for itself on the third Collapse** — which makes the decision
 * arithmetic a player can do, and it self-scales with the descent curve at
 * every depth and in every shell without a second table.
 */
export const SHORE_PAYBACK = 3;

/** Cast parts off the rack, on top of the Brick. Scarce, and the deep bands want more. */
export function shorePartCost(depth: number): number {
  return 1 + Math.floor(depth / 50);
}

/** The wreck that holds the rig. A shell without one cannot shore, and says so. */
export const SHORING_RIG_WRECK = 'SHORING RIG';

// ---------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------

/** The station in this shell that holds the rig, if the shell authored one. */
export function rigStation(state: GameState): StationDef | null {
  return shellRoll(state).find((d) => d.wreck === SHORING_RIG_WRECK) ?? null;
}

/** Found (the wreck is looted) — the rig can now be raised. */
export function rigFound(state: GameState): boolean {
  const def = rigStation(state);
  if (!def) return false;
  ensureRoll(state);
  return state.roll!.looted.includes(def.id);
}

/** Raised. Survives Collapse; it is infrastructure, not a purchase. */
export function shoringUnlocked(state: GameState): boolean {
  ensureRoll(state);
  return state.roll?.rig === true;
}

// ---------------------------------------------------------------------------
// Bands
// ---------------------------------------------------------------------------

/**
 * A BAND IS THE STRETCH ABOVE A STATION — from the station before it down to
 * it. Shoring is keyed to the station because that is the thing with a name:
 * §1.1's LAW 5 line is *"I shored the Ashfall"*, not "I shored 61 to 72".
 */
export interface Band {
  def: StationDef;
  /** Exclusive: the depth the band starts below. */
  from: number;
  /** Inclusive: the station's own depth. */
  to: number;
}

/** Every band in this shell, shallowest first. A depth-0 station has no band. */
export function bands(state: GameState): Band[] {
  const defs = [...shellRoll(state)].sort((a, b) => a.depth - b.depth);
  const out: Band[] = [];
  let prev = 0;
  for (const def of defs) {
    if (def.depth > prev) out.push({ def, from: prev, to: def.depth });
    prev = Math.max(prev, def.depth);
  }
  return out;
}

export function bandOf(state: GameState, stationId: string): Band | null {
  return bands(state).find((b) => b.def.id === stationId) ?? null;
}

export function isShored(state: GameState, stationId: string): boolean {
  ensureRoll(state);
  return state.roll?.shored?.includes(stationId) ?? false;
}

/** Dust the band costs to descend at full price, once. */
export function bandDust(band: Band): Decimal {
  let sum = D(0);
  for (let d = band.from + 1; d <= band.to; d++) sum = sum.add(descendCost(d));
  return sum;
}

export interface ShoreCost {
  brick: Decimal;
  parts: number;
}

export function shoreCost(state: GameState, stationId: string): ShoreCost | null {
  const band = bandOf(state, stationId);
  if (!band) return null;
  return {
    brick: bandDust(band).mul(SHORE_PAYBACK).div(KILN_DUST_PER_BRICK).ceil(),
    parts: shorePartCost(band.to),
  };
}

// ---------------------------------------------------------------------------
// The drift
// ---------------------------------------------------------------------------

/**
 * HOW FAR THE FALL GOES — the deepest depth reachable by an UNBROKEN chain of
 * shored bands from the top of the shaft.
 *
 * "Drifts chain" is literal: a shored band with an unshored one above it is a
 * tunnel with no way into it, and it is worth nothing until you buy the gap.
 * That is what makes the order of purchase a decision rather than a shopping
 * list, and it is why the panel shows the chain rather than a count.
 */
export function driftDepth(state: GameState): number {
  if (!shoringUnlocked(state)) return 0;
  let depth = 0;
  for (const band of bands(state)) {
    if (!isShored(state, band.def.id)) break;
    depth = band.to;
  }
  return depth;
}

/** The bands that are shored but not yet reachable — bought, and stranded. */
export function strandedDrifts(state: GameState): Band[] {
  const reach = driftDepth(state);
  return bands(state).filter((b) => isShored(state, b.def.id) && b.to > reach);
}

// ---------------------------------------------------------------------------
// Shoring
// ---------------------------------------------------------------------------

/** Why this band cannot be shored right now, or null. */
export function shoreBlocker(state: GameState, stationId: string): string | null {
  if (!shoringUnlocked(state)) return 'The Shoring Rig is not standing.';
  const band = bandOf(state, stationId);
  if (!band) return 'Nothing to shore there.';
  if (isShored(state, stationId)) return 'Already shored.';
  const record = state.depthRecords[currentShell(state).id] ?? 0;
  // YOU CANNOT SHORE AHEAD OF YOURSELF. Timbering a band means having stood in
  // it — which is also what keeps this from being a way to buy depth.
  if (record < band.to) return 'You have not been down there yet.';
  const cost = shoreCost(state, stationId)!;
  const rack = state.casting.rack ?? [];
  if (rack.length < cost.parts) return `Needs ${cost.parts} cast parts (the rack has ${rack.length}).`;
  // THE CURRENCY HAS A NAME PER SHELL. Hardcoding "Brick" printed "Not enough
  // Brick" over a Ferrite panel whose purse says FLUX — the raw-key leak class
  // A.36 fixed in the Museum, in reverse: a hardcoded label instead of a raw id.
  const conv = currencyDef(convCurrencyId(state)).name;
  if (getCurrency(state, convCurrencyId(state)).lt(cost.brick)) return `Not enough ${conv}.`;
  return null;
}

/**
 * TIMBER THE BAND. Parts are spent cheapest-first, the way every other machine
 * on this codebase spends the rack: a player who poured a legendary head should
 * not lose it to a set of props because it was at the front of the list.
 */
export function shoreBand(state: GameState, ctx: EngineCtx, stationId: string): ActionResult {
  const blocked = shoreBlocker(state, stationId);
  if (blocked) return { ok: false, reason: blocked };
  const cost = shoreCost(state, stationId)!;
  const rack = state.casting.rack ?? [];
  const taken = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0)).slice(0, cost.parts);
  if (!spendCurrency(state, convCurrencyId(state), cost.brick)) {
    return { ok: false, reason: `Not enough ${currencyDef(convCurrencyId(state)).name}.` };
  }
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  // §11.2 — what a thing is MADE of is remembered, the same way a machine's is.
  noteBuiltOf(state, `drift:${stationId}`, taken.map((p) => p.materialId));
  ensureRoll(state);
  (state.roll!.shored ??= []).push(stationId);
  ctx.dirty();
  ctx.emit({ type: 'shored', stationId, depth: bandOf(state, stationId)!.to });
  return { ok: true, data: { stationId, brick: cost.brick.toString(), parts: cost.parts } };
}

/**
 * PULL THE TIMBER (§8: *"I froze a seam I didn't want"* → un-shoring, expensively).
 *
 * The props come out and are lost — the Brick is paid AGAIN, not refunded, and
 * the cast parts do not come back. What you get is the band's contents rolling
 * again at the next Collapse, which is the only thing shoring took that
 * currency cannot buy.
 *
 * It does NOT re-roll on the spot: §1.1 puts the re-roll at the Collapse and
 * nowhere else, and a station that re-rolled the instant you paid would be a
 * re-roll button, which is a different system with a different price.
 */
export function unshoreBand(state: GameState, ctx: EngineCtx, stationId: string): ActionResult {
  if (!isShored(state, stationId)) return { ok: false, reason: 'That band is not shored.' };
  const cost = shoreCost(state, stationId);
  if (!cost) return { ok: false, reason: 'Nothing to unshore there.' };
  if (!spendCurrency(state, convCurrencyId(state), cost.brick)) {
    return { ok: false, reason: `Not enough ${currencyDef(convCurrencyId(state)).name} to pull the props safely.` };
  }
  ensureRoll(state);
  state.roll!.shored = (state.roll!.shored ?? []).filter((id) => id !== stationId);
  /**
   * AND THE TIMBER COMES BACK, if the Breaker is standing (A.90, §13, §9.4).
   *
   * Un-shoring used to charge Brick and return NOTHING — the props, the winch
   * and every cast part the band swallowed simply vanished. That made it a pure
   * loss, which made it never the right move, which meant §8's own bottleneck
   * ("I froze a seam I didn't want") had an answer nobody would take.
   *
   * The parts come back as blank stock rather than as the exact parts that went
   * in: the Breaker breaks things, it does not un-break them. Zero without a
   * tier-II Breaker, which is the whole reason to stand one.
   */
  const back = propsBack(state, cost.parts);
  for (let i = 0; i < back; i += 1) {
    state.casting.rack.push({
      id: state.casting.nextId++,
      type: 'sockets',
      materialId: 'marl',
      purity: 40,
    } as never);
  }
  ctx.dirty();
  ctx.emit({ type: 'unshored', stationId });
  return { ok: true, data: { stationId, partsBack: back } };
}

// ---------------------------------------------------------------------------
// The fall
// ---------------------------------------------------------------------------

/**
 * FALL THROUGH THE DRIFTS. Called by `doCollapse` AFTER the run column is reset
 * — this is the fast-forward, and it is the only thing in the game that starts
 * a run anywhere but the surface.
 *
 * It sets three things and each one is load-bearing:
 *
 *   depth          where you are. The fall itself: instant, and free.
 *   shaft.reached  your own tunnel is cleared rock this run, so the CLIMB works
 *                  in it, `descendMultiplier` charges nothing to walk back down
 *                  it, and no separate free-descent path had to be invented.
 *   shaft.drift    the floor this run was HANDED. `shaftPeak` refuses to pay
 *                  Cores on it, which is the whole reason the fast-forward is
 *                  not a faucet.
 */
export function fallThroughDrifts(state: GameState, ctx: EngineCtx): number {
  const depth = driftDepth(state);
  state.shaft.drift = depth;
  if (depth <= 0) return 0;
  state.depth = depth;
  state.shaft.reached = depth;
  state.shaft.lastDigDepth = -1;
  ctx.emit({ type: 'drift', depth });
  return depth;
}

// ---------------------------------------------------------------------------
// The measurement (§9.4's own reason for existing)
// ---------------------------------------------------------------------------

/**
 * WHAT FRACTION OF A COLLAPSE RE-COVERS GROUND ALREADY WALKED.
 *
 * `record` is the shell depth record the run started under; `reached` is where
 * the run got to. Everything at or below the record is ground the player has
 * walked before, so the fraction is what the drift exists to remove — and the
 * drift removes exactly `drift/reached` of it.
 *
 * Exported so the sim and the driver compute it the same way. A number this
 * phase turns on should not have two definitions.
 */
export function recoverFraction(record: number, reached: number, drift = 0): number {
  if (reached <= 0) return 0;
  const walked = Math.max(0, Math.min(record, reached) - drift);
  return Math.max(0, Math.min(1, walked / reached));
}
