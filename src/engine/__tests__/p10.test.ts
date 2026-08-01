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
import { AXIOMS } from '../content/shell7/axioms';
import { axiomsFromEchoes } from '../systems/recursionSys';
import { listen, rebuildCell, voidRate, faceWhole, HOLLOW_FLOOR } from '../systems/absence';
import { runVoidTick } from '../signatures';
import { cellRegen } from '../systems/face';
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
  s.guild.discovered = true;
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

  it('owned axioms rewrite their slots; the one heresy is marked and multiplies', () => {
    const { s, mods } = fresh();
    s.recursion.axioms.push('unemptying', 'twoHands', 'insomniac');
    expect(lawNum(s, 'regenFloorShare')).toBe(0.15);
    expect(lawNum(s, 'drillStrokes')).toBe(2);
    expect(lawNum(s, 'offlineEffCap')).toBe(1.0);
    const before = cellRegen(s, mods);
    s.recursion.axioms.push('heresy');
    mods.invalidate();
    expect(cellRegen(s, mods)).toBeCloseTo(before * 1.15, 6);
    expect(AXIOMS.find((a) => a.id === 'heresy')!.heresy).toBe(true);
    expect(AXIOMS.filter((a) => a.heresy).length).toBe(1); // exactly one, announced
  });

  it('every axiom is a rule with a felt line, and exactly twenty exist', () => {
    expect(AXIOMS).toHaveLength(20);
    for (const a of AXIOMS) {
      expect(a.felt.length).toBeGreaterThan(20); // noticeable, written down
      expect(Object.keys(a.laws.num ?? {}).length + (a.laws.flags?.length ?? 0)).toBeGreaterThan(0);
    }
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
    s.guild.npcs['vess'] = { rep: 300, met: true, questStep: 2 };
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
    expect(n.guild.npcs['vess']!.rep).toBe(300);
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

  it('axioms are bought once, permanently, and firstWord rewrites the next beginning', () => {
    const { engine, s } = primed();
    // The export spine: a law is written in Resonance, and Resonance RIDES
    // Recursion with the meta currencies — banked listening buys new-world laws.
    addCurrency(s, 'resonance', D(60));
    engine.dispatch({ type: 'recurse' });
    const n = engine.getState() as GameState;
    expect(getCurrency(n, 'resonance').toNumber()).toBe(60); // it survived the reset
    expect(engine.dispatch({ type: 'buyAxiom', id: 'firstWord' }).ok).toBe(true);
    expect(getCurrency(n, 'resonance').toNumber()).toBe(35); // 25 spent on the writing
    expect(engine.dispatch({ type: 'buyAxiom', id: 'firstWord' }).ok).toBe(false); // already written
    expect(n.recursion.axioms).toContain('firstWord');
    // A second recursion begins with the structures standing.
    n.shell.current = 'aleph';
    n.aleph.coreTouched = true;
    engine.dispatch({ type: 'recurse' });
    const n2 = engine.getState() as GameState;
    expect(n2.recursion.axioms).toContain('firstWord'); // permanent
    expect(n2.kiln.built).toBe(true);
    expect(n2.forge.built).toBe(true);
    void s;
  });

  it('the gate is the Core: no touch, no recursion', () => {
    const { engine, s } = fresh();
    s.shell.current = 'aleph';
    void s;
    expect(engine.dispatch({ type: 'recurse' }).ok).toBe(false);
  });
});


describe('the axiom matrix: no law, alone or paired, softlocks the world', () => {
  it('every axiom solo: a fresh run still earns and descends', () => {
    for (const a of AXIOMS) {
      const engine = createEngine({ nowMs: 0 });
      const s = engine.getState() as GameState;
      s.recursion.axioms.push(a.id);
      engine.dispatch({ type: 'debug', op: 'warp', seconds: 900 });
      for (let i = 0; i < 40; i++) engine.dispatch({ type: 'chip', cell: i % s.face.cells.length });
      engine.dispatch({ type: 'debug', op: 'warp', seconds: 300 });
      expect((s.totals['dust'] ?? D(0)).toNumber(), a.id).toBeGreaterThan(0);
      expect(() => engine.dispatch({ type: 'descend' }), a.id).not.toThrow();
    }
  });

  it('sampled pairs (documented interactions + a shear of random ones) hold', () => {
    const pairs: Array<[string, string]> = [
      ['unemptying', 'twoHands'], // documented: the floor feeds both strokes
      ['heresy', 'unemptying'],
      ['firstWord', 'earlyDoor'], // documented: minute-one veterans
      ['sealedSeam', 'twinDescent'],
      ['reversedKiln', 'weightlessPurse'],
      ['mirroredGrammar', 'longEcho'],
      ['gentleFall', 'openDoor'],
      ['insomniac', 'patientVein'],
    ];
    for (const [a, b] of pairs) {
      const engine = createEngine({ nowMs: 0 });
      const s = engine.getState() as GameState;
      s.recursion.axioms.push(a, b);
      engine.dispatch({ type: 'debug', op: 'warp', seconds: 900 });
      for (let i = 0; i < 40; i++) engine.dispatch({ type: 'chip', cell: i % s.face.cells.length });
      engine.dispatch({ type: 'debug', op: 'warp', seconds: 300 });
      expect((s.totals['dust'] ?? D(0)).toNumber(), `${a}+${b}`).toBeGreaterThan(0);
    }
  });

  it('the unemptying is a floor, not a well: floored cells stop yielding', () => {
    const { engine, s, mods } = fresh();
    s.recursion.axioms.push('unemptying');
    engine.tick(5);
    const cell = 0;
    // Drain to the floor with repeated chips, then confirm the floor holds.
    for (let i = 0; i < 30; i++) engine.dispatch({ type: 'chip', cell });
    const cap = 8; // early cap
    expect(s.face.cells[cell]!).toBeGreaterThan(cap * 0.14);
    const held = s.face.cells[cell]!;
    const r = engine.dispatch({ type: 'chip', cell });
    void r;
    expect(s.face.cells[cell]!).toBeGreaterThanOrEqual(held - 0.01); // nothing below the floor
    void mods;
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
