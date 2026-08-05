/**
 * THE SEATING — THE TERMINAL CRAFT (§13), in the wreck at The Reading Room 32.
 *
 * §13: "seat seven parts and pour a world · the end". §6 lists it as the last
 * keystone, and states its absence as a full stop in four words: **the game
 * does not end.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT READS §4's FRAME AND DOES NOT DUPLICATE IT.
 *
 * `seats.ts` owns the seven seats, what each wants, and the fact that a seated
 * Seat is permanent. This machine owns the two things §13 and §31.1 ask for on
 * top of that:
 *
 *   BEQUEATH   §31.1's unit of concern for this era is "the inheritance — what
 *              of this survives me". Four things a Recursion currently takes,
 *              and the Seating hands them forward instead.
 *   POUR       with all seven seated, the world ends and the next one begins
 *              with your finished tool in it.
 *
 * THE POUR IS NOT A NEW RESET LAYER. It is a Recursion — the same verb, the
 * same ledger, the same formula — made with a finished frame, and it records
 * itself. The reset ladder is locked and nothing here adds a rung to it; a
 * Recursion you may only make once the tool is finished is still a Recursion.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TIERS ARE CAPABILITY (§15.4) — and tier I is deliberately not a bequest:
 *
 *   I    it reads the frame, and names what each empty seat still wants
 *   II   ...and one bequest survives the Recursion
 *   III  ...and two
 *   IV   ...and three
 *   V    ...and all four — the whole desk comes with you
 *
 * PILLAR 2. Every bequest is a fact about the WORLD you have already changed —
 * a wreck already looted, a wall already broken, a band already timbered, a
 * machine already built — handed forward rather than made again. None of them
 * touches `cellCap`, `cellRegen` or `chipYield`, none grants a currency, and
 * `seating.test.ts` bequeaths all four, pours, and reads the ceiling unmoved at
 * the same depth in both arms. What a bequest buys is the twenty-five per cent
 * pillar 6 already promises, spent on the climb rather than on the paperwork.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { conditionOf } from './condition';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';
import { SEATS, allSeven, seatBlocker, seatedCount } from './seats';

/** The wreck it is found in — Aleph, The Reading Room 32. Authored with §6. */
export const SEATING_WRECK = 'THE SEATING';

export const TIER_CAPABILITY_SEATING = [
  'not built',
  'it reads the frame, and names what each empty seat still wants',
  '...and one bequest survives the Recursion',
  '...and two',
  '...and three',
  '...and all four — the whole desk comes with you',
] as const;

export const BEQUESTS = ['opendoor', 'brokenwall', 'longstair', 'standing'] as const;
export type BequestId = (typeof BEQUESTS)[number];

export interface BequestDef {
  id: BequestId;
  name: string;
  /** What survives, said plainly. Never a number. */
  does: string;
  flavor: string;
}

export const BEQUEST_DEFS: BequestDef[] = [
  {
    id: 'opendoor', name: 'The Open Door',
    does: 'Every wreck you have opened stays opened. You do not loot the same machine twice.',
    flavor: 'Somebody has already been through it. The lid is off and the tools are gone.',
  },
  {
    id: 'brokenwall', name: 'The Broken Wall',
    does: 'Every wall you have broken stays broken.',
    flavor: 'The rubble is still where it fell, which is how you know it was you.',
  },
  {
    id: 'longstair', name: 'The Long Stair',
    does: 'Every band you have timbered stays timbered, through the Recursion.',
    flavor: 'The props are old and dry and they hold, which is more than can be said for the world.',
  },
  {
    id: 'standing', name: 'The Standing Machine',
    does: 'One machine you have built is standing in the next world, at its first tier.',
    flavor: 'Bolted to a floor that has not been poured yet.',
  },
];

export const BEQUEST_BY_ID = new Map(BEQUEST_DEFS.map((b) => [b.id, b]));

export interface SeatingState {
  /** Bequests nominated, in the order chosen. Trimmed to the tier's slots. */
  bequests: BequestId[];
  /** THE STANDING MACHINE names one machine id. */
  machine: string | null;
  /** Worlds poured. §13's ending, and it is allowed to happen more than once. */
  poured: number;
}

export function defaultSeatingState(): SeatingState {
  return { bequests: [], machine: null, poured: 0 };
}

export function ensureSeating(state: GameState): SeatingState {
  const s = (state.seating ??= defaultSeatingState());
  s.bequests ??= [];
  s.machine ??= null;
  s.poured ??= 0;
  return s;
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export function seatingStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === SEATING_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function seatingFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === SEATING_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function seatingBuilt(state: GameState): boolean {
  return tierOf(state, 'seating') > 0;
}

/** Bequests this Seating will carry. Tier I carries none — it only reads. */
export function bequestSlots(state: GameState): number {
  return Math.max(0, tierOf(state, 'seating') - 1);
}

export function nextSeatingTierCost(state: GameState): number | null {
  const t = tierOf(state, 'seating');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildSeating(state: GameState, ctx: EngineCtx): ActionResult {
  if (!seatingFound(state)) {
    const at = seatingStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Seating.' };
  }
  const cost = nextSeatingTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Seating is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'seating', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['seating'] = tierOf(state, 'seating') + 1;
  ensureSeating(state);
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'seating', tier: plant.tiers['seating']! });
  return { ok: true, data: { tier: plant.tiers['seating'] } };
}

// ---------------------------------------------------------------------------
// BEQUEATH
// ---------------------------------------------------------------------------

export function bequestsSet(state: GameState): BequestId[] {
  return (state.seating?.bequests ?? []).slice(0, bequestSlots(state));
}

export function bequestBlocker(state: GameState, id: BequestId): string | null {
  if (!seatingBuilt(state)) return 'The Seating is not standing.';
  if (conditionOf(state, 'seating')?.seized) return 'The table has split. Re-cast it.';
  if (!BEQUEST_BY_ID.has(id)) return 'No such bequest.';
  if ((state.seating?.bequests ?? []).includes(id)) return null;   // taking one off is free
  const slots = bequestSlots(state);
  if (slots <= 0) return 'This Seating only reads the frame. A deeper one carries something.';
  if (bequestsSet(state).length >= slots) {
    return `It will carry ${slots} thing${slots === 1 ? '' : 's'}. Take one off first.`;
  }
  return null;
}

/** Nominate or withdraw one. Withdrawing is free — a plan you cannot change is a trap. */
export function setBequest(state: GameState, ctx: EngineCtx, id: BequestId): ActionResult {
  const blocked = bequestBlocker(state, id);
  if (blocked) return { ok: false, reason: blocked };
  const s = ensureSeating(state);
  const at = s.bequests.indexOf(id);
  if (at >= 0) s.bequests.splice(at, 1);
  else s.bequests.push(id);
  ctx.dirty();
  return { ok: true, data: { bequests: [...s.bequests] } };
}

/** THE STANDING MACHINE names which one. Any machine the plant knows you built. */
export function setBequestMachine(state: GameState, ctx: EngineCtx, machineId: string | null): ActionResult {
  if (!seatingBuilt(state)) return { ok: false, reason: 'The Seating is not standing.' };
  if (machineId !== null && tierOf(state, machineId) <= 0) {
    return { ok: false, reason: 'You have not built that.' };
  }
  ensureSeating(state).machine = machineId;
  ctx.dirty();
  return { ok: true, data: { machine: machineId } };
}

/**
 * CARRY THEM ACROSS — called by `recursionSys` while it builds the next world,
 * with the OLD state to read from and the NEW one to write into.
 *
 * It cannot refuse the Recursion, cannot change what it pays, and every branch
 * below copies a fact about a world you already changed. Returns what it
 * carried, for the event.
 */
export function carryBequests(prev: GameState, next: GameState): BequestId[] {
  const carried: BequestId[] = [];
  const s = prev.seating;
  if (!s) return carried;
  // The tier is read off the OLD world's plant, because that is the Seating
  // that made the promise.
  const slots = Math.max(0, tierOf(prev, 'seating') - 1);
  for (const id of (s.bequests ?? []).slice(0, slots)) {
    if (id === 'opendoor') {
      const looted = prev.roll?.looted ?? [];
      if (looted.length === 0) continue;
      (next.roll ??= { rolled: {}, cleared: [], looted: [], rolls: 0 } as never);
      next.roll!.looted = [...new Set([...(next.roll!.looted ?? []), ...looted])];
    } else if (id === 'brokenwall') {
      const cleared = prev.roll?.cleared ?? [];
      if (cleared.length === 0) continue;
      (next.roll ??= { rolled: {}, cleared: [], looted: [], rolls: 0 } as never);
      next.roll!.cleared = [...new Set([...(next.roll!.cleared ?? []), ...cleared])];
    } else if (id === 'longstair') {
      const shored = prev.roll?.shored ?? [];
      if (shored.length === 0) continue;
      (next.roll ??= { rolled: {}, cleared: [], looted: [], rolls: 0 } as never);
      next.roll!.shored = [...new Set([...(next.roll!.shored ?? []), ...shored])];
    } else if (id === 'standing') {
      const m = s.machine;
      if (!m || tierOf(prev, m) <= 0) continue;
      const plant = ensurePlant(next);
      plant.tiers[m] = Math.max(1, plant.tiers[m] ?? 0);
    }
    carried.push(id);
  }
  // The desk itself rides — you do not re-nominate every Recursion.
  next.seating = { bequests: [...(s.bequests ?? [])], machine: s.machine ?? null, poured: s.poured ?? 0 };
  return carried;
}

// ---------------------------------------------------------------------------
// POUR — the terminal craft
// ---------------------------------------------------------------------------

/**
 * WHAT EACH EMPTY SEAT STILL WANTS — tier I's whole capability, and the reason
 * tier I is not a bequest. Seven lines of "here is the thing you are missing"
 * is what turns a frame of outlines into a plan.
 */
export function whatIsMissing(state: GameState): Array<{ seat: string; want: string }> {
  if (!seatingBuilt(state)) return [];
  const out: Array<{ seat: string; want: string }> = [];
  for (const def of SEATS) {
    if (state.seats?.seated?.[def.id]) continue;
    out.push({ seat: def.id, want: seatBlocker(state, def.id) ?? 'Nothing. Seat it.' });
  }
  return out;
}

export function pourBlocker(state: GameState): string | null {
  if (!seatingBuilt(state)) return 'The Seating is not standing.';
  if (!allSeven(state)) {
    return `The frame holds ${seatedCount(state)} of 7. It will not pour a world with a hole in it.`;
  }
  if (state.shell?.current !== 'aleph') return 'It pours from the Reading Room, and nowhere else.';
  return null;
}

/**
 * POUR THE WORLD. §13's ending — and mechanically it is a RECURSION, made with
 * a finished tool. `recursionSys` owns the reset; this owns the gate and the
 * record, which is the whole reason it is not a new rung on a locked ladder.
 */
export function markPoured(state: GameState): number {
  const s = ensureSeating(state);
  s.poured += 1;
  return s.poured;
}

// ---------------------------------------------------------------------------
// What the panel says — the UI computes nothing
// ---------------------------------------------------------------------------

export function seatingRead(state: GameState): {
  built: boolean; tier: number; slots: number;
  bequests: BequestId[]; machine: string | null;
  missing: Array<{ seat: string; want: string }>;
  seated: number; poured: number; pour: string | null;
} {
  return {
    built: seatingBuilt(state),
    tier: tierOf(state, 'seating'),
    slots: bequestSlots(state),
    bequests: bequestsSet(state),
    machine: state.seating?.machine ?? null,
    missing: whatIsMissing(state),
    seated: seatedCount(state),
    poured: state.seating?.poured ?? 0,
    pour: pourBlocker(state),
  };
}
