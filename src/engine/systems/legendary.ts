/**
 * LEGENDARY PARTS — the grant, and the re-pour.
 *
 * Two verbs and nothing else:
 *
 *   `checkLegendaryParts` runs on the same one-second beat as the achievement
 *   check and the prize drills, and hands you a legend the moment you have
 *   earned it. Free, because it is EARNED — you already paid at Loam 120.
 *
 *   `recastLegendary` re-pours a legend you own in a different stone, at the
 *   ordinary cost in stock. This is the verb that keeps a legend alive past its
 *   own shell, and the reason the legend is a PATTERN rather than an object —
 *   see the long note at the top of `content/legendaryParts.ts`.
 *
 * IDEMPOTENCE. `state.casting.legends` records what you have earned, and it is
 * the only thing recorded. It is deliberately NOT "what you are holding": a
 * legend you melted down is still a legend you earned, and the alternative —
 * inferring from the rack — would hand out a second copy the moment you re-seat
 * or salvage one. Prize drills key off the granted object because a drill cannot
 * be destroyed; a part can, so this keys off the deed.
 */
import type { EngineCtx, GameState, ActionResult } from '../types';
import {
  LEGENDARY_PARTS, LEGENDARY_BY_ID, type LegendaryPartDef,
} from '../content/legendaryParts';
import { type PartType } from '../content/forgeParts';
import { materialDef, MATERIALS } from '../materials';
import { shellOrdinal } from '../content/drillAlloys';
import { materialCount, consumeMaterial } from './forge';
import { castMelt, MELT_PER_UNIT, castingUnlocked, type RackPart } from './casting';
import { PURITY_CEILING } from './forgeParts';

/** Units of stock a legend's pour asks for, in its plain shape. */
export function legendCost(type: PartType): number {
  return Math.max(1, Math.ceil(castMelt(type) / MELT_PER_UNIT));
}

/** Ids the player has earned. Absent on every save written before this. */
export function legendsEarned(state: GameState): string[] {
  return state.casting.legends ?? [];
}

export function hasLegend(state: GameState, id: string): boolean {
  return legendsEarned(state).includes(id);
}

/** Every copy of a legend the player is holding — on the rack or in the tool. */
export function legendPart(state: GameState, id: string): RackPart | undefined {
  return state.casting.tool.find((p) => p.legend === id)
    ?? state.casting.rack.find((p) => p.legend === id);
}

/**
 * THE BEST STONE THE PLAYER IS ACTUALLY HOLDING ENOUGH OF.
 *
 * Deepest shell first, because that is what ruling 1 says is better and there is
 * no argument to have; ties break on how much of it there is, so the grant lands
 * in a stone the player has a working relationship with rather than in the one
 * lucky Starred drop they were saving. Returns null when nothing qualifies —
 * and because nothing is stored in that case, the next beat simply tries again.
 */
export function bestStoneFor(state: GameState, type: PartType): string | null {
  const need = legendCost(type);
  let best: string | null = null;
  let bestKey = [-1, -1];
  for (const m of MATERIALS) {
    const have = materialCount(state, m.id);
    if (have < need) continue;
    const key = [shellOrdinal(m.shellId), have];
    if (key[0]! > bestKey[0]! || (key[0] === bestKey[0] && key[1]! > bestKey[1]!)) {
      best = m.id;
      bestKey = key;
    }
  }
  return best;
}

function mintLegend(state: GameState, def: LegendaryPartDef, materialId: string): RackPart {
  return {
    id: state.casting.nextId++,
    type: def.partType,
    materialId,
    // PRISTINE. The band above anything the world rolls (A.68 P2) — you cannot
    // cast this, which is one of the three things that make a legend a legend.
    purity: PURITY_CEILING,
    // The masterwork you do not get to choose on an ordinary pour. `craftFold`
    // reads this exactly as it reads a lucky one; no new machinery.
    craft: 'masterwork',
    work: def.work,
    legend: def.id,
  };
}

/**
 * THE HOOK. Idempotent per legend id. Returns true only when a part actually
 * arrived — a legend earned while the Hold is empty of any usable stone is not
 * lost, because `earned` is a pure read and nothing was written.
 */
export function grantLegendary(state: GameState, ctx: EngineCtx, id: string): boolean {
  const def = LEGENDARY_BY_ID.get(id);
  if (!def) return false;
  if (hasLegend(state, id)) return false;
  const stone = bestStoneFor(state, def.partType);
  if (!stone) return false;

  const part = mintLegend(state, def, stone);
  state.casting.rack.push(part);
  (state.casting.legends ??= []).push(id);
  ctx.emit({
    type: 'legendaryPart', legend: def.id, name: def.name,
    partType: def.partType, materialId: stone, line: def.line,
  });
  ctx.dirty();
  return true;
}

/** Called on the same one-second beat as the achievement check. */
export function checkLegendaryParts(state: GameState, ctx: EngineCtx): void {
  if (!castingUnlocked(state)) return;
  for (const def of LEGENDARY_PARTS) {
    if (hasLegend(state, def.id)) continue;
    if (!def.earned(state)) continue;
    grantLegendary(state, ctx, def.id);
  }
}

/**
 * RE-POUR A LEGEND YOU OWN IN A STONE YOU CHOOSE.
 *
 * The verb that keeps a legend from being trash one shell after you earn it, at
 * the ordinary price of the pour. It edits the part IN PLACE rather than minting
 * a new one, which is what keeps "you own one of each" true without a second
 * uniqueness check somewhere — and it works on a part that is currently IN the
 * tool, because `toolKey` hashes `legend` and `materialId` both, so the memo
 * re-derives on the spot.
 */
export function recastLegendary(
  state: GameState, ctx: EngineCtx, id: string, materialId: string,
): ActionResult {
  if (!castingUnlocked(state)) return { ok: false, reason: 'The casting floor is cold' };
  const def = LEGENDARY_BY_ID.get(id);
  if (!def) return { ok: false, reason: 'No such legend' };
  const part = legendPart(state, id);
  if (!part) return { ok: false, reason: `${def.name} is not on the rack` };
  const mat = materialDef(materialId);
  const need = legendCost(def.partType);
  if (materialCount(state, materialId) < need) {
    return { ok: false, reason: `${need} ${mat.name} for the pour` };
  }
  if (part.materialId === materialId) {
    return { ok: false, reason: `${def.name} is already ${mat.name}` };
  }

  consumeMaterial(state, materialId, need);
  part.materialId = materialId;
  part.purity = PURITY_CEILING;
  // A RE-POUR IS A NEW PART, so anything the old stone had grown is gone with
  // it. Cleared rather than carried, because carrying a Verdance boon into a
  // dead stone would be a growth axis nobody could see or explain.
  delete part.layers;
  delete part.grown;
  delete part.growth;

  ctx.emit({
    type: 'legendaryRecast', legend: def.id, name: def.name, materialId, cost: need,
  });
  ctx.dirty();
  return { ok: true, data: { partId: part.id, materialId, cost: need } };
}

/** What the panel shows for one legend — earned or not, held or not. */
export interface LegendRow {
  def: LegendaryPartDef;
  earned: boolean;
  part: RackPart | undefined;
  /** Where it is, for the "you already built this in" case. */
  inTool: boolean;
}

export function legendRows(state: GameState): LegendRow[] {
  return LEGENDARY_PARTS.map((def) => {
    const part = legendPart(state, def.id);
    return {
      def,
      earned: hasLegend(state, def.id),
      part,
      inTool: part !== undefined && state.casting.tool.some((p) => p.id === part.id),
    };
  });
}
