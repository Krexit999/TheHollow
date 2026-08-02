/**
 * FIGURES — cell-shape chords for the Face (Phase: THE FACE CLUSTER, v20).
 *
 * Chipping cells that trace a SHAPE in the rock — a furrow (3 in a line), a fault
 * (3 on a diagonal), a pit (a 2×2 block), a collar (a 4-cell ring around a centre)
 * — pays a bonus. They are DISCOVERED by doing, recorded in the Codex
 * (`state.figures.found`), and NEVER listed in the Compendium (pillar 5). They are
 * a different thing from Lattice Chords (which read placed motif shapes) — a Figure
 * is a gesture the hand makes on the face, not a board arrangement.
 *
 * PILLAR 2 (the one that constrains this): a Figure must not raise throughput. So it
 * pays what is NOT income-bound — Delver XP and a bonus DROP roll — never Dust and
 * never a yield multiplier. It changes engagement, not the ceiling. (A dust/Y bonus
 * would have raised `dpsMax`; XP and drops do not.) A third channel, a sweep-stamina
 * refill, went when SWEEP did.
 *
 * PILLAR 5: the face may glow at a cell that is ONE chip from completing a figure
 * (`figureHintCells`), but the glow names a POSITION, never a shape. Discovery stays
 * a thing you do.
 */
import { D } from '../decimal';
import type { ModifierCache } from '../modifiers';
import type { EngineCtx, GameState } from '../types';
import { grantXP } from './xp';
import { rollForDrop } from './drops';
import { BASE_CAP } from './face';

export interface FigureDef {
  id: string;
  /** Codex name — invented, appended to DESIGN. */
  name: string;
  /** One line for the Codex entry once found. */
  note: string;
  /** Payout scale — bigger figures pay a little more (still ceiling-free). */
  scale: number;
}

/** The four figures, easiest → most deliberate. Priority for detection is the
 *  reverse: the most deliberate shape a chip completes wins. */
export const FIGURE_DEFS: FigureDef[] = [
  { id: 'furrow', name: 'The Furrow', note: 'Three struck in a straight line. The oldest mark a hand leaves.', scale: 1 },
  { id: 'fault', name: 'The Fault', note: 'Three on the slant. You follow the rock the way it wants to split.', scale: 1.2 },
  { id: 'pit', name: 'The Pit', note: 'A square of four, worked out together. You sink instead of scratch.', scale: 1.5 },
  { id: 'collar', name: 'The Collar', note: 'Four around a centre left standing. You ring a thing before you take it.', scale: 1.7 },
];

export function figureDef(id: string): FigureDef | undefined {
  return FIGURE_DEFS.find((f) => f.id === id);
}

// The trail a chip leaves. Short window, small buffer — a figure is a gesture, not
// a session-long accumulation.
const WINDOW_SEC = 3.5;
const TRAIL_MAX = 9;

function nowSec(state: GameState): number {
  return state.stats.playTimeSec;
}

/** The recent-chip cells still inside the window, as a Set (order-independent). */
function activeTrail(state: GameState): Set<number> {
  const t = nowSec(state);
  const out = new Set<number>();
  for (const r of state.face.recentChips) if (t - r.at <= WINDOW_SEC) out.add(r.cell);
  return out;
}

const xOf = (c: number, w: number) => c % w;
const yOf = (c: number, w: number) => Math.floor(c / w);
function idx(x: number, y: number, w: number, h: number): number {
  return x >= 0 && x < w && y >= 0 && y < h ? y * w + x : -1;
}
function has(set: Set<number>, x: number, y: number, w: number, h: number): boolean {
  const i = idx(x, y, w, h);
  return i >= 0 && set.has(i);
}

/**
 * Which figure (if any) the just-chipped cell `c` completes, using only the cells
 * in `set`. Returns the most deliberate match (collar > pit > fault > furrow).
 */
export function detectFigure(w: number, h: number, set: Set<number>, c: number): FigureDef | null {
  const x = xOf(c, w), y = yOf(c, w);

  // COLLAR — a centre with all four orthogonal arms present. `c` may be an arm or
  // the centre; try `c` and each of its neighbours as the centre.
  const centres = [[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
  for (const [cx, cy] of centres) {
    if (has(set, cx! - 1, cy!, w, h) && has(set, cx! + 1, cy!, w, h) && has(set, cx!, cy! - 1, w, h) && has(set, cx!, cy! + 1, w, h)) {
      return FIGURE_DEFS[3]!;
    }
  }
  // PIT — a 2×2 block with `c` at any corner.
  for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
    if (has(set, x + ox!, y + oy!, w, h) && has(set, x + ox! + 1, y + oy!, w, h)
      && has(set, x + ox!, y + oy! + 1, w, h) && has(set, x + ox! + 1, y + oy! + 1, w, h)) {
      return FIGURE_DEFS[2]!;
    }
  }
  // FAULT — 3 consecutive on either diagonal through `c`.
  for (const [dx, dy] of [[1, 1], [1, -1]]) {
    for (let k = -2; k <= 0; k++) {
      if (has(set, x + k * dx!, y + k * dy!, w, h) && has(set, x + (k + 1) * dx!, y + (k + 1) * dy!, w, h) && has(set, x + (k + 2) * dx!, y + (k + 2) * dy!, w, h)) {
        return FIGURE_DEFS[1]!;
      }
    }
  }
  // FURROW — 3 consecutive horizontal or vertical through `c`.
  for (let k = -2; k <= 0; k++) {
    if (has(set, x + k, y, w, h) && has(set, x + k + 1, y, w, h) && has(set, x + k + 2, y, w, h)) return FIGURE_DEFS[0]!;
    if (has(set, x, y + k, w, h) && has(set, x, y + k + 1, w, h) && has(set, x, y + k + 2, w, h)) return FIGURE_DEFS[0]!;
  }
  return null;
}

/**
 * The pillar-5 hint: cells that are ONE chip from completing a figure given the
 * current trail. Returns POSITIONS only — the UI glows them faintly; it never says
 * which shape. Empty until the trail has something in it, so it isn't a constant map.
 */
export function figureHintCells(state: GameState): number[] {
  const set = activeTrail(state);
  if (set.size < 2) return [];
  const { w, h } = state.face;
  const out: number[] = [];
  for (let c = 0; c < w * h; c++) {
    if (set.has(c)) continue;
    // Would chipping c complete a figure? Test with c added to the trail.
    set.add(c);
    const hit = detectFigure(w, h, set, c);
    set.delete(c);
    if (hit) out.push(c);
  }
  return out;
}

/**
 * Record a manual chip on the trail and, if it completes a figure, pay the
 * ceiling-free bonus. Called from `manualChip`. Returns the figure fired, if any.
 */
export function recordChipForFigures(state: GameState, mods: ModifierCache, ctx: EngineCtx, cell: number): FigureDef | null {
  const t = nowSec(state);
  const trail = state.face.recentChips;
  // Move an existing entry to the front rather than duplicating a cell.
  const existing = trail.findIndex((r) => r.cell === cell);
  if (existing >= 0) trail.splice(existing, 1);
  trail.push({ cell, at: t });
  // Trim by window and by size.
  while (trail.length > 0 && (trail.length > TRAIL_MAX || t - trail[0]!.at > WINDOW_SEC)) trail.shift();

  const set = activeTrail(state);
  const fig = detectFigure(state.face.w, state.face.h, set, cell);
  if (!fig) return null;

  // Ceiling-free payout: XP and a bonus drop roll. No Dust, no Y.
  //
  // IT USED TO PAY A STAMINA REFILL AS WELL, and that channel is gone with
  // SWEEP — stamina existed only to meter the sweep gesture, so a refill now
  // tops up nothing. This is a real reduction in what a figure pays and it is
  // NOT compensated here: the other two channels are the ones that were doing
  // the work, and inventing a third to replace it would be re-adding a system
  // to preserve a hook, which is the thing the cut is against.
  const first = !state.figures.found.includes(fig.id);
  if (first) state.figures.found.push(fig.id);
  grantXP(state, mods, ctx, D(6 * fig.scale * (1 + 0.06 * state.depth)));
  rollForDrop(state, mods, ctx, BASE_CAP * 2 * fig.scale, 1.5);
  // A figure is a completed gesture — clear the trail so the next one is fresh.
  state.face.recentChips.length = 0;
  ctx.emit({ type: 'figure', id: fig.id, name: fig.name, first });
  return fig;
}
