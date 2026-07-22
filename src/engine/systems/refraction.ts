/**
 * REFRACTION — Glassmere's signature. A beam enters the face from the left
 * at a row you choose; you place mirrors ('/' and '\') and the light walks
 * its path WITHOUT you. Every cell the beam crosses harvests brighter.
 * Polarity was routing a path you walk; Refraction is arranging one for
 * something else to walk.
 *
 * COMPOSITION WITH THREE STACKED SIGNATURES (the legibility contract):
 *  - GROWTH: young vines (stage 1-2) BEND the beam downward (a soft green
 *    prism); bloom+ vines BLOCK it (the canopy is opaque). One rule each.
 *  - POLARITY: the beam is charge-neutral — it crosses signs untouched, but
 *    a beam-lit cell keeps its sign visible through the glow (hierarchy:
 *    sign glyph above beam tint).
 *  - SEEPAGE: unchanged; beam-lit cells at cap seep the same.
 *  Cells holding ≥90% charge AMPLIFY the beam (light through a full lens):
 *  every cell after an amplifier gains a brighter multiplier.
 *
 * WAVELENGTH SPLIT (Shell Mastery 25): the one beam becomes six colors,
 * segment by segment — the beam's color at each cell decides its gift
 * there. Rendered as the beam literally changing color along its path;
 * the rule is one line per color, listed in the Optics card.
 *
 * Carried down at 0.4×: a dimmer beam, same routing, still worth having.
 */
import type { ModifierCache } from '../modifiers';
import type { GameState } from '../types';
import { registerSignature } from '../signatures';
import { addCurrency } from '../resources';
import { convCurrencyId } from '../shells';
import { cellCap, chipYield } from './face';
import { rollForDrop } from './drops';
import { masteryLevel } from './mastery';
import { lawFlag } from '../laws';

export const BEAM_BONUS = 0.6; // ×(1 + this × strength) on beam-lit cells
export const AMP_BONUS = 0.5; // amplifiers add this much again downstream
export const SPLIT_MASTERY = 25;

export type MirrorKind = '/' | '\\';

export interface BeamCell {
  cell: number;
  /** 0..5 — the wavelength at this segment (0 = white, pre-split). */
  color: number;
  /** Direction entering the cell: 0 right, 1 down, 2 left, 3 up. */
  dir: number;
  amplified: boolean;
  /** The Broad Beam (law): a shoulder cell, lit at half gift. */
  wide?: boolean;
}

export const WAVELENGTH_NAMES = ['White', 'Red', 'Amber', 'Green', 'Cyan', 'Violet'];
/** One line per color — the whole rule, printable in the Optics card. */
export const WAVELENGTH_RULES = [
  'White — the whole gift at once (pre-Split).',
  'Red — charged cells burn brighter (+50% on cells above half).',
  'Amber — the converter drinks: +25% of beam harvests echo as CONV.',
  'Green — vines fruit faster where the light lands (aging ×1.5).',
  'Cyan — signed cells feed the chain (+1 chain grace on harvest).',
  'Violet — drops glitter on the path (+30% drop chance).',
];

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

export function splitUnlocked(state: GameState): boolean {
  return masteryLevel(state, 'glassmere') >= SPLIT_MASTERY;
}

/**
 * Trace the beam. Pure: reads mirrors, vines, charge; returns the path.
 * The beam enters at (0, entryRow) moving right and walks until it exits,
 * is blocked, or has visited 4×W×H segments (loop guard).
 */
export function traceBeam(state: GameState, mods: ModifierCache): BeamCell[] {
  const { w, h } = state.face;
  const entry = Math.min(h - 1, Math.max(0, state.refraction.entryRow));
  const cap = cellCap(state, mods);
  const split = splitUnlocked(state);
  const out: BeamCell[] = [];
  let x = 0;
  let y = entry;
  let dir = 0;
  let amplified = false;
  let color = 0;
  let guard = w * h * 4;
  const seen = new Set<string>();
  while (x >= 0 && x < w && y >= 0 && y < h && guard-- > 0) {
    const cell = y * w + x;
    const key = `${cell}:${dir}`;
    if (seen.has(key)) break; // a closed loop of mirrors — light escapes as heat
    seen.add(key);
    const vine = state.growth.stage[cell] ?? 0;
    if (vine >= 3) break; // the canopy is opaque
    if (split) color = 1 + ((out.length / 3) | 0) % 5; // colors walk the path in bands
    out.push({ cell, color, dir, amplified });
    if ((state.face.cells[cell] ?? 0) >= cap * 0.9) amplified = true; // full lens
    const mirror = state.refraction.mirrors[cell];
    if (mirror === '/') dir = [3, 2, 1, 0][dir]!;
    else if (mirror === '\\') dir = [1, 0, 3, 2][dir]!;
    else if (vine > 0) dir = 1; // young green bends light down
    x += DX[dir]!;
    y += DY[dir]!;
  }
  return out;
}

/** Cached path — retraced when the face or optics change. */
export function beamPath(state: GameState, mods: ModifierCache): BeamCell[] {
  const r = state.refraction;
  if (r.pathDirty || r.path.length === 0) {
    r.path = traceBeam(state, mods);
    // THE BROAD BEAM (law): the shoulders light too, at half gift — marked
    // by amplified:false and a duplicate entry the chip hook halves.
    if (lawFlag(state, 'beamWide')) {
      const w = state.face.w;
      const on = new Set(r.path.map((b) => b.cell));
      const shoulders: BeamCell[] = [];
      for (const b of r.path) {
        for (const n of [b.cell - w, b.cell + w, b.cell - 1, b.cell + 1]) {
          if (n >= 0 && n < state.face.cells.length && !on.has(n)) {
            on.add(n);
            shoulders.push({ cell: n, color: b.color, dir: b.dir, amplified: false, wide: true });
          }
        }
      }
      r.path = [...r.path, ...shoulders];
    }
    r.pathDirty = false;
  }
  return r.path;
}

export function beamCellInfo(state: GameState, mods: ModifierCache, cell: number): BeamCell | null {
  return beamPath(state, mods).find((b) => b.cell === cell) ?? null;
}

export function setMirror(state: GameState, cell: number, kind: MirrorKind | null): { ok: boolean; reason?: string } {
  if (cell < 0 || cell >= state.face.cells.length) return { ok: false, reason: 'Off the face' };
  if (kind !== null) {
    const owned = Object.values(state.refraction.mirrors).filter(Boolean).length;
    if (!state.refraction.mirrors[cell] && owned >= state.refraction.mirrorStock) {
      return { ok: false, reason: 'No spare mirrors — the Lenswork grinds more (Silica)' };
    }
    state.refraction.mirrors[cell] = kind;
  } else {
    delete state.refraction.mirrors[cell];
  }
  state.refraction.pathDirty = true;
  return { ok: true };
}

export function registerRefraction(): void {
  registerSignature({
    id: 'refraction',
    shellId: 'glassmere',
    name: 'Refraction',
    hooks: {
      chipMult(state, mods, ctx, cell, strength) {
        const hit = beamCellInfo(state, mods, cell);
        if (!hit) return 1;
        const wideHalf = hit.wide ? 0.5 : 1;
        let mult = 1 + BEAM_BONUS * strength * wideHalf + (hit.amplified ? AMP_BONUS * strength : 0);
        // Wavelength gifts — one rule per color, no exceptions.
        const cap = cellCap(state, mods);
        const charge = state.face.cells[cell] ?? 0;
        if (hit.color === 1 && charge >= cap * 0.5) mult *= 1.5;
        if (hit.color === 2 && charge > 0) {
          addCurrency(state, convCurrencyId(state), chipYield(state, mods).mul(charge * 0.25));
        }
        if (hit.color === 3 && (state.growth.stage[cell] ?? 0) > 0) {
          state.growth.age[cell] = (state.growth.age[cell] ?? 0) * 1.5;
        }
        if (hit.color === 4 && state.polarity.chain > 0) {
          state.polarity.lastChipAtSec = state.stats.playTimeSec + 4; // a beat of grace
        }
        if (hit.color === 5) {
          rollForDrop(state, mods, ctx, charge, 0.3);
        }
        state.refraction.beamHarvests += 1;
        state.refraction.pathDirty = true; // the harvested cell changes the optics
        return mult;
      },
      onFaceTick(state, mods) {
        // Keep the traced path LIVE for the renderer and the harvest hook:
        // charge crossing the 90% line changes amplification, vines move.
        if (state.refraction.pathDirty || state.stats.playTimeSec - state.refraction.lastTraceSec >= 2) {
          state.refraction.pathDirty = true;
          beamPath(state, mods); // the one retrace path (Broad Beam included)
          state.refraction.lastTraceSec = state.stats.playTimeSec;
        }
      },
      onFaceReset(state, _strength, cause) {
        state.refraction.pathDirty = true;
        if (cause === 'collapse' || cause === 'breach') {
          state.refraction.mirrors = {};
        }
      },
      // In the Hollow: the beam crosses the dark and lights motes that were
      // not there before it looked. More glass, more looking.
      voidTick: (s, _m, _dt, strength) =>
        0.4 * strength * (1 + 0.15 * s.refraction.mirrorStock) * (1 + 0.08 * masteryLevel(s, 'glassmere')),
    },
  });
}

export function defaultRefractionState(): GameState['refraction'] {
  return {
    entryRow: 2,
    mirrors: {},
    mirrorStock: 2,
    path: [],
    pathDirty: true,
    lastTraceSec: 0,
    beamHarvests: 0,
  };
}
