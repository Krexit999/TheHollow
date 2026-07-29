/**
 * THE TOOL'S BIOGRAPHY — one readable history, and it grants nothing.
 *
 * "This is the tool that carried me through Cinder" is the whole feature. It is
 * INFORMATION, deliberately and completely: no term in here is read by
 * `effectOf`, by `modCache`, by `balanceOf` or by anything else that touches a
 * number the rock cares about. `bio-grants-nothing` in the test file asserts
 * that by measuring a swing with a full biography against a swing with an empty
 * one and requiring them byte-identical.
 *
 * That is not modesty. A biography that granted power would be a stat-grind
 * wearing a diary's clothes, and the attachment it is supposed to produce would
 * turn into an obligation to farm it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MOSTLY DERIVED, WHICH IS WHY IT IS CHEAP.
 *
 * Four of the seven lines are BASELINES SUBTRACTED FROM LIVE COUNTERS the engine
 * already keeps — collapses survived is `collapse.count` minus what it was when
 * the tool was made, relics found is `relics.found` minus the same, and so on.
 * No new hook, nothing to forget to call, and nothing that can drift out of
 * step with the counter it shadows.
 *
 * Only three things needed an actual hook, because nothing else counts them:
 * cells broken and swings (the manual verbs already call `gainToolXp`, so it is
 * one line each), seconds held (the tick), and abilities fired (the firing
 * hook that already exists for the tool carrier).
 */
import type { GameState } from '../types';
import { shellOrdinal } from '../content/drillAlloys';

export interface ToolBio {
  /** Playtime seconds when this tool was first built. */
  madeAtPlaySec: number;
  /** Baselines, so the rest is a subtraction. */
  atCollapses: number;
  atRelics: number;
  atBreaches: number;

  /** Counted, because nothing else counts them. */
  cells: number;
  swings: number;
  secondsHeld: number;
  fired: number;
  rebuilds: number;

  /** The deepest it has been, and every shell it has worked. */
  deepestShell: string;
  deepestDepth: number;
  shells: string[];
}

export function defaultBio(state?: GameState): ToolBio {
  return {
    madeAtPlaySec: state?.stats?.playTimeSec ?? 0,
    atCollapses: state?.collapse?.count ?? 0,
    atRelics: state?.relics?.found ?? 0,
    atBreaches: state?.shell?.breachCount ?? 0,
    cells: 0,
    swings: 0,
    secondsHeld: 0,
    fired: 0,
    rebuilds: 0,
    deepestShell: state?.shell?.current ?? 'loam',
    deepestDepth: 0,
    shells: state?.shell?.current ? [state.shell.current] : [],
  };
}

export function bioOf(state: GameState): ToolBio | null {
  if (!state.casting || state.casting.tool.length === 0) return null;
  return (state.casting.bio ??= defaultBio(state));
}

/**
 * START ONE, OR KEEP THE ONE THERE IS.
 *
 * A REBUILD KEEPS THE BIOGRAPHY, and counts itself. Re-seating a worn Core is
 * not a new tool — it is the same tool with a new Core, which is the doc's whole
 * "you never throw it away" promise. A biography that reset on every repair
 * would make the feature actively discourage maintenance.
 *
 * Taking it apart entirely does not clear it either. If you build another one,
 * it picks up where the last left off, and the rebuild count says how many
 * times that has happened.
 */
export function startBio(state: GameState): void {
  if (!state.casting) return;
  if (!state.casting.bio) {
    state.casting.bio = defaultBio(state);
    return;
  }
  state.casting.bio.rebuilds += 1;
}

/** Cells broken and swings taken. Called from the manual verbs. */
export function noteBioWork(state: GameState, cells: number, swings: number): void {
  const bio = state.casting?.bio;
  if (!bio) return;
  bio.cells += Math.max(0, cells);
  bio.swings += Math.max(0, swings);
}

/** An ability fired. Called from the tool's own firing hook. */
export function noteBioFired(state: GameState): void {
  const bio = state.casting?.bio;
  if (bio) bio.fired += 1;
}

/**
 * TIME HELD, AND WHERE IT HAS BEEN. On the tick, and only while a tool actually
 * exists — a biography does not accrue hours in a drawer.
 */
export function tickBio(state: GameState, dt: number): void {
  if (!state.casting || state.casting.tool.length === 0) return;
  const bio = (state.casting.bio ??= defaultBio(state));
  bio.secondsHeld += dt;

  const shellId = state.shell?.current ?? 'loam';
  if (!bio.shells.includes(shellId)) bio.shells.push(shellId);
  // DEEPEST is by shell first, then by depth within it — one metre into Cinder
  // is deeper than the floor of Loam, and the biography should read that way.
  const here = shellOrdinal(shellId);
  const best = shellOrdinal(bio.deepestShell);
  if (here > best || (here === best && state.depth > bio.deepestDepth)) {
    bio.deepestShell = shellId;
    bio.deepestDepth = Math.max(state.depth, here > best ? state.depth : bio.deepestDepth);
  }
}

/** The whole history, resolved — the panel computes nothing. */
export interface BioRead {
  hours: number;
  cells: number;
  swings: number;
  fired: number;
  collapses: number;
  relics: number;
  breaches: number;
  rebuilds: number;
  deepestShell: string;
  deepestDepth: number;
  shells: string[];
  ageSec: number;
}

export function readBio(state: GameState): BioRead | null {
  const bio = bioOf(state);
  if (!bio) return null;
  // CLAMPED AT ZERO, because two of the live counters can legitimately fall:
  // relics are consumed by fusion and a Recursion resets the breach count. A
  // biography that read "-3 relics" would be a bug the player could see.
  const since = (now: number, then: number): number => Math.max(0, now - then);
  return {
    hours: bio.secondsHeld / 3600,
    cells: bio.cells,
    swings: bio.swings,
    fired: bio.fired,
    collapses: since(state.collapse?.count ?? 0, bio.atCollapses),
    relics: since(state.relics?.found ?? 0, bio.atRelics),
    breaches: since(state.shell?.breachCount ?? 0, bio.atBreaches),
    rebuilds: bio.rebuilds,
    deepestShell: bio.deepestShell,
    deepestDepth: bio.deepestDepth,
    shells: bio.shells,
    ageSec: Math.max(0, (state.stats?.playTimeSec ?? 0) - bio.madeAtPlaySec),
  };
}
