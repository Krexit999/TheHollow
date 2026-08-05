/**
 * THE BANK — is what a long-lived save is holding actually spendable? (A.98)
 *
 * Every Recursion in this project's history granted an Axiom into
 * `currencies.axiom` while `registerLawContribution` had no callers, so the
 * currency accrued for phases with nothing in the game that could take it.
 * A.97 built the writer. This asks the question that matters to a REAL SAVE:
 *
 *   1. does an old save's bank survive a load, with none of the new slices in it
 *   2. is it spendable, walking the actual route rather than setting a flag
 *   3. what stands between "banked" and "written", said exactly
 *
 * The answers are not obvious. The Engine is a wreck at Aleph 16, `roll` is one
 * of the things a Recursion WASHES, and the bank is one of the five things it
 * KEEPS — so the bank outlives every route to spending it, every time.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { serialize, deserialize } from '../save/codec';
import { D } from '../decimal';
import { AXIOMS } from '../content/axioms';
import { lawFlag, lawNum } from '../laws';
import { markReached } from '../systems/roll';
import { axiomEngineFound, axiomStation, offered, writeBlocker, writeRule } from '../systems/axiomEngine';
import { TIER_PART_COST } from '../systems/plant';
import type { GameState } from '../types';

const ctx = () => ({ emit: () => {}, dirty: () => {} }) as never;

/**
 * A save as it existed BEFORE A.97: Axioms banked and earned, and not one of
 * the slices this phase family added. Damaged the way version drift damages.
 */
function preA97Save(banked: number, recursions: number): string {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.currencies['axiom'] = D(banked);
  s.totals['axiom'] = D(banked);
  s.recursion.count = recursions;
  s.recursion.axiomsEarned = banked;
  const raw = serialize(engine.getState(), 0);
  const payload = JSON.parse(raw);
  // Nothing this phase family added existed in that save.
  for (const slice of ['axiomEngine', 'seats', 'seating', 'spec']) delete payload.state[slice];
  return JSON.stringify(payload);
}

describe('what a long-lived save is holding', () => {
  it('the bank survives a load with none of the new slices present', () => {
    const engine = createEngine({ nowMs: 0 });
    const loaded = deserialize(preA97Save(9, 3));
    expect(engine.dispatch({ type: 'hydrate', state: loaded, nowMs: 0 }).ok).toBe(true);
    const s = engine.getState() as GameState;
    expect(s.currencies['axiom']!.toNumber()).toBe(9);
    expect(s.recursion.axiomsEarned).toBe(9);
    expect(s.recursion.count).toBe(3);
    // ...and the slices self-heal rather than throwing on first read.
    expect(() => offered(s)).not.toThrow();
    expect(offered(s)).toEqual([]);              // no Engine yet, so nothing offered
  });

  it('and it is spendable — walked, not stipulated', () => {
    const engine = createEngine({ nowMs: 0 });
    engine.dispatch({ type: 'hydrate', state: deserialize(preA97Save(9, 3)), nowMs: 0 });
    const s = engine.getState() as GameState;

    // Nothing is written and nothing can be.
    expect(s.recursion.axioms).toEqual([]);
    expect(writeBlocker(s, 'unemptying')).toMatch(/not standing/);

    // THE REAL ROUTE. Stand in Aleph and walk past the wreck — a wreck is looted
    // by being walked into, never by a depth record.
    const at = axiomStation()!;
    expect(at.shellId).toBe('aleph');
    s.shell.current = 'aleph';
    expect(axiomEngineFound(s)).toBe(false);
    markReached(s, at.depth, 15);
    expect(axiomEngineFound(s)).toBe(true);

    // Build it out of cast parts, through the real verb.
    for (let i = 0; i < TIER_PART_COST[1]!; i++) {
      (s.casting.rack as unknown[]).push({
        id: s.casting.nextId++, type: 'core', materialId: 'marl', purity: 50,
      });
    }
    expect(engine.dispatch({ type: 'buildAxiomEngine' }).ok).toBe(true);

    // ...and NOW the bank buys a rule.
    const before = s.currencies['axiom']!.toNumber();
    expect(engine.dispatch({ type: 'writeRule', axiomId: 'unemptying' }).ok).toBe(true);
    const after = engine.getState() as GameState;
    expect(after.currencies['axiom']!.toNumber()).toBe(before - 1);
    expect(after.recursion.axioms).toContain('unemptying');
    expect(lawNum(after, 'regenFloorShare')).toBe(0.2);
  });

  /**
   * THE ONE THING THAT STANDS BETWEEN THEM, said exactly rather than implied.
   *
   * `roll` is washed by a Recursion and the bank is kept, so a save that has
   * Recursed N times arrives in the new world with N Axioms and NO looted
   * wreck. That is not a bug — the Engine is a place, and you go back to it —
   * but it is the reason a returning player's bank reads as unspendable at
   * first glance, and it is worth an assertion so nobody "fixes" it later by
   * making the wreck permanent.
   */
  it('a Recursion keeps the bank and washes the route back to it', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.shell.current = 'aleph';
    s.aleph.coreTouched = true;
    s.currencies['axiom'] = D(5);
    const at = axiomStation()!;
    markReached(s, at.depth, 15);
    expect(axiomEngineFound(s)).toBe(true);

    expect(engine.dispatch({ type: 'recurse' }).ok).toBe(true);
    const next = engine.getState() as GameState;
    expect(next.currencies['axiom']!.toNumber()).toBe(5);   // KEPT
    next.shell.current = 'aleph';
    expect(axiomEngineFound(next)).toBe(false);             // WASHED
    // ...and walking back into it is all it takes.
    markReached(next, at.depth, 15);
    expect(axiomEngineFound(next)).toBe(true);
  });

  it('a written rule rides that same Recursion, so nothing already spent is lost', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.plant!.tiers['axiomEngine'] = 1;
    s.currencies['axiom'] = D(5);
    s.kiln.built = true;
    expect(writeRule(s, ctx(), 'reverseKiln').ok).toBe(true);
    s.shell.current = 'aleph';
    s.aleph.coreTouched = true;
    expect(engine.dispatch({ type: 'recurse' }).ok).toBe(true);
    const next = engine.getState() as GameState;
    expect(next.recursion.axioms).toContain('reverseKiln');
    expect(lawFlag(next, 'kilnReverse')).toBe(true);
  });
});

describe('a rule changes what the world DOES, never what it pays', () => {
  /**
   * §21: "Axioms are rule rewrites, not multipliers." The dpsMax arm lives in
   * `axioms.test.ts`; this is the other half of the same claim and it is
   * structural — no Axiom may grant, price or multiply a CURRENCY, because
   * nothing in the contribution shape can express one.
   */
  it('an Axiom can only write a law slot — there is no currency in the shape', () => {
    for (const a of AXIOMS) {
      const keys = Object.keys(a).sort();
      expect(keys, a.id).toEqual(
        ['cost', 'flavor', 'flags', 'id', 'name', 'num', 'rule', 'shown', 'slot']
          .filter((k) => k in a).sort(),
      );
      // The payload is a law slot and nothing else.
      const payload = [...Object.keys(a.num ?? {}), ...(a.flags ?? [])];
      expect(payload, a.id).toEqual([a.slot]);
    }
  });

  it('writing every rule moves no purse but the Axiom purse', () => {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    s.plant!.tiers['axiomEngine'] = 5;
    s.currencies['axiom'] = D(99);
    // Show it everything, so every rule is on the menu.
    s.kiln.built = true; s.drills.bayBuilt = true;
    s.maxDepthRecord = 999; s.recursion.count = 1; s.collapse.count = 1;
    s.stats.longestOfflineSec = 60; s.shell.breachCount = 1;
    s.polarity.signs[0] = 1; (s.runes as unknown as { found: Record<string, unknown> }).found['a'] = true;
    s.assayBench = { tier: 1, running: null, sampled: [] } as never;
    s.pressure.heat = 10; s.refraction.mirrors[0] = '/';

    const purse = (st: GameState) => JSON.stringify(
      Object.entries(st.currencies)
        .filter(([k]) => k !== 'axiom')
        .map(([k, v]) => [k, v.toString()]).sort(),
    );
    const before = purse(s);
    let wrote = 0;
    for (const a of offered(s)) {
      if (writeRule(s, ctx(), a.id).ok) wrote += 1;
    }
    expect(wrote, 'no rule was writable — the arm is vacuous').toBeGreaterThan(6);
    expect(purse(s)).toBe(before);
    expect(s.currencies['axiom']!.toNumber()).toBeLessThan(99);   // the one that moved
  });
});
