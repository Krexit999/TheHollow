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
import { ALL_GRANTS, ALL_SEALS, sealed, type ChallengeGrant, type ChallengeSeal } from '../laws';
import { createEngine } from '../index';
import { CHALLENGES } from '../content/challenges';
import { startChallenge } from '../systems/challenges';
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
  it('which is the ordinary state of the world', () => {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    for (const seal of ALL_SEALS) expect(sealed(s, seal), seal).toBe(false);
  });

  /*
   * THIS IS THE TEST A.102 SAID WOULD HAVE TO CHANGE, AND IT HAS (A.103).
   *
   * It used to read "which is the state the whole game is in today", asserting
   * the ledgered hole so it could not be mistaken for working: nothing called
   * `registerChallengeLaws`, nothing wrote `spiral.activeChallenge`, and every
   * one of the ten readers was live code with a predicate that was permanently
   * false. `content/challenges.ts` is the caller it was waiting for.
   *
   * What survives is the half that is still worth asserting — off is off — plus
   * the claim that matters more now: a seal can be turned ON. The full off/on
   * behaviour proof for all ten lives in `challenges.test.ts`, because a grep
   * over source can never tell "wired" from "wired to nothing", which is the
   * whole lesson this file was written to record.
   */
  it('...and every one of them CAN be turned on, which was the ledgered hole', () => {
    for (const c of CHALLENGES) {
      const s = createEngine({ nowMs: 0 }).getState() as GameState;
      s.spiral.count = 1;
      // THE HELD BREATH names a place (Cinder, or a world carrying its gauge)
      // and SABLE'S WALK names a depth. Both are real constraints and both are
      // satisfied here rather than routed around — see `challenges.test.ts`,
      // which lets each one refuse.
      s.shell.current = 'cinder';
      const r = startChallenge(s, { emit: Function.prototype as never, dirty: Function.prototype as never }, c.id);
      expect(r.ok, `${c.id}: ${String(r.reason)}`).toBe(true);
      for (const seal of Object.keys(c.laws).filter((k) => k.startsWith('seal'))) {
        expect(sealed(s, seal as ChallengeSeal), `${c.id} declares ${seal}`).toBe(true);
      }
    }
  });
});

/**
 * ...AND THE GRANT HALF, ADDED A.103.
 *
 * The permanent capabilities a challenge pays out are a second registry with
 * exactly the shape that went wrong the first time: a union of names, read at
 * one site each, easy to add to and easy to leave unread. Guarding only the
 * seals would leave the identical hole one door along, so this is the same
 * check pointed at `ALL_GRANTS`.
 */
describe('EVERY GRANT HAS A LIVE READER TOO', () => {
  function grantReaders(grant: string): string[] {
    return [...BODIES.entries()]
      .filter(([f, src]) => !f.endsWith(LAWS) && new RegExp(`keptLaw\\([^,]+,\\s*'${grant}'\\)`).test(src))
      .map(([f]) => f);
  }

  it('...outside engine/laws.ts and outside the tests', () => {
    const dead = ALL_GRANTS.filter((g) => grantReaders(g).length === 0);
    expect(dead, `grants nothing reads: ${dead.join(', ')}`).toEqual([]);
  });

  it('and the guard FAILS on a planted unwired grant', () => {
    // Red-tested, exactly as the seal guard above is. A name that appears in no
    // source file must come back with no readers.
    expect(grantReaders('grantNobodyReads')).toEqual([]);
    const planted = [...ALL_GRANTS, 'grantNobodyReads' as ChallengeGrant];
    expect(planted.filter((g) => grantReaders(g).length === 0)).toEqual(['grantNobodyReads']);
  });

  it('each grant CHANGES BEHAVIOUR in exactly one place — a capability, not a spray', () => {
    /*
     * The design rule, made structural: one grant, one behaviour site, in the
     * system its seal already touches. Two behaviour readers is how a boolean
     * quietly becomes a second modifier system nobody is auditing.
     *
     * A COMPONENT IS NOT A BEHAVIOUR SITE. `onecell` is read a second time in
     * panels.tsx, purely to decide whether to draw the button that dispatches
     * the verb — a row that would otherwise be a locked control, which LAW 3
     * forbids. That read cannot change what the game DOES; the engine reader
     * refuses the action either way (`reshapeFace` checks the grant itself and
     * `challenges.test.ts` drives that refusal). So components are excluded and
     * the rule stays exact for the ten things that matter.
     *
     * `sableswalk` lives in `ui/nav.ts` and is counted, because navigation is
     * where its seal already lives too — "which rooms exist" is not a component
     * detail, it is the answer the components are given.
     */
    const behaviour = (g: string) =>
      grantReaders(g).filter((f) => !f.includes(join('ui', 'components')));
    for (const g of ALL_GRANTS) {
      expect(behaviour(g), `${g} is read in: ${behaviour(g).join(', ')}`).toHaveLength(1);
    }
  });

  it('ALL_GRANTS matches the ten authored challenges', () => {
    expect(new Set(ALL_GRANTS).size).toBe(ALL_GRANTS.length);
    expect([...ALL_GRANTS].sort()).toEqual(CHALLENGES.map((c) => c.id).sort());
  });
});

/**
 * ...AND THE NUMERIC HALF, ADDED A.102.
 *
 * `ChallengeLaws` carries numeric overrides beside the ten booleans, and the
 * guard above never looked at them. A sweep found THREE with no reader
 * anywhere: `faceCells`, `encounterMult` (combat, deleted at A.7x) and
 * `axiomCap`. Same dead-name class A.82 cut four seals for, surviving in the
 * same file because the guard was pointed at one half of it.
 *
 * They are deleted. This is the check that stops the next one arriving.
 */
describe('every numeric challenge law has a live reader too', () => {
  /** The fields declared on `ChallengeLaws`, read off the source. */
  function declaredNumeric(): string[] {
    const src = readFileSync(join('src', 'engine', 'laws.ts'), 'utf8');
    const block = src.match(/export interface ChallengeLaws \{([\s\S]*?)\n\}/)![1]!;
    return [...block.matchAll(/^\s{2}(\w+)\?:\s*number;/gm)].map((m) => m[1]!);
  }

  /** ...and whether anything outside `laws.ts` asks `challengeNum` for it. */
  function reads(key: string): boolean {
    for (const [file, body] of BODIES) {
      if (file.includes(LAWS)) continue;
      // The call may wrap across lines, so the window spans newlines.
      if (new RegExp(`challengeNum[\\s\\S]{0,120}?'${key}'`).test(body)) return true;
    }
    return false;
  }

  it('the declared numeric laws are exactly the ones something reads', () => {
    const declared = declaredNumeric();
    expect(declared.length, 'it really found the fields').toBeGreaterThan(0);
    const dead = declared.filter((k) => !reads(k));
    expect(dead, 'numeric challenge laws with a name and no reader').toEqual([]);
  });

  it('...and the sweep can SEE a dead one — red-tested against a planted name', () => {
    // `faceCells` was real until A.102 and is read by nothing now. If a future
    // pass re-adds it without a reader, the check above fails; this proves the
    // check is capable of failing rather than merely passing.
    expect(reads('faceCells')).toBe(false);
    expect(reads('encounterMult')).toBe(false);
    expect(reads('axiomCap')).toBe(false);
    expect(declaredNumeric()).not.toContain('faceCells');
  });

  it('the three that remain are read, and named', () => {
    expect(declaredNumeric().sort()).toEqual(['depthCap', 'heatRateMult', 'regenMult']);
    for (const k of declaredNumeric()) expect(reads(k), k).toBe(true);
  });
});
