/**
 * THE CULTIVAR BENCH — CULTIVATION (§13, the wreck at The Seedhouse, Verdance 40).
 *
 * §13: "seed a fallow quadrant and farm its traits · blocks Sap and Seat III."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT MUST NOT DO, and both constraints are the brief's.
 *
 * `growth.ts` is Verdance's LOCKED signature: cells you do not mine sprout,
 * bank overflow regen as FRUIT, spread to neighbours, and pay that fruit out on
 * the chip that harvests them. Every number of that is untouched here — the
 * stages, the capture rate, the spread timer, the drop share, the harvest
 * bonus. This bench never writes `stage`, `age`, `fullSince` or `spreadTimer`.
 *
 * And NOTHING NEW MOUNTS ON THE FACE. The bench is a panel: it READS which
 * cells are vined and how ripe they are, and the only thing it writes to the
 * face is the same `fruit` a harvest was always allowed to take.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SO WHAT IS THE VERB. A quadrant is a quarter of the face — a place, not a
 * cell — and seeding one with a STRAIN says what you want the vines there to
 * become. Fruit grown under a strain harvests as TRAIT-BEARING STONE instead of
 * as charge.
 *
 * THAT IS A TRADE AND PILLAR 2 IS STRUCTURAL BECAUSE OF IT. The bench takes the
 * fruit the growth system had already banked and gives you a stone instead of
 * the charge it would have paid. It does not make fruit, it does not raise
 * capture, and it cannot reach `cellCap`, `cellRegen` or `chipYield`. Farming a
 * quadrant is INCOME YOU GAVE UP to get material you chose.
 *
 * TIERS ARE CAPABILITY (§15.4):
 *   I    SEED ONE QUADRANT — its fruit crops as stone carrying the strain's trait
 *   II   THE BED KEEPS — cropping takes the fruit and leaves the vines standing,
 *        so a bed goes on producing instead of starting again at bare
 *   III   CROSS — two strains in touching quadrants crop a stone carrying BOTH
 *
 * Tier III obeys A.92's conservation rule: a crossed stone carries two traits
 * because TWO strains were seeded and two beds were spent, so nothing is
 * created that nothing paid for.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { TRAITS, type TraitId } from '../traits';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { conditionOf } from './condition';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';
import { addMaterial } from './forge';
import { STRAINS, STRAIN_BY_ID, crossOf, strainStone, type StrainDef } from '../content/strains';

/** The wreck it is found in — Verdance, The Seedhouse 40 (authored A.95). */
export const CULTIVAR_WRECK = 'THE CULTIVAR BENCH';

/** Four quadrants: the face's own quarters, however wide the face is. */
export const QUADRANTS = ['nw', 'ne', 'sw', 'se'] as const;
export type QuadrantId = (typeof QUADRANTS)[number];

/** Fruit per unit of cropped stone. The bed has to be worth waiting for. */
export const FRUIT_PER_UNIT = 260;

export const TIER_CAPABILITY_CULTIVAR = [
  'not built',
  'seed one quadrant — its fruit crops as stone carrying the strain',
  '...and the bed keeps: cropping leaves the vines standing',
  '...and two strains in touching beds cross into one stone carrying both',
] as const;

export interface CultivarState {
  /** quadrant → the strain seeded there. */
  beds: Partial<Record<QuadrantId, string>>;
  /** Strains you have actually cropped — a small Codex. */
  cropped: string[];
}

export function defaultCultivarState(): CultivarState {
  return { beds: {}, cropped: [] };
}

export function ensureCultivar(state: GameState): CultivarState {
  const c = (state.cultivar ??= defaultCultivarState());
  c.beds ??= {};
  c.cropped ??= [];
  return c;
}

export function cultivarStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === CULTIVAR_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function cultivarFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === CULTIVAR_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function cultivarBuilt(state: GameState): boolean {
  return tierOf(state, 'cultivar') > 0;
}

/** Tier II: cropping leaves the vines standing. */
export function bedKeeps(state: GameState): boolean {
  return tierOf(state, 'cultivar') >= 2;
}

/** Tier III: touching beds cross. */
export function bedsCross(state: GameState): boolean {
  return tierOf(state, 'cultivar') >= 3;
}

/** How many beds this bench can hold seeded at once. */
export function bedSlots(state: GameState): number {
  const t = tierOf(state, 'cultivar');
  return t <= 0 ? 0 : t === 1 ? 1 : t === 2 ? 2 : QUADRANTS.length;
}

export function nextCultivarTierCost(state: GameState): number | null {
  const t = tierOf(state, 'cultivar');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildCultivarBench(state: GameState, ctx: EngineCtx): ActionResult {
  if (!cultivarFound(state)) {
    const at = cultivarStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Cultivar Bench.' };
  }
  const cost = nextCultivarTierCost(state);
  if (cost === null) return { ok: false, reason: 'The bench is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'cultivar', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['cultivar'] = tierOf(state, 'cultivar') + 1;
  ensureCultivar(state);
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'cultivar', tier: plant.tiers['cultivar']! });
  return { ok: true, data: { tier: plant.tiers['cultivar'] } };
}

// ---------------------------------------------------------------------------
// The quadrants — read off the face, never written to it
// ---------------------------------------------------------------------------

/** Which cells are in this quarter of the face, at whatever size it is now. */
export function cellsOf(state: GameState, quad: QuadrantId): number[] {
  const { w, h } = state.face;
  const midX = Math.ceil(w / 2);
  const midY = Math.ceil(h / 2);
  const west = quad === 'nw' || quad === 'sw';
  const north = quad === 'nw' || quad === 'ne';
  const out: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x < midX) !== west) continue;
      if ((y < midY) !== north) continue;
      out.push(y * w + x);
    }
  }
  return out;
}

/** Quadrants that share an edge — the tier-III cross reads this. */
export function touching(quad: QuadrantId): QuadrantId[] {
  return quad === 'nw' ? ['ne', 'sw']
    : quad === 'ne' ? ['nw', 'se']
      : quad === 'sw' ? ['nw', 'se']
        : ['ne', 'sw'];
}

/** Fruit standing in a bed right now — growth's own number, read not written. */
export function bedFruit(state: GameState, quad: QuadrantId): number {
  const fruit = state.growth?.fruit ?? [];
  let n = 0;
  for (const c of cellsOf(state, quad)) n += fruit[c] ?? 0;
  return n;
}

export function bedVines(state: GameState, quad: QuadrantId): number {
  const stage = state.growth?.stage ?? [];
  let n = 0;
  for (const c of cellsOf(state, quad)) if ((stage[c] ?? 0) > 0) n += 1;
  return n;
}

// ---------------------------------------------------------------------------
// Seeding and cropping
// ---------------------------------------------------------------------------

export function strainIn(state: GameState, quad: QuadrantId): StrainDef | null {
  const id = state.cultivar?.beds?.[quad];
  return id ? STRAIN_BY_ID.get(id) ?? null : null;
}

export function seedBlocker(state: GameState, quad: QuadrantId, strainId: string): string | null {
  if (!cultivarBuilt(state)) return 'The Cultivar Bench is not standing.';
  if (conditionOf(state, 'cultivar')?.seized) return 'The frames have rotted through. Re-cast it.';
  if (!QUADRANTS.includes(quad)) return 'No such bed.';
  const def = STRAIN_BY_ID.get(strainId);
  if (!def) return 'No such strain.';
  const beds = ensureCultivar(state).beds;
  const already = Object.keys(beds).filter((q) => q !== quad && beds[q as QuadrantId]).length;
  if (!beds[quad] && already >= bedSlots(state)) {
    return `This bench keeps ${bedSlots(state)} bed${bedSlots(state) === 1 ? '' : 's'}. Deepen it, or turn one over.`;
  }
  return null;
}

export function seedBed(
  state: GameState, ctx: EngineCtx, quad: QuadrantId, strainId: string | null,
): ActionResult {
  if (strainId === null) {
    const c = ensureCultivar(state);
    delete c.beds[quad];
    ctx.dirty();
    return { ok: true, data: { quad, strain: null } };
  }
  const blocked = seedBlocker(state, quad, strainId);
  if (blocked) return { ok: false, reason: blocked };
  const c = ensureCultivar(state);
  c.beds[quad] = strainId;
  ctx.emit({ type: 'bedSeeded', quad, strainId });
  ctx.dirty();
  return { ok: true, data: { quad, strain: strainId } };
}

/** What a crop would pay right now, and what it would be. */
export function cropPreview(
  state: GameState, quad: QuadrantId,
): { units: number; materialId: string; traits: TraitId[]; crossedWith: QuadrantId | null } | null {
  const def = strainIn(state, quad);
  if (!def) return null;
  const units = Math.floor(bedFruit(state, quad) / FRUIT_PER_UNIT);
  let crossedWith: QuadrantId | null = null;
  let traits: TraitId[] = [def.trait];
  let materialId = strainStone(def.trait);
  if (bedsCross(state)) {
    for (const other of touching(quad)) {
      const o = strainIn(state, other);
      if (!o || o.trait === def.trait) continue;
      const crossed = crossOf(def.trait, o.trait);
      if (!crossed) continue;
      crossedWith = other;
      traits = [def.trait, o.trait];
      materialId = crossed;
      break;
    }
  }
  return { units, materialId, traits, crossedWith };
}

export function cropBlocker(state: GameState, quad: QuadrantId): string | null {
  if (!cultivarBuilt(state)) return 'The Cultivar Bench is not standing.';
  const def = strainIn(state, quad);
  if (!def) return 'Nothing is seeded in that bed.';
  const p = cropPreview(state, quad)!;
  if (p.units < 1) {
    return `Not ripe. A crop wants ${FRUIT_PER_UNIT} of fruit standing in the bed.`;
  }
  return null;
}

/**
 * TAKE THE CROP. The fruit the bed had banked becomes stone; the charge it
 * would have paid is what you gave up for it.
 *
 * At tier I the vines go back to bare, exactly as an ordinary harvest leaves
 * them. At tier II they stay standing and only the fruit is taken — the bench's
 * second sentence, and the only thing that changes about the face.
 */
export function cropBed(state: GameState, ctx: EngineCtx, quad: QuadrantId): ActionResult {
  const blocked = cropBlocker(state, quad);
  if (blocked) return { ok: false, reason: blocked };
  const p = cropPreview(state, quad)!;
  const g = state.growth;
  const keep = bedKeeps(state);
  let taken = 0;
  for (const c of cellsOf(state, quad)) {
    taken += g.fruit[c] ?? 0;
    g.fruit[c] = 0;
    if (!keep && (g.stage[c] ?? 0) > 0) {
      // The same clearing an ordinary harvest does — growth's own shape.
      g.stage[c] = 0;
      g.age[c] = 0;
      g.fullSince[c] = 0;
    }
  }
  addMaterial(state, p.materialId, 45, p.units);
  const c = ensureCultivar(state);
  const def = strainIn(state, quad)!;
  if (!c.cropped.includes(def.id)) c.cropped.push(def.id);
  ctx.emit({ type: 'cropped', quad, materialId: p.materialId, units: p.units });
  ctx.dirty();
  return { ok: true, data: { units: p.units, materialId: p.materialId, fruit: taken, kept: keep, crossedWith: p.crossedWith } };
}

/** What the panel says — the UI computes nothing. */
export function cultivarRead(state: GameState): Array<{
  quad: QuadrantId; strain: StrainDef | null; vines: number; fruit: number;
  units: number; materialId: string | null; traits: TraitId[]; crossedWith: QuadrantId | null;
  blocker: string | null;
}> {
  return QUADRANTS.map((quad) => {
    const p = cropPreview(state, quad);
    return {
      quad,
      strain: strainIn(state, quad),
      vines: bedVines(state, quad),
      fruit: bedFruit(state, quad),
      units: p?.units ?? 0,
      materialId: p?.materialId ?? null,
      traits: p?.traits ?? [],
      crossedWith: p?.crossedWith ?? null,
      blocker: cultivarBuilt(state) ? cropBlocker(state, quad) : 'The Cultivar Bench is not standing.',
    };
  });
}

export { STRAINS, TRAITS };
