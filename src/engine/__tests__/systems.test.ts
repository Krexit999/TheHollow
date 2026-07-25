import { describe, expect, it } from 'vitest';
import { D } from '../decimal';
import { createEngine } from '../index';
import { newDrill } from '../systems/drills';
import { KILN_DUST_PER_BRICK } from '../systems/kiln';
import type { GameState } from '../types';
import { xpToLevel } from '../prestigeMath';

describe('the kiln', () => {
  it('conserves dust: consumed * efficiency = progress + bricks fired', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.kiln.built = true;
    s.kiln.feeding = true;
    s.kiln.heat = 1; // fully stoked: efficiency = 1, and it stays at 1 while fed
    // EMPTY THE FACE FIRST. `consumed` below is a NET dust change, so any income
    // arriving during the window is counted as kiln intake that never happened.
    // A fresh face starts at cap, so seepage was paying into the same purse the
    // kiln was eating from — inside the 25-dust slack at SEEP_EFFICIENCY 0.10
    // and outside it at 0.15, which is how a test that had always measured the
    // wrong thing finally said so. Cells below cap cannot overflow, so this
    // isolates the converter, which is what the test is about.
    s.face.cells.fill(0);
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 10_000 });
    const dustBefore = s.currencies['dust']!;
    engine.tick(60);
    const consumed = dustBefore.sub(s.currencies['dust']!);
    expect(consumed.gt(0)).toBe(true);
    // brickYield achievements can floor a little off; allow 1 brick of slack.
    const accounted = s.kiln.progress.add(s.stats.bricksFired.mul(KILN_DUST_PER_BRICK));
    expect(accounted.sub(consumed).abs().toNumber()).toBeLessThan(KILN_DUST_PER_BRICK);
    expect(s.currencies['brick']!.gte(1)).toBe(true);
  });

  it('a cold kiln converts at only 25% efficiency', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.kiln.built = true;
    s.kiln.feeding = true;
    s.kiln.heat = 0;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e6 });
    engine.tick(0.1); // one step, before heat climbs meaningfully
    // 2 dust/s * 0.1s * ~0.25 eff
    expect(s.kiln.progress.toNumber()).toBeCloseTo(0.05, 2);
  });

  it('starves gracefully when dust runs out', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.kiln.built = true;
    s.kiln.feeding = true;
    s.kiln.heat = 1;
    // Drain the face so nothing seeps: cells below cap produce no overflow.
    s.face.cells.fill(0);
    engine.tick(30);
    expect(s.currencies['dust']!.toNumber()).toBe(0);
    expect(s.kiln.heat).toBeLessThan(1); // banking down
  });
});

describe('drills', () => {
  it('harvest is bounded by what the field holds (pillar 2)', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.drills.bayBuilt = true;
    for (let i = 0; i < 24; i++) s.drills.units.push(newDrill());
    engine.dispatch({ type: 'debug', op: 'warp', seconds: 3600 }); // live-stepped hour
    // Total charge extracted can never exceed initial store + regen budget.
    // The 'Brimming' achievement (+3% regen) unlocks during the warp — the
    // ceiling itself may lift, but extraction stays bounded by it.
    const budget = 288 + 36 * 0.08 * 1.03 * 3600;
    expect(s.stats.totalChargeChipped.toNumber()).toBeLessThanOrEqual(budget + 1e-6);
    expect(s.stats.totalChargeChipped.toNumber()).toBeGreaterThan(budget * 0.9);
  });

  it('all four behaviors strike and earn', () => {
    for (const behavior of ['fullest', 'sweep', 'random', 'chain'] as const) {
      const engine = createEngine({ nowMs: 0 });
      const s = engine.getState() as GameState;
      s.drills.bayBuilt = true;
      const drill = newDrill();
      drill.behavior = behavior;
      s.drills.units.push(drill);
      engine.tick(30);
      expect(s.stats.drillStrikes).toBeGreaterThan(0);
      expect(s.currencies['dust']!.gt(0)).toBe(true);
    }
  });
});

describe('collapse', () => {
  function atDepth(depth: number) {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.depth = depth;
    s.maxDepthRecord = depth;
    s.upgrades['blade'] = 20;
    s.upgrades['soil'] = 10;
    s.kiln.built = true;
    s.kiln.heat = 0.9;
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 5000 });
    engine.dispatch({ type: 'debug', op: 'grant', currency: 'brick', amount: 50 });
    return { engine, s };
  }

  it('refuses above depth 26 (no cores)', () => {
    const { engine } = atDepth(20);
    expect(engine.dispatch({ type: 'collapse' }).ok).toBe(false);
  });

  it('grants cores, wipes face upgrades + shell currencies + depth', () => {
    const { engine, s } = atDepth(40);
    const result = engine.dispatch({ type: 'collapse' });
    expect(result.ok).toBe(true);
    expect(s.currencies['core']!.toNumber()).toBe(2);
    expect(s.upgrades['blade']).toBe(0);
    expect(s.currencies['dust']!.toNumber()).toBe(0);
    expect(s.currencies['brick']!.toNumber()).toBe(0);
    expect(s.depth).toBe(0);
    expect(s.maxDepthRecord).toBe(40); // the record survives everything
    expect(s.kiln.built).toBe(true); // structures persist
    expect(s.kiln.heat).toBe(0); // ...but the fire dies (no Ember Memory)
    expect(s.face.cells.every((c) => c === 8)).toBe(true); // fresh full face
  });

  it('Momentum retains face-upgrade levels; Ember Memory keeps heat', () => {
    const { engine, s } = atDepth(40);
    s.collapse.nodes['momentum'] = 2; // retain up to 8 levels
    s.collapse.nodes['emberMemory'] = 5; // keep 50% heat
    engine.dispatch({ type: 'collapse' });
    expect(s.upgrades['blade']).toBe(8);
    expect(s.upgrades['soil']).toBe(8);
    expect(s.kiln.heat).toBeCloseTo(0.45, 5);
  });

  it('core node purchases follow the 2 * 1.55^n curve', () => {
    const { engine, s } = atDepth(200); // 22 cores
    engine.dispatch({ type: 'collapse' });
    expect(s.currencies['core']!.toNumber()).toBe(22);
    expect(engine.dispatch({ type: 'buyCoreNode', id: 'grit' }).ok).toBe(true);
    expect(s.currencies['core']!.toNumber()).toBe(20); // cost 2
    expect(engine.dispatch({ type: 'buyCoreNode', id: 'grit' }).ok).toBe(true);
    expect(s.currencies['core']!.toNumber()).toBeCloseTo(20 - 3.1, 5); // cost 2*1.55
    expect(s.collapse.nodes['grit']).toBe(2);
  });
});

describe('delver xp', () => {
  it('levels follow xpToLevel and award skill points (+3 every 10th)', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    expect(s.delver.level).toBe(1);
    expect(s.delver.skillPoints).toBe(1);
    // Grant exactly enough XP to reach level 10 from 1.
    let need = D(0);
    for (let l = 2; l <= 10; l++) need = need.add(xpToLevel(l));
    s.delver.xp = need; // xp sits ungranted; trigger a grant of 0.001 via chip
    engine.dispatch({ type: 'chip', cell: 0 });
    expect(s.delver.level).toBe(10);
    // 1 (start) + 9 levels + 3 (level 10 bonus) = 13, plus nothing else.
    expect(s.delver.skillPoints).toBe(13);
  });

  it('skill nodes spend points, respec refunds everything', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.delver.skillPoints = 5;
    expect(engine.dispatch({ type: 'buySkillNode', id: 'sharpenedEdge' }).ok).toBe(true);
    expect(engine.dispatch({ type: 'buySkillNode', id: 'scholar' }).ok).toBe(true);
    expect(s.delver.skillPoints).toBe(3);
    // A deeper-shell node is refused until you have breached to it (was a
    // permanently-sealed stub; now a real node gated by unlockBreach).
    expect(s.shell.breachCount).toBe(0);
    expect(engine.dispatch({ type: 'buySkillNode', id: 'veinMemory' }).ok).toBe(false);
    engine.dispatch({ type: 'respecSkills' });
    expect(s.delver.skillPoints).toBe(5);
    expect(Object.keys(s.delver.skills)).toHaveLength(0);
  });
});
