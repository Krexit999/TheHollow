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
import { equippedTool, requiredTier } from './forge';
import { currentShell } from '../shells';
import { lawFlag, lawNum, challengeNum } from '../laws';
import { descendMultiplier, noteReached, clearDigStop } from './shaftSys';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

/** The base descend cost before the Shaft's re-tread/rail adjustment. */
export function currentDescendCost(state: GameState, mods: ModifierCache): Decimal {
  return descendCost(state.depth + 1).mul(mods.get(state, 'descendCost'));
}

/**
 * What the next step ACTUALLY costs right now: 0 for rock already cleared this
 * run (re-tread), a discount for railed rock, full otherwise. What the UI shows.
 */
export function effectiveDescendCost(state: GameState, mods: ModifierCache): Decimal {
  return currentDescendCost(state, mods).mul(descendMultiplier(state, state.depth + 1));
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
  const mult = descendMultiplier(state, state.depth + 1);
  if (mult === 0) return finishDescend(state, mods, ctx);

  // The rock hardens with depth — a legible wall, never a trap: you cannot
  // descend past what your tool can chip. THE UNWRITTEN WALL (law) softens
  // this to one tier under at triple fare — a slow push, not an open door.
  const needed = requiredTier(state, state.depth + 1);
  const soft = lawNum(state, 'wallSoftness') > 0 && equippedTool(state).tier === needed - 1;
  if (equippedTool(state).tier < needed && !soft) {
    return {
      ok: false,
      reason: `The rock below is too hard — a Tier ${ROMAN[needed] ?? needed} tool is needed`,
    };
  }
  // Railed rock is cheaper to re-descend — the infrastructure carries you down.
  let cost = currentDescendCost(state, mods).mul(mult);
  if (soft) cost = cost.mul(3);
  // THE WEIGHTLESS PURSE (law): the stair takes the converter currency when
  // that purse is deeper (1 conv counts for 4 chip — the Kiln's own ratio).
  if (lawFlag(state, 'convDescend')) {
    const convId = shell.convCurrencyId;
    const convCost = cost.div(4);
    if ((state.currencies[shell.chipCurrencyId] ?? D(0)).lt(cost) && (state.currencies[convId] ?? D(0)).gte(convCost)) {
      if (spendCurrency(state, convId, convCost)) {
        return finishDescend(state, mods, ctx);
      }
    }
  }
  if (!spendCurrency(state, shell.chipCurrencyId, cost)) {
    return { ok: false, reason: `Not enough ${currencyDef(shell.chipCurrencyId).name}` };
  }
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
  const newGround = state.depth + 1 > state.shaft.reached;
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
  ctx.dirty(); // Depth Pressure modifier changed
  ctx.emit({ type: 'descend', depth: state.depth });
  return { ok: true, data: { depth: state.depth } };
}
