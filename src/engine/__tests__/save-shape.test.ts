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
  (s.drills.units as unknown[]).push({ level: 5, behavior: 'fullest', timer: 0, lastCell: 0 });
  s.currencies['brick'] = s.currencies['brick']!.add(10000);
  const raw = serialize(engine.getState(), 0);
  // Damage the payload the way version drift does: delete nested slices of
  // several vintages (arrays and whole objects).
  const payload = JSON.parse(raw);
  const st = payload.state;
  delete st.face.recentChips;      // P-Face era
  delete st.qol.pins;              // P21 era
  delete st.qol.blueprints;
  delete st.guild.sable.found;     // guild era
  delete st.combat.seen;           // combat era
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
    expect(Array.isArray(s.qol.blueprints)).toBe(true);
    expect(Array.isArray(s.guild.sable.found)).toBe(true);
    expect(Array.isArray(s.combat.seen)).toBe(true);
    expect(Array.isArray(s.runes.pairsSeen)).toBe(true);
    expect(Array.isArray(s.shaft.caches)).toBe(true);
    expect(Array.isArray(s.seenSystems)).toBe(true);

    // The reported sequence, on the loaded save.
    expect(engine.dispatch({ type: 'upgradeDrill', index: 0 }).ok).toBe(true);
    expect(engine.dispatch({ type: 'fitDrillHead', index: 0, head: 'auger' }).ok).toBe(true);
    expect(() => engine.tick(5)).not.toThrow();
    // And chipping still pays afterward.
    const before = s.currencies['dust']!.toNumber();
    engine.dispatch({ type: 'chip', cell: 0 });
    expect(engine.getState().currencies['dust']!.toNumber()).toBeGreaterThan(before);
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
    a.combat.seen = null;
    delete a.materials.gems;
    ensureStateShape(a, initialState(0));
    expect(Array.isArray(a.combat.seen)).toBe(true);
    expect(typeof a.materials.gems).toBe('object');
  });
});
