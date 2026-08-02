/**
 * THE THREE DRILL AXES (A.75) — and the one that was cut.
 *
 * §20.1's row reads "24 drills x head / behaviour / grain mode / wear". Grain
 * is cut (bd9f3ae) so the grain mode is dead. WEAR IS CUT HERE, on the brief's
 * own test — it is a number that goes down and a payment that puts it back, and
 * a knob is not an axis. What ships is the part of "head" that was ever a
 * capability: the TARGETING RULE.
 *
 * Every assertion below is about WHICH CELL a machine takes. None of them is
 * about how much it takes, which is the whole pillar-2 argument for the layer:
 * the axes are preferences over charge the field has already made.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { cellCap, dpsMax } from '../systems/face';
import { drillBar, drillBehaviour, drillInterval, newDrill, tickDrills, MAX_DRILLS } from '../systems/drills';

const ctx: EngineCtx = { emit() {}, dirty() {} };
function bay(n = 1): { engine: Engine; s: GameState; m: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.drills.bayBuilt = true;
  s.drills.units = Array.from({ length: n }, (_, i) => newDrill(`D${i}`));
  return { engine, s, m: new ModifierCache() };
}
/**
 * Run the bay and record every cell it touched, in order.
 *
 * POCKETS ARE CLEARED EVERY STEP, and that is not the harness routing around a
 * bug — a strike can PLANT one (`plantOre` in `systems/drills.ts`), and a
 * pocket is legitimately not an ordinary target for any of the three rules. The
 * first cut of the SWEEP test read `[1,2,3,5,6]` and looked like a marching
 * bug; cell 4 had grown a pocket and sweep stepped over it correctly. Same ore
 * lottery that flaked `confluence.test` and the decay driver. Clearing it keeps
 * this test about the ORDER, which is what it claims to be about.
 *
 * ...and the step is EXACTLY ONE INTERVAL, because `lastCell` only remembers
 * the last one. At `dt = 2.5` against a 2.0s interval the leftover half-second
 * accumulates and every fourth tick fires TWICE, so the trail read
 * `[1,2,3,5,6]` — a march with a hole in it that was really two strikes sharing
 * one sample. `tickDrills` allows up to four strikes per call; a sampler that
 * ignores that is measuring its own step size.
 */
function trail(s: GameState, m: ModifierCache, strikes: number): number[] {
  const seen: number[] = [];
  const step = drillInterval(s, m, s.drills.units[0]!);
  for (let i = 0; i < strikes; i++) {
    s.face.ore = [];
    s.drills.units[0]!.timer = 0;
    tickDrills(s, m, ctx, step);
    seen.push(s.drills.units[0]!.lastCell);
  }
  return seen;
}

describe('the default is the old behaviour, byte for byte', () => {
  it('a drill nobody configured carries none of the three fields', () => {
    const { s } = bay();
    const d = s.drills.units[0]!;
    expect(d.behavior).toBeUndefined();
    expect(d.minCharge).toBeUndefined();
    expect(d.zone).toBeUndefined();
    expect(drillBehaviour(d)).toBe('fullest');
  });

  it('and setting an axis back to its default STORES NOTHING', () => {
    // Otherwise a save fills with fields that mean "unset", and the next
    // migration has to guess which ones were deliberate.
    const { engine, s } = bay();
    engine.dispatch({ type: 'setDrillBehaviour', index: 0, behavior: 'sweep' });
    expect(s.drills.units[0]!.behavior).toBe('sweep');
    engine.dispatch({ type: 'setDrillBehaviour', index: 0, behavior: 'fullest' });
    expect(s.drills.units[0]!.behavior).toBeUndefined();
    engine.dispatch({ type: 'setDrillFilter', index: 0, minCharge: 0.6 });
    expect(s.drills.units[0]!.minCharge).toBe(0.6);
    engine.dispatch({ type: 'setDrillFilter', index: 0, minCharge: 0 });
    expect(s.drills.units[0]!.minCharge).toBeUndefined();
  });
});

describe('the three behaviours are three DIFFERENT rules', () => {
  it('SWEEP marches in order; FULLEST does not', () => {
    const { s, m } = bay();
    const cap = cellCap(s, m);
    s.face.cells = s.face.cells.map(() => cap);
    s.drills.units[0]!.behavior = 'sweep';
    s.drills.units[0]!.lastCell = 0;
    const walked = trail(s, m, 5);
    // Consecutive, forward, wrapping — a machine crossing the face.
    expect(walked).toEqual([1, 2, 3, 4, 5]);
  });

  it('FULLEST crosses the face for a better cell, and SWEEP refuses to', () => {
    const rich = 3; // a cell far from the sweeper's next step
    for (const behavior of ['fullest', 'sweep'] as const) {
      const { s, m } = bay();
      const cap = cellCap(s, m);
      s.face.cells = s.face.cells.map(() => cap * 0.1);
      s.face.cells[rich] = cap;
      s.drills.units[0]!.behavior = behavior;
      s.drills.units[0]!.lastCell = 10; // sweep's next step is 11, not 3
      trail(s, m, 1);
      if (behavior === 'fullest') expect(s.drills.units[0]!.lastCell).toBe(rich);
      else expect(s.drills.units[0]!.lastCell).toBe(11);
    }
  });

  it('CHAIN stays beside its own last cell', () => {
    const { s, m } = bay();
    const cap = cellCap(s, m);
    s.face.cells = s.face.cells.map(() => cap * 0.5);
    // A far cell is the richest on the board; chain must still stay local.
    s.face.cells[35] = cap;
    s.drills.units[0]!.behavior = 'chain';
    s.drills.units[0]!.lastCell = 7;
    trail(s, m, 1);
    const landed = s.drills.units[0]!.lastCell;
    const w = s.face.w;
    const dx = Math.abs((landed % w) - (7 % w));
    const dy = Math.abs(Math.floor(landed / w) - Math.floor(7 / w));
    expect(landed).not.toBe(35);
    expect(Math.max(dx, dy)).toBeLessThanOrEqual(1);
  });

  it('and they SPREAD differently — which is the capability each one buys', () => {
    /**
     * The sim prices the axes (`sim.ts --drill-behaviour`): against FULLEST,
     * sweep costs ~17% of two hours' dust and chain ~3%. A cost with no stated
     * benefit is a trap, so this is the benefit, as a number: how much of the
     * face each rule actually touches. SWEEP covers everything; CHAIN works a
     * corner; FULLEST goes wherever the charge is.
     */
    /**
     * ON UNEVEN ROCK, which is the only case where the rules differ. A first
     * cut measured a FULL face and all three read 24 of 36 — on a flat board
     * every cell scores the same and the greedy rule drains them in order like
     * a sweeper, so the instrument said the axes were identical. The rock is
     * refilled to a fixed profile between strikes so the gradient persists,
     * which is what a regenerating face actually does.
     */
    const spread = (behavior: 'fullest' | 'sweep' | 'chain'): number => {
      const { s, m } = bay();
      const cap = cellCap(s, m);
      const profile = s.face.cells.map((_, i) => (i === 12 ? cap : cap * 0.2));
      s.drills.units[0]!.behavior = behavior;
      s.drills.units[0]!.lastCell = 0;
      const seen = new Set<number>();
      const step = drillInterval(s, m, s.drills.units[0]!);
      for (let i = 0; i < 24; i++) {
        s.face.cells = [...profile];
        s.face.ore = [];
        s.drills.units[0]!.timer = 0;
        tickDrills(s, m, ctx, step);
        seen.add(s.drills.units[0]!.lastCell);
      }
      return seen.size;
    };
    const sweep = spread('sweep');
    const chain = spread('chain');
    const fullest = spread('fullest');
    expect(sweep).toBe(24);             // never repeats a cell — total coverage
    expect(fullest).toBe(1);            // camps the one rich cell, forever
    expect(chain).toBeGreaterThan(fullest);
    expect(chain).toBeLessThan(sweep);  // a patch, not the board
  });

  it('...but falls back rather than idling when the patch is worked out', () => {
    // A rule that strands the machine would punish the player for choosing it.
    const { s, m } = bay();
    const cap = cellCap(s, m);
    s.face.cells = s.face.cells.map(() => 0);
    s.face.cells[30] = cap; // nowhere near cell 7
    s.drills.units[0]!.behavior = 'chain';
    s.drills.units[0]!.lastCell = 7;
    trail(s, m, 1);
    expect(s.drills.units[0]!.lastCell).toBe(30);
  });
});

describe('AUTOMATION t2 — the bar is a filter, never a bonus', () => {
  it('a machine under its bar WAITS instead of nibbling', () => {
    const { s, m } = bay();
    const cap = cellCap(s, m);
    s.face.cells = s.face.cells.map(() => cap * 0.2);
    s.drills.units[0]!.minCharge = 0.85;
    const before = s.stats.drillStrikes;
    for (let i = 0; i < 10; i++) tickDrills(s, m, ctx, 2.5);
    expect(s.stats.drillStrikes).toBe(before);
    // ...and strikes the moment the rock comes back over the bar.
    s.face.cells = s.face.cells.map(() => cap);
    tickDrills(s, m, ctx, 2.5);
    expect(s.stats.drillStrikes).toBeGreaterThan(before);
  });

  it('the bar is CHARGE, scaled off cell cap, so it means the same at any size', () => {
    const { s, m } = bay();
    s.drills.units[0]!.minCharge = 0.5;
    const bare = drillBar(s, m, s.drills.units[0]!);
    expect(bare).toBeCloseTo(cellCap(s, m) * 0.5, 6);
    s.upgrades['roots'] = 10;
    m.invalidate();
    expect(drillBar(s, m, s.drills.units[0]!)).toBeGreaterThan(bare);
  });

  it('and it can only ever harvest LESS — that is the pillar-2 argument', () => {
    const take = (bar: number): number => {
      const { s, m } = bay(4);
      const cap = cellCap(s, m);
      s.face.cells = s.face.cells.map((_, i) => cap * (i % 4) / 3);
      for (const u of s.drills.units) u.minCharge = bar || undefined;
      const before = s.stats.drillStrikes;
      for (let i = 0; i < 20; i++) tickDrills(s, m, ctx, 2.5);
      return s.stats.drillStrikes - before;
    };
    expect(take(0.85)).toBeLessThan(take(0));
  });
});

describe('PILLAR 2 — no axis is an input to the ceiling', () => {
  it('a FULL BAY, every axis set, reads the same dpsMax as an empty one', () => {
    const bare = createEngine({ nowMs: 0 }).getState() as GameState;
    const ceiling = dpsMax(bare, new ModifierCache()).toNumber();

    const { s, m } = bay(MAX_DRILLS);
    const behaviours = ['fullest', 'sweep', 'chain'] as const;
    s.face.cells.forEach((_, i) => { void i; });
    s.drills.units.forEach((u, i) => {
      u.behavior = behaviours[i % 3];
      u.minCharge = [0, 0.35, 0.6, 0.85][i % 4];
      u.priority = (['both', 'oresFirst', 'ores', 'rock'] as const)[i % 4];
      u.zone = [i % s.face.cells.length];
      u.level = 20;
    });
    m.invalidate();
    expect(dpsMax(s, m).toNumber()).toBeCloseTo(ceiling, 6);
  });
});

describe('nothing named WEAR survives, because it was never built', () => {
  it('no drill carries a wear field and no action can set one', () => {
    // The axis was CUT on the brief's own test (a number that falls and a
    // payment that raises it). This asserts the cut rather than trusting it —
    // A.52's version reached DrillState, save data and the panel before it was
    // reversed, and a half-present field is how it would come back.
    const { engine, s } = bay();
    const d = s.drills.units[0]! as unknown as Record<string, unknown>;
    for (const dead of ['wear', 'condition', 'durability', 'head', 'bit']) {
      expect(d[dead], dead).toBeUndefined();
    }
    const r = engine.dispatch({ type: 'setDrillWear', index: 0, wear: 1 } as never);
    expect(r.ok).toBe(false);
  });
});
