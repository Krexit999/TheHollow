/**
 * THE LAPIDARY — CUTTING (§13), and the hole in the socket row it exists to
 * explain.
 *
 * §0 is the finding this system was built on: a gem in a socket has ALWAYS
 * killed the rune pair it sits between, silently, with no message anywhere.
 * That is §13's "blocks binding at scale" sitting in the code unexplained, and
 * it is the reason a cut is a SHAPE rather than a quality number.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import { ensureContentLoaded } from '../content';
import { D } from '../decimal';
import { markReached } from '../systems/roll';
import { MAX_MACHINE_TIER, ensurePlant, tierOf } from '../systems/plant';
import { ensureCondition } from '../systems/condition';
import { convCurrencyId } from '../shells';
import {
  CUTS, CUT_SHAPES, TIER_CAPABILITY_LAPIDARY, buildLapidary, cutBlocker, cutCost, cutGem,
  cutOf, cuttable, lapidaryBuilt, lapidaryFound, lapidaryStation, shapesAvailable,
} from '../systems/lapidary';
import {
  dissonancesIn, quarrelsAllowed, rowReading, runeSequence, setSocket, socketGemBonus,
  socketRunePairs, socketRuneTriples,
} from '../systems/toolSockets';
import { RUNE_PAIRS, DISSONANT } from '../content/shell4/runes';
import { dpsMax } from '../systems/face';
import { ModifierCache } from '../modifiers';
import { PART_TYPES } from '../content/forgeParts';
import { makePart } from '../systems/forgeParts';
import { allShells } from '../shells';
import { socketCount } from '../systems/toolSockets';
import { currentTool } from '../systems/casting';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx = (): EngineCtx => ({ dirty: () => {}, emit: () => {} }) as unknown as EngineCtx;

function fresh(): GameState {
  return createEngine({ nowMs: 0 }).getState() as GameState;
}

/** A Glassmere save standing in front of a working wheel, with stones. */
function atTheWheel(tier = 1): GameState {
  const s = fresh();
  s.shell.current = 'glassmere';
  s.depthRecords['glassmere'] = 400;
  const at = lapidaryStation()!;
  markReached(s, at.depth, 15);
  ensurePlant(s).tiers['lapidary'] = tier;
  ensureCondition(s);
  s.currencies[convCurrencyId(s)] = D(100000);
  s.materials.gems['bloodgarnet'] = 8;
  s.materials.gems['hearthstone'] = 8;
  return s;
}

/**
 * A tool with a DEEP Sockets stone, so the row is long enough to have a middle.
 * `socketRow` clamps to `socketCount`, which reads the Sockets PART — writing
 * five raw slots onto the starter tool gets you a row of nothing at all.
 */
function withRow(s: GameState): void {
  s.forge.built = true;
  for (const shell of allShells()) s.depthRecords[shell.id] = 400;
  s.casting.tool = PART_TYPES.map((t, i) => ({
    ...makePart(t, t === 'sockets' ? 'voidstar' : 'marl', 60), id: i + 1,
  })) as never;
  s.casting.wear = 0;
  s.casting.sockets = [];
  expect(socketCount(currentTool(s))).toBe(5);
}

describe('§0 — THE FINDING: an uncut gem eats the pair it sits between', () => {
  it('kel-thur speaks; kel-GEM-thur says nothing at all', () => {
    const s = atTheWheel();
    withRow(s);
    // Prove the pair exists before anything is in the way.
    expect(RUNE_PAIRS['kel|thur']).toBeDefined();
    const row = s.casting.sockets as never as Array<unknown>;
    row[0] = { kind: 'rune', id: 'kel' };
    row[1] = { kind: 'rune', id: 'thur' };
    expect(socketRunePairs(s)).toContain('kel|thur');

    // Now push an UNCUT stone between them.
    row[1] = { kind: 'gem', id: 'bloodgarnet' };
    row[2] = { kind: 'rune', id: 'thur' };
    expect(cutOf(s, 'bloodgarnet')).toBeNull();
    expect(socketRunePairs(s), 'the uncut stone is a wall').not.toContain('kel|thur');
  });

  it('and that is what a TABLE cut undoes', () => {
    const s = atTheWheel();
    withRow(s);
    const row = s.casting.sockets as never as Array<unknown>;
    row[0] = { kind: 'rune', id: 'kel' };
    row[1] = { kind: 'gem', id: 'bloodgarnet' };
    row[2] = { kind: 'rune', id: 'thur' };
    expect(socketRunePairs(s)).not.toContain('kel|thur');
    expect(cutGem(s, ctx(), 'bloodgarnet', 'table').ok).toBe(true);
    expect(socketRunePairs(s), 'the row reads through it').toContain('kel|thur');
  });

  it('the per-slot sequence stays index-stable — the writers depend on it', () => {
    // `rowReading` compacts and `runeSequence` must not, or every slot write in
    // the game lands one to the left of where the player pointed.
    const s = atTheWheel();
    withRow(s);
    const row = s.casting.sockets as never as Array<unknown>;
    row[0] = { kind: 'rune', id: 'kel' };
    row[1] = { kind: 'gem', id: 'bloodgarnet' };
    row[2] = { kind: 'rune', id: 'thur' };
    cutGem(s, ctx(), 'bloodgarnet', 'table');
    expect(runeSequence(s)).toHaveLength(5);
    expect(runeSequence(s)[2]).toBe('thur');
    expect(rowReading(s).filter(Boolean)).toEqual(['kel', 'thur']);
  });
});

describe('§1 — the wreck was already there', () => {
  it('THE LENSWORK is an authored Glassmere station, and the machine claims it', () => {
    const at = lapidaryStation()!;
    expect(at.shellId).toBe('glassmere');
    expect(at.name).toBe('The Lenswork');
    expect(at.depth).toBe(62);
  });

  it('found by walking into it, built out of cast parts, never bought', () => {
    const s = fresh();
    s.shell.current = 'glassmere';
    expect(lapidaryFound(s)).toBe(false);
    expect(buildLapidary(s, ctx()).ok).toBe(false);
    const at = lapidaryStation()!;
    markReached(s, at.depth, 15);
    expect(lapidaryFound(s)).toBe(true);
    // Found is not built: it wants parts on the rack.
    expect(lapidaryBuilt(s)).toBe(false);
    expect(buildLapidary(s, ctx()).ok).toBe(false);
    s.casting.rack = [
      { id: 1, type: 'head', materialId: 'marl', purity: 40 },
      { id: 2, type: 'core', materialId: 'marl', purity: 40 },
      { id: 3, type: 'binding', materialId: 'marl', purity: 40 },
      { id: 4, type: 'grip', materialId: 'marl', purity: 40 },
      { id: 5, type: 'head', materialId: 'marl', purity: 40 },
      { id: 6, type: 'core', materialId: 'marl', purity: 40 },
    ] as never;
    const r = buildLapidary(s, ctx());
    expect(r.ok).toBe(true);
    expect(tierOf(s, 'lapidary')).toBe(1);
    expect(s.plant!.builtOf!['lapidary']).toBeDefined();
  });
});

describe('§2 — tiers are three different sentences, never a bigger number', () => {
  it('each tier opens ONE more shape, and none of them is a multiplier', () => {
    const s = atTheWheel(1);
    expect(shapesAvailable(s).map((c) => c.id)).toEqual(['table']);
    ensurePlant(s).tiers['lapidary'] = 2;
    expect(shapesAvailable(s).map((c) => c.id)).toEqual(['table', 'star']);
    ensurePlant(s).tiers['lapidary'] = 3;
    expect(shapesAvailable(s).map((c) => c.id)).toEqual(['table', 'star', 'water']);
    // Three shapes, three tiers, three distinct sentences.
    expect(new Set(CUTS.map((c) => c.does)).size).toBe(3);
    expect(CUT_SHAPES).toHaveLength(3);
    expect(TIER_CAPABILITY_LAPIDARY).toHaveLength(MAX_MACHINE_TIER + 1);
  });

  it('a tier-I wheel refuses a star, by name', () => {
    const s = atTheWheel(1);
    const b = cutBlocker(s, 'bloodgarnet', 'star');
    expect(b).toMatch(/deeper wheel/);
    expect(cutGem(s, ctx(), 'bloodgarnet', 'star').ok).toBe(false);
  });
});

describe('§3 — the cut', () => {
  let s: GameState;
  beforeEach(() => { s = atTheWheel(3); });

  it('grinds one away and keeps the rest — you must be able to seat one after', () => {
    s.materials.gems['bloodgarnet'] = 1;
    expect(cutBlocker(s, 'bloodgarnet', 'table')).toMatch(/one to grind away and one to keep/);
    s.materials.gems['bloodgarnet'] = 2;
    const c = cutCost(s, 'bloodgarnet');
    const conv = s.currencies[convCurrencyId(s)]!.toNumber();
    expect(cutGem(s, ctx(), 'bloodgarnet', 'table').ok).toBe(true);
    expect(s.materials.gems['bloodgarnet']).toBe(1);
    expect(s.currencies[convCurrencyId(s)]!.toNumber()).toBe(conv - c.conv);
  });

  it('is CHOSEN, never rolled — the same cut twice is refused rather than re-rolled', () => {
    expect(cutGem(s, ctx(), 'bloodgarnet', 'table').ok).toBe(true);
    expect(cutBlocker(s, 'bloodgarnet', 'table')).toMatch(/already ground/);
    // ...but re-shaping is allowed, and it costs again.
    expect(cutGem(s, ctx(), 'bloodgarnet', 'star').ok).toBe(true);
    expect(cutOf(s, 'bloodgarnet')).toBe('star');
  });

  it('a seized wheel will not turn', () => {
    ensureCondition(s)['lapidary'] = { id: 'seized', level: 5, seized: true } as never;
    expect(cutBlocker(s, 'bloodgarnet', 'table')).toMatch(/seized/);
  });

  it('cuttable lists what you HOLD, never the registry', () => {
    delete s.materials.gems['hearthstone'];
    expect(cuttable(s).map((g) => g.gemId)).toEqual(['bloodgarnet']);
  });
});

describe('§4 — a STAR is aimed by its neighbours: elsewhere, not more', () => {
  it('the stone pays into the pair reading through it', () => {
    const s = atTheWheel(2);
    withRow(s);
    const row = s.casting.sockets as never as Array<unknown>;
    // Bloodgarnet's own bucket is dustYield. `kel|thur` is drillPower.
    const own = 'dustYield';
    const pair = RUNE_PAIRS['kel|thur']!.bucket;
    expect(pair).not.toBe(own);
    row[0] = { kind: 'rune', id: 'kel' };
    row[1] = { kind: 'gem', id: 'bloodgarnet' };
    row[2] = { kind: 'rune', id: 'thur' };

    cutGem(s, ctx(), 'bloodgarnet', 'table');
    const tableOwn = socketGemBonus(s, own);
    expect(tableOwn).toBeGreaterThan(0);
    expect(socketGemBonus(s, pair)).toBe(0);

    cutGem(s, ctx(), 'bloodgarnet', 'star');
    expect(socketGemBonus(s, own), 'it left its own bucket').toBe(0);
    expect(socketGemBonus(s, pair), 'and arrived in the pair\'s').toBeCloseTo(tableOwn, 10);
  });

  it('a star with nothing reading through it keeps its own bucket', () => {
    const s = atTheWheel(2);
    withRow(s);
    const row = s.casting.sockets as never as Array<unknown>;
    row[0] = { kind: 'gem', id: 'bloodgarnet' };
    cutGem(s, ctx(), 'bloodgarnet', 'star');
    expect(socketGemBonus(s, 'dustYield')).toBeGreaterThan(0);
  });
});

describe('§5 — a WATER cut spends itself holding a quarrel apart', () => {
  it('pays nothing of its own', () => {
    const s = atTheWheel(3);
    withRow(s);
    const row = s.casting.sockets as never as Array<unknown>;
    row[0] = { kind: 'gem', id: 'bloodgarnet' };
    cutGem(s, ctx(), 'bloodgarnet', 'table');
    expect(socketGemBonus(s, 'dustYield')).toBeGreaterThan(0);
    cutGem(s, ctx(), 'bloodgarnet', 'water');
    expect(socketGemBonus(s, 'dustYield')).toBe(0);
  });

  it('and buys the row exactly ONE quarrel — a second still refuses', () => {
    const s = atTheWheel(3);
    withRow(s);
    const bad = [...DISSONANT][0]!;
    const [a, b] = bad.split('|') as [string, string];
    s.runes.found[a] = 4;
    s.runes.found[b] = 4;
    const row = s.casting.sockets as never as Array<unknown>;
    row[0] = { kind: 'gem', id: 'bloodgarnet' };
    expect(quarrelsAllowed(s, row as never)).toBe(0);
    cutGem(s, ctx(), 'bloodgarnet', 'water');
    expect(quarrelsAllowed(s, row as never)).toBe(1);
    // The reading of a row holding that pair has exactly one quarrel in it.
    expect(dissonancesIn([a, b] as never)).toEqual([bad]);
    expect(dissonancesIn([a, b, a, b] as never)).toHaveLength(3);
  });

  it('the socket verb refuses a dissonance the row cannot hold, and allows one it can', () => {
    const s = atTheWheel(3);
    withRow(s);
    const bad = [...DISSONANT].find((p) => { const [x, y] = p.split('|'); return x !== y; })!;
    const [a, b] = bad.split('|') as [string, string];
    s.runes.found[a] = 4;
    s.runes.found[b] = 4;
    expect(setSocket(s, ctx(), 0, { kind: 'rune', id: a as never }).ok).toBe(true);
    expect(setSocket(s, ctx(), 1, { kind: 'rune', id: b as never }).ok).toBe(false);

    // Now hold them apart with a Water stone and the row takes it.
    cutGem(s, ctx(), 'bloodgarnet', 'water');
    expect(setSocket(s, ctx(), 1, { kind: 'gem', id: 'bloodgarnet' }).ok).toBe(true);
    const withWater = setSocket(s, ctx(), 2, { kind: 'rune', id: b as never });
    expect(withWater.ok, withWater.ok ? '' : (withWater as { reason: string }).reason).toBe(true);
    expect(dissonancesIn(rowReading(s))).toEqual([bad]);
  });
});

/**
 * §13 pairs the LAPIDARY with the RUNE BENCH and gives it "INSCRIPTION: etch
 * sequences where adjacency matters · the cheapest binding". Unlike cutting,
 * that system did not die with the Workbench — it is `content/shell4/runes.ts`,
 * it has a live dispatch, a panel in `glassmere.tsx`, and the socket row reads
 * the SAME grammar rather than a copy of it.
 *
 * So no Rune Bench was built this pass, and these are the measurement that says
 * why — kept so the claim cannot quietly stop being true.
 */
describe('§7 — THE RUNE BENCH: measured, not built', () => {
  it('INSCRIPTION is a live verb with a real dispatch, not a function nobody calls', () => {
    const engine = createEngine({ nowMs: 0 });
    const s = engine.getState() as GameState;
    s.runes.found['kel'] = 2;
    s.runes.found['thur'] = 2;
    const r = engine.dispatch({ type: 'inscribe', target: 'tool', sequence: ['kel', 'thur', null] });
    expect(r.ok).toBe(true);
    expect(s.runes.inscriptions['tool']!.slice(0, 2)).toEqual(['kel', 'thur']);
    expect(s.runes.pairsSeen).toContain('kel|thur');
  });

  it('ADJACENCY MATTERS: Kel-Thur is not Thur-Kel', () => {
    const a = RUNE_PAIRS['kel|thur']!;
    const b = RUNE_PAIRS['thur|kel']!;
    expect(a.bucket).not.toBe(b.bucket);
    expect(a.name).not.toBe(b.name);
  });

  it('and the socket row reads the same alphabet, not a second one', () => {
    const s = atTheWheel(1);
    withRow(s);
    const row = s.casting.sockets as never as Array<unknown>;
    row[0] = { kind: 'rune', id: 'kel' };
    row[1] = { kind: 'rune', id: 'thur' };
    // The key the inscription records is the key the row produces.
    expect(socketRunePairs(s)).toContain('kel|thur');
    expect(RUNE_PAIRS['kel|thur']).toBeDefined();
  });
});

describe('§6 — pillar 2 and the row it did not break', () => {
  /**
   * WRITTEN AS "dpsMax IS IDENTICAL" AND THE ENGINE REFUSED IT, correctly.
   * Bloodgarnet's bucket is `dustYield`, which is a TERM IN the ceiling — a
   * socketed gem has moved dpsMax since Phase 12 and `toolSockets.ts` says so
   * in its own header. The claim that is actually pillar 2's is narrower and
   * stronger: a CUT can only MOVE a contribution or SILENCE it. It can never
   * add a second one, so no shape may read above the uncut stone.
   */
  it('a cut can only move or silence — no shape reads above the uncut stone', () => {
    const s = atTheWheel(3);
    withRow(s);
    const mods = new ModifierCache();
    const row = s.casting.sockets as never as Array<unknown>;
    row[0] = { kind: 'gem', id: 'bloodgarnet' };
    row[1] = { kind: 'gem', id: 'hearthstone' };
    mods.invalidate();
    const uncut = dpsMax(s, mods).toNumber();

    cutGem(s, ctx(), 'bloodgarnet', 'table');
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber(), 'a table cut keeps its own bucket, unchanged').toBe(uncut);

    for (const shape of CUT_SHAPES) {
      cutGem(s, ctx(), 'bloodgarnet', shape);
      mods.invalidate();
      expect(dpsMax(s, mods).toNumber(), `a ${shape} cut read ABOVE the uncut stone`)
        .toBeLessThanOrEqual(uncut);
    }
    // And the water cut, which gives its effect up entirely, reads strictly under.
    cutGem(s, ctx(), 'bloodgarnet', 'water');
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).toBeLessThan(uncut);
  });

  it('a cut stone still cannot make a TRIPLE out of two runes', () => {
    // Three-in-a-row is three RUNES. A transparent stone makes two runes
    // adjacent; it does not become one.
    const s = atTheWheel(1);
    withRow(s);
    const row = s.casting.sockets as never as Array<unknown>;
    row[0] = { kind: 'rune', id: 'kel' };
    row[1] = { kind: 'gem', id: 'bloodgarnet' };
    row[2] = { kind: 'rune', id: 'thur' };
    cutGem(s, ctx(), 'bloodgarnet', 'table');
    expect(socketRuneTriples(s)).toHaveLength(0);
  });
});
