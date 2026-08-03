/**
 * GEAR — the runtime. Three slots, and the swap is gated on standing at a REST.
 *
 * THE GATE HAD NO DOOR UNTIL THIS PASS. `rest` has been in `StationType` since
 * the Roll was built and Loam's fifteen stations never used it, so a REST-only
 * rule would have refused every swap forever — a system that cannot be used,
 * behind a refusal that always fires. Two REST stations are authored into the
 * Loam Roll alongside this (`content/shell1/roll.ts`), and `gear.test.ts`
 * asserts the shell HAS at least one, so the gate can never go doorless again.
 *
 * PILLAR 2: every effect below is read at a call site that touches legibility,
 * the hand's own work, or where the machines go. None is an input to
 * `dpsMax = W·H·regen·Y`.
 */
import type { GameState } from '../types';
import { GEAR_SLOTS, gearDef, gearInWreck, type GearSlot } from '../content/shell1/gear';
import { shellRoll } from './roll';

export interface GearState {
  /** slot -> gear id. Absent = empty, which is the opening loadout. */
  worn: Partial<Record<GearSlot, string>>;
  /** Everything ever found. Survives the fall — kit is not rock. */
  owned: string[];
}

export function defaultGearState(): GearState {
  return { worn: {}, owned: [] };
}

export function ensureGear(state: GameState): GearState {
  const g = (state.gear ??= defaultGearState());
  g.worn ??= {};
  g.owned ??= [];
  return g;
}

/** How far from a REST station still counts as standing at it. */
export const REST_BAND = 4;

/**
 * Standing at a REST. A BAND rather than an exact depth, because depth moves in
 * whole steps and a station at 33 that you can only use while sitting exactly on
 * 33 is a refusal wearing a permission's clothes.
 */
export function atRest(state: GameState): { ok: boolean; station?: string } {
  for (const def of shellRoll(state)) {
    if (def.type !== 'rest') continue;
    if (Math.abs(state.depth - def.depth) <= REST_BAND) return { ok: true, station: def.name };
  }
  return { ok: false };
}

/** The nearest REST, for the panel to point at when it refuses. */
export function nearestRest(state: GameState): { name: string; depth: number } | null {
  let best: { name: string; depth: number } | null = null;
  for (const def of shellRoll(state)) {
    if (def.type !== 'rest') continue;
    if (!best || Math.abs(state.depth - def.depth) < Math.abs(state.depth - best.depth)) {
      best = { name: def.name, depth: def.depth };
    }
  }
  return best;
}

export function owns(state: GameState, id: string): boolean {
  return state.gear?.owned?.includes(id) ?? false;
}

/** Is this piece being worn right now? THE ONLY READER for every effect. */
export function wearing(state: GameState, id: string): boolean {
  const g = state.gear?.worn;
  if (!g) return false;
  for (const slot of GEAR_SLOTS) if (g[slot] === id) return true;
  return false;
}

export function wornIn(state: GameState, slot: GearSlot): string | null {
  return state.gear?.worn?.[slot] ?? null;
}

/**
 * A WRECK HANDS YOU WHAT WAS IN IT, once. Called from the descent's
 * `markReached`, which is already the one place a wreck becomes looted — so
 * there is no second rule about when kit appears.
 */
export function grantWreckGear(state: GameState, wreckId: string): string | null {
  const def = gearInWreck(wreckId);
  if (!def) return null;
  const g = ensureGear(state);
  if (g.owned.includes(def.id)) return null;
  g.owned.push(def.id);
  return def.id;
}

export interface GearResult { ok: boolean; reason?: string }

/**
 * SWAP. Refuses anywhere but a REST — that refusal IS the mechanic, so it names
 * where to go rather than just saying no.
 */
export function equipGear(state: GameState, id: string | null, slot: GearSlot): GearResult {
  const g = ensureGear(state);
  const rest = atRest(state);
  if (!rest.ok) {
    const near = nearestRest(state);
    return {
      ok: false,
      reason: near
        ? `Not here. Kit changes at a rest — ${near.name}, depth ${near.depth}.`
        : 'Not here. Kit changes at a rest, and this shell has none.',
    };
  }
  if (id === null) { delete g.worn[slot]; return { ok: true }; }
  const def = gearDef(id);
  if (!def) return { ok: false, reason: 'No such kit' };
  if (def.slot !== slot) return { ok: false, reason: `${def.name} is not worn there` };
  if (!g.owned.includes(id)) return { ok: false, reason: 'You do not have that' };
  // Worn elsewhere? Nothing can be in two slots, but a re-equip of the same
  // piece into its own slot is a no-op rather than an error.
  g.worn[slot] = id;
  return { ok: true };
}
