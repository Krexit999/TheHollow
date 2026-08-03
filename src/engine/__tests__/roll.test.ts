/**
 * THE ROLL (§1, §1.1) — the ladder of named places.
 *
 * The four claims the proof rests on: the fog shows exactly three, a WALL says
 * only that it is too hard until the tool can answer it, clearance is permanent
 * through a Collapse, and a station keeps its name and depth while its contents
 * come up different.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { LOAM_ROLL } from '../content/shell1/roll';
import {
  HAZARD_MAX, HAZARD_MIN, LEGIBLE_AHEAD, contentsOf, ensureRoll, floorRow, isCleared,
  isLooted, markReached, rerollRoll, rollRows, typeOf,
} from '../systems/roll';

function fresh(): { engine: Engine; s: () => GameState; m: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: () => engine.getState() as GameState, m: new ModifierCache() };
}

describe('the Loam stations', () => {
  /**
   * SEVENTEEN SINCE A.77, and the two additions are deliberate. §1.3 authored
   * fifteen and none of them was a REST — while `rest` sat in `StationType`
   * and in the label map the whole time. §40.1 gates gear swapping on standing
   * at one, so the rule had no door: every swap would have refused forever.
   * The Lampline (33) and the Low Bench (80) fill depths that were empty, one
   * in each half of the run. Nothing authored moved.
   */
  it('are the §1.3 names at their specified depths, plus the two RESTs', () => {
    expect(LOAM_ROLL).toHaveLength(17);
    expect(LOAM_ROLL.map((s) => s.depth)).toEqual([0, 9, 17, 28, 33, 40, 44, 47, 60, 72, 80, 90, 98, 109, 120, 135, 150]);
    expect(LOAM_ROLL[0]!.name).toBe('The Turnrow');
    const last = LOAM_ROLL[LOAM_ROLL.length - 1]!;
    expect(last.name).toBe('DEEPGRAVE');
    expect(last.type).toBe('floor');
    // The fifteen authored rows are untouched — this is an addition, not an edit.
    expect(LOAM_ROLL.filter((s) => s.type !== 'rest').map((s) => s.depth))
      .toEqual([0, 9, 17, 28, 40, 44, 47, 60, 72, 90, 98, 109, 120, 135, 150]);
  });

  it('the two WALLS name the hardness walls that already existed', () => {
    // BRICKLIGHT 44 sits above the shell's tier-II wall at 45, THE KNOT 109
    // above tier III at 110. The Roll gives the existing gates a face rather
    // than adding a second one beside them.
    const walls = LOAM_ROLL.filter((s) => s.type === 'wall');
    expect(walls.map((w) => [w.name, w.depth, w.hardness])).toEqual([
      ['BRICKLIGHT', 44, 2],
      ['THE KNOT', 109, 3],
    ]);
  });

  it('depths ascend, so the ladder reads top to bottom', () => {
    for (let i = 1; i < LOAM_ROLL.length; i++) {
      expect(LOAM_ROLL[i]!.depth).toBeGreaterThan(LOAM_ROLL[i - 1]!.depth);
    }
  });
});

describe('the visibility rule', () => {
  it('exactly three ahead are legible, the rest are a name and a depth', () => {
    const { s } = fresh();
    const rows = rollRows(s());
    const ahead = rows.filter((r) => !r.behind);
    expect(ahead.slice(0, LEGIBLE_AHEAD).every((r) => r.legible)).toBe(true);
    expect(ahead.slice(LEGIBLE_AHEAD).some((r) => r.legible)).toBe(false);
  });

  it('the floor is pinned from the moment you enter the shell', () => {
    const { s } = fresh();
    const f = floorRow(s())!;
    expect(f.def.name).toBe('DEEPGRAVE');
    expect(f.def.depth).toBe(150);
    // It is far past the lamp at depth 0 — illegible, and still listed.
    expect(f.legible).toBe(false);
  });

  it('the window moves down with the player', () => {
    const { s } = fresh();
    const st = s();
    st.depth = 60;
    const rows = rollRows(st);
    const firstAhead = rows.find((r) => !r.behind)!;
    expect(firstAhead.def.depth).toBe(72);
    expect(firstAhead.current).toBe(true);
    // ...and rock you have already walked stays readable. Fog is about what is
    // ahead of the lamp; a road you have walked is not a rumour.
    expect(rows.filter((r) => r.behind).every((r) => r.legible)).toBe(true);
  });
});

describe('a WALL', () => {
  it('is not cleared by squeezing past it under-tier', () => {
    // The wall is a price, not a door (A.70) — you CAN descend under-tooled.
    // Paying the fare is not the same as breaking it.
    const { s } = fresh();
    const st = s();
    markReached(st, 50, 1); // past BRICKLIGHT at 44, with a tier-I tool
    expect(isCleared(st, 'bricklight')).toBe(false);
  });

  it('is cleared by passing it with the tool it asks for', () => {
    const { s } = fresh();
    const st = s();
    markReached(st, 50, 2);
    expect(isCleared(st, 'bricklight')).toBe(true);
  });

  it('and the clearance SURVIVES A COLLAPSE — you keep the road', () => {
    const { engine, s, m } = fresh();
    const st = s();
    markReached(st, 50, 2);
    expect(isCleared(st, 'bricklight')).toBe(true);
    // Drive a real Collapse through the engine, not a hand-rolled reset.
    st.depth = 60;
    st.shaft.reached = 60;
    engine.dispatch({ type: 'collapse' });
    const after = engine.getState() as GameState;
    expect(after.depth).toBe(0);            // the fall really happened
    expect(isCleared(after, 'bricklight')).toBe(true);
    void m;
  });
});

describe('a WRECK', () => {
  it('becomes a WORKS once looted, permanently', () => {
    const { s } = fresh();
    const st = s();
    const kilnYard = LOAM_ROLL.find((d) => d.id === 'kilnyard')!;
    expect(typeOf(st, kilnYard)).toBe('wreck');
    markReached(st, 9, 1);
    expect(isLooted(st, 'kilnyard')).toBe(true);
    expect(typeOf(st, kilnYard)).toBe('works');
  });

  it('and stays a WORKS through a Collapse', () => {
    const { engine, s } = fresh();
    const st = s();
    markReached(st, 30, 1);
    st.depth = 60;
    st.shaft.reached = 60;
    engine.dispatch({ type: 'collapse' });
    const after = engine.getState() as GameState;
    expect(isLooted(after, 'kilnyard')).toBe(true);
    expect(typeOf(after, LOAM_ROLL.find((d) => d.id === 'kilnyard')!)).toBe('works');
  });
});

describe('THE RE-ROLL', () => {
  it('keeps name, depth, type and hardness — and changes what is held', () => {
    const { s } = fresh();
    const st = s();
    ensureRoll(st);
    const before = LOAM_ROLL.map((d) => ({ ...contentsOf(st, d.id) }));
    // Roll enough times that "identical every time" cannot pass by luck: each
    // station draws from two or three candidates, so twenty rolls that never
    // move would be a broken re-roll rather than a coincidence.
    let moved = 0;
    for (let i = 0; i < 20; i++) {
      rerollRoll(st);
      LOAM_ROLL.forEach((d, k) => {
        const now = contentsOf(st, d.id);
        if (now.seam !== before[k]!.seam || now.feature !== before[k]!.feature) moved += 1;
      });
    }
    expect(moved).toBeGreaterThan(0);
    // ...and the authored half never moved. Filtered to the non-REST rows on
    // purpose: this list is the A.77 evidence that adding the two rest stations
    // EXTENDED the ladder and edited nothing on it.
    expect(LOAM_ROLL.filter((d) => d.type !== 'rest').map((d) => [d.name, d.depth, d.type, d.hardness])).toEqual([
      ['The Turnrow', 0, 'seam', undefined],
      ['Kiln Yard', 9, 'wreck', undefined],
      ['The Sag', 17, 'seam', undefined],
      ['The Undersill', 28, 'wreck', undefined],
      ['Marlgate', 40, 'chamber', undefined],
      ['BRICKLIGHT', 44, 'wall', 2],
      ['The Long Cut', 47, 'wreck', undefined],
      ['Sinter Row', 60, 'wreck', undefined],
      ['The Ashfall', 72, 'hazard', undefined],
      ['Umberdeep', 90, 'seam', undefined],
      ['Quillrest', 98, 'wreck', undefined],
      ['THE KNOT', 109, 'wall', 3],
      ['Shoring Deep', 120, 'wreck', undefined],
      ['The Long Room', 135, 'chamber', undefined],
      ['DEEPGRAVE', 150, 'floor', undefined],
    ]);
  });

  /**
   * THE BAND IS NARROW (§45.1 risk 3). If a station's contents change too much
   * the name stops meaning anything and the ladder loses the legibility that
   * justified fifteen authored rows. Every roll comes from the station's OWN
   * two or three candidates — never from the shell's whole material list.
   */
  it('never rolls a seam outside the station\'s own short list', () => {
    const { s } = fresh();
    const st = s();
    for (let i = 0; i < 200; i++) {
      rerollRoll(st);
      for (const d of LOAM_ROLL) {
        const seam = contentsOf(st, d.id).seam;
        if (seam === '') { expect(d.seams ?? []).toHaveLength(0); continue; }
        expect(d.seams, `${d.name} rolled ${seam}`).toContain(seam);
      }
    }
  });

  it('every station\'s band is two or three candidates, never the whole shell', () => {
    for (const d of LOAM_ROLL) {
      expect((d.seams ?? []).length, d.name).toBeLessThanOrEqual(3);
    }
  });

  it('hazard intensity rolls inside its range', () => {
    const { s } = fresh();
    const st = s();
    for (let i = 0; i < 200; i++) {
      rerollRoll(st);
      const h = contentsOf(st, 'ashfall').hazard;
      expect(h).toBeGreaterThanOrEqual(HAZARD_MIN);
      expect(h).toBeLessThanOrEqual(HAZARD_MAX);
      // ...and a station that is not a hazard never gets one.
      expect(contentsOf(st, 'sinterrow').hazard).toBe(0);
    }
  });

  it('a WALL holds no seam, ever — its contents are its demand', () => {
    const { s } = fresh();
    const st = s();
    for (let i = 0; i < 50; i++) {
      rerollRoll(st);
      expect(contentsOf(st, 'bricklight').seam).toBe('');
      expect(contentsOf(st, 'knot').seam).toBe('');
    }
  });

  it('a COLLAPSE is what re-rolls it — through the live engine', () => {
    const { engine, s } = fresh();
    const st = s();
    ensureRoll(st);
    const rollsBefore = st.roll!.rolls;
    st.depth = 60;
    st.shaft.reached = 60;
    engine.dispatch({ type: 'collapse' });
    expect((engine.getState() as GameState).roll!.rolls).toBe(rollsBefore + 1);
  });
});

describe('the descent marks the road', () => {
  it('descending past a wreck loots it, through the live engine', () => {
    const { engine } = fresh();
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e9 });
    engine.dispatch({ type: 'descendMany', count: 12 });
    const st = engine.getState() as GameState;
    expect(st.depth).toBeGreaterThanOrEqual(9);
    expect(isLooted(st, 'kilnyard')).toBe(true);
  });
});
