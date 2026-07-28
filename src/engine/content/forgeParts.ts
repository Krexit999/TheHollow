/**
 * THE NEW FORGE — STEP 1: the stat vocabulary, the seven part types, and the
 * trait character space.
 *
 * This is DATA ONLY. The derivation lives in systems/forgeParts.ts and nothing
 * is wired into the game yet — the existing `systems/toolParts.ts`
 * (head/haft/binding) is untouched and still owns the live Forge. These two
 * coexist until the new one is finished and the old one is deliberately retired.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RULING 1 — SHELL DEPTH DOMINATES.
 *
 * A deeper-shell material ALWAYS makes a better part. An Aleph common beats a
 * Loam starred, and it is not close. Descending is therefore always a tool
 * upgrade, which is the point: the mining loop's reward is new rock, so new
 * rock has to be worth having.
 *
 * This is a correction to a real measurement, not a preference. The rarity
 * ladder is FLAT across shells — every shell carries about 4 common / 3 rich /
 * 3 pure / 2 flawless / 1 starred / 1 aberrant. So `rarity → magnitude` alone
 * gives depth exactly nothing, and a formula built on rarity would have made
 * Loam starred the best material in the game forever.
 *
 * The guarantee is STRUCTURAL and asserted in test: the within-shell spread
 * (rarity × purity, at most ~2.36x) is strictly smaller than one SHELL_STEP
 * (2.5x). Worst material of shell N+1 > best material of shell N, always. If
 * anyone widens the rarity or purity terms later, that test fails and tells
 * them which ruling they just broke.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RULING 2 — THE TRAIT SPACE IS NOT THE EXISTING TEN.
 *
 * Measured supply is lopsided: `charged` sits on 61 of 158 materials (44 of
 * 125 mined), nearly triple the next trait. A character system keyed only on
 * the authored traits would make a third of all parts feel the same, and
 * `springy`/`tough` tradeoffs would be nearly unreachable among mined rock.
 *
 * The fix widens the space WITHOUT hand-authoring 158 materials, which the
 * brief rules out and which would rot the moment a material is added:
 *
 *   1. SHELL TRAITS. Every material additionally carries its shell's own
 *      trait, derived from `shellId` — free, universal, and it makes depth
 *      feel different rather than merely bigger. Seven new traits for nothing.
 *   2. TRAIT GRADE. Every trait is rated weak / fair / strong / prime by its
 *      NET budget, so a player can tell a good-trait material from a weak one
 *      at a glance instead of memorising seventeen effect lines.
 *   3. TRAIT INTENSITY. A trait's effect scales with the material's PURITY
 *      BAND, both ways — a high-purity brittle material is MORE brittle, faster
 *      and more fragile. Same trait, graded, so "which brittle stone" is a real
 *      question.
 *
 * The ten authored traits keep the fiction they already have in traits.ts;
 * nothing there is edited, because the drill-alloy signatures read it.
 */
import type { TraitId } from '../traits';
import type { PurityBand } from '../materials';

// ---------------------------------------------------------------------------
// THE STAT VOCABULARY — eight numbers, and every one has to matter
// ---------------------------------------------------------------------------

/**
 * WHAT A TOOL IS. Eight stats, chosen so that every one already has somewhere
 * to land in this game rather than being invented for the crafting screen:
 *
 *  BITE       charge taken per chip. The core mining number.
 *  CADENCE    chips per second. BITE x CADENCE is throughput, which is the
 *             headline and the reason speed/power is a real trade.
 *  STRIKE     damage against the Deepwrought. Already a live tool stat.
 *  REACH      how many cells a swing touches (sweep width / area).
 *  DURABILITY the size of the wear pool. Step 4's drain reads it.
 *  RESILIENCE how SLOWLY that pool empties. Deliberately separate from
 *             DURABILITY so "big tank" and "slow drain" are different builds.
 *  FORTUNE    drop chance and rarity lean. The one stat outside the income
 *             path (pillar 2), so it can be generous.
 *  ATTUNEMENT socket capacity and rune stability. Step 5 reads it.
 */
export type ToolStat =
  | 'bite' | 'cadence' | 'strike' | 'reach'
  | 'durability' | 'resilience' | 'fortune' | 'attunement';

export const TOOL_STATS: ToolStat[] = [
  'bite', 'cadence', 'strike', 'reach',
  'durability', 'resilience', 'fortune', 'attunement',
];

export const STAT_LABEL: Record<ToolStat, string> = {
  bite: 'Bite', cadence: 'Cadence', strike: 'Strike', reach: 'Reach',
  durability: 'Durability', resilience: 'Resilience', fortune: 'Fortune',
  attunement: 'Attunement',
};

export const STAT_BLURB: Record<ToolStat, string> = {
  bite: 'Charge taken out of the rock per chip.',
  cadence: 'Chips per second. Bite × Cadence is what you actually mine.',
  strike: 'What it does to whatever is down there.',
  reach: 'How much of the face one swing touches.',
  durability: 'How much work it has in it before it needs seeing to.',
  resilience: 'How slowly it spends that. A different build from a bigger pool.',
  fortune: 'What the rock gives up besides charge.',
  attunement: 'How much it will hold — sockets, and how well a rune sits.',
};

/**
 * THE UNIT EACH STAT IS COUNTED IN, sized so a full tool of Loam COMMON parts
 * reads as roughly round numbers — bite 10, cadence 10, durability 100 — and a
 * full Aleph tool lands ~244x that. Nothing here is load-bearing; it is the
 * scale the numbers are printed in.
 */
export const STAT_BASE: Record<ToolStat, number> = {
  bite: 6, cadence: 6, strike: 6, reach: 1.2,
  durability: 60, resilience: 6, fortune: 3, attunement: 2,
};

// ---------------------------------------------------------------------------
// THE SEVEN PARTS
// ---------------------------------------------------------------------------

export type PartType =
  | 'head' | 'core' | 'edge' | 'binding' | 'handle' | 'grip' | 'sockets';

export const PART_TYPES: PartType[] = [
  'head', 'core', 'edge', 'binding', 'handle', 'grip', 'sockets',
];

export interface PartTypeDef {
  id: PartType;
  name: string;
  /** What this part is, in the game's voice. */
  blurb: string;
  /** The stat this part OWNS. Full weight. */
  primary: ToolStat;
  /** The stat it also speaks to. Just under half weight. */
  secondary: ToolStat;
}

/**
 * WHO GOVERNS WHAT. Each part owns one stat outright and leans on a second, and
 * every part additionally SPILLS a little into everything else (`SPILL` below)
 * — so a part is never irrelevant to a build, but it is obviously FOR something.
 *
 * The assignment is deliberately not symmetrical. BITE comes overwhelmingly
 * from the HEAD, the way it does in every game that has ever done this, and
 * the CORE behind it is the mass that makes the head land. REACH and FORTUNE
 * are thin on purpose: they are the interesting stats, and a build that wants
 * them has to give something up to get them.
 */
export const PART_DEFS: Record<PartType, PartTypeDef> = {
  head: {
    id: 'head', name: 'Head', primary: 'bite', secondary: 'strike',
    blurb: 'The part that meets the rock. Almost all of what you take comes from here.',
  },
  core: {
    id: 'core', name: 'Core', primary: 'durability', secondary: 'bite',
    blurb: 'The mass behind the head. It is why the head lands, and why the tool lasts.',
  },
  edge: {
    id: 'edge', name: 'Edge', primary: 'strike', secondary: 'reach',
    blurb: 'What it does to things that are not rock — and how wide it opens a face.',
  },
  binding: {
    id: 'binding', name: 'Binding', primary: 'resilience', secondary: 'durability',
    blurb: 'What holds it together under load. A good binding is why a tool comes back.',
  },
  handle: {
    id: 'handle', name: 'Handle', primary: 'cadence', secondary: 'strike',
    blurb: 'The length and balance. How fast you can swing it at all.',
  },
  grip: {
    id: 'grip', name: 'Grip', primary: 'fortune', secondary: 'cadence',
    blurb: 'What your hand actually touches. Nobody agrees why it changes what you find.',
  },
  sockets: {
    id: 'sockets', name: 'Sockets', primary: 'attunement', secondary: 'reach',
    blurb: 'The seats. How much the tool will hold, and how well it holds it.',
  },
};

/** Weight a part contributes to its primary / secondary / everything else. */
export const W_PRIMARY = 1.0;
export const W_SECONDARY = 0.45;
export const W_SPILL = 0.06;

// ---------------------------------------------------------------------------
// MAGNITUDE — shell dominant, rarity and purity ordering within a shell
// ---------------------------------------------------------------------------

/**
 * ONE SHELL STEP — 6x, and the number was measured, not chosen.
 *
 * Ruling 1 holds only if one shell step exceeds the ENTIRE within-shell spread.
 * That spread is not a formula you can read off the constants, because it
 * depends on which materials each world actually has; it was measured across
 * the real registry and comes out at 2.4x (Hollow) to 4.5x (Ferrite), and the
 * binding requirement — Cinder's best against Hollow's worst — needs 5.5x.
 * 6.0 clears it with margin at every one of the six boundaries.
 *
 * `forge-parts.test.ts` DERIVES that requirement from the registry and asserts
 * SHELL_STEP beats it, so adding a material with an unusual trait/rarity combo
 * cannot silently break ruling 1 — the test recomputes and fails.
 *
 * TWO EARLIER VALUES WERE WRONG AND BOTH WERE CAUGHT BY MEASURING:
 *   2.5  reasoned from rarity x purity alone (2.36x). Broke at five of six
 *        boundaries, because the trait multipliers were leaking value into
 *        magnitude — Ferrite's worst head read 10.6 bite against Loam's best
 *        at 16.9. The fix was structural (see `shapeOf`), not a bigger number.
 *   4.0  after that fix. Still broke at two boundaries, because the grade
 *        bonus and the rarity ladder compound further than the arithmetic
 *        suggested. This is the third value and the first one derived from
 *        the data instead of from an argument.
 *
 * Across seven shells that is 6^6 = 46,656x — the whole tool ladder, and the
 * literal meaning of "shell depth DOMINATES".
 */
export const SHELL_STEP = 6.0;

/** Rarity orders materials WITHIN a shell. Secondary by ruling 1. */
export const RARITY_STEP = 0.15;

/** Purity, likewise. 1 → 0.853, 100 → 1.15. */
export const PURITY_FLOOR = 0.85;
export const PURITY_PER_POINT = 0.003;

// ---------------------------------------------------------------------------
// THE TRAIT CHARACTER SPACE
// ---------------------------------------------------------------------------

/** The seven shell traits, one per world, carried by every material from it. */
export type ShellTraitId =
  | 'earthfast' | 'magnetic' | 'living' | 'refractive'
  | 'kindled' | 'absent' | 'firstmade';

export type ForgeTraitId = TraitId | ShellTraitId;

/**
 * HOW GOOD A TRAIT IS, at a glance. The player should be able to look at a
 * material and know whether its traits are worth having without reading four
 * effect lines and doing arithmetic.
 *
 *   weak    it costs more than it gives. Characterful, not good.
 *   fair    an even trade.
 *   strong  worth having.
 *   prime   worth building around.
 *
 * The grade is not decorative: `traitNet` computes the actual sum of a trait's
 * deltas, and a test asserts every trait's grade matches what its numbers
 * really do. A trait cannot be labelled `prime` and quietly be a downgrade.
 */
export type TraitGrade = 'weak' | 'fair' | 'strong' | 'prime';

/**
 * WHAT A TRAIT'S GRADE IS WORTH, as a magnitude multiplier.
 *
 * THIS IS THE SEAM BETWEEN THE TWO RULINGS, and getting it wrong broke ruling 1
 * on the first cut. Ruling 1 wants depth to dominate; ruling 2 wants traits to
 * be a real reason to pick a material. Those fight if trait effects add VALUE,
 * because three good traits then out-earn a shell step.
 *
 * So they are split: a trait's per-stat `mods` are normalised to carry no net
 * value at all (`shapeOf`) and express only CHARACTER, while its GRADE adds a
 * small, bounded amount of magnitude. Better traits really are better — four
 * prime traits are 1.36x four fair ones — but no combination of them can cross
 * a shell boundary.
 *
 * Deliberately narrow. If these widen past ~1.6x total spread, ruling 1 fails
 * and `forge-parts.test.ts` says so.
 */
export const GRADE_BONUS: Record<TraitGrade, number> = {
  weak: 0.96, fair: 1.0, strong: 1.04, prime: 1.08,
};

export const GRADE_BAND: Record<TraitGrade, [number, number]> = {
  weak: [-1, -0.02],
  fair: [-0.02, 0.08],
  strong: [0.08, 0.20],
  prime: [0.20, 1],
};

export interface ForgeTraitDef {
  id: ForgeTraitId;
  name: string;
  grade: TraitGrade;
  /** One plain sentence — what it does to a tool, not what it is. */
  effect: string;
  /** Multiplicative deltas per stat. +0.25 = +25% at intensity 1. */
  mods: Partial<Record<ToolStat, number>>;
}

/**
 * THE SEVENTEEN. Ten authored traits keep the fiction they already carry in
 * traits.ts; seven shell traits are new and free.
 *
 * BRITTLE IS THE REFERENCE TRADEOFF and the brief named it: fast, and it wears
 * fast. Everything else is built to that standard — a trait that is only good
 * is a `prime`, and there are exactly two of them.
 */
export const FORGE_TRAITS: Record<ForgeTraitId, ForgeTraitDef> = {
  // ── the ten authored ────────────────────────────────────────────────────
  keen: {
    id: 'keen', name: 'Keen', grade: 'strong',
    effect: 'Bites deeper and cuts harder, and blunts sooner for it.',
    mods: { bite: 0.22, strike: 0.18, durability: -0.24 },
  },
  tough: {
    id: 'tough', name: 'Tough', grade: 'fair',
    effect: 'Takes far more work before it needs any, and swings slower.',
    mods: { durability: 0.28, resilience: 0.14, cadence: -0.30, bite: -0.08 },
  },
  dense: {
    id: 'dense', name: 'Dense', grade: 'fair',
    effect: 'Everything it hits feels it. Everything it hits takes longer to get to.',
    mods: { bite: 0.22, strike: 0.20, cadence: -0.28, reach: -0.08 },
  },
  light: {
    id: 'light', name: 'Light', grade: 'fair',
    effect: 'Quick and far-reaching, and it does not land with much.',
    mods: { cadence: 0.26, reach: 0.16, bite: -0.28, strike: -0.10 },
  },
  springy: {
    id: 'springy', name: 'Springy', grade: 'strong',
    effect: 'Gives and comes back, so it keeps its shape and its rhythm.',
    mods: { cadence: 0.18, resilience: 0.22, strike: -0.26 },
  },
  brittle: {
    id: 'brittle', name: 'Brittle', grade: 'weak',
    effect: 'Very fast, very sharp, and it is coming apart the whole time.',
    mods: { cadence: 0.30, bite: 0.14, resilience: -0.34, durability: -0.18 },
  },
  charged: {
    id: 'charged', name: 'Charged', grade: 'fair',
    effect: 'Finds things. Will not hold still long enough to last.',
    mods: { fortune: 0.24, reach: 0.12, resilience: -0.24, durability: -0.10 },
  },
  warm: {
    id: 'warm', name: 'Warm', grade: 'fair',
    effect: 'The rock gives up easier for it, and it is slow about asking.',
    mods: { bite: 0.20, durability: 0.14, cadence: -0.26, resilience: -0.04 },
  },
  hollow: {
    id: 'hollow', name: 'Hollow', grade: 'weak',
    effect: 'Light in the hand and roomy inside. There is not much of it.',
    mods: { cadence: 0.20, attunement: 0.26, durability: -0.34, strike: -0.16 },
  },
  trueseated: {
    id: 'trueseated', name: 'Trueseated', grade: 'prime',
    effect: 'Sits exactly where you put it, and everything you put in it does too.',
    mods: { attunement: 0.22, fortune: 0.10, resilience: 0.08, cadence: -0.06 },
  },

  // ── the seven shell traits, derived and free ────────────────────────────
  earthfast: {
    id: 'earthfast', name: 'Earthfast', grade: 'fair',
    effect: 'Loam rock. Nothing special and nothing wrong with it.',
    mods: { durability: 0.16, resilience: 0.10, reach: -0.14, fortune: -0.10 },
  },
  magnetic: {
    id: 'magnetic', name: 'Magnetic', grade: 'strong',
    effect: 'Ferrite metal. What you are looking for comes to you; it is heavy about it.',
    mods: { fortune: 0.24, attunement: 0.16, cadence: -0.28, strike: 0.04 },
  },
  living: {
    id: 'living', name: 'Living', grade: 'strong',
    effect: 'Verdance growth. It closes its own cracks and it does not like hitting things.',
    mods: { resilience: 0.28, cadence: 0.14, durability: 0.08, strike: -0.34 },
  },
  refractive: {
    id: 'refractive', name: 'Refractive', grade: 'strong',
    effect: 'Glassmere glass. Opens a wide face and finds the seams. Handle it carefully.',
    mods: { reach: 0.32, fortune: 0.18, durability: -0.26, resilience: -0.14 },
  },
  kindled: {
    id: 'kindled', name: 'Kindled', grade: 'strong',
    effect: 'Cinder stone. It arrives hot and it does not stop being hot.',
    mods: { bite: 0.24, strike: 0.22, resilience: -0.24, durability: -0.10 },
  },
  absent: {
    id: 'absent', name: 'Absent', grade: 'prime',
    effect: 'Hollow rock. Weighs nothing, reaches everywhere, holds more than it should.',
    mods: { cadence: 0.24, reach: 0.22, attunement: 0.20, bite: -0.26, durability: -0.12 },
  },
  firstmade: {
    id: 'firstmade', name: 'First-made', grade: 'prime',
    effect: 'Aleph matter. It was made before the rules were, and it shows in every direction.',
    mods: {
      bite: 0.05, cadence: 0.05, strike: 0.05, reach: 0.05,
      durability: 0.05, resilience: 0.05, fortune: 0.05, attunement: 0.05,
    },
  },
};

/** Which shell trait a world imparts. Derived, so no material is authored. */
export const SHELL_TRAIT: Record<string, ShellTraitId> = {
  loam: 'earthfast', ferrite: 'magnetic', verdance: 'living',
  glassmere: 'refractive', cinder: 'kindled', hollow: 'absent', aleph: 'firstmade',
};

/**
 * TRAIT INTENSITY BY PURITY BAND — the "quality tiers of a trait" the ruling
 * asked for. It scales BOTH directions: a high-purity brittle material is more
 * brittle, which is faster AND more fragile. That keeps a tradeoff a tradeoff
 * at every purity, and it means "which brittle stone" is a real question rather
 * than always "the cleanest one".
 *
 * Magnitude already makes purity monotonically better (ruling 1); this is the
 * orthogonal axis, and it is the one that gives a material character.
 */
export const TRAIT_INTENSITY: Record<PurityBand, number> = {
  poor: 0.70, fair: 0.85, good: 1.00, fine: 1.15, exalted: 1.30,
};

/** The net budget a trait's numbers actually add up to. `grade` must match. */
export function traitNet(def: ForgeTraitDef): number {
  return Object.values(def.mods).reduce((a, b) => a + (b ?? 0), 0);
}

export function gradeOf(net: number): TraitGrade {
  if (net < GRADE_BAND.weak[1]) return 'weak';
  if (net < GRADE_BAND.fair[1]) return 'fair';
  if (net < GRADE_BAND.strong[1]) return 'strong';
  return 'prime';
}
