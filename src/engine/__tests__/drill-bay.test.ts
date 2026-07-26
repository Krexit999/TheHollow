/**
 * A.52 — THE DRILL BAY AS A PUZZLE.
 *
 * The bay was "pick the best material, clone it across 24": a lookup with a buy
 * button. Four mechanisms replace it, and the tests that matter are not that
 * each one computes — it is that each one leaves value on the table WITHOUT
 * ever taking output away, because that is the whole of pillar 1 for an idle
 * system. A budget that blocks, a grain that stops a bit, a fit that zeroes a
 * head, or a synergy that is required would each be a pillar break dressed as
 * depth.
 *
 * So every mechanism here is asserted twice: that it does something, and that
 * its worst case is still a working drill.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { EngineCtx, GameState } from '../types';
import { D } from '../decimal';
import {
  BAY_BASE_SUPPLY, BAY_SUPPLY_PER_LEVEL, BROWNOUT_FLOOR,
  baySupply, bayDraw, bayLoadFactor,
  GRAIN_SETTLE, GRAIN_LOW, GRAIN_HIGH, bitGrainMult, grainShare, grainWork, recutBit, recutCost,
  readSeam, seamOf, headFit, bayStaleness, FIT_LOW, FIT_HIGH,
  BAY_SYNERGIES, activeSynergies, noteSynergies, synergyBonus,
  newDrill, drillPower, tickDrills, MAX_DRILLS,
} from '../systems/drills';
import { drillDraw, DRILL_HEADS } from '../content/drillParts';
import { ModifierCache } from '../modifiers';

const ctx: EngineCtx = { emit() {}, dirty() {} };
const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.drills.bayBuilt = true;
  return { engine, s };
};
const addDrill = (s: GameState, over: Partial<GameState['drills']['units'][number]> = {}) => {
  const d = { ...newDrill('D'), ...over };
  s.drills.units.push(d);
  return d;
};
const mods = () => new ModifierCache();

// ---------------------------------------------------------------------------

describe('1 — the feed is one shared budget', () => {
  it('a bare chassis draws exactly one, so the opening bay is legible', () => {
    const { s } = fresh();
    const d = addDrill(s);
    expect(drillDraw(d)).toBeCloseTo(1, 6);
    expect(baySupply(s)).toBe(BAY_BASE_SUPPLY);
  });

  it('a heavier head and a levelled chassis draw more', () => {
    const { s } = fresh();
    const plain = addDrill(s, { head: 'harrow' });
    const heavy = addDrill(s, { head: 'maul' });
    expect(drillDraw(heavy)).toBeGreaterThan(drillDraw(plain));
    heavy.level = 10;
    const atTen = drillDraw(heavy);
    heavy.level = 20;
    expect(drillDraw(heavy)).toBeGreaterThan(atTen);
  });

  /** The load-bearing one: you cannot give every drill the good gear. */
  it('over-drawing the feed browns the WHOLE bay out, proportionally', () => {
    const { s } = fresh();
    for (let i = 0; i < 6; i++) addDrill(s);            // draw 6, supply 6
    expect(bayDraw(s)).toBeCloseTo(6, 6);
    expect(bayLoadFactor(s)).toBe(1);

    for (const d of s.drills.units) d.head = 'maul';    // draw 9.9 against 6
    expect(bayDraw(s)).toBeGreaterThan(baySupply(s));
    expect(bayLoadFactor(s)).toBeLessThan(1);
  });

  it('buying feed is what lifts the ceiling on the arrangement', () => {
    const { s } = fresh();
    for (let i = 0; i < 6; i++) addDrill(s, { head: 'maul' });
    expect(bayLoadFactor(s)).toBeLessThan(1);
    s.drills.supply = 3;
    expect(baySupply(s)).toBe(BAY_BASE_SUPPLY + 3 * BAY_SUPPLY_PER_LEVEL);
    expect(bayLoadFactor(s)).toBe(1);
  });

  /** PILLAR 1: a budget that can STOP a drill is a blocker, not a puzzle. */
  it('never stops a drill however badly it is over-committed', () => {
    const { s } = fresh();
    for (let i = 0; i < MAX_DRILLS; i++) addDrill(s, { head: 'maul', level: 25 });
    expect(bayDraw(s)).toBeGreaterThan(baySupply(s) * 5);
    expect(bayLoadFactor(s)).toBe(BROWNOUT_FLOOR);
    expect(drillPower(s, mods(), s.drills.units[0]!)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

describe('2 — a bit takes the shape of the rock it works', () => {
  const bitted = (s: GameState, grain?: Record<string, number>) =>
    addDrill(s, { head: 'auger', bit: { materialId: 'marl', purity: 50, ...(grain ? { grain } : {}) } });

  it('is exactly neutral until it has done enough work to take a shape', () => {
    const { s } = fresh();
    const d = bitted(s, { loam: GRAIN_SETTLE - 1 });
    expect(bitGrainMult(d, 'loam')).toBe(1);
    d.bit!.grain = { loam: GRAIN_SETTLE };
    expect(bitGrainMult(d, 'loam')).toBeCloseTo(GRAIN_HIGH, 6);
  });

  /** The decision the mechanism exists to produce: the same bit, two worlds. */
  it('sharpens for the world it worked and dulls for the one it did not', () => {
    const { s } = fresh();
    const d = bitted(s, { loam: 10_000 });
    expect(bitGrainMult(d, 'loam')).toBeCloseTo(GRAIN_HIGH, 6);
    expect(bitGrainMult(d, 'ferrite')).toBeCloseTo(GRAIN_LOW, 6);
    expect(grainShare(d.bit!, 'loam')).toBe(1);
  });

  it('a mixed history sits between the two, in proportion', () => {
    const { s } = fresh();
    const d = bitted(s, { loam: 5000, ferrite: 5000 });
    expect(bitGrainMult(d, 'loam')).toBeCloseTo((GRAIN_LOW + GRAIN_HIGH) / 2, 6);
  });

  it('strikes actually write the grain — it is not a stat you set', () => {
    const { s } = fresh();
    const d = bitted(s);
    s.face.cells = s.face.cells.map(() => 8);
    tickDrills(s, mods(), ctx, 40);
    expect(grainWork(d.bit!)).toBeGreaterThan(0);
    expect(Object.keys(d.bit!.grain!)).toContain('loam');
  });

  describe('the re-cut', () => {
    it('grinds it flat, and is paid in the shell\'s own currency', () => {
      const { s } = fresh();
      const d = bitted(s, { ferrite: 20_000 });
      expect(bitGrainMult(d, 'loam')).toBeCloseTo(GRAIN_LOW, 6);

      s.currencies['brick'] = D(0);
      expect(recutBit(s, 0).ok).toBe(false);       // and says what it wants
      s.currencies['brick'] = D(recutCost(d));
      expect(recutBit(s, 0).ok).toBe(true);
      expect(bitGrainMult(d, 'loam')).toBe(1);     // flat, not sharpened
      expect(s.currencies['brick']!.toNumber()).toBe(0);
    });

    it('refuses a bit that has not taken a shape yet — there is nothing to grind', () => {
      const { s } = fresh();
      bitted(s, { loam: 10 });
      s.currencies['brick'] = D(9999);
      expect(recutBit(s, 0).ok).toBe(false);
    });
  });

  /** PILLAR 1: the worst possible grain is still a working bit. */
  it('a wrong-shaped bit is a penalty, never a stop', () => {
    const { s } = fresh();
    const d = bitted(s, { ferrite: 999_999 });
    expect(bitGrainMult(d, 'loam')).toBe(GRAIN_LOW);
    expect(GRAIN_LOW).toBeGreaterThan(0.5);
    expect(drillPower(s, mods(), d)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

describe('3 — the face turns the seam under a bay nobody touched', () => {
  const evenFace = (s: GameState) => { s.face.cells = s.face.cells.map(() => 8); };
  const spikeFace = (s: GameState) => { s.face.cells = s.face.cells.map((_, i) => (i === 0 ? 8 : 0.05)); };

  it('reads a real difference between an even face and a spiked one', () => {
    const { s } = fresh();
    evenFace(s);
    const even = readSeam(s);
    spikeFace(s);
    const spike = readSeam(s);
    expect(even.spread).toBeGreaterThan(0.9);
    expect(spike.spread).toBeLessThan(0.2);
  });

  it('hardness is depth, so descending alone turns it', () => {
    const { s } = fresh();
    s.depth = 0;
    expect(readSeam(s).hardness).toBe(0);
    s.depth = 150;
    expect(readSeam(s).hardness).toBeGreaterThan(0.5);
  });

  /** Verdance's signature turns the seam with no special case: a vined cell is
   *  one a drill will not work, so it is one the reading does not count. */
  it('vined cells are excluded, so Growth changes the reading', () => {
    const { s } = fresh();
    s.face.cells = s.face.cells.map((_, i) => (i === 0 ? 8 : 1));
    const before = readSeam(s).spread;
    s.growth.stage = s.face.cells.map((_, i) => (i === 0 ? 1 : 0)); // vine the spike
    expect(readSeam(s).spread).toBeGreaterThan(before);
  });

  it('a head suits some rock and not other rock, and is never zeroed', () => {
    const { s } = fresh();
    evenFace(s);
    s.depth = 0;
    const soft = readSeam(s);
    spikeFace(s);
    s.depth = 150;
    const hard = readSeam(s);
    // The harrow wants an even, shallow face; the maul wants deep and spiked.
    expect(headFit('harrow', soft)).toBeGreaterThan(headFit('maul', soft));
    expect(headFit('maul', hard)).toBeGreaterThan(headFit('harrow', hard));
    for (const h of DRILL_HEADS) {
      for (const seam of [soft, hard]) {
        expect(headFit(h.id, seam)).toBeGreaterThanOrEqual(FIT_LOW);
        expect(headFit(h.id, seam)).toBeLessThanOrEqual(FIT_HIGH);
      }
    }
  });

  it('says how much a re-solve is worth, and says nothing when the bay is right', () => {
    const { s } = fresh();
    evenFace(s);
    s.depth = 0;
    s.drills.seam = readSeam(s);
    for (let i = 0; i < 4; i++) addDrill(s, { head: 'maul' });   // the wrong head here
    expect(bayStaleness(s).gain).toBeGreaterThan(0.05);
    for (const d of s.drills.units) d.head = 'harrow';           // the right one
    expect(bayStaleness(s).gain).toBeLessThan(0.02);
  });

  /** PILLAR 1: an unconfigured drill is never punished for being unconfigured. */
  it('a drill with no head is fitted at exactly neutral', () => {
    const { s } = fresh();
    spikeFace(s);
    expect(headFit(undefined, readSeam(s))).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('4 — arrangements the whole bay makes, found not listed', () => {
  it('every synergy pays into a real bucket and none of them is income', () => {
    for (const syn of BAY_SYNERGIES) {
      expect(['drillPower', 'drillSpeed', 'dropRate']).toContain(syn.bucket);
      expect(syn.bonus).toBeGreaterThan(0);
    }
  });

  it('THE CHAIN GANG wants three of one head — two is not a bay', () => {
    const { s } = fresh();
    for (let i = 0; i < 2; i++) addDrill(s, { head: 'seeker' });
    expect(activeSynergies(s).map((x) => x.id)).not.toContain('chainGang');
    addDrill(s, { head: 'seeker' });
    expect(activeSynergies(s).map((x) => x.id)).toContain('chainGang');
    expect(synergyBonus(s, 'drillSpeed')).toBeGreaterThan(0);
  });

  it('THE FULL SPREAD wants one of every hunt — a cloned fleet can never have it', () => {
    const { s } = fresh();
    for (const h of ['auger', 'harrow', 'scatter']) addDrill(s, { head: h });
    expect(activeSynergies(s).map((x) => x.id)).not.toContain('theSpread');
    addDrill(s, { head: 'seeker' });
    expect(activeSynergies(s).map((x) => x.id)).toContain('theSpread');
  });

  it('THE DEEP CUT reads the grain, so it is earned by working, not by fitting', () => {
    const { s } = fresh();
    for (let i = 0; i < 3; i++) {
      addDrill(s, { head: 'auger', bit: { materialId: 'marl', purity: 50, grain: { ferrite: 10_000 } } });
    }
    expect(activeSynergies(s).map((x) => x.id)).not.toContain('deepCut');
    for (const d of s.drills.units) d.bit!.grain = { loam: 10_000 };
    expect(activeSynergies(s).map((x) => x.id)).toContain('deepCut');
  });

  it('THE QUIET BAY pays for headroom, which is the opposite of maxing everything', () => {
    const { s } = fresh();
    s.drills.supply = 2;                                  // feed 12
    for (let i = 0; i < 6; i++) addDrill(s);              // draw 6, well under 70%
    expect(activeSynergies(s).map((x) => x.id)).toContain('quietBay');
    for (const d of s.drills.units) { d.head = 'maul'; d.level = 25; }  // draw ~22
    expect(bayDraw(s)).toBeGreaterThan(baySupply(s) * 0.7);
    expect(activeSynergies(s).map((x) => x.id)).not.toContain('quietBay');
  });

  /** PILLAR 5: nothing is written down before it has actually happened. */
  it('is recorded only once it fires, and the bonus does not wait for the record', () => {
    const { s } = fresh();
    for (let i = 0; i < 3; i++) addDrill(s, { head: 'seeker' });
    expect(s.drills.synergiesFound).toEqual([]);
    expect(synergyBonus(s, 'drillSpeed')).toBeGreaterThan(0);   // paid immediately
    noteSynergies(s, ctx);
    expect(s.drills.synergiesFound).toContain('chainGang');
  });

  it('the record is kept even when the arrangement is taken apart', () => {
    const { s } = fresh();
    for (let i = 0; i < 3; i++) addDrill(s, { head: 'seeker' });
    noteSynergies(s, ctx);
    s.drills.units = [];
    expect(activeSynergies(s)).toHaveLength(0);
    expect(s.drills.synergiesFound).toContain('chainGang');
  });
});

// ---------------------------------------------------------------------------

describe('the pillars, over all four at once', () => {
  /**
   * PILLAR 1. The player who never opens this panel: no feed bought, no heads,
   * no bits, nothing arranged. Every mechanism is at its worst simultaneously,
   * and the bay must still be a working bay.
   */
  it('a bay nobody has ever touched still produces', () => {
    const { s } = fresh();
    for (let i = 0; i < 8; i++) addDrill(s);
    s.face.cells = s.face.cells.map(() => 8);
    s.depth = 120;
    s.drills.seam = readSeam(s);

    expect(s.drills.supply).toBe(0);
    expect(activeSynergies(s)).toHaveLength(0);
    for (const d of s.drills.units) {
      expect(d.head).toBeUndefined();
      expect(drillPower(s, mods(), d)).toBeGreaterThan(0);
    }
    const before = s.currencies['dust']?.toNumber() ?? 0;
    tickDrills(s, mods(), ctx, 30);
    expect((s.currencies['dust']?.toNumber() ?? 0)).toBeGreaterThan(before);
  });

  /** And solving it is worth REAL money, or the puzzle is decoration. */
  it('a solved bay genuinely out-produces an untouched one', () => {
    const build = (solve: boolean) => {
      const { s } = fresh();
      s.face.cells = s.face.cells.map(() => 8);
      s.depth = 5;                       // shallow + even → the harrow's rock
      for (let i = 0; i < 6; i++) {
        addDrill(s, solve ? { head: 'harrow' } : { head: 'maul' });
      }
      if (solve) s.drills.supply = 4;    // fed, so no brownout
      s.drills.seam = readSeam(s);
      return s;
    };
    const lazy = build(false);
    const solved = build(true);
    const power = (s: GameState) => s.drills.units
      .reduce((sum, d) => sum + drillPower(s, mods(), d), 0);
    expect(power(solved)).toBeGreaterThan(power(lazy) * 1.2);
  });

  /**
   * PILLAR 2. Nothing the bay does may touch the ceiling. Every term is either
   * drillPower/drillSpeed (how fast it REACHES the ceiling) or dropRate (not
   * income at all) — asserted structurally so a future synergy cannot smuggle
   * a dustYield line in.
   */
  it('nothing here can lift the regen ceiling', () => {
    for (const syn of BAY_SYNERGIES) {
      expect(syn.bucket).not.toBe('dustYield');
      expect(syn.bucket).not.toBe('regen');
      expect(syn.bucket).not.toBe('cap');
    }
  });

  it('the seam is a cache of a pure read, so it can never drift from the face', () => {
    const { s } = fresh();
    s.face.cells = s.face.cells.map(() => 8);
    const a = readSeam(s);
    const b = readSeam(s);
    expect(a).toEqual({ ...b, at: a.at });
    s.drills.seam = a;
    expect(seamOf(s)).toBe(a);
  });
});
