/**
 * SHELL WEATHER — each shell cycles conditions on the GAME clock (played +
 * away, the same persistent clock the Guild runs on; nothing here reads the
 * wall clock, so no hour of anyone's day is privileged).
 *
 * Anti-patterns are structural, and they matter more here than anywhere:
 *   - every state's modifiers are ≥ 1 — the NEUTRAL state is the floor and
 *     the variance is all upside;
 *   - no content, drop, species, or unlock exists only under a weather;
 *   - segments are ~50 minutes, so any session sees weather move, and a
 *     once-a-week player misses nothing that doesn't come back tomorrow.
 *
 * Cinder's eruptions are REGISTERED but stubbed until Phase 9.
 */
import type { GameState } from '../types';
import type { EngineCtx } from '../types';
import { registerModifier, type Bucket } from '../modifiers';
import { currentShell } from '../shells';
import { sealed } from '../laws';

export const WEATHER_SEGMENT_MS = 50 * 60_000;

export interface WeatherDef {
  id: string;
  shellId: string;
  name: string;
  blurb: string;
  /** Roll weight within its shell (neutral is heaviest). */
  weight: number;
  /** All values ≥ 1 — enforced by test. Empty for neutral states. */
  mods: Array<{ bucket: Bucket; value: number }>;
  /** Growth aging multiplier (Verdance's bloom season reads this). */
  growthAging?: number;
  /** Greenhouse growth multiplier (spore wind). */
  greenhouse?: number;
  neutral?: boolean;
  /** Colorblind-safe glyph for the face chip. */
  glyph: string;
}

export const WEATHER: WeatherDef[] = [
  // ------------------------------- LOAM ----------------------------------
  { id: 'stillness', shellId: 'loam', name: 'Stillness', blurb: 'The rock holds its breath. Nothing moves that you don\'t move.', weight: 40, mods: [], neutral: true, glyph: '◦' },
  { id: 'dampBloom', shellId: 'loam', name: 'Damp Bloom', blurb: 'Wet air down the shaft. Things glitter that usually hide.', weight: 20, mods: [{ bucket: 'dropRate', value: 1.25 }], glyph: '❋' },
  { id: 'warmSeams', shellId: 'loam', name: 'Warm Seams', blurb: 'The loam runs warm and eager. Cells drink faster.', weight: 20, mods: [{ bucket: 'regen', value: 1.2 }], glyph: '≈' },
  { id: 'singingGrit', shellId: 'loam', name: 'Singing Grit', blurb: 'The dust hums old lessons. You learn without meaning to.', weight: 20, mods: [{ bucket: 'xpGain', value: 1.2 }], glyph: '♪' },
  // ------------------------------ FERRITE --------------------------------
  { id: 'calmField', shellId: 'ferrite', name: 'Calm Field', blurb: 'The needles rest. The rails keep their opinions to themselves.', weight: 40, mods: [], neutral: true, glyph: '◦' },
  { id: 'magneticStorm', shellId: 'ferrite', name: 'Magnetic Storm', blurb: 'The field SINGS. Chains bite twice as deep while it lasts.', weight: 20, mods: [{ bucket: 'chainPower', value: 2 }], glyph: '⚡' },
  { id: 'auroraRails', shellId: 'ferrite', name: 'Aurora on the Rails', blurb: 'Cold light walks the bore. The drills keep time with it.', weight: 20, mods: [{ bucket: 'drillSpeed', value: 1.25 }], glyph: '∿' },
  { id: 'nullLull', shellId: 'ferrite', name: 'Null Lull', blurb: 'Interference drops to nothing. Surveys read clean and fast.', weight: 20, mods: [{ bucket: 'assaySpeed', value: 1.5 }], glyph: '·' },
  // ------------------------------ VERDANCE -------------------------------
  { id: 'overcast', shellId: 'verdance', name: 'Green Overcast', blurb: 'The canopy-light goes flat. The shell dozes, photosynthetically.', weight: 40, mods: [], neutral: true, glyph: '◦' },
  { id: 'bloomSeason', shellId: 'verdance', name: 'Bloom Season', blurb: 'Everything flowers at once, indecently. Vines age double-quick.', weight: 20, mods: [{ bucket: 'dropRate', value: 1.15 }], growthAging: 2, glyph: '✿' },
  { id: 'sporeWind', shellId: 'verdance', name: 'Spore Wind', blurb: 'A slow warm wind of green dust. The Greenhouse breathes it in.', weight: 20, mods: [{ bucket: 'dustYield', value: 1.1 }], greenhouse: 1.5, glyph: '፨' },
  { id: 'amberHeat', shellId: 'verdance', name: 'Amber Heat', blurb: 'The deep resin runs soft. The rock sweats gold.', weight: 20, mods: [{ bucket: 'regen', value: 1.15 }], glyph: '☉' },
  // ------------------------------ GLASSMERE ------------------------------
  { id: 'stillAir', shellId: 'glassmere', name: 'Still Air', blurb: 'The mere holds its breath. Light travels honestly.', weight: 40, mods: [], neutral: true, glyph: '◦' },
  { id: 'splitLight', shellId: 'glassmere', name: 'Split Light', blurb: 'The air itself turns prism. Everything glitters, and some of it is real.', weight: 20, mods: [{ bucket: 'dropRate', value: 1.25 }], glyph: '◬' },
  { id: 'hoarfrost', shellId: 'glassmere', name: 'Hoarfrost', blurb: 'Frost writes its survey on every surface. Reading it is quick work.', weight: 20, mods: [{ bucket: 'assaySpeed', value: 1.5 }], glyph: '❄' },
  { id: 'longExposure', shellId: 'glassmere', name: 'Long Exposure', blurb: 'The light stays. So do the lessons.', weight: 20, mods: [{ bucket: 'xpGain', value: 1.2 }], glyph: '☼' },
  // ------------------------------- CINDER (Phase 9, live) -----------------
  // Eruptions interact with Pressure FAVORABLY ONLY — the anti-pattern rule
  // (floor neutral, variance all upside) outranks drama. An eruption never
  // adds heat; it opens vents, rains ore, or anneals the pour.
  { id: 'cinderCalm', shellId: 'cinder', name: 'Banked Ash', blurb: 'The mountain holds its breath. The floor, as always, is the floor.', weight: 40, mods: [], neutral: true, glyph: '◦' },
  { id: 'updraft', shellId: 'cinder', name: 'Updraft', blurb: 'The eruption below breathes OUT — every vent in the network runs half again as hard. Run hotter; it is carrying it for you.', weight: 20, mods: [], glyph: '▲' },
  { id: 'emberRain', shellId: 'cinder', name: 'Ember Rain', blurb: 'The eruption throws its treasury into the shaft. Hold out your hands.', weight: 20, mods: [{ bucket: 'dropRate', value: 1.3 }], glyph: '☄' },
  { id: 'annealingWind', shellId: 'cinder', name: 'Annealing Wind', blurb: 'Hot wind off the deep vents tempers everything mid-pour. The Slagworks drinks it.', weight: 20, mods: [{ bucket: 'kilnRate', value: 1.5 }], glyph: '≋' },
  // ------------------------------- HOLLOW (Phase 10) -----------------------
  { id: 'plainQuiet', shellId: 'hollow', name: 'Plain Quiet', blurb: 'Ordinary nothing. The floor, as always, is the floor — even when there is no floor.', weight: 40, mods: [], neutral: true, glyph: '◦' },
  { id: 'thinVeil', shellId: 'hollow', name: 'A Thin Veil', blurb: 'The absence wears thin, and what the beam finds through it glitters.', weight: 20, mods: [{ bucket: 'dropRate', value: 1.25 }], glyph: '◌' },
  { id: 'deepListening', shellId: 'hollow', name: 'Deep Listening', blurb: 'The quiet leans closer. Lessons carry.', weight: 20, mods: [{ bucket: 'xpGain', value: 1.25 }], glyph: '〰' },
  { id: 'kindEcho', shellId: 'hollow', name: 'A Kind Echo', blurb: 'Every strike returns a little of itself. The nothing is being generous today.', weight: 20, mods: [{ bucket: 'dustYield', value: 1.15 }], glyph: '∴' },
  // ------------------------------- ALEPH (Phase 10) ------------------------
  { id: 'fairCopy', shellId: 'aleph', name: 'Fair Copy', blurb: 'The manuscript rests. The floor is neutral, one last time, on principle.', weight: 50, mods: [], neutral: true, glyph: '◦' },
  { id: 'openInk', shellId: 'aleph', name: 'Open Ink', blurb: 'The well is uncapped and the margins accept suggestions.', weight: 50, mods: [{ bucket: 'dropRate', value: 1.3 }], glyph: '✒' },
];

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function weatherSegment(state: GameState): number {
  return Math.floor(state.guild.clockMs / WEATHER_SEGMENT_MS);
}

/** Deterministic current weather for a shell at the current clock segment.
 * Until the Guild opens, everything reads neutral — the Lamphouse folk are
 * the ones who NAME the weather, and the opening hour stays calm. */
export function weatherFor(state: GameState, shellId: string): WeatherDef {
  const pool = WEATHER.filter((w) => w.shellId === shellId);
  const fallback = pool.find((w) => w.neutral) ?? WEATHER[0]!;
  if (!state.guild.discovered) return fallback;
  // THE FLAT WORLD (challenge): every shell reads neutral, forever.
  if (sealed(state, 'sealWeather')) return fallback;
  if (pool.length === 0) return fallback;
  const rng = mulberry32(hash32(shellId) ^ (weatherSegment(state) * 2654435761));
  let total = 0;
  for (const w of pool) total += w.weight;
  let pick = rng() * total;
  for (const w of pool) {
    pick -= w.weight;
    if (pick <= 0) return w;
  }
  return fallback;
}

export function currentWeather(state: GameState): WeatherDef {
  return weatherFor(state, currentShell(state).id);
}

/** Growth aging multiplier from the current shell's weather (≥ 1). */
export function growthAgingMult(state: GameState): number {
  return currentWeather(state).growthAging ?? 1;
}

export function greenhouseWeatherMult(state: GameState): number {
  return currentWeather(state).greenhouse ?? 1;
}

/** Emits a toastable event when the segment turns. Called each engine step. */
export function tickWeather(state: GameState, ctx: EngineCtx): void {
  const seg = weatherSegment(state);
  if (state.weatherSeg === seg) return;
  state.weatherSeg = seg;
  ctx.dirty(); // weather modifiers changed — the cache must re-read
  const w = currentWeather(state);
  if (!w.neutral) ctx.emit({ type: 'weatherChanged', id: w.id, name: w.name, blurb: w.blurb });
}

/** One modifier per (weather, bucket) — active only in its shell + segment. */
export function registerWeatherModifiers(): void {
  for (const w of WEATHER) {
    for (const m of w.mods) {
      registerModifier({
        id: `weather.${w.id}.${m.bucket}`,
        label: `${w.name} (weather)`,
        bucket: m.bucket,
        value: (s) => (currentWeather(s).id === w.id ? m.value : 1),
      });
    }
  }
}
