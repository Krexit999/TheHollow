/**
 * THE QUENCH TANK — TEMPERING A PART (§13), in the wreck at The Slake, Cinder 96.
 *
 * §13: "treat a finished part in a medium · blocks tier XI+ stats."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT ALREADY EXISTED, AND WHY IT IS NOT THIS.
 *
 * `systems/tempering.ts` has shipped six quench media since v14 and it treats
 * THE TOOL: a temper is a CONDITION that pays when your situation matches it.
 * §13's Quench Tank treats a finished PART, which is a different noun and a
 * different verb, and §19's Hollow row says exactly what the difference buys:
 *
 *   > a part quenched in Hush FORGETS ITS INSTABILITY — the only way to seat a
 *   > tier-XIII tool that would otherwise be unstable
 *
 * That is §13's "blocks tier XI+ stats", authored elsewhere in the same spine
 * and never wired to anything. So the tank does not re-implement tempering; it
 * takes the SAME media (LAW 6 — systems layer, they never replace) and points
 * them at a part instead of at a tool.
 *
 * ITEM 11, ANSWERED BY MEASUREMENT. A.84 found the quench trough was Ferrite-era
 * furniture wanting Cinder and Verdance stock. Of the six media, exactly one
 * (`sap`) costs no material beyond the common Temper Ash — and A.84's own
 * `risingAsh` chain (gravemote + ochre) put Temper Ash in a LOAM player's hands
 * for the first time. So the trough opens on something now, and the other five
 * arrive with their shells. `quench.test.ts` §0 holds that measurement.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHICH MEDIUM WILL TAKE WHICH PART — one rule, and it is a rule this game now
 * uses twice. **A medium only takes a part whose material SHARES A TRAIT with
 * it** (`pairClass`, the Reaction Bench's own heuristic). A quench is a
 * conversation between two stones, exactly like a pour, and a player who worked
 * the rule out at the bench already knows it here.
 *
 * TIERS ARE CAPABILITY (§15.4) — three sentences:
 *   I    THE COLD DIP  — a part on the rack comes out steadier
 *   II   THE HOT SEAT  — ...and a part already IN the tool, without breaking it
 *   III  THE DEEP QUENCH — the part FORGETS what was put into it (§19)
 *
 * Tier III is the one that matters and it is deliberately the last: A.92 made an
 * over-filled stone SHAKE (`INST_PER_OVERFILLED`), which is the price §14.1
 * attaches to the Infuser. A tier-III tank pays that price off for one part —
 * so the two machines are a pair of scissors rather than two knobs.
 *
 * PILLAR 2. A quench writes one field on a part and consumes materials. Its
 * whole effect is a `steady` term inside `instability()`, which is a
 * RELIABILITY axis with no path to `harvestCell` — the same reason the
 * stabilise axis was allowed to exist at all.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { materialDef } from '../materials';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { conditionOf } from './condition';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';
import { consumeMaterial, materialCount } from './forge';
import { TEMPERS, TEMPER_BY_ID, ASH_COST, type TemperDef } from './tempering';
import { pairClass } from './reaction';
import type { RackPart } from './casting';

/** The wreck it is found in — Cinder, The Slake 96. */
export const QUENCH_WRECK = 'THE QUENCH TANK';

/**
 * WHAT A TREATED PART IS WORTH IN STEADINESS. Sized against the two constants
 * it sits between (`toolMods.ts`): `INST_PER_OVERFILLED` is 9 and
 * `INST_PER_SYNERGY` is 12. Seven means a quench takes most of one over-filled
 * trait off a part and never all of it — the Infuser's price stays a price, and
 * only a tier-III tank clears it outright.
 */
export const STEADY_PER_QUENCH = 7;

export const TIER_CAPABILITY_QUENCH = [
  'not built',
  'the cold dip — a part on the rack comes out steadier',
  '...and a part already seated, without breaking the tool',
  '...and the part forgets what was put into it',
] as const;

export function quenchStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === QUENCH_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function quenchFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === QUENCH_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function quenchBuilt(state: GameState): boolean {
  return tierOf(state, 'quench') > 0;
}

/** Tier II: the tank takes a part that is already in the tool. */
export function takesSeated(state: GameState): boolean {
  return tierOf(state, 'quench') >= 2;
}

/** Tier III: §19's Hollow row — the part forgets what was put into it. */
export function forgets(state: GameState): boolean {
  return tierOf(state, 'quench') >= 3;
}

export function nextQuenchTierCost(state: GameState): number | null {
  const t = tierOf(state, 'quench');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildQuenchTank(state: GameState, ctx: EngineCtx): ActionResult {
  if (!quenchFound(state)) {
    const at = quenchStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Quench Tank.' };
  }
  const cost = nextQuenchTierCost(state);
  if (cost === null) return { ok: false, reason: 'The tank is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'quench', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['quench'] = tierOf(state, 'quench') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'quench', tier: plant.tiers['quench']! });
  return { ok: true, data: { tier: plant.tiers['quench'] } };
}

// ---------------------------------------------------------------------------
// The verb
// ---------------------------------------------------------------------------

/** Every part the tank can see, rack first, then the tool if the tier allows. */
export function reachableParts(state: GameState): Array<{ part: RackPart; where: 'rack' | 'tool' }> {
  const out: Array<{ part: RackPart; where: 'rack' | 'tool' }> = [];
  for (const p of state.casting?.rack ?? []) out.push({ part: p, where: 'rack' });
  if (takesSeated(state)) for (const p of state.casting?.tool ?? []) out.push({ part: p, where: 'tool' });
  return out;
}

function findPart(state: GameState, partId: number): { part: RackPart; where: 'rack' | 'tool' } | null {
  const inRack = (state.casting?.rack ?? []).find((p) => p.id === partId);
  if (inRack) return { part: inRack, where: 'rack' };
  const inTool = (state.casting?.tool ?? []).find((p) => p.id === partId);
  if (inTool) return { part: inTool, where: 'tool' };
  return null;
}

/** A medium only takes a part it has something in common with. */
export function mediumTakes(mediumId: string, materialId: string): boolean {
  const def = TEMPER_BY_ID.get(mediumId);
  if (!def) return false;
  return pairClass(def.medium, materialId) === 'shares';
}

/** Which of the six media would take this part — LAW 3, and it is derived. */
export function mediaFor(materialId: string): TemperDef[] {
  return TEMPERS.filter((t) => mediumTakes(t.id, materialId));
}

export function quenchCost(mediumId: string): { ash: number; medium: number; mediumId: string } | null {
  const def = TEMPER_BY_ID.get(mediumId);
  if (!def) return null;
  return { ash: ASH_COST, medium: def.mediumCost, mediumId: def.medium };
}

export function quenchBlocker(state: GameState, partId: number, mediumId: string): string | null {
  if (!quenchBuilt(state)) return 'The Quench Tank is not standing.';
  if (conditionOf(state, 'quench')?.seized) return 'The tank has cracked. Re-cast it before it will hold.';
  const found = findPart(state, partId);
  if (!found) return 'No such part.';
  if (found.where === 'tool' && !takesSeated(state)) {
    return 'That one is in the tool. This tank only takes a part off the rack.';
  }
  const def = TEMPER_BY_ID.get(mediumId);
  if (!def) return 'No such medium.';
  if (found.part.quench === mediumId) return 'It has already been through that.';
  if (!mediumTakes(mediumId, found.part.materialId)) {
    let name = found.part.materialId;
    try { name = materialDef(found.part.materialId).name; } catch { /* unnamed */ }
    return `${def.name} has nothing in common with ${name}. It would come straight back out.`;
  }
  if (materialCount(state, 'temperash') < ASH_COST) return `${ASH_COST} Temper Ash to line the tank`;
  if (def.mediumCost > 0 && materialCount(state, def.medium) < def.mediumCost) {
    let name = def.medium;
    try { name = materialDef(def.medium).name; } catch { /* unnamed */ }
    return `${def.mediumCost} ${name} for the bath`;
  }
  return null;
}

export function quenchPart(
  state: GameState, ctx: EngineCtx, partId: number, mediumId: string,
): ActionResult {
  const blocked = quenchBlocker(state, partId, mediumId);
  if (blocked) return { ok: false, reason: blocked };
  const def = TEMPER_BY_ID.get(mediumId)!;
  const found = findPart(state, partId)!;
  consumeMaterial(state, 'temperash', ASH_COST);
  if (def.mediumCost > 0) consumeMaterial(state, def.medium, def.mediumCost);
  const previous = found.part.quench ?? null;
  found.part.quench = mediumId;
  ctx.emit({ type: 'partQuenched', partId, mediumId });
  ctx.dirty();
  return { ok: true, data: { partId, mediumId, previous, where: found.where } };
}

// ---------------------------------------------------------------------------
// What the tool does about it — read by `toolMods.instability`
// ---------------------------------------------------------------------------

/**
 * HOW MUCH STEADIER A TOOL IS FOR WHAT HAS BEEN THROUGH THE TANK, and how many
 * of its over-filled traits the tank has taught it to forget.
 *
 * Both answers live here so `toolMods` need not import a machine to ask — the
 * same arrangement `naturalTraits` has with the Infuser (A.92).
 */
export function quenchedSteady(state: GameState, parts: Array<{ quench?: string }>): number {
  if (!quenchBuilt(state)) return 0;
  return parts.reduce((n, p) => n + (p.quench ? STEADY_PER_QUENCH : 0), 0);
}

/** §19: a quenched part forgets what was put into it — tier III only. */
export function forgetsOverfill(state: GameState, part: { quench?: string }): boolean {
  return forgets(state) && !!part.quench;
}
