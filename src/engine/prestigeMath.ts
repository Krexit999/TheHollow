/**
 * The locked prestige formulas from DESIGN.md. Cores are live in Phase 1;
 * Echoes / Axioms / Spiral are implemented and tested now so later phases
 * inherit verified math, but nothing calls them yet.
 */
import { D, Decimal } from './decimal';

/** Cores = floor(2 * (Depth / 40)^1.5) */
export function coresForDepth(depth: number): Decimal {
  if (depth <= 0) return D(0);
  return D(Math.floor(2 * Math.pow(depth / 40, 1.5)));
}

/** Echoes = floor(3 * (CoresEarnedThisBreach / 500)^0.6) — Phase 4+. */
export function echoesForCores(coresThisBreach: Decimal): Decimal {
  if (coresThisBreach.lte(0)) return D(0);
  const ratio = coresThisBreach.div(500);
  return Decimal.pow(ratio, 0.6).mul(3).floor();
}

/** Axioms = floor((TotalEchoes / 25)^0.8) — Phase 7+. */
export function axiomsForEchoes(totalEchoes: Decimal): Decimal {
  if (totalEchoes.lte(0)) return D(0);
  return Decimal.pow(totalEchoes.div(25), 0.8).floor();
}

/** Spiral = floor(sqrt(TotalAxioms) * RecursionCount) — endgame. */
export function spiralFor(totalAxioms: Decimal, recursionCount: number): Decimal {
  if (totalAxioms.lte(0) || recursionCount <= 0) return D(0);
  return totalAxioms.sqrt().mul(recursionCount).floor();
}

/**
 * dustCost(d) = 25 · 1.09^min(d,150) · 1.04^max(0, d−150) — THE DEEP TAPER
 * (macro-tuning pass, amended openly in Appendix A.16, not silently).
 *
 * The locked 1.09 spine holds for a shell's first 150 depths, so every
 * measured early beat — the 4s first upgrade, the 8-minute first Collapse,
 * the whole Loam arc — is bit-identical. Past 150 the tail compounds at
 * 1.04: a 100-depth tail costs ×50 instead of ×5,529, which is what one
 * shell's actual multiplier machinery (Blade + core ladder + upgrades,
 * ~×10³ per shell) can bridge at Breach cadence. The old uniform curve made
 * every shell after Loam a 30-hour asymptote; the diagnosis run has the
 * numbers.
 */
export const DEEP_TAPER_START = 150;
export const DEEP_TAPER_RATIO = 1.035;
export const ABYSS_TAPER_START = 300;
export const ABYSS_TAPER_RATIO = 1.02;

export function descendCost(targetDepth: number): Decimal {
  const spine = Math.min(targetDepth, DEEP_TAPER_START);
  const deep = Math.max(0, Math.min(targetDepth, ABYSS_TAPER_START) - DEEP_TAPER_START);
  const abyss = Math.max(0, targetDepth - ABYSS_TAPER_START);
  return D(25)
    .mul(Decimal.pow(1.09, spine))
    .mul(Decimal.pow(DEEP_TAPER_RATIO, deep))
    .mul(Decimal.pow(ABYSS_TAPER_RATIO, abyss));
}

/** xpToLevel(L) = 100 * L^1.9 — XP needed to go from L-1 to L. Cap L200. */
export function xpToLevel(level: number): Decimal {
  return D(100).mul(Math.pow(level, 1.9));
}

export const LEVEL_CAP = 200;

/** offlineEfficiency = 0.55 + 0.03 * Persistence, clamped to 0.95. */
export function offlineEfficiency(persistenceBonus: number): number {
  return Math.min(0.95, 0.55 + persistenceBonus);
}
