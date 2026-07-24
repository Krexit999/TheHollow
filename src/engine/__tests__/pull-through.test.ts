/**
 * B4 — THE FORGE PULL-THROUGH. Four consumption edges, each tested for the
 * same two properties the export spine was: the engaged road pays, and the
 * ignored road still works (pillar 4 — a raw fallback is never worse than
 * what stood before this phase).
 */
import { describe, expect, it } from 'vitest';
import { D } from '../decimal';
import { createEngine } from '../index';
import type { GameState } from '../types';
import {
  REFINED_SPREAD, TOOL_RECIPES, materialCount, addMaterial, recipeDef,
} from '../systems/forge';
import { CASTING_IDS, materialDef } from '../materials';
import { castBindingCosts, castingForAlloy } from '../content/shell2/crucibleSystem';
import { ALLOY_DEFS } from '../content/shell2/alloys';
import { TEMPERS, TEMPER_BY_ID } from '../systems/tempering';
import { BREW_BY_ID } from '../content/shell3/brews';
import { MUSEUM_FUSION_NEED, fuseRelics } from '../systems/relics';
import { traitsOf } from '../traits';

const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};

// ---------------------------------------------------------------------------
// Edge 1 — Refinery worked materials → mid+ tool recipes
// ---------------------------------------------------------------------------
describe('refined recipes', () => {
  it('every tier IV+ recipe has a refined variant; no tier I-III does; every variant names a worked material', () => {
    for (const r of TOOL_RECIPES) {
      if (r.tier >= 4) {
        expect(r.refined, r.id).toBeDefined();
        expect(materialDef(r.refined!.workedId).worked, `${r.id} refined input must be worked`).toBe(true);
      } else {
        expect(r.refined, r.id).toBeUndefined();
      }
    }
  });

  it('the raw craft still works untouched, and the refined craft pays ×1.12 on both stats', () => {
    const { engine, s } = fresh();
    s.forge.built = true;
    s.shell.breachCount = 1;
    s.shell.current = 'ferrite'; // ordinal 2 → tier IV craftable
    s.depthRecords['ferrite'] = 10;
    const recipe = recipeDef('lodestoneRake');
    for (const [id, n] of Object.entries(recipe.inputs)) addMaterial(s, id, 60, n * 2);
    s.currencies['flux'] = D(recipe.brick * 3);
    s.currencies['brick'] = D(recipe.brick * 3);

    // Raw — no worked material held at all.
    const raw = engine.dispatch({ type: 'craftTool', recipeId: 'lodestoneRake' });
    expect(raw.ok).toBe(true);
    const rawTool = s.forge.tools[s.forge.tools.length - 1]!;

    // Refined refuses while short, names the road…
    const refused = engine.dispatch({ type: 'craftTool', recipeId: 'lodestoneRake', refined: true });
    expect(refused.ok).toBe(false);
    expect((refused as { reason: string }).reason).toContain('Refinery');

    // …and pays once the clay is rendered.
    addMaterial(s, 'bindingclay', 60, recipe.refined!.count);
    const fine = engine.dispatch({ type: 'craftTool', recipeId: 'lodestoneRake', refined: true });
    expect(fine.ok).toBe(true);
    const fineTool = s.forge.tools[s.forge.tools.length - 1]!;
    expect(fineTool.name).toBe('Refined Lodestone Rake');
    expect(fineTool.chipPower / rawTool.chipPower).toBeCloseTo(REFINED_SPREAD, 1);
    expect(materialCount(s, 'bindingclay')).toBe(0); // consumed
  });
});

// ---------------------------------------------------------------------------
// Edge 2 — Crucible alloys → Tier X+ bindings (castings)
// ---------------------------------------------------------------------------
describe('alloy castings', () => {
  it('every alloy maps to a casting; every casting is worked and carries traits', () => {
    for (const a of ALLOY_DEFS) {
      const c = castingForAlloy(a.id);
      expect(CASTING_IDS as readonly string[]).toContain(c);
    }
    for (const id of CASTING_IDS) {
      expect(materialDef(id).worked).toBe(true);
      expect(traitsOf(id).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('casting consumes the ratio in metals and requires the pattern discovered', () => {
    const { engine, s } = fresh();
    s.shell.breachCount = 1;
    s.depthRecords['ferrite'] = 60; // mastery 2+ (crucible open)
    expect(engine.dispatch({ type: 'castBinding', alloyId: 'greysteel' }).ok).toBe(false); // undiscovered
    s.crucible.discovered.push('greysteel');
    s.crucible.purities['greysteel'] = 80;
    const costs = castBindingCosts('greysteel'); // [2,1,0,0,0] × 25
    expect(costs).toEqual([{ metal: 'ingot', amount: 50 }, { metal: 'flux', amount: 25 }]);
    s.currencies['ingot'] = D(50);
    s.currencies['flux'] = D(25);
    expect(engine.dispatch({ type: 'castBinding', alloyId: 'greysteel' }).ok).toBe(true);
    expect(materialCount(s, 'steelcasting')).toBe(1);
    expect(s.currencies['ingot']!.toNumber()).toBe(0);
    expect(s.currencies['flux']!.toNumber()).toBe(0);
  });

  it('a casting binds only Tier X+ and never heads or hafts', () => {
    const { engine, s } = fresh();
    s.forge.built = true;
    s.shell.breachCount = 3;
    s.shell.current = 'glassmere'; // ordinal 4 → tiers to XII craftable
    for (const sh of ['loam', 'ferrite', 'verdance', 'glassmere']) s.depthRecords[sh] = 300;
    addMaterial(s, 'steelcasting', 70, 3);
    addMaterial(s, 'prismite', 70, 3); // glassmere pure — heads tier 10
    addMaterial(s, 'marl', 70, 3);
    s.currencies['lumen'] = D(10000); // glassmere's conv coin fires the forge

    const asHead = engine.dispatch({ type: 'craftFromParts', tier: 4, head: 'steelcasting', haft: 'marl', binding: 'marl' });
    expect(asHead.ok).toBe(false);
    const lowBind = engine.dispatch({ type: 'craftFromParts', tier: 4, head: 'prismite', haft: 'marl', binding: 'steelcasting' });
    expect(lowBind.ok).toBe(false);
    expect((lowBind as { reason: string }).reason).toContain('Tier 10');
    const highBind = engine.dispatch({ type: 'craftFromParts', tier: 10, head: 'prismite', haft: 'marl', binding: 'steelcasting' });
    expect(highBind.ok).toBe(true);
    // plain stock still binds tier 10 fine — the casting is a bonus, not a toll
    const plain = engine.dispatch({ type: 'craftFromParts', tier: 10, head: 'prismite', haft: 'marl', binding: 'marl' });
    expect(plain.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge 3 — Still brews → the quench catalog
// ---------------------------------------------------------------------------
describe('brew quenches', () => {
  it('three cellar quenches exist, each naming a real brew; the six material media stand', () => {
    const brewed = TEMPERS.filter((t) => t.brew);
    expect(brewed.length).toBe(3);
    for (const t of brewed) expect(BREW_BY_ID.has(t.brew!.id), t.id).toBe(true);
    expect(TEMPERS.filter((t) => !t.brew).length).toBe(6);
  });

  it('a cellar quench drinks the dose; without one it refuses and names the Still', () => {
    const { engine, s } = fresh();
    s.forge.built = true;
    s.depthRecords['ferrite'] = 200; // mastery 6 → trough open
    s.shell.breachCount = 1;
    addMaterial(s, 'temperash', 60, 4);
    s.currencies['brick'] = D(1000);
    s.currencies['flux'] = D(1000);

    const dry = engine.dispatch({ type: 'temperTool', temperId: 'ironbrew' });
    expect(dry.ok).toBe(false);
    expect((dry as { reason: string }).reason).toContain('Still');

    s.brewing.doses['ironblood'] = 2;
    const wet = engine.dispatch({ type: 'temperTool', temperId: 'ironbrew' });
    expect(wet.ok).toBe(true);
    expect(s.brewing.doses['ironblood']).toBe(1); // one dose drunk by the trough
    const def = TEMPER_BY_ID.get('ironbrew')!;
    expect(def.active(s)).toBe(true); // warden of loam still stands on a fresh save
  });
});

// ---------------------------------------------------------------------------
// Edge 4 — Museum curation gates relic-fusion tiers
// ---------------------------------------------------------------------------
describe('museum-gated fusion', () => {
  const relic = (s: GameState, rarity: number) => {
    const r = { uid: s.relics.nextUid++, defId: 'x', rarity, affixes: { dropRate: 0.05 * (rarity + 1) }, source: 'warren', fusedFrom: 0 };
    s.relics.held.push(r);
    return r;
  };

  it('same-rarity fusion is never gated; rarity-up needs the cases and says so', () => {
    const { s } = fresh();
    const a = relic(s, 1);
    const b = relic(s, 1);
    expect(fuseRelics(s, a.uid, b.uid).ok).toBe(true); // merging is free forever

    const keep = relic(s, 1);
    const fine = relic(s, 3); // rising to 3 needs MUSEUM_FUSION_NEED[3] cases
    const gated = fuseRelics(s, keep.uid, fine.uid);
    expect(gated.ok).toBe(false);
    expect(gated.reason).toContain('Museum');
    expect(keep.rarity).toBe(1); // untouched — the feed was not eaten

    s.museum.completed = ['a', 'b', 'c'].slice(0, MUSEUM_FUSION_NEED[3]!);
    expect(fuseRelics(s, keep.uid, fine.uid).ok).toBe(true);
    expect(keep.rarity).toBe(3);
  });

  it('the gate ladder is monotone and tops out within the 12 real cases', () => {
    for (let r = 1; r < MUSEUM_FUSION_NEED.length; r++) {
      expect(MUSEUM_FUSION_NEED[r]!).toBeGreaterThanOrEqual(MUSEUM_FUSION_NEED[r - 1]!);
    }
    expect(Math.max(...MUSEUM_FUSION_NEED)).toBeLessThanOrEqual(12);
  });
});
