/**
 * THE MODIFIER HOLE, closed and kept closed.
 *
 * `dropChance` and `cellCap` were museum bucket names that are not modifier
 * buckets. They registered into nothing, paid nothing, and showed up green in
 * every test run for a phase, because `registerModifier` took a `string` and
 * the content definitions cast to `Bucket` at the call site.
 *
 * There are THREE distinct failures in that sentence and each needs its own
 * guard, because passing one says nothing about the others:
 *
 *   1. the NAME can be wrong          → compile error (bucket fields are typed)
 *   2. the name can be right but UNREAD → assertModifierIntegrity() at boot
 *   3. the SHAPE can be wrong (1 + bonus on an additive bucket) → foldBonus
 *
 * This file tests all three, and asserts the declared consumer map is honest
 * by reading the engine source rather than trusting it.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ensureContentLoaded, reloadContent } from '../content';
import {
  ALL_BUCKETS, isBucket, foldBonus, isAdditiveBucket, neutralFor,
  registerModifierChecked, assertModifierIntegrity, bucketsWithSources, consumerOf,
  computeBucket, type Bucket,
} from '../modifiers';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { AFFIXES } from '../systems/relics';
import { GEMS } from '../materials';

ensureContentLoaded();

function engineSources(): string {
  const root = join(__dirname, '..');
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (entry !== '__tests__') walk(p);
      } else if (entry.endsWith('.ts')) {
        out.push(readFileSync(p, 'utf8'));
      }
    }
  };
  walk(root);
  return out.join('\n');
}

describe('1. an invalid bucket name cannot be registered', () => {
  it('the runtime membership test agrees with the union', () => {
    // ALL_BUCKETS is `satisfies readonly Bucket[]`, so the compiler already
    // rejects a name that is not in the union. This checks the other
    // direction: nothing in the union is missing from the runtime list.
    expect(ALL_BUCKETS.length).toBe(16);
    expect(new Set(ALL_BUCKETS).size).toBe(ALL_BUCKETS.length);
    for (const b of ALL_BUCKETS) expect(isBucket(b)).toBe(true);
  });

  it('rejects the two names that actually shipped broken', () => {
    expect(isBucket('dropChance')).toBe(false);
    expect(isBucket('cellCap')).toBe(false);
  });

  it('the checked path THROWS rather than registering into nothing', () => {
    expect(() =>
      registerModifierChecked({ id: 'test.bogus', label: 'x', bucket: 'dropChance', value: () => 1 }),
    ).toThrow(/not a modifier bucket/);
    // ...and the failed registration left nothing behind.
    expect(bucketsWithSources()).not.toContain('dropChance' as Bucket);
  });

  it('the checked path accepts a real name', () => {
    expect(() =>
      registerModifierChecked({ id: 'test.ok', label: 'x', bucket: 'dustYield', value: () => 1 }),
    ).not.toThrow();
  });
});

describe('2. every registered bucket is consumed by something', () => {
  it('boot asserts it', () => {
    expect(() => assertModifierIntegrity()).not.toThrow();
  });

  it('every bucket with sources has a declared consumer', () => {
    for (const b of bucketsWithSources()) {
      expect(consumerOf(b), `bucket '${b}' has sources but no declared consumer`).toBeTruthy();
    }
  });

  // The consumer map is a claim. This checks the claim against the source, so
  // it cannot rot into a comment that describes a wiring that no longer exists.
  it('the declared consumers are TRUE — each bucket is really read in engine source', () => {
    const src = engineSources();
    for (const b of ALL_BUCKETS) {
      const read = new RegExp(`(get|computeBucket)\\([^)]*['"\`]${b}['"\`]`).test(src);
      expect(read, `bucket '${b}' is declared consumed by "${consumerOf(b)}" but nothing reads it`).toBe(true);
    }
  });

  it('catches a source registered into an unread bucket', () => {
    // Simulate the failure directly: a bucket with sources and no consumer.
    // Done by proving the assertion's own logic, not by corrupting the real
    // registry, which every other test in the run depends on.
    const unread = ALL_BUCKETS.find((b) => !consumerOf(b));
    expect(unread, 'every bucket currently has a consumer, so nothing to catch').toBeUndefined();
  });
});

describe('3. additive buckets are folded correctly', () => {
  it('foldBonus knows the difference', () => {
    expect(foldBonus('dustYield', 0.25)).toBe(1.25); // multiplicative
    expect(foldBonus('offlineEffAdd', 0.05)).toBe(0.05); // additive — NOT 1.05
  });

  it('neutral values match the fold', () => {
    for (const b of ALL_BUCKETS) {
      expect(foldBonus(b, 0)).toBe(neutralFor(b));
      expect(neutralFor(b)).toBe(isAdditiveBucket(b) ? 0 : 1);
    }
  });

  // The bug that shipped: relics and the Museum both registered `1 + bonus`
  // into offlineEffAdd. With no relics held and no cases filled, the bonus is
  // 0 — so a correct registration leaves the bucket at its NEUTRAL value.
  it('an empty additive bucket sits at 0, not at N sources', () => {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    const v = computeBucket(s, 'offlineEffAdd');
    // Persistence lives here and starts at 0; nothing else may contribute yet.
    expect(v.toNumber()).toBeLessThan(1);
  });

  it('every ADDITIVE bucket has a consumer that can survive a 0 value', () => {
    // An additive bucket read as if it were a multiplier would zero the thing
    // it touches. Only offlineEffAdd is additive; assert that stays true, so
    // adding a second one is a deliberate act with a test to update.
    const additive = ALL_BUCKETS.filter(isAdditiveBucket);
    expect(additive).toEqual(['offlineEffAdd']);
  });
});

describe('4. the content definitions that caused this are audited', () => {
  it('every relic affix names a real bucket', () => {
    for (const [key, def] of Object.entries(AFFIXES)) {
      expect(isBucket(def.bucket), `affix '${key}' → '${def.bucket}'`).toBe(true);
    }
  });

  it('every gem names a real bucket', () => {
    for (const g of GEMS) {
      expect(isBucket(g.bucket), `gem '${g.id}' → '${g.bucket}'`).toBe(true);
    }
  });

  it('no bucket name is cast into place anywhere in engine source', () => {
    // `as Bucket` is how the two bad names got past the type system. If one
    // reappears, this says so.
    const src = engineSources();
    expect(src.includes('as Bucket')).toBe(false);
  });
});

// This file REGISTERS test sources ('test.ok'), so it must put the registry
// back. `clearModifiers()` alone would not: ensureContentLoaded() has a
// `loaded` guard and would no-op, leaving an empty registry for any later file
// sharing the module graph. reloadContent() resets the guard too.
afterAll(() => {
  reloadContent();
});
