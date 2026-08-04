/**
 * THE CULTIVAR BENCH — CULTIVATION (§13), and the two things it must not touch.
 *
 * §0 answers item 9 (neither Fallow was a wreck) and §4 is the load-bearing
 * block: `growth.ts` is Verdance's LOCKED signature and nothing new may mount
 * on the face. The bench reads the vines and takes the fruit an ordinary
 * harvest was always allowed to take; it writes nothing else.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import { ensureContentLoaded } from '../content';
import { ModifierCache } from '../modifiers';
import { markReached } from '../systems/roll';
import { MAX_MACHINE_TIER, ensurePlant } from '../systems/plant';
import { ensureCondition } from '../systems/condition';
import { materialCount } from '../systems/forge';
import {
  FRUIT_PER_UNIT, QUADRANTS, TIER_CAPABILITY_CULTIVAR, bedFruit, bedKeeps, bedSlots,
  bedsCross, buildCultivarBench, cellsOf, cropBed, cropBlocker, cropPreview, cultivarBuilt,
  cultivarFound, cultivarStation, seedBed, seedBlocker, touching,
} from '../systems/cultivar';
import { STRAINS, crossOf, strainStone } from '../content/strains';
import { CAPTURE, FRUIT_CAP_MULT, HARVEST_BONUS, STAGE_UP_SEC } from '../systems/growth';
import { authoredRoll } from '../content/rolls';
import { dpsMax } from '../systems/face';
import { PART_TYPES } from '../content/forgeParts';
import { makePart } from '../systems/forgeParts';
import { allShells } from '../shells';
import { materialDef } from '../materials';
import { traitsOf } from '../traits';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx = (): EngineCtx => ({ dirty: () => {}, emit: () => {} }) as unknown as EngineCtx;

function atTheBench(tier = 1): GameState {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  s.shell.current = 'verdance';
  for (const shell of allShells()) s.depthRecords[shell.id] = 400;
  markReached(s, 290, 15);
  ensurePlant(s).tiers['cultivar'] = tier;
  ensureCondition(s);
  s.casting.rack = PART_TYPES.map((t, i) => ({ ...makePart(t, 'marl', 40), id: 900 + i })) as never;
  return s;
}

/** Put vines and fruit in a quadrant, the way growth would have. */
function grow(s: GameState, quad: (typeof QUADRANTS)[number], fruitEach = 200): void {
  const g = s.growth;
  const n = s.face.cells.length;
  while (g.stage.length < n) g.stage.push(0);
  while (g.fruit.length < n) g.fruit.push(0);
  while (g.age.length < n) g.age.push(0);
  while (g.fullSince.length < n) g.fullSince.push(0);
  for (const c of cellsOf(s, quad)) { g.stage[c] = 3; g.fruit[c] = fruitEach; }
}

describe('§0 — ITEM 9: neither Fallow was a wreck', () => {
  it('The Fallow and The Long Fallow are CHAMBERS, so one was authored', () => {
    const roll = authoredRoll('verdance');
    const fallow = roll.find((r) => r.name === 'The Fallow')!;
    const long = roll.find((r) => r.name === 'The Long Fallow')!;
    expect(fallow.type).toBe('chamber');
    expect(long.type).toBe('chamber');
    expect(fallow.wreck).toBeUndefined();
    expect(long.wreck).toBeUndefined();
  });

  it('The Tray House sits past The Fallow and BEFORE Bramblewall', () => {
    const at = cultivarStation()!;
    expect([at.shellId, at.depth, at.name]).toEqual(['verdance', 40, 'The Tray House']);
    const roll = authoredRoll('verdance');
    const wall = roll.find((r) => r.name === 'BRAMBLEWALL')!;
    const fallow = roll.find((r) => r.name === 'The Fallow')!;
    // A bench that farms the face must not sit behind the wall the face is for.
    expect(at.depth).toBeGreaterThan(fallow.depth);
    expect(at.depth).toBeLessThan(wall.depth);
  });

  it('and it buries nothing — the standing rule since The Long Spin', () => {
    const row = authoredRoll('verdance').find((r) => r.id === 'trayhouse')!;
    expect(row.remains ?? []).toEqual([]);
  });
});

describe('§1 — the machine', () => {
  it('found by walking in, built from cast parts, never bought', () => {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    s.shell.current = 'verdance';
    expect(cultivarFound(s)).toBe(false);
    expect(buildCultivarBench(s, ctx()).ok).toBe(false);
    markReached(s, cultivarStation()!.depth, 15);
    expect(cultivarFound(s)).toBe(true);
    expect(buildCultivarBench(s, ctx()).ok, 'built with an empty rack').toBe(false);
    s.casting.rack = PART_TYPES.map((t, i) => ({ ...makePart(t, 'marl', 40), id: i + 1 })) as never;
    expect(buildCultivarBench(s, ctx()).ok).toBe(true);
    expect(cultivarBuilt(s)).toBe(true);
    expect(s.plant!.builtOf!['cultivar']).toBeDefined();
  });

  it('the quadrants are quarters of WHATEVER face you have', () => {
    const s = atTheBench(1);
    const seen = new Set<number>();
    let total = 0;
    for (const q of QUADRANTS) {
      for (const c of cellsOf(s, q)) { seen.add(c); total += 1; }
    }
    expect(total, 'a cell is in two beds').toBe(s.face.cells.length);
    expect(seen.size, 'a cell is in no bed').toBe(s.face.cells.length);
  });
});

describe('§2 — seed a bed, crop its traits', () => {
  let s: GameState;
  beforeEach(() => { s = atTheBench(1); });

  it('a crop pays stone carrying the strain, and nothing until it is ripe', () => {
    const strain = STRAINS[0]!;
    expect(seedBed(s, ctx(), 'nw', strain.id).ok).toBe(true);
    expect(cropBlocker(s, 'nw')).toMatch(/Not ripe/);
    grow(s, 'nw', FRUIT_PER_UNIT);
    const p = cropPreview(s, 'nw')!;
    expect(p.units).toBeGreaterThan(0);
    expect(traitsOf(p.materialId)).toContain(strain.trait);
    expect(cropBed(s, ctx(), 'nw').ok).toBe(true);
    expect(materialCount(s, p.materialId)).toBe(p.units);
  });

  it('an unseeded bed crops nothing at all', () => {
    grow(s, 'ne', FRUIT_PER_UNIT * 4);
    expect(cropPreview(s, 'ne')).toBeNull();
    expect(cropBlocker(s, 'ne')).toMatch(/Nothing is seeded/);
    expect(cropBed(s, ctx(), 'ne').ok).toBe(false);
  });

  it('a tier-I bench keeps ONE bed, and says so', () => {
    expect(bedSlots(s)).toBe(1);
    expect(seedBed(s, ctx(), 'nw', STRAINS[0]!.id).ok).toBe(true);
    expect(seedBlocker(s, 'ne', STRAINS[1]!.id)).toMatch(/keeps 1 bed/);
    ensurePlant(s).tiers['cultivar'] = 3;
    expect(bedSlots(s)).toBe(QUADRANTS.length);
    expect(seedBed(s, ctx(), 'ne', STRAINS[1]!.id).ok).toBe(true);
  });

  it('a strain never names a stone the registry does not have', () => {
    for (const strain of STRAINS) {
      const id = strainStone(strain.trait);
      expect(() => materialDef(id)).not.toThrow();
      expect(materialDef(id).shellId).toBe('verdance');
      expect(traitsOf(id)).toContain(strain.trait);
    }
  });
});

describe('§3 — the three tiers', () => {
  it('I clears the bed as an ordinary harvest does; II leaves it standing', () => {
    const s = atTheBench(1);
    seedBed(s, ctx(), 'nw', STRAINS[0]!.id);
    grow(s, 'nw', FRUIT_PER_UNIT);
    expect(bedKeeps(s)).toBe(false);
    cropBed(s, ctx(), 'nw');
    for (const c of cellsOf(s, 'nw')) expect(s.growth.stage[c]).toBe(0);

    const t2 = atTheBench(2);
    seedBed(t2, ctx(), 'nw', STRAINS[0]!.id);
    grow(t2, 'nw', FRUIT_PER_UNIT);
    expect(bedKeeps(t2)).toBe(true);
    cropBed(t2, ctx(), 'nw');
    for (const c of cellsOf(t2, 'nw')) expect(t2.growth.stage[c]).toBe(3);
    expect(bedFruit(t2, 'nw'), 'the fruit was still taken').toBe(0);
  });

  it('III crosses touching beds into a stone carrying BOTH traits', () => {
    const s = atTheBench(2);
    // Find two strains the registry actually has a crossed stone for.
    let pair: [string, string] | null = null;
    for (const a of STRAINS) {
      for (const b of STRAINS) {
        if (a.trait === b.trait) continue;
        if (crossOf(a.trait, b.trait)) { pair = [a.id, b.id]; break; }
      }
      if (pair) break;
    }
    expect(pair, 'no two strains cross — the table cannot be tested').not.toBeNull();
    ensurePlant(s).tiers['cultivar'] = 3;
    seedBed(s, ctx(), 'nw', pair![0]);
    seedBed(s, ctx(), 'ne', pair![1]);
    expect(touching('nw')).toContain('ne');
    grow(s, 'nw', FRUIT_PER_UNIT);
    const p = cropPreview(s, 'nw')!;
    expect(bedsCross(s)).toBe(true);
    expect(p.crossedWith).toBe('ne');
    expect(p.traits).toHaveLength(2);
    for (const t of p.traits) expect(traitsOf(p.materialId)).toContain(t);
  });

  it('and a cross NEVER invents a material', () => {
    // `crossOf` returns an existing Verdance stone or nothing at all — A.92's
    // conservation rule, applied to the one verb that could have broken it.
    for (const a of STRAINS) {
      for (const b of STRAINS) {
        const id = crossOf(a.trait, b.trait);
        if (!id) continue;
        expect(() => materialDef(id)).not.toThrow();
        expect(traitsOf(id)).toContain(a.trait);
        expect(traitsOf(id)).toContain(b.trait);
      }
    }
  });

  it('the three read as three distinct sentences', () => {
    expect(TIER_CAPABILITY_CULTIVAR).toHaveLength(MAX_MACHINE_TIER + 1);
    expect(new Set(TIER_CAPABILITY_CULTIVAR.slice(1)).size).toBe(3);
  });
});

describe('§4 — THE LOCKED SIGNATURE, AND THE FACE', () => {
  /**
   * The load-bearing block. `growth.ts` is Verdance's locked signature; the
   * bench may read it and may take the fruit an ordinary harvest takes, and
   * that is all.
   */
  it('every growth constant is untouched', () => {
    expect(CAPTURE).toBe(0.8);
    expect(STAGE_UP_SEC).toEqual([0, 30, 60, 90]);
    expect(FRUIT_CAP_MULT).toEqual([0, 3, 7, 16, 32]);
    expect(HARVEST_BONUS).toEqual([1, 1.02, 1.08, 1.14, 1.2]);
  });

  it('THE BENCH MAKES NO FRUIT — it can only take what is standing', () => {
    const s = atTheBench(3);
    seedBed(s, ctx(), 'nw', STRAINS[0]!.id);
    const before = bedFruit(s, 'nw');
    expect(before).toBe(0);
    // Seeding, re-seeding and reading never move a single unit of fruit.
    seedBed(s, ctx(), 'nw', STRAINS[1]!.id);
    cropPreview(s, 'nw');
    cropBlocker(s, 'nw');
    expect(bedFruit(s, 'nw')).toBe(0);
  });

  it('and a crop TAKES the fruit rather than adding to it — the trade', () => {
    const s = atTheBench(2);
    seedBed(s, ctx(), 'nw', STRAINS[0]!.id);
    grow(s, 'nw', FRUIT_PER_UNIT * 2);
    const standing = bedFruit(s, 'nw');
    expect(standing).toBeGreaterThan(0);
    const r = cropBed(s, ctx(), 'nw');
    expect((r.data as { fruit: number }).fruit).toBe(standing);
    expect(bedFruit(s, 'nw')).toBe(0);
  });

  it('PILLAR 2: a bench at its deepest, every bed cropped, cannot move dpsMax', () => {
    const s = atTheBench(3);
    s.depth = 48;
    const mods = new ModifierCache();
    mods.invalidate();
    const bare = dpsMax(s, mods).toNumber();
    for (const [i, q] of QUADRANTS.entries()) {
      seedBed(s, ctx(), q, STRAINS[i % STRAINS.length]!.id);
      grow(s, q, FRUIT_PER_UNIT * 3);
    }
    for (const q of QUADRANTS) cropBed(s, ctx(), q);
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).toBe(bare);
  });
});
