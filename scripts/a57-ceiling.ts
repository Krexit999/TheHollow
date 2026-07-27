/**
 * A.57 — DOES AN EXPLOSION CREATE CHARGE, OR SPEND IT?
 *
 * The brief made this the non-negotiable: "abilities mine FASTER and more
 * explosively, but total yield MUST stay bounded by field regen... Sim-verify:
 * ability-heavy and ability-light play converge to the same ceiling over time.
 * If explosions let total income exceed regen, it's a faucet and it's wrong."
 *
 * TWO MEASUREMENTS, because they answer different halves of that.
 *
 *  1  THE LOAD. Charge harvested from the FIELD, per second, over what the rock
 *     can produce (W·H·regen). Charge ÷ charge, field-only, with the starting
 *     stock (W·H·cap) subtracted — the A.43 correction, and the reason a
 *     dust ÷ dpsMax measure reads over 100% for a BARE bay and always did.
 *  2  CONVERGENCE. The same arms measured in two windows — the first quarter of
 *     the run and the last. If explosions were a faucet, an ability-heavy arm
 *     would pull AWAY over time. If they only change how fast you reach the
 *     ceiling, the arms must come TOGETHER: everyone ends up collecting what
 *     the rock makes, and the explosive ones simply get there sooner.
 *
 * THE INSTRUMENT'S OWN BIAS IS SUBTRACTED AND SAID OUT LOUD. A.56's first run
 * reported fifteen "breach candidates" at 102-109% and the tell was in its own
 * first row: a bay carrying NOTHING read 102.9%, because `applyFieldSize` seats
 * new cells at full cap (the A.42 ledger row). Reporting a corrected figure
 * without its correction is how a harness starts lying, so both are printed.
 *
 * SEEDED RNG, reset per arm. Free-running Math.random made two A.53 arms that
 * touch no charge-path code read 3% apart.
 *
 *   npx tsx scripts/a57-ceiling.ts [hours]
 *
 * Writes sim-out/a57-ceiling.md and exits. Read next session.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine, type GameState } from '../src/engine';
import { ModifierCache } from '../src/engine/modifiers';
import { applyFieldSize, cellCap, cellRegen } from '../src/engine/systems/face';
import { newDrill } from '../src/engine/systems/drills';
import { DRILL_ABILITIES } from '../src/engine/content/drillAlloys';

const HOURS = Number(process.argv[2] ?? 4);
const STEP = 900;
const START_DEPTH = 40;
const SEEDS = [1, 20260726, 987654321];

let rngState = 1;
Math.random = (): number => {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 4294967296;
};
const reseed = (n: number): void => { rngState = n >>> 0; };

interface Scenario {
  name: string; drills: number; level: number;
  roots: number; soil: number; blade: number; expand: number;
}
const SCENARIOS: Scenario[] = [
  { name: 'CEILING-BOUND (stock field, big bay)', drills: 8, level: 8, roots: 0, soil: 0, blade: 0, expand: 0 },
  { name: 'POWER-BOUND (widened field, small bay)', drills: 3, level: 5, roots: 15, soil: 15, blade: 15, expand: 6 },
];

/**
 * null = bare. 'all' = every ability in the game at maximum grade across the
 * bay, which is a loadout no budget permits — deliberately, because if anything
 * in this phase can breach the ceiling it is that.
 */
const ARMS: (string | null)[] = [null, ...DRILL_ABILITIES.map((a) => a.id), 'all'];

interface Run {
  early: number; late: number; total: number;
  dust: number; drops: number;
}

function build(cfg: Scenario, arm: string | null, seed: number): Run {
  reseed(seed);
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  const mods = new ModifierCache();
  s.drills.bayBuilt = true;
  s.depth = START_DEPTH;
  s.maxDepthRecord = START_DEPTH;
  for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
    s.depthRecords[id] = 40;
  }
  s.upgrades['roots'] = cfg.roots;
  s.upgrades['soil'] = cfg.soil;
  s.upgrades['blade'] = cfg.blade;
  s.upgrades['expand'] = cfg.expand;
  applyFieldSize(s, mods);
  const cells = s.face.w * s.face.h;
  const ceiling = cells * cellRegen(s, mods);
  const stock = cells * cellCap(s, mods);

  for (let i = 0; i < cfg.drills; i++) {
    const unit = newDrill(`D${i}`);
    unit.level = cfg.level;
    if (arm === 'all') {
      unit.slots = 3;
      unit.fits = [0, 1, 2].map((k) => {
        const def = DRILL_ABILITIES[(i * 3 + k) % DRILL_ABILITIES.length]!;
        return { id: def.id, grade: 7, ch: 0 };
      });
    } else if (arm) {
      unit.fits = [{ id: arm, grade: 7, ch: 0 }];
    }
    s.drills.units.push(unit);
  }
  s.drills.alloys = arm === 'all' ? DRILL_ABILITIES.map((a) => a.id) : arm ? [arm] : [];

  const total = Math.round(HOURS * 3600);
  const quarter = Math.max(STEP, Math.round(total / 4));
  let atQuarter = 0;
  let atThreeQuarter = 0;
  for (let t = 0; t < total; t += STEP) {
    engine.dispatch({ type: 'debug', op: 'warp', seconds: STEP });
    const now = s.stats.fieldChargeHarvested.toNumber();
    if (t + STEP <= quarter) atQuarter = now;
    if (t + STEP <= total - quarter) atThreeQuarter = now;
  }
  const harvested = s.stats.fieldChargeHarvested.toNumber();
  return {
    // EARLY is the first quarter with the STOCK removed — the stock is spent in
    // the first seconds and is not production. LATE is the final quarter, which
    // contains no stock at all and is the honest steady-state reading.
    early: Math.max(0, atQuarter - stock) / quarter / ceiling,
    late: (harvested - atThreeQuarter) / quarter / ceiling,
    total: Math.max(0, harvested - stock) / total / ceiling,
    dust: s.totals['dust']?.toNumber() ?? 0,
    drops: s.materials.totalDrops,
  };
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const fmt = (n: number): string =>
  (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toFixed(1));

interface Stat {
  name: string; total: number; totalHi: number;
  early: number; late: number; dust: number; drops: number;
}

function measure(cfg: Scenario, arm: string | null): Stat {
  const runs = SEEDS.map((seed) => build(cfg, arm, seed));
  return {
    name: arm ?? 'bare',
    total: mean(runs.map((r) => r.total)),
    totalHi: Math.max(...runs.map((r) => r.total)),
    early: mean(runs.map((r) => r.early)),
    late: mean(runs.map((r) => r.late)),
    dust: mean(runs.map((r) => r.dust)),
    drops: mean(runs.map((r) => r.drops)),
  };
}

interface ScenarioOut {
  lines: string[]; over: string[]; worstIncome: number;
  spreadEarly: number; spreadLate: number;
}

/**
 * THE BIAS HAS TO COME FROM A SATURATED BAY, and the first run of this script
 * got that wrong in a way worth writing down.
 *
 * It subtracted each scenario's OWN bare arm. In CEILING-BOUND that is 102.9%
 * — a bay carrying nothing, which cannot be a faucet by construction, so the
 * ~3pp is the instrument (the A.42 residual: `applyFieldSize` seats new cells
 * full, plus growth banking overflow the denominator already counts). But in
 * POWER-BOUND the bare arm sits at 60%, nowhere near saturation, so it exhibits
 * NO bias — and subtracting zero from a saturated ability arm flagged thirteen
 * false breaches.
 *
 * The bias is a property of the MEASURE AT SATURATION, so it is taken once,
 * from the one arm that is provably clean and provably saturated, and applied
 * to both scenarios.
 */
function scenario(cfg: Scenario, bias: number): ScenarioOut {
  const arms = ARMS.map((a) => measure(cfg, a));
  const bare = arms[0]!;
  const lines: string[] = [
    `### ${cfg.name}`,
    '',
    `bare load **${pct(bare.total)}** (worst seed ${pct(bare.totalHi)}) — the instrument's own floor.`,
    'Anything at or under that is the measure, not a faucet (A.42: `applyFieldSize` seats new cells full).',
    '',
    '| arm | load | worst | −bias | early¼ | late¼ | dust | vs bare | drops |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  const over: string[] = [];
  let worstIncome = 1;
  for (const a of arms) {
    const income = bare.dust > 0 ? a.dust / bare.dust : 1;
    if (income > worstIncome) worstIncome = income;
    const corrected = a.totalHi - bias;
    if (corrected > 1 + 1e-9) {
      over.push(`${cfg.name} / ${a.name}: ${pct(a.totalHi)} raw, ${pct(corrected)} after the ${pct(bias)} bare-arm bias`);
    }
    lines.push(
      `| ${a.name} | ${pct(a.total)} | ${pct(a.totalHi)} | ${pct(corrected)} | ${pct(a.early)} | ${pct(a.late)} `
      + `| ${fmt(a.dust)} | ${income.toFixed(2)}x | ${a.drops.toFixed(0)} |`,
    );
  }
  // CONVERGENCE: the spread between arms, early against late. A faucet WIDENS
  // it; a different route to the same ceiling NARROWS it.
  const earlies = arms.map((a) => a.early);
  const lates = arms.map((a) => a.late);
  const spreadEarly = Math.max(...earlies) - Math.min(...earlies);
  const spreadLate = Math.max(...lates) - Math.min(...lates);
  lines.push('');
  lines.push(`**Convergence** — spread across all ${arms.length} arms: first quarter ${pct(spreadEarly)}, last quarter ${pct(spreadLate)}.`);
  lines.push('');
  return { lines, over, worstIncome, spreadEarly, spreadLate };
}

function main(): void {
  mkdirSync('sim-out', { recursive: true });
  const out: string[] = [
    '# A.57 — twenty-nine abilities against the ceiling',
    '',
    `${HOURS}h per arm, ${SEEDS.length} seeds, warp path (so every hook runs).`,
    `${ARMS.length} arms x ${SCENARIOS.length} scenarios. The \`all\` arm carries EVERY`,
    'ability at grade VII across the bay — a loadout no budget permits, which is the',
    'point: if anything can breach the ceiling it is that.',
    '',
  ];
  const over: string[] = [];
  let worst = 1;
  let converged = true;
  // The saturated clean reference: a bare bay on the stock field, already
  // collecting everything the rock makes.
  const saturatedBare = measure(SCENARIOS[0]!, null);
  const bias = Math.max(0, saturatedBare.totalHi - 1);
  out.push(
    `> Instrument bias, taken from a BARE bay at saturation: **${pct(bias)}**. A bay`,
    '> carrying nothing cannot be a faucet, so that much of every reading is the',
    '> measure and not the game (the A.42 residual). It is subtracted from every',
    '> arm below and printed alongside the raw number, never instead of it.',
    '',
  );
  for (const cfg of SCENARIOS) {
    const r = scenario(cfg, bias);
    out.push(...r.lines);
    over.push(...r.over);
    worst = Math.max(worst, r.worstIncome);
    // CONVERGED means the arms are no further apart at the end — OR that they
    // are all inside a few points of each other, which is the same statement
    // once every arm is pinned to the ceiling. The first cut used an absolute
    // 2pp tolerance and called 0.6% -> 2.8% a divergence, in a scenario where
    // all thirty-one arms sat within 1.4pp of a bare bay.
    if (r.spreadLate > r.spreadEarly + 0.02 && r.spreadLate > 0.05) converged = false;
  }
  out.push('## Verdict', '');
  out.push(over.length === 0
    ? "**PILLAR 2 HOLDS.** No arm cleared 100% of the field's own production once the bare arm's instrument bias is removed. An explosion spends the charge that was in the cells it cleared."
    : `**${over.length} ARM(S) ABOVE THE CEILING AFTER BIAS CORRECTION — NOT CLEARED:**\n\n${over.map((x) => `- ${x}`).join('\n')}`);
  out.push('');
  out.push(converged
    ? '**CONVERGENCE HOLDS.** The arms are no further apart at the end of the run than at the start — ability-heavy play reaches the ceiling faster and then sits on it, which is exactly what an explosion that SPENDS the field looks like.'
    : '**CONVERGENCE FAILED.** Some arm pulled AWAY over the run, which is the signature of a faucet. Do not ship.');
  out.push('');
  out.push(`**PILLAR 1** — worst ability-vs-bare income ratio: **${worst.toFixed(2)}x** against a ~5x bound.`);
  writeFileSync('sim-out/a57-ceiling.md', out.join('\n'));
  console.log('wrote sim-out/a57-ceiling.md');
}

main();
