/**
 * THE PATTERN BENCH — PATTERNS (§13, §6), A.93.
 *
 *   0  the ledger is a claim: nothing here was already built
 *   1  the place, then the price, and tiers as capability
 *   2  RECORD — it writes down what you already did, and nothing else
 *   3  THE LOAD-BEARING ONE — a re-pour costs EXACTLY what the hands cost,
 *      part for part, melt for melt, unit for unit
 *   4  PILLAR 2
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { addMaterial, materialCount } from '../systems/forge';
import { markReached } from '../systems/roll';
import { MAX_MACHINE_TIER, tierOf } from '../systems/plant';
import { ensureCondition } from '../systems/condition';

import { castMelt, castPart, chargeCrucible, MELT_PER_UNIT } from '../systems/casting';
import {
  TIER_CAPABILITY_PATTERN, benchAsPattern, buildPatternBench, chargesItself, ensurePattern,
  forgetPattern, patternBuilt, patternFound, patternSlots, patternStation, patternsHeld,
  recordBlocker, recordPattern, repour, repourBlocker, repourCost,
} from '../systems/pattern';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;

function racked(st: GameState, n: number): GameState {
  st.casting.rack = Array.from({ length: n }, (_, i) =>
    ({ id: 4400 + i, materialId: 'marl', type: 'head', purity: 50 } as never));
  st.casting.nextId = 4400 + n;
  return st;
}

/** A player who has walked Glassmere past Patternwright's Rest. */
function walked(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'glassmere';
  markReached(st, 200, 15);
  st.shell.current = 'loam';
  st.forge.built = true;
  return racked(st, 24);
}

function withBench(tier = 1): GameState {
  const st = walked();
  for (let i = 0; i < tier; i++) buildPatternBench(st, ctx);
  return st;
}

/** Put a full tub of one stone in the heat, already liquid. */
function heat(st: GameState, materialId: string, units: number): void {
  addMaterial(st, materialId, 90, units + 4);
  chargeCrucible(st, ctx, materialId, units);
  const q = st.casting.crucible.queue[0]!;
  q.molten += q.solid; q.solid = 0;
}

describe('0 — the ledger is a claim: nothing here was already built', () => {
  it('no `pattern` tier, and no saved configuration anywhere', () => {
    const fresh = createEngine({ nowMs: 0 }).getState() as GameState;
    expect(tierOf(fresh, 'pattern')).toBe(0);
    expect(fresh.pattern).toBeUndefined();
  });
});

describe('1 — the place, then the price (§6, §15.4)', () => {
  it('it is at Patternwright\'s Rest 90 in Glassmere, where §6 puts it', () => {
    expect(patternStation()).toEqual({
      shellId: 'glassmere', depth: 90, name: "Patternwright's Rest",
    });
  });

  it('a player who has not been there cannot raise it', () => {
    const st = racked(createEngine({ nowMs: 0 }).getState() as GameState, 24);
    expect(patternFound(st)).toBe(false);
    expect(buildPatternBench(st, ctx).reason).toContain('Patternwright');
  });

  it('the tiers are three different sentences, not three sizes', () => {
    expect(new Set(TIER_CAPABILITY_PATTERN).size).toBe(TIER_CAPABILITY_PATTERN.length);
    expect(chargesItself(withBench(1))).toBe(false);
    expect(patternSlots(withBench(1))).toBe(1);
    expect(chargesItself(withBench(2))).toBe(true);
    expect(patternSlots(withBench(2))).toBe(1);
    const three = withBench(3);
    expect(patternSlots(three)).toBe(Infinity);
    expect(tierOf(three, 'pattern')).toBe(MAX_MACHINE_TIER);
  });

  it('and it is built from cast parts, remembering what it was cast from', () => {
    const st = walked();
    expect(patternBuilt(st)).toBe(false);
    expect(buildPatternBench(st, ctx).ok).toBe(true);
    expect(st.plant!.builtOf!['pattern']).toContain('marl');
  });

  it('a cracked bench draws nothing and pours nothing', () => {
    const st = withBench(1);
    heat(st, 'marl', 20);
    castPart(st, ctx, 'head', 'point');
    st.casting.bench['head'] = st.casting.rack.at(-1)!.id;
    expect(recordBlocker(st)).toBeNull();
    ensureCondition(st)['pattern'] = { id: 'baked', level: 1, seized: true };
    expect(recordBlocker(st)).toContain('cracked');
    expect(repourBlocker(st, 1)).toContain('cracked');
  });
});

// ---------------------------------------------------------------------------
// 2 — RECORD
// ---------------------------------------------------------------------------

describe('2 — a pattern writes down what you already did', () => {
  it('it reads the station, one row per slot, with shape and layers', () => {
    const st = withBench(1);
    heat(st, 'marl', 30);
    castPart(st, ctx, 'head', 'needle');
    st.casting.bench['head'] = st.casting.rack.at(-1)!.id;
    castPart(st, ctx, 'grip', 'knurled');
    st.casting.bench['grip'] = st.casting.rack.at(-1)!.id;

    const drawn = benchAsPattern(st);
    expect(drawn).toHaveLength(2);
    expect(drawn.find((c) => c.type === 'head')).toEqual({
      type: 'head', materialId: 'marl', shape: 'needle', layers: 1,
    });
    expect(drawn.find((c) => c.type === 'grip')!.shape).toBe('knurled');
  });

  it('an empty station has nothing to draw, and says so', () => {
    const st = withBench(1);
    expect(recordBlocker(st)).toContain('nothing on the station');
  });

  it('a tier-I bench holds ONE pattern; tier III holds as many as you like', () => {
    const one = withBench(1);
    heat(one, 'marl', 30);
    castPart(one, ctx, 'head', 'point');
    one.casting.bench['head'] = one.casting.rack.at(-1)!.id;
    expect(recordPattern(one, ctx, 'first').ok).toBe(true);
    expect(recordBlocker(one)).toContain('holds 1 pattern');
    expect(forgetPattern(one, ctx, 1).ok).toBe(true);
    expect(recordBlocker(one)).toBeNull();

    const three = withBench(3);
    heat(three, 'marl', 30);
    castPart(three, ctx, 'head', 'point');
    three.casting.bench['head'] = three.casting.rack.at(-1)!.id;
    expect(recordPattern(three, ctx, 'a').ok).toBe(true);
    expect(recordPattern(three, ctx, 'b').ok).toBe(true);
    expect(patternsHeld(three)).toHaveLength(2);
  });

  it('and the recording keeps its own name', () => {
    const st = withBench(1);
    heat(st, 'marl', 30);
    castPart(st, ctx, 'core', 'solid');
    st.casting.bench['core'] = st.casting.rack.at(-1)!.id;
    recordPattern(st, ctx, '  The Blue One  ');
    expect(patternsHeld(st)[0]!.name).toBe('The Blue One');
  });
});

// ---------------------------------------------------------------------------
// 3 — THE LOAD-BEARING ONE
// ---------------------------------------------------------------------------

/**
 * "A pattern records what you already did — it must not make anything cheaper,
 * only repeatable. If it reduces cost it's a faucet."
 *
 * `repour` calls `chargeCrucible` and `castPart`, the same two functions the
 * hands call, so the identity is structural. It is measured here anyway: a
 * structural argument nobody checked is still a claim.
 */
describe('3 — a re-pour costs exactly what the hands cost', () => {
  it('MELT: the quoted cost is the sum of the same `castMelt` a hand pays', () => {
    const st = withBench(1);
    heat(st, 'marl', 40);
    for (const [type, shape] of [['head', 'wide'], ['core', 'banded'], ['grip', 'knurled']] as const) {
      castPart(st, ctx, type, shape);
      st.casting.bench[type] = st.casting.rack.at(-1)!.id;
    }
    recordPattern(st, ctx);
    const pat = patternsHeld(st)[0]!;
    const byHand = pat.casts.reduce((n, c) => n + castMelt(c.type, c.shape, c.layers), 0);
    expect(repourCost(pat).melt).toBe(byHand);
    expect(repourCost(pat).units).toBe(Math.ceil(byHand / MELT_PER_UNIT));
  });

  it('THE TUB: a re-pour draws the same molten as three casts by hand', () => {
    const build = (): GameState => {
      const s = withBench(1);
      heat(s, 'marl', 40);
      return s;
    };
    // ARM 1 — by hand.
    const hand = build();
    const handBefore = hand.casting.crucible.queue[0]!.molten;
    for (const [type, shape] of [['head', 'wide'], ['core', 'banded'], ['grip', 'knurled']] as const) {
      expect(castPart(hand, ctx, type, shape).ok).toBe(true);
      /**
       * SEAT THE PART THAT WAS JUST CAST, by the id it came back with.
       * The first version searched the rack for the first part of each type —
       * and `racked()` pre-fills twenty-four DUMMY heads, so the pattern
       * recorded a plain Point instead of the Wide that had just been poured
       * and came out 3 melt cheaper. The test read that as the machine
       * discounting, which is exactly the defect it exists to catch.
       */
      hand.casting.bench[type] = hand.casting.rack.at(-1)!.id;
    }
    const handSpent = handBefore - (hand.casting.crucible.queue[0]?.molten ?? 0);
    recordPattern(hand, ctx);
    const pat = patternsHeld(hand)[0]!;

    // ARM 2 — the same three casts, off the pattern.
    const bench = build();
    ensurePattern(bench).saved = [pat];
    const benchBefore = bench.casting.crucible.queue[0]!.molten;
    const rackBefore = bench.casting.rack.length;
    const r = repour(bench, ctx, pat.id);
    expect(r.ok, r.reason).toBe(true);
    const benchSpent = benchBefore - (bench.casting.crucible.queue[0]?.molten ?? 0);

    expect(bench.casting.rack.length - rackBefore).toBe(pat.casts.length);
    expect(benchSpent, 'a re-pour was cheaper than the hands').toBe(handSpent);
    expect(benchSpent).toBeGreaterThan(0);
  });

  it('THE HOLD: a tier-II bench charges the tub at the same MELT_PER_UNIT', () => {
    const st = withBench(2);
    addMaterial(st, 'marl', 90, 60);
    const before = materialCount(st, 'marl');
    // A pattern recorded off a bench built by hand, on a separate arm.
    const src = withBench(1);
    heat(src, 'marl', 40);
    for (const [type, shape] of [['head', 'point'], ['grip', 'plain']] as const) {
      castPart(src, ctx, type, shape);
      src.casting.bench[type] = src.casting.rack.at(-1)!.id;
    }
    recordPattern(src, ctx);
    const pat = patternsHeld(src)[0]!;
    ensurePattern(st).saved = [pat];

    expect(repourBlocker(st, pat.id)).toBeNull();
    const r = repour(st, ctx, pat.id);
    expect(r.ok, r.reason).toBe(true);
    const spentUnits = before - materialCount(st, 'marl');
    // Every unit is worth MELT_PER_UNIT, and the pattern asked for exactly the
    // melt its casts cost, rounded up per cast — never less.
    const want = pat.casts.reduce(
      (n, c) => n + Math.ceil(castMelt(c.type, c.shape, c.layers) / MELT_PER_UNIT), 0,
    );
    expect(spentUnits).toBe(want);
    expect(spentUnits * MELT_PER_UNIT)
      .toBeGreaterThanOrEqual(pat.casts.reduce((n, c) => n + castMelt(c.type, c.shape, c.layers), 0));
  });

  it('a tier-I bench will NOT fill the tub, and says so', () => {
    const st = withBench(1);
    addMaterial(st, 'marl', 90, 60);
    const src = withBench(1);
    heat(src, 'marl', 40);
    castPart(src, ctx, 'head', 'point');
    src.casting.bench['head'] = src.casting.rack.at(-1)!.id;
    recordPattern(src, ctx);
    ensurePattern(st).saved = [patternsHeld(src)[0]!];
    expect(repourBlocker(st, 1)).toContain('does not fill it for you yet');
  });

  it('and a tier-II bench that is short NAMES the stone and the count', () => {
    const st = withBench(2);
    const src = withBench(1);
    heat(src, 'marl', 40);
    castPart(src, ctx, 'head', 'point');
    src.casting.bench['head'] = src.casting.rack.at(-1)!.id;
    recordPattern(src, ctx);
    ensurePattern(st).saved = [patternsHeld(src)[0]!];
    const r = repourBlocker(st, 1);
    expect(r).toContain('Marl');
    expect(r).toMatch(/wants \d+/);
  });
});

// ---------------------------------------------------------------------------
// 4 — PILLAR 2
// ---------------------------------------------------------------------------

describe('4 — PILLAR 2: it repeats and makes nothing', () => {
  it('no currency moves', () => {
    const st = withBench(2);
    addMaterial(st, 'marl', 90, 60);
    const src = withBench(1);
    heat(src, 'marl', 40);
    castPart(src, ctx, 'head', 'point');
    src.casting.bench['head'] = src.casting.rack.at(-1)!.id;
    recordPattern(src, ctx);
    ensurePattern(st).saved = [patternsHeld(src)[0]!];
    const before = JSON.stringify(st.currencies);
    repour(st, ctx, 1);
    expect(JSON.stringify(st.currencies)).toBe(before);
  });

  it('recording is free and changes nothing at all', () => {
    const st = withBench(1);
    heat(st, 'marl', 30);
    castPart(st, ctx, 'head', 'point');
    st.casting.bench['head'] = st.casting.rack.at(-1)!.id;
    const before = JSON.stringify({
      cur: st.currencies, mats: st.materials.stacks, rack: st.casting.rack.length,
      molten: st.casting.crucible.queue[0]?.molten,
    });
    recordPattern(st, ctx, 'free');
    expect(JSON.stringify({
      cur: st.currencies, mats: st.materials.stacks, rack: st.casting.rack.length,
      molten: st.casting.crucible.queue[0]?.molten,
    })).toBe(before);
  });

  it('dpsMax at the SAME depth is identical before and after', () => {
    const read = (run: boolean): number => {
      const st = withBench(2);
      st.depth = 62; // THE SAME DEPTH IN BOTH ARMS
      addMaterial(st, 'marl', 90, 60);
      if (run) {
        const src = withBench(1);
        heat(src, 'marl', 40);
        castPart(src, ctx, 'head', 'point');
        src.casting.bench['head'] = src.casting.rack.at(-1)!.id;
        recordPattern(src, ctx);
        ensurePattern(st).saved = [patternsHeld(src)[0]!];
        repour(st, ctx, 1);
      }
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });
});
