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
import { gateOfMaterial, materialDef } from '../materials';
import { shellDef } from '../shells';
import { TEMPERS } from '../systems/tempering';

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
            gateOfMaterial(id),
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
// Edge 2 (crucible alloys → castings) removed — the legacy Crucible/Alloys
// system is gone; the Forge's melt/pour/cast station (systems/casting.ts)
// replaced it and is covered elsewhere.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Edge 3 (brew quenches) removed A.72 — the Still is gone, and with it the
// three brew-gated tempers. The six material-medium quenches stand.
// ---------------------------------------------------------------------------
describe('tempers', () => {
  it('SEVEN material quenches stand — the Pyre-bath is the seventh (A.95)', () => {
    // §17 names five quench media and calls the Pyre-bath "the only route to
    // tier-XI temper"; it had never existed. The Retort makes it.
    expect(TEMPERS.length).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Edge 4 (museum curation gates relic-fusion tiers) removed — the Museum is
// gone; fusionGate() always returns {need:0,have:0} now, so fusion is never
// gated. No dedicated coverage needed for an always-open gate.
// ---------------------------------------------------------------------------
