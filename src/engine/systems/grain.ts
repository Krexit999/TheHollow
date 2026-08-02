/**
 * THE GRAIN — the face's second axis (PROOF #1, Loam only).
 *
 * The face has always had ONE number per cell (charge) and one verb (take it).
 * This module adds the second axis: every cell has a DIRECTION the rock runs in,
 * and a strike either goes WITH that direction or ACROSS it.
 *
 *   WITH   — fast, ordinary dust, +1 compaction.
 *   ACROSS — 1.8x the time, 1.3x the dust, +3 compaction, and it drives a
 *            FRACTURE FRONT one cell further along the grain field.
 *
 * COMPACTION is what the two modes are really trading in: a per-cell counter
 * that opens DROP TABLES at 8, 14 and 20. Working a cell makes it richer, and
 * across-grain gets there three times faster.
 *
 * THERE IS NO LOCK. The first cut of this file killed a cell taken across the
 * grain above 20, per §5 of the brief, and it was cut after a live session. Two
 * measurements and one player killed it:
 *
 *   - A player who READ the warning simply never pressed Across on a hot cell.
 *     Zero locks in 220 chips, and the board settled at the terminal gate with
 *     no risk left in it at all.
 *   - A player who did not read it wrecked half the board in ten minutes.
 *
 * So the rule punished not-knowing and then stopped existing once you knew,
 * which is the worst shape a mechanic can have. It also needed a live-cell floor
 * bolted underneath it to stop a fully-killed board bricking the save outright —
 * and a rule that needs a safety net to avoid destroying the game is usually the
 * rule being wrong rather than the net being missing.
 *
 * What that leaves is the part that worked: work rock up, cash it in before the
 * fall. Compaction is monotonic within a run and re-rolls at every Collapse, so
 * the loop is "how deep can I get this board before it comes down".
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

/** The ceiling on the counter. Compaction climbs to here and stops; the cell
 *  keeps working forever, it is simply as deep as it goes. */
export const MAX_COMPACTION = 26;

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
/** The front's own bite. Smaller than a hand's, because nobody aimed it at this
 *  particular cell. */
export const FRONT_COMPACTION = 1;

/** How far back the head's wake is remembered, for the renderer's trail. */
export const TRAIL_LEN = 6;

// --- grain field generation (the highest-leverage knob in the proof) --------

/**
 * THE FIELD IS BUILT AS PATHS. Two earlier versions were not, and both failed.
 *
 * Version one assigned each cell a direction on its own and tuned for
 * COHERENCE, on the theory that a noisy field has nothing to aim along. It
 * produced boards 64% one direction where half the cells pointed off the same
 * edge; the first driven session measured mean front length 0.00.
 *
 * Version two spread the directions out and turned edge cells inward. That
 * measured well — 4.30 mean walk — and was still wrong, because a player looked
 * at the grid and asked how a wave could possibly follow it when squares point
 * at each other. Measured: 3.21 such pairs per board, and 100% of walks
 * eventually hit one. No amount of per-cell tuning fixes that. Directions
 * assigned independently will always contradict each other somewhere; the
 * metrics simply could not see it, because a walk that entered a two-cell
 * ping-pong was scored as "still going".
 *
 * So the seams are DRAWN. Start on the rim aimed inward, walk across the board
 * turning now and then, and write the direction along the way — so every cell
 * on a seam points at the next cell of that seam by construction. Follow the
 * grain from any seam cell and you walk the rest of that seam. That is what a
 * path is, and it cannot be arrived at by colouring cells one at a time.
 *
 * MEASURED (scripts/tune-grain.ts, 400 boards):
 *   facing pairs per board   3.21 -> 0.20     the thing the player could see
 *   coherence                0.46 -> 0.59     currents, still not one arrow
 *   dominance                0.40 -> 0.47
 *   mean walk                4.10 -> 4.08     unchanged, and bounded by the
 *                                             board: 36 squares is a short
 *                                             journey however you draw it
 */
/** How many seams are drawn across the band. One per ~3 cells, so most of the
 *  face is ON a seam rather than inheriting from one. */
export const GRAIN_SEAMS_PER_CELL = 1 / 3;
/** Chance a seam turns 90 degrees as it is drawn. Sets how much it wanders. */
export const GRAIN_TURN_RATE = 0.3;

/**
 * WHICH GENERATOR DREW THE FIELD ON THIS BOARD.
 *
 * `ensureBand` only ever rebuilt the grain array when it was MISSING or the
 * wrong length — so a save carrying a full-length field from an older generator
 * kept it forever, and shipping a new generator changed nothing a player could
 * see until their next Collapse. That is exactly what happened: the seam
 * generator went in, the metric read 0.17 facing pairs on fresh boards, and the
 * board on screen was still the old per-cell roll with arrows pointing at each
 * other. The code was live and had never run.
 *
 * Bumping this re-rolls the field on load. It is a FIELD version, not a save
 * version: nothing else about the band moves, and compaction is deliberately
 * kept — the rock you worked is still worked, it just runs a different way now.
 */
export const GRAIN_GENERATION = 2;

// --- deep entry -------------------------------------------------------------

export interface DeepGate { at: number; materialId: string; chance: number }

/**
 * THE PAYOUT. Aiming a wave with no prize is a puzzle, not a verb.
 *
 * Chances fall as the gate deepens because the gate itself is the reward curve —
 * the deepest one is what a whole run of work on one cell is FOR. These three
 * numbers are UNVERIFIED BALANCE: they were set to make the hour-1 moment
 * reachable and they have not been sim-checked. With the lock gone the thing to
 * watch is the late board, where every cell is at 20 and every chip rolls the
 * terminal table; the Collapse re-roll is what is supposed to bound that, and
 * nobody has measured whether it does.
 */
export const DEEP_GATES: DeepGate[] = [
  { at: 20, materialId: 'deepgrave', chance: 0.06 },
  { at: 14, materialId: 'graveclaydeep', chance: 0.11 },
  { at: 8, materialId: 'umberjade', chance: 0.18 },
];

/** The deepest gate — what the renderer rings as "this one is worth the most". */
export const TERMINAL_GATE = DEEP_GATES[0]!.at;

// ---------------------------------------------------------------------------
// State shape — lazily created and self-repairing
// ---------------------------------------------------------------------------

/**
 * THE BAND'S ARRAYS ARE NEVER ASSUMED. Every entry point calls this first: a
 * save written before this module existed has none of them, and a face that was
 * widened has all of them at the wrong length. Both cases heal here rather than
 * in a migration, which is why this feature needs no save version bump.
 *
 * It also clears `locked`, which existed for one build and no longer means
 * anything. A save written in that window would otherwise carry dead cells that
 * nothing can revive, because nothing reads the array any more.
 */
export function ensureBand(state: GameState, rng: () => number = Math.random): void {
  const n = state.face.cells.length;
  const f = state.face;
  if (!Array.isArray(f.compaction) || f.compaction.length !== n) {
    f.compaction = new Array<number>(n).fill(0);
  }
  if (f.locked !== undefined) delete f.locked;
  // MISSING, WRONG SIZE, OR DRAWN BY AN OLDER GENERATOR. The third case is the
  // one that bit: a full-length field from a superseded generator is not
  // "already fine", it is a board the new rules were never applied to.
  if (!Array.isArray(f.grain) || f.grain.length !== n || f.grainGen !== GRAIN_GENERATION) {
    f.grain = generateGrain(state.face.w, state.face.h, rng);
    f.grainGen = GRAIN_GENERATION;
    f.bandGrain = f.grain[0] ?? GRAIN_E;
  }
  if (f.bandGrain === undefined) f.bandGrain = GRAIN_E;
  if (f.grainScope !== 'band') f.grainScope = 'cell';
}

/**
 * DRAW THE SEAMS, then let the rock between them settle into the same currents.
 * See the constants above for why this is a rewrite rather than a retune.
 */
export function generateGrain(w: number, h: number, rng: () => number = Math.random): GrainDir[] {
  const n = w * h;
  const dirs = new Array<number>(n).fill(-1);

  /** One step along `d`, or -1 off the board. The same walk the front takes, so
   *  a seam drawn here is a path the front can actually follow. */
  const step = (c: number, d: number): number => {
    const x = c % w;
    const y = Math.floor(c / w);
    if (d === GRAIN_N) return y > 0 ? c - w : -1;
    if (d === GRAIN_E) return x < w - 1 ? c + 1 : -1;
    if (d === GRAIN_S) return y < h - 1 ? c + w : -1;
    return x > 0 ? c - 1 : -1;
  };

  const seams = Math.max(2, Math.round(n * GRAIN_SEAMS_PER_CELL));
  for (let s = 0; s < seams; s++) {
    // START ON THE RIM, AIMED INWARD. A seam that starts mid-board has spent
    // half its length before it has anywhere left to go.
    const side = Math.floor(rng() * 4);
    let c: number;
    let d: number;
    if (side === 0) { c = Math.floor(rng() * w); d = GRAIN_S; }
    else if (side === 1) { c = (Math.floor(rng() * h) + 1) * w - 1; d = GRAIN_W; }
    else if (side === 2) { c = n - 1 - Math.floor(rng() * w); d = GRAIN_N; }
    else { c = Math.floor(rng() * h) * w; d = GRAIN_E; }

    /**
     * WOULD POINTING `from` ALONG `dir` CREATE A HEAD-ON PAIR?
     *
     * The one question the whole generator exists to keep answering "no". It is
     * asked at EVERY write — the seam walk and the fill below — because both
     * can produce it and both did: turning at the wall instead of running off
     * it took outward cells from 11.2% to 0.3% and put facing pairs UP from
     * 0.17 to 1.18, because two seams running along the same rim meet nose to
     * nose. A fix that trades one visible defect for another is not a fix.
     */
    const facesBack = (from: number, dir: number): boolean => {
      const to = step(from, dir);
      return to >= 0 && dirs[to]! >= 0 && step(to, dirs[to]!) === from;
    };

    for (let k = 0; k < n; k++) {
      if (dirs[c]! >= 0) break; // met an older seam: stop, never overwrite
      if (rng() < GRAIN_TURN_RATE) d = (d + (rng() < 0.5 ? 1 : 3)) % 4;
      // Straight on if it can, else turn, and never into a wall or a head-on.
      // A SEAM RUNS ACROSS THE FIELD, NOT OUT OF IT: writing the outward
      // direction on the last cell put one dead square at the end of every
      // seam, and a wave opened on one of those died on hop zero.
      const tries = [d, (d + 1) % 4, (d + 3) % 4, (d + 2) % 4];
      const ok = tries.find((t) => step(c, t) >= 0 && !facesBack(c, t));
      if (ok === undefined) break; // boxed in — the seam ends here
      d = ok;
      dirs[c] = d;
      c = step(c, d);
    }
  }

  // The rock BETWEEN the seams takes the direction of a neighbour that is on
  // one, spreading outward until the board is full. That keeps the face reading
  // as broad currents rather than as bright lines drawn over noise — and it
  // asks the same head-on question, because an inherited direction is just as
  // capable of pointing back at the cell it was inherited from.
  const stepAt = (from: number, dir: number): number => step(from, dir);
  const wouldFaceBack = (from: number, dir: number): boolean => {
    const to = stepAt(from, dir);
    return to >= 0 && dirs[to]! >= 0 && stepAt(to, dirs[to]!) === from;
  };
  for (let pass = 0; pass < w + h; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (dirs[i]! >= 0) continue;
      const x = i % w;
      const y = Math.floor(i / w);
      const nbs: number[] = [];
      if (x > 0) nbs.push(i - 1);
      if (x < w - 1) nbs.push(i + 1);
      if (y > 0) nbs.push(i - w);
      if (y < h - 1) nbs.push(i + w);
      const set = nbs.filter((q) => dirs[q]! >= 0);
      if (set.length === 0) continue;
      const want = dirs[set[Math.floor(rng() * set.length)]!]!;
      const tries = [want, (want + 1) % 4, (want + 3) % 4, (want + 2) % 4];
      const ok = tries.find((t) => stepAt(i, t) >= 0 && !wouldFaceBack(i, t));
      if (ok === undefined) continue;
      dirs[i] = ok;
      changed = true;
    }
    if (!changed) break;
  }
  // A one-cell face, or a board no seam happened to touch, still comes out with
  // a field rather than a hole.
  for (let i = 0; i < n; i++) if (dirs[i]! < 0) dirs[i] = Math.floor(rng() * 4);
  return dirs as GrainDir[];
}

/**
 * RE-ROLL THE BAND. Fresh grain, compaction back to zero.
 *
 * This is what makes compaction a RUN-LENGTH project rather than a permanent
 * ratchet: everything you worked into the rock comes down with the shaft, and
 * the next band runs in different directions. Hooked into the Collapse that
 * already existed — see collapseSys / breach / pressure.
 */
export function rerollBand(state: GameState, rng: () => number = Math.random): void {
  const n = state.face.cells.length;
  state.face.compaction = new Array<number>(n).fill(0);
  delete state.face.locked;
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
  deepDrop?: string;
  /** The deep drop came out of a cell the WAVE reached, not the one struck. */
  waveReached?: boolean;
}

export interface FrontDeath {
  t: number;
  hops: number;
  /** `closed` — the grain led it back onto its own path. `edge` — off the
   *  board. `abandoned` — the player started another one somewhere else. */
  cause: 'edge' | 'closed' | 'abandoned';
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
  /** Cells the front entered on this strike (0 or 1 of them). */
  waveCells: number[];
  frontCell: number;
  frontHops: number;
  /** Material ids dropped by the compaction gates on this strike. */
  deepDrops: string[];
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

  // --- the struck cell ------------------------------------------------------
  // Both modes clamp at the ceiling and nothing else happens up there. Working a
  // cell only ever makes it deeper.
  comp[cell] = Math.min(
    MAX_COMPACTION,
    before + (strike === 'across' ? ACROSS_COMPACTION : WITH_COMPACTION),
  );
  const after = comp[cell] ?? 0;
  const drop = rollDeepEntry(state, ctx, after);
  if (drop) deepDrops.push(drop);

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
      state.face.front = { cell, hops: 0, alive: true, trail: [], path: [cell] };
    }
    const front = state.face.front!;
    if (continued) front.cell = cell;
    // ONE CELL PER CHIP. Never a multi-cell cascade in one tap — the run is the
    // thing being watched, and a cascade resolves it before it reads.
    const step = grainNext(state, cell);
    if (step < 0) {
      // A wave runs off the board.
      front.alive = false;
      frontDeaths.push({ t, hops: front.hops, cause: 'edge' });
    } else if (front.path.includes(step)) {
      /**
       * A FRACTURE CANNOT CROSS ITS OWN PATH.
       *
       * WITHOUT THIS, NO WAVE EVER ENDS. Measured on the shipped field: 98% of
       * boards contain at least one pair of cells pointing at each other, and
       * 100% of walks eventually enter a cycle — usually a two-cell ping-pong.
       * A player reported it by looking at the grid and asking the obvious
       * question, which is a better instrument than the mean-front-length
       * number, because that number was happily reporting 9.41 while measuring
       * a wave bouncing between the same two squares forever.
       *
       * The rule is here rather than in the generator on purpose. Making the
       * field acyclic would mean forbidding two neighbours from facing each
       * other, which flattens the currents into something combed and fake. A
       * field is allowed to fold back on itself; a CRACK is not.
       */
      front.alive = false;
      frontDeaths.push({ t, hops: front.hops, cause: 'closed' });
    } else {
      const cb = comp[step] ?? 0;
      comp[step] = Math.min(MAX_COMPACTION, cb + FRONT_COMPACTION);
      front.trail = [...front.trail, front.cell].slice(-TRAIL_LEN);
      front.path.push(step);
      front.cell = step;
      front.hops += 1;
      waveCells.push(step);
      const wd = rollDeepEntry(state, ctx, comp[step] ?? 0);
      if (wd) { deepDrops.push(wd); logWaveDrop(t, step, wd); }
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
    ...(deepDrops.length > 0 && !waveCells.length ? { deepDrop: deepDrops[0]!, waveReached: false } : {}),
  });

  if (waveCells.length > 0) {
    ctx.emit({ type: 'fractureFront', cell: waveCells[0]!, hops: front?.hops ?? 0 });
  }
  void mods;
  return {
    mode: strike,
    compactionBefore: before,
    compactionAfter: after,
    waveCells,
    frontCell: front?.alive ? front.cell : -1,
    frontHops: front?.alive ? front.hops : 0,
    deepDrops,
  };
}

/** Wave-reached drops are logged apart from the strike that caused them — the
 *  §9 metric is time-to-first drop from a cell the player never touched. */
function logWaveDrop(t: number, cell: number, materialId: string): void {
  chipLog.push({
    t, cell, mode: 'across', before: 0, after: 0, hops: 0,
    continued: true, abandoned: false,
    deepDrop: materialId, waveReached: true,
  });
}

/**
 * THE COMPACTION GATES. Deepest gate met wins; one roll, one material.
 *
 * DELIBERATELY HAND-ONLY. Drills SEED compaction (systems/drills.ts) but they do
 * not collect these — a machine parked on a deep cell would roll the terminal
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

/** Drills seed compaction without collecting the gates. */
export function seedCompaction(state: GameState, cell: number, amount: number): void {
  ensureBand(state);
  const comp = state.face.compaction!;
  comp[cell] = Math.min(MAX_COMPACTION, (comp[cell] ?? 0) + amount);
}

// ---------------------------------------------------------------------------
// The face's arrays move with the rock
// ---------------------------------------------------------------------------

/** Called by applyFieldSize: a wider grid renumbers every row, so grain and
 *  compaction have to be remapped by COORDINATE like the pockets. */
export function remapBand(
  state: GameState, w: number, h: number, remap: Map<number, number>, rng: () => number = Math.random,
): void {
  const n = w * h;
  const oldGrain = state.face.grain;
  const oldComp = state.face.compaction;
  const freshGrain = generateGrain(w, h, rng);
  const grain = new Array<GrainDir>(n);
  for (let i = 0; i < n; i++) grain[i] = freshGrain[i]!;
  const comp = new Array<number>(n).fill(0);
  for (const [from, to] of remap) {
    if (oldGrain?.[from] !== undefined) grain[to] = oldGrain[from]! as GrainDir;
    if (oldComp?.[from] !== undefined) comp[to] = oldComp[from]!;
  }
  state.face.grain = grain;
  state.face.compaction = comp;
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
// faceReport() — the metrics that actually answer the question
// ---------------------------------------------------------------------------

export interface FaceReport {
  chips: number;
  acrossWithByBucket: { bucket: string; across: number; with: number; acrossShare: number }[];
  meanFrontLength: number;
  maxFrontLength: number;
  frontsAbandoned: number;
  frontsRunOut: number;
  frontsClosed: number;
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
  const frontsRunOut = frontDeaths.filter((d) => d.cause === 'edge').length;
  const frontsClosed = frontDeaths.filter((d) => d.cause === 'closed').length;

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
  lines.push(`fronts            abandoned ${frontsAbandoned}   ran off the board ${frontsRunOut}   closed on themselves ${frontsClosed}`);
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
    frontsClosed,
    firstWaveDeepDropSec,
    firstHandDeepDropSec,
    chipsPerMinByBucket,
    text: lines.join('\n'),
  };
}
