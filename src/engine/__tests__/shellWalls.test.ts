/**
 * THE UNMINEABLE (Phase 4) — the wall of the shell.
 *
 * It is not a puzzle and not a reward. The tests hold the three jobs the brief set:
 *   1. it READS you — more depth, more Recursions, more Axioms show more;
 *   2. Sable's marks come back in a DIFFERENT ORDER each Recursion;
 *   3. Axioms act on it — the First Word reads the whole writing.
 * And the invariant: reading it never writes state, and it is one per shell.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { SHELL_WALLS, SABLE_MARKS, wallReading } from '../content/shellWalls';
import { allShells } from '../shells';

function fresh(): GameState {
  return createEngine({ nowMs: 0 }).getState() as GameState;
}

describe('the unmineable is one per shell, at a fixed depth below the floor', () => {
  it('every shell has exactly one wall, above its Breach floor', () => {
    for (const sh of allShells()) {
      const walls = SHELL_WALLS.filter((w) => w.shell === sh.id);
      expect(walls.length, `${sh.id} wall count`).toBe(1);
      expect(walls[0]!.depth, `${sh.id} wall depth`).toBeLessThan(sh.floorDepth);
    }
  });
});

describe('RULE 1 — it reads you', () => {
  it('shows more the deeper you have been and the more you have Recursed', () => {
    const shallow = fresh();
    shallow.depthRecords['loam'] = 10; // not down to the wall (130)
    const a = wallReading(shallow, 'loam')!;

    const deep = fresh();
    deep.depthRecords['loam'] = 150; // past the wall
    deep.recursion.count = 2;
    deep.recursion.axioms = ['unemptying', 'twoHands', 'gentleFall'];
    const b = wallReading(deep, 'loam')!;

    expect(b.mirror.length).toBeGreaterThan(a.mirror.length); // more of it is legible
    expect(b.marks.length).toBeGreaterThan(a.marks.length);
    expect(b.law.length).toBe(3); // every written law reached this deep
  });
});

describe('RULE 2 — Sable\'s marks return in a different order each Recursion', () => {
  it('the same marks, permuted by recursion count', () => {
    const s0 = fresh(); s0.depthRecords['loam'] = 150; s0.recursion.count = 0;
    const s1 = fresh(); s1.depthRecords['loam'] = 150; s1.recursion.count = 1;
    const r0 = wallReading(s0, 'loam')!.marks;
    const r1 = wallReading(s1, 'loam')!.marks;
    // Both are drawn from the one set of marks...
    for (const m of r0) expect(SABLE_MARKS).toContain(m);
    // ...but the order the reader meets them in differs across the reset.
    expect(r1[0]).not.toBe(r0[0]);
  });
});

describe('RULE 3 — an Axiom acts on it', () => {
  it('The First Word reads the whole writing, whatever your depth', () => {
    const s = fresh();
    s.depthRecords['loam'] = 5; // barely in the shell
    s.recursion.axioms = ['firstWord'];
    expect(wallReading(s, 'loam')!.marks.length).toBe(SABLE_MARKS.length);
  });
});

describe('reading the wall is pure — it never writes state', () => {
  it('two reads leave the state identical', () => {
    const s = fresh();
    s.depthRecords['loam'] = 150; s.recursion.count = 1;
    const snap = JSON.stringify(s.recursion) + JSON.stringify(s.depthRecords) + JSON.stringify(s.shaft);
    wallReading(s, 'loam'); wallReading(s, 'loam');
    expect(JSON.stringify(s.recursion) + JSON.stringify(s.depthRecords) + JSON.stringify(s.shaft)).toBe(snap);
  });
});
