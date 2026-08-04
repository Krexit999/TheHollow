/**
 * THE BOILER — PRESSURE AS POWER (§13, the wreck at Boilerworks 40).
 *
 * §13: "run the plant on heat, and choose how hot · blocks ALL Cinder power —
 * without it the shell has no plant."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MEASUREMENT THAT DECIDED WHAT THIS IS.
 *
 * §3.2 gives every shell its own power plant and its own SHAPE:
 *
 *   Loam  the Hearth   pure Flow, small
 *   Ferrite  the Coil  pure Surge — a chain banks a burst
 *   Cinder  the Boiler Surge that grows with heat
 *   ...
 *
 * Measured before anything was written: **all seven shells run the same plant.**
 * `flowCap` is the Hearth (Kiln + heat) everywhere and `surgeCap` is a flat 14
 * plus a Core-tree node, in Loam and in Aleph alike. The whole table in §3.2 is
 * unbuilt, and it is unbuilt because the four machines that were supposed to
 * carry it — the Coil, the Boiler, the Bloom, the Null — do not exist.
 *
 * So the Boiler is not a fifth power source bolted beside the Hearth. It is
 * CINDER'S PLANT, and the Hearth does not follow you down: a hearth is a fire
 * you feed, and in a shell that is already on fire there is nothing to feed.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT DOES NOT TOUCH, and this is the constraint the brief set.
 * `pressure.ts` is Cinder's LOCKED signature and every number in its heat model
 * is untouched: the four laws, the Damper, the hold-line, the governor, the
 * klaxon, the flood. The Boiler READS the gauge and never writes it. There is
 * no path from this file into `addHeat`, `ventRate` or `heatCeiling`.
 *
 * TIERS ARE CAPABILITY (§15.4) — three sentences, each about a different half
 * of the plant:
 *   I    THE FIRE IS LIT — Cinder has Flow at all
 *   II   THE BURST GROWS WITH THE GAUGE — Surge scales with heat (§3.2)
 *   III  AND SO DOES THE SUSTAIN, but only above the Damper's line — the power
 *        you get is the power you are choosing to risk
 *
 * Tier III is the one that makes §13's "choose how hot" a decision rather than
 * a readout: under the hold-line the Boiler is a plain plant, and every degree
 * above it is Flow you bought with danger you can see on the gauge.
 *
 * PILLAR 2. Flow and Surge are what MACHINES draw on; nothing here touches
 * `cellCap`, `cellRegen` or `chipYield`, and there is no path from this file to
 * `harvestCell`. A bigger plant runs converters faster; converters move
 * material that was already dug.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';
import { currentShell } from '../shells';
import { HOLD_LINE_BASE, holdLine } from './pressure';

/** The wreck it is found in — Cinder, Boilerworks 40. Authored with the shell. */
export const BOILER_WRECK = 'THE BOILER';

/**
 * WHAT A LIT BOILER IS WORTH AS SUSTAINED DRAW, before heat says anything.
 * Sized against `HEARTH_FLOOR` (2.4) deliberately: a Cinder player arriving
 * with a Boiler is no worse off than a Loam player with a cold Kiln, so the
 * shell opens on the plant it is supposed to have rather than on a penalty.
 */
export const BOILER_FLOOR = 2.4;
/** Flow per degree ABOVE the Damper's hold-line, at tier III. */
export const BOILER_FLOW_PER_RISK = 0.06;
/** Surge per degree on the gauge, at tier II. §3.2's "the more dangerous, the
 *  bigger the burst" — and it is the whole gauge, not just the risky half. */
export const BOILER_SURGE_PER_HEAT = 0.42;

export const TIER_CAPABILITY_BOILER = [
  'not built',
  'the fire is lit — Cinder has a plant at all',
  '...and the burst grows with the gauge',
  '...and the sustain too, but only above the line you are safe at',
] as const;

export function boilerStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === BOILER_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function boilerFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === BOILER_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function boilerBuilt(state: GameState): boolean {
  return tierOf(state, 'boiler') > 0;
}

/** Tier II: the bank grows with the gauge. */
export function bankGrowsWithHeat(state: GameState): boolean {
  return tierOf(state, 'boiler') >= 2;
}

/** Tier III: and so does the sustain, above the line. */
export function sustainGrowsWithRisk(state: GameState): boolean {
  return tierOf(state, 'boiler') >= 3;
}

export function nextBoilerTierCost(state: GameState): number | null {
  const t = tierOf(state, 'boiler');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildBoiler(state: GameState, ctx: EngineCtx): ActionResult {
  if (!boilerFound(state)) {
    const at = boilerStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Boiler.' };
  }
  const cost = nextBoilerTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Boiler is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'boiler', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['boiler'] = tierOf(state, 'boiler') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'boiler', tier: plant.tiers['boiler']! });
  return { ok: true, data: { tier: plant.tiers['boiler'] } };
}

// ---------------------------------------------------------------------------
// The plant it IS — read by `plant.ts`, which owns Flow and Surge
// ---------------------------------------------------------------------------

/**
 * IS THE BOILER THIS SHELL'S BUSINESS AT ALL.
 *
 * FOUND BY THE DRIVER, NOT BY A TEST. `boilerSurge` had no shell condition on
 * it, so a Boiler stood in Cinder went on banking Surge off the heat gauge
 * while the player was standing in FERRITE — which read as "a bare Ferrite
 * plant has 31 Surge" and blew the Coil's whole measurement. Cinder's plant
 * powering another shell for free is exactly the thing §3.2 exists to stop.
 *
 * The honest boundary is §3.2's own sentence — "because signatures carry down
 * on Breach, your power profile is a BUILD" — so the Boiler works where Cinder
 * works: natively, or in a shell you carried PRESSURE into. Nowhere else.
 */
export function boilerShell(state: GameState): boolean {
  if (currentShell(state).id === 'cinder') return true;
  return state.shell?.signatures?.includes('pressure') ?? false;
}

/**
 * HOW MUCH HEAT IS BEING RISKED — degrees above the Damper's own hold-line,
 * which is the line a shaft nobody is tending converges to. Below it, nothing;
 * the Boiler pays for danger, and the safe line is not dangerous.
 */
export function riskedHeat(state: GameState): number {
  return Math.max(0, (state.pressure?.heat ?? 0) - holdLine(state));
}

/** Cinder's sustained draw. ZERO without a Boiler — §13, literally. */
export function boilerFlow(state: GameState): number {
  if (!boilerBuilt(state)) return 0;
  let flow = BOILER_FLOOR;
  if (sustainGrowsWithRisk(state)) flow += BOILER_FLOW_PER_RISK * riskedHeat(state);
  return flow;
}

/** What the Boiler adds to the bank. §3.2: "Surge that grows with heat". */
export function boilerSurge(state: GameState): number {
  if (!boilerShell(state)) return 0;
  if (!bankGrowsWithHeat(state)) return 0;
  return BOILER_SURGE_PER_HEAT * (state.pressure?.heat ?? 0);
}

/**
 * WHAT THE PANEL SAYS, so the UI computes nothing and the numbers on screen are
 * the numbers the plant used. `line` is the Damper's, quoted rather than
 * re-derived — it is a pressure.ts answer and stays one.
 */
export function boilerRead(state: GameState): {
  built: boolean; tier: number; heat: number; line: number; risked: number;
  flow: number; surge: number;
} {
  return {
    built: boilerBuilt(state),
    tier: tierOf(state, 'boiler'),
    heat: state.pressure?.heat ?? 0,
    line: state.pressure ? holdLine(state) : HOLD_LINE_BASE,
    risked: state.pressure ? riskedHeat(state) : 0,
    flow: boilerFlow(state),
    surge: boilerSurge(state),
  };
}
