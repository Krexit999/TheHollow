import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { D } from '../decimal';
import type { GameState } from '../types';
import { spiralFromLifetime, spiralPending, gridSlotCost, licenceCost } from '../systems/spiral';
import { mintRelic, addRelic, fuseRelics, relicBonus, equipRelic, RELIC_SLOTS, AFFIXES, SOURCE_BY_ID, SOURCES, fusionPreview } from '../systems/relics';
import { CASES, caseComplete, museumBonus, tickExpeditions, ROUTE_BY_ID, claimExpedition, crewEffect, routeDurationMs, type MuseumCaseDef } from '../systems/museum';
import { HIRELING_DEFS, hirelingLevel } from '../guild/hirelings';
import { GEMS } from '../materials';
import { SPECIES } from '../combat/species';
import { CHORD_DEFS } from '../content/shell1/latticeChords';
import { ALLOY_DEFS } from '../content/shell2/alloys';
import { BREWS } from '../content/shell3/brews';
import { BASE_STRAINS } from '../content/shell3/greenhouse';
import { SHAPE_EFFECTS } from '../content/shell3/loomSystem';
import { CHALLENGES } from '../content/shell7/challenges';
import { GRID_MODULES, automationRate, neighbours } from '../content/shell7/gridModules';
import { runMigrations, SAVE_VERSION } from '../save/migrations';
import { sealed } from '../laws';

const fresh = (): { engine: ReturnType<typeof createEngine>; s: GameState } => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};

describe('the Spiral — reset layer 4', () => {
  it('pays on the locked formula, past a high-water mark', () => {
    // Spiral = floor( sqrt(TotalAxioms) * RecursionCount )
    expect(spiralFromLifetime(20, 4)).toBe(Math.floor(Math.sqrt(20) * 4));
    expect(spiralFromLifetime(5, 1)).toBe(2);
    expect(spiralFromLifetime(0, 3)).toBe(0);

    const { s } = fresh();
    s.recursion.axiomsEarned = 20;
    s.recursion.count = 4;
    const first = spiralPending(s);
    expect(first).toBe(17);
    // Having taken it once, the same lifetime figures pay nothing more.
    s.spiral.earned = first;
    expect(spiralPending(s)).toBe(0);
  });

  it('needs a Recursion behind it', () => {
    const { engine, s } = fresh();
    s.recursion.axiomsEarned = 100;
    s.recursion.count = 0;
    expect(engine.dispatch({ type: 'spiral' }).ok).toBe(false);
  });

  /**
   * THE ASSERTION THIS REPLACES WAS THE BUG (A.44). It pinned "40 Spiral must
   * buy fewer than 16 slots" to keep capacity scarce — but never asked whether
   * 40 Spiral was a number anyone could HOLD. Lifetime supply is
   * sqrt(Axioms)·Recursions ≈ 21 across the spec's six Recursions, against a
   * full board that cost 192. The test enforced scarcity on top of famine and
   * read green, which is how sixteen authored modules stayed unreachable.
   *
   * The invariant that matters is REACHABILITY AGAINST THE ACTUAL SUPPLY, at
   * both ends: a full board must fit a lifetime, and must not fit an evening.
   */
  const boardCost = (n: number): number => {
    let spent = 0;
    for (let i = 0; i < n; i++) spent += gridSlotCost(i);
    return spent;
  };
  const slotsFor = (bank: number): number => {
    let spent = 0, slots = 0;
    while (slots < 16 && spent + gridSlotCost(slots) <= bank) { spent += gridSlotCost(slots); slots++; }
    return slots;
  };

  it('a full Grid fits a lifetime Spiral budget, and only just', () => {
    // Six Recursions holding ~13 Axioms — the re-rated ladder's own output.
    const lifetime = spiralFromLifetime(13, 6);
    expect(boardCost(16)).toBeLessThanOrEqual(lifetime);
    // ...but it is still most of the purse: no full board without commitment.
    expect(boardCost(16)).toBeGreaterThan(lifetime * 0.75);
  });

  it('a second Recursion seats a meaningful, partial board', () => {
    const atR2 = spiralFromLifetime(5, 2);
    expect(slotsFor(atR2)).toBeGreaterThanOrEqual(3); // enough to feel like a system
    expect(slotsFor(atR2)).toBeLessThan(16); // and nowhere near done
  });

  it('licences trade against Grid depth for the same purse', () => {
    expect(licenceCost(0)).toBeLessThan(licenceCost(3));
    expect(licenceCost(0)).toBeGreaterThan(0);
  });
});

describe('challenges are real, not decorative', () => {
  it('every challenge is fully authored', () => {
    for (const c of CHALLENGES) {
      expect(c.premise.length).toBeGreaterThan(40);
      expect(c.rule.length).toBeGreaterThan(10);
      expect(c.lesson.length).toBeGreaterThan(40);
      expect(c.goalText.length).toBeGreaterThan(5);
      expect(typeof c.goal).toBe('function');
      // Each unlocks a real Grid module — challenges are the content axis.
      expect(GRID_MODULES.some((m) => m.id === c.reward)).toBe(true);
    }
  });

  it('seals are OFF with no challenge running, and ON while one is', () => {
    const { s } = fresh();
    expect(sealed(s, 'sealKiln')).toBe(false);
    expect(sealed(s, 'sealHand')).toBe(false);
    s.spiral.activeChallenge = { id: 'coldIron', startedAtPlaySec: 0 };
    expect(sealed(s, 'sealKiln')).toBe(true);
    expect(sealed(s, 'sealHand')).toBe(false); // a different challenge's seal
    s.spiral.activeChallenge = { id: 'unattended', startedAtPlaySec: 0 };
    expect(sealed(s, 'sealHand')).toBe(true);
    expect(sealed(s, 'sealKiln')).toBe(false);
  });

  it('THE UNATTENDED actually refuses the hand', () => {
    const { engine, s } = fresh();
    expect(engine.dispatch({ type: 'chip', cell: 0 }).ok).toBe(true);
    s.spiral.activeChallenge = { id: 'unattended', startedAtPlaySec: 0 };
    const blocked = engine.dispatch({ type: 'chip', cell: 1 });
    expect(blocked.ok).toBe(false);
  });

  it('COLD IRON actually keeps the Kiln dark', () => {
    const { engine, s } = fresh();
    s.kiln.built = true;
    s.kiln.feeding = true;
    s.kiln.heat = 0.8;
    s.spiral.activeChallenge = { id: 'coldIron', startedAtPlaySec: 0 };
    engine.tick(1);
    expect(engine.getState().kiln.heat).toBe(0);
    expect(engine.getState().kiln.feeding).toBe(false);
  });
});

describe('the Automation Grid never beats a good idle player (pillar 1)', () => {
  it('caps at 1.0 however the board is filled', () => {
    const full: Record<number, string> = {};
    GRID_MODULES.forEach((m, i) => { full[i] = m.id; });
    expect(automationRate(full)).toBeLessThanOrEqual(1);
    expect(automationRate({})).toBe(0);
  });

  it('adjacency pays only for documented pairs', () => {
    const apart = automationRate({ 0: 'autoBuyFace', 8: 'autoCollapse' });
    const together = automationRate({ 0: 'autoBuyFace', 1: 'autoCollapse' });
    expect(together).toBeGreaterThan(apart);
    expect(neighbours(0)).toContain(1);
    expect(neighbours(0)).not.toContain(8);
  });
});

describe('relics cannot punish bad luck', () => {
  it('affix SHAPE is fixed by context; only magnitude rolls', () => {
    const { s } = fresh();
    const seen = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const r = mintRelic(s, 'warren', seed);
      for (const k of Object.keys(r.affixes)) seen.add(k);
    }
    // Everything a Warren relic can carry comes from the Warren pool.
    const warrenPool = SOURCE_BY_ID.get('warren')!.pool;
    for (const k of seen) expect(warrenPool).toContain(k);
  });

  it('fusion keeps the better of each affix and never destroys value', () => {
    const { s } = fresh();
    s.relics.shards = 999; // A.46: a fusion costs shards now
s.currencies['core'] = D(9999); // A.48: and Cores — the price that escalates
    const a = addRelic(s, mintRelic(s, 'depth', 3));
    const b = addRelic(s, mintRelic(s, 'depth', 9));
    const bestBefore: Record<string, number> = {};
    for (const r of [a, b]) {
      for (const [k, v] of Object.entries(r.affixes)) bestBefore[k] = Math.max(bestBefore[k] ?? 0, v);
    }
    expect(fuseRelics(s, a.uid, b.uid).ok).toBe(true);
    const kept = s.relics.held.find((r) => r.uid === a.uid)!;
    // Nothing either relic carried was lost.
    for (const [k, v] of Object.entries(bestBefore)) expect(kept.affixes[k]).toBeGreaterThanOrEqual(v);
    expect(s.relics.held.some((r) => r.uid === b.uid)).toBe(false);
    expect(kept.rarity).toBeGreaterThanOrEqual(Math.max(a.rarity, b.rarity));
  });

  it('a rising floor means late finds are never worse than early ones', () => {
    const { s } = fresh();
    const early = mintRelic(s, 'depth', 7);
    s.relics.floorBonus = 0.5;
    const late = mintRelic(s, 'depth', 7);
    const sum = (r: typeof early) => Object.values(r.affixes).reduce((a, b) => a + b, 0);
    expect(sum(late)).toBeGreaterThanOrEqual(sum(early));
  });

  it('equips at most six and sums into buckets', () => {
    const { s } = fresh();
    for (let i = 0; i < 8; i++) addRelic(s, mintRelic(s, 'depth', i + 1));
    for (let i = 0; i < 8; i++) {
      const r = s.relics.held[i]!;
      // slots beyond the sixth are refused
      const res = equipRelic(s, r.uid, i);
      if (i >= RELIC_SLOTS) expect(res.ok).toBe(false);
    }
    expect(s.relics.equipped.length).toBeLessThanOrEqual(RELIC_SLOTS);
    expect(relicBonus(s, 'dustYield')).toBeGreaterThanOrEqual(0);
  });
});

describe('the Museum and the expeditions', () => {
  it('a completed case pays a permanent bucket bonus', () => {
    const { engine, s } = fresh();
    const c = CASES[0]!;
    // A.49: a hall fills from what you HOLD; the 1Hz beat notices.
    for (let i = 0; i < c.need; i++) addRelic(s, mintRelic(s, 'depth', i + 1));
    engine.tick(2);
    expect(caseComplete(s, c.id)).toBe(true);
    expect(s.museum.completed).toContain(c.id);
    expect(museumBonus(s, c.bucket)).toBeGreaterThan(0);
    // Collection lifts luck.
    expect(s.relics.floorBonus).toBeGreaterThan(0);
  });

  it('expeditions resolve on the game clock and WAIT FOREVER', () => {
    const { s } = fresh();
    const route = ROUTE_BY_ID.get('nightHaul')!;
    s.expeditions.active.push({
      crewId: 'pell', routeId: route.id, startedMs: 0, durationMs: route.minutes * 60_000,
    });
    // Not yet.
    s.guild.clockMs = route.minutes * 60_000 - 1;
    expect(tickExpeditions(s)).toBe(0);
    // Landed.
    s.guild.clockMs = route.minutes * 60_000;
    expect(tickExpeditions(s)).toBe(1);
    expect(s.expeditions.ready).toHaveLength(1);
    // An absurd gap later it is STILL there, unclaimed and unexpired.
    s.guild.clockMs += 1000 * 60 * 60 * 24 * 365;
    tickExpeditions(s);
    expect(s.expeditions.ready).toHaveLength(1);
  });
});

describe('save v12', () => {
  it('migrates a v11 save by adding the four long-tail slices', () => {
    const payload = { version: 11, savedAtMs: 0, state: { seenSystems: ['dig'] } } as never;
    const out = runMigrations(payload);
    expect(out.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(46); // modifiers discovered by forging
    const st = out.state as Record<string, unknown>;
    // The casting slices arrive on a save that predates them by twenty-seven
    // versions, which is the whole point of the chain. A returning player's
    // tool arrives FRESH — they are not billed for swings taken before the
    // pool existed, nor credited for cells mined before levels did.
    const casting = st['casting'] as {
      rack: unknown[]; wear: number; repairs: number; xp: number;
      crucible: { queue: unknown[] };
    };
    expect(casting).toBeDefined();
    expect(casting.rack).toHaveLength(0);
    expect(casting.wear).toBe(0);
    expect(casting.repairs).toBe(0);
    expect(casting.xp).toBe(0);
    expect(casting.crucible.queue).toEqual([]);
    expect(st['spiral']).toBeDefined();
    expect(st['relics']).toBeDefined();
    expect(st['museum']).toBeDefined();
    expect(st['expeditions']).toBeDefined();
    // A returning player has done none of it.
    expect((st['spiral'] as { count: number }).count).toBe(0);
    expect((st['relics'] as { held: unknown[] }).held).toHaveLength(0);
    // A.49: the standing order arrives OFF, so a load can never eat a find.
    expect((st['relics'] as { autoScrap: { on: boolean } }).autoScrap.on).toBe(false);
    // ...and the donation bookkeeping is gone with the verb.
    expect((st['museum'] as Record<string, unknown>)['donated']).toBeUndefined();
    expect((st['museum'] as Record<string, unknown>)['pieces']).toBeUndefined();
  });

  it('migrates a v12 save by adding the confluence ledger', () => {
    const payload = { version: 12, savedAtMs: 0, state: { seenSystems: ['dig'] } } as never;
    const out = runMigrations(payload);
    expect(out.version).toBe(SAVE_VERSION);
    const st = out.state as Record<string, unknown>;
    // Found-nothing is correct: the confluences were always true, nobody had
    // written them down. They re-discover the moment their conditions hold.
    expect((st['confluences'] as { found: string[] }).found).toEqual([]);
  });
});

describe('crew traits change the expedition, not just the card', () => {
  const testCtx = { emit: () => {}, dirty: () => {} };
  const hire = (s: GameState, id: string, xp = 0) => {
    s.guild.hirelings[id] = { level: 0, xp, status: 'well', hiredAtMs: 0 };
  };

  it('every hireling has an authored road trait', () => {
    for (const def of HIRELING_DEFS) {
      expect(def.expedition, `hireling '${def.npcId}' has no expedition trait`).toBeDefined();
      expect(def.expedition!.trait.length).toBeGreaterThan(3);
      expect(def.expedition!.note.length).toBeGreaterThan(20);
    }
  });

  it('a fast crew is genuinely quicker than a careful one on the same route', () => {
    const { s } = fresh();
    hire(s, 'jib');   // Runs the road — speedMult 0.7
    hire(s, 'ruta');  // Loses nothing — speedMult 1.15
    const route = ROUTE_BY_ID.get('oldSeam')!;
    const fast = routeDurationMs(s, 'jib', route);
    const careful = routeDurationMs(s, 'ruta', route);
    expect(fast).toBeLessThan(careful);
    // And both are anchored to the route's own length, not invented.
    expect(fast).toBeCloseTo(route.minutes * 60_000 * 0.7, -3);
  });

  it('the haul trait actually reaches the payout', () => {
    const { s } = fresh();
    // Somewhere to come back from — expeditions draw on shells you have left.
    s.depthRecords['loam'] = 50;
    s.shell.current = 'ferrite';
    hire(s, 'pell'); // Carries impossible loads — haulMult 1.5

    const route = ROUTE_BY_ID.get('backStair')!;
    s.expeditions.ready.push({ crewId: 'pell', routeId: route.id, seed: 4242 });
    const big = claimExpedition(s, testCtx, 'pell');

    const s2 = createEngine({ nowMs: 0 }).getState() as GameState;
    s2.depthRecords['loam'] = 50;
    s2.shell.current = 'ferrite';
    hire(s2, 'brakka'); // no haul trait
    s2.expeditions.ready.push({ crewId: 'brakka', routeId: route.id, seed: 4242 });
    const plain = claimExpedition(s2, testCtx, 'brakka');

    const haulOf = (r: typeof big) => (r.data as { haul: number } | undefined)?.haul ?? 0;
    expect(haulOf(big)).toBeGreaterThan(haulOf(plain));
  });

  it('experience deepens the trait it already had', () => {
    const { s } = fresh();
    hire(s, 'pell', 0);
    const green = crewEffect(s, 'pell')!;
    s.guild.hirelings['pell']!.xp = 120 * 100; // level 10
    const veteran = crewEffect(s, 'pell')!;
    expect(veteran.haulMult).toBeGreaterThan(green.haulMult);
    expect(veteran.trait).toBe(green.trait); // same person, not a new talent
  });
});

describe('bonus definitions point at REAL modifier buckets', () => {
  // Museum cases shipped with `dropChance` and `cellCap`, which are not buckets
  // the modifier layer knows. They registered into nothing and paid nothing —
  // silent, because registerModifier happily accepts any string. This asserts
  // every bucket a bonus names is one the game actually reads.
  const REAL: string[] = [
    'dustYield', 'brickYield', 'regen', 'cap', 'kilnRate', 'kilnHeatRamp',
    'drillSpeed', 'drillPower', 'xpGain', 'descendCost', 'motifGain', 'dropRate',
    'assaySpeed', 'chainPower', 'strikePower', 'scripGain', 'offlineEffAdd',
  ];

  it('every relic affix targets a real bucket', () => {
    for (const [key, def] of Object.entries(AFFIXES)) {
      expect(REAL, `relic affix '${key}' targets unknown bucket '${def.bucket}'`).toContain(def.bucket);
    }
  });

  it('every museum case targets a real bucket', () => {
    for (const c of CASES) {
      expect(REAL, `museum case '${c.id}' targets unknown bucket '${c.bucket}'`).toContain(c.bucket);
    }
  });

  it('every relic source pool names affixes that exist', () => {
    for (const src of SOURCES) {
      for (const key of src.pool) {
        expect(Object.keys(AFFIXES), `source '${src.id}' lists unknown affix '${key}'`).toContain(key);
      }
    }
  });

  // A case that asks for twelve gems when the game contains six is not a hard
  // case, it is an impossible one, and nothing in the type system says so.
  // Found while authoring the Phase 14 cases; this is the guard.
  it('every museum case can actually be completed against the real pools', () => {
    const CEILING: Record<MuseumCaseDef['from'], number> = {
      gem: GEMS.length,
      bestiary: SPECIES.length,
      // Chords + alloys + brews + strains + weave shapes (+ lenses, uncounted).
      codex: CHORD_DEFS.length + ALLOY_DEFS.length + BREWS.length + BASE_STRAINS.length + Object.keys(SHAPE_EFFECTS).length,
      // Relics drop indefinitely, so there is no finite ceiling to check.
      relic: Number.POSITIVE_INFINITY,
    };
    for (const c of CASES) {
      expect(
        c.need,
        `case '${c.id}' needs ${c.need} from '${c.from}' but only ${CEILING[c.from]} exist`,
      ).toBeLessThanOrEqual(CEILING[c.from]);
    }
  });

  // The fusion chooser shows the player what a fusion WOULD do before it eats
  // a relic. If the preview and the real thing ever disagree, the chooser is
  // lying — so replay one against the other rather than testing them apart.
  it('fusionPreview matches what fuseRelics actually does', () => {
    const eng = createEngine();
    const s = eng.getState() as GameState;
    const a = addRelic(s, { uid: 0, defId: 'test', rarity: 1, source: 'shaft', affixes: { dustYield: 0.10, regen: 0.05 }, fusedFrom: 0 });
    const b = addRelic(s, { uid: 0, defId: 'test', rarity: 3, source: 'warren', affixes: { dustYield: 0.25, xpGain: 0.12 }, fusedFrom: 0 });

    // Rising to rarity 3 is museum-gated (B4); this test is about PREVIEW
    // PARITY, so satisfy the gate — the gate itself is pinned in
    // pull-through.test.ts. Note the preview mirrors it: gatedBy appears
    // exactly while the cases are short.
    expect(fusionPreview(s, a.uid, b.uid)!.gatedBy).toBeDefined();
    s.museum.completed = ['c1', 'c2', 'c3'];

    const pv = fusionPreview(s, a.uid, b.uid)!;
    expect(pv.gained.map((g) => g.key)).toEqual(['xpGain']);       // a lacks it
    expect(pv.improved.map((i) => i.key)).toEqual(['dustYield']);  // b is stronger
    expect(pv.wasted).toEqual([]);                                 // b has no weaker line
    expect(pv.rarityUp).toBe(true);                                // 3 > 1
    expect(pv.gatedBy).toBeUndefined();                            // the cases opened it

    const before = { ...a.affixes };
    s.relics.shards = 999; // A.46: a fusion costs shards now
s.currencies['core'] = D(9999); // A.48: and Cores — the price that escalates
    expect(fuseRelics(s, a.uid, b.uid).ok).toBe(true);
    const after = s.relics.held.find((r) => r.uid === a.uid)!;

    for (const g of pv.gained) expect(after.affixes[g.key]).toBe(g.value);
    for (const i of pv.improved) {
      expect(before[i.key]).toBe(i.from);
      expect(after.affixes[i.key]).toBe(i.to);
    }
    expect(after.rarity).toBe(3);
  });

  it('fusionPreview reports a fusion that would add nothing', () => {
    const eng = createEngine();
    const s = eng.getState() as GameState;
    const strong = addRelic(s, { uid: 0, defId: 'test', rarity: 4, source: 'shaft', affixes: { dustYield: 0.30 }, fusedFrom: 0 });
    const weak = addRelic(s, { uid: 0, defId: 'test', rarity: 1, source: 'shaft', affixes: { dustYield: 0.05 }, fusedFrom: 0 });
    const pv = fusionPreview(s, strong.uid, weak.uid)!;
    expect(pv.gained).toEqual([]);
    expect(pv.improved).toEqual([]);
    expect(pv.wasted.map((w) => w.key)).toEqual(['dustYield']);
    expect(pv.rarityUp).toBe(false);
  });

  // descendCost is a REDUCTION bucket: the modifier layer multiplies cost by
  // it, so a positive museum/relic bonus would make descending more expensive.
  it('no case pays a positive bonus into a reduction bucket', () => {
    for (const c of CASES) {
      if (c.bucket === 'descendCost') {
        expect.fail(`case '${c.id}' pays +${c.bonus} into descendCost, which would raise the cost it claims to lower`);
      }
    }
  });
});

describe('the second trait (Phase 15)', () => {
  const hire = (s: GameState, id: string, xp: number) => {
    s.guild.hirelings[id] = { level: 0, xp, status: 'well', hiredAtMs: 0 };
  };

  it('every hand has one authored, distinct from their first', () => {
    for (const def of HIRELING_DEFS) {
      expect(def.expedition2, `hireling '${def.npcId}' has no second trait`).toBeDefined();
      expect(def.expedition2!.trait).not.toBe(def.expedition!.trait);
      expect(def.expedition2!.note.length).toBeGreaterThan(20);
    }
  });

  it('shows up at level 5 and not before', () => {
    const { s } = fresh();
    // Level is floor(sqrt(xp / 120)); level 4 vs level 5.
    hire(s, 'pell', 120 * 16);
    expect(hirelingLevel(s.guild.hirelings['pell']!.xp)).toBe(4);
    expect(crewEffect(s, 'pell')!.second).toBeUndefined();

    s.guild.hirelings['pell']!.xp = 120 * 25;
    expect(hirelingLevel(s.guild.hirelings['pell']!.xp)).toBe(5);
    expect(crewEffect(s, 'pell')!.second).toBeDefined();
  });

  it('compounds with the first rather than replacing it', () => {
    const { s } = fresh();
    hire(s, 'pell', 120 * 16); // level 4, one trait
    const green = crewEffect(s, 'pell')!;
    s.guild.hirelings['pell']!.xp = 120 * 25; // level 5, both
    const veteran = crewEffect(s, 'pell')!;
    expect(veteran.trait).toBe(green.trait);          // same person
    expect(veteran.haulMult).toBeGreaterThan(green.haulMult);
  });
});
