/**
 * THE BREAKER — SALVAGE (§13, §8, the wreck at Breaker's Yard 210).
 *
 * §8's bottleneck table names the problem this answers in the player's own
 * voice: *"Every part I cast is one I can't melt back without losing it."*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS ALREADY BUILT, checked before building anything (the ledger is a
 * claim). SALVAGE is not new to this game:
 *
 *   salvageTool / bulkSalvage  a TOOL back to materials, at a real loss, with
 *                              a paid extraction for its runes and gems
 *   meltBack                   a cast PART back into the CRUCIBLE as molten
 *                              stone, at `MELT_BACK_SHARE`
 *   breakDownTool              a built tool back into its parts, whole
 *
 * So the Breaker does not re-implement any of those. What it adds is the one
 * direction none of them go: A CAST PART BACK TO THE HOLD, as units of its own
 * stone. `meltBack` puts it in the tub, which is only useful if you are pouring
 * right now and are pouring THAT stone; a part you cast for a machine you did
 * not build is stranded stock, and this is the exit it never had.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * AND IT PAYS FOR THE PROPS (§9.4). `unshoreBand` charged Brick to pull a drift
 * down and gave back nothing — the timber, the winch and the cast parts that
 * went into the band simply vanished, which made un-shoring a pure loss and
 * therefore never the right move. §8's answer to "I froze a seam I didn't want"
 * only works if taking it back is a trade. With the Breaker standing, pulling
 * props RETURNS the cast parts the band cost. It is the same machine doing the
 * same thing to a different object, which is why it belongs here and not in a
 * second system.
 *
 * TIERS ARE CAPABILITY (§15.4):
 *   I    ONE PART, back to the Hold
 *   II   ...AND IT PULLS PROPS BACK WHOLE — un-shoring returns its cast parts
 *   III  THE WHOLE RACK AT ONCE, keeping the best part of each type
 *
 * PILLAR 2. A Breaker RETURNS WHAT YOU SPENT, always at a loss, and only ever
 * material. It cannot produce a unit that was not put in, cannot touch a
 * currency, and there is no path from this file to `cellCap`, `cellRegen` or
 * `chipYield`.
 *
 * WHAT IS CUT: "back to DESIGN", the other half of §13's line. §11.3's DESIGN
 * BOARD does not exist, QoL blueprints were RETIRED at A.36 (`qol.test.ts`
 * asserts their absence), and the Forge's pour path runs through a crucible
 * melt that a re-pour verb would have to duplicate. A recorded design with
 * nothing able to pour it is a name against no mechanism — the same call the
 * Still's vial got one commit ago. Ledgered, with the Design Board named as the
 * blocker.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { materialDef } from '../materials';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { machineSpeed } from './condition';
import { addMaterial } from './forge';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';
import { partMelt } from './forgeParts';
import type { RackPart } from './casting';

/** The wreck the Breaker is found in — Ferrite, Breaker's Yard 210. */
export const BREAKER_WRECK = 'THE BREAKER';

/**
 * WHAT COMES BACK, as a share of what the part cost to pour.
 *
 * Below `SALVAGE_RETURN` (0.5) on purpose: breaking a PART is the convenient
 * exit and breaking a TOOL is the considered one, so the convenient one pays
 * less. It is also below `MELT_BACK_SHARE`, because putting stone back in the
 * tub keeps it molten and near the mould, and carrying it to the Hold does not.
 */
export const BREAK_RETURN = 0.35;

export const TIER_CAPABILITY_BREAKER = [
  'not built',
  'a cast part back to the Hold, as stone',
  '...and props pulled back whole — un-shoring returns its parts',
  'the whole rack at once, keeping the best of each type',
] as const;

export function breakerStation(): { shellId: string; depth: number; name: string } | null {
  const found = allAuthoredStations().find((s) => s.def.wreck === BREAKER_WRECK);
  return found ? { shellId: found.shellId, depth: found.def.depth, name: found.def.name } : null;
}

export function breakerFound(state: GameState): boolean {
  // TWO SHELLS AUTHOR ONE. Ferrite's Breaker's Yard 210 and Cinder's Breaker's
  // Slag 260 are both `THE BREAKER`, so a player who never went back to Ferrite
  // still meets it. Either counts.
  return allAuthoredStations()
    .filter((s) => s.def.wreck === BREAKER_WRECK)
    .some((s) => isLooted(state, s.def.id));
}

export function breakerBuilt(state: GameState): boolean {
  return tierOf(state, 'breaker') > 0;
}

/** Tier II: pulling props hands the cast parts back. */
export function returnsProps(state: GameState): boolean {
  return tierOf(state, 'breaker') >= 2;
}

/** Tier III: the whole rack in one press. */
export function breaksInBulk(state: GameState): boolean {
  return tierOf(state, 'breaker') >= 3;
}

export function nextBreakerTierCost(state: GameState): number | null {
  const t = tierOf(state, 'breaker');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildBreaker(state: GameState, ctx: EngineCtx): ActionResult {
  if (!breakerFound(state)) {
    const at = breakerStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Breaker.' };
  }
  const cost = nextBreakerTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Breaker is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'breaker', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['breaker'] = tierOf(state, 'breaker') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'breaker', tier: plant.tiers['breaker']! });
  return { ok: true, data: { tier: plant.tiers['breaker'] } };
}

// ---------------------------------------------------------------------------
// A part back to the Hold
// ---------------------------------------------------------------------------

/** How many units of its own stone a part comes back as. Never less than one —
 *  a break that returns nothing is `discardTool` with extra steps. */
export function breakYield(part: RackPart): number {
  return Math.max(1, Math.round(partMelt(part.type) * BREAK_RETURN));
}

export function breakBlocker(state: GameState, partId: number): string | null {
  if (!breakerBuilt(state)) return 'The Breaker is not standing.';
  if (machineSpeed(state, 'breaker') <= 0) return 'It has cracked. Re-cast it before it will run.';
  const rack = state.casting?.rack ?? [];
  const part = rack.find((p) => p.id === partId);
  if (!part) return 'Not on the rack.';
  if (Object.values(state.casting.bench).includes(partId)) {
    return 'It is on the station — take it off first.';
  }
  return null;
}

/**
 * BREAK ONE PART BACK TO STONE. It leaves the rack and its material arrives in
 * the Hold at the part's own purity, which is the whole point: what comes back
 * is what went in, minus the loss, and it is stock you can use for anything.
 */
export function breakPart(state: GameState, ctx: EngineCtx, partId: number): ActionResult {
  const blocked = breakBlocker(state, partId);
  if (blocked) return { ok: false, reason: blocked };
  const rack = state.casting.rack;
  const i = rack.findIndex((p) => p.id === partId);
  const part = rack[i]!;
  const n = breakYield(part);
  rack.splice(i, 1);
  addMaterial(state, part.materialId, part.purity, n);
  // A RETURN IS NOT A FIND. `addMaterial` counts drops; letting a salvage
  // inflate the drop total would move several achievements and the Record.
  state.materials.totalDrops -= n;
  ctx.emit({ type: 'partBroken', materialId: part.materialId, units: n });
  ctx.dirty();
  return { ok: true, data: { materialId: part.materialId, units: n } };
}

/**
 * TIER III — THE WHOLE RACK, KEEPING THE BEST OF EACH TYPE.
 *
 * Never the bench, never the last of a type, and never the highest-purity part
 * of a type: the rack is stock, and a bulk verb that can eat the one good head
 * you were saving is the automation problem §25.5 opens with. The same rule
 * `bulkSalvage` follows for tools.
 */
export function breakRack(state: GameState, ctx: EngineCtx): ActionResult {
  if (!breaksInBulk(state)) return { ok: false, reason: 'This Breaker takes one at a time.' };
  const rack = state.casting?.rack ?? [];
  const onBench = new Set(Object.values(state.casting.bench));
  const bestOf = new Map<string, number>();
  for (const p of rack) {
    const best = bestOf.get(p.type);
    if (best === undefined || (rack.find((x) => x.id === best)?.purity ?? 0) < p.purity) {
      bestOf.set(p.type, p.id);
    }
  }
  const keep = new Set([...bestOf.values(), ...onBench]);
  const doomed = rack.filter((p) => !keep.has(p.id)).map((p) => p.id);
  if (doomed.length === 0) return { ok: false, reason: 'Nothing on the rack it would break.' };
  let units = 0;
  for (const id of doomed) {
    const r = breakPart(state, ctx, id);
    if (r.ok) units += (r.data as { units: number }).units;
  }
  return { ok: true, data: { parts: doomed.length, units } };
}

/**
 * WHAT PULLING PROPS HANDS BACK (§9.4, item 17). The cast parts the band cost,
 * less the same share everything else here loses. Zero without a tier-II
 * Breaker, which is what makes standing one a reason to reconsider a drift you
 * regret.
 */
export function propsBack(state: GameState, parts: number): number {
  if (!returnsProps(state) || parts <= 0) return 0;
  /**
   * AT LEAST ONE, and the floor is the whole reason this line exists. A
   * shallow band costs `1 + floor(depth/50)` parts, so every band above 50m
   * costs exactly ONE — and `floor(1 x 0.35)` is ZERO. Without the clamp the
   * capability would read "un-shoring returns the timber" and hand back nothing
   * for the entire top of every shaft, which is the promise the row was written
   * to keep. Same clamp, same reason, as `breakYield`.
   */
  return Math.max(1, Math.floor(parts * BREAK_RETURN));
}

// ---------------------------------------------------------------------------
// A BUILT MACHINE, back to its parts
// ---------------------------------------------------------------------------

/**
 * UN-BUILDING (A.91, by ruling): the Breaker takes a BUILT MACHINE back to its
 * cast parts. THE TIER IS LOST; re-tiering costs the tier material again.
 *
 * This is the row A.90 ledgered as the honest answer to "what else should
 * salvage and doesn't": cast parts spent on a machine tier were gone forever —
 * 2 + 3 + 5 each across six machines — and a player who tiered the wrong one
 * had no exit at all.
 *
 * WHAT COMES BACK IS EXACTLY WHAT WENT IN, and that is the ruling rather than
 * generosity. `builtOf` records the material of every part spent across every
 * tier, so the rack gets one part per entry, at the type and purity a chassis
 * part is worth. THE LOSS IS THE TIER: you keep the stone and give up the
 * capability, which is a different trade from every other salvage in the game
 * (those keep a fraction of the stone and the capability was never the point).
 *
 * AVAILABLE AT TIER I, deliberately. The Breaker's own tiers buy SCOPE (props)
 * and CONVENIENCE (the rack at once); an EXIT is not a convenience. Gating the
 * only way out of a mis-spent machine behind two more tiers of the machine that
 * provides it is the "structural unlock behind the wall it is needed to cross"
 * shape in miniature.
 *
 * THE KILN IS NOT UN-BUILDABLE and needs no rule for it: the Kiln is
 * `state.kiln.built`, not a plant tier, because the Hearth IS the Kiln (§3.2).
 * Nothing with `tierOf === 0` is offered, so it falls out.
 */
export function unbuildable(state: GameState): { machineId: string; tier: number; parts: number }[] {
  if (!breakerBuilt(state)) return [];
  const p = state.plant;
  if (!p) return [];
  return Object.keys(p.tiers ?? {})
    .filter((id) => (p.tiers[id] ?? 0) > 0)
    .map((id) => ({ machineId: id, tier: p.tiers[id]!, parts: (p.builtOf?.[id] ?? []).length }));
}

export function unbuildBlocker(state: GameState, machineId: string): string | null {
  if (!breakerBuilt(state)) return 'The Breaker is not standing.';
  if (machineSpeed(state, 'breaker') <= 0) return 'It has cracked. Re-cast it before it will run.';
  if (tierOf(state, machineId) <= 0) return 'It is not built.';
  const made = state.plant?.builtOf?.[machineId] ?? [];
  if (made.length === 0) {
    // A machine raised before `builtOf` existed (A.83) remembers nothing, so
    // there is nothing to hand back and the honest answer is to say so rather
    // than to invent stone.
    return 'Nobody wrote down what it was cast from. There is nothing to give back.';
  }
  return null;
}

export function unbuildMachine(
  state: GameState, ctx: EngineCtx, machineId: string,
): ActionResult {
  const blocked = unbuildBlocker(state, machineId);
  if (blocked) return { ok: false, reason: blocked };
  const p = state.plant!;
  const made = p.builtOf![machineId]!;
  const tier = p.tiers[machineId]!;
  for (const materialId of made) {
    state.casting.rack.push({
      id: state.casting.nextId++,
      type: 'sockets',
      materialId,
      purity: 40,
    } as never);
  }
  delete p.tiers[machineId];
  delete p.builtOf![machineId];
  // AND THE WORLD'S MARK COMES OFF WITH IT. A condition is written onto a
  // machine (§7.2); there is no machine now, and a seizure that survived an
  // un-build would be a permanent debuff on a thing that does not exist.
  delete p.condition?.[machineId];
  ctx.emit({ type: 'machineUnbuilt', machineId, parts: made.length });
  ctx.dirty();
  return { ok: true, data: { parts: made.length, tierLost: tier } };
}

/** Every material this Breaker could hand back off the rack right now. */
export function breakable(state: GameState): { partId: number; materialId: string; name: string; units: number }[] {
  if (!breakerBuilt(state)) return [];
  const onBench = new Set(Object.values(state.casting?.bench ?? {}));
  return (state.casting?.rack ?? [])
    .filter((p) => !onBench.has(p.id))
    .map((p) => ({
      partId: p.id,
      materialId: p.materialId,
      name: (() => { try { return materialDef(p.materialId).name; } catch { return p.materialId; } })(),
      units: breakYield(p),
    }));
}
