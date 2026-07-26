/**
 * THE RELIC LOCK — a player-set keep-forever mark.
 *
 * A relic can only ever be destroyed two ways: fed into a fusion, or given to a
 * Museum case. The lock guards exactly those two and nothing else, so the
 * guarantee under test is narrow and total: a locked relic cannot leave your
 * hands by any path, and locking costs nothing (it is not a stat, it blocks no
 * bonus, and it does not stop the relic being worn or being IMPROVED by a fusion
 * it keeps).
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { D } from '../decimal';
import type { Engine, GameState, RelicInstance } from '../types';
import { fuseRelics, toggleRelicLock, equipRelic } from '../systems/relics';
import { serialize, deserialize } from '../save/codec';

function fresh(): { engine: Engine; s: () => GameState } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: () => engine.getState() as GameState };
}
function relic(uid: number, extra: Partial<RelicInstance> = {}): RelicInstance {
  return { uid, defId: `d${uid}`, rarity: 1, affixes: { regen: 0.1 }, source: 'depth', fusedFrom: 0, ...extra };
}

describe('the relic lock — a locked relic can never be consumed', () => {
  it('refuses to feed a locked relic into a fusion', () => {
    const { s } = fresh();
    const state = s();
    state.relics.shards = 999; // A.46: a fusion costs shards now
state.currencies['core'] = D(9999); // A.48/A.49: and Cores, on the fusions that lift a rarity
    state.relics.held = [relic(1), relic(2, { locked: true })];
    const r = fuseRelics(state, 1, 2);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/locked/i);
    // Nothing was eaten.
    expect(state.relics.held.map((x) => x.uid)).toEqual([1, 2]);
  });

  // A.49: the Museum's donate verb is gone — a relic is never handed over, so
  // FUSION is now the only path that consumes one and the lock guards exactly
  // that. The 'given to a case' half of this suite went with the verb.

  it('still lets an UNLOCKED relic be fused away (the lock is not a global block)', () => {
    const { s } = fresh();
    const state = s();
    state.relics.shards = 999; // A.46: a fusion costs shards now
state.currencies['core'] = D(9999); // A.48/A.49: and Cores, on the fusions that lift a rarity
    state.relics.held = [relic(1), relic(2)];
    expect(fuseRelics(state, 1, 2).ok).toBe(true);
    expect(state.relics.held.map((x) => x.uid)).toEqual([1]);
  });
});

describe('the relic lock — it costs nothing', () => {
  it('a locked relic can still be the KEEPER of a fusion and be improved by it', () => {
    const { s } = fresh();
    const state = s();
    state.relics.shards = 999; // A.46: a fusion costs shards now
state.currencies['core'] = D(9999); // A.48/A.49: and Cores, on the fusions that lift a rarity
    // The keeper is locked; the food is not. Fusion improves the locked one.
    state.relics.held = [relic(1, { locked: true, affixes: { regen: 0.1 } }), relic(2, { affixes: { dropRate: 0.3 } })];
    const r = fuseRelics(state, 1, 2);
    expect(r.ok).toBe(true);
    const keep = state.relics.held.find((x) => x.uid === 1)!;
    expect(keep.affixes['dropRate']).toBeCloseTo(0.3, 6); // it gained the line
    expect(keep.locked).toBe(true);                       // and stayed locked
    expect(state.relics.held.map((x) => x.uid)).toEqual([1]);
  });

  it('a locked relic can still be worn', () => {
    const { s } = fresh();
    const state = s();
    state.relics.shards = 999; // A.46: a fusion costs shards now
state.currencies['core'] = D(9999); // A.48/A.49: and Cores, on the fusions that lift a rarity
    state.relics.held = [relic(1, { locked: true })];
    expect(equipRelic(state, 1, 0).ok).toBe(true);
    expect(state.relics.equipped).toContain(1);
  });
});

describe('the relic lock — toggling', () => {
  it('toggles on and off, and refuses a relic you do not hold', () => {
    const { s } = fresh();
    const state = s();
    state.relics.shards = 999; // A.46: a fusion costs shards now
state.currencies['core'] = D(9999); // A.48/A.49: and Cores, on the fusions that lift a rarity
    state.relics.held = [relic(1)];
    expect(state.relics.held[0]!.locked).toBeFalsy();
    expect(toggleRelicLock(state, 1).data).toEqual({ locked: true });
    expect(state.relics.held[0]!.locked).toBe(true);
    expect(toggleRelicLock(state, 1).data).toEqual({ locked: false });
    expect(state.relics.held[0]!.locked).toBe(false);
    expect(toggleRelicLock(state, 99).ok).toBe(false);
  });

  it('is dispatchable and rides the save', () => {
    const { engine, s } = fresh();
    s().relics.held = [relic(1)];
    expect(engine.dispatch({ type: 'toggleRelicLock', uid: 1 }).ok).toBe(true);
    expect(s().relics.held[0]!.locked).toBe(true);
    // Round-trip through the codec: the lock is player-authored state, so it
    // must survive a save/load like any other choice the player made.
    const back = deserialize(serialize(s(), 0)).relics.held.find((r) => r.uid === 1);
    expect(back?.locked).toBe(true);
  });
});
