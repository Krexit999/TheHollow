/**
 * NO MACHINE DESCRIBES A TIER NOBODY CAN BUILD (A.98).
 *
 * §15.4's table opens "Every machine runs I–V" and lists five capabilities.
 * `MAX_MACHINE_TIER` is **3**, and has been for the whole project — which is
 * why all twenty-two machines built before A.97 carry a FOUR-row capability
 * ladder ('not built' plus I, II, III). A.97 wrote SIX rows for the Axiom
 * Engine and six for the Seating, and four of those twelve rows described tiers
 * no player could ever reach: the Engine promised "every rule you can afford,
 * in one commit" at a tier that does not exist, and the Seating promised all
 * four bequests at another.
 *
 * The same mistake landed twice more in `seats.ts`, comparing `tierOf(...) < 5`
 * — which made SEAT I and SEAT IV both permanently unsatisfiable. Seat IV was
 * caught because §4's own wording was independently impossible; Seat I was not
 * caught at all, and would have sat there silently.
 *
 * That is the "put the invariant in the type, not in the reviewer" rule with no
 * type available: a capability ladder is prose in an array, and prose does not
 * typecheck against a constant. So it gets a test.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_MACHINE_TIER } from '../systems/plant';
import type { GameState } from '../types';

const SYS = join('src', 'engine', 'systems');

function systemSources(): Array<{ file: string; src: string }> {
  return readdirSync(SYS)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, src: readFileSync(join(SYS, f), 'utf8') }));
}

describe('a capability ladder has exactly one row per buildable tier', () => {
  it('every TIER_CAPABILITY_* array is MAX_MACHINE_TIER + 1 long', () => {
    const wrong: string[] = [];
    let found = 0;
    for (const { file, src } of systemSources()) {
      const m = src.match(/export const (TIER_CAPABILITY_\w+) = \[([\s\S]*?)\] as const;/);
      if (!m) continue;
      found += 1;
      const rows = m[2]!.split('\n').filter((l) => l.trim().startsWith("'")).length;
      if (rows !== MAX_MACHINE_TIER + 1) {
        wrong.push(`${file}: ${m[1]} has ${rows} rows, wants ${MAX_MACHINE_TIER + 1}`);
      }
    }
    // Not vacuous: there really are ladders to check.
    expect(found).toBeGreaterThan(20);
    expect(wrong).toEqual([]);
  });

  it('...and the check can SEE a wrong one — red-tested', () => {
    const fake = `export const TIER_CAPABILITY_FAKE = [
  'not built',
  'one',
  'two',
  'three',
  'four',
] as const;`;
    const m = fake.match(/export const (TIER_CAPABILITY_\w+) = \[([\s\S]*?)\] as const;/)!;
    const rows = m[2]!.split('\n').filter((l) => l.trim().startsWith("'")).length;
    expect(rows).not.toBe(MAX_MACHINE_TIER + 1);
  });
});

/**
 * ...AND THE SWEEP GOES WIDER THAN `systems/` (A.99).
 *
 * The first version of this guard read only `src/engine/systems`, which is
 * where the production bug was — and a wider sweep at A.99 found NINETEEN more
 * sites, every one of them a TEST OR DRIVER FIXTURE writing `tiers['x'] = 5`.
 *
 * That is not cosmetic. A fixture that seats a tier above the cap is asserting
 * against a world no player can ever stand in, so the test is green about
 * nothing — the same failure as an unsatisfiable gate, arriving from the other
 * side. Both halves are swept now.
 */
function allSources(): Array<{ file: string; src: string }> {
  const out: Array<{ file: string; src: string }> = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      // This file is full of deliberately-bad literals. It cannot sweep itself.
      else if (/\.tsx?$/.test(e) && !p.includes('tier-ladders')) {
        out.push({ file: p, src: readFileSync(p, 'utf8') });
      }
    }
  };
  walk('src');
  walk('scripts');
  return out;
}

describe('nothing gates on — or fixtures — a tier that cannot be built', () => {
  it('no tierOf() comparison in any system names a number above the cap', () => {
    const bad: string[] = [];
    for (const { file, src } of systemSources()) {
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const g = lines[i]!.match(/tierOf\([^)]*\)\s*[<>]=?\s*(\d+)/);
        if (g && Number(g[1]) > MAX_MACHINE_TIER) {
          bad.push(`${file}:${i + 1}  ${lines[i]!.trim()}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('and no test or driver SEATS one either — src/ and scripts/, both swept', () => {
    const bad: string[] = [];
    let swept = 0;
    for (const { file, src } of allSources()) {
      swept += 1;
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const g = lines[i]!.match(/tiers\[[^\]]+\]\s*=\s*(\d+)/)
          ?? lines[i]!.match(/tierOf\([^)]*\)\s*[<>]=?\s*(\d+)/);
        if (g && Number(g[1]) > MAX_MACHINE_TIER) {
          bad.push(`${file}:${i + 1}  ${lines[i]!.trim().slice(0, 80)}`);
        }
      }
    }
    expect(swept).toBeGreaterThan(300);     // it really walked the tree
    expect(bad).toEqual([]);
  });

  it('...and that check can SEE one too', () => {
    const line = `if (tierOf(state, 'refinery') < 5) return 'no';`;
    const g = line.match(/tierOf\([^)]*\)\s*[<>]=?\s*(\d+)/)!;
    expect(Number(g[1])).toBeGreaterThan(MAX_MACHINE_TIER);
  });
});

/**
 * AND THE TWO SEATS THE ABOVE WOULD HAVE CAUGHT, driven rather than grepped —
 * a grep proves the constant is gone, not that the condition can be met.
 */
describe('Seats I and IV are satisfiable at the tiers that exist', () => {
  it('Seat I: a Refinery at MAX_MACHINE_TIER satisfies it', async () => {
    const { createEngine } = await import('../index');
    const { seatCondition } = await import('../systems/seats');
    const { MAX_COMPACTION } = await import('../systems/compaction');
    const s = createEngine({ nowMs: 0 }).getState() as unknown as GameState & Record<string, any>;
    s.face.compaction = new Array(s.face.cells.length).fill(MAX_COMPACTION);
    expect(String(seatCondition(s, 'I'))).toMatch(/Refinery/);
    s.plant!.tiers['refinery'] = MAX_MACHINE_TIER;
    expect(seatCondition(s, 'I')).toBeNull();
  });

  it('Seat IV: white in the beam at the last tier, every point spent', async () => {
    const { createEngine } = await import('../index');
    const { seatCondition } = await import('../systems/seats');
    const { INTENSITY } = await import('../systems/prism');
    const s = createEngine({ nowMs: 0 }).getState() as unknown as GameState & Record<string, any>;
    s.spec = { bands: ['cinder', 'loam', 'hollow'], defect: 'hardwalls', live: true, poured: 1, learned: [] };

    expect(String(seatCondition(s, 'IV'))).toMatch(/No Prism/);
    s.plant!.tiers['prism'] = 1;
    expect(String(seatCondition(s, 'IV'))).toMatch(/cannot put white/);
    s.plant!.tiers['prism'] = MAX_MACHINE_TIER;
    s.prism = { intensity: [0, 1, 1, 1, 0, 0] };
    expect(String(seatCondition(s, 'IV'))).toMatch(/no white/);
    // White in the mix, and every point of intensity on the beam.
    s.prism = { intensity: [1, 1, 1, 0, 0, 0] };
    expect(s.prism.intensity.reduce((a, b) => a + b, 0)).toBe(INTENSITY);
    expect(seatCondition(s, 'IV')).toBeNull();
  });
});
