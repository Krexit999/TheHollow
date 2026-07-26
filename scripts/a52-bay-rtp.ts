/**
 * A.52 — DOES THE BAY'S BROWNOUT BREAK PILLAR 1?
 *
 * The feed's draw ladder was hand-sized, not sim-measured (LEDGER). The floor
 * (BROWNOUT_FLOOR = 0.5) analytically bounds any SINGLE drill's power at half
 * of what it would otherwise be — but pillar 1 binds income, the drop economy,
 * AND time-to-depth together (A.42), and a bound proven per-drill in isolation
 * is not the same claim as "a real idle run never drifts past ~5x". This
 * checks the three together instead of trusting the analytic floor alone.
 *
 * TWO SCENARIOS, because pillar 2 (regen is the hard ceiling) predicts the
 * brownout's visible effect on INCOME depends entirely on whether the bay is
 * regen-bound or drill-bound, and a single scenario cannot tell those apart:
 *
 *   CEILING-BOUND  — a small stock field (defaults: no roots/soil/expand
 *                    bought) with a big bay (8 drills, level 8, heavy heads).
 *                    Total drill power already exceeds what the field can
 *                    regenerate, so BOTH arms should converge to the SAME
 *                    income — brownout should be near-invisible here. This is
 *                    the pillar-2 backstop, not a bug if the ratio reads ~1x.
 *   POWER-BOUND    — a widened, high-cap field with a SMALL bay (3 drills,
 *                    level 5) that never gets close to the regen ceiling.
 *                    Here income is drill-power-limited, so this is where the
 *                    analytic 2x floor (1/BROWNOUT_FLOOR) should actually show
 *                    up, and the scenario that matters for the "worst case".
 *
 * Within each scenario, TWO ARMS, identical everything except the feed:
 *   NAIVE  — never buys Bay Feed (the policy a player unaware of the new
 *            mechanic would run — the worst case the brownout can produce).
 *   AWARE  — supply is kept exactly matched to draw at every checkpoint.
 *
 * Both idle (no manual chipping), ticked through `dispatch({type:'debug',
 * op:'warp'})` so drills keep wearing/graining ONLINE the whole run — the
 * offline closed-form path never calls tickDrills, and would silently erase
 * the very thing under test.
 *
 * THREE MEASURES, matching the three pillar-1 terms named in PILLARS.md:
 *   INCOME  — cumulative dust earned (state.totals.dust)
 *   DROPS   — state.materials.totalDrops (rollForDrop scales with the same
 *             'take' amount dust does, so it rides the same lever)
 *   DEPTH   — a TIME-TO-DEPTH proxy with no tool-tier confound: descendCost(d)
 *             is a pure function of depth (prestigeMath.ts), so cumulative
 *             income is walked against the cumulative cost curve directly,
 *             never through the real `descend` action (which would gate on
 *             tool tier — a variable this test has no opinion on).
 *
 *   npx tsx scripts/a52-bay-rtp.ts [hours]
 *
 * Writes sim-out/a52-bay-rtp.md and exits. Read next session.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine, type GameState } from '../src/engine';
import { ModifierCache } from '../src/engine/modifiers';
import { descendCost } from '../src/engine/prestigeMath';
import { applyFieldSize, dpsMax } from '../src/engine/systems/face';
import {
  baySupply, bayDraw, bayLoadFactor, BAY_BASE_SUPPLY, BAY_SUPPLY_PER_LEVEL,
  BROWNOUT_FLOOR, newDrill,
} from '../src/engine/systems/drills';

const HOURS = Number(process.argv[2] ?? 6);
const CHECKPOINT_SEC = 900; // 15 sim-minutes
const START_DEPTH = 40; // mid-Loam — where a bay of this size is plausible

interface ScenarioConfig {
  name: string;
  drills: number;
  level: number;
  head: string;
  roots: number;
  soil: number;
  blade: number;
  expand: number;
}

const SCENARIOS: ScenarioConfig[] = [
  {
    name: 'CEILING-BOUND (default field, big bay)',
    drills: 8, level: 8, head: 'maul', roots: 0, soil: 0, blade: 0, expand: 0,
  },
  {
    name: 'POWER-BOUND (widened field, small bay)',
    drills: 3, level: 5, head: 'maul', roots: 15, soil: 15, blade: 15, expand: 6,
  },
];

interface Checkpoint {
  sec: number;
  dust: number;
  drops: number;
  draw: number;
  supply: number;
  load: number;
}

function build(cfg: ScenarioConfig, aware: boolean): { ceiling: number; log: Checkpoint[] } {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  const mods = new ModifierCache();
  s.drills.bayBuilt = true;
  s.depth = START_DEPTH;
  s.maxDepthRecord = START_DEPTH;
  s.upgrades['roots'] = cfg.roots;
  s.upgrades['soil'] = cfg.soil;
  s.upgrades['blade'] = cfg.blade;
  s.upgrades['expand'] = cfg.expand;
  applyFieldSize(s, mods);
  const ceiling = dpsMax(s, mods).toNumber();
  for (let i = 0; i < cfg.drills; i++) {
    s.drills.units.push({
      ...newDrill(`D${i}`),
      level: cfg.level,
      head: cfg.head,
      bit: { materialId: 'marl', purity: 60 },
    });
  }
  const log: Checkpoint[] = [];
  const totalSec = Math.round(HOURS * 3600);
  for (let elapsed = 0; elapsed < totalSec; elapsed += CHECKPOINT_SEC) {
    // AWARE keeps supply matched to draw at every checkpoint — never over- or
    // under-buying. NAIVE's supply never moves off its starting zero.
    if (aware) {
      const draw = bayDraw(s);
      s.drills.supply = Math.max(0, Math.ceil((draw - BAY_BASE_SUPPLY) / BAY_SUPPLY_PER_LEVEL));
    }
    // Fast-forward LIVE (not the offline closed-form, which never runs
    // tickDrills — the wear/grain accrual this whole test depends on).
    engine.dispatch({ type: 'debug', op: 'warp', seconds: CHECKPOINT_SEC });
    log.push({
      sec: elapsed + CHECKPOINT_SEC,
      dust: s.totals['dust']?.toNumber() ?? 0,
      drops: s.materials.totalDrops,
      draw: bayDraw(s),
      supply: baySupply(s),
      load: bayLoadFactor(s),
    });
  }
  return { ceiling, log };
}

/** Cumulative descendCost from START_DEPTH+1 to `target` — pure, no tool gate. */
function costTo(target: number): number {
  let cost = 0;
  for (let d = START_DEPTH + 1; d <= target; d++) cost += descendCost(d).toNumber();
  return cost;
}

/** The deepest depth `dust` alone would clear, walking the pure cost curve. */
function depthReached(dust: number): number {
  let d = START_DEPTH;
  let cost = 0;
  for (;;) {
    const next = cost + descendCost(d + 1).toNumber();
    if (next > dust) return d;
    cost = next;
    d++;
    if (d > START_DEPTH + 100000) return d; // guard against a runaway loop
  }
}

/** How many times longer NAIVE needs to reach the depth AWARE already holds.
 *  Self-scaling per scenario — no hardcoded target depths to fight the two
 *  wildly different income regimes above. Extrapolates past the run's end
 *  from the last segment's rate when naive never gets there within it. */
function depthCatchupRatio(naive: Checkpoint[], aware: Checkpoint[]): { ratio: number; extrapolated: boolean } {
  const targetCost = costTo(depthReached(aware[aware.length - 1]!.dust));
  const hit = naive.find((c) => c.dust >= targetCost);
  if (hit) return { ratio: hit.sec / aware[aware.length - 1]!.sec, extrapolated: false };
  // Never got there — extrapolate from the last segment's rate.
  const last = naive[naive.length - 1]!;
  const prev = naive[naive.length - 2] ?? { sec: 0, dust: 0 };
  const rate = (last.dust - prev.dust) / (last.sec - prev.sec);
  const shortfall = targetCost - last.dust;
  const extra = rate > 0 ? shortfall / rate : Infinity;
  const totalSec = aware[aware.length - 1]!.sec;
  return { ratio: (last.sec + extra) / totalSec, extrapolated: true };
}

function runScenario(cfg: ScenarioConfig): string[] {
  const naive = build(cfg, false);
  const aware = build(cfg, true);
  const nLast = naive.log[naive.log.length - 1]!;
  const aLast = aware.log[aware.log.length - 1]!;

  // Ratios expressed as max/min, always >= 1 — "how many times different",
  // regardless of which arm happens to be the numerator.
  const incomeRatio = nLast.dust > 0 && aLast.dust > 0
    ? Math.max(nLast.dust, aLast.dust) / Math.min(nLast.dust, aLast.dust) : 1;
  const dropsRatio = nLast.drops > 0 && aLast.drops > 0
    ? Math.max(nLast.drops, aLast.drops) / Math.min(nLast.drops, aLast.drops) : 1;
  const depth = depthCatchupRatio(naive.log, aware.log);

  const naiveLoads = naive.log.map((c) => c.load);
  const minLoad = Math.min(...naiveLoads);
  const brownedFraction = naiveLoads.filter((l) => l < 0.999).length / naiveLoads.length;
  const naiveRate = nLast.dust / (HOURS * 3600);
  const awareRate = aLast.dust / (HOURS * 3600);
  const naiveDepth = depthReached(nLast.dust);
  const awareDepth = depthReached(aLast.dust);

  const lines: string[] = [];
  lines.push(`### ${cfg.name}`);
  lines.push(`${cfg.drills} drills @ level ${cfg.level}, head=${cfg.head} · ceiling (dpsMax) ${aware.ceiling.toFixed(2)} dust/s · naive avg rate ${naiveRate.toFixed(2)}/s vs aware ${awareRate.toFixed(2)}/s`);
  lines.push('');
  lines.push(`- INCOME  naive ${nLast.dust.toFixed(0)} dust · aware ${aLast.dust.toFixed(0)} dust · ratio ${incomeRatio.toFixed(2)}x`);
  lines.push(`- DROPS   naive ${nLast.drops} · aware ${aLast.drops} · ratio ${dropsRatio.toFixed(2)}x`);
  lines.push(`- BROWNOUT (naive arm): min load ${minLoad.toFixed(3)} (floor is ${BROWNOUT_FLOOR}) · browned-out for ${(brownedFraction * 100).toFixed(0)}% of checkpoints`);
  lines.push('');
  lines.push('TIME-TO-DEPTH (pure descendCost(d) walk against cumulative dust, no tool-tier gate):');
  lines.push(`- depth reached in ${HOURS}h: naive ${naiveDepth} vs aware ${awareDepth} (gap ${awareDepth - naiveDepth})`);
  lines.push(
    depth.extrapolated
      ? `- naive never reaches where aware ends up within ${HOURS}h — extrapolated at ${depth.ratio.toFixed(2)}x the run length`
      : `- naive takes ${depth.ratio.toFixed(2)}x as long to reach the depth aware ends the run at`,
  );
  lines.push('');
  const worst = Math.max(incomeRatio, dropsRatio, depth.ratio);
  lines.push(`worst ratio this scenario: ${worst.toFixed(2)}x`);
  lines.push('');
  return lines;
}

function main(): void {
  console.log(`Running ${HOURS}h per arm x ${SCENARIOS.length} scenarios, checkpoint ${CHECKPOINT_SEC}s...`);
  const body: string[] = [];
  let worstOverall = 0;
  for (const cfg of SCENARIOS) {
    const lines = runScenario(cfg);
    const w = Number(lines.find((l) => l.startsWith('worst ratio'))?.match(/([\d.]+)x/)?.[1] ?? 0);
    worstOverall = Math.max(worstOverall, w);
    body.push(...lines);
  }

  const header = [
    `\n## a52-bay-rtp — ${new Date().toISOString()}`,
    `${HOURS}h/arm, start depth ${START_DEPTH}, ${SCENARIOS.length} scenarios (ceiling-bound + power-bound)`,
    '',
  ];
  const verdict = [
    `WORST RATIO ACROSS BOTH SCENARIOS: ${worstOverall.toFixed(2)}x (pillar 1 bound is ~5x)`,
    worstOverall <= 2.2
      ? 'READS IN BAND — consistent with the analytic floor (1/BROWNOUT_FLOOR = 2x cap on drill-sourced income alone), comfortably under the ~5x pillar-1 bound. The hand-sized draw ladder does not need re-tuning on this evidence.'
      : worstOverall <= 5
        ? 'IN BAND but closer to the edge than the analytic floor alone predicted — worth a second seed before calling the ladder settled.'
        : 'OUT OF BAND — the naive/aware gap exceeds the pillar-1 bound. Re-check for a compounding path outside drillPower (e.g. a synergy or affinity term reading load) before shipping this ladder as-is.',
    '',
    'CAVEATS: one seed per arm (Math.random in drop/target selection varies runs a few %, per the sim.ts header note); a synthetic bay (state set directly, not bought through the real economy) so currency/kiln interactions are deliberately out of scope; time-to-depth is a pure cost-curve walk, not the real `descend` action, isolating the income effect from tool-tier gating on purpose; CEILING-BOUND reading near 1.00x is the EXPECTED pillar-2 result, not a null result — see the scenario note above.',
  ];

  const report = [...header, ...body, ...verdict].join('\n') + '\n';
  mkdirSync('sim-out', { recursive: true });
  writeFileSync('sim-out/a52-bay-rtp.md', report, { flag: 'a' });
  console.log(report);
}

main();
