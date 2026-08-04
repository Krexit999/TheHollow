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
  MOD_BY_ID, MOD_FIRE_WEIGHT, MOD_LEVEL_MAX, MOD_SHELL_ORDINAL, SYNERGIES,
  SYNERGY_BY_ID, TOOL_MODS, matchToolMod, pointedAtBy, modLevelOf, modLevelScale,
  modXpForLevel,
  type ModEffectDef, type SynergyDef, type ToolModDef,
} from '../content/toolMods';
import { overNatural } from '../traits';
import { forgetsOverfill, quenchedSteady } from './quench';
import { alloyHint, dominantTrait } from '../content/drillAlloys';
import { reachedOrdinal } from './drillAlloys';
import { currentTool } from './casting';
import { modSlotsOf } from './toolMining';
import { LINEAR_STATS, STAT_BASE } from '../content/forgeParts';
import { CLASS_BY_ID } from '../content/toolClasses';
import { toolClass } from './toolClass';
import { growthFold, craftFold, type ToolStats } from './forgeParts';
import { consumeMaterial, materialCount } from './forge';

/** One modifier on the tool, and how many times it has been applied. */
export interface ToolModStack {
  id: string;
  n: number;
  /** Work this modifier has done — cells for the tool-facing ones, firings
   *  (weighted) for the ability-facing ones. Levels come out of it. */
  xp?: number;
}

export function levelOfStack(s: ToolModStack): number {
  return modLevelOf(s.xp ?? 0);
}

/** Everything the level readout needs, so the panel computes nothing. */
export function modProgress(s: ToolModStack): {
  level: number; into: number; need: number; frac: number; xp: number; max: boolean;
} {
  const xp = s.xp ?? 0;
  const level = modLevelOf(xp);
  if (level >= MOD_LEVEL_MAX) {
    return { level, into: 0, need: 0, frac: 1, xp, max: true };
  }
  const from = modXpForLevel(level);
  const to = modXpForLevel(level + 1);
  const need = Math.max(1, to - from);
  return { level, xp, into: xp - from, need, frac: Math.max(0, Math.min(1, (xp - from) / need)), max: false };
}

/**
 * RECORD THE WORK. Called from the manual verbs with cells that actually gave
 * something up, and from the firing path with firings.
 *
 * WHICH MODIFIERS COUNT WHICH: an ability-facing modifier learns from FIRINGS,
 * because that is the work it does; everything else learns from cells. A
 * combo learns from both — it is amplifying whatever is happening.
 */
export function gainModXp(
  state: GameState, ctx: EngineCtx | undefined, cells: number, fires = 0,
): void {
  const stacks = state.casting?.mods;
  if (!stacks || stacks.length === 0) return;
  if (cells <= 0 && fires <= 0) return;
  let levelled = false;
  for (const s of stacks) {
    const def = MOD_BY_ID.get(s.id);
    if (!def) continue;
    const gain = def.category === 'ability'
      ? fires * MOD_FIRE_WEIGHT
      : def.category === 'combo'
        ? cells + fires * MOD_FIRE_WEIGHT
        : cells;
    if (gain <= 0) continue;
    const before = modLevelOf(s.xp ?? 0);
    s.xp = (s.xp ?? 0) + gain;
    const after = modLevelOf(s.xp);
    if (after > before && ctx) {
      ctx.emit({ type: 'toolModLevelled', id: def.id, name: def.name, level: after });
      ctx.dirty();
      levelled = true;
    }
  }
  /**
   * A LEVEL-UP CAN WAKE AN ARRANGEMENT, and until this line it did not tell
   * anybody. A synergy wants both parents at a level; if the second parent
   * crosses that level WHILE MINING, the thing wakes with no bench action to
   * hang the announcement on, and the player would find out only the next time
   * they opened a panel. That is the discovery moment of the whole system
   * arriving silently.
   */
  if (levelled) noteSynergies(state, ctx);
}

/**
 * A SYNERGY IS RECORDED THE FIRST TIME IT IS AWAKE. It is not applied and not
 * bought — the player arranged two things they already had and a third thing
 * happened, so the moment worth marking is the moment it first happens.
 *
 * Called wherever the arrangement could have changed: on a level-up, after a
 * modifier is worked in or taken off, after a firing, after a rebuild.
 */
export function noteSynergies(state: GameState, ctx?: EngineCtx): string[] {
  if (!state.casting) return [];
  const known = (state.casting.knownSynergies ??= []);
  const found: string[] = [];
  for (const id of modCache(state, seatedAbilities(state).length).awake) {
    if (known.includes(id)) continue;
    known.push(id);
    found.push(id);
    ctx?.emit({ type: 'synergyAwoke', id, name: SYNERGY_BY_ID.get(id)?.name ?? id });
  }
  if (found.length > 0) ctx?.dirty();
  return found;
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
// ---------------------------------------------------------------------------
// DISCOVERY BY FORGING — the source the tab was missing
// ---------------------------------------------------------------------------
/**
 * WHAT WAS ACTUALLY WRONG, because the mechanism was not missing.
 *
 * `applyToolMod` has always discovered modifiers: feed stone at the bench and
 * what it becomes enters `knownMods`. But that verb needs a BUILT TOOL, and it
 * is a deliberate second trip to a second bench — so a player who had not yet
 * assembled anything saw an empty library and no way in, and one who had was
 * asked to spend materials on a blind mix to find out what a stone was for.
 *
 * So this is a SECOND SOURCE, not a replacement: forging itself teaches. Pour
 * a part, assemble a tool, and the stone you used reveals what it reaches for.
 * The bench still works and still installs.
 *
 * IT MIRRORS THE ABILITY GRAMMAR RATHER THAN INVENTING ONE — the brief asked
 * for that and it is also the only honest option, since abilities already
 * solved this exact problem. `syncToolAbilities` reads the build's materials,
 * matches them against the registry gated by `reachedOrdinal`, records what it
 * found in a codex and emits a found-event. This does the same four things.
 * The depth gate is what makes the tab grow with descent: a Loam player can
 * only ever be taught Loam modifiers, however the stone leans.
 */
export function forgeDiscover(
  state: GameState, ctx: EngineCtx | undefined, materialIds: string[], source: string,
): ToolModDef[] {
  if (!state.casting) return [];
  const mats = materialIds.filter(Boolean);
  if (mats.length === 0) return [];
  const found = pointedAtBy(mats, {
    reached: reachedOrdinal(state),
    classId: toolClass(state).def?.id ?? null,
  });
  const known = (state.casting.knownMods ??= []);
  const from = (state.casting.modFrom ??= {});
  const fresh: ToolModDef[] = [];
  for (const def of found) {
    if (known.includes(def.id)) continue;
    known.push(def.id);
    // WHAT REVEALED IT, kept because "you know this" is a worse answer than
    // "you learned this pouring a graveclay head" — and because it is the only
    // record of the reasoning that got there.
    from[def.id] = source;
    fresh.push(def);
    ctx?.emit({ type: 'toolModFound', id: def.id, name: def.name });
  }
  if (fresh.length > 0) ctx?.dirty();
  return fresh;
}

/** What revealed a modifier, for the library readout. */
export function modRevealedBy(state: GameState, id: string): string | null {
  return state.casting?.modFrom?.[id] ?? null;
}
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
  // OUT OF CLASS beats everything — it is not short of room or of partners,
  // the tool has stopped being the thing this belongs to.
  if (def.classOnly && toolClass(state).def?.id !== def.classOnly) {
    const owner = CLASS_BY_ID.get(def.classOnly);
    return `Asleep — this one is a ${owner?.name ?? def.classOnly} tool's, and yours is not one right now.`;
  }
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
  /** Instability taken back off by stabilisers. Reliability, never power. */
  stabilize: number;
  live: string[];
  dormant: string[];
  /** Synergies currently awake on this tool. */
  awake: string[];
}

export const NO_MODS: ModCache = {
  cells: 0, splash: 0, oreRate: 1, dropWeight: 1, uses: 1, xpRate: 1,
  repairPerSec: 0, abilitySlots: 0, chargePerSwing: 0, abilityGrade: 0,
  paramAdd: {}, paramMult: {}, oreReach: false, refire: 0, repairOnFire: 0,
  chargeOnFire: 0, amplify: 1, stabilize: 0, live: [], dormant: [], awake: [],
};

/**
 * WHICH SYNERGIES ARE AWAKE. Both parents present, both at the level it wants,
 * and neither of them asleep for room or requirements — an overflowed modifier
 * is not on the tool in any sense that should wake something else.
 */
export function awakeSynergies(state: GameState, liveIds: Set<string>): SynergyDef[] {
  const stacks = modStacks(state);
  const at = (id: string): number => {
    const s = stacks.find((m) => m.id === id);
    return s && liveIds.has(id) ? levelOfStack(s) : 0;
  };
  return SYNERGIES.filter((s) =>
    at(s.from[0]) >= s.minLevel && at(s.from[1]) >= s.minLevel);
}

/**
 * THE DIRECTION, for a player carrying HALF of something.
 *
 * Shows only for synergies where exactly one parent is on the tool, and says
 * nothing about the other parent or the result — it describes what the half
 * they are holding is reaching for. That is the whole of the pillar-5 contract
 * here: the tool tells you there is something to find, never what.
 */
export function synergyHints(state: GameState): string[] {
  const stacks = modStacks(state);
  const have = new Set(stacks.map((m) => m.id));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of SYNERGIES) {
    const a = have.has(s.from[0]);
    const b = have.has(s.from[1]);
    if (a === b) continue; // neither (nothing to hint) or both (it has woken)
    if (seen.has(s.hint)) continue;
    seen.add(s.hint);
    out.push(s.hint);
  }
  return out;
}

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
    ...NO_MODS, paramAdd: {}, paramMult: {}, live: [], dormant: [], awake: [],
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
  /**
   * A CLASS-LOCKED MODIFIER SLEEPS IF THE TOOL STOPS BEING THAT CLASS.
   *
   * Same treatment overflow gets, for the same reason: rebuild the Head in
   * different stone, tip out of Siege, and the Siege Weight you worked in is
   * still yours — it is simply not doing anything until the tool is a Siege
   * again. Deleting it would throw away materials the player spent on a
   * consequence of a decision they are allowed to reverse.
   */
  const classId = toolClass(state).def?.id ?? null;
  for (const s of stacks) {
    const def = MOD_BY_ID.get(s.id);
    if (!def || s.n <= 0) continue;
    if (def.classOnly && def.classOnly !== classId) { overflow.add(s.id); continue; }
    const cost = def.cost * s.n;
    if (spent + cost > room) overflow.add(s.id);
    else spent += cost;
  }

  // ── PASS 1: who is awake, and what is the amplifier ──────────────────
  const awake: Array<{ def: ToolModDef; n: number; level: number }> = [];
  for (const s of stacks) {
    const def = MOD_BY_ID.get(s.id);
    if (!def || s.n <= 0) continue;
    if (overflow.has(s.id)) { out.dormant.push(s.id); continue; }
    if (modLive(state, def, abilities)) {
      awake.push({ def, n: s.n, level: levelOfStack(s) });
      out.live.push(s.id);
      if (def.fx.amplify) out.amplify *= Math.pow(def.fx.amplify, s.n);
    } else {
      out.dormant.push(s.id);
    }
  }

  // ── PASS 2: fold, amplifying everything that is not itself a combo ───
  // A combo amplifies OTHER modifiers, never combos (including itself), so two
  // of them cannot multiply each other into a runaway.
  //
  // THE LEVEL SCALES THE CONTRIBUTION and nothing else. It multiplies the
  // vector the modifier already had; it cannot give it an axis it did not
  // declare, which is why levelling needed no separate pillar-2 argument.
  for (const { def, n, level } of awake) {
    const k = (def.category === 'combo' ? 1 : out.amplify) * modLevelScale(level);
    add(out, def.fx, n, k);
  }

  // ── PASS 3: what the arrangement turned out to be ────────────────────
  // A synergy costs no slots and is never applied — it is a property of what
  // is already on the tool. It folds at full weight, unamplified, for the same
  // reason a combo is: it is itself the multiplier-shaped thing.
  const liveSet = new Set(out.live);
  for (const syn of awakeSynergies(state, liveSet)) {
    out.awake.push(syn.id);
    if (syn.fx.amplify) out.amplify *= syn.fx.amplify;
    add(out, syn.fx, 1, 1);
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
  if (fx.stabilize) out.stabilize += fx.stabilize * n * k;
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
    classId: toolClass(state).def?.id ?? null,
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
// INSTABILITY — the counterweight
// ---------------------------------------------------------------------------

/**
 * WHY THIS EXISTS. Without it the answer to "how OP can I make this" is "put
 * everything on", which is a shopping list rather than a build. Instability
 * makes the powerful things COST something other than slots, and makes the
 * boring stabilising ones worth carrying — so a maxed tool is engineered
 * around a constraint instead of piled up against none.
 *
 * WHAT IT CANNOT DO, and both are load-bearing:
 *
 *  PILLAR 1 — it never touches the swing. An unstable tool mines exactly as a
 *  stable one does; only its ABILITIES misfire, and abilities are pure upside
 *  that bare hands never had. The worst possible instability leaves you with a
 *  tool that mines like a tool and sometimes wastes an explosion.
 *
 *  PILLAR 2 — a misfire only ever REMOVES. It fizzles the firing or throws it
 *  somewhere you did not choose. There is no misfire outcome that pays more
 *  than a clean firing would have, so instability cannot be farmed, and the
 *  ceiling is untouched in either direction.
 */

/** Instability per point of an ability's power tier, per level. */
export const INST_PER_ABILITY = 4;
/** Instability per slot a modifier occupies, per level. */
export const INST_PER_SLOT = 2.2;
/** Instability a woken synergy adds — arrangements are volatile. */
export const INST_PER_SYNERGY = 12;
/**
 * INSTABILITY PER TRAIT PUT INTO A STONE PAST WHAT IT WAS BORN WITH — §14.1's
 * own clause ("cap 4; each trait past the material's natural count adds
 * instability, §11.4"), and the only consequence the Infuser has outside its
 * own panel.
 *
 * Sized against `INST_PER_SYNERGY` deliberately: a stone carrying a fourth
 * trait is roughly as loud as a woken arrangement, so a tool built out of
 * seven infused parts is a real commitment rather than a free upgrade. It is
 * per PART, so infusing the head only is a small risk and infusing everything
 * is the decision §11.4 calls overpaying.
 */
export const INST_PER_OVERFILLED = 9;
/**
 * THE FLOOR IS RELATIVE TO WHAT THE TOOL CAN CARRY — and the fixed 40 it
 * replaces made this whole mechanic unreachable for most of a game.
 *
 * MEASURED before changing anything: a level-40 tool packed with every
 * modifier that fits reads raw 18 against a floor of 40, so its net is ZERO
 * and always was. Instability only ever bit on a 61-slot level-200 tool with
 * ten capstones at level five (raw 332). It was not a stat with no teeth; it
 * was a stat with teeth nobody could reach until the last hour.
 *
 * The reason is structural: `raw` is bounded by the SLOT BUDGET (a dormant
 * modifier contributes nothing, correctly), and the budget grows across the
 * whole game while the floor sat still. So the floor now grows with it. What
 * the mechanic actually wants to say is "you have packed this tool with the
 * strongest things it can hold", and that is a statement about a FRACTION of
 * capacity, not an absolute number — which makes it true at Loam and at Aleph
 * rather than only at the bottom.
 */
export const INST_FLOOR_BASE = 6;
/**
 * PER MODIFIER SLOT THE TOOL HAS — sim-sized at A.68, was 1.6 by hand.
 *
 * `scripts/sim-forge-constants.ts` measured the thing the hand-sized value
 * could not see: instability is really about DENSITY, and at 1.6 the floor did
 * not keep up with what a big tool can hold. Measured `net` per slot:
 *
 *   a CHEAP fill runs   0.8 – 5.4 net/slot
 *   a PACKED fill runs  10.0 – 13.7 net/slot
 *
 * Those separate cleanly, but a floor rising at only 1.6/slot sat under BOTH
 * once the tool got big — so an Aleph tool filled with the CHEAPEST modifiers
 * it could find read 26% misfire, against a packed one at 35%. The mechanic
 * stopped distinguishing "I chased power" from "I filled the slots", which is
 * the only thing it is for.
 *
 * At 5.0 the floor sits above every cheap fill and under every packed one:
 *
 *              cheap        packed
 *   loam L40     0%           10%
 *   verdance     0%           25%
 *   cinder       0%           22%
 *   aleph        1%           35%
 *
 * RAISING THIS IS STRICTLY A BUFF and that is why it was allowed under the
 * no-nerf ruling this pass ran under: `misfire` is
 * `max(0, min(cap, (net - floor) * rate))`, so a higher floor can only ever
 * lower it. No existing build got worse; several got quieter.
 */
export const INST_FLOOR_PER_SLOT = 5.0;

/**
 * POWER COSTS MORE THAN ITS SIZE — the other half of giving this teeth.
 *
 * A 5-slot capstone used to be worth exactly five 1-slot modifiers, so there
 * was no such thing as a volatile CHOICE, only a volatile amount. Weighting by
 * the modifier's own cost again makes a capstone disproportionately unstable:
 * five slots of cheap work is calm, one capstone in the same five slots is not.
 * That is the trade the brief asks for — you want the strong thing, and the
 * strong thing is what shakes.
 */
export const INST_POWER_EXP = 1.6;

/** Kept as the name older readers know; now the BASE of a relative floor. */
export const INST_FLOOR = INST_FLOOR_BASE;
/** Misfire chance per point of instability above the floor. */
export const INST_PER_POINT = 0.0022;
/** However bad it gets, most firings still land. */
export const MISFIRE_CAP = 0.35;

export interface InstabilityRead {
  /** What the tool has accrued, before stabilisers. */
  raw: number;
  /** What the stabilisers take back off. */
  steady: number;
  /** What is left, floored at zero. */
  net: number;
  /** 0..MISFIRE_CAP. */
  misfire: number;
  /** What this tool may carry before anything goes wrong. Scales with slots. */
  floor: number;
  /** Biggest contributors first, for the readout. */
  from: Array<{ label: string; n: number }>;
}

/**
 * WHAT THE TOOL IS CARRYING, PRICED IN RELIABILITY.
 *
 * The tool's own STABILITY stat is in here too, which is what makes the doc's
 * `trueseated` trait ("stability, less penalty from mismatched parts") pay off
 * twice: it already bought coherence at assembly, and now it buys steadiness
 * under load. Read scale-free, like `toughnessIndex`, so the trade is the same
 * trade at every depth rather than evaporating at the second shell.
 */
/**
 * WHAT THIS TOOL MAY CARRY BEFORE IT STARTS SHAKING. Grows with the modifier
 * budget, so "packed with power" means the same thing at every depth.
 */
export function instabilityFloor(state: GameState): number {
  return INST_FLOOR_BASE + INST_FLOOR_PER_SLOT * modSlotsTotal(state);
}

export function instability(state: GameState, abilities: Array<{ power: number; level: number }> = []): InstabilityRead {
  const from: Array<{ label: string; n: number }> = [];
  let raw = 0;

  const cache = modCache(state, abilities.length);
  for (const s of modStacks(state)) {
    const def = MOD_BY_ID.get(s.id);
    if (!def || !cache.live.includes(s.id)) continue;
    // COST^EXP, not cost: a capstone is worth more than its slots.
    const n = Math.pow(def.cost, INST_POWER_EXP) * s.n * INST_PER_SLOT
      * modLevelScale(levelOfStack(s));
    if (n <= 0) continue;
    raw += n;
    from.push({ label: def.name, n });
  }
  for (const a of abilities) {
    // Same shape for what it carries — a power-5 ability is not five power-1s.
    const n = Math.pow(a.power, INST_POWER_EXP) * INST_PER_ABILITY * modLevelScale(a.level);
    raw += n;
    from.push({ label: 'what it carries', n });
  }
  for (const id of cache.awake) {
    raw += INST_PER_SYNERGY;
    from.push({ label: SYNERGY_BY_ID.get(id)?.name ?? id, n: INST_PER_SYNERGY });
  }

  // STABILISERS. Modifier terms plus the tool's own stability shape — and a
  // NEGATIVE stabilize (Overdrive, First Light) adds instability rather than
  // removing it, which is what makes those two a real decision.
  let steady = cache.stabilize;
  const tool = currentTool(state);
  /**
   * WHAT WAS PUT INTO THE STONE (§14.1, §11.4). A part cast from a stone
   * carrying more traits than it was born with shakes — which is the price
   * §14.1 attaches to the Infuser, and the reason a fourth trait is a decision
   * rather than a strictly-better pour. Read off `MATERIAL_TRAITS` through
   * `overNatural`, so no machine is imported to answer it.
   */
  const overfilled = (tool?.parts ?? []).reduce(
    // §19's Hollow row, built at A.94: a part that has been through a tier-III
    // QUENCH TANK forgets what was put into it, so it stops shaking for it.
    // The tank is asked, never imported — `forgetsOverfill` lives with it.
    (n, p) => n + (forgetsOverfill(state, p) ? 0 : overNatural(p.materialId)), 0,
  );
  if (overfilled > 0) {
    const n = overfilled * INST_PER_OVERFILLED;
    raw += n;
    from.push({ label: 'what was put into the stone', n });
  }
  if (tool) {
    steady += steadyOf(tool);
    // SUPPLE living parts and EXCELLENT/TRUEBORN pours steady it too. Both are
    // reliability and neither is in the charge economy — the same reason the
    // stabilise axis was allowed to exist at all.
    steady += growthFold(tool.parts).stabilize + craftFold(tool.parts).stabilize;
    // ...and so is a part that has been through the tank (§13, A.94).
    const dipped = quenchedSteady(state, tool.parts);
    if (dipped > 0) {
      steady += dipped;
      from.push({ label: 'what has been through the tank', n: -dipped });
    }
  }

  const net = Math.max(0, raw - steady);
  // THE FLOOR SCALES WITH THE TOOL. A big tool is allowed to carry more before
  // it starts shaking; what matters is how much of its capacity is spent on
  // power, not the raw total.
  const floor = instabilityFloor(state);
  const misfire = Math.max(0, Math.min(MISFIRE_CAP, (net - floor) * INST_PER_POINT));
  from.sort((a, b) => b.n - a.n);
  return { raw, steady, net, misfire, floor, from: from.slice(0, 6) };
}

/**
 * THE TOOL'S OWN STEADINESS, scale-free.
 *
 * `stability` scales with magnitude like every other stat, so a raw reading
 * would make an Aleph tool unshakeable and a Loam one hopeless regardless of
 * what either was built from — which is not a trade, it is depth again. So it
 * is read as SHAPE: how much of this tool is stability, relative to everything
 * else it is. Same trick and same reason as `toughnessIndex`.
 */
export function steadyOf(tool: ToolStats): number {
  const base = STAT_BASE.stability;
  if (!(base > 0)) return 0;
  let mean = 0;
  for (const s of LINEAR_STATS) mean += tool.stats[s] / STAT_BASE[s];
  mean /= LINEAR_STATS.length;
  if (mean <= 0) return 0;
  const idx = (tool.stats.stability / base) / mean;
  return Math.max(0, Math.min(60, idx * 26));
}

/** The abilities the tool is carrying, in the shape `instability` wants.
 *  Wired, because `toolAbilities` reads this module. */
let seatedAbilities: (state: GameState) => Array<{ power: number; level: number }> = () => [];
export function wireSeatedAbilities(fn: typeof seatedAbilities): void { seatedAbilities = fn; }

/** The whole reading, for the panel and for the firing path. */
export function toolInstability(state: GameState): InstabilityRead {
  return instability(state, seatedAbilities(state));
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
/**
 * HOW LONG THE TOOL HAS TO BE PUT DOWN BEFORE IT STARTS MENDING ITSELF.
 *
 * Reported: "with Unbreaking 5 + auto-regen, tools never break." Measured, a
 * stacked build mended **1.658 wear a second against 0.001 spent** — outpacing
 * hard use by more than a thousand times — so durability had stopped existing.
 *
 * The fix is the modifier's own flavour text, enforced: Self-Mending says "it
 * puts itself right, slowly, WHILE YOU ARE DOING SOMETHING ELSE", and it was
 * doing it mid-swing. Now it means it. Mining hard genuinely wears the tool
 * down; the pool comes back while you are at the Forge, in the Refinery, or
 * away — which is the maintenance rhythm the brief asks for and costs an idle
 * player nothing at all (pillar 1).
 */
export const MEND_IDLE_SEC = 10;

export function tickToolMods(state: GameState, dt: number): void {
  if (!state.casting) return;
  const cache = modCache(state, 0);
  if (state.casting.wear <= 0) return;
  const tool = currentTool(state);
  if (!tool) return;
  // PUT IT DOWN FIRST. An absent stamp reads as "never used", which is correct
  // for a save written before this and for a tool that has not swung yet.
  const since = state.stats.playTimeSec - (state.casting.lastUsedAt ?? -Infinity);
  if (since < MEND_IDLE_SEC) return;
  // A KNITTING living part closes its own wear over, exactly as Self-Mending
  // does — one term, two sources.
  const rate = cache.repairPerSec + growthFold(tool.parts).repairPerSec;
  if (rate <= 0) return;
  const pool = tool.stats.durability;
  state.casting.wear = Math.max(0, state.casting.wear - pool * rate * dt);
}

/** Every modifier the player could be building toward at this depth — used for
 *  the library's "how many of these exist" line, never as a list of recipes. */
export function modsReached(state: GameState): ToolModDef[] {
  const reached = reachedOrdinal(state);
  return TOOL_MODS.filter((m) => MOD_SHELL_ORDINAL[m.shell]! <= reached);
}
