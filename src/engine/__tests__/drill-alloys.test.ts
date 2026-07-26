/**
 * DRILL ALLOYS (A.53) — abilities, not stats.
 *
 * The thing under test is not "does the number apply". It is the three claims
 * the system is FOR:
 *   1. an ability changes a RULE the drills work by, and every one of them is
 *      still bounded by regen (pillar 2);
 *   2. a player with no alloy mines fine (pillar 1);
 *   3. what makes what is hinted, then confirmed on the make, and never listed
 *      before that (pillar 5).
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { EngineCtx, GameState } from '../types';
import { D } from '../decimal';
import { ModifierCache } from '../modifiers';
import { addMaterial } from '../systems/forge';
import { newDrill, tickDrills } from '../systems/drills';
import {
  ARC_SHARE, ALLOY_POUR_COST, POUR_SLOTS,
  arcTargets, attractDepthBonus, equipDrillAlloy, equippedAbility, forgeDrillAlloy,
  knownAbilities, markResidue, markRichness, residueBite, residueLevel, richnessLevel,
  setEquippedAlloy, tickAlloys,
} from '../systems/drillAlloys';
import {
  DRILL_ABILITIES, alloyHint, matchDrillAlloy, traitPool,
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
/** A bay of one drill on a full face — the smallest thing that can strike. */
const bay = (s: GameState) => {
  s.drills.units.push(newDrill('Bess'));
  s.face.cells = s.face.cells.map(() => 8);
};

// ---------------------------------------------------------------------------

describe('the framework', () => {
  it('every ability is a RULE with a kind and a hook, never a bare stat', () => {
    for (const a of DRILL_ABILITIES) {
      expect(['arc', 'attract', 'residue']).toContain(a.kind);
      expect(a.effect.length).toBeGreaterThan(10);
      expect(Object.keys(a.needs).length).toBeGreaterThan(0);
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
    expect(knownAbilities(s)).toEqual([]);
    expect(s.drills.alloys).toEqual([]);

    addMaterial(s, 'rootglass', 60, 2);
    addMaterial(s, 'umberjade', 60, 2);
    const r = forgeDrillAlloy(s, ctx, ['rootglass', 'umberjade']);
    expect(r.ok).toBe(true);
    expect((r.data as { alloy: string }).alloy).toBe('arcvein');
    expect(s.drills.alloys).toContain('arcvein');
    expect(knownAbilities(s).map((a) => a.id)).toEqual(['arcvein']);
  });

  it('a first alloy fits itself — a discovery should not need a second click', () => {
    const { s } = fresh();
    addMaterial(s, 'chthonite', 60, 2);
    addMaterial(s, 'temperash', 60, 2);
    forgeDrillAlloy(s, ctx, ['chthonite', 'temperash']);
    expect(equippedAbility(s)?.id).toBe('emberset');
  });

  it('a miss still teaches: it names what the mix leaned toward', () => {
    const { s } = fresh();
    addMaterial(s, 'marl', 60, 1);
    addMaterial(s, 'wormsilk', 60, 1);
    const r = forgeDrillAlloy(s, ctx, ['marl', 'wormsilk']);
    expect(r.ok).toBe(true);
    expect((r.data as { alloy: string | null }).alloy).toBeNull();
    expect((r.data as { reason: string }).reason).toMatch(/springy|light/);
    expect(s.drills.alloys).toEqual([]);
  });

  it('the pour spends the materials and the fee, and refuses what you do not hold', () => {
    const { s } = fresh();
    addMaterial(s, 'rootglass', 60, 1);
    expect(forgeDrillAlloy(s, ctx, ['rootglass', 'umberjade']).ok).toBe(false);
    addMaterial(s, 'umberjade', 60, 1);
    const brick = s.currencies['brick']!.toNumber();
    expect(forgeDrillAlloy(s, ctx, ['rootglass', 'umberjade']).ok).toBe(true);
    expect(s.currencies['brick']!.toNumber()).toBe(brick - ALLOY_POUR_COST);
    // Both went in the crucible.
    expect(forgeDrillAlloy(s, ctx, ['rootglass', 'umberjade']).ok).toBe(false);
  });

  it('refuses more than the crucible holds', () => {
    const { s } = fresh();
    const ids = ['rootglass', 'umberjade', 'palegold', 'starmarl'];
    for (const id of ids) addMaterial(s, id, 60, 1);
    expect(forgeDrillAlloy(s, ctx, ids).ok).toBe(false);
    expect(ids.length).toBeGreaterThan(POUR_SLOTS);
  });
});

// ---------------------------------------------------------------------------

describe('THE ARC — the strike jumps', () => {
  const arced = (s: GameState) => { s.drills.alloys.push('arcvein'); setEquippedAlloy(s, 'arcvein'); };

  it('does nothing at all with no alloy fitted', () => {
    const { s } = fresh();
    bay(s);
    expect(arcTargets(s, 0, () => false)).toEqual([]);
  });

  it('picks charged neighbours, and only as many as the alloy allows', () => {
    const { s } = fresh();
    bay(s);
    arced(s);
    const t = arcTargets(s, 7, () => false);
    expect(t.length).toBeGreaterThan(0);
    expect(t.length).toBeLessThanOrEqual(2);
    for (const i of t) expect(i).not.toBe(7);
  });

  it('never arcs into dead rock — an arc you cannot see is not an arc', () => {
    const { s } = fresh();
    bay(s);
    arced(s);
    s.face.cells = s.face.cells.map(() => 0);
    s.face.cells[7] = 8;
    expect(arcTargets(s, 7, () => false)).toEqual([]);
  });

  it('never arcs into a vined cell — the Growth law still owns those', () => {
    const { s } = fresh();
    bay(s);
    arced(s);
    const skip = () => true;
    expect(arcTargets(s, 7, skip)).toEqual([]);
  });

  /**
   * PILLAR 2, the load-bearing one. The arc takes charge that was ALREADY in
   * the neighbouring cells. Over a window with NO regen, an arcing bay can
   * never extract more than the field held to begin with.
   */
  it('cannot pull more charge out of the field than the field contained', () => {
    const { s } = fresh();
    bay(s);
    arced(s);
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
  const called = (s: GameState) => { s.drills.alloys.push('lodecall'); setEquippedAlloy(s, 'lodecall'); };

  it('gathers on the cell that is worked, and pays out on a threshold', () => {
    const { s } = fresh();
    bay(s);
    called(s);
    expect(attractDepthBonus(s, 3)).toBe(0);
    for (let i = 0; i < 6; i++) markRichness(s, 3);
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
    called(s);
    for (let i = 0; i < 6; i++) markRichness(s, 3);
    expect(attractDepthBonus(s, 4)).toBe(0);
  });

  it('does nothing with a different alloy fitted, or none', () => {
    const { s } = fresh();
    bay(s);
    for (let i = 0; i < 20; i++) markRichness(s, 3);
    expect(attractDepthBonus(s, 3)).toBe(0);
    s.drills.alloys.push('arcvein');
    setEquippedAlloy(s, 'arcvein');
    for (let i = 0; i < 20; i++) markRichness(s, 3);
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
  const setAlloy = (s: GameState) => { s.drills.alloys.push('emberset'); setEquippedAlloy(s, 'emberset'); };

  it('a marked cell gives a bigger BITE, and cools back to normal', () => {
    const { s } = fresh();
    bay(s);
    setAlloy(s);
    expect(residueBite(s, 5)).toBe(1);
    markResidue(s, 5);
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
    setAlloy(s);
    s.face.cells = s.face.cells.map(() => 8);
    const stored = s.face.cells.reduce((a, b) => a + b, 0);
    for (const i of s.face.cells.keys()) markResidue(s, i);
    const before = s.stats.totalChargeChipped.toNumber();
    tickDrills(s, mods(), ctx, 2);
    expect(s.stats.totalChargeChipped.toNumber() - before).toBeLessThanOrEqual(stored);
  });

  it('does nothing with a different alloy fitted', () => {
    const { s } = fresh();
    bay(s);
    s.drills.alloys.push('arcvein');
    setEquippedAlloy(s, 'arcvein');
    markResidue(s, 5);
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
    setAlloy(s);
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

describe('the pillars', () => {
  /** PILLAR 1: no alloy is ever required. */
  it('a bay with no alloy mines perfectly well', () => {
    const { s } = fresh();
    bay(s);
    expect(equippedAbility(s)).toBeNull();
    const before = s.totals['dust']?.toNumber() ?? 0;
    tickDrills(s, mods(), ctx, 30);
    expect((s.totals['dust']?.toNumber() ?? 0)).toBeGreaterThan(before);
  });

  it('swapping an alloy clears the marks the last one left', () => {
    const { s } = fresh();
    bay(s);
    s.drills.alloys.push('emberset', 'arcvein');
    setEquippedAlloy(s, 'emberset');
    markResidue(s, 2);
    expect(s.drills.residue?.[2]).toBeGreaterThan(0);
    expect(equipDrillAlloy(s, 'arcvein').ok).toBe(true);
    expect(s.drills.residue).toEqual([]);
  });

  it('refuses to equip an ability that has not been made', () => {
    const { s } = fresh();
    expect(equipDrillAlloy(s, 'arcvein').ok).toBe(false);
    expect(equippedAbility(s)).toBeNull();
  });

  it('taking the alloy out is always allowed — nothing here is a commitment', () => {
    const { s } = fresh();
    s.drills.alloys.push('arcvein');
    setEquippedAlloy(s, 'arcvein');
    expect(equipDrillAlloy(s, null).ok).toBe(true);
    expect(equippedAbility(s)).toBeNull();
  });

  /** THE REACH RULE, at the verb: the pour is priced in the shell's own coin. */
  it('the pour is paid in whatever world you are standing in', () => {
    const { s } = fresh();
    s.shell.current = 'ferrite';
    s.currencies['brick'] = D(0);
    s.currencies['flux'] = D(500);
    addMaterial(s, 'lodestone', 60, 1);
    addMaterial(s, 'polarite', 60, 1);
    const r = forgeDrillAlloy(s, ctx, ['lodestone', 'polarite']);
    expect(r.ok).toBe(true);
    expect((r.data as { alloy: string }).alloy).toBe('arcvein');
    expect(s.currencies['flux']!.toNumber()).toBe(500 - ALLOY_POUR_COST);
  });
});
