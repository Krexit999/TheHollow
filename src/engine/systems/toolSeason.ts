/**
 * THE SEASONING — what a tool becomes from being USED, per stat, at its own rate.
 *
 * The report: "growth is flat". It was. `toolLevel` bought grants, `wear` ran
 * down, and the ten stats a tool actually HAS were fixed the instant it was
 * assembled — a tool three hundred hours old read identically to the one that
 * came off the bench that morning.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT SEASONING IS, AND WHY IT IS A SHAPE RATHER THAN A BONUS.
 *
 * A worn-in tool is not a better tool. It is a DIFFERENT tool, and every real
 * one drifts the same way: the edge goes off and the handling comes in. So the
 * drift here is signed, per stat, at per-stat rates:
 *
 *   BITE and CADENCE go DOWN. The edge dulls and the swing slows a little. This
 *   is small and hard-capped (`SEASON_DULL_MAX`) because a mechanic that makes
 *   your favourite tool worse for using it is a punishment for playing.
 *   CONTROL, STABILITY, ORESPEED, RESILIENCE go UP, and further than the dull
 *   goes down. The hand learns the tool: it lands where you meant, it shakes
 *   less, it opens a pocket quicker.
 *   DURABILITY goes up most of all, and slowest — see `wearResist` below.
 *   MODSLOTS and ATTUNEMENT do not move. Those are the stone's, not the hand's.
 *
 * The result is that a seasoned tool is meaningfully better at what a seasoned
 * tool should be better at, slightly worse at raw first-strike, and never worse
 * OVERALL — asserted in `season.test.ts` rather than asserted in a comment.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * "THE MORE YOU USE AND BREAK IT, THE SLOWER IT BREAKS."
 *
 * That is `wearResist`, and it reads two different histories on purpose:
 *
 *   XP is what the tool has DONE — cells worked, never reset.
 *   REPAIRS is what it has SURVIVED — each break-and-mend leaves it tougher.
 *
 * Reading only XP would make an untouched shelf-queen as tough as a workhorse;
 * reading only repairs would reward breaking it on purpose. Both, each with its
 * own curve, each saturating, and the pair hard-capped at `WEAR_RESIST_MAX`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PILLAR 2. Not one term here is yield. `bite` and `cadence` move DOWN; the
 * stats that move up are reach-adjacent, reliability, ore SPEED and durability,
 * and every one of them still lands inside `effectOf`'s existing clamps
 * (`MAX_EXTRA_CELLS`, splash <= 1, `ORE_RATE_CAP`) because seasoning is applied
 * to `tool.stats` BEFORE `effectOf` runs, not after it. A seasoned tool clears
 * the face more reliably; the face still holds `W x H x regen`.
 */
import type { GameState } from '../types';
import { TOOL_STATS, type ToolStat } from '../content/forgeParts';
import type { ToolStats } from './forgeParts';

/**
 * PER-STAT DRIFT, and the whole point is that these are all DIFFERENT.
 *
 * Each entry is `[signed ceiling, cells to reach half of it]`. A negative
 * ceiling dulls. The half-life is what makes the rates differ: control comes in
 * over a few thousand cells, durability takes tens of thousands, and the edge
 * goes off almost at once and then stops.
 */
export const SEASON: Partial<Record<ToolStat, { to: number; half: number }>> = {
  // Goes off early, and then it has gone off — a fast, shallow curve.
  bite: { to: -0.05, half: 1_500 },
  cadence: { to: -0.03, half: 2_500 },
  // The hand learns. Middling rates, real magnitudes.
  control: { to: 0.18, half: 6_000 },
  stability: { to: 0.15, half: 8_000 },
  oreSpeed: { to: 0.12, half: 5_000 },
  strike: { to: 0.08, half: 12_000 },
  resilience: { to: 0.14, half: 15_000 },
  // The slowest of all: a tool gets hard to kill over a very long time.
  durability: { to: 0.22, half: 30_000 },
  // `modSlots` and `attunement` are deliberately absent. They are properties of
  // the STONE — how much the Binding will hold, how many seats the Sockets part
  // has — and no amount of swinging drills another hole in a rock.
};

/** The hardest the edge may ever dull, summed. A floor on the punishment. */
export const SEASON_DULL_MAX = 0.08;

/** Saturating growth: 0 at n=0, half the ceiling at n=half, never past `to`. */
function curve(n: number, to: number, half: number): number {
  if (n <= 0 || half <= 0) return 0;
  return to * (n / (n + half));
}

/** Cells this tool has worked, ever. The record of what it has DONE. */
export function seasonXp(state: GameState): number {
  return Math.max(0, state.casting?.xp ?? 0);
}

/** Break-and-mends survived. The record of what it has SURVIVED. */
export function seasonRepairs(state: GameState): number {
  return Math.max(0, state.casting?.repairs ?? 0);
}

/**
 * THE PER-STAT MULTIPLIERS. `1` for every stat on a tool that has never swung,
 * which is what makes this additive: a fresh save derives byte-identically to
 * before seasoning existed.
 */
export function seasonFold(state: GameState): Record<ToolStat, number> {
  const xp = seasonXp(state);
  const out = {} as Record<ToolStat, number>;
  let dull = 0;
  for (const stat of TOOL_STATS) {
    const s = SEASON[stat];
    if (!s) { out[stat] = 1; continue; }
    let d = curve(xp, s.to, s.half);
    // THE DULL FLOOR, applied across the dulling stats together rather than
    // per stat — two small nerfs that individually look fine are one big one.
    if (d < 0) {
      const room = Math.max(0, SEASON_DULL_MAX - dull);
      d = -Math.min(-d, room);
      dull += -d;
    }
    out[stat] = 1 + d;
  }
  return out;
}

export const WEAR_RESIST_MAX = 0.45;
const RESIST_XP_HALF = 40_000;
const RESIST_XP_TO = 0.25;
const RESIST_REPAIR_HALF = 25;
const RESIST_REPAIR_TO = 0.30;

/**
 * HOW MUCH SLOWER THIS TOOL BREAKS, 0..WEAR_RESIST_MAX. Multiply wear per use
 * by `1 - wearResist`.
 *
 * Two histories, two curves, one cap. Neither alone reaches the cap, so a tool
 * that is genuinely old AND genuinely battered is the only thing that gets near
 * it — which is the tool the report is about.
 */
export function wearResist(state: GameState): number {
  const fromWork = curve(seasonXp(state), RESIST_XP_TO, RESIST_XP_HALF);
  const fromScars = curve(seasonRepairs(state), RESIST_REPAIR_TO, RESIST_REPAIR_HALF);
  return Math.min(WEAR_RESIST_MAX, fromWork + fromScars);
}

/** A seasoned copy of the tool. Cheap, and never mutates the memoised original. */
export function seasoned(state: GameState, tool: ToolStats): ToolStats {
  const fold = seasonFold(state);
  const stats = {} as Record<ToolStat, number>;
  let moved = false;
  for (const stat of TOOL_STATS) {
    stats[stat] = tool.stats[stat] * fold[stat];
    if (fold[stat] !== 1) moved = true;
  }
  // A TOOL THAT HAS NEVER SWUNG IS THE ORIGINAL OBJECT, not a copy of it. Keeps
  // the identity `seasoned(fresh) === fresh` true, so nothing downstream that
  // compares tools by reference changes behaviour on a fresh save.
  if (!moved) return tool;
  return { ...tool, stats };
}

/** What the panel shows. Sorted by how far each has moved, biggest first. */
export interface SeasonRow { stat: ToolStat; mult: number; pct: number }

export function seasonRows(state: GameState): SeasonRow[] {
  const fold = seasonFold(state);
  return TOOL_STATS
    .filter((s) => SEASON[s] !== undefined)
    .map((stat) => ({ stat, mult: fold[stat], pct: (fold[stat] - 1) * 100 }))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}
