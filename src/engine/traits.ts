/**
 * MATERIAL TRAITS — the answer to "139 materials that are one material with 139
 * names."
 *
 * A material used to be a rarity tier and a purity roll and nothing else. Now
 * every material carries 2-3 TRAITS: legible, opinionated properties that make
 * it a character. Loamiron is soft but takes an edge. Umberjade is brittle and
 * hums with charge. You form opinions, and the opinions matter, because a
 * tool is built out of these.
 *
 * FOUR RULES the vocabulary obeys, from the brief:
 *
 *  1. LEARNABLE. Each trait is one plain sentence. "Keen: takes a savage edge."
 *     A player reads it once and remembers it.
 *
 *  2. TRADEOFF-SHAPED. Every trait is good at something AND bad at something.
 *     No material is strictly better than a lower-tier one at everything —
 *     rarity buys SPECIALISATION, not universal superiority. This is the rule
 *     that keeps Marl relevant at hour 80: a keen common still out-edges a
 *     tough rare.
 *
 *  3. VISIBLE. Traits show in the Hold, the Compendium, and the forge bench.
 *     This is the ONE place pillar 5 does not apply — a trait is a property,
 *     not a solution. What traits do IN COMBINATION stays discovered.
 *
 *  4. INTERACTING. Traits read against each other. Brittle plus Dense shatters;
 *     Keen plus Trueseated sings. Those pairings are the discovery, and the
 *     Compendium never lists them (guarded by compendium-coverage.ts).
 *
 * A tool is built from a HEAD, a HAFT and a BINDING, and each part reads
 * DIFFERENT traits from its material. A head cares about edge and force; a haft
 * about heft and cadence; a binding about grip and hold. So the same trait
 * pulls its weight in one part and sits quiet in another — Dense is everything
 * in a haft and almost nothing in a binding.
 */

export type TraitId =
  | 'keen' | 'tough' | 'dense' | 'light' | 'springy'
  | 'brittle' | 'charged' | 'warm' | 'hollow' | 'trueseated';

/** Which stat a factor touches. Defaults are 1.0 (no effect). */
export interface PartFactors {
  /** Head → chip yield. */
  edge?: number;
  /** Head → strike power, and edge retention against purity loss. */
  force?: number;
  /** Haft → strike power. */
  heft?: number;
  /** Haft → chip cadence (speed), which reads as chip yield. */
  cadence?: number;
  /** Haft/binding → durability & forgiveness (a resilience score, 1 = neutral). */
  flex?: number;
  /** Binding → socket effectiveness and count bonus. */
  grip?: number;
  /** Binding → rune stability, and head edge retention. */
  hold?: number;
}

export interface TraitDef {
  id: TraitId;
  name: string;
  /** One plain sentence — the whole of rule 1. */
  blurb: string;
  /** Multiplicative factors this trait contributes, per stat. */
  factors: PartFactors;
  /**
   * Outward reach: a bucket this trait feeds while its condition holds, so a
   * material can be "inert in Loam and alive in Ferrite". Optional.
   */
  reach?: string;
}

/**
 * TEN traits. Quality gate from the brief: 8 sharp beat 20 mushy. Each one
 * here is a sentence a player can have an opinion about, and each trades.
 */
export const TRAITS: Record<TraitId, TraitDef> = {
  keen: {
    id: 'keen', name: 'Keen', blurb: 'Takes a savage edge, and loses it just as fast.',
    // A fierce head, but the edge dulls — low hold.
    factors: { edge: 1.32, hold: 0.82 },
  },
  tough: {
    id: 'tough', name: 'Tough', blurb: 'Refuses to crack. Also refuses to sharpen.',
    // The binding and haft material — never the head.
    factors: { flex: 1.28, hold: 1.18, edge: 0.84 },
  },
  dense: {
    id: 'dense', name: 'Dense', blurb: 'Heavy in the hand. Hits like the floor of the shaft.',
    // Strike everything, cadence nothing.
    factors: { heft: 1.38, force: 1.18, cadence: 0.78 },
  },
  light: {
    id: 'light', name: 'Light', blurb: 'Quick and willing. You will chip all day and not feel it.',
    // Chip cadence up, strike down.
    factors: { cadence: 1.34, force: 0.80 },
  },
  springy: {
    id: 'springy', name: 'Springy', blurb: 'Flexes and returns. A forgiving thing to swing.',
    factors: { flex: 1.30, heft: 0.88 },
  },
  brittle: {
    id: 'brittle', name: 'Brittle', blurb: 'One bad angle from failing. Cheap to sharpen, though.',
    // A cheap savage head; fragile everywhere.
    factors: { edge: 1.24, flex: 0.70 },
  },
  charged: {
    id: 'charged', name: 'Charged', blurb: 'Hums with stored charge. The field likes it.',
    factors: { edge: 1.06, grip: 1.06 },
    reach: 'regen',
  },
  warm: {
    id: 'warm', name: 'Warm', blurb: 'Holds its heat long after you stop working it.',
    factors: { heft: 1.06, force: 1.04 },
    reach: 'kilnHeatRamp',
  },
  hollow: {
    id: 'hollow', name: 'Hollow', blurb: 'Full of little rooms. Sets a stone deep and true.',
    // The socket binding; a poor head.
    factors: { grip: 1.36, force: 0.84 },
  },
  trueseated: {
    id: 'trueseated', name: 'Trueseated', blurb: 'Holds whatever is set in it, forever — and never gives an inch.',
    // The rune-stable binding, and it keeps a head's edge. The cost of holding
    // everything so firmly is that it holds NOTHING loosely: rigid, unforgiving.
    factors: { hold: 1.42, force: 1.10, flex: 0.84 },
  },
};

export const ALL_TRAITS = Object.keys(TRAITS) as TraitId[];

export function traitDef(id: TraitId): TraitDef {
  const t = TRAITS[id];
  if (!t) throw new Error(`Unknown trait: ${id}`);
  return t;
}

/**
 * TRAIT PAIR INTERACTIONS — the discovered layer. When a tool's three parts
 * together carry both traits of a pair, the pairing bites: some shatter (a
 * penalty), some sing (a bonus). PILLAR 5: these are NEVER listed in the
 * Compendium. The player finds them by building.
 *
 * Keyed order-independently. `mult` applies to the whole tool's chip AND
 * strike, so a shatter pairing genuinely hurts and a singing pairing genuinely
 * helps — enough to be a real consideration, never enough to dwarf the parts
 * themselves.
 */
export interface TraitPair {
  a: TraitId;
  b: TraitId;
  /** Whole-tool multiplier when both are present. */
  mult: number;
  /** Recorded in the Codex, in the game's voice, once found. */
  name: string;
  flavor: string;
}

export const TRAIT_PAIRS: TraitPair[] = [
  // --- The shatters (penalties) -------------------------------------------
  {
    a: 'brittle', b: 'dense', mult: 0.78, name: 'The Shatter',
    flavor: 'A brittle edge on a heavy swing. It works exactly twice.',
  },
  {
    a: 'brittle', b: 'warm', mult: 0.86, name: 'The Crazing',
    flavor: 'Brittle and warm. It cracks along the heat, quietly, and keeps working while it does.',
  },
  {
    a: 'keen', b: 'brittle', mult: 0.9, name: 'The Chipped Tooth',
    flavor: 'Savage and fragile at once. Astonishing for an hour.',
  },
  // --- The songs (bonuses) ------------------------------------------------
  {
    a: 'keen', b: 'trueseated', mult: 1.18, name: 'The Held Edge',
    flavor: 'A keen head in a binding that will not let it dull. Rare and quietly perfect.',
  },
  {
    a: 'dense', b: 'tough', mult: 1.15, name: 'The Anvil',
    flavor: 'Heavy and unbreakable. It does not so much cut the rock as disagree with it.',
  },
  {
    a: 'light', b: 'springy', mult: 1.14, name: 'The Willowcrack',
    flavor: 'Light and flexing. The stroke returns to you before you have finished it.',
  },
  {
    a: 'charged', b: 'hollow', mult: 1.16, name: 'The Resonator',
    flavor: 'Charge in a hollow body. The whole tool rings on the beat, and the field answers.',
  },
  {
    a: 'warm', b: 'trueseated', mult: 1.12, name: 'The Bankfire',
    flavor: 'Warmth held true. It keeps its heat and its shape through the longest shift.',
  },
  {
    a: 'tough', b: 'springy', mult: 1.12, name: 'The Green Bough',
    flavor: 'Tough and springy. You could hand it to your grandchild.',
  },
  {
    a: 'charged', b: 'keen', mult: 1.13, name: 'The Live Edge',
    flavor: 'A charged keen edge. It cuts a half-beat before it lands.',
  },
];

const pairKey = (a: TraitId, b: TraitId) => [a, b].sort().join('|');
const PAIR_BY_KEY = new Map(TRAIT_PAIRS.map((p) => [pairKey(p.a, p.b), p]));

/** The interaction for a pair, or undefined — order-independent. */
export function traitPair(a: TraitId, b: TraitId): TraitPair | undefined {
  return PAIR_BY_KEY.get(pairKey(a, b));
}

/** Every pair present in a set of traits (a tool's combined trait set). */
export function activePairs(traits: TraitId[]): TraitPair[] {
  const set = [...new Set(traits)];
  const out: TraitPair[] = [];
  for (let i = 0; i < set.length; i++) {
    for (let j = i + 1; j < set.length; j++) {
      const p = traitPair(set[i]!, set[j]!);
      if (p) out.push(p);
    }
  }
  return out;
}

/**
 * WHO CARRIES WHAT. Authored per material, not generated — a material's traits
 * are its character and must be stable, learnable, and true to its flavor text.
 *
 * The Loam fifteen are hand-tuned for the Shell I acceptance test: by minute 20
 * a player must be able to forge two genuinely different tier-II tools from Loam
 * alone and understand why. Loamiron is keen-and-springy (the brief's own "soft
 * but takes an edge"); Umberjade is brittle-and-charged (the brief's "brittle
 * and hums with charge"). Duskflint is a keen-dense strike head; Marl is a
 * light-springy everyman haft. Those four alone make a chip pick and a strike
 * cleaver that feel nothing alike.
 */
export const MATERIAL_TRAITS: Record<string, TraitId[]> = {
  // ---- LOAM (hand-tuned) ----
  marl: ['light', 'springy'], ochre: ['hollow', 'tough'], bonechalk: ['brittle', 'light'],
  graveclay: ['dense', 'tough'], loamiron: ['keen', 'springy'], rootglass: ['charged', 'brittle'],
  duskflint: ['keen', 'dense'], umberjade: ['brittle', 'charged'], hollowamber: ['hollow', 'light'],
  wormsteel: ['springy', 'tough'], palegold: ['charged', 'dense'], chthonite: ['dense', 'warm'],
  starmarl: ['charged', 'trueseated'], sablequartz: ['trueseated', 'keen'],
  weepstone: ['charged', 'warm', 'hollow'],
  chitinshard: ['tough', 'springy'], gravemote: ['light', 'hollow'], taproot: ['springy', 'charged'],
  marrowglass: ['brittle', 'keen'], wormsilk: ['springy', 'light'], burrowertooth: ['keen', 'dense'],
  refineslag: ['dense', 'brittle'], salvagedust: ['light', 'hollow'], temperash: ['warm', 'hollow'],
  bindingclay: ['tough', 'hollow'], truesilver: ['keen', 'trueseated'], voidresidue: ['hollow', 'charged'],
  lawfiling: ['trueseated', 'keen'],
  // ---- CURED (Phase 19): patience changes the character, not just the tier ----
  rustochre: ['dense', 'tough'], setsilk: ['tough', 'light'], stillglass: ['charged', 'trueseated'],
  bloomrust: ['tough', 'warm'], sunamber: ['trueseated', 'charged'], frostpane: ['trueseated', 'light'],
  cinderglass: ['dense', 'warm'],
  // ---- FERRITE ----
  ironbloom: ['tough', 'dense'], scalechip: ['keen', 'brittle'], rustmarrow: ['brittle', 'warm'],
  greyflux: ['light', 'charged'], lodestone: ['charged', 'dense'], bluesteel: ['keen', 'tough'],
  rimeiron: ['dense', 'springy'], polarite: ['charged', 'keen'], voltglass: ['charged', 'brittle'],
  magnetile: ['dense', 'hollow'], nullsilver: ['trueseated', 'tough'], stormcore: ['charged', 'warm'],
  polestar: ['charged', 'trueseated'], gnashmetal: ['keen', 'dense', 'brittle'],
  scalebackplate: ['tough', 'dense'], ironsinew: ['springy', 'tough'], voltgland: ['charged', 'warm'],
  magnetheart: ['charged', 'dense'], nullquill: ['keen', 'hollow'], loadstarcore: ['charged', 'trueseated'],
  // ---- VERDANCE ----
  sporewood: ['light', 'springy'], mosscoal: ['warm', 'hollow'], sapstone: ['springy', 'charged'],
  barkiron: ['tough', 'dense'], chlorite: ['light', 'charged'], resinpearl: ['hollow', 'warm'],
  humusgold: ['charged', 'tough'], verdantine: ['springy', 'keen'], bloomsteel: ['tough', 'springy'],
  feralglass: ['brittle', 'keen'], heartwood: ['trueseated', 'springy'], springvein: ['springy', 'charged'],
  wildstar: ['charged', 'trueseated'], thornmind: ['keen', 'charged', 'brittle'],
  throatroot: ['springy', 'tough'], mothspool: ['light', 'springy'], wireweed: ['springy', 'charged'],
  palefiber: ['light', 'hollow'], mawpith: ['hollow', 'warm'], plentyheart: ['warm', 'charged'],
  // ---- GLASSMERE ----
  silicash: ['light', 'hollow'], frostsand: ['brittle', 'light'], dimglass: ['hollow', 'brittle'],
  mirrorgrit: ['keen', 'charged'], lumenshard: ['charged', 'brittle'], prismite: ['charged', 'keen'],
  coldspar: ['brittle', 'springy'], spectralite: ['charged', 'hollow'], sunglass: ['warm', 'charged'],
  beamiron: ['keen', 'dense'], starlens: ['trueseated', 'charged'], wavelength: ['charged', 'springy'],
  spectrum: ['charged', 'keen', 'trueseated'], unlight: ['hollow', 'charged', 'brittle'],
  glasschitin: ['brittle', 'tough'], coldsinew: ['springy', 'brittle'], lenswing: ['light', 'charged'],
  prismheart: ['charged', 'keen'], unblinkingTear: ['trueseated', 'charged'],
  // ---- CINDER ----
  slagrock: ['dense', 'brittle'], ashgrit: ['warm', 'hollow'], charstone: ['warm', 'brittle'],
  emberflake: ['warm', 'light'], pyroclast: ['dense', 'warm'], obsidianheart: ['keen', 'brittle'],
  brimshard: ['brittle', 'charged'], magmajade: ['warm', 'tough'], cindersteel: ['tough', 'warm'],
  pyrite: ['keen', 'charged'], heartflame: ['warm', 'charged'], ventglass: ['brittle', 'hollow'],
  coronaite: ['warm', 'charged', 'trueseated'], howlbasalt: ['dense', 'warm', 'brittle'],
  emberplate: ['tough', 'warm'], charsinew: ['warm', 'springy'], magmaduct: ['warm', 'hollow'],
  pyregland: ['warm', 'charged'], smolderheart: ['warm', 'dense'],
  // ---- HOLLOW ----
  nothingstone: ['hollow', 'light'], quietchalk: ['hollow', 'brittle'], nullchalk: ['light', 'hollow'],
  hushslate: ['tough', 'hollow'], greyecho: ['charged', 'hollow'], echograin: ['charged', 'light'],
  umbralite: ['hollow', 'dense'], voidmarl: ['hollow', 'charged'], umbrite: ['light', 'trueseated'],
  silencesteel: ['tough', 'trueseated'], voidglass: ['hollow', 'brittle'], hushmetal: ['dense', 'trueseated'],
  resonarium: ['charged', 'trueseated'], absentia: ['hollow', 'light'], absencia: ['hollow', 'charged'],
  phantomsilver: ['light', 'trueseated'], lacuna: ['hollow', 'charged'], stillstar: ['trueseated', 'charged'],
  voidstar: ['hollow', 'charged', 'trueseated'], nothing: ['hollow', 'light', 'charged'],
  quietsinew: ['springy', 'hollow'], hollowplate: ['tough', 'hollow'], unheart: ['charged', 'trueseated'],
  // ---- ALEPH ----
  firstiron: ['dense', 'trueseated'], protolith: ['dense', 'tough'], axiomdust: ['charged', 'hollow'],
  axiomite2: ['trueseated', 'charged'], sigilstone: ['trueseated', 'keen'], lawgold: ['charged', 'dense'],
  alephite: ['keen', 'trueseated'], worldseed: ['charged', 'trueseated'],
  paradoxa: ['charged', 'brittle', 'trueseated'], authorsInk: ['trueseated', 'charged'],
};

/** A material's traits, or an empty list (a test forbids that from happening). */
export function traitsOf(materialId: string): TraitId[] {
  return MATERIAL_TRAITS[materialId] ?? [];
}
