/**
 * THE NEW FORGE — STEP 1: the stat vocabulary, the seven part types, and the
 * trait character space.
 *
 * This is DATA ONLY. The derivation lives in systems/forgeParts.ts and nothing
 * is wired into the game yet — the existing `systems/toolParts.ts`
 * (head/haft/binding) is untouched and still owns the live Forge. These two
 * coexist until the new one is finished and the old one is deliberately retired.
 *
 * THE PART TABLE AND THE TRAIT EFFECTS ARE FORGE_design.md's, not invented here.
 * A first cut of this file was built before that doc was on disk and diverged
 * from it in five places — no ore-speed stat at all, modifier slots folded into
 * sockets, the head missing its speed half. This is the re-alignment; where a
 * ruling overrides the doc it says so by name.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RULING 1 — SHELL DEPTH DOMINATES.
 *
 * A deeper-shell material ALWAYS makes a better part. An Aleph common beats a
 * Loam starred, and it is not close. Descending is therefore always a tool
 * upgrade, which is the point: the mining loop's reward is new rock, so new
 * rock has to be worth having.
 *
 * This OVERRIDES the doc, which derives magnitude from "rarity/purity band".
 * It is a correction to a real measurement, not a preference: the rarity ladder
 * is FLAT across shells — every shell carries about 4 common / 3 rich / 3 pure /
 * 2 flawless / 1 starred / 1 aberrant. So `rarity → magnitude` alone gives depth
 * exactly nothing, and a formula built on it would have made Loam starred the
 * best material in the game forever.
 *
 * The guarantee is STRUCTURAL and asserted in test: the within-shell spread
 * (rarity × purity × grade) is strictly smaller than one SHELL_STEP. Worst
 * material of shell N+1 > best material of shell N, always.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RULING 2 — THE TRAIT SPACE IS NOT THE EXISTING TEN.
 *
 * Measured supply is lopsided: `charged` sits on 61 of 158 materials (44 of
 * 125 mined), nearly triple the next trait. A character system keyed only on
 * the authored traits would make a third of all parts feel the same.
 *
 * The fix widens the space WITHOUT hand-authoring 158 materials:
 *
 *   1. SHELL TRAITS. Every material additionally carries its shell's own
 *      trait, derived from `shellId` — free, universal, and it makes depth
 *      feel different rather than merely bigger. Seven new traits for nothing.
 *   2. TRAIT GRADE. Every trait is rated weak / fair / strong / prime by its
 *      NET budget, so a player can tell a good-trait material from a weak one
 *      at a glance instead of memorising seventeen effect lines.
 *   3. TRAIT INTENSITY. A trait's effect scales with the material's PURITY
 *      BAND, both ways — a high-purity brittle material is MORE brittle, faster
 *      and more fragile.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RULING 3 — `warm` STAYS FLAT.
 *
 * The doc has `warm` perform better in hot shells and worse in cold. It does
 * not, here, and deliberately: a shell-contextual stat means a part's numbers
 * depend on where the player is standing, so nothing downstream — the tool
 * station, a comparison screen, a saved loadout, the Compendium — can ever
 * print a part's stats without also asking "where?". Every later step inherits
 * that. Purity of the stat block is worth more than one trait's flavour, so
 * `warm` is a flat bite/strike trait that costs cadence, and the fiction (it
 * arrives hot and stays hot) survives intact.
 */
import type { TraitId } from '../traits';
import type { PurityBand } from '../materials';

// ---------------------------------------------------------------------------
// THE STAT VOCABULARY — ten numbers, one per thing the doc says a part governs
// ---------------------------------------------------------------------------

/**
 * WHAT A TOOL IS. Every stat here exists because FORGE_design.md's part table
 * names something that part governs; nothing is invented for the crafting
 * screen and nothing the doc names is missing.
 *
 *  BITE       POWER. Charge taken per chip out of plain rock. (Head)
 *  CADENCE    SPEED. Chips per second. (Head, with Handle behind it)
 *  ORESPEED   How fast it works an ORE cell — the doc's "player's ask", and a
 *             SEPARATE stat from BITE by ruling. A tool built for ore and a
 *             tool built for rock are different tools, not one tool with a
 *             bigger number. (Edge)
 *  STRIKE     Cutting harder cells, and damage to whatever is down there.
 *             (Head and Edge share it; nobody owns it.)
 *  DURABILITY The size of the wear pool. (Core, with Handle behind it)
 *  RESILIENCE How SLOWLY that pool empties — the doc's `light` effect needs a
 *             stat to land on. Separate from DURABILITY so "big tank" and
 *             "slow drain" are different builds. (Handle)
 *  MODSLOTS   Modifier slots. The doc puts these on the BINDING and keeps them
 *             apart from sockets; so do we. (Binding)
 *  STABILITY  How well mismatched parts cooperate — the number the coherence
 *             penalty is forgiven by. (Binding)
 *  CONTROL    The doc's Grip: crit-like bonuses and trait amplification. (Grip)
 *  ATTUNEMENT Socket capacity and how well a rune sits. (Sockets)
 *
 * Two stats from the first cut are GONE, because the doc's table has no room
 * for them: `reach` (never named anywhere in the doc) and `fortune` (its job —
 * "what the rock gives up besides charge" — is CONTROL's crit-like half plus
 * ORESPEED, both of which the doc does name).
 */
export type ToolStat =
  | 'bite' | 'cadence' | 'oreSpeed' | 'strike'
  | 'durability' | 'resilience'
  | 'modSlots' | 'stability' | 'control' | 'attunement';

export const TOOL_STATS: ToolStat[] = [
  'bite', 'cadence', 'oreSpeed', 'strike',
  'durability', 'resilience',
  'modSlots', 'stability', 'control', 'attunement',
];

export const STAT_LABEL: Record<ToolStat, string> = {
  bite: 'Bite', cadence: 'Cadence', oreSpeed: 'Ore Speed', strike: 'Strike',
  durability: 'Durability', resilience: 'Resilience',
  modSlots: 'Modifier Slots', stability: 'Stability',
  control: 'Control', attunement: 'Attunement',
};

export const STAT_BLURB: Record<ToolStat, string> = {
  bite: 'Charge taken out of plain rock per chip.',
  cadence: 'Chips per second. Bite × Cadence is what you take off a rock face.',
  oreSpeed: 'How fast it works a pocket. Nothing to do with how it handles rock.',
  strike: 'Hard cells, and whatever is down there that is not rock.',
  durability: 'How much work it has in it before it needs seeing to.',
  resilience: 'How slowly it spends that. A different build from a bigger pool.',
  modSlots: 'How many modifiers it will take, later.',
  stability: 'How well parts that have nothing to do with each other get along.',
  control: 'Steadiness in the hand. It finds the good hit, and it leans on the material.',
  attunement: 'How much it will hold — sockets, and how well a rune sits.',
};

/**
 * THE UNIT EACH STAT IS COUNTED IN, sized so a full tool of Loam COMMON parts
 * reads as roughly round numbers. Nothing here is load-bearing; it is the scale
 * the numbers are printed in.
 */
export const STAT_BASE: Record<ToolStat, number> = {
  bite: 6, cadence: 6, oreSpeed: 6, strike: 6,
  durability: 60, resilience: 6,
  modSlots: 1.2, stability: 4, control: 3, attunement: 2,
};

/**
 * HOW HARD MAGNITUDE PUSHES EACH STAT — and the reason four of them are damped.
 *
 * Ruling 1 makes one shell step 6x, so seven shells span 46,656x. That is right
 * for BITE. It is nonsense for MODIFIER SLOTS: an Aleph binding would offer
 * forty thousand of them.
 *
 * COUNT STATS ARE LOGARITHMIC IN MATERIAL POWER, therefore, and the exponent is
 * how logarithmic. At 0.15, the whole seven-shell ladder buys 46,656^0.15 = 5x
 * the modifier slots — a Loam binding gives about one, an Aleph binding about
 * five, which is the shape a slot count should have. CONTROL and STABILITY sit
 * at 0.5: they are rates, not counts, so they should grow, but a 46,656x crit
 * chance is not a stat either.
 *
 * This costs the damped stats their share of ruling 1's margin, so ruling 1 is
 * guaranteed on a part's TOTAL worth and on the whole tool, where the six
 * undamped stats dominate — see the test, which measures rather than assumes.
 */
export const STAT_MAGNITUDE_EXP: Record<ToolStat, number> = {
  bite: 1, cadence: 1, oreSpeed: 1, strike: 1,
  durability: 1, resilience: 1,
  modSlots: 0.15, attunement: 0.15,
  control: 0.5, stability: 0.5,
};

/** The stats that grow at full rate. Ruling 1 is measured on these. */
export const LINEAR_STATS: ToolStat[] =
  TOOL_STATS.filter((s) => STAT_MAGNITUDE_EXP[s] === 1);

// ---------------------------------------------------------------------------
// THE SEVEN PARTS — FORGE_design.md's table, row for row
// ---------------------------------------------------------------------------

export type PartType =
  | 'head' | 'core' | 'edge' | 'binding' | 'handle' | 'grip' | 'sockets';

export const PART_TYPES: PartType[] = [
  'head', 'core', 'edge', 'binding', 'handle', 'grip', 'sockets',
];

export interface PartTypeDef {
  id: PartType;
  name: string;
  /** What the doc's table says this part governs, verbatim enough to check. */
  governs: string;
  /** What this part is, in the game's voice. */
  blurb: string;
  /** The stats this part OWNS. Full weight. Some parts govern two things. */
  primary: ToolStat[];
  /** The stats it also speaks to. Just under half weight. */
  secondary: ToolStat[];
}

/**
 * WHO GOVERNS WHAT. Straight off the doc's table:
 *
 *   Head     mining SPEED + POWER          → bite + cadence, both primary
 *   Core     DURABILITY pool + ore handling→ durability primary, oreSpeed behind
 *   Edge     ORE speed + harder cells      → oreSpeed primary, strike behind
 *   Binding  modifier slots + cooperation  → modSlots + stability, both primary
 *   Handle   durability + swing rate       → resilience primary, both behind it
 *   Grip     control → crit / trait amp    → control primary
 *   Sockets  hold relics/runes/gems        → attunement primary
 *
 * TWO PARTS GOVERN TWO STATS EACH because the doc says they do, and fudging one
 * of the pair into a secondary would have quietly deleted the thing the row was
 * about. The HEAD is the speed-and-power part; the BINDING is the slots-and-
 * cooperation part.
 *
 * The HANDLE is the only part whose doc row is entirely "secondary" — "secondary
 * durability + speed". It gets RESILIENCE outright so it is not a part with
 * nothing of its own: how slowly a tool wears is a handle's business, and it is
 * the stat the doc's `light` effect needs somewhere to land.
 *
 * STRIKE is owned by nobody, on purpose. It is the rider on the doc's Head
 * ("breaking rock") and Edge ("cutting harder cells") rows, so it is the shared
 * secondary of both and never a build's headline.
 */
export const PART_DEFS: Record<PartType, PartTypeDef> = {
  head: {
    id: 'head', name: 'Head',
    governs: 'mining speed + power',
    primary: ['bite', 'cadence'], secondary: ['strike'],
    blurb: 'The part that meets the rock. How fast and how hard, both from here.',
  },
  core: {
    id: 'core', name: 'Core',
    governs: 'durability pool + ore handling',
    primary: ['durability'], secondary: ['oreSpeed', 'resilience'],
    blurb: 'The mass behind the head. Why the tool lasts, and why a pocket comes out whole.',
  },
  edge: {
    id: 'edge', name: 'Edge',
    governs: 'ore mining speed + cutting harder cells',
    primary: ['oreSpeed'], secondary: ['strike', 'control'],
    blurb: 'The ore specialist. It finds the seam in a pocket and opens it.',
  },
  binding: {
    id: 'binding', name: 'Binding',
    governs: 'modifier slots + how well mismatched parts cooperate',
    primary: ['modSlots', 'stability'], secondary: ['attunement'],
    blurb: 'What ties it together. A good binding is why seven strangers make one tool.',
  },
  handle: {
    id: 'handle', name: 'Handle',
    governs: 'durability + swing rate',
    primary: ['resilience'], secondary: ['durability', 'cadence'],
    blurb: 'The length and the balance. How long it lasts you, and how fast you can go.',
  },
  grip: {
    id: 'grip', name: 'Grip',
    governs: 'control — crit-like bonuses, trait amplification',
    primary: ['control'], secondary: ['cadence', 'stability'],
    blurb: 'What your hand actually touches. It knows the material better than you do.',
  },
  sockets: {
    id: 'sockets', name: 'Sockets',
    governs: 'holds relics / runes / gems',
    primary: ['attunement'], secondary: ['modSlots'],
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
 * depends on which materials each world actually has. `forge-parts.test.ts`
 * DERIVES the requirement from the registry and asserts SHELL_STEP beats it, so
 * adding a material with an unusual trait/rarity combo cannot silently break
 * ruling 1 — the test recomputes and fails.
 *
 * TWO EARLIER VALUES WERE WRONG AND BOTH WERE CAUGHT BY MEASURING:
 *   2.5  reasoned from rarity x purity alone (2.36x). Broke at five of six
 *        boundaries, because the trait multipliers were leaking value into
 *        magnitude. The fix was structural (see `shapeOf`), not a bigger number.
 *   4.0  after that fix. Still broke at two boundaries, because the grade
 *        bonus and the rarity ladder compound further than the arithmetic
 *        suggested. This is the third value and the first derived from data.
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
// COHERENCE — the mismatch penalty
// ---------------------------------------------------------------------------

/**
 * SEVEN PARTS THAT HAVE NOTHING TO DO WITH EACH OTHER MAKE A WORSE TOOL.
 *
 * The doc's Binding row is "modifier slots + how well mismatched parts
 * cooperate", and `trueseated` is "stability, less penalty from mismatched
 * parts". Both of those are answers to a mechanic, so here is the mechanic.
 * The first cut of this file had assembly as a pure sum and a test asserting
 * no part could ever be dragged down by another; that test is now gone, because
 * it asserted the absence of the thing that makes part choice interesting.
 *
 * WHAT IT CANNOT DO, and this is worth being plain about: it cannot make a
 * deeper part not worth slotting. Ruling 1 puts a shell step at 6x, so no
 * sane cooperation penalty outweighs one. That is correct and intended —
 * "should I use this Aleph head" must stay an easy yes.
 *
 * WHAT IT DOES instead is price SCATTER. Among parts of comparable depth,
 * a set that belongs together beats a set that does not, so the mid-game
 * question is not "is this part better" but "is it better ENOUGH to break my
 * set". One Aleph head in a Cinder tool is nearly free; one part from each of
 * the seven shells is a 60%-off tool.
 *
 * DISCORD has two terms:
 *   SHELL SPREAD — mean absolute deviation of the parts' shell ordinals from
 *   the set's median. All one shell → 0. One from each of seven → 1.71.
 *   VARIETY — the small cost of seven different materials rather than a matched
 *   set. Weighted low on purpose: trait variety within a shell is a BUILD, not
 *   a mistake, and should cost about 6%, not 30%.
 *
 * The curve is SUPERLINEAR (discord squared). Adjacent-shell mixing has to be
 * cheap or the tool can never be upgraded a part at a time, and wide scatter
 * has to be expensive or the penalty is decorative. One knee does both:
 *
 *   discord 0.35 (a full spread of one shell's materials)  → coherence 0.93
 *   discord 0.43 (four Aleph parts, three Hollow)          → coherence 0.89
 *   discord 2.06 (one part from every shell in the game)   → coherence 0.27
 */
export const MISMATCH_K = 0.7;
export const VARIETY_WEIGHT = 0.35;

/**
 * WHAT STABILITY BUYS BACK. Relief scales off the tool's stability SHARE — its
 * stability relative to its own average stat — so it is free of magnitude and a
 * Loam tool can be as coherent as an Aleph one. That is deliberate: a beginner
 * mixing shells because that is all they have should be able to solve it with a
 * good binding, not by descending.
 *
 * PIVOT IS 1.12, AND IT WAS MEASURED. An index of 1.0 would be a tool whose
 * traits say nothing about stability at all, which no real tool is: every
 * binding and grip in the registry leans on it a little, and an ordinary
 * seven-part build lands at 1.12–1.15. Pivoting at 1.0 gave every tool in the
 * game a free 20% and the trait that is supposed to buy it — `trueseated` —
 * nothing to distinguish it. Pivoting at the measured floor means an ordinary
 * tool earns roughly nothing and a tool BUILT for stability earns half the
 * penalty back.
 *
 * SLOPE AND CAP ARE THE OTHER HALF OF THE TRADE, and they fight the demo: relief
 * that is too generous forgives the seven-shells build so thoroughly that a
 * coherent set stops winning. At 2.5 / 0.50 a scattered set bound with a
 * trueseated flawless is a 1.5x better tool than the same set bound carelessly,
 * and a matched set still beats both.
 */
export const RELIEF_PIVOT = 1.12;
export const RELIEF_SLOPE = 2.5;
export const MAX_RELIEF = 0.50;

// ---------------------------------------------------------------------------
// THE TRAIT CHARACTER SPACE
// ---------------------------------------------------------------------------

/** The seven shell traits, one per world, carried by every material from it. */
export type ShellTraitId =
  | 'earthfast' | 'magnetic' | 'living' | 'refractive'
  | 'kindled' | 'absent' | 'firstmade';

export type ForgeTraitId = TraitId | ShellTraitId;

/**
 * HOW GOOD A TRAIT IS, at a glance.
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
 * THIS IS THE SEAM BETWEEN RULINGS 1 AND 2, and getting it wrong broke ruling 1
 * on the first cut. Ruling 1 wants depth to dominate; ruling 2 wants traits to
 * be a real reason to pick a material. Those fight if trait effects add VALUE,
 * because three good traits then out-earn a shell step.
 *
 * So they are split: a trait's per-stat `mods` are normalised to carry no net
 * value at all (`shapeOf`) and express only CHARACTER, while its GRADE adds a
 * small, bounded amount of magnitude. Better traits really are better — four
 * prime traits are 1.36x four fair ones — but no combination can cross a shell
 * boundary. If these widen past ~1.6x total spread, ruling 1 fails and
 * `forge-parts.test.ts` says so.
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
 * THE SEVENTEEN. Every effect on the ten authored traits is FORGE_design.md's
 * line for that trait, mapped onto the stat that now exists to receive it:
 *
 *   keen        "mining speed / cutting"          → cadence + strike
 *   dense/tough "durability, power"               → dense takes power, tough the pool
 *   brittle     "high speed but wears faster"     → cadence up, resilience down
 *   charged     "socket/modifier synergy"         → modSlots + attunement
 *   warm        flat by RULING 3, not contextual  → bite + strike, slow
 *   springy     "swing/use rate"                  → cadence + resilience
 *   light       "less durability drain per use"   → resilience, at the cost of power
 *   hollow      "more modifier slots, lower base" → modSlots + attunement, less of everything
 *   trueseated  "stability, less mismatch penalty"→ stability, the coherence trait
 *
 * Four of those moved from the first cut, which had guessed: `keen` was power
 * rather than speed, `light` was cadence rather than drain, `charged` was drop
 * rate rather than modifiers, and `trueseated` had no penalty to reduce because
 * there was no penalty.
 *
 * BRITTLE IS THE REFERENCE TRADEOFF and the doc names it: fast, and it wears
 * fast. Everything else is built to that standard.
 */
export const FORGE_TRAITS: Record<ForgeTraitId, ForgeTraitDef> = {
  // ── the ten authored ────────────────────────────────────────────────────
  keen: {
    id: 'keen', name: 'Keen', grade: 'strong',
    effect: 'Works quickly and cuts what will not break, and blunts sooner for it.',
    mods: { cadence: 0.24, strike: 0.20, durability: -0.26 },
  },
  tough: {
    id: 'tough', name: 'Tough', grade: 'fair',
    effect: 'Takes far more work before it needs any, and swings slower.',
    mods: { durability: 0.30, resilience: 0.14, cadence: -0.30, bite: -0.08 },
  },
  dense: {
    id: 'dense', name: 'Dense', grade: 'fair',
    effect: 'Everything it hits feels it. Everything it hits takes longer to get to.',
    mods: { bite: 0.26, durability: 0.16, cadence: -0.30, oreSpeed: -0.06 },
  },
  light: {
    id: 'light', name: 'Light', grade: 'fair',
    effect: 'Costs the tool almost nothing to use, and does not land with much.',
    mods: { resilience: 0.28, cadence: 0.14, bite: -0.24, strike: -0.12 },
  },
  springy: {
    id: 'springy', name: 'Springy', grade: 'strong',
    effect: 'Gives and comes back, so it keeps its rhythm and its shape.',
    mods: { cadence: 0.20, resilience: 0.24, strike: -0.28 },
  },
  brittle: {
    id: 'brittle', name: 'Brittle', grade: 'weak',
    effect: 'Very fast, and it is coming apart the whole time.',
    mods: { cadence: 0.30, bite: 0.14, resilience: -0.34, durability: -0.18 },
  },
  charged: {
    id: 'charged', name: 'Charged', grade: 'strong',
    effect: 'Takes modifiers and holds runes. Will not sit still long enough to last.',
    mods: { modSlots: 0.26, attunement: 0.18, resilience: -0.20, durability: -0.10 },
  },
  warm: {
    id: 'warm', name: 'Warm', grade: 'fair',
    effect: 'The rock gives up easier for it, and it is slow about asking.',
    mods: { bite: 0.20, strike: 0.16, cadence: -0.26, resilience: -0.04 },
  },
  hollow: {
    id: 'hollow', name: 'Hollow', grade: 'weak',
    effect: 'Roomy inside — it takes more than it should. There is not much of it.',
    mods: { modSlots: 0.30, attunement: 0.22, durability: -0.34, bite: -0.24 },
  },
  trueseated: {
    id: 'trueseated', name: 'Trueseated', grade: 'prime',
    effect: 'Sits exactly where you put it, and makes strangers of parts get along.',
    mods: { stability: 0.34, control: 0.12, attunement: 0.08, cadence: -0.06 },
  },

  // ── the seven shell traits, derived and free ────────────────────────────
  earthfast: {
    id: 'earthfast', name: 'Earthfast', grade: 'fair',
    effect: 'Loam rock. Steady and long-lasting, and it has never seen a pocket.',
    mods: { durability: 0.20, stability: 0.14, oreSpeed: -0.16, control: -0.12 },
  },
  magnetic: {
    id: 'magnetic', name: 'Magnetic', grade: 'strong',
    effect: 'Ferrite metal. What you are looking for comes to you; it is heavy about it.',
    mods: { oreSpeed: 0.30, attunement: 0.14, cadence: -0.28, control: 0.02 },
  },
  living: {
    id: 'living', name: 'Living', grade: 'strong',
    effect: 'Verdance growth. It closes its own cracks and it does not like hitting things.',
    mods: { resilience: 0.30, cadence: 0.16, durability: 0.12, strike: -0.42 },
  },
  refractive: {
    id: 'refractive', name: 'Refractive', grade: 'strong',
    effect: 'Glassmere glass. It sees the seam in a pocket. Handle it carefully.',
    mods: { oreSpeed: 0.28, control: 0.22, durability: -0.24, resilience: -0.14 },
  },
  kindled: {
    id: 'kindled', name: 'Kindled', grade: 'strong',
    effect: 'Cinder stone. It arrives hot and it does not stop being hot.',
    mods: { bite: 0.28, strike: 0.24, resilience: -0.24, durability: -0.10 },
  },
  absent: {
    id: 'absent', name: 'Absent', grade: 'prime',
    effect: 'Hollow rock. Weighs nothing, holds far more than it should.',
    mods: { cadence: 0.26, modSlots: 0.24, attunement: 0.20, bite: -0.26, durability: -0.14 },
  },
  firstmade: {
    id: 'firstmade', name: 'First-made', grade: 'prime',
    effect: 'Aleph matter. It was made before the rules were, and it shows everywhere.',
    mods: {
      bite: 0.05, cadence: 0.05, oreSpeed: 0.05, strike: 0.05,
      durability: 0.05, resilience: 0.05,
      modSlots: 0.05, stability: 0.05, control: 0.05, attunement: 0.05,
    },
  },
};

/** Which shell trait a world imparts. Derived, so no material is authored. */
export const SHELL_TRAIT: Record<string, ShellTraitId> = {
  loam: 'earthfast', ferrite: 'magnetic', verdance: 'living',
  glassmere: 'refractive', cinder: 'kindled', hollow: 'absent', aleph: 'firstmade',
};

/**
 * TRAIT INTENSITY BY PURITY BAND — the "quality tiers of a trait" ruling 2
 * asked for. It scales BOTH directions: a high-purity brittle material is more
 * brittle, which is faster AND more fragile. That keeps a tradeoff a tradeoff at
 * every purity, and it means "which brittle stone" is a real question rather
 * than always "the cleanest one".
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
