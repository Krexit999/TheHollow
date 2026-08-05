/**
 * Depth. `cost(d) = 25 * 1.09^d` in the shell's chip currency (locked curve;
 * depth and its records are per-shell). Each depth grants Depth Pressure
 * (+2% chip yield). Hardness walls and the shell floor are legible gates.
 */
import { Decimal } from '../decimal';
import type { ModifierCache } from '../modifiers';
import { currencyDef, spendCurrency } from '../resources';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { descendCost } from '../prestigeMath';
import { grantXP } from './xp';
import { D } from '../decimal';
import { requiredTier } from './forge';
import { markReached } from './roll';
import { findAt, tickDead } from './dead';
import { stationGaveWay } from './roll';

/**
 * WHAT ONE TIER SHORT COSTS AT THE STAIR, compounding per tier. Three was the
 * old "unwritten wall" law's surcharge for exactly one tier under, and it read
 * as a fair premium in play — so it becomes the general rate rather than a
 * special case. Two tiers under is 9x, three is 27x: possible, and plainly a
 * bad idea, which is what a choice should feel like.
 */
export const UNDER_TIER_FARE = 3;

/** What the UNWRITTEN WALL law is worth now that it is not the only way through:
 *  it takes the one-tier surcharge back off entirely. */
export const WALL_SOFTNESS_RELIEF = 1 / UNDER_TIER_FARE;
import { effectiveToolTier } from './toolMining';
import { currentShell } from '../shells';
import { lawFlag, lawNum, challengeNum } from '../laws';
import { descendMultiplier, noteReached, clearDigStop } from './shaftSys';
import { driftDepth } from './shoring';
import { settleRelief, spendSettle } from './settle';


/** The base descend cost before the Shaft's re-tread/rail adjustment. */
export function currentDescendCost(state: GameState, mods: ModifierCache): Decimal {
  return descendCost(state.depth + 1).mul(mods.get(state, 'descendCost'));
}

/**
 * What the next step ACTUALLY costs right now: 0 for rock already cleared this
 * run (re-tread), a discount for railed rock, a further discount for however
 * much the shaft has SETTLED while nobody worked the face, full otherwise.
 * What the UI shows.
 */
export function effectiveDescendCost(state: GameState, mods: ModifierCache): Decimal {
  const target = state.depth + 1;
  return currentDescendCost(state, mods)
    .mul(descendMultiplier(state, target))
    .mul(settleRelief(state, target));
}

export function descend(state: GameState, mods: ModifierCache, ctx: EngineCtx): ActionResult {
  const shell = currentShell(state);
  // THE SHALLOW (challenge): a hard ceiling on depth for the run.
  const capped = challengeNum(state, 'depthCap', Infinity);
  if (state.depth >= capped) {
    return { ok: false, reason: 'The shaft will go no deeper this run. Earn it above.' };
  }
  // The shell floor: descend no further — Breach instead.
  if (state.depth >= shell.floorDepth) {
    return { ok: false, reason: 'The floor of this world. It sounds hollow underfoot.' };
  }

  // THE SHAFT: re-treading rock you have already cleared this run is free, and
  // the wall down there is already broken — walk back down without paying.
  //
  // A DRIFT (§9.4) is the same thing made permanent: timbered rock, free in
  // either direction, for as long as you leave the props in. After a Collapse
  // the fall has already set `shaft.reached` to the drift floor so the line
  // above covers it; this line is what makes a band you shored MID-RUN free to
  // walk down to without waiting for the next fall.
  const mult = state.depth + 1 <= driftDepth(state)
    ? 0
    : descendMultiplier(state, state.depth + 1);
  if (mult === 0) return finishDescend(state, mods, ctx);

  // The rock hardens with depth. It is a PRICE, never a door — see below.
  const needed = requiredTier(state, state.depth + 1);
  // THE BETTER OF THE TWO BENCHES. Tool crafting moved to the Casting Floor,
  // so a cast tool has to be able to answer a wall — otherwise a new save is
  // stuck at depth 45 forever. Old tools still count; nothing anyone already
  // paid for gets worse.
  const have = effectiveToolTier(state);
  /**
   * THE WALL IS A PRICE NOW, NOT A DOOR (A.70).
   *
   * It used to REFUSE: "a Tier II tool is needed", full stop, and a player
   * without one simply could not go down. The brief is explicit that this is
   * unwanted — "do NOT require a specific tool to progress ... let the new tool
   * improve mining without being a wall" — and the pillars agree twice over:
   * pillar 1 says both an idle and an active player must have a path, and the
   * standing rule against gating a structural unlock behind the wall it exists
   * to cross is the same shape of bug.
   *
   * So being under-tooled costs FARE instead of stopping you: `UNDER_TIER_FARE`
   * per tier short, compounding. One tier under is a real but payable premium;
   * three tiers under is possible and stupid, which is exactly the shape a
   * choice should have. A better tool still matters everywhere it mattered
   * before — bite, reach, ore speed, and now a cheaper stair — it simply is not
   * a locked door any more.
   *
   * THE UNWRITTEN WALL (law) keeps its meaning as a DISCOUNT on that fare
   * rather than as the only way through.
   */
  const under = Math.max(0, needed - have);
  const softened = lawNum(state, 'wallSoftness') > 0 && under === 1;
  const fare = under > 0
    ? Math.pow(UNDER_TIER_FARE, under) * (softened ? WALL_SOFTNESS_RELIEF : 1)
    : 1;
  // Railed rock is cheaper to re-descend — the infrastructure carries you down.
  // THE SETTLING (A.42) then erodes what is left, by however much quiet the
  // shaft has banked. Charged BEFORE the under-tier fare so the two compose the
  // way the player reads them: a discount on the price, then the surcharge for
  // going down under-tooled.
  const relief = settleRelief(state, state.depth + 1);
  let cost = currentDescendCost(state, mods).mul(mult).mul(relief);
  if (fare !== 1) cost = cost.mul(fare);
  // THE WEIGHTLESS PURSE (law): the stair takes the converter currency when
  // that purse is deeper (1 conv counts for 4 chip — the Kiln's own ratio).
  if (lawFlag(state, 'convDescend')) {
    const convId = shell.convCurrencyId;
    const convCost = cost.div(4);
    if ((state.currencies[shell.chipCurrencyId] ?? D(0)).lt(cost) && (state.currencies[convId] ?? D(0)).gte(convCost)) {
      if (spendCurrency(state, convId, convCost)) {
        spendSettle(state, relief);
        return finishDescend(state, mods, ctx);
      }
    }
  }
  if (!spendCurrency(state, shell.chipCurrencyId, cost)) {
    return { ok: false, reason: `Not enough ${currencyDef(shell.chipCurrencyId).name}` };
  }
  // The loose rock came down with you: cash the settling in proportion to the
  // relief this step actually used, so the bank is spent where it mattered.
  spendSettle(state, relief);
  return finishDescend(state, mods, ctx);
}

/**
 * MULTI-DESCEND — go down N steps in one act. It is IMPLEMENTED as a loop of
 * single `descend` calls, so it spends EXACTLY what N taps of Descend would
 * spend and obeys every per-step gate (walls, floor, laws, the cost curve) with
 * no parallel cost path that could drift — the same guarantee the lift makes for
 * batched convenience. It stops early the moment a step cannot be paid or a wall
 * blocks it, having descended (and paid for) exactly the steps that succeeded.
 * `count` is clamped to a sane bound so a huge N cannot loop forever.
 */
export function descendMany(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  count: number,
): ActionResult {
  const want = Math.max(1, Math.min(1000, Math.floor(count)));
  let descended = 0;
  let firstReason: string | undefined;
  for (let i = 0; i < want; i++) {
    const r = descend(state, mods, ctx);
    if (!r.ok) { if (descended === 0) firstReason = r.reason; break; }
    descended += 1;
  }
  if (descended === 0) return { ok: false, reason: firstReason ?? 'Cannot descend' };
  return { ok: true, data: { descended, depth: state.depth } };
}

function finishDescend(state: GameState, mods: ModifierCache, ctx: EngineCtx): ActionResult {
  const shell = currentShell(state);
  // NEW GROUND is anything past the run's cleared floor. Re-treading cleared
  // rock (a free step back down after climbing) is movement, not progress: it
  // pays no XP and does not count as a descent, so climb+descend cannot farm.
  /**
   * NEW GROUND is anything past the run's cleared floor — and past the DRIFT.
   *
   * Without the second half, a band shored mid-run pays XP and a `descents`
   * tick for every step of a free walk down it, once per newly-timbered band.
   * Small, repeatable, and exactly the shape of faucet this codebase keeps
   * finding after the fact, so it is closed at the seam rather than argued
   * about. The Collapse fall is already covered: it sets `shaft.reached` to
   * the drift floor, so `reached` alone would do — this is belt and braces for
   * the one path that does not go through the fall.
   */
  const newGround = state.depth + 1 > Math.max(state.shaft.reached, driftDepth(state));
  state.depth += 1;
  noteReached(state); // extend the run's cleared floor if this is new ground
  clearDigStop(state); // arriving somewhere new frees the next excavation shift
  if (newGround) {
    state.stats.descents += 1;
    if (state.depth > (state.depthRecords[shell.id] ?? 0)) {
      state.depthRecords[shell.id] = state.depth;
      state.maxDepthRecord = state.depth;
      ctx.dirty(); // mastery gates may have opened
    }
    grantXP(state, mods, ctx, D(1.5 * state.depth));
  }
  /**
   * THE ROAD IS MARKED BY WALKING IT (§1). Every station at or above the new
   * depth is passed: a WALL the tool could actually answer is CLEARED, a WRECK
   * is LOOTED, and both are permanent through Collapse and Breach.
   *
   * The tier is passed in rather than re-read inside, because clearing a wall
   * has to mean BREAKING it. Squeezing past under-tier is possible — the wall
   * is a price, not a door (A.70) — and paying the fare is not the same thing.
   */
  for (const id of markReached(state, state.depth, effectiveToolTier(state))) {
    ctx.emit({ type: 'stationReached', id, depth: state.depth });
  }
  /**
   * ...AND ONE OF THEM MAY NOT BE THERE WHEN YOU ARRIVE (§53 SUBSIDENCE, §55
   * row 6). You are put back up the shaft and the station is off the Roll for
   * the rest of this world. Deliberately AFTER the reach loop: everything on
   * the way down still counts, and what you lose is the arrival.
   */
  const fell = stationGaveWay(state, state.depth);
  if (fell) {
    state.depth = fell.to;
    ctx.emit({ type: 'stationCollapse', id: fell.id, to: fell.to });
  }
  /**
   * AND THE DEAD ARE LYING ON IT (§48.1). Same walking-in, same permanence, and
   * deliberately NOT inside `markReached` — that function returns station ids
   * for `stationReached`, and a ghost is not a station. `tickDead` runs even
   * when nothing was found, because a trail also closes by going DEEPER than
   * the last thing somebody left, which is a descent and not a pickup.
   */
  findAt(state, ctx, currentShell(state).id, state.depth);
  tickDead(state, ctx);
  ctx.dirty(); // Depth Pressure modifier changed
  ctx.emit({ type: 'descend', depth: state.depth });
  return { ok: true, data: { depth: state.depth } };
}
