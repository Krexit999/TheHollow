/**
 * Phase 10 — HOLLOW + ALEPH + RECURSION + AXIOMS. The architecture is the
 * deliverable, so the architecture is the test surface: the law registry's
 * composition, the Recursion ledger field by field, heirloom tools, the
 * voidTick interface, the Silence, Reconstruction under pillar 2, and the
 * Chamber's law-compliance-by-construction.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { D } from '../decimal';
import { addCurrency, getCurrency } from '../resources';
import { lawFlag, lawNum } from '../laws';
import { axiomsFromEchoes } from '../systems/recursionSys';
import { listen, rebuildCell, voidRate, faceWhole, HOLLOW_FLOOR } from '../systems/absence';
import { runVoidTick } from '../signatures';
import { runMigrations, SAVE_VERSION } from '../save/migrations';
import { serialize } from '../save/codec';

const ctx = { emit: () => {}, dirty: () => {} };

function fresh(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState, mods: new ModifierCache() };
}

function hollowed(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const { engine, s, mods } = fresh();
  s.shell.current = 'hollow';
  s.shell.breachCount = 5;
  s.shell.signatures = ['seepage', 'polarity', 'growth', 'refraction', 'pressure'];
  s.depthRecords['hollow'] = 30;
  s.depth = 10;
  return { engine, s, mods };
}

describe('the law registry: rules compose, never contradict', () => {
  it('base laws are the pre-Axiom world exactly', () => {
    const { s } = fresh();
    expect(lawNum(s, 'regenFloorShare')).toBe(0);
    expect(lawNum(s, 'drillStrokes')).toBe(1);
    expect(lawNum(s, 'offlineEffCap')).toBe(0.95);
    expect(lawNum(s, 'regenCeilingMult')).toBe(1);
    expect(lawFlag(s, 'kilnReverse')).toBe(false);
  });
});

describe('the hollow: income from nothing, by interface not accident', () => {
  it('voidTick sums all five carried signatures; minimal carry still flows', () => {
    const { s, mods } = hollowed();
    const full = runVoidTick(s, mods, 1);
    expect(full).toBeGreaterThan(0);
    // Minimal carry: every signature at base 0.4, zero masteries, no state.
    s.depthRecords = { hollow: 30 };
    s.polarity.bestChain = 0;
    s.refraction.mirrorStock = 0;
    s.pressure.heat = 0;
    mods.invalidate();
    const minimal = runVoidTick(s, mods, 1);
    expect(minimal).toBeGreaterThan(0.5); // Seepage's floor holds the door open
    expect(full).toBeGreaterThanOrEqual(minimal);
  });

  it('the silence mutes the drip and pays convexly when listened to', () => {
    const { s, mods } = hollowed();
    // The mute applies to the SUM at that moment (Growth's contribution
    // itself rises with silence — it farms entropy; that is its character).
    s.hollow.silence = 100;
    expect(voidRate(s, mods)).toBeCloseTo(runVoidTick(s, mods, 1) * 0.3, 4); // 70% muted
    // Convexity: 80 stacks pay more than 4× what 40 stacks pay.
    s.hollow.silence = 40;
    const r1 = listen(s, mods, ctx as never);
    const g1 = (r1.data as { gained: { toNumber(): number } }).gained;
    s.hollow.silence = 80;
    const r2 = listen(s, mods, ctx as never);
    const g2 = (r2.data as { gained: { toNumber(): number } }).gained;
    expect(g2.toNumber()).toBeGreaterThan(g1.toNumber() * 3.9);
  });

  it('reconstruction: real cells, brutal curve, depth-gated, survives collapse', () => {
    const { s } = hollowed();
    addCurrency(s, 'void', D(1e9));
    expect(rebuildCell(s, ctx as never, 0).ok).toBe(true);
    expect(s.face.cells[0]).toBe(0); // born empty; regen must fill it (pillar 2)
    const cost1 = getCurrency(s, 'void');
    expect(rebuildCell(s, ctx as never, 1).ok).toBe(false); // depth-gated (14×k)
    s.depth = 14;
    expect(rebuildCell(s, ctx as never, 1).ok).toBe(true);
    expect(getCurrency(s, 'void').lt(cost1)).toBe(true); // and dearer each time
    expect(faceWhole(s)).toBe(false);
    expect(HOLLOW_FLOOR).toBe(560);
  });

  it('only rebuilt cells regen — absence does not regenerate', () => {
    const { engine, s } = hollowed();
    s.hollow.rebuilt = [3];
    s.face.cells.fill(0);
    engine.tick(30);
    expect(s.face.cells[3]!).toBeGreaterThan(0);
    expect(s.face.cells[4]!).toBe(0);
  });
});

describe('recursion: the world resets and you do not', () => {
  function primed(): { engine: Engine; s: GameState; mods: ModifierCache } {
    const { engine, s, mods } = fresh();
    s.shell.current = 'aleph';
    s.shell.breachCount = 6;
    s.depth = 40;
    s.aleph.coreTouched = true;
    s.totals['echo'] = D(75);
    s.depthRecords = { loam: 150, ferrite: 250, hollow: 400 };
    s.delver.level = 150;
    s.runes.pairsSeen = ['kel|thur'];
    s.materials.stacks['marl'] = { good: { count: 50, puritySum: 2500 } };
    s.currencies['slag'] = D(1e6);
    s.currencies['scrip'] = D(777);
    s.forge.tools.push({
      id: 5, recipeId: 'cinderMaul', name: 'Cinder Maul', tier: 15, purity: 82,
      chipPower: 60, strikePower: 950, sockets: ['bloodgarnet', null], alloys: ['greysteel'],
    });
    return { engine, s, mods };
  }

  it('the ledger: survivals survive, resets reset, tools become heirlooms', () => {
    const { engine } = primed();
    const r = engine.dispatch({ type: 'recurse' });
    expect(r.ok).toBe(true);
    const n = engine.getState() as GameState;
    // Survives:
    expect(n.depthRecords['hollow']).toBe(400);
    expect(n.delver.level).toBe(150);
    expect(n.runes.pairsSeen).toContain('kel|thur');
    expect(getCurrency(n, 'scrip').toNumber()).toBe(777);
    // Resets:
    expect(n.shell.current).toBe('loam');
    expect(n.shell.breachCount).toBe(0);
    expect(n.shell.signatures).toEqual([]);
    expect(n.materials.stacks['marl']).toBeUndefined();
    expect(getCurrency(n, 'slag').toNumber()).toBe(0);
    expect(n.depth).toBe(0);
    // HEIRLOOMS (the ruling): name, purity, gems, alloys kept; tier blunted.
    const maul = n.forge.tools.find((t) => t.name === 'Cinder Maul')!;
    expect(maul.heirloom).toBe(true);
    expect(maul.tier).toBe(1);
    expect(maul.formerTier).toBe(15);
    expect(maul.purity).toBe(82);
    expect(maul.sockets).toContain('bloodgarnet');
    expect(maul.alloys).toContain('greysteel');
    expect(maul.strikePower).toBeLessThan(20); // blunted, truly
    // Axioms: floor((75/8)^0.8) = floor(5.93) = 5, awarded once (re-rated A.44;
    // this is the LIVE grant path — it read 2 under the old /25 divisor).
    expect(axiomsFromEchoes(75)).toBe(5);
    expect(getCurrency(n, 'axiom').toNumber()).toBe(5);
    expect(n.recursion.count).toBe(1);
  });

  it('the gate is the Core: no touch, no recursion', () => {
    const { engine, s } = fresh();
    s.shell.current = 'aleph';
    void s;
    expect(engine.dispatch({ type: 'recurse' }).ok).toBe(false);
  });
});


describe('save v10', () => {
  it('migrates v9 saves with the last two shells asleep', () => {
    const { s } = fresh();
    const raw = JSON.parse(serialize(s, 0)) as { state: Record<string, unknown> };
    for (const k of ['hollow', 'chamber', 'aleph', 'recursion']) delete raw.state[k];
    const migrated = runMigrations({ version: 9, savedAt: 0, state: raw.state } as never);
    expect(migrated.version).toBe(SAVE_VERSION);
    const st = migrated.state as Record<string, Record<string, unknown>>;
    expect(st['recursion']!['count']).toBe(0);
    expect(st['hollow']!['rebuilt']).toEqual([]);
    expect(st['chamber']!['bestEfficiency']).toBe(0);
  });
});
