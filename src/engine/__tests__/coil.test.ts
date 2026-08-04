/**
 * THE COIL — SURGE (§13), and the answer to item 11.
 *
 * §0 is the whole reason this machine exists as more than a rename: a bare
 * plant cannot fire a Line, and the only thing that ever lifted it was a
 * Core-tree node that every Breach wipes.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ensureContentLoaded } from '../content';
import { ModifierCache } from '../modifiers';
import { markReached } from '../systems/roll';
import {
  MAX_MACHINE_TIER, SURGE_FLOOR, demandOf, ensurePlant, surgeCap, tierOf,
} from '../systems/plant';
import {
  COIL_BANK, COIL_PER_LINK, TIER_CAPABILITY_COIL, buildCoil, chainBanks, chainRead,
  coilBuilt, coilFound, coilRemembers, coilStation, coilSurge,
} from '../systems/coil';
import { CORE_NODES } from '../content/shell1/coreTree';
import { dpsMax } from '../systems/face';
import { PART_TYPES } from '../content/forgeParts';
import { makePart } from '../systems/forgeParts';
import { allShells } from '../shells';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx = (): EngineCtx => ({ dirty: () => {}, emit: () => {} }) as unknown as EngineCtx;

function inFerrite(tier = 0): GameState {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  s.shell.current = 'ferrite';
  for (const shell of allShells()) s.depthRecords[shell.id] = 400;
  markReached(s, 250, 15);
  if (tier > 0) ensurePlant(s).tiers['coil'] = tier;
  s.casting.rack = PART_TYPES.map((t, i) => ({ ...makePart(t, 'marl', 40), id: 300 + i })) as never;
  return s;
}

describe('§0 — ITEM 11: a bare plant cannot fire a Line, and never could', () => {
  it('the floor is UNDER a Line\'s draw — §13\'s claim, in arithmetic', () => {
    expect(demandOf('line').surge).toBeGreaterThan(SURGE_FLOOR);
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    expect(surgeCap(s)).toBe(SURGE_FLOOR);
    expect(surgeCap(s) < demandOf('line').surge, 'a bare plant can fire a Line').toBe(true);
  });

  it('and the only thing that ever lifted it is a CORE NODE, which a Breach wipes', () => {
    // The gate §13 hangs on a machine was hanging on a purchase that resets.
    expect(CORE_NODES.some((n) => n.id === 'surgeCapacity')).toBe(true);
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    s.collapse.nodes = { surgeCapacity: 1 };
    const bought = surgeCap(s);
    expect(bought).toBeGreaterThan(SURGE_FLOOR);
    s.collapse.nodes = {};                        // what `doBreach` does
    expect(surgeCap(s)).toBe(SURGE_FLOOR);
  });

  it('A TIER-I COIL CLEARS A LINE ON ITS OWN — the machine, not the purse', () => {
    const s = inFerrite(1);
    expect(s.collapse.nodes['surgeCapacity'] ?? 0).toBe(0);
    expect(surgeCap(s)).toBe(SURGE_FLOOR + COIL_BANK);
    expect(surgeCap(s)).toBeGreaterThanOrEqual(demandOf('line').surge);
  });
});

describe('§1 — the machine', () => {
  it('the wreck is the one Ferrite was authored with', () => {
    const at = coilStation()!;
    expect([at.shellId, at.depth, at.name]).toEqual(['ferrite', 22, "Coilwright's Fall"]);
  });

  it('found by walking in, built from cast parts, never bought', () => {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    s.shell.current = 'ferrite';
    expect(coilFound(s)).toBe(false);
    expect(buildCoil(s, ctx()).ok).toBe(false);
    markReached(s, coilStation()!.depth, 15);
    expect(coilFound(s)).toBe(true);
    expect(buildCoil(s, ctx()).ok, 'built with an empty rack').toBe(false);
    s.casting.rack = PART_TYPES.map((t, i) => ({ ...makePart(t, 'marl', 40), id: i + 1 })) as never;
    expect(buildCoil(s, ctx()).ok).toBe(true);
    expect(coilBuilt(s)).toBe(true);
    expect(s.plant!.builtOf!['coil']).toBeDefined();
  });

  it('and it draws NOTHING — it is the plant, not a machine on it', () => {
    expect(demandOf('coil')).toEqual({ flow: 0, surge: 0 });
  });
});

describe('§2 — three tiers, three sentences', () => {
  it('I is a bank; the chain is worth nothing yet', () => {
    const s = inFerrite(1);
    s.polarity.chain = 12;
    expect(chainBanks(s)).toBe(false);
    expect(coilSurge(s)).toBe(COIL_BANK);
  });

  it('II — EVERY LINK BANKS: the face buys the plant\'s biggest action', () => {
    const s = inFerrite(2);
    s.polarity.chain = 0;
    expect(coilSurge(s)).toBe(COIL_BANK);
    s.polarity.chain = 10;
    expect(chainRead(s)).toBe(10);
    expect(coilSurge(s)).toBeCloseTo(COIL_BANK + COIL_PER_LINK * 10, 10);
    expect(surgeCap(s)).toBeCloseTo(SURGE_FLOOR + COIL_BANK + COIL_PER_LINK * 10, 10);
  });

  it('III — it remembers the best chain, so a broken one was not wasted', () => {
    const s = inFerrite(2);
    s.polarity.chain = 0;
    s.polarity.bestChain = 14;
    expect(coilRemembers(s)).toBe(false);
    expect(chainRead(s), 'a tier-II coil reads only the live chain').toBe(0);
    ensurePlant(s).tiers['coil'] = 3;
    expect(coilRemembers(s)).toBe(true);
    expect(chainRead(s)).toBe(14);
  });

  it('the three read as three distinct sentences', () => {
    expect(TIER_CAPABILITY_COIL).toHaveLength(MAX_MACHINE_TIER + 1);
    expect(new Set(TIER_CAPABILITY_COIL.slice(1)).size).toBe(3);
  });
});

describe('§3 — polarity is NOT touched, and neither is the ceiling', () => {
  it('the Coil reads `chain` and `bestChain` and writes neither', () => {
    const s = inFerrite(3);
    s.polarity.chain = 7;
    s.polarity.bestChain = 19;
    const before = { chain: s.polarity.chain, best: s.polarity.bestChain, last: s.polarity.lastSign };
    chainRead(s);
    coilSurge(s);
    surgeCap(s);
    expect(s.polarity.chain).toBe(before.chain);
    expect(s.polarity.bestChain).toBe(before.best);
    expect(s.polarity.lastSign).toBe(before.last);
  });

  it('PILLAR 2: an enormous bank cannot move dpsMax', () => {
    const s = inFerrite(3);
    s.depth = 48;
    const mods = new ModifierCache();
    mods.invalidate();
    const bare = dpsMax(s, mods).toNumber();
    s.polarity.chain = 200;
    s.polarity.bestChain = 200;
    mods.invalidate();
    expect(surgeCap(s)).toBeGreaterThan(SURGE_FLOOR * 10);   // the bank really grew
    expect(dpsMax(s, mods).toNumber()).toBe(bare);
  });

  it('and the Coil is worth nothing where it is not standing', () => {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    s.shell.current = 'loam';
    s.polarity.chain = 40;
    expect(tierOf(s, 'coil')).toBe(0);
    expect(coilSurge(s)).toBe(0);
    expect(surgeCap(s)).toBe(SURGE_FLOOR);
  });
});
