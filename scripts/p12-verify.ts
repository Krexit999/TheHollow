/**
 * Phase 12 verification, headless. Answers the two open questions with numbers
 * instead of opinion:
 *
 *  1. Does the ~17-40 lifetime Spiral budget reach a Grid configuration that
 *     feels COMPLETE rather than starved? (The formula is LOCKED — if it is
 *     too tight, that is a Phase 13 flag, not a tuning change.)
 *  2. Does automationRate at its 1.0 cap still leave active play its ~1.3x
 *     edge over idle? (Pillar 1 at the top of the ladder.)
 *
 * Usage: npx tsx scripts/p12-verify.ts
 */
import { createEngine } from '../src/engine';
import { spiralFromLifetime, gridSlotCost, licenceCost, PARALLEL_IDLE_SHARE } from '../src/engine/systems/spiral';
import { GRID_MODULES, GRID_CELLS, automationRate } from '../src/engine/content/shell7/gridModules';
import { CHALLENGES } from '../src/engine/content/shell7/challenges';

// --- 1. the Spiral budget -------------------------------------------------
console.log('=== SPIRAL BUDGET (locked formula: floor(sqrt(TotalAxioms) x Recursions)) ===');
const scenarios: Array<[string, number, number]> = [
  ['first Spiral (5 axioms, R1)', 5, 1],
  ['a committed run (12 axioms, R2)', 12, 2],
  ['deep endgame (20 axioms, R4)', 20, 4],
  ['everything (20 axioms, R6)', 20, 6],
];
let deepest = 0;
for (const [label, ax, rec] of scenarios) {
  const total = spiralFromLifetime(ax, rec);
  deepest = Math.max(deepest, total);
  // Spend greedily on slots (capacity for the board) after one licence.
  let budget = total;
  let slots = 0;
  let licences = 0;
  if (budget >= licenceCost(0)) { budget -= licenceCost(0); licences = 1; }
  while (budget >= gridSlotCost(slots) && slots < GRID_CELLS) { budget -= gridSlotCost(slots); slots++; }
  const placeable = Math.min(slots, GRID_MODULES.length);
  // Best-case rate: fill the slots with the highest-rate modules available.
  const best = [...GRID_MODULES].sort((a, b) => b.rate - a.rate).slice(0, placeable);
  const grid: Record<number, string> = {};
  best.forEach((m, i) => { grid[i] = m.id; });
  console.log(
    `${label.padEnd(32)} ${String(total).padStart(3)} Spiral -> ${licences} licence, ${String(slots).padStart(2)} slots ` +
    `(${placeable}/${GRID_MODULES.length} modules placeable, board plays ${(automationRate(grid) * 100).toFixed(0)}% of idle)`,
  );
}
console.log(`\nmodules that exist: ${GRID_MODULES.length} (one per challenge: ${CHALLENGES.length})`);
console.log(`grid cells: ${GRID_CELLS}`);

// --- 2. pillar 1 at the top of the ladder ---------------------------------
console.log('\n=== PILLAR 1: does full automation still leave hands an edge? ===');
// TWO INDEPENDENT ENGINES from an identical state, and a long enough window
// that the face's starting charge cannot dominate. (The first version of this
// measurement ran both windows on ONE engine and reported active at 0.41x
// idle — an artifact: the idle window harvested a pre-charged face and handed
// the active window a drained one.)
const WINDOW_SEC = 600;
function seeded() {
  const e = createEngine({ nowMs: 0 });
  const st = e.getState();
  st.kiln.built = true;
  st.drills.bayBuilt = true;
  for (let i = 0; i < 6; i++) st.drills.units.push({ level: 8, timer: 0, lastCell: 0 });
  e.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e6 });
  e.tick(120); // settle to steady state before measuring
  return e;
}
const gain = (e: ReturnType<typeof createEngine>, before: number) =>
  (e.getState().totals['dust']?.toNumber() ?? 0) - before;

const idleEngine = seeded();
const idleBefore = idleEngine.getState().totals['dust']?.toNumber() ?? 0;
idleEngine.tick(WINDOW_SEC);
const idlePerMin = (gain(idleEngine, idleBefore) / WINDOW_SEC) * 60;

const activeEngine = seeded();
const activeBefore = activeEngine.getState().totals['dust']?.toNumber() ?? 0;
const faceSize = activeEngine.getState().face.cells.length;
for (let sec = 0; sec < WINDOW_SEC; sec++) {
  // a hand working steadily: ~4 chips/sec across the face
  for (let k = 0; k < 4; k++) activeEngine.dispatch({ type: 'chip', cell: (sec * 4 + k) % faceSize });
  activeEngine.tick(1);
}
const activePerMin = (gain(activeEngine, activeBefore) / WINDOW_SEC) * 60;

const ratio = activePerMin / Math.max(1, idlePerMin);
console.log(`idle   : ${idlePerMin.toFixed(0)} dust/min`);
console.log(`active : ${activePerMin.toFixed(0)} dust/min`);
console.log(`active/idle ratio: ${ratio.toFixed(2)}x  (pillar 1 wants active >= idle, ~1.3x mid-game)`);
console.log(`automation cap: ${automationRate(Object.fromEntries(GRID_MODULES.map((m, i) => [i, m.id])))} of IDLE`);
console.log(`a parallel world runs at ${PARALLEL_IDLE_SHARE} x automationRate x the in-hand ceiling`);
console.log(
  `=> a fully automated parallel world earns ${(PARALLEL_IDLE_SHARE * 1).toFixed(2)}x idle, ` +
  `i.e. ${((PARALLEL_IDLE_SHARE / ratio) * 100).toFixed(0)}% of what an attentive hand earns.`,
);
