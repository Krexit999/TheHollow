/**
 * THE CENTRIFUGE — SEPARATION (§13), A.93.
 *
 *   0  THE MEASUREMENT the brief asked for: which materials are split-only in
 *      THIS codebase, and were any of them unreachable
 *   1  the place (authored, and why there), the price, and tiers as capability
 *   2  END TO END: an ore comes apart into its components
 *   3  the eleven are closed, and the keystone gate is satisfiable
 *   4  PILLAR 2
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { CASTING_IDS, MATERIALS, materialDef, rollDrop } from '../materials';
import { addMaterial, materialCount } from '../systems/forge';
import { markReached } from '../systems/roll';
import { MAX_MACHINE_TIER, tierOf } from '../systems/plant';
import { ensureCondition } from '../systems/condition';
import { allAuthoredStations } from '../content/rolls';
import { SPLITS, SPLIT_BY_ORE, splitOnly } from '../content/splits';
import {
  TIER_CAPABILITY_CENTRIFUGE, buildCentrifuge, centrifugeBuilt, centrifugeFound,
  centrifugeStation, componentsOf, fullSeparation, spin, spinBlocker, spinnable, takesWorked,
} from '../systems/centrifuge';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;

function racked(st: GameState, n: number): GameState {
  st.casting.rack = Array.from({ length: n }, (_, i) =>
    ({ id: 3300 + i, materialId: 'marl', type: 'head', purity: 50 } as never));
  st.casting.nextId = 3300 + n;
  return st;
}

function walked(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'ferrite';
  markReached(st, 250, 15);
  return racked(st, 24);
}

function withDrum(tier = 1): GameState {
  const st = walked();
  for (let i = 0; i < tier; i++) buildCentrifuge(st, ctx);
  return st;
}

// ---------------------------------------------------------------------------
// 0 — THE MEASUREMENT
// ---------------------------------------------------------------------------

/**
 * The brief: "Report which materials those actually are in this codebase, and
 * whether any are currently unreachable without it."
 *
 * `scripts/material-sources.ts` is the instrument; this is the finding, pinned
 * so it cannot quietly stop being true. ELEVEN materials had no producer, and
 * one of them GATED A KEYSTONE.
 */
describe('0 — the split-only eleven, measured', () => {
  it('the eleven are exactly what the splits produce — no more, no fewer', () => {
    expect(splitOnly()).toEqual([
      'brazecasting', 'cryocasting', 'emberglass', 'fibercloth', 'glasseal', 'groundlens',
      'lodeframe', 'platecasting', 'polecasting', 'setresin', 'steelcasting',
    ]);
    expect(splitOnly()).toHaveLength(11);   // §13 says "~10"
  });

  it('EVERY ONE OF THEM was unreachable: not dug, not seamed, not remains, not deep', () => {
    const rng = (() => { let a = 3; return () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; }; })();
    const dug = new Set<string>();
    for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder']) {
      for (let i = 0; i < 8000; i++) {
        const r = rollDrop(shell, i % 151, rng);
        if (r.kind === 'material') dug.add(r.materialId!);
      }
    }
    const placed = new Set<string>();
    for (const { def } of allAuthoredStations()) {
      for (const id of [...(def.seams ?? []), ...(def.remains ?? []), ...(def.floodSeams ?? [])]) {
        placed.add(id);
      }
    }
    for (const id of splitOnly()) {
      expect(dug.has(id), `${id} came out of the rock`).toBe(false);
      expect(placed.has(id), `${id} is in a seam or a remains`).toBe(false);
      expect(materialDef(id).source, `${id} has a source`).toBeUndefined();
      expect(materialDef(id).worked, `${id} is not worked`).toBe(true);
    }
  });

  it('AND ONE OF THEM GATED A KEYSTONE — the sharpest form of the defect', () => {
    // `keystones.ts` requires one steelcasting; `CASTING_IDS` is the canonical
    // list and every entry on it was producerless.
    expect(splitOnly()).toEqual(expect.arrayContaining([...CASTING_IDS]));
    expect(CASTING_IDS).toHaveLength(5);
  });

  /**
   * A.94 — AND NO CASTING WAITS FOR TIER II.
   *
   * A tier-I drum returns only the MAJORITY component (`componentsOf`), so a
   * casting that is second on every ore it appears in would be routed on paper
   * and unreachable in the hand — the same shape as the gate this list closed.
   * Every one of the five is first out of at least one ore.
   */
  it('and every casting is the FIRST thing out of some ore, so tier I reaches all five', () => {
    for (const id of CASTING_IDS) {
      const asMajority = SPLITS.filter((s) => s.out[0] === id);
      expect(asMajority.length, `${id} is never a tier-I majority component`).toBeGreaterThan(0);
    }
  });

  it('every split reads down from an ore that is actually dug, in its own shell', () => {
    for (const s of SPLITS) {
      const from = materialDef(s.from);
      expect(from.worked, `${s.from} is worked — a split must start at ore`).toBeFalsy();
      expect(from.source, `${s.from} is not diggable`).toBeUndefined();
      for (const out of s.out) {
        expect(materialDef(out).shellId, `${out} split out of another shell's ore`)
          .toBe(from.shellId);
      }
    }
  });
});

describe('1 — the place, the price, and the tiers (§6, §15.4)', () => {
  it('§6 gives it NO wreck, so one was authored: The Long Spin 126, in Ferrite', () => {
    expect(centrifugeStation()).toEqual({
      shellId: 'ferrite', depth: 126, name: 'The Long Spin',
    });
    // WHY FERRITE: six of the eleven are its own.
    const byShell = new Map<string, number>();
    for (const id of splitOnly()) {
      const s = materialDef(id).shellId;
      byShell.set(s, (byShell.get(s) ?? 0) + 1);
    }
    expect(byShell.get('ferrite')).toBe(6);
    expect([...byShell.entries()].sort((a, b) => b[1] - a[1])[0]![0]).toBe('ferrite');
  });

  it('a player who has not been there cannot raise it', () => {
    const st = racked(createEngine({ nowMs: 0 }).getState() as GameState, 24);
    expect(centrifugeFound(st)).toBe(false);
    expect(buildCentrifuge(st, ctx).reason).toContain('The Long Spin');
  });

  it('the tiers are three different sentences, not three sizes', () => {
    expect(new Set(TIER_CAPABILITY_CENTRIFUGE).size).toBe(TIER_CAPABILITY_CENTRIFUGE.length);
    expect(fullSeparation(withDrum(1))).toBe(false);
    expect(fullSeparation(withDrum(2))).toBe(true);
    expect(takesWorked(withDrum(2))).toBe(false);
    const three = withDrum(3);
    expect(takesWorked(three)).toBe(true);
    expect(tierOf(three, 'centrifuge')).toBe(MAX_MACHINE_TIER);
  });

  it('tier I gives the majority component; tier II gives all of them', () => {
    const def = SPLITS[0]!;
    expect(componentsOf(withDrum(1), def.from)).toEqual([def.out[0]]);
    expect(componentsOf(withDrum(2), def.from)).toEqual(def.out);
  });

  it('and it is built from cast parts, remembering what it was cast from', () => {
    const st = walked();
    expect(centrifugeBuilt(st)).toBe(false);
    expect(buildCentrifuge(st, ctx).ok).toBe(true);
    expect(st.plant!.builtOf!['centrifuge']).toContain('marl');
  });

  it('a cracked drum will not run — E2 reaches it like every machine', () => {
    const st = withDrum(1);
    addMaterial(st, 'lodestone', 80, 6);
    expect(spinBlocker(st, 'lodestone', 'fine')).toBeNull();
    ensureCondition(st)['centrifuge'] = { id: 'baked', level: 1, seized: true };
    expect(spinBlocker(st, 'lodestone', 'fine')).toContain('cracked');
  });
});

// ---------------------------------------------------------------------------
// 2 — END TO END
// ---------------------------------------------------------------------------

describe('2 — an ore comes apart', () => {
  it('three units in, both components out, at the input\'s band', () => {
    const st = withDrum(2);
    const def = SPLIT_BY_ORE.get('lodestone')!;
    addMaterial(st, 'lodestone', 88, 6);
    const r = spin(st, ctx, 'lodestone', 'fine');
    expect(r.ok, r.reason).toBe(true);
    expect(materialCount(st, 'lodestone')).toBe(6 - def.units);
    for (const out of def.out) {
      expect(materialCount(st, out), `${out} did not come out`).toBe(1);
      expect(Object.keys(st.materials.stacks[out]!)).toEqual(['fine']);
    }
  });

  it('a tier-I drum gives back ONE, and that is the whole tier-II case', () => {
    const st = withDrum(1);
    const def = SPLIT_BY_ORE.get('lodestone')!;
    addMaterial(st, 'lodestone', 88, 6);
    spin(st, ctx, 'lodestone', 'fine');
    expect(materialCount(st, def.out[0]!)).toBe(1);
    expect(materialCount(st, def.out[1]!)).toBe(0);
  });

  it('an ore that comes apart into nothing is refused BY NAME', () => {
    const st = withDrum(3);
    addMaterial(st, 'ironbloom', 88, 6);
    expect(spinBlocker(st, 'ironbloom', 'fine')).toContain('does not come apart');
  });

  it('worked stock is refused below tier III, and taken at it', () => {
    const st = withDrum(2);
    const worked = MATERIALS.find((m) => m.worked && SPLIT_BY_ORE.has(m.id));
    // No authored split starts at worked stock today, so the rule is read off
    // the blocker's own branch rather than pretended into existence.
    expect(worked, 'a worked split exists now — this assertion is stale').toBeUndefined();
    addMaterial(st, 'refineslag', 88, 6);
    expect(spinBlocker(st, 'refineslag', 'fine')).toContain('already been worked');
    expect(spinBlocker(withDrum(3), 'refineslag', 'fine')).toContain('does not come apart');
  });

  it('and the bench lists what you HOLD, never a catalogue', () => {
    const st = withDrum(2);
    expect(spinnable(st)).toEqual([]);
    addMaterial(st, 'lodestone', 88, 6);
    addMaterial(st, 'ironbloom', 88, 9);       // no split
    addMaterial(st, 'bluesteel', 88, 1);       // not enough for a spin
    const rows = spinnable(st);
    expect(rows.map((r) => r.materialId)).toEqual(['lodestone']);
    expect(rows[0]!.out).toEqual(SPLIT_BY_ORE.get('lodestone')!.out);
  });
});

// ---------------------------------------------------------------------------
// 3 — THE LIST IS CLOSED
// ---------------------------------------------------------------------------

describe('3 — every one of the eleven now has a route', () => {
  it('each is produced by at least one split, and the spin really makes it', () => {
    const st = withDrum(2);
    const made = new Set<string>();
    for (const def of SPLITS) {
      addMaterial(st, def.from, 88, def.units);
      const r = spin(st, ctx, def.from, 'fine');
      expect(r.ok, `${def.from}: ${r.reason}`).toBe(true);
      for (const out of (r.data as { out: string[] }).out) made.add(out);
    }
    expect([...made].sort()).toEqual(splitOnly());
    for (const id of splitOnly()) {
      expect(materialCount(st, id), `${id} was never produced`).toBeGreaterThan(0);
    }
  });

  it('...including the one the keystone wants', () => {
    const st = withDrum(1);
    addMaterial(st, 'bluesteel', 88, 3);
    expect(spin(st, ctx, 'bluesteel', 'fine').ok).toBe(true);
    expect(materialCount(st, 'steelcasting')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4 — PILLAR 2
// ---------------------------------------------------------------------------

describe('4 — PILLAR 2: it splits and makes nothing', () => {
  it('a spin is STRICTLY LOSSY: three units in, at most two out', () => {
    const st = withDrum(2);
    addMaterial(st, 'lodestone', 88, 6);
    const drops = st.materials.totalDrops;
    const before = Object.values(st.materials.stacks)
      .reduce((n, per) => n + Object.values(per).reduce((a, s) => a + (s?.count ?? 0), 0), 0);
    spin(st, ctx, 'lodestone', 'fine');
    const after = Object.values(st.materials.stacks)
      .reduce((n, per) => n + Object.values(per).reduce((a, s) => a + (s?.count ?? 0), 0), 0);
    expect(after).toBeLessThan(before);
    expect(st.materials.totalDrops, 'a separation counted as a find').toBe(drops);
  });

  it('and it can never raise a band — every split, every band', () => {
    for (const def of SPLITS) {
      const st = withDrum(2);
      addMaterial(st, def.from, 45, def.units);      // fair
      spin(st, ctx, def.from, 'fair');
      for (const out of def.out) {
        const bands = Object.keys(st.materials.stacks[out] ?? {});
        expect(bands, `${out} climbed a band`).toEqual(['fair']);
      }
    }
  });

  it('no currency moves', () => {
    const st = withDrum(2);
    addMaterial(st, 'lodestone', 88, 6);
    const before = JSON.stringify(st.currencies);
    spin(st, ctx, 'lodestone', 'fine');
    expect(JSON.stringify(st.currencies)).toBe(before);
  });

  it('dpsMax at the SAME depth is identical before and after', () => {
    const read = (run: boolean): number => {
      const st = withDrum(3);
      st.depth = 62; // THE SAME DEPTH IN BOTH ARMS
      addMaterial(st, 'lodestone', 88, 6);
      if (run) spin(st, ctx, 'lodestone', 'fine');
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });
});
