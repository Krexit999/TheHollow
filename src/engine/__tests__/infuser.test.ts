/**
 * THE INFUSER — INFUSION (§14.1, §13), A.92.
 *
 *   0  the ledger is a claim: check the Infuser is not already built
 *   1  the place, then the price, and tiers as capability
 *   2  END TO END: a trait stripped into a vial and put into another stone,
 *      with the SOURCE LOSING IT — the brief's own demonstration
 *   3  THE LOAD-BEARING ONE — a trait moved is not a trait created. No pair of
 *      stones anywhere in the registry gains worth by passing a trait between
 *   4  the infused form is a REAL material, and §11.4's shake is wired
 *   5  PILLAR 2
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { MATERIALS, RARITIES, materialDef, rollDrop } from '../materials';
import { MATERIAL_TRAITS, TRAITS, naturalTraits, overNatural, traitsOf, type TraitId } from '../traits';
import { addMaterial, materialCount } from '../systems/forge';
import { markReached } from '../systems/roll';
import { derivePart, makePart } from '../systems/forgeParts';
import { TOOL_STATS } from '../content/forgeParts';
import { MAX_MACHINE_TIER, tierOf } from '../systems/plant';
import { ensureCondition } from '../systems/condition';
import { worth } from '../systems/balance';
import { buildStill, distil } from '../systems/still';
import { stilledId } from '../content/traps';
import {
  MAX_TRAITS, TIER_CAPABILITY_INFUSER, addVial, buildInfuser, infuse, infuseBlocker,
  infuserBuilt, infuserFound, infuserStation, infusedHeld, infusedId, registerInfusedForm,
  resultOf, runsDownhill, targetsFor, traitCeiling, vialsHeld, type Vial,
} from '../systems/infuser';
import { allAuthoredStations } from '../content/rolls';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;

function racked(st: GameState, n: number): GameState {
  st.casting.rack = Array.from({ length: n }, (_, i) =>
    ({ id: 7000 + i, materialId: 'marl', type: 'head', purity: 50 } as never));
  st.casting.nextId = 7000 + n;
  return st;
}

/** A player who has walked to The Grafthouse, at the bottom of Verdance. */
function walked(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'verdance';
  markReached(st, 290, 15);
  st.shell.current = 'loam';
  return racked(st, 24);
}

function withInfuser(tier = 1): GameState {
  const st = walked();
  for (let i = 0; i < tier; i++) buildInfuser(st, ctx);
  return st;
}

const vialOf = (trait: TraitId, fromId: string): Vial => ({ trait, fromId, count: 1 });

describe('0 — the ledger is a claim: nothing here was already built', () => {
  it('`infuser` was not a plant tier, and `essence` was not a state slot', () => {
    // Checked against the code before building, per PILLARS. The Still's own
    // header named this machine as the blocker for its cut half, which is the
    // strongest possible evidence that it did not exist.
    const fresh = createEngine({ nowMs: 0 }).getState() as GameState;
    expect(tierOf(fresh, 'infuser')).toBe(0);
    expect(fresh.essence).toBeUndefined();
  });
});

describe('1 — the place, then the price (§6, §15.4)', () => {
  it('it is at The Grafthouse 225 in Verdance, below THE SPLIT', () => {
    expect(infuserStation()).toEqual({
      shellId: 'verdance', depth: 225, name: 'The Grafthouse',
    });
    // Behind Verdance's last wall (THE SPLIT, 209) — §13 gates tier IX+ on it.
    const split = allAuthoredStations().find((s) => s.def.id === 'thesplit')!;
    expect(split.def.depth).toBeLessThan(225);
  });

  it('a player who has not been there cannot raise it', () => {
    const st = racked(createEngine({ nowMs: 0 }).getState() as GameState, 24);
    expect(infuserFound(st)).toBe(false);
    expect(buildInfuser(st, ctx).reason).toContain('The Grafthouse');
  });

  it('the tiers are three different sentences, not three sizes', () => {
    expect(new Set(TIER_CAPABILITY_INFUSER).size).toBe(TIER_CAPABILITY_INFUSER.length);
    // Tier I's ceiling is the STONE's own natural count, which is what makes
    // "it puts back what a Still took" arithmetic rather than a slogan.
    expect(traitCeiling(withInfuser(1), 'marl')).toBe(traitsOf('marl').length);
    expect(traitCeiling(withInfuser(2), 'marl')).toBe(3);
    const three = withInfuser(3);
    expect(traitCeiling(three, 'marl')).toBe(MAX_TRAITS);
    expect(tierOf(three, 'infuser')).toBe(MAX_MACHINE_TIER);
  });

  /**
   * MEASURED BEFORE IT WAS WRITTEN, and the measurement moved the design: every
   * natural stone in the game carries TWO or THREE traits (91 and 10), so a
   * flat tier-I ceiling of 2 refused every ordinary stone by arithmetic and the
   * "stilled only" rule sat unreachable behind it. The ceiling is the stone's
   * own natural count now, and the gate is checked first.
   */
  it('tier I only puts back what a Still took — that is the capability, tested', () => {
    const hist = new Map<number, number>();
    for (const m of MATERIALS.filter((x) => !x.worked && !x.source)) {
      const n = traitsOf(m.id).length;
      hist.set(n, (hist.get(n) ?? 0) + 1);
    }
    expect([...hist.keys()].sort(), 'the histogram this design was sized against moved').toEqual([2, 3]);

    const one = withInfuser(1);
    addVial(one, 'brittle', 'millstone');
    addMaterial(one, 'marl', 80);            // an ordinary stone: refused, BY NAME
    expect(infuseBlocker(one, vialsHeld(one)[0]!, 'marl', 'fine'))
      .toContain('puts back what a Still took');

    // ...and the SAME vial into a stilled stone, at the SAME tier: taken.
    buildStill(one, ctx);
    addMaterial(one, 'millstone', 80);
    distil(one, ctx, 'millstone', 'fine', 'brittle');
    const stilled = stilledId('millstone', 'brittle');
    expect(traitsOf(stilled)).toHaveLength(traitsOf('millstone').length - 1);
    expect(infuseBlocker(one, vialsHeld(one)[0]!, stilled, 'fine')).toBeNull();

    // ...and the ordinary stone opens at tier II, which is the next sentence.
    const two = withInfuser(2);
    addVial(two, 'brittle', 'millstone');
    addMaterial(two, 'marl', 80);
    expect(infuseBlocker(two, vialsHeld(two)[0]!, 'marl', 'fine')).toBeNull();
  });

  it('and it is built from cast parts, remembering what it was cast from', () => {
    const st = walked();
    expect(infuserBuilt(st)).toBe(false);
    expect(buildInfuser(st, ctx).ok).toBe(true);
    expect(st.plant!.builtOf!['infuser']).toContain('marl');
  });

  it('a cracked Infuser will not run — E2 reaches it like every machine', () => {
    const st = withInfuser(2);
    addVial(st, 'brittle', 'millstone');
    addMaterial(st, 'marl', 80);
    const v = vialsHeld(st)[0]!;
    expect(infuseBlocker(st, v, 'marl', 'fine')).toBeNull();
    ensureCondition(st)['infuser'] = { id: 'baked', level: 1, seized: true };
    expect(infuseBlocker(st, v, 'marl', 'fine')).toContain('cracked');
  });
});

// ---------------------------------------------------------------------------
// 2 — END TO END, WITH THE SOURCE LOSING IT
// ---------------------------------------------------------------------------

describe('2 — a trait taken out of one stone and put into another', () => {
  it('millstone loses `brittle`, ochre gains it, and the vial is spent', () => {
    const st = withInfuser(2);
    buildStill(st, ctx); buildStill(st, ctx); buildStill(st, ctx);
    addMaterial(st, 'millstone', 80);
    addMaterial(st, 'ochre', 80);

    // THE SOURCE LOSES IT.
    expect(traitsOf('millstone')).toContain('brittle');
    expect(distil(st, ctx, 'millstone', 'fine', 'brittle').ok).toBe(true);
    const stilled = stilledId('millstone', 'brittle');
    expect(traitsOf(stilled), 'the stilled form kept the trait').not.toContain('brittle');
    expect(materialCount(st, 'millstone'), 'the unit that lost it is gone').toBe(0);
    expect(materialCount(st, stilled)).toBe(1);

    // THE VIAL CARRIES IT.
    const v = vialsHeld(st).find((x) => x.trait === 'brittle')!;
    expect(v.fromId).toBe('millstone');

    // AND ANOTHER STONE GAINS IT.
    const before = traitsOf('ochre').length;
    const r = infuse(st, ctx, v, 'ochre', 'fine');
    expect(r.ok, r.reason).toBe(true);
    const into = infusedId('ochre', 'brittle');
    expect(traitsOf(into)).toEqual([...traitsOf('ochre'), 'brittle']);
    expect(traitsOf(into)).toHaveLength(before + 1);
    expect(materialCount(st, into)).toBe(1);
    expect(materialCount(st, 'ochre')).toBe(0);
    // The vial is spent. One strip, one infusion.
    expect(vialsHeld(st).some((x) => x.trait === 'brittle' && x.fromId === 'millstone')).toBe(false);
  });

  it('the same trait cannot be put into a stone that already has it', () => {
    const st = withInfuser(3);
    const has = traitsOf('marl')[0]!;   // read off the registry, not assumed
    addVial(st, has, 'millstone');
    addMaterial(st, 'marl', 80);
    expect(infuseBlocker(st, vialsHeld(st)[0]!, 'marl', 'fine')).toContain('already');
  });

  it('and nothing carries more than four, at any tier', () => {
    const st = withInfuser(3);
    // record is a three-trait Aleph stone; two infusions would be five.
    const four = registerInfusedForm('record', 'brittle')!;
    expect(traitsOf(four.id)).toHaveLength(4);
    addVial(st, 'warm', four.id);
    addMaterial(st, four.id, 80);
    expect(infuseBlocker(st, vialsHeld(st)[0]!, four.id, 'fine')).toContain(String(MAX_TRAITS));
    expect(registerInfusedForm(four.id, 'warm'), 'a fifth trait registered').toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3 — THE LOAD-BEARING ONE
// ---------------------------------------------------------------------------

/**
 * "A TRAIT MOVED IS NOT A TRAIT CREATED. If infusion can raise a material's
 * worth without something losing it, it's a faucet."
 *
 * §14.4's worth is linear in the trait count, so the whole guarantee reduces to
 * one comparison — and it is tested as an inequality over every ordered pair of
 * ordinary stones in the game, at the most permissive tier, which is the only
 * place a leak could hide.
 */
describe('3 — no pair of stones gains worth by passing a trait', () => {
  it('strip from A, infuse into B: total worth never rises, for EVERY legal pair', () => {
    const ids = MATERIALS.filter((m) => !m.worked && !m.source).map((m) => m.id);
    expect(ids.length).toBeGreaterThan(80);
    let checked = 0;
    const leaks: string[] = [];
    for (const a of ids) {
      const aTraits = traitsOf(a);
      if (aTraits.length < 2) continue;              // the Still refuses the last trait
      for (const b of ids) {
        if (a === b) continue;
        for (const t of aTraits) {
          if (traitsOf(b).includes(t)) continue;
          if (traitsOf(b).length + 1 > MAX_TRAITS) continue;
          const vial = vialOf(t, a);
          if (!runsDownhill(vial, b)) continue;      // the machine refuses it
          checked += 1;
          // Worth BEFORE: the two stones as they are.
          // Worth AFTER: A minus the trait, B plus it. Every unit is accounted
          // for — one unit of each goes in, one unit of each comes out.
          const before = worth(a) + worth(b);
          const aLess = MATERIALS.find((m) => m.id === stilledId(a, t))
            ? worth(stilledId(a, t))
            : worthOf(a, aTraits.length - 1);
          const bMore = worthOf(b, traitsOf(b).length + 1);
          if (aLess + bMore > before + 1e-9) leaks.push(`${a} -${t}-> ${b}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(2000);
    expect(leaks.slice(0, 5), `${leaks.length} pairs gained worth`).toEqual([]);
  });

  /** Worth as §14.4 computes it, for a hypothetical trait count. */
  function worthOf(materialId: string, traits: number): number {
    const base = worth(materialId);
    const n = traitsOf(materialId).length;
    return (base / (1 + 0.15 * n)) * (1 + 0.15 * traits);
  }

  it('the rule is stated the way it is enforced: essence runs downhill', () => {
    // marl is common; umberjade is pure. A common vial will not climb.
    expect(materialDef('marl').rarity).toBe('common');
    expect(RARITIES.indexOf(materialDef('umberjade').rarity))
      .toBeGreaterThan(RARITIES.indexOf('common'));
    expect(runsDownhill(vialOf('dense', 'marl'), 'umberjade')).toBe(false);
    expect(runsDownhill(vialOf('dense', 'umberjade'), 'marl')).toBe(true);
    // ...and equal bands are legal, which is where a trait truly only MOVES.
    expect(runsDownhill(vialOf('dense', 'marl'), 'ochre')).toBe(true);
  });

  it('and the refusal NAMES both stones and both bands', () => {
    const st = withInfuser(3);
    addVial(st, 'dense', 'marl');
    addMaterial(st, 'umberjade', 80);
    const r = infuseBlocker(st, vialsHeld(st)[0]!, 'umberjade', 'fine');
    expect(r).toContain('downhill');
    expect(r).toContain('Marl');
    expect(r).toContain('common');
    expect(r).toContain('pure');
  });

  it('the bench lists what you HOLD, and only what this vial will take', () => {
    const st = withInfuser(3);
    addVial(st, 'brittle', 'umberjade');
    expect(targetsFor(st, vialsHeld(st)[0]!), 'an empty Hold offered rows').toEqual([]);
    addMaterial(st, 'marl', 80);          // common, downhill of pure — legal
    addMaterial(st, 'wormsteel', 80);     // pure, equal — legal unless it has it
    addMaterial(st, 'millstone', 80);     // flawless, uphill — refused
    const rows = targetsFor(st, vialsHeld(st)[0]!);
    expect(rows.map((r) => r.materialId)).not.toContain('millstone');
    expect(rows.map((r) => r.materialId)).toContain('marl');
  });
});

// ---------------------------------------------------------------------------
// 4 — A REAL MATERIAL, AND §11.4's SHAKE
// ---------------------------------------------------------------------------

describe('4 — an infused stone is a material like any other', () => {
  it('it exists in the registry, is `infused`-sourced, and cannot be dug up', () => {
    const def = registerInfusedForm('ochre', 'brittle')!;
    expect(def.shellId).toBe('loam');
    expect(def.source).toBe('infused');
    const rng = (() => { let a = 7; return () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; }; })();
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const r = rollDrop('loam', i % 151, rng);
      if (r.kind === 'material') seen.add(r.materialId!);
    }
    expect(seen.has(def.id), 'an infused stone came out of the rock').toBe(false);
  });

  /**
   * THE CLONE SWEEP, AND IT FOUND FORTY-SIX ON ITS FIRST RUN.
   *
   * `derivePart` reads a material's SHELL, RARITY and TRAITS and nothing else,
   * so any two stones sharing that triple derive bit for bit — which is the
   * clone class this project has now found nine times. The Infuser is the first
   * machine that can mint one ON DEMAND: `Springy Bonechalk` came out identical
   * to `Brittle Marl`, `Hollow Graveclay` to `Dense Ochre`, forty-six in all.
   *
   * The fix is structural and is §14.2's own rule, applied one system across:
   * an infusion that lands on a triple something already IS produces that
   * thing (`stoneLike`). So this test sweeps the WHOLE reachable space — every
   * material times every trait it does not have — and asserts zero, which it
   * can only do because minting a twin is now impossible rather than avoided.
   */
  it('no infused form is a bit-for-bit clone of anything else in the game', () => {
    let minted = 0;
    for (const m of MATERIALS.filter((x) => !x.worked && !x.source)) {
      for (const t of Object.keys(TRAITS) as TraitId[]) {
        if (traitsOf(m.id).includes(t)) continue;
        if (traitsOf(m.id).length >= MAX_TRAITS) continue;
        const got = registerInfusedForm(m.id, t);
        if (got?.source === 'infused') minted += 1;
      }
    }
    expect(minted, 'the sweep registered nothing — vacuous').toBeGreaterThan(200);
    const key = (id: string) => TOOL_STATS
      .map((s) => derivePart(makePart('head', id, 60)).stats[s].toFixed(3)).join('|');
    const seen = new Map<string, string>();
    const clones: string[] = [];
    for (const m of MATERIALS.filter((x) => !x.worked && x.source !== 'combat')) {
      const k = key(m.id);
      if (seen.has(k)) clones.push(`${m.name} collides with ${seen.get(k)}`);
      else seen.set(k, m.name);
    }
    expect(clones.slice(0, 5), `${clones.length} clones`).toEqual([]);
  });

  it('...and the rule that closes it: infusing into a diggable triple GIVES you that stone', () => {
    // Read a real collision off the registry rather than naming one: find any
    // (stone, trait) whose result is a stone you could have dug.
    const hit = (() => {
      for (const m of MATERIALS.filter((x) => !x.worked && !x.source)) {
        for (const t of Object.keys(TRAITS) as TraitId[]) {
          if (traitsOf(m.id).includes(t)) continue;
          const r = resultOf(m.id, t);
          if (r !== infusedId(m.id, t) && materialDef(r).source === undefined) return { m, t, r };
        }
      }
      return null;
    })();
    expect(hit, 'no diggable collision exists at all — the rule is untested').not.toBeNull();
    expect(materialDef(hit!.r).id).not.toBe(hit!.m.id);
    expect([...traitsOf(hit!.r)].sort())
      .toEqual([...traitsOf(hit!.m.id), hit!.t].sort());
  });

  it('an infused form is never a seam pool candidate anywhere in the game', () => {
    const made = new Set(MATERIALS.filter((m) => m.source === 'infused').map((m) => m.id));
    expect(made.size).toBeGreaterThan(0);
    for (const { def } of allAuthoredStations()) {
      for (const id of [...(def.seams ?? []), ...(def.remains ?? []), ...(def.floodSeams ?? [])]) {
        expect(made.has(id), `${def.name} seams an infused stone`).toBe(false);
      }
    }
  });

  it('`naturalTraits` reads through both suffixes, however many hops', () => {
    const stilled = stilledId('millstone', 'brittle');
    const back = infusedId(stilled, 'warm');
    registerInfusedForm(stilled, 'warm');
    expect(naturalTraits('millstone')).toBe(MATERIAL_TRAITS['millstone']!.length);
    expect(naturalTraits(stilled)).toBe(naturalTraits('millstone'));
    expect(naturalTraits(back)).toBe(naturalTraits('millstone'));
    // Two hops, and the count is back where it started — so it is NOT over.
    expect(overNatural(back)).toBe(0);
  });

  it('§11.4 — a stone carrying more than it was born with makes the tool shake', () => {
    const over = registerInfusedForm('ochre', 'brittle')!;
    expect(overNatural(over.id)).toBe(1);
    expect(overNatural('ochre')).toBe(0);
  });

  it('and the Hold can say what it holds', () => {
    const st = withInfuser(2);
    expect(infusedHeld(st)).toEqual([]);
    addVial(st, 'brittle', 'umberjade');
    addMaterial(st, 'marl', 80);
    expect(infuse(st, ctx, vialsHeld(st)[0]!, 'marl', 'fine').ok).toBe(true);
    expect(infusedHeld(st)).toEqual([{ id: infusedId('marl', 'brittle'), count: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// 5 — PILLAR 2
// ---------------------------------------------------------------------------

describe('5 — PILLAR 2: it moves a property and makes nothing', () => {
  it('one unit in, one unit out, and the band does not move', () => {
    const st = withInfuser(2);
    addVial(st, 'brittle', 'umberjade');
    for (let i = 0; i < 5; i++) addMaterial(st, 'marl', 80);
    const drops = st.materials.totalDrops;
    infuse(st, ctx, vialsHeld(st)[0]!, 'marl', 'fine');
    const total = Object.values(st.materials.stacks)
      .reduce((n, per) => n + Object.values(per).reduce((a, s) => a + (s?.count ?? 0), 0), 0);
    expect(total, 'the Infuser made or ate a unit').toBe(5);
    expect(st.materials.totalDrops, 'a conversion counted as a find').toBe(drops);
    expect(Object.keys(st.materials.stacks[infusedId('marl', 'brittle')]!)).toEqual(['fine']);
  });

  it('no currency moves', () => {
    const st = withInfuser(2);
    addVial(st, 'brittle', 'umberjade');
    addMaterial(st, 'marl', 80);
    const before = JSON.stringify(st.currencies);
    infuse(st, ctx, vialsHeld(st)[0]!, 'marl', 'fine');
    expect(JSON.stringify(st.currencies)).toBe(before);
  });

  it('dpsMax at the SAME depth is identical before and after', () => {
    const read = (run: boolean): number => {
      const st = withInfuser(3);
      st.depth = 62; // THE SAME DEPTH IN BOTH ARMS
      addVial(st, 'brittle', 'umberjade');
      addMaterial(st, 'marl', 80);
      if (run) infuse(st, ctx, vialsHeld(st)[0]!, 'marl', 'fine');
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });
});
