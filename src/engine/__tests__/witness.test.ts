/**
 * THE WITNESS AND THE CONDENSER — WITNESSING (§13, §19, §7.2), A.92.
 *
 *   0  the ledger is a claim: neither machine existed
 *   1  the places, then the prices, and tiers as capability
 *   2  ONE SYSTEM, NOT TWO — the condition E2 already writes is the only source
 *      of both the maybes and the residue
 *   3  END TO END: an unwatched machine hands you a maybe, and it is witnessed
 *      into a named material
 *   4  it is not a faucet — a maybe settles as something it could have been
 *   5  PILLAR 2
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { MATERIALS, materialDef, rollDrop } from '../materials';
import { traitsOf } from '../traits';
import { addMaterial, materialCount } from '../systems/forge';
import { markReached } from '../systems/roll';
import { MAX_MACHINE_TIER, tierOf } from '../systems/plant';
import { CONDITION_BITE, ensureCondition } from '../systems/condition';
import { chargeCrucible } from '../systems/casting';
import { worth } from '../systems/balance';
import { buildStill, distil } from '../systems/still';
import { stilledId } from '../content/traps';
import {
  CONDENSE_SHARE, RESIDUE_PER_SEC, TIER_CAPABILITY_CONDENSER, TIER_CAPABILITY_WITNESS,
  WITNESS_HUSH, buildCondenser, buildWitness, condense, condenseBlocker, condenserBuilt,
  condenserFound, condenserStation, condensesItself, couldBe, deliver, ensureWitness,
  isMaybe, maybeId, maybesHeld, readsEveryCondition, registerMaybe, tickResidue,
  wasGoingToBe, witness, witnessBlocker, witnessBuilt, witnessFound, witnessStation,
} from '../systems/witness';
import { allAuthoredStations } from '../content/rolls';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;

function racked(st: GameState, n: number): GameState {
  st.casting.rack = Array.from({ length: n }, (_, i) =>
    ({ id: 9000 + i, materialId: 'marl', type: 'head', purity: 50 } as never));
  st.casting.nextId = 9000 + n;
  return st;
}

/** A player who has walked Hollow to its floor. */
function walked(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'hollow';
  markReached(st, 560, 15);
  return racked(st, 40);
}

function built(cond = 1, wit = 1): GameState {
  const st = walked();
  for (let i = 0; i < cond; i++) buildCondenser(st, ctx);
  for (let i = 0; i < wit; i++) buildWitness(st, ctx);
  return st;
}

/** Put a machine in the state E2 writes when nobody is watching the plant. */
function unwatched(st: GameState, machineId: string): void {
  ensureCondition(st)[machineId] = { id: 'undecided', level: 1 };
}

describe('0 — the ledger is a claim: neither machine existed', () => {
  it('no `witness` or `condenser` tier, and no maybe-form anywhere', () => {
    const fresh = createEngine({ nowMs: 0 }).getState() as GameState;
    expect(tierOf(fresh, 'witness')).toBe(0);
    expect(tierOf(fresh, 'condenser')).toBe(0);
    expect(fresh.witness).toBeUndefined();
    expect(MATERIALS.some((m) => m.source === 'maybe' && !m.worked)).toBe(false);
  });
});

describe('1 — the places, then the prices (§6, §15.4)', () => {
  it('they are at Condenser Wreck 55 and Witness Hall 140, where §6 puts them', () => {
    expect(condenserStation()).toEqual({ shellId: 'hollow', depth: 55, name: 'Condenser Wreck' });
    expect(witnessStation()).toEqual({ shellId: 'hollow', depth: 140, name: 'Witness Hall' });
    // §6: "CONDENSER — Witnesses cannot run". The feeder comes first in the shaft.
    expect(condenserStation()!.depth).toBeLessThan(witnessStation()!.depth);
  });

  it('a player who has not been there cannot raise either', () => {
    const st = racked(createEngine({ nowMs: 0 }).getState() as GameState, 40);
    expect(condenserFound(st)).toBe(false);
    expect(witnessFound(st)).toBe(false);
    expect(buildCondenser(st, ctx).reason).toContain('Condenser Wreck');
    expect(buildWitness(st, ctx).reason).toContain('Witness Hall');
  });

  it('the tiers are six different sentences, not six sizes', () => {
    expect(new Set(TIER_CAPABILITY_CONDENSER).size).toBe(TIER_CAPABILITY_CONDENSER.length);
    expect(new Set(TIER_CAPABILITY_WITNESS).size).toBe(TIER_CAPABILITY_WITNESS.length);
    expect(condensesItself(built(1, 1))).toBe(false);
    expect(condensesItself(built(2, 1))).toBe(true);
    expect(readsEveryCondition(built(2, 1))).toBe(false);
    const three = built(3, 3);
    expect(readsEveryCondition(three)).toBe(true);
    expect(tierOf(three, 'condenser')).toBe(MAX_MACHINE_TIER);
    expect(tierOf(three, 'witness')).toBe(MAX_MACHINE_TIER);
  });

  it('both are built from cast parts, remembering what they were cast from', () => {
    const st = built(1, 1);
    expect(condenserBuilt(st)).toBe(true);
    expect(witnessBuilt(st)).toBe(true);
    expect(st.plant!.builtOf!['condenser']).toContain('marl');
    expect(st.plant!.builtOf!['witness']).toContain('marl');
  });

  it('a cracked machine will not run — E2 reaches both like every machine', () => {
    const st = built(1, 1);
    ensureWitness(st).residue = 50;
    expect(condenseBlocker(st)).toBeNull();
    ensureCondition(st)['condenser'] = { id: 'baked', level: 1, seized: true };
    expect(condenseBlocker(st)).toContain('cracked');
  });
});

// ---------------------------------------------------------------------------
// 2 — ONE SYSTEM, NOT TWO
// ---------------------------------------------------------------------------

/**
 * The brief: "E2's Hollow rule already has machines refusing to commit to a
 * band until somebody looks at the plant — this is the same idea as a verb.
 * Make them one system, not two."
 *
 * So the ONLY input to both halves is `biting(state, id, 'undecided')`, the
 * field `tickCondition` was already writing. These tests assert that there is
 * no second timer and no second source: nothing accrues and nothing arrives
 * undecided unless E2's rule is in force.
 */
describe('2 — the condition E2 writes is the only source of both halves', () => {
  it('no undecided machine, no residue — at any tier, over any span', () => {
    const st = built(1, 1);
    tickResidue(st, 600);
    expect(ensureWitness(st).residue).toBe(0);
    // ...and the moment the world writes the rule, it accrues.
    unwatched(st, 'still');
    tickResidue(st, 10);
    expect(ensureWitness(st).residue).toBeCloseTo(RESIDUE_PER_SEC * 10, 6);
  });

  it('residue scales with HOW MANY machines the shell stopped watching', () => {
    const one = built(1, 1);
    unwatched(one, 'still');
    tickResidue(one, 10);
    const three = built(1, 1);
    for (const id of ['still', 'crusher', 'press']) unwatched(three, id);
    tickResidue(three, 10);
    expect(ensureWitness(three).residue).toBeCloseTo(3 * ensureWitness(one).residue, 6);
  });

  it('a condition that is only WEATHER does not count — it has to bite', () => {
    const st = built(1, 1);
    ensureCondition(st)['still'] = { id: 'undecided', level: CONDITION_BITE - 0.01 };
    tickResidue(st, 60);
    expect(ensureWitness(st).residue).toBe(0);
  });

  it('tier III reads every condition, not only this shell\'s', () => {
    const st = built(3, 1);
    ensureCondition(st)['still'] = { id: 'baked', level: 1 };   // Cinder's rule
    tickResidue(st, 10);
    // Read residue AND Hush: a tier-III Condenser is also a tier-II one, so it
    // has already condensed what it collected. Reading `residue` alone would
    // have been a vacuous zero.
    expect(ensureWitness(st).residue + ensureWitness(st).hush).toBeGreaterThan(0);
    // ...and a tier-II one is deaf to it.
    const two = built(2, 1);
    ensureCondition(two)['still'] = { id: 'baked', level: 1 };
    tickResidue(two, 10);
    expect(ensureWitness(two).residue + ensureWitness(two).hush).toBe(0);
  });

  it('residue accrues WITHOUT a Condenser — you find the machine, not the counter', () => {
    const st = walked();                     // nothing built at all
    unwatched(st, 'still');
    tickResidue(st, 10);
    expect(ensureWitness(st).residue).toBeGreaterThan(0);
  });

  it('tier II condenses on its own; tier I waits to be asked', () => {
    const one = built(1, 1);
    unwatched(one, 'still');
    tickResidue(one, 100);
    expect(ensureWitness(one).hush).toBe(0);
    expect(condense(one, ctx).ok).toBe(true);
    expect(ensureWitness(one).hush).toBeCloseTo(RESIDUE_PER_SEC * 100 * CONDENSE_SHARE, 6);
    expect(ensureWitness(one).residue).toBe(0);

    const two = built(2, 1);
    unwatched(two, 'still');
    tickResidue(two, 100);
    expect(ensureWitness(two).hush).toBeGreaterThan(0);
  });

  it('condensing is a LOSS, always', () => {
    expect(CONDENSE_SHARE).toBeLessThan(1);
    const st = built(1, 1);
    ensureWitness(st).residue = 100;
    condense(st, ctx);
    expect(ensureWitness(st).hush).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// 3 — END TO END
// ---------------------------------------------------------------------------

describe('3 — an unwatched machine hands you a maybe, and it is named', () => {
  it('the Still\'s output arrives undecided, and cannot be used for anything', () => {
    const st = built(1, 1);
    st.forge.built = true;
    // The Still is Verdance's wreck, so this player has walked there too.
    st.shell.current = 'verdance';
    markReached(st, 290, 15);
    st.shell.current = 'hollow';
    for (let i = 0; i < 3; i++) expect(buildStill(st, ctx).ok, 'the Still would not stand').toBe(true);
    addMaterial(st, 'millstone', 80);

    // WATCHED: an ordinary stilled stone.
    const watched = distil(st, ctx, 'millstone', 'fine', 'brittle');
    expect(watched.ok, watched.reason).toBe(true);
    expect((watched.data as { into: string }).into).toBe(stilledId('millstone', 'brittle'));

    // UNWATCHED: a maybe.
    unwatched(st, 'still');
    addMaterial(st, 'millstone', 80);
    const r = distil(st, ctx, 'millstone', 'fine', 'brittle');
    const got = (r.data as { into: string }).into;
    expect(got).toBe(maybeId(stilledId('millstone', 'brittle')));
    expect(isMaybe(got)).toBe(true);
    expect(materialCount(st, got)).toBe(1);

    // AND IT IS NOT STOCK. The tub refuses it by name.
    const charged = chargeCrucible(st, ctx, got, 1);
    expect(charged.ok).toBe(false);
    expect(charged.reason).toContain('has not decided what it is');
  });

  it('a maybe keeps its stone\'s shell, rarity and traits — it is undecided about WHAT', () => {
    const def = registerMaybe('marl')!;
    const src = materialDef('marl');
    expect(def.shellId).toBe(src.shellId);
    expect(def.rarity).toBe(src.rarity);
    expect(traitsOf(def.id)).toEqual(traitsOf('marl'));
    expect(def.worked).toBe(true);           // out of the clone population
    expect(wasGoingToBe(def.id)).toBe('marl');
  });

  it('and it cannot be dug up', () => {
    const id = registerMaybe('marl')!.id;
    const rng = (() => { let a = 13; return () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; }; })();
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const r = rollDrop('loam', i % 151, rng);
      if (r.kind === 'material') seen.add(r.materialId!);
    }
    expect(seen.has(id), 'a maybe came out of the rock').toBe(false);
    for (const { def } of allAuthoredStations()) {
      for (const s of [...(def.seams ?? []), ...(def.remains ?? []), ...(def.floodSeams ?? [])]) {
        expect(isMaybe(s), `${def.name} seams a maybe`).toBe(false);
      }
    }
  });

  it('the Witness names it, spends Hush, and one unit becomes one unit', () => {
    const st = built(1, 1);
    registerMaybe('marl');
    addMaterial(st, maybeId('marl'), 80);
    ensureWitness(st).hush = WITNESS_HUSH;
    expect(maybesHeld(st)).toHaveLength(1);

    const r = witness(st, ctx, maybeId('marl'), 'fine', 'marl');
    expect(r.ok, r.reason).toBe(true);
    expect(materialCount(st, maybeId('marl'))).toBe(0);
    expect(materialCount(st, 'marl')).toBe(1);
    expect(ensureWitness(st).hush).toBe(0);
    expect(ensureWitness(st).named).toEqual(['marl']);
  });

  it('...and without Hush it refuses, naming the machine that makes it', () => {
    const st = built(1, 1);
    registerMaybe('marl');
    addMaterial(st, maybeId('marl'), 80);
    const r = witnessBlocker(st, maybeId('marl'), 'fine', 'marl');
    expect(r).toContain(String(WITNESS_HUSH));
    expect(r).toContain('Condenser');
  });

  it('a decided stone is not witnessable — there is nothing to say', () => {
    const st = built(1, 1);
    addMaterial(st, 'marl', 80);
    expect(witnessBlocker(st, 'marl', 'fine', 'marl')).toContain('already decided');
  });
});

// ---------------------------------------------------------------------------
// 4 — NOT A FAUCET
// ---------------------------------------------------------------------------

/**
 * A maybe is one unit that would have been one unit, so nothing is created —
 * but choosing FREELY would be transmutation at zero loss, which §14.4 says
 * must never exist. So the choice carries §14.4's own worth as its ceiling, and
 * the tiers widen only the SCOPE.
 */
describe('4 — a maybe settles as something it could have been', () => {
  it('tier I names it back and nothing else', () => {
    const st = built(1, 1);
    registerMaybe('marl');
    expect(couldBe(st, maybeId('marl'))).toEqual(['marl']);
  });

  it('tier II opens the shell, and NEVER anything worth more', () => {
    const st = built(1, 2);
    registerMaybe('ochre');
    const options = couldBe(st, maybeId('ochre'));
    expect(options.length).toBeGreaterThan(1);
    const ceiling = worth('ochre');
    for (const id of options) {
      expect(worth(id), `${id} is worth more than ochre`).toBeLessThanOrEqual(ceiling + 1e-9);
      expect(materialDef(id).shellId, `${id} is not this shell`).toBe('loam');
    }
  });

  it('...and the refusal says the rule, by name', () => {
    const st = built(1, 3);
    registerMaybe('marl');            // a common
    addMaterial(st, maybeId('marl'), 80);
    ensureWitness(st).hush = 99;
    const dearer = MATERIALS.find((m) => !m.worked && !m.source && worth(m.id) > worth('marl'))!;
    const r = witnessBlocker(st, maybeId('marl'), 'fine', dearer.id);
    expect(r).toContain('could not have been');
    expect(r).toContain('never as something worth more');
  });

  it('tier III reaches shells you have walked, and only those', () => {
    const st = built(1, 3);
    st.depthRecords = { hollow: 560, loam: 150 };
    registerMaybe('nothing');
    const options = couldBe(st, maybeId('nothing'));
    const shells = new Set(options.map((id) => materialDef(id).shellId));
    expect(shells.has('loam'), 'a walked shell is out of reach').toBe(true);
    for (const s of shells) expect(['hollow', 'loam'], `${s} was never walked`).toContain(s);
  });

  it('NO CYCLE GAINS: witnessing every maybe of every stone never raises worth', () => {
    const st = built(1, 3);
    st.depthRecords = Object.fromEntries(
      MATERIALS.map((m) => [m.shellId, 999]),
    ) as Record<string, number>;
    const ids = MATERIALS.filter((m) => !m.worked && !m.source).map((m) => m.id);
    expect(ids.length).toBeGreaterThan(80);
    let checked = 0;
    const leaks: string[] = [];
    for (const id of ids) {
      registerMaybe(id);
      for (const into of couldBe(st, maybeId(id))) {
        checked += 1;
        if (worth(into) > worth(id) + 1e-9) leaks.push(`${id} -> ${into}`);
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(leaks.slice(0, 5), `${leaks.length} witnessings gained worth`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5 — PILLAR 2
// ---------------------------------------------------------------------------

describe('5 — PILLAR 2: it names things and makes nothing', () => {
  it('one unit in, one unit out, and `totalDrops` does not move', () => {
    const st = built(1, 1);
    registerMaybe('marl');
    for (let i = 0; i < 5; i++) addMaterial(st, maybeId('marl'), 80);
    ensureWitness(st).hush = WITNESS_HUSH;
    const drops = st.materials.totalDrops;
    witness(st, ctx, maybeId('marl'), 'fine', 'marl');
    const total = Object.values(st.materials.stacks)
      .reduce((n, per) => n + Object.values(per).reduce((a, s) => a + (s?.count ?? 0), 0), 0);
    expect(total, 'the Witness made or ate a unit').toBe(5);
    expect(st.materials.totalDrops).toBe(drops);
  });

  it('the delivery seam is invisible where the rule does not apply', () => {
    const st = built(1, 1);
    // A machine nobody has written UNDECIDED onto delivers exactly `addMaterial`.
    expect(deliver(st, 'still', 'marl', 80, 3)).toBe('marl');
    expect(materialCount(st, 'marl')).toBe(3);
  });

  it('no currency moves', () => {
    const st = built(1, 1);
    registerMaybe('marl');
    addMaterial(st, maybeId('marl'), 80);
    ensureWitness(st).hush = WITNESS_HUSH;
    const before = JSON.stringify(st.currencies);
    witness(st, ctx, maybeId('marl'), 'fine', 'marl');
    expect(JSON.stringify(st.currencies)).toBe(before);
  });

  it('dpsMax at the SAME depth is identical, residue and Hush and all', () => {
    const read = (run: boolean): number => {
      const st = built(3, 3);
      st.depth = 62; // THE SAME DEPTH IN BOTH ARMS
      registerMaybe('marl');
      addMaterial(st, maybeId('marl'), 80);
      if (run) {
        for (const id of ['still', 'crusher', 'press']) unwatched(st, id);
        tickResidue(st, 600);
        witness(st, ctx, maybeId('marl'), 'fine', 'marl');
      }
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });
});
