/**
 * THE CENTRIFUGE — SEPARATION (§13, the wreck at The Long Spin 126).
 *
 * §13: "split an ore into components · ~10 split-only materials."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ELEVEN ARE REAL AND THEY WERE MEASURED FIRST.
 *
 * `scripts/material-sources.ts` (written this pass, the producer side of
 * `material-audit.ts`) walks every producing path in the engine and finds
 * ELEVEN materials nothing reaches. `content/splits.ts` carries the list and
 * where each row came from. One of them, `steelcasting`, is REQUIRED by a
 * keystone (`keystones.ts`), so the defect was not an unused material — it was
 * an unsatisfiable GATE.
 *
 * This is therefore the rare case where §13 and the codebase agree: the spine
 * says a machine should produce ~10 split-only materials, the game has 11 with
 * no producer, and they are the same kind of thing (worked intermediates whose
 * benches were cut at A.72). Building the machine closes the list.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT UNLOCKS IS A VERB (LAW 4): an ore stops being one thing. Every other
 * converter in this game moves a unit ALONG — up a band, down a trait, into a
 * shape, across the ledger. This one takes a unit APART, and what comes out is
 * two things that were never separately diggable.
 *
 * TIERS ARE CAPABILITY (§15.4), and each is a different sentence:
 *   I    THE MAJORITY COMPONENT — what the ore is mostly made of
 *   II   EVERY COMPONENT, which is what makes the second one reachable at all
 *   III  IT TAKES WORKED STOCK TOO, not only ore
 *
 * PILLAR 2. A spin is STRICTLY LOSSY IN UNITS (three in, at most two out), lands
 * at the input's own band and never above it, cannot touch a currency, and there
 * is no path from this file to `cellCap`, `cellRegen` or `chipYield`.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { materialDef, type PurityBand } from '../materials';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { conditionOf, machineSpeed } from './condition';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';
import { SPLITS, SPLIT_BY_ORE, splitOnly, type SplitDef } from '../content/splits';
import { deliver } from './witness';

/** The wreck it is found in — Ferrite, The Long Spin 126. */
export const CENTRIFUGE_WRECK = 'THE CENTRIFUGE';

export const TIER_CAPABILITY_CENTRIFUGE = [
  'not built',
  'what the ore is mostly made of',
  'every component, not only the first',
  '...and worked stock too, not only ore',
] as const;

export function centrifugeStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === CENTRIFUGE_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function centrifugeFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === CENTRIFUGE_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function centrifugeBuilt(state: GameState): boolean {
  return tierOf(state, 'centrifuge') > 0;
}

/** Tier II: everything comes out, not only the majority. */
export function fullSeparation(state: GameState): boolean {
  return tierOf(state, 'centrifuge') >= 2;
}

/** Tier III: worked stock goes in the drum too. */
export function takesWorked(state: GameState): boolean {
  return tierOf(state, 'centrifuge') >= 3;
}

export function nextCentrifugeTierCost(state: GameState): number | null {
  const t = tierOf(state, 'centrifuge');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildCentrifuge(state: GameState, ctx: EngineCtx): ActionResult {
  if (!centrifugeFound(state)) {
    const at = centrifugeStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Centrifuge.' };
  }
  const cost = nextCentrifugeTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Centrifuge is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'centrifuge', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['centrifuge'] = tierOf(state, 'centrifuge') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'centrifuge', tier: plant.tiers['centrifuge']! });
  return { ok: true, data: { tier: plant.tiers['centrifuge'] } };
}

// ---------------------------------------------------------------------------
// The spin
// ---------------------------------------------------------------------------

/** What this Centrifuge would give back for this ore, at this tier. */
export function componentsOf(state: GameState, materialId: string): string[] {
  const def = SPLIT_BY_ORE.get(materialId);
  if (!def || !centrifugeBuilt(state)) return [];
  return fullSeparation(state) ? [...def.out] : def.out.slice(0, 1);
}

export function splitDef(materialId: string): SplitDef | undefined {
  return SPLIT_BY_ORE.get(materialId);
}

export function spinBlocker(
  state: GameState, materialId: string, band: PurityBand,
): string | null {
  if (!centrifugeBuilt(state)) return 'The Centrifuge is not standing.';
  if (conditionOf(state, 'centrifuge')?.seized) return 'It has cracked. Re-cast it before it will run.';
  const def = SPLIT_BY_ORE.get(materialId);
  if (!def) {
    let name = materialId;
    let worked = false;
    try { const d = materialDef(materialId); name = d.name; worked = !!d.worked; } catch { /* unknown */ }
    return worked && !takesWorked(state)
      ? `${name} has already been worked. This drum takes ore.`
      : `${name} does not come apart into anything.`;
  }
  let d;
  try { d = materialDef(materialId); } catch { return 'No such stone.'; }
  if (d.worked && !takesWorked(state)) {
    return `${d.name} has already been worked. This drum takes ore.`;
  }
  const stack = state.materials.stacks[materialId]?.[band];
  if (!stack || stack.count < def.units) {
    return `A spin takes ${def.units} ${d.name} at one band. You have ${stack?.count ?? 0}.`;
  }
  return null;
}

/**
 * SPIN IT. Three units in, one or two out — the loss is the separation, and it
 * is what keeps a machine that reaches otherwise-unreachable stock from also
 * being the cheap way to hold stock.
 *
 * The band is the INPUT'S, never better: a Centrifuge is not a Refinery, and a
 * separation that also purified would be two machines in one costume.
 */
export function spin(
  state: GameState, ctx: EngineCtx, materialId: string, band: PurityBand,
): ActionResult {
  const blocked = spinBlocker(state, materialId, band);
  if (blocked) return { ok: false, reason: blocked };
  const def = SPLIT_BY_ORE.get(materialId)!;
  const perMat = state.materials.stacks[materialId]!;
  const stack = perMat[band]!;
  const purity = stack.puritySum / stack.count;
  stack.count -= def.units;
  stack.puritySum -= purity * def.units;
  if (stack.count <= 0) delete perMat[band];

  const out = componentsOf(state, materialId);
  for (const id of out) {
    // Through the delivery seam, so E2's Hollow rule and the Governor's
    // off-spec roll reach this machine like every other converter.
    deliver(state, 'centrifuge', id, purity, 1);
    state.materials.totalDrops -= 1;   // a separation is a conversion, not a find
  }
  ctx.emit({ type: 'spun', materialId, out });
  ctx.dirty();
  return { ok: true, data: { out, spent: def.units } };
}

/**
 * WHAT IS IN THE DRUM'S REACH RIGHT NOW — ore you hold enough of. LAW 3: the
 * destinations, never a catalogue of every ore the machine will ever take.
 */
export function spinnable(
  state: GameState,
): { materialId: string; name: string; band: PurityBand; count: number; out: string[]; line: string }[] {
  if (!centrifugeBuilt(state)) return [];
  const rows: { materialId: string; name: string; band: PurityBand; count: number; out: string[]; line: string }[] = [];
  for (const [materialId, perMat] of Object.entries(state.materials.stacks)) {
    const def = SPLIT_BY_ORE.get(materialId);
    if (!def) continue;
    for (const [band, stack] of Object.entries(perMat)) {
      if (!stack || stack.count < def.units) continue;
      rows.push({
        materialId,
        name: (() => { try { return materialDef(materialId).name; } catch { return materialId; } })(),
        band: band as PurityBand,
        count: stack.count,
        out: componentsOf(state, materialId),
        line: def.line,
      });
    }
  }
  return rows.sort((a, b) => b.count - a.count);
}

/** The speed the drum runs at — E2 and the Governor both land here. */
export function spinSpeed(state: GameState): number {
  return machineSpeed(state, 'centrifuge');
}

export { SPLITS, splitOnly };
