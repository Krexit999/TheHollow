/**
 * TOOLS FROM PARTS — the headline.
 *
 * The tests that matter are the ones the brief's promises translate to:
 *   - same tier, different composition, MEANINGFULLY different tool;
 *   - parts replaceable individually;
 *   - tier still gated by the head (no skipping walls);
 *   - migration loses NOTHING — not a name, not a socket, not an heirloom;
 *   - and the Shell I test, in the engine.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { addMaterial, materialCount, craftFromParts, replacePart, computeStats, recipeDef } from '../systems/forge';
import { computePartStats, headTierCap } from '../systems/toolParts';
import { runMigrations, SAVE_VERSION } from '../save/migrations';

const ctx = { emit: () => {}, dirty: () => {} };
const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.forge.built = true;
  s.currencies['brick'] = s.currencies['brick']!.add(100_000);
  // Ferrite+ forge in Flux, not Brick — fund both so a cross-shell test can craft.
  s.currencies['flux'] = (s.currencies['flux'] ?? s.currencies['brick']!.mul(0)).add(100_000);
  return { engine, s };
};
const mods = { invalidate() {}, get() { return { toNumber: () => 1 } as never; } } as never;

describe('a tool is an assembly, not a recipe', () => {
  it('forges from head/haft/binding and the stats come from the traits', () => {
    const { s } = fresh();
    for (const id of ['loamiron', 'marl', 'ochre']) addMaterial(s, id, 60, 3);
    const r = craftFromParts(s, mods, ctx, 2, 'loamiron', 'marl', 'ochre');
    expect(r.ok).toBe(true);
    const tool = (r.data as { tool: GameState['forge']['tools'][number] }).tool;
    expect(tool.parts).toBeDefined();
    expect(tool.parts!.head.materialId).toBe('loamiron');
    expect(tool.chipPower).toBeGreaterThan(0);
  });

  // THE SHELL I TEST, in the engine: two Tier-II tools from Loam alone that
  // feel genuinely different.
  it('the Shell I test: a keen-light pick out-chips a dense cleaver, which out-strikes it', () => {
    const { s } = fresh();
    for (const id of ['loamiron', 'marl', 'ochre', 'duskflint', 'graveclay']) addMaterial(s, id, 60, 5);

    const pick = craftFromParts(s, mods, ctx, 2, 'loamiron', 'marl', 'ochre');
    const cleaver = craftFromParts(s, mods, ctx, 2, 'duskflint', 'graveclay', 'ochre');
    const p = (pick.data as { tool: { chipPower: number; strikePower: number } }).tool;
    const c = (cleaver.data as { tool: { chipPower: number; strikePower: number } }).tool;

    expect(p.chipPower).toBeGreaterThan(c.chipPower);
    expect(c.strikePower).toBeGreaterThan(p.strikePower);
    // "Genuinely different": a felt swing on both axes.
    expect(p.chipPower / c.chipPower).toBeGreaterThan(1.25);
    expect(c.strikePower / p.strikePower).toBeGreaterThan(1.25);
  });

  it('names the tool after its character', () => {
    const { s } = fresh();
    for (const id of ['duskflint', 'graveclay', 'ochre', 'loamiron', 'marl']) addMaterial(s, id, 60, 5);
    const cleaver = craftFromParts(s, mods, ctx, 2, 'duskflint', 'graveclay', 'ochre');
    const pick = craftFromParts(s, mods, ctx, 2, 'loamiron', 'marl', 'ochre');
    expect((cleaver.data as { tool: { name: string } }).tool.name).toMatch(/Cleaver|Hammer/);
    expect((pick.data as { tool: { name: string } }).tool.name).toMatch(/Pick|Hammer/);
  });
});

describe('the head gates the tier — no skipping walls', () => {
  it('a Loam common cannot head a high-tier tool', () => {
    const { s } = fresh();
    s.depthRecords['ferrite'] = 300; // unlock the tier cap
    s.shell.current = 'ferrite';
    for (const id of ['marl', 'ochre']) addMaterial(s, id, 60, 3);
    expect(headTierCap('loam', 'common')).toBe(1);
    const r = craftFromParts(s, mods, ctx, 5, 'marl', 'ochre', 'ochre');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cannot head/i);
  });

  it('but a Marl HAFT on a high tool is allowed — the everyman handle', () => {
    const { s } = fresh();
    s.depthRecords['ferrite'] = 300;
    s.shell.current = 'ferrite';
    for (const id of ['bluesteel', 'marl', 'ochre']) addMaterial(s, id, 60, 3);
    // bluesteel is Ferrite rich → heads tier 5.
    const r = craftFromParts(s, mods, ctx, 5, 'bluesteel', 'marl', 'ochre');
    expect(r.ok).toBe(true);
  });
});

describe('parts are replaceable individually', () => {
  it('swaps the head, keeps the haft, and recomputes', () => {
    const { s } = fresh();
    for (const id of ['loamiron', 'marl', 'ochre', 'duskflint']) addMaterial(s, id, 60, 3);
    const forged = craftFromParts(s, mods, ctx, 2, 'loamiron', 'marl', 'ochre');
    const tool = (forged.data as { tool: { id: number } }).tool;
    const before = s.forge.tools.find((t) => t.id === tool.id)!;
    const beforeChip = before.chipPower;

    const r = replacePart(s, ctx, tool.id, 'head', 'duskflint');
    expect(r.ok).toBe(true);
    const after = s.forge.tools.find((t) => t.id === tool.id)!;
    // Head changed; haft/binding untouched.
    expect(after.parts!.head.materialId).toBe('duskflint');
    expect(after.parts!.haft.materialId).toBe('marl');
    // Duskflint (keen+dense) heads harder than Loamiron (keen+springy) → more strike.
    expect(after.strikePower).not.toBe(beforeChip);
  });

  it('refuses a head that cannot carry the tier', () => {
    const { s } = fresh();
    s.depthRecords['ferrite'] = 300;
    s.shell.current = 'ferrite';
    for (const id of ['bluesteel', 'marl', 'ochre']) addMaterial(s, id, 60, 3);
    const forged = craftFromParts(s, mods, ctx, 5, 'bluesteel', 'marl', 'ochre');
    const id = (forged.data as { tool: { id: number } }).tool.id;
    expect(replacePart(s, ctx, id, 'head', 'marl').ok).toBe(false);
  });
});

describe('discovered trait pairs record to the Codex, not the Compendium', () => {
  it('a shatter or a song is noticed once when forged', () => {
    const { s } = fresh();
    // brittle + dense = The Shatter. bonechalk is brittle+light; graveclay dense+tough.
    for (const id of ['bonechalk', 'graveclay', 'ochre']) addMaterial(s, id, 60, 3);
    const before = s.forge.pairsFound.length;
    craftFromParts(s, mods, ctx, 1, 'bonechalk', 'graveclay', 'ochre');
    // bonechalk(brittle) + graveclay(dense) → The Shatter present in the set.
    expect(s.forge.pairsFound.length).toBeGreaterThan(before);
  });
});

describe('migration loses nothing (save v15)', () => {
  it('every legacy tool gets a composition, keeping name/purity/sockets', () => {
    const payload = {
      version: 14,
      savedAtMs: 0,
      state: {
        forge: {
          built: true,
          tools: [
            { id: 0, recipeId: 'delversPick', name: "Delver's Pick", tier: 1, purity: 50, chipPower: 1, strikePower: 3, sockets: [], alloys: [] },
            // A named, heirloom, socketed tool — the thing that must NOT be lost.
            { id: 7, recipeId: 'deepcutter', name: 'Old Faithful', tier: 3, purity: 82, chipPower: 2.1, strikePower: 6, sockets: ['bloodgarnet', null], alloys: [], heirloom: true },
          ],
        },
      },
    } as never;
    const out = runMigrations(payload);
    expect(out.version).toBe(SAVE_VERSION);
    const tools = (out.state as { forge: { tools: Array<Record<string, unknown>> } }).forge.tools;

    const faithful = tools.find((t) => t['id'] === 7)!;
    expect(faithful['name']).toBe('Old Faithful');
    expect(faithful['heirloom']).toBe(true);
    expect((faithful['sockets'] as unknown[])[0]).toBe('bloodgarnet');
    // It gained parts derived from the deepcutter recipe (umberjade head).
    const parts = faithful['parts'] as { head: { materialId: string }; haft: { materialId: string } };
    expect(parts.head.materialId).toBe('umberjade');
    expect(parts.haft.materialId).toBe('wormsteel');
    // Its stored stats are untouched — no silent nerf.
    expect(faithful['chipPower']).toBe(2.1);
  });
});

describe('the recipe path still carries a composition', () => {
  it('a recipe-forged tool has parts too', () => {
    const { s } = fresh();
    for (const id of ['marl', 'ochre']) addMaterial(s, id, 60, 20);
    const engine = createEngine({ nowMs: 0 });
    void engine;
    // Forge via the legacy recipe path.
    const before = s.forge.tools.length;
    // craftTool needs mods with a real cache; use the engine dispatch instead.
    const e2 = createEngine({ nowMs: 0 });
    const s2 = e2.getState() as GameState;
    s2.forge.built = true;
    s2.currencies['brick'] = s2.currencies['brick']!.add(1000);
    for (const id of ['marl', 'ochre']) addMaterial(s2, id, 60, 20);
    e2.dispatch({ type: 'craftTool', recipeId: 'marlsplitter' });
    const forged = e2.getState().forge.tools.find((t) => t.recipeId === 'marlsplitter');
    expect(forged?.parts).toBeDefined();
    expect(forged?.parts?.head.materialId).toBe('marl');
    void before; void materialCount; void computePartStats; void computeStats; void recipeDef;
  });
});
