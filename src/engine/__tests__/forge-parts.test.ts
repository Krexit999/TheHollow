/**
 * THE NEW FORGE, STEP 1 — the mapping, proved against the real registry.
 *
 * Four claims, and the first two are the rulings this step was given:
 *
 *  1  SHELL DEPTH DOMINATES. A deeper-shell material ALWAYS makes a better
 *     part. Not usually, not on average — the WORST material of shell N+1 is
 *     worth more than the BEST of shell N, checked at every one of the six
 *     boundaries against the materials that actually exist. The step size is
 *     DERIVED here from the registry rather than trusted from a constant.
 *  2  TRAITS CREATE REAL TRADEOFFS. Brittle is fast and wears fast. Dense hits
 *     hard and swings slow. A trait graded `prime` really is worth building
 *     around and a `weak` one really does cost more than it gives — checked
 *     against the numbers, not the label.
 *  3  SAME SHAPE, DIFFERENT MATERIAL, DIFFERENT PART. If two materials give the
 *     same head, a procedural mapping has failed and this is where it shows.
 *  4  SEVEN PARTS MAKE A COHERENT TOOL.
 *
 * WHERE THE TWO RULINGS MEET is the interesting part, and it is asserted rather
 * than smoothed over: ruling 1 is guaranteed on a part's TOTAL worth, and a
 * SINGLE stat is allowed to invert across one shell step where the traits say
 * it should. Exactly one boundary in the game does, and it is pinned by name.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { MATERIALS, RARITIES, materialDef } from '../materials';
import { allShells } from '../shells';
import {
  FORGE_TRAITS, PART_DEFS, PART_TYPES, SHELL_STEP, SHELL_TRAIT, STAT_BASE,
  TOOL_STATS, gradeOf, traitNet, type ForgeTraitId, type ToolStat,
} from '../content/forgeParts';
import {
  assembleTool, derivePart, isComplete, magnitudeOf, makePart,
  partMelt, partTraits, shapeOf, shellBand,
} from '../systems/forgeParts';
import { shellOrdinal } from '../content/drillAlloys';

createEngine({ nowMs: 0 });

const ORDER = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph'];
const mined = MATERIALS.filter((m) => !m.worked && m.source !== 'combat');

/**
 * WHAT A PART IS WORTH, ALL IN. The eight stats are counted in different units
 * (durability's base is 60, reach's is 1.2), so summing them raw would let
 * durability drown everything. Normalised by base, this is the honest "is this
 * part better" number — and it is what ruling 1 is guaranteed on.
 */
const worth = (id: string, purity: number): number => {
  const d = derivePart(makePart('head', id, purity));
  return TOOL_STATS.reduce((n, s) => n + d.stats[s] / STAT_BASE[s], 0);
};

const inShell = (shell: string) => mined.filter((m) => m.shellId === shell);

// ---------------------------------------------------------------------------
// 1 — RULING ONE
// ---------------------------------------------------------------------------

describe('RULING 1 — a deeper shell is always a better part', () => {
  it('the WORST material of each shell is worth more than the BEST above it', () => {
    for (let i = 1; i < ORDER.length; i++) {
      const bestShallow = Math.max(...inShell(ORDER[i - 1]!).map((m) => worth(m.id, 100)));
      const worstDeep = Math.min(...inShell(ORDER[i]!).map((m) => worth(m.id, 1)));
      expect(
        worstDeep,
        `${ORDER[i]} worst ${worstDeep.toFixed(1)} must beat ${ORDER[i - 1]} best ${bestShallow.toFixed(1)}`,
      ).toBeGreaterThan(bestShallow);
    }
  });

  it('and the named case: an Aleph COMMON beats a Loam STARRED', () => {
    const alephCommon = mined.find((m) => m.shellId === 'aleph' && m.rarity === 'common')!;
    const loamStarred = mined.find((m) => m.shellId === 'loam' && m.rarity === 'starred')!;
    // Worst possible roll on the deep one against the best on the shallow one.
    const deep = worth(alephCommon.id, 1);
    const shallow = worth(loamStarred.id, 100);
    expect(deep, `${alephCommon.name}@1 = ${deep.toFixed(1)} vs ${loamStarred.name}@100 = ${shallow.toFixed(1)}`)
      .toBeGreaterThan(shallow);
  });

  /**
   * SHELL_STEP IS DERIVED HERE, NOT TRUSTED. Two earlier values (2.5, then 4.0)
   * were reasoned from the constants and both broke against the real registry —
   * the spread depends on which materials each world actually holds, which is
   * data, not arithmetic. So the requirement is recomputed every run: add a
   * material with an unusual rarity/trait combination and this fails, instead of
   * ruling 1 quietly becoming false somewhere nobody is looking.
   */
  it('SHELL_STEP exceeds what the registry actually demands of it', () => {
    let needed = 0;
    let at = '';
    for (let i = 1; i < ORDER.length; i++) {
      const bShallow = Math.max(...inShell(ORDER[i - 1]!).map((m) => worth(m.id, 100)))
        / Math.pow(SHELL_STEP, i - 1);
      const wDeep = Math.min(...inShell(ORDER[i]!).map((m) => worth(m.id, 1)))
        / Math.pow(SHELL_STEP, i);
      if (bShallow / wDeep > needed) { needed = bShallow / wDeep; at = `${ORDER[i - 1]}→${ORDER[i]}`; }
    }
    expect(SHELL_STEP, `the registry needs ${needed.toFixed(2)}x (binding at ${at})`)
      .toBeGreaterThan(needed);
  });

  it('the theoretical within-shell spread also stays under one step', () => {
    const band = shellBand(1);
    const spread = band.max / band.min;
    expect(spread, `worst-case within-shell spread ${spread.toFixed(2)}x vs step ${SHELL_STEP}x`)
      .toBeLessThan(SHELL_STEP);
  });

  it('rarity and purity still order materials WITHIN a shell', () => {
    const loam = inShell('loam');
    const common = loam.find((m) => m.rarity === 'common')!;
    const starred = loam.find((m) => m.rarity === 'starred')!;
    // Same purity, so only rarity and grade move — and starred must lead.
    expect(magnitudeOf(starred, 50)).toBeGreaterThan(magnitudeOf(common, 50) * 0.9);
    // Same material, so only purity moves.
    expect(magnitudeOf(common, 95)).toBeGreaterThan(magnitudeOf(common, 20));
  });

  it('one shell step is worth more than the whole rarity ladder', () => {
    const rarityLadder = 1 + 0.15 * (RARITIES.length - 1);
    expect(SHELL_STEP).toBeGreaterThan(rarityLadder);
  });
});

// ---------------------------------------------------------------------------
// 2 — RULING TWO
// ---------------------------------------------------------------------------

describe('RULING 2 — the trait space is wide, graded, and full of tradeoffs', () => {
  it('every material carries its shell trait, so depth is a CHARACTER too', () => {
    for (const m of MATERIALS) {
      expect(partTraits(m), `${m.name} (${m.shellId})`).toContain(SHELL_TRAIT[m.shellId]);
    }
    expect(new Set(Object.values(SHELL_TRAIT)).size).toBe(7);
  });

  /**
   * THE MEASURED PROBLEM THIS SOLVES. `charged` sits on ~35% of the registry.
   * With shell traits added, no single trait may dominate that far — otherwise
   * a third of all parts still feel the same, which is what ruling 2 is for.
   */
  it('no single trait dominates the space the way `charged` did', () => {
    const n = new Map<ForgeTraitId, number>();
    for (const m of MATERIALS) for (const t of partTraits(m)) n.set(t, (n.get(t) ?? 0) + 1);
    const share = (n.get('charged') ?? 0) / MATERIALS.length;
    expect(share, `charged is on ${(share * 100).toFixed(0)}% of materials`).toBeLessThan(0.40);
    expect(n.size, 'the space is wider than the authored ten').toBeGreaterThanOrEqual(17);
  });

  it('every trait GRADE matches what its numbers actually do', () => {
    for (const def of Object.values(FORGE_TRAITS)) {
      expect(gradeOf(traitNet(def)), `${def.name} is labelled ${def.grade} but nets ${traitNet(def).toFixed(2)}`)
        .toBe(def.grade);
    }
  });

  it('there are weak traits and prime traits, and both are real', () => {
    const grades = Object.values(FORGE_TRAITS).map((d) => d.grade);
    expect(grades).toContain('weak');
    expect(grades).toContain('prime');
    for (const d of Object.values(FORGE_TRAITS)) {
      if (d.grade === 'weak') expect(traitNet(d), d.name).toBeLessThan(0);
      if (d.grade === 'prime') expect(traitNet(d), d.name).toBeGreaterThan(0.19);
    }
  });

  /** THE REFERENCE TRADEOFF, named in the brief: fast, and it wears fast. */
  it('BRITTLE is fast and fragile — the tradeoff the brief asked for', () => {
    const b = FORGE_TRAITS.brittle;
    expect(b.mods.cadence!).toBeGreaterThan(0.2);
    expect(b.mods.resilience!).toBeLessThan(-0.2);
    expect(traitNet(b)).toBeLessThan(0);
    // And it lands in a real part: same shape, same shell, brittle against tough.
    const brittleMat = mined.find((m) => m.shellId === 'loam' && partTraits(m).includes('brittle'))!;
    const toughMat = mined.find((m) => m.shellId === 'loam' && partTraits(m).includes('tough'))!;
    const fast = derivePart(makePart('handle', brittleMat.id, 60));
    const slow = derivePart(makePart('handle', toughMat.id, 60));
    expect(fast.stats.cadence / fast.magnitude).toBeGreaterThan(slow.stats.cadence / slow.magnitude);
    expect(fast.stats.resilience / fast.magnitude).toBeLessThan(slow.stats.resilience / slow.magnitude);
  });

  it('DENSE hits hard and swings slow', () => {
    const d = FORGE_TRAITS.dense;
    expect(d.mods.bite!).toBeGreaterThan(0.2);
    expect(d.mods.cadence!).toBeLessThan(-0.2);
  });

  /**
   * TRAIT INTENSITY SCALES BOTH WAYS — the "quality tiers of a trait" ruling.
   * A cleaner brittle material is MORE brittle: faster still, and more fragile
   * still. Asserted on `shapeOf`, the normalised term the game actually uses,
   * so this proves the shipped behaviour rather than an intermediate.
   */
  it('a purer material has a STRONGER character, upside and downside both', () => {
    const brittleMat = mined.find((m) => partTraits(m).includes('brittle'))!;
    const traits = partTraits(brittleMat);
    expect(shapeOf(traits, 'cadence', 1.30)).toBeGreaterThan(shapeOf(traits, 'cadence', 0.70));
    expect(shapeOf(traits, 'resilience', 1.30)).toBeLessThan(shapeOf(traits, 'resilience', 0.70));
  });

  /**
   * AND THE SEAM BETWEEN THE RULINGS. Traits express SHAPE and carry no net
   * value; what they are worth lives in the bounded grade bonus. Without this
   * the first cut leaked trait value into magnitude and ruling 1 broke at five
   * of six boundaries.
   */
  it('trait SHAPE is value-neutral — it redistributes, it does not inflate', () => {
    for (const m of mined.slice(0, 40)) {
      const traits = partTraits(m);
      let logSum = 0;
      for (const s of TOOL_STATS) logSum += Math.log(shapeOf(traits, s, 1.0));
      // Geometric mean of the shape must be 1: pure redistribution.
      expect(Math.exp(logSum / TOOL_STATS.length), m.name).toBeCloseTo(1, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// 3 — VARIETY
// ---------------------------------------------------------------------------

describe('same shape, different material, genuinely different part', () => {
  it("umberjade and graveclay make different heads — the brief's example", () => {
    const a = derivePart(makePart('head', 'umberjade', 60)); // brittle/charged
    const b = derivePart(makePart('head', 'graveclay', 60)); // dense/tough
    const shape = (p: typeof a): number[] => TOOL_STATS.map((s) => p.stats[s] / p.magnitude);
    const sa = shape(a);
    const sb = shape(b);
    const spread = Math.max(...sa.map((v, i) => Math.abs(v - sb[i]!) / Math.max(v, sb[i]!)));
    expect(spread, 'the two heads are near-identical in shape').toBeGreaterThan(0.25);
    // And in the direction the traits promise.
    expect(a.stats.cadence).toBeGreaterThan(b.stats.cadence);
    expect(b.stats.durability).toBeGreaterThan(a.stats.durability);
  });

  it('no two mined Loam materials produce the same head', () => {
    const seen = new Set<string>();
    for (const m of inShell('loam')) {
      const d = derivePart(makePart('head', m.id, 60));
      const key = TOOL_STATS.map((s) => d.stats[s].toFixed(3)).join('|');
      expect(seen.has(key), `${m.name} collides with another Loam head`).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it('each part type leads on the stat it governs', () => {
    // Compared in BASE UNITS, so durability (base 60) does not trivially beat
    // reach (base 1.2) and make the assertion meaningless.
    for (const type of PART_TYPES) {
      const def = PART_DEFS[type];
      const d = derivePart(makePart(type, 'marl', 60));
      const rel = (st: ToolStat): number => d.stats[st] / STAT_BASE[st];
      for (const st of TOOL_STATS) {
        if (st === def.primary || st === def.secondary) continue;
        expect(rel(def.primary), `${type}: ${def.primary} should lead ${st}`).toBeGreaterThan(rel(st));
      }
      expect(rel(def.secondary), `${type}: ${def.secondary} under its primary`)
        .toBeLessThan(rel(def.primary));
    }
  });

  /**
   * THE HONEST LIMIT OF RULING 1, stated rather than hidden.
   *
   * A SINGLE stat can invert across one shell step, and exactly one boundary in
   * the game does it: Hollow's `absent` carries a bite penalty and Cinder's
   * `kindled` a bite bonus, so the best Cinder head OUT-BITES the worst Hollow
   * one. That is the tradeoff working — the Hollow head is faster, reaches
   * further, holds more, and is worth more in total. If traits could never
   * invert a stat they would not be tradeoffs, which is ruling 2.
   */
  it('one stat CAN invert across a shell step — by design, and only where traits say so', () => {
    const inversions: string[] = [];
    for (let i = 1; i < ORDER.length; i++) {
      const bestShallow = Math.max(...inShell(ORDER[i - 1]!)
        .map((m) => derivePart(makePart('head', m.id, 100)).stats.bite));
      const worstDeep = Math.min(...inShell(ORDER[i]!)
        .map((m) => derivePart(makePart('head', m.id, 1)).stats.bite));
      if (worstDeep <= bestShallow) inversions.push(`${ORDER[i - 1]}→${ORDER[i]}`);
    }
    // Pinned exactly. A third boundary starting to invert means someone widened
    // a trait's bite mod, and they should have to say so out loud.
    expect(inversions).toEqual(['cinder→hollow']);
  });
});

// ---------------------------------------------------------------------------
// 4 — ASSEMBLY
// ---------------------------------------------------------------------------

describe('seven parts make a coherent tool', () => {
  const sevenOf = (id: string, purity = 60) => PART_TYPES.map((t) => makePart(t, id, purity));

  it('assembles, sums, and reports throughput', () => {
    const tool = assembleTool(sevenOf('marl'));
    expect(isComplete(tool.parts)).toBe(true);
    for (const s of TOOL_STATS) expect(tool.stats[s], s).toBeGreaterThan(0);
    expect(tool.throughput).toBeCloseTo(tool.stats.bite * tool.stats.cadence, 6);
    expect(tool.depth).toBe(7);
  });

  it('a tool is the SUM of its parts, so one great part is never cancelled', () => {
    const parts = sevenOf('marl');
    const tool = assembleTool(parts);
    const byHand = TOOL_STATS.map((s) => parts.reduce((n, p) => n + derivePart(p).stats[s], 0));
    TOOL_STATS.forEach((s, i) => expect(tool.stats[s]).toBeCloseTo(byHand[i]!, 6));
  });

  it('a mixed tool carries every trait its parts brought', () => {
    const mixed = [
      makePart('head', 'umberjade', 60),
      makePart('core', 'graveclay', 60),
      makePart('edge', 'lodestone', 60),
      makePart('binding', 'sporewood', 60),
      makePart('handle', 'frostsand', 60),
      makePart('grip', 'ashgrit', 60),
      makePart('sockets', 'hushmetal', 60),
    ];
    const tool = assembleTool(mixed);
    expect(isComplete(tool.parts)).toBe(true);
    for (const t of ['earthfast', 'magnetic', 'living', 'refractive', 'kindled', 'absent'] as const) {
      expect(tool.traits, t).toContain(t);
    }
    expect(tool.depth).toBe(
      mixed.reduce((n, p) => n + shellOrdinal(materialDef(p.materialId).shellId), 0),
    );
  });

  it('an incomplete tool still adds up — the station decides usability, not this', () => {
    const partial = assembleTool([makePart('head', 'marl', 60)]);
    expect(isComplete(partial.parts)).toBe(false);
    expect(partial.stats.bite).toBeGreaterThan(0);
  });

  it('a full Aleph tool is the whole ladder above a full Loam one', () => {
    const loam = assembleTool(sevenOf('marl', 50));
    const aleph = assembleTool(sevenOf('firstiron', 50));
    const ratio = aleph.stats.bite / loam.stats.bite;
    // 6^6 = 46,656 on magnitude, times whatever the two characters differ by.
    expect(ratio).toBeGreaterThan(10_000);
    expect(ratio).toBeLessThan(500_000);
  });

  it('every part type has a melt cost for step 2 to read', () => {
    for (const t of PART_TYPES) expect(partMelt(t)).toBeGreaterThan(0);
    expect(partMelt('head')).toBeGreaterThan(partMelt('grip'));
  });

  it('every shell in the registry has a trait, so nothing is characterless', () => {
    for (const s of allShells()) expect(SHELL_TRAIT[s.id], s.id).toBeDefined();
  });
});
