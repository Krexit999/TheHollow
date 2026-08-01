/**
 * Phase 12 verification, headless (part 1 — the Spiral Grid budget question —
 * was cut with content/shell7/gridModules.ts and challenges.ts). Answers the
 * remaining open question with numbers instead of opinion: does active play
 * keep its ~1.3x edge over idle? (Pillar 1.)
 *
 * Usage: npx tsx scripts/p12-verify.ts
 */
import { createEngine } from '../src/engine';
import { PARALLEL_IDLE_SHARE } from '../src/engine/systems/spiral';

// --- pillar 1 ---------------------------------------------------------
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
console.log(`a parallel world runs at ${PARALLEL_IDLE_SHARE} x automationRate x the in-hand ceiling`);
console.log(
  `=> a fully automated parallel world earns ${(PARALLEL_IDLE_SHARE * 1).toFixed(2)}x idle, ` +
  `i.e. ${((PARALLEL_IDLE_SHARE / ratio) * 100).toFixed(0)}% of what an attentive hand earns.`,
);
