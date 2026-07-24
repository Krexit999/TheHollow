/**
 * MULTI-DESCEND — batched convenience must cost IDENTICALLY to doing it by hand,
 * the same guarantee the lift makes. descendMany is a loop of single descents,
 * so this is true by construction; these tests lock it against any future
 * "optimisation" that adds a separate, drifting cost path.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { descend, descendMany } from '../systems/depthSys';
import { currentShell } from '../shells';
import { D } from '../decimal';

const ctx = { emit: () => {}, dirty: () => {} };
const mods = new ModifierCache();

/** A Loam state with money and a tool strong enough that walls never intervene. */
function deep(depth = 20): GameState {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.kiln.built = true;
  s.depth = depth;
  s.shaft.reached = depth;
  s.depthRecords['loam'] = depth;
  s.maxDepthRecord = depth;
  s.currencies[currentShell(s).chipCurrencyId] = D(1e15);
  s.forge.tools[s.forge.equipped]!.tier = 15; // never walled
  return s;
}
const chip = (s: GameState) => s.currencies[currentShell(s).chipCurrencyId]!;

describe('multi-descend costs exactly what N single descents cost', () => {
  it('descendMany(5) spends the same and ends at the same depth as 5 taps', () => {
    const byHand = deep(20);
    for (let i = 0; i < 5; i++) expect(descend(byHand, mods, ctx).ok).toBe(true);

    const batched = deep(20);
    const r = descendMany(batched, mods, ctx, 5);
    expect(r.ok).toBe(true);
    expect((r.data as { descended: number }).descended).toBe(5);

    expect(batched.depth).toBe(byHand.depth); // both at 25
    expect(byHand.depth).toBe(25);
    // Exact Decimal equality — not "about the same".
    expect(chip(batched).eq(chip(byHand))).toBe(true);
  });

  it('descents and XP are counted the same, not batched into one', () => {
    const byHand = deep(20);
    const d0 = byHand.stats.descents;
    for (let i = 0; i < 7; i++) descend(byHand, mods, ctx);

    const batched = deep(20);
    descendMany(batched, mods, ctx, 7);

    expect(batched.stats.descents - d0).toBe(byHand.stats.descents - d0);
    expect(batched.stats.descents - d0).toBe(7);
    expect(batched.delver.xp.eq(byHand.delver.xp)).toBe(true);
  });
});

describe('multi-descend stops at a gate, paying only for the steps it took', () => {
  it('stops at the shell floor and never overshoots or overspends', () => {
    const shellFloor = currentShell(deep()).floorDepth;
    const start = shellFloor - 3;
    const byHand = deep(start);
    while (descend(byHand, mods, ctx).ok) { /* to the floor */ }

    const batched = deep(start);
    const r = descendMany(batched, mods, ctx, 1000); // ask for far more than possible
    expect(r.ok).toBe(true);

    expect(batched.depth).toBe(shellFloor);
    expect(batched.depth).toBe(byHand.depth);
    expect(chip(batched).eq(chip(byHand))).toBe(true);
    // A further batch at the floor is a clean refusal, not a throw or a spend.
    const at = chip(batched).toString();
    expect(descendMany(batched, mods, ctx, 5).ok).toBe(false);
    expect(chip(batched).toString()).toBe(at);
  });

  it('stops when the purse runs out, having spent no more than it had', () => {
    const s = deep(20);
    s.currencies[currentShell(s).chipCurrencyId] = D(1e6); // only a few steps' worth
    const r = descendMany(s, mods, ctx, 1000);
    // It got at least one step and never went negative.
    expect(r.ok).toBe(true);
    expect(chip(s).gte(D(0))).toBe(true);
    // The next single descent is unaffordable — the batch drained to the true stop.
    expect(descend(s, mods, ctx).ok).toBe(false);
  });
});
