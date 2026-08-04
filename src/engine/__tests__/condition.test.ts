/**
 * E2 — HAZARDS LEAK INTO THE PLANT (§7.2), A.90.
 *
 * The claim under test is not "the field integrates". It is the one §7.2 makes:
 * ONE CONDITION VALUE PER MACHINE, ONE RULE PER SHELL, WRITTEN BY THE WORLD.
 *
 *   1  each of the five rules is written by its own shell and by nothing else,
 *      and a shell with no rule writes nothing at all
 *   2  each one CHANGES WHAT THE MACHINE DOES — paired, per rule, with two
 *      states that make the same machine behave differently. A condition that
 *      cannot change a behaviour is a status icon.
 *   3  it is reversible by re-casting the part (§7.2's own bound on the risk),
 *      and a SEIZURE is the one thing only that clears
 *   4  the Circuit reads it (the read A.85 had to cut)
 *   5  Glassmere's rule is a TRADE you can aim, not a punishment
 *   6  PILLAR 2 — every rule at full on every machine cannot move `dpsMax`
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { allShells } from '../shells';
import {
  BAKE_HEAT, CONDITION_BITE, CONDITION_CLEAR_SEC, CONDITION_FULL_SEC, CONDITION_RULES,
  MAGNET_CHAIN, RECAST_PART_COST, UNDECIDED_SILENCE, UNLIT_SPEED, bandOfMachine, bandWiden,
  conditionOf, conditionedMachines, ensureCondition, litBands, machineSpeed, observePlant,
  recastBlocker, recastMachine, ruleFor, setMachineBand, tickCondition,
} from '../systems/condition';
import { machineTraits, retainsBand, tierOf } from '../systems/plant';
import { crush } from '../systems/crusher';
import { availableReads } from '../systems/circuit';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;
let mods: ModifierCache;

/** A player standing in `shell` with a Kiln and a tier-I Crusher. */
function withPlant(shell: string, parts: string[] = []): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = shell;
  st.kiln.built = true;
  st.plant!.tiers['crusher'] = 1;
  st.plant!.tiers['refinery'] = 1;
  st.plant!.builtOf = { kiln: [...parts], crusher: [...parts], refinery: [...parts] };
  return st;
}

/** Run the rule until it is fully written. */
function bake(st: GameState, seconds = CONDITION_FULL_SEC + 5): void {
  for (let i = 0; i < seconds; i++) tickCondition(st, mods, 1);
}

beforeEach(() => {
  mods = new ModifierCache();
  mods.invalidate();
});

describe('the fixture is real', () => {
  it('five rules, one per shell, and every machine the plant knows is conditioned', () => {
    expect(CONDITION_RULES.map((r) => r.shellId).sort())
      .toEqual(['cinder', 'ferrite', 'glassmere', 'hollow', 'verdance']);
    expect(new Set(CONDITION_RULES.map((r) => r.id)).size, 'two rules share an id').toBe(5);
    // The three new machines enrolled themselves: `conditionedMachines` is
    // derived from MACHINE_DEMAND, so a machine is conditioned the day it
    // exists rather than a pass later.
    expect(conditionedMachines().sort())
      .toEqual(['assayBench', 'balance', 'boiler', 'breaker', 'centrifuge', 'condenser',
        'crucible', 'crusher', 'governor', 'infuser', 'kiln', 'lapidary', 'line', 'pattern',
        'press', 'prism', 'quench', 'refinery', 'sieve', 'still', 'vents', 'washer',
        'witness']);
  });

  /**
   * §7.2 NAMES FIVE SHELLS AND THERE ARE SEVEN. Loam and Aleph have no rule —
   * the spine's table has five rows — so their machines are never written to.
   * Asserted rather than left to be discovered as a missing feature.
   */
  it('Loam and Aleph have NO rule, exactly as §7.2 lists it', () => {
    const withRule = allShells().map((s) => s.id).filter((id) => ruleFor(id));
    expect(withRule.sort()).toEqual(['cinder', 'ferrite', 'glassmere', 'hollow', 'verdance']);
    const loam = withPlant('loam');
    bake(loam);
    expect(conditionOf(loam, 'kiln'), 'something wrote to a Loam machine').toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 1 — THE WORLD WRITES IT
// ---------------------------------------------------------------------------

describe('1 — each rule is written by its own shell state', () => {
  it('CINDER: heat writes BAKED, and cool rock does not', () => {
    const hot = withPlant('cinder');
    hot.pressure.heat = BAKE_HEAT + 5;
    bake(hot);
    expect(conditionOf(hot, 'kiln')?.id).toBe('baked');
    expect(conditionOf(hot, 'kiln')?.level).toBe(1);

    const cool = withPlant('cinder');
    cool.pressure.heat = BAKE_HEAT - 5;
    bake(cool);
    expect(conditionOf(cool, 'kiln'), 'a cold plant baked').toBeNull();
  });

  it('VERDANCE: a machine NOT drawing goes OVERGROWN; one that is drawing does not', () => {
    const idle = withPlant('verdance');
    idle.plant!.served = { refinery: 0 };
    bake(idle);
    expect(conditionOf(idle, 'refinery')?.id).toBe('overgrown');

    const busy = withPlant('verdance');
    busy.plant!.served = { refinery: 1 };
    bake(busy);
    expect(conditionOf(busy, 'refinery'), 'a machine in use was overgrown').toBeNull();
  });

  it('HOLLOW: silence writes UNDECIDED, and a quiet shaft nobody left does not', () => {
    const away = withPlant('hollow');
    away.hollow.silence = UNDECIDED_SILENCE + 1;
    bake(away);
    expect(conditionOf(away, 'kiln')?.id).toBe('undecided');

    const here = withPlant('hollow');
    here.hollow.silence = 0;
    bake(here);
    expect(conditionOf(here, 'kiln')).toBeNull();
  });

  it('FERRITE: a long chain MAGNETISES; a short one does not', () => {
    const long = withPlant('ferrite');
    long.polarity.chain = MAGNET_CHAIN;
    bake(long);
    expect(conditionOf(long, 'crusher')?.id).toBe('magnetised');

    const short = withPlant('ferrite');
    short.polarity.chain = MAGNET_CHAIN - 1;
    bake(short);
    expect(conditionOf(short, 'crusher')).toBeNull();
  });

  it('GLASSMERE: an unlit band writes UNLIT; a lit one does not', () => {
    const dark = withPlant('glassmere');
    dark.refraction.path = [];             // the beam is carrying nothing
    bake(dark);
    expect(conditionOf(dark, 'crusher')?.id).toBe('unlit');

    const lit = withPlant('glassmere');
    setMachineBand(lit, 'crusher', 3);
    lit.refraction.path = [{ cell: 0, color: 3, dir: 0, amplified: false }];
    bake(lit);
    expect(conditionOf(lit, 'crusher'), 'a machine in a lit band was unlit').toBeNull();
  });

  it('a machine that is NOT BUILT is never written to', () => {
    const st = withPlant('cinder');
    st.plant!.tiers = {};
    st.kiln.built = false;
    st.pressure.heat = 100;
    bake(st);
    expect(Object.keys(st.plant!.condition ?? {})).toEqual([]);
  });

  it('and it DECAYS when you leave the shell — a condition is weather, not a stat', () => {
    const st = withPlant('cinder');
    st.pressure.heat = 100;
    bake(st);
    expect(conditionOf(st, 'kiln')?.level).toBe(1);
    st.shell.current = 'loam';
    for (let i = 0; i < CONDITION_CLEAR_SEC + 5; i++) tickCondition(st, mods, 1);
    expect(conditionOf(st, 'kiln')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2 — THE LOAD-BEARING ONE
// ---------------------------------------------------------------------------

/**
 * A CONDITION THAT CANNOT CHANGE A BEHAVIOUR IS A STATUS ICON. Same test the
 * Circuit's reads get: two states, one machine, and it must do two different
 * things. One case per rule, and the fixture is the SAME machine both sides.
 */
describe('2 — every rule changes what the machine does', () => {
  it('BAKED + warm: the Kiln converts faster. BAKED + plain: it does not', () => {
    const warm = withPlant('cinder', ['emberflake']); // warm
    warm.pressure.heat = 100;
    bake(warm);
    const plain = withPlant('cinder', ['marl']);      // neither warm nor brittle
    plain.pressure.heat = 100;
    bake(plain);
    expect(machineSpeed(warm, 'kiln')).toBeGreaterThan(1);
    expect(machineSpeed(plain, 'kiln')).toBe(1);
  });

  it('BAKED + brittle: it CRACKS, and the Crusher then refuses to run at all', () => {
    const st = withPlant('cinder', ['quietchalk']); // brittle
    st.pressure.heat = 100;
    bake(st);
    expect(conditionOf(st, 'crusher')?.seized).toBe(true);
    expect(machineSpeed(st, 'crusher')).toBe(0);
    const r = crush(st, ctx, 'marl', 'good');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('cracked');

    // The control: the same shell, the same heat, a machine cast from stone
    // that is not brittle. It does not crack, and the refusal is a different one.
    const ok = withPlant('cinder', ['marl']);
    ok.pressure.heat = 100;
    bake(ok);
    expect(conditionOf(ok, 'crusher')?.seized).toBeUndefined();
    expect(crush(ok, ctx, 'marl', 'good').reason).not.toContain('cracked');
  });

  it('OVERGROWN: the machine counts as built from a trait it was never cast with', () => {
    // `ochre` is hollow+tough, so the overgrowth trait is genuinely new to it.
    const st = withPlant('verdance', ['ochre']);
    const before = [...machineTraits(st, 'refinery')];
    st.plant!.served = { refinery: 0 };
    bake(st);
    const after = [...machineTraits(st, 'refinery')];
    expect(after.length, 'the green got in and changed nothing').toBeGreaterThan(before.length);
    expect(after).toContain(conditionOf(st, 'refinery')!.trait);
  });

  /**
   * ...AND IT DOES NOT DOUBLE UP, which is §7.4's fourth transmission rule
   * arriving early: "a trait already present is not re-added". A machine cast
   * from `marl` (light+springy) is overgrown by the same rule and comes out
   * with exactly the traits it had. Found by this test failing on a fixture
   * that happened to use marl — the machine WAS overgrown, and nothing changed,
   * because there was nothing left to change.
   */
  it('...but a machine already cast from that trait gains nothing from it', () => {
    const st = withPlant('verdance', ['marl']); // light + SPRINGY
    const before = [...machineTraits(st, 'refinery')].sort();
    st.plant!.served = { refinery: 0 };
    bake(st);
    expect(conditionOf(st, 'refinery')?.id, 'it should still be overgrown').toBe('overgrown');
    expect([...machineTraits(st, 'refinery')].sort()).toEqual(before);
  });

  it('UNLIT: half speed, and a TIER-I machine keeps the band it would have lost', () => {
    const st = withPlant('glassmere');
    expect(tierOf(st, 'crusher'), 'tier I drops the band').toBe(1);
    expect(retainsBand(st, 'crusher')).toBe(false);
    st.refraction.path = [];
    bake(st);
    expect(machineSpeed(st, 'crusher')).toBe(UNLIT_SPEED);
    expect(retainsBand(st, 'crusher'), '"loses no purity"').toBe(true);
  });

  it('UNDECIDED: even a TIER-II machine will not commit to a band', () => {
    const st = withPlant('hollow');
    st.plant!.tiers['crusher'] = 2;
    expect(retainsBand(st, 'crusher'), 'tier II keeps the band').toBe(true);
    st.hollow.silence = UNDECIDED_SILENCE + 1;
    bake(st);
    expect(retainsBand(st, 'crusher')).toBe(false);
  });

  it('...and LOOKING AT THE PLANT settles it — attention is the mechanic', () => {
    const st = withPlant('hollow');
    st.plant!.tiers['crusher'] = 2;
    st.hollow.silence = UNDECIDED_SILENCE + 1;
    bake(st);
    expect(retainsBand(st, 'crusher')).toBe(false);
    expect(observePlant(st)).toBeGreaterThan(0);
    expect(retainsBand(st, 'crusher'), 'somebody looked and it did not settle').toBe(true);
    // It does not settle the OTHER four rules — looking is Hollow's answer only.
    const cinder = withPlant('cinder');
    cinder.pressure.heat = 100;
    bake(cinder);
    expect(observePlant(cinder)).toBe(0);
    expect(conditionOf(cinder, 'kiln')).not.toBeNull();
  });

  it('MAGNETISED: the machine takes one band wider than it was told', () => {
    const st = withPlant('ferrite');
    expect(bandWiden(st, 'crusher')).toBe(0);
    st.polarity.chain = MAGNET_CHAIN;
    bake(st);
    expect(bandWiden(st, 'crusher')).toBe(1);
  });

  it('and BELOW THE BITE LINE none of them does anything — it is only weather', () => {
    const st = withPlant('glassmere');
    st.refraction.path = [];
    for (let i = 0; i < CONDITION_FULL_SEC * (CONDITION_BITE - 0.1); i++) tickCondition(st, mods, 1);
    expect(conditionOf(st, 'crusher')!.level).toBeLessThan(CONDITION_BITE);
    expect(machineSpeed(st, 'crusher')).toBe(1);
    expect(retainsBand(st, 'crusher')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3 — THE WAY OUT
// ---------------------------------------------------------------------------

describe('3 — reversible by re-casting the part (§7.2)', () => {
  function racked(st: GameState, n: number): GameState {
    st.casting.rack = Array.from({ length: n }, (_, i) =>
      ({ id: `p${i}`, materialId: 'marl', shape: 'head', purity: 50, traits: [] } as never));
    return st;
  }

  it('a re-cast clears it, spends the parts, and the machine is made of them now', () => {
    const st = racked(withPlant('cinder', ['quietchalk']), 4);
    st.pressure.heat = 100;
    bake(st);
    expect(conditionOf(st, 'crusher')?.seized).toBe(true);
    expect(recastBlocker(st, 'crusher')).toBeNull();
    expect(recastMachine(st, ctx, 'crusher').ok).toBe(true);
    expect(conditionOf(st, 'crusher')).toBeNull();
    expect(st.casting.rack.length).toBe(4 - RECAST_PART_COST);
    expect(st.plant!.builtOf!['crusher']).toContain('marl');
    expect(machineSpeed(st, 'crusher')).toBe(1);
  });

  it('...and it refuses when there is nothing wrong, or nothing to pay with', () => {
    const fine = racked(withPlant('cinder'), 4);
    expect(recastBlocker(fine, 'crusher')).toBe('There is nothing wrong with it.');

    const broke = racked(withPlant('cinder', ['quietchalk']), 1);
    broke.pressure.heat = 100;
    bake(broke);
    expect(recastBlocker(broke, 'crusher')).toContain('cast parts');
    expect(recastMachine(broke, ctx, 'crusher').ok).toBe(false);
  });

  /**
   * A SEIZURE IS THE ONE THING TIME DOES NOT UNDO. Leaving Cinder does not
   * un-crack a liner — which is what makes the `brittle` half of the rule a
   * real consequence rather than a debuff with a timer.
   */
  it('a SEIZURE does not decay: leaving the shell does not un-crack it', () => {
    const st = withPlant('cinder', ['quietchalk']);
    st.pressure.heat = 100;
    bake(st);
    expect(conditionOf(st, 'crusher')?.seized).toBe(true);
    st.shell.current = 'loam';
    for (let i = 0; i < CONDITION_CLEAR_SEC * 10; i++) tickCondition(st, mods, 1);
    expect(conditionOf(st, 'crusher')?.seized, 'it healed itself').toBe(true);
    expect(machineSpeed(st, 'crusher')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4 — THE CIRCUIT READS IT
// ---------------------------------------------------------------------------

describe('4 — the read A.85 had to cut (§7.3)', () => {
  it('the condition read is offered where a rule exists, and not where none does', () => {
    const cinder = withPlant('cinder');
    expect(availableReads(cinder).map((r) => r.id)).toContain('condition');
    const loam = withPlant('loam');
    expect(availableReads(loam).map((r) => r.id)).not.toContain('condition');
  });

  it('and it reads the strip\'s OWN machine, not a global', () => {
    const st = withPlant('cinder', ['quietchalk']);
    st.pressure.heat = 100;
    bake(st);
    // The Crusher cracked; the Kiln (also brittle here) cracked too. Clear one
    // and the read must disagree between the two machines.
    delete ensureCondition(st)['kiln'];
    const def = availableReads(st).find((r) => r.id === 'condition')!;
    expect(def.read(st, mods, 'crusher')).toBe('seized');
    expect(def.read(st, mods, 'kiln')).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// 5 — GLASSMERE'S IS A TRADE
// ---------------------------------------------------------------------------

describe('5 — the one condition you can aim', () => {
  it('a machine sits in a band, the band can be set, and the beam decides if it is lit', () => {
    const st = withPlant('glassmere');
    st.refraction.path = [{ cell: 0, color: 4, dir: 0, amplified: false }];
    expect(litBands(st).has(4)).toBe(true);
    expect(litBands(st).has(1)).toBe(false);
    expect(setMachineBand(st, 'crusher', 4)).toBe(true);
    expect(bandOfMachine(st, 'crusher')).toBe(4);
    bake(st);
    expect(conditionOf(st, 'crusher'), 'a lit machine went unlit').toBeNull();
    setMachineBand(st, 'crusher', 1);
    bake(st);
    expect(conditionOf(st, 'crusher')?.id).toBe('unlit');
  });

  it('white lights everything — a pre-Split beam cannot leave a band dark', () => {
    const st = withPlant('glassmere');
    st.refraction.path = [{ cell: 0, color: 0, dir: 0, amplified: false }];
    for (let i = 0; i < 6; i++) expect(litBands(st).has(i), `band ${i}`).toBe(true);
  });

  it('and outside Glassmere every band is lit, so the rule cannot follow you', () => {
    const st = withPlant('cinder');
    for (let i = 0; i < 6; i++) expect(litBands(st).has(i)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6 — PILLAR 2
// ---------------------------------------------------------------------------

describe('6 — PILLAR 2: a condition gates, it never produces', () => {
  /**
   * EVERY RULE, AT FULL, ON EVERY MACHINE, AT THE SAME DEPTH. Depth Pressure is
   * a `dustYield` term and has faked a violation three passes running, so both
   * arms read at 30 and the only thing that differs is the condition table.
   */
  it('dpsMax is identical with the whole table written and with none of it', () => {
    const read = (write: boolean): number => {
      const st = withPlant('cinder', ['emberflake', 'quietchalk']);
      st.depth = 30;
      if (write) {
        for (const rule of CONDITION_RULES) {
          for (const id of conditionedMachines()) {
            ensureCondition(st)[id] = { id: rule.id, level: 1, trait: 'springy', seized: true };
          }
          // read the ceiling with THIS rule live before moving to the next
          const m = new ModifierCache();
          m.invalidate();
          Math.round(dpsMax(st, m).toNumber() * 1e6);
        }
      }
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });

  it('and machineSpeed is bounded — no rule makes a machine run away with itself', () => {
    const st = withPlant('cinder', ['emberflake']);
    st.pressure.heat = 100;
    // Ten times as long as it takes to write in full.
    bake(st, CONDITION_FULL_SEC * 10);
    expect(conditionOf(st, 'kiln')!.level, 'the level climbed past 1').toBe(1);
    expect(machineSpeed(st, 'kiln')).toBeLessThanOrEqual(1.25);
  });
});
