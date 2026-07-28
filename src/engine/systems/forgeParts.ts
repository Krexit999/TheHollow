/**
 * THE NEW FORGE — STEP 1: material → part → tool, procedurally.
 *
 * ONE FORMULA, 158 MATERIALS, 7 PART TYPES, 1,106 DISTINCT PARTS. Nothing here
 * is hand-authored per material and nothing ever should be: every number a part
 * carries is read off fields the material already has — its shell, its rarity,
 * its rolled purity, its traits. Add a material to the registry tomorrow and it
 * has seven working parts the same afternoon.
 *
 *     magnitude = SHELL_STEP^(ordinal-1)  ×  rarity  ×  purity
 *     character = Π over traits ( 1 + delta[stat] × intensity )
 *     stat      = STAT_BASE[stat] × weight(part, stat) × magnitude × character
 *
 * MAGNITUDE is how big. CHARACTER is what shape. They are deliberately
 * separate: depth makes a part BIGGER, traits make it DIFFERENT, and neither
 * can do the other's job. That is what stops a deep material from also being
 * a boring one, and what stops a trait from being a stealth power creep.
 *
 * NOTHING IS WIRED. This module is pure — it reads the material registry and
 * returns numbers. `systems/toolParts.ts` (the old head/haft/binding) is
 * untouched and still owns the live Forge. Casting, the tool station,
 * durability drain, sockets and mining integration are later steps.
 *
 * A NOTE FOR STEP 2 (casting), so this layer does not have to change for it:
 * `partMelt` below gives the one number a light CSS melt animation needs — how
 * much molten material a cast of this part wants. The casting state can then be
 * `{ materialId, partType, poured, want }` and the UI is a div whose height is
 * `poured/want`. No canvas, no renderer; a prior canvas UI on this codebase was
 * reverted twice and this layer should never make a heavy one necessary.
 */
import {
  PART_DEFS, PART_TYPES, SHELL_TRAIT, STAT_BASE, TOOL_STATS, TRAIT_INTENSITY,
  FORGE_TRAITS, GRADE_BONUS, SHELL_STEP, RARITY_STEP, PURITY_FLOOR,
  PURITY_PER_POINT, W_PRIMARY, W_SECONDARY, W_SPILL,
  type ForgeTraitId, type PartType, type ToolStat,
} from '../content/forgeParts';
import { RARITIES, bandOf, materialDef, type MaterialDef } from '../materials';
import { traitsOf } from '../traits';
import { shellOrdinal } from '../content/drillAlloys';

// ---------------------------------------------------------------------------
// The part
// ---------------------------------------------------------------------------

/**
 * A PART IS A MATERIAL CAST INTO A SHAPE. That is the whole data model: what it
 * is made of, what it was made into, and the purity that came out of the pour.
 * Every stat is DERIVED — never stored — so a formula change re-rates every
 * part a player owns instead of leaving a save full of stale numbers.
 */
export interface Part {
  type: PartType;
  materialId: string;
  /** The purity of the stock that went in. Carried, because a part is a THING. */
  purity: number;
}

export interface PartStats {
  part: Part;
  material: MaterialDef;
  /** Every trait the part carries — authored, plus its shell's. */
  traits: ForgeTraitId[];
  /** How big: shell × rarity × purity. */
  magnitude: number;
  /** How hard the traits are pulling, 0.70 (poor) .. 1.30 (exalted). */
  intensity: number;
  /** The eight numbers. */
  stats: Record<ToolStat, number>;
}

export interface ToolStats {
  parts: Part[];
  stats: Record<ToolStat, number>;
  /** Bite × Cadence — what the tool actually mines. The headline. */
  throughput: number;
  /** Every distinct trait across all seven parts. */
  traits: ForgeTraitId[];
  /** Sum of the shell ordinals, for a rough "how deep is this tool" read. */
  depth: number;
}

// ---------------------------------------------------------------------------
// Magnitude
// ---------------------------------------------------------------------------

/** Where rarity sits on the ladder. common 0 … aberrant 5. */
export function rarityIndex(m: MaterialDef): number {
  return Math.max(0, RARITIES.indexOf(m.rarity));
}

/**
 * HOW BIG THIS MATERIAL MAKES A PART.
 *
 * RULING 1 lives in the exponent. Shell is the only term that compounds; rarity
 * and purity are bounded multipliers that order materials WITHIN a world and
 * cannot reach across a shell boundary. The margin is checked in test at every
 * boundary against the real registry, not asserted here.
 */
export function magnitudeOf(m: MaterialDef, purity: number): number {
  const shell = Math.pow(SHELL_STEP, shellOrdinal(m.shellId) - 1);
  const rarity = 1 + RARITY_STEP * rarityIndex(m);
  const pure = PURITY_FLOOR + PURITY_PER_POINT * clampPurity(purity);
  return shell * rarity * pure * gradeBonusOf(m);
}

/**
 * WHAT THIS MATERIAL'S TRAITS ARE WORTH, as magnitude. Bounded on purpose —
 * four prime traits are 1.36x four fair ones, which is a real reason to want
 * good traits and nowhere near enough to cross a shell boundary (ruling 1).
 */
export function gradeBonusOf(m: MaterialDef): number {
  let n = 1;
  for (const t of partTraits(m)) n *= GRADE_BONUS[FORGE_TRAITS[t].grade];
  return n;
}

function clampPurity(p: number): number {
  return Math.max(1, Math.min(100, Math.round(p)));
}

/** The theoretical best and worst magnitude a shell can produce — the numbers
 *  ruling 1's guarantee is checked against. */
export function shellBand(ordinal: number): { min: number; max: number } {
  const shell = Math.pow(SHELL_STEP, ordinal - 1);
  const highRarity = 1 + RARITY_STEP * (RARITIES.length - 1);
  // Four traits is the most any material carries (three authored + its shell).
  const worstGrade = Math.pow(GRADE_BONUS.weak, 4);
  const bestGrade = Math.pow(GRADE_BONUS.prime, 4);
  return {
    min: shell * 1 * (PURITY_FLOOR + PURITY_PER_POINT * 1) * worstGrade,
    max: shell * highRarity * (PURITY_FLOOR + PURITY_PER_POINT * 100) * bestGrade,
  };
}

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------

/**
 * EVERY TRAIT A MATERIAL BRINGS TO A PART — the two or three it was authored
 * with, plus the one its SHELL imparts.
 *
 * The shell trait is the whole answer to the measured supply problem: `charged`
 * sits on 35% of the registry, so a character space keyed only on authored
 * traits would collapse a third of all parts onto one identity. Every material
 * additionally carrying its world's signature spreads that out for free and
 * makes depth feel different rather than merely larger.
 */
export function partTraits(m: MaterialDef): ForgeTraitId[] {
  const out: ForgeTraitId[] = [...traitsOf(m.id)];
  const shell = SHELL_TRAIT[m.shellId];
  if (shell && !out.includes(shell)) out.push(shell);
  return out.filter((t) => FORGE_TRAITS[t] !== undefined);
}

/**
 * THE RAW PER-STAT MULTIPLIER, before normalisation. Multiplicative and
 * order-independent, so "keen + brittle" reads the same whichever way the
 * registry lists them.
 */
function rawCharacter(traits: ForgeTraitId[], stat: ToolStat, intensity: number): number {
  let mult = 1;
  for (const t of traits) {
    const d = FORGE_TRAITS[t]?.mods[stat];
    if (d) mult *= 1 + d * intensity;
  }
  return Math.max(0.05, mult);
}

/**
 * SHAPE — what the traits do, normalised so they do not change how MUCH.
 *
 * THIS IS THE LOAD-BEARING LINE OF THE WHOLE STEP, and the first cut got it
 * wrong. Raw trait multipliers leak value: a material whose traits all push
 * upward is simply better, three good traits out-earn a shell step, and ruling
 * 1 broke at five of six shell boundaries (measured — Ferrite's worst head read
 * 10.6 bite against Loam's best at 16.9).
 *
 * Dividing through by the geometric mean makes the traits a pure
 * REDISTRIBUTION: a part's total value is its magnitude and nothing else, while
 * individual stats still swing violently. Brittle really is much faster and
 * much more fragile; it is not secretly also worth more. What traits are WORTH
 * lives in `GRADE_BONUS`, bounded, where ruling 1 can see it.
 *
 * A consequence worth stating: a SINGLE stat can still invert across one shell
 * step — a Hollow `absent` head genuinely bites less than a Cinder `kindled`
 * one. That is the tradeoff working, not a violation. Ruling 1 is guaranteed on
 * the part's TOTAL value, which is what "a better part" can honestly mean once
 * ruling 2 exists at all.
 */
export function shapeOf(traits: ForgeTraitId[], stat: ToolStat, intensity: number): number {
  const mine = rawCharacter(traits, stat, intensity);
  let logSum = 0;
  for (const s of TOOL_STATS) logSum += Math.log(rawCharacter(traits, s, intensity));
  const geoMean = Math.exp(logSum / TOOL_STATS.length);
  return Math.max(0.05, mine / geoMean);
}

/** Back-compat name for the raw multiplier — tests read it directly. */
export const characterOf = rawCharacter;

/** How hard this part's traits pull, from the purity band. Both directions. */
export function intensityOf(purity: number): number {
  return TRAIT_INTENSITY[bandOf(clampPurity(purity))];
}

// ---------------------------------------------------------------------------
// The derivation
// ---------------------------------------------------------------------------

function weightFor(type: PartType, stat: ToolStat): number {
  const def = PART_DEFS[type];
  if (def.primary === stat) return W_PRIMARY;
  if (def.secondary === stat) return W_SECONDARY;
  return W_SPILL;
}

/** THE FUNCTION. One material, one shape, eight numbers. */
export function derivePart(part: Part): PartStats {
  const material = materialDef(part.materialId);
  const traits = partTraits(material);
  const magnitude = magnitudeOf(material, part.purity);
  const intensity = intensityOf(part.purity);

  const stats = {} as Record<ToolStat, number>;
  for (const stat of TOOL_STATS) {
    stats[stat] = STAT_BASE[stat]
      * weightFor(part.type, stat)
      * magnitude
      * shapeOf(traits, stat, intensity);
  }
  return { part, material, traits, magnitude, intensity, stats };
}

export function makePart(type: PartType, materialId: string, purity: number): Part {
  return { type, materialId, purity: clampPurity(purity) };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * SEVEN PARTS, ONE TOOL. Stats SUM, which is the only honest way to combine
 * them: each part contributes what it is worth, so an outstanding head cannot
 * be cancelled by a poor grip, and a full set of Aleph parts is seven times a
 * single Aleph part rather than some averaged mush.
 *
 * A tool may be assembled INCOMPLETE — `assembleTool` does not require all
 * seven. Step 3's tool station will decide whether a partial tool is usable;
 * this layer just adds up what is there, so the UI can show a build in progress.
 */
export function assembleTool(parts: Part[]): ToolStats {
  const stats = {} as Record<ToolStat, number>;
  for (const s of TOOL_STATS) stats[s] = 0;

  const traits = new Set<ForgeTraitId>();
  let depth = 0;
  for (const p of parts) {
    const d = derivePart(p);
    for (const s of TOOL_STATS) stats[s] += d.stats[s];
    for (const t of d.traits) traits.add(t);
    depth += shellOrdinal(d.material.shellId);
  }
  return {
    parts,
    stats,
    throughput: stats.bite * stats.cadence,
    traits: [...traits],
    depth,
  };
}

/** Are all seven shapes present, at most one of each? */
export function isComplete(parts: Part[]): boolean {
  const seen = new Set(parts.map((p) => p.type));
  return seen.size === PART_TYPES.length && parts.length === PART_TYPES.length;
}

/**
 * HOW MUCH MOLTEN MATERIAL A CAST OF THIS PART WANTS — the one number step 2's
 * casting screen needs from this layer. Scales with the part's weight class,
 * not with the material, so a Head always costs more to cast than a Grip
 * whatever it is made of, and the player learns one table instead of 158.
 *
 * Defined here rather than in step 2 so the melt state can stay trivially
 * simple: `{ materialId, partType, poured, want }`, and the UI is a div whose
 * height is `poured / want`. Plain CSS; this codebase has reverted a canvas UI
 * twice and nothing in this layer should ever make one necessary.
 */
export const PART_MELT: Record<PartType, number> = {
  head: 8, core: 6, edge: 4, binding: 3, handle: 5, grip: 2, sockets: 3,
};

export function partMelt(type: PartType): number {
  return PART_MELT[type];
}
