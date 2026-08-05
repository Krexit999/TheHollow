/**
 * Headless sim harness — fast-forwards N simulated hours with a scripted play
 * policy and dumps a CSV of currency/depth/level over time. Used to check
 * pacing against the pacing map in DESIGN.md.
 *
 *   npm run sim -- --hours 2 --policy balanced --log 1 --out sim-out/run.csv
 *
 *   --hours N     simulated hours (default 2)
 *   --policy P    active | idle | balanced (default balanced)
 *                 active:   chips 2/sec forever, buys greedily
 *                 idle:     never chips after the first minute, buys greedily
 *                 balanced: chips 2/sec for the first 20 min, then idles
 *   --log N       CSV row every N simulated minutes (default 1)
 *   --out FILE    write CSV there (default: print to stdout)
 *   --quiet       suppress the event log (collapses, unlocks)
 *
 * Note: crits/fractures/random drill targeting use Math.random, so runs vary
 * by a few percent. Trends, not decimals.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createEngine, fmt, type Decimal, type Engine, type GameState } from '../src/engine';
import { D } from '../src/engine/decimal';
import { CORE_NODES, coreNodeCost, coreNodeLevel } from '../src/engine/content/shell1/coreTree';
import { currentDescendCost, effectiveDescendCost } from '../src/engine/systems/depthSys';
import { coresForDepth, echoesForCores, axiomsForEchoes } from '../src/engine/prestigeMath';
import { ModifierCache } from '../src/engine/modifiers';
import { allUpgrades, upgradeLevel, nextCost } from '../src/engine/upgrades';
import { addMaterial, equippedTool, materialCount, requiredTier, TOOL_RECIPES } from '../src/engine/systems/forge';
import { assayUnlocked } from '../src/engine/systems/drops';
import { currentShell, chipCurrencyId, convCurrencyId } from '../src/engine/shells';
import { keystoneFor, keystoneIdlePrice, keystonePlaced } from '../src/engine/systems/keystones';
import { canBreach } from '../src/engine/systems/breach';
import { magnetArrayUnlocked } from '../src/engine/systems/polarity';
import { canSpiral } from '../src/engine/systems/spiral';
import { dpsMax, cellRegen, cellCap } from '../src/engine/systems/face';
import { nextPipeCost, VENT_SHAFT_CELL, holdLine, heatCeiling } from '../src/engine/systems/pressure';
import { ventArrayBuilt } from '../src/engine/systems/vents';
import { transmuteUnlocked } from '../src/engine/systems/refinery';
import { REMAINS_TUNING } from '../src/engine/materials';
import {
  bands, driftDepth, isShored, shoreBlocker, shoreCost, shoringUnlocked,
} from '../src/engine/systems/shoring';
import {
  activeConfluences, CONFLUENCE_BY_ID, CONFLUENCE_RANK_CAP, confluenceSlotCap,
} from '../src/engine/systems/confluence';
import { serialize } from '../src/engine/save/codec';
import { SETTLE_TUNING, settleFill } from '../src/engine/systems/settle';
import {
  HOLD_TUNING, type Branch, type ForkedRow, holdFloor, packedLevels,
} from '../src/engine/systems/shopFork';
import { resetCompaction } from '../src/engine/systems/compaction';
import { BAY_DEPTH_UNLOCK } from '../src/engine/content/shell1/upgrades';
import { ensurePlant } from '../src/engine/systems/plant';
import { MAX_OVERCLOCK, ensureGovernor } from '../src/engine/systems/governor';

interface Args {
  hours: number;
  policy: 'active' | 'idle' | 'balanced';
  growth: 'clear' | 'cultivate';
  logMin: number;
  out: string | null;
  quiet: boolean;
  heat: 'safe' | 'balanced' | 'greedy';
  /** Serialize the state to snapOut ~30 sim-minutes after breachCount first
   *  reaches snapBreach (echo-share.ts reads it). */
  snapBreach: number | null;
  snapOut: string | null;
  /** THE DESCENT INSTRUMENT (A.42). CSV of `shell,depth,sec` — the first
   *  moment each new depth RECORD is set, per shell. Time-to-depth is the
   *  measure the idle/active ratio is actually made of; before this the only
   *  readings were two hand-picked depths from a log. */
  depthLog: string | null;
  /** THE SETTLING knobs (A.42), so baseline and treatment come out of ONE
   *  binary and a sweep needs no source edit between runs.
   *    --settle off                  the pre-A.42 curve (relief disabled)
   *    --settle <soften>:<cap>:<quiet>:<floor>
   *  Omitted = the shipped values in systems/settle.ts. */
  settle: string | null;
  /** Attribute every common consumed to the action that took it (A.42). */
  commons: boolean;
  /** THE OPENING ARC (A.43 A1): a per-minute CSV of where an idle player's
   *  income comes from and where it goes, before any machine exists. */
  opening: string | null;
  /** Override the Loam depth record that unlocks the DRILL BAY (A.42). The
   *  shipped 55 sits BEHIND the tier-II wall at 44; this makes the alternative
   *  a measurement instead of an argument. */
  bay: number | null;
  /**
   * A.92 — HOLD EVERY BUILT MACHINE N STEPS PAST ITS RATING (`--overclock N`).
   * The Governor's own wreck is at Ferrite 175, which a Loam arc never reaches,
   * so the only way to measure the machine one flag apart from a real run is to
   * stand it up and set it. Zero (the default) is exactly the run that existed
   * before it, so the arms differ by the flag and nothing else.
   */
  overclock: number;
  /** Attribute every dust gained to the action that paid it (A.44 A0). */
  income: boolean;
  /** What the run-end horizon sizes pushing power against. `field` is the
   *  pre-A.44 basis, kept so both arms come from ONE binary, one flag apart. */
  horizon: 'income' | 'field';
  /** §40.2 shop forks — which side of the forked rows this arm buys. */
  fork: 'income' | 'packed' | 'switch';
  /** Which row forks. The other two stay on INCOME, so a row is measured alone. */
  forkRow: ForkedRow | 'all';
  /** Seconds of ceiling income the stair may cost before `switch` goes PACKED. */
  forkSwitchSec: number;
  /** HOLD's cap, for the sweep. Defaults to the shipped 8. */
  holdCap: number;
  /** Seeded engine RNG — omitted, the run is unseeded exactly as before. */
  seed: number | null;
  /**
   * MEASURE HOLD AS SPECIFIED, NOT AS BUILT. `doCollapse` zeroes the roots row
   * and then `clampPacked` zeroes the packed tally, both BEFORE it reads
   * `holdFloor(state)` — so the shipped floor is 0 at every cap and the cap
   * sweep measures nothing. This flag reads the floor before the dispatch and
   * re-applies it after, which is the mechanic §40.2 describes.
   *
   * IT IS NOT A FIX AND MUST NOT BE READ AS ONE. What survives a Collapse is
   * the reset ladder, and this pass is scoring only. Off by default; every
   * number it produces is labelled as an emulation of an unbuilt mechanic.
   */
  holdEmulate: boolean;
  /** A.75 drill axes: what every machine in the bay is set to. Defaults are the
   *  unconfigured bay, so an arm without these flags is the old sim exactly. */
  drillBehaviour: 'fullest' | 'sweep' | 'chain';
  drillBar: number;
  /** THE REMAINS (A.84). 0 reproduces the pre-A.84 drop table exactly, so the
   *  baseline arm is this same binary one flag apart. */
  remainsShare: number;
  /** SHORING (§9.4). The BASELINE arm is this same binary with the flag off —
   *  the policy simply never shores, and nothing in the engine changes. */
  shore: boolean;
  /**
   * THE HAND. `fullest` is the greedy policy every prior run used; it spreads
   * strokes across the whole board, which is the worst possible model for a
   * PER-CELL counter and is why the fork verdicts were measured on a player who
   * never compacts anything. `concentrated` works a six-cell window down to the
   * terminal gate and then moves on — the standing rule for any sim that
   * touches compaction.
   */
  hand: 'fullest' | 'concentrated';
  /**
   * WHERE `--scenario cinder` PUTS YOU (A.104). Default 70 reproduces the
   * existing arm byte for byte.
   *
   * §6 says THE VENT ARRAY's absence makes the shell "impassable", and the
   * Array is at Vent Row 58 — BEHIND THE CLINKER, a tier-13 wall at 54. If
   * that claim is true it is an A.42 inversion: the thing that makes a stretch
   * survivable, locked behind the stretch. The only honest way to ask is to
   * stand a player at 40 (just past the Boiler, before the wall) with no Array
   * and no way to reach one, and read the gauge. Both arms are this binary one
   * flag apart.
   */
  cinderDepth: number;
  /**
   * ...AND WHETHER THE POLICY PLUMBS AT ALL (A.104). Default `true` is the
   * existing arm exactly.
   *
   * The Array is not the only source of vent capacity — `networkCapacity` is
   * the PIPE BFS plus the Array's valves, and pipe costs Obsidian, which is
   * Cinder-native and on sale from depth 0 of the shell. So "no Array" is not
   * the floor case; "no Array AND no pipe" is, and that is the arm that says
   * what the shell does to a player who has built nothing at all.
   */
  pipes: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  // LAST OCCURRENCE WINS. `indexOf` took the FIRST, so a driver that appends an
  // override to a base flag list got the base value back and never knew —
  // `--hand concentrated ... --hand fullest` silently measured `concentrated`
  // TWICE and reported the two hands as identical to the digit, which is what
  // gave it away. Later-flag-wins is what every CLI does anyway.
  const get = (flag: string): string | undefined => {
    const i = argv.lastIndexOf(`--${flag}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const policy = (get('policy') ?? 'balanced') as Args['policy'];
  if (!['active', 'idle', 'balanced'].includes(policy)) {
    throw new Error(`Unknown policy: ${policy}`);
  }
  const growth = (get('growth') ?? 'clear') as 'clear' | 'cultivate';
  const heat = (get('heat') ?? 'balanced') as 'safe' | 'balanced' | 'greedy';
  if (!['safe', 'balanced', 'greedy'].includes(heat)) {
    throw new Error(`Unknown heat stance: ${heat}`);
  }
  return {
    hours: Number(get('hours') ?? 2),
    policy,
    growth,
    heat,
    logMin: Number(get('log') ?? 1),
    out: get('out') ?? null,
    quiet: argv.includes('--quiet'),
    snapBreach: get('snap-breach') !== undefined ? Number(get('snap-breach')) : null,
    snapOut: get('snap-out') ?? null,
    depthLog: get('depthlog') ?? null,
    settle: get('settle') ?? null,
    commons: argv.includes('--commons'),
    income: argv.includes('--income'),
    horizon: (get('horizon') ?? 'income') as 'income' | 'field',
    opening: get('opening') ?? null,
    bay: get('bay') !== undefined ? Number(get('bay')) : null,
    overclock: Number(get('overclock') ?? 0),
    fork: (get('fork') ?? 'income') as Args['fork'],
    forkRow: (get('fork-row') ?? 'all') as Args['forkRow'],
    forkSwitchSec: Number(get('fork-switch-sec') ?? 20),
    holdCap: Number(get('hold-cap') ?? HOLD_TUNING.cap),
    seed: get('seed') !== undefined ? Number(get('seed')) : null,
    hand: (get('hand') ?? 'fullest') as Args['hand'],
    cinderDepth: Number(get('cinder-depth') ?? 70),
    pipes: get('pipes') !== 'off',
    holdEmulate: argv.includes('--hold-emulate'),
    drillBehaviour: (get('drill-behaviour') ?? 'fullest') as Args['drillBehaviour'],
    drillBar: Number(get('drill-bar') ?? 0),
    remainsShare: Number(get('remains-share') ?? REMAINS_TUNING.share),
    shore: argv.includes('--shore'),
  };
}

/**
 * A SEEDED ENGINE. `Math.random` is what the engine reaches for directly —
 * compaction decay, ore pockets, crits, deep-entry gate rolls — so seeding the
 * harness's own picks seeds nothing. Two arms one flag apart now see the same
 * world, which is the difference between a comparison and two anecdotes.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Set by main; read by `shop`. Null = every row buys INCOME, as it always did. */
let forkPolicy: ((s: GameState, id: string) => Branch | undefined) | null = null;
let forkPackedBuys = 0;
/** PROGRESSION, not yield. Seconds to each of Loam's two hardness walls and its
 *  floor; zero means never reached inside the run. */
const forkTrack = { t45: 0, t110: 0, t150: 0, packedPeak: 0 };
/** SECONDS TO THE FIRST UNIT of each deep-entry material. Zero = never seen in
 *  the whole arm, which is the reading that matters: a gate nothing reaches is
 *  decorative, and a sink authored against it would starve for the wrong reason. */
const deepFirst: Record<string, number> = { umberjade: 0, graveclaydeep: 0, deepgrave: 0 };
/** Set by main. See `Args.holdEmulate` — this emulates an UNBUILT mechanic. */
let holdEmulate = false;
/** Set by main. SHORING (§9.4): the policy timbers bands only when this is on,
 *  which is the whole difference between the two arms. */
let shorePolicy = false;
/** How dear a band the shoring policy will save up for. Past this it spends the
 *  Brick on the plant instead — see `convReserve`. */
const SHORE_REACH = 4000;
/** Set by main when either A.75 drill-axis flag is off its default. */
let drillAxes: { behaviour: 'fullest' | 'sweep' | 'chain'; bar: number } | null = null;

// ---------------------------------------------------------------------------
// THE INCOME INSTRUMENT (A.44 A0) — what a frontier minute is actually short of
// ---------------------------------------------------------------------------
/**
 * The hourly diag reported `realized%` as `Δtotals[chip] / Δp2CeilingIntegral`
 * and the two are not the same UNIT. A.42 corrected the pillar-2 denominator to
 * charge (`cells × regen`, sim.ts:2164) and never touched this second reader, so
 * the diag has been dividing DUST by CHARGE ever since: every yield multiplier
 * (Blade, crits, temper) inflates the numerator alone. That is the 200–970%
 * readings — roughly ~10x from non-field income and ~100x from the unit slip,
 * multiplied. It is the same defect as A.42 cause #2, in a second code path,
 * and it is the SEVENTH time an unverified harness produced a confident number.
 *
 * Three honest readings replace the one dishonest one:
 *   field%     charge ÷ charge, field-only — the pillar-2 measure, reused
 *   income/s   Δtotals[chip] ÷ window — every purse, which is what a player
 *              actually has to spend on the stair
 *   non-field  income/s minus what the field paid, attributed BY SOURCE with
 *              --income (the commons-ledger pattern, one choke point)
 *
 * And the reading that changes behaviour: the run-end horizon below asked
 * whether the next step costs more than 60s of CEILING income, i.e. it sized a
 * run's pushing power by the field alone while ~90% of deep income comes from
 * elsewhere. `--horizon field` keeps the old basis so the two arms are one
 * flag apart (a baseline measured by different code is not a baseline).
 */
let horizonBasis: 'income' | 'field' = 'income';
/** Measured total income, dust/sec, EMA over ~2 minutes. 0 = no history yet. */
let measuredIncomeRate = 0;
/** Per-source income attribution, `--income` only. */
const incomeLedger: Record<string, number> = {};

// ---------------------------------------------------------------------------
// Pillar-2 idle-charge audit accumulators (shared across all shells).
// ---------------------------------------------------------------------------

const p2Metrics = { pillar2Max: 0, pillar2Samples: 0, pillar2Over: 0, pillar2Straddled: 0 };

/**
 * RETURN-TO-PEAK (pillar 6: back to the prior peak in ≤20–25% of the original
 * time). Measured, not argued — A.42 shipped an aid that touches the price of
 * new ground and left RTP asserted from construction, which the ruling sent
 * back. On each Collapse, remember the peak it paid out on and how long the run
 * that built it took; when the depth reaches that peak again, the ratio of the
 * two is one RTP sample.
 */
/**
 * THE CADENCE DECOMPOSITION (A.42 close-out follow-up).
 *
 * The collapse horizon is derived: a run pushes until the next step costs T
 * seconds of income, cumulative descend cost is ~12x the final step, so the
 * run should take ~12T. T=60s predicts ~12 minutes. It measures ~40.
 *
 * A model and a measurement that disagree by 3.3x are not a number that needs
 * nudging — one of the model's assumptions is false. It has exactly two that
 * can be, and this measures both rather than arguing about them:
 *
 *   INCOME IS CONSTANT. It is not: a Collapse wipes the face upgrades, so a
 *   run starts poor and ends rich. The 12T arithmetic divides the whole
 *   cost by the FINAL income while most of it was actually earned at less.
 *   Predicted stretch factor: I_final / I_mean.
 *
 *   ALL INCOME BUYS DEPTH. It does not: the policy also buys Blade, Soil,
 *   Roots and the rest. Only a fraction f of the run's earnings reaches the
 *   stair. Predicted stretch factor: 1/f.
 *
 * If (I_final/I_mean) / f lands near 3.3, the model is fully explained and the
 * cadence number was never wrong — the derivation was.
 */
const cadence = {
  runStartSec: 0,
  earnedAtStart: 0,
  spentOnDescent: 0,
  rows: [] as Array<{ len: number; earned: number; descent: number; iMean: number; iFinal: number }>,
};

/**
 * WHAT FRACTION OF A COLLAPSE RE-COVERS GROUND ALREADY WALKED (§9.4).
 *
 * The number shoring exists for, and the one the phase is judged on. A descend
 * step is RE-COVER when its target is at or under the shell depth record — the
 * player has stood there before, and is paying and walking to stand there again.
 *
 * Steps and dust are counted apart because the drift moves them differently: it
 * removes the steps outright (the fall does not go through the stair at all),
 * and the steps it leaves are the shallow cheap ones, so the dust share falls
 * further than the step share. Both are printed.
 */
const recover = { steps: 0, reSteps: 0, dust: 0, reDust: 0, falls: 0, driftMax: 0 };
/** The same four counters, restricted to steps taken while a drift EXISTS —
 *  the honest "after" within one run, since the rig arrives two thirds of the
 *  way through a Loam arc and the whole-run figure is mostly the before. */
const recoverPost = { steps: 0, reSteps: 0, dust: 0, reDust: 0, removed: 0, runs: 0 };

const rtp = {
  /**
   * THE TOLERANCE. "Back to your prior peak" is a statement about position,
   * not about a single integer. The corrected collapse policy resets AT the
   * run's maximum, so demanding the exact same depth again is the hardest bar
   * the measure could pick — two 12h idle arms read NO RETURNS while cycling
   * at 144–149 of 150, which is back by any reading a player would recognise.
   */
  tolerance: 0.95,
  /** Recovery ÷ the time it ORIGINALLY took to first stand at that depth.
   *  This is pillar 6 read literally ("the original time"). */
  vsOriginal: [] as number[],
  /** Samples per reset layer, so pillar 6 is answered for all four and not
   *  just the one a 12h run happens to exercise. */
  byLayer: {} as Record<string, number[]>,
  /** Recovery ÷ the length of the run that just ended. The steady-state
   *  reading: how much of each cycle is spent re-treading rather than digging.
   *  Reported alongside because the two answer different questions and only
   *  the first is the pillar. */
  vsRun: [] as number[],
  runStartSec: 0,
  /** Shells whose pre-existing record has been marked unmeasurable. */
  seededShells: new Set<string>(),
  /** First time the player ever stood at each depth, per shell. 0 = the run
   *  began already holding it, so pillar 6 cannot be read against it. */
  firstAt: {} as Record<string, Record<number, number>>,
  /**
   * ONE UNRESOLVED CLAIM PER LAYER (A.44 checkpoint 4).
   *
   * This was a single global slot, and `noteRtpCollapse` opened with
   * `if (rtp.pending) return`. The reason was sound — a player who collapses
   * twice on the way back is still on the way back, so the OLDEST claim must
   * survive — but one slot shared across four rungs means the layer that fires
   * every ~15 minutes permanently starves the ones that fire every few hours.
   * Pillar 6 was therefore verified for the Collapse layer and asserted for the
   * other three. Each rung now keeps its own oldest claim, and they resolve
   * independently.
   */
  pending: {} as Record<string, Claim | null>,
};

interface Claim {
  /** The shell whose depth we are watching for the return. */
  shell: string;
  peak: number;
  at: number;
  runLen: number;
  original: number;
  layer: string;
}

/** What it originally took to first stand at `peak` in `shell`. 0 = never. */
function rtpOriginal(shell: string, peak: number): number {
  return rtp.firstAt[shell]?.[peak] ?? 0;
}

/**
 * Fill first-arrival times from the shell's depth RECORD, not from the depth
 * sampled once a second: the policy descends several steps inside one tick, so
 * sampling `state.depth` misses most depths and the peak a Collapse pays out on
 * usually has no recorded original time at all.
 */
function noteRtpDepth(shell: string, record: number, sec: number): void {
  const per = (rtp.firstAt[shell] ??= {});
  // A DEPTH YOU WERE HANDED HAS NO "ORIGINAL TIME" (A.44, the ninth case).
  //
  // `--scenario recursion` primes depthRecords to 560 before the clock starts,
  // so on the first tick this backfilled first-arrival for every depth 1..560 as
  // sec≈1 — and pillar 6 divides by that. The layer readings came out at 433%
  // and 813%, which look like catastrophic pillar violations and are in fact
  // division by one second. The instrument was being fed the answer it exists to
  // measure, exactly as the Recursion scenario's echo=120 injection was.
  //
  // Depths present before the run began are marked UNMEASURABLE (0), which
  // `noteRtpCollapse` already treats as "no claim". RTP therefore reports only
  // peaks this run actually earned — from a scenario start that means fewer
  // samples, which is the correct answer rather than a confident wrong one.
  const seeded = rtp.seededShells.has(shell);
  if (!seeded) rtp.seededShells.add(shell);
  for (let d = record; d >= 1; d--) {
    if (per[d] !== undefined) break;
    per[d] = seeded ? sec : 0;
  }
}

/**
 * A reset happened. `layer` is the reset ladder rung ('collapse' | 'breach' |
 * 'recursion' | 'spiral'); `shell` is the shell the player LANDS in, so a
 * Breach or a Recursion measures the climb back in the world it dropped you
 * into, capped at that world's floor — the comparable milestone when the old
 * peak's shell no longer exists to return to.
 */
/**
 * `watchShell`/`watchPeak` is what must be re-reached; `original` is what the
 * peak cost the FIRST time, which for a cross-shell reset is measured in the
 * shell you LEFT.
 *
 * THE SECOND DEFECT UNDER THE FIRST (A.44). This used to derive `original` as
 * `firstAt[shell][peak]` on the shell being LANDED IN — and after a Breach or a
 * Recursion you have by definition never stood at that depth in that shell, so
 * `original` was 0, so the claim was discarded on the spot. Breach RTP was not
 * merely starved by the global slot: it could not have recorded a sample even
 * with the slot free. The honest comparison is "Loam d150 took you T; how long
 * to stand at d150 in Ferrite?", so the caller supplies T from the old world.
 */
function noteRtpCollapse(
  watchShell: string,
  watchPeak: number,
  sec: number,
  layer = 'collapse',
  original = rtpOriginal(watchShell, watchPeak),
): void {
  const runLen = sec - rtp.runStartSec;
  rtp.runStartSec = sec;
  // KEEP THE OLDEST UNRESOLVED CLAIM — PER LAYER. Pillar 6 asks how long it
  // takes to get back to your peak, not how long within one cycle: a player who
  // collapses twice on the way back is still on the way back. Overwriting made
  // every sample vanish (16 collapses, zero returns). Sharing ONE slot across
  // the four rungs made the rare rungs vanish instead.
  if (rtp.pending[layer]) return;
  // A run that built nothing has no peak to return to.
  rtp.pending[layer] = watchPeak > 0 && runLen > 0 && original > 0
    ? { shell: watchShell, peak: watchPeak, at: sec, runLen, original, layer }
    : null;
}

function noteRtpTick(shell: string, record: number, depth: number, sec: number): void {
  noteRtpDepth(shell, record, sec);
  for (const [layer, p] of Object.entries(rtp.pending)) {
    if (!p || p.shell !== shell) continue;
    if (depth < p.peak * rtp.tolerance) continue;
    rtp.vsOriginal.push((sec - p.at) / p.original);
    rtp.vsRun.push((sec - p.at) / p.runLen);
    (rtp.byLayer[layer] ??= []).push((sec - p.at) / p.original);
    rtp.pending[layer] = null;
  }
}

/** Any rung still owing a return at the end of the run. */
function rtpUnresolved(): string[] {
  return Object.entries(rtp.pending).filter(([, p]) => p).map(([l]) => l);
}
// ---------------------------------------------------------------------------
// Verdance play — the garden, the threads, the still, the network.
// ---------------------------------------------------------------------------

let growthPolicy: Args['growth'] = 'clear';
const verdMetrics = { farmHarvests: 0 };
let lastFarmSweep = -1e9;

/** Two quadrants (top-left, bottom-right) go feral under the cultivate policy. */
function isFarmCell(s: GameState, cell: number): boolean {
  if (growthPolicy !== 'cultivate') return false;
  if (currentShell(s).id !== 'verdance') return false;
  const { w, h } = s.face;
  const x = cell % w;
  const y = Math.floor(cell / w);
  const tl = x < Math.floor(w / 2) && y < Math.floor(h / 2);
  const br = x >= Math.floor(w / 2) && y >= Math.floor(h / 2);
  return tl || br;
}

function verdancePlay(engine: Engine, s: GameState, wallBlocked: boolean): void {
  void wallBlocked;
  // The farm sweep: harvest bloom+ vines in the farmed quadrants.
  if (growthPolicy === 'cultivate' && currentShell(s).id === 'verdance' &&
      s.stats.playTimeSec - lastFarmSweep > 120) {
    lastFarmSweep = s.stats.playTimeSec;
    for (let i = 0; i < s.face.cells.length; i++) {
      // A patient farmer harvests FERAL — the young stages clip the bank.
      if (isFarmCell(s, i) && (s.growth.stage[i] ?? 0) >= 4) {
        engine.dispatch({ type: 'chip', cell: i });
        verdMetrics.farmHarvests += 1;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Glassmere play — optics, skies, the bench, detours, runes.
// ---------------------------------------------------------------------------

function glassmerePlay(engine: Engine, s: GameState, log: (msg: string) => void): void {
  void log;
  if (currentShell(s).id === 'glassmere') {
    // Optics: keep a simple L-path lit (mirrors survive descends).
    if (Object.keys(s.refraction.mirrors).length === 0) {
      engine.dispatch({ type: 'setBeamRow', row: 2 });
      const w = s.face.w;
      engine.dispatch({ type: 'setMirror', cell: 2 * w + (w - 2), kind: '\\' });
      engine.dispatch({ type: 'setMirror', cell: (s.face.h - 2) * w + (w - 2), kind: '/' });
    }
    if (s.refraction.mirrorStock < 4 && (s.currencies['silica']?.toNumber() ?? 0) > 300) {
      engine.dispatch({ type: 'buyMirror' });
    }
  }
  // Runes: etch the good grammar as finds allow.
  const seqs: Array<[('tool' | 'offhand' | 'harness'), (string | null)[]]> = [
    ['tool', ['kel', 'thur', 'kel']],
    ['offhand', ['sen', 'vey', null]],
    ['harness', ['ash', 'mol', null]],
  ];
  for (const [target, seq] of seqs) {
    const cur = s.runes.inscriptions[target] ?? [];
    if (cur[0]) continue;
    const need: Record<string, number> = {};
    for (const r of seq) if (r) need[r] = (need[r] ?? 0) + 1;
    if (Object.entries(need).every(([r, n]) => (s.runes.found[r] ?? 0) >= n)) {
      engine.dispatch({ type: 'inscribe', target, sequence: seq });
    }
  }
}

// ---------------------------------------------------------------------------
// Cinder play — three heat stances audit the failure state's charter:
//   safe    never chokes, never wells; the Damper's line must stay VIABLE.
//   balanced chokes during active bursts, purges at 97, small wells.
//   greedy  rides 90+ choked with overdrive, purges at 99 — hot, never dead.
// ---------------------------------------------------------------------------

let heatStance: Args['heat'] = 'balanced';
/** A.104's floor arm. Module-scoped for the same reason `heatStance` is. */
let plumbs = true;
const cinderMetrics = { heatSum: 0, heatSamples: 0, purges: 0 };

function cinderPlay(engine: Engine, s: GameState, log: (msg: string) => void): void {
  if (currentShell(s).id !== 'cinder') return;
  const p = s.pressure;
  cinderMetrics.heatSum += p.heat;
  cinderMetrics.heatSamples += 1;

  // The Vent Network: every stance plumbs — headroom is never the wrong buy.
  // `--pipes off` is the floor arm (A.104): nothing plumbed, no Array, and the
  // question is whether the shell can still be crossed.
  if (plumbs && (s.currencies['obsidian']?.toNumber() ?? 0) > nextPipeCost(s) * 3) {
    const route = [
      VENT_SHAFT_CELL, VENT_SHAFT_CELL + 1, VENT_SHAFT_CELL + 2, VENT_SHAFT_CELL + 3,
      VENT_SHAFT_CELL + 4, VENT_SHAFT_CELL + 5, VENT_SHAFT_CELL + 6, // right-mid outlet
      3, 10, 17, // spur up to the top-mid outlet
      31, 24, // spur down to the bottom-mid outlet
    ];
    const next = route.find((c) => s.pressure.pipes[c] !== 1);
    if (next !== undefined) engine.dispatch({ type: 'layPipe', cell: next });
  }

  // The choke — the voluntary line, stance by stance.
  const active = s.stats.playTimeSec - p.lastStokeSec < 30;
  if (heatStance === 'safe') {
    if (p.choke) engine.dispatch({ type: 'setChoke', on: false });
  } else if (heatStance === 'balanced') {
    const want = active && p.heat < 85;
    if (p.choke !== want) engine.dispatch({ type: 'setChoke', on: want });
    // Purge only inside a real klaxon — the quarter is an emergency price.
    if (p.overpressureAtSec !== null && s.stats.playTimeSec - p.overpressureAtSec > 20) {
      if (engine.dispatch({ type: 'emergencyPurge' }).ok) cinderMetrics.purges += 1;
    }
  } else {
    // Greedy rides the low-90s on the choke itself: choke below 96, crack
    // the valve above it (the relief sheds ~3/s), re-choke under 92. The
    // purge is a true emergency (a countdown half run out), not a rhythm —
    // a competent pusher pays the quarter almost never.
    const want = active && p.heat < (p.choke ? 96 : 92);
    if (p.choke !== want) engine.dispatch({ type: 'setChoke', on: want });
    if (p.overpressureAtSec !== null && s.stats.playTimeSec - p.overpressureAtSec > 25) {
      if (engine.dispatch({ type: 'emergencyPurge' }).ok) cinderMetrics.purges += 1;
    }
  }

  void log;
}

// ---------------------------------------------------------------------------
// Hollow + Aleph play (Phase 10): farm the Silence, rebuild the face, run a
// tape, touch the Core, recurse, write an Axiom. The endgame loop.
// ---------------------------------------------------------------------------

const p10Metrics = {
  silenceHarvests: 0, cellsRebuilt: 0, recursions: 0,
  coreTouches: 0,
};

function hollowPlay(engine: Engine, s: GameState, log: (msg: string) => void): void {
  const shell = currentShell(s).id;
  if (shell !== 'hollow' && shell !== 'aleph') return;

  if (shell === 'hollow') {
    // The auto-listener holds the idle floor; set it once, high.
    if (s.hollow.listenAt === 0) engine.dispatch({ type: 'setListenAt', stacks: 70 });
    // An active player also harvests manually when the quiet is loud.
    if (s.hollow.silence >= 55) {
      if (engine.dispatch({ type: 'listen' }).ok) p10Metrics.silenceHarvests += 1;
    }
    // Reconstruction: buy the next cell whenever Void allows and depth permits.
    const rebuiltCount = s.hollow.rebuilt.length;
    if (rebuiltCount < s.face.cells.length) {
      const nextCell = s.face.cells.findIndex((_, i) => !s.hollow.rebuilt.includes(i));
      if (nextCell >= 0) {
        const r = engine.dispatch({ type: 'rebuildCell', cell: nextCell });
        if (r.ok) {
          p10Metrics.cellsRebuilt += 1;
          if (p10Metrics.cellsRebuilt <= 3 || p10Metrics.cellsRebuilt % 8 === 0) {
            log(`rebuilt cell ${p10Metrics.cellsRebuilt}/${s.face.cells.length} at hollow depth ${s.depth}`);
          }
        }
      }
    }
  }

  if (shell === 'aleph') {
    // At the Core: touch it, then recurse, then write one Axiom.
    if (s.depth >= 40 && !s.aleph.coreTouched) {
      if (engine.dispatch({ type: 'touchCore' }).ok) {
        p10Metrics.coreTouches += 1;
        log(`*** THE CORE TOUCHED (recursion ${s.recursion.count} pending) ***`);
      }
    }
    if (s.aleph.coreTouched) {
      const peakBefore = Math.max(s.depth, s.shaft.reached);
      const leftShellId = currentShell(s).id;
      const r = engine.dispatch({ type: 'recurse' });
      if (r.ok) {
        const d = r.data as { count: number; axiomsGained: number };
        p10Metrics.recursions += 1;
        // A RECURSION IS A RUNG OF THE LADDER, SO PILLAR 6 MEASURES IT (A.44).
        // Nothing recorded it before, which is half of why RTP has only ever
        // reported the Collapse layer: the other half was that no policy could
        // reach the Core at all. A Recursion lands you back in Loam, so the
        // climb back is capped at Loam's floor, exactly as a Breach is.
        const landed = currentShell(engine.getState() as GameState);
        noteRtpCollapse(landed.id, Math.min(peakBefore, landed.floorDepth),
          (engine.getState() as GameState).stats.playTimeSec, 'recursion',
          rtpOriginal(leftShellId, peakBefore));
        // `doRecursion` calls replaceState, so the `s` this function closed over
        // is now a DEAD OBJECT. Reading `s.recursion.axioms` off it reported an
        // empty list and every buyAxiom below silently did nothing — the run
        // earned two Axioms and wrote none, so the fold-down laws this whole
        // re-rate exists to unlock were never once exercised.
        const now = engine.getState() as GameState;
        log(`*** RECURSION ${d.count} | +${d.axiomsGained} Axioms (banked ${fmt(now.currencies['axiom'] ?? 0)}) ***`);
      }
    }
    // THE SPIRAL — rung four, and the sim has never once dispatched it (A.44).
    // `type: 'spiral'` appeared nowhere in this file, so the Automation Grid,
    // the parallel-world licences and Spiral RTP were all unreachable from the
    // harness no matter how long a run went. The third of three independent
    // blockers on four-layer pillar-6 coverage, and the only one that was a
    // plain omission rather than a subtle defect.
    if (canSpiral(s)) {
      const before = currentShell(s);
      const peakBefore = Math.max(s.depth, s.shaft.reached);
      const leftId = before.id;
      if (engine.dispatch({ type: 'spiral' }).ok) {
        const now = engine.getState() as GameState;
        const landed = currentShell(now);
        noteRtpCollapse(landed.id, Math.min(peakBefore, landed.floorDepth),
          now.stats.playTimeSec, 'spiral', rtpOriginal(leftId, peakBefore));
        log(`*** SPIRAL ${now.spiral.count} | banked ${fmt(now.currencies['spiral'] ?? 0)} ***`);
        // Capacity is the whole point of the rung: seat what the purse allows.
        for (let i = 0; i < 4; i++) {
          if (!engine.dispatch({ type: 'buyGridSlot' }).ok) break;
        }
        const after = engine.getState() as GameState;
        if (after.spiral.slots > 0) log(`  grid slots ${after.spiral.slots}`);
      }
    }
  }
}

// A standalone cache for policy cost reads (the engine keeps its own).
const mods = new ModifierCache();

/**
 * Chip `count` times. Polarity-aware: when a signature chain is live, prefer
 * the fullest cell of the SAME sign; break deliberately only when nothing
 * same-signed holds meaningful charge. Without polarity it's plain greedy.
 */
/**
 * THE CONCENTRATED HAND — a rotating six-cell working set, worked down to the
 * terminal gate and then abandoned for the next six.
 *
 * `chipFullest` below is greedy on CHARGE, which means it walks the whole board
 * and never leaves a cell packed. That is the correct policy for income and the
 * worst possible one for a per-cell counter: it models a player who never does
 * the thing compaction exists to reward, and every fork verdict this project
 * has produced was measured through it. Standing rule since the decay pass —
 * any sim that touches compaction uses this hand.
 */
let handWindow = 0;
let handCursor = 0;
const HAND_WIDTH = 6;
function chipConcentrated(engine: Engine, count: number): void {
  const s = engine.getState() as GameState;
  const n = s.face.cells.length;
  if (n === 0) return;
  for (let k = 0; k < count; k++) {
    const base = (handWindow * HAND_WIDTH) % n;
    engine.dispatch({ type: 'chip', cell: (base + (handCursor % HAND_WIDTH)) % n });
    handCursor++;
    // Move on once every cell in the window is on the terminal gate. Below
    // that the window is still paying better than a fresh one.
    const comp = s.face.compaction ?? [];
    let done = true;
    for (let i = 0; i < HAND_WIDTH; i++) {
      if ((comp[(base + i) % n] ?? 0) < 20) { done = false; break; }
    }
    if (done) handWindow++;
  }
}

function chipHand(engine: Engine, count: number, hand: Args['hand']): void {
  if (hand === 'concentrated') chipConcentrated(engine, count);
  else chipFullest(engine, count);
}

function chipFullest(engine: Engine, count: number): void {
  const s = engine.getState();
  const usePolarity = currentShell(s).signatureId === 'polarity' || s.shell.signatures.includes('polarity');
  for (let k = 0; k < count; k++) {
    let best = -1;
    let bestCharge = 0;
    if (usePolarity && s.polarity.chain > 0) {
      for (let i = 0; i < s.face.cells.length; i++) {
        if (isFarmCell(s as GameState, i)) continue; // the garden is off-limits
        if ((s.polarity.signs[i] ?? 1) !== s.polarity.lastSign) continue;
        const c = s.face.cells[i]!;
        if (c > bestCharge) {
          bestCharge = c;
          best = i;
        }
      }
      // Nothing same-signed worth chipping? Take the greedy break.
      if (bestCharge < 1.5) best = -1;
    }
    if (best < 0) {
      bestCharge = 0;
      for (let i = 0; i < s.face.cells.length; i++) {
        if (isFarmCell(s as GameState, i)) continue;
        const c = s.face.cells[i]!;
        if (c > bestCharge) {
          bestCharge = c;
          best = i;
        }
      }
    }
    if (best < 0 || bestCharge < 1) break; // not worth the stroke
    engine.dispatch({ type: 'chip', cell: best });
  }
}

const CORE_PRIORITY = [
  'grit', 'deepGrit', 'ballast', 'momentum', 'wellspring', 'resonantCore',
  'emberMemory', 'persistence', 'overseer', 'millstone', 'keenEye', 'farsight', 'secondWind', 'faultLines',
];
const SKILL_PRIORITY = [
  'sharpenedEdge', 'scholar', 'twoHandedSwing', 'splinterSense', 'assayersHunch',
  'deepGrip', 'marginalia', 'drillLogic', 'stoker', 'cartographer', 'patternGhost', 'heavyHands',
];

/** Forge play: keep the tool ahead of the hardness walls, crack what drops.
 * Returns true while HARD-blocked by a wall — the shop then hoards the
 * converter currency for the tool instead of spending it. */
function forgePlay(engine: Engine, s: GameState, log: (msg: string) => void): boolean {
  if (!s.forge.built) return false;
  const tier = equippedTool(s).tier;
  const shell = currentShell(s);
  const hardBlocked = requiredTier(s, s.depth + 1) > tier;
  // Craft the next pick when the wall is near (or already blocking).
  const wallSoon = requiredTier(s, Math.min(s.depth + 8, shell.floorDepth)) > tier;
  // Craft the next tier the moment it is affordable — a wall never has to be
  // touching you to justify a better pick. EVERY recipe at that tier is tried,
  // best chip-spread first: a real player takes the good pick when the bank
  // allows and the crude one when it does not, and the ladder's floor exists
  // precisely so the second case is never a dead end. (This used to name ONE
  // recipe per tier, which made the commons-only fallbacks invisible to the
  // harness — the sim would report a wall the game did not have.)
  const target = tier + 1;
  const atTier = TOOL_RECIPES.filter((r) => r.tier === target)
    .sort((a, b) => b.chipSpread - a.chipSpread);
  let crafted = false;
  const refusals: string[] = [];
  for (const recipe of atTier) {
    const result = engine.dispatch({ type: 'craftTool', recipeId: recipe.id });
    if (result.ok) {
      log(`forged ${recipe.id} (tier ${target}) at ${shell.id} depth ${s.depth}`);
      crafted = true;
      break;
    }
    // A refusal that names WHAT is short but not HOW MUCH you hold is half a
    // diagnosis — the A.41 investigation lost an hour to exactly that gap.
    const held = Object.entries(recipe.inputs)
      .map(([m, n]) => `${m} ${materialCount(s, m)}/${n}`)
      .join(', ');
    refusals.push(`${recipe.id}: ${result.reason} [${held}]`);
  }
  if (!crafted && hardBlocked && atTier.length > 0 && s.stats.playTimeSec - lastCraftWhine > 1800) {
    lastCraftWhine = s.stats.playTimeSec;
    log(`wall-blocked at ${shell.id} ${s.depth} (tier ${target}) — ${refusals.join(' | ')}`);
  }
  // UPGRADE WITHIN THE TIER. A real player who crossed a wall on the crude
  // pick replaces it with the good one the moment the bank allows; the policy
  // only ever crafted tier+1, so it crossed on the ladder's floor recipe and
  // then ran the WHOLE SHELL on a 0.95 spread instead of 1.15. That is a
  // harness artifact, and it cost ~14% of the loam-floor beat before it was
  // caught — the sim was modelling a player who never upgrades.
  const equipped = equippedTool(s);
  const wornRecipe = TOOL_RECIPES.find((r) => r.id === equipped.recipeId);
  if (wornRecipe) {
    for (const better of TOOL_RECIPES.filter(
      (r) => r.tier === wornRecipe.tier && r.chipSpread > wornRecipe.chipSpread,
    ).sort((a, b) => b.chipSpread - a.chipSpread)) {
      if (engine.dispatch({ type: 'craftTool', recipeId: better.id }).ok) {
        log(`upgraded within tier ${better.tier}: ${wornRecipe.id} -> ${better.id}`);
        break;
      }
    }
  }
  void wallSoon;
  while (s.materials.geodes > 0) {
    if (!engine.dispatch({ type: 'crackGeode' }).ok) break;
  }
  // Socket any gem into any open socket of the equipped tool.
  const tool = equippedTool(s);
  const openSlot = tool.sockets.findIndex((g) => g === null);
  if (openSlot >= 0) {
    for (const [gemId, count] of Object.entries(s.materials.gems)) {
      if (count > 0) {
        engine.dispatch({ type: 'socketGem', toolId: tool.id, slot: openSlot, gemId });
        break;
      }
    }
  }
  if (assayUnlocked(s) && !s.assay.active && s.assay.boostChips === 0) {
    engine.dispatch({ type: 'startAssay' });
  }
  return hardBlocked;
}

let lastCraftWhine = -1e9;

/** Ferrite-era play: magnets, resonant memory. */
// ---------------------------------------------------------------------------
// THE EXPORT SPINE (Part B) — a competent player provisions the shell below
// before leaving, and lets Serra fill the gaps. This block is the sim-side
// proof of the curriculum law: every gate the spine adds must be payable by
// the policies here, or the run stalls and the harness shows it.
// ---------------------------------------------------------------------------

const spineMetrics = { fluxFired: 0 };

function provisionSpine(engine: Engine, s: GameState, log: (msg: string) => void): void {
  const shell = currentShell(s).id;

  // FERRITE — fire Kilnflux for the pours (the last surviving export, via the
  // Refinery transmute chain).
  if (shell === 'ferrite') {
    if (
      transmuteUnlocked(s) && materialCount(s, 'kilnflux') < 2
      && materialCount(s, 'palegold') >= 1 && materialCount(s, 'marl') >= 1
    ) {
      if (engine.dispatch({ type: 'transmute', a: 'palegold', b: 'marl' }).ok) {
        spineMetrics.fluxFired += 1;
        if (spineMetrics.fluxFired === 1) log('spine: first Kiln Firing (palegold + marl -> 6 kilnflux)');
      }
    }
  }
}

function ferritePlay(engine: Engine, s: GameState, log: (msg: string) => void): void {
  if (s.shell.breachCount === 0) return;
  // Magnets: buy when Scale allows; poles all + for long corridors.
  if (magnetArrayUnlocked(s)) {
    if (engine.dispatch({ type: 'buyMagnet' }).ok) log(`magnet ${s.polarity.magnetCount} rigged`);
    for (let c = 0; c < s.polarity.magnetCount; c++) {
      if ((s.polarity.magnets[c] ?? 0) !== 1) engine.dispatch({ type: 'toggleMagnet', col: c });
    }
  }
  // THE ATTENDED MARGIN (B3): the best Echo deals on the board, so a
  // competent player RESERVES for the next slot — the cheaper sinks
  // (resonant memory) otherwise drain every purse before a 4-Echo slot fills.
  attendConfluences(engine, s, log);
  const savingForSlot =
    s.confluences.found.length > 0 && s.confluences.slots.length < confluenceSlotCap(s);
  if (!savingForSlot) engine.dispatch({ type: 'buyResonantMemory' });
}

/** Slots, then choices (live first — re-choosing is free), then depth. */
function attendConfluences(engine: Engine, s: GameState, log: (msg: string) => void): void {
  if (s.confluences.found.length === 0) return;
  if (s.confluences.slots.length < confluenceSlotCap(s)) {
    if (engine.dispatch({ type: 'confluenceBuySlot' }).ok) {
      log(`attention widened to ${s.confluences.slots.length} slots`);
    }
  }
  if (s.confluences.slots.length === 0) return;
  const live = new Set(activeConfluences(s).map((c) => c.id));
  const slotted = new Set(s.confluences.slots.map((x) => x.id).filter((x) => x !== null));
  // A competent player amplifies what moves INCOME (the chip path), not the
  // biggest number: +40% motifGain is quieter than +20% dustYield.
  const bucketWeight: Record<string, number> = {
    dustYield: 3, strikePower: 2, drillPower: 2, regen: 2, cap: 1.5, brickYield: 1, chainPower: 1,
  };
  const score = (id: string): number => {
    const def = CONFLUENCE_BY_ID.get(id);
    if (!def) return 0;
    return (live.has(id) ? 10 : 0) + (bucketWeight[def.bucket] ?? 0.2) * def.bonus;
  };
  const candidates = s.confluences.found
    .filter((id) => !slotted.has(id))
    .sort((a, b) => score(b) - score(a));
  for (let i = 0; i < s.confluences.slots.length; i++) {
    const sl = s.confluences.slots[i]!;
    // Fill an empty slot, and swap a QUIET choice for a LIVE candidate (free).
    const wantSwap = sl.id !== null && !live.has(sl.id) && live.has(candidates[0] ?? '');
    if ((sl.id === null || wantSwap) && candidates.length > 0) {
      engine.dispatch({ type: 'confluenceSetSlot', slot: i, id: candidates.shift()! });
    }
  }
  for (let i = 0; i < s.confluences.slots.length; i++) {
    const sl = s.confluences.slots[i]!;
    if (sl.id !== null && sl.rank < CONFLUENCE_RANK_CAP) {
      engine.dispatch({ type: 'confluenceBuyRank', slot: i });
      break;
    }
  }
}

/** Greedy shopping trip — mirrors how a competent player spends. */
function shop(engine: Engine, log: (msg: string) => void): void {
  const s = engine.getState() as GameState;
  mods.invalidate();

  /**
   * SHORING (§9.4) — the treatment arm's only behavioural difference.
   *
   * Raise the rig the moment the wreck at Shoring Deep has been walked to, then
   * timber the SHALLOWEST untimbered band, one per shop tick, whenever it costs
   * under half the Brick bank. Shallowest-first is not a preference, it is the
   * mechanic: drifts chain, so a band bought out of order extends the fall by
   * nothing (`strandedDrifts`).
   *
   * The half-bank slice is the same shape as `buyIfUnder` uses for every other
   * Brick sink, so shoring competes with field expansion the way a player's
   * Brick actually has to.
   */
  if (shorePolicy) {
    const rigDef = allUpgrades().find((u) => u.id === 'shoringRig')!;
    if (upgradeLevel(s, 'shoringRig') === 0 && rigDef.visible?.(s)) {
      if (engine.dispatch({ type: 'buyUpgrade', id: 'shoringRig' }).ok) log('raised the shoring rig');
    }
    if (shoringUnlocked(s)) {
      /**
       * POUR THE PROPS. §9.4 prices a band in Brick AND CAST PARTS, and this
       * harness has never poured a part in its life — `casting.rack` is empty in
       * every run in this project's history, which is why the first shoring arm
       * came out bit-identical to its baseline with the rig standing and not one
       * band timbered. The policy could not pay half the price.
       *
       * So the treatment arm melts a common and pours a head when the rack is
       * short, through the same two dispatches the Casting Floor uses. It is
       * still one flag apart: without `--shore` none of this runs and the
       * baseline is the harness exactly as it was.
       */
      if ((s.casting.rack?.length ?? 0) < 4) {
        // A MELT TAKES TIME. The first cut charged and poured in the same tick
        // and every pour came back "the tub is empty" — `frontCharge` is only
        // ready after `tickCasting` has run it down, so this pours what is ready
        // and otherwise charges, one step per shop tick.
        if (!engine.dispatch({ type: 'castPart', partType: 'head' }).ok) {
          for (const id of ['marl', 'ochre', 'bonechalk', 'graveclay']) {
            if (materialCount(s, id) < 6) continue;
            if (engine.dispatch({ type: 'chargeCrucible', materialId: id, units: 3 }).ok) break;
          }
        }
      }
      const next = bands(s).find((b) => !isShored(s, b.def.id));
      if (next && shoreBlocker(s, next.def.id) === null) {
        const cost = shoreCost(s, next.def.id)!;
        if ((s.currencies[convCurrencyId(s)] ?? D(0)).gte(cost.brick)) {
          if (engine.dispatch({ type: 'shoreBand', stationId: next.def.id }).ok) {
            log(`shored ${next.def.name} (${next.from}-${next.to}m) — drift now ${driftDepth(s)}m`);
          }
        }
      }
    }
  }

  // Structures first — they are the unlocks.
  for (const id of ['kilnBuild', 'bayBuild', 'forgeBuild']) {
    const def = allUpgrades().find((u) => u.id === id)!;
    if (upgradeLevel(s, id) === 0 && (!def.visible || def.visible(s))) {
      if (engine.dispatch({ type: 'buyUpgrade', id }).ok) log(`built ${id}`);
    }
  }

  // Chip/conv upgrades: spend if a level costs under a slice of the bank.
  // Currency resolves per shell — the same policy plays Loam and Ferrite.
  const dust = () => s.currencies[chipCurrencyId(s)]!;
  /**
   * A RESERVE, NOT A LATCH — the same fix `unlockReserve` needed in the descend
   * policy (A.43), for the same failure and one currency over.
   *
   * The first run of the shoring arm bought NOTHING: the rig is 400 Brick, and
   * every tick `buyIfUnder` had already drained the bank into Blade/Soil/
   * expand, so the bank never once sat at 400 and the treatment arm came out
   * bit-identical to the baseline. That is the policy refusing something it can
   * plainly afford over any two minutes — a harness bug, and it would have been
   * reported as "shoring changes nothing".
   *
   * So while the rig is visible and unbought, the other Brick sinks see a bank
   * with its price held back. Off entirely without `--shore`, so the baseline
   * arm is untouched.
   */
  const convReserve = (): Decimal => {
    if (!shorePolicy) return D(0);
    const def = allUpgrades().find((u) => u.id === 'shoringRig')!;
    if (upgradeLevel(s, 'shoringRig') === 0) return def.visible?.(s) ? def.baseCost : D(0);
    /**
     * AND THEN THE NEXT BAND, up to an AFFORDABILITY HORIZON.
     *
     * Uncapped this would freeze the whole Brick economy forever the moment the
     * next band is a deep one: a band at 110–120m costs ~700k Brick against a
     * Loam arc that ends holding tens, so the policy would stop buying drill
     * chassis in order to save for something it will never reach. `SHORE_REACH`
     * is the point past which a human stops saving and spends — and how far the
     * arm actually got is a RESULT, not an assumption, so it is reported.
     */
    const next = bands(s).find((b) => !isShored(s, b.def.id));
    if (!next || !shoringUnlocked(s)) return D(0);
    const cost = shoreCost(s, next.def.id)?.brick ?? D(0);
    return cost.lte(SHORE_REACH) ? cost : D(0);
  };
  const brick = () => {
    const free = s.currencies[convCurrencyId(s)]!.sub(convReserve());
    return free.gt(0) ? free : D(0);
  };
  const buyIfUnder = (id: string, bank: () => Decimal, slice: number) => {
    const def = allUpgrades().find((u) => u.id === id)!;
    if (def.visible && !def.visible(s)) return;
    const level = upgradeLevel(s, id);
    if (level >= def.maxLevel) return;
    const cost = nextCost(def, level);
    if (!bank().mul(slice).gte(cost)) return;
    const branch = forkPolicy?.(s, id);
    if (engine.dispatch({ type: 'buyUpgrade', id, branch }).ok && branch === 'packed') {
      forkPackedBuys += 1;
    }
  };
  buyIfUnder('blade', dust, 0.35);
  buyIfUnder('soil', dust, 0.35);
  buyIfUnder('roots', dust, 0.2);
  buyIfUnder('lantern', dust, 0.1);
  // THE KEYSTONE (Part B): shore the floor before the breach check. Craft leg
  // first (the shell's system pays it); the buy leg when the bank can carry
  // the Guild's haul — this is the idle path the ruling requires, and the
  // idle-policy run is its proof.
  const shell = currentShell(s);
  if (
    keystoneFor(shell.id) &&
    !keystonePlaced(s, shell.id) &&
    s.depth >= shell.floorDepth - 30
  ) {
    const crafted = engine.dispatch({ type: 'placeKeystone', leg: 'craft' });
    if (crafted.ok) log(`keystone set (craft) — ${shell.id}`);
    else {
      const price = keystoneIdlePrice(s, keystoneFor(shell.id)!);
      if (dust().gte(price.mul(1.5))) {
        if (engine.dispatch({ type: 'placeKeystone', leg: 'buy' }).ok) {
          log(`keystone set (bought) — ${shell.id}`);
        }
      }
    }
  }
  // The Breach: fall through once the shell has paid out (~500+ cores this
  // breach -> 3 Echoes; DESIGN expects ~800 earned across Shell I).
  if (canBreach(s) && s.shell.coresEarnedThisBreach.gte(500)) {
    const peakBefore = Math.max(s.depth, s.shaft.reached);
    const recursionsBefore = s.recursion.count;
    const leftShellId = currentShell(s).id;
    const result = engine.dispatch({ type: 'breach' });
    if (result.ok) {
      // The old shell is gone, so "return to prior peak" is measured as the
      // climb back to the same depth in the world you land in, capped at that
      // world's floor. A Breach that rolls the Recursion is logged as the
      // deeper rung — the ladder's cost is the rung you actually paid.
      const landed = currentShell(s);
      const layer = s.recursion.count > recursionsBefore ? 'recursion' : 'breach';
      // The original time comes from the world you LEFT — you have never stood
      // at this depth in the one you are landing in.
      noteRtpCollapse(landed.id, Math.min(peakBefore, landed.floorDepth),
        s.stats.playTimeSec, layer, rtpOriginal(leftShellId, peakBefore));
      log(`*** BREACH -> ${s.shell.current.toUpperCase()} | echoes ${fmt(s.currencies['echo']!)} ***`);
    }
  }

  // The Forge outranks everything when a wall is in the way — hoard for it.
  const wallBlocked = forgePlay(engine, s, log);
  provisionSpine(engine, s, log);
  ferritePlay(engine, s, log);
  verdancePlay(engine, s, wallBlocked);
  glassmerePlay(engine, s, log);
  cinderPlay(engine, s, log);
  hollowPlay(engine, s, log);
  if (!wallBlocked) {
    buyIfUnder('expand', brick, 0.5);
    buyIfUnder('bellows', brick, 0.35);
    buyIfUnder('firebrick', brick, 0.35);
    buyIfUnder('drillCount', brick, 0.5);
  }

  // Cheapest drill upgrade, if it's pocket change (keep a conv buffer).
  if (s.drills.bayBuilt && s.drills.units.length > 0 && !wallBlocked && brick().gte(40)) {
    let cheapest = 0;
    for (let i = 1; i < s.drills.units.length; i++) {
      if (s.drills.units[i]!.level < s.drills.units[cheapest]!.level) cheapest = i;
    }
    engine.dispatch({ type: 'upgradeDrill', index: cheapest });
  }

  // The kiln must not starve the descent fund: bank the fire when the chip
  // bank is thin (an idle player's seep trickle otherwise vanishes into it).
  if (s.kiln.built) {
    const thin = dust().lt(currentDescendCost(s, mods).mul(2));
    if (thin && s.kiln.feeding && brick().gte(60)) {
      engine.dispatch({ type: 'setKilnFeeding', feeding: false });
    } else if (!s.kiln.feeding && (!thin || brick().lt(60))) {
      engine.dispatch({ type: 'setKilnFeeding', feeding: true });
    }
  }

  // Descend with a buffer — keep some bank for the shopping trips, and RESERVE
  // the price of the next unlock rather than freezing until you have bought it.
  //
  // (A.43 A1 harness fix, the sixth of its kind.) This read
  // `s.kiln.built || currentDescendCost < 100`, which is not a reserve, it is a
  // LATCH: `descendCost(17) = 108`, so from depth 16 the policy refused every
  // descent until the Kiln existed. Measured on the opening instrument: **depth
  // frozen at 16 for seventeen minutes** while the bank sat at 100–415 dust and
  // income grew ELEVEN-FOLD — a player who by minute 25 earns 145 dust a minute
  // and will not spend 108 on a step. That is the same shape as the policy that
  // never upgraded within a tier: refusing something it can plainly afford, and
  // the seventeen minutes were being read as an idle-economy problem.
  //
  // A reserve models the actual decision (save for the unlock, spend the
  // surplus) and lets the unlock arrive on the same clock.
  const unlockReserve = () => {
    if (s.kiln.built) return D(0);
    const def = allUpgrades().find((u) => u.id === 'kilnBuild');
    return def ? def.baseCost : D(0);
  };
  const RESERVE_MODE = process.env.SIM_DESCEND_POLICY ?? 'reserve';
  while (
    (RESERVE_MODE === 'plain'
      ? dust().gte(currentDescendCost(s, mods).mul(1.5))
      : RESERVE_MODE === 'latch'
        ? dust().gte(currentDescendCost(s, mods).mul(1.5)) && (s.kiln.built || currentDescendCost(s, mods).lt(100))
        : dust().sub(unlockReserve()).gte(currentDescendCost(s, mods).mul(1.5)))
  ) {
    mods.invalidate();
    const paid = effectiveDescendCost(s, mods).toNumber();
    // RE-COVER (§9.4): is the step about to be taken into ground already walked?
    // The record is the whole test — you have stood there, and here you are
    // paying and walking to stand there again.
    const already = s.depth + 1 <= (s.depthRecords[s.shell.current] ?? 0);
    if (!engine.dispatch({ type: 'descend' }).ok) break;
    cadence.spentOnDescent += paid; // what the stair actually took
    recover.steps += 1;
    recover.dust += paid;
    if (already) { recover.reSteps += 1; recover.reDust += paid; }
    if ((s.shaft.drift ?? 0) > 0) {
      recoverPost.steps += 1;
      recoverPost.dust += paid;
      if (already) { recoverPost.reSteps += 1; recoverPost.reDust += paid; }
    }
  }

  // Collapse when the yield is worth the reset — the bar rises with lifetime
  // earnings, capped below the best a floor-depth run can pay (14 at d150),
  // so late Shell I keeps cycling toward its ~800-core total. Once the
  // breach bank is full, stop collapsing and push for the floor instead.
  const gain = coresForDepth(s.depth).toNumber();
  const earned = s.totals['core']?.toNumber() ?? 0;
  // THE MACRO-TUNING FIX (diagnosis #1): the old latch stopped collapsing
  // forever once 500 cores were banked, freezing the ladder for 30+ hours.
  // A human pushes for the floor only while the frontier is actually within
  // reach (~2 minutes of ceiling income); otherwise they keep cycling.
  const frontierReachable = currentDescendCost(s, mods).lte(dpsMax(s, mods).mul(120));
  const pushingForFloor = s.shell.coresEarnedThisBreach.gte(500) && frontierReachable;
  // A WALL IS NOT A REASON TO COLLAPSE — IT IS A REASON TO KEEP THE MACHINES.
  //
  // (A.42 harness fix, the fourth time an unverified policy shaped a finding.)
  // The rule above asks only "is the payout worth the reset". It never asks
  // what the reset COSTS, and the Collapse takes the drill bay with it. That
  // was invisible while the bay unlocked at depth-record 55 — an idle player
  // had no machines to lose for eight hours, so the run collapsed cheaply and
  // often, which is correct. The moment the bay opened before the tier-II wall
  // (`--bay 40`), the same rule collapsed FORTY-NINE times at depth 39: each
  // cycle bought one drill, hit the wall at 44, took 2 cores, and wiped the
  // drill that was the only thing shortening the material gap. The arm could
  // never keep the bay it had just unlocked, so the fix under measurement
  // measured as a regression.
  //
  // What a player actually does, in two parts:
  //
  //  (a) A RUN ENDS WHEN IT STOPS MAKING GROUND, not when it first turns a
  //      profit. The bar alone fires at the FIRST profitable depth — 40, where
  //      `gain` reaches 2 — and the run then resets four steps short of its own
  //      wall at 44, forever. That is the second half of the same bug: with the
  //      bay open early the run has the income to reach 44 and never gets the
  //      chance, so whether a seed ever crosses comes down to whether the bar
  //      happens to rise before the loop locks. Two attractors, one coin flip:
  //      three seeds reached depth 130+ at four hours and three sat at 39 for
  //      twelve. So collapse only when the next step is blocked by a wall, by
  //      the floor, or by a price the run cannot pay in a few minutes.
  //
  //  (b) A WALL IS A REASON TO KEEP THE MACHINES. The Collapse takes the drill
  //      bay with it, and at a wall the run's whole job is material
  //      accumulation — you do not burn the machines doing it. With no drills
  //      the reset costs nothing and collapsing is right, which is the pre-A.42
  //      behaviour, preserved exactly.
  const walled = equippedTool(s).tier < requiredTier(s, s.depth + 1);
  const atFloor = s.depth >= currentShell(s).floorDepth;
  // THE HORIZON IS DERIVED, NOT PICKED. A run ends when the next step has
  // slowed to a crawl; "a crawl" is one minute of ceiling income. That number
  // is not taste: the cumulative descend cost is ~12× the final step (PILLARS,
  // the cost-curve note), so a run that pushes until a step costs T seconds
  // takes about 12T end to end. T = 60s puts the Collapse cadence at ~12
  // minutes, the top of the reset ladder's stated 4–12 min band. At the 300s
  // this first shipped with, runs ran an hour and a 4h sim collapsed TWICE
  // against a design of 30–60 per shell — the opposite failure to the rule it
  // replaced, and just as invisible without the cadence written down.
  //
  // A.44 A0: the horizon was measured against `dpsMax` — the FIELD ceiling —
  // while a deep run's actual purse is ~10x that (Guild, wells, warrens,
  // geodes, sales). So "the next step costs more than a minute of income"
  // fired while the run still had ten minutes of real income in hand, and the
  // collapse→re-tread→push-1-3-depths loop that reads as the deep-end crawl
  // was partly the harness declaring a stall that had not happened. The basis
  // is now MEASURED total income, with the field ceiling as the fallback until
  // the EMA has history (the first seconds of a run, and every reset).
  const RUN_END_HORIZON_SEC = 60;
  const horizonRate =
    horizonBasis === 'income' && measuredIncomeRate > 0
      ? D(measuredIncomeRate)
      : dpsMax(s, mods);
  const canPush = effectiveDescendCost(s, mods).lte(horizonRate.mul(RUN_END_HORIZON_SEC));
  const stalled = walled || atFloor || !canPush;
  const holdForWall = walled && s.drills.units.length > 0;
  if (!pushingForFloor && stalled && !holdForWall && gain >= Math.max(2, Math.min(12, earned * 0.25))) {
    const at = s.depth;
    const peak = Math.max(s.depth, s.shaft.reached);
    // The TERMINAL ceiling, read before the reset wipes the face upgrades that
    // made it. Reading it after is how the first cut of this instrument
    // reported I_final/I_mean = 0.01x: it was comparing the run to the ruins.
    const iFinal = dpsMax(s, mods).toNumber();
    // Read HOLD's floor while the levels it counts still exist — see the flag's
    // note. Zero unless `--hold-emulate`, so the default path is untouched.
    const holdBefore = holdEmulate ? holdFloor(s) : 0;
    if (engine.dispatch({ type: 'collapse' }).ok) {
      if (holdBefore > 0) resetCompaction(s, holdBefore);
      // THE FALL (§9.4): where the Collapse put the run down. 0 without drifts,
      // so the baseline arm reports nothing new.
      if (s.depth > 0) {
        recover.falls += 1;
        recover.driftMax = Math.max(recover.driftMax, s.depth);
        // TRAVEL REMOVED: the steps the fall did not have to take.
        recoverPost.removed += s.depth;
      }
      noteRtpCollapse(currentShell(s).id, peak, s.stats.playTimeSec);
      {
        const now = s.stats.playTimeSec;
        const len = now - cadence.runStartSec;
        const earned = (s.totals[chipCurrencyId(s)]?.toNumber() ?? 0) - cadence.earnedAtStart;
        if (len > 0 && earned > 0) {
          cadence.rows.push({
            len,
            earned,
            descent: cadence.spentOnDescent,
            iMean: earned / len,
            iFinal,
          });
        }
        cadence.runStartSec = now;
        cadence.earnedAtStart = s.totals[chipCurrencyId(s)]?.toNumber() ?? 0;
        cadence.spentOnDescent = 0;
      }
      // Name the decision, not just the event: depth, payout, and the bar it
      // cleared. A log line that cannot explain its own choice is how the last
      // three harness artifacts survived a phase each.
      log(
        `COLLAPSE #${s.collapse.count} at depth ${at} -> +${gain} cores ` +
          `(bar ${Math.max(2, Math.min(12, earned * 0.25)).toFixed(1)}, lifetime ${earned.toFixed(0)}, ` +
          `drills ${s.drills.units.length}, bank ${fmt(s.currencies['core']!)})`,
      );
    }
  }

  // Core tree: round-robin the priority list.
  for (const id of CORE_PRIORITY) {
    const node = CORE_NODES.find((n) => n.id === id)!;
    const level = coreNodeLevel(s, id);
    if (level >= node.maxLevel) continue;
    if (s.currencies['core']!.gte(coreNodeCost(level))) {
      if (engine.dispatch({ type: 'buyCoreNode', id }).ok) log(`core node ${id} -> ${level + 1}`);
      break;
    }
  }

  // Skill points.
  for (const id of SKILL_PRIORITY) {
    if (s.delver.skillPoints <= 0) break;
    engine.dispatch({ type: 'buySkillNode', id });
  }
}

// ---------------------------------------------------------------------------
// THE COMMONS LEDGER — who is actually eating the ladder's inputs
// ---------------------------------------------------------------------------

/** The four Loam commons the tier-II floor recipe and the early gear want. */
const COMMONS = ['marl', 'ochre', 'bonechalk', 'graveclay'] as const;

/** action type (or 'tick:<system>') -> material -> units consumed. */
const commonsLedger: Record<string, Record<string, number>> = {};

function noteCommons(label: string, before: number[], s: GameState): void {
  for (let i = 0; i < COMMONS.length; i++) {
    const spent = before[i]! - materialCount(s, COMMONS[i]!);
    if (spent <= 0) continue;
    (commonsLedger[label] ??= {})[COMMONS[i]!] =
      (commonsLedger[label]?.[COMMONS[i]!] ?? 0) + spent;
  }
}

/**
 * Wrap dispatch and tick so every unit of a common that LEAVES the Hold is
 * attributed to the action that took it. Dispatch names the action; the tick
 * bucket catches whatever the engine consumes on its own (auto-refine, the
 * Kiln's fuel, standing rules) — which is the half a call-site audit misses.
 */
function installCommonsLedger(engine: Engine): void {
  const rawDispatch = engine.dispatch.bind(engine);
  const rawTick = engine.tick.bind(engine);
  const snap = (): number[] => {
    const s = engine.getState() as GameState;
    return COMMONS.map((m) => materialCount(s, m));
  };
  (engine as { dispatch: Engine['dispatch'] }).dispatch = (action) => {
    const before = snap();
    const r = rawDispatch(action);
    noteCommons(action.type, before, engine.getState() as GameState);
    return r;
  };
  (engine as { tick: Engine['tick'] }).tick = (dt) => {
    const before = snap();
    rawTick(dt);
    noteCommons('tick (engine-side)', before, engine.getState() as GameState);
  };
}

/**
 * THE INCOME LEDGER (A.44 A0) — attribute every dust gained to the action that
 * paid it, so "non-field income" stops being a subtraction and becomes a list.
 * Same choke-point pattern as the commons ledger: one wrapper, no per-call-site
 * bookkeeping to drift. Off unless asked for.
 *
 * A Breach changes the chip currency, so a window that straddles one compares
 * two different purses — those samples are dropped rather than counted wrong.
 */
function installIncomeLedger(engine: Engine): void {
  const rawDispatch = engine.dispatch.bind(engine);
  const rawTick = engine.tick.bind(engine);
  const purse = (): { id: string; total: number } => {
    const s = engine.getState() as GameState;
    const id = chipCurrencyId(s);
    return { id, total: s.totals[id]?.toNumber() ?? 0 };
  };
  const note = (label: string, before: { id: string; total: number }): void => {
    const after = purse();
    if (after.id !== before.id) return; // straddled a Breach — unreadable
    const d = after.total - before.total;
    if (d > 0) incomeLedger[label] = (incomeLedger[label] ?? 0) + d;
  };
  (engine as { dispatch: Engine['dispatch'] }).dispatch = (action) => {
    const before = purse();
    const r = rawDispatch(action);
    note(action.type, before);
    return r;
  };
  (engine as { tick: Engine['tick'] }).tick = (dt) => {
    const before = purse();
    rawTick(dt);
    note('tick (seepage + drills + converters)', before);
  };
}

function main(): void {
  const args = parseArgs();
  const engine = createEngine({ nowMs: 0 });
  // THE COMMONS LEDGER (A.41 ledger row → A.42). A controlled probe said 160
  // drops yield 26–37 of each common against a need of 7, while live idle sat
  // "Short of Graveclay" for an hour. Something eats them. Rather than guess at
  // candidates, attribute every consumption to the ACTION that caused it: one
  // choke point, no per-call-site bookkeeping to drift. Off unless asked for —
  // it is four counter reads per dispatch and per tick.
  if (args.commons) installCommonsLedger(engine);
  if (args.income) installIncomeLedger(engine);
  horizonBasis = args.horizon;
  if (args.seed !== null) Math.random = mulberry32(args.seed);
  HOLD_TUNING.cap = args.holdCap;
  REMAINS_TUNING.share = args.remainsShare;
  holdEmulate = args.holdEmulate;
  shorePolicy = args.shore;
  if (args.drillBehaviour !== 'fullest' || args.drillBar > 0) {
    drillAxes = { behaviour: args.drillBehaviour, bar: args.drillBar };
  }
  if (args.fork !== 'income') {
    const rows: readonly string[] = args.forkRow === 'all'
      ? ['blade', 'soil', 'roots'] : [args.forkRow];
    forkPolicy = (s, id) => {
      if (!rows.includes(id)) return 'income';
      if (args.fork === 'packed') return 'packed';
      /**
       * THE STATE §40.2 NAMES, not a depth proxy. "Early in a run you cannot
       * afford the stair, so INCOME compounds; late in a run the stair has
       * outrun you and the face is worked, so PACKED harvests it before the
       * fall takes it back." So the switch fires when the next step costs more
       * than `--fork-switch-sec` of ceiling income — which is run-relative by
       * construction and resets with every Collapse.
       */
      mods.invalidate();
      return currentDescendCost(s, mods).gt(dpsMax(s, mods).mul(args.forkSwitchSec))
        ? 'packed' : 'income';
    };
  }
  const totalSec = Math.round(args.hours * 3600);
  const logEverySec = Math.max(1, Math.round(args.logMin * 60));

  const events: string[] = [];
  const log = (msg: string) => {
    const s = engine.getState();
    const t = Math.round(s.stats.playTimeSec);
    events.push(`[${String(Math.floor(t / 60)).padStart(4)}m${String(t % 60).padStart(2, '0')}s] ${msg}`);
  };

  const rows: string[] = [
    'min,dust,total_dust,brick,cores,depth,max_depth,collapses,level,skill_pts,drills,kiln_heat,drops,geodes_cracked,tools,tool_tier',
  ];
  const snapshot = () => {
    const s = engine.getState();
    rows.push(
      [
        (s.stats.playTimeSec / 60).toFixed(1),
        s.currencies['dust']!.toString(),
        s.totals['dust']?.toString() ?? '0',
        s.currencies['brick']!.toString(),
        s.currencies['core']!.toString(),
        s.depth,
        s.maxDepthRecord,
        s.collapse.count,
        s.delver.level,
        s.delver.skillPoints,
        s.drills.units.length,
        s.kiln.heat.toFixed(2),
        s.materials.totalDrops,
        s.materials.geodesCracked,
        s.stats.toolsForged,
        equippedTool(s).tier,
      ].join(','),
    );
  };

  // --scenario wardens: begin AT the Loam floor with the kit an idle player
  // accumulates on the way — verifies the pillar-1 claim that the wardens
  // (the one mandatory fight) never block an auto-only player.
  if (process.argv.includes('--scenario') && process.argv[process.argv.indexOf('--scenario') + 1] === 'wardens') {
    const s = engine.getState() as GameState;
    s.depth = 150;
    s.depthRecords['loam'] = 150;
    s.maxDepthRecord = 150;
    s.shell.coresEarnedThisBreach = s.currencies['dust']!.add(800).sub(s.currencies['dust']!); // D(800)
    s.forge.built = true;
    s.kiln.built = true;
    s.forge.tools.push({
      id: 99, recipeId: 'deepcutter', name: 'Deepcutter', tier: 3, purity: 65,
      chipPower: 2.1, strikePower: 7.8, sockets: [null, null], alloys: [],
    });
    s.forge.equipped = s.forge.tools.length - 1;
    s.delver.skills['twoHandedSwing'] = 2;
    s.delver.skills['deepGrip'] = 1;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 50000 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'brick', amount: 300 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'core', amount: 200 });
    // The material bank a full Loam arc accumulates (cf. the fresh idle run:
    // ~2.5K drops incl. geode-boosted flawless).
    const bank: Array<[string, number, number]> = [
      ['marl', 55, 60], ['ochre', 52, 30], ['bonechalk', 50, 30], ['graveclay', 48, 20],
      ['loamiron', 55, 30], ['rootglass', 55, 15], ['duskflint', 55, 20],
      ['umberjade', 60, 12], ['wormsteel', 60, 12], ['hollowamber', 62, 10],
      ['chthonite', 58, 6], ['palegold', 55, 4], ['starmarl', 62, 3], ['sablequartz', 60, 2],
      ['chitinshard', 55, 12], ['wormsilk', 55, 8], ['gravemote', 52, 8], ['burrowertooth', 55, 6],
    ];
    for (const [id, purity, count] of bank) addMaterial(s, id, purity, count);
  }

  // --scenario verdance: begin in the green shell with a period kit — the
  // stage for the clear-vs-cultivate convergence measurement (--growth).
  if (process.argv.includes('--scenario') && process.argv[process.argv.indexOf('--scenario') + 1] === 'verdance') {
    const s = engine.getState() as GameState;
    s.shell.current = 'verdance';
    s.shell.breachCount = 2;
    s.shell.signatures = ['seepage', 'polarity'];
    s.depthRecords['loam'] = 150;
    s.depthRecords['ferrite'] = 250;
    s.depthRecords['verdance'] = 60;
    s.depth = 60;
    s.maxDepthRecord = 60;
    s.collapse.count = 30;
    s.forge.built = true;
    s.kiln.built = true;
    s.forge.tools.push({
      id: 98, recipeId: 'verdantScythe', name: 'Verdant Scythe', tier: 7, purity: 65,
      chipPower: 5.5, strikePower: 45, sockets: ['bloodgarnet', null, null], alloys: [null, null],
    });
    s.forge.equipped = s.forge.tools.length - 1;
    s.delver.skills['twoHandedSwing'] = 5;
    s.delver.skills['deepGrip'] = 3;
    for (const id of ['firstKill', 'wardenLoam', 'kills25']) s.achievements.unlocked[id] = true;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'spore', amount: 30000 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'sap', amount: 400 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'core', amount: 300 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'humus', amount: 200 });
    const bank3: Array<[string, number, number]> = [
      ['sporewood', 55, 40], ['mosscoal', 52, 30], ['sapstone', 55, 30], ['barkiron', 50, 25],
      ['chlorite', 58, 15], ['resinpearl', 55, 12], ['humusgold', 55, 10],
      ['verdantine', 60, 12], ['bloomsteel', 60, 14], ['feralglass', 60, 10],
      ['heartwood', 62, 10], ['springvein', 62, 8], ['wildstar', 62, 3],
      ['throatroot', 55, 10], ['mothspool', 55, 10], ['wireweed', 55, 8], ['palefiber', 55, 6],
    ];
    for (const [id, purity, count] of bank3) addMaterial(s, id, purity, count);
  }

  // --scenario cinder: begin in the burnt shell with a period kit — the stage
  // for the three heat stances (--heat safe|balanced|greedy) and the 16h
  // idle-never-floods proof (--policy idle --heat safe).
  if (process.argv.includes('--scenario') && process.argv[process.argv.indexOf('--scenario') + 1] === 'cinder') {
    const s = engine.getState() as GameState;
    s.shell.current = 'cinder';
    s.shell.breachCount = 4;
    s.shell.signatures = ['seepage', 'polarity', 'growth', 'refraction'];
    s.depthRecords['loam'] = 150;
    s.depthRecords['ferrite'] = 250;
    s.depthRecords['verdance'] = 290;
    s.depthRecords['glassmere'] = 380;
    // `--cinder-depth` (A.104). 70 is the shipped stage; 40 stands the player
    // between the Boiler and THE CLINKER, which is the stretch §6 claims is
    // impassable without a machine that sits on the far side of it.
    const cd = args.cinderDepth;
    s.depthRecords['cinder'] = cd;
    s.depth = cd;
    s.maxDepthRecord = cd;
    s.collapse.count = 60;
    s.forge.built = true;
    s.kiln.built = true;
    s.drills.bayBuilt = true;
    for (let i = 0; i < 8; i++) s.drills.units.push({ level: 8, timer: 0, lastCell: 0 });
    s.forge.tools.push({
      id: 97, recipeId: 'slagbreaker', name: 'Slagbreaker', tier: 13, purity: 65,
      chipPower: 34, strikePower: 420, sockets: ['cinderquartz', null, null], alloys: [null, null],
    });
    s.forge.equipped = s.forge.tools.length - 1;
    s.delver.skills['twoHandedSwing'] = 5;
    s.delver.skills['deepGrip'] = 3;
    for (const id of ['firstKill', 'wardenLoam', 'kills25']) s.achievements.unlocked[id] = true;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'slag', amount: 80000 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'ember', amount: 1200 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'obsidian', amount: 600 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'core', amount: 400 });
    const bank5: Array<[string, number, number]> = [
      ['slagrock', 55, 40], ['ashgrit', 52, 30], ['charstone', 52, 25], ['emberflake', 55, 25],
      ['pyroclast', 58, 16], ['obsidianheart', 58, 12], ['brimshard', 55, 12],
      ['magmajade', 60, 10], ['cindersteel', 60, 12], ['pyrite', 60, 10],
      ['heartflame', 62, 8], ['ventglass', 62, 6], ['coronaite', 62, 2],
      ['emberplate', 55, 10], ['charsinew', 55, 10], ['magmaduct', 55, 8], ['pyregland', 58, 6],
    ];
    for (const [id, purity, count] of bank5) addMaterial(s, id, purity, count);
  }

  // --scenario hollow: begin in the void. --carry minimal strips investment
  // to the floor (zero Echoes, low masteries) — the softlock check.
  if (process.argv.includes('--scenario') && process.argv[process.argv.indexOf('--scenario') + 1] === 'hollow') {
    const s = engine.getState() as GameState;
    const minimal = process.argv.includes('--carry') && process.argv[process.argv.indexOf('--carry') + 1] === 'minimal';
    s.shell.current = 'hollow';
    s.shell.breachCount = 5;
    s.shell.signatures = ['seepage', 'polarity', 'growth', 'refraction', 'pressure'];
    s.shell.resonantMemory = minimal ? 0 : 8;
    s.depthRecords['loam'] = 150;
    s.depthRecords['ferrite'] = 250;
    s.depthRecords['verdance'] = 290;
    s.depthRecords['glassmere'] = minimal ? 60 : 380;
    s.depthRecords['cinder'] = minimal ? 60 : 470;
    s.depthRecords['hollow'] = 30;
    s.depth = 5;
    s.maxDepthRecord = minimal ? 150 : 470;
    s.collapse.count = minimal ? 20 : 120;
    s.forge.built = true;
    s.kiln.built = true;
    s.polarity.bestChain = minimal ? 4 : 12;
    s.refraction.mirrorStock = minimal ? 2 : 6;
    // The T15 pick that got you through Cinder — you breach into Hollow with
    // it (recursion, and heirlooms, come LATER, at the Core). Minimal carry
    // is low INVESTMENT (zero Resonant Memory, low masteries), not no tool.
    s.forge.tools.push({
      id: 90, recipeId: 'cinderMaul', name: 'Cinder Maul', tier: 15,
      purity: minimal ? 60 : 85, chipPower: minimal ? 40 : 66, strikePower: minimal ? 600 : 1400,
      sockets: ['cinderquartz', null], alloys: [null, null],
    });
    s.forge.equipped = s.forge.tools.length - 1;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'core', amount: minimal ? 40 : 400 });
  }

  // --scenario recursion: at the Core, primed to reach and fall through it,
  // then run a second descent (the cadence + second-descent-differs check).
  if (process.argv.includes('--scenario') && process.argv[process.argv.indexOf('--scenario') + 1] === 'recursion') {
    const s = engine.getState() as GameState;
    s.shell.current = 'aleph';
    s.shell.breachCount = 6;
    s.shell.signatures = ['seepage', 'polarity', 'growth', 'refraction', 'pressure', 'absence'];
    for (const [sh, d] of [['loam', 150], ['ferrite', 250], ['verdance', 290], ['glassmere', 380], ['cinder', 470], ['hollow', 560]] as const) {
      s.depthRecords[sh] = d;
    }
    s.depth = 38;
    s.maxDepthRecord = 560;
    s.collapse.count = 150;
    s.forge.built = true;
    s.kiln.built = true;
    // WHAT A FIRST RECURSION ACTUALLY PAYS, NOT WHAT IT NEEDED (A.44).
    // This read `D(120)` with the note "= 3 Axioms this recursion" — but six
    // breaches pay 6 x echoesForCores(cores at breach), which at the measured
    // haul is nowhere near 120. The only harness that exercises a Recursion
    // was HANDED the echoes the layer was supposed to earn, so the starvation
    // (a complete first Recursion paying zero Axioms) could not be seen from
    // here. Same family as the six precedents: the instrument asserted the
    // conclusion it existed to test.
    s.totals['echo'] = echoesForCores(D(508)).mul(s.shell.breachCount);
    s.forge.tools.push({
      id: 91, recipeId: 'cinderMaul', name: 'Cinder Maul', tier: 15,
      purity: 88, chipPower: 66, strikePower: 1500, sockets: ['bloodgarnet', 'cinderquartz'], alloys: ['greysteel'],
    });
    s.forge.equipped = s.forge.tools.length - 1;
    // The endgame kit a Core-reaching player has assembled: best tool, maxed
    // skills, warren uniques unlocked, a lived-in achievement grid.
    s.delver.skills['twoHandedSwing'] = 5;
    s.delver.skills['deepGrip'] = 5;
    s.delver.skills['heavyHands'] = 3;
    s.delver.level = 200;
    // THE BIOGRAPHY OF SOMEONE WHO REACHED THE CORE (A.44).
    //
    // This line used to hand-unlock FIVE achievements by id. That is a fifth of
    // one percent of a 190-cell grid, handed to a player who has crossed six
    // shells — and `strikePower` is a MODIFIER BUCKET that ~18 achievements
    // feed. Measured: the old scenario carried strikePower x1.95 where a full
    // grid gives x4.42, a 2.26x shortfall in the exact stat the final fight is
    // decided by. The Author (tier 18, 88k hp) then won 200 out of 200, the
    // sim could never touch the Core, and Breach/Recursion/Spiral RTP had no
    // path at all. With the grid filled the same kit wins 43% of the time.
    //
    // So prime the CAUSES and let `checkAchievements` (which the engine already
    // runs ~1/sec) do the unlocking for real reasons. A stipulated biography is
    // honest; stipulating the REWARD while the game's own evaluator disagrees
    // is how the echo=120 injection hid the ladder starvation.
    s.materials.geodesCracked = 400;
    s.materials.totalDrops = 20000;
    s.stats.toolsForged = 30;
    s.runes.pairsSeen = ['kel|thur', 'mol|kel', 'thur|mol', 'kel|sev', 'sev|mol',
      'thur|sev', 'mol|ath', 'ath|kel', 'sev|ath', 'ath|thur',
      'kel|ven', 'ven|mol', 'thur|ven', 'ven|sev', 'ath|ven',
      'kel|orn', 'orn|mol', 'orn|thur', 'sev|orn', 'ven|orn'];
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'fragment', amount: 5000 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'core', amount: 400 });
    // A LAW IS WRITTEN IN RESONANCE (`buyAxiom`, AXIOM_RESONANCE). The scenario
    // banked none, so every `buyAxiom` in the aleph policy failed silently and
    // no run has EVER written an Axiom — the fold-down laws (firstWord,
    // gentleFall, insomniac) that the whole prestige layer exists to deliver
    // have never been exercised by the harness. Resonance survives a Recursion
    // by design, so a Core-reaching player has banked plenty.
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'resonance', amount: 500 });
    const bank7: Array<[string, number, number]> = [
      ['firstiron', 60, 30], ['protolith', 58, 20], ['axiomite2', 60, 12], ['alephite', 62, 6],
      ['authorsInk', 62, 6], ['quietsinew', 55, 10], ['hollowplate', 55, 8], ['unheart', 60, 4],
      ['pyregland', 60, 10], ['emberplate', 55, 12], ['magmaduct', 55, 8],
    ];
    for (const [id, purity, count] of bank7) addMaterial(s, id, purity, count);
  }

  // THE SETTLING knobs. `off` reproduces the pre-A.42 descend curve exactly
  // (relief clamps to 1 at soften 1.0), which is how the baseline arm of every
  // A.42 measurement is produced — same binary, same policy, one flag apart.
  if (args.settle === 'off') {
    SETTLE_TUNING.soften = 1;
    SETTLE_TUNING.floor = 1;
  } else if (args.settle) {
    const [soften, cap, quiet, floor] = args.settle.split(':').map(Number);
    if (soften) SETTLE_TUNING.soften = soften;
    if (cap) SETTLE_TUNING.capSec = cap;
    if (quiet !== undefined && Number.isFinite(quiet)) SETTLE_TUNING.quietSec = quiet;
    if (floor) SETTLE_TUNING.floor = floor;
  }

  if (args.bay !== null && Number.isFinite(args.bay)) BAY_DEPTH_UNLOCK.depth = args.bay;

  /**
   * A.92 — THE GOVERNOR, HELD ON (`--overclock N`).
   *
   * Its wreck is at Ferrite 175 and a Loam arc never gets there, so the only
   * way to measure it one flag apart from a real run is to stand the machine up
   * and hold every built machine N steps past its rating for the whole arc.
   * `overclockTick` re-applies it each second because machines are BUILT during
   * a run — a setting written once at t=0 would only ever govern the Kiln.
   *
   * At N=0 nothing is written at all, so the zero arm is bit-for-bit the run
   * that existed before this flag.
   */
  if (args.overclock > 0) {
    const s0 = engine.getState() as GameState;
    ensurePlant(s0).tiers['governor'] = 3;
    s0.plant!.builtOf = s0.plant!.builtOf ?? {};
    s0.plant!.builtOf['governor'] = ['marl', 'marl'];
  }

  const started = Date.now();
  growthPolicy = args.growth;
  heatStance = args.heat;
  plumbs = args.pipes;
  snapshot();
  const beats = { tLoamFloor: 0, tBreach: 0, tFerrite150: 0, tBreach2: 0, tVerd150: 0, tBreach3: 0, tGlass150: 0, tBreach4: 0, tCinder150: 0, tBreach5: 0, tBreach6: 0, tRecursion1: 0, tFaceWhole: 0 };
  // Pillar-2 audit: sampled chip income vs the W·H·regen·Y ceiling over
  // windows with NO manual chips — stored-charge harvesting rides above by
  // design; sustained idle production must not.
  let p2PrevTotal = 0;
  let p2PrevChip = '';
  let snapDueSec = 0; // 0 = not armed, >0 = due at that sec, -1 = written
  let p2PrevManual = 0;
  let p2PrevCollapses = 0;
  let p2PrevStored = 0;
  let p2CeilingIntegral = 0;
  let p2PrevCeiling = 0;
  // Hourly-diag deltas (realized income + the green ledger).
  let diagPrevTotal = 0;
  let diagPrevCeiling = 0;
  let diagPrevFieldCharge = 0;
  // The measured-income EMA that the run-end horizon now reads (A.44 A0).
  let incPrevTotal = 0;
  let incPrevChip = '';
  let diagPrevHarvest = 0;
  let diagPrevDrip = 0;
  // THE OPENING ARC INSTRUMENT (A.43 A1). One row a minute: what the field
  // produced, which path harvested it, what the purse spent it on, and what
  // the ceiling was while that happened. The opening is the one stretch where
  // an idle player has no machines, so every number here is the floor doing
  // the work or failing to.
  const openingRows: string[] = [
    'min,depth,ceiling,realized,seep_charge,chip_charge,earned,spent_descent,spent_other,bank,cells_at_cap,kiln,bay,blade,soil',
  ];
  let opPrevEarned = 0;
  let opPrevSeep = 0;
  let opPrevChip = 0;
  let opPrevDescent = 0;
  let opCeilInt = 0;
  // THE DESCENT INSTRUMENT: first-arrival time per depth record, per shell.
  const depthRows: string[] = ['shell,depth,sec'];
  const seenRecord: Record<string, number> = {};
  // BEATS READ THE DEPTH RECORD, NOT THE LIVE DEPTH (A.42). They sampled
  //  once a second; the corrected collapse policy resets ON ARRIVAL at
  // the floor, so the sample almost never caught it and 'loam floor' reported
  // hundreds of minutes late or never while the depth log showed the arrival.
  // THE HEARTBEAT (A.44). Every line this harness produces is buffered to exit,
  // so a long run is completely unobservable while it runs — and that has now
  // cost two write-and-exit runs that were killed without ever answering their
  // question, because "is it nearly done or is it stuck?" had no answer. It
  // also hid the reason: wall time is SUPERLINEAR in sim hours (measured 1h 9s,
  // 2h 25s, 4h 80s — collections the tick iterates keep growing), so every
  // linear estimate of a long run was wrong in the same direction.
  //
  // Unbuffered, on its own stream, one line per sim-hour: enough to see
  // progress and rate, cheap enough to leave on always.
  const heartbeatPath = args.out ? `${args.out}.progress` : null;
  const startedAtMs = Date.now();
  let lastBeatMs = startedAtMs;
  for (let sec = 1; sec <= totalSec; sec++) {
    // ON A WALL CLOCK TOO, NOT ONLY ON SIM-HOUR BOUNDARIES.
    //
    // The first cut of this beat fired only every 3600 sim-seconds — and the
    // very first long run it was built for went SILENT for four minutes at the
    // Breach, because crossing into the next shell makes a sim-hour several
    // times more expensive and no boundary was reached. An instrument that
    // stops reporting exactly when the run gets interesting cannot answer the
    // question it was built for ("slow, or stuck?"), which is the question that
    // had already cost two killed runs. Beat on whichever comes first.
    const dueByWall = heartbeatPath !== null && Date.now() - lastBeatMs >= 30_000;
    if (heartbeatPath && (sec % 3600 === 0 || dueByWall)) {
      lastBeatMs = Date.now();
      const st = engine.getState();
      const wall = (Date.now() - startedAtMs) / 1000;
      const simH = sec / 3600;
      writeFileSync(
        heartbeatPath,
        `sim ${simH.toFixed(2)}h / ${(totalSec / 3600).toFixed(0)}h | wall ${wall.toFixed(0)}s | ` +
          `${(wall / simH).toFixed(1)}s per sim-hour | ${st.shell.current} d${st.depth} ` +
          `(rec ${st.maxDepthRecord}) | breaches ${st.shell.breachCount} | ` +
          `collapses ${st.collapse.count} | recursions ${st.recursion.count}\n`,
      );
    }
    const s = engine.getState();
    /**
     * A.92 — RE-APPLY THE OVERCLOCK. Machines are BUILT during a run, so a
     * setting written once at t=0 would only ever have governed the Kiln, and
     * the arm would have measured almost nothing. Costs one pass over the plant
     * per second and is skipped entirely at N=0.
     */
    if (args.overclock > 0) {
      const g = ensureGovernor(s as GameState);
      for (const id of Object.keys(ensurePlant(s as GameState).tiers)) {
        if (id !== 'governor') g.steps[id] = Math.min(MAX_OVERCLOCK, args.overclock);
      }
      if ((s as GameState).kiln.built) {
        g.steps['kiln'] = Math.min(MAX_OVERCLOCK, args.overclock);
      }
    }
    // balanced: fully active for the first hour AND for 45 min after a
    // Breach (the biggest beat — nobody idles through it), else 5-min
    // check-in bursts.
    const active =
      args.policy === 'active' ||
      (args.policy === 'balanced' &&
        (sec <= 60 * 60 || (beats.tBreach > 0 && sec - beats.tBreach <= 45 * 60))) ||
      (args.policy === 'idle' && sec <= 120); // idle still has to bootstrap
    if (active) chipHand(engine, 2, args.hand);
    else if (args.policy === 'balanced' && sec % 300 === 0) chipHand(engine, 40, args.hand);
    // A.75: set the axes on every machine, including ones bought mid-run. Cheap
    // — it writes only when a drill does not already carry the setting.
    if (drillAxes && sec % 30 === 0) {
      for (const u of s.drills.units) {
        if (drillAxes.behaviour !== 'fullest') u.behavior = drillAxes.behaviour;
        if (drillAxes.bar > 0) u.minCharge = drillAxes.bar;
      }
    }
    for (const id of ['umberjade', 'graveclaydeep', 'deepgrave']) {
      if (deepFirst[id] === 0 && materialCount(s, id) > 0) deepFirst[id] = sec;
    }
    if (forkTrack.t45 === 0 && s.maxDepthRecord >= 45) forkTrack.t45 = sec;
    if (forkTrack.t110 === 0 && s.maxDepthRecord >= 110) forkTrack.t110 = sec;
    if (forkTrack.t150 === 0 && s.maxDepthRecord >= 150) forkTrack.t150 = sec;
    forkTrack.packedPeak = Math.max(
      forkTrack.packedPeak,
      packedLevels(s, 'blade') + packedLevels(s, 'soil') + packedLevels(s, 'roots'),
    );
    engine.tick(1);
    noteRtpTick(s.shell.current, s.depthRecords[s.shell.current] ?? 0, s.depth, sec);
    if (args.opening) {
      opCeilInt += dpsMax(s, mods).toNumber();
      if (sec % 60 === 0) {
        const earned = s.totals[chipCurrencyId(s)]?.toNumber() ?? 0;
        const chipCharge = s.stats.totalChargeChipped.toNumber();
        const fieldCharge = s.stats.fieldChargeHarvested.toNumber();
        const seepCharge = fieldCharge - chipCharge;
        const cap = cellCap(s, mods);
        const atCap = s.face.cells.filter((c: number) => c >= cap - 1e-9).length / s.face.cells.length;
        const dEarned = earned - opPrevEarned;
        const dDescent = cadence.spentOnDescent - opPrevDescent;
        openingRows.push([
          sec / 60,
          s.depth,
          (opCeilInt / 60).toFixed(4),
          opCeilInt > 0 ? (dEarned / opCeilInt).toFixed(3) : "",
          (seepCharge - opPrevSeep).toFixed(2),
          (chipCharge - opPrevChip).toFixed(2),
          dEarned.toFixed(2),
          dDescent.toFixed(2),
          (dEarned - dDescent).toFixed(2),
          (s.currencies[chipCurrencyId(s)]?.toNumber() ?? 0).toFixed(2),
          atCap.toFixed(2),
          s.kiln.built ? 1 : 0,
          s.drills.bayBuilt ? 1 : 0,
          upgradeLevel(s, "blade"),
          upgradeLevel(s, "soil"),
        ].join(","));
        opPrevEarned = earned;
        opPrevSeep = seepCharge;
        opPrevChip = chipCharge;
        opPrevDescent = cadence.spentOnDescent;
        opCeilInt = 0;
      }
    }
    if (args.depthLog) {
      const sid = s.shell.current;
      const rec = s.depthRecords[sid] ?? 0;
      for (let d = (seenRecord[sid] ?? 0) + 1; d <= rec; d++) depthRows.push(`${sid},${d},${sec}`);
      if (rec > (seenRecord[sid] ?? 0)) seenRecord[sid] = rec;
    }
    if (sec % 2 === 0) shop(engine, args.quiet ? () => {} : log);
    if (sec % logEverySec === 0) snapshot();
    if (!beats.tLoamFloor && (s.depthRecords['loam'] ?? 0) >= 150) beats.tLoamFloor = sec;
    if (!beats.tBreach && s.shell.breachCount > 0) beats.tBreach = sec;
    if (!beats.tFerrite150 && (s.depthRecords['ferrite'] ?? 0) >= 150) beats.tFerrite150 = sec;
    // Hourly diagnosis: where does the time go? Income vs the descend curve,
    // and whether the Collapse ladder (core tree) has saturated.
    if (sec % 3600 === 0 && !args.quiet) {
      mods.invalidate();
      const income = dpsMax(s, mods).toNumber();
      const nextCost = currentDescendCost(s, mods).toNumber();
      const nodes = Object.entries(s.collapse.nodes);
      const maxed = nodes.filter(([id, lv]) => {
        const def = CORE_NODES.find((n) => n.id === id);
        return def && lv >= def.maxLevel;
      }).length;
      const bladeLv = s.upgrades['blade'] ?? 0;
      // THREE READINGS, NOT ONE BROKEN ONE (A.44 A0). The old `realized%`
      // divided DUST by CHARGE — see the instrument note at the top of this
      // file. Split into the pillar-2 measure (charge÷charge, field-only), the
      // total purse rate (what actually buys the stair), and the field's share
      // of it. Plus the green ledger while in Verdance.
      const chipNow = s.totals[chipCurrencyId(s)]?.toNumber() ?? 0;
      const hourEarned = p2PrevChip === chipCurrencyId(s) ? chipNow - diagPrevTotal : NaN;
      const hourChargeCeiling = p2CeilingIntegral - diagPrevCeiling;
      const hourFieldCharge = s.stats.fieldChargeHarvested.toNumber() - diagPrevFieldCharge;
      const fieldPct = hourChargeCeiling > 0 ? hourFieldCharge / hourChargeCeiling : NaN;
      const incomePerSec = Number.isFinite(hourEarned) ? hourEarned / 3600 : NaN;
      // NO ESTIMATED FIELD SHARE HERE. The first cut of this line multiplied
      // `chipYield × fieldCharge` to guess what the field's charge was worth
      // and read 86–198% — because seepage, drills and takeCharge each carry
      // multipliers that expression does not, so the "estimator" was a fourth
      // unit slip in a note about unit slips. The exact split is `--income`,
      // which attributes every dust to the action that paid it.
      let green = '';
      if (s.shell.current === 'verdance' || s.shell.signatures.includes('growth')) {
        const vined = s.growth.stage.filter((x: number) => x > 0).length;
        const feral = s.growth.stage.filter((x: number) => x >= 4).length;
        green =
          ` | vined ${vined}/${s.growth.stage.length} (feral ${feral})` +
          ` | fruit harvested Δ${fmt(s.growth.fruitHarvested - diagPrevHarvest)}` +
          ` dripped Δ${fmt(s.growth.autoDropped - diagPrevDrip)}`;
      }
      diagPrevTotal = chipNow;
      diagPrevCeiling = p2CeilingIntegral;
      diagPrevFieldCharge = s.stats.fieldChargeHarvested.toNumber();
      diagPrevHarvest = s.growth.fruitHarvested;
      diagPrevDrip = s.growth.autoDropped;
      const pct = (x: number): string => (Number.isFinite(x) ? `${(x * 100).toFixed(0)}%` : '—');
      log(
        `diag h${sec / 3600}: ${s.shell.current} d${s.depth} (rec ${s.maxDepthRecord}) | ` +
          `ceiling ${income.toExponential(1)}/s | field ${pct(fieldPct)} of regen | ` +
          `income ${incomePerSec.toExponential(1)}/s | ` +
          `next descend ${nextCost.toExponential(1)} ` +
          `(${(nextCost / Math.max(income, 1e-9)).toFixed(0)}s at ceiling, ` +
          `${(nextCost / Math.max(incomePerSec, 1e-9)).toFixed(0)}s at income) | ` +
          `core nodes maxed ${maxed}/${CORE_NODES.length} | blade L${bladeLv} | ` +
          `cores banked ${fmt(s.currencies['core'] ?? 0)}${green}`,
      );
    }
    // The echo-share snapshot: ~30 sim-minutes of settle after the asked-for
    // Breach, so the policy has spent its Echoes and rebuilt some face.
    if (args.snapBreach !== null && args.snapOut && snapDueSec === 0 && s.shell.breachCount >= args.snapBreach) {
      snapDueSec = sec + 30 * 60;
    }
    if (snapDueSec > 0 && sec >= snapDueSec && args.snapOut) {
      mkdirSync(dirname(args.snapOut), { recursive: true });
      writeFileSync(args.snapOut, serialize(s, sec * 1000));
      log(`snapshot (breach ${s.shell.breachCount}, ${(sec / 60).toFixed(0)}m) -> ${args.snapOut}`);
      snapDueSec = -1;
    }
    if (!beats.tBreach2 && s.shell.breachCount >= 2) beats.tBreach2 = sec;
    if (!beats.tVerd150 && (s.depthRecords['verdance'] ?? 0) >= 150) beats.tVerd150 = sec;
    if (!beats.tBreach3 && s.shell.breachCount >= 3) beats.tBreach3 = sec;
    if (!beats.tGlass150 && (s.depthRecords['glassmere'] ?? 0) >= 150) beats.tGlass150 = sec;
    if (!beats.tBreach4 && s.shell.breachCount >= 4) beats.tBreach4 = sec;
    if (!beats.tCinder150 && (s.depthRecords['cinder'] ?? 0) >= 150) beats.tCinder150 = sec;
    if (!beats.tBreach5 && s.shell.breachCount >= 5) beats.tBreach5 = sec;
    if (!beats.tBreach6 && s.shell.breachCount >= 6) beats.tBreach6 = sec;
    if (!beats.tFaceWhole && s.shell.current === 'hollow' && s.hollow.rebuilt.length >= s.face.cells.length) beats.tFaceWhole = sec;
    if (!beats.tRecursion1 && s.recursion.count >= 1) beats.tRecursion1 = sec;
    // Pillar-2: integrate the ceiling every second (depth and buckets move —
    // collapses inside a window must not fake a violation), then compare
    // earned vs ∫ceiling over untouched 10-min windows.
    // The pillar-2 denominator is the CHARGE the field can produce this second
    // (cells x regen) — the ceiling as pillar 2 states it. It used to be dpsMax,
    // which folds in every yield multiplier, so a crit or a Blade level moved
    // both sides of the comparison and the ratio measured noise.
    p2CeilingIntegral += s.face.cells.length * cellRegen(s, mods);
    // MEASURED INCOME, once a sim-second, EMA over ~2 minutes (A.44 A0). This
    // is what the run-end horizon sizes pushing power against now. A Breach
    // swaps the purse, so the sample is dropped and the EMA restarts rather
    // than reading a currency change as income.
    {
      const chipId = chipCurrencyId(s);
      const total = s.totals[chipId]?.toNumber() ?? 0;
      if (incPrevChip === chipId) {
        const gained = Math.max(0, total - incPrevTotal);
        const alpha = 1 / 120;
        measuredIncomeRate = measuredIncomeRate === 0 ? gained : measuredIncomeRate * (1 - alpha) + gained * alpha;
      } else {
        measuredIncomeRate = 0;
      }
      incPrevTotal = total;
      incPrevChip = chipId;
    }
    if (sec % 600 === 0) {
      const chipId = chipCurrencyId(s);
      // THE NUMERATOR IS FIELD INCOME, NOT ALL INCOME (A.42).
      // This read `totals[chipId]` — every coin the Guild paid counted as the
      // field over-producing, so a 12h idle run showed windows above 100% with
      // nothing wrong and the pillar's gate could not fail honestly. Contracts,
      // caravan trades, expedition hauls and wells are other purses; pillar 2
      // is a claim about the FIELD bounding FIELD income.
      const total = s.stats.fieldChargeHarvested.toNumber();
      const untouched = s.stats.manualChips === p2PrevManual;
      const ceilingWindow = p2CeilingIntegral - p2PrevCeiling;
      // A WINDOW THAT STRADDLES A COLLAPSE CANNOT BE READ (A.42).
      // Integrating the ceiling per second was supposed to handle a collapse
      // inside a window; it does not. A Collapse drops depth to 0, so the
      // ceiling collapses with it — while the charge banked during the deep
      // part of the window is still being harvested and paid. Earned/∫ceiling
      // then reads above 1.0 with nothing wrong. That artifact was harmless
      // while nothing moved the collapse cadence; A.42's settling and bay-gate
      // work both do, so the straddle started firing (1/213 at 102%) and the
      // gate could no longer fail honestly. Skipped, and COUNTED — a dropped
      // sample that nobody reports is how a green number stops meaning
      // anything.
      // STORED CHARGE IS PART OF THE SUPPLY, SO IT IS PART OF THE DENOMINATOR.
      // The face holds cells x cap in storage. A window that starts fuller
      // than it ends is spending that store, and harvest legitimately
      // exceeds regen for its length. The harness has always known this --
      // its own note said storage drains ride above -- and has always
      // compared against regen alone anyway, so the gate read 101-102% with
      // nothing wrong and could not fail honestly. Supply = regen produced +
      // storage drained. Above 1.0 now means charge came from nowhere, which
      // is the only thing pillar 2 actually forbids.
      const stored = s.face.cells.reduce((x: number, y: number) => x + y, 0);
      const drained = Math.max(0, p2PrevStored - stored);
      const straddled = s.collapse.count !== p2PrevCollapses;
      if (untouched && !straddled && p2PrevChip === chipId && p2PrevTotal > 0 && ceilingWindow > 0) {
        const ratio = (total - p2PrevTotal) / (ceilingWindow + drained);
        p2Metrics.pillar2Max = Math.max(p2Metrics.pillar2Max, ratio);
        if (ratio > 1) p2Metrics.pillar2Over += 1;
        p2Metrics.pillar2Samples += 1;
      } else if (untouched && straddled) {
        p2Metrics.pillar2Straddled += 1;
      }
      p2PrevTotal = total;
      p2PrevChip = chipId;
      p2PrevManual = s.stats.manualChips;
      p2PrevCeiling = p2CeilingIntegral;
      p2PrevCollapses = s.collapse.count;
      p2PrevStored = stored;
    }
  }
  const wallMs = Date.now() - started;

  if (args.opening) {
    mkdirSync(dirname(args.opening), { recursive: true });
    writeFileSync(args.opening, openingRows.join('\n'));
    console.error(`opening -> ${args.opening} (${openingRows.length - 1} minutes)`);
  }

  if (args.depthLog) {
    mkdirSync(dirname(args.depthLog), { recursive: true });
    writeFileSync(args.depthLog, depthRows.join('\n'));
    console.error(`depthlog -> ${args.depthLog} (${depthRows.length - 1} depths)`);
  }

  const csv = rows.join('\n');
  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, csv);
  } else {
    console.log(csv);
  }

  const s = engine.getState();
  console.error('');
  console.error(`— sim: ${args.hours}h ${args.policy} in ${(wallMs / 1000).toFixed(2)}s wall —`);
  console.error(
    `settle: soften ${SETTLE_TUNING.soften} cap ${SETTLE_TUNING.capSec}s quiet ${SETTLE_TUNING.quietSec}s ` +
      `floor ${SETTLE_TUNING.floor} | bank now ${(settleFill(engine.getState()) * 100).toFixed(0)}%`,
  );
  {
    const rows = cadence.rows.filter((r) => r.iFinal > 0 && r.iMean > 0);
    if (rows.length === 0) {
      console.error('cadence: no completed runs to decompose');
    } else {
      const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
      const lens = rows.map((r) => r.len / 60);
      const growth = rows.map((r) => r.iFinal / r.iMean);   // income is NOT constant
      const share = rows.map((r) => r.descent / r.earned);  // not all income buys depth
      const g = med(growth), f = med(share);
      console.error(
        `cadence: ${rows.length} runs | median ${med(lens).toFixed(1)}m ` +
          `(model 12xT = 12.0m at T=60s) | income growth within a run ` +
          `I_final/I_mean = ${g.toFixed(2)}x | share of earnings spent on the stair ` +
          `f = ${(f * 100).toFixed(0)}% | model x growth / share = ` +
          `${(12 * g / Math.max(f, 1e-9)).toFixed(1)}m`,
      );
    }
    /**
     * THE NUMBER SHORING EXISTS FOR (§9.4, roadmap item 14). Printed on every
     * run, with or without the flag, so the two arms are the same line read
     * twice rather than a measurement that only exists in the treatment.
     */
    {
      const pc = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—');
      console.error(
        `recover: ${pc(recover.reSteps, recover.steps)} of descend steps ` +
          `(${recover.reSteps}/${recover.steps}) | ${pc(recover.reDust, recover.dust)} of descend dust | ` +
          `falls through a drift ${recover.falls}, deepest ${recover.driftMax}m`,
      );
      /**
       * AND THE HALF THE SHARE CANNOT SAY.
       *
       * Once a run stops setting records the SHARE is 100% by construction —
       * every step of a repeat climb is re-cover — so the share alone reads as
       * "shoring did nothing" while the drift is busy deleting a third of the
       * climb. What a drift actually does is REMOVE TRAVEL, so the honest
       * companion measure is steps per Collapse and the steps the falls did not
       * have to take. The share says how much of the descent is re-walk; this
       * says how much of the re-walk went away.
       */
      const runs = Math.max(1, cadence.rows.length);
      console.error(
        `recover: ${(recover.steps / runs).toFixed(1)} descend steps per Collapse | ` +
          `drift removed ${recoverPost.removed} steps over ${recover.falls} falls | ` +
          `share once a drift stands ${pc(recoverPost.reSteps, recoverPost.steps)} ` +
          `(100% is expected — a repeat climb is re-cover by definition)`,
      );
    }
  }
  {
    const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;
    const worst = (a: number[]) => Math.max(...a);
    console.error(
      process.argv.includes('--scenario')
        ? `RTP (pillar 6): NOT MEASURED — this run started from a stipulated ` +
          `biography (--scenario), so "the original time" is a number the setup ` +
          `handed it, not one the run earned. Reset-layer MECHANISMS can be ` +
          `exercised from a scenario; pillar-6 RATIOS cannot. Use a real run.`
      : rtp.vsOriginal.length === 0
        ? 'RTP (pillar 6): NO RETURNS — no reset peak was regained this run'
        : `RTP (pillar 6, want <=20-25% of the ORIGINAL time; back = ` +
          `${(rtp.tolerance * 100).toFixed(0)}% of peak): median ` +
          `${pct(med(rtp.vsOriginal))} worst ${pct(worst(rtp.vsOriginal))} | ` +
          `by layer ${['collapse', 'breach', 'recursion', 'spiral']
            .map((l) => `${l} ${rtp.byLayer[l]?.length ? `${pct(med(rtp.byLayer[l]!))} (n=${rtp.byLayer[l]!.length})` : 'no samples'}`)
            .join(', ')} | ` +
          `share of the following run spent re-treading: median ${pct(med(rtp.vsRun))} | ` +
          `${rtp.vsOriginal.length} returns` +
          `${rtpUnresolved().length ? ` | still owing a return at the end: ${rtpUnresolved().join(', ')}` : ''}`,
    );
  }
  if (!args.quiet) for (const e of events) console.error(e);
  // THE ONE MACHINE-READABLE LINE. stdout, so a driver can collect 99 runs
  // without parsing the human log — and on stdout ALONE, because everything
  // else this script says goes to stderr.
  {
    const deep: Record<string, number> = {};
    for (const id of ['umberjade', 'graveclaydeep', 'deepgrave']) deep[id] = materialCount(s, id);
    console.log(`FORKRESULT ${JSON.stringify({
      fork: args.fork, row: args.forkRow, seed: args.seed,
      holdCap: args.holdCap, holdEmulate: args.holdEmulate,
      hand: args.hand, sec: totalSec,
      depth: s.maxDepthRecord, ...forkTrack,
      behaviour: args.drillBehaviour, bar: args.drillBar,
      dust: Math.round(s.totals['dust']?.toNumber() ?? 0),
      // §10.2: the Reading is OFF the floor gates. The policy never dispatches
      // `workProposition`, so this must read 0 on every arm — and the depth
      // beside it is the proof that Loam clears anyway.
      proofs: s.reading?.proven?.length ?? 0, notes: s.reading?.notes?.length ?? 0,
      strikes: s.stats.drillStrikes, drills: s.drills.units.length,
      deepFirst,
      collapses: s.collapse.count, tier: equippedTool(s).tier,
      tools: s.stats.toolsForged, packedBuys: forkPackedBuys, deep,
    })}`);
  }
  console.error(
    `final: dust ${fmt(s.currencies['dust']!)} | brick ${fmt(s.currencies['brick']!)} | ` +
      `cores ${fmt(s.currencies['core']!)} | depth ${s.depth} (max ${s.maxDepthRecord}) | ` +
      `collapses ${s.collapse.count} | delver L${s.delver.level} | drills ${s.drills.units.length}`,
  );
  const gemCount = Object.values(s.materials.gems).reduce((a, b) => a + b, 0);
  console.error(
    // Commons accounting (A.41 ledger thread): drops IN versus stone still
    // HELD, so a live sink that eats the ladder's inputs can be seen at all.
    `commons held: ${COMMONS.map((m) => `${m} ${materialCount(s, m)}`).join(', ')}\n` +
    `materials: ${s.materials.totalDrops} drops | geodes cracked ${s.materials.geodesCracked} | ` +
      `gems ${gemCount} | tools forged ${s.stats.toolsForged} (equipped tier ${equippedTool(s).tier}, ` +
      `${equippedTool(s).name} ${equippedTool(s).purity}%) | assays ${s.assay.surveysDone}`,
  );
  console.error(
    `shell: ${s.shell.current} | breaches ${s.shell.breachCount} | echoes ${fmt(s.currencies['echo'] ?? 0)} | ` +
      `best chain ${s.polarity.bestChain} | magnets ${s.polarity.magnetCount} | ` +
      `loam record ${s.depthRecords['loam'] ?? 0} | ferrite record ${s.depthRecords['ferrite'] ?? 0}`,
  );
  console.error(
    p2Metrics.pillar2Samples > 0
      ? `PILLAR 2 idle CHARGE harvested / (regen + storage drained): max ${(p2Metrics.pillar2Max * 100).toFixed(0)}%, ` +
        `${p2Metrics.pillar2Over}/${p2Metrics.pillar2Samples} windows >100% ` +
        `(${p2Metrics.pillar2Straddled} skipped: straddled a Collapse and cannot be read)`
      : 'PILLAR 2: no untouched windows this policy — see the idle run',
  );
  console.error(
    `verdance[${args.growth}]: spore ${fmt(s.totals['spore'] ?? 0)} total | sap ${fmt(s.totals['sap'] ?? 0)} | ` +
      `chlorophyll ${fmt(s.totals['chlorophyll'] ?? 0)} | vines now ${s.growth.stage.filter((x) => x > 0).length} ` +
      `(feral ${s.growth.stage.filter((x) => x >= 4).length}) | fruit harvested ${Math.round(s.growth.fruitHarvested)} ` +
      `(+${Math.round(s.growth.autoDropped)} self-dropped) | farm sweeps ${verdMetrics.farmHarvests}`,
  );
  const min = (x: number) => (x / 60).toFixed(1) + 'm';
  console.error(
    `beats: loam floor ${beats.tLoamFloor ? min(beats.tLoamFloor) : '—'} | ` +
      `BREACH ${beats.tBreach ? min(beats.tBreach) : '—'} | ` +
      `ferrite d150 ${beats.tFerrite150 ? min(beats.tFerrite150) : '—'}` +
      (beats.tLoamFloor && beats.tFerrite150 && beats.tBreach
        ? ` | PILLAR 6 return-to-peak: ${(((beats.tFerrite150 - beats.tBreach) / beats.tLoamFloor) * 100).toFixed(1)}% (target <=25%)`
        : '') +
      ` | BREACH 2 ${beats.tBreach2 ? min(beats.tBreach2) : '—'} | verdance d150 ${beats.tVerd150 ? min(beats.tVerd150) : '—'}` +
      ` | BREACH 3 ${beats.tBreach3 ? min(beats.tBreach3) : '—'} | glassmere d150 ${beats.tGlass150 ? min(beats.tGlass150) : '—'}` +
      ` | BREACH 4 ${beats.tBreach4 ? min(beats.tBreach4) : '—'} | cinder d150 ${beats.tCinder150 ? min(beats.tCinder150) : '—'}`,
  );
  console.error(
    `glassmere: mirrors ${Object.keys(s.refraction.mirrors).length}/${s.refraction.mirrorStock} | beam harvests ${s.refraction.beamHarvests} | ` +
      `runes ${Object.entries(s.runes.found).map(([r, n]) => `${r}:${n}`).join(' ') || '—'} | ` +
      `pairs known ${s.runes.pairsSeen.length}/14`,
  );
  const avgHeat = cinderMetrics.heatSamples > 0 ? cinderMetrics.heatSum / cinderMetrics.heatSamples : 0;
  console.error(
    `cinder[${heatStance}]: slag ${fmt(s.totals['slag'] ?? 0)} total | heat now ${s.pressure.heat.toFixed(0)} ` +
      `(avg ${avgHeat.toFixed(0)}, peak ${s.pressure.peakHeat.toFixed(0)}) | FLOODS ${s.pressure.floods} | ` +
      `overpressures ${s.pressure.overpressures} (purges ${cinderMetrics.purges}) | ` +
      `pipes ${s.pressure.pipes.filter((p: number) => p > 0).length} (vented ${fmt(s.pressure.ventedTotal)})`,
  );
  // THE CLINKER GATE (A.104). The claim under test is §6's "the shell is
  // impassable" without THE VENT ARRAY, which sits at 58 behind a tier-13 wall
  // at 54 — so what matters is the CEILING the plumbing you can reach imposes,
  // and whether the run ever got near the flood line under it.
  if (currentShell(s).id === 'cinder' || (s.depthRecords['cinder'] ?? 0) > 0) {
    console.error(
      `clinker gate: started ${args.cinderDepth} → record ${s.depthRecords['cinder'] ?? 0} | `
        + `array ${ventArrayBuilt(s) ? `built (${s.vents?.valves?.length ?? 0} valves)` : 'NOT BUILT'} | `
        + `holdLine ${holdLine(s).toFixed(0)} · unchoked ceiling ${heatCeiling(s, true).toFixed(0)} `
        + `· flood line 100 | floods ${s.pressure.floods}`,
    );
  }
  console.error(
    `hollow/aleph: void ${fmt(s.totals['void'] ?? 0)} total | silence now ${s.hollow.silence.toFixed(0)} ` +
      `(harvested ${p10Metrics.silenceHarvests}, lifetime stacks ${fmt(s.hollow.silenceHarvested)}) | ` +
      `rebuilt ${s.hollow.rebuilt.length}/${s.face.cells.length} cells (void spent ${fmt(D(s.hollow.voidSpent))}) | ` +
      `RECURSIONS ${s.recursion.count} | axioms held ${s.recursion.axioms.length} [${s.recursion.axioms.join(',') || '—'}] | ` +
      `core touched ${s.aleph.coreTouched} | heirlooms ${s.forge.tools.filter((t) => t.heirloom).length}`,
  );
  // THE LADDER, STATED (A.44). What this run's own Breach haul buys further up
  // — reported every run so a starved rung shows itself instead of waiting for
  // a scenario that has been handed its currency.
  {
    const perBreach = echoesForCores(s.shell.coresEarnedThisBreach);
    const oneRecursion = perBreach.mul(7);
    console.error(
      `ladder: echoes/breach ${fmt(perBreach)} (from ${fmt(s.shell.coresEarnedThisBreach)} cores) | ` +
        `a full 7-breach Recursion = ${fmt(oneRecursion)} echoes -> ` +
        `${fmt(axiomsForEchoes(oneRecursion))} axioms | lifetime echoes ${fmt(s.totals['echo'] ?? 0)} ` +
        `-> ${fmt(axiomsForEchoes(s.totals['echo'] ?? D(0)))} axioms`,
    );
  }
  console.error(
    `beats(late): BREACH 4 ${beats.tBreach4 ? min(beats.tBreach4) : '—'} | BREACH 5 ${beats.tBreach5 ? min(beats.tBreach5) : '—'} | ` +
      `face whole ${beats.tFaceWhole ? min(beats.tFaceWhole) : '—'} | BREACH 6 ${beats.tBreach6 ? min(beats.tBreach6) : '—'} | ` +
      `RECURSION 1 ${beats.tRecursion1 ? min(beats.tRecursion1) : '—'}`,
  );
  console.error(
    `export spine: kiln firings ${spineMetrics.fluxFired} | ` +
      `held: flux ${materialCount(s, 'kilnflux')}`,
  );
  if (args.income) {
    const rows = Object.entries(incomeLedger).sort((a, b) => b[1] - a[1]);
    const grand = rows.reduce((a, [, v]) => a + v, 0);
    console.error(
      `income SOURCES (dust earned, biggest first; horizon basis '${args.horizon}'):\n` +
        (rows.length === 0
          ? '  (nothing paid all run)'
          : rows
              .map(
                ([label, v]) =>
                  `  ${label.padEnd(34)} ${v.toExponential(2).padStart(11)}` +
                  ` ${((v / Math.max(grand, 1e-9)) * 100).toFixed(1).padStart(5)}%`,
              )
              .join('\n')),
    );
  }
  if (args.commons) {
    const rows = Object.entries(commonsLedger)
      .map(([label, per]) => ({ label, per, total: Object.values(per).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);
    console.error(
      `commons SINKS (units consumed, biggest first):\n` +
        (rows.length === 0
          ? '  (nothing consumed a common all run)'
          : rows
              .map(
                (r) =>
                  `  ${String(r.total).padStart(6)}  ${r.label} — ` +
                  Object.entries(r.per).map(([m, n]) => `${m} ${n}`).join(', '),
              )
              .join('\n')),
    );
  }
  if (args.out) console.error(`csv -> ${args.out}`);
}

main();
