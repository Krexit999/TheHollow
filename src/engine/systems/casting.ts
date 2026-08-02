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
import type { ActionResult, DrillState, EngineCtx, GameState } from '../types';
import {
  LAYER_MAX, LAYER_MELT_EXTRA, PART_DEFS, PART_TYPES, layerWeights, shapeDef,
  BOON_BY_ID, CRAFT_ODDS, MASTERWORKS,
  type CraftTier, type GrowthBoonId, type MasterworkId, type PartShape, type PartType,
} from '../content/forgeParts';
import {
  assembleTool, derivePart, partMaterials, partMelt, growthProgress, boonsFor, boonCost,
  type Part, type ToolStats,
} from './forgeParts';
import type { ToolBio } from './toolBio';
/**
 * THE ONE DELIBERATE CYCLE, and it is the same one `toolMining` documents.
 * `toolMods` reads `currentTool` from here and this reads `forgeDiscover` from
 * there. Neither touches the other at module-evaluation time — `forgeDiscover`
 * is a hoisted function declaration called only from inside a verb — so both
 * load orders resolve.
 */
import { forgeDiscover } from './toolMods';
import type { SocketFill } from './toolSockets';
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

/** One stone's worth of stock in the tub. */
export interface Charge {
  materialId: string;
  /** Charged but not yet liquid. Melts into `molten` at MELT_RATE. */
  solid: number;
  /** Liquid, pourable now. */
  molten: number;
  /** The weighted purity of this stone's stock — one running average, because
   *  a melt of one material is homogeneous however many times you top it up. */
  purity: number;
}

/**
 * THE TUB HOLDS SEVERAL STONES AT ONCE, in an order you set.
 *
 * It used to hold exactly one, and refuse a second until you drained the first.
 * That made "cast a Head in Marl and an Edge in Lodestone" four trips: melt,
 * pour, drain, melt again. Nothing about that was a decision — it was
 * bookkeeping between you and the parts you had already chosen.
 *
 * So charges QUEUE. Every one of them melts (they are all sitting in the same
 * heat), and the FRONT of the queue is what a pour draws from. Click any queued
 * stone to bring it to the front and the next cast comes out in that material.
 * The tub's colour is the front charge's, so "what am I about to cast in" is
 * answered by looking at it rather than by reading a list.
 */
export interface Crucible {
  /** Front first. `queue[0]` is what pours. */
  queue: Charge[];
}

/** How many distinct stones the tub will hold. Past this you are not queueing,
 *  you are hoarding, and the panel stops being readable. */
export const QUEUE_MAX = 6;

export interface CastingState {
  /** Cast parts you hold but have not built into anything. */
  rack: RackPart[];
  /** The seven station slots, each holding a rack part's id. */
  bench: Partial<Record<PartType, number>>;
  /**
   * LEGEND IDS THE PLAYER HAS EARNED (`systems/legendary.ts`).
   *
   * The DEED, not the holding — a legend you melted down is still one you
   * earned, and inferring from the rack would hand out a second copy the moment
   * you salvaged one. Absent on every save written before this, which reads as
   * none, so no migration is needed.
   */
  legends?: string[];
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
  /** `playTimeSec` of the last swing. Self-mending waits `MEND_IDLE_SEC`
   *  past it — absent reads as "never used", so no migration is needed. */
  lastUsedAt?: number;
  repairs: number;
  /** CELLS this tool has mined, ever. The record of what it has DONE, as
   *  against what its parts say it IS. Never reset — see `gainToolXp`. */
  xp: number;
  /**
   * THE TOOL AS AN ABILITY CARRIER. Shaped like a drill because everything in
   * `systems/drillAlloys.ts` reads a `DrillState`, and the tool phase reused
   * that whole apparatus rather than growing a second one — `fits` is what the
   * build granted and the player seated, `lastCell` is where the last swing
   * landed, and the meters live in `fits[].ch`.
   *
   * Stored rather than derived because a half-full meter is state the player
   * earned by swinging, and losing it on a reload would be a small theft.
   * See `systems/toolAbilities.ts`.
   */
  hand?: DrillState;
  /** MODIFIERS seated on the tool, and how deep each is stacked. Slots come
   *  from the Binding stone and from levels — see `systems/toolMods.ts`. */
  mods?: Array<{ id: string; n: number; xp?: number }>;
  /** The library: every modifier this player has ever made. Survives a rebuild,
   *  because knowing how to make a thing is not something a tool holds. */
  knownMods?: string[];
  /**
   * WHAT REVEALED EACH ONE — "a graveclay Head", "a tool of seven". Flavour on
   * the surface and a real affordance underneath: the library becomes a record
   * of REASONING, so a player who can see that dense stone taught them Heavy
   * Head can work out what dense stone is likely to teach them next. Absent for
   * anything discovered before this existed, which reads as "you have known this
   * a while" rather than as a hole.
   */
  modFrom?: Record<string, string>;
  /** SYNERGIES the player has ever woken. A found-not-listed record (pillar 5),
   *  kept apart from `knownMods` because a synergy is never applied — you
   *  arranged it, and the Codex remembers that you did. */
  knownSynergies?: string[];
  /** CLASSES this tool has ever emerged into. Knowledge, like a synergy — it
   *  survives rebuilding the tool into something else. */
  knownClasses?: string[];
  /**
   * SECONDS UNTIL A HEAVY TOOL WILL SWING AGAIN. Absent or zero for bare hands,
   * for an even tool and for every light one — see `balanceOf`. Stored because
   * it has to survive the tick, and it is the one piece of balance that is
   * state rather than derivation.
   */
  windup?: number;
  /** THE TOOL'S HISTORY. Information only — see `systems/toolBio.ts`. */
  bio?: ToolBio;
  /**
   * WHAT IS SET IN THE SOCKETS — a relic uid, a rune id or a gem id per slot,
   * in row order. The ROW LENGTH is derived from the Sockets part's attunement
   * (`socketCount`) and this array is only the contents, stored sparse: a fill
   * past the current end is held but inert, so re-pouring a shallower Sockets
   * stone cannot destroy what the player put in. See `systems/toolSockets.ts`.
   *
   * Deliberately NOT part of `toolKey`: sockets sit on the TOOL, not on a Part,
   * and `assembleTool` does not read them — so the memo is unaffected.
   */
  sockets?: Array<SocketFill | null>;
}

/**
 * HOW WELL A POUR CAME OUT. The one roll on the Casting Floor, and it narrows
 * rule 1 rather than breaking it: nothing can be BOTCHED — a Poor part has the
 * same stats, shape and layers a Masterwork one has — the roll only ever adds a
 * small utility bonus, and most of the time it adds nothing at all.
 */
export function rollCraft(): { craft: CraftTier; work?: MasterworkId } {
  const r = Math.random();
  let craft: CraftTier = 'good';
  for (const [tier, upTo] of CRAFT_ODDS) {
    if (r < upTo) { craft = tier; break; }
  }
  if (craft !== 'masterwork') return { craft };
  const work = MASTERWORKS[Math.floor(Math.random() * MASTERWORKS.length)]!.id;
  return { craft, work };
}

/**
 * TAKE A LIVING PART'S BOON. The part has done the work; this is the choice it
 * offers, and it is a choice — three on the table, one taken, and the same one
 * may be taken again if that is the tool you want.
 */
export function matureLivingPart(
  state: GameState, ctx: EngineCtx, type: PartType, boon: GrowthBoonId,
): ActionResult {
  const part = state.casting.tool.find((p) => p.type === type);
  if (!part) return { ok: false, reason: 'No such part on it' };
  if (!BOON_BY_ID.has(boon)) return { ok: false, reason: 'No such thing to become' };
  const prog = growthProgress(part);
  if (!prog.living) return { ok: false, reason: 'That part is not alive' };
  if (prog.grown) return { ok: false, reason: 'That part is finished growing' };
  // EACH BOON COSTS ITS OWN PACE. A part can be ready for Grasping (0.8x) and
  // still owe work for Thickening (1.5x) — which is the variety the report asked
  // for, and it only reads as variety if the refusal names the right number.
  if (!boonsFor(part).some((b) => b.id === boon)) {
    return { ok: false, reason: `This part is not the sort of thing that becomes that` };
  }
  const cost = boonCost(part, boon);
  if ((part.growth ?? 0) < cost) {
    return { ok: false, reason: `${BOON_BY_ID.get(boon)!.name} wants more — ${Math.floor(part.growth ?? 0)}/${cost}` };
  }

  (part.grown ??= []).push(boon);
  // The work spent goes with it; the next stage starts from nothing.
  part.growth = Math.max(0, (part.growth ?? 0) - cost);
  ctx.emit({
    type: 'partMatured',
    partType: type,
    boon,
    name: BOON_BY_ID.get(boon)!.name,
    stage: part.grown.length,
  });
  ctx.dirty();
  return { ok: true, data: { boon, stage: part.grown.length } };
}

/**
 * A LIVING PART GROWS FROM THE WORK THE TOOL DOES. Called from the manual verbs
 * with cells that actually gave something up — the same currency the tool and
 * its modifiers level on, which is regen-bound and cannot be tapped for.
 */
export function growLivingParts(state: GameState, ctx: EngineCtx | undefined, cells: number): void {
  if (cells <= 0 || !state.casting) return;
  for (const p of state.casting.tool) {
    const before = growthProgress(p);
    if (!before.living || before.grown || before.ready) continue;
    p.growth = (p.growth ?? 0) + cells;
    if (growthProgress(p).ready && ctx) {
      ctx.emit({ type: 'partReadyToGrow', partType: p.type });
      ctx.dirty();
    }
  }
}

export function defaultCastingState(): CastingState {
  return {
    rack: [],
    bench: {},
    tool: [],
    crucible: { queue: [] },
    nextId: 1,
    cast: 0,
    built: 0,
    wear: 0,
    repairs: 0,
    xp: 0,
    hand: { level: 1, timer: 0, lastCell: -1, name: 'your tool', fits: [] },
    mods: [],
    knownMods: [],
    modFrom: {},
    knownSynergies: [],
    knownClasses: [],
    windup: 0,
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
/**
 * THE ONE GATE, AND IT IS NOT A TIER. Audited this pass: nothing in the casting
 * path reads a forge TIER — not `castingUnlocked`, not `chargeCrucible`,
 * `castPart`, `benchPlace`, `meltBack` or `buildTool`. `castingToolTier` is
 * derived FROM a built tool and only ever feeds the depth wall (§LAW 1's
 * hardness key); it never gates the floor that makes the tool.
 *
 * `forge.built` is the storage bit, kept because it is in every save and in
 * `SURVIVES_BREACH`. What it MEANS is "the Casting Floor is open" — the
 * upgrade that sets it is named that now.
 */
export function castingUnlocked(state: GameState): boolean {
  return state.forge.built;
}

// ---------------------------------------------------------------------------
// Selectors — everything the panel needs, so the UI computes nothing
// ---------------------------------------------------------------------------

/** What pours next. Null when the tub is cold. */
export function frontCharge(c: Crucible): Charge | null {
  return c.queue[0] ?? null;
}

/** Everything in the tub, front first. */
export function queued(c: Crucible): Charge[] {
  return c.queue;
}

/** The two fractions the fill bar draws — the FRONT charge's, because that is
 *  the one you are about to pour. */
export function crucibleFill(c: Crucible): { molten01: number; solid01: number } {
  const f = frontCharge(c);
  if (!f) return { molten01: 0, solid01: 0 };
  return {
    molten01: Math.max(0, Math.min(1, f.molten / TUB_CAPACITY)),
    solid01: Math.max(0, Math.min(1, f.solid / TUB_CAPACITY)),
  };
}

/** Everything the tub holds, across every charge. Capacity is shared. */
export function tubHeld(c: Crucible): number {
  let n = 0;
  for (const q of c.queue) n += q.solid + q.molten;
  return n;
}

/** Room left, in molten units. */
export function tubRoom(c: Crucible): number {
  return Math.max(0, TUB_CAPACITY - tubHeld(c));
}

/** How many units of material would fit right now. */
export function unitsThatFit(c: Crucible): number {
  return Math.floor(tubRoom(c) / MELT_PER_UNIT);
}

/** Can this shape be poured this instant, out of the FRONT charge? */
/**
 * WHAT A POUR WANTS FROM THE TUB, in total.
 *
 * Layers cost more — each one past the first adds `LAYER_MELT_EXTRA` of the
 * base — and the total is SPLIT across the layers by their weights, each drawn
 * from its own stone. So a three-layer head is not just dearer, it is dearer in
 * three different materials, which is what makes Damascus a commitment rather
 * than a strictly-better default.
 */
export function castMelt(type: PartType, shape?: PartShape, layers = 1): number {
  const n = Math.max(1, Math.min(LAYER_MAX, layers));
  const base = partMelt(type) * shapeDef(shape, type).melt;
  return Math.max(1, Math.round(base * (1 + LAYER_MELT_EXTRA * (n - 1))));
}

/** What each layer of that pour draws from its own stone, outer first. */
export function layerDraw(type: PartType, shape?: PartShape, layers = 1): number[] {
  const n = Math.max(1, Math.min(LAYER_MAX, layers));
  const total = castMelt(type, shape, n);
  return layerWeights(n).map((w) => Math.max(1, Math.round(total * w)));
}

/**
 * CAN THIS BE POURED? For a single layer, the front stone needs the melt. For a
 * layered pour, the first N stones each need THEIR share — which is the gate
 * that makes layering depend on the queue rather than on a new resource.
 */
export function canCast(
  c: Crucible, type: PartType, shape?: PartShape, layers = 1,
): boolean {
  const n = Math.max(1, Math.min(LAYER_MAX, layers));
  if (c.queue.length < n) return false;
  const draws = layerDraw(type, shape, n);
  for (let i = 0; i < n; i++) {
    if ((c.queue[i]?.molten ?? 0) < draws[i]!) return false;
  }
  return true;
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
/**
 * WHAT THE PLAYER IS HOLDING — memoised, because it is now on the hot path.
 *
 * `assembleTool` derives seven parts, folds ten stats, computes coherence and
 * a shape fold. That was fine when it was read once a swing. It is not fine
 * now: `modCache` reads it (for the slot budget) and `toolClass` reads it
 * again (for the class gate), `modCache` is called several times per firing,
 * and a firing can happen every swing — so a test that fired thirty-five
 * abilities thirty times each went from fast to a five-second timeout the
 * moment classes landed. That is the profile of a real save under a heavy
 * build, not a test artifact.
 *
 * The cache key is the parts themselves — type, material, purity and shape —
 * which is exactly what `assembleTool` reads and nothing else. Anything that
 * changes the tool changes the key; anything that does not, does not. One
 * entry, because there is one tool.
 */
let toolCacheKey = '';
let toolCacheVal: ToolStats | null = null;

/**
 * THE KEY MUST NAME EVERYTHING A READER OF THE MEMO CAN SEE — and the first
 * version did not, which was a real bug caught by the living-materials tests.
 *
 * It hashed type/material/purity/shape only. Two problems, one latent and one
 * live:
 *
 *  - LAYERS WERE MISSING. A solid marl Head and a marl-over-firstiron Head hash
 *    identically, so whichever was assembled first would be handed back for the
 *    other. That has been true since layering landed and nothing caught it
 *    because every test that compared blends called `assembleTool` directly.
 *  - `grown` AND `craft` WERE MISSING, and they are read off `tool.parts` by
 *    `growthFold` and `craftFold`. The memo returns a tool whose `parts` is
 *    whatever array it was built from, so after a rebuild — or a new state with
 *    the same descriptors — mutating the LIVE array changed nothing the readers
 *    could see. Three tests failed on it at once: a Supple part did not steady,
 *    a Trueborn did not steady, and a Thrifty repair charged full price.
 *
 * So the key is now every field `Part` carries. The rule to keep: adding a field
 * to `Part` means adding it here, or the memo silently serves a stale answer.
 */
function toolKey(parts: Part[]): string {
  let k = '';
  for (const p of parts) {
    k += `${p.type}:${p.materialId}:${p.purity}:${p.shape ?? ''}`;
    for (const l of p.layers ?? []) k += `/${l.materialId}:${l.purity}`;
    k += `:${(p.grown ?? []).join('+')}:${p.growth ?? 0}:${p.craft ?? ''}:${p.work ?? ''}`;
    // EVERY FIELD OF `Part` MUST APPEAR HERE or the memo serves a stale tool —
    // the standing rule this cache has caught people on more than once.
    k += `:${p.legend ?? ''}|`;
  }
  return k;
}

export function currentTool(state: GameState): ToolStats | null {
  const parts = state.casting.tool;
  if (parts.length === 0) return null;
  const key = toolKey(parts);
  if (key !== toolCacheKey || toolCacheVal === null) {
    toolCacheKey = key;
    toolCacheVal = assembleTool(parts);
  }
  return toolCacheVal;
}

export function benchComplete(state: GameState): boolean {
  return PART_TYPES.every((t) => state.casting.bench[t] !== undefined
    && rackPart(state, state.casting.bench[t]!) !== undefined);
}

// ---------------------------------------------------------------------------
// The tick — the only thing in this system that takes time
// ---------------------------------------------------------------------------

export function tickCasting(state: GameState, dt: number): void {
  // EVERY CHARGE MELTS, not just the front one — they are all sitting in the
  // same heat, and the whole point of queueing is that the second stone is
  // ready when you want it. A queue that only melted at the front would make
  // batching cost exactly as much waiting as not batching.
  for (const q of state.casting.crucible.queue) {
    if (q.solid <= 0) continue;
    const moved = Math.min(q.solid, MELT_RATE * dt);
    q.solid -= moved;
    q.molten += moved;
    // Float dust would leave 1e-14 of solid sitting there forever, and the UI
    // would render a hairline of un-melted stock in a tub the player emptied.
    if (q.solid < 1e-6) q.solid = 0;
  }
  // THE WIND-UP COMES BACK ROUND. A heavy tool is only heavy between swings.
  if ((state.casting.windup ?? 0) > 0) {
    state.casting.windup = Math.max(0, state.casting.windup! - dt);
  }
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
  const fits = unitsThatFit(c);
  if (fits <= 0) return { ok: false, reason: 'The tub is full' };
  const have = materialCount(state, materialId);
  if (have <= 0) return { ok: false, reason: `No ${materialDef(materialId).name} in the Hold` };

  const existing = c.queue.find((q) => q.materialId === materialId);
  if (!existing && c.queue.length >= QUEUE_MAX) {
    return { ok: false, reason: `The tub is holding ${QUEUE_MAX} stones already` };
  }

  const take = Math.max(1, Math.min(Math.floor(units), fits, have));
  const purity = consumeMaterial(state, materialId, take);
  if (purity === null) return { ok: false, reason: 'Short of material' };

  const added = take * MELT_PER_UNIT;
  if (existing) {
    // TOPPING UP THE SAME STONE, so it stays ONE charge rather than becoming a
    // second queue entry that looks like a different material at a glance.
    const held = existing.solid + existing.molten;
    existing.purity = held > 0 ? (existing.purity * held + purity * added) / (held + added) : purity;
    existing.solid += added;
  } else {
    c.queue.push({ materialId, solid: added, molten: 0, purity });
  }

  ctx.emit({ type: 'crucibleCharged', materialId, units: take, molten: added });
  ctx.dirty();
  return { ok: true, data: { units: take, molten: added, queued: c.queue.length } };
}

/**
 * BRING A QUEUED STONE TO THE FRONT — the whole reason the queue exists. The
 * next pour comes out in this material, and the tub changes colour to say so.
 * Moving a charge is free and instant: it is a change of mind, not a craft, and
 * charging it a cost would just push players back to draining and re-melting.
 */
export function bringToFront(state: GameState, ctx: EngineCtx, index: number): ActionResult {
  const c = state.casting.crucible;
  if (index < 0 || index >= c.queue.length) return { ok: false, reason: 'Nothing there' };
  if (index === 0) return { ok: false, reason: 'Already next' };
  const [moved] = c.queue.splice(index, 1);
  c.queue.unshift(moved!);
  ctx.dirty();
  return { ok: true, data: { materialId: moved!.materialId } };
}

/** Empty the tub. It is a loss, and the button says so — the alternative is
 *  stranding a player who charged the wrong stone with no way back. */
export function drainCrucible(state: GameState, ctx: EngineCtx, index = 0): ActionResult {
  const c = state.casting.crucible;
  if (c.queue.length === 0) return { ok: false, reason: 'Nothing in it' };
  const at = Math.max(0, Math.min(index, c.queue.length - 1));
  const [gone] = c.queue.splice(at, 1);
  ctx.dirty();
  return { ok: true, data: { materialId: gone!.materialId } };
}

// ---------------------------------------------------------------------------
// CAST
// ---------------------------------------------------------------------------

/**
 * POUR. No window to hit, no quality to roll, no way to spoil it — RULE 1. The
 * part comes out of the material that was in the tub, at the purity of that
 * melt, and goes on the rack.
 */
export function castPart(
  state: GameState, ctx: EngineCtx, type: PartType, shape?: PartShape, layers = 1,
): ActionResult {
  if (!castingUnlocked(state)) return { ok: false, reason: 'The casting floor is cold' };
  if (!PART_TYPES.includes(type)) return { ok: false, reason: 'No such cast' };
  const c = state.casting.crucible;
  const front = frontCharge(c);
  if (!front) return { ok: false, reason: 'The tub is empty' };
  /**
   * THE MOULD IS PART OF THE PRICE. An awkward shape wants more stock in it —
   * a Wide head is 40% more melt than a Point, a Needle slightly less. That is
   * the only cost a shape carries, and it is deliberately small: the shape is
   * meant to be a CHOICE about how the tool plays, not a tax on making one.
   *
   * A shape that does not belong to this part is not an error, it is the plain
   * shape — `shapeDef` resolves it — so a stale id from an old save or a
   * hand-built dispatch can never produce a part that is nothing.
   */
  const cast = shapeDef(shape, type);
  /**
   * LAYERS DRAW FROM THE FIRST N STONES IN THE QUEUE, outer first.
   *
   * That is the whole gate on Damascus, and it reuses the mechanism the queue
   * was built for: you cannot pour three layers without three stones in the
   * heat at once, in the order you want them. `bringToFront` is how you choose
   * which is the outer.
   */
  const want = Math.max(1, Math.min(LAYER_MAX, Math.round(layers)));
  if (c.queue.length < want) {
    return { ok: false, reason: `${want} layers wants ${want} stones in the tub` };
  }
  const draws = layerDraw(type, cast.id, want);
  for (let i = 0; i < want; i++) {
    const q = c.queue[i]!;
    if (q.molten < draws[i]!) {
      const waiting = q.solid > 0;
      return {
        ok: false,
        reason: waiting
          ? 'Still melting'
          : `${materialDef(q.materialId).name} needs ${draws[i]}, has ${Math.floor(q.molten)}`,
      };
    }
  }

  const stack = c.queue.slice(0, want).map((q, i) => {
    q.molten -= draws[i]!;
    return { materialId: q.materialId, purity: Math.max(1, Math.min(100, Math.round(q.purity))) };
  });

  const part: RackPart = {
    id: state.casting.nextId++,
    type,
    materialId: stack[0]!.materialId,
    purity: stack[0]!.purity,
    shape: cast.id,
    // Only stored when there IS one, so a plain part's shape on disk is exactly
    // what it was before layering existed.
    ...(want > 1 ? { layers: stack.slice(1) } : {}),
    ...rollCraft(),
  };
  state.casting.rack.push(part);
  state.casting.cast += 1;
  // A SPENT CHARGE LEAVES THE QUEUE, so the next stone comes forward on its own
  // and a run of casts never stalls on an empty entry nobody thought to clear.
  // Swept back-to-front so removing one does not shift the index of the next.
  for (let i = want - 1; i >= 0; i--) {
    const q = c.queue[i]!;
    if (q.solid + q.molten <= 1e-9) c.queue.splice(i, 1);
  }

  ctx.emit({
    type: 'partCast', partType: type, materialId: part.materialId, purity: part.purity,
  });
  /**
   * THE POUR ITSELF TEACHES. Every stone that went into this part — the outer
   * and every layer under it — is read for what it reaches for, and whatever
   * the player has been deep enough to understand enters the library. This is
   * the mirror of `syncToolAbilities` reading a build's three rock-facing
   * stones, one step earlier in the process.
   */
  const learned = forgeDiscover(
    state, ctx, partMaterials(part),
    `a ${materialDef(part.materialId).name} ${PART_DEFS[type].name}`,
  );
  ctx.dirty();
  return { ok: true, data: { partId: part.id, layers: want, learned: learned.map((m) => m.id) } };
}

/**
 * MELT A PART BACK DOWN. The rack was a one-way street: every pour you thought
 * better of sat there forever, and by the third shell it was a wall of parts
 * nobody would ever fit. This is the way out.
 *
 * SIXTY PER CENT, so it is a RECLAIM and not an undo. You lose something every
 * time you change your mind, which keeps the first pour a decision — but you
 * are never stuck holding a mistake, which is the same anti-treadmill rule the
 * Refinery's loss ratio follows: always progress, never free.
 *
 * A part on the STATION or IN THE TOOL is not on the rack and cannot be melted;
 * take it off first. That is a guard rather than a courtesy — melting the head
 * out of the tool you are holding is not a thing anyone means to do.
 */
export const MELT_BACK_SHARE = 0.6;

export function meltBack(state: GameState, ctx: EngineCtx, partId: number): ActionResult {
  if (!castingUnlocked(state)) return { ok: false, reason: 'The casting floor is cold' };
  const part = rackPart(state, partId);
  if (!part) return { ok: false, reason: 'Not on the rack' };
  if (Object.values(state.casting.bench).includes(partId)) {
    return { ok: false, reason: 'It is on the station — take it off first' };
  }
  const c = state.casting.crucible;
  const back = Math.round(partMelt(part.type) * MELT_BACK_SHARE * 10) / 10;
  if (tubRoom(c) < back) return { ok: false, reason: 'No room in the tub' };

  // It goes back to its OWN stone's charge, or opens one. The queue is what
  // makes this simple — it no longer has to argue with whatever is in the tub.
  const own = c.queue.find((q) => q.materialId === part.materialId);
  if (own) {
    const held = own.solid + own.molten;
    own.purity = held > 0 ? (own.purity * held + part.purity * back) / (held + back) : part.purity;
    own.molten += back;
  } else {
    if (c.queue.length >= QUEUE_MAX) {
      return { ok: false, reason: `The tub is holding ${QUEUE_MAX} stones already` };
    }
    c.queue.push({ materialId: part.materialId, solid: 0, molten: back, purity: part.purity });
  }
  state.casting.rack = state.casting.rack.filter((p) => p.id !== partId);

  ctx.emit({ type: 'partMelted', partType: part.type, materialId: part.materialId, molten: back });
  ctx.dirty();
  return { ok: true, data: { molten: back, of: partMelt(part.type) } };
}

/** What melting this shape back would return. The button prints it. */
export function meltBackValue(type: PartType): number {
  return Math.round(partMelt(type) * MELT_BACK_SHARE * 10) / 10;
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
  /**
   * AND SO DOES ASSEMBLY, over all seven at once — a bigger pool than any one
   * pour, so a coherent set teaches things a single part never could. Run AFTER
   * `state.casting.tool` is seated, because the class gate reads the built tool
   * and a class-locked modifier should be learnable by the set that earned it.
   */
  const learned = forgeDiscover(
    state, ctx, parts.map((p) => p.materialId),
    `a tool of ${new Set(parts.map((p) => p.materialId)).size === 1
      ? materialDef(parts[0]!.materialId).name
      : 'seven parts'}`,
  );
  ctx.dirty();
  return {
    ok: true,
    data: {
      coherence: tool.coherence.factor, returned: returned.length,
      learned: learned.map((m) => m.id),
    },
  };
}

/** Take the tool apart. Its parts go back on the rack; you keep every one. */
export function breakDownTool(state: GameState, ctx: EngineCtx): ActionResult {
  if (state.casting.tool.length === 0) return { ok: false, reason: 'You have not built one' };
  for (const p of state.casting.tool) state.casting.rack.push(p);
  state.casting.tool = [];
  // EVERY PIECE COMES BACK, which the button has always promised — and that has
  // to include the sockets, or taking the tool apart would eat a relic. Called
  // through a wire because `toolSockets` reads `currentTool` from this module.
  emptyTheSockets(state);
  ctx.dirty();
  return { ok: true };
}

/**
 * Sockets are emptied by `toolSockets.emptySockets`, which has to put runes and
 * gems back on their piles. Wired rather than imported for the usual reason.
 */
let emptyTheSockets: (state: GameState) => void = (state) => { state.casting.sockets = []; };
export function wireEmptySockets(fn: typeof emptyTheSockets): void { emptyTheSockets = fn; }
