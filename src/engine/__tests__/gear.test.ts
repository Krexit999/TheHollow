/**
 * GEAR — three slots, and a refusal that has somewhere to send you.
 *
 * The first assertion in this file is the one that matters most: the shell must
 * HAVE a REST station. `rest` sat in `StationType` and in the label map for the
 * whole life of the Roll while Loam's fifteen stations never used it, so a
 * REST-only rule shipped against that geography would have refused every swap
 * forever — a system that cannot be used, behind a gate with no door.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { GEAR, GEAR_SLOTS } from '../content/shell1/gear';
import { atRest, ensureGear, nearestRest, wearing } from '../systems/gear';
import { shellRoll, rollRows, markReached } from '../systems/roll';
import { cellCap, dpsMax, manualChip } from '../systems/face';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ctx: EngineCtx = { emit() {}, dirty() {} };
function fresh(): { engine: Engine; s: GameState; m: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState, m: new ModifierCache() };
}
/** Own everything, wear nothing, and stand at a rest. */
function kitted(s: GameState): void {
  const g = ensureGear(s);
  g.owned = GEAR.map((x) => x.id);
  const rest = shellRoll(s).find((d) => d.type === 'rest');
  s.depth = rest!.depth;
}

describe('THE GATE HAS A DOOR', () => {
  it('the shell has at least one REST station', () => {
    const rests = shellRoll(fresh().s).filter((d) => d.type === 'rest');
    expect(rests.length, 'a REST-only rule against zero REST stations is a dead system')
      .toBeGreaterThan(0);
  });

  it('and `rest` is a type the Roll actually renders', () => {
    const { s } = fresh();
    const rows = rollRows(s);
    expect(rows.some((r) => r.type === 'rest')).toBe(true);
  });
});

describe('three slots, swapped at a REST and nowhere else', () => {
  it('refuses away from a rest, and NAMES where to go', () => {
    const { engine, s } = fresh();
    ensureGear(s).owned = ['sableslamp'];
    s.depth = 0; // the Turnrow — nowhere near either rest
    const r = engine.dispatch({ type: 'equipGear', slot: 'lamp', id: 'sableslamp' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/rest/i);
    // A refusal the player cannot act on reads as a bug, so it points at one.
    expect(r.reason).toMatch(/depth \d+/);
    expect(wearing(s, 'sableslamp')).toBe(false);
  });

  it('...and allows it at one', () => {
    const { engine, s } = fresh();
    kitted(s);
    expect(atRest(s).ok).toBe(true);
    expect(engine.dispatch({ type: 'equipGear', slot: 'lamp', id: 'sableslamp' }).ok).toBe(true);
    expect(wearing(s, 'sableslamp')).toBe(true);
  });

  it('three slots, and a piece only goes in its own', () => {
    const { engine, s } = fresh();
    kitted(s);
    expect(GEAR_SLOTS).toHaveLength(3);
    const r = engine.dispatch({ type: 'equipGear', slot: 'boots', id: 'sableslamp' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not worn there/i);
  });

  it('you cannot wear what you have not found', () => {
    const { engine, s } = fresh();
    const rest = shellRoll(s).find((d) => d.type === 'rest')!;
    s.depth = rest.depth;
    ensureGear(s).owned = [];
    expect(engine.dispatch({ type: 'equipGear', slot: 'lamp', id: 'sableslamp' }).ok).toBe(false);
  });

  it('all three slots hold at once — they are slots, not one setting', () => {
    const { engine, s } = fresh();
    kitted(s);
    engine.dispatch({ type: 'equipGear', slot: 'lamp', id: 'sableslamp' });
    engine.dispatch({ type: 'equipGear', slot: 'gloves', id: 'gravegloves' });
    engine.dispatch({ type: 'equipGear', slot: 'boots', id: 'feltboots' });
    expect(wearing(s, 'sableslamp') && wearing(s, 'gravegloves') && wearing(s, 'feltboots')).toBe(true);
  });

  it('nearestRest points somewhere real', () => {
    const { s } = fresh();
    s.depth = 0;
    const near = nearestRest(s);
    expect(near).not.toBeNull();
    expect(shellRoll(s).some((d) => d.type === 'rest' && d.name === near!.name)).toBe(true);
  });
});

describe('kit is found in wrecks, never bought (LAW 3)', () => {
  it('looting a wreck hands you what was in it, once', () => {
    const { s } = fresh();
    // Kiln Yard sits at depth 9 and holds Sable's Lamp.
    markReached(s, 9, 5);
    expect(ensureGear(s).owned).toContain('sableslamp');
    const n = ensureGear(s).owned.length;
    markReached(s, 9, 5); // already looted — nothing more falls out
    expect(ensureGear(s).owned).toHaveLength(n);
  });

  it('every piece names a wreck that exists', () => {
    const { s } = fresh();
    const ids = new Set(shellRoll(s).filter((d) => d.type === 'wreck').map((d) => d.id));
    const orphans = GEAR.filter((g) => !ids.has(g.fromWreck)).map((g) => g.id);
    expect(orphans, `kit nothing can drop: ${orphans.join(', ')}`).toEqual([]);
  });

  it('and every piece is READ somewhere outside its own module', () => {
    // The challenge-seal failure, guarded structurally: a worn piece that
    // nothing consults is a dead row that still takes a slot.
    const files: string[] = [];
    (function walk(dir: string): void {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== '__tests__') walk(p); }
        else if (p.endsWith('.ts') || p.endsWith('.tsx')) files.push(p);
      }
    })('src');
    const missing = GEAR.filter((g) => !files.some((f) =>
      !f.endsWith(join('systems', 'gear.ts'))
      && new RegExp(`wearing\\(\\s*state\\s*,\\s*'${g.id}'`).test(readFileSync(f, 'utf8'))))
      .map((g) => g.id);
    expect(missing, `unwired kit: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('PILLAR 2 — a fully kitted delver reads the bare ceiling', () => {
  it('all three slots filled moves dpsMax not at all', () => {
    /**
     * BOTH ARMS STAND AT THE SAME DEPTH. `kitted` walks the player to a REST
     * station to make the swap legal, and DEPTH PRESSURE is a `dustYield` term
     * — so a first cut compared depth 33 kitted against depth 0 bare and
     * reported 4.78 vs 2.88, a pillar-2 violation that was really a 33-step
     * descent. The fixture has to move the baseline too or it is measuring the
     * walk to the bench.
     */
    const bare = createEngine({ nowMs: 0 }).getState() as GameState;
    const restDepth = shellRoll(bare).find((d) => d.type === 'rest')!.depth;
    bare.depth = restDepth;
    const ceiling = dpsMax(bare, new ModifierCache()).toNumber();
    const { engine, s, m } = fresh();
    kitted(s);
    engine.dispatch({ type: 'equipGear', slot: 'lamp', id: 'sableslamp' });
    engine.dispatch({ type: 'equipGear', slot: 'gloves', id: 'gravegloves' });
    engine.dispatch({ type: 'equipGear', slot: 'boots', id: 'feltboots' });
    m.invalidate();
    expect(dpsMax(s, m).toNumber()).toBeCloseTo(ceiling, 6);
  });

  it('and one chip pays the same in kit as out of it', () => {
    const paid = (kit: boolean): number => {
      const { engine, s, m } = fresh();
      if (kit) {
        kitted(s);
        for (const g of GEAR) engine.dispatch({ type: 'equipGear', slot: g.slot, id: g.id });
      }
      s.face.cells[0] = cellCap(s, m);
      return manualChip(s, m, ctx, 0).charge;
    };
    expect(paid(true)).toBeCloseTo(paid(false), 6);
  });
});

describe('the six effects are six DIFFERENT capabilities', () => {
  it("SABLE'S LAMP reads one station further than bare", () => {
    const legible = (kit: boolean): number => {
      const { engine, s } = fresh();
      if (kit) { kitted(s); engine.dispatch({ type: 'equipGear', slot: 'lamp', id: 'sableslamp' }); }
      s.depth = 0;
      return rollRows(s).filter((r) => r.legible).length;
    };
    expect(legible(true)).toBeGreaterThan(legible(false));
  });

  it('THE ASH LAMP reads the hazard rows, which the other lamp does not', () => {
    const hazardLegible = (id: string | null): boolean => {
      const { engine, s } = fresh();
      kitted(s);
      if (id) engine.dispatch({ type: 'equipGear', slot: 'lamp', id });
      s.depth = 0; // The Ashfall is at 72 — far out of ordinary sight
      return rollRows(s).some((r) => r.type === 'hazard' && r.legible);
    };
    expect(hazardLegible(null)).toBe(false);
    expect(hazardLegible('sableslamp')).toBe(false); // reading FURTHER is not enough
    expect(hazardLegible('ashlamp')).toBe(true);
  });

  it('CHALKED GRIPS pack a cell a bare hand cannot', () => {
    const packed = (kit: boolean): number => {
      const { engine, s, m } = fresh();
      if (kit) { kitted(s); engine.dispatch({ type: 'equipGear', slot: 'gloves', id: 'chalkgloves' }); }
      s.depth = 0;
      s.face.cells[0] = 0; // nothing to take
      manualChip(s, m, ctx, 0);
      return s.face.compaction?.[0] ?? 0;
    };
    expect(packed(false)).toBe(0);
    expect(packed(true)).toBeGreaterThan(0);
  });
});
