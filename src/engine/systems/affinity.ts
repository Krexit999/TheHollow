/**
 * AFFINITY — implements that learn from use (THE FACE CLUSTER, v21).
 *
 * ONE shared mechanism for tools AND drills, because "a tool that learns" is a
 * scheduled phase and two learning systems that don't talk would be a mistake. An
 * IMPLEMENT (a `ToolInstance` or a `DrillState`) accumulates a use-history keyed by
 * the SHELL it worked, and develops AFFINITY for that world from it. Two identical
 * Tier-XII picks diverge by hour 60 based on where you actually mined.
 *
 * DESIGN CONSTRAINTS (the reviewer's ruling, honoured):
 *  - On the implement (`impl.use`), not a parallel stat.
 *  - Through the modifier pipeline as a NAMED source (the equipped tool registers
 *    `affinity` into `dropRate`; a drill's affinity is the same curve applied to its
 *    own `drillPower`, which per-drill state cannot be a global source but is the
 *    same function, so it composes with traits/alloys/runes/gems, never a bypass).
 *  - SLOW: it reads as history, not a grind (a big K so it saturates over tens of
 *    hours), and CAPPED small (`MAX_BONUS`) so it can never justify hoarding a bad
 *    implement or overcome a tier gap.
 *  - It ACCUMULATES and NEVER DECAYS, so switching is never punished — a new
 *    implement simply starts its own history; the one you set down keeps all of its.
 *
 * PILLAR 2: affinity feeds `drillPower` (drills reach the regen ceiling a little
 * sooner, never exceed it) and `dropRate` (drops are not income). It never touches
 * `dustYield`, so it changes how you reach the ceiling, not what the ceiling is.
 */
import type { DrillState, GameState } from '../types';

/** Anything that keeps a use-history. A structural type so tools and drills share it. */
export interface Implement {
  use?: Record<string, number>;
}

/** How slowly affinity saturates. `use` counts strikes/chips; a drill striking ~1/s
 *  reaches level ~0.79 after ~300k strikes (~tens of hours in one shell). */
const SATURATION = 80000;
/** The most affinity can ever add. Small on purpose: history, not a power spike. */
export const AFFINITY_MAX_BONUS = 0.15;

/** Record `amount` of use of `key` (a shell id) on an implement. Accumulates only. */
export function logImplementUse(impl: Implement, key: string, amount = 1): void {
  if (amount <= 0) return;
  const use = (impl.use ??= {});
  use[key] = (use[key] ?? 0) + amount;
}

/** Affinity level 0..1 for a key — a slow saturating curve of accumulated use. */
export function affinityLevel(impl: Implement, key: string): number {
  const u = impl.use?.[key] ?? 0;
  if (u <= 0) return 0;
  return u / (u + SATURATION);
}

/** The multiplier an implement's affinity for `key` contributes (1 .. 1+MAX). */
export function affinityMult(impl: Implement, key: string): number {
  return 1 + AFFINITY_MAX_BONUS * affinityLevel(impl, key);
}

/** The single shell whose materials an implement knows best (for the UI). */
export function bestAffinity(impl: Implement): { shellId: string; level: number } | null {
  const use = impl.use;
  if (!use) return null;
  let bestKey: string | null = null;
  let bestUse = 0;
  for (const [k, v] of Object.entries(use)) if (v > bestUse) { bestUse = v; bestKey = k; }
  return bestKey ? { shellId: bestKey, level: affinityLevel(impl, bestKey) } : null;
}

// --- Modifier source (the equipped tool, into dropRate) ---------------------
// A drill's affinity is applied per-drill in `drillPower`; the equipped tool's
// affinity is a global named source here, so both use the same curve and both are
// visible in a breakdown. Registered from the content bootstrap.
import { registerModifier } from '../modifiers';
import { currentShell } from '../shells';

let registered = false;
/**
 * Register the equipped tool's affinity as a named `dropRate` source. The VALUE is
 * supplied by the caller (`toolMult`) so OPINIONS (v22) can bend it — a settled tool
 * favours a rock it knows and sulks briefly on a switch — without affinity importing
 * opinions (which would be a cycle). Pass the plain `affinityMult` for no opinions.
 */
export function registerAffinity(toolMult: (s: GameState) => number): void {
  if (registered) return;
  registered = true;
  registerModifier({
    id: 'affinity',
    label: 'Tool affinity + temperament (this rock)',
    bucket: 'dropRate',
    value: (s) => toolMult(s),
  });
}

/** Convenience: does this drill know the current shell at all? (UI copy.) */
export function drillKnows(drill: DrillState, state: GameState): number {
  return affinityLevel(drill, currentShell(state).id);
}
