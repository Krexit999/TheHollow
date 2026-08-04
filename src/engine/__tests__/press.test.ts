/**
 * THE PRESS — DRAWING (§13, §11.1), A.92.
 *
 *   0  the ledger is a claim: check nothing here was already built
 *   1  the place, then the price, and tiers as capability
 *   2  END TO END: a billet pressed to plate, rod and wire
 *   3  THE VERB IT CHANGES — the three shapes you cannot pour, and the fact
 *      that NOTHING that was pourable before stopped being pourable
 *   4  stock is a real material, and the clone class cannot open here
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
import { ensureCondition } from '../systems/condition';
import { PART_SHAPES, PART_TYPES, SHAPE_AXES, shapesFor } from '../content/forgeParts';
import { canCast, castPart, chargeCrucible } from '../systems/casting';
import {
  BILLET_UNITS, FORMS, TIER_CAPABILITY_PRESS, buildPress, drawable, formOf, formForShape,
  formsAvailable, press, pressBlocker, pressBuilt, pressFound, pressStation, registerStock,
  stockHeld, stockId,
} from '../systems/press';
import { allAuthoredStations } from '../content/rolls';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;

function racked(st: GameState, n: number): GameState {
  st.casting.rack = Array.from({ length: n }, (_, i) =>
    ({ id: 8000 + i, materialId: 'marl', type: 'head', purity: 50 } as never));
  st.casting.nextId = 8000 + n;
  return st;
}

function walked(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'verdance';
  markReached(st, 290, 15);
  st.shell.current = 'loam';
  return racked(st, 24);
}

function withPress(tier = 1): GameState {
  const st = walked();
  for (let i = 0; i < tier; i++) buildPress(st, ctx);
  return st;
}

describe('0 — the ledger is a claim: nothing here was already built', () => {
  it('there was no `press` tier, no stock form, and no worked shape', () => {
    const fresh = createEngine({ nowMs: 0 }).getState() as GameState;
    expect(tierOf(fresh, 'press')).toBe(0);
    expect(formOf('marl')).toBeNull();
  });
});

describe('1 — the place, then the price (§6, §15.4)', () => {
  it('it is at Pressyard 120 in Verdance, exactly where §6 puts it', () => {
    expect(pressStation()).toEqual({ shellId: 'verdance', depth: 120, name: 'Pressyard' });
    // §6's own adjacency: the machine you need is the last thing before the wall.
    const choke = allAuthoredStations().find((s) => s.def.id === 'thechoke')!;
    expect(choke.def.depth).toBe(119);
  });

  it('a player who has not been there cannot raise it', () => {
    const st = racked(createEngine({ nowMs: 0 }).getState() as GameState, 24);
    expect(pressFound(st)).toBe(false);
    expect(buildPress(st, ctx).reason).toContain('Pressyard');
  });

  it('the tiers are three forms, not three sizes', () => {
    expect(new Set(TIER_CAPABILITY_PRESS).size).toBe(TIER_CAPABILITY_PRESS.length);
    expect(formsAvailable(withPress(1)).map((f) => f.id)).toEqual(['plate']);
    expect(formsAvailable(withPress(2)).map((f) => f.id)).toEqual(['plate', 'rod']);
    const three = withPress(3);
    expect(formsAvailable(three).map((f) => f.id)).toEqual(['plate', 'rod', 'wire']);
    expect(tierOf(three, 'press')).toBe(MAX_MACHINE_TIER);
  });

  it('and a tier-I Press refuses wire BY NAME', () => {
    const st = withPress(1);
    for (let i = 0; i < 4; i++) addMaterial(st, 'marl', 80);
    expect(pressBlocker(st, 'marl', 'fine', 'plate')).toBeNull();
    expect(pressBlocker(st, 'marl', 'fine', 'wire')).toContain('later tier');
  });

  it('and it is built from cast parts, remembering what it was cast from', () => {
    const st = walked();
    expect(pressBuilt(st)).toBe(false);
    expect(buildPress(st, ctx).ok).toBe(true);
    expect(st.plant!.builtOf!['press']).toContain('marl');
  });

  it('a cracked Press will not run — E2 reaches it like every machine', () => {
    const st = withPress(1);
    for (let i = 0; i < 4; i++) addMaterial(st, 'marl', 80);
    expect(pressBlocker(st, 'marl', 'fine', 'plate')).toBeNull();
    ensureCondition(st)['press'] = { id: 'baked', level: 1, seized: true };
    expect(pressBlocker(st, 'marl', 'fine', 'plate')).toContain('cracked');
  });
});

// ---------------------------------------------------------------------------
// 2 — END TO END
// ---------------------------------------------------------------------------

describe('2 — a billet drawn to plate, rod and wire', () => {
  it('all three forms, from the same stone, at the top tier', () => {
    const st = withPress(3);
    for (let i = 0; i < 12; i++) addMaterial(st, 'marl', 80);
    for (const f of FORMS) {
      const r = press(st, ctx, 'marl', 'fine', f.id);
      expect(r.ok, r.reason).toBe(true);
      expect(materialCount(st, stockId('marl', f.id))).toBe(1);
    }
    expect(stockHeld(st).map((s) => s.form).sort()).toEqual(['plate', 'rod', 'wire']);
    // TWO IN, ONE OUT, three times.
    expect(materialCount(st, 'marl')).toBe(12 - 3 * BILLET_UNITS);
  });

  it('a billet is two units AT ONE BAND, and the refusal says so', () => {
    const st = withPress(1);
    addMaterial(st, 'marl', 80);       // one unit only
    expect(pressBlocker(st, 'marl', 'fine', 'plate')).toContain(String(BILLET_UNITS));
    addMaterial(st, 'marl', 80);
    expect(pressBlocker(st, 'marl', 'fine', 'plate')).toBeNull();
  });

  it('stock cannot be pressed again — it has already been through', () => {
    const st = withPress(1);
    for (let i = 0; i < 4; i++) addMaterial(st, 'marl', 80);
    press(st, ctx, 'marl', 'fine', 'plate');
    const id = stockId('marl', 'plate');
    addMaterial(st, id, 80);           // two units of plate
    expect(pressBlocker(st, id, 'fine', 'plate')).toContain('already been through');
    expect(drawable(st).map((d) => d.materialId)).not.toContain(id);
  });
});

// ---------------------------------------------------------------------------
// 3 — THE VERB IT CHANGES
// ---------------------------------------------------------------------------

describe('3 — the three shapes you cannot pour', () => {
  it('each form is the only route to exactly one shape, on one part', () => {
    expect(FORMS.map((f) => f.shape)).toEqual(['rolled', 'drawn', 'wound']);
    expect(new Set(FORMS.map((f) => f.shape)).size).toBe(3);
    expect(shapesFor('core').map((s) => s.id)).toContain('rolled');
    expect(shapesFor('handle').map((s) => s.id)).toContain('drawn');
    expect(shapesFor('binding').map((s) => s.id)).toContain('wound');
    for (const f of FORMS) expect(formForShape(f.shape)).toBe(f.id);
  });

  it('a Rolled core cannot be poured from raw stone, and the refusal says why', () => {
    const st = withPress(1);
    for (let i = 0; i < 12; i++) addMaterial(st, 'marl', 90);
    st.forge.built = true;   // the casting floor is open
    chargeCrucible(st, ctx,'marl', 8);
    st.casting.crucible.queue[0]!.molten = 60;
    st.casting.crucible.queue[0]!.solid = 0;
    expect(canCast(st.casting.crucible, 'core', 'rolled')).toBe(false);
    const r = castPart(st, ctx, 'core', 'rolled');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('cannot be poured');
    expect(r.reason).toContain('plate');
  });

  it('...and IS cast the moment plate is in the tub', () => {
    const st = withPress(1);
    for (let i = 0; i < 12; i++) addMaterial(st, 'marl', 90);
    press(st, ctx, 'marl', 'fine', 'plate');
    press(st, ctx, 'marl', 'fine', 'plate');
    const id = stockId('marl', 'plate');
    st.forge.built = true;   // the casting floor is open
    chargeCrucible(st, ctx,id, 2);
    st.casting.crucible.queue[0]!.molten = 60;
    st.casting.crucible.queue[0]!.solid = 0;
    expect(canCast(st.casting.crucible, 'core', 'rolled')).toBe(true);
    const before = st.casting.rack.length;
    const r = castPart(st, ctx, 'core', 'rolled');
    expect(r.ok, r.reason).toBe(true);
    expect(st.casting.rack.length).toBe(before + 1);
    expect(st.casting.rack.at(-1)!.shape).toBe('rolled');
  });

  it('the WRONG stock is refused, and it names both forms', () => {
    const st = withPress(3);
    for (let i = 0; i < 12; i++) addMaterial(st, 'marl', 90);
    press(st, ctx, 'marl', 'fine', 'wire');
    st.forge.built = true;   // the casting floor is open
    chargeCrucible(st, ctx,stockId('marl', 'wire'), 1);
    st.casting.crucible.queue[0]!.molten = 60;
    st.casting.crucible.queue[0]!.solid = 0;
    const r = castPart(st, ctx, 'core', 'rolled');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('plate');
    expect(r.reason).toContain('wire');
  });

  /**
   * ADDED, NEVER SUBSTITUTED. This is the assertion that keeps the Press a
   * GATE and not a TAX: every shape that could be poured from raw stone before
   * this machine existed can still be poured from raw stone, at the same cost.
   */
  it('NOTHING that was pourable before stopped being pourable', () => {
    const st = createEngine({ nowMs: 0 }).getState() as GameState;   // NO Press
    for (let i = 0; i < 40; i++) addMaterial(st, 'marl', 90);
    st.forge.built = true;   // the casting floor is open
    chargeCrucible(st, ctx,'marl', 30);
    st.casting.crucible.queue[0]!.molten = 400;
    st.casting.crucible.queue[0]!.solid = 0;
    const worked = new Set(FORMS.map((f) => f.shape));
    let poured = 0;
    for (const type of PART_TYPES) {
      for (const s of shapesFor(type)) {
        if (worked.has(s.id)) continue;
        expect(canCast(st.casting.crucible, type, s.id), `${s.id} ${type} became unpourable`).toBe(true);
        poured += 1;
      }
    }
    expect(poured, 'the sweep checked nothing').toBeGreaterThan(18);
  });

  it('and the three worked shapes stay on the sanctioned axes (pillar 2)', () => {
    const allowed = new Set<string>(SHAPE_AXES);
    for (const f of FORMS) {
      const s = PART_SHAPES.find((x) => x.id === f.shape)!;
      for (const key of Object.keys(s.fx)) {
        expect(allowed.has(key), `${s.id} has an axis called ${key}`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4 — STOCK IS A REAL MATERIAL
// ---------------------------------------------------------------------------

describe('4 — stock is its stone, in a shape', () => {
  it('same shell, same rarity, same traits — a press does not transmute', () => {
    const def = registerStock('marl', 'plate')!;
    const src = materialDef('marl');
    expect(def.shellId).toBe(src.shellId);
    expect(def.rarity).toBe(src.rarity);
    expect(traitsOf(def.id)).toEqual(traitsOf('marl'));
    expect(def.worked).toBe(true);
  });

  /**
   * THE CLONE CLASS CANNOT OPEN HERE, and the reason is structural rather than
   * lucky: stock is its stone's (shell, rarity, traits) triple, so it WOULD
   * collide with its own source — which is exactly why it is `worked` rather
   * than a new stone. The clone check's population excludes worked materials
   * for the same reason it excludes grog and sprue.
   */
  it('it is `worked`, so it is out of the clone population by construction', () => {
    for (const f of FORMS) registerStock('marl', f.id);
    const stock = MATERIALS.filter((m) => FORMS.some((f) => m.id === stockId('marl', f.id)));
    expect(stock).toHaveLength(3);
    for (const s of stock) expect(s.worked, `${s.id} is in the clone population`).toBe(true);
  });

  it('and it cannot be dug up, anywhere', () => {
    const id = registerStock('marl', 'plate')!.id;
    const rng = (() => { let a = 31; return () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; }; })();
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const r = rollDrop('loam', i % 151, rng);
      if (r.kind === 'material') seen.add(r.materialId!);
    }
    expect(seen.has(id), 'stock came out of the rock').toBe(false);
    for (const { def } of allAuthoredStations()) {
      for (const s of [...(def.seams ?? []), ...(def.remains ?? []), ...(def.floodSeams ?? [])]) {
        expect(formOf(s), `${def.name} seams stock`).toBeNull();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 5 — PILLAR 2
// ---------------------------------------------------------------------------

describe('5 — PILLAR 2: it shapes and makes nothing', () => {
  it('two units in, one out — the draw is strictly lossy', () => {
    const st = withPress(1);
    for (let i = 0; i < 6; i++) addMaterial(st, 'marl', 80);
    const drops = st.materials.totalDrops;
    press(st, ctx, 'marl', 'fine', 'plate');
    const total = Object.values(st.materials.stacks)
      .reduce((n, per) => n + Object.values(per).reduce((a, s) => a + (s?.count ?? 0), 0), 0);
    expect(total, 'the Press made a unit').toBe(6 - BILLET_UNITS + 1);
    expect(st.materials.totalDrops, 'a conversion counted as a find').toBe(drops);
  });

  it('no currency moves', () => {
    const st = withPress(1);
    for (let i = 0; i < 4; i++) addMaterial(st, 'marl', 80);
    const before = JSON.stringify(st.currencies);
    press(st, ctx, 'marl', 'fine', 'plate');
    expect(JSON.stringify(st.currencies)).toBe(before);
  });

  it('dpsMax at the SAME depth is identical before and after', () => {
    const read = (run: boolean): number => {
      const st = withPress(3);
      st.depth = 62; // THE SAME DEPTH IN BOTH ARMS
      for (let i = 0; i < 6; i++) addMaterial(st, 'marl', 80);
      if (run) press(st, ctx, 'marl', 'fine', 'plate');
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });
});
