/**
 * Collapse — the first reset layer. Cores = floor(2 * (Depth/40)^1.5).
 * Resets: face upgrades (those tagged resetsOnCollapse), shell-tier
 * currencies, depth, kiln heat/progress. Structures persist: the Kiln stays
 * built, the Drill Bay keeps its drills and their levels (interpretation
 * flagged in DESIGN.md appendix — 30-60 collapses/shell would otherwise
 * make the player re-buy 24 drills every few minutes).
 */
import { D } from '../decimal';
import type { ModifierCache } from '../modifiers';
import { addCurrency, allCurrencies } from '../resources';
import { allUpgrades, stat } from '../upgrades';
import type { ActionResult, CollapseType, EngineCtx, GameState } from '../types';
import { coresForDepth } from '../prestigeMath';
import { coreNodeLevel } from '../content/shell1/coreTree';
import { applyFieldSize, cellCap } from './face';
import { grantXP } from './xp';
import { runFaceReset } from '../signatures';
import { resetCompaction } from './compaction';
import { rerollRoll } from './roll';
import { clearSamples } from './assayBench';
import { clampPacked, holdFloor } from './shopFork';
import { lawNum } from '../laws';
import { shaftPeak, resetShaftRun } from './shaftSys';

/** Levels every resetting face upgrade is kept AT through a Collapse (the floor
 *  the fall leaves behind): 4 per Momentum core-node rank, or the Gentle Fall
 *  law's flat 20, whichever is stronger. The CARRY-ONE mark keeps one upgrade
 *  ABOVE this floor, at its full level. Exported so the UI can price the choice
 *  with the same number the engine uses. */
export function collapseRetained(state: GameState): number {
  return Math.max(4 * coreNodeLevel(state, 'momentum'), lawNum(state, 'collapseRetain'));
}

export function collapsePreview(state: GameState): ReturnType<typeof coresForDepth> {
  return coresForDepth(shaftPeak(state));
}

/**
 * THE THREE FALLS (A.45). What the cave-in spares, chosen in one click.
 *
 * The Collapse is the most repeated screen in the game — MEASURED at 24-37 per
 * Loam arc, which is what ranked it first in the A.44 interaction audit — and
 * it was a confirm dialog. A choice here has to cost no time at all, so this is
 * three buttons, not a modal, and the middle one is what the button always did.
 *
 * DELIBERATELY CORE-NEUTRAL. Every fall pays the same Cores. The A.44 pass
 * spent a whole checkpoint sizing the Core faucet against the real cadence, and
 * a fall type that moved the payout would silently re-open it. What moves is
 * the SHAPE OF THE NEXT OPENING — which is the thing a player who falls thirty
 * times an arc actually feels, and the thing the Momentum Pass was about.
 *
 *   clean   what the button has always done. Bit-for-bit, so every pacing
 *           number measured before this still describes the default player.
 *   braced  the props hold: DOUBLE the retained upgrade levels — but the kiln
 *           goes stone cold and the fresh face comes back half full.
 *   ember   the fire keeps: ALL kiln heat and a full face — but nothing is
 *           retained, every resetting upgrade goes to zero.
 */
export interface FallShape {
  id: CollapseType;
  name: string;
  /** Multiplier on the retained face-upgrade floor. */
  retainMult: number;
  /** Multiplier on kiln heat kept, ON TOP of Ember Memory. 1 = keep it all. */
  heatKeep: number | 'node';
  /** Fraction of cell cap the rebuilt face starts at. */
  faceFill: number;
  blurb: string;
}

export const FALLS: FallShape[] = [
  {
    id: 'clean', name: 'Clean Fall', retainMult: 1, heatKeep: 'node', faceFill: 1,
    blurb: 'It comes down the way it always does.',
  },
  {
    id: 'braced', name: 'Braced Fall', retainMult: 2, heatKeep: 0, faceFill: 0.5,
    blurb: 'You shore the props first. Twice the work survives — the kiln dies and the rock comes back thin.',
  },
  {
    id: 'ember', name: 'Ember Fall', retainMult: 0, heatKeep: 1, faceFill: 1,
    blurb: 'You save the fire and let the rest go. Full heat, full rock, nothing else kept.',
  },
];

/** How many marks the column keeps. A save is not a log file. */
export const TRACE_LIMIT = 40;

export const fallShape = (id: CollapseType): FallShape =>
  FALLS.find((f) => f.id === id) ?? FALLS[0]!;

export function doCollapse(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  auto = false,
  fall: CollapseType = 'clean',
): ActionResult {
  const shape = fallShape(fall);
  // THE SHAFT: the fall pays out on the DEEPEST point reached this run, so
  // climbing up your own column to fetch something never costs you the Collapse.
  const peak = shaftPeak(state);
  // Resonant Core (tranche 2): the fall rings louder each time.
  const cores = coresForDepth(peak)
    .mul(1 + 0.1 * coreNodeLevel(state, 'resonantCore'))
    .floor();
  if (cores.lt(1)) {
    return { ok: false, reason: 'The shaft would yield no Cores. Descend deeper (depth 26+).' };
  }
  const depthAtCollapse = peak;

  // Momentum core node: retain up to 4 levels of each face upgrade per rank.
  // THE GENTLE FALL (law) retains 20 regardless — the stronger memory wins.
  const retained = Math.round(collapseRetained(state) * shape.retainMult);
  // CARRY ONE (Phase 21): one marked face upgrade keeps its full level through
  // this fall. Non-stacking, and the mark is spent here. Sim-bounded — see
  // scripts/carry-verify.ts: one upgrade can never take return-to-peak under 10%.
  const carry = state.qol.carryUpgradeId;
  // What the carry saved — recorded for the run summary so the choice is legible
  // after the fall, not just before. Captured before the reset loop runs.
  let carriedInfo: { name: string; levels: number } | undefined;
  if (carry) {
    const cdef = allUpgrades().find((u) => u.id === carry);
    if (cdef) carriedInfo = { name: cdef.name, levels: Math.max(0, stat(state, cdef.id) - retained) };
  }
  for (const def of allUpgrades()) {
    if (!def.resetsOnCollapse) continue;
    if (def.id === carry) continue; // carried — untouched by the fall
    const level = stat(state, def.id);
    state.upgrades[def.id] = Math.min(level, retained);
  }
  state.qol.carryUpgradeId = null;
  // The fall clamped every row to its floor; the PACKED tally is a subset of a
  // level count and must not outlive the levels it counts.
  clampPacked(state);

  // Shell-local currencies wash away.
  for (const cur of allCurrencies()) {
    if (cur.resetsOnCollapse) state.currencies[cur.id] = D(0);
  }

  state.depth = 0;
  resetShaftRun(state); // the run's cleared floor washes; the RAIL does not
  // Ember Memory core node: the kiln keeps 10% heat per level.
  state.kiln.heat = shape.heatKeep === 'node'
    ? state.kiln.heat * 0.1 * coreNodeLevel(state, 'emberMemory')
    : state.kiln.heat * shape.heatKeep;
  state.kiln.progress = D(0);

  state.collapse.count += 1;
  addCurrency(state, 'core', cores);
  state.shell.coresEarnedThisBreach = state.shell.coresEarnedThisBreach.add(cores);

  ctx.dirty();
  // Rebuild the face at post-reset dimensions, everything full — the fresh
  // rock is the one consolation of the cave-in.
  applyFieldSize(state, mods);
  const cap = cellCap(state, mods);
  state.face.cells = new Array(state.face.w * state.face.h).fill(cap * shape.faceFill);
  runFaceReset(state, 'collapse'); // signatures re-roll their face state
  // THE WORK GOES BACK WITH THE ROCK. Compaction to zero: what you packed into
  // this band came down with it, which is what makes it a run-length project
  // rather than a permanent ratchet.
  // HOLD (the Roots fork): the fall leaves your packed rock packed, to a floor
  // capped at the FIRST gate — never the terminal one, or the Collapse becomes
  // a way of banking the deepest table instead of the thing that takes work back.
  resetCompaction(state, holdFloor(state));
  // THE RE-ROLL (§1.1). Names, depths, types, hardness and every permanent
  // record are untouched; what the stations HOLD comes up fresh. This is the
  // fix for the ladder being consumed in one pass — 7-11 Collapses per Loam arc
  // against 15 stations would otherwise walk the same rows forty-plus times.
  rerollRoll(state);
  /**
   * EVERY SAMPLE IS NOW STALE, so the fog closes back over the Roll. This is
   * not a punishment for having read it — the reading was TRUE and it paid for
   * the run it was taken in. The contents it described have just been replaced,
   * so keeping the fog burnt would be showing the player last run's answer with
   * this run's confidence, which is worse than showing nothing.
   *
   * The BENCH TIER survives, because that is a machine and machines are not
   * what a Collapse takes. The ASSAY CALL re-rolls with the stations (it is
   * keyed to `roll.rolls`), so it moves on its own the moment this returns.
   */
  clearSamples(state);

  grantXP(state, mods, ctx, cores.mul(8));

  // Run ledger (Phase 21): clock this run against the last one, then bank it as
  // the new "last run" for the next Collapse to measure itself by.
  const sec = Math.max(0, Math.floor(state.stats.playTimeSec - state.collapse.runStartAt));
  const prev = state.collapse.lastRun;
  state.collapse.lastRun = {
    depth: depthAtCollapse, cores, sec, count: state.collapse.count, carried: carriedInfo, type: fall,
  };
  state.collapse.runStartAt = state.stats.playTimeSec;

  // THE COLUMN REMEMBERS (A.45). A mark at the depth this one came down, kept
  // so the shaft you climb is visibly one you dug rather than a fresh tube
  // every time. Bounded: this fires 24-37 times an arc and a save is not a log
  // file. Newest last, oldest dropped.
  state.collapse.traces = [
    ...(state.collapse.traces ?? []),
    { depth: depthAtCollapse, count: state.collapse.count, type: fall },
  ].slice(-TRACE_LIMIT);

  ctx.emit({ type: 'collapse', cores, depth: depthAtCollapse, sec, prev, auto });
  return { ok: true, data: { cores, depth: depthAtCollapse, sec, prev, auto } };
}
