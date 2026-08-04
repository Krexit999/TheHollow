/**
 * THE PLANT — FLOW AND SURGE (§3).
 *
 * Draw used to be one scalar and a sort order, which made every plant the same
 * plant at a different size. It is two numbers now, and they are not
 * interchangeable:
 *
 *   FLOW    sustained draw per second. Good for continuous processes. WASTED by
 *           machines that idle between cycles.
 *   SURGE   a bank that discharges in one burst and refills slowly. Good for
 *           anything that fires once and hard. WASTED by machines that run
 *           constantly.
 *
 * EVERY MACHINE HAS A DEMAND PROFILE (§3.1), and that is the whole claim: the
 * Kiln is pure Flow, the Crusher is pure Surge, the Refinery wants both. Two
 * plants at identical TOTAL capacity are good at different machines, and
 * neither is better. A machine starved of the wrong one is unaffected; a
 * machine starved of the right one visibly stops.
 *
 * PILLAR 2 IS UNTOUCHED AND THIS IS THE LOAD-BEARING SENTENCE. Draw accelerates
 * CONVERSION — it decides how fast the Kiln eats Dust it already has, how often
 * the Crusher fires, whether a refine goes through. There is no path from any
 * number in this file to `cellCap`, `cellRegen` or `chipYield`, so
 * `dpsMax = W·H·regen·Y` cannot move. A plant twice the size converts the same
 * ceiling faster; it does not raise it. There is a test that asserts exactly
 * this by driving capacity to absurd values and reading dpsMax.
 */
import type { GameState } from '../types';
import { coreNodeLevel } from '../content/shell1/coreTree';
import { traitsOf, type TraitId } from '../traits';
/**
 * E2 (§7.2). `condition.ts` imports `MACHINE_DEMAND`, `ensurePlant` and
 * `tierOf` from here, so this is a CYCLE — and it is the deliberate kind, in
 * the same family as the documented `toolMining` <-> `toolMods` one. Both
 * halves only call across at RUNTIME (inside a function body), never at module
 * scope, so neither binding can arrive undefined. The alternative was a third
 * module holding two functions, which puts the seam in a place that describes
 * nothing.
 */
import { conditionRetainsBand, conditionTraits } from './condition';

/**
 * THE HEARTH — Loam's plant (§3.2): PURE FLOW, SMALL, off the Kiln's waste heat.
 *
 * It is not a building you buy. It is the Kiln already running: a cold kiln
 * gives the floor, a hot one gives the rest. That is why Loam's shape is
 * "pure Flow, small" without a second construction step — the shell's power
 * comes from the converter it already has, which is also why a Loam player who
 * wants SURGE has to go and buy it with Cores.
 */
/**
 * THE FLOOR IS EXACTLY THE KILN'S OWN DEMAND, and that is a constraint, not a
 * round number. A lone Kiln must never be starved by the plant it IS: at 1.5
 * against a demand of 2.4 a cold kiln ran at 62.5% and the systems test caught
 * it immediately — a 37.5% cut to the opening converter, smuggled in under a
 * power system. §23's measured opening does not move for this.
 *
 * So Flow scarcity begins the moment you add a SECOND flow machine, which is
 * the Refinery, and not before. That is also the better shape: the Hearth is
 * adequate for the plant you start with and inadequate for the plant you build.
 */
export const HEARTH_FLOOR = 2.4;
export const HEARTH_PER_HEAT = 2.5;

/** What one rank of each Core-tree capacity node is worth. */
export const FLOW_PER_RANK = 1.2;
export const SURGE_PER_RANK = 8;

/**
 * EXACTLY ONE BATCH, and that bound is not cosmetic.
 *
 * At 4 against a Crusher costing 14, a player who had built the machine and not
 * yet bought Reservoir could never fire it — not slowly, EVER. The shape sim
 * caught it as a flat zero, and a machine you can build and cannot run is a
 * broken purchase, not a tradeoff. The floor is therefore one firing: the
 * Crusher always works, and Reservoir buys how OFTEN, which is the honest
 * version of what the node was supposed to sell.
 */
export const SURGE_FLOOR = 14;

/**
 * REFILLS SLOWLY — the defining half of what Surge is. A full bank takes
 * `1 / this` seconds to rebuild from empty, so a plant that fires a big batch
 * is quiet afterwards. Lower this and Surge becomes Flow with extra steps.
 */
export const SURGE_REFILL_PER_SEC = 0.055;

export interface PlantState {
  /** What is in the Surge bank right now, 0..surgeCap. */
  surge: number;
  /** Machine id -> tier built (0 = not built). Tiers come from cast parts. */
  tiers: Record<string, number>;
  /** Rolling record of what Flow was actually satisfied last tick, per machine —
   *  so the panel can say "the Kiln is at 40%" instead of implying it is fine. */
  served: Record<string, number>;
  /**
   * WHAT EACH MACHINE IS MADE OF (§11.2). Material ids of the cast parts spent
   * building it, accumulated across its tiers.
   *
   * The tier ladder answers "what can this machine do"; this answers "what does
   * THIS one do differently from the identical one you built out of other
   * stone". Until A.83 the parts were spent and their materials discarded at
   * the moment of consumption, so every Crusher in every save was the same
   * Crusher — which made §11.2's whole claim ("a keen liner grinds finer")
   * unrepresentable.
   *
   * Absent = a machine built before this existed. Those keep the plain
   * behaviour, which is what they have always had.
   */
  builtOf?: Record<string, string[]>;
  /**
   * E2 (§7.2) — WHAT THE WORLD HAS DONE TO EACH MACHINE. One condition value
   * per machine, one rule per shell; `systems/condition.ts` owns the shape and
   * every rule that writes it. Absent = nothing has happened to it yet.
   */
  condition?: Record<string, import('./condition').MachineCondition>;
  /**
   * GLASSMERE ONLY (§7.2, §19) — which of the six wavelengths a machine sits
   * in. Unset falls back to the machine's index, so a player who never opens
   * the optics still has machines in different bands.
   */
  bands?: Record<string, number>;
  /**
   * TRANSIENT: a Line is mid-firing, so a member's own `fire` must not draw
   * again (§14.5). Set and cleared inside `runLine`, in a `finally` so a member
   * that throws cannot leave the plant permanently free.
   */
  inLine?: boolean;
}

export function defaultPlantState(): PlantState {
  return { surge: SURGE_FLOOR, tiers: {}, served: {}, builtOf: {} };
}

export function ensurePlant(state: GameState): PlantState {
  const p = (state.plant ??= defaultPlantState());
  p.tiers ??= {};
  p.served ??= {};
  p.builtOf ??= {};
  if (typeof p.surge !== 'number' || Number.isNaN(p.surge)) p.surge = SURGE_FLOOR;
  return p;
}

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

/** Sustained draw available per second. The Hearth plus whatever Cores bought. */
export function flowCap(state: GameState): number {
  const hearth = state.kiln.built ? HEARTH_FLOOR + HEARTH_PER_HEAT * state.kiln.heat : 0;
  return hearth + FLOW_PER_RANK * coreNodeLevel(state, 'flowCapacity');
}

/** How big the burst can be. */
export function surgeCap(state: GameState): number {
  return SURGE_FLOOR + SURGE_PER_RANK * coreNodeLevel(state, 'surgeCapacity');
}

export function surgeRegen(state: GameState): number {
  return surgeCap(state) * SURGE_REFILL_PER_SEC;
}

// ---------------------------------------------------------------------------
// Demand profiles (§3.1)
// ---------------------------------------------------------------------------

export interface Demand {
  /** Sustained draw while running. */
  flow: number;
  /** One-shot draw per firing. */
  surge: number;
}

/**
 * THE THREE MACHINES OF THE LOAM CHAIN, and their shapes are the point.
 *
 * The Kiln runs constantly and never spikes, so it is pure Flow and a Surge
 * bank does nothing for it. The Crusher does nothing at all and then does
 * everything at once, so it is pure Surge and sustained draw is wasted on it.
 * The Refinery wants both, which is what makes it the machine that punishes a
 * lopsided plant.
 */
export const MACHINE_DEMAND: Record<string, Demand> = {
  kiln: { flow: 2.4, surge: 0 },
  crusher: { flow: 0, surge: 14 },
  /**
   * THE REFINERY IS THE MACHINE THAT PUNISHES A LOPSIDED PLANT, and its Flow
   * number is sized to actually do that. At 1.6 the Hearth at full heat (4.9)
   * covered both continuous machines with room to spare, so Draught bought
   * literally nothing and the shape sim came out 73 bricks to 73 — the two arms
   * were indistinguishable on the machine that was supposed to separate them.
   *
   * At 4.0 the pair want 6.4 against a Hearth that tops out at 4.9, so a plant
   * with no Draught runs its Kiln at about three-quarters and knows why. This
   * is the number that makes "wants both" mean something.
   */
  refinery: { flow: 4.0, surge: 7 },
  /**
   * THE ASSAY BENCH IS PURE SURGE, and that is the point of putting it here at
   * all. A sample is one hard pull and then nothing — the Crusher's shape, not
   * the Kiln's — so a Draught plant finds reading the Roll expensive and a
   * Reservoir plant finds it cheap. §3's claim doing work in a system that is
   * not a machine, which is the test of whether the claim was real.
   */
  assayBench: { flow: 0, surge: 9 },
  /**
   * THE SIEVE (§14.3) — PURE FLOW, and small. A filter is a standing rule, not
   * an event: it is consulted every time any machine reaches for stock, so it
   * draws while it exists rather than when it fires. Sized under the Crusher's
   * demand because sorting should never be the thing that starves the plant it
   * is sorting FOR.
   */
  sieve: { flow: 1.1, surge: 0 },
  /**
   * THE BREAKER (§13) — PURE SURGE, and heavier than the Crusher's. It does
   * nothing at all and then takes something apart in one go, which is the
   * Crusher's shape pointed at your own stock instead of at the rock.
   */
  breaker: { flow: 0, surge: 11 },
  /**
   * THE ALLOY CRUCIBLE (§14.2) — FLOW AND SURGE, and the heaviest of both. It
   * holds a melt and then pours it in one go, which is the Refinery's shape and
   * the Crusher's at once. It is the machine a lopsided plant cannot run.
   */
  crucible: { flow: 3.2, surge: 9 },
  /**
   * THE LINE (§14.5) — pure Surge, and the biggest single draw in the plant.
   * It fires everything at once or not at all, which is the Crusher's shape
   * with four machines behind it.
   */
  line: { flow: 0, surge: 18 },
  /**
   * THE BALANCE (§14.4) — pure FLOW, and heavy. It does not fire; it holds two
   * pans level, which is a sustained thing and the Kiln's shape, not the
   * Crusher's.
   */
  balance: { flow: 3.6, surge: 0 },
  /**
   * THE STILL (§14.1) — FLOW AND SURGE, like the Refinery, and for the same
   * reason: it holds a slow heat and then takes one thing out in a single
   * separation. It is the second machine that punishes a lopsided plant.
   */
  still: { flow: 2.2, surge: 6 },
  /**
   * THE INFUSER (§14.1) — pure SURGE, and heavy. Its shape is the Still's
   * INVERTED, which is the whole relationship between the two: the Still holds
   * a slow heat and separates, the Infuser holds nothing and drives one thing
   * into another in a single push. A plant tuned for the Still is not tuned for
   * this, and that is the point of both being keystones.
   */
  infuser: { flow: 0, surge: 13 },
};

export function demandOf(machineId: string): Demand {
  return MACHINE_DEMAND[machineId] ?? { flow: 0, surge: 0 };
}

/**
 * WHICH MACHINES ARE DRAWING FLOW RIGHT NOW.
 *
 * A Kiln that is not feeding draws nothing — that is the point of Flow, it is
 * paid while running. The Refinery is a continuous process and draws whenever
 * it is built, which is why standing a Refinery up on a thin plant slows the
 * Kiln: they are competing for the same sustained number.
 */
function flowDrawers(state: GameState): string[] {
  const out: string[] = [];
  if (state.kiln.built && state.kiln.feeding) out.push('kiln');
  if (tierOf(state, 'refinery') > 0) out.push('refinery');
  // THE SIEVE draws whenever it is standing, like the Refinery: a filter is a
  // standing rule consulted on every reach for stock, not an event.
  if (tierOf(state, 'sieve') > 0) out.push('sieve');
  if (tierOf(state, 'still') > 0) out.push('still');
  if (tierOf(state, 'crucible') > 0) out.push('crucible');
  if (tierOf(state, 'balance') > 0) out.push('balance');
  return out;
}

/**
 * WHAT FRACTION OF ITS FLOW A MACHINE ACTUALLY GETS.
 *
 * Contention is proportional, not first-come: two machines over capacity both
 * run slow rather than one running full and the other stopping dead. A plant
 * that is 60% of what its machines want runs everything at 60%, which is a
 * thing a player can read off the panel and fix, unlike a silent priority order.
 */
export function flowSatisfaction(state: GameState, machineId: string): number {
  const want = demandOf(machineId).flow;
  if (want <= 0) return 1;
  const drawers = flowDrawers(state);
  if (!drawers.includes(machineId)) return 1;
  const total = drawers.reduce((n, id) => n + demandOf(id).flow, 0);
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, flowCap(state) / total));
}

/** Total Flow the built-and-running plant is asking for. */
export function flowDemand(state: GameState): number {
  return flowDrawers(state).reduce((n, id) => n + demandOf(id).flow, 0);
}

// ---------------------------------------------------------------------------
// The Surge bank
// ---------------------------------------------------------------------------

export function canFire(state: GameState, machineId: string): boolean {
  const need = demandOf(machineId).surge;
  if (need <= 0) return true;
  return ensurePlant(state).surge >= need;
}

/**
 * SPEND THE BURST. Returns false without spending when the bank is short — the
 * machine WAITS rather than running slowly, which is the whole difference
 * between being starved of Surge and being starved of Flow.
 */
export function fire(state: GameState, machineId: string): boolean {
  const need = demandOf(machineId).surge;
  const p = ensurePlant(state);
  /**
   * A LINE PAYS FOR ITS MEMBERS ONCE (§14.5, A.91). `runLine` charges the whole
   * draw up front and then calls each member's ordinary verb — and those verbs
   * call `fire` themselves, so without this the bank was charged TWICE and a
   * three-machine Line cost 68 Surge against a quoted 54. Found by the Line's
   * own test on its first run.
   *
   * It is not a discount: `lineDraw` is the SUM of the members plus a mismatch
   * penalty, so the up-front charge is never less than what the hands would
   * have paid separately.
   */
  if (p.inLine) return true;
  if (need <= 0) return true;
  if (p.surge < need) return false;
  p.surge -= need;
  return true;
}

export function tickPlant(state: GameState, dt: number): void {
  const p = ensurePlant(state);
  const cap = surgeCap(state);
  if (p.surge > cap) p.surge = cap; // capacity can fall when a Breach wipes the tree
  p.surge = Math.min(cap, p.surge + surgeRegen(state) * dt);
  for (const id of Object.keys(MACHINE_DEMAND)) {
    p.served[id] = flowSatisfaction(state, id);
  }
}

// ---------------------------------------------------------------------------
// Machine tiers (§15.4) — built from cast parts, never bought with currency
// ---------------------------------------------------------------------------

export const MAX_MACHINE_TIER = 3;

/** Cast parts a tier costs. Tier I is two parts; each tier after is dearer. */
export const TIER_PART_COST = [0, 2, 3, 5];

export function tierOf(state: GameState, machineId: string): number {
  return ensurePlant(state).tiers[machineId] ?? 0;
}

/**
 * §15.4, THE THREE TIERS THAT EXIST IN LOAM, restated as capability rather than
 * as a number that goes up:
 *
 *   I    commons only — the output drops a purity band
 *   II   RETAINS THE INPUT'S PURITY BAND
 *   III  EMITS BYPRODUCTS AT ALL
 *
 * Each is a thing the machine could not do before, not a bigger multiplier.
 */
/**
 * E2 OVERRIDES THE TIER, in both directions (§7.2). An UNLIT Glassmere machine
 * keeps the band whatever tier it is; an UNDECIDED Hollow one will not commit
 * to a band at any tier. Everything else has no opinion and the tier decides.
 */
export function retainsBand(state: GameState, machineId: string): boolean {
  const said = conditionRetainsBand(state, machineId);
  if (said !== null) return said;
  return tierOf(state, machineId) >= 2;
}

export function emitsByproduct(state: GameState, machineId: string): boolean {
  return tierOf(state, machineId) >= 3;
}

/**
 * EVERY MACHINE IS A TINKERS ITEM (§11.2) — what this one is MADE of.
 *
 * The traits of every cast part spent on it, unioned. A trait is present or it
 * is not; nothing here counts how MANY keen parts went in, because a second
 * keen liner making a machine "more keen" is the level track §15.4 forbids
 * wearing a different hat. One keen part changes what the machine will do; two
 * change nothing further.
 */
export function machineTraits(state: GameState, machineId: string): Set<TraitId> {
  const out = new Set<TraitId>();
  for (const id of ensurePlant(state).builtOf?.[machineId] ?? []) {
    for (const t of traitsOf(id)) out.add(t);
  }
  // ...AND WHATEVER THE WORLD PUT ON IT (E2, §7.2). Verdance's OVERGROWN hands
  // a machine a trait it was never cast with, and every trait-reading behaviour
  // in the plant reads it from here — so the rule changes what the machine DOES
  // rather than adding a second lookup beside this one.
  for (const t of conditionTraits(state, machineId)) out.add(t);
  return out;
}

/** Was this machine cast with any part carrying this trait? */
export function builtWith(state: GameState, machineId: string, trait: TraitId): boolean {
  return machineTraits(state, machineId).has(trait);
}

/**
 * Record what a tier was paid for in. Called by each machine's build path, which
 * is the only place parts are consumed — so there is one seam and a machine
 * cannot acquire a trait it was not cast from.
 */
export function noteBuiltOf(state: GameState, machineId: string, materialIds: string[]): void {
  const p = ensurePlant(state);
  p.builtOf ??= {};
  p.builtOf[machineId] = [...(p.builtOf[machineId] ?? []), ...materialIds];
}

export const TIER_CAPABILITY = [
  'not built',
  'commons only — the band drops',
  'retains the input\'s purity band',
  'emits byproducts',
] as const;
