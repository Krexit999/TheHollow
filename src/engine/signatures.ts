/**
 * SIGNATURE MECHANICS — the registry the face queries. Never a conditional.
 *
 * A shell's signature runs NATIVE (strength 1) while you are in that shell.
 * Breaching OUT of a shell adds its signature to the permanent carried list:
 * it then runs in every shell thereafter at CARRY_BASE strength, raisable
 * with Echoes (Resonant Memory). By Shell VI five run at once.
 *
 * COMPOSITION RULES (designed for five, documented now):
 *  1. chipMult hooks MULTIPLY — commutative, so order can never contradict.
 *  2. State-mutating hooks (onFaceTick / onFaceReset / inside chipMult) run
 *     carried-oldest-first, NATIVE LAST: if two mechanics contest the same
 *     cell property, the current shell's native mechanic wins by running
 *     last. This is the resolution order; document any exception here.
 *  3. Each mechanic owns a disjoint GameState slice (polarity owns
 *     state.polarity; growth will own state.growth; ...). Mechanics never
 *     write another mechanic's slice.
 */
import type { ModifierCache } from './modifiers';
import type { EngineCtx, GameState } from './types';
import { currentShell } from './shells';

export const CARRY_BASE = 0.4;
export const RESONANT_MEMORY_PER_LEVEL = 0.15;

export interface SignatureHooks {
  /**
   * Called for every harvest of a cell. Returns the yield multiplier for
   * THIS chip and may advance the mechanic's own state (chains etc.).
   * `manual` distinguishes hand chips from drill strikes.
   */
  chipMult?(
    state: GameState,
    mods: ModifierCache,
    ctx: EngineCtx,
    cell: number,
    strength: number,
    manual: boolean,
  ): number;
  /** Per-step face pass (chain timeouts, growth spread, heat build). */
  onFaceTick?(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number, strength: number): void;
  /**
   * The face was rebuilt. `cause` is the Phase-7 interface addition (declared,
   * not patched around): Growth SURVIVES 'descend'/'expand' — a cultivation
   * must live through the core loop — and dies on 'collapse'/'breach'.
   * Mechanics ignoring the cause behave exactly as before.
   */
  onFaceReset?(state: GameState, strength: number, cause: FaceResetCause): void;
  /**
   * THE PHASE-10 INTERFACE COMPLETION (declared, the honest finding written
   * down): the Phase-4 hooks are face-parameterized and do not define what
   * a signature means with zero cells. In the Hollow each mechanic answers
   * that in its own module: Void/sec from nothing, at carried strength.
   * COMPOSITION: contributions SUM (they are income streams), then the
   * Silence mutes the total — see systems/absence.ts.
   */
  voidTick?(state: GameState, mods: ModifierCache, dt: number, strength: number): number;
}

export type FaceResetCause = 'descend' | 'collapse' | 'breach' | 'expand';

export interface SignatureDef {
  id: string;
  shellId: string;
  name: string;
  hooks: SignatureHooks;
}

const registry = new Map<string, SignatureDef>();

export function registerSignature(def: SignatureDef): void {
  if (registry.has(def.id)) throw new Error(`Duplicate signature: ${def.id}`);
  registry.set(def.id, def);
}

export function clearSignatures(): void {
  registry.clear();
}

export function signatureDef(id: string): SignatureDef {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown signature: ${id}`);
  return def;
}

export interface ActiveSignature {
  def: SignatureDef;
  strength: number;
  native: boolean;
}

/** Carried strength: 0.4 base, +0.15 per Resonant Memory level (Echo sink). */
export function carriedStrength(state: GameState): number {
  return CARRY_BASE * (1 + RESONANT_MEMORY_PER_LEVEL * state.shell.resonantMemory);
}

/** Carried (breach order), then native LAST — the documented override order. */
export function activeSignatures(state: GameState): ActiveSignature[] {
  const out: ActiveSignature[] = [];
  const nativeId = currentShell(state).signatureId;
  for (const id of state.shell.signatures) {
    if (id === nativeId) continue; // native supersedes its own carried copy
    const def = registry.get(id);
    if (def) out.push({ def, strength: carriedStrength(state), native: false });
  }
  if (nativeId) {
    const def = registry.get(nativeId);
    if (def) out.push({ def, strength: 1, native: true });
  }
  return out;
}

/** Composed yield multiplier for one chip; advances mechanic state. */
export function runChipMult(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  cell: number,
  manual: boolean,
): number {
  let mult = 1;
  for (const sig of activeSignatures(state)) {
    if (sig.def.hooks.chipMult) {
      mult *= sig.def.hooks.chipMult(state, mods, ctx, cell, sig.strength, manual);
    }
  }
  return mult;
}

export function runFaceTick(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  dt: number,
): void {
  for (const sig of activeSignatures(state)) {
    sig.def.hooks.onFaceTick?.(state, mods, ctx, dt, sig.strength);
  }
}

export function runFaceReset(state: GameState, cause: FaceResetCause): void {
  for (const sig of activeSignatures(state)) {
    sig.def.hooks.onFaceReset?.(state, sig.strength, cause);
  }
}

/** Hollow: the sum of every carried mechanic's meaning-in-nothing, Void/sec.
 * Every player here carries all five (breach order is fixed); investment
 * (Resonant Memory, masteries, each mechanic's own live state) is the size. */
export function runVoidTick(state: GameState, mods: ModifierCache, dt: number): number {
  let sum = 0;
  for (const sig of activeSignatures(state)) {
    if (sig.def.hooks.voidTick) sum += sig.def.hooks.voidTick(state, mods, dt, sig.strength);
  }
  return sum;
}
