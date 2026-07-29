/**
 * WHAT THE TOOL TURNED OUT TO BE — the runtime for emergent classes.
 *
 * One function does the work: score every class against the seven parts, and
 * hand back the winner, what tipped it, and what it was up against. Everything
 * else here is readout.
 *
 * TWO GATES, and both are refusals rather than penalties:
 *
 *  1. COHERENCE. Below `CLASS_COHERENCE` there is NO class, whatever the
 *     traits say. A bag of seven materials from four shells is not a Siege
 *     that happens to be scattered; it is not anything. This is the tie-in the
 *     brief asks for and it costs nothing extra to enforce, because the
 *     coherence factor was already computed for the stat penalty.
 *  2. THRESHOLD. Even a perfectly coherent set of nothing-in-particular gets
 *     no class. Leaning has to actually lean.
 *
 * A TIE IS NO CLASS. Two signatures scoring identically means the build is
 * pulling in two directions, which is exactly the case where claiming one of
 * them would be a lie. The readout says so.
 */
import type { GameState } from '../types';
import type { TraitId } from '../traits';
import { traitsOf } from '../traits';
import {
  CLASS_COHERENCE, CLASS_THRESHOLD, SHAPE_WEIGHT, TOOL_CLASSES,
  type ToolClassDef,
} from '../content/toolClasses';
import { shapeDef } from '../content/forgeParts';
import type { Part, ToolStats } from './forgeParts';
import { currentTool } from './casting';

export interface ClassRead {
  /** The class, or null — scattered, or leaning nowhere. */
  def: ToolClassDef | null;
  /** Why not, when there is no class. */
  why: string | null;
  /** 0..1+, how far into the winning signature this build is. */
  score: number;
  /** The traits that tipped it, biggest first — the "what tipped it" line. */
  tipped: Array<{ trait: TraitId; have: number; want: number }>;
  /** The runner-up and its score, so a near-miss is visible. */
  nextBest: { def: ToolClassDef; score: number } | null;
  /** The coherence factor that let it (or did not). */
  coherence: number;
}

export const NO_CLASS: ClassRead = {
  def: null, why: null, score: 0, tipped: [], nextBest: null, coherence: 1,
};

/** Every trait across all seven parts, counted. A material carrying two traits
 *  contributes both, which is why a seven-part set piles up quickly. */
export function partTraitPool(parts: Part[]): Partial<Record<TraitId, number>> {
  const pool: Partial<Record<TraitId, number>> = {};
  for (const p of parts) {
    for (const t of traitsOf(p.materialId)) pool[t] = (pool[t] ?? 0) + 1;
  }
  return pool;
}

/**
 * HOW FAR INTO A SIGNATURE THIS SET IS. 1 means every trait requirement met
 * exactly; above 1 means more than it asked for. Capped per trait so a pile of
 * one trait cannot carry a signature that wanted two.
 */
function scoreClass(
  def: ToolClassDef, pool: Partial<Record<TraitId, number>>, shapes: Set<string>,
): { score: number; tipped: ClassRead['tipped'] } {
  const tipped: ClassRead['tipped'] = [];
  let got = 0;
  let want = 0;
  for (const [trait, need] of Object.entries(def.needs)) {
    const n = need as number;
    const have = pool[trait as TraitId] ?? 0;
    want += n;
    got += Math.min(have, n);
    tipped.push({ trait: trait as TraitId, have, want: n });
  }
  // Shapes NUDGE. Half a trait each, and they cannot exceed what the traits
  // already earned — so a set of favoured shapes over the wrong stone is still
  // the wrong stone, and shape stays a separate axis rather than a second vote
  // for the same thing.
  let nudge = 0;
  for (const s of def.favours ?? []) if (shapes.has(s)) nudge += SHAPE_WEIGHT;
  nudge = Math.min(nudge, want * 0.25);

  tipped.sort((a, b) => Math.min(b.have, b.want) - Math.min(a.have, a.want));
  return { score: want > 0 ? (got + nudge) / want : 0, tipped };
}

/**
 * READ THE CLASS OFF A BUILT TOOL. Pure — no state written, no discovery
 * recorded; `noteToolClass` does that.
 */
export function classOf(tool: ToolStats | null): ClassRead {
  if (!tool || tool.parts.length === 0) return NO_CLASS;
  const coherence = tool.coherence.factor;
  if (coherence < CLASS_COHERENCE) {
    return {
      ...NO_CLASS,
      coherence,
      why: 'These parts do not belong together. A tool has to be one thing before it can be a particular thing.',
    };
  }

  const pool = partTraitPool(tool.parts);
  const shapes = new Set(tool.parts.map((p) => shapeDef(p.shape, p.type).id as string));
  const ranked = TOOL_CLASSES
    .map((def) => ({ def, ...scoreClass(def, pool, shapes) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]!;
  const second = ranked[1] ?? null;

  if (best.score < CLASS_THRESHOLD) {
    return {
      ...NO_CLASS,
      coherence,
      score: best.score,
      nextBest: second ? { def: second.def, score: second.score } : null,
      tipped: best.tipped,
      why: 'It is a coherent set and it leans nowhere in particular. Nothing wrong with it — it is just a tool.',
    };
  }
  // A DEAD HEAT IS NOT A CLASS. Two signatures at the same score means the
  // build is pulling both ways, and picking one would be inventing a fact.
  if (second && Math.abs(second.score - best.score) < 1e-9) {
    return {
      ...NO_CLASS,
      coherence,
      score: best.score,
      tipped: best.tipped,
      nextBest: { def: second.def, score: second.score },
      why: 'It is pulling two ways at once. Lean one of them further.',
    };
  }

  return {
    def: best.def,
    why: null,
    score: best.score,
    tipped: best.tipped.filter((t) => t.have > 0),
    nextBest: second ? { def: second.def, score: second.score } : null,
    coherence,
  };
}

/** What the player is holding, right now. */
export function toolClass(state: GameState): ClassRead {
  return classOf(currentTool(state));
}

/** May this tool work in this modifier? Unlocked ones are open to everybody;
 *  a class-locked one wants that class in hand. */
export function classAllows(state: GameState, locked: string | undefined): boolean {
  if (!locked) return true;
  return toolClass(state).def?.id === locked;
}

/**
 * RECORD A CLASS THE FIRST TIME A TOOL LANDS IN IT. The discovery is the
 * moment, and like a synergy it is knowledge rather than a possession: the
 * record survives rebuilding into something else.
 */
export function noteToolClass(state: GameState, ctx?: { emit: (e: never) => void; dirty: () => void }): string | null {
  if (!state.casting) return null;
  const read = toolClass(state);
  if (!read.def) return null;
  const known = (state.casting.knownClasses ??= []);
  if (known.includes(read.def.id)) return null;
  known.push(read.def.id);
  ctx?.emit({ type: 'toolClassFound', id: read.def.id, name: read.def.name } as never);
  ctx?.dirty();
  return read.def.id;
}
