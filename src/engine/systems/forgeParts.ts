/**
 * THE NEW FORGE — STEP 1: material → part → tool, procedurally.
 *
 * ONE FORMULA, 158 MATERIALS, 7 PART TYPES, 1,106 DISTINCT PARTS. Nothing here
 * is hand-authored per material and nothing ever should be: every number a part
 * carries is read off fields the material already has — its shell, its rarity,
 * its rolled purity, its traits. Add a material to the registry tomorrow and it
 * has seven working parts the same afternoon.
 *
 *     magnitude  = SHELL_STEP^(ordinal-1) × rarity × purity × grade
 *     shape      = Π over traits (1 + delta[stat] × intensity), geo-normalised
 *     stat       = STAT_BASE × weight(part, stat) × magnitude^exp(stat) × shape
 *     tool       = Σ parts, × COHERENCE
 *
 * MAGNITUDE is how big. SHAPE is what shape. They are deliberately separate:
 * depth makes a part BIGGER, traits make it DIFFERENT, and neither can do the
 * other's job. That is what stops a deep material from also being a boring one,
 * and what stops a trait from being a stealth power creep.
 *
 * COHERENCE is what stops the answer from being "slap the highest number in
 * every slot". See `coherenceOf`.
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
  PART_DEFS, PART_TYPES, SHELL_TRAIT, STAT_BASE, STAT_MAGNITUDE_EXP, TOOL_STATS,
  TRAIT_INTENSITY, FORGE_TRAITS, GRADE_BONUS, SHELL_STEP, RARITY_STEP,
  PURITY_FLOOR, PURITY_PER_POINT, W_PRIMARY, W_SECONDARY, W_SPILL,
  MISMATCH_K, VARIETY_WEIGHT, RELIEF_PIVOT, RELIEF_SLOPE, MAX_RELIEF,
  LAYER_MAX, layerWeights, HEFT, BALANCE_DEADZONE, BALANCE_ORE,
  LIVING_SHELL, GROWTH_MAX, growthForStage, BOON_REACH, BOON_MEND, BOON_STEADY,
  BOON_WEAR, CRAFT_TIERS, EXCELLENT_STEADY, MASTERWORK_STEADY,
  BOON_GRASP, BOON_QUICKEN, BOON_THICKEN, BOON_SEEK, BOON_STILL,
  GROWTH_BOONS, BOON_BY_ID, BOONS_OFFERED, type GrowthBoonDef,
  WINDUP_MAX, BALANCE_REACH, BALANCE_SPLASH, BALANCE_WEAR, BALANCE_CHARGE,
  shapeDef,
  type BalanceLabel, type CraftTier, type ForgeTraitId, type GrowthBoonId,
  type MasterworkId, type PartType, type PartShape, type ReachPattern, type ToolStat,
} from '../content/forgeParts';
import { RARITIES, bandOf, materialDef, type MaterialDef, BAND_RANGES, BANDS } from '../materials';
import { traitsOf } from '../traits';
import { shellOrdinal } from '../content/drillAlloys';
import { LEGENDARY_BY_ID } from '../content/legendaryParts';

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
  /**
   * WHICH MOULD IT WAS POURED INTO. Absent = the part type's plain shape, which
   * is what every part cast before shapes existed is holding — and the plain
   * shapes are all no-ops, so an old tool behaves exactly as it did.
   *
   * The shape is orthogonal to the material: it changes WHERE a swing lands and
   * what it costs, never how big the stats are. See `content/forgeParts.ts`.
   */
  shape?: PartShape;
  /**
   * DAMASCUS. Extra layers UNDER the outer one, in order: middle then core.
   *
   * `materialId` and `purity` above remain the OUTER layer, which is what makes
   * this additive rather than a rewrite — every reader of `p.materialId` in the
   * engine keeps working and sees the surface of the part, which is the honest
   * answer to "what is this made of" for anything that only wants one.
   *
   * Absent or empty = a plain single-material part, and the blend of one layer
   * is the identity, so nothing that existed before this behaves differently.
   */
  layers?: Array<{ materialId: string; purity: number }>;
  /**
   * LIVING STOCK KEEPS GROWING. `grown` is the boons this part has taken, in
   * order; `growth` is the cells it has worked through since the last one.
   *
   * Both absent on a part that is not alive, and on every part cast before this
   * existed — and `growthFold` of an empty list is the identity, so nothing that
   * already existed behaves differently.
   */
  grown?: GrowthBoonId[];
  growth?: number;
  /**
   * HOW WELL THIS PARTICULAR POUR CAME OUT. Rolled once, at the cast, and never
   * again. Absent = `good`, which is the tier that does nothing — so an old part
   * reads as the unremarkable middle rather than as a hole.
   */
  craft?: CraftTier;
  /** Which Masterwork it turned out to be. Only ever set with `craft:
   *  'masterwork'`. */
  work?: MasterworkId;
  /**
   * A LEGEND THIS PART IS AN INSTANCE OF (`content/legendaryParts.ts`).
   *
   * Absent on every part ever cast, which is why this needed no migration: the
   * boost below is `1` for an absent legend, i.e. the identity, so nothing that
   * already existed derives differently by a single decimal.
   *
   * It is a NAME, not a stat block. Everything a legend does is expressed in
   * fields this interface already had — `purity` at the ceiling, `craft`
   * 'masterwork', a chosen `work` — plus exactly one multiplier, so a legendary
   * part is derived by the same code path as a lump of Marl.
   */
  legend?: string;
}

/**
 * THE ONE NEW TERM. Looked up rather than stored, so re-rating a legend re-rates
 * every copy a player holds instead of leaving stale numbers in a save — the
 * same "derive, never store" rule the rest of `Part` follows.
 */
export function legendBoost(part: Part): number {
  if (!part.legend) return 1;
  return LEGENDARY_BY_ID.get(part.legend)?.boost ?? 1;
}

/** Is this part alive — i.e. is any of its stock Verdance? */
export function isLiving(part: Part): boolean {
  return partMaterials(part).some((id) => materialDef(id).shellId === LIVING_SHELL);
}

/** Cells this part still owes before it matures again. Null when it is grown,
 *  or was never alive. */
export function growthNeed(part: Part): number | null {
  if (!isLiving(part)) return null;
  const stage = (part.grown ?? []).length;
  if (stage >= GROWTH_MAX) return null;
  return growthForStage(stage + 1);
}

/**
 * THE CHEAPEST THING THIS PART COULD BECOME RIGHT NOW.
 *
 * `ready` has to mean "some option is affordable", not "the base figure is
 * met" — otherwise `pace` would be a lie the panel tells: a part would report
 * itself ready and then refuse the Thickening it was offering. So readiness is
 * the MINIMUM over the offer, and each boon still costs its own `boonCost`.
 */
export function cheapestBoonCost(part: Part): number | null {
  const base = growthNeed(part);
  if (base === null) return null;
  const offer = boonsFor(part);
  if (offer.length === 0) return base;
  return Math.min(...offer.map((b) => Math.round(base * b.pace)));
}

/** Everything the growth readout needs, so the panel computes nothing. */
export function growthProgress(part: Part): {
  living: boolean; stage: number; into: number; need: number; frac: number; ready: boolean; grown: boolean;
} {
  const living = isLiving(part);
  const stage = (part.grown ?? []).length;
  // READINESS IS THE CHEAPEST OFFER, not the base figure — see `cheapestBoonCost`.
  const need = cheapestBoonCost(part);
  if (!living || need === null) {
    return { living, stage, into: 0, need: 0, frac: living ? 1 : 0, ready: false, grown: living };
  }
  const into = part.growth ?? 0;
  return {
    living, stage, into, need,
    frac: Math.max(0, Math.min(1, into / need)),
    ready: into >= need,
    grown: false,
  };
}

// ---------------------------------------------------------------------------
// THE GROWTH AND CRAFT FOLDS
// ---------------------------------------------------------------------------

export interface GrowthFold {
  cells: number;
  repairPerSec: number;
  stabilize: number;
  wear: number;
  /** Resilience multiplier — `thickening`'s whole contribution. */
  resilience: number;
  /** Cadence multiplier — `quickening`'s. */
  cadence: number;
  /** Ore-rate multiplier — `seeking`'s. */
  oreRate: number;
  /** Control multiplier — `grasp`'s. */
  control: number;
  /** Parts with a boon ready to take. The panel surfaces the choice. */
  ready: PartType[];
}

export const NO_GROWTH: GrowthFold = {
  cells: 0, repairPerSec: 0, stabilize: 0, wear: 1,
  resilience: 1, cadence: 1, oreRate: 1, control: 1, ready: [],
};

// ---------------------------------------------------------------------------
// WHAT A PARTICULAR LIVING PART CAN BECOME
// ---------------------------------------------------------------------------

/**
 * THE OFFER, and why it is no longer the same three every time.
 *
 * The report: "every part offers identical RUNNER/KNITTING/SUPPLE with no
 * context". That was literally true — the pool WAS three, nothing filtered it,
 * and no number was printed anywhere. Three separate faults wearing one coat.
 *
 * The offer is now built from what the part IS and what it is MADE OF:
 *
 *   1. Boons that name `parts` are only offered to those parts. A Handle does
 *      not sprout reach; a Head does not learn grip.
 *   2. Boons whose `wants` trait the STONE actually pulls are offered FIRST, so
 *      a dense living core reliably sees Thickening and a hollow one sees
 *      Runner. What it is decides what it can become.
 *   3. The rest fills up from the eligible pool, in a stable order, so the offer
 *      is deterministic — the same part always offers the same three, and a
 *      player can plan a build around it instead of re-rolling.
 *
 * DETERMINISTIC ON PURPOSE. A random offer would make the "informed choice" the
 * report asks for impossible: you could not decide to grow a Thickening core,
 * only hope for one.
 */
export function boonsFor(part: Part): GrowthBoonDef[] {
  const traits = new Set(blendOf(part).traits);
  const eligible = GROWTH_BOONS.filter((b) => !b.parts || b.parts.includes(part.type));
  const called = eligible.filter((b) => b.wants && traits.has(b.wants));
  const rest = eligible.filter((b) => !called.includes(b));
  return [...called, ...rest].slice(0, BOONS_OFFERED);
}

/**
 * WHAT THIS BOON WOULD COST THIS PART, in cells. `pace` is the per-boon rate —
 * Grasping arrives in 80% of the work, Thickening takes half again as long.
 */
export function boonCost(part: Part, boon: GrowthBoonId): number {
  const base = growthNeed(part);
  if (base === null) return 0;
  return Math.round(base * (BOON_BY_ID.get(boon)?.pace ?? 1));
}

/**
 * WHAT ONE TAKEN BOON IS ACTUALLY WORTH, as numbers the panel can print.
 *
 * Exported rather than buried in `growthFold` because the report's third
 * complaint was that the choice showed flavour and no effect. A player cannot
 * weigh "it puts out a little further" against "it lays down another ring"; they
 * can weigh `+1 cell` against `+12% resilience`.
 */
export function boonNumbers(boon: GrowthBoonId): string {
  switch (boon) {
    case 'reach': return `+${BOON_REACH} cell to the swing`;
    case 'mending': return `+${(BOON_MEND * 100).toFixed(1)}% of the pool mended per second`;
    case 'supple': return `+${BOON_STEADY} steadiness · ${Math.round((1 - BOON_WEAR) * 100)}% less wear per swing`;
    case 'grasp': return `+${Math.round((BOON_GRASP - 1) * 100)}% control`;
    case 'quickening': return `+${Math.round((BOON_QUICKEN - 1) * 100)}% cadence`;
    case 'thickening': return `+${Math.round((BOON_THICKEN - 1) * 100)}% resilience`;
    case 'seeking': return `+${Math.round((BOON_SEEK - 1) * 100)}% ore speed`;
    case 'stillness': return `+${BOON_STILL} steadiness`;
    default: return '';
  }
}

/**
 * WHAT THE LIVING PARTS HAVE BECOME. Additive across parts and boons, and the
 * fold of a tool with no living stock is the identity.
 */
export function growthFold(parts: Part[]): GrowthFold {
  const out: GrowthFold = { ...NO_GROWTH, ready: [] };
  let touched = false;
  for (const p of parts) {
    const prog = growthProgress(p);
    if (prog.ready) out.ready.push(p.type);
    for (const id of p.grown ?? []) {
      touched = true;
      if (id === 'reach') out.cells += BOON_REACH;
      else if (id === 'mending') out.repairPerSec += BOON_MEND;
      else if (id === 'supple') { out.stabilize += BOON_STEADY; out.wear *= BOON_WEAR; }
      // THE FIVE ADDED AT A.69, each on a term the tool already had. None of
      // them is yield — the vocabulary still has no word for it.
      else if (id === 'grasp') out.control *= BOON_GRASP;
      else if (id === 'quickening') out.cadence *= BOON_QUICKEN;
      else if (id === 'thickening') out.resilience *= BOON_THICKEN;
      else if (id === 'seeking') out.oreRate *= BOON_SEEK;
      else if (id === 'stillness') out.stabilize += BOON_STILL;
    }
  }
  return touched || out.ready.length > 0 ? out : { ...NO_GROWTH, ready: out.ready };
}

export interface CraftFold {
  /** Extra modifier slots from Deep-Cut parts. */
  modSlots: number;
  /** Instability taken off by Excellent and Trueborn parts. */
  stabilize: number;
  /** Part types that never wear — Flawless. */
  flawless: PartType[];
  /** Part types whose repair is discounted — Thrifty. */
  thrifty: PartType[];
  /** For the readout: the best tier on the tool, and how many Masterworks. */
  best: CraftTier;
  masterworks: number;
}

export const NO_CRAFT: CraftFold = {
  modSlots: 0, stabilize: 0, flawless: [], thrifty: [], best: 'good', masterworks: 0,
};

/**
 * WHAT THE POURS ADDED UP TO. Note there is NO stat term in here at all — a
 * Masterwork Head has the numbers a Poor one has, and the whole fold is slots,
 * steadiness, wear exemptions and repair prices.
 */
export function craftFold(parts: Part[]): CraftFold {
  const out: CraftFold = { ...NO_CRAFT, flawless: [], thrifty: [] };
  // NO FLOOR AT 'GOOD'. Flooring here made an all-Poor tool report as Good,
  // because Math.max(indexOf('good'), indexOf('poor')) is 'good' — the absent
  // case is already handled by `p.craft ?? 'good'` below, and doing it twice
  // meant an explicitly Poor pour could never be shown as one.
  let bestIdx = -1;
  for (const p of parts) {
    const tier = p.craft ?? 'good';
    bestIdx = Math.max(bestIdx, CRAFT_TIERS.indexOf(tier));
    if (tier === 'excellent') out.stabilize += EXCELLENT_STEADY;
    if (tier !== 'masterwork') continue;
    out.masterworks += 1;
    switch (p.work) {
      case 'roomy': out.modSlots += 1; break;
      case 'trueborn': out.stabilize += MASTERWORK_STEADY; break;
      case 'flawless': out.flawless.push(p.type); break;
      case 'thrifty': out.thrifty.push(p.type); break;
      default: break;
    }
  }
  out.best = bestIdx < 0 ? 'good' : CRAFT_TIERS[bestIdx]!;
  return out;
}

// ---------------------------------------------------------------------------
// THE BLEND — what a layered part actually is
// ---------------------------------------------------------------------------

/** A trait and how hard it pulls, 0..1. A single-material part pulls at 1. */
export interface TraitPull { trait: ForgeTraitId; weight: number }

export interface PartBlend {
  layers: Array<{ material: MaterialDef; purity: number; weight: number }>;
  /** Every trait in the part, with the total layer weight carrying it. */
  pull: TraitPull[];
  /** The union, for anything that wants a plain list (classes, abilities). */
  traits: ForgeTraitId[];
  magnitude: number;
  intensity: number;
  /** Weighted mean shell ordinal — what coherence reads for this part. */
  shell: number;
  /** How much the layers disagree with each other about depth. A part can be
   *  internally incoherent, and coherence should see it. */
  spread: number;
  layered: boolean;
}

/**
 * FOLD A PART'S LAYERS INTO ONE (traits, magnitude, intensity) TRIPLE.
 *
 * That triple is the entire input to the derivation, which is why layering
 * needed no new pillar-2 argument: a blend arrives at the same place a single
 * material arrives, and everything downstream — the stat weights, the clamps,
 * the reach and splash caps — is untouched.
 *
 * A TRAIT PULLS AT ITS LAYER'S WEIGHT. `keen` in the core of a three-layer part
 * pulls a fifth as hard as `keen` in a solid one, so putting a trait where it
 * is cheap has a real cost. With one layer every weight is 1 and this is
 * exactly the old behaviour.
 */
export function blendOf(part: Part): PartBlend {
  const stack = [
    { materialId: part.materialId, purity: part.purity },
    ...(part.layers ?? []),
  ].slice(0, LAYER_MAX);
  const w = layerWeights(stack.length);

  const layers = stack.map((l, i) => ({
    material: materialDef(l.materialId),
    purity: clampPurity(l.purity),
    weight: w[i]!,
  }));

  const pullMap = new Map<ForgeTraitId, number>();
  let magnitude = 0;
  let intensity = 0;
  let shell = 0;
  for (const l of layers) {
    magnitude += l.weight * magnitudeOf(l.material, l.purity);
    intensity += l.weight * intensityOf(l.purity);
    shell += l.weight * shellOrdinal(l.material.shellId);
    for (const t of partTraits(l.material)) {
      pullMap.set(t, Math.min(1, (pullMap.get(t) ?? 0) + l.weight));
    }
  }
  let spread = 0;
  for (const l of layers) {
    spread += l.weight * Math.abs(shellOrdinal(l.material.shellId) - shell);
  }

  // THE LEGEND LIFTS THE STONE; IT DOES NOT REPLACE IT. Applied to magnitude and
  // nothing else, so traits, shell, spread and intensity are still the stone's —
  // which is what keeps a legendary part answerable to coherence, to ruling 1,
  // and to every trait reader in the forge exactly as an ordinary part is.
  magnitude *= legendBoost(part);

  return {
    layers,
    pull: [...pullMap].map(([trait, weight]) => ({ trait, weight })),
    traits: [...pullMap.keys()],
    magnitude,
    intensity,
    shell,
    spread,
    layered: layers.length > 1,
  };
}

/** Every material in a part, outer first. For the hold, the readouts and the
 *  trait pools that want to know what actually went in. */
export function partMaterials(part: Part): string[] {
  return [part.materialId, ...(part.layers ?? []).map((l) => l.materialId)]
    .slice(0, LAYER_MAX);
}

/**
 * WHAT THE SEVEN SHAPES ADD UP TO. Pure — reads parts, writes nothing.
 *
 * Multiplicative axes multiply, additive ones add, and the HEAD alone decides
 * the pattern. A tool with every part in its plain shape folds to the identity,
 * which is what makes this safe to apply unconditionally: a save from before
 * this existed measures byte-identical.
 */
export interface ShapeFold {
  cells: number;
  splash: number;
  oreRate: number;
  dropWeight: number;
  wear: number;
  charge: number;
  stabilize: number;
  pattern: ReachPattern;
  /** The head's shape, for the readout. */
  head: PartShape;
}

export const NO_SHAPES: ShapeFold = {
  cells: 1, splash: 1, oreRate: 1, dropWeight: 1, wear: 1, charge: 0,
  stabilize: 0, pattern: 'spread', head: 'point',
};

// ---------------------------------------------------------------------------
// BALANCE — heavy against light
// ---------------------------------------------------------------------------

export interface Balance {
  /** −1 (as light as it gets) .. +1 (as heavy), AFTER the deadzone. */
  value: number;
  /** Before the deadzone, for the readout's honesty. */
  raw: number;
  label: BalanceLabel;
  /** Seconds between swings. Zero at neutral and on the whole light side. */
  windup: number;
  /** Multipliers on what one swing does. */
  cells: number;
  splash: number;
  /** Multiplier on wear per swing. Below one on the light side. */
  wear: number;
  /** Additive ability meter per swing. Light only. */
  charge: number;
  /** Multiplier on how fast a pocket is worked. Heavy cracks ore. */
  oreRate: number;
  /** Which cell this build is FOR, in one word. Readout only. */
  job: 'ore' | 'rock' | 'either';
  /** What is making it heavy or light, biggest first. */
  from: Array<{ trait: ForgeTraitId; n: number }>;
}

export const EVEN_BALANCE: Balance = {
  value: 0, raw: 0, label: 'even', windup: 0,
  cells: 1, splash: 1, wear: 1, charge: 0, from: [],
  oreRate: 1,
  job: 'either',
};

/** Divides the summed heft into the −1..+1 range. Measured, not chosen — see
 *  `scripts/balance-preview.ts`, which prints the real spread across materials. */
export const HEFT_SCALE = 1.7;

/**
 * WHAT THE STONE WEIGHS, summed over every part and every layer.
 *
 * A layer contributes at its own weight, exactly as its traits do, so putting
 * the dense stone in the core makes a lighter tool than putting it on the
 * outside — which is the interaction between the two axes this phase adds, and
 * it falls out rather than being authored.
 */
export function balanceOf(parts: Part[]): Balance {
  if (parts.length === 0) return EVEN_BALANCE;
  const tally = new Map<ForgeTraitId, number>();
  let sum = 0;
  for (const p of parts) {
    const blend = blendOf(p);
    for (const l of blend.layers) {
      for (const t of partTraits(l.material)) {
        const h = HEFT[t];
        if (h === undefined) continue;
        const n = h * l.weight;
        sum += n;
        tally.set(t, (tally.get(t) ?? 0) + n);
      }
    }
  }
  const raw = Math.max(-1, Math.min(1, sum / (parts.length * HEFT_SCALE)));

  // THE DEADZONE. Inside it the tool is EVEN and every term below is the
  // identity — which is what makes this additive rather than a nerf to every
  // tool that already existed. You have to build for a balance to get one.
  const value = Math.abs(raw) < BALANCE_DEADZONE
    ? 0
    : raw > 0
      ? (raw - BALANCE_DEADZONE) / (1 - BALANCE_DEADZONE)
      : (raw + BALANCE_DEADZONE) / (1 - BALANCE_DEADZONE);

  const from = [...tally]
    .map(([trait, n]) => ({ trait, n }))
    .sort((a, b) => Math.abs(b.n) - Math.abs(a.n))
    .slice(0, 4);

  if (value === 0) return { ...EVEN_BALANCE, raw, from };

  const heavy = Math.max(0, value);
  return {
    value,
    raw,
    label: value >= 0.55 ? 'heavy' : value > 0 ? 'weighty'
      : value <= -0.55 ? 'light' : 'nimble',
    // A WIND-UP ONLY ON THE HEAVY SIDE. Neutral is unlimited clicking, so
    // "faster than neutral" is not a thing that can be sold; light is paid in
    // wear and meter instead. Asymmetric on purpose — see content/forgeParts.
    windup: WINDUP_MAX * heavy,
    // REACH IS LIGHT'S — it sweeps more plain rock per swing.
    cells: 1 - BALANCE_REACH * value,
    // PER-CELL BITE AND ORE WORK ARE HEAVY'S — it takes more of what it hits
    // and it cracks a pocket faster.
    splash: 1 + BALANCE_SPLASH * value,
    /**
     * ORE WORK IS HEAVY-ONLY, and that is a correction the tests caught.
     *
     * Two-sided, a light tool dug pockets SLOWER THAN BARE HANDS — marl reads
     * -0.90 balance, so the starter tool would have been a downgrade at the one
     * job it is most likely to meet first. The project holds a standing
     * guarantee that a tool is never worse than the hands, and a trade between
     * two builds must not be paid for out of that.
     *
     * So heavy BUYS ore speed and light simply does not, exactly as the wind-up
     * is a heavy-only cost and the meter a light-only gain. Light gets its own
     * half of the trade in reach, wear and meter.
     */
    oreRate: 1 + BALANCE_ORE * Math.max(0, value),
    wear: 1 + BALANCE_WEAR * value,
    charge: BALANCE_CHARGE * Math.max(0, -value),
    job: value > 0 ? 'ore' : 'rock',
    from,
  };
}

export function shapeFold(parts: Part[]): ShapeFold {
  if (parts.length === 0) return NO_SHAPES;
  const out: ShapeFold = { ...NO_SHAPES };
  for (const p of parts) {
    const def = shapeDef(p.shape, p.type);
    const fx = def.fx;
    if (fx.cells !== undefined) out.cells *= fx.cells;
    if (fx.splash !== undefined) out.splash *= fx.splash;
    if (fx.oreRate !== undefined) out.oreRate *= fx.oreRate;
    if (fx.dropWeight !== undefined) out.dropWeight *= fx.dropWeight;
    if (fx.wear !== undefined) out.wear *= fx.wear;
    if (fx.charge !== undefined) out.charge += fx.charge;
    if (fx.stabilize !== undefined) out.stabilize += fx.stabilize;
    if (p.type === 'head') {
      out.pattern = def.pattern ?? 'spread';
      out.head = def.id;
    }
  }
  return out;
}

export interface PartStats {
  part: Part;
  material: MaterialDef;
  /** Every trait the part carries — authored, plus its shell's. */
  traits: ForgeTraitId[];
  /** How big: shell × rarity × purity × grade. */
  magnitude: number;
  /** How hard the traits are pulling, 0.70 (poor) .. 1.30 (exalted). */
  intensity: number;
  /** The ten numbers. */
  stats: Record<ToolStat, number>;
}

/** Why a tool's parts do or do not get along. Everything the UI needs to say so. */
export interface Coherence {
  /** Mean absolute deviation of shell ordinals from the set's median. */
  shellSpread: number;
  /** 0 when every part is the same material, 1 when all seven differ. */
  variety: number;
  /** shellSpread + VARIETY_WEIGHT × variety, before stability forgives any. */
  discord: number;
  /** The tool's stability relative to a shape-neutral tool of the same parts. */
  stabilityIndex: number;
  /** How much of the discord stability forgives, 0 .. MAX_RELIEF. */
  relief: number;
  /** The multiplier applied to every stat. 1 = a set that belongs together. */
  factor: number;
}

export interface ToolStats {
  parts: Part[];
  /** What the parts add up to before coherence. */
  rawStats: Record<ToolStat, number>;
  /** What the tool actually is. */
  stats: Record<ToolStat, number>;
  coherence: Coherence;
  /** Bite × Cadence — what it takes off a rock face. */
  rockRate: number;
  /**
   * ORESPEED, ALONE — what it takes out of a pocket, and NOT multiplied by
   * cadence. That is the difference between the two rates being two axes and
   * being one axis with a rename, and it was caught by measuring: with
   * `oreSpeed × cadence`, a tool with its best material in the HEAD out-mined
   * an ore build at ORE, because cadence is a head stat and lifted both rates
   * together. The ore build lost on its own axis, which is the ruling this
   * stat exists to satisfy failing outright.
   *
   * The model that fixes it is also the more honest one. BITE is charge per
   * chip, so it needs cadence to become a rate at all. ORESPEED is a speed
   * already — the doc calls it "ore mining speed" — so it IS the rate. Two
   * genuinely independent numbers, and a tool built for ore beats a tool built
   * for rock at ore by as much as it loses at rock.
   */
  oreRate: number;
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

/**
 * THE PURITY CEILING IS THE TOP BAND'S TOP, not 100.
 *
 * A drop cannot roll above 100 and never could — but a REFINE can now reach
 * `pristine` (101-110), and a hard clamp at 100 would have silently thrown the
 * whole new band away at the one place it is read. Reading the ceiling off
 * `BAND_RANGES` means the clamp can never fall out of step with the ladder
 * again, which is the same "derive it, do not restate it" rule the trait
 * hints and the socket domain both follow.
 */
export const PURITY_CEILING = BAND_RANGES[BANDS[BANDS.length - 1]!][1];

function clampPurity(p: number): number {
  return Math.max(1, Math.min(PURITY_CEILING, Math.round(p)));
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
function rawCharacterPull(pull: TraitPull[], stat: ToolStat, intensity: number): number {
  let mult = 1;
  for (const { trait, weight } of pull) {
    const d = FORGE_TRAITS[trait]?.mods[stat];
    // THE LAYER'S WEIGHT SCALES THE PULL, not the trait's presence. At weight 1
    // this is byte-identical to the single-material form it replaced, which is
    // why there is one implementation and not two (the A.44 twin lesson).
    if (d) mult *= 1 + d * intensity * weight;
  }
  return Math.max(0.05, mult);
}

function rawCharacter(traits: ForgeTraitId[], stat: ToolStat, intensity: number): number {
  return rawCharacterPull(traits.map((trait) => ({ trait, weight: 1 })), stat, intensity);
}

/**
 * SHAPE — what the traits do, normalised so they do not change how MUCH.
 *
 * THIS IS THE LOAD-BEARING LINE OF THE WHOLE STEP, and the first cut got it
 * wrong. Raw trait multipliers leak value: a material whose traits all push
 * upward is simply better, three good traits out-earn a shell step, and ruling
 * 1 broke at five of six shell boundaries.
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
export function shapeOfPull(pull: TraitPull[], stat: ToolStat, intensity: number): number {
  const mine = rawCharacterPull(pull, stat, intensity);
  let logSum = 0;
  for (const s of TOOL_STATS) logSum += Math.log(rawCharacterPull(pull, s, intensity));
  const geoMean = Math.exp(logSum / TOOL_STATS.length);
  return Math.max(0.05, mine / geoMean);
}

export function shapeOf(traits: ForgeTraitId[], stat: ToolStat, intensity: number): number {
  return shapeOfPull(traits.map((trait) => ({ trait, weight: 1 })), stat, intensity);
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

export function weightFor(type: PartType, stat: ToolStat): number {
  const def = PART_DEFS[type];
  if (def.primary.includes(stat)) return W_PRIMARY;
  if (def.secondary.includes(stat)) return W_SECONDARY;
  return W_SPILL;
}

/** THE FUNCTION. One material, one shape, ten numbers. */
export function derivePart(part: Part): PartStats {
  // EVERYTHING COMES OUT OF THE BLEND. For a single-material part the blend is
  // one layer at weight 1 and this is the derivation it always was; for a
  // layered one it is the weighted fold, and nothing below here can tell the
  // difference — which is precisely why layering could not introduce an axis.
  const blend = blendOf(part);
  const material = blend.layers[0]!.material;

  const stats = {} as Record<ToolStat, number>;
  for (const stat of TOOL_STATS) {
    stats[stat] = STAT_BASE[stat]
      * weightFor(part.type, stat)
      * Math.pow(blend.magnitude, STAT_MAGNITUDE_EXP[stat])
      * shapeOfPull(blend.pull, stat, blend.intensity);
  }
  return {
    part, material, traits: blend.traits,
    magnitude: blend.magnitude, intensity: blend.intensity, stats,
  };
}

export function makePart(
  type: PartType, materialId: string, purity: number, shape?: PartShape,
): Part {
  return { type, materialId, purity: clampPurity(purity), shape: shapeDef(shape, type).id };
}

// ---------------------------------------------------------------------------
// Coherence — the mismatch penalty
// ---------------------------------------------------------------------------

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * THE STABILITY THE PARTS WOULD HAVE IF THEIR TRAITS SAID NOTHING — the
 * denominator that makes `stabilityIndex` free of magnitude.
 *
 * Without this, a deep tool would look unstable and a shallow one stable, for
 * no reason but scale, and the mismatch penalty would be unfixable early and
 * free late — exactly backwards, since mixing shells is a THING PLAYERS DO
 * EARLY because it is all they have. Measuring stability against what these
 * same parts would produce with neutral traits leaves only the signal that
 * matters: how far this build LEANS toward holding itself together.
 */
function expectedStability(parts: Part[]): number {
  let n = 0;
  for (const p of parts) {
    // THE BLENDED MAGNITUDE, not the outer layer's. This is the denominator of
    // `stabilityIndex`, so reading only the surface would make a layered part
    // look more (or less) stable than it is purely from which stone happened to
    // be on the outside — and the relief that buys back the mismatch penalty
    // would move for a reason that has nothing to do with stability.
    const m = blendOf(p).magnitude;
    n += STAT_BASE.stability
      * weightFor(p.type, 'stability')
      * Math.pow(m, STAT_MAGNITUDE_EXP.stability);
  }
  return n;
}

/**
 * DO THESE SEVEN PARTS BELONG TOGETHER?
 *
 * The doc's Binding row is "modifier slots + how well mismatched parts
 * cooperate" and its `trueseated` is "less penalty from mismatched parts". Both
 * describe a mechanic; this is it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO is make a deeper part not worth slotting.
 * A shell step is 6x (ruling 1), so no honest cooperation penalty outweighs
 * one, and "should I use this Aleph head" stays an easy yes. What it prices is
 * SCATTER: among parts of comparable depth, a set that belongs together beats
 * a set that does not. One Aleph head in a Cinder tool costs a few percent;
 * one part from each of the seven shells costs most of the tool.
 */
export function coherenceOf(parts: Part[], rawStats: Record<ToolStat, number>): Coherence {
  if (parts.length < 2) {
    return {
      shellSpread: 0, variety: 0, discord: 0,
      stabilityIndex: 1, relief: 0, factor: 1,
    };
  }
  /**
   * A LAYERED PART COUNTS AS ITS BLEND — the brief's requirement, and the read
   * that makes layering a real coherence decision rather than a loophole.
   *
   * Three things follow from it. A part's shell is the WEIGHTED MEAN of its
   * layers, so a marl-over-firstiron head sits between the two rather than
   * reading as whichever one happens to be on the outside. A part that
   * disagrees with ITSELF adds its own internal spread to the discord, so
   * Damascus across four shells is priced like the scatter it is. And VARIETY
   * counts every material in every layer over the total number of layer slots,
   * so a tool of seven three-layer parts is measured against twenty-one slots
   * rather than seven — otherwise variety would read above 1 and the whole
   * penalty would saturate the moment anybody tried the feature.
   */
  const blends = parts.map(blendOf);
  const ords = blends.map((b) => b.shell);
  const mid = median(ords);
  const shellSpread = ords.reduce((n, o) => n + Math.abs(o - mid), 0) / ords.length;
  const internal = blends.reduce((n, b) => n + b.spread, 0) / blends.length;

  const slots = blends.reduce((n, b) => n + b.layers.length, 0);
  const distinct = new Set(parts.flatMap(partMaterials)).size;
  const variety = slots > 1 ? (distinct - 1) / (slots - 1) : 0;

  const discord = shellSpread + internal + VARIETY_WEIGHT * variety;

  const expect = expectedStability(parts);
  const stabilityIndex = expect > 0 ? rawStats.stability / expect : 1;
  const relief = Math.max(0, Math.min(MAX_RELIEF,
    (stabilityIndex - RELIEF_PIVOT) * RELIEF_SLOPE));

  const effective = discord * (1 - relief);
  const factor = 1 / (1 + MISMATCH_K * effective * effective);

  return { shellSpread, variety, discord, stabilityIndex, relief, factor };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * SEVEN PARTS, ONE TOOL. The stats SUM and the sum is then scaled by COHERENCE,
 * so an outstanding part is never cancelled outright — but seven parts with
 * nothing to do with each other really do make a worse tool than a set that
 * belongs together.
 *
 * THE FIRST CUT HAD THIS AS A PURE SUM, with a test asserting no part could
 * ever be dragged down by another. That test asserted the absence of the thing
 * that makes part choice a choice, and it is gone.
 *
 * A tool may be assembled INCOMPLETE — `assembleTool` does not require all
 * seven, and a single part is trivially coherent with itself. Step 3's tool
 * station will decide whether a partial tool is usable; this layer just adds up
 * what is there, so the UI can show a build in progress.
 */
export function assembleTool(parts: Part[]): ToolStats {
  const rawStats = {} as Record<ToolStat, number>;
  for (const s of TOOL_STATS) rawStats[s] = 0;

  const traits = new Set<ForgeTraitId>();
  let depth = 0;
  for (const p of parts) {
    const d = derivePart(p);
    for (const s of TOOL_STATS) rawStats[s] += d.stats[s];
    for (const t of d.traits) traits.add(t);
    depth += shellOrdinal(d.material.shellId);
  }

  const coherence = coherenceOf(parts, rawStats);
  const stats = {} as Record<ToolStat, number>;
  for (const s of TOOL_STATS) stats[s] = rawStats[s] * coherence.factor;

  /**
   * WHAT THE LIVING PARTS GREW INTO, on the three terms that are STATS.
   *
   * The other four growth terms (reach, mending, steadiness, wear) are consumed
   * at their own sites — `effectOf`, `tickToolMods`, `instability`, `wearPerUse`
   * — because they are not stats. These three are, so they land here, after
   * coherence, where every other stat is finished. A part that has grown nothing
   * multiplies by exactly 1, which is why no existing tool moves.
   */
  const grown = growthFold(parts);
  stats.control *= grown.control;
  stats.cadence *= grown.cadence;
  stats.resilience *= grown.resilience;

  return {
    parts,
    rawStats,
    stats,
    coherence,
    rockRate: stats.bite * stats.cadence,
    oreRate: stats.oreSpeed,
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
