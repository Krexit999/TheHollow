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
  wakingOf, wakingStep, WAKING_STEPS, tickRelics, relicDeed, grantRelic, holdCap,
} from '../systems/relics';
import {
  POWERS, powerOf, powerLive, relicRule, relicPowerBonus, pairMultiplier,
} from '../systems/relicPowers';
import { getCurrency } from '../resources';
import { D } from '../decimal';

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

    const price = fusionCost(s, a);
    s.relics.shards = price.shards;
    s.currencies['core'] = D(price.cores);
    expect(fuseRelics(s, a.uid, b.uid).ok).toBe(true);
    expect(s.relics.shards).toBe(0); // and it was actually spent
    expect(getCurrency(s, 'core').toNumber()).toBe(0);
  });

  /**
   * THE WALL (A.48). The A.46 price existed and never arrived: 4 shards for a
   * Common keeper against a hold that renders its own overflow down at 2-10
   * shards a relic. Play reported fusion as "still free and spammable" and was
   * right. What must be true now is that the SECOND fusion costs more than the
   * first, and the price is payable in things earnable in every shell.
   */
  it('the price rises with every fusion — the second in a row costs more than the first', () => {
    const { s } = fresh();
    const keep = put(s, { rarity: 2 });
    const first = fusionCost(s, keep);
    for (const feed of [put(s), put(s), put(s)]) {
      const price = fusionCost(s, keep);
      s.relics.shards = price.shards;
      s.currencies['core'] = D(price.cores);
      expect(fuseRelics(s, keep.uid, feed.uid).ok).toBe(true);
    }
    const fourth = fusionCost(s, keep);
    expect(fourth.cores).toBeGreaterThan(first.cores * 3);
    expect(fourth.shards).toBeGreaterThan(first.shards * 2);
  });

  /** Both inputs must be earnable wherever the player is — the reach rule. */
  it('names what it is short of instead of failing silently', () => {
    const { s } = fresh();
    const a = put(s), b = put(s);
    const r = fuseRelics(s, a.uid, b.uid);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/shards/);
    expect(r.reason).toMatch(/Cores/);
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

/**
 * POWERS (A.48). The reported failure was "relics are still just +X% stat", and
 * the honest test of the fix is not that powers exist but that they are NOT ALL
 * THE SAME SHAPE. Each kind is asserted by its own behaviour, because a trade
 * that never subtracts and a pair that works alone are both just multipliers
 * wearing a name.
 */
describe('powers — the half of a relic that is not a percentage', () => {
  const wear = (s: GameState, power: string, over: Partial<RelicInstance> = {}) => {
    const r = put(s, { rarity: 4, power, waking: 1, ...over });
    equipRelic(s, r.uid, s.relics.equipped.length);
    return r;
  };

  it('covers all four kinds — none of them is only a multiplier', () => {
    for (const kind of ['rule', 'trade', 'scaling', 'pair'] as const) {
      expect(POWERS.filter((p) => p.kind === kind).length).toBeGreaterThan(0);
    }
    // A rule power has no bucket contribution at all; a trade has a negative one.
    expect(POWERS.filter((p) => p.kind === 'rule').every((p) => !p.bonus)).toBe(true);
  });

  /** THE VISIBLE CHANGE OVER TIME: dormant it does nothing, stirring it does. */
  it('is inert while Dormant and turns on at Stirring', () => {
    const { s } = fresh();
    const r = wear(s, 'glassLung', { waking: 0 });
    expect(powerOf(r)?.id).toBe('glassLung');
    expect(powerLive(r)).toBe(false);
    expect(relicPowerBonus(s, 'dustYield')).toBe(0);
    s.relics.held.find((x) => x.uid === r.uid)!.waking = 1;
    expect(powerLive(s.relics.held.find((x) => x.uid === r.uid)!)).toBe(true);
    expect(relicPowerBonus(s, 'dustYield')).toBeCloseTo(0.45, 6);
  });

  it('a TRADE actually subtracts — the downside is real, not a smaller upside', () => {
    const { s } = fresh();
    wear(s, 'glassLung');
    expect(relicPowerBonus(s, 'cap')).toBeLessThan(0);
  });

  it('a SCALING power reads the board, not the card', () => {
    const { s } = fresh();
    wear(s, 'deepLedger');
    s.depth = 0;
    expect(relicPowerBonus(s, 'dustYield')).toBe(0);
    s.depth = 300;
    expect(relicPowerBonus(s, 'dustYield')).toBeCloseTo(0.2, 6);
    s.depth = 100_000; // and it is capped, so it can never run away with pillar 2
    expect(relicPowerBonus(s, 'dustYield')).toBeCloseTo(0.6, 6);
  });

  it('a PAIR power does nothing alone and fires with company', () => {
    const { s } = fresh();
    wear(s, 'leftHand');
    expect(pairMultiplier(s)).toBe(1);
    wear(s, 'twinFlame', { waking: 2 });
    wear(s, 'deepPockets', { waking: 2 });
    expect(pairMultiplier(s)).toBe(1.3);
    // ...and it multiplies what the OTHERS give rather than adding its own
    // line. Asserted against the same state with the pair broken, so waking and
    // resonance stay in both sides and only the pair term differs.
    const withPair = relicBonus(s, 'regen');
    // Break ONLY the pair: same relics, same waking, same resonance — the
    // carrier simply no longer carries The Left Hand.
    s.relics.held.find((r) => powerOf(r)?.id === 'leftHand')!.power = 'deepPockets';
    expect(pairMultiplier(s)).toBe(1);
    expect(withPair).toBeCloseTo(relicBonus(s, 'regen') * 1.3, 6);
  });

  it('a RULE power changes a rule, not a number', () => {
    const { s } = fresh();
    expect(holdCap(s)).toBe(RELIC_HOLD_CAP);
    wear(s, 'deepPockets');
    expect(relicRule(s, 'deepPockets')).toBe(true);
    expect(holdCap(s)).toBe(RELIC_HOLD_CAP + 25);
  });

  it('THE PATIENT STONE wakes the drawer — a rule about WHERE, not how fast', () => {
    const { s } = fresh();
    const sleeper = put(s); // never equipped
    tickRelics(s, ctx, 999_999);
    expect(wakingOf(s.relics.held.find((r) => r.uid === sleeper.uid)!)).toBe(0);
    wear(s, 'patientStone');
    tickRelics(s, ctx, WAKING_STEPS[1]!.at * 2);
    expect(wakingOf(s.relics.held.find((r) => r.uid === sleeper.uid)!)).toBe(1);
  });

  /** A fused-up relic gaining a power is what makes rarity feel like more than
   *  a bigger number — and a keeper NEVER loses the power a build was chosen for. */
  it('a fusion carries a power across but never replaces one', () => {
    const { s } = fresh();
    const bare = put(s, { rarity: 0 });
    const powered = put(s, { rarity: 3, power: 'glassLung' });
    s.relics.shards = 10_000;
    s.currencies['core'] = D(10_000);
    s.museum.completed = ['a', 'b', 'c', 'd', 'e'];
    expect(fuseRelics(s, bare.uid, powered.uid).ok).toBe(true);
    expect(powerOf(s.relics.held[0]!)?.id).toBe('glassLung');

    const keeper = put(s, { rarity: 3, power: 'shortFuse' });
    const other = put(s, { rarity: 3, power: 'glassLung' });
    expect(fuseRelics(s, keeper.uid, other.uid).ok).toBe(true);
    expect(powerOf(s.relics.held.find((r) => r.uid === keeper.uid)!)?.id).toBe('shortFuse');
  });

  /**
   * PILLAR 2, and the design goal in the same assertion. Powers are DERIVED, so
   * nothing stops six worn relics all deriving the same one — and six stacking
   * Glass Lungs would be +270% yield out of one authored line while making the
   * six slots a copy-paste rather than a choice.
   */
  it('a power counts ONCE however many relics carry it', () => {
    const { s } = fresh();
    for (let i = 0; i < 4; i++) wear(s, 'glassLung');
    expect(relicPowerBonus(s, 'dustYield')).toBeCloseTo(0.45, 6);
  });

  /** No migration, no back-fill: a relic already in a save has its power. */
  it('derives a power from what the relic already is', () => {
    const { s } = fresh();
    const old = addRelic(s, mintRelic(s, 'depth', 9));
    old.rarity = 3;
    expect(powerOf(old)).not.toBeNull();
    expect(powerOf(old)!.sources).toContain('depth');
    // Below Rare there is nothing, which is what a fusion-up is buying.
    old.rarity = 0;
    expect(powerOf(old)).toBeNull();
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
