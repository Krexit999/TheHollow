/**
 * THE ALLOY CRUCIBLE — ALLOYING (§14.2, §13, keystone at Alloyer's End 70).
 *
 * "Pour 2–4 metals in a ratio; valid ratios are a sparse set in a large space.
 * Discovery by guessing, cheaply — an invalid ratio gives grog (filler), not
 * nothing, so experimenting costs almost nothing."
 *
 * WHAT IT UNLOCKS IS A VERB (LAW 4): you can make a material that does not
 * exist. Every other converter in this game moves stone along a ladder the
 * registry already holds — the Kiln to Brick, the Crusher to grit, the Refinery
 * up a band, the Still one trait down. This one makes a NEW ENTRY.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT IS MANDATORY, in §14.2's own words: "tier V Bindings need a 3-trait
 * material and Ferrite ore carries two."
 *
 * MEASURED, because a sentence in the spine is not evidence — and the first
 * draft of this comment said something stronger and false. Every shell CAN dig
 * a three-trait stone; there are nine of them in the game. But every single one
 * is `starred` or `aberrant`, which are the last two rungs of the rarity ladder
 * (110 and 150 of Loam's 150). One or two per world, all in the bottom third.
 *
 * So the claim that survives measurement is the one that matters: a three-trait
 * material EARLIER THAN THE BOTTOM OF A SHELL cannot be dug, and a three-trait
 * material OF A CHOSEN SET cannot be dug at any depth. Both can be poured.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE ALLOY IS A REAL MATERIAL, registered at the moment it is first poured —
 * the same mechanism the Still's stilled forms use (`registerMaterial`), and
 * for the same reason: `traitsOf`, `partTraits`, `derivePart`, coherence,
 * balance, the clone check and the Codex all read it correctly on the day it
 * exists, and nothing downstream had to be taught a second concept.
 *
 * SO THE "~60 DISCOVERABLE ALLOYS" ARE NOT AUTHORED, they are FOUND. An alloy
 * is identified by its SHELL and its TRAIT SET, never by its recipe — which is
 * the discovery §14.2 is describing. Two different pours that land on the same
 * traits are the same alloy, and finding a cheaper route to one you already
 * know is itself a discovery.
 *
 * TIERS ARE CAPABILITY (§15.4):
 *   I    TWO metals
 *   II   THREE — and three is where a third trait starts being reachable
 *   III  FOUR, and the pour keeps the best purity instead of the average
 *
 * PILLAR 2. A pour is STRICTLY LOSSY IN UNITS: two to six units go in and ONE
 * comes out, always. It cannot raise a rarity — an alloy is only as good as its
 * worst metal — and there is no path from this file to `cellCap`, `cellRegen`
 * or `chipYield`.
 *
 * WHAT IS CUT: §14.2's ALLOY-ONLY TRAITS, `poled` and `sympathetic`. `TraitId`
 * is a closed union of ten and `TRAITS`, `FORGE_TRAITS`, `HEFT`, `GRADE_BONUS`
 * and `MATERIAL_TRAITS` are all Records over it; adding two means an entry in
 * every one, each of which is a balance decision in the most load-bearing
 * system in the game. Ledgered, with the reason, rather than half-added. The
 * verb does not depend on them: a 3-trait material out of ordinary stone is
 * already something no shell can dig.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import {
  MATERIALS, RARITIES, bandOf, materialDef, registerMaterial,
  type MaterialDef, type MaterialRarity,
} from '../materials';
import { MATERIAL_TRAITS, TRAITS, traitsOf, type TraitId } from '../traits';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { machineSpeed } from './condition';
import { addMaterial, materialCount } from './forge';
import { deliver } from './witness';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';

/** The wreck it is found in — Ferrite, Alloyer's End 70 (§6). */
export const CRUCIBLE_WRECK = 'THE ALLOY CRUCIBLE';

/** The most units one pour may take. A pour is small; a smelter is not. */
export const POUR_MAX_UNITS = 6;

/**
 * HOW MUCH OF THE POUR A TRAIT MUST BE TO SURVIVE IT.
 *
 * A quarter. Two metals at 1:1 both clear it, so a plain half-and-half pour
 * keeps everything and lands four traits — and 1:5 does not, so the minority
 * metal is there to be TASTED rather than counted. This is the one number that
 * decides what a ratio is FOR, which is why it is a constant with a name.
 */
export const TRAIT_SHARE = 0.25;

/** §7.4 rule 1: a material carries at most four traits, hard. */
export const MAX_ALLOY_TRAITS = 4;

/** What an invalid ratio gives back. Filler, never nothing. */
export const GROG = 'grog';

export const TIER_CAPABILITY_CRUCIBLE = [
  'not built',
  'two metals',
  'three metals — where a third trait starts',
  'four metals, and it keeps the best purity',
] as const;

export interface CrucibleState {
  /** Alloy ids ever poured. The Codex; survives everything. */
  found: string[];
  /** Pours that came out grog — the cost of guessing, counted. */
  grog: number;
  /**
   * THE WIDEST POUR THIS SAVE HAS MADE, in metals. §4's Seat II asks for "a
   * four-metal alloy", which is a fact about the POUR and not about the stone
   * that came out — a four-metal pour can blend down to two surviving traits
   * and it is still a four-metal alloy. Absent on every save written before
   * this, which reads as zero: nobody was counting.
   */
  widest?: number;
}

/** The widest pour this save has made, in metals. §4, Seat II. */
export function widestPour(state: GameState): number {
  return state.crucible?.widest ?? 0;
}

export function defaultCrucibleState(): CrucibleState {
  return { found: [], grog: 0, widest: 0 };
}

export function ensureCrucible(state: GameState): CrucibleState {
  const c = (state.crucible ??= defaultCrucibleState());
  c.found ??= [];
  if (typeof c.grog !== 'number' || Number.isNaN(c.grog)) c.grog = 0;
  if (typeof c.widest !== 'number' || Number.isNaN(c.widest)) c.widest = 0;
  return c;
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export function crucibleStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === CRUCIBLE_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function crucibleFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === CRUCIBLE_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function crucibleBuilt(state: GameState): boolean {
  return tierOf(state, 'crucible') > 0;
}

/** How many DIFFERENT metals one pour may hold. §15.4 as capability. */
export function metalLimit(state: GameState): number {
  return Math.min(4, 1 + tierOf(state, 'crucible'));
}

/** Tier III: the pour keeps the best purity instead of the weighted average. */
export function keepsBestPurity(state: GameState): boolean {
  return tierOf(state, 'crucible') >= 3;
}

export function nextCrucibleTierCost(state: GameState): number | null {
  const t = tierOf(state, 'crucible');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildCrucible(state: GameState, ctx: EngineCtx): ActionResult {
  if (!crucibleFound(state)) {
    const at = crucibleStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Crucible.' };
  }
  const cost = nextCrucibleTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Crucible is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'crucible', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['crucible'] = tierOf(state, 'crucible') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'crucible', tier: plant.tiers['crucible']! });
  return { ok: true, data: { tier: plant.tiers['crucible'] } };
}

// ---------------------------------------------------------------------------
// The ratio
// ---------------------------------------------------------------------------

export interface PourPart { materialId: string; count: number }

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

/**
 * IS THIS A RATIO AT ALL? §14.2 wants "a sparse set in a large space", and the
 * sparseness has to be a RULE the player can eventually see rather than a table
 * they have to be told.
 *
 * A pour is a ratio only in LOWEST TERMS. 2:2 is not a ratio, it is 1:1 poured
 * twice — so it gives grog, and the player who tries it learns something true
 * about the machine rather than about a list. Coprimality across 2–4 numbers
 * summing to at most six leaves a genuinely sparse set: 1:1, 1:2, 1:3, 1:4,
 * 1:5, 2:3, 1:1:1, 1:1:2, 1:2:3, 1:1:1:1 and their permutations, and nothing
 * else.
 */
export function isRatio(parts: PourPart[]): boolean {
  if (parts.length < 2) return false;
  if (parts.some((p) => p.count < 1)) return false;
  const total = parts.reduce((n, p) => n + p.count, 0);
  if (total > POUR_MAX_UNITS) return false;
  return parts.map((p) => p.count).reduce((a, b) => gcd(a, b)) === 1;
}

/**
 * WHAT COMES OUT OF THIS BLEND, before anything is spent. Pure, so the panel
 * can state the destination and the tests can sweep the space.
 *
 * A trait survives if the metals carrying it are at least a QUARTER of the
 * pour. The four strongest survivors make the alloy (§7.4 rule 1's hard cap),
 * and ties break by the canonical trait order so the same pour is always the
 * same alloy.
 */
export function blendTraits(parts: PourPart[]): TraitId[] {
  const total = parts.reduce((n, p) => n + p.count, 0);
  if (total <= 0) return [];
  const weight = new Map<TraitId, number>();
  for (const p of parts) {
    let ts: TraitId[];
    try { ts = traitsOf(p.materialId); } catch { continue; }
    for (const t of ts) weight.set(t, (weight.get(t) ?? 0) + p.count / total);
  }
  return [...weight.entries()]
    .filter(([, w]) => w >= TRAIT_SHARE - 1e-9)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_ALLOY_TRAITS)
    .map(([t]) => t)
    .sort();
}

/**
 * AN ALLOY IS ITS SHELL AND ITS TRAIT SET, never its recipe.
 *
 * That is what makes this DISCOVERY rather than a recipe book: you are hunting
 * a set of properties, two routes to the same set are the same alloy, and
 * finding a cheaper route to one you already know is itself worth something.
 */
export function alloyId(shellId: string, traits: TraitId[]): string {
  return `alloy_${shellId}_${[...traits].sort().join('')}`;
}

function alloyName(traits: TraitId[]): string {
  return `${traits.map((t) => TRAITS[t].name).join('-')} Alloy`;
}

export interface PourPreview {
  ok: boolean;
  /** Why it will be grog, if it will be. */
  reason?: string;
  traits: TraitId[];
  alloyId: string;
  name: string;
  rarity: MaterialRarity;
  purity: number;
  units: number;
}

/**
 * THE RARITY IS THE WORST METAL'S, and that is the rule that stops this being a
 * laundry. Pouring one flawless unit into five commons must not produce a
 * flawless alloy; an alloy is only as good as the poorest thing in it.
 */
function worstRarity(parts: PourPart[]): MaterialRarity {
  let worst = RARITIES.length - 1;
  for (const p of parts) {
    try { worst = Math.min(worst, RARITIES.indexOf(materialDef(p.materialId).rarity)); } catch { /* skip */ }
  }
  return RARITIES[Math.max(0, worst)]!;
}

function heldPurity(state: GameState, materialId: string): number {
  const per = state.materials.stacks[materialId] ?? {};
  let sum = 0; let n = 0;
  for (const s of Object.values(per)) { if (s) { sum += s.puritySum; n += s.count; } }
  return n > 0 ? sum / n : 0;
}

export function pourPreview(state: GameState, parts: PourPart[]): PourPreview {
  const shellId = (state.shell?.current ?? 'loam');
  const traits = blendTraits(parts);
  const id = alloyId(shellId, traits);
  const rarity = worstRarity(parts);
  const total = parts.reduce((n, p) => n + p.count, 0);
  const purity = keepsBestPurity(state)
    ? Math.max(0, ...parts.map((p) => heldPurity(state, p.materialId)))
    : parts.reduce((n, p) => n + heldPurity(state, p.materialId) * p.count, 0) / Math.max(1, total);
  const base = {
    traits, alloyId: id, name: alloyName(traits), rarity, purity, units: total,
  };
  if (!isRatio(parts)) {
    return { ...base, ok: false, reason: 'That is not a ratio — it will come out grog.' };
  }
  if (traits.length < 2) {
    return { ...base, ok: false, reason: 'Nothing survives the pour in quantity — grog.' };
  }
  const same = diggableWith(shellId, traits);
  if (same) {
    return {
      ...base,
      ok: false,
      reason: `That is ${materialDef(same).name}, and you can dig it. Grog.`,
    };
  }
  return { ...base, ok: true };
}

/**
 * IS THERE ALREADY A STONE IN THIS SHELL THAT IS EXACTLY THESE TRAITS?
 *
 * If so the pour is not a discovery, and it comes out grog. Found by the clone
 * check on this file's own first run: a 5:1 pour keeps only the majority
 * metal's traits, so `Dense-Tough Alloy` derived bit for bit as Ironbloom —
 * the eighth clone in this project's history and the first one a MECHANISM
 * would have produced on demand rather than an author.
 *
 * So the rule closes the class structurally instead of catching one instance:
 * an alloy is a thing that does not exist, or it is grog. It also gives the
 * lesson §14.2 wants — "a pour that keeps only one metal is that metal" is a
 * true thing about the machine, learnable by trying it once.
 */
export function diggableWith(shellId: string, traits: TraitId[]): string | null {
  const want = [...traits].sort().join('|');
  const hit = MATERIALS.find((m) => m.shellId === shellId && m.source !== 'alloy' && !m.worked
    && [...traitsOf(m.id)].sort().join('|') === want);
  return hit?.id ?? null;
}

export function pourBlocker(state: GameState, parts: PourPart[]): string | null {
  if (!crucibleBuilt(state)) return 'The Crucible is not standing.';
  if (machineSpeed(state, 'crucible') <= 0) return 'It has cracked. Re-cast it before it will run.';
  if (parts.length < 2) return 'A pour wants at least two metals.';
  const limit = metalLimit(state);
  if (parts.length > limit) return `This Crucible holds ${limit} metals.`;
  if (new Set(parts.map((p) => p.materialId)).size !== parts.length) {
    return 'Two of those are the same metal.';
  }
  for (const p of parts) {
    let def: MaterialDef;
    try { def = materialDef(p.materialId); } catch { return 'No such metal.'; }
    if (materialCount(state, p.materialId) < p.count) {
      return `Needs ${p.count} ${def.name} — the Hold has ${materialCount(state, p.materialId)}.`;
    }
  }
  if (parts.reduce((n, p) => n + p.count, 0) > POUR_MAX_UNITS) {
    return `A pour takes at most ${POUR_MAX_UNITS} units.`;
  }
  return null;
}

/**
 * POUR IT. Every unit is spent whether it works or not — §14.2's "experimenting
 * costs almost nothing" is about the PRICE being small, not about it being free,
 * and a guess that costs nothing teaches nothing.
 */
export function pour(state: GameState, ctx: EngineCtx, parts: PourPart[]): ActionResult {
  const blocked = pourBlocker(state, parts);
  if (blocked) return { ok: false, reason: blocked };
  const preview = pourPreview(state, parts);

  // SPEND FIRST, and spend the same whichever way it goes.
  for (const p of parts) {
    let need = p.count;
    const per = state.materials.stacks[p.materialId]!;
    for (const band of Object.keys(per) as (keyof typeof per)[]) {
      const s = per[band];
      if (!s || need <= 0) continue;
      const take = Math.min(need, s.count);
      s.puritySum -= (s.puritySum / s.count) * take;
      s.count -= take;
      need -= take;
      if (s.count <= 0) delete per[band];
    }
  }

  const c = ensureCrucible(state);
  // COUNTED WHETHER IT WORKS OR NOT — a grog pour of four metals was still a
  // four-metal pour, and the doc's condition is about what you attempted.
  c.widest = Math.max(c.widest ?? 0, parts.length);
  if (!preview.ok) {
    c.grog += 1;
    ensureGrog();
    addMaterial(state, GROG, 20, 1);
    state.materials.totalDrops -= 1;
    ctx.emit({ type: 'poured', alloyId: GROG, traits: [], grog: true });
    ctx.dirty();
    return { ok: true, data: { grog: true, spent: preview.units } };
  }

  const def = ensureAlloy(state.shell?.current ?? 'loam', preview.traits, preview.rarity);
  const got = deliver(state, 'crucible', def.id, preview.purity, 1);
  // A POUR IS A CONVERSION, NOT A FIND. `addMaterial` counts drops.
  state.materials.totalDrops -= 1;
  const fresh = !c.found.includes(def.id);
  if (fresh) c.found.push(def.id);
  ctx.emit({ type: 'poured', alloyId: got, traits: preview.traits, grog: false });
  ctx.dirty();
  return { ok: true, data: { alloyId: got, traits: preview.traits, fresh, spent: preview.units } };
}

/**
 * THE ALLOY REGISTERS ITSELF. Idempotent, and only ever ADDS — the same shape
 * `registerStilledForm` uses, and the reason both work without teaching the
 * Forge anything.
 */
export function ensureAlloy(shellId: string, traits: TraitId[], rarity: MaterialRarity): MaterialDef {
  const id = alloyId(shellId, traits);
  const already = MATERIALS.find((m) => m.id === id);
  if (already) return already;
  const src = MATERIALS.find((m) => m.shellId === shellId && !m.worked && !m.source)
    ?? MATERIALS[0]!;
  const def: MaterialDef = {
    id,
    name: alloyName(traits),
    shellId,
    rarity,
    palette: src.palette,
    facets: Math.min(11, 4 + traits.length * 2),
    shimmer: 'soft',
    flavor: `Poured, not dug. It is ${traits.join(', ')}, and nothing in this shell is all of those at once.`,
    // NEVER IN A POOL AND NEVER IN A SEAM. You cannot dig one up.
    source: 'alloy',
  };
  registerMaterial(def);
  MATERIAL_TRAITS[id] = [...traits];
  return def;
}

function ensureGrog(): void {
  if (MATERIALS.some((m) => m.id === GROG)) return;
  registerMaterial({
    id: GROG,
    name: 'Grog',
    shellId: 'loam',
    rarity: 'common',
    palette: ['#3a3630', '#5e574c', '#8a8071'],
    facets: 3,
    shimmer: 'none',
    flavor: 'What a pour that was not a ratio comes out as. It is not nothing, and that is the whole of its case.',
    worked: true,
  });
  MATERIAL_TRAITS[GROG] = ['brittle'];
}

/** Alloys this save has poured, for the Codex line. */
export function alloysFound(state: GameState): { id: string; name: string; traits: TraitId[] }[] {
  return ensureCrucible(state).found.map((id) => ({
    id,
    name: (() => { try { return materialDef(id).name; } catch { return id; } })(),
    traits: traitsOf(id),
  }));
}

export { bandOf };
