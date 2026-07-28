/**
 * THE NEW FORGE — STEP 2: CASTING and the TOOL STATION.
 *
 * Step 1 built the mapping (material → part → tool). This builds the two verbs
 * that put a player's hands on it:
 *
 *   MELT   charge the crucible with a material; it liquefies over a few
 *          seconds and the tub fills. Batch by design — melt a stack, cast
 *          several parts off it.
 *   CAST   pick a shape, pour. It cools into that PART in that material.
 *   BUILD  drop seven parts into the station, combine → YOUR TOOL.
 *
 * FOUR RULES THIS MODULE HOLDS, each from the doc or a standing ruling:
 *
 *  1. NO PUZZLE, NO FAIL. Nothing here can be botched. `castPart` either has
 *     the melt or it does not; there is no timing window, no quality roll, no
 *     RNG anywhere in this file. The satisfaction is the making and the having.
 *  2. NOTHING IS EVER DESTROYED BY BUILDING. Re-assembling a tool returns the
 *     old tool's parts to the rack. The doc's promise is "a tool that is
 *     YOURS... you never throw it away", and a station that ate your last head
 *     because you clicked Combine would break it on the first mistake.
 *  3. THE PENALTY IS VISIBLE BEFORE YOU COMMIT. `benchPreview` assembles
 *     whatever is currently on the station, so the coherence number moves as
 *     parts go in. A mismatch penalty the player only discovers afterwards is
 *     a trap, not a decision.
 *  4. LIGHT VISUALS ONLY. The engine's job here is to expose ONE number the UI
 *     can draw as a plain CSS fill (`crucibleFill`). No geometry, no particles,
 *     nothing that wants a canvas — this codebase has reverted a canvas UI
 *     twice and step 1 was written specifically so step 2 would not need one.
 *
 * NOT IN THIS STEP, deliberately: durability drain, mining integration, sockets
 * holding relics, modifiers, per-shell gating of part types. Each is its own
 * step against the doc's build order.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { PART_TYPES, type PartType } from '../content/forgeParts';
import {
  assembleTool, derivePart, partMelt, type Part, type ToolStats,
} from './forgeParts';
import { materialDef } from '../materials';
import { consumeMaterial, materialCount } from './forge';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * HOW BIG THE TUB IS, in molten units. The whole seven-part set costs 31
 * (`PART_MELT` sums to it), so one full charge is a tool and change — which is
 * the batch size the doc asks for ("melt a stack") without letting the player
 * bank an unbounded lake of one material.
 */
export const TUB_CAPACITY = 40;

/** What one unit of raw material is worth as melt. */
export const MELT_PER_UNIT = 4;

/** Molten units per second. A full tub takes four seconds, which is long
 *  enough to WATCH and short enough that nobody waits on it. */
export const MELT_RATE = 10;

/** Sum of every cast's cost — what a whole tool asks of the tub. */
export const FULL_SET_MELT = PART_TYPES.reduce((n, t) => n + partMelt(t), 0);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** A part on the rack. The id is what the bench points at — indices would
 *  shift the moment a part is consumed, and silently re-slot the wrong one. */
export interface RackPart extends Part {
  id: number;
}

export interface Crucible {
  /** What is in it. '' when cold and empty. */
  materialId: string;
  /** Charged but not yet liquid. Melts into `molten` at MELT_RATE. */
  solid: number;
  /** Liquid, pourable now. */
  molten: number;
  /** The weighted purity of everything charged — a melt is homogeneous, so
   *  this is one running average rather than a per-unit ledger. */
  purity: number;
}

export interface CastingState {
  /** Cast parts you hold but have not built into anything. */
  rack: RackPart[];
  /** The seven station slots, each holding a rack part's id. */
  bench: Partial<Record<PartType, number>>;
  /** YOUR TOOL. Empty until you build one; replaced, never lost. */
  tool: RackPart[];
  crucible: Crucible;
  nextId: number;
  /** Lifetime counters — flavour, and the panel's "you have done this" line. */
  cast: number;
  built: number;
  /** STEP 3: how much the tool has been used, against `poolOf(tool)`. One
   *  shared pool (the doc's lean), and the WORN PART is what you re-seat. */
  wear: number;
  repairs: number;
}

export function defaultCastingState(): CastingState {
  return {
    rack: [],
    bench: {},
    tool: [],
    crucible: { materialId: '', solid: 0, molten: 0, purity: 0 },
    nextId: 1,
    cast: 0,
    built: 0,
    wear: 0,
    repairs: 0,
  };
}

/**
 * THE CASTING FLOOR OPENS WITH THE FORGE. It is the same building — the doc
 * has this replacing the slider-Forge entirely, so gating it behind anything
 * further would put two forges on two different clocks.
 *
 * PER-SHELL GATING OF PART TYPES is step 6, not this one: all seven casts are
 * available from the moment the floor opens, and every shell's materials pour
 * (the standing reach rule — a mechanic works in every shell or it is not
 * finished).
 */
export function castingUnlocked(state: GameState): boolean {
  return state.forge.built;
}

// ---------------------------------------------------------------------------
// Selectors — everything the panel needs, so the UI computes nothing
// ---------------------------------------------------------------------------

/** The two fractions a plain CSS fill bar draws. Nothing else. */
export function crucibleFill(c: Crucible): { molten01: number; solid01: number } {
  return {
    molten01: Math.max(0, Math.min(1, c.molten / TUB_CAPACITY)),
    solid01: Math.max(0, Math.min(1, c.solid / TUB_CAPACITY)),
  };
}

/** Room left, in molten units. */
export function tubRoom(c: Crucible): number {
  return Math.max(0, TUB_CAPACITY - c.solid - c.molten);
}

/** How many units of material would fit right now. */
export function unitsThatFit(c: Crucible): number {
  return Math.floor(tubRoom(c) / MELT_PER_UNIT);
}

/** Can this shape be poured this instant? */
export function canCast(c: Crucible, type: PartType): boolean {
  return c.materialId !== '' && c.molten >= partMelt(type);
}

export function rackPart(state: GameState, id: number): RackPart | undefined {
  return state.casting.rack.find((p) => p.id === id);
}

/** The parts currently on the station, in slot order. */
export function benchParts(state: GameState): RackPart[] {
  const out: RackPart[] = [];
  for (const t of PART_TYPES) {
    const id = state.casting.bench[t];
    const p = id === undefined ? undefined : rackPart(state, id);
    if (p) out.push(p);
  }
  return out;
}

/**
 * WHAT THE STATION WOULD MAKE, right now, from whatever is on it — RULE 3.
 * Returns null only when the bench is empty. A partial bench still assembles,
 * so the coherence number is live from the second part onward and the player
 * watches it fall as they mix shells.
 */
export function benchPreview(state: GameState): ToolStats | null {
  const parts = benchParts(state);
  return parts.length === 0 ? null : assembleTool(parts);
}

/** The tool you carry, or null before you have built one. */
export function currentTool(state: GameState): ToolStats | null {
  return state.casting.tool.length === 0 ? null : assembleTool(state.casting.tool);
}

export function benchComplete(state: GameState): boolean {
  return PART_TYPES.every((t) => state.casting.bench[t] !== undefined
    && rackPart(state, state.casting.bench[t]!) !== undefined);
}

// ---------------------------------------------------------------------------
// The tick — the only thing in this system that takes time
// ---------------------------------------------------------------------------

export function tickCasting(state: GameState, dt: number): void {
  const c = state.casting.crucible;
  if (c.solid <= 0) return;
  const moved = Math.min(c.solid, MELT_RATE * dt);
  c.solid -= moved;
  c.molten += moved;
  // Float dust would leave 1e-14 of solid sitting there forever, and the UI
  // would render a hairline of un-melted stock in a tub the player emptied.
  if (c.solid < 1e-6) c.solid = 0;
}

// ---------------------------------------------------------------------------
// MELT
// ---------------------------------------------------------------------------

/**
 * CHARGE THE CRUCIBLE. Batch is the default: pass the count you want and it
 * takes what fits, so "melt a stack" is one click rather than twenty.
 *
 * ONE MATERIAL AT A TIME, because a part is cast from ONE material (step 1's
 * `Part` carries a single `materialId`) and a tub of two things would have to
 * either lie about what came out or invent an alloy system this step does not
 * have. Refused with a reason rather than silently blended.
 */
export function chargeCrucible(
  state: GameState,
  ctx: EngineCtx,
  materialId: string,
  units: number,
): ActionResult {
  if (!castingUnlocked(state)) return { ok: false, reason: 'The casting floor is cold' };
  const c = state.casting.crucible;
  const held = c.solid + c.molten;
  if (held > 0 && c.materialId !== materialId) {
    return {
      ok: false,
      reason: `${materialDef(c.materialId).name} is already in the tub — pour it off or drain it first`,
    };
  }
  const fits = unitsThatFit(c);
  if (fits <= 0) return { ok: false, reason: 'The tub is full' };
  const have = materialCount(state, materialId);
  if (have <= 0) return { ok: false, reason: `No ${materialDef(materialId).name} in the Hold` };

  const take = Math.max(1, Math.min(Math.floor(units), fits, have));
  const purity = consumeMaterial(state, materialId, take);
  if (purity === null) return { ok: false, reason: 'Short of material' };

  const added = take * MELT_PER_UNIT;
  c.purity = held > 0 ? (c.purity * held + purity * added) / (held + added) : purity;
  c.materialId = materialId;
  c.solid += added;

  ctx.emit({ type: 'crucibleCharged', materialId, units: take, molten: added });
  ctx.dirty();
  return { ok: true, data: { units: take, molten: added } };
}

/** Empty the tub. It is a loss, and the button says so — the alternative is
 *  stranding a player who charged the wrong stone with no way back. */
export function drainCrucible(state: GameState, ctx: EngineCtx): ActionResult {
  const c = state.casting.crucible;
  if (c.solid + c.molten <= 0) return { ok: false, reason: 'Nothing in it' };
  state.casting.crucible = { materialId: '', solid: 0, molten: 0, purity: 0 };
  ctx.dirty();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CAST
// ---------------------------------------------------------------------------

/**
 * POUR. No window to hit, no quality to roll, no way to spoil it — RULE 1. The
 * part comes out of the material that was in the tub, at the purity of that
 * melt, and goes on the rack.
 */
export function castPart(state: GameState, ctx: EngineCtx, type: PartType): ActionResult {
  if (!castingUnlocked(state)) return { ok: false, reason: 'The casting floor is cold' };
  if (!PART_TYPES.includes(type)) return { ok: false, reason: 'No such cast' };
  const c = state.casting.crucible;
  if (c.materialId === '') return { ok: false, reason: 'The tub is empty' };
  const want = partMelt(type);
  if (c.molten < want) {
    const waiting = c.solid > 0;
    return {
      ok: false,
      reason: waiting ? 'Still melting' : `Needs ${want} melt, ${Math.floor(c.molten)} in the tub`,
    };
  }

  c.molten -= want;
  const part: RackPart = {
    id: state.casting.nextId++,
    type,
    materialId: c.materialId,
    purity: Math.max(1, Math.min(100, Math.round(c.purity))),
  };
  state.casting.rack.push(part);
  state.casting.cast += 1;
  // The tub keeps its material while anything is left in it, so a run of casts
  // off one melt does not need re-selecting between pours.
  if (c.solid + c.molten <= 0) c.materialId = '';

  ctx.emit({ type: 'partCast', partType: type, materialId: part.materialId, purity: part.purity });
  ctx.dirty();
  return { ok: true, data: { partId: part.id } };
}

// ---------------------------------------------------------------------------
// THE TOOL STATION
// ---------------------------------------------------------------------------

/** Put a rack part in its slot. A part knows its own shape, so there is no way
 *  to put a head in the handle slot and no error to write for it. */
export function benchPlace(state: GameState, ctx: EngineCtx, partId: number): ActionResult {
  const part = rackPart(state, partId);
  if (!part) return { ok: false, reason: 'Not on the rack' };
  state.casting.bench[part.type] = partId;
  ctx.dirty();
  return { ok: true, data: { slot: part.type } };
}

export function benchClear(state: GameState, ctx: EngineCtx, type: PartType): ActionResult {
  if (state.casting.bench[type] === undefined) return { ok: false, reason: 'Empty already' };
  delete state.casting.bench[type];
  ctx.dirty();
  return { ok: true };
}

/**
 * COMBINE — RULE 2. The seven parts on the station become your tool, and
 * whatever the tool was made of goes BACK ON THE RACK. Nothing is consumed,
 * nothing is lost, and re-building is always safe; the doc's promise is a tool
 * you grow rather than a tool you gamble.
 */
export function buildTool(state: GameState, ctx: EngineCtx): ActionResult {
  if (!castingUnlocked(state)) return { ok: false, reason: 'The casting floor is cold' };
  if (!benchComplete(state)) {
    const missing = PART_TYPES.filter((t) => state.casting.bench[t] === undefined);
    return { ok: false, reason: `Still needs a ${missing.map((m) => m.toUpperCase()).join(', ')}` };
  }
  const parts = benchParts(state);
  const taken = new Set(parts.map((p) => p.id));

  const returned = state.casting.tool;
  state.casting.rack = state.casting.rack.filter((p) => !taken.has(p.id));
  for (const p of returned) state.casting.rack.push(p);

  /**
   * WEAR CARRIES OVER IN PROPORTION TO WHAT DID NOT CHANGE — and this is a
   * closed loophole, not a flourish. Rebuilding does not consume anything (the
   * old parts come straight back to the rack), so "building resets wear" would
   * have made Combine a free, infinite repair: take the tool apart, put the
   * same seven pieces back, mine forever.
   *
   * Carrying by DURABILITY SHARE makes the honest version fall out for free.
   * Re-seat the same seven and nothing is forgiven. Swap the Core — most of
   * the pool — and most of the wear goes with it, which is exactly the doc's
   * "repair by re-casting the worn part". Swap the Grip and you have repaired
   * almost nothing, because a grip was never holding much up.
   */
  const kept = new Set(returned.map((p) => p.id));
  const before = assembleTool(parts).rawStats.durability;
  let keptDur = 0;
  for (const p of parts) if (kept.has(p.id)) keptDur += derivePart(p).stats.durability;
  const carry = before > 0 ? keptDur / before : 0;
  state.casting.wear = Math.max(0, state.casting.wear * carry);

  state.casting.tool = parts;
  state.casting.bench = {};
  state.casting.built += 1;

  const tool = assembleTool(parts);
  ctx.emit({ type: 'toolBuilt', coherence: tool.coherence.factor, rockRate: tool.rockRate });
  ctx.dirty();
  return { ok: true, data: { coherence: tool.coherence.factor, returned: returned.length } };
}

/** Take the tool apart. Its parts go back on the rack; you keep every one. */
export function breakDownTool(state: GameState, ctx: EngineCtx): ActionResult {
  if (state.casting.tool.length === 0) return { ok: false, reason: 'You have not built one' };
  for (const p of state.casting.tool) state.casting.rack.push(p);
  state.casting.tool = [];
  ctx.dirty();
  return { ok: true };
}
