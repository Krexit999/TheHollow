/**
 * IS THE HEAT CORRIDOR REACHABLE? (§36.1, measured A.100)
 *
 * A.99 wired the flood heat-leak and asserted the CORRIDOR falls out of the
 * arithmetic: floods within `LEAK_REACH` of each other compound. That test
 * pushed three station ids straight into `roll.flooded`, which proves the
 * arithmetic and nothing about the game — the exact shape PILLARS warns about
 * under "a test that a function works is not a test that anything calls it".
 *
 * Only a station of type `flood` can ever be flooded (`floodable`). So this
 * asks the question the A.99 test did not: how wide a corridor can a player
 * actually build out of AUTHORED content?
 *
 * The answer is ONE, in one shell. Cinder authors two floodable stations and
 * they sit further apart than the leak reaches, so no save can hold two
 * flooded stations in one band — let alone the three §36.1 describes.
 *
 * This test PINS that number rather than asserting the feature works. When a
 * pass authors the stations, this fails and says so, which is the only way a
 * measured gap stays measured.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { allShells } from '../shells';
import { authoredRoll } from '../content/rolls';
import { LEAK_REACH } from '../systems/condition';
import type { GameState } from '../types';

/** The most flooded stations that could ever be in leak range of one another. */
function widestCorridor(shellId: string): number {
  const floodable = authoredRoll(shellId)
    .filter((d) => d.type === 'flood')
    .sort((a, b) => a.depth - b.depth);
  let best = 0;
  for (const anchor of floodable) {
    const n = floodable.filter((d) => Math.abs(d.depth - anchor.depth) <= LEAK_REACH).length;
    if (n > best) best = n;
  }
  return best;
}

describe('the corridor mechanism is built and the content cannot reach it', () => {
  it('only a `flood` station can be flooded — the gate on all of this', async () => {
    const { floodable } = await import('../systems/flood');
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    s.roll = { rolled: {}, cleared: [], looted: [], shored: [], flooded: [], rolls: 0 } as never;
    for (const def of floodable(s)) expect(def.type).toBe('flood');
  });

  it('MEASURED: the widest corridor any shell can author is 1', () => {
    const widths = allShells().map((sh) => [sh.id, widestCorridor(sh.id)] as const);
    // Not vacuous: it really walked seven Rolls.
    expect(widths).toHaveLength(7);
    const best = Math.max(...widths.map((w) => w[1]));
    expect(best, `widest corridor by shell: ${widths.map((w) => `${w[0]}:${w[1]}`).join(' ')}`)
      .toBe(1);
  });

  it('...and Cinder — the only shell with any — authors two, too far apart', () => {
    const floods = authoredRoll('cinder').filter((d) => d.type === 'flood');
    expect(floods).toHaveLength(2);
    const gap = Math.abs(floods[0]!.depth - floods[1]!.depth);
    expect(gap).toBeGreaterThan(LEAK_REACH);
  });
});
