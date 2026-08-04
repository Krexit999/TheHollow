/**
 * THE ALLOY CRUCIBLE — ALLOYING (§14.2, §13), A.91.
 *
 *   0  WHY IT IS MANDATORY, measured — and the first draft of the claim was
 *      wrong, which is recorded rather than quietly corrected
 *   1  the place, then the price, and tiers as capability
 *   2  a ratio is a SPARSE set in a large space, and a miss gives GROG
 *   3  the traits BLEND by share of the pour — the load-bearing verb
 *   4  an alloy is a real material: registered, pool-excluded, clone-free
 *   5  it cannot launder a rarity, and a pour is strictly lossy in units
 *   6  alloy-only traits are CUT, and the absence is asserted
 *   7  PILLAR 2
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { MATERIALS, materialDef, rollDrop } from '../materials';
import { traitsOf } from '../traits';
import { addMaterial, materialCount } from '../systems/forge';
import { markReached } from '../systems/roll';
import { derivePart, makePart } from '../systems/forgeParts';
import { STAT_BASE, TOOL_STATS } from '../content/forgeParts';
import { MAX_MACHINE_TIER, tierOf } from '../systems/plant';
import { ensureCondition } from '../systems/condition';
import {
  GROG, MAX_ALLOY_TRAITS, POUR_MAX_UNITS, TRAIT_SHARE, alloyId, alloysFound, blendTraits,
  buildCrucible, crucibleBuilt, crucibleFound, crucibleStation, ensureCrucible, isRatio,
  metalLimit, pour, pourBlocker, pourPreview, diggableWith,
} from '../systems/crucible';
import { allAuthoredStations } from '../content/rolls';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;

function racked(st: GameState, n: number): GameState {
  st.casting.rack = Array.from({ length: n }, (_, i) =>
    ({ id: 2000 + i, materialId: 'marl', type: 'head', purity: 50 } as never));
  st.casting.nextId = 2000 + n;
  return st;
}

/** A player standing at Alloyer's End with parts on the rack. */
function atTheEnd(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'ferrite';
  markReached(st, 250, 15);
  return racked(st, 24);
}

function withCrucible(tier = 1): GameState {
  const st = atTheEnd();
  for (let i = 0; i < tier; i++) buildCrucible(st, ctx);
  return st;
}

/** Stock the Hold with n of each named metal. */
function stock(st: GameState, ids: string[], n = 6): GameState {
  for (const id of ids) for (let i = 0; i < n; i++) addMaterial(st, id, 60);
  return st;
}

beforeEach(() => { /* each test builds its own */ });

// ---------------------------------------------------------------------------
// 0 — WHY IT IS MANDATORY
// ---------------------------------------------------------------------------

/**
 * THE FIRST DRAFT OF THIS BLOCK CLAIMED SOMETHING FALSE, and the correction is
 * worth keeping. It asserted "no ordinary stone carries three traits", which is
 * what §14.2's "Ferrite ore carries two" sounds like. Measured: NINE ordinary
 * stones carry three (I counted nine and it is ten), one or two per shell — and every single one is `starred`
 * or `aberrant`, the last two rungs of the ladder.
 *
 * So the surviving claim is narrower and truer: a three-trait stone exists only
 * in the bottom third of a shell, and a three-trait stone OF A CHOSEN SET does
 * not exist at any depth. "A number in a document is not evidence" applies to
 * the spine, and it applies to a comment written five minutes ago.
 */
describe('0 — a three-trait stone is a bottom-of-the-shell thing', () => {
  it('every ordinary 3-trait stone is starred or aberrant, and there are ten', () => {
    const three = MATERIALS
      .filter((m) => !m.worked && !m.source && traitsOf(m.id).length >= 3);
    expect(three).toHaveLength(10);
    for (const m of three) {
      expect(['starred', 'aberrant'], `${m.id} is an ordinary ${m.rarity} with three traits`)
        .toContain(m.rarity);
    }
    // One or two per shell, never more — so it is a landmark, not a supply.
    for (const shell of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph']) {
      const n = three.filter((m) => m.shellId === shell).length;
      expect(n, `${shell} has ${n}`).toBeLessThanOrEqual(2);
      expect(n, `${shell} has none`).toBeGreaterThanOrEqual(1);
    }
  });

  it('...and no COMMON or RICH stone anywhere carries three', () => {
    const early = MATERIALS.filter((m) => !m.worked && !m.source
      && (m.rarity === 'common' || m.rarity === 'rich'));
    expect(early.length).toBeGreaterThan(40);
    for (const m of early) {
      expect(traitsOf(m.id).length, `${m.id} is an early ${m.rarity} with three traits`)
        .toBeLessThanOrEqual(2);
    }
    // But three Ferrite COMMONS poured together make one — which is the whole
    // of §14.2's "mandatory because", moved off the spine's word and onto a
    // measurement.
    expect(blendTraits([
      { materialId: 'ironbloom', count: 1 },
      { materialId: 'rustmarrow', count: 1 },
      { materialId: 'greyflux', count: 1 },
    ]).length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 1 — THE MACHINE
// ---------------------------------------------------------------------------

describe('1 — the place, then the price (§6, §15.4)', () => {
  it('it is at Alloyer\'s End 70 in Ferrite, exactly where §6 puts it', () => {
    expect(crucibleStation()).toEqual({ shellId: 'ferrite', depth: 70, name: "Alloyer's End" });
    expect(allAuthoredStations().filter((s) => s.def.wreck === 'THE ALLOY CRUCIBLE')).toHaveLength(1);
  });

  it('a player who has not been there cannot raise it', () => {
    const st = racked(createEngine({ nowMs: 0 }).getState() as GameState, 24);
    expect(crucibleFound(st)).toBe(false);
    expect(buildCrucible(st, ctx).reason).toContain("Alloyer's End");
  });

  it('and it is built from cast parts, remembering what it was cast from', () => {
    const st = atTheEnd();
    expect(crucibleBuilt(st)).toBe(false);
    expect(buildCrucible(st, ctx).ok).toBe(true);
    expect(tierOf(st, 'crucible')).toBe(1);
    expect(st.plant!.builtOf!['crucible']).toContain('marl');
  });

  it('I pours two metals, II three, III four and it keeps the best purity', () => {
    expect(metalLimit(withCrucible(1))).toBe(2);
    expect(metalLimit(withCrucible(2))).toBe(3);
    const three = withCrucible(3);
    expect(metalLimit(three)).toBe(4);
    expect(tierOf(three, 'crucible')).toBe(MAX_MACHINE_TIER);

    // A tier-I Crucible refuses a three-metal pour BY NAME.
    const one = stock(withCrucible(1), ['ironbloom', 'rustmarrow', 'greyflux']);
    expect(pourBlocker(one, [
      { materialId: 'ironbloom', count: 1 },
      { materialId: 'rustmarrow', count: 1 },
      { materialId: 'greyflux', count: 1 },
    ])).toBe('This Crucible holds 2 metals.');
  });

  it('a cracked Crucible will not run — E2 reaches it like every machine', () => {
    const st = stock(withCrucible(1), ['ironbloom', 'rustmarrow']);
    const parts = [{ materialId: 'ironbloom', count: 1 }, { materialId: 'rustmarrow', count: 2 }];
    expect(pourBlocker(st, parts)).toBeNull();
    ensureCondition(st)['crucible'] = { id: 'baked', level: 1, seized: true };
    expect(pourBlocker(st, parts)).toContain('cracked');
  });
});

// ---------------------------------------------------------------------------
// 2 — A SPARSE SET IN A LARGE SPACE
// ---------------------------------------------------------------------------

describe('2 — a ratio is in LOWEST TERMS, and a miss gives grog', () => {
  it('coprime is the rule, and it is genuinely sparse', () => {
    const p = (a: number, b: number) => [
      { materialId: 'ironbloom', count: a }, { materialId: 'rustmarrow', count: b },
    ];
    expect(isRatio(p(1, 1))).toBe(true);
    expect(isRatio(p(2, 3))).toBe(true);
    expect(isRatio(p(1, 5))).toBe(true);
    expect(isRatio(p(2, 2)), '2:2 is 1:1 poured twice').toBe(false);
    expect(isRatio(p(2, 4))).toBe(false);
    expect(isRatio(p(3, 3))).toBe(false);
    expect(isRatio(p(3, 4)), 'over the unit cap').toBe(false);

    // The space, counted: two-metal pours summing to at most six.
    let valid = 0; let total = 0;
    for (let a = 1; a <= POUR_MAX_UNITS; a++) {
      for (let b = 1; b <= POUR_MAX_UNITS; b++) { total += 1; if (isRatio(p(a, b))) valid += 1; }
    }
    expect(valid).toBeGreaterThan(0);
    expect(valid / total, 'the valid set is not sparse').toBeLessThan(0.5);
  });

  it('a pour that is not a ratio comes out GROG — filler, never nothing', () => {
    const st = stock(withCrucible(1), ['ironbloom', 'rustmarrow']);
    const parts = [{ materialId: 'ironbloom', count: 2 }, { materialId: 'rustmarrow', count: 2 }];
    expect(pourPreview(st, parts).ok).toBe(false);
    expect(pourPreview(st, parts).reason).toContain('not a ratio');

    const before = materialCount(st, 'ironbloom');
    const r = pour(st, ctx, parts);
    expect(r.ok, 'the pour itself succeeds — you got grog, not an error').toBe(true);
    expect((r.data as { grog: boolean }).grog).toBe(true);
    expect(materialCount(st, GROG)).toBe(1);
    expect(ensureCrucible(st).grog).toBe(1);
    // AND IT STILL COSTS. "Experimenting costs almost nothing" is about the
    // price being small, not free — a guess that costs nothing teaches nothing.
    expect(materialCount(st, 'ironbloom')).toBe(before - 2);
  });

  it('grog is a WORKED material — it can never come out of the rock', () => {
    const st = stock(withCrucible(1), ['ironbloom', 'rustmarrow']);
    pour(st, ctx, [{ materialId: 'ironbloom', count: 2 }, { materialId: 'rustmarrow', count: 2 }]);
    expect(materialDef(GROG).worked).toBe(true);
    let a = 7;
    const rng = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const d = rollDrop('ferrite', i % 251, rng);
      if (d.kind === 'material') seen.add(d.materialId!);
    }
    expect(seen.has(GROG)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3 — THE LOAD-BEARING ONE
// ---------------------------------------------------------------------------

describe('3 — the traits BLEND by share of the pour', () => {
  it('a trait under a quarter of the pour does not survive it', () => {
    // ironbloom is tough+dense; greyflux is light+charged (Ferrite commons).
    const majority = blendTraits([
      { materialId: 'ironbloom', count: 5 }, { materialId: 'greyflux', count: 1 },
    ]);
    const even = blendTraits([
      { materialId: 'ironbloom', count: 1 }, { materialId: 'greyflux', count: 1 },
    ]);
    expect(even.length, 'an even pour keeps both metals\' traits').toBe(4);
    expect(majority.length, 'a 5:1 pour drops the minority metal').toBeLessThan(even.length);
    for (const t of traitsOf('greyflux')) expect(majority).not.toContain(t);
    expect(1 / 6).toBeLessThan(TRAIT_SHARE);
  });

  it('and never more than four, whatever goes in (§7.4 rule 1)', () => {
    const st = withCrucible(3);
    const wide = blendTraits([
      { materialId: 'ironbloom', count: 1 }, { materialId: 'greyflux', count: 1 },
      { materialId: 'rustmarrow', count: 1 }, { materialId: 'scalechip', count: 1 },
    ]);
    expect(wide.length).toBeLessThanOrEqual(MAX_ALLOY_TRAITS);
    expect(metalLimit(st)).toBe(4);
  });

  it('THE POUR, END TO END: three commons become a three-trait stone', () => {
    const st = stock(withCrucible(2), ['ironbloom', 'rustmarrow', 'greyflux']);
    const parts = [
      { materialId: 'ironbloom', count: 1 },
      { materialId: 'rustmarrow', count: 1 },
      { materialId: 'greyflux', count: 1 },
    ];
    const preview = pourPreview(st, parts);
    expect(preview.ok, preview.reason).toBe(true);
    expect(preview.traits.length).toBeGreaterThanOrEqual(3);

    const r = pour(st, ctx, parts);
    expect(r.ok, r.reason).toBe(true);
    const id = (r.data as { alloyId: string }).alloyId;
    expect(id).toBe(preview.alloyId);
    expect(materialCount(st, id)).toBe(1);
    expect(traitsOf(id)).toEqual(preview.traits);
    expect(traitsOf(id).length, 'no Ferrite stone can be dug with three').toBeGreaterThanOrEqual(3);
    expect(alloysFound(st).map((a) => a.id)).toEqual([id]);
  });

  it('an alloy is its SHELL and its TRAIT SET, never its recipe', () => {
    const st = stock(withCrucible(2), ['ironbloom', 'greyflux', 'rustmarrow'], 12);
    const a = pour(st, ctx, [
      { materialId: 'ironbloom', count: 1 }, { materialId: 'greyflux', count: 1 },
    ]);
    const b = pour(st, ctx, [
      { materialId: 'ironbloom', count: 2 }, { materialId: 'greyflux', count: 3 },
    ]);
    // Two different ratios, the same surviving traits, the same alloy — which
    // is what makes finding a cheaper route to one you know worth something.
    expect((b.data as { alloyId: string }).alloyId).toBe((a.data as { alloyId: string }).alloyId);
    expect((b.data as { fresh: boolean }).fresh, 'the second was recorded as new').toBe(false);
    expect(ensureCrucible(st).found).toHaveLength(1);

    // ...and the SAME traits in a different shell are a different alloy.
    expect(alloyId('ferrite', ['tough', 'dense'])).not.toBe(alloyId('loam', ['tough', 'dense']));
  });
});

// ---------------------------------------------------------------------------
// 4 — A REAL MATERIAL
// ---------------------------------------------------------------------------

describe('4 — an alloy is a material like any other', () => {
  it('it is `alloy`-sourced, in the registry, and cannot be dug', () => {
    const st = stock(withCrucible(1), ['ironbloom', 'greyflux']);
    const r = pour(st, ctx, [
      { materialId: 'ironbloom', count: 1 }, { materialId: 'greyflux', count: 1 },
    ]);
    const id = (r.data as { alloyId: string }).alloyId;
    const def = materialDef(id);
    expect(def.source).toBe('alloy');
    expect(def.shellId).toBe('ferrite');
    let a = 3;
    const rng = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const d = rollDrop('ferrite', i % 251, rng);
      if (d.kind === 'material') seen.add(d.materialId!);
    }
    expect(seen.has(id)).toBe(false);
  });

  it('and the Forge reads it without being taught anything', () => {
    const st = stock(withCrucible(2), ['ironbloom', 'rustmarrow', 'greyflux']);
    const r = pour(st, ctx, [
      { materialId: 'ironbloom', count: 1 },
      { materialId: 'rustmarrow', count: 1 },
      { materialId: 'greyflux', count: 1 },
    ]);
    const id = (r.data as { alloyId: string }).alloyId;
    const worth = (mid: string): number => {
      const d = derivePart(makePart('binding', mid, 70));
      return TOOL_STATS.reduce((n, s) => n + d.stats[s] / STAT_BASE[s], 0);
    };
    expect(worth(id)).toBeGreaterThan(0);
    /**
     * WHAT THE ALLOY BUYS IS TRAIT COUNT, NOT SCORE — and the first draft of
     * this test asserted the wrong one. A three-trait binding measured LOWER
     * than plain greyflux, because every trait costs something somewhere and
     * `derivePart` is not monotone in how many you carry. That is the trait
     * system working; §14.2's claim is that tier V bindings NEED three traits,
     * not that three traits are always better.
     */
    expect(traitsOf(id).length).toBeGreaterThanOrEqual(3);
    for (const m of ['ironbloom', 'rustmarrow', 'greyflux']) {
      expect(traitsOf(id).length, `the alloy carries no more than ${m}`)
        .toBeGreaterThan(traitsOf(m).length);
    }
  });

  it('no alloy is a bit-for-bit clone of a natural stone', () => {
    const st = stock(withCrucible(3), ['ironbloom', 'rustmarrow', 'greyflux', 'scalechip'], 24);
    // Pour a spread of ratios so several alloys exist before the sweep.
    for (const parts of [
      [{ materialId: 'ironbloom', count: 1 }, { materialId: 'greyflux', count: 1 }],
      [{ materialId: 'ironbloom', count: 1 }, { materialId: 'rustmarrow', count: 1 }],
      [{ materialId: 'rustmarrow', count: 1 }, { materialId: 'scalechip', count: 1 }],
      [{ materialId: 'ironbloom', count: 1 }, { materialId: 'scalechip', count: 3 }],
    ]) pour(st, ctx, parts);
    expect(ensureCrucible(st).found.length).toBeGreaterThanOrEqual(3);

    const key = (id: string) => TOOL_STATS
      .map((s) => derivePart(makePart('head', id, 60)).stats[s].toFixed(3)).join('|');
    const seen = new Map<string, string>();
    for (const m of MATERIALS.filter((x) => !x.worked && x.source !== 'combat')) {
      const k = key(m.id);
      expect(seen.has(k), `${m.name} collides with ${seen.get(k)}`).toBe(false);
      seen.set(k, m.name);
    }
  });
});

// ---------------------------------------------------------------------------
// 5 — IT CANNOT LAUNDER, AND IT LOSES
// ---------------------------------------------------------------------------

describe('5 — an alloy is only as good as its worst metal', () => {
  it('one flawless unit in five commons does not make a flawless alloy', () => {
    const st = withCrucible(1);
    stock(st, ['ironbloom'], 6);            // common
    stock(st, ['nullsilver'], 6);           // flawless
    const preview = pourPreview(st, [
      { materialId: 'nullsilver', count: 1 }, { materialId: 'ironbloom', count: 5 },
    ]);
    expect(materialDef('nullsilver').rarity).toBe('flawless');
    expect(preview.rarity, 'the pour laundered a rarity').toBe('common');
  });

  it('and a pour is STRICTLY LOSSY: N units in, exactly one out', () => {
    const st = stock(withCrucible(2), ['ironbloom', 'rustmarrow', 'greyflux'], 6);
    const total = () => Object.values(st.materials.stacks)
      .reduce((n, per) => n + Object.values(per).reduce((a, s) => a + (s?.count ?? 0), 0), 0);
    const before = total();
    const drops = st.materials.totalDrops;
    const r = pour(st, ctx, [
      { materialId: 'ironbloom', count: 1 },
      { materialId: 'rustmarrow', count: 2 },
      { materialId: 'greyflux', count: 3 },
    ]);
    expect(r.ok).toBe(true);
    expect(before - total(), 'six units in, one out — a net loss of five').toBe(5);
    expect(st.materials.totalDrops, 'a conversion counted as a find').toBe(drops);
  });

  it('and it refuses what the Hold cannot pay, by name', () => {
    const st = stock(withCrucible(1), ['ironbloom'], 1);
    stock(st, ['greyflux'], 1);
    expect(pourBlocker(st, [
      { materialId: 'ironbloom', count: 3 }, { materialId: 'greyflux', count: 1 },
    ])).toContain('the Hold has 1');
    expect(pourBlocker(st, [
      { materialId: 'ironbloom', count: 1 }, { materialId: 'ironbloom', count: 1 },
    ])).toContain('the same metal');
  });
});

// ---------------------------------------------------------------------------
// 6 — ALLOY-ONLY TRAITS ARE CUT
// ---------------------------------------------------------------------------

/**
 * §14.2 names two traits no ore carries — `poled` and `sympathetic`. `TraitId`
 * is a closed union of ten, and `TRAITS`, `FORGE_TRAITS`, `HEFT`, `GRADE_BONUS`
 * and `MATERIAL_TRAITS` are all Records over it: adding two means an entry in
 * every one, each a balance decision in the most load-bearing system in the
 * game. Cut with the reason, ledgered, and asserted so the words cannot creep
 * back as names against no mechanism.
 */
describe('6 — alloy-only traits are CUT, and stay cut', () => {
  it('no alloy carries a trait no ore can', () => {
    const st = stock(withCrucible(3), ['ironbloom', 'rustmarrow', 'greyflux', 'scalechip'], 12);
    pour(st, ctx, [
      { materialId: 'ironbloom', count: 1 }, { materialId: 'rustmarrow', count: 1 },
      { materialId: 'greyflux', count: 1 }, { materialId: 'scalechip', count: 1 },
    ]);
    const ore = new Set(MATERIALS.filter((m) => !m.source && !m.worked).flatMap((m) => traitsOf(m.id)));
    for (const a of alloysFound(st)) {
      for (const t of a.traits) expect(ore.has(t), `${a.id} carries ${t}, which no ore does`).toBe(true);
    }
    for (const dead of ['poled', 'sympathetic']) {
      expect([...ore]).not.toContain(dead);
    }
  });
});

// ---------------------------------------------------------------------------
// 7 — PILLAR 2
// ---------------------------------------------------------------------------

describe('7 — PILLAR 2: a pour blends, it never produces', () => {
  it('dpsMax at the SAME depth is identical before and after a pour', () => {
    const read = (run: boolean): number => {
      const st = stock(withCrucible(3), ['ironbloom', 'rustmarrow', 'greyflux'], 6);
      st.depth = 48; // THE SAME DEPTH IN BOTH ARMS
      if (run) {
        pour(st, ctx, [
          { materialId: 'ironbloom', count: 1 },
          { materialId: 'rustmarrow', count: 1 },
          { materialId: 'greyflux', count: 1 },
        ]);
      }
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });

  it('and no currency moves, on a hit or a miss', () => {
    const st = stock(withCrucible(1), ['ironbloom', 'greyflux'], 6);
    const before = JSON.stringify(st.currencies);
    pour(st, ctx, [{ materialId: 'ironbloom', count: 1 }, { materialId: 'greyflux', count: 1 }]);
    pour(st, ctx, [{ materialId: 'ironbloom', count: 2 }, { materialId: 'greyflux', count: 2 }]);
    expect(JSON.stringify(st.currencies)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 8 — AN ALLOY MUST BE A THING THAT DOES NOT EXIST
// ---------------------------------------------------------------------------

/**
 * THE EIGHTH CLONE, AND THE FIRST ONE A MECHANISM WOULD HAVE PRODUCED ON
 * DEMAND. A 5:1 pour keeps only the majority metal's traits, so
 * `Dense-Tough Alloy` derived bit for bit as Ironbloom — found by this file's
 * own clone check on its first run.
 *
 * The rule closes the class rather than the instance: a pour that lands on a
 * trait set the shell can already dig comes out GROG, and says whose set it
 * was. That is also a true, learnable thing about the machine.
 */
describe('8 — a pour that makes a stone you can dig is grog', () => {
  it('a 5:1 pour keeps one metal\'s traits, and is refused BY NAME', () => {
    const st = stock(withCrucible(1), ['ironbloom', 'greyflux'], 12);
    const parts = [{ materialId: 'ironbloom', count: 5 }, { materialId: 'greyflux', count: 1 }];
    expect(blendTraits(parts).sort()).toEqual([...traitsOf('ironbloom')].sort());
    const preview = pourPreview(st, parts);
    expect(preview.ok).toBe(false);
    expect(preview.reason).toContain('Ironbloom');
    expect(preview.reason).toContain('you can dig it');

    const r = pour(st, ctx, parts);
    expect((r.data as { grog: boolean }).grog).toBe(true);
    expect(ensureCrucible(st).found, 'a diggable set was recorded as a discovery').toEqual([]);
  });

  it('and `diggableWith` names the stone, per shell', () => {
    expect(diggableWith('ferrite', traitsOf('ironbloom'))).toBe('ironbloom');
    // Trait order does not matter — it is a SET.
    expect(diggableWith('ferrite', [...traitsOf('ironbloom')].reverse())).toBe('ironbloom');
    // A set no Ferrite stone has is a real alloy.
    expect(diggableWith('ferrite', ['tough', 'dense', 'light', 'charged'])).toBeNull();
  });
});
