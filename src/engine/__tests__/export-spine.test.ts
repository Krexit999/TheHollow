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
import { SHELL_EXPORTS } from '../content/exports';
import { CHAINS, transmute, transmuteUnlocked } from '../systems/refinery';
import { pourAlloy, crucibleUnlocked } from '../content/shell2/crucibleSystem';
import { AXIOM_RESONANCE } from '../systems/recursionSys';
import { stockFor, buyStock } from '../guild/guild';

function fresh(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState, mods: new ModifierCache() };
}

const ctx = { dirty: () => {}, emit: () => {}, replaceState: () => {} } as never;

describe('the registry: one export per shell, made never dug', () => {
  it('covers loam and hollow, and every material export is worked with traits', () => {
    // A.72: Verdance/Glassmere/Cinder's craft-system producers (Greenhouse,
    // Loom, Bench, Ember Array) are gone, so the spine that ran through them
    // shrank to its two ends — the Kiln's Kilnflux and the Hollow's Resonance.
    const shells = new Set(SHELL_EXPORTS.map((e) => e.shellId));
    for (const id of ['loam', 'hollow']) {
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
    expect(shelf.some((slot) => slot.id === 'resonance')).toBe(false); // Aleph not reached yet

    s.shell.breachCount = 6; // Aleph: she bottles the Hollow itself
    shelf = stockFor(s, 'serra');
    expect(shelf.some((slot) => slot.id === 'kilnflux')).toBe(true);
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
});
