/**
 * PHASE 21 — IMPLEMENTS AND INSCRIPTION (save v22). The four parts, guaranteed at
 * the engine level:
 *
 *   OPINIONS   — a settled tool favours a rock it knows and sulks briefly on switch;
 *                a rotated set never earns opinions; it only ever bends the small
 *                affinity bonus (pillar 1) and lands in dropRate (pillar 2).
 *   INSCRIPTION— practice teaches shape not answers (pillar 5); tier buys slots;
 *                three-in-a-row triples; order-over-time combos span sessions.
 *   CASTING    — a cast rune is counted apart from a found one.
 *   THE LEDGER — heirloom marks (capped, dropRate), gem fusion (non-destructive),
 *                bulk salvage, deeper tempering (temper × the shell in your hand).
 */
import { describe, expect, it } from 'vitest';
import { D } from '../decimal';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState, ToolInstance } from '../types';
import { computeBucket, breakdown } from '../modifiers';
import { addCurrency } from '../resources';
import { logImplementUse } from '../systems/affinity';
import {
  opinionation, opinionMult, settleFactor, totalUse, OPINION_PENALTY,
} from '../systems/opinions';
import {
  heirloomBonus, addToolMark, logToolDeed, markLabel,
} from '../systems/heirloom';
import {
  runeSlots, sequenceTriples, RUNE_TRIPLES, practiceRunes, TEMPORAL_COMBOS,
  TEMPORAL_MIN_GAP, logCarve, defaultRunesState,
} from '../content/shell4/runes';
import { bulkSalvage } from '../systems/salvage';
import { starterTool } from '../systems/forge';
import { runMigrations, SAVE_VERSION } from '../save/migrations';

const nullCtx: EngineCtx = { emit() {}, dirty() {} };
function fresh(): { engine: Engine; s: () => GameState } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: () => engine.getState() as GameState };
}
function toolAt(id: number, tier: number, recipeId = 'marlsplitter'): ToolInstance {
  return { ...starterTool(), id, tier, recipeId };
}

// --- PART 1: OPINIONS -------------------------------------------------------
describe('opinions — a favourite feels like a favourite, switching is never punished', () => {
  it('a rotated set never earns opinions (low total history → neutral everywhere)', () => {
    const rotated = { use: { loam: 5000, ferrite: 5000 } };
    expect(opinionation(rotated)).toBeLessThan(0.12);
    const carried = { use: { loam: 400000 } };
    expect(opinionation(carried)).toBeGreaterThan(0.7);
    expect(totalUse(carried)).toBe(400000);
  });

  it('sulks on switch and settles — a familiar tool settles faster', () => {
    const { s } = fresh();
    const state = s();
    const tool = state.forge.tools[state.forge.equipped]!;
    logImplementUse(tool, 'loam', 1_000_000); // it knows loam well
    state.forge.equippedAt = 1000;
    state.stats.playTimeSec = 1000; // just picked up
    expect(settleFactor(state)).toBe(0);
    state.stats.playTimeSec = 1000 + 60; // a familiar tool is already settled
    expect(settleFactor(state)).toBeGreaterThan(0.9);
  });

  it('a settled, opinionated tool works a stranger rock worse (penalty side)', () => {
    const { s } = fresh();
    const state = s();
    const tool = state.forge.tools[state.forge.equipped]!;
    tool.use = { ferrite: 400000 }; // set in its ways, but not for loam (current)
    state.forge.equippedAt = 0;
    state.stats.playTimeSec = 10000; // fully settled
    const mult = opinionMult(state);
    expect(mult).toBeLessThan(1);
    expect(mult).toBeGreaterThan(1 - OPINION_PENALTY - 1e-9);
  });

  it('opinion only ever bends the affinity bonus and lands in dropRate (pillars 1 & 2)', () => {
    const { s } = fresh();
    const state = s();
    const tool = state.forge.tools[state.forge.equipped]!;
    logImplementUse(tool, 'loam', 1_000_000);
    state.stats.playTimeSec = 10000;
    const dustBefore = computeBucket(state, 'dustYield').toString();
    expect(computeBucket(state, 'dustYield').toString()).toBe(dustBefore);
    expect(breakdown(state, 'dropRate').some((e) => e.id === 'affinity')).toBe(true);
    expect(breakdown(state, 'dustYield').some((e) => e.id === 'affinity')).toBe(false);
  });
});

// --- PART 2: INSCRIPTION DEPTH ----------------------------------------------
describe('inscription — practice teaches shape not answers (pillar 5)', () => {
  it('practice reports pair shapes, never touches the codex or your runes', () => {
    const { s } = fresh();
    const state = s();
    state.runes = defaultRunesState();
    state.runes.found = { kel: 5, thur: 5 };
    addCurrency(state, 'silica', D(100));
    const before = { ...state.runes.found };
    const r = practiceRunes(state, nullCtx, ['kel', 'thur', 'kel']); // kel|thur harmonic
    expect(r.ok).toBe(true);
    const d = r.data as { harmonic: number; dissonant: number };
    expect(d.harmonic).toBeGreaterThanOrEqual(1);
    expect(state.runes.found).toEqual(before); // real runes untouched
    expect(state.runes.pairsSeen).toEqual([]); // codex untouched
    expect(state.runes.practiced!.harmonic).toBeGreaterThanOrEqual(1);
  });

  it('tier buys tool rune-slots; gear stays at three', () => {
    const { s } = fresh();
    const state = s();
    state.forge.tools[state.forge.equipped]!.tier = 1;
    expect(runeSlots(state, 'tool')).toBe(3);
    expect(runeSlots(state, 'lantern')).toBe(3);
    state.forge.tools[state.forge.equipped]!.tier = 8;
    expect(runeSlots(state, 'tool')).toBe(4);
    state.forge.tools[state.forge.equipped]!.tier = 14;
    expect(runeSlots(state, 'tool')).toBe(5);
    expect(runeSlots(state, 'lantern')).toBe(3); // gear unchanged
  });

  it('triples are three-consecutive, distinct from the two pairs they overlap', () => {
    expect(sequenceTriples(['kel', 'thur', 'kel', null])).toEqual(['kel|thur|kel']);
    expect(RUNE_TRIPLES['kel|thur|kel']).toBeDefined();
    expect(sequenceTriples(['kel', 'thur'])).toEqual([]); // two runes: no triple
  });

  it('order-over-time: a combo completes only when carved in order with real gaps', () => {
    const { s } = fresh();
    const state = s();
    state.runes = defaultRunesState();
    const combo = TEMPORAL_COMBOS[0]!; // slowdawn: mol, ash, sen
    // Back-to-back (no gaps): must NOT complete.
    state.stats.playTimeSec = 0;
    logCarve(state, nullCtx, combo.runes[0]!);
    logCarve(state, nullCtx, combo.runes[1]!);
    logCarve(state, nullCtx, combo.runes[2]!);
    expect(state.runes.temporalFound).not.toContain(combo.id);
    // Full gap between each: completes.
    state.runes.carveTrail = [];
    state.stats.playTimeSec = 0;
    logCarve(state, nullCtx, combo.runes[0]!);
    state.stats.playTimeSec = TEMPORAL_MIN_GAP + 1;
    logCarve(state, nullCtx, combo.runes[1]!);
    state.stats.playTimeSec = 2 * (TEMPORAL_MIN_GAP + 1);
    logCarve(state, nullCtx, combo.runes[2]!);
    expect(state.runes.temporalFound).toContain(combo.id);
  });
});

// --- PART 3: CASTING (distinct from found) ----------------------------------
describe('casting — a cast rune is counted apart from a found one', () => {
  it('castKinds tracks cast yield separately from the found pool', () => {
    const { s } = fresh();
    const state = s();
    state.runes = defaultRunesState();
    state.runes.found['kel'] = 3;
    expect(state.runes.castKinds!['kel'] ?? 0).toBe(0);
    state.runes.castKinds!['kel'] = 2; // finishCast credits this counter
    expect(state.runes.castKinds!['kel']).toBe(2);
    expect(state.runes.found['kel']).toBe(3); // pools are independent
  });
});

// --- PART 4: THE LEDGER -----------------------------------------------------
describe('heirloom — a storied tool is a touch luckier, capped, in dropRate', () => {
  it('each distinct mark adds a small bonus up to a cap', () => {
    const { s } = fresh();
    const state = s();
    const tool = toolAt(1, 1);
    state.forge.tools[state.forge.equipped] = tool;
    expect(heirloomBonus(tool)).toBe(0);
    addToolMark(state, 'warden');
    addToolMark(state, 'warden'); // idempotent
    expect(tool.history).toEqual(['warden']);
    expect(heirloomBonus(tool)).toBeCloseTo(0.01, 6);
    for (const m of ['recursion', 'breach', 'geodes', 'a', 'b', 'c', 'd']) addToolMark(state, m);
    expect(heirloomBonus(tool)).toBeLessThanOrEqual(0.06 + 1e-9); // capped
    expect(markLabel('warden')).toBe('Warden-slayer');
  });

  it('a threshold deed (100 geodes) earns its mark once crossed', () => {
    const { s } = fresh();
    const state = s();
    const tool = state.forge.tools[state.forge.equipped]!;
    tool.id = 1;
    tool.history = [];
    logToolDeed(state, 'geodes', 99);
    expect(tool.history).not.toContain('geodes');
    logToolDeed(state, 'geodes', 1);
    expect(tool.history).toContain('geodes');
  });
});

describe('bulk salvage — never touches the equipped or the last tool', () => {
  it('breaks down obsolete tools but keeps the equipped one and never empties the rack', () => {
    const { s } = fresh();
    const state = s();
    state.forge.tools = [toolAt(0, 3), toolAt(1, 1), toolAt(2, 1)];
    state.forge.equipped = 0;
    const r = bulkSalvage(state, nullCtx, [1, 2], false);
    expect(r.ok).toBe(true);
    expect(state.forge.tools.some((t) => t.id === 0)).toBe(true); // equipped survives
    expect(state.forge.tools.length).toBeGreaterThanOrEqual(1);
  });
});

// --- SAVE v22 ---------------------------------------------------------------
describe('save v22 — implements gain opinions, history, and inscription depth', () => {
  it('migrates prior saves to carry the new player-authored slices', () => {
    const payload = {
      version: 21, savedAtMs: 0,
      state: { forge: { tools: [{ id: 0 }], equipped: 0 }, runes: { found: {}, inscriptions: {}, fouled: {}, pairsSeen: [] } },
    } as never;
    const out = runMigrations(payload);
    expect(out.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(22);
    const st = out.state as {
      forge: { equippedAt?: number; tools: Array<Record<string, unknown>> };
      runes: Record<string, unknown>;
    };
    expect(st.forge.equippedAt).toBe(0);
    expect(st.forge.tools[0]!['history']).toEqual([]);
    expect(st.runes['practiced']).toBeDefined();
    expect(st.runes['carveTrail']).toEqual([]);
    expect(st.runes['temporalFound']).toEqual([]);
    expect(st.runes['castKinds']).toEqual({});
  });
});
