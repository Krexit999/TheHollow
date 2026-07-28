/**
 * ORES IN THE GRID — a denser pocket of what you were already mining.
 *
 * The claims under test are the ones the feature stands or falls on:
 *   1. PILLAR 2 by construction — an ore raises `cap` and NOTHING else, so the
 *      ceiling cannot move and you can never take more charge than the rock
 *      produced. The reward is paid in DROPS, which are outside the income path.
 *   2. The CHOICE is real — hand is slower/cleaner, drill is faster/lossier,
 *      and neither is required (pillar 1: a bay opens them while you are away,
 *      and a player with no bay at all can still open every one by hand).
 *   3. The grid is never dead and never paved — a cap, a trickle, and a floor.
 *   4. PILLAR 5 — types are recorded on opening, never listed before.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { EngineCtx, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { applyFieldSize, cellCap, dpsMax, manualChip, sweep, tickFace } from '../systems/face';
import { newDrill, tickDrills } from '../systems/drills';
import {
  DRILL_ORE_SHARE, DRILL_ORE_SPEED, ORE_CAP_SHARE, ORE_DROUGHT_SEC, ORE_DROUGHT_SHARE,
  cellCapAt, clearOres, digComplete, digProgress, isOre, openOre, oreCount,
  seedOre, tickOres, workOre,
} from '../systems/ores';
import { ORES, oreDef, oreOddsHint, oreTable, rollOreType } from '../content/ores';
import { allShells } from '../shells';

const ctx: EngineCtx = { emit() {}, dirty() {} };
const mods = () => new ModifierCache();
const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.depth = 40;
  return { engine, s };
};
/**
 * Put a known pocket in a known cell, bypassing the roll, and FILL IT. The fill
 * matters: a drill will not spend its job on a pocket that has barely started
 * filling (ORE_WORTH_OPENING), so a test that seeds an empty one is testing the
 * refusal, not the dig.
 */
const put = (s: GameState, cell: number, id = 'fatseam') => {
  if (!Array.isArray(s.face.ore)) s.face.ore = new Array(s.face.cells.length).fill('');
  s.face.ore[cell] = id;
  s.face.cells[cell] = cellCapAt(s, mods(), cell);
};
/** Deterministic rng for the spawner, so a shape test is not a coin flip. */
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]!; };

// ---------------------------------------------------------------------------

describe('PILLAR 2 — a pocket is a bigger cup, not a second tap', () => {
  it('raises this cell\'s cap and leaves every other cell alone', () => {
    const { s } = fresh();
    const m = mods();
    const base = cellCap(s, m);
    put(s, 5, 'heartrot');
    expect(cellCapAt(s, m, 5)).toBeCloseTo(base * oreDef('heartrot')!.richness, 6);
    expect(cellCapAt(s, m, 6)).toBeCloseTo(base, 6);
  });

  /** The load-bearing one. `dpsMax = W·H·regen·Y` has no cap term in it. */
  it('does not move the ceiling, however much of the face is pocket', () => {
    const { s } = fresh();
    const m = mods();
    const before = dpsMax(s, m).toNumber();
    for (let i = 0; i < s.face.cells.length; i++) put(s, i, 'heartrot');
    expect(dpsMax(s, m).toNumber()).toBe(before);
  });

  /** And the reason that holds: regen per cell is untouched by the pocket. */
  it('fills at exactly the same rate as plain rock — it just fills for longer', () => {
    const { s } = fresh();
    const m = mods();
    put(s, 0, 'heartrot');
    s.face.cells = s.face.cells.map(() => 0); // both empty, after the seeding
    tickFace(s, m, ctx, 10);
    expect(s.face.cells[0]!).toBeCloseTo(s.face.cells[1]!, 6);
  });

  /**
   * A POCKET DEFERS CHARGE; IT DOES NOT DESTROY IT — and the accounting matters
   * because it is the one place ore touches an idle player negatively.
   *
   * Seep is a cut of OVERFLOW. A pocket holds more, so it overflows later, so
   * while it sits unopened it thins the leak. Found from `progression.test`
   * rather than reasoned about up front. It is an acceptable cost and this test
   * says why: seep pays 15% of what it takes, while OPENING the pocket pays
   * 100%, so the charge a pocket withholds comes back worth several times more.
   * Anyone with a bay gets it back automatically (hunting is on by default).
   */
  it('withholds seep while it fills, and pays it all back on opening', () => {
    const { s } = fresh();
    const m = mods();
    s.shell.signatures = ['seepage'];
    const base = cellCap(s, m);
    put(s, 0, 'heartrot');
    s.face.cells = s.face.cells.map(() => base); // every plain cell AT cap
    // The pocket is below its own (higher) cap, so it soaks regen instead of
    // leaking it — this is the cost, and it is bounded by the pocket's size.
    s.face.cells[0] = base;
    tickFace(s, m, ctx, 1);
    expect(s.face.cells[0]!).toBeGreaterThan(base); // it went in, not out
    // ...and every bit of it is still there to be taken.
    const held = s.face.cells[0]!;
    const before = s.stats.fieldChargeHarvested.toNumber();
    openOre(s, m, ctx, 0, 'hand', 1);
    const paid = s.stats.fieldChargeHarvested.toNumber() - before;
    expect(paid).toBeGreaterThan(held * 0.9); // the hand takes it clean
    expect(paid).toBeLessThanOrEqual(held + 1e-9); // and never more than was there
  });

  it('a pocket cannot hand over more charge than the rock put in it', () => {
    const { s } = fresh();
    const m = mods();
    put(s, 3, 'heartrot');
    const cap = cellCapAt(s, m, 3);
    s.face.cells[3] = cap;
    const before = s.stats.fieldChargeHarvested.toNumber();
    openOre(s, m, ctx, 3, 'hand', 1);
    expect(s.stats.fieldChargeHarvested.toNumber() - before).toBeLessThanOrEqual(cap + 1e-9);
  });

  /**
   * THE PAYOUT IS DROPS, NOT DUST. If a richer type paid more CHARGE per second
   * it would be a faucet; it pays more PULLS ON THE TABLE instead, which is
   * outside the income path entirely.
   */
  it('a richer type is worth more in drops and identical in yield terms', () => {
    const plain = oreDef('fatseam')!;
    const rich = oreDef('heartrot')!;
    expect(rich.rolls).toBeGreaterThan(plain.rolls);
    expect(rich.depthMult).toBeGreaterThan(plain.depthMult);
    // No ore def carries a yield/regen term at all — there is nowhere to hide one.
    for (const o of ORES) {
      expect(Object.keys(o)).not.toContain('yield');
      expect(Object.keys(o)).not.toContain('regen');
    }
  });
});

// ---------------------------------------------------------------------------

describe('a pocket will not come away with one swing', () => {
  it('an ordinary chip does nothing to it — that refusal IS the time cost', () => {
    const { s } = fresh();
    const m = mods();
    put(s, 4);
    s.face.cells[4] = cellCapAt(s, m, 4);
    const before = s.face.cells[4]!;
    const r = manualChip(s, m, ctx, 4);
    expect(r.charge).toBe(0);
    expect(s.face.cells[4]).toBe(before);
    expect(isOre(s, 4)).toBe(true);
  });

  it('a sweep passes over it too — the fast gesture is the one it resists', () => {
    const { s } = fresh();
    const m = mods();
    put(s, 2);
    s.face.cells = s.face.cells.map((_, i) => cellCapAt(s, m, i));
    const r = sweep(s, m, ctx, [0, 1, 2, 3]);
    expect(r.swept).not.toContain(2);
    expect(r.swept).toContain(0);
  });
});

// ---------------------------------------------------------------------------

describe('the choice: work it, or leave it to the machines', () => {
  it('hand work banks by the second and opens on completion', () => {
    const { s } = fresh();
    put(s, 1);
    const def = oreDef('fatseam')!;
    workOre(s, ctx, 1, def.digSec / 2);
    expect(digComplete(s, 1)).toBe(false);
    expect(digProgress(s, 1)).toBeCloseTo(0.5, 2);
    workOre(s, ctx, 1, def.digSec / 2);
    expect(digComplete(s, 1)).toBe(true);
  });

  it('letting go KEEPS the progress — a slip must not cost the work', () => {
    const { s } = fresh();
    put(s, 1);
    workOre(s, ctx, 1, 3);
    const held = digProgress(s, 1);
    // ...and time passing on its own changes nothing.
    tickOres(s, mods(), ctx, 30);
    expect(digProgress(s, 1)).toBe(held);
  });

  /** The trade, stated as a property: the hand takes it CLEAN. */
  it('the hand takes all of it; a drill leaves some in the rock', () => {
    const m = mods();
    const byHand = (() => {
      const { s } = fresh();
      put(s, 0, 'heartrot');
      s.face.cells[0] = cellCapAt(s, m, 0);
      return openOre(s, m, ctx, 0, 'hand', 1)!.charge;
    })();
    const byDrill = (() => {
      const { s } = fresh();
      put(s, 0, 'heartrot');
      s.face.cells[0] = cellCapAt(s, m, 0);
      return openOre(s, m, ctx, 0, 'drill', 1)!.charge;
    })();
    expect(byDrill).toBeLessThan(byHand);
    expect(byDrill / byHand).toBeCloseTo(DRILL_ORE_SHARE, 2);
  });

  it('...but the drill is FASTER, which is what it is selling', () => {
    expect(DRILL_ORE_SPEED).toBeLessThan(1);
  });

  it('opening it spends the pocket, whoever did it', () => {
    const { s } = fresh();
    put(s, 7);
    openOre(s, mods(), ctx, 7, 'hand', 1);
    expect(isOre(s, 7)).toBe(false);
    expect(digProgress(s, 7)).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('the drills: hunting is on by default, and it is one switch', () => {
  const bay = (s: GameState, n = 1) => {
    s.drills.bayBuilt = true;
    for (let i = 0; i < n; i++) s.drills.units.push(newDrill(`D${i}`));
    s.face.cells = s.face.cells.map(() => 8);
  };

  it('a drill commits to a pocket and opens it', () => {
    const { s } = fresh();
    bay(s);
    put(s, 9);
    const need = oreDef('fatseam')!.digSec * DRILL_ORE_SPEED;
    tickDrills(s, mods(), ctx, 0.5);
    expect(s.drills.units[0]!.oreCell).toBe(9);
    tickDrills(s, mods(), ctx, need + 1);
    expect(isOre(s, 9)).toBe(false);
    expect(s.drills.units[0]!.oreCell).toBeUndefined();
  });

  it('turning the switch off leaves every pocket for the player', () => {
    const { s } = fresh();
    bay(s);
    s.drills.huntOres = false;
    put(s, 9);
    tickDrills(s, mods(), ctx, 60);
    expect(isOre(s, 9)).toBe(true);
    expect(s.drills.units[0]!.oreCell).toBeUndefined();
  });

  it('two drills never crowd the same pocket while another sits open', () => {
    const { s } = fresh();
    bay(s, 2);
    put(s, 3);
    put(s, 8);
    tickDrills(s, mods(), ctx, 0.5);
    const claims = s.drills.units.map((u) => u.oreCell);
    expect(new Set(claims).size).toBe(2);
  });

  /** A drill on a pocket is doing nothing else — that is what the player buys. */
  it('a drill digging a pocket is not also striking rock', () => {
    const { s } = fresh();
    bay(s);
    put(s, 9);
    tickDrills(s, mods(), ctx, 0.5); // claims it
    const strikes = s.stats.drillStrikes;
    tickDrills(s, mods(), ctx, 1);   // still digging
    expect(s.stats.drillStrikes).toBe(strikes);
  });

  /**
   * ONCE IT STARTS, IT FINISHES. Half-mined ore abandoned because a machine
   * changed its mind is the worst kind of waste — the time was already spent
   * and bought nothing. Two real abandonment paths were found by probing the
   * live engine rather than by reading it, and each gets a test here.
   */
  it('will not be lured off a half-dug pocket by a fatter one appearing', () => {
    const { s } = fresh();
    bay(s);
    put(s, 3);
    tickDrills(s, mods(), ctx, 2);
    expect(s.drills.units[0]!.oreCell).toBe(3);
    // A far richer pocket turns up mid-dig, brim full.
    put(s, 20, 'heartrot');
    s.face.cells[20] = 99999;
    tickDrills(s, mods(), ctx, 1);
    expect(s.drills.units[0]!.oreCell).toBe(3);
    expect(s.drills.units[0]!.oreProgress).toBeGreaterThan(2);
  });

  it('keeps its pocket AND its progress when the face is widened', () => {
    const { s } = fresh();
    const m = mods();
    bay(s);
    put(s, 10);
    tickDrills(s, m, ctx, 3);
    const progress = s.drills.units[0]!.oreProgress!;
    expect(s.drills.units[0]!.oreCell).toBe(10);

    // Buying "Widen the Face" used to rebuild `cells` and leave `ore` at the
    // old length, so the next read replaced the whole array with empties: an
    // upgrade purchase wiped every pocket on the grid and abandoned the dig.
    s.upgrades['expand'] = 2;
    applyFieldSize(s, m);
    expect(oreCount(s)).toBe(1);
    // ...and the cell was RENUMBERED by the wider rows, so the drill's
    // reference has to move with it or it is digging the wrong rock.
    const moved = s.drills.units[0]!.oreCell!;
    expect(isOre(s, moved)).toBe(true);
    expect(moved).not.toBe(10);
    tickDrills(s, m, ctx, 1);
    expect(s.drills.units[0]!.oreProgress).toBeGreaterThan(progress);
  });

  /**
   * Settled at the SOURCE. A vine taking a cell mid-dig used to make the drill
   * let go and bin the work, so nothing grows on a pocket at all — which keeps
   * the drill's release rule down to its single clause with no second condition
   * that can quietly fire. No drills in this test on purpose: the claim is
   * about GROWTH, and a drill would open the pocket and hand the cell back.
   */
  it('nothing sprouts on a pocket, so a dig can never be interrupted by one', () => {
    const { engine, s } = fresh();
    s.shell.current = 'verdance';
    s.shell.signatures = ['growth'];
    put(s, 4);
    // Cells pinned at cap — exactly the condition a vine sprouts from — and
    // long enough that every neighbour goes feral and tries to creep across.
    for (let i = 0; i < 400; i++) {
      s.face.cells = s.face.cells.map(() => 1e6);
      engine.tick(1);
    }
    expect(isOre(s, 4)).toBe(true);
    expect(s.growth.stage[4] ?? 0).toBe(0);
    // ...and the rest of the face DID grow, so this is a refusal and not a
    // test that quietly proved growth was switched off.
    expect(s.growth.stage.filter((v) => (v ?? 0) > 0).length).toBeGreaterThan(0);
  });

  it('lets go only when the pocket is gone — the player got there first', () => {
    const { s } = fresh();
    bay(s);
    put(s, 6);
    tickDrills(s, mods(), ctx, 2);
    expect(s.drills.units[0]!.oreCell).toBe(6);
    openOre(s, mods(), ctx, 6, 'hand', 1); // the hand takes it
    tickDrills(s, mods(), ctx, 0.5);
    expect(s.drills.units[0]!.oreCell).toBeUndefined();
  });

  it('never targets a pocket for an ordinary strike — it would stand there hitting nothing', () => {
    const { s } = fresh();
    bay(s);
    s.drills.huntOres = false;
    for (let i = 0; i < s.face.cells.length; i++) s.face.cells[i] = 0;
    put(s, 5);
    s.face.cells[5] = 99; // by far the fullest cell
    tickDrills(s, mods(), ctx, 10);
    expect(s.face.cells[5]).toBe(99);
  });
});

// ---------------------------------------------------------------------------

describe('the grid is never dead, and never paved', () => {
  it('never exceeds a fifth of the face', () => {
    const { s } = fresh();
    const m = mods();
    const limit = Math.floor(s.face.cells.length * ORE_CAP_SHARE);
    for (let i = 0; i < 200; i++) seedOre(s, m, ctx);
    expect(oreCount(s)).toBeLessThanOrEqual(limit);
    expect(oreCount(s)).toBeGreaterThan(0);
  });

  /** THE ANTI-DROUGHT FLOOR. A dry minute is the failure this fixes. */
  it('a dry minute forces a real seeding', () => {
    const { s } = fresh();
    const m = mods();
    expect(oreCount(s)).toBe(0);
    // Just under the line: still nothing owed.
    s.face.oreDryFor = ORE_DROUGHT_SEC - 2;
    // The trickle could fire by luck, so assert the FLOOR at the boundary only.
    s.face.oreDryFor = ORE_DROUGHT_SEC;
    tickOres(s, m, ctx, 1);
    expect(oreCount(s)).toBeGreaterThanOrEqual(
      Math.round(s.face.cells.length * ORE_DROUGHT_SHARE),
    );
    expect(s.face.oreDryFor).toBe(0);
  });

  it('the floor only fires from EMPTY — it is a net, not a faucet', () => {
    const { s } = fresh();
    const m = mods();
    put(s, 0);
    for (let i = 0; i < 200; i++) tickOres(s, m, ctx, 1);
    // With a pocket standing, the dry clock never runs at all.
    expect(s.face.oreDryFor).toBe(0);
  });

  it('the drought seeding stays well under the cap', () => {
    expect(ORE_DROUGHT_SHARE).toBeLessThan(ORE_CAP_SHARE);
  });

  it('spawns lone cells AND veins', () => {
    const { s } = fresh();
    const m = mods();
    // rng: [pick-cell, vein?, size, ...walk] — 0.9 forces a single, 0.1 a vein.
    const single = seedOre(s, m, ctx, seq(0.5, 0.9));
    expect(single).toHaveLength(1);
    clearOres(s);
    const vein = seedOre(s, m, ctx, seq(0.5, 0.1, 0.99, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2));
    expect(vein.length).toBeGreaterThan(1);
    // ...and a vein is CONTIGUOUS, or it is just scatter with a longer name.
    const { w } = s.face;
    for (const c of vein.slice(1)) {
      const touches = vein.some((o) => o !== c && (Math.abs(o - c) === 1 || Math.abs(o - c) === w));
      expect(touches).toBe(true);
    }
  });

  it('never seeds onto a cultivated cell — Growth still owns those', () => {
    const { s } = fresh();
    const m = mods();
    for (let i = 0; i < s.face.cells.length; i++) s.growth.stage[i] = 1;
    s.growth.stage[4] = 0;
    for (let i = 0; i < 50; i++) seedOre(s, m, ctx);
    expect(oreCount(s)).toBe(1);
    expect(isOre(s, 4)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('PILLAR 5 — types are found, never listed', () => {
  it('nothing is recorded until a pocket has actually been opened', () => {
    const { s } = fresh();
    put(s, 1, 'blindglut');
    expect(s.face.oreSeen ?? []).toEqual([]);
    openOre(s, mods(), ctx, 1, 'hand', 1);
    expect(s.face.oreSeen).toEqual(['blindglut']);
  });

  it('the odds are described, not tabulated', () => {
    const shallow = oreOddsHint('loam', 0);
    const deep = oreOddsHint('loam', 200);
    expect(shallow).not.toEqual(deep);
    for (const text of [shallow, deep]) {
      for (const o of ORES) expect(text).not.toContain(o.name);
      expect(text).not.toMatch(/\d+%/);
    }
  });

  it('the rich types simply do not form in the shallows', () => {
    expect(oreTable('loam', 0).map((o) => o.id)).toEqual(['fatseam']);
    expect(oreTable('loam', 200).length).toBeGreaterThan(1);
  });

  it('a rarity lean tilts the roll without inventing a type', () => {
    const table = oreTable('loam', 200).map((o) => o.id).sort();
    const rolled = new Set<string>();
    for (let i = 0; i < 400; i++) rolled.add(rollOreType('loam', 200, 6)!.id);
    expect([...rolled].sort().every((id) => table.includes(id))).toBe(true);
    // ...and it really does lean: heavy lean finds the rare one far more often.
    const count = (lean: number) => {
      let n = 0;
      for (let i = 0; i < 600; i++) if (rollOreType('loam', 200, lean)!.id === 'heartrot') n++;
      return n;
    };
    expect(count(8)).toBeGreaterThan(count(1));
  });
});

// ---------------------------------------------------------------------------

describe('the pillars and the reach rule', () => {
  /** PILLAR 1: no drills at all, and every pocket is still yours. */
  it('a player with no bay can open every pocket by hand', () => {
    const { s } = fresh();
    expect(s.drills.units).toHaveLength(0);
    put(s, 2, 'heartrot');
    const def = oreDef('heartrot')!;
    workOre(s, ctx, 2, def.digSec);
    expect(digComplete(s, 2)).toBe(true);
    expect(openOre(s, mods(), ctx, 2, 'hand', 1)).not.toBeNull();
  });

  /**
   * PILLAR 1: a player who is not there still gets them, via the bay.
   *
   * The claim is CHARGE, not a drop count. A drill-opened pocket gets only the
   * ordinary charge-proportional roll (openOre explains why the guarantee had
   * to go), so asserting on `totalDrops` here would be asserting on a coin
   * flip — and the thing that actually matters to an absent player is that the
   * pocket got opened at all instead of sitting there full.
   */
  it('an away player harvests pockets without touching anything', () => {
    const { s } = fresh();
    const m = mods();
    s.drills.bayBuilt = true;
    s.drills.units.push(newDrill('Bess'));
    put(s, 6, 'heartrot');
    const before = s.stats.fieldChargeHarvested.toNumber();
    tickDrills(s, m, ctx, 60);
    expect(isOre(s, 6)).toBe(false);
    expect(s.stats.fieldChargeHarvested.toNumber()).toBeGreaterThan(before);
  });

  /**
   * THE REACH RULE, strictly: ore has to work in EVERY shell from depth zero,
   * or the whole feature goes dead after Loam — the Silica problem again.
   */
  it('every shell has ore from its first minute', () => {
    for (const shell of allShells()) {
      const table = oreTable(shell.id, 0);
      expect(table.length, `${shell.id} has no ore at depth 0`).toBeGreaterThan(0);
      expect(rollOreType(shell.id, 0, 1)).not.toBeNull();
    }
  });

  it('the per-shell path is live, not a stub', () => {
    // Ferrite authors one of its own, and it sits ALONGSIDE the universal seams
    // rather than replacing them.
    const ids = oreTable('ferrite', 0).map((o) => o.id);
    expect(ids).toContain('lodeknot');
    expect(ids).toContain('fatseam');
    expect(oreTable('loam', 0)).not.toContain(oreDef('lodeknot'));
  });

  it('a Breach takes the rock but not what you learned about it', () => {
    const { s } = fresh();
    put(s, 1);
    s.face.oreSeen = ['fatseam'];
    clearOres(s);
    expect(oreCount(s)).toBe(0);
    expect(s.face.oreSeen).toEqual(['fatseam']);
  });
});

// ---------------------------------------------------------------------------
// A DRILL THAT STARTS A POCKET FINISHES IT
// ---------------------------------------------------------------------------

/**
 * REINFORCEMENT, NOT A NEW RULE. `tickDrills` has always released a pocket for
 * exactly one reason — it is not there any more — but "the machine wandered off
 * my half-dug ore" is the kind of claim that is easy to believe and expensive
 * to be wrong about, because the time was already spent and bought nothing.
 *
 * So it is pinned here against the things that WOULD plausibly distract a
 * machine: a fatter pocket appearing next door, a wall of bare rock going to
 * cap, a zone change, a priority change, and the whole bay competing.
 */
describe('a drill locks onto a pocket and stays until it is finished', () => {
  const richFace = (s: GameState) => {
    s.face.cells = s.face.cells.map(() => 8);
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.face.oreDug = new Array(s.face.cells.length).fill(0);
  };

  it('holds the same cell every tick from claim to open', () => {
    const { s } = fresh();
    s.drills.bayBuilt = true;
    richFace(s);
    put(s, 5);
    const d = newDrill('D0');
    d.priority = 'oresFirst';
    s.drills.units.push(d);

    const m = mods();
    tickDrills(s, m, ctx, 1);
    const claimed = d.oreCell;
    expect(claimed, 'the drill should have taken the pocket').toBe(5);

    // Everything that might tempt it away, all at once.
    put(s, 20);
    s.face.cells = s.face.cells.map((c, i) => (i === 20 ? 900 : c));
    let held = 0;
    for (let t = 0; t < 400; t++) {
      tickDrills(s, m, ctx, 0.1);
      if (d.oreCell === undefined) break;
      expect(d.oreCell, `it left cell ${claimed} for ${d.oreCell} mid-dig`).toBe(claimed);
      held++;
    }
    expect(held, 'it should have spent real ticks on the job').toBeGreaterThan(5);
    // It left because it FINISHED, not because it changed its mind.
    expect(isOre(s, 5)).toBe(false);
  });

  it('a zone change mid-dig does not abandon the hole', () => {
    const { s } = fresh();
    s.drills.bayBuilt = true;
    richFace(s);
    put(s, 5);
    const d = newDrill('D0');
    d.priority = 'oresFirst';
    s.drills.units.push(d);
    const m = mods();
    tickDrills(s, m, ctx, 1);
    expect(d.oreCell).toBe(5);
    // Re-zone the drill to the far side of the face. The claim stands.
    d.zone = [30, 31, 32];
    for (let t = 0; t < 50; t++) tickDrills(s, m, ctx, 0.1);
    expect(d.oreCell).toBe(5);
    // A machine keeps its OWN progress (`oreProgress`); `face.oreDug` is the
    // hand's hold-gesture and stays at zero here.
    expect(d.oreProgress ?? 0, 'it held the cell but stopped working it').toBeGreaterThan(0);
  });

  it('switching it to rock-only does not abandon the hole either', () => {
    const { s } = fresh();
    s.drills.bayBuilt = true;
    richFace(s);
    put(s, 7);
    const d = newDrill('D0');
    d.priority = 'oresFirst';
    s.drills.units.push(d);
    const m = mods();
    tickDrills(s, m, ctx, 1);
    expect(d.oreCell).toBe(7);
    d.priority = 'rock';
    for (let t = 0; t < 50; t++) tickDrills(s, m, ctx, 0.1);
    expect(d.oreCell, 'a priority change stranded a half-dug pocket').toBe(7);
  });

  it('and having finished, it moves on to the next one', () => {
    const { s } = fresh();
    s.drills.bayBuilt = true;
    richFace(s);
    put(s, 5);
    put(s, 25);
    const d = newDrill('D0');
    d.priority = 'ores';
    s.drills.units.push(d);
    const m = mods();
    const worked = new Set<number>();
    for (let t = 0; t < 2000; t++) {
      tickDrills(s, m, ctx, 0.1);
      if (d.oreCell !== undefined) worked.add(d.oreCell);
      if (worked.size >= 2) break;
    }
    expect([...worked].sort((a, b) => a - b)).toEqual([5, 25]);
  });

  /** The one legitimate release: somebody else got there first. */
  it('it only lets go when the pocket is gone', () => {
    const { s } = fresh();
    s.drills.bayBuilt = true;
    richFace(s);
    put(s, 5);
    const d = newDrill('D0');
    d.priority = 'oresFirst';
    s.drills.units.push(d);
    const m = mods();
    tickDrills(s, m, ctx, 1);
    expect(d.oreCell).toBe(5);
    openOre(s, m, ctx, 5, 'hand', 1, 'you'); // the player opened it by hand
    tickDrills(s, m, ctx, 0.1);
    expect(d.oreCell).toBeUndefined();
  });
});
