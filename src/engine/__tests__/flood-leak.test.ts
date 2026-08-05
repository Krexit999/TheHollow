/**
 * THE FLOOD LEAK (§36.1 clause 4) — a cut whose reason dissolved.
 *
 * `flood.ts` cut this at A.89 naming its blocker precisely: E2 was not built, so
 * a machine had no CONDITION a station could warp. E2 shipped at A.90 and the
 * cut sat there for nine passes because a cut reads as a decision. PILLARS:
 * "a cut is provisional, and its reason can dissolve — record WHY in enough
 * detail that a later phase can check whether the reason still holds."
 *
 * The two things worth asserting: the leak reaches a machine, and the terraform
 * still buys certainty rather than yield.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import {
  BAKE_HEAT, LEAK_PER_STATION, LEAK_REACH, leakedHeat, leakingStations, tickCondition,
  conditionOf, CONDITION_FULL_SEC,
} from '../systems/condition';
import { shellRoll } from '../systems/roll';
import { dpsMax } from '../systems/face';
import type { GameState } from '../types';


/** A Cinder player standing at a station, with a plant. */
function inCinder(): GameState {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  s.shell.current = 'cinder';
  (s.plant ??= { tiers: {}, builtOf: {} } as never);
  s.plant!.tiers['crusher'] = 1;
  s.roll = { rolled: {}, cleared: [], looted: [], shored: [], flooded: [], rolls: 0 } as never;
  return s;
}

/** Drown the station nearest a depth, and stand there. */
function drownNear(s: GameState, depth: number): string {
  const near = [...shellRoll(s)].sort(
    (a, b) => Math.abs(a.depth - depth) - Math.abs(b.depth - depth))[0]!;
  s.roll!.flooded!.push(near.id);
  s.depth = near.depth;
  return near.id;
}

describe('a drowned station is felt by a plant working in its band', () => {
  it('nothing leaks with nothing drowned', () => {
    const s = inCinder();
    s.pressure.heat = 10;
    expect(leakingStations(s)).toEqual([]);
    expect(leakedHeat(s)).toBe(10);
  });

  it('one drowned station in reach adds its heat; out of reach adds nothing', () => {
    const s = inCinder();
    s.pressure.heat = 10;
    const id = drownNear(s, 100);
    const at = shellRoll(s).find((d) => d.id === id)!;
    expect(leakingStations(s)).toEqual([id]);
    expect(leakedHeat(s)).toBe(10 + LEAK_PER_STATION);

    // Walk out of its band and it stops mattering.
    s.depth = at.depth + LEAK_REACH + 1;
    expect(leakingStations(s)).toEqual([]);
    expect(leakedHeat(s)).toBe(10);
  });

  it('THE CORRIDOR: adjacent floods compound, which is what §36.1 promised', () => {
    const s = inCinder();
    s.pressure.heat = 0;
    const near = [...shellRoll(s)].sort((a, b) => a.depth - b.depth);
    // Three stations within one reach of each other, and stand in the middle.
    const trio = near.filter((_, i) => i > 0 && i < 4).slice(0, 3);
    for (const d of trio) s.roll!.flooded!.push(d.id);
    s.depth = trio[Math.floor(trio.length / 2)]!.depth;
    const felt = leakingStations(s).length;
    expect(felt).toBeGreaterThan(1);
    expect(leakedHeat(s)).toBe(LEAK_PER_STATION * felt);
  });

  it('and the leak really BAKES a machine that the shaft alone would not', () => {
    const mods = new ModifierCache();
    // A shaft UNDER the bake line on its own, and over it with one flood in the
    // band — chosen off the two constants so the arm cannot go vacuous if they move.
    const cold = inCinder();
    cold.pressure.heat = BAKE_HEAT - LEAK_PER_STATION + 2;
    cold.depth = 100;
    for (let i = 0; i < CONDITION_FULL_SEC; i++) tickCondition(cold, mods, 1);
    expect(conditionOf(cold, 'crusher')).toBeNull();

    // The same shaft, with a station drowned in the band underfoot.
    const hot = inCinder();
    hot.pressure.heat = BAKE_HEAT - LEAK_PER_STATION + 2;
    drownNear(hot, 100);
    // ...and the drowned one must actually be reachable, or the arm is vacuous.
    expect(leakingStations(hot)).toHaveLength(1);
    for (let i = 0; i < CONDITION_FULL_SEC; i++) tickCondition(hot, mods, 1);
    expect(conditionOf(hot, 'crusher')?.id).toBe('baked');
  });
});

describe('ITEM 8 — the terraform still buys certainty, not yield', () => {
  it('PILLAR 2: the ceiling does not move, at the SAME depth in both arms', () => {
    const mods = new ModifierCache();
    const bare = inCinder();
    bare.depth = 100;
    mods.invalidate();
    const before = dpsMax(bare, mods).toNumber();

    const flooded = inCinder();
    drownNear(flooded, 100);
    flooded.pressure.heat = 90;
    for (let i = 0; i < CONDITION_FULL_SEC; i++) tickCondition(flooded, mods, 1);
    expect(conditionOf(flooded, 'crusher')?.id).toBe('baked');   // it really landed
    flooded.depth = 100;                                          // THE SAME DEPTH
    mods.invalidate();
    expect(dpsMax(flooded, mods).toNumber()).toBe(before);

    // RED ARM: the instrument can see a ceiling move.
    flooded.upgrades['blade'] = 1;
    mods.invalidate();
    expect(dpsMax(flooded, mods).toNumber()).not.toBe(before);
  });

  it('the leak writes nothing back into the shaft — pressure.ts is untouched', () => {
    const s = inCinder();
    s.pressure.heat = 20;
    drownNear(s, 100);
    const before = JSON.stringify(s.pressure);
    expect(leakedHeat(s)).toBe(20 + LEAK_PER_STATION);
    for (let i = 0; i < 60; i++) tickCondition(s, new ModifierCache(), 1);
    expect(s.pressure.heat).toBe(20);
    expect(JSON.stringify(s.pressure)).toBe(before);
  });
});
