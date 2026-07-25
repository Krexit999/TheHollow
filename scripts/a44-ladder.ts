/**
 * A.44 ruling 2 — THE PRESTIGE LADDER RE-RATE, sized before it is changed.
 *
 * The ladder above Collapse is starved by construction, not by drift:
 *   echoes/breach = 3·(C/500)^0.6   → 3 at the measured C=508 (Breach 1, a43)
 *   7 breaches                      → 21 echoes per Recursion
 *   axioms = floor((E/25)^0.8)      → floor((21/25)^0.8) = 0
 * A complete first Recursion pays ZERO Axioms at design-perfect rates, and 20
 * Axioms are authored. Spiral is worse: a full 16-slot Grid costs 192 against a
 * lifetime supply of sqrt(A)·R = 12.
 *
 * This sizes candidate constants against a RANGE of cores-per-breach rather
 * than one guess, because deep shells pay more per collapse (coresForDepth at
 * the floor: loam 14 → pyre 104) and the harness's own breach heuristic (≥500)
 * is a policy artifact, not the game. Constants that only hit the targets at
 * one assumed rate are not re-rated, they are curve-fitted.
 *
 *   npx tsx scripts/a44-ladder.ts
 */

interface Rates {
  label: string;
  echoBase: number; // the 3
  echoDiv: number; // the 500
  echoExp: number; // the 0.6
  axiomDiv: number; // the 25
  axiomExp: number; // the 0.8
  slotCost: (n: number) => number;
  licenceCost: (n: number) => number;
}

const CURRENT: Rates = {
  label: 'CURRENT (shipped)',
  echoBase: 3, echoDiv: 500, echoExp: 0.6,
  axiomDiv: 25, axiomExp: 0.8,
  slotCost: (n) => 1 + Math.floor(n * 1.5),
  licenceCost: (n) => 2 + n * 3,
};

const echoes = (r: Rates, cores: number): number =>
  cores <= 0 ? 0 : Math.floor(r.echoBase * Math.pow(cores / r.echoDiv, r.echoExp));
const axioms = (r: Rates, e: number): number =>
  e <= 0 ? 0 : Math.floor(Math.pow(e / r.axiomDiv, r.axiomExp));
const spiral = (a: number, rec: number): number =>
  a <= 0 || rec <= 0 ? 0 : Math.floor(Math.sqrt(a) * rec);

const BREACHES_PER_RECURSION = 7;
const GRID_SLOTS = 16;

/** Cumulative cost of the first n grid slots. */
function gridTotal(r: Rates, n: number): number {
  let t = 0;
  for (let i = 0; i < n; i++) t += r.slotCost(i);
  return t;
}

/** Walk R recursions at a given cores-per-breach, reporting the ladder. */
function walk(r: Rates, coresPerBreach: number, recursions: number) {
  let totalEchoes = 0;
  let axiomsAt: number[] = [];
  for (let rec = 1; rec <= recursions; rec++) {
    for (let b = 0; b < BREACHES_PER_RECURSION; b++) totalEchoes += echoes(r, coresPerBreach);
    axiomsAt.push(axioms(r, totalEchoes));
  }
  const finalAxioms = axiomsAt[axiomsAt.length - 1] ?? 0;
  return {
    echoPerBreach: echoes(r, coresPerBreach),
    totalEchoes,
    axiomsAt,
    firstAxiomAtRecursion: axiomsAt.findIndex((a) => a >= 1) + 1 || 0,
    finalAxioms,
    spiralLifetime: spiral(finalAxioms, recursions),
    gridFull: gridTotal(r, GRID_SLOTS),
  };
}

/** Slots affordable with a given spiral bank (ignoring licences). */
function slotsAfforded(r: Rates, bank: number): number {
  let spent = 0;
  for (let n = 0; n < GRID_SLOTS; n++) {
    spent += r.slotCost(n);
    if (spent > bank) return n;
  }
  return GRID_SLOTS;
}

// The LOW end matters most: a natural player breaches on reaching the floor,
// not after farming to 500. Measured Loam at floor-arrival is ~130–150 cores.
// A re-rate that only works for the grinder has not fixed the bug.
const CORE_RANGE = [130, 250, 500, 800, 1500];

function report(r: Rates): void {
  console.log(`\n=== ${r.label} ===`);
  console.log(`  echoes/breach = ${r.echoBase}·(C/${r.echoDiv})^${r.echoExp}` +
    ` | axioms = floor((E/${r.axiomDiv})^${r.axiomExp})`);
  console.log(`  full ${GRID_SLOTS}-slot grid costs ${gridTotal(r, GRID_SLOTS)} spiral`);
  console.log('  cores/breach   ech/br   R1   R2   R3   R4   R5   R6  | spiral@R6  slots@R6');
  for (const c of CORE_RANGE) {
    const w = walk(r, c, 6);
    const slots = slotsAfforded(r, w.spiralLifetime);
    console.log(
      `  ${String(c).padStart(11)}   ${String(w.echoPerBreach).padStart(6)}  ` +
        w.axiomsAt.map((a) => String(a).padStart(3)).join('  ') +
        `  | ${String(w.spiralLifetime).padStart(9)}  ${String(slots).padStart(7)}/16`,
    );
  }
}

report(CURRENT);

// ---------------------------------------------------------------------------
// Candidates. The targets, from the ruling:
//   (1) first Axiom INSIDE Recursion 1 — not at its edge, and not ten of them
//   (2) a meaningful Grid inside Recursion 2
//   (3) full Grid reachable in lifetime supply across 4–6 Recursions
//   (4) 20 Axioms and 16 modules become things a normal playthrough sees
// The exponents stay put: they set the SHAPE (diminishing returns), which is
// the locked part of the ladder. Only the divisors and the Grid prices move.
// ---------------------------------------------------------------------------
const CANDIDATES: Rates[] = [
  {
    ...CURRENT,
    label: 'A — echoDiv 500→150, axiomDiv 25→12, grid 1+floor(n/2)',
    echoDiv: 150, axiomDiv: 12,
    slotCost: (n) => 1 + Math.floor(n / 2),
    licenceCost: (n) => 1 + n * 2,
  },
  {
    ...CURRENT,
    label: 'B — echoDiv 500→200, axiomDiv 25→10, grid 1+floor(n/3)',
    echoDiv: 200, axiomDiv: 10,
    slotCost: (n) => 1 + Math.floor(n / 3),
    licenceCost: (n) => 1 + n * 2,
  },
  {
    ...CURRENT,
    label: 'C — echoDiv 500→250, axiomDiv 25→8, grid 1+floor(n/3)',
    echoDiv: 250, axiomDiv: 8,
    slotCost: (n) => 1 + Math.floor(n / 3),
    licenceCost: (n) => 1 + n * 2,
  },
  {
    ...CURRENT,
    label: 'D — echoDiv 500→200, axiomDiv 25→8, grid 1+floor(n/12) [=20]',
    echoDiv: 200, axiomDiv: 8,
    slotCost: (n) => 1 + Math.floor(n / 12),
    licenceCost: (n) => 1 + n,
  },
];
for (const c of CANDIDATES) report(c);
