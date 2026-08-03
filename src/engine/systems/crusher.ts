/**
 * THE CRUSHER — the SURGE machine (§3.1, §5, §15.4).
 *
 * It does nothing at all, and then it does everything at once. A batch takes a
 * stack of stone and breaks it down in a single firing that empties most of the
 * Surge bank; between batches it draws NOTHING, which is exactly why sustained
 * Flow is wasted on it and why a Flow-heavy plant owns one that barely runs.
 *
 * THAT ASYMMETRY IS THE WHOLE PROOF. Starve the Kiln of Flow and it runs slow —
 * visibly, proportionally, still working. Starve the Crusher of Surge and it
 * does not run slow, it WAITS: the batch either fires or it does not. Two
 * plants at identical total capacity are therefore good at different machines.
 *
 * ITS TIERS ARE CAPABILITIES (§15.4), not multipliers:
 *   I    commons only — the output comes out a band lower than it went in
 *   II   RETAINS THE INPUT'S PURITY BAND
 *   III  EMITS BYPRODUCTS AT ALL
 *
 * Built from CAST PARTS off the rack, never bought with currency — the two
 * ladders climbing each other (§5): every machine is downstream of the Forge.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { BANDS, bandOf, materialDef, type PurityBand } from '../materials';
import { addMaterial, materialCount } from './forge';
import {
  canFire, emitsByproduct, fire, retainsBand, tierOf, TIER_PART_COST, MAX_MACHINE_TIER,
  ensurePlant, builtWith, noteBuiltOf,
} from './plant';

/** Stone per batch. A batch is a real commitment, not a tap. */
export const CRUSH_BATCH = 4;
/** What one batch of stone yields in ground stock. */
export const CRUSH_OUTPUT = 2;
/** The ground product, and the byproduct a tier-III machine also throws. */
export const CRUSH_PRODUCT = 'refineslag';
export const CRUSH_BYPRODUCT = 'salvagedust';

/** One band down, floored — what a tier-I machine does to what it eats. */
function bandBelow(band: PurityBand): PurityBand {
  const i = BANDS.indexOf(band);
  return BANDS[Math.max(0, i - 1)]!;
}

/** A purity that sits in the middle of a band, so the result lands where it says. */
function midOf(band: PurityBand): number {
  const ranges: Record<PurityBand, [number, number]> = {
    poor: [0, 39], fair: [40, 59], good: [60, 79],
    fine: [80, 94], exalted: [95, 100], pristine: [101, 110],
  };
  const [lo, hi] = ranges[band];
  return Math.round((lo + hi) / 2);
}

export function crusherBuilt(state: GameState): boolean {
  return tierOf(state, 'crusher') > 0;
}

/** What the next tier costs in cast parts off the rack. */
export function nextCrusherTierCost(state: GameState): number | null {
  const t = tierOf(state, 'crusher');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

/**
 * BUILD OR UPGRADE, out of the rack. Parts are spent cheapest-first: the rack is
 * stock, and a player who has poured a legendary head should not lose it to a
 * machine chassis because it happened to be at the front of the list.
 */
export function buildCrusher(state: GameState, ctx: EngineCtx): ActionResult {
  const cost = nextCrusherTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Crusher is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  // §11.2: WHAT IT IS MADE OF IS REMEMBERED. Before this the parts were
  // consumed and their materials thrown away in the same statement, so every
  // Crusher ever built was the same Crusher.
  noteBuiltOf(state, 'crusher', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['crusher'] = tierOf(state, 'crusher') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'crusher', tier: plant.tiers['crusher']! });
  return { ok: true, data: { tier: plant.tiers['crusher'] } };
}

/**
 * WHAT THE STONE IT WAS CAST FROM CHANGES (§11.2). Two capabilities, and both
 * are about WHAT the machine will do rather than how much it returns:
 *
 *   KEEN       a keen liner cuts stone that does not match. The batch may be
 *              assembled from MIXED bands instead of four of one — so a hold
 *              full of odd singles becomes crushable at all.
 *   TRUESEATED a true-seated frame does not let the byproduct fall with the
 *              product. The byproduct comes out at the band that went IN, even
 *              on a tier-I machine that drops the product a band.
 *
 * Neither changes `CRUSH_OUTPUT`. A keen Crusher does not return more; it
 * returns from stock a plain one refuses to touch.
 */
export function grindsMixed(state: GameState): boolean {
  return builtWith(state, 'crusher', 'keen');
}
export function holdsByproductBand(state: GameState): boolean {
  return builtWith(state, 'crusher', 'trueseated');
}

export interface CrushPreview {
  materialId: string;
  band: PurityBand;
  /** Band the output will land in — the tier-II capability, made visible. */
  outBand: PurityBand;
  input: number;
  output: number;
  byproduct: number;
}

export function crushPreview(
  state: GameState, materialId: string, band: PurityBand,
): CrushPreview | null {
  if (!crusherBuilt(state)) return null;
  const perMat = state.materials.stacks[materialId] ?? {};
  // A KEEN LINER CUTS WHAT DOES NOT MATCH: the batch may be made up across
  // bands. A plain machine still wants four of one, which is the refusal a
  // player feels before they ever cast a keen part.
  const have = grindsMixed(state)
    ? Object.values(perMat).reduce((n, s) => n + (s?.count ?? 0), 0)
    : (perMat[band]?.count ?? 0);
  if (have < CRUSH_BATCH) return null;
  const outBand = retainsBand(state, 'crusher') ? band : bandBelow(band);
  return {
    materialId,
    band,
    outBand,
    input: CRUSH_BATCH,
    output: CRUSH_OUTPUT,
    byproduct: emitsByproduct(state, 'crusher') ? 1 : 0,
  };
}

/**
 * FIRE ONE BATCH. The Surge is spent FIRST and the stone only afterwards, so a
 * bank that is short cannot half-consume a stack — the batch either happens or
 * the machine waits, which is the shape the whole Surge/Flow distinction rests
 * on.
 */
export function crush(
  state: GameState, ctx: EngineCtx, materialId: string, band: PurityBand,
): ActionResult {
  if (!crusherBuilt(state)) return { ok: false, reason: 'No Crusher' };
  const preview = crushPreview(state, materialId, band);
  if (!preview) return { ok: false, reason: `Needs ${CRUSH_BATCH} of the same band` };
  if (!canFire(state, 'crusher')) {
    return { ok: false, reason: 'The Surge bank is too low — it waits for the charge' };
  }
  if (!fire(state, 'crusher')) {
    return { ok: false, reason: 'The Surge bank is too low — it waits for the charge' };
  }

  const perMat = state.materials.stacks[materialId]!;
  /**
   * TAKE THE BATCH. A plain machine takes four from the named band; a KEEN one
   * fills up across bands, named band first, so the player's choice still leads
   * and the rest is made up from whatever is short.
   */
  const order: PurityBand[] = grindsMixed(state)
    ? [band, ...BANDS.filter((b) => b !== band)]
    : [band];
  let need = preview.input;
  let sum = 0;
  for (const b of order) {
    const s = perMat[b];
    if (!s || s.count <= 0 || need <= 0) continue;
    const take = Math.min(need, s.count);
    const a = s.puritySum / s.count;
    s.count -= take;
    s.puritySum -= a * take;
    sum += a * take;
    need -= take;
    if (s.count <= 0) delete perMat[b];
  }
  const avg = preview.input > 0 ? sum / preview.input : 0;

  // TIER II RETAINS THE BAND. Tier I hands back stone one band poorer, which is
  // the capability made a consequence rather than a stat line.
  const outPurity = retainsBand(state, 'crusher') ? avg : midOf(bandBelow(bandOf(avg)));
  addMaterial(state, CRUSH_PRODUCT, outPurity, preview.output);
  if (preview.byproduct > 0) {
    // A TRUE-SEATED FRAME does not let the byproduct fall with the product: it
    // comes out at the band that went IN, even where the product dropped one.
    addMaterial(
      state, CRUSH_BYPRODUCT,
      holdsByproductBand(state) ? avg : outPurity,
      preview.byproduct,
    );
  }

  ctx.emit({
    type: 'crushed',
    materialId,
    output: preview.output,
    band: bandOf(outPurity),
    byproduct: preview.byproduct,
  });
  ctx.dirty();
  return { ok: true, data: { ...preview, outPurity } };
}

/** Everything held in enough quantity to be worth a batch — what the panel lists. */
export function crushable(state: GameState): { materialId: string; band: PurityBand; count: number }[] {
  const out: { materialId: string; band: PurityBand; count: number }[] = [];
  for (const [materialId, perMat] of Object.entries(state.materials.stacks)) {
    // A machine does not eat its own output, or the chain becomes a loop.
    if (materialId === CRUSH_PRODUCT || materialId === CRUSH_BYPRODUCT) continue;
    let def;
    try { def = materialDef(materialId); } catch { continue; }
    if (def.worked) continue;
    for (const [band, stack] of Object.entries(perMat)) {
      if (!stack || stack.count < CRUSH_BATCH) continue;
      out.push({ materialId, band: band as PurityBand, count: stack.count });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

export { materialCount };
