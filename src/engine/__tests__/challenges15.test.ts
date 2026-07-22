/**
 * THE EIGHT NEW CHALLENGES — do their seals actually bite?
 *
 * A challenge declares laws; the engine's choke points honour them. Those are
 * two different things, and the gap between them is exactly the Phase 13
 * failure: content that is correct, registered, and enforced by nobody.
 *
 * So every seal added this phase gets a test that drives the real engine and
 * asserts the world CHANGED. Not that the flag reads true — that the rule
 * that flag is supposed to rewrite behaves differently.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { CHALLENGES, CHALLENGE_BY_ID } from '../content/shell7/challenges';
import { GRID_MODULES } from '../content/shell7/gridModules';
import { sealed, challengeNum } from '../laws';
import { weatherFor } from '../systems/weather';
import { ModifierCache } from '../modifiers';
import { cellRegen } from '../systems/face';
import { applyOfflineProgress } from '../systems/offline';
import { applyDrop } from '../systems/drops';

const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};
/** Put a challenge in force the way the Spiral does. */
const run = (s: GameState, id: string) => {
  s.spiral.activeChallenge = { id, startedAtPlaySec: 0 };
};

describe('the set is coherent', () => {
  it('sixteen challenges, sixteen modules, one reward each', () => {
    expect(CHALLENGES.length).toBe(16);
    expect(GRID_MODULES.length).toBe(16);
    const rewards = CHALLENGES.map((c) => c.reward);
    expect(new Set(rewards).size, 'two challenges award the same module').toBe(rewards.length);
    for (const c of CHALLENGES) {
      expect(GRID_MODULES.some((m) => m.id === c.reward), `${c.id} → ${c.reward}`).toBe(true);
    }
  });

  it('every new one is authored to the same standard as the originals', () => {
    for (const c of CHALLENGES) {
      expect(c.premise.length, c.id).toBeGreaterThan(80);
      expect(c.lesson.length, c.id).toBeGreaterThan(80);
      expect(c.rule.length, c.id).toBeGreaterThan(10);
      expect(c.goalText.length, c.id).toBeGreaterThan(5);
    }
  });

  it('orders are unique and contiguous', () => {
    const orders = CHALLENGES.map((c) => c.order).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: CHALLENGES.length }, (_, i) => i + 1));
  });

  it('every module synergy names a module that exists', () => {
    const ids = new Set(GRID_MODULES.map((m) => m.id));
    for (const m of GRID_MODULES) {
      for (const w of m.synergy?.with ?? []) {
        expect(ids.has(w), `module '${m.id}' synergises with unknown '${w}'`).toBe(true);
      }
    }
  });
});

describe('each new seal actually bites', () => {
  it('THE THIN SEAM stops drops', () => {
    const { engine, s } = fresh();
    run(s, 'thinSeam');
    expect(sealed(s, 'sealDrops')).toBe(true);
    const before = JSON.stringify(engine.getState().materials.stacks);
    // Chip hard: without the seal this reliably drops something.
    for (let i = 0; i < 400; i++) {
      for (let c = 0; c < s.face.w * s.face.h; c++) engine.dispatch({ type: 'chip', cell: c });
      engine.tick(1);
    }
    expect(JSON.stringify(engine.getState().materials.stacks)).toBe(before);
  });

  it('NO SECOND CHANCE refuses the Collapse', () => {
    const { engine, s } = fresh();
    run(s, 'noSecondChance');
    const res = engine.dispatch({ type: 'collapse' });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/does not fall/i);
  });

  it('THE LOUD DARK refuses the slip away', () => {
    const { engine, s } = fresh();
    run(s, 'loudDark');
    const res = engine.dispatch({ type: 'combatFlee' });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/no slipping away/i);
  });

  it('THE SHALLOW holds the stair', () => {
    const { engine, s } = fresh();
    run(s, 'theShallow');
    expect(challengeNum(s, 'depthCap', Infinity)).toBe(40);
    s.depth = 40;
    const res = engine.dispatch({ type: 'descend' });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/no deeper/i);
  });

  it('THE FLAT WORLD pins every shell to neutral', () => {
    const { s } = fresh();
    s.guild.discovered = true;
    // Find a segment where Ferrite is NOT neutral, then seal and re-read.
    let stormy = -1;
    for (let seg = 0; seg < 60; seg++) {
      s.guild.clockMs = seg * 50 * 60_000;
      if (!weatherFor(s, 'ferrite').neutral) { stormy = seg; break; }
    }
    expect(stormy, 'no non-neutral Ferrite weather in 60 segments').toBeGreaterThanOrEqual(0);
    run(s, 'flatWorld');
    expect(weatherFor(s, 'ferrite').neutral).toBe(true);
  });

  // NOTE: the first draft of this test called `engine.applyOffline?.(...)`,
  // which does not exist — the optional chain made it a no-op and the test
  // passed because nothing happened at all. It is the exact failure this phase
  // is about, so it now calls the real function AND asserts the unsealed case
  // pays, which is what makes the sealed case mean anything.
  it('THE UNLIT pays nothing for time away, where an open world pays', () => {
    const eightHours = 8 * 3600;
    const ctx = { emit: () => {}, dirty: () => {} };

    const open = fresh();
    const openMods = new ModifierCache();
    applyOfflineProgress(open.s, openMods, ctx, eightHours);
    const openPaid = open.s.currencies['dust']?.toNumber() ?? 0;
    expect(openPaid, 'an unsealed world must pay for time away, or this proves nothing').toBeGreaterThan(0);

    const dark = fresh();
    run(dark.s, 'theUnlit');
    const darkMods = new ModifierCache();
    applyOfflineProgress(dark.s, darkMods, ctx, eightHours);
    const darkPaid = dark.s.currencies['dust']?.toNumber() ?? 0;
    expect(darkPaid, `the sealed world paid ${darkPaid}`).toBe(0);
  });

  it('THE CROWDED FACE quarters the regen it hands you the width for', () => {
    const { s } = fresh();
    const mods = new ModifierCache();
    const open = cellRegen(s, mods);
    run(s, 'crowdedFace');
    mods.invalidate();
    const sealed = cellRegen(s, mods);
    expect(sealed).toBeCloseTo(open * 0.25, 6);
  });

  it('THE HONEST STONE lands every stone at zero purity', () => {
    const ctx = { emit: () => {}, dirty: () => {} };
    const drop = { kind: 'material' as const, materialId: 'marl', purity: 88 };

    // Unsealed first — otherwise "zero purity" could just mean "no material".
    const open = fresh();
    applyDrop(open.s, ctx, drop);
    const openBands = Object.keys(open.s.materials.stacks['marl'] ?? {});
    expect(openBands.length, 'the control drop must actually land').toBeGreaterThan(0);

    const honest = fresh();
    run(honest.s, 'honestStone');
    expect(sealed(honest.s, 'sealPurity')).toBe(true);
    applyDrop(honest.s, ctx, drop);
    const stack = honest.s.materials.stacks['marl'] ?? {};
    const bands = Object.entries(stack).filter(([, v]) => v !== undefined);
    expect(bands.length, 'the sealed drop must still land, just filthy').toBeGreaterThan(0);
    // Whatever band zero purity falls into, it is not the one 88 falls into.
    expect(Object.keys(stack)).not.toEqual(openBands);
  });
});

describe('a challenge never costs the player their real run', () => {
  it('every new challenge declares laws that the seal registry knows', () => {
    const known = new Set([
      'faceCells', 'heatRateMult', 'regenMult', 'depthCap', 'encounterMult', 'axiomCap',
      'sealWiden', 'sealKiln', 'sealHand', 'sealTools', 'sealRooms', 'sealGovernor',
      'sealSignatures', 'sharedBank', 'sealOffline', 'sealCollapse', 'sealDrops',
      'sealWeather', 'sealPurity', 'sealFlee',
    ]);
    for (const c of CHALLENGES) {
      for (const key of Object.keys(c.laws ?? {})) {
        expect(known.has(key), `challenge '${c.id}' declares unknown law '${key}'`).toBe(true);
      }
    }
  });

  it('no seal is in force with no challenge running', () => {
    const { s } = fresh();
    for (const seal of ['sealDrops', 'sealCollapse', 'sealOffline', 'sealWeather', 'sealPurity', 'sealFlee'] as const) {
      expect(sealed(s, seal), seal).toBe(false);
    }
    expect(challengeNum(s, 'depthCap', Infinity)).toBe(Infinity);
    expect(challengeNum(s, 'regenMult', 1)).toBe(1);
  });

  it('every challenge id resolves', () => {
    for (const c of CHALLENGES) expect(CHALLENGE_BY_ID.get(c.id)).toBe(c);
  });
});
