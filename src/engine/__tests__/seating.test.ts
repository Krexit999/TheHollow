/**
 * THE SEATING — THE TERMINAL CRAFT (§13), and §31.1's "what of this survives me".
 *
 * The two claims: the pour is gated on a FINISHED frame and is not a new rung
 * on the locked ladder, and a bequest carries a fact about a world you already
 * changed — never a rate.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { dpsMax } from '../systems/face';
import { ModifierCache } from '../modifiers';
import { SEATS, ensureSeats } from '../systems/seats';
import {
  BEQUESTS, BEQUEST_DEFS, bequestBlocker, bequestSlots, carryBequests, ensureSeating,
  pourBlocker, seatingBuilt, seatingRead, setBequest, setBequestMachine, whatIsMissing,
} from '../systems/seating';
import type { GameState } from '../types';

function fresh(): GameState {
  return createEngine({ nowMs: 0 }).getState() as GameState;
}
const ctx = () => ({ emit: () => {}, dirty: () => {} }) as never;

function seatingAt(tier: number): GameState {
  const s = fresh();
  (s.plant ??= { tiers: {}, builtOf: {} } as never);
  s.plant!.tiers['seating'] = tier;
  return s;
}

/** Fill the frame without going near the seven conditions. */
function seatAll(s: GameState): void {
  const seats = ensureSeats(s);
  for (const d of SEATS) {
    seats.seated[d.id] = { seat: d.id, materialId: d.materialId, purity: 105, atRecursion: 0 };
  }
}

describe('tier I reads the frame, and that is the whole of tier I', () => {
  it('an unbuilt Seating reads nothing and carries nothing', () => {
    const s = fresh();
    expect(seatingBuilt(s)).toBe(false);
    expect(whatIsMissing(s)).toEqual([]);
    expect(bequestSlots(s)).toBe(0);
    expect(bequestBlocker(s, 'opendoor')).toMatch(/not standing/);
  });

  it('tier I names what each empty seat still wants, and carries nothing', () => {
    const s = seatingAt(1);
    const missing = whatIsMissing(s);
    expect(missing).toHaveLength(7);
    for (const m of missing) expect(m.want.length).toBeGreaterThan(0);
    expect(bequestSlots(s)).toBe(0);
    expect(bequestBlocker(s, 'opendoor')).toMatch(/only reads the frame/);
  });

  it('a seated seat drops off the missing list', () => {
    const s = seatingAt(1);
    ensureSeats(s).seated['I'] = { seat: 'I', materialId: 'deepgrave', purity: 105, atRecursion: 0 };
    expect(whatIsMissing(s).map((m) => m.seat)).not.toContain('I');
    expect(whatIsMissing(s)).toHaveLength(6);
  });
});

describe('bequest slots are the tier minus one, and every row is named', () => {
  it('II carries one, V carries all four', () => {
    expect(bequestSlots(seatingAt(1))).toBe(0);
    expect(bequestSlots(seatingAt(2))).toBe(1);
    expect(bequestSlots(seatingAt(5))).toBe(4);
    expect(BEQUESTS).toHaveLength(4);
    expect(BEQUEST_DEFS).toHaveLength(4);
    for (const b of BEQUEST_DEFS) {
      expect(b.name.length, b.id).toBeGreaterThan(0);
      expect(b.does.length, b.id).toBeGreaterThan(0);
    }
  });

  it('a tier-II Seating refuses the second nomination and says the number', () => {
    const s = seatingAt(2);
    expect(setBequest(s, ctx(), 'opendoor').ok).toBe(true);
    expect(setBequest(s, ctx(), 'brokenwall')).toMatchObject({ ok: false, reason: /carry 1 thing/ });
    // ...and taking one off is always free.
    expect(setBequest(s, ctx(), 'opendoor').ok).toBe(true);
    expect(setBequest(s, ctx(), 'brokenwall').ok).toBe(true);
  });

  it('THE STANDING MACHINE only names a machine you built', () => {
    const s = seatingAt(5);
    expect(setBequestMachine(s, ctx(), 'kiln')).toMatchObject({ ok: false, reason: /have not built/ });
    s.plant!.tiers['crusher'] = 2;
    expect(setBequestMachine(s, ctx(), 'crusher').ok).toBe(true);
    expect(seatingRead(s).machine).toBe('crusher');
  });
});

describe('a bequest carries a fact about a world you already changed', () => {
  function withWorld(tier: number): GameState {
    const s = seatingAt(tier);
    s.roll = { rolled: {}, cleared: ['w1'], looted: ['k1'], shored: ['b1'], rolls: 0 } as never;
    s.plant!.tiers['crusher'] = 3;
    return s;
  }

  it('nothing nominated carries nothing, which is the red arm', () => {
    const prev = withWorld(5);
    const next = fresh();
    expect(carryBequests(prev, next)).toEqual([]);
    expect(next.roll?.looted ?? []).toEqual([]);
  });

  it('each of the four lands where it says it lands', () => {
    const prev = withWorld(5);
    const s = ensureSeating(prev);
    s.bequests = ['opendoor', 'brokenwall', 'longstair', 'standing'];
    s.machine = 'crusher';
    const next = fresh();
    expect(carryBequests(prev, next).sort()).toEqual(['brokenwall', 'longstair', 'opendoor', 'standing']);
    expect(next.roll!.looted).toContain('k1');
    expect(next.roll!.cleared).toContain('w1');
    expect(next.roll!.shored).toContain('b1');
    expect(next.plant!.tiers['crusher']).toBe(1);      // AT ITS FIRST TIER, not its third
  });

  it('the tier caps what is carried, and it is the OLD world\'s tier that decides', () => {
    const prev = withWorld(2);                          // one slot
    ensureSeating(prev).bequests = ['opendoor', 'brokenwall', 'longstair'];
    const next = fresh();
    expect(carryBequests(prev, next)).toEqual(['opendoor']);
    expect(next.roll?.cleared ?? []).not.toContain('w1');
  });

  it('the desk itself rides — you do not re-nominate every Recursion', () => {
    const prev = withWorld(5);
    ensureSeating(prev).bequests = ['opendoor'];
    const next = fresh();
    carryBequests(prev, next);
    expect(next.seating!.bequests).toEqual(['opendoor']);
  });
});

describe('the pour is gated on a finished frame', () => {
  it('it refuses with a hole in it, and names the count', () => {
    const s = seatingAt(5);
    s.shell.current = 'aleph';
    expect(pourBlocker(s)).toMatch(/0 of 7/);
    ensureSeats(s).seated['I'] = { seat: 'I', materialId: 'deepgrave', purity: 105, atRecursion: 0 };
    expect(pourBlocker(s)).toMatch(/1 of 7/);
  });

  it('...and with all seven it refuses anywhere but the Reading Room', () => {
    const s = seatingAt(5);
    seatAll(s);
    s.shell.current = 'loam';
    expect(pourBlocker(s)).toMatch(/Reading Room/);
    s.shell.current = 'aleph';
    expect(pourBlocker(s)).toBeNull();
  });

  it('the dispatched pour is refused by the same gate', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.plant!.tiers['seating'] = 5;
    s.shell.current = 'aleph';
    s.aleph.coreTouched = true;
    const bad = engine.dispatch({ type: 'pourWorld' });
    expect(bad.ok).toBe(false);
    expect(String(bad.reason)).toMatch(/0 of 7/);
  });

  it('THE POUR IS A RECURSION — same ledger, recorded, frame kept', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.plant!.tiers['seating'] = 5;
    s.plant!.tiers['crusher'] = 4;
    s.roll = { rolled: {}, cleared: ['w1'], looted: ['k1'], shored: [], rolls: 0 } as never;
    ensureSeating(s).bequests = ['opendoor', 'brokenwall', 'standing'];
    ensureSeating(s).machine = 'crusher';
    seatAll(s);
    s.shell.current = 'aleph';
    s.aleph.coreTouched = true;

    const before = s.recursion.count;
    const res = engine.dispatch({ type: 'pourWorld' });
    expect(res.ok).toBe(true);
    const next = engine.getState() as GameState;
    expect(next.recursion.count).toBe(before + 1);      // the SAME rung, not a new one
    expect(next.shell.current).toBe('loam');
    expect(next.seating!.poured).toBe(1);
    expect(next.seats!.seated['VII']).toBeDefined();    // the frame is kept
    expect(next.roll!.looted).toContain('k1');
    expect(next.roll!.cleared).toContain('w1');
    expect(next.plant!.tiers['crusher']).toBe(1);
  });

  it('an ordinary Recursion carries the bequests too, and does not record a pour', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.plant!.tiers['seating'] = 3;
    s.roll = { rolled: {}, cleared: [], looted: ['k1'], shored: [], rolls: 0 } as never;
    ensureSeating(s).bequests = ['opendoor'];
    s.shell.current = 'aleph';
    s.aleph.coreTouched = true;
    expect(engine.dispatch({ type: 'recurse' }).ok).toBe(true);
    const next = engine.getState() as GameState;
    expect(next.roll!.looted).toContain('k1');
    expect(next.seating!.poured).toBe(0);
  });
});

describe('PILLAR 2 — a bequest is reach, and the ceiling does not move', () => {
  it('all four carried, dpsMax identical at the same depth in both arms', () => {
    const mods = new ModifierCache();
    const bare = fresh();
    bare.depth = 48;
    mods.invalidate();
    const before = dpsMax(bare, mods).toNumber();

    const s = fresh();
    s.depth = 48;                                       // THE SAME DEPTH BOTH ARMS
    s.plant!.tiers['seating'] = 5;
    s.plant!.tiers['crusher'] = 3;
    s.roll = { rolled: {}, cleared: ['w1'], looted: ['k1'], shored: ['b1'], rolls: 0 } as never;
    ensureSeating(s).bequests = [...BEQUESTS];
    ensureSeating(s).machine = 'crusher';
    seatAll(s);
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).toBe(before);

    // ...and after a pour has actually landed them.
    const next = fresh();
    next.depth = 48;
    carryBequests(s, next);
    mods.invalidate();
    expect(dpsMax(next, mods).toNumber()).toBe(before);
    expect(next.roll!.looted).toContain('k1');          // not vacuous

    // RED TEST: the harness CAN see the ceiling move.
    next.upgrades['blade'] = 1;
    mods.invalidate();
    expect(dpsMax(next, mods).toNumber()).not.toBe(before);
  });

  it('and no currency is granted by a pour', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.plant!.tiers['seating'] = 5;
    seatAll(s);
    s.shell.current = 'aleph';
    s.aleph.coreTouched = true;
    const chip = (st: GameState) => (st.currencies['dust']?.toNumber() ?? 0);
    expect(engine.dispatch({ type: 'pourWorld' }).ok).toBe(true);
    expect(chip(engine.getState() as GameState)).toBe(0);
  });
});
