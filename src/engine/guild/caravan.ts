/**
 * THE CARAVAN — Serra's road. Rates drift on the game clock in a bounded
 * band, so checking in finds opportunity; holdings never decay, and a round
 * trip is always lossy (the fee applies both ways and the drift inverts),
 * so there is no arbitrage loop to grind.
 *
 * A FLAGGED pivot from the literal reading: the Breach RESETS shell-local
 * currencies, so "trade Dust for Ingot" is structurally empty — there is
 * never a moment you hold both. What the road actually carries:
 *   - the LIVE shell's chip <-> converter pair (Dust<->Brick in Loam,
 *     Ingot<->Flux in Ferrite), resolved like every scaffold cost; and
 *   - Ferrite's byproducts (Scale, Lodestone, Rime) sold up the stair for
 *     Scrip.
 * Same promise — drifting rates reward checking in — without a dead tab.
 *
 * "Fair" chip<->conv rates are self-balancing: the base is the ratio of
 * your LIFETIME totals, so the road trades at the proportions your own
 * economy actually runs at, in any shell, in any era.
 */
import { D, type Decimal } from '../decimal';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { addCurrency, getCurrency, getTotal, spendCurrency } from '../resources';
import { resolveCurrencyId } from '../shells';
import type { ModifierCache } from '../modifiers';
import { runnerFeeCut } from './hirelings';
import { repTier } from './npcs';

export interface CaravanRoute {
  id: string;
  /** CHIP/CONV resolve against the current shell (like upgrade costs). */
  from: string;
  to: string;
  label: string;
  /** Byproduct routes pay a flat scrip rate instead of the totals ratio. */
  flatScripPer?: number;
  /** A crate is a crate: byproduct loads cap at this many units per trade. */
  maxLoad?: number;
  /** Only offered after the breach (the byproducts exist below). */
  ferriteOnly?: boolean;
  phase: number;
}

export const CARAVAN_ROUTES: CaravanRoute[] = [
  { id: 'chip-conv', from: 'CHIP', to: 'CONV', label: 'Raw haul to the converter yards', phase: 0 },
  { id: 'conv-chip', from: 'CONV', to: 'CHIP', label: 'Converter stock back to the face', phase: 0 },
  { id: 'scale-scrip', from: 'scale', to: 'scrip', label: 'Scale up the stair', flatScripPer: 0.15, maxLoad: 400, ferriteOnly: true, phase: 1.7 },
  { id: 'lodestone-scrip', from: 'lodestone', to: 'scrip', label: 'Lodestone shot for the yards', flatScripPer: 0.2, maxLoad: 300, ferriteOnly: true, phase: 3.1 },
  { id: 'rime-scrip', from: 'rime', to: 'scrip', label: 'Bottled rime, packed in straw', flatScripPer: 0.5, maxLoad: 150, ferriteOnly: true, phase: 4.4 },
];

export const CARAVAN_FEE = 0.12;
export const DRIFT_PERIOD_MS = 7 * 3600_000; // one slow breath every ~7 clock-hours

export function caravanUnlocked(state: GameState): boolean {
  return state.guild.discovered && state.shell.breachCount >= 1;
}

export function routesAvailable(state: GameState): CaravanRoute[] {
  return CARAVAN_ROUTES.filter((r) => !r.ferriteOnly || state.shell.breachCount >= 1);
}

function resolveEnd(state: GameState, id: string): string {
  return resolveCurrencyId(id, state);
}

/** Drift multiplier in [0.85, 1.2]; the paired route gets its inverse. */
export function drift(state: GameState, route: CaravanRoute): number {
  const t = (state.guild.clockMs / DRIFT_PERIOD_MS) * Math.PI * 2 + route.phase;
  const wave = 0.5 + 0.5 * Math.sin(t);
  const d = 0.85 + wave * 0.35;
  // Forward rides the wave; the paired return rides its inverse.
  return route.id === 'conv-chip' ? 1 / d : d;
}

export function effectiveFee(state: GameState): number {
  const serraTier = repTier(state.guild.npcs['serra']?.rep ?? 0);
  return Math.max(0.05, CARAVAN_FEE - runnerFeeCut(state) - 0.005 * serraTier);
}

/** Units of `to` per unit of `from`, all-in. */
export function routeRate(state: GameState, mods: ModifierCache | null, route: CaravanRoute): Decimal {
  const fee = 1 - effectiveFee(state);
  if (route.flatScripPer !== undefined) {
    const scripMult = mods ? mods.get(state, 'scripGain').toNumber() : 1;
    return D(route.flatScripPer * drift(state, route) * fee * scripMult);
  }
  const from = resolveEnd(state, route.from);
  const to = resolveEnd(state, route.to);
  const totalFrom = getTotal(state, from).max(1);
  const totalTo = getTotal(state, to).max(1);
  return totalTo.div(totalFrom).mul(drift(state, route)).mul(fee);
}

export function caravanTrade(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  routeId: string,
  amount: number,
): ActionResult {
  if (!caravanUnlocked(state)) return { ok: false, reason: 'The road wants a second market first' };
  const route = routesAvailable(state).find((r) => r.id === routeId);
  if (!route) return { ok: false, reason: 'No such route' };
  if (!(amount > 0)) return { ok: false, reason: 'Nothing loaded' };
  const from = resolveEnd(state, route.from);
  const to = resolveEnd(state, route.to);
  const held = getCurrency(state, from);
  let load = held.mul(Math.min(1, amount)); // amount is a FRACTION of holdings
  if (route.maxLoad !== undefined) load = load.min(route.maxLoad);
  if (load.lte(0.01)) return { ok: false, reason: `No ${from} to send` };
  const paid = load.mul(routeRate(state, mods, route));
  spendCurrency(state, from, load);
  // Byproduct sales are earned income (scrip); conversions are moved wealth.
  addCurrency(state, to, paid, route.flatScripPer !== undefined);
  state.guild.caravan.trades += 1;
  const serra = state.guild.npcs['serra'];
  if (serra) serra.rep += 2;
  ctx.dirty();
  ctx.emit({ type: 'caravanTraded', route: routeId });
  return { ok: true, data: { sent: load, received: paid } };
}
