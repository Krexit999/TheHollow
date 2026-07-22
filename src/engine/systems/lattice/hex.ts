/**
 * Axial hex math for the Lattice board (pointy-top). Pure helpers, no state.
 */

export interface Axial {
  q: number;
  r: number;
}

export const hexKey = (q: number, r: number): string => `${q},${r}`;

export function parseKey(key: string): Axial {
  const [q, r] = key.split(',').map(Number);
  return { q: q!, r: r! };
}

/** The six neighbour directions. */
export const HEX_DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

/** The three straight-line axes (each covers both directions). */
export const LINE_AXES: Axial[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: 1, r: -1 },
];

export function hexDistance(a: Axial, b: Axial): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
}

/** All cells within `rings` of the centre. rings=1 -> 7 hexes, 4 -> 61. */
export function boardCells(rings: number): Axial[] {
  const out: Axial[] = [];
  for (let q = -rings; q <= rings; q++) {
    for (let r = Math.max(-rings, -q - rings); r <= Math.min(rings, -q + rings); r++) {
      out.push({ q, r });
    }
  }
  return out;
}

export function cellCount(rings: number): number {
  return 1 + 3 * rings * (rings + 1);
}

export function inBoard(q: number, r: number, rings: number): boolean {
  return hexDistance({ q, r }, { q: 0, r: 0 }) <= rings;
}

/**
 * THE NAVEL — the centre socket is fused shut. With it sealed, no three of
 * ring 1's sockets are collinear: the opening board literally cannot form a
 * chord. Ring 1 teaches resonance; lines wait for the second ring.
 */
export function isSealed(q: number, r: number): boolean {
  return q === 0 && r === 0;
}

export function neighborsOf(q: number, r: number): Axial[] {
  return HEX_DIRS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

/** Pixel position for rendering/pointer math (pointy-top, unit size). */
export function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r),
    y: size * 1.5 * r,
  };
}

export function pixelToHex(x: number, y: number, size: number): Axial {
  const qf = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const rf = ((2 / 3) * y) / size;
  // Cube rounding.
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}
