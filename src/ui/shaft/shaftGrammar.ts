/**
 * THE SHAFT — GRAMMAR. Pure, deterministic geometry for the renderer: the
 * silhouette of the channel, the crack networks lit from within, the sparse
 * decals, and the depth-drift that makes shallow rock read differently from deep.
 *
 * No Pixi, no DOM — every function is a pure map from (shell, depth/chunk, seed)
 * to numbers, so a headless test can pin BOTH that it is deterministic (a place
 * you re-enter must look the same every time) and that the seven shells actually
 * diverge rather than re-tint. The renderer (ShaftView) turns these into pixels.
 */
import { shaftGrammar, type WallStyle } from './shaftThemes';

// ---------------------------------------------------------------------------
// Seeded randomness — a place you re-enter must be identical each time.
// ---------------------------------------------------------------------------

/** mulberry32 — small, fast, good enough for texture; fully deterministic. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable string hash, so a shell id folds into a seed. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The one seed for a chunk — (shell, chunkIndex) → a stable 32-bit number. */
export function hashSeed(shellId: string, chunkIndex: number): number {
  return (Math.imul(hashStr(shellId), 2654435761) ^ Math.imul(chunkIndex + 1, 40503)) >>> 0;
}

/** Chunk size in depths. Deterministically seeded per (shell, index). */
export const CHUNK_DEPTHS = 16;
export function chunkOf(depth: number): number { return Math.floor(depth / CHUNK_DEPTHS); }

// ---------------------------------------------------------------------------
// Depth drift — one parameter set, interpolated continuously over depth.
// ---------------------------------------------------------------------------

export interface DriftParams {
  /** Channel half-width in depth units (renderer scales by px/depth). */
  hw: number;
  rough: number;
  events: number;
  cracks: number;
  /** Palette temperature, 0 warm (shallow) .. 1 cool (deep) — the light cools as you go. */
  temp: number;
  /** Texture grain strength, rising with depth. */
  grain: number;
  decalEvery: number;
}

/**
 * Smooth, unbounded drift over depth. Deeper rock: the channel tightens, the
 * walls roughen, cracks thicken, the light cools, the grain rises. Shallow Loam
 * and deep Loam are visibly different rock, not just a corner number.
 */
export function driftParams(shellId: string, depth: number): DriftParams {
  const g = shaftGrammar(shellId);
  // A slow 0..1 ramp that keeps climbing (asymptotic), plus a gentle breathing wave.
  const d = Math.max(0, depth);
  const ramp = d / (d + 80); // kicks in sooner: ~0.06 at 5, ~0.64 at 140, ~0.8 at 320
  const wave = 0.5 + 0.5 * Math.sin(d * 0.045);
  return {
    // AGGRESSIVE drift — depth 5 and depth 140 must read as different rock at a
    // glance. The monotonic tightening dominates; the wave only breathes ±6%.
    hw: g.hw * (1 - 0.5 * ramp) * (0.94 + 0.12 * wave),
    rough: Math.min(1, g.rough * (0.8 + 0.8 * ramp)),
    events: Math.min(1, g.events * (0.9 + 0.35 * wave)),
    cracks: Math.min(1, g.cracks * (0.45 + 1.05 * ramp)),
    temp: ramp,
    grain: 0.3 + 0.7 * ramp,
    decalEvery: g.decalEvery,
  };
}

// ---------------------------------------------------------------------------
// Silhouette — the channel's grammar. Events, not just amplitude.
// ---------------------------------------------------------------------------

export interface ChannelSample {
  depth: number;
  /** Half-widths left and right of the centre line, in depth units. */
  l: number;
  r: number;
  /** True where an overhang shelf occludes the rock just below (renderer draws a lip). */
  overhangL?: boolean;
  overhangR?: boolean;
}

type EventKind = 'chamber' | 'pinch' | 'ledge' | 'overhang';
interface SilEvent { at: number; span: number; kind: EventKind; side: -1 | 0 | 1; mag: number; }

/** Per-style character: how the walls jitter, corner, and which events they favour. */
function styleMod(style: WallStyle): {
  jitterAmp: number; jitterFreq: number; corner: 'round' | 'sharp' | 'facet'; asym: number;
  mix: Record<EventKind, number>;
} {
  switch (style) {
    case 'angular':     return { jitterAmp: 0.5, jitterFreq: 0.5, corner: 'sharp',  asym: 0.3, mix: { chamber: 0.25, pinch: 0.3, ledge: 0.35, overhang: 0.1 } };
    case 'organic':     return { jitterAmp: 0.9, jitterFreq: 0.9, corner: 'round',  asym: 0.7, mix: { chamber: 0.4, pinch: 0.15, ledge: 0.25, overhang: 0.2 } };
    case 'crystalline': return { jitterAmp: 0.4, jitterFreq: 0.35, corner: 'facet', asym: 0.4, mix: { chamber: 0.2, pinch: 0.35, ledge: 0.35, overhang: 0.1 } };
    case 'jagged':      return { jitterAmp: 1.0, jitterFreq: 1.3, corner: 'sharp',  asym: 0.5, mix: { chamber: 0.25, pinch: 0.3, ledge: 0.25, overhang: 0.2 } };
    case 'void':        return { jitterAmp: 1.2, jitterFreq: 0.7, corner: 'round',  asym: 0.9, mix: { chamber: 0.5, pinch: 0.05, ledge: 0.15, overhang: 0.3 } };
    case 'sacred':      return { jitterAmp: 0.3, jitterFreq: 0.3, corner: 'round',  asym: 0.15, mix: { chamber: 0.45, pinch: 0.25, ledge: 0.25, overhang: 0.05 } };
    case 'soft':
    default:            return { jitterAmp: 0.7, jitterFreq: 0.7, corner: 'round',  asym: 0.55, mix: { chamber: 0.35, pinch: 0.2, ledge: 0.3, overhang: 0.15 } };
  }
}

function pickEvent(rng: () => number, mix: Record<EventKind, number>): EventKind {
  const total = mix.chamber + mix.pinch + mix.ledge + mix.overhang;
  let r = rng() * total;
  for (const k of ['chamber', 'pinch', 'ledge', 'overhang'] as EventKind[]) {
    if ((r -= mix[k]) <= 0) return k;
  }
  return 'chamber';
}

/** Corner treatment for a style — sharp/facet quantise the width into planes. */
function applyCorner(w: number, corner: 'round' | 'sharp' | 'facet', base: number): number {
  if (corner === 'sharp') return Math.round(w / (base * 0.22)) * (base * 0.22);
  if (corner === 'facet') return Math.round(w / (base * 0.16)) * (base * 0.16);
  return w;
}

/**
 * The channel silhouette across a depth range, sampled `samplesPerDepth` times a
 * depth. Grammar events (long narrows, chambers, ledges, overhangs, pinches) are
 * rolled deterministically from the chunk seed; between them the walls drift on
 * per-style jitter. If this is right, three flat colours would still look good.
 */
/** Events are rolled on a GLOBAL depth grid (not per chunk), so the silhouette
 *  is continuous across chunk boundaries — no seam where two bakes meet. */
const EVENT_CELL = 4;
function eventsInCell(shellId: string, cell: number, mod: ReturnType<typeof styleMod>): SilEvent[] {
  const rng = mulberry32(hashSeed(shellId, cell) ^ 0x51ed);
  const out: SilEvent[] = [];
  for (let k = 0; k < EVENT_CELL; k++) {
    const d = cell * EVENT_CELL + k;
    if (d < 0) { rng(); rng(); rng(); rng(); continue; }
    const drift = driftParams(shellId, d);
    // A hand-dug shaft, not a chain of caverns: events are RARE (~1 per ~10 depths)
    // and GENTLE (a chamber is a soft widening, not a cavern). The channel is then
    // hard-clamped in channelProfile so the widest/narrowest never exceed ~2×.
    if (rng() < drift.events * 0.2) {
      const kind = pickEvent(rng, mod.mix);
      const span = 3 + Math.floor(rng() * 4); // spread wide → gentle slopes
      const side: -1 | 0 | 1 = kind === 'chamber' || kind === 'pinch' ? 0 : rng() < 0.5 ? -1 : 1;
      // Subtle: a chamber widens ~1.5×, a pinch narrows toward ~0.7×.
      const mag = 0.3 + rng() * 0.45;
      out.push({ at: d + rng(), span, kind, side, mag });
    } else { rng(); rng(); rng(); rng(); } // keep the stream aligned
  }
  return out;
}

export function channelProfile(
  shellId: string,
  d0: number,
  d1: number,
  samplesPerDepth = 3,
): ChannelSample[] {
  const g = shaftGrammar(shellId);
  const mod = styleMod(g.style);
  // Per-shell (not per-chunk) jitter phase, so the walls join across boundaries.
  const phase = (hashSeed(shellId, 0) % 6283) / 1000;

  // Gather events from every cell that could reach into [d0, d1] (max span ~6).
  const events: SilEvent[] = [];
  const c0 = Math.floor((d0 - 6) / EVENT_CELL);
  const c1 = Math.floor((d1 + 6) / EVENT_CELL);
  for (let c = c0; c <= c1; c++) events.push(...eventsInCell(shellId, c, mod));

  const out: ChannelSample[] = [];
  const step = 1 / samplesPerDepth;
  for (let d = d0; d < d1 + 1e-6; d += step) {
    const drift = driftParams(shellId, d);
    const base = drift.hw;
    let l = base;
    let r = base;
    let ohL = false;
    let ohR = false;

    for (const ev of events) {
      const dist = Math.abs(d - ev.at);
      if (dist > ev.span) continue;
      const bell = Math.cos((dist / ev.span) * (Math.PI / 2)); // 1 at centre → 0 at edge
      const amt = ev.mag * base * bell;
      if (ev.kind === 'chamber') { l += amt; r += amt; }
      else if (ev.kind === 'pinch') { l -= amt * 0.85; r -= amt * 0.85; }
      else if (ev.kind === 'ledge') { if (ev.side < 0) l -= amt * 0.9; else r -= amt * 0.9; }
      else if (ev.kind === 'overhang') {
        if (ev.side < 0) { l += amt * 0.7; if (bell > 0.7 && d > ev.at) ohL = true; }
        else { r += amt * 0.7; if (bell > 0.7 && d > ev.at) ohR = true; }
      }
    }

    // Per-style jitter — ragged, not a clean sine (weighted to higher harmonics
    // so the wall has texture between events rather than reading as one wave).
    const jf = mod.jitterFreq;
    const jl = Math.sin(d * 1.7 * jf + phase) * 0.3 + Math.sin(d * 4.3 * jf) * 0.28 + Math.sin(d * 9.1 * jf + 1.3) * 0.18;
    const jr = Math.sin(d * 1.9 * jf + 2.1) * 0.3 + Math.sin(d * 5.1 * jf) * 0.28 + Math.sin(d * 10.7 * jf + 0.6) * 0.18;
    l += jl * drift.rough * base * mod.jitterAmp * (0.7 + mod.asym * 0.6);
    r += jr * drift.rough * base * mod.jitterAmp;

    // Hard-clamp each wall to [0.6, 1.7]×base so the widest chamber is at most ~2×
    // the tightest pinch — a shaft that breathes, never a cavern.
    l = Math.min(base * 1.7, Math.max(base * 0.6, applyCorner(l, mod.corner, base)));
    r = Math.min(base * 1.7, Math.max(base * 0.6, applyCorner(r, mod.corner, base)));
    out.push({ depth: d, l, r, overhangL: ohL || undefined, overhangR: ohR || undefined });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cracks — branching polylines, lit from within, brightest near the channel.
// ---------------------------------------------------------------------------

export interface CrackPoint { x: number; y: number; dist: number; }
export interface Crack { pts: CrackPoint[]; }

/**
 * The single biggest contributor to the look: fracture networks that branch out
 * into the rock from near the channel, glowing additively and fading with
 * distance. `x` is a signed offset from the channel edge in depth units (into the
 * rock), `y` is depth; `dist` (0 at the edge, growing) drives the glow falloff.
 */
export function crackNetwork(shellId: string, chunkIndex: number, d0: number, d1: number): Crack[] {
  const g = shaftGrammar(shellId);
  const mod = styleMod(g.style);
  const rng = mulberry32(hashSeed(shellId, chunkIndex) ^ 0xc7ac);
  const cracks: Crack[] = [];
  const density = driftParams(shellId, (d0 + d1) / 2).cracks; // 0..1, drives branchiness + reach
  const jag = mod.corner === 'round' ? 0.6 : 1.2; // angular styles fork sharply

  // Grow one polyline of `steps` short segments outward from (fromX, fromY),
  // pushing INTO the rock (sign carried by `side`). `x` is a signed offset from
  // the channel edge in depth units; `dist` accumulates for the glow/taper falloff.
  const grow = (fromX: number, fromY: number, fromDist: number, ang: number, side: -1 | 1, steps: number): CrackPoint[] => {
    const pts: CrackPoint[] = [{ x: fromX, y: fromY, dist: fromDist }];
    let x = fromX, y = fromY, dist = fromDist, a = ang;
    for (let s = 0; s < steps; s++) {
      const len = 0.3 + rng() * 0.5; // short segments
      a += (rng() - 0.5) * jag;
      x += Math.cos(a) * len * side;
      y += Math.sin(a) * len;
      dist += len;
      pts.push({ x, y, dist });
    }
    return pts;
  };

  // Origins every 2-4 depths along BOTH walls — dense enough that no patch of
  // rock near the channel is crack-free. Each trunk throws 2-3 branches, and a
  // branch sometimes sub-branches, so the mouths spread into a web.
  for (const side of [-1, 1] as const) {
    let d = d0 + rng() * 3;
    while (d < d1) {
      const outAng = 0.2 + rng() * 0.7; // lean outward into the rock
      const trunk = grow(0, d, 0, outAng, side, 3 + Math.floor(rng() * 3));
      cracks.push({ pts: trunk });
      const nb = 1 + Math.floor(rng() * (1 + density * 2)); // 1..~3, denser shells branch more
      for (let b = 0; b < nb; b++) {
        const anchor = trunk[1 + Math.floor(rng() * (trunk.length - 1))]!;
        const bAng = outAng + (rng() - 0.5) * 1.6;
        const branch = grow(anchor.x, anchor.y, anchor.dist, bAng, side, 2 + Math.floor(rng() * 3));
        cracks.push({ pts: branch });
        if (rng() < 0.2 + density * 0.4) {
          const a2 = branch[1 + Math.floor(rng() * (branch.length - 1))]!;
          cracks.push({ pts: grow(a2.x, a2.y, a2.dist, bAng + (rng() - 0.5) * 1.8, side, 1 + Math.floor(rng() * 2)) });
        }
      }
      d += 2 + rng() * 2; // every 2-4 depths
    }
  }
  return cracks;
}

// ---------------------------------------------------------------------------
// Decals — sparse. One you notice beats fifty you don't.
// ---------------------------------------------------------------------------

export interface Decal { depth: number; side: -1 | 1; kind: string; scale: number; rot: number; }

export function decals(shellId: string, chunkIndex: number, d0: number, d1: number): Decal[] {
  const g = shaftGrammar(shellId);
  const rng = mulberry32(hashSeed(shellId, chunkIndex) ^ 0xdeca1);
  const out: Decal[] = [];
  let d = d0 + rng() * g.decalEvery;
  while (d < d1) {
    out.push({
      depth: d,
      side: rng() < 0.5 ? -1 : 1,
      kind: g.decals[Math.floor(rng() * g.decals.length)]!,
      scale: 0.8 + rng() * 0.7,
      rot: (rng() - 0.5) * 0.5,
    });
    d += g.decalEvery * (0.6 + rng() * 0.9); // 1 per 8–15-ish, jittered
  }
  return out;
}
