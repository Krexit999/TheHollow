/**
 * THE VENT ARRAY — VENTING (§13, the wreck at Vent Row 58).
 *
 * §13: "control pressure with cast valves · blocks SURVIVING CINDER."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS ALREADY THERE, MEASURED FIRST.
 *
 * `pressure.ts` has shipped a VENT NETWORK since Phase 9: a 7×5 gallery, five
 * outlets, pipe laid by hand, capacity by BFS from the shaft mouth, and a
 * CHOKE. So "control pressure" is not missing — the half that is missing is the
 * one §13 actually names, **CAST VALVES**, and §11.2's rule that a machine is
 * made of parts rather than bought.
 *
 * And a measurement worth writing down: pipe is priced in Obsidian and routes
 * to an outlet, so the whole network is one number. There has never been a
 * piece of vent gear that is a THING you made.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NOTHING IN THE HEAT MODEL MOVES. The four laws, the Damper, the governor,
 * the klaxon, the flood, `ventRate`, `heatCeiling`, `addHeat` — all untouched.
 * The Array adds capacity to `networkCapacity` through one term and adds one
 * SETTING; it cannot make the shaft hotter, and every guarantee that reads
 * "idle can never flood" reads a larger vent number than before, never smaller.
 *
 * TIERS ARE CAPABILITY (§15.4):
 *   I    A VALVE VENTS WHERE IT STANDS — no route to an outlet needed, which
 *        is the one thing pipe cannot do
 *   II   YOU CHOOSE THE LINE the Damper holds, instead of reading it
 *   III  THE ARRAY ANSWERS THE KLAXON — at overpressure it throws itself open,
 *        once per run, whether or not you are there
 *
 * Tier III is why §13 says this machine blocks SURVIVING CINDER, and it is
 * pointed at pillar 1's other player: an idle shaft already cannot flood (law
 * 2), but a shaft you left CHOKED and walked away from is the one shape the
 * Damper takes forty-five seconds to catch. The Array catches it in one.
 *
 * PILLAR 2: venting is not income. Heat's yield multiplier is `pressure.ts`'s
 * and is not read here.
 */
import { D } from '../decimal';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';
import {
  HOLD_LINE_BASE, HOLD_LINE_MAX, VENT_H, VENT_W, networkCapacity,
} from './pressure';

/** The wreck it is found in — Cinder, Vent Row 58. Authored with the shell. */
export const VENT_WRECK = 'THE VENT ARRAY';

/**
 * WHAT ONE VALVE IS WORTH, in heat/s. Sized against a pipe route: `OUTLET_VENT`
 * is 0.5 and falls off 0.92 per step, so a well-placed pipe run delivers
 * ~0.35-0.45 and a long one much less. A valve pays 0.30 flat and needs no
 * route at all — worse than good plumbing, better than none, which is what
 * makes laying pipe still the thing you do.
 */
export const VALVE_VENT = 0.30;
/** How many valves the Array can hold, per tier. Capability is the SLOT. */
export const VALVE_SLOTS = [0, 2, 3, 4] as const;
/** A valve is CAST, not bought — this many parts off the rack, each. */
export const VALVE_PART_COST = 1;

export const TIER_CAPABILITY_VENTS = [
  'not built',
  'a cast valve vents where it stands, with no route to an outlet',
  '...and you choose the line the shaft is held at',
  '...and the array answers the klaxon by itself, once a run',
] as const;

export interface VentArrayState {
  /** Cell indices on the 7×5 gallery holding a cast valve. */
  valves: number[];
  /** Tier II: the hold-line you asked for, or null for the derived one. */
  askedLine: number | null;
  /** Tier III: has the array already thrown itself open this run? */
  answered: boolean;
}

export function defaultVentArrayState(): VentArrayState {
  return { valves: [], askedLine: null, answered: false };
}

export function ensureVents(state: GameState): VentArrayState {
  const v = (state.vents ??= defaultVentArrayState());
  v.valves ??= [];
  if (v.askedLine === undefined) v.askedLine = null;
  v.answered ??= false;
  return v;
}

export function ventStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === VENT_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function ventArrayFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === VENT_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function ventArrayBuilt(state: GameState): boolean {
  return tierOf(state, 'vents') > 0;
}

export function valveSlots(state: GameState): number {
  return VALVE_SLOTS[Math.min(tierOf(state, 'vents'), MAX_MACHINE_TIER)] ?? 0;
}

/** Tier II: the line is a setting, not a readout. */
export function choosesTheLine(state: GameState): boolean {
  return tierOf(state, 'vents') >= 2;
}

/** Tier III: it opens itself at the klaxon. */
export function answersTheKlaxon(state: GameState): boolean {
  return tierOf(state, 'vents') >= 3;
}

export function nextVentTierCost(state: GameState): number | null {
  const t = tierOf(state, 'vents');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildVentArray(state: GameState, ctx: EngineCtx): ActionResult {
  if (!ventArrayFound(state)) {
    const at = ventStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Vent Array.' };
  }
  const cost = nextVentTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Array is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'vents', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['vents'] = tierOf(state, 'vents') + 1;
  ensureVents(state);
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'vents', tier: plant.tiers['vents']! });
  return { ok: true, data: { tier: plant.tiers['vents'] } };
}

// ---------------------------------------------------------------------------
// The valves
// ---------------------------------------------------------------------------

export function valvesSet(state: GameState): number[] {
  return state.vents?.valves ?? [];
}

/** What the valves add to the gallery's capacity — read by `pressure.ts`. */
export function valveCapacity(state: GameState): number {
  if (!ventArrayBuilt(state)) return 0;
  return Math.min(valvesSet(state).length, valveSlots(state)) * VALVE_VENT;
}

export function valveBlocker(state: GameState, cell: number): string | null {
  if (!ventArrayBuilt(state)) return 'The Vent Array is not standing.';
  if (cell < 0 || cell >= VENT_W * VENT_H) return 'Off the gallery.';
  if (valvesSet(state).includes(cell)) return null;   // pulling one is always allowed
  if (valvesSet(state).length >= valveSlots(state)) {
    return `This Array holds ${valveSlots(state)} valve${valveSlots(state) === 1 ? '' : 's'}. Deepen it, or move one.`;
  }
  if ((state.casting?.rack?.length ?? 0) < VALVE_PART_COST) {
    return `A valve is CAST — ${VALVE_PART_COST} part on the rack.`;
  }
  return null;
}

/**
 * SET OR PULL ONE VALVE. Pulling is free and gives nothing back, exactly like
 * pulling pipe: re-routing is the whole game on this board, and a valve you
 * cannot move is a mistake you cannot fix.
 */
export function setValve(state: GameState, ctx: EngineCtx, cell: number): ActionResult {
  const blocked = valveBlocker(state, cell);
  if (blocked) return { ok: false, reason: blocked };
  const v = ensureVents(state);
  const at = v.valves.indexOf(cell);
  if (at >= 0) {
    v.valves.splice(at, 1);
    ctx.dirty();
    return { ok: true, data: { removed: true, cell } };
  }
  const rack = state.casting.rack ?? [];
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, VALVE_PART_COST);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'vents', taken.map((p) => p.materialId));
  v.valves.push(cell);
  ctx.emit({ type: 'valveSet', cell });
  ctx.dirty();
  return { ok: true, data: { cell } };
}

// ---------------------------------------------------------------------------
// The line
// ---------------------------------------------------------------------------

/** The highest line this gallery can actually hold — the derived one. */
export function lineCeiling(state: GameState): number {
  return Math.min(HOLD_LINE_MAX, HOLD_LINE_BASE + networkCapacity(state) * 18);
}

/**
 * TIER II — ASK FOR A LINE. Never above what the plumbing can hold, so this
 * buys CONTROL and never headroom: a player who wants to sit cooler than the
 * network would has no way to say so today, and cooler is sometimes what you
 * want (a Frost-quenched tool, a run you intend to leave).
 */
export function setHoldLine(state: GameState, ctx: EngineCtx, line: number | null): ActionResult {
  if (!choosesTheLine(state)) return { ok: false, reason: 'This Array only reads the line. A deeper one sets it' };
  const v = ensureVents(state);
  if (line === null) { v.askedLine = null; ctx.dirty(); return { ok: true, data: { line: null } }; }
  const top = lineCeiling(state);
  const want = Math.max(HOLD_LINE_BASE, Math.min(top, Math.round(line)));
  v.askedLine = want;
  ctx.dirty();
  return { ok: true, data: { line: want, ceiling: top } };
}

/** What the Damper should hold at — `pressure.ts` asks this, not the reverse. */
export function askedLine(state: GameState): number | null {
  if (!choosesTheLine(state)) return null;
  const asked = state.vents?.askedLine;
  return typeof asked === 'number' ? asked : null;
}

/**
 * TIER III — THE ARRAY ANSWERS. Called from the klaxon branch of the heat
 * tick. It releases the choke and spends its one answer; it does not touch
 * heat, so law 3's escape is still the relief valve doing what it always did.
 */
export function answerKlaxon(state: GameState, ctx: EngineCtx): boolean {
  if (!answersTheKlaxon(state)) return false;
  const v = ensureVents(state);
  if (v.answered) return false;
  v.answered = true;
  if (state.pressure.choke) {
    state.pressure.choke = false;
    ctx.emit({ type: 'chokeReleased', reason: 'array' });
  }
  ctx.emit({ type: 'arrayAnswered' });
  return true;
}

/** A new run gets its answer back. Called wherever a run begins. */
export function resetVentRun(state: GameState): void {
  if (state.vents) state.vents.answered = false;
}

/** What the panel says — the UI computes nothing. */
export function ventRead(state: GameState): {
  built: boolean; tier: number; valves: number[]; slots: number;
  valveVent: number; asked: number | null; ceiling: number; answered: boolean;
} {
  return {
    built: ventArrayBuilt(state),
    tier: tierOf(state, 'vents'),
    valves: valvesSet(state),
    slots: valveSlots(state),
    valveVent: valveCapacity(state),
    asked: askedLine(state),
    ceiling: state.pressure ? lineCeiling(state) : HOLD_LINE_BASE,
    answered: state.vents?.answered ?? false,
  };
}

export { D };
