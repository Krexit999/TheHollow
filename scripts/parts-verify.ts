/**
 * PARTS BALANCE VERIFICATION.
 *
 * The parts model reworks a shipped axis and touches balance in every shell,
 * so the brief demands it be sim-verified. Three questions:
 *
 *   1. Does a BALANCED build land in the same power band the authored recipes
 *      lived in? (No accidental inflation or deflation of the ladder.)
 *   2. Are chip-max and strike-max builds roughly SYMMETRIC — is specialising
 *      a real trade, not a free win in one direction?
 *   3. Does the head-tier gate hold, so composition never lets you skip a wall?
 *
 *   npx tsx scripts/parts-verify.ts
 */
import { ensureContentLoaded } from '../src/engine/content';
ensureContentLoaded();
import { TOOL_RECIPES, TIER_BASE, computeStats } from '../src/engine/systems/forge';
import { computePartStats, headTierCap } from '../src/engine/systems/toolParts';
import { MATERIALS, materialDef } from '../src/engine/materials';
import { traitsOf } from '../src/engine/traits';

let failures = 0;
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const P = 60; // a fair-purity build, to compare like with like

/** Best chip / best strike / most balanced composition for a tier, from real
 * materials that can head it. */
function extremes(tier: number) {
  const heads = MATERIALS.filter((m) => !m.worked && m.source !== 'combat' && headTierCap(m.shellId, m.rarity) >= tier);
  const all = MATERIALS.filter((m) => !m.worked && m.source !== 'combat');
  let bestChip = 0, bestStrike = 0, neutralScore = Infinity, balancedChip = 0, balancedStrike = 0;
  // Sample compositions: head from heads, haft+binding from all (bounded sample).
  const sample = all.slice(0, 60);
  for (const h of heads.slice(0, 40)) {
    for (const f of sample) {
      for (const b of sample.slice(0, 20)) {
        const parts = {
          head: { materialId: h.id, purity: P },
          haft: { materialId: f.id, purity: P },
          binding: { materialId: b.id, purity: P },
        };
        const s = computePartStats(tier, parts);
        bestChip = Math.max(bestChip, s.chip);
        bestStrike = Math.max(bestStrike, s.strike);
        // "Balanced" means closest to NEUTRAL (1.0 on both axes) — not merely
        // closest chip-to-strike, which a mediocre-both build would win.
        const cr = s.chip / TIER_BASE[tier]!.chip;
        const sr = s.strike / TIER_BASE[tier]!.strike;
        const score = Math.abs(cr - 1) + Math.abs(sr - 1);
        if (score < neutralScore) { neutralScore = score; balancedChip = s.chip; balancedStrike = s.strike; }
      }
    }
  }
  return { bestChip, bestStrike, balancedChip, balancedStrike };
}

console.log('\nPARTS BALANCE — verification\n');

// --- 1. Balanced builds stay in the recipe power band -----------------------
console.log('1. does a balanced build match the old recipe power band?');
for (const tier of [1, 2, 3, 5, 8, 11, 14]) {
  const recipes = TOOL_RECIPES.filter((r) => r.tier === tier);
  if (recipes.length === 0) continue;
  // Old recipe chip range at fair purity.
  const recChips = recipes.map((r) => computeStats(r, P).chip);
  const recStrikes = recipes.map((r) => computeStats(r, P).strike);
  const recChipMid = recChips.reduce((a, b) => a + b, 0) / recChips.length;
  const { balancedChip } = extremes(tier);
  // Balanced parts build should be within ~35% of the recipe midpoint.
  const ratio = balancedChip / recChipMid;
  check(
    ratio > 0.6 && ratio < 1.45,
    `T${tier} balanced chip in band`,
    `parts ${balancedChip.toFixed(2)} vs recipes ~${recChipMid.toFixed(2)} (×${ratio.toFixed(2)})`,
  );
  void recStrikes;
}

// --- 2. Specialising is a real trade ----------------------------------------
console.log('\n2. is specialising symmetric — chip-max ≈ strike-max in total power?');
for (const tier of [2, 5, 8, 11]) {
  const { bestChip, bestStrike, balancedChip, balancedStrike } = extremes(tier);
  // Normalise each axis by its tier base, then compare the peak specialisations.
  const chipPeak = bestChip / TIER_BASE[tier]!.chip;
  const strikePeak = bestStrike / TIER_BASE[tier]!.strike;
  const sym = Math.min(chipPeak, strikePeak) / Math.max(chipPeak, strikePeak);
  check(sym > 0.7, `T${tier} chip-max and strike-max are comparable`, `chip×${chipPeak.toFixed(2)} strike×${strikePeak.toFixed(2)} (sym ${sym.toFixed(2)})`);
  // And a max build genuinely beats a balanced one on its axis (specialising pays).
  check(bestChip > balancedChip * 1.15, `T${tier} chip-max beats balanced`, `${bestChip.toFixed(2)} vs ${balancedChip.toFixed(2)}`);
  void balancedStrike;
}

// --- 3. The head gate holds -------------------------------------------------
console.log('\n3. does the head-tier gate hold (no skipping walls)?');
{
  // A Loam common can never head past Tier I; a Cinder pure can reach XV.
  check(headTierCap('loam', 'common') === 1, 'Loam common heads Tier I only');
  check(headTierCap('loam', 'starred') === 3, 'Loam starred heads Tier III');
  check(headTierCap('ferrite', 'common') === 4, 'Ferrite common heads Tier IV');
  check(headTierCap('cinder', 'pure') === 15, 'Cinder pure heads the ceiling');
  // No material heads above XV.
  const over = MATERIALS.filter((m) => headTierCap(m.shellId, m.rarity) > 15);
  check(over.length === 0, 'nothing heads above Tier XV', over.map((m) => m.id).join(', '));
}

// --- 4. The Shell I test, mechanically --------------------------------------
console.log('\n4. the Shell I test: two different Tier-II tools from Loam alone?');
{
  // A chip pick: keen head (loamiron) + light haft (marl).
  const pick = computePartStats(2, {
    head: { materialId: 'loamiron', purity: P },
    haft: { materialId: 'marl', purity: P },
    binding: { materialId: 'ochre', purity: P },
  });
  // A strike cleaver: keen-dense head (duskflint) + dense haft (graveclay).
  const cleaver = computePartStats(2, {
    head: { materialId: 'duskflint', purity: P },
    haft: { materialId: 'graveclay', purity: P },
    binding: { materialId: 'ochre', purity: P },
  });
  console.log(`      Loamiron pick:   chip ×${pick.chip.toFixed(2)}  strike ${pick.strike.toFixed(1)}  (${traitsOf('loamiron').join('+')} / ${traitsOf('marl').join('+')})`);
  console.log(`      Duskflint cleaver: chip ×${cleaver.chip.toFixed(2)}  strike ${cleaver.strike.toFixed(1)}  (${traitsOf('duskflint').join('+')} / ${traitsOf('graveclay').join('+')})`);
  check(pick.chip > cleaver.chip, 'the pick out-chips the cleaver');
  check(cleaver.strike > pick.strike, 'the cleaver out-strikes the pick');
  // "Genuinely different" — at least a 25% swing on each axis.
  check(pick.chip / cleaver.chip > 1.25, 'the chip difference is felt', `${(pick.chip / cleaver.chip).toFixed(2)}×`);
  check(cleaver.strike / pick.strike > 1.25, 'the strike difference is felt', `${(cleaver.strike / pick.strike).toFixed(2)}×`);
  void materialDef;
}

console.log(failures === 0 ? '\nPARTS BALANCE VERIFIED ✓' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
