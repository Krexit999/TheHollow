/**
 * THE SETTLING — the idle-only descent aid (A.42).
 *
 * WHY THIS EXISTS. `dustCost(d) = 25·1.09^d` is a locked exponential; idle
 * income is not exponential in depth. A.41 measured what that does to the
 * pillar-1 ratio: time-to-depth ran 8.3× idle/active at d35 and 18.7× at d44,
 * widening with depth, against a pillar that asks for ~5× early and ~1.3× by
 * mid-game. The material economy was only ~11% of that crossing — the gap is
 * the descend curve, and it compounds.
 *
 * The fix cannot be a softer base for everyone: the 1.09 spine to depth 150 is
 * load-bearing (A.16 kept it precisely so every measured early beat stays
 * bit-identical), and cheapening it globally speeds the active player by the
 * same factor, moving nothing. So the relief has to be earned by the thing the
 * idle player has and the active player does not: TIME WITH NOBODY ON THE FACE.
 *
 * THE RULE. Rock left alone comes down on its own. While no hand is working
 * the face, the shaft below SETTLES — a bank of quiet that erodes the price of
 * the next step into new ground. Three properties make it safe:
 *
 *  1. IDLE-ONLY. The bank fills only after `QUIET_SEC` with no manual chip, so
 *     a player at the face never accrues it. Chipping PAUSES the fill; it never
 *     burns the bank (A.35's standing rule: switching is never punished).
 *  2. DEPTH-SCALING. The relief is `SOFTEN^(−fill·d)` — a softer effective base
 *     per depth, so it grows exactly as fast as the problem does. Shallow steps
 *     barely notice it; the marginal deepest step, which is the whole wall, is
 *     where it lands.
 *  3. SELF-LIMITING. A descent spends the bank in PROPORTION to the relief it
 *     just cashed (`1 − relief`), so a deep step empties it and the next deep
 *     step waits. That makes idle time-per-step BOUNDED BELOW by the refill
 *     clock instead of exponential — the shape that closes a widening gap —
 *     while a shallow re-descent after a Collapse spends almost nothing and the
 *     routine rebuild is untouched.
 *
 * IT IS NOT A FAUCET. It grants no dust, no materials and no depth: it changes
 * the PRICE of a tap the player still makes. Pillar 2's ceiling and the B2
 * faucet invariant (total materials track only ceiling-bound production) are
 * both untouched, and pillar 3 holds — depth still does not advance offline.
 *
 * Headless: no imports from React/Pixi/DOM.
 */
import type { GameState } from '../types';

/**
 * The knobs, in one place. MUTABLE ONLY so `scripts/descent-tune.ts` can sweep
 * the space in a single process — nothing in the game writes this, and a test
 * asserts the shipped values. Tune it, re-measure, then write the numbers here.
 */
export const SETTLE_TUNING = {
  /** Seconds with no manual chip before the shaft counts as quiet at all. */
  quietSec: 45,
  /** Seconds of quiet that fill the bank. Also the floor on idle time-per-step
   *  once the relief is doing the work. */
  capSec: 300,
  /** Effective per-depth softening at a full bank: the idle player's descend
   *  base is 1.09/soften rather than 1.09. */
  soften: 1.035,
  /** The relief can never go below this — the deep end is cheaper, never free. */
  floor: 0.01,
};

/** How full the bank is, 0..1. */
export function settleFill(state: GameState): number {
  const cap = SETTLE_TUNING.capSec;
  if (cap <= 0) return 0;
  return Math.min(1, (state.shaft.settle ?? 0) / cap);
}

/**
 * The multiplier the settling applies to the cost of reaching `targetDepth`.
 * 1 = no relief. Depth is the target depth WITHIN THE CURRENT SHELL, so the
 * relief resets with the shell exactly as the cost curve does.
 */
export function settleRelief(state: GameState, targetDepth: number): number {
  const fill = settleFill(state);
  if (fill <= 0 || targetDepth <= 0) return 1;
  const raw = Math.pow(SETTLE_TUNING.soften, -fill * targetDepth);
  return Math.max(SETTLE_TUNING.floor, Math.min(1, raw));
}

/**
 * Cash the settling in. Spends the bank IN PROPORTION to the relief actually
 * used, so a shallow step (relief ≈ 1) costs almost none of it and a deep step
 * (relief ≈ floor) takes nearly all of it. Called once per PAID step into new
 * ground — never for a free re-tread, which moved no rock.
 */
export function spendSettle(state: GameState, relief: number): void {
  const bank = state.shaft.settle ?? 0;
  if (bank <= 0) return;
  state.shaft.settle = Math.max(0, bank - bank * (1 - relief));
}

/**
 * Bank an offline stretch. Offline resolves closed-form (no tick loop), so the
 * purest idle case would otherwise be the one case that banks nothing. Pillar 3
 * is untouched: this changes the PRICE of the next step, not the depth — the
 * player still comes back and takes the stair themselves.
 */
export function settleOffline(state: GameState, seconds: number): void {
  const quiet = seconds - SETTLE_TUNING.quietSec;
  if (quiet <= 0) return;
  state.shaft.settleQuietSec = (state.shaft.settleQuietSec ?? 0) + seconds;
  state.shaft.settle = Math.min(SETTLE_TUNING.capSec, (state.shaft.settle ?? 0) + quiet);
}

/**
 * Accrue quiet. Driven from the engine tick. The manual-chip watermark is read
 * from `stats.manualChips` rather than hooked into `manualChip` itself, so
 * every path that counts as working the face by hand (chip, sweep, a figure)
 * pauses the fill without a second call site to keep in step.
 */
export function tickSettle(state: GameState, dt: number): void {
  const shaft = state.shaft;
  const chips = state.stats.manualChips;
  if (chips !== (shaft.settleChips ?? 0)) {
    shaft.settleChips = chips;
    shaft.settleQuietSec = 0;
    return; // hands on the face: the fill pauses, the bank keeps what it has
  }
  shaft.settleQuietSec = (shaft.settleQuietSec ?? 0) + dt;
  if (shaft.settleQuietSec < SETTLE_TUNING.quietSec) return;
  shaft.settle = Math.min(SETTLE_TUNING.capSec, (shaft.settle ?? 0) + dt);
}
