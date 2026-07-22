/**
 * Generic data-driven upgrade system.
 *
 * Cost of the (n+1)-th level is base * r^n, so buying the first n levels
 * totals base * (r^n - 1) / (r - 1) — the locked formula from DESIGN.md.
 * Content declares upgrades as data; effects are modifier registrations or
 * onPurchase hooks, never engine special-cases.
 */
import { D, Decimal, log10D } from './decimal';
import type { GameState } from './types';

export interface UpgradeDef {
  id: string;
  name: string;
  description: (level: number) => string;
  currency: string;
  baseCost: Decimal;
  /** Cost ratio r. Spam 1.15 / Standard 1.25 / Structural 1.75 / Tree 1.55. */
  ratio: number;
  maxLevel: number;
  /** Wiped by Collapse (face upgrades). Structures (kiln, drills) survive. */
  resetsOnCollapse: boolean;
  /** Gate: hidden from UI and unpurchasable until this passes. */
  visible?: (state: GameState) => boolean;
  /** Called after levels are added (e.g. drill count spawns drill units). */
  onPurchase?: (state: GameState, levelsBought: number) => void;
}

const registry = new Map<string, UpgradeDef>();

export function registerUpgrade(def: UpgradeDef): void {
  if (registry.has(def.id)) throw new Error(`Duplicate upgrade id: ${def.id}`);
  registry.set(def.id, def);
}

export function clearUpgrades(): void {
  registry.clear();
}

export function allUpgrades(): UpgradeDef[] {
  return [...registry.values()];
}

export function upgradeDef(id: string): UpgradeDef {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown upgrade: ${id}`);
  return def;
}

export function upgradeLevel(state: GameState, id: string): number {
  return state.upgrades[id] ?? 0;
}

/** Cost of a single level when `level` levels are already owned. */
export function nextCost(def: UpgradeDef, level: number): Decimal {
  return def.baseCost.mul(Decimal.pow(def.ratio, level));
}

/** totalCost(n) = base * (r^n - 1) / (r - 1) — cost of the first n levels.
 *  Degenerates to base * n when r = 1 (one-off structures). */
export function totalCost(def: UpgradeDef, n: number): Decimal {
  if (def.ratio === 1) return def.baseCost.mul(n);
  return def.baseCost.mul(Decimal.pow(def.ratio, n).sub(1)).div(def.ratio - 1);
}

/** Cost of `count` levels starting from `level` already owned. */
export function costForLevels(def: UpgradeDef, level: number, count: number): Decimal {
  return totalCost(def, level + count).sub(totalCost(def, level));
}

/**
 * Max levels affordable with `budget`, starting at `level` owned.
 * Closed-form via logs, then corrected — no loops over huge counts.
 */
export function maxAffordable(def: UpgradeDef, level: number, budget: Decimal): number {
  const headroom = def.maxLevel - level;
  if (headroom <= 0 || budget.lte(0)) return 0;
  const first = nextCost(def, level);
  if (budget.lt(first)) return 0;
  if (def.ratio === 1) {
    return Math.min(headroom, Math.floor(budget.div(def.baseCost).toNumber()));
  }
  // budget >= first * (r^k - 1)/(r - 1)  =>  k <= log_r(budget*(r-1)/first + 1)
  const x = budget.mul(def.ratio - 1).div(first).add(1);
  let k = Math.floor(log10D(x) / Math.log10(def.ratio));
  // Float-edge correction.
  while (k > 0 && costForLevels(def, level, k).gt(budget)) k--;
  while (k < headroom && costForLevels(def, level, k + 1).lte(budget)) k++;
  return Math.min(k, headroom);
}

/** Convenience: "the Blade stat" etc. for formulas that name upgrade levels. */
export function stat(state: GameState, id: string): number {
  return upgradeLevel(state, id);
}

export const Dcost = D; // re-export sugar for content files
