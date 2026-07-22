/**
 * THE OBSERVATORY — long-timer observations (10 min – 12 h) on the game
 * clock, returning Spectrum and STAR CHART pieces. Pure AFK: it finishes
 * whether you watch or not, nothing expires, nothing is missable, and no
 * observation cares what o'clock it is anywhere real.
 *
 * Charts are a collection WITH STRUCTURE: pieces assemble into eight
 * constellations; a completed constellation is a permanent, named bonus.
 * Not a currency with a longer timer.
 */
import { D } from '../../decimal';
import type { ActionResult, EngineCtx, GameState } from '../../types';
import { addCurrency } from '../../resources';
import { registerModifier, type Bucket } from '../../modifiers';
import { masteryLevel } from '../../systems/mastery';

export interface ObservationTier {
  id: number;
  name: string;
  minutes: number;
  spectrum: number;
  pieceRolls: number;
}

export const OBSERVATION_TIERS: ObservationTier[] = [
  { id: 0, name: 'A Glance Upward', minutes: 10, spectrum: 5, pieceRolls: 1 },
  { id: 1, name: 'A Held Gaze', minutes: 60, spectrum: 40, pieceRolls: 2 },
  { id: 2, name: 'A Long Watch', minutes: 240, spectrum: 190, pieceRolls: 4 },
  { id: 3, name: 'A Night of Stars', minutes: 720, spectrum: 640, pieceRolls: 8 },
];

export interface ConstellationDef {
  id: string;
  name: string;
  pieces: string[]; // four each
  bonus: { bucket: Bucket; value: number; label: string };
  flavor: string;
}

const C = (id: string, name: string, bucket: Bucket, value: number, label: string, flavor: string): ConstellationDef => ({
  id, name, pieces: [0, 1, 2, 3].map((i) => `${id}.${i}`), bonus: { bucket, value, label }, flavor,
});

export const CONSTELLATIONS: ConstellationDef[] = [
  C('pick', 'The Pick', 'dustYield', 1.04, '+4% chip yield', 'Four stars in a swing. Delvers navigate by work.'),
  C('lamp', 'The Lamp', 'xpGain', 1.04, '+4% XP', 'It never goes out. Dovekin approves.'),
  C('wheel', 'The Wheel', 'drillSpeed', 1.05, '+5% drill speed', 'It turns whether you push or not.'),
  C('moth', 'The Moth', 'motifGain', 1.05, '+5% Motifs', 'Forever circling the Lamp, one square east.'),
  C('stair', 'The Stair', 'descendCost', 0.97, '−3% descend cost', 'Every culture sees stairs. Down here, they go down.'),
  C('vein', 'The Vein', 'dropRate', 1.05, '+5% drops', 'A crack of stars with something glittering in it.'),
  C('warden', 'The Warden', 'strikePower', 1.05, '+5% strike power', 'It watches the Door. It has always watched the Door.'),
  C('door', 'The Door', 'offlineEffAdd', 0.02, '+2% offline efficiency', 'Closed, in every sky, so far.'),
];

export function observatoryUnlocked(state: GameState): boolean {
  return masteryLevel(state, 'glassmere') >= 2;
}

export function startObservation(state: GameState, tierId: number): ActionResult {
  if (!observatoryUnlocked(state)) return { ok: false, reason: 'The Observatory wants Glassmere Mastery 2' };
  if (state.observatory.active) return { ok: false, reason: 'The lens is already committed' };
  const tier = OBSERVATION_TIERS.find((t) => t.id === tierId);
  if (!tier) return { ok: false, reason: 'No such exposure' };
  state.observatory.active = { tier: tierId, startedMs: state.guild.clockMs };
  return { ok: true };
}

export function observationProgress(state: GameState): number {
  const a = state.observatory.active;
  if (!a) return 0;
  const tier = OBSERVATION_TIERS[a.tier]!;
  return Math.min(1, (state.guild.clockMs - a.startedMs) / (tier.minutes * 60_000));
}

/** Collection is explicit — the completed exposure WAITS, it never expires. */
export function collectObservation(state: GameState, ctx: EngineCtx): ActionResult {
  const a = state.observatory.active;
  if (!a) return { ok: false, reason: 'Nothing on the lens' };
  if (observationProgress(state) < 1) return { ok: false, reason: 'Still exposing — the stars are slow and honest' };
  const tier = OBSERVATION_TIERS[a.tier]!;
  state.observatory.active = null;
  state.observatory.completed += 1;
  addCurrency(state, 'spectrum', D(tier.spectrum));
  const found: string[] = [];
  for (let i = 0; i < tier.pieceRolls; i++) {
    // Bias toward pieces you lack — collections complete, never taunt.
    const missing: string[] = [];
    const owned: string[] = [];
    for (const con of CONSTELLATIONS) {
      for (const p of con.pieces) ((state.observatory.pieces[p] ?? 0) === 0 ? missing : owned).push(p);
    }
    const pool = missing.length > 0 && Math.random() < 0.7 ? missing : [...missing, ...owned];
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    state.observatory.pieces[pick] = (state.observatory.pieces[pick] ?? 0) + 1;
    found.push(pick);
  }
  for (const con of CONSTELLATIONS) {
    if (state.observatory.constellations.includes(con.id)) continue;
    if (con.pieces.every((p) => (state.observatory.pieces[p] ?? 0) > 0)) {
      state.observatory.constellations.push(con.id);
      ctx.emit({ type: 'constellation', id: con.id });
    }
  }
  ctx.dirty();
  ctx.emit({ type: 'observationDone', tier: a.tier, pieces: found.length });
  return { ok: true, data: { spectrum: tier.spectrum, found } };
}

export function registerObservatoryModifiers(): void {
  for (const con of CONSTELLATIONS) {
    const additive = con.bonus.bucket === 'offlineEffAdd';
    registerModifier({
      id: `constellation.${con.id}`,
      label: `${con.name} (constellation)`,
      bucket: con.bonus.bucket,
      value: (s) =>
        s.observatory.constellations.includes(con.id)
          ? con.bonus.value
          : additive ? 0 : 1,
    });
  }
}

export function defaultObservatoryState(): GameState['observatory'] {
  return { active: null, completed: 0, pieces: {}, constellations: [] };
}
