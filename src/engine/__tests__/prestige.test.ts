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

  it('Echoes = floor(3 * (Cores/500)^0.6)', () => {
    expect(echoesForCores(D(0)).toNumber()).toBe(0);
    expect(echoesForCores(D(500)).toNumber()).toBe(3);
    expect(echoesForCores(D(5000)).toNumber()).toBe(Math.floor(3 * 10 ** 0.6));
  });

  it('Axioms = floor((TotalEchoes/25)^0.8)', () => {
    expect(axiomsForEchoes(D(0)).toNumber()).toBe(0);
    expect(axiomsForEchoes(D(25)).toNumber()).toBe(1);
    expect(axiomsForEchoes(D(250)).toNumber()).toBe(Math.floor(10 ** 0.8));
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
