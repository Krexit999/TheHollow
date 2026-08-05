/**
 * IS THE HEAT CORRIDOR REACHABLE? (§36.1 — measured A.100, closed A.101)
 *
 * A.99 wired the flood heat-leak and asserted the CORRIDOR falls out of the
 * arithmetic: floods within `LEAK_REACH` of each other compound. That test
 * pushed three station ids straight into `roll.flooded`, which proves the
 * arithmetic and nothing about the game — the exact shape PILLARS warns about
 * under "a test that a function works is not a test that anything calls it".
 *
 * A.100 asked the other question and got a bad answer: only a station of type
 * `flood` can ever be flooded, Cinder was the only shell with any, it had TWO,
 * and they sat 145 depths apart against a reach of 20. The mechanism was built
 * and no save could reach it.
 *
 * A.101 authored THE HEATWORKS — the Sluice (196), the Bank (210) and the
 * Overflow (224) — as one works rather than three convenient rooms. This file
 * still measures against AUTHORED CONTENT and never against a fixture: every
 * number below comes off `authoredRoll`, and the second half drives a delver
 * through the real flood verb instead of writing `roll.flooded`.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { allShells } from '../shells';
import { authoredRoll } from '../content/rolls';
import { LEAK_REACH, leakingStations, leakedHeat } from '../systems/condition';
import { floodStation, floodable, floodgateStation } from '../systems/flood';
import { markReached } from '../systems/roll';
import type { GameState } from '../types';

const ctx = () => ({ emit: () => {}, dirty: () => {} }) as never;
const seeded = (n: number) => () => {
  n = (n * 1103515245 + 12345) & 0x7fffffff;
  return n / 0x7fffffff;
};

/**
 * The most flooded stations that could ever be in leak range of ONE STANDING
 * PLACE. Derived from the Roll, never from a fixture.
 */
function widestCorridor(shellId: string): number {
  const floods = authoredRoll(shellId)
    .filter((d) => d.type === 'flood')
    .sort((a, b) => a.depth - b.depth);
  let best = 0;
  for (const anchor of floods) {
    const n = floods.filter((d) => Math.abs(d.depth - anchor.depth) <= LEAK_REACH).length;
    if (n > best) best = n;
  }
  return best;
}

describe('the corridor is reachable from authored content', () => {
  it('only a `flood` station can be flooded — the gate on all of this', () => {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    s.shell.current = 'cinder';
    s.roll = { rolled: {}, cleared: [], looted: [], shored: [], flooded: [], rolls: 0 } as never;
    for (const def of floodable(s)) expect(def.type).toBe('flood');
  });

  it('MEASURED: Cinder authors a corridor three wide, and no other shell has one', () => {
    const widths = allShells().map((sh) => [sh.id, widestCorridor(sh.id)] as const);
    expect(widths).toHaveLength(7);                    // it really walked seven Rolls
    const byId = Object.fromEntries(widths);
    expect(byId['cinder'], `by shell: ${widths.map((w) => `${w[0]}:${w[1]}`).join(' ')}`).toBe(3);
    for (const [id, w] of widths) {
      if (id === 'cinder') continue;
      expect(w, `${id} authors no floodable station`).toBe(0);
    }
  });

  it('THE HEATWORKS is one works, not three rooms at convenient depths', () => {
    const floods = authoredRoll('cinder').filter((d) => d.type === 'flood');
    expect(floods.map((d) => d.name))
      .toEqual(['The Sluice', 'The Bank', 'The Overflow', 'The Choke']);
    // Standing at the middle one puts all three inside the leak...
    for (const d of floods.slice(0, 3)) {
      expect(Math.abs(d.depth - 210), d.name).toBeLessThanOrEqual(LEAK_REACH);
    }
    // ...and the Choke is deliberately alone, so a corridor is a PLACE you go.
    expect(Math.abs(floods[3]!.depth - 210)).toBeGreaterThan(LEAK_REACH);
  });

  it('and it is late Cinder — past THE SLUMP, as §36.1 asks', () => {
    const slump = authoredRoll('cinder').find((d) => d.name === 'THE SLUMP')!;
    for (const d of authoredRoll('cinder').filter((x) => x.type === 'flood')) {
      expect(d.depth, d.name).toBeGreaterThan(slump.depth);
    }
  });
});

describe('a delver builds it with the real verb, and the plant feels it', () => {
  /** A Cinder player at the Bank with the Floodgate standing and parts to spend. */
  function atTheBank(): GameState {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    s.shell.current = 'cinder';
    s.roll = { rolled: {}, cleared: [], looted: [], shored: [], flooded: [], rolls: 0 } as GameState['roll'];
    (s.plant ??= { tiers: {}, builtOf: {} } as never);
    s.plant!.tiers['crusher'] = 1;
    /**
     * THE GATE IS A PLACE FIRST, so walk into it rather than setting the flag —
     * and `floodBlocker` refuses anything past your DEPTH RECORD for the same
     * reason shoring does ("you have to have stood in it"). Both of those are
     * the real gates and this fixture goes through them.
     */
    const gate = floodgateStation(s)!;
    s.depthRecords['cinder'] = gate.depth;
    s.depth = gate.depth;
    markReached(s, gate.depth, 15);
    s.roll!.floodgate = true;
    for (let i = 0; i < 40; i++) {
      (s.casting.rack as unknown[]).push({
        id: s.casting.nextId++, type: 'core', materialId: 'marl', purity: 50,
      });
    }
    s.currencies['ember'] = s.currencies['dust']!.mul(0).add(1e18);
    s.depth = 210;
    s.pressure.heat = 0;
    return s;
  }

  it('three floods, through `floodStation`, and all three are felt at the Bank', () => {
    const s = atTheBank();
    expect(leakingStations(s)).toEqual([]);
    for (const id of ['thesluice', 'thebank', 'theoverflow']) {
      const res = floodStation(s, ctx(), id, seeded(7));
      expect(res.ok, `${id}: ${String(res.reason)}`).toBe(true);
    }
    expect([...leakingStations(s)].sort())
      .toEqual(['thebank', 'theoverflow', 'thesluice']);
  });

  it('...and it compounds — a corridor is hotter than any one station in it', () => {
    const one = atTheBank();
    floodStation(one, ctx(), 'thebank', seeded(7));
    const single = leakedHeat(one);

    const all = atTheBank();
    for (const id of ['thesluice', 'thebank', 'theoverflow']) {
      floodStation(all, ctx(), id, seeded(7));
    }
    expect(leakedHeat(all)).toBeGreaterThan(single);
    expect(leakingStations(all)).toHaveLength(3);
  });

  it('walking out of the works leaves it behind — it is a place, not a buff', () => {
    const s = atTheBank();
    for (const id of ['thesluice', 'thebank', 'theoverflow']) {
      floodStation(s, ctx(), id, seeded(7));
    }
    expect(leakingStations(s)).toHaveLength(3);
    s.depth = 355;                                    // up at the Choke, alone
    expect(leakingStations(s)).toEqual([]);
    s.depth = 210;
    expect(leakingStations(s)).toHaveLength(3);
  });
});
