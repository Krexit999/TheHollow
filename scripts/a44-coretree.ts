/**
 * A.44 checkpoint 5 — CORE TREE SIZING, against the real cadence.
 *
 * THE SHAPE NOBODY HAD WRITTEN DOWN: `doBreach` sets `state.collapse.nodes = {}`
 * (breach.ts:106), so the Core tree is WIPED every Breach. It is not a
 * long-accumulating meta tree — it is a PER-SHELL build, bought fresh in each
 * world out of that world's Cores. PILLARS says "tree completes around Shell V",
 * which assumes accumulation and cannot happen; the ladder table in the same
 * document says Breach resets the Core tree, and the code agrees with the table.
 *
 * That changes the sizing question completely. It is not "7,562 cores over a
 * playthrough" — it is "7,562 cores per shell, every shell", against a MEASURED
 * 478 at Breach 1 (sim-out/a44-confirm). And because `coresForDepth` scales with
 * depth while the tree's price is flat, the tree is starved in Loam and
 * over-supplied by Cinder: one constant cannot be right for both.
 *
 *   npx tsx scripts/a44-coretree.ts
 */
import { CORE_NODES } from '../src/engine/content/shell1/coreTree';
import { coresForDepth } from '../src/engine/prestigeMath';
import { allShells } from '../src/engine/shells';
import { ensureContentLoaded } from '../src/engine/content/index';

ensureContentLoaded();

const treeCost = (base: number, ratio: number): { t1: number; total: number } => {
  let t1 = 0, total = 0;
  for (const n of CORE_NODES) {
    let c = 0;
    for (let l = 0; l < n.maxLevel; l++) c += base * ratio ** l;
    total += c;
    if ((n as { tranche?: number }).tranche !== 2) t1 += c;
  }
  return { t1, total };
};

// Shipped curve, for reference.
const shipped = treeCost(2, 1.55);
console.log(`SHIPPED tree: ${CORE_NODES.length} nodes | tranche-1 ${Math.round(shipped.t1)}` +
  ` | full ${Math.round(shipped.total)} cores — PER SHELL, wiped at every Breach`);
console.log(`  (deepGrit alone, 15 levels, is ${Math.round(
  Array.from({ length: 15 }, (_, l) => 2 * 1.55 ** l).reduce((a, b) => a + b, 0))} — a third of the tree)\n`);

/**
 * Cores a shell's arc pays. ANCHOR: 478 measured at Breach 1 in Loam, where the
 * policy breaches on ~34 collapses at coresForDepth(~145). Later shells are
 * scaled by their floor's per-collapse payout at the same collapse count —
 * which is exactly why a flat tree price cannot fit all seven.
 */
const LOAM_MEASURED = 478; // sim-out/a44-confirm, `ladder:` line at Breach 1
console.log('supply per shell arc (ANCHORED on the measurement, not asserted against it):');
const supply: Array<{ id: string; cores: number }> = [];
const loamPer = coresForDepth(150).toNumber();
for (const sh of allShells()) {
  if (sh.id === 'aleph') continue;
  const per = coresForDepth(sh.floorDepth).toNumber();
  // Scale every shell off the MEASURED Loam arc by its floor's payout ratio.
  // The first cut of this modelled Loam from first principles, got 238 against
  // a measured 478, and printed "the model is honest here" underneath — a 2x
  // error asserting its own agreement. Anchor on the number that was observed.
  const cores = Math.round(LOAM_MEASURED * (per / loamPer));
  supply.push({ id: sh.id, cores });
  console.log(`  ${sh.id.padEnd(10)} floor ${String(sh.floorDepth).padStart(3)} | ` +
    `${String(per).padStart(3)}/collapse | arc ≈ ${String(cores).padStart(5)} cores` +
    `${sh.id === 'loam' ? '  <- MEASURED' : ''}`);
}
// Tranche 2 needs breachCount >= 1, so the FIRST shell can only reach tranche 1.
console.log(`  note: tranche 2 is gated on breachCount>=1, so Loam can only spend on` +
  ` tranche-1 (${Math.round(shipped.t1)} cores shipped)\n`);

/** What fraction of the tree a shell can buy, and how many nodes it can MAX. */
function afford(cores: number, base: number, ratio: number, tranche1Only = false): { maxed: number; frac: number } {
  // Greedy: buy the cheapest next level anywhere, which is what a player does.
  const lv = CORE_NODES.map(() => 0);
  let spent = 0, maxed = 0;
  for (;;) {
    let best = -1, bestCost = Infinity;
    CORE_NODES.forEach((n, i) => {
      if (lv[i]! >= n.maxLevel) return;
      if (tranche1Only && (n as { tranche?: number }).tranche === 2) return;
      const c = base * ratio ** lv[i]!;
      if (c < bestCost) { bestCost = c; best = i; }
    });
    if (best < 0 || spent + bestCost > cores) break;
    spent += bestCost;
    lv[best]!++;
    if (lv[best] === CORE_NODES[best]!.maxLevel) maxed++;
  }
  const t = treeCost(base, ratio);
  return { maxed, frac: spent / (tranche1Only ? t.t1 : t.total) };
}

const CANDIDATES: Array<[string, number, number]> = [
  ['shipped        base 2   r 1.55', 2, 1.55],
  ['A  cheaper r   base 2   r 1.40', 2, 1.40],
  ['B  cheaper r   base 2   r 1.35', 2, 1.35],
  ['C  cheaper r   base 2   r 1.30', 2, 1.30],
];
for (const [label, base, ratio] of CANDIDATES) {
  const t = treeCost(base, ratio);
  console.log(`${label}  | tranche-1 ${String(Math.round(t.t1)).padStart(5)} | full ${String(Math.round(t.total)).padStart(6)}`);
  for (const s of supply) {
    const a = afford(s.cores, base, ratio, s.id === 'loam');
    console.log(`    ${s.id.padEnd(10)} ${String(s.cores).padStart(5)} cores -> ` +
      `${String(a.maxed).padStart(2)} nodes maxed, ${(a.frac * 100).toFixed(0)}% of ${s.id === 'loam' ? 'tranche-1' : 'tree'}`);
  }
  console.log();
}
