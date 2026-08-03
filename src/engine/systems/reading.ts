/**
 * THE READING — the runtime behind §10.1's three nouns.
 *
 *   NOTES        earned by novelty, once each, forever. They are KNOWLEDGE, so
 *                nothing on the reset ladder takes them.
 *   PROPOSITIONS appear once you hold enough notes, and show their QUESTION and
 *                nothing else (LAW 3).
 *   PROOFS       are behavioural. `tickReading` asks each visible proposition
 *                whether the thing it is about has happened yet.
 *
 * THE ONE RULE THAT MATTERS HERE IS THAT A PROVEN ROW MUST DO SOMETHING. The
 * challenge seals are the cautionary case in this codebase: `registerChallengeLaws`
 * has zero callers, so nine seals read at fourteen live guard sites are all
 * permanently false and every one of those guards is dead code (LEDGER.md). A
 * proposition layer is the same shape — a predicate consulted from far away —
 * and would fail the same way silently.
 *
 * So `proven()` is the ONLY reader, every call site is named in
 * `PROPOSITION_SITES` below, and `reading.test.ts` asserts structurally that
 * each id has a live call site OUTSIDE this module and outside the tests. A row
 * with no wiring is a build error, not a disappointment discovered in play.
 */
import type { EngineCtx, GameState } from '../types';
import { NOTES, PROPOSITIONS, propositionById, type Tally } from '../content/shell1/reading';

export interface ReadingState {
  /** Note ids held. Novelty, so a Set semantically — an array on the save. */
  notes: string[];
  /** Proposition ids proved. */
  proven: string[];
  /** The one being worked, whose PROOF is shown. Null = none chosen. */
  working: string | null;
  /** Behavioural counters. Written only by `noteTally`. */
  tally: Partial<Record<Tally, number>>;
}

export function defaultReadingState(): ReadingState {
  return { notes: [], proven: [], working: null, tally: {} };
}

/**
 * Self-healing at every entry point, the same way `ensureCompaction` is: a save
 * written before the desk existed has no slice, and healing here rather than in
 * a migration means an older save can be loaded by a newer build without one.
 * (The migration exists too — it is the version bump that lets the save format
 * be reasoned about — but the game never depends on it having run.)
 */
export function ensureReading(state: GameState): ReadingState {
  const r = (state.reading ??= defaultReadingState());
  r.notes ??= [];
  r.proven ??= [];
  r.tally ??= {};
  if (r.working === undefined) r.working = null;
  return r;
}

/** Has this proposition been proved? THE ONLY READER — see the file header. */
export function proven(state: GameState, id: string): boolean {
  return state.reading?.proven?.includes(id) ?? false;
}

/**
 * EVERY CALL SITE, NAMED. Not documentation — `reading.test.ts` greps `src/` for
 * `proven(state, '<id>')` and fails the build if a row has no live reader, which
 * is the structural guard the challenge seals never had.
 */
export const PROPOSITION_SITES: Record<string, string> = {
  gateSight: 'systems/compaction.ts — where the digit starts showing on a cell',
  shallowHolds: 'systems/compaction.ts — decayRate, below the first gate',
  patientBank: 'systems/drills.ts — tickDrills, a machine held under its bar',
  handLed: 'systems/drills.ts — pickTarget, the CHAIN branch',
  zoneIsOrder: 'systems/drills.ts — tickDrills, the crowding term',
  oreIsRock: 'systems/drills.ts — openPockets, the rock-only refusal',
  pocketPatience: 'systems/drills.ts — openPockets, a pocket the hand has begun',
  heldBreath: 'systems/kiln.ts — tickKiln, cooling while closed',
  readStays: 'systems/roll.ts — rerollRoll, the fog',
};

// ---------------------------------------------------------------------------
// Earning
// ---------------------------------------------------------------------------

/** Grant a note, once ever. Returns true the first time only. */
export function note(state: GameState, ctx: EngineCtx, id: string): boolean {
  const r = ensureReading(state);
  if (r.notes.includes(id)) return false;
  if (!NOTES.some((n) => n.id === id)) return false; // an unauthored id is a bug
  r.notes.push(id);
  ctx.emit({ type: 'note', id, text: NOTES.find((n) => n.id === id)?.text ?? '' });
  ctx.dirty();
  return true;
}

/**
 * Count a behaviour. ONE CHOKE POINT for every proof counter, so a proof can
 * never quietly depend on a counter nothing writes — the failure that made the
 * A.53 SET ability worth exactly 1.00x while 28 tests passed.
 */
export function noteTally(state: GameState, k: Tally, n = 1): void {
  const r = ensureReading(state);
  r.tally[k] = (r.tally[k] ?? 0) + n;
}

export function tallyOf(state: GameState, k: Tally): number {
  return state.reading?.tally?.[k] ?? 0;
}

/** Notes held — what unlocks the next question. */
export function noteCount(state: GameState): number {
  return state.reading?.notes?.length ?? 0;
}

/** Propositions whose note cost is met. LAW 3: the player sees these as
 *  QUESTIONS; nothing below this line is visible at all. */
export function visiblePropositions(state: GameState): typeof PROPOSITIONS {
  const held = noteCount(state);
  return PROPOSITIONS.filter((p) => p.notes <= held);
}

/**
 * Evaluate the proofs. Called on the one-second beat — a proof reads state the
 * player has already produced, so there is nothing to miss by not checking it
 * every frame, and `PROPOSITIONS.length` predicate calls a second is free.
 *
 * ONLY THE ONE BEING WORKED IS CHECKED. That is not an optimisation; it is
 * §10.1's shape. A proof "sends you back into a system you own with new intent",
 * and intent means choosing the question first. Proving nine at once by playing
 * normally would make the desk a passive drip.
 */
export function tickReading(state: GameState, ctx: EngineCtx): void {
  const r = ensureReading(state);
  if (!r.working) return;
  if (r.proven.includes(r.working)) { r.working = null; return; }
  const def = propositionById(r.working);
  if (!def) { r.working = null; return; }
  if (def.notes > noteCount(state)) return;
  if (!def.proved(state, (k) => tallyOf(state, k))) return;
  r.proven.push(def.id);
  const done = def.id;
  r.working = null;
  ctx.emit({ type: 'proposition', id: done, rule: def.rule });
  ctx.dirty();
}
