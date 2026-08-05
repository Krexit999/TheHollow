/**
 * THE RECONSTRUCTION FRAME — REBUILDING (§13), and the half that shipped years
 * ago inside a locked signature.
 *
 * §0 is the measurement: "buy back a face cell by cell" has been built since
 * Phase 10. §4 is the load-bearing block — `absence.ts` keeps every rule it had,
 * and the Frame can only decide what a cell comes back AS.
 *
 * ITEM 7 is here too: the CONDENSER was built at A.92, and this asserts the
 * whole chain it feeds still runs rather than taking the ledger's word for it.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import { ensureContentLoaded } from '../content';
import { ModifierCache } from '../modifiers';
import { D } from '../decimal';
import { markReached } from '../systems/roll';
import { MAX_MACHINE_TIER, ensurePlant, tierOf } from '../systems/plant';
import {
  CONDITION_FULL_SEC, UNDECIDED_SILENCE, biting, ensureCondition, tickCondition,
} from '../systems/condition';
import { addMaterial } from '../systems/forge';
import {
  GRAINS, TIER_CAPABILITY_FRAME, buildFrame, frameBuilt, frameFound, frameStation,
  grainBlocker, grainSlots, grainsSet, holdsPattern, setGrain, setHold,
} from '../systems/frame';
import {
  REBUILD_BASE, REBUILD_RATIO, rebuildCell, rebuildCost, rebuildDepthFor,
} from '../systems/absence';
import {
  CONDENSE_SHARE, RESIDUE_PER_SEC, WITNESS_HUSH, condense, condenserBuilt, condenserStation,
  tickResidue, witness, couldBe, registerMaybe, ensureWitness,
} from '../systems/witness';
import { dpsMax } from '../systems/face';
import { PART_TYPES } from '../content/forgeParts';
import { makePart } from '../systems/forgeParts';
import { allShells } from '../shells';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx = (): EngineCtx => ({ dirty: () => {}, emit: () => {} }) as unknown as EngineCtx;

function inHollowAt(tier = 0): GameState {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  s.shell.current = 'hollow';
  for (const sh of allShells()) s.depthRecords[sh.id] = 999;
  s.depth = 400;
  markReached(s, 400, 15);
  if (tier > 0) ensurePlant(s).tiers['frame'] = tier;
  ensureCondition(s);
  s.currencies['void'] = D('1e12');
  s.casting.rack = PART_TYPES.map((t, i) => ({ ...makePart(t, 'marl', 40), id: 800 + i })) as never;
  return s;
}

describe('§0 — half of §13 shipped in Phase 10, inside the locked signature', () => {
  it('REBUILDING is built: a cost curve, depth-gated sites, and a real cell', () => {
    const s = inHollowAt(0);
    expect(frameBuilt(s)).toBe(false);
    expect(rebuildCost(s).toNumber()).toBe(REBUILD_BASE);
    expect(rebuildCell(s, ctx(), 0).ok, 'the signature needs no machine').toBe(true);
    expect(s.hollow.rebuilt).toEqual([0]);
    expect(rebuildCost(s).toNumber()).toBeCloseTo(REBUILD_BASE * REBUILD_RATIO, 6);
    expect(rebuildDepthFor(3, 560)).toBe(42);
  });

  it('...and what was NOT built is the other clause: choosing the physics', () => {
    const s = inHollowAt(0);
    rebuildCell(s, ctx(), 0);
    // Bare rock, identical to every other bare cell.
    expect(s.face.cells[0]).toBe(0);
    expect(s.growth.stage[0] ?? 0).toBe(0);
    expect(s.face.ore?.[0]).toBeFalsy();
  });
});

describe('§1 — the machine', () => {
  it('The Unbuilt is the station the Hollow was authored with', () => {
    const at = frameStation()!;
    expect([at.shellId, at.depth, at.name]).toEqual(['hollow', 178, 'The Unbuilt']);
  });

  it('found by walking in, built from cast parts, never bought', () => {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    s.shell.current = 'hollow';
    expect(frameFound(s)).toBe(false);
    expect(buildFrame(s, ctx()).ok).toBe(false);
    markReached(s, frameStation()!.depth, 15);
    expect(frameFound(s)).toBe(true);
    expect(buildFrame(s, ctx()).ok, 'built with an empty rack').toBe(false);
    s.casting.rack = PART_TYPES.map((t, i) => ({ ...makePart(t, 'marl', 40), id: i + 1 })) as never;
    expect(buildFrame(s, ctx()).ok).toBe(true);
    expect(tierOf(s, 'frame')).toBe(1);
    expect(s.plant!.builtOf!['frame']).toBeDefined();
  });
});

describe('§2 — the physics of a cell', () => {
  let s: GameState;
  beforeEach(() => { s = inHollowAt(1); });

  it('SEEDED: the cell comes back vined, and growth takes it from there', () => {
    expect(setGrain(s, ctx(), 'seeded').ok).toBe(true);
    expect(rebuildCell(s, ctx(), 0).ok).toBe(true);
    expect(s.growth.stage[0]).toBe(1);
    expect(s.face.cells[0], 'the cell still begins empty').toBe(0);
  });

  it('POLED: the cell comes back with a sign a chain can start on', () => {
    setGrain(s, ctx(), 'poled');
    rebuildCell(s, ctx(), 3);
    expect(s.polarity.signs[3]).toBe(1);
  });

  it('POCKETED: the cell comes back holding the universal seam', () => {
    setGrain(s, ctx(), 'pocketed');
    rebuildCell(s, ctx(), 5);
    expect(s.face.ore?.[5]).toBe('fatseam');
  });

  it('and with NO grain set, a cell comes back exactly as it always did', () => {
    expect(grainsSet(s)).toEqual([]);
    rebuildCell(s, ctx(), 7);
    expect(s.growth.stage[7] ?? 0).toBe(0);
    expect(s.face.ore?.[7]).toBeFalsy();
  });
});

describe('§3 — three tiers, three sentences', () => {
  it('I spends the grain on ONE cell; II holds the pattern', () => {
    const s = inHollowAt(1);
    setGrain(s, ctx(), 'seeded');
    expect(holdsPattern(s)).toBe(false);
    expect(setHold(s, ctx(), true).ok, 'a tier-I frame held a pattern').toBe(false);
    rebuildCell(s, ctx(), 0);
    expect(grainsSet(s), 'the grain was not spent').toEqual([]);

    const t2 = inHollowAt(2);
    expect(holdsPattern(t2)).toBe(true);
    setGrain(t2, ctx(), 'seeded');
    expect(setHold(t2, ctx(), true).ok).toBe(true);
    rebuildCell(t2, ctx(), 0);
    expect(grainsSet(t2), 'the pattern was spent anyway').toEqual(['seeded']);
    rebuildCell(t2, ctx(), 1);
    expect(t2.growth.stage[1]).toBe(1);
  });

  it('III lays TWO grains on one cell, and nothing under it can', () => {
    const s = inHollowAt(2);
    expect(grainSlots(s)).toBe(1);
    setGrain(s, ctx(), 'seeded');
    expect(grainBlocker(s, 'poled')).toMatch(/one grain at a time/);
    ensurePlant(s).tiers['frame'] = 3;
    expect(grainSlots(s)).toBe(2);
    expect(setGrain(s, ctx(), 'poled').ok).toBe(true);
    expect(grainBlocker(s, 'pocketed')).toMatch(/Two is all/);
    rebuildCell(s, ctx(), 2);
    expect(s.growth.stage[2]).toBe(1);
    expect(s.polarity.signs[2]).toBe(1);
  });

  it('taking a grain off is always free', () => {
    const s = inHollowAt(1);
    setGrain(s, ctx(), 'seeded');
    expect(grainsSet(s)).toEqual(['seeded']);
    expect(setGrain(s, ctx(), 'seeded').ok).toBe(true);
    expect(grainsSet(s)).toEqual([]);
  });

  it('the three read as three distinct sentences', () => {
    expect(TIER_CAPABILITY_FRAME).toHaveLength(MAX_MACHINE_TIER + 1);
    expect(new Set(TIER_CAPABILITY_FRAME.slice(1)).size).toBe(3);
    expect(GRAINS).toHaveLength(3);
  });
});

describe('§4 — THE LOCKED SIGNATURE DRIVES; THE FRAME DECIDES', () => {
  /**
   * The load-bearing block. The Frame gains `absence.ts` exactly one call, at
   * the end of a rebuild that already succeeded, so it cannot refuse one,
   * cannot change a price, and cannot rebuild anything itself.
   */
  it('a Frame cannot make a rebuild cheaper, or make one happen', () => {
    const bare = inHollowAt(0);
    const framed = inHollowAt(3);
    setGrain(framed, ctx(), 'seeded');
    expect(rebuildCost(framed).toString()).toBe(rebuildCost(bare).toString());
    // ...and it cannot open a site the depth gate has shut.
    const shut = inHollowAt(3);
    shut.depth = 0;
    shut.hollow.rebuilt = [0, 1, 2, 3, 4];
    setGrain(shut, ctx(), 'seeded');
    const r = rebuildCell(shut, ctx(), 6);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/only exists below depth/);
    expect(shut.growth.stage[6] ?? 0, 'it laid a grain on a refused cell').toBe(0);
  });

  it('and every constant in the signature is where it was', () => {
    expect(REBUILD_BASE).toBe(250);
    expect(REBUILD_RATIO).toBe(1.62);
    expect(rebuildDepthFor(10, 560)).toBe(140);
    expect(rebuildDepthFor(100, 560), 'the floor clamp').toBe(560);
  });

  it('PILLAR 2: a grain is a MEDIUM, and the ceiling does not move', () => {
    const s = inHollowAt(3);
    s.depth = 48;
    const mods = new ModifierCache();
    mods.invalidate();
    const before = dpsMax(s, mods).toNumber();
    s.depth = 400;
    setGrain(s, ctx(), 'seeded');
    setGrain(s, ctx(), 'poled');
    for (let i = 0; i < 6; i++) rebuildCell(s, ctx(), i);
    s.depth = 48;                                     // THE SAME DEPTH BOTH ARMS
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).toBe(before);
    // ...and the grains really landed, so the arm is not vacuous.
    expect(s.growth.stage.filter((x) => x > 0).length).toBeGreaterThan(0);
  });

  it('and NO grain injects charge — a rebuilt cell still begins empty', () => {
    const s = inHollowAt(3);
    setGrain(s, ctx(), 'seeded');
    setGrain(s, ctx(), 'pocketed');
    rebuildCell(s, ctx(), 0);
    expect(s.face.cells[0]).toBe(0);
  });
});

describe('§5 — ITEM 7: what the Condenser shipped, walked end to end', () => {
  it('the Condenser is built, at its own wreck, and the chain it feeds runs', () => {
    const s = inHollowAt(0);
    const at = condenserStation()!;
    expect([at.shellId, at.name]).toEqual(['hollow', 'Condenser Wreck']);
    ensurePlant(s).tiers['condenser'] = 1;
    ensurePlant(s).tiers['witness'] = 1;
    expect(condenserBuilt(s)).toBe(true);

    /**
     * §13's CHAIN, IN ORDER, driven rather than stipulated: the WORLD writes
     * residue (§7.2's Hollow rule, on a plant nobody has looked at) → the
     * CONDENSER makes Hush of it → a WITNESS spends the Hush to say what an
     * undecided thing was.
     */
    s.kiln.built = true;
    ensurePlant(s).tiers['crusher'] = 1;
    s.hollow.silence = UNDECIDED_SILENCE + 10;
    const mods = new ModifierCache(); mods.invalidate();
    for (let i = 0; i < CONDITION_FULL_SEC + 5; i++) tickCondition(s, mods, 1);
    expect(biting(s, 'kiln', 'undecided'), 'the world wrote nothing').toBe(true);

    ensureWitness(s);
    tickResidue(s, 200);
    const residue = s.witness!.residue;
    expect(residue, 'nothing wrote any residue').toBeGreaterThan(0);
    expect(RESIDUE_PER_SEC).toBeGreaterThan(0);

    const made = condense(s, ctx());
    expect(made.ok).toBe(true);
    expect(s.witness!.hush).toBeCloseTo(residue * CONDENSE_SHARE, 6);
    expect(s.witness!.residue).toBe(0);

    // ...and a Witness spends it. `couldBe` names what the maybe WAS (A.92).
    const maybe = registerMaybe('marl')!;
    addMaterial(s, maybe.id, 60, 2);
    s.witness!.hush = WITNESS_HUSH * 2;
    const options = couldBe(s, maybe.id);
    expect(options[0]).toBe('marl');
    const band = Object.keys(s.materials.stacks[maybe.id]!)[0] as never;
    const named = witness(s, ctx(), maybe.id, band, 'marl');
    expect(named.ok, named.ok ? '' : (named as { reason: string }).reason).toBe(true);
    expect(s.witness!.hush).toBeCloseTo(WITNESS_HUSH, 6);
  });
});
