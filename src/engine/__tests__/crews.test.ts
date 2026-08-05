/**
 * CREWS (§25.4) — findings, not logs, and not a throughput multiplier.
 *
 * The brief's item 11 is the assertion that matters: "a crew must be a
 * delegation of a decision the player has made. If it's a throughput
 * multiplier, say so and cut it." §25.4 already answered it — "automation is a
 * WORK-GENERATOR, not a work-eliminator" — so the test that carries the design
 * is the one that drives a whole descent and reads every purse unchanged.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { dpsMax } from '../systems/face';
import { markReached, shellRoll } from '../systems/roll';
import {
  FINDING_CAP, MAX_CREWS, STATION_SEC, crewBlocker, crewsRead, dispatchCrew, dismissCrew,
  driftStations, ensureCrews, findingAt, recallCrew, resolveFindings, tickCrews,
  BOOT_PACE, crewPace,
} from '../systems/crews';
import type { GameState } from '../types';

const ctx = () => ({ emit: () => {}, dirty: () => {} }) as never;

/** A Loam player with a band timbered — shoring is the gate on crews. */
function withDrift(): { s: GameState; driftId: string } {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  s.roll = { rolled: {}, cleared: [], looted: [], shored: [], flooded: [], rolls: 0 } as GameState['roll'];
  const stops = [...shellRoll(s)].sort((a, b) => a.depth - b.depth);
  const driftId = stops[3]!.id;
  s.roll!.shored!.push(driftId);
  return { s, driftId };
}

/** Walk a crew far enough to cover its whole drift. */
function walk(s: GameState, seconds: number): void {
  for (let i = 0; i < seconds; i++) tickCrews(s, ctx(), 1);
}

describe('a crew walks a drift you timbered, and nothing else', () => {
  it('shoring is the gate, and the refusal says which', () => {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    s.roll = { rolled: {}, cleared: [], looted: [], shored: [], flooded: [], rolls: 0 } as never;
    const someId = shellRoll(s)[2]!.id;
    expect(crewBlocker(s, someId)).toMatch(/have not timbered/);
    expect(dispatchCrew(s, ctx(), someId).ok).toBe(false);
  });

  it('with a drift, one goes down — and only one per drift', () => {
    const { s, driftId } = withDrift();
    expect(dispatchCrew(s, ctx(), driftId).ok).toBe(true);
    expect(ensureCrews(s).crews).toHaveLength(1);
    expect(crewBlocker(s, driftId)).toMatch(/already down there/);
  });

  it('three is the cap, and it says so rather than failing quietly', () => {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    s.roll = { rolled: {}, cleared: [], looted: [], shored: [], flooded: [], rolls: 0 } as GameState['roll'];
    const stops = [...shellRoll(s)].sort((a, b) => a.depth - b.depth).slice(1, 6);
    for (const d of stops) s.roll!.shored!.push(d.id);
    let sent = 0;
    for (const d of stops) if (dispatchCrew(s, ctx(), d.id).ok) sent += 1;
    expect(sent).toBe(MAX_CREWS);
    expect(crewBlocker(s, stops[4]!.id)).toMatch(/keep track of/);
  });
});

describe('a crew is a delegation of a decision you already made', () => {
  it('THE TOOL: it carries the tier you had, and a taller wall is a finding', () => {
    const { s, driftId } = withDrift();
    dispatchCrew(s, ctx(), driftId);
    const crew = ensureCrews(s).crews[0]!;
    const wall = shellRoll(s).find((d) => d.type === 'wall' && (d.hardness ?? 1) > 1);
    expect(wall, 'Loam authors a hardness wall — the fixture depends on it').toBeDefined();
    crew.tier = (wall!.hardness ?? 1) - 1;
    const f = findingAt(s, crew, wall!);
    expect(f?.kind).toBe('wall');
    expect(f?.wants).toMatch(/better tool/);
    // ...and with a taller tool it is not a finding at all.
    crew.tier = (wall!.hardness ?? 1) + 1;
    expect(findingAt(s, crew, wall!)).toBeNull();
  });

  it('THE CIRCUIT: without the seam read it cannot make the call — item 9', () => {
    const { s, driftId } = withDrift();
    dispatchCrew(s, ctx(), driftId);
    const crew = ensureCrews(s).crews[0]!;
    const seamed = shellRoll(s).find((d) => (d.seams ?? []).length > 0 && d.type === 'seam');
    expect(seamed).toBeDefined();
    s.roll!.rolled[seamed!.id] = { seam: seamed!.seams![0]!, feature: 'plain', hazard: 0 } as never;

    crew.reads = [];                                        // a crew with no circuit
    const blind = findingAt(s, crew, seamed!);
    expect(blind?.kind).toBe('call');
    // IT DID NOT READ IT, so it cannot name it — which is the whole point.
    expect(blind?.line).not.toContain(seamed!.seams![0]!);

    crew.reads = ['seam'];                                  // ...and one with the read
    expect(findingAt(s, crew, seamed!)).toBeNull();
  });

  it('TWO CREWS DISAGREE, which is §25.4 and the reason to go and look', () => {
    const { s, driftId } = withDrift();
    const stops = [...shellRoll(s)].sort((a, b) => a.depth - b.depth);
    s.roll!.shored!.push(stops[5]!.id);
    dispatchCrew(s, ctx(), driftId);
    dispatchCrew(s, ctx(), stops[5]!.id);
    const [a, b] = ensureCrews(s).crews;
    a!.reads = [];
    b!.reads = ['seam'];
    const seamed = shellRoll(s).find((d) => (d.seams ?? []).length > 0 && d.type === 'seam')!;
    s.roll!.rolled[seamed.id] = { seam: seamed.seams![0]!, feature: 'plain', hazard: 0 } as never;
    expect(findingAt(s, a!, seamed)).not.toBeNull();
    expect(findingAt(s, b!, seamed)).toBeNull();
  });
});

describe('a finding is resolved by being stood in', () => {
  it('walking into the station clears it, and time does not', () => {
    const { s, driftId } = withDrift();
    dispatchCrew(s, ctx(), driftId);
    const crew = ensureCrews(s).crews[0]!;
    const wreck = shellRoll(s).find((d) => d.type === 'wreck')!;
    crew.findings.push({ kind: 'sign', stationId: wreck.id, line: 'x', wants: 'you, in person' });
    const mine = (): boolean =>
      ensureCrews(s).crews[0]!.findings.some((f) => f.stationId === wreck.id && f.kind === 'sign');

    // TIME DOES NOT CLEAR IT. (The crew may well add findings of its own while
    // it walks — this asks about the one under test, not the length.)
    walk(s, STATION_SEC * 10);
    expect(mine()).toBe(true);

    // STANDING THERE DOES.
    markReached(s, wreck.depth, 15);
    expect(mine()).toBe(false);
    expect(ensureCrews(s).resolved).toBeGreaterThan(0);
  });

  it('a crew stops once its hands are full, so the queue cannot run away', () => {
    const { s, driftId } = withDrift();
    dispatchCrew(s, ctx(), driftId);
    const crew = ensureCrews(s).crews[0]!;
    for (let i = 0; i < FINDING_CAP; i++) {
      crew.findings.push({ kind: 'sign', stationId: `x${i}`, line: 'x', wants: 'you' });
    }
    const at = crew.atIndex;
    walk(s, STATION_SEC * 5);
    expect(ensureCrews(s).crews[0]!.atIndex).toBe(at);
    expect(crewsRead(s).rows[0]!.walking).toBe(false);
  });
});

describe('the recall, and the law that overrides it', () => {
  it('a recalled crew stops', () => {
    const { s, driftId } = withDrift();
    dispatchCrew(s, ctx(), driftId);
    recallCrew(s, ctx(), ensureCrews(s).crews[0]!.id);
    const at = ensureCrews(s).crews[0]!.atIndex;
    walk(s, STATION_SEC * 4);
    expect(ensureCrews(s).crews[0]!.atIndex).toBe(at);
  });

  it('THE STANDING ORDER: with the law written, it keeps working from the stair', () => {
    const { s, driftId } = withDrift();
    expect(driftStations(s, driftId).length).toBeGreaterThan(0);
    dispatchCrew(s, ctx(), driftId);
    recallCrew(s, ctx(), ensureCrews(s).crews[0]!.id);
    s.recursion.axioms = ['standingorder'];
    const at = ensureCrews(s).crews[0]!.atIndex;
    walk(s, STATION_SEC * 4);
    expect(ensureCrews(s).crews[0]!.atIndex).toBeGreaterThan(at);
  });

  it('standing one down takes it off the board', () => {
    const { s, driftId } = withDrift();
    dispatchCrew(s, ctx(), driftId);
    expect(dismissCrew(s, ctx(), ensureCrews(s).crews[0]!.id).ok).toBe(true);
    expect(ensureCrews(s).crews).toHaveLength(0);
  });
});

describe('ITEM 11 — a crew produces NOTHING, which is the whole design', () => {
  it('a full descent moves no purse and no stack', () => {
    const { s, driftId } = withDrift();
    dispatchCrew(s, ctx(), driftId);
    const purse = () => JSON.stringify(
      Object.entries(s.currencies).map(([k, v]) => [k, v.toString()]).sort());
    const stacks = () => JSON.stringify(s.materials.stacks);
    const before = purse();
    const beforeStacks = stacks();
    const beforeDrops = s.materials.totalDrops;

    walk(s, STATION_SEC * 40);
    // ...and it really walked, or the arm is vacuous.
    expect(ensureCrews(s).crews[0]!.atIndex).toBeGreaterThan(0);

    expect(purse()).toBe(before);
    expect(stacks()).toBe(beforeStacks);
    expect(s.materials.totalDrops).toBe(beforeDrops);
  });

  it('PILLAR 2: crews assigned and walked, ceiling unmoved at the SAME depth', () => {
    const mods = new ModifierCache();
    const bare = createEngine({ nowMs: 0 }).getState() as GameState;
    bare.depth = 30;
    mods.invalidate();
    const before = dpsMax(bare, mods).toNumber();

    const { s, driftId } = withDrift();
    s.depth = 400;
    dispatchCrew(s, ctx(), driftId);
    walk(s, STATION_SEC * 40);
    s.depth = 30;                                 // THE SAME DEPTH BOTH ARMS
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).toBe(before);

    // RED ARM: the instrument can see a ceiling move.
    s.upgrades['blade'] = 1;
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).not.toBe(before);
  });

  it('the module contains no route to a currency, a stack or the face', () => {
    const src = readFileSync('src/engine/systems/crews.ts', 'utf8');
    // CALL SITES, not words. The first version of this grepped for the bare
    // names and caught the module's own comment saying it does not call them.
    for (const forbidden of ['addCurrency(', 'addMaterial(', 'spendCurrency(', 'state.face']) {
      expect(src.includes(forbidden), `crews.ts must not reach ${forbidden}`).toBe(false);
    }
  });

  it('...and a save with no crews is free and safe on both hot paths', () => {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    expect(resolveFindings(s)).toEqual([]);
    expect(() => tickCrews(s, ctx(), 10)).not.toThrow();
  });
});

/**
 * THE GEAR LOADOUT (§25.4, A.100) — the third of the three things a crew is.
 *
 * The assertion that carries item 6 is the LAST one: there is no verb that sets
 * a crew's gear, so a crew's loadout cannot become a way around the REST rule.
 * It is not guarded, it is impossible.
 */
describe('a crew carries the kit you were wearing', () => {
  it('the loadout is a snapshot taken at dispatch', async () => {
    const { equipGear } = await import('../systems/gear');
    const { s, driftId } = withDrift();
    s.gear = { worn: {}, owned: ['ashlamp', 'marchboots'] };
    // Stand at a REST and put the kit on — the only way it ever goes on.
    const rest = shellRoll(s).find((d) => d.type === 'rest')!;
    s.depth = rest.depth;
    expect(equipGear(s, 'ashlamp', 'lamp').ok).toBe(true);

    dispatchCrew(s, ctx(), driftId);
    expect(ensureCrews(s).crews[0]!.gear.lamp).toBe('ashlamp');

    // Change your own kit afterwards; the crew keeps what it left with.
    expect(equipGear(s, null, 'lamp').ok).toBe(true);
    expect(ensureCrews(s).crews[0]!.gear.lamp).toBe('ashlamp');
    expect(s.gear.worn.lamp).toBeUndefined();
  });

  it('a bare crew carries nothing, and says so rather than inventing kit', () => {
    const { s, driftId } = withDrift();
    s.gear = { worn: {}, owned: [] };
    dispatchCrew(s, ctx(), driftId);
    expect(ensureCrews(s).crews[0]!.gear).toEqual({});
    expect(crewsRead(s).rows[0]!.gear).toEqual([]);
  });

  it('THE LAMP: a lit crew names what it withdrew from; an unlit one cannot', async () => {
    const { s, driftId } = withDrift();
    const hazard = shellRoll(s).find((d) => d.type === 'hazard');
    if (!hazard) return;                      // not every shell authors one
    dispatchCrew(s, ctx(), driftId);
    const crew = ensureCrews(s).crews[0]!;

    crew.gear = {};
    const dark = findingAt(s, crew, hazard)!;
    expect(dark.kind).toBe('hazard');
    expect(dark.line).not.toContain(hazard.name);
    expect(dark.wants).toMatch(/lamp/);

    crew.gear = { lamp: 'ashlamp' };
    const lit = findingAt(s, crew, hazard)!;
    expect(lit.line).toContain(hazard.name);
    expect(lit.wants).not.toMatch(/lamp/);
  });

  it('THE BOOTS: a shod crew covers the drift quicker, and that is all', () => {
    const { s, driftId } = withDrift();
    dispatchCrew(s, ctx(), driftId);
    const crew = ensureCrews(s).crews[0]!;
    expect(crewPace(crew)).toBe(STATION_SEC);
    crew.gear = { boots: 'marchboots' };
    expect(crewPace(crew)).toBe(STATION_SEC * BOOT_PACE);
    expect(BOOT_PACE).toBeLessThan(1);
  });

  it('...and a shod crew reaches further in the same time', () => {
    const bare = withDrift();
    dispatchCrew(bare.s, ctx(), bare.driftId);
    walk(bare.s, STATION_SEC * 2);
    const shod = withDrift();
    dispatchCrew(shod.s, ctx(), shod.driftId);
    ensureCrews(shod.s).crews[0]!.gear = { boots: 'marchboots' };
    walk(shod.s, STATION_SEC * 2);
    expect(ensureCrews(shod.s).crews[0]!.atIndex)
      .toBeGreaterThanOrEqual(ensureCrews(bare.s).crews[0]!.atIndex);
  });

  it('GLOVES DO NOTHING, and that is stated rather than faked', () => {
    const { s, driftId } = withDrift();
    dispatchCrew(s, ctx(), driftId);
    const crew = ensureCrews(s).crews[0]!;
    const before = crewPace(crew);
    crew.gear = { gloves: 'gravegloves' };
    expect(crewPace(crew)).toBe(before);
    const wreck = shellRoll(s).find((d) => d.type === 'wreck')!;
    const withGloves = findingAt(s, crew, wreck);
    crew.gear = {};
    expect(JSON.stringify(findingAt(s, crew, wreck))).toBe(JSON.stringify(withGloves));
  });
});

describe('ITEM 6 — a loadout is not a way around the REST rule', () => {
  it('there is NO action that sets a crew loadout — it cannot be got at', () => {
    const types = readFileSync('src/engine/types.ts', 'utf8');
    const actions = readFileSync('src/engine/actions.ts', 'utf8');
    for (const src of [types, actions]) {
      expect(/crewGear|setCrewGear|equipCrew|loadoutCrew/i.test(src)).toBe(false);
    }
  });

  it('gear still only swaps at a REST, with a crew out or not', async () => {
    const { equipGear } = await import('../systems/gear');
    const { s, driftId } = withDrift();
    s.gear = { worn: {}, owned: ['ashlamp'] };
    // Away from a REST: refused, and it names where to go.
    s.depth = 999;
    const away = equipGear(s, 'ashlamp', 'lamp');
    expect(away.ok).toBe(false);
    expect(String(away.reason)).toMatch(/rest/i);

    dispatchCrew(s, ctx(), driftId);
    // Still refused with a crew in the field — a crew changes nothing about it.
    expect(equipGear(s, 'ashlamp', 'lamp').ok).toBe(false);
  });

  it('standing a crew down returns nothing to your hands — it carried a copy', () => {
    const { s, driftId } = withDrift();
    s.gear = { worn: {}, owned: ['ashlamp'] };
    dispatchCrew(s, ctx(), driftId);
    const before = JSON.stringify(s.gear);
    dismissCrew(s, ctx(), ensureCrews(s).crews[0]!.id);
    expect(JSON.stringify(s.gear)).toBe(before);
  });
});
