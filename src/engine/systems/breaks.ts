/**
 * §55 — THE THREE NAMED FAILURES, over the pieces that already shipped.
 *
 * A.106 built the GENERIC cascade: a failure that drags a neighbour, records
 * its parent, and unwinds from the head when the first failure is fixed. §55's
 * table then names six specific ones. Row 6 (STATION COLLAPSE) shipped with the
 * thresholds. This file is rows 1 and 5 — the two that survived A.107's scoping
 * pass once the pass was re-run against the code instead of the registry.
 *
 * ROW 2 (BROWNOUT) IS NOT HERE, and that is a ruling rather than an omission:
 * it wants a machine PRIORITY ORDER, and `plant.ts` rejected one on purpose —
 * "a plant that is 60% of what its machines want runs everything at 60%, which
 * is a thing a player can read off the panel and fix, unlike a silent priority
 * order." Building row 2 reverses that decision. ROW 3 (UNAIMED FRACTURE) is
 * CUT: it locks cells, `dpsMax = W·H·regen·Y` counts cells, and a cascade that
 * shrinks the face is a yield change however it is dressed.
 *
 * AND ROW 4 (OVERGROWTH) IS NOT HERE EITHER, which A.107's own scoping pass got
 * wrong and the driven test caught. It was sized BUILDABLE because every piece
 * it names EXISTS: a Verdance condition called `overgrown`, `cultivar.cropped`
 * to pay into, `STRAINS` to pay from. What the probe never asked was whether
 * the condition can be WRITTEN, and it cannot:
 *
 *     writing: (s, id) => tierOf(s, id) > 0 && (s.plant?.served?.[id] ?? 0) <= 0
 *
 * `served` is not an attendance record. `tickPlant` writes it for EVERY machine
 * in `MACHINE_DEMAND` every tick as `flowSatisfaction`, which is a SUPPLY ratio
 * — and in Verdance the supply floor is `PLANT_FLOOR = 2.4` through `bloomFlow`,
 * scaled by a `drawShare` that is 0.5 or 1 and never 0. So the ratio is > 0 for
 * every drawer, and 1 for every machine that draws no Flow at all. There is no
 * state a save can reach where `served <= 0`. Verdance's condition has never
 * fired for anybody, and `condition.test.ts` reads green because it WRITES
 * `served` by hand and then calls `tickCondition` without `tickPlant` — a test
 * that a function works and not a test that anything calls it.
 *
 * So §55.4 wants a system first: a per-machine "is anybody using this" signal
 * the plant does not have and cannot fake out of what it keeps. Changing what
 * `overgrown` MEANS instead — the green gets into a machine the plant cannot
 * feed — is a live and reachable rule, and it is a shell signature, which this
 * phase is not allowed to move. Ledgered, asked, not built.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT BOTH SHARE, AND WHY THERE IS ONE FILE RATHER THAN TWO.
 *
 * A break is: a machine stands RIPE for a while, then it BREAKS — which seizes
 * or marks it and hands its neighbours to THE DRAG. Everything after that is
 * already built. The chain names its parent (`cascadedFrom`), the panel prints
 * the links, and fixing the head lets the rest go one link per tick, because
 * `failing()` stops being true for the machine at the head.
 *
 * So each row below authors exactly three things: when it is ripe, what
 * breaking costs, and how you get out. Not one of them re-implements a cascade.
 *
 * PILLAR 2. A break costs heat, slag, speed, a stopped machine and information.
 * There is no path from this file to `cellCap`, `cellRegen` or `chipYield`, and
 * `breaks.test.ts` reads `dpsMax` at one depth with both fired to say so rather
 * than to claim it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { EngineCtx, GameState } from '../types';
import {
  biting, bandOfMachine, conditionOf, conditionedMachines, ensureCondition,
  ensureDrags, machineLabel,
} from './condition';
import { ensurePlant, tierOf } from './plant';
import { PURGE_HEAT, PURGE_SLAG_COST } from './pressure';
import { boilerBuilt, riskedHeat } from './boiler';
import { WITNESS_HUSH, ensureWitness } from './witness';
import { currentShell } from '../shells';
import { logScar } from './shaftSys';
import { chipCurrencyId } from '../shells';
import { getCurrency } from '../resources';

export type BreakId = 'blowout' | 'silence';

export interface BreakDef {
  id: BreakId;
  shellId: string;
  /** §55's own Codex line, recorded the first time it happens. */
  name: string;
  /** One sentence: what just went wrong. */
  said: string;
  /** ...and one for how you get out of it. */
  recovery: string;
  /** Which machines can break this way. Probed, never listed. */
  candidates: (state: GameState) => string[];
  /** Is this machine at the point of it? */
  ripe: (state: GameState, machineId: string) => boolean;
  /** How long it must stand there first. */
  sec: number;
  /** What breaking costs. Costs only — nothing here pays. */
  fire: (state: GameState, ctx: EngineCtx, machineId: string) => void;
}

/**
 * HOW LONG A MACHINE STANDS AT THE EDGE BEFORE IT GOES. Long enough that a
 * player who is present can act on it — the gauge climbing IS the warning §55
 * asks for, and a break with no warning is the random debuff the whole phase is
 * written against.
 */
export const RIPE_SEC = 90;

/** Risked heat above which the Boiler is at the edge. */
export const BLOWOUT_HEAT = 70;

/** Which built machines sit within a band of this one. THE DRAG's neighbourhood. */
function neighbours(state: GameState, machineId: string): string[] {
  const band = bandOfMachine(state, machineId);
  return conditionedMachines().filter(
    (id) => id !== machineId
      && built(state, id)
      && Math.abs(bandOfMachine(state, id) - band) <= 1,
  );
}

function built(state: GameState, machineId: string): boolean {
  return tierOf(state, machineId) > 0 || (machineId === 'kiln' && state.kiln.built);
}

/** Hand every neighbour to the drag, with this machine named as the parent. */
function dragNeighbours(state: GameState, machineId: string): string[] {
  const drags = ensureDrags(state);
  const took: string[] = [];
  for (const id of neighbours(state, machineId)) {
    if (drags[id]) continue;
    drags[id] = { from: machineId, sec: 0 };
    took.push(id);
  }
  return took;
}

// ---------------------------------------------------------------------------
// The two
// ---------------------------------------------------------------------------

export const BREAKS: BreakDef[] = [
  {
    /**
     * §55.1 — BOILER EXPLOSION. "machine down → heat floods the adjacent Line →
     * emergency vents fire, costing the heat bank → plant at reduced capacity."
     *
     * Every clause is a shipped verb. The Boiler already trades safety for
     * power — `BOILER_FLOW_PER_RISK` pays you for heat you are CHOOSING to
     * risk — so the failure is the other end of a bet the player is already
     * making, which is the difference between a consequence and a die roll.
     *
     * THE VENTS FIRE THEMSELVES. That is the whole cost: the emergency purge is
     * a button you would otherwise press at a moment of your choosing, for a
     * quarter of your held Slag, and a blowout spends it for you at the worst
     * one. Nothing new is deducted — `PURGE_HEAT` and `PURGE_SLAG_COST` are the
     * shipped numbers, applied by the shell instead of by you.
     */
    id: 'blowout',
    shellId: 'cinder',
    name: 'FIRST BOILER EXPLOSION',
    said: 'The Boiler let go. The vents fired themselves and took the bank with them.',
    recovery: 'Re-cast the valve — and the gauge is still climbing while you do it.',
    candidates: (s) => (boilerBuilt(s) ? ['boiler'] : []),
    ripe: (s) => boilerBuilt(s) && riskedHeat(s) >= BLOWOUT_HEAT,
    sec: RIPE_SEC,
    fire: (state, ctx) => {
      // THE VENTS, at the shipped price. `pressure.ts` owns both numbers.
      const chipId = chipCurrencyId(state);
      const held = getCurrency(state, chipId);
      state.currencies[chipId] = held.mul(1 - PURGE_SLAG_COST);
      state.pressure.heat = Math.max(0, state.pressure.heat - PURGE_HEAT);
      state.pressure.ventedTotal += PURGE_HEAT;
      // The machine is DOWN. A seizure is the one state re-casting is the only
      // exit from, which is exactly what §55's recovery column asks for.
      const table = ensureCondition(state);
      table['boiler'] = { id: 'baked', level: 1, seized: true, fullFor: 0 };
      // ...and NOT the neighbours: `fireBreak` drags for every row, and doing it
      // here as well was a second call that could be deleted with no test going
      // red — which is how the red-test found it.
      logScar(state, ctx, 'flood', state.depth);
    },
  },
  {
    /**
     * §55.5 — THE SILENCE TAKES A MACHINE. "output becomes undecided → then its
     * RECIPE becomes undecided → you do not know what it is making until you
     * observe. Recovery: spend a Witness."
     *
     * THE FIRST STAGE ALREADY SHIPPED and nobody had written it down: `deliver`
     * turns an undecided machine's output into a registered Maybe stone, and
     * `witness()` is the priced verb that settles one. This is the second — the
     * machine stops saying what it DRAWS and how well it is being served, so a
     * Hollow plant becomes a thing you have to go and look at rather than read.
     *
     * IT COSTS INFORMATION AND NOTHING ELSE. The machine keeps running at
     * exactly the rate it was running at; what you lose is the panel. LAW 3
     * pointed at your own plant — the destination is still visible (it is still
     * the Kiln, it still makes Brick), the working is not.
     */
    id: 'silence',
    shellId: 'hollow',
    name: 'WHAT THE PLANT FORGOT',
    said: 'It has stopped saying what it is doing.',
    recovery: 'Spend a Witness on it. Attention is the only thing the quiet answers to.',
    candidates: (s) => conditionedMachines().filter((id) => built(s, id)),
    ripe: (s, id) => biting(s, id, 'undecided') && (conditionOf(s, id)?.level ?? 0) >= 1,
    sec: RIPE_SEC,
    fire: (state, ctx) => {
      logScar(state, ctx, 'station', state.depth);
    },
  },
];

export function breakDef(id: BreakId): BreakDef | undefined {
  return BREAKS.find((b) => b.id === id);
}

export function breakFor(shellId: string): BreakDef | undefined {
  return BREAKS.find((b) => b.shellId === shellId);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface BrokenMachine {
  id: BreakId;
  /** playTimeSec it went. For the panel, and for "the gauge is still climbing". */
  atSec: number;
}

export function ensureBroken(state: GameState): Record<string, BrokenMachine> {
  const p = ensurePlant(state);
  return (p.broken ??= {});
}

export function ensureRipe(state: GameState): Record<string, number> {
  const p = ensurePlant(state);
  return (p.ripe ??= {});
}

export function brokenAs(state: GameState, machineId: string): BreakId | null {
  return state.plant?.broken?.[machineId]?.id ?? null;
}

export function isBroken(state: GameState, machineId: string): boolean {
  return brokenAs(state, machineId) !== null;
}

/**
 * HOW CLOSE THIS ONE IS, 0..1 — and it is deliberately NOT hidden.
 *
 * §55's recoveries are "interesting, not waiting", and the interesting version
 * of a boiler explosion is the one you can see coming and choose to ride. This
 * is the opposite call from §53's thresholds, which are never announced, and
 * the reason is the difference between a world that changes underneath you and
 * a machine you are actively over-driving.
 */
export function ripeness(state: GameState, machineId: string): number {
  const def = breakFor(currentShell(state).id);
  if (!def || isBroken(state, machineId)) return 0;
  if (!def.candidates(state).includes(machineId) || !def.ripe(state, machineId)) return 0;
  return Math.max(0, Math.min(1, (state.plant?.ripe?.[machineId] ?? 0) / def.sec));
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

/**
 * ONE BREAK PER SHELL, and only the shell you are standing in — the same rule
 * `condition.ts` uses, for the same reason. A Boiler that blew in Cinder does
 * not un-blow when you Breach; it simply stops being a thing that can happen.
 */
export function tickBreaks(state: GameState, dt: number): BreakDef | null {
  if (dt <= 0) return null;
  const def = breakFor(currentShell(state).id);
  const ripe = ensureRipe(state);
  if (!def) { for (const k of Object.keys(ripe)) delete ripe[k]; return null; }

  const broken = ensureBroken(state);
  let went: BreakDef | null = null;
  for (const id of def.candidates(state)) {
    if (broken[id]) continue;
    if (!def.ripe(state, id)) { ripe[id] = 0; continue; }
    ripe[id] = (ripe[id] ?? 0) + dt;
    if ((ripe[id] ?? 0) < def.sec || went) continue;
    ripe[id] = 0;
    broken[id] = { id: def.id, atSec: state.stats.playTimeSec };
    went = def;   // ONE per pass; a plant that goes all at once is a wipe
  }
  /**
   * ...AND ONE PER RIPENING, WHICH IS NOT THE SAME THING AND THE FIRST DRAFT
   * ONLY HAD THE FIRST.
   *
   * Three of the five condition rules read SHELL state and ignore `machineId`,
   * so in Verdance and Hollow every built machine ripens on the same second.
   * "One per pass" then means the plant goes at one machine PER TICK — a wipe
   * with a stagger, not a failure with a warning. Zeroing the rest buys the
   * player a full `def.sec` to act between the first machine and the second,
   * which is the whole reason `RIPE_SEC` exists.
   */
  if (went) for (const k of Object.keys(ripe)) ripe[k] = 0;
  return went;
}

/**
 * Fire the one that just went. Split from the tick so the caller owns the
 * event and the engine's `ctx` never has to be threaded through the registry.
 */
export function fireBreak(state: GameState, ctx: EngineCtx, def: BreakDef): string[] {
  const broken = ensureBroken(state);
  const hit = Object.keys(broken).filter((id) => broken[id]!.id === def.id);
  const just = hit[hit.length - 1];
  if (!just) return [];
  def.fire(state, ctx, just);
  // EVERY break drags its neighbours. That is what makes it a §55 cascade and
  // not an event — and it is why none of the three re-implements one.
  const took = dragNeighbours(state, just);
  ctx.emit({ type: 'machineBroke', machineId: just, id: def.id, name: def.name });
  ctx.dirty();
  return took;
}

// ---------------------------------------------------------------------------
// The two ways out
// ---------------------------------------------------------------------------

/** True while the plant will not say what this machine is drawing (§55.5). */
export function recipeHidden(state: GameState, machineId: string): boolean {
  return brokenAs(state, machineId) === 'silence';
}

/** ...and a stopped machine, which is the Boiler's shape and not the quiet's. */
export function stopped(state: GameState, machineId: string): boolean {
  return brokenAs(state, machineId) === 'blowout';
}

export function witnessMachineBlocker(state: GameState, machineId: string): string | null {
  if (brokenAs(state, machineId) !== 'silence') return 'It is saying what it is doing.';
  const w = ensureWitness(state);
  if ((w.hush ?? 0) < WITNESS_HUSH) {
    return `Needs ${WITNESS_HUSH} of hush — you are holding ${Math.floor(w.hush ?? 0)}.`;
  }
  return null;
}

/**
 * §55.5's recovery — spend a Witness on your own machine.
 *
 * Priced at the same `WITNESS_HUSH` a maybe-stone costs, deliberately: the two
 * are the same act at two scales, and charging differently for them would say
 * they were different systems when they are one.
 */
export function witnessMachine(state: GameState, ctx: EngineCtx, machineId: string): {
  ok: boolean; reason?: string;
} {
  const blocked = witnessMachineBlocker(state, machineId);
  if (blocked) return { ok: false, reason: blocked };
  const w = ensureWitness(state);
  w.hush -= WITNESS_HUSH;
  delete ensureBroken(state)[machineId];
  delete ensureCondition(state)[machineId];
  ctx.emit({ type: 'machineWitnessed', machineId });
  ctx.dirty();
  return { ok: true };
}

/**
 * ...AND THE BOILER'S, WHICH IS THE ONE THAT WAS ALREADY BUILT. `recastMachine`
 * clears the condition; this clears the break with it, so a re-cast valve is a
 * working Boiler and not a Boiler that reads fine and still does not run.
 */
export function clearBreakOnRecast(state: GameState, machineId: string): void {
  if (brokenAs(state, machineId) === 'blowout') delete ensureBroken(state)[machineId];
}

/** One line for the panel: what went wrong here, and what to do about it. */
export function breakLine(state: GameState, machineId: string): string | null {
  const id = brokenAs(state, machineId);
  const def = id ? breakDef(id) : undefined;
  if (!def) return null;
  return `${def.said} ${def.recovery}`;
}

/** ...and one for a machine that is only close to it. */
export function ripeLine(state: GameState, machineId: string): string | null {
  const r = ripeness(state, machineId);
  if (r <= 0) return null;
  const def = breakFor(currentShell(state).id)!;
  return `The ${machineLabel(machineId)} is ${Math.round(r * 100)}% of the way to going. ${def.recovery}`;
}

/** Every machine this shell can still take, for the panel to iterate. */
export function watchable(state: GameState): string[] {
  const def = breakFor(currentShell(state).id);
  if (!def) return [];
  return def.candidates(state).filter((id) => ripeness(state, id) > 0 || isBroken(state, id));
}
