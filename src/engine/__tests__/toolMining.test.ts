/**
 * THE NEW FORGE, STEP 3 — the tool meets the rock, and wears out doing it.
 *
 * Five claims:
 *
 *  1  BARE HANDS ARE UNCHANGED (pillar 1). A player with no tool mines exactly
 *     as they did before this step existed. Not nerfed to make room.
 *  2  THE TOOL IS REACH, NOT YIELD. Every extra cell goes through `harvestCell`,
 *     so a swing can never take charge the field has not grown. Pillar 2 is
 *     structural here and MEASURED in `scripts/sim-tool-ceiling.ts`.
 *  3  ORESPEED IS THE EDGE'S JOB and buys seconds off the hold gesture.
 *  4  DURABILITY IS ABOUT THE BUILD, NOT THE DEPTH. A brittle tool wears out
 *     roughly twice as fast as a tough one, at every depth.
 *  5  A BROKEN TOOL STILL WORKS, is never worse than bare hands, and is never
 *     lost. Repair costs material; rebuilding is not a free repair.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { PART_TYPES, type PartType } from '../content/forgeParts';
import { assembleTool, makePart } from '../systems/forgeParts';
import { addMaterial, materialCount, requiredTier } from '../systems/forge';
import { maxToolTier } from '../shells';
import { BASE_CAP, reachFrom } from '../systems/face';
import {
  BARE_HANDS, BROKEN_SHARE, MAX_EXTRA_CELLS, REPAIR_UNITS, effectOf, isBroken,
  poolOf, repairShare, toolEffect, toughnessIndex, usesLeft, usesOf, wearPerUse,
  wornPart,
  castingToolTier, effectiveToolTier, grantsFor, levelOf, levelProgress, modSlotsOf,
  toolLevel, xpForLevel, SLOT_EVERY,
} from '../systems/toolMining';

let engine: Engine;
const st = () => engine.getState() as GameState;

/** Fit a tool of one material without going through the crucible — casting it
 *  honestly is step 2's test, not this one. */
function hold(materialId: string | null, purity = 60): void {
  const s = st();
  s.forge.built = true;
  s.casting.tool = materialId === null
    ? []
    : PART_TYPES.map((t, i) => ({ ...makePart(t, materialId, purity), id: i + 1 }));
  s.casting.wear = 0;
}

const toolOf = (id: string, purity = 60) =>
  assembleTool(PART_TYPES.map((t) => makePart(t, id, purity)));

/** Fill the face to cap so a swing has something to take everywhere. */
function fillFace(): void {
  const s = st();
  s.face.cells = s.face.cells.map(() => BASE_CAP);
  s.face.ore = new Array(s.face.cells.length).fill('');
}

beforeEach(() => {
  engine = createEngine({ nowMs: 0 });
  hold(null);
});

// ---------------------------------------------------------------------------
// 1 — PILLAR 1
// ---------------------------------------------------------------------------

describe('bare hands are unchanged', () => {
  it('a player with no tool gets exactly the old behaviour', () => {
    expect(toolEffect(st())).toEqual(BARE_HANDS);
    expect(BARE_HANDS.cells).toBe(1);
    expect(BARE_HANDS.splash).toBe(0);
    expect(BARE_HANDS.oreRate).toBe(1);
    expect(BARE_HANDS.dropWeight).toBe(1);
  });

  it('a bare swing takes one cell and touches nothing else', () => {
    fillFace();
    const before = [...st().face.cells];
    const r = engine.dispatch({ type: 'chip', cell: 14 });
    expect(r.ok).toBe(true);
    const after = st().face.cells;
    const moved = after.map((c, i) => (Math.abs(c - before[i]!) > 1e-9 ? i : -1)).filter((i) => i >= 0);
    expect(moved).toEqual([14]);
  });

  it('carrying a tool never touches the idle layer', () => {
    // Two engines, same seed of state, one holding an Aleph tool. Only the
    // clock runs. The face must regenerate identically.
    const idle = (mat: string | null): number => {
      engine = createEngine({ nowMs: 0 });
      hold(mat);
      const s = st();
      s.face.cells = s.face.cells.map(() => 1);
      for (let i = 0; i < 300; i++) engine.tick(0.1);
      return st().face.cells.reduce((a, b) => a + b, 0);
    };
    expect(idle('firstiron')).toBeCloseTo(idle(null), 9);
  });
});

// ---------------------------------------------------------------------------
// 2 — REACH, NOT YIELD
// ---------------------------------------------------------------------------

describe('the tool buys reach, and reach cannot break the ceiling', () => {
  it('a swing with a tool touches more cells than one without', () => {
    fillFace();
    const bare = engine.dispatch({ type: 'chip', cell: 14 });
    const bareDust = (bare.data as { dust: { toNumber(): number } } | undefined);
    void bareDust;

    engine = createEngine({ nowMs: 0 });
    hold('firstiron');
    fillFace();
    const before = [...st().face.cells];
    engine.dispatch({ type: 'chip', cell: 14 });
    const after = st().face.cells;
    const moved = after.map((c, i) => (Math.abs(c - before[i]!) > 1e-9 ? i : -1)).filter((i) => i >= 0);
    // Tied to the derivation, not to a number I remembered: cell 14 is interior
    // on a 6x6, so every cell the effect claims to reach really is there.
    expect(moved.length).toBe(effectOf(toolOf('firstiron'), false).cells);
    expect(moved.length).toBeGreaterThan(1);
    expect(moved).toContain(14);
  });

  /**
   * THE PILLAR-2 ARGUMENT, MADE STRUCTURALLY. A swing cannot take charge that
   * is not in the cell — `harvestCell` clamps to what is held, minus the regen
   * floor. So an enormous tool on an EMPTY face takes nothing at all, whatever
   * its bite says.
   */
  it('a swing on empty rock takes nothing, however good the tool is', () => {
    hold('firstiron');
    st().face.cells = st().face.cells.map(() => 0);
    const before = st().stats.fieldChargeHarvested.toNumber();
    for (let i = 0; i < 20; i++) engine.dispatch({ type: 'chip', cell: i % 36 });
    expect(st().stats.fieldChargeHarvested.toNumber()).toBeCloseTo(before, 9);
  });

  /**
   * CONSERVATION — the invariant that actually matters, and the one the first
   * cut of this test missed. It asserted cells never reach zero, which is NOT a
   * property of the base game: `regenFloorShare` is 0 by default (laws.ts) and
   * the unemptying is an opt-in law, so a bare chip empties a cell too.
   *
   * The real claim is that every grain a swing credits came OUT of the face.
   * A tool that reached further and conjured charge would break here, and no
   * amount of reach can pass it.
   */
  it('every grain a swing credits came out of the face — nothing is conjured', () => {
    hold('firstiron');
    fillFace();
    const faceBefore = st().face.cells.reduce((a, b) => a + b, 0);
    const gotBefore = st().stats.fieldChargeHarvested.toNumber();
    for (let i = 0; i < 50; i++) engine.dispatch({ type: 'chip', cell: i % 36 });
    const removed = faceBefore - st().face.cells.reduce((a, b) => a + b, 0);
    const credited = st().stats.fieldChargeHarvested.toNumber() - gotBefore;
    expect(credited).toBeGreaterThan(0);
    expect(credited).toBeCloseTo(removed, 6);
    for (const c of st().face.cells) expect(c).toBeGreaterThanOrEqual(0);
  });

  it('a pocket is immune to a swing, reach or not', () => {
    hold('firstiron');
    fillFace();
    const s = st();
    s.face.ore![13] = 'fatseam';
    s.face.cells[13] = 400;
    engine.dispatch({ type: 'chip', cell: 14 });
    expect(st().face.cells[13], 'the pocket beside the strike was splashed').toBe(400);
  });

  it('reach is deterministic — the same swing touches the same rock', () => {
    const cells = reachFrom(st(), 14, 8);
    expect(reachFrom(st(), 14, 8)).toEqual(cells);
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells).not.toContain(14);
    // A corner has fewer neighbours, and asking for eight gets what exists.
    expect(reachFrom(st(), 0, 8).length).toBe(3);
    expect(reachFrom(st(), 14, 0)).toEqual([]);
  });

  it('the ladder rises with depth and stops at a 3x3', () => {
    const cells = (id: string) => effectOf(toolOf(id), false).cells;
    expect(cells('marl')).toBeGreaterThan(BARE_HANDS.cells);
    expect(cells('firstiron')).toBeGreaterThan(cells('marl'));
    expect(cells('firstiron')).toBeLessThanOrEqual(1 + MAX_EXTRA_CELLS);
    // And splash is a fraction, never more than the whole cell.
    for (const id of ['marl', 'slagrock', 'firstiron']) {
      expect(effectOf(toolOf(id), false).splash).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 3 — ORE SPEED
// ---------------------------------------------------------------------------

describe('ore speed buys seconds off the hold gesture', () => {
  function digProgress(mat: string | null): number {
    engine = createEngine({ nowMs: 0 });
    hold(mat);
    const s = st();
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.face.oreDug = new Array(s.face.cells.length).fill(0);
    s.face.ore[5] = 'fatseam';
    /**
     * A SHORT GESTURE, because ore work now has teeth.
     *
     * This used to hold for a whole second, which was fine while the best
     * tool was worth ~4x the hands. A heavy build is worth far more than that
     * now, so it FINISHED the pocket inside the second — and the `workOre`
     * action opens a finished pocket, which clears `oreDug`. The test then
     * read zero progress off the best tool in the game and called it a
     * regression. It is measuring leftover progress, so it has to stop short
     * of completion to measure anything at all.
     */
    engine.dispatch({ type: 'workOre', cell: 5, seconds: 0.05 });
    return (engine.getState() as GameState).face.oreDug![5]!;
  }

  it('a deep tool works a pocket faster than bare hands', () => {
    const bare = digProgress(null);
    const deep = digProgress('firstiron');
    expect(bare).toBeGreaterThan(0);
    expect(deep / bare, 'an aleph edge should be worth several times the hands').toBeGreaterThan(3);
  });

  it('bare hands work at exactly the rate they always did', () => {
    expect(digProgress(null)).toBeCloseTo(0.05, 6);
  });

  it('the rate is capped, so a pocket stays a decision', () => {
    const e = effectOf(toolOf('firstiron', 100), false);
    expect(e.oreRate).toBeLessThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// 4 — DURABILITY IS ABOUT THE BUILD
// ---------------------------------------------------------------------------

describe('durability is decided by the build, not the depth', () => {
  it('a brittle tool wears out about twice as fast as a tough one', () => {
    const brittle = usesOf(toolOf('umberjade'));   // brittle/charged
    const tough = usesOf(toolOf('graveclay'));     // dense/tough
    expect(tough / brittle, `tough ${tough} vs brittle ${brittle}`).toBeGreaterThan(1.8);
  });

  /** The tradeoff has to survive descending, or it stops being one at Ferrite. */
  it('and that stays true at every depth — uses are scale-free', () => {
    const loam = usesOf(toolOf('marl'));
    const aleph = usesOf(toolOf('firstiron'));
    expect(aleph / loam).toBeLessThan(3);
    expect(loam / aleph).toBeLessThan(3);
  });

  it('one brittle part in a tough set is what gets named', () => {
    const mixed = assembleTool(PART_TYPES.map((t) =>
      makePart(t, t === 'edge' ? 'umberjade' : 'graveclay', 60)));
    expect(wornPart(mixed)).toBe('edge');
    expect(usesOf(mixed)).toBeLessThan(usesOf(toolOf('graveclay')));
  });

  /**
   * A UNIFORM TOOL HAS NO BRITTLE PART, so the tie has to break somewhere. It
   * breaks toward the BIGGEST REPAIR — the Core holds most of the pool — because
   * the first-wins tie named the Head, which is both arbitrary and the worst
   * advice on the board.
   */
  it('a tool cast from one stone names the part that repairs the most', () => {
    const uniform = toolOf('marl');
    const named = wornPart(uniform)!;
    for (const t of PART_TYPES) {
      expect(repairShare(uniform, named)).toBeGreaterThanOrEqual(repairShare(uniform, t));
    }
  });

  it('swings drain the pool, and only the manual verbs do', () => {
    hold('marl');
    fillFace();
    const tool = toolOf('marl');
    expect(st().casting.wear).toBe(0);
    engine.dispatch({ type: 'chip', cell: 3 });
    expect(st().casting.wear).toBeCloseTo(wearPerUse(tool), 6);
    // The clock alone does nothing — the idle layer is not a maintenance cost.
    const held = st().casting.wear;
    for (let i = 0; i < 100; i++) engine.tick(0.1);
    expect(st().casting.wear).toBe(held);
  });

  it('a sweep is nine swings of wear, not one', () => {
    hold('marl');
    fillFace();
    st().face.stamina = 100;
    engine.dispatch({ type: 'sweep', cells: [0, 1, 2, 3, 4] });
    const per = wearPerUse(toolOf('marl'));
    expect(st().casting.wear / per).toBeGreaterThan(4.5);
  });

  /**
   * THE INVARIANT IS THE HALVING, NOT THE ABSOLUTE.
   *
   * `usesOf` is the scale-free pool count; `usesLeft` is what the panel prints,
   * and since the balance axis landed it also carries the BALANCE wear term — a
   * light tool spends less of the pool per swing and therefore genuinely has
   * more swings in it than `usesOf` alone says. Marl is a light stone, so these
   * two legitimately differ now.
   *
   * What must still hold, and is the thing this test was actually protecting:
   * the panel's count is proportional to the pool remaining. Half the pool
   * spent, half the swings left.
   */
  it('the swing count on the panel tracks the pool it draws', () => {
    hold('marl');
    const tool = toolOf('marl');
    const full = usesLeft(st(), tool);
    expect(full).toBeGreaterThan(0);
    st().casting.wear = poolOf(tool) / 2;
    expect(usesLeft(st(), tool)).toBeCloseTo(full / 2, 0);
    // And it is still the same shape-free pool underneath.
    expect(usesOf(tool)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5 — BROKEN, AND REPAIR
// ---------------------------------------------------------------------------

describe('a broken tool still works, and is never lost', () => {
  it('it breaks at the floor of the pool and stays usable', () => {
    hold('marl');
    const tool = toolOf('marl');
    expect(isBroken(st(), tool)).toBe(false);
    st().casting.wear = poolOf(tool);
    expect(isBroken(st(), tool)).toBe(true);
    // Still there, still seven parts.
    expect(st().casting.tool).toHaveLength(7);
    fillFace();
    const before = st().stats.fieldChargeHarvested.toNumber();
    engine.dispatch({ type: 'chip', cell: 14 });
    expect(st().stats.fieldChargeHarvested.toNumber()).toBeGreaterThan(before);
  });

  /**
   * THE TRAP THIS AVOIDS. "Heavily penalised" must not mean "worse than putting
   * it down" — a maintenance mechanic that makes the player want to unequip is
   * a punishment, not a cost.
   */
  it('and is never WORSE than bare hands', () => {
    for (const id of ['marl', 'slagrock', 'firstiron']) {
      const bust = effectOf(toolOf(id), true);
      expect(bust.cells, id).toBeGreaterThanOrEqual(BARE_HANDS.cells);
      expect(bust.oreRate, id).toBeGreaterThanOrEqual(BARE_HANDS.oreRate);
      expect(bust.dropWeight, id).toBeGreaterThanOrEqual(BARE_HANDS.dropWeight);
      expect(bust.splash, id).toBeGreaterThanOrEqual(0);
    }
  });

  it('a deep broken tool keeps about a quarter of what it does', () => {
    const whole = effectOf(toolOf('firstiron'), false);
    const bust = effectOf(toolOf('firstiron'), true);
    expect(bust.cells).toBeLessThan(whole.cells);
    expect(bust.cells).toBeGreaterThan(BARE_HANDS.cells);
    expect((bust.oreRate - 1) / (whole.oreRate - 1)).toBeCloseTo(BROKEN_SHARE, 6);
  });

  it('wear stops at the floor — it cannot go into debt', () => {
    hold('marl');
    fillFace();
    const pool = poolOf(toolOf('marl'));
    for (let i = 0; i < 2000; i++) engine.dispatch({ type: 'chip', cell: i % 36 });
    expect(st().casting.wear).toBeLessThanOrEqual(pool + 1e-6);
  });

  it('repair costs the part\'s own material and gives back its share', () => {
    hold('marl');
    const tool = toolOf('marl');
    st().casting.wear = poolOf(tool);
    addMaterial(st(), 'marl', 60, 10);
    const before = materialCount(st(), 'marl');

    const r = engine.dispatch({ type: 'repairTool', partType: 'core' });
    expect(r.ok).toBe(true);
    expect(materialCount(st(), 'marl')).toBe(before - REPAIR_UNITS);
    // The Core is most of the pool, so it gives back most of the wear.
    expect(st().casting.wear).toBeLessThan(poolOf(tool) * 0.6);
    expect(st().casting.repairs).toBe(1);
  });

  it('a small part is a small repair — the Core is the tank', () => {
    const tool = toolOf('marl');
    expect(repairShare(tool, 'core')).toBeGreaterThan(repairShare(tool, 'grip'));
    let total = 0;
    for (const t of PART_TYPES) total += repairShare(tool, t);
    expect(total).toBeCloseTo(1, 6);
  });

  it('repair is refused without the material, and says which', () => {
    hold('marl');
    st().casting.wear = poolOf(toolOf('marl'));
    const r = engine.dispatch({ type: 'repairTool', partType: 'core' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Marl/);
  });

  /**
   * THE LOOPHOLE, CLOSED. Rebuilding consumes nothing — step 2 hands the old
   * parts straight back — so if Combine cleared the wear it would be a free,
   * infinite repair. Wear carries by DURABILITY SHARE, so re-seating the same
   * seven forgives exactly nothing.
   */
  it('rebuilding with the SAME parts is not a free repair', () => {
    hold('marl');
    const s = st();
    // Put the tool's parts on the bench and combine them again.
    s.casting.rack = [...s.casting.tool];
    for (const p of s.casting.tool) s.casting.bench[p.type] = p.id;
    s.casting.wear = poolOf(toolOf('marl')) * 0.8;
    const before = s.casting.wear;
    expect(engine.dispatch({ type: 'buildTool' }).ok).toBe(true);
    expect(st().casting.wear).toBeCloseTo(before, 6);
  });

  it('but re-casting the worn part in fresh stock DOES clear its share', () => {
    hold('marl');
    const s = st();
    const pool = poolOf(toolOf('marl'));
    s.casting.wear = pool * 0.9;
    // A brand-new Core goes on the bench; the other six are the ones it has.
    const fresh = { ...makePart('core', 'marl', 60), id: 99 };
    s.casting.rack = [...s.casting.tool.filter((p) => p.type !== 'core'), fresh];
    for (const p of s.casting.rack) s.casting.bench[p.type as PartType] = p.id;
    expect(engine.dispatch({ type: 'buildTool' }).ok).toBe(true);
    // The Core is most of the pool, so most of the wear went with the old one.
    expect(st().casting.wear).toBeLessThan(pool * 0.6);
  });

  it('taking the tool apart leaves nothing to be broken about', () => {
    hold('marl');
    st().casting.wear = poolOf(toolOf('marl'));
    engine.dispatch({ type: 'breakDownTool' });
    expect(toolEffect(st())).toEqual(BARE_HANDS);
    expect(st().casting.rack).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// REACH — the standing rule
// ---------------------------------------------------------------------------

describe('the standing reach rule', () => {
  it('a tool from every shell mines, wears and repairs', () => {
    for (const id of ['marl', 'ironbloom', 'sporewood', 'frostsand', 'slagrock', 'nothingstone', 'firstiron']) {
      engine = createEngine({ nowMs: 0 });
      hold(id);
      fillFace();
      const tool = toolOf(id);
      expect(effectOf(tool, false).cells, id).toBeGreaterThan(BARE_HANDS.cells);
      expect(usesOf(tool), id).toBeGreaterThan(0);
      expect(toughnessIndex(tool), id).toBeGreaterThan(0);
      engine.dispatch({ type: 'chip', cell: 14 });
      expect(st().casting.wear, id).toBeGreaterThan(0);
      addMaterial(st(), id, 60, 10);
      expect(engine.dispatch({ type: 'repairTool', partType: 'core' }).ok, id).toBe(true);
      expect(st().casting.wear, id).toBe(0);
    }
  });

  it('a bad part type from the action boundary is refused', () => {
    hold('marl');
    expect(engine.dispatch({ type: 'repairTool', partType: 'nonsense' }).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MAINTENANCE IS OCCASIONAL, NOT CONSTANT
// ---------------------------------------------------------------------------

describe('a tool goes a long stretch before it wants seeing to', () => {
  /**
   * THE BASE WAS TEN TIMES TOO LOW. At 300, a brittle tool was through in about
   * 200 swings — minutes of play, so maintenance was the thing you were doing
   * INSTEAD of mining. The floor here is what "occasional" has to mean.
   */
  it('even the most brittle build has well over a thousand swings in it', () => {
    let worst = Infinity;
    let worstAt = '';
    for (const id of ['umberjade', 'rootglass', 'bonechalk', 'frostsand', 'dimglass', 'voidglass']) {
      const n = usesOf(toolOf(id));
      if (n < worst) { worst = n; worstAt = id; }
    }
    expect(worst, `the shortest-lived build is ${worstAt} at ${worst} swings`).toBeGreaterThan(1200);
  });

  it('and a tough one goes several thousand', () => {
    expect(usesOf(toolOf('graveclay'))).toBeGreaterThan(4000);
  });

  /** ONLY THE MAGNITUDE MOVED. The tradeoff is the same tradeoff. */
  it('the brittle-against-tough ratio is untouched by the change', () => {
    const ratio = usesOf(toolOf('graveclay')) / usesOf(toolOf('umberjade'));
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(3.5);
  });
});

// ---------------------------------------------------------------------------
// A CAST TOOL ANSWERS THE HARDNESS WALLS
// ---------------------------------------------------------------------------

describe('the Casting Floor answers the walls the old Forge used to', () => {
  /**
   * THE ONE THAT WOULD HAVE BRICKED A NEW SAVE. Tool crafting moved rooms;
   * `descend` gates on a tool TIER. Without this a fresh player hits Loam's
   * wall at depth 45 with no way to make a tier-II tool at all.
   */
  it('a cast tool has a tier, and a better one has a better tier', () => {
    hold(null);
    expect(castingToolTier(st())).toBe(0);
    hold('marl');
    const loam = castingToolTier(st());
    expect(loam).toBeGreaterThan(0);
    // Reaching deeper raises the cap, so the ladder can actually climb.
    st().shell.current = 'ferrite';
    hold('ironbloom');
    expect(castingToolTier(st())).toBeGreaterThan(loam);
  });

  it('it is capped at the same ceiling the old bench enforced', () => {
    st().shell.current = 'loam';
    hold('firstiron'); // an absurd tool for the shell you are standing in
    expect(castingToolTier(st())).toBe(maxToolTier(st()));
  });

  /** MAX, NOT REPLACEMENT — a long save's paid-for tools must not stop working. */
  it('the wall reads the BETTER of the two benches', () => {
    hold(null);
    const s = st();
    s.forge.tools[0]!.tier = 4;
    s.forge.equipped = s.forge.tools[0]!.id;
    s.shell.current = 'ferrite';
    expect(effectiveToolTier(s)).toBe(4);
    hold('ironbloom');
    expect(effectiveToolTier(st())).toBeGreaterThanOrEqual(4);
  });

  it('and a player who cast a tool can actually descend past a wall', () => {
    engine = createEngine({ nowMs: 0 });
    const s = st();
    s.forge.built = true;
    s.currencies['dust'] = s.currencies['dust']!.add(1e12);
    s.depth = requiredWallDepth(s) - 1;
    // Bare-handed, the wall refuses.
    hold(null);
    const blocked = engine.dispatch({ type: 'descend' });
    expect(blocked.ok, 'the wall should refuse a starter tool').toBe(false);
    expect(blocked.reason).toMatch(/too hard/);
    // With a cast tool of the right grade, it does not.
    hold('starmarl', 95);
    expect(engine.dispatch({ type: 'descend' }).ok).toBe(true);
  });
});

/** The first depth in this shell whose wall the starter tool cannot pass. */
function requiredWallDepth(s: GameState): number {
  const start = equippedTierOf(s);
  for (let d = 1; d < 400; d++) if (requiredTier(s, d) > start) return d;
  throw new Error('no wall in this shell');
}
function equippedTierOf(s: GameState): number {
  return s.forge.tools.find((t) => t.id === s.forge.equipped)?.tier ?? 1;
}

// ---------------------------------------------------------------------------
// A TOOL IMPROVES WITH USE
// ---------------------------------------------------------------------------

describe('a tool you have mined with is better than the same tool fresh', () => {
  it('starts at level 1 with nothing earned, and a bare-handed player earns nothing', () => {
    hold(null);
    expect(toolLevel(st())).toBe(1);
    fillFace();
    for (let i = 0; i < 20; i++) engine.dispatch({ type: 'chip', cell: i % 36 });
    expect(st().casting.xp).toBe(0);
  });

  /** XP IS CELLS THAT GAVE SOMETHING UP — not swings, and not empty rock. */
  it('records the cells a swing actually worked, reach included', () => {
    hold('firstiron');
    fillFace();
    const cells = effectOf(toolOf('firstiron'), false, 1).cells;
    engine.dispatch({ type: 'chip', cell: 14 }); // interior: every reached cell exists
    expect(st().casting.xp).toBe(cells);
  });

  it('a swing at empty rock teaches it nothing', () => {
    hold('firstiron');
    st().face.cells = st().face.cells.map(() => 0);
    for (let i = 0; i < 30; i++) engine.dispatch({ type: 'chip', cell: i % 36 });
    expect(st().casting.xp).toBe(0);
  });

  it('a sweep counts the cells it swept', () => {
    hold('marl');
    fillFace();
    st().face.stamina = 100;
    engine.dispatch({ type: 'sweep', cells: [0, 1, 2, 3, 4] });
    expect(st().casting.xp).toBe(5);
  });

  it('levels arrive on a rising curve, and the readout matches it', () => {
    hold('marl');
    expect(levelOf(0)).toBe(1);
    expect(levelOf(xpForLevel(2))).toBe(2);
    expect(levelOf(xpForLevel(2) - 1)).toBe(1);
    // Rising: each level costs more than the one before it.
    for (let n = 2; n < 12; n++) {
      const a = xpForLevel(n + 1) - xpForLevel(n);
      const b = xpForLevel(n) - xpForLevel(n - 1);
      expect(a, `level ${n + 1} should cost more than ${n}`).toBeGreaterThan(b);
    }
    st().casting.xp = xpForLevel(4) + 10;
    const p = levelProgress(st());
    expect(p.level).toBe(4);
    expect(p.into).toBe(10);
    expect(p.frac).toBeGreaterThan(0);
    expect(p.frac).toBeLessThan(1);
  });

  /**
   * THE PILLAR-2 CONSTRAINT, and the only one that matters here. A level buys
   * durability, pocket speed, reach and slots. It must NEVER touch what a cell
   * pays per point of charge, or `dpsMax` moves and the ceiling stops being one.
   */
  it('levels buy reach, swings, pocket speed and slots — never yield', () => {
    const tool = toolOf('marl');
    const lo = effectOf(tool, false, 1);
    const hi = effectOf(tool, false, 30);
    expect(hi.cells).toBeGreaterThan(lo.cells);
    expect(hi.oreRate).toBeGreaterThan(lo.oreRate);
    expect(usesOf(tool, 30)).toBeGreaterThan(usesOf(tool, 1));
    expect(grantsFor(30).slots).toBeGreaterThan(0);
    // SPLASH is how much of each extra cell is taken, and it is NOT levelled —
    // that is the closest thing here to a yield term.
    expect(hi.splash).toBe(lo.splash);
    // Nor is the drop lean, which is already capped.
    expect(hi.dropWeight).toBe(lo.dropWeight);
  });

  it('and reach stays inside the 3x3 however high the level goes', () => {
    for (const id of ['marl', 'firstiron']) {
      expect(effectOf(toolOf(id), false, 999).cells).toBeLessThanOrEqual(1 + MAX_EXTRA_CELLS);
    }
  });

  it('a levelled tool really does mine more of the face per swing', () => {
    const swing = (level: number): number => {
      engine = createEngine({ nowMs: 0 });
      hold('marl');
      st().casting.xp = xpForLevel(level);
      fillFace();
      const before = [...st().face.cells];
      engine.dispatch({ type: 'chip', cell: 14 });
      return st().face.cells.filter((c, i) => Math.abs(c - before[i]!) > 1e-9).length;
    };
    expect(swing(20)).toBeGreaterThan(swing(1));
  });

  it('extra modifier slots arrive on a schedule, on top of what the parts give', () => {
    hold('marl');
    const tool = toolOf('marl');
    expect(modSlotsOf(st(), tool).fromUse).toBe(0);
    st().casting.xp = xpForLevel(1 + SLOT_EVERY);
    expect(modSlotsOf(st(), tool).fromUse).toBe(1);
    expect(modSlotsOf(st(), tool).total).toBe(modSlotsOf(st(), tool).fromParts + 1);
  });

  /**
   * THE PROMISE. Levels are the record of YOUR hours. Re-seating a worn part or
   * upgrading to better stock is maintaining the same tool, and it must not
   * cost you that record — "you never throw it away" would be a lie otherwise.
   */
  it('rebuilding the tool keeps every level', () => {
    hold('marl');
    st().casting.xp = xpForLevel(7);
    const s = st();
    s.casting.rack = [...s.casting.tool];
    for (const p of s.casting.tool) s.casting.bench[p.type] = p.id;
    expect(engine.dispatch({ type: 'buildTool' }).ok).toBe(true);
    expect(toolLevel(st())).toBe(7);
    expect(engine.dispatch({ type: 'repairTool', partType: 'core' }).ok).toBe(false); // no material — fine
    expect(toolLevel(st())).toBe(7);
  });

  it('and taking it apart does not burn the record either', () => {
    hold('marl');
    st().casting.xp = xpForLevel(5);
    engine.dispatch({ type: 'breakDownTool' });
    expect(st().casting.xp).toBe(xpForLevel(5));
  });
});
