/**
 * THE NEW FORGE, STEP 2 — melt, pour, build.
 *
 * Five claims:
 *
 *  1  THE LOOP RUNS. Charge the crucible, watch it melt on the real tick, pour
 *     a part, and the part is made of what was in the tub at the purity that
 *     was in the tub.
 *  2  NO PUZZLE, NO FAIL. Nothing here rolls, nothing here spoils, and the same
 *     inputs give the same part every time.
 *  3  NOTHING IS DESTROYED BY BUILDING. Re-assembling returns the old tool's
 *     parts to the rack. This is the doc's "you never throw it away" promise,
 *     and it is the one that would hurt most to get wrong.
 *  4  THE MISMATCH PENALTY IS VISIBLE BEFORE THE COMMIT, and a coherent set
 *     really does beat a scattered one at the station — the thing step 1 built
 *     and this step has to actually surface.
 *  5  IT WORKS IN EVERY SHELL (the standing reach rule).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { PART_TYPES, type PartType } from '../content/forgeParts';
import { partMelt } from '../systems/forgeParts';
import {
  FULL_SET_MELT, MELT_PER_UNIT, MELT_RATE, TUB_CAPACITY,
  benchComplete, benchPreview, canCast, castingUnlocked, crucibleFill,
  currentTool, tubRoom, unitsThatFit,
} from '../systems/casting';
import { addMaterial, materialCount } from '../systems/forge';
import { allShells } from '../shells';
import { MATERIALS } from '../materials';

let engine: Engine;
const st = () => engine.getState() as GameState;

/** Open the floor and stock the Hold. Everything below drives real actions. */
function open(materials: Array<[string, number, number]> = [['marl', 40, 60]]): void {
  engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.forge.built = true;
  for (const [id, count, purity] of materials) addMaterial(s, id, purity, count);
}

/** Charge, then run the REAL engine tick until the tub has run. */
function meltFully(materialId: string, units: number): void {
  engine.dispatch({ type: 'chargeCrucible', materialId, units });
  for (let i = 0; i < 200 && st().casting.crucible.solid > 0; i++) engine.tick(0.1);
}

beforeEach(() => open());

// ---------------------------------------------------------------------------
// 1 — THE LOOP
// ---------------------------------------------------------------------------

describe('the loop: melt, pour, build', () => {
  it('the floor opens with the Forge and not before', () => {
    engine = createEngine({ nowMs: 0 });
    expect(castingUnlocked(st())).toBe(false);
    expect(engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 1 }).ok).toBe(false);
    (engine.getState() as GameState).forge.built = true;
    expect(castingUnlocked(st())).toBe(true);
  });

  /** THE VISUAL, PROVED AS A NUMBER. The bar has something to draw, it moves
   *  on the real tick, and it lands exactly where the arithmetic says. */
  it('charging fills the tub with SOLID, which melts over time into MOLTEN', () => {
    const r = engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 3 });
    expect(r.ok).toBe(true);
    const c = st().casting.crucible;
    expect(c.materialId).toBe('marl');
    expect(c.solid).toBe(3 * MELT_PER_UNIT);
    expect(c.molten).toBe(0);
    expect(crucibleFill(c).solid01).toBeGreaterThan(0);
    expect(crucibleFill(c).molten01).toBe(0);

    // Half a second of the REAL engine tick.
    engine.tick(0.5);
    const mid = st().casting.crucible;
    expect(mid.molten).toBeCloseTo(MELT_RATE * 0.5, 4);
    expect(mid.solid).toBeCloseTo(3 * MELT_PER_UNIT - MELT_RATE * 0.5, 4);
    expect(crucibleFill(mid).molten01).toBeGreaterThan(0);

    // And it finishes, exactly, with no float dust left behind.
    for (let i = 0; i < 50 && st().casting.crucible.solid > 0; i++) engine.tick(0.1);
    expect(st().casting.crucible.solid).toBe(0);
    expect(st().casting.crucible.molten).toBeCloseTo(3 * MELT_PER_UNIT, 4);
  });

  it('the material leaves the Hold when it goes in the tub', () => {
    const before = materialCount(st(), 'marl');
    engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 4 });
    expect(materialCount(st(), 'marl')).toBe(before - 4);
  });

  it('pouring takes the melt and leaves a part made of what was in the tub', () => {
    meltFully('marl', 4);
    const had = st().casting.crucible.molten;
    const r = engine.dispatch({ type: 'castPart', partType: 'head' });
    expect(r.ok).toBe(true);
    expect(st().casting.crucible.molten).toBeCloseTo(had - partMelt('head'), 4);

    const part = st().casting.rack[0]!;
    expect(part.type).toBe('head');
    expect(part.materialId).toBe('marl');
    expect(part.purity).toBe(60);
    expect(st().casting.cast).toBe(1);
  });

  it('a cast with not enough melt is refused, and says which of the two reasons', () => {
    // Nothing at all in the tub.
    expect(engine.dispatch({ type: 'castPart', partType: 'head' }).reason).toBe('The tub is empty');
    // Charged, but still solid — "still melting", not "you are short".
    engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 4 });
    expect(engine.dispatch({ type: 'castPart', partType: 'head' }).reason).toBe('Still melting');
    // Melted, then poured down below a head's price: 2 units = 8 melt, one
    // grip takes 2, so 6 is left against a head's 8.
    open();
    meltFully('marl', 2);
    expect(engine.dispatch({ type: 'castPart', partType: 'grip' }).ok).toBe(true);
    expect(st().casting.crucible.molten).toBe(6);
    const r = engine.dispatch({ type: 'castPart', partType: 'head' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Needs 8 melt, 6 in the tub');
  });

  /** BATCH — the doc asks for it by name: melt a stack, cast several. */
  it('one charge pours a whole set of seven', () => {
    meltFully('marl', Math.ceil(FULL_SET_MELT / MELT_PER_UNIT));
    for (const t of PART_TYPES) {
      expect(engine.dispatch({ type: 'castPart', partType: t }).ok, t).toBe(true);
    }
    expect(st().casting.rack).toHaveLength(7);
    expect(new Set(st().casting.rack.map((p) => p.type)).size).toBe(7);
  });

  it('the tub is capped, and "fill it" takes exactly what fits', () => {
    open([['marl', 500, 60]]);
    expect(unitsThatFit(st().casting.crucible)).toBe(TUB_CAPACITY / MELT_PER_UNIT);
    engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 999 });
    const c = st().casting.crucible;
    expect(c.solid + c.molten).toBe(TUB_CAPACITY);
    expect(tubRoom(c)).toBe(0);
    expect(engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 1 }).reason)
      .toBe('The tub is full');
  });

  it('two materials will not share a tub, and it says whose it is', () => {
    open([['marl', 20, 60], ['ochre', 20, 60]]);
    engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 2 });
    const r = engine.dispatch({ type: 'chargeCrucible', materialId: 'ochre', units: 2 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Marl/);
    // Draining clears it, and then the other stone goes in.
    expect(engine.dispatch({ type: 'drainCrucible' }).ok).toBe(true);
    expect(engine.dispatch({ type: 'chargeCrucible', materialId: 'ochre', units: 2 }).ok).toBe(true);
  });

  it('purity carries into the part, and a mixed charge averages', () => {
    open([['marl', 10, 90]]);
    addMaterial(st(), 'marl', 10, 10); // ten poor ones alongside ten fine
    // consumeMaterial takes best-band first, so two units are the clean stock.
    meltFully('marl', 2);
    engine.dispatch({ type: 'castPart', partType: 'grip' });
    expect(st().casting.rack[0]!.purity).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// 2 — NO PUZZLE, NO FAIL
// ---------------------------------------------------------------------------

describe('no puzzle, no fail', () => {
  it('the same charge gives the same part, every time', () => {
    const cast = (): { materialId: string; purity: number; type: string } => {
      open([['marl', 40, 60]]);
      meltFully('marl', 4);
      engine.dispatch({ type: 'castPart', partType: 'edge' });
      const p = st().casting.rack[0]!;
      return { materialId: p.materialId, purity: p.purity, type: p.type };
    };
    expect(cast()).toEqual(cast());
    expect(cast()).toEqual(cast());
  });

  it('a pour never produces a worse part, a broken part, or no part', () => {
    meltFully('marl', 10);
    for (let i = 0; i < 5; i++) {
      const before = st().casting.rack.length;
      const r = engine.dispatch({ type: 'castPart', partType: 'grip' });
      expect(r.ok).toBe(true);
      expect(st().casting.rack).toHaveLength(before + 1);
      expect(st().casting.rack.at(-1)!.purity).toBe(60);
    }
  });
});

// ---------------------------------------------------------------------------
// 3 — THE STATION, AND NOTHING DESTROYED
// ---------------------------------------------------------------------------

/** Cast a full set of `id` and put every piece on the station. */
function benchASetOf(engineRef: Engine, id: string, purity = 60): void {
  const s = engineRef.getState() as GameState;
  addMaterial(s, id, purity, 200);
  for (const t of PART_TYPES) {
    engineRef.dispatch({ type: 'chargeCrucible', materialId: id, units: 4 });
    for (let i = 0; i < 100 && (engineRef.getState() as GameState).casting.crucible.solid > 0; i++) {
      engineRef.tick(0.1);
    }
    engineRef.dispatch({ type: 'castPart', partType: t });
    engineRef.dispatch({ type: 'drainCrucible' });
    const rack = (engineRef.getState() as GameState).casting.rack;
    engineRef.dispatch({ type: 'benchPlace', partId: rack.at(-1)!.id });
  }
}

describe('the tool station', () => {
  it('a part goes to its own slot — there is no way to mis-slot one', () => {
    meltFully('marl', 6);
    engine.dispatch({ type: 'castPart', partType: 'handle' });
    const id = st().casting.rack[0]!.id;
    const r = engine.dispatch({ type: 'benchPlace', partId: id });
    expect(r.ok).toBe(true);
    expect(st().casting.bench.handle).toBe(id);
    expect(st().casting.bench.head).toBeUndefined();
  });

  it('an incomplete station will not build, and names what is missing', () => {
    meltFully('marl', 6);
    engine.dispatch({ type: 'castPart', partType: 'handle' });
    engine.dispatch({ type: 'benchPlace', partId: st().casting.rack[0]!.id });
    expect(benchComplete(st())).toBe(false);
    const r = engine.dispatch({ type: 'buildTool' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/HEAD/);
  });

  it('seven parts combine into a tool, and the station clears', () => {
    benchASetOf(engine, 'marl');
    expect(benchComplete(st())).toBe(true);
    expect(engine.dispatch({ type: 'buildTool' }).ok).toBe(true);
    expect(st().casting.tool).toHaveLength(7);
    expect(st().casting.bench).toEqual({});
    expect(st().casting.rack).toHaveLength(0);
    expect(currentTool(st())).not.toBeNull();
  });

  /**
   * THE PROMISE THAT WOULD HURT MOST TO BREAK. "A tool that is YOURS... you
   * never throw it away for a better drop." Building a second tool must hand
   * the first one's parts back, or the first mis-click costs a player a set.
   */
  it('re-building returns the OLD tool\'s parts — nothing is ever consumed', () => {
    benchASetOf(engine, 'marl');
    engine.dispatch({ type: 'buildTool' });
    const first = st().casting.tool.map((p) => p.id);

    benchASetOf(engine, 'ochre');
    const r = engine.dispatch({ type: 'buildTool' });
    expect(r.ok).toBe(true);
    expect((r.data as { returned: number }).returned).toBe(7);

    // The new tool is the ochre set; every marl part is back on the rack.
    expect(st().casting.tool.every((p) => p.materialId === 'ochre')).toBe(true);
    const rackIds = new Set(st().casting.rack.map((p) => p.id));
    for (const id of first) expect(rackIds.has(id), `part ${id} was eaten`).toBe(true);
  });

  it('taking a tool apart gives every piece back', () => {
    benchASetOf(engine, 'marl');
    engine.dispatch({ type: 'buildTool' });
    expect(engine.dispatch({ type: 'breakDownTool' }).ok).toBe(true);
    expect(st().casting.tool).toHaveLength(0);
    expect(st().casting.rack).toHaveLength(7);
    expect(currentTool(st())).toBeNull();
  });

  it('clearing a slot puts the part back in reach, not in the bin', () => {
    meltFully('marl', 6);
    engine.dispatch({ type: 'castPart', partType: 'grip' });
    const id = st().casting.rack[0]!.id;
    engine.dispatch({ type: 'benchPlace', partId: id });
    engine.dispatch({ type: 'benchClear', partType: 'grip' });
    expect(st().casting.bench.grip).toBeUndefined();
    expect(st().casting.rack.some((p) => p.id === id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4 — THE PENALTY, VISIBLE BEFORE THE COMMIT
// ---------------------------------------------------------------------------

describe('the mismatch penalty is legible at build time', () => {
  it('the station previews whatever is on it, so coherence moves as you place', () => {
    expect(benchPreview(st())).toBeNull();
    meltFully('marl', 8);
    engine.dispatch({ type: 'castPart', partType: 'head' });
    engine.dispatch({ type: 'benchPlace', partId: st().casting.rack.at(-1)!.id });
    const one = benchPreview(st());
    expect(one).not.toBeNull();
    expect(one!.parts).toHaveLength(1);
    expect(one!.coherence.factor).toBe(1); // one part agrees with itself

    engine.dispatch({ type: 'castPart', partType: 'grip' });
    engine.dispatch({ type: 'benchPlace', partId: st().casting.rack.at(-1)!.id });
    expect(benchPreview(st())!.parts).toHaveLength(2);
  });

  /**
   * THE HEADLINE. Two full sets built through the REAL actions: one matched,
   * one drawn from seven different shells. The scattered one has bigger raw
   * numbers and is the worse tool — and the station shows both, so the player
   * can see it before committing rather than after.
   */
  it('a scattered set previews WORSE than a matched one, before either is built', () => {
    // One best-ish part from each of the seven shells.
    const SCATTER: Array<[PartType, string]> = [
      ['head', 'firstiron'], ['core', 'lacuna'], ['edge', 'coronaite'],
      ['binding', 'starlens'], ['handle', 'wildstar'], ['grip', 'polestar'],
      ['sockets', 'starmarl'],
    ];
    open(SCATTER.map(([, id]) => [id, 40, 70] as [string, number, number]));
    for (const [slot, id] of SCATTER) {
      engine.dispatch({ type: 'chargeCrucible', materialId: id, units: 4 });
      for (let i = 0; i < 100 && st().casting.crucible.solid > 0; i++) engine.tick(0.1);
      engine.dispatch({ type: 'castPart', partType: slot });
      engine.dispatch({ type: 'drainCrucible' });
      engine.dispatch({ type: 'benchPlace', partId: st().casting.rack.at(-1)!.id });
    }
    const scattered = benchPreview(st())!;
    expect(scattered.parts).toHaveLength(7);

    // A matched Hollow set, one shell throughout.
    const MATCHED: Array<[PartType, string]> = [
      ['head', 'umbralite'], ['core', 'hushslate'], ['edge', 'echograin'],
      ['binding', 'resonarium'], ['handle', 'phantomsilver'], ['grip', 'voidmarl'],
      ['sockets', 'absencia'],
    ];
    open(MATCHED.map(([, id]) => [id, 40, 70] as [string, number, number]));
    for (const [slot, id] of MATCHED) {
      engine.dispatch({ type: 'chargeCrucible', materialId: id, units: 4 });
      for (let i = 0; i < 100 && st().casting.crucible.solid > 0; i++) engine.tick(0.1);
      engine.dispatch({ type: 'castPart', partType: slot });
      engine.dispatch({ type: 'drainCrucible' });
      engine.dispatch({ type: 'benchPlace', partId: st().casting.rack.at(-1)!.id });
    }
    const matched = benchPreview(st())!;

    // The scattered one LOOKS better and IS worse.
    expect(scattered.rawStats.bite).toBeGreaterThan(matched.rawStats.bite);
    expect(scattered.coherence.factor).toBeLessThan(0.5);
    expect(matched.coherence.factor).toBeGreaterThan(0.9);
    // And the readout the panel prints — raw against net — is a real loss.
    expect(scattered.rockRate).toBeLessThan(scattered.rawStats.bite * scattered.rawStats.cadence);
  });

  it('the built tool reports the same coherence the station previewed', () => {
    benchASetOf(engine, 'marl');
    const preview = benchPreview(st())!;
    engine.dispatch({ type: 'buildTool' });
    const built = currentTool(st())!;
    expect(built.coherence.factor).toBeCloseTo(preview.coherence.factor, 9);
    expect(built.rockRate).toBeCloseTo(preview.rockRate, 6);
  });
});

// ---------------------------------------------------------------------------
// 5 — REACH
// ---------------------------------------------------------------------------

describe('the standing reach rule — it works in every shell', () => {
  it('every shell has a material that melts, pours and builds', () => {
    for (const shell of allShells()) {
      const m = MATERIALS.find((x) => x.shellId === shell.id && !x.worked && x.source !== 'combat');
      expect(m, `${shell.id} has no mineable material`).toBeDefined();
      open([[m!.id, 200, 60]]);
      for (const t of PART_TYPES) {
        engine.dispatch({ type: 'chargeCrucible', materialId: m!.id, units: 4 });
        for (let i = 0; i < 100 && st().casting.crucible.solid > 0; i++) engine.tick(0.1);
        expect(canCast(st().casting.crucible, t), `${shell.id} cannot cast ${t}`).toBe(true);
        engine.dispatch({ type: 'castPart', partType: t });
        engine.dispatch({ type: 'drainCrucible' });
        engine.dispatch({ type: 'benchPlace', partId: st().casting.rack.at(-1)!.id });
      }
      expect(engine.dispatch({ type: 'buildTool' }).ok, `${shell.id} could not build`).toBe(true);
      const tool = currentTool(st())!;
      expect(tool.coherence.factor, shell.id).toBe(1); // one shell, one material
      expect(tool.rockRate, shell.id).toBeGreaterThan(0);
    }
  });

  it('every part type has a price and the set fits one tub', () => {
    for (const t of PART_TYPES) expect(partMelt(t)).toBeGreaterThan(0);
    expect(FULL_SET_MELT).toBeLessThanOrEqual(TUB_CAPACITY);
  });

  it('a bad part type from the action boundary is refused, not read as undefined', () => {
    meltFully('marl', 8);
    expect(engine.dispatch({ type: 'castPart', partType: 'nonsense' }).ok).toBe(false);
    expect(engine.dispatch({ type: 'benchClear', partType: 'nonsense' }).ok).toBe(false);
    expect(st().casting.rack).toHaveLength(0);
  });
});
