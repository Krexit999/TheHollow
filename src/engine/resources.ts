/**
 * Resource registry. Currencies are declared as data, not hardcoded fields —
 * adding one is a single registerCurrency() line in a content file. Balances
 * live in state.currencies keyed by id.
 */
import { D, Decimal, ZERO } from './decimal';
import type { GameState } from './types';

export type CurrencyTier = 'shell' | 'craft' | 'reset' | 'meta';

export interface CurrencyDef {
  id: string;
  name: string;
  tier: CurrencyTier;
  /** Hex color for the UI. */
  color: string;
  description: string;
  /** Wiped by Collapse? (shell-local currencies are; reset/meta are not) */
  resetsOnCollapse: boolean;
}

const registry = new Map<string, CurrencyDef>();

export function registerCurrency(def: CurrencyDef): void {
  if (registry.has(def.id)) throw new Error(`Duplicate currency id: ${def.id}`);
  registry.set(def.id, def);
}

export function clearCurrencies(): void {
  registry.clear();
}

export function allCurrencies(): CurrencyDef[] {
  return [...registry.values()];
}

export function currencyDef(id: string): CurrencyDef {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown currency: ${id}`);
  return def;
}

export function getCurrency(state: GameState, id: string): Decimal {
  return state.currencies[id] ?? ZERO;
}

export function getTotal(state: GameState, id: string): Decimal {
  return state.totals[id] ?? ZERO;
}

/** Add to a balance and to the lifetime total. */
export function addCurrency(state: GameState, id: string, amount: Decimal, countsAsEarned = true): void {
  if (amount.lte(0)) return;
  state.currencies[id] = getCurrency(state, id).add(amount);
  // Converted wealth (the Caravan) moves balances without inflating lifetime
  // earnings — achievements and fair-rate math read totals as EARNED.
  if (countsAsEarned) state.totals[id] = getTotal(state, id).add(amount);
}

/** Spend if affordable. Returns false (and changes nothing) otherwise. */
export function spendCurrency(state: GameState, id: string, amount: Decimal): boolean {
  const have = getCurrency(state, id);
  if (have.lt(amount)) return false;
  state.currencies[id] = have.sub(amount);
  return true;
}

export function canAfford(state: GameState, id: string, amount: Decimal): boolean {
  return getCurrency(state, id).gte(amount);
}

/** Fresh zero balances for every registered currency. */
export function initialBalances(): Record<string, Decimal> {
  const out: Record<string, Decimal> = {};
  for (const def of registry.values()) out[def.id] = D(0);
  return out;
}
