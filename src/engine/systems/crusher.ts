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
import { addMaterial, consumeMaterial, materialCount } from './forge';
import { D } from '../decimal';
import { addCurrency } from '../resources';
import { convCurrencyId } from '../shells';
import {
  canFire, emitsByproduct, fire, retainsBand, tierOf, TIER_PART_COST, MAX_MACHINE_TIER,
} from './plant';
import { machineSpeed } from './condition';
import { wreckBlocker, wreckFound } from './roll';
import { accepts, filterOf, filterSentence } from './sieve';
import { isReserved, reservedBlocker } from './reserve';
import {
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
/** One band up, or the top. The Mill's whole arithmetic. */
function bandAbove(band: PurityBand): PurityBand {
  const i = BANDS.indexOf(band);
  return BANDS[Math.min(BANDS.length - 1, i + 1)] ?? band;
}

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
/** The wreck it is in: The Long Cut, Loam 47 (S6, S22.5). */
export const CRUSHER_WRECK = 'CRUSHER';

export function crusherFound(state: GameState): boolean {
  return wreckFound(state, CRUSHER_WRECK);
}

/**
 * THE LONG CUT IS THE GATE (A.106). S22.5 authors it - "a crusher drum with a
 * shattered liner at 47" - and the row said CRUSHER while the machine cost
 * nothing but cast parts and was buildable from depth zero. The place was
 * scenery.
 *
 * Checked FIRST, before the parts, so the refusal names the walk rather than
 * the price: a player who has the parts and not the place is told where to go,
 * which is LAW 3 in one line.
 */
export function buildCrusher(state: GameState, ctx: EngineCtx): ActionResult {
  const blocked = wreckBlocker(state, CRUSHER_WRECK);
  if (blocked) return { ok: false, reason: blocked };
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
  // THE MILL (§13): FINE grinds a band cleaner and sweeps up nothing.
  const fine = finenessOf(state) === 'fine';
  const base = retainsBand(state, 'crusher') ? band : bandBelow(band);
  return {
    materialId,
    band,
    outBand: fine ? bandAbove(base) : base,
    input: CRUSH_BATCH,
    output: CRUSH_OUTPUT,
    byproduct: !fine && emitsByproduct(state, 'crusher') ? 1 : 0,
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
  /**
   * A CRACKED LINER IS A STOP, NOT A SLOW (E2, §7.2 — "a `brittle` liner cracks
   * and shatters"). The Crusher is pure Surge: it does nothing and then does
   * everything at once, so there is no rate here to halve. A seized one simply
   * refuses, and says what to do about it.
   */
  if (machineSpeed(state, 'crusher') <= 0) {
    return { ok: false, reason: 'The liner has cracked. Re-cast it before it will run.' };
  }
  // RESERVE (§25.5). A.85 checked this in the CIRCUIT and not in the verb, so a
  // reserved stack was safe from the automatic Crusher and fair game for the
  // manual one — protection you could walk around by pressing the button
  // yourself. It lives in the verb now, and the Circuit reads the same flag.
  const reserved = reservedBlocker(state, materialId);
  if (reserved) return { ok: false, reason: reserved };
  /**
   * AND IT SAYS NO BY NAME. A refusal that reads "Needs 4 of the same band"
   * over a Hold holding forty is the class of bug this project has shipped
   * three times (the Brick-over-a-Flux-purse one twice); a filter that silently
   * made a stack invisible would be the same shape.
   */
  if (!accepts(state, 'crusher', materialId, band)) {
    const f = filterOf(state, 'crusher')!;
    return { ok: false, reason: `The Crusher only takes what ${filterSentence(f)}.` };
  }
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
  const base = retainsBand(state, 'crusher') ? bandOf(avg) : bandBelow(bandOf(avg));
  const landing = finenessOf(state) === 'fine' ? bandAbove(base) : base;
  const outPurity = landing === bandOf(avg) ? avg : midOf(landing);
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
    // ...nor anything you reserved (§25.5). Filtered HERE rather than refused
    // at the verb, because a picker that keeps choosing a stack it may not have
    // would spend every cycle failing on the one thing you protected.
    if (isReserved(state, materialId)) continue;
    let def;
    try { def = materialDef(materialId); } catch { continue; }
    if (def.worked) continue;
    for (const [band, stack] of Object.entries(perMat)) {
      if (!stack || stack.count < CRUSH_BATCH) continue;
      /**
       * SORTING (§14.3). A machine with no filter says yes to everything, which
       * is exactly what this list did before the Sieve existed — so an
       * unfiltered plant is bit-identical. With one, this is where "crush only
       * stone under Fair" stops being a wish.
       *
       * The stack is not hidden and not destroyed: it is simply not on the list
       * of things this machine is willing to take, which is the difference
       * between sorting and a punishment.
       */
      if (!accepts(state, 'crusher', materialId, band as PurityBand)) continue;
      out.push({ materialId, band: band as PurityBand, count: stack.count });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

export { materialCount };

// ---------------------------------------------------------------------------
// THE MILL AND THE LEACH VAT — §13's folded processing steps (A.96)
// ---------------------------------------------------------------------------

/**
 * §13 folds SIX processing steps into panels that already exist rather than
 * making each one a construction event: "Mill → Crusher FINENESS · Leach Vat →
 * Crusher REJECT ROW · Draw Bench → Press die · Setting Bench → Tool Station ·
 * Accumulator → a Core-tree node · Sump → cut (§43)."
 *
 * THREE OF THE FIVE ALREADY EXIST UNDER ANOTHER NAME, measured before building:
 *   Draw Bench     the Press's ROD and WIRE forms, "pulled to length through a
 *                  die", tier-gated (A.92, `press.ts`)
 *   Setting Bench  `setSocket` — relics, runes and gems seated at the tool
 *   Accumulator    the `flowCapacity` and `surgeCapacity` Core-tree nodes
 *
 * These two are the ones that did not. Both are rows in this panel, not
 * machines: no wreck, no tier ladder, no cast parts (§37 — "a processing step
 * gets a row inside an existing panel").
 */

/** THE MILL: how fine the Crusher grinds. Two profiles, and they trade. */
export type Fineness = 'coarse' | 'fine';

export const FINENESS: Array<{ id: Fineness; name: string; does: string }> = [
  {
    id: 'coarse', name: 'Coarse',
    does: 'Fast and dirty. The tailings come off with it.',
  },
  {
    id: 'fine', name: 'Fine',
    does: 'Ground a band cleaner — and there is nothing left over to sweep up.',
  },
];

export function finenessOf(state: GameState): Fineness {
  return state.plant?.fineness === 'fine' ? 'fine' : 'coarse';
}

export function setFineness(state: GameState, ctx: EngineCtx, how: Fineness): ActionResult {
  if (!crusherBuilt(state)) return { ok: false, reason: 'No Crusher' };
  const p = ensurePlant(state);
  p.fineness = how;
  ctx.dirty();
  return { ok: true, data: { fineness: how } };
}

/**
 * THE LEACH VAT: what a reject is worth.
 *
 * §14.3 says a Sieve's "rejects route onward" and §13 calls this the Crusher's
 * REJECT ROW. The tailings — the byproduct this machine has always emitted and
 * nothing much has ever wanted — leach down into the shell's own converted
 * currency. It is the Washer's lesson used twice: the answer to "what currency"
 * is always the shell you are standing in (A.93).
 */
export const LEACH_BATCH = 3;
export const LEACH_PAYS = 26;

export function leachBlocker(state: GameState): string | null {
  if (!crusherBuilt(state)) return 'No Crusher';
  const held = materialCount(state, CRUSH_BYPRODUCT);
  if (held < LEACH_BATCH) return `${LEACH_BATCH} tailings to the vat (you have ${held})`;
  return null;
}

export function leach(state: GameState, ctx: EngineCtx): ActionResult {
  const blocked = leachBlocker(state);
  if (blocked) return { ok: false, reason: blocked };
  consumeMaterial(state, CRUSH_BYPRODUCT, LEACH_BATCH);
  const id = convCurrencyId(state);
  addCurrency(state, id, D(LEACH_PAYS));
  ctx.emit({ type: 'leached', currencyId: id, amount: LEACH_PAYS });
  ctx.dirty();
  return { ok: true, data: { currencyId: id, amount: LEACH_PAYS } };
}
