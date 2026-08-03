/**
 * THE NEW FORGE, STEP 1 — the mapping, proved against the real registry.
 *
 * Five claims. The first two are the rulings this step was given, the third is
 * the doc's part table, the fourth is the mechanic that makes part choice a
 * choice, and the fifth is that the thing works at all:
 *
 *  1  SHELL DEPTH DOMINATES. A deeper-shell material ALWAYS makes a better
 *     part. Not usually, not on average — the WORST material of shell N+1 is
 *     worth more than the BEST of shell N, checked at every one of the six
 *     boundaries against the materials that actually exist. The step size is
 *     DERIVED here from the registry rather than trusted from a constant.
 *  2  TRAITS CREATE REAL TRADEOFFS, and every trait's effect is the one
 *     FORGE_design.md gives it.
 *  3  THE PART TABLE IS THE DOC'S. Head governs speed AND power, Edge is the
 *     ore specialist, Binding carries modifier slots. This is checked because a
 *     first cut of this file diverged from the doc in five places.
 *  4  A COHERENT SET BEATS A SCATTERED ONE. Seven parts with nothing to do with
 *     each other really are a worse tool, `trueseated` really does forgive it,
 *     and a deeper part is STILL always worth slotting.
 *  5  SEVEN PARTS MAKE A COHERENT TOOL.
 *
 * WHERE THE RULINGS MEET is asserted rather than smoothed over: ruling 1 is
 * guaranteed on a part's TOTAL worth, and a SINGLE stat is allowed to invert
 * across one shell step where the traits say it should. The boundaries that do
 * are pinned by name.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { MATERIALS, RARITIES, materialDef } from '../materials';
import { allShells } from '../shells';
import {
  FORGE_TRAITS, LINEAR_STATS, PART_DEFS, PART_TYPES, SHELL_STEP, SHELL_TRAIT,
  STAT_BASE, STAT_MAGNITUDE_EXP, TOOL_STATS, gradeOf, traitNet,
  type ForgeTraitId, type ToolStat,
} from '../content/forgeParts';
import {
  assembleTool, coherenceOf, derivePart, isComplete, magnitudeOf, makePart,
  partMelt, partTraits, shapeOf, shellBand, weightFor, type Part,
} from '../systems/forgeParts';
import { shellOrdinal } from '../content/drillAlloys';

createEngine({ nowMs: 0 });

const ORDER = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph'];
const mined = MATERIALS.filter((m) => !m.worked && m.source !== 'combat');

/**
 * WHAT A PART IS WORTH, ALL IN. The stats are counted in different units
 * (durability's base is 60, modSlots' is 1.2), so summing them raw would let
 * durability drown everything. Normalised by base, this is the honest "is this
 * part better" number — and it is what ruling 1 is guaranteed on.
 */
const worth = (id: string, purity: number, type: Part['type'] = 'head'): number => {
  const d = derivePart(makePart(type, id, purity));
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
   * AND IT HOLDS FOR WHOLE TOOLS, which is what a player actually compares.
   * Worth checking separately from the per-part case because a tool is scaled
   * by COHERENCE, and a deep tool must not be able to lose to a shallow one on
   * a coherence technicality.
   */
  it('a whole tool of shell N+1 beats a whole tool of shell N, coherence and all', () => {
    const toolWorth = (id: string, purity: number): number => {
      const t = assembleTool(PART_TYPES.map((p) => makePart(p, id, purity)));
      return TOOL_STATS.reduce((n, s) => n + t.stats[s] / STAT_BASE[s], 0);
    };
    for (let i = 1; i < ORDER.length; i++) {
      const bestShallow = Math.max(...inShell(ORDER[i - 1]!).map((m) => toolWorth(m.id, 100)));
      const worstDeep = Math.min(...inShell(ORDER[i]!).map((m) => toolWorth(m.id, 1)));
      expect(worstDeep, `${ORDER[i]} worst tool vs ${ORDER[i - 1]} best tool`)
        .toBeGreaterThan(bestShallow);
    }
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
    expect(magnitudeOf(starred, 50)).toBeGreaterThan(magnitudeOf(common, 50) * 0.9);
    expect(magnitudeOf(common, 95)).toBeGreaterThan(magnitudeOf(common, 20));
  });

  it('one shell step is worth more than the whole rarity ladder', () => {
    const rarityLadder = 1 + 0.15 * (RARITIES.length - 1);
    expect(SHELL_STEP).toBeGreaterThan(rarityLadder);
  });

  /**
   * THE DAMPED STATS ARE THE STATED EXCEPTION. A count stat cannot grow 46,656x
   * across the ladder or an Aleph binding offers forty thousand modifier slots,
   * so `modSlots` and `attunement` grow at magnitude^0.15 and the whole ladder
   * buys about 5x. The consequence is deliberate and worth pinning: on those
   * two stats, TRAITS OUT-RANK DEPTH — a Hollow `hollow`/`charged` material
   * really does offer more slots than an Aleph `dense` one, which is exactly
   * what the doc's "hollow → more modifier slots" is for.
   */
  it('count stats are damped, so traits outrank depth on THEM and only them', () => {
    expect(STAT_MAGNITUDE_EXP.modSlots).toBeLessThan(0.2);
    expect(STAT_MAGNITUDE_EXP.attunement).toBeLessThan(0.2);
    expect(LINEAR_STATS).toEqual(
      ['bite', 'cadence', 'oreSpeed', 'strike', 'durability', 'resilience'],
    );
    // The whole seven-shell ladder buys a slot count you can print.
    const ladder = Math.pow(Math.pow(SHELL_STEP, 6), STAT_MAGNITUDE_EXP.modSlots);
    expect(ladder).toBeGreaterThan(3);
    expect(ladder).toBeLessThan(8);
    // And the named inversion: a roomy Hollow binding out-slots an Aleph one.
    const roomy = derivePart(makePart('binding', 'lacuna', 70));      // hollow/charged
    const solid = derivePart(makePart('binding', 'firstiron', 70));   // dense/trueseated
    expect(roomy.stats.modSlots).toBeGreaterThan(solid.stats.modSlots);
    // While every LINEAR stat still obeys ruling 1 between the same two.
    for (const s of LINEAR_STATS) {
      if (s === 'bite') continue; // `absent` carries a bite penalty — see below.
      expect(solid.stats[s], s).toBeGreaterThan(roomy.stats[s]);
    }
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

  /**
   * EVERY AUTHORED TRAIT DOES WHAT FORGE_design.md SAYS IT DOES. Four of these
   * moved during the re-alignment because the first cut had guessed: `keen` was
   * power rather than the doc's "mining speed / cutting", `light` was cadence
   * rather than "less durability drain", `charged` was drop rate rather than
   * "socket/modifier synergy", and `trueseated` had no mismatch penalty to
   * reduce because there was no penalty. This is the row-by-row check that they
   * do not drift back.
   */
  it("each trait lands on the stat the doc's effect list names", () => {
    const t = FORGE_TRAITS;
    // keen → "mining speed / cutting"
    expect(t.keen.mods.cadence!).toBeGreaterThan(0.2);
    expect(t.keen.mods.strike!).toBeGreaterThan(0.15);
    expect(t.keen.mods.bite ?? 0, 'keen is SPEED, not power').toBe(0);
    // dense / tough → "durability, power"
    expect(t.dense.mods.bite!).toBeGreaterThan(0.2);
    expect(t.dense.mods.durability!).toBeGreaterThan(0);
    expect(t.tough.mods.durability!).toBeGreaterThan(0.25);
    // brittle → "high speed but wears faster"
    expect(t.brittle.mods.cadence!).toBeGreaterThan(0.2);
    expect(t.brittle.mods.resilience!).toBeLessThan(-0.2);
    expect(traitNet(t.brittle)).toBeLessThan(0);
    // charged → "socket/modifier synergy"
    expect(t.charged.mods.modSlots!).toBeGreaterThan(0.2);
    expect(t.charged.mods.attunement!).toBeGreaterThan(0.1);
    // springy → "swing/use rate"
    expect(t.springy.mods.cadence!).toBeGreaterThan(0.15);
    // light → "less durability drain per use"
    expect(t.light.mods.resilience!).toBeGreaterThan(0.25);
    // hollow → "more modifier slots but lower base stats"
    expect(t.hollow.mods.modSlots!).toBeGreaterThan(0.25);
    expect(t.hollow.mods.durability!).toBeLessThan(-0.3);
    expect(t.hollow.mods.bite!).toBeLessThan(0);
    // trueseated → "stability, less penalty from mismatched parts"
    expect(t.trueseated.mods.stability!).toBeGreaterThan(0.3);
  });

  /**
   * RULING 3 — `warm` STAYS FLAT. The doc has it perform better in hot shells
   * and worse in cold; it does not, by ruling, because a shell-contextual stat
   * means no part can print its numbers without also being asked "where?", and
   * every later step would inherit that. This asserts the ARCHITECTURE, not
   * just the trait: a part's stats are a pure function of the part.
   */
  it('RULING 3 — stats are pure; no trait reads the shell the player is in', () => {
    const p = makePart('head', 'chthonite', 60); // loam, warm
    const a = derivePart(p);
    const b = derivePart({ ...p });
    for (const s of TOOL_STATS) expect(a.stats[s], s).toBe(b.stats[s]);
    // `warm` is a flat bite/strike trait with a cadence cost, like any other.
    expect(FORGE_TRAITS.warm.mods.bite!).toBeGreaterThan(0);
    expect(FORGE_TRAITS.warm.mods.cadence!).toBeLessThan(0);
    // derivePart takes a Part and nothing else — no shell, no state, no clock.
    expect(derivePart.length).toBe(1);
  });

  /** THE REFERENCE TRADEOFF, named in the doc: fast, and it wears fast. */
  it('BRITTLE lands in a real part, not just in the table', () => {
    const brittleMat = mined.find((m) => m.shellId === 'loam' && partTraits(m).includes('brittle'))!;
    const toughMat = mined.find((m) => m.shellId === 'loam' && partTraits(m).includes('tough'))!;
    const fast = derivePart(makePart('handle', brittleMat.id, 60));
    const slow = derivePart(makePart('handle', toughMat.id, 60));
    expect(fast.stats.cadence / fast.magnitude).toBeGreaterThan(slow.stats.cadence / slow.magnitude);
    expect(fast.stats.resilience / fast.magnitude).toBeLessThan(slow.stats.resilience / slow.magnitude);
  });

  /**
   * TRAIT INTENSITY SCALES BOTH WAYS — the "quality tiers of a trait" ruling.
   * A cleaner brittle material is MORE brittle: faster still, and more fragile
   * still. Asserted on `shapeOf`, the normalised term the game actually uses.
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
      expect(Math.exp(logSum / TOOL_STATS.length), m.name).toBeCloseTo(1, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// 3 — THE DOC'S PART TABLE
// ---------------------------------------------------------------------------

describe("the part table is FORGE_design.md's, row for row", () => {
  it('every stat the doc names exists, and the two invented ones are gone', () => {
    expect(TOOL_STATS).toContain('oreSpeed');   // "the ore specialist"
    expect(TOOL_STATS).toContain('modSlots');   // Binding
    expect(TOOL_STATS).toContain('stability');  // "how well mismatched parts cooperate"
    expect(TOOL_STATS).toContain('control');    // Grip
    expect(TOOL_STATS).not.toContain('reach');   // never named in the doc
    expect(TOOL_STATS).not.toContain('fortune'); // its job is control + oreSpeed
  });

  it('HEAD governs speed AND power; EDGE is the ore specialist; BINDING has the slots', () => {
    expect(PART_DEFS.head.primary).toEqual(['bite', 'cadence']);
    expect(PART_DEFS.core.primary).toEqual(['durability']);
    expect(PART_DEFS.core.secondary).toContain('oreSpeed');       // "ore handling"
    expect(PART_DEFS.edge.primary).toEqual(['oreSpeed']);
    expect(PART_DEFS.edge.secondary).toContain('strike');         // "harder cells"
    expect(PART_DEFS.binding.primary).toEqual(['modSlots', 'stability']);
    expect(PART_DEFS.handle.secondary).toEqual(['durability', 'cadence']);
    expect(PART_DEFS.grip.primary).toEqual(['control']);
    expect(PART_DEFS.sockets.primary).toEqual(['attunement']);
  });

  it('every stat is governed by somebody, or is deliberately shared', () => {
    const owned = new Set(PART_TYPES.flatMap((t) => PART_DEFS[t].primary));
    const unowned = TOOL_STATS.filter((s) => !owned.has(s));
    // STRIKE alone has no owner: it is the rider on the Head and Edge rows.
    expect(unowned).toEqual(['strike']);
    for (const t of ['head', 'edge'] as const) {
      expect(PART_DEFS[t].secondary).toContain('strike');
    }
  });

  it('each part type leads on the stat it governs', () => {
    // Compared in BASE UNITS at a shallow material, so durability (base 60)
    // does not trivially beat modSlots (base 1.2) — and at a magnitude near 1,
    // where the damped exponents have not yet pulled the count stats apart from
    // the linear ones. Across shells those are different units and comparing
    // them would mean nothing.
    for (const type of PART_TYPES) {
      const def = PART_DEFS[type];
      const d = derivePart(makePart(type, 'marl', 60));
      const rel = (st: ToolStat): number => d.stats[st] / STAT_BASE[st];
      const lead = Math.min(...def.primary.map(rel));
      for (const st of TOOL_STATS) {
        if (def.primary.includes(st) || def.secondary.includes(st)) continue;
        expect(lead, `${type}: ${def.primary.join('/')} should lead ${st}`).toBeGreaterThan(rel(st));
      }
      for (const st of def.secondary) {
        expect(rel(st), `${type}: ${st} under its primary`).toBeLessThan(lead);
      }
    }
  });

  /**
   * THE RULING THAT ORE-SPEED IS ITS OWN STAT, proved where it counts: two
   * tools holding THE SAME SEVEN MATERIALS, differing only in which slot the
   * good stock went into, must be two different tools.
   *
   * This is also where the rate model was caught. With `oreRate = oreSpeed x
   * cadence`, the rock build won at ORE too — cadence is a head stat and lifted
   * both rates together — so the ore build lost on its own axis and the stat
   * was decorative. ORESPEED IS ALREADY A RATE; it is not multiplied by
   * cadence, and that is what makes these two axes.
   */
  it('ore-tuned and rock-tuned are different tools from the same materials', () => {
    const FERRITE: Record<string, string> = {
      head: 'ironbloom', core: 'bluesteel', edge: 'polarite', binding: 'nullsilver',
      handle: 'rimeiron', grip: 'lodestone', sockets: 'stormcore',
    };
    const tuned = (deep: 'head' | 'edge'): Part[] =>
      PART_TYPES.map((t) => makePart(t, t === deep ? 'heartflame' : FERRITE[t]!, 70));
    const rock = assembleTool(tuned('head'));
    const ore = assembleTool(tuned('edge'));

    expect(rock.rockRate / ore.rockRate, 'the rock build must win at rock').toBeGreaterThan(10);
    expect(ore.oreRate / rock.oreRate, 'the ore build must win at ORE').toBeGreaterThan(5);
    // Same materials, same shells, so this is the BUILD and not the set.
    expect(ore.coherence.factor).toBeCloseTo(rock.coherence.factor, 6);
    expect(ore.depth).toBe(rock.depth);
    // And ore speed does not ride on cadence, or the above is an accident.
    expect(ore.oreRate).toBeCloseTo(ore.stats.oreSpeed, 6);
  });
});

// ---------------------------------------------------------------------------
// 4 — COHERENCE
// ---------------------------------------------------------------------------

describe('a coherent set beats seven unrelated best parts', () => {
  const MISMATCHED: Part[] = [
    makePart('head', 'firstiron', 70),    // aleph     7
    makePart('core', 'lacuna', 70),       // hollow    6
    makePart('edge', 'coronaite', 70),    // cinder    5
    makePart('binding', 'starlens', 70),  // glassmere 4
    makePart('handle', 'wildstar', 70),   // verdance  3
    makePart('grip', 'polestar', 70),     // ferrite   2
    makePart('sockets', 'starmarl', 70),  // loam      1
  ];
  const COHERENT: Part[] = [
    makePart('head', 'umbralite', 70), makePart('core', 'hushslate', 70),
    makePart('edge', 'echograin', 70), makePart('binding', 'resonarium', 70),
    makePart('handle', 'phantomsilver', 70), makePart('grip', 'voidmarl', 70),
    makePart('sockets', 'absencia', 70),
  ];
  /** Measured on the LINEAR stats — the ones a shell step actually moves. */
  const net = (parts: Part[]): number => {
    const t = assembleTool(parts);
    return LINEAR_STATS.reduce((n, s) => n + t.stats[s] / STAT_BASE[s], 0);
  };
  const raw = (parts: Part[]): number => {
    const t = assembleTool(parts);
    return LINEAR_STATS.reduce((n, s) => n + t.rawStats[s] / STAT_BASE[s], 0);
  };

  /**
   * THE HEADLINE, AND THE TEST THIS REPLACED. The first cut asserted that
   * assembly was a pure sum and "one great part is never cancelled" — which
   * asserted the absence of the mechanic that makes part choice a choice.
   */
  it('the scattered set has BIGGER numbers and is the WORSE tool', () => {
    expect(raw(MISMATCHED) / raw(COHERENT), 'the scattered set should look better on paper')
      .toBeGreaterThan(1.2);
    expect(net(COHERENT) / net(MISMATCHED), 'and be the worse tool once assembled')
      .toBeGreaterThan(1.2);
  });

  it('discord is shell spread first, material variety a distant second', () => {
    const scattered = assembleTool(MISMATCHED).coherence;
    const matched = assembleTool(COHERENT).coherence;
    expect(scattered.shellSpread).toBeCloseTo(12 / 7, 3);  // ordinals 1..7, median 4
    expect(matched.shellSpread).toBe(0);
    // Seven different materials from ONE shell is a build, not a mistake.
    expect(matched.variety).toBe(1);
    expect(matched.factor).toBeGreaterThan(0.9);
    expect(scattered.factor).toBeLessThan(0.5);
  });

  it('a matched set of ONE material is perfectly coherent', () => {
    const same = assembleTool(PART_TYPES.map((t) => makePart(t, 'marl', 60)));
    expect(same.coherence.discord).toBe(0);
    expect(same.coherence.factor).toBe(1);
    for (const s of TOOL_STATS) expect(same.stats[s]).toBeCloseTo(same.rawStats[s], 6);
  });

  it('adjacent shells mix cheaply — a tool can be upgraded a part at a time', () => {
    const mix = (deep: number) => assembleTool(PART_TYPES.map((t, i) =>
      makePart(t, i < deep ? 'firstiron' : 'lacuna', 70)));
    // Four Aleph parts among three Hollow ones is a normal mid-upgrade state.
    expect(mix(4).coherence.factor).toBeGreaterThan(0.85);
    expect(mix(1).coherence.factor).toBeGreaterThan(0.85);
  });

  /**
   * `trueseated` → "less penalty from mismatched parts", proved with the shell
   * spread HELD CONSTANT. All four bindings are Glassmere, so the only thing
   * moving across the row is stability.
   */
  it('TRUESEATED forgives the penalty, and nothing else about the set changes', () => {
    const bound = (id: string) =>
      assembleTool(MISMATCHED.map((p) => (p.type === 'binding' ? makePart('binding', id, 70) : p)));
    const careless = bound('frostsand');    // glassmere common, no trueseated
    const steady = bound('starlens');       // glassmere flawless, TRUESEATED
    expect(materialDef('frostsand').shellId).toBe(materialDef('starlens').shellId);
    expect(steady.coherence.shellSpread).toBeCloseTo(careless.coherence.shellSpread, 6);
    expect(steady.coherence.stabilityIndex).toBeGreaterThan(careless.coherence.stabilityIndex);
    expect(steady.coherence.relief).toBeGreaterThan(careless.coherence.relief + 0.15);
    expect(steady.coherence.factor / careless.coherence.factor).toBeGreaterThan(1.3);
  });

  /**
   * WHAT THE PENALTY MUST NOT DO. Ruling 1 puts a shell step at 6x, so no
   * cooperation penalty may make a deeper part not worth slotting — "should I
   * use this Aleph head" has to stay an easy yes. The penalty prices SCATTER,
   * not depth.
   */
  it('a deeper part is STILL always worth slotting — ruling 1 outranks coherence', () => {
    const cinder = (headId: string) => assembleTool([
      makePart('head', headId, 70), makePart('core', 'magmajade', 70),
      makePart('edge', 'pyrite', 70), makePart('binding', 'cindersteel', 70),
      makePart('handle', 'charstone', 70), makePart('grip', 'obsidianheart', 70),
      makePart('sockets', 'brimshard', 70),
    ]);
    const before = cinder('slagrock');
    const after = cinder('firstiron');
    expect(after.coherence.factor).toBeLessThan(before.coherence.factor);
    expect(after.rockRate).toBeGreaterThan(before.rockRate);
    expect(after.stats.bite).toBeGreaterThan(before.stats.bite * 5);
  });

  it('one part, or none, is trivially coherent', () => {
    expect(coherenceOf([], {} as never).factor).toBe(1);
    expect(assembleTool([makePart('head', 'marl', 60)]).coherence.factor).toBe(1);
  });

  it('coherence scales every stat, and the raw sum is kept for the UI to show', () => {
    const t = assembleTool(MISMATCHED);
    expect(t.coherence.factor).toBeLessThan(1);
    for (const s of TOOL_STATS) {
      expect(t.stats[s], s).toBeCloseTo(t.rawStats[s] * t.coherence.factor, 6);
      const byHand = MISMATCHED.reduce((n, p) => n + derivePart(p).stats[s], 0);
      expect(t.rawStats[s], s).toBeCloseTo(byHand, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// 5 — VARIETY AND ASSEMBLY
// ---------------------------------------------------------------------------

describe('same shape, different material, genuinely different part', () => {
  it("umberjade and graveclay make different heads — the doc's example", () => {
    const a = derivePart(makePart('head', 'umberjade', 60)); // brittle/charged
    const b = derivePart(makePart('head', 'graveclay', 60)); // dense/tough
    const shape = (p: typeof a): number[] => TOOL_STATS.map((s) => p.stats[s] / p.magnitude);
    const sa = shape(a);
    const sb = shape(b);
    const spread = Math.max(...sa.map((v, i) => Math.abs(v - sb[i]!) / Math.max(v, sb[i]!)));
    expect(spread, 'the two heads are near-identical in shape').toBeGreaterThan(0.25);
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

  /**
   * AND NOR DO FERRITE'S (A.87). This rule was Loam-only because Loam was the
   * only shell whose stone could all be dug; A.87 made Ferrite's six combat
   * orphans minable and added two deep-entry stones, which is exactly the
   * moment A.84 found `burrowertooth` to be a bit-for-bit clone of `duskflint`.
   * A shell whose materials are reachable needs the check the reachable shell
   * has.
   */
  it('no two mined Ferrite materials produce the same head', () => {
    const seen = new Map<string, string>();
    for (const m of inShell('ferrite')) {
      const d = derivePart(makePart('head', m.id, 60));
      const key = TOOL_STATS.map((s) => d.stats[s].toFixed(3)).join('|');
      expect(seen.has(key), `${m.name} collides with ${seen.get(key)}`).toBe(false);
      seen.set(key, m.name);
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  /**
   * THE HONEST LIMIT OF RULING 1, stated rather than hidden.
   *
   * A SINGLE stat can invert across one shell step where the traits say it
   * should — a Hollow `absent` head genuinely bites less than a Cinder
   * `kindled` one. That is the tradeoff working; ruling 1 is guaranteed on
   * TOTAL worth. Pinned exactly, so a new inversion has to be argued for out
   * loud rather than appearing when someone widens a trait.
   */
  it('BITE can invert across a shell step — by design, and only where traits say so', () => {
    const inversions: string[] = [];
    for (let i = 1; i < ORDER.length; i++) {
      const bestShallow = Math.max(...inShell(ORDER[i - 1]!)
        .map((m) => derivePart(makePart('head', m.id, 100)).stats.bite));
      const worstDeep = Math.min(...inShell(ORDER[i]!)
        .map((m) => derivePart(makePart('head', m.id, 1)).stats.bite));
      if (worstDeep <= bestShallow) inversions.push(`${ORDER[i - 1]}→${ORDER[i]}`);
    }
    expect(inversions).toEqual(['cinder→hollow']);
  });
});

describe('seven parts make a coherent tool', () => {
  const sevenOf = (id: string, purity = 60) => PART_TYPES.map((t) => makePart(t, id, purity));

  it('assembles, sums, scales, and reports both rates', () => {
    const tool = assembleTool(sevenOf('marl'));
    expect(isComplete(tool.parts)).toBe(true);
    for (const s of TOOL_STATS) expect(tool.stats[s], s).toBeGreaterThan(0);
    expect(tool.rockRate).toBeCloseTo(tool.stats.bite * tool.stats.cadence, 6);
    expect(tool.oreRate).toBeCloseTo(tool.stats.oreSpeed, 6);
    expect(tool.depth).toBe(7);
  });

  it('a mixed tool carries every trait its parts brought', () => {
    const mixed = [
      makePart('head', 'umberjade', 60), makePart('core', 'graveclay', 60),
      makePart('edge', 'lodestone', 60), makePart('binding', 'sporewood', 60),
      makePart('handle', 'frostsand', 60), makePart('grip', 'ashgrit', 60),
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

  it('weights are primary > secondary > spill, and spill is never zero', () => {
    expect(weightFor('head', 'bite')).toBeGreaterThan(weightFor('head', 'strike'));
    expect(weightFor('head', 'strike')).toBeGreaterThan(weightFor('head', 'modSlots'));
    expect(weightFor('head', 'modSlots')).toBeGreaterThan(0);
  });

  it('every part type has a melt cost for step 2 to read', () => {
    for (const t of PART_TYPES) expect(partMelt(t)).toBeGreaterThan(0);
    expect(partMelt('head')).toBeGreaterThan(partMelt('grip'));
  });

  it('every shell in the registry has a trait, so nothing is characterless', () => {
    for (const s of allShells()) expect(SHELL_TRAIT[s.id], s.id).toBeDefined();
  });
});
