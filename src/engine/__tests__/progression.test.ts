/**
 * PROGRESSION & DIFFERENTIATION, Part B — the framework and the Ferrite
 * reference, tested for the RULED properties:
 *  - techniques: verbs with cooldowns, carried = slower never weaker-locked,
 *    SKIM's idle-equivalence guarantee (pillar 1 as an assertion);
 *  - keystones: the gate holds, both legs pay, stubs gate nothing, a placed
 *    stone survives every reset layer;
 *  - the Ferrite band: discovery-gated, spine-priced, behavioral rows really
 *    change the mechanic.
 */
import { describe, expect, it } from 'vitest';
import { D } from '../decimal';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { availableTechniques, techniqueCooldown, techniqueDef } from '../techniques';
import { skimPoolCap, SEEP_EFFICIENCY } from '../systems/face';
import { chainTimeoutSec, chainBreakPenalty, chainCap, magnetBias } from '../systems/polarity';
import { addMaterial, materialCount, TOOL_RECIPES } from '../systems/forge';
import { MATERIALS, materialDef } from '../materials';
import { keystoneFor, keystoneIdlePrice, keystonePlaced } from '../systems/keystones';
import { canBreach } from '../systems/breach';
import { allUpgrades } from '../upgrades';

const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};

describe('signature techniques — the verb layer', () => {
  it('loam grants Skim natively; ferrite grants Poleshift; stubs grant nothing', () => {
    const { s } = fresh();
    expect(availableTechniques(s).map((t) => t.def.id)).toEqual(['skim']);
    s.shell.current = 'ferrite';
    s.shell.signatures = ['seepage'];
    const ids = availableTechniques(s).map((t) => t.def.id).sort();
    expect(ids).toEqual(['poleshift', 'skim']); // carried skim + native poleshift
    s.shell.current = 'verdance';
    s.shell.signatures = ['seepage', 'polarity'];
    // growth has no technique yet (stubbed by ruling) — carried verbs only
    expect(availableTechniques(s).map((t) => t.def.id).sort()).toEqual(['poleshift', 'skim']);
  });

  it('SKIM: the pool banks EXTRA and the idle leak is untouched (pillar 1)', () => {
    const { engine, s } = fresh();
    const mods = new ModifierCache();
    // A full fresh face: all regen overflows. 50 idle seconds must pay the
    // DOCUMENTED leak — 36 cells × 0.08 regen × 10% — with the pool banking
    // half that again ON TOP, in charge units, never subtracting from it.
    const before = s.currencies['dust']!.toNumber();
    for (let i = 0; i < 50; i++) engine.tick(1);
    const gained = s.currencies['dust']!.toNumber() - before;
    const expectedLeak = 36 * 0.08 * 50 * SEEP_EFFICIENCY; // = 14.4 at yield 1
    expect(gained).toBeGreaterThan(expectedLeak * 0.95);
    expect(gained).toBeLessThan(expectedLeak * 1.3); // yield mods only, no theft
    // Half the leak again, in charge units (± the small regen bonuses that
    // wake up over 50s — achievements etc. raise overflow slightly).
    expect(s.face.seepPool).toBeGreaterThanOrEqual(expectedLeak * 0.5 * 0.95);
    expect(s.face.seepPool).toBeLessThanOrEqual(expectedLeak * 0.5 * 1.15);
    expect(s.face.seepPool).toBeLessThanOrEqual(skimPoolCap(s, mods) + 1e-9);
    // Skimming pays the pool ON TOP, at chip yield.
    const mid = s.currencies['dust']!.toNumber();
    const pool = s.face.seepPool;
    const r = engine.dispatch({ type: 'useTechnique', id: 'skim' });
    expect(r.ok).toBe(true);
    expect(s.face.seepPool).toBe(0);
    expect(s.currencies['dust']!.toNumber() - mid).toBeGreaterThanOrEqual(pool * 0.99);
    expect(pool).toBeGreaterThan(1);
  });

  it('POLESHIFT: flips the tapped sign, cooldown enforced, carried waits longer', () => {
    const { engine, s } = fresh();
    s.shell.current = 'ferrite';
    engine.dispatch({ type: 'chip', cell: 0 }); // ensures polarity arrays exist
    const sign = s.polarity.signs[3]!;
    expect(engine.dispatch({ type: 'useTechnique', id: 'poleshift', cell: 3 }).ok).toBe(true);
    expect(s.polarity.signs[3]).toBe(-sign);
    // immediately again: cooling
    const again = engine.dispatch({ type: 'useTechnique', id: 'poleshift', cell: 3 });
    expect(again.ok).toBe(false);
    // carried: cooldown divides by strength — a 0.4 carry waits 2.5×
    const def = techniqueDef('poleshift')!;
    expect(techniqueCooldown(def, 0.4, s)).toBeCloseTo(techniqueCooldown(def, 1, s) * 2.5, 10);
    // targeted without a cell is refused
    s.techniques.lastUsed = {};
    expect(engine.dispatch({ type: 'useTechnique', id: 'poleshift' }).ok).toBe(false);
  });

  it('a technique is active play: The Unattended seals it', () => {
    const { engine, s } = fresh();
    s.spiral.activeChallenge = { id: 'unattended', startedAtPlaySec: 0 };
    const r = engine.dispatch({ type: 'useTechnique', id: 'skim' });
    expect(r.ok).toBe(false);
  });
});

describe('keystones — the breach gate', () => {
  const atFloor = () => {
    const { engine, s } = fresh();
    s.depth = 150;
    s.combat.wardens.push('loam');
    return { engine, s };
  };

  it('the floor is open but unshored: breach refuses and names the keystone', () => {
    const { engine, s } = atFloor();
    expect(canBreach(s)).toBe(false);
    const r = engine.dispatch({ type: 'breach' });
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain('keystone');
  });

  it('the craft leg consumes the Kiln output and opens the floor', () => {
    const { engine, s } = atFloor();
    s.currencies['brick'] = D(100);
    expect(engine.dispatch({ type: 'placeKeystone', leg: 'craft' }).ok).toBe(true);
    expect(s.currencies['brick']!.toNumber()).toBe(40);
    expect(canBreach(s)).toBe(true);
    expect(engine.dispatch({ type: 'placeKeystone', leg: 'craft' }).ok).toBe(false); // once
  });

  it('the idle leg is chip currency alone — the ruled correction', () => {
    const { engine, s } = atFloor();
    const def = keystoneFor('loam')!;
    const price = keystoneIdlePrice(s, def);
    s.currencies['dust'] = price.add(10);
    expect(engine.dispatch({ type: 'placeKeystone', leg: 'buy' }).ok).toBe(true);
    expect(s.currencies['dust']!.toNumber()).toBeCloseTo(10, 6);
    expect(canBreach(s)).toBe(true);
  });

  it('a placed keystone survives breach and recursion (set once, forever)', () => {
    const { engine, s } = atFloor();
    s.currencies['brick'] = D(60);
    engine.dispatch({ type: 'placeKeystone', leg: 'craft' });
    expect(engine.dispatch({ type: 'breach' }).ok).toBe(true);
    expect(keystonePlaced(s, 'loam')).toBe(true);
    // A shell with no keystone def (verdance...) gates nothing: reach its
    // floor and the stub guarantee holds.
    s.shell.current = 'verdance';
    s.depth = 290;
    s.combat.wardens.push('verdance');
    expect(canBreach(s)).toBe(true);
  });

  it('ferrite: the anchor eats a casting — the headline system, load-bearing', () => {
    const { engine, s } = fresh();
    s.shell.current = 'ferrite';
    s.shell.breachCount = 1;
    s.depth = 250;
    s.combat.wardens.push('ferrite');
    expect(canBreach(s)).toBe(false);
    addMaterial(s, 'steelcasting', 70, 1);
    s.currencies['scale'] = D(50);
    expect(engine.dispatch({ type: 'placeKeystone', leg: 'craft' }).ok).toBe(true);
    expect(s.currencies['scale']!.toNumber()).toBe(10);
    expect(canBreach(s)).toBe(true);
  });
});

describe('the ferrite band — discovery-gated, spine-priced, behavioral', () => {
  it('rows hide until the deed and appear after it (pillar 5)', () => {
    const { engine, s } = fresh();
    void engine;
    const coil = allUpgrades().find((u) => u.id === 'inductionCoil')!;
    expect(coil.visible!(s)).toBe(false);
    s.shell.current = 'ferrite';
    s.polarity.bestChain = 3;
    expect(coil.visible!(s)).toBe(true);
  });

  it('a material-priced row consumes the Hold and is capped by it', () => {
    const { engine, s } = fresh();
    s.shell.current = 'ferrite';
    s.drills.bayBuilt = true;
    addMaterial(s, 'bluesteel', 60, 4);
    s.currencies['flux'] = D(1000);
    const r1 = engine.dispatch({ type: 'buyUpgrade', id: 'alloyBores' });
    expect(r1.ok).toBe(true);
    expect(materialCount(s, 'bluesteel')).toBe(1);
    const r2 = engine.dispatch({ type: 'buyUpgrade', id: 'alloyBores' });
    expect(r2.ok).toBe(false); // 1 < 3 — the Hold caps it, with the reason named
    expect((r2 as { reason: string }).reason).toContain('Bluesteel');
  });

  it('behavioral rows change the mechanic, not a bucket', () => {
    const { s } = fresh();
    expect(chainTimeoutSec(s)).toBe(4);
    expect(chainBreakPenalty(s)).toBe(0.5);
    expect(chainCap(s)).toBe(12);
    expect(magnetBias(s)).toBe(0.85);
    s.upgrades['inductionCoil'] = 4;
    s.upgrades['keeperMagnets'] = 3;
    s.upgrades['longRoute'] = 3;
    s.upgrades['woundCores'] = 5;
    expect(chainTimeoutSec(s)).toBe(7);
    expect(chainBreakPenalty(s)).toBeCloseTo(0.65, 10);
    expect(chainCap(s)).toBe(15);
    expect(magnetBias(s)).toBeCloseTo(0.95, 10);
    // pole dampers shorten the verb's wait
    const def = techniqueDef('poleshift')!;
    const before = techniqueCooldown(def, 1, { ...s, upgrades: {} } as GameState);
    s.upgrades['poleDampers'] = 3;
    expect(techniqueCooldown(def, 1, s)).toBe(before - 3);
  });

  it('the band counts ~15 rows, all persistent through collapse', () => {
    const band = allUpgrades().filter((u) => u.band === 'shell');
    expect(band.length).toBe(15);
    expect(band.every((u) => !u.resetsOnCollapse)).toBe(true);
  });
});

describe('the tier ladder has a floor an idle player can always reach', () => {
  /**
   * A.40 close-out ruling: tier walls are held to the keystone idle standard.
   * Every tier-II recipe used to want a RICH-band material, and rich cannot
   * drop above depth 10 while every Collapse resets depth to 0 — so the first
   * hardness wall was gated on a band that earns for only part of each cycle
   * (measured: median 129 drops, p90/p10 spread 2.82x). A commons-only recipe
   * removes the coupling: commons pay at every depth, including the shallows.
   */
  it('tier II is payable from the common band alone', () => {
    const commons = new Set(
      MATERIALS.filter((m) => m.shellId === 'loam' && m.rarity === 'common' && !m.worked).map((m) => m.id),
    );
    const tier2 = TOOL_RECIPES.filter((r) => r.tier === 2);
    const commonsOnly = tier2.filter((r) => Object.keys(r.inputs).every((id) => commons.has(id)));
    expect(commonsOnly.length, 'no tier-II recipe is payable without the rich band').toBeGreaterThanOrEqual(1);
  });

  it('the commons floor is the WORST tier-II pick — tier gates hardness, spread is quality', () => {
    const tier2 = TOOL_RECIPES.filter((r) => r.tier === 2);
    const floor = tier2.find((r) => r.id === 'chalkhead')!;
    const others = tier2.filter((r) => r.id !== 'chalkhead');
    // It must clear the wall (same tier) while never being the tool you'd
    // choose if you could pay for another — so working for the rich pick pays.
    expect(floor.tier).toBe(2);
    expect(others.some((r) => r.chipSpread > floor.chipSpread)).toBe(true);
    expect(others.every((r) => r.strikeSpread > floor.strikeSpread)).toBe(true);
  });

  it('every tier-I and tier-II recipe stays inside the curriculum law', () => {
    // Nothing the ladder's floor added may want a material from a later shell.
    for (const r of TOOL_RECIPES.filter((x) => x.tier <= 2)) {
      for (const id of Object.keys(r.inputs)) {
        expect(materialDef(id).shellId, `${r.id} wants ${id}`).toBe('loam');
      }
    }
  });
});

describe('seep constants stay honest', () => {
  it('the leak rate is the documented 10%', () => {
    expect(SEEP_EFFICIENCY).toBe(0.1);
  });
});
