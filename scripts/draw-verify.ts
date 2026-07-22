/**
 * SIM VERIFICATION for THE DRAW (Phase 14, Tier 3).
 *
 * Three questions, because a coupling between two systems can fail in three
 * directions:
 *   1. Does it actually relieve the shaft? (the point)
 *   2. Does it break the flood guarantees? (it must not)
 *   3. Is it a free win that replaces the Vent Network? (it must not be)
 *
 *   npx tsx scripts/draw-verify.ts
 */
import { ensureContentLoaded } from '../src/engine/content';
ensureContentLoaded();
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine/types';
import { DRAW_RATE, DRAW_FLOOR, BAND_LOW, BAND_HIGH, setDraw } from '../src/engine/content/shell5/emberArray';

let failures = 0;
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

/** A shaft deep in Cinder, running hot, with the Array lit. */
function cinderAt(heat: number, draw: boolean): { eng: ReturnType<typeof createEngine>; s: GameState } {
  const eng = createEngine({ nowMs: 0 });
  const s = eng.getState() as GameState;
  s.shell.current = 'cinder';
  s.depth = 400;
  s.depthRecords['cinder'] = 400;
  s.pressure.heat = heat;
  if (draw) setDraw(s, true);
  return { eng, s };
}

function run(eng: ReturnType<typeof createEngine>, seconds: number): void {
  for (let i = 0; i < seconds; i++) eng.tick(1);
}

console.log('\nTHE DRAW — sim verification\n');

// --- 1. It relieves the shaft ----------------------------------------------
console.log('1. does it actually relieve the shaft?');
{
  const hot = cinderAt(80, false);
  const drawn = cinderAt(80, true);
  run(hot.eng, 30);
  run(drawn.eng, 30);
  const a = hot.eng.getState().pressure.heat;
  const b = drawn.eng.getState().pressure.heat;
  check(b < a, 'a drawing shaft cools faster than a venting one', `${a.toFixed(1)} → vs draw ${b.toFixed(1)}`);
  check(b <= DRAW_FLOOR + 2, 'the Draw pulls down to its floor', `settled at ${b.toFixed(1)} (floor ${DRAW_FLOOR})`);
}

// --- 2. It cannot break the flood guarantees -------------------------------
console.log('\n2. can it break the flood guarantees?');
{
  // The Draw only ever REMOVES shaft heat, so an idle shaft with it open must
  // be no hotter than the same shaft without. Verified rather than asserted.
  let worst = 0;
  for (const start of [0, 25, 50, 75, 95]) {
    const off = cinderAt(start, false);
    const on = cinderAt(start, true);
    run(off.eng, 120);
    run(on.eng, 120);
    const delta = on.eng.getState().pressure.heat - off.eng.getState().pressure.heat;
    worst = Math.max(worst, delta);
  }
  check(worst <= 0, 'the Draw never leaves the shaft hotter than not drawing', `worst delta ${worst.toFixed(3)}`);

  const flooded = cinderAt(99, true);
  run(flooded.eng, 60);
  check(
    flooded.eng.getState().pressure.heat < 99,
    'a shaft at the klaxon still comes down with the Draw open',
    `${flooded.eng.getState().pressure.heat.toFixed(1)}`,
  );
}

// --- 3. It must not replace the Vent Network -------------------------------
console.log('\n3. is it a free win that retires the vents?');
{
  // Actively mining generates far more heat than DRAW_RATE can carry, so the
  // Draw must be relief, never a licence to stop building vents.
  const { eng, s } = cinderAt(40, true);
  for (let i = 0; i < 60; i++) {
    for (let c = 0; c < s.face.w * s.face.h; c++) eng.dispatch({ type: 'chip', cell: c });
    eng.tick(1);
  }
  const after = eng.getState().pressure.heat;
  check(after > DRAW_FLOOR, 'hard mining still outruns the Draw — vents still matter', `heat ${after.toFixed(1)} after 60s of chipping`);
  check(DRAW_RATE < 3, 'the draw rate is relief-sized, not a purge', `${DRAW_RATE}/s`);
}

// --- 4. It gives the Array something to do ---------------------------------
console.log('\n4. does it help hold the band (the Array\'s own goal)?');
{
  const { eng, s } = cinderAt(95, true);
  run(eng, 20);
  const temp = eng.getState().ember.temp;
  check(temp > 0, 'drawn heat reaches the furnace', `furnace at ${temp.toFixed(1)}`);
  check(
    temp <= BAND_HIGH * 1.5,
    'and does not by itself pin the band (fuel still does the work)',
    `band is ${BAND_LOW}-${BAND_HIGH}, furnace ${temp.toFixed(1)}`,
  );
  void s;
}

console.log(failures === 0 ? '\nTHE DRAW VERIFIED ✓' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
