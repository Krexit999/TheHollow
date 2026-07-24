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
import type { ActionResult, EngineCtx, GameState } from '../types';
import { coresForDepth } from '../prestigeMath';
import { coreNodeLevel } from '../content/shell1/coreTree';
import { applyFieldSize, cellCap } from './face';
import { grantXP } from './xp';
import { runFaceReset } from '../signatures';
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

export function doCollapse(state: GameState, mods: ModifierCache, ctx: EngineCtx, auto = false): ActionResult {
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
  const retained = collapseRetained(state);
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

  // Shell-local currencies wash away.
  for (const cur of allCurrencies()) {
    if (cur.resetsOnCollapse) state.currencies[cur.id] = D(0);
  }

  state.depth = 0;
  resetShaftRun(state); // the run's cleared floor washes; the RAIL does not
  // Ember Memory core node: the kiln keeps 10% heat per level.
  state.kiln.heat = state.kiln.heat * 0.1 * coreNodeLevel(state, 'emberMemory');
  state.kiln.progress = D(0);

  state.collapse.count += 1;
  addCurrency(state, 'core', cores);
  state.shell.coresEarnedThisBreach = state.shell.coresEarnedThisBreach.add(cores);

  ctx.dirty();
  // Rebuild the face at post-reset dimensions, everything full — the fresh
  // rock is the one consolation of the cave-in.
  applyFieldSize(state, mods);
  const cap = cellCap(state, mods);
  state.face.cells = new Array(state.face.w * state.face.h).fill(cap);
  runFaceReset(state, 'collapse'); // signatures re-roll their face state

  grantXP(state, mods, ctx, cores.mul(8));

  // Run ledger (Phase 21): clock this run against the last one, then bank it as
  // the new "last run" for the next Collapse to measure itself by.
  const sec = Math.max(0, Math.floor(state.stats.playTimeSec - state.collapse.runStartAt));
  const prev = state.collapse.lastRun;
  state.collapse.lastRun = { depth: depthAtCollapse, cores, sec, count: state.collapse.count, carried: carriedInfo };
  state.collapse.runStartAt = state.stats.playTimeSec;

  ctx.emit({ type: 'collapse', cores, depth: depthAtCollapse, sec, prev, auto });
  return { ok: true, data: { cores, depth: depthAtCollapse, sec, prev, auto } };
}
