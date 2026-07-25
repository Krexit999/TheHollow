/**
 * A.42 — read the idle/active time-to-depth ratio out of a descent matrix.
 *
 * The A.41 finding rested on two hand-picked depths from two logs. That is not
 * a curve, and a ratio that WIDENS is a claim about a curve. This reads every
 * depth log a matrix arm produced, takes the MEDIAN first-arrival time per
 * depth across seeds (RNG spread between two 12h idle runs has been a factor
 * of two before now), and prints R(d) = t_idle / t_active across the range.
 *
 *   npx tsx scripts/descent-ratio.ts sim-out/descent base
 *
 * Prints a table per shell and writes nothing — the caller redirects.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'sim-out/descent';
const tag = process.argv[3] ?? '';

type Arrivals = Map<string, Map<number, number[]>>; // shell -> depth -> secs

function load(files: string[]): Arrivals {
  const out: Arrivals = new Map();
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8').trim();
    for (const line of text.split('\n').slice(1)) {
      const [shell, d, sec] = line.split(',');
      if (!shell || d === undefined || sec === undefined) continue;
      const byDepth = out.get(shell) ?? new Map<number, number[]>();
      const list = byDepth.get(Number(d)) ?? [];
      list.push(Number(sec));
      byDepth.set(Number(d), list);
      out.set(shell, byDepth);
    }
  }
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const all = readdirSync(dir).filter((f) => f.endsWith('.depth.csv') && f.startsWith(tag));
const arms = ['idleoff', 'idleon', 'activeoff', 'activeon'] as const;
const data: Record<string, Arrivals> = {};
for (const arm of arms) {
  const files = all.filter((f) => f.includes(`-${arm}-`));
  if (files.length) data[arm] = load(files);
  console.log(`# ${arm}: ${files.length} run(s)`);
}

/** Only report a depth every N steps — the table is a shape, not a census. */
const STRIDE = 5;

for (const shell of new Set(Object.values(data).flatMap((a) => [...a.keys()]))) {
  console.log(`\n## ${shell}`);
  console.log('depth | idle_off | idle_on | act_off | act_on | R_off | R_on');
  const depths = new Set<number>();
  for (const arm of arms) for (const d of data[arm]?.get(shell)?.keys() ?? []) depths.add(d);
  for (const d of [...depths].sort((a, b) => a - b)) {
    if (d % STRIDE !== 0) continue;
    const cell = (arm: string): number | null => {
      const xs = data[arm]?.get(shell)?.get(d);
      // A depth only counts if MOST seeds got there — one lucky run is not a
      // time-to-depth, it is an anecdote (the A.41 spread: d44 vs d109).
      const runs = all.filter((f) => f.includes(`-${arm}-`)).length;
      if (!xs || xs.length * 2 < runs) return null;
      return median(xs);
    };
    const io = cell('idleoff'), inn = cell('idleon');
    const ao = cell('activeoff'), an = cell('activeon');
    const m = (x: number | null) => (x === null ? '   —  ' : (x / 60).toFixed(1).padStart(6));
    const r = (a: number | null, b: number | null) =>
      a === null || b === null || b === 0 ? '  — ' : (a / b).toFixed(1).padStart(4);
    console.log(
      `${String(d).padStart(5)} | ${m(io)}   | ${m(inn)}  | ${m(ao)}  | ${m(an)} | ${r(io, ao)}  | ${r(inn, an)}`,
    );
  }
}
