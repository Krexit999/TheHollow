/**
 * COMPACTION — what survived GRAIN, and the rules it keeps on its own.
 *
 * The grain suite went with the feature. These are the assertions that were
 * never about grain: work packs the rock, the gates open at 8/14/20, the
 * Collapse takes it back, and no machine can farm it.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import {
  CHIP_COMPACTION, COMPACTION_SHOW_AT, DEEP_GATES, MAX_COMPACTION, TERMINAL_GATE,
  compactionAt, ensureCompaction, gateCrossed, resetCompaction,
} from '../systems/compaction';
import { applyFieldSize, cellCap, manualChip, tickFace } from '../systems/face';
import { materialDef, rollDrop } from '../materials';
import { tickDrills, newDrill } from '../systems/drills';

const nullCtx: EngineCtx = { emit() {}, dirty() {} };
function fresh(): { engine: Engine; s: () => GameState; m: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: () => engine.getState() as GameState, m: new ModifierCache() };
}

describe('working a cell packs it', () => {
  it('a chip adds one', () => {
    const { s, m } = fresh();
    manualChip(s(), m, nullCtx, 0);
    expect(compactionAt(s(), 0)).toBe(CHIP_COMPACTION);
  });

  it('a chip that takes nothing packs nothing', () => {
    // Otherwise a player walks every gate open by tapping empty rock.
    const { s, m } = fresh();
    const st = s();
    ensureCompaction(st);
    st.face.cells[0] = 0;
    manualChip(st, m, nullCtx, 0);
    expect(compactionAt(st, 0)).toBe(0);
  });

  it('it climbs to a ceiling and stops, and the cell keeps working', () => {
    const { s, m } = fresh();
    const st = s();
    for (let i = 0; i < 80; i++) {
      st.face.cells[0] = cellCap(st, m);
      const r = manualChip(st, m, nullCtx, 0);
      expect(r.charge).toBeGreaterThan(0); // it never stops giving
    }
    expect(compactionAt(st, 0)).toBe(MAX_COMPACTION);
  });
});

describe('the deep-entry gates', () => {
  it('sit at 8, 14 and 20, deepest first', () => {
    expect(DEEP_GATES.map((g) => g.at)).toEqual([20, 14, 8]);
    expect(DEEP_GATES.map((g) => g.materialId)).toEqual(['deepgrave', 'graveclaydeep', 'umberjade']);
    expect(TERMINAL_GATE).toBe(DEEP_GATES[0]!.at);
  });

  it('the number appears on the chip where it starts paying', () => {
    expect(COMPACTION_SHOW_AT).toBe(DEEP_GATES[DEEP_GATES.length - 1]!.at);
  });

  it('gateCrossed names the deepest gate a single chip jumped', () => {
    expect(gateCrossed(7, 8)).toBe(8);
    expect(gateCrossed(8, 9)).toBeNull();
    expect(gateCrossed(7, 20)).toBe(20); // two gates at once: the better one
  });

  it('deep-entry materials cannot come out of an ordinary chip', () => {
    // `source`-marked, which both drop pools filter on — so the only way to one
    // is to work a cell down to its gate.
    expect(materialDef('deepgrave').source).toBe('deep');
    expect(materialDef('graveclaydeep').source).toBe('deep');
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const d = rollDrop('loam', 400);
      if (d.materialId) seen.add(d.materialId);
    }
    expect(seen.has('deepgrave')).toBe(false);
    expect(seen.has('graveclaydeep')).toBe(false);
  });
});

describe('no machine can farm it', () => {
  it('drills never compact and never collect the gates', () => {
    const { s, m } = fresh();
    const st = s();
    ensureCompaction(st);
    st.drills.bayBuilt = true;
    st.drills.units = [newDrill('Bess'), newDrill('Old Tom')];
    for (let i = 0; i < 4000; i++) tickDrills(st, m, nullCtx, 0.1);
    expect(st.face.compaction!.every((c) => c === 0)).toBe(true);
    expect(st.materials.stacks['deepgrave']).toBeUndefined();
    expect(st.materials.stacks['graveclaydeep']).toBeUndefined();
  });
});

describe('the Collapse takes the work back', () => {
  it('resetCompaction wipes the board', () => {
    const { s } = fresh();
    const st = s();
    ensureCompaction(st);
    st.face.compaction!.fill(MAX_COMPACTION);
    resetCompaction(st);
    expect(st.face.compaction!.every((c) => c === 0)).toBe(true);
  });
});

describe('the array survives the face changing shape', () => {
  it('a wider face keeps compaction on the SAME rock', () => {
    const { s, m } = fresh();
    const st = s();
    ensureCompaction(st);
    st.face.compaction![7] = 12; // row 1, col 1 on a 6-wide grid
    st.upgrades['expand'] = 1;
    applyFieldSize(st, m);
    expect(st.face.w).toBe(7);
    // 6-wide -> 7-wide: (1,1) is index 7 before and index 8 after.
    expect(compactionAt(st, 8)).toBe(12);
  });

  it('a save with no compaction array gets one on the first tick', () => {
    const { s, m } = fresh();
    const st = s();
    delete st.face.compaction;
    tickFace(st, m, nullCtx, 0.1);
    expect(st.face.compaction).toHaveLength(st.face.cells.length);
  });
});

describe('nothing named grain survives', () => {
  const DEAD = ['grain', 'grainGen', 'grainScope', 'bandGrain', 'front', 'locked'];

  it('a fresh face carries none of it', () => {
    const { s, m } = fresh();
    const st = s();
    tickFace(st, m, nullCtx, 0.1);
    manualChip(st, m, nullCtx, 0);
    const face = st.face as unknown as Record<string, unknown>;
    for (const key of DEAD) expect(face[key], key).toBeUndefined();
  });

  it('and a SAVE FROM THE GRAIN BUILD sheds all of it on load', () => {
    // The version above passes on a state that never had the keys, which is no
    // test at all — a live save planted with them is what caught this.
    const { s, m } = fresh();
    const st = s();
    const face = st.face as unknown as Record<string, unknown>;
    face['grain'] = new Array(36).fill(1);
    face['grainGen'] = 2;
    face['grainScope'] = 'cell';
    face['bandGrain'] = 1;
    face['locked'] = new Array(36).fill(false);
    face['front'] = { cell: 3, hops: 2, alive: true, trail: [1, 2], path: [1, 2, 3] };
    tickFace(st, m, nullCtx, 0.1);
    for (const key of DEAD) expect(face[key], key).toBeUndefined();
  });
});
