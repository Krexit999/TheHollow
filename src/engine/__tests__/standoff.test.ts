/**
 * THE STANDOFF, MINIMUM VERSION (§27).
 *
 * The claims under test are the three that make combat more than a lookup
 * table, plus the two safety rules. If any of these fails the design is dead at
 * this size, which is the entire reason it was built at this size.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { Engine, EngineCtx, GameState } from '../types';
import {
  COUNTER_STRIKE, DRILL_LINES, ITS_STRIKE, MIN_STRIKE_FRACTION, STANCE_LABEL, STRIKE_BASE,
  STRIKE_LEAN_BASE, STRIKE_LEAN_MAX, STRIKE_LEAN_MIN,
  beginStandoff, dismissStandoff, ensureStandoff, exchange, hazardHere,
  lineDamage, setDrillLine, standoffLive, strikeDamage, strikeLean,
} from '../systems/standoff';
import { shellRoll } from '../systems/roll';

const ctx: EngineCtx = { emit() {}, dirty() {} };

function fresh(): { engine: Engine; s: () => GameState } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: () => engine.getState() as GameState };
}

/** Stand at Loam's hazard station with a fight ready to open. */
function atHazard(): GameState {
  const { s } = fresh();
  const st = s();
  const haz = shellRoll(st).find((d) => d.type === 'hazard')!;
  st.depth = haz.depth;
  return st;
}

describe('WHERE IT HAPPENS — hazard stations, and engaging is optional (§27.7)', () => {
  it('there is nothing to fight until you are standing at a hazard', () => {
    const { s } = fresh();
    expect(hazardHere(s())).toBeNull();
    expect(beginStandoff(s(), ctx).ok).toBe(false);
  });

  it('opens at the hazard station, and Loam has exactly one', () => {
    const st = atHazard();
    expect(shellRoll(st).filter((d) => d.type === 'hazard')).toHaveLength(1);
    expect(beginStandoff(st, ctx).ok).toBe(true);
    expect(standoffLive(st)).toBe(true);
  });
});

describe('INTENT IS FREE, FROM THE FIRST FIGHT (§27.1)', () => {
  it('is readable on the very first exchange with nothing unlocked and nothing spent', () => {
    const st = atHazard();
    const dustBefore = st.currencies['dust']!.toString();
    beginStandoff(st, ctx);
    const s = ensureStandoff(st);
    expect(s.intent).toBeTruthy();
    // No gate, no tax: reading it changed nothing at all.
    expect(st.currencies['dust']!.toString()).toBe(dustBefore);
    expect(s.exchange).toBe(0);
  });

  it('the intent you are shown is the intent it plays', () => {
    const st = atHazard();
    beginStandoff(st, ctx);
    const s = ensureStandoff(st);
    s.intent = 'strike';
    const wind = s.wind;
    exchange(st, ctx, 'strike');
    expect(s.wind).toBe(wind - ITS_STRIKE);
  });
});

describe('THE DRILL LINE IS A SECOND ACTOR (§27.2)', () => {
  it('acts EVERY exchange, without being asked', () => {
    const st = atHazard();
    setDrillLine(st, 'fullest');
    beginStandoff(st, ctx);
    const s = ensureStandoff(st);
    exchange(st, ctx, 'strike');
    expect(s.log.some((l) => /Fullest-first works for/.test(l))).toBe(true);
  });

  it('is chosen BEFORE the fight and cannot be changed mid-fight', () => {
    const st = atHazard();
    expect(setDrillLine(st, 'sweep').ok).toBe(true);
    beginStandoff(st, ctx);
    const s = ensureStandoff(st);
    expect(s.line).toBe('sweep');
    const r = setDrillLine(st, 'chain');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cannot be changed/i);
    expect(s.line).toBe('sweep'); // and it really did not move
  });

  it('the three lines are genuinely different actors, not three names', () => {
    expect(DRILL_LINES).toHaveLength(3);
    const st = atHazard();
    beginStandoff(st, ctx);
    const s = ensureStandoff(st);
    // CHAIN grows while nothing interrupts it; the other two do not.
    const at = (line: 'fullest' | 'sweep' | 'chain', chain: number): number => {
      s.line = line; s.chain = chain; return lineDamage(st);
    };
    expect(at('chain', 4)).toBeGreaterThan(at('chain', 0));
    expect(at('fullest', 4)).toBe(at('fullest', 0));
    expect(at('sweep', 4)).toBe(at('sweep', 0));
    // ...and at rest they are not the same number either.
    expect(at('fullest', 0)).toBeGreaterThan(at('sweep', 0));
  });

  it('a counter INTERRUPTS the chain — that is what "uninterrupted" means', () => {
    const st = atHazard();
    setDrillLine(st, 'chain');
    beginStandoff(st, ctx);
    const s = ensureStandoff(st);
    s.chain = 5;
    s.intent = 'counter';
    exchange(st, ctx, 'strike');
    expect(s.chain).toBe(0);
  });
});

describe('IT READS YOUR LAST STANCE (§27.3) — the thing that kills the lookup table', () => {
  it('the same stance twice running is HALVED', () => {
    const st = atHazard();
    beginStandoff(st, ctx);
    const clean = strikeDamage(st, false);
    const repeat = strikeDamage(st, true);
    expect(repeat).toBeCloseTo(clean / 2, 6);
  });

  it('and its NEXT INTENT COUNTERS IT', () => {
    const st = atHazard();
    setDrillLine(st, 'fullest');
    beginStandoff(st, ctx);
    const s = ensureStandoff(st);
    s.hp = 1e6; // let the fight run; this is about the read, not the kill
    exchange(st, ctx, 'strike');
    expect(s.intent).not.toBe('counter'); // one strike is not a pattern
    exchange(st, ctx, 'strike');           // ...twice is
    expect(s.intent).toBe('counter');
  });

  it('the counter really hits harder than the swing it replaces', () => {
    expect(COUNTER_STRIKE).toBeGreaterThan(ITS_STRIKE);
  });

  it('WITHDRAW is the free reset — leaving clears the read', () => {
    const st = atHazard();
    beginStandoff(st, ctx);
    const s = ensureStandoff(st);
    s.hp = 1e6;
    exchange(st, ctx, 'strike');
    exchange(st, ctx, 'withdraw');
    expect(s.outcome).toBe('withdrew');
    // Nothing was taken for leaving: wind intact, tool untouched, depth held.
    expect(s.wind).toBe(s.maxWind - ITS_STRIKE);
  });
});

describe('LOAM COMPACTS — harder to hurt, richer to take (§27.5)', () => {
  it('hardens every exchange, whatever it did that turn', () => {
    const st = atHazard();
    beginStandoff(st, ctx);
    const s = ensureStandoff(st);
    s.hp = 1e6;
    const before = s.compaction;
    exchange(st, ctx, 'strike');
    expect(s.compaction).toBeGreaterThan(before);
  });

  it('takes LESS as it packs — but never nothing', () => {
    const st = atHazard();
    beginStandoff(st, ctx);
    const s = ensureStandoff(st);
    const soft = strikeDamage(st, false);
    s.compaction = 6;
    const hard = strikeDamage(st, false);
    expect(hard).toBeLessThan(soft);
    s.compaction = 1000;
    // A thing you cannot hurt is a timer, not a decision about when to leave.
    // The floor is a FRACTION of the clean strike, so it scales with the tool
    // rather than being a magic number the late game outgrows.
    expect(strikeDamage(st, false)).toBeCloseTo(soft * MIN_STRIKE_FRACTION, 6);
    expect(soft).toBeGreaterThanOrEqual(STRIKE_BASE);
  });

  it('and DROPS RICHER for having been left alone longer', () => {
    const drop = (compaction: number): { count: number; purity: number } => {
      const st = atHazard();
      beginStandoff(st, ctx);
      const s = ensureStandoff(st);
      s.compaction = compaction;
      s.hp = 0.0001;
      exchange(st, ctx, 'strike');
      const stacks = st.materials.stacks;
      let count = 0; let puritySum = 0;
      for (const bands of Object.values(stacks)) {
        for (const b of Object.values(bands)) { count += b.count; puritySum += b.puritySum; }
      }
      return { count, purity: count > 0 ? puritySum / count : 0 };
    };
    const early = drop(0);
    const late = drop(8);
    expect(late.count).toBeGreaterThan(early.count);
    expect(late.purity).toBeGreaterThan(early.purity);
  });
});

describe('NOTHING IS LOST PERMANENTLY (§27.7)', () => {
  it('losing costs the haul and ONE STATION — never the tool', () => {
    const st = atHazard();
    const haz = hazardHere(st)!;
    const toolsBefore = JSON.stringify(st.forge.tools);
    const rackBefore = JSON.stringify(st.casting.rack);
    beginStandoff(st, ctx);
    const s = ensureStandoff(st);
    s.wind = 0.0001;
    exchange(st, ctx, 'strike');
    expect(s.outcome).toBe('lost');
    expect(s.haul).toBe(0);
    // Up ONE station — not to the surface, not a reset.
    expect(st.depth).toBeLessThan(haz.depth);
    const above = shellRoll(st).filter((d) => d.depth < haz.depth).pop()!;
    expect(st.depth).toBe(above.depth);
    // THE TOOL IS UNTOUCHED. This is the rule the whole system is allowed to be
    // brutal underneath.
    expect(JSON.stringify(st.forge.tools)).toBe(toolsBefore);
    expect(JSON.stringify(st.casting.rack)).toBe(rackBefore);
  });

  it('a finished fight can be dismissed, and the station re-engaged', () => {
    const st = atHazard();
    beginStandoff(st, ctx);
    exchange(st, ctx, 'withdraw');
    expect(dismissStandoff(st, ctx).ok).toBe(true);
    expect(standoffLive(st)).toBe(false);
    expect(beginStandoff(st, ctx).ok).toBe(true);
  });

  it('a live fight cannot be dismissed out from under itself', () => {
    const st = atHazard();
    beginStandoff(st, ctx);
    expect(dismissStandoff(st, ctx).ok).toBe(false);
  });
});

describe('WHAT WAS DELIBERATELY NOT BUILT', () => {
  it('TWO stances, and the other four of §27.4 are genuinely absent', () => {
    expect(Object.keys(STANCE_LABEL).sort()).toEqual(['strike', 'withdraw']);
    // GUARD, PRY, VENT and FEED do not exist as behaviours: anything that is
    // not WITHDRAW resolves as a strike, so there is no fifth branch hiding in
    // the engine waiting to be reached by a stale saved action.
    const st = atHazard();
    setDrillLine(st, 'fullest');
    beginStandoff(st, ctx);
    const s = ensureStandoff(st);
    s.hp = 1e6;
    exchange(st, ctx, 'pry' as never);
    expect(s.exchange).toBe(1);
    expect(s.log.some((l) => /You strike for/.test(l))).toBe(true);
  });
});

/**
 * A.106 RULING — `strikePower` was computed, displayed on the tool shelf beside
 * Chip, and READ BY NOTHING. It is wired here, in the one place in the game
 * where the fiction is "you hit something", and these are the checks that it is
 * genuinely read and genuinely bounded.
 */
describe('THE TOOL\'S OWN STRIKE, WIRED (A.106)', () => {
  /** Forge nothing — just set the two numbers the shelf already prints. */
  function withTool(chip: number, strike: number): GameState {
    const st = atHazard();
    const t = st.forge.tools[st.forge.equipped]!;
    t.chipPower = chip;
    t.strikePower = strike;
    return st;
  }

  it('a plain 3:1 tool fights exactly as it always did', () => {
    const st = withTool(1, STRIKE_LEAN_BASE);
    expect(strikeLean(st)).toBe(1);
    expect(strikeDamage(st, false)).toBeCloseTo(STRIKE_BASE + 3 * 1, 6);
  });

  it('a strike-leaning tool hits harder, and a chip-leaning one softer', () => {
    const plain = strikeDamage(withTool(1, 3), false);
    const heavy = strikeDamage(withTool(1, 9), false);
    const light = strikeDamage(withTool(3, 3), false);
    expect(heavy, 'strikePower is still read by nothing').toBeGreaterThan(plain);
    expect(light, 'a chip-leaning tool fights the same').toBeLessThan(plain);
  });

  it('...and it is CLAMPED, hard, in both directions', () => {
    // Absurd in both directions: a hundred-to-one and a one-to-a-hundred.
    expect(strikeLean(withTool(1, 100))).toBe(STRIKE_LEAN_MAX);
    expect(strikeLean(withTool(100, 1))).toBe(STRIKE_LEAN_MIN);
    expect(STRIKE_LEAN_MAX, 'the clamp is not a clamp').toBeLessThan(1.5);
    expect(STRIKE_LEAN_MIN).toBeGreaterThan(0.5);
  });

  it('a tool with no numbers at all fights as a plain one, never as nothing', () => {
    expect(strikeLean(withTool(0, 0))).toBe(1);
    expect(strikeDamage(withTool(0, 0), false)).toBeGreaterThan(0);
  });
});
