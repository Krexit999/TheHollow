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

/** Canonical order for listing all ten (the Compendium glossary, etc.). */
export const TRAIT_IDS: TraitId[] = [
  'keen', 'tough', 'dense', 'light', 'springy',
  'brittle', 'charged', 'warm', 'hollow', 'trueseated',
];

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

/** Plain name for each factor axis — the stat a trait pushes. */
export const AXIS_LABEL: Record<keyof PartFactors, string> = {
  edge: 'chip yield',
  force: 'strike power',
  heft: 'strike power',
  cadence: 'chip speed',
  flex: 'durability',
  grip: 'sockets',
  hold: 'edge & rune hold',
};

export interface FactorLine { axis: keyof PartFactors; label: string; dir: 1 | -1; pct: number; }

/**
 * The DIRECTIONS a trait pushes, for legibility: e.g. keen → [+chip yield,
 * −edge & rune hold]. Reading a trait's factors, above 1 is a raise, below 1 a
 * cut. This is a fact about the stone (rule 3), never a solution — a player uses
 * it to reason about which part to make from what.
 */
export function traitFactorLines(id: TraitId): FactorLine[] {
  const out: FactorLine[] = [];
  for (const [axis, v] of Object.entries(traitDef(id).factors) as [keyof PartFactors, number][]) {
    if (v === 1 || v === undefined) continue;
    out.push({ axis, label: AXIS_LABEL[axis], dir: v > 1 ? 1 : -1, pct: Math.round(Math.abs(v - 1) * 100) });
  }
  // Raises first, then cuts — reads as "good at X, costs Y".
  return out.sort((a, b) => b.dir - a.dir);
}

/**
 * OPPOSED TRAITS — **DERIVED FROM THE FACTOR TABLE ABOVE, NEVER AUTHORED.**
 *
 * §17 states a heuristic the game is supposed to never say out loud: "materials
 * sharing a trait react; OPPOSED traits react violently; nothing in common
 * gives grog." Two of those three words already existed here — sharing is
 * `traitsOf(a) ∩ traitsOf(b)` — and "opposed" did not exist at all.
 *
 * It did not need authoring. Every trait already declares which stats it raises
 * and which it cuts, and the honest reading of "opposed" is right there: two
 * traits are opposed when **one raises a stat the other lowers.** Dense hits
 * harder and Light hits softer; Tough refuses to sharpen and Keen is nothing
 * but edge. A player who has read two trait cards already knows it.
 *
 * Grouped by the PLAYER-FACING label rather than the raw axis, for the same
 * reason `compositionLean` groups: `force` and `heft` are both "strike power",
 * and a rule the player is meant to infer has to be stated in the words the
 * game shows them. FIFTEEN pairs fall out of ten traits.
 *
 * Deriving it means the rule cannot rot. Re-tune a factor and the opposition
 * moves with it; author a trait and it takes its place in the table for free.
 */
function labelledFactors(id: TraitId): Map<string, number> {
  const m = new Map<string, number>();
  for (const [axis, v] of Object.entries(traitDef(id).factors) as [keyof PartFactors, number][]) {
    if (v === undefined) continue;
    const label = AXIS_LABEL[axis];
    m.set(label, (m.get(label) ?? 1) * v);
  }
  return m;
}

/**
 * The stat they disagree on, or null.
 *
 * CANONICAL, not first-found. Two traits can disagree on more than one axis —
 * Keen and Tough pull against each other on chip yield AND on edge hold — and
 * a first-found answer reads a different one depending on which side you ask
 * from. A rule the player is told to infer cannot answer differently in each
 * direction, so the axes are walked in the registry's own order.
 */
const AXIS_ORDER: string[] = [...new Set(Object.values(AXIS_LABEL))];

export function traitsOppose(a: TraitId, b: TraitId): string | null {
  if (a === b) return null;
  const A = labelledFactors(a);
  const B = labelledFactors(b);
  for (const label of AXIS_ORDER) {
    const va = A.get(label);
    const vb = B.get(label);
    if (va === undefined || vb === undefined) continue;
    if ((va > 1 && vb < 1) || (va < 1 && vb > 1)) return label;
  }
  return null;
}

/** Every opposed pair, derived once. Used by the Codex and by tests. */
export function opposedPairs(): Array<{ a: TraitId; b: TraitId; axis: string }> {
  const out: Array<{ a: TraitId; b: TraitId; axis: string }> = [];
  for (let i = 0; i < TRAIT_IDS.length; i++) {
    for (let j = i + 1; j < TRAIT_IDS.length; j++) {
      const axis = traitsOppose(TRAIT_IDS[i]!, TRAIT_IDS[j]!);
      if (axis) out.push({ a: TRAIT_IDS[i]!, b: TRAIT_IDS[j]!, axis });
    }
  }
  return out;
}

/**
 * The net LEAN of a set of traits (a whole tool's combined traits): which stat
 * axes end up raised and which lowered, strongest first. Multiplies each trait's
 * factors per axis so a haft's Dense and a binding's Hollow read as one verdict.
 * Legibility only — never reveals a pairing, which stays discovered.
 */
export function compositionLean(traits: TraitId[]): FactorLine[] {
  // Grouped by the PLAYER-FACING label, not the raw axis: edge/force and heft
  // both read as "strike power", so their multipliers combine into one verdict
  // instead of two lines that could point opposite ways.
  const byLabel = new Map<string, number>();
  const axisOf = new Map<string, keyof PartFactors>();
  for (const t of traits) {
    for (const [axis, v] of Object.entries(traitDef(t).factors) as [keyof PartFactors, number][]) {
      const label = AXIS_LABEL[axis];
      byLabel.set(label, (byLabel.get(label) ?? 1) * v);
      if (!axisOf.has(label)) axisOf.set(label, axis);
    }
  }
  const out: FactorLine[] = [];
  for (const [label, v] of byLabel) {
    if (Math.abs(v - 1) < 0.005) continue;
    out.push({ axis: axisOf.get(label)!, label, dir: v > 1 ? 1 : -1, pct: Math.round(Math.abs(v - 1) * 100) });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

/** A one-line "raises A · lowers B" summary of a trait's directions. */
export function traitLeanText(id: TraitId): string {
  const lines = traitFactorLines(id);
  const up = lines.filter((l) => l.dir > 0).map((l) => l.label);
  const down = lines.filter((l) => l.dir < 0).map((l) => l.label);
  const parts: string[] = [];
  if (up.length) parts.push(`raises ${[...new Set(up)].join(' & ')}`);
  if (down.length) parts.push(`lowers ${[...new Set(down)].join(' & ')}`);
  return parts.join(' · ');
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
  // THE TWO FUEL STONES (A.110). Each pair is the fuel's own note, read as
  // properties: Ash catches at once and gutters (`light` cadence, `brittle`
  // — one bad angle from failing); Packed Loam is slow to take and slower to
  // let go (`dense`, and `warm`, whose reach is literally `kilnHeatRamp`).
  // They SHARE `warm`, and that is the point: `warm` is the only trait whose
  // outward reach is `kilnHeatRamp`, so the two stones the kiln burns are the
  // two that carry it. They differ on the other axis, `light` against `dense`,
  // which is exactly the fast/slow trade their burn profiles encode.
  //
  // First written `ash: ['light','brittle']`, which is a BIT-FOR-BIT CLONE of
  // bonechalk — same shell, same rarity, same pair, therefore the same part on
  // every stat. The still suite's clone check caught it; that guard exists and
  // it earned its keep here.
  ash: ['light', 'warm'], loam: ['dense', 'warm'],
  weepstone: ['charged', 'warm', 'hollow'],
  /**
   * THE TRAP (§16.3): ONE RUINOUS TRAIT, not one trait.
   *
   * `dense` is exactly what a Core wants — it is why the stone looks like the
   * answer — and `brittle` is the one trait a Core must not have. So the trap
   * is not "this material is bad in a way you cannot see"; it is "this material
   * is genuinely the best seat-stone in the shell AND it will crack", and both
   * halves are true and both are printed. The Still takes the brittle out and
   * leaves the dense, which is the whole tutorial.
   *
   * (First written with `brittle` alone, on a reading of §16.3's "one trait
   * that ruins you" as a trait COUNT. The traits suite caught it against the
   * 2-3 invariant, and the invariant is right: a single-trait material has
   * nothing to make it tempting, and a trap nobody wants to fall into is not a
   * trap.)
   */
  millstone: ['dense', 'brittle'],
  // ---- DEEP ENTRY (Proof #1): what compaction does to a material's character.
  // Graveclay is dense-and-tough; driven down past 14 it also becomes
  // TRUESEATED — the same stone, holding harder. Deepgrave is what the last two
  // compaction points leave: trueseated and dense, and brittle with it, because
  // rock that has been worked to the edge of dying does not bend.
  graveclaydeep: ['dense', 'tough', 'trueseated'],
  deepgrave: ['trueseated', 'dense', 'brittle'],
  chitinshard: ['tough', 'springy'], gravemote: ['light', 'hollow'], taproot: ['springy', 'charged'],
  // BURROWERTOOTH WAS `keen + dense`, WHICH IS DUSKFLINT. While it was combat-
  // only that was invisible — it could not drop, so no part was ever made of
  // it. The moment A.84 gave it a place, `forge-parts.test.ts` caught it: same
  // traits AND same rarity means a bit-for-bit identical head, i.e. a second
  // row in the registry that changes no decision. A tooth that bores rock for a
  // living is TOUGH before it is dense.
  marrowglass: ['brittle', 'keen'], wormsilk: ['springy', 'light'], burrowertooth: ['keen', 'tough'],
  refineslag: ['dense', 'brittle'], salvagedust: ['light', 'hollow'], temperash: ['warm', 'hollow'],
  bindingclay: ['tough', 'hollow'], truesilver: ['keen', 'trueseated'], voidresidue: ['hollow', 'charged'],
  lawfiling: ['trueseated', 'keen'],
  // ---- CURED (Phase 19): patience changes the character, not just the tier ----
  rustochre: ['dense', 'tough'], setsilk: ['tough', 'light'], stillglass: ['charged', 'trueseated'],
  bloomrust: ['tough', 'warm'], sunamber: ['trueseated', 'charged'], frostpane: ['trueseated', 'light'],
  cinderglass: ['dense', 'warm'],
  // ---- EXPORTS (Part B spine) — made by one shell, wanted by the next ----
  kilnflux: ['warm', 'hollow'], lodeframe: ['tough', 'dense', 'trueseated'],
  setresin: ['springy', 'trueseated'], fibercloth: ['light', 'springy'],
  groundlens: ['charged', 'brittle'], glasseal: ['tough', 'springy'],
  emberglass: ['warm', 'dense', 'trueseated'],
  // ---- ALLOY CASTINGS (Part B pull-through) — one trait set per family ----
  steelcasting: ['dense', 'tough'], brazecasting: ['warm', 'light'],
  platecasting: ['tough', 'springy'], polecasting: ['charged', 'dense'],
  cryocasting: ['keen', 'hollow'],
  // ---- FERRITE ----
  ironbloom: ['tough', 'dense'], scalechip: ['keen', 'brittle'], rustmarrow: ['brittle', 'warm'],
  greyflux: ['light', 'charged'], lodestone: ['charged', 'dense'], bluesteel: ['keen', 'tough'],
  rimeiron: ['dense', 'springy'], polarite: ['charged', 'keen'], voltglass: ['charged', 'brittle'],
  magnetile: ['dense', 'hollow'], nullsilver: ['trueseated', 'tough'], stormcore: ['charged', 'warm'],
  polestar: ['charged', 'trueseated'], gnashmetal: ['keen', 'dense', 'brittle'],
  /**
   * SCALEBACK PLATE WAS A BIT-FOR-BIT CLONE OF IRONBLOOM — same shell, same
   * `common`, same `tough`+`dense`, therefore the same head down to three
   * decimal places. Invisible while it could never drop; found the moment A.87
   * made it minable, by the same check that found burrowertooth was duskflint
   * at A.84. It is SHED plate, layered and overlapping rather than solid, so
   * `springy` is both the fix and the honest reading.
   */
  scalebackplate: ['tough', 'springy'], ironsinew: ['springy', 'tough'], voltgland: ['charged', 'warm'],
  magnetheart: ['charged', 'dense'], nullquill: ['keen', 'hollow'], loadstarcore: ['charged', 'trueseated'],
  /**
   * FERRITE DEEP-ENTRY (§16.2). The spine gives lodestone-cored `charged` +
   * `trueseated`, which is bit-for-bit `loadstarcore` at the same rarity — the
   * clone A.84 found between burrowertooth and duskflint, waiting to happen
   * again. A core is DENSE, so the third trait is both the fix and the obvious
   * reading. Poleiron takes `keen` for the same separation from `polestar`.
   */
  lodestonecored: ['charged', 'trueseated', 'dense'],
  poleiron: ['charged', 'trueseated', 'keen'],
  // ---- VERDANCE ----
  sporewood: ['light', 'springy'], mosscoal: ['warm', 'hollow'], sapstone: ['springy', 'charged'],
  barkiron: ['tough', 'dense'], chlorite: ['light', 'charged'], resinpearl: ['hollow', 'warm'],
  humusgold: ['charged', 'tough'], verdantine: ['springy', 'keen'], bloomsteel: ['tough', 'springy'],
  feralglass: ['brittle', 'keen'], heartwood: ['trueseated', 'springy'], springvein: ['springy', 'charged'],
  wildstar: ['charged', 'trueseated'], thornmind: ['keen', 'charged', 'brittle'],
  /** VERDANCE DEEP-ENTRY, terminal. Three traits, so it separates from
   *  `wildstar` (starred, charged+trueseated) and `heartwood` (trueseated+
   *  springy) rather than cloning either — the check that found mothspool. */
  thornwall: ['trueseated', 'springy', 'keen'],
  /**
   * MOTHSPOOL WAS SPOREWOOD, bit for bit — same shell, same `common`, same
   * `light`+`springy`, therefore the same head to three decimal places. The
   * third of these found the same way: invisible while the stone could never
   * drop, obvious the moment the shell became reachable. (burrowertooth was
   * duskflint at A.84; scalebackplate was ironbloom at A.87.)
   *
   * It is silk WOUND TIGHT ON A SPOOL, which is the opposite of springy — a
   * wound spool holds its shape and does not give it back. `light` + `tough`.
   */
  throatroot: ['springy', 'tough'], mothspool: ['light', 'tough'], wireweed: ['springy', 'charged'],
  palefiber: ['light', 'hollow'], mawpith: ['hollow', 'warm'], plentyheart: ['warm', 'charged'],
  // ---- GLASSMERE ----
  silicash: ['light', 'hollow'], frostsand: ['brittle', 'light'], dimglass: ['hollow', 'brittle'],
  mirrorgrit: ['keen', 'charged'], lumenshard: ['charged', 'brittle'], prismite: ['charged', 'keen'],
  coldspar: ['brittle', 'springy'], spectralite: ['charged', 'hollow'], sunglass: ['warm', 'charged'],
  beamiron: ['keen', 'dense'], starlens: ['trueseated', 'charged'], wavelength: ['charged', 'springy'],
  spectrum: ['charged', 'keen', 'trueseated'], unlight: ['hollow', 'charged', 'brittle'],
  glasschitin: ['brittle', 'tough'], coldsinew: ['springy', 'brittle'], lenswing: ['light', 'charged'],
  prismheart: ['charged', 'keen'],
  /**
   * THE UNBLINKING'S TEAR WAS STARLENS, bit for bit — same shell, same
   * `flawless`, same trueseated+charged, therefore the same head to three
   * decimals. Fourth for four, and the fourth found the day its shell became
   * reachable. (burrowertooth was duskflint A.84; scalebackplate was ironbloom
   * A.87; mothspool was sporewood A.88.)
   *
   * A tear is a DROP held together by its own surface — it deforms and comes
   * back, which a ground lens does not. `springy`.
   */
  unblinkingTear: ['trueseated', 'springy'],
  /** GLASSMERE DEEP-ENTRY (§16.2 gives truesilica `trueseated`/`light`). The
   *  terminal takes three so it separates from `starlens` and `spectrum`. */
  truesilica: ['trueseated', 'light'],
  truelight: ['trueseated', 'charged', 'light'],
  // ---- CINDER ----
  slagrock: ['dense', 'brittle'], ashgrit: ['warm', 'hollow'], charstone: ['warm', 'brittle'],
  emberflake: ['warm', 'light'], pyroclast: ['dense', 'warm'], obsidianheart: ['keen', 'brittle'],
  brimshard: ['brittle', 'charged'], magmajade: ['warm', 'tough'],
  /**
   * CINDERSTEEL WAS MAGMAJADE, bit for bit — same shell, same `pure`, same
   * {warm, tough}. FIFTH for five, and the first that was PRE-EXISTING rather
   * than created by making a shell reachable: two ordinary ores, neither an
   * orphan, cloned since Phase 9 and invisible because nothing compared them.
   * Steel is the one thing down here that takes an EDGE.
   */
  cindersteel: ['tough', 'keen'],
  pyrite: ['keen', 'charged'], heartflame: ['warm', 'charged'], ventglass: ['brittle', 'hollow'],
  coronaite: ['warm', 'charged', 'trueseated'], howlbasalt: ['dense', 'warm', 'brittle'],
  /** CINDER DEEP-ENTRY, terminal. Three traits so it separates from coronaite
   *  and howlbasalt rather than cloning either. */
  slagglass: ['warm', 'trueseated', 'brittle'],
  emberplate: ['tough', 'warm'], charsinew: ['warm', 'springy'], magmaduct: ['warm', 'hollow'],
  pyregland: ['warm', 'charged'], smolderheart: ['warm', 'dense'],
  // ---- HOLLOW ----
  nothingstone: ['hollow', 'light'], quietchalk: ['hollow', 'brittle'],
  /**
   * CLONE #6 (A.90). `nullchalk` was `['light','hollow']` — Nothingstone bit
   * for bit, and invisible for eleven phases because Hollow had no geography
   * and a stone that cannot drop cannot be compared to one that can. It keeps
   * `light`, and chalk is what makes it `brittle`.
   */
  nullchalk: ['light', 'brittle'],
  hushslate: ['tough', 'hollow'], greyecho: ['charged', 'hollow'], echograin: ['charged', 'light'],
  umbralite: ['hollow', 'dense'], voidmarl: ['hollow', 'charged'], umbrite: ['light', 'trueseated'],
  silencesteel: ['tough', 'trueseated'], voidglass: ['hollow', 'brittle'], hushmetal: ['dense', 'trueseated'],
  resonarium: ['charged', 'trueseated'], absentia: ['hollow', 'light'], absencia: ['hollow', 'charged'],
  phantomsilver: ['light', 'trueseated'],
  /**
   * CLONE #7 (A.90). `lacuna` was `['hollow','charged']` — Absencia bit for
   * bit, the second of two Hollow clones and the seventh this project has
   * found. A lacuna is a gap CUT to an exact size, which is `keen` doing the
   * work `charged` was not.
   *
   * NOT `trueseated`, which was the first choice and was wrong for a reason
   * worth keeping: SIX OF THE SEVEN parts in `forge-parts.test.ts`'s
   * deliberately SCATTERED set carry `trueseated`, so putting it here made the
   * incoherent tool coherent and dropped that test's margin from 1.44 to 1.18.
   * A trait fix is a balance change, and this one had a live gate on it.
   */
  lacuna: ['hollow', 'keen'],
  stillstar: ['trueseated', 'charged'],
  voidstar: ['hollow', 'charged', 'trueseated'], nothing: ['hollow', 'light', 'charged'],
  quietsinew: ['springy', 'hollow'], hollowplate: ['tough', 'hollow'], unheart: ['charged', 'trueseated'],
  /** HOLLOW DEEP-ENTRY, terminal. Three traits so it separates from voidstar
   *  and `nothing` rather than cloning either — Cinder's slagglass shape. */
  nothingstar: ['hollow', 'light', 'trueseated'],
  // ---- ALEPH ----
  firstiron: ['dense', 'trueseated'], protolith: ['dense', 'tough'], axiomdust: ['charged', 'hollow'],
  axiomite2: ['trueseated', 'charged'], sigilstone: ['trueseated', 'keen'], lawgold: ['charged', 'dense'],
  alephite: ['keen', 'trueseated'], worldseed: ['charged', 'trueseated'],
  paradoxa: ['charged', 'brittle', 'trueseated'],
  /**
   * CLONE #8 (A.90), and this pass MADE it. `authorsInk` was flawless and
   * `['trueseated','charged']`; coming down to `pure` so its rescue could
   * actually fire (see `materials.ts`) put it beside Ruleshard, which is pure
   * and carries the same pair. A BAND CHANGE IS A CLONE RISK, not only a
   * drop-rate one — the clone check found it on the same run that made it.
   */
  authorsInk: ['keen', 'charged'],
  /** ALEPH DEEP-ENTRY, terminal. */
  record: ['trueseated', 'dense', 'keen'],
};

/** A material's traits, or an empty list (a test forbids that from happening). */
export function traitsOf(materialId: string): TraitId[] {
  return MATERIAL_TRAITS[materialId] ?? [];
}

/**
 * HOW MANY TRAITS THIS STONE WAS BORN WITH (§14.1, §11.4).
 *
 * A worked form's id is its source's id plus a suffix — `_no<trait>` from the
 * Still, `_with<trait>` from the Infuser — so the stone it descends from is
 * readable off the id, however many times it has been round. That naming
 * convention belongs to two systems and the ANSWER belongs here, because the
 * question ("what is natural for this material") is the trait registry's and
 * `toolMods` has to ask it without importing a machine.
 *
 * The suffixes are checked as a pair rather than by string surgery, so a
 * material whose real id happens to contain the letters is unaffected: the id
 * only counts as derived when what is left of it is a material this table
 * knows.
 */
export function naturalTraits(materialId: string): number {
  let id = materialId;
  for (let hops = 0; hops < 8; hops++) {
    const cuts = [id.lastIndexOf('_with'), id.lastIndexOf('_no')].filter((i) => i > 0);
    if (cuts.length === 0) break;
    const at = Math.max(...cuts);
    const base = id.slice(0, at);
    if (!MATERIAL_TRAITS[base]) break;
    id = base;
  }
  return (MATERIAL_TRAITS[id] ?? MATERIAL_TRAITS[materialId] ?? []).length;
}

/** How much more than it was born with this stone is carrying. §11.4's shake. */
export function overNatural(materialId: string): number {
  return Math.max(0, traitsOf(materialId).length - naturalTraits(materialId));
}
