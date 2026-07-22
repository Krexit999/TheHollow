/**
 * POLARITY — Ferrite's signature. Every cell is + or −. Chipping like-signed
 * cells consecutively multiplies exponentially; breaking the chain halves the
 * breaking chip. Clicking becomes routing.
 *
 *   chain multiplier for the Nth chained chip = base^(min(N,12) − 1)
 *   base = 1 + 0.35 × strength × chainPower-bucket   (native: 1.35)
 *
 * A 6-chain pays ~1.9× two 3-chains at native strength — planning beats
 * mashing. Chains are MANUAL-only: drills neither extend nor break them
 * (automation must not trash the player's route); Ferrite drills scrape
 * Scale instead (shell byproduct, data-driven).
 *
 * THE MAGNET ARRAY (Ferrite Mastery 4): column magnets bias every re-roll in
 * their column 85% toward the chosen pole — determinism, purchased.
 */
import { D, Decimal } from '../decimal';
import type { ModifierCache } from '../modifiers';
import { addCurrency, spendCurrency } from '../resources';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { registerSignature } from '../signatures';
import { masteryLevel } from './mastery';
import { lawFlag } from '../laws';

export const CHAIN_CAP = 12;
export const CHAIN_BREAK_PENALTY = 0.5;
export const CHAIN_TIMEOUT_SEC = 4;
export const MAGNET_BIAS = 0.85;
export const MAGNET_COST_BASE = 40; // Scale, structural 1.75 per magnet owned
export const MAGNET_MASTERY = 4;
export const LODESTONE_CHAIN_MIN = 5;

export function defaultPolarityState(): GameState['polarity'] {
  return {
    signs: [],
    chain: 0,
    lastSign: 0,
    lastChipAtSec: 0,
    bestChain: 0,
    magnets: [],
    magnetCount: 0,
  };
}

function rollSign(state: GameState, cell: number): number {
  const col = cell % state.face.w;
  const pole = state.polarity.magnets[col] ?? 0;
  if (pole !== 0 && Math.random() < MAGNET_BIAS) return pole;
  return Math.random() < 0.5 ? 1 : -1;
}

/** Keep the sign array in step with the face (expansion, rebuilds). */
export function ensurePolarity(state: GameState): void {
  const pol = state.polarity;
  const n = state.face.cells.length;
  while (pol.signs.length < n) pol.signs.push(rollSign(state, pol.signs.length));
  if (pol.signs.length > n) pol.signs.length = n;
  const w = state.face.w;
  while (pol.magnets.length < w) pol.magnets.push(0);
  if (pol.magnets.length > w) pol.magnets.length = w;
}

export function rerollAllSigns(state: GameState): void {
  ensurePolarity(state);
  for (let i = 0; i < state.polarity.signs.length; i++) {
    state.polarity.signs[i] = rollSign(state, i);
  }
}

export function chainBase(state: GameState, mods: ModifierCache, strength: number): number {
  return 1 + 0.35 * strength * mods.get(state, 'chainPower').toNumber();
}

/** The multiplier the NEXT chip would get if it continued the chain. */
export function nextChainMult(state: GameState, mods: ModifierCache, strength: number): number {
  const n = Math.min(state.polarity.chain + 1, CHAIN_CAP);
  return Math.pow(chainBase(state, mods, strength), n - 1);
}

function polarityChipMult(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  cell: number,
  strength: number,
  manual: boolean,
): number {
  ensurePolarity(state);
  if (!manual) return 1; // drills don't engage the chain, either way
  const pol = state.polarity;
  const sign = pol.signs[cell] ?? 1;

  let mult: number;
  if (pol.chain === 0 || sign === pol.lastSign) {
    pol.chain = Math.min(pol.chain + 1, CHAIN_CAP);
    mult = Math.pow(chainBase(state, mods, strength), pol.chain - 1);
    if (pol.chain > pol.bestChain) pol.bestChain = pol.chain;
    if (pol.chain >= LODESTONE_CHAIN_MIN) {
      // Long chains shed Lodestone — scaled by signature strength so carried
      // polarity keeps old currencies alive in later shells (by design).
      addCurrency(state, 'lodestone', D(strength));
    }
  } else {
    // The chain snaps: this chip pays half, and the chain restarts on it.
    mult = CHAIN_BREAK_PENALTY;
    pol.chain = 1;
    ctx.emit({ type: 'chainBroken', at: cell });
  }
  pol.lastSign = sign;
  pol.lastChipAtSec = state.stats.playTimeSec;
  ctx.emit({ type: 'chainChip', cell, chain: pol.chain, mult });

  // The chipped cell re-rolls — the board evolves under your route.
  pol.signs[cell] = rollSign(state, cell);
  return mult;
}

function polarityFaceTick(
  state: GameState,
  _mods: ModifierCache,
  _ctx: EngineCtx,
  _dt: number,
  _strength: number,
): void {
  const pol = state.polarity;
  if (pol.chain > 0 && state.stats.playTimeSec - pol.lastChipAtSec > CHAIN_TIMEOUT_SEC) {
    pol.chain = 0;
    pol.lastSign = 0;
  }
}

export function registerPolarity(): void {
  registerSignature({
    id: 'polarity',
    shellId: 'ferrite',
    name: 'Polarity',
    hooks: {
      chipMult: polarityChipMult,
      onFaceTick: polarityFaceTick,
      // In the Hollow: the silence strata carry signs; your best chain is
      // the rhythm you taught the field, and it hums here without rock.
      voidTick: (s, _m, _dt, strength) =>
        0.4 * strength * (1 + 0.04 * Math.min(30, s.polarity.bestChain)) * (1 + 0.08 * masteryLevel(s, 'ferrite')),
      onFaceReset: (state, _strength, cause) => {
        rerollAllSigns(state);
        // THE IRON MEMORY (law): a chain rides the stair down with you.
        if (cause === 'descend' && lawFlag(state, 'chainPersistDescend')) return;
        state.polarity.chain = 0;
        state.polarity.lastSign = 0;
      },
    },
  });
}

// ---------------------------------------------------------------------------
// The Magnet Array
// ---------------------------------------------------------------------------

export function magnetArrayUnlocked(state: GameState): boolean {
  return masteryLevel(state, 'ferrite') >= MAGNET_MASTERY;
}

export function magnetCost(state: GameState): Decimal {
  return D(MAGNET_COST_BASE).mul(Decimal.pow(1.75, state.polarity.magnetCount));
}

/** Buy the next magnet, left to right. Costs Scale (structural curve). */
export function buyMagnet(state: GameState, ctx: EngineCtx): ActionResult {
  if (!magnetArrayUnlocked(state)) {
    return { ok: false, reason: `The Magnet Array answers to Ferrite Mastery ${MAGNET_MASTERY}` };
  }
  ensurePolarity(state);
  const col = state.polarity.magnetCount;
  if (col >= state.face.w) return { ok: false, reason: 'Every column is rigged' };
  if (!spendCurrency(state, 'scale', magnetCost(state))) {
    return { ok: false, reason: 'Not enough Scale' };
  }
  state.polarity.magnetCount += 1;
  state.polarity.magnets[col] = 1; // starts +, toggle freely
  ctx.dirty();
  return { ok: true, data: { column: col } };
}

/** Cycle a magnetized column: + -> − -> off -> + (off keeps it owned). */
export function toggleMagnet(state: GameState, col: number): ActionResult {
  ensurePolarity(state);
  if (col < 0 || col >= state.polarity.magnetCount) return { ok: false, reason: 'No magnet there' };
  const cur = state.polarity.magnets[col] ?? 0;
  state.polarity.magnets[col] = cur === 1 ? -1 : cur === -1 ? 0 : 1;
  return { ok: true, data: { pole: state.polarity.magnets[col] } };
}
