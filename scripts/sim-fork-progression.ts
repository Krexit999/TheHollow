/**
 * SHOP FORKS, RE-SCORED ON PROGRESSION.
 *
 * WHY THE OLD SCORE WAS THE WRONG ONE. Every prior fork verdict was scored on
 * DEEP-ENTRY YIELD — how much umberjade / graveclay-deep / Deepgrave a 90-minute
 * arm ended holding. But the Collapse wipes compaction, so deep-entry yield is
 * maximised by NOT COLLAPSING, and always-packed duly won by camping a six-cell
 * window on 1-4 resets against a normal player's 15. That is not a fork finding.
 * It is the metric paying the player to sit still, and sitting still is losing.
 *
 * So this scores PROGRESSION, which is the thing the player is actually racing:
 *
 *   DEPTH REACHED IN FIXED WALL TIME  — how far down a 2-hour arm got
 *   TIME TO REACH A FIXED TARGET      — seconds to d45 (the tier-II wall),
 *                                       d110 (the tier-III wall) and d150
 *                                       (the Loam floor)
 *
 * d110 is the load-bearing one, and it is not an arbitrary landmark: the tier
 * III pick that breaks it, `deepcutter`, is built from SIX UMBERJADE, and
 * umberjade only exists behind compaction's first gate. So compaction has a
 * direct, mechanical route into progression, and a scoring pass that could not
 * see it was measuring the wrong half of its own system.
 *
 * EVERY ARM COMES OUT OF `scripts/sim.ts`, ONE FLAG APART. The forks used to
 * have a bespoke harness, and it was wrong four separate times — most recently
 * by carrying the VOIDED collapse policy (fire at depth 40) that PILLARS
 * declares invalidates every pacing number measured before A.42. Running the
 * arms through the real harness inherits the corrected collapse horizon, the
 * descend reserve, the forge policy and the drill bay for free, and there is no
 * second binary to be wrong on its own.
 *
 *   npx tsx scripts/sim-fork-progression.ts
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';

const HOURS = Number(process.env['FORK_HOURS'] ?? 2);
const N = Number(process.env['FORK_N'] ?? 11);
const SEEDS = Array.from({ length: N }, (_, i) => 1000 + i * 7919);
const ROWS = ['blade', 'soil', 'roots'] as const;
const LANES = Math.max(2, Math.min(8, cpus().length - 2));
const OUT = 'sim-out/fork-progression.md';

interface Row {
  fork: string; row: string; seed: number; holdCap: number; hand: string;
  depth: number; t45: number; t110: number; t150: number;
  collapses: number; tier: number; tools: number; packedBuys: number;
  packedPeak: number; deep: Record<string, number>;
}

let scratchN = 0;
function runOne(flags: string[]): Promise<Row> {
  // A UNIQUE SCRATCH CSV PER RUN. Eight lanes writing one path is an EPERM
  // waiting to happen on Windows, and a run that dies at its final write dies
  // after the measurement, which is the worst place to lose one.
  const scratch = `sim-out/.fork-scratch-${scratchN++}.csv`;
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', 'scripts/sim.ts', '--hours', String(HOURS), '--policy', 'active',
        '--hand', 'concentrated', '--quiet', '--out', scratch, ...flags],
      { stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32' },
    );
    let buf = '';
    child.stdout.on('data', (d) => { buf += String(d); });
    child.on('close', () => {
      const line = buf.split('\n').find((l) => l.startsWith('FORKRESULT '));
      if (!line) { reject(new Error(`no FORKRESULT from ${flags.join(' ')}`)); return; }
      resolve(JSON.parse(line.slice('FORKRESULT '.length)) as Row);
    });
    child.on('error', reject);
  });
}

/** Fixed-width lane pool — 165 runs at once would thrash the box. */
async function pool(jobs: (() => Promise<Row>)[]): Promise<Row[]> {
  const out: Row[] = new Array(jobs.length);
  let next = 0;
  let done = 0;
  await Promise.all(Array.from({ length: LANES }, async () => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      out[i] = await jobs[i]!();
      done++;
      if (done % 10 === 0) process.stderr.write(`  ${done}/${jobs.length}\n`);
    }
  }));
  return out;
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
/**
 * THE SPREAD, SO A ONE-POINT MEDIAN GAP CAN BE READ AS WHAT IT IS. The first
 * cut of this report called a row FAIL on a median depth of 133 against 134 —
 * a verdict entirely inside the seed noise, stated with the same confidence as
 * blade's 51-against-134. p25-p75 is printed next to every depth so the reader
 * can tell a finding from a coin flip without taking my word for it.
 */
const pct = (xs: number[], q: number): number =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))]!;
const spread = (xs: number[]): string => `${pct(xs, 0.25)}–${pct(xs, 0.75)}`;
/**
 * A TARGET NEVER REACHED IS NOT A ZERO AND IT IS NOT A BLANK. It is "longer
 * than the run", and averaging it as either lies in a different direction each
 * way — so unreached sorts to the end and the median reports as `>2h` when the
 * middle sample never got there.
 */
const CAP = HOURS * 3600 + 1;
const medTime = (xs: number[]): number => median(xs.map((x) => (x === 0 ? CAP : x)));
const t = (sec: number): string => (sec >= CAP ? `>${HOURS}h` : `${(sec / 60).toFixed(0)}m`);

const lines: string[] = [];
const say = (s = ''): void => { lines.push(s); console.log(s); };

async function main(): Promise<void> {
  mkdirSync('sim-out', { recursive: true });
  say(`# SHOP FORKS ON A PROGRESSION SCORE`);
  say();
  say(`${HOURS}h active arms, concentrated six-cell hand, engine RNG seeded, median of ${N}.`);
  say(`Every arm is \`scripts/sim.ts\`, one flag apart. Loam walls: d45 (tier II), d110 (tier III,`);
  say(`the wall \`deepcutter\` breaks, and deepcutter eats six umberjade), d150 (floor).`);
  say();

  // ── 0. WHAT THE HAND COSTS ───────────────────────────────────────────────
  // The concentrated hand is the standing rule, but it is a WORSE income
  // policy than greedy-on-charge — it keeps chipping a worked-down window. If
  // that cost is large, every number below is measured on a crippled player and
  // the comparison is between two bad arms. Measured, not assumed.
  say(`## 0. What the concentrated hand costs`);
  say();
  const handJobs = (['fullest', 'concentrated'] as const).flatMap((hand) =>
    SEEDS.map((seed) => () => runOne(['--seed', String(seed), '--fork', 'income', '--hand', hand])));
  const handRes = await pool(handJobs);
  say('| hand | depth @2h | t(d45) | t(d110) | t(d150) | umberjade |');
  say('|---|---|---|---|---|---|');
  for (const [i, hand] of (['fullest', 'concentrated'] as const).entries()) {
    const g = handRes.slice(i * N, (i + 1) * N);
    say(`| ${hand} | ${median(g.map((r) => r.depth))} | ${t(medTime(g.map((r) => r.t45)))}`
      + ` | ${t(medTime(g.map((r) => r.t110)))} | ${t(medTime(g.map((r) => r.t150)))}`
      + ` | ${median(g.map((r) => r.deep['umberjade'] ?? 0))} |`);
  }
  say();

  // ── 1. THE THREE POLICIES, PER ROW ───────────────────────────────────────
  say(`## 1. The three policies, per row`);
  say();
  // The INCOME arm ignores `--fork-row` by construction, so it is ONE baseline
  // shared by all three rows rather than three identical re-runs.
  const baseJobs = SEEDS.map((seed) => () => runOne(['--seed', String(seed), '--fork', 'income']));
  const rowJobs = ROWS.flatMap((row) => (['packed', 'switch'] as const).flatMap((fork) =>
    SEEDS.map((seed) => () => runOne(['--seed', String(seed), '--fork', fork, '--fork-row', row]))));
  const all = await pool([...baseJobs, ...rowJobs]);
  const base = all.slice(0, N);
  const verdicts: string[] = [];
  const deepTotal = (r: Row): number => Object.values(r.deep).reduce((a, b) => a + b, 0);
  const cell = (g: Row[]): string =>
    `${median(g.map((r) => r.depth))} | ${spread(g.map((r) => r.depth))}`
    + ` | ${t(medTime(g.map((r) => r.t45)))}`
    + ` | ${t(medTime(g.map((r) => r.t110)))} | ${t(medTime(g.map((r) => r.t150)))}`
    + ` | ${median(g.map((r) => r.collapses))} | ${median(g.map((r) => r.packedBuys))}`
    + ` | ${median(g.map(deepTotal))}`;

  for (const [ri, row] of ROWS.entries()) {
    const packed = all.slice(N + ri * 2 * N, N + ri * 2 * N + N);
    const swtch = all.slice(N + ri * 2 * N + N, N + ri * 2 * N + 2 * N);
    say(`### ${row}`);
    say();
    // The last column is the OLD score, kept beside the new one on purpose:
    // where a policy wins DEEP and loses DEPTH, the artifact is visible in one
    // row rather than argued for in prose.
    say('| policy | depth @2h | p25–p75 | t(d45) | t(d110) | t(d150) | colls | packed buys | deep (old score) |');
    say('|---|---|---|---|---|---|---|---|---|');
    say(`| always-income | ${cell(base)} |`);
    say(`| always-packed | ${cell(packed)} |`);
    say(`| switcher | ${cell(swtch)} |`);
    say();
    // PROGRESSION IS A RACE, so the score is depth first and time-to-d110 as
    // the tiebreak — deeper is better, sooner is better.
    /**
     * A DIFFERENCE SMALLER THAN THE SEED NOISE IS NOT A DIFFERENCE. The margin
     * is half the income arm's own p25–p75 spread, so "beats" means "beats by
     * more than this instrument can resolve" and everything else reports as a
     * TIE. Without this a 133-against-134 read as a loss.
     */
    const margin = (pct(base.map((r) => r.depth), 0.75) - pct(base.map((r) => r.depth), 0.25)) / 2;
    const cmp = (a: Row[], b: Row[]): 'better' | 'worse' | 'tie' => {
      const ad = median(a.map((r) => r.depth)); const bd = median(b.map((r) => r.depth));
      if (Math.abs(ad - bd) > margin) return ad > bd ? 'better' : 'worse';
      const at = medTime(a.map((r) => r.t110)); const bt = medTime(b.map((r) => r.t110));
      if (Math.abs(at - bt) > 120) return at < bt ? 'better' : 'worse'; // 2 min
      return 'tie';
    };
    const vI = cmp(swtch, base);
    const vP = cmp(swtch, packed);
    const note = (v: string, who: string): string =>
      v === 'better' ? `beats always-${who}` : v === 'worse' ? `**loses to** always-${who}` : `ties always-${who}`;
    verdicts.push(vI === 'better' && vP === 'better'
      ? `**${row}: PASS** — the switcher beats both.`
      : `**${row}: FAIL** — ${note(vI, 'income')}, ${note(vP, 'packed')}.`);
  }
  say(`## Verdicts`);
  say();
  for (const v of verdicts) say(`- ${v}`);
  say();

  // ── 2. THE HOLD CAP SWEEP ────────────────────────────────────────────────
  // §40.2's ROOTS row is the one that has to reconcile compaction with the
  // reset ladder: HOLD is compaction that survives the Collapse, capped so the
  // fall can never hand back the terminal table. Shipped cap is 8 — the first
  // gate. The question is not whether 8 is safe (it is, by construction) but
  // whether it is worth a purchase line, and that is a measurement.
  say(`## 2. HOLD cap sweep — what the cap has to be to be worth buying`);
  say();
  say(`> **HOLD DOES NOT WORK IN THE SHIPPED BUILD, so this sweep runs it EMULATED.**`);
  say(`> \`doCollapse\` zeroes the roots row, then \`clampPacked\` zeroes the packed tally, and`);
  say(`> only *then* reads \`holdFloor(state)\` — which is therefore 0 at every cap. The first`);
  say(`> pass of this sweep returned seven identical rows, which is how it was found. The`);
  say(`> \`--hold-emulate\` flag reads the floor before the dispatch and re-applies it after.`);
  say(`> These numbers describe the mechanic as specified, not as built.`);
  say();
  say(`always-packed ROOTS at each cap, against the same income baseline (depth ${median(base.map((r) => r.depth))}).`);
  say(`Shipped cap is 8 (the first gate); 20 is the terminal gate; 26 is the ceiling.`);
  say();
  const CAPS = [0, 4, 8, 12, 16, 20, 26];
  const capRes = await pool(CAPS.flatMap((cap) =>
    SEEDS.map((seed) => () => runOne([
      '--seed', String(seed), '--fork', 'packed', '--fork-row', 'roots',
      '--hold-cap', String(cap), '--hold-emulate',
    ]))));
  say('| HOLD cap | depth @2h | vs income | t(d110) | t(d150) | umberjade | deepgrave |');
  say('|---|---|---|---|---|---|---|');
  const baseDepth = median(base.map((r) => r.depth));
  for (const [i, cap] of CAPS.entries()) {
    const g = capRes.slice(i * N, (i + 1) * N);
    const d = median(g.map((r) => r.depth));
    say(`| ${cap} | ${d} | ${d - baseDepth >= 0 ? '+' : ''}${d - baseDepth}`
      + ` | ${t(medTime(g.map((r) => r.t110)))} | ${t(medTime(g.map((r) => r.t150)))}`
      + ` | ${median(g.map((r) => r.deep['umberjade'] ?? 0))}`
      + ` | ${median(g.map((r) => r.deep['deepgrave'] ?? 0))} |`);
  }
  say();
  const worth = CAPS.find((_cap, i) => median(capRes.slice(i * N, (i + 1) * N).map((r) => r.depth)) >= baseDepth);
  say(worth === undefined
    ? `**No cap in 0-26 makes always-packed ROOTS match the income baseline on progression.**`
    : `**First cap that matches or beats the income baseline on depth: ${worth}.**`);
  say();
  say(`_Samples: ${N} seeds per arm. ${HOURS}h per arm. ${handJobs.length + all.length + capRes.length} runs total._`);

  writeFileSync(OUT, `${lines.join('\n')}\n`);
  // Every per-seed row, so the next question about this data does not cost
  // another 176 runs.
  writeFileSync('sim-out/fork-progression-raw.json',
    JSON.stringify({ hours: HOURS, n: N, hand: handRes, forks: all, holdCaps: capRes }, null, 1));
  console.error(`\nwrote ${OUT}`);
}

void main();
