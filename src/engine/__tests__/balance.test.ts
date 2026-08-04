/**
 * THE BALANCE — TRANSMUTATION (§14.4, §13), A.91.
 *
 *   0  the ledger is a claim: `transmute` already exists and is a DIFFERENT
 *      machine — the Reaction Bench's A+B->C, not §14.4's anything-to-anything
 *   1  the place, then the price, and tiers as capability
 *   2  THE LOSS IS THE WHOLE DESIGN — no cycle anywhere in the graph gains
 *   3  tier II is the "only route back": it reaches a shell you have left
 *   4  the worth ledger, and the Assay Call hook that is NOT wired
 *   5  PILLAR 2
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { MATERIALS, materialDef } from '../materials';
import { addMaterial, materialCount } from '../systems/forge';
import { markReached } from '../systems/roll';
import { MAX_MACHINE_TIER, tierOf } from '../systems/plant';
import { ensureCondition } from '../systems/condition';
import { transmute } from '../systems/refinery';
import {
  BALANCE_RATE, BAND_WORTH, balanceBlocker, balanceBuilt, balanceFound, balancePreview,
  balanceRate, balanceStation, buildBalance, convert, crossesShells, ensureBalance,
  ledgerKnows, worth,
} from '../systems/balance';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;

function racked(st: GameState, n: number): GameState {
  st.casting.rack = Array.from({ length: n }, (_, i) =>
    ({ id: 4000 + i, materialId: 'silicash', type: 'head', purity: 50 } as never));
  st.casting.nextId = 4000 + n;
  return st;
}

/** A player who has walked Glassmere — the Balance House is Glassmere's. */
function walked(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'glassmere';
  markReached(st, 380, 15);
  return racked(st, 24);
}

function withBalance(tier = 1): GameState {
  const st = walked();
  for (let i = 0; i < tier; i++) buildBalance(st, ctx);
  return st;
}

describe('0 — the ledger is a claim: `transmute` is a DIFFERENT machine', () => {
  it('the Reaction Bench makes A+B into an authored C; the Balance makes anything', () => {
    // §17's bench is a CHAIN lookup — two named inputs, one authored output,
    // and a miss pays slag. §14.4's Balance has no recipe at all: one hidden
    // worth per material, and any pair is legal at a loss. Both exist, and the
    // word "transmute" was already taken by the wrong one.
    expect(typeof transmute).toBe('function');
    const st = withBalance(1);
    for (let i = 0; i < 40; i++) addMaterial(st, 'silicash', 60);
    // No chain exists between these two, and the Balance does not care.
    expect(balanceBlocker(st, 'silicash', 'frostsand', 20)).toBeNull();
  });
});

describe('1 — the place, then the price (§6, §15.4)', () => {
  it('it is at The Balance House 130 in Glassmere, exactly where §6 puts it', () => {
    expect(balanceStation()).toEqual({ shellId: 'glassmere', depth: 130, name: 'The Balance House' });
  });

  it('a player who has not been there cannot raise it', () => {
    const st = racked(createEngine({ nowMs: 0 }).getState() as GameState, 24);
    expect(balanceFound(st)).toBe(false);
    expect(buildBalance(st, ctx).reason).toContain('The Balance House');
  });

  it('the ladder is §14.4\'s own numbers: 60% lost, improving to 35%', () => {
    expect(BALANCE_RATE).toEqual([0, 0.40, 0.50, 0.65]);
    expect(balanceRate(withBalance(1))).toBe(0.40);
    expect(balanceRate(withBalance(2))).toBe(0.50);
    const three = withBalance(3);
    expect(balanceRate(three)).toBe(0.65);
    expect(tierOf(three, 'balance')).toBe(MAX_MACHINE_TIER);
    // ...and NEVER one, at any tier.
    for (const r of BALANCE_RATE) expect(r).toBeLessThan(1);
  });

  it('and it is built from cast parts, remembering what it was cast from', () => {
    const st = walked();
    expect(balanceBuilt(st)).toBe(false);
    expect(buildBalance(st, ctx).ok).toBe(true);
    expect(st.plant!.builtOf!['balance']).toContain('silicash');
  });

  it('a cracked Balance will not run — E2 reaches it like every machine', () => {
    const st = withBalance(1);
    for (let i = 0; i < 40; i++) addMaterial(st, 'silicash', 60);
    expect(balanceBlocker(st, 'silicash', 'frostsand', 20)).toBeNull();
    ensureCondition(st)['balance'] = { id: 'baked', level: 1, seized: true };
    expect(balanceBlocker(st, 'silicash', 'frostsand', 20)).toContain('cracked');
  });
});

// ---------------------------------------------------------------------------
// 2 — THE LOAD-BEARING ONE
// ---------------------------------------------------------------------------

/**
 * "IF IT CONVERTS WITHOUT LOSS IT IS A FAUCET AND IT FAILS." The guarantee is
 * an inequality, so it is tested as one — over every ordered pair of ordinary
 * materials in the game, at the BEST tier, which is the only place a leak
 * could hide.
 */
describe('2 — no cycle anywhere in the graph gains', () => {
  it('A -> B -> A returns strictly fewer units, for EVERY pair, at tier III', () => {
    const st = withBalance(3);
    const ids = MATERIALS.filter((m) => !m.worked && !m.source).map((m) => m.id);
    expect(ids.length).toBeGreaterThan(80);
    const rate = balanceRate(st);
    let checked = 0;
    const leaks: string[] = [];
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        checked += 1;
        // 1000 units in, so rounding cannot be what saves the invariant.
        const there = balancePreview(st, a, b, 1000).out;
        const back = there > 0 ? balancePreview(st, b, a, there).out : 0;
        if (back >= 1000) leaks.push(`${a}->${b}->${a} = ${back}`);
      }
    }
    expect(checked).toBeGreaterThan(6000);
    expect(leaks.slice(0, 5), `${leaks.length} round trips gained`).toEqual([]);
    // And the reason, stated: every edge multiplies by the rate, so a round
    // trip multiplies by rate squared — 0.42 at the best tier this ever reaches.
    expect(rate * rate).toBeLessThan(0.5);
  });

  it('a single conversion loses what the preview said it would', () => {
    const st = withBalance(3);
    for (let i = 0; i < 40; i++) addMaterial(st, 'silicash', 60);
    const p = balancePreview(st, 'silicash', 'frostsand', 20);
    expect(p.out).toBeGreaterThan(0);
    const before = materialCount(st, 'silicash');
    const r = convert(st, ctx, 'silicash', 'frostsand', 20);
    expect(r.ok, r.reason).toBe(true);
    expect(before - materialCount(st, 'silicash')).toBe(20);
    expect(materialCount(st, 'frostsand')).toBe(p.out);
    expect(p.out, 'twenty units bought twenty — that is not a loss').toBeLessThan(20);
  });

  it('and it refuses a conversion too small to buy even one, BY NAME', () => {
    const st = withBalance(1);
    addMaterial(st, 'silicash', 60);            // one common
    const r = balanceBlocker(st, 'silicash', 'starlens', 1);   // one flawless
    expect(r).toContain('is not enough for one');
    expect(r).toMatch(/it wants \d+/);
  });

  it('worth rises with the band, and a trait is only a premium on top', () => {
    expect(BAND_WORTH.common).toBeLessThan(BAND_WORTH.rich);
    expect(BAND_WORTH.starred).toBeLessThan(BAND_WORTH.aberrant);
    // A two-trait common is worth less than a bare rich.
    expect(worth('silicash')).toBeLessThan(BAND_WORTH.rich);
    expect(worth('starlens')).toBeGreaterThan(worth('silicash'));
  });
});

// ---------------------------------------------------------------------------
// 3 — THE ONLY ROUTE BACK
// ---------------------------------------------------------------------------

describe('3 — tier II reaches a shell you have left (§14.4)', () => {
  it('tier I refuses a cross-shell conversion and says which shells', () => {
    const st = withBalance(1);
    for (let i = 0; i < 60; i++) addMaterial(st, 'silicash', 60);
    expect(crossesShells(st)).toBe(false);
    const r = balanceBlocker(st, 'silicash', 'marl', 40);
    expect(r).toContain('inside one shell');
    expect(r).toContain('glassmere');
    expect(r).toContain('loam');
  });

  it('tier II takes it — which is the whole "mandatory because"', () => {
    const st = withBalance(2);
    for (let i = 0; i < 60; i++) addMaterial(st, 'silicash', 60);
    expect(crossesShells(st)).toBe(true);
    expect(balanceBlocker(st, 'silicash', 'marl', 40)).toBeNull();
    const r = convert(st, ctx, 'silicash', 'marl', 40);
    expect(r.ok, r.reason).toBe(true);
    expect(materialCount(st, 'marl')).toBeGreaterThan(0);
    expect(materialDef('marl').shellId, 'a Loam stone, made in Glassmere').toBe('loam');
  });
});

// ---------------------------------------------------------------------------
// 4 — THE WORTH LEDGER
// ---------------------------------------------------------------------------

describe('4 — the ledger writes, and the Assay Call hook does NOT', () => {
  it('every conversion is recorded, and so is what it cost', () => {
    const st = withBalance(3);
    for (let i = 0; i < 40; i++) addMaterial(st, 'silicash', 60);
    expect(ledgerKnows(st)).toEqual([]);
    convert(st, ctx, 'silicash', 'frostsand', 20);
    expect(ledgerKnows(st)).toEqual([
      { id: 'silicash', name: materialDef('silicash').name, units: 20 },
    ]);
    expect(ensureBalance(st).lost).toBeGreaterThan(0);
  });

  /**
   * §14.4 also says "worth knowledge feeds the Assay Call". THE WRITING IS
   * BUILT AND THE HOOK IS NOT, deliberately: the Call's weighting is a
   * drop-economy seam, and pointing a second system at it without measuring is
   * how a faucet arrives quietly. Ledgered; asserted here so it cannot be
   * assumed to work.
   */
  it('...and the Call is untouched by it, which is the ledgered cut', () => {
    const st = withBalance(3);
    for (let i = 0; i < 40; i++) addMaterial(st, 'silicash', 60);
    const before = JSON.stringify(st.assay);
    convert(st, ctx, 'silicash', 'frostsand', 20);
    expect(JSON.stringify(st.assay), 'the Balance reached into the Assay Call').toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 5 — PILLAR 2
// ---------------------------------------------------------------------------

describe('5 — PILLAR 2: it trades at a loss and generates nothing', () => {
  it('no currency moves', () => {
    const st = withBalance(3);
    for (let i = 0; i < 40; i++) addMaterial(st, 'silicash', 60);
    const before = JSON.stringify(st.currencies);
    convert(st, ctx, 'silicash', 'frostsand', 20);
    expect(JSON.stringify(st.currencies)).toBe(before);
  });

  it('a conversion is not a find: `totalDrops` does not move', () => {
    const st = withBalance(3);
    for (let i = 0; i < 40; i++) addMaterial(st, 'silicash', 60);
    const drops = st.materials.totalDrops;
    convert(st, ctx, 'silicash', 'frostsand', 20);
    expect(st.materials.totalDrops).toBe(drops);
  });

  it('dpsMax at the SAME depth is identical before and after', () => {
    const read = (run: boolean): number => {
      const st = withBalance(3);
      st.depth = 62; // THE SAME DEPTH IN BOTH ARMS
      for (let i = 0; i < 40; i++) addMaterial(st, 'silicash', 60);
      if (run) convert(st, ctx, 'silicash', 'frostsand', 20);
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });
});
