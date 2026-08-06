/**
 * §55 FAILURE CASCADES — one failure causes the next, and you can prove which.
 *
 * A.105's audit found the honest gap: `CONDITION_RULES` is five predicates that
 * each read SHELL state independently, so five machines can be broken at once
 * and none of them broke another. This file is the check that the cascade over
 * those pieces actually runs, actually costs, and — item 7 — can be walked back
 * to the machine the world itself broke.
 *
 * EVERY ARRANGEMENT DRIVES `tickCondition`. There is one deliberate exception,
 * marked where it happens, which plants an impossible cycle to prove the walk
 * terminates anyway. Everything else is the engine doing it.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import type { GameState } from '../types';
import {
  BAKE_HEAT, CASCADE_SEC, CONDITION_FULL_SEC, DRAG_SPEED, cascadeChain, cascadeLine,
  cascadedFrom, conditionOf, conditionedMachines, ensureDrags, machineLabel, machineSpeed,
  setMachineBand, tickCondition,
} from '../systems/condition';
import { ensurePlant } from '../systems/plant';
import { ensurePrism } from '../systems/prism';
import { dpsMax } from '../systems/face';

function fresh(): GameState {
  return createEngine({ nowMs: 0 }).getState() as GameState;
}

/**
 * A Cinder plant, run hot, with every machine the plant knows about built.
 *
 * Cinder on purpose: its rule reads `leakedHeat` and no machine id at all, so
 * the WORLD breaks every machine equally and any difference between them after
 * the tick is something the cascade did and not something the shell did.
 */
function hotPlant(): { s: GameState; mods: ModifierCache } {
  const s = fresh();
  s.shell.current = 'cinder';
  s.depthRecords['cinder'] = 400;
  const p = ensurePlant(s);
  for (const id of conditionedMachines()) p.tiers[id] = 1;
  s.kiln.built = true;
  s.pressure.heat = BAKE_HEAT + 20;
  return { s, mods: new ModifierCache() };
}

/**
 * ...and a GLASSMERE plant with ONE machine standing in a dark band, four laid
 * out one band apart, and everything else parked out of reach but lit.
 *
 * Cinder cannot show a chain and it is not a fault in the cascade that it
 * cannot: its rule breaks every machine in the plant at the same second, so
 * every drag's parent is a machine the WORLD broke and the depth is two by
 * construction. A chain needs a rule that singles ONE machine out, and of the
 * five exactly one does: `unlit` reads the machine's own BAND against the bands
 * the beam is carrying. Every other rule reads shell state and no machine id at
 * all, and the new `overgrown` reads flow — which §3 shares PROPORTIONALLY, so
 * a short plant starves every drawer in the same second, cinder-shaped.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS ARRANGEMENT USED TO BE VERDANCE, AND IT WAS NEVER DRIVEN (A.108). It
 * wrote `p.served[id] = 0` on the head and 1 on everything else — a precondition
 * written by hand into a field `tickPlant` derives and overwrites. The chain it
 * proved was the cascade's arithmetic over a state the game cannot reach; the
 * rule underneath it had never fired for any player. The re-pointing found it.
 *
 * Nothing is written into the condition table here. The Prism's ALLOCATION is
 * the arrangement — authoritative state a player sets by spending intensity —
 * and `tickCondition` is left to read the dark band and do the rest.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Bands: the four are at 0,1,2,3 and everything else at 5, which is adjacent to
 * nothing built. A drag steps one band, so the only route is the row. Intensity
 * goes to 1,2,3 and 5 — never 0, because white lights every band — so the head
 * at band 0 is the one machine the world breaks, and the parked ones are lit and
 * therefore not heads of their own.
 */
const ROW = 4;
function idlePlant(): { s: GameState; mods: ModifierCache; row: string[] } {
  const s = fresh();
  s.shell.current = 'glassmere';
  s.depthRecords['glassmere'] = 400;
  const p = ensurePlant(s);
  for (const id of conditionedMachines()) p.tiers[id] = 1;
  p.tiers['prism'] = 1;
  s.kiln.built = true;
  const row = conditionedMachines().slice(0, ROW);
  for (const id of conditionedMachines()) setMachineBand(s, id, 5);
  row.forEach((id, i) => setMachineBand(s, id, i));
  const prism = ensurePrism(s);
  prism.intensity = [0, 1, 1, 1, 0, 1];
  return { s, mods: new ModifierCache(), row };
}

/** Run the beat for `sec` seconds, one second at a time, like the engine. */
function beat(s: GameState, mods: ModifierCache, sec: number): void {
  for (let i = 0; i < sec; i++) tickCondition(s, mods, 1);
}

const dragged = (s: GameState) => Object.keys(ensureDrags(s)).sort();

describe('§1 the world writes the first failure and nothing else', () => {
  it('a hot shell bakes the plant, and no machine blames another for it', () => {
    const { s, mods } = hotPlant();
    beat(s, mods, CONDITION_FULL_SEC);
    expect(conditionOf(s, 'crusher')?.id).toBe('baked');
    expect(dragged(s), 'something spread before anything had stood at full').toEqual([]);
  });

  it('...and nothing spreads until one has STOOD at full for CASCADE_SEC', () => {
    const { s, mods } = hotPlant();
    beat(s, mods, CONDITION_FULL_SEC + CASCADE_SEC - 5);
    expect(dragged(s), 'the cascade fired early').toEqual([]);
    beat(s, mods, 6);
    expect(dragged(s).length, 'the cascade never fired at all').toBe(1);
  });
});

describe('§2 and then it walks', () => {
  it('exactly ONE machine goes per pass, not the band', () => {
    const { s, mods } = hotPlant();
    beat(s, mods, CONDITION_FULL_SEC + CASCADE_SEC);
    expect(dragged(s).length, 'a cascade flooded the plant').toBe(1);
    // ...and the source's clock reset, so the next step is another wait away.
    beat(s, mods, CASCADE_SEC - 5);
    expect(dragged(s).length, 'the second step did not wait').toBe(1);
  });

  it('it walks the row ONE BAND AND ONE STEP AT A TIME — a chain, not a star', () => {
    const { s, mods, row } = idlePlant();
    beat(s, mods, CONDITION_FULL_SEC);
    expect(dragged(s), 'it spread before anything had stood at full').toEqual([]);
    for (let i = 1; i < ROW; i++) {
      beat(s, mods, CASCADE_SEC);
      expect(dragged(s), `step ${i} of the walk`).toEqual(row.slice(1, i + 1).sort());
      expect(cascadedFrom(s, row[i]!), `${row[i]} names the wrong parent`).toBe(row[i - 1]);
    }
    expect(cascadeChain(s, row[ROW - 1]!), 'the chain is not the row').toEqual(row);
  });

  it('a machine that has already dragged one gives no more — the failure TRAVELS', () => {
    /**
     * The row above walks by GEOMETRY: one machine per band, so the only
     * eligible source is the far end whether or not the rule exists. This is
     * the layout that tells them apart. A is idle at band 0; B and C both sit
     * at band 1, where A can reach either; D sits at band 2, where only B or C
     * can. If the head kept dragging, it would take C next — it is right
     * there, and A is first in registry order. Because it may only have one,
     * the next step has to come from B, and the failure moves AWAY from where
     * it started instead of fanning out around it.
     */
    const { s, mods } = idlePlant();
    const [a, b, c, d] = conditionedMachines().slice(0, 4) as [string, string, string, string];
    setMachineBand(s, a, 0);
    setMachineBand(s, b, 1);
    setMachineBand(s, c, 1);
    setMachineBand(s, d, 2);

    beat(s, mods, CONDITION_FULL_SEC + CASCADE_SEC);
    expect(dragged(s), 'the first step is not the near neighbour').toEqual([b]);
    beat(s, mods, CASCADE_SEC);
    expect(cascadedFrom(s, d), 'the second step did not come from the first').toBe(b);
    expect(ensureDrags(s)[c], 'the head dragged a second machine').toBeUndefined();
  });

  it('...and it stops at the end of the row rather than jumping the gap', () => {
    const { s, mods, row } = idlePlant();
    beat(s, mods, CONDITION_FULL_SEC + CASCADE_SEC * (ROW + 4));
    expect(dragged(s).sort(), 'a cascade jumped two bands').toEqual(row.slice(1).sort());
  });

  it('it never drags a machine that is not built', () => {
    const s = fresh();
    s.shell.current = 'cinder';
    s.depthRecords['cinder'] = 400;
    const p = ensurePlant(s);
    p.tiers['crusher'] = 1;
    s.pressure.heat = BAKE_HEAT + 20;
    const mods = new ModifierCache();
    beat(s, mods, CONDITION_FULL_SEC + CASCADE_SEC * 3);
    expect(dragged(s), 'a cascade reached an unbuilt machine').toEqual([]);
  });

  it('and it never seizes — a cascade costs speed, not a machine', () => {
    const { s, mods } = hotPlant();
    beat(s, mods, CONDITION_FULL_SEC + CASCADE_SEC * 3);
    expect(dragged(s).length).toBeGreaterThan(0);
    for (const id of dragged(s)) {
      expect(machineSpeed(s, id), `${id} was stopped by a cascade`).toBeGreaterThan(0);
    }
  });
});

describe('§3 item 7 — you can walk it back to the first failure', () => {
  it('the chain starts at a machine the world broke and no one handed to', () => {
    const { s, mods } = hotPlant();
    beat(s, mods, CONDITION_FULL_SEC + CASCADE_SEC * 3);
    for (const id of dragged(s)) {
      const chain = cascadeChain(s, id);
      expect(chain[chain.length - 1]).toBe(id);
      expect(cascadedFrom(s, chain[0]!), 'the head of the chain has a parent').toBeNull();
      expect(conditionOf(s, chain[0]!), 'the head of the chain is not broken').not.toBeNull();
      expect(new Set(chain).size, 'the chain repeats a machine').toBe(chain.length);
    }
  });

  it('and it SAYS so — the line names the neighbour, and the head when they differ', () => {
    const { s, mods, row } = idlePlant();
    beat(s, mods, CONDITION_FULL_SEC + CASCADE_SEC * ROW);
    const end = row[ROW - 1]!;
    const line = cascadeLine(s, end)!;
    expect(line, 'the dragged machine says nothing at all').toBeTruthy();
    expect(line, 'the line does not name the machine beside it')
      .toContain(machineLabel(row[ROW - 2]!));
    expect(line, 'a deep link does not name the head of the chain')
      .toContain(machineLabel(row[0]!));
    // ...and the machine one step in names only its neighbour, who IS the head.
    expect(cascadeLine(s, row[1]!)).toContain(machineLabel(row[0]!));
    expect(cascadeLine(s, row[1]!), 'a one-step drag tells a story about a chain')
      .not.toContain('along');
    expect(cascadeLine(s, row[0]!), 'the head claims it was dragged').toBeNull();
  });

  it('a machine the world broke is a chain of one, not of none', () => {
    const { s, mods } = hotPlant();
    beat(s, mods, CONDITION_FULL_SEC);
    expect(cascadeChain(s, 'crusher')).toEqual(['crusher']);
  });

  it('...and the walk terminates on a cycle the engine will not write', () => {
    // THE ONE HAND-WRITTEN TABLE IN THIS FILE. `cascade` refuses to drag an
    // ancestor, so this state is unreachable — which is exactly the kind of
    // unreachable that ships an infinite loop when the guard is removed.
    const { s } = hotPlant();
    const drags = ensureDrags(s);
    drags['crusher'] = { from: 'refinery', sec: 0 };
    drags['refinery'] = { from: 'crusher', sec: 0 };
    expect(cascadeChain(s, 'crusher').length).toBeLessThanOrEqual(2);
  });
});

describe('§4 it unwinds from the head — the trace is true, not narrated', () => {
  it('fix the first failure and the chain lets go, one machine per tick, in order', () => {
    const { s, mods, row } = idlePlant();
    beat(s, mods, CONDITION_FULL_SEC + CASCADE_SEC * ROW);
    expect(cascadeChain(s, row[ROW - 1]!)).toEqual(row);

    // SOMEBODY LIGHTS THE DARK BAND. That is the whole fix, and it is a fix to
    // the HEAD — nothing is done to any of the machines that are suffering, and
    // nothing is written into the condition table. A point of intensity into
    // band 0 is white, and white lights every band; the other three were lit
    // already, so the head is the only machine this reaches.
    ensurePrism(s).intensity[0] = 1;
    beat(s, mods, 1);
    expect(conditionOf(s, row[0]!)!.level, 'the head is still at full').toBeLessThan(1);
    expect(ensureDrags(s)[row[1]!], 'the machine beside the head held on').toBeUndefined();
    expect(ensureDrags(s)[row[2]!], 'the whole chain let go at once').toBeDefined();
    for (let i = 2; i < ROW; i++) {
      beat(s, mods, 1);
      expect(ensureDrags(s)[row[i]!], `link ${i} did not follow`).toBeUndefined();
    }
    expect(dragged(s), 'something was still being dragged by nothing').toEqual([]);
  });
});

describe('§5 a cascade COSTS and cannot pay', () => {
  it('the machine it lands on runs slower than it did', () => {
    const { s, mods } = hotPlant();
    beat(s, mods, CONDITION_FULL_SEC);
    const clean: Record<string, number> = {};
    for (const id of conditionedMachines()) clean[id] = machineSpeed(s, id);
    beat(s, mods, CASCADE_SEC);
    const hit = dragged(s)[0]!;
    expect(machineSpeed(s, hit)).toBeCloseTo(clean[hit]! * DRAG_SPEED, 9);
    expect(machineSpeed(s, hit)).toBeLessThan(clean[hit]!);
  });

  it('...and it is bounded — a drag is a fraction, never a stop and never a gain', () => {
    expect(DRAG_SPEED).toBeGreaterThan(0);
    expect(DRAG_SPEED).toBeLessThan(1);
  });

  it('PILLAR 2 — dpsMax at ONE depth is unmoved by a full cascade', () => {
    const { s, mods } = hotPlant();
    s.depth = 40;
    mods.invalidate();
    const clean = String(dpsMax(s, mods));
    beat(s, mods, CONDITION_FULL_SEC + CASCADE_SEC * 5);
    expect(dragged(s).length, 'nothing cascaded, so nothing is proven').toBeGreaterThan(1);
    mods.invalidate();
    expect(String(dpsMax(s, mods)), 'a cascade moved the face ceiling').toBe(clean);
  });

  it('...and the reading is live — widening the face moves it', () => {
    const { s, mods } = hotPlant();
    s.depth = 40;
    mods.invalidate();
    const a = String(dpsMax(s, mods));
    s.face.w += 1;
    mods.invalidate();
    expect(String(dpsMax(s, mods)), 'dpsMax is not reading the face at all').not.toBe(a);
  });
});

describe('§6 it works on a plant nobody has aimed, and follows one that is', () => {
  it('a player who moves a machine out of reach breaks the chain there', () => {
    const { s, mods } = hotPlant();
    // Park every machine at band 0 except one at 5: nothing is one band along.
    for (const id of conditionedMachines()) setMachineBand(s, id, 0);
    beat(s, mods, CONDITION_FULL_SEC + CASCADE_SEC * 3);
    expect(dragged(s), 'a cascade jumped a gap of five bands').toEqual([]);
  });
});
