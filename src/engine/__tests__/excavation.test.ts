/**
 * EXCAVATION (Phase 3) — things too big to chip, cleared a shift per visit.
 *
 * The rules the brief set:
 *   1. Hand-built, at fixed depths above the floor, a handful across shells.
 *   2. Cleared a SHIFT PER VISIT — you must move off a site and come back for
 *      the next, so a big dig spans many visits. The reveal is shape-then-name.
 *   3. The reward is the reveal; a one-time keepsake at the end, never income.
 *   4. Progress is permanent — a Collapse never re-buries a dig.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { EXCAVATIONS, EXCAVATION_BY_ID } from '../content/excavations';
import { workExcavation, digShifts, excavationDone, clearDigStop } from '../systems/shaftSys';
import { doCollapse } from '../systems/collapseSys';
import { allShells } from '../shells';
import { getCurrency } from '../resources';
import { D } from '../decimal';

const ctx = { emit: () => {}, dirty: () => {} };
const mods = new ModifierCache();

/** Stand a fresh state exactly on a site. */
function onSite(id: string): GameState {
  const site = EXCAVATION_BY_ID.get(id)!;
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  s.shell.current = site.shell;
  s.depth = site.depth;
  s.shaft.reached = site.depth;
  s.shaft.lastDigDepth = -1;
  return s;
}

describe('RULE 1 — hand-built sites at fixed depths', () => {
  it('every site sits inside its shell, above the Breach floor, with staged reveals', () => {
    createEngine({ nowMs: 0 }); // ensure the shell registry is loaded
    const shellIds = new Set(allShells().map((sh) => sh.id));
    for (const e of EXCAVATIONS) {
      expect(shellIds.has(e.shell), `${e.id} shell`).toBe(true);
      const floor = allShells().find((sh) => sh.id === e.shell)!.floorDepth;
      expect(e.depth, `${e.id} depth`).toBeLessThan(floor);
      expect(e.stages.length, `${e.id} stages`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('RULE 2 — one shift per visit, shape before name', () => {
  it('a shift reveals the next stage, and refuses a second until you move off and return', () => {
    const s = onSite('loamSpine');
    const r1 = workExcavation(s, ctx, 'loamSpine');
    expect(r1.ok).toBe(true);
    expect(digShifts(s, 'loamSpine')).toBe(1);
    // A second shift, standing still, is refused.
    expect(workExcavation(s, ctx, 'loamSpine').ok).toBe(false);
    // Moving frees the next (clearDigStop is what climb/descend call).
    clearDigStop(s);
    expect(workExcavation(s, ctx, 'loamSpine').ok).toBe(true);
    expect(digShifts(s, 'loamSpine')).toBe(2);
  });

  it('you must be standing on it to work it', () => {
    const s = onSite('loamSpine');
    s.depth = 5; // not on the site (42)
    expect(workExcavation(s, ctx, 'loamSpine').ok).toBe(false);
  });
});

describe('RULE 3 — the reveal is the reward; the keepsake is one-time', () => {
  it('clearing to the last shift yields the find exactly once', () => {
    const site = EXCAVATION_BY_ID.get('loamSpine')!; // find: scrip 220
    const s = onSite('loamSpine');
    const before = getCurrency(s, 'scrip');
    for (let i = 0; i < site.stages.length; i++) { clearDigStop(s); workExcavation(s, ctx, 'loamSpine'); }
    expect(excavationDone(s, 'loamSpine')).toBe(true);
    expect(getCurrency(s, 'scrip').sub(before).toNumber()).toBe(220);
    // Working a finished dig does nothing and pays nothing more.
    clearDigStop(s);
    expect(workExcavation(s, ctx, 'loamSpine').ok).toBe(false);
    expect(getCurrency(s, 'scrip').sub(before).toNumber()).toBe(220);
  });

  it('an excavation never grants chip income — a keepsake is not a till', () => {
    const s = onSite('loamSpine');
    s.currencies['dust'] = D(0);
    for (let i = 0; i < 4; i++) { clearDigStop(s); workExcavation(s, ctx, 'loamSpine'); }
    expect((s.currencies['dust'] ?? D(0)).eq(0)).toBe(true);
  });
});

describe('RULE 4 — a dig, once uncovered, stays uncovered through a Collapse', () => {
  it('progress survives the cave-in', () => {
    const s = onSite('loamSpine');
    s.depth = 60; s.shaft.reached = 60; // deep enough for a Collapse to pay
    s.depthRecords['loam'] = 60; s.maxDepthRecord = 60;
    s.shaft.digs['loamSpine'] = 2;
    doCollapse(s, mods, ctx);
    expect(s.depth).toBe(0);
    expect(digShifts(s, 'loamSpine')).toBe(2); // the dig held
  });
});
