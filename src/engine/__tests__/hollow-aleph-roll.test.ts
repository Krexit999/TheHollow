/**
 * HOLLOW'S AND ALEPH'S GEOGRAPHY (A.90) — the sixth and seventh Rolls, and the
 * last two.
 *
 * The SHAPE rules — one floor at the shell floor, walls facing the gates that
 * exist, a narrow re-roll band, seams inside their rarity gates, no worked
 * stone in a pool, remains from the shell's own taxonomy, no duplicate station
 * ids — run across every authored shell in `ferrite-roll.test.ts` and are not
 * repeated. This file holds what is new about these two:
 *
 *   1  NO WALLS, for the first time, and the three things that follow from it
 *   2  Hollow's ladder, and Aleph's TWO-rung one
 *   3  the last four combat orphans, by place — the list closes at ZERO
 *   4  THE ALEPH GATE GAP — three of its ten materials sit above the deepest
 *      band a forty-deep shell can roll. Asserted as a FINDING, so it stays
 *      visible instead of being rediscovered as a bug
 *   5  PILLAR 2
 *   6  what the two shells can support
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { D } from '../decimal';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { MATERIALS, RARITY_GATES, materialDef, remainsAt, rollDrop } from '../materials';
import { AUTHORED_SHELLS, authoredRoll } from '../content/rolls';
import { ensureRoll, isCleared, markReached, rollRows } from '../systems/roll';
import { deepGatesFor, rollDeepEntry } from '../systems/compaction';
import { shellDef } from '../shells';
import { bands, driftDepth, shoreBand } from '../systems/shoring';
import { availableReads, stationHere } from '../systems/circuit';
import { atRest, nearestRest } from '../systems/gear';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;

function inShell(id: string): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = id;
  ensureRoll(st);
  return st;
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOLLOW_REMAINS = ['quietsinew', 'hollowplate', 'unheart'];

let s: GameState;
beforeEach(() => { s = inShell('hollow'); });

describe('the fixtures are real', () => {
  it('Hollow: sixteen stations, floor at 560 — the registry\'s number', () => {
    const roll = authoredRoll('hollow');
    expect(roll.length).toBe(16);
    expect(roll[0]!.name).toBe('The Quietening');
    expect(roll[roll.length - 1]!.name).toBe('NOTHING AT ALL');
    expect(roll[roll.length - 1]!.depth).toBe(560);
    expect(shellDef('hollow').floorDepth).toBe(560);
  });

  it('Aleph: six stations, floor at 40 — the shortest shell in the game', () => {
    const roll = authoredRoll('aleph');
    expect(roll.length).toBe(6);
    expect(roll[0]!.name).toBe('The First Rock');
    expect(roll[roll.length - 1]!.name).toBe('THE CORE');
    expect(roll[roll.length - 1]!.depth).toBe(40);
    expect(shellDef('aleph').floorDepth).toBe(40);
  });

  it('and the four names the spine DOES author are kept exactly', () => {
    const at = (shell: string, d: number) => authoredRoll(shell).find((x) => x.depth === d);
    expect(at('hollow', 55)?.name).toBe('Condenser Wreck');
    expect(at('hollow', 55)?.wreck).toBe('THE CONDENSER');
    expect(at('hollow', 140)?.name).toBe('Witness Hall');
    expect(at('hollow', 140)?.wreck).toBe('THE WITNESS');
    expect(at('aleph', 16)?.name).toBe("The Author's Cut");
    expect(at('aleph', 16)?.wreck).toBe('THE AXIOM ENGINE');
    expect(at('aleph', 32)?.name).toBe('The Reading Room');
    expect(at('aleph', 32)?.wreck).toBe('THE SEATING');
  });

  it('every ordinary HOLLOW ore is seamed somewhere — all twenty', () => {
    const seamed = new Set(authoredRoll('hollow').flatMap((d) => d.seams ?? []));
    const ores = MATERIALS.filter((m) => m.shellId === 'hollow' && !m.worked && !m.source);
    expect(ores.length).toBe(20);
    const missing = ores.map((m) => m.id).filter((id) => !seamed.has(id));
    expect(missing, `Hollow ores in no seam pool: ${missing.join(', ')}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 1 — NO WALLS
// ---------------------------------------------------------------------------

describe('1 — two shells with no walls, and what follows', () => {
  it('the registry says there is no rock to be hard, and the Roll agrees', () => {
    for (const id of ['hollow', 'aleph']) {
      expect(shellDef(id).walls, `${id} tier gates`).toEqual([]);
      expect(authoredRoll(id).filter((d) => d.type === 'wall'), `${id} WALL stations`).toEqual([]);
    }
    // ...and the five that DO have walls still have one station per gate. This
    // is the control: without it, "no walls" would pass for a Roll that simply
    // forgot to author them.
    for (const id of AUTHORED_SHELLS.filter((x) => x !== 'hollow' && x !== 'aleph')) {
      expect(authoredRoll(id).filter((d) => d.type === 'wall').length, `${id}`)
        .toBe(shellDef(id).walls.length);
    }
  });

  /**
   * CONSEQUENCE 1: NOTHING IN THESE TWO SHELLS IS EVER `cleared`. `markReached`
   * only pushes to `roll.cleared` for a WALL, so half of §1.1's permanence
   * table has nothing to record here — a Hollow player's permanent geography is
   * WRECKS ONLY.
   */
  it('walking the whole shaft clears NOTHING, and loots everything', () => {
    markReached(s, 560, 15);
    expect(s.roll!.cleared, 'a Hollow player can never clear a wall').toEqual([]);
    expect(s.roll!.looted.length, 'but the three wrecks are hers').toBe(3);
    for (const def of authoredRoll('hollow')) expect(isCleared(s, def.id)).toBe(false);

    // The control, in a shell that HAS walls: the same call clears three.
    const ferrite = inShell('ferrite');
    markReached(ferrite, 250, 15);
    expect(ferrite.roll!.cleared.length, 'the control shell clears nothing either').toBe(3);
  });

  /** CONSEQUENCE 2: no station here asks for a tool tier. */
  it('no station in either shell carries a hardness requirement', () => {
    for (const id of ['hollow', 'aleph']) {
      for (const def of authoredRoll(id)) {
        expect(def.hardness, `${id}/${def.id} asks for tier ${def.hardness}`).toBeUndefined();
      }
    }
  });

  /** CONSEQUENCE 3: §1.2's landmark horizon is carried by wrecks alone. */
  it('the landmarks are wrecks, and Hollow\'s deep half has none', () => {
    const wrecks = authoredRoll('hollow').filter((d) => d.type === 'wreck').map((d) => d.depth);
    expect(wrecks).toEqual([55, 140, 178]);
    // 178 to the floor at 560 is 382 depths with nothing standing in it. That
    // is authored, not an omission — pinned so it cannot be "fixed" by accident.
    expect(560 - Math.max(...wrecks)).toBeGreaterThan(300);
  });

  it('and the fog rule still works with no walls: three legible ahead, floor pinned', () => {
    s.depth = 0;
    const rows = rollRows(s);
    expect(rows.filter((r) => !r.behind && r.legible).length).toBe(3);
    expect(rows.filter((r) => r.type === 'floor')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2 — THE LADDERS
// ---------------------------------------------------------------------------

describe('2 — the deep-entry ladders (§16.2)', () => {
  it('Hollow reuses its own two lower rungs; only the terminal is new', () => {
    expect(deepGatesFor('hollow').map((g) => [g.at, g.materialId]))
      .toEqual([[20, 'nothingstar'], [14, 'nothingstone'], [8, 'silencesteel']]);
    for (const id of ['silencesteel', 'nothingstone']) {
      expect(materialDef(id).shellId, id).toBe('hollow');
      expect(materialDef(id).source, `${id} should still be ordinary pool stone`).toBeUndefined();
    }
    const t = materialDef('nothingstar');
    expect(t.shellId).toBe('hollow');
    expect(t.rarity, 'every terminal is starred').toBe('starred');
    expect(t.source, 'a terminal must never be pool-eligible').toBe('deep');
  });

  it('the terminal never comes out of the rock, and the reused two still do', () => {
    const rng = seeded(17);
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const r = rollDrop('hollow', i % 561, rng);
      if (r.kind === 'material') seen.add(r.materialId!);
    }
    expect(seen.has('nothingstar')).toBe(false);
    expect(seen.has('silencesteel'), 'silencesteel should still be diggable').toBe(true);
    expect(seen.has('nothingstone'), 'nothingstone should still be diggable').toBe(true);
  });

  it('all three Hollow gates pay, and only at their own rung', () => {
    const got: Record<number, Set<string>> = { 8: new Set(), 14: new Set(), 20: new Set() };
    const real = Math.random;
    Math.random = seeded(61);
    try {
      for (const c of [8, 14, 20] as const) {
        for (let i = 0; i < 3000; i++) {
          const id = rollDeepEntry(s, ctx, c);
          if (id) got[c]!.add(id);
        }
      }
    } finally { Math.random = real; }
    expect([...got[8]!]).toEqual(['silencesteel']);
    expect([...got[14]!]).toEqual(['nothingstone']);
    expect([...got[20]!]).toEqual(['nothingstar']);
  });

  /**
   * ALEPH HAS TWO RUNGS. §16.2 writes an em-dash at its c>=14 column and
   * `deepEntry.ts` carries that literally, so a compaction of 14-19 in Aleph
   * pays the c>=8 stone and never a middle one. That is a real behavioural
   * difference from all six other shells, and this is the assertion of it.
   */
  it('ALEPH HAS TWO RUNGS: 14-19 pays the c>=8 stone, never a middle one', () => {
    expect(deepGatesFor('aleph').map((g) => [g.at, g.materialId]))
      .toEqual([[20, 'record'], [8, 'sigilstone']]);

    const aleph = inShell('aleph');
    const real = Math.random;
    Math.random = seeded(71);
    const at: Record<number, Set<string>> = { 8: new Set(), 14: new Set(), 19: new Set(), 20: new Set() };
    try {
      for (const c of [8, 14, 19, 20] as const) {
        for (let i = 0; i < 3000; i++) {
          const id = rollDeepEntry(aleph, ctx, c);
          if (id) at[c]!.add(id);
        }
      }
    } finally { Math.random = real; }
    expect([...at[8]!]).toEqual(['sigilstone']);
    expect([...at[14]!], 'the middle rung is an ABSENCE, not a third stone').toEqual(['sigilstone']);
    expect([...at[19]!]).toEqual(['sigilstone']);
    expect([...at[20]!]).toEqual(['record']);

    // The control: every other shell DOES pay something different at 14.
    for (const id of AUTHORED_SHELLS.filter((x) => x !== 'aleph')) {
      const gates = deepGatesFor(id);
      expect(gates.map((g) => g.at), `${id} rungs`).toEqual([20, 14, 8]);
    }
  });

  it('and Aleph\'s terminal is new, starred and pool-excluded like the other six', () => {
    const t = materialDef('record');
    expect(t.shellId).toBe('aleph');
    expect(t.rarity).toBe('starred');
    expect(t.source).toBe('deep');
    expect(materialDef('sigilstone').source, 'the lower rung is reused, not re-declared')
      .toBeUndefined();
    const rng = seeded(23);
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const r = rollDrop('aleph', i % 41, rng);
      if (r.kind === 'material') seen.add(r.materialId!);
    }
    expect(seen.has('record')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3 — THE LIST CLOSES AT ZERO
// ---------------------------------------------------------------------------

describe('3 — the last four combat orphans, by place (§16.4)', () => {
  it('NOTHING IN THE GAME IS COMBAT-ONLY ANY MORE', () => {
    const left = MATERIALS.filter((m) => m.source === 'combat').map((m) => m.id);
    expect(left, `still combat-only: ${left.join(', ')}`).toEqual([]);
  });

  it('Hollow\'s three are remains, and each is buried somewhere', () => {
    const placed = new Set(authoredRoll('hollow').flatMap((d) => d.remains ?? []));
    for (const id of HOLLOW_REMAINS) {
      expect(materialDef(id).source, id).toBe('remains');
      expect(placed.has(id), `${id} is buried nowhere`).toBe(true);
    }
  });

  it('45,000 rolls across 0-560 produce ALL THREE, at their places, above their gates', () => {
    const rng = seeded(20260901);
    const at = new Map<string, number[]>();
    for (let i = 0; i < 45_000; i++) {
      const d = i % 561;
      const r = rollDrop('hollow', d, rng);
      if (r.kind !== 'material') continue;
      at.set(r.materialId!, [...(at.get(r.materialId!) ?? []), d]);
    }
    expect(HOLLOW_REMAINS.filter((id) => !at.has(id)), 'never dropped').toEqual([]);
    for (const id of HOLLOW_REMAINS) {
      const stations = authoredRoll('hollow').filter((st) => (st.remains ?? []).includes(id));
      const stray = at.get(id)!.filter((d) => !stations.some((st) => Math.abs(st.depth - d) <= 4));
      expect(stray, `${id} came up at ${stray.slice(0, 5).join(',')} — no station there`).toEqual([]);
      const gate = RARITY_GATES[materialDef(id).rarity].minDepth;
      expect(at.get(id)!.filter((d) => d < gate), `${id} under its gate (${gate})`).toEqual([]);
    }
  });

  it('and a barren Hollow depth rolls what it did — nothing was added to the pool', () => {
    // 300: The Room That Isn't is at 310 and Umbral Deep at 260, both out of
    // the +-4 reach, and neither buries anything anyway.
    expect(remainsAt('hollow', 300)).toEqual([]);
  });

  /**
   * ALEPH'S ONE, AND IT CAME DOWN A BAND TO EXIST. At `flawless` its gate is
   * depth 70 and this shell's floor is 40, so the rescue would have been a
   * function that works and that nothing ever calls. At `pure` the gate is
   * exactly the floor — so it comes up at THE CORE and at no other depth in
   * the game.
   */
  it('the Author\'s Ink drops, at THE CORE, and nowhere shallower', () => {
    expect(materialDef('authorsInk').source).toBe('remains');
    expect(materialDef('authorsInk').rarity, 'flawless cannot be rolled in a 40-deep shell')
      .toBe('pure');
    expect(remainsAt('aleph', 40).map((m) => m.id)).toEqual(['authorsInk']);
    for (let d = 0; d < 40; d++) {
      expect(remainsAt('aleph', d), `it reached depth ${d}`).toEqual([]);
    }

    const rng = seeded(20260902);
    const at: number[] = [];
    for (let i = 0; i < 45_000; i++) {
      const d = i % 41;
      const r = rollDrop('aleph', d, rng);
      if (r.kind === 'material' && r.materialId === 'authorsInk') at.push(d);
    }
    expect(at.length, 'never dropped').toBeGreaterThan(0);
    expect([...new Set(at)], 'it came up somewhere other than the floor').toEqual([40]);
  });
});

// ---------------------------------------------------------------------------
// 4 — THE FINDING
// ---------------------------------------------------------------------------

/**
 * A TEST THAT ASSERTS A GAP, so the gap stays a known shape instead of being
 * rediscovered as a bug (the same job §45's "the ~100s income blackout" row
 * does in the ledger).
 *
 * `RARITY_GATES` opens the bands at ABSOLUTE depths whose own comment says
 * "Shell I", and `shellDef('aleph').floorDepth` is 40. Three of Aleph's ten
 * materials therefore sit above the deepest band the shell can roll, by any
 * route, at any compaction. No arrangement of six stations inside forty depths
 * can fix that; it is a gate question, not a geography one.
 */
describe('4 — THE ALEPH GATE GAP, asserted rather than hidden', () => {
  it('three Aleph materials cannot be rolled anywhere in Aleph', () => {
    const floor = shellDef('aleph').floorDepth;
    const unreachable = MATERIALS
      .filter((m) => m.shellId === 'aleph' && !m.worked && !m.source)
      .filter((m) => RARITY_GATES[m.rarity].minDepth > floor)
      .map((m) => m.id)
      .sort();
    expect(unreachable).toEqual(['alephite', 'paradoxa', 'worldseed']);
  });

  it('...and 45,000 rolls across the whole shell confirm it — none of them appears', () => {
    const rng = seeded(20260903);
    const seen = new Set<string>();
    for (let i = 0; i < 45_000; i++) {
      const r = rollDrop('aleph', i % 41, rng);
      if (r.kind === 'material') seen.add(r.materialId!);
    }
    for (const id of ['alephite', 'worldseed', 'paradoxa']) {
      expect(seen.has(id), `${id} dropped after all — re-open the finding`).toBe(false);
    }
    // The control: the bands the shell CAN reach do all pay.
    for (const id of ['firstiron', 'protolith', 'axiomdust', 'axiomite2', 'sigilstone', 'lawgold']) {
      expect(seen.has(id), `${id} should be diggable in Aleph`).toBe(true);
    }
  });

  it('and no Aleph seam pool names one of the three — the Roll does not lie', () => {
    const seamed = new Set(authoredRoll('aleph').flatMap((d) => d.seams ?? []));
    for (const id of ['alephite', 'worldseed', 'paradoxa']) {
      expect(seamed.has(id), `a station promises ${id} and cannot produce it`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 5 — PILLAR 2
// ---------------------------------------------------------------------------

describe('5 — PILLAR 2: geography is not income', () => {
  it('dpsMax at the SAME depth is identical across all seven shells', () => {
    const read = (shell: string): number => {
      const st = inShell(shell);
      st.depth = 30; // THE SAME DEPTH IN EVERY ARM — Depth Pressure is a yield term
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    const all = AUTHORED_SHELLS.map((id) => [id, read(id)] as const);
    for (const [id, v] of all) expect(v, `${id} reads a different ceiling`).toBe(all[0]![1]);
    // ...and the arms really are different geographies: 6 stations against 20.
    expect(authoredRoll('aleph').length).toBe(6);
    expect(authoredRoll('verdance').length).toBe(20);
  });

  it('and a roll still returns exactly ONE stone in both shells', () => {
    const rng = seeded(29);
    for (const [shell, depth] of [['hollow', 260], ['aleph', 24]] as const) {
      for (let i = 0; i < 500; i++) {
        expect(['material', 'geode', 'gem']).toContain(rollDrop(shell, depth, rng).kind);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 6 — WHAT THEY SUPPORT
// ---------------------------------------------------------------------------

describe('6 — what the two shells can now support', () => {
  it('SHORING: Hollow has bands and one can be timbered, in NULL', () => {
    expect(bands(s).length).toBeGreaterThanOrEqual(15);
    s.depthRecords['hollow'] = 560;
    s.roll!.rig = true;
    s.currencies['nullEssence'] = D('1e14');
    s.casting.rack = Array.from({ length: 8 }, (_, i) =>
      ({ id: `p${i}`, materialId: 'nothingstone', shape: 'head', purity: 50, traits: [] } as never));
    // The Quietening is at depth 0 and therefore has no band.
    expect(bands(s)[0]!.def.id).toBe('nullmarch');
    expect(shoreBand(s, ctx, 'nullmarch').ok).toBe(true);
    expect(driftDepth(s)).toBe(18);
  });

  it('SHORING: Aleph has bands too — five of them, in a forty-depth shell', () => {
    const aleph = inShell('aleph');
    expect(bands(aleph).map((b) => b.def.id))
      .toEqual(['themargin', 'authorscut', 'longsentence', 'readingroom', 'thecore']);
  });

  it('THE CIRCUIT: its world reads are live in both, and read the right place', () => {
    for (const id of ['hollow', 'aleph']) {
      const st = inShell(id);
      const ids = availableReads(st).map((r) => r.id);
      expect(ids, `${id}`).toContain('seam');
      expect(ids, `${id}`).toContain('station');
      expect(ids, `${id}`).toContain('hazard');
    }
    s.depth = 80; // past The Unsound at 76, short of Hushfall at 98
    expect(stationHere(s)?.name).toBe('The Unsound');
    expect(stationHere(s)?.type).toBe('hazard');

    const aleph = inShell('aleph');
    aleph.depth = 40;
    expect(stationHere(aleph)?.name).toBe('THE CORE');
    expect(stationHere(aleph)?.type).toBe('floor');
  });

  it('GEAR: both shells have a REST close enough to stand at', () => {
    s.depth = 125;
    expect(atRest(s)).toEqual({ ok: true, station: 'The Long Absence' });
    s.depth = 200;
    expect(atRest(s).ok).toBe(false);
    // NEAREST is by absolute distance, not "the next one down" — 200 is 75
    // from The Long Absence and 165 from The Standing Quiet.
    expect(nearestRest(s)?.name).toBe('The Long Absence');
    s.depth = 300;
    expect(nearestRest(s)?.name).toBe('The Standing Quiet');

    const aleph = inShell('aleph');
    aleph.depth = 24;
    expect(atRest(aleph)).toEqual({ ok: true, station: 'The Long Sentence' });
  });
});
