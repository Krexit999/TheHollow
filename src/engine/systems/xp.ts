/**
 * Delver XP — the spine that never resets, not even on Recursion.
 * xpToLevel(L) = 100 * L^1.9, cap 200. 1 skill point per level, +3 extra
 * every 10th.
 */
import type { Decimal } from '../decimal';
import type { ModifierCache } from '../modifiers';
import type { EngineCtx, GameState } from '../types';
import { LEVEL_CAP, xpToLevel } from '../prestigeMath';

/**
 * Global XP scale (Phase 5 rescale): grants ran hot enough to land L138 at
 * 16h; 0.35× puts L200 near the end of content (~110h) with combat's new XP
 * on top. The curve itself is locked — only the faucet narrows.
 */
export const XP_SCALE = 0.35;

export function grantXP(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  base: Decimal,
): void {
  if (base.lte(0) || state.delver.level >= LEVEL_CAP) return;
  const amount = base.mul(XP_SCALE).mul(mods.get(state, 'xpGain'));
  let xp = state.delver.xp.add(amount);
  let level = state.delver.level;
  let sp = state.delver.skillPoints;
  let leveled = false;
  while (level < LEVEL_CAP) {
    const need = xpToLevel(level + 1);
    if (xp.lt(need)) break;
    xp = xp.sub(need);
    level += 1;
    sp += 1 + (level % 10 === 0 ? 3 : 0);
    leveled = true;
  }
  state.delver.xp = xp;
  state.delver.level = level;
  state.delver.skillPoints = sp;
  if (leveled) {
    ctx.dirty(); // skill-adjacent bonuses may key off level
    ctx.emit({ type: 'levelUp', level });
  }
}
