/**
 * A.53 — DO THE DRILL ALLOYS MOVE THE CEILING?
 *
 * The brief said "sim-verify if it touches yield". By design none of the three
 * abilities is a yield multiplier — the argument is written per-ability in
 * content/drillAlloys.ts — but an argument is a claim, and the standing rule
 * since A.42 is that a claim about pacing gets measured. Two things are under
 * test, and they are NOT the same question:
 *
 *   PILLAR 2 (the hard one). The field can only hand over W·H·regen CHARGE per
 *     second. An alloy may make the bay COLLECT faster; it must never make the
 *     rock PRODUCE faster.
 *
 *     THE MEASURE IS CHARGE ÷ CHARGE, FIELD-ONLY (the A.43 correction). Dust
 *     ÷ dpsMax reads over 100% for a BARE bay and always did: dust also comes
 *     from the field's starting stock, from seep, and from sales, so the ratio
 *     was measuring the instrument, not a faucet. `stats.fieldChargeHarvested`
 *     is the numerator the engine keeps for exactly this. The starting stock
 *     (W·H·cap, drained in the first seconds) is subtracted from the numerator
 *     rather than ignored — over a short run it is most of the overshoot.
 *   PILLAR 1 (the band). Income, drops and time-to-depth are bound together at
 *     roughly 5x between a player who engages and one who does not. An alloy is
 *     exactly that kind of engagement, so alloy-vs-bare is the ratio to read.
 *
 * TWO SCENARIOS, for the reason A.52's harness needed them: whether an ability
 * shows up at all depends entirely on which side of the ceiling the bay sits.
 *   CEILING-BOUND — stock field, big bay. Already collecting everything the
 *     field makes. THE ARC should read ~1.00x here and that is the PASS, not a
 *     null result: there is nothing left for it to pick up.
 *   POWER-BOUND — widened field, small bay. Drill-power-limited, so this is
 *     where a collection-rate ability can actually show, and where the worst
 *     case lives.
 *
 * FOUR ARMS per scenario — bare, and each of the three abilities — run through
 * the LIVE warp path (`debug/warp`), because the offline closed form never
 * calls tickDrills and would erase every hook under test.
 *
 *   npx tsx scripts/a53-alloy-rtp.ts [hours]
 *
 * Writes sim-out/a53-alloy-rtp.md and exits. Read next session.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine, type GameState } from '../src/engine';
import { ModifierCache } from '../src/engine/modifiers';
import { descendCost } from '../src/engine/prestigeMath';
import { applyFieldSize, cellCap, cellRegen } from '../src/engine/systems/face';
import { newDrill } from '../src/engine/systems/drills';
import { setEquippedAlloy } from '../src/engine/systems/drillAlloys';
import { DRILL_ABILITIES } from '../src/engine/content/drillAlloys';

const HOURS = Number(process.argv[2] ?? 6);
const CHECKPOINT_SEC = 900;
const START_DEPTH = 40;

/** Bare first, so every arm is compared against the same baseline. */
const ARMS: (string | null)[] = [null, ...DRILL_ABILITIES.map((a) => a.id)];

/**
 * THREE SEEDS, AND WHY THE FIRST DRAFT OF THIS SCRIPT NEEDED THEM.
 *
 * At one seed, lodecall read 1.064 of the field ceiling against a bare arm at
 * 1.030 and the script called pillar 2 breached. It is not: THE CALL cannot
 * touch charge, it only re-rolls the drop TABLE. What actually happened is that
 * an extra drop consumes an extra Math.random, the whole downstream stream
 * shifts, growth spawns on different cells, and drills skip a different set of
 * vined cells. Free-running RNG made two arms that differ in no charge-path
 * code read 3% apart.
 *
 * So Math.random is replaced with a seeded LCG, reset before every arm, and
 * every arm is run at each seed. The BARE arm's spread across seeds is then a
 * measured noise floor rather than an assumed one, and an alloy only breaches
 * if it clears the worst bare reading.
 */
const SEEDS = [1, 20260726, 987654321];
let rngState = 1;
Math.random = (): number => {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 4294967296;
};
const reseed = (n: number): void => { rngState = n >>> 0; };

interface ScenarioConfig {
  name: string;
  drills: number;
  level: number;
  roots: number;
  soil: number;
  blade: number;
  expand: number;
}

const SCENARIOS: ScenarioConfig[] = [
  { name: 'CEILING-BOUND (stock field, big bay)', drills: 8, level: 8, roots: 0, soil: 0, blade: 0, expand: 0 },
  { name: 'POWER-BOUND (widened field, small bay)', drills: 3, level: 5, roots: 15, soil: 15, blade: 15, expand: 6 },
];

interface Arm {
  alloy: string | null;
  /** Charge/s the rock can produce — the pillar-2 denominator. */
  chargeCeiling: number;
  /** W·H·cap: the stock sitting in the field at t=0, not produced during it. */
  startStock: number;
  charge: number;
  dust: number;
  drops: number;
  log: { sec: number; dust: number }[];
}

function build(cfg: ScenarioConfig, alloy: string | null, seed: number): Arm {
  reseed(seed);
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
  const cells = s.face.w * s.face.h;
  const chargeCeiling = cells * cellRegen(s, mods);
  const startStock = cells * cellCap(s, mods);
  for (let i = 0; i < cfg.drills; i++) s.drills.units.push({ ...newDrill(`D${i}`), level: cfg.level });
  if (alloy) {
    s.drills.alloys = [alloy];
    setEquippedAlloy(s, alloy);
  }
  const log: { sec: number; dust: number }[] = [];
  const totalSec = Math.round(HOURS * 3600);
  for (let elapsed = 0; elapsed < totalSec; elapsed += CHECKPOINT_SEC) {
    engine.dispatch({ type: 'debug', op: 'warp', seconds: CHECKPOINT_SEC });
    log.push({ sec: elapsed + CHECKPOINT_SEC, dust: s.totals['dust']?.toNumber() ?? 0 });
  }
  return {
    alloy, chargeCeiling, startStock,
    charge: s.stats.fieldChargeHarvested.toNumber(),
    dust: s.totals['dust']?.toNumber() ?? 0,
    drops: s.materials.totalDrops,
    log,
  };
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
    if (d > START_DEPTH + 100000) return d;
  }
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

interface ArmStat {
  alloy: string | null;
  dust: number;
  drops: number;
  /** Charge/s from the FIELD, stock removed, averaged over seeds. */
  chargeRate: number;
  /** That rate over what the rock can actually produce. The pillar-2 number. */
  load: number;
  loadHi: number;
  chargeCeiling: number;
  startStock: number;
}

function measure(cfg: ScenarioConfig, alloy: string | null): ArmStat {
  const secs = HOURS * 3600;
  const runs = SEEDS.map((seed) => build(cfg, alloy, seed));
  const loads = runs.map((r) => Math.max(0, r.charge - r.startStock) / secs / r.chargeCeiling);
  return {
    alloy,
    dust: mean(runs.map((r) => r.dust)),
    drops: mean(runs.map((r) => r.drops)),
    chargeRate: mean(runs.map((r) => Math.max(0, r.charge - r.startStock) / secs)),
    load: mean(loads),
    loadHi: Math.max(...loads),
    chargeCeiling: runs[0]!.chargeCeiling,
    startStock: runs[0]!.startStock,
  };
}

function runScenario(cfg: ScenarioConfig): { lines: string[]; worst: number; overCeiling: string[] } {
  const arms = ARMS.map((a) => measure(cfg, a));
  const bare = arms[0]!;
  const secs = HOURS * 3600;
  const lines: string[] = [];
  const overCeiling: string[] = [];
  let worst = 1;

  /**
   * THE BARE ARM IS THE INSTRUMENT'S ZERO. A bay with no alloy cannot break
   * pillar 2 by construction, so whatever it reads above 1.000 is measurement
   * residue — the seep bank, the checkpoint boundary, the tail of the starting
   * stock. Reading an alloy against a flat 1.000 would report that residue as a
   * faucet, which is exactly the A.43 mistake. The bar is the bare arm's WORST
   * seed, so seed-to-seed spread is inside the noise floor rather than mistaken
   * for a finding.
   */
  const bar = Math.max(1, bare.loadHi);

  lines.push(`### ${cfg.name}`);
  lines.push(
    `${cfg.drills} drills @ level ${cfg.level} · field produces ${bare.chargeCeiling.toFixed(2)} charge/s `
    + `· ${bare.startStock.toFixed(0)} charge already in the rock at t=0 · mean of ${SEEDS.length} seeds`,
  );
  lines.push('');
  lines.push('| arm | dust | dust/s | field charge/s | ÷ field ceiling | worst seed | vs bare | drops | vs bare | depth |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const arm of arms) {
    const rate = arm.dust / secs;
    const vsBare = bare.dust > 0 ? arm.dust / bare.dust : 1;
    const dropsVs = bare.drops > 0 ? arm.drops / bare.drops : 1;
    const depth = depthReached(arm.dust);
    const depthBare = depthReached(bare.dust);
    const depthRatio = depthBare > START_DEPTH ? (depth - START_DEPTH) / (depthBare - START_DEPTH) : 1;
    worst = Math.max(worst, vsBare, 1 / Math.max(vsBare, 1e-9), dropsVs, depthRatio);
    if (arm.alloy && arm.load > bar) {
      overCeiling.push(
        `${cfg.name} / ${arm.alloy} at ${arm.load.toFixed(3)} of field regen (noise floor ${bar.toFixed(3)})`,
      );
    }
    lines.push(
      `| ${arm.alloy ?? '(bare)'} | ${arm.dust.toFixed(0)} | ${rate.toFixed(2)} | ${arm.chargeRate.toFixed(2)} `
      + `| ${arm.load.toFixed(3)} | ${arm.loadHi.toFixed(3)} `
      + `| ${vsBare.toFixed(2)}x | ${arm.drops.toFixed(0)} | ${dropsVs.toFixed(2)}x | ${depth} |`,
    );
  }
  lines.push('');
  lines.push(`noise floor (bare arm's worst seed, ÷ field ceiling): ${bar.toFixed(3)}`);
  lines.push(`worst ratio this scenario: ${worst.toFixed(2)}x`);
  lines.push('');
  return { lines, worst, overCeiling };
}

function main(): void {
  console.log(`Running ${HOURS}h x ${ARMS.length} arms x ${SCENARIOS.length} scenarios...`);
  const body: string[] = [];
  let worstOverall = 1;
  const breaches: string[] = [];
  for (const cfg of SCENARIOS) {
    const r = runScenario(cfg);
    worstOverall = Math.max(worstOverall, r.worst);
    breaches.push(...r.overCeiling);
    body.push(...r.lines);
  }

  const header = [
    `\n## a53-alloy-rtp — ${new Date().toISOString()}`,
    `${HOURS}h/arm, start depth ${START_DEPTH}, ${ARMS.length} arms (bare + ${DRILL_ABILITIES.length} abilities)`
    + ` x ${SCENARIOS.length} scenarios x ${SEEDS.length} seeds (seeded LCG, reset per arm)`,
    '',
  ];
  const verdict = [
    `PILLAR 2: ${breaches.length === 0
      ? 'HOLDS — no arm harvested more charge than the field produced. Collection got faster; the rock did not.'
      : `BREACHED — ${breaches.join('; ')}. Something is putting charge into the field, not taking it out. NOTE: if the BARE arm is in this list too, suspect the measure before the abilities (A.43).`}`,
    '',
    `PILLAR 1: worst alloy-vs-bare ratio ${worstOverall.toFixed(2)}x (bound is ~5x) — ${
      worstOverall <= 5 ? 'IN BAND.' : 'OUT OF BAND, re-tune before shipping.'}`,
    '',
    'READING THE TABLE: `÷ field ceiling` near 1.000 means that arm is already taking everything the rock',
    'makes, so any further ability has nothing left to add — a CEILING-BOUND row at 1.00x vs bare is the',
    'expected pillar-2 result, not a dead ability. THE CALL (lodecall) should move drop COMPOSITION rather',
    'than count, and should move neither dust nor rate, because it only re-rolls the drop TABLE deeper.',
    '',
    'CAVEATS: three seeds per arm, not thirty — the noise floor is measured, not eliminated; a synthetic bay',
    'set directly rather than bought through the economy, so kiln/currency interactions are out of scope on',
    'purpose; the depth column is a pure descendCost(d) walk against cumulative dust, not the real `descend`',
    'action, so tool-tier gating cannot confound the income reading; the drops column counts drops, and THE',
    'CALL is designed to change their RARITY, so a flat drops ratio for lodecall is expected, not a null.',
  ];

  const report = [...header, ...body, ...verdict].join('\n') + '\n';
  mkdirSync('sim-out', { recursive: true });
  writeFileSync('sim-out/a53-alloy-rtp.md', report, { flag: 'a' });
  console.log(report);
}

main();
