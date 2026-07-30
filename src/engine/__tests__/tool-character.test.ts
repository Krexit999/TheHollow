/**
 * LIVING MATERIALS, THE BIOGRAPHY, MASTERWORK — the character layer.
 *
 * Five claims:
 *
 *  1  ONLY LIVING STOCK GROWS, and it grows from work rather than from the
 *     clock. Maturing is a CHOICE offered three ways, it is capped, and it
 *     cannot be taken before the work is done.
 *  2  THE BIOGRAPHY GRANTS NOTHING. A swing with a full history is byte-
 *     identical to a swing with none. That is the whole design constraint and
 *     it is worth a test rather than a comment.
 *  3  MASTERWORK DOES NOT TOUCH STATS. Every tier derives the same stat block;
 *     the difference is slots, steadiness, wear exemption and repair price.
 *  4  A POUR CANNOT BE BOTCHED. The casting floor's rule 1 is narrowed, not
 *     broken — a Poor part is a normal part with no bonus.
 *  5  PILLAR 1 AND 2. Nothing here reaches yield, and a tool with every boon,
 *     every masterwork and a long history still cannot make charge.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameEvent, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import {
  CRAFT_ODDS, CRAFT_TIERS, GROWTH_BOONS, GROWTH_MAX, LIVING_SHELL, MASTERWORKS,
  PART_TYPES, growthForStage, type CraftTier, type GrowthBoonId,
} from '../content/forgeParts';
import {
  assembleTool, craftFold, growthFold, growthNeed, growthProgress, isLiving,
  makePart, NO_GROWTH, NO_CRAFT, type Part,
} from '../systems/forgeParts';
import { BASE_CAP, manualChip } from '../systems/face';
import {
  MAX_EXTRA_CELLS, REPAIR_UNITS, effectOf, modSlotsOf, repairTool, toolEffect,
  wearPerUse, xpForLevel, SLOT_EVERY,
} from '../systems/toolMining';
import { growLivingParts, matureLivingPart, rollCraft } from '../systems/casting';
import { toolInstability, tickToolMods } from '../systems/toolMods';
import { fireAbility, TOOL_CARRIER } from '../systems/drillAlloys';
import { ABILITY_BY_ID } from '../content/drillAlloys';
import { handCarrier } from '../systems/toolAbilities';
import { readBio, startBio, tickBio } from '../systems/toolBio';
import { addMaterial } from '../systems/forge';
import { materialsOfShell } from '../materials';
import { allShells } from '../shells';
import { SAVE_VERSION, runMigrations } from '../save/migrations';

let engine: Engine;
const st = () => engine.getState() as GameState;
const mods = () => new ModifierCache();
const ctx: EngineCtx = { emit() {}, dirty() {} };

/** A Verdance stone (alive) and a Loam one (not). */
const LIVE = materialsOfShell('verdance');
const DEAD = 'marl';

function reachAll(s: GameState): void {
  for (const shell of allShells()) s.depthRecords[shell.id] = 40;
}

function hold(materialId: string, level = 1 + SLOT_EVERY * 60): void {
  const s = st();
  s.forge.built = true;
  s.casting.tool = PART_TYPES.map((t, i) => ({ ...makePart(t, materialId, 60), id: i + 1 }));
  s.casting.wear = 0;
  s.casting.mods = [];
  s.casting.windup = 0;
  s.casting.bio = undefined;
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
// 1 — LIVING MATERIALS
// ---------------------------------------------------------------------------

describe('only living stock keeps growing', () => {
  it('Verdance has stock to build with', () => {
    expect(LIVE.length).toBeGreaterThan(0);
    for (const m of LIVE) expect(m.shellId).toBe(LIVING_SHELL);
  });

  it('a Verdance part is alive and a Loam one is not', () => {
    expect(isLiving(makePart('head', LIVE[0]!.id, 60))).toBe(true);
    expect(isLiving(makePart('head', DEAD, 60))).toBe(false);
    expect(growthNeed(makePart('head', DEAD, 60))).toBeNull();
    expect(growthNeed(makePart('head', LIVE[0]!.id, 60))).toBeGreaterThan(0);
  });

  it('and a part with a living LAYER is alive too', () => {
    const part: Part = {
      ...makePart('head', DEAD, 60),
      layers: [{ materialId: LIVE[0]!.id, purity: 60 }],
    };
    expect(isLiving(part)).toBe(true);
  });

  it('a dead tool grows nothing, however much work it does', () => {
    const s = st();
    hold(DEAD);
    growLivingParts(s, ctx, 1e6);
    for (const p of s.casting.tool) expect(p.growth ?? 0).toBe(0);
    expect(growthFold(s.casting.tool)).toEqual({ ...NO_GROWTH, ready: [] });
  });

  it('a living tool grows from CELLS, and announces when it is ready', () => {
    const s = st();
    hold(LIVE[0]!.id);
    const need = growthNeed(s.casting.tool[0]!)!;
    const seen: GameEvent[] = [];
    const c: EngineCtx = { emit: (e) => { seen.push(e); }, dirty() {} };

    growLivingParts(s, c, Math.floor(need / 2));
    expect(growthProgress(s.casting.tool[0]!).ready).toBe(false);
    expect(seen.filter((e) => e.type === 'partReadyToGrow')).toEqual([]);

    growLivingParts(s, c, need);
    expect(growthProgress(s.casting.tool[0]!).ready).toBe(true);
    expect(seen.filter((e) => e.type === 'partReadyToGrow').length).toBeGreaterThan(0);
  });

  it('and an empty swing grows nothing', () => {
    const s = st();
    hold(LIVE[0]!.id);
    growLivingParts(s, ctx, 0);
    expect(s.casting.tool[0]!.growth ?? 0).toBe(0);
  });

  it('maturing is refused before the work is done, and names the shortfall', () => {
    const s = st();
    hold(LIVE[0]!.id);
    const r = matureLivingPart(s, ctx, 'head', 'reach');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/more to do first/);
  });

  it('and refused on a part that is not alive at all', () => {
    const s = st();
    hold(DEAD);
    const r = matureLivingPart(s, ctx, 'head', 'reach');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not alive/);
  });

  it('the choice is three-way, and taking one records it', () => {
    const s = st();
    hold(LIVE[0]!.id);
    growLivingParts(s, ctx, growthForStage(1));
    const seen: GameEvent[] = [];
    const r = matureLivingPart(
      s, { emit: (e) => { seen.push(e); }, dirty() {} }, 'head', 'mending',
    );
    expect(r.ok).toBe(true);
    expect(s.casting.tool[0]!.grown).toEqual(['mending']);
    const ev = seen.find((e) => e.type === 'partMatured');
    expect(ev && ev.type === 'partMatured' && ev.boon).toBe('mending');
    expect(GROWTH_BOONS.length).toBe(3);
  });

  it('each boon does its own thing, and only its own thing', () => {
    const s = st();
    const withBoon = (boon: GrowthBoonId) => {
      hold(LIVE[0]!.id);
      s.casting.tool[0]!.grown = [boon];
      return growthFold(s.casting.tool);
    };
    const reach = withBoon('reach');
    expect(reach.cells).toBeGreaterThan(0);
    expect(reach.repairPerSec).toBe(0);

    const mend = withBoon('mending');
    expect(mend.repairPerSec).toBeGreaterThan(0);
    expect(mend.cells).toBe(0);

    const supple = withBoon('supple');
    expect(supple.stabilize).toBeGreaterThan(0);
    expect(supple.wear).toBeLessThan(1);
    expect(supple.cells).toBe(0);
  });

  it('it matures three times and then it is grown', () => {
    const s = st();
    hold(LIVE[0]!.id);
    for (let i = 0; i < GROWTH_MAX; i++) {
      growLivingParts(s, ctx, growthForStage(i + 1) * 2);
      expect(matureLivingPart(s, ctx, 'head', 'reach').ok, `stage ${i}`).toBe(true);
    }
    expect(s.casting.tool[0]!.grown!.length).toBe(GROWTH_MAX);
    expect(growthProgress(s.casting.tool[0]!).grown).toBe(true);
    growLivingParts(s, ctx, 1e6);
    const r = matureLivingPart(s, ctx, 'head', 'reach');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/finished growing/);
  });

  it('and each stage costs more work than the last', () => {
    for (let i = 1; i < GROWTH_MAX; i++) {
      expect(growthForStage(i + 1)).toBeGreaterThan(growthForStage(i));
    }
  });

  it('a Knitting part closes its own wear, like Self-Mending does', () => {
    const s = st();
    hold(LIVE[0]!.id);
    s.casting.tool[0]!.grown = ['mending'];
    s.casting.wear = 100;
    tickToolMods(s, 30);
    expect(s.casting.wear).toBeLessThan(100);
  });

  it('a Supple part steadies the tool and costs it less per swing', () => {
    const s = st();
    hold(LIVE[0]!.id);
    const plainWear = wearPerUse(assembleTool(s.casting.tool));
    const plainSteady = toolInstability(s).steady;
    s.casting.tool.forEach((p) => { p.grown = ['supple']; });
    expect(wearPerUse(assembleTool(s.casting.tool))).toBeLessThan(plainWear);
    expect(toolInstability(s).steady).toBeGreaterThan(plainSteady);
  });
});

// ---------------------------------------------------------------------------
// 2 — THE BIOGRAPHY GRANTS NOTHING
// ---------------------------------------------------------------------------

describe('the biography is information', () => {
  it('there is none without a tool', () => {
    const s = st();
    s.casting.tool = [];
    expect(readBio(s)).toBeNull();
  });

  it('it records cells, swings, hours and where it has been', () => {
    const s = st();
    hold(DEAD);
    startBio(s);
    fillFace(s);
    for (let i = 0; i < 4; i++) manualChip(s, mods(), ctx, i * 3);
    tickBio(s, 120);
    const bio = readBio(s)!;
    expect(bio.cells).toBeGreaterThan(0);
    expect(bio.swings).toBe(4);
    expect(bio.hours).toBeGreaterThan(0);
    expect(bio.shells).toContain(s.shell.current);
  });

  it('collapses and relics are DERIVED from the counters, not hooked', () => {
    const s = st();
    hold(DEAD);
    startBio(s);
    expect(readBio(s)!.collapses).toBe(0);
    s.collapse.count += 3;
    s.relics.found += 5;
    expect(readBio(s)!.collapses).toBe(3);
    expect(readBio(s)!.relics).toBe(5);
  });

  it('and never reads negative when a counter legitimately falls', () => {
    const s = st();
    hold(DEAD);
    startBio(s);
    // Relics are consumed by fusion; a Recursion resets the breach count.
    s.relics.found = 0;
    s.casting.bio!.atRelics = 9;
    s.shell.breachCount = 0;
    s.casting.bio!.atBreaches = 4;
    expect(readBio(s)!.relics).toBe(0);
    expect(readBio(s)!.breaches).toBe(0);
  });

  it('a rebuild keeps it and counts itself', () => {
    const s = st();
    hold(DEAD);
    startBio(s);
    s.casting.bio!.cells = 1234;
    startBio(s);
    expect(readBio(s)!.cells).toBe(1234);
    expect(readBio(s)!.rebuilds).toBe(1);
  });

  it('the deepest is by SHELL first, then by depth inside it', () => {
    const s = st();
    hold(DEAD);
    startBio(s);
    s.depth = 140;
    tickBio(s, 1);
    expect(readBio(s)!.deepestDepth).toBe(140);
    // One metre into a deeper shell beats the floor of a shallower one.
    s.shell.current = 'cinder';
    s.depth = 1;
    tickBio(s, 1);
    expect(readBio(s)!.deepestShell).toBe('cinder');
    // ...and going back up does not take it away.
    s.shell.current = 'loam';
    s.depth = 5;
    tickBio(s, 1);
    expect(readBio(s)!.deepestShell).toBe('cinder');
  });

  /**
   * THE LOAD-BEARING TEST FOR THIS FEATURE. A biography that granted power would
   * be a stat-grind in a diary's clothes, so the claim is measured: the same
   * tool, one with a long history and one with none, must mine identically.
   */
  it('and it grants NOTHING — a swing with a full history is identical', () => {
    /**
     * SEEDED, AND THE PREVIOUS VERSION OF THIS TEST FAILED ON A CLEAN TREE.
     *
     * The A.63 fix widened the window to twenty swings and a thirty-second tick
     * so a leak would have somewhere to show — which was the right instinct and
     * broke the instrument, because thirty seconds of ticking runs ore spawning,
     * growth and the drop rolls on live `Math.random`. Two arms then differed by
     * ~0.003% in a RANDOM DIRECTION (the two readings swapped between runs), and
     * an exact-equality assertion cannot survive that.
     *
     * So the window stays wide and the stream is pinned. This is still an
     * EQUALITY and not a tolerance: with the same seed the two arms differ only
     * in the biography, and something that should be bit-identical either is or
     * is not. The sim's version of this claim (`sim-tool-character.ts`) has been
     * seeded from the start, which is why it held while this did not.
     */
    const swing = (withHistory: boolean): number => {
      const realRandom = Math.random;
      let seed = 0x9e3779b9;
      Math.random = () => {
        seed ^= seed << 13; seed >>>= 0;
        seed ^= seed >> 17;
        seed ^= seed << 5; seed >>>= 0;
        return seed / 4294967296;
      };
      try {
        return measure(withHistory);
      } finally {
        Math.random = realRandom;
      }
    };
    const measure = (withHistory: boolean): number => {
      engine = createEngine({ nowMs: 0 });
      reachAll(st());
      hold(DEAD);
      const s = st();
      startBio(s);
      if (withHistory) {
        // ONLY THE BIOGRAPHY'S OWN FIELDS. The first version of this also bumped
        // `collapse.count` and `relics.found` — live counters with real systems
        // on them — and passed anyway, because one manual chip never feels the
        // Core tree. The sim ran the same arm for 300s and read 1.19x the
        // ceiling. The test was right by luck; this makes it right on purpose.
        Object.assign(s.casting.bio!, {
          cells: 9_999_999, swings: 500_000, secondsHeld: 400_000, fired: 20_000,
          rebuilds: 40, deepestShell: 'aleph', deepestDepth: 900,
          shells: allShells().map((x) => x.id),
          atCollapses: -200, atRelics: -300,
        });
      }
      fillFace(s);
      const before = harvested(s);
      // MANY swings and a stretch of ticking, not one chip — a single swing is
      // too small a window for anything downstream of the history to show up.
      for (let i = 0; i < 20; i++) {
        s.casting.windup = 0;
        manualChip(s, mods(), ctx, (i * 3) % s.face.cells.length);
      }
      engine.tick(30);
      return harvested(s) - before;
    };
    expect(swing(true)).toBe(swing(false));
  });

  it('and it is not read by the tool effect at all', () => {
    const s = st();
    hold(DEAD);
    startBio(s);
    const plain = JSON.stringify(toolEffect(s));
    Object.assign(s.casting.bio!, { cells: 1e9, fired: 1e6, secondsHeld: 1e6 });
    expect(JSON.stringify(toolEffect(s))).toBe(plain);
  });
});

// ---------------------------------------------------------------------------
// 3 & 4 — MASTERWORK
// ---------------------------------------------------------------------------

describe('a masterwork is not a bigger number', () => {
  it('every tier derives exactly the same stat block', () => {
    const base = JSON.stringify(assembleTool(
      PART_TYPES.map((t) => makePart(t, DEAD, 60)),
    ).stats);
    for (const tier of CRAFT_TIERS) {
      for (const work of MASTERWORKS) {
        const parts = PART_TYPES.map((t) => ({
          ...makePart(t, DEAD, 60), craft: tier, work: work.id,
        }));
        expect(JSON.stringify(assembleTool(parts).stats), `${tier}/${work.id}`).toBe(base);
      }
    }
  });

  it('the odds are cumulative, ordered, and end at one', () => {
    let last = 0;
    for (const [, upTo] of CRAFT_ODDS) {
      expect(upTo).toBeGreaterThan(last);
      last = upTo;
    }
    expect(last).toBe(1);
    expect(CRAFT_ODDS.map(([t]) => t)).toEqual(CRAFT_TIERS);
  });

  it('a roll always produces a tier, and a work only with masterwork', () => {
    for (let i = 0; i < 400; i++) {
      const r = rollCraft();
      expect(CRAFT_TIERS).toContain(r.craft);
      if (r.craft === 'masterwork') {
        expect(MASTERWORKS.map((m) => m.id)).toContain(r.work);
      } else {
        expect(r.work).toBeUndefined();
      }
    }
  });

  it('masterwork is rare and poor is not most pours', () => {
    const seen: Record<string, number> = {};
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const t = rollCraft().craft;
      seen[t] = (seen[t] ?? 0) + 1;
    }
    expect((seen['masterwork'] ?? 0) / N).toBeLessThan(0.1);
    expect((seen['good'] ?? 0) / N).toBeGreaterThan(0.3);
  });

  /**
   * THE CASTING FLOOR'S RULE 1 IS NARROWED, NOT BROKEN. A Poor part is a normal
   * part that got no bonus — same stats, same shape, same layers. Nothing about
   * a pour can be botched, which is the substance of the rule.
   */
  it('a Poor pour is a normal part with no bonus', () => {
    const poor = PART_TYPES.map((t) => ({ ...makePart(t, DEAD, 60), craft: 'poor' as CraftTier }));
    const plain = PART_TYPES.map((t) => makePart(t, DEAD, 60));
    expect(assembleTool(poor).stats).toEqual(assembleTool(plain).stats);
    expect(craftFold(poor)).toEqual({ ...NO_CRAFT, flawless: [], thrifty: [], best: 'poor' });
  });

  it('and an old part with no tier reads as the middle, not as a hole', () => {
    const parts = PART_TYPES.map((t) => makePart(t, DEAD, 60));
    expect(craftFold(parts).best).toBe('good');
    expect(craftFold(parts).masterworks).toBe(0);
  });

  it('Deep-Cut buys one modifier slot, and nothing else', () => {
    const s = st();
    hold(DEAD, 1);
    const before = modSlotsOf(s, assembleTool(s.casting.tool)).total;
    s.casting.tool[0]!.craft = 'masterwork';
    s.casting.tool[0]!.work = 'roomy';
    expect(modSlotsOf(s, assembleTool(s.casting.tool)).total).toBe(before + 1);
    // The stat block did not move.
    expect(assembleTool(s.casting.tool).stats.modSlots)
      .toBe(assembleTool(PART_TYPES.map((t) => makePart(t, DEAD, 60))).stats.modSlots);
  });

  it('Trueborn steadies the tool, and Excellent a little', () => {
    const s = st();
    hold(DEAD);
    const plain = toolInstability(s).steady;
    s.casting.tool[0]!.craft = 'excellent';
    const good = toolInstability(s).steady;
    expect(good).toBeGreaterThan(plain);
    s.casting.tool[0]!.craft = 'masterwork';
    s.casting.tool[0]!.work = 'trueborn';
    expect(toolInstability(s).steady).toBeGreaterThan(good);
  });

  it('Flawless means the tool spends less of itself per swing', () => {
    const s = st();
    hold(DEAD);
    const plain = wearPerUse(assembleTool(s.casting.tool));
    s.casting.tool[0]!.craft = 'masterwork';
    s.casting.tool[0]!.work = 'flawless';
    expect(wearPerUse(assembleTool(s.casting.tool))).toBeLessThan(plain);
  });

  it('Thrifty makes a repair cheaper, and never free', () => {
    const s = st();
    hold(DEAD);
    addMaterial(s, DEAD, 60, 200);
    s.casting.wear = 1000;
    const held0 = s.materials.stacks[DEAD] ? 1 : 0;
    void held0;

    s.casting.tool.forEach((p) => { p.craft = 'masterwork'; p.work = 'thrifty'; });
    const before = countOf(s, DEAD);
    expect(repairTool(s, ctx, 'head').ok).toBe(true);
    const paid = before - countOf(s, DEAD);
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeLessThan(REPAIR_UNITS);
  });
});

function countOf(s: GameState, id: string): number {
  const per = s.materials.stacks[id];
  if (!per) return 0;
  let n = 0;
  for (const band of Object.values(per)) n += band?.count ?? 0;
  return n;
}

// ---------------------------------------------------------------------------
// 5 — THE PILLARS
// ---------------------------------------------------------------------------

describe('the pillars survive the character layer', () => {
  it('bare hands are untouched', () => {
    const s = st();
    s.casting.tool = [];
    fillFace(s);
    expect(readBio(s)).toBeNull();
    const before = harvested(s);
    manualChip(s, mods(), ctx, 14);
    expect(harvested(s) - before).toBeGreaterThan(0);
  });

  it('every boon and every masterwork stays inside the reach clamp', () => {
    const s = st();
    hold(LIVE[0]!.id, 1 + SLOT_EVERY * 400);
    s.casting.tool.forEach((p) => {
      p.grown = ['reach', 'reach', 'reach'];
      p.craft = 'masterwork';
      p.work = 'roomy';
    });
    const e = toolEffect(s);
    expect(e.cells).toBeLessThanOrEqual(1 + MAX_EXTRA_CELLS);
    expect(e.splash).toBeLessThanOrEqual(1);
  });

  /** THE LOAD-BEARING TEST. Every boon, every masterwork, a long history, every
   *  ability at maximum grade — against a face holding a known amount. */
  it('a fully grown, fully masterworked tool still cannot make charge', () => {
    for (const boon of GROWTH_BOONS) {
      engine = createEngine({ nowMs: 0 });
      reachAll(st());
      hold(LIVE[0]!.id, 1 + SLOT_EVERY * 400);
      const s = st();
      startBio(s);
      s.casting.tool.forEach((p, i) => {
        p.grown = [boon.id, boon.id, boon.id];
        p.craft = 'masterwork';
        p.work = MASTERWORKS[i % MASTERWORKS.length]!.id;
      });
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
      expect(took, `${boon.id} took ${took.toFixed(2)} of ${start.toFixed(2)}`)
        .toBeLessThanOrEqual(start + 1e-6);
      expect(took + held(s)).toBeLessThanOrEqual(start + 1e-6);
      expect(held(s)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('and a swing of a fully grown tool takes only what the cells were holding', () => {
    const s = st();
    hold(LIVE[0]!.id, 1 + SLOT_EVERY * 400);
    s.casting.tool.forEach((p) => {
      p.grown = ['reach', 'supple', 'mending'];
      p.craft = 'masterwork';
      p.work = 'flawless';
    });
    fillFace(s, 8);
    const start = held(s);
    const before = harvested(s);
    for (let i = 0; i < 30; i++) {
      s.casting.windup = 0;
      manualChip(s, mods(), ctx, (i * 3) % s.face.cells.length);
    }
    expect(harvested(s) - before).toBeLessThanOrEqual(start + 1e-6);
  });
});

describe('the save', () => {
  it('adds no growth, tier or history to anybody', () => {
    expect(SAVE_VERSION).toBe(45);
    const out = runMigrations({
      version: 43,
      state: {
        casting: {
          tool: [{ type: 'head', materialId: 'marl', purity: 60, shape: 'point' }],
          rack: [],
        },
      },
    } as never);
    const casting = (out.state as Record<string, unknown>)['casting'] as Record<string, unknown>;
    const tool = casting['tool'] as Array<Record<string, unknown>>;
    expect(tool[0]!['grown']).toBeUndefined();
    expect(tool[0]!['craft']).toBeUndefined();
    expect(casting['bio']).toBeUndefined();
  });

  it('and an untiered part behaves exactly as it did', () => {
    const old = PART_TYPES.map((t) => ({ type: t, materialId: DEAD, purity: 60 }));
    const now = PART_TYPES.map((t) => makePart(t, DEAD, 60));
    expect(effectOf(assembleTool(old), false, 1))
      .toEqual(effectOf(assembleTool(now), false, 1));
  });
});
