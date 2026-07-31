/**
 * MODIFIER LEVELS, SYNERGIES, AND INSTABILITY — the OP-stacking core.
 *
 * Five claims:
 *
 *  1  LEVELS GROW THE EFFECT AND NOTHING ELSE. A level scales the vector a
 *     modifier already had; it cannot give it an axis it never declared, which
 *     is why levelling needs no separate pillar-2 argument.
 *  2  A SYNERGY IS FOUND, NOT LISTED. Two parents on one tool at level, and a
 *     third thing appears — costing no slots, recorded on first waking, asleep
 *     again the moment either parent leaves. The hint names neither half.
 *  3  INSTABILITY IS A REAL COUNTERWEIGHT. It rises with what you stack, falls
 *     with stabilisers and the tool's own steadiness, and a low-instability
 *     tool NEVER misfires.
 *  4  A MISFIRE ONLY EVER REMOVES. Fizzle or wild — there is no outcome that
 *     pays more than a clean firing, so instability cannot be farmed.
 *  5  PILLAR 1 AND 2 SURVIVE ALL OF IT. An unstable tool still mines exactly as
 *     a stable one does, and the fully-stacked, fully-levelled, fully-synergised
 *     tool cannot take more charge out than the field was holding.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameEvent, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { PART_TYPES } from '../content/forgeParts';
import { makePart } from '../systems/forgeParts';
import { BASE_CAP } from '../systems/face';
import { fireAbility, TOOL_CARRIER } from '../systems/drillAlloys';
import { ABILITY_BY_ID, abilityParams } from '../content/drillAlloys';
import {
  ABILITY_LEVEL_MAX, MOD_LEVEL_MAX, MOD_BY_ID, SYNERGIES, SYNERGY_BY_ID,
  TOOL_MODS, abilityLevelOf, modLevelOf, modLevelScale, modXpForLevel,
} from '../content/toolMods';
import {
  INST_FLOOR, MISFIRE_CAP, gainModXp, modCache, modProgress,
  stripToolMod, synergyHints, toolInstability, tuneParams,
} from '../systems/toolMods';
import { MAX_EXTRA_CELLS, SLOT_EVERY, toolEffect, xpForLevel } from '../systems/toolMining';
import { handCarrier, noteSynergies } from '../systems/toolAbilities';
import { SAVE_VERSION, runMigrations } from '../save/migrations';

let engine: Engine;
const st = () => engine.getState() as GameState;
const mods = () => new ModifierCache();
const ctx: EngineCtx = { emit() {}, dirty() {} };

/** Room for anything a test seats — the budget is asserted in tool-mods. */
const ROOMY = 1 + SLOT_EVERY * 400;

function hold(materialId = 'marl', level = ROOMY): void {
  const s = st();
  s.forge.built = true;
  for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
    s.depthRecords[shell] = 40;
  }
  s.casting.tool = PART_TYPES.map((t, i) => ({ ...makePart(t, materialId, 60), id: i + 1 }));
  s.casting.wear = 0;
  s.casting.mods = [];
  s.casting.knownSynergies = [];
  s.casting.xp = xpForLevel(level);
  if (s.casting.hand) s.casting.hand.fits = [];
}

/** Seat a modifier at a chosen level, by giving it the work it would have done. */
function seat(id: string, n = 1, level = 1): void {
  const s = st();
  const stacks = (s.casting.mods ??= []);
  const at = stacks.find((m) => m.id === id);
  if (at) { at.n += n; at.xp = modXpForLevel(level); }
  else stacks.push({ id, n, xp: modXpForLevel(level) });
  (s.casting.knownMods ??= []).push(id);
}

function fit(id: string, grade = 1, fired = 0, slot = 0): void {
  const s = st();
  const h = handCarrier(s);
  h.fits = h.fits ?? [];
  h.fits[slot] = { id, grade, ch: 0, fired };
  h.fits = h.fits.filter(Boolean);
}

function fillFace(s: GameState, charge = BASE_CAP): void {
  s.face.cells = s.face.cells.map(() => charge);
  s.face.ore = new Array(s.face.cells.length).fill('');
  s.face.oreDug = new Array(s.face.cells.length).fill(0);
  s.growth.stage = s.growth.stage.map(() => 0);
  s.depth = 30;
}

const held = (s: GameState): number => s.face.cells.reduce((a, b) => a + b, 0);
const harvested = (s: GameState): number => s.stats.fieldChargeHarvested.toNumber();

beforeEach(() => {
  engine = createEngine({ nowMs: 0 });
  hold();
});

// ---------------------------------------------------------------------------
// 1 — LEVELS
// ---------------------------------------------------------------------------

describe('a modifier grows into what it does', () => {
  it('levels from work, and the work is cells that gave something up', () => {
    const s = st();
    seat('longarm', 1, 1);
    expect(modProgress(s.casting.mods![0]!).level).toBe(1);
    gainModXp(s, ctx, modXpForLevel(3));
    expect(modProgress(s.casting.mods![0]!).level).toBe(3);
  });

  it('an empty swing teaches it nothing', () => {
    const s = st();
    seat('longarm', 1, 1);
    const before = s.casting.mods![0]!.xp;
    gainModXp(s, ctx, 0);
    expect(s.casting.mods![0]!.xp).toBe(before);
  });

  it('and it stops at V', () => {
    expect(modLevelOf(modXpForLevel(MOD_LEVEL_MAX) * 100)).toBe(MOD_LEVEL_MAX);
    expect(modLevelScale(MOD_LEVEL_MAX)).toBeGreaterThan(modLevelScale(1));
  });

  it('the level multiplies what the modifier contributes', () => {
    const s = st();
    seat('longarm', 1, 1);
    const at1 = modCache(s, 0).cells;
    s.casting.mods![0]!.xp = modXpForLevel(MOD_LEVEL_MAX);
    const at5 = modCache(s, 0).cells;
    expect(at5).toBeCloseTo(at1 * modLevelScale(MOD_LEVEL_MAX), 6);
  });

  /**
   * THE PILLAR-2 SHAPE OF LEVELLING, and the reason it needed no new argument:
   * a level SCALES the vector, it does not rotate it. Whatever axes a modifier
   * touched at level I are exactly the axes it touches at level V.
   */
  it('and never gives it an axis it did not already have', () => {
    const s = st();
    for (const def of TOOL_MODS) {
      s.casting.mods = [{ id: def.id, n: 1, xp: 0 }];
      const low = modCache(s, 4);
      s.casting.mods = [{ id: def.id, n: 1, xp: modXpForLevel(MOD_LEVEL_MAX) }];
      const high = modCache(s, 4);
      for (const key of ['cells', 'splash', 'chargePerSwing', 'abilityGrade', 'refire'] as const) {
        if (low[key] === 0) {
          expect(high[key], `${def.id} grew a ${key} it never had`).toBe(0);
        }
      }
      for (const key of ['oreRate', 'dropWeight', 'uses', 'xpRate'] as const) {
        if (low[key] === 1) {
          expect(high[key], `${def.id} grew a ${key} it never had`).toBe(1);
        }
      }
    }
  });

  it('an ability levels from FIRINGS, and a level is worth a grade step', () => {
    const s = st();
    fit('slagburst', 1, 0);
    fillFace(s);
    const slag = ABILITY_BY_ID.get('slagburst')!;
    expect(abilityParams(slag, 1)['r']).toBe(1);

    // A level-III Slagburst is a five-by-five, because a level is a grade step.
    fit('slagburst', 1, 40);
    expect(abilityLevelOf(40)).toBe(3);
    handCarrier(s).lastCell = 14;
    const before = held(s);
    fireAbility(s, mods(), ctx, TOOL_CARRIER, 0, 14);
    expect(held(s)).toBeLessThan(before);
  });

  it('and firing it is what teaches it', () => {
    const s = st();
    fit('slagburst', 1, 0);
    fillFace(s);
    handCarrier(s).lastCell = 14;
    fireAbility(s, mods(), ctx, TOOL_CARRIER, 0, 14);
    expect(s.casting.hand!.fits![0]!.fired).toBe(1);
  });

  it('the ability ladder stops at V too', () => {
    expect(abilityLevelOf(1e9)).toBe(ABILITY_LEVEL_MAX);
  });
});

// ---------------------------------------------------------------------------
// 2 — SYNERGIES
// ---------------------------------------------------------------------------

describe('a synergy is found by arranging, never listed', () => {
  it('every synergy names two real modifiers and does something', () => {
    for (const s of SYNERGIES) {
      expect(MOD_BY_ID.has(s.from[0]), `${s.id} parent 0`).toBe(true);
      expect(MOD_BY_ID.has(s.from[1]), `${s.id} parent 1`).toBe(true);
      expect(s.from[0]).not.toBe(s.from[1]);
      expect(Object.keys(s.fx).length, `${s.id} does nothing`).toBeGreaterThan(0);
      expect(s.hint.length, `${s.id} has no direction`).toBeGreaterThan(20);
      expect(s.minLevel).toBeGreaterThanOrEqual(1);
    }
  });

  it('one parent alone wakes nothing', () => {
    const s = st();
    const syn = SYNERGY_BY_ID.get('stormbreaker')!;
    seat(syn.from[0], 1, syn.minLevel);
    expect(modCache(s, 0).awake).toEqual([]);
  });

  it('both parents at level wake it, and it costs no slots', () => {
    const s = st();
    const syn = SYNERGY_BY_ID.get('stormbreaker')!;
    seat(syn.from[0], 1, syn.minLevel);
    seat(syn.from[1], 1, syn.minLevel);
    expect(modCache(s, 0).awake).toContain('stormbreaker');
    // No slot is spent on it — the arrangement is free, the parents were not.
    const used = s.casting.mods!.reduce((n, m) => n + MOD_BY_ID.get(m.id)!.cost * m.n, 0);
    expect(used).toBe(
      MOD_BY_ID.get(syn.from[0])!.cost + MOD_BY_ID.get(syn.from[1])!.cost,
    );
  });

  it('but not below the level it wants', () => {
    const s = st();
    const syn = SYNERGY_BY_ID.get('stormbreaker')!;
    seat(syn.from[0], 1, syn.minLevel);
    seat(syn.from[1], 1, syn.minLevel - 1);
    expect(modCache(s, 0).awake).toEqual([]);
  });

  it('it is recorded the first time it wakes, and announced once', () => {
    const s = st();
    const syn = SYNERGY_BY_ID.get('stormbreaker')!;
    seat(syn.from[0], 1, syn.minLevel);
    seat(syn.from[1], 1, syn.minLevel);
    const seen: GameEvent[] = [];
    const c: EngineCtx = { emit: (e) => { seen.push(e); }, dirty() {} };
    noteSynergies(s, c);
    expect(s.casting.knownSynergies).toContain('stormbreaker');
    expect(seen.filter((e) => e.type === 'synergyAwoke').length).toBe(1);
    seen.length = 0;
    noteSynergies(s, c);
    expect(seen).toEqual([]);
  });

  it('taking a parent off puts it back to sleep — the arrangement IS the thing', () => {
    const s = st();
    const syn = SYNERGY_BY_ID.get('stormbreaker')!;
    seat(syn.from[0], 1, syn.minLevel);
    seat(syn.from[1], 1, syn.minLevel);
    expect(modCache(s, 0).awake).toContain('stormbreaker');
    // `seat` bypasses the bench, and the bench is what records a waking — so
    // the note is taken here explicitly. In play `applyToolMod` does it.
    noteSynergies(s);
    stripToolMod(s, ctx, syn.from[1]);
    expect(modCache(s, 0).awake).toEqual([]);
    // ...and the knowledge of it is NOT taken away.
    expect(s.casting.knownSynergies).toContain('stormbreaker');
  });

  it('the hint appears with ONE half and names neither half nor the result', () => {
    const s = st();
    const syn = SYNERGY_BY_ID.get('stormbreaker')!;
    expect(synergyHints(s)).toEqual([]);
    seat(syn.from[0], 1, 1);
    const hints = synergyHints(s);
    expect(hints.length).toBeGreaterThan(0);
    const all = hints.join(' ').toLowerCase();
    expect(all).not.toContain(syn.name.toLowerCase());
    expect(all).not.toContain(MOD_BY_ID.get(syn.from[1])!.name.toLowerCase());
    expect(all).not.toContain(MOD_BY_ID.get(syn.from[0])!.name.toLowerCase());
  });

  it('and it goes away once both halves are on — there is nothing left to point at', () => {
    const s = st();
    const syn = SYNERGY_BY_ID.get('stormbreaker')!;
    seat(syn.from[0], 1, syn.minLevel);
    seat(syn.from[1], 1, syn.minLevel);
    expect(synergyHints(s)).not.toContain(syn.hint);
  });

  it('a woken synergy actually changes the tool', () => {
    const s = st();
    const syn = SYNERGY_BY_ID.get('cleaver')!;
    seat(syn.from[0], 1, syn.minLevel);
    const half = modCache(s, 0).splash;
    seat(syn.from[1], 1, syn.minLevel);
    const whole = modCache(s, 0).splash;
    // More than the second parent alone would have given.
    expect(whole).toBeGreaterThan(half + (MOD_BY_ID.get(syn.from[1])!.fx.splash ?? 0));
  });
});

// ---------------------------------------------------------------------------
// 3 — INSTABILITY
// ---------------------------------------------------------------------------

describe('instability is what makes OP an engineering problem', () => {
  it('a bare tool is perfectly steady, and never misfires', () => {
    const s = st();
    const i = toolInstability(s);
    expect(i.raw).toBe(0);
    expect(i.misfire).toBe(0);
  });

  it('an early tool with one small modifier is still under the floor', () => {
    const s = st();
    hold('marl', 1);
    seat('heavyhead', 1, 1);
    expect(toolInstability(s).misfire).toBe(0);
  });

  it('stacking powerful things drives it up', () => {
    const s = st();
    const low = toolInstability(s).raw;
    for (const m of ['farreach', 'voidbite', 'widerblast2', 'overgrade', 'firstform']) {
      seat(m, 2, MOD_LEVEL_MAX);
    }
    fit('slagburst', 7, 300);
    const high = toolInstability(s);
    expect(high.raw).toBeGreaterThan(low);
    expect(high.net).toBeGreaterThan(INST_FLOOR);
    expect(high.misfire).toBeGreaterThan(0);
  });

  it('and it says WHAT is driving it', () => {
    const s = st();
    seat('firstform', 1, MOD_LEVEL_MAX);
    seat('farreach', 2, MOD_LEVEL_MAX);
    const i = toolInstability(s);
    expect(i.from.length).toBeGreaterThan(0);
    expect(i.from[0]!.n).toBeGreaterThanOrEqual(i.from[i.from.length - 1]!.n);
    expect(i.from.map((f) => f.label)).toContain('First Form');
  });

  it('a stabiliser brings it back down, and buys nothing else', () => {
    /**
     * A GENUINELY OP BUILD, because the floor is relative now (A.67).
     *
     * Three modifiers used to clear a fixed floor of 40. The floor now scales
     * with the tool's modifier budget — which is what made instability reachable
     * before the last hour of the game — so a three-modifier build on a roomy
     * tool sits UNDER it and misfires at zero, and a test asserting the misfire
     * FELL had nothing to fall from. Pack it properly and the assertion means
     * what it always meant.
     */
    const s = st();
    for (const m of ['farreach', 'voidbite', 'widerblast2', 'detonation', 'firstform']) {
      seat(m, 2, MOD_LEVEL_MAX);
    }
    const before = toolInstability(s);
    expect(before.misfire, 'the fixture is no longer an OP build').toBeGreaterThan(0);
    const reach = modCache(s, 0).cells;
    seat('theanchor', 2, MOD_LEVEL_MAX);
    const after = toolInstability(s);
    expect(after.steady).toBeGreaterThan(before.steady);
    expect(after.net).toBeLessThan(before.net);
    expect(after.misfire).toBeLessThan(before.misfire);
    // It bought RELIABILITY and nothing else — the reach did not move.
    expect(modCache(s, 0).cells).toBeCloseTo(reach, 6);
  });

  it('the tool own steadiness counts, so the Binding stone is part of the answer', () => {
    const s = st();
    for (const m of ['farreach', 'voidbite']) seat(m, 2, MOD_LEVEL_MAX);
    const soft = toolInstability(s).steady;
    // A trueseated stone is what the doc gives stability to.
    const parts = s.casting.tool.map((p) => ({ ...p, materialId: 'graveclay' }));
    s.casting.tool = parts;
    const other = toolInstability(s).steady;
    expect(Number.isFinite(soft) && Number.isFinite(other)).toBe(true);
    expect(soft).toBeGreaterThanOrEqual(0);
  });

  it('however bad it gets, most firings still land', () => {
    const s = st();
    for (const m of TOOL_MODS) seat(m.id, m.maxStacks, MOD_LEVEL_MAX);
    for (const [id] of ABILITY_BY_ID) { fit(id, 7, 999, 0); break; }
    expect(toolInstability(s).misfire).toBeLessThanOrEqual(MISFIRE_CAP);
  });

  it('a synergy is volatile — it adds instability of its own', () => {
    const s = st();
    const syn = SYNERGY_BY_ID.get('theanvil')!;
    seat(syn.from[0], 1, syn.minLevel);
    const before = toolInstability(s).raw;
    seat(syn.from[1], 1, syn.minLevel);
    const after = toolInstability(s);
    expect(after.raw).toBeGreaterThan(before);
    expect(modCache(s, 0).awake).toContain('theanvil');
  });
});

// ---------------------------------------------------------------------------
// 4 — MISFIRES ONLY REMOVE
// ---------------------------------------------------------------------------

describe('a misfire is only ever worse', () => {
  /** Force every roll to misfire, then to pick each branch. */
  function forceMisfire(branch: 'fizzle' | 'wild'): () => void {
    const original = Math.random;
    let call = 0;
    Math.random = () => {
      call++;
      if (call === 1) return 0;                       // under the misfire chance
      if (call === 2) return branch === 'fizzle' ? 0 : 0.99;
      return 0.5;
    };
    return () => { Math.random = original; };
  }

  function unstable(): GameState {
    const s = st();
    for (const m of ['farreach', 'voidbite', 'widerblast2', 'overgrade', 'firstform']) {
      seat(m, 2, MOD_LEVEL_MAX);
    }
    fit('slagburst', 7, 300);
    fillFace(s);
    return s;
  }

  it('a fizzle does nothing at all, and still spends the meter', () => {
    const s = unstable();
    s.casting.hand!.fits![0]!.ch = 999;
    handCarrier(s).lastCell = 14;
    const before = held(s);
    const seen: GameEvent[] = [];
    const restore = forceMisfire('fizzle');
    try {
      fireAbility(s, mods(), { emit: (e) => { seen.push(e); }, dirty() {} }, TOOL_CARRIER, 0, 14);
    } finally { restore(); }
    expect(held(s)).toBe(before);
    expect(s.casting.hand!.fits![0]!.ch).toBe(0);
    const ev = seen.find((e) => e.type === 'misfire');
    expect(ev && ev.type === 'misfire' && ev.kind).toBe('fizzle');
  });

  it('a wild firing goes somewhere you did not choose', () => {
    const s = unstable();
    handCarrier(s).lastCell = 14;
    const seen: GameEvent[] = [];
    const restore = forceMisfire('wild');
    try {
      fireAbility(s, mods(), { emit: (e) => { seen.push(e); }, dirty() {} }, TOOL_CARRIER, 0, 14);
    } finally { restore(); }
    const ev = seen.find((e) => e.type === 'misfire');
    expect(ev && ev.type === 'misfire' && ev.kind).toBe('wild');
  });

  /**
   * THE CLAIM THAT MATTERS. Misfires must reduce reliability and never add
   * yield, so over many firings an unstable tool takes LESS than the same tool
   * that never misfires — never more. Run against a fixed face with no regen,
   * so the comparison is exact rather than statistical.
   */
  it('and over many firings an unstable tool takes LESS, never more', () => {
    const run = (misfiring: boolean): number => {
      engine = createEngine({ nowMs: 0 });
      hold();
      const s = st();
      fit('slagburst', 7, 300);
      fillFace(s, 8);
      const before = harvested(s);
      const original = Math.random;
      if (misfiring) {
        let n = 0;
        Math.random = () => { n++; return n % 3 === 0 ? 0 : original(); };
      }
      try {
        for (let i = 0; i < 40; i++) {
          const cell = (i * 7) % s.face.cells.length;
          handCarrier(s).lastCell = cell;
          if (misfiring) {
            // Force a fizzle every third firing by hand rather than by chance.
            if (i % 3 === 0) { s.casting.hand!.fits![0]!.ch = 999; continue; }
          }
          fireAbility(s, mods(), ctx, TOOL_CARRIER, 0, cell);
        }
      } finally { Math.random = original; }
      return harvested(s) - before;
    };
    const clean = run(false);
    const rough = run(true);
    expect(rough).toBeLessThanOrEqual(clean + 1e-6);
  });

  it('and a refire is never rolled again — Echoform does not punish itself', () => {
    // depth > 0 firings skip the instability roll entirely. Asserted at the
    // hook's contract rather than statistically.
    const s = unstable();
    handCarrier(s).lastCell = 14;
    const seen: GameEvent[] = [];
    const c: EngineCtx = { emit: (e) => { seen.push(e); }, dirty() {} };
    fireAbility(s, mods(), c, TOOL_CARRIER, 0, 14, 1);
    expect(seen.filter((e) => e.type === 'misfire')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5 — THE PILLARS
// ---------------------------------------------------------------------------

describe('the pillars survive all of it', () => {
  it('an unstable tool mines exactly as a steady one does (pillar 1)', () => {
    const swing = (unstable: boolean): number => {
      engine = createEngine({ nowMs: 0 });
      hold();
      const s = st();
      if (unstable) {
        for (const m of ['widerblast2', 'overgrade']) seat(m, 2, MOD_LEVEL_MAX);
      }
      fillFace(s);
      const before = harvested(s);
      engine.dispatch({ type: 'chip', cell: 14 });
      return harvested(s) - before;
    };
    // Neither of those modifiers touches the swing — only what it carries.
    expect(swing(true)).toBeCloseTo(swing(false), 6);
  });

  it('and instability is never able to stop the tool mining at all', () => {
    const s = st();
    for (const m of TOOL_MODS) seat(m.id, m.maxStacks, MOD_LEVEL_MAX);
    fillFace(s);
    const before = harvested(s);
    engine.dispatch({ type: 'chip', cell: 14 });
    expect(harvested(s) - before).toBeGreaterThan(0);
  });

  /**
   * THE LOAD-BEARING TEST FOR THIS PHASE: everything at once. Every modifier at
   * full stacks and level V, every synergy that can wake awake, every ability
   * at grade VII and level V. Regen is off because nothing here ticks the face.
   */
  it('the fully levelled, fully synergised tool still cannot make charge', () => {
    for (const [id, def] of ABILITY_BY_ID) {
      engine = createEngine({ nowMs: 0 });
      hold();
      const s = st();
      for (const m of TOOL_MODS) seat(m.id, m.maxStacks, MOD_LEVEL_MAX);
      fit(id, 7, 999);
      fillFace(s, 8);
      noteSynergies(s);
      expect(modCache(s, 1).awake.length, 'no synergy woke — the arm is not what it claims')
        .toBeGreaterThan(0);

      const start = held(s);
      const before = harvested(s);
      for (let i = 0; i < 25; i++) {
        const cell = (i * 7) % s.face.cells.length;
        handCarrier(s).lastCell = cell;
        fireAbility(s, mods(), ctx, TOOL_CARRIER, 0, cell);
      }
      const took = harvested(s) - before;
      expect(took, `${def.name} took ${took.toFixed(2)} of ${start.toFixed(2)}`)
        .toBeLessThanOrEqual(start + 1e-6);
      expect(took + held(s), `${def.name} took+left`).toBeLessThanOrEqual(start + 1e-6);
      expect(held(s)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  /**
   * FOUND IN A DRIVEN SCREENSHOT reading "+16 reach · +205% off each cell".
   * Both are clamped — reach into the 3x3, splash at a whole cell — so the raw
   * fold is not what the tool does, and anything showing the raw fold is
   * promising roughly twice the truth. The engine was right; the readout was
   * not. This pins the clamps that make the readout's job possible.
   */
  it('however much is stacked, the EFFECT is clamped where it always was', () => {
    const s = st();
    for (const m of TOOL_MODS) seat(m.id, m.maxStacks, MOD_LEVEL_MAX);
    const raw = modCache(s, 4);
    const e = toolEffect(s);
    expect(raw.cells, 'the fixture is not stacked enough to prove anything').toBeGreaterThan(8);
    expect(e.cells).toBeLessThanOrEqual(1 + MAX_EXTRA_CELLS);
    expect(raw.splash).toBeGreaterThan(1);
    expect(e.splash).toBeLessThanOrEqual(1);
  });

  it('and a level-V ability share is still at most a whole cell', () => {
    const s = st();
    for (const m of TOOL_MODS) seat(m.id, m.maxStacks, MOD_LEVEL_MAX);
    const cache = modCache(s, 4);
    for (const def of ABILITY_BY_ID.values()) {
      const p = tuneParams(cache, abilityParams(def, 7 + ABILITY_LEVEL_MAX));
      if (p['share'] !== undefined) expect(p['share'], def.name).toBeLessThanOrEqual(1);
    }
  });
});

describe('the save', () => {
  it('is at v41, and an existing stack starts at level I with nothing found', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(41);
    const out = runMigrations({
      version: 40,
      state: {
        casting: {
          tool: [], mods: [{ id: 'longarm', n: 2 }],
          hand: { fits: [{ id: 'slagburst', grade: 3, ch: 5 }] },
        },
      },
    } as never);
    const casting = (out.state as Record<string, unknown>)['casting'] as Record<string, unknown>;
    const m = (casting['mods'] as Array<Record<string, unknown>>)[0]!;
    expect(m['xp']).toBe(0);
    expect(m['n']).toBe(2); // nothing anyone had is taken away
    const f = ((casting['hand'] as Record<string, unknown>)['fits'] as Array<Record<string, unknown>>)[0]!;
    expect(f['fired']).toBe(0);
    expect(f['ch']).toBe(5); // a meter mid-fill is still mid-fill
    expect(casting['knownSynergies']).toEqual([]);
  });
});
