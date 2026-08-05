/**
 * RECURSION — reset layer 3. Reach the Core; the world starts over and you
 * do not. Implemented as a CONTROLLED REBIRTH: a fresh initialState() with
 * the survive-ledger copied across — the one honest way to reset "all
 * shells" without a hundred hand-written field resets drifting out of sync
 * as shells were added.
 *
 * THE RECURSION LEDGER (A.19; DESIGN survive-list plus its natural kin):
 *  SURVIVES — depth records (every prestige formula feeds on them), Delver
 *  XP/skills, achievements, the Guild wholesale (rep, Vess's ledger, titles,
 *  hirelings — the fallen stay fallen — Sable's found/translated pages),
 *  every CODEX (bestiary seen/kills, chords + progressions discovered,
 *  alloys discovered + ranks, strains, brews, loom shapes, lenses solved,
 *  star charts, rune grammar + found runes + inscriptions, warren uniques,
 *  Array best-burn, Chamber best program, wells lifetime counts,
 *  lifetime stats and totals), meta currencies (Scrip, Renown, Charter,
 *  Axioms), and the Axioms owned.
 *  TOOLS SURVIVE AS HEIRLOOMS (ruling): name, purity, gems, and alloys kept;
 *  tier blunted to the Shell I ladder with a whisper of former edge.
 *  RESETS — shells to Loam, Breaches, carried signatures, Echoes and
 *  Resonant Memory, ALL run currencies, materials/gems/geodes, gear, face
 *  upgrades, structures (unless The First Word), boards' physical state
 *  (lattice cells and rings, loom threads, mycelium, greenhouse plots,
 *  vent pipes, ember grate), depth, wardens felled, contracts board.
 */
import { D } from '../decimal';
import { axiomsForEchoes } from '../prestigeMath';
import { keptSignatures } from './seats';
import { carryBequests, markPoured, pourBlocker } from './seating';
import type { ActionResult, EngineCtx, GameState, ToolInstance } from '../types';
import { initialState } from '../state';
import { getTotal } from '../resources';
import { lawFlag } from '../laws';
import { purityMult } from './forge';

export const CORE_DEPTH = 40; // Aleph is short: the Core sits at 40.

/**
 * The locked formula, on lifetime Echoes; awards the delta past the mark.
 *
 * TWO COPIES, AND THE TESTED ONE WAS THE DEAD ONE (found A.44). This function
 * carried its own hardcoded `(E/25)^0.8` while `prestigeMath.axiomsForEchoes`
 * held an identical copy — and `axiomsForEchoes` was referenced by NOTHING but
 * the "prestige formulas (locked)" test suite. So the whole project has been
 * asserting the axiom curve against a function the game does not call, while
 * `doRecursion` and the Hollow panel granted from this one. Re-rating the
 * prestigeMath copy changed no behaviour whatsoever.
 *
 * That is the "a test that a function works is not a test that anything calls
 * it" rule in its nastiest form: not a dead system, a LIVE system shadowed by
 * a dead twin, where the tests guard the twin. Now delegated — one formula,
 * one place, and the suite that guards it guards the live path.
 */
export function axiomsFromEchoes(totalEchoes: number): number {
  return axiomsForEchoes(D(totalEchoes)).toNumber();
}

export function canRecurse(state: GameState): boolean {
  return state.shell.current === 'aleph' && state.aleph.coreTouched;
}

/** Blunt a tool to the Shell I ladder, keeping what was authored into it. */
function heirloom(t: ToolInstance): ToolInstance {
  const former = Math.max(t.formerTier ?? 0, t.tier);
  // HEIRLOOM HISTORY (v22): surviving a Recursion is a mark the tool keeps.
  const history = t.history?.includes('recursion') ? t.history : [...(t.history ?? []), 'recursion'];
  return {
    ...t,
    tier: 1,
    heirloom: true,
    formerTier: former,
    history,
    // Tier-1 baseline (the Delver's Pick: 1 chip / 3 strike), purity kept,
    // plus a whisper of the edge it used to hold.
    chipPower: Math.round(1 * purityMult(t.purity) * (1 + 0.05 * Math.min(15, former)) * 100) / 100,
    strikePower: Math.round(3 * purityMult(t.purity) * (1 + 0.05 * Math.min(15, former)) * 100) / 100,
  };
}

export function doRecursion(
  state: GameState, ctx: EngineCtx, replaceState: (next: GameState) => void,
  /**
   * THE POUR (§13, THE SEATING). The terminal craft is NOT a new rung on the
   * locked ladder — it is this reset, gated on a finished frame and recorded.
   * `pourBlocker` owns the gate; everything below is the Recursion it already
   * was, unchanged.
   */
  pour = false,
): ActionResult {
  if (pour) {
    const blocked = pourBlocker(state);
    if (blocked) return { ok: false, reason: blocked };
  }
  if (!canRecurse(state)) return { ok: false, reason: 'The Core has not been touched' };

  const totalEchoes = getTotal(state, 'echo').toNumber();
  const target = axiomsFromEchoes(totalEchoes);
  const gained = Math.max(0, target - state.recursion.axiomsEarned);

  const next = initialState(state.stats.lastSavedAt);

  // --- The survive-ledger -------------------------------------------------
  next.depthRecords = { ...state.depthRecords };
  next.maxDepthRecord = state.maxDepthRecord;
  next.delver = state.delver;
  next.achievements = state.achievements;
  next.stats = state.stats; // lifetime stats and clocks are biography, not run state
  next.totals = state.totals; // lifetime totals feed formulas and quests
  // Codices — knowledge survives; boards reset below by omission.
  next.runes = state.runes;
  // Meta currencies ride; everything else washes. Resonance rides too (Part B
  // export spine): every Axiom is written IN it, and what you banked listening
  // in the old world's Hollow must be spendable on the new world's laws — or
  // the toll would wall off the Rewrite it exists to feed.
  for (const id of ['scrip', 'renown', 'charter', 'axiom', 'resonance'] as const) {
    next.currencies[id] = state.currencies[id] ?? D(0);
  }
  // Tools: heirlooms. The pack is never empty; the pick remembers your hand.
  next.forge.tools = state.forge.tools.map(heirloom);
  next.forge.equipped = Math.min(state.forge.equipped, next.forge.tools.length - 1);
  next.forge.nextId = state.forge.nextId;
  // The Rewrite is permanent.
  next.recursion = {
    count: state.recursion.count + 1,
    axioms: [...state.recursion.axioms],
    axiomsEarned: state.recursion.axiomsEarned + gained,
    leftBehind: null,
  };
  next.currencies['axiom'] = (next.currencies['axiom'] ?? D(0)).add(gained);
  next.totals['axiom'] = (next.totals['axiom'] ?? D(0)).add(gained);

  /**
   * THE SEATS RIDE, AND THEY BRING THEIR SIGNATURES (§4, A.97).
   *
   * A Seat is "seated permanently"; the Recursion is the only reset that would
   * otherwise take it, and a terminal craft you have to restart every Recursion
   * is not a terminal craft. So the frame carries — and so does what it pays:
   * §31.1 calls this era "the inheritance", and a seated Seat hands that
   * shell's signature forward into a world that begins at Shell I with none.
   *
   * REACH, NOT RATE. A carried signature is exactly what a Breach already
   * grants; nothing here changes what one produces.
   */
  next.seats = state.seats;
  const kept = keptSignatures(next);
  if (kept.length > 0) {
    next.shell.signatures = [...new Set([...(next.shell.signatures ?? []), ...kept])];
  }

  /**
   * ...AND THE SEATING'S BEQUESTS (§31.1, "the inheritance"). Every one is a
   * fact about a world you already changed — a wreck already looted, a wall
   * already broken, a band already timbered, a machine already built — handed
   * forward rather than made again. `seating.ts` owns which; this owns when.
   */
  const carried = carryBequests(state, next);

  // Axioms that rewrite the beginning itself.
  if (lawFlag(next, 'structuresRemember')) {
    next.kiln.built = true;
    next.drills.bayBuilt = true;
    next.forge.built = true;
  }

  const poured = pour ? markPoured(next) : 0;

  replaceState(next);
  ctx.dirty();
  ctx.emit({ type: 'recursion', count: next.recursion.count, axiomsGained: gained });
  if (pour) ctx.emit({ type: 'worldPoured', poured, carried });
  return { ok: true, data: { count: next.recursion.count, axiomsGained: gained, poured, carried } };
}

// A.7x: Axioms (the content that buyAxiom wrote) are gone. Recursion's own
// ledger (count, carry-forward) stands untouched.

export function defaultRecursionState(): GameState['recursion'] {
  return { count: 0, axioms: [], axiomsEarned: 0, leftBehind: null };
}
