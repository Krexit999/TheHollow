/**
 * THE SIEVE — SORTING (§14.3, §13, keystone at Siever's Rest 98).
 *
 * "A filter is a saved predicate. Assign to any machine's input; filters chain,
 * and rejects route onward."
 *
 * WHAT IT UNLOCKS IS A VERB, not a number (LAW 4). Before this, every machine in
 * the plant took whatever was biggest — `crushable` sorts by count and the
 * Circuit's `run the Crusher` row takes the top of that list. There was no way
 * to say what a machine was FOR. §25.5's first automation problem ("it consumes
 * what you were saving") shipped with the blunt answer the section asks for: a
 * RESERVE flag, one tap, `qol.pins`, untouchable. This is the honest one, and
 * the sentence it has to be able to say is §25.5's own:
 *
 *     CRUSH ONLY STONE UNDER FAIR
 *
 * A pin cannot say that. A pin names a stack; this names a PROPERTY, so it goes
 * on applying to stone you have not mined yet.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOT A PUNISHMENT (§14.3, and it is the load-bearing sentence).
 *
 * A machine with NO filter behaves exactly as it did before this file existed —
 * bit-identical, asserted. Nothing is ever silently destroyed: a filter DECIDES
 * WHAT IS TAKEN, and what is not taken is simply still in the Hold. The spine's
 * "machines with no filter idle, showing `no target`" is the late-game shape
 * where every machine is fed by a Line; applying it now would turn a working
 * plant off the day the Sieve is raised, which is the opposite of a keystone.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TIERS ARE CAPABILITY (§15.4), and each one is a sentence the last could not say:
 *
 *   I    ONE CLAUSE           "only what is dense", or "only under Fair"
 *   II   TWO, AND-ED          §14.3's own example, `trait = dense AND purity >= pure`
 *   III  REJECTS ROUTE ONWARD what one machine refuses, the next one is offered
 *
 * PILLAR 2. A filter routes. It cannot change how much a machine returns, how
 * often it fires, or what it costs — only WHICH of the things already in the
 * Hold it is willing to take. There is no path from this file to `cellCap`,
 * `cellRegen` or `chipYield`.
 *
 * FERRITE READS THIS (E2, §7.2). A MAGNETISED machine "pulls filtered stock one
 * band wider than its filter specifies, which is sometimes exactly wrong" —
 * `bandWiden` is written by `condition.ts` and consumed here, which is the half
 * of that rule that had nowhere to land until the Sieve existed.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { BANDS, bandOf, materialDef, type PurityBand } from '../materials';
import { TRAITS, traitsOf, type TraitId } from '../traits';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { bandWiden } from './condition';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';

/** The wreck the Sieve is found in — Ferrite, Siever's Rest 98 (§6). */
export const SIEVE_WRECK = 'THE SIEVE';

export type ClauseKind = 'trait' | 'band';
export type BandOp = 'atLeast' | 'atMost';

export interface FilterClause {
  kind: ClauseKind;
  /** kind 'trait' */
  trait?: TraitId;
  /** kind 'band' */
  op?: BandOp;
  band?: PurityBand;
}

export interface Filter {
  id: string;
  name: string;
  /** AND-ed. One at tier I, two at tier II+. */
  clauses: FilterClause[];
}

export interface SortingState {
  filters: Filter[];
  /** machineId -> filter id. A machine with no entry takes what it always did. */
  assigned: Record<string, string>;
  /** Rising id counter, so a deleted filter's name cannot be reused by accident. */
  next: number;
}

export function defaultSortingState(): SortingState {
  return { filters: [], assigned: {}, next: 1 };
}

export function ensureSorting(state: GameState): SortingState {
  const s = (state.sorting ??= defaultSortingState());
  s.filters ??= [];
  s.assigned ??= {};
  if (typeof s.next !== 'number' || Number.isNaN(s.next)) s.next = 1;
  return s;
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export function sieveBuilt(state: GameState): boolean {
  return tierOf(state, 'sieve') > 0;
}

/**
 * THE PLACE, THEN THE PRICE — the established shape for every machine in this
 * game (§23's cracked kiln at depth 9, the Shoring Rig at 120, the Floodgate at
 * 430). The Roll shows you the wreck; walking to it makes it yours; cast parts
 * turn it back on.
 */
export function sieveStation(): { shellId: string; depth: number; name: string } | null {
  const found = allAuthoredStations().find((s) => s.def.wreck === SIEVE_WRECK);
  return found ? { shellId: found.shellId, depth: found.def.depth, name: found.def.name } : null;
}

export function sieveFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === SIEVE_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

/** How many clauses this Sieve can AND together. §15.4 as capability. */
export function clauseLimit(state: GameState): number {
  return tierOf(state, 'sieve') >= 2 ? 2 : 1;
}

/** Tier III: what one machine refuses, the next is offered. */
export function rejectsRoute(state: GameState): boolean {
  return tierOf(state, 'sieve') >= 3;
}

export const TIER_CAPABILITY_SIEVE = [
  'not built',
  'one clause — a trait, or a band',
  'two clauses, and-ed together',
  'rejects route onward to the next machine',
] as const;

export function nextSieveTierCost(state: GameState): number | null {
  const t = tierOf(state, 'sieve');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildSieve(state: GameState, ctx: EngineCtx): ActionResult {
  if (!sieveFound(state)) {
    const at = sieveStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Sieve.' };
  }
  const cost = nextSieveTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Sieve is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  // Cheapest-first, exactly as the Crusher does it: the rack is stock, and a
  // legendary head should not go into a chassis for being at the front.
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'sieve', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['sieve'] = tierOf(state, 'sieve') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'sieve', tier: plant.tiers['sieve']! });
  return { ok: true, data: { tier: plant.tiers['sieve'] } };
}

// ---------------------------------------------------------------------------
// The predicate
// ---------------------------------------------------------------------------

/** One clause as a sentence, so a filter reads as English in the panel. */
export function clauseSentence(c: FilterClause): string {
  if (c.kind === 'trait') return `is ${c.trait ?? '?'}`;
  return `${c.op === 'atMost' ? 'is under' : 'is at least'} ${c.band ?? '?'}`;
}

export function filterSentence(f: Filter): string {
  return f.clauses.length === 0 ? 'anything' : f.clauses.map(clauseSentence).join(' and ');
}

/**
 * DOES THIS STONE PASS?
 *
 * `widen` is the Ferrite rule (E2): a MAGNETISED machine accepts one band
 * either side of what its band clause says. It never loosens a TRAIT clause —
 * a magnet pulls harder, it does not change what a thing is made of — which is
 * why "sometimes exactly wrong" is the right description: it brings in stock
 * that is nearly right, and nearly right is what a purity clause exists to
 * exclude.
 */
export function passes(
  filter: Filter, materialId: string, band: PurityBand, widen = 0,
): boolean {
  for (const c of filter.clauses) {
    if (c.kind === 'trait') {
      if (!c.trait || !traitsOf(materialId).includes(c.trait)) return false;
      continue;
    }
    if (!c.band || !c.op) continue;
    const want = BANDS.indexOf(c.band);
    const have = BANDS.indexOf(band);
    if (want < 0 || have < 0) continue;
    if (c.op === 'atLeast' && have < want - widen) return false;
    if (c.op === 'atMost' && have > want + widen) return false;
  }
  return true;
}

export function filterOf(state: GameState, machineId: string): Filter | null {
  const s = state.sorting;
  const id = s?.assigned?.[machineId];
  if (!id) return null;
  return s!.filters.find((f) => f.id === id) ?? null;
}

/**
 * THE ONE FUNCTION EVERY MACHINE ASKS.
 *
 * A machine with no filter says yes to everything, which is what it did before
 * the Sieve existed — so an unfiltered plant is bit-identical and the keystone
 * adds a capability rather than a tax.
 */
export function accepts(
  state: GameState, machineId: string, materialId: string, band: PurityBand,
): boolean {
  const f = filterOf(state, machineId);
  if (!f) return true;
  return passes(f, materialId, band, bandWiden(state, machineId));
}

/**
 * TIER III — REJECTS ROUTE ONWARD. What a filtered machine refused is offered
 * to the next machine that WILL take it, so a two-filter plant sorts a mixed
 * Hold into two streams instead of leaving half of it stranded.
 *
 * Returns the machine the rejected stone should go to, or null. Nothing is ever
 * destroyed either way — a stone nobody wants is a stone still in the Hold.
 */
export function routeReject(
  state: GameState, fromMachine: string, materialId: string, band: PurityBand,
): string | null {
  if (!rejectsRoute(state)) return null;
  for (const id of Object.keys(ensureSorting(state).assigned)) {
    if (id === fromMachine) continue;
    if (tierOf(state, id) <= 0 && !(id === 'kiln' && state.kiln.built)) continue;
    if (accepts(state, id, materialId, band)) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// §14.3's best feature — THE PLANT TELLS YOU WHAT TO GO MINE
// ---------------------------------------------------------------------------

/**
 * "A filter can target a trait you own no material for, and the Roll then flags
 * stations whose seam could satisfy it."
 *
 * This is the reason the Sieve is a keystone and not a settings screen: a
 * predicate is a QUESTION about the world, so writing one down turns the Hold's
 * absence into a destination. LAW 3 holds — it names PLACES you can walk to,
 * never a recipe, and only stations whose authored seam pool could actually
 * produce something the filter would accept.
 */
export function stationsFor(filter: Filter): { shellId: string; name: string; depth: number }[] {
  const out: { shellId: string; name: string; depth: number }[] = [];
  for (const { shellId, def } of allAuthoredStations()) {
    const pool = [...(def.seams ?? []), ...(def.remains ?? []), ...(def.floodSeams ?? [])];
    // A band clause is about PURITY, which is rolled and not a property of the
    // place, so only the trait clauses can be answered by geography. A filter
    // that is bands-only names nowhere, and that is correct rather than empty.
    const traits = filter.clauses.filter((c) => c.kind === 'trait').map((c) => c.trait);
    if (traits.length === 0) continue;
    const hit = pool.some((id) => {
      let t: TraitId[];
      try { t = traitsOf(id); } catch { return false; }
      return traits.every((want) => want !== undefined && t.includes(want));
    });
    if (hit) out.push({ shellId, name: def.name, depth: def.depth });
  }
  return out.sort((a, b) => a.depth - b.depth);
}

/** Have you got anything at all that this filter would take? */
export function heldFor(state: GameState, filter: Filter): number {
  let n = 0;
  for (const [materialId, perMat] of Object.entries(state.materials.stacks)) {
    for (const [band, stack] of Object.entries(perMat)) {
      if (!stack?.count) continue;
      if (passes(filter, materialId, band as PurityBand)) n += stack.count;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// The verbs
// ---------------------------------------------------------------------------

export function addFilter(state: GameState, clauses: FilterClause[]): ActionResult {
  if (!sieveBuilt(state)) return { ok: false, reason: 'No Sieve' };
  const limit = clauseLimit(state);
  const clean = clauses
    .filter((c) => (c.kind === 'trait' ? !!c.trait && c.trait in TRAITS : !!c.band))
    .slice(0, limit);
  if (clean.length === 0) return { ok: false, reason: 'A filter needs at least one clause' };
  if (clauses.length > limit) {
    return { ok: false, reason: `This Sieve holds ${limit} clause${limit === 1 ? '' : 's'}` };
  }
  const s = ensureSorting(state);
  const f: Filter = { id: `f${s.next++}`, name: '', clauses: clean };
  f.name = filterSentence(f);
  s.filters.push(f);
  return { ok: true, data: { id: f.id } };
}

export function removeFilter(state: GameState, filterId: string): ActionResult {
  const s = ensureSorting(state);
  const i = s.filters.findIndex((f) => f.id === filterId);
  if (i < 0) return { ok: false, reason: 'No such filter' };
  s.filters.splice(i, 1);
  for (const [m, id] of Object.entries(s.assigned)) if (id === filterId) delete s.assigned[m];
  return { ok: true };
}

export function assignFilter(state: GameState, machineId: string, filterId: string | null): ActionResult {
  if (!sieveBuilt(state)) return { ok: false, reason: 'No Sieve' };
  const s = ensureSorting(state);
  if (filterId === null) { delete s.assigned[machineId]; return { ok: true }; }
  if (!s.filters.some((f) => f.id === filterId)) return { ok: false, reason: 'No such filter' };
  s.assigned[machineId] = filterId;
  return { ok: true };
}

/** Which machines a filter can be pointed at: the ones the plant knows about. */
export function filterable(state: GameState): string[] {
  const p = ensurePlant(state);
  return Object.keys(p.tiers)
    .filter((id) => id !== 'sieve' && (p.tiers[id] ?? 0) > 0)
    .concat(state.kiln.built ? ['kiln'] : []);
}

export { bandOf, materialDef };
