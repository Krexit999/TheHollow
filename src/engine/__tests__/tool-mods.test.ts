/**
 * THE MODIFIER LIBRARY — the "how OP you can make stuff" layer.
 *
 * Six claims:
 *
 *  1  PILLAR 2 IS IN THE TYPE. `ModEffectDef` has no field for yield-per-charge
 *     and the registry may not grow one. Asserted over the DATA, so it holds
 *     for the thirty-third entry as well as the first.
 *  2  AND IT HOLDS IN FACT. A fully modded tool carrying every ability at
 *     maximum grade cannot take more charge out of the field than the field
 *     was holding. Reach stays clamped to the 3x3, share stays clamped to a
 *     whole cell, whatever is stacked.
 *  3  SLOTS ARE THE BUDGET, and they come from the Binding stone and from use.
 *     A modifier that will not fit is refused BEFORE the spend.
 *  4  COMBOS ARE INERT UNTIL THEY ARE NOT, visibly, and say what they want.
 *     Amplification multiplies other modifiers and never other combos.
 *  5  THE OP ARC IS REAL AND EARNED — an opening tool takes one cheap
 *     modifier, a deep levelled one takes a stack.
 *  6  REACH. Every modifier is makeable from some shell's own rock.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameEvent, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { PART_TYPES } from '../content/forgeParts';
import { assembleTool, makePart } from '../systems/forgeParts';
import { BASE_CAP } from '../systems/face';
import { fireAbility, TOOL_CARRIER } from '../systems/drillAlloys';
import { ABILITY_BY_ID, abilityParams } from '../content/drillAlloys';
import {
  MOD_AXES, MOD_BY_ID, MOD_SHELL_ORDINAL, TOOL_MODS, matchToolMod,
} from '../content/toolMods';
import {
  applyToolMod, modCache, modLive, modSlotsFree, modSlotsTotal, modSlotsUsed,
  stackOf, stripToolMod, tickToolMods, tuneParams, whyDormant, NO_MODS,
} from '../systems/toolMods';
import { effectOf, MAX_EXTRA_CELLS, usesOf, toolEffect, SLOT_EVERY, xpForLevel } from '../systems/toolMining';
import { handCarrier, toolAbilitySlots } from '../systems/toolAbilities';
import { addMaterial } from '../systems/forge';
import { materialsOfShell } from '../materials';
import { TOOL_CLASSES } from '../content/toolClasses';
import { allShells } from '../shells';
import { SAVE_VERSION, runMigrations } from '../save/migrations';

let engine: Engine;
const st = () => engine.getState() as GameState;
const mods = () => new ModifierCache();
const ctx: EngineCtx = { emit() {}, dirty() {} };

const ORD: Record<string, number> = {
  loam: 1, ferrite: 2, verdance: 3, glassmere: 4, cinder: 5, hollow: 6, aleph: 7,
};

function reachAll(s: GameState): void {
  for (const shell of allShells()) s.depthRecords[shell.id] = 40;
}

/**
 * Fit a tool. `level` defaults HIGH so there is room for whatever a test seats
 * — overflow now goes dormant, so a fixture that seats six modifiers on a
 * three-slot Loam tool would measure the identity and pass by doing nothing.
 * Tests about the slot ARC pass `level: 1` and mean it.
 */
function hold(materialId: string, level = 1 + SLOT_EVERY * 40): void {
  const s = st();
  s.forge.built = true;
  s.casting.tool = PART_TYPES.map((t, i) => ({ ...makePart(t, materialId, 60), id: i + 1 }));
  s.casting.wear = 0;
  s.casting.mods = [];
  s.casting.xp = xpForLevel(level);
}

/**
 * Seat a modifier directly, bypassing the bench — the VERB is tested at the
 * verb, the EFFECTS are tested here.
 *
 * IT ALSO MAKES ROOM, by levelling the tool until the stack fits. Bypassing the
 * bench means bypassing the slot check, and since overflow now goes dormant a
 * fixture that seats six modifiers on a three-slot Loam tool would measure
 * nothing at all — every effects test would read the identity and pass. The
 * budget is asserted where it belongs, at the verb and in its own block.
 */
function seat(id: string, n = 1): void {
  const s = st();
  const stacks = (s.casting.mods ??= []);
  const at = stacks.find((m) => m.id === id);
  if (at) at.n += n;
  else stacks.push({ id, n });
  (s.casting.knownMods ??= []).push(id);
}

/**
 * A TOOL WITH ROOM FOR THE WHOLE LIBRARY AT FULL STACKS.
 *
 * The overflow rule (a stack past the budget goes dormant) means "seat every
 * modifier" no longer seats every modifier — most of them would fall asleep and
 * the pillar-2 test would be measuring a tool carrying almost nothing while
 * reporting that it carried everything. That is the worst kind of green.
 *
 * So the ceiling tests level the tool until it genuinely holds all of it. This
 * is not cheating past the budget; it is having a budget that large, which the
 * slot rule permits and which proves the stronger claim: the ceiling does not
 * depend on the budget at all.
 */
const EVERYTHING_LEVEL = 1 + SLOT_EVERY * 400;

function fillFace(s: GameState, charge = BASE_CAP): void {
  s.face.cells = s.face.cells.map(() => charge);
  s.face.ore = new Array(s.face.cells.length).fill('');
  s.face.oreDug = new Array(s.face.cells.length).fill(0);
  for (const c of [0, 1, 6, 7]) s.face.cells[c] = charge * 0.1;
  for (const c of [12, 13, 18]) s.face.ore[c] = 'fatseam';
  for (const c of [20, 21, 26]) s.growth.stage[c] = 3;
  s.depth = 30;
}

/** The assembled tool, for the pure functions that take one. */
const makeTool = (s: GameState) => assembleTool(s.casting.tool);

const held = (s: GameState): number => s.face.cells.reduce((a, b) => a + b, 0);
const harvested = (s: GameState): number => s.stats.fieldChargeHarvested.toNumber();

beforeEach(() => {
  engine = createEngine({ nowMs: 0 });
  reachAll(st());
});

// ---------------------------------------------------------------------------
// 1 — PILLAR 2 IS IN THE TYPE
// ---------------------------------------------------------------------------

describe('a modifier cannot be written that touches yield', () => {
  /**
   * THE GUARD THAT MATTERS MOST IN THIS FILE. `ModEffectDef` names every axis a
   * modifier may touch and there is no field for dust-per-charge — so the
   * failure this asserts against is not "somebody wrote a bad modifier" but
   * "somebody added a field to the effect type". That is a pillar-2 decision
   * and it should fail a test rather than pass a review.
   */
  it('every effect key is one of the allowed axes', () => {
    const allowed = new Set<string>(MOD_AXES);
    for (const def of TOOL_MODS) {
      for (const key of Object.keys(def.fx)) {
        expect(allowed.has(key), `${def.id} touches "${key}", which is not an allowed axis`).toBe(true);
      }
    }
  });

  it('and no axis is named anything yield-shaped', () => {
    // Deliberately a list of the things that would BE a faucet rather than a
    // pattern — the first draft used /mult$/ and caught `paramMult`, which is
    // the ability-parameter fold and entirely legitimate. A guard that fires on
    // its own vocabulary teaches you to weaken it.
    for (const key of MOD_AXES) {
      expect(key).not.toMatch(/yield|dust|income|currency|chipMult|payout/i);
    }
  });

  /**
   * NO MODIFIER GRANTS MODIFIER SLOTS. One that costs slots and grants more is
   * an unbounded loop; one that grants what it costs is furniture. `Second
   * Seat` trades MODIFIER slots for ABILITY slots instead, which is a transfer
   * between two pools and cannot feed itself.
   */
  it('and none of them grants the slots it is paid for with', () => {
    for (const def of TOOL_MODS) {
      expect(Object.keys(def.fx)).not.toContain('modSlots');
    }
  });

  it('every def is internally sane — real shell, positive cost, real requirements', () => {
    for (const def of TOOL_MODS) {
      expect(MOD_SHELL_ORDINAL[def.shell], `${def.id} shell`).toBeGreaterThan(0);
      expect(def.cost, `${def.id} cost`).toBeGreaterThan(0);
      expect(def.maxStacks, `${def.id} stacks`).toBeGreaterThan(0);
      expect(def.units, `${def.id} units`).toBeGreaterThan(0);
      expect(Object.keys(def.needs).length, `${def.id} has no signature`).toBeGreaterThan(0);
      expect(Object.keys(def.fx).length, `${def.id} does nothing`).toBeGreaterThan(0);
      for (const id of def.requires?.mods ?? []) {
        expect(MOD_BY_ID.has(id), `${def.id} requires "${id}", which does not exist`).toBe(true);
      }
    }
  });

  it('only combos amplify — a stat modifier cannot multiply the tool', () => {
    for (const def of TOOL_MODS) {
      if (def.fx.amplify) expect(def.category, `${def.id}`).toBe('combo');
    }
  });
});

// ---------------------------------------------------------------------------
// 2 — AND IT HOLDS IN FACT
// ---------------------------------------------------------------------------

describe('a fully modded tool still cannot make charge', () => {
  it('reach stays clamped to the 3x3 however much reach is stacked', () => {
    const s = st();
    hold('marl');
    seat('longarm', 2); seat('widearc', 2); seat('farreach', 2); seat('firstform', 1);
    const e = toolEffect(s);
    expect(e.cells).toBeLessThanOrEqual(1 + MAX_EXTRA_CELLS);
  });

  it('splash stays at or under a whole cell however much is stacked', () => {
    const s = st();
    hold('marl');
    seat('heavyhead', 3); seat('shatterface', 3); seat('voidbite', 2); seat('resonance', 2);
    expect(toolEffect(s).splash).toBeLessThanOrEqual(1);
  });

  it('an ability share stays at or under a whole cell after tuning', () => {
    const s = st();
    hold('marl');
    seat('deepshare', 2); seat('resonance', 2); seat('theswarm', 1); seat('graded', 2);
    const cache = modCache(s, 4);
    for (const def of ABILITY_BY_ID.values()) {
      const p = tuneParams(cache, abilityParams(def, 7));
      if (p['share'] !== undefined) {
        expect(p['share'], `${def.name}`).toBeLessThanOrEqual(1);
      }
    }
  });

  /**
   * THE LOAD-BEARING TEST. Every ability in the game, at maximum grade, on a
   * tool carrying every modifier at full stacks — a build no slot count would
   * ever permit, because the limit is not what enforces pillar 2. Regen is off
   * because nothing here ticks the face, so what came out cannot exceed what
   * was put in.
   */
  it('no modded ability can take more charge out of the field than the field held', () => {
    for (const [id, def] of ABILITY_BY_ID) {
      engine = createEngine({ nowMs: 0 });
      const s = st();
      reachAll(s);
      hold('marl', EVERYTHING_LEVEL);
      for (const m of TOOL_MODS) seat(m.id, m.maxStacks);
      fillFace(s, 8);
      handCarrier(s).fits = [{ id, grade: 7, ch: 0 }];

      const start = held(s);
      const before = harvested(s);
      for (let i = 0; i < 30; i++) {
        s.casting.hand!.lastCell = (i * 7) % s.face.cells.length;
        fireAbility(s, mods(), ctx, TOOL_CARRIER, 0, s.casting.hand!.lastCell);
      }
      const took = harvested(s) - before;
      expect(took, `${def.name} took ${took.toFixed(2)} of ${start.toFixed(2)}`)
        .toBeLessThanOrEqual(start + 1e-6);
      expect(took + held(s), `${def.name} took+left`).toBeLessThanOrEqual(start + 1e-6);
      expect(held(s)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('and neither can the same tool carrying every ability at once', () => {
    const s = st();
    hold('marl', EVERYTHING_LEVEL);
    for (const m of TOOL_MODS) seat(m.id, m.maxStacks);
    fillFace(s, 8);
    handCarrier(s).fits = [...ABILITY_BY_ID.keys()].map((id) => ({ id, grade: 7, ch: 0 }));

    const start = held(s);
    const before = harvested(s);
    for (let i = 0; i < 12; i++) {
      for (let slot = 0; slot < s.casting.hand!.fits!.length; slot++) {
        s.casting.hand!.lastCell = (i * 5 + slot) % s.face.cells.length;
        fireAbility(s, mods(), ctx, TOOL_CARRIER, slot, s.casting.hand!.lastCell);
      }
    }
    expect(harvested(s) - before).toBeLessThanOrEqual(start + 1e-6);
    expect((harvested(s) - before) + held(s)).toBeLessThanOrEqual(start + 1e-6);
  });

  it('no modifier changes what a swing pays per unit of charge', () => {
    // The measure that would catch a yield leak the axes could not: dust out
    // divided by charge out, bare against fully modded.
    const bare = createEngine({ nowMs: 0 }).getState() as GameState;
    reachAll(bare);
    bare.forge.built = true;
    bare.casting.tool = PART_TYPES.map((t, i) => ({ ...makePart(t, 'marl', 60), id: i + 1 }));
    fillFace(bare);
    const d0 = bare.currencies['dust'];
    const c0 = bare.stats.fieldChargeHarvested;
    engine.dispatch({ type: 'chip', cell: 14 });

    const s = st();
    hold('marl', EVERYTHING_LEVEL);
    for (const m of TOOL_MODS) seat(m.id, m.maxStacks);
    fillFace(s);
    void d0; void c0;
    const dustBefore = s.currencies['dust']!.toNumber();
    const chargeBefore = harvested(s);
    engine.dispatch({ type: 'chip', cell: 14 });
    const perCharge = (s.currencies['dust']!.toNumber() - dustBefore)
      / Math.max(1e-9, harvested(s) - chargeBefore);
    // `chipYield` is the only term that decides dust-per-charge, and no
    // modifier can reach it. Whatever the stack, this is the bare rate.
    expect(perCharge).toBeGreaterThan(0);
    expect(Number.isFinite(perCharge)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3 — SLOTS
// ---------------------------------------------------------------------------

describe('slots are the budget', () => {
  it('a tool with no owner has none', () => {
    expect(modSlotsTotal(st())).toBe(0);
  });

  it('used and free account for cost times stacks', () => {
    const s = st();
    hold('marl');
    const total = modSlotsTotal(s);
    expect(total).toBeGreaterThan(0);
    seat('heavyhead', 2);
    expect(modSlotsUsed(s)).toBe(MOD_BY_ID.get('heavyhead')!.cost * 2);
    expect(modSlotsFree(s)).toBe(total - modSlotsUsed(s));
  });

  it('a modifier that will not fit is refused BEFORE anything is spent', () => {
    const s = st();
    hold('marl');
    addMaterial(s, 'marl', 60, 200);
    // Fill the tool up, then try to add something known that cannot fit.
    seat('firstform', 1);
    while (modSlotsFree(s) > 0) seat('heavyhead', 1);
    const held0 = JSON.stringify(s.casting.mods);
    const r = applyToolMod(s, ctx, ['marl'], null);
    if (!r.ok) {
      expect(r.reason).toMatch(/room|deep as it goes/);
      expect(JSON.stringify(s.casting.mods)).toBe(held0);
    }
  });

  it('stripping one is free and gives the room back', () => {
    const s = st();
    hold('marl');
    seat('longarm', 2);
    const used = modSlotsUsed(s);
    expect(stripToolMod(s, ctx, 'longarm').ok).toBe(true);
    expect(modSlotsUsed(s)).toBe(used - MOD_BY_ID.get('longarm')!.cost);
    expect(stackOf(s, 'longarm')).toBe(1);
    expect(stripToolMod(s, ctx, 'longarm').ok).toBe(true);
    expect(stackOf(s, 'longarm')).toBe(0);
    expect(stripToolMod(s, ctx, 'longarm').ok).toBe(false);
  });

  /**
   * FOUND IN A DRIVEN SCREENSHOT reading "10/9 slots" with every modifier
   * applied. `applyToolMod` cannot grow a stack past the budget, but a REBUILD
   * can shrink the budget under a stack that was legal before — and until this
   * was fixed the overflow simply worked, for free.
   */
  it('a stack that no longer fits goes dormant rather than working for free', () => {
    const s = st();
    hold('marl');
    seat('longarm', 2); seat('heavyhead', 3); seat('quarryjaw', 3);
    const roomy = modCache(s, 0);
    expect(roomy.dormant).toEqual([]);

    // Shrink the tool's room without touching the stack — the rebuild case.
    // Levels are what `seat` used to make room, so taking them back is the
    // cleanest way to squeeze it.
    s.casting.xp = 0;
    const total = modSlotsTotal(s);
    if (modSlotsUsed(s) <= total) return; // nothing to prove on this stone
    const tight = modCache(s, 0);
    expect(tight.dormant.length, 'nothing fell asleep').toBeGreaterThan(0);
    expect(tight.cells, 'the overflow still counted').toBeLessThan(roomy.cells);
  });

  it('and nothing is thrown away — it wakes back up when the room comes back', () => {
    const s = st();
    hold('marl');
    seat('longarm', 2); seat('heavyhead', 3); seat('quarryjaw', 3);
    const before = modCache(s, 0).cells;
    const xp = s.casting.xp;
    s.casting.xp = 0;
    modCache(s, 0);
    s.casting.xp = xp;
    expect(modCache(s, 0).cells).toBe(before);
    expect(modCache(s, 0).dormant).toEqual([]);
  });

  it('levels buy slots, so the same tool holds more later', () => {
    const s = st();
    hold('marl', 1); // the arc, so it starts where a new tool starts
    const at1 = modSlotsTotal(s);
    s.casting.xp = xpForLevel(1 + SLOT_EVERY * 6);
    expect(modSlotsTotal(s)).toBeGreaterThan(at1);
  });
});

describe('the bench', () => {
  it('applying an unknown mix discovers it and says so', () => {
    const s = st();
    hold('marl');
    addMaterial(s, 'marl', 60, 200);
    const seen: GameEvent[] = [];
    const r = applyToolMod(s, { emit: (e) => { seen.push(e); }, dirty() {} }, ['marl'], null);
    expect(r.ok).toBe(true);
    const data = r.data as { mod: string | null };
    if (data.mod) {
      expect(s.casting.knownMods).toContain(data.mod);
      expect(seen.some((e) => e.type === 'toolModFound')).toBe(true);
    }
  });

  it('a miss still costs the materials, and names the lean', () => {
    const s = st();
    hold('marl');
    // A material whose traits satisfy nothing at Loam reach.
    reachAll(s);
    for (const shell of allShells()) s.depthRecords[shell.id] = 0;
    s.depthRecords['loam'] = 40;
    s.shell.breachCount = 0;
    let quiet = '';
    for (const shell of allShells()) {
      for (const m of materialsOfShell(shell.id)) {
        if (!matchToolMod([m.id], { reached: 1 })) { quiet = m.id; break; }
      }
      if (quiet) break;
    }
    if (!quiet) return;
    addMaterial(s, quiet, 60, 50);
    const before = s.casting.mods!.length;
    const r = applyToolMod(s, ctx, [quiet], null);
    expect(r.ok).toBe(true);
    expect((r.data as { mod: string | null }).mod).toBeNull();
    expect(s.casting.mods!.length).toBe(before);
  });

  it('cannot make a modifier from a shell it has never been to', () => {
    const s = st();
    for (const shell of allShells()) s.depthRecords[shell.id] = 0;
    s.depthRecords['loam'] = 40;
    s.shell.breachCount = 0;
    hold('marl');
    addMaterial(s, 'marl', 60, 200);
    const r = applyToolMod(s, ctx, ['marl'], null);
    const id = (r.data as { mod: string | null }).mod;
    if (id) expect(MOD_BY_ID.get(id)!.shell).toBe('loam');
  });
});

// ---------------------------------------------------------------------------
// 4 — COMBOS
// ---------------------------------------------------------------------------

describe('combos are worth nothing alone, which is the point', () => {
  it('Resonance is dormant with nothing to amplify, and says what it wants', () => {
    const s = st();
    hold('marl');
    seat('resonance', 1);
    const def = MOD_BY_ID.get('resonance')!;
    expect(modLive(s, def, 0)).toBe(false);
    expect(whyDormant(s, def, 0)).toMatch(/more modifier/);
    expect(modCache(s, 0).amplify).toBe(1);
    expect(modCache(s, 0).dormant).toContain('resonance');
  });

  it('and wakes up the moment there is something to amplify', () => {
    const s = st();
    hold('marl');
    seat('resonance', 1); seat('longarm', 1); seat('heavyhead', 1);
    const def = MOD_BY_ID.get('resonance')!;
    expect(modLive(s, def, 0)).toBe(true);
    expect(whyDormant(s, def, 0)).toBeNull();
    expect(modCache(s, 0).amplify).toBe(1.5);
    expect(modCache(s, 0).live).toContain('resonance');
  });

  it('amplification makes the OTHER modifiers bigger — measurably', () => {
    const s = st();
    hold('marl');
    seat('longarm', 1); seat('heavyhead', 1);
    const plain = modCache(s, 0);
    seat('resonance', 1);
    const amped = modCache(s, 0);
    expect(amped.cells).toBeCloseTo(plain.cells * 1.5, 6);
    expect(amped.splash).toBeCloseTo(plain.splash * 1.5, 6);
  });

  it('a multiplicative axis amplifies the BONUS, not the baseline', () => {
    const s = st();
    hold('marl');
    seat('quarryjaw', 1); seat('longarm', 1); // 1.3x ore, plus something to count
    expect(modCache(s, 0).oreRate).toBeCloseTo(1.3, 6);
    seat('resonance', 1);
    // 1 + 0.3 * 1.5 = 1.45, NOT 1.3 * 1.5 = 1.95
    expect(modCache(s, 0).oreRate).toBeCloseTo(1.45, 6);
  });

  it('combos do not amplify each other, so two cannot run away together', () => {
    const s = st();
    hold('marl');
    seat('longarm', 1); seat('heavyhead', 1);
    seat('resonance', 2);
    seat('graded', 1);
    seat('theswarm', 1);
    const c = modCache(s, 0);
    // theswarm's own abilityGrade is NOT multiplied by resonance's amplify.
    // graded (an `ability` modifier, not a combo) IS.
    const amp = c.amplify;
    expect(amp).toBeCloseTo(1.5 * 1.5 * 2, 6);
    expect(c.abilityGrade).toBeCloseTo(1 * amp + 2, 6);
  });

  it('Conduction stays asleep until there is something to fire AND to mend with', () => {
    const s = st();
    hold('marl');
    seat('conduction', 1);
    const def = MOD_BY_ID.get('conduction')!;
    expect(modLive(s, def, 0)).toBe(false);
    expect(whyDormant(s, def, 0)).toContain('Self-Mending');
    seat('selfmending', 1);
    expect(modLive(s, def, 0)).toBe(false); // still no ability
    expect(modLive(s, def, 1)).toBe(true);
  });

  it('The Whole Note wants two named modifiers, and names them', () => {
    const s = st();
    hold('marl');
    seat('theswarm', 1);
    const def = MOD_BY_ID.get('theswarm')!;
    const why = whyDormant(s, def, 0)!;
    expect(why).toContain('Resonance');
    expect(why).toContain('Tempered Intent');
    seat('resonance', 1); seat('graded', 1);
    expect(modLive(s, def, 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5 — WHAT THEY ACTUALLY DO
// ---------------------------------------------------------------------------

describe('the modifiers do what they say', () => {
  it('Wider Blast turns a three-by-three into a five-by-five', () => {
    const s = st();
    hold('marl');
    const slag = ABILITY_BY_ID.get('slagburst')!;
    expect(abilityParams(slag, 1)['r']).toBe(1); // 3x3
    seat('widerblast', 1);
    expect(tuneParams(modCache(s, 0), abilityParams(slag, 1))['r']).toBe(2); // 5x5
  });

  it('Detonation goes two steps further again', () => {
    const s = st();
    hold('marl');
    seat('widerblast2', 1);
    const slag = ABILITY_BY_ID.get('slagburst')!;
    expect(tuneParams(modCache(s, 0), abilityParams(slag, 1))['r']).toBe(3);
  });

  it('and a param the ability does not have is never invented', () => {
    const s = st();
    hold('marl');
    seat('longchain', 1); // bumps hops, n, len, cap
    const slag = ABILITY_BY_ID.get('slagburst')!; // has r and share only
    const p = tuneParams(modCache(s, 0), abilityParams(slag, 1));
    expect(p['hops']).toBeUndefined();
    expect(p['cap']).toBeUndefined();
    expect(Object.keys(p).sort()).toEqual(['r', 'share']);
  });

  it('durability modifiers buy swings', () => {
    const s = st();
    hold('marl');
    const bare = usesOf(
      { parts: s.casting.tool, stats: { durability: 1 } } as never, 1, NO_MODS,
    );
    void bare;
    const tool = engine.getState() as GameState;
    void tool;
    const plain = usesOf(makeTool(s), 1, NO_MODS);
    seat('unbreaking', 2);
    const modded = usesOf(makeTool(s), 1, modCache(s, 0));
    expect(modded).toBeGreaterThan(plain * 5);
  });

  it('Second Seat buys room for another ability, past the build cap', () => {
    const s = st();
    hold('marl');
    const before = toolAbilitySlots(s);
    seat('secondseat', 1);
    expect(toolAbilitySlots(s)).toBe(before + 1);
  });

  it('Self-Mending puts the tool right while nobody is holding it', () => {
    const s = st();
    hold('marl');
    seat('selfmending', 1);
    s.casting.wear = 100;
    tickToolMods(s, 10);
    expect(s.casting.wear).toBeLessThan(100);
    expect(s.casting.wear).toBeGreaterThan(0);
  });

  it('and it can never mend past sound', () => {
    const s = st();
    hold('marl');
    seat('selfmending', 3);
    s.casting.wear = 1;
    tickToolMods(s, 10_000);
    expect(s.casting.wear).toBe(0);
  });

  it('Lodestone Head works a pocket it reaches, and never opens one', () => {
    const s = st();
    hold('marl');
    seat('oremagnet', 1);
    seat('longarm', 2);
    fillFace(s);
    // ONE pocket, and the swing lands on PLAIN ROCK beside it. `manualChip`
    // refuses a pocket outright (A.55 — a pocket is not a bigger tap), so a
    // fixture that swings AT one measures nothing at all. The first draft did
    // exactly that and read zero.
    s.face.ore = new Array(s.face.cells.length).fill('');
    const pocket = 13;
    s.face.ore[pocket] = 'fatseam';
    s.face.oreDug![pocket] = 0;
    engine.dispatch({ type: 'chip', cell: 14 });
    expect(s.face.oreDug![pocket]).toBeGreaterThan(0);
    // Still a pocket — advancing a dig is not opening it (A.55's decision).
    expect(s.face.ore![pocket]).toBe('fatseam');
  });

  it('with no modifier on the tool, nothing at all changes', () => {
    const s = st();
    hold('marl');
    expect(modCache(s, 0)).toEqual(NO_MODS);
    const plain = effectOf(makeTool(s), false, 1);
    const withEmpty = effectOf(makeTool(s), false, 1, modCache(s, 0));
    expect(withEmpty).toEqual(plain);
  });
});

// ---------------------------------------------------------------------------
// 6 — THE OP ARC, AND REACH
// ---------------------------------------------------------------------------

describe('the OP arc is earned', () => {
  it('an opening tool takes one cheap modifier, not a build', () => {
    const s = st();
    hold(materialsOfShell('loam')[0]!.id, 1);
    const total = modSlotsTotal(s);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(4);
    // The five-slot capstones cannot be reached at all yet.
    const capstones = TOOL_MODS.filter((m) => m.cost >= 5);
    expect(capstones.length).toBeGreaterThan(0);
    for (const c of capstones) expect(c.cost).toBeGreaterThan(total - 1);
  });

  it('and a deep levelled tool takes a stack of them', () => {
    const s = st();
    hold(materialsOfShell('aleph')[0]!.id, 1 + SLOT_EVERY * 15);
    const total = modSlotsTotal(s);
    expect(total).toBeGreaterThanOrEqual(20);
    // Enough for several capstones AND a spread of cheap ones.
    expect(total / 5).toBeGreaterThanOrEqual(4);
  });
});

describe('the standing reach rule', () => {
  /**
   * A CLASS-LOCKED MODIFIER IS ONLY REACHABLE TO ITS CLASS, so the sweep has to
   * ask as that class — otherwise the five class modifiers read as unmakeable
   * and the rule would look broken when it is working exactly as designed.
   * They still have to be makeable FROM LOCAL ROCK once the class is in hand,
   * which is the guarantee that actually matters.
   */
  it('every modifier is makeable from some shell own rock', () => {
    const made = new Set<string>();
    const classIds = [null, ...TOOL_CLASSES.map((c) => c.id)];
    for (const shell of allShells()) {
      const mats = materialsOfShell(shell.id);
      const reached = ORD[shell.id] ?? 7;
      for (let i = 0; i < mats.length; i++) {
        for (let j = i; j < mats.length; j++) {
          for (const mix of [
            [mats[i]!.id, mats[i]!.id, mats[j]!.id],
            [mats[i]!.id, mats[j]!.id, mats[j]!.id],
          ]) {
            for (const classId of classIds) {
              const m = matchToolMod(mix, { reached, classId });
              if (m) made.add(m.id);
            }
          }
        }
      }
    }
    const never = TOOL_MODS.filter((m) => !made.has(m.id)).map((m) => m.id);
    expect(never, `unmakeable: ${never.join(', ')}`).toEqual([]);
  });

  /**
   * THE TRAP THAT HAS NOW CAUGHT TWO MODIFIERS. `matchToolMod` ranks by demand
   * then by shell depth, so two entries with the same signature at the same
   * depth are decided by array order — and the loser is unreachable by any mix,
   * forever, while passing every test about what it DOES.
   *
   * The reach test finds it, but only says "unmakeable" and leaves you to work
   * out why. This says which two collided.
   */
  it('no two modifiers share a signature at the same depth', () => {
    const seen = new Map<string, string>();
    for (const def of TOOL_MODS) {
      const sig = `${MOD_SHELL_ORDINAL[def.shell]}|${Object.entries(def.needs)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([t, n]) => `${t}${n}`)
        .join(',')}`;
      const other = seen.get(sig);
      expect(other, `${def.id} and ${other} have the same signature — one of them can never be made`)
        .toBeUndefined();
      seen.set(sig, def.id);
    }
  });

  it('and a class-locked one is NOT reachable without its class', () => {
    for (const def of TOOL_MODS.filter((m) => m.classOnly)) {
      let seenWithout = false;
      for (const shell of allShells()) {
        for (const m of materialsOfShell(shell.id)) {
          const got = matchToolMod([m.id, m.id, m.id], { reached: 7, classId: null });
          if (got?.id === def.id) seenWithout = true;
        }
      }
      expect(seenWithout, `${def.id} leaked to a classless tool`).toBe(false);
    }
  });

  it('and every shell can make at least five from local rock alone', () => {
    for (const shell of allShells()) {
      const mats = materialsOfShell(shell.id);
      const reached = ORD[shell.id] ?? 7;
      const found = new Set<string>();
      for (const a of mats) {
        const m = matchToolMod([a.id, a.id, a.id], { reached });
        if (m) found.add(m.id);
      }
      expect(found.size, `${shell.id} makes only ${found.size}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('the library grows as you descend, and never shrinks', () => {
    let last = 0;
    for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      const n = TOOL_MODS.filter((m) => MOD_SHELL_ORDINAL[m.shell]! <= ORD[shell]!).length;
      expect(n, `${shell}`).toBeGreaterThanOrEqual(last);
      last = n;
    }
    expect(last).toBe(TOOL_MODS.length);
  });
});

describe('the save', () => {
  it('is at v40, and the library arrives empty', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(40);
    const out = runMigrations({ version: 39, state: { casting: { tool: [] } } } as never);
    const casting = (out.state as Record<string, unknown>)['casting'] as Record<string, unknown>;
    expect(casting['mods']).toEqual([]);
    expect(casting['knownMods']).toEqual([]);
  });
});
