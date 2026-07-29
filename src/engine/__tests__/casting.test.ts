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
  MELT_BACK_SHARE, QUEUE_MAX, benchComplete, benchPreview, canCast,
  castingUnlocked, crucibleFill, frontCharge, queued, tubHeld,
  currentTool, tubRoom, unitsThatFit,
} from '../systems/casting';
import { addMaterial, materialCount } from '../systems/forge';
import { allShells } from '../shells';
import { MATERIALS } from '../materials';
import { runMigrations } from '../save/migrations';

let engine: Engine;
const st = () => engine.getState() as GameState;
/** Total un-melted stock across every charge — the "is it done" check. */
const tubHeldSolid = () => queued(st().casting.crucible).reduce((n, q) => n + q.solid, 0);
/** What the tub would pour next. The tub is a QUEUE now; this is its front. */
const front = () => frontCharge(st().casting.crucible) ?? { materialId: '', solid: 0, molten: 0, purity: 0 };

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
  for (let i = 0; i < 200 && front().solid > 0; i++) engine.tick(0.1);
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
    const c = front();
    expect(c.materialId).toBe('marl');
    expect(c.solid).toBe(3 * MELT_PER_UNIT);
    expect(c.molten).toBe(0);
    expect(crucibleFill(st().casting.crucible).solid01).toBeGreaterThan(0);
    expect(crucibleFill(st().casting.crucible).molten01).toBe(0);

    // Half a second of the REAL engine tick.
    engine.tick(0.5);
    expect(front().molten).toBeCloseTo(MELT_RATE * 0.5, 4);
    expect(front().solid).toBeCloseTo(3 * MELT_PER_UNIT - MELT_RATE * 0.5, 4);
    expect(crucibleFill(st().casting.crucible).molten01).toBeGreaterThan(0);

    // And it finishes, exactly, with no float dust left behind.
    for (let i = 0; i < 50 && front().solid > 0; i++) engine.tick(0.1);
    expect(front().solid).toBe(0);
    expect(front().molten).toBeCloseTo(3 * MELT_PER_UNIT, 4);
  });

  it('the material leaves the Hold when it goes in the tub', () => {
    const before = materialCount(st(), 'marl');
    engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 4 });
    expect(materialCount(st(), 'marl')).toBe(before - 4);
  });

  it('pouring takes the melt and leaves a part made of what was in the tub', () => {
    meltFully('marl', 4);
    const had = front().molten;
    const r = engine.dispatch({ type: 'castPart', partType: 'head' });
    expect(r.ok).toBe(true);
    expect(front().molten).toBeCloseTo(had - partMelt('head'), 4);

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
    // The short-melt message now NAMES the stone, because a layered pour can be
    // short on any one of three and "you are short" would not say which.
    expect(engine.dispatch({ type: 'castPart', partType: 'grip' }).ok).toBe(true);
    expect(front().molten).toBe(6);
    const r = engine.dispatch({ type: 'castPart', partType: 'head' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Marl needs 8, has 6');
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
    expect(tubHeld(st().casting.crucible)).toBe(TUB_CAPACITY);
    expect(tubRoom(c)).toBe(0);
    expect(engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 1 }).reason)
      .toBe('The tub is full');
  });

  /**
   * THE TUB QUEUES, and this test used to assert the opposite — that a second
   * stone was REFUSED until you drained the first. That refusal was not a
   * design decision, it was bookkeeping: casting a Head in one material and an
   * Edge in another meant melt, pour, drain, melt again, for no choice made.
   */
  it('several stones queue in the tub at once', () => {
    open([['marl', 20, 60], ['ochre', 20, 60], ['graveclay', 20, 60]]);
    for (const id of ['marl', 'ochre', 'graveclay']) {
      expect(engine.dispatch({ type: 'chargeCrucible', materialId: id, units: 2 }).ok, id).toBe(true);
    }
    const q = queued(st().casting.crucible);
    expect(q.map((x) => x.materialId)).toEqual(['marl', 'ochre', 'graveclay']);
    expect(front().materialId).toBe('marl');
    // Capacity is SHARED — three stones do not each get a tub.
    expect(tubHeld(st().casting.crucible)).toBe(3 * 2 * MELT_PER_UNIT);
  });

  it('topping up a stone already in the tub stays one charge', () => {
    open([['marl', 40, 60]]);
    engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 2 });
    engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 3 });
    expect(queued(st().casting.crucible)).toHaveLength(1);
    expect(front().solid).toBe(5 * MELT_PER_UNIT);
  });

  /** THE VERB THE QUEUE EXISTS FOR: click a queued stone, it pours next. */
  it('bringing a queued stone to the front changes what pours', () => {
    open([['marl', 20, 60], ['ochre', 20, 60], ['graveclay', 20, 60], ['bonechalk', 20, 60]]);
    for (const id of ['marl', 'ochre', 'graveclay', 'bonechalk']) {
      engine.dispatch({ type: 'chargeCrucible', materialId: id, units: 2 });
    }
    for (let i = 0; i < 200 && front().solid > 0; i++) engine.tick(0.1);
    expect(front().materialId).toBe('marl');

    // The fourth one, brought forward — the brief's own example.
    expect(engine.dispatch({ type: 'bringToFront', index: 3 }).ok).toBe(true);
    expect(front().materialId).toBe('bonechalk');
    expect(queued(st().casting.crucible).map((x) => x.materialId))
      .toEqual(['bonechalk', 'marl', 'ochre', 'graveclay']);

    // And the next pour really is in that material — no re-melting.
    engine.dispatch({ type: 'castPart', partType: 'grip' });
    expect(st().casting.rack.at(-1)!.materialId).toBe('bonechalk');
  });

  it('every queued stone melts, so the second is ready when you want it', () => {
    open([['marl', 20, 60], ['ochre', 20, 60]]);
    engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 2 });
    engine.dispatch({ type: 'chargeCrucible', materialId: 'ochre', units: 2 });
    for (let i = 0; i < 200 && tubHeldSolid() > 0; i++) engine.tick(0.1);
    for (const q of queued(st().casting.crucible)) {
      expect(q.solid, q.materialId).toBe(0);
      expect(q.molten, q.materialId).toBe(2 * MELT_PER_UNIT);
    }
  });

  it('a spent charge leaves the queue and the next stone comes forward', () => {
    open([['marl', 20, 60], ['ochre', 20, 60]]);
    engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 1 }); // 4 melt
    engine.dispatch({ type: 'chargeCrucible', materialId: 'ochre', units: 2 });
    for (let i = 0; i < 200 && tubHeldSolid() > 0; i++) engine.tick(0.1);
    expect(front().materialId).toBe('marl');
    engine.dispatch({ type: 'castPart', partType: 'edge' }); // costs exactly 4
    expect(front().materialId, 'the empty charge should have left').toBe('ochre');
    expect(queued(st().casting.crucible)).toHaveLength(1);
  });

  it('the queue is bounded, and says so', () => {
    const many = ['marl', 'ochre', 'graveclay', 'bonechalk', 'loamiron', 'rootglass', 'duskflint'];
    open(many.map((id) => [id, 20, 60] as [string, number, number]));
    for (let i = 0; i < QUEUE_MAX; i++) {
      expect(engine.dispatch({ type: 'chargeCrucible', materialId: many[i]!, units: 1 }).ok).toBe(true);
    }
    const r = engine.dispatch({ type: 'chargeCrucible', materialId: many[QUEUE_MAX]!, units: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(new RegExp(String(QUEUE_MAX)));
    // But topping up one already there is always fine.
    expect(engine.dispatch({ type: 'chargeCrucible', materialId: many[0]!, units: 1 }).ok).toBe(true);
  });

  it('draining takes the front stone, not the whole tub', () => {
    open([['marl', 20, 60], ['ochre', 20, 60]]);
    engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 2 });
    engine.dispatch({ type: 'chargeCrucible', materialId: 'ochre', units: 2 });
    expect(engine.dispatch({ type: 'drainCrucible' }).ok).toBe(true);
    expect(front().materialId).toBe('ochre');
    expect(queued(st().casting.crucible)).toHaveLength(1);
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
    for (let i = 0; i < 100 && (frontCharge((engineRef.getState() as GameState).casting.crucible)?.solid ?? 0) > 0; i++) {
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
      for (let i = 0; i < 100 && front().solid > 0; i++) engine.tick(0.1);
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
      for (let i = 0; i < 100 && front().solid > 0; i++) engine.tick(0.1);
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
        for (let i = 0; i < 100 && front().solid > 0; i++) engine.tick(0.1);
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

// ---------------------------------------------------------------------------
// 6 — MELTING A PART BACK DOWN
// ---------------------------------------------------------------------------

describe('a part can go back in the tub', () => {
  it('returns 60% of what the mould cost, into an empty tub', () => {
    meltFully('marl', 4);
    engine.dispatch({ type: 'castPart', partType: 'head' });
    engine.dispatch({ type: 'drainCrucible' });
    const part = st().casting.rack[0]!;

    const r = engine.dispatch({ type: 'meltBack', partId: part.id });
    expect(r.ok).toBe(true);
    expect((r.data as { molten: number }).molten).toBeCloseTo(partMelt('head') * MELT_BACK_SHARE, 6);
    expect(front().molten).toBeCloseTo(partMelt('head') * 0.6, 6);
    expect(front().materialId).toBe('marl');
    expect(st().casting.rack).toHaveLength(0);
  });

  /** A RECLAIM, NOT AN UNDO. Changing your mind costs something, every time. */
  it('is a real loss — melting and re-casting never breaks even', () => {
    meltFully('marl', 10);
    engine.dispatch({ type: 'castPart', partType: 'head' });
    const had = front().molten;
    const id = st().casting.rack[0]!.id;
    engine.dispatch({ type: 'meltBack', partId: id });
    expect(front().molten).toBeLessThan(had + partMelt('head'));
    expect(MELT_BACK_SHARE).toBeLessThan(1);
  });

  /**
   * IT GOES BACK AS ITS OWN STONE. This used to be "and refuses a tub holding
   * another", because the tub held one material and a melt-back had to argue
   * with whatever was already in it. The queue removed the argument: a
   * reclaimed part opens its own charge, or joins the one it belongs to.
   */
  it('goes back to its own stone, whatever else is in the tub', () => {
    open([['marl', 20, 60], ['ochre', 20, 60]]);
    meltFully('marl', 4);
    engine.dispatch({ type: 'castPart', partType: 'grip' });
    const marlPart = st().casting.rack[0]!;
    engine.dispatch({ type: 'drainCrucible' });          // tub empty
    engine.dispatch({ type: 'chargeCrucible', materialId: 'ochre', units: 4 });

    // Ochre is in the tub. The Marl grip still goes back, as Marl.
    expect(engine.dispatch({ type: 'meltBack', partId: marlPart.id }).ok).toBe(true);
    const q = queued(st().casting.crucible);
    expect(q.map((x) => x.materialId)).toEqual(['ochre', 'marl']);
    expect(q[1]!.molten).toBeCloseTo(partMelt('grip') * MELT_BACK_SHARE, 6);

    // And a second Marl part joins that charge rather than opening a third.
    meltFully('marl', 2);
    engine.dispatch({ type: 'bringToFront', index: 1 });
    engine.dispatch({ type: 'castPart', partType: 'grip' });
    const another = st().casting.rack.at(-1)!;
    engine.dispatch({ type: 'meltBack', partId: another.id });
    expect(queued(st().casting.crucible)).toHaveLength(2);
  });

  /** THE GUARD. Melting the head out of the tool in your hand is not a thing
   *  anyone means to do, so the station and the tool are both out of reach. */
  it('will not melt a part that is on the station or in the tool', () => {
    meltFully('marl', 6);
    engine.dispatch({ type: 'castPart', partType: 'core' });
    engine.dispatch({ type: 'drainCrucible' });
    const id = st().casting.rack[0]!.id;
    engine.dispatch({ type: 'benchPlace', partId: id });
    const r = engine.dispatch({ type: 'meltBack', partId: id });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/station/);
    // Off the station, it melts.
    engine.dispatch({ type: 'benchClear', partType: 'core' });
    expect(engine.dispatch({ type: 'meltBack', partId: id }).ok).toBe(true);
  });

  it('the rack really does empty — this is the way out of an endless rack', () => {
    open([['marl', 200, 60]]);
    for (let i = 0; i < 6; i++) {
      meltFully('marl', 4);
      engine.dispatch({ type: 'castPart', partType: 'grip' });
      engine.dispatch({ type: 'drainCrucible' });
    }
    expect(st().casting.rack).toHaveLength(6);
    for (const p of [...st().casting.rack]) {
      engine.dispatch({ type: 'meltBack', partId: p.id });
      engine.dispatch({ type: 'drainCrucible' });
    }
    expect(st().casting.rack).toHaveLength(0);
  });

  it('a bad id is refused, not read as undefined', () => {
    expect(engine.dispatch({ type: 'meltBack', partId: 9999 }).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7 — THE SAVE THAT WAS MID-MELT
// ---------------------------------------------------------------------------

describe('the v38 migration does not tip out a tub somebody was using', () => {
  it('lifts a single-charge crucible into the front of the queue', () => {
    const payload = {
      version: 37,
      savedAtMs: 0,
      state: {
        seenSystems: ['dig'],
        casting: {
          rack: [], bench: {}, tool: [], nextId: 1, cast: 0, built: 0, wear: 0, repairs: 0,
          crucible: { materialId: 'marl', solid: 6, molten: 10, purity: 72 },
        },
      },
    } as never;
    const out = runMigrations(payload);
    const c = (out.state as Record<string, unknown>)['casting'] as {
      xp: number; crucible: { queue: Array<Record<string, number | string>> };
    };
    expect(c.crucible.queue).toHaveLength(1);
    expect(c.crucible.queue[0]).toEqual({ materialId: 'marl', solid: 6, molten: 10, purity: 72 });
    expect(c.xp).toBe(0);
  });

  it('and an empty one arrives as an empty queue, not a phantom charge', () => {
    const payload = {
      version: 37,
      savedAtMs: 0,
      state: {
        seenSystems: ['dig'],
        casting: { crucible: { materialId: '', solid: 0, molten: 0, purity: 0 } },
      },
    } as never;
    const out = runMigrations(payload);
    const c = (out.state as Record<string, unknown>)['casting'] as { crucible: { queue: unknown[] } };
    expect(c.crucible.queue).toEqual([]);
  });
});
