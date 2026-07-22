/**
 * MARROW'S EYE (Phase 21) — the forge-master looks over a build before you spend.
 *
 * He reacts to what he can SEE: a haft too soft for its head, a poor grade of
 * stone, a pairing that drags. He is not an oracle. PILLAR 5: an interaction the
 * player has not yet discovered he can FEEL but will not NAME — "something in
 * this fights itself" — exactly as the bench preview says "something grinds."
 * A pairing already in the Codex he names, because it is no longer a secret.
 *
 * Pure and headless: takes ids and reads state; returns lines for the UI.
 */
import type { GameState } from '../types';
import { BANDS, materialDef, RARITIES } from '../materials';
import { activePairs, traitsOf } from '../traits';

/** Average purity of everything held of a material, across bands (0 if none). */
function heldAvgPurity(state: GameState, id: string): number {
  const perBand = state.materials.stacks[id];
  if (!perBand) return 0;
  let sum = 0;
  let count = 0;
  for (const band of BANDS) {
    const st = perBand[band];
    if (st && st.count > 0) {
      sum += st.puritySum;
      count += st.count;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Up to two short lines, worst-first. Empty inputs → no critique (an unfinished
 * build has nothing to judge). A clean build gets a single nod, not silence.
 */
export function marrowCritique(
  state: GameState,
  head: string | null,
  haft: string | null,
  binding: string | null,
): string[] {
  if (!head || !haft || !binding) return [];
  const hd = materialDef(head);
  const hf = materialDef(haft);
  const bd = materialDef(binding);
  const rank = (r: string) => RARITIES.indexOf(r as never);
  const lines: string[] = [];

  // A haft or binding two rarity bands below the head — it will hold, not sing.
  if (rank(hf.rarity) <= rank(hd.rarity) - 2) {
    lines.push(`That haft's soft for the head you've picked. It'll hold. It won't sing.`);
  }
  if (rank(bd.rarity) <= rank(hd.rarity) - 2) {
    lines.push(`The binding's outmatched. Grip comes before glory — mind it.`);
  }

  // Poor grade of the stone that meets the rock.
  const headPurity = heldAvgPurity(state, head);
  if (headPurity > 0 && headPurity < 40) {
    lines.push(`Your ${hd.name}'s a poor grade. Refine it, or the head runs dull.`);
  }

  // A dragging interaction he can feel. Named only once you've found it (pillar 5).
  const combined = [...traitsOf(head), ...traitsOf(haft), ...traitsOf(binding)];
  const grind = activePairs(combined).find((p) => p.mult < 1);
  if (grind && lines.length < 2) {
    const key = [grind.a, grind.b].sort().join('|');
    const known = state.forge.pairsFound.includes(key);
    lines.push(
      known
        ? `The ${grind.name} in this will drag — you know that one.`
        : `Something in this fights itself. I can feel it; can't name it. You'll see when it's done.`,
    );
  }

  if (lines.length === 0) {
    lines.push(`Nothing wrong I can see. Good hands. Go on and make it.`);
  }
  return lines.slice(0, 2);
}
