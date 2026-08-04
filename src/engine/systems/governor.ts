/**
 * THE GOVERNOR — OVERCLOCKING (§13, §15.4, the wreck at Governor's Wreck 175).
 *
 * §13: "spend extra Draw for speed, at off-spec risk · blocks late throughput."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BRIEF NAMED THIS ONE AS THE DANGEROUS MACHINE: "the one closest to a raw-
 * yield faucet in the whole machine list. If it can't be built as a risk
 * decision rather than a throughput knob, say so and cut it."
 *
 * IT CAN, AND THE REASON IS THAT THE PLANT ALREADY HAS TWO SCARCITIES AND THE
 * TIER LADDER ALREADY HAS A PROMISE TO BREAK.
 *
 *   THE PRICE IS CONTENDED. Flow is shared proportionally across every machine
 *   drawing it (`flowSatisfaction`), and Surge is one bank. So the extra Draw
 *   an overclock costs is not a currency you spend, it is capacity you TAKE
 *   FROM THE REST OF THE PLANT — overclocking the Still slows the Refinery, and
 *   there is no amount of money that fixes it.
 *
 *   THE RISK IS THE TIER YOU PAID FOR. §15.4's tier II is "retains the input's
 *   purity band", which is the single most expensive capability a machine buys.
 *   An overclocked machine goes OFF-SPEC: the unit comes out a band lower, i.e.
 *   the machine behaves like the tier-I version it used to be. You are gambling
 *   the capability, not a resource.
 *
 * So an overclock is not "more output per second" — it is "this converts faster,
 * some of what it converts is spoiled, and everything else in the plant slows
 * down while it does". That is three axes moving in different directions, which
 * is a decision. NOT CUT.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PILLAR 2, and it is the same argument `plant.ts` and `condition.ts` make.
 * Speed here is CONVERSION speed — how fast a machine works stock it already
 * has. There is no path from this file to `cellCap`, `cellRegen` or `chipYield`,
 * and an overclock cannot create a unit: every converter is still one-in-one-out
 * or lossier, and the only thing an overclock can do to a unit is make it worse.
 * The ceiling is asserted with every machine at maximum overclock.
 *
 * TIERS ARE CAPABILITY (§15.4):
 *   I    ONE MACHINE AT A TIME carries a setting
 *   II   THE WHOLE PLANT AT ONCE
 *   III  IT REGULATES — a machine backs off on its own when the plant cannot
 *        carry it, which is what a governor is actually for. NOT a tier that
 *        removes the risk: that would hand back the throughput knob at the top
 *        of the ladder, which is the exact failure the brief warned about.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { BAND_RANGES, BANDS, bandOf } from '../materials';
import {
  MAX_MACHINE_TIER, TIER_PART_COST, demandOf, ensurePlant, flowCap, flowDrawers, noteBuiltOf,
  tierOf,
} from './plant';
/**
 * SEIZURE IS READ OFF THE FIELD, NOT THROUGH `machineSpeed` — deliberately.
 * `condition.ts` folds THIS file's `overclockSpeed` into `machineSpeed`, so a
 * Governor asking `machineSpeed('governor')` would be asking a question whose
 * answer depends on the Governor's own setting. `conditionOf` is the raw field
 * and has no such loop.
 */
import { conditionOf } from './condition';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';

/** The wreck it is found in — Ferrite, Governor's Wreck 175. */
export const GOVERNOR_WRECK = 'THE GOVERNOR';

/** How far past its rating a machine may be pushed. */
export const MAX_OVERCLOCK = 3;

/**
 * WHAT ONE STEP BUYS, AND WHAT IT COSTS.
 *
 * Speed is linear and Draw is superlinear, which is what makes the top step a
 * bad deal for anything but the machine you are actually waiting on. At step 3
 * you get +105% speed for +180% Draw — worth it exactly once, in a plant with
 * room, on the one machine that is the bottleneck.
 */
export const OVERCLOCK_SPEED = 0.35;
export const OVERCLOCK_DRAW = 0.6;

/**
 * THE CHANCE A STEP GOES OFF-SPEC, per unit delivered. At step 3 nearly half of
 * what comes off a tier-II machine arrives at tier-I quality, which is the
 * number that makes the top step a gamble rather than a purchase.
 */
export const OFFSPEC_PER_STEP = 0.15;

export const TIER_CAPABILITY_GOVERNOR = [
  'not built',
  'one machine at a time carries a setting',
  'the whole plant at once',
  'it backs a machine off when the plant cannot carry it',
] as const;

export interface GovernorState {
  /** machineId -> steps past its rating, 1..MAX_OVERCLOCK. */
  steps: Record<string, number>;
  /** How many units have come off a machine spoiled. The record of the gamble. */
  offSpec: number;
  /** The last machine it happened to, so the panel can say so. */
  lastOffSpec?: string;
}

export function defaultGovernorState(): GovernorState {
  return { steps: {}, offSpec: 0 };
}

export function ensureGovernor(state: GameState): GovernorState {
  const g = (state.governor ??= defaultGovernorState());
  g.steps ??= {};
  if (typeof g.offSpec !== 'number' || Number.isNaN(g.offSpec)) g.offSpec = 0;
  return g;
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export function governorStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === GOVERNOR_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function governorFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === GOVERNOR_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function governorBuilt(state: GameState): boolean {
  return tierOf(state, 'governor') > 0;
}

/** How many machines this Governor will hold a setting for at once. */
export function machineLimit(state: GameState): number {
  const t = tierOf(state, 'governor');
  if (t >= 2) return Infinity;
  return t >= 1 ? 1 : 0;
}

/** Tier III: it backs off on its own when the plant browns out. */
export function regulates(state: GameState): boolean {
  return tierOf(state, 'governor') >= 3;
}

export function nextGovernorTierCost(state: GameState): number | null {
  const t = tierOf(state, 'governor');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildGovernor(state: GameState, ctx: EngineCtx): ActionResult {
  if (!governorFound(state)) {
    const at = governorStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Governor.' };
  }
  const cost = nextGovernorTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Governor is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'governor', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['governor'] = tierOf(state, 'governor') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'governor', tier: plant.tiers['governor']! });
  return { ok: true, data: { tier: plant.tiers['governor'] } };
}

// ---------------------------------------------------------------------------
// The setting
// ---------------------------------------------------------------------------

/** What the player asked for. `steps` as SET, before regulation. */
export function stepsSet(state: GameState, machineId: string): number {
  if (!governorBuilt(state)) return 0;
  return Math.max(0, Math.min(MAX_OVERCLOCK, state.governor?.steps?.[machineId] ?? 0));
}

/**
 * WHAT THE MACHINE IS ACTUALLY RUNNING AT.
 *
 * Tier III is the whole difference between these two functions: a regulating
 * Governor reads how much of its Flow the machine is really getting and drops
 * the setting to match, so an overclock you cannot afford quietly becomes one
 * you can instead of starving the rest of the plant. Below tier III the setting
 * is the setting and the brownout is your problem.
 */
export function stepsLive(state: GameState, machineId: string): number {
  const want = stepsSet(state, machineId);
  if (want <= 0 || !regulates(state)) return want;
  const served = askedSatisfaction(state, machineId);
  if (served >= 1) return want;
  return Math.max(0, Math.min(want, Math.floor(want * served)));
}

/**
 * WHAT FRACTION THE PLANT COULD SERVE IF EVERY SETTING RAN AT WHAT WAS ASKED.
 *
 * This is `flowSatisfaction` computed from `stepsSet` rather than `stepsLive`,
 * and it exists because the obvious version DID NOT TERMINATE: regulation asked
 * `flowSatisfaction`, which asked `demandNow`, which asked `overclockDraw`,
 * which asked `stepsLive`, which asked regulation. The governor test blew the
 * stack on its first run — a fixpoint written by accident, with no fixpoint.
 *
 * Asking about the SETTING breaks it in one pass and is the better question
 * anyway: "if I ran everything you asked for, what could the plant carry" is
 * exactly what a governor needs to know before it decides how far to back off.
 */
function askedSatisfaction(state: GameState, machineId: string): number {
  const drawers = flowDrawers(state);
  if (!drawers.includes(machineId)) return 1;
  const total = drawers.reduce(
    (n, id) => n + demandOf(id).flow * (1 + OVERCLOCK_DRAW * stepsSet(state, id)), 0,
  );
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, flowCap(state) / total));
}

export function setOverclockBlocker(
  state: GameState, machineId: string, steps: number,
): string | null {
  if (!governorBuilt(state)) return 'The Governor is not standing.';
  if (conditionOf(state, 'governor')?.seized) return 'It has cracked. Re-cast it before it will run.';
  if (tierOf(state, machineId) <= 0 && !(machineId === 'kiln' && state.kiln.built)) {
    return 'That is not built.';
  }
  if (steps < 0 || steps > MAX_OVERCLOCK) return `A machine goes ${MAX_OVERCLOCK} steps past its rating.`;
  if (steps > 0) {
    const g = ensureGovernor(state);
    const already = Object.entries(g.steps).filter(([id, n]) => n > 0 && id !== machineId).length;
    if (already + 1 > machineLimit(state)) {
      return `This Governor holds one machine at a time. ${Object.entries(g.steps).find(([id, n]) => n > 0 && id !== machineId)?.[0] ?? 'Another machine'} is already past its rating.`;
    }
  }
  return null;
}

export function setOverclock(
  state: GameState, ctx: EngineCtx, machineId: string, steps: number,
): ActionResult {
  const blocked = setOverclockBlocker(state, machineId, steps);
  if (blocked) return { ok: false, reason: blocked };
  const g = ensureGovernor(state);
  if (steps <= 0) delete g.steps[machineId];
  else g.steps[machineId] = steps;
  ctx.dirty();
  return { ok: true, data: { machineId, steps } };
}

// ---------------------------------------------------------------------------
// What the rest of the plant reads
// ---------------------------------------------------------------------------

/** How much faster this machine converts what it already has. Never yield. */
export function overclockSpeed(state: GameState, machineId: string): number {
  return 1 + OVERCLOCK_SPEED * stepsLive(state, machineId);
}

/** How much more Draw it takes while it does. Superlinear on purpose. */
export function overclockDraw(state: GameState, machineId: string): number {
  const n = stepsLive(state, machineId);
  return n <= 0 ? 1 : 1 + OVERCLOCK_DRAW * n;
}

/** The chance a unit off this machine arrives spoiled. */
export function offSpecChance(state: GameState, machineId: string): number {
  return Math.min(1, OFFSPEC_PER_STEP * stepsLive(state, machineId));
}

/**
 * DROP A UNIT A BAND — what off-spec DOES, and it is the tier-II capability
 * being taken back rather than a new penalty invented for the occasion.
 *
 * Returns the purity the unit arrives at. `poor` is the floor: there is nothing
 * under it, so an already-poor unit is simply unharmed, which is honest — an
 * overclock cannot make a thing worse than the worst thing.
 */
export function bandBelow(purity: number): number {
  const i = BANDS.indexOf(bandOf(purity));
  if (i <= 0) return purity;
  const [, top] = BAND_RANGES[BANDS[i - 1]!]!;
  return Math.min(purity, top);
}

/**
 * ROLL IT, ONCE PER UNIT DELIVERED. Called from `deliver` — the one seam every
 * lateral converter's output passes through — so the Governor reaches every
 * machine at once and no converter had to be taught about it.
 *
 * The RNG is injectable for the same reason every other roll in this engine's
 * is: a probability nobody can pin down in a test is a probability nobody can
 * check.
 */
export function rollOffSpec(
  state: GameState, machineId: string, purity: number, rng: () => number = Math.random,
): number {
  const chance = offSpecChance(state, machineId);
  if (chance <= 0) return purity;
  if (rng() >= chance) return purity;
  const dropped = bandBelow(purity);
  if (dropped === purity) return purity;   // already at the floor; nothing happened
  const g = ensureGovernor(state);
  g.offSpec += 1;
  g.lastOffSpec = machineId;
  return dropped;
}

/** Every machine currently past its rating — the panel's list, and the record. */
export function overclocked(state: GameState): { machineId: string; set: number; live: number }[] {
  const g = state.governor;
  if (!g) return [];
  return Object.keys(g.steps ?? {})
    .filter((id) => (g.steps[id] ?? 0) > 0)
    .map((id) => ({ machineId: id, set: stepsSet(state, id), live: stepsLive(state, id) }));
}
