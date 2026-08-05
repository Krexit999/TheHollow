/**
 * THE BREAKER — SALVAGE (§13, §8), A.90.
 *
 *   0  WHAT WAS ALREADY BUILT — checked before building anything, because the
 *      ledger is a claim. Three salvage paths already existed; this asserts
 *      they still work and that the Breaker is not a fourth copy of them
 *   1  the place, then the price, and tiers as capability
 *   2  a cast PART back to the HOLD — the one direction nothing went
 *   3  UN-SHORING RETURNS THE TIMBER (item 17), and returned nothing before
 *   4  bulk never eats the best of a type
 *   5  "back to DESIGN" is CUT, and the absence is asserted
 *   6  PILLAR 2 — it returns what you spent, at a loss, and never a unit more
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { raiseWreck } from './wrecks';
import { CRUSHER_WRECK } from '../systems/crusher';
import { createEngine } from '../index';
import { D } from '../decimal';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { markReached } from '../systems/roll';
import { MAX_MACHINE_TIER, TIER_PART_COST, tierOf } from '../systems/plant';
import { ensureCondition } from '../systems/condition';
import { SALVAGE_RETURN } from '../systems/salvage';
import { MELT_BACK_SHARE } from '../systems/casting';
import { shoreBand, shoreCost, unshoreBand } from '../systems/shoring';
import { buildCrusher, crusherBuilt, nextCrusherTierCost } from '../systems/crusher';
import {
  BREAK_RETURN, breakBlocker, breakPart, breakRack, breakable, breakerBuilt, breakerFound,
  breakerStation, breaksInBulk, buildBreaker, propsBack, returnsProps, unbuildBlocker,
  unbuildMachine, unbuildable,
} from '../systems/breaker';
import { allAuthoredStations } from '../content/rolls';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;
let mods: ModifierCache;

function racked(st: GameState, n: number, mat = 'marl'): GameState {
  st.casting.rack = Array.from({ length: n }, (_, i) =>
    ({ id: i + 1, materialId: mat, type: 'head', purity: 50 + i } as never));
  st.casting.nextId = n + 1;
  return st;
}

/** A player who has walked Ferrite and stands in it. */
function atTheYard(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'ferrite';
  markReached(st, 250, 15);
  return racked(st, 20);
}

function withBreaker(tier = 1): GameState {
  const st = atTheYard();
  for (let i = 0; i < tier; i++) buildBreaker(st, ctx);
  return st;
}

beforeEach(() => {
  mods = new ModifierCache();
  mods.invalidate();
});

// ---------------------------------------------------------------------------
// 0 — WHAT WAS ALREADY BUILT
// ---------------------------------------------------------------------------

describe('0 — the ledger is a claim: three salvage paths already existed', () => {
  it('and the Breaker is priced BELOW both of them, on purpose', () => {
    // Breaking a PART is the convenient exit; breaking a TOOL is the considered
    // one. Melting back keeps the stone molten and near the mould. So the
    // convenient, carry-it-to-the-Hold path pays least, and that ordering is
    // the design rather than three numbers that happened to land apart.
    expect(BREAK_RETURN).toBeLessThan(SALVAGE_RETURN);
    expect(BREAK_RETURN).toBeLessThan(MELT_BACK_SHARE);
  });
});

// ---------------------------------------------------------------------------
// 1 — THE MACHINE
// ---------------------------------------------------------------------------

describe('1 — the place, then the price (§6, §15.4)', () => {
  it('TWO shells author one, and either counts', () => {
    const wrecks = allAuthoredStations().filter((s) => s.def.wreck === 'THE BREAKER');
    expect(wrecks.map((w) => [w.shellId, w.def.depth])).toEqual([['ferrite', 210], ['cinder', 260]]);
    expect(breakerStation()!.depth).toBe(210);

    // A Cinder player who never went back to Ferrite still has one.
    const cinder = createEngine({ nowMs: 0 }).getState() as GameState;
    cinder.shell.current = 'cinder';
    markReached(cinder, 470, 15);
    expect(breakerFound(cinder)).toBe(true);
  });

  it('a player who has been to neither cannot raise it', () => {
    const st = racked(createEngine({ nowMs: 0 }).getState() as GameState, 20);
    expect(breakerFound(st)).toBe(false);
    expect(buildBreaker(st, ctx).reason).toContain("Breaker's Yard");
  });

  it('I breaks one part, II returns props, III breaks the rack', () => {
    const one = withBreaker(1);
    expect(breakerBuilt(one)).toBe(true);
    expect(returnsProps(one)).toBe(false);
    expect(breaksInBulk(one)).toBe(false);
    expect(breakRack(one, ctx).reason).toContain('one at a time');

    const two = withBreaker(2);
    expect(returnsProps(two)).toBe(true);
    expect(breaksInBulk(two)).toBe(false);

    const three = withBreaker(3);
    expect(tierOf(three, 'breaker')).toBe(MAX_MACHINE_TIER);
    expect(breaksInBulk(three)).toBe(true);
  });

  it('and a cracked Breaker will not run — E2 reaches it like every machine', () => {
    const st = withBreaker(1);
    const id = breakable(st)[0]!.partId;
    expect(breakBlocker(st, id)).toBeNull();
    ensureCondition(st)['breaker'] = { id: 'baked', level: 1, seized: true };
    expect(breakBlocker(st, id)).toContain('cracked');
  });
});

// ---------------------------------------------------------------------------
// 2 — THE ONE DIRECTION NOTHING WENT
// ---------------------------------------------------------------------------

describe('2 — a cast part back to the HOLD', () => {
  it('it leaves the rack and arrives as its own stone, at its own purity', () => {
    const st = withBreaker(1);
    const row = breakable(st)[0]!;
    const rackBefore = st.casting.rack.length;
    const held = st.materials.stacks['marl'] ?? {};
    const before = Object.values(held).reduce((n, s) => n + (s?.count ?? 0), 0);

    const r = breakPart(st, ctx, row.partId);
    expect(r.ok, r.reason).toBe(true);
    expect(st.casting.rack.length).toBe(rackBefore - 1);
    const after = Object.values(st.materials.stacks['marl'] ?? {})
      .reduce((n, s) => n + (s?.count ?? 0), 0);
    expect(after - before).toBe(row.units);
    expect(row.units).toBeGreaterThan(0);
  });

  it('...and it refuses a part that is on the station', () => {
    const st = withBreaker(1);
    const id = st.casting.rack[0]!.id;
    st.casting.bench['head'] = id;
    expect(breakBlocker(st, id)).toContain('on the station');
    expect(breakable(st).some((r) => r.partId === id), 'the bench part was offered').toBe(false);
  });

  it('and a Breaker that is not built offers nothing and refuses everything', () => {
    const st = atTheYard();
    expect(breakable(st)).toEqual([]);
    expect(breakBlocker(st, 1)).toBe('The Breaker is not standing.');
  });
});

// ---------------------------------------------------------------------------
// 3 — THE TIMBER
// ---------------------------------------------------------------------------

/**
 * ITEM 17: "Shoring wanted un-shoring to return the timber and had no hook."
 * Before this, `unshoreBand` CHARGED Brick and returned nothing at all — the
 * props, the winch and every cast part the band swallowed simply vanished,
 * which made it a pure loss and therefore never the right move.
 */
describe('3 — un-shoring returns the timber (§9.4, §13)', () => {
  function shored(tier: number): { st: GameState; cost: number } {
    const st = withBreaker(tier);
    st.depthRecords['ferrite'] = 250;
    st.roll!.rig = true;
    st.currencies['flux'] = D('1e14');
    // top the rack back up: raising the Breaker ate some
    racked(st, 20);
    st.plant!.tiers['breaker'] = tier;
    const cost = shoreCost(st, 'lodestonecut')!.parts;
    expect(shoreBand(st, ctx, 'lodestonecut').ok).toBe(true);
    return { st, cost };
  }

  it('a tier-I Breaker gives nothing back — the old behaviour, exactly', () => {
    const { st } = shored(1);
    const before = st.casting.rack.length;
    const r = unshoreBand(st, ctx, 'lodestonecut');
    expect(r.ok).toBe(true);
    expect((r.data as { partsBack: number }).partsBack).toBe(0);
    expect(st.casting.rack.length).toBe(before);
  });

  it('a tier-II one hands the parts back, and the drift is gone either way', () => {
    const { st, cost } = shored(2);
    const before = st.casting.rack.length;
    const r = unshoreBand(st, ctx, 'lodestonecut');
    expect(r.ok).toBe(true);
    const back = (r.data as { partsBack: number }).partsBack;
    expect(back).toBe(propsBack(st, cost));
    expect(back, 'the timber did not come back').toBeGreaterThan(0);
    expect(st.casting.rack.length).toBe(before + back);
    expect(st.roll!.shored).toEqual([]);
  });

  /**
   * AND THE LOSS ONLY BITES WHERE THE BAND WAS EXPENSIVE, which is a real
   * consequence of the clamp and is stated rather than smoothed over.
   *
   * `shorePartCost = 1 + floor(depth/50)`, so every band above 50m costs ONE
   * part — and `floor(1 x 0.35)` is zero, which would have made "un-shoring
   * returns the timber" hand back nothing for the whole top of every shaft. The
   * clamp fixes that and, at one part, makes the shallow end a full return.
   * Deeper down, where a band costs five, you get one back.
   */
  it('...and the loss bites deep, where a band cost more than a single prop', () => {
    const { st, cost } = shored(2);
    expect(cost, 'a 14m band costs one prop').toBe(1);
    expect(propsBack(st, cost), 'the shallow end is a full return, by the clamp').toBe(1);
    expect(propsBack(st, 5), 'a deep band should lose most of it').toBe(1);
    expect(propsBack(st, 5)).toBeLessThan(5);
  });
});

// ---------------------------------------------------------------------------
// 4 — BULK
// ---------------------------------------------------------------------------

describe('4 — the rack at once, and it never eats the best of a type', () => {
  it('the highest-purity part of each type survives, and the bench is untouched', () => {
    const st = withBreaker(3);
    racked(st, 8);
    st.plant!.tiers['breaker'] = 3;
    const best = Math.max(...st.casting.rack.map((p) => p.purity));
    const bestId = st.casting.rack.find((p) => p.purity === best)!.id;
    const benchId = st.casting.rack.find((p) => p.id !== bestId)!.id;
    st.casting.bench['head'] = benchId;

    const r = breakRack(st, ctx);
    expect(r.ok, r.reason).toBe(true);
    const left = st.casting.rack.map((p) => p.id).sort();
    expect(left).toEqual([bestId, benchId].sort());
  });

  it('and it says so rather than running on an empty rack', () => {
    const st = withBreaker(3);
    st.casting.rack = [];
    expect(breakRack(st, ctx).reason).toContain('Nothing on the rack');
  });
});

// ---------------------------------------------------------------------------
// 5 — "BACK TO DESIGN" IS CUT
// ---------------------------------------------------------------------------

/**
 * §13's line is "break tools and parts back to material OR DESIGN". The design
 * half is CUT: §11.3's DESIGN BOARD does not exist, QoL blueprints were RETIRED
 * at A.36, and the Forge's pour path runs through a crucible melt a re-pour verb
 * would have to duplicate. A recorded design with nothing able to pour it is a
 * name against no mechanism — the same call the Still's vial got. Asserted so
 * the word cannot creep back before the board that wants one.
 */
describe('5 — the DESIGN half is cut, and stays cut', () => {
  it('nothing holds a design or a blueprint', () => {
    const st = withBreaker(3);
    breakPart(st, ctx, breakable(st)[0]!.partId);
    const dump = JSON.stringify(st).toLowerCase();
    for (const word of ['blueprint', 'design']) {
      expect(dump.includes(word), `state carries "${word}"`).toBe(false);
    }
    expect((st.qol as unknown as Record<string, unknown>)?.['blueprints']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6 — PILLAR 2
// ---------------------------------------------------------------------------

describe('6 — PILLAR 2: it returns what you spent, never more', () => {
  it('a break is not a find: `totalDrops` does not move', () => {
    const st = withBreaker(1);
    const drops = st.materials.totalDrops;
    breakPart(st, ctx, breakable(st)[0]!.partId);
    expect(st.materials.totalDrops).toBe(drops);
  });

  it('no currency moves, at any tier', () => {
    const st = withBreaker(3);
    racked(st, 8);
    st.plant!.tiers['breaker'] = 3;
    const before = JSON.stringify(st.currencies);
    breakRack(st, ctx);
    expect(JSON.stringify(st.currencies)).toBe(before);
  });

  it('dpsMax at the SAME depth is identical with the whole rack broken', () => {
    const read = (run: boolean): number => {
      const st = withBreaker(3);
      racked(st, 8);
      st.plant!.tiers['breaker'] = 3;
      st.depth = 48; // THE SAME DEPTH IN BOTH ARMS
      if (run) breakRack(st, ctx);
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });
});

// ---------------------------------------------------------------------------
// 7 — UN-BUILDING (A.91, by ruling)
// ---------------------------------------------------------------------------

/**
 * THE ROW A.90 LEDGERED AS "what else should salvage and doesn't": cast parts
 * spent on a machine tier were gone forever, and a player who tiered the wrong
 * one had no exit at all.
 *
 * THE RULING: un-building returns its PARTS, not its tier. Re-tiering costs the
 * tier material again — so the loss is the CAPABILITY, which is a different
 * trade from every other salvage in the game.
 */
describe('7 — a built machine back to its parts', () => {
  function withCrusher(tier: number): GameState {
    const st = withBreaker(1);
    raiseWreck(st, CRUSHER_WRECK); // The Long Cut, Loam 47 (A.106)
    racked(st, 12, 'ironbloom');
    for (let i = 0; i < tier; i++) buildCrusher(st, ctx);
    return st;
  }

  it('is offered at TIER I — an exit is not a convenience', () => {
    const st = withCrusher(2);
    expect(tierOf(st, 'breaker'), 'the fixture should be a tier-I Breaker').toBe(1);
    expect(unbuildable(st).map((u) => u.machineId)).toContain('crusher');
    expect(unbuildBlocker(st, 'crusher')).toBeNull();
  });

  it('hands back EXACTLY what went in, and takes the tier', () => {
    const st = withCrusher(2);
    const spent = [...st.plant!.builtOf!['crusher']!];
    expect(spent.length, 'tier I + II is 2 + 3 parts').toBe(5);
    const rackBefore = st.casting.rack.length;

    const r = unbuildMachine(st, ctx, 'crusher');
    expect(r.ok, r.reason).toBe(true);
    expect((r.data as { parts: number; tierLost: number })).toEqual({ parts: 5, tierLost: 2 });
    expect(st.casting.rack.length - rackBefore, 'not one part more or fewer').toBe(spent.length);
    // ...and they are the same STONE, which is the ruling rather than generosity.
    const back = st.casting.rack.slice(rackBefore).map((p) => p.materialId).sort();
    expect(back).toEqual([...spent].sort());

    // THE TIER IS GONE.
    expect(tierOf(st, 'crusher')).toBe(0);
    expect(crusherBuilt(st)).toBe(false);
    expect(st.plant!.builtOf!['crusher']).toBeUndefined();
  });

  it('and re-tiering costs the tier material again — it is not a refund loop', () => {
    const st = withCrusher(2);
    unbuildMachine(st, ctx, 'crusher');
    // The parts came back, so a rebuild is affordable — and it costs the SAME
    // ladder from the bottom: tier I is 2 parts again, not a free restore.
    expect(nextCrusherTierCost(st), 'the ladder restarts at tier I').toBe(TIER_PART_COST[1]);
    const before = st.casting.rack.length;
    expect(buildCrusher(st, ctx).ok).toBe(true);
    expect(before - st.casting.rack.length).toBe(TIER_PART_COST[1]);
    expect(tierOf(st, 'crusher'), 'it came back at ONE, not at two').toBe(1);
  });

  it('the world\'s mark comes off with it — a seizure cannot outlive its machine', () => {
    const st = withCrusher(1);
    ensureCondition(st)['crusher'] = { id: 'baked', level: 1, seized: true };
    expect(unbuildMachine(st, ctx, 'crusher').ok).toBe(true);
    expect(st.plant!.condition?.['crusher']).toBeUndefined();
  });

  it('refuses what is not built, and a machine that remembers nothing', () => {
    const st = withBreaker(1);
    expect(unbuildBlocker(st, 'crusher')).toBe('It is not built.');
    // A machine raised before `builtOf` existed (A.83) has no record, so there
    // is nothing honest to hand back.
    st.plant!.tiers['crusher'] = 2;
    expect(unbuildBlocker(st, 'crusher')).toContain('nothing to give back');
  });

  it('the KILN is never offered — it is not a plant tier (§3.2)', () => {
    const st = withCrusher(1);
    st.kiln.built = true;
    expect(unbuildable(st).map((u) => u.machineId)).not.toContain('kiln');
  });

  it('PILLAR 2: no currency moves and dpsMax does not budge at equal depth', () => {
    const read = (run: boolean): number => {
      const st = withCrusher(2);
      st.depth = 48; // THE SAME DEPTH IN BOTH ARMS
      if (run) unbuildMachine(st, ctx, 'crusher');
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));

    const st = withCrusher(2);
    const before = JSON.stringify(st.currencies);
    unbuildMachine(st, ctx, 'crusher');
    expect(JSON.stringify(st.currencies)).toBe(before);
  });
});
