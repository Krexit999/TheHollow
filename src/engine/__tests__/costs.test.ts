import { describe, expect, it } from 'vitest';
import { D } from '../decimal';
import type { UpgradeDef } from '../upgrades';
import { costForLevels, maxAffordable, nextCost, totalCost } from '../upgrades';

const def = (base: number, ratio: number, maxLevel = 1000): UpgradeDef => ({
  id: 'test',
  name: 'Test',
  description: () => '',
  currency: 'dust',
  baseCost: D(base),
  ratio,
  maxLevel,
  resetsOnCollapse: true,
});

describe('upgrade cost curves', () => {
  it('totalCost(n) = base * (r^n - 1) / (r - 1)', () => {
    const u = def(50, 1.15);
    expect(totalCost(u, 1).toNumber()).toBeCloseTo(50, 6);
    expect(totalCost(u, 2).toNumber()).toBeCloseTo(50 + 50 * 1.15, 6);
    expect(totalCost(u, 10).toNumber()).toBeCloseTo((50 * (1.15 ** 10 - 1)) / 0.15, 4);
  });

  it('the first level costs exactly base (first upgrade = 50 Dust)', () => {
    expect(nextCost(def(50, 1.15), 0).toNumber()).toBe(50);
  });

  it('nextCost matches the totalCost difference', () => {
    const u = def(80, 1.25);
    for (const n of [0, 1, 5, 20]) {
      expect(nextCost(u, n).toNumber()).toBeCloseTo(
        totalCost(u, n + 1).sub(totalCost(u, n)).toNumber(),
        4,
      );
    }
  });

  it('costForLevels sums consecutive level prices', () => {
    const u = def(10, 1.75);
    const manual = nextCost(u, 3).add(nextCost(u, 4)).add(nextCost(u, 5));
    expect(costForLevels(u, 3, 3).toNumber()).toBeCloseTo(manual.toNumber(), 4);
  });

  it('maxAffordable buys the most levels the budget allows, exactly', () => {
    const u = def(50, 1.15);
    for (const budgetN of [0, 49, 50, 107, 108, 1000, 1e6, 1e12]) {
      const budget = D(budgetN);
      const k = maxAffordable(u, 0, budget);
      expect(costForLevels(u, 0, k).lte(budget)).toBe(true);
      if (k < u.maxLevel) {
        expect(costForLevels(u, 0, k + 1).gt(budget)).toBe(true);
      }
    }
  });

  it('maxAffordable respects maxLevel and existing levels', () => {
    const u = def(10, 1.25, 5);
    expect(maxAffordable(u, 3, D(1e9))).toBe(2);
    expect(maxAffordable(u, 5, D(1e9))).toBe(0);
    expect(maxAffordable(u, 0, D(0))).toBe(0);
  });

  it('handles huge Decimal budgets without overflow', () => {
    const u = def(50, 1.15);
    const k = maxAffordable(u, 0, D('1e300'));
    expect(k).toBe(1000); // capped by maxLevel
  });

  it('core tree node: 10 levels of a base-2 r=1.55 node cost ~287 total', () => {
    const u = def(2, 1.55, 10);
    // DESIGN.md quotes ~296; the locked formula gives 287.4 — formula wins.
    expect(totalCost(u, 10).toNumber()).toBeCloseTo(287.44, 1);
  });
});
