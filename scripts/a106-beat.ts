/**
 * A.106 — THE PACING DELTA, both arms in ONE binary, one flag apart.
 *
 * The question item 3 asks is "what did wiring the wrecks cost §23's opening",
 * and the honest way to answer it is NOT to check out the old commit and run a
 * different build — a baseline measured by different code is not a baseline
 * (PILLARS, A.42). So both arms run this file's single policy, and the only
 * difference is whether Kiln Yard is already looted at t=0:
 *
 *   UNGATED  the wreck is raised before the run starts, which reproduces
 *            exactly the old rule — the Kiln is a 500-Dust PRICE, payable
 *            standing at depth 0.
 *   WIRED    the wreck is where it is, so the Kiln is a WALK to Loam 9.
 *
 * The policy is the one `beat-a23.test.ts` uses, and it is deliberately
 * modest: chip twice a second, descend only while the Yard is still ahead,
 * buy the Kiln the moment it is offered, then pour everything into `expand`.
 *
 *   npx tsx scripts/a106-beat.ts
 */
import { createEngine, type Engine } from '../src/engine';
import type { GameState } from '../src/engine';
import { upgradeLevel, allUpgrades, nextCost } from '../src/engine/upgrades';
import { fieldDims } from '../src/engine/systems/face';
import { wreckFound, wreckStation } from '../src/engine/systems/roll';
import { KILN_WRECK } from '../src/engine/systems/kiln';
import { D } from '../src/engine/decimal';

const STEP = 0.2;
const MINUTES = 45;

interface Beat {
  kilnAt: number | null;
  field8x8At: number | null;
  depthAtKiln: number | null;
  depthEnd: number;
}

function run(ungated: boolean): Beat {
  const engine: Engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  if (ungated) {
    const at = wreckStation(KILN_WRECK)!;
    (s.roll ??= { rolled: {}, cleared: [], looted: [], rolls: 0 }).looted.push(at.def.id);
  }
  const r: Beat = { kilnAt: null, field8x8At: null, depthAtKiln: null, depthEnd: 0 };
  let cursor = 0;

  for (let t = 0; t < MINUTES * 60; t += STEP) {
    engine.tick(STEP);
    const dims = fieldDims(upgradeLevel(s, 'expand'));
    if (Math.floor(t / 0.5) !== Math.floor((t - STEP) / 0.5)) {
      engine.dispatch({ type: 'chip', cell: cursor % (dims.w * dims.h) });
      cursor++;
    }
    if (Math.floor(t) !== Math.floor(t - STEP)) {
      if (!wreckFound(s, KILN_WRECK)) engine.dispatch({ type: 'descend' });
      if (upgradeLevel(s, 'kilnBuild') === 0) {
        const ok = engine.dispatch({ type: 'buyUpgrade', id: 'kilnBuild' });
        if (ok.ok && r.kilnAt === null) {
          r.kilnAt = s.stats.playTimeSec;
          r.depthAtKiln = s.depth;
        }
      }
      const expand = allUpgrades().find((u) => u.id === 'expand')!;
      const lvl = upgradeLevel(s, 'expand');
      if (s.kiln.built && lvl < expand.maxLevel) {
        if ((s.currencies['brick'] ?? D(0)).gte(nextCost(expand, lvl))) {
          engine.dispatch({ type: 'buyUpgrade', id: 'expand' });
        }
      }
    }
    if (r.field8x8At === null && dims.w === 8 && dims.h === 8) r.field8x8At = s.stats.playTimeSec;
  }
  r.depthEnd = s.depth;
  return r;
}

const mmss = (v: number | null) =>
  v === null ? '  never' : `${String(Math.floor(v / 60)).padStart(3)}:${String(Math.round(v % 60)).padStart(2, '0')}`;

const a = run(true);
const b = run(false);

console.log('A.106 — §23 opening, the wreck as a PRICE vs the wreck as a WALK\n');
console.log('                     UNGATED (old)   WIRED (new)    delta');
console.log(`  Kiln lit           ${mmss(a.kilnAt)}          ${mmss(b.kilnAt)}       ${a.kilnAt !== null && b.kilnAt !== null ? `+${(b.kilnAt - a.kilnAt).toFixed(0)}s` : '—'}`);
console.log(`  ...at depth        ${String(a.depthAtKiln ?? '—').padStart(6)}          ${String(b.depthAtKiln ?? '—').padStart(6)}`);
console.log(`  field 8x8          ${mmss(a.field8x8At)}          ${mmss(b.field8x8At)}       ${a.field8x8At !== null && b.field8x8At !== null ? `+${(b.field8x8At - a.field8x8At).toFixed(0)}s` : '—'}`);
console.log(`  depth at ${MINUTES}min   ${String(a.depthEnd).padStart(6)}          ${String(b.depthEnd).padStart(6)}`);
console.log('\n§23 band for the Kiln beat: 1:00-4:00 (beat-a23.test.ts).');
