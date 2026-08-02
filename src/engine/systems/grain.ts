/**
 * THE GRAIN — the face's second axis (PROOF #1, Loam only).
 *
 * The face has always had ONE number per cell (charge) and one verb (take it).
 * This module adds the second axis: every cell has a DIRECTION the rock runs in,
 * and a strike either goes WITH that direction or ACROSS it.
 *
 *   WITH   — fast, ordinary dust, +1 compaction. Safe at any depth.
 *   ACROSS — 1.8x the time, 1.3x the dust, +3 compaction, and it drives a
 *            FRACTURE FRONT one cell further along the grain field.
 *
 * COMPACTION is what the two modes are really trading in. It is not a currency
 * and it is not income — it is a per-cell counter that opens DROP TABLES at 8,
 * 14 and 20, and at 20 it also becomes lethal: an across-grain take on a cell
 * already at 18+ LOCKS that cell dead for the rest of the arc.
 *
 * WHY THIS IS NOT A SECOND FAUCET (pillar 2). Nothing here touches charge, cap
 * or regen. Compaction moves what comes OUT of the drop table — rarity, not
 * rate — and drops have always sat outside the income path. The one term that
 * touches dust is ACROSS's 1.3x, and it is bought with 1.8x the time, so the
 * per-second rate of an across-chipping player is 0.72x a with-chipping one.
 * Across-grain is a WORSE way to earn dust. That is deliberate: it has to be
 * paid for out of the ceiling, or the ceiling is a lie.
 *
 * THE FRONT is the whole point of the system. An across-chip does not bump a
 * neighbour; it puts a live fracture on the board that walks the grain field one
 * cell per across-chip, adding +1 compaction to each cell it enters. A good run
 * is a line of numbers climbing across the grid in a direction you chose, and
 * the payoff is a deep-entry drop out of a cell you never touched.
 */
import type { ModifierCache } from '../modifiers';
import type { EngineCtx, GameState } from '../types';
import { applyDrop } from './drops';
import { sealed } from '../laws';

// ---------------------------------------------------------------------------
// Constants — the tuning surface
// ---------------------------------------------------------------------------

/** N, E, S, W. GRAIN IS A VECTOR, NOT AN AXIS (decision 1). A vector gives
 *  propagation exactly one successor, so a wave is a directed path the player
 *  can read ahead of; an axis gives two and the wave becomes a coin flip. */
export type GrainDir = 0 | 1 | 2 | 3;
export const GRAIN_N: GrainDir = 0;
export const GRAIN_E: GrainDir = 1;
export const GRAIN_S: GrainDir = 2;
export const GRAIN_W: GrainDir = 3;

/**
 * THE SINGLE CONSTANT THE PATIENT MARK AND CHALLENGE #3 WILL MOVE. Neither is
 * built here; both land later as a one-line capability because this is the only
 * place the number appears.
 */
export const LOCK_THRESHOLD = 20;

/** The ceiling on the counter itself. A locked cell stops mattering long before
 *  this; the cap exists so a with-grain player cannot run the number away. */
export const MAX_COMPACTION = 26;

/**
 * WHERE THE TELEGRAPH TURNS ON. A cell at 18 or above dies to the next
 * across-grain take (18 + 3 = 21 > 20), and a cell at 17 does not (17 + 3 = 20).
 * So this is not a comfort margin — it is exactly the set of cells that are one
 * strike from dead, and the renderer must make every one of them unmistakable.
 */
export const TELEGRAPH_FROM = 18;

/**
 * WHERE THE NUMBER APPEARS (decision 4). Below this, compaction is background
 * intensity only and the early face stays quiet; at and above it, the digit is
 * printed. Eight is not a legibility guess — it is the FIRST DEEP-ENTRY GATE, so
 * the number becomes visible on precisely the chip where it starts paying.
 */
export const COMPACTION_SHOW_AT = 8;

export const WITH_COMPACTION = 1;
export const ACROSS_COMPACTION = 3;
export const ACROSS_TIME_MULT = 1.8;
export const ACROSS_DUST_MULT = 1.3;
/** The front's own bite. Smaller than a hand's because nobody aimed it at this
 *  particular cell — and because the front must never be able to lock a board. */
export const FRONT_COMPACTION = 1;

/** How far back the head's wake is remembered, for the renderer's trail. */
export const TRAIL_LEN = 6;

// --- grain field generation (the highest-leverage knob in the proof) --------

/**
 * ALL THREE OF THESE WERE SET BY MEASUREMENT, NOT BY EYE — see
 * `scripts/tune-grain.ts`, which reports the only figures that matter:
 *
 *   COHERENCE  how often orthogonal neighbours agree. 0.25 is uniform noise
 *              (nothing to aim ALONG); 1.0 is a single arrow (nothing to aim
 *              AT). Landed at ~0.46, roughly twice noise.
 *   DOMINANCE  the biggest direction's share of one board. Landed at ~0.41.
 *   MEAN WALK  how many hops a front actually gets, simulated from every cell.
 *              This is the number §9's kill criterion is stated in. Landed at
 *              ~4.2 against a floor of 3.
 *
 * THE FIRST VERSION OF THIS FILE FAILED ITS OWN KILL CRITERION, and it failed
 * the way nobody expected. §2 warns that a noisy field has nothing to aim
 * along, so the generator was tuned for coherence — and produced boards that
 * were 64% one direction, where half the cells pointed off the same edge and
 * every wave died on hop zero. Mean front length in the first driven session
 * was 0.00. Too coherent is as unaimable as too noisy; it just fails silently.
 */
/** One seed per this many cells. */
export const GRAIN_CELLS_PER_SEED = 6;
/** Chance a cell turns 90 degrees off the direction it inherited, which sets
 *  run length at roughly 1 / this — about three cells. */
export const GRAIN_BRANCH_RATE = 0.3;
/**
 * THE SEAM DOES NOT RUN INTO THE WALL. A boundary cell whose direction points
 * off the board turns inward this often. It is by far the highest-leverage of
 * the three (it alone moves mean walk from 2.9 to 4.2), and it is NOT 1.0 on
 * purpose: a quarter of edge-pointing cells keep pointing out, so a front can
 * still run off the board and the choice to abandon one stays a real decision
 * rather than a thing that only ever happens when you say so.
 */
export const GRAIN_EDGE_TURN = 0.75;

// --- deep entry -------------------------------------------------------------

export interface DeepGate { at: number; materialId: string; chance: number }

/**
 * THE PAYOUT. Aiming a wave with no prize is a puzzle, not a verb.
 *
 * Chances fall as the gate deepens because the gate itself is the reward curve:
 * a cell at 20 is one strike from dead and drops the terminal material, so the
 * rate has to be low enough that parking on it is a nerve-holding exercise
 * rather than a farm. These three numbers are UNVERIFIED BALANCE — they were set
 * to make the hour-1 moment reachable and they have not been sim-checked.
 */
export const DEEP_GATES: DeepGate[] = [
  { at: 20, materialId: 'deepgrave', chance: 0.06 },
  { at: 14, materialId: 'graveclaydeep', chance: 0.11 },
  { at: 8, materialId: 'umberjade', chance: 0.18 },
];

// ---------------------------------------------------------------------------
// State shape — lazily created and self-repairing
// ---------------------------------------------------------------------------

/**
 * THE BAND'S ARRAYS ARE NEVER ASSUMED. Every entry point calls this first: a
 * save written before this module existed has none of them, and a face that was
 * widened has all of them at the wrong length. Both cases heal here rather than
 * in a migration, which is why this feature needs no save version bump.
 */
export function ensureBand(state: GameState, rng: () => number = Math.random): void {
  const n = state.face.cells.length;
  const f = state.face;
  if (!Array.isArray(f.compaction) || f.compaction.length !== n) {
    f.compaction = new Array<number>(n).fill(0);
  }
  if (!Array.isArray(f.locked) || f.locked.length !== n) {
    f.locked = new Array<boolean>(n).fill(false);
  }
  if (!Array.isArray(f.grain) || f.grain.length !== n) {
    f.grain = generateGrain(state.face.w, state.face.h, rng);
    f.bandGrain = f.grain[0] ?? GRAIN_E;
  }
  if (f.bandGrain === undefined) f.bandGrain = GRAIN_E;
  if (f.grainScope !== 'band') f.grainScope = 'cell';
}

/**
 * GRAIN IS GENERATED IN RUNS, NOT UNIFORM NOISE. Uniform random across 36 cells
 * is unreadable and there is nothing to aim along — the player must be able to
 * look at a fresh band and see where the grain WANTS to go.
 *
 * A flood from a handful of seeds, each cell inheriting its parent's direction
 * unless it turns 90 degrees. That produces currents with visible edges between
 * them, which is the thing a wave is aimed relative to.
 */
export function generateGrain(w: number, h: number, rng: () => number = Math.random): GrainDir[] {
  const n = w * h;
  const dirs = new Array<number>(n).fill(-1);
  const queue: number[] = [];
  const seeds = Math.max(2, Math.round(n / GRAIN_CELLS_PER_SEED));
  for (let s = 0; s < seeds; s++) {
    const c = Math.floor(rng() * n);
    if (dirs[c]! >= 0) continue;
    dirs[c] = Math.floor(rng() * 4);
    queue.push(c);
  }
  // A grid with every seed colliding still has to come out with a field.
  if (queue.length === 0) { dirs[0] = Math.floor(rng() * 4); queue.push(0); }
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi]!;
    const x = c % w;
    const y = Math.floor(c / w);
    const nbs: number[] = [];
    if (x > 0) nbs.push(c - 1);
    if (x < w - 1) nbs.push(c + 1);
    if (y > 0) nbs.push(c - w);
    if (y < h - 1) nbs.push(c + w);
    for (const nb of nbs) {
      if (dirs[nb]! >= 0) continue;
      let d = dirs[c]!;
      if (rng() < GRAIN_BRANCH_RATE) d = (d + (rng() < 0.5 ? 1 : 3)) % 4;
      dirs[nb] = d;
      queue.push(nb);
    }
  }
  for (let i = 0; i < n; i++) if (dirs[i]! < 0) dirs[i] = Math.floor(rng() * 4);
  // THE EDGE PASS. Everything above builds currents; this is what stops most of
  // them draining straight off the board. Applied last so it corrects the
  // finished field rather than biasing the flood, which would have pulled every
  // current toward the middle and made the whole face read as a whirlpool.
  const pointsOff = (cell: number, d: number): boolean => {
    const x = cell % w;
    const y = Math.floor(cell / w);
    return (d === GRAIN_N && y === 0) || (d === GRAIN_E && x === w - 1)
      || (d === GRAIN_S && y === h - 1) || (d === GRAIN_W && x === 0);
  };
  for (let i = 0; i < n; i++) {
    if (!pointsOff(i, dirs[i]!)) continue;
    if (rng() >= GRAIN_EDGE_TURN) continue;
    const alts = [0, 1, 2, 3].filter((d) => !pointsOff(i, d));
    if (alts.length > 0) dirs[i] = alts[Math.floor(rng() * alts.length)]!;
  }
  return dirs as GrainDir[];
}

/**
 * RE-ROLL THE BAND. Fresh grain, compaction back to zero, every lock cleared.
 * This is the recovery from lock, and it is hooked into the EXISTING Collapse
 * rather than being a reset of its own — see collapseSys / breach / pressure.
 */
export function rerollBand(state: GameState, rng: () => number = Math.random): void {
  const n = state.face.cells.length;
  state.face.compaction = new Array<number>(n).fill(0);
  state.face.locked = new Array<boolean>(n).fill(false);
  state.face.grain = generateGrain(state.face.w, state.face.h, rng);
  state.face.bandGrain = state.face.grain[0] ?? GRAIN_E;
  delete state.face.front;
  resetChipLog();
}

// ---------------------------------------------------------------------------
// Reading the field
// ---------------------------------------------------------------------------

/**
 * THE GRAIN AT A CELL — and the one place `grainScope` is honoured.
 *
 * The band fallback (risk §45.1) had to live in the ENGINE, not in the renderer.
 * A display-only toggle would draw the player one direction while the front
 * walked another, which is worse than the noise it was meant to fix. So band
 * scope genuinely flattens the field: one direction for the whole face, coarser,
 * still directional, and the wave goes exactly where the picture says.
 */
export function grainAt(state: GameState, cell: number): GrainDir {
  if (state.face.grainScope === 'band') return (state.face.bandGrain ?? GRAIN_E) as GrainDir;
  return (state.face.grain?.[cell] ?? GRAIN_E) as GrainDir;
}

export function compactionAt(state: GameState, cell: number): number {
  return state.face.compaction?.[cell] ?? 0;
}

export function isLocked(state: GameState, cell: number): boolean {
  return state.face.locked?.[cell] === true;
}

/** Is there anything locked on this board at all? One array scan instead of a
 *  per-cell question in the regen hot path. */
export function anyLocked(state: GameState): boolean {
  return state.face.locked?.some(Boolean) ?? false;
}

/** The next cell along the grain, or -1 at the grid edge. */
export function grainNext(state: GameState, cell: number): number {
  const { w, h } = state.face;
  const x = cell % w;
  const y = Math.floor(cell / w);
  switch (grainAt(state, cell)) {
    case GRAIN_N: return y > 0 ? cell - w : -1;
    case GRAIN_E: return x < w - 1 ? cell + 1 : -1;
    case GRAIN_S: return y < h - 1 ? cell + w : -1;
    default: return x > 0 ? cell - 1 : -1;
  }
}

/** ACROSS costs time; WITH does not. The rule lives here so the renderer's
 *  press-and-hold cadence can ask rather than decide (pillar 8). */
export function strikeTimeMult(strike: StrikeMode): number {
  return strike === 'across' ? ACROSS_TIME_MULT : 1;
}

export type StrikeMode = 'with' | 'across';

// ---------------------------------------------------------------------------
// The instrumentation log — module-level, deliberately NOT in the save
// ---------------------------------------------------------------------------

export interface ChipLogEntry {
  /** Play-seconds at the strike. */
  t: number;
  cell: number;
  mode: StrikeMode;
  before: number;
  after: number;
  /** The front's hop count immediately after this strike resolved. */
  hops: number;
  /** Did this strike extend the live front, or start a new one? */
  continued: boolean;
  /** Was a front abandoned to make this one? */
  abandoned: boolean;
  locked: boolean;
  /** Compaction the cell was at when it locked. */
  lockedAt?: number;
  /** True when the player could see the telegraph and struck anyway. */
  lockDeliberate?: boolean;
  deepDrop?: string;
  /** The deep drop came out of a cell the WAVE reached, not the one struck. */
  waveReached?: boolean;
}

export interface FrontDeath {
  t: number;
  hops: number;
  cause: 'edge' | 'lock' | 'abandoned';
}

let chipLog: ChipLogEntry[] = [];
let frontDeaths: FrontDeath[] = [];

export function resetChipLog(): void {
  chipLog = [];
  frontDeaths = [];
}

export function getChipLog(): readonly ChipLogEntry[] { return chipLog; }

// ---------------------------------------------------------------------------
// The strike
// ---------------------------------------------------------------------------

export interface GrainStrikeResult {
  mode: StrikeMode;
  compactionBefore: number;
  compactionAfter: number;
  locked: boolean;
  /** Cells the front entered on this strike (0 or 1 of them). */
  waveCells: number[];
  frontCell: number;
  frontHops: number;
  /** Material ids dropped by the compaction gates on this strike. */
  deepDrops: string[];
}

/** A cell that cannot be worked at all. The single question every verb asks. */
export function refuseLocked(state: GameState, cell: number): boolean {
  ensureBand(state);
  return isLocked(state, cell);
}

/**
 * EVERYTHING A STRIKE DOES TO THE GRAIN LAYER, in one call, after the harvest
 * has already succeeded.
 *
 * Order is load-bearing: the struck cell takes its compaction and rolls its own
 * gates FIRST, then the front walks, then the cell the front entered rolls its
 * gates SEPARATELY and is marked wave-reached. That separation is what lets §9
 * answer "was the holy-shit drop hand-struck or wave-reached", which is the one
 * metric that says whether anybody is steering.
 */
export function applyStrike(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  cell: number,
  strike: StrikeMode,
): GrainStrikeResult {
  ensureBand(state);
  const comp = state.face.compaction!;
  const before = comp[cell] ?? 0;
  const deepDrops: string[] = [];
  const waveCells: number[] = [];
  let locked = false;

  // --- the struck cell ------------------------------------------------------
  if (strike === 'across') {
    const next = before + ACROSS_COMPACTION;
    if (next > LOCK_THRESHOLD) {
      // IT LOCKS. Not clamped, not warned about after the fact — the cell was
      // showing a telegraph the whole time it sat at 18+.
      comp[cell] = Math.min(MAX_COMPACTION, next);
      state.face.locked![cell] = true;
      state.face.cells[cell] = 0;
      locked = true;
    } else {
      comp[cell] = next;
    }
  } else {
    comp[cell] = Math.min(MAX_COMPACTION, before + WITH_COMPACTION);
  }
  const after = comp[cell] ?? 0;
  if (!locked) {
    const drop = rollDeepEntry(state, ctx, after);
    if (drop) deepDrops.push(drop);
  }

  // --- the front ------------------------------------------------------------
  let continued = false;
  let abandoned = false;
  const t = state.stats.playTimeSec;
  if (strike === 'across') {
    const live = state.face.front;
    if (live && live.alive && live.cell === cell) {
      continued = true;
    } else {
      if (live && live.alive) {
        abandoned = true;
        frontDeaths.push({ t, hops: live.hops, cause: 'abandoned' });
      }
      state.face.front = { cell, hops: 0, alive: true, trail: [] };
    }
    const front = state.face.front!;
    if (continued) front.cell = cell;
    // A locked cell cannot carry a fracture.
    if (locked) {
      front.alive = false;
      frontDeaths.push({ t, hops: front.hops, cause: 'lock' });
    } else {
      // ONE CELL PER CHIP. Never a multi-cell cascade in one tap — the run is
      // the thing being watched, and a cascade resolves it before it reads.
      const step = grainNext(state, cell);
      if (step < 0) {
        front.alive = false;
        frontDeaths.push({ t, hops: front.hops, cause: 'edge' });
      } else if (isLocked(state, step)) {
        front.alive = false;
        frontDeaths.push({ t, hops: front.hops, cause: 'lock' });
      } else {
        // THE FRONT CANNOT LOCK A CELL. It applies +1 and clamps — only a strike
        // the player aimed can kill rock, which is what makes a lock a decision
        // rather than something the board did to you while you watched.
        const cb = comp[step] ?? 0;
        comp[step] = Math.min(MAX_COMPACTION, cb + FRONT_COMPACTION);
        front.trail = [...front.trail, front.cell].slice(-TRAIL_LEN);
        front.cell = step;
        front.hops += 1;
        waveCells.push(step);
        const wd = rollDeepEntry(state, ctx, comp[step] ?? 0);
        if (wd) { deepDrops.push(wd); logWaveDrop(t, step, wd); }
      }
    }
  }

  const front = state.face.front;
  chipLog.push({
    t,
    cell,
    mode: strike,
    before,
    after,
    hops: front?.alive ? front.hops : 0,
    continued,
    abandoned,
    locked,
    ...(locked ? { lockedAt: before, lockDeliberate: before >= LOCK_THRESHOLD } : {}),
    ...(deepDrops.length > 0 && !waveCells.length ? { deepDrop: deepDrops[0]!, waveReached: false } : {}),
  });

  if (locked) ctx.emit({ type: 'cellLocked', cell, compaction: before });
  if (waveCells.length > 0) {
    ctx.emit({ type: 'fractureFront', cell: waveCells[0]!, hops: front?.hops ?? 0 });
  }
  void mods;
  return {
    mode: strike,
    compactionBefore: before,
    compactionAfter: after,
    locked,
    waveCells,
    frontCell: front?.alive ? front.cell : -1,
    frontHops: front?.alive ? front.hops : 0,
    deepDrops,
  };
}

/** Wave-reached drops are logged apart from the strike that caused them — the
 *  §9 metric is time-to-first drop from a cell the player never touched. */
function logWaveDrop(t: number, cell: number, materialId: string): void {
  const last = chipLog[chipLog.length - 1];
  void last;
  chipLog.push({
    t, cell, mode: 'across', before: 0, after: 0, hops: 0,
    continued: true, abandoned: false, locked: false,
    deepDrop: materialId, waveReached: true,
  });
}

/**
 * THE COMPACTION GATES. Deepest gate met wins; one roll, one material.
 *
 * DELIBERATELY HAND-ONLY. Drills SEED compaction (systems/drills.ts) but they do
 * not collect these — a machine parked on a cell at 20 would roll the terminal
 * material every strike, which is a material faucet wearing a drop table's
 * clothes. The drills make the gates reachable; the payout is the player's.
 */
export function rollDeepEntry(state: GameState, ctx: EngineCtx, compaction: number): string | null {
  // THE THIN SEAM (challenge) seals every drop, this one included.
  if (sealed(state, 'sealDrops')) return null;
  for (const gate of DEEP_GATES) {
    if (compaction < gate.at) continue;
    if (Math.random() >= gate.chance) return null;
    applyDrop(state, ctx, { kind: 'material', materialId: gate.materialId, purity: 40 + Math.floor(Math.random() * 45) });
    return gate.materialId;
  }
  return null;
}

/** Drills seed compaction without collecting the gates. Clamped so a machine can
 *  never lock a cell — a board killed while you were away is a rage-quit. */
export function seedCompaction(state: GameState, cell: number, amount: number): void {
  ensureBand(state);
  const comp = state.face.compaction!;
  comp[cell] = Math.min(LOCK_THRESHOLD, (comp[cell] ?? 0) + amount);
}

/** Would a drill's next across-strike push this cell past the safety line? */
export function wouldExceedSafety(state: GameState, cell: number, amount: number): boolean {
  return (state.face.compaction?.[cell] ?? 0) + amount > LOCK_THRESHOLD;
}

// ---------------------------------------------------------------------------
// The face's arrays move with the rock
// ---------------------------------------------------------------------------

/** Called by applyFieldSize: a wider grid renumbers every row, so grain,
 *  compaction and locks have to be remapped by COORDINATE like the pockets. */
export function remapBand(
  state: GameState, w: number, h: number, remap: Map<number, number>, rng: () => number = Math.random,
): void {
  const n = w * h;
  const oldGrain = state.face.grain;
  const oldComp = state.face.compaction;
  const oldLock = state.face.locked;
  const freshGrain = generateGrain(w, h, rng);
  const grain = new Array<GrainDir>(n);
  for (let i = 0; i < n; i++) grain[i] = freshGrain[i]!;
  const comp = new Array<number>(n).fill(0);
  const locked = new Array<boolean>(n).fill(false);
  for (const [from, to] of remap) {
    if (oldGrain?.[from] !== undefined) grain[to] = oldGrain[from]! as GrainDir;
    if (oldComp?.[from] !== undefined) comp[to] = oldComp[from]!;
    if (oldLock?.[from] !== undefined) locked[to] = oldLock[from]!;
  }
  state.face.grain = grain;
  state.face.compaction = comp;
  state.face.locked = locked;
  const front = state.face.front;
  if (front) {
    const moved = remap.get(front.cell);
    if (moved === undefined) delete state.face.front;
    else {
      front.cell = moved;
      front.trail = front.trail.map((c) => remap.get(c)).filter((c): c is number => c !== undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// faceReport() — the six metrics that actually answer the question
// ---------------------------------------------------------------------------

export interface FaceReport {
  chips: number;
  acrossWithByBucket: { bucket: string; across: number; with: number; acrossShare: number }[];
  meanFrontLength: number;
  maxFrontLength: number;
  frontsAbandoned: number;
  frontsRunOut: number;
  locksPerHour: number;
  locksDeliberate: number;
  locksAccidental: number;
  firstWaveDeepDropSec: number | null;
  firstHandDeepDropSec: number | null;
  chipsPerMinByBucket: { bucket: string; chipsPerMin: number }[];
  text: string;
}

const BUCKET_SEC = 600;

export function faceReport(state: GameState): FaceReport {
  const strikes = chipLog.filter((e) => !e.waveReached);
  const t0 = strikes.length > 0 ? strikes[0]!.t : 0;
  const tEnd = strikes.length > 0 ? strikes[strikes.length - 1]!.t : 0;
  const span = Math.max(1 / 60, tEnd - t0);

  const buckets = new Map<number, { across: number; with: number }>();
  for (const e of strikes) {
    const b = Math.floor((e.t - t0) / BUCKET_SEC);
    const row = buckets.get(b) ?? { across: 0, with: 0 };
    if (e.mode === 'across') row.across += 1; else row.with += 1;
    buckets.set(b, row);
  }
  const bucketKeys = [...buckets.keys()].sort((a, b) => a - b);
  const acrossWithByBucket = bucketKeys.map((b) => {
    const row = buckets.get(b)!;
    const total = row.across + row.with;
    return {
      bucket: `${b * 10}-${(b + 1) * 10}m`,
      across: row.across,
      with: row.with,
      acrossShare: total > 0 ? row.across / total : 0,
    };
  });
  const chipsPerMinByBucket = bucketKeys.map((b) => {
    const row = buckets.get(b)!;
    const total = row.across + row.with;
    // The last bucket is usually partial — measure it against its real span.
    const bucketSpan = Math.min(BUCKET_SEC, span - b * BUCKET_SEC);
    return { bucket: `${b * 10}-${(b + 1) * 10}m`, chipsPerMin: total / Math.max(1 / 60, bucketSpan / 60) };
  });

  // A front that is still alive at report time counts at its current length —
  // otherwise a session that ends mid-wave silently drops its longest run.
  const lengths = frontDeaths.map((d) => d.hops);
  const live = state.face.front;
  if (live?.alive) lengths.push(live.hops);
  const meanFrontLength = lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const maxFrontLength = lengths.length > 0 ? Math.max(...lengths) : 0;
  const frontsAbandoned = frontDeaths.filter((d) => d.cause === 'abandoned').length;
  const frontsRunOut = frontDeaths.filter((d) => d.cause !== 'abandoned').length;

  const locks = strikes.filter((e) => e.locked);
  const locksDeliberate = locks.filter((e) => e.lockDeliberate).length;
  const locksAccidental = locks.length - locksDeliberate;
  const locksPerHour = locks.length / (span / 3600);

  const firstWave = chipLog.find((e) => e.waveReached && e.deepDrop);
  const firstHand = chipLog.find((e) => !e.waveReached && e.deepDrop);
  const firstWaveDeepDropSec = firstWave ? firstWave.t - t0 : null;
  const firstHandDeepDropSec = firstHand ? firstHand.t - t0 : null;

  const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
  const secs = (v: number | null): string => (v === null ? 'never' : `${v.toFixed(1)}s`);
  const lines: string[] = [];
  lines.push(`FACE REPORT — ${strikes.length} strikes over ${span.toFixed(1)}s of play`);
  lines.push('');
  lines.push('across:with by 10-min bucket');
  for (const b of acrossWithByBucket) {
    lines.push(`  ${b.bucket.padEnd(8)} across ${String(b.across).padStart(5)}  with ${String(b.with).padStart(5)}  across-share ${pct(b.acrossShare)}`);
  }
  lines.push('');
  lines.push(`front length      mean ${meanFrontLength.toFixed(2)}   max ${maxFrontLength}`);
  lines.push(`fronts            abandoned ${frontsAbandoned}   ran to edge/lock ${frontsRunOut}`);
  lines.push(`locks             ${locks.length} total   ${locksPerHour.toFixed(2)}/hour   deliberate ${locksDeliberate}   accidental ${locksAccidental}`);
  lines.push(`first deep-entry  wave-reached ${secs(firstWaveDeepDropSec)}   hand-struck ${secs(firstHandDeepDropSec)}`);
  lines.push('');
  lines.push('chips/min by bucket');
  for (const b of chipsPerMinByBucket) {
    lines.push(`  ${b.bucket.padEnd(8)} ${b.chipsPerMin.toFixed(1)}`);
  }

  return {
    chips: strikes.length,
    acrossWithByBucket,
    meanFrontLength,
    maxFrontLength,
    frontsAbandoned,
    frontsRunOut,
    locksPerHour,
    locksDeliberate,
    locksAccidental,
    firstWaveDeepDropSec,
    firstHandDeepDropSec,
    chipsPerMinByBucket,
    text: lines.join('\n'),
  };
}
