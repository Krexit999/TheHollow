/**
 * THE SHAPE NET (A.39) — a loaded save can never be missing a slice.
 *
 * The live-playtest crash "Cannot read properties of undefined (reading
 * 'push')" (hit around upgrading a drill + fitting a head) is the stale-save
 * class: an array added in a later version that one record in a long-lived
 * save never received. The exact field is unknowable from the report — the fix
 * is the CLASS: hydrate deep-fills anything missing from the current default
 * shape before any code can push into a hole.
 */
import { describe, expect, it } from 'vitest';
import { createEngine, initialState } from '../index';
import { serialize, deserialize } from '../save/codec';
import { ensureStateShape } from '../save/shape';
import type { GameState } from '../types';

function damagedSave(): string {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState & Record<string, any>;
  // Give it a drill so the user's exact sequence is replayable after load.
  s.drills.bayBuilt = true;
  (s.drills.units as unknown[]).push({ level: 5, timer: 0, lastCell: 0 });
  s.currencies['brick'] = s.currencies['brick']!.add(10000);
  const raw = serialize(engine.getState(), 0);
  // Damage the payload the way version drift does: delete nested slices of
  // several vintages (arrays and whole objects).
  const payload = JSON.parse(raw);
  const st = payload.state;
  delete st.face.recentChips;      // P-Face era
  delete st.qol.pins;              // P21 era
  delete st.runes.pairsSeen;       // glassmere era
  delete st.shaft.caches;          // column era
  delete st.seenSystems;           // P11 era
  delete st.qol;                   // an entire missing slice
  return JSON.stringify(payload);
}

describe('hydrate fills every missing slice from the default shape', () => {
  it('a damaged save loads, and the user sequence (upgrade drill → fit head → tick) runs clean', () => {
    const damaged = damagedSave();
    const engine = createEngine({ nowMs: 0 });
    const loaded = deserialize(damaged);
    const hyd = engine.dispatch({ type: 'hydrate', state: loaded, nowMs: 0 });
    expect(hyd.ok).toBe(true);

    const s = engine.getState() as GameState;
    // Every deleted slice is back, at the correct empty shape.
    expect(Array.isArray(s.face.recentChips)).toBe(true);
    expect(Array.isArray(s.qol.pins)).toBe(true);
    expect(Array.isArray(s.runes.pairsSeen)).toBe(true);
    expect(Array.isArray(s.shaft.caches)).toBe(true);
    expect(Array.isArray(s.seenSystems)).toBe(true);

    // The reported sequence, on the loaded save.
    expect(engine.dispatch({ type: 'upgradeDrill', index: 0 }).ok).toBe(true);
    // A.53: the reported sequence's second step was fitting a head; heads are
    // gone, so the equivalent bay verb is the one that replaced them. A.54 made
    // it per drill — a bare drill has nothing to pull out, and saying so is the
    // correct answer, not a crash.
    expect(engine.dispatch({ type: 'clearDrillAlloy', index: 0 }).ok).toBe(false);
    expect(() => engine.tick(5)).not.toThrow();
    /**
     * SEEDED (A.96). Five seconds of a level-5 drill picks its cells off the
     * global `Math.random`, so whether cell 0 still holds charge when the chip
     * lands is a coin toss — this failed one full-suite run and passed every
     * time it ran alone, which is the same shape as the drop-rate test seeded
     * at A.95 and teaches the same bad habit (re-run instead of read).
     */
    const real = Math.random;
    let seed = 20260805;
    Math.random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    try {
      // And chipping still pays afterward.
      const before = s.currencies['dust']!.toNumber();
      engine.dispatch({ type: 'chip', cell: 0 });
      expect(engine.getState().currencies['dust']!.toNumber()).toBeGreaterThan(before);
    } finally {
      Math.random = real;
    }
  });

  it('never overwrites real data — additive only', () => {
    const a = initialState(0) as GameState & Record<string, any>;
    a.depth = 77;
    a.seenSystems = ['dig', 'kiln'];
    a.qol.pins = ['blade'];
    ensureStateShape(a, initialState(0));
    expect(a.depth).toBe(77);
    expect(a.seenSystems).toEqual(['dig', 'kiln']);
    expect(a.qol.pins).toEqual(['blade']);
  });

  it('replaces a non-array where an array belongs, and fills missing records', () => {
    const a = initialState(0) as unknown as Record<string, any>;
    a.qol.pins = null;
    delete a.materials.gems;
    ensureStateShape(a, initialState(0));
    expect(Array.isArray(a.qol.pins)).toBe(true);
    expect(typeof a.materials.gems).toBe('object');
  });
});
