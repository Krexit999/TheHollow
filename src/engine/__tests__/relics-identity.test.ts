/**
 * A.46 — RELICS, both halves.
 *
 * The economy half is a GATE, not a faucet: fusion now costs shards ON TOP of
 * the fed relic it always cost, so it can only ever be harder to reach than it
 * was. That is asserted here rather than argued, because "strictly a superset"
 * is the entire reason this needed no sim re-baselining.
 *
 * The identity half is pillar-bound: waking accrues on CARRY TIME so an idle
 * player gets it at the full rate (pillar 1), and nothing about a resonance is
 * shown before it has fired once (pillar 5).
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { EngineCtx, GameState, RelicInstance } from '../types';
import {
  addRelic, mintRelic, fuseRelics, fusionCost, renderRelic, shardValue,
  RELIC_HOLD_CAP, RESONANCES, activeResonances, relicBonus, equipRelic,
  wakingOf, wakingStep, WAKING_STEPS, tickRelics, relicDeed, grantRelic,
} from '../systems/relics';

const ctx: EngineCtx = { emit() {}, dirty() {} };
const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};
const put = (s: GameState, over: Partial<RelicInstance> = {}): RelicInstance =>
  addRelic(s, { uid: 0, defId: 'x', rarity: 1, affixes: { regen: 0.1 }, source: 'depth', fusedFrom: 0, ...over });

describe('the economy half — the pile is the resource', () => {
  /** The load-bearing one: this change can only SLOW fusion, never speed it. */
  it('fusion costs shards ON TOP of the fed relic — strictly a superset of the old cost', () => {
    const { s } = fresh();
    const a = put(s), b = put(s);
    expect(s.relics.shards).toBe(0);
    const broke = fuseRelics(s, a.uid, b.uid);
    expect(broke.ok).toBe(false);
    expect(broke.reason).toContain('shards');
    // Both relics still there — a refused fusion consumes nothing.
    expect(s.relics.held).toHaveLength(2);

    s.relics.shards = fusionCost(a);
    expect(fuseRelics(s, a.uid, b.uid).ok).toBe(true);
    expect(s.relics.shards).toBe(0); // and it was actually spent
  });

  it('rendering a relic down pays shards and never touches a locked or worn one', () => {
    const { s } = fresh();
    const spare = put(s);
    const locked = put(s, { locked: true });
    const worn = put(s);
    equipRelic(s, worn.uid, 0);

    expect(renderRelic(s, locked.uid).ok).toBe(false);
    expect(renderRelic(s, worn.uid).ok).toBe(false);
    const before = s.relics.shards;
    expect(renderRelic(s, spare.uid).ok).toBe(true);
    expect(s.relics.shards).toBe(before + shardValue(spare));
    expect(s.relics.held.find((r) => r.uid === spare.uid)).toBeUndefined();
  });

  /**
   * A FULL BAG MUST NEVER EAT THE THING YOU JUST EARNED. Losing a find to a
   * cap is the worst possible reading of a reward, so the pile renders itself
   * DOWN instead — weakest first, and never the new arrival.
   */
  it('over the cap the weakest render themselves, and the newest always survives', () => {
    const { s } = fresh();
    for (let i = 0; i < RELIC_HOLD_CAP; i++) put(s, { rarity: 2 });
    expect(s.relics.held).toHaveLength(RELIC_HOLD_CAP);
    const newest = put(s, { rarity: 0 }); // the WEAKEST, and the newest
    expect(s.relics.held).toHaveLength(RELIC_HOLD_CAP);
    expect(s.relics.held.find((r) => r.uid === newest.uid)).toBeDefined();
    expect(s.relics.shards).toBeGreaterThan(0);
  });

  it('a hold entirely of locked and worn relics is never culled — the overflow is kept', () => {
    const { s } = fresh();
    for (let i = 0; i < RELIC_HOLD_CAP + 3; i++) put(s, { locked: true });
    expect(s.relics.held.length).toBeGreaterThan(RELIC_HOLD_CAP);
  });
});

describe('the identity half — a relic is a small progression path', () => {
  it('records where it was found, including which drill turned it up', () => {
    const { s } = fresh();
    s.depth = 428;
    s.collapse.count = 5;
    const r = grantRelic(s, ctx, 'depth', 'The Badger');
    expect(r.found).toMatchObject({ depth: 428, run: 5, by: 'The Badger', shell: 'loam' });
  });

  /** PILLAR 1: carrying is the whole requirement, so idle wakes at full rate. */
  it('wakes on CARRY TIME alone — no active play required', () => {
    const { s } = fresh();
    const r = put(s);
    equipRelic(s, r.uid, 0);
    expect(wakingOf(r)).toBe(0);
    tickRelics(s, ctx, WAKING_STEPS[1]!.at);
    expect(wakingOf(s.relics.held[0]!)).toBe(1);
    tickRelics(s, ctx, WAKING_STEPS[2]!.at);
    expect(wakingOf(s.relics.held[0]!)).toBe(2);
  });

  it('an unworn relic never wakes — the carrying is the point', () => {
    const { s } = fresh();
    put(s);
    tickRelics(s, ctx, 999_999);
    expect(wakingOf(s.relics.held[0]!)).toBe(0);
  });

  /** PILLAR 4: deeds in its own element pay MORE, they are never required. */
  it('a deed in its own element hurries it, and a deed elsewhere does nothing', () => {
    const { s } = fresh();
    const deep = put(s, { source: 'depth' });
    equipRelic(s, deep.uid, 0);
    relicDeed(s, ctx, 'expedition');
    expect(s.relics.held[0]!.charge ?? 0).toBe(0);
    relicDeed(s, ctx, 'depth', 500);
    expect(s.relics.held[0]!.charge).toBe(500);
  });

  it('waking raises what a worn relic gives, and only while worn', () => {
    const { s } = fresh();
    const r = put(s, { affixes: { regen: 0.2 } });
    equipRelic(s, r.uid, 0);
    const base = relicBonus(s, 'regen');
    s.relics.held[0]!.waking = 2;
    expect(relicBonus(s, 'regen')).toBeCloseTo(base * WAKING_STEPS[2]!.mult, 6);
    expect(wakingStep(s.relics.held[0]!).name).toBe('Awake');
  });
});

describe('resonance — they recognise each other', () => {
  it('fires on the set, scales only the resonating relics, and is discovery-gated', () => {
    const { engine, s } = fresh();
    const def = RESONANCES.find((x) => x.source === 'depth')!;
    const a = put(s, { source: 'depth', affixes: { regen: 0.1 } });
    const other = put(s, { source: 'warren', affixes: { regen: 0.1 } });
    equipRelic(s, a.uid, 0);
    equipRelic(s, other.uid, 1);
    expect(activeResonances(s)).toHaveLength(0); // one is not a set

    const b = put(s, { source: 'depth', affixes: { regen: 0.1 } });
    equipRelic(s, b.uid, 2);
    expect(activeResonances(s).map((x) => x.id)).toContain(def.id);
    // 0.1 x2 resonating + 0.1 that does not.
    expect(relicBonus(s, 'regen')).toBeCloseTo(0.1 * def.mult * 2 + 0.1, 6);

    // PILLAR 5: nothing is written down until it actually happens.
    expect(s.relics.resonancesFound).not.toContain(def.id);
    // Two seconds, not one, and the reason is worth knowing: the engine's 1Hz
    // block accumulates `achTimer += 0.1` per step, and ten of those sum to
    // 0.9999999999999999 — so a tick of exactly 1.0 can miss the `>= 1` gate
    // and fire one step later. Harmless live (a sweep runs a frame late), but
    // a test that ticks exactly 1.0 is testing float luck.
    engine.tick(2);
    expect((engine.getState() as GameState).relics.resonancesFound).toContain(def.id);
  });
});

describe('a relic minted before A.46 still works', () => {
  it('has no story and no waking, and is not pretended to have one', () => {
    const { s } = fresh();
    const old = addRelic(s, mintRelic(s, 'depth', 3)); // mintRelic sets no `found`
    expect(old.found).toBeUndefined();
    expect(wakingOf(old)).toBe(0);
    equipRelic(s, old.uid, 0);
    expect(relicBonus(s, 'regen')).toBeGreaterThanOrEqual(0); // reads fine regardless
  });
});
