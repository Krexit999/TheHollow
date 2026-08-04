/**
 * THE PRISM — THE SPECTRUM (§13, §6), A.93.
 *
 *   0  THE COLLISION, measured before anything was built: §13 says the Prism
 *      blocks MINING IN GLASSMERE, and the shipped game lights the face without
 *      one. Reported, not re-authored.
 *   1  the place, then the price, and tiers as capability
 *   2  ONE SYSTEM, NOT TWO — `traceBeam` reads the allocation where it read a
 *      modulo, and a bare beam is bit-for-bit what it always was
 *   3  THE UNLIT ANSWER — A.90's unreachable rule, reachable
 *   4  PILLAR 2
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { markReached } from '../systems/roll';
import { MAX_MACHINE_TIER, tierOf } from '../systems/plant';
import {
  CONDITION_BITE, biting, ensureCondition, litBands, machineSpeed, ruleFor, setMachineBand,
  tickCondition,
} from '../systems/condition';
import {
  SPLIT_MASTERY, WAVELENGTH_NAMES, WAVELENGTH_RULES, splitUnlocked, traceBeam,
} from '../systems/refraction';
import {
  BAND_COUNT, INTENSITY, TIER_CAPABILITY_PRISM, allocate, allocateBlocker, buildPrism,
  carriedBands, ensurePrism, prismBuilt, prismFound, prismStation, reachesWhite, spectrum,
  spent, weighted,
} from '../systems/prism';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;

function racked(st: GameState, n: number): GameState {
  st.casting.rack = Array.from({ length: n }, (_, i) =>
    ({ id: 5000 + i, materialId: 'marl', type: 'head', purity: 50 } as never));
  st.casting.nextId = 5000 + n;
  return st;
}

/** A player standing in Glassmere who has walked past Prism Fall. */
function walked(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'glassmere';
  markReached(st, 200, 15);
  return racked(st, 24);
}

function withPrism(tier = 1): GameState {
  const st = walked();
  for (let i = 0; i < tier; i++) buildPrism(st, ctx);
  return st;
}

// ---------------------------------------------------------------------------
// 0 — THE COLLISION
// ---------------------------------------------------------------------------

/**
 * The brief: "If a machine's spec collides with what's built, measure and
 * report rather than re-authoring content."
 *
 * §13 gives the Prism two jobs — "light the face at all" and "blocks MINING IN
 * GLASSMERE" — and both describe a shell that does not work until a wreck is
 * looted. `refraction.ts` has shipped since Phase 10 and needs no machine at
 * all. This section is the measurement, kept as a test so the claim cannot
 * quietly stop being true.
 */
describe('0 — the spec collides with the shipped shell, and this is the measurement', () => {
  it('THE FACE IS ALREADY LIT: a beam traces with no Prism anywhere', () => {
    const st = walked();
    expect(prismBuilt(st), 'the fixture accidentally built one').toBe(false);
    const m = new ModifierCache(); m.invalidate();
    const path = traceBeam(st, m);
    expect(path.length, 'no beam without a Prism — the collision does not exist').toBeGreaterThan(0);
    // ...and every segment is WHITE, which is the pre-Split beam A.90 measured.
    expect(new Set(path.map((b) => b.color))).toEqual(new Set([0]));
  });

  it('so the Prism cannot gate mining without taking a shipped shell away', () => {
    // Stated as the thing that WOULD have to be true, and is not: no code path
    // anywhere makes the beam conditional on a machine.
    const st = walked();
    const m = new ModifierCache(); m.invalidate();
    const bare = traceBeam(st, m).length;
    const withOne = traceBeam(withPrism(1), m).length;
    expect(withOne, 'a Prism changed how FAR the light reaches').toBe(bare);
  });
});

describe('1 — the place, then the price (§6, §15.4)', () => {
  it('it is at Prism Fall 20 in Glassmere, exactly where §6 puts it', () => {
    expect(prismStation()).toEqual({ shellId: 'glassmere', depth: 20, name: 'Prism Fall' });
  });

  it('a player who has not been there cannot raise it', () => {
    const st = racked(createEngine({ nowMs: 0 }).getState() as GameState, 24);
    expect(prismFound(st)).toBe(false);
    expect(buildPrism(st, ctx).reason).toContain('Prism Fall');
  });

  it('the tiers are three different sentences, not three sizes', () => {
    expect(new Set(TIER_CAPABILITY_PRISM).size).toBe(TIER_CAPABILITY_PRISM.length);
    const one = withPrism(1);
    expect(weighted(one)).toBe(false);
    expect(reachesWhite(one)).toBe(false);
    const two = withPrism(2);
    expect(weighted(two)).toBe(true);
    expect(reachesWhite(two)).toBe(false);
    const three = withPrism(3);
    expect(reachesWhite(three)).toBe(true);
    expect(tierOf(three, 'prism')).toBe(MAX_MACHINE_TIER);
  });

  it('THE BUDGET NEVER GROWS — a tier buys a kind of freedom, not more points', () => {
    // Read at the tiers where a WEIGHT is legal at all: at tier I the refusal
    // is "leaning on one comes later", which is a different sentence about a
    // different rule, and asserting the budget there would have been reading
    // the tier gate instead.
    for (const t of [2, 3]) {
      const st = withPrism(t);
      expect(allocateBlocker(st, 1, INTENSITY + 1)).toContain(String(INTENSITY));
    }
    // And tier I hits the same ceiling by spreading rather than by stacking.
    const one = withPrism(1);
    allocate(one, ctx, 4, 1);   // a fourth band, against a budget of three
    expect(spent(one)).toBeLessThanOrEqual(INTENSITY);
  });

  it('tier I carries a band or it does not; tier II leans on one', () => {
    const one = withPrism(1);
    expect(allocateBlocker(one, 1, 1)).toBeNull();
    expect(allocateBlocker(one, 1, 2)).toContain('Leaning on one comes later');
    const two = withPrism(2);
    // Clear the defaults first so there is budget to lean with.
    allocate(two, ctx, 2, 0); allocate(two, ctx, 3, 0);
    expect(allocateBlocker(two, 1, 3)).toBeNull();
  });

  it('white is a tier-III target and nothing below it', () => {
    const two = withPrism(2);
    expect(allocateBlocker(two, 0, 1)).toContain('cannot put it back together');
    const three = withPrism(3);
    allocate(three, ctx, 1, 0);
    expect(allocateBlocker(three, 0, 1)).toBeNull();
  });

  it('and it is built from cast parts, remembering what it was cast from', () => {
    const st = walked();
    expect(buildPrism(st, ctx).ok).toBe(true);
    expect(st.plant!.builtOf!['prism']).toContain('marl');
  });

  it('a cracked Prism will not run — E2 reaches it like every machine', () => {
    const st = withPrism(1);
    allocate(st, ctx, 1, 0);                 // free a point first: the budget is 3
    expect(allocateBlocker(st, 4, 1)).toBeNull();
    ensureCondition(st)['prism'] = { id: 'baked', level: 1, seized: true };
    expect(allocateBlocker(st, 4, 1)).toContain('cracked');
  });
});

// ---------------------------------------------------------------------------
// 2 — ONE SYSTEM, NOT TWO
// ---------------------------------------------------------------------------

describe('2 — the allocation is what `traceBeam` reads', () => {
  it('the six rules are refraction\'s, not a second copy', () => {
    const rows = spectrum(withPrism(1));
    expect(rows).toHaveLength(BAND_COUNT);
    expect(rows.map((r) => r.name)).toEqual(WAVELENGTH_NAMES);
    expect(rows.map((r) => r.rule)).toEqual(WAVELENGTH_RULES);
  });

  it('A BARE BEAM IS BIT-FOR-BIT WHAT IT ALWAYS WAS', () => {
    const st = walked();
    st.face.w = 6; st.face.h = 6;
    const m = new ModifierCache(); m.invalidate();
    expect(carriedBands(st), 'an unbuilt Prism carried something').toEqual([]);
    const before = traceBeam(st, m).map((b) => [b.cell, b.color, b.dir]);
    // The same face, post-Split, with no Prism: the old modulo, unchanged.
    // Mastery is `depthRecord / 10`, so the Split is a DEPTH, not a field.
    st.depthRecords['glassmere'] = SPLIT_MASTERY * 10;
    expect(splitUnlocked(st)).toBe(true);
    st.refraction.pathDirty = true;
    const split = traceBeam(st, m);
    expect(split.map((b) => b.cell)).toEqual(before.map((b) => b[0]));
    /**
     * THE OLD MODULO, ASSERTED AS THE FORMULA rather than as a set of colours.
     * The first version expected all five bands and got two, because the
     * colours cycle every THREE segments and a six-wide face is a short path —
     * i.e. the assertion was about the fixture's geometry, not about the rule.
     */
    expect(split.map((b) => b.color))
      .toEqual(split.map((_, i) => 1 + ((i / 3) | 0) % 5));
  });

  it('...and a standing Prism decides the colours instead', () => {
    const st = withPrism(1);
    st.face.w = 8; st.face.h = 8;
    const m = new ModifierCache(); m.invalidate();
    allocate(st, ctx, 1, 0); allocate(st, ctx, 2, 0); allocate(st, ctx, 3, 0);
    allocate(st, ctx, 5, 1);
    expect(carriedBands(st)).toEqual([5]);
    const path = traceBeam(st, m);
    expect(path.length).toBeGreaterThan(2);
    expect(new Set(path.map((b) => b.color)), 'the beam ignored the allocation').toEqual(new Set([5]));
  });

  it('a band leaned on occupies more of the path', () => {
    const st = withPrism(2);
    allocate(st, ctx, 1, 0); allocate(st, ctx, 2, 0); allocate(st, ctx, 3, 0);
    allocate(st, ctx, 4, 2); allocate(st, ctx, 5, 1);
    expect(carriedBands(st)).toEqual([4, 4, 5]);
    expect(spent(st)).toBe(3);
  });

  it('the light lands where it was put, and the budget is conserved', () => {
    const st = withPrism(2);
    expect(spent(st)).toBeLessThanOrEqual(INTENSITY);
    allocate(st, ctx, 1, 0);
    allocate(st, ctx, 5, 1);
    expect(spent(st)).toBeLessThanOrEqual(INTENSITY);
    expect(ensurePrism(st).intensity.every((n) => n >= 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3 — THE UNLIT ANSWER
// ---------------------------------------------------------------------------

/**
 * A.90 shipped Glassmere's E2 rule and recorded that it could not fire before
 * THE SPLIT, because a white beam lights all six bands. This is the answer, and
 * it is asserted from both sides: still unreachable with no Prism, reachable
 * with one, at mastery zero.
 */
describe('3 — A.90\'s unreachable rule, made reachable', () => {
  it('the finding still holds with NO Prism: every band is lit, so nothing is UNLIT', () => {
    const st = walked();
    expect(splitUnlocked(st), 'the fixture is past the Split — the finding cannot be read').toBe(false);
    const m = new ModifierCache(); m.invalidate();
    traceBeam(st, m);
    st.refraction.path = traceBeam(st, m);
    expect(litBands(st).size).toBe(6);
  });

  it('...and a standing Prism leaves bands DARK, before the Split', () => {
    const st = withPrism(1);
    expect(splitUnlocked(st)).toBe(false);
    allocate(st, ctx, 1, 0); allocate(st, ctx, 2, 0); allocate(st, ctx, 3, 0);
    allocate(st, ctx, 4, 1);
    expect([...litBands(st)]).toEqual([4]);
  });

  it('AND THE RULE FIRES: a machine in a dark band goes UNLIT and keeps its band', () => {
    const st = withPrism(1);
    // Siever's Rest is FERRITE's wreck and this fixture stands in Glassmere, so
    // the Sieve is seated directly: this section is about the CONDITION, and
    // routing it through a build that cannot succeed here would have tested the
    // fixture instead of the rule.
    st.plant!.tiers['sieve'] = 2;
    allocate(st, ctx, 1, 0); allocate(st, ctx, 2, 0); allocate(st, ctx, 3, 0);
    allocate(st, ctx, 4, 1);
    setMachineBand(st, 'sieve', 1);                     // a band with no light on it
    expect(litBands(st).has(1)).toBe(false);

    const m = new ModifierCache(); m.invalidate();
    expect(ruleFor('glassmere')!.id).toBe('unlit');
    tickCondition(st, m, 600);
    expect(biting(st, 'sieve', 'unlit'), 'the rule did not write').toBe(true);
    expect(machineSpeed(st, 'sieve')).toBeLessThan(1);  // half speed
  });

  it('...and moving the machine into a LIT band clears it', () => {
    const st = withPrism(1);
    st.plant!.tiers['sieve'] = 2;
    allocate(st, ctx, 1, 0); allocate(st, ctx, 2, 0); allocate(st, ctx, 3, 0);
    allocate(st, ctx, 4, 1);
    setMachineBand(st, 'sieve', 1);
    const m = new ModifierCache(); m.invalidate();
    tickCondition(st, m, 600);
    expect(biting(st, 'sieve', 'unlit')).toBe(true);
    setMachineBand(st, 'sieve', 4);                     // where the light is
    tickCondition(st, m, 600);
    expect(biting(st, 'sieve', 'unlit')).toBe(false);
  });

  it('white lights everything, which is why it is the tier-III target', () => {
    const st = withPrism(3);
    allocate(st, ctx, 1, 0); allocate(st, ctx, 2, 0); allocate(st, ctx, 3, 0);
    allocate(st, ctx, 0, 1);
    expect(litBands(st).size).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 4 — PILLAR 2
// ---------------------------------------------------------------------------

describe('4 — PILLAR 2: it aims the light and makes none', () => {
  it('the path LENGTH cannot move, whatever the allocation', () => {
    const st = withPrism(3);
    st.face.w = 8; st.face.h = 8;
    const m = new ModifierCache(); m.invalidate();
    const lengths = new Set<number>();
    for (let b = 0; b < BAND_COUNT; b++) {
      for (let x = 0; x < BAND_COUNT; x++) allocate(st, ctx, x, 0);
      allocate(st, ctx, b, INTENSITY);
      st.refraction.pathDirty = true;
      lengths.add(traceBeam(st, m).length);
    }
    expect(lengths.size, 'an allocation changed how far the light reached').toBe(1);
  });

  it('no currency moves when the light is re-aimed', () => {
    const st = withPrism(3);
    const before = JSON.stringify(st.currencies);
    allocate(st, ctx, 1, 0);
    allocate(st, ctx, 5, 2);
    expect(JSON.stringify(st.currencies)).toBe(before);
  });

  it('no material moves either', () => {
    const st = withPrism(3);
    const before = JSON.stringify(st.materials.stacks);
    allocate(st, ctx, 5, 1);
    expect(JSON.stringify(st.materials.stacks)).toBe(before);
    expect(st.materials.totalDrops).toBe(0);
  });

  it('dpsMax at the SAME depth is identical before and after', () => {
    const read = (run: boolean): number => {
      const st = withPrism(3);
      st.depth = 62; // THE SAME DEPTH IN BOTH ARMS
      if (run) {
        for (let b = 0; b < BAND_COUNT; b++) allocate(st, ctx, b, 0);
        allocate(st, ctx, 0, INTENSITY);
      }
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });

  it('the condition it enables is still only speed and band, never yield', () => {
    const st = withPrism(1);
    st.plant!.tiers['sieve'] = 2;
    setMachineBand(st, 'sieve', 1);
    for (let b = 1; b < BAND_COUNT; b++) allocate(st, ctx, b, 0);
    allocate(st, ctx, 5, 1);
    const m = new ModifierCache(); m.invalidate();
    tickCondition(st, m, 600);
    const c = ensureCondition(st)['sieve']!;
    expect(c.id).toBe('unlit');
    expect(c.level).toBeGreaterThanOrEqual(CONDITION_BITE);
  });
});
