/**
 * SIGNATURE TECHNIQUES — the verb-per-signature layer (Progression &
 * Differentiation phase, Part B). Every signature grants ONE technique: an
 * action the player performs at the face that only that rock makes possible.
 * This is the core fix for "shells play identically" — the shell is not a
 * palette, it is a verb.
 *
 * RULES (framework, designed for six):
 *  - NATIVE runs at full power; CARRIED techniques work everywhere the
 *    signature is carried, at longer cooldowns (cooldown / strength — a
 *    0.4-strength carry waits 2.5× as long). The verb survives the fall,
 *    weakened, exactly like the mechanic it belongs to.
 *  - A technique never has a currency cost. The cooldown IS the cost; a verb
 *    you must buy is a purchase, not a technique.
 *  - Pillar 1: techniques are pure ACTIVE upside. Nothing an idle player had
 *    is moved behind one (Skim's guarantee is tested, not promised).
 *  - Pillar 5: no locked list. A technique appears when its signature is
 *    active, never before.
 *
 * Shells III–VII: STUBBED by ruling — the registry accommodates growth /
 * refraction / pressure / absence techniques; none is registered until the
 * creative pass lands. Loam (Skim) and Ferrite (Poleshift) are the reference
 * implementations.
 */
import type { ModifierCache } from './modifiers';
import type { ActionResult, EngineCtx, GameState } from './types';
import { activeSignatures } from './signatures';

export interface TechniqueDef {
  id: string;
  /** The signature that grants it — active signature (native or carried). */
  signatureId: string;
  name: string;
  /** The verb, imperative, as the button says it: "Skim", "Shift the pole". */
  verb: string;
  flavor: string;
  /** Says what it does at the given strength — rule 5, computed not vague. */
  describe: (state: GameState, strength: number) => string;
  /** Native cooldown in play-seconds; carried divides by strength. 0 = none
   *  (the technique self-paces some other way, and must say how). */
  cooldownSec: number;
  /** Optional state-read reduction in seconds (upgrades buying a faster hand).
   *  Applied before the carry division; never below 1s. */
  cooldownAdjust?: (state: GameState) => number;
  /** Cell-targeted (the face enters technique mode) or global (a button). */
  targeted: boolean;
  perform: (
    state: GameState,
    mods: ModifierCache,
    ctx: EngineCtx,
    strength: number,
    cell?: number,
  ) => ActionResult;
}

const registry = new Map<string, TechniqueDef>();

export function registerTechnique(def: TechniqueDef): void {
  if (registry.has(def.id)) throw new Error(`Duplicate technique: ${def.id}`);
  registry.set(def.id, def);
}

export function clearTechniques(): void {
  registry.clear();
}

export function techniqueDef(id: string): TechniqueDef | undefined {
  return registry.get(id);
}

export interface AvailableTechnique {
  def: TechniqueDef;
  strength: number;
  native: boolean;
  /** Seconds until usable again; 0 = ready. */
  readyInSec: number;
}

/** Effective cooldown at a strength: carried verbs wait longer, never cost more. */
export function techniqueCooldown(def: TechniqueDef, strength: number, state?: GameState): number {
  if (def.cooldownSec <= 0) return 0;
  const base = Math.max(1, def.cooldownSec - (state ? (def.cooldownAdjust?.(state) ?? 0) : 0));
  return base / Math.max(0.05, strength);
}

/** Every technique the current signature set grants, ready or cooling. */
export function availableTechniques(state: GameState): AvailableTechnique[] {
  const out: AvailableTechnique[] = [];
  for (const sig of activeSignatures(state)) {
    for (const def of registry.values()) {
      if (def.signatureId !== sig.def.id) continue;
      const cd = techniqueCooldown(def, sig.strength, state);
      const last = state.techniques.lastUsed[def.id] ?? -Infinity;
      const readyInSec = cd <= 0 ? 0 : Math.max(0, cd - (state.stats.playTimeSec - last));
      out.push({ def, strength: sig.strength, native: sig.native, readyInSec });
    }
  }
  return out;
}

export function useTechnique(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  id: string,
  cell?: number,
): ActionResult {
  const avail = availableTechniques(state).find((t) => t.def.id === id);
  if (!avail) return { ok: false, reason: 'This rock does not answer to that' };
  if (avail.readyInSec > 0) {
    return { ok: false, reason: `Not yet — ${Math.ceil(avail.readyInSec)}s` };
  }
  if (avail.def.targeted && (cell === undefined || cell < 0 || cell >= state.face.cells.length)) {
    return { ok: false, reason: 'Pick a cell' };
  }
  const result = avail.def.perform(state, mods, ctx, avail.strength, cell);
  if (result.ok) {
    state.techniques.lastUsed[id] = state.stats.playTimeSec;
    ctx.dirty();
    ctx.emit({ type: 'techniqueUsed', id, cell });
  }
  return result;
}

export function defaultTechniquesState(): GameState['techniques'] {
  return { lastUsed: {} };
}
