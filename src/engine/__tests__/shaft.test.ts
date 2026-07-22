/**
 * THE SHAFT — the column is a place, not a chute.
 *
 * The properties the brief set, as tests:
 *   1. Descent is no longer one-way — you can climb back UP your own column.
 *   2. Cleared depths persist within a run: re-treading them is free; only NEW
 *      ground pays the locked formula. Climb+descend cannot farm XP or descents.
 *   3. Infrastructure (the rail) SURVIVES Collapse and discounts recovery — but
 *      never makes new ground free, so the Collapse loop's floor is untouched.
 *   4. Pillar 2: revisiting a cleared depth is ACCESS, never a second income
 *      stream — a Collapse pays on the deepest point reached, wherever you stand.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { descend } from '../systems/depthSys';
import { climb, extendRail, railDepth, shaftPeak, descendMultiplier, RAIL_DISCOUNT } from '../systems/shaftSys';
import { doCollapse } from '../systems/collapseSys';
import { currentDescendCost, effectiveDescendCost } from '../systems/depthSys';
import { currentShell } from '../shells';
import { coresForDepth } from '../prestigeMath';
import { D } from '../decimal';

const ctx = { emit: () => {}, dirty: () => {} };
const mods = new ModifierCache();

/** A Loam state deep enough to work with, with money and a strong tool. */
function deep(depth = 20): GameState {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.kiln.built = true;
  s.depth = depth;
  s.shaft.reached = depth;
  s.depthRecords['loam'] = depth;
  s.maxDepthRecord = depth;
  s.currencies[currentShell(s).chipCurrencyId] = D(1e12);
  return s;
}

describe('RULE 1 — descent is no longer one-way', () => {
  it('you can climb up your own shaft, free, one step or many', () => {
    const s = deep(20);
    const before = s.currencies[currentShell(s).chipCurrencyId]!;
    expect(climb(s, ctx).ok).toBe(true);
    expect(s.depth).toBe(19);
    expect(climb(s, ctx, 5).ok).toBe(true);
    expect(s.depth).toBe(5);
    // Climbing spends nothing.
    expect(s.currencies[currentShell(s).chipCurrencyId]!.eq(before)).toBe(true);
  });

  it('walks cleared rock in either direction, but refuses uncleared depth or the surface', () => {
    const s = deep(10);
    // Down THROUGH cleared rock is free too (you have been there).
    expect(climb(s, ctx, 4).ok).toBe(true);
    expect(s.depth).toBe(4);
    expect(climb(s, ctx, 9).ok).toBe(true); // back down within cleared
    expect(s.depth).toBe(9);
    // But not past the cleared floor — that is the stair's job.
    expect(climb(s, ctx, 20).ok).toBe(false);
    s.depth = 0;
    expect(climb(s, ctx).ok).toBe(false); // already at the surface
  });
});

describe('RULE 2 — cleared rock is free to re-tread, new ground pays', () => {
  it('walking back down cleared rock costs nothing and grants no XP or descents', () => {
    const s = deep(20);
    climb(s, ctx, 10); // back up to 10, reached still 20
    const money = s.currencies[currentShell(s).chipCurrencyId]!;
    const xp = s.delver.xp;
    const descents = s.stats.descents;
    // Re-descend through cleared rock 10 → 20: every step free.
    for (let i = 0; i < 10; i++) expect(descend(s, mods, ctx).ok).toBe(true);
    expect(s.depth).toBe(20);
    expect(s.currencies[currentShell(s).chipCurrencyId]!.eq(money)).toBe(true); // nothing spent
    expect(s.delver.xp.eq(xp)).toBe(true); // no XP farmed
    expect(s.stats.descents).toBe(descents); // not counted as progress
  });

  it('new ground past the cleared floor pays the locked formula', () => {
    const s = deep(20);
    s.currencies[currentShell(s).chipCurrencyId] = D(1e6); // near the cost, to keep precision
    const money = s.currencies[currentShell(s).chipCurrencyId]!;
    const cost = currentDescendCost(s, mods);
    expect(descendMultiplier(s, 21)).toBe(1); // new ground, full price
    expect(descend(s, mods, ctx).ok).toBe(true);
    expect(s.depth).toBe(21);
    expect(s.shaft.reached).toBe(21); // the floor extended
    const spent = money.sub(s.currencies[currentShell(s).chipCurrencyId]!);
    expect(spent.div(cost).toNumber()).toBeCloseTo(1, 6);
  });
});

describe('RULE 3 — the rail survives Collapse and bounds recovery', () => {
  it('a rail is laid with Cores and discounts re-descent to railed rock', () => {
    const s = deep(20);
    s.currencies['core'] = D(100);
    expect(extendRail(s, ctx).ok).toBe(true);
    expect(railDepth(s)).toBe(20);

    // As if just Collapsed: reached back to 0, depth 0, rail intact.
    s.depth = 0;
    s.shaft.reached = 0;
    // The next step (depth 1) is railed → discounted.
    const full = currentDescendCost(s, mods);
    const eff = effectiveDescendCost(s, mods);
    expect(eff.div(full).toNumber()).toBeCloseTo(RAIL_DISCOUNT, 6);
  });

  it('the rail NEVER discounts new ground — the loop floor is untouched', () => {
    const s = deep(20);
    s.currencies['core'] = D(100);
    extendRail(s, ctx); // rail to 20
    // Standing at the rail head, the next step is NEW ground: full price.
    expect(descendMultiplier(s, 21)).toBe(1);
  });

  it('the rail persists through a Collapse; the run floor does not', () => {
    const s = deep(60); // deep enough to yield Cores
    s.currencies['core'] = D(100);
    extendRail(s, ctx);
    expect(railDepth(s)).toBe(60);
    const r = doCollapse(s, mods, ctx);
    expect(r.ok).toBe(true);
    expect(s.depth).toBe(0);
    expect(s.shaft.reached).toBe(0); // the run washed
    expect(railDepth(s)).toBe(60); // the rail held
  });
});

describe('RULE 4 — revisiting is access, never income', () => {
  it('a Collapse pays on the deepest point reached, even after climbing up', () => {
    const s = deep(60);
    climb(s, ctx, 5); // stand shallow, at depth 5
    expect(s.depth).toBe(5);
    expect(shaftPeak(s)).toBe(60); // but the run reached 60
    const rDeep = doCollapse(s, mods, ctx);
    expect(rDeep.ok).toBe(true);
    const cores = (rDeep.data as { cores: { toNumber: () => number } }).cores.toNumber();
    // The fall paid the depth-60 yield, not the depth-5 one (which is zero).
    expect(cores).toBe(coresForDepth(60).toNumber());
    expect(coresForDepth(5).toNumber()).toBe(0);
  });

  it('re-treading gives no charge — the face at a shallow depth simply earns less', () => {
    // Nothing in the shaft grants currency on its own; movement is free BOTH ways.
    const s = deep(30);
    const money = s.currencies[currentShell(s).chipCurrencyId]!;
    climb(s, ctx, 0);
    for (let i = 0; i < 30; i++) descend(s, mods, ctx);
    expect(s.currencies[currentShell(s).chipCurrencyId]!.eq(money)).toBe(true);
  });
});

describe('migration & resets', () => {
  it('a fresh run after Collapse re-charges for the descent (no free ride)', () => {
    const s = deep(60);
    doCollapse(s, mods, ctx);
    // reached is 0 and there is no rail: the first step costs full price.
    expect(descendMultiplier(s, 1)).toBe(1);
  });
});
