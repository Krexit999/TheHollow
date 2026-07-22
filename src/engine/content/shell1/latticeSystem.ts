/**
 * THE LATTICE — the first real CraftSystem. A persistent hex board (survives
 * Collapse, will survive Breach) where Motifs resonate, Chords form, and
 * Progressions hide. All numbers here are invented (DESIGN Appendix A.9).
 */
import { D, Decimal } from '../../decimal';
import { registerCraftSystem, type CodexEntry, type CraftSystem } from '../../craft';
import type { ModifierCache } from '../../modifiers';
import { registerModifier } from '../../modifiers';
import { addCurrency, getCurrency, spendCurrency } from '../../resources';
import { stat } from '../../upgrades';
import type { ActionResult, EngineCtx, GameState, LatticeState, MotifShape } from '../../types';
import {
  boardResonance,
  detectChords,
  matchProgression,
  SHAPES,
} from '../../systems/lattice/latticeCore';
import { cellCount, hexKey, inBoard, isSealed, HEX_DIRS, LINE_AXES } from '../../systems/lattice/hex';
import { lawFlag } from '../../laws';
import {
  CHORD_BY_ID,
  CHORD_DEFS,
  DESCEND_COST_FLOOR,
  PROGRESSION_BY_ID,
  PROGRESSION_DEFS,
} from './latticeChords';
import { grantXP } from '../../systems/xp';
import { skillRank } from './skillTree';

// --- Tuning (invented; sim-checked; tightened per Phase 4 carry-forwards) ---
// Experimentation is bounded by resources, not cleverness: ~12 chords across
// Shell I, doors behind rank thresholds the early economy can't reach.
export const PASSIVE_MOTIFS_PER_SEC = 0.25 / 60;
export const CHARGE_PER_MOTIF = 1200; // chipped charge that yields 1 Motif
export const PASSIVE_RANK_SEC = 720; // 12 min per rank
export const PASSIVE_RANK_CAP = 30;
export const PASSIVE_RANK_DUST_PER = 0.025; // +2.5% dust per rank — the 50% floor
export const PRESS_BRICK_PER_SEC = 0.1;
export const PRESS_MOTIFS_PER_BRICK = 2;
export const UNCOVER_MOTIF_GRANT = 4;
/** A door chord is DISCOVERED at any rank, but only OPENS at this summed rank. */
export const DOOR_MIN_SUM_RANKS = 9;
export const REMOVE_REFUND = 0.6;
export const RING_COST_BASE = 25;
export const RING_COST_RATIO = 1.75; // structural (locked class)
export const RESONANCE_PCT_PER_POINT = 0.005;
export const RESONANCE_CAP = 1.0; // at most +100% from raw resonance
export const MAX_RINGS = 4;

export function defaultLatticeState(): LatticeState {
  return {
    unlocked: false,
    rings: 1,
    cells: {},
    placeSeq: 0,
    passiveRank: 0,
    passiveProgressSec: 0,
    discovered: [],
    discoveredProgressions: [],
    activeChords: [],
    activeProgressions: [],
    doors: { ring4: false, progressions: false, press: false },
    pressOn: false,
    pressProgress: 0,
    chargeSeen: D(0),
  };
}

/** rank² + 1 — the +1 is the experiment tax that bounds brute-force. */
export function placementCost(rank: number): Decimal {
  return D(rank * rank + 1);
}

export function upgradeCost(oldRank: number, newRank: number): Decimal {
  return D((newRank * newRank - oldRank * oldRank) * 1.25);
}

/** Max placeable rank: 2 free, +1 per Finer Chisels level. */
export function maxMotifRank(state: GameState): number {
  return Math.min(5, 2 + stat(state, 'chisels'));
}

export function ringCost(currentRings: number): Decimal {
  return D(RING_COST_BASE).mul(Decimal.pow(RING_COST_RATIO, currentRings - 1));
}

/**
 * GHOST PREVIEW (Phase 21) — what a placement would touch, in terms the player
 * can already see and count for themselves: how many sockets it neighbours, and
 * the rank total of each CONTIGUOUS run through it (the current brush included).
 *
 * PILLAR 5, deliberately: this function never inspects chords, discovered or
 * not. It reports geometry and arithmetic only, so an undiscovered chord stays
 * exactly as silent in the preview as it is on the board. Its output does not
 * depend on discovery state at all.
 */
export function latticeGhost(
  state: GameState,
  q: number,
  r: number,
  brushRank: number,
): { adjacency: number; lines: number[] } {
  const lat = state.lattice;
  let adjacency = 0;
  for (const d of HEX_DIRS) {
    if (lat.cells[hexKey(q + d.q, r + d.r)]) adjacency++;
  }
  const lines: number[] = [];
  for (const axis of LINE_AXES) {
    let sum = brushRank;
    for (const sign of [1, -1] as const) {
      let cq = q + axis.q * sign;
      let cr = r + axis.r * sign;
      // Only an unbroken run of stones counts toward the line's total.
      while (inBoard(cq, cr, lat.rings)) {
        const cell = lat.cells[hexKey(cq, cr)];
        if (!cell) break;
        sum += cell.rank;
        cq += axis.q * sign;
        cr += axis.r * sign;
      }
    }
    lines.push(sum);
  }
  return { adjacency, lines };
}

// ---------------------------------------------------------------------------
// Board mutation + discovery
// ---------------------------------------------------------------------------

/** Recompute active chords/progressions; fire discovery events for new ones. */
export function recomputeLattice(state: GameState, ctx: EngineCtx): void {
  const lat = state.lattice;
  const before = new Set(lat.activeChords.map((c) => c.id + c.cells.join('')));
  lat.activeChords = detectChords(lat);

  for (const chord of lat.activeChords) {
    const fingerprint = chord.id + chord.cells.join('');
    if (!before.has(fingerprint)) ctx.emit({ type: 'chordFormed', id: chord.id, cells: chord.cells });
    if (!lat.discovered.includes(chord.id)) {
      lat.discovered.push(chord.id);
      ctx.emit({ type: 'chordDiscovered', id: chord.id, cells: chord.cells });
    }
    // Doors open only under real weight (summed rank), then stay open forever.
    const def = CHORD_BY_ID[chord.id];
    if (def?.door && !lat.doors[def.door] && chord.sumRanks >= DOOR_MIN_SUM_RANKS) {
      lat.doors[def.door] = true;
      ctx.emit({ type: 'doorOpened', door: def.door });
    }
  }

  // Progressions exist only after the Grammar is found (a revealed system).
  lat.activeProgressions = [];
  if (lat.doors.progressions) {
    for (const def of PROGRESSION_DEFS) {
      // THE MIRRORED GRAMMAR (law): progressions also read right-to-left.
      if (
        matchProgression(lat.activeChords, def.steps) ||
        (lawFlag(state, 'progressionPalindrome') && matchProgression(lat.activeChords, [...def.steps].reverse()))
      ) {
        lat.activeProgressions.push(def.id);
        if (!lat.discoveredProgressions.includes(def.id)) {
          lat.discoveredProgressions.push(def.id);
          ctx.emit({ type: 'progressionDiscovered', id: def.id });
        }
      }
    }
  }
  ctx.dirty();
}

export function placeMotif(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  q: number,
  r: number,
  shape: MotifShape,
  rank: number,
): ActionResult {
  const lat = state.lattice;
  if (!lat.unlocked) return { ok: false, reason: 'The Lattice is still buried' };
  if (isSealed(q, r)) return { ok: false, reason: 'The Navel is fused shut. It was sealed on purpose.' };
  if (!inBoard(q, r, lat.rings)) return { ok: false, reason: 'Outside the board' };
  const key = hexKey(q, r);
  if (lat.cells[key]) return { ok: false, reason: 'Occupied' };
  if (rank < 1 || rank > maxMotifRank(state)) return { ok: false, reason: 'Rank not yet workable' };
  if (!spendCurrency(state, 'motif', placementCost(rank))) {
    return { ok: false, reason: 'Not enough Motifs' };
  }
  lat.cells[key] = { shape, rank, seq: lat.placeSeq++ };
  ctx.emit({ type: 'motifPlaced', cell: key, shape, rank });
  recomputeLattice(state, ctx);
  grantXP(state, mods, ctx, D(1));
  return { ok: true };
}

export function removeMotif(
  state: GameState,
  ctx: EngineCtx,
  q: number,
  r: number,
): ActionResult {
  const lat = state.lattice;
  const key = hexKey(q, r);
  const motif = lat.cells[key];
  if (!motif) return { ok: false, reason: 'Nothing there' };
  // A LOCKED chord guards its own sockets (Phase 21) — no misclick unmakes it.
  const locked = lat.activeChords.find(
    (c) => state.qol.lockedChords.includes(c.id) && c.cells.includes(key),
  );
  if (locked) {
    return { ok: false, reason: 'This socket holds a locked chord. Unlock it in the Codex first.' };
  }
  addCurrency(state, 'motif', placementCost(motif.rank).mul(REMOVE_REFUND));
  delete lat.cells[key];
  recomputeLattice(state, ctx);
  return { ok: true };
}

export function upgradeMotif(
  state: GameState,
  ctx: EngineCtx,
  q: number,
  r: number,
): ActionResult {
  const lat = state.lattice;
  const key = hexKey(q, r);
  const motif = lat.cells[key];
  if (!motif) return { ok: false, reason: 'Nothing there' };
  if (motif.rank >= maxMotifRank(state)) return { ok: false, reason: 'Rank not yet workable' };
  const cost = upgradeCost(motif.rank, motif.rank + 1);
  if (!spendCurrency(state, 'motif', cost)) return { ok: false, reason: 'Not enough Motifs' };
  motif.rank += 1; // placement seq is untouched — order is where it stood
  recomputeLattice(state, ctx);
  return { ok: true };
}

export function buyLatticeRing(state: GameState, ctx: EngineCtx): ActionResult {
  const lat = state.lattice;
  if (!lat.unlocked) return { ok: false, reason: 'The Lattice is still buried' };
  if (lat.rings >= MAX_RINGS) return { ok: false, reason: 'The board is whole' };
  if (lat.rings === MAX_RINGS - 1 && !lat.doors.ring4) {
    return { ok: false, reason: 'The outer ring does not answer. Something must be set first.' };
  }
  if (!spendCurrency(state, 'brick', ringCost(lat.rings))) {
    return { ok: false, reason: 'Not enough Brick' };
  }
  lat.rings += 1;
  ctx.emit({ type: 'latticeRing', rings: lat.rings });
  recomputeLattice(state, ctx); // context of edge lines can change with room
  return { ok: true, data: { rings: lat.rings, cells: cellCount(lat.rings) } };
}

// ---------------------------------------------------------------------------
// Insight hints (Marginalia skill) — escalating, never a list
// ---------------------------------------------------------------------------

const CONTEXT_PHRASE: Record<string, string> = {
  isolated: 'alone, touching nothing',
  supported: 'beside its own kind',
  flowing: 'fed by the shape that follows it on the wheel',
  opposed: 'set against its opposite',
  attended: 'in company that neither helps nor harms',
};

function hintOrder(): string[] {
  // Deterministic shuffle by id hash so hints don't march shape-by-shape.
  return CHORD_DEFS.map((c) => c.id).sort((a, b) => {
    const h = (s: string) => s.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 9973, 7);
    return h(a) - h(b);
  });
}

/** Current hint text, or null (no ranks, or everything found). */
export function currentHint(state: GameState): string | null {
  const rank = skillRank(state, 'marginalia');
  if (rank <= 0) return null;
  const target = hintOrder().find((id) => !state.lattice.discovered.includes(id));
  if (!target) return 'The margins are empty. You have read everything the Lattice has to say.';
  const def = CHORD_BY_ID[target]!;
  let text = `An undiscovered chord uses ${def.shape}s.`;
  if (rank >= 2) text += ` Its stones are ${def.uniform ? 'all of one rank' : 'of differing ranks'}.`;
  if (rank >= 3) text += ` It stands ${CONTEXT_PHRASE[def.context]}.`;
  return text;
}

// ---------------------------------------------------------------------------
// The CraftSystem implementation
// ---------------------------------------------------------------------------

function accrueMotifs(state: GameState, mods: ModifierCache, seconds: number, efficiency = 1): Decimal {
  const lat = state.lattice;
  const gainMult = mods.get(state, 'motifGain');
  // Passive trickle.
  let gained = gainMult.mul(PASSIVE_MOTIFS_PER_SEC * seconds * efficiency);
  // Chip-driven: convert charge chipped since the last watermark. Harvest
  // efficiency is already applied upstream, so no double-discount.
  const chipped = state.stats.totalChargeChipped;
  if (chipped.gt(lat.chargeSeen)) {
    gained = gained.add(chipped.sub(lat.chargeSeen).div(CHARGE_PER_MOTIF).mul(gainMult));
    lat.chargeSeen = chipped;
  }
  if (gained.gt(0)) addCurrency(state, 'motif', gained);
  return gained;
}

function accruePassiveRank(state: GameState, seconds: number, efficiency = 1): number {
  const lat = state.lattice;
  if (lat.passiveRank >= PASSIVE_RANK_CAP) return 0;
  lat.passiveProgressSec += seconds * efficiency;
  let gained = 0;
  while (lat.passiveProgressSec >= PASSIVE_RANK_SEC && lat.passiveRank < PASSIVE_RANK_CAP) {
    lat.passiveProgressSec -= PASSIVE_RANK_SEC;
    lat.passiveRank += 1;
    gained += 1;
  }
  return gained;
}

function runPress(state: GameState, seconds: number, efficiency = 1): void {
  const lat = state.lattice;
  if (!lat.doors.press || !lat.pressOn) return;
  const want = D(PRESS_BRICK_PER_SEC * seconds * efficiency);
  const eat = Decimal.min(want, getCurrency(state, 'brick'));
  if (eat.lte(0)) return;
  spendCurrency(state, 'brick', eat);
  lat.pressProgress += eat.toNumber();
  addCurrency(state, 'motif', eat.mul(PRESS_MOTIFS_PER_BRICK));
}

export const latticeSystem: CraftSystem = {
  id: 'lattice',
  name: 'The Lattice',
  currencyId: 'motif',

  unlocked: (state) => state.lattice.unlocked,

  ensureState: (state) => {
    state.lattice ??= defaultLatticeState();
    state.lattice.chargeSeen = D(state.lattice.chargeSeen ?? 0);
  },

  tick: (state, mods, ctx, dt) => {
    accrueMotifs(state, mods, dt);
    if (accruePassiveRank(state, dt) > 0) ctx.dirty();
    runPress(state, dt);
  },

  offlineTick: (state, mods, ctx, seconds, efficiency) => {
    accrueMotifs(state, mods, seconds, efficiency);
    if (accruePassiveRank(state, seconds, efficiency) > 0) ctx.dirty();
    runPress(state, seconds, efficiency);
  },

  passiveRank: (state) => state.lattice.passiveRank,

  codex: (state) => {
    const lat = state.lattice;
    const entries: CodexEntry[] = [];
    for (const id of lat.discovered) {
      const def = CHORD_BY_ID[id];
      if (!def) continue;
      const active = lat.activeChords.some((c) => c.id === id);
      const doorText = def.door === 'ring4'
        ? 'opens the fourth ring'
        : def.door === 'progressions'
          ? 'reveals Progressions'
          : 'unlocks the Press';
      const effect = def.door
        ? lat.doors[def.door]
          ? `Opened — permanently (${doorText}).`
          : `A door: ${doorText}. The seal resists — it wants combined rank ${DOOR_MIN_SUM_RANKS}.`
        : `${def.pctPerRank! > 0 ? '+' : ''}${def.pctPerRank}% ${def.bucket} per summed rank, while formed`;
      entries.push({ id, name: def.name, flavor: def.flavor, effect, active, kind: 'chord' });
    }
    for (const id of lat.discoveredProgressions) {
      const def = PROGRESSION_BY_ID[id];
      if (!def) continue;
      entries.push({
        id,
        name: def.name,
        flavor: def.flavor,
        effect: def.effects
          .map((e) => (e.bucket === 'offlineEffAdd' ? `+${e.mult * 100}% offline` : `×${e.mult} ${e.bucket}`))
          .join(', '),
        active: lat.activeProgressions.includes(id),
        kind: 'progression',
      });
    }
    return entries;
  },
};

// ---------------------------------------------------------------------------
// Modifiers — every chord shows up in the breakdown as "Lattice: <name>"
// ---------------------------------------------------------------------------

export function registerLatticeModifiers(): void {
  for (const def of CHORD_DEFS) {
    if (!def.bucket) continue;
    const bucket = def.bucket;
    const additive = bucket === 'offlineEffAdd';
    registerModifier({
      id: `lattice.chord.${def.id}`,
      label: `Lattice: ${def.name}`,
      bucket,
      value: (s) => {
        let sum = 0;
        for (const chord of s.lattice.activeChords) {
          if (chord.id === def.id) sum += chord.sumRanks;
        }
        if (sum === 0) return additive ? 0 : 1;
        if (additive) return (def.pctPerRank! / 100) * sum;
        const v = 1 + (def.pctPerRank! / 100) * sum;
        return bucket === 'descendCost' ? Math.max(DESCEND_COST_FLOOR, v) : v;
      },
    });
  }
  for (const def of PROGRESSION_DEFS) {
    for (const eff of def.effects) {
      const additive = eff.bucket === 'offlineEffAdd';
      registerModifier({
        id: `lattice.prog.${def.id}.${eff.bucket}`,
        label: `Lattice: ${def.name}`,
        bucket: eff.bucket,
        value: (s) =>
          s.lattice.activeProgressions.includes(def.id) ? eff.mult : additive ? 0 : 1,
      });
    }
  }
  // The triangle family are wedges — and wedges remember they are weapons:
  // each triangle stat chord also feeds strike power at half weight.
  for (const def of CHORD_DEFS) {
    if (def.shape !== 'triangle' || !def.bucket || def.door) continue;
    registerModifier({
      id: `lattice.chord.${def.id}.edge`,
      label: `Lattice: ${def.name} (edge)`,
      bucket: 'strikePower',
      value: (s) => {
        let sum = 0;
        for (const chord of s.lattice.activeChords) {
          if (chord.id === def.id) sum += chord.sumRanks;
        }
        return sum === 0 ? 1 : 1 + (def.pctPerRank! / 200) * sum;
      },
    });
  }
  registerModifier({
    id: 'lattice.resonance',
    label: 'Lattice: Resonance',
    bucket: 'dustYield',
    value: (s) =>
      s.lattice.unlocked
        ? 1 + Math.min(RESONANCE_CAP, boardResonance(s.lattice) * RESONANCE_PCT_PER_POINT)
        : 1,
  });
  registerModifier({
    id: 'lattice.passiveRank.dust',
    label: 'Lattice: Passive Rank',
    bucket: 'dustYield',
    value: (s) => 1 + PASSIVE_RANK_DUST_PER * s.lattice.passiveRank,
  });
  registerModifier({
    id: 'lattice.passiveRank.xp',
    label: 'Lattice: Passive Rank',
    bucket: 'xpGain',
    value: (s) => 1 + 0.01 * s.lattice.passiveRank,
  });
}

export function registerLattice(): void {
  registerCraftSystem(latticeSystem);
  registerLatticeModifiers();
}

export { SHAPES };
