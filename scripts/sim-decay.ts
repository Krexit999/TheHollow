/**
 * COMPACTION DECAY — the physics change, measured as one.
 *
 * Two jobs, one harness, because they must share a play policy or the numbers
 * are not comparable:
 *
 *   A  DEEP-ENTRY YIELD PER HOUR, PER MATERIAL, decay off vs decay on. This is
 *      a reach change to the scarcest resource in the game and the brief is
 *      explicit that it must not be assumed neutral. Both numbers get reported.
 *   B  THE THREE-POLICY FORK TABLE per row, with decay live, at a sample budget
 *      large enough that the verdicts stop moving.
 *
 * THE ENGINE RNG IS SEEDED, and that is the fix for the fourth harness bug in
 * this line of work: `SEEDS` used to perturb only the starting cell while the
 * engine's own `Math.random` (compaction rolls, ore, crits, deep-entry gates)
 * ran unseeded, so a "median of 3 seeds" was three noisy independent samples
 * and the verdicts did not reproduce run to run. `Math.random` is replaced with
 * a seeded mulberry32 for the duration of each arm and restored afterwards, so
 * two arms with the same seed see the same world and differ ONLY by policy.
 *
 * THE HAND CONCENTRATES. A rotating six-cell working set, not round-robin
 * across all 36 — the standing rule for any sim touching a per-cell counter,
 * because spreading chips evenly models a player who never does the thing being
 * tested.
 *
 *   npx tsx scripts/sim-decay.ts
 */
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine/types';
import { allUpgrades, nextCost, upgradeLevel } from '../src/engine/upgrades';
import { currentDescendCost } from '../src/engine/systems/depthSys';
import { ModifierCache } from '../src/engine/modifiers';
import { DECAY_TUNING } from '../src/engine/systems/compaction';
import type { Branch, ForkedRow } from '../src/engine/systems/shopFork';
import { D } from '../src/engine/decimal';

const MINUTES = 90;
const STEP = 0.1;
const ROWS: ForkedRow[] = ['blade', 'soil', 'roots'];
const DEEP_IDS = ['umberjade', 'graveclaydeep', 'deepgrave'] as const;

type Policy = 'income' | 'packed' | 'switch';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Early: the stair is the binding constraint. Late: the board is what is left. */
function switchBranch(s: GameState): Branch {
  return s.depth >= 30 ? 'packed' : 'income';
}

interface Result {
  deep: Record<string, number>;
  deepTotal: number;
  depth: number;
  collapses: number;
  packedBuys: number;
}

function run(policy: Policy, only: ForkedRow | null, seed: number, decay: boolean): Result {
  const realRandom = Math.random;
  Math.random = mulberry32(seed);
  const wasEnabled = DECAY_TUNING.enabled;
  DECAY_TUNING.enabled = decay;
  try {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    const mods = new ModifierCache();
    let cursor = 0;
    let packedBuys = 0;
    let window0 = 0;

    for (let t = 0; t < MINUTES * 60; t += STEP) {
      engine.tick(STEP);
      // THE CONCENTRATED HAND: six cells, worked down, then move on.
      if (Math.floor(t / 0.5) !== Math.floor((t - STEP) / 0.5)) {
        const n = s.face.w * s.face.h;
        const W = 6;
        const base = (window0 * W) % n;
        engine.dispatch({ type: 'chip', cell: (base + (cursor % W)) % n });
        cursor++;
        const comp = s.face.compaction ?? [];
        let deepEnough = true;
        for (let k = 0; k < W; k++) if ((comp[(base + k) % n] ?? 0) < 20) { deepEnough = false; break; }
        if (deepEnough) window0++;
      }
      if (Math.floor(t) !== Math.floor(t - STEP)) {
        mods.invalidate();
        const branch: Branch = policy === 'switch' ? switchBranch(s) : policy;
        for (const id of ROWS) {
          const def = allUpgrades().find((u) => u.id === id)!;
          const lv = upgradeLevel(s, id);
          if (lv >= def.maxLevel) continue;
          if ((s.currencies['dust'] ?? D(0)).lt(nextCost(def, lv))) continue;
          const b: Branch = only === null || id === only ? branch : 'income';
          if (engine.dispatch({ type: 'buyUpgrade', id, branch: b }).ok && b === 'packed') packedBuys++;
        }
        while ((s.currencies['dust'] ?? D(0)).gte(currentDescendCost(s, mods).mul(1.5))) {
          if (!engine.dispatch({ type: 'descend' }).ok) break;
          mods.invalidate();
        }
        if (s.depth >= 40) engine.dispatch({ type: 'collapse' });
      }
    }

    const deep: Record<string, number> = {};
    let deepTotal = 0;
    for (const id of DEEP_IDS) {
      let n = 0;
      for (const b of Object.values(s.materials.stacks[id] ?? {})) n += b?.count ?? 0;
      deep[id] = n;
      deepTotal += n;
    }
    return { deep, deepTotal, depth: s.maxDepthRecord, collapses: s.collapse.count, packedBuys };
  } finally {
    Math.random = realRandom;
    DECAY_TUNING.enabled = wasEnabled;
  }
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const N = Number(process.env['SIM_N'] ?? 9);
const SEEDS = Array.from({ length: N }, (_, i) => 1000 + i * 7919);
const perHour = (x: number): number => x / (MINUTES / 60);

// ───────────────────────────────────────────────────────────────────────────
// A. DEEP-ENTRY YIELD PER HOUR, PER MATERIAL — decay off vs on
// ───────────────────────────────────────────────────────────────────────────
console.log(`DEEP-ENTRY YIELD / HOUR, per material. ${MINUTES}m arms, median of ${N} seeds.`);
console.log('An ordinary player: income branch throughout, the same hand in both.\n');
console.log('decay    umberjade  graveclaydeep  deepgrave    TOTAL   colls');
const yields: Record<string, Record<string, number>> = {};
for (const decay of [false, true]) {
  const rs = SEEDS.map((sd) => run('income', null, sd, decay));
  const row: Record<string, number> = {};
  for (const id of DEEP_IDS) row[id] = perHour(median(rs.map((r) => r.deep[id] ?? 0)));
  const total = perHour(median(rs.map((r) => r.deepTotal)));
  const colls = median(rs.map((r) => r.collapses));
  yields[decay ? 'on' : 'off'] = { ...row, total };
  console.log(
    `${(decay ? 'ON ' : 'OFF').padEnd(8)} ${row['umberjade']!.toFixed(1).padStart(9)}`
    + ` ${row['graveclaydeep']!.toFixed(1).padStart(14)}`
    + ` ${row['deepgrave']!.toFixed(1).padStart(10)}`
    + ` ${total.toFixed(1).padStart(8)} ${String(colls).padStart(7)}`,
  );
}
const dTot = (yields['on']!['total']! / Math.max(1e-9, yields['off']!['total']!) - 1) * 100;
console.log(`\n  total deep-entry yield change: ${dTot >= 0 ? '+' : ''}${dTot.toFixed(1)}%`);
for (const id of DEEP_IDS) {
  const d = (yields['on']![id]! / Math.max(1e-9, yields['off']![id]!) - 1) * 100;
  console.log(`    ${id.padEnd(15)} ${d >= 0 ? '+' : ''}${d.toFixed(1)}%`);
}

// ───────────────────────────────────────────────────────────────────────────
// B. THE FORKS, WITH DECAY LIVE
// ───────────────────────────────────────────────────────────────────────────
console.log(`\n\nSHOP FORKS with decay live. Median of ${N} seeds, engine RNG seeded.\n`);
console.log('row      policy            DEEP  depth  colls  packedBuys');
const verdicts: string[] = [];
for (const row of ROWS) {
  const out: Record<Policy, Result[]> = { income: [], packed: [], switch: [] };
  for (const p of ['income', 'packed', 'switch'] as Policy[]) {
    for (const sd of SEEDS) out[p].push(run(p, row, sd, true));
  }
  const med = (p: Policy) => median(out[p].map((r) => r.deepTotal));
  for (const p of ['income', 'packed', 'switch'] as Policy[]) {
    console.log(
      `${row.padEnd(8)} always-${p.padEnd(10)} ${String(med(p)).padStart(5)}`
      + ` ${String(median(out[p].map((x) => x.depth))).padStart(6)}`
      + ` ${String(median(out[p].map((x) => x.collapses))).padStart(6)}`
      + ` ${String(median(out[p].map((x) => x.packedBuys))).padStart(11)}`,
    );
  }
  const beatsI = med('switch') > med('income');
  const beatsP = med('switch') > med('packed');
  verdicts.push(
    beatsI && beatsP
      ? `  ${row}: PASS — switch ${med('switch')} beats income ${med('income')} and packed ${med('packed')}`
      : `  ${row}: FAIL — switch ${med('switch')}, income ${med('income')}, packed ${med('packed')}`
        + `${beatsI ? '' : ' [loses to always-income]'}${beatsP ? '' : ' [loses to always-packed]'}`,
  );
  console.log('');
}
for (const v of verdicts) console.log(v);
const allPass = verdicts.every((v) => v.includes('PASS'));
console.log(`\n${allPass ? 'ALL ROWS PASS' : 'AT LEAST ONE ROW FAILS'} — samples: ${N}`);
process.exit(allPass ? 0 : 1);
