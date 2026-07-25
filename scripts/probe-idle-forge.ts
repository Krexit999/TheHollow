/**
 * IDLE-PACING DIAGNOSTIC (A.40 close-out) — harness-vs-game, isolated.
 *
 * The 12h idle run ended at depth 44 with tool tier 1 and 0 tools forged from
 * 346 drops. Two candidate explanations, and they need different fixes:
 *   HARNESS — the policy never actually attempts a forge (sim gap), or spends
 *             the materials elsewhere before it can.
 *   GAME    — 346 idle drops genuinely cannot pay a tier-2 pick, which would
 *             be a pillar-1 break (the idle player is walled at d45 forever).
 *
 * This replays the ENGINE'S OWN drop roller for the observed drop count at
 * loam depths, then asks the real craftTool for a verdict. No policy, no
 * sim — just: can that haul pay that recipe?
 */
import { createEngine } from '../src/engine';
import { D } from '../src/engine/decimal';
import { rollDrop } from '../src/engine/materials';
import { applyDrop } from '../src/engine/systems/drops';
import { materialCount, TOOL_RECIPES } from '../src/engine/systems/forge';
import type { GameState } from '../src/engine/types';

const DROPS = Number(process.argv[2] ?? 346);
const ctx = { emit: () => {}, dirty: () => {} };

const engine = createEngine({ nowMs: 0 });
const s = engine.getState() as GameState;

// The observed 12h-idle end state: forge standing, brick banked, at the wall.
s.forge.built = true;
s.kiln.built = true;
s.depth = 44;
s.maxDepthRecord = 44;
s.depthRecords['loam'] = 44;
s.currencies['brick'] = D(2565);

// The haul: DROPS rolls through the real roller, at the depths an idle run
// actually mines (it climbs to 44 and collapses, so weight the shallow band).
for (let i = 0; i < DROPS; i++) {
  const depth = Math.floor((i / DROPS) * 44);
  s.depth = depth;
  applyDrop(s, ctx, rollDrop('loam', depth));
}
s.depth = 44;

const recipe = TOOL_RECIPES.find((r) => r.id === 'loamironPick')!;
const held: Record<string, number> = {};
for (const id of Object.keys(recipe.inputs)) held[id] = materialCount(s, id);

console.log(`--- ${DROPS} real drop rolls at loam depths 0..44 ---`);
console.log('recipe loamironPick wants:', JSON.stringify(recipe.inputs), `+ ${recipe.brick} brick`);
console.log('haul holds:              ', JSON.stringify(held), `+ ${s.currencies['brick']!.toNumber()} brick`);
console.log('total drops banked:', s.materials.totalDrops, '| geodes:', s.materials.geodes);

const result = engine.dispatch({ type: 'craftTool', recipeId: 'loamironPick' });
console.log('craftTool ->', JSON.stringify(result));
console.log('tool tier now:', s.forge.tools.length > 0 ? s.forge.tools[s.forge.tools.length - 1]!.tier : 'none crafted');

// How many drops does the recipe actually need? Walk it down until it fails.
for (const n of [300, 250, 200, 150, 120, 100, 80, 60, 40]) {
  const e2 = createEngine({ nowMs: 0 });
  const s2 = e2.getState() as GameState;
  s2.forge.built = true;
  s2.currencies['brick'] = D(2565);
  for (let i = 0; i < n; i++) {
    s2.depth = Math.floor((i / n) * 44);
    applyDrop(s2, ctx, rollDrop('loam', s2.depth));
  }
  s2.depth = 44;
  const r2 = e2.dispatch({ type: 'craftTool', recipeId: 'loamironPick' });
  if (!r2.ok) {
    console.log(`floor: ${n} drops FAILS -> ${(r2 as { reason: string }).reason}`);
    break;
  }
  console.log(`${n} drops still pays it`);
}
