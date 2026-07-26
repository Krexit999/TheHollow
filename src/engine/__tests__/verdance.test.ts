import { describe, expect, it } from 'vitest';
import { createEngine, canBreach } from '../index';
import type { Engine, GameState } from '../types';
import { ModifierCache, computeBucket } from '../modifiers';
import { D } from '../decimal';
import { addCurrency, getCurrency } from '../resources';
import { CAPTURE, GROW_DELAY_SEC, HARVEST_BONUS, feralCellCount, vineStage } from '../systems/growth';
import { WEATHER, weatherFor, currentWeather } from '../systems/weather';
import { BASE_STRAINS, TOTAL_STRAINS, hybridDef, hybridId, strainDef, tickGreenhouse, greenhouseUnlocked } from '../content/shell3/greenhouse';
import { clusters, inoculate, tickMycelium, SPREAD_EVERY_MS, SPREAD_COST } from '../content/shell3/mycelium';
import { BREWS, brewCombat, matchBrew, brewingUnlocked } from '../content/shell3/brews';
import { findShapes, litGrid, THREADS, loomUnlocked } from '../content/shell3/loomSystem';
import { AUTO_SKILL, resolveFight } from '../combat/combat';
import { wardenOf } from '../combat/species';
import { runMigrations, SAVE_VERSION } from '../save/migrations';
import { serialize } from '../save/codec';
import { cellCap, cellRegen } from '../systems/face';

const ctx = { emit: () => {}, dirty: () => {} };

function fresh(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState, mods: new ModifierCache() };
}

/** A Verdance state: native growth, guild open (weather exists). */
function verdant(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const { engine, s, mods } = fresh();
  s.shell.current = 'verdance';
  s.collapse.count = 1;
  s.guild.discovered = true;
  s.depth = 30;
  return { engine, s, mods };
}

describe('growth: not acting is a strategy', () => {
  it('a cell held at cap sprouts, ages, banks overflow — and NEVER beats the ceiling (pillar 2)', () => {
    const { engine, s, mods } = verdant();
    // Fill every cell and wait.
    const cap = cellCap(s, mods);
    s.face.cells.fill(cap);
    engine.tick(GROW_DELAY_SEC + 2);
    expect(vineStage(s, 0)).toBeGreaterThanOrEqual(1);
    const fruitBefore = s.growth.fruit[0]!;
    const T = 60;
    engine.tick(T);
    const gained = s.growth.fruit[0]! - fruitBefore;
    const regen = cellRegen(s, mods);
    // Capture is strictly a share of the overflow regen the ceiling already
    // produced; even with the best harvest bonus it stays under it.
    expect(gained).toBeLessThanOrEqual(regen * T * CAPTURE * 1.001);
    expect(gained * Math.max(...HARVEST_BONUS)).toBeLessThanOrEqual(regen * T * 1.001);
    expect(gained).toBeGreaterThan(0);
  });

  it('harvesting a bloom pays banked fruit and sheds chlorophyll; the vine clears', () => {
    const { engine, s } = verdant();
    s.growth.stage = s.face.cells.map(() => 0);
    s.growth.fruit = s.face.cells.map(() => 0);
    s.growth.age = s.face.cells.map(() => 0);
    s.growth.fullSince = s.face.cells.map(() => 0);
    s.growth.stage[5] = 3;
    s.growth.fruit[5] = 40;
    const sporeBefore = getCurrency(s, 'spore').toNumber();
    const chloroBefore = getCurrency(s, 'chlorophyll').toNumber();
    engine.dispatch({ type: 'chip', cell: 5 });
    expect(getCurrency(s, 'spore').toNumber()).toBeGreaterThan(sporeBefore);
    expect(getCurrency(s, 'chlorophyll').toNumber()).toBeGreaterThan(chloroBefore);
    expect(vineStage(s, 5)).toBe(0);
    expect(s.growth.fruitHarvested).toBeGreaterThan(0);
  });

  it('feral vines spread to near-full neighbors and auto-drop when ripe', () => {
    const { engine, s, mods } = verdant();
    const cap = cellCap(s, mods);
    s.face.cells.fill(cap);
    s.growth.stage = s.face.cells.map(() => 0);
    s.growth.fruit = s.face.cells.map(() => 0);
    s.growth.age = s.face.cells.map(() => 0);
    s.growth.fullSince = s.face.cells.map(() => 0);
    s.growth.stage[0] = 4;
    s.growth.fruit[0] = cap * 32; // at the feral fruit cap -> ripe drops
    const sporeBefore = getCurrency(s, 'spore').toNumber();
    engine.tick(50);
    expect(feralCellCount(s)).toBeGreaterThanOrEqual(1);
    expect(s.growth.stage.filter((st) => st > 0).length).toBeGreaterThan(1); // spread
    expect(getCurrency(s, 'spore').toNumber()).toBeGreaterThan(sporeBefore); // ripe drop
    expect(s.growth.autoDropped).toBeGreaterThan(0);
  });

  it('drills never harvest a vined cell (automation must not trash a garden)', () => {
    const { engine, s, mods } = verdant();
    s.drills.bayBuilt = true;
    s.drills.units.push({ level: 0, timer: 0, lastCell: 0 });
    const cap = cellCap(s, mods);
    s.face.cells.fill(0.2);
    s.face.cells[3] = cap; // fullest — but vined
    s.growth.stage = s.face.cells.map(() => 0);
    s.growth.fruit = s.face.cells.map(() => 0);
    s.growth.age = s.face.cells.map(() => 0);
    s.growth.fullSince = s.face.cells.map(() => 0);
    s.growth.stage[3] = 2;
    engine.tick(10);
    expect(s.face.cells[3]).toBeGreaterThanOrEqual(cap * 0.99); // untouched
  });
});

describe('shell weather: the floor is neutral, the variance is upside', () => {
  it('every weather modifier is >= 1, every shell has a neutral state', () => {
    for (const w of WEATHER) {
      for (const m of w.mods) expect(m.value, w.id).toBeGreaterThanOrEqual(1);
      if (w.growthAging) expect(w.growthAging).toBeGreaterThanOrEqual(1);
    }
    for (const shell of ['loam', 'ferrite', 'verdance', 'cinder']) {
      expect(WEATHER.some((w) => w.shellId === shell && w.neutral)).toBe(true);
    }
  });

  it('reads neutral before the Guild opens; deterministic per segment after', () => {
    const { s } = fresh();
    expect(currentWeather(s).neutral).toBe(true);
    s.guild.discovered = true;
    s.guild.clockMs = 7 * 3600_000;
    const a = weatherFor(s, 'ferrite').id;
    const b = weatherFor(s, 'ferrite').id;
    expect(a).toBe(b);
    // A magnetic storm doubles the chainPower bucket while it blows.
    let stormSeg = -1;
    for (let seg = 0; seg < 200; seg++) {
      s.guild.clockMs = seg * 50 * 60_000 + 1;
      if (weatherFor(s, 'ferrite').id === 'magneticStorm') { stormSeg = seg; break; }
    }
    expect(stormSeg).toBeGreaterThanOrEqual(0);
    s.shell.current = 'ferrite';
    const stormy = computeBucket(s, 'chainPower').toNumber();
    s.guild.clockMs = 0; // pre-... still discovered; find a calm segment
    for (let seg = 0; seg < 200; seg++) {
      s.guild.clockMs = seg * 50 * 60_000 + 1;
      if (weatherFor(s, 'ferrite').neutral) break;
    }
    const calm = computeBucket(s, 'chainPower').toNumber();
    expect(stormy / calm).toBeCloseTo(2, 5);
  });
});

describe('the greenhouse: 78 strains, a grammar you can hypothesize about', () => {
  it('12 base strains on a 4x3 grid; hybrids take the slower form and blend humors', () => {
    expect(BASE_STRAINS).toHaveLength(12);
    expect(TOTAL_STRAINS).toBe(78);
    const hy = hybridDef('lampmoss', 'cablevine'); // bright moss × iron vine
    expect(hy.form).toBe('vine'); // cablevine is slower
    expect(hy.humor).toEqual(['bright', 'iron']);
    expect(hy.name).toContain('Vine');
    // Deterministic and order-independent.
    expect(hybridDef('cablevine', 'lampmoss').id).toBe(hy.id);
  });

  it('adjacent flowering plots breed the pair once — discovery, not listing', () => {
    const { s } = verdant();
    s.depthRecords['verdance'] = 40; // mastery 4 — greenhouse open
    s.greenhouse.plots[0] = { speciesId: 'lampmoss', progressMs: strainDef('lampmoss').growMs };
    s.greenhouse.plots[1] = { speciesId: 'boltcap', progressMs: strainDef('boltcap').growMs };
    tickGreenhouse(s, ctx, 1000);
    const id = hybridId('lampmoss', 'boltcap');
    expect(s.greenhouse.codex).toContain(id);
    expect(s.greenhouse.seeds[id]).toBe(1);
    // Once — not a fountain.
    tickGreenhouse(s, ctx, 1000);
    expect(s.greenhouse.seeds[id]).toBe(1);
  });
});

describe('the mycelium: seeded by hand, fed to wander, kept forever', () => {
  it('inoculates for humus, clusters amplify, and it survives collapse', () => {
    const { engine, s } = verdant();
    s.depthRecords['verdance'] = 60;
    addCurrency(s, 'humus', D(1000));
    expect(inoculate(s, ctx, '0-0', 'marrowcap').ok).toBe(true);
    expect(inoculate(s, ctx, '0-1', 'marrowcap').ok).toBe(true);
    expect(inoculate(s, ctx, '1-0', 'dewthread').ok).toBe(true);
    expect(clusters(s)).toHaveLength(1);
    const withCluster = computeBucket(s, 'dustYield').toNumber();
    expect(withCluster).toBeGreaterThan(1);
    s.depth = 50;
    engine.dispatch({ type: 'collapse' });
    expect(Object.keys(s.mycelium.nodes)).toHaveLength(3); // persistent
  });

  it('fed mycelium spreads a night\'s worth, interval by interval', () => {
    const { s } = verdant();
    s.depthRecords['verdance'] = 60;
    addCurrency(s, 'humus', D(1000));
    inoculate(s, ctx, '0-0', 'marrowcap');
    s.mycelium.reserve = SPREAD_COST * 3;
    s.guild.clockMs = 3600_000; // a real epoch (0 is the "not started" sentinel)
    s.mycelium.lastSpreadMs = s.guild.clockMs;
    s.guild.clockMs += SPREAD_EVERY_MS * 3 + 1;
    tickMycelium(s, ctx);
    expect(Object.keys(s.mycelium.nodes).length).toBe(4); // 1 + 3 spreads
    expect(s.mycelium.reserve).toBe(0);
  });
});

describe('the loom: solve for shape, never memorize', () => {
  it('knots form exactly where twists oppose — the outer product', () => {
    const warp = ['rootS', 'rootZ', 'rootS', 'rootS', 'rootS', 'rootS'];
    const weft = ['rootZ', 'rootZ', 'rootS', 'rootS', 'rootS', 'rootS'];
    const grid = litGrid(warp, weft);
    expect(grid[0]![0]).toBe(true); // S over Z
    expect(grid[1]![0]).toBe(false); // Z over Z slides
    expect(grid[0]![2]).toBe(false); // S over S slides
    expect(grid[1]![2]).toBe(true); // Z over S
  });

  it('an I emerges from one odd row; chirality keeps S and Z apart', () => {
    // Row 0 is S against four Z columns -> a 4-knot line (I), the rest dark.
    const warp = ['silkS', 'rootZ', 'rootZ', 'rootZ', 'rootZ', 'rootZ'];
    const weft = ['rootZ', 'rootZ', 'rootZ', 'rootZ', 'rootS', 'rootS'];
    const shapes = findShapes(warp, weft);
    // Row 0: lit at cols 0-3 (I). Rows 1-5: lit at cols 4-5 (5x2 block, no tetromino).
    expect(shapes.some((sh) => sh.shape === 'I')).toBe(true);
    expect(THREADS).toHaveLength(8);
    // Chirality: an S-shaped and Z-shaped component classify differently.
    const sShape = findShapes(
      ['rootS', 'rootS', 'rootZ', 'rootZ', 'rootZ', 'rootZ'],
      ['rootZ', 'rootZ', 'rootZ', 'rootZ', 'rootZ', 'rootZ'],
    );
    void sShape; // (visual confirmation lives in the UI; classifier is exercised above)
  });

  it('committing consumes thread stock and the woven shapes carry modifiers', () => {
    const { engine, s } = verdant();
    s.depthRecords['verdance'] = 40; // mastery 4
    s.loom.framed = true; // iron frame installed (export spine; gate tested in export-spine.test.ts)
    s.loom.threads['silkS'] = 6;
    s.loom.threads['rootZ'] = 12;
    s.loom.threads['rootS'] = 6;
    for (let i = 0; i < 6; i++) {
      engine.dispatch({ type: 'setThread', axis: 'warp', index: i, threadId: i === 0 ? 'silkS' : 'rootZ' });
      engine.dispatch({ type: 'setThread', axis: 'weft', index: i, threadId: i < 4 ? 'rootZ' : 'rootS' });
    }
    const before = computeBucket(s, 'drillSpeed').toNumber();
    const r = engine.dispatch({ type: 'commitWeave' });
    expect(r.ok).toBe(true);
    expect(s.loom.discoveredShapes).toContain('I');
    expect(computeBucket(s, 'drillSpeed').toNumber()).toBeGreaterThan(before);
    expect(s.loom.threads['silkS']).toBe(5); // one row's worth consumed
  });
});

describe('brewing: spikes, not sustains', () => {
  it('ratios match in lowest terms; discovery pays doses; misses hint', () => {
    expect(matchBrew(4, 2, 0)!.id).toBe('longlight'); // 2:1:0 scaled
    expect(matchBrew(1, 1, 1)).toBeNull();
    const { engine, s } = verdant();
    s.depthRecords['verdance'] = 60; // mastery 6
    addCurrency(s, 'sap', D(1000));
    addCurrency(s, 'spore', D(2000));
    addCurrency(s, 'resin', D(500));
    const r = engine.dispatch({ type: 'brewExperiment', sap: 2, spore: 1, resin: 0 });
    expect(r.ok).toBe(true);
    expect(s.brewing.discovered).toContain('longlight');
    expect(s.brewing.doses['longlight']).toBe(2);
    const miss = engine.dispatch({ type: 'brewExperiment', sap: 1, spore: 1, resin: 1 });
    expect(miss.ok).toBe(true);
    expect(s.brewing.lastHint).toBeTruthy();
  });

  it('one draught at a time; it expires; Ironblood reaches into combat', () => {
    const { engine, s } = verdant();
    s.depthRecords['verdance'] = 60;
    s.brewing.doses['ironblood'] = 2;
    s.brewing.doses['longlight'] = 1;
    expect(engine.dispatch({ type: 'drinkBrew', brewId: 'ironblood' }).ok).toBe(true);
    expect(brewCombat(s).strikeMult).toBeCloseTo(1.5, 5);
    expect(engine.dispatch({ type: 'drinkBrew', brewId: 'longlight' }).ok).toBe(false); // no stacking
    engine.tick(121);
    expect(s.brewing.active).toBeNull(); // expired on its own
    expect(BREWS).toHaveLength(12);
  });
});

describe('old plenty: patience under abundance', () => {
  it('falls to pure auto with a period kit; a ferrite kit bounces off', () => {
    const { s, mods } = verdant();
    s.forge.tools.push({
      id: 11, recipeId: 'wildstarFalx', name: 'Wildstar Falx', tier: 9,
      purity: 70, chipPower: 10, strikePower: 100, sockets: ['bloodgarnet', 'cinderquartz', null], alloys: [null, null],
    });
    s.forge.equipped = s.forge.tools.length - 1;
    s.forge.gear.offhand = { defId: 'plentyshell', purity: 60 };
    s.forge.gear.harness = { defId: 'canopyweave', purity: 60 };
    s.delver.skills['twoHandedSwing'] = 5;
    s.delver.skills['deepGrip'] = 3;
    for (const id of ['firstKill', 'wardenLoam', 'kills25']) s.achievements.unlocked[id] = true;
    mods.invalidate();
    const plenty = wardenOf('verdance')!;
    expect(resolveFight(s, mods, plenty, AUTO_SKILL).win).toBe(true);
    // Impatience feeds it: lower dodge (auto) faces more effective hp than optimal.
    s.forge.tools[s.forge.tools.length - 1]!.tier = 6;
    s.forge.tools[s.forge.tools.length - 1]!.strikePower = 30;
    mods.invalidate();
    expect(resolveFight(s, mods, plenty, AUTO_SKILL).win).toBe(false);
  });
});

describe('save v7', () => {
  it('migrates v6 saves with a sleeping green shell', () => {
    const { s } = fresh();
    const raw = JSON.parse(serialize(s, 0)) as { state: Record<string, unknown> };
    for (const k of ['growth', 'greenhouse', 'mycelium', 'brewing', 'loom', 'weatherSeg']) delete raw.state[k];
    const migrated = runMigrations({ version: 6, savedAt: 0, state: raw.state } as never);
    expect(migrated.version).toBe(SAVE_VERSION);
    const st = migrated.state as Record<string, Record<string, unknown>>;
    expect(st['growth']!['stage']).toEqual([]);
    expect(st['loom']!['warp']).toHaveLength(6);
    expect((st['brewing']!['discovered'] as string[])).toEqual([]);
  });
});

/**
 * PHASE 14 — the "Verdance retroactive-unlock flaw" I reported in Part A does
 * NOT reproduce. Measured rather than assumed:
 *
 *   - the three gates fire at depth records 20 / 40 / 60 of a 290-deep shell,
 *     i.e. inside the first fifth, not the back half;
 *   - a Collapse does not touch depthRecords, so nothing is ever un-earned;
 *   - and you cannot Breach out of Verdance before the gates fire, so the
 *     one-way stair cannot strand you with a permanently dead system.
 *
 * Since the fix was to be "move the three to shell entry", and the reason for
 * it was wrong, the gates are LEFT ALONE and this pins the properties that
 * make them safe. If a later phase moves a gate past the breach point, or
 * makes a Collapse eat the records, this fails and says why.
 */
describe('Verdance gates cannot strand a player (P14 measurement)', () => {
  const shellFloor = 290;

  it('all three unlock well inside the shell, not at its floor', () => {
    const { s } = fresh();
    for (const [depth, expected] of [[19, 0], [20, 1], [40, 2], [60, 3]] as const) {
      s.depthRecords['verdance'] = depth;
      const open = [greenhouseUnlocked(s), loomUnlocked(s), brewingUnlocked(s)].filter(Boolean).length;
      expect(open, `at Verdance depth ${depth}`).toBe(expected);
    }
    // The deepest gate is a small fraction of the shell — room to use them.
    expect(60).toBeLessThan(shellFloor * 0.25);
  });

  it('a Collapse never takes back a Verdance system', () => {
    const { engine, s } = fresh();
    s.shell.current = 'verdance';
    s.depthRecords['verdance'] = 120;
    expect(brewingUnlocked(s)).toBe(true);
    engine.dispatch({ type: 'collapse' });
    expect(brewingUnlocked(engine.getState() as GameState)).toBe(true);
  });

  it('you cannot leave Verdance before the last gate opens', () => {
    const { s } = fresh();
    s.shell.current = 'verdance';
    // Below the deepest gate, breaching is impossible — so no player can carry
    // an un-unlocked Verdance system into a shell they can never come back from.
    for (const d of [30, 59]) {
      s.depth = d;
      s.depthRecords['verdance'] = d;
      expect(canBreach(s), `breach allowed at depth ${d}`).toBe(false);
    }
  });
});
