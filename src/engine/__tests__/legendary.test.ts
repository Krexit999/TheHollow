import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { addMaterial, materialCount } from '../systems/forge';
import { BAND_RANGES, MATERIALS } from '../materials';
import { shellOrdinal } from '../content/drillAlloys';
import { derivePart, assembleTool, PURITY_CEILING, type Part } from '../systems/forgeParts';
import { effectOf, MAX_EXTRA_CELLS, ORE_RATE_CAP } from '../systems/toolMining';
import { PART_TYPES } from '../content/forgeParts';
import { LEGENDARY_PARTS, LEGENDARY_BOOST_MAX, LEGENDARY_BY_ID } from '../content/legendaryParts';
import {
  checkLegendaryParts, recastLegendary, legendCost, legendPart,
  hasLegend, bestStoneFor, legendRows,
} from '../systems/legendary';

function fresh(): { s: GameState; ctx: never } {
  const e = createEngine();
  const s = e.getState();
  return { s, ctx: { emit: () => {}, dirty: () => {} } as never };
}

/** The casting floor has to be open before a legend can land on its rack. */
function openFloor(s: GameState): void {
  s.forge.built = true;
  s.depthRecords['loam'] = Math.max(s.depthRecords['loam'] ?? 0, 200);
}

const mag = (p: Part): number => derivePart(p).magnitude;

describe('legendary parts', () => {
  it('a legend is better than the best part you could ever pour in the same stone', () => {
    /**
     * THE HONEST COMPARISON is not the average pour, it is the LUCKIEST one:
     * exalted stock (100 — a drop cannot roll higher) that also happened to come
     * out masterwork. A legend has to beat THAT to be worth a word like this.
     */
    const luckiest: Part = {
      type: 'head', materialId: 'marl', purity: 100, craft: 'masterwork', work: 'flawless',
    };
    const legend: Part = { ...luckiest, purity: PURITY_CEILING, legend: 'firstbite' };
    expect(mag(legend)).toBeGreaterThan(mag(luckiest) * 1.25);
  });

  it('and every legend is held under a shell step, so ruling 1 still holds', () => {
    /**
     * RULING 1: only the shell compounds. If a legend could out-stat the next
     * shell it would flatten the descent curve, which is the single thing that
     * ruling exists to forbid. Asserted at the constant AND at the derivation,
     * because a bound nobody measures is a bound nobody keeps.
     */
    for (const def of LEGENDARY_PARTS) {
      expect(def.boost).toBeLessThanOrEqual(LEGENDARY_BOOST_MAX);
    }

    const byShell = new Map<number, string[]>();
    for (const m of MATERIALS) {
      const o = shellOrdinal(m.shellId);
      if (!byShell.has(o)) byShell.set(o, []);
      byShell.get(o)!.push(m.id);
    }
    const ords = [...byShell.keys()].sort((a, b) => a - b);
    for (let i = 0; i < ords.length - 1; i++) {
      let bestLegend = 0;
      for (const id of byShell.get(ords[i]!)!) {
        for (const def of LEGENDARY_PARTS) {
          bestLegend = Math.max(bestLegend, mag({
            type: 'head', materialId: id, purity: PURITY_CEILING, legend: def.id,
          }));
        }
      }
      let worstNext = Infinity;
      for (const id of byShell.get(ords[i + 1]!)!) {
        worstNext = Math.min(worstNext, mag({ type: 'head', materialId: id, purity: 1 }));
      }
      // The STRONGEST legend of this shell against the FEEBLEST ordinary part of
      // the next — the tightest form of the claim, not average against average.
      expect(bestLegend).toBeLessThan(worstNext);
    }
  });

  it('and a fully legendary tool still lands inside every clamp (pillar 2)', () => {
    const tool = assembleTool(PART_TYPES.map((type) => {
      const def = LEGENDARY_PARTS.find((l) => l.partType === type)!;
      return {
        type, materialId: 'protolith', purity: PURITY_CEILING,
        craft: 'masterwork' as const, work: def.work, legend: def.id,
      };
    }));
    const eff = effectOf(tool, false);
    // A part has no yield term; everything it touches arrives through these
    // three. The strongest stone in the game already binds splash at 1.000,
    // which is what makes this a real test rather than a restatement.
    expect(eff.cells).toBeLessThanOrEqual(MAX_EXTRA_CELLS);
    expect(eff.splash).toBeLessThanOrEqual(1);
    expect(eff.oreRate).toBeLessThanOrEqual(ORE_RATE_CAP);
  });

  it('an absent legend is exactly the identity — which is why no migration was needed', () => {
    const plain: Part = { type: 'head', materialId: 'marl', purity: 60 };
    const before = mag(plain);
    expect(mag({ ...plain, legend: undefined })).toBe(before);
    // And an id that no longer exists reads as no legend rather than as a hole,
    // so removing one from the registry cannot brick a save that holds it.
    expect(mag({ ...plain, legend: 'a-legend-that-was-cut' })).toBe(before);
  });
});

describe('earning a legend', () => {
  it('arrives the moment it is earned, poured in the best stone the Hold holds', () => {
    const { s, ctx } = fresh();
    openFloor(s);
    addMaterial(s, 'marl', BAND_RANGES['fair'][0], 200);
    addMaterial(s, 'graveclay', BAND_RANGES['fair'][0], 200);

    expect(hasLegend(s, 'firstbite')).toBe(false);
    checkLegendaryParts(s, ctx);
    expect(hasLegend(s, 'firstbite')).toBe(true);

    const part = legendPart(s, 'firstbite')!;
    expect(part).toBeDefined();
    expect(part.type).toBe('head');
    expect(part.purity).toBe(PURITY_CEILING);
    expect(part.craft).toBe('masterwork');
    expect(part.work).toBe(LEGENDARY_BY_ID.get('firstbite')!.work);
  });

  it('and never twice, however many beats run', () => {
    const { s, ctx } = fresh();
    openFloor(s);
    addMaterial(s, 'marl', BAND_RANGES['fair'][0], 200);
    for (let i = 0; i < 30; i++) checkLegendaryParts(s, ctx);
    expect(s.casting.rack.filter((p) => p.legend === 'firstbite')).toHaveLength(1);
  });

  it('and not even after you melt it down — the record is the DEED, not the holding', () => {
    /**
     * The obvious idempotence key is "am I holding one", and it is wrong: melt a
     * legend down (or salvage it) and the next one-second beat would hand out a
     * second copy, forever, which is a material printer with a legend on it.
     */
    const { s, ctx } = fresh();
    openFloor(s);
    addMaterial(s, 'marl', BAND_RANGES['fair'][0], 200);
    checkLegendaryParts(s, ctx);
    s.casting.rack = s.casting.rack.filter((p) => p.legend !== 'firstbite');
    expect(legendPart(s, 'firstbite')).toBeUndefined();

    for (let i = 0; i < 10; i++) checkLegendaryParts(s, ctx);
    expect(s.casting.rack.filter((p) => p.legend === 'firstbite')).toHaveLength(0);
  });

  it('and an empty Hold defers it rather than losing it', () => {
    /**
     * `earned` is a pure read and nothing is written when the pour cannot
     * happen, so a legend earned with no stone in the Hold simply arrives on a
     * later beat — the same "nothing stored, nothing dropped" the prize drills
     * rely on when the bay is full.
     */
    const { s, ctx } = fresh();
    openFloor(s);
    s.materials.stacks = {};
    checkLegendaryParts(s, ctx);
    expect(hasLegend(s, 'firstbite')).toBe(false);

    addMaterial(s, 'marl', BAND_RANGES['fair'][0], 200);
    checkLegendaryParts(s, ctx);
    expect(hasLegend(s, 'firstbite')).toBe(true);
  });

  it('and the grant reaches for the deepest stone, because that is what ruling 1 says is better', () => {
    const { s } = fresh();
    openFloor(s);
    addMaterial(s, 'marl', BAND_RANGES['fair'][0], 500);
    addMaterial(s, 'protolith', BAND_RANGES['fair'][0], 40);
    // Marl is far more plentiful, and depth still wins — quantity is only the
    // tiebreak, never the ranking.
    expect(bestStoneFor(s, 'head')).toBe('protolith');
  });

  it('and nothing at all is stored for a legend you have not earned', () => {
    const { s } = fresh();
    openFloor(s);
    const rows = legendRows(s);
    expect(rows).toHaveLength(LEGENDARY_PARTS.length);
    expect(rows.every((r) => !r.earned && r.part === undefined)).toBe(true);
    expect(s.casting.legends ?? []).toHaveLength(0);
  });
});

describe('re-pouring a legend', () => {
  it('costs real stock and lifts the part into the new stone', () => {
    const { s, ctx } = fresh();
    openFloor(s);
    addMaterial(s, 'marl', BAND_RANGES['fair'][0], 200);
    checkLegendaryParts(s, ctx);
    expect(legendPart(s, 'firstbite')!.materialId).toBe('marl');

    addMaterial(s, 'protolith', BAND_RANGES['fair'][0], 200);
    const before = materialCount(s, 'protolith');
    const r = recastLegendary(s, ctx, 'firstbite', 'protolith');
    expect(r.ok).toBe(true);
    expect(materialCount(s, 'protolith')).toBe(before - legendCost('head'));

    const part = legendPart(s, 'firstbite')!;
    expect(part.materialId).toBe('protolith');
    expect(part.purity).toBe(PURITY_CEILING);
    expect(part.legend).toBe('firstbite');
  });

  it('and it is the same ONE part, not a second copy', () => {
    const { s, ctx } = fresh();
    openFloor(s);
    addMaterial(s, 'marl', BAND_RANGES['fair'][0], 200);
    checkLegendaryParts(s, ctx);
    const id = legendPart(s, 'firstbite')!.id;

    addMaterial(s, 'protolith', BAND_RANGES['fair'][0], 200);
    recastLegendary(s, ctx, 'firstbite', 'protolith');
    expect(s.casting.rack.filter((p) => p.legend === 'firstbite')).toHaveLength(1);
    expect(legendPart(s, 'firstbite')!.id).toBe(id);
  });

  it('and it works on a part that is already IN the tool', () => {
    /**
     * This is the case the whole feature turns on — you do not want to take your
     * tool apart to move a legend up a shell. It works because `toolKey` hashes
     * `legend` and `materialId` both, so `currentTool`'s memo re-derives rather
     * than serving the stale build.
     */
    const { s, ctx } = fresh();
    openFloor(s);
    addMaterial(s, 'marl', BAND_RANGES['fair'][0], 200);
    checkLegendaryParts(s, ctx);
    const part = legendPart(s, 'firstbite')!;
    s.casting.rack = s.casting.rack.filter((p) => p.id !== part.id);
    s.casting.tool.push(part);

    addMaterial(s, 'protolith', BAND_RANGES['fair'][0], 200);
    expect(recastLegendary(s, ctx, 'firstbite', 'protolith').ok).toBe(true);
    expect(s.casting.tool.find((p) => p.legend === 'firstbite')!.materialId).toBe('protolith');
  });

  it('and is refused when the stock is short, without spending anything', () => {
    const { s, ctx } = fresh();
    openFloor(s);
    addMaterial(s, 'marl', BAND_RANGES['fair'][0], 200);
    checkLegendaryParts(s, ctx);
    addMaterial(s, 'protolith', BAND_RANGES['fair'][0], 1);

    const before = materialCount(s, 'protolith');
    expect(recastLegendary(s, ctx, 'firstbite', 'protolith').ok).toBe(false);
    expect(materialCount(s, 'protolith')).toBe(before);
    expect(legendPart(s, 'firstbite')!.materialId).toBe('marl');
  });

  it('and a re-pour into the stone it is already made of is refused, not charged', () => {
    const { s, ctx } = fresh();
    openFloor(s);
    addMaterial(s, 'marl', BAND_RANGES['fair'][0], 200);
    checkLegendaryParts(s, ctx);
    const before = materialCount(s, 'marl');
    expect(recastLegendary(s, ctx, 'firstbite', 'marl').ok).toBe(false);
    expect(materialCount(s, 'marl')).toBe(before);
  });
});
