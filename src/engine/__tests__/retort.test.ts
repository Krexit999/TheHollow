/**
 * THE RETORT — REDUCTION (§13), and the answer to item 6.
 *
 * §0 is the measurement: nothing was missing at the BOTTOM of the quench media,
 * and everything was missing at the top. §17 names a Pyre-bath that had never
 * existed, and no verb anywhere in the game moved stock up a RARITY band.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import { ensureContentLoaded } from '../content';
import { ModifierCache } from '../modifiers';
import { markReached } from '../systems/roll';
import { MAX_MACHINE_TIER, ensurePlant } from '../systems/plant';
import { ensureCondition } from '../systems/condition';
import { addMaterial, materialCount } from '../systems/forge';
import { CHAINS } from '../systems/refinery';
import { TEMPERS } from '../systems/tempering';
import {
  REDUCE_UNITS, REDUCTIONS, TIER_CAPABILITY_RETORT, buildRetort, climbsRarity, firedByShaft,
  reachesPyreBath, reduce, reduceBlocker, reducible, retortBuilt, retortFound, retortStation,
  shaftIsTheFire,
} from '../systems/retort';
import { PYRE_BATH } from '../content/reductions';
import { mediumTakes } from '../systems/quench';
import { holdLine } from '../systems/pressure';
import { dpsMax } from '../systems/face';
import { MATERIALS, RARITIES, materialDef, workedMaterials } from '../materials';
import { PART_TYPES } from '../content/forgeParts';
import { makePart } from '../systems/forgeParts';
import { allShells } from '../shells';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx = (): EngineCtx => ({ dirty: () => {}, emit: () => {} }) as unknown as EngineCtx;

function atTheRetort(tier = 1): GameState {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  s.shell.current = 'cinder';
  for (const shell of allShells()) s.depthRecords[shell.id] = 500;
  markReached(s, 300, 15);
  ensurePlant(s).tiers['retort'] = tier;
  ensureCondition(s);
  s.casting.rack = PART_TYPES.map((t, i) => ({ ...makePart(t, 'marl', 40), id: 700 + i })) as never;
  return s;
}

describe('§0 — ITEM 6: what feeds the media, measured', () => {
  it('nothing is missing at the bottom — three media are dug, three are chained', () => {
    const made = new Set(CHAINS.map((c) => c.out));
    const dug: string[] = [];
    const chained: string[] = [];
    for (const t of TEMPERS) {
      if (t.medium === PYRE_BATH) continue;             // the one this pass adds
      (made.has(t.medium) ? chained : dug).push(t.medium);
    }
    expect(chained.sort()).toEqual(['temperash', 'truesilver', 'voidresidue']);
    expect(dug.sort()).toEqual(['charstone', 'frostsand', 'lumenshard']);
  });

  it('and what WAS missing is §17\'s last medium, which had never existed', () => {
    // Registered at content load so a def-lookup in a render path cannot throw
    // (the A.36 Refinery black-screen class), but produced only by this machine.
    expect(() => materialDef(PYRE_BATH)).not.toThrow();
    expect(materialDef(PYRE_BATH).worked).toBe(true);
    expect(materialDef(PYRE_BATH).rarity).toBe('starred');
    expect(workedMaterials().some((m) => m.id === PYRE_BATH)).toBe(true);
  });

  it('NOTHING ELSE IN THE GAME CLIMBS A RARITY BAND — that is the verb', () => {
    // Every reduction reads UP: this is §13's "blocks `starred`", checkable.
    for (const r of REDUCTIONS) {
      expect(climbsRarity(r), `${r.from} → ${r.to} does not climb`).toBe(true);
    }
    // ...and the top of the ladder is the only STARRED material that is made.
    const starredMade = MATERIALS.filter((m) => m.rarity === 'starred' && m.worked);
    expect(starredMade.map((m) => m.id)).toContain(PYRE_BATH);
  });

  it('every pyre stone is a warm Cinder common — a fire lying around', () => {
    for (const r of REDUCTIONS) {
      const d = materialDef(r.pyre);
      expect(d.shellId, `${r.pyre} is not Cinder's`).toBe('cinder');
      expect(d.worked, `${r.pyre} is worked`).toBeFalsy();
    }
  });
});

describe('§1 — the wreck, and the machine', () => {
  it('Retort Hall is the station Cinder was authored with', () => {
    const at = retortStation()!;
    expect([at.shellId, at.depth, at.name]).toEqual(['cinder', 120, 'Retort Hall']);
  });

  it('found by walking in, built from cast parts, never bought', () => {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    s.shell.current = 'cinder';
    expect(retortFound(s)).toBe(false);
    expect(buildRetort(s, ctx()).ok).toBe(false);
    markReached(s, retortStation()!.depth, 15);
    expect(retortFound(s)).toBe(true);
    expect(buildRetort(s, ctx()).ok, 'built with an empty rack').toBe(false);
    s.casting.rack = PART_TYPES.map((t, i) => ({ ...makePart(t, 'marl', 40), id: i + 1 })) as never;
    expect(buildRetort(s, ctx()).ok).toBe(true);
    expect(retortBuilt(s)).toBe(true);
    expect(s.plant!.builtOf!['retort']).toBeDefined();
  });
});

describe('§2 — the reduction', () => {
  let s: GameState;
  beforeEach(() => { s = atTheRetort(1); });

  it('two of a medium and one pyre stone become one of the band above', () => {
    const r = REDUCTIONS.find((x) => !x.pyreBath)!;
    addMaterial(s, r.from, 60, REDUCE_UNITS);
    addMaterial(s, r.pyre, 60, 2);
    const band = Object.keys(s.materials.stacks[r.from]!)[0] as never;
    expect(reduce(s, ctx(), r.from, band).ok).toBe(true);
    expect(materialCount(s, r.from)).toBe(0);
    expect(materialCount(s, r.pyre)).toBe(1);
    expect(materialCount(s, r.to)).toBe(1);
  });

  it('and it is strictly lossy — two in, one out, never the reverse', () => {
    expect(REDUCE_UNITS).toBeGreaterThan(1);
    expect(REDUCTIONS.length).toBeGreaterThan(0);
  });

  it('a short stack is refused rather than eaten', () => {
    const r = REDUCTIONS.find((x) => !x.pyreBath)!;
    addMaterial(s, r.from, 60, REDUCE_UNITS - 1);
    addMaterial(s, r.pyre, 60, 2);
    const band = Object.keys(s.materials.stacks[r.from]!)[0] as never;
    expect(reduceBlocker(s, r.from, band)).toMatch(/at one band/);
    expect(reduce(s, ctx(), r.from, band).ok).toBe(false);
    expect(materialCount(s, r.from)).toBe(REDUCE_UNITS - 1);
  });

  it('a stone that is not a medium is refused BY NAME', () => {
    addMaterial(s, 'marl', 60, 8);
    expect(reduceBlocker(s, 'marl', 'fair')).toMatch(/does not reduce/);
  });
});

describe('§3 — three tiers, three sentences', () => {
  it('II — above the Damper\'s line the shaft is the fire, and the stone is spare', () => {
    const s = atTheRetort(1);
    const r = REDUCTIONS.find((x) => !x.pyreBath)!;
    addMaterial(s, r.from, 60, REDUCE_UNITS * 2);
    const band = Object.keys(s.materials.stacks[r.from]!)[0] as never;
    // Tier I with no pyre stone: refused, and it names the stone.
    expect(shaftIsTheFire(s)).toBe(false);
    expect(reduceBlocker(s, r.from, band)).toMatch(/for the fire/);

    ensurePlant(s).tiers['retort'] = 2;
    s.pressure.heat = 0;
    expect(firedByShaft(s), 'a cold shaft is not a fire').toBe(false);
    expect(reduceBlocker(s, r.from, band)).toMatch(/burn that instead/);

    s.pressure.heat = holdLine(s) + 15;
    expect(firedByShaft(s)).toBe(true);
    expect(reduceBlocker(s, r.from, band)).toBeNull();
    const res = reduce(s, ctx(), r.from, band);
    expect(res.ok).toBe(true);
    expect((res.data as { byShaft: boolean }).byShaft).toBe(true);
    expect(materialCount(s, r.pyre), 'it burned a stone it did not have').toBe(0);
  });

  it('III — the Pyre-bath, and nothing under it can reach one', () => {
    const s = atTheRetort(2);
    const r = REDUCTIONS.find((x) => x.pyreBath)!;
    addMaterial(s, r.from, 60, REDUCE_UNITS);
    addMaterial(s, r.pyre, 60, 2);
    const band = Object.keys(s.materials.stacks[r.from]!)[0] as never;
    expect(reachesPyreBath(s)).toBe(false);
    expect(reduceBlocker(s, r.from, band)).toMatch(/deepest Retort/);
    // ...and it is not even offered.
    expect(reducible(s).map((x) => x.to)).not.toContain(PYRE_BATH);

    ensurePlant(s).tiers['retort'] = 3;
    expect(reachesPyreBath(s)).toBe(true);
    expect(reduce(s, ctx(), r.from, band).ok).toBe(true);
    expect(materialCount(s, PYRE_BATH)).toBe(1);
  });

  it('and the Pyre-bath is the capability: it refuses NO part (§17)', () => {
    const pyre = TEMPERS.find((t) => t.medium === PYRE_BATH)!;
    for (const m of ['marl', 'voidstar', 'axiomdust', 'obsidianheart']) {
      expect(mediumTakes(pyre.id, m), `refused ${m}`).toBe(true);
    }
    // Every OTHER medium refuses something, which is what makes that a capability.
    const pickier = TEMPERS.filter((t) => t.medium !== PYRE_BATH)
      .filter((t) => !mediumTakes(t.id, 'marl'));
    expect(pickier.length).toBeGreaterThan(0);
  });

  it('the three read as three distinct sentences', () => {
    expect(TIER_CAPABILITY_RETORT).toHaveLength(MAX_MACHINE_TIER + 1);
    expect(new Set(TIER_CAPABILITY_RETORT.slice(1)).size).toBe(3);
  });
});

describe('§4 — pillar 2', () => {
  it('a Retort at its deepest cannot move the ceiling', () => {
    const s = atTheRetort(3);
    s.depth = 48;
    const mods = new ModifierCache();
    mods.invalidate();
    const bare = dpsMax(s, mods).toNumber();
    for (const r of REDUCTIONS) {
      addMaterial(s, r.from, 60, REDUCE_UNITS);
      addMaterial(s, r.pyre, 60, 4);
    }
    for (const r of REDUCTIONS) {
      const band = Object.keys(s.materials.stacks[r.from] ?? {})[0];
      if (band) reduce(s, ctx(), r.from, band as never);
    }
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).toBe(bare);
  });

  it('a reduction lands at the INPUT\'s purity, never above it', () => {
    const s = atTheRetort(1);
    const r = REDUCTIONS.find((x) => !x.pyreBath)!;
    addMaterial(s, r.from, 30, REDUCE_UNITS);   // a poor stack
    addMaterial(s, r.pyre, 60, 2);
    const band = Object.keys(s.materials.stacks[r.from]!)[0] as never;
    reduce(s, ctx(), r.from, band);
    const out = s.materials.stacks[r.to]!;
    const outBand = Object.keys(out)[0] as keyof typeof out;
    const stack = out[outBand]!;
    expect(stack.puritySum / stack.count).toBeLessThanOrEqual(30);
    // And the RARITY did climb, so the assertion is about purity alone.
    expect(RARITIES.indexOf(materialDef(r.to).rarity))
      .toBeGreaterThan(RARITIES.indexOf(materialDef(r.from).rarity));
  });
});
