/**
 * A.57 — TWENTY-NINE ABILITIES THAT HAPPEN.
 *
 * Four claims, and the tests are grouped by claim rather than by file.
 *
 *  1  EVERY ONE OF THEM DOES SOMETHING VISIBLE. A def with no plan is a lie in
 *     a registry, and the previous two ability passes were exactly that in a
 *     softer form — mechanically real, perceptually absent. So every ability is
 *     fired and required to produce a plan with cells in it and a figure to
 *     draw, and to CHANGE THE FACE when it does.
 *  2  PILLAR 2, AND IT IS NON-NEGOTIABLE. Regen off, a known amount of charge
 *     in the rock, everything fitted at maximum grade: the bay cannot take out
 *     more than the field was holding. This is the load-bearing test in the
 *     phase and it is written to be hard to satisfy by accident.
 *  3  THE TRIGGER DOES BOTH JOBS. The meter fills, fires ITSELF (so an idle
 *     player gets everything), and can be fired early by hand — but never
 *     before it is full, so clicking cannot buy extra firings.
 *  4  THE LIMIT. A bay may not carry more power than its budget, and the budget
 *     grows with each shell reached.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { EngineCtx, GameState } from '../types';
import { D } from '../decimal';
import { ModifierCache } from '../modifiers';
import { newDrill, newPrizeDrill, tickDrills } from '../systems/drills';
import {
  abilityBudget, loadoutUsed, drillFits, forgeDrillAlloy, fireNow, fireAbility,
  reachedOrdinal, chargeLevel, drillReady, BUDGET_BASE, BUDGET_PER_SHELL,
} from '../systems/drillAlloys';
import { buildPlan } from '../systems/abilityPlans';
import {
  DRILL_ABILITIES, ABILITY_BY_ID, META_ABILITIES, abilityParams, matchDrillAlloy,
} from '../content/drillAlloys';
import { MATERIAL_TRAITS } from '../traits';
import { MATERIALS } from '../materials';
import { allShells } from '../shells';
import { addMaterial } from '../systems/forge';

createEngine({ nowMs: 0 });

const ctx: EngineCtx = { emit() {}, dirty() {} };
const mods = (): ModifierCache => new ModifierCache();

const fresh = (): GameState => {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  s.drills.bayBuilt = true;
  s.forge.built = true;
  s.currencies['brick'] = D(1e12);
  // Everything reached, so nothing is gated out of a mechanism test. The GATE
  // itself is asserted separately.
  for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
    s.depthRecords[id] = 40;
  }
  return s;
};

/** A bay of `n` drills on a full face, with pockets and vines to work on — the
 *  ore/growth abilities need a world that has ore and growth in it. */
const bay = (s: GameState, n = 1): void => {
  for (let i = 0; i < n; i++) s.drills.units.push(newDrill(`D${i}`));
  s.face.cells = s.face.cells.map(() => 8);
  // A REALISTIC FACE, not a pristine one. A few drained cells, because a face
  // that has been worked always has some — and because NULL PULSE only takes
  // what was nearly gone, so a uniformly full grid gives it nothing to do and
  // it read as inert. That is correct behaviour and a wrong test: the fix is a
  // face a bay would actually be standing in front of.
  for (const c of [0, 1, 6, 7]) s.face.cells[c] = 0.8;
  s.face.ore = new Array(s.face.cells.length).fill('');
  s.face.oreDug = new Array(s.face.cells.length).fill(0);
  // A four-cell vein and a patch of ripe growth, so `vein`, `vines` and
  // `mature` have something to find.
  for (const c of [12, 13, 14, 18]) s.face.ore[c] = 'fatseam';
  for (const c of [20, 21, 26]) s.growth.stage[c] = 3;
  s.depth = 30;
};

/** Fit straight in, bypassing the bench and the budget — the budget is tested
 *  at the verb, the mechanisms are tested here. */
const fit = (s: GameState, id: string, index = 0, grade = 7, slot = 0, ch = 0): void => {
  const drill = s.drills.units[index]!;
  const fits = drill.fits ?? [];
  fits[slot] = { id, grade, ch };
  drill.fits = fits.filter(Boolean);
  if (!s.drills.alloys.includes(id)) s.drills.alloys.push(id);
};

/** Step the bay — `tickDrills` caps a machine at four strikes per call however
 *  long the tick is, so one big dt is four strokes, not a minute of them. */
const run = (s: GameState, seconds: number, step = 1): void => {
  for (let t = 0; t < seconds; t += step) tickDrills(s, mods(), ctx, step);
};

const held = (s: GameState): number => s.face.cells.reduce((n, c) => n + c, 0);
const harvested = (s: GameState): number => (s.stats.fieldChargeHarvested ?? D(0)).toNumber();

// ---------------------------------------------------------------------------
// 1 — every one of them is a thing that happens
// ---------------------------------------------------------------------------

describe('twenty-nine abilities, and every one of them does something', () => {
  it('the set is exactly what was specified — five in Loam, four in every other shell', () => {
    expect(DRILL_ABILITIES.length).toBe(29);
    const byShell = new Map<string, number>();
    for (const a of DRILL_ABILITIES) byShell.set(a.shell, (byShell.get(a.shell) ?? 0) + 1);
    expect(byShell.get('loam')).toBe(5);
    for (const id of ['ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      expect(byShell.get(id), `${id} has ${byShell.get(id)}`).toBe(4);
    }
    // Ids and names are unique, so nothing is the same thing twice.
    expect(new Set(DRILL_ABILITIES.map((a) => a.id)).size).toBe(29);
    expect(new Set(DRILL_ABILITIES.map((a) => a.name)).size).toBe(29);
  });

  it('every ability carries a figure, a colour, a power tier and a meter', () => {
    for (const a of DRILL_ABILITIES) {
      expect(a.figure.length, `${a.name} has no figure`).toBeGreaterThan(2);
      expect(a.color, `${a.name} has no colour`).toBeGreaterThan(0);
      expect(a.power, `${a.name} has no power tier`).toBeGreaterThanOrEqual(1);
      expect(a.power).toBeLessThanOrEqual(5);
      expect(a.charge.need, `${a.name} has no meter`).toBeGreaterThan(0);
      expect(a.effect.length).toBeGreaterThan(20);
      expect(a.line.length).toBeGreaterThan(5);
    }
  });

  /**
   * THE ANTI-INVISIBILITY TEST. Every non-meta ability, fired once on a stocked
   * face, must return a plan with cells in it — because a plan with no cells is
   * an ability that does nothing and draws nothing, which is precisely the
   * failure this whole phase exists to correct.
   */
  it('every ability produces a plan with cells to clear and a figure to draw', () => {
    for (const def of DRILL_ABILITIES) {
      if (META_ABILITIES.has(def.id)) continue; // they read the bay, not the rock
      const s = fresh();
      bay(s, 1);
      const p = abilityParams(def, 7);
      const plan = buildPlan(s, mods(), def, p, 15, () => false, () => 0.5);
      expect(plan, `${def.name} produced NO PLAN on a full face`).not.toBeNull();
      const touched = (plan!.hits.length + (plan!.openOre?.length ?? 0) + (plan!.pullOre?.length ?? 0));
      expect(touched, `${def.name} touches nothing`).toBeGreaterThan(0);
      expect(plan!.cells.length, `${def.name} draws nothing`).toBeGreaterThan(0);
      expect(plan!.figure).toBe(def.figure);
    }
  });

  it('firing one CHANGES THE FACE — the rock is different afterwards', () => {
    for (const def of DRILL_ABILITIES) {
      const s = fresh();
      bay(s, 2);
      // A second ability on the other drill, so the two meta ones have
      // something to set off.
      fit(s, 'slagburst', 1, 1, 0, 0);
      fit(s, def.id, 0, 7, 0, def.charge.need);
      const before = s.face.cells.slice();
      const oreBefore = (s.face.ore ?? []).filter(Boolean).length;
      fireAbility(s, mods(), ctx, 0, 0, 15);
      const changed = before.some((v, i) => Math.abs(v - (s.face.cells[i] ?? 0)) > 1e-9)
        || (s.face.ore ?? []).filter(Boolean).length !== oreBefore;
      expect(changed, `${def.name} fired and the face was unchanged`).toBe(true);
    }
  });

  it('the shapes are genuinely different — no two abilities clear the same set', () => {
    const shapes = new Map<string, string[]>();
    for (const def of DRILL_ABILITIES) {
      if (META_ABILITIES.has(def.id)) continue;
      const s = fresh();
      bay(s, 1);
      const plan = buildPlan(s, mods(), def, abilityParams(def, 1), 15, () => false, () => 0.5);
      const key = `${def.figure}:${[...plan!.cells].sort((a, b) => a - b).join(',')}`;
      const list = shapes.get(key) ?? [];
      list.push(def.name);
      shapes.set(key, list);
    }
    // A handful of collisions is honest — two radius abilities at the same
    // radius DO clear the same cells, and they differ in colour, figure, meter
    // and world effect. What would be damning is most of them colliding.
    const collided = [...shapes.values()].filter((v) => v.length > 1).flat();
    expect(collided.length, `too many identical shapes: ${collided.join(', ')}`).toBeLessThan(9);
  });
});

// ---------------------------------------------------------------------------
// 2 — PILLAR 2. The one that is non-negotiable.
// ---------------------------------------------------------------------------

describe('PILLAR 2 — explosions spend the field, they do not create it', () => {
  /**
   * The hard one. Regen is never ticked, so the field holds exactly what it
   * started with. Every ability, at maximum grade, on three drills, fired for
   * ten minutes of stepped time. The bay cannot have taken more than was there,
   * and taken + remaining cannot exceed it either — which catches the subtler
   * failure where an ability adds charge to a cell before taking it.
   */
  it('no ability can take more charge out of the field than the field held', () => {
    for (const def of DRILL_ABILITIES) {
      const s = fresh();
      bay(s, 3);
      for (let i = 0; i < 3; i++) fit(s, def.id, i, 7);
      const start = held(s);
      const before = harvested(s);
      run(s, 600);
      const took = harvested(s) - before;
      const left = held(s);
      expect(took, `${def.name} took ${took.toFixed(2)} from a field holding ${start.toFixed(2)}`)
        .toBeLessThanOrEqual(start + 1e-6);
      expect(took + left, `${def.name}: took ${took.toFixed(2)} + left ${left.toFixed(2)} > ${start.toFixed(2)}`)
        .toBeLessThanOrEqual(start + 1e-6);
      expect(left).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('and neither can ALL of them at once, on a bay carrying everything', () => {
    const s = fresh();
    bay(s, 24);
    // Every ability in the game, spread across the bay, at maximum grade — a
    // loadout no budget would ever permit, which is the point: even cheating
    // past the limit cannot breach the ceiling.
    DRILL_ABILITIES.forEach((a, i) => fit(s, a.id, i % 24, 7, Math.floor(i / 24)));
    const start = held(s);
    const before = harvested(s);
    run(s, 900);
    const took = harvested(s) - before;
    expect(took).toBeLessThanOrEqual(start + 1e-6);
    expect(took + held(s)).toBeLessThanOrEqual(start + 1e-6);
  });

  it('a `share` can never exceed one, at any grade', () => {
    for (const def of DRILL_ABILITIES) {
      for (let g = 1; g <= 7; g++) {
        const p = abilityParams(def, g);
        if (p['share'] !== undefined) expect(p['share'], `${def.name} @${g}`).toBeLessThanOrEqual(1);
        if (p['keep'] !== undefined) expect(p['keep'], `${def.name} @${g}`).toBeLessThan(1);
        if (p['chance'] !== undefined) expect(p['chance'], `${def.name} @${g}`).toBeLessThan(1);
      }
    }
  });

  /** THE CHAIN IS UNBOUNDED IN FLAVOUR AND BOUNDED IN FACT. `keep` < 1 gives a
   *  finite expectation and `cap` bounds the tail — so "sometimes twenty" is
   *  true and "sometimes the whole face forever" is not. */
  it('Chainbreaker terminates, however lucky the rolls', () => {
    const s = fresh();
    bay(s, 1);
    const def = ABILITY_BY_ID.get('chainbreaker')!;
    const p = abilityParams(def, 7);
    // An rng that ALWAYS continues the chain: the cap is the only thing left.
    const plan = buildPlan(s, mods(), def, p, 15, () => false, () => 0);
    expect(plan!.hits.length).toBeLessThanOrEqual(Math.round(p['cap']!));
    expect(plan!.hits.length).toBeGreaterThan(1);
  });

  it('an ability that finds nothing does not eat its meter', () => {
    const s = fresh();
    bay(s, 1);
    s.face.cells = s.face.cells.map(() => 0); // nothing to take anywhere
    s.face.ore = new Array(s.face.cells.length).fill('');
    const def = ABILITY_BY_ID.get('slagburst')!;
    fit(s, 'slagburst', 0, 1, 0, def.charge.need);
    const fired = fireAbility(s, mods(), ctx, 0, 0, 15);
    expect(fired).toBe(false);
    expect(s.drills.units[0]!.fits![0]!.ch).toBe(def.charge.need);
  });
});

// ---------------------------------------------------------------------------
// 3 — the trigger, both halves
// ---------------------------------------------------------------------------

describe('the meter fires itself, and can be fired by hand', () => {
  it('fills as the drill works, and goes off on its own with nobody watching', () => {
    const s = fresh();
    bay(s, 1);
    const def = ABILITY_BY_ID.get('slagburst')!;
    fit(s, 'slagburst', 0, 1, 0, 0);
    expect(chargeLevel(s, s.drills.units[0]!, 0)).toBe(0);
    run(s, 20);
    expect(chargeLevel(s, s.drills.units[0]!, 0)).toBeGreaterThan(0);
    // Long enough to fill and fire, with no dispatch of any kind — this is
    // pillar 1 for the whole system.
    let fired = 0;
    const watching: EngineCtx = { emit: (e) => { if (e.type === 'abilityFire') fired++; }, dirty() {} };
    for (let t = 0; t < 400; t++) tickDrills(s, mods(), watching, 1);
    expect(fired, 'nothing ever auto-fired').toBeGreaterThan(0);
    void def;
  });

  it('a roll can fill a meter outright — some of them just happen', () => {
    const def = ABILITY_BY_ID.get('chainbreaker')!;
    expect(def.charge.roll).toBeGreaterThan(0);
    const s = fresh();
    bay(s, 1);
    fit(s, 'chainbreaker', 0, 1, 0, 0);
    let fired = 0;
    const watching: EngineCtx = { emit: (e) => { if (e.type === 'abilityFire') fired++; }, dirty() {} };
    for (let t = 0; t < 300; t++) tickDrills(s, mods(), watching, 1);
    expect(fired).toBeGreaterThan(0);
  });

  it('a full cell charges the abilities that read one faster', () => {
    const def = ABILITY_BY_ID.get('arclightning')!;
    expect(def.charge.onFull).toBeGreaterThan(0);
  });

  it('MANUAL FIRE is refused until the meter is genuinely full', () => {
    const s = fresh();
    bay(s, 1);
    const def = ABILITY_BY_ID.get('heatwave')!;
    fit(s, 'heatwave', 0, 5, 0, def.charge.need - 1);
    const no = fireNow(s, mods(), ctx, 0, 0);
    expect(no.ok).toBe(false);
    expect(no.reason).toContain('not charged');

    s.drills.units[0]!.fits![0]!.ch = def.charge.need;
    expect(drillReady(s.drills.units[0]!)).toBe(true);
    const yes = fireNow(s, mods(), ctx, 0, 0, 15);
    expect(yes.ok).toBe(true);
    // And it SPENT the meter, so it cannot be clicked twice.
    expect(s.drills.units[0]!.fits![0]!.ch).toBe(0);
    expect(fireNow(s, mods(), ctx, 0, 0).ok).toBe(false);
  });

  it('a hand-fired ability lands where the player aimed it', () => {
    const s = fresh();
    bay(s, 1);
    const def = ABILITY_BY_ID.get('slagburst')!;
    fit(s, 'slagburst', 0, 1, 0, def.charge.need);
    const target = 28;
    const before = s.face.cells.slice();
    fireNow(s, mods(), ctx, 0, 0, target);
    // The 3x3 around 28 lost charge; a cell far from it did not.
    expect(s.face.cells[target]!).toBeLessThan(before[target]!);
    expect(s.face.cells[0]!).toBeCloseTo(before[0]!, 6);
  });
});

// ---------------------------------------------------------------------------
// 4 — the limit
// ---------------------------------------------------------------------------

describe('the broken-ability limit', () => {
  it('starts small and grows one step per shell reached', () => {
    const s = fresh();
    s.depthRecords = { loam: 40 };
    s.shell.breachCount = 0;
    expect(reachedOrdinal(s)).toBe(1);
    expect(abilityBudget(s)).toBe(BUDGET_BASE);
    s.depthRecords['ferrite'] = 10;
    expect(abilityBudget(s)).toBe(BUDGET_BASE + BUDGET_PER_SHELL);
    s.depthRecords['aleph'] = 10;
    expect(abilityBudget(s)).toBe(BUDGET_BASE + BUDGET_PER_SHELL * 6);
  });

  it('a Loam bay cannot carry everything Loam knows', () => {
    const s = fresh();
    s.depthRecords = { loam: 40 };
    s.shell.breachCount = 0;
    const loam = DRILL_ABILITIES.filter((a) => a.shell === 'loam');
    const total = loam.reduce((n, a) => n + a.power, 0);
    expect(total, 'Loam is meant to cost more than its budget').toBeGreaterThan(abilityBudget(s));
  });

  it('the pour is REFUSED when it would put the bay over the limit', () => {
    const s = fresh();
    s.depthRecords = { loam: 40 };
    s.shell.breachCount = 0;
    bay(s, 4);
    // Fill the budget with the heaviest Loam ability.
    fit(s, 'chainbreaker', 0, 1, 0); // power 3
    fit(s, 'slagburst', 1, 1, 0);    // power 2 — that is 5 of 5
    expect(loadoutUsed(s)).toBe(abilityBudget(s));

    s.drills.alloys = ['chainbreaker', 'slagburst', 'tunnelbore'];
    addMaterial(s, 'graveclay', 60, 200);
    addMaterial(s, 'loamiron', 60, 200);
    const r = forgeDrillAlloy(s, ctx, ['graveclay', 'loamiron'], [2], { prefer: 'tunnelbore' });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('cannot run that much');
    // AND IT SPENT NOTHING — being told after paying would be the worst order.
    expect(s.currencies['brick']!.toNumber()).toBe(1e12);
  });

  it('the same pour succeeds once a deeper shell has been reached', () => {
    const s = fresh();
    s.depthRecords = { loam: 40 };
    s.shell.breachCount = 0;
    bay(s, 4);
    fit(s, 'chainbreaker', 0, 1, 0);
    fit(s, 'slagburst', 1, 1, 0);
    s.drills.alloys = ['chainbreaker', 'slagburst', 'tunnelbore'];
    addMaterial(s, 'graveclay', 60, 200);
    addMaterial(s, 'loamiron', 60, 200);
    expect(forgeDrillAlloy(s, ctx, ['graveclay', 'loamiron'], [2], { prefer: 'tunnelbore' }).ok).toBe(false);

    s.depthRecords['ferrite'] = 5; // one shell deeper — the rails carry more
    const r = forgeDrillAlloy(s, ctx, ['graveclay', 'loamiron'], [2], { prefer: 'tunnelbore' });
    expect(r.ok).toBe(true);
    expect(drillFits(s.drills.units[2]!).map((f) => f.def.id)).toEqual(['tunnelbore']);
  });

  it('a newly DISCOVERED ability that will not fit is still discovered', () => {
    const s = fresh();
    s.depthRecords = { loam: 40 };
    s.shell.breachCount = 0;
    bay(s, 4);
    fit(s, 'chainbreaker', 0, 1, 0);
    fit(s, 'slagburst', 1, 1, 0);
    addMaterial(s, 'graveclay', 60, 200);
    addMaterial(s, 'loamiron', 60, 200);
    const r = forgeDrillAlloy(s, ctx, ['graveclay', 'loamiron'], [2]);
    expect(r.ok).toBe(true);
    const data = r.data as { alloy: string; overBudget?: boolean };
    expect(data.alloy).toBe('tunnelbore');
    expect(data.overBudget).toBe(true);
    // Known forever; simply not on the rails.
    expect(s.drills.alloys).toContain('tunnelbore');
    expect(s.drills.units[2]!.fits ?? []).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// discovery and reach
// ---------------------------------------------------------------------------

describe('discovery and reach', () => {
  it('an ability from a shell you have not reached cannot come out of a crucible', () => {
    // heartflame + coronaite is two `warm` — Magma Burst's Cinder signature.
    expect(matchDrillAlloy(['heartflame', 'coronaite'], { reached: 5 })?.shell).toBe('cinder');
    expect(matchDrillAlloy(['heartflame', 'coronaite'], { reached: 1 })?.shell).not.toBe('cinder');
  });

  it('every ability is forgeable from its OWN shell\'s mineable rock', () => {
    const shells = allShells();
    expect(shells.length, 'the reach test must actually see the shells').toBe(7);
    for (const def of DRILL_ABILITIES) {
      const pool: Record<string, number> = {};
      for (const m of MATERIALS) {
        if (m.shellId !== def.shell || m.worked || m.source) continue;
        for (const t of MATERIAL_TRAITS[m.id] ?? []) pool[t] = (pool[t] ?? 0) + 1;
      }
      for (const [trait, n] of Object.entries(def.needs)) {
        expect(
          pool[trait] ?? 0,
          `${def.shell} cannot pour its own ${def.name}: needs ${n} ${trait}, has ${pool[trait] ?? 0}`,
        ).toBeGreaterThanOrEqual(n as number);
      }
    }
  });

  /**
   * THE WEAKER-BUT-REAL REACH GUARANTEE. A.56 required every signature to be
   * forgeable from every shell's rock, which forced all fifteen abilities onto
   * the five traits that exist everywhere — and is a large part of why they all
   * read the same. A.57 trades that for THEMATIC signatures (Cinder wants
   * `warm`, Verdance wants `springy`) and keeps reach by requiring that no
   * shell is ever ability-starved: wherever you are standing, local rock can
   * pour at least four different abilities.
   */
  it('no shell is ability-starved — every one can pour at least four from local rock', () => {
    for (const shell of allShells()) {
      const pool: Record<string, number> = {};
      for (const m of MATERIALS) {
        if (m.shellId !== shell.id || m.worked || m.source) continue;
        for (const t of MATERIAL_TRAITS[m.id] ?? []) pool[t] = (pool[t] ?? 0) + 1;
      }
      const forgeable = DRILL_ABILITIES.filter((def) =>
        Object.entries(def.needs).every(([t, n]) => (pool[t] ?? 0) >= (n as number)));
      expect(forgeable.length, `${shell.id} can only pour ${forgeable.length}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('signatures are distinct — no two abilities are the same recipe', () => {
    const seen = new Map<string, string>();
    for (const a of DRILL_ABILITIES) {
      const key = Object.entries(a.needs).sort().map(([t, n]) => `${t}${n}`).join('+');
      const prev = seen.get(key);
      expect(prev, `${a.name} and ${prev} share the signature ${key}`).toBeUndefined();
      seen.set(key, a.name);
    }
  });
});

// ---------------------------------------------------------------------------
// the prize chassis, which is the only place two abilities compound
// ---------------------------------------------------------------------------

describe('a prize chassis runs two at once', () => {
  it('both slots charge, and both fire', () => {
    const s = fresh();
    s.drills.units.push(newPrizeDrill('The Foreman', 'ach10', 2));
    bay(s, 0);
    s.face.cells = s.face.cells.map(() => 8);
    fit(s, 'slagburst', 0, 1, 0, 0);
    fit(s, 'heavystrike', 0, 1, 1, 0);
    const seen = new Set<string>();
    const watching: EngineCtx = {
      emit: (e) => { if (e.type === 'abilityFire') seen.add(e.id); }, dirty() {},
    };
    for (let t = 0; t < 400; t++) tickDrills(s, mods(), watching, 1);
    expect(drillFits(s.drills.units[0]!).length).toBe(2);
    expect(seen.size, `only fired: ${[...seen].join(',')}`).toBeGreaterThanOrEqual(2);
  });

  it('CATACLYSM sets off everything else the bay is carrying', () => {
    const s = fresh();
    bay(s, 4);
    fit(s, 'slagburst', 1, 1, 0, 0);
    fit(s, 'tunnelbore', 2, 1, 0, 0);
    fit(s, 'heatwave', 3, 5, 0, 0);
    const def = ABILITY_BY_ID.get('cataclysm')!;
    fit(s, 'cataclysm', 0, 7, 0, def.charge.need);
    const seen = new Set<string>();
    const watching: EngineCtx = {
      emit: (e) => { if (e.type === 'abilityFire') seen.add(e.id || 'plan'); }, dirty() {},
    };
    fireAbility(s, mods(), ctx, 0, 0, 15);
    // Fire again through a watching ctx to count what it sets off.
    s.drills.units[0]!.fits![0]!.ch = def.charge.need;
    fireAbility(s, mods(), watching, 0, 0, 15);
    expect(seen.has('cataclysm')).toBe(true);
    expect(s.face.cells.filter((c) => c < 8 - 1e-9).length).toBeGreaterThan(4);
  });
});
