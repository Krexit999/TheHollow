/**
 * THE GRAIN FIELD'S ONE KNOB, MEASURED.
 *
 * §2 calls run-generation "the single highest-leverage tuning knob in the
 * proof", and the first driven session proved it the hard way: the shipped
 * generator made a field that was 64% one direction, so a wave started anywhere
 * near the matching edge died on hop zero and mean front length came out at 0.
 *
 * Three numbers decide whether aiming is aiming:
 *   COHERENCE — how often orthogonal neighbours agree. 0.25 is noise (nothing
 *               to aim along); 1.0 is a single arrow (nothing to aim AT).
 *   DOMINANCE — the largest single direction's share. Above ~0.45 the board has
 *               one current and half the cells point off the same edge.
 *   WALK      — the mean number of hops a front actually gets, simulated from
 *               every cell. This is the metric the kill criterion is stated in.
 *
 *   npx tsx scripts/tune-grain.ts
 */
import { generateGrain } from '../src/engine/systems/grain';

const W = 6, H = 6;

function measure(gen: () => number[], trials = 400): { coh: number; dom: number; walk: number; maxWalk: number } {
  let agree = 0, pairs = 0, walkSum = 0, walkN = 0, maxWalk = 0;
  // DOMINANCE IS A PER-BOARD QUESTION. Averaged across trials the dominant
  // direction is different every time and the pooled figure is always ~0.25 —
  // which is what a first pass of this script reported while the board on
  // screen was 64% west.
  let domSum = 0;
  for (let t = 0; t < trials; t++) {
    const g = gen();
    const dirTotals = [0, 0, 0, 0];
    for (const d of g) dirTotals[d]! += 1;
    domSum += Math.max(...dirTotals) / g.length;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = y * W + x;
        if (x < W - 1) { pairs++; if (g[c] === g[c + 1]) agree++; }
        if (y < H - 1) { pairs++; if (g[c] === g[c + W]) agree++; }
      }
    }
    // How far does a front get, started at each cell?
    for (let start = 0; start < W * H; start++) {
      let cell = start, hops = 0;
      const seen = new Set<number>();
      for (;;) {
        if (seen.has(cell)) break; // THE WAVE CANNOT CROSS ITS OWN PATH
        seen.add(cell);
        const x = cell % W, y = Math.floor(cell / W);
        const d = g[cell]!;
        const next = d === 0 ? (y > 0 ? cell - W : -1)
          : d === 1 ? (x < W - 1 ? cell + 1 : -1)
            : d === 2 ? (y < H - 1 ? cell + W : -1)
              : (x > 0 ? cell - 1 : -1);
        if (next < 0) break;
        cell = next;
        hops++;
        if (hops > 200) break;
      }
      walkSum += hops; walkN++;
      if (hops > maxWalk) maxWalk = hops;
    }
  }
  return { coh: agree / pairs, dom: domSum / trials, walk: walkSum / walkN, maxWalk };
}

/**
 * THE CANDIDATE. Two changes over the shipped generator:
 *
 *  1. MORE SEEDS AND A HIGHER TURN RATE, so the board carries several currents
 *     instead of one. A single current is as unaimable as noise — it just fails
 *     the other way.
 *  2. THE SEAM DOES NOT RUN INTO THE WALL. A boundary cell that points off the
 *     board turns, MOST of the time. Not always: a front still has to be able
 *     to run out, or the only way one ever ends is the player abandoning it.
 */
function candidate(w: number, h: number, seedsPer: number, branch: number, edgeTurn: number): number[] {
  const n = w * h;
  const dirs = new Array<number>(n).fill(-1);
  const queue: number[] = [];
  const seeds = Math.max(2, Math.round(n / seedsPer));
  for (let s = 0; s < seeds; s++) {
    const c = Math.floor(Math.random() * n);
    if (dirs[c]! >= 0) continue;
    dirs[c] = Math.floor(Math.random() * 4);
    queue.push(c);
  }
  if (queue.length === 0) { dirs[0] = Math.floor(Math.random() * 4); queue.push(0); }
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi]!;
    const x = c % w, y = Math.floor(c / w);
    const nbs: number[] = [];
    if (x > 0) nbs.push(c - 1);
    if (x < w - 1) nbs.push(c + 1);
    if (y > 0) nbs.push(c - w);
    if (y < h - 1) nbs.push(c + w);
    for (const nb of nbs) {
      if (dirs[nb]! >= 0) continue;
      let d = dirs[c]!;
      if (Math.random() < branch) d = (d + (Math.random() < 0.5 ? 1 : 3)) % 4;
      dirs[nb] = d;
      queue.push(nb);
    }
  }
  for (let i = 0; i < n; i++) if (dirs[i]! < 0) dirs[i] = Math.floor(Math.random() * 4);
  // The edge pass.
  const off = (cell: number, d: number): boolean => {
    const x = cell % w, y = Math.floor(cell / w);
    return (d === 0 && y === 0) || (d === 1 && x === w - 1) || (d === 2 && y === h - 1) || (d === 3 && x === 0);
  };
  for (let i = 0; i < n; i++) {
    if (!off(i, dirs[i]!)) continue;
    if (Math.random() >= edgeTurn) continue;
    const alts = [0, 1, 2, 3].filter((d) => !off(i, d));
    if (alts.length > 0) dirs[i] = alts[Math.floor(Math.random() * alts.length)]!;
  }
  return dirs;
}

/**
 * THE SEAM GENERATOR — a field built as PATHS rather than as per-cell directions.
 *
 * Everything above gives each cell a direction on its own and hopes walks fall
 * out of it. They cannot. Two neighbours will always end up facing each other —
 * 3.2 such pairs per board, measured — and a player spotted that by looking at
 * the grid before any metric here did.
 *
 * So DRAW THE SEAMS. Start on the rim aimed inward, walk across the board
 * turning occasionally, and write the direction as you go: every cell on a seam
 * points at the next cell of that seam, by construction. Follow the grain from
 * any seam cell and you walk the rest of that seam, which is what "a path"
 * means. Cells no seam touched inherit from a neighbour that is on one, so the
 * board still reads as currents rather than as lines drawn over noise.
 */
function seamField(w: number, h: number, seams: number, turn: number): number[] {
  const n = w * h;
  const dirs = new Array<number>(n).fill(-1);
  const step = (c: number, d: number): number => {
    const x = c % w, y = Math.floor(c / w);
    return d === 0 ? (y > 0 ? c - w : -1) : d === 1 ? (x < w - 1 ? c + 1 : -1)
      : d === 2 ? (y < h - 1 ? c + w : -1) : (x > 0 ? c - 1 : -1);
  };
  for (let s = 0; s < seams; s++) {
    // Start on the rim aimed inward: a seam starting mid-board wastes half its
    // length before it has anywhere left to go.
    const side = Math.floor(Math.random() * 4);
    let c: number, d: number;
    if (side === 0) { c = Math.floor(Math.random() * w); d = 2; }
    else if (side === 1) { c = (Math.floor(Math.random() * h) + 1) * w - 1; d = 3; }
    else if (side === 2) { c = n - 1 - Math.floor(Math.random() * w); d = 0; }
    else { c = Math.floor(Math.random() * h) * w; d = 1; }
    for (let k = 0; k < n; k++) {
      if (Math.random() < turn) d = (d + (Math.random() < 0.5 ? 1 : 3)) % 4;
      if (dirs[c]! >= 0) break;            // crossed an older seam — stop here
      const next = step(c, d);
      if (next < 0) { dirs[c] = d; break; } // runs off the board — the seam ends
      dirs[c] = d;
      c = next;
    }
  }
  for (let pass = 0; pass < w + h; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (dirs[i]! >= 0) continue;
      const x = i % w, y = Math.floor(i / w);
      const nbs: number[] = [];
      if (x > 0) nbs.push(i - 1);
      if (x < w - 1) nbs.push(i + 1);
      if (y > 0) nbs.push(i - w);
      if (y < h - 1) nbs.push(i + w);
      const set = nbs.filter((q) => dirs[q]! >= 0);
      if (set.length === 0) continue;
      dirs[i] = dirs[set[Math.floor(Math.random() * set.length)]!]!;
      changed = true;
    }
    if (!changed) break;
  }
  for (let i = 0; i < n; i++) if (dirs[i]! < 0) dirs[i] = Math.floor(Math.random() * 4);
  return dirs;
}

/** How many neighbour pairs point straight at each other — the thing the
 *  player could see and the old metrics could not. */
function facingPairs(g: number[], w: number, h: number): number {
  let pairs = 0;
  const step = (c: number, d: number): number => {
    const x = c % w, y = Math.floor(c / w);
    return d === 0 ? (y > 0 ? c - w : -1) : d === 1 ? (x < w - 1 ? c + 1 : -1)
      : d === 2 ? (y < h - 1 ? c + w : -1) : (x > 0 ? c - 1 : -1);
  };
  for (let c = 0; c < w * h; c++) {
    const nx = step(c, g[c]!);
    if (nx >= 0 && step(nx, g[nx]!) === c) pairs++;
  }
  return pairs / 2;
}

const facing = (gen: () => number[], trials = 400): number => {
  let sum = 0;
  for (let t = 0; t < trials; t++) sum += facingPairs(gen(), W, H);
  return sum / trials;
};

/**
 * SHARE OF CELLS POINTING OFF THE BOARD. A wave started on one dies on hop
 * zero, so this is the other way a field can be unusable — and the one the
 * uniform mean-walk figure hides, because it averages those zeroes against
 * long runs elsewhere. The live driver measured mean 0.76 while this script
 * reported 4.23; this is the number that explains the gap.
 */
const outward = (gen: () => number[], trials = 400): number => {
  let off = 0;
  for (let t = 0; t < trials; t++) {
    const g = gen();
    for (let c = 0; c < W * H; c++) {
      const x = c % W, y = Math.floor(c / W), d = g[c]!;
      if ((d === 0 && y === 0) || (d === 1 && x === W - 1)
        || (d === 2 && y === H - 1) || (d === 3 && x === 0)) off++;
    }
  }
  return off / (trials * W * H);
};

const row = (name: string, m: ReturnType<typeof measure>): string =>
  `${name.padEnd(28)} coherence ${m.coh.toFixed(3)}   dominance ${m.dom.toFixed(3)}   mean walk ${m.walk.toFixed(2)}   max ${m.maxWalk}`;

console.log(row('uniform noise (the floor)', measure(() =>
  Array.from({ length: W * H }, () => Math.floor(Math.random() * 4)))));
console.log(row('one arrow (the ceiling)', measure(() =>
  new Array<number>(W * H).fill(1))));
console.log(row('SHIPPED generateGrain', measure(() => generateGrain(W, H))));
console.log(`${''.padEnd(28)} facing ${facing(() => generateGrain(W, H)).toFixed(2)}   outward ${(outward(() => generateGrain(W, H)) * 100).toFixed(1)}%`);
console.log('');
console.log('--- SEAM FIELDS: built as paths ---');
for (const seams of [3, 5, 8, 12]) {
  for (const turn of [0.05, 0.12, 0.2, 0.3]) {
    const gen = (): number[] => seamField(W, H, seams, turn);
    console.log(`${row(`SEAM ${seams} turn ${turn}`, measure(gen))}   facing ${facing(gen).toFixed(2)}   out ${(outward(gen) * 100).toFixed(1)}%`);
  }
}
// The old per-cell sweep is kept but silenced — it is at its ceiling and the
// point of this pass is that the ceiling is the wrong shape, not too low.
void candidate;
