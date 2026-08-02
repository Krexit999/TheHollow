/**
 * The Kiln — Dust -> Brick converter, throughput-limited, with its own fuel
 * curve. Invented model (appended to DESIGN.md):
 *
 *   - Intake: consumes up to `KILN_BASE_RATE * kilnRate-bucket` dust/sec.
 *   - Heat 0..1: climbs toward 1 while fed (time constant ~25s), sinks toward
 *     0 while starved (~40s). The kiln visibly stokes up and banks down.
 *   - Efficiency = 0.25 + 0.75 * heat — a cold kiln wastes most of its feed.
 *   - Every KILN_DUST_PER_BRICK of *effective* dust becomes 1 Brick
 *     (times the brickYield bucket).
 */
import { Decimal } from '../decimal';
import type { ModifierCache } from '../modifiers';
import { addCurrency, getCurrency } from '../resources';
import type { EngineCtx, GameState } from '../types';
import { grantXP } from './xp';
import { chipCurrencyId, convCurrencyId } from '../shells';
import { lawFlag, sealed } from '../laws';
import { flowSatisfaction } from './plant';
import { materialCount, consumeMaterial } from './forge';
import {
  kilnFuel, OVERSTOKE_EFF_MULT, OVERSTOKE_WINDOW_SEC, OVERSTOKE_COOLDOWN_SEC, OVERSTOKE_COST_SECONDS,
} from '../content/kilnFuel';

/** Dust it costs to light an overstoke right now — scales with the kiln's intake. */
export function overstokeCost(state: GameState, mods: ModifierCache): Decimal {
  return kilnRate(state, mods).mul(OVERSTOKE_COST_SECONDS);
}

export function overstokeReady(state: GameState): boolean {
  return state.kiln.built && (state.kiln.overstokeReadyAt ?? 0) <= state.stats.playTimeSec;
}

/** Light the deliberate burst: pay Dust up front, open the window, start the
 *  cooldown. Opt-in and foreseeable — nothing here fires on its own. */
export function lightOverstoke(state: GameState, mods: ModifierCache): { ok: boolean; reason?: string } {
  if (!state.kiln.built) return { ok: false, reason: 'No kiln' };
  if (!overstokeReady(state)) return { ok: false, reason: 'The kiln needs to recover first' };
  const cost = overstokeCost(state, mods);
  const chipId = chipCurrencyId(state);
  if (getCurrency(state, chipId).lt(cost)) return { ok: false, reason: 'Not enough Dust to force it' };
  state.currencies[chipId] = getCurrency(state, chipId).sub(cost);
  const now = state.stats.playTimeSec;
  state.kiln.overstokeUntil = now + OVERSTOKE_WINDOW_SEC;
  state.kiln.overstokeReadyAt = now + OVERSTOKE_COOLDOWN_SEC;
  state.kiln.heat = 1; // it forces the fire to full at once
  return { ok: true };
}

// 2 dust/sec base: ~70% of idle income (2.88/s) or ~12% of active income —
// feeding the kiln is a real early-game tension, not a tax you can't refuse.
export const KILN_BASE_RATE = 2;
export const KILN_DUST_PER_BRICK = 25;
export const KILN_HEAT_UP_TAU = 25; // seconds to ~63% heat while fed
export const KILN_COOL_TAU = 40; // seconds to shed ~63% heat while starved

export function kilnRate(state: GameState, mods: ModifierCache): Decimal {
  return mods.get(state, 'kilnRate').mul(KILN_BASE_RATE);
}

/** OVERSTOKE window active right now? */
export function overstokeActive(state: GameState): boolean {
  return (state.kiln.overstokeUntil ?? 0) > state.stats.playTimeSec;
}

export function kilnEfficiency(state: GameState): number {
  // Base efficiency caps at 1.0 with heat. OVERSTOKE lifts it briefly (a burst of
  // output for a Dust cost) — it is the one thing that pushes past the heat cap,
  // and only while the window is open. It converts Dust you already had; the Dust
  // itself is still field-bound, so this changes when bricks land, not the ceiling.
  const base = 0.25 + 0.75 * state.kiln.heat;
  return overstokeActive(state) ? base * OVERSTOKE_EFF_MULT : base;
}

export function tickKiln(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number): void {
  const kiln = state.kiln;
  if (!kiln.built) return;
  // COLD IRON (challenge): the Kiln stands and will not light. No converter
  // runs, so nothing you own turns Dust into the thing you build with.
  if (sealed(state, 'sealKiln')) {
    kiln.feeding = false;
    kiln.heat = 0;
    return;
  }

  // THE REVERSED KILN (law): fire runs downhill — Brick melts back to Dust
  // at a 25% premium over the forward exchange. Same throat, other way.
  if (kiln.reverse && lawFlag(state, 'kilnReverse')) {
    const convId = convCurrencyId(state);
    const eat = Decimal.min(kilnRate(state, mods).mul(dt).div(KILN_DUST_PER_BRICK), getCurrency(state, convId));
    if (eat.gt(0)) {
      state.currencies[convId] = getCurrency(state, convId).sub(eat);
      addCurrency(state, chipCurrencyId(state), eat.mul(KILN_DUST_PER_BRICK).mul(1.25));
      kiln.heat = Math.min(1, kiln.heat + 0.08 * dt);
    }
    return;
  }

  let fed = false;
  const chipId = chipCurrencyId(state);
  if (kiln.feeding) {
    /**
     * THE KILN IS PURE FLOW (§3.1). It runs continuously and never spikes, so
     * sustained draw is exactly what it wants and a Surge bank does nothing for
     * it. Starved of Flow it does not stop — it runs SLOW, proportionally, and
     * keeps working. That is the half of the contrast the Crusher does not have.
     *
     * PILLAR 2: this scales how fast the Kiln eats Dust the field already grew.
     * It cannot reach cap, regen or yield, so the ceiling does not move.
     */
    const want = kilnRate(state, mods).mul(dt).mul(flowSatisfaction(state, 'kiln'));
    const have = getCurrency(state, chipId);
    const eat = Decimal.min(want, have);
    if (eat.gt(0)) {
      state.currencies[chipId] = have.sub(eat);
      kiln.progress = kiln.progress.add(eat.mul(kilnEfficiency(state)));
      fed = true;
    }
  }

  // FUEL (v21): a chosen burn profile bends the heat dynamics — how fast it climbs
  // and how well it holds — and burns a trickle of a material you own. When the
  // material runs out the kiln burns bare (the profile falls away), so a fuel is
  // never a hard dependency. None of this touches the efficiency cap (pillar 2).
  const fuel = kilnFuel(kiln.fuel);
  let heatUp = 1, cool = 1;
  if (fuel && materialCount(state, fuel.materialId) >= 1) {
    // The profile applies while you hold the fuel; burn accumulates and is spent a
    // whole unit at a time so material stacks stay integer.
    if (fed) {
      kiln.fuelBurn = (kiln.fuelBurn ?? 0) + fuel.burnPerSec * dt;
      const whole = Math.floor(kiln.fuelBurn);
      if (whole >= 1) {
        const took = consumeMaterial(state, fuel.materialId, Math.min(whole, materialCount(state, fuel.materialId)));
        if (took !== null) kiln.fuelBurn -= whole;
      }
      heatUp = fuel.heatUpMult;
    }
    // A banked fuel slows the cool-down whether or not it is being fed right now.
    cool = fuel.coolMult;
  }

  // Fuel curve: exponential approach toward 1 while fed, toward 0 otherwise.
  const ramp = mods.get(state, 'kilnHeatRamp').toNumber();
  if (fed) {
    kiln.heat += (1 - kiln.heat) * (dt / KILN_HEAT_UP_TAU) * ramp * heatUp;
  } else {
    kiln.heat -= kiln.heat * (dt / KILN_COOL_TAU) * cool;
  }
  kiln.heat = Math.max(0, Math.min(1, kiln.heat));

  if (kiln.progress.gte(KILN_DUST_PER_BRICK)) {
    const bricks = kiln.progress.div(KILN_DUST_PER_BRICK).floor();
    kiln.progress = kiln.progress.sub(bricks.mul(KILN_DUST_PER_BRICK));
    const out = bricks.mul(mods.get(state, 'brickYield')).floor();
    if (out.gte(1)) {
      addCurrency(state, convCurrencyId(state), out);
      state.stats.bricksFired = state.stats.bricksFired.add(out);
      grantXP(state, mods, ctx, out);
      ctx.emit({ type: 'brick', count: out });
    }
  }
}
