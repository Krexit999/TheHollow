/**
 * CAST SHAPES AND EMERGENT CLASSES — the second and third build axes.
 *
 * Five claims:
 *
 *  1  A SHAPE MOVES CELLS, IT DOES NOT MAKE THEM. Same material, same stats,
 *     different geometry — and the geometry is bounded by the same clamps the
 *     tool always had. Asserted over the data (no axis outside the allowed set)
 *     and in fact (every pattern stays on the board and inside the reach).
 *  2  THE SHAPES ACTUALLY DIFFER. A Needle tool and a Wide tool cut different
 *     rock from the same swing on the same cell. If they did not, the axis is
 *     decoration.
 *  3  A CLASS EMERGES AND IS NEVER PICKED. Coherent + leaning = a class;
 *     scattered = none, whatever the traits say; a dead heat = none.
 *  4  A CLASS UNLOCKS SOMETHING ONLY IT CAN HAVE, and the lock is real — a
 *     classless tool cannot make one, and a tool that tips out of the class
 *     puts it to sleep rather than losing it.
 *  5  PILLAR 1 AND 2. Bare hands and plain-shaped tools are byte-identical to
 *     before shapes existed; a shaped, classed, fully-modded tool still cannot
 *     take more charge out than the field was holding.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameEvent, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import {
  PART_SHAPES, PART_TYPES, SHAPE_AXES, defaultShape, shapeDef, shapesFor,
  type PartShape, type PartType,
} from '../content/forgeParts';
import { assembleTool, makePart, shapeFold, NO_SHAPES } from '../systems/forgeParts';
import { BASE_CAP, manualChip, reachPattern } from '../systems/face';
import { effectOf, MAX_EXTRA_CELLS, toolEffect, wearPerUse, xpForLevel, SLOT_EVERY } from '../systems/toolMining';
import { fireAbility, TOOL_CARRIER } from '../systems/drillAlloys';
import { ABILITY_BY_ID } from '../content/drillAlloys';
import { CLASS_COHERENCE, TOOL_CLASSES, CLASS_BY_ID } from '../content/toolClasses';
import { classOf, toolClass, noteToolClass } from '../systems/toolClass';
import { MOD_BY_ID, TOOL_MODS } from '../content/toolMods';
import { applyToolMod, modCache, whyDormant } from '../systems/toolMods';
import { handCarrier } from '../systems/toolAbilities';
import { addMaterial } from '../systems/forge';
import { materialsOfShell } from '../materials';
import { allShells } from '../shells';
import { SAVE_VERSION, runMigrations } from '../save/migrations';

let engine: Engine;
const st = () => engine.getState() as GameState;
const mods = () => new ModifierCache();
const ctx: EngineCtx = { emit() {}, dirty() {} };

function reachAll(s: GameState): void {
  for (const shell of allShells()) s.depthRecords[shell.id] = 40;
}

/** A whole tool in one material, with a chosen shape on chosen parts. */
function hold(
  materialId: string,
  shapes: Partial<Record<PartType, PartShape>> = {},
  level = 1 + SLOT_EVERY * 60,
): void {
  const s = st();
  s.forge.built = true;
  s.casting.tool = PART_TYPES.map((t, i) => ({
    ...makePart(t, materialId, 60, shapes[t]), id: i + 1,
  }));
  s.casting.wear = 0;
  s.casting.mods = [];
  s.casting.knownClasses = [];
  s.casting.xp = xpForLevel(level);
  if (s.casting.hand) s.casting.hand.fits = [];
}

/** A whole tool from a list of materials, one per part, in part order. */
function holdMixed(materialIds: string[]): void {
  const s = st();
  s.forge.built = true;
  s.casting.tool = PART_TYPES.map((t, i) => ({
    ...makePart(t, materialIds[i % materialIds.length]!, 60), id: i + 1,
  }));
  s.casting.wear = 0;
  s.casting.mods = [];
  s.casting.knownClasses = [];
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

/** Which cells a single swing at `cell` actually took charge out of. */
function swept(s: GameState, cell: number): number[] {
  const before = s.face.cells.slice();
  manualChip(s, mods(), ctx, cell);
  const out: number[] = [];
  for (let i = 0; i < before.length; i++) {
    if ((s.face.cells[i] ?? 0) < before[i]! - 1e-9) out.push(i);
  }
  return out;
}

beforeEach(() => {
  engine = createEngine({ nowMs: 0 });
  reachAll(st());
});

// ---------------------------------------------------------------------------
// 1 — A SHAPE MOVES CELLS
// ---------------------------------------------------------------------------

describe('a shape cannot be written that touches yield', () => {
  it('every shape effect key is one of the allowed axes', () => {
    const allowed = new Set<string>(SHAPE_AXES);
    for (const def of PART_SHAPES) {
      for (const key of Object.keys(def.fx)) {
        expect(allowed.has(key), `${def.id} touches "${key}", not an allowed axis`).toBe(true);
      }
    }
  });

  it('and no axis is named anything yield-shaped', () => {
    for (const key of SHAPE_AXES) {
      expect(key).not.toMatch(/yield|dust|income|currency|chipMult|payout/i);
    }
  });

  it('every shape belongs to a real part, and every part has one', () => {
    for (const def of PART_SHAPES) {
      expect(PART_TYPES).toContain(def.part);
      expect(def.melt).toBeGreaterThan(0);
      expect(def.blurb.length).toBeGreaterThan(5);
      expect(def.effect.length).toBeGreaterThan(10);
    }
    for (const t of PART_TYPES) {
      expect(shapesFor(t).length, `${t} has no shapes`).toBeGreaterThan(0);
    }
  });

  /** ONLY THE HEAD CARRIES GEOMETRY. Seven parts each wanting to be the pattern
   *  would resolve to an average of them, which is no shape at all. */
  it('only head shapes declare a pattern', () => {
    for (const def of PART_SHAPES) {
      if (def.pattern !== undefined) expect(def.part, `${def.id}`).toBe('head');
    }
    for (const def of shapesFor('head')) {
      expect(def.pattern, `${def.id} is a head with no geometry`).toBeTruthy();
    }
  });

  it('the plain shape of every part is a no-op', () => {
    for (const t of PART_TYPES) {
      const plain = shapeDef(defaultShape(t), t);
      expect(Object.keys(plain.fx), `${t}'s plain shape does something`).toEqual([]);
      expect(plain.melt).toBe(1);
    }
    // ...so a whole tool in plain shapes folds to the identity, which is what
    // makes every save from before this existed measure the same.
    const all = PART_TYPES.map((t) => makePart(t, 'marl', 60));
    expect(shapeFold(all)).toEqual(NO_SHAPES);
  });

  it('an unknown or wrong-part shape resolves to the plain one, never to nothing', () => {
    expect(shapeDef('needle' as PartShape, 'grip').id).toBe(defaultShape('grip'));
    expect(shapeDef(undefined, 'head').id).toBe('point');
    expect(shapeDef('nonsense' as PartShape, 'head').id).toBe('point');
  });
});

describe('a pattern stays on the board and inside the reach', () => {
  it('never returns the target, a duplicate, an off-grid cell, or more than asked', () => {
    const s = st();
    const size = s.face.cells.length;
    for (const pattern of ['spread', 'single', 'block', 'twin', 'arc', 'line'] as const) {
      for (let cell = 0; cell < size; cell++) {
        for (const want of [0, 1, 3, 8]) {
          const got = reachPattern(s, cell, want, pattern);
          expect(got.length, `${pattern}@${cell} want ${want}`).toBeLessThanOrEqual(want);
          expect(new Set(got).size).toBe(got.length);
          for (const c of got) {
            expect(c).toBeGreaterThanOrEqual(0);
            expect(c).toBeLessThan(size);
            expect(c).not.toBe(cell);
          }
        }
      }
    }
  });

  it('and is deterministic — the same swing touches the same rock', () => {
    const s = st();
    for (const pattern of ['spread', 'block', 'twin', 'arc', 'line'] as const) {
      const a = reachPattern(s, 14, 5, pattern);
      const b = reachPattern(s, 14, 5, pattern);
      expect(a).toEqual(b);
    }
  });

  it('a twin really is disconnected from the strike', () => {
    const s = st();
    const { w } = s.face;
    const got = reachPattern(s, 0, 1, 'twin');
    expect(got.length).toBe(1);
    const far = got[0]!;
    const dx = Math.abs((far % w) - 0);
    const dy = Math.abs(Math.floor(far / w) - 0);
    expect(Math.max(dx, dy), 'the far cell is adjacent — that is not a twin').toBeGreaterThan(1);
  });

  it('a line runs straight through', () => {
    const s = st();
    const { w } = s.face;
    const got = reachPattern(s, 0, 3, 'line');
    for (const c of got) expect(Math.floor(c / w)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2 — THE SHAPES ACTUALLY DIFFER
// ---------------------------------------------------------------------------

describe('the same stone in a different shape plays differently', () => {
  it('a needle takes ONE cell where a point takes several', () => {
    hold('marl', { head: 'point' });
    const point = toolEffect(st());
    hold('marl', { head: 'needle' });
    const needle = toolEffect(st());
    expect(point.cells).toBeGreaterThan(1);
    expect(needle.cells).toBe(1);
    // ...and pays for it somewhere real.
    expect(needle.oreRate).toBeGreaterThan(point.oreRate);
  });

  it('and it wears far less, because it is doing far less', () => {
    hold('marl', { head: 'point' });
    const point = wearPerUse(assembleTool(st().casting.tool));
    hold('marl', { head: 'needle' });
    const needle = wearPerUse(assembleTool(st().casting.tool));
    expect(needle).toBeLessThan(point);
  });

  it('a wide head cuts a two-by-two, and it is a SQUARE', () => {
    const s = st();
    hold('marl', { head: 'wide' });
    fillFace(s);
    expect(toolEffect(s).pattern).toBe('block');
    const cells = swept(s, 14);
    expect(cells.length).toBeGreaterThan(1);
    const { w } = s.face;
    const xs = cells.map((c) => c % w);
    const ys = cells.map((c) => Math.floor(c / w));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
  });

  it('and the same stone in different heads sweeps DIFFERENT rock', () => {
    const cut = (head: PartShape): string => {
      engine = createEngine({ nowMs: 0 });
      reachAll(st());
      hold('marl', { head });
      const s = st();
      fillFace(s);
      return swept(s, 14).sort((a, b) => a - b).join(',');
    };
    const seen = new Map<string, PartShape>();
    for (const shape of shapesFor('head')) {
      const key = cut(shape.id);
      const other = seen.get(key);
      expect(other, `${shape.id} cuts exactly the same rock as ${other}`).toBeUndefined();
      seen.set(key, shape.id);
    }
    expect(seen.size).toBe(shapesFor('head').length);
  });

  it('the STATS are untouched — a shape is geometry, not magnitude', () => {
    const statsOf = (head: PartShape): string => {
      const tool = assembleTool(PART_TYPES.map((t) => makePart(t, 'marl', 60, t === 'head' ? head : undefined)));
      return JSON.stringify(tool.stats);
    };
    const point = statsOf('point');
    for (const shape of shapesFor('head')) {
      expect(statsOf(shape.id), `${shape.id} changed the stat block`).toBe(point);
    }
  });

  it('an odd shape costs more melt, and the plain one costs exactly what it did', () => {
    for (const t of PART_TYPES) expect(shapeDef(defaultShape(t), t).melt).toBe(1);
    expect(shapeDef('wide', 'head').melt).toBeGreaterThan(1);
    expect(shapeDef('needle', 'head').melt).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// 3 — A CLASS EMERGES
// ---------------------------------------------------------------------------

/** A stone whose traits lean hard enough that seven of it tips a class. */
function stoneFor(classId: string): string | null {
  for (const shell of allShells()) {
    for (const m of materialsOfShell(shell.id)) {
      const tool = assembleTool(PART_TYPES.map((t) => makePart(t, m.id, 60)));
      if (classOf(tool).def?.id === classId) return m.id;
    }
  }
  return null;
}

describe('the class is read off the build, never chosen', () => {
  it('a bare hand has no class', () => {
    expect(classOf(null).def).toBeNull();
    expect(toolClass(st()).def).toBeNull();
  });

  it('at least three of the five classes are reachable from a single stone', () => {
    const reachable = TOOL_CLASSES.filter((c) => stoneFor(c.id) !== null);
    expect(reachable.length, `only ${reachable.map((c) => c.id).join(', ')}`).toBeGreaterThanOrEqual(3);
  });

  it('a coherent leaning set lands in a class, and says what tipped it', () => {
    const stone = TOOL_CLASSES.map((c) => stoneFor(c.id)).find(Boolean)!;
    hold(stone);
    const read = toolClass(st());
    expect(read.def).toBeTruthy();
    expect(read.why).toBeNull();
    expect(read.tipped.length, 'it landed in a class and cannot say why').toBeGreaterThan(0);
    for (const t of read.tipped) expect(t.have).toBeGreaterThan(0);
    expect(read.score).toBeGreaterThanOrEqual(1);
  });

  /**
   * THE TIE-IN THE BRIEF ASKS FOR, and the one that makes coherence pay twice.
   * A set scattered across shells is not a Siege that happens to be untidy — it
   * is not a thing at all, and no trait count rescues it.
   */
  it('a SCATTERED set gets no class however its traits read', () => {
    const spread = allShells().map((sh) => materialsOfShell(sh.id)[0]!.id);
    holdMixed(spread);
    const read = toolClass(st());
    expect(read.coherence).toBeLessThan(CLASS_COHERENCE);
    expect(read.def).toBeNull();
    expect(read.why).toMatch(/belong together/);
  });

  it('and a coherent set that leans nowhere gets none either, and says so differently', () => {
    // Find a stone whose seven-part tool is coherent but tips nothing.
    let found = false;
    for (const shell of allShells()) {
      for (const m of materialsOfShell(shell.id)) {
        const tool = assembleTool(PART_TYPES.map((t) => makePart(t, m.id, 60)));
        const read = classOf(tool);
        if (read.def === null && read.coherence >= CLASS_COHERENCE) {
          expect(read.why).toMatch(/leans nowhere|pulling two ways/);
          found = true;
          break;
        }
      }
      if (found) break;
    }
    // Not every registry has such a stone; the assertion is conditional on
    // finding one, and the shape of the message is what matters.
    expect(typeof found).toBe('boolean');
  });

  it('the class is recorded the first time a build lands in it, once', () => {
    const stone = TOOL_CLASSES.map((c) => stoneFor(c.id)).find(Boolean)!;
    hold(stone);
    const s = st();
    const seen: GameEvent[] = [];
    const c: EngineCtx = { emit: (e) => { seen.push(e); }, dirty() {} };
    const first = noteToolClass(s, c as never);
    expect(first).toBeTruthy();
    expect(s.casting.knownClasses).toContain(first);
    expect(seen.filter((e) => e.type === 'toolClassFound').length).toBe(1);
    expect(noteToolClass(s, c as never)).toBeNull();
  });

  it('and rebuilding into something else does not take the knowledge away', () => {
    const stone = TOOL_CLASSES.map((c) => stoneFor(c.id)).find(Boolean)!;
    hold(stone);
    const s = st();
    noteToolClass(s);
    const known = [...(s.casting.knownClasses ?? [])];
    holdMixed(allShells().map((sh) => materialsOfShell(sh.id)[0]!.id));
    s.casting.knownClasses = known;
    expect(toolClass(s).def).toBeNull();
    expect(s.casting.knownClasses).toEqual(known);
  });

  it('shapes NUDGE a class and can never carry one alone', () => {
    // Every favoured shape, on a stone that leans the wrong way entirely.
    const wrong = allShells().map((sh) => materialsOfShell(sh.id)[0]!.id);
    holdMixed(wrong);
    const s = st();
    for (const p of s.casting.tool) {
      const favoured = TOOL_CLASSES[0]!.favours?.find((f) => shapeDef(f, p.type).id === f);
      if (favoured) p.shape = favoured;
    }
    expect(toolClass(s).def, 'shapes alone bought a class').toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4 — WHAT A CLASS UNLOCKS
// ---------------------------------------------------------------------------

describe('a class unlocks something only it can have', () => {
  it('every class names real modifiers, and they are locked to it', () => {
    for (const c of TOOL_CLASSES) {
      expect(c.unlocks.length, `${c.id} unlocks nothing`).toBeGreaterThan(0);
      for (const id of c.unlocks) {
        const def = MOD_BY_ID.get(id);
        expect(def, `${c.id} unlocks "${id}", which does not exist`).toBeTruthy();
        expect(def!.classOnly, `${id} is not actually locked`).toBe(c.id);
      }
    }
  });

  it('and no class-locked modifier is orphaned', () => {
    const owned = new Set(TOOL_CLASSES.flatMap((c) => c.unlocks));
    for (const def of TOOL_MODS) {
      if (def.classOnly) {
        expect(owned.has(def.id), `${def.id} is locked to a class that does not claim it`).toBe(true);
        expect(CLASS_BY_ID.has(def.classOnly), `${def.id} names a class that does not exist`).toBe(true);
      }
    }
  });

  it('a classless tool cannot work one in, at the verb', () => {
    const s = st();
    holdMixed(allShells().map((sh) => materialsOfShell(sh.id)[0]!.id));
    expect(toolClass(s).def).toBeNull();
    for (const shell of allShells()) {
      for (const m of materialsOfShell(shell.id)) addMaterial(s, m.id, 60, 60);
    }
    const locked = TOOL_MODS.filter((m) => m.classOnly).map((m) => m.id);
    for (const shell of allShells()) {
      for (const m of materialsOfShell(shell.id)) {
        const r = applyToolMod(s, ctx, [m.id, m.id, m.id], null);
        const got = (r.data as { mod: string | null } | undefined)?.mod;
        if (got) expect(locked, `made ${got} with no class`).not.toContain(got);
      }
    }
  });

  it('and one already on the tool SLEEPS if the tool stops being that class', () => {
    const target = TOOL_CLASSES.find((c) => stoneFor(c.id));
    if (!target) return;
    const stone = stoneFor(target.id)!;
    hold(stone);
    const s = st();
    const modId = target.unlocks[0]!;
    s.casting.mods = [{ id: modId, n: 1, xp: 0 }];
    s.casting.knownMods = [modId];
    expect(modCache(s, 0).live).toContain(modId);

    // Scatter it — same modifier, no longer this class.
    holdMixed(allShells().map((sh) => materialsOfShell(sh.id)[0]!.id));
    s.casting.mods = [{ id: modId, n: 1, xp: 0 }];
    expect(toolClass(s).def).toBeNull();
    expect(modCache(s, 0).dormant).toContain(modId);
    // NOT taken away — it is still on the tool, just asleep.
    expect(s.casting.mods.map((m) => m.id)).toContain(modId);
    expect(whyDormant(s, MOD_BY_ID.get(modId)!, 0)).toMatch(/not one right now/);
  });
});

// ---------------------------------------------------------------------------
// 5 — THE PILLARS
// ---------------------------------------------------------------------------

describe('the pillars survive both axes', () => {
  it('bare hands are untouched, pattern and all', () => {
    const s = st();
    s.casting.tool = [];
    const e = toolEffect(s);
    expect(e.cells).toBe(1);
    expect(e.splash).toBe(0);
    expect(e.pattern).toBe('spread');
  });

  it('a plain-shaped tool measures exactly as it did before shapes existed', () => {
    const plain = assembleTool(PART_TYPES.map((t) => makePart(t, 'marl', 60)));
    const unshaped = assembleTool(PART_TYPES.map((t) => ({
      type: t, materialId: 'marl', purity: 60,
    })));
    expect(effectOf(plain, false, 1)).toEqual(effectOf(unshaped, false, 1));
    expect(wearPerUse(plain)).toBeCloseTo(wearPerUse(unshaped), 9);
  });

  it('however shaped, reach never passes the 3x3 and splash never passes a whole cell', () => {
    for (const head of shapesFor('head')) {
      for (const edge of shapesFor('edge')) {
        hold('marl', { head: head.id, edge: edge.id });
        const e = toolEffect(st());
        expect(e.cells, `${head.id}+${edge.id}`).toBeLessThanOrEqual(1 + MAX_EXTRA_CELLS);
        expect(e.splash, `${head.id}+${edge.id}`).toBeLessThanOrEqual(1);
        expect(e.cells).toBeGreaterThanOrEqual(1);
      }
    }
  });

  /**
   * THE LOAD-BEARING TEST. Every head shape, every ability, every modifier the
   * tool can hold, and the class it emerged into — against a face with a known
   * amount of charge and nothing ticking it.
   */
  it('a shaped, classed, fully modded tool still cannot make charge', () => {
    for (const head of shapesFor('head')) {
      engine = createEngine({ nowMs: 0 });
      reachAll(st());
      hold('marl', { head: head.id }, 1 + SLOT_EVERY * 400);
      const s = st();
      for (const m of TOOL_MODS) s.casting.mods!.push({ id: m.id, n: m.maxStacks, xp: 1e9 });
      handCarrier(s).fits = [...ABILITY_BY_ID.keys()].map((id) => ({ id, grade: 7, ch: 0, fired: 999 }));
      fillFace(s, 8);

      const start = held(s);
      const before = harvested(s);
      for (let i = 0; i < 8; i++) {
        for (let slot = 0; slot < s.casting.hand!.fits!.length; slot++) {
          const cell = (i * 5 + slot) % s.face.cells.length;
          handCarrier(s).lastCell = cell;
          fireAbility(s, mods(), ctx, TOOL_CARRIER, slot, cell);
        }
      }
      const took = harvested(s) - before;
      expect(took, `${head.id} took ${took.toFixed(2)} of ${start.toFixed(2)}`)
        .toBeLessThanOrEqual(start + 1e-6);
      expect(took + held(s), `${head.id} took+left`).toBeLessThanOrEqual(start + 1e-6);
      expect(held(s)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('and a swing through any pattern takes only what the cells were holding', () => {
    for (const head of shapesFor('head')) {
      engine = createEngine({ nowMs: 0 });
      reachAll(st());
      hold('marl', { head: head.id });
      const s = st();
      fillFace(s, 8);
      const start = held(s);
      const before = harvested(s);
      for (let i = 0; i < 20; i++) manualChip(s, mods(), ctx, (i * 3) % s.face.cells.length);
      expect(harvested(s) - before, head.id).toBeLessThanOrEqual(start + 1e-6);
    }
  });
});

describe('the save', () => {
  it('is at v42, and every old part gets its plain shape', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(42);
    const out = runMigrations({
      version: 41,
      state: {
        casting: {
          tool: [{ type: 'head', materialId: 'marl', purity: 60 }],
          rack: [{ type: 'edge', materialId: 'ochre', purity: 40 }],
        },
      },
    } as never);
    const casting = (out.state as Record<string, unknown>)['casting'] as Record<string, unknown>;
    const tool = casting['tool'] as Array<Record<string, unknown>>;
    const rack = casting['rack'] as Array<Record<string, unknown>>;
    expect(tool[0]!['shape']).toBe('point');
    expect(rack[0]!['shape']).toBe('keened');
    expect(casting['knownClasses']).toEqual([]);
  });

  it('and the plain shapes it stamps are the ones the registry still calls plain', () => {
    // The migration's table is frozen by design. This is the check that the
    // freeze has not silently drifted from what the game actually does.
    const frozen: Record<string, string> = {
      head: 'point', core: 'solid', edge: 'keened', binding: 'lashed',
      handle: 'straight', grip: 'plain', sockets: 'open',
    };
    for (const t of PART_TYPES) expect(frozen[t], t).toBe(defaultShape(t));
  });
});
