/**
 * KEYSTONES — the Breach gates (Progression & Differentiation, Part B).
 * A shell's floor is not just a depth: the way down through it must be SHORED,
 * and the shoring consumes the shell's headline system's output. This is the
 * unlock-chain ruling made structural: do the thing, which makes the thing,
 * which opens the floor.
 *
 * THE LOCKED CORRECTION (ruled): every keystone has an IDLE-REACHABLE leg.
 * A purely idle player crosses every gate, just slower — the Guild will haul
 * a keystone up for chip currency alone (no scrip, no visit, no system).
 * Pillar 1 does not bend for gating; the sim gate proves the leg, not this
 * comment.
 *
 * PERSISTENCE: a placed keystone is remembered FOREVER — through Collapse,
 * Breach, and Recursion, like a depth record. The gate exists to make each
 * shell's system load-bearing ONCE; pillar 6's re-peak clock never meets it
 * twice.
 *
 * STUBS (ruled): only Loam and Ferrite define keystones. A shell with no
 * KeystoneDef simply has no gate — the structure accommodates III–VII when
 * the creative pass lands, and a missing def can never softlock anything.
 */
import { D, type Decimal } from '../decimal';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { getCurrency, spendCurrency } from '../resources';
import { chipCurrencyId, currentShell } from '../shells';
import { descendCost } from '../prestigeMath';
import { consumeMaterial, materialCount } from './forge';

export interface KeystoneDef {
  shellId: string;
  name: string;
  flavor: string;
  /** The engaged leg — consumes the shell's headline output. */
  craft: {
    materials?: Array<{ id: string; count: number }>;
    currencies?: Array<{ id: string; amount: number }>;
    /** One line naming where the inputs come from (shown as the recipe's source). */
    source: string;
  };
  /** The idle leg — chip currency only, priced as a multiple of the floor
   *  step's descend cost. RATIO-TUNED (A.40 close-out): at 3× the pure-idle
   *  wait measured 6–12× the active crossing — a wall in spirit. At 1× (the
   *  last step again ≈ 8% of the descent already paid) the ratio is ~2–4×:
   *  slower, never walled. Keep new keystones at 1 unless a sim argues. */
  idlePriceMult: number;
}

const KEYSTONES = new Map<string, KeystoneDef>();

export function registerKeystone(def: KeystoneDef): void {
  if (KEYSTONES.has(def.shellId)) throw new Error(`Duplicate keystone for ${def.shellId}`);
  KEYSTONES.set(def.shellId, def);
}

export function clearKeystones(): void {
  KEYSTONES.clear();
}

export function keystoneFor(shellId: string): KeystoneDef | undefined {
  return KEYSTONES.get(shellId);
}

export function allKeystones(): KeystoneDef[] {
  return [...KEYSTONES.values()];
}

/** The idle leg's price, in the shell's own chip currency. */
export function keystoneIdlePrice(state: GameState, def: KeystoneDef): Decimal {
  const shell = currentShell(state);
  return descendCost(shell.floorDepth).mul(def.idlePriceMult);
}

export function keystonePlaced(state: GameState, shellId: string): boolean {
  return state.keystones.placed.includes(shellId);
}

/** The breach gate: no def = no gate (the stub guarantee, and the no-softlock one). */
export function keystoneSatisfied(state: GameState): boolean {
  const def = KEYSTONES.get(currentShell(state).id);
  return !def || keystonePlaced(state, def.shellId);
}

export function placeKeystone(
  state: GameState,
  ctx: EngineCtx,
  leg: 'craft' | 'buy',
): ActionResult {
  const shell = currentShell(state);
  const def = KEYSTONES.get(shell.id);
  if (!def) return { ok: false, reason: 'This floor needs no shoring' };
  if (keystonePlaced(state, shell.id)) return { ok: false, reason: 'Already set. It will hold forever' };

  if (leg === 'craft') {
    for (const m of def.craft.materials ?? []) {
      if (materialCount(state, m.id) < m.count) {
        return { ok: false, reason: `Wants ${m.count} ${m.id} — ${def.craft.source}` };
      }
    }
    for (const c of def.craft.currencies ?? []) {
      if (getCurrency(state, c.id).lt(c.amount)) {
        return { ok: false, reason: `Wants ${c.amount} ${c.id} — ${def.craft.source}` };
      }
    }
    for (const m of def.craft.materials ?? []) consumeMaterial(state, m.id, m.count);
    for (const c of def.craft.currencies ?? []) spendCurrency(state, c.id, D(c.amount));
  } else {
    const price = keystoneIdlePrice(state, def);
    if (!spendCurrency(state, chipCurrencyId(state), price)) {
      return { ok: false, reason: `The Guild will haul one up for ${price.toExponential(2)} — the slow road is never shut` };
    }
  }
  state.keystones.placed.push(shell.id);
  ctx.dirty();
  ctx.emit({ type: 'keystonePlaced', shellId: shell.id, leg });
  return { ok: true, data: { shellId: shell.id, leg } };
}

export function defaultKeystonesState(): GameState['keystones'] {
  return { placed: [] };
}

// ---------------------------------------------------------------------------
// The two reference keystones (Loam + Ferrite). III–VII: creative pass.
// ---------------------------------------------------------------------------

export function registerReferenceKeystones(): void {
  registerKeystone({
    shellId: 'loam',
    name: 'The Brick Arch',
    flavor: 'The floor of a world is a doorway if you shore it. The Kiln has been making doorway all along.',
    craft: {
      currencies: [{ id: 'brick', amount: 60 }],
      source: 'the Kiln fires Brick from Dust',
    },
    idlePriceMult: 1,
  });
  registerKeystone({
    shellId: 'ferrite',
    name: 'The Cast Anchor',
    flavor: 'Iron all the way down wants iron to hold it open. Poured, not found.',
    craft: {
      materials: [{ id: 'steelcasting', count: 1 }],
      currencies: [{ id: 'scale', amount: 40 }],
      source: 'the Crucible casts from a discovered alloy',
    },
    idlePriceMult: 1,
  });
}

