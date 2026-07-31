/**
 * BALANCE AND INSTABILITY, GIVEN TEETH.
 *
 * Both shipped as stats with no reason to engage: balance traded reach against
 * cadence and converged, and instability was measured against a FIXED floor of
 * 40 that a mid-game tool could not reach. These tests pin what makes each one
 * a decision rather than a readout.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '..';
import type { GameState } from '../types';
import { allShells } from '../shells';
import { materialsOfShell } from '../materials';
import { PART_TYPES } from '../content/forgeParts';
import { balanceOf, makePart } from '../systems/forgeParts';
import { currentTool } from '../systems/casting';
import { BARE_HANDS, effectOf, toolEffect, xpForLevel } from '../systems/toolMining';
import {
  MOD_LEVEL_MAX, MOD_SHELL_ORDINAL, TOOL_MODS, modXpForLevel,
} from '../content/toolMods';
import { instabilityFloor, modSlotsTotal, toolInstability } from '../systems/toolMods';

let engine: ReturnType<typeof createEngine>;
const st = (): GameState => engine.getState() as GameState;

function hold(mat: string, level = 1): void {
  const s = st();
  s.forge.built = true;
  for (const sh of allShells()) s.depthRecords[sh.id] = 60;
  s.casting.tool = PART_TYPES.map((t, i) => ({ ...makePart(t, mat, 60), id: i + 1 }));
  s.casting.wear = 0;
  s.casting.mods = [];
  s.casting.xp = xpForLevel(level);
}

/** The heaviest and lightest stones the real registry actually offers. */
function extremes(): { heavy: string; light: string } {
  let heavy = '', light = '', hv = -Infinity, lv = Infinity;
  for (const sh of allShells()) {
    for (const m of materialsOfShell(sh.id)) {
      const v = balanceOf(PART_TYPES.map((t) => makePart(t, m.id, 60))).value;
      if (v > hv) { hv = v; heavy = m.id; }
      if (v < lv) { lv = v; light = m.id; }
    }
  }
  return { heavy, light };
}

beforeEach(() => { engine = createEngine({ nowMs: 0 }); });

// ---------------------------------------------------------------------------
// BALANCE IS A JOB
// ---------------------------------------------------------------------------

describe('balance says which cell the tool is for', () => {
  it('heavy is an ORE tool and light is a ROCK tool', () => {
    const { heavy, light } = extremes();
    const h = balanceOf(PART_TYPES.map((t) => makePart(t, heavy, 60)));
    const l = balanceOf(PART_TYPES.map((t) => makePart(t, light, 60)));
    expect(h.job).toBe('ore');
    expect(l.job).toBe('rock');
    expect(h.oreRate).toBeGreaterThan(l.oreRate);
    expect(l.cells).toBeGreaterThan(h.cells);
  });

  it('an EVEN tool is for neither, and is untouched by all of it', () => {
    // The no-nerf guarantee: inside the deadzone every term is the identity.
    let evenMat = '';
    for (const sh of allShells()) {
      for (const m of materialsOfShell(sh.id)) {
        if (balanceOf(PART_TYPES.map((t) => makePart(t, m.id, 60))).value === 0) { evenMat = m.id; break; }
      }
      if (evenMat) break;
    }
    expect(evenMat, 'no even stone in the whole registry').not.toBe('');
    const b = balanceOf(PART_TYPES.map((t) => makePart(t, evenMat, 60)));
    expect(b.job).toBe('either');
    expect(b.oreRate).toBe(1);
    expect(b.cells).toBe(1);
    expect(b.splash).toBe(1);
  });

  it('NEITHER side is ever worse than bare hands at the other\'s job', () => {
    /**
     * THE GUARANTEE A TEST CAUGHT ME BREAKING. Two-sided ore work made a light
     * tool dig pockets SLOWER than the hands — and marl, the starter stone,
     * reads -0.90 balance, so the very first tool would have been a downgrade at
     * the first pocket it met. Ore is heavy-only for that reason.
     */
    for (const sh of allShells()) {
      for (const m of materialsOfShell(sh.id)) {
        hold(m.id);
        const e = toolEffect(st());
        expect(e.oreRate, `${m.id} digs slower than hands`).toBeGreaterThanOrEqual(BARE_HANDS.oreRate);
        expect(e.cells, `${m.id} reaches less than hands`).toBeGreaterThanOrEqual(BARE_HANDS.cells);
      }
    }
  });

  it('and the ore edge is real on the live path, not just in the fold', () => {
    const { heavy, light } = extremes();
    const dug = (mat: string): number => {
      engine = createEngine({ nowMs: 0 });
      hold(mat);
      const s = st();
      s.face.ore = new Array(s.face.cells.length).fill('');
      s.face.oreDug = new Array(s.face.cells.length).fill(0);
      s.face.ore[5] = 'fatseam';
      engine.dispatch({ type: 'workOre', cell: 5, seconds: 0.05 });
      return (engine.getState() as GameState).face.oreDug![5]!;
    };
    expect(dug(heavy)).toBeGreaterThan(dug(light));
  });

  it('and pillar 2 is untouched — no balance term multiplies charge', () => {
    // Every term balance moves is reach, per-cell take, ore speed, wear or
    // meter. A swing still takes only what the cells were holding.
    const { heavy, light } = extremes();
    for (const mat of [heavy, light]) {
      hold(mat);
      const e = effectOf(currentTool(st()), false, 1);
      expect(e.splash).toBeLessThanOrEqual(1);
      expect(e.cells).toBeLessThanOrEqual(9);
    }
  });
});

// ---------------------------------------------------------------------------
// INSTABILITY IS THE PRICE OF POWER
// ---------------------------------------------------------------------------

describe('instability is the price of power', () => {
  /** Fill a tool's budget from the strongest end or the cheapest. */
  function pack(from: 'power' | 'cheap', reserve = 0): void {
    const s = st();
    const budget = modSlotsTotal(s) - reserve;
    const pool = [...TOOL_MODS]
      .filter((m) => !m.classOnly && (MOD_SHELL_ORDINAL[m.shell] ?? 7) <= 7)
      .sort((a, b) => (from === 'power' ? b.cost - a.cost : a.cost - b.cost));
    const mods: Array<{ id: string; n: number; xp: number }> = [];
    let used = 0;
    for (const m of pool) {
      while (used + m.cost <= budget && (mods.find((x) => x.id === m.id)?.n ?? 0) < m.maxStacks) {
        const at = mods.find((x) => x.id === m.id);
        if (at) at.n += 1;
        else mods.push({ id: m.id, n: 1, xp: modXpForLevel(MOD_LEVEL_MAX) });
        used += m.cost;
      }
    }
    s.casting.mods = mods;
    s.casting.knownMods = mods.map((m) => m.id);
  }

  it('a tool carrying nothing never misfires, at any depth', () => {
    for (const sh of allShells()) {
      hold(materialsOfShell(sh.id)[0]!.id, 60);
      expect(toolInstability(st()).misfire, `${sh.id} misfires while empty`).toBe(0);
    }
  });

  it('THE FLOOR SCALES WITH THE TOOL — which is what made it reachable', () => {
    /**
     * MEASURED BEFORE THE CHANGE: a level-40 tool packed with everything that
     * fits read raw 18 against a fixed floor of 40, so its net was zero and
     * always had been. Instability only ever bit on a 61-slot level-200 tool.
     * `raw` is bounded by the slot BUDGET, and the budget grows all game while
     * the floor sat still — so the floor grows with it now.
     */
    hold('marl', 5);
    const small = instabilityFloor(st());
    hold('marl', 80);
    const big = instabilityFloor(st());
    expect(big).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(0);
  });

  it('packing a tool with POWER drives it up; packing it cheap does not', () => {
    hold('marl', 60);
    pack('cheap');
    const cheap = toolInstability(st());
    hold('marl', 60);
    pack('power');
    const power = toolInstability(st());
    expect(power.raw).toBeGreaterThan(cheap.raw);
    expect(power.misfire).toBeGreaterThan(cheap.misfire);
    expect(power.misfire, 'an OP build should actually cost something').toBeGreaterThan(0.05);
  });

  it('and a stabiliser buys it back, for slots you wanted for power', () => {
    const stab = TOOL_MODS.find((m) => (m.fx.stabilize ?? 0) > 0);
    expect(stab).toBeDefined();
    hold('marl', 60);
    pack('power');
    const before = toolInstability(st());
    expect(before.misfire).toBeGreaterThan(0);

    hold('marl', 60);
    pack('power', stab!.cost * 2);
    const s = st();
    s.casting.mods!.push({ id: stab!.id, n: 2, xp: modXpForLevel(MOD_LEVEL_MAX) });
    s.casting.knownMods!.push(stab!.id);
    const after = toolInstability(s);

    expect(after.steady).toBeGreaterThan(before.steady);
    expect(after.misfire).toBeLessThan(before.misfire);
  });

  it('and none of it touches the swing — an unstable tool mines identically', () => {
    // Instability is reliability, never power. The one guarantee that keeps it
    // off the pillar-2 ledger entirely.
    hold('marl', 60);
    const calm = effectOf(currentTool(st()), false, 60);
    pack('power');
    const wild = toolInstability(st());
    expect(wild.misfire).toBeGreaterThan(0);
    const shaky = effectOf(currentTool(st()), false, 60);
    expect(shaky.cells).toBe(calm.cells);
    expect(shaky.splash).toBe(calm.splash);
    expect(shaky.oreRate).toBe(calm.oreRate);
  });
});
