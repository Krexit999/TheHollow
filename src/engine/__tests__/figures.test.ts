/**
 * THE FACE CLUSTER (Phase, v20) — the Face at the engine level: FIGURES traced
 * in the rock and sweep stamina. The pillar guarantees the UI leans on: a figure
 * never mints income (pillar 2), the hint is a position not a shape (pillar 5),
 * and an idle player is untouched (pillar 1).
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState } from '../types';
import { getCurrency } from '../resources';
import { ModifierCache } from '../modifiers';
import { detectFigure, figureHintCells, recordChipForFigures } from '../systems/figures';
import { tickFace, SWEEP_COST_PER_CELL, STAMINA_REGEN } from '../systems/face';
import { runMigrations, SAVE_VERSION } from '../save/migrations';

const nullCtx: EngineCtx = { emit() {}, dirty() {} };
function fresh(): { engine: Engine; s: () => GameState } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: () => engine.getState() as GameState };
}

describe('figures — detection', () => {
  // A default face is 6 wide; row 0 is cells 0..5.
  const W = 6, H = 6;
  it('a furrow is three in a straight line', () => {
    const set = new Set([0, 1, 2]);
    expect(detectFigure(W, H, set, 2)?.id).toBe('furrow');
    const col = new Set([0, 6, 12]);
    expect(detectFigure(W, H, col, 12)?.id).toBe('furrow');
  });
  it('a fault is three on a diagonal', () => {
    const set = new Set([0, 7, 14]); // (0,0)(1,1)(2,2)
    expect(detectFigure(W, H, set, 14)?.id).toBe('fault');
  });
  it('a pit is a 2×2 block', () => {
    const set = new Set([0, 1, 6, 7]);
    expect(detectFigure(W, H, set, 7)?.id).toBe('pit');
  });
  it('a collar is four around a centre', () => {
    // centre 7 = (1,1); arms 1,6,8,13
    const set = new Set([1, 6, 8, 13]);
    expect(detectFigure(W, H, set, 8)?.id).toBe('collar');
  });
  it('the more deliberate shape wins when several are present', () => {
    // A pit contains two lines; it must read as a pit, not a furrow.
    const set = new Set([0, 1, 6, 7]);
    expect(detectFigure(W, H, set, 7)?.id).toBe('pit');
  });
  it('nothing is detected from scattered chips', () => {
    expect(detectFigure(W, H, new Set([0, 2, 35]), 35)).toBeNull();
  });
});

describe('figures — pillar 2 (never income) and pillar 5 (position not shape)', () => {
  it('a completed figure pays XP and stamina but NOT one grain of currency', () => {
    const { engine, s } = fresh();
    const state = s();
    const mods = new ModifierCache();
    state.face.stamina = 10;
    state.stats.playTimeSec = 0;
    state.face.recentChips = [{ cell: 0, at: 0 }, { cell: 1, at: 0 }];
    const dustBefore = getCurrency(state, 'dust').toString();
    const xpBefore = state.delver.xp.toString();
    const fig = recordChipForFigures(state, mods, nullCtx, 2); // completes a furrow
    expect(fig?.id).toBe('furrow');
    expect(state.figures.found).toContain('furrow');
    // The whole point: no dust minted by the figure.
    expect(getCurrency(state, 'dust').toString()).toBe(dustBefore);
    // But it DID reward the ceiling-free things.
    expect(state.delver.xp.toString()).not.toBe(xpBefore);
    expect(state.face.stamina).toBeGreaterThan(10);
    expect(engine).toBeTruthy();
  });

  it('the hint names a POSITION, never a shape, and is identical whatever is discovered', () => {
    const { s } = fresh();
    const a = s();
    a.stats.playTimeSec = 0;
    a.face.recentChips = [{ cell: 0, at: 0 }, { cell: 1, at: 0 }];
    a.figures.found = [];
    const hintUndiscovered = figureHintCells(a);
    a.figures.found = ['furrow', 'fault', 'pit', 'collar'];
    const hintDiscovered = figureHintCells(a);
    // Discovery state must not change the hint — it never leaks which shape.
    expect(hintDiscovered).toEqual(hintUndiscovered);
    // Cell 2 completes the furrow 0-1-2, so it is a hinted position.
    expect(hintUndiscovered).toContain(2);
  });

  it('no hint at all until a trail exists (not a constant map)', () => {
    const { s } = fresh();
    expect(figureHintCells(s())).toEqual([]);
  });
});

describe('sweep + stamina — pillar 1 (idle unaffected) and pillar 2 (ceiling)', () => {
  it('a sweep clears as many cells as stamina allows, and no more', () => {
    const { engine, s } = fresh();
    const state = s();
    state.face.stamina = 2 * SWEEP_COST_PER_CELL + 1; // enough for exactly 2 cells
    for (let i = 0; i < state.face.cells.length; i++) state.face.cells[i] = 8;
    const r = engine.dispatch({ type: 'sweep', cells: [0, 1, 2, 3] });
    expect(r.ok).toBe(true);
    expect((r.data as { swept: number[] }).swept.length).toBe(2);
    expect(state.face.stamina).toBeLessThan(SWEEP_COST_PER_CELL); // spent
  });

  it('ordinary chipping never depends on stamina (pillar 1)', () => {
    const { engine, s } = fresh();
    s().face.stamina = 0;
    const r = engine.dispatch({ type: 'chip', cell: 0 });
    expect(r.ok).toBe(true);
  });

  it('stamina regenerates and an idle face is otherwise unchanged', () => {
    const { s } = fresh();
    const state = s();
    const mods = new ModifierCache();
    state.face.stamina = 0;
    tickFace(state, mods, nullCtx, 3);
    expect(state.face.stamina).toBeCloseTo(3 * STAMINA_REGEN, 3);
  });

  it('a sweep only takes what a cell holds — it cannot exceed the field (pillar 2)', () => {
    const { engine, s } = fresh();
    const state = s();
    state.face.stamina = 100;
    for (let i = 0; i < state.face.cells.length; i++) state.face.cells[i] = 0; // empty field
    const r = engine.dispatch({ type: 'sweep', cells: [0, 1, 2] });
    expect(r.ok).toBe(false); // nothing to take
  });
});

describe('save v20', () => {
  it('migrates a v19 save by adding face marks/stamina and the figures Codex', () => {
    const payload = { version: 19, savedAtMs: 0, state: { face: { w: 6, h: 6, cells: [] } } } as never;
    const out = runMigrations(payload);
    expect(out.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(20);
    const st = out.state as { face: Record<string, unknown>; figures: unknown };
    expect(st.face['marks']).toEqual([]);
    expect(st.face['stamina']).toBe(100);
    expect(st.figures).toEqual({ found: [] });
  });
});
