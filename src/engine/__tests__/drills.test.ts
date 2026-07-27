/**
 * THE DRILL BAY and the shared AFFINITY mechanism, at the engine level.
 *
 * A.53 STRIPPED the configuration layer these tests used to cover — heads,
 * bits, wear, repair, the shared feed, the seam and the grain. What survived
 * is what a dumb auto-miner needs: it mines, it learns the shell it works, and
 * affinity stays slow, capped, never-decaying and off dustYield (pillar 2).
 * The abilities that replaced the configuration layer are covered in
 * drill-alloys.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState } from '../types';
import { ModifierCache, computeBucket, breakdown } from '../modifiers';
import {
  affinityLevel, affinityMult, logImplementUse, AFFINITY_MAX_BONUS,
} from '../systems/affinity';
import { tickDrills, drillPower, newDrill } from '../systems/drills';
import { runMigrations, SAVE_VERSION } from '../save/migrations';

const nullCtx: EngineCtx = { emit() {}, dirty() {} };
function fresh(): { engine: Engine; s: () => GameState } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: () => engine.getState() as GameState };
}

describe('affinity — slow, capped, never decays', () => {
  it('accumulates toward a cap and never exceeds the max bonus', () => {
    const impl = { use: {} as Record<string, number> };
    expect(affinityLevel(impl, 'loam')).toBe(0);
    logImplementUse(impl, 'loam', 1000);
    const a1 = affinityLevel(impl, 'loam');
    logImplementUse(impl, 'loam', 1_000_000);
    const a2 = affinityLevel(impl, 'loam');
    expect(a2).toBeGreaterThan(a1);         // it climbs
    expect(a2).toBeLessThan(1);             // never saturates fully
    expect(affinityMult(impl, 'loam')).toBeLessThanOrEqual(1 + AFFINITY_MAX_BONUS + 1e-9);
  });

  it('a negative or zero amount is ignored (accumulate only, never decays)', () => {
    const impl = { use: { loam: 500 } };
    logImplementUse(impl, 'loam', -100);
    logImplementUse(impl, 'loam', 0);
    expect(impl.use['loam']).toBe(500);
  });

  it('per-key: knowing one shell does not help another', () => {
    const impl = { use: {} as Record<string, number> };
    logImplementUse(impl, 'loam', 100000);
    expect(affinityLevel(impl, 'loam')).toBeGreaterThan(0);
    expect(affinityLevel(impl, 'ferrite')).toBe(0);
  });
});

describe('affinity — pillar 2 (drillPower, not dustYield)', () => {
  it('a drill that knows the shell strikes harder (drillPower), regen-bound', () => {
    const { s } = fresh();
    const mods = new ModifierCache();
    const drill = newDrill('Bess');
    const before = drillPower(s(), mods, drill);
    logImplementUse(drill, 'loam', 1_000_000);
    const after = drillPower(s(), mods, drill);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(before * (1 + AFFINITY_MAX_BONUS) + 1e-6);
  });

  it('the tool affinity source lives in dropRate, never dustYield', () => {
    const { s } = fresh();
    const state = s();
    // A fresh tool with no history is neutral.
    expect(computeBucket(state, 'dustYield').toNumber()).toBeGreaterThan(0);
    const dustBefore = computeBucket(state, 'dustYield').toString();
    // Teach the equipped tool the shell, and let it SETTLE (v22 opinions gate the
    // bonus behind a short settling-in — a freshly-equipped tool sulks).
    const tool = state.forge.tools[state.forge.equipped]!;
    logImplementUse(tool, 'loam', 1_000_000);
    state.stats.playTimeSec = 10000; // settled (equippedAt defaulted to 0)
    // dropRate moved; dustYield did not (the ceiling is untouched — pillar 2).
    expect(computeBucket(state, 'dropRate').toNumber()).toBeGreaterThan(1);
    expect(computeBucket(state, 'dustYield').toString()).toBe(dustBefore);
    expect(breakdown(state, 'dropRate').some((e) => e.id === 'affinity')).toBe(true);
    expect(breakdown(state, 'dustYield').some((e) => e.id === 'affinity')).toBe(false);
  });
});

describe('drills — furniture, not a configuration screen (A.53)', () => {
  it('mines with no configuration of any kind', () => {
    const { engine, s } = fresh();
    const st = s();
    st.drills.bayBuilt = true;
    st.drills.units.push(newDrill('Bess'));
    st.face.cells = st.face.cells.map(() => 8);
    const before = st.totals['dust']?.toNumber() ?? 0;
    tickDrills(st, new ModifierCache(), nullCtx, 20);
    expect((st.totals['dust']?.toNumber() ?? 0)).toBeGreaterThan(before);
    void engine;
  });

  it('a drill carries nothing to fiddle with — level, name, and a memory', () => {
    const d = newDrill('Bess') as unknown as Record<string, unknown>;
    expect(Object.keys(d).sort()).toEqual(['lastCell', 'level', 'name', 'timer', 'use']);
  });

  it('renaming makes a drill an individual', () => {
    const { engine, s } = fresh();
    s().drills.bayBuilt = true;
    s().drills.units.push(newDrill());
    engine.dispatch({ type: 'renameDrill', index: 0, name: '  Gnash  ' });
    expect(s().drills.units[0]!.name).toBe('Gnash');
  });
});
describe('the save chain, v21 through A.54', () => {
  it('gives implements a history, then strips the configuration layer back off', () => {
    const payload = {
      version: 20, savedAtMs: 0,
      state: { forge: { tools: [{ id: 0 }] }, drills: { units: [{ level: 0, timer: 0, lastCell: 0 }, {}] } },
    } as never;
    const out = runMigrations(payload);
    expect(out.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(21);
    const st = out.state as { forge: { tools: Array<Record<string, unknown>> }; drills: { units: Array<Record<string, unknown>> } };
    expect(st.forge.tools[0]!['use']).toEqual({});
    expect(st.drills.units[0]!['use']).toEqual({});
    expect(typeof st.drills.units[0]!['name']).toBe('string');
    // A.53 (v31): wear, heads, bits and behaviour are gone from every chassis,
    // and the bay-wide bookkeeping with them. The DRILLS themselves survive.
    expect(st.drills.units).toHaveLength(2);
    for (const u of st.drills.units) {
      for (const gone of ['wear', 'head', 'bit', 'behavior']) expect(u[gone]).toBeUndefined();
    }
    const bay = (out.state as { drills: Record<string, unknown> }).drills;
    for (const gone of ['supply', 'synergiesFound', 'seam']) expect(bay[gone]).toBeUndefined();
    // ...and no ability is handed out: an alloy is DISCOVERED, and granting one
    // would spend the discovery on the player's behalf.
    expect(bay['alloys']).toEqual([]);
    // A.54 (v32): the bay-wide slot is gone entirely — the fitting lives on the
    // drill now, and a save that had nothing fitted still has nothing fitted.
    expect(bay['equipped']).toBeUndefined();
    for (const u of st.drills.units) expect(u['alloy']).toBeUndefined();
  });

  /**
   * THE ONE THING A PLAYER MUST NOT LOSE ON LOAD. A save that was running an
   * alloy bay-wide had every drill doing that thing; after the move to
   * per-drill fitting it must still have every drill doing that thing. Fitting
   * costs a pour now, so a migration that dropped the alloy would be silently
   * charging an existing player for what they already owned.
   */
  it('a bay-wide alloy lands on every drill, not on none of them', () => {
    const payload = {
      version: 31, savedAtMs: 0,
      state: {
        drills: {
          bayBuilt: true, alloys: ['arcvein'], equipped: 'arcvein',
          units: [{ level: 3, timer: 0, lastCell: 0 }, { level: 1, timer: 0, lastCell: 0 }],
        },
      },
    } as never;
    const out = runMigrations(payload);
    const bay = (out.state as { drills: Record<string, unknown> }).drills;
    const units = bay['units'] as Array<Record<string, unknown>>;
    // A.56 (v34) turns the single `alloy` field into a `fits` list, and stamps
    // everything already poured at GRADE 1 — step 0 for a Loam ability, i.e.
    // exactly the numbers the save was already running.
    for (const u of units) {
      expect(u['alloy']).toBeUndefined();
      expect(u['fits']).toEqual([{ id: 'arcvein', grade: 1 }]);
      expect(u['slots']).toBe(1);
    }
    expect(bay['alloys']).toEqual(['arcvein']);
    expect(bay['equipped']).toBeUndefined();
  });

  it('a bay that had nothing fitted gains nothing', () => {
    const payload = {
      version: 31, savedAtMs: 0,
      state: { drills: { bayBuilt: true, alloys: ['arcvein'], equipped: null, units: [{ level: 0, timer: 0, lastCell: 0 }] } },
    } as never;
    const out = runMigrations(payload);
    const units = (out.state as { drills: { units: Array<Record<string, unknown>> } }).drills.units;
    expect(units[0]!['alloy']).toBeUndefined();
  });
});
