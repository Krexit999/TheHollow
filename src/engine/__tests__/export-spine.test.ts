/**
 * THE EXPORT SPINE (Part B, A.39) — the full Loam→Aleph chain, walked.
 *
 * The Part A ruling: one export per shell, made by that shell's own craft,
 * demanded by the next shell's signature infrastructure — and the curriculum
 * law must hold across shells or a player softlocks. These tests walk every
 * edge in both directions (blocked without the export, paid with it), pin the
 * no-softlock construction (every toll starts no earlier than its producer;
 * Serra's shelf carries everything left behind), and pin the v23 grandfather
 * migration so no standing infrastructure is confiscated.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { D } from '../decimal';
import { addCurrency, getCurrency } from '../resources';
import { addMaterial, materialCount } from '../systems/forge';
import { materialDef, workedMaterials, rollDrop, crackGeodeRolls } from '../materials';
import { traitsOf } from '../traits';
import { SHELL_EXPORTS, EXPORT_RECIPES, produceExport } from '../content/exports';
import { CHAINS, transmute, transmuteUnlocked } from '../systems/refinery';
import { pourAlloy, crucibleUnlocked } from '../content/shell2/crucibleSystem';
import { plotCount, plotCap, installFrame } from '../content/shell3/greenhouse';
import { installLoomFrame } from '../content/shell3/loomSystem';
import { OBSERVATION_TIERS, startObservation } from '../content/shell4/observatory';
import { openRows, installSocket, placeFuel, ANNEAL_SEC, BAND_LOW } from '../content/shell5/emberArray';
import { layPipe, FREE_PIPES, VENT_SHAFT_CELL } from '../systems/pressure';
import { rebuildCell } from '../systems/absence';
import { AXIOM_RESONANCE } from '../systems/recursionSys';
import { stockFor, buyStock } from '../guild/guild';
import { runMigrations, SAVE_VERSION } from '../save/migrations';

function fresh(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState, mods: new ModifierCache() };
}

const ctx = { dirty: () => {}, emit: () => {}, replaceState: () => {} } as never;

describe('the registry: one export per shell, made never dug', () => {
  it('covers loam through hollow, and every material export is worked with traits', () => {
    const shells = new Set(SHELL_EXPORTS.map((e) => e.shellId));
    for (const id of ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow']) {
      expect(shells.has(id), `${id} exports something`).toBe(true);
    }
    for (const e of SHELL_EXPORTS) {
      if (!e.materialId) continue; // the Hollow's export is Resonance, a currency
      const def = materialDef(e.materialId);
      expect(def.worked, `${e.materialId} never drops from mining`).toBe(true);
      expect(def.shellId).toBe(e.shellId);
      expect(traitsOf(e.materialId).length, `${e.materialId} has traits`).toBeGreaterThanOrEqual(2);
    }
    // And they are counted among the made-not-found.
    const workedIds = new Set(workedMaterials().map((m) => m.id));
    for (const e of SHELL_EXPORTS) if (e.materialId) expect(workedIds.has(e.materialId)).toBe(true);
  });

  it('no back door: the ROCK never yields a worked material (rollDrop + crackGeodeRolls)', () => {
    // The second leak the export-spine sim caught: crackGeodeRolls filtered
    // combat-only but NOT worked, so a rich Loam geode rolled Kilnflux and a
    // Verdance one Fibercloth — bench exports appearing in the seam. Brute the
    // rollers across every shell and depth band; nothing worked may fall out,
    // and the empty-pool fallback must never be a worked material either.
    let rngState = 12345;
    const rng = () => { rngState = (rngState * 1103515245 + 12345) & 0x7fffffff; return rngState / 0x7fffffff; };
    const shells = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph'];
    for (const shell of shells) {
      for (const depth of [0, 20, 50, 90, 140, 200, 320]) {
        for (let i = 0; i < 400; i++) {
          const d = rollDrop(shell, depth, rng);
          if (d.materialId) expect(materialDef(d.materialId).worked ?? false, `rollDrop ${shell}@${depth} -> ${d.materialId}`).toBe(false);
          for (const g of crackGeodeRolls(shell, depth, rng)) {
            if (g.materialId) expect(materialDef(g.materialId).worked ?? false, `geode ${shell}@${depth} -> ${g.materialId}`).toBe(false);
          }
        }
      }
    }
  });

  it('no back door: expedition hauls filter the worked set (the leak the sim caught)', () => {
    // Found live: the 12h sim showed 9 Kilnflux and 12 Fibercloth with ZERO
    // firings/weaves — Museum expeditions drew from an unfiltered shell pool
    // and had quietly minted worked materials since P16. The pool now honors
    // the same law as rollDrop, materialsOfShell, and the stalls.
    const museum = readFileSync(join(process.cwd(), 'src', 'engine', 'systems', 'museum.ts'), 'utf8');
    expect(museum).toMatch(/m\.shellId === from\.id && !m\.worked/);
  });
});

describe('Loam → Ferrite: Kilnflux fires every pour', () => {
  it('the Kiln Firing is a registered chain that batches six flux per firing', () => {
    const { s } = fresh(); // content (incl. chains) registers on engine boot
    const chain = CHAINS.find((c) => c.out === 'kilnflux');
    expect(chain).toBeDefined();
    expect(chain!.yield).toBe(6);
    s.shell.breachCount = 1;
    s.depthRecords['ferrite'] = 300; // transmute bench open
    addMaterial(s, chain!.a, 60, chain!.cost * 2);
    addMaterial(s, chain!.b, 60, chain!.cost * 2);
    const r = transmute(s, ctx, chain!.a, chain!.b);
    expect(r.ok).toBe(true);
    expect(materialCount(s, 'kilnflux')).toBe(6);
  });

  it('a pour is blocked dry once transmutation is open, and burns flux hit or miss', () => {
    const { s, mods } = fresh();
    s.shell.breachCount = 1;
    s.depthRecords['ferrite'] = 300;
    expect(crucibleUnlocked(s)).toBe(true);
    expect(transmuteUnlocked(s)).toBe(true);
    addMaterial(s, 'ironbloom', 60, 3);
    for (const m of ['ingot', 'flux', 'scale', 'lodestone', 'rime']) addCurrency(s, m, D(10000));
    const dry = pourAlloy(s, mods, ctx, [2, 1, 0, 0, 0], 'ironbloom');
    expect(dry.ok).toBe(false);
    expect(dry.reason).toMatch(/Kilnflux/);
    addMaterial(s, 'kilnflux', 70, 2);
    const wet = pourAlloy(s, mods, ctx, [2, 1, 0, 0, 0], 'ironbloom');
    expect(wet.ok).toBe(true);
    expect(materialCount(s, 'kilnflux')).toBe(1); // burned, hit or miss
  });

  it('THE CURRICULUM LAW BY CONSTRUCTION: no flux toll before the flux bench', () => {
    // Below transmute mastery the Crucible pours dry — the bill starts exactly
    // when the player can pay it. A softlock window cannot exist.
    const { s, mods } = fresh();
    s.shell.breachCount = 1;
    s.depthRecords['ferrite'] = 45; // crucible open (mastery 2-5), transmute NOT
    expect(crucibleUnlocked(s)).toBe(true);
    expect(transmuteUnlocked(s)).toBe(false);
    addMaterial(s, 'ironbloom', 60, 1);
    for (const m of ['ingot', 'flux', 'scale', 'lodestone', 'rime']) addCurrency(s, m, D(10000));
    expect(pourAlloy(s, mods, ctx, [2, 1, 0, 0, 0], 'ironbloom').ok).toBe(true);
  });
});

describe('Ferrite → Verdance: Lodeframe builds beds and braces the loom', () => {
  it('is cast from ferrite currencies at the Crucible', () => {
    const { s } = fresh();
    s.shell.breachCount = 1;
    s.depthRecords['ferrite'] = 45;
    expect(produceExport(s, 'lodeframe').ok).toBe(false); // can't afford yet
    addCurrency(s, 'scale', D(200));
    addCurrency(s, 'lodestone', D(200));
    expect(produceExport(s, 'lodeframe').ok).toBe(true);
    expect(materialCount(s, 'lodeframe')).toBe(1);
  });

  it('mastery reveals the room, iron builds the bed', () => {
    const { s } = fresh();
    s.shell.current = 'verdance';
    s.shell.breachCount = 2;
    s.depthRecords['verdance'] = 100; // mastery 8+: cap 6
    expect(plotCap(s)).toBeGreaterThanOrEqual(6);
    expect(plotCount(s)).toBe(4); // no frames yet — mastery alone opens nothing
    expect(installFrame(s).ok).toBe(false); // no lodeframe held
    addMaterial(s, 'lodeframe', 70, 2);
    expect(installFrame(s).ok).toBe(true);
    expect(plotCount(s)).toBe(5);
    expect(installFrame(s).ok).toBe(true);
    expect(plotCount(s)).toBe(6);
  });

  it('the loom commits nothing until the frame is iron', () => {
    const { engine, s } = fresh();
    s.shell.current = 'verdance';
    s.shell.breachCount = 2;
    s.depthRecords['verdance'] = 40;
    s.loom.threads['rootZ'] = 20;
    for (let i = 0; i < 6; i++) {
      engine.dispatch({ type: 'setThread', axis: 'warp', index: i, threadId: 'rootZ' });
      engine.dispatch({ type: 'setThread', axis: 'weft', index: i, threadId: 'rootZ' });
    }
    const bare = engine.dispatch({ type: 'commitWeave' });
    expect(bare.ok).toBe(false);
    expect(bare.reason).toMatch(/Lodeframe/);
    addMaterial(s, 'lodeframe', 70, 1);
    expect(installLoomFrame(s).ok).toBe(true);
    const framed = engine.dispatch({ type: 'commitWeave' });
    expect(framed.ok).toBe(true);
    // …and the committed weave IS the Fibercloth producer.
    expect(materialCount(s, 'fibercloth')).toBe(1);
  });
});

describe('Verdance → Glassmere: Set Resin silvers mirrors, Fibercloth wraps lenses', () => {
  it('set resin renders at the still and the fifth mirror demands it', () => {
    const { engine, s } = fresh();
    s.shell.current = 'verdance';
    s.shell.breachCount = 2;
    s.depthRecords['verdance'] = 80; // brewing open
    addCurrency(s, 'sap', D(1000));
    addCurrency(s, 'resin', D(1000));
    expect(produceExport(s, 'setresin').ok).toBe(true);
    expect(materialCount(s, 'setresin')).toBe(1);

    addCurrency(s, 'silica', D(100000));
    s.refraction.mirrorStock = 4;
    // The fifth mirror consumes the resin rendered above…
    expect(engine.dispatch({ type: 'buyMirror' }).ok).toBe(true);
    expect(s.refraction.mirrorStock).toBe(5);
    expect(materialCount(s, 'setresin')).toBe(0);
    // …and the sixth is blocked dry, naming the want.
    const gated = engine.dispatch({ type: 'buyMirror' });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toMatch(/Set Resin/);
    addMaterial(s, 'setresin', 70, 1);
    expect(engine.dispatch({ type: 'buyMirror' }).ok).toBe(true);
    expect(s.refraction.mirrorStock).toBe(6);
  });

  it('exposures past a glance wrap the lens in cloth', () => {
    const { s } = fresh();
    s.shell.current = 'glassmere';
    s.shell.breachCount = 3;
    s.depthRecords['glassmere'] = 30;
    expect(OBSERVATION_TIERS[0]!.cloth).toBe(0); // the glance stays free
    expect(startObservation(s, 0).ok).toBe(true);
    s.observatory.active = null;
    const gated = startObservation(s, 1);
    expect(gated.ok).toBe(false);
    expect(gated.reason).toMatch(/Fibercloth/);
    addMaterial(s, 'fibercloth', 70, 1);
    expect(startObservation(s, 1).ok).toBe(true);
    expect(materialCount(s, 'fibercloth')).toBe(0);
  });
});

describe('Glassmere → Cinder: lenses socket the grate, seals join the pipe', () => {
  it('bench exports grind from glassmere currencies', () => {
    const { s } = fresh();
    s.shell.current = 'glassmere';
    s.shell.breachCount = 3;
    s.depthRecords['glassmere'] = 80;
    addCurrency(s, 'silica', D(1000));
    addCurrency(s, 'prism', D(1000));
    addCurrency(s, 'rime', D(1000));
    expect(produceExport(s, 'groundlens').ok).toBe(true);
    expect(produceExport(s, 'glasseal').ok).toBe(true);
  });

  it('array rows past the first want a lens socketed', () => {
    const { s } = fresh();
    s.shell.current = 'cinder';
    s.shell.breachCount = 4;
    s.depthRecords['cinder'] = 40;
    s.ember.fuelOwned['emberbillet'] = 6;
    expect(openRows(s)).toBe(1);
    expect(placeFuel(s, 0, 'emberbillet').ok).toBe(true); // row 0 free
    const gated = placeFuel(s, 6, 'emberbillet'); // row 1
    expect(gated.ok).toBe(false);
    expect(gated.reason).toMatch(/[Ll]ens/);
    expect(installSocket(s).ok).toBe(false); // none held
    addMaterial(s, 'groundlens', 70, 1);
    expect(installSocket(s).ok).toBe(true);
    expect(placeFuel(s, 6, 'emberbillet').ok).toBe(true);
    // clearing fuel is NEVER gated — a stranded layout can always be unloaded
    expect(placeFuel(s, 6, null).ok).toBe(true);
  });

  it('the thirteenth pipe section wants a Glasseal; the sim route of twelve never does', () => {
    const { s } = fresh();
    s.shell.current = 'cinder';
    s.shell.breachCount = 4;
    addCurrency(s, 'obsidian', D(1e9));
    // The standard route the heat sim's every stance lays. Cell 17 appears in
    // both the spine and the spur — 11 UNIQUE sections, safely under the 12
    // free joins, so no policy the flood guarantees rest on ever meets the
    // gate.
    const route = [...new Set([
      VENT_SHAFT_CELL, VENT_SHAFT_CELL + 1, VENT_SHAFT_CELL + 2, VENT_SHAFT_CELL + 3,
      VENT_SHAFT_CELL + 4, VENT_SHAFT_CELL + 5, VENT_SHAFT_CELL + 6,
      3, 10, 17, 31, 24,
    ])];
    expect(route.length).toBeLessThanOrEqual(FREE_PIPES);
    for (const cell of route) expect(layPipe(s, cell).ok).toBe(true);
    // Fill the remaining free joins…
    let cell = 0;
    while (s.pressure.pipes.filter((p) => p === 1).length < FREE_PIPES) {
      if (s.pressure.pipes[cell] !== 1) expect(layPipe(s, cell).ok).toBe(true);
      cell++;
    }
    const gated = layPipe(s, cell);
    expect(gated.ok).toBe(false);
    expect(gated.reason).toMatch(/Glasseal/);
    addMaterial(s, 'glasseal', 70, 1);
    expect(layPipe(s, cell).ok).toBe(true);
    expect(materialCount(s, 'glasseal')).toBe(0);
    // pulling pipe back up stays free
    expect(layPipe(s, cell).ok).toBe(true);
  });
});

describe('Cinder → Hollow: Emberglass anneals out of a held burn', () => {
  it('90 in-band seconds anneal one glass, cumulative across band exits', () => {
    const { s } = fresh();
    s.shell.current = 'cinder';
    s.shell.breachCount = 4;
    s.depthRecords['cinder'] = 40;
    s.ember.temp = BAND_LOW + 5;
    s.ember.annealSec = ANNEAL_SEC - 1; // 89s of prior work banked
    s.ember.fuelOwned['obsidianblock'] = 1;
    s.ember.grid[0] = 'obsidianblock';
    s.ember.burn[0] = 150;
    const engine = createEngine({ nowMs: 0 });
    // drive the shared tick path through a real engine on a primed state
    const live = engine.getState() as GameState;
    Object.assign(live.ember, s.ember);
    live.shell.current = 'cinder';
    live.shell.breachCount = 4;
    live.depthRecords['cinder'] = 40;
    engine.tick(2);
    expect(materialCount(live, 'emberglass')).toBeGreaterThanOrEqual(1);
  });

  it('the ninth rebuilt cell and every recording want the glass', () => {
    const { s } = fresh();
    s.shell.current = 'hollow';
    s.shell.breachCount = 5;
    s.shell.signatures = ['seepage', 'polarity', 'growth', 'refraction', 'pressure'];
    s.depthRecords['hollow'] = 30;
    s.depth = 200;
    addCurrency(s, 'void', D(1e12));
    for (let i = 0; i < 8; i++) expect(rebuildCell(s, ctx, i).ok, `cell ${i} free of glass`).toBe(true);
    const gated = rebuildCell(s, ctx, 8);
    expect(gated.ok).toBe(false);
    expect(gated.reason).toMatch(/Emberglass/);
    addMaterial(s, 'emberglass', 70, 1);
    expect(rebuildCell(s, ctx, 8).ok).toBe(true);

    const { engine: e2, s: s2 } = fresh();
    s2.shell.current = 'hollow';
    s2.shell.breachCount = 5;
    s2.depthRecords['hollow'] = 30;
    const rec = e2.dispatch({ type: 'tapeRecord', on: true });
    expect(rec.ok).toBe(false);
    expect(rec.reason).toMatch(/Emberglass/);
    addMaterial(s2, 'emberglass', 70, 1);
    expect(e2.dispatch({ type: 'tapeRecord', on: true }).ok).toBe(true);
    expect(s2.chamber.recording).toBe(true);
    // stopping and restarting the SAME armed session is free only via stop;
    // a new arming is a new plate.
    expect(e2.dispatch({ type: 'tapeRecord', on: false }).ok).toBe(true);
    expect(e2.dispatch({ type: 'tapeRecord', on: true }).ok).toBe(false);
  });
});

describe('Hollow → Aleph: a law is written in Resonance', () => {
  it('buyAxiom demands the ink', () => {
    const { engine, s } = fresh();
    addCurrency(s, 'axiom', D(3));
    const dry = engine.dispatch({ type: 'buyAxiom', id: 'firstWord' });
    expect(dry.ok).toBe(false);
    expect(dry.reason).toMatch(/Resonance/);
    addCurrency(s, 'resonance', D(AXIOM_RESONANCE));
    expect(engine.dispatch({ type: 'buyAxiom', id: 'firstWord' }).ok).toBe(true);
    expect(getCurrency(s, 'resonance').toNumber()).toBe(0);
  });
});

describe("Serra's export shelf: the road runs up as well as down", () => {
  it('stocks exactly the left-behind shells, deterministically, and sells into the Hold', () => {
    const { s, mods } = fresh();
    s.guild.discovered = true;
    s.shell.breachCount = 1; // standing in Ferrite: loam is behind you
    let shelf = stockFor(s, 'serra');
    expect(shelf.some((slot) => slot.id === 'kilnflux')).toBe(true);
    expect(shelf.some((slot) => slot.id === 'lodeframe')).toBe(false); // not left behind yet

    s.shell.breachCount = 5; // standing in Hollow
    shelf = stockFor(s, 'serra');
    for (const id of ['kilnflux', 'lodeframe', 'setresin', 'fibercloth', 'groundlens', 'glasseal', 'emberglass']) {
      expect(shelf.some((slot) => slot.id === id), `${id} on the shelf`).toBe(true);
    }
    expect(shelf.some((slot) => slot.id === 'resonance')).toBe(false);

    s.shell.breachCount = 6; // Aleph: she bottles the Hollow itself
    shelf = stockFor(s, 'serra');
    expect(shelf.some((slot) => slot.id === 'resonance')).toBe(true);

    // Buying works through the normal stall machinery.
    addCurrency(s, 'scrip', D(10000));
    const idx = shelf.findIndex((slot) => slot.id === 'kilnflux');
    expect(buyStock(s, mods, ctx, 'serra', idx).ok).toBe(true);
    expect(materialCount(s, 'kilnflux')).toBe(1);
    const rIdx = shelf.findIndex((slot) => slot.id === 'resonance');
    const before = getCurrency(s, 'resonance').toNumber();
    expect(buyStock(s, mods, ctx, 'serra', rIdx).ok).toBe(true);
    expect(getCurrency(s, 'resonance').toNumber()).toBe(before + 25);
  });

  it('every producible export has a recipe its home shell can pay', () => {
    // The recipes' currencies are the HOME shell's own — the audit-recipes
    // extension (B2) walks the full graph; this pins the engine-side facts.
    const homes: Record<string, string[]> = {
      lodeframe: ['scale', 'lodestone'],
      setresin: ['sap', 'resin'],
      groundlens: ['silica', 'prism'],
      glasseal: ['silica', 'rime'],
    };
    for (const r of EXPORT_RECIPES) {
      for (const c of r.costs) {
        expect(homes[r.materialId], `${r.materialId} recipe`).toContain(c.currencyId);
      }
    }
  });
});

describe('the v23 grandfather: standing infrastructure is never confiscated', () => {
  it('old plots, an old loom, and a loaded grate keep working', () => {
    const payload = {
      version: 22, savedAtMs: 0,
      state: {
        greenhouse: { plots: [null, null, null, null, null, null], seeds: {}, codex: [], harvests: 3 },
        loom: { weaves: 4, discoveredShapes: ['I'], threads: {} },
        ember: { grid: new Array(36).fill(null), savedLayout: new Array(36).fill(null) },
      },
    } as never;
    const out = runMigrations(payload);
    expect(out.version).toBe(SAVE_VERSION);
    const st = out.state as Record<string, Record<string, unknown>>;
    expect(st['greenhouse']!['frames']).toBe(2); // six beds - four free
    expect(st['loom']!['framed']).toBe(true);
    expect(st['ember']!['sockets']).toBe(0);
  });

  it('fuel standing in a deep row grants the sockets that row needs', () => {
    const grid = new Array(36).fill(null);
    grid[20] = 'emberbillet'; // row 3
    const payload = { version: 22, savedAtMs: 0, state: { ember: { grid, savedLayout: new Array(36).fill(null) } } } as never;
    const out = runMigrations(payload);
    const ember = (out.state as Record<string, Record<string, unknown>>)['ember']!;
    expect(ember['sockets']).toBe(3);
  });

  it('a fresh save starts with none of it granted', () => {
    const { s } = fresh();
    expect(s.greenhouse.frames).toBe(0);
    expect(s.loom.framed).toBe(false);
    expect(s.ember.sockets).toBe(0);
  });
});
