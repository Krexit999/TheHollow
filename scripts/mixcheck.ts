/** Step-Zero audit: engageable share at gear-appropriate fixed points. */
import { createEngine } from '../src/engine';
import type { GameState } from '../src/engine';
import { ModifierCache } from '../src/engine/modifiers';
import { COMPETENT_SKILL, resolveFight } from '../src/engine/combat/combat';
import { rollSpecies } from '../src/engine/combat/species';
import { TIER_BASE } from '../src/engine/systems/forge';

const POINTS: Array<{ shell: string; depth: number; tier: number }> = [
  { shell: 'loam', depth: 20, tier: 1 },
  { shell: 'loam', depth: 60, tier: 2 },
  { shell: 'loam', depth: 130, tier: 3 },
  { shell: 'ferrite', depth: 30, tier: 4 },
  { shell: 'ferrite', depth: 120, tier: 5 },
  { shell: 'ferrite', depth: 200, tier: 6 },
];

for (const p of POINTS) {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  const mods = new ModifierCache();
  s.depth = p.depth;
  if (p.shell === 'ferrite') s.shell.current = 'ferrite';
  s.forge.tools.push({
    id: 9, recipeId: 'x', name: 'x', tier: p.tier, purity: 60,
    chipPower: 1, strikePower: TIER_BASE[p.tier]!.strike,
    sockets: p.tier >= 5 ? ['bloodgarnet', 'cinderquartz'] : [], alloys: [],
  });
  s.forge.equipped = s.forge.tools.length - 1;
  s.delver.skills['twoHandedSwing'] = Math.min(5, p.tier);
  s.delver.skills['deepGrip'] = Math.min(3, p.tier - 1);
  if (p.tier >= 2) s.forge.gear.offhand = { defId: 'marlshield', purity: 60 };
  if (p.tier >= 5) s.forge.gear.offhand = { defId: 'lodewardBuckler', purity: 60 };
  if (p.tier >= 5) s.forge.gear.harness = { defId: 'ironweave', purity: 60 };
  if (p.tier >= 5) {
    // The strike achievements an endgame kit has by then.
    for (const id of ['firstKill', 'wardenLoam', 'kills25']) s.achievements.unlocked[id] = true;
  }
  let wins = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) {
    const sp = rollSpecies(p.shell, p.depth, Math.random, p.tier);
    if (sp && resolveFight(s, mods, sp, COMPETENT_SKILL).win) wins += 1;
  }
  console.log(`${p.shell} d${p.depth} T${p.tier}: engageable ${((100 * wins) / n).toFixed(0)}%`);
}
