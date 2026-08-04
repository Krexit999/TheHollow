/**
 * FERRITE'S GEOGRAPHY (A.87) — the second authored Roll.
 *
 * Written against the SHAPE Loam's Roll already has, not a second pattern, so
 * most of what follows is a rule that used to say "Loam" and now says "every
 * authored shell". Where a rule can be stated once for both, it is.
 *
 *   1  the geography: names and depths persist, contents re-roll, the walls sit
 *      on the walls that already exist, and the re-roll band stays narrow
 *   2  the seam pools respect the RARITY GATES — a seam that could never
 *      produce its stone is a lie the Assay Bench would repeat
 *   3  the deep-entry ladder is PER SHELL (§16.2) and Ferrite's three pay
 *   4  the six combat orphans drop, by place, under their own gates
 *   5  PILLAR 2 — none of it is income, at any depth, in either shell
 *   6  what the shell can now support: shoring, the Circuit, gear at a REST
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { D } from '../decimal';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { MATERIALS, gateDepth, materialDef, remainsAt, rollDrop } from '../materials';
import {
  AUTHORED_SHELLS, NO_SUCH_SHELL, allAuthoredStations, authoredRoll, stationById,
  unauthoredShells,
} from '../content/rolls';
import { contentsOf, ensureRoll, rerollRoll, rollRows, shellRoll } from '../systems/roll';
import { deepGatesFor, DEEP_GATES_BY_SHELL, rollDeepEntry } from '../systems/compaction';
import { shellDef } from '../shells';
import { bands, driftDepth, shoreBand, shoreBlocker } from '../systems/shoring';
import { availableReads, stationHere } from '../systems/circuit';
import { atRest, nearestRest } from '../systems/gear';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;
let s: GameState;
let mods: ModifierCache;

/** A player standing in Ferrite. */
function inFerrite(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'ferrite';
  ensureRoll(st);
  return st;
}

/** A fixed generator, so a failure is a failure and not a bad afternoon. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FERRITE_REMAINS = [
  'scalebackplate', 'ironsinew', 'voltgland', 'magnetheart', 'nullquill', 'loadstarcore',
];

beforeEach(() => {
  s = inFerrite();
  mods = new ModifierCache();
  mods.invalidate();
});

describe('the fixture is real', () => {
  it('Ferrite is authored, and a world without a Roll returns nothing', () => {
    // MEMBERSHIP, not the whole list: this asserted ['ferrite','loam'] and
    // broke the moment Verdance was written — a test about A.87 failing
    // because of A.88.
    expect(AUTHORED_SHELLS).toContain('ferrite');
    expect(authoredRoll('ferrite').length).toBeGreaterThanOrEqual(15);
    expect(authoredRoll(NO_SUCH_SHELL)).toEqual([]);
  });

  /**
   * ALL SEVEN, AS OF A.90 — the row of passes that started at A.87 with
   * "`shellRoll` returns [] for six of seven shells" is closed. Asserted here
   * rather than in the two new shells' own files, because the claim is about
   * the REGISTRY and this is where the cross-shell rules live.
   */
  it('every shell in the game has a geography', () => {
    expect(unauthoredShells(), 'a shell with no Roll').toEqual([]);
    expect(AUTHORED_SHELLS.length).toBe(7);
    expect(allAuthoredStations().length).toBe(119);
  });

  it('and `shellRoll` reads the registry, not a hardcoded shell', () => {
    expect(shellRoll(s).length).toBe(authoredRoll('ferrite').length);
    const loam = createEngine({ nowMs: 0 }).getState() as GameState;
    expect(shellRoll(loam).length).toBe(authoredRoll('loam').length);
  });

  it('no two stations in the game share an id', () => {
    const ids = allAuthoredStations().map((x) => x.def.id);
    expect(new Set(ids).size, `duplicate station ids: ${ids.length} vs ${new Set(ids).size}`).toBe(ids.length);
    expect(stationById('polebreak')?.shellId).toBe('ferrite');
    expect(stationById('bricklight')?.shellId).toBe('loam');
  });
});

describe('1 — the geography (§1, §1.1)', () => {
  it('every authored shell has one floor, at the shell floor depth', () => {
    for (const id of AUTHORED_SHELLS) {
      const floors = authoredRoll(id).filter((d) => d.type === 'floor');
      expect(floors, `${id} floors`).toHaveLength(1);
      expect(floors[0]!.depth, `${id} floor depth`).toBe(shellDef(id).floorDepth);
    }
  });

  it('stations are ordered, distinct in depth, and start at the surface', () => {
    for (const id of AUTHORED_SHELLS) {
      const depths = authoredRoll(id).map((d) => d.depth);
      expect(depths[0], `${id} starts at 0`).toBe(0);
      expect([...depths].sort((a, b) => a - b), `${id} is in depth order`).toEqual(depths);
      expect(new Set(depths).size, `${id} has two stations at one depth`).toBe(depths.length);
    }
  });

  /**
   * THE WALLS ARE THE WALLS THAT ALREADY EXIST. One station per tier gate,
   * sitting one depth ABOVE it — you stand at the wall and the next step is the
   * one that asks for the tool. The Roll gives an existing gate a name and a
   * face; a second gate beside it would be a different, worse system.
   */
  it('every WALL faces a real tier gate, and every tier gate has a WALL', () => {
    for (const id of AUTHORED_SHELLS) {
      const walls = authoredRoll(id).filter((d) => d.type === 'wall');
      const gates = shellDef(id).walls;
      expect(walls.length, `${id} wall count`).toBe(gates.length);
      for (const g of gates) {
        const at = walls.find((w) => w.depth === g.depth - 1);
        expect(at, `${id}: no WALL station above the tier-${g.tier} gate at ${g.depth}`).toBeDefined();
        expect(at!.hardness, `${at!.name} hardness`).toBe(g.tier);
      }
    }
  });

  it('and at least one REST, so gear can be swapped in-shell (§40.1)', () => {
    for (const id of AUTHORED_SHELLS) {
      expect(authoredRoll(id).filter((d) => d.type === 'rest').length, `${id} rests`)
        .toBeGreaterThanOrEqual(1);
    }
  });

  it('every WRECK names what was lost there', () => {
    for (const { shellId, def } of allAuthoredStations()) {
      if (def.type !== 'wreck') continue;
      expect(def.wreck, `${shellId}/${def.id}`).toBeTruthy();
    }
  });

  it('every station says one line, and no station is nameless', () => {
    for (const { shellId, def } of allAuthoredStations()) {
      expect(def.name.length, `${shellId}/${def.id} name`).toBeGreaterThan(2);
      expect((def.line ?? '').length, `${shellId}/${def.id} line`).toBeGreaterThan(20);
    }
  });

  /**
   * THE RE-ROLL BAND IS NARROW ON PURPOSE (§45.1 risk 3): a station whose
   * contents swing widely stops meaning anything, so the pool is two or three.
   * This used to be asserted for Loam alone.
   */
  it('the re-roll band stays two-or-three candidates, in every shell', () => {
    for (const { shellId, def } of allAuthoredStations()) {
      const n = (def.seams ?? []).length;
      expect(n, `${shellId}/${def.id} has ${n} seam candidates`).toBeLessThanOrEqual(3);
    }
  });

  it('a Collapse re-rolls contents and moves NOTHING that is authored', () => {
    const before = shellRoll(s).map((d) => ({ id: d.id, depth: d.depth, name: d.name, type: d.type, hardness: d.hardness }));
    let moved = 0;
    const rng = seeded(20260805);
    for (let i = 0; i < 20; i++) {
      const was = shellRoll(s).map((d) => JSON.stringify(contentsOf(s, d.id)));
      rerollRoll(s, rng);
      const now = shellRoll(s).map((d) => JSON.stringify(contentsOf(s, d.id)));
      moved += now.filter((v, j) => v !== was[j]).length;
    }
    const after = shellRoll(s).map((d) => ({ id: d.id, depth: d.depth, name: d.name, type: d.type, hardness: d.hardness }));
    expect(after, 'a name, a depth, a type or a hardness moved').toEqual(before);
    expect(moved, 'nothing re-rolled — the control is dead').toBeGreaterThan(60);
  });

  it('a WALL and a REST hold no seam — the place IS the contents', () => {
    for (const { shellId, def } of allAuthoredStations()) {
      if (def.type !== 'wall' && def.type !== 'rest') continue;
      expect(def.seams ?? [], `${shellId}/${def.id}`).toEqual([]);
    }
  });

  it('and the fog rule works in Ferrite: three legible ahead, the floor pinned', () => {
    s.depth = 0;
    const rows = rollRows(s);
    const ahead = rows.filter((r) => !r.behind);
    expect(ahead.filter((r) => r.legible).length).toBe(3);
    expect(rows.filter((r) => r.type === 'floor')).toHaveLength(1);
  });
});

describe('2 — a seam can always produce what it names', () => {
  it('no station seams a stone its own depth cannot roll', () => {
    for (const { shellId, def } of allAuthoredStations()) {
      for (const id of def.seams ?? []) {
        const m = materialDef(id);
        expect(m.shellId, `${shellId}/${def.id} seams ${id} from ${m.shellId}`).toBe(shellId);
        // A.91: the gate is the SHELL'S, not a table's. Bit-identical for every
        // shell whose floor is at or past Loam's 150; Aleph's ladder compresses.
        expect(def.depth, `${def.name} seams ${m.name} (${m.rarity}, gate ${gateDepth(shellId, m.rarity)})`)
          .toBeGreaterThanOrEqual(gateDepth(shellId, m.rarity));
        expect(m.worked, `${def.name} seams a WORKED material`).toBeFalsy();
      }
    }
  });

  it('and every ordinary Ferrite ore is seamed somewhere', () => {
    const seamed = new Set(authoredRoll('ferrite').flatMap((d) => d.seams ?? []));
    const missing = MATERIALS
      .filter((m) => m.shellId === 'ferrite' && !m.worked && !m.source)
      .map((m) => m.id)
      .filter((id) => !seamed.has(id));
    expect(missing, `Ferrite ores in no seam pool: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('3 — the deep-entry ladder is per shell (§16.2)', () => {
  it('Ferrite has its own three, at the same 8 / 14 / 20 rungs', () => {
    expect(deepGatesFor('ferrite').map((g) => [g.at, g.materialId]))
      .toEqual([[20, 'poleiron'], [14, 'lodestonecored'], [8, 'wormsteel']]);
    expect(deepGatesFor('loam').map((g) => g.at)).toEqual([20, 14, 8]);
  });

  it('and the two new ones are real, deep-flagged, and pool-excluded', () => {
    for (const id of ['lodestonecored', 'poleiron']) {
      const m = materialDef(id);
      expect(m.shellId, id).toBe('ferrite');
      expect(m.source, `${id} would be pool-eligible`).toBe('deep');
    }
    // A sweep of the ordinary drop table must never produce them.
    const rng = seeded(7);
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const r = rollDrop('ferrite', i % 251, rng);
      if (r.kind === 'material') seen.add(r.materialId!);
    }
    expect(seen.has('lodestonecored')).toBe(false);
    expect(seen.has('poleiron')).toBe(false);
  });

  it('all three GATES PAY, in play, and only at their own rung', () => {
    const got: Record<number, Set<string>> = { 8: new Set(), 14: new Set(), 20: new Set() };
    const real = Math.random;
    Math.random = seeded(31);
    try {
      for (const c of [8, 14, 20] as const) {
        for (let i = 0; i < 3000; i++) {
          const id = rollDeepEntry(s, ctx, c);
          if (id) got[c]!.add(id);
        }
      }
    } finally { Math.random = real; }
    expect([...got[8]!]).toEqual(['wormsteel']);
    expect([...got[14]!]).toEqual(['lodestonecored']);
    expect([...got[20]!]).toEqual(['poleiron']);
  });

  it('a Loam player still digs Loam out of the same call', () => {
    const loam = createEngine({ nowMs: 0 }).getState() as GameState;
    const real = Math.random;
    Math.random = seeded(5);
    const got = new Set<string>();
    try {
      for (let i = 0; i < 3000; i++) {
        const id = rollDeepEntry(loam, ctx, 20);
        if (id) got.add(id);
      }
    } finally { Math.random = real; }
    expect([...got]).toEqual(['deepgrave']);
  });

  /**
   * NOTHING FALLS BACK ANY MORE, and the old test asked to be deleted when that
   * day came ("nothing falls back any more — delete this"). A.90 wrote the last
   * two tables, so the Loam default is now unreachable from any real shell —
   * which is the fix for the row `deepEntry.ts` calls "WRONG and knowingly so"
   * (a Verdance player digging Deepgrave out of soil).
   *
   * The default STAYS, and is still tested, because an eighth shell would need
   * it. What is gone is any shell that uses it.
   */
  it('every shell has its OWN ladder — the Loam default is unreachable', () => {
    for (const id of AUTHORED_SHELLS) {
      expect(DEEP_GATES_BY_SHELL[id], `${id} still falls back to Loam's ladder`).toBeDefined();
    }
    expect(unauthoredShells()).toEqual([]);
    expect(deepGatesFor(NO_SUCH_SHELL), 'the default is still there for an eighth shell')
      .toBe(deepGatesFor('loam'));
  });
});

describe('4 — the six combat orphans drop, by place (§16.4)', () => {
  it('none of them still says combat, and each is buried somewhere', () => {
    const placed = new Set(authoredRoll('ferrite').flatMap((d) => d.remains ?? []));
    for (const id of FERRITE_REMAINS) {
      expect(materialDef(id).source, id).toBe('remains');
      expect(placed.has(id), `${id} is buried nowhere`).toBe(true);
    }
    expect(MATERIALS.filter((m) => m.shellId === 'ferrite' && m.source === 'combat')).toHaveLength(0);
  });

  it('45,000 rolls across depths 0-250 produce ALL SIX', () => {
    const rng = seeded(20260805);
    const at = new Map<string, number[]>();
    for (let i = 0; i < 45_000; i++) {
      const d = i % 251;
      const r = rollDrop('ferrite', d, rng);
      if (r.kind !== 'material') continue;
      at.set(r.materialId!, [...(at.get(r.materialId!) ?? []), d]);
    }
    const missing = FERRITE_REMAINS.filter((id) => !at.has(id));
    expect(missing, `never dropped: ${missing.join(', ')}`).toEqual([]);

    for (const id of FERRITE_REMAINS) {
      const stations = authoredRoll('ferrite').filter((st) => (st.remains ?? []).includes(id));
      const stray = at.get(id)!.filter((d) => !stations.some((st) => Math.abs(st.depth - d) <= 4));
      expect(stray, `${id} came up at ${stray.slice(0, 5).join(',')} — no station there`).toEqual([]);
      const gate = gateDepth('ferrite', materialDef(id).rarity);
      const early = at.get(id)!.filter((d) => d < gate);
      expect(early, `${id} came up under its gate (${gate})`).toEqual([]);
    }
  });

  it('the floor keeps its own: Loadstar Core comes up at POLEIRON and nowhere else', () => {
    const stations = authoredRoll('ferrite').filter((d) => (d.remains ?? []).includes('loadstarcore'));
    expect(stations.map((d) => d.depth)).toEqual([250]);
  });

  it('and nothing was added to the rarity pool — a barren depth rolls what it did', () => {
    // Depth 125 is out of reach of every REMAINS in the shell. The Long Spin
    // (126, A.93) is its nearest neighbour now and deliberately buries nothing:
    // this assertion is the drop economy's own guard, and a new station that
    // moved it would have been a drop-economy change wearing a station's hat.
    expect(remainsAt('ferrite', 125)).toEqual([]);
  });

  it('a station only ever buries a material that IS one, from its own shell', () => {
    for (const { shellId, def } of allAuthoredStations()) {
      for (const id of def.remains ?? []) {
        expect(materialDef(id).source, `${def.name} buries ${id}`).toBe('remains');
        expect(materialDef(id).shellId, `${def.name} buries ${shellId === 'loam' ? 'a foreign' : 'a foreign'} stone`)
          .toBe(shellId);
      }
    }
  });
});

describe('5 — PILLAR 2: geography is not income', () => {
  it('dpsMax at the SAME depth is identical with the Roll and without it', () => {
    const read = (shell: string): number => {
      const st = createEngine({ nowMs: 0 }).getState() as GameState;
      st.shell.current = shell;
      ensureRoll(st);
      st.depth = 28; // THE SAME DEPTH IN BOTH ARMS — Depth Pressure is a yield term
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    /**
     * A.90: SEVEN GEOGRAPHIES, ONE DEPTH, ONE CEILING. This compared Ferrite
     * against a shell with no Roll, and there is no such shell any more. The
     * replacement is a stronger control, not a weaker one — six to twenty
     * stations, five wall counts, two shells with no walls at all, and every
     * one of them must read the same ceiling to the microdust.
     */
    const all = AUTHORED_SHELLS.map((id) => [id, read(id)] as const);
    for (const [id, v] of all) expect(v, `${id} reads a different ceiling`).toBe(all[0]![1]);
    const counts = new Set(AUTHORED_SHELLS.map((id) => authoredRoll(id).length));
    expect(counts.size, 'every shell has the same station count — the control is dead')
      .toBeGreaterThan(1);
  });

  it('and a roll still returns exactly ONE stone', () => {
    const rng = seeded(11);
    for (let i = 0; i < 500; i++) {
      const r = rollDrop('ferrite', 48, rng);
      expect(['material', 'geode', 'gem']).toContain(r.kind);
    }
  });
});

describe('6 — what the shell can now support', () => {
  it('SHORING: Ferrite has bands, and one can be timbered', () => {
    expect(bands(s).length).toBeGreaterThanOrEqual(15);
    s.depthRecords['ferrite'] = 250;
    s.roll!.rig = true;
    s.currencies['flux'] = D('1e14');
    s.casting.rack = Array.from({ length: 8 }, (_, i) =>
      ({ id: `p${i}`, materialId: 'ironbloom', shape: 'head', purity: 50, traits: [] } as never));
    // The Rustfall is at depth 0 and therefore has no band, exactly as The
    // Turnrow has none — the first timberable band in Ferrite is Lodestone Cut.
    expect(bands(s)[0]!.def.id).toBe('lodestonecut');
    expect(shoreBand(s, ctx, 'lodestonecut').ok).toBe(true);
    expect(driftDepth(s)).toBe(14);
  });

  /**
   * FERRITE AUTHORS NO SHORING RIG, and it does not need one. The rig is a
   * TECHNIQUE, not a machine you leave behind: `state.roll.rig` is written once
   * and `breach.ts` never touches `state.roll`, so a player who raised it at
   * Loam's Shoring Deep carries it down — the same shape as the Drill Bay's
   * 'once you have breached, the technique is yours in every shell'.
   *
   * The alternative would be a second rig wreck per shell, i.e. re-earning a
   * technique six times, which is the toll LAW 9 forbids.
   */
  it('...and the rig carries down: it is a technique, not a machine', () => {
    expect(authoredRoll('ferrite').some((d) => d.wreck === 'SHORING RIG')).toBe(false);
    const loam = createEngine({ nowMs: 0 }).getState() as GameState;
    ensureRoll(loam);
    loam.roll!.rig = true;
    loam.shell.current = 'ferrite';
    ensureRoll(loam);
    loam.depthRecords['ferrite'] = 250;
    expect(shoreBlocker(loam, 'lodestonecut')).not.toBe('The Shoring Rig is not standing.');
  });

  it('THE CIRCUIT: its world reads are live in Ferrite', () => {
    const ids = availableReads(s).map((r) => r.id);
    expect(ids).toContain('seam');
    expect(ids).toContain('station');
    expect(ids).toContain('hazard');
    s.depth = 85;
    expect(stationHere(s)?.name).toBe('The Attracting Dark');
    expect(stationHere(s)?.type).toBe('hazard');
  });

  it('GEAR: a Ferrite REST is close enough to stand at', () => {
    s.depth = 112; // Iron Vespers
    expect(atRest(s)).toEqual({ ok: true, station: 'Iron Vespers' });
    s.depth = 60;
    expect(atRest(s).ok).toBe(false);
    expect(nearestRest(s)?.name).toBe('Iron Vespers');
  });
});
