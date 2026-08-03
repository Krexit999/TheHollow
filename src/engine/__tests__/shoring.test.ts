/**
 * SHORING AND DRIFTS (§9.4) — what the Collapse fast-forward must be true of.
 *
 *   1  the rig is a PLACE you walked to, then a price (LAW 9, no toll)
 *   2  a band costs what descending it costs, three times over — and the
 *      payback is the number, not a hand-sized constant
 *   3  DRIFTS CHAIN: a timbered band with an untimbered one above it is a
 *      tunnel with no way into it and moves the fall by nothing
 *   4  the fall: a Collapse starts the run at the bottom of your own tunnel,
 *      instantly and free
 *   5  THE PRICE (§1.1): a shored band does not re-roll, while every unshored
 *      band around it does — and un-shoring gives the re-roll back, expensively
 *   6  PILLAR 2 — `dpsMax` at the SAME depth is untouched by any of it
 *   7  A DRIFT IS NOT AN ACHIEVEMENT: Collapse -> fall -> Collapse pays zero
 *      Cores, which is the one way this could have broken the ladder
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { D } from '../decimal';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { descendCost } from '../prestigeMath';
import { KILN_DUST_PER_BRICK } from '../systems/kiln';
import { contentsOf, ensureRoll, rerollRoll, shellRoll } from '../systems/roll';
import { doCollapse } from '../systems/collapseSys';
import { descend } from '../systems/depthSys';
import { shaftPeak } from '../systems/shaftSys';
import { getCurrency } from '../resources';
import {
  SHORE_PAYBACK, bandOf, bands, driftDepth, fallThroughDrifts, isShored,
  recoverFraction, rigFound, shoreBand, shoreBlocker, shoreCost, shoringUnlocked,
  strandedDrifts, unshoreBand,
} from '../systems/shoring';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;
let s: GameState;
let mods: ModifierCache;

/** A part on the rack, the shape `casting.rack` holds. */
function part(id: string, purity = 50) {
  return { id, materialId: 'marl', shape: 'head', purity, traits: [] } as never;
}

/** A player standing at the bottom of Loam with the rig raised and stock in hand. */
function rigged(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  ensureRoll(st);
  st.depthRecords['loam'] = 150;
  st.roll!.looted.push('shoringdeep');
  st.roll!.rig = true;
  st.currencies['brick'] = D('1e12');
  st.casting.rack = Array.from({ length: 40 }, (_, i) => part(`p${i}`, i));
  return st;
}

beforeEach(() => {
  s = rigged();
  mods = new ModifierCache();
  mods.invalidate();
});

describe('the fixture is real', () => {
  it('Loam authors a rig station, and it is Shoring Deep', () => {
    const def = shellRoll(s).find((d) => d.wreck === 'SHORING RIG');
    expect(def?.id).toBe('shoringdeep');
    expect(def?.depth).toBe(120);
  });

  it('every band is the stretch above its own station, and none is empty', () => {
    const bs = bands(s);
    expect(bs.length).toBeGreaterThan(10);
    for (const b of bs) {
      expect(b.to).toBeGreaterThan(b.from);
      expect(b.to).toBe(b.def.depth);
    }
    // The Turnrow sits at depth 0 and therefore has no band to timber.
    expect(bs.some((b) => b.def.id === 'turnrow')).toBe(false);
  });
});

describe('1 — the rig is a place, then a price (LAW 9)', () => {
  it('a player who has not walked to the wreck has no shoring at all', () => {
    const fresh = createEngine({ nowMs: 0 }).getState() as GameState;
    expect(rigFound(fresh)).toBe(false);
    expect(shoringUnlocked(fresh)).toBe(false);
    expect(driftDepth(fresh)).toBe(0);
  });

  it('looting the wreck is not the rig — it still has to be raised', () => {
    const st = createEngine({ nowMs: 0 }).getState() as GameState;
    ensureRoll(st);
    st.roll!.looted.push('shoringdeep');
    expect(rigFound(st)).toBe(true);
    expect(shoringUnlocked(st)).toBe(false);
    expect(shoreBlocker(st, 'kilnyard')).toBe('The Shoring Rig is not standing.');
  });

  it('and you cannot shore ahead of yourself', () => {
    s.depthRecords['loam'] = 40;
    expect(shoreBlocker(s, 'ashfall')).toBe('You have not been down there yet.');
    expect(shoreBlocker(s, 'kilnyard')).toBeNull();
  });
});

describe('2 — a band costs what descending it costs, three times over', () => {
  it('the price is derived from the descent curve, not authored', () => {
    const band = bandOf(s, 'ashfall')!;  // 61..72
    let dust = D(0);
    for (let d = band.from + 1; d <= band.to; d++) dust = dust.add(descendCost(d));
    const want = dust.mul(SHORE_PAYBACK).div(KILN_DUST_PER_BRICK).ceil();
    expect(shoreCost(s, 'ashfall')!.brick.toString()).toBe(want.toString());
  });

  it('...so it pays for itself on the third Collapse, at every depth', () => {
    for (const id of ['kilnyard', 'marlgate', 'ashfall', 'shoringdeep']) {
      const band = bandOf(s, id)!;
      let dust = D(0);
      for (let d = band.from + 1; d <= band.to; d++) dust = dust.add(descendCost(d));
      const brick = shoreCost(s, id)!.brick;
      // EXACTLY three walks, then ceil to a whole Brick — asserted as that
      // rather than as a tolerance, because on a cheap band one Brick of
      // rounding is a whole percent and a tolerance would have to be loose
      // enough there to stop meaning anything on a dear one.
      const want = dust.mul(SHORE_PAYBACK).div(KILN_DUST_PER_BRICK);
      expect(brick.gte(want), id).toBe(true);
      expect(brick.sub(1).lt(want), id).toBe(true);
    }
  });

  it('and it takes cast parts off the rack, cheapest first', () => {
    const before = s.casting.rack!.length;
    const cost = shoreCost(s, 'kilnyard')!;
    expect(shoreBand(s, ctx, 'kilnyard').ok).toBe(true);
    expect(s.casting.rack!.length).toBe(before - cost.parts);
    // The cheapest were taken: the survivors are all dearer than what went.
    expect(Math.min(...s.casting.rack!.map((p) => p.purity ?? 0))).toBe(cost.parts);
  });

  it('a rack that is short refuses, and takes nothing', () => {
    s.casting.rack = [];
    const brick = getCurrency(s, 'brick').toString();
    expect(shoreBand(s, ctx, 'kilnyard').ok).toBe(false);
    expect(isShored(s, 'kilnyard')).toBe(false);
    expect(getCurrency(s, 'brick').toString()).toBe(brick);
  });
});

describe('3 — drifts chain', () => {
  it('one timbered band at the top moves the fall to its own depth', () => {
    shoreBand(s, ctx, 'kilnyard');   // 0..9
    expect(driftDepth(s)).toBe(9);
  });

  it('a band with an untimbered one above it moves the fall by NOTHING', () => {
    shoreBand(s, ctx, 'ashfall');    // 61..72, nothing above it
    expect(driftDepth(s)).toBe(0);
    expect(strandedDrifts(s).map((b) => b.def.id)).toEqual(['ashfall']);
  });

  it('and buying the gap joins them into one fall', () => {
    for (const id of ['kilnyard', 'sag']) shoreBand(s, ctx, id);
    expect(driftDepth(s)).toBe(17);          // The Sag
    expect(strandedDrifts(s)).toEqual([]);
    shoreBand(s, ctx, 'undersill');          // 18..28
    expect(driftDepth(s)).toBe(28);
  });
});

describe('4 — the fall', () => {
  it('a Collapse starts the run at the bottom of the chain, not at the surface', () => {
    for (const id of ['kilnyard', 'sag', 'undersill']) shoreBand(s, ctx, id);
    s.depth = 140;
    s.shaft.reached = 140;
    doCollapse(s, mods, ctx);
    expect(s.depth).toBe(28);
    expect(s.shaft.reached).toBe(28);
    expect(s.shaft.drift).toBe(28);
  });

  it('...and with no drifts it starts where it always did', () => {
    const bare = createEngine({ nowMs: 0 }).getState() as GameState;
    bare.depth = 40;
    bare.shaft.reached = 40;
    doCollapse(bare, mods, ctx);
    expect(bare.depth).toBe(0);
    expect(bare.shaft.drift).toBe(0);
  });

  it('walking down to a band timbered MID-RUN is free, and pays no XP', () => {
    for (const id of ['kilnyard', 'sag']) shoreBand(s, ctx, id);
    s.depth = 0;
    s.shaft.reached = 0;
    s.shaft.drift = 0;
    const dust = getCurrency(s, 'dust').toString();
    const xp = s.delver.xp.toString();
    const descents = s.stats.descents;
    for (let i = 0; i < 17; i++) expect(descend(s, mods, ctx).ok).toBe(true);
    expect(s.depth).toBe(17);
    expect(getCurrency(s, 'dust').toString()).toBe(dust);
    expect(s.delver.xp.toString()).toBe(xp);
    expect(s.stats.descents).toBe(descents);
  });

  it('and the FIRST step past the drift pays in full, in dust and in XP', () => {
    for (const id of ['kilnyard', 'sag']) shoreBand(s, ctx, id);
    fallThroughDrifts(s, ctx);
    s.currencies['dust'] = D('1e12');
    const xp = s.delver.xp;
    const before = getCurrency(s, 'dust');
    expect(descend(s, mods, ctx).ok).toBe(true);
    expect(s.depth).toBe(18);
    expect(before.sub(getCurrency(s, 'dust')).gt(0)).toBe(true);
    expect(s.delver.xp.gt(xp)).toBe(true);
  });
});

describe('5 — THE PRICE: a shored band does not re-roll (§1.1)', () => {
  it('the shored band holds still while every band around it turns over', () => {
    shoreBand(s, ctx, 'kilnyard');
    const frozen = contentsOf(s, 'kilnyard');
    const before = { seam: frozen.seam, feature: frozen.feature };
    // Enough falls that an unshored station cannot plausibly hold still by luck.
    let moved = 0;
    for (let i = 0; i < 40; i++) {
      const sagBefore = { ...contentsOf(s, 'sag') };
      rerollRoll(s, () => Math.random());
      const now = contentsOf(s, 'kilnyard');
      expect(now.seam, 'a shored band re-rolled').toBe(before.seam);
      expect(now.feature).toBe(before.feature);
      const sagNow = contentsOf(s, 'sag');
      if (sagNow.seam !== sagBefore.seam || sagNow.feature !== sagBefore.feature) moved += 1;
    }
    expect(moved, 'the unshored control never moved — the test proves nothing').toBeGreaterThan(20);
  });

  it('pulling the props costs the same again and gives the re-roll back', () => {
    shoreBand(s, ctx, 'kilnyard');
    const cost = shoreCost(s, 'kilnyard')!.brick;
    const before = getCurrency(s, 'brick');
    expect(unshoreBand(s, ctx, 'kilnyard').ok).toBe(true);
    expect(before.sub(getCurrency(s, 'brick')).toString()).toBe(cost.toString());
    expect(isShored(s, 'kilnyard')).toBe(false);
    // And the parts do not come back — "expensively" (§8).
    let moved = 0;
    for (let i = 0; i < 40; i++) {
      const b = { ...contentsOf(s, 'kilnyard') };
      rerollRoll(s, () => Math.random());
      const n = contentsOf(s, 'kilnyard');
      if (n.seam !== b.seam || n.feature !== b.feature) moved += 1;
    }
    expect(moved).toBeGreaterThan(20);
  });

  it('un-shoring a band you never shored refuses', () => {
    expect(unshoreBand(s, ctx, 'ashfall').ok).toBe(false);
  });
});

describe('6 — PILLAR 2: a drift is reach, never output', () => {
  it('dpsMax is identical at the SAME depth, drifts chained and none', () => {
    const read = (shore: boolean): number => {
      const st = rigged();
      if (shore) for (const id of ['kilnyard', 'sag', 'undersill', 'lampline', 'marlgate']) shoreBand(st, ctx, id);
      st.depth = 28; // THE SAME DEPTH IN BOTH ARMS — Depth Pressure is a yield term
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });

  it('and the drift really is chained — not a vacuous comparison', () => {
    for (const id of ['kilnyard', 'sag', 'undersill', 'lampline', 'marlgate']) shoreBand(s, ctx, id);
    expect(driftDepth(s)).toBe(40);
  });
});

describe('7 — a drift is not an achievement', () => {
  it('Collapse -> fall -> Collapse pays ZERO Cores', () => {
    for (const id of ['kilnyard', 'sag', 'undersill', 'lampline', 'marlgate']) shoreBand(s, ctx, id);
    s.depth = 150;
    s.shaft.reached = 150;
    doCollapse(s, mods, ctx);          // pays on 150, lands at 40
    const cores = getCurrency(s, 'core');
    expect(s.depth).toBe(40);
    doCollapse(s, mods, ctx);          // covered nothing
    expect(getCurrency(s, 'core').toString()).toBe(cores.toString());
    expect(shaftPeak(s)).toBe(0);
  });

  it('...and one step past the drift pays exactly what it always paid', () => {
    for (const id of ['kilnyard', 'sag', 'undersill', 'lampline', 'marlgate']) shoreBand(s, ctx, id);
    fallThroughDrifts(s, ctx);
    s.currencies['dust'] = D('1e12');
    descend(s, mods, ctx);
    expect(s.depth).toBe(41);
    expect(shaftPeak(s)).toBe(41);
  });

  it('a player with no rig reads shaftPeak exactly as before', () => {
    const bare = createEngine({ nowMs: 0 }).getState() as GameState;
    bare.depth = 37;
    bare.shaft.reached = 37;
    expect(shaftPeak(bare)).toBe(37);
    // ...and so does a save from before `drift` existed.
    delete (bare.shaft as { drift?: number }).drift;
    expect(shaftPeak(bare)).toBe(37);
  });
});

describe('the measurement §9.4 exists for', () => {
  it('re-cover is the share of a run at or below the record it started with', () => {
    expect(recoverFraction(100, 120, 0)).toBeCloseTo(100 / 120);
    // A drift to 100 removes all of it.
    expect(recoverFraction(100, 120, 100)).toBe(0);
    // A drift to 40 removes its own share and no more.
    expect(recoverFraction(100, 120, 40)).toBeCloseTo(60 / 120);
    // A first run has covered no ground twice.
    expect(recoverFraction(0, 40, 0)).toBe(0);
  });
});
