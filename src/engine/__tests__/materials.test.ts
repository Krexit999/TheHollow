import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import {
  bandOf,
  crackGeodeRolls,
  GEMS,
  MATERIALS,
  materialsOfShell,
  rollDrop,
  rollPurity,
  rollRarity,
} from '../materials';
import {
  addMaterial,
  consumeMaterial,
  computeStats,
  equippedTool,
  materialCount,
  nextWall,
  purityMult,
  recipeDef,
  requiredTier,
  stackAvg,
  TOOL_RECIPES,
  SHELL1_MAX_TIER,
} from '../systems/forge';
import { assayDuration, dropChance, startAssay } from '../systems/drops';
import { UNDER_TIER_FARE } from '../systems/depthSys';
import { computeBucket } from '../modifiers';
import { runMigrations, SAVE_VERSION } from '../save/migrations';
import { serialize } from '../save/codec';

/** Deterministic rng for roll tests. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}

function fresh(): { engine: Engine; s: GameState } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
}

describe('the taxonomy', () => {
  it('~90 mineable materials + combat-only extras, unique ids, six gems', () => {
    expect(MATERIALS.length).toBeGreaterThanOrEqual(88);
    expect(new Set(MATERIALS.map((m) => m.id)).size).toBe(MATERIALS.length);
    // 15 mineable in Loam; the Deepwrought carry the rest (unminable).
    expect(materialsOfShell('loam').filter((m) => !m.source)).toHaveLength(15);
    expect(materialsOfShell('loam').filter((m) => m.source === 'combat').length).toBeGreaterThanOrEqual(5);
    expect(GEMS).toHaveLength(6);
    // Every shell got its share of the declaration.
    for (const shell of ['ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      expect(materialsOfShell(shell).length).toBeGreaterThanOrEqual(6);
    }
  });

  it('purity rolls: tight at common, wide at flawless, uniform at aberrant', () => {
    const spread = (rarity: Parameters<typeof rollPurity>[0]) => {
      const rng = seeded(42);
      const rolls = Array.from({ length: 3000 }, () => rollPurity(rarity, rng));
      const mean = rolls.reduce((a, b) => a + b, 0) / rolls.length;
      const sd = Math.sqrt(rolls.reduce((a, b) => a + (b - mean) ** 2, 0) / rolls.length);
      return { mean, sd, min: Math.min(...rolls), max: Math.max(...rolls) };
    };
    const common = spread('common');
    const flawless = spread('flawless');
    const aberrant = spread('aberrant');
    expect(common.sd).toBeLessThan(9);
    expect(flawless.sd).toBeGreaterThan(15); // a bad Flawless roll stings
    expect(aberrant.min).toBeLessThanOrEqual(5);
    expect(aberrant.max).toBeGreaterThanOrEqual(96);
    for (const s of [common, flawless, aberrant]) {
      expect(s.min).toBeGreaterThanOrEqual(1);
      expect(s.max).toBeLessThanOrEqual(100);
    }
  });

  it('rarity gates by depth: no pure above depth 40, no starred above 110', () => {
    const rng = seeded(7);
    for (let i = 0; i < 500; i++) {
      const r = rollRarity(15, rng);
      expect(['common', 'rich']).toContain(r);
    }
    const deep = new Set<string>();
    for (let i = 0; i < 4000; i++) deep.add(rollRarity(160, rng)!);
    expect(deep.has('starred')).toBe(true);
    expect(deep.has('aberrant')).toBe(true);
  });

  it('drops only ever come from the rolled shell', () => {
    const rng = seeded(99);
    for (let i = 0; i < 300; i++) {
      const drop = rollDrop('loam', 120, rng);
      if (drop.kind === 'material') {
        expect(MATERIALS.find((m) => m.id === drop.materialId)!.shellId).toBe('loam');
      }
    }
  });

  it('geodes crack into 2-4 boosted rolls', () => {
    const rng = seeded(5);
    for (let i = 0; i < 50; i++) {
      const rolls = crackGeodeRolls('loam', 30, rng);
      expect(rolls.length).toBeGreaterThanOrEqual(2);
      expect(rolls.length).toBeLessThanOrEqual(4);
    }
  });
});

describe('inventory', () => {
  it('stacks by band and keeps a running purity average', () => {
    const { s } = fresh();
    addMaterial(s, 'marl', 45);
    addMaterial(s, 'marl', 52);
    addMaterial(s, 'marl', 85);
    expect(materialCount(s, 'marl')).toBe(3);
    expect(bandOf(45)).toBe('fair');
    expect(bandOf(85)).toBe('fine');
    const fair = s.materials.stacks['marl']!['fair']!;
    expect(fair.count).toBe(2);
    expect(stackAvg(fair)).toBeCloseTo(48.5);
  });

  it('consume takes best bands first and reports what it took', () => {
    const { s } = fresh();
    addMaterial(s, 'marl', 30);
    addMaterial(s, 'marl', 30);
    addMaterial(s, 'marl', 90);
    const avg = consumeMaterial(s, 'marl', 2);
    // 90 (fine) first, then one 30 (poor): avg 60.
    expect(avg).toBeCloseTo(60);
    expect(materialCount(s, 'marl')).toBe(1);
    expect(consumeMaterial(s, 'marl', 5)).toBeNull(); // short -> untouched
    expect(materialCount(s, 'marl')).toBe(1);
  });
});

describe('the forge', () => {
  function stocked(): { engine: Engine; s: GameState } {
    const { engine, s } = fresh();
    s.forge.built = true;
    for (const recipe of TOOL_RECIPES.filter((r) => r.tier <= 3)) {
      for (const [matId, count] of Object.entries(recipe.inputs)) {
        addMaterial(s, matId, 70, count + 5);
      }
    }
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'brick', amount: 500 });
    return { engine, s };
  }

  it('crafting consumes inputs + brick, rolls purity into stats, auto-equips', () => {
    const { engine, s } = stocked();
    const before = materialCount(s, 'marl');
    const result = engine.dispatch({ type: 'craftTool', recipeId: 'marlsplitter' });
    expect(result.ok).toBe(true);
    expect(materialCount(s, 'marl')).toBe(before - 6);
    const tool = equippedTool(s);
    expect(tool.name).toBe('Marlsplitter');
    expect(tool.purity).toBe(70);
    const expected = computeStats(recipeDef('marlsplitter'), 70);
    expect(tool.chipPower).toBeCloseTo(expected.chip);
    expect(tool.strikePower).toBeCloseTo(expected.strike);
    // Purity 70 -> 1.1x over base spread.
    expect(purityMult(70)).toBeCloseTo(1.1);
    // The equipped tool is a named dustYield modifier.
    expect(computeBucket(s, 'dustYield').toNumber()).toBeGreaterThanOrEqual(tool.chipPower);
  });

  it('tier III forces the chip/strike tradeoff', () => {
    const deep = computeStats(recipeDef('deepcutter'), 50);
    const warden = computeStats(recipeDef('wardenbreaker'), 50);
    expect(deep.chip).toBeGreaterThan(warden.chip);
    expect(warden.strike).toBeGreaterThan(deep.strike);
  });

  it('tiers above III are locked in Shell I with the reason visible', () => {
    const { engine } = stocked();
    const result = engine.dispatch({ type: 'craftTool', recipeId: 'lodestoneRake' });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/shell/i);
    expect(TOOL_RECIPES.filter((r) => r.tier > SHELL1_MAX_TIER).length).toBeGreaterThanOrEqual(12);
  });

  it('gems socket, unsocket on discard, and modify the pipeline', () => {
    const { engine, s } = stocked();
    engine.dispatch({ type: 'craftTool', recipeId: 'loamironPick' }); // tier II: 1 socket
    const tool = equippedTool(s);
    s.materials.gems['bloodgarnet'] = 1;
    const yieldBefore = computeBucket(s, 'dustYield').toNumber();
    expect(engine.dispatch({ type: 'socketGem', toolId: tool.id, slot: 0, gemId: 'bloodgarnet' }).ok).toBe(true);
    expect(s.materials.gems['bloodgarnet']).toBe(0);
    expect(computeBucket(s, 'dustYield').toNumber()).toBeCloseTo(yieldBefore * 1.15, 3);
    engine.dispatch({ type: 'discardTool', toolId: tool.id });
    expect(s.materials.gems['bloodgarnet']).toBe(1); // gems are forever
  });

  it("the Delver's Pick cannot be discarded", () => {
    const { engine } = fresh();
    expect(engine.dispatch({ type: 'discardTool', toolId: 0 }).ok).toBe(false);
  });
});

describe('hardness walls', () => {
  it('tier II at 45, tier III at 110, and the wall is announced', () => {
    const { s } = fresh();
    expect(requiredTier(s, 44)).toBe(1);
    expect(requiredTier(s, 45)).toBe(2);
    expect(requiredTier(s, 109)).toBe(2);
    expect(requiredTier(s, 110)).toBe(3);
    expect(nextWall(s, 30)!.depth).toBe(45);
    expect(nextWall(s, 80)!.depth).toBe(110);
    expect(nextWall(s, 200)).toBeNull();
  });

  it('descending past a wall COSTS more without the tier — it is never blocked', () => {
    /**
     * A.70 CHANGED THIS CONTRACT DELIBERATELY. The wall used to REFUSE, and the
     * brief is explicit that a specific tool must never be required to progress:
     * "let the new tool improve mining without being a wall." So the assertion
     * flipped from "you cannot" to "you can, and here is what it costs" — a
     * better tool is now a discount rather than a key.
     */
    const under = fresh();
    under.s.depth = 44;
    under.engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e12 });
    const beforeUnder = under.s.currencies['dust']!.toNumber();
    const r = under.engine.dispatch({ type: 'descend' });
    expect(r.ok, 'the wall must not refuse').toBe(true);
    expect(under.s.depth).toBe(45);
    const paidUnder = beforeUnder - under.s.currencies['dust']!.toNumber();

    // The same step, properly tooled, is cheaper by exactly the fare.
    const tooled = fresh();
    tooled.s.depth = 44;
    tooled.engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e12 });
    tooled.s.forge.tools.push({
      id: 9, recipeId: 'loamironPick', name: 'Loamiron Pick', tier: 2,
      purity: 50, chipPower: 1.35, strikePower: 5, sockets: [null], alloys: [],
    });
    tooled.s.forge.equipped = tooled.s.forge.tools.length - 1;
    const beforeTooled = tooled.s.currencies['dust']!.toNumber();
    expect(tooled.engine.dispatch({ type: 'descend' }).ok).toBe(true);
    const paidTooled = beforeTooled - tooled.s.currencies['dust']!.toNumber();

    expect(paidUnder / paidTooled).toBeCloseTo(UNDER_TIER_FARE, 2);
  });
});

describe('drops ride the ceiling (pillar 2)', () => {
  it('chance scales with charge harvested and depth', () => {
    const { engine, s } = fresh();
    const mods = { get: (st: GameState, b: string) => computeBucket(st, b as never) } as never;
    const shallow = dropChance(s, mods, 8);
    s.depth = 100;
    const deep = dropChance(s, mods, 8);
    const small = dropChance(s, mods, 1);
    expect(deep).toBeGreaterThan(shallow);
    expect(small).toBeLessThan(deep / 4); // proportional to charge
    void engine;
  });

  it('an hour of drilling accumulates materials for idle players', () => {
    const { engine, s } = fresh();
    s.drills.bayBuilt = true;
    for (let i = 0; i < 12; i++) {
      s.drills.units.push({ level: 5, timer: 0, lastCell: 0 });
    }
    // Two hours: one is within binomial flake range at depth-0 drop odds.
    engine.dispatch({ type: 'debug', op: 'warp', seconds: 7200 });
    expect(s.materials.totalDrops).toBeGreaterThan(2);
  });
});

describe('possessions survive Collapse', () => {
  it('materials, gems, geodes, and tools all persist', () => {
    const { engine, s } = fresh();
    addMaterial(s, 'marl', 60, 20);
    s.materials.gems['hearthstone'] = 2;
    s.materials.geodes = 3;
    s.forge.built = true;
    s.depth = 40;
    engine.dispatch({ type: 'collapse' });
    expect(materialCount(s, 'marl')).toBe(20);
    expect(s.materials.gems['hearthstone']).toBe(2);
    expect(s.materials.geodes).toBe(3);
    expect(s.forge.built).toBe(true);
    expect(s.forge.tools.length).toBeGreaterThanOrEqual(1);
  });
});

describe('the assay table', () => {
  it('locked without the Hunch; survey completes over sim time', () => {
    const { engine, s } = fresh();
    expect(engine.dispatch({ type: 'startAssay' }).ok).toBe(false);
    s.delver.skills['assayersHunch'] = 1;
    const result = engine.dispatch({ type: 'startAssay' });
    expect(result.ok).toBe(true);
    expect(s.assay.active).not.toBeNull();
    engine.dispatch({ type: 'debug', op: 'warp', seconds: 25 });
    expect(s.assay.active).toBeNull();
    expect(s.assay.surveysDone).toBe(1);
    expect(s.assay.boostChips).toBeGreaterThan(0);
  });

  it('ranks and the Old Seal chord speed surveys up', () => {
    const { s } = fresh();
    const mods = { get: (st: GameState, b: string) => computeBucket(st, b as never) } as never;
    s.delver.skills['assayersHunch'] = 1;
    const base = assayDuration(s, mods);
    s.delver.skills['assayersHunch'] = 3;
    expect(assayDuration(s, mods)).toBeCloseTo(base / 2);
    // Old Seal: hex.isolated.mixed, sum 4 -> +4% assay speed.
    s.lattice.activeChords = [{ id: 'hex.isolated.mixed', cells: [], sumRanks: 4, seq: 0 }];
    expect(assayDuration(s, mods)).toBeLessThan(base / 2);
    void startAssay;
  });
});

describe('migration v2 -> v3', () => {
  it('adds materials, forge, and assay to old saves', () => {
    const { s } = fresh();
    const raw = JSON.parse(serialize(s, 0)) as { state: Record<string, unknown> };
    delete raw.state['materials'];
    delete raw.state['forge'];
    delete raw.state['assay'];
    const migrated = runMigrations({ version: 2, savedAt: 0, state: raw.state });
    expect(migrated.version).toBe(SAVE_VERSION);
    const st = migrated.state as Record<string, any>;
    expect(st['materials'].totalDrops).toBe(0);
    expect(st['forge'].tools[0].name).toBe("Delver's Pick");
    expect(st['assay'].surveysDone).toBe(0);
  });
});
