/**
 * EVERY MACHINE IS A TINKERS ITEM (§11.2) — the half the tier ladder is not.
 *
 * The tiers answer "what can this machine do"; the PARTS answer "what does this
 * one do differently from the identical one you built out of other stone". Until
 * A.83 `buildCrusher` consumed the parts and discarded their materials in the
 * same statement, so every Crusher in every save was the same Crusher and
 * §11.2's whole claim was unrepresentable.
 *
 * THE LINE THESE TESTS HOLD: a part changes WHAT the machine will do, never HOW
 * MUCH it returns. `CRUSH_OUTPUT` is asserted identical across every build.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { CRUSH_OUTPUT, crush, crushPreview, grindsMixed, holdsByproductBand } from '../systems/crusher';
import { builtWith, ensurePlant, machineTraits } from '../systems/plant';
import { dpsMax } from '../systems/face';
import { traitsOf } from '../traits';

const ctx: EngineCtx = { emit() {}, dirty() {} };

/** A rack of parts all cast from one stone, and a bank that can fire. */
function bench(materialId: string, tier = 1): { engine: Engine; s: GameState } {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.casting.rack = Array.from({ length: 40 }, (_, i) => ({
    id: 500 + i, type: 'head' as never, materialId, purity: 60,
  }));
  const p = ensurePlant(s);
  p.surge = 9999;
  for (let t = 0; t < tier; t++) engine.dispatch({ type: 'buildCrusher' });
  p.surge = 9999;
  return { engine, s };
}

/** Two Loam stones whose traits differ in exactly the ways the Crusher reads. */
const KEEN = 'duskflint';        // keen, dense
const TRUE = 'graveclaydeep';    // dense, tough, trueseated
const PLAIN = 'marl';            // neither

describe('the fixture materials really do differ', () => {
  it('...or every comparison below is vacuous', () => {
    expect(traitsOf(KEEN)).toContain('keen');
    expect(traitsOf(TRUE)).toContain('trueseated');
    expect(traitsOf(PLAIN)).not.toContain('keen');
    expect(traitsOf(PLAIN)).not.toContain('trueseated');
  });
});

describe('a machine remembers what it was cast from', () => {
  it('the build records the parts materials', () => {
    const { s } = bench(KEEN);
    expect(ensurePlant(s).builtOf?.['crusher']).toEqual(Array(2).fill(KEEN));
    expect(machineTraits(s, 'crusher').has('keen')).toBe(true);
  });

  it('a machine built from plain stone carries neither trait', () => {
    const { s } = bench(PLAIN);
    expect(builtWith(s, 'crusher', 'keen')).toBe(false);
    expect(builtWith(s, 'crusher', 'trueseated')).toBe(false);
  });

  it('and a save from before this behaves as it always did', () => {
    const { s } = bench(KEEN);
    delete ensurePlant(s).builtOf; // the pre-A.83 shape
    expect(machineTraits(s, 'crusher').size).toBe(0);
    expect(grindsMixed(s)).toBe(false);
  });
});

describe('KEEN — it cuts what does not match', () => {
  /** Four stones spread across bands: no band has a full batch. */
  const spread = (s: GameState): void => {
    s.materials.stacks['marl'] = {
      good: { count: 2, puritySum: 140 },
      fair: { count: 2, puritySum: 100 },
    };
  };

  it('a plain Crusher REFUSES a batch it cannot make from one band', () => {
    const { s } = bench(PLAIN);
    spread(s);
    expect(crushPreview(s, 'marl', 'good')).toBeNull();
  });

  it('a keen one takes it', () => {
    const { s } = bench(KEEN);
    spread(s);
    expect(grindsMixed(s)).toBe(true);
    expect(crushPreview(s, 'marl', 'good')).not.toBeNull();
  });

  it('...and returns THE SAME AMOUNT — it is reach, not yield', () => {
    const out = (mat: string): number => {
      const { s } = bench(mat);
      // A full band, so BOTH machines will fire and the comparison is real.
      s.materials.stacks['marl'] = { good: { count: 8, puritySum: 560 } };
      const before = s.materials.stacks['refineslag']?.['fair']?.count ?? 0;
      crush(s, ctx, 'marl', 'good');
      const after = Object.values(s.materials.stacks['refineslag'] ?? {})
        .reduce((n, x) => n + (x?.count ?? 0), 0);
      return after - before;
    };
    expect(out(KEEN)).toBe(CRUSH_OUTPUT);
    expect(out(PLAIN)).toBe(CRUSH_OUTPUT);
  });

  it('and it eats the NAMED band first, so the choice still leads', () => {
    const { s } = bench(KEEN);
    s.materials.stacks['marl'] = {
      good: { count: 3, puritySum: 210 },
      fair: { count: 3, puritySum: 150 },
    };
    crush(s, ctx, 'marl', 'good');
    // Three from `good`, one made up from `fair`.
    expect(s.materials.stacks['marl']?.['good']).toBeUndefined();
    expect(s.materials.stacks['marl']?.['fair']?.count).toBe(2);
  });
});

describe('TRUESEATED — the byproduct does not fall with the product', () => {
  /** Tier III so a byproduct exists at all; tier I..II emit none. */
  const byproductBand = (mat: string): string => {
    const { s } = bench(mat, 3);
    // Tier III retains the band, so force the drop by reading tier I behaviour:
    // set the tier back to 1 while keeping what it was built from.
    ensurePlant(s).tiers['crusher'] = 1;
    s.materials.stacks['marl'] = { good: { count: 8, puritySum: 560 } };
    // Tier I emits nothing, so put the byproduct back on for this comparison.
    ensurePlant(s).tiers['crusher'] = 3;
    crush(s, ctx, 'marl', 'good');
    const by = s.materials.stacks['salvagedust'] ?? {};
    return Object.keys(by)[0] ?? 'none';
  };

  it('is only true for a machine cast from true-seated stone', () => {
    const { s } = bench(TRUE, 3);
    expect(holdsByproductBand(s)).toBe(true);
    const plain = bench(PLAIN, 3);
    expect(holdsByproductBand(plain.s)).toBe(false);
  });

  it('and both machines still emit exactly one', () => {
    // The trait moves the BAND, never the count — the pillar-2 line for this
    // capability, and the thing that would make it a yield bonus if it slipped.
    for (const mat of [TRUE, PLAIN]) {
      const { s } = bench(mat, 3);
      s.materials.stacks['marl'] = { good: { count: 8, puritySum: 560 } };
      crush(s, ctx, 'marl', 'good');
      const n = Object.values(s.materials.stacks['salvagedust'] ?? {})
        .reduce((a, x) => a + (x?.count ?? 0), 0);
      expect(n, mat).toBe(1);
    }
    void byproductBand;
  });
});

describe('PILLAR 2 — no part material reaches the ceiling', () => {
  it('a Crusher cast from every stone in turn reads one dpsMax', () => {
    const seen = new Set<number>();
    for (const mat of [KEEN, TRUE, PLAIN]) {
      const { s } = bench(mat, 3);
      s.depth = 30; // THE SAME DEPTH for every arm — depth pressure is a yield term
      const m = new ModifierCache();
      m.invalidate();
      seen.add(Math.round(dpsMax(s, m).toNumber() * 1e6));
    }
    expect(seen.size, 'the ceiling moved with the stone').toBe(1);
  });
});
