/**
 * THE REACTION BENCH — §17's catalyst slot, and the measurement that made it
 * necessary.
 *
 * The headline test is §1: the heuristic §17 says every player infers in an
 * hour was 45% false against the authored chain table. That number is the whole
 * reason this pass touched the bench at all, so it is pinned here rather than
 * left in a report.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { ensureContentLoaded } from '../content';
import { createEngine } from '../index';
import { addMaterial, materialCount } from '../systems/forge';
import { CHAINS, benchReading, transmute } from '../systems/refinery';
import {
  VIOLENT_BONUS, allBridges, bridges, catalystReading, catalystsHeld,
  needsCatalyst, opposedAxis, pairClass,
} from '../systems/reaction';
import { TRAIT_IDS, opposedPairs, traitsOf, traitsOppose } from '../traits';
import { MATERIALS, materialDef } from '../materials';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx = (): EngineCtx => ({ dirty: () => {}, emit: () => {} }) as unknown as EngineCtx;

/** A save with the bench open — transmute wants deep Ferrite mastery. */
function benched(): GameState {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  s.depthRecords['ferrite'] = 4000;
  s.shell.current = 'ferrite';
  return s;
}

describe('§0 — opposition is DERIVED, not authored', () => {
  it('every opposed pair names a stat one raises and the other cuts', () => {
    for (const { a, b, axis } of opposedPairs()) {
      expect(traitsOppose(a, b), `${a}/${b}`).toBe(axis);
      expect(traitsOppose(b, a), `${b}/${a} is the same relation`).toBe(axis);
    }
  });

  it('a trait is never opposed to itself, and fifteen pairs fall out of ten traits', () => {
    for (const t of TRAIT_IDS) expect(traitsOppose(t, t)).toBeNull();
    expect(opposedPairs()).toHaveLength(15);
  });

  it('the obvious ones are there, and the impossible ones are not', () => {
    // Dense hits harder, Light hits softer — the pair a player names first.
    expect(traitsOppose('dense', 'light')).toBe('strike power');
    // Tough and Brittle disagree on TWO axes (chip yield and durability); the
    // canonical order names the first, which is why the axis is deterministic
    // rather than whichever side the question came from.
    expect(traitsOppose('tough', 'brittle')).toBe('chip yield');
    expect(traitsOppose('brittle', 'tough')).toBe('chip yield');
    expect(traitsOppose('springy', 'brittle')).toBe('durability');
    // Umberjade is brittle AND charged: two traits one stone carries at once
    // can never be opposed, or the derivation would be calling the registry a
    // liar. This is the test that would have caught a hand-authored table.
    expect(traitsOf('umberjade')).toContain('brittle');
    expect(traitsOf('umberjade')).toContain('charged');
    expect(traitsOppose('brittle', 'charged')).toBeNull();
  });

  /**
   * WRITTEN AS "NO STONE CARRIES AN OPPOSED PAIR" AND THE REGISTRY REFUSED IT.
   * `bluesteel` is keen AND tough, which are opposed on chip yield — and that
   * is a legitimate stone, not a defect: keen 1.32 × tough 0.84 is a muted edge,
   * exactly what a material that argues with itself should be.
   *
   * It is also the shape of a CATALYST. The stone that can talk to both sides
   * of a violent pair is characteristically the stone that already holds both
   * halves of the argument, so this class is load-bearing rather than tolerated.
   */
  it('a stone MAY carry an opposed pair, and those are the go-betweens', () => {
    expect(traitsOf('bluesteel')).toEqual(expect.arrayContaining(['keen', 'tough']));
    expect(traitsOppose('keen', 'tough')).toBeTruthy();
    const selfOpposed = MATERIALS.filter((m) => {
      const t = traitsOf(m.id);
      return t.some((x) => t.some((y) => traitsOppose(x, y)));
    });
    expect(selfOpposed.length).toBeGreaterThan(0);
    // And such a stone bridges a pair split along the axis it holds both ends
    // of: bluesteel is keen like a keen stone and tough like a tough one.
    expect(bridges('bluesteel', 'sablequartz', 'graveclay')).toBe(true);
  });
});

describe('§1 — THE MEASUREMENT: §17\'s heuristic was 45% false', () => {
  it('sixteen of twenty-nine chains share a trait; thirteen do not', () => {
    const share = CHAINS.filter((c) => traitsOf(c.a).some((t) => traitsOf(c.b).includes(t)));
    expect(CHAINS.length).toBe(29);
    expect(share).toHaveLength(16);
    expect(CHAINS.length - share.length).toBe(13);
  });

  it('and every one of the thirteen is now a NAMED class, never a silent exception', () => {
    for (const c of CHAINS) {
      const k = pairClass(c.a, c.b);
      expect(['shares', 'opposed', 'strangers'], `${c.id}`).toContain(k);
      if (k !== 'shares') {
        expect(traitsOf(c.a).some((t) => traitsOf(c.b).includes(t)), `${c.id}`).toBe(false);
      }
    }
    // Eight of the thirteen genuinely pull against each other; five are simply
    // strangers. Both want a catalyst; only the eight pay the violent bonus.
    const opposed = CHAINS.filter((c) => pairClass(c.a, c.b) === 'opposed');
    const strangers = CHAINS.filter((c) => pairClass(c.a, c.b) === 'strangers');
    expect(opposed).toHaveLength(8);
    expect(strangers).toHaveLength(5);
  });

  it('EVERY chain that needs a catalyst has one reachable by its own era', () => {
    // The pillar working rule: a requirement must never sit behind the wall it
    // is needed to cross. A violent chain whose only bridge is deeper than its
    // own inputs would be exactly that.
    const ORDER = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph'];
    for (const c of CHAINS) {
      if (!needsCatalyst(c.a, c.b)) continue;
      // The bench itself is a Ferrite unlock, so Ferrite is the floor era.
      const era = Math.max(1, ORDER.indexOf(materialDef(c.a).shellId), ORDER.indexOf(materialDef(c.b).shellId));
      const reachable = allBridges(c.a, c.b).filter((id) => {
        const d = materialDef(id);
        return !d.worked && ORDER.indexOf(d.shellId) <= era;
      });
      expect(reachable.length, `${c.id} has no catalyst at or above its own era`).toBeGreaterThan(0);
    }
  });
});

describe('§2 — a catalyst is the go-between, and nothing else', () => {
  it('it must share a trait with EACH side', () => {
    // bonechalk[brittle,light] + graveclay[dense,tough] — strangers on the
    // durability axis and the strike axis both.
    expect(pairClass('bonechalk', 'graveclay')).toBe('opposed');
    // millstone bridges: it carries something of each.
    expect(bridges('millstone', 'bonechalk', 'graveclay')).toBe(true);
    const t = traitsOf('millstone');
    expect(t.some((x) => traitsOf('bonechalk').includes(x))).toBe(true);
    expect(t.some((x) => traitsOf('graveclay').includes(x))).toBe(true);
  });

  it('a stone that talks to only one side does not bridge', () => {
    const half = allBridges('bonechalk', 'graveclay');
    // ochre shares `tough` with graveclay and nothing with bonechalk.
    expect(traitsOf('ochre').some((x) => traitsOf('graveclay').includes(x))).toBe(true);
    expect(traitsOf('ochre').some((x) => traitsOf('bonechalk').includes(x))).toBe(false);
    expect(half).not.toContain('ochre');
  });

  it('and a thing does not catalyse itself', () => {
    expect(bridges('bonechalk', 'bonechalk', 'graveclay')).toBe(false);
    expect(bridges('graveclay', 'bonechalk', 'graveclay')).toBe(false);
  });

  it('catalystsHeld lists what you HOLD, never the registry', () => {
    const s = benched();
    expect(catalystsHeld(s, 'bonechalk', 'graveclay')).toHaveLength(0);
    addMaterial(s, 'millstone', 50, 3);
    const held = catalystsHeld(s, 'bonechalk', 'graveclay');
    expect(held.map((h) => h.id)).toEqual(['millstone']);
    expect(held[0]!.count).toBe(3);
    expect(allBridges('bonechalk', 'graveclay').length).toBeGreaterThan(held.length);
  });
});

describe('§3 — the pour', () => {
  let s: GameState;
  beforeEach(() => { s = benched(); });

  it('a SHARING pair goes on its own, with no third stone', () => {
    // flintstaining is opposed; pick a sharing chain instead.
    const share = CHAINS.find((c) => pairClass(c.a, c.b) === 'shares')!;
    addMaterial(s, share.a, 50, share.cost);
    addMaterial(s, share.b, 50, share.cost);
    const r = transmute(s, ctx(), share.a, share.b);
    expect(r.ok).toBe(true);
    expect((r.data as { found: string | null }).found).toBe(share.id);
    expect(materialCount(s, share.out)).toBe(share.yield ?? 1);
  });

  it('AN OPPOSED PAIR REFUSES WITHOUT ONE — and nothing is spent', () => {
    addMaterial(s, 'bonechalk', 50, 8);
    addMaterial(s, 'graveclay', 50, 8);
    const r = transmute(s, ctx(), 'bonechalk', 'graveclay');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/pull against each other/);
    expect(materialCount(s, 'bonechalk')).toBe(8);
    expect(materialCount(s, 'graveclay')).toBe(8);
  });

  it('a catalyst that does not bridge is refused too', () => {
    addMaterial(s, 'bonechalk', 50, 8);
    addMaterial(s, 'graveclay', 50, 8);
    addMaterial(s, 'ochre', 50, 4);
    const r = transmute(s, ctx(), 'bonechalk', 'graveclay', 'ochre');
    expect(r.ok).toBe(false);
    expect(materialCount(s, 'ochre')).toBe(4);
  });

  it('WITH one it goes, the catalyst COMES BACK, and it pays one extra', () => {
    addMaterial(s, 'bonechalk', 50, 8);
    addMaterial(s, 'graveclay', 50, 8);
    addMaterial(s, 'millstone', 50, 2);
    const before = materialCount(s, 'millstone');
    const r = transmute(s, ctx(), 'bonechalk', 'graveclay', 'millstone');
    expect(r.ok).toBe(true);
    const d = r.data as { found: string | null; units: number; violent: boolean };
    expect(d.found).toBe('bonemeal');
    expect(d.violent).toBe(true);
    // bonemeal's own yield is 1, so a violent pour is 1 + VIOLENT_BONUS.
    expect(d.units).toBe(1 + VIOLENT_BONUS);
    expect(materialCount(s, 'bindingclay')).toBe(1 + VIOLENT_BONUS);
    expect(materialCount(s, 'millstone'), 'the catalyst was spent on a SUCCESS').toBe(before);
  });

  it('and a violent pour is still strictly lossy in units', () => {
    addMaterial(s, 'bonechalk', 50, 8);
    addMaterial(s, 'graveclay', 50, 8);
    addMaterial(s, 'millstone', 50, 2);
    const r = transmute(s, ctx(), 'bonechalk', 'graveclay', 'millstone');
    const units = (r.data as { units: number }).units;
    const chain = CHAINS.find((c) => c.id === 'bonemeal')!;
    expect(units).toBeLessThan(chain.cost * 2);
  });

  it('A MISS EATS THE CATALYST — §17, verbatim', () => {
    // Two stones with no chain, and a stone that bridges them.
    const a = 'bonechalk', b = 'graveclay';
    addMaterial(s, a, 50, 8);
    addMaterial(s, b, 50, 8);
    addMaterial(s, 'millstone', 50, 2);
    // Prove the pair-with-no-chain case by removing the chain's own claim:
    // use a genuinely unpaired but catalysable pair instead.
    const pair = (() => {
      for (const x of Object.keys(s.materials.stacks)) void x;
      // ochre[hollow,tough] + rimeiron[dense,springy]: no chain, opposed.
      return ['ochre', 'rimeiron'] as const;
    })();
    expect(CHAINS.some((c) => (c.a === pair[0] && c.b === pair[1]) || (c.a === pair[1] && c.b === pair[0]))).toBe(false);
    expect(needsCatalyst(pair[0], pair[1])).toBe(true);
    addMaterial(s, pair[0], 50, 4);
    addMaterial(s, pair[1], 50, 4);
    const bridge = allBridges(pair[0], pair[1])[0]!;
    addMaterial(s, bridge, 50, 2);
    const held = materialCount(s, bridge);
    const r = transmute(s, ctx(), pair[0], pair[1], bridge);
    expect(r.ok).toBe(true);
    expect((r.data as { found: string | null }).found).toBeNull();
    expect((r.data as { catalystSpent: boolean }).catalystSpent).toBe(true);
    expect(materialCount(s, bridge)).toBe(held - 1);
  });
});

describe('§4 — the reading says which class, before anything is spent', () => {
  it('and it never names the output', () => {
    const s = benched();
    const r = benchReading(s, 'bonechalk', 'graveclay', null);
    expect(r.klass).toBe('opposed');
    expect(r.catalyst.needed).toBe(true);
    expect(r.catalyst.ok).toBe(false);
    expect(r.line + r.catalyst.line).not.toContain('Binding');
    expect(opposedAxis('bonechalk', 'graveclay')).toBeTruthy();
  });

  it('a bridging stone turns the verdict, and says why in the player\'s words', () => {
    const s = benched();
    const cr = catalystReading(s, 'bonechalk', 'graveclay', 'millstone');
    expect(cr.ok).toBe(true);
    expect(cr.line).toContain('You get it back');
  });

  it('a sharing pair is told the third slot is irrelevant rather than left guessing', () => {
    const s = benched();
    const share = CHAINS.find((c) => pairClass(c.a, c.b) === 'shares')!;
    const cr = catalystReading(s, share.a, share.b, 'millstone');
    expect(cr.needed).toBe(false);
    expect(cr.line).toContain('will not be touched');
  });
});
