/**
 * THE CONSIDERED HAND (Phase 21) — the everywhere layer, at the engine level:
 * undo, the run-summary ledger, and the QoL action handlers. UI is not exercised
 * here; these are the guarantees the UI leans on.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { raiseWreck } from './wrecks';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { getCurrency } from '../resources';
import { upgradeLevel } from '../upgrades';
import { fmt, setNumberFormat } from '../decimal';
import { tickAutoRefine, refineryUnlocked } from '../systems/refinery';
import { addMaterial, materialCount } from '../systems/forge';
import type { EngineCtx } from '../types';

const nullCtx: EngineCtx = { emit() {}, dirty() {} };

function fresh(): { engine: Engine; s: () => GameState } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: () => engine.getState() as GameState };
}

/** Put the player deep enough that a Collapse pays out. */
function makeCollapsible(engine: Engine): void {
  const s = engine.getState() as GameState;
  s.depth = 40;
  s.shaft.reached = 40;
}

describe('undo — the short window', () => {
  it('reverses a spend, restoring both the bank and the level', () => {
    const { engine, s } = fresh();
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1000 });
    const dustBefore = getCurrency(s(), 'dust');
    const r = engine.dispatch({ type: 'buyUpgrade', id: 'blade', count: 1 });
    expect(r.ok).toBe(true);
    expect(upgradeLevel(s(), 'blade')).toBe(1);
    expect(getCurrency(s(), 'dust').lt(dustBefore)).toBe(true);

    expect(engine.undoInfo()).not.toBeNull();
    const undo = engine.dispatch({ type: 'undo' });
    expect(undo.ok).toBe(true);
    expect(upgradeLevel(s(), 'blade')).toBe(0);
    expect(getCurrency(s(), 'dust').eq(dustBefore)).toBe(true);
    // The snapshot is spent once used.
    expect(engine.undoInfo()).toBeNull();
  });

  it('offers nothing to undo on a fresh engine', () => {
    const { engine } = fresh();
    expect(engine.undoInfo()).toBeNull();
    expect(engine.dispatch({ type: 'undo' }).ok).toBe(false);
  });

  it('does NOT arm on a non-spend (a toggle leaves the prior snapshot intact)', () => {
    const { engine } = fresh();
    // A setting is not undoable, and must not create an undo point of its own.
    engine.dispatch({ type: 'setConfirmSpendFrac', frac: 0.9 });
    expect(engine.undoInfo()).toBeNull();
  });

  it('is CLEARED by a Collapse — a prestige is never an accident', () => {
    const { engine, s } = fresh();
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1000 });
    engine.dispatch({ type: 'buyUpgrade', id: 'blade', count: 1 });
    expect(engine.undoInfo()).not.toBeNull();
    makeCollapsible(engine);
    const c = engine.dispatch({ type: 'collapse' });
    expect(c.ok).toBe(true);
    expect(engine.undoInfo()).toBeNull();
    // And undo now does nothing — the run is gone for good.
    expect(engine.dispatch({ type: 'undo' }).ok).toBe(false);
    expect(upgradeLevel(s(), 'blade')).toBe(0);
  });
});

describe('carry-one — the one balance change, bounded', () => {
  it('a carried upgrade keeps its full level; the mark is spent on the fall', () => {
    const { engine, s } = fresh();
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e9 });
    engine.dispatch({ type: 'buyUpgrade', id: 'blade', count: 10 });
    const carried = upgradeLevel(s(), 'blade');
    expect(carried).toBeGreaterThanOrEqual(10);
    engine.dispatch({ type: 'setCarryUpgrade', upgradeId: 'blade' });
    makeCollapsible(engine);
    engine.dispatch({ type: 'collapse' });
    // Kept full through the fall...
    expect(upgradeLevel(s(), 'blade')).toBe(carried);
    // ...and the mark is consumed — the next fall does not keep it for free.
    expect(s().qol.carryUpgradeId).toBeNull();
  });

  it('refuses to carry something that does not reset on Collapse', () => {
    const { engine, s } = fresh();
    // 'kilnBuild' is a structure — it survives collapse anyway, so it cannot be carried.
    const r = engine.dispatch({ type: 'setCarryUpgrade', upgradeId: 'kilnBuild' });
    expect(r.ok).toBe(false);
    expect(s().qol.carryUpgradeId).toBeNull();
  });
});

describe('auto-collapse — automation, not a free prestige', () => {
  /**
   * The Grid it used to be gated on is gone (gridModules.ts cut, A.7x); a
   * standing autoCollapseDepth now fires on its own once the threshold is
   * crossed, with no automation prerequisite left to gate it.
   */
  it('fires on the standing threshold alone, with no Grid to gate it', () => {
    const { engine, s } = fresh();
    const st = s();
    st.qol.autoCollapseDepth = 30;
    st.depth = 40;
    st.shaft.reached = 40;
    engine.tick(2); // two seconds of live sim
    expect(s().depth).toBe(0); // collapsed
    expect(s().collapse.count).toBe(1);
  });

  it('does not fire under the threshold', () => {
    const { engine, s } = fresh();
    const st = s();
    st.qol.autoCollapseDepth = 30;
    st.depth = 20;
    st.shaft.reached = 20;
    engine.tick(2);
    expect(s().depth).toBe(20);
    expect(s().collapse.count).toBe(0);
  });
});

describe('run summary — the closing ledger', () => {
  it('records the run on Collapse and measures the next against it', () => {
    const { engine, s } = fresh();
    makeCollapsible(engine);
    const first = engine.dispatch({ type: 'collapse' });
    expect(first.ok).toBe(true);
    const run1 = s().collapse.lastRun;
    expect(run1).not.toBeNull();
    expect(run1!.depth).toBe(40);
    expect(run1!.cores.gt(0)).toBe(true);

    // A second, deeper run: its event carries the FIRST run as `prev`.
    const s2 = s();
    s2.depth = 60;
    s2.shaft.reached = 60;
    let prevDepth = -1;
    const off = engine.subscribe(() => {});
    // Drain via the action result rather than the feed for determinism.
    const second = engine.dispatch({ type: 'collapse' });
    off();
    expect(second.ok).toBe(true);
    const data = second.data as { prev: { depth: number } | null };
    prevDepth = data.prev?.depth ?? -1;
    expect(prevDepth).toBe(40);
    expect(s().collapse.lastRun!.depth).toBe(60);
  });
});

describe('qol action handlers', () => {
  /**
   * BLUEPRINTS ARE GONE, and this is the note rather than a silent deletion.
   * They saved a head/haft/binding composition for the old Forge's bench. That
   * bench moved to the Casting Floor, which builds from SEVEN parts off a rack
   * that already holds them — so there was nothing left for a blueprint to
   * name. The action, the type and the qol field went with the bench.
   */
  it('blueprints are retired with the bench they belonged to', () => {
    const { s } = fresh();
    expect('blueprints' in s().qol).toBe(false);
  });

  it('pins toggle on and off', () => {
    const { engine, s } = fresh();
    engine.dispatch({ type: 'togglePin', materialId: 'marl' });
    expect(s().qol.pins).toContain('marl');
    engine.dispatch({ type: 'togglePin', materialId: 'marl' });
    expect(s().qol.pins).not.toContain('marl');
  });

  it('refine presets: set, re-target, toggle, and clear', () => {
    const { engine, s } = fresh();
    engine.dispatch({ type: 'setRefinePreset', materialId: 'marl', toBand: 'good' });
    expect(s().qol.refinePresets).toHaveLength(1);
    expect(s().qol.refinePresets[0]).toMatchObject({ materialId: 'marl', toBand: 'good', enabled: true });
    engine.dispatch({ type: 'setRefinePreset', materialId: 'marl', toBand: 'fine' });
    expect(s().qol.refinePresets[0]!.toBand).toBe('fine');
    engine.dispatch({ type: 'toggleRefinePreset', materialId: 'marl' });
    expect(s().qol.refinePresets[0]!.enabled).toBe(false);
    engine.dispatch({ type: 'setRefinePreset', materialId: 'marl', toBand: null });
    expect(s().qol.refinePresets).toHaveLength(0);
  });

  it('auto-collapse depth clamps to a floor of 1, and null turns it off', () => {
    const { engine, s } = fresh();
    engine.dispatch({ type: 'setAutoCollapseDepth', depth: 33 });
    expect(s().qol.autoCollapseDepth).toBe(33);
    engine.dispatch({ type: 'setAutoCollapseDepth', depth: -5 });
    expect(s().qol.autoCollapseDepth).toBe(1);
    engine.dispatch({ type: 'setAutoCollapseDepth', depth: null });
    expect(s().qol.autoCollapseDepth).toBeNull();
  });

  it('bookmarks, notes, and read stamps', () => {
    const { engine, s } = fresh();
    engine.dispatch({ type: 'setBookmark', entryId: 'mat.marl', on: true });
    expect(s().qol.bookmarks).toContain('mat.marl');
    engine.dispatch({ type: 'setBookmark', entryId: 'mat.marl', on: false });
    expect(s().qol.bookmarks).not.toContain('mat.marl');
    engine.dispatch({ type: 'setNote', entryId: 'mat.marl', note: 'soft, chalky' });
    expect(s().qol.notes['mat.marl']).toBe('soft, chalky');
    engine.dispatch({ type: 'setNote', entryId: 'mat.marl', note: '   ' });
    expect(s().qol.notes['mat.marl']).toBeUndefined(); // blank clears
    engine.dispatch({ type: 'markRead', entryId: 'mat.marl', sig: 2 });
    expect(s().qol.readAt['mat.marl']).toBe(2);
  });
});

describe('auto-refine — a standing rule that only ever converts (pillar 2)', () => {
  it('pushes a low band up toward the target, losing count on the way', () => {
    const { s } = fresh();
    const st = s();
    raiseWreck(st, 'REFINERY'); // Sinter Row, Loam 60 — the wreck IS the gate (A.106)
    expect(refineryUnlocked(st)).toBe(true);
    addMaterial(st, 'marl', 5, 30); // 30 units at the 'poor' floor
    st.qol.refinePresets.push({ materialId: 'marl', toBand: 'good', enabled: true });

    const before = materialCount(st, 'marl');
    tickAutoRefine(st, nullCtx);
    const after = materialCount(st, 'marl');
    expect(after).toBeLessThan(before); // conversion is a strict loss
    expect(after).toBeGreaterThan(0);
  });

  it('does nothing while paused, and nothing when the Refinery is cold', () => {
    const { s } = fresh();
    const st = s();
    addMaterial(st, 'marl', 5, 30);
    // Refinery locked: even an enabled preset is inert.
    st.qol.refinePresets.push({ materialId: 'marl', toBand: 'good', enabled: true });
    tickAutoRefine(st, nullCtx);
    expect(materialCount(st, 'marl')).toBe(30);

    // Open it, but pause the rule.
    st.depthRecords['ferrite'] = 30;
    st.qol.refinePresets[0]!.enabled = false;
    tickAutoRefine(st, nullCtx);
    expect(materialCount(st, 'marl')).toBe(30);
  });
});

describe('number format — a display flag, not game state', () => {
  beforeEach(() => setNumberFormat('suffix'));

  it('suffix is the default and shapes big numbers with K/M', () => {
    expect(fmt(1_250_000)).toBe('1.25M');
  });

  it('scientific and engineering re-shape the SAME value', () => {
    setNumberFormat('scientific');
    expect(fmt(1_250_000)).toBe('1.25e6');
    setNumberFormat('engineering');
    expect(fmt(1_250_000)).toMatch(/e6$/);
    setNumberFormat('suffix');
    expect(fmt(1_250_000)).toBe('1.25M');
  });

  it('leaves values under 1000 plain in every mode', () => {
    for (const m of ['suffix', 'scientific', 'engineering'] as const) {
      setNumberFormat(m);
      expect(fmt(42)).toBe('42');
    }
  });
});
