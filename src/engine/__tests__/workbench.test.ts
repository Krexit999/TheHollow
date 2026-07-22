/**
 * THE WORKBENCH — crafting is a process.
 *
 * The tests hold the five rules the brief set, as properties:
 *   1. Traits change the process (stageProfile shifts with the material).
 *   2. Quality is EARNED — deterministic, no RNG; better execution, better tool.
 *   3. Failure costs material, NEVER the item.
 *   4. Delegate is safe, guaranteed, slightly worse, and social.
 *   5. Headless — the engine takes a 0..1 execution and owns the rest.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { addMaterial, materialCount } from '../systems/forge';
import {
  beginCraft, craftStage, delegateCraft, abandonCraft, matchCast, CAST_RECIPES, ACT_DELEGATE,
} from '../systems/workbenchActs';
import {
  ACT_STAGES, craftsmanship, delegateQuality, stageProfile, gemCutMult,
} from '../systems/workbench';
import { ModifierCache } from '../modifiers';

const ctx = { emit: () => {}, dirty: () => {} };
const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.forge.built = true;
  s.currencies['brick'] = s.currencies['brick']!.add(100_000);
  return { engine, s };
};
const mods = new ModifierCache();
/** Play a forge job with a given per-stage execution. */
function forge(s: GameState, exec: number, head = 'loamiron', haft = 'marl', binding = 'ochre') {
  beginCraft(s, ctx, 'forge', { tier: 2, head, haft, binding });
  let last;
  for (let i = 0; i < ACT_STAGES.forge.length; i++) last = craftStage(s, mods, ctx, exec);
  return last!;
}

describe('crafting is a staged process', () => {
  it('a job runs stage by stage and produces the piece on the last', () => {
    const { s } = fresh();
    for (const id of ['loamiron', 'marl', 'ochre']) addMaterial(s, id, 60, 3);
    const begun = beginCraft(s, ctx, 'forge', { tier: 2, head: 'loamiron', haft: 'marl', binding: 'ochre' });
    expect(begun.ok).toBe(true);
    expect(s.workbench.job).not.toBeNull();
    // Two stages leave the job open; the third finishes it.
    craftStage(s, mods, ctx, 0.8);
    craftStage(s, mods, ctx, 0.8);
    expect(s.workbench.job).not.toBeNull();
    const done = craftStage(s, mods, ctx, 0.8);
    expect(done.ok).toBe(true);
    expect(s.workbench.job).toBeNull();
  });

  it('refuses to begin without the inputs, and only one job at a time', () => {
    const { s } = fresh();
    expect(beginCraft(s, ctx, 'forge', { tier: 2, head: 'loamiron', haft: 'marl', binding: 'ochre' }).ok).toBe(false);
    for (const id of ['loamiron', 'marl', 'ochre']) addMaterial(s, id, 60, 3);
    expect(beginCraft(s, ctx, 'forge', { tier: 2, head: 'loamiron', haft: 'marl', binding: 'ochre' }).ok).toBe(true);
    expect(beginCraft(s, ctx, 'carve', { target: 'tool', sequence: ['kel'] }).ok).toBe(false);
  });
});

describe('RULE 1 — traits change the process', () => {
  it('a brittle material is less forgiving and more fragile than a tough one', () => {
    const shape = ACT_STAGES.forge[1]!;
    const brittle = stageProfile(shape, ['brittle', 'light']);
    const tough = stageProfile(shape, ['tough', 'dense']);
    expect(brittle.forgiveness).toBeLessThan(tough.forgiveness);
    expect(brittle.fragility).toBeGreaterThan(tough.fragility);
    expect(brittle.note).toMatch(/brittle/);
  });

  it('a springy material fights back more than a plain one', () => {
    const shape = ACT_STAGES.forge[1]!;
    expect(stageProfile(shape, ['springy']).resistance).toBeGreaterThan(stageProfile(shape, []).resistance);
  });
});

describe('RULE 2 — quality is earned, not rolled', () => {
  it('better execution makes a better tool, deterministically', () => {
    const good = fresh();
    for (const id of ['loamiron', 'marl', 'ochre']) addMaterial(good.s, id, 60, 3);
    const g = forge(good.s, 0.95);
    const gTool = (g.data as { tool: { chipPower: number } }).tool.chipPower;

    const bad = fresh();
    for (const id of ['loamiron', 'marl', 'ochre']) addMaterial(bad.s, id, 60, 3);
    const b = forge(bad.s, 0.2);
    const bTool = (b.data as { tool: { chipPower: number } }).tool.chipPower;

    expect(gTool).toBeGreaterThan(bTool);
    // Same inputs, same execution → same result. No RNG.
    const again = fresh();
    for (const id of ['loamiron', 'marl', 'ochre']) addMaterial(again.s, id, 60, 3);
    const a2 = forge(again.s, 0.95);
    expect((a2.data as { tool: { chipPower: number } }).tool.chipPower).toBe(gTool);
  });

  it('craftsmanship stays in a bounded band — skill pays, never dominates', () => {
    expect(craftsmanship(0)).toBeCloseTo(0.88, 2);
    expect(craftsmanship(1)).toBeCloseTo(1.16, 2);
    // A botch is worse than delegating; a clean craft beats it — the incentive.
    expect(craftsmanship(0.2)).toBeLessThan(delegateCraftsmanship());
    expect(craftsmanship(0.95)).toBeGreaterThan(delegateCraftsmanship());
  });
});

function delegateCraftsmanship() {
  return craftsmanship(delegateQuality(0));
}

describe('RULE 3 — failure costs material, never the item', () => {
  it('abandoning a job consumes nothing', () => {
    const { s } = fresh();
    for (const id of ['loamiron', 'marl', 'ochre']) addMaterial(s, id, 60, 3);
    const before = materialCount(s, 'loamiron');
    beginCraft(s, ctx, 'forge', { tier: 2, head: 'loamiron', haft: 'marl', binding: 'ochre' });
    craftStage(s, mods, ctx, 0.5);
    abandonCraft(s, ctx);
    expect(materialCount(s, 'loamiron')).toBe(before); // nothing spent
    expect(s.workbench.job).toBeNull();
  });

  it('a botched carve consumes the runes and fouls the surface — tool untouched', () => {
    const { s } = fresh();
    s.runes.found['kel'] = 3;
    const toolCount = s.forge.tools.length;
    beginCraft(s, ctx, 'carve', { target: 'tool', sequence: ['kel', 'kel', null] });
    craftStage(s, mods, ctx, 0.1);
    const r = craftStage(s, mods, ctx, 0.1); // low quality → botch
    expect((r.data as { botched?: boolean }).botched).toBe(true);
    expect(s.runes.found['kel']).toBeLessThan(3); // runes spent
    expect(s.runes.fouled['tool']).toBe(true);
    expect(s.forge.tools.length).toBe(toolCount); // no tool lost
  });
});

describe('RULE 4 — delegate is safe, guaranteed, slightly worse, social', () => {
  it('delegating always succeeds at a baseline below a clean hand-craft', () => {
    const { s } = fresh();
    for (const id of ['loamiron', 'marl', 'ochre']) addMaterial(s, id, 60, 3);
    beginCraft(s, ctx, 'forge', { tier: 2, head: 'loamiron', haft: 'marl', binding: 'ochre' });
    const r = delegateCraft(s, mods, ctx);
    expect(r.ok).toBe(true);
    expect(s.workbench.job).toBeNull();
    // Delegated tools do not count toward YOUR practice.
    expect(s.workbench.done.forge).toBe(0);
  });

  it('a better relationship buys a better delegated result', () => {
    expect(delegateQuality(0)).toBeLessThan(delegateQuality(1));
    // Never a failure, never as good as perfect.
    expect(delegateQuality(0)).toBeGreaterThan(0.5);
    expect(delegateQuality(1)).toBeLessThan(1);
  });

  it('every act has a named NPC delegate', () => {
    for (const act of ['forge', 'carve', 'cut', 'cast'] as const) {
      expect(ACT_DELEGATE[act].length).toBeGreaterThan(2);
    }
  });
});

describe('CAST — runes from material traits (the trait-only act)', () => {
  it('a mix of the right traits casts a rune, discovered and recorded', () => {
    const { s } = fresh();
    // keen + trueseated → Kel. sablequartz is trueseated+keen; give a second keen.
    for (const id of ['sablequartz', 'truesilver']) addMaterial(s, id, 60, 2);
    beginCraft(s, ctx, 'cast', { inputs: ['sablequartz', 'truesilver'] });
    craftStage(s, mods, ctx, 0.9);
    const r = craftStage(s, mods, ctx, 0.9);
    const cast = r.data as { cast: string | null; rune?: string; isNew?: boolean };
    expect(cast.cast).not.toBeNull();
    expect((s.runes.found[cast.rune!] ?? 0)).toBeGreaterThan(0);
    expect(s.workbench.castsFound.length).toBeGreaterThan(0);
  });

  it('every cast recipe is reachable from real material traits', () => {
    for (const r of CAST_RECIPES) {
      const found = matchCast(r.needs);
      expect(found, `recipe ${r.id} not matched by its own needs`).toBeDefined();
    }
  });
});

describe('CUT — a gem cut reshapes how it reads', () => {
  it('a mining-lean cut lifts the mining face and shaves the fight face', () => {
    const cut = { lean: 'mine' as const, quality: 1 };
    expect(gemCutMult(cut, 'mine')).toBeGreaterThan(1);
    expect(gemCutMult(cut, 'fight')).toBeLessThan(1);
    // No cut = neutral.
    expect(gemCutMult(undefined, 'mine')).toBe(1);
  });

  it('cutting spends the gem but keeps the learned cut', () => {
    const { s } = fresh();
    s.materials.gems['bloodgarnet'] = 2;
    beginCraft(s, ctx, 'cut', { gemId: 'bloodgarnet', lean: 'mine' });
    craftStage(s, mods, ctx, 0.9);
    craftStage(s, mods, ctx, 0.9, { lean: 'mine' });
    expect(s.materials.gems['bloodgarnet']).toBe(1); // one spent
    expect(s.workbench.gemCuts['bloodgarnet']?.lean).toBe('mine');
  });
});
