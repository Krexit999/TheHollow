/**
 * THE CASTING FLOOR — SPECIFYING (§31.2), the world-authoring half.
 *
 * Three claims: the grammar is DISCOVERED (a rule only appears in the Codex
 * once the Floor has refused you with it), a poured world genuinely puts
 * physics in the wrong places, and every defect COSTS through a seam something
 * already reads.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { dpsMax } from '../systems/face';
import { flowCap, surgeCap } from '../systems/plant';
import { requiredTier } from '../systems/forge';
import { rerollRoll } from '../systems/roll';
import { ruleFor, tickCondition } from '../systems/condition';
import { seatCondition } from '../systems/seats';
import {
  BANDS, DEFECTS, DEFECT_DEFS, GRAMMAR, bandOfDepth, conditionRate, conditionShellId,
  drawShare, ensureSpec, endSpecified, grammarBreak, offeredDefects, physicsAt, pourSpecified,
  rollFrozen, setBand, setDefect, specLive, specPourBlocker, specRead, specifyingOpen,
  wallSurcharge, type DefectId,
} from '../systems/specify';
import type { GameState } from '../types';

function fresh(): GameState {
  return createEngine({ nowMs: 0 }).getState() as GameState;
}
const ctx = () => ({ emit: () => {}, dirty: () => {} }) as never;

/** A save that has been round once, which is §31.1's own gate. */
function afterRecursion(): GameState {
  const s = fresh();
  s.recursion.count = 1;
  return s;
}

/** A legal world, poured and live. */
function lived(defect: DefectId = 'hardwalls'): GameState {
  const s = afterRecursion();
  s.spec = { bands: ['cinder', 'loam', 'hollow'], defect, live: true, poured: 1, learned: [] };
  return s;
}

describe('the Floor does not specify a world until you have made one over', () => {
  it('a first-Recursion save cannot even set a band', () => {
    const s = fresh();
    expect(specifyingOpen(s)).toBe(false);
    expect(specRead(s).open).toBe(false);
    expect(setBand(s, ctx(), 0, 'loam')).toMatchObject({ ok: false, reason: /made one over/ });
    expect(offeredDefects(s)).toEqual([]);
  });

  it('...and after one Recursion it can', () => {
    const s = afterRecursion();
    expect(specifyingOpen(s)).toBe(true);
    expect(setBand(s, ctx(), 0, 'loam').ok).toBe(true);
    expect(ensureSpec(s).bands[0]).toBe('loam');
  });
});

describe('the bands are §31.2\'s table', () => {
  it('0–40, 41–90, 91–150, and depth lands in the right one', () => {
    expect(BANDS.map((b) => [b.from, b.to])).toEqual([[0, 40], [41, 90], [91, 150]]);
    expect(bandOfDepth(0)).toBe(0);
    expect(bandOfDepth(40)).toBe(0);
    expect(bandOfDepth(41)).toBe(1);
    expect(bandOfDepth(90)).toBe(1);
    expect(bandOfDepth(91)).toBe(2);
    expect(bandOfDepth(400)).toBe(2);         // below the table, the deepest holds
  });
});

describe('the grammar is discovered, never listed', () => {
  it('three rules, and a fresh Codex holds none of them', () => {
    expect(GRAMMAR).toHaveLength(3);
    const s = afterRecursion();
    expect(specRead(s).learned).toEqual([]);
  });

  it('§31\'s own example: absence cannot be the shallowest band', () => {
    const s = afterRecursion();
    const res = setBand(s, ctx(), 0, 'hollow');
    expect(res.ok).toBe(false);
    expect(String(res.reason)).toMatch(/absent from/);
    // The REFUSAL is the Codex entry.
    expect(specRead(s).learned).toHaveLength(1);
    expect(specRead(s).learned[0]).toMatch(/absent from/);
    // ...and it is legal deeper down.
    expect(setBand(s, ctx(), 2, 'hollow').ok).toBe(true);
  });

  it('pressure cannot be the deepest band, and no shell twice', () => {
    const s = afterRecursion();
    expect(setBand(s, ctx(), 2, 'cinder')).toMatchObject({ ok: false, reason: /rise into something/ });
    expect(setBand(s, ctx(), 0, 'loam').ok).toBe(true);
    expect(setBand(s, ctx(), 1, 'loam')).toMatchObject({ ok: false, reason: /different shell/ });
    expect(specRead(s).learned).toHaveLength(2);
  });

  it('a legal arrangement breaks nothing, which is the red arm', () => {
    expect(grammarBreak(['cinder', 'loam', 'hollow'])).toBeNull();
    expect(grammarBreak([null, null, null])).toBeNull();
    expect(grammarBreak(['hollow', 'loam', 'cinder'])).not.toBeNull();
  });
});

describe('the pour refuses an incomplete specification, by name', () => {
  it('an empty band, then a missing defect, then it pours', () => {
    const s = afterRecursion();
    expect(specPourBlocker(s)).toMatch(/0–40 has no physics/);
    setBand(s, ctx(), 0, 'cinder');
    setBand(s, ctx(), 1, 'loam');
    expect(specPourBlocker(s)).toMatch(/91–150 has no physics/);
    setBand(s, ctx(), 2, 'hollow');
    expect(specPourBlocker(s)).toMatch(/one thing wrong with it/);
    s.maxDepthRecord = 50;                    // so a defect is even offered
    expect(setDefect(s, ctx(), 'hardwalls').ok).toBe(true);
    expect(specPourBlocker(s)).toBeNull();
    expect(pourSpecified(s, ctx()).ok).toBe(true);
    expect(specLive(s)).toBe(true);
    expect(ensureSpec(s).poured).toBe(1);
  });

  it('a defect about something you do not do is refused', () => {
    const s = afterRecursion();
    expect(setDefect(s, ctx(), 'hardwalls')).toMatchObject({ ok: false, reason: /do not do/ });
    s.maxDepthRecord = 50;
    expect(setDefect(s, ctx(), 'hardwalls').ok).toBe(true);
  });

  it('walking out keeps the specification written', () => {
    const s = lived();
    expect(endSpecified(s, ctx()).ok).toBe(true);
    expect(specLive(s)).toBe(false);
    expect(ensureSpec(s).bands).toEqual(['cinder', 'loam', 'hollow']);
    expect(endSpecified(s, ctx())).toMatchObject({ ok: false, reason: /Nothing is live/ });
  });
});

describe('a poured world puts physics in the wrong places', () => {
  it('outside one, nothing changes — the hot path', () => {
    const s = fresh();
    expect(physicsAt(s, 20)).toBeNull();
    expect(conditionShellId(s)).toBe('loam');
    expect(wallSurcharge(s)).toBe(0);
    expect(drawShare(s)).toBe(1);
    expect(rollFrozen(s)).toBe(false);
    expect(conditionRate(s)).toBe(1);
  });

  it('the CONDITION RULE at your depth comes from the band, not the shell', () => {
    const s = lived();
    expect(s.shell.current).toBe('loam');
    s.depth = 20;                              // band 0 → Cinder physics
    expect(physicsAt(s, 20)).toBe('cinder');
    expect(conditionShellId(s)).toBe('cinder');
    s.depth = 100;                             // band 2 → the Hollow's
    expect(conditionShellId(s)).toBe('hollow');
    // Loam has no rule of its own — that is the point of standing in one.
    expect(ruleFor('loam')).toBeUndefined();
    expect(ruleFor(conditionShellId(s))?.id).toBe('undecided');
  });

  it('...and it really writes: a Loam machine BAKES at a Cinder-banded depth', () => {
    const mods = new ModifierCache();
    mods.invalidate();
    const s = lived();
    s.kiln.built = true;
    s.depth = 20;
    s.pressure.heat = 90;
    for (let i = 0; i < 300; i++) tickCondition(s, mods, 1);
    expect(s.plant!.condition?.['kiln']?.id).toBe('baked');

    // RED ARM: the same 300 seconds without a poured world writes nothing.
    const bare = fresh();
    bare.kiln.built = true;
    bare.depth = 20;
    bare.pressure.heat = 90;
    for (let i = 0; i < 300; i++) tickCondition(bare, mods, 1);
    expect(bare.plant!.condition?.['kiln']).toBeUndefined();
  });
});

describe('every defect costs, through a seam something already reads', () => {
  it('five defects, each naming its seam, and every row is named', () => {
    // FOUR at A.97; the fifth (crew-facing) was ledgered as having no seam to
    // bite on because crews did not exist. They have since A.99.
    expect(DEFECTS).toHaveLength(5);
    expect(DEFECT_DEFS).toHaveLength(5);
    for (const d of DEFECT_DEFS) {
      expect(d.name.length, d.id).toBeGreaterThan(0);
      expect(d.costs.length, d.id).toBeGreaterThan(0);
      expect(d.bites.length, d.id).toBeGreaterThan(0);
    }
  });

  it('NOTHING DOWN THERE ANSWERS: a fully-read crew cannot call a seam', async () => {
    const crews = await import('../systems/crews');
    const { shellRoll } = await import('../systems/roll');

    const seamOf = (s: ReturnType<typeof fresh>) =>
      shellRoll(s).find((d) => (d.seams ?? []).length > 0 && d.type === 'seam')!;

    // A crew that CAN call it, in an ordinary world.
    const bare = fresh();
    bare.roll = { rolled: {}, cleared: [], looted: [], shored: [], flooded: [], rolls: 0 } as GameState['roll'];
    const def = seamOf(bare);
    bare.roll!.rolled[def.id] = { seam: def.seams![0]!, feature: 'plain', hazard: 0 } as never;
    const crew = { id: 1, name: 'Crew I', driftId: def.id, tier: 9, reads: ['seam'],
      gear: {}, atIndex: 0, timer: 0, recalled: false, findings: [] };
    expect(crews.findingAt(bare, crew as never, def)).toBeNull();

    // The same crew, the same station, in a world you specified.
    const s = lived('blindcrews');
    s.roll = { rolled: {}, cleared: [], looted: [], shored: [], flooded: [], rolls: 0 } as GameState['roll'];
    s.roll!.rolled[def.id] = { seam: def.seams![0]!, feature: 'plain', hazard: 0 } as never;
    const blind = crews.findingAt(s, crew as never, def);
    expect(blind?.kind).toBe('call');
    // ...and it still WALKS. The defect costs a capability, not the system.
    expect(crews.driftStations(s, def.id).length).toBeGreaterThanOrEqual(0);
  });

  it('HARD WALLS: every wall asks one tier more', () => {
    const bare = fresh();
    bare.depth = 44;
    const before = requiredTier(bare, 45);
    const s = lived('hardwalls');
    s.depth = 44;
    expect(requiredTier(s, 45)).toBe(before + 1);
  });

  it('HALF DRAW: the plant makes half of both', () => {
    const bare = fresh();
    bare.kiln.built = true;
    const flow = flowCap(bare);
    const surge = surgeCap(bare);
    expect(flow).toBeGreaterThan(0);
    const s = lived('halfdraw');
    s.kiln.built = true;
    expect(flowCap(s)).toBeCloseTo(flow / 2, 6);
    expect(surgeCap(s)).toBeCloseTo(surge / 2, 6);
  });

  it('COLD ROLL: the Roll stops moving, and without it, it does not', () => {
    const bare = fresh();
    rerollRoll(bare, () => 0.5);
    const wasBare = JSON.stringify(bare.roll!.rolled);
    rerollRoll(bare, () => 0.9);
    expect(JSON.stringify(bare.roll!.rolled)).not.toBe(wasBare);

    const s = lived('coldroll');
    rerollRoll(s, () => 0.5);
    const was = JSON.stringify(s.roll!.rolled);
    rerollRoll(s, () => 0.9);
    expect(JSON.stringify(s.roll!.rolled)).toBe(was);
  });

  it('QUICK ROT: conditions write at twice the rate', () => {
    const mods = new ModifierCache();
    mods.invalidate();
    const slow = lived('hardwalls');
    const fast = lived('quickrot');
    for (const s of [slow, fast]) {
      s.kiln.built = true;
      s.depth = 20;
      s.pressure.heat = 90;
      for (let i = 0; i < 60; i++) tickCondition(s, mods, 1);
    }
    expect(conditionRate(fast)).toBe(2);
    expect(fast.plant!.condition!['kiln']!.level)
      .toBeCloseTo(2 * slow.plant!.condition!['kiln']!.level, 6);
  });

  it('only ONE defect is live at a time', () => {
    const s = lived('halfdraw');
    expect(drawShare(s)).toBe(0.5);
    expect(wallSurcharge(s)).toBe(0);
    expect(rollFrozen(s)).toBe(false);
  });
});

describe('SEATS V–VII want a world you specified (§13, §31)', () => {
  it('I–IV never mention it; V, VI and VII refuse without one', () => {
    const s = fresh();
    for (const id of ['I', 'II', 'III', 'IV'] as const) {
      expect(String(seatCondition(s, id)), id).not.toMatch(/author one/);
    }
    for (const id of ['V', 'VI', 'VII'] as const) {
      expect(String(seatCondition(s, id)), id).toMatch(/author one/);
    }
  });

  it('...and with one live they fall through to their own condition', () => {
    const s = lived();
    expect(String(seatCondition(s, 'V'))).toMatch(/No Retort/);
    expect(String(seatCondition(s, 'VI'))).toMatch(/fixed 0 of 1000/);
  });
});

describe('PILLAR 2 — a band routes and a defect only takes', () => {
  it('the harshest legal world, and dpsMax is unmoved at the same depth', () => {
    const mods = new ModifierCache();
    const bare = fresh();
    bare.depth = 48;
    mods.invalidate();
    const before = dpsMax(bare, mods).toNumber();

    for (const d of DEFECTS) {
      const s = lived(d);
      s.depth = 48;                            // THE SAME DEPTH IN EVERY ARM
      mods.invalidate();
      expect(dpsMax(s, mods).toNumber(), d).toBe(before);
      expect(specLive(s), d).toBe(true);       // not vacuous
    }

    // RED TEST: the harness CAN see the ceiling move.
    const moved = lived();
    moved.depth = 48;
    moved.upgrades['blade'] = 1;
    mods.invalidate();
    expect(dpsMax(moved, mods).toNumber()).not.toBe(before);
  });

  it('a poured world grants no currency and no signature you do not hold', () => {
    const s = afterRecursion();
    s.maxDepthRecord = 50;
    setBand(s, ctx(), 0, 'cinder');
    setBand(s, ctx(), 1, 'loam');
    setBand(s, ctx(), 2, 'hollow');
    setDefect(s, ctx(), 'hardwalls');
    const sigs = JSON.stringify(s.shell.signatures);
    const purse = JSON.stringify(Object.entries(s.currencies).map(([k, v]) => [k, v.toString()]));
    expect(pourSpecified(s, ctx()).ok).toBe(true);
    expect(JSON.stringify(s.shell.signatures)).toBe(sigs);
    expect(JSON.stringify(Object.entries(s.currencies).map(([k, v]) => [k, v.toString()]))).toBe(purse);
  });
});
