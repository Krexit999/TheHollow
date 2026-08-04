/**
 * THE LINE — CHAINING (§14.5, §13, §7.3), A.91.
 *
 *   1  the place, then the price; §14.5's "3 -> 6 slots" as three capabilities
 *   2  FOUR MACHINES ON ONE PRESS AND ONE DRAW — the verb
 *   3  the draw is the SUM and a mismatched Line pays MORE, never less
 *   4  all-or-nothing below tier III, and a stall costs nothing
 *   5  the Circuit's `hold the Line` — the act A.85 had to cut
 *   6  PILLAR 2
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import { ModifierCache } from '../modifiers';
import { ensureContentLoaded } from '../content';
import { dpsMax } from '../systems/face';
import { addMaterial, materialCount } from '../systems/forge';
import { markReached } from '../systems/roll';
import { MAX_MACHINE_TIER, demandOf, tierOf } from '../systems/plant';
import { ensureCondition } from '../systems/condition';
import { buildCrusher } from '../systems/crusher';
import { buildBreaker } from '../systems/breaker';
import { buildStill } from '../systems/still';
import {
  LINE_SLOTS, LINE_STEPS, buildLine, efficiency, ensureLine, holdLine, lineBlocker, lineBuilt,
  lineDraw, lineFound, lineSlots, lineStation, linkable, runLine, setLine, skipsIdle, stepFor,
} from '../systems/line';
import {
  availableActs, ensureCircuit, tickCircuit, type CircuitRow,
} from '../systems/circuit';
import type { EngineCtx, GameState } from '../types';

ensureContentLoaded();

const ctx: EngineCtx = { emit() {}, dirty() {} } as unknown as EngineCtx;

function racked(st: GameState, n: number): GameState {
  st.casting.rack = Array.from({ length: n }, (_, i) =>
    ({ id: 3000 + i, materialId: 'ironbloom', type: 'head', purity: 50 } as never));
  st.casting.nextId = 3000 + n;
  return st;
}

/** A player who has walked Ferrite AND Verdance — the Line is Verdance's. */
function walked(): GameState {
  const st = createEngine({ nowMs: 0 }).getState() as GameState;
  st.shell.current = 'verdance';
  markReached(st, 290, 15);
  st.shell.current = 'ferrite';
  markReached(st, 250, 15);
  return racked(st, 40);
}

/** ...with the Line at `tier` and four members standing. */
function plant(tier = 1): GameState {
  const st = walked();
  for (let i = 0; i < tier; i++) buildLine(st, ctx);
  buildCrusher(st, ctx);
  buildBreaker(st, ctx);
  buildStill(st, ctx);
  racked(st, 20);
  // Stock so each member has something to do.
  for (let i = 0; i < 8; i++) addMaterial(st, 'ironbloom', 30);
  for (let i = 0; i < 4; i++) addMaterial(st, 'millstone', 80);
  st.plant!.surge = 9999;
  return st;
}

describe('1 — the place, then the price (§6, §15.4)', () => {
  it('it is at Linewright\'s Fall 172 in Verdance, exactly where §6 puts it', () => {
    expect(lineStation()).toEqual({ shellId: 'verdance', depth: 172, name: "Linewright's Fall" });
  });

  it('a player who has not been there cannot raise it', () => {
    const st = racked(createEngine({ nowMs: 0 }).getState() as GameState, 20);
    expect(lineFound(st)).toBe(false);
    expect(buildLine(st, ctx).reason).toContain("Linewright's Fall");
  });

  it('§14.5\'s "3 -> 6 slots" is the tier ladder, and III is a CAPABILITY', () => {
    expect(LINE_SLOTS).toEqual([0, 3, 4, 6]);
    expect(lineSlots(plant(1))).toBe(3);
    expect(lineSlots(plant(2))).toBe(4);
    const three = plant(3);
    expect(lineSlots(three)).toBe(6);
    expect(tierOf(three, 'line')).toBe(MAX_MACHINE_TIER);
    // The capability is not the number: at I and II a member with nothing to do
    // STALLS the press; at III it is skipped.
    expect(skipsIdle(plant(1))).toBe(false);
    expect(skipsIdle(three)).toBe(true);
  });

  it('and it is built from cast parts, remembering what it was cast from', () => {
    const st = walked();
    expect(lineBuilt(st)).toBe(false);
    expect(buildLine(st, ctx).ok).toBe(true);
    expect(st.plant!.builtOf!['line']).toContain('ironbloom');
  });
});

// ---------------------------------------------------------------------------
// 2 — THE LOAD-BEARING ONE
// ---------------------------------------------------------------------------

describe('2 — four machines, one press, one draw', () => {
  it('only machines with an UNATTENDED DEFAULT can join', () => {
    // §14.5's members are machines whose "run it" has an answer that needs no
    // decision. The Sieve (a standing rule with nothing to fire) and the
    // Crucible (a pour without a ratio is a guess) are deliberately absent.
    expect(LINE_STEPS.map((s) => s.machineId).sort())
      .toEqual(['breaker', 'crusher', 'refinery', 'still']);
    expect(stepFor('sieve')).toBeUndefined();
    expect(stepFor('crucible')).toBeUndefined();
  });

  it('...and only ones you have BUILT are offered (LAW 3)', () => {
    const bare = walked();
    buildLine(bare, ctx);
    expect(linkable(bare).map((s) => s.machineId)).toEqual([]);
    const st = plant(2);
    expect(linkable(st).map((s) => s.machineId).sort())
      .toEqual(['breaker', 'crusher', 'still']);
  });

  it('FOUR ON ONE PRESS: every member acts, and the bank is charged ONCE', () => {
    const st = plant(3);
    // A refinery so four can stand on the Line at once.
    st.plant!.tiers['refinery'] = 1;
    st.depthRecords['ferrite'] = 250;
    for (let i = 0; i < 6; i++) addMaterial(st, 'rustmarrow', 30);
    const members = ['crusher', 'still', 'breaker', 'refinery'];
    expect(setLine(st, members).ok).toBe(true);
    expect(ensureLine(st).members).toEqual(members);

    const draw = lineDraw(members);
    const before = {
      surge: st.plant!.surge,
      ironbloom: materialCount(st, 'ironbloom'),
      millstone: materialCount(st, 'millstone'),
      rack: st.casting.rack.length,
    };
    const r = runLine(st, ctx);
    expect(r.ok, r.reason).toBe(true);
    const ran = (r.data as { ran: string[] }).ran;
    expect(ran.length, `only ${ran.join(', ')} ran`).toBeGreaterThanOrEqual(3);

    // ONE DRAW, for all of them.
    expect(before.surge - st.plant!.surge).toBe(draw);
    // ...and each member DID ITS THING.
    if (ran.includes('crusher')) expect(materialCount(st, 'ironbloom')).toBeLessThan(before.ironbloom);
    if (ran.includes('still')) expect(materialCount(st, 'millstone')).toBeLessThan(before.millstone);
    if (ran.includes('breaker')) expect(st.casting.rack.length).toBeLessThan(before.rack);
    expect(ensureLine(st).fired).toBe(1);
  });

  it('a Line under three machines is refused — one press is not a chain', () => {
    const st = plant(1);
    setLine(st, ['crusher', 'still']);
    expect(lineBlocker(st)).toBe('A Line wants three machines.');
  });

  it('and a cracked Line will not run — E2 reaches it like every machine', () => {
    const st = plant(3);
    setLine(st, ['crusher', 'still', 'breaker']);
    expect(lineBlocker(st)).toBeNull();
    ensureCondition(st)['line'] = { id: 'baked', level: 1, seized: true };
    expect(lineBlocker(st)).toContain('cracked');
  });
});

// ---------------------------------------------------------------------------
// 3 — THE EFFICIENCY RATING
// ---------------------------------------------------------------------------

/**
 * §14.5 IS EXPLICIT that the Line's skip test is ERGONOMIC — "you could
 * hand-run everything". So it must not become a DISCOUNT by accident: no
 * arrangement of members may make a firing cheaper than the hand it replaces.
 */
describe('3 — the draw is the SUM, and mismatch costs MORE', () => {
  it('a perfectly matched Line pays exactly its members\' sum', () => {
    // Two machines with identical demand profiles rate 1.
    const same = ['crusher', 'crusher'];
    expect(efficiency(same)).toBe(1);
    expect(lineDraw(same)).toBe(demandOf('crusher').surge * 2);
  });

  it('and a mismatched one pays MORE — never less, at any arrangement', () => {
    const pairs: string[][] = [
      ['crusher', 'still'], ['crusher', 'breaker'], ['still', 'breaker'],
      ['crusher', 'refinery'], ['crusher', 'still', 'breaker'],
      ['crusher', 'still', 'breaker', 'refinery'],
    ];
    for (const members of pairs) {
      const sum = members.reduce((n, id) => n + demandOf(id).surge, 0);
      expect(lineDraw(members), `${members.join('+')} is a discount`).toBeGreaterThanOrEqual(sum);
      expect(efficiency(members)).toBeLessThanOrEqual(1);
    }
  });

  it('the rating is the members\' throughputs, and it moves when they change', () => {
    const close = efficiency(['crusher', 'breaker']);   // 14 vs 11
    const far = efficiency(['crusher', 'still']);       // 14 vs 2.2 + 6
    expect(close).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4 — ALL OR NOTHING
// ---------------------------------------------------------------------------

describe('4 — a stall costs nothing, and tier III skips instead', () => {
  it('below tier III a member with nothing to do STALLS the whole press', () => {
    const st = plant(2);
    st.casting.rack = [];                    // the Breaker has nothing to break
    setLine(st, ['crusher', 'still', 'breaker']);
    const before = st.plant!.surge;
    const r = runLine(st, ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('breaker');
    expect(r.reason).toContain('nothing to do');
    // AND IT COST NOTHING — the refusal happens before the draw.
    expect(st.plant!.surge).toBe(before);
    expect(ensureLine(st).stalled).toBe(1);
    expect(ensureLine(st).fired).toBe(0);
  });

  it('at tier III the same Line runs what it can', () => {
    const st = plant(3);
    st.casting.rack = [];
    setLine(st, ['crusher', 'still', 'breaker']);
    expect(lineBlocker(st)).toBeNull();
    const r = runLine(st, ctx);
    expect(r.ok, r.reason).toBe(true);
    expect((r.data as { ran: string[] }).ran).not.toContain('breaker');
    expect(ensureLine(st).fired).toBe(1);
  });

  it('...and a tier-III Line with NOTHING to do still refuses, for free', () => {
    const st = plant(3);
    st.casting.rack = [];
    st.materials.stacks = {};
    setLine(st, ['crusher', 'still', 'breaker']);
    const before = st.plant!.surge;
    expect(runLine(st, ctx).ok).toBe(false);
    expect(st.plant!.surge).toBe(before);
  });

  it('and a short bank refuses BY NAME rather than half-firing', () => {
    const st = plant(3);
    setLine(st, ['crusher', 'still', 'breaker']);
    st.plant!.surge = 1;
    const before = st.plant!.surge;
    const r = runLine(st, ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('the bank holds 1'.replace('the', 'The'));
    expect(st.plant!.surge).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 5 — THE ACT A.85 HAD TO CUT
// ---------------------------------------------------------------------------

/**
 * §7.3's fourth sketched line is `WHEN station type = hazard -> hold the Line,
 * bank Surge`. A.85 CUT it, because "the Line does not exist to hold" — a name
 * against no mechanism. It exists now.
 */
describe('5 — the Circuit holds the Line (§7.3)', () => {
  it('the acts are absent until the Line is BUILT, then all three are there', () => {
    const bare = walked();
    expect(availableActs(bare, 'line')).toHaveLength(0);
    const st = plant(1);
    expect(availableActs(st, 'line').map((a) => a.id).sort())
      .toEqual(['lineHold', 'lineRelease', 'lineRun']);
    expect(availableActs(st, 'line').find((a) => a.id === 'lineHold')!.label)
      .toBe('hold the Line');
  });

  it('a live strip HOLDS it at a hazard, and lets it go elsewhere', () => {
    const st = plant(3);
    setLine(st, ['crusher', 'still', 'breaker']);
    st.shell.current = 'ferrite';
    const c = ensureCircuit(st);
    c.opened = true;
    // §7.3's own example, verbatim.
    const rows: CircuitRow[] = [
      { read: 'station', op: 'is', value: 'hazard', act: 'lineHold' },
      { read: 'depth', op: 'gt', value: -1, act: 'lineRelease' },
    ];
    c.strips['line'] = rows;
    c.last['line'] = -1;
    const mods = new ModifierCache(); mods.invalidate();

    // The Attracting Dark, Ferrite's hazard station at 85.
    st.depth = 85;
    tickCircuit(st, mods, ctx, 2);
    expect(ensureLine(st).held, 'the strip did not hold it at a hazard').toBe(true);
    expect(lineBlocker(st)).toBe('The Line is held.');

    // Anywhere else, the second row wins and it runs again.
    st.depth = 112; // Iron Vespers, a REST
    c.clock = 0;
    tickCircuit(st, mods, ctx, 2);
    expect(ensureLine(st).held, 'the strip did not let it go').toBe(false);
  });

  it('and holding by hand is the same switch', () => {
    const st = plant(3);
    setLine(st, ['crusher', 'still', 'breaker']);
    expect(holdLine(st, true).ok).toBe(true);
    expect(holdLine(st, true).ok, 'holding a held Line is not a change').toBe(false);
    expect(runLine(st, ctx).reason).toBe('The Line is held.');
    expect(holdLine(st, false).ok).toBe(true);
    expect(lineBlocker(st)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6 — PILLAR 2
// ---------------------------------------------------------------------------

describe('6 — PILLAR 2: a Line batches actions, it produces nothing', () => {
  it('dpsMax at the SAME depth is identical with a Line fired and without', () => {
    const read = (fire: boolean): number => {
      const st = plant(3);
      st.depth = 48; // THE SAME DEPTH IN BOTH ARMS
      setLine(st, ['crusher', 'still', 'breaker']);
      if (fire) runLine(st, ctx);
      const m = new ModifierCache();
      m.invalidate();
      return Math.round(dpsMax(st, m).toNumber() * 1e6);
    };
    expect(read(true)).toBe(read(false));
  });

  it('and no member gets a cheaper firing than it would alone', () => {
    // The guarantee stated as an inequality over every subset the tiers allow.
    const all = ['crusher', 'still', 'breaker', 'refinery'];
    for (let mask = 1; mask < 1 << all.length; mask++) {
      const members = all.filter((_, i) => mask & (1 << i));
      if (members.length < 2) continue;
      const alone = members.reduce((n, id) => n + demandOf(id).surge, 0);
      expect(lineDraw(members), `${members.join('+')} undercuts hand-firing`)
        .toBeGreaterThanOrEqual(alone);
    }
  });
});
