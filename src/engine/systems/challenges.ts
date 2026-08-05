/**
 * RUNNING AN INVERSION — start, abandon, finish, keep.
 *
 * The whole layer is four verbs and one field. `spiral.activeChallenge` says
 * which rules are bent right now (laws.ts reads it and nothing else does);
 * `spiral.challengeDone` is both the completion record AND the grant store,
 * which is deliberate — two lists would be two things to fall out of step, and
 * this codebase has shipped that bug (the seals themselves, a registry with a
 * writer and nothing that reached it).
 *
 * WHERE IT OPENS. §21's locked ladder puts challenges at the SPIRAL — "Spiral:
 * challenges, parallel shells, Automation Grid" — and that is where the gate
 * sits, unmoved. It reads late, and it is not: a Spiral rebuilds the world from
 * `initialState` and hands back a seven-shell climb, so the inversions are the
 * layer that makes the SECOND life differently shaped rather than merely
 * faster. Every grant below is worth something on a re-climb and nothing at all
 * on the run that earned it, which is the correct direction for a reward that
 * costs you a run to get.
 *
 * WHAT IT COSTS. Nothing up front, and that is not an oversight. LAW 9: a
 * challenge you must pay to attempt is a toll. What a run costs is the run —
 * the ground you make under a seal is ground made slowly, and abandoning
 * spends that and buys nothing. `abandonLine` says so in the panel BEFORE the
 * button, because a cost you find out about afterwards is a trap.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { CHALLENGES, CHALLENGE_BY_ID, type ChallengeDef } from '../content/challenges';
import { ALL_GRANTS, keptLaw, type ChallengeGrant } from '../laws';

/** §21.4: the Spiral is where the inversions live. */
export function challengesOpen(state: GameState): boolean {
  return (state.spiral?.count ?? 0) >= 1;
}

export function activeDef(state: GameState): ChallengeDef | null {
  const id = state.spiral?.activeChallenge?.id;
  return id ? CHALLENGE_BY_ID.get(id as ChallengeGrant) ?? null : null;
}

/** The depth this run has to reach for the challenge to be won. */
export function targetDepth(state: GameState): number {
  const a = state.spiral?.activeChallenge;
  const def = activeDef(state);
  if (!a || !def) return 0;
  return a.startDepth + def.descend;
}

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

export function challengeBlocker(state: GameState, id: string): string | null {
  if (!challengesOpen(state)) return 'The Spiral is not wound. There is nothing to invert yet.';
  const def = CHALLENGE_BY_ID.get(id as ChallengeGrant);
  if (!def) return 'No such inversion.';
  if (state.spiral.activeChallenge) {
    const running = activeDef(state);
    return `${running?.name ?? 'A run'} is already under way. One set of rules at a time.`;
  }
  // A kept grant is kept. Re-running it would be a run under a seal for a thing
  // you already hold, which is a toll wearing a reward's clothes.
  if (keptLaw(state, def.id)) return 'You have already kept this one.';
  return def.requires?.(state) ?? null;
}

export function startChallenge(state: GameState, ctx: EngineCtx, id: string): ActionResult {
  const blocked = challengeBlocker(state, id);
  if (blocked) return { ok: false, reason: blocked };
  const def = CHALLENGE_BY_ID.get(id as ChallengeGrant)!;
  state.spiral.activeChallenge = {
    id: def.id,
    startedAtPlaySec: state.stats.playTimeSec,
    startDepth: state.depth,
    best: state.depth,
  };
  ctx.dirty();
  ctx.emit({ type: 'challengeStarted', id: def.id });
  return { ok: true, data: { id: def.id, target: state.depth + def.descend } };
}

// ---------------------------------------------------------------------------
// Abandoning — honest about both halves
// ---------------------------------------------------------------------------

/**
 * WHAT WALKING AWAY COSTS AND WHAT IT KEEPS, in one sentence, shown before the
 * button and not after it. The cost is never a currency: it is the ground you
 * made under a seal, which was slower ground than the same depths cost anyone
 * not running one.
 */
export function abandonLine(state: GameState): string | null {
  const a = state.spiral?.activeChallenge;
  const def = activeDef(state);
  if (!a || !def) return null;
  const made = Math.max(0, a.best - a.startDepth);
  const mins = Math.max(0, Math.round((state.stats.playTimeSec - a.startedAtPlaySec) / 60));
  const short = Math.max(0, def.descend - made);
  return `Costs: this attempt, and the ${made} depth${made === 1 ? '' : 's'} of ground you made `
    + `under the seal over ${mins} minute${mins === 1 ? '' : 's'} — ${short} short. `
    + 'Keeps: everything. Every material, machine, drift and level you earned while it ran '
    + 'stays exactly where it is, and the rules come back the moment you let go.';
}

export function abandonChallenge(state: GameState, ctx: EngineCtx): ActionResult {
  const a = state.spiral?.activeChallenge;
  if (!a) return { ok: false, reason: 'Nothing is running.' };
  const line = abandonLine(state)!;
  state.spiral.activeChallenge = null;
  ctx.dirty();
  ctx.emit({ type: 'challengeAbandoned', id: a.id });
  return { ok: true, data: { id: a.id, line } };
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

/**
 * Called from the engine tick — the one live call site. Depth moves through
 * several paths (descend, multi-descend, a drift fall, a Collapse taking it
 * back to zero) and watching the state each beat is the only reading that
 * cannot be routed around by one of them.
 */
export function tickChallenges(state: GameState, ctx: EngineCtx): void {
  const a = state.spiral?.activeChallenge;
  if (!a) return;
  const def = CHALLENGE_BY_ID.get(a.id as ChallengeGrant);
  if (!def) {
    // A save carrying a challenge this build no longer authors. Let it go
    // rather than leaving the run under rules nothing can describe.
    state.spiral.activeChallenge = null;
    return;
  }
  if (state.depth > a.best) a.best = state.depth;
  if (a.best < a.startDepth + def.descend) return;

  state.spiral.activeChallenge = null;
  if (!state.spiral.challengeDone.includes(def.id)) state.spiral.challengeDone.push(def.id);
  ctx.dirty();
  ctx.emit({ type: 'challengeDone', id: def.id });
}

// ---------------------------------------------------------------------------
// What the room shows
// ---------------------------------------------------------------------------

export interface ChallengeRow {
  id: ChallengeGrant;
  name: string;
  line: string;
  grant: string;
  descend: number;
  /** Kept forever. */
  done: boolean;
  running: boolean;
  blocked: string | null;
}

export function challengesRead(state: GameState): {
  open: boolean;
  rows: ChallengeRow[];
  kept: number;
  running: { name: string; at: number; target: number; abandon: string } | null;
} {
  const a = state.spiral?.activeChallenge ?? null;
  const def = activeDef(state);
  return {
    open: challengesOpen(state),
    kept: ALL_GRANTS.filter((g) => keptLaw(state, g)).length,
    rows: CHALLENGES.map((c) => ({
      id: c.id,
      name: c.name,
      line: c.line,
      grant: c.grant,
      descend: c.descend,
      done: keptLaw(state, c.id),
      running: a?.id === c.id,
      blocked: challengeBlocker(state, c.id),
    })),
    running: a && def
      ? {
        name: def.name,
        at: Math.max(a.best, state.depth),
        target: a.startDepth + def.descend,
        abandon: abandonLine(state) ?? '',
      }
      : null,
  };
}
