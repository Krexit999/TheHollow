/**
 * THE PLANT — FLOW AND SURGE (§3, §5, §15.4).
 *
 * The claims: draw accelerates conversion and never the field, a machine
 * starved of Flow behaves DIFFERENTLY from one starved of Surge, machine tiers
 * are capabilities bought with cast parts, and the Core tree's choice is
 * capability-versus-capability.
 */
import { describe, expect, it } from 'vitest';
import { raiseWreck } from './wrecks';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import {
  FLOW_PER_RANK, HEARTH_FLOOR, MACHINE_DEMAND, SURGE_FLOOR, SURGE_PER_RANK,
  demandOf, ensurePlant, flowCap, flowSatisfaction, surgeCap, surgeRegen, tickPlant, tierOf,
} from '../systems/plant';
import { CRUSH_BATCH, CRUSH_BYPRODUCT, CRUSH_PRODUCT, buildCrusher, crush } from '../systems/crusher';
import { dpsMax } from '../systems/face';
import { addMaterial } from '../systems/forge';
import { bandOf } from '../materials';
import { CORE_NODES } from '../content/shell1/coreTree';
import type { PurityBand } from '../materials';

const nullCtx: EngineCtx = { emit() {}, dirty() {} };
function fresh(): { engine: Engine; s: () => GameState; m: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: () => engine.getState() as GameState, m: new ModifierCache() };
}

/** A crusher at `tier` with stone to eat and a full bank. */
function withCrusher(st: GameState, tier: number): void {
  ensurePlant(st).tiers['crusher'] = tier;
  ensurePlant(st).surge = surgeCap(st);
}

describe('PILLAR 2 — draw accelerates conversion, never the field', () => {
  it('no amount of Flow or Surge moves the ceiling by one unit', () => {
    const { s, m } = fresh();
    const st = s();
    st.kiln.built = true;
    const before = dpsMax(st, m).toNumber();
    st.collapse.nodes['flowCapacity'] = 10;
    st.collapse.nodes['surgeCapacity'] = 10;
    st.kiln.heat = 1;
    ensurePlant(st).surge = 1e6;
    m.invalidate();
    expect(dpsMax(st, m).toNumber()).toBe(before);
    // ...and the capacities really did move, so this is not a vacuous pass.
    expect(flowCap(st)).toBeGreaterThan(HEARTH_FLOOR);
    expect(surgeCap(st)).toBeGreaterThan(SURGE_FLOOR);
  });
});

describe('THE HEARTH — Loam is pure Flow, small (§3.2)', () => {
  it('is the Kiln: no kiln, no plant', () => {
    const { s } = fresh();
    expect(flowCap(s())).toBe(0);
  });

  it('grows with the Kiln\'s own heat', () => {
    const { s } = fresh();
    const st = s();
    st.kiln.built = true;
    st.kiln.heat = 0;
    const cold = flowCap(st);
    st.kiln.heat = 1;
    expect(flowCap(st)).toBeGreaterThan(cold);
  });

  it('makes no burst of its own — Surge must be bought', () => {
    const { s } = fresh();
    const st = s();
    st.kiln.built = true;
    st.kiln.heat = 1;
    expect(surgeCap(st)).toBe(SURGE_FLOOR);
  });

  /**
   * THE FLOOR IS THE KILN'S OWN DEMAND. A lone Kiln must never be starved by
   * the plant it IS — at a lower floor a cold kiln ran at 62.5% and quietly cut
   * the measured opening by over a third.
   */
  it('never starves a lone Kiln, cold or hot', () => {
    const { s } = fresh();
    const st = s();
    st.kiln.built = true;
    st.kiln.feeding = true;
    for (const heat of [0, 0.5, 1]) {
      st.kiln.heat = heat;
      expect(flowSatisfaction(st, 'kiln'), `heat ${heat}`).toBe(1);
    }
  });
});

describe('the two starvations are DIFFERENT, and that is the whole design', () => {
  it('FLOW-starved runs SLOW — proportionally, and never stops', () => {
    const { s } = fresh();
    const st = s();
    st.kiln.built = true;
    st.kiln.feeding = true;
    st.kiln.heat = 1;
    ensurePlant(st).tiers['refinery'] = 1; // a second continuous drawer
    const sat = flowSatisfaction(st, 'kiln');
    expect(sat).toBeLessThan(1);   // it is short
    expect(sat).toBeGreaterThan(0); // and still working
  });

  it('SURGE-starved WAITS — all or nothing, never a slow batch', () => {
    const { s } = fresh();
    const st = s();
    withCrusher(st, 2);
    addMaterial(st, 'marl', 50, CRUSH_BATCH);
    ensurePlant(st).surge = demandOf('crusher').surge - 0.01;
    const held = st.materials.stacks['marl']!['fair' as PurityBand]!.count;
    const r = crush(st, nullCtx, 'marl', 'fair' as PurityBand);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/waits/i);
    // Nothing was half-consumed: the batch did not happen at all.
    expect(st.materials.stacks['marl']!['fair' as PurityBand]!.count).toBe(held);
  });

  it('a batch empties the bank, and the bank refills SLOWLY', () => {
    const { s } = fresh();
    const st = s();
    withCrusher(st, 2);
    addMaterial(st, 'marl', 50, CRUSH_BATCH);
    const full = ensurePlant(st).surge;
    expect(crush(st, nullCtx, 'marl', 'fair' as PurityBand).ok).toBe(true);
    const after = ensurePlant(st).surge;
    expect(after).toBe(full - demandOf('crusher').surge);
    // "Slowly" is the defining half of what Surge is: a full bank must take
    // longer to rebuild than a single tick, or it is Flow with extra steps.
    tickPlant(st, 1);
    expect(ensurePlant(st).surge).toBeLessThan(full);
    expect(surgeRegen(st)).toBeLessThan(surgeCap(st));
  });

  it('the Kiln never wants Surge and the Crusher never wants Flow', () => {
    expect(MACHINE_DEMAND['kiln']!.surge).toBe(0);
    expect(MACHINE_DEMAND['crusher']!.flow).toBe(0);
    // ...and the Refinery wants both, which is what makes it the machine that
    // punishes a lopsided plant.
    expect(MACHINE_DEMAND['refinery']!.flow).toBeGreaterThan(0);
    expect(MACHINE_DEMAND['refinery']!.surge).toBeGreaterThan(0);
  });

  it('a built Crusher can ALWAYS eventually fire, even with nothing bought', () => {
    // A machine you can build and can never run is a broken purchase. The floor
    // is one batch; Reservoir buys how OFTEN, not whether.
    const { s } = fresh();
    expect(SURGE_FLOOR).toBeGreaterThanOrEqual(demandOf('crusher').surge);
    void s;
  });
});

describe('MACHINE TIERS ARE CAPABILITIES (§15.4), built from cast parts', () => {
  it('is built out of the rack, not bought with currency', () => {
    const { s } = fresh();
    const st = s();
    // A.106: The Long Cut, Loam 47, before the rack means anything. The refusal
    // ordering is deliberate — the PLACE is checked before the price — so this
    // has to be raised first or the "empty rack" line below tests the wrong
    // refusal and passes for the wrong reason.
    expect(buildCrusher(st, nullCtx).reason).toContain('The Long Cut');
    raiseWreck(st, 'CRUSHER');
    expect(buildCrusher(st, nullCtx).ok).toBe(false); // empty rack
    st.casting.rack = Array.from({ length: 2 }, (_, i) => ({
      id: i + 1, type: 'head', materialId: 'marl', purity: 50,
    })) as never;
    expect(buildCrusher(st, nullCtx).ok).toBe(true);
    expect(tierOf(st, 'crusher')).toBe(1);
    expect(st.casting.rack).toHaveLength(0); // the parts went into the machine
  });

  it('TIER I loses a purity band', () => {
    const { s } = fresh();
    const st = s();
    withCrusher(st, 1);
    addMaterial(st, 'marl', 50, CRUSH_BATCH); // 50 = 'fair'
    expect(bandOf(50)).toBe('fair');
    const r = crush(st, nullCtx, 'marl', 'fair' as PurityBand);
    expect(r.ok).toBe(true);
    const out = st.materials.stacks[CRUSH_PRODUCT]!;
    expect(Object.keys(out)).toEqual(['poor']); // one band down
  });

  it('TIER II RETAINS THE INPUT\'S PURITY BAND — the capability, not a bonus', () => {
    const { s } = fresh();
    const st = s();
    withCrusher(st, 2);
    addMaterial(st, 'marl', 50, CRUSH_BATCH);
    expect(crush(st, nullCtx, 'marl', 'fair' as PurityBand).ok).toBe(true);
    expect(Object.keys(st.materials.stacks[CRUSH_PRODUCT]!)).toEqual(['fair']);
  });

  it('TIER III EMITS BYPRODUCTS AT ALL — tiers I and II emit none', () => {
    for (const tier of [1, 2]) {
      const { s } = fresh();
      const st = s();
      withCrusher(st, tier);
      addMaterial(st, 'marl', 50, CRUSH_BATCH);
      crush(st, nullCtx, 'marl', 'fair' as PurityBand);
      expect(st.materials.stacks[CRUSH_BYPRODUCT], `tier ${tier}`).toBeUndefined();
    }
    const { s } = fresh();
    const st = s();
    withCrusher(st, 3);
    addMaterial(st, 'marl', 50, CRUSH_BATCH);
    crush(st, nullCtx, 'marl', 'fair' as PurityBand);
    expect(st.materials.stacks[CRUSH_BYPRODUCT]).toBeDefined();
  });
});

describe('THE CORE TREE\'S CHOICE IS CAPABILITY vs CAPABILITY (§3.3)', () => {
  it('both capacities are nodes, and neither is a multiplier on the other', () => {
    const ids = CORE_NODES.map((n) => n.id);
    expect(ids).toContain('flowCapacity');
    expect(ids).toContain('surgeCapacity');
    const { s } = fresh();
    const st = s();
    st.kiln.built = true;
    const baseFlow = flowCap(st);
    const baseSurge = surgeCap(st);
    st.collapse.nodes['flowCapacity'] = 1;
    expect(flowCap(st)).toBeCloseTo(baseFlow + FLOW_PER_RANK, 6);
    expect(surgeCap(st)).toBe(baseSurge); // Flow ranks buy no Surge
    st.collapse.nodes['flowCapacity'] = 0;
    st.collapse.nodes['surgeCapacity'] = 1;
    expect(surgeCap(st)).toBe(baseSurge + SURGE_PER_RANK);
    expect(flowCap(st)).toBeCloseTo(baseFlow, 6); // ...and Surge ranks buy no Flow
  });

  it('the tranche-1 nodes are available in Loam, before any Breach', () => {
    const { s } = fresh();
    expect(s().shell.breachCount).toBe(0);
    for (const id of ['flowCapacity', 'surgeCapacity']) {
      expect(CORE_NODES.find((n) => n.id === id)!.tranche).toBeUndefined();
    }
  });
});
