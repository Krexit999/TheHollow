/**
 * THE FACE CLUSTER (v21) — the Drill Bay and the shared AFFINITY mechanism, at the
 * engine level. The guarantees: affinity is slow, capped, never decays, and never
 * touches dustYield (pillar 2); wear accrues only from live striking and a broken
 * drill limps rather than stops (pillar 1); heads and bits configure a drill.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState } from '../types';
import { getCurrency } from '../resources';
import { ModifierCache, computeBucket, breakdown } from '../modifiers';
import {
  affinityLevel, affinityMult, logImplementUse, AFFINITY_MAX_BONUS,
} from '../systems/affinity';
import {
  tickDrills, drillPower, newDrill, drillBroken, drillCondition, BROKEN_FLOOR, drillRepairCost,
} from '../systems/drills';
import { drillConfig } from '../content/drillParts';
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

describe('drills — breakable (foreseeable, repairable, idle-safe)', () => {
  it('wear accrues from live striking and shows a condition before it breaks', () => {
    const { s } = fresh();
    const state = s();
    const mods = new ModifierCache();
    state.drills.bayBuilt = true;
    state.drills.units = [newDrill('Grinder')];
    for (let i = 0; i < state.face.cells.length; i++) state.face.cells[i] = 8;
    expect(drillCondition(state.drills.units[0]!)).toBe('ok');
    for (let t = 0; t < 2000; t++) { tickDrills(state, mods, nullCtx, 0.5); state.face.cells.fill(8); }
    expect((state.drills.units[0]!.wear ?? 0)).toBeGreaterThan(0);
  });

  it('a broken drill limps at a floor rather than stopping (pillar 1)', () => {
    const { s } = fresh();
    const mods = new ModifierCache();
    const drill = newDrill('Nub');
    const sound = drillPower(s(), mods, drill);
    drill.wear = 1;
    expect(drillBroken(drill)).toBe(true);
    const broken = drillPower(s(), mods, drill);
    expect(broken).toBeCloseTo(sound * BROKEN_FLOOR, 5);
    expect(broken).toBeGreaterThan(0); // never zero — idle income never craters
  });

  it('repair costs the shell converted currency and restores the drill', () => {
    const { engine, s } = fresh();
    const state = s();
    state.drills.bayBuilt = true;
    state.drills.units = [newDrill('Bess')];
    state.drills.units[0]!.wear = 0.8;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'brick', amount: 10000 });
    const cost = drillRepairCost(state.drills.units[0]!);
    const before = getCurrency(state, 'brick');
    const r = engine.dispatch({ type: 'repairDrill', index: 0 });
    expect(r.ok).toBe(true);
    expect(state.drills.units[0]!.wear).toBe(0);
    expect(getCurrency(state, 'brick').toNumber()).toBeCloseTo(before.toNumber() - cost, 2);
  });
});

describe('drills — configured by head + bit', () => {
  it('a fitted head sets the targeting behaviour and stat lean', () => {
    const drill = newDrill('Maulie');
    expect(drillConfig(drill).configured).toBe(false);
    drill.head = 'maul';
    const cfg = drillConfig(drill);
    expect(cfg.configured).toBe(true);
    expect(cfg.behavior).toBe('fullest');
    expect(cfg.powerMult).toBeGreaterThan(1); // the Maul hits harder, slower
    expect(cfg.speedMult).toBeLessThan(1);
  });

  it('renaming makes a drill an individual', () => {
    const { engine, s } = fresh();
    s().drills.bayBuilt = true;
    s().drills.units = [newDrill('Bess')];
    engine.dispatch({ type: 'renameDrill', index: 0, name: 'Old Faithful' });
    expect(s().drills.units[0]!.name).toBe('Old Faithful');
  });
});

describe('save v21 — implements gain history', () => {
  it('migrates tools and drills to carry use-history, wear, and names', () => {
    const payload = {
      version: 20, savedAtMs: 0,
      state: { forge: { tools: [{ id: 0 }] }, drills: { units: [{ level: 0, behavior: 'fullest', timer: 0, lastCell: 0 }, {}] } },
    } as never;
    const out = runMigrations(payload);
    expect(out.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(21);
    const st = out.state as { forge: { tools: Array<Record<string, unknown>> }; drills: { units: Array<Record<string, unknown>> } };
    expect(st.forge.tools[0]!['use']).toEqual({});
    expect(st.drills.units[0]!['use']).toEqual({});
    expect(st.drills.units[0]!['wear']).toBe(0);
    expect(typeof st.drills.units[0]!['name']).toBe('string');
  });
});
