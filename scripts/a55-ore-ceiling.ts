/**
 * A.55 — DO ORES MOVE THE CEILING?
 *
 * The brief predicted this would be self-solving and said to verify it anyway,
 * which is the right instinct: an ore is a bigger CAP and nothing else, and
 * `dpsMax = W·H·regen·Y` has no cap term, so the ceiling cannot move by
 * construction. That is an argument. This is the measurement.
 *
 * THE MEASURE IS CHARGE ÷ CHARGE, FIELD-ONLY — the A.43 correction, re-applied.
 * Dust ÷ dpsMax reads over 100% for a BARE face and always did, because dust
 * also comes from the field's starting stock, from seep, and from sales. The
 * numerator is `stats.fieldChargeHarvested`; the starting stock (which an
 * ore-heavy face holds MORE of, so it matters more here than anywhere) is
 * subtracted rather than ignored.
 *
 * THREE ARMS, one flag apart:
 *   NONE  — ore spawning off entirely. The control.
 *   LIGHT — the shipped trickle.
 *   HEAVY — the trickle cranked hard, so the face sits at its 20% cap the whole
 *           run. If ore were a faucet this is the arm that would show it.
 *
 * WHAT "CONVERGE" MEANS HERE, precisely: over a long run all three must land at
 * the same charge/second, because they are all drawing on the same W·H·regen.
 * An ore-heavy arm is ALLOWED to be a little lower (a pocket is charge sitting
 * in the rock unharvested, and some is still sitting there when the clock
 * stops) and is NOT allowed to be higher by more than the measured noise.
 *
 * The DROPS column is where ore is supposed to pay, and it is expected to
 * diverge — that is the feature working, not a failure. It is reported so the
 * size of the reward is on the record next to the ceiling it did not move.
 *
 *   npx tsx scripts/a55-ore-ceiling.ts [hours]
 *
 * Writes sim-out/a55-ore-ceiling.md and exits. Read next session.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine, type GameState } from '../src/engine';
import { ModifierCache, registerModifier } from '../src/engine/modifiers';
import { applyFieldSize, cellCap, cellRegen } from '../src/engine/systems/face';
import { newDrill } from '../src/engine/systems/drills';
import { oreCount } from '../src/engine/systems/ores';
import { oreRichness } from '../src/engine/content/ores';
import { MATERIALS, RARITIES } from '../src/engine/materials';

const HOURS = Number(process.argv[2] ?? 6);
const CHECKPOINT_SEC = 900;
const START_DEPTH = 40;

/** Seeded LCG, reset per arm — the A.54 lesson: free-running RNG made two arms
 *  that differ in no relevant code read 3% apart and get called a breach. */
const SEEDS = [1, 20260726, 987654321];
let rngState = 1;
Math.random = (): number => {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 4294967296;
};
const reseed = (n: number): void => { rngState = n >>> 0; };

/** The one flag the arms differ by. Read by a modifier registered below. */
let oreLean = 1;
registerModifier({
  id: 'sim.oreArm',
  label: 'sim arm',
  bucket: 'oreChance',
  value: () => oreLean,
});

type Arm = { name: string; lean: number };
const ARMS: Arm[] = [
  { name: 'NONE  (no ore at all)', lean: 0 },
  { name: 'LIGHT (the shipped trickle)', lean: 1 },
  { name: 'HEAVY (cranked to the 20% cap)', lean: 60 },
];

interface Run {
  charge: number;
  dust: number;
  drops: number;
  /** Drops above 'common' — where an ore actually pays (see the verdict). */
  fine: number;
  ores: number;
  /** Charge still sitting unharvested in the rock when the clock stopped. */
  standing: number;
  chargeCeiling: number;
  startStock: number;
}

function build(arm: Arm, seed: number, drills: number): Run {
  reseed(seed);
  oreLean = arm.lean;
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  const mods = new ModifierCache();
  s.depth = START_DEPTH;
  s.maxDepthRecord = START_DEPTH;
  s.drills.bayBuilt = drills > 0;
  s.upgrades['soil'] = 10;
  s.upgrades['roots'] = 6;
  applyFieldSize(s, mods);
  const cells = s.face.w * s.face.h;
  const chargeCeiling = cells * cellRegen(s, mods);
  const startStock = cells * cellCap(s, mods);
  for (let i = 0; i < drills; i++) s.drills.units.push({ ...newDrill(`D${i}`), level: 6 });

  const totalSec = Math.round(HOURS * 3600);
  for (let elapsed = 0; elapsed < totalSec; elapsed += CHECKPOINT_SEC) {
    engine.dispatch({ type: 'debug', op: 'warp', seconds: CHECKPOINT_SEC });
  }
  // What the pockets are still holding — the honest explanation for an
  // ore-heavy arm reading slightly LOW rather than a shortfall to chase.
  const base = cellCap(s, mods);
  let standing = 0;
  for (let i = 0; i < s.face.cells.length; i++) {
    if (s.face.ore?.[i]) standing += Math.min(s.face.cells[i]!, base * oreRichness(s.face.ore[i]));
  }
  // WHERE AN ORE ACTUALLY PAYS. The count of drops is deliberately flat (see
  // openOre); the RARITY is not, because a pocket rolls the same table far
  // deeper. Counting everything above 'common' is the only way to see the
  // reward at all — a run that reports drop COUNT alone reports that this
  // feature does nothing.
  let fine = 0;
  for (const [id, bands] of Object.entries(s.materials.stacks)) {
    const def = MATERIALS.find((m) => m.id === id);
    if (!def || RARITIES.indexOf(def.rarity) < 1) continue;
    for (const b of Object.values(bands)) fine += b.count;
  }
  return {
    charge: s.stats.fieldChargeHarvested.toNumber(),
    dust: s.totals['dust']?.toNumber() ?? 0,
    drops: s.materials.totalDrops,
    fine,
    ores: (s.stats.oresOpened ?? 0) + oreCount(s),
    standing,
    chargeCeiling,
    startStock,
  };
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

function scenario(title: string, drills: number): { lines: string[]; worst: number; breach: string[] } {
  const secs = HOURS * 3600;
  const lines: string[] = [];
  const breach: string[] = [];
  lines.push(`### ${title}`);
  lines.push('');
  lines.push('| arm | field charge/s | ÷ ceiling | worst seed | vs none | dust/s | drops | FINE drops | fine vs none | pockets |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');

  const stats = ARMS.map((arm) => {
    const runs = SEEDS.map((seed) => build(arm, seed, drills));
    const loads = runs.map((r) => Math.max(0, r.charge - r.startStock) / secs / r.chargeCeiling);
    return {
      arm,
      load: mean(loads),
      loadHi: Math.max(...loads),
      rate: mean(runs.map((r) => Math.max(0, r.charge - r.startStock) / secs)),
      dust: mean(runs.map((r) => r.dust)),
      drops: mean(runs.map((r) => r.drops)),
      fine: mean(runs.map((r) => r.fine)),
      ores: mean(runs.map((r) => r.ores)),
      standing: mean(runs.map((r) => r.standing)),
    };
  });
  const control = stats[0]!;
  // The control cannot break pillar 2 by construction, so whatever IT reads
  // above 1.000 is the instrument's own residue, not a faucet (A.54's rule).
  const floor = Math.max(1, control.loadHi);
  let worst = 1;

  for (const st of stats) {
    const vsNone = control.load > 0 ? st.load / control.load : 1;
    const fineVs = control.fine > 0 ? st.fine / control.fine : 1;
    worst = Math.max(worst, vsNone, fineVs);
    if (st.arm.lean > 0 && st.load > floor) {
      breach.push(`${title} / ${st.arm.name.split(' ')[0]} at ${st.load.toFixed(3)} (noise floor ${floor.toFixed(3)})`);
    }
    lines.push(
      `| ${st.arm.name} | ${st.rate.toFixed(2)} | ${st.load.toFixed(3)} | ${st.loadHi.toFixed(3)} `
      + `| ${vsNone.toFixed(3)}x | ${(st.dust / secs).toFixed(2)} | ${st.drops.toFixed(0)} `
      + `| ${st.fine.toFixed(0)} | ${fineVs.toFixed(2)}x | ${st.ores.toFixed(0)} |`,
    );
  }
  lines.push('');
  lines.push(`control's own ÷ ceiling (the instrument's zero): ${floor.toFixed(3)}`);
  lines.push(`charge still standing unharvested in pockets at the bell: ${stats[2]!.standing.toFixed(0)}`);
  lines.push('');
  return { lines, worst, breach };
}

function main(): void {
  console.log(`Running ${HOURS}h x ${ARMS.length} arms x ${SEEDS.length} seeds x 2 scenarios...`);
  const body: string[] = [];
  const breaches: string[] = [];
  let worst = 1;
  for (const [title, drills] of [['IDLE (a bay, no hands)', 4], ['BARE (no drills at all)', 0]] as const) {
    const r = scenario(title, drills);
    body.push(...r.lines);
    breaches.push(...r.breach);
    worst = Math.max(worst, r.worst);
  }

  const header = [
    `\n## a55-ore-ceiling — ${new Date().toISOString()}`,
    `${HOURS}h/arm, start depth ${START_DEPTH}, ${ARMS.length} arms x ${SEEDS.length} seeds (seeded LCG, reset per arm)`,
    '',
  ];
  const verdict = [
    `PILLAR 2: ${breaches.length === 0
      ? 'HOLDS — an ore-heavy face harvested no more charge per second than a face with no ore in it at all. The pockets concentrate what the rock made; they do not make more of it.'
      : `BREACHED — ${breaches.join('; ')}. Something is adding charge rather than storing it. Check that nothing reads cellCapAt as a REGEN term before shipping.`}`,
    '',
    'READING THE TABLE: `vs none` on the charge column is the convergence claim — all three arms draw on the',
    'same W·H·regen, so they must land together. An ore-heavy arm reading slightly LOW is correct and expected:',
    'the "charge still standing" line is the charge sitting in unopened pockets when the clock stopped, which',
    'the control had already harvested. The DROPS column is where an ore is meant to pay, and it is SUPPOSED to',
    'diverge — that divergence is the feature, and it costs the ceiling nothing because the drop table sits',
    'outside the income path entirely.',
    '',
    'CAVEATS: three seeds per arm, not thirty — the noise floor is measured, not eliminated; a synthetic bay set',
    'directly rather than bought through the economy; the arms differ by ONE registered modifier value and',
    'nothing else, which is the A.42 rule that a baseline measured by different code is not a baseline.',
  ];

  const report = [...header, ...body, ...verdict].join('\n') + '\n';
  mkdirSync('sim-out', { recursive: true });
  writeFileSync('sim-out/a55-ore-ceiling.md', report, { flag: 'a' });
  console.log(report);
}

main();
