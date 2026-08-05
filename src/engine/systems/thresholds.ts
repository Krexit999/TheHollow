/**
 * §53 — the counting, the crossing, and the six things the world then does.
 *
 * The rules live in `content/thresholds.ts`; this is the slice, the tick and the
 * queries the six shells read. Every effect below is a QUERY: the shell's own
 * system asks "has this been crossed" at the one place it matters and behaves
 * differently. Nothing here writes into another system's state, which is what
 * keeps a threshold from becoming a modifier with a story attached.
 *
 * NEVER ANNOUNCED (§53 rule 1). There is no `progressOf`, deliberately — a
 * fraction is a progress bar waiting for a panel to draw it, and the whole rule
 * is that the first you know is a row on the Roll changing. What the UI can ask
 * is `crossedHere` and `markOf`, both of which are facts about the world AFTER
 * it changed. The counters are in the save because they have to be; nothing
 * reads them but this file.
 */
import type { GameState } from '../types';
import { THRESHOLDS, thresholdFor, type ThresholdDef } from '../content/thresholds';

export interface ThresholdsState {
  /** shellId -> how much of that shell's own measure this world has taken. */
  taken: Record<string, number>;
  /** shellId -> the global's last-read value, so a delta is per-shell. */
  seen: Record<string, number>;
  /** Threshold ids crossed in THIS world. Washes on Recursion, by omission. */
  crossed: string[];
}

export function defaultThresholdsState(): ThresholdsState {
  return { taken: {}, seen: {}, crossed: [] };
}

export function ensureThresholds(state: GameState): ThresholdsState {
  const t = (state.thresholds ??= defaultThresholdsState());
  t.taken ??= {};
  t.seen ??= {};
  t.crossed ??= [];
  return t;
}

/**
 * THE GREAT FLIP's measure, banked by `polarity.ts` where a chain extends.
 *
 * ONLY WHILE STANDING IN FERRITE, and this is item 9 all over again in the one
 * rule that could not use the delta trick. The polarity SIGNATURE is carried
 * forward — a Verdance run with Ferrite's signature rings chains all day — so
 * an unguarded bank had `--scenario verdance` at 28% of THE GREAT FLIP after
 * three hours in a shell it had never been to. Measured, not reasoned about.
 */
export function bankChain(state: GameState, length: number): void {
  if (state.shell?.current !== 'ferrite') return;
  const t = ensureThresholds(state);
  t.taken['ferrite'] = (t.taken['ferrite'] ?? 0) + length;
}

export function takenIn(state: GameState, shellId: string): number {
  return state.thresholds?.taken?.[shellId] ?? 0;
}

export function crossed(state: GameState, id: string): boolean {
  return state.thresholds?.crossed?.includes(id) ?? false;
}

/** Has THIS shell's threshold gone? The question every effect below asks. */
export function crossedIn(state: GameState, shellId: string): boolean {
  const def = thresholdFor(shellId);
  return def ? crossed(state, def.id) : false;
}

/**
 * The tick. One place, six rules — the same shape `condition.ts` uses, and for
 * the same reason: a per-shell rule wired at six separate sites is six chances
 * to wire one of them to the wrong shell.
 */
export function tickThresholds(state: GameState, dt: number): ThresholdDef | null {
  if (dt <= 0) return null;
  const t = ensureThresholds(state);
  const shellId = state.shell?.current;
  const def = shellId ? thresholdFor(shellId) : undefined;
  if (!def || !shellId) return null;

  if (def.total) {
    const now = def.total(state);
    const was = t.seen[shellId];
    // ONLY INCREASES. `materials.totalDrops` is decremented by every conversion
    // (a separation is not a find), so a raw delta would run backwards and a
    // busy Refinery would un-take what the shaft gave.
    if (was !== undefined && now > was) t.taken[shellId] = (t.taken[shellId] ?? 0) + (now - was);
    t.seen[shellId] = now;
  } else if (def.rate) {
    t.taken[shellId] = (t.taken[shellId] ?? 0) + def.rate(state) * dt;
  }

  if (t.crossed.includes(def.id)) return null;
  if ((t.taken[shellId] ?? 0) < def.at) return null;
  t.crossed.push(def.id);
  def.onCross?.(state);
  return def;   // the caller emits; this file does not know about events
}

/**
 * WHAT THE WORLD DOES NOW. Six queries, each read at exactly one site.
 *
 * PILLAR 2 lives in this list being readable in one screen: a wall, a sign, a
 * vine, a wavelength, a floor and a rate of quiet. None of them is a currency,
 * a drop table or a face term, and `thresholds.test.ts` reads `dpsMax` at one
 * depth with all six crossed to say so rather than to claim it.
 */

/** LOAM — a cracked station has already given way, so its wall is down. */
export function subsided(state: GameState): boolean {
  return crossed(state, 'subsidence');
}

/** FERRITE — every pole reads the other way. */
export function flipped(state: GameState): boolean {
  return crossed(state, 'greatFlip');
}

/** VERDANCE — growth comes back faster, and comes back where you worked. */
export const FERAL_SPREAD = 1.8;
export function feralSpread(state: GameState): number {
  return crossed(state, 'feral') ? FERAL_SPREAD : 1;
}

/** GLASSMERE — there is a seventh band now. There was never a seventh band. */
export const BANDS_BENT = 7;
export function bandCount(state: GameState): number {
  return crossed(state, 'bend') ? BANDS_BENT : 6;
}

/** CINDER — the gauge will not come back below this. */
export const BURN_FLOOR = 18;
export function burnFloor(state: GameState): number {
  return crossed(state, 'burn') ? BURN_FLOOR : 0;
}

/** HOLLOW — the quiet gathers faster, and more arrives undecided. */
export const DEEPENING_SILENCE = 1.5;
export function deepening(state: GameState): number {
  return crossed(state, 'deepening') ? DEEPENING_SILENCE : 1;
}

/**
 * §53 RULE 3 — VISIBLE ON THE ROLL. Which stations in this shell carry the
 * mark, and which one gave way.
 *
 * DERIVED, NOT STORED, and that is what keeps it honest: a stored list would
 * need a migration, a reset rule and a test that it agrees with the crossing.
 * The set is a deterministic function of the Roll and the crossing, so a save
 * that loads with `subsidence` crossed shows exactly the stations it showed
 * before it was saved.
 */
export function markedStations(state: GameState, rows: Array<{ id: string; depth: number }>): string[] {
  if (!crossedIn(state, state.shell?.current ?? '')) return [];
  // The deep half of the Roll. The shell gives way where it was worked hardest,
  // which is the bottom of it — not a random pick a player cannot reason about.
  const sorted = [...rows].sort((a, b) => a.depth - b.depth);
  return sorted.slice(Math.ceil(sorted.length / 2)).map((r) => r.id);
}

/** ...and the one that is unstable. The deepest marked station, always. */
export function unstableStation(state: GameState, rows: Array<{ id: string; depth: number }>): string | null {
  const marked = markedStations(state, rows);
  if (marked.length === 0) return null;
  const deepest = [...rows].filter((r) => marked.includes(r.id)).sort((a, b) => b.depth - a.depth)[0];
  return deepest?.id ?? null;
}

export { THRESHOLDS, thresholdFor };
