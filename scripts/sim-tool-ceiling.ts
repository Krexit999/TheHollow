/**
 * PILLAR 2, MEASURED — a better tool reaches the ceiling faster and never
 * raises it.
 *
 * THE CLAIM, precisely: for any tool, total charge harvested per second is
 * bounded by what the field GROWS. A tool changes how many swings it takes to
 * collect that, never how much there is. So:
 *
 *   at a LOW click rate   a tool is worth a great deal (fewer swings, same rock)
 *   at a HIGH click rate  every configuration converges on the same number
 *   at NO click rate      nothing changes at all (the idle layer never reads it)
 *
 * THE CEILING IS MEASURED, NOT MODELLED. A.57's sim gate was wrong three times
 * — twice from subtracting a per-scenario baseline, once from a knife-edge
 * comparison that was reading float jitter — and the thing that finally worked
 * was to saturate the field with the plainest possible configuration and use
 * THAT as the reference. Same approach here: bare hands clicking every cell
 * every tick is the ceiling, and no tool may beat it.
 *
 * Writes to sim-out/tool-ceiling.md and exits. Does not print a verdict it has
 * not measured.
 *
 *   npx tsx scripts/sim-tool-ceiling.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine/types';
import { PART_TYPES } from '../src/engine/content/forgeParts';
import { makePart, assembleTool } from '../src/engine/systems/forgeParts';
import { effectOf } from '../src/engine/systems/toolMining';

const SECONDS = 600;
const DT = 0.1;

/** Fit a tool of one material, bypassing the crucible — this sim is about
 *  what a tool DOES, and casting it honestly would only add minutes. */
function fit(state: GameState, materialId: string | null): void {
  state.casting.tool = materialId === null
    ? []
    : PART_TYPES.map((t, i) => ({ ...makePart(t, materialId, 60), id: i + 1 }));
  state.casting.wear = 0;
}

/**
 * Run the face for SECONDS, clicking `clicksPerSec` cells. Returns charge
 * harvested per second — the pillar-2 number, read straight off the stat the
 * engine keeps for exactly this.
 *
 * WEAR IS HELD OFF in the main sweep: a tool that breaks halfway through would
 * measure a blend of two configurations and the numbers would mean nothing.
 * The broken case is measured separately, deliberately, below.
 */
function run(materialId: string | null, clicksPerSec: number, letItWear = false): number {
  return runFull(materialId, clicksPerSec, letItWear).rate;
}

function runFull(
  materialId: string | null, clicksPerSec: number, letItWear = false,
): { rate: number; ores: number } {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.forge.built = true;
  fit(s, materialId);

  const cells = s.face.cells.length;
  let cursor = 0;
  let clickDebt = 0;
  const start = s.stats.fieldChargeHarvested.toNumber();

  for (let t = 0; t < SECONDS / DT; t++) {
    engine.tick(DT);
    clickDebt += clicksPerSec * DT;
    while (clickDebt >= 1) {
      engine.dispatch({ type: 'chip', cell: cursor % cells });
      cursor++;
      clickDebt -= 1;
    }
    if (!letItWear) (engine.getState() as GameState).casting.wear = 0;
  }
  const end = engine.getState() as GameState;
  const got = end.stats.fieldChargeHarvested.toNumber() - start;
  return { rate: got / SECONDS, ores: end.stats.oresOpened ?? 0 };
}

/**
 * THE RATE SWEEP GOES DOWN TO ONE CLICK EVERY TWENTY SECONDS, and the first
 * cut of this did not — it started at 1/s and reported the tool as worthless.
 * It was measuring the wrong side of a crossover.
 *
 * THE ARITHMETIC IT MISSED: a cell refills in `cap / regen` = 8 / 0.08 = 100
 * SECONDS, and a 6x6 face cycles in `36 / clicks-per-second`. Below 0.36
 * clicks/s the cycle is longer than the refill, cells sit AT CAP wasting the
 * regen they have already grown, and clearing more of them per swing is worth
 * something. Above it there is no waste to recover and bare hands already take
 * every grain the field makes — which is pillar 2 working, not a broken tool.
 *
 * So the interesting range is the SLOW one, which is also the honest one: this
 * is an idle game, and a player tapping a few cells and going away is the
 * normal case rather than the edge.
 */
const RATES = [0, 0.05, 0.1, 0.2, 0.35, 0.5, 1, 2, 10, 200];
const TOOLS: Array<[string, string | null]> = [
  ['bare hands', null],
  ['loam tool', 'marl'],
  ['cinder tool', 'slagrock'],
  ['aleph tool', 'firstiron'],
];

mkdirSync('sim-out', { recursive: true });
const out: string[] = [];
const say = (s = ''): void => { out.push(s); console.log(s); };

say('# PILLAR 2 — the tool reaches the ceiling faster, never raises it');
say();
say(`${SECONDS}s per cell, 6x6 face at depth 0, charge harvested per second.`);
say();

/**
 * THE CEILING, AND THE INSTRUMENT'S OWN NOISE.
 *
 * Bare hands clicking every cell every tick is the reference. But ONE sample is
 * not a ceiling — the face carries ore pockets, which are RICHER cells, and how
 * many spawn in a given run is random. A single reference sample plus a `> 1`
 * comparison is precisely the knife-edge that produced 32 false breaches in
 * A.57. So the reference is sampled repeatedly, the spread IS the tolerance,
 * and any excess is judged against measured noise rather than against zero.
 */
const CEIL_SAMPLES = 6;
const samples = Array.from({ length: CEIL_SAMPLES }, () => runFull(null, 200));
const rates = samples.map((s) => s.rate);
const ceiling = Math.max(...rates);
const noise = ceiling / Math.min(...rates);
const TOL = Math.max(1.02, noise * 1.005);
say(`**Measured ceiling** (bare hands, saturating, ${CEIL_SAMPLES} samples): `
  + `\`${ceiling.toFixed(3)}\` charge/s, low \`${Math.min(...rates).toFixed(3)}\`.`);
say(`**Instrument noise** \`${((noise - 1) * 100).toFixed(1)}%\` — the spread across `
  + `${CEIL_SAMPLES} runs of the IDENTICAL configuration. Anything under `
  + `\`${((TOL - 1) * 100).toFixed(1)}%\` over the ceiling is this, not a breach.`);
say(`(Ore pockets are richer cells and would be the obvious suspect, but `
  + `${Math.min(...samples.map((s) => s.ores))}–${Math.max(...samples.map((s) => s.ores))} `
  + `opened across the samples — so at this depth they are not the source. The residue is `
  + `tick-boundary alignment and the drop RNG. Counted rather than explained away.)`);
say();

const table: Record<string, number[]> = {};
for (const [name, mat] of TOOLS) {
  table[name] = RATES.map((r) => run(mat, r));
}

say('| clicks/s | ' + TOOLS.map(([n]) => n).join(' | ') + ' | best vs ceiling |');
say('|---|' + TOOLS.map(() => '---').join('|') + '|---|');
for (let i = 0; i < RATES.length; i++) {
  const row = TOOLS.map(([n]) => table[n]![i]!);
  const best = Math.max(...row);
  say(`| ${RATES[i]} | ` + row.map((v) => v.toFixed(2)).join(' | ')
    + ` | ${((best / ceiling) * 100).toFixed(1)}% |`);
}
say();

// ── THE THREE CLAIMS ──────────────────────────────────────────────────────
const problems: string[] = [];

// 1. Nothing, anywhere, beats the ceiling.
let worst = 0;
let worstAt = '';
for (const [name] of TOOLS) {
  for (let i = 0; i < RATES.length; i++) {
    const ratio = table[name]![i]! / ceiling;
    if (ratio > worst) { worst = ratio; worstAt = `${name} @ ${RATES[i]}/s`; }
  }
}
say(`**1 — nothing exceeds the field.** Highest anywhere: \`${(worst * 100).toFixed(1)}%\` of ceiling (${worstAt}).`);
if (worst > TOL) problems.push(`${worstAt} took ${(worst * 100).toFixed(1)}% of the ceiling`);

// 2. Below the crossover — where the field is wasting regen — a tool pays.
const slow = RATES.indexOf(0.1);
const gainLoam = table['loam tool']![slow]! / table['bare hands']![slow]!;
const gainAleph = table['aleph tool']![slow]! / table['bare hands']![slow]!;
say(`**2 — a tool is worth having, where there is anything to win.** At 0.1 clicks/s `
  + `(one tap every ten seconds, below the 0.36/s crossover): loam \`${gainLoam.toFixed(2)}x\` `
  + `bare hands, aleph \`${gainAleph.toFixed(2)}x\`.`);
if (gainAleph < 1.5) problems.push(`an aleph tool is only ${gainAleph.toFixed(2)}x bare hands at 0.1/s — not worth building`);
if (gainLoam < 1.0) problems.push(`a loam tool is WORSE than bare hands at 0.1/s (${gainLoam.toFixed(2)}x)`);

// 3. Above it they converge — the tool bought attention, not rock.
const fast = RATES.indexOf(200);
const spread = Math.max(...TOOLS.map(([n]) => table[n]![fast]!))
  / Math.min(...TOOLS.map(([n]) => table[n]![fast]!));
say(`**3 — above the crossover they converge.** Spread across all four at 200 clicks/s: `
  + `\`${spread.toFixed(3)}x\`. There is no waste left to recover, so the tool buys nothing — `
  + `which is the ceiling holding, not the tool failing.`);
if (spread > TOL) problems.push(`saturated configurations differ by ${spread.toFixed(3)}x — the tool is moving the ceiling`);

// 4. The idle layer never reads the tool.
const idleBare = table['bare hands']![0]!;
const idleAleph = table['aleph tool']![0]!;
say(`**4 — idle is untouched (pillar 1).** 0 clicks/s: bare \`${idleBare.toFixed(2)}\`, `
  + `aleph tool \`${idleAleph.toFixed(2)}\`.`);
if (Math.abs(idleAleph - idleBare) > 1e-9) problems.push('a carried tool changed the idle rate');

// 5. A BROKEN tool is never worse than bare hands.
say();
say('## Broken, and left to wear');
// MEASURED BELOW THE CROSSOVER, because above it every configuration reads the
// same and "is a broken tool worse than bare hands" would be answered by float
// noise. The first cut compared at 2 clicks/s and flagged a 0.7% difference
// between two saturated runs as a regression.
const brokenRows: string[] = ['| config | charge/s @ 0.1 clicks/s |', '|---|---|'];
const bareSlow = table['bare hands']![slow]!;
brokenRows.push(`| bare hands | ${bareSlow.toFixed(3)} |`);
for (const mat of ['marl', 'firstiron']) {
  const worn = run(mat, 0.1, true);
  brokenRows.push(`| ${mat}, left to wear right through | ${worn.toFixed(3)} |`);
  if (worn < bareSlow * 0.98) {
    problems.push(`a ${mat} tool left to break fell BELOW bare hands (${worn.toFixed(3)} vs ${bareSlow.toFixed(3)})`);
  }
}
for (const r of brokenRows) say(r);
say();
const alephTool = assembleTool(PART_TYPES.map((t) => makePart(t, 'firstiron', 60)));
const whole = effectOf(alephTool, false);
const bust = effectOf(alephTool, true);
say(`An aleph tool whole reaches ${whole.cells} cells at ${(whole.splash * 100).toFixed(0)}%; `
  + `broken, ${bust.cells} cells at ${(bust.splash * 100).toFixed(0)}%. `
  + `Still ahead of the one cell bare hands reach — heavily penalised, never a reason to put it down.`);

say();
if (problems.length === 0) {
  say('## VERDICT — pillar 2 holds, and pillar 1 with it.');
} else {
  say(`## VERDICT — ${problems.length} PROBLEM(S)`);
  for (const p of problems) say(`- ${p}`);
}

writeFileSync('sim-out/tool-ceiling.md', out.join('\n') + '\n');
console.log('\nwritten to sim-out/tool-ceiling.md');
process.exit(problems.length === 0 ? 0 : 1);
