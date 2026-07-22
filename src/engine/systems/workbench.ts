/**
 * THE WORKBENCH — crafting is a process, not a purchase.
 *
 * Every other system in this game is something you HANDLE. The Forge was a
 * button: spend materials, receive an object, nothing about it yours. This
 * makes the making itself an act.
 *
 * ONE MODEL, FOUR ACTS. A craft is a JOB: a short sequence of STAGES, each a
 * different verb, each contributing to a QUALITY that is EARNED across the
 * stages, never rolled. The four acts share this skeleton and differ in their
 * stages and — in the UI — in the interaction each stage renders:
 *
 *   FORGE   heat → shape → set     (force: match your strokes to the metal)
 *   CARVE   steady → stroke        (trace: cut the rune's line, hand steady)
 *   CUT     read → cleave          (placement: where the planes go)
 *   CAST    mix → pour             (proportion: what goes in shapes what comes out)
 *
 * FIVE RULES, from the brief, each a property this module guarantees:
 *
 *  1. TRAITS CHANGE THE PROCESS, not just the result. `stageProfile` reads the
 *     material's traits and returns the difficulty the UI renders — a brittle
 *     stone must be worked gently, a springy one fights back. The player learns
 *     materials through their hands.
 *  2. QUALITY IS EARNED, NOT ROLLED. No RNG anywhere in the outcome. Final
 *     quality is a weighted sum of how well each stage was executed.
 *  3. FAILURE COSTS MATERIAL, NEVER THE ITEM. The softened-rune ruling, general-
 *     ised: a botched craft still produces the piece, only worse. A carve that
 *     fails consumes the prep, never the tool.
 *  4. DELEGATE, ALWAYS (pillar 4). Every act can be handed to an NPC for a safe,
 *     guaranteed, slightly-worse result. Skill pays; absence never blocks. And
 *     it is social — a better relationship buys a better delegated result.
 *  5. HEADLESS (pillar 8). The engine owns the stages, the trait-driven
 *     difficulty, and the quality maths. The UI owns the tactile interaction and
 *     reports back a single 0..1 EXECUTION per stage. The two never entangle.
 */
import { traitsOf, type TraitId } from '../traits';

export type CraftAct = 'forge' | 'carve' | 'cut' | 'cast';
export const CRAFT_ACTS: CraftAct[] = ['forge', 'carve', 'cut', 'cast'];

export interface StageDef {
  id: string;
  /** The interaction the UI renders — deliberately distinct across acts. */
  verb: 'heat' | 'shape' | 'set' | 'steady' | 'stroke' | 'read' | 'cleave' | 'mix' | 'pour';
  label: string;
  hint: string;
  /** Contribution to final quality; the stages of an act sum to 1. */
  weight: number;
}

export const ACT_STAGES: Record<CraftAct, StageDef[]> = {
  forge: [
    { id: 'heat', verb: 'heat', label: 'Heat', weight: 0.3,
      hint: 'Bring it to temperature. Too cold and it will not take form; too hot and the traits cook out.' },
    { id: 'shape', verb: 'shape', label: 'Shape', weight: 0.5,
      hint: 'Where the character is set. Match your strokes to the metal — heavy for dense, gentle for brittle.' },
    { id: 'set', verb: 'set', label: 'Set', weight: 0.2,
      hint: 'The cooling. A steady set locks in the work; a rushed one wastes it.' },
  ],
  carve: [
    { id: 'steady', verb: 'steady', label: 'Steady the hand', weight: 0.35,
      hint: 'Before the cut, find the stillness. The stone will not wait for a shaking hand.' },
    { id: 'stroke', verb: 'stroke', label: 'Cut the stroke', weight: 0.65,
      hint: 'Trace the line in one pass. The stone resists — springy pushes back, brittle chips if you rush.' },
  ],
  cut: [
    { id: 'read', verb: 'read', label: 'Read the stone', weight: 0.4,
      hint: 'Find the plane the gem wants to break along. Read it wrong and the cleave is wasted.' },
    { id: 'cleave', verb: 'cleave', label: 'Cleave', weight: 0.6,
      hint: 'Place the facets. Where they go decides what the stone fits and how it reads.' },
  ],
  cast: [
    { id: 'mix', verb: 'mix', label: 'Mix', weight: 0.5,
      hint: 'Set the proportions. What goes in shapes what comes out — this is the discovery.' },
    { id: 'pour', verb: 'pour', label: 'Pour', weight: 0.5,
      hint: 'Pour steady. The shape is decided; now you only have to not spoil it.' },
  ],
};

/** A craft in progress. Held on GameState; one at a time per bench. */
export interface CraftJob {
  act: CraftAct;
  /** Act-specific: forge {tier,head,haft,binding}; carve {target,sequence};
   * cut {gemId}; cast {inputs}. Opaque here — the act handlers read it. */
  context: Record<string, unknown>;
  /** Execution recorded per completed stage, 0..1. */
  results: number[];
  /** True when handed to an NPC. */
  delegated: boolean;
}

export type GemLean = 'mine' | 'fight' | 'balanced';

export interface WorkbenchState {
  job: CraftJob | null;
  /** Times each act was hand-crafted — flavour, and a light practice curve. */
  done: Record<CraftAct, number>;
  /** Best hand quality reached per act — the bench's memory of your skill. */
  bestQuality: Record<CraftAct, number>;
  /** CUT: the best cut you have learned to give each gem TYPE, and its lean.
   * "You learned to cut Bloodgarnet, mining-lean, cleanly." */
  gemCuts: Record<string, { lean: GemLean; quality: number }>;
  /** CAST: discovered rune-cast recipes (by their input-trait signature). */
  castsFound: string[];
}

export function defaultWorkbenchState(): WorkbenchState {
  return {
    job: null,
    done: { forge: 0, carve: 0, cut: 0, cast: 0 },
    bestQuality: { forge: 0, carve: 0, cut: 0, cast: 0 },
    gemCuts: {},
    castsFound: [],
  };
}

// ---------------------------------------------------------------------------
// Trait-driven difficulty — RULE 1
// ---------------------------------------------------------------------------

export interface StageProfile {
  /** 0..1 — higher is more forgiving (a wider window, a slower clock). */
  forgiveness: number;
  /** 0..1 — how much the material fights the stroke (overshoot, spring-back). */
  resistance: number;
  /** How catastrophic a bad stroke is — brittle shatters, tough absorbs. */
  fragility: number;
  /** One line for the player, in the game's voice. */
  note: string;
}

/**
 * The difficulty of a stage, from the traits of the material it works. The UI
 * renders the interaction using these numbers, and the SAME numbers feed the
 * quality maths, so process and result can never disagree.
 *
 * The material read depends on the act: a forge stage works the HEAD, a carve
 * works the target's head, a cut works the gem's notional traits, a cast reads
 * its inputs. `materialTraits` is passed in so this stays pure.
 */
export function stageProfile(stage: StageDef, materialTraits: TraitId[]): StageProfile {
  const has = (t: TraitId) => materialTraits.includes(t);
  let forgiveness = 0.6;
  let resistance = 0.3;
  let fragility = 0.3;
  const notes: string[] = [];

  if (has('brittle')) { forgiveness -= 0.25; fragility += 0.35; notes.push('brittle — work it gently'); }
  if (has('tough')) { forgiveness += 0.15; fragility -= 0.2; notes.push('tough — it forgives a bad angle'); }
  if (has('springy')) { resistance += 0.3; notes.push('springy — it fights back'); }
  if (has('dense')) { resistance += 0.12; forgiveness -= 0.05; notes.push('dense — it takes real force'); }
  if (has('light')) { forgiveness += 0.1; resistance -= 0.08; notes.push('light — quick and willing'); }
  if (has('keen')) { forgiveness -= 0.08; notes.push('keen — a narrow, savage window'); }
  if (has('trueseated')) { forgiveness += 0.1; fragility -= 0.1; notes.push('trueseated — it holds true'); }
  // Warm and charged reach outward; on the shape/steady stages they steady the
  // hand a little, a nod to the "materials you can feel" idea.
  if (has('warm') && (stage.verb === 'heat' || stage.verb === 'set')) { forgiveness += 0.15; notes.push('warm — it holds its heat'); }
  if (has('hollow')) { resistance += 0.1; notes.push('hollow — it rings and wanders'); }

  return {
    forgiveness: clamp01(forgiveness),
    resistance: clamp01(resistance),
    fragility: clamp01(fragility),
    note: notes.length ? notes.join('; ') : 'plain stock — nothing to fight',
  };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// ---------------------------------------------------------------------------
// Quality — RULE 2: earned, never rolled
// ---------------------------------------------------------------------------

/** Weighted quality so far, 0..1. */
export function jobQuality(job: CraftJob): number {
  const stages = ACT_STAGES[job.act];
  let q = 0;
  for (let i = 0; i < job.results.length; i++) {
    q += (job.results[i] ?? 0) * (stages[i]?.weight ?? 0);
  }
  return clamp01(q);
}

/** Is every stage recorded? */
export function jobComplete(job: CraftJob): boolean {
  return job.results.length >= ACT_STAGES[job.act].length;
}

/** The stage awaiting execution, or null if the job is done. */
export function currentStage(job: CraftJob): StageDef | null {
  return ACT_STAGES[job.act][job.results.length] ?? null;
}

// ---------------------------------------------------------------------------
// Delegation — RULE 4: safe, guaranteed, slightly worse, and social
// ---------------------------------------------------------------------------

/** The quality an NPC delivers: a safe baseline, lifted by your standing with
 * them. Never as good as a clean hand-craft, never a failure. */
export const DELEGATE_BASE = 0.62;
export const DELEGATE_REP_BONUS = 0.18; // at full standing

export function delegateQuality(rep01: number): number {
  return clamp01(DELEGATE_BASE + DELEGATE_REP_BONUS * clamp01(rep01));
}

/**
 * How a finished quality maps to the CRAFTSMANSHIP multiplier the acts apply.
 * A clean hand-craft beats a delegated one; a botch is worse than delegating
 * but never ruinous — the piece is fine, only its stats are down a touch.
 * Range roughly 0.88 .. 1.16 so skill is worth ~+9% over delegating (~1.06).
 */
export function craftsmanship(quality: number): number {
  return 0.88 + 0.28 * clamp01(quality);
}

/** The traits of the material an act's stages should read, from the job. */
export function jobMaterialTraits(job: CraftJob): TraitId[] {
  const ctx = job.context;
  // forge reads the head; carve reads the target tool's head; cut reads the
  // gem (no traits yet → empty); cast reads the union of its inputs.
  if (job.act === 'cast') {
    const inputs = (ctx['inputs'] as string[]) ?? [];
    return [...new Set(inputs.flatMap((id) => traitsOf(id)))];
  }
  const mat = (ctx['head'] as string) ?? (ctx['material'] as string) ?? '';
  return mat ? traitsOf(mat) : [];
}

/**
 * How a learned CUT reshapes a socketed gem's contribution. A mining-lean cut
 * lifts the mining face and shaves the combat face; a fight-lean cut the
 * reverse; a balanced cut lifts both a little. Quality scales the effect. This
 * is what "where the planes go decides how it reads" means, in numbers.
 */
export function gemCutMult(
  cut: { lean: GemLean; quality: number } | undefined,
  face: 'mine' | 'fight',
): number {
  if (!cut) return 1;
  const q = cut.quality;
  if (cut.lean === 'balanced') return 1 + q * 0.12;
  const favored = cut.lean === 'mine' ? 'mine' : 'fight';
  return face === favored ? 1 + q * 0.28 : 1 - q * 0.08;
}
