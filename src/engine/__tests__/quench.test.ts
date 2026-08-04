/**
 * THE QUENCH TANK — treating a PART (§13), and the answer to item 11.
 *
 * §0 is the measurement A.84 asked for and nobody re-ran: is the quench trough
 * still Ferrite-era furniture wanting Cinder and Verdance stock? The other
 * blocks are the machine.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createEngine } from '../index';
import { ensureContentLoaded } from '../content';
import { ModifierCache } from '../modifiers';
import { markReached } from '../systems/roll';
import { MAX_MACHINE_TIER, ensurePlant, tierOf } from '../systems/plant';
import { ensureCondition } from '../systems/condition';
import { addMaterial, materialCount } from '../systems/forge';
import { CHAINS } from '../systems/refinery';
import { ASH_COST, TEMPERS, TEMPER_BY_ID } from '../systems/tempering';
import {
  STEADY_PER_QUENCH, TIER_CAPABILITY_QUENCH, buildQuenchTank, forgets, mediaFor,
  mediumTakes, quenchBlocker, quenchBuilt, quenchFound, quenchPart, quenchStation,
  reachableParts, takesSeated,
} from '../systems/quench';
import { instability } from '../systems/toolMods';
import { pairClass } from '../systems/reaction';
import { dpsMax } from '../systems/face';
import { PART_TYPES } from '../content/forgeParts';
import { makePart } from '../systems/forgeParts';
import { allShells } from '../shells';
import { materialDef } from '../materials';
import { registerInfusedForm, resultOf } from '../systems/infuser';
import { PYRE_BATH } from '../content/reductions';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx = (): EngineCtx => ({ dirty: () => {}, emit: () => {} }) as unknown as EngineCtx;

const ORDER = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph'];

function atTheTank(tier = 1): GameState {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  s.forge.built = true;
  s.shell.current = 'cinder';
  for (const shell of allShells()) s.depthRecords[shell.id] = 500;
  const at = quenchStation()!;
  markReached(s, at.depth, 15);
  ensurePlant(s).tiers['quench'] = tier;
  ensureCondition(s);
  addMaterial(s, 'temperash', 60, 40);
  for (const t of TEMPERS) if (t.mediumCost > 0) addMaterial(s, t.medium, 60, 20);
  return s;
}

/** A tool with seven real parts, so `instability` has something to read. */
function withTool(s: GameState, material = 'marl'): void {
  s.casting.tool = PART_TYPES.map((t, i) => ({ ...makePart(t, material, 60), id: i + 1 })) as never;
  s.casting.wear = 0;
  s.casting.rack = [];
}

describe('§0 — ITEM 11: does the trough still want stock nobody has?', () => {
  it('A.84 was right about five of six — and `sap` wants only the common ash', () => {
    const free = TEMPERS.filter((t) => t.mediumCost === 0);
    expect(free.map((t) => t.id)).toEqual(['sap']);
    // The other five each want a material from a specific shell.
    for (const t of TEMPERS) {
      if (t.mediumCost === 0) continue;
      expect(() => materialDef(t.medium), `${t.id}'s medium is real`).not.toThrow();
    }
  });

  it('and TEMPER ASH is reachable in LOAM now, which is what A.84 changed', () => {
    // `risingAsh` (gravemote + ochre) was authored at A.84 precisely because
    // every other temperash route wanted Hollow, Cinder or Verdance stock —
    // the quench trough opened on nothing. Both its inputs are Loam's.
    const ash = CHAINS.filter((c) => c.out === 'temperash');
    expect(ash.length).toBeGreaterThan(0);
    const shallow = ash.filter((c) => [c.a, c.b].every((i) => ORDER.indexOf(materialDef(i).shellId) === 0));
    expect(shallow.map((c) => c.id)).toContain('risingAsh');
  });

  it('so the tank opens on something: at least one medium takes a LOAM part', () => {
    const loam = ['marl', 'ochre', 'bonechalk', 'graveclay', 'loamiron'];
    const reachable = loam.filter((m) => mediaFor(m).length > 0);
    expect(reachable.length, 'no Loam stone can be quenched in anything').toBeGreaterThan(0);
  });
});

describe('§1 — the wreck, and the machine', () => {
  it('The Slake is a Cinder station, and it buries nothing', () => {
    const at = quenchStation()!;
    expect(at.shellId).toBe('cinder');
    expect(at.name).toBe('The Slake');
    expect(at.depth).toBe(96);
  });

  it('found by walking in, built from cast parts, never bought', () => {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    s.shell.current = 'cinder';
    expect(quenchFound(s)).toBe(false);
    expect(buildQuenchTank(s, ctx()).ok).toBe(false);
    markReached(s, quenchStation()!.depth, 15);
    expect(quenchFound(s)).toBe(true);
    expect(quenchBuilt(s)).toBe(false);
    s.casting.rack = PART_TYPES.slice(0, 6).map((t, i) => ({ ...makePart(t, 'marl', 40), id: i + 1 })) as never;
    expect(buildQuenchTank(s, ctx()).ok).toBe(true);
    expect(tierOf(s, 'quench')).toBe(1);
    expect(s.plant!.builtOf!['quench']).toBeDefined();
  });
});

describe('§2 — a medium only takes what it has something in common with', () => {
  it('and it is the SAME rule the Reaction Bench runs on', () => {
    for (const t of TEMPERS) {
      // ...with ONE exception, and it is the whole of the Retort's tier III:
      // §17's Pyre-bath refuses no part (A.95). Asserted below rather than
      // quietly skipped.
      if (t.medium === PYRE_BATH) continue;
      for (const m of ['marl', 'ochre', 'loamiron', 'bonechalk']) {
        expect(mediumTakes(t.id, m)).toBe(pairClass(t.medium, m) === 'shares');
      }
    }
  });

  it('THE PYRE-BATH IS THE EXCEPTION, and it is the only one', () => {
    const pyre = TEMPERS.find((t) => t.medium === PYRE_BATH)!;
    for (const m of ['marl', 'ochre', 'loamiron', 'bonechalk', 'voidstar', 'axiomdust']) {
      expect(mediumTakes(pyre.id, m), `the Pyre-bath refused ${m}`).toBe(true);
      // ...and it is genuinely an exception: most of these share nothing with it.
    }
    const shares = ['marl', 'ochre', 'loamiron', 'bonechalk']
      .filter((m) => pairClass(PYRE_BATH, m) === 'shares');
    expect(shares.length, 'the Pyre-bath shares a trait with everything anyway').toBeLessThan(4);
  });

  it('a medium with nothing in common is refused BY NAME, and offered nowhere', () => {
    const s = atTheTank(1);
    withTool(s);
    s.casting.rack = [{ ...makePart('head', 'marl', 60), id: 99 }] as never;
    const refuses = TEMPERS.filter((t) => !mediumTakes(t.id, 'marl'));
    expect(refuses.length, 'every medium takes marl — nothing to test').toBeGreaterThan(0);
    const b = quenchBlocker(s, 99, refuses[0]!.id);
    expect(b).toMatch(/nothing in common/);
    expect(mediaFor('marl').map((t) => t.id)).not.toContain(refuses[0]!.id);
  });
});

describe('§3 — the three tiers are three different sentences', () => {
  let s: GameState;
  beforeEach(() => { s = atTheTank(1); withTool(s); });

  it('I takes a part off the RACK, and refuses a seated one by name', () => {
    const seatedId = (s.casting.tool as never as Array<{ id: number }>)[0]!.id;
    expect(takesSeated(s)).toBe(false);
    expect(reachableParts(s).map((p) => p.where)).not.toContain('tool');
    expect(quenchBlocker(s, seatedId, mediaFor('marl')[0]!.id)).toMatch(/only takes a part off the rack/);
    s.casting.rack = [{ ...makePart('head', 'marl', 60), id: 99 }] as never;
    expect(quenchBlocker(s, 99, mediaFor('marl')[0]!.id)).toBeNull();
  });

  it('II takes a SEATED part, without breaking the tool down', () => {
    ensurePlant(s).tiers['quench'] = 2;
    const seatedId = (s.casting.tool as never as Array<{ id: number }>)[0]!.id;
    expect(takesSeated(s)).toBe(true);
    expect(quenchBlocker(s, seatedId, mediaFor('marl')[0]!.id)).toBeNull();
    expect(quenchPart(s, ctx(), seatedId, mediaFor('marl')[0]!.id).ok).toBe(true);
    expect(s.casting.tool.length, 'the tool survived').toBe(PART_TYPES.length);
  });

  it('III is the only one that FORGETS — §19\'s Hollow row', () => {
    ensurePlant(s).tiers['quench'] = 2;
    expect(forgets(s)).toBe(false);
    ensurePlant(s).tiers['quench'] = 3;
    expect(forgets(s)).toBe(true);
    expect(TIER_CAPABILITY_QUENCH).toHaveLength(MAX_MACHINE_TIER + 1);
    expect(new Set(TIER_CAPABILITY_QUENCH.slice(1)).size).toBe(3);
  });

  it('the medium and the ash are both spent', () => {
    ensurePlant(s).tiers['quench'] = 2;
    const medium = mediaFor('marl').find((t) => t.mediumCost > 0)!;
    const ashBefore = materialCount(s, 'temperash');
    const medBefore = materialCount(s, medium.medium);
    const seatedId = (s.casting.tool as never as Array<{ id: number }>)[0]!.id;
    expect(quenchPart(s, ctx(), seatedId, medium.id).ok).toBe(true);
    expect(materialCount(s, 'temperash')).toBe(ashBefore - ASH_COST);
    expect(materialCount(s, medium.medium)).toBe(medBefore - medium.mediumCost);
  });
});

describe('§4 — what a quenched part does to the tool', () => {
  it('it steadies it, by exactly the constant, per part', () => {
    const s = atTheTank(2);
    withTool(s);
    const before = instability(s).steady;
    const parts = s.casting.tool as never as Array<{ id: number }>;
    const m = mediaFor('marl')[0]!.id;
    expect(quenchPart(s, ctx(), parts[0]!.id, m).ok).toBe(true);
    expect(instability(s).steady).toBeCloseTo(before + STEADY_PER_QUENCH, 6);
    expect(quenchPart(s, ctx(), parts[1]!.id, m).ok).toBe(true);
    expect(instability(s).steady).toBeCloseTo(before + 2 * STEADY_PER_QUENCH, 6);
  });

  /**
   * THE INTERLOCK WITH A.92. An over-filled stone SHAKES — that is the price
   * §14.1 attaches to the Infuser, and §19 says a quench is what pays it off.
   * A tier-II tank takes SOME of it off; only a tier-III tank clears it.
   */
  it('a tier-III quench makes an over-filled part forget what was put in it', () => {
    const s = atTheTank(2);
    // A stone with a trait that was put there — the Infuser's own naming.
    registerInfusedForm('marl', 'warm');
    const infused = resultOf('marl', 'warm');
    withTool(s, 'marl');
    const parts = s.casting.tool as never as Array<{ id: number; materialId: string }>;
    parts[0]!.materialId = infused;
    const shaken = instability(s).raw;
    withTool(s, 'marl');
    const plain = instability(s).raw;
    expect(shaken, 'the over-filled stone did not shake at all').toBeGreaterThan(plain);

    // Put it back, quench it at tier II: steadier, but still shaking for it.
    const p2 = s.casting.tool as never as Array<{ id: number; materialId: string }>;
    p2[0]!.materialId = infused;
    expect(quenchPart(s, ctx(), p2[0]!.id, mediaFor(infused)[0]!.id).ok).toBe(true);
    expect(instability(s).raw, 'tier II forgot something it should not have').toBe(shaken);

    // Tier III: the raw shake from that part is gone.
    ensurePlant(s).tiers['quench'] = 3;
    expect(instability(s).raw).toBe(plain);
  });
});

describe('§5 — pillar 2', () => {
  it('a tank full of quenched parts cannot make charge', () => {
    const s = atTheTank(3);
    withTool(s);
    const mods = new ModifierCache();
    const before = dpsMax(s, mods).toNumber();
    const parts = s.casting.tool as never as Array<{ id: number }>;
    for (const p of parts) {
      const media = mediaFor('marl');
      if (media.length === 0) continue;
      quenchPart(s, ctx(), p.id, media[0]!.id);
    }
    mods.invalidate();
    expect(dpsMax(s, mods).toNumber()).toBe(before);
  });

  it('and a quench is not a stat — it never reaches `derivePart`', () => {
    const s = atTheTank(3);
    withTool(s);
    const parts = s.casting.tool as never as Array<{ id: number }>;
    const mods = new ModifierCache();
    void mods;
    const statsBefore = JSON.stringify(s.casting.tool.map((p) => ({ ...p, quench: undefined })));
    quenchPart(s, ctx(), parts[0]!.id, mediaFor('marl')[0]!.id);
    const statsAfter = JSON.stringify(s.casting.tool.map((p) => ({ ...p, quench: undefined })));
    expect(statsAfter).toBe(statsBefore);
    expect(TEMPER_BY_ID.get(s.casting.tool[0]!.quench!)).toBeDefined();
  });
});
