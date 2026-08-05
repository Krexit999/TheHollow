/**
 * THE SEVEN SEATS (§4) — the terminal craft's frame.
 *
 * The three things worth asserting: the frame maps onto the parts the Forge
 * already casts, an outline stays an outline until you have stood on the floor
 * that names it, and a seat pays REACH and never rate.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { PART_TYPES } from '../content/forgeParts';
import { allShells, shellDefOrNull } from '../shells';
import { materialDef } from '../materials';
import { dpsMax } from '../systems/face';
import { ModifierCache } from '../modifiers';
import {
  SEATS, SEAT_BAND, RECORD_MARKS, candidates, ensureSeats, frameOpen, keptSignatures,
  makeRecord, recordReady, seatBlocker, seatCondition, seatKnown, seatPart, seatsRead,
  seatedCount, type SeatId,
} from '../systems/seats';
import type { GameState } from '../types';

function fresh(): GameState {
  return createEngine({ nowMs: 0 }).getState() as GameState;
}

const ctx = () => ({ emit: () => {}, dirty: () => {} }) as never;

/** Stand a player on every shell's floor, so every outline resolves. */
function standEverywhere(s: GameState): void {
  for (const sh of allShells()) s.depthRecords[sh.id] = sh.floorDepth;
}

/** A part the seat would accept, put straight on the rack. */
function rackPart(s: GameState, seat: SeatId): void {
  const def = SEATS.find((d) => d.id === seat)!;
  (s.casting.rack as unknown[]).push({
    id: s.casting.nextId++, type: def.part, materialId: def.materialId, purity: 105,
  });
}

describe('the frame is the seven parts the Forge already casts', () => {
  it('one seat per part type, no duplicates, and every part type covered', () => {
    expect(SEATS).toHaveLength(7);
    expect(new Set(SEATS.map((d) => d.part)).size).toBe(7);
    for (const t of PART_TYPES) {
      expect(SEATS.some((d) => d.part === t)).toBe(true);
    }
  });

  it('one seat per shell, and every named material is in the registry', () => {
    fresh();                                   // content registers at engine build
    expect(new Set(SEATS.map((d) => d.shellId)).size).toBe(7);
    for (const d of SEATS) {
      expect(shellDefOrNull(d.shellId), d.shellId).not.toBeNull();
      // Throws for an unknown id — which is the assertion.
      expect(materialDef(d.materialId).id).toBe(d.materialId);
    }
  });

  it('every seat wants the top purity band, not a rarity', () => {
    expect(SEAT_BAND).toBe('pristine');
  });
});

describe('seven outlines, zero recipes', () => {
  it('the frame does not exist before the first Breach', () => {
    const s = fresh();
    expect(frameOpen(s)).toBe(false);
    expect(seatsRead(s).open).toBe(false);
    expect(seatBlocker(s, 'I')).toMatch(/first Breach/);
  });

  it('a row is a numeral and a dash until you have stood on that floor', () => {
    const s = fresh();
    s.shell.breachCount = 1;
    const r = seatsRead(s);
    const iv = r.rows.find((x) => x.id === 'IV')!;
    expect(iv.known).toBe(false);
    expect(iv.name).toBe('IV · —');
    expect(iv.material).toBe('');
    // ...and the material it wants is nowhere in what the panel would draw.
    expect(JSON.stringify(iv)).not.toContain('Truelight');
  });

  it('standing on the floor — and only that — resolves the outline', () => {
    const s = fresh();
    s.shell.breachCount = 1;
    const glass = shellDefOrNull('glassmere')!;
    s.depthRecords['glassmere'] = glass.floorDepth - 1;
    expect(seatKnown(s, 'IV')).toBe(false);
    s.depthRecords['glassmere'] = glass.floorDepth;
    expect(seatKnown(s, 'IV')).toBe(true);
    expect(seatsRead(s).rows.find((x) => x.id === 'IV')!.material).toBe('Truelight');
  });

  it('a resolved outline is remembered even if the record is later read differently', () => {
    const s = fresh();
    s.shell.breachCount = 1;
    standEverywhere(s);
    seatsRead(s);
    expect(ensureSeats(s).known).toHaveLength(7);
  });
});

describe('a seat wants its condition AND its part', () => {
  it('the condition refuses before the part is even looked for', () => {
    const s = fresh();
    s.shell.breachCount = 1;
    standEverywhere(s);
    rackPart(s, 'I');
    expect(candidates(s, 'I')).toHaveLength(1);
    // Loam: compaction 26 and a Refinery at its last tier. Neither is true.
    expect(seatBlocker(s, 'I')).toMatch(/compaction/);
  });

  it('...and with the condition met, the part is what is missing', () => {
    const s = fresh();
    s.shell.breachCount = 1;
    standEverywhere(s);
    s.face.compaction = new Array(s.face.cells.length).fill(26);
    (s.plant ??= { tiers: {}, builtOf: {} } as never);
    s.plant!.tiers['refinery'] = 5;
    expect(seatCondition(s, 'I')).toBeNull();
    expect(seatBlocker(s, 'I')).toMatch(/Deepgrave/);
    rackPart(s, 'I');
    expect(seatBlocker(s, 'I')).toBeNull();
  });

  it('a part of the wrong band is not a candidate', () => {
    const s = fresh();
    s.shell.breachCount = 1;
    standEverywhere(s);
    (s.casting.rack as unknown[]).push({
      id: s.casting.nextId++, type: 'core', materialId: 'deepgrave', purity: 94,
    });
    expect(candidates(s, 'I')).toHaveLength(0);
  });

  it('seating spends the part and is permanent', () => {
    const s = fresh();
    s.shell.breachCount = 1;
    standEverywhere(s);
    s.face.compaction = new Array(s.face.cells.length).fill(26);
    (s.plant ??= { tiers: {}, builtOf: {} } as never);
    s.plant!.tiers['refinery'] = 5;
    rackPart(s, 'I');
    expect(seatPart(s, ctx(), 'I').ok).toBe(true);
    expect(s.casting.rack).toHaveLength(0);
    expect(seatedCount(s)).toBe(1);
    // There is no unseat verb, and seating again is refused by name.
    rackPart(s, 'I');
    expect(seatPart(s, ctx(), 'I')).toMatchObject({ ok: false, reason: /stays seated/ });
  });
});

describe('the RECORD is made out of a life, not a rock', () => {
  it('it is in no seam in any Roll — there is genuinely no other route', async () => {
    const { allAuthoredStations } = await import('../content/rolls');
    for (const st of allAuthoredStations()) {
      expect(st.def.seams ?? []).not.toContain('record');
    }
  });

  it('every mark is a counter the engine already keeps, and a fresh save has none', () => {
    const s = fresh();
    expect(RECORD_MARKS.length).toBeGreaterThanOrEqual(5);
    for (const m of RECORD_MARKS) expect(typeof m.read(s)).toBe('number');
    expect(recordReady(s)).toBe(false);
    expect(makeRecord(s, ctx()).ok).toBe(false);
  });

  it('a life that has done all six writes it, and Seat VII takes no part', () => {
    const s = fresh();
    s.shell.breachCount = 6;
    standEverywhere(s);
    s.recursion.count = 1;
    s.reading!.proven = ['a', 'b', 'c', 'd'];
    s.delver.level = 60;
    // Seats V-VII want a world you authored (§31). Live one, so VII is reachable.
    s.spec = { bands: ['loam', 'ferrite', 'hollow'], defect: 'hardwalls', live: true, poured: 1, learned: [] };
    const seats = ensureSeats(s);
    for (const d of SEATS.filter((x) => x.id !== 'VII')) {
      seats.seated[d.id] = { seat: d.id, materialId: d.materialId, purity: 105, atRecursion: 0 };
    }
    expect(recordReady(s)).toBe(true);
    expect(makeRecord(s, ctx()).ok).toBe(true);
    expect(candidates(s, 'VII')).toHaveLength(0);   // nothing on a rack
    expect(seatBlocker(s, 'VII')).toBeNull();
    expect(seatPart(s, ctx(), 'VII').ok).toBe(true);
    expect(seatedCount(s)).toBe(7);
  });
});

describe('what a seat pays is reach, and reach only', () => {
  it('a seated Seat carries its shell signature; Aleph keeps none', () => {
    const s = fresh();
    const seats = ensureSeats(s);
    expect(keptSignatures(s)).toEqual([]);
    seats.seated['III'] = { seat: 'III', materialId: 'heartwood', purity: 105, atRecursion: 0 };
    expect(keptSignatures(s)).toEqual(['growth']);
    seats.seated['VII'] = { seat: 'VII', materialId: 'record', purity: 105, atRecursion: 0 };
    expect(keptSignatures(s)).toEqual(['growth']);   // the Grip grants nothing
  });

  it('the signature ids come off the shell registry, never a second list', () => {
    const s = fresh();
    const seats = ensureSeats(s);
    for (const d of SEATS) {
      seats.seated[d.id] = { seat: d.id, materialId: d.materialId, purity: 105, atRecursion: 0 };
    }
    for (const sig of keptSignatures(s)) {
      expect(allShells().some((sh) => sh.signatureId === sig)).toBe(true);
    }
  });

  it('PILLAR 2 — all seven seated, and the ceiling has not moved', () => {
    const mods = new ModifierCache();
    const bare = fresh();
    mods.invalidate();
    const before = dpsMax(bare, mods).toNumber();

    const s = fresh();
    s.shell.breachCount = 6;
    standEverywhere(s);
    const seats = ensureSeats(s);
    for (const d of SEATS) {
      seats.seated[d.id] = { seat: d.id, materialId: d.materialId, purity: 105, atRecursion: 0 };
    }
    seats.record = true;
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).toBe(before);

    // ...and red-tested: the harness CAN see a ceiling move.
    s.upgrades['blade'] = 1;
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).not.toBe(before);
  });

  it('and no currency is granted by seating anything', () => {
    const s = fresh();
    s.shell.breachCount = 1;
    standEverywhere(s);
    s.face.compaction = new Array(s.face.cells.length).fill(26);
    (s.plant ??= { tiers: {}, builtOf: {} } as never);
    s.plant!.tiers['refinery'] = 5;
    rackPart(s, 'I');
    const before = JSON.stringify(Object.entries(s.currencies).map(([k, v]) => [k, v.toString()]));
    seatPart(s, ctx(), 'I');
    expect(JSON.stringify(Object.entries(s.currencies).map(([k, v]) => [k, v.toString()]))).toBe(before);
  });
});

describe('the Recursion is the reset a Seat survives', () => {
  it('the frame rides, and it hands its signatures to the new world', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.shell.current = 'aleph';
    s.aleph.coreTouched = true;
    const seats = ensureSeats(s);
    seats.seated['III'] = { seat: 'III', materialId: 'heartwood', purity: 105, atRecursion: 0 };
    seats.seated['V'] = { seat: 'V', materialId: 'slagglass', purity: 105, atRecursion: 0 };
    expect(engine.dispatch({ type: 'recurse' }).ok).toBe(true);

    const next = engine.getState() as GameState;
    expect(next.shell.current).toBe('loam');
    expect(seatedCount(next)).toBe(2);
    expect(next.shell.signatures).toContain('growth');
    expect(next.shell.signatures).toContain('pressure');
  });

  it('...and a Recursion with no seats grants no signatures, which is the red test', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.shell.current = 'aleph';
    s.aleph.coreTouched = true;
    expect(engine.dispatch({ type: 'recurse' }).ok).toBe(true);
    expect((engine.getState() as GameState).shell.signatures).toEqual([]);
  });
});

describe('the two counters §4 needed and nothing was keeping', () => {
  it('a Witness counts the units it has fixed, not the kinds', async () => {
    const { ensureWitness, unitsFixed } = await import('../systems/witness');
    const s = fresh();
    expect(unitsFixed(s)).toBe(0);
    const w = ensureWitness(s);
    w.fixed = 3;
    expect(unitsFixed(s)).toBe(3);
  });

  it('a bed carries its strain through a Collapse, and re-seeding restarts it', async () => {
    const { carriedStrain, noteCollapse, ensureCultivar } = await import('../systems/cultivar');
    const s = fresh();
    const c = ensureCultivar(s);
    c.beds['nw'] = 'someStrain';
    noteCollapse(s);
    noteCollapse(s);
    expect(carriedStrain(s)).toBe(2);
    // A DIFFERENT strain into the same bed is a re-plant.
    c.through!['nw'] = 0;
    expect(carriedStrain(s)).toBe(0);
  });

  it('an empty bed carries nothing through a fall', async () => {
    const { carriedStrain, noteCollapse } = await import('../systems/cultivar');
    const s = fresh();
    noteCollapse(s);
    noteCollapse(s);
    expect(carriedStrain(s)).toBe(0);
  });
});
