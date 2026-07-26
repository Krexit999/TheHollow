/**
 * DRILL ALLOYS — abilities, not stats.
 *
 * The thing under test is not "does the number apply". It is the four claims
 * the system is FOR:
 *   1. an ability changes a RULE the drills work by, and every one of them is
 *      still bounded by regen (pillar 2);
 *   2. a player with no alloy mines fine (pillar 1);
 *   3. what makes what is hinted, then confirmed on the make, and never listed
 *      before that (pillar 5);
 *   4. an alloy belongs to ONE DRILL, so a bay is a mix and not a setting
 *      (A.54) — and fitting one is always a pour, never a free toggle.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { EngineCtx, GameState } from '../types';
import { D } from '../decimal';
import { ModifierCache } from '../modifiers';
import { addMaterial, materialCount } from '../systems/forge';
import { newDrill, tickDrills } from '../systems/drills';
import {
  ARC_SHARE, ALLOY_POUR_BASE, POUR_SLOTS,
  alloyCost, arcTargets, attractDepthBonus, bayAbility, clearDrillAlloy, drillAbility,
  drillsCarrying, forgeDrillAlloy, knownAbilities, markResidue, markRichness,
  residueBite, residueLevel, richnessLevel, tickAlloys,
} from '../systems/drillAlloys';
import {
  ABILITY_BY_ID, DRILL_ABILITIES, alloyHint, matchDrillAlloy, traitPool,
} from '../content/drillAlloys';
import { MATERIAL_TRAITS } from '../traits';
import { MATERIALS } from '../materials';
import { allShells } from '../shells';

const ctx: EngineCtx = { emit() {}, dirty() {} };
const mods = () => new ModifierCache();
const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.drills.bayBuilt = true;
  s.forge.built = true;
  s.currencies['brick'] = D(10_000);
  return { engine, s };
};
/** A bay of `n` drills on a full face — the smallest thing that can strike. */
const bay = (s: GameState, n = 1) => {
  for (let i = 0; i < n; i++) s.drills.units.push(newDrill(`D${i}`));
  s.face.cells = s.face.cells.map(() => 8);
};
/** Put an ability straight into a drill, bypassing the bench, for the mechanism
 *  tests. The PRICED path is exercised separately in the discovery block. */
const fit = (s: GameState, id: string, index = 0) => {
  if (!s.drills.alloys.includes(id)) s.drills.alloys.push(id);
  s.drills.units[index]!.alloy = id;
};

// ---------------------------------------------------------------------------

describe('the framework', () => {
  it('every ability is a RULE with a kind and a hook, never a bare stat', () => {
    for (const a of DRILL_ABILITIES) {
      expect(['arc', 'attract', 'residue']).toContain(a.kind);
      expect(a.effect.length).toBeGreaterThan(10);
      expect(Object.keys(a.needs).length).toBeGreaterThan(0);
      expect(a.weight).toBeGreaterThan(0);
    }
  });

  /**
   * THE REACH RULE, and the test has to be strict about it or it proves
   * nothing: for EVERY shell, count only the materials that shell's own rock
   * actually drops (not worked, not combat-only), and require that its pool
   * alone satisfies every signature. An ability nobody can pour after Loam is
   * a dead system — the Silica problem, in a new place.
   */
  it('every signature is forgeable from EVERY shell\'s own mineable rock', () => {
    for (const shell of allShells()) {
      const mineable = MATERIALS.filter((m) => m.shellId === shell.id && !m.worked && !m.source);
      const pool: Record<string, number> = {};
      for (const m of mineable) {
        for (const t of MATERIAL_TRAITS[m.id] ?? []) pool[t] = (pool[t] ?? 0) + 1;
      }
      for (const a of DRILL_ABILITIES) {
        for (const [trait, n] of Object.entries(a.needs)) {
          expect(
            pool[trait] ?? 0,
            `${shell.id} cannot pour ${a.name}: only ${pool[trait] ?? 0} ${trait} materials drop there`,
          ).toBeGreaterThanOrEqual(n);
        }
      }
    }
  });

  it('matches on the POOLED traits, so the mix is the recipe and not a list', () => {
    // rootglass is charged+brittle, umberjade is brittle+charged — two charged
    // between them satisfies the arc, in either order.
    expect(matchDrillAlloy(['rootglass', 'umberjade'])?.id).toBe('arcvein');
    expect(matchDrillAlloy(['umberjade', 'rootglass'])?.id).toBe('arcvein');
    expect(traitPool(['rootglass', 'umberjade'])['charged']).toBe(2);
  });

  it('a mix that reaches for nothing is slag', () => {
    // marl is light+springy, wormsilk is springy+light — lively, and no
    // authored ability reads springy.
    expect(matchDrillAlloy(['marl', 'wormsilk'])).toBeNull();
    expect(matchDrillAlloy([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('the price is a decision (A.54)', () => {
  /**
   * A.53 charged a flat 20 for every ability, which is three drill upgrades —
   * so an ability that changes how the whole grid behaves cost less than the
   * chassis it went into, and swapping was a free toggle. The price now has to
   * read the ability's measured worth and the world you are standing in.
   */
  it('a stronger ability costs more than a weaker one', () => {
    const { s } = fresh();
    const arc = alloyCost(s, ABILITY_BY_ID.get('arcvein')!);
    const call = alloyCost(s, ABILITY_BY_ID.get('lodecall')!);
    expect(arc.conv).toBeGreaterThan(call.conv);
    expect(arc.materials).toBeGreaterThan(call.materials);
    // ...and it is a real spend, not a rounding error on a drill upgrade.
    expect(arc.conv).toBeGreaterThanOrEqual(ALLOY_POUR_BASE * 2);
  });

  it('a deeper shell pays more for the same ability', () => {
    const { s } = fresh();
    const loam = alloyCost(s, ABILITY_BY_ID.get('arcvein')!).conv;
    s.shell.current = 'ferrite';
    expect(alloyCost(s, ABILITY_BY_ID.get('arcvein')!).conv).toBeGreaterThan(loam);
  });

  it('every drill in the pour is paid for separately', () => {
    const { s } = fresh();
    const def = ABILITY_BY_ID.get('arcvein')!;
    const one = alloyCost(s, def, 1);
    const four = alloyCost(s, def, 4);
    expect(four.conv).toBe(one.conv * 4);
    expect(four.materials).toBe(one.materials * 4);
  });

  /** The load-bearing one: swapping is NOT free, and the brief said so. */
  it('re-alloying a drill that already has one costs the full price again', () => {
    const { s } = fresh();
    bay(s);
    const def = ABILITY_BY_ID.get('arcvein')!;
    const price = alloyCost(s, def, 1);
    for (const id of ['rootglass', 'umberjade']) addMaterial(s, id, 60, price.materials * 2);

    expect(forgeDrillAlloy(s, ctx, ['rootglass', 'umberjade'], [0]).ok).toBe(true);
    const brickAfterFirst = s.currencies['brick']!.toNumber();
    const heldAfterFirst = materialCount(s, 'rootglass');

    expect(forgeDrillAlloy(s, ctx, ['rootglass', 'umberjade'], [0]).ok).toBe(true);
    expect(s.currencies['brick']!.toNumber()).toBe(brickAfterFirst - price.conv);
    expect(materialCount(s, 'rootglass')).toBe(heldAfterFirst - price.materials);
  });

  /** But STOPPING is never a purchase. */
  it('pulling an alloy out costs nothing', () => {
    const { s } = fresh();
    bay(s);
    fit(s, 'arcvein');
    const brick = s.currencies['brick']!.toNumber();
    expect(clearDrillAlloy(s, 0).ok).toBe(true);
    expect(s.drills.units[0]!.alloy).toBeUndefined();
    expect(s.currencies['brick']!.toNumber()).toBe(brick);
  });

  it('a pour you cannot cover spends nothing at all', () => {
    const { s } = fresh();
    bay(s);
    addMaterial(s, 'rootglass', 60, 1);
    addMaterial(s, 'umberjade', 60, 1);
    s.currencies['brick'] = D(1);
    const before = materialCount(s, 'rootglass');
    expect(forgeDrillAlloy(s, ctx, ['rootglass', 'umberjade'], [0]).ok).toBe(false);
    expect(materialCount(s, 'rootglass')).toBe(before);
    expect(s.currencies['brick']!.toNumber()).toBe(1);
  });

  /** A miss is one firing of the bench however many drills were selected —
   *  experimenting must not be priced like committing. */
  it('a miss costs one pour, not one per drill', () => {
    const { s } = fresh();
    bay(s, 4);
    addMaterial(s, 'marl', 60, 20);
    addMaterial(s, 'wormsilk', 60, 20);
    const brick = s.currencies['brick']!.toNumber();
    const r = forgeDrillAlloy(s, ctx, ['marl', 'wormsilk'], [0, 1, 2, 3]);
    expect(r.ok).toBe(true);
    expect((r.data as { alloy: string | null }).alloy).toBeNull();
    expect(brick - s.currencies['brick']!.toNumber()).toBeLessThan(ALLOY_POUR_BASE * 2);
  });
});

// ---------------------------------------------------------------------------

describe('discovery — hinted, confirmed on the make, never listed', () => {
  it('the hint describes the MIX and names no ability (pillar 5)', () => {
    const hint = alloyHint(['rootglass', 'umberjade'])!;
    expect(hint.length).toBeGreaterThan(10);
    for (const a of DRILL_ABILITIES) expect(hint).not.toContain(a.name);
    // ...and it is a real signal, not a shrug: two of a trait says so.
    expect(hint).toMatch(/Strongly/);
    expect(alloyHint(['rootglass'])).not.toMatch(/Strongly/);
  });

  it('nothing is known until it has actually been poured', () => {
    const { s } = fresh();
    bay(s);
    expect(knownAbilities(s)).toEqual([]);
    expect(s.drills.alloys).toEqual([]);

    addMaterial(s, 'rootglass', 60, 8);
    addMaterial(s, 'umberjade', 60, 8);
    const r = forgeDrillAlloy(s, ctx, ['rootglass', 'umberjade'], [0]);
    expect(r.ok).toBe(true);
    expect((r.data as { alloy: string }).alloy).toBe('arcvein');
    expect(s.drills.alloys).toContain('arcvein');
    expect(knownAbilities(s).map((a) => a.id)).toEqual(['arcvein']);
  });

  it('the pour goes into the drill you aimed it at, and only that one', () => {
    const { s } = fresh();
    bay(s, 3);
    addMaterial(s, 'chthonite', 60, 8);
    addMaterial(s, 'temperash', 60, 8);
    forgeDrillAlloy(s, ctx, ['chthonite', 'temperash'], [1]);
    expect(drillAbility(s.drills.units[1]!)?.id).toBe('emberset');
    expect(drillAbility(s.drills.units[0]!)).toBeNull();
    expect(drillAbility(s.drills.units[2]!)).toBeNull();
    expect(drillsCarrying(s, 'emberset')).toEqual([1]);
  });

  it('one pour can fill several drills at once', () => {
    const { s } = fresh();
    bay(s, 4);
    addMaterial(s, 'chthonite', 60, 40);
    addMaterial(s, 'temperash', 60, 40);
    expect(forgeDrillAlloy(s, ctx, ['chthonite', 'temperash'], [0, 2, 3]).ok).toBe(true);
    expect(drillsCarrying(s, 'emberset')).toEqual([0, 2, 3]);
  });

  it('a miss still teaches: it names what the mix leaned toward', () => {
    const { s } = fresh();
    bay(s);
    addMaterial(s, 'marl', 60, 8);
    addMaterial(s, 'wormsilk', 60, 8);
    const r = forgeDrillAlloy(s, ctx, ['marl', 'wormsilk'], [0]);
    expect(r.ok).toBe(true);
    expect((r.data as { alloy: string | null }).alloy).toBeNull();
    expect((r.data as { reason: string }).reason).toMatch(/springy|light/);
    expect(s.drills.alloys).toEqual([]);
    expect(s.drills.units[0]!.alloy).toBeUndefined();
  });

  it('refuses what you do not hold, and refuses a pour with nowhere to go', () => {
    const { s } = fresh();
    bay(s);
    addMaterial(s, 'rootglass', 60, 8);
    expect(forgeDrillAlloy(s, ctx, ['rootglass', 'umberjade'], [0]).ok).toBe(false);
    addMaterial(s, 'umberjade', 60, 8);
    expect(forgeDrillAlloy(s, ctx, ['rootglass', 'umberjade'], []).ok).toBe(false);
    expect(forgeDrillAlloy(s, ctx, ['rootglass', 'umberjade'], [99]).ok).toBe(false);
    expect(forgeDrillAlloy(s, ctx, ['rootglass', 'umberjade'], [0]).ok).toBe(true);
  });

  it('refuses more than the crucible holds', () => {
    const { s } = fresh();
    bay(s);
    const ids = ['rootglass', 'umberjade', 'palegold', 'starmarl'];
    for (const id of ids) addMaterial(s, id, 60, 8);
    expect(forgeDrillAlloy(s, ctx, ids, [0]).ok).toBe(false);
    expect(ids.length).toBeGreaterThan(POUR_SLOTS);
  });
});

// ---------------------------------------------------------------------------

describe('THE ARC — the strike jumps', () => {
  const arc = () => ABILITY_BY_ID.get('arcvein')!;

  it('does nothing at all for a drill with no alloy', () => {
    const { s } = fresh();
    bay(s);
    expect(arcTargets(s, 0, () => false, null)).toEqual([]);
  });

  it('picks charged neighbours, and only as many as the alloy allows', () => {
    const { s } = fresh();
    bay(s);
    const t = arcTargets(s, 7, () => false, arc());
    expect(t.length).toBeGreaterThan(0);
    expect(t.length).toBeLessThanOrEqual(2);
    for (const i of t) expect(i).not.toBe(7);
  });

  it('never arcs into dead rock — an arc you cannot see is not an arc', () => {
    const { s } = fresh();
    bay(s);
    s.face.cells = s.face.cells.map(() => 0);
    s.face.cells[7] = 8;
    expect(arcTargets(s, 7, () => false, arc())).toEqual([]);
  });

  it('never arcs into a vined cell — the Growth law still owns those', () => {
    const { s } = fresh();
    bay(s);
    expect(arcTargets(s, 7, () => true, arc())).toEqual([]);
  });

  /**
   * PILLAR 2, the load-bearing one. The arc takes charge that was ALREADY in
   * the neighbouring cells. Over a window with NO regen, an arcing bay can
   * never extract more than the field held to begin with.
   */
  it('cannot pull more charge out of the field than the field contained', () => {
    const { s } = fresh();
    bay(s);
    fit(s, 'arcvein');
    s.upgrades['soil'] = 0;
    s.face.cells = s.face.cells.map(() => 8);
    const stored = s.face.cells.reduce((a, b) => a + b, 0);
    const before = s.stats.totalChargeChipped.toNumber();
    // One tick, no time for regen to matter beyond a sliver.
    tickDrills(s, mods(), ctx, 2);
    const taken = s.stats.totalChargeChipped.toNumber() - before;
    expect(taken).toBeLessThanOrEqual(stored);
    expect(ARC_SHARE).toBeLessThan(1); // and a jump is worth less than a strike
  });
});

// ---------------------------------------------------------------------------

describe('THE CALL — worked cells draw the richer seam', () => {
  const call = () => ABILITY_BY_ID.get('lodecall')!;

  it('gathers on the cell that is worked, and pays out on a threshold', () => {
    const { s } = fresh();
    bay(s);
    fit(s, 'lodecall');
    expect(attractDepthBonus(s, 3)).toBe(0);
    for (let i = 0; i < 6; i++) markRichness(s, 3, call());
    expect(richnessLevel(s, 3)).toBe(1);
    const bonus = attractDepthBonus(s, 3);
    expect(bonus).toBeGreaterThan(0);
    // Reading it spends the gather — periodic, not a permanent tilt.
    expect(attractDepthBonus(s, 3)).toBe(0);
    expect(richnessLevel(s, 3)).toBe(0);
  });

  it('is per-cell: working one does nothing for its neighbour', () => {
    const { s } = fresh();
    bay(s);
    fit(s, 'lodecall');
    for (let i = 0; i < 6; i++) markRichness(s, 3, call());
    expect(attractDepthBonus(s, 4)).toBe(0);
  });

  it('does nothing when nothing in the bay carries it', () => {
    const { s } = fresh();
    bay(s);
    for (let i = 0; i < 20; i++) markRichness(s, 3, null);
    expect(attractDepthBonus(s, 3)).toBe(0);
    fit(s, 'arcvein');
    for (let i = 0; i < 20; i++) markRichness(s, 3, drillAbility(s.drills.units[0]!));
    expect(attractDepthBonus(s, 3)).toBe(0);
  });

  /** PILLAR 2: it shifts WHAT drops, never how much charge the field gives. */
  it('touches the drop table and nothing on the income path', () => {
    const def = DRILL_ABILITIES.find((a) => a.id === 'lodecall')!;
    expect(def.kind).toBe('attract');
    expect(def.params['depthBonus']).toBeGreaterThan(0);
    // No yield/regen/cap term exists on it at all.
    expect(Object.keys(def.params).sort()).toEqual(['depthBonus', 'every']);
  });
});

// ---------------------------------------------------------------------------

describe('THE SET — worked rock stays soft', () => {
  const set = () => ABILITY_BY_ID.get('emberset')!;

  it('a marked cell gives a bigger BITE, and cools back to normal', () => {
    const { s } = fresh();
    bay(s);
    fit(s, 'emberset');
    expect(residueBite(s, 5)).toBe(1);
    markResidue(s, 5, set());
    expect(residueBite(s, 5)).toBeGreaterThan(1);
    expect(residueLevel(s, 5)).toBe(1);
    tickAlloys(s, 100);
    expect(residueBite(s, 5)).toBe(1);
    expect(residueLevel(s, 5)).toBe(0);
  });

  /**
   * PILLAR 2, stated as the design constraint it is: the brief offered "pay
   * more OR the next hit is bigger", and only the second is ceiling-safe. A
   * yield multiplier would move dpsMax = W·H·regen·Y; a bigger bite only
   * empties the same cell sooner.
   */
  it('is a bite multiplier, NOT a yield multiplier', () => {
    const def = DRILL_ABILITIES.find((a) => a.id === 'emberset')!;
    expect(Object.keys(def.params).sort()).toEqual(['bite', 'decay']);
    const { s } = fresh();
    bay(s);
    fit(s, 'emberset');
    s.face.cells = s.face.cells.map(() => 8);
    const stored = s.face.cells.reduce((a, b) => a + b, 0);
    for (const i of s.face.cells.keys()) markResidue(s, i, set());
    const before = s.stats.totalChargeChipped.toNumber();
    tickDrills(s, mods(), ctx, 2);
    expect(s.stats.totalChargeChipped.toNumber() - before).toBeLessThanOrEqual(stored);
  });

  it('a mark is not left by a drill that is not carrying it', () => {
    const { s } = fresh();
    bay(s);
    fit(s, 'arcvein');
    markResidue(s, 5, drillAbility(s.drills.units[0]!));
    expect(residueBite(s, 5)).toBe(1);
  });

  /**
   * THE SIM CAUGHT THIS AND THE TESTS HAD NOT. Every unit above passed while
   * emberset was worth 1.00x against a bare bay over six hours, because the
   * targeting rule picked the FULLEST cell and so could never come back to the
   * one it had just softened — an ability whose entire text is "the next bite
   * takes far more" never got a next bite. The rule now scores charge x bite,
   * and this is the property that keeps it honest.
   */
  it('the bay comes BACK to rock it softened — otherwise the ability is a lie', () => {
    const { s } = fresh();
    bay(s);
    fit(s, 'emberset');
    const drill = s.drills.units[0]!;
    drill.level = 20;
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      tickDrills(s, mods(), ctx, 5);
      seen.add(drill.lastCell);
    }
    // A face of 24-ish cells worked by one drill that keeps returning to the
    // soft one visits FAR fewer distinct cells than one that always chases the
    // fullest. The exact count is not the claim; the concentration is.
    expect(seen.size).toBeLessThan(s.face.cells.length / 2);
  });
});

// ---------------------------------------------------------------------------

describe('the bay is a MIX, not a setting (A.54)', () => {
  it('two drills can carry two different abilities at the same time', () => {
    const { s } = fresh();
    bay(s, 2);
    fit(s, 'arcvein', 0);
    fit(s, 'lodecall', 1);
    expect(drillAbility(s.drills.units[0]!)?.id).toBe('arcvein');
    expect(drillAbility(s.drills.units[1]!)?.id).toBe('lodecall');
    expect(drillsCarrying(s, 'arcvein')).toEqual([0]);
    expect(drillsCarrying(s, 'lodecall')).toEqual([1]);
    // And both are live at once, which the bay-wide slot could never do.
    expect(bayAbility(s, 'arc')?.id).toBe('arcvein');
    expect(bayAbility(s, 'attract')?.id).toBe('lodecall');
  });

  /**
   * THE MARK IS ON THE ROCK, and this is the property that makes a mix worth
   * assembling rather than a bay of clones: one drill softens a cell, and the
   * bare machine that comes to it next gets the bigger bite.
   */
  it('one drill softens rock that ANY drill then bites harder', () => {
    const { s } = fresh();
    bay(s, 2);
    fit(s, 'emberset', 0);
    expect(drillAbility(s.drills.units[1]!)).toBeNull();
    markResidue(s, 5, drillAbility(s.drills.units[0]!));
    // The reader does not ask who is biting — the rock is soft, full stop.
    expect(residueBite(s, 5)).toBeGreaterThan(1);
  });

  it('the marks stop meaning anything once nothing carries the ability', () => {
    const { s } = fresh();
    bay(s);
    fit(s, 'emberset');
    markResidue(s, 5, drillAbility(s.drills.units[0]!));
    expect(residueBite(s, 5)).toBeGreaterThan(1);
    clearDrillAlloy(s, 0);
    expect(residueBite(s, 5)).toBe(1);
    expect(residueLevel(s, 5)).toBe(0);
  });

  it('a mark cools even after the alloy that made it is gone', () => {
    const { s } = fresh();
    bay(s);
    fit(s, 'emberset');
    markResidue(s, 5, drillAbility(s.drills.units[0]!));
    clearDrillAlloy(s, 0);
    tickAlloys(s, 100);
    expect(s.drills.residue?.[5]).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('the pillars', () => {
  /** PILLAR 1: no alloy is ever required. */
  it('a bay with no alloy mines perfectly well', () => {
    const { s } = fresh();
    bay(s);
    expect(drillAbility(s.drills.units[0]!)).toBeNull();
    const before = s.totals['dust']?.toNumber() ?? 0;
    tickDrills(s, mods(), ctx, 30);
    expect((s.totals['dust']?.toNumber() ?? 0)).toBeGreaterThan(before);
  });

  it('a bay where only SOME drills are alloyed runs fine', () => {
    const { s } = fresh();
    bay(s, 4);
    fit(s, 'arcvein', 0);
    const before = s.totals['dust']?.toNumber() ?? 0;
    tickDrills(s, mods(), ctx, 30);
    expect((s.totals['dust']?.toNumber() ?? 0)).toBeGreaterThan(before);
  });

  /** THE REACH RULE, at the verb: the pour is priced in the shell's own coin. */
  it('the pour is paid in whatever world you are standing in', () => {
    const { s } = fresh();
    bay(s);
    s.shell.current = 'ferrite';
    s.currencies['brick'] = D(0);
    s.currencies['flux'] = D(5_000);
    const price = alloyCost(s, ABILITY_BY_ID.get('arcvein')!, 1);
    addMaterial(s, 'lodestone', 60, price.materials);
    addMaterial(s, 'polarite', 60, price.materials);
    const r = forgeDrillAlloy(s, ctx, ['lodestone', 'polarite'], [0]);
    expect(r.ok).toBe(true);
    expect((r.data as { alloy: string }).alloy).toBe('arcvein');
    expect(s.currencies['flux']!.toNumber()).toBe(5_000 - price.conv);
  });
});
