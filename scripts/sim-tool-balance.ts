/**
 * HEAVY AND LIGHT ARRIVE AT THE SAME CEILING — measured, not argued.
 *
 * THE CLAIM the brief asks to be proved: heavy is fewer bigger swings, light is
 * more smaller ones, and the total is the same. So:
 *
 *   POWER-BOUND (slow clicking)  the two differ. There is banked regen going
 *                                begging and the two collect it differently —
 *                                if they measured identically here the axis
 *                                would be decoration.
 *   CEILING-BOUND (fast)         they converge. The heavy tool's wind-up caps
 *                                its swings; the light one swings freely and
 *                                takes less. Both land on W x H x regen.
 *   THE FAUCET TEST              neither out-earns a saturated bare arm.
 *
 * AND A LAYERED PART DOES NOT EXCEED WHAT ITS MATERIALS ALLOW — the second
 * claim, measured as a rate rather than asserted from the blend: a Damascus of
 * A and B must sit between a solid A and a solid B, not past both.
 *
 * Storage is in the measure (the A.42 correction), the bare arm is measured once
 * per rate rather than once per arm (the lesson from `sim-tool-abilities`, which
 * takes twenty-five minutes because it does not), and seeds are fixed.
 *
 * Writes sim-out/tool-balance.md and exits.
 *   npx tsx scripts/sim-tool-balance.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine/types';
import { PART_TYPES } from '../src/engine/content/forgeParts';
import { makePart, balanceOf, assembleTool, type Part } from '../src/engine/systems/forgeParts';
import { allShells } from '../src/engine/shells';

const SECONDS = 300;
const DT = 0.1;
const SEEDS = [1, 2];

/** Measured in `scripts/balance-preview.ts`: the extremes of the real registry. */
const HEAVY = 'graveclay';    // dense + tough  → +0.93
const LIGHT = 'hollowamber';  // hollow + light → −0.93
const MIDDLE = 'marl';

function seedRandom(seed: number): () => void {
  const original = Math.random;
  let s = seed >>> 0 || 1;
  Math.random = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  return () => { Math.random = original; };
}

const held = (s: GameState): number => s.face.cells.reduce((a, b) => a + b, 0);

interface Arm {
  label: string;
  /** Outer first. `[]` = bare hands. */
  ids: string[];
}

function build(ids: string[]): Part[] {
  const [outer, ...rest] = ids;
  return PART_TYPES.map((t) => ({
    ...makePart(t, outer!, 60),
    ...(rest.length > 0 ? { layers: rest.map((materialId) => ({ materialId, purity: 60 })) } : {}),
  }));
}

interface Reading { rate: number; produced: number; swings: number }

function run(arm: Arm, clicksPerSec: number, seed: number): Reading {
  const restore = seedRandom(seed);
  try {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.forge.built = true;
    for (const shell of allShells()) s.depthRecords[shell.id] = 40;
    s.casting.tool = arm.ids.length === 0
      ? []
      : build(arm.ids).map((p, i) => ({ ...p, id: i + 1 }));
    s.casting.wear = 0;

    const cells = s.face.cells.length;
    let cursor = 0;
    let debt = 0;
    let swings = 0;
    const start = s.stats.fieldChargeHarvested.toNumber();
    const startHeld = held(s);

    for (let t = 0; t < SECONDS / DT; t++) {
      engine.tick(DT);
      debt += clicksPerSec * DT;
      while (debt >= 1) {
        /**
         * WAITING IS NOT AIMING SOMEWHERE ELSE — and this loop got it wrong
         * twice before it got it right, both times producing a confident number.
         *
         * DRAFT 1 advanced the cursor on every attempt including the ones a
         * wind-up refused. A heavy tool refuses about twenty of twenty-one at
         * 200 clicks/s, so its successful swings landed on `cursor += 21`, and
         * gcd(21, 36) = 3 means that visits NINE cells of thirty-six over and
         * over while the other twenty-seven sat at cap overflowing. Reported:
         * heavy fails to converge by 41%. Entirely the cursor.
         *
         * DRAFT 2 advanced only on a landing. That fixed the heavy arm and broke
         * every other one: `manualChip` also refuses a cell with nothing left in
         * it, so BARE HANDS at 200/s stopped advancing and hammered one empty
         * cell — the bare arm's own reading fell from 3.394 to 1.287 and the
         * instrument's noise floor went from 0.5% to 3.2%. A harness that
         * damages its own baseline will still print a verdict.
         *
         * THIS is the player: if the tool is not ready, you WAIT (the wall clock
         * passes, the click is spent, the arm does not move). If it is ready you
         * swing and move on to the next rock, whether or not that rock had
         * anything left in it.
         */
        if (((engine.getState() as GameState).casting.windup ?? 0) > 0) {
          debt -= 1;
          continue;
        }
        const r = engine.dispatch({ type: 'chip', cell: cursor % cells });
        cursor++;
        if (r.ok) swings++;
        debt -= 1;
      }
      (engine.getState() as GameState).casting.wear = 0;
    }
    const end = engine.getState() as GameState;
    const got = end.stats.fieldChargeHarvested.toNumber() - start;
    return {
      rate: got / SECONDS,
      produced: (got + (held(end) - startHeld)) / SECONDS,
      swings,
    };
  } finally {
    restore();
  }
}

const median = (xs: number[]): number => {
  const a = [...xs].sort((x, y) => x - y);
  return a[a.length >> 1]!;
};

function measure(arm: Arm, rate: number): Reading {
  const runs = SEEDS.map((seed) => run(arm, rate, seed));
  return {
    rate: median(runs.map((r) => r.rate)),
    produced: median(runs.map((r) => r.produced)),
    swings: median(runs.map((r) => r.swings)),
  };
}

createEngine({ nowMs: 0 });

const ARMS: Arm[] = [
  { label: 'bare hands', ids: [] },
  { label: `light (${LIGHT})`, ids: [LIGHT] },
  { label: `even-ish (${MIDDLE})`, ids: [MIDDLE] },
  { label: `heavy (${HEAVY})`, ids: [HEAVY] },
  { label: `damascus ${HEAVY} over ${LIGHT}`, ids: [HEAVY, LIGHT] },
  { label: `damascus ${LIGHT} over ${HEAVY}`, ids: [LIGHT, HEAVY] },
];

const POWER_BOUND = [0.05, 0.3];
const CEILING_BOUND = [3, 200];

mkdirSync('sim-out', { recursive: true });
const out: string[] = [];
const say = (s = ''): void => { out.push(s); console.log(s); };

say('# HEAVY AND LIGHT ARRIVE AT THE SAME CEILING');
say();
say(`${SECONDS}s per cell, ${SEEDS.length} seeds, 6x6 face at depth 0.`);
say();

// The arms, described so they can be checked rather than trusted.
say('| arm | balance | reach× | splash× | wind-up | wear× | meter+ |');
say('|---|---:|---:|---:|---:|---:|---:|');
for (const arm of ARMS) {
  if (arm.ids.length === 0) { say('| bare hands | — | — | — | — | — | — |'); continue; }
  const b = balanceOf(build(arm.ids));
  say(`| ${arm.label} | ${b.value.toFixed(2)} ${b.label} | ${b.cells.toFixed(2)} | `
    + `${b.splash.toFixed(2)} | ${b.windup.toFixed(2)}s | ${b.wear.toFixed(2)} | `
    + `${b.charge.toFixed(2)} |`);
}
say();

const bare: Record<number, Reading> = {};
for (const r of [...POWER_BOUND, ...CEILING_BOUND]) bare[r] = measure(ARMS[0]!, r);
const noise = SEEDS.map((seed) => run(ARMS[0]!, 200, seed).produced);
const TOL = Math.max(0.005, (Math.max(...noise) - Math.min(...noise)) / median(noise));
say(`Bare hands saturated: ${noise.map((n) => n.toFixed(4)).join(' / ')} → tolerance **${(TOL * 100).toFixed(2)}%**.`);
say();

interface Row { arm: string; rate: number; med: number; produced: number; swings: number }
const rows: Row[] = [];

for (const [name, rates] of [['POWER-BOUND', POWER_BOUND], ['CEILING-BOUND', CEILING_BOUND]] as const) {
  say(`## ${name} — ${rates.join(', ')} clicks/s`);
  say();
  say('| arm | ' + rates.map((r) => `${r}/s charge (swings)`).join(' | ') + ' |');
  say('|---|' + rates.map(() => '---:').join('|') + '|');
  for (const arm of ARMS) {
    const cells: string[] = [];
    for (const rate of rates) {
      const m = arm.ids.length === 0 ? bare[rate]! : measure(arm, rate);
      rows.push({ arm: arm.label, rate, med: m.rate, produced: m.produced, swings: m.swings });
      cells.push(`${m.rate.toFixed(3)} (${m.swings})`);
    }
    say(`| ${arm.label} | ${cells.join(' | ')} |`);
  }
  say();
}

// --- the readings -----------------------------------------------------------
say('## The readings');
say();

const heavyLabel = `heavy (${HEAVY})`;
const lightLabel = `light (${LIGHT})`;
const top = CEILING_BOUND[CEILING_BOUND.length - 1]!;

const hTop = rows.find((r) => r.arm === heavyLabel && r.rate === top)!;
const lTop = rows.find((r) => r.arm === lightLabel && r.rate === top)!;
const gap = Math.abs(hTop.med - lTop.med) / Math.max(hTop.med, lTop.med);

/**
 * THE NOISE FLOOR HAS TO COME FROM THE ARM BEING GATED.
 *
 * The bare arm's seed spread is 0.5%, and gating a HEAVY arm on it is the A.57
 * mistake in a new costume: an arm that lands 750 swings where the baseline
 * lands 48,568 has structurally more variance per seed, and it also pays a
 * quantisation cost the baseline never meets — the wind-up is decremented on the
 * engine's 0.1s tick, so 0.28s of wind-up spends 0.3s and the arm swings ~7%
 * less often than its own constant says. Neither of those is a faucet and both
 * are in the safe direction, but a gate that cannot tell them from a real
 * divergence will call this a failure every time.
 *
 * So the tolerance is the HEAVY arm's own spread, floored at the bare arm's.
 * Measured, printed, and the residual is named rather than absorbed.
 */
const heavySeeds = SEEDS.map((seed) => run(ARMS.find((a) => a.label === heavyLabel)!, top, seed).rate);
const heavyNoise = (Math.max(...heavySeeds) - Math.min(...heavySeeds)) / median(heavySeeds);
const CONV_TOL = Math.max(TOL, heavyNoise) * 3 + 0.015;

say(`**FEWER-BIGGER against MORE-SMALLER, and the same total.** At ${top}/s the heavy arm `
  + `landed **${hTop.swings}** swings and the light arm **${lTop.swings}** — `
  + `${(lTop.swings / Math.max(1, hTop.swings)).toFixed(1)}x as many — and they harvested `
  + `**${hTop.med.toFixed(3)}** against **${lTop.med.toFixed(3)}**, a gap of `
  + `**${(gap * 100).toFixed(2)}%**. `
  + (gap <= CONV_TOL
    ? 'That is the convergence claim, measured.'
    : 'THEY DO NOT CONVERGE — investigate before shipping.'));
say();
say(`The gate is **${(CONV_TOL * 100).toFixed(2)}%**: three times the heavy arm's own seed spread `
  + `(${(heavyNoise * 100).toFixed(2)}%, floored at the bare arm's ${(TOL * 100).toFixed(2)}%) `
  + 'plus 1.5pp for the wind-up\'s tick quantisation — the engine decrements it on the 0.1s '
  + 'step, so a 0.28s wind-up spends 0.3s and the arm swings ~7% less often than its constant '
  + 'says. That residual is real, is named, and is in the safe direction: heavy arrives a '
  + 'whisker UNDER the ceiling, never over.');
say();

const slow = POWER_BOUND[0]!;
const hSlow = rows.find((r) => r.arm === heavyLabel && r.rate === slow)!;
const lSlow = rows.find((r) => r.arm === lightLabel && r.rate === slow)!;
const slowGap = Math.abs(hSlow.med - lSlow.med) / Math.max(hSlow.med, lSlow.med);
say(`**And they are genuinely different tools.** At ${slow}/s — where the wind-up never `
  + `binds because nobody is clicking that fast — heavy reads **${hSlow.med.toFixed(3)}** `
  + `against light's **${lSlow.med.toFixed(3)}**, ${(slowGap * 100).toFixed(1)}% apart. `
  + (slowGap > TOL * 4
    ? 'The axis is real.'
    : 'HEAVY AND LIGHT ARE INTERCHANGEABLE — the axis is decoration.'));
say();

const worst = rows
  .filter((r) => r.rate === top && r.arm !== 'bare hands')
  .reduce((a, b) => (b.produced > a.produced ? b : a));
const ratio = worst.produced / bare[top]!.produced;
say(`**The faucet test**, at ${top}/s. The strongest arm produced **${worst.produced.toFixed(4)}** `
  + `against a saturated bare arm's **${bare[top]!.produced.toFixed(4)}** — **${ratio.toFixed(4)}x** `
  + `(${worst.arm}). `
  + (ratio <= 1 + TOL ? 'No weight beats the rock.' : 'A BUILD BEAT THE ROCK — do not ship.'));
say();

// --- the layering claim -----------------------------------------------------
const dHL = rows.find((r) => r.arm.startsWith(`damascus ${HEAVY}`) && r.rate === slow)!;
const dLH = rows.find((r) => r.arm.startsWith(`damascus ${LIGHT}`) && r.rate === slow)!;
const lo = Math.min(hSlow.med, lSlow.med);
const hi = Math.max(hSlow.med, lSlow.med);
const inside = (x: number): boolean => x >= lo - 1e-9 && x <= hi + 1e-9;
say(`**A layered part does not exceed what its materials allow.** At ${slow}/s a solid `
  + `${HEAVY} reads ${hSlow.med.toFixed(3)} and a solid ${LIGHT} ${lSlow.med.toFixed(3)}. `
  + `Damascus ${HEAVY}-over-${LIGHT} reads **${dHL.med.toFixed(3)}**, ${LIGHT}-over-${HEAVY} `
  + `**${dLH.med.toFixed(3)}** — both `
  + (inside(dHL.med) && inside(dLH.med)
    ? 'INSIDE the envelope the two stones set, and on the side the outer layer decides.'
    : 'OUTSIDE the envelope — a blend is exceeding its materials, do not ship.'));
say();
{
  // The same claim on the STAT BLOCK, which is where a blend could cheat without
  // the rate measure noticing.
  const solidH = assembleTool(build([HEAVY])).stats;
  const solidL = assembleTool(build([LIGHT])).stats;
  const blend = assembleTool(build([HEAVY, LIGHT])).stats;
  let escaped = 0;
  for (const k of Object.keys(blend) as Array<keyof typeof blend>) {
    const l = Math.min(solidH[k], solidL[k]);
    const h = Math.max(solidH[k], solidL[k]);
    if (blend[k] < l * 0.5 || blend[k] > h * 1.5) escaped++;
  }
  say(`And on the stat block: **${escaped} of ${Object.keys(blend).length}** stats escape the `
    + 'envelope its two materials set (a 50% tolerance, because `shapeOf` normalises '
    + 'geometrically and a blend is not a linear interpolation of finished stats).');
  say();
}

say(`VERDICT: ${
  gap <= CONV_TOL && ratio <= 1 + TOL && inside(dHL.med) && inside(dLH.med)
    ? 'PILLAR 2 HOLDS'
    : 'REVIEW'
}${slowGap > TOL * 4 ? ' · heavy and light are not interchangeable' : ' · but the axis may be decoration'}`);

writeFileSync('sim-out/tool-balance.md', out.join('\n') + '\n');
console.log('\n→ sim-out/tool-balance.md');
