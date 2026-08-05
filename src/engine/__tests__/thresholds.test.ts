/**
 * §53 — WORLD-CHANGE THRESHOLDS. The shell remembers what you took.
 *
 * Three things this file has to prove, and they are the three items:
 *
 *   8. Per-shell-PER-WORLD. Survives Collapse and Breach, gone on Recursion.
 *   9. Per-SHELL. A Loam counter does not move while you are in Verdance.
 *  10. It changes what the world DOES, never what it pays.
 *
 * The registry is PROBED rather than transcribed: the pillar-2 sweep crosses
 * every threshold `THRESHOLDS` contains, so a seventh added later is covered
 * the day it is authored and cannot be forgotten here.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import type { EngineCtx, GameState } from '../types';
import { THRESHOLDS, thresholdFor } from '../content/thresholds';
import {
  BANDS_BENT, BURN_FLOOR, DEEPENING_SILENCE, FERAL_SPREAD, bandCount, bankChain, burnFloor,
  crossed, crossedIn, deepening, ensureThresholds, feralSpread, flipped, markedStations,
  takenIn, tickThresholds,
} from '../systems/thresholds';
import { crackedHere, ensureRoll, isCleared, isGone, markReached, shellRoll, stationGaveWay, unstableHere } from '../systems/roll';
import { dpsMax } from '../systems/face';
import { doCollapse } from '../systems/collapseSys';
import { doRecursion } from '../systems/recursionSys';

function fresh(): GameState {
  return createEngine({ nowMs: 0 }).getState() as GameState;
}

const noop: EngineCtx = { emit: () => {}, dirty: () => {} };

/** Cross a threshold the way the world does: by taking that much out of it. */
function take(s: GameState, shellId: string, amount: number): void {
  s.shell.current = shellId;
  ensureThresholds(s).taken[shellId] = amount;
  tickThresholds(s, 1);
}

/** ...and cross ALL of them, whatever the registry currently holds. */
function crossEverything(s: GameState): void {
  const was = s.shell.current;
  for (const def of THRESHOLDS) take(s, def.shellId, def.at + 1);
  s.shell.current = was;
}

describe('§1 the counting is per-shell (item 9)', () => {
  it('a Loam counter does not move while you are standing in Verdance', () => {
    const s = fresh();
    s.shell.current = 'loam';
    s.materials.totalDrops = 100;
    tickThresholds(s, 1);              // seeds `seen` at 100
    s.materials.totalDrops = 400;
    tickThresholds(s, 1);
    const loam = takenIn(s, 'loam');
    expect(loam, 'standing in Loam took nothing').toBeGreaterThan(0);

    // The SAME cross-shell global keeps moving, in a different shell.
    s.shell.current = 'verdance';
    s.materials.totalDrops = 9000;
    tickThresholds(s, 1);
    expect(takenIn(s, 'loam'), 'Verdance mined into Loam\'s counter').toBe(loam);
  });

  it('...and a conversion does not un-take what the shaft gave', () => {
    const s = fresh();
    s.shell.current = 'loam';
    s.materials.totalDrops = 500;
    tickThresholds(s, 1);
    s.materials.totalDrops = 900;
    tickThresholds(s, 1);
    const after = takenIn(s, 'loam');
    // The Refinery eats 800 of them. `totalDrops` is DECREMENTED by conversions.
    s.materials.totalDrops = 100;
    tickThresholds(s, 1);
    expect(takenIn(s, 'loam'), 'a conversion ran the threshold backwards').toBe(after);
    // ...and the next real find still counts, from where it actually is.
    s.materials.totalDrops = 200;
    tickThresholds(s, 1);
    expect(takenIn(s, 'loam')).toBe(after + 100);
  });

  it('Ferrite banks chain length, which nothing else was keeping a total of', () => {
    const s = fresh();
    s.shell.current = 'ferrite';
    for (let i = 0; i < 40; i++) bankChain(s, 1);
    expect(takenIn(s, 'ferrite')).toBe(40);
    expect(takenIn(s, 'loam'), 'a Ferrite chain landed in Loam').toBe(0);
  });

  it('...and a chain rung on a CARRIED signature banks nothing', () => {
    /**
     * The polarity signature is carried forward, so a Verdance run with it
     * rings chains all day. Unguarded, `--scenario verdance` sat at 28% of THE
     * GREAT FLIP after three hours in a shell it had never been to — the exact
     * cross-shell leak item 9 names, in the one rule that cannot use the delta
     * trick because nothing keeps a running total of chain length.
     */
    const s = fresh();
    s.shell.current = 'verdance';
    for (let i = 0; i < 400; i++) bankChain(s, 1);
    expect(takenIn(s, 'ferrite'), 'Verdance flipped Ferrite').toBe(0);
  });
});

describe('§2 never announced, and crossed exactly once', () => {
  it('the crossing returns the rule, once, and never again', () => {
    const s = fresh();
    const def = thresholdFor('cinder')!;
    s.shell.current = 'cinder';
    ensureThresholds(s).taken['cinder'] = def.at + 10;
    expect(tickThresholds(s, 1)?.id).toBe(def.id);
    expect(tickThresholds(s, 1), 'it crossed a second time').toBeNull();
    expect(crossed(s, def.id)).toBe(true);
  });

  it('and it does not cross early', () => {
    const s = fresh();
    const def = thresholdFor('cinder')!;
    s.shell.current = 'cinder';
    ensureThresholds(s).taken['cinder'] = def.at - 1;
    expect(tickThresholds(s, 1)).toBeNull();
    expect(crossedIn(s, 'cinder')).toBe(false);
  });

  it('every shell but Aleph has exactly one, and each names both halves', () => {
    const shells = THRESHOLDS.map((t) => t.shellId);
    expect(new Set(shells).size, 'two thresholds in one shell').toBe(shells.length);
    expect(shells).not.toContain('aleph');
    for (const t of THRESHOLDS) {
      expect(t.opportunity.length, `${t.id} has no opportunity`).toBeGreaterThan(10);
      expect(t.cost.length, `${t.id} has no cost`).toBeGreaterThan(10);
      expect(t.mark, `${t.id} has no mark for the Roll`).toBeTruthy();
      expect(Boolean(t.total) !== Boolean(t.rate) || t.id === 'greatFlip',
        `${t.id} must be measured exactly one way`).toBe(true);
    }
  });
});

describe('§3 per-WORLD (item 8) — it survives the falls and washes with the world', () => {
  it('a Collapse leaves it standing', () => {
    const s = fresh();
    crossEverything(s);
    s.shell.current = 'loam';
    s.depth = 60;
    s.depthRecords['loam'] = 60;
    doCollapse(s, new ModifierCache(), noop);
    expect(crossed(s, 'subsidence'), 'a Collapse washed the threshold').toBe(true);
  });

  it('a Recursion takes every one of them, whatever the registry holds', () => {
    const engine = createEngine({ nowMs: 0 });
    let s = engine.getState() as GameState;
    crossEverything(s);
    s.shell.current = 'aleph';       // the Recursion is only ever taken from here
    s.aleph.coreTouched = true;
    let next: GameState | null = null;
    doRecursion(s, noop, (n) => { next = n; });
    expect(next, 'the Recursion did not happen').not.toBeNull();
    for (const def of THRESHOLDS) {
      expect(crossed(next!, def.id), `${def.id} survived the Recursion`).toBe(false);
    }
    expect(takenIn(next!, 'loam'), 'the count survived the Recursion').toBe(0);
  });
});

describe('§4 what the world DOES (item 10)', () => {
  it('CINDER — the gauge will not come back below the floor', () => {
    const s = fresh();
    expect(burnFloor(s)).toBe(0);
    take(s, 'cinder', thresholdFor('cinder')!.at + 1);
    expect(burnFloor(s)).toBe(BURN_FLOOR);
  });

  it('GLASSMERE — a seventh band, and every mirror comes off the wall', () => {
    const s = fresh();
    expect(bandCount(s)).toBe(6);
    s.refraction.mirrors = { 4: '/', 9: '\\' };
    take(s, 'glassmere', thresholdFor('glassmere')!.at + 1);
    expect(bandCount(s)).toBe(BANDS_BENT);
    expect(Object.keys(s.refraction.mirrors), 'the lens still works').toEqual([]);
  });

  it('FERRITE — every pole reads the other way', () => {
    const s = fresh();
    expect(flipped(s)).toBe(false);
    take(s, 'ferrite', thresholdFor('ferrite')!.at + 1);
    expect(flipped(s)).toBe(true);
  });

  it('VERDANCE and HOLLOW — a rate, and only a rate', () => {
    const s = fresh();
    expect(feralSpread(s)).toBe(1);
    expect(deepening(s)).toBe(1);
    take(s, 'verdance', thresholdFor('verdance')!.at + 1);
    take(s, 'hollow', thresholdFor('hollow')!.at + 1);
    expect(feralSpread(s)).toBe(FERAL_SPREAD);
    expect(deepening(s)).toBe(DEEPENING_SILENCE);
    expect(FERAL_SPREAD, 'a spread rate that pays').toBeLessThan(3);
  });
});

describe('§5 LOAM — the marks, the wall that is down, and the hole', () => {
  it('the mark lands on the deep half of the Roll, and nowhere before', () => {
    const s = fresh();
    s.shell.current = 'loam';
    expect(crackedHere(s), 'stations cracked before the threshold').toEqual([]);
    take(s, 'loam', thresholdFor('loam')!.at + 1);
    const cracked = crackedHere(s);
    const rows = shellRoll(s);
    expect(cracked.length, 'nothing cracked').toBeGreaterThan(0);
    expect(cracked.length, 'the whole shell cracked').toBeLessThan(rows.length);
    const deepest = Math.max(...rows.filter((r) => !cracked.includes(r.id)).map((r) => r.depth));
    const shallowest = Math.min(...rows.filter((r) => cracked.includes(r.id)).map((r) => r.depth));
    expect(shallowest, 'the marks are not the deep half').toBeGreaterThan(deepest);
  });

  it('...and the wall at a cracked station is DOWN — no tool, no breaking', () => {
    const s = fresh();
    s.shell.current = 'loam';
    take(s, 'loam', thresholdFor('loam')!.at + 1);
    ensureRoll(s);
    const wall = shellRoll(s).find((d) => d.type === 'wall' && crackedHere(s).includes(d.id));
    expect(wall, 'no cracked wall in the deep half to test').toBeTruthy();
    // Tool tier 1 against a wall that wants far more. It opens anyway.
    expect((wall!.hardness ?? 1), 'the wall was free already').toBeGreaterThan(1);
    markReached(s, wall!.depth, 1);
    expect(isCleared(s, wall!.id), 'a cracked wall still had to be broken').toBe(true);
  });

  it('a threshold in ANOTHER shell does not drop that shell\'s walls', () => {
    const s = fresh();
    s.shell.current = 'ferrite';
    take(s, 'ferrite', thresholdFor('ferrite')!.at + 1);
    s.shell.current = 'ferrite';
    expect(crackedHere(s), 'THE GREAT FLIP paid out SUBSIDENCE\'s trade').toEqual([]);
    expect(unstableHere(s), 'a Ferrite station went unstable').toBeNull();
    // ...but it IS marked on the Roll, which is rule 3 and applies to all six.
    expect(markedStations(s, shellRoll(s).map((d) => ({ id: d.id, depth: d.depth }))).length)
      .toBeGreaterThan(0);
  });

  it('the unstable one is the DEEPEST marked station — knowable, never rolled for', () => {
    const s = fresh();
    s.shell.current = 'loam';
    take(s, 'loam', thresholdFor('loam')!.at + 1);
    const id = unstableHere(s)!;
    expect(id).toBeTruthy();
    const rows = shellRoll(s);
    const at = rows.find((r) => r.id === id)!;
    const marked = crackedHere(s);
    for (const r of rows) {
      if (marked.includes(r.id)) expect(r.depth, `${r.id} is deeper than the unstable one`).toBeLessThanOrEqual(at.depth);
    }
    // Asked twice, it is the same station. A die roll would not be.
    expect(unstableHere(s)).toBe(id);
  });

  it('...and standing in it puts you back up the shaft, once, forever', () => {
    const s = fresh();
    s.shell.current = 'loam';
    take(s, 'loam', thresholdFor('loam')!.at + 1);
    ensureRoll(s);
    const id = unstableHere(s)!;
    const at = shellRoll(s).find((r) => r.id === id)!;

    expect(stationGaveWay(s, at.depth - 1), 'it gave way before you got there').toBeNull();
    const fell = stationGaveWay(s, at.depth);
    expect(fell?.id).toBe(id);
    expect(fell!.to, 'it did not put you back up the shaft').toBeLessThan(at.depth);
    expect(isGone(s, id)).toBe(true);
    expect(stationGaveWay(s, at.depth), 'it gave way twice').toBeNull();
  });
});

describe('§6 PILLAR 2 — a threshold changes, and cannot pay', () => {
  it('dpsMax at ONE depth is bit-identical with every threshold in the registry crossed', () => {
    const s = fresh();
    const mods = new ModifierCache();
    s.shell.current = 'loam';
    s.depth = 40;
    mods.invalidate();
    const clean = String(dpsMax(s, mods));

    crossEverything(s);
    s.shell.current = 'loam';
    s.depth = 40;
    expect(THRESHOLDS.every((t) => crossed(s, t.id)), 'not every threshold crossed').toBe(true);
    mods.invalidate();
    expect(String(dpsMax(s, mods)), 'a threshold moved the face ceiling').toBe(clean);
  });

  it('...and the reading is live — widening the face moves it', () => {
    const s = fresh();
    const mods = new ModifierCache();
    s.depth = 40;
    mods.invalidate();
    const a = String(dpsMax(s, mods));
    s.face.w += 1;
    mods.invalidate();
    expect(String(dpsMax(s, mods)), 'dpsMax is not reading the face').not.toBe(a);
  });

  it('and no threshold hands out a currency', () => {
    const s = fresh();
    const before = JSON.stringify(Object.fromEntries(
      Object.entries(s.currencies).map(([k, v]) => [k, String(v)]),
    ));
    crossEverything(s);
    const after = JSON.stringify(Object.fromEntries(
      Object.entries(s.currencies).map(([k, v]) => [k, String(v)]),
    ));
    expect(after, 'a threshold paid').toBe(before);
  });
});
