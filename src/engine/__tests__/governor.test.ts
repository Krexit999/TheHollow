/**
 * THE GOVERNOR — OVERCLOCKING (§13, §15.4), A.92.
 *
 *   0  the ledger is a claim: it did not exist
 *   1  the place, then the price, and tiers as capability
 *   2  THE THREE AXES — faster, hungrier, and sometimes wrong. The brief called
 *      this the machine closest to a raw-yield faucet, so this is the section
 *      that argues it is a decision
 *   3  THE PRICE IS CONTENDED — overclocking one machine slows the others
 *   4  THE RISK LANDS — off-spec, driven with a seeded RNG
 *   5  PILLAR 2, with every machine at maximum
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { bandOf } from '../materials';
import { addMaterial } from '../systems/forge';
import { markReached } from '../systems/roll';
import {
  MAX_MACHINE_TIER, demandNow, demandOf, flowSatisfaction, tierOf,
} from '../systems/plant';
import { conditionSpeed, conditionedMachines, ensureCondition, machineSpeed } from '../systems/condition';
import { deliver } from '../systems/witness';
import {
  MAX_OVERCLOCK, OFFSPEC_PER_STEP, OVERCLOCK_DRAW, OVERCLOCK_SPEED,
  TIER_CAPABILITY_GOVERNOR, bandBelow, buildGovernor, ensureGovernor,
  governorFound, governorStation, machineLimit, offSpecChance, overclockDraw, overclockSpeed,
  overclocked, regulates, rollOffSpec, setOverclock, setOverclockBlocker, stepsLive, stepsSet,
} from '../systems/governor';
import { buildSieve } from '../systems/sieve';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;

function racked(st: GameState, n: number): GameState {
  st.casting.rack = Array.from({ length: n }, (_, i) =>
    ({ id: 6000 + i, materialId: 'marl', type: 'head', purity: 50 } as never));
  st.casting.nextId = 6000 + n;
  return st;
}

/** A player who has walked Ferrite past the Governor's Wreck. */
function walked(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'ferrite';
  markReached(st, 300, 15);
  return racked(st, 40);
}

function withGovernor(tier = 1): GameState {
  const st = walked();
  for (let i = 0; i < tier; i++) buildGovernor(st, ctx);
  return st;
}

/** A deterministic RNG, so a probability is something a test can pin down. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
}

describe('0 — the ledger is a claim: it did not exist', () => {
  it('no `governor` tier and no governor state on a fresh save', () => {
    const fresh = createEngine({ nowMs: 0 }).getState() as GameState;
    expect(tierOf(fresh, 'governor')).toBe(0);
    expect(fresh.governor).toBeUndefined();
  });
});

describe('1 — the place, then the price (§6, §15.4)', () => {
  it('it is at Governor\'s Wreck 175 in Ferrite, where the Roll puts it', () => {
    expect(governorStation()).toEqual({
      shellId: 'ferrite', depth: 175, name: "Governor's Wreck",
    });
  });

  it('a player who has not been there cannot raise it', () => {
    const st = racked(createEngine({ nowMs: 0 }).getState() as GameState, 40);
    expect(governorFound(st)).toBe(false);
    expect(buildGovernor(st, ctx).reason).toContain("Governor's Wreck");
  });

  it('the tiers are three different sentences, not three sizes', () => {
    expect(new Set(TIER_CAPABILITY_GOVERNOR).size).toBe(TIER_CAPABILITY_GOVERNOR.length);
    expect(machineLimit(withGovernor(1))).toBe(1);
    expect(machineLimit(withGovernor(2))).toBe(Infinity);
    expect(regulates(withGovernor(2))).toBe(false);
    const three = withGovernor(3);
    expect(regulates(three)).toBe(true);
    expect(tierOf(three, 'governor')).toBe(MAX_MACHINE_TIER);
  });

  /**
   * THE TOP TIER MUST NOT HAND BACK THE THROUGHPUT KNOB. The brief's warning
   * was that this machine is the one closest to a faucet, and the obvious
   * tier-III sentence — "off-spec no longer spoils the output" — would have
   * turned the whole ladder into a wait-for-tier-III purchase. It does not
   * exist: the risk is identical at every tier.
   */
  it('NO TIER REMOVES THE RISK — off-spec is the same at I, II and III', () => {
    for (const t of [1, 2, 3]) {
      const st = withGovernor(t);
      // A plant with ROOM, so tier III's regulation is not what is being read.
      // Without this the tier-III arm backed off to zero steps against a Hearth
      // that does not exist, and the test would have "passed" a different claim.
      st.kiln.built = true; st.kiln.heat = 100;
      buildSieve(st, ctx);
      setOverclock(st, ctx, 'sieve', MAX_OVERCLOCK);
      expect(stepsLive(st, 'sieve'), `tier ${t} was regulated, not read`).toBe(MAX_OVERCLOCK);
      expect(offSpecChance(st, 'sieve'), `tier ${t} changed the gamble`)
        .toBeCloseTo(OFFSPEC_PER_STEP * MAX_OVERCLOCK, 9);
    }
  });

  it('a tier-I Governor holds one machine, and says which one is already up', () => {
    const st = withGovernor(1);
    st.kiln.built = true;
    buildSieve(st, ctx);
    expect(setOverclock(st, ctx, 'sieve', 2).ok).toBe(true);
    const r = setOverclockBlocker(st, 'kiln', 1);
    expect(r).toContain('one machine at a time');
    expect(r).toContain('sieve');
    // ...and tier II takes both.
    const two = withGovernor(2);
    two.kiln.built = true;
    buildSieve(two, ctx);
    setOverclock(two, ctx, 'sieve', 2);
    expect(setOverclockBlocker(two, 'kiln', 1)).toBeNull();
  });

  it('it will not push a machine that is not built', () => {
    const st = withGovernor(2);
    expect(setOverclockBlocker(st, 'crucible', 1)).toContain('not built');
  });

  it('a cracked Governor holds nothing', () => {
    const st = withGovernor(1);
    buildSieve(st, ctx);
    expect(setOverclockBlocker(st, 'sieve', 1)).toBeNull();
    ensureCondition(st)['governor'] = { id: 'baked', level: 1, seized: true };
    expect(setOverclockBlocker(st, 'sieve', 1)).toContain('cracked');
  });
});

// ---------------------------------------------------------------------------
// 2 — THREE AXES, NOT ONE
// ---------------------------------------------------------------------------

describe('2 — faster, hungrier, and sometimes wrong', () => {
  it('speed rises linearly and Draw rises FASTER — the top step is a bad deal', () => {
    const st = withGovernor(2);
    buildSieve(st, ctx);
    for (let n = 0; n <= MAX_OVERCLOCK; n++) {
      setOverclock(st, ctx, 'sieve', n);
      expect(overclockSpeed(st, 'sieve')).toBeCloseTo(1 + OVERCLOCK_SPEED * n, 9);
      expect(overclockDraw(st, 'sieve')).toBeCloseTo(n === 0 ? 1 : 1 + OVERCLOCK_DRAW * n, 9);
    }
    // The shape, stated: every step costs more than it buys.
    expect(OVERCLOCK_DRAW).toBeGreaterThan(OVERCLOCK_SPEED);
  });

  it('the speed lands in `machineSpeed`, which is the plant\'s one answer', () => {
    const st = withGovernor(2);
    buildSieve(st, ctx);
    expect(machineSpeed(st, 'sieve')).toBe(1);
    setOverclock(st, ctx, 'sieve', 2);
    expect(machineSpeed(st, 'sieve')).toBeCloseTo(1 + OVERCLOCK_SPEED * 2, 9);
    // ...and a SEIZURE still wins, because zero times anything is zero.
    ensureCondition(st)['sieve'] = { id: 'baked', level: 1, seized: true };
    expect(conditionSpeed(st, 'sieve')).toBe(0);
    expect(machineSpeed(st, 'sieve')).toBe(0);
  });

  it('the setting is remembered, listed, and cleared by setting it to zero', () => {
    const st = withGovernor(2);
    buildSieve(st, ctx);
    expect(overclocked(st)).toEqual([]);
    setOverclock(st, ctx, 'sieve', 3);
    expect(overclocked(st)).toEqual([{ machineId: 'sieve', set: 3, live: 3 }]);
    setOverclock(st, ctx, 'sieve', 0);
    expect(overclocked(st)).toEqual([]);
    expect(stepsSet(st, 'sieve')).toBe(0);
  });

  it('and it refuses more steps than a machine has', () => {
    const st = withGovernor(2);
    buildSieve(st, ctx);
    expect(setOverclockBlocker(st, 'sieve', MAX_OVERCLOCK + 1)).toContain(String(MAX_OVERCLOCK));
  });
});

// ---------------------------------------------------------------------------
// 3 — THE PRICE IS CONTENDED
// ---------------------------------------------------------------------------

/**
 * "Spend extra Draw for speed" is only a decision if the Draw is scarce, and it
 * is: Flow is shared PROPORTIONALLY across every drawer. So the extra an
 * overclock takes comes out of the rest of the plant, which no amount of any
 * currency fixes.
 */
describe('3 — overclocking one machine slows the others', () => {
  function twoMachinePlant(tier = 2): GameState {
    const st = withGovernor(tier);
    st.kiln.built = true;
    st.kiln.feeding = true;
    st.kiln.heat = 0;
    buildSieve(st, ctx);
    return st;
  }

  it('the Kiln runs worse because the Sieve was pushed — nothing else changed', () => {
    const st = twoMachinePlant();
    const before = flowSatisfaction(st, 'kiln');
    setOverclock(st, ctx, 'sieve', MAX_OVERCLOCK);
    const after = flowSatisfaction(st, 'kiln');
    expect(before).toBeGreaterThan(0);
    expect(after, 'the plant did not feel it').toBeLessThan(before);
  });

  it('`demandNow` is where it is spent, and `demandOf` is untouched', () => {
    const st = twoMachinePlant();
    setOverclock(st, ctx, 'sieve', 2);
    expect(demandOf('sieve').flow).toBe(demandNow(st, 'sieve').flow / (1 + OVERCLOCK_DRAW * 2));
    expect(demandNow(st, 'kiln')).toEqual(demandOf('kiln'));
  });

  /** Tier III: a governor's actual job. */
  it('tier III backs a machine off when the plant cannot carry it; tier II does not', () => {
    const two = twoMachinePlant(2);
    setOverclock(two, ctx, 'sieve', MAX_OVERCLOCK);
    expect(flowSatisfaction(two, 'sieve')).toBeLessThan(1);
    expect(stepsLive(two, 'sieve'), 'a tier-II Governor backed off').toBe(MAX_OVERCLOCK);

    const three = twoMachinePlant(3);
    setOverclock(three, ctx, 'sieve', MAX_OVERCLOCK);
    expect(stepsLive(three, 'sieve')).toBeLessThan(stepsSet(three, 'sieve'));
    // ...and what it backs off to is what the plant can actually serve.
    expect(stepsLive(three, 'sieve')).toBeGreaterThanOrEqual(0);
    expect(offSpecChance(three, 'sieve')).toBeLessThan(offSpecChance(two, 'sieve'));
  });

  it('a plant with room is not regulated at all', () => {
    const st = twoMachinePlant(3);
    st.kiln.heat = 100;                       // a hot Hearth carries everything
    setOverclock(st, ctx, 'sieve', 1);
    expect(flowSatisfaction(st, 'sieve')).toBe(1);
    expect(stepsLive(st, 'sieve')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4 — THE RISK LANDS
// ---------------------------------------------------------------------------

describe('4 — off-spec: the tier you paid for, gambled', () => {
  it('a band lower is exactly what it does, and `poor` is the floor', () => {
    expect(bandOf(bandBelow(90))).toBe('good');    // fine -> good
    expect(bandOf(bandBelow(65))).toBe('fair');    // good -> fair
    expect(bandBelow(10)).toBe(10);                // poor is the floor: unharmed
  });

  it('at zero steps nothing ever goes off-spec, over ten thousand rolls', () => {
    const st = withGovernor(3);
    buildSieve(st, ctx);
    const rng = seeded(5);
    for (let i = 0; i < 10_000; i++) expect(rollOffSpec(st, 'sieve', 90, rng)).toBe(90);
    expect(ensureGovernor(st).offSpec).toBe(0);
  });

  it('at three steps it lands at the stated rate, and the panel can count it', () => {
    const st = withGovernor(2);
    buildSieve(st, ctx);
    setOverclock(st, ctx, 'sieve', 3);
    const rng = seeded(17);
    let spoiled = 0;
    const N = 20_000;
    for (let i = 0; i < N; i++) if (rollOffSpec(st, 'sieve', 90, rng) !== 90) spoiled += 1;
    const rate = spoiled / N;
    const want = OFFSPEC_PER_STEP * 3;
    expect(rate).toBeGreaterThan(want - 0.02);
    expect(rate).toBeLessThan(want + 0.02);
    expect(ensureGovernor(st).offSpec).toBe(spoiled);
    expect(ensureGovernor(st).lastOffSpec).toBe('sieve');
  });

  it('and it lands THROUGH the delivery seam, so it reaches every converter', () => {
    const st = withGovernor(2);
    buildSieve(st, ctx);
    setOverclock(st, ctx, 'sieve', 3);
    // An RNG that always fires: the unit arrives a band lower than it left.
    deliver(st, 'sieve', 'marl', 90, 1, () => 0);
    expect(Object.keys(st.materials.stacks['marl']!)).toEqual(['good']);
    expect(ensureGovernor(st).offSpec).toBe(1);
    // ...and with an RNG that never fires, it arrives whole.
    deliver(st, 'sieve', 'ochre', 90, 1, () => 1);
    expect(Object.keys(st.materials.stacks['ochre']!)).toEqual(['fine']);
  });

  it('a machine nobody pushed is never touched, whatever the RNG says', () => {
    const st = withGovernor(2);
    buildSieve(st, ctx);
    deliver(st, 'sieve', 'marl', 90, 1, () => 0);
    expect(Object.keys(st.materials.stacks['marl']!)).toEqual(['fine']);
    expect(ensureGovernor(st).offSpec).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5 — PILLAR 2
// ---------------------------------------------------------------------------

describe('5 — PILLAR 2: an overclock cannot make a unit, or a better one', () => {
  it('off-spec only ever makes a unit WORSE — it has no other outcome', () => {
    const st = withGovernor(2);
    buildSieve(st, ctx);
    setOverclock(st, ctx, 'sieve', 3);
    const rng = seeded(99);
    for (let p = 5; p <= 100; p += 5) {
      for (let i = 0; i < 200; i++) {
        expect(rollOffSpec(st, 'sieve', p, rng), `purity ${p} rose`).toBeLessThanOrEqual(p);
      }
    }
  });

  it('a delivery is still one unit, overclocked or not', () => {
    const st = withGovernor(2);
    buildSieve(st, ctx);
    setOverclock(st, ctx, 'sieve', 3);
    const drops = st.materials.totalDrops;
    deliver(st, 'sieve', 'marl', 90, 1, () => 0);
    const total = Object.values(st.materials.stacks)
      .reduce((n, per) => n + Object.values(per).reduce((a, s) => a + (s?.count ?? 0), 0), 0);
    expect(total).toBe(1);
    expect(st.materials.totalDrops).toBe(drops + 1);   // `deliver` counts one find
  });

  it('no currency moves when a setting changes', () => {
    const st = withGovernor(2);
    buildSieve(st, ctx);
    const before = JSON.stringify(st.currencies);
    setOverclock(st, ctx, 'sieve', 3);
    expect(JSON.stringify(st.currencies)).toBe(before);
  });

  it('dpsMax at the SAME depth is identical with EVERY machine at maximum', () => {
    const read = (run: boolean): number => {
      const st = withGovernor(3);
      st.depth = 62; // THE SAME DEPTH IN BOTH ARMS
      st.kiln.built = true;
      for (const id of conditionedMachines()) st.plant!.tiers[id] = MAX_MACHINE_TIER;
      if (run) {
        for (const id of conditionedMachines()) {
          if (id !== 'governor') setOverclock(st, ctx, id, MAX_OVERCLOCK);
        }
        addMaterial(st, 'marl', 90);
      }
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });
});
