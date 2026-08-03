/**
 * CHALLENGE SEALS — the same structural guard the propositions have.
 *
 * `reading.test.ts` fails the build if a proposition has no live `proven()`
 * reader outside its own module. This is that guard, pointed at the seals,
 * because the seals are where the pattern went wrong first: nine of them were
 * read at fourteen guard sites and every one was permanently false for phases
 * (LEDGER.md), and four more were names in a union that NOTHING anywhere read.
 *
 * WHAT THIS GUARD DOES AND DOES NOT PROVE. It proves each seal has a reader —
 * that the name is connected to something. It does NOT prove a seal ever fires:
 * `registerChallengeLaws` still has no callers and nothing assigns
 * `spiral.activeChallenge`, so every guard below is live code with a predicate
 * that is always false. That hole is ledgered and is the rest of the work. A
 * test that cannot tell those two states apart would be the third instrument in
 * this project to report green over a dead system, so it says so out loud here.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_SEALS, sealed, type ChallengeSeal } from '../laws';
import { createEngine } from '../index';
import type { GameState } from '../types';

function sourceFiles(dir = 'src', out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__') continue;
      sourceFiles(p, out);
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

const FILES = sourceFiles();
const BODIES = new Map(FILES.map((f) => [f, readFileSync(f, 'utf8')]));
const LAWS = join('engine', 'laws.ts');

/** Files that read this seal, excluding the module that declares it. */
function readersOf(seal: string): string[] {
  return [...BODIES.entries()]
    .filter(([f, src]) => !f.endsWith(LAWS) && new RegExp(`sealed\\([^,]+,\\s*'${seal}'\\)`).test(src))
    .map(([f]) => f);
}

describe('EVERY SEAL HAS A LIVE READER', () => {
  it('...outside engine/laws.ts and outside the tests', () => {
    const dead = ALL_SEALS.filter((s) => readersOf(s).length === 0);
    expect(dead, `seals nothing reads: ${dead.join(', ')}`).toEqual([]);
  });

  it('and the guard FAILS on a seal nothing reads', () => {
    // Red-tested, because a grep guard that cannot fail is decoration. A name
    // that appears in no source file must come back with no readers — this is
    // the exact shape of the four cut at A.82.
    expect(readersOf('sealNobodyReads')).toEqual([]);
    const planted = [...ALL_SEALS, 'sealNobodyReads' as ChallengeSeal];
    const dead = planted.filter((s) => readersOf(s).length === 0);
    expect(dead).toEqual(['sealNobodyReads']);
  });

  it('ALL_SEALS matches the union it mirrors', () => {
    // A hand-maintained copy of a type drifts. This is cheap insurance: every
    // entry must be a key the ChallengeLaws shape actually accepts, which the
    // compiler checks by construction, and the count is pinned so a silent
    // addition to one and not the other is a failing test rather than a gap.
    expect(new Set(ALL_SEALS).size).toBe(ALL_SEALS.length);
    expect(ALL_SEALS).toHaveLength(10);
  });
});

describe('the four cut at A.82 are GONE, not deprecated', () => {
  it('no source file mentions them at all', () => {
    const cut = ['sealSignatures', 'sharedBank', 'sealWeather', 'sealFlee'];
    const survivors = cut.filter((c) =>
      [...BODIES.values()].some((src) => src.includes(`'${c}'`) || src.includes(`${c}?:`)));
    expect(survivors, `cut seals still present: ${survivors.join(', ')}`).toEqual([]);
  });
});

describe('and every seal reads FALSE while no challenge runs', () => {
  it('which is the state the whole game is in today', () => {
    // Not a nicety — this is the ledgered hole, asserted so it cannot be
    // mistaken for working. When `registerChallengeLaws` gains a caller and a
    // challenge can start, THIS test is the one that has to change.
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    for (const seal of ALL_SEALS) expect(sealed(s, seal), seal).toBe(false);
  });
});
