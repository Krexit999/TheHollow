/**
 * THE CASTING FLOOR — SPECIFYING (§31.2), the world-authoring half.
 *
 * §13: "CASTING FLOOR ★ · SPECIFYING · author a world (§31) · Seats V–VII".
 * §31.1: post-Recursion 1, the unit of concern becomes "the specification —
 * what world do I need to make".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT IS NOT A NEW MACHINE. `casting.ts` IS the Casting Floor and has been since
 * v36 — the crucible, the moulds, the rack, the tool station. §13's row is one
 * machine with two capabilities, and the second one was never built. So this
 * adds a VERB to a floor that exists rather than a construction event in front
 * of it, which is the same ruling this brief made about the Rune Bench.
 *
 * The gate is §31.1's own: SPECIFYING opens after the first Recursion. Nothing
 * else gates it, and nothing is bought.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * §31.2 SHIPS TWO THINGS AND SO DOES THIS:
 *
 *   BANDS    0–40 · 41–90 · 91–150, each assigned a shell's physics
 *   DEFECT   one, mandatory, chosen from what the Floor offers
 *
 * WHAT A POURED WORLD ACTUALLY DOES, because "a live world with its physics in
 * the wrong places" has to mean something a player can feel:
 *
 *   1. THE CONDITION RULE AT YOUR DEPTH COMES FROM THE BAND (§7.2's E2), not
 *      from the shell you are standing in. Work at depth 20 in a world whose
 *      shallow band is Cinder and your machines BAKE, in Loam. That is the most
 *      literal reading of "physics in the wrong places" available, and it lands
 *      on a system that is already built, already legible and already
 *      pillar-2-clean.
 *   2. THE DEFECT COSTS, every one of them, through a seam that already exists.
 *   3. SEATS V, VI AND VII WANT ONE. §31: "the last three Seats are only
 *      obtainable from a world you specified", and §13's own row says so.
 *
 * THE GRAMMAR IS DISCOVERED, NOT LISTED (§31.2's "Kept"). Three rules, each
 * derived rather than tabulated, each learned by being refused — and the
 * refusal is written into `spec.learned`, which is the endgame's Codex. §31's
 * own example is rule 1.
 *
 * PILLAR 2. A band ROUTES which rule runs where; it cannot grant a signature
 * you do not hold and it writes nothing to `cellCap`, `cellRegen` or
 * `chipYield`. Every defect only ever TAKES. `specify.test.ts` pours the
 * harshest legal world and reads the ceiling unmoved at the same depth.
 *
 * FIVE DEFECTS, NOT SIX, AND THE DIFFERENCE IS THE SAME RULE THE AXIOMS FOLLOW:
 * each one below has a live reader, named in its `bites` field and asserted by
 * a test. §31 lists six. FOUR shipped at A.97; the fifth — the crew-facing one —
 * was ledgered as having "no seam in this build to bite on" because crews did
 * not exist. **They have since A.99**, so NOTHING DOWN THERE ANSWERS is authored
 * here and the row is closed. The sixth stays cut: "no journals" was already cut
 * by §43, and a defect that costs nothing is not a defect.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { allShells, currentShell, shellDefOrNull } from '../shells';

// ---------------------------------------------------------------------------
// The bands
// ---------------------------------------------------------------------------

/** §31.2's table, kept exactly. Three bands, and the last one ends the world. */
export const BANDS: Array<{ from: number; to: number }> = [
  { from: 0, to: 40 },
  { from: 41, to: 90 },
  { from: 91, to: 150 },
];

export function bandOfDepth(depth: number): number {
  for (let i = 0; i < BANDS.length; i++) {
    if (depth >= BANDS[i]!.from && depth <= BANDS[i]!.to) return i;
  }
  return BANDS.length - 1;                 // below 150 the deepest band holds
}

// ---------------------------------------------------------------------------
// The defects
// ---------------------------------------------------------------------------

export const DEFECTS = ['hardwalls', 'halfdraw', 'coldroll', 'quickrot', 'blindcrews'] as const;
export type DefectId = (typeof DEFECTS)[number];

export interface DefectDef {
  id: DefectId;
  name: string;
  /** What it costs, said plainly. */
  costs: string;
  /** The seam it bites on — named so a test can check something reads it. */
  bites: string;
  /** Is this defect about a system this player actually uses? §31.2's rule. */
  shown: (s: GameState) => boolean;
}

export const DEFECT_DEFS: DefectDef[] = [
  {
    id: 'hardwalls', name: 'Every wall is one hardness higher',
    costs: 'Every hardness wall in the world asks for one tier more than it should.',
    bites: 'requiredTier',
    shown: (s) => (s.maxDepthRecord ?? 0) >= 40,
  },
  {
    id: 'halfdraw', name: 'Draw is halved',
    costs: 'The plant makes half the Flow and holds half the Surge it should.',
    bites: 'flowCap',
    shown: (s) => Object.keys(s.plant?.tiers ?? {}).length > 0,
  },
  {
    id: 'coldroll', name: 'Nothing ever moves',
    costs: 'The Roll never re-rolls. What a station holds, it holds forever.',
    bites: 'rerollRoll',
    shown: (s) => (s.roll?.rolls ?? 0) > 0,
  },
  {
    id: 'quickrot', name: 'The world writes fast',
    costs: 'Conditions write themselves onto your machines twice as quickly.',
    bites: 'conditionRate',
    shown: (s) => Object.keys(s.plant?.condition ?? {}).length > 0
      || Object.keys(s.plant?.tiers ?? {}).length > 0,
  },
  /**
   * §31'S CREW-FACING DEFECT (authored A.101, unblocked when crews shipped).
   *
   * A specified world has its physics in the wrong places, so a circuit written
   * against a real shell is written against nothing. A crew can still WALK — it
   * is not disabled, which would be removing a system rather than costing you
   * one — but it can no longer make a CALL anywhere, so every seam it passes
   * comes back as a finding it could not resolve and its six slots fill with
   * work you have to do yourself.
   *
   * WHY IT COSTS, in the same shape as the other four: it takes a capability
   * you have, and the thing it takes is exactly the thing crews are FOR. A
   * player who has never sent one down is never offered it (`shown`).
   */
  {
    id: 'blindcrews', name: 'Nothing down there answers',
    costs: 'Your circuits mean nothing here. No crew can make a call, at any station.',
    bites: 'crewsBlind',
    shown: (s) => (s.crews?.crews?.length ?? 0) > 0,
  },
];

export const DEFECT_BY_ID = new Map(DEFECT_DEFS.map((d) => [d.id, d]));

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SpecState {
  /** Shell id per band, or null for an unassigned band. */
  bands: Array<string | null>;
  defect: DefectId | null;
  /** Is a specified world LIVE right now? */
  live: boolean;
  /** Worlds this save has poured. */
  poured: number;
  /** Grammar rules the Floor has refused you — §31.2's endgame Codex. */
  learned: string[];
}

export function defaultSpecState(): SpecState {
  return { bands: [null, null, null], defect: null, live: false, poured: 0, learned: [] };
}

export function ensureSpec(state: GameState): SpecState {
  const s = (state.spec ??= defaultSpecState());
  if (!Array.isArray(s.bands) || s.bands.length !== BANDS.length) s.bands = [null, null, null];
  s.defect ??= null;
  s.live ??= false;
  s.poured ??= 0;
  s.learned ??= [];
  return s;
}

/** §31.1: the specification is the unit of concern AFTER the first Recursion. */
export function specifyingOpen(state: GameState): boolean {
  return (state.recursion?.count ?? 0) >= 1;
}

/** Shells whose physics may be assigned — every shell with a signature. */
export function assignable(): string[] {
  return allShells().filter((s) => !!s.signatureId).map((s) => s.id);
}

// ---------------------------------------------------------------------------
// The grammar — three rules, learned by being refused
// ---------------------------------------------------------------------------

export interface GrammarRule {
  id: string;
  /** What the Floor says when it refuses. This IS the Codex entry. */
  says: string;
  /** Null if the arrangement is legal. */
  breaks: (bands: Array<string | null>) => boolean;
}

export const GRAMMAR: GrammarRule[] = [
  {
    id: 'absenceNeedsSomething',
    says: 'Absence needs something to be absent from. It cannot be the shallowest band.',
    breaks: (b) => (b[0] ? shellDefOrNull(b[0])?.signatureId === 'absence' : false),
  },
  {
    id: 'pressureNeedsUp',
    says: 'Heat has to rise into something. Pressure cannot be the deepest band.',
    breaks: (b) => {
      const last = b[b.length - 1];
      return last ? shellDefOrNull(last)?.signatureId === 'pressure' : false;
    },
  },
  {
    id: 'noShellTwice',
    says: 'A world made of one physics is not a world. Each band takes a different shell.',
    breaks: (b) => {
      const set = b.filter((x): x is string => !!x);
      return new Set(set).size !== set.length;
    },
  },
];

/** What the grammar would refuse about this arrangement, or null. */
export function grammarBreak(bands: Array<string | null>): GrammarRule | null {
  return GRAMMAR.find((r) => r.breaks(bands)) ?? null;
}

/** Learn a rule by being refused it. Idempotent. */
function learn(state: GameState, ruleId: string): void {
  const s = ensureSpec(state);
  if (!s.learned.includes(ruleId)) s.learned.push(ruleId);
}

// ---------------------------------------------------------------------------
// Writing the specification
// ---------------------------------------------------------------------------

export function setBandBlocker(state: GameState, band: number, shellId: string | null): string | null {
  if (!specifyingOpen(state)) return 'The Floor does not specify a world until you have made one over.';
  if (ensureSpec(state).live) return 'A world is live. It has to end before you write another.';
  if (band < 0 || band >= BANDS.length) return 'No such band.';
  if (shellId !== null && !assignable().includes(shellId)) return 'That has no physics to lend.';
  const trial = [...ensureSpec(state).bands];
  trial[band] = shellId;
  const broke = grammarBreak(trial);
  if (broke) {
    learn(state, broke.id);
    return broke.says;
  }
  return null;
}

export function setBand(
  state: GameState, ctx: EngineCtx, band: number, shellId: string | null,
): ActionResult {
  const blocked = setBandBlocker(state, band, shellId);
  if (blocked) {
    ctx.dirty();                                  // the refusal IS the Codex entry
    return { ok: false, reason: blocked };
  }
  ensureSpec(state).bands[band] = shellId;
  ctx.dirty();
  return { ok: true, data: { band, shellId } };
}

export function offeredDefects(state: GameState): DefectDef[] {
  if (!specifyingOpen(state)) return [];
  return DEFECT_DEFS.filter((d) => d.shown(state));
}

export function setDefect(state: GameState, ctx: EngineCtx, id: DefectId | null): ActionResult {
  if (!specifyingOpen(state)) return { ok: false, reason: 'The Floor does not specify a world yet.' };
  if (ensureSpec(state).live) return { ok: false, reason: 'A world is live.' };
  if (id !== null && !offeredDefects(state).some((d) => d.id === id)) {
    return { ok: false, reason: 'That defect is about something you do not do.' };
  }
  ensureSpec(state).defect = id;
  ctx.dirty();
  return { ok: true, data: { defect: id } };
}

// ---------------------------------------------------------------------------
// Pouring it
// ---------------------------------------------------------------------------

export function specPourBlocker(state: GameState): string | null {
  if (!specifyingOpen(state)) return 'The Floor does not specify a world until you have made one over.';
  const s = ensureSpec(state);
  if (s.live) return 'One is already live. End it first.';
  const empty = s.bands.findIndex((b) => !b);
  if (empty >= 0) return `Band ${BANDS[empty]!.from}–${BANDS[empty]!.to} has no physics in it.`;
  if (!s.defect) return 'Every world you pour has one thing wrong with it. Choose which.';
  const broke = grammarBreak(s.bands);
  if (broke) { learn(state, broke.id); return broke.says; }
  return null;
}

export function pourSpecified(state: GameState, ctx: EngineCtx): ActionResult {
  const blocked = specPourBlocker(state);
  if (blocked) return { ok: false, reason: blocked };
  const s = ensureSpec(state);
  s.live = true;
  s.poured += 1;
  ctx.dirty();
  ctx.emit({ type: 'worldSpecified', bands: [...s.bands] as string[], defect: s.defect! });
  return { ok: true, data: { bands: [...s.bands], defect: s.defect, poured: s.poured } };
}

/** Walk out of it. The spec stays written; only the world stops. */
export function endSpecified(state: GameState, ctx: EngineCtx): ActionResult {
  const s = ensureSpec(state);
  if (!s.live) return { ok: false, reason: 'Nothing is live.' };
  s.live = false;
  ctx.dirty();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// What a live specified world DOES — the four readers
// ---------------------------------------------------------------------------

export function specLive(state: GameState): boolean {
  return state.spec?.live === true;
}

export function defectLive(state: GameState, id: DefectId): boolean {
  return specLive(state) && state.spec?.defect === id;
}

/**
 * WHOSE PHYSICS RUN AT THIS DEPTH. Null outside a live specified world, which
 * is the hot path and the answer for every save that has never poured one.
 *
 * It can only ever name a shell that EXISTS; it grants nothing, and the caller
 * decides what to do with the name. `condition.ts` is the one live consumer.
 */
export function physicsAt(state: GameState, depth: number): string | null {
  if (!specLive(state)) return null;
  const id = state.spec?.bands?.[bandOfDepth(depth)] ?? null;
  return id && shellDefOrNull(id) ? id : null;
}

/** The shell whose CONDITION RULE applies — the band's, or the one you stand in. */
export function conditionShellId(state: GameState): string {
  return physicsAt(state, state.depth ?? 0) ?? currentShell(state).id;
}

/** DEFECT: every wall asks one tier more. Read by `requiredTier`. */
export function wallSurcharge(state: GameState): number {
  return defectLive(state, 'hardwalls') ? 1 : 0;
}

/** DEFECT: the plant makes half of everything. Read by `flowCap`/`surgeCap`. */
export function drawShare(state: GameState): number {
  return defectLive(state, 'halfdraw') ? 0.5 : 1;
}

/** DEFECT: the Roll is frozen. Read by `rerollRoll`. */
export function rollFrozen(state: GameState): boolean {
  return defectLive(state, 'coldroll');
}

/** DEFECT: conditions write twice as fast. Read by `tickCondition`. */
export function conditionRate(state: GameState): number {
  return defectLive(state, 'quickrot') ? 2 : 1;
}

/** DEFECT: a circuit is worth nothing here. Read by `crews.findingAt`. */
export function crewsBlind(state: GameState): boolean {
  return defectLive(state, 'blindcrews');
}

// ---------------------------------------------------------------------------
// What the panel says — the UI computes nothing
// ---------------------------------------------------------------------------

export function specRead(state: GameState): {
  open: boolean; live: boolean; poured: number;
  rows: Array<{ band: number; from: number; to: number; shellId: string | null; name: string }>;
  defect: DefectId | null; defects: Array<{ id: DefectId; name: string; costs: string; on: boolean }>;
  learned: string[]; pour: string | null; assignable: Array<{ id: string; name: string }>;
} {
  const s = ensureSpec(state);
  return {
    open: specifyingOpen(state),
    live: s.live,
    poured: s.poured,
    rows: BANDS.map((b, i) => ({
      band: i, from: b.from, to: b.to,
      shellId: s.bands[i] ?? null,
      name: s.bands[i] ? (shellDefOrNull(s.bands[i]!)?.name ?? s.bands[i]!) : 'nothing yet',
    })),
    defect: s.defect,
    defects: offeredDefects(state).map((d) => ({
      id: d.id, name: d.name, costs: d.costs, on: s.defect === d.id,
    })),
    learned: GRAMMAR.filter((r) => s.learned.includes(r.id)).map((r) => r.says),
    pour: specPourBlocker(state),
    assignable: assignable().map((id) => ({ id, name: shellDefOrNull(id)?.name ?? id })),
  };
}
