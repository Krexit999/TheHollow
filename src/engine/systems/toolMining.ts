/**
 * THE NEW FORGE — STEP 3: the tool meets the rock, and wears out doing it.
 *
 * Steps 1 and 2 built a tool and never asked it to do anything. This is where
 * it becomes what the doc says it is: "the manual mining tool — what the player
 * clicks the grid with."
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THE TOOL CHANGES, AND WHY IT IS REACH RATHER THAN YIELD.
 *
 * A manual chip ALREADY takes a cell's entire charge above the regen floor
 * (`harvestCell` with fraction 1). So there is no room above bare hands on one
 * cell — a bigger BITE cannot take charge that is not there, and any stat that
 * multiplied DUST per charge would be a pillar-2 violation wearing a costume.
 *
 * So the tool buys REACH, exactly as the drill abilities do (A.57):
 *
 *   CADENCE  → how many cells one swing touches. Bare hands: one.
 *   BITE     → how much of each EXTRA cell that swing takes, 0..1.
 *   ORESPEED → how fast the hold-gesture works a pocket.
 *   CONTROL  → what the rock gives up besides charge (drop weight). Bounded,
 *              and deliberately the only stat outside the charge economy.
 *
 * Every cell a tool touches is harvested through `harvestCell`, the same funnel
 * the drills and the abilities use, so `take = min(share, available)` and the
 * ceiling stays W x H x regen x Y. A better tool CLEARS THE FACE FASTER; it
 * cannot make the face hold more. `scripts/sim-tool-ceiling.ts` measures it
 * rather than arguing it.
 *
 * PILLAR 1: bare hands are unchanged. Not nerfed, not gated, not worse than
 * they were before this file existed — `toolEffect` on a player with no tool
 * returns exactly the old behaviour (one cell, full take, ore work at 1x). The
 * tool is a strict addition to ACTIVE play and the idle layer never reads it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SCALE. Tool stats span 46,656x across the seven shells (ruling 1), so nothing
 * here consumes them raw. Each effect reads a TIER — how many shell steps above
 * a bare Loam tool this one is — and the tiers are what the effects are built
 * on. Every reference constant below was MEASURED off full common-material
 * tools, one per shell, not chosen (`scripts/tool-effect-preview.ts` prints the
 * ladder).
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import {
  LINEAR_STATS, SHELL_STEP, STAT_BASE, type ToolStat,
} from '../content/forgeParts';
import { derivePart, shapeOf, intensityOf, partTraits, type ToolStats } from './forgeParts';
import { materialDef } from '../materials';
import { currentTool } from './casting';
import { consumeMaterial, equippedTool, materialCount } from './forge';
import { maxToolTier } from '../shells';
import type { PartType } from '../content/forgeParts';

// ---------------------------------------------------------------------------
// Reference points — measured, not chosen
// ---------------------------------------------------------------------------

/**
 * A FULL TOOL OF LOAM COMMON STOCK, per stat. `scripts/_tmp-refs` measured
 * bite 6.6, cadence 18.7, oreSpeed 9.4, control 4.8 on an all-marl set at
 * purity 60; these are those numbers rounded down, so a starter tool sits at
 * tier ~0 and every shell above it steps by one.
 */
export const REF: Record<'bite' | 'cadence' | 'oreSpeed' | 'control', number> = {
  bite: 6, cadence: 15, oreSpeed: 9, control: 4.5,
};

/** How many shell steps above a Loam tool this stat is. 0..~6. */
export function tierOf(value: number, ref: number): number {
  if (!(value > 0)) return 0;
  return Math.max(0, Math.log(value / ref) / Math.log(SHELL_STEP));
}

/** The most extra cells a swing can ever touch — a 3x3 around the target. */
export const MAX_EXTRA_CELLS = 8;

/** How much of each EXTRA cell a swing takes. The target always gives all. */
export const SPLASH_FLOOR = 0.20;
export const SPLASH_PER_TIER = 0.13;

/** Pocket work rate, and its ceiling. A pocket must stay a decision. */
export const ORE_PER_TIER = 0.9;
export const ORE_RATE_CAP = 12;

/** Drop lean from CONTROL. Narrow: it is outside the charge economy, and that
 *  is precisely why it does not get to be generous. */
export const DROP_PER_TIER = 0.12;
export const DROP_CAP = 1.5;

/**
 * A BROKEN TOOL STILL WORKS — the doc is explicit, and it is the whole point of
 * "you never lose it". It keeps a QUARTER of what it does, which is heavily
 * penalised and still strictly better than the hands it is held in. It is never
 * WORSE than bare hands, because a maintenance mechanic that makes you want to
 * put the tool down is a trap rather than a cost.
 */
export const BROKEN_SHARE = 0.25;

// ---------------------------------------------------------------------------
// The effect
// ---------------------------------------------------------------------------

export interface ToolEffect {
  /** Cells one swing touches, target included. Bare hands: 1. */
  cells: number;
  /** Fraction of each EXTRA cell taken. The target is always taken in full. */
  splash: number;
  /** Multiplier on hold-gesture pocket work. Bare hands: 1. */
  oreRate: number;
  /** Multiplier on drop weight. Bare hands: 1. */
  dropWeight: number;
  /** True when the tool is at the floor of its pool. */
  broken: boolean;
  /** False when the player has no tool at all — bare hands. */
  hasTool: boolean;
}

export const BARE_HANDS: ToolEffect = {
  cells: 1, splash: 0, oreRate: 1, dropWeight: 1, broken: false, hasTool: false,
};

/** What the carried tool does to a swing. Pure — no state is written. */
export function effectOf(tool: ToolStats | null, broken: boolean): ToolEffect {
  if (!tool) return BARE_HANDS;
  const extra = Math.min(
    MAX_EXTRA_CELLS,
    Math.max(1, Math.round(tierOf(tool.stats.cadence, REF.cadence)) + 1),
  );
  const splash = Math.min(1, SPLASH_FLOOR + SPLASH_PER_TIER * tierOf(tool.stats.bite, REF.bite));
  const oreRate = Math.min(ORE_RATE_CAP, 1 + ORE_PER_TIER * tierOf(tool.stats.oreSpeed, REF.oreSpeed));
  const dropWeight = Math.min(DROP_CAP, 1 + DROP_PER_TIER * tierOf(tool.stats.control, REF.control));

  // Broken keeps a quarter of everything the tool adds OVER bare hands, so the
  // floor is the hands and never below them.
  const k = broken ? BROKEN_SHARE : 1;
  return {
    cells: 1 + Math.max(broken ? 0 : 1, Math.round(extra * k)),
    splash: splash * k,
    oreRate: 1 + (oreRate - 1) * k,
    dropWeight: 1 + (dropWeight - 1) * k,
    broken,
    hasTool: true,
  };
}

/** What the player is holding, right now. The one entry point mining uses. */
export function toolEffect(state: GameState): ToolEffect {
  const tool = currentTool(state);
  if (!tool) return BARE_HANDS;
  return effectOf(tool, isBroken(state, tool));
}

// ---------------------------------------------------------------------------
// DURABILITY
// ---------------------------------------------------------------------------

/**
 * HOW MANY SWINGS A TOOL HAS IN IT, and why the answer is not "more, deeper".
 *
 * DURABILITY and RESILIENCE both scale with magnitude, so a raw pool would give
 * an Aleph tool 46,656x the swings of a Loam one — which is not a maintenance
 * mechanic, it is the absence of one. Uses are therefore SCALE-FREE and decided
 * by SHAPE: how much of this tool is durability and resilience, relative to
 * everything else it is. Same trick as step 2's stability index, for the same
 * reason.
 *
 * That makes durability a question about the BUILD rather than about depth,
 * which is what the doc's tradeoff needs — "a brittle edge needs re-casting
 * often" has to stay true at every depth or it stops being a tradeoff at the
 * second shell.
 *
 * MEASURED SPREAD across real materials: 0.71 (a brittle/light Glassmere set)
 * to 1.49 (a dense/tough Loam one) — so about a 3x range around the base.
 *
 * THE BASE WAS TEN TIMES TOO LOW. At 300 a brittle tool was through in about
 * 200 swings, which at any real click rate is minutes — maintenance you are
 * doing INSTEAD of playing rather than occasionally between stretches of it.
 * 3000 puts a brittle tool at roughly 2,000 swings and a tough one at 5,500,
 * so re-seating is something you notice a few times a session.
 *
 * ONLY THE MAGNITUDE MOVED. The shape index, the 1.5 exponent and the clamps
 * are untouched, so the brittle-against-tough ratio is exactly what it was —
 * the tradeoff is the same tradeoff, spread over a sensible stretch of play.
 */
export const BASE_USES = 3000;
export const USES_MIN = 0.35;
export const USES_MAX = 3;

export function toughnessIndex(tool: ToolStats): number {
  const norm = (s: ToolStat): number => tool.stats[s] / STAT_BASE[s];
  let mean = 0;
  for (const s of LINEAR_STATS) mean += norm(s);
  mean /= LINEAR_STATS.length;
  if (mean <= 0) return 1;
  return (norm('durability') + norm('resilience')) / (2 * mean);
}

/** Swings this tool has before it is at the floor. */
export function usesOf(tool: ToolStats): number {
  const idx = toughnessIndex(tool);
  const scale = Math.max(USES_MIN, Math.min(USES_MAX, Math.pow(idx, 1.5)));
  return Math.max(1, Math.round(BASE_USES * scale));
}

/** The size of the pool, in the units `state.casting.wear` counts. */
export function poolOf(tool: ToolStats): number {
  return tool.stats.durability;
}

export function wearPerUse(tool: ToolStats): number {
  return poolOf(tool) / usesOf(tool);
}

export function isBroken(state: GameState, tool: ToolStats): boolean {
  return state.casting.wear >= poolOf(tool);
}

/** 0 (fresh) .. 1 (broken). What the durability bar draws. */
export function wear01(state: GameState, tool: ToolStats): number {
  const pool = poolOf(tool);
  return pool <= 0 ? 1 : Math.max(0, Math.min(1, state.casting.wear / pool));
}

export function usesLeft(state: GameState, tool: ToolStats): number {
  const per = wearPerUse(tool);
  return per <= 0 ? 0 : Math.max(0, Math.floor((poolOf(tool) - state.casting.wear) / per));
}

/**
 * WHICH PART IS GIVING. The doc's shared-pool lean (open question 2) says "the
 * worn part is what you re-cast", so the pool is one number and this names the
 * weak link: the part whose MATERIAL is least resilient for its character.
 *
 * Read off `shapeOf` — the pure trait term — rather than the part's finished
 * resilience, because part ROLES differ (the Handle owns resilience, the
 * Sockets barely touch it) and comparing finished numbers would always name
 * the Sockets whatever it was made of. This names the brittle stone, which is
 * the thing the player can actually act on.
 */
export function wornPart(tool: ToolStats): PartType | null {
  let worst: PartType | null = null;
  let worstShape = Infinity;
  let worstBack = -1;
  for (const p of tool.parts) {
    const m = materialDef(p.materialId);
    const shape = shapeOf(partTraits(m), 'resilience', intensityOf(p.purity));
    const back = repairShare(tool, p.type);
    // TIES GO TO THE BIGGEST REPAIR. A tool cast entirely from one stone has no
    // single brittle part — every shape is identical — and the first-wins
    // tie-break named the HEAD every time, which is both arbitrary and the
    // worst advice available: re-seating the head gives back a fraction of what
    // re-seating the Core does. On a mixed tool the brittle stone still wins
    // outright, which is the case this readout exists for.
    const better = shape < worstShape - 1e-9
      || (Math.abs(shape - worstShape) <= 1e-9 && back > worstBack);
    if (better) { worstShape = shape; worstBack = back; worst = p.type; }
  }
  return worst;
}

/**
 * WHAT REPAIRING ONE PART GIVES BACK — its share of the pool it holds up. The
 * Core is most of a tool's durability, so re-seating the Core clears most of
 * the wear and re-seating the Grip clears very little. That is the doc's "the
 * tank of the tool" as a number, and it means a cheap repair is a small repair.
 */
export function repairShare(tool: ToolStats, type: PartType): number {
  const part = tool.parts.find((p) => p.type === type);
  if (!part) return 0;
  const total = tool.rawStats.durability;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, derivePart(part).stats.durability / total));
}

// ---------------------------------------------------------------------------
// THE HARDNESS WALL — what a cast tool is worth on the old tier ladder
// ---------------------------------------------------------------------------

/**
 * A CAST TOOL ANSWERS THE HARDNESS WALLS, and it has to, because the old Forge
 * no longer makes tools.
 *
 * `depthSys` gates every descent on `equippedTool(state).tier`. Removing the
 * old bench's crafting without this would have bricked a new save at the first
 * wall — Loam's is depth 45 — with no way to make a tier-II tool at all. That
 * is not a UI change, so it does not get to be one.
 *
 * THE MAPPING IS THE OLD LADDER'S OWN: three tiers per shell (`maxToolTier`),
 * and one shell step of rock rate is 36x because rate is bite x cadence and
 * each carries a 6x shell step. So a tool three-tenths of a shell above the
 * Loam reference is worth about a tier.
 *
 * IT IS CAPPED AT `maxToolTier` DELIBERATELY. That is the same ceiling the old
 * bench already enforced on what you could craft at your depth, so a cast tool
 * can REPLACE the ladder but never outrun it — this is a substitution, not a
 * pacing change, and capping it is what keeps that true without a sim sweep.
 */
export const TIERS_PER_SHELL = 3;
export const RATE_REF = 100;
/** One shell step of ROCK RATE: bite and cadence each step by SHELL_STEP. */
export const RATE_STEP = SHELL_STEP * SHELL_STEP;

export function castingToolTier(state: GameState): number {
  const tool = currentTool(state);
  if (!tool) return 0;
  // A broken tool is a broken tool. It still mines; it does not pass a wall it
  // could not pass whole, and it does not lose one it already passed — descent
  // is gated at the moment you press it, and this only ever refuses.
  const rate = tool.rockRate * (isBroken(state, tool) ? BROKEN_SHARE : 1);
  if (!(rate > 0)) return 0;
  const steps = Math.log(Math.max(1, rate / RATE_REF)) / Math.log(RATE_STEP);
  return Math.max(0, Math.min(maxToolTier(state), 1 + Math.floor(TIERS_PER_SHELL * steps)));
}

/**
 * THE TIER THE ROCK IS ACTUALLY ASKED ABOUT — the better of the two benches.
 *
 * MAX, not replacement: a long-running save holds old tools that were paid for,
 * and a player who has not touched the Casting Floor must not wake up unable to
 * descend. Nothing anyone already had gets worse.
 */
export function effectiveToolTier(state: GameState): number {
  return Math.max(equippedTool(state).tier, castingToolTier(state));
}

/** Units of the part's own material a repair costs. Maintenance is a sink. */
export const REPAIR_UNITS = 2;

/**
 * RE-SEAT A PART. The doc's second repair route — "a repair action using the
 * same material" — as against the first, which is re-casting the part outright
 * and is already reachable through the station (step 2), where the wear
 * carry-over does the same arithmetic.
 *
 * It lives HERE rather than in `casting.ts` because that module must not import
 * this one: `toolEffect` reads `currentTool`, so the dependency runs
 * casting → nothing, toolMining → casting, and a repair sitting on the other
 * side would close the loop. One direction, on purpose.
 */
export function repairTool(
  state: GameState,
  ctx: EngineCtx,
  type: PartType,
): ActionResult {
  const tool = currentTool(state);
  if (!tool) return { ok: false, reason: 'You are not carrying one' };
  const part = tool.parts.find((p) => p.type === type);
  if (!part) return { ok: false, reason: 'No such part on it' };
  if (state.casting.wear <= 0) return { ok: false, reason: 'Nothing to put right' };

  const name = materialDef(part.materialId).name;
  if (materialCount(state, part.materialId) < REPAIR_UNITS) {
    return { ok: false, reason: `Needs ${REPAIR_UNITS} ${name}` };
  }
  consumeMaterial(state, part.materialId, REPAIR_UNITS);

  const back = poolOf(tool) * repairShare(tool, type);
  const before = state.casting.wear;
  state.casting.wear = Math.max(0, state.casting.wear - back);
  state.casting.repairs += 1;

  ctx.emit({ type: 'toolRepaired', partType: type, materialId: part.materialId });
  ctx.dirty();
  return { ok: true, data: { restored: before - state.casting.wear, share: repairShare(tool, type) } };
}

/**
 * SPEND ONE SWING'S WORTH OF THE POOL. Called from the manual verbs and only
 * from them: the drills and the idle layer never touch it, because a tool that
 * wore out while you were not holding it would make the idle layer a cost.
 *
 * `count` is swings, so a sweep across nine cells is nine — an ergonomic
 * gesture is not a discount on maintenance.
 */
export function spendToolUse(state: GameState, count = 1): void {
  const tool = currentTool(state);
  if (!tool) return;
  const pool = poolOf(tool);
  if (state.casting.wear >= pool) return; // already at the floor; it cannot get worse
  state.casting.wear = Math.min(pool, state.casting.wear + wearPerUse(tool) * count);
}
