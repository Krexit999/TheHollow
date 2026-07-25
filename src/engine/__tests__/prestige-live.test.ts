/**
 * THE PRESTIGE LADDER, THROUGH THE LIVE PATH (A.44 twin audit).
 *
 * `prestige.test.ts` asserts the five ladder formulas as ALGEBRA. That suite
 * stayed green through the entire A.44 re-rate while the game did the opposite,
 * because two of the five formulas had DEAD TWINS: `axiomsForEchoes` and
 * `spiralFor` lived in `prestigeMath.ts` referenced by nothing but that test
 * file, while `doRecursion` and `spiralPending` granted from separate hardcoded
 * copies in `recursionSys.ts` and `spiral.ts`. Re-rating the tested copy changed
 * no behaviour at all, and only a live-path test noticed.
 *
 * So these tests never import a formula to compare against itself. Every one
 * DISPATCHES the real action and reads the PURSE. If a twin is ever
 * reintroduced, the formula suite will keep passing and this one will not.
 *
 * The rule this enforces is the project's own, from PILLARS: "a test that a
 * function works is not a test that anything calls it" — sharpened by A.44 into
 * its nastiest form, a LIVE system shadowed by a dead twin with the tests
 * guarding the twin.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { D } from '../decimal';
import { getCurrency } from '../resources';
import { coresForDepth, echoesForCores, axiomsForEchoes, spiralFor } from '../prestigeMath';
import { gridSlotCost, licenceCost } from '../systems/spiral';

const fresh = (): { engine: ReturnType<typeof createEngine>; s: GameState } => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};

describe('the prestige ladder pays what the formula says — through dispatch', () => {
  it('COLLAPSE grants coresForDepth(peak) into the purse', () => {
    const { engine, s } = fresh();
    s.depth = 120;
    s.maxDepthRecord = 120;
    s.shaft.reached = 120;
    const before = getCurrency(s, 'core').toNumber();
    expect(engine.dispatch({ type: 'collapse' }).ok).toBe(true);
    const after = getCurrency(engine.getState() as GameState, 'core').toNumber();
    expect(after - before).toBe(coresForDepth(120).toNumber());
    expect(after - before).toBeGreaterThan(0); // a formula that pays nothing proves nothing
  });

  it('BREACH grants echoesForCores(coresThisBreach) into the purse', () => {
    const { engine, s } = fresh();
    // Stand on the floor with every gate open: warden felled, keystone set.
    s.depth = 150;
    s.maxDepthRecord = 150;
    s.combat.wardens.push('loam');
    s.keystones.placed.push('loam');
    s.shell.coresEarnedThisBreach = D(800);
    const expected = echoesForCores(D(800)).toNumber();
    expect(engine.dispatch({ type: 'breach' }).ok).toBe(true);
    expect(getCurrency(engine.getState() as GameState, 'echo').toNumber()).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('RECURSION grants axiomsForEchoes(lifetime echoes) into the purse', () => {
    const { engine, s } = fresh();
    s.shell.current = 'aleph';
    s.aleph.coreTouched = true;
    s.totals['echo'] = D(75);
    const expected = axiomsForEchoes(D(75)).toNumber();
    expect(engine.dispatch({ type: 'recurse' }).ok).toBe(true);
    const n = engine.getState() as GameState;
    expect(getCurrency(n, 'axiom').toNumber()).toBe(expected);
    expect(n.recursion.axiomsEarned).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('SPIRAL grants spiralFor(axiomsEarned, recursions) into the purse', () => {
    const { engine, s } = fresh();
    s.recursion.count = 4;
    s.recursion.axiomsEarned = 20;
    const expected = spiralFor(D(20), 4).toNumber();
    expect(engine.dispatch({ type: 'spiral' }).ok).toBe(true);
    expect(getCurrency(engine.getState() as GameState, 'spiral').toNumber()).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('a GRID SLOT debits gridSlotCost(owned) from the purse', () => {
    const { engine, s } = fresh();
    s.recursion.count = 1;
    s.currencies['spiral'] = D(50);
    const cost = gridSlotCost(s.spiral.slots);
    expect(engine.dispatch({ type: 'buyGridSlot' }).ok).toBe(true);
    const n = engine.getState() as GameState;
    expect(getCurrency(n, 'spiral').toNumber()).toBe(50 - cost);
    expect(n.spiral.slots).toBe(1);
  });

  it('a WORLD LICENCE debits licenceCost(owned) from the purse', () => {
    const { engine, s } = fresh();
    s.recursion.count = 1;
    s.currencies['spiral'] = D(50);
    const cost = licenceCost(s.spiral.licences);
    expect(engine.dispatch({ type: 'buyLicence' }).ok).toBe(true);
    const n = engine.getState() as GameState;
    expect(getCurrency(n, 'spiral').toNumber()).toBe(50 - cost);
    expect(n.spiral.licences).toBe(1);
  });
});

describe('the re-rate is reachable, measured at the live path', () => {
  /**
   * The bug in one assertion. Before A.44 this sequence — seven Breaches at the
   * measured haul, then a Recursion — put ZERO Axioms in the purse, and twenty
   * Axioms are authored. It is deliberately end-to-end rather than arithmetic:
   * the arithmetic version passed the whole time.
   */
  it('seven breaches at the measured haul buy a first Axiom', () => {
    const { engine, s } = fresh();
    const perBreach = echoesForCores(D(508)); // sim-out/a43, Breach 1
    s.shell.current = 'aleph';
    s.aleph.coreTouched = true;
    s.totals['echo'] = perBreach.mul(7);
    expect(engine.dispatch({ type: 'recurse' }).ok).toBe(true);
    const got = getCurrency(engine.getState() as GameState, 'axiom').toNumber();
    expect(got).toBeGreaterThanOrEqual(1);
    expect(got).toBeLessThanOrEqual(5); // reachable, not trivial
  });
});
