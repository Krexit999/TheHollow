/**
 * PRIZE DRILLS (A.56) — the chassis you cannot buy.
 *
 * THE PROBLEM. Twenty-four drills came off one shop row at ratio 1.25, which is
 * the "Standard" cost class, which is the class for things you buy forty of.
 * So the bay filled itself: by the time a player had any reason to think about
 * drills at all, they had all of them, and every later decision about the bay
 * was a decision about machines that had cost nothing to get.
 *
 * THE FIX IS TWO-SIDED, and only one side lives here. The shop row is re-priced
 * to the STRUCTURAL class (r = 1.75, sixteen levels — see shell1/upgrades.ts),
 * so a bought drill is a real investment. The remaining eight rails are filled
 * from SOMEWHERE ELSE: an achievement, a deed, a skill node. Those arrive free
 * and BETTER — more bite (`PRIZE_POWER`), drawn visibly larger on the face, and
 * carrying two or three alloy slots instead of one.
 *
 * WHY BETTER RATHER THAN JUST FREE. A free ordinary drill is a discount, and a
 * discount is not a prize. Two alloy slots is a different KIND of machine: it
 * is the only place in the game where two abilities compound on one stroke, so
 * a prize changes what the bay can do rather than how much of it there is.
 *
 * PILLAR 1. Nothing here is required and nothing here is active-only. The
 * achievement thresholds are counts of achievements EARNED, and an idle player
 * earns them on the same rails as anyone else — slower, never blocked. A player
 * who ignores this entirely still buys sixteen drills, which is more than the
 * bay had any use for before A.53 gave it abilities.
 *
 * PILLAR 2. A prize is a `drillPower` term and a slot count. Neither appears in
 * `dpsMax = W·H·regen·Y`; a bigger bite arrives at the ceiling sooner and stops
 * there, exactly as every other drill bonus does.
 *
 * THE SKILL-TREE HOOK IS A STUB, AND SAYS SO. `grantPrizeDrill` is the whole
 * interface — one call, an id, done — and the skill tree has no node wired to
 * it yet because authoring the tree is its own phase (LEDGER: "Delver skill
 * tree — the full 22/branch (66-node) size", still PARTIAL at 24 nodes). What
 * is deliberately NOT done is a fake node that promises a drill and never
 * delivers one: a stub that shows in the UI is the deceptive-stub failure
 * PILLARS names. No node, no promise.
 */
import type { EngineCtx, GameState } from '../types';
import { MAX_DRILLS, newPrizeDrill } from './drills';

export interface PrizeSource {
  id: string;
  /** The chassis's own name — a prize drill arrives named, like a relic. */
  name: string;
  /** How many alloys it holds. */
  slots: number;
  /** What earning it says, once, in the log. */
  line: string;
  /** Whether the player has earned it yet. */
  earned: (s: GameState) => boolean;
  /** What the player is told they are working toward — safe to show BEFORE it
   *  is earned, because a drill is a reward, not a recipe (pillar 5 governs
   *  what a mix makes, not what a milestone pays). */
  requirement: string;
}

function achievementCount(s: GameState): number {
  return Object.keys(s.achievements?.unlocked ?? {}).length;
}

/**
 * THE FOUR AUTHORED SOURCES, and one deliberately empty slot for the tree.
 *
 * Ordered by how hard they are, and the slot count rises with them, so the
 * eighth rail on a bay is genuinely the best machine on it. The names are the
 * old-machine register the bought drills use, one notch grander.
 */
export const PRIZE_SOURCES: PrizeSource[] = [
  {
    id: 'ach10', name: 'The Foreman', slots: 2,
    line: 'Something in the yard was watching you work. It has sent down a machine.',
    requirement: 'Ten achievements',
    earned: (s) => achievementCount(s) >= 10,
  },
  {
    id: 'ach25', name: 'Long Service', slots: 2,
    line: 'A chassis with somebody else\'s initials filed off the plate.',
    requirement: 'Twenty-five achievements',
    earned: (s) => achievementCount(s) >= 25,
  },
  {
    id: 'oreHunter', name: 'The Diviner', slots: 2,
    line: 'It was built by somebody who could smell a pocket through six feet of rock.',
    requirement: 'Open 250 ore pockets',
    earned: (s) => (s.stats?.oresOpened ?? 0) >= 250,
  },
  {
    id: 'ach45', name: 'The Deepwarden', slots: 3,
    line: 'Three sockets. Nobody builds them with three any more.',
    requirement: 'Forty-five achievements',
    earned: (s) => achievementCount(s) >= 45,
  },
];

export const PRIZE_BY_ID = new Map(PRIZE_SOURCES.map((p) => [p.id, p]));

/** Which prize chassis are on the rails right now. */
export function prizeDrillsHeld(state: GameState): string[] {
  return state.drills.units.map((u) => u.prize).filter((p): p is string => !!p);
}

/**
 * THE HOOK. One call, from anywhere — an achievement check, a skill node, a
 * warren choice. Idempotent per source id, so a check that runs every second
 * cannot hand out a second copy. Returns true only when a drill actually
 * arrived.
 *
 * A prize needs a RAIL. If the bay is full it is not lost — `earned` is a pure
 * read of the save, so the moment a rail frees up (or, in practice, the moment
 * the player breaches into a world where the bay is rebuilt) the same check
 * pays it again. Nothing is stored, so nothing can be dropped.
 */
export function grantPrizeDrill(state: GameState, ctx: EngineCtx, sourceId: string): boolean {
  if (!state.drills.bayBuilt) return false;
  const src = PRIZE_BY_ID.get(sourceId);
  if (!src) return false;
  if (state.drills.units.some((u) => u.prize === sourceId)) return false;
  if (state.drills.units.length >= MAX_DRILLS) return false;
  state.drills.units.push(newPrizeDrill(src.name, src.id, src.slots));
  ctx.emit({ type: 'prizeDrill', source: src.id, name: src.name, slots: src.slots });
  ctx.dirty();
  return true;
}

/** Called on the same one-second beat as the achievement check. */
export function checkPrizeDrills(state: GameState, ctx: EngineCtx): void {
  if (!state.drills.bayBuilt) return;
  for (const src of PRIZE_SOURCES) {
    if (state.drills.units.some((u) => u.prize === src.id)) continue;
    if (!src.earned(state)) continue;
    grantPrizeDrill(state, ctx, src.id);
  }
}
