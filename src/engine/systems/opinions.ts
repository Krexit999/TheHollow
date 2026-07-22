/**
 * OPINIONS — the other half of tools-that-learn (v22).
 *
 * Affinity (v21) let an implement get a little BETTER at a rock it worked. Opinions
 * are the personality that grows out of the SAME history: a tool carried long enough
 * stops being neutral. It favours the rock it knows, works a stranger rock a little
 * worse, and SULKS for a short spell after you pick it up — a settling-in, not a tax.
 *
 * NO SECOND STAT. Everything here is read from `impl.use` (the affinity history) and
 * one timestamp (`forge.equippedAt`). It routes through the SAME modifier source the
 * tool's affinity already uses, so it composes and shows in the breakdown.
 *
 * THE TENSION HELD (the brief's): a rotated set never earns opinions (low total
 * history → `opinionation ≈ 0` → the tool is neutral everywhere), so switching is
 * never punished; a single pick carried forty hours becomes strongly opinionated, so
 * a favourite FEELS like a favourite. Sulking is short and — crucially — a tool that
 * already knows this shell settles fast, so re-equipping a familiar tool barely sulks.
 *
 * PILLAR 1: an opinion only ever scales the small affinity bonus (into `dropRate`),
 * never base function; an idle player gets the base and is untouched by sulking.
 * PILLAR 2: it lands in `dropRate`, which is not income — it changes how you reach
 * the ceiling, never what it is.
 */
import type { GameState } from '../types';
import { affinityLevel, AFFINITY_MAX_BONUS, type Implement } from './affinity';
import { currentShell } from '../shells';
import { equippedTool } from './forge';

/** Total use makes a tool set in its ways. Bigger than affinity's saturation: a
 *  tool is OPINIONATED only after a real relationship, not after a session. */
const OPINION_SATURATION = 120000;
/** The most an opinion can PENALISE a settled tool in a rock it does not know. */
export const OPINION_PENALTY = 0.08;
/** Seconds of play a switched-to tool takes to fully settle (a stranger tool). */
export const SETTLE_SEC = 150;

export function totalUse(impl: Implement): number {
  const use = impl.use;
  if (!use) return 0;
  let t = 0;
  for (const v of Object.values(use)) t += v;
  return t;
}

/** 0..1 — how set in its ways an implement is (drives the STRENGTH of its opinions). */
export function opinionation(impl: Implement): number {
  const t = totalUse(impl);
  return t / (t + OPINION_SATURATION);
}

/** 0..1 — how settled the equipped tool is since it was last picked up. A tool that
 *  already knows this shell settles faster (it remembers you). */
export function settleFactor(state: GameState): number {
  const tool = equippedTool(state);
  const known = affinityLevel(tool, currentShell(state).id);
  const sec = SETTLE_SEC * (1 - 0.7 * known); // familiar → a short sulk
  const since = state.stats.playTimeSec - (state.forge.equippedAt ?? 0);
  return Math.max(0, Math.min(1, since / Math.max(1, sec)));
}

/**
 * The equipped tool's OPINION multiplier for the current shell — the same shape the
 * plain affinity had, bent by personality: a settled tool favours a rock it knows
 * (+) and works one it does not a little worse (−), and it sulks (toward neutral 1.0)
 * for a short spell after you pick it up.
 */
export function opinionMult(state: GameState): number {
  const tool = equippedTool(state);
  const level = affinityLevel(tool, currentShell(state).id);
  const op = opinionation(tool);
  const settle = settleFactor(state);
  const bonus = AFFINITY_MAX_BONUS * level;              // knows this rock → +
  const penalty = OPINION_PENALTY * op * (1 - level);    // set in its ways, stranger rock → −
  return 1 + settle * (bonus - penalty);
}

/** A short, plain-language read of the equipped tool's temperament, for the UI. */
export function opinionRead(state: GameState): { settling: boolean; mood: string } {
  const tool = equippedTool(state);
  const shell = currentShell(state);
  const level = affinityLevel(tool, shell.id);
  const op = opinionation(tool);
  const settle = settleFactor(state);
  if (op < 0.12) return { settling: false, mood: 'Easy in the hand — no strong habits yet.' };
  if (settle < 0.95) return { settling: true, mood: `Settling back into your grip…` };
  if (level > 0.35) return { settling: false, mood: `Knows ${shell.name}. Sits right here.` };
  return { settling: false, mood: `Set in its ways — it would rather be somewhere it knows.` };
}
