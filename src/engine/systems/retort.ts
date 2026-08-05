/**
 * THE RETORT — REDUCTION (§13, the wreck at Retort Hall 120).
 *
 * §13: "reduce ash and pyre into higher media · blocks `starred` and tiers X+."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ITEM 6, MEASURED. "Temper Ash already reaches a Loam player via risingAsh —
 * check what else feeds this."
 *
 * The six quench media and where they come from:
 *
 *   sap    temperash    loam      rich       made — A.84's `risingAsh` chain
 *   ember  charstone    cinder    common     dug
 *   void   voidresidue  loam      flawless   made — three Hollow chains
 *   lumen  lumenshard   glassmere rich       dug
 *   frost  frostsand    glassmere common     dug
 *   rime   truesilver   loam      pure       made — four chains
 *
 * So nothing is missing at the bottom: three are ordinary drops and three are
 * chain outputs, and the trough opens on `sap` in Loam. What is missing is the
 * TOP. §17 names five quench media and calls the last of them **the PYRE-BATH,
 * "the only route to tier-XI temper"** — and it does not exist. There is no
 * seventh medium, and there is no verb anywhere in the game that moves stock UP
 * A RARITY BAND: the Refinery climbs PURITY, the Balance trades sideways at a
 * loss, the Centrifuge takes apart. Nothing reduces.
 *
 * THAT IS WHAT §13 MEANS BY "blocks `starred`". `starred` is a RARITY, every
 * starred material in the registry is an ordinary deep drop, and the Retort
 * does not produce any of them — it is the only machine that can put stock into
 * that band by working it rather than by finding it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TIERS ARE CAPABILITY (§15.4):
 *   I    REDUCE — two of a medium and a pyre stone become one of the band above
 *   II   THE SHAFT IS THE FIRE — above the Damper's line the pyre stone is not
 *        needed, because the heat you are already risking does that work
 *   III  THE PYRE-BATH — §17's last medium, which nothing else can reach, and
 *        the only one that will take ANY part
 *
 * Tier II is the interlock with the Boiler (A.95): the same degrees above the
 * line that buy Cinder its sustain also pay for a reduction, so a hot shaft is
 * one decision feeding two machines rather than two switches.
 *
 * Tier III is §17's clause, and the capability is real rather than a number:
 * a medium only takes a part it SHARES A TRAIT with (A.94's rule, used a third
 * time), so most media refuse most parts. The Pyre-bath refuses nothing.
 *
 * PILLAR 2. A reduction is strictly lossy in units (two in, one out) and lands
 * at the input's own purity. Nothing here touches the field.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { RARITIES, materialDef, type MaterialRarity, type PurityBand } from '../materials';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { conditionOf } from './condition';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';
import { consumeMaterial, materialCount } from './forge';
import { deliver } from './witness';
import { REDUCTIONS, REDUCTION_BY_FROM, ensurePyreBath, type ReductionDef } from '../content/reductions';
import { riskedHeat } from './boiler';
import { reservedBlocker } from './reserve';

/** The wreck it is found in — Cinder, Retort Hall 120. Authored with the shell. */
export const RETORT_WRECK = 'THE RETORT';

/** Units of the lower medium per unit of the higher one. The loss IS the verb. */
export const REDUCE_UNITS = 2;

export const TIER_CAPABILITY_RETORT = [
  'not built',
  'two of a medium and a pyre stone reduce to one of the band above',
  '...and above the line the shaft is the fire, so the pyre stone is spare',
  '...and the Pyre-bath, which nothing else reaches and which refuses no part',
] as const;

export function retortStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === RETORT_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function retortFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === RETORT_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function retortBuilt(state: GameState): boolean {
  return tierOf(state, 'retort') > 0;
}

/** Tier II: heat you are already risking stands in for the pyre stone. */
export function shaftIsTheFire(state: GameState): boolean {
  return tierOf(state, 'retort') >= 2;
}

/** Tier III: §17's last medium. */
export function reachesPyreBath(state: GameState): boolean {
  return tierOf(state, 'retort') >= 3;
}

export function nextRetortTierCost(state: GameState): number | null {
  const t = tierOf(state, 'retort');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildRetort(state: GameState, ctx: EngineCtx): ActionResult {
  if (!retortFound(state)) {
    const at = retortStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Retort.' };
  }
  const cost = nextRetortTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Retort is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'retort', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['retort'] = tierOf(state, 'retort') + 1;
  ensurePyreBath();
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'retort', tier: plant.tiers['retort']! });
  return { ok: true, data: { tier: plant.tiers['retort'] } };
}

// ---------------------------------------------------------------------------
// The verb
// ---------------------------------------------------------------------------

/** Is the shaft hot enough to stand in for the pyre stone? Tier II only. */
export function firedByShaft(state: GameState): boolean {
  return shaftIsTheFire(state) && riskedHeat(state) > 0;
}

export function reductionOf(state: GameState, fromId: string): ReductionDef | undefined {
  const def = REDUCTION_BY_FROM.get(fromId);
  if (!def) return undefined;
  if (def.pyreBath && !reachesPyreBath(state)) return undefined;
  return def;
}

export function reduceBlocker(state: GameState, fromId: string, band: PurityBand): string | null {
  if (!retortBuilt(state)) return 'The Retort is not standing.';
  // RESERVE (§25.5) — asked FIRST, so "it is reserved" is what you are told.
  const reserved = reservedBlocker(state, fromId);
  if (reserved) return reserved;
  if (conditionOf(state, 'retort')?.seized) return 'A neck has cracked. Re-cast it before it will hold.';
  const def = REDUCTION_BY_FROM.get(fromId);
  if (!def) {
    let name = fromId;
    try { name = materialDef(fromId).name; } catch { /* unknown */ }
    return `${name} does not reduce into anything. This one takes a quench medium.`;
  }
  if (def.pyreBath && !reachesPyreBath(state)) {
    return 'The Pyre-bath wants the deepest Retort there is.';
  }
  const stack = state.materials.stacks[fromId]?.[band];
  if (!stack || stack.count < REDUCE_UNITS) {
    return `A reduction takes ${REDUCE_UNITS} at one band. You have ${stack?.count ?? 0}.`;
  }
  if (!firedByShaft(state) && materialCount(state, def.pyre) < 1) {
    let name = def.pyre;
    try { name = materialDef(def.pyre).name; } catch { /* unknown */ }
    return shaftIsTheFire(state)
      ? `1 ${name} — or take the shaft above its line and burn that instead.`
      : `1 ${name} for the fire.`;
  }
  return null;
}

/**
 * REDUCE IT. Two of a medium and one pyre stone become ONE of the medium above
 * — strictly lossy, at the input's own purity, and never above it.
 */
export function reduce(
  state: GameState, ctx: EngineCtx, fromId: string, band: PurityBand,
): ActionResult {
  const blocked = reduceBlocker(state, fromId, band);
  if (blocked) return { ok: false, reason: blocked };
  const def = REDUCTION_BY_FROM.get(fromId)!;
  const perMat = state.materials.stacks[fromId]!;
  const stack = perMat[band]!;
  const purity = stack.puritySum / stack.count;
  stack.count -= REDUCE_UNITS;
  stack.puritySum -= purity * REDUCE_UNITS;
  if (stack.count <= 0) delete perMat[band];

  const byShaft = firedByShaft(state);
  if (!byShaft) consumeMaterial(state, def.pyre, 1);
  // Through the delivery seam, like every other lateral converter.
  deliver(state, 'retort', def.to, purity, 1);
  state.materials.totalDrops -= 1;   // a reduction is a conversion, not a find
  ctx.emit({ type: 'reduced', fromId, toId: def.to, byShaft });
  ctx.dirty();
  return { ok: true, data: { to: def.to, spent: REDUCE_UNITS, byShaft } };
}

/** What is in reach right now — LAW 3: destinations you can actually make. */
export function reducible(
  state: GameState,
): Array<{ fromId: string; name: string; band: PurityBand; count: number; to: string; toName: string; line: string }> {
  if (!retortBuilt(state)) return [];
  const rows: ReturnType<typeof reducible> = [];
  for (const [fromId, perMat] of Object.entries(state.materials.stacks)) {
    const def = reductionOf(state, fromId);
    if (!def) continue;
    for (const [band, stack] of Object.entries(perMat)) {
      if (!stack || stack.count < REDUCE_UNITS) continue;
      rows.push({
        fromId,
        name: (() => { try { return materialDef(fromId).name; } catch { return fromId; } })(),
        band: band as PurityBand,
        count: stack.count,
        to: def.to,
        toName: (() => { try { return materialDef(def.to).name; } catch { return def.to; } })(),
        line: def.line,
      });
    }
  }
  return rows.sort((a, b) => b.count - a.count);
}

/** Did this reduction climb a rarity band? The claim §13 makes, checkable. */
export function climbsRarity(def: ReductionDef): boolean {
  const a = materialDef(def.from).rarity as MaterialRarity;
  const b = materialDef(def.to).rarity as MaterialRarity;
  return RARITIES.indexOf(b) > RARITIES.indexOf(a);
}

export { REDUCTIONS };
