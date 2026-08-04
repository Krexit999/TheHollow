/**
 * THE WITNESS AND THE CONDENSER — WITNESSING (§13, §19, §7.2), Hollow.
 *
 * §13:  WITNESS ★    fix undecided material into named material — "Hollow's
 *                    entire material economy"
 *       CONDENSER ★  null residue → Hush — "what a Witness spends"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE SYSTEM, NOT TWO — which is what the brief asked for and what §7.2 was
 * already halfway to.
 *
 * E2 shipped Hollow's rule at A.90: "an unattended machine's output arrives
 * UNDECIDED", and what got built was the half a machine could hold on its own —
 * the machine will not commit to a purity BAND, and looking at the plant settles
 * it. The other half of that sentence is the OUTPUT, and it had nowhere to go
 * because nothing in the game could take an undecided thing and name it.
 *
 * So the condition and the verb are the same mechanism now:
 *
 *   the world writes UNDECIDED onto a machine you left alone      (condition.ts)
 *   -> what that machine makes arrives as a MAYBE, not a stone     (deliver)
 *   -> and the same neglect leaves NULL RESIDUE in the plant       (tickResidue)
 *   -> the CONDENSER turns residue into HUSH                       (condense)
 *   -> the WITNESS spends Hush to say what the maybe WAS           (witness)
 *
 * There is no second concept of attention, no second timer and no second panel
 * state. `biting(state, id, 'undecided')` is the only source of both, so the
 * economy exists exactly as far as the rule does.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHY IT IS NOT A FAUCET, stated as the rule it is enforced by.
 *
 * A maybe is one unit that would have been one unit. Witnessing turns it into
 * one unit of something else, so nothing is created — but CHOOSING freely would
 * be transmutation at zero loss, which is precisely what §14.4 says must never
 * exist. So the choice carries §14.4's own worth: **a maybe settles as
 * something it could have been, never as something worth more.** The tiers
 * widen the SCOPE of the choice (this shell, then any shell you have walked),
 * never the ceiling.
 *
 * And a maybe is not stock. It cannot be charged into the tub, cast, pressed,
 * infused or poured — `chargeCrucible` refuses it by name — so the only thing
 * you can do with one is decide what it was.
 *
 * PILLAR 2. Residue is a number the world writes and the Condenser converts;
 * Hush is spent, never earned twice; a witnessing is one unit in and one unit
 * out. There is no path from this file to `cellCap`, `cellRegen` or `chipYield`.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import {
  MATERIALS, bandOf, materialDef, registerMaterial,
  type MaterialDef, type PurityBand,
} from '../materials';
import { MATERIAL_TRAITS, traitsOf } from '../traits';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { biting, conditionOf, conditionedMachines, machineSpeed } from './condition';
import { addMaterial } from './forge';
import { isLooted } from './roll';
import { worth } from './balance';
import { rollOffSpec } from './governor';
import { allAuthoredStations } from '../content/rolls';

export const WITNESS_WRECK = 'THE WITNESS';
export const CONDENSER_WRECK = 'THE CONDENSER';

/**
 * NULL RESIDUE PER SECOND, PER UNDECIDED MACHINE. Sized against
 * `CONDITION_FULL_SEC` (240): a machine takes four minutes to go fully
 * undecided, and at this rate four more minutes of sitting there leaves 12
 * residue — enough for one witnessing after the Condenser's loss. So the whole
 * loop is "leave the plant for about ten minutes and you can name one thing",
 * which is a scheduling decision rather than an idle faucet.
 */
export const RESIDUE_PER_SEC = 0.05;

/** How much of the residue survives being condensed. It is a loss, always. */
export const CONDENSE_SHARE = 0.4;

/** What one witnessing costs. Flat — the choice is the interesting part. */
export const WITNESS_HUSH = 4;

export const TIER_CAPABILITY_CONDENSER = [
  'not built',
  'null residue into Hush, by hand',
  '...and it condenses on its own',
  '...and every condition leaves residue, not only this shell\'s',
] as const;

export const TIER_CAPABILITY_WITNESS = [
  'not built',
  'it says what the thing was',
  'anything in this shell it could have been',
  'anything in any shell you have walked',
] as const;

export interface WitnessState {
  /** What the unwatched plant has left behind. The Condenser's input. */
  residue: number;
  /** What a Witness spends. */
  hush: number;
  /** Materials this save has named out of a maybe — the Codex line. */
  named: string[];
}

export function defaultWitnessState(): WitnessState {
  return { residue: 0, hush: 0, named: [] };
}

export function ensureWitness(state: GameState): WitnessState {
  const w = (state.witness ??= defaultWitnessState());
  if (typeof w.residue !== 'number' || Number.isNaN(w.residue)) w.residue = 0;
  if (typeof w.hush !== 'number' || Number.isNaN(w.hush)) w.hush = 0;
  w.named ??= [];
  return w;
}

// ---------------------------------------------------------------------------
// MAYBE — what an unwatched machine makes
// ---------------------------------------------------------------------------

export function maybeId(materialId: string): string {
  return `maybe_${materialId}`;
}

export function isMaybe(materialId: string): boolean {
  try { return materialDef(materialId).source === 'maybe'; } catch { return false; }
}

/** What a maybe was going to be, before it did not decide. */
export function wasGoingToBe(materialId: string): string | null {
  if (!isMaybe(materialId)) return null;
  const base = materialId.slice('maybe_'.length);
  return MATERIALS.some((m) => m.id === base) ? base : null;
}

/**
 * REGISTER THE MAYBE-FORM. It keeps its stone's shell, rarity and traits — it is
 * undecided about WHAT IT IS, not about what it is like — and `worked: true`
 * keeps it out of every pool, every seam and the clone population, which it
 * would otherwise collide with by construction (its triple is its source's).
 */
export function registerMaybe(materialId: string): MaterialDef | null {
  const id = maybeId(materialId);
  const already = MATERIALS.find((m) => m.id === id);
  if (already) return already;
  const src = MATERIALS.find((m) => m.id === materialId);
  if (!src) return null;
  const def: MaterialDef = {
    id,
    name: `Maybe ${src.name}`,
    shellId: src.shellId,
    rarity: src.rarity,
    palette: src.palette,
    facets: src.facets,
    shimmer: 'none',
    flavor: `It came out of a machine nobody was watching, and it has not settled on being ${src.name}.`,
    worked: true,
    source: 'maybe',
  };
  registerMaterial(def);
  MATERIAL_TRAITS[id] = [...traitsOf(materialId)];
  return def;
}

/**
 * WHAT A MACHINE HANDS YOU — the one seam every lateral converter delivers
 * through, so E2's Hollow rule reaches all of them at once instead of being
 * taught to each.
 *
 * Outside Hollow, or on a machine somebody has been standing at, this is
 * `addMaterial` and nothing else. That is deliberate: the seam has to be
 * invisible everywhere the rule does not apply, or every converter in the game
 * pays for a shell most players are not in.
 */
export function deliver(
  state: GameState, machineId: string, materialId: string, purity: number, n = 1,
  rng: () => number = Math.random,
): string {
  /**
   * AND THE GOVERNOR'S GAMBLE LANDS HERE (§13, `systems/governor.ts`), for the
   * same reason the Hollow rule does: this is the one place a converter's output
   * leaves the machine, so a rule applied here reaches every one of them and no
   * converter had to be taught about either.
   */
  const arrives = rollOffSpec(state, machineId, purity, rng);
  if (!biting(state, machineId, 'undecided')) {
    addMaterial(state, materialId, arrives, n);
    return materialId;
  }
  const def = registerMaybe(materialId);
  if (!def) { addMaterial(state, materialId, arrives, n); return materialId; }
  addMaterial(state, def.id, arrives, n);
  return def.id;
}

// ---------------------------------------------------------------------------
// THE CONDENSER
// ---------------------------------------------------------------------------

export function condenserStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === CONDENSER_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function condenserFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === CONDENSER_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function condenserBuilt(state: GameState): boolean {
  return tierOf(state, 'condenser') > 0;
}

/** Tier II: it does not wait to be asked. */
export function condensesItself(state: GameState): boolean {
  return tierOf(state, 'condenser') >= 2;
}

/** Tier III: every condition leaves residue, not only Hollow's undecided. */
export function readsEveryCondition(state: GameState): boolean {
  return tierOf(state, 'condenser') >= 3;
}

export function nextCondenserTierCost(state: GameState): number | null {
  const t = tierOf(state, 'condenser');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

function raise(state: GameState, ctx: EngineCtx, machineId: string, cost: number | null): ActionResult {
  if (cost === null) return { ok: false, reason: 'It is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, machineId, taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers[machineId] = tierOf(state, machineId) + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId, tier: plant.tiers[machineId]! });
  return { ok: true, data: { tier: plant.tiers[machineId] } };
}

export function buildCondenser(state: GameState, ctx: EngineCtx): ActionResult {
  if (!condenserFound(state)) {
    const at = condenserStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Condenser.' };
  }
  return raise(state, ctx, 'condenser', nextCondenserTierCost(state));
}

/**
 * THE WORLD LEAVING SOMETHING BEHIND. Called on the same 1Hz block as
 * `tickCondition`, and it reads the same field — a machine the world has
 * written UNDECIDED onto is a machine whose output nobody collected, and the
 * part of it that did not become anything is the residue.
 *
 * IT NEEDS NO CONDENSER. Residue accrues whether or not you have the machine
 * that uses it, which is what makes finding the Condenser a discovery about
 * something that was already happening rather than the start of a counter.
 */
export function tickResidue(state: GameState, dt: number): void {
  if (dt <= 0) return;
  let n = 0;
  for (const id of conditionedMachines()) {
    if (biting(state, id, 'undecided')) { n += 1; continue; }
    // TIER III: every condition leaves residue, not only this shell's.
    if (readsEveryCondition(state) && conditionOf(state, id)) n += 1;
  }
  if (n <= 0) return;
  const w = ensureWitness(state);
  w.residue += RESIDUE_PER_SEC * n * dt;
  // TIER II: it does not wait to be asked.
  if (condensesItself(state)) {
    const took = w.residue;
    w.residue = 0;
    w.hush += took * CONDENSE_SHARE;
  }
}

export function condenseBlocker(state: GameState): string | null {
  if (!condenserBuilt(state)) return 'The Condenser is not standing.';
  if (machineSpeed(state, 'condenser') <= 0) return 'It has cracked. Re-cast it before it will run.';
  const w = ensureWitness(state);
  if (w.residue < 1) return 'There is nothing in it. Leave the plant to itself a while.';
  return null;
}

export function condense(state: GameState, ctx: EngineCtx): ActionResult {
  const blocked = condenseBlocker(state);
  if (blocked) return { ok: false, reason: blocked };
  const w = ensureWitness(state);
  const took = w.residue;
  const got = took * CONDENSE_SHARE;
  w.residue = 0;
  w.hush += got;
  ctx.emit({ type: 'condensed', residue: took, hush: got });
  ctx.dirty();
  return { ok: true, data: { residue: took, hush: got } };
}

// ---------------------------------------------------------------------------
// THE WITNESS
// ---------------------------------------------------------------------------

export function witnessStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === WITNESS_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function witnessFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === WITNESS_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function witnessBuilt(state: GameState): boolean {
  return tierOf(state, 'witness') > 0;
}

export function nextWitnessTierCost(state: GameState): number | null {
  const t = tierOf(state, 'witness');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildWitness(state: GameState, ctx: EngineCtx): ActionResult {
  if (!witnessFound(state)) {
    const at = witnessStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Witness.' };
  }
  return raise(state, ctx, 'witness', nextWitnessTierCost(state));
}

/**
 * WHAT THIS MAYBE COULD SETTLE AS. The tier decides the SCOPE and §14.4's worth
 * decides the CEILING — never the other way round, because a tier that raised
 * the ceiling would be a tier that printed value.
 */
export function couldBe(state: GameState, materialId: string): string[] {
  const was = wasGoingToBe(materialId);
  if (was === null) return [];
  const tier = tierOf(state, 'witness');
  if (tier <= 0) return [];
  if (tier === 1) return [was];
  const ceiling = worth(was);
  const src = materialDef(was);
  const walked = new Set(Object.keys(state.depthRecords ?? {}));
  const wider = MATERIALS
    .filter((m) => !m.worked && !m.source && m.id !== was
      && (tier >= 3 ? walked.has(m.shellId) || m.shellId === src.shellId : m.shellId === src.shellId)
      && worth(m.id) <= ceiling + 1e-9)
    .map((m) => m.id);
  /**
   * WHAT IT WAS IS ALWAYS ON THE LIST, and this is a bug the driver found on
   * its first run rather than a nicety. The wider set filters to `!m.source`,
   * which is correct — you cannot witness a maybe into an alloy or a stilled
   * form nobody made. But a maybe of a STILLED stone has a source, so the thing
   * it was going to be fell out of its own option list, and a tier-III Witness
   * could name a maybe as anything EXCEPT the truth. Tier I's own sentence ("it
   * says what the thing was") was silently lost by the tiers above it.
   */
  return [was, ...wider];
}

export function witnessBlocker(
  state: GameState, materialId: string, band: PurityBand, into: string,
): string | null {
  if (!witnessBuilt(state)) return 'The Witness is not standing.';
  if (machineSpeed(state, 'witness') <= 0) return 'It has cracked. Re-cast it before it will run.';
  const was = wasGoingToBe(materialId);
  if (was === null) return 'That has already decided what it is.';
  const w = ensureWitness(state);
  if (w.hush < WITNESS_HUSH) {
    return `A witnessing costs ${WITNESS_HUSH} Hush. You have ${Math.floor(w.hush)} — the Condenser makes it.`;
  }
  const options = couldBe(state, materialId);
  if (!options.includes(into)) {
    let name = into;
    try { name = materialDef(into).name; } catch { /* unknown */ }
    return worth(into) > worth(was)
      ? `It could not have been ${name}. A thing settles as something it could have been, never as something worth more.`
      : `This Witness will not reach ${name} from here.`;
  }
  const stack = state.materials.stacks[materialId]?.[band];
  if (!stack || stack.count < 1) return 'None of that at that band.';
  return null;
}

/**
 * SAY WHAT IT WAS. One unit in, one unit out, at the same band — the Still's
 * shape again, and for the same reason: this decides what a unit IS and nothing
 * else about it.
 */
export function witness(
  state: GameState, ctx: EngineCtx, materialId: string, band: PurityBand, into: string,
): ActionResult {
  const blocked = witnessBlocker(state, materialId, band, into);
  if (blocked) return { ok: false, reason: blocked };
  const perMat = state.materials.stacks[materialId]!;
  const stack = perMat[band]!;
  const purity = stack.puritySum / stack.count;
  stack.count -= 1;
  stack.puritySum -= purity;
  if (stack.count <= 0) delete perMat[band];

  const w = ensureWitness(state);
  w.hush -= WITNESS_HUSH;
  addMaterial(state, into, purity, 1);
  // A WITNESSING IS A DECISION, NOT A FIND.
  state.materials.totalDrops -= 1;
  if (!w.named.includes(into)) w.named.push(into);
  ctx.emit({ type: 'witnessed', materialId, into });
  ctx.dirty();
  return { ok: true, data: { into, band: bandOf(purity) } };
}

/** Every maybe the Hold is holding, one row per (stack, band). */
export function maybesHeld(
  state: GameState,
): { materialId: string; name: string; band: PurityBand; count: number; was: string }[] {
  const out: { materialId: string; name: string; band: PurityBand; count: number; was: string }[] = [];
  for (const [id, perMat] of Object.entries(state.materials.stacks)) {
    const was = wasGoingToBe(id);
    if (was === null) continue;
    for (const [band, stack] of Object.entries(perMat)) {
      if (!stack || stack.count <= 0) continue;
      out.push({
        materialId: id,
        name: (() => { try { return materialDef(id).name; } catch { return id; } })(),
        band: band as PurityBand,
        count: stack.count,
        was,
      });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}
