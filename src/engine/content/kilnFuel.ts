/**
 * KILN FUEL (THE FACE CLUSTER, v21) — a burn profile is a CHOICE, not a ladder.
 *
 * Every fuel trades the same two things against each other, so none is strictly
 * best: how FAST it brings the kiln to temperature versus how well it HOLDS that
 * temperature when the feed stutters. A hot-fast fuel spikes and fades; a slow-even
 * fuel is patient and forgiving. The bare kiln (no fuel) is the baseline you start
 * with and can always fall back to.
 *
 * PILLAR 2: fuel changes the heat DYNAMICS (when you reach peak efficiency and how
 * long you hold it), never the efficiency CAP. `kilnEfficiency` still tops out at
 * 1.0, so a well-fuelled kiln reaches full output sooner — it does not raise it.
 *
 * NO NEW CURRENCY: a fuel is an existing material you already gather. Feeding one
 * consumes a trickle of it; when it runs dry the kiln simply burns bare.
 */
export interface KilnFuel {
  id: string;
  name: string;
  note: string;
  /** The material this fuel consumes while feeding (an existing material). */
  materialId: string;
  /** Material burned per second while feeding. Small — a texture, not a tax. */
  burnPerSec: number;
  /** Multiplier on how fast the kiln heats (higher = quicker to temperature). */
  heatUpMult: number;
  /** Multiplier on how fast it cools when starved (lower = holds heat longer). */
  coolMult: number;
}

/** Shell-I fuels — the pattern; each shell can add its own later. Ordered from
 *  hot-and-fast to slow-and-even so the trade reads at a glance. */
export const KILN_FUELS: KilnFuel[] = [
  { id: 'ash', name: 'Ash', note: 'Catches at once and gutters just as fast. All spark, no patience — brilliant if you can feed it without pause.', materialId: 'ash', burnPerSec: 0.5, heatUpMult: 1.8, coolMult: 1.7 },
  { id: 'marl', name: 'Marl', note: 'A middling stone that burns like a middling stone: neither quick nor stubborn, and never lets you down.', materialId: 'marl', burnPerSec: 0.35, heatUpMult: 1.25, coolMult: 1.0 },
  { id: 'loam', name: 'Packed Loam', note: 'Slow to take and slower to let go. Bank it once and a stuttering feed barely dents the heat.', materialId: 'loam', burnPerSec: 0.4, heatUpMult: 0.85, coolMult: 0.45 },
];

export function kilnFuel(id: string | null | undefined): KilnFuel | undefined {
  return id ? KILN_FUELS.find((f) => f.id === id) : undefined;
}

// OVERSTOKE — the deliberate burst. Opt-in, foreseeable, never accidental: you
// pay Dust up front, get a short window of lifted output, then a cooldown before
// it can be lit again. The Cinder greedy-line shape, at the Kiln.
export const OVERSTOKE_WINDOW_SEC = 20;
export const OVERSTOKE_COOLDOWN_SEC = 90;
export const OVERSTOKE_EFF_MULT = 1.6;
/** Up-front Dust cost = this × the kiln's per-second intake (so it scales sanely). */
export const OVERSTOKE_COST_SECONDS = 25;
