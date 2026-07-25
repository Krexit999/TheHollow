/**
 * THE SETTLING (A.42) — the idle-only descent aid.
 *
 * The pillar-1 ratio is measured in the sim; these are the structural
 * guarantees the tuning rests on. If any of them breaks, a sim number that
 * looks in-band is measuring something else (see PILLARS.md, "a sim result is
 * a claim until the harness is verified").
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { getCurrency } from '../resources';
import { ModifierCache } from '../modifiers';
import { descend, currentDescendCost, effectiveDescendCost } from '../systems/depthSys';
import {
  SETTLE_TUNING, settleFill, settleRelief, spendSettle, tickSettle,
} from '../systems/settle';
import { runMigrations, SAVE_VERSION } from '../save/migrations';
import { applyOfflineProgress } from '../systems/offline';
import { requiredTier } from '../systems/forge';
import { BAY_DEPTH_UNLOCK } from '../content/shell1/upgrades';
import type { EngineCtx } from '../types';

const nullCtx: EngineCtx = { emit() {}, dirty() {} };
const SHIPPED = { ...SETTLE_TUNING };

function fresh(): { engine: Engine; s: () => GameState } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: () => engine.getState() as GameState };
}

beforeEach(() => Object.assign(SETTLE_TUNING, SHIPPED));
afterEach(() => Object.assign(SETTLE_TUNING, SHIPPED));

describe('the bank fills only on quiet', () => {
  it('does not start until quietSec has passed', () => {
    const { engine, s } = fresh();
    for (let i = 0; i < SETTLE_TUNING.quietSec - 1; i++) tickSettle(s(), 1);
    expect(s().shaft.settle).toBe(0);
    for (let i = 0; i < 10; i++) tickSettle(s(), 1);
    expect(s().shaft.settle).toBeGreaterThan(0);
    void engine;
  });

  it('a hand on the face PAUSES the fill and never burns the bank', () => {
    const { s } = fresh();
    const st = s();
    for (let i = 0; i < SETTLE_TUNING.quietSec + 100; i++) tickSettle(st, 1);
    const banked = st.shaft.settle;
    expect(banked).toBeGreaterThan(0);
    // A chip lands: the quiet clock resets, the bank is untouched.
    st.stats.manualChips += 1;
    tickSettle(st, 1);
    expect(st.shaft.settle).toBe(banked);
    expect(st.shaft.settleQuietSec).toBe(0);
    // And it does not resume until the quiet is re-earned.
    for (let i = 0; i < SETTLE_TUNING.quietSec - 2; i++) tickSettle(st, 1);
    expect(st.shaft.settle).toBe(banked);
  });

  it('a player chipping at any pace under quietSec NEVER banks anything', () => {
    const { s } = fresh();
    const st = s();
    for (let i = 0; i < 3000; i++) {
      if (i % 20 === 0) st.stats.manualChips += 1; // a chip every 20s — far from busy
      tickSettle(st, 1);
    }
    expect(st.shaft.settle).toBe(0);
  });

  it('the bank is capped', () => {
    const { s } = fresh();
    const st = s();
    for (let i = 0; i < SETTLE_TUNING.capSec * 5; i++) tickSettle(st, 1);
    expect(st.shaft.settle).toBe(SETTLE_TUNING.capSec);
    expect(settleFill(st)).toBe(1);
  });
});

describe('the relief has the shape the gap has', () => {
  it('scales with depth — it is a softer BASE, not a flat discount', () => {
    const { s } = fresh();
    const st = s();
    st.shaft.settle = SETTLE_TUNING.capSec;
    // The whole point: the relief compounds per depth the way the cost does.
    expect(settleRelief(st, 10)).toBeCloseTo(Math.pow(SETTLE_TUNING.soften, -10), 6);
    expect(settleRelief(st, 40)).toBeLessThan(settleRelief(st, 10));
    expect(settleRelief(st, 100)).toBeLessThan(settleRelief(st, 40));
  });

  it('is proportional to how full the bank is', () => {
    const { s } = fresh();
    const st = s();
    st.shaft.settle = SETTLE_TUNING.capSec / 2;
    expect(settleRelief(st, 40)).toBeCloseTo(Math.pow(SETTLE_TUNING.soften, -20), 6);
    st.shaft.settle = 0;
    expect(settleRelief(st, 40)).toBe(1);
  });

  it('never goes below the floor — the deep end is cheaper, never free', () => {
    const { s } = fresh();
    const st = s();
    st.shaft.settle = SETTLE_TUNING.capSec;
    expect(settleRelief(st, 400)).toBe(SETTLE_TUNING.floor);
    expect(settleRelief(st, 4000)).toBe(SETTLE_TUNING.floor);
  });

  it('is exactly 1 with the aid off, so the baseline arm is the old curve', () => {
    const { s } = fresh();
    const st = s();
    st.shaft.settle = SETTLE_TUNING.capSec;
    SETTLE_TUNING.soften = 1;
    SETTLE_TUNING.floor = 1;
    for (const d of [1, 40, 150, 400]) expect(settleRelief(st, d)).toBe(1);
  });
});

describe('the bank is spent where it was used', () => {
  it('a deep step (big relief) empties it; a shallow one barely touches it', () => {
    const { s } = fresh();
    const st = s();
    st.shaft.settle = SETTLE_TUNING.capSec;
    spendSettle(st, 0.95); // a shallow step: 5% of the settling cashed
    expect(st.shaft.settle).toBeCloseTo(SETTLE_TUNING.capSec * 0.95, 6);
    st.shaft.settle = SETTLE_TUNING.capSec;
    spendSettle(st, 0.02); // a deep step: nearly all of it
    expect(st.shaft.settle).toBeCloseTo(SETTLE_TUNING.capSec * 0.02, 6);
  });

  it('a real descent charges the relieved price and then spends the bank', () => {
    const { engine, s } = fresh();
    const st = s();
    const mods = new ModifierCache();
    st.depth = 30;
    st.shaft.reached = 30;
    st.shaft.settle = SETTLE_TUNING.capSec;
    const relief = settleRelief(st, 31);
    expect(relief).toBeLessThan(0.5); // the aid is doing real work at depth 31
    const full = currentDescendCost(st, mods);
    expect(effectiveDescendCost(st, mods).toNumber()).toBeCloseTo(full.toNumber() * relief, 6);
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e9 });
    const before = getCurrency(st, 'dust');
    const r = descend(st, mods, nullCtx);
    expect(r.ok).toBe(true);
    const paid = before.sub(getCurrency(st, 'dust')).toNumber();
    expect(paid).toBeCloseTo(full.toNumber() * relief, 0);
    expect(st.shaft.settle).toBeLessThan(SETTLE_TUNING.capSec * 0.5);
  });

  it('a FREE re-tread spends nothing — no rock moved, no settling cashed', () => {
    const { s } = fresh();
    const st = s();
    const mods = new ModifierCache();
    st.depth = 5;
    st.shaft.reached = 30; // already cleared to 30 this run
    st.shaft.settle = SETTLE_TUNING.capSec;
    expect(effectiveDescendCost(st, mods).toNumber()).toBe(0);
    const r = descend(st, mods, nullCtx);
    expect(r.ok).toBe(true);
    expect(st.shaft.settle).toBe(SETTLE_TUNING.capSec);
  });
});

describe('it is not a faucet', () => {
  it('a relieved descent grants no dust and no materials — only a cheaper tap', () => {
    const { engine, s } = fresh();
    const st = s();
    const mods = new ModifierCache();
    st.depth = 25;
    st.shaft.reached = 25;
    st.shaft.settle = SETTLE_TUNING.capSec;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e9 });
    const dropsBefore = st.materials.totalDrops;
    const totalBefore = (st.totals['dust'] ?? getCurrency(st, 'dust')).toNumber();
    descend(st, mods, nullCtx);
    expect(st.materials.totalDrops).toBe(dropsBefore);
    // `totals` only ever RISES on income. A cheaper spend cannot move it.
    expect((st.totals['dust'] ?? getCurrency(st, 'dust')).toNumber()).toBeCloseTo(totalBefore, 6);
  });

  it('an ACTIVE player at the face gets none of it, at any depth', () => {
    const { s } = fresh();
    const st = s();
    st.depth = 60;
    for (let i = 0; i < 7200; i++) {
      st.stats.manualChips += 2; // 2 chips/sec — the sim's active policy
      tickSettle(st, 1);
    }
    expect(st.shaft.settle).toBe(0);
    expect(settleRelief(st, 61)).toBe(1);
  });
});

describe('offline is the purest quiet', () => {
  it('an away stretch banks it, and pillar 3 still holds — no depth advanced', () => {
    const { engine, s } = fresh();
    const st = s();
    st.depth = 20;
    const mods = new ModifierCache();
    const depthBefore = st.depth;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e6 });
    applyOfflineProgress(st, mods, nullCtx, 3600);
    expect(settleFill(st)).toBe(1);
    expect(st.depth).toBe(depthBefore);
  });

  it('a stretch shorter than the quiet threshold banks nothing', () => {
    const { s } = fresh();
    const st = s();
    applyOfflineProgress(st, new ModifierCache(), nullCtx, SETTLE_TUNING.quietSec - 1);
    expect(st.shaft.settle).toBe(0);
  });
});

describe('a structural unlock never gates behind the wall it is needed to cross', () => {
  // The A.42 working rule, made enforceable. The DRILL BAY is what lifts an
  // idle player off the ~10% seepage floor; it unlocked at Loam depth record
  // 55 while the first hardness wall sat at 44, so the system that made the
  // crossing possible was locked behind the crossing. Nothing could see it: it
  // is not a cost, a rate or a formula, and both halves were individually
  // sensible. This asserts the ORDERING, which is the only thing that was ever
  // wrong.
  it('the drill bay opens strictly before Loam’s first hardness wall', () => {
    const { s } = fresh();
    const st = s();
    let firstWall = Infinity;
    for (let d = 1; d <= 150; d++) {
      if (requiredTier(st, d) > 1) { firstWall = d; break; }
    }
    expect(firstWall).toBeLessThan(Infinity); // there IS a wall to be caught by
    expect(BAY_DEPTH_UNLOCK.depth).toBeLessThan(firstWall);
  });

  it('and an idle player can actually reach the gate on seepage alone', () => {
    // A gate below the wall is still wrong if it is out of reach. Depth-record
    // 40 is inside the first hour at the seepage floor (measured, A.42); this
    // pins the intent so a later "just move it a bit deeper" has to argue.
    expect(BAY_DEPTH_UNLOCK.depth).toBeLessThanOrEqual(40);
  });
});

describe('the save carries it', () => {
  it('v23 migrates to a fresh, empty bank', () => {
    const payload = runMigrations({
      version: 23,
      state: { shaft: { reached: 12, rail: {}, scars: [] } },
    } as never);
    expect(payload.version).toBe(SAVE_VERSION);
    const shaft = (payload.state as Record<string, Record<string, unknown>>)['shaft']!;
    expect(shaft['settle']).toBe(0);
    expect(shaft['settleChips']).toBe(0);
    expect(shaft['settleQuietSec']).toBe(0);
    expect(shaft['reached']).toBe(12); // and does not disturb what was there
  });
});
