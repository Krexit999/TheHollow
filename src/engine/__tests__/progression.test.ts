/**
 * PROGRESSION & DIFFERENTIATION, Part B — the framework and the Ferrite
 * reference, tested for the RULED properties:
 *  - techniques: verbs with cooldowns, carried = slower never weaker-locked,
 *    the idle leak's rate (pillar 1 as an assertion);
 *  - keystones: the gate holds, both legs pay, stubs gate nothing, a placed
 *    stone survives every reset layer;
 *  - the Ferrite band: discovery-gated, spine-priced, behavioral rows really
 *    change the mechanic.
 */
import { describe, expect, it } from 'vitest';
import { D } from '../decimal';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { availableTechniques, techniqueCooldown, techniqueDef } from '../techniques';
import { SEEP_EFFICIENCY } from '../systems/face';
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
  it('LOAM GRANTS NO VERB — Skim is cut; ferrite still grants Poleshift', () => {
    const { s } = fresh();
    // Loam's signature is SEEPAGE and seepage is a leak, not a verb. Skim was
    // the hand that collected a pool banked beside it; both are gone.
    expect(availableTechniques(s).map((t) => t.def.id)).toEqual([]);
    s.shell.current = 'ferrite';
    s.shell.signatures = ['seepage'];
    // Carrying seepage down carries no verb with it, because it has none.
    expect(availableTechniques(s).map((t) => t.def.id).sort()).toEqual(['poleshift']);
    s.shell.current = 'verdance';
    s.shell.signatures = ['seepage', 'polarity'];
    // growth has no technique yet (stubbed by ruling) — carried verbs only
    expect(availableTechniques(s).map((t) => t.def.id).sort()).toEqual(['poleshift']);
  });

  it('THE IDLE LEAK PAYS ITS DOCUMENTED RATE (pillar 1)', () => {
    // This was the SKIM test, and the half worth keeping is the half that was
    // never about Skim: seepage is the only income a pre-machine idle player
    // has, so its arithmetic is pillar 1's floor. The pool assertions went with
    // the verb; the leak's are unchanged, and they must be — cutting a verb is
    // not allowed to move what an idle player earns.
    const { engine, s } = fresh();
    // A full fresh face: all regen overflows. 50 idle seconds must pay the
    // DOCUMENTED leak — 36 cells × 0.08 regen × SEEP_EFFICIENCY.
    //
    // ORES ARE HELD OFF for this one, and the reason is worth stating because
    // it is a real interaction and not test scaffolding: a pocket has a bigger
    // cap, so it absorbs regen that a plain cell would have overflowed, and
    // overflow is what seep is made of. The charge is DEFERRED, not lost —
    // opening the pocket returns it at full yield instead of seep's 15%, so a
    // player who opens pockets is far ahead — but while one sits unopened it
    // does thin the leak. This test is about the leak's arithmetic, so the
    // pockets are cleared each second to keep the two effects apart.
    const before = s.currencies['dust']!.toNumber();
    for (let i = 0; i < 50; i++) { engine.tick(1); s.face.ore = []; }
    const gained = s.currencies['dust']!.toNumber() - before;
    const expectedLeak = 36 * 0.08 * 50 * SEEP_EFFICIENCY; // = 14.4 at yield 1
    expect(gained).toBeGreaterThan(expectedLeak * 0.95);
    expect(gained).toBeLessThan(expectedLeak * 1.3); // yield mods only, no theft
    // ...and there is no verb left to ask for it. A stale save that still
    // dispatches one must be refused, not silently swallowed.
    expect(engine.dispatch({ type: 'useTechnique', id: 'skim' }).ok).toBe(false);
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

  /**
   * DELETED: 'a technique is active play: The Unattended seals it'.
   *
   * It asserted that setting `spiral.activeChallenge` to 'unattended' makes
   * `useTechnique` refuse. It never tested that. `sealed()` reads the
   * `challengeLaws` map, and NOTHING IN THE CODEBASE CALLS
   * `registerChallengeLaws` — the map is empty, so every challenge seal in the
   * game is permanently false. The old test passed because it fired SKIM on a
   * fresh engine, where the pool is 0 and the verb refuses with "Nothing worth
   * cupping yet". Swapping in Poleshift, which has no such precondition, is
   * what exposed it.
   *
   * NOT FIXED HERE: unregistered challenge laws are a separate defect with a
   * far wider blast radius than a verb cut, and re-pointing this test at some
   * other refusal would put a green tick back over the same hole.
   */
});

describe('keystones — the breach gate', () => {
  const atFloor = () => {
    const { engine, s } = fresh();
    s.depth = 150;
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
    expect(canBreach(s)).toBe(true);
  });

  it('ferrite: the anchor eats a casting — the headline system, load-bearing', () => {
    const { engine, s } = fresh();
    s.shell.current = 'ferrite';
    s.shell.breachCount = 1;
    s.depth = 250;
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
  it('the leak rate is the documented 15%', () => {
    // Raised 0.10 -> 0.15 at A.43. This is not a flavour constant: before the
    // drill bay exists it IS the idle/active income ratio, and 0.10 was setting
    // it to 10x against pillar 1's stated ~5x. The value is measured, not
    // derived — see seepage.test.ts and sim-out/a43-part-b.md.
    expect(SEEP_EFFICIENCY).toBe(0.15);
  });
});
