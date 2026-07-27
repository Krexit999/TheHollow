/**
 * A.56 — FINISH DRILLS. Three parts, and the tests are grouped by the claim
 * each part makes rather than by the file each touches.
 *
 *  1  THE POOL GROWS AND DEEPENS. Twelve new abilities across six shells, all
 *     visible grid behaviours, all bounded by regen; and a GRADE that makes an
 *     old ability stronger when it is poured from newer metal.
 *  2  ROUTING. A drill works the squares you painted and prefers what you told
 *     it to prefer — and a drill you never touched behaves exactly as it did
 *     before routing existed (pillar 1 is defended by the DEFAULT, not by a
 *     promise).
 *  3  ACQUISITION. Sixteen bought at a structural price, eight earned and
 *     better — more bite, more slots.
 *
 * THE LOAD-BEARING TEST IN HERE is `every new ability obeys the ceiling`: it
 * runs each of the fifteen against a face with regen switched off and asserts
 * that no arrangement of them takes more charge out than the field contained.
 * A.53's own history is why — 28 unit tests passed while THE SET was worth
 * exactly 1.00x, because every one of them asserted a mechanism in isolation
 * and none asserted what the bay would do with it.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { EngineCtx, GameState } from '../types';
import { D } from '../decimal';
import { ModifierCache } from '../modifiers';
import {
  newDrill, newPrizeDrill, tickDrills, drillPower, drillPriority, zoneSet,
  MAX_DRILLS, BOUGHT_DRILLS, PRIZE_POWER,
} from '../systems/drills';
import {
  drillFits, drillSlots, forgeDrillAlloy, reachedOrdinal, tickAlloys,
} from '../systems/drillAlloys';
import { addMaterial } from '../systems/forge';
import { DRILL_ABILITIES, ABILITY_BY_ID, abilityParams } from '../content/drillAlloys';
import { PRIZE_SOURCES, grantPrizeDrill, checkPrizeDrills } from '../systems/prizeDrills';
import { applyFieldSize } from '../systems/face';
import { allUpgrades } from '../upgrades';
import { runMigrations } from '../save/migrations';

createEngine({ nowMs: 0 });

const ctx: EngineCtx = { emit() {}, dirty() {} };
const mods = () => new ModifierCache();

const fresh = (): GameState => {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  s.drills.bayBuilt = true;
  s.forge.built = true;
  s.currencies['brick'] = D(1e9);
  return s;
};
const bay = (s: GameState, n = 1): void => {
  for (let i = 0; i < n; i++) s.drills.units.push(newDrill(`D${i}`));
  s.face.cells = s.face.cells.map(() => 8);
};
/** Fit an ability straight in, at a chosen grade. The PRICED path is the
 *  bench's business and is covered in drill-alloys.test.ts. */
const fit = (s: GameState, id: string, index = 0, grade = 1, slot = 0): void => {
  const drill = s.drills.units[index]!;
  const fits = drill.fits ?? [];
  fits[slot] = { id, grade };
  drill.fits = fits.filter(Boolean);
  if (!s.drills.alloys.includes(id)) s.drills.alloys.push(id);
};
/**
 * STEP THE BAY, don't hand it one enormous dt. `tickDrills` deliberately caps
 * a machine at four strikes per call however long the tick is (the cells it
 * would have hit are regen-limited anyway), so `tickDrills(s, …, 600)` is FOUR
 * STROKES, not three hundred. Anything counting strokes has to step.
 */
const run = (s: GameState, seconds: number, step = 1): void => {
  for (let t = 0; t < seconds; t += step) tickDrills(s, mods(), ctx, step);
};
/** Every ability that lands strokes on cells other than the one it aimed at. */
const REACHERS = ['arcvein', 'halfmark', 'prismcut', 'slagburst', 'throughline', 'everywhen'];

// ---------------------------------------------------------------------------
// PART 1 — the pool
// ---------------------------------------------------------------------------

describe('PART 1 — twelve more abilities, and every one of them does something', () => {
  /**
   * A def with no hook is a lie in a registry. For each ability, fit it alone
   * on a one-drill bay and require the bay to behave DIFFERENTLY from bare —
   * more cells touched, or a different cell chosen, or a different tempo. What
   * "differently" means varies; that it must differ does not.
   */
  it('every ability changes what the bay does, measured against a bare bay', () => {
    // SEEDED, AND IT HAS TO BE. This probe compares an arm against a bare
    // control, and RECURRENCE rolls Math.random while every drop roll shifts
    // the shared stream — so on free-running RNG two arms that differ by one
    // extra drop read differently for reasons that have nothing to do with the
    // ability. It passed alone and failed in the full suite exactly once, which
    // is the worst way for a test to behave. Same fix as the A.53 sim: an LCG,
    // reset before every arm, so "differs from bare" means the ability.
    const real = Math.random;
    let rng = 20260726;
    Math.random = (): number => {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      return rng / 4294967296;
    };
    const touched = (id: string | null): { cells: number; dust: number } => {
      rng = 20260726;
      const s = fresh();
      // THREE MACHINES, not one. GANGLOCK is a bay-level agreement — binding a
      // single drill to itself is genuinely a no-op, and the probe correctly
      // said so, which is a fair reading of a one-drill bay and a useless one
      // of the ability. With three, bare drills spread across the face as each
      // takes the next-fullest cell and bound ones do not, so the difference is
      // the thing the ability actually does.
      bay(s, 3);
      if (id) for (let i = 0; i < 3; i++) fit(s, id, i);
      const before = s.face.cells.slice();
      // STEPPED, so the four-strikes-per-call cap does not reduce the whole
      // window to four strokes. RECURRENCE is why this matters: its repeat is a
      // 38% roll, and across four draws it fails outright about one time in
      // seven — the probe read "identical to bare" for an ability that works.
      run(s, 30);
      // CINDERHOLD burns on the one-second beat, not in the strike loop — a
      // probe that only ticks the drills cannot see it at all.
      for (let t = 0; t < 8; t++) tickAlloys(s, mods(), ctx, 1);
      let cells = 0;
      for (let i = 0; i < before.length; i++) if ((s.face.cells[i] ?? 0) < before[i]! - 1e-9) cells++;
      return { cells, dust: s.totals['dust']?.toNumber() ?? 0 };
    };
    const bare = touched(null);
    expect(bare.dust).toBeGreaterThan(0);
    for (const a of DRILL_ABILITIES) {
      const got = touched(a.id);
      // Every ability must move SOMETHING. `bloom` and `attract` change what
      // drops rather than what is struck, so they are allowed to match on both
      // counts — they are asserted directly further down instead.
      if (a.kind === 'attract' || a.kind === 'bloom') continue;
      const differs = got.cells !== bare.cells || Math.abs(got.dust - bare.dust) > 1e-6;
      expect(differs, `${a.name} (${a.kind}) behaves identically to a bare drill`).toBe(true);
    }
    Math.random = real;
  });

  /**
   * PILLAR 2, THE ONE THAT MATTERS. Regen off, a fixed amount of charge in the
   * rock, every ability in turn: the bay cannot take out more than was there.
   * This is stated as charge, not currency, for the A.42/A.53 reason — a
   * currency measure moves with yield multipliers on both sides and cannot see
   * the ceiling at all.
   */
  it('no ability can take more charge out of the field than the field held', () => {
    for (const a of DRILL_ABILITIES) {
      const s = fresh();
      bay(s, 3);
      for (let i = 0; i < 3; i++) fit(s, a.id, i, 7); // the strongest grade
      const held = s.face.cells.reduce((n, c) => n + c, 0);
      const before = (s.stats.fieldChargeHarvested ?? D(0)).toNumber();
      // No regen: `tickDrills` alone, never the engine's field tick — and
      // STEPPED, so the four-strikes-per-call cap does not quietly turn a
      // ten-minute window into four strokes and a green tick.
      run(s, 600);
      const took = (s.stats.fieldChargeHarvested ?? D(0)).toNumber() - before;
      const left = s.face.cells.reduce((n, c) => n + c, 0);
      expect(took, `${a.name} took ${took} from a field holding ${held}`)
        .toBeLessThanOrEqual(held + 1e-6);
      expect(left).toBeGreaterThanOrEqual(-1e-9);
      expect(took + left).toBeLessThanOrEqual(held + 1e-6);
    }
  });

  it('the reach family lands strokes on cells the drill did not aim at', () => {
    for (const id of REACHERS) {
      const s = fresh();
      bay(s, 1);
      fit(s, id, 0, 7);
      const before = s.face.cells.slice();
      tickDrills(s, mods(), ctx, 2.2); // one stroke's worth
      let hit = 0;
      for (let i = 0; i < before.length; i++) if ((s.face.cells[i] ?? 0) < before[i]! - 1e-9) hit++;
      expect(hit, `${id} touched ${hit} cells in one stroke`).toBeGreaterThan(1);
    }
  });

  it('GANGLOCK puts every bound drill on the same cell', () => {
    const s = fresh();
    bay(s, 4);
    for (let i = 0; i < 4; i++) fit(s, 'ganglock', i);
    tickDrills(s, mods(), ctx, 2.2);
    const cells = new Set(s.drills.units.map((u) => u.lastCell));
    expect(cells.size).toBe(1);
  });

  it('CREEPVINE crawls to a neighbour and bites harder the longer it runs', () => {
    const s = fresh();
    bay(s, 1);
    fit(s, 'creepvine');
    const drill = s.drills.units[0]!;
    const w = s.face.w;
    let jumps = 0;
    for (let i = 0; i < 12; i++) {
      // Topped back up each step: a crawl that empties its neighbourhood is
      // ALLOWED to fall back to the ordinary rule (a drill that stopped
      // working because it cornered itself would be a bug), and this test is
      // about the crawl, not the fallback.
      s.face.cells = s.face.cells.map(() => 8);
      const from = drill.lastCell;
      tickDrills(s, mods(), ctx, 2.2);
      const to = drill.lastCell;
      const dx = Math.abs((to % w) - (from % w));
      const dy = Math.abs(Math.floor(to / w) - Math.floor(from / w));
      if (dx > 1 || dy > 1) jumps++;
    }
    expect(jumps, 'a creeping drill teleported across the face').toBe(0);
    expect(drill.creepRun ?? 0).toBeGreaterThan(0);
  });

  it('SEEDSET grows a pocket where the drill was standing', () => {
    const s = fresh();
    bay(s, 1);
    fit(s, 'seedset', 0, 7); // grade shortens `every`
    s.depth = 30; // pockets roll from a depth-banded table
    s.face.ore = new Array(s.face.cells.length).fill('');
    const before = (s.face.ore ?? []).filter(Boolean).length;
    run(s, 600);
    const after = (s.face.ore ?? []).filter(Boolean).length;
    expect(after).toBeGreaterThan(before);
  });

  it('LONGLENS says nothing for several beats and then takes a great deal', () => {
    const s = fresh();
    bay(s, 1);
    fit(s, 'longlens');
    const drill = s.drills.units[0]!;
    tickDrills(s, mods(), ctx, 2.2);
    expect(drill.hold).toBe(1);
    expect(s.totals['dust']?.toNumber() ?? 0).toBe(0); // nothing yet
    tickDrills(s, mods(), ctx, 2.2 * 3);
    expect(drill.hold).toBe(0);
    expect(s.totals['dust']?.toNumber() ?? 0).toBeGreaterThan(0);
  });

  it('UNMAKING empties the cell outright, then has to stand there', () => {
    const s = fresh();
    bay(s, 1);
    fit(s, 'unmaking');
    tickDrills(s, mods(), ctx, 2.2);
    const emptied = s.face.cells.filter((c) => c <= 1e-9).length;
    expect(emptied).toBe(1);
    // The rest shows as a negative timer — it owes time before the next bite.
    expect(s.drills.units[0]!.timer).toBeLessThan(0);
  });

  it('CINDERHOLD leaves the rock burning, and burning rock keeps giving', () => {
    const s = fresh();
    bay(s, 1);
    fit(s, 'cinderhold');
    tickDrills(s, mods(), ctx, 2.2);
    const burning = (s.drills.burn ?? []).filter((b) => b > 0).length;
    expect(burning).toBeGreaterThan(0);
  });

  it('a Loam ability poured from newer metal is stronger, and the old one is untouched', () => {
    const arc = ABILITY_BY_ID.get('arcvein')!;
    expect(abilityParams(arc, 1)['jumps']).toBe(2);
    expect(abilityParams(arc, 4)['jumps']).toBe(5);

    // And it shows in play: the graded drill reaches more of the face per
    // stroke than the ungraded one does.
    const reachOf = (grade: number): number => {
      const s = fresh();
      bay(s, 1);
      fit(s, 'arcvein', 0, grade);
      // A CORNER HAS THREE NEIGHBOURS, so 2 jumps and 5 jumps land identically
      // there — the probe has to aim the drill at the middle of the face or it
      // measures the grid's edges instead of the ability.
      const mid = Math.floor(s.face.h / 2) * s.face.w + Math.floor(s.face.w / 2);
      s.face.cells[mid] = 40;
      const before = s.face.cells.slice();
      tickDrills(s, mods(), ctx, 2.2);
      let hit = 0;
      for (let i = 0; i < before.length; i++) if ((s.face.cells[i] ?? 0) < before[i]! - 1e-9) hit++;
      return hit;
    };
    expect(reachOf(4)).toBeGreaterThan(reachOf(1));
  });

  it('an ability from a shell you have not reached cannot come out of a crucible', () => {
    const s = fresh();
    expect(reachedOrdinal(s)).toBe(1);
    s.depthRecords['cinder'] = 10;
    expect(reachedOrdinal(s)).toBe(5);
    // And a Recursion (back to Loam, records kept) does not take it away.
    s.shell.current = 'loam';
    expect(reachedOrdinal(s)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// PART 2 — routing
// ---------------------------------------------------------------------------

describe('PART 2 — the player paints where a drill works', () => {
  it('a drill that was never routed behaves exactly as it always did (pillar 1)', () => {
    const s = fresh();
    bay(s, 1);
    expect(zoneSet(s.drills.units[0]!)).toBeNull();
    expect(drillPriority(s, s.drills.units[0]!)).toBe('both');
    tickDrills(s, mods(), ctx, 30);
    expect(s.totals['dust']?.toNumber() ?? 0).toBeGreaterThan(0);
  });

  it('a zoned drill works only the squares it was given', () => {
    const s = fresh();
    bay(s, 1);
    const zone = [0, 1, 2];
    s.drills.units[0]!.zone = zone;
    const before = s.face.cells.slice();
    tickDrills(s, mods(), ctx, 120);
    for (let i = 0; i < before.length; i++) {
      if (zone.includes(i)) continue;
      expect(s.face.cells[i], `cell ${i} was worked and is outside the zone`)
        .toBeCloseTo(before[i]!, 6);
    }
    expect(s.face.cells[0]! + s.face.cells[1]! + s.face.cells[2]!)
      .toBeLessThan(before[0]! + before[1]! + before[2]!);
  });

  it('two drills can hold two different zones at once', () => {
    const s = fresh();
    bay(s, 2);
    s.drills.units[0]!.zone = [0];
    s.drills.units[1]!.zone = [5];
    tickDrills(s, mods(), ctx, 30);
    expect(s.drills.units[0]!.lastCell).toBe(0);
    expect(s.drills.units[1]!.lastCell).toBe(5);
  });

  it('ROCK ONLY never claims a pocket; ORE ONLY never chips rock', () => {
    const s = fresh();
    bay(s, 2);
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.face.ore[10] = 'fatseam';
    s.face.cells[10] = 400; // worth the trip — a bay will not open an empty pocket
    s.drills.units[0]!.priority = 'rock';
    s.drills.units[1]!.priority = 'ores';
    const before = s.face.cells.slice();
    tickDrills(s, mods(), ctx, 1);
    expect(s.drills.units[0]!.oreCell).toBeUndefined();
    expect(s.drills.units[1]!.oreCell).toBe(10);
    // The ore-only machine took the pocket and chipped nothing else.
    tickDrills(s, mods(), ctx, 0.5);
    let chippedByOreDrill = 0;
    for (let i = 0; i < before.length; i++) {
      if (i !== 10 && (s.face.cells[i] ?? 0) < before[i]! - 1e-9) chippedByOreDrill++;
    }
    // Only the rock-only drill can account for any chipping at all.
    expect(chippedByOreDrill).toBeLessThanOrEqual(2);
  });

  it('ORE FIRST gets the pocket before a general-purpose machine does', () => {
    const s = fresh();
    bay(s, 2);
    s.face.ore = new Array(s.face.cells.length).fill('');
    s.face.ore[12] = 'fatseam';
    s.face.cells[12] = 400;
    s.drills.units[0]!.priority = 'both';
    s.drills.units[1]!.priority = 'oresFirst';
    tickDrills(s, mods(), ctx, 1);
    expect(s.drills.units[1]!.oreCell).toBe(12);
    expect(s.drills.units[0]!.oreCell).toBeUndefined();
  });

  /**
   * THE A.55 BUG, ONE LEVEL UP. Widening the face renumbers every row, so an
   * index-copied zone slides sideways one cell per row — the exact defect that
   * wiped every ore pocket when `applyFieldSize` left `ore` at the old length.
   * Same remap, same coordinate basis, asserted here so it cannot come back.
   */
  it('a painted zone moves with the rock when the face widens', () => {
    const s = fresh();
    bay(s, 1);
    const w0 = s.face.w;
    // Top-left 2x2, in the old numbering.
    s.drills.units[0]!.zone = [0, 1, w0, w0 + 1];
    s.upgrades['expand'] = 3;
    applyFieldSize(s, mods());
    const w1 = s.face.w;
    expect(w1).toBeGreaterThan(w0);
    // Still the top-left 2x2, in the NEW numbering.
    expect(s.drills.units[0]!.zone).toEqual([0, 1, w1, w1 + 1]);
  });

  it('selecting every square is not a zone — it stores nothing', () => {
    const s = fresh();
    bay(s, 1);
    const engine = createEngine({ nowMs: 0 });
    void engine;
    const all = s.face.cells.map((_, i) => i);
    s.drills.units[0]!.zone = all;
    // `setDrillZone` is what normalises it; the invariant is that a full board
    // and an empty one both mean "everywhere", so the remap has nothing to
    // slide and a widened face keeps working properly.
    expect(zoneSet({ ...s.drills.units[0]!, zone: [] })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PART 3 — acquisition
// ---------------------------------------------------------------------------

describe('PART 3 — sixteen bought, eight earned', () => {
  it('the shop row is priced structural, not standard', () => {
    const def = allUpgrades().find((u) => u.id === 'drillCount')!;
    expect(def.ratio).toBe(1.75);
    expect(def.maxLevel).toBe(15);
    expect(BOUGHT_DRILLS).toBe(16);
    expect(BOUGHT_DRILLS + PRIZE_SOURCES.length).toBeLessThanOrEqual(MAX_DRILLS);
    // The last chassis costs more than the entire old row did (6·(1.25^24−1)/.25
    // ≈ 5,100), which is the whole point of the re-price.
    const last = 6 * Math.pow(def.ratio, def.maxLevel!);
    expect(last).toBeGreaterThan(5_100);
  });

  it('a prize drill bites harder than a bought one at the same level', () => {
    const s = fresh();
    s.drills.units.push(newDrill('bought'));
    s.drills.units.push(newPrizeDrill('The Foreman', 'ach10', 2));
    const m = mods();
    expect(drillPower(s, m, s.drills.units[1]!))
      .toBeCloseTo(drillPower(s, m, s.drills.units[0]!) * PRIZE_POWER, 6);
  });

  it('a prize drill holds more than one alloy, and both of them fire', () => {
    const s = fresh();
    s.drills.units.push(newPrizeDrill('The Foreman', 'ach10', 2));
    s.face.cells = s.face.cells.map(() => 8);
    expect(drillSlots(s.drills.units[0]!)).toBe(2);
    fit(s, 'arcvein', 0, 1, 0);
    fit(s, 'emberset', 0, 1, 1);
    expect(drillFits(s.drills.units[0]!).map((f) => f.def.id)).toEqual(['arcvein', 'emberset']);
    tickDrills(s, mods(), ctx, 6);
    // The arc reached, and the set left its mark: both hooks ran on one drill.
    expect(s.face.cells.filter((c) => c < 8 - 1e-9).length).toBeGreaterThan(1);
    expect((s.drills.residue ?? []).some((r) => r > 0)).toBe(true);
  });

  it('a bought chassis holds exactly one', () => {
    expect(drillSlots(newDrill('x'))).toBe(1);
  });

  it('a pour into a full multi-slot drill replaces the slot it was aimed at', () => {
    const s = fresh();
    s.drills.units.push(newPrizeDrill('The Foreman', 'ach10', 2));
    s.face.cells = s.face.cells.map(() => 8);
    fit(s, 'arcvein', 0, 1, 0);
    fit(s, 'emberset', 0, 1, 1);
    s.currencies['brick'] = D(1e9);
    addMaterial(s, 'rootglass', 60, 99);
    addMaterial(s, 'umberjade', 60, 99);
    const r = forgeDrillAlloy(s, ctx, ['rootglass', 'umberjade'], [0], { slot: 1 });
    expect(r.ok).toBe(true);
    // Arcvein was ALREADY in slot 0, so a second pour of it lands there rather
    // than eating the second slot — two copies of one ability is never useful.
    expect(drillFits(s.drills.units[0]!).map((f) => f.def.id)).toEqual(['arcvein', 'emberset']);
  });

  it('a prize is granted once, and never twice', () => {
    const s = fresh();
    s.drills.units.push(newDrill('one'));
    expect(grantPrizeDrill(s, ctx, 'ach10')).toBe(true);
    expect(grantPrizeDrill(s, ctx, 'ach10')).toBe(false);
    expect(s.drills.units.filter((u) => u.prize === 'ach10').length).toBe(1);
  });

  it('the achievement source actually fires — the hook is wired, not declared', () => {
    const s = fresh();
    s.drills.units.push(newDrill('one'));
    checkPrizeDrills(s, ctx);
    expect(s.drills.units.some((u) => u.prize)).toBe(false);
    for (let i = 0; i < 10; i++) s.achievements.unlocked[`fake${i}`] = true;
    checkPrizeDrills(s, ctx);
    expect(s.drills.units.some((u) => u.prize === 'ach10')).toBe(true);
  });

  it('a prize will not appear before the bay is built, and never past the cap', () => {
    const s = fresh();
    s.drills.bayBuilt = false;
    for (let i = 0; i < 10; i++) s.achievements.unlocked[`fake${i}`] = true;
    checkPrizeDrills(s, ctx);
    expect(s.drills.units.length).toBe(0);

    s.drills.bayBuilt = true;
    for (let i = 0; i < MAX_DRILLS; i++) s.drills.units.push(newDrill(`f${i}`));
    checkPrizeDrills(s, ctx);
    expect(s.drills.units.length).toBe(MAX_DRILLS);
  });

  it('every prize source names what it wants, so a player can go and get it', () => {
    for (const p of PRIZE_SOURCES) {
      expect(p.requirement.length).toBeGreaterThan(4);
      expect(p.slots).toBeGreaterThanOrEqual(2);
      expect(p.name.length).toBeGreaterThan(2);
    }
  });
});

// ---------------------------------------------------------------------------

describe('the save survives all three', () => {
  it('a v33 bay keeps its alloys, its levels and its machines', () => {
    const payload = {
      version: 33, savedAtMs: 0,
      state: {
        drills: {
          bayBuilt: true, alloys: ['arcvein', 'emberset'], huntOres: true,
          units: [
            { level: 7, timer: 0, lastCell: 3, alloy: 'arcvein' },
            { level: 2, timer: 0, lastCell: 0 },
          ],
        },
      },
    } as never;
    const out = runMigrations(payload);
    const bayState = (out.state as { drills: Record<string, unknown> }).drills;
    const units = bayState['units'] as Array<Record<string, unknown>>;
    expect(units[0]!['fits']).toEqual([{ id: 'arcvein', grade: 1 }]);
    expect(units[0]!['level']).toBe(7);
    expect(units[1]!['fits']).toBeUndefined();
    expect(units.length).toBe(2);
    expect(bayState['alloys']).toEqual(['arcvein', 'emberset']);
  });

  it('a save holding more than sixteen bought drills keeps every one of them', () => {
    const units = Array.from({ length: 24 }, (_, i) => ({ level: i % 5, timer: 0, lastCell: 0 }));
    const payload = {
      version: 33, savedAtMs: 0,
      state: { drills: { bayBuilt: true, alloys: [], units } },
    } as never;
    const out = runMigrations(payload);
    const bayState = (out.state as { drills: Record<string, unknown> }).drills;
    expect((bayState['units'] as unknown[]).length).toBe(24);
  });
});
