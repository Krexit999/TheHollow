import { describe, expect, it } from 'vitest';
import { D } from '../decimal';
import {
  axiomsForEchoes,
  coresForDepth,
  descendCost,
  echoesForCores,
  offlineEfficiency,
  spiralFor,
  xpToLevel,
} from '../prestigeMath';

describe('prestige formulas (locked)', () => {
  it('Cores = floor(2 * (Depth/40)^1.5)', () => {
    expect(coresForDepth(0).toNumber()).toBe(0);
    expect(coresForDepth(25).toNumber()).toBe(0);
    expect(coresForDepth(26).toNumber()).toBe(1); // first core
    expect(coresForDepth(40).toNumber()).toBe(2); // first collapse target
    expect(coresForDepth(100).toNumber()).toBe(Math.floor(2 * 2.5 ** 1.5));
    expect(coresForDepth(200).toNumber()).toBe(Math.floor(2 * 5 ** 1.5));
  });

  it('Echoes = floor(3 * (Cores/200)^0.6) — divisor re-rated A.44', () => {
    expect(echoesForCores(D(0)).toNumber()).toBe(0);
    expect(echoesForCores(D(200)).toNumber()).toBe(3);
    expect(echoesForCores(D(2000)).toNumber()).toBe(Math.floor(3 * 10 ** 0.6));
  });

  it('Axioms = floor((TotalEchoes/8)^0.8) — divisor re-rated A.44', () => {
    expect(axiomsForEchoes(D(0)).toNumber()).toBe(0);
    expect(axiomsForEchoes(D(8)).toNumber()).toBe(1);
    expect(axiomsForEchoes(D(80)).toNumber()).toBe(Math.floor(10 ** 0.8));
  });

  /**
   * THE REGRESSION THAT MATTERS (A.44). The two divisors above were sized for
   * a Collapse cadence of 30–60/shell, which A.42 voided; at the real cadence
   * a COMPLETE FIRST RECURSION paid zero Axioms, and the Axioms are where the
   * fold-down lives. The formulas were individually correct and individually
   * tested the whole time — the tests asserted the shape and never asked what
   * the shape PAID at the rate the game actually runs at.
   *
   * So this asserts the outcome, not the algebra: seven breaches at the
   * measured Breach-1 haul must buy at least one Axiom, and must not buy ten.
   */
  it('a complete first Recursion earns its first Axiom (and not ten)', () => {
    const perBreach = echoesForCores(D(508)); // measured, sim-out/a43
    const firstRecursion = perBreach.mul(7);
    const got = axiomsForEchoes(firstRecursion).toNumber();
    expect(got).toBeGreaterThanOrEqual(1);
    expect(got).toBeLessThanOrEqual(5);
  });

  /** The natural player breaches on REACHING the floor, not after farming to
   *  500 — ~130 cores in Loam. That case used to pay its first Axiom at
   *  Recursion FOUR, so it is the one worth pinning. */
  it('even a light first Recursion (~130 cores/breach) earns an Axiom', () => {
    expect(axiomsForEchoes(echoesForCores(D(130)).mul(7)).toNumber()).toBeGreaterThanOrEqual(1);
  });

  it('Spiral = floor(sqrt(TotalAxioms) * RecursionCount)', () => {
    expect(spiralFor(D(0), 3).toNumber()).toBe(0);
    expect(spiralFor(D(16), 3).toNumber()).toBe(12);
  });

  it('dustCost: the 1.09 spine to 150 (doc anchors), then the Deep Taper (A.16)', () => {
    expect(descendCost(40).toNumber()).toBeCloseTo(785, 0);
    expect(descendCost(100).toNumber() / 1e3).toBeCloseTo(138, 0);
    // The spine is bit-identical through 150 — every early beat untouched.
    expect(descendCost(150).toNumber()).toBeCloseTo(25 * Math.pow(1.09, 150), -3);
    // Past 150 the deep compounds at 1.035, past 300 the abyss at 1.02.
    expect(descendCost(200).toNumber()).toBeCloseTo(25 * Math.pow(1.09, 150) * Math.pow(1.035, 50), -4);
    expect(descendCost(250).toNumber() / descendCost(150).toNumber()).toBeCloseTo(Math.pow(1.035, 100), -2);
    expect(descendCost(350).toNumber() / descendCost(300).toNumber()).toBeCloseTo(Math.pow(1.02, 50), -1);
  });

  it('xpToLevel(L) = 100 * L^1.9', () => {
    expect(xpToLevel(1).toNumber()).toBe(100);
    expect(xpToLevel(10).toNumber()).toBeCloseTo(100 * 10 ** 1.9, 4);
  });

  it('offline efficiency = 0.55 + bonus, clamped to 0.95', () => {
    expect(offlineEfficiency(0)).toBeCloseTo(0.55);
    expect(offlineEfficiency(0.03 * 5)).toBeCloseTo(0.7);
    expect(offlineEfficiency(0.03 * 10)).toBeCloseTo(0.85);
    expect(offlineEfficiency(0.99)).toBe(0.95); // clamp
  });
});
