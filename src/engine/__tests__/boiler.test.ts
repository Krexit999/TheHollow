/**
 * THE BOILER AND THE VENT ARRAY — Cinder's plant, and the control over it.
 *
 * §0 is the measurement that decided what these are: §3.2 gives every shell its
 * own power plant with its own shape, and all seven shells ran the same one.
 *
 * §5 is the one that matters most. `pressure.ts` is a LOCKED signature, so the
 * tests that carry the most weight here are the ones asserting the four laws
 * still read exactly as they did — a power system that quietly loosened the
 * flood guarantees would be the worst thing this pass could ship.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import { ensureContentLoaded } from '../content';
import { ModifierCache } from '../modifiers';
import { markReached } from '../systems/roll';
import { MAX_MACHINE_TIER, HEARTH_FLOOR, SURGE_FLOOR, ensurePlant, flowCap, surgeCap, tierOf } from '../systems/plant';
import {
  BOILER_FLOOR, TIER_CAPABILITY_BOILER, bankGrowsWithHeat, boilerBuilt, boilerFound,
  boilerRead, boilerStation, buildBoiler, riskedHeat, sustainGrowsWithRisk,
} from '../systems/boiler';
import {
  TIER_CAPABILITY_VENTS, VALVE_VENT, answerKlaxon, answersTheKlaxon,
  choosesTheLine, setHoldLine, setValve, valveBlocker, valveSlots, ventArrayBuilt,
  resetVentRun,
} from '../systems/vents';
import {
  CARRY_HEAT_CAP, GOVERNOR_MAX, HOLD_LINE_BASE, HOLD_LINE_MAX, IDLE_GRACE_SEC,
  heatCeiling, holdLine, networkCapacity, ventRate,
} from '../systems/pressure';
import { dpsMax } from '../systems/face';
import { PART_TYPES } from '../content/forgeParts';
import { makePart } from '../systems/forgeParts';
import { allShells } from '../shells';
import { runFaceTick } from '../signatures';
import { demandOf } from '../systems/plant';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx = (): EngineCtx => ({ dirty: () => {}, emit: () => {} }) as unknown as EngineCtx;

function fresh(): GameState {
  return createEngine({ nowMs: 0 }).getState() as GameState;
}

/** A player standing in Cinder, having walked past both wrecks. */
function inCinder(boiler = 0, vents = 0): GameState {
  const s = fresh();
  s.shell.current = 'cinder';
  for (const shell of allShells()) s.depthRecords[shell.id] = 500;
  markReached(s, 300, 15);
  s.kiln.built = true;
  s.kiln.heat = 40;
  const p = ensurePlant(s);
  if (boiler > 0) p.tiers['boiler'] = boiler;
  if (vents > 0) p.tiers['vents'] = vents;
  s.casting.rack = PART_TYPES.map((t, i) => ({ ...makePart(t, 'marl', 40), id: 500 + i })) as never;
  return s;
}

describe('§0 — THE MEASUREMENT: §3.2 gave every shell a plant and none had one', () => {
  it('the Hearth powered all seven shells, and still powers the six without a machine', () => {
    const s = fresh();
    s.kiln.built = true;
    s.kiln.heat = 0;
    const shapes: Record<string, number> = {};
    for (const shell of allShells()) {
      s.shell.current = shell.id;
      shapes[shell.id] = flowCap(s);
    }
    /**
     * A.96 FINISHED THE TABLE, so this reads the finished one.
     *
     * THREE shells still read the Hearth for FLOW, and each for a stated
     * reason: Loam's shape IS the Hearth; Ferrite's shape is the COIL, which
     * is pure Surge (§3.2) and says nothing about sustain; and Aleph has no
     * shape in §3.2's table at all.
     */
    for (const id of ['loam', 'ferrite', 'aleph']) {
      expect(shapes[id], `${id} stopped reading the Hearth`).toBe(HEARTH_FLOOR);
    }
    // Cinder is dead without its machine (§13); the other three have their own.
    expect(shapes['cinder']).toBe(0);
    expect(shapes['verdance'], 'the Bloom did not take Verdance').toBe(HEARTH_FLOOR);
    expect(shapes['glassmere'], 'Glassmere without a Prism has no plant').toBe(0);
    expect(shapes['hollow'], 'the Null did not take the Hollow').toBe(HEARTH_FLOOR);
  });

  it('A LOAM PLANT IS BIT-IDENTICAL — a hot Kiln, unchanged arithmetic', () => {
    const s = fresh();
    s.kiln.built = true;
    s.kiln.heat = 1;
    expect(flowCap(s)).toBe(HEARTH_FLOOR + 2.5);
    expect(surgeCap(s)).toBe(SURGE_FLOOR);
  });
});

describe('§1 — the Boiler IS Cinder\'s plant', () => {
  it('§13, literally: without one, the shell has no Flow at all', () => {
    const s = inCinder(0);
    expect(s.kiln.built, 'the Kiln is standing and it does not matter').toBe(true);
    expect(s.kiln.heat).toBe(40);
    expect(flowCap(s)).toBe(0);
    expect(boilerBuilt(s)).toBe(false);
  });

  it('and with one, the shell opens on no worse a plant than Loam does', () => {
    const s = inCinder(1);
    expect(flowCap(s)).toBe(BOILER_FLOOR);
    expect(BOILER_FLOOR).toBe(HEARTH_FLOOR);
  });

  it('found by walking in, built from cast parts, never bought', () => {
    const s = fresh();
    s.shell.current = 'cinder';
    expect(boilerFound(s)).toBe(false);
    expect(buildBoiler(s, ctx()).ok).toBe(false);
    markReached(s, boilerStation()!.depth, 15);
    expect(boilerFound(s)).toBe(true);
    expect(buildBoiler(s, ctx()).ok, 'built with an empty rack').toBe(false);
    s.casting.rack = PART_TYPES.map((t, i) => ({ ...makePart(t, 'marl', 40), id: i + 1 })) as never;
    expect(buildBoiler(s, ctx()).ok).toBe(true);
    expect(tierOf(s, 'boiler')).toBe(1);
    expect(s.plant!.builtOf!['boiler']).toBeDefined();
  });

  it('the wreck is the one Cinder was authored with — nothing new was written', () => {
    const at = boilerStation()!;
    expect([at.shellId, at.depth, at.name]).toEqual(['cinder', 40, 'Boilerworks']);
  });
});

describe('§2 — three tiers, three sentences', () => {
  let s: GameState;
  beforeEach(() => { s = inCinder(1); });

  it('I lights it and nothing more: heat buys no burst yet', () => {
    s.pressure.heat = 80;
    expect(bankGrowsWithHeat(s)).toBe(false);
    expect(surgeCap(s)).toBe(SURGE_FLOOR);
    expect(flowCap(s)).toBe(BOILER_FLOOR);
  });

  it('II — the burst grows with the gauge (§3.2)', () => {
    ensurePlant(s).tiers['boiler'] = 2;
    s.pressure.heat = 0;
    expect(surgeCap(s)).toBe(SURGE_FLOOR);
    s.pressure.heat = 80;
    expect(surgeCap(s)).toBeGreaterThan(SURGE_FLOOR);
    // ...and the sustain has NOT moved: that is the next tier's sentence.
    expect(flowCap(s)).toBe(BOILER_FLOOR);
  });

  it('III — and the sustain, but only ABOVE the line you are safe at', () => {
    ensurePlant(s).tiers['boiler'] = 3;
    const line = holdLine(s);
    s.pressure.heat = line;                       // exactly safe
    expect(riskedHeat(s)).toBe(0);
    expect(flowCap(s)).toBe(BOILER_FLOOR);
    s.pressure.heat = line + 20;                  // twenty degrees of risk
    expect(riskedHeat(s)).toBe(20);
    expect(flowCap(s)).toBeGreaterThan(BOILER_FLOOR);
    expect(sustainGrowsWithRisk(s)).toBe(true);
  });

  it('and the three read as three distinct sentences', () => {
    expect(TIER_CAPABILITY_BOILER).toHaveLength(MAX_MACHINE_TIER + 1);
    expect(new Set(TIER_CAPABILITY_BOILER.slice(1)).size).toBe(3);
  });
});

describe('§3 — the Vent Array: cast valves', () => {
  it('a valve is CAST off the rack, not bought — and it vents where it stands', () => {
    const s = inCinder(1, 1);
    expect(ventArrayBuilt(s)).toBe(true);
    // No pipe anywhere: the gallery vents nothing at all.
    expect(networkCapacity(s)).toBe(0);
    const rackBefore = s.casting.rack.length;
    // A cell with no route to any outlet.
    expect(setValve(s, ctx(), 15).ok).toBe(true);
    expect(s.casting.rack.length).toBe(rackBefore - 1);
    expect(networkCapacity(s)).toBeCloseTo(VALVE_VENT, 10);
  });

  it('the slots are the capability — a tier-I array holds two', () => {
    const s = inCinder(1, 1);
    expect(valveSlots(s)).toBe(2);
    expect(setValve(s, ctx(), 15).ok).toBe(true);
    expect(setValve(s, ctx(), 16).ok).toBe(true);
    expect(valveBlocker(s, 17)).toMatch(/holds 2 valve/);
    ensurePlant(s).tiers['vents'] = 3;
    expect(valveSlots(s)).toBe(4);
    expect(valveBlocker(s, 17)).toBeNull();
  });

  it('pulling one is free and always allowed — re-routing is the game', () => {
    const s = inCinder(1, 1);
    setValve(s, ctx(), 15);
    expect(networkCapacity(s)).toBeGreaterThan(0);
    expect(setValve(s, ctx(), 15).ok).toBe(true);
    expect(networkCapacity(s)).toBe(0);
  });

  it('with no Array, nothing can be set', () => {
    const s = inCinder(1, 0);
    expect(valveBlocker(s, 15)).toMatch(/not standing/);
    expect(setValve(s, ctx(), 15).ok).toBe(false);
  });
});

describe('§4 — the line, and the klaxon', () => {
  it('II: the line becomes a setting, and it can only ever hold you COOLER', () => {
    const s = inCinder(1, 1);
    expect(choosesTheLine(s)).toBe(false);
    expect(setHoldLine(s, ctx(), 40).ok).toBe(false);
    ensurePlant(s).tiers['vents'] = 2;
    // Give the gallery something to hold, or the derived line IS the base and
    // there is no room under it — the floor is the Damper's own 25.
    setValve(s, ctx(), 15);
    setValve(s, ctx(), 16);
    const derived = holdLine(s);
    expect(derived).toBeGreaterThan(HOLD_LINE_BASE + 5);
    // A line is a whole number the player asks for; the derived one is not.
    const want = Math.floor(derived) - 3;
    expect(setHoldLine(s, ctx(), want).ok).toBe(true);
    expect(holdLine(s)).toBe(want);
    // Asking for MORE than the plumbing can hold gets the plumbing's answer.
    setHoldLine(s, ctx(), HOLD_LINE_MAX + 50);
    expect(holdLine(s)).toBeLessThanOrEqual(derived);
    // ...and it can always be handed back.
    setHoldLine(s, ctx(), null);
    expect(holdLine(s)).toBe(derived);
  });

  it('III: the array answers the klaxon, ONCE, and a new run gives it back', () => {
    const s = inCinder(1, 2);
    expect(answersTheKlaxon(s)).toBe(false);
    expect(answerKlaxon(s, ctx())).toBe(false);
    ensurePlant(s).tiers['vents'] = 3;
    s.pressure.choke = true;
    expect(answerKlaxon(s, ctx())).toBe(true);
    expect(s.pressure.choke, 'it threw the choke open').toBe(false);
    s.pressure.choke = true;
    expect(answerKlaxon(s, ctx()), 'twice in one run').toBe(false);
    resetVentRun(s);
    expect(answerKlaxon(s, ctx())).toBe(true);
  });

  it('and the three vent tiers are three distinct sentences too', () => {
    expect(TIER_CAPABILITY_VENTS).toHaveLength(MAX_MACHINE_TIER + 1);
    expect(new Set(TIER_CAPABILITY_VENTS.slice(1)).size).toBe(3);
  });
});

describe('§5 — THE LOCKED SIGNATURE IS UNTOUCHED', () => {
  /**
   * The load-bearing block. `pressure.ts` is Cinder's locked signature and the
   * four laws are enforced by construction there. Everything A.95 added is
   * bounded in one direction — valves only ADD vent, the asked line only LOWERS
   * the hold-line — so every law reads a number at least as safe as before.
   */
  it('LAW 2: the governor still caps unchoked heat, with valves and a line set', () => {
    const s = inCinder(3, 3);
    setValve(s, ctx(), 15);
    setValve(s, ctx(), 16);
    setHoldLine(s, ctx(), 30);
    s.pressure.choke = false;
    expect(heatCeiling(s, true)).toBeLessThanOrEqual(GOVERNOR_MAX);
    expect(heatCeiling(s, false)).toBeLessThanOrEqual(CARRY_HEAT_CAP);
  });

  it('LAW 2: the hold-line is still ALWAYS below 100, at every setting', () => {
    const s = inCinder(3, 3);
    for (const ask of [HOLD_LINE_BASE, 40, 60, HOLD_LINE_MAX, 200]) {
      setHoldLine(s, ctx(), ask);
      expect(holdLine(s)).toBeLessThan(100);
      expect(holdLine(s)).toBeGreaterThanOrEqual(HOLD_LINE_BASE);
    }
  });

  it('A VALVE CAN ONLY MAKE THE SHAFT COOLER — vent never falls', () => {
    const s = inCinder(1, 3);
    const before = ventRate(s);
    setValve(s, ctx(), 15);
    setValve(s, ctx(), 16);
    expect(ventRate(s)).toBeGreaterThan(before);
  });

  it('AN IDLE SHAFT STILL CANNOT FLOOD, with the whole of A.95 live', () => {
    const s = inCinder(3, 3);
    const engine = createEngine({ nowMs: 0 });
    void engine;
    setValve(s, ctx(), 15);
    setHoldLine(s, ctx(), 60);
    s.pressure.heat = 99;
    s.pressure.choke = true;
    s.stats.playTimeSec = 10_000;
    s.pressure.lastStokeSec = 0;              // long since abandoned
    const mods = new ModifierCache(); mods.invalidate();
    // 20 minutes of nobody touching it.
    for (let i = 0; i < 1200; i++) {
      (s.stats as { playTimeSec: number }).playTimeSec += 1;
      tick(s, mods);
    }
    expect(s.pressure.heat).toBeLessThan(100);
    expect(s.pressure.heat).toBeLessThanOrEqual(holdLine(s) + 1);
    expect(s.stats.playTimeSec - s.pressure.lastStokeSec).toBeGreaterThan(IDLE_GRACE_SEC);
  });
});

describe('§6 — pillar 2', () => {
  it('a Boiler at full heat and a full Array cannot move the ceiling', () => {
    const s = inCinder(3, 3);
    const mods = new ModifierCache();
    s.depth = 48;
    mods.invalidate();
    const bare = dpsMax(s, mods).toNumber();
    s.pressure.heat = 95;
    setValve(s, ctx(), 15);
    setValve(s, ctx(), 16);
    setHoldLine(s, ctx(), 30);
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).toBe(bare);
    // ...and the plant really did grow, so the assertion is not vacuous.
    expect(surgeCap(s)).toBeGreaterThan(SURGE_FLOOR);
    expect(flowCap(s)).toBeGreaterThan(BOILER_FLOOR);
  });

  it('the Boiler draws nothing — a power source that charged itself would loop', () => {
    const s = inCinder(3, 3);
    expect(boilerRead(s).built).toBe(true);
    // `demandOf('boiler')` is zero on both axes; asserted through the read the
    // plant actually uses rather than by naming the record.
    expect(demandOf('boiler')).toEqual({ flow: 0, surge: 0 });
  });
});

/** One second of the REAL heat model, through the live signature hook. */
function tick(s: GameState, mods: ModifierCache): void {
  runFaceTick(s, mods, ctx(), 1);
}
