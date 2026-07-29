/**
 * MODIFIERS — the runtime. Library in content/toolMods.ts.
 *
 * This resolves what a stack of modifiers actually DOES, and the whole file is
 * three ideas:
 *
 *  1. TWO PASSES, because combos read the tool. First decide which modifiers
 *     are LIVE (their requirements met by what else is seated), then fold the
 *     live ones together. A combo that is seated and dormant stays visible and
 *     says so — an inert modifier the player cannot see is a slot they have
 *     lost with no explanation.
 *  2. AMPLIFY IS A SECOND FOLD, not a term. `Resonance` multiplies what every
 *     OTHER modifier contributes, so it has to be known before the sum is
 *     taken. Additive axes scale directly; multiplicative axes scale the part
 *     ABOVE one, so an amplified 1.4x is 1.6x rather than 1.96x — the bonus
 *     grows, not the baseline.
 *  3. NOTHING HERE CAN TOUCH YIELD, and it is the type that says so rather
 *     than this comment. `ModEffectDef` has no field for dust-per-charge; the
 *     axes are reach, splash, ore speed, drops, durability, xp and ability
 *     behaviour. Reach is clamped to the 3x3 by `effectOf` and share is clamped
 *     to 1 by `abilityParams` and again by `harvestCell`, so even a nonsense
 *     stack resolves to "takes all of the cells it reaches", which is the
 *     ceiling and always was.
 *
 * SLOTS. The doc gives modifier slots to the Binding stone; levels add one per
 * five. Modifier slots and ABILITY slots are separate pools drawn from the same
 * two sources — abilities get a smaller derived count (`toolAbilitySlots`) and
 * modifiers get the full `modSlotsOf().total`. Note there is deliberately NO
 * modifier that grants modifier slots: a slot-granting modifier that costs
 * slots is either useless (grants what it costs) or an unbounded loop (grants
 * more). `Second Seat` grants ABILITY slots for MODIFIER slots instead, which
 * is a trade between two pools and cannot feed itself.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import {
  MOD_BY_ID, MOD_SHELL_ORDINAL, TOOL_MODS, matchToolMod,
  type ModEffectDef, type ToolModDef,
} from '../content/toolMods';
import { alloyHint, dominantTrait } from '../content/drillAlloys';
import { reachedOrdinal } from './drillAlloys';
import { currentTool } from './casting';
import { modSlotsOf } from './toolMining';
import { consumeMaterial, materialCount } from './forge';

/** One modifier on the tool, and how many times it has been applied. */
export interface ToolModStack {
  id: string;
  n: number;
}

/** How many distinct materials one application may be fed. Same as a pour. */
export const MOD_FEED_MAX = 3;

// ---------------------------------------------------------------------------
// Reading the stack
// ---------------------------------------------------------------------------

export function modStacks(state: GameState): ToolModStack[] {
  return state.casting?.mods ?? [];
}

export function stackOf(state: GameState, id: string): number {
  return modStacks(state).find((m) => m.id === id)?.n ?? 0;
}

/** Slots this tool has for modifiers — the Binding stone plus the levels. */
export function modSlotsTotal(state: GameState): number {
  const tool = currentTool(state);
  if (!tool) return 0;
  return modSlotsOf(state, tool).total;
}

export function modSlotsUsed(state: GameState): number {
  let n = 0;
  for (const s of modStacks(state)) n += (MOD_BY_ID.get(s.id)?.cost ?? 0) * s.n;
  return n;
}

export function modSlotsFree(state: GameState): number {
  return Math.max(0, modSlotsTotal(state) - modSlotsUsed(state));
}

/** Everything the player has ever made, whether or not it is on the tool. */
export function knownMods(state: GameState): ToolModDef[] {
  const known = state.casting?.knownMods ?? [];
  return TOOL_MODS.filter((m) => known.includes(m.id));
}

// ---------------------------------------------------------------------------
// Which ones are awake
// ---------------------------------------------------------------------------

/**
 * IS THIS ONE DOING ANYTHING? Requirements read PRESENCE of other modifiers
 * rather than their liveness, deliberately: two combos that each require the
 * other would otherwise both be dormant forever, and the player would have no
 * way to see why. Presence is decidable in one pass and reads the way a player
 * would describe it.
 */
export function modLive(state: GameState, def: ToolModDef, abilities: number): boolean {
  const r = def.requires;
  if (!r) return true;
  if (r.mods) {
    for (const id of r.mods) if (stackOf(state, id) <= 0) return false;
  }
  if (r.others !== undefined) {
    const others = modStacks(state).filter((m) => m.id !== def.id).length;
    if (others < r.others) return false;
  }
  if (r.abilities !== undefined && abilities < r.abilities) return false;
  return true;
}

/** Plain English for why a seated modifier is asleep. Never a locked list —
 *  it names things the player already has or already knows about. */
export function whyDormant(state: GameState, def: ToolModDef, abilities: number): string | null {
  // OVER BUDGET beats every other reason — a modifier with nowhere to sit is
  // not waiting for a partner, it is waiting for room.
  if (modCache(state, abilities).dormant.includes(def.id) && modLive(state, def, abilities)) {
    return `Asleep — no room for it on this tool (${modSlotsUsed(state)}/${modSlotsTotal(state)} slots). Re-seat a better Binding, or take something off.`;
  }
  const r = def.requires;
  if (!r || modLive(state, def, abilities)) return null;
  const want: string[] = [];
  for (const id of r.mods ?? []) {
    if (stackOf(state, id) <= 0) want.push(MOD_BY_ID.get(id)?.name ?? id);
  }
  const others = modStacks(state).filter((m) => m.id !== def.id).length;
  if (r.others !== undefined && others < r.others) {
    want.push(`${r.others - others} more modifier${r.others - others === 1 ? '' : 's'} of any kind`);
  }
  if (r.abilities !== undefined && abilities < r.abilities) {
    want.push(`${r.abilities - abilities} more seated abilit${r.abilities - abilities === 1 ? 'y' : 'ies'}`);
  }
  return want.length > 0 ? `Asleep — wants ${want.join(', ')}.` : 'Asleep.';
}

// ---------------------------------------------------------------------------
// The fold
// ---------------------------------------------------------------------------

export interface ModCache {
  cells: number;
  splash: number;
  oreRate: number;
  dropWeight: number;
  uses: number;
  xpRate: number;
  repairPerSec: number;
  abilitySlots: number;
  chargePerSwing: number;
  abilityGrade: number;
  paramAdd: Record<string, number>;
  paramMult: Record<string, number>;
  oreReach: boolean;
  refire: number;
  repairOnFire: number;
  chargeOnFire: number;
  /** What Resonance and friends are multiplying everything else by. */
  amplify: number;
  live: string[];
  dormant: string[];
}

export const NO_MODS: ModCache = {
  cells: 0, splash: 0, oreRate: 1, dropWeight: 1, uses: 1, xpRate: 1,
  repairPerSec: 0, abilitySlots: 0, chargePerSwing: 0, abilityGrade: 0,
  paramAdd: {}, paramMult: {}, oreReach: false, refire: 0, repairOnFire: 0,
  chargeOnFire: 0, amplify: 1, live: [], dormant: [],
};

/**
 * FOLD THE STACK. Pure — reads state, writes nothing.
 *
 * `abilities` is passed in rather than read, because `toolAbilities` reads THIS
 * for its slot count and the two would otherwise chase each other. The caller
 * passes the count from the tool's PARTS and levels; a combo requiring "two
 * seated abilities" therefore counts seats that exist without the modifier's
 * own contribution, which is the conservative reading and cannot bootstrap.
 */
export function modCache(state: GameState, abilities = 0): ModCache {
  const stacks = modStacks(state);
  if (stacks.length === 0 || !state.casting) return NO_MODS;

  const out: ModCache = {
    ...NO_MODS, paramAdd: {}, paramMult: {}, live: [], dormant: [],
  };

  /**
   * PASS 0 — WHAT THE TOOL CAN STILL CARRY.
   *
   * `applyToolMod` refuses anything that will not fit, so a stack cannot GROW
   * past the budget. It can still END UP past it: rebuild the tool with a
   * weaker Binding stone and the slots shrink under a stack that was legal
   * yesterday. Found in a driven screenshot reading "10/9 slots" with every
   * modifier cheerfully applied.
   *
   * Overflow goes DORMANT rather than being deleted — the same treatment a
   * combo waiting on its partner gets, and for the same reason: silently
   * throwing away materials the player spent would be much worse than telling
   * them their new Binding cannot hold what the old one did. Re-seat a better
   * Binding and everything wakes up again exactly as it was.
   *
   * Walked in seating order so the answer is stable, and so what falls off is
   * the most recent thing rather than an arbitrary one.
   */
  const room = modSlotsTotal(state);
  const overflow = new Set<string>();
  let spent = 0;
  for (const s of stacks) {
    const def = MOD_BY_ID.get(s.id);
    if (!def || s.n <= 0) continue;
    const cost = def.cost * s.n;
    if (spent + cost > room) overflow.add(s.id);
    else spent += cost;
  }

  // ── PASS 1: who is awake, and what is the amplifier ──────────────────
  const awake: Array<{ def: ToolModDef; n: number }> = [];
  for (const s of stacks) {
    const def = MOD_BY_ID.get(s.id);
    if (!def || s.n <= 0) continue;
    if (overflow.has(s.id)) { out.dormant.push(s.id); continue; }
    if (modLive(state, def, abilities)) {
      awake.push({ def, n: s.n });
      out.live.push(s.id);
      if (def.fx.amplify) out.amplify *= Math.pow(def.fx.amplify, s.n);
    } else {
      out.dormant.push(s.id);
    }
  }

  // ── PASS 2: fold, amplifying everything that is not itself a combo ───
  // A combo amplifies OTHER modifiers, never combos (including itself), so two
  // of them cannot multiply each other into a runaway.
  for (const { def, n } of awake) {
    const k = def.category === 'combo' ? 1 : out.amplify;
    add(out, def.fx, n, k);
  }
  return out;
}

function add(out: ModCache, fx: ModEffectDef, n: number, k: number): void {
  if (fx.cells) out.cells += fx.cells * n * k;
  if (fx.splash) out.splash += fx.splash * n * k;
  if (fx.repairPerSec) out.repairPerSec += fx.repairPerSec * n * k;
  if (fx.abilitySlots) out.abilitySlots += fx.abilitySlots * n * k;
  if (fx.chargePerSwing) out.chargePerSwing += fx.chargePerSwing * n * k;
  if (fx.abilityGrade) out.abilityGrade += fx.abilityGrade * n * k;
  if (fx.refire) out.refire += fx.refire * n * k;
  if (fx.repairOnFire) out.repairOnFire += fx.repairOnFire * n * k;
  if (fx.chargeOnFire) out.chargeOnFire += fx.chargeOnFire * n * k;
  if (fx.oreReach) out.oreReach = true;

  // MULTIPLICATIVE AXES AMPLIFY THE BONUS, NOT THE BASELINE. An amplified 1.4x
  // is 1.6x, not 1.96x — otherwise Resonance would be worth vastly more on a
  // tool carrying many small multipliers than the wording suggests.
  for (const key of ['oreRate', 'dropWeight', 'uses', 'xpRate'] as const) {
    const v = fx[key];
    if (v === undefined) continue;
    out[key] *= Math.pow(1 + (v - 1) * k, n);
  }
  for (const [key, v] of Object.entries(fx.paramAdd ?? {})) {
    out.paramAdd[key] = (out.paramAdd[key] ?? 0) + v * n * k;
  }
  for (const [key, v] of Object.entries(fx.paramMult ?? {})) {
    out.paramMult[key] = (out.paramMult[key] ?? 1) * Math.pow(1 + (v - 1) * k, n);
  }
}

/** Apply the stack's ability terms to one ability's resolved params. */
export function tuneParams(
  cache: ModCache, p: Record<string, number>,
): Record<string, number> {
  if (cache.live.length === 0) return p;
  const out = { ...p };
  for (const [key, v] of Object.entries(cache.paramAdd)) {
    // ONLY A PARAM THE ABILITY ACTUALLY HAS. `Long Chain` bumps hops, n, len
    // and cap because different travelling shapes name the same idea
    // differently — it must not invent a `cap` on a blast that has none, or
    // the generator would read a parameter its shape never declared.
    if (out[key] === undefined) continue;
    out[key] = out[key]! + v;
  }
  for (const [key, v] of Object.entries(cache.paramMult)) {
    if (out[key] === undefined) continue;
    out[key] = out[key]! * v;
  }
  // THE SAME CLAMPS THE DATA LAYER ALREADY ENFORCES, re-applied because a
  // modifier can push a param past what a grade could. `share` at 1 is a whole
  // cell, which is the most there has ever been.
  if (out['share'] !== undefined) out['share'] = Math.min(1, out['share']);
  if (out['keep'] !== undefined) out['keep'] = Math.min(0.93, out['keep']);
  if (out['chance'] !== undefined) out['chance'] = Math.min(0.85, out['chance']);
  if (out['under'] !== undefined) out['under'] = Math.min(0.9, out['under']);
  return out;
}

// ---------------------------------------------------------------------------
// The verb
// ---------------------------------------------------------------------------

/**
 * APPLY ONE. Materials are consumed on a MISS as well, which is the crucible's
 * established bargain and the reason experimenting is a decision rather than a
 * free scan — and a miss names what the mix leaned toward, so nothing is
 * learned from nothing.
 *
 * The slot check happens BEFORE the spend. Being told the tool has no room
 * after paying for the modifier is the wrong order to find out in, and the
 * alloy bench already learned that.
 */
export function applyToolMod(
  state: GameState, ctx: EngineCtx, materialIds: string[], prefer?: string | null,
): ActionResult {
  const tool = currentTool(state);
  if (!tool) return { ok: false, reason: 'You are not carrying one' };
  const picked = materialIds.filter(Boolean);
  if (picked.length === 0) return { ok: false, reason: 'Nothing to work in' };
  if (picked.length > MOD_FEED_MAX) return { ok: false, reason: 'Too much at once' };

  const match = matchToolMod(picked, {
    reached: reachedOrdinal(state),
    prefer: prefer && (state.casting.knownMods ?? []).includes(prefer) ? prefer : null,
  });

  // ROOM, CHECKED FIRST — but only for something already KNOWN. Refusing an
  // unknown mix on slot grounds would leak what it was going to be, which is
  // the free scanner the whole withholding exists to prevent.
  if (match && (state.casting.knownMods ?? []).includes(match.id)) {
    const have = stackOf(state, match.id);
    if (have >= match.maxStacks) {
      return { ok: false, reason: `${match.name} is already as deep as it goes on this tool` };
    }
    if (match.cost > modSlotsFree(state)) {
      return {
        ok: false,
        reason: `No room — ${modSlotsUsed(state)}/${modSlotsTotal(state)} slots used and ${match.name} wants ${match.cost}. Strip something, build a better Binding, or put more swings in.`,
      };
    }
  }

  const units = match ? match.units : 2;
  for (const id of picked) {
    if (materialCount(state, id) < units) {
      return { ok: false, reason: 'Not enough of that in the hold for this' };
    }
  }
  for (const id of picked) consumeMaterial(state, id, units);

  if (!match) {
    const dom = dominantTrait(picked);
    ctx.dirty();
    return {
      ok: true,
      data: {
        mod: null,
        reason: dom
          ? `It took nothing. The mix leaned ${dom}, and not far enough to become anything.`
          : 'It took nothing. Nothing in that was reaching for anything.',
      },
    };
  }

  const known = (state.casting.knownMods ??= []).includes(match.id);
  if (!known) {
    state.casting.knownMods.push(match.id);
    ctx.emit({ type: 'toolModFound', id: match.id, name: match.name });
  }

  // A NEWLY DISCOVERED MODIFIER THAT WILL NOT FIT IS STILL DISCOVERED. You made
  // the thing and the library records it; it simply does not go on the tool.
  const have = stackOf(state, match.id);
  if (have >= match.maxStacks || match.cost > modSlotsFree(state)) {
    ctx.dirty();
    return {
      ok: true,
      data: {
        mod: match.id, known, seated: false,
        reason: have >= match.maxStacks
          ? `${match.name} — already as deep as it goes on this tool.`
          : `${match.name} — no room for it yet (${modSlotsUsed(state)}/${modSlotsTotal(state)} used, it wants ${match.cost}).`,
      },
    };
  }

  const stacks = (state.casting.mods ??= []);
  const at = stacks.find((m) => m.id === match.id);
  if (at) at.n += 1;
  else stacks.push({ id: match.id, n: 1 });

  ctx.emit({ type: 'toolModApplied', id: match.id, name: match.name, stacks: stackOf(state, match.id) });
  ctx.dirty();
  return { ok: true, data: { mod: match.id, known, seated: true, stacks: stackOf(state, match.id) } };
}

/** Take one back off. FREE, and it returns the slots — stopping doing a thing
 *  should never be a purchase. The materials are gone; the room is not. */
export function stripToolMod(state: GameState, ctx: EngineCtx, id: string): ActionResult {
  const stacks = modStacks(state);
  const at = stacks.findIndex((m) => m.id === id);
  if (at < 0) return { ok: false, reason: 'Not on the tool' };
  const s = stacks[at]!;
  if (s.n > 1) s.n -= 1;
  else stacks.splice(at, 1);
  ctx.dirty();
  return { ok: true, data: { id, stacks: stackOf(state, id) } };
}

/** What the bench says about a mix before you commit — the LEAN, never the
 *  modifier. Same grammar and the same wording the alloy bench uses. */
export function modHint(materialIds: string[]): string | null {
  return alloyHint(materialIds.filter(Boolean));
}

// ---------------------------------------------------------------------------
// The unattended half
// ---------------------------------------------------------------------------

/**
 * SELF-MENDING, on the second beat. It reads the wear pool directly rather than
 * going through `repairTool`, because that verb costs materials and names a
 * part — this is the tool quietly getting better while you are elsewhere, which
 * is the whole of what the modifier promises.
 */
export function tickToolMods(state: GameState, dt: number): void {
  if (!state.casting) return;
  const cache = modCache(state, 0);
  if (cache.repairPerSec <= 0) return;
  if (state.casting.wear <= 0) return;
  const tool = currentTool(state);
  if (!tool) return;
  const pool = tool.stats.durability;
  state.casting.wear = Math.max(0, state.casting.wear - pool * cache.repairPerSec * dt);
}

/** Every modifier the player could be building toward at this depth — used for
 *  the library's "how many of these exist" line, never as a list of recipes. */
export function modsReached(state: GameState): ToolModDef[] {
  const reached = reachedOrdinal(state);
  return TOOL_MODS.filter((m) => MOD_SHELL_ORDINAL[m.shell]! <= reached);
}
