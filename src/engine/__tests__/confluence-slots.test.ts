/**
 * THE ATTENDED MARGIN (Interlock B3) — Echoes buy attention, attention
 * amplifies. The properties that make the layer safe to ship:
 *
 *   - an UNATTENDED confluence pays ×1, exactly as before (no save is nerfed);
 *   - capacity is the Breach's carry (1 + carried signatures), so the echo
 *     layer's two products — Echoes and signatures — are both inputs here;
 *   - rank rides the SLOT, so re-choosing is free and lossless;
 *   - only FOUND confluences can be dwelt on (pillar 5: a record of play).
 */
import { describe, expect, it } from 'vitest';
import { D } from '../decimal';
import { createEngine } from '../index';
import type { GameState } from '../types';
import {
  CONFLUENCES, CONFLUENCE_RANK_CAP, confluenceAmp, confluenceBonus,
  confluenceRankCost, confluenceSlotCap, confluenceSlotCost,
} from '../systems/confluence';
import { ensureStateShape } from '../save/shape';
import { initialState } from '../state';

const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};

// A confluence with a condition we can arrange cheaply from a fresh state:
// Nothing Wasted needs 3 salvaged tools and 2 refinery finds and nothing else.
const HOARD = 'nothingWasted';
function makeHoardLive(s: GameState): void {
  s.forge.salvaged = 3;
  s.refinery.found = ['a', 'b'];
}

describe('attention slots — buying', () => {
  it('capacity is 0 before the second Breach, then 1 + carried signatures', () => {
    const { s } = fresh();
    expect(confluenceSlotCap(s)).toBe(0);
    s.shell.breachCount = 1;
    s.shell.signatures = ['seepage'];
    expect(confluenceSlotCap(s)).toBe(0); // the first fall teaches; the second pays
    s.shell.breachCount = 2;
    s.shell.signatures = ['seepage', 'polarity'];
    expect(confluenceSlotCap(s)).toBe(3);
  });

  it('a slot costs Echoes on a doubling curve and respects the cap', () => {
    const { engine, s } = fresh();
    s.shell.breachCount = 2;
    expect(engine.dispatch({ type: 'confluenceBuySlot' }).ok).toBe(false); // no echoes
    s.currencies['echo'] = D(100);
    expect(confluenceSlotCost(s).toNumber()).toBe(3);
    expect(engine.dispatch({ type: 'confluenceBuySlot' }).ok).toBe(true);
    expect(s.currencies['echo']!.toNumber()).toBe(97);
    expect(confluenceSlotCost(s).toNumber()).toBe(6);
    // cap: 1 slot with no signatures — the second is refused with echoes in hand
    const refused = engine.dispatch({ type: 'confluenceBuySlot' });
    expect(refused.ok).toBe(false);
    expect(s.confluences.slots.length).toBe(1);
    s.shell.signatures = ['seepage'];
    expect(engine.dispatch({ type: 'confluenceBuySlot' }).ok).toBe(true);
    expect(s.currencies['echo']!.toNumber()).toBe(91);
  });
});

describe('attention slots — choosing', () => {
  it('only a FOUND confluence can be dwelt on; duplicates are refused; null clears', () => {
    const { engine, s } = fresh();
    s.currencies['echo'] = D(100);
    s.shell.breachCount = 2;
    s.shell.signatures = ['seepage'];
    engine.dispatch({ type: 'confluenceBuySlot' });
    engine.dispatch({ type: 'confluenceBuySlot' });
    expect(engine.dispatch({ type: 'confluenceSetSlot', slot: 0, id: HOARD }).ok).toBe(false);
    s.confluences.found.push(HOARD);
    expect(engine.dispatch({ type: 'confluenceSetSlot', slot: 0, id: HOARD }).ok).toBe(true);
    expect(engine.dispatch({ type: 'confluenceSetSlot', slot: 1, id: HOARD }).ok).toBe(false);
    expect(engine.dispatch({ type: 'confluenceSetSlot', slot: 0, id: null }).ok).toBe(true);
    expect(s.confluences.slots[0]!.id).toBeNull();
    expect(engine.dispatch({ type: 'confluenceSetSlot', slot: 9, id: null }).ok).toBe(false);
    expect(engine.dispatch({ type: 'confluenceSetSlot', slot: 0, id: 'nope' }).ok).toBe(false);
  });
});

describe('the amplifier', () => {
  it('unattended ×1, dwelt ×2, deepened ×2.5 then ×3 — and rank caps there', () => {
    const { engine, s } = fresh();
    s.shell.breachCount = 2;
    s.currencies['echo'] = D(100);
    s.confluences.found.push(HOARD);
    expect(confluenceAmp(s, HOARD)).toBe(1);
    engine.dispatch({ type: 'confluenceBuySlot' });
    engine.dispatch({ type: 'confluenceSetSlot', slot: 0, id: HOARD });
    expect(confluenceAmp(s, HOARD)).toBe(2);
    expect(confluenceRankCost(s.confluences.slots[0]!).toNumber()).toBe(2);
    expect(engine.dispatch({ type: 'confluenceBuyRank', slot: 0 }).ok).toBe(true);
    expect(confluenceAmp(s, HOARD)).toBe(2.5);
    expect(confluenceRankCost(s.confluences.slots[0]!).toNumber()).toBe(4);
    expect(engine.dispatch({ type: 'confluenceBuyRank', slot: 0 }).ok).toBe(true);
    expect(confluenceAmp(s, HOARD)).toBe(3);
    expect(engine.dispatch({ type: 'confluenceBuyRank', slot: 0 }).ok).toBe(false); // cap
    expect(s.confluences.slots[0]!.rank).toBe(CONFLUENCE_RANK_CAP);
  });

  it('a dwelt confluence pays bonus × amp through confluenceBonus; others are untouched', () => {
    const { engine, s } = fresh();
    const def = CONFLUENCES.find((c) => c.id === HOARD)!;
    makeHoardLive(s);
    expect(confluenceBonus(s, def.bucket)).toBeCloseTo(def.bonus, 10);
    s.shell.breachCount = 2;
    s.currencies['echo'] = D(100);
    s.confluences.found.push(HOARD);
    engine.dispatch({ type: 'confluenceBuySlot' });
    engine.dispatch({ type: 'confluenceSetSlot', slot: 0, id: HOARD });
    engine.dispatch({ type: 'confluenceBuyRank', slot: 0 });
    engine.dispatch({ type: 'confluenceBuyRank', slot: 0 });
    expect(confluenceBonus(s, def.bucket)).toBeCloseTo(def.bonus * 3, 10);
    // a dwelt confluence whose condition LAPSES pays nothing at all
    s.forge.salvaged = 0;
    expect(confluenceBonus(s, def.bucket)).toBe(0);
  });

  it('rank rides the slot: letting go and re-choosing keeps the depth', () => {
    const { engine, s } = fresh();
    s.shell.breachCount = 2;
    s.currencies['echo'] = D(100);
    s.confluences.found.push(HOARD, 'quietedMetal');
    engine.dispatch({ type: 'confluenceBuySlot' });
    engine.dispatch({ type: 'confluenceSetSlot', slot: 0, id: HOARD });
    engine.dispatch({ type: 'confluenceBuyRank', slot: 0 });
    engine.dispatch({ type: 'confluenceSetSlot', slot: 0, id: null });
    engine.dispatch({ type: 'confluenceSetSlot', slot: 0, id: 'quietedMetal' });
    expect(confluenceAmp(s, 'quietedMetal')).toBe(2.5);
  });
});

describe('old saves', () => {
  it('a pre-B3 confluences slice ({found} only) hydrates with empty slots', () => {
    const defaults = initialState(0);
    const old = { confluences: { found: ['stormChord'] } };
    const shaped = ensureStateShape(old as never, defaults) as GameState;
    expect(shaped.confluences.found).toEqual(['stormChord']);
    expect(shaped.confluences.slots).toEqual([]);
  });
});
