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
import { CASTING_IDS, materialDef, RARITY_GATES } from '../materials';
import { shellDef } from '../shells';
import { castBindingCosts, castingForAlloy } from '../content/shell2/crucibleSystem';
import { ALLOY_DEFS } from '../content/shell2/alloys';
import { TEMPERS } from '../systems/tempering';
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
      // THE LADDER'S FLOOR IS EXEMPT (A.44 A2). This law exists so the Refinery
      // matters at every tier, and it still does: every tier keeps its authored
      // pick and that pick still requires a refined variant. The floor recipe is
      // the crude commons-only path you take when a Collapse has put you back at
      // depth 0 with nothing but common stone — giving the fallback a fallback
      // would be missing what it is for. Taking it already costs the tier's
      // whole spread advantage.
      if (r.floor) {
        expect(r.refined, `${r.id} is the ladder's floor and must stay unrefined`).toBeUndefined();
        continue;
      }
      if (r.tier >= 4) {
        expect(r.refined, r.id).toBeDefined();
        expect(materialDef(r.refined!.workedId).worked, `${r.id} refined input must be worked`).toBe(true);
      } else {
        expect(r.refined, r.id).toBeUndefined();
      }
    }
  });

  /**
   * THE FLOOR RULE ITSELF (A.44 A2) — the structural fix for the tier-III
   * inversion. Recipe redundancy used to decay 4 (tier II) → 2 (tier III) → ONE
   * for tiers IV–XV, so every wall from Ferrite d40 on was a single-recipe gate:
   * short its one input and there was no second path. Worse, tier III bound on
   * PURE band (depth 40) while a Collapse resets depth to 0, so the binding
   * stone only earned during part of each cycle.
   *
   * Asserted as an outcome per wall, not as a count of recipes — the thing that
   * matters is that a walled player can always forge SOMETHING from stone that
   * drops at the depth the reset dropped them at.
   */
  it('every hardness wall has a floor recipe payable at depth 0', () => {
    fresh(); // registers the shell content `shellDef` reads
    const walls = new Set<number>();
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder']) {
      for (const w of shellDef(id).walls) walls.add(w.tier);
    }
    expect(walls.size).toBeGreaterThan(10); // the ladder really does wall this often
    for (const tier of walls) {
      const floors = TOOL_RECIPES.filter((r) => r.tier === tier && r.floor);
      expect(floors.length, `tier ${tier} has no floor recipe`).toBeGreaterThan(0);
      for (const f of floors) {
        for (const id of Object.keys(f.inputs)) {
          expect(
            RARITY_GATES[materialDef(id).rarity].minDepth,
            `${f.id} wants ${id}, which a Collapse gates away`,
          ).toBe(0);
          expect(materialDef(id).worked ?? false, `${f.id} wants worked ${id}`).toBe(false);
        }
        // Tier gates HARDNESS; spread is QUALITY. The floor must never be best.
        for (const sib of TOOL_RECIPES.filter((r) => r.tier === tier && r.id !== f.id)) {
          expect(
            f.chipSpread + f.strikeSpread,
            `${f.id} is not worse than ${sib.id} — the floor must never be the best pick`,
          ).toBeLessThan(sib.chipSpread + sib.strikeSpread);
        }
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
// Edge 3 (brew quenches) removed A.72 — the Still is gone, and with it the
// three brew-gated tempers. The six material-medium quenches stand.
// ---------------------------------------------------------------------------
describe('tempers', () => {
  it('six material quenches stand', () => {
    expect(TEMPERS.length).toBe(6);
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
    s.relics.shards = 999; // A.46: a fusion costs shards; the GATE is what this tests
s.currencies['core'] = D(9999); // A.48: and Cores — the price that escalates
    const a = relic(s, 1);
    const b = relic(s, 1);
    expect(fuseRelics(s, a.uid, b.uid).ok).toBe(true); // merging is never case-gated

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
