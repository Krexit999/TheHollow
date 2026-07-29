/**
 * THE CHARACTER LAYER DOES NOT MOVE THE CEILING — measured.
 *
 * The brief's ask is narrow and so is this: living-material maturation and
 * masterwork bonuses are reach, utility and slots, so a fully grown, fully
 * masterworked tool must arrive at `W x H x regen` like everything else. And
 * the BIOGRAPHY grants nothing at all, which makes it inert to a sim — so the
 * honest thing is to prove the inertness EXACTLY rather than measure it
 * statistically, which is what the equality arm below does.
 *
 * Lean, like the feature: four arms, two rates, two seeds. The bare arm is
 * measured once per rate (the lesson `sim-tool-abilities` paid for).
 *
 * Writes sim-out/tool-character.md and exits.
 *   npx tsx scripts/sim-tool-character.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine/types';
import {
  GROWTH_BOONS, MASTERWORKS, PART_TYPES, type GrowthBoonId,
} from '../src/engine/content/forgeParts';
import { makePart, type Part } from '../src/engine/systems/forgeParts';
import { startBio } from '../src/engine/systems/toolBio';
import { materialsOfShell } from '../src/engine/materials';
import { allShells } from '../src/engine/shells';

const SECONDS = 300;
const DT = 0.1;
const SEEDS = [1, 2];

const LIVE = materialsOfShell('verdance')[0]!.id;

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
  /** null = bare hands. */
  stone: string | null;
  boons?: GrowthBoonId[];
  masterwork?: boolean;
  /** A long invented history, to prove it changes nothing. */
  history?: boolean;
}

function build(arm: Arm): Part[] {
  if (arm.stone === null) return [];
  return PART_TYPES.map((t, i) => ({
    ...makePart(t, arm.stone!, 60),
    ...(arm.boons ? { grown: arm.boons } : {}),
    ...(arm.masterwork
      ? { craft: 'masterwork' as const, work: MASTERWORKS[i % MASTERWORKS.length]!.id }
      : {}),
  }));
}

interface Reading { rate: number; produced: number }

function run(arm: Arm, clicksPerSec: number, seed: number): Reading {
  const restore = seedRandom(seed);
  try {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.forge.built = true;
    for (const shell of allShells()) s.depthRecords[shell.id] = 40;
    s.casting.tool = build(arm).map((p, i) => ({ ...p, id: i + 1 }));
    s.casting.wear = 0;
    if (arm.stone !== null) {
      startBio(s);
      if (arm.history) {
        /**
         * ONLY THE BIOGRAPHY'S OWN FIELDS, and the first version of this got it
         * badly wrong.
         *
         * It also did `collapse.count += 200` and `relics.found += 300` — on the
         * reasoning that a long history means a long game. But those are LIVE
         * GAME COUNTERS with real systems hanging off them (the Core tree, the
         * relic and museum bonuses), not biography fields. So the arm was not
         * "the same tool with a history", it was "a save two hundred collapses
         * deep", and it read 1.19x the ceiling. Reported: the biography is
         * reaching something it must not. It was not; the harness was handing it
         * a different game.
         *
         * The two derived lines are read-only subtractions inside `readBio` and
         * are called by nothing but the panel, so they cannot grant anything by
         * construction. What needs proving is that the STORED fields do not, and
         * that is exactly what this now varies.
         */
        Object.assign(s.casting.bio!, {
          cells: 9_999_999, swings: 500_000, secondsHeld: 400_000, fired: 20_000,
          rebuilds: 40, deepestShell: 'aleph', deepestDepth: 900,
          shells: allShells().map((x) => x.id),
          atCollapses: -200,
          atRelics: -300,
        });
      }
    }

    const cells = s.face.cells.length;
    let cursor = 0;
    let debt = 0;
    const start = s.stats.fieldChargeHarvested.toNumber();
    const startHeld = held(s);

    for (let t = 0; t < SECONDS / DT; t++) {
      engine.tick(DT);
      debt += clicksPerSec * DT;
      while (debt >= 1) {
        // Waiting is not aiming elsewhere — the balance sim's third draft.
        if (((engine.getState() as GameState).casting.windup ?? 0) > 0) { debt -= 1; continue; }
        engine.dispatch({ type: 'chip', cell: cursor % cells });
        cursor++;
        debt -= 1;
      }
      (engine.getState() as GameState).casting.wear = 0;
    }
    const end = engine.getState() as GameState;
    const got = end.stats.fieldChargeHarvested.toNumber() - start;
    return { rate: got / SECONDS, produced: (got + (held(end) - startHeld)) / SECONDS };
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
  };
}

createEngine({ nowMs: 0 });

const ARMS: Arm[] = [
  { label: 'bare hands', stone: null },
  { label: `living stock (${LIVE}), nothing taken`, stone: LIVE },
  { label: 'fully grown — reach ×3 on every part', stone: LIVE, boons: ['reach', 'reach', 'reach'] },
  { label: 'fully grown — supple ×3 on every part', stone: LIVE, boons: ['supple', 'supple', 'supple'] },
  { label: 'every part a MASTERWORK', stone: LIVE, masterwork: true },
  {
    label: 'GROWN + MASTERWORK + a long history',
    stone: LIVE, boons: ['reach', 'supple', 'mending'], masterwork: true, history: true,
  },
];

const POWER_BOUND = [0.05, 0.3];
const CEILING_BOUND = [3, 200];

mkdirSync('sim-out', { recursive: true });
const out: string[] = [];
const say = (s = ''): void => { out.push(s); console.log(s); };

say('# THE CHARACTER LAYER DOES NOT MOVE THE CEILING');
say();
say(`${SECONDS}s per cell, ${SEEDS.length} seeds, 6x6 face at depth 0.`);
say(`Living stock: **${LIVE}**. Boons: ${GROWTH_BOONS.map((b) => b.name).join(', ')}.`);
say();

const bare: Record<number, Reading> = {};
for (const r of [...POWER_BOUND, ...CEILING_BOUND]) bare[r] = measure(ARMS[0]!, r);
const noise = SEEDS.map((seed) => run(ARMS[0]!, 200, seed).produced);
const TOL = Math.max(0.005, (Math.max(...noise) - Math.min(...noise)) / median(noise));
say(`Bare hands saturated: ${noise.map((n) => n.toFixed(4)).join(' / ')} → tolerance **${(TOL * 100).toFixed(2)}%**.`);
say();

interface Row { arm: string; rate: number; med: number; produced: number }
const rows: Row[] = [];

for (const [name, rates] of [['POWER-BOUND', POWER_BOUND], ['CEILING-BOUND', CEILING_BOUND]] as const) {
  say(`## ${name} — ${rates.join(', ')} clicks/s`);
  say();
  say('| arm | ' + rates.map((r) => `${r}/s`).join(' | ') + ' |');
  say('|---|' + rates.map(() => '---:').join('|') + '|');
  for (const arm of ARMS) {
    const cells: string[] = [];
    for (const rate of rates) {
      const m = arm.stone === null ? bare[rate]! : measure(arm, rate);
      rows.push({ arm: arm.label, rate, med: m.rate, produced: m.produced });
      cells.push(`${m.rate.toFixed(3)} (${(m.rate / bare[rate]!.rate).toFixed(3)}×)`);
    }
    say(`| ${arm.label} | ${cells.join(' | ')} |`);
  }
  say();
}

say('## The readings');
say();

const top = CEILING_BOUND[CEILING_BOUND.length - 1]!;
const atTop = rows.filter((r) => r.rate === top && r.arm !== 'bare hands');
const worst = atTop.reduce((a, b) => (b.produced > a.produced ? b : a));
const ratio = worst.produced / bare[top]!.produced;
say(`**The faucet test**, at ${top}/s where bare hands are on their plateau. The strongest arm `
  + `produced **${worst.produced.toFixed(4)}** against bare hands' **${bare[top]!.produced.toFixed(4)}** `
  + `— **${ratio.toFixed(4)}×** (${worst.arm}). `
  + (ratio <= 1 + TOL
    ? 'No boon and no masterwork beats the rock.'
    : 'SOMETHING BEAT THE ROCK — do not ship.'));
say();

const spread = (Math.max(...atTop.map((r) => r.med)) - Math.min(...atTop.map((r) => r.med)))
  / median(atTop.map((r) => r.med));
say(`**And they converge.** At ${top}/s the five tool arms span **${(spread * 100).toFixed(2)}pp** `
  + `against a ${(TOL * 100).toFixed(2)}% instrument. `
  + (spread <= TOL * 3
    ? 'Growth and craftsmanship change how you get there, not where it is.'
    : 'THEY DO NOT CONVERGE — investigate.'));
say();

/**
 * THE BIOGRAPHY, PROVED EXACTLY RATHER THAN MEASURED.
 *
 * A statistical claim about something that should be BIT-IDENTICAL is the weaker
 * test: two seeded runs of the same arm with and without a history must produce
 * the same number to the last float, and if they do not, no tolerance makes that
 * acceptable. So this compares them directly.
 */
{
  const withHist: Arm = {
    label: 'x', stone: LIVE, boons: ['reach', 'supple', 'mending'], masterwork: true, history: true,
  };
  const without: Arm = { ...withHist, history: false };
  let identical = true;
  const pairs: string[] = [];
  for (const rate of [...POWER_BOUND, ...CEILING_BOUND]) {
    for (const seed of SEEDS) {
      const a = run(withHist, rate, seed).rate;
      const b = run(without, rate, seed).rate;
      if (a !== b) identical = false;
      pairs.push(`${rate}/s seed ${seed}: ${a.toFixed(6)} vs ${b.toFixed(6)}`);
    }
  }
  say('**The biography grants nothing, and this is an equality not a tolerance.** The same '
    + 'arm, one carrying a nine-million-cell history across seven shells and two hundred '
    + 'collapses, one carrying none:');
  say();
  for (const p of pairs) say(`  - ${p}`);
  say();
  say(identical
    ? 'Identical to the last float at every rate and seed. It is information.'
    : 'NOT IDENTICAL — the biography is reaching something it must not.');
  say();

  say(`VERDICT: ${
    ratio <= 1 + TOL && spread <= TOL * 3 && identical ? 'PILLAR 2 HOLDS' : 'REVIEW'
  }`);
}

writeFileSync('sim-out/tool-character.md', out.join('\n') + '\n');
console.log('\n→ sim-out/tool-character.md');
