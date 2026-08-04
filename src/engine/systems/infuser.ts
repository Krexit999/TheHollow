/**
 * THE INFUSER — INFUSION (§14.1, §13, keystone at The Grafthouse 225).
 *
 * "THE STILL: one unit at `pure`+, choose ONE of its traits, receive a vial
 * plus residue. THE INFUSER: material + vial → the material gains that trait.
 * Cap 4; each trait past the material's natural count adds instability (§11.4)."
 *
 * WHAT IT UNLOCKS IS A VERB (LAW 4): you can put a property INTO a thing. The
 * Still made the world's properties removable; this makes them PORTABLE, which
 * is the half §14.1 was always describing — "the world is made of properties,
 * not things" is not true while a property can only be destroyed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE VIAL, WHICH WAS CUT AT A.90 WITH THIS MACHINE NAMED AS ITS BLOCKER.
 *
 * `still.ts` said it plainly: "shipping the vial as a counted item with no
 * consumer would be a name against no mechanism", so the trait came out and was
 * GONE, and `still.test.ts` asserted the absence so it could not creep back as
 * a word. The blocker is built. Both ends are wired in this commit, the absence
 * test is inverted in place rather than deleted, and a vial now has exactly one
 * producer and exactly one consumer.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A TRAIT MOVED IS NOT A TRAIT CREATED, and this is the load-bearing rule.
 *
 * §14.4's worth is `BAND_WORTH[rarity] × (1 + 0.15 × traits)` — LINEAR in the
 * trait count. So taking a trait out of a stone of rarity A costs the world
 * `BAND_WORTH[A] × 0.15`, and putting it into a stone of rarity B pays
 * `BAND_WORTH[B] × 0.15`. The books balance if and only if
 *
 *     BAND_WORTH[B] <= BAND_WORTH[A]      i.e.  rarity(target) <= rarity(source)
 *
 * so THAT IS THE RULE THE MACHINE ENFORCES, and it is stated to the player as
 * one sentence: essence runs downhill. A vial remembers the stone it came out
 * of for no other reason. Equal bands conserve worth exactly — the trait really
 * has only moved — and every other legal infusion strictly destroys some.
 *
 * It is also the right GAME rule, not just the safe one: to finish a trait set
 * on a good stone you break a better one, which is the trade §14.1 wants and
 * the reason an Infuser is not a printer.
 *
 * TIERS ARE CAPABILITY (§15.4), and each is a different sentence:
 *
 *   I    IT PUTS BACK WHAT A STILL TOOK. Stilled forms only — the machine
 *        undoes its own other half, which is where the lesson starts.
 *   II   ANY STONE, UP TO A THIRD TRAIT. Now it builds sets that were never dug.
 *   III  THE FOURTH, which §7.4 rule 1 caps at — and a stone carrying more than
 *        it was born with makes the tool it goes into SHAKE (§11.4).
 *
 * PILLAR 2. One unit in, one unit out, at the same band and the same rarity.
 * It cannot change the number of drops, the drop rate, or the charge that paid
 * for them, and there is no path from this file to `cellCap`, `cellRegen` or
 * `chipYield`.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import {
  MATERIALS, RARITIES, bandOf, materialDef, registerMaterial,
  type MaterialDef, type PurityBand,
} from '../materials';
import {
  MATERIAL_TRAITS, TRAITS, naturalTraits, overNatural, traitsOf, type TraitId,
} from '../traits';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { machineSpeed } from './condition';
import { deliver } from './witness';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';

/** The wreck it is found in — Verdance, The Grafthouse 225. */
export const INFUSER_WRECK = 'THE INFUSER';

/** §7.4 rule 1: a material carries at most four traits, hard. */
export const MAX_TRAITS = 4;

export const TIER_CAPABILITY_INFUSER = [
  'not built',
  'it puts back what a Still took',
  'any stone, up to a third trait',
  'the fourth — and the tool will feel it',
] as const;

// ---------------------------------------------------------------------------
// The vial
// ---------------------------------------------------------------------------

/**
 * A VIAL IS A TRAIT AND THE STONE IT CAME OUT OF.
 *
 * The second field is not flavour: `worthCeiling` reads it, and it is the only
 * thing standing between this machine and a worth faucet. A vial drawn out of a
 * common stone will not go into a rich one, forever.
 */
export interface Vial {
  trait: TraitId;
  fromId: string;
  count: number;
}

export interface EssenceState {
  vials: Vial[];
  /** Infused forms this save has ever made — the Codex line. */
  made: string[];
}

export function defaultEssenceState(): EssenceState {
  return { vials: [], made: [] };
}

export function ensureEssence(state: GameState): EssenceState {
  const e = (state.essence ??= defaultEssenceState());
  e.vials ??= [];
  e.made ??= [];
  return e;
}

/** The Still's other end. One strip, one vial. */
export function addVial(state: GameState, trait: TraitId, fromId: string): void {
  const e = ensureEssence(state);
  const held = e.vials.find((v) => v.trait === trait && v.fromId === fromId);
  if (held) held.count += 1;
  else e.vials.push({ trait, fromId, count: 1 });
}

export function vialsHeld(state: GameState): Vial[] {
  return ensureEssence(state).vials.filter((v) => v.count > 0);
}

function takeVial(state: GameState, trait: TraitId, fromId: string): boolean {
  const e = ensureEssence(state);
  const i = e.vials.findIndex((v) => v.trait === trait && v.fromId === fromId && v.count > 0);
  if (i < 0) return false;
  e.vials[i]!.count -= 1;
  if (e.vials[i]!.count <= 0) e.vials.splice(i, 1);
  return true;
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export function infuserStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === INFUSER_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function infuserFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === INFUSER_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function infuserBuilt(state: GameState): boolean {
  return tierOf(state, 'infuser') > 0;
}

/**
 * HOW MANY TRAITS THIS INFUSER WILL LET THIS STONE END UP CARRYING.
 *
 * MEASURED FIRST, because the tier-I sentence was nearly a lie: every natural
 * stone in the game carries TWO or THREE traits (91 and 10 — histogram, not
 * assumption), so a flat tier-I ceiling of 2 refuses every ordinary stone by
 * arithmetic and the "only puts back what a Still took" rule would have been
 * unreachable behind it — two rules where one silently shadows the other.
 *
 * So tier I's ceiling is the stone's OWN natural count. The sentence and the
 * arithmetic now say the same thing: it restores, and nothing more.
 */
export function traitCeiling(state: GameState, materialId?: string): number {
  const t = tierOf(state, 'infuser');
  if (t >= 3) return MAX_TRAITS;
  if (t >= 2) return 3;
  return materialId === undefined ? 2 : Math.min(MAX_TRAITS, naturalTraits(materialId));
}

export function nextInfuserTierCost(state: GameState): number | null {
  const t = tierOf(state, 'infuser');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildInfuser(state: GameState, ctx: EngineCtx): ActionResult {
  if (!infuserFound(state)) {
    const at = infuserStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Infuser.' };
  }
  const cost = nextInfuserTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Infuser is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'infuser', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['infuser'] = tierOf(state, 'infuser') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'infuser', tier: plant.tiers['infuser']! });
  return { ok: true, data: { tier: plant.tiers['infuser'] } };
}

// ---------------------------------------------------------------------------
// THE RULE
// ---------------------------------------------------------------------------

/**
 * IS THIS STONE NOT RARER THAN THE ONE THE VIAL CAME OUT OF? The whole
 * conservation argument, in one comparison.
 */
export function runsDownhill(vial: Vial, targetId: string): boolean {
  try {
    return RARITIES.indexOf(materialDef(targetId).rarity)
      <= RARITIES.indexOf(materialDef(vial.fromId).rarity);
  } catch { return false; }
}

/** Did this stone come out of a Still — i.e. is it missing something? */
export function isStilledForm(materialId: string): boolean {
  try { return materialDef(materialId).source === 'still'; } catch { return false; }
}

export function isInfusedForm(materialId: string): boolean {
  try { return materialDef(materialId).source === 'infused'; } catch { return false; }
}

/** The id a NEW infused form would carry, if the result is a stone nothing else is. */
export function infusedId(materialId: string, trait: TraitId): string {
  return `${materialId}_with${trait}`;
}

/**
 * A STONE IS ITS SHELL, ITS RARITY AND ITS TRAITS — NOT THE ROUTE THAT MADE IT.
 *
 * §14.2 already says this for alloys ("an alloy is identified by its SHELL and
 * its TRAIT SET, never by its recipe"), and the clone check has enforced it for
 * authored content since Phase 9. The Infuser is the first machine that can
 * BREAK it on demand: this file's own clone sweep, on its first run, found
 * **46 collisions** across the reachable space — `Springy Bonechalk` deriving
 * bit for bit as `Brittle Marl`, `Hollow Graveclay` as `Dense Ochre`, and so on
 * — because `derivePart` reads exactly that triple and nothing else.
 *
 * So the rule is applied rather than the instances patched: an infusion that
 * lands on a triple something already IS produces that thing. Sometimes what
 * you make is a stone you could have dug, which is the same lesson §14.2 hands
 * out at the Crucible, and here it is a payout rather than grog — you did put a
 * real trait in, and you get a real stone out.
 */
export function stoneLike(shellId: string, rarity: string, traits: TraitId[]): MaterialDef | null {
  const want = [...traits].sort().join('|');
  return MATERIALS.find((m) => m.shellId === shellId && m.rarity === rarity
    && [...traitsOf(m.id)].sort().join('|') === want) ?? null;
}

/** What this infusion actually lands on — an existing stone, or a new form. */
export function resultOf(materialId: string, trait: TraitId): string {
  let src: MaterialDef | undefined;
  try { src = materialDef(materialId); } catch { return infusedId(materialId, trait); }
  const already = stoneLike(src.shellId, src.rarity, [...traitsOf(materialId), trait]);
  return already ? already.id : infusedId(materialId, trait);
}

/**
 * HOW MANY TRAITS THIS STONE WAS BORN WITH — and it lives in `traits.ts`, not
 * here, because `toolMods` has to ask it to decide how much a tool shakes and
 * must not import a machine to do it. Re-exported so the Infuser's own panel
 * and tests read it from the machine that produces the case.
 */
export { naturalTraits, overNatural };

export function infuseBlocker(
  state: GameState, vial: Vial, materialId: string, band: PurityBand,
): string | null {
  if (!infuserBuilt(state)) return 'The Infuser is not standing.';
  if (machineSpeed(state, 'infuser') <= 0) return 'It has cracked. Re-cast it before it will run.';
  let def: MaterialDef;
  try { def = materialDef(materialId); } catch { return 'No such stone.'; }
  if (!vialsHeld(state).some((v) => v.trait === vial.trait && v.fromId === vial.fromId)) {
    return 'You are not holding that vial.';
  }
  const have = traitsOf(materialId);
  if (have.includes(vial.trait)) return `${def.name} is already ${TRAITS[vial.trait].name.toLowerCase()}.`;
  if (have.length + 1 > MAX_TRAITS) {
    return `Nothing carries more than ${MAX_TRAITS} traits. ${def.name} is full.`;
  }
  // THE TIER GATE BEFORE THE CEILING, because at tier I the ceiling IS the tier
  // gate and the player should be told which of the two they have hit.
  if (tierOf(state, 'infuser') < 2 && !isStilledForm(materialId)) {
    return 'This Infuser only puts back what a Still took. Bring it a stilled stone.';
  }
  const ceiling = traitCeiling(state, materialId);
  if (have.length + 1 > ceiling) {
    return tierOf(state, 'infuser') < 2
      ? `${def.name} is back to what it was born with. Carrying more than that is the next tier.`
      : `This Infuser will take a stone to ${ceiling} traits. ${def.name} already has ${have.length}.`;
  }
  if (!runsDownhill(vial, materialId)) {
    let from: MaterialDef | null = null;
    try { from = materialDef(vial.fromId); } catch { /* gone */ }
    return `Essence runs downhill. That vial came out of ${from?.name ?? 'a better stone'} (${from?.rarity ?? '?'}), and ${def.name} is ${def.rarity}.`;
  }
  const stack = state.materials.stacks[materialId]?.[band];
  if (!stack || stack.count < 1) return `No ${def.name} at that band.`;
  return null;
}

/**
 * WHAT THIS VIAL WILL GO INTO, out of what you are holding. LAW 3: the
 * destinations, never the rule as a table.
 */
export function targetsFor(
  state: GameState, vial: Vial,
): { materialId: string; band: PurityBand; count: number; name: string; over: boolean }[] {
  if (!infuserBuilt(state)) return [];
  const out: { materialId: string; band: PurityBand; count: number; name: string; over: boolean }[] = [];
  for (const [materialId, perMat] of Object.entries(state.materials.stacks)) {
    for (const [band, stack] of Object.entries(perMat)) {
      if (!stack || stack.count <= 0) continue;
      if (infuseBlocker(state, vial, materialId, band as PurityBand)) continue;
      out.push({
        materialId,
        band: band as PurityBand,
        count: stack.count,
        name: (() => { try { return materialDef(materialId).name; } catch { return materialId; } })(),
        // Would this take the stone past what it was born with? The shake.
        over: traitsOf(materialId).length + 1 > naturalTraits(materialId),
      });
    }
  }
  return out.sort((a, b) => Number(a.over) - Number(b.over) || b.count - a.count);
}

/**
 * PUT IT IN. One unit in, one unit out, at the same band and the same rarity —
 * the Still's own shape, pointed the other way.
 */
export function infuse(
  state: GameState, ctx: EngineCtx, vial: Vial, materialId: string, band: PurityBand,
): ActionResult {
  const blocked = infuseBlocker(state, vial, materialId, band);
  if (blocked) return { ok: false, reason: blocked };
  const perMat = state.materials.stacks[materialId]!;
  const stack = perMat[band]!;
  const purity = stack.puritySum / stack.count;
  stack.count -= 1;
  stack.puritySum -= purity;
  if (stack.count <= 0) delete perMat[band];
  takeVial(state, vial.trait, vial.fromId);

  const def = registerInfusedForm(materialId, vial.trait);
  if (!def) return { ok: false, reason: 'It would not take.' };
  const got = deliver(state, 'infuser', def.id, purity, 1);
  // An INFUSION is a conversion, not a find. `addMaterial` counts drops, and
  // letting one inflate `totalDrops` moves several achievements and the Record.
  state.materials.totalDrops -= 1;
  const e = ensureEssence(state);
  const fresh = !e.made.includes(def.id);
  if (fresh) e.made.push(def.id);
  const dug = def.source === undefined && !def.worked;

  ctx.emit({ type: 'infused', materialId, trait: vial.trait, into: got });
  ctx.dirty();
  return { ok: true, data: { into: got, band: bandOf(purity), fresh, dug } };
}

/**
 * THE INFUSED FORM IS A REAL MATERIAL, registered the moment it first exists —
 * the same mechanism the Still's stilled forms and the Crucible's alloys use,
 * and for the same reason: `traitsOf`, `partTraits`, `derivePart`, coherence,
 * balance, the clone check and the Codex all read it correctly on the day it
 * exists, and nothing downstream had to be taught a third concept.
 */
export function registerInfusedForm(materialId: string, trait: TraitId): MaterialDef | null {
  const src = MATERIALS.find((m) => m.id === materialId);
  if (!src) return null;
  const have = MATERIAL_TRAITS[materialId] ?? [];
  if (have.includes(trait) || have.length >= MAX_TRAITS) return null;
  // THE STONE, NOT THE ROUTE. If this triple is already something, it IS that.
  const same = stoneLike(src.shellId, src.rarity, [...have, trait]);
  if (same) return same;
  const id = infusedId(materialId, trait);
  const def: MaterialDef = {
    id,
    name: `${TRAITS[trait].name} ${src.name}`,
    shellId: src.shellId,
    rarity: src.rarity,
    palette: src.palette,
    facets: Math.min(11, src.facets + 1),
    shimmer: src.shimmer,
    flavor: `${src.name}, with ${TRAITS[trait].name.toLowerCase()} put into it. It did not grow this way.`,
    // NEVER IN A POOL AND NEVER IN A SEAM. You cannot dig one up.
    source: 'infused',
  };
  registerMaterial(def);
  MATERIAL_TRAITS[id] = [...have, trait];
  return def;
}

/** Infused stone this save is holding — the Codex line. */
export function infusedHeld(state: GameState): { id: string; count: number }[] {
  const out: { id: string; count: number }[] = [];
  for (const [id, perMat] of Object.entries(state.materials.stacks)) {
    if (!isInfusedForm(id)) continue;
    const n = Object.values(perMat).reduce((a, s) => a + (s?.count ?? 0), 0);
    if (n > 0) out.push({ id, count: n });
  }
  return out;
}
