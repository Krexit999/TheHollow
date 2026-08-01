/**
 * "I have 400 Brick and eleven tabs open, now what." (Phase 11, Part 4.) A
 * quiet, Guild-voiced line that notices what you're close to. Not a quest
 * marker, not a checklist — ignorable by an old hand, reliable for a new one.
 * Pure UI heuristic; it reads state and never changes it.
 */
import {
  allUpgrades, currentShell, getCurrency, nextCost, resolveCurrencyId, upgradeLevel,
  type GameState,
} from '../../engine';
import { useGame } from '../store';

function computeHint(s: GameState): string | null {
  // 1. Unspent skill points — the cheapest permanent power there is.
  if (s.delver.skillPoints > 0) {
    return `You've ${s.delver.skillPoints} skill point${s.delver.skillPoints === 1 ? '' : 's'} unspent — the Delver tree is waiting.`;
  }
  // 2. Nearly able to raise the first machine (the Kiln unlock).
  if (!s.kiln.built) {
    const def = allUpgrades().find((u) => u.id === 'kilnBuild');
    if (def) {
      const bank = getCurrency(s, resolveCurrencyId(def.currency, s)).toNumber();
      const cost = nextCost(def, 0).toNumber();
      if (bank >= cost) return 'You have Dust enough to raise the Kiln. Brick is what builds everything after it.';
      if (bank >= cost * 0.6) return 'Keep chipping — the Kiln is nearly within reach. Brick builds the rest of the game.';
    }
  }
  // 3. Standing on the floor, ready to Breach.
  const shell = currentShell(s);
  if (s.depth >= shell.floorDepth && shell.floorDepth > 0) {
    return `You stand on the floor of ${s.shell.current}. Breach when you're ready.`;
  }
  // 4. The Kiln is built but cold while Dust piles up.
  if (s.kiln.built && !s.kiln.feeding) {
    const bank = getCurrency(s, shell.chipCurrencyId).toNumber();
    if (bank > 200) return 'The Kiln sits cold while your Dust piles up. Set it feeding.';
  }
  // 5. A face upgrade is affordable and would help (soft, last).
  for (const id of ['blade', 'expand', 'soil']) {
    const def = allUpgrades().find((u) => u.id === id);
    if (!def || (def.visible && !def.visible(s))) continue;
    const lv = upgradeLevel(s, id);
    if (lv >= def.maxLevel) continue;
    const bank = getCurrency(s, resolveCurrencyId(def.currency, s));
    if (bank.gte(nextCost(def, lv).mul(3))) return `You can afford ${def.name} several times over — it raises the ceiling.`;
  }
  return null;
}

export function NextHint() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const hint = computeHint(state as GameState);
  if (!hint) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-cave-700 bg-cave-900/60 px-3 py-2" role="note" aria-label="What to do next">
      <span className="mt-px shrink-0 text-sm text-lamp-500" aria-hidden>✦</span>
      <span className="text-[11px] leading-snug text-cave-300">{hint}</span>
    </div>
  );
}
