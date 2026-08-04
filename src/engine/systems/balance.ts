/**
 * THE BALANCE — TRANSMUTATION (§14.4, §13, keystone at The Balance House 130).
 *
 * "One hidden worth per material makes the registry liquid. ProjectE's feeling
 * is 'the economy is solved,' and THAT EMOTION IS DELIBERATELY DAMPED HERE —
 * worth is strictly lossy (60%, improving to 35%) and generates nothing."
 *
 * WHY IT IS MANDATORY, in §14.4's own words: "every tier needs material from the
 * shell ABOVE, and once you Breach that shell is gone until Recursion. The
 * Balance is the only route back." §13 calls it the blocker on EVERY tier V+.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LOSS IS THE WHOLE DESIGN. If it converts without loss it is a faucet and
 * it fails, so the guarantee is stated as an inequality and tested as one over
 * every ordered pair in the registry: A -> B -> A returns STRICTLY FEWER units
 * than went in, at every tier, for every pair. There is no cycle anywhere in
 * the graph that gains, because every edge multiplies by a rate below one.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WORTH IS DERIVED, NEVER AUTHORED. A hand-written table of 176 numbers is 176
 * claims nobody can check; this is one formula anybody can. Rarity is the
 * spine of it — the six bands are the game's own statement of what is scarce —
 * and traits are a small premium on top, because a stone that answers more
 * questions is worth more than one that answers fewer.
 *
 * TIERS ARE CAPABILITY (§15.4), and the ladder is §14.4's own two numbers:
 *   I    40% crosses — a 60% loss — and WITHIN ONE SHELL only
 *   II   50%, and ACROSS SHELLS, which is the whole "mandatory because"
 *   III  65% — the 35% loss §14.4 improves to
 *
 * Tier II is the real capability rather than a better rate: reaching BACK into
 * a shell you have Breached is the thing nothing else in the game can do.
 *
 * PILLAR 2. A conversion is material for material at a loss. It cannot touch a
 * currency, cannot create a unit, and there is no path from this file to
 * `cellCap`, `cellRegen` or `chipYield`.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { MATERIALS, RARITIES, materialDef, type MaterialRarity } from '../materials';
import { traitsOf } from '../traits';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { machineSpeed } from './condition';
import { addMaterial, consumeMaterial, materialCount } from './forge';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';

/** The wreck it is found in — Glassmere, The Balance House 130 (§6). */
export const BALANCE_WRECK = 'THE BALANCE';

/**
 * WHAT A BAND IS WORTH. The six rarity gates already say what is scarce; these
 * are that statement as numbers, rising faster than the gates do because the
 * deep bands are rarer than their depth alone suggests.
 */
export const BAND_WORTH: Record<MaterialRarity, number> = {
  common: 1, rich: 4, pure: 14, flawless: 45, starred: 140, aberrant: 400,
};

/** A trait is a question the stone can answer. Small, and it compounds gently. */
export const TRAIT_PREMIUM = 0.15;

/** §14.4's two numbers: "strictly lossy (60%, improving to 35%)". */
export const BALANCE_RATE = [0, 0.40, 0.50, 0.65];

export const TIER_CAPABILITY_BALANCE = [
  'not built',
  '40% crosses, and only inside one shell',
  '50%, and it reaches into shells you have left',
  '65% — the best this bench ever gets',
] as const;

export interface BalanceState {
  /** materialId -> units ever put IN. §14.4's worth ledger. */
  ledger: Record<string, number>;
  /** Units ever lost to the bench — the damping, counted. */
  lost: number;
}

export function defaultBalanceState(): BalanceState {
  return { ledger: {}, lost: 0 };
}

export function ensureBalance(state: GameState): BalanceState {
  const b = (state.balance ??= defaultBalanceState());
  b.ledger ??= {};
  if (typeof b.lost !== 'number' || Number.isNaN(b.lost)) b.lost = 0;
  return b;
}

// ---------------------------------------------------------------------------
// Worth
// ---------------------------------------------------------------------------

/**
 * ONE HIDDEN WORTH PER MATERIAL (§14.4). Hidden in the sense that no panel
 * prints it as a number — what the player is shown is a RATE, which is the
 * thing they can act on. The formula is here so a later phase can argue with
 * it rather than with 176 hand-written values.
 */
export function worth(materialId: string): number {
  let def;
  try { def = materialDef(materialId); } catch { return 0; }
  const base = BAND_WORTH[def.rarity] ?? 1;
  const n = traitsOf(materialId).length;
  return base * (1 + TRAIT_PREMIUM * n);
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export function balanceStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === BALANCE_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function balanceFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === BALANCE_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function balanceBuilt(state: GameState): boolean {
  return tierOf(state, 'balance') > 0;
}

/** How much of the worth crosses. Never 1, at any tier, ever. */
export function balanceRate(state: GameState): number {
  return BALANCE_RATE[Math.min(tierOf(state, 'balance'), MAX_MACHINE_TIER)] ?? 0;
}

/** Tier II: it reaches into shells you have left — §14.4's "only route back". */
export function crossesShells(state: GameState): boolean {
  return tierOf(state, 'balance') >= 2;
}

export function nextBalanceTierCost(state: GameState): number | null {
  const t = tierOf(state, 'balance');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildBalance(state: GameState, ctx: EngineCtx): ActionResult {
  if (!balanceFound(state)) {
    const at = balanceStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Balance.' };
  }
  const cost = nextBalanceTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Balance is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'balance', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['balance'] = tierOf(state, 'balance') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'balance', tier: plant.tiers['balance']! });
  return { ok: true, data: { tier: plant.tiers['balance'] } };
}

// ---------------------------------------------------------------------------
// The conversion
// ---------------------------------------------------------------------------

export interface BalancePreview {
  /** Units of `to` this many units of `from` would buy. */
  out: number;
  /** ...and how many of them are needed for even one. */
  needed: number;
  rate: number;
  /** Units that simply vanish — the damping, made visible. */
  lost: number;
}

export function balancePreview(
  state: GameState, fromId: string, toId: string, units: number,
): BalancePreview {
  const rate = balanceRate(state);
  const wf = worth(fromId);
  const wt = worth(toId);
  if (wf <= 0 || wt <= 0 || rate <= 0) return { out: 0, needed: 0, rate, lost: units };
  const out = Math.floor((units * wf * rate) / wt);
  const needed = Math.max(1, Math.ceil(wt / (wf * rate)));
  // What the player PUT IN, minus what the output is worth, in input units.
  const spent = (out * wt) / wf;
  return { out, needed, rate, lost: Math.max(0, Math.round((units - spent) * 100) / 100) };
}

export function balanceBlocker(
  state: GameState, fromId: string, toId: string, units: number,
): string | null {
  if (!balanceBuilt(state)) return 'The Balance is not standing.';
  if (machineSpeed(state, 'balance') <= 0) return 'It has cracked. Re-cast it before it will run.';
  if (fromId === toId) return 'That is the same thing.';
  let from; let to;
  try { from = materialDef(fromId); to = materialDef(toId); } catch { return 'No such stone.'; }
  if (units < 1) return 'Put something in.';
  if (materialCount(state, fromId) < units) {
    return `The Hold has ${materialCount(state, fromId)} ${from.name}.`;
  }
  if (!crossesShells(state) && from.shellId !== to.shellId) {
    return `This Balance works inside one shell. ${from.name} is ${from.shellId}, ${to.name} is ${to.shellId}.`;
  }
  const p = balancePreview(state, fromId, toId, units);
  if (p.out < 1) {
    return `${units} ${from.name} is not enough for one ${to.name} — it wants ${p.needed}.`;
  }
  return null;
}

/**
 * PUT IT ON THE BENCH. Units in, fewer units of worth out, and the difference
 * is GONE — not banked, not refunded, not recoverable at a later tier.
 */
export function convert(
  state: GameState, ctx: EngineCtx, fromId: string, toId: string, units: number,
): ActionResult {
  const blocked = balanceBlocker(state, fromId, toId, units);
  if (blocked) return { ok: false, reason: blocked };
  const p = balancePreview(state, fromId, toId, units);
  consumeMaterial(state, fromId, units);
  addMaterial(state, toId, 45, p.out);
  // A CONVERSION IS NOT A FIND.
  state.materials.totalDrops -= p.out;

  const b = ensureBalance(state);
  b.ledger[fromId] = (b.ledger[fromId] ?? 0) + units;
  b.lost += p.lost;
  ctx.emit({ type: 'converted', fromId, toId, units, out: p.out });
  ctx.dirty();
  return { ok: true, data: { out: p.out, lost: p.lost } };
}

/**
 * WHAT THE LEDGER KNOWS. §14.4: "every conversion writes to your worth ledger,
 * and worth knowledge feeds the Assay Call". The WRITING is here; the Assay
 * Call hook is NOT wired, and that is ledgered rather than half-done — the
 * Call's weighting is a drop-economy seam and pointing a second system at it
 * without measuring is how a faucet arrives quietly.
 */
export function ledgerKnows(state: GameState): { id: string; name: string; units: number }[] {
  return Object.entries(ensureBalance(state).ledger)
    .map(([id, units]) => ({
      id,
      name: (() => { try { return materialDef(id).name; } catch { return id; } })(),
      units,
    }))
    .sort((a, b) => b.units - a.units);
}

/** Everything the Hold is holding that this Balance would take. */
export function convertible(state: GameState): string[] {
  return Object.keys(state.materials?.stacks ?? {})
    .filter((id) => materialCount(state, id) > 0 && worth(id) > 0)
    .sort((a, b) => worth(b) - worth(a));
}

/** ...and everything it could make, which is the whole registry it can reach. */
export function reachable(state: GameState, fromId: string): string[] {
  let from;
  try { from = materialDef(fromId); } catch { return []; }
  return MATERIALS
    .filter((m) => m.id !== fromId && worth(m.id) > 0
      && (crossesShells(state) || m.shellId === from.shellId))
    .map((m) => m.id);
}

export { RARITIES };
