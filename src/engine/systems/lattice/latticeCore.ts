/**
 * Lattice core rules — pure functions over LatticeState. No engine context,
 * no DOM: the UI, sim, and tests all call the same logic.
 *
 * RESONANCE (three observable rules — invented, recorded in DESIGN A.9):
 *   1. HARMONY — same shape adjacent: both gain min(rankA, rankB).
 *   2. FLOW — the shape wheel circle→square→triangle→hex→circle; a motif
 *      adjacent to its successor FEEDS it: receiver gains rank(giver)/2.
 *   3. DISCORD — wheel opposites (circle↔triangle, square↔hex): both lose 1.
 * A cell's glow intensity IS its score; the board bonus sums positive scores.
 *
 * CHORDS: 3 same-shape motifs in a straight line. Identity =
 *   shape × line context × rank-uniformity  (4 × 5 × 2 = the 40 chords).
 * Context (priority order, judged on motifs adjacent to the line, excluding
 * line members): isolated (no neighbours at all) / opposed (any wheel
 * opposite) / flowing (any wheel successor) / supported (any same shape) /
 * attended (neighbours, but none of the above).
 *
 * PROGRESSIONS: active chords sorted by their order stamp (seq of the line's
 * last-placed motif) matched against ordered patterns as a subsequence.
 */
import type { ActiveChord, LatticeState, MotifPlacement, MotifShape } from '../../types';
import { hexKey, LINE_AXES, neighborsOf, parseKey, inBoard } from './hex';

export const SHAPES: MotifShape[] = ['circle', 'square', 'triangle', 'hex'];

/** The shape wheel: each shape flows into its successor. */
export const SUCCESSOR: Record<MotifShape, MotifShape> = {
  circle: 'square',
  square: 'triangle',
  triangle: 'hex',
  hex: 'circle',
};

export const OPPOSITE: Record<MotifShape, MotifShape> = {
  circle: 'triangle',
  triangle: 'circle',
  square: 'hex',
  hex: 'square',
};

export type ChordContext = 'isolated' | 'opposed' | 'flowing' | 'supported' | 'attended';
export const CONTEXTS: ChordContext[] = ['isolated', 'opposed', 'flowing', 'supported', 'attended'];

export function chordId(shape: MotifShape, context: ChordContext, uniform: boolean): string {
  return `${shape}.${context}.${uniform ? 'uniform' : 'mixed'}`;
}

// ---------------------------------------------------------------------------
// Resonance
// ---------------------------------------------------------------------------

export type RelationKind = 'harmony' | 'flow' | 'discord';

export interface Relation {
  from: string;
  to: string;
  kind: RelationKind;
  /** Score delivered to `to` (harmony delivers to both ends; listed once per direction). */
  value: number;
}

/** Every directed resonance relation on the board (for scores AND rendering). */
export function boardRelations(lattice: LatticeState): Relation[] {
  const out: Relation[] = [];
  for (const [key, motif] of Object.entries(lattice.cells)) {
    const { q, r } = parseKey(key);
    for (const n of neighborsOf(q, r)) {
      const nKey = hexKey(n.q, n.r);
      const other = lattice.cells[nKey];
      if (!other) continue;
      if (other.shape === motif.shape) {
        out.push({ from: nKey, to: key, kind: 'harmony', value: Math.min(motif.rank, other.rank) });
      } else if (SUCCESSOR[other.shape] === motif.shape) {
        out.push({ from: nKey, to: key, kind: 'flow', value: other.rank / 2 });
      } else if (OPPOSITE[other.shape] === motif.shape) {
        out.push({ from: nKey, to: key, kind: 'discord', value: -1 });
      }
    }
  }
  return out;
}

/** Per-cell resonance scores. */
export function cellScores(lattice: LatticeState): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const key of Object.keys(lattice.cells)) scores[key] = 0;
  for (const rel of boardRelations(lattice)) {
    scores[rel.to] = (scores[rel.to] ?? 0) + rel.value;
  }
  return scores;
}

/** Board resonance: the sum of positive cell scores. */
export function boardResonance(lattice: LatticeState): number {
  let total = 0;
  for (const v of Object.values(cellScores(lattice))) if (v > 0) total += v;
  return total;
}

// ---------------------------------------------------------------------------
// Chord detection
// ---------------------------------------------------------------------------

function lineContext(lattice: LatticeState, cells: string[], shape: MotifShape): ChordContext {
  const inLine = new Set(cells);
  const neighbours: MotifPlacement[] = [];
  for (const key of cells) {
    const { q, r } = parseKey(key);
    for (const n of neighborsOf(q, r)) {
      const nKey = hexKey(n.q, n.r);
      if (inLine.has(nKey)) continue;
      const motif = lattice.cells[nKey];
      if (motif) neighbours.push(motif);
    }
  }
  if (neighbours.length === 0) return 'isolated';
  if (neighbours.some((m) => m.shape === OPPOSITE[shape])) return 'opposed';
  if (neighbours.some((m) => m.shape === SUCCESSOR[shape])) return 'flowing';
  if (neighbours.some((m) => m.shape === shape)) return 'supported';
  return 'attended';
}

/**
 * All currently-formed chords. A maximal same-shape run of length >= 3 along
 * an axis is ONE chord built from the WHOLE run — a fourth motif extends and
 * strengthens the chord (sumRanks grows) rather than spawning overlapping
 * copies. Uniformity requires every rank in the run to match.
 */
export function detectChords(lattice: LatticeState): ActiveChord[] {
  const out: ActiveChord[] = [];
  for (const [key, motif] of Object.entries(lattice.cells)) {
    const { q, r } = parseKey(key);
    for (const axis of LINE_AXES) {
      // Only start at the run's negative end so each run is found once.
      const prev = lattice.cells[hexKey(q - axis.q, r - axis.r)];
      if (prev && prev.shape === motif.shape) continue;
      const cells: string[] = [];
      let sumRanks = 0;
      let seq = -1;
      let uniform = true;
      for (let i = 0; ; i++) {
        const k = hexKey(q + axis.q * i, r + axis.r * i);
        const m = lattice.cells[k];
        if (!m || m.shape !== motif.shape) break;
        cells.push(k);
        sumRanks += m.rank;
        seq = Math.max(seq, m.seq);
        if (m.rank !== motif.rank) uniform = false;
      }
      if (cells.length < 3) continue;
      out.push({
        id: chordId(motif.shape, lineContext(lattice, cells, motif.shape), uniform),
        cells,
        sumRanks,
        seq,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Near-chord feedback — the ambient hum (pillar 5's anti-brute-force helper)
// ---------------------------------------------------------------------------

export interface NearLine {
  /** The two placed same-shape cells. */
  placed: [string, string];
  /** The empty in-board cell that would complete the line. */
  missing: string;
  shape: MotifShape;
}

/** Lines that are one motif away from a chord. */
export function nearChordLines(lattice: LatticeState): NearLine[] {
  const out: NearLine[] = [];
  const seen = new Set<string>();
  for (const [key, motif] of Object.entries(lattice.cells)) {
    const { q, r } = parseKey(key);
    for (const axis of LINE_AXES) {
      // Three consecutive cells starting at offsets -2..0 along the axis all
      // produce the same candidate windows; enumerate windows anchored here.
      for (let start = -2; start <= 0; start++) {
        const keys = [0, 1, 2].map((i) =>
          hexKey(q + axis.q * (start + i), r + axis.r * (start + i)),
        );
        const id = keys.join('|') + motif.shape;
        if (seen.has(id)) continue;
        const motifs = keys.map((k) => lattice.cells[k]);
        const emptyIdx = motifs.findIndex((m) => !m);
        if (emptyIdx < 0) continue; // full line (chord or mixed)
        const placedIdx = [0, 1, 2].filter((i) => i !== emptyIdx);
        const a = motifs[placedIdx[0]!];
        const b = motifs[placedIdx[1]!];
        if (!a || !b || a.shape !== motif.shape || b.shape !== motif.shape) continue;
        const missing = parseKey(keys[emptyIdx]!);
        if (!inBoard(missing.q, missing.r, lattice.rings)) continue;
        seen.add(id);
        out.push({
          placed: [keys[placedIdx[0]!]!, keys[placedIdx[1]!]!],
          missing: keys[emptyIdx]!,
          shape: motif.shape,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Progressions
// ---------------------------------------------------------------------------

export interface ProgressionStep {
  shape?: MotifShape;
  context?: ChordContext;
  uniform?: boolean;
}

/** Does the active chord list (sorted by seq) contain the pattern as a subsequence? */
export function matchProgression(active: ActiveChord[], steps: ProgressionStep[]): boolean {
  const sorted = [...active].sort((a, b) => a.seq - b.seq);
  let i = 0;
  for (const chord of sorted) {
    const step = steps[i];
    if (!step) break;
    const [shape, context, uni] = chord.id.split('.') as [MotifShape, ChordContext, string];
    if (
      (step.shape === undefined || step.shape === shape) &&
      (step.context === undefined || step.context === context) &&
      (step.uniform === undefined || step.uniform === (uni === 'uniform'))
    ) {
      i++;
    }
  }
  return i >= steps.length;
}
