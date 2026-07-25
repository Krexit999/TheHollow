/**
 * THE FIRST TIER WALL — drops-to-crossable, and its VARIANCE.
 *
 * The ruling: hold tier walls to the keystone idle standard — a low
 * single-digit idle-to-active ratio, and not RNG-swingy. The named cause was
 * the rich band's depth coupling: rich cannot drop above depth 10, and every
 * Collapse puts the player back at depth 0, so the binding input for tier II
 * only earned during part of each cycle.
 *
 * This measures the thing the ruling cares about. It drives the ENGINE'S OWN
 * drop roller along a realistic collapse cycle (climb, reset, climb) and counts
 * the drops needed before ANY tier-II recipe can be paid — median and spread
 * across many trials, for the rich-only ladder and for the ladder with its new
 * commons floor.
 *
 *   npx tsx scripts/probe-idle-forge.ts [trials]
 */
import { createEngine } from '../src/engine';
import { D } from '../src/engine/decimal';
import { rollDrop } from '../src/engine/materials';
import { applyDrop } from '../src/engine/systems/drops';
import { materialCount, TOOL_RECIPES } from '../src/engine/systems/forge';
import type { GameState } from '../src/engine/types';

const TRIALS = Number(process.argv[2] ?? 40);
const CAP = 4000; // give up after this many drops
const ctx = { emit: () => {}, dirty: () => {} };

/** The idle cycle: climb 0 -> 44 over ~90 drops, Collapse, climb again. */
function depthAt(i: number): number {
  const CYCLE = 90;
  return Math.min(44, Math.floor(((i % CYCLE) / CYCLE) * 60));
}

const payable = (s: GameState, ids: string[]): string | null => {
  for (const id of ids) {
    const r = TOOL_RECIPES.find((x) => x.id === id)!;
    if (Object.entries(r.inputs).every(([m, n]) => materialCount(s, m) >= n)) return id;
  }
  return null;
};

/** Drops needed before one of `ids` can be paid, on one RNG trial. */
function dropsUntil(ids: string[]): number {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.currencies['brick'] = D(1e6);
  for (let i = 0; i < CAP; i++) {
    s.depth = depthAt(i);
    applyDrop(s, ctx, rollDrop('loam', s.depth));
    if (payable(s, ids)) return i + 1;
  }
  return CAP;
}

function stats(ids: string[], label: string): void {
  const runs: number[] = [];
  for (let t = 0; t < TRIALS; t++) runs.push(dropsUntil(ids));
  runs.sort((a, b) => a - b);
  const at = (p: number) => runs[Math.min(runs.length - 1, Math.floor(p * runs.length))]!;
  const med = at(0.5);
  const p10 = at(0.1);
  const p90 = at(0.9);
  const fails = runs.filter((r) => r >= CAP).length;
  console.log(
    `${label.padEnd(34)} median ${String(med).padStart(4)} drops | p10 ${String(p10).padStart(4)} | p90 ${String(p90).padStart(4)}` +
    ` | spread ${(p90 / Math.max(1, p10)).toFixed(2)}x${fails ? ` | ${fails}/${TRIALS} NEVER PAID` : ''}`,
  );
}

const tier2 = TOOL_RECIPES.filter((r) => r.tier === 2).map((r) => r.id);
const rich = tier2.filter((id) => id !== 'chalkhead');

console.log(`--- drops needed to cross the depth-45 wall (${TRIALS} trials, collapse cycling) ---`);
stats(['loamironPick'], 'loamironPick alone (the old path)');
stats(rich, 'any rich tier-II (pre-fix ladder)');
stats(tier2, 'any tier-II incl. commons floor');
console.log('\ncommons floor recipe:', JSON.stringify(TOOL_RECIPES.find((r) => r.id === 'chalkhead')?.inputs));
