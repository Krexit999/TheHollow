/**
 * TOOLS BUILT FROM PARTS — the headline of the "materials with souls" phase.
 *
 * A tool used to be a RECIPE: a fixed list of inputs that produced one fixed
 * item. Two tier-VIII picks were the same pick. Now a tool is an ASSEMBLY of a
 * HEAD, a HAFT and a BINDING, and each part reads DIFFERENT traits from its
 * material:
 *
 *   HEAD    meets the rock — reads EDGE (→ chip) and FORCE (→ strike).
 *   HAFT    is what you swing — reads HEFT (→ strike) and CADENCE (→ chip).
 *   BINDING holds it together — reads GRIP (→ sockets) and HOLD (→ rune hold).
 *
 * So the same trait pulls its weight in one part and sits quiet in another, and
 * the archetype of the tool — chip-heavy, strike-heavy, socket-rich — EMERGES
 * from what you chose rather than from an authored recipe. A keen head on a
 * light haft is a fast chip pick; a dense head on a dense haft is a strike
 * cleaver. Same tier, nothing alike.
 *
 * WHY THIS CANNOT GO LOPSIDED (the Phase 16 objection, dissolved): the variants
 * are not authored, so there is no ladder of ~40 recipes to keep balanced.
 * Every tier gets composition choice uniformly, for free.
 *
 * TIER STILL GATES WALLS. The HEAD is the business end that meets the rock, so
 * the head material's rarity+shell decides the highest tier the tool can be —
 * the curriculum law, restated. Haft and binding are a free composition choice.
 *
 * PILLAR 2: chip multiplies dustYield, which is bounded by field regen. A
 * min-maxed chip tool hits the ceiling faster; it cannot raise it.
 */
import { TIER_BASE } from './forge';
import { traitsOf, TRAITS, activePairs, type TraitId } from '../traits';
import { purityMult } from './forge';
import type { MaterialRarity } from '../materials';

export type PartSlot = 'head' | 'haft' | 'binding';
export const PART_SLOTS: PartSlot[] = ['head', 'haft', 'binding'];

export interface ToolPart {
  materialId: string;
  purity: number;
}
export interface ToolParts {
  head: ToolPart;
  haft: ToolPart;
  binding: ToolPart;
}

/**
 * COMPOSITION_NORM keeps the parts model in the same power band the authored
 * recipes lived in. A balanced three-material build lands near 1.0 on both
 * axes; the divisor is calibrated so a min-maxed build tops out around the old
 * recipe spread rather than inflating the ladder. Verified in
 * scripts/parts-verify.ts.
 */
const COMPOSITION_NORM = 1.12;

/** The product of one material's traits' factor for a given stat (default 1). */
function factor(materialId: string, stat: keyof typeof TRAITS['keen']['factors']): number {
  let v = 1;
  for (const t of traitsOf(materialId)) {
    const f = TRAITS[t].factors[stat];
    if (f !== undefined) v *= f;
  }
  return v;
}

/** Every trait present across all three parts — the set the pairs read. */
export function combinedTraits(parts: ToolParts): TraitId[] {
  return [
    ...traitsOf(parts.head.materialId),
    ...traitsOf(parts.haft.materialId),
    ...traitsOf(parts.binding.materialId),
  ];
}

export interface PartStats {
  chip: number;
  strike: number;
  sockets: number;
  /** Whole-tool multiplier from trait pairs — 1 if none active. */
  pairMult: number;
  /** The pairs that fired, for the Codex. */
  pairs: ReturnType<typeof activePairs>;
}

/**
 * The whole point, in one function. Head edge and haft cadence make chip; head
 * force and haft heft make strike; the binding adds sockets; the combined trait
 * set adds pair interactions.
 */
export function computePartStats(tier: number, parts: ToolParts): PartStats {
  const base = TIER_BASE[tier] ?? TIER_BASE[1]!;

  const headEdge = factor(parts.head.materialId, 'edge');
  const headForce = factor(parts.head.materialId, 'force');
  const haftHeft = factor(parts.haft.materialId, 'heft');
  const haftCadence = factor(parts.haft.materialId, 'cadence');
  const bindingGrip = factor(parts.binding.materialId, 'grip');

  const pairs = activePairs(combinedTraits(parts));
  const pairMult = pairs.reduce((acc, p) => acc * p.mult, 1);

  // The head matters most to purity, then the haft, then the binding.
  const avgPurity = parts.head.purity * 0.5 + parts.haft.purity * 0.3 + parts.binding.purity * 0.2;
  const pm = purityMult(avgPurity);

  const chip = (base.chip * headEdge * haftCadence) / COMPOSITION_NORM * pm * pairMult;
  const strike = (base.strike * headForce * haftHeft) / COMPOSITION_NORM * pm * pairMult;

  // A binding that grips well (hollow, charged) seats an extra stone.
  const socketBonus = bindingGrip >= 1.3 ? 1 : 0;

  return {
    chip: Math.round(chip * 100) / 100,
    strike: Math.round(strike * 10) / 10,
    sockets: base.sockets + socketBonus,
    pairMult,
    pairs,
  };
}

// ---------------------------------------------------------------------------
// Which tier a material can HEAD — the curriculum law, restated
// ---------------------------------------------------------------------------

const SHELL_INDEX: Record<string, number> = {
  loam: 0, ferrite: 1, verdance: 2, glassmere: 3, cinder: 4, hollow: 5, aleph: 6,
};

const RARITY_OFFSET: Record<MaterialRarity, number> = {
  common: 0, rich: 1, pure: 2, flawless: 2, starred: 2, aberrant: 2,
};

/**
 * The highest tool tier a material can be the HEAD of. Five shells span the
 * fifteen tiers three at a time (Loam I-III, Ferrite IV-VI, ...); Hollow and
 * Aleph clamp to the XV ceiling, which is the MAX_TOOL_TIER ruling.
 *
 * A haft or binding has no such gate — you may put a Marl haft on a Tier XV
 * pick if you want a very fast, very weak one.
 */
export function headTierCap(shellId: string, rarity: MaterialRarity): number {
  const shell = Math.min(SHELL_INDEX[shellId] ?? 0, 4);
  const tier = shell * 3 + 1 + RARITY_OFFSET[rarity];
  return Math.max(1, Math.min(15, tier));
}
