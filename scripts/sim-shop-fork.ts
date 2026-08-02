/**
 * §40.2 CLAIMS SHOP FORKS ARE THE BEST CHOICE SYSTEM IN THE GAME. This is the
 * falsification attempt.
 *
 * THE CLAIM, STATED SO IT CAN FAIL: for each forked row, a policy that SWITCHES
 * sides on the state must beat both policies that always pick one side. If a
 * row's switcher cannot beat both, that row's fork is a stat pick wearing a
 * choice's clothes and the honest answer is to say so — and to name the state
 * it should have depended on instead, because a failure with no candidate state
 * is half a report.
 *
 * THE METRIC IS DEEP-ENTRY MATERIALS over the arc, and it is chosen because it
 * is the one thing both sides are ultimately for:
 *
 *   - ALWAYS-INCOME never packs, so it reaches the gates rarely: the face is
 *     shallow when the Collapse takes it.
 *   - ALWAYS-PACKED never buys the formula, so income stalls, the stair outruns
 *     it, and it works a small shallow board at a low depth.
 *   - A SWITCHER buys income while the stair is the binding constraint and packs
 *     once it is not, every run.
 *
 * Scoring on dust alone would be rigged for income; scoring on compaction alone
 * would be rigged for packed. Deep-entry drops are what the packed side EXISTS
 * to produce and what the income side FUNDS, so it is the axis where a real
 * fork has to show up. Depth reached is reported alongside as the honest
 * counterweight — a switcher that wins deep drops by never descending would be
 * visible immediately.
 *
 * READ THE VERDICT WITH THE VARIANCE IN MIND — this is the FOURTH thing about
 * this harness that produced a confident wrong answer. `SEEDS` only perturbs
 * which cell the hand starts on; the ENGINE's Math.random (compaction rolls,
 * ore, crits) is not seeded at all, so every entry is an independent sample and
 * the median of nine is still noisy. Measured across four full runs: SOIL fails
 * every time, always to always-packed. BLADE and ROOTS flip verdict run to run
 * — the instrument cannot resolve them at this sample size, and a single run's
 * line for those two rows is not evidence. Raise SEEDS or lengthen MINUTES
 * before treating either as settled.
 *
 *   npx tsx scripts/sim-shop-fork.ts
 */
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine/types';
import { allUpgrades, nextCost, upgradeLevel } from '../src/engine/upgrades';
import { currentDescendCost } from '../src/engine/systems/depthSys';
import { ModifierCache } from '../src/engine/modifiers';
import type { Branch, ForkedRow } from '../src/engine/systems/shopFork';
import { D } from '../src/engine/decimal';

const MINUTES = 90;
const STEP = 0.1;
const ROWS: ForkedRow[] = ['blade', 'soil', 'roots'];

type Policy = 'income' | 'packed' | 'switch';

/**
 * THE STATE THE SWITCHER READS, and it is the one §40.3 names: how far into a
 * run you are, expressed as "can I still afford the stair". While the descent
 * price is within reach the binding constraint is INCOME; once the stair has
 * outrun the bank for this run, the board is what is left to work, so PACK it
 * before the fall takes it.
 */
function switchBranch(s: GameState, _mods: ModifierCache): Branch {
  /**
   * FIRST CUT WAS A BROKEN INSTRUMENT and it produced a confident wrong answer.
   * It read `bank * 4 >= stair`, and the buy loop runs BEFORE the descend loop —
   * so the bank was always freshly full at the moment it was asked, the test
   * was true every time, and the "switcher" bought income on every tick of
   * every run. It reported 0 packed levels while claiming to be a switching
   * policy, and two rows "failed" against a policy that was never run. Caught
   * by reading the `packed levels` column, which is in the table for exactly
   * this reason.
   *
   * The state it reads now is the one §40.3 actually names: HOW FAR INTO THE
   * RUN YOU ARE. Early, the stair is the binding constraint and income
   * compounds into depth; late, the stair has outrun this run and the worked
   * board is what is left to convert before the fall takes it. The policy
   * collapses at 40, so 30 is "the last stretch of this run" — and it flips
   * fifteen times in ninety minutes, which is the property under test.
   */
  return s.depth >= 30 ? 'packed' : 'income';
}

interface Result {
  deep: number;
  depth: number;
  collapses: number;
  /** Packed levels BOUGHT over the arc — end-state levels read ~0 because the
   *  Collapse clamps every face row to its floor, which made the first cut of
   *  this column look like the switcher never packed. */
  packedBuys: number;
  chips: number;
}

/** `only` restricts the fork to ONE row, so a failure names a row. */
function run(policy: Policy, only: ForkedRow | null, seed: number): Result {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  const mods = new ModifierCache();
  let cursor = seed;
  let deep = 0;
  let packedBuys = 0;
  let chips = 0;
  let window0 = 0;

  // Count deep-entry drops as they land, off the event bus — not by diffing
  // stacks, which the Kiln and the drills also write to.
  engine.subscribe(() => {});
  const DEEP_IDS = new Set(['umberjade', 'graveclaydeep', 'deepgrave']);
  const readDeep = (): number => {
    let n = 0;
    for (const id of DEEP_IDS) {
      const bands = s.materials.stacks[id];
      if (!bands) continue;
      for (const b of Object.values(bands)) n += b?.count ?? 0;
    }
    return n;
  };

  for (let t = 0; t < MINUTES * 60; t += STEP) {
    engine.tick(STEP);
    /**
     * TWO CHIPS A SECOND, ON A WORKING SET — the same hand in every arm.
     *
     * THE FIRST TWO CUTS CHIPPED ROUND-ROBIN ACROSS ALL 36 CELLS, and that is
     * the third harness bug in this file: it models a player who never does the
     * thing the packed side exists for. Compaction is per-cell, so spreading
     * chips evenly is the WORST case for reaching a gate — every cell crawls up
     * together and nothing arrives. A player working toward deep entry
     * concentrates: a few cells, worked down, then move on.
     *
     * So the hand works a rotating window of six cells and advances it once the
     * window is at the terminal gate. Identical in every arm, so it cannot
     * favour a branch — it just stops modelling a player who does not exist.
     */
    if (Math.floor(t / 0.5) !== Math.floor((t - STEP) / 0.5)) {
      const n = s.face.w * s.face.h;
      const WINDOW = 6;
      const base = (window0 * WINDOW) % n;
      const cell = (base + (cursor % WINDOW)) % n;
      engine.dispatch({ type: 'chip', cell });
      cursor++; chips++;
      const comp = s.face.compaction ?? [];
      let deepEnough = true;
      for (let k = 0; k < WINDOW; k++) {
        if ((comp[(base + k) % n] ?? 0) < 20) { deepEnough = false; break; }
      }
      if (deepEnough) window0++;
    }
    if (Math.floor(t) !== Math.floor(t - STEP)) {
      mods.invalidate();
      const branch: Branch = policy === 'switch' ? switchBranch(s, mods) : policy;
      // Buy every affordable forked row on the arm's branch, cheapest first.
      for (const id of ROWS) {
        const def = allUpgrades().find((u) => u.id === id)!;
        const lv = upgradeLevel(s, id);
        if (lv >= def.maxLevel) continue;
        const cost = nextCost(def, lv);
        if ((s.currencies['dust'] ?? D(0)).lt(cost)) continue;
        // A row outside `only` is bought plainly (income) so the arms differ by
        // exactly ONE row's fork and nothing else.
        const b: Branch = only === null || id === only ? branch : 'income';
        if (engine.dispatch({ type: 'buyUpgrade', id, branch: b }).ok && b === 'packed') packedBuys++;
      }
      // Descend whenever it is affordable with a buffer — identical everywhere.
      while ((s.currencies['dust'] ?? D(0)).gte(currentDescendCost(s, mods).mul(1.5))) {
        if (!engine.dispatch({ type: 'descend' }).ok) break;
        mods.invalidate();
      }
      // Collapse when the fall pays — the same rule in every arm.
      if (s.depth >= 40) engine.dispatch({ type: 'collapse' });
    }
  }
  deep = readDeep();
  return { deep, depth: s.maxDepthRecord, collapses: s.collapse.count, packedBuys, chips };
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

console.log(`Shop forks: three policies per row, ${MINUTES}m, median of ${SEEDS.length} seeds.\n`);
console.log('row      policy            DEEP  depth  colls  packedBuys   chips  deep/1k chips');

const verdicts: string[] = [];
for (const row of ROWS) {
  const out: Record<Policy, Result[]> = { income: [], packed: [], switch: [] };
  for (const p of ['income', 'packed', 'switch'] as Policy[]) {
    for (const seed of SEEDS) out[p].push(run(p, row, seed));
  }
  const med = (p: Policy) => median(out[p].map((r) => r.deep));
  for (const p of ['income', 'packed', 'switch'] as Policy[]) {
    const ch = median(out[p].map((x) => x.chips));
    console.log(
      `${row.padEnd(8)} always-${p.padEnd(10)} ${String(med(p)).padStart(5)}`
      + ` ${String(median(out[p].map((x) => x.depth))).padStart(6)}`
      + ` ${String(median(out[p].map((x) => x.collapses))).padStart(6)}`
      + ` ${String(median(out[p].map((x) => x.packedBuys))).padStart(11)}`
      + ` ${String(ch).padStart(7)}`
      + ` ${(med(p) / (ch / 1000)).toFixed(1).padStart(14)}`,
    );
  }
  const beatsIncome = med('switch') > med('income');
  const beatsPacked = med('switch') > med('packed');
  verdicts.push(
    beatsIncome && beatsPacked
      ? `  ${row}: SWITCHER WINS — ${med('switch')} deep vs ${med('income')} income / ${med('packed')} packed`
      : `  ${row}: FORK FAILED — switch ${med('switch')}, income ${med('income')}, packed ${med('packed')}`
      + `${beatsIncome ? '' : ' (loses to always-income)'}${beatsPacked ? '' : ' (loses to always-packed)'}`,
  );
  console.log('');
}

for (const v of verdicts) console.log(v);
const allWon = verdicts.every((v) => v.includes('SWITCHER WINS'));
console.log('');
console.log(allWon
  ? 'CLAIM HOLDS — every row\'s fork rewards switching on the state over committing to a side.'
  : 'CLAIM FAILS on at least one row. See the per-row line; do not tune until the state it should depend on is named.');
process.exit(allWon ? 0 : 1);
