/**
 * THE STILL — ESSENCE WORK (§14.1, §16.3, keystone at Stillwright's Bower 30).
 *
 * "One unit at `pure`+, choose ONE of its traits, receive a vial plus residue."
 *
 * WHAT IT UNLOCKS IS A VERB (LAW 4): you can take a property OUT of a thing.
 * Before this, a material's traits were a fact you could read and route around;
 * they are now a fact you can change, which is what §14.1 means by "the world is
 * made of properties, not things".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE VIAL WAS CUT AT A.90 AND IS WIRED AT A.92. The cut, kept for the trail:
 *
 *   "§14.1 is one keystone with two ends: THE STILL takes a trait out and puts
 *   it in a vial, THE INFUSER puts a vial into something else. This pass builds
 *   the Still. Shipping the vial as a counted item with no consumer would be a
 *   name against no mechanism — the deceptive-stub class PILLARS warns about."
 *
 * The blocker named in that paragraph is built (`systems/infuser.ts`), so the
 * reason has dissolved exactly as PILLARS says a cut's reason can. A strip now
 * yields a VIAL, the vial remembers WHICH STONE it came out of, and that second
 * field is what keeps the pair from being a worth faucet: essence runs
 * downhill. `still.test.ts`'s absence assertion was INVERTED IN PLACE rather
 * than deleted, so the finding and its answer read as one story.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT COMES BACK IS A REAL MATERIAL. `content/traps.ts` registers the stilled
 * form as a MaterialDef, so `traitsOf`, `partTraits`, `derivePart`, coherence,
 * balance, the Codex and the clone check all read it correctly the moment it
 * exists — no Forge surgery, and no second concept of "a material, but".
 *
 * TIERS ARE CAPABILITY (§15.4), and every one of them is a SENTENCE:
 *
 *   I    THE TRAPS, AND ONLY THEIR NAMED TRAIT. §16.3's tutorial: the eight
 *        (seven, here) stones that look perfect and are not, and the one thing
 *        wrong with each.
 *   II   ANY TRAIT OF A TRAP. The lesson generalises inside the set you know.
 *   III  ANY PURE+ MATERIAL. §14.1's own gate, and the point at which "every
 *        one of ~158 materials becomes a source of properties" is true.
 *
 * PILLAR 2. One unit in, one unit out, at the same band. It cannot change the
 * number of drops, the drop rate, or the charge that paid for them — and there
 * is no path from this file to `cellCap`, `cellRegen` or `chipYield`. What it
 * changes is what a unit IS, which is the definition of a lateral converter.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { BANDS, RARITIES, bandOf, materialDef, type MaterialRarity, type PurityBand } from '../materials';
import { traitsOf, type TraitId } from '../traits';
import { TRAPS, isTrap, registerStilledForm, stilledId, trapDef } from '../content/traps';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { machineSpeed } from './condition';
import { addMaterial } from './forge';
import { addVial } from './infuser';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';

/** The wreck the Still is found in — Verdance, Stillwright's Bower 30 (§6). */
export const STILL_WRECK = 'THE STILL';

/** §14.1's gate: "one unit at `pure`+". A RARITY, not a purity band. */
export const STILL_MIN_RARITY: MaterialRarity = 'pure';

export const TIER_CAPABILITY_STILL = [
  'not built',
  'the trap stones, and the one thing wrong with each',
  'any trait of a trap stone',
  'any trait of any pure+ stone',
] as const;

export function stillStation(): { shellId: string; depth: number; name: string } | null {
  const found = allAuthoredStations().find((s) => s.def.wreck === STILL_WRECK);
  return found ? { shellId: found.shellId, depth: found.def.depth, name: found.def.name } : null;
}

export function stillFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === STILL_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function stillBuilt(state: GameState): boolean {
  return tierOf(state, 'still') > 0;
}

export function nextStillTierCost(state: GameState): number | null {
  const t = tierOf(state, 'still');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildStill(state: GameState, ctx: EngineCtx): ActionResult {
  if (!stillFound(state)) {
    const at = stillStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Still.' };
  }
  const cost = nextStillTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Still is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'still', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['still'] = tierOf(state, 'still') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'still', tier: plant.tiers['still']! });
  return { ok: true, data: { tier: plant.tiers['still'] } };
}

// ---------------------------------------------------------------------------
// What this Still will take
// ---------------------------------------------------------------------------

function rarityOk(materialId: string): boolean {
  try {
    return RARITIES.indexOf(materialDef(materialId).rarity)
      >= RARITIES.indexOf(STILL_MIN_RARITY);
  } catch { return false; }
}

/**
 * CAN THIS STILL TAKE THIS TRAIT OUT OF THIS STONE? The tier ladder, stated as
 * the three questions it asks in order.
 */
export function canTake(state: GameState, materialId: string, trait: TraitId): boolean {
  const tier = tierOf(state, 'still');
  if (tier <= 0) return false;
  if (tier >= 3) return rarityOk(materialId) && traitsOf(materialId).includes(trait);
  const trap = trapDef(materialId);
  if (!trap) return false;
  if (tier >= 2) return traitsOf(materialId).includes(trait);
  return trap.trait === trait;
}

export interface Distillable {
  materialId: string;
  band: PurityBand;
  count: number;
  trait: TraitId;
  /** Is this the trap's own named fault? The tutorial's answer. */
  named: boolean;
}

/**
 * WHAT IS ON THE BENCH RIGHT NOW — held stock this Still would accept, one row
 * per (stack, trait). LAW 3: it lists what you HAVE, never a catalogue of every
 * pair the machine will ever handle.
 */
export function distillable(state: GameState): Distillable[] {
  if (!stillBuilt(state)) return [];
  const out: Distillable[] = [];
  for (const [materialId, perMat] of Object.entries(state.materials.stacks)) {
    let traits: TraitId[];
    try { traits = traitsOf(materialId); } catch { continue; }
    // A one-trait stone has nothing to spare — taking its last trait would
    // leave a material that is not anything, and `registerStilledForm` refuses.
    if (traits.length < 2) continue;
    for (const [band, stack] of Object.entries(perMat)) {
      if (!stack || stack.count <= 0) continue;
      for (const trait of traits) {
        if (!canTake(state, materialId, trait)) continue;
        out.push({
          materialId,
          band: band as PurityBand,
          count: stack.count,
          trait,
          named: trapDef(materialId)?.trait === trait,
        });
      }
    }
  }
  // The tutorial first: a trap's own fault is what you are supposed to find.
  return out.sort((a, b) => Number(b.named) - Number(a.named) || b.count - a.count);
}

export function distilBlocker(
  state: GameState, materialId: string, band: PurityBand, trait: TraitId,
): string | null {
  if (!stillBuilt(state)) return 'The Still is not standing.';
  if (machineSpeed(state, 'still') <= 0) return 'It has cracked. Re-cast it before it will run.';
  let def;
  try { def = materialDef(materialId); } catch { return 'No such stone.'; }
  if (!traitsOf(materialId).includes(trait)) return `${def.name} is not ${trait}.`;
  if (traitsOf(materialId).length < 2) {
    return `${def.name} is only ${trait}. There would be nothing left.`;
  }
  if (!rarityOk(materialId)) {
    return `The Still takes ${STILL_MIN_RARITY} stone and better. ${def.name} is ${def.rarity}.`;
  }
  if (!canTake(state, materialId, trait)) {
    const tier = tierOf(state, 'still');
    return isTrap(materialId)
      ? `This Still only takes the one thing wrong with a stone. ${def.name} is ${trapDef(materialId)!.trait}.`
      : `This Still only works on the trap stones — ${TIER_CAPABILITY_STILL[tier + 1] ?? 'no further'} comes later.`;
  }
  const stack = state.materials.stacks[materialId]?.[band];
  if (!stack || stack.count < 1) return `No ${def.name} at that band.`;
  return null;
}

/**
 * TAKE THE TRAIT OUT. One unit in, one unit out, at the same band.
 *
 * The band is kept deliberately: a Still is not a Refinery and must not be a
 * back door into purity work. What changes is WHAT the unit is, and nothing
 * else about it — which is also why this cannot be a faucet at any tier.
 */
export function distil(
  state: GameState, ctx: EngineCtx, materialId: string, band: PurityBand, trait: TraitId,
): ActionResult {
  const blocked = distilBlocker(state, materialId, band, trait);
  if (blocked) return { ok: false, reason: blocked };
  const perMat = state.materials.stacks[materialId]!;
  const stack = perMat[band]!;
  const purity = stack.puritySum / stack.count;
  stack.count -= 1;
  stack.puritySum -= purity;
  if (stack.count <= 0) delete perMat[band];

  const trap = trapDef(materialId);
  const def = registerStilledForm(
    materialId, trait,
    trap && trap.trait === trait ? trap.stilledName : undefined,
    trap && trap.trait === trait ? trap.line : undefined,
  );
  if (!def) return { ok: false, reason: 'There would be nothing left.' };
  // THE OTHER END (§14.1). The trait leaves the stone and arrives in a vial
  // that remembers the stone — one strip, one vial, and the vial is the only
  // thing an Infuser will take.
  addVial(state, trait, materialId);
  addMaterial(state, def.id, purity, 1);
  // `addMaterial` counts every unit as a drop; a stilled unit is a CONVERSION,
  // not a find, and letting it inflate `totalDrops` would quietly move a
  // statistic several achievements and the Record read off.
  state.materials.totalDrops -= 1;

  ctx.emit({ type: 'distilled', materialId, trait, into: def.id });
  ctx.dirty();
  return { ok: true, data: { into: def.id, band: bandOf(purity) } };
}

/** Every stilled form this save has actually made — the Codex line. */
export function stilledHeld(state: GameState): { id: string; count: number }[] {
  const out: { id: string; count: number }[] = [];
  for (const [id, perMat] of Object.entries(state.materials.stacks)) {
    let def;
    try { def = materialDef(id); } catch { continue; }
    if (def.source !== 'still') continue;
    const n = Object.values(perMat).reduce((a, s) => a + (s?.count ?? 0), 0);
    if (n > 0) out.push({ id, count: n });
  }
  return out;
}

export { BANDS, TRAPS, stilledId };
