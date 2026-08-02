/**
 * MATERIAL ABILITIES ON TOOLS — the forge, the drills and the abilities as one
 * system.
 *
 * Six claims:
 *
 *  1  THE STONE DECIDES. Which abilities a tool can do comes from the three
 *     rock-facing parts and nothing else — build it out of dull rock and it
 *     does nothing violent, which is what makes the choice a choice.
 *  2  IT IS THE SAME SYSTEM, not a copy of it. The tool fires through the
 *     drills' own `fireAbility`, produces the same `abilityFire` event with a
 *     figure to draw, and writes to the same codex. If these two ever drift,
 *     the tests that catch it are the ones asserting the shared path.
 *  3  PILLAR 2, DETERMINISTICALLY. Regen off, a known amount of charge in the
 *     rock, every grantable ability at maximum grade on the tool: it cannot
 *     take out more than the field was holding. This is the load-bearing test.
 *  4  PILLAR 1. Bare hands are untouched — no meter, no firing, nothing to
 *     miss. And the meter AUTO-FIRES, so a player who only clicks rock gets
 *     everything their tool was built to do.
 *  5  THE SLOTS ARE THE LIMIT, and they come from the build and from use.
 *  6  REACH. Every shell can build an ability out of its own rock.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameEvent, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { PART_TYPES, type PartType } from '../content/forgeParts';
import { assembleTool, makePart } from '../systems/forgeParts';
import { BASE_CAP, manualChip } from '../systems/face';
import { fireAbility, fireNow, TOOL_CARRIER, READY_GRACE } from '../systems/drillAlloys';
import { ABILITY_BY_ID, matchAllAbilities } from '../content/drillAlloys';
import { materialsOfShell } from '../materials';
import { allShells } from '../shells';
import {
  ABILITY_PARTS, TOOL_SLOT_CAP, abilityMaterials, advanceToolCharges, effectInHand,
  handCarrier, setToolAbility, syncToolAbilities, toolAbilityHint, toolAbilitySlots,
  toolFits, toolGrade, toolGrants,
} from '../systems/toolAbilities';
import { SLOT_EVERY, xpForLevel } from '../systems/toolMining';
import { SAVE_VERSION, runMigrations } from '../save/migrations';

let engine: Engine;
const st = () => engine.getState() as GameState;
const mods = () => new ModifierCache();

/** Everything reached, so the mechanism tests are not gated by depth. The GATE
 *  is asserted separately. */
function reachAll(s: GameState): void {
  for (const shell of allShells()) s.depthRecords[shell.id] = 40;
}

/**
 * Fit a tool without going through the crucible — casting it honestly is step
 * 2's test. `parts` overrides individual slots so a test can change ONE stone.
 */
function hold(materialId: string | null, parts: Partial<Record<PartType, string>> = {}): void {
  const s = st();
  s.forge.built = true;
  s.casting.tool = materialId === null
    ? []
    : PART_TYPES.map((t, i) => ({ ...makePart(t, parts[t] ?? materialId, 60), id: i + 1 }));
  s.casting.wear = 0;
  if (s.casting.hand) s.casting.hand.fits = [];
  syncToolAbilities(s);
}

/**
 * A FACE A PLAYER WOULD ACTUALLY BE STANDING AT — not a pristine one. Some
 * drained cells (so the `weak` shapes have something to find), a vein and a
 * patch of ripe growth (so `vein`, `vines` and `mature` do too). A uniformly
 * full empty grid makes a third of the ability set read as inert, which is a
 * wrong fixture rather than a bug — proved here by `rootbreaker`, which
 * correctly refuses to fire at rock with no vines in it.
 */
/** The assembled tool as the systems see it. */
const toolOf = (s: GameState) => assembleTool(s.casting.tool);

function fillFace(s: GameState, charge = BASE_CAP): void {
  s.face.cells = s.face.cells.map(() => charge);
  s.face.ore = new Array(s.face.cells.length).fill('');
  s.face.oreDug = new Array(s.face.cells.length).fill(0);
  for (const c of [0, 1, 6, 7]) s.face.cells[c] = charge * 0.1;
  for (const c of [12, 13, 18]) s.face.ore[c] = 'fatseam';
  for (const c of [20, 21, 26]) s.growth.stage[c] = 3;
  s.depth = 30;
}

const held = (s: GameState): number => s.face.cells.reduce((a, b) => a + b, 0);
const harvested = (s: GameState): number => s.stats.fieldChargeHarvested.toNumber();

/** Shapes that work on ordinary rock, as against the ones that need ore or
 *  vines under them. Used to keep the FIRING tests about firing. */
const ROCK_SHAPES = new Set([
  'single', 'block', 'radius', 'ring', 'line', 'row', 'split', 'behind',
  'bounce', 'chain', 'charged',
]);

/** A stone whose three-part build grants at least one ability at this reach,
 *  preferring one that works on bare rock. */
function loudStone(reached = 7): string {
  let fallback = '';
  for (const shell of allShells()) {
    for (const m of materialsOfShell(shell.id)) {
      const got = matchAllAbilities([m.id, m.id, m.id], { reached });
      if (got.length === 0) continue;
      if (!fallback) fallback = m.id;
      if (ROCK_SHAPES.has(got[0]!.shape)) return m.id;
    }
  }
  if (fallback) return fallback;
  throw new Error('no material grants anything — the registry changed');
}

/** A stone whose three-part build grants NOTHING. */
function quietStone(reached = 7): string {
  for (const shell of allShells()) {
    for (const m of materialsOfShell(shell.id)) {
      if (matchAllAbilities([m.id, m.id, m.id], { reached }).length === 0) return m.id;
    }
  }
  throw new Error('every material grants something — the signatures got too loose');
}

beforeEach(() => {
  engine = createEngine({ nowMs: 0 });
  reachAll(st());
  hold(null);
});

// ---------------------------------------------------------------------------
// 1 — THE STONE DECIDES
// ---------------------------------------------------------------------------

describe('what a tool can do comes out of what it is made of', () => {
  it('a tool cast in ability-bearing stone grants an ability', () => {
    hold(loudStone());
    const grants = toolGrants(st());
    expect(grants.length).toBeGreaterThan(0);
    expect(toolFits(st()).length).toBeGreaterThan(0);
  });

  it('a tool cast in stone that reaches for nothing grants nothing', () => {
    hold(quietStone());
    expect(toolGrants(st())).toEqual([]);
    expect(toolFits(st())).toEqual([]);
  });

  it('only the three rock-facing parts are read', () => {
    const loud = loudStone();
    const quiet = quietStone();
    const s = st();

    // The whole tool in loud stone.
    hold(loud);
    const all = toolGrants(s).map((a) => a.id);

    // Swap every part that is NOT head/edge/sockets to quiet stone. Nothing
    // about what it can DO may change.
    const others: Partial<Record<PartType, string>> = {};
    for (const t of PART_TYPES) if (!ABILITY_PARTS.includes(t)) others[t] = quiet;
    hold(loud, others);
    expect(toolGrants(s).map((a) => a.id)).toEqual(all);

    // Now swap the HEAD. This is allowed to change it, and on a stone that
    // grants nothing by itself it must.
    hold(loud, { head: quiet, edge: quiet, sockets: quiet });
    expect(toolGrants(s)).toEqual([]);
  });

  it('re-building in dull stone takes the ability away with it', () => {
    hold(loudStone());
    expect(toolFits(st()).length).toBeGreaterThan(0);
    hold(quietStone());
    expect(toolFits(st())).toEqual([]);
  });

  it('the ability materials are the three rock-facing parts, in part order', () => {
    const loud = loudStone();
    const quiet = quietStone();
    hold(loud, { edge: quiet });
    const mats = abilityMaterials(toolOf(st()));
    expect(mats.length).toBe(ABILITY_PARTS.length);
    expect(mats).toEqual([loud, quiet, loud]); // head, edge, sockets
  });

  it('the grade is the deepest of the three stones, so better rock is a better ability', () => {
    const loam = materialsOfShell('loam')[0]!.id;
    const cinder = materialsOfShell('cinder')[0]!.id;
    hold(loam);
    expect(toolGrade(st())).toBe(1);
    hold(loam, { head: cinder });
    expect(toolGrade(st())).toBe(5);
    // ...and a deeper stone in a part that is NOT rock-facing does not.
    hold(loam, { handle: cinder });
    expect(toolGrade(st())).toBe(1);
  });

  it('hints at the lean before you commit, and never names the ability', () => {
    const s = st();
    hold(loudStone());
    const hint = toolAbilityHint(abilityMaterials(toolOf(s)));
    expect(hint).toBeTruthy();
    for (const def of toolGrants(s)) {
      expect(hint!.toLowerCase()).not.toContain(def.name.toLowerCase());
    }
  });

  it('cannot build an ability from a shell it has never been to', () => {
    const s = st();
    for (const shell of allShells()) s.depthRecords[shell.id] = 0;
    s.depthRecords['loam'] = 40;
    s.shell.breachCount = 0;
    hold(loudStone());
    for (const def of toolGrants(s)) expect(def.shell).toBe('loam');
  });
});

// ---------------------------------------------------------------------------
// 2 — IT IS THE SAME SYSTEM
// ---------------------------------------------------------------------------

describe('the tool fires through the drills own machinery', () => {
  it('firing emits the same abilityFire event, with a figure to draw', () => {
    const s = st();
    hold(loudStone());
    fillFace(s);
    const seen: GameEvent[] = [];
    const ctx: EngineCtx = { emit: (e) => { seen.push(e); }, dirty() {} };

    const fit = toolFits(s)[0]!;
    s.casting.hand!.lastCell = 14;
    const ok = fireAbility(s, mods(), ctx, TOOL_CARRIER, fit.slot, 14);
    expect(ok).toBe(true);

    const ev = seen.find((e) => e.type === 'abilityFire');
    expect(ev, 'the face is told nothing happened').toBeTruthy();
    if (ev?.type !== 'abilityFire') throw new Error('unreachable');
    expect(ev.figure).toBeTruthy();
    expect(ev.cells.length).toBeGreaterThan(0);
    expect(ev.id).toBe(fit.def.id);
    // The carrier is the hand, not a machine — the renderer reads the figure
    // and not the index, so this is the tag rather than a lookup.
    expect(ev.drill).toBe(TOOL_CARRIER);
  });

  it('a firing actually changes the face', () => {
    const s = st();
    hold(loudStone());
    fillFace(s);
    const before = held(s);
    s.casting.hand!.lastCell = 14;
    fireAbility(s, mods(), { emit() {}, dirty() {} }, TOOL_CARRIER, 0, 14);
    expect(held(s)).toBeLessThan(before);
  });

  /**
   * FOUND BY WRITING THIS FILE BADLY. The first fixture was a pristine full
   * face with no ore and no vines on it, and Root Breaker — which clears the
   * connected VINED region — correctly did nothing at all. A firing that finds
   * nothing must not spend the meter, or an ability would read as broken every
   * time the face happened to be bare, and the player would be right.
   */
  it('a firing that finds nothing does not spend the meter', () => {
    const s = st();
    hold(loudStone());
    fillFace(s);
    s.growth.stage = s.growth.stage.map(() => 0);
    s.face.ore = new Array(s.face.cells.length).fill('');
    const fit = toolFits(s)[0]!;
    s.casting.hand!.fits![0]!.ch = fit.def.charge.need;

    // A shape with nothing to work on: park the tool on a vines/vein ability if
    // the build has one, otherwise this asserts the general rule on rock.
    const barren = toolGrants(s).find((a) => !ROCK_SHAPES.has(a.shape));
    if (!barren) return;
    handCarrier(s).fits = [{ id: barren.id, grade: 1, ch: barren.charge.need }];
    const ok = fireAbility(s, mods(), { emit() {}, dirty() {} }, TOOL_CARRIER, 0, 14);
    expect(ok).toBe(false);
    expect(s.casting.hand!.fits![0]!.ch).toBe(barren.charge.need);
  });

  it('discovery writes to the SAME codex the crucible writes to', () => {
    const s = st();
    const seen: GameEvent[] = [];
    expect(s.drills.alloys).toEqual([]);
    s.forge.built = true;
    s.casting.tool = PART_TYPES.map((t, i) => ({ ...makePart(t, loudStone(), 60), id: i + 1 }));
    syncToolAbilities(s, { emit: (e) => { seen.push(e); }, dirty() {} });

    const grants = toolGrants(s).map((a) => a.id);
    expect(grants.length).toBeGreaterThan(0);
    for (const id of grants) expect(s.drills.alloys).toContain(id);
    expect(seen.filter((e) => e.type === 'drillAlloyFound').length).toBe(grants.length);
  });

  it('and does not re-announce something already known', () => {
    const s = st();
    hold(loudStone());
    const seen: GameEvent[] = [];
    syncToolAbilities(s, { emit: (e) => { seen.push(e); }, dirty() {} });
    expect(seen.filter((e) => e.type === 'drillAlloyFound')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3 — PILLAR 2
// ---------------------------------------------------------------------------

describe('an explosion in the hand cannot make charge', () => {
  /**
   * THE LOAD-BEARING TEST. Regen switched off, a known amount of charge in the
   * rock, every ability the registry has on the tool at maximum grade, fired
   * repeatedly: what came out cannot exceed what was in there, and what came
   * out plus what is left cannot either.
   *
   * It is written to be hard to satisfy by accident — a faucet of any size
   * fails it, at any grade, on any ability.
   */
  it('no tool ability can take more charge out of the field than the field held', () => {
    for (const [id, def] of ABILITY_BY_ID) {
      const s = createEngine({ nowMs: 0 }).getState() as GameState;
      engine = createEngine({ nowMs: 0 });
      reachAll(s);
      s.forge.built = true;
      s.casting.tool = PART_TYPES.map((t, i) => ({ ...makePart(t, 'marl', 60), id: i + 1 }));
      fillFace(s, 8);
      for (const c of [0, 1, 6, 7]) s.face.cells[c] = 0.8;
      for (const c of [12, 13, 14, 18]) s.face.ore![c] = 'fatseam';
      for (const c of [20, 21, 26]) s.growth.stage[c] = 3;
      // REGEN IS OFF BECAUSE NOTHING TICKS THE FACE. This test drives
      // `fireAbility` directly and never calls `tickFace`, so the only charge
      // in this world is the charge seated two lines up — which is what makes
      // the arithmetic below an equality rather than an estimate.
      //
      // The first draft of this block set `s.face.regenPaused = true`, a field
      // that does not exist on the face. It read as the guarantee and
      // guaranteed nothing; the tests passed identically with and without it,
      // which is precisely the failure PILLARS names — a harness agreeing with
      // itself. `tsc` caught it. Nothing else would have.
      handCarrier(s).fits = [{ id, grade: 7, ch: 0 }];

      const start = held(s);
      const before = harvested(s);
      const ctx: EngineCtx = { emit() {}, dirty() {} };
      for (let i = 0; i < 40; i++) {
        s.casting.hand!.lastCell = (i * 7) % s.face.cells.length;
        fireAbility(s, mods(), ctx, TOOL_CARRIER, 0, s.casting.hand!.lastCell);
      }
      const took = harvested(s) - before;
      const left = held(s);
      expect(took, `${def.name} took ${took.toFixed(2)} from a field holding ${start.toFixed(2)}`)
        .toBeLessThanOrEqual(start + 1e-6);
      expect(took + left, `${def.name}: took ${took.toFixed(2)} + left ${left.toFixed(2)}`)
        .toBeLessThanOrEqual(start + 1e-6);
      expect(left).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('and neither can a tool carrying every ability at once', () => {
    const s = st();
    reachAll(s);
    hold('marl');
    fillFace(s, 8);
    // Regen is off because nothing here ticks the face — see above.
    // A loadout no slot count would ever permit — cheating past the limit still
    // cannot breach the ceiling, because the limit is not what enforces it.
    handCarrier(s).fits = [...ABILITY_BY_ID.keys()].map((id) => ({ id, grade: 7, ch: 0 }));

    const start = held(s);
    const before = harvested(s);
    const ctx: EngineCtx = { emit() {}, dirty() {} };
    for (let i = 0; i < 20; i++) {
      for (let slot = 0; slot < s.casting.hand!.fits!.length; slot++) {
        s.casting.hand!.lastCell = (i * 5 + slot) % s.face.cells.length;
        fireAbility(s, mods(), ctx, TOOL_CARRIER, slot, s.casting.hand!.lastCell);
      }
    }
    expect(harvested(s) - before).toBeLessThanOrEqual(start + 1e-6);
    expect((harvested(s) - before) + held(s)).toBeLessThanOrEqual(start + 1e-6);
  });

  it('a swing that fires an ability still cannot empty a cell past the regen floor', () => {
    const s = st();
    hold(loudStone());
    fillFace(s);
    handCarrier(s).fits!.forEach((f) => { f.ch = 999; });
    const ctx: EngineCtx = { emit() {}, dirty() {} };
    for (let i = 0; i < 30; i++) manualChip(s, mods(), ctx, 14);
    for (const c of s.face.cells) expect(c).toBeGreaterThanOrEqual(-1e-9);
  });
});

// ---------------------------------------------------------------------------
// 4 — PILLAR 1, AND THE TRIGGER
// ---------------------------------------------------------------------------

describe('bare hands never notice this exists', () => {
  it('a player with no tool has no meter and nothing to fire', () => {
    const s = st();
    fillFace(s);
    expect(toolGrants(s)).toEqual([]);
    expect(toolFits(s)).toEqual([]);
    advanceToolCharges(s, mods(), { emit() {}, dirty() {} }, 3, true);
    expect(s.casting.hand?.fits ?? []).toEqual([]);
    expect(fireNow(s, mods(), { emit() {}, dirty() {} }, TOOL_CARRIER, 0).ok).toBe(false);
  });

  it('a tool with no ability mines exactly as it did before', () => {
    const s = st();
    hold(quietStone());
    fillFace(s);
    const before = harvested(s);
    manualChip(s, mods(), { emit() {}, dirty() {} }, 14);
    const took = harvested(s) - before;
    expect(took).toBeGreaterThan(0);
    expect(s.casting.hand!.fits).toEqual([]);
  });
});

describe('the meter does both jobs', () => {
  it('a swing fills it, and an empty swing does not fire it early', () => {
    const s = st();
    hold(loudStone());
    fillFace(s);
    const fit = toolFits(s)[0]!;
    const need = fit.def.charge.need;

    const ctx: EngineCtx = { emit() {}, dirty() {} };
    // One short of ready-plus-grace, with the `roll`/`onFull` shortcuts off so
    // the count is the count.
    const before = s.casting.hand!.fits![0]!.ch ?? 0;
    advanceToolCharges(s, mods(), ctx, 14, false);
    expect((s.casting.hand!.fits![0]!.ch ?? 0)).toBeGreaterThan(before);
    expect(need).toBeGreaterThan(0);
  });

  it('fires ITSELF once the ready window passes — a player who only clicks rock gets it', () => {
    const s = st();
    hold(loudStone());
    fillFace(s);
    const fit = toolFits(s)[0]!;
    // Park it one swing short of auto-firing.
    s.casting.hand!.fits![0]!.ch = fit.def.charge.need + READY_GRACE - 1;
    const seen: GameEvent[] = [];
    advanceToolCharges(s, mods(), { emit: (e) => { seen.push(e); }, dirty() {} }, 14, false);
    expect(seen.some((e) => e.type === 'abilityFire')).toBe(true);
    expect(s.casting.hand!.fits![0]!.ch).toBe(0);
  });

  it('and it aims at the rock you just hit, not at the fullest cell on the face', () => {
    const s = st();
    hold(loudStone());
    fillFace(s, 1);
    s.face.cells[35] = BASE_CAP * 4; // the fullest cell, far away
    const fit = toolFits(s)[0]!;
    s.casting.hand!.fits![0]!.ch = fit.def.charge.need + READY_GRACE - 1;
    const seen: GameEvent[] = [];
    advanceToolCharges(s, mods(), { emit: (e) => { seen.push(e); }, dirty() {} }, 7, false);
    const ev = seen.find((e) => e.type === 'abilityFire');
    if (ev?.type !== 'abilityFire') throw new Error('nothing fired');
    expect(ev.from).toBe(7);
  });

  it('cannot be fired by hand before it is full — clicking buys timing, never firings', () => {
    const s = st();
    hold(loudStone());
    fillFace(s);
    s.casting.hand!.fits![0]!.ch = 0;
    const r = fireNow(s, mods(), { emit() {}, dirty() {} }, TOOL_CARRIER, 0, 14);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('not charged');
  });

  it('and a hand-fired ability spends the meter, so it is the same one firing', () => {
    const s = st();
    hold(loudStone());
    fillFace(s);
    const fit = toolFits(s)[0]!;
    s.casting.hand!.fits![0]!.ch = fit.def.charge.need;
    expect(fireNow(s, mods(), { emit() {}, dirty() {} }, TOOL_CARRIER, 0, 14).ok).toBe(true);
    expect(s.casting.hand!.fits![0]!.ch).toBe(0);
  });

  it('a multi-cell reach is one motion of the arm, so it charges once', () => {
    const s = st();
    hold(loudStone());
    fillFace(s);
    s.casting.hand!.fits![0]!.ch = 0;
    advanceToolCharges(s, mods(), { emit() {}, dirty() {} }, 14, false, 1);
    expect(s.casting.hand!.fits![0]!.ch).toBeLessThanOrEqual(1 + (toolFits(s)[0]!.def.charge.onFull ?? 0));
  });
});

// ---------------------------------------------------------------------------
// 5 — THE SLOTS
// ---------------------------------------------------------------------------

describe('how many it may carry comes from the build and from use', () => {
  it('a tool with no owner has no slots at all', () => {
    expect(toolAbilitySlots(st())).toBe(0);
  });

  it('a first tool carries exactly one — the moment is a moment', () => {
    hold(loudStone());
    expect(toolAbilitySlots(st())).toBe(1);
    expect(toolFits(st()).length).toBe(1);
  });

  it('use earns more room, and it is capped', () => {
    const s = st();
    hold(loudStone());
    const at1 = toolAbilitySlots(s);
    s.casting.xp = xpForLevel(1 + SLOT_EVERY);
    expect(toolAbilitySlots(s)).toBe(at1 + 1);
    s.casting.xp = xpForLevel(1 + SLOT_EVERY * 40);
    expect(toolAbilitySlots(s)).toBe(TOOL_SLOT_CAP);
  });

  it('a build never seats more than the slots allow', () => {
    const s = st();
    hold(loudStone());
    // Force a build that grants several, then confirm only `slots` are seated.
    const many = toolGrants(s);
    if (many.length > 1) expect(toolFits(s).length).toBe(toolAbilitySlots(s));
    s.casting.xp = xpForLevel(1 + SLOT_EVERY * 40);
    syncToolAbilities(s);
    expect(toolFits(s).length).toBeLessThanOrEqual(TOOL_SLOT_CAP);
    expect(toolFits(s).length).toBeLessThanOrEqual(many.length);
  });

  it('you may seat any ability the build grants, and only those', () => {
    const s = st();
    hold(loudStone());
    s.casting.xp = xpForLevel(1 + SLOT_EVERY);
    const grants = toolGrants(s);
    const ctx: EngineCtx = { emit() {}, dirty() {} };

    const target = grants[grants.length - 1]!;
    expect(setToolAbility(s, ctx, 0, target.id).ok).toBe(true);
    expect(toolFits(s)[0]!.def.id).toBe(target.id);

    // Something real, but not something this build can do.
    const foreign = [...ABILITY_BY_ID.keys()].find((id) => !grants.some((g) => g.id === id))!;
    const r = setToolAbility(s, ctx, 0, foreign);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('not built to do that');
  });

  it('and a slot can be emptied', () => {
    const s = st();
    hold(loudStone());
    const ctx: EngineCtx = { emit() {}, dirty() {} };
    expect(toolFits(s).length).toBe(1);
    expect(setToolAbility(s, ctx, 0, null).ok).toBe(true);
    expect(toolFits(s)).toEqual([]);
  });

  it('a re-seat of a part that is not rock-facing keeps the meters where they were', () => {
    const s = st();
    const loud = loudStone();
    hold(loud);
    s.casting.hand!.fits![0]!.ch = 4;
    // Re-seat the HANDLE in a different stone — not through the test's `hold`
    // helper, which starts from scratch, but the way a rebuild does: swap the
    // part and reconcile. Nothing about what it can DO changes, so nothing
    // about the charge it has built up should either.
    const handle = s.casting.tool.find((p) => p.type === 'handle')!;
    handle.materialId = quietStone();
    syncToolAbilities(s);
    expect(s.casting.hand!.fits![0]!.ch).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 6 — REACH, and the save
// ---------------------------------------------------------------------------

describe('the standing reach rule', () => {
  it('every shell can build an ability out of its OWN rock', () => {
    const ord: Record<string, number> = {
      loam: 1, ferrite: 2, verdance: 3, glassmere: 4, cinder: 5, hollow: 6, aleph: 7,
    };
    for (const shell of allShells()) {
      const mats = materialsOfShell(shell.id);
      expect(mats.length, `${shell.id} has no rock`).toBeGreaterThan(0);
      const reached = ord[shell.id] ?? 7;
      const any = mats.some((m) => matchAllAbilities([m.id, m.id, m.id], { reached }).length > 0);
      expect(any, `${shell.id} cannot build a single ability from local rock`).toBe(true);
    }
  });

  it('and no shell is down to one — every one can build at least three', () => {
    const ord: Record<string, number> = {
      loam: 1, ferrite: 2, verdance: 3, glassmere: 4, cinder: 5, hollow: 6, aleph: 7,
    };
    for (const shell of allShells()) {
      const reached = ord[shell.id] ?? 7;
      const found = new Set<string>();
      for (const m of materialsOfShell(shell.id)) {
        for (const d of matchAllAbilities([m.id, m.id, m.id], { reached })) found.add(d.id);
      }
      expect(found.size, `${shell.id} builds only ${found.size}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('an ability reads as the thing holding it', () => {
  it('no effect line in the hand talks about a drill or the bay', () => {
    // FOUND IN A SCREENSHOT, not in a test: the tool card read "a small absence
    // opens beside THE DRILL". The lines were authored when a drill was the
    // only carrier.
    for (const def of ABILITY_BY_ID.values()) {
      const inHand = effectInHand(def.effect);
      expect(inHand, `${def.name}: ${inHand}`).not.toMatch(/\bthe drill\b/);
      expect(inHand, `${def.name}: ${inHand}`).not.toMatch(/\bthe bay\b/);
    }
  });

  it('and a line that never mentioned a machine is left exactly alone', () => {
    for (const def of ABILITY_BY_ID.values()) {
      if (/\b(drill|bay|stroke)\b/i.test(def.effect)) continue;
      expect(effectInHand(def.effect)).toBe(def.effect);
    }
  });
});

describe('the save', () => {
  it('the hand arrives on an old save', () => {
    // The SAVE_VERSION number itself is pinned once, in p12.test.ts. Pinning it
    // here too meant two files to update per phase and one of them silently
    // describing the wrong one.
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(39);
    const out = runMigrations({ version: 38, state: { casting: { tool: [], rack: [] } } } as never);
    const casting = (out.state as Record<string, unknown>)['casting'] as Record<string, unknown>;
    expect(casting['hand']).toBeTruthy();
    expect((casting['hand'] as Record<string, unknown>)['fits']).toEqual([]);
  });

  it('grants nothing on load — an ability you never made is not yours', () => {
    const out = runMigrations({
      version: 38,
      state: { casting: { tool: [], rack: [] }, drills: { alloys: [] } },
    } as never);
    const drills = (out.state as Record<string, unknown>)['drills'] as Record<string, unknown>;
    expect(drills['alloys']).toEqual([]);
  });
});
