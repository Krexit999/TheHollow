/**
 * THE WASHER — a PROCESSING STEP (§13, §19), a row in the Crusher's panel.
 *
 * §13: "grit + solvent → concentrate + silt · blocks everything the Refinery
 * eats." §13 also marks it *processing*, and §37 says a processing step "gets a
 * row inside an existing panel rather than a construction event" — so it lives
 * under the machine whose output it eats, and there is no Washer panel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ITEM 11: "THE REACTION BENCH'S SOLVENTS WERE NAMED AT A.84 AND NEVER BUILT —
 * CHECK WHETHER THIS IS WHERE THEY LAND." Checked. THEY DO NOT, AND THE REASON
 * IS THAT NEITHER EXISTS.
 *
 *   - There is NO Reaction Bench in this codebase. §17 is unbuilt; the only
 *     `registerChain` consumer is the Refinery's transmute verb.
 *   - There is NO solvent material anywhere. The spine names two — **Frit**
 *     (§15.1: "the Glassmere solvent") and **Sap** (§19: "the Washer's solvent
 *     must be GROWN, not made") — and `frit` is in no registry at all.
 *   - `sap` DOES exist, and it is a CURRENCY: Verdance's converted currency
 *     (`content/shells.ts`), not a stone.
 *
 * So rather than authoring two materials nothing else wants, THE SOLVENT IS THE
 * SHELL'S OWN CONVERTED CURRENCY. That is one rule for seven shells, and §19's
 * single authored Verdance difference — "the plant runs on your gardening" —
 * falls straight out of it: in Verdance the converted currency IS Sap, and Sap
 * is grown. Nothing was invented to make that true.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT UNLOCKS IS A VERB (LAW 4): grit stops being the end of the line. The
 * Crusher's whole output is a `common` worked stone that a few chains eat and
 * nothing improves. Washing it costs the shell's own currency and gives back
 * CONCENTRATE — the same stock, a purity band higher — plus SILT, which is the
 * part that was never worth anything and now has somewhere to go.
 *
 * It is a genuine alternative to the Refinery rather than a copy of it: the
 * Refinery pays in UNITS (three in, one out, any material), the Washer pays in
 * CURRENCY and hands you a byproduct. Two routes to a band, priced in different
 * scarcities, which is the shape §8's bottleneck chain keeps asking for.
 *
 * TIERS ARE CAPABILITY (§15.4), and each is a different sentence:
 *   I    GRIT, and the shell you are standing in
 *   II   ...AND THE CRUSHER'S BYPRODUCT, which nothing else took
 *   III  ...AND ANY SHELL'S SOLVENT, so a world you left still pays
 *
 * PILLAR 2. Four units in, two out, at one band up — strictly lossy in units,
 * paid for in a currency the field already had to produce. There is no path
 * from this file to `cellCap`, `cellRegen` or `chipYield`.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { D } from '../decimal';
import {
  BANDS, BAND_RANGES, MATERIALS, materialDef, registerMaterial, type PurityBand,
} from '../materials';
import { MATERIAL_TRAITS } from '../traits';
import { allShells, convCurrencyId } from '../shells';
import { getCurrency, spendCurrency } from '../resources';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { conditionOf } from './condition';
import { CRUSH_BYPRODUCT, CRUSH_PRODUCT } from './crusher';
import { deliver } from './witness';

/** What one wash eats. A batch, like the Crusher's — not a tap. */
export const WASH_BATCH = 4;
/** What it costs in the shell's own converted currency. */
export const SOLVENT_COST = 12;
/** The worthless half, which is most of it. */
export const SILT_PER_WASH = 2;

export const CONCENTRATE = 'concentrate';
export const SILT = 'silt';

export const TIER_CAPABILITY_WASHER = [
  'not built',
  'grit, in the shell you are standing in',
  '...and the Crusher\'s byproduct',
  '...and any shell\'s solvent, so a world you left still pays',
] as const;

/**
 * THE TWO PRODUCTS REGISTER THEMSELVES, the same mechanism the Still's stilled
 * forms and the Crucible's alloys use. `worked: true` keeps both out of every
 * pool, every seam and the clone population — neither is a stone anybody digs.
 */
export function ensureWashProducts(): void {
  if (!MATERIALS.some((m) => m.id === CONCENTRATE)) {
    registerMaterial({
      id: CONCENTRATE,
      name: 'Concentrate',
      shellId: 'loam',
      rarity: 'common',
      palette: ['#2f3a35', '#4e6157', '#7d9384'],
      facets: 4,
      shimmer: 'soft',
      flavor: 'Grit with everything that was not grit taken out of it. Heavier than it looks, and cleaner.',
      worked: true,
    });
    MATERIAL_TRAITS[CONCENTRATE] = ['dense', 'trueseated'];
  }
  if (!MATERIALS.some((m) => m.id === SILT)) {
    registerMaterial({
      id: SILT,
      name: 'Silt',
      shellId: 'loam',
      rarity: 'common',
      palette: ['#3a352c', '#585144', '#837a67'],
      facets: 2,
      shimmer: 'none',
      flavor: 'What the solvent carried off. It settles out overnight and it is good for exactly one thing.',
      worked: true,
    });
    MATERIAL_TRAITS[SILT] = ['light', 'brittle'];
  }
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

export function washerBuilt(state: GameState): boolean {
  return tierOf(state, 'washer') > 0;
}

/** Tier II: the Crusher's byproduct washes too. */
export function takesByproduct(state: GameState): boolean {
  return tierOf(state, 'washer') >= 2;
}

/** Tier III: any converted currency you hold, not only this shell's. */
export function anySolvent(state: GameState): boolean {
  return tierOf(state, 'washer') >= 3;
}

/** What this Washer will put in the drum. */
export function washable(state: GameState): string[] {
  if (!washerBuilt(state)) return [];
  return takesByproduct(state) ? [CRUSH_PRODUCT, CRUSH_BYPRODUCT] : [CRUSH_PRODUCT];
}

/**
 * WHICH SOLVENT IT WILL SPEND, and how much of it there is. Tier I and II take
 * the shell you stand in; tier III takes whichever converted currency you hold
 * the most of, which is what makes a world you have left still useful.
 */
export function solventOf(state: GameState): { id: string; have: number } {
  const here = convCurrencyId(state);
  if (!anySolvent(state)) return { id: here, have: getCurrency(state, here).toNumber() };
  let best = { id: here, have: getCurrency(state, here).toNumber() };
  for (const s of allShells()) {
    const have = getCurrency(state, s.convCurrencyId).toNumber();
    if (have > best.have) best = { id: s.convCurrencyId, have };
  }
  return best;
}

/** The band above this one, or the same at the top. A wash CONCENTRATES. */
export function bandAbove(band: PurityBand): PurityBand {
  const i = BANDS.indexOf(band);
  return BANDS[Math.min(BANDS.length - 1, i + 1)]!;
}

function midOf(band: PurityBand): number {
  const [lo, hi] = BAND_RANGES[band];
  return Math.round((lo + hi) / 2);
}

export function nextWasherTierCost(state: GameState): number | null {
  const t = tierOf(state, 'washer');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

/**
 * THE WASHER IS BUILT AT THE CRUSHER, not at a wreck — it is a processing step
 * (§13), and §37's rule for one is a row inside an existing panel. So it costs
 * cast parts like every machine and needs no station of its own: a player who
 * has a Crusher can add the wash to it.
 */
export function buildWasher(state: GameState, ctx: EngineCtx): ActionResult {
  if (tierOf(state, 'crusher') <= 0) {
    return { ok: false, reason: 'There is no Crusher to add it to.' };
  }
  const cost = nextWasherTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Washer is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'washer', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['washer'] = tierOf(state, 'washer') + 1;
  ensureWashProducts();
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'washer', tier: plant.tiers['washer']! });
  return { ok: true, data: { tier: plant.tiers['washer'] } };
}

export function washBlocker(
  state: GameState, materialId: string, band: PurityBand,
): string | null {
  if (!washerBuilt(state)) return 'The Washer is not standing.';
  if (conditionOf(state, 'washer')?.seized) return 'It has cracked. Re-cast it before it will run.';
  if (!washable(state).includes(materialId)) {
    let name = materialId;
    try { name = materialDef(materialId).name; } catch { /* unknown */ }
    return materialId === CRUSH_BYPRODUCT
      ? `${name} is too fine for this Washer. That comes later.`
      : `${name} is not grit. The drum takes what the Crusher makes.`;
  }
  const stack = state.materials.stacks[materialId]?.[band];
  if (!stack || stack.count < WASH_BATCH) {
    return `A wash takes ${WASH_BATCH} at one band. You have ${stack?.count ?? 0}.`;
  }
  const sol = solventOf(state);
  if (sol.have < SOLVENT_COST) {
    return `It wants ${SOLVENT_COST} solvent and there is ${Math.floor(sol.have)}.`;
  }
  return null;
}

/**
 * WASH IT. Four units of grit and a measure of the shell's own currency go in;
 * one unit of CONCENTRATE a band higher and two of SILT come out.
 *
 * The band rise is the whole product — washing is what concentration IS — and it
 * is bounded by the same `BANDS` ladder everything else uses, so it can never
 * reach past `pristine` and can never skip a rung.
 */
export function wash(
  state: GameState, ctx: EngineCtx, materialId: string, band: PurityBand,
): ActionResult {
  const blocked = washBlocker(state, materialId, band);
  if (blocked) return { ok: false, reason: blocked };
  ensureWashProducts();
  const sol = solventOf(state);
  if (!spendCurrency(state, sol.id, D(SOLVENT_COST))) {
    return { ok: false, reason: 'The solvent went somewhere.' };
  }
  const perMat = state.materials.stacks[materialId]!;
  const stack = perMat[band]!;
  const purity = stack.puritySum / stack.count;
  stack.count -= WASH_BATCH;
  stack.puritySum -= purity * WASH_BATCH;
  if (stack.count <= 0) delete perMat[band];

  const up = bandAbove(band);
  deliver(state, 'washer', CONCENTRATE, midOf(up), 1);
  deliver(state, 'washer', SILT, midOf(band), SILT_PER_WASH);
  state.materials.totalDrops -= 1 + SILT_PER_WASH;   // a wash is a conversion

  ctx.emit({ type: 'washed', materialId, band: up, solvent: sol.id });
  ctx.dirty();
  return { ok: true, data: { band: up, solvent: sol.id, silt: SILT_PER_WASH } };
}

/** The rows the Crusher's panel shows — what you hold enough of to wash. */
export function washRows(
  state: GameState,
): { materialId: string; name: string; band: PurityBand; count: number; into: PurityBand }[] {
  if (!washerBuilt(state)) return [];
  const out: { materialId: string; name: string; band: PurityBand; count: number; into: PurityBand }[] = [];
  for (const id of washable(state)) {
    for (const [band, stack] of Object.entries(state.materials.stacks[id] ?? {})) {
      if (!stack || stack.count < WASH_BATCH) continue;
      out.push({
        materialId: id,
        name: (() => { try { return materialDef(id).name; } catch { return id; } })(),
        band: band as PurityBand,
        count: stack.count,
        into: bandAbove(band as PurityBand),
      });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}
