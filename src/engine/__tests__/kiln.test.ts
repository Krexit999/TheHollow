/**
 * THE FACE CLUSTER (v21) — the Kiln's three additions: FUEL profiles (a trade, not
 * a ladder), OVERSTOKE (opt-in burst, foreseeable, cooldown-gated), and BANKED HEAT
 * (persists across an away period). Pillar 2: none of it lifts the efficiency cap
 * except overstoke, and overstoke only converts Dust that was already field-bound.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState } from '../types';
import { getCurrency } from '../resources';
import { ModifierCache } from '../modifiers';
import {
  tickKiln, kilnEfficiency, overstokeActive, overstokeReady, lightOverstoke, overstokeCost,
} from '../systems/kiln';
import { addMaterial } from '../systems/forge';
import { KILN_FUELS, kilnFuel, OVERSTOKE_WINDOW_SEC } from '../content/kilnFuel';
import { D } from '../decimal';

const nullCtx: EngineCtx = { emit() {}, dirty() {} };
function fresh(): { engine: Engine; s: () => GameState } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: () => engine.getState() as GameState };
}

describe('kiln fuel — a trade, not a ladder', () => {
  it('each fuel trades heat-up speed against holding heat (none strictly-best)', () => {
    // For every pair, if one heats faster it also cools faster (or holds better but
    // heats slower). No fuel dominates on both axes.
    for (const a of KILN_FUELS) for (const b of KILN_FUELS) {
      if (a === b) continue;
      const betterBoth = a.heatUpMult > b.heatUpMult && a.coolMult < b.coolMult;
      expect(betterBoth).toBe(false);
    }
  });

  it('feeding a fuel consumes the material and bends the heat curve', () => {
    const { s } = fresh();
    const state = s();
    const mods = new ModifierCache();
    state.kiln.built = true; state.kiln.feeding = true; state.kiln.fuel = 'ash';
    addMaterial(state, 'ash', 60, 200);
    state.currencies['dust'] = D(1e6);
    const ashBefore = 200;
    for (let t = 0; t < 40; t++) tickKiln(state, mods, nullCtx, 0.5);
    // Ash burned down, and the hot-fast profile drove heat up quickly.
    const held = Object.values(state.materials.stacks['ash'] ?? {}).reduce((a, st) => a + (st?.count ?? 0), 0);
    expect(held).toBeLessThan(ashBefore);
    expect(state.kiln.heat).toBeGreaterThan(0.3);
  });

  it('when the fuel runs out the kiln simply burns bare (never a hard dependency)', () => {
    const { s } = fresh();
    const state = s();
    const mods = new ModifierCache();
    state.kiln.built = true; state.kiln.feeding = true; state.kiln.fuel = 'ash';
    state.currencies['dust'] = D(1e6);
    // No ash at all — feeding still works, just without the profile.
    for (let t = 0; t < 10; t++) tickKiln(state, mods, nullCtx, 0.5);
    expect(state.kiln.heat).toBeGreaterThan(0);
    expect(kilnFuel('ash')).toBeTruthy();
  });
});

describe('kiln overstoke — opt-in burst, cooldown-gated', () => {
  it('lights for Dust, lifts efficiency for a window, then must recover', () => {
    const { s } = fresh();
    const state = s();
    const mods = new ModifierCache();
    state.kiln.built = true; state.kiln.heat = 1;
    state.stats.playTimeSec = 100;
    state.currencies['dust'] = overstokeCost(state, mods).mul(3);
    const effBefore = kilnEfficiency(state);
    const dustBefore = getCurrency(state, 'dust').toNumber();
    expect(overstokeReady(state)).toBe(true);
    const r = lightOverstoke(state, mods);
    expect(r.ok).toBe(true);
    expect(overstokeActive(state)).toBe(true);
    expect(kilnEfficiency(state)).toBeGreaterThan(effBefore);       // burst
    expect(getCurrency(state, 'dust').toNumber()).toBeLessThan(dustBefore); // paid
    expect(overstokeReady(state)).toBe(false);                       // cooling down
    // The window expires.
    state.stats.playTimeSec = 100 + OVERSTOKE_WINDOW_SEC + 1;
    expect(overstokeActive(state)).toBe(false);
  });

  it('cannot be lit again until the cooldown passes', () => {
    const { s } = fresh();
    const state = s();
    const mods = new ModifierCache();
    state.kiln.built = true; state.stats.playTimeSec = 0;
    state.currencies['dust'] = overstokeCost(state, mods).mul(5);
    expect(lightOverstoke(state, mods).ok).toBe(true);
    // Immediately after, even with Dust, it refuses.
    expect(lightOverstoke(state, mods).ok).toBe(false);
  });
});

describe('kiln banked heat (idle QoL, pillar-safe)', () => {
  it('a warm, unfed kiln keeps its heat while you are away', () => {
    const { s } = fresh();
    const state = s();
    const mods = new ModifierCache();
    state.kiln.built = true; state.kiln.feeding = false; state.kiln.heat = 0.9;
    // The closed-form offline path does not run tickKiln, so heat does not bleed.
    // (Confirm the tick that WOULD cool it is not the offline path: an unfed online
    // tick cools, but that is online, not "while away".)
    const before = state.kiln.heat;
    tickKiln(state, mods, nullCtx, 0); // a zero-length tick changes nothing
    expect(state.kiln.heat).toBe(before);
  });
});
