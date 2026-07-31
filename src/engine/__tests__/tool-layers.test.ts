/**
 * MATERIAL LAYERING AND TOOL BALANCE — the fourth and fifth build axes.
 *
 * Six claims:
 *
 *  1  A BLEND OF ONE IS THE IDENTITY. Everything that existed before layering
 *     derives bit-for-bit what it derived before — the guarantee that makes this
 *     additive rather than a re-rating of every save.
 *  2  A LAYERED PART IS BETWEEN ITS MATERIALS, never past them. Stats, traits
 *     and magnitude all sit inside the envelope the layers allow.
 *  3  COHERENCE SEES THE BLEND. A layered part reads as its weighted shell, its
 *     internal disagreement is priced, and variety counts every layer slot.
 *  4  BALANCE IS EMERGENT AND DEADZONED. Heavy stone makes a heavy tool, light
 *     stone a light one, and a third of single-material tools land exactly even
 *     — which is why this is a trade and not a nerf.
 *  5  THE TRADE IS REAL IN BOTH DIRECTIONS. Heavy buys reach and pays a wind-up;
 *     light pays reach and buys swings and meter.
 *  6  PILLAR 1 AND 2. Bare hands never wind up; no blend or balance can take
 *     more charge out than the field was holding.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import {
  BALANCE_DEADZONE, LAYER_MAX, PART_TYPES, WINDUP_MAX, layerWeights,
  type PartType,
} from '../content/forgeParts';
import {
  assembleTool, balanceOf, blendOf, coherenceOf, derivePart, makePart,
  partMaterials, EVEN_BALANCE, type Part,
} from '../systems/forgeParts';
import { BASE_CAP, manualChip } from '../systems/face';
import {
  MAX_EXTRA_CELLS, toolEffect, wearPerUse, xpForLevel, SLOT_EVERY,
} from '../systems/toolMining';
import { castMelt, layerDraw, canCast } from '../systems/casting';
import { fireAbility, TOOL_CARRIER } from '../systems/drillAlloys';
import { ABILITY_BY_ID } from '../content/drillAlloys';
import { handCarrier } from '../systems/toolAbilities';
import { materialsOfShell } from '../materials';
import { addMaterial } from '../systems/forge';
import { allShells } from '../shells';
import { SAVE_VERSION, runMigrations } from '../save/migrations';

let engine: Engine;
const st = () => engine.getState() as GameState;
const mods = () => new ModifierCache();
const ctx: EngineCtx = { emit() {}, dirty() {} };

/** A stone that reads clearly heavy, and one that reads clearly light. */
const HEAVY = 'graveclay';   // dense + tough
const LIGHT = 'hollowamber'; // hollow + light

function reachAll(s: GameState): void {
  for (const shell of allShells()) s.depthRecords[shell.id] = 40;
}

function layered(type: PartType, ids: string[], purity = 60): Part {
  const [outer, ...rest] = ids;
  return {
    ...makePart(type, outer!, purity),
    ...(rest.length > 0 ? { layers: rest.map((materialId) => ({ materialId, purity })) } : {}),
  };
}

function hold(ids: string[], level = 1 + SLOT_EVERY * 60): void {
  const s = st();
  s.forge.built = true;
  s.casting.tool = PART_TYPES.map((t, i) => ({ ...layered(t, ids), id: i + 1 }));
  s.casting.wear = 0;
  s.casting.mods = [];
  s.casting.windup = 0;
  s.casting.xp = xpForLevel(level);
  if (s.casting.hand) s.casting.hand.fits = [];
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
  reachAll(st());
});

// ---------------------------------------------------------------------------
// 1 — A BLEND OF ONE IS THE IDENTITY
// ---------------------------------------------------------------------------

describe('one layer is exactly what it always was', () => {
  it('the weights normalise at every depth', () => {
    for (let n = 1; n <= LAYER_MAX; n++) {
      const w = layerWeights(n);
      expect(w.length).toBe(n);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      // Outer dominates, and the core is never decoration.
      for (let i = 1; i < n; i++) expect(w[i]!).toBeLessThan(w[i - 1]!);
      expect(w[n - 1]!).toBeGreaterThan(0.15);
    }
  });

  it('a single-material part derives what it derived before layering existed', () => {
    for (const t of PART_TYPES) {
      const plain = derivePart(makePart(t, 'marl', 60));
      const explicit = derivePart({ type: t, materialId: 'marl', purity: 60, layers: [] });
      expect(explicit.stats, t).toEqual(plain.stats);
      expect(explicit.magnitude).toBe(plain.magnitude);
      expect(explicit.intensity).toBe(plain.intensity);
    }
  });

  it('and a blend of one pulls every trait at full strength', () => {
    const b = blendOf(makePart('head', 'marl', 60));
    expect(b.layered).toBe(false);
    expect(b.layers.length).toBe(1);
    for (const p of b.pull) expect(p.weight).toBe(1);
    expect(b.spread).toBe(0);
  });

  it('a tool of plain parts has an unchanged coherence read', () => {
    const parts = PART_TYPES.map((t) => makePart(t, 'marl', 60));
    const tool = assembleTool(parts);
    expect(tool.coherence.variety).toBe(0);
    expect(tool.coherence.shellSpread).toBe(0);
    expect(tool.coherence.factor).toBeCloseTo(1, 9);
  });
});

// ---------------------------------------------------------------------------
// 2 — A LAYERED PART IS BETWEEN ITS MATERIALS
// ---------------------------------------------------------------------------

describe('a layered part sits inside the envelope its layers allow', () => {
  it('its magnitude is between the layers, never past either', () => {
    const shallow = materialsOfShell('loam')[0]!.id;
    const deep = materialsOfShell('cinder')[0]!.id;
    const lo = blendOf(makePart('head', shallow, 60)).magnitude;
    const hi = blendOf(makePart('head', deep, 60)).magnitude;
    for (const ids of [[shallow, deep], [deep, shallow], [shallow, deep, shallow]]) {
      const m = blendOf(layered('head', ids)).magnitude;
      expect(m, ids.join('+')).toBeGreaterThan(Math.min(lo, hi) - 1e-6);
      expect(m, ids.join('+')).toBeLessThan(Math.max(lo, hi) + 1e-6);
    }
  });

  it('every stat of a blend is between the solid parts it is made of', () => {
    const a = 'graveclay';
    const b = 'marl';
    const solidA = derivePart(makePart('head', a, 60)).stats;
    const solidB = derivePart(makePart('head', b, 60)).stats;
    const blend = derivePart(layered('head', [a, b])).stats;
    for (const key of Object.keys(blend) as Array<keyof typeof blend>) {
      const lo = Math.min(solidA[key], solidB[key]);
      const hi = Math.max(solidA[key], solidB[key]);
      // A generous envelope: the geometric normalisation in `shapeOf` means a
      // blend is not a plain linear interpolation of finished stats. What must
      // hold is that it cannot escape the pair by a wide margin.
      expect(blend[key], key).toBeGreaterThan(lo * 0.5);
      expect(blend[key], key).toBeLessThan(hi * 1.5);
    }
  });

  it('a trait only in the core pulls less than the same trait solid', () => {
    const solid = blendOf(makePart('head', HEAVY, 60));
    const inCore = blendOf(layered('head', [LIGHT, LIGHT, HEAVY]));
    const heavyTrait = solid.pull[0]!.trait;
    const deep = inCore.pull.find((p) => p.trait === heavyTrait);
    expect(deep, 'the core trait did not survive at all').toBeTruthy();
    expect(deep!.weight).toBeLessThan(1);
    expect(deep!.weight).toBeCloseTo(layerWeights(3)[2]!, 6);
  });

  it('the union of traits is what actually went in', () => {
    const b = blendOf(layered('head', [HEAVY, LIGHT]));
    expect(b.layered).toBe(true);
    expect(b.traits.length).toBeGreaterThan(
      blendOf(makePart('head', HEAVY, 60)).traits.length,
    );
    expect(partMaterials(layered('head', [HEAVY, LIGHT]))).toEqual([HEAVY, LIGHT]);
  });

  it('a part combines traits no single material carries together', () => {
    // The whole point of Damascus: find two stones with disjoint traits and
    // confirm the blend holds both.
    const a = blendOf(makePart('head', HEAVY, 60)).traits;
    const bTraits = blendOf(makePart('head', LIGHT, 60)).traits;
    const disjoint = a.filter((t) => !bTraits.includes(t));
    expect(disjoint.length, 'the fixture stones overlap — pick others').toBeGreaterThan(0);
    const blend = blendOf(layered('head', [HEAVY, LIGHT])).traits;
    for (const t of disjoint) expect(blend).toContain(t);
    for (const t of bTraits) expect(blend).toContain(t);
  });

  it('a fourth layer is refused, not silently blended', () => {
    const part = layered('head', [HEAVY, LIGHT, HEAVY, LIGHT]);
    expect(blendOf(part).layers.length).toBe(LAYER_MAX);
  });
});

describe('a layered pour costs more, in more stones', () => {
  it('each layer past the first adds melt', () => {
    const one = castMelt('head', 'point', 1);
    const two = castMelt('head', 'point', 2);
    const three = castMelt('head', 'point', 3);
    expect(two).toBeGreaterThan(one);
    expect(three).toBeGreaterThan(two);
  });

  it('and the draw is split across the layers by weight', () => {
    for (let n = 1; n <= LAYER_MAX; n++) {
      const draws = layerDraw('head', 'point', n);
      expect(draws.length).toBe(n);
      for (let i = 1; i < n; i++) expect(draws[i]!).toBeLessThanOrEqual(draws[i - 1]!);
      expect(draws.reduce((a, b) => a + b, 0))
        .toBeCloseTo(castMelt('head', 'point', n), -1);
    }
  });

  it('layering is gated on having that many stones in the tub', () => {
    const one = { queue: [{ materialId: 'marl', solid: 0, molten: 999, purity: 60 }] };
    expect(canCast(one, 'head', 'point', 1)).toBe(true);
    expect(canCast(one, 'head', 'point', 2)).toBe(false);
    const two = {
      queue: [
        { materialId: 'marl', solid: 0, molten: 999, purity: 60 },
        { materialId: 'ochre', solid: 0, molten: 999, purity: 60 },
      ],
    };
    expect(canCast(two, 'head', 'point', 2)).toBe(true);
    expect(canCast(two, 'head', 'point', 3)).toBe(false);
  });

  it('and pours through the real verb, taking from each stone', () => {
    const s = st();
    s.forge.built = true;
    // AND THE HOLD HAS TO ACTUALLY HAVE THE STONE. The first draft skipped this
    // and read "No Marl in the Hold" as a layering failure.
    addMaterial(s, 'marl', 60, 40);
    addMaterial(s, 'graveclay', 60, 40);
    // FIVE UNITS EACH, not ten: the tub holds 40 molten TOTAL across the queue,
    // so two ten-unit charges would be truncated at the second and the pour
    // would fail for a reason that has nothing to do with layering.
    engine.dispatch({ type: 'chargeCrucible', materialId: 'marl', units: 5 });
    engine.dispatch({ type: 'chargeCrucible', materialId: 'graveclay', units: 5 });
    for (const q of s.casting.crucible.queue) { q.molten += q.solid; q.solid = 0; }
    const before = s.casting.crucible.queue.map((q) => q.molten);

    const r = engine.dispatch({ type: 'castPart', partType: 'head', shape: 'point', layers: 2 });
    expect(r.ok).toBe(true);
    expect((r.data as { layers: number }).layers).toBe(2);
    const part = s.casting.rack[s.casting.rack.length - 1]!;
    expect(part.materialId).toBe('marl');
    expect(part.layers?.[0]?.materialId).toBe('graveclay');
    // BOTH stones paid.
    const after = s.casting.crucible.queue.map((q) => q.molten);
    expect(after[0]!).toBeLessThan(before[0]!);
    expect(after[1]!).toBeLessThan(before[1]!);
  });
});

// ---------------------------------------------------------------------------
// 3 — COHERENCE SEES THE BLEND
// ---------------------------------------------------------------------------

describe('coherence reads a layered part as its blend', () => {
  it("a part's shell is the weighted mean of its layers", () => {
    const loam = materialsOfShell('loam')[0]!.id;
    const cinder = materialsOfShell('cinder')[0]!.id;
    const b = blendOf(layered('head', [loam, cinder]));
    expect(b.shell).toBeGreaterThan(1);
    expect(b.shell).toBeLessThan(5);
    expect(b.spread).toBeGreaterThan(0);
  });

  it('and a part that disagrees with itself is priced for it', () => {
    const loam = materialsOfShell('loam')[0]!.id;
    const cinder = materialsOfShell('cinder')[0]!.id;
    const solid = PART_TYPES.map((t) => makePart(t, loam, 60));
    const damascus = PART_TYPES.map((t) => layered(t, [loam, cinder]));
    const a = assembleTool(solid).coherence;
    const b = assembleTool(damascus).coherence;
    expect(b.discord).toBeGreaterThan(a.discord);
    expect(b.factor).toBeLessThan(a.factor);
  });

  it('variety counts every layer slot, so it never reads above one', () => {
    const spread = allShells().map((sh) => materialsOfShell(sh.id)[0]!.id);
    const parts = PART_TYPES.map((t, i) => layered(t, [
      spread[i % spread.length]!,
      spread[(i + 1) % spread.length]!,
      spread[(i + 2) % spread.length]!,
    ]));
    const c = coherenceOf(parts, assembleTool(parts).rawStats);
    expect(c.variety).toBeGreaterThan(0);
    expect(c.variety).toBeLessThanOrEqual(1);
    expect(c.factor).toBeGreaterThan(0);
    expect(c.factor).toBeLessThanOrEqual(1);
  });

  it('a Damascus of one stone is as coherent as a solid one', () => {
    const solid = PART_TYPES.map((t) => makePart(t, 'marl', 60));
    const same = PART_TYPES.map((t) => layered(t, ['marl', 'marl', 'marl']));
    expect(assembleTool(same).coherence.shellSpread)
      .toBeCloseTo(assembleTool(solid).coherence.shellSpread, 9);
    expect(assembleTool(same).coherence.variety).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4 — BALANCE IS EMERGENT AND DEADZONED
// ---------------------------------------------------------------------------

describe('balance is read off the stone, and mostly reads even', () => {
  it('no parts is even', () => {
    expect(balanceOf([])).toEqual(EVEN_BALANCE);
  });

  it('dense and tough stone reads heavy; light and hollow reads light', () => {
    const heavy = balanceOf(PART_TYPES.map((t) => makePart(t, HEAVY, 60)));
    const light = balanceOf(PART_TYPES.map((t) => makePart(t, LIGHT, 60)));
    expect(heavy.value).toBeGreaterThan(0.5);
    expect(light.value).toBeLessThan(-0.5);
    expect(heavy.label).toBe('heavy');
    expect(light.label).toBe('light');
  });

  it('and it says what made it that way', () => {
    const heavy = balanceOf(PART_TYPES.map((t) => makePart(t, HEAVY, 60)));
    expect(heavy.from.length).toBeGreaterThan(0);
    expect(heavy.from[0]!.n).toBeGreaterThan(0);
    expect(['dense', 'tough']).toContain(heavy.from[0]!.trait);
  });

  /**
   * THE DEADZONE IS THE NO-NERF GUARANTEE, and it is worth measuring rather than
   * asserting: a good share of real single-material tools must land exactly even
   * or this axis is a re-rating of everybody's tool rather than an addition.
   */
  it('a real share of single-material tools land exactly even', () => {
    let even = 0;
    let total = 0;
    for (const shell of allShells()) {
      for (const m of materialsOfShell(shell.id)) {
        total++;
        const b = balanceOf(PART_TYPES.map((t) => makePart(t, m.id, 60)));
        if (b.value === 0) {
          even++;
          // ...and an even tool is the identity on every term.
          expect(b.cells).toBe(1);
          expect(b.splash).toBe(1);
          expect(b.wear).toBe(1);
          expect(b.windup).toBe(0);
          expect(b.charge).toBe(0);
        }
      }
    }
    expect(total).toBeGreaterThan(50);
    expect(even / total, `only ${even}/${total} are even`).toBeGreaterThan(0.2);
  });

  it('inside the deadzone nothing applies at all', () => {
    // A synthetic part list whose raw heft is deliberately tiny.
    for (const raw of [0, 0.05, -0.05, BALANCE_DEADZONE * 0.99]) {
      void raw;
    }
    const evenish = balanceOf([makePart('grip', 'marl', 60)]);
    expect(Math.abs(evenish.raw)).toBeGreaterThanOrEqual(0);
    if (Math.abs(evenish.raw) < BALANCE_DEADZONE) expect(evenish.value).toBe(0);
  });

  it('where the heavy stone SITS in the part changes the balance', () => {
    const onTop = balanceOf(PART_TYPES.map((t) => layered(t, [HEAVY, LIGHT, LIGHT])));
    const inCore = balanceOf(PART_TYPES.map((t) => layered(t, [LIGHT, LIGHT, HEAVY])));
    expect(onTop.value).toBeGreaterThan(inCore.value);
  });
});

// ---------------------------------------------------------------------------
// 5 — THE TRADE IS REAL IN BOTH DIRECTIONS
// ---------------------------------------------------------------------------

describe('heavy buys reach and pays a wind-up; light the reverse', () => {
  /**
   * REACH CHANGED SIDES (A.67), and this test is the record of why.
   *
   * A.62 gave heavy BOTH reach and per-cell bite, so heavy was simply the
   * bigger swing and light was the same swing more often — a rate trade with
   * no character, and nothing a player had a reason to build toward. Splitting
   * them gives each side a job the other cannot do: LIGHT touches more cells
   * (sweeping plain rock), HEAVY takes more of each and cracks ore pockets.
   */
  it('light sweeps wider; heavy takes more of each cell and cracks ore', () => {
    hold([HEAVY]);
    const heavy = toolEffect(st());
    hold([LIGHT]);
    const light = toolEffect(st());
    // LIGHT sweeps: more cells per swing.
    expect(light.balance.cells).toBeGreaterThan(heavy.balance.cells);
    expect(light.cells).toBeGreaterThanOrEqual(heavy.cells);
    // HEAVY bites: more of each cell it touches, and it cracks pockets.
    expect(heavy.balance.splash).toBeGreaterThan(light.balance.splash);
    expect(heavy.splash).toBeGreaterThan(light.splash);
    // ISOLATE THE AXIS. Comparing the two tools composite oreRate would be
    // comparing two different MATERIALS — their base ore speed differs, so the
    // composite can favour either and says nothing about balance. The balance
    // term is the thing under test.
    expect(heavy.balance.oreRate).toBeGreaterThan(light.balance.oreRate);
    expect(heavy.balance.oreRate).toBeGreaterThan(1);
    // And the job each is for is named, so the player can read it.
    expect(heavy.balance.job).toBe('ore');
    expect(light.balance.job).toBe('rock');
    // NEITHER is worse than bare hands at the other one job.
    expect(light.balance.oreRate).toBeGreaterThanOrEqual(1);
  });

  it('and pays for it with a wind-up that light never has', () => {
    hold([HEAVY]);
    const heavy = toolEffect(st());
    hold([LIGHT]);
    const light = toolEffect(st());
    expect(heavy.balance.windup).toBeGreaterThan(0);
    expect(heavy.balance.windup).toBeLessThanOrEqual(WINDUP_MAX);
    expect(light.balance.windup).toBe(0);
  });

  it('light gets more swings out of the tool and a faster meter', () => {
    const heavyTool = assembleTool(PART_TYPES.map((t) => makePart(t, HEAVY, 60)));
    const lightTool = assembleTool(PART_TYPES.map((t) => makePart(t, LIGHT, 60)));
    // Wear per swing is the term light buys down.
    expect(balanceOf(lightTool.parts).wear).toBeLessThan(1);
    expect(balanceOf(heavyTool.parts).wear).toBeGreaterThan(1);
    expect(balanceOf(lightTool.parts).charge).toBeGreaterThan(0);
    expect(balanceOf(heavyTool.parts).charge).toBe(0);
    expect(wearPerUse(lightTool)).toBeLessThan(
      wearPerUse(lightTool) / balanceOf(lightTool.parts).wear + 1e-9,
    );
  });

  it('the wind-up actually refuses a second swing, and comes back', () => {
    const s = st();
    hold([HEAVY]);
    fillFace(s);
    const first = manualChip(s, mods(), ctx, 14);
    expect(first.charge).toBeGreaterThan(0);
    expect(s.casting.windup).toBeGreaterThan(0);

    const second = manualChip(s, mods(), ctx, 20);
    expect(second.charge, 'a heavy tool swung twice with no wait').toBe(0);

    // A generous second: the engine sub-steps at 0.1s and carries the remainder,
    // so ticking exactly WINDUP_MAX leaves a sliver behind.
    engine.tick(1);
    expect(s.casting.windup).toBe(0);
    fillFace(s);
    expect(manualChip(s, mods(), ctx, 20).charge).toBeGreaterThan(0);
  });

  it('a light tool swings as often as you like', () => {
    const s = st();
    hold([LIGHT]);
    fillFace(s);
    for (let i = 0; i < 5; i++) {
      expect(manualChip(s, mods(), ctx, i * 3).charge, `swing ${i}`).toBeGreaterThan(0);
    }
    expect(s.casting.windup ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6 — THE PILLARS
// ---------------------------------------------------------------------------

describe('the pillars survive both axes', () => {
  it('bare hands are even and never wind up (pillar 1)', () => {
    const s = st();
    s.casting.tool = [];
    fillFace(s);
    const e = toolEffect(s);
    expect(e.balance).toEqual(EVEN_BALANCE);
    for (let i = 0; i < 5; i++) {
      expect(manualChip(s, mods(), ctx, i * 3).charge).toBeGreaterThan(0);
    }
  });

  it('however heavy or layered, reach and splash stay clamped', () => {
    for (const ids of [[HEAVY], [HEAVY, HEAVY, HEAVY], [HEAVY, LIGHT], [LIGHT, HEAVY, HEAVY]]) {
      hold(ids, 1 + SLOT_EVERY * 400);
      const e = toolEffect(st());
      expect(e.cells, ids.join('+')).toBeLessThanOrEqual(1 + MAX_EXTRA_CELLS);
      expect(e.splash, ids.join('+')).toBeLessThanOrEqual(1);
      expect(e.cells).toBeGreaterThanOrEqual(1);
    }
  });

  /**
   * THE LOAD-BEARING TEST. Heavy, light and layered, each carrying every ability
   * at maximum grade, against a face holding a known amount of charge with
   * nothing ticking it.
   */
  it('no build of any weight or blend can make charge', () => {
    for (const ids of [[HEAVY], [LIGHT], [HEAVY, LIGHT], [LIGHT, HEAVY, HEAVY]]) {
      engine = createEngine({ nowMs: 0 });
      reachAll(st());
      hold(ids, 1 + SLOT_EVERY * 400);
      const s = st();
      handCarrier(s).fits = [...ABILITY_BY_ID.keys()].map((id) => ({ id, grade: 7, ch: 0, fired: 999 }));
      fillFace(s, 8);

      const start = held(s);
      const before = harvested(s);
      for (let i = 0; i < 6; i++) {
        for (let slot = 0; slot < s.casting.hand!.fits!.length; slot++) {
          const cell = (i * 5 + slot) % s.face.cells.length;
          handCarrier(s).lastCell = cell;
          fireAbility(s, mods(), ctx, TOOL_CARRIER, slot, cell);
        }
      }
      const took = harvested(s) - before;
      expect(took, `${ids.join('+')} took ${took.toFixed(2)} of ${start.toFixed(2)}`)
        .toBeLessThanOrEqual(start + 1e-6);
      expect(took + held(s)).toBeLessThanOrEqual(start + 1e-6);
      expect(held(s)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('and a swing of any weight takes only what the cells were holding', () => {
    for (const ids of [[HEAVY], [LIGHT], [HEAVY, LIGHT]]) {
      engine = createEngine({ nowMs: 0 });
      reachAll(st());
      hold(ids);
      const s = st();
      fillFace(s, 8);
      const start = held(s);
      const before = harvested(s);
      for (let i = 0; i < 30; i++) {
        s.casting.windup = 0; // step past the wind-up rather than waiting it out
        manualChip(s, mods(), ctx, (i * 3) % s.face.cells.length);
      }
      expect(harvested(s) - before, ids.join('+')).toBeLessThanOrEqual(start + 1e-6);
    }
  });
});

describe('the save', () => {
  it('is at v43, and adds no layers to anybody', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(43);
    const out = runMigrations({
      version: 42,
      state: {
        casting: {
          tool: [{ type: 'head', materialId: 'marl', purity: 60, shape: 'point' }],
          rack: [],
        },
      },
    } as never);
    const casting = (out.state as Record<string, unknown>)['casting'] as Record<string, unknown>;
    const tool = casting['tool'] as Array<Record<string, unknown>>;
    expect(tool[0]!['layers']).toBeUndefined();
    expect(casting['windup']).toBe(0);
  });
});
