/**
 * THE SIEVE — SORTING (§14.3, §13, §25.5), A.90.
 *
 * The claim under test is LAW 4's: a machine must change a VERB. So the load-
 * bearing test is not "the predicate evaluates" — it is that the plant does
 * something it could not do before, and that the sentence §25.5 asks for can
 * actually be said:
 *
 *     CRUSH ONLY STONE UNDER FAIR
 *
 *   1  the place, then the price — and tiers as CAPABILITY, not multipliers
 *   2  a filter changes what a machine takes, and an UNFILTERED plant is
 *      bit-identical to the one before this file existed
 *   3  §25.5's sentence, end to end, through the real Crusher
 *   4  the Circuit takes FILTER as an action (what it has waited on since A.85)
 *   5  Ferrite's MAGNETISED widens a band clause and never a trait one
 *   6  §14.3's best feature: the plant tells you where to go mine
 *   7  PILLAR 2 — a filter routes, it never produces
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { addMaterial } from '../systems/forge';
import { crush, crushable } from '../systems/crusher';
import { markReached } from '../systems/roll';
import { ensureCondition } from '../systems/condition';
import {
  MAX_MACHINE_TIER, tierOf,
} from '../systems/plant';
import {
  addFilter, assignFilter, buildSieve, clauseLimit, ensureSorting, filterOf, filterSentence,
  heldFor, passes, rejectsRoute, removeFilter, routeReject, sieveBuilt, sieveFound, sieveStation,
  stationsFor, type Filter,
} from '../systems/sieve';
import { availableActs, actDef, ensureCircuit, tickCircuit, type CircuitRow } from '../systems/circuit';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;
let mods: ModifierCache;

function racked(st: GameState, n: number): GameState {
  st.casting.rack = Array.from({ length: n }, (_, i) =>
    ({ id: `p${i}`, materialId: 'marl', shape: 'head', purity: 50, traits: [] } as never));
  return st;
}

/** A player who has walked to Siever's Rest and has parts on the rack. */
function atTheWreck(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'ferrite';
  st.kiln.built = true;
  st.plant!.tiers['crusher'] = 1;
  markReached(st, 250, 15); // loots every Ferrite wreck, including Siever's Rest
  return racked(st, 20);
}

/** ...and has raised it to `tier`. */
function withSieve(tier = 1): GameState {
  const st = atTheWreck();
  for (let i = 0; i < tier; i++) buildSieve(st, ctx);
  return st;
}

beforeEach(() => {
  mods = new ModifierCache();
  mods.invalidate();
});

describe('1 — the place, then the price (§6, §15.4)', () => {
  it('it is at Siever\'s Rest 98 in Ferrite, exactly where §6 puts it', () => {
    expect(sieveStation()).toEqual({ shellId: 'ferrite', depth: 98, name: "Siever's Rest" });
  });

  it('a player who has not been there cannot raise it, whatever the rack holds', () => {
    const st = racked(createEngine({ nowMs: 0 }).getState() as GameState, 20);
    expect(sieveFound(st)).toBe(false);
    const r = buildSieve(st, ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("Siever's Rest");
  });

  it('and it is built from CAST PARTS, remembering what it was cast from (§11.2)', () => {
    const st = atTheWreck();
    expect(sieveBuilt(st)).toBe(false);
    const before = st.casting.rack.length;
    expect(buildSieve(st, ctx).ok).toBe(true);
    expect(tierOf(st, 'sieve')).toBe(1);
    expect(st.casting.rack.length).toBeLessThan(before);
    expect(st.plant!.builtOf!['sieve']).toContain('marl');
  });

  /**
   * TIERS ARE CAPABILITY (§15.4). Each one is a SENTENCE the last could not
   * say, and this is the assertion of that rather than of a number going up.
   */
  it('I says one clause, II says two, III routes what it refuses', () => {
    const one = withSieve(1);
    expect(clauseLimit(one)).toBe(1);
    expect(rejectsRoute(one)).toBe(false);
    expect(addFilter(one, [
      { kind: 'trait', trait: 'dense' }, { kind: 'band', op: 'atLeast', band: 'good' },
    ]).ok, 'a tier-I Sieve took two clauses').toBe(false);

    const two = withSieve(2);
    expect(clauseLimit(two)).toBe(2);
    // §14.3's own example: `trait = dense AND purity >= pure`.
    const r = addFilter(two, [
      { kind: 'trait', trait: 'dense' }, { kind: 'band', op: 'atLeast', band: 'good' },
    ]);
    expect(r.ok).toBe(true);
    expect(ensureSorting(two).filters[0]!.clauses).toHaveLength(2);

    const three = withSieve(3);
    expect(rejectsRoute(three)).toBe(true);
    expect(tierOf(three, 'sieve')).toBe(MAX_MACHINE_TIER);
  });
});

// ---------------------------------------------------------------------------
// 2 — THE LOAD-BEARING ONE
// ---------------------------------------------------------------------------

describe('2 — a filter changes what a machine takes', () => {
  function stocked(st: GameState): GameState {
    // Two stacks of the same stone in two different bands.
    for (let i = 0; i < 8; i++) addMaterial(st, 'rustmarrow', 30); // poor
    for (let i = 0; i < 8; i++) addMaterial(st, 'rustmarrow', 90); // fine
    return st;
  }

  it('BEFORE: with no filter, the Crusher is offered both bands', () => {
    const st = stocked(withSieve(1));
    const bands = crushable(st).filter((c) => c.materialId === 'rustmarrow').map((c) => c.band);
    expect(bands.sort()).toEqual(['fine', 'poor']);
  });

  it('AFTER: "under Fair" leaves it exactly one, and the other is still in the Hold', () => {
    const st = stocked(withSieve(1));
    const id = (addFilter(st, [{ kind: 'band', op: 'atMost', band: 'fair' }]).data as { id: string }).id;
    expect(assignFilter(st, 'crusher', id).ok).toBe(true);

    const bands = crushable(st).filter((c) => c.materialId === 'rustmarrow').map((c) => c.band);
    expect(bands).toEqual(['poor']);
    // NOTHING IS DESTROYED. The fine stack is untouched — it is simply not on
    // the list of things this machine is willing to take.
    expect(st.materials.stacks['rustmarrow']!['fine']!.count).toBe(8);
  });

  /**
   * AN UNFILTERED PLANT IS BIT-IDENTICAL, which is §14.3's "not a punishment"
   * stated as a test. The Sieve adds a capability; it must not tax a player who
   * raised it and wrote nothing down.
   */
  it('and a Sieve with no filter written changes NOTHING at all', () => {
    const bare = stocked(createEngine({ nowMs: 0 }).getState() as GameState);
    bare.plant!.tiers['crusher'] = 1;
    const withOne = stocked(withSieve(3));
    expect(JSON.stringify(crushable(withOne).map((c) => [c.materialId, c.band, c.count]).sort()))
      .toBe(JSON.stringify(crushable(bare).map((c) => [c.materialId, c.band, c.count]).sort()));
  });

  it('a removed filter takes its assignment with it — no orphan pointing at nothing', () => {
    const st = stocked(withSieve(1));
    const id = (addFilter(st, [{ kind: 'band', op: 'atMost', band: 'fair' }]).data as { id: string }).id;
    assignFilter(st, 'crusher', id);
    expect(filterOf(st, 'crusher')).not.toBeNull();
    expect(removeFilter(st, id).ok).toBe(true);
    expect(filterOf(st, 'crusher')).toBeNull();
    expect(ensureSorting(st).assigned['crusher']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3 — §25.5's SENTENCE, END TO END
// ---------------------------------------------------------------------------

describe('3 — "crush only stone under Fair", through the real machine', () => {
  it('the fine stack is REFUSED BY NAME, and the poor one goes through', () => {
    const st = withSieve(1);
    for (let i = 0; i < 8; i++) addMaterial(st, 'rustmarrow', 30);
    for (let i = 0; i < 8; i++) addMaterial(st, 'rustmarrow', 90);
    st.plant!.surge = 999;
    const id = (addFilter(st, [{ kind: 'band', op: 'atMost', band: 'fair' }]).data as { id: string }).id;
    assignFilter(st, 'crusher', id);
    expect(filterSentence(ensureSorting(st).filters[0]!)).toBe('is under fair');

    const no = crush(st, ctx, 'rustmarrow', 'fine');
    expect(no.ok).toBe(false);
    // NAMED, not "needs 4 of the same band" over a Hold holding eight.
    expect(no.reason).toContain('is under fair');

    st.plant!.surge = 999;
    expect(crush(st, ctx, 'rustmarrow', 'poor').ok).toBe(true);
  });

  it('and the same purse without a filter takes the fine stack happily', () => {
    const st = withSieve(1);
    for (let i = 0; i < 8; i++) addMaterial(st, 'rustmarrow', 90);
    st.plant!.surge = 999;
    expect(crush(st, ctx, 'rustmarrow', 'fine').ok, 'the control is dead').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4 — FILTER AS AN ACTION
// ---------------------------------------------------------------------------

describe('4 — the Circuit takes FILTER as an action (§25.5)', () => {
  it('every saved filter becomes a throwable row, and there is one that takes it off', () => {
    const st = withSieve(1);
    const before = availableActs(st, 'crusher').map((a) => a.id);
    expect(before.some((id) => id.startsWith('filter:'))).toBe(false);

    const id = (addFilter(st, [{ kind: 'band', op: 'atMost', band: 'fair' }]).data as { id: string }).id;
    const after = availableActs(st, 'crusher');
    expect(after.map((a) => a.id)).toContain(`filter:crusher:${id}`);
    expect(after.map((a) => a.id)).toContain('unfilter:crusher');
    expect(after.find((a) => a.id === `filter:crusher:${id}`)!.label).toBe('take only what is under fair');
  });

  it('and a live strip THROWS it — the machine ends up filtered without being told twice', () => {
    const st = withSieve(1);
    st.drills.bayBuilt = true;
    const id = (addFilter(st, [{ kind: 'band', op: 'atMost', band: 'fair' }]).data as { id: string }).id;
    const row: CircuitRow = { read: 'depth', op: 'gt', value: -1, act: `filter:crusher:${id}` };
    const c = ensureCircuit(st);
    c.opened = true;
    c.strips['crusher'] = [row];
    c.last['crusher'] = -1;

    expect(filterOf(st, 'crusher')).toBeNull();
    tickCircuit(st, mods, ctx, 2);
    expect(filterOf(st, 'crusher')?.id, 'the Circuit did not throw the filter').toBe(id);
    // ...and it counts as an ACT once, then holds — a row that fires forever
    // without changing anything is a fire, not an act.
    expect(c.acts['crusher']).toBe(1);
    tickCircuit(st, mods, ctx, 2);
    expect(c.acts['crusher']).toBe(1);
  });

  it('the generated act is resolvable by id from a saved strip', () => {
    const st = withSieve(1);
    const id = (addFilter(st, [{ kind: 'trait', trait: 'dense' }]).data as { id: string }).id;
    expect(actDef(`filter:crusher:${id}`, st)).toBeDefined();
    expect(actDef(`filter:crusher:${id}`), 'it should not be a module constant').toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5 — FERRITE'S RULE LANDS HERE
// ---------------------------------------------------------------------------

describe('5 — MAGNETISED pulls one band wider (E2, §7.2)', () => {
  const f: Filter = {
    id: 'x', name: '', clauses: [{ kind: 'band', op: 'atMost', band: 'poor' }],
  };

  it('a band clause loosens by exactly one, either way', () => {
    expect(passes(f, 'rustmarrow', 'fair', 0)).toBe(false);
    expect(passes(f, 'rustmarrow', 'fair', 1)).toBe(true);
    expect(passes(f, 'rustmarrow', 'good', 1), 'it loosened by two').toBe(false);
  });

  it('but a TRAIT clause never loosens — a magnet does not change what a thing is', () => {
    const t: Filter = { id: 'y', name: '', clauses: [{ kind: 'trait', trait: 'dense' }] };
    // `marl` is light+springy, so it fails the clause at any widening.
    expect(passes(t, 'marl', 'good', 0)).toBe(false);
    expect(passes(t, 'marl', 'good', 5)).toBe(false);
  });

  it('and the live Crusher takes the wider stock only while the chain is long', () => {
    const st = withSieve(1);
    for (let i = 0; i < 8; i++) addMaterial(st, 'rustmarrow', 50); // fair
    const id = (addFilter(st, [{ kind: 'band', op: 'atMost', band: 'poor' }]).data as { id: string }).id;
    assignFilter(st, 'crusher', id);
    expect(crushable(st).some((c) => c.band === 'fair')).toBe(false);

    ensureCondition(st)['crusher'] = { id: 'magnetised', level: 1 };
    expect(crushable(st).some((c) => c.band === 'fair'), 'the magnet pulled nothing').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6 — THE PLANT TELLS YOU WHAT TO GO MINE
// ---------------------------------------------------------------------------

describe('6 — §14.3\'s best feature', () => {
  it('a filter for a trait you own nothing for names PLACES, and real ones', () => {
    const st = withSieve(1);
    const f: Filter = { id: 'z', name: '', clauses: [{ kind: 'trait', trait: 'warm' }] };
    expect(heldFor(st, f), 'the fixture already holds some — pick another trait').toBe(0);
    const where = stationsFor(f);
    expect(where.length, 'a warm trait exists in Cinder and the Roll should say so')
      .toBeGreaterThan(0);
    for (const w of where) expect(typeof w.depth).toBe('number');
    // It names a place in the shell whose stone actually carries the trait.
    expect(where.some((w) => w.shellId === 'cinder')).toBe(true);
  });

  it('and a purity-only filter names NOWHERE, because purity is not a property of a place', () => {
    const f: Filter = { id: 'w', name: '', clauses: [{ kind: 'band', op: 'atLeast', band: 'fine' }] };
    expect(stationsFor(f)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7 — REJECTS ROUTE ONWARD, AND PILLAR 2
// ---------------------------------------------------------------------------

describe('7 — tier III routes, and nothing here produces', () => {
  it('what one machine refuses is offered to one that will take it', () => {
    const st = withSieve(3);
    const dense = (addFilter(st, [{ kind: 'trait', trait: 'dense' }]).data as { id: string }).id;
    const light = (addFilter(st, [{ kind: 'trait', trait: 'light' }]).data as { id: string }).id;
    assignFilter(st, 'crusher', dense);
    assignFilter(st, 'kiln', light);
    // `marl` is light+springy: the Crusher will not have it, the Kiln will.
    expect(routeReject(st, 'crusher', 'marl', 'good')).toBe('kiln');
    // And a tier-II Sieve routes nothing at all.
    st.plant!.tiers['sieve'] = 2;
    expect(routeReject(st, 'crusher', 'marl', 'good')).toBeNull();
  });

  it('PILLAR 2: dpsMax at the SAME depth is identical with every machine filtered', () => {
    const read = (filtered: boolean): number => {
      const st = withSieve(3);
      st.depth = 40; // THE SAME DEPTH IN BOTH ARMS
      if (filtered) {
        const id = (addFilter(st, [{ kind: 'trait', trait: 'dense' }]).data as { id: string }).id;
        for (const m of ['kiln', 'crusher', 'refinery']) assignFilter(st, m, id);
      }
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });
});
