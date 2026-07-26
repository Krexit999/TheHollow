/**
 * RELIC ART — procedural, like the materials, for the same reason.
 *
 * There is no bound on how many relics exist, so there can be no hand-art. A
 * relic IS a palette (where it came from), a silhouette (how fine it is), an
 * inner light (how awake it is) and a set of notches (what it has eaten) — and
 * every one of those four is already in the instance. This module turns those
 * fields into a drawing, deterministically, so the same relic always looks like
 * itself across sessions and across both surfaces.
 *
 * It draws into a Pixi Graphics rather than SVG (unlike MaterialIcon) because
 * the reliquary and the gallery bake these to RenderTextures and animate the
 * lit ones — the same chunk-and-cache discipline as the Shaft.
 *
 * THE CACHE KEY IS THE POINT. `lookKey` names every field the drawing depends
 * on and nothing else, so a relic re-bakes when it wakes or is fused and never
 * on a frame where nothing about it changed.
 */
import { Graphics } from 'pixi.js';
import type { RelicInstance } from '../../engine/types';

export interface SourceLook {
  /** dark body · mid facet · bright edge/light. */
  palette: [number, number, number];
  /** The inner light's colour when it wakes. */
  ember: number;
  label: string;
}

/**
 * Where a relic came from decides what it is made of. Deliberately far apart in
 * hue: the whole point of a rendered collection is that you can tell two relics
 * apart across a room without reading a word.
 */
export const SOURCE_LOOK: Record<string, SourceLook> = {
  depth: { palette: [0x1b2430, 0x33465c, 0x6f90b4], ember: 0x8fc6ff, label: 'the deep shaft' },
  warren: { palette: [0x2a231a, 0x4c3f2c, 0x9a8259], ember: 0xf0d08a, label: 'a Warren' },
  anomaly: { palette: [0x241a2e, 0x3f2c52, 0x8f6cb4], ember: 0xd8a8ff, label: 'an anomaly' },
  well: { palette: [0x2e1a14, 0x572a1c, 0xa8532c, ], ember: 0xffa055, label: 'a Magma Well' },
  expedition: { palette: [0x18261f, 0x2c4636, 0x5e8f6b], ember: 0x9fe0b0, label: 'an expedition' },
  warden: { palette: [0x2b1618, 0x50262a, 0x9c4650], ember: 0xff8a90, label: 'a felled warden' },
};

export const lookOf = (sourceId: string): SourceLook => SOURCE_LOOK[sourceId] ?? SOURCE_LOOK['depth']!;

/** Rarity reads from the mount, not from a colour swatch. */
const RARITY_RING: Array<{ width: number; color: number; alpha: number; points: number }> = [
  { width: 0, color: 0x000000, alpha: 0, points: 0 },        // Common — bare
  { width: 1.1, color: 0x6a6252, alpha: 0.55, points: 0 },   // Uncommon
  { width: 1.4, color: 0xa9b6c4, alpha: 0.6, points: 0 },     // Rare
  { width: 1.8, color: 0xe2c76a, alpha: 0.75, points: 3 },    // Fabled
  { width: 2.2, color: 0xcdd9ff, alpha: 0.9, points: 5 },     // Mythic
];

function seededRng(seed: number): () => number {
  let a = seed + 0x6d2b79f5;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Everything the drawing depends on, and nothing else — the bake cache key. */
export function lookKey(r: RelicInstance, radius: number): string {
  return `${r.uid}|${r.source}|${r.rarity}|${r.waking ?? 0}|${r.fusedFrom}|${(r.ate ?? []).join(',')}|${Math.round(radius)}`;
}

/** The silhouette: an upright irregular stone, seeded by the relic's own uid. */
function outline(r: RelicInstance, radius: number): number[] {
  const rng = seededRng(r.uid * 2654435761 + r.rarity * 97);
  const n = 5 + Math.min(4, r.rarity);
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (rng() - 0.5) * 0.42;
    // Taller than wide: this is an object on a plinth, not an ore chunk.
    const rad = radius * (0.76 + rng() * 0.3);
    pts.push(Math.cos(a) * rad * 0.82, Math.sin(a) * rad * 1.06);
  }
  return pts;
}

/**
 * Draw one relic centred on (0,0) into `g`.
 *
 * `lit` is 0..1 — how much light is falling on it from the room, which the
 * niche and the gallery lamps both supply. It is SEPARATE from waking: a
 * dormant relic in a bright niche is clearly visible and clearly cold.
 */
export function drawRelic(g: Graphics, r: RelicInstance, radius: number, lit = 1): void {
  const look = lookOf(r.source);
  const [dark, mid, bright] = look.palette;
  const waking = r.waking ?? 0;
  const rng = seededRng(r.uid * 40503 + 11);
  const pts = outline(r, radius);

  // It sits on something: a soft contact shadow so nothing floats.
  g.ellipse(0, radius * 1.02, radius * 0.72, radius * 0.16).fill({ color: 0x000000, alpha: 0.45 });

  // Body — a vertical gradient faked as two passes, dark base then a lit face.
  g.poly(pts).fill({ color: dark, alpha: 1 });
  const face: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    face.push(pts[i]! * 0.72 - radius * 0.1, pts[i + 1]! * 0.72 - radius * 0.14);
  }
  g.poly(face).fill({ color: mid, alpha: 0.55 + 0.35 * lit });

  // Facets — a few chords across the body catch the lamp.
  const facetCount = 2 + Math.min(3, Math.floor(r.rarity / 1.5));
  for (let i = 0; i < facetCount; i++) {
    const a = Math.floor(rng() * (pts.length / 2)) * 2;
    const b = Math.floor(rng() * (pts.length / 2)) * 2;
    g.moveTo(pts[a]!, pts[a + 1]!)
      .lineTo(pts[b]! * 0.4, pts[b + 1]! * 0.4)
      .stroke({ width: Math.max(0.6, radius * 0.035), color: bright, alpha: 0.12 + 0.16 * lit });
  }

  // THE INNER LIGHT. Dormant is cold and says so; stirring cracks; awake burns.
  if (waking >= 1) {
    const strength = waking >= 2 ? 1 : 0.42;
    const veins = 2 + waking;
    for (let i = 0; i < veins; i++) {
      const a0 = rng() * Math.PI * 2;
      const len = radius * (0.5 + rng() * 0.55);
      const mx = Math.cos(a0) * len * 0.5;
      const my = Math.sin(a0) * len * 0.5;
      g.moveTo(0, 0)
        .lineTo(mx, my)
        .lineTo(Math.cos(a0 + (rng() - 0.5) * 0.9) * len, Math.sin(a0 + (rng() - 0.5) * 0.9) * len)
        .stroke({ width: Math.max(0.7, radius * 0.05), color: look.ember, alpha: 0.35 * strength + 0.3 * strength * lit });
    }
    g.circle(0, 0, radius * (0.22 + 0.12 * strength)).fill({ color: look.ember, alpha: 0.18 * strength + 0.2 * strength * lit });
  }

  // THE NOTCHES — one bite mark per relic fused in, in the colour of what it
  // ate. A much-fused relic is visibly a much-fused relic.
  const ate = r.ate ?? [];
  for (let i = 0; i < Math.min(ate.length, 10); i++) {
    const a = (i / 10) * Math.PI * 2 + 0.4;
    const nx = Math.cos(a) * radius * 0.86;
    const ny = Math.sin(a) * radius * 0.96;
    const eaten = lookOf(ate[i]!);
    g.circle(nx, ny, radius * 0.11).fill({ color: 0x000000, alpha: 0.8 });
    g.circle(nx, ny, radius * 0.06).fill({ color: eaten.palette[2], alpha: 0.55 });
  }

  // The mount. Rarity is a frame treatment, never a tint on the stone itself.
  const ring = RARITY_RING[Math.min(4, Math.max(0, r.rarity))]!;
  if (ring.width > 0) {
    g.poly(pts).stroke({ width: ring.width, color: ring.color, alpha: ring.alpha });
  }
  for (let i = 0; i < ring.points; i++) {
    const a = -Math.PI / 2 + (i / ring.points) * Math.PI * 2;
    g.circle(Math.cos(a) * radius * 1.14, Math.sin(a) * radius * 1.2, radius * 0.055)
      .fill({ color: ring.color, alpha: ring.alpha });
  }
}

/** The additive halo an awake relic throws into its niche. Drawn separately so
 *  it can pulse without re-baking the object. */
export function drawHalo(g: Graphics, r: RelicInstance, radius: number): void {
  const waking = r.waking ?? 0;
  if (waking < 1) return;
  const look = lookOf(r.source);
  const steps = 4;
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    g.circle(0, 0, radius * (1.1 + t * 1.5)).fill({
      color: look.ember,
      alpha: (waking >= 2 ? 0.055 : 0.028) * (1 - t + 0.25),
    });
  }
}
