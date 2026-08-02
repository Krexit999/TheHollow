/**
 * COMPACTION — working a cell makes it richer.
 *
 * Every hand chip packs the rock it lands on by one. At 8, 14 and 20 the cell
 * starts rolling a DEEP-ENTRY drop table: Umberjade, then Deep Graveclay, then
 * Deepgrave. The counter is per-cell, climbs to a ceiling, and is wiped by the
 * Collapse — so it is a run-length project, not a permanent ratchet, and the
 * question it asks is "how deep can I get this board before it comes down".
 *
 * WHY IT IS NOT A SECOND FAUCET (pillar 2). Nothing here touches charge, cap or
 * regen. Compaction moves what comes OUT of the drop table — rarity, not rate —
 * and drops have always sat outside the income path. `dpsMax = W·H·regen·Y` has
 * no term this file can reach.
 *
 * HAND ONLY, and that is the whole reason the numbers work. A drill parked on a
 * deep cell would roll the terminal material every stroke, which is a faucet
 * wearing a drop table's clothes — so machines never compact and never collect.
 * The gates are what your own attention buys.
 *
 * (This file is what survived GRAIN, cut after playtest against §44.1's kill
 * criterion. Compaction predates it and outlived it; the direction field, the
 * with/across strike, the travelling fracture and the lock are gone.)
 */
import type { EngineCtx, GameState } from '../types';
import { applyDrop } from './drops';
import { sealed } from '../laws';

/** The ceiling on the counter. A cell climbs to here and stops; it keeps
 *  working forever, it is simply as deep as it goes. */
export const MAX_COMPACTION = 26;

/**
 * WHERE THE NUMBER APPEARS. Below this, compaction is background intensity only
 * and the early face stays quiet; at and above it, the digit is printed. Eight
 * is not a legibility guess — it is the FIRST DEEP-ENTRY GATE, so the number
 * becomes visible on precisely the chip where it starts paying.
 */
export const COMPACTION_SHOW_AT = 8;

/** What one hand chip packs into the cell it lands on. */
export const CHIP_COMPACTION = 1;

export interface DeepGate { at: number; materialId: string; chance: number }

/**
 * THE GATES. Deepest one met wins; one roll, one material.
 *
 * These three chances are UNVERIFIED BALANCE — set to make the first find
 * reachable inside an hour, never sim-checked. The thing to watch is the late
 * board, where every cell sits at the top gate and every chip rolls the
 * terminal table; the Collapse wipe is what is supposed to bound that, and
 * nobody has measured whether it does.
 */
export const DEEP_GATES: DeepGate[] = [
  { at: 20, materialId: 'deepgrave', chance: 0.06 },
  { at: 14, materialId: 'graveclaydeep', chance: 0.11 },
  { at: 8, materialId: 'umberjade', chance: 0.18 },
];

/** The deepest gate — what the renderer rings as "this one is worth the most". */
export const TERMINAL_GATE = DEEP_GATES[0]!.at;

/**
 * The array is never assumed. A save written before this existed has none, and
 * a face that was widened has one at the wrong length; both heal here rather
 * than in a migration, which is why this needs no save version bump.
 */
export function ensureCompaction(state: GameState): void {
  const n = state.face.cells.length;
  const f = state.face as unknown as Record<string, unknown>;
  if (!Array.isArray(state.face.compaction) || state.face.compaction.length !== n) {
    state.face.compaction = new Array<number>(n).fill(0);
  }
  /**
   * AND A SAVE FROM THE GRAIN BUILD SHEDS WHAT IT WAS CARRYING.
   *
   * Nothing reads these any more, so leaving them changes no behaviour — which
   * is exactly why it would have been missed. They persist in player data and
   * in every exported save string, so a cut that stops at the code is not a
   * cut. Deleted on load, the same way the grain layer used to delete `locked`.
   */
  for (const dead of ['grain', 'grainGen', 'grainScope', 'bandGrain', 'front', 'locked']) {
    if (f[dead] !== undefined) delete f[dead];
  }
}

export function compactionAt(state: GameState, cell: number): number {
  return state.face.compaction?.[cell] ?? 0;
}

/** Which gate this chip crossed, if any — the moment a cell starts paying a
 *  table it was not paying before. Deepest first, so one chip that jumps two
 *  gates names the better one. */
export function gateCrossed(before: number, after: number): number | null {
  for (const g of DEEP_GATES) {
    if (before < g.at && after >= g.at) return g.at;
  }
  return null;
}

export interface CompactionResult {
  before: number;
  after: number;
  /** Material ids the gates dropped on this chip. */
  deepDrops: string[];
}

/**
 * WHAT ONE HAND CHIP DOES TO THE ROCK, after the harvest has already succeeded.
 * A swing that found nothing did no work and packs nothing — otherwise a player
 * could walk every gate open by tapping empty cells.
 */
export function applyChipCompaction(
  state: GameState, ctx: EngineCtx, cell: number,
): CompactionResult {
  ensureCompaction(state);
  const comp = state.face.compaction!;
  const before = comp[cell] ?? 0;
  comp[cell] = Math.min(MAX_COMPACTION, before + CHIP_COMPACTION);
  const after = comp[cell] ?? 0;
  const deepDrops: string[] = [];
  const drop = rollDeepEntry(state, ctx, after);
  if (drop) deepDrops.push(drop);
  return { before, after, deepDrops };
}

export function rollDeepEntry(state: GameState, ctx: EngineCtx, compaction: number): string | null {
  // THE THIN SEAM (challenge) seals every drop, this one included.
  if (sealed(state, 'sealDrops')) return null;
  for (const gate of DEEP_GATES) {
    if (compaction < gate.at) continue;
    if (Math.random() >= gate.chance) return null;
    applyDrop(state, ctx, {
      kind: 'material',
      materialId: gate.materialId,
      purity: 40 + Math.floor(Math.random() * 45),
    });
    return gate.materialId;
  }
  return null;
}

/**
 * THE COLLAPSE TAKES THE WORK BACK. Called from the reset that already existed
 * (collapseSys / breach / pressure) rather than being a reset of its own.
 */
export function resetCompaction(state: GameState): void {
  state.face.compaction = new Array<number>(state.face.cells.length).fill(0);
}

/** Called by applyFieldSize: a wider grid renumbers every row, so compaction is
 *  remapped by COORDINATE like the pockets. An index copy would slide the whole
 *  board sideways one cell per row. */
export function remapCompaction(
  state: GameState, w: number, h: number, remap: Map<number, number>,
): void {
  const comp = new Array<number>(w * h).fill(0);
  const old = state.face.compaction;
  for (const [from, to] of remap) {
    if (old?.[from] !== undefined) comp[to] = old[from]!;
  }
  state.face.compaction = comp;
}
