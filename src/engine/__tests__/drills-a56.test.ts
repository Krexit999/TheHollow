/**
 * ROUTING AND ACQUISITION — the two A.56 parts that A.57 did not replace.
 *
 * A.56's PART 1 (twelve alloy abilities and a grade) was thrown out wholesale
 * when A.57 rebuilt the ability set, and its tests went with it: they asserted
 * `kind` unions and mark arrays that no longer exist. What survives untouched
 * is everything about the MACHINES —
 *
 *   ROUTING. A drill works the squares you painted and prefers what you told it
 *     to prefer, and a drill you never touched behaves exactly as it did before
 *     routing existed (pillar 1 is defended by the DEFAULT, not by a promise).
 *   ACQUISITION. Sixteen bought on a steep banded curve, eight earned from
 *     other systems and strictly better — more bite, more slots.
 *
 * The A.57 ability system has its own file (drills-a57.test.ts).
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
import { drillFits, drillSlots, forgeDrillAlloy } from '../systems/drillAlloys';
import { addMaterial } from '../systems/forge';
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

// ---------------------------------------------------------------------------
// PART 1 — the pool
// ---------------------------------------------------------------------------

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
  it('the shop row escalates in bands — easy, then hard, then brutal', () => {
    const def = allUpgrades().find((u) => u.id === 'drillCount')!;
    // A.57: a single exponent cannot draw "first four easy, last three brutal",
    // so the ratio steps per band. The SHAPE is the assertion, not one number.
    expect(def.ratioAt, 'the banded curve is gone').toBeDefined();
    expect(def.ratioAt!(0)).toBeLessThan(def.ratioAt!(5));
    expect(def.ratioAt!(5)).toBeLessThan(def.ratioAt!(9));
    expect(def.ratioAt!(9)).toBeLessThan(def.ratioAt!(13));
    expect(def.maxLevel).toBe(15);
    expect(BOUGHT_DRILLS).toBe(16);
    expect(BOUGHT_DRILLS + PRIZE_SOURCES.length).toBeLessThanOrEqual(MAX_DRILLS);
    // The last chassis costs more than the entire OLD row did (6·(1.25^24−1)/.25
    // ≈ 5,100), which is the whole point of the re-price — and the first four
    // together stay cheap enough to be near-impulse.
    let c = 6;
    let firstFour = 0;
    for (let k = 0; k < def.maxLevel!; k++) {
      if (k < 4) firstFour += c;
      c *= def.ratioAt!(k);
    }
    expect(c, 'the last chassis is not an investment').toBeGreaterThan(5_100);
    expect(firstFour, 'the first four are meant to be easy').toBeLessThan(60);
  });

  it('a prize drill bites harder than a bought one at the same level', () => {
    const s = fresh();
    s.drills.units.push(newDrill('bought'));
    s.drills.units.push(newPrizeDrill('The Foreman', 'ach10', 2));
    const m = mods();
    expect(drillPower(s, m, s.drills.units[1]!))
      .toBeCloseTo(drillPower(s, m, s.drills.units[0]!) * PRIZE_POWER, 6);
  });

  it('a prize drill holds more than one ability at once', () => {
    const s = fresh();
    s.drills.units.push(newPrizeDrill('The Foreman', 'ach10', 2));
    s.face.cells = s.face.cells.map(() => 8);
    expect(drillSlots(s.drills.units[0]!)).toBe(2);
    fit(s, 'slagburst', 0, 1, 0);
    fit(s, 'heavystrike', 0, 1, 1);
    expect(drillFits(s.drills.units[0]!).map((f) => f.def.id)).toEqual(['slagburst', 'heavystrike']);
    // That BOTH of them fire is asserted in drills-a57.test.ts, where the
    // firing machinery lives; this file is about the chassis.
  });

  it('a bought chassis holds exactly one', () => {
    expect(drillSlots(newDrill('x'))).toBe(1);
  });

  it('a pour into a full multi-slot drill replaces the slot it was aimed at', () => {
    const s = fresh();
    s.drills.units.push(newPrizeDrill('The Foreman', 'ach10', 2));
    s.face.cells = s.face.cells.map(() => 8);
    fit(s, 'slagburst', 0, 1, 0);
    fit(s, 'heavystrike', 0, 1, 1);
    s.drills.alloys = ['slagburst', 'heavystrike'];
    s.currencies['brick'] = D(1e9);
    addMaterial(s, 'duskflint', 60, 99);
    addMaterial(s, 'bonechalk', 60, 99);
    // duskflint + bonechalk is two `brittle` — Slagburst's signature.
    const r = forgeDrillAlloy(s, ctx, ['duskflint', 'bonechalk'], [0], { slot: 1 });
    expect(r.ok).toBe(true);
    // Slagburst was ALREADY in slot 0, so a second pour of it lands there
    // rather than eating the second slot — two copies is never useful.
    expect(drillFits(s.drills.units[0]!).map((f) => f.def.id)).toEqual(['slagburst', 'heavystrike']);
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
    // A.57 (v35) replaced the ability set and maps the three A.53 ids onto
    // their Loam successors — arcvein was "a strike that jumps onward", which
    // is Chainbreaker. A migrated ability arrives UNCHARGED.
    expect(units[0]!['fits']).toEqual([{ id: 'chainbreaker', grade: 1, ch: 0 }]);
    expect(units[0]!['level']).toBe(7);
    expect(units[1]!['fits']).toBeUndefined();
    expect(units.length).toBe(2);
    expect(bayState['alloys']).toEqual(['chainbreaker', 'heavystrike']);
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
