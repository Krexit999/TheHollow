/** One-shot audit: every tool recipe vs the wall it opens (Step Zero, Phase 9). */
import { TOOL_RECIPES } from '../src/engine/systems/forge';
import { materialDef, RARITY_GATES } from '../src/engine/materials';
import { shellDef } from '../src/engine/shells';
import { ensureContentLoaded } from '../src/engine/content';

ensureContentLoaded();
const shells = ['loam', 'ferrite', 'verdance', 'glassmere'];
const wallOf: Record<number, { shell: string; depth: number }> = {};
for (const s of shells) {
  for (const w of shellDef(s).walls) wallOf[w.tier] = { shell: s, depth: w.depth };
}
console.log('WALLS:', JSON.stringify(wallOf));
for (const r of TOOL_RECIPES) {
  const wall = wallOf[r.tier];
  const probs: string[] = [];
  for (const [id, n] of Object.entries(r.inputs)) {
    let def;
    try {
      def = materialDef(id);
    } catch {
      probs.push(`${id}: UNDEFINED`);
      continue;
    }
    const gate = RARITY_GATES[def.rarity].minDepth;
    const cross = wall && def.shellId !== wall.shell;
    const past = wall && gate > wall.depth;
    const combat = def.source === 'combat';
    if (cross || past || combat) {
      probs.push(
        `${id}x${n}(${def.shellId} ${def.rarity} g${gate}${cross ? ' CROSS' : ''}${past ? ' PAST-WALL' : ''}${combat ? ' COMBAT-ONLY' : ''})`,
      );
    }
  }
  console.log(
    `T${r.tier} ${r.id} ${wall ? `@${wall.shell} d${wall.depth}` : '(no wall gates this tier)'}${
      probs.length ? '  VIOLATIONS: ' + probs.join(', ') : '  ok'
    }`,
  );
}
