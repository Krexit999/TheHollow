/**
 * THE SHAFT — palette + tiny math, kept free of any Pixi import so it can be
 * unit-tested and shared by the renderer and the HUD without pulling WebGL into
 * a headless test. Colours echo the Face themes: warm lamplight on cold stone.
 */
export interface ShaftTheme {
  stone: number;      // the rock face flanking the channel
  stoneEdge: number;  // lit lip of the channel
  warm: number;       // cleared-this-run glow
  cool: number;       // dug-but-not-walked-this-run
  glow: number;       // lantern core
  rail: number;       // laid track
  lampInner: string;  // radial lamp gradient inner
  dust: number;       // mineral speckle in the rock
}

export const SHAFT_THEMES: Record<string, ShaftTheme> = {
  loam:      { stone: 0x2a231a, stoneEdge: 0x5a4630, warm: 0xc98e4a, cool: 0x4a4048, glow: 0xf3c678, rail: 0x8a6a3f, lampInner: 'rgba(251,191,36,0.20)', dust: 0x8a6a3f },
  ferrite:   { stone: 0x1f242b, stoneEdge: 0x3c4855, warm: 0x7fa8c0, cool: 0x3a4450, glow: 0xd8eef8, rail: 0x6a7c8c, lampInner: 'rgba(160,210,235,0.20)', dust: 0x5a6a7a },
  verdance:  { stone: 0x1e281b, stoneEdge: 0x3a5030, warm: 0x8fbf5e, cool: 0x38443a, glow: 0xe6f5aa, rail: 0x6b8a4e, lampInner: 'rgba(160,220,120,0.18)', dust: 0x5a7a3f },
  glassmere: { stone: 0x212734, stoneEdge: 0x3c4a5e, warm: 0xa8c8e8, cool: 0x38424e, glow: 0xeef8ff, rail: 0x6c88a8, lampInner: 'rgba(190,220,245,0.18)', dust: 0x5a6a80 },
  cinder:    { stone: 0x271c17, stoneEdge: 0x5a3020, warm: 0xd06438, cool: 0x40342e, glow: 0xffb36a, rail: 0xa85434, lampInner: 'rgba(255,140,70,0.20)', dust: 0x7c4630 },
  hollow:    { stone: 0x0f0f16, stoneEdge: 0x24243a, warm: 0x7a72a8, cool: 0x1e1e2c, glow: 0xc8bfe8, rail: 0x635a86, lampInner: 'rgba(140,130,190,0.16)', dust: 0x4a4468 },
  aleph:     { stone: 0x1c1810, stoneEdge: 0x4a3c1e, warm: 0xd9c25c, cool: 0x3a3320, glow: 0xf0e6a8, rail: 0xa8934a, lampInner: 'rgba(230,210,120,0.20)', dust: 0x8a7838 },
};

/** The accent used in the HUD readout, matched to the Parallel View. */
export const SHELL_ACCENT: Record<string, string> = {
  loam: '#e0a860', ferrite: '#8fb8d8', verdance: '#9fd070', glassmere: '#bcd8ee',
  cinder: '#e8804c', hollow: '#a89ed0', aleph: '#f0e6a8',
};

// ---------------------------------------------------------------------------
// WALL GRAMMAR — the shape a shell's rock takes, per the art direction. Style
// drives the silhouette generator (shaftGrammar.ts); the rest are base values
// that DEPTH DRIFT then bends, so shallow and deep read as different rock.
// ---------------------------------------------------------------------------
export type WallStyle = 'soft' | 'angular' | 'organic' | 'crystalline' | 'jagged' | 'void' | 'sacred';

export interface ShaftGrammar {
  style: WallStyle;
  /** Base channel half-width, in DEPTH units (the renderer multiplies by px/depth). */
  hw: number;
  /** Wall jitter, 0 smooth .. 1 ragged. */
  rough: number;
  /** How often the silhouette throws an event (chamber/pinch/ledge/overhang). */
  events: number;
  /** Crack-network density, 0 none .. 1 dense. */
  cracks: number;
  /** The light lives in the rock: crack glow + channel rim, one hue per shell. */
  crackWarm: number;
  rim: number;
  /** Decal vocabulary and rough spacing (1 per ~N depths). */
  decals: string[];
  decalEvery: number;
}

export const SHAFT_GRAMMAR: Record<string, ShaftGrammar> = {
  // Soft irregular earth, brick shoring, root intrusion.
  loam:      { style: 'soft',       hw: 1.15, rough: 0.55, events: 0.5,  cracks: 0.45, crackWarm: 0xf3c678, rim: 0xc98e4a, decals: ['root', 'support', 'moss'],     decalEvery: 11 },
  // Angular fracture, geometric planes, ore seams.
  ferrite:   { style: 'angular',    hw: 1.0,  rough: 0.45, events: 0.62, cracks: 0.6,  crackWarm: 0xd8eef8, rim: 0x7fa8c0, decals: ['seam', 'bolt', 'fracture'],     decalEvery: 12 },
  // Organic, wet edges, vines breaching the wall.
  verdance:  { style: 'organic',    hw: 1.1,  rough: 0.6,  events: 0.55, cracks: 0.4,  crackWarm: 0xe6f5aa, rim: 0x8fbf5e, decals: ['vine', 'root', 'wetmoss'],      decalEvery: 10 },
  // Crystalline facets, the beam catching in the rock.
  glassmere: { style: 'crystalline', hw: 0.95, rough: 0.4, events: 0.7,  cracks: 0.72, crackWarm: 0xeef8ff, rim: 0xa8c8e8, decals: ['facet', 'crystal', 'beamcatch'], decalEvery: 12 },
  // Jagged, molten veins glowing through.
  cinder:    { style: 'jagged',     hw: 1.0,  rough: 0.7,  events: 0.66, cracks: 0.85, crackWarm: 0xffb36a, rim: 0xd06438, decals: ['vein', 'ember', 'crack'],        decalEvery: 9 },
  // The wall barely exists; mostly void with fragments.
  hollow:    { style: 'void',       hw: 1.55, rough: 0.85, events: 0.4,  cracks: 0.3,  crackWarm: 0xc8bfe8, rim: 0x7a72a8, decals: ['fragment', 'shard', 'void'],     decalEvery: 14 },
  // The Core's own rock: authored, gold, sacred geometry.
  aleph:     { style: 'sacred',     hw: 0.9,  rough: 0.3,  events: 0.75, cracks: 0.65, crackWarm: 0xf0e6a8, rim: 0xd9c25c, decals: ['glyph', 'goldvein'],            decalEvery: 13 },
};

export function shaftGrammar(shellId: string): ShaftGrammar { return SHAFT_GRAMMAR[shellId] ?? SHAFT_GRAMMAR['loam']!; }

export function shaftTheme(shellId: string): ShaftTheme { return SHAFT_THEMES[shellId] ?? SHAFT_THEMES['loam']!; }

export function lerp(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/** Deterministic per-depth noise, so the carved walls are irregular but stable. */
export function noise(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// THE CHANNEL IS THE LIGHT SOURCE. A warm vertical column, brightest at its
// centre, darkening to the wall contact. The loam values ARE the art-direction
// spec (implemented numerically, not interpreted); the other six shells keep the
// same luminance structure in their own hue so the seven worlds still diverge
// rather than all glowing gold.
// ---------------------------------------------------------------------------
const CHANNEL_TRIPLE: Record<string, [number, number, number]> = {
  // contact (dark, at the wall) · mid · centre (brightest)
  loam:      [0x6b3a10, 0xc47a2a, 0xffd89a], // EXACT spec
  ferrite:   [0x20415c, 0x5f97c0, 0xd6ecff],
  verdance:  [0x244a16, 0x7ab84e, 0xe6ffb4],
  glassmere: [0x264257, 0x84b8e0, 0xf0faff],
  cinder:    [0x5a2410, 0xd0662c, 0xffd39a],
  hollow:    [0x33245c, 0x8f76bd, 0xe4d6ff],
  aleph:     [0x5a4410, 0xcfae52, 0xfff0c0],
};

/** Six channel-fill colours, wall-contact → centre, passing through the mid tone. */
export function channelStops(shellId: string): number[] {
  const [c, m, b] = CHANNEL_TRIPLE[shellId] ?? CHANNEL_TRIPLE['loam']!;
  return [c, lerp(c, m, 0.5), m, lerp(m, b, 0.4), lerp(m, b, 0.72), b];
}

// Rock value as a function of distance from the channel edge (the px bands
// 0-8 / 8-25 / 25-60 / 60+). Near-black everywhere, but never PURE black — the
// rock must stay visible across the whole viewport. Loam is the exact spec;
// other shells tint half-way toward their own cold stone.
const ROCK_SPEC = [0x4a3520, 0x2e2115, 0x1a130c, 0x0e0a06];
export function rockBands(shellId: string): number[] {
  if (shellId === 'loam') return ROCK_SPEC.slice();
  const st = shaftTheme(shellId).stone;
  return ROCK_SPEC.map((c) => lerp(c, st, 0.5));
}
