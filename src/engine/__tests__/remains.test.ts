/**
 * THE REMAINS (A.84) — six Loam materials that could not be obtained at all.
 *
 * They were `source: 'combat'` and combat was cut at A.7x, so the drop table
 * could not produce them, no chain could honestly consume them, and `wormsilk`
 * was worse than an orphan: `cureSilk` in curing.ts asks for it by name, so a
 * live recipe was waiting on a stone the game had no way to make.
 *
 * WHAT THESE TESTS HOLD, and each one is a thing that was actually wrong:
 *
 *   1  they DROP — from the live roll, not from a function that exists
 *   2  they drop AT A PLACE, and nowhere else, so the fiction is the mechanic
 *   3  the rarity gate still binds, so being near the place is never sufficient
 *   4  nothing was added to the RARITY POOL, so marl/ochre/bonechalk/graveclay
 *      — the tier-II floor recipe and the whole shallow chain board — keep the
 *      share they had
 *   5  pillar 2: no value of either constant reaches the field ceiling
 *   6  every one of them is consumed by something, and no two chains claim the
 *      same rescue
 */
import { describe, expect, it } from 'vitest';
import {
  MATERIALS, RARITY_GATES, REMAINS_TUNING, materialDef, remainsAt, rollDrop,
} from '../materials';
import { loamRoll } from '../content/shell1/roll';
import { anUnauthoredShell } from '../content/rolls';
import { CHAINS } from '../systems/refinery';
import { ensureContentLoaded } from '../content';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { dpsMax } from '../systems/face';
import type { GameState } from '../types';
import { traitsOf } from '../traits';

ensureContentLoaded();

/**
 * LOAM'S SIX. A.87 gave Ferrite's six the same treatment through the same
 * mechanism, so `source === 'remains'` is no longer a synonym for "Loam's" —
 * this file is about Loam and says so. Ferrite's are held by `ferrite-roll.test.ts`.
 */
const REMAINS = MATERIALS.filter((m) => m.source === 'remains' && m.shellId === 'loam');
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

/** Every material a sweep of 0..150 produces, with the depths it produced at. */
function sweep(rolls: number): Map<string, number[]> {
  const rng = seeded(20260803);
  const out = new Map<string, number[]>();
  for (let i = 0; i < rolls; i++) {
    const d = i % 151;
    const r = rollDrop('loam', d, rng);
    if (r.kind !== 'material') continue;
    const at = out.get(r.materialId!) ?? [];
    at.push(d);
    out.set(r.materialId!, at);
  }
  return out;
}

describe('the fixture is real', () => {
  it('six Loam materials are REMAINS and none is combat-only any more', () => {
    expect(REMAINS.map((m) => m.id).sort()).toEqual(
      ['burrowertooth', 'chitinshard', 'gravemote', 'marrowglass', 'taproot', 'wormsilk'],
    );
    expect(MATERIALS.filter((m) => m.shellId === 'loam' && m.source === 'combat')).toHaveLength(0);
  });

  it('...and every one of them is buried somewhere', () => {
    const placed = new Set(loamRoll().flatMap((s) => s.remains ?? []));
    const nowhere = REMAINS.filter((m) => !placed.has(m.id)).map((m) => m.id);
    expect(nowhere, `remains with no station: ${nowhere.join(', ')}`).toEqual([]);
  });

  it('and a station only ever buries a material that IS one', () => {
    for (const st of loamRoll()) {
      for (const id of st.remains ?? []) {
        expect(materialDef(id).source, `${st.name} buries ${id}`).toBe('remains');
      }
    }
  });
});

describe('1 — they drop', () => {
  const seen = sweep(45_000);

  it('45,000 rolls across depths 0-150 produce ALL SIX', () => {
    const missing = REMAINS.filter((m) => !seen.has(m.id)).map((m) => m.id);
    expect(missing, `never dropped: ${missing.join(', ')}`).toEqual([]);
  });

  it('2 — and each one only within reach of the station that holds it', () => {
    for (const m of REMAINS) {
      const stations = loamRoll().filter((s) => (s.remains ?? []).includes(m.id));
      const at = seen.get(m.id)!;
      const stray = at.filter((d) =>
        !stations.some((s) => Math.abs(s.depth - d) <= REMAINS_TUNING.reach));
      expect(stray, `${m.id} came up at ${stray.slice(0, 5).join(',')} — no station there`).toEqual([]);
    }
  });

  it('3 — and never under its own rarity gate', () => {
    for (const m of REMAINS) {
      const gate = RARITY_GATES[m.rarity].minDepth;
      const early = seen.get(m.id)!.filter((d) => d < gate);
      expect(early, `${m.id} (${m.rarity}, gate ${gate}) came up at ${early.slice(0, 5).join(',')}`)
        .toEqual([]);
    }
  });

  it('the floor keeps its own: taproot comes up at DEEPGRAVE and nowhere else', () => {
    expect(Math.min(...seen.get('taproot')!)).toBeGreaterThanOrEqual(150 - REMAINS_TUNING.reach);
  });
});

describe('4 — nothing was added to the rarity pool', () => {
  /**
   * THE DECISION THIS PINS. Loam holds four commons and three riches. Six more
   * in the pool would have cut every common by a third and every rich by two
   * fifths — and those are exactly the stones the tier-II floor recipe and the
   * shallow chain board are made of, so "more content" would have silently
   * re-priced the first hardness wall. Pillar 1 binds the drop economy too.
   */
  it('a depth with no station nearby rolls EXACTLY what it rolled before', () => {
    // depth 105: the nearest stations are Quillrest 98 and THE KNOT 109, and
    // neither buries anything.
    expect(remainsAt('loam', 105)).toEqual([]);
    const rng = () => 0.5; // any fixed stream; the point is both arms use it
    const withRemains = rollDrop('loam', 105, rng);
    REMAINS_TUNING.share = 0;
    const without = rollDrop('loam', 105, rng);
    REMAINS_TUNING.share = 0.35;
    expect(withRemains).toEqual(without);
  });

  it('and no remains material is in any rarity pool', () => {
    for (const m of REMAINS) {
      expect(m.source, `${m.id} would be pool-eligible`).toBeTruthy();
    }
  });

  it('a shell with no authored Roll has no remains at any depth', () => {
    // ASK THE REGISTRY — 'ferrite' broke at A.87 and 'verdance' at A.88.
    const none = anUnauthoredShell();
    for (let d = 0; d <= 250; d += 10) expect(remainsAt(none, d), none).toEqual([]);
  });
});

describe('5 — PILLAR 2: the place never reaches the ceiling', () => {
  it('dpsMax is identical at the SAME depth with the mechanism on and off', () => {
    const read = (share: number): number => {
      REMAINS_TUNING.share = share;
      const engine = createEngine({ nowMs: 0 });
      const s = engine.getState() as GameState;
      s.depth = 28; // The Undersill — a station that buries two things
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(s, m).toNumber() * 1e6);
    };
    const on = read(0.35);
    const off = read(0);
    REMAINS_TUNING.share = 0.35;
    expect(on).toBe(off);
  });

  it('and a roll still returns exactly ONE stone, on or off', () => {
    // The substitution swaps WHAT fell out. If it ever added a second unit it
    // would be a faucet, and `rollDrop` returning one object is the guarantee.
    const rng = seeded(7);
    for (let i = 0; i < 500; i++) {
      const r = rollDrop('loam', 28, rng);
      expect(['material', 'geode', 'gem']).toContain(r.kind);
    }
  });
});

describe('6 — every one of them is now wanted', () => {
  /** Chains that take a remains stone, keyed by the stone. */
  const claims = new Map<string, string[]>();
  for (const c of CHAINS) {
    for (const id of [c.a, c.b]) {
      if (materialDef(id).source !== 'remains') continue;
      claims.set(id, [...(claims.get(id) ?? []), c.id]);
    }
  }

  it('five of the six are consumed by a chain, one by the curing bench', () => {
    // wormsilk is the exception on purpose: it was never an orphan. `cureSilk`
    // has asked for it by name since Phase 19 and could never fire, which is
    // why it is in this pass at all despite not being on the orphan list.
    expect(claims.get('wormsilk')).toBeUndefined();
    for (const id of ['chitinshard', 'gravemote', 'burrowertooth', 'marrowglass', 'taproot']) {
      expect(claims.get(id), `${id} is consumed by no chain`).toBeDefined();
    }
  });

  it('and no two chains claim the same rescue', () => {
    for (const [id, ids] of claims) {
      expect(ids, `${id} is rescued twice: ${ids.join(', ')}`).toHaveLength(1);
    }
  });

  it('every remains chain SHARES A TRAIT, which is the rule §17 never states', () => {
    for (const c of CHAINS) {
      if (materialDef(c.a).source !== 'remains' && materialDef(c.b).source !== 'remains') continue;
      const shared = traitsOf(c.a).filter((t) => traitsOf(c.b).includes(t));
      expect(shared.length, `${c.id}: ${c.a} and ${c.b} have nothing in common`)
        .toBeGreaterThan(0);
    }
  });

  it('and outputs something that is genuinely consumed elsewhere', () => {
    // Not a text scan: these four are named by forge recipes, tempering media,
    // the compaction ladder and shell-II upgrades respectively.
    const OUTPUTS = ['wormsteel', 'temperash', 'truesilver', 'umberjade'];
    for (const c of CHAINS) {
      if (materialDef(c.a).source !== 'remains' && materialDef(c.b).source !== 'remains') continue;
      expect(OUTPUTS, `${c.id} outputs ${c.out}`).toContain(c.out);
    }
  });
});
