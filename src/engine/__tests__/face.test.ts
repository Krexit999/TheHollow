import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { GameState } from '../types';

function fresh() {
  return createEngine({ nowMs: 0 });
}

describe('the face (locked formulas)', () => {
  it('opens at 6x6 = 36 cells, cap 8, all full', () => {
    const s = fresh().getState();
    expect(s.face.w).toBe(6);
    expect(s.face.h).toBe(6);
    expect(s.face.cells).toHaveLength(36);
    expect(s.face.cells.every((c) => c === 8)).toBe(true);
  });

  it('a full-cell chip at Blade 0 yields exactly 8 dust', () => {
    const engine = fresh();
    const result = engine.dispatch({ type: 'chip', cell: 0 });
    expect(result.ok).toBe(true);
    expect(engine.getState().currencies['dust']!.toNumber()).toBeCloseTo(8, 6);
    expect(engine.getState().face.cells[0]).toBe(0);
  });

  it('regen refills at 0.08/sec/cell toward cap', () => {
    const engine = fresh();
    engine.dispatch({ type: 'chip', cell: 0 });
    engine.tick(10); // 100 steps
    const charge = engine.getState().face.cells[0]!;
    expect(charge).toBeCloseTo(0.8, 5);
  });

  it('idle ceiling at open is 2.88 dust/sec equivalent (36 * 0.08 * 1)', () => {
    const engine = fresh();
    const s = engine.getState();
    // Drain everything, then let it regen 10s: total charge gained = 28.8.
    for (let i = 0; i < 36; i++) engine.dispatch({ type: 'chip', cell: i });
    const drained = s.face.cells.reduce((a, b) => a + b, 0);
    expect(drained).toBe(0);
    engine.tick(10);
    const refilled = engine.getState().face.cells.reduce((a, b) => a + b, 0);
    expect(refilled).toBeCloseTo(28.8, 3);
  });

  it('first upgrade (50 Dust) is reachable in ~7 chips ~ 4 seconds', () => {
    const engine = fresh();
    for (let i = 0; i < 7; i++) engine.dispatch({ type: 'chip', cell: i });
    expect(engine.getState().currencies['dust']!.gte(50)).toBe(true);
    const buy = engine.dispatch({ type: 'buyUpgrade', id: 'blade' });
    expect(buy.ok).toBe(true);
    expect(engine.getState().upgrades['blade']).toBe(1);
  });

  it('Blade scales yield: Y = 1 + 0.35 * Blade', () => {
    const engine = fresh();
    const s = engine.getState() as GameState;
    s.upgrades['blade'] = 10;
    engine.dispatch({ type: 'chip', cell: 0 });
    // 8 charge * (1 + 3.5) = 36 dust
    expect(s.currencies['dust']!.toNumber()).toBeCloseTo(8 * 4.5, 4);
  });

  it('Roots scales cap: 8 * (1 + 0.5 * Roots); Soil scales regen', () => {
    const engine = fresh();
    const s = engine.getState() as GameState;
    s.upgrades['roots'] = 2; // cap 16
    s.upgrades['soil'] = 4; // regen 0.16
    engine.dispatch({ type: 'chip', cell: 0 });
    engine.tick(10);
    expect(s.face.cells[0]!).toBeCloseTo(1.6, 4);
    engine.tick(1000); // plenty — should stop at cap 16
    expect(s.face.cells[0]!).toBeCloseTo(16, 4);
  });
});
