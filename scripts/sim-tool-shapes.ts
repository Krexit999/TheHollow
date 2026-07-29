/**
 * PILLAR 2 UNDER EVERY CAST SHAPE — measured, not argued.
 *
 * THE CLAIM: a shape moves cells around; it cannot make a cell hold more. So a
 * Needle, a Wide and a Crescent should reach the ceiling by different routes
 * and arrive at the same place.
 *
 * A SEPARATE, LEANER SCRIPT than `sim-tool-abilities.ts` on purpose. That one
 * re-measures its bare arm once per arm per rate, which was tolerable at five
 * arms and is twenty-five minutes at eight; adding six shapes to it would have
 * made it an hour. This measures the bare arm ONCE per rate and reuses it,
 * which is the same reading for a fraction of the wall clock.
 *
 * Storage is in the measure (the A.42 correction): a window that ends with less
 * in the rock than it started SPENT that difference, and counting only what
 * came out reads it as production.
 *
 * Writes sim-out/tool-shapes.md and exits.
 *   npx tsx scripts/sim-tool-shapes.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine/types';
import { PART_TYPES, shapesFor, type PartShape } from '../src/engine/content/forgeParts';
import { makePart } from '../src/engine/systems/forgeParts';
import { allShells } from '../src/engine/shells';
import { classOf } from '../src/engine/systems/toolClass';
import { assembleTool } from '../src/engine/systems/forgeParts';

const SECONDS = 300;
const DT = 0.1;
const SEEDS = [1, 2];
const STONE = 'marl';

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

interface Reading { rate: number; produced: number }

function run(head: PartShape | null, clicksPerSec: number, seed: number): Reading {
  const restore = seedRandom(seed);
  try {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.forge.built = true;
    for (const shell of allShells()) s.depthRecords[shell.id] = 40;
    s.casting.tool = head === null
      ? []
      : PART_TYPES.map((t, i) => ({
        ...makePart(t, STONE, 60, t === 'head' ? head : undefined), id: i + 1,
      }));
    s.casting.wear = 0;

    const cells = s.face.cells.length;
    let cursor = 0;
    let debt = 0;
    const start = s.stats.fieldChargeHarvested.toNumber();
    const startHeld = held(s);

    for (let t = 0; t < SECONDS / DT; t++) {
      engine.tick(DT);
      debt += clicksPerSec * DT;
      while (debt >= 1) {
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

function measure(head: PartShape | null, rate: number): { rate: number; produced: number } {
  const runs = SEEDS.map((seed) => run(head, rate, seed));
  return {
    rate: median(runs.map((r) => r.rate)),
    produced: median(runs.map((r) => r.produced)),
  };
}

createEngine({ nowMs: 0 });

const POWER_BOUND = [0.05, 0.2];
const CEILING_BOUND = [2, 200];
const HEADS = shapesFor('head');

mkdirSync('sim-out', { recursive: true });
const out: string[] = [];
const say = (s = ''): void => { out.push(s); console.log(s); };

say('# PILLAR 2 — a shape moves cells, it does not make them');
say();
say(`${SECONDS}s per cell, ${SEEDS.length} seeds, 6x6 face at depth 0. Charge per second.`);
say(`Every arm is the SAME stone (${STONE}) at the same purity — only the head's mould differs,`);
say('so the stat block is identical across the table and the geometry is the only variable.');
say();

// The class the test stone lands in, printed so the arm is inspectable.
{
  const tool = assembleTool(PART_TYPES.map((t) => makePart(t, STONE, 60)));
  const read = classOf(tool);
  say(`Class of the arm: **${read.def?.name ?? 'none'}**` +
    (read.why ? ` (${read.why})` : '') +
    `, coherence ${read.coherence.toFixed(2)}.`);
  say();
}

const bare: Record<number, { rate: number; produced: number }> = {};
for (const r of [...POWER_BOUND, ...CEILING_BOUND]) bare[r] = measure(null, r);

const noise = SEEDS.map((seed) => run(null, 200, seed).produced);
const noisePp = (Math.max(...noise) - Math.min(...noise)) / median(noise);
const TOL = Math.max(0.005, noisePp);
say(`Bare hands saturated, per seed: ${noise.map((n) => n.toFixed(4)).join(' / ')} ` +
  `→ tolerance **${(TOL * 100).toFixed(2)}%**.`);
say();

interface Row { head: PartShape; rate: number; med: number; produced: number }
const rows: Row[] = [];

for (const [name, rates] of [['POWER-BOUND', POWER_BOUND], ['CEILING-BOUND', CEILING_BOUND]] as const) {
  say(`## ${name} — ${rates.join(', ')} clicks/s`);
  say();
  say('| head | ' + rates.map((r) => `${r}/s`).join(' | ') + ' |');
  say('|---|' + rates.map(() => '---:').join('|') + '|');
  say(`| bare hands | ${rates.map((r) => bare[r]!.rate.toFixed(3)).join(' | ')} |`);
  for (const head of HEADS) {
    const cells: string[] = [];
    for (const rate of rates) {
      const m = measure(head.id, rate);
      rows.push({ head: head.id, rate, med: m.rate, produced: m.produced });
      cells.push(`${m.rate.toFixed(3)} (${(m.rate / bare[rate]!.rate).toFixed(3)}×)`);
    }
    say(`| ${head.name} | ${cells.join(' | ')} |`);
  }
  say();
}

// --- the readings -----------------------------------------------------------
say('## The readings');
say();

const top = CEILING_BOUND[CEILING_BOUND.length - 1]!;
const atTop = rows.filter((r) => r.rate === top);
const spread = (Math.max(...atTop.map((r) => r.med)) - Math.min(...atTop.map((r) => r.med)))
  / median(atTop.map((r) => r.med));
say(`**They all arrive at the same place.** At ${top}/s the six heads span ` +
  `**${(spread * 100).toFixed(2)}pp** against a ${(TOL * 100).toFixed(2)}% instrument. ` +
  (spread <= TOL * 3
    ? 'Different routes, same ceiling — which is the whole claim.'
    : 'THEY DO NOT CONVERGE — investigate before shipping.'));
say();

const worst = atTop.reduce((a, b) => (b.produced > a.produced ? b : a));
const ratio = worst.produced / bare[top]!.produced;
say(`**The faucet test**, at ${top}/s where bare hands are on their plateau. ` +
  `The strongest head produced **${worst.produced.toFixed(4)}** against bare hands' ` +
  `**${bare[top]!.produced.toFixed(4)}** — **${ratio.toFixed(4)}×** (${worst.head}). ` +
  (ratio <= 1 + TOL
    ? 'No shape beats the rock.'
    : 'A SHAPE BEAT THE ROCK — do not ship.'));
say();

// AND THAT THEY ARE NOT ALL THE SAME THING, which is the other half: a shape
// axis where every option measures identically at every rate is decoration.
const slow = POWER_BOUND[0]!;
const atSlow = rows.filter((r) => r.rate === slow);
const slowSpread = (Math.max(...atSlow.map((r) => r.med)) - Math.min(...atSlow.map((r) => r.med)))
  / median(atSlow.map((r) => r.med));
const best = atSlow.reduce((a, b) => (b.med > a.med ? b : a));
const least = atSlow.reduce((a, b) => (b.med < a.med ? b : a));
say(`**And they are genuinely different tools.** At ${slow}/s — where there is banked ` +
  `regen to collect and the geometry matters — the heads span **${(slowSpread * 100).toFixed(1)}%**: ` +
  `${best.head} at ${best.med.toFixed(3)} against ${least.head} at ${least.med.toFixed(3)}. ` +
  (slowSpread > TOL * 4
    ? 'The axis is real.'
    : 'THE SHAPES ARE INTERCHANGEABLE — the axis is decoration.'));
say();
say('Note the Needle reads LOWEST on raw charge and is not therefore worse: it trades ' +
  'reach for pocket speed, wear and ability charge, none of which this table measures. ' +
  'A shape sim can only ever price the axis it moves.');
say();
say(`VERDICT: ${ratio <= 1 + TOL && spread <= TOL * 3 ? 'PILLAR 2 HOLDS' : 'REVIEW'}` +
  `${slowSpread > TOL * 4 ? ' · the shapes are not interchangeable' : ' · but the shapes may be decoration'}`);

writeFileSync('sim-out/tool-shapes.md', out.join('\n') + '\n');
console.log('\n→ sim-out/tool-shapes.md');
