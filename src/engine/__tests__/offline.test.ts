import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { newDrill } from '../systems/drills';
import type { GameState } from '../types';

describe('offline calculation', () => {
  it('without drills, cells fill and full cells SEEP a thin trickle (pillar 1 floor)', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    for (let i = 0; i < 36; i++) engine.dispatch({ type: 'chip', cell: i });
    const result = engine.dispatch({ type: 'applyOffline', seconds: 3600 });
    expect(result.ok).toBe(true);
    expect(s.face.cells.every((c) => Math.abs(c - 8) < 1e-9)).toBe(true);
    expect(s.offline!.chargeFilled).toBeCloseTo(288, 2);
    // Thin, never absent: 10% of post-fill regen, at offline efficiency —
    // strictly positive, strictly under the drill-harvest ceiling.
    expect(s.offline!.dust.gt(0)).toBe(true);
    const fullRate = 2.88 * 3600 * 0.55;
    expect(s.offline!.dust.toNumber()).toBeLessThan(fullRate * 0.15);
  });

  it('drill income is regen-capped and efficiency-scaled (pillar 2 + 3)', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.drills.bayBuilt = true;
    // 6 level-0 drills: throughput 6 * (2 / 2.0s) = 6 charge/s > ceiling 2.88.
    for (let i = 0; i < 6; i++) s.drills.units.push(newDrill());
    s.currencies['dust'] = s.currencies['dust']!.add(0); // touch nothing else
    engine.dispatch({ type: 'applyOffline', seconds: 3600 });
    // min(6, 36*0.08=2.88) * 3600 * 0.55 * Y(=1) = 5702.4
    expect(s.offline!.dust.toNumber()).toBeCloseTo(2.88 * 3600 * 0.55, 0);
    expect(s.offline!.efficiency).toBeCloseTo(0.55, 6);
  });

  it('Persistence raises efficiency: 0.55 + 0.03/level, capped at 0.95', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.collapse.nodes['persistence'] = 5;
    s.drills.bayBuilt = true;
    s.drills.units.push(newDrill());
    engine.dispatch({ type: 'applyOffline', seconds: 1000 });
    expect(s.offline!.efficiency).toBeCloseTo(0.7, 6);
  });

  it('depth never advances offline', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.depth = 10;
    engine.dispatch({ type: 'applyOffline', seconds: 86400 * 30 }); // a month
    expect(s.depth).toBe(10);
  });

  it('uncapped duration: a year resolves instantly and sanely', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.drills.bayBuilt = true;
    for (let i = 0; i < 24; i++) s.drills.units.push(newDrill());
    const start = performance.now();
    engine.dispatch({ type: 'applyOffline', seconds: 86400 * 365 });
    expect(performance.now() - start).toBeLessThan(50); // closed-form, no loop
    // ceiling 2.88 charge/s * 1yr * 0.55 — finite, no cap applied
    expect(s.offline!.dust.toNumber()).toBeCloseTo(2.88 * 86400 * 365 * 0.55, -3);
  });

  it('a huge tick() catch-up routes the overflow through offline math (no spiral)', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.drills.bayBuilt = true;
    s.drills.units.push(newDrill());
    const start = performance.now();
    engine.tick(3600); // e.g. a throttled tab waking up after an hour
    expect(performance.now() - start).toBeLessThan(2000);
    // 300s (budget) stepped live, the remaining 3300s resolved as offline.
    expect(s.offline).not.toBeNull();
    expect(s.offline!.seconds).toBeCloseTo(3300, 0);
  });

  it('hydrate computes offline gains from lastSavedAt', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.drills.bayBuilt = true;
    s.drills.units.push(newDrill());
    s.stats.lastSavedAt = 1_000_000;
    const engine2 = createEngine({ nowMs: 0 });
    engine2.dispatch({ type: 'hydrate', state: s, nowMs: 1_000_000 + 7200_000 });
    const s2 = engine2.getState();
    expect(s2.offline).not.toBeNull();
    expect(s2.offline!.seconds).toBeCloseTo(7200, 3);
    expect(s2.offline!.dust.gt(0)).toBe(true);
    expect(s2.stats.lastSavedAt).toBe(1_000_000 + 7200_000);
  });
});
