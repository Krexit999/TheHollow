/**
 * A.56 — DO THE TWELVE NEW ABILITIES, THE GRADE, OR THE PRIZE CHASSIS MOVE THE
 * CEILING? And does the re-priced shop row break the idle band?
 *
 * Same instrument and the same two questions as `a53-alloy-rtp.ts`, widened to
 * everything A.56 adds. That script's design notes are the authority; the parts
 * that matter here:
 *
 *   PILLAR 2 is measured as CHARGE ÷ CHARGE, field-only, with the starting
 *     stock (W·H·cap) subtracted from the numerator. Dust ÷ dpsMax reads over
 *     100% for a BARE bay and always did.
 *   PILLAR 1 is alloy-vs-bare, and the bound is ~5x. The BARE arm's spread
 *     across three seeds is the measured noise floor, so an arm only counts as
 *     a breach if it clears the worst bare reading.
 *   SEEDED RNG, reset per arm. Free-running Math.random made two arms that
 *     touch no charge-path code read 3% apart in A.53.
 *
 * WHAT IS NEW HERE, AND WHY EACH ARM EXISTS:
 *   every ability   — the twelve authored this phase have never been measured.
 *   graded arms     — a grade-VII Arcvein is the strongest form of the oldest
 *                     ability, and "an old ability gets better" is only safe if
 *                     the better version still cannot out-produce the rock.
 *   two-slot arm    — the prize chassis is the ONLY place two abilities
 *                     compound on one stroke. If anything in this phase can
 *                     breach, it is most likely to be there.
 *   prize bay       — PRIZE_POWER on every machine, to check that a better
 *                     chassis reaches the ceiling sooner and stops.
 *
 * THE BUY CURVE gets its own block, because it is a PACING question and not a
 * ceiling one: how long does a bay of N take to afford at r=1.75 against the
 * old r=1.25, for a player earning at a fixed rate. Reported as a ratio and a
 * wall-clock, not as a verdict — the ruling is the user's.
 *
 *   npx tsx scripts/a56-drills.ts [hours]
 *
 * Writes sim-out/a56-drills.md and exits. Read next session.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine, type GameState } from '../src/engine';
import { ModifierCache } from '../src/engine/modifiers';
import { applyFieldSize, cellCap, cellRegen } from '../src/engine/systems/face';
import { newDrill, newPrizeDrill, PRIZE_POWER, BOUGHT_DRILLS } from '../src/engine/systems/drills';
import {
  ABILITY_BY_ID, DRILL_ABILITIES, shellOrdinal,
} from '../src/engine/content/drillAlloys';

const HOURS = Number(process.argv[2] ?? 4);
const CHECKPOINT_SEC = 900;
const START_DEPTH = 40;

const SEEDS = [1, 20260726, 987654321];
let rngState = 1;
Math.random = (): number => {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 4294967296;
};
const reseed = (n: number): void => { rngState = n >>> 0; };

/** An arm is a bay recipe: what each machine carries, and what it is. */
interface ArmDef {
  name: string;
  /** Ability ids dealt round-robin across the bay. Empty = bare. */
  ids: string[];
  /** Force every fit to this grade. Absent = the ability's own shell ordinal. */
  grade?: number;
  /** Give every machine two slots and the PRIZE bite. */
  prize?: boolean;
  /** Fit BOTH of these to every machine (needs `prize`). */
  pair?: [string, string];
}

const ARMS: ArmDef[] = [
  { name: 'bare', ids: [] },
  ...DRILL_ABILITIES.map((a) => ({ name: a.id, ids: [a.id] })),
  // The oldest ability at the deepest grade — the "it gets better" claim.
  { name: 'arcvein@VII', ids: ['arcvein'], grade: 7 },
  { name: 'emberset@VII', ids: ['emberset'], grade: 7 },
  { name: 'everywhen@VII', ids: ['everywhen'], grade: 7 },
  // A bay that spread its pours — the A.54 'mix' arm, now over fifteen.
  { name: 'mix-all', ids: DRILL_ABILITIES.map((a) => a.id) },
  // The prize chassis: bigger bite, and two abilities on one stroke.
  { name: 'prize-bare', ids: [], prize: true },
  { name: 'prize arc+set', ids: [], prize: true, pair: ['arcvein', 'emberset'] },
  { name: 'prize burst+set@VII', ids: [], prize: true, pair: ['slagburst', 'emberset'], grade: 7 },
];

interface ScenarioConfig {
  name: string;
  drills: number; level: number;
  roots: number; soil: number; blade: number; expand: number;
}

const SCENARIOS: ScenarioConfig[] = [
  { name: 'CEILING-BOUND (stock field, big bay)', drills: 8, level: 8, roots: 0, soil: 0, blade: 0, expand: 0 },
  { name: 'POWER-BOUND (widened field, small bay)', drills: 3, level: 5, roots: 15, soil: 15, blade: 15, expand: 6 },
];

interface Run {
  chargeCeiling: number; startStock: number;
  charge: number; dust: number; drops: number;
}

function build(cfg: ScenarioConfig, arm: ArmDef, seed: number): Run {
  reseed(seed);
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  const mods = new ModifierCache();
  s.drills.bayBuilt = true;
  s.depth = START_DEPTH;
  s.maxDepthRecord = START_DEPTH;
  // Every shell reached, so nothing is gated out of a measurement.
  for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
    s.depthRecords[id] = 40;
  }
  s.upgrades['roots'] = cfg.roots;
  s.upgrades['soil'] = cfg.soil;
  s.upgrades['blade'] = cfg.blade;
  s.upgrades['expand'] = cfg.expand;
  applyFieldSize(s, mods);
  const cells = s.face.w * s.face.h;
  const chargeCeiling = cells * cellRegen(s, mods);
  const startStock = cells * cellCap(s, mods);

  const gradeOf = (id: string): number =>
    arm.grade ?? shellOrdinal(ABILITY_BY_ID.get(id)!.shell);

  for (let i = 0; i < cfg.drills; i++) {
    const base = arm.prize
      ? newPrizeDrill(`P${i}`, `sim${i}`, 2)
      : newDrill(`D${i}`);
    const fits: { id: string; grade: number }[] = [];
    if (arm.pair) {
      fits.push({ id: arm.pair[0], grade: gradeOf(arm.pair[0]) });
      fits.push({ id: arm.pair[1], grade: gradeOf(arm.pair[1]) });
    } else if (arm.ids.length > 0) {
      const id = arm.ids[i % arm.ids.length]!;
      fits.push({ id, grade: gradeOf(id) });
    }
    s.drills.units.push({ ...base, level: cfg.level, ...(fits.length ? { fits } : {}) });
  }
  s.drills.alloys = [...new Set([...arm.ids, ...(arm.pair ?? [])])];

  const totalSec = Math.round(HOURS * 3600);
  for (let elapsed = 0; elapsed < totalSec; elapsed += CHECKPOINT_SEC) {
    engine.dispatch({ type: 'debug', op: 'warp', seconds: CHECKPOINT_SEC });
  }
  return {
    chargeCeiling, startStock,
    charge: s.stats.fieldChargeHarvested.toNumber(),
    dust: s.totals['dust']?.toNumber() ?? 0,
    drops: s.materials.totalDrops,
  };
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

interface Stat {
  name: string; dust: number; drops: number; load: number; loadHi: number;
}

function measure(cfg: ScenarioConfig, arm: ArmDef): Stat {
  const secs = HOURS * 3600;
  const runs = SEEDS.map((seed) => build(cfg, arm, seed));
  const loads = runs.map((r) => Math.max(0, r.charge - r.startStock) / secs / r.chargeCeiling);
  return {
    name: arm.name,
    dust: mean(runs.map((r) => r.dust)),
    drops: mean(runs.map((r) => r.drops)),
    load: mean(loads),
    loadHi: Math.max(...loads),
  };
}

const fmt = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toFixed(1);

function scenario(cfg: ScenarioConfig): { lines: string[]; worstIncome: number; over: string[] } {
  const arms = ARMS.map((a) => measure(cfg, a));
  const bare = arms[0]!;
  const lines: string[] = [
    `### ${cfg.name}`,
    '',
    `bare load ${(bare.load * 100).toFixed(1)}% (worst seed ${(bare.loadHi * 100).toFixed(1)}%) — the noise floor`,
    '',
    '| arm | dust | vs bare | drops | vs bare | field load | worst |',
    '|---|---|---|---|---|---|---|',
  ];
  const over: string[] = [];
  let worstIncome = 1;
  for (const a of arms) {
    const income = bare.dust > 0 ? a.dust / bare.dust : 1;
    const drops = bare.drops > 0 ? a.drops / bare.drops : 1;
    if (income > worstIncome) worstIncome = income;
    // THE INSTRUMENT HAS A BIAS AND IT HAS TO BE SUBTRACTED, not ignored.
    //
    // The first run of this script flagged FIFTEEN "breach candidates" at
    // 102-109%, and the tell that they were not breaches was in its own first
    // row: the BARE arm read 102.9%. A bay carrying nothing cannot out-produce
    // the rock, so ~3pp of that is the measure, not a faucet — the A.42 ledger
    // already names the cause (`applyFieldSize` seats new cells at full cap,
    // charge injected at a point no window-differencing can attribute).
    //
    // So the gate is: does this arm clear 100% of the field AFTER the bare
    // arm's own overshoot is removed? Reported alongside the raw number, never
    // instead of it, because a corrected figure that hides its correction is
    // how a harness starts lying.
    const bias = Math.max(0, bare.loadHi - 1);
    if (a.loadHi - bias > 1 + 1e-9) {
      over.push(`${cfg.name} / ${a.name} = ${(a.loadHi * 100).toFixed(1)}% raw, `
        + `${((a.loadHi - bias) * 100).toFixed(1)}% after the ${(bias * 100).toFixed(1)}pp bare-arm bias`);
    }
    lines.push(
      `| ${a.name} | ${fmt(a.dust)} | ${income.toFixed(2)}x | ${a.drops.toFixed(0)} | ${drops.toFixed(2)}x `
      + `| ${(a.load * 100).toFixed(1)}% | ${(a.loadHi * 100).toFixed(1)}% |`,
    );
  }
  lines.push('');
  return { lines, worstIncome, over };
}

/**
 * THE BUY CURVE, as a pacing question rather than a ceiling one.
 *
 * `totalCost(n) = base·(r^n − 1)/(r − 1)`. What changed is r (1.25 → 1.75) and
 * the cap (23 → 15 bought). Reported at a FIXED income rate so the two curves
 * are compared on the same earnings, which is the only honest way to say what
 * the re-price costs a player in time.
 */
function curveBlock(): string[] {
  const base = 6;
  const total = (r: number, n: number): number => base * (Math.pow(r, n) - 1) / (r - 1);
  const lines = [
    '## The buy curve',
    '',
    '`drillCount` moved from r=1.25/23 levels (PILLARS "Standard") to r=1.75/15',
    'levels ("Structural"), and the other eight rails became prizes.',
    '',
    '| chassis | old total (r=1.25) | new total (r=1.75) | new ÷ old |',
    '|---|---|---|---|',
  ];
  for (const n of [2, 4, 6, 8, 12, 16]) {
    const o = total(1.25, n - 1);
    const nw = total(1.75, Math.min(n - 1, 15));
    lines.push(`| ${n} | ${fmt(o)} | ${fmt(nw)} | ${(nw / o).toFixed(1)}x |`);
  }
  lines.push('');
  lines.push(`Bought cap is now ${BOUGHT_DRILLS}; prize chassis carry ${PRIZE_POWER}x bite and 2-3 slots.`);
  lines.push('');
  lines.push('The pillar-1 question this raises and does NOT answer: a bought drill is');
  lines.push('the idle player\'s income, so an 18x price on a full bay is a gate, and');
  lines.push('pillar 1 binds gates as well as income. What partly offsets it is that the');
  lines.push('prize rails are FREE and stronger, and three of the four sources are');
  lines.push('achievement counts an idle player earns on the same rails as anyone else.');
  lines.push('A full idle-vs-active arc measuring TIME-TO-N-DRILLS is the reading that');
  lines.push('would settle it, and it is not in this script.');
  return lines;
}

function main(): void {
  mkdirSync('sim-out', { recursive: true });
  const out: string[] = [
    '# A.56 — drills: abilities, grades, prize chassis, buy curve',
    '',
    `${HOURS}h per arm, ${SEEDS.length} seeds, warp path (so every hook runs).`,
    `${ARMS.length} arms x ${SCENARIOS.length} scenarios.`,
    '',
    '## Pillar 2 — can any of it out-produce the rock',
    '',
  ];
  const over: string[] = [];
  let worst = 1;
  for (const cfg of SCENARIOS) {
    const r = scenario(cfg);
    out.push(...r.lines);
    over.push(...r.over);
    worst = Math.max(worst, r.worstIncome);
  }
  out.push('## Verdict', '');
  out.push(over.length === 0
    ? '**PILLAR 2 HOLDS** — no arm read above the bare arm\'s own worst-seed field load.'
    : `**PILLAR 2 BREACH CANDIDATES (${over.length})**\n\n` + over.map((x) => `- ${x}`).join('\n'));
  out.push('');
  out.push(`**PILLAR 1** — worst alloy-vs-bare income ratio: **${worst.toFixed(2)}x** against a ~5x bound.`);
  out.push('');
  out.push(...curveBlock());
  writeFileSync('sim-out/a56-drills.md', out.join('\n'));
  console.log('wrote sim-out/a56-drills.md');
}

main();
