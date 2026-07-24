/**
 * MAGMA WELLS — commit currency, wait, roll ×3-×40 or total loss.
 *
 * THE GUARDRAILS (charter, enforced in code and printed in the UI):
 *  - The odds are PUBLISHED. The table below renders verbatim at the well
 *    mouth. EV ≈ 1.17× the committed amount — honestly positive for the
 *    variance you carry, never an engine. No near-miss theater: the roll
 *    is one uniform draw against the printed table, and the result screen
 *    says which line you hit and nothing else.
 *  - Never dominant: commits cap at 10% of the balance, three wells run at
 *    most, and returns are the committed currency itself — a player who
 *    never touches a Well loses nothing structural.
 *  - Never punishes absence: wells resolve on the game clock and the
 *    result WAITS forever. There is no expiry, no streak, no daily.
 */
import { D, type Decimal } from '../../decimal';
import type { ActionResult, EngineCtx, GameState } from '../../types';
import { addCurrency } from '../../resources';
import { masteryLevel } from '../../systems/mastery';
import { lawNum } from '../../laws';

export interface WellDef {
  id: string;
  name: string;
  minutes: number;
  currencyId: string;
  minCommit: number;
  flavor: string;
}

export const WELLS: WellDef[] = [
  { id: 'nearWell', name: 'The Near Well', minutes: 20, currencyId: 'slag', minCommit: 200, flavor: 'Close enough to watch. It bubbles like it knows something.' },
  { id: 'deepWell', name: 'The Deep Well', minutes: 75, currencyId: 'ember', minCommit: 60, flavor: 'The rope goes down further than rope goes.' },
  { id: 'netherWell', name: 'The Nether Well', minutes: 240, currencyId: 'pyre', minCommit: 20, flavor: 'Nobody has seen the bottom. The bottom has definitely seen you.' },
];

export const WELL_BY_ID = new Map(WELLS.map((w) => [w.id, w]));

/** The whole table, printed at the mouth of every well. One draw, no drama. */
export const WELL_ODDS: Array<{ p: number; mult: number; label: string }> = [
  { p: 0.8, mult: 0, label: 'the well keeps it' },
  { p: 0.15, mult: 3, label: 'x3 — a warm return' },
  { p: 0.04, mult: 8, label: 'x8 — a bright one' },
  { p: 0.01, mult: 40, label: 'x40 — the story you will tell' },
];

export const WELL_COMMIT_CAP = 0.1; // of current balance
export const MAX_ACTIVE_WELLS = 3;

export function wellsUnlocked(state: GameState): boolean {
  return masteryLevel(state, 'cinder') >= 6;
}

export function commitToWell(state: GameState, wellId: string, amount: Decimal): ActionResult {
  if (!wellsUnlocked(state)) return { ok: false, reason: 'The Wells open at Cinder Mastery 6' };
  const well = WELL_BY_ID.get(wellId);
  if (!well) return { ok: false, reason: 'No such well' };
  if (state.wells.active.length >= MAX_ACTIVE_WELLS) return { ok: false, reason: 'Three ropes down is all the winch takes' };
  if (state.wells.active.some((a) => a.wellId === wellId)) return { ok: false, reason: 'That well is already fed' };
  const held = state.currencies[well.currencyId] ?? D(0);
  const cap = held.mul(WELL_COMMIT_CAP).floor();
  if (amount.lt(well.minCommit)) return { ok: false, reason: `The well ignores less than ${well.minCommit}` };
  if (amount.gt(cap)) return { ok: false, reason: `A tenth of your holdings at most (${cap.toString()}) — house rule, YOUR house` };
  state.currencies[well.currencyId] = held.sub(amount);
  // THE PRESSURE TAP (B5): the wells live in the vent gallery now, and a well
  // fed while the gallery runs hot — heat in the working band, a vent route
  // laid — is stirred by the flow and resolves 25% faster. Printed odds
  // untouched; only the wait shortens. A player who never vents just waits
  // the full rope, exactly as before.
  const tapped = wellTapLive(state);
  state.wells.active.push({ wellId, currencyId: well.currencyId, amount, startedMs: state.guild.clockMs, tapped });
  state.wells.totalCommitted = state.wells.totalCommitted.add(amount);
  return { ok: true, data: { tapped } };
}

/** Is the tap flowing right now? (Also read by the UI, so the card can say.) */
export function wellTapLive(state: GameState): boolean {
  return state.pressure.heat >= 50 && state.pressure.pipes.some((p) => p > 0);
}

export const WELL_TAP_SPEED = 0.75; // of the printed minutes

export function wellProgress(state: GameState, wellId: string): number {
  const a = state.wells.active.find((x) => x.wellId === wellId);
  if (!a) return 0;
  const well = WELL_BY_ID.get(wellId)!;
  const minutes = well.minutes * (a.tapped ? WELL_TAP_SPEED : 1);
  return Math.min(1, (state.guild.clockMs - a.startedMs) / (minutes * 60_000));
}

export function collectWell(state: GameState, ctx: EngineCtx, wellId: string): ActionResult {
  const idx = state.wells.active.findIndex((x) => x.wellId === wellId);
  if (idx < 0) return { ok: false, reason: 'Nothing down that well' };
  if (wellProgress(state, wellId) < 1) return { ok: false, reason: 'Still down there. The well does not hurry' };
  const a = state.wells.active[idx]!;
  state.wells.active.splice(idx, 1);
  state.wells.rolls += 1;
  // One uniform draw against the published table. That is the whole game.
  let draw = Math.random();
  let mult = 0;
  for (const line of WELL_ODDS) {
    if (draw < line.p) {
      mult = line.mult;
      break;
    }
    draw -= line.p;
  }
  let payout = a.amount.mul(mult);
  if (mult > 0) {
    addCurrency(state, a.currencyId, payout);
    state.wells.wins += 1;
    state.wells.totalReturned = state.wells.totalReturned.add(payout);
  } else {
    state.wells.losses += 1;
    // THE HONEST WELL (law): a loss pays back this share. Printed odds
    // unchanged — the floor is a refund, not a reroll.
    const floorShare = lawNum(state, 'wellFloorShare');
    if (floorShare > 0) {
      payout = a.amount.mul(floorShare);
      addCurrency(state, a.currencyId, payout);
      state.wells.totalReturned = state.wells.totalReturned.add(payout);
    }
  }
  ctx.dirty();
  ctx.emit({ type: 'wellResult', wellId, mult, amount: a.amount });
  return { ok: true, data: { mult, payout } };
}

export function defaultWellsState(): GameState['wells'] {
  return { active: [], rolls: 0, wins: 0, losses: 0, totalCommitted: D(0), totalReturned: D(0) };
}
