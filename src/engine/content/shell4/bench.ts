/**
 * THE REFRACTION BENCH — craft-system #5, through the CraftSystem interface
 * untouched. Route a beam through targets by placing a limited number of
 * mirrors on a 7×7 board. EVERY SOLVED CONFIGURATION IS SAVED AS AN
 * EQUIPPABLE LENS — solutions are possessions, not scores.
 *
 * 50 authored puzzles teach (curated seeds with names and lessons — see
 * A.17 on authored-by-curation); the seeded generator never runs out.
 * Wavelength-Split puzzles add color-matched targets past mastery 25.
 */
import { D } from '../../decimal';
import type { CodexEntry, CraftSystem } from '../../craft';
import { registerCraftSystem } from '../../craft';
import { registerCurrency, addCurrency, spendCurrency, getCurrency } from '../../resources';
import { registerModifier, type Bucket } from '../../modifiers';
import type { ActionResult, EngineCtx, GameState } from '../../types';
import { masteryLevel } from '../../systems/mastery';

export const BENCH_SIZE = 7;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BenchPuzzle {
  id: string;
  name: string;
  lesson: string;
  entryRow: number;
  mirrorsAllowed: number;
  targets: number[]; // cell indices the beam must cross
  walls: number[]; // opaque cells
  /** The constructor's own solution (the sim's teacher; never shown). */
  solution: Record<number, '/' | '\\'>;
  colorTargets?: Record<number, number>; // cell -> required wavelength (Split)
}

/**
 * Constructive generation: walk a beam with k mirror turns, record the
 * path, pick targets ON it, sprinkle walls OFF it. Solvable by build.
 */
export function buildPuzzle(seed: number, k: number, colored: boolean): BenchPuzzle {
  const rng = mulberry(seed * 2654435761 + 7);
  const entryRow = 1 + Math.floor(rng() * (BENCH_SIZE - 2));
  const solution: Record<number, '/' | '\\'> = {};
  const path: number[] = [];
  let x = 0;
  let y = entryRow;
  let dir = 0;
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  let turns = 0;
  let guard = 60;
  while (x >= 0 && x < BENCH_SIZE && y >= 0 && y < BENCH_SIZE && guard-- > 0) {
    const cell = y * BENCH_SIZE + x;
    path.push(cell);
    if (turns < k && path.length > 1 && rng() < 0.35 && !solution[cell]) {
      const kind: '/' | '\\' = rng() < 0.5 ? '/' : '\\';
      solution[cell] = kind;
      dir = kind === '/' ? [3, 2, 1, 0][dir]! : [1, 0, 3, 2][dir]!;
      turns++;
    }
    x += DX[dir]!;
    y += DY[dir]!;
  }
  const onPath = new Set(path);
  const targets: number[] = [];
  const wantTargets = 2 + Math.min(3, k);
  for (let i = path.length - 1; i >= 0 && targets.length < wantTargets; i -= 1 + Math.floor(rng() * 2)) {
    const c = path[i]!;
    if (!solution[c] && c !== path[0]) targets.push(c);
  }
  const walls: number[] = [];
  for (let i = 0; i < BENCH_SIZE * BENCH_SIZE && walls.length < 5 + k; i++) {
    const c = Math.floor(rng() * BENCH_SIZE * BENCH_SIZE);
    if (!onPath.has(c)) walls.push(c);
  }
  const colorTargets = colored
    ? Object.fromEntries(targets.slice(0, 2).map((t) => [t, 1 + Math.floor(rng() * 5)]))
    : undefined;
  return {
    id: `gen${seed}`, name: `Exercise ${seed}`, lesson: '', entryRow,
    mirrorsAllowed: turns, targets, walls, solution, colorTargets,
  };
}

/** The fifty, authored by curation: chosen seeds, named, ordered to teach. */
const AUTHORED_SPECS: Array<[number, number, string, string, boolean?]> = [
  [11, 1, 'First Light', 'One mirror. Watch where the beam wants to go, then disagree once.'],
  [23, 1, 'The Elbow', 'A single turn can reach a whole new wall.'],
  [37, 1, 'Late Turn', 'Turning LATE is different from turning early.'],
  [45, 2, 'Two Thoughts', 'Two mirrors talk to each other. Listen.'],
  [58, 2, 'The Descent', 'Light can be sent downstairs like anything else.'],
  [66, 2, 'The Return', 'Send it away; bring it back.'],
  [71, 2, 'The Comb', 'Cross the middle twice.'],
  [83, 3, 'Threading', 'Between two walls there is always a width of light.'],
  [92, 3, 'The Hook', 'Around, not through.'],
  [104, 3, 'Patience of Glass', 'The longest path is sometimes the only path.'],
];

export const AUTHORED_PUZZLES: BenchPuzzle[] = (() => {
  const out: BenchPuzzle[] = [];
  // Ten hand-annotated lessons, then forty curated exercises in rising k.
  // Curation includes a quality gate: a lesson with one target teaches nothing.
  for (const [seed, k, name, lesson] of AUTHORED_SPECS) {
    let p = buildPuzzle(seed, k, false);
    let bump = 0;
    while ((p.targets.length < 2 || Object.keys(p.solution).length < 1) && bump < 20) {
      bump += 1;
      p = buildPuzzle(seed + bump * 1009, k, false);
    }
    out.push({ ...p, id: `auth${seed}`, name, lesson });
  }
  let n = 0;
  for (let seed = 120; out.length < 50 && seed < 8000; seed++) {
    const k = 1 + Math.floor(n / 10) + (n % 3 === 2 ? 1 : 0);
    const colored = out.length >= 40; // the last ten track Wavelength Split
    const p = buildPuzzle(seed, Math.min(4, k), colored);
    if (p.targets.length >= 2 && Object.keys(p.solution).length >= 1 && simulateBench(p, p.solution).solved) {
      out.push({ ...p, id: `auth${seed}`, name: `Study ${out.length + 1}`, lesson: colored ? 'Color-matched targets: the wavelength at the target must agree.' : '' });
      n++;
    }
  }
  return out;
})();

export function puzzleById(id: string): BenchPuzzle | null {
  const auth = AUTHORED_PUZZLES.find((p) => p.id === id);
  if (auth) return auth;
  if (id.startsWith('gen')) {
    const seed = Number(id.slice(3));
    if (Number.isFinite(seed)) return buildPuzzle(seed, 2 + (seed % 3), false);
  }
  return null;
}

/** Simulate an attempt: player mirrors on the puzzle board. */
export function simulateBench(p: BenchPuzzle, mirrors: Record<number, '/' | '\\'>): { hit: number[]; solved: boolean } {
  const wallSet = new Set(p.walls);
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  let x = 0;
  let y = p.entryRow;
  let dir = 0;
  const crossed = new Set<number>();
  const seen = new Set<string>();
  let seg = 0;
  let guard = 200;
  while (x >= 0 && x < BENCH_SIZE && y >= 0 && y < BENCH_SIZE && guard-- > 0) {
    const cell = y * BENCH_SIZE + x;
    if (wallSet.has(cell)) break;
    const key = `${cell}:${dir}`;
    if (seen.has(key)) break;
    seen.add(key);
    crossed.add(cell);
    // Color-matched targets read the band the segment is in (as the face does).
    if (p.colorTargets && p.colorTargets[cell] !== undefined) {
      const color = 1 + ((seg / 3) | 0) % 5;
      if (color !== p.colorTargets[cell]) crossed.delete(cell);
    }
    const m = mirrors[cell];
    if (m === '/') dir = [3, 2, 1, 0][dir]!;
    else if (m === '\\') dir = [1, 0, 3, 2][dir]!;
    x += DX[dir]!;
    y += DY[dir]!;
    seg++;
  }
  const hit = p.targets.filter((t) => crossed.has(t));
  const solved = hit.length === p.targets.length && Object.keys(mirrors).length <= p.mirrorsAllowed;
  return { hit, solved };
}

// ---------------------------------------------------------------------------
// Lenses — solutions are possessions.
// ---------------------------------------------------------------------------

const LENS_BUCKETS: Bucket[] = ['dustYield', 'dropRate', 'xpGain', 'regen', 'drillSpeed', 'kilnRate'];

export function lensFor(puzzleId: string): { bucket: Bucket; value: number; name: string } {
  const p = puzzleById(puzzleId);
  const seedish = Number((puzzleId.match(/\d+/) ?? ['1'])[0]);
  const bucket = LENS_BUCKETS[seedish % LENS_BUCKETS.length]!;
  const strength = p ? Math.min(4, p.mirrorsAllowed) : 1;
  const authored = puzzleId.startsWith('auth');
  return {
    bucket,
    value: 1 + (0.01 + 0.005 * strength) * (authored ? 1.2 : 1),
    name: p && p.name && !p.name.startsWith('Exercise') ? `Lens of ${p.name}` : `Ground Lens ${seedish}`,
  };
}

export function benchUnlocked(state: GameState): boolean {
  return masteryLevel(state, 'glassmere') >= 4;
}

export const BENCH_ATTEMPT_SILICA = 15;

export function benchAttempt(
  state: GameState,
  ctx: EngineCtx,
  puzzleId: string,
  mirrors: Record<number, '/' | '\\'>,
): ActionResult {
  if (!benchUnlocked(state)) return { ok: false, reason: 'The Bench wants Glassmere Mastery 4' };
  const p = puzzleById(puzzleId);
  if (!p) return { ok: false, reason: 'No such exercise' };
  if (!spendCurrency(state, 'silica', D(BENCH_ATTEMPT_SILICA))) {
    return { ok: false, reason: `${BENCH_ATTEMPT_SILICA} Silica to grind the setup` };
  }
  const { hit, solved } = simulateBench(p, mirrors);
  if (!solved) return { ok: true, data: { solved: false, hit: hit.length, of: p.targets.length } };
  const first = !state.bench.solved.includes(puzzleId);
  if (first) {
    state.bench.solved.push(puzzleId);
    addCurrency(state, 'ray', D(p.mirrorsAllowed + 1));
    ctx.emit({ type: 'lensGround', puzzleId });
  }
  ctx.dirty();
  return { ok: true, data: { solved: true, first } };
}

export function equipLens(state: GameState, puzzleId: string | null, slot: 1 | 2 = 1): ActionResult {
  if (puzzleId !== null && !state.bench.solved.includes(puzzleId)) {
    return { ok: false, reason: 'Solve it first — a Lens is a solved thing' };
  }
  if (slot === 2) {
    // The second socket (Phase 10): ground into the frame at Hollow Mastery 5.
    if (masteryLevel(state, 'hollow') < 5) return { ok: false, reason: 'The frame takes a second Lens at Hollow Mastery 5' };
    if (puzzleId !== null && state.bench.equippedLens === puzzleId) return { ok: false, reason: 'That Lens is already mounted' };
    state.bench.equippedLens2 = puzzleId;
    return { ok: true };
  }
  if (puzzleId !== null && state.bench.equippedLens2 === puzzleId) return { ok: false, reason: 'That Lens is already mounted' };
  state.bench.equippedLens = puzzleId;
  return { ok: true };
}

export const benchSystem: CraftSystem = {
  id: 'bench',
  name: 'The Refraction Bench',
  currencyId: 'ray',
  unlocked: benchUnlocked,
  ensureState(state) {
    if (!state.bench) state.bench = defaultBenchState();
  },
  tick(state, _mods, _ctx, dt) {
    state.bench.passiveProgressSec += dt;
    while (state.bench.passiveProgressSec >= 1500 && state.bench.passiveRank < 20) {
      state.bench.passiveProgressSec -= 1500;
      state.bench.passiveRank += 1;
    }
  },
  offlineTick(state, mods, ctx, seconds, efficiency) {
    this.tick(state, mods, ctx, seconds * efficiency);
  },
  passiveRank: (state) => state.bench.passiveRank,
  codex(state) {
    const out: CodexEntry[] = [];
    for (const id of state.bench.solved) {
      const lens = lensFor(id);
      out.push({
        id,
        name: lens.name,
        flavor: puzzleById(id)?.lesson || 'A configuration that worked, kept.',
        effect: `+${Math.round((lens.value - 1) * 100)}% ${lens.bucket} while equipped`,
        active: state.bench.equippedLens === id,
        kind: 'pattern',
      });
    }
    return out;
  },
};

export function registerBench(): void {
  registerCurrency({
    id: 'ray', name: 'Ray', tier: 'craft', color: '#eef6ff',
    description: 'A solved line of light, coiled for later.',
    resetsOnCollapse: false,
  });
  registerCraftSystem(benchSystem);
  for (const bucket of LENS_BUCKETS) {
    registerModifier({
      id: `lens.${bucket}`,
      label: 'Equipped Lens',
      bucket,
      value: (s) => {
        let v = 1;
        for (const id of [s.bench?.equippedLens, s.bench?.equippedLens2]) {
          if (!id) continue;
          const lens = lensFor(id);
          if (lens.bucket === bucket) v *= lens.value;
        }
        return v;
      },
    });
  }
  registerModifier({
    id: 'bench.passive',
    label: 'Bench passive rank',
    bucket: 'dropRate',
    value: (s) => 1 + 0.004 * (s.bench?.passiveRank ?? 0),
  });
}

export function defaultBenchState(): GameState['bench'] {
  return { solved: [], equippedLens: null, equippedLens2: null, nextGenSeed: 1, passiveRank: 0, passiveProgressSec: 0 };
}

export function scripSanity(state: GameState): number {
  return getCurrency(state, 'ray').toNumber();
}
