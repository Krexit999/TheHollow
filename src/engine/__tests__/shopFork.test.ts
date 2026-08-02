/**
 * SHOP FORKS — the pillar-2 guarantee, which holds regardless of whether the
 * §40.2 CHOICE claim holds.
 *
 * The falsification (`scripts/sim-shop-fork.ts`) FAILED on all three rows: no
 * switching policy beat both single-side policies. That is a design finding
 * about whether the fork is a real choice. It is NOT a safety question — the
 * packed side cannot move the ceiling by construction, and these are the tests
 * that say so, so the substrate is safe to leave in place while the choice is
 * re-ruled.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { EngineCtx, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { dpsMax } from '../systems/face';
import {
  FORKED_ROWS, HOLD_CAP, biteBonus, ensureShop, holdFloor, incomeLevels,
  packedLevels, settleMult,
} from '../systems/shopFork';
import { resetCompaction } from '../systems/compaction';
import { stat } from '../upgrades';

const ctx: EngineCtx = { emit() {}, dirty() {} };
const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};

describe('PILLAR 2 — the packed side cannot raise the ceiling', () => {
  it('a fully PACKED shop reads a LOWER dpsMax than a fully INCOME one, never higher', () => {
    const { s } = fresh();
    const m = new ModifierCache();
    for (const id of FORKED_ROWS) s.upgrades[id] = 20;
    m.invalidate();
    const allIncome = dpsMax(s, m).toNumber();

    const sh = ensureShop(s);
    for (const id of FORKED_ROWS) sh.packed[id] = 20;
    m.invalidate();
    const allPacked = dpsMax(s, m).toNumber();

    expect(allPacked).toBeLessThan(allIncome);
    // ...and it lands exactly on the no-levels ceiling, because a packed level
    // is not an input to the formula at all.
    const bare = fresh();
    expect(allPacked).toBeCloseTo(dpsMax(bare.s, new ModifierCache()).toNumber(), 6);
  });

  it('`stat` is the single seam — packed levels never reach a formula', () => {
    const { s } = fresh();
    s.upgrades['blade'] = 10;
    expect(stat(s, 'blade')).toBe(10);
    ensureShop(s).packed['blade'] = 4;
    expect(stat(s, 'blade')).toBe(6);
    expect(incomeLevels(s, 'blade') + packedLevels(s, 'blade')).toBe(10);
  });

  it('an unforked row is untouched by any of this', () => {
    const { s } = fresh();
    s.upgrades['lantern'] = 7;
    ensureShop(s).packed['lantern'] = 5; // nonsense, and ignored
    expect(stat(s, 'lantern')).toBe(7);
    expect(packedLevels(s, 'lantern')).toBe(0);
  });

  it('packed can never exceed the level it is a subset of', () => {
    const { s } = fresh();
    s.upgrades['soil'] = 3;
    ensureShop(s).packed['soil'] = 99;
    expect(packedLevels(s, 'soil')).toBe(3);
    expect(stat(s, 'soil')).toBe(0); // clamped, never negative
  });
});

describe('the three packed sides are three DIFFERENT behaviours', () => {
  it('BITE packs harder, SETTLE rolls better, HOLD survives the fall', () => {
    const { s } = fresh();
    const sh = ensureShop(s);
    for (const id of FORKED_ROWS) s.upgrades[id] = 20;

    sh.packed['blade'] = 8;
    expect(biteBonus(s)).toBeGreaterThan(0);
    expect(settleMult(s)).toBe(1);   // blade does not touch the gate roll
    expect(holdFloor(s)).toBe(0);    // ...nor the fall

    sh.packed['blade'] = 0; sh.packed['soil'] = 8;
    expect(biteBonus(s)).toBe(0);
    expect(settleMult(s)).toBeGreaterThan(1);
    expect(holdFloor(s)).toBe(0);

    sh.packed['soil'] = 0; sh.packed['roots'] = 20;
    expect(biteBonus(s)).toBe(0);
    expect(settleMult(s)).toBe(1);
    expect(holdFloor(s)).toBeGreaterThan(0);
  });

  it('HOLD is capped at the FIRST gate — the Collapse never banks the terminal table', () => {
    const { s } = fresh();
    s.upgrades['roots'] = 40;
    ensureShop(s).packed['roots'] = 40;
    expect(holdFloor(s)).toBe(HOLD_CAP);
    expect(HOLD_CAP).toBeLessThan(20); // strictly under the terminal gate
    resetCompaction(s, holdFloor(s));
    expect(s.face.compaction!.every((c) => c === HOLD_CAP)).toBe(true);
  });

  it('a reset with no HOLD is the old behaviour, byte for byte', () => {
    const { s } = fresh();
    s.face.compaction = s.face.cells.map(() => 22);
    resetCompaction(s);
    expect(s.face.compaction!.every((c) => c === 0)).toBe(true);
  });
});

describe('the buy path records the branch', () => {
  it('a packed buy raises packed; an income buy does not', () => {
    const { engine, s } = fresh();
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e9 });
    engine.dispatch({ type: 'buyUpgrade', id: 'blade', branch: 'income' });
    expect(packedLevels(s, 'blade')).toBe(0);
    engine.dispatch({ type: 'buyUpgrade', id: 'blade', branch: 'packed' });
    expect(packedLevels(s, 'blade')).toBe(1);
    // The row's own level counts both, so cost and cap are unchanged.
    expect(s.upgrades['blade']).toBe(2);
    void ctx;
  });

  it('omitting the branch is INCOME — every existing caller keeps its behaviour', () => {
    const { engine, s } = fresh();
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e9 });
    engine.dispatch({ type: 'buyUpgrade', id: 'blade' });
    expect(packedLevels(s, 'blade')).toBe(0);
    expect(stat(s, 'blade')).toBe(1);
  });
});
