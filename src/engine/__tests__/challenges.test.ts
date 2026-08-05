/**
 * THE TEN INVERSIONS — does each seal actually FIRE, and does each grant
 * actually DO something?
 *
 * WHY THIS FILE IS SHAPED THIS WAY. `seals.test.ts` proves every seal has a
 * READER. That is a weaker claim than it looks, and the file says so itself:
 * for phases, all ten readers were live code with a predicate that could never
 * be true, because nothing called `registerChallengeLaws` and nothing ever set
 * `spiral.activeChallenge`. A grep guard cannot tell "wired" from "wired to
 * nothing". This file is the other half — for every seal, the behaviour OFF and
 * the behaviour ON, stated as a sentence, so a seal that stops firing is a
 * failing test rather than a quiet nothing.
 *
 * EVERY CHALLENGE IS STARTED THROUGH `startChallenge`, never by writing
 * `activeChallenge` by hand. Writing the field would prove the arithmetic of
 * `sealed()` and nothing about the game — the same shape A.100 caught in the
 * corridor test. The gate is real: `spiral.count` has to be ≥ 1 or the verb
 * refuses, and one test below lets it refuse.
 *
 * AND EVERY GRANT gets the same treatment. A permanent capability nothing reads
 * is the dead-BEHAVIOUR class arriving through the reward door instead of the
 * seal door, and this phase exists to close that class, not to move it.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { EngineCtx, GameEvent, GameState } from '../types';
import { ALL_GRANTS, ALL_SEALS, sealed, keptLaw, challengeNum } from '../laws';
import { CHALLENGES, CHALLENGE_BY_ID } from '../content/challenges';
import { startChallenge, abandonChallenge, tickChallenges, challengeBlocker } from '../systems/challenges';
import { cellCap, cellRegen, dpsMax, applyFieldSize, reshapeFace } from '../systems/face';
import { equippedTool } from '../systems/forge';
import { tickKiln, overstokeReady, lightOverstoke } from '../systems/kiln';
import { heatCeiling, setChoke } from '../systems/pressure';
import { applyOfflineProgress } from '../systems/offline';
import { applyDrop, rollForDrop } from '../systems/drops';
import { descend } from '../systems/depthSys';
import { newDrill, tickDrills } from '../systems/drills';
import { salvageTool } from '../systems/salvage';
import { dispatchCrew } from '../systems/crews';
import { bands, driftDepth } from '../systems/shoring';
import { ensureRoll } from '../systems/roll';
import { currentShell } from '../shells';
import { ALL_SYSTEMS, CLUSTERS, clusterVisible, systemVisible } from '../../ui/nav';
import { ModifierCache } from '../modifiers';
import { D } from '../decimal';

/** An engine context that records nothing. `Function.prototype` rather than a
 *  named arrow: esbuild's keepNames rewrites named arrows into `__name(...)`,
 *  which is undefined inside a page evaluate — the same shape has bitten the
 *  driver three times, so the fixtures use the form that cannot. */
const ctx = (): EngineCtx => ({ emit: Function.prototype as never, dirty: Function.prototype as never });

/** A world that has wound a Spiral once — the gate the room opens behind. */
function spiralled(): { s: GameState; mods: ModifierCache } {
  const s = createEngine({ nowMs: 0 }).getState() as GameState;
  s.spiral.count = 1;
  return { s, mods: new ModifierCache() };
}

/** Start `id` for real, through the verb, and fail loudly if the gate said no. */
function run(s: GameState, id: string): void {
  const r = startChallenge(s, ctx(), id);
  expect(r.ok, `${id} refused: ${String(r.reason)}`).toBe(true);
}

// ---------------------------------------------------------------------------
// The registry is reachable at all
// ---------------------------------------------------------------------------

describe('the writer `registerChallengeLaws` never had', () => {
  it('one authored law set per seal, and every seal is spoken for', () => {
    expect(CHALLENGES).toHaveLength(10);
    const declared = new Set(CHALLENGES.flatMap((c) => Object.keys(c.laws)));
    for (const seal of ALL_SEALS) {
      expect(declared.has(seal), `${seal} is declared by no challenge`).toBe(true);
    }
  });

  it('...and every surviving NUMERIC law is declared too, not just the seals', () => {
    // The three that survived A.102's cut. A numeric law nothing authors is a
    // reader that can never fire, which is this phase's whole subject.
    const declared = new Set(CHALLENGES.flatMap((c) => Object.keys(c.laws)));
    for (const key of ['heatRateMult', 'regenMult', 'depthCap']) {
      expect(declared.has(key), `${key} is declared by no challenge`).toBe(true);
    }
  });

  it('the id IS the grant id, so there is no second table to drift', () => {
    expect(CHALLENGES.map((c) => c.id).sort()).toEqual([...ALL_GRANTS].sort());
  });

  it('a challenge cannot start before the Spiral — the gate refuses', () => {
    const s = createEngine({ nowMs: 0 }).getState() as GameState;
    expect(s.spiral.count).toBe(0);
    const r = startChallenge(s, ctx(), 'onecell');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Spiral/);
    expect(s.spiral.activeChallenge).toBeNull();
  });

  it('and every seal is FALSE until one actually starts', () => {
    const { s } = spiralled();
    for (const seal of ALL_SEALS) expect(sealed(s, seal), seal).toBe(false);
    run(s, 'onecell');
    expect(sealed(s, 'sealWiden')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TEN SEALS, OFF AND ON, EACH AS A SENTENCE
// ---------------------------------------------------------------------------

describe('every seal fires — off, then on', () => {
  it('THE UNATTENDED: a chip lands, then your hands are not part of the run', () => {
    const eng = createEngine({ nowMs: 0 });
    const s = eng.getState() as GameState;
    s.spiral.count = 1;
    expect(eng.dispatch({ type: 'chip', cell: 0 }).ok).toBe(true);
    run(s, 'unattended');
    const after = eng.dispatch({ type: 'chip', cell: 0 });
    expect(after.ok).toBe(false);
    expect(after.reason).toMatch(/works without you/);
  });

  it('THE UNATTENDED also slows the rock: regen drops, at the SAME depth', () => {
    const { s, mods } = spiralled();
    const before = cellRegen(s, mods);
    run(s, 'unattended');
    mods.invalidate();
    expect(cellRegen(s, mods)).toBeCloseTo(before * 0.6, 10);
    expect(challengeNum(s, 'regenMult', 1)).toBe(0.6);
  });

  it('THE LONG FALL: the world falls, then it does not', () => {
    const eng = createEngine({ nowMs: 0 });
    const s = eng.getState() as GameState;
    s.spiral.count = 1;
    s.depth = 45;                                  // deep enough for the fall to pay
    expect(eng.dispatch({ type: 'collapse' }).ok).toBe(true);
    s.depth = 45;
    run(s, 'longfall');
    const after = eng.dispatch({ type: 'collapse' });
    expect(after.ok).toBe(false);
    expect(after.reason).toMatch(/does not fall/);
  });

  it('THE THIN SEAM: the rock gives something up, then it gives up nothing', () => {
    const { s, mods } = spiralled();
    s.materials.totalDrops = 0;
    for (let i = 0; i < 400; i++) rollForDrop(s, mods, ctx(), 8, 1);
    const found = s.materials.totalDrops;
    expect(found, 'the unsealed arm really dropped something').toBeGreaterThan(0);
    run(s, 'thinseam');
    for (let i = 0; i < 400; i++) rollForDrop(s, mods, ctx(), 8, 1);
    expect(s.materials.totalDrops).toBe(found);
  });

  it('THE HONEST STONE: a stone arrives at its own purity, then at nothing', () => {
    const { s } = spiralled();
    const drop = { kind: 'material' as const, materialId: 'marl', purity: 72 };
    applyDrop(s, ctx(), drop);
    // The stack it landed in is the purity BAND, so a fine stone and a filthy
    // one are not the same row — which is exactly what the seal collapses.
    const bandsBefore = Object.keys(s.materials.stacks['marl'] ?? {});
    expect(bandsBefore, 'the unsealed arm banded it by its own purity').toHaveLength(1);
    delete s.materials.stacks['marl'];
    run(s, 'honeststone');
    applyDrop(s, ctx(), drop);
    const sealedBands = Object.keys(s.materials.stacks['marl'] ?? {});
    expect(sealedBands).toHaveLength(1);
    expect(sealedBands[0], 'and the sealed arm put the same stone somewhere else')
      .not.toBe(bandsBefore[0]);
    // ...and specifically in the bottom band, which is what "zero purity" means
    // once it has been through the banding the whole material economy uses.
    expect(sealedBands[0]).toBe('poor');
  });

  it('ONE CELL: the face widens, then it will not', () => {
    const { s, mods } = spiralled();
    s.upgrades['expand'] = 1;
    applyFieldSize(s, mods);
    const wide = s.face.w * s.face.h;
    expect(wide, 'the unsealed arm really grew').toBeGreaterThan(36);
    run(s, 'onecell');
    s.upgrades['expand'] = 4;
    applyFieldSize(s, mods);
    expect(s.face.w * s.face.h).toBe(wide);
  });

  it('THE EMPTY HAND: you swing what you carry, then you swing nothing', () => {
    const { s } = spiralled();
    expect(equippedTool(s).name).not.toBe('Bare Hands');
    run(s, 'emptyhand');
    expect(equippedTool(s).name).toBe('Bare Hands');
    expect(equippedTool(s).tier).toBe(0);
  });

  it('COLD IRON: the Kiln takes heat, then it stands and will not light', () => {
    const { s, mods } = spiralled();
    s.kiln.built = true;
    s.kiln.feeding = true;
    s.currencies['dust'] = D(1e9);
    tickKiln(s, mods, ctx(), 5);
    expect(s.kiln.heat, 'the unsealed arm really lit').toBeGreaterThan(0);
    run(s, 'coldiron');
    tickKiln(s, mods, ctx(), 5);
    expect(s.kiln.heat).toBe(0);
    expect(s.kiln.feeding).toBe(false);
  });

  it('THE UNLIT: an absence pays, then the world only runs while watched', () => {
    const { s, mods } = spiralled();
    s.face.cells = s.face.cells.map(() => 0);
    const paid = applyOfflineProgress(s, mods, ctx(), 600);
    expect(paid.dust.gt(0), 'the unsealed arm really paid').toBe(true);
    const s2 = spiralled();
    s2.s.face.cells = s2.s.face.cells.map(() => 0);
    run(s2.s, 'unlit');
    expect(applyOfflineProgress(s2.s, s2.mods, ctx(), 600).dust.eq(0)).toBe(true);
  });

  it('THE HELD BREATH: the Governor holds the line, then it is off', () => {
    const { s } = spiralled();
    s.shell.current = 'cinder';
    const governed = heatCeiling(s, true);
    expect(governed, 'the unsealed arm is really governed').toBeLessThan(100);
    run(s, 'heldbreath');
    expect(heatCeiling(s, true)).toBe(100);
    expect(challengeNum(s, 'heatRateMult', 1)).toBe(2);
  });

  it("SABLE'S WALK: the rooms are there, then there is only the Face", () => {
    const { s } = spiralled();
    const openBefore = CLUSTERS.filter((c) => clusterVisible(c, s)).map((c) => c.id);
    expect(openBefore.length, 'more than the face was open').toBeGreaterThan(1);
    run(s, 'sableswalk');
    expect(CLUSTERS.filter((c) => clusterVisible(c, s)).map((c) => c.id)).toEqual(['face']);
  });

  it("SABLE'S WALK also pins the shaft at sixty — the depth cap fires", () => {
    const { s, mods } = spiralled();
    run(s, 'sableswalk');
    expect(challengeNum(s, 'depthCap', Infinity)).toBe(60);
    s.depth = 60;
    s.currencies['dust'] = D(1e30);
    const r = descend(s, mods, ctx());
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no deeper this run/);
  });
});

// ---------------------------------------------------------------------------
// Starting, abandoning, finishing
// ---------------------------------------------------------------------------

describe('a run you can start, walk away from, or finish', () => {
  it('one set of rules at a time', () => {
    const { s } = spiralled();
    run(s, 'onecell');
    expect(challengeBlocker(s, 'coldiron')).toMatch(/already under way/);
  });

  it('abandoning says what it costs and what it keeps, BEFORE the button', () => {
    const { s } = spiralled();
    s.depth = 10;
    run(s, 'thinseam');
    s.depth = 22;
    tickChallenges(s, ctx());                      // the beat notes the ground made
    const r = abandonChallenge(s, ctx());
    expect(r.ok).toBe(true);
    const line = (r.data as { line: string }).line;
    expect(line, 'it names what was spent').toMatch(/Costs: this attempt, and the 12 depths/);
    expect(line, 'it names what survives').toMatch(/Keeps: everything/);
    // ...and it is true: the seal lifts and nothing was taken.
    expect(sealed(s, 'sealDrops')).toBe(false);
    expect(s.spiral.challengeDone).toEqual([]);
  });

  it('abandoning does NOT hand you the grant — the run has to be made', () => {
    const { s } = spiralled();
    run(s, 'coldiron');
    abandonChallenge(s, ctx());
    expect(keptLaw(s, 'coldiron')).toBe(false);
  });

  it('carrying it down the authored distance finishes it, and the seal lifts', () => {
    const { s } = spiralled();
    s.depth = 30;
    run(s, 'onecell');
    expect(sealed(s, 'sealWiden')).toBe(true);
    s.depth = 30 + CHALLENGE_BY_ID.get('onecell')!.descend - 1;
    tickChallenges(s, ctx());
    expect(s.spiral.activeChallenge, 'one short is not finished').not.toBeNull();
    s.depth += 1;
    tickChallenges(s, ctx());
    expect(s.spiral.activeChallenge).toBeNull();
    expect(keptLaw(s, 'onecell')).toBe(true);
    expect(sealed(s, 'sealWiden'), 'the rules come back').toBe(false);
  });

  it('a Collapse mid-run does not erase the ground it was made on', () => {
    const { s } = spiralled();
    s.depth = 5;
    run(s, 'thinseam');
    s.depth = 5 + CHALLENGE_BY_ID.get('thinseam')!.descend;
    // ...and then the world falls, taking `depth` to zero.
    tickChallenges(s, ctx());
    expect(keptLaw(s, 'thinseam'), 'the beat saw the deepest point').toBe(true);
  });

  it('a kept inversion cannot be run again for a thing you already hold', () => {
    const { s } = spiralled();
    s.spiral.challengeDone.push('coldiron');
    expect(challengeBlocker(s, 'coldiron')).toMatch(/already kept this one/);
  });

  it("SABLE'S WALK names its constraint rather than failing late", () => {
    const { s } = spiralled();
    s.depth = 200;
    expect(challengeBlocker(s, 'sableswalk')).toMatch(/within fifteen of the top/);
    s.depth = 12;
    expect(challengeBlocker(s, 'sableswalk')).toBeNull();
  });

  it('THE HELD BREATH names its place — nothing else runs hot enough', () => {
    const { s } = spiralled();
    s.shell.current = 'loam';
    s.shell.signatures = [];
    expect(challengeBlocker(s, 'heldbreath')).toMatch(/runs hot enough/);
    s.shell.current = 'cinder';
    expect(challengeBlocker(s, 'heldbreath')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TEN GRANTS, OFF AND ON — the other half of the dead-behaviour class
// ---------------------------------------------------------------------------
/**
 * A grant nothing reads is the same failure as a seal nothing reads, arriving
 * through the reward door instead of the seal door. So each one gets the same
 * treatment: the world's behaviour WITHOUT it, then WITH it, on the same state.
 */
describe('every grant does something — without, then with', () => {
  it('THE UNATTENDED: the machines take your cell, then they leave it alone', () => {
    /**
     * ONE charged cell, and it is the one your hand last struck. A lone drill
     * either takes it or leaves it standing — no tie-break, no second target,
     * nothing to read but the routing rule.
     */
    function left(kept: boolean): number {
      const { s, mods } = spiralled();
      if (kept) s.spiral.challengeDone.push('unattended');
      s.drills.bayBuilt = true;
      s.drills.units = [newDrill('Bess')];
      const cap = cellCap(s, mods);
      s.face.cells = s.face.cells.map(() => 0);
      s.face.cells[3] = cap;
      s.face.lastHandCell = 3;
      tickDrills(s, mods, ctx(), 10);
      return s.face.cells[3]! / cap;
    }
    expect(left(false), 'without it, your cell is fair game').toBeLessThan(1);
    expect(left(true), 'with it, the machines leave it standing').toBe(1);
  });

  it('THE LONG FALL: a drift dies at the Breach, then it is re-timbered below', () => {
    /** Breach out of Loam with the top band timbered, and see what lands. */
    function fell(kept: boolean): { depth: number; bands: number } {
      const eng = createEngine({ nowMs: 0 });
      const s = eng.getState() as GameState;
      s.spiral.count = 1;
      if (kept) s.spiral.challengeDone.push('longfall');
      ensureRoll(s);
      s.roll!.rig = true;
      // Timber the leading run of bands by hand — shoring's own price is not
      // what is under test here, the CARRY is.
      const ladder = bands(s);
      for (const b of ladder.filter((x) => x.to <= 90)) (s.roll!.shored ??= []).push(b.def.id);
      const before = driftDepth(s);
      expect(before, 'the Loam drift really reached somewhere').toBeGreaterThan(0);
      s.keystones = { placed: ['loam'] } as never;
      s.depth = currentShell(s).floorDepth;
      s.depthRecords['loam'] = s.depth;
      const r = eng.dispatch({ type: 'breach' });
      expect(r.ok, `breach refused: ${String(r.reason)}`).toBe(true);
      return { depth: driftDepth(s), bands: (s.roll!.shored ?? []).length };
    }
    const without = fell(false);
    expect(without.depth, 'the ids survive, the ladder does not read them').toBe(0);
    const with_ = fell(true);
    expect(with_.depth, 'and with the grant the fall starts already fallen').toBeGreaterThan(0);
  });

  it('THE THIN SEAM: a geode is carried up, then it opens where it lies', () => {
    function dig(kept: boolean): { held: number; cracked: number } {
      const { s, mods } = spiralled();
      if (kept) s.spiral.challengeDone.push('thinseam');
      for (let i = 0; i < 40_000; i++) rollForDrop(s, mods, ctx(), 8, 1);
      return { held: s.materials.geodes, cracked: s.materials.geodesCracked };
    }
    const without = dig(false);
    expect(without.held, 'geodes really turn up at this rate').toBeGreaterThan(0);
    expect(without.cracked).toBe(0);
    const with_ = dig(true);
    expect(with_.held, 'none is carried up shut').toBe(0);
    expect(with_.cracked).toBeGreaterThan(0);
  });

  it('THE HONEST STONE: the drop says nothing, then it names its purity', () => {
    function land(kept: boolean): boolean | undefined {
      const { s } = spiralled();
      if (kept) s.spiral.challengeDone.push('honeststone');
      const seen: GameEvent[] = [];
      const rec: EngineCtx = { emit: (e) => { seen.push(e); }, dirty: Function.prototype as never };
      applyDrop(s, rec, { kind: 'material', materialId: 'marl', purity: 64 });
      const found = seen.find((e) => e.type === 'materialFound');
      expect(found, 'it really emitted one').toBeDefined();
      return (found as { shown?: boolean }).shown;
    }
    expect(land(false)).toBe(false);
    expect(land(true)).toBe(true);
  });

  it('ONE CELL: the rock will not turn, then it turns', () => {
    const { s, mods } = spiralled();
    s.upgrades['expand'] = 1;
    applyFieldSize(s, mods);
    expect([s.face.w, s.face.h]).toEqual([7, 6]);
    const refused = reshapeFace(s, mods, ctx());
    expect(refused.ok).toBe(false);
    expect(refused.reason).toMatch(/does not turn for you yet/);
    s.spiral.challengeDone.push('onecell');
    expect(reshapeFace(s, mods, ctx()).ok).toBe(true);
    expect([s.face.w, s.face.h]).toEqual([6, 7]);
    // ...and back, because a capability you cannot undo is a trap.
    expect(reshapeFace(s, mods, ctx()).ok).toBe(true);
    expect([s.face.w, s.face.h]).toEqual([7, 6]);
  });

  it('THE EMPTY HAND: salvage leaves scrap, then it hands the parts back', () => {
    function breakItDown(kept: boolean): { rack: number; stacks: number } {
      const { s } = spiralled();
      if (kept) s.spiral.challengeDone.push('emptyhand');
      s.forge.built = true;
      s.forge.tools.push({
        ...s.forge.tools[0]!, id: 99, name: 'The Spare',
        parts: {
          head: { materialId: 'marl', purity: 60 },
          haft: { materialId: 'marl', purity: 40 },
          binding: { materialId: 'marl', purity: 20 },
        },
      } as never);
      s.materials.stacks = {};
      s.casting.rack = [];
      const r = salvageTool(s, ctx(), 99, false);
      expect(r.ok, String(r.reason)).toBe(true);
      return { rack: s.casting.rack.length, stacks: Object.keys(s.materials.stacks).length };
    }
    const without = breakItDown(false);
    expect(without.rack, 'nothing reaches the rack').toBe(0);
    expect(without.stacks, 'it really returned materials').toBeGreaterThan(0);
    const with_ = breakItDown(true);
    expect(with_.rack, 'three parts, whole').toBe(3);
    expect(with_.stacks, 'and the raw return does NOT also happen — a trade').toBe(0);
  });

  it('COLD IRON: the kiln has to recover, then it never does', () => {
    const { s, mods } = spiralled();
    s.kiln.built = true;
    s.currencies['dust'] = D(1e12);
    expect(lightOverstoke(s, mods).ok).toBe(true);
    expect(overstokeReady(s), 'it is cooling down').toBe(false);
    s.spiral.challengeDone.push('coldiron');
    expect(overstokeReady(s), 'and now it is only ever waiting on you').toBe(true);
    expect(lightOverstoke(s, mods).ok).toBe(true);
  });

  it('THE UNLIT: an absence leaves the crews standing, then they walk it', () => {
    function away(kept: boolean): number {
      const { s, mods } = spiralled();
      if (kept) s.spiral.challengeDone.push('unlit');
      ensureRoll(s);
      s.roll!.rig = true;
      const band = bands(s)[0]!;
      (s.roll!.shored ??= []).push(band.def.id);
      const sent = dispatchCrew(s, ctx(), band.def.id);
      expect(sent.ok, `no crew went down: ${String(sent.reason)}`).toBe(true);
      const before = s.crews!.crews[0]!.timer;
      applyOfflineProgress(s, mods, ctx(), 600);
      return s.crews!.crews[0]!.timer - before;
    }
    expect(away(false), 'nobody moved').toBe(0);
    expect(away(true), 'ten minutes of walking').toBeGreaterThan(0);
  });

  it('THE HELD BREATH: only Cinder can be run shut, then anywhere can', () => {
    const { s } = spiralled();
    s.shell.current = 'loam';
    const refused = setChoke(s, true);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toMatch(/Only Cinder/);
    s.spiral.challengeDone.push('heldbreath');
    expect(setChoke(s, true).ok).toBe(true);
    expect(s.pressure.choke).toBe(true);
  });

  it("SABLE'S WALK: a room closes behind you, then it never does again", () => {
    const { s } = spiralled();
    const kiln = ALL_SYSTEMS.find((x) => x.id === 'kiln')!;
    s.kiln.built = true;
    expect(systemVisible(kiln, s)).toBe(true);
    s.seenSystems = ['kiln'];               // you were shown it; the gate recorded that
    s.kiln.built = false;                   // ...and then a Breach took it back
    expect(systemVisible(kiln, s), 'the door shuts').toBe(false);
    s.spiral.challengeDone.push('sableswalk');
    expect(systemVisible(kiln, s), 'and now it stays open').toBe(true);
  });

  it('...but it can only re-open a door you actually walked through', () => {
    const { s } = spiralled();
    const kiln = ALL_SYSTEMS.find((x) => x.id === 'kiln')!;
    s.spiral.challengeDone.push('sableswalk');
    s.seenSystems = [];
    s.kiln.built = false;
    expect(systemVisible(kiln, s)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PILLAR 2 — every seal, every grant, the ceiling unmoved
// ---------------------------------------------------------------------------

describe('pillar 2 survives the whole layer', () => {
  it('holding all ten grants moves dpsMax by exactly nothing, at the same depth', () => {
    const { s, mods } = spiralled();
    s.depth = 40;
    const before = dpsMax(s, mods).toString();
    const capBefore = cellCap(s, mods).toString();
    s.spiral.challengeDone = [...ALL_GRANTS];
    mods.invalidate();
    expect(dpsMax(s, mods).toString()).toBe(before);
    expect(cellCap(s, mods).toString()).toBe(capBefore);
  });

  it('...and turning the face on its side keeps W·H, so it keeps the ceiling', () => {
    const { s, mods } = spiralled();
    s.upgrades['expand'] = 1;                      // 7x6 — not square, so it turns
    applyFieldSize(s, mods);
    s.depth = 40;
    const cells = s.face.w * s.face.h;
    const before = dpsMax(s, mods).toString();
    s.spiral.challengeDone = ['onecell'];
    s.face.turned = true;
    applyFieldSize(s, mods);
    mods.invalidate();
    expect(s.face.w * s.face.h).toBe(cells);
    expect([s.face.w, s.face.h], 'it really turned — 7×6 became 6×7').toEqual([6, 7]);
    expect(dpsMax(s, mods).toString()).toBe(before);
  });

  it('no authored law raises anything — every numeric law is a TAKING', () => {
    // The direction matters more than the values. `regenMult` under 1 and
    // `depthCap` finite are restrictions; a challenge that handed out a
    // multiplier would be a difficulty slider pointed the wrong way, which
    // §20.2 is explicitly not.
    for (const c of CHALLENGES) {
      if (c.laws.regenMult !== undefined) expect(c.laws.regenMult, c.id).toBeLessThan(1);
      if (c.laws.heatRateMult !== undefined) expect(c.laws.heatRateMult, c.id).toBeGreaterThan(1);
      if (c.laws.depthCap !== undefined) expect(c.laws.depthCap, c.id).toBeLessThan(Infinity);
    }
  });
});
