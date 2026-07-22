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
 *  Array best-burn, Chamber best program, wells/anomaly lifetime counts,
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
import type { ActionResult, EngineCtx, GameState, ToolInstance } from '../types';
import { initialState } from '../state';
import { getTotal } from '../resources';
import { lawFlag } from '../laws';
import { AXIOM_BY_ID } from '../content/shell7/axioms';
import { purityMult } from './forge';

export const CORE_DEPTH = 40; // Aleph is short: the Core sits at 40.

/** The locked formula, on lifetime Echoes; awards the delta past the mark. */
export function axiomsFromEchoes(totalEchoes: number): number {
  return Math.floor((totalEchoes / 25) ** 0.8);
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

export function doRecursion(state: GameState, ctx: EngineCtx, replaceState: (next: GameState) => void): ActionResult {
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
  next.guild = state.guild;
  next.guild.contracts = next.guild.contracts ?? state.guild.contracts;
  state.guild.contracts.board = state.guild.contracts.board.map(() => null); // the board turns
  next.guild.crewRecalled = false;
  next.stats = state.stats; // lifetime stats and clocks are biography, not run state
  next.totals = state.totals; // lifetime totals feed formulas and quests
  // Codices — knowledge survives; boards reset below by omission.
  next.combat.seen = state.combat.seen;
  next.combat.kills = state.combat.kills;
  next.combat.stats = state.combat.stats;
  next.lattice.discovered = state.lattice.discovered;
  next.lattice.discoveredProgressions = state.lattice.discoveredProgressions;
  next.crucible.discovered = state.crucible.discovered;
  next.crucible.ranks = state.crucible.ranks;
  next.loom.discoveredShapes = state.loom.discoveredShapes;
  next.greenhouse.codex = state.greenhouse.codex;
  next.brewing.discovered = state.brewing.discovered;
  next.bench.solved = state.bench.solved;
  next.bench.equippedLens = state.bench.equippedLens;
  next.observatory.pieces = state.observatory.pieces;
  next.observatory.constellations = state.observatory.constellations;
  next.observatory.completed = state.observatory.completed;
  next.warrens.uniques = state.warrens.uniques;
  next.warrens.gearUnlocked = state.warrens.gearUnlocked;
  next.runes = state.runes;
  next.ember.bestSustainSec = state.ember.bestSustainSec;
  next.ember.passiveRank = state.ember.passiveRank;
  next.chamber.bestEfficiency = state.chamber.bestEfficiency;
  next.chamber.passiveRank = state.chamber.passiveRank;
  next.wells.rolls = state.wells.rolls;
  next.wells.wins = state.wells.wins;
  next.wells.losses = state.wells.losses;
  next.anomalies.seen = state.anomalies.seen;
  next.anomalies.resolved = state.anomalies.resolved;
  next.anomalies.merchantMeets = state.anomalies.merchantMeets;
  // Meta currencies ride; everything else washes.
  for (const id of ['scrip', 'renown', 'charter', 'axiom'] as const) {
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

  // Axioms that rewrite the beginning itself.
  if (lawFlag(next, 'structuresRemember')) {
    next.kiln.built = true;
    next.drills.bayBuilt = true;
    next.forge.built = true;
  }
  if (lawFlag(next, 'guildRemembers')) {
    next.guild.discovered = true;
    next.guild.gatesSeen = ['open', 'stalls', 'crews', 'ferrite'];
  }

  replaceState(next);
  ctx.dirty();
  ctx.emit({ type: 'recursion', count: next.recursion.count, axiomsGained: gained });
  return { ok: true, data: { count: next.recursion.count, axiomsGained: gained } };
}

export function buyAxiom(state: GameState, ctx: EngineCtx, id: string): ActionResult {
  const def = AXIOM_BY_ID.get(id);
  if (!def) return { ok: false, reason: 'No such law' };
  if (state.recursion.axioms.includes(id)) return { ok: false, reason: 'Already written' };
  const held = state.currencies['axiom'] ?? D(0);
  if (held.lt(1)) return { ok: false, reason: 'One Axiom, and you have none to spend' };
  state.currencies['axiom'] = held.sub(1);
  state.recursion.axioms.push(id);
  ctx.dirty();
  ctx.emit({ type: 'axiomBought', id, heresy: def.heresy === true });
  return { ok: true };
}

export function defaultRecursionState(): GameState['recursion'] {
  return { count: 0, axioms: [], axiomsEarned: 0, leftBehind: null };
}
