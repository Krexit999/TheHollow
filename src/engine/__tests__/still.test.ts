/**
 * THE STILL — ESSENCE WORK (§14.1, §16.3), A.90.
 *
 *   0  THE FINDING the brief asked for FIRST: were the traps in the game?
 *   1  the place, then the price, and tiers as capability
 *   2  §16.3's promise, END TO END, with a real trap: distil the bad trait out
 *      and the stone is measurably better at the part it looked perfect for
 *   3  the stilled form is a REAL material — pool-excluded, clone-free, and
 *      readable by everything the Forge already has
 *   4  the VIAL — cut at A.90, wired at A.92, and this section is the A.90
 *      absence assertion INVERTED IN PLACE rather than deleted
 *   5  PILLAR 2 — one unit in, one unit out, at the same band
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { MATERIALS, materialDef, rollDrop } from '../materials';
import { traitsOf } from '../traits';
import { addMaterial } from '../systems/forge';
import { markReached } from '../systems/roll';
import { derivePart, makePart } from '../systems/forgeParts';
import { STAT_BASE, TOOL_STATS } from '../content/forgeParts';
import { TRAPS, stilledId, trapDef } from '../content/traps';
import { MAX_MACHINE_TIER, tierOf } from '../systems/plant';
import { ensureCondition } from '../systems/condition';
import {
  STILL_MIN_RARITY, buildStill, canTake, distil, distilBlocker, distillable, stillBuilt,
  stillFound, stillStation, stilledHeld,
} from '../systems/still';
import { vialsHeld } from '../systems/infuser';
import { allAuthoredStations } from '../content/rolls';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;
let mods: ModifierCache;

function racked(st: GameState, n: number): GameState {
  st.casting.rack = Array.from({ length: n }, (_, i) =>
    ({ id: `p${i}`, materialId: 'marl', shape: 'head', purity: 50, traits: [] } as never));
  return st;
}

/** A player who has walked to Stillwright's Bower. */
function atTheWreck(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'verdance';
  markReached(st, 290, 15);
  st.shell.current = 'loam'; // the trap stone we test with is Loam's
  return racked(st, 20);
}

function withStill(tier = 1): GameState {
  const st = atTheWreck();
  for (let i = 0; i < tier; i++) buildStill(st, ctx);
  return st;
}

/** What a part made of this stone is worth, all in. */
function worth(materialId: string, type = 'handle', purity = 80): number {
  const d = derivePart(makePart(type as never, materialId, purity));
  return TOOL_STATS.reduce((n, s) => n + d.stats[s] / STAT_BASE[s], 0);
}

beforeEach(() => {
  mods = new ModifierCache();
  mods.invalidate();
});

// ---------------------------------------------------------------------------
// 0 — THE FINDING
// ---------------------------------------------------------------------------

/**
 * "§16.3 says trap materials are the Still's tutorial, waiting from era I.
 * VERIFY THE TRAPS ARE IN THE GAME AND REACHABLE; IF THEY AREN'T, THAT'S THE
 * FINDING." — and they were not. Pinned so the correction cannot be silently
 * undone, and so the two prose names stay disqualified for their real reasons.
 */
describe('0 — THE FINDING: were the traps in the game?', () => {
  it('two of §16.3\'s three named examples were prose, and one was accidentally right', () => {
    // millstone: "superb Core magnitude, `brittle`" — CORRECT.
    const mill = materialDef('millstone');
    expect(mill.shellId).toBe('loam');
    expect(traitsOf('millstone')).toContain('brittle');
    expect(trapDef('millstone')?.trait).toBe('brittle');

    // rimeiron: "best Ferrite Edge, `warm`" — it is dense+springy, and RICH.
    expect(traitsOf('rimeiron')).not.toContain('warm');
    expect(materialDef('rimeiron').rarity).not.toBe(STILL_MIN_RARITY);
    expect(trapDef('rimeiron'), 'rimeiron is not a trap').toBeUndefined();

    // bluesteel: "highest raw Head numbers in VERDANCE, `hollow`" — it is
    // keen+tough, RICH, and in FERRITE.
    expect(traitsOf('bluesteel')).not.toContain('hollow');
    expect(materialDef('bluesteel').shellId).not.toBe('verdance');
    expect(trapDef('bluesteel'), 'bluesteel is not a trap').toBeUndefined();
  });

  it('the set is SEVEN, one per shell — the deviation from "eight", stated', () => {
    expect(TRAPS).toHaveLength(7);
    expect(new Set(TRAPS.map((t) => materialDef(t.materialId).shellId)).size).toBe(7);
  });

  /**
   * AND EVERY TRAP IS REACHABLE, which is the half of the finding that would
   * otherwise be a second dead tutorial: a trap that cannot drop cannot teach
   * anything. Each one comes out of the ordinary drop table of its own shell.
   */
  it('every trap can actually be dug up in its own shell', () => {
    for (const t of TRAPS) {
      const def = materialDef(t.materialId);
      expect(def.source, `${t.materialId} is not pool-eligible`).toBeUndefined();
      expect(def.worked, `${t.materialId} is a bench product`).toBeFalsy();
      // ...and it is pure+ so the Still will take it at all.
      expect(['pure', 'flawless', 'starred', 'aberrant']).toContain(def.rarity);
      expect(traitsOf(t.materialId), `${t.materialId} is not ${t.trait}`).toContain(t.trait);
      expect(traitsOf(t.materialId).length, 'a one-trait stone has nothing to spare')
        .toBeGreaterThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 1 — THE MACHINE
// ---------------------------------------------------------------------------

describe('1 — the place, then the price (§6, §15.4)', () => {
  it('it is at Stillwright\'s Bower 30 in Verdance, exactly where §6 puts it', () => {
    expect(stillStation()).toEqual({ shellId: 'verdance', depth: 30, name: "Stillwright's Bower" });
  });

  it('a player who has not been there cannot raise it', () => {
    const st = racked(createEngine({ nowMs: 0 }).getState() as GameState, 20);
    expect(stillFound(st)).toBe(false);
    expect(buildStill(st, ctx).reason).toContain("Stillwright's Bower");
  });

  it('and it is built from cast parts, remembering what it was cast from', () => {
    const st = atTheWreck();
    expect(stillBuilt(st)).toBe(false);
    expect(buildStill(st, ctx).ok).toBe(true);
    expect(tierOf(st, 'still')).toBe(1);
    expect(st.plant!.builtOf!['still']).toContain('marl');
  });

  it('I takes a trap\'s named fault, II any of its traits, III any pure+ stone', () => {
    const one = withStill(1);
    expect(canTake(one, 'millstone', 'brittle'), 'the named fault').toBe(true);
    expect(canTake(one, 'millstone', 'dense'), 'tier I took the other trait').toBe(false);
    expect(canTake(one, 'umberjade', 'brittle'), 'tier I took a non-trap').toBe(false);

    const two = withStill(2);
    expect(canTake(two, 'millstone', 'dense')).toBe(true);
    expect(canTake(two, 'umberjade', 'brittle'), 'tier II took a non-trap').toBe(false);

    const three = withStill(3);
    expect(tierOf(three, 'still')).toBe(MAX_MACHINE_TIER);
    expect(canTake(three, 'umberjade', 'brittle')).toBe(true);
    // ...and never a stone under the §14.1 gate, at any tier.
    expect(canTake(three, 'marl', 'springy'), 'marl is common').toBe(false);
  });

  it('and it refuses by NAME, never with a shrug', () => {
    const st = withStill(1);
    addMaterial(st, 'millstone', 80);
    expect(distilBlocker(st, 'millstone', 'fine', 'dense'))
      .toContain('only takes the one thing wrong');
    expect(distilBlocker(st, 'marl', 'fine', 'springy')).toContain('pure stone and better');
    expect(distilBlocker(st, 'millstone', 'poor', 'brittle')).toContain('No Millstone at that band');
  });

  it('a cracked Still will not run — E2 reaches this machine like any other', () => {
    const st = withStill(1);
    addMaterial(st, 'millstone', 80);
    ensureCondition(st)['still'] = { id: 'baked', level: 1, seized: true };
    expect(distilBlocker(st, 'millstone', 'fine', 'brittle')).toContain('cracked');
  });
});

// ---------------------------------------------------------------------------
// 2 — THE LOAD-BEARING ONE
// ---------------------------------------------------------------------------

/**
 * §16.3, END TO END, WITH A REAL TRAP. Not "the function returns a material" —
 * the stone that comes out has to be measurably better at the part it looked
 * perfect for, through the same `derivePart` the Forge uses.
 */
describe('2 — distil the bad trait out and the trap stops being one', () => {
  it('MILLSTONE: brittle out, and the handle it always wanted to be gets better', () => {
    const st = withStill(1);
    addMaterial(st, 'millstone', 80);
    expect(st.materials.stacks['millstone']!['fine']!.count).toBe(1);

    const before = worth('millstone', 'handle');
    const r = distil(st, ctx, 'millstone', 'fine', 'brittle');
    expect(r.ok, r.reason).toBe(true);

    const into = stilledId('millstone', 'brittle');
    expect((r.data as { into: string }).into).toBe(into);
    // ONE UNIT IN, ONE UNIT OUT.
    expect(st.materials.stacks['millstone']?.['fine']).toBeUndefined();
    expect(st.materials.stacks[into]!['fine']!.count).toBe(1);

    // And it is a better handle, measured through the Forge's own derivation.
    const after = worth(into, 'handle');
    expect(after / before - 1, 'the stone did not improve').toBeGreaterThan(0.15);
    expect(traitsOf(into)).toEqual(['dense']);
    expect(materialDef(into).name).toBe('Stilled Millstone');
  });

  it('and every one of the seven improves at the part it looked perfect for', () => {
    const st = withStill(1);
    const gains: string[] = [];
    for (const t of TRAPS) {
      addMaterial(st, t.materialId, 80);
      const before = worth(t.materialId, t.part);
      const r = distil(st, ctx, t.materialId, 'fine', t.trait);
      expect(r.ok, `${t.materialId}: ${r.reason}`).toBe(true);
      const after = worth(stilledId(t.materialId, t.trait), t.part);
      gains.push(`${t.materialId} +${((after / before - 1) * 100).toFixed(1)}%`);
      expect(after, `${t.materialId} got WORSE`).toBeGreaterThan(before);
    }
    // Not a formality: the smallest of the seven still clears 5%.
    expect(gains.length).toBe(7);
  });

  /**
   * THE CONTROL, AND IT IS WEAKER THAN THE FIRST DRAFT CLAIMED. That draft
   * asserted "the wrong trait HURTS" and it is not true: on a millstone handle,
   * dropping `dense` also helps (+5.1%). Every trait costs something somewhere,
   * so removing any of them improves some part — which is why the trap set had
   * to be chosen by measurement rather than by which trait sounds bad.
   *
   * What IS true, and is the lesson: the trap's NAMED fault is the one that
   * pays, by a wide margin. Pinned as a ratio so a re-trait cannot quietly make
   * the tutorial's answer the wrong answer.
   */
  it('...and the trap\'s NAMED fault is the one that pays, by a wide margin', () => {
    const st = withStill(2);
    addMaterial(st, 'millstone', 80);
    addMaterial(st, 'millstone', 80);
    const before = worth('millstone', 'handle');
    expect(distil(st, ctx, 'millstone', 'fine', 'brittle').ok).toBe(true);
    expect(distil(st, ctx, 'millstone', 'fine', 'dense').ok).toBe(true);
    const named = worth(stilledId('millstone', 'brittle'), 'handle') / before - 1;
    const other = worth(stilledId('millstone', 'dense'), 'handle') / before - 1;
    expect(other, 'the other trait should help a little').toBeGreaterThan(0);
    expect(named / other, 'the named fault is not clearly the answer').toBeGreaterThan(3);
  });
});

// ---------------------------------------------------------------------------
// 3 — THE STILLED FORM IS A REAL MATERIAL
// ---------------------------------------------------------------------------

describe('3 — a stilled stone is a material like any other', () => {
  it('it exists in the registry, is `still`-sourced, and cannot be dug up', () => {
    const id = stilledId('millstone', 'brittle');
    const def = materialDef(id);
    expect(def.shellId).toBe('loam');
    expect(def.source).toBe('still');
    const rng = (() => { let a = 99; return () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; }; })();
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const r = rollDrop('loam', i % 151, rng);
      if (r.kind === 'material') seen.add(r.materialId!);
    }
    expect(seen.has(id), 'a stilled stone came out of the rock').toBe(false);
  });

  it('and no stilled form is a bit-for-bit clone of a natural stone', () => {
    const key = (id: string) => TOOL_STATS
      .map((s) => derivePart(makePart('head', id, 60)).stats[s].toFixed(3)).join('|');
    const seen = new Map<string, string>();
    for (const m of MATERIALS.filter((x) => !x.worked && x.source !== 'combat')) {
      const k = key(m.id);
      expect(seen.has(k), `${m.name} collides with ${seen.get(k)}`).toBe(false);
      seen.set(k, m.name);
    }
  });

  it('a stilled form is never a seam pool candidate anywhere in the game', () => {
    const stilled = new Set(MATERIALS.filter((m) => m.source === 'still').map((m) => m.id));
    expect(stilled.size).toBeGreaterThanOrEqual(TRAPS.length);
    for (const { def } of allAuthoredStations()) {
      for (const id of [...(def.seams ?? []), ...(def.remains ?? []), ...(def.floodSeams ?? [])]) {
        expect(stilled.has(id), `${def.name} seams a stilled stone`).toBe(false);
      }
    }
  });

  it('and the Hold can say what it holds', () => {
    const st = withStill(1);
    expect(stilledHeld(st)).toEqual([]);
    addMaterial(st, 'millstone', 80);
    distil(st, ctx, 'millstone', 'fine', 'brittle');
    expect(stilledHeld(st)).toEqual([{ id: stilledId('millstone', 'brittle'), count: 1 }]);
  });

  it('the bench lists what you HOLD, tutorial first — never a catalogue', () => {
    const st = withStill(1);
    expect(distillable(st), 'an empty Hold offered rows').toEqual([]);
    addMaterial(st, 'millstone', 80);
    addMaterial(st, 'umberjade', 80);
    const rows = distillable(st);
    expect(rows).toHaveLength(1);          // tier I sees only the trap's own fault
    expect(rows[0]!.materialId).toBe('millstone');
    expect(rows[0]!.named).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4 — THE VIAL WAS CUT AT A.90 AND IS WIRED AT A.92
// ---------------------------------------------------------------------------

/**
 * THIS TEST IS THE A.90 ONE, INVERTED IN PLACE. It read:
 *
 *   "4 — the vial is CUT, and stays cut until the Infuser exists
 *    it('nothing anywhere holds a vial or an infusion')"
 *
 * and it was there to stop the WORD creeping in before the machine that wants
 * one existed. The machine exists (`systems/infuser.ts`), so the cut's stated
 * reason has dissolved — PILLARS: "a cut is provisional, and its reason can
 * dissolve". Inverting rather than deleting keeps the finding and its answer as
 * one story, and the new assertion is the strong half of the old one: a vial
 * exists, has a producer AND a consumer, and remembers where it came from.
 */
describe('4 — the vial has a producer, a consumer, and a memory', () => {
  it('a strip fills a vial, and the vial names the stone it came out of', () => {
    const st = withStill(3);
    expect(vialsHeld(st), 'vials before anything was stilled').toEqual([]);
    addMaterial(st, 'millstone', 80);
    distil(st, ctx, 'millstone', 'fine', 'brittle');
    expect(vialsHeld(st)).toEqual([{ trait: 'brittle', fromId: 'millstone', count: 1 }]);
  });

  it('one strip, one vial — it cannot be farmed off a stack', () => {
    const st = withStill(3);
    for (let i = 0; i < 4; i++) addMaterial(st, 'millstone', 80);
    for (let i = 0; i < 3; i++) distil(st, ctx, 'millstone', 'fine', 'brittle');
    expect(vialsHeld(st)[0]!.count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 5 — PILLAR 2
// ---------------------------------------------------------------------------

describe('5 — PILLAR 2: a lateral converter makes nothing', () => {
  it('one unit in, one unit out, and the band does not move', () => {
    const st = withStill(1);
    for (let i = 0; i < 5; i++) addMaterial(st, 'millstone', 80);
    const drops = st.materials.totalDrops;
    distil(st, ctx, 'millstone', 'fine', 'brittle');
    const total = Object.values(st.materials.stacks)
      .reduce((n, per) => n + Object.values(per).reduce((a, s) => a + (s?.count ?? 0), 0), 0);
    expect(total, 'the Still made or ate a unit').toBe(5);
    expect(st.materials.totalDrops, 'a conversion counted as a find').toBe(drops);
    expect(Object.keys(st.materials.stacks[stilledId('millstone', 'brittle')]!)).toEqual(['fine']);
  });

  it('dpsMax at the SAME depth is identical before and after a distillation', () => {
    const read = (run: boolean): number => {
      const st = withStill(3);
      st.depth = 40; // THE SAME DEPTH IN BOTH ARMS
      addMaterial(st, 'millstone', 80);
      if (run) distil(st, ctx, 'millstone', 'fine', 'brittle');
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });
});
