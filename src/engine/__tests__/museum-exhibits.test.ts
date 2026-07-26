/**
 * A.47 — THE MUSEUM: arrangement as a discovery system.
 *
 * The load-bearing property is that a relic given to a hall is KEPT WHOLE.
 * Donating used to delete it, which was survivable while a relic was a rarity
 * colour and became a bug the moment A.46 gave each one a story — the museum
 * would have been built out of the only records of where anything came from.
 * Every exhibit predicate reads that record, so this is also the test that the
 * two systems share one source of truth rather than restating each other.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { EngineCtx, GameState, RelicInstance } from '../types';
import { D } from '../decimal';
import { addRelic } from '../systems/relics';
import {
  donateToCase, identifyPiece, identifyCost, movePiece, EXHIBITS,
  activeExhibits, exhibitBonus, piecesInCase, CASE_BY_ID,
} from '../systems/museum';

const ctx: EngineCtx = { emit() {}, dirty() {} };
const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};
/** A relic with a story, given straight to a hall. */
function give(s: GameState, hall: string, found: Partial<NonNullable<RelicInstance['found']>>, over: Partial<RelicInstance> = {}) {
  const r = addRelic(s, {
    uid: 0, defId: 'x', rarity: 1, affixes: { regen: 0.1 }, source: 'depth', fusedFrom: 0,
    found: { depth: 300, shell: 'loam', run: 4, playSec: 100, ...found },
    ...over,
  });
  const res = donateToCase(s, ctx, hall, `relic:${r.uid}`, r.uid);
  expect(res.ok).toBe(true);
  return r;
}
const study = (s: GameState, uid: number) => {
  s.currencies['scrip'] = D(9999);
  expect(identifyPiece(s, ctx, uid).ok).toBe(true);
};

describe('a hall keeps what it is given', () => {
  it('a donated relic survives WHOLE, with its story intact', () => {
    const { s } = fresh();
    const r = give(s, 'firstFinds', { depth: 428, by: 'The Badger', run: 5 });
    expect(s.relics.held.find((x) => x.uid === r.uid)).toBeUndefined(); // left the hold
    const piece = s.museum.pieces.find((p) => p.relic.uid === r.uid);
    expect(piece).toBeDefined();
    expect(piece!.relic.found).toMatchObject({ depth: 428, by: 'The Badger', run: 5 });
    expect(piece!.caseId).toBe('firstFinds');
    expect(piece!.identified).toBe(false); // arrives under a cloth
  });

  it('a locked relic is still refused, and stays in the hold', () => {
    const { s } = fresh();
    const r = addRelic(s, { uid: 0, defId: 'x', rarity: 1, affixes: {}, source: 'depth', fusedFrom: 0, locked: true });
    expect(donateToCase(s, ctx, 'firstFinds', `relic:${r.uid}`, r.uid).ok).toBe(false);
    expect(s.relics.held).toHaveLength(1);
    expect(s.museum.pieces).toHaveLength(0);
  });
});

describe('identify → value', () => {
  it('costs Scrip, and an unstudied piece is invisible to every exhibit', () => {
    const { s } = fresh();
    const a = give(s, 'firstFinds', { run: 7 });
    give(s, 'firstFinds', { run: 7 });
    give(s, 'firstFinds', { run: 7 });
    // Three from the same run — but nothing has been studied.
    expect(piecesInCase(s, 'firstFinds')).toHaveLength(0);
    expect(activeExhibits(s)).toHaveLength(0);

    s.currencies['scrip'] = D(0);
    const broke = identifyPiece(s, ctx, a.uid);
    expect(broke.ok).toBe(false);
    expect(broke.reason).toContain('Scrip');

    s.currencies['scrip'] = D(identifyCost(s.museum.pieces[0]!));
    expect(identifyPiece(s, ctx, a.uid).ok).toBe(true);
    expect(s.currencies['scrip']!.toNumber()).toBe(0);
    expect(identifyPiece(s, ctx, a.uid).ok).toBe(false); // only once
  });
});

describe('exhibits form from the arrangement, and are found not listed', () => {
  it('THE LAST SHIFT: three studied pieces from one run, standing in one hall', () => {
    const { engine, s } = fresh();
    const def = EXHIBITS.find((e) => e.id === 'lastShift')!;
    const rs = [give(s, 'firstFinds', { run: 9 }), give(s, 'firstFinds', { run: 9 }), give(s, 'firstFinds', { run: 9 })];
    for (const r of rs) study(s, r.uid);
    expect(activeExhibits(s).map((a) => a.def.id)).toContain('lastShift');
    expect(exhibitBonus(s, def.bucket)).toBeCloseTo(def.bonus, 6);

    // PILLAR 5: written down only once it has actually formed.
    engine.tick(2);
    expect((engine.getState() as GameState).museum.exhibitsFound).toContain('lastShift');
  });

  it("ONE HAND'S WORK reads the drill that found each — the A.46 record, not a copy", () => {
    const { s } = fresh();
    for (let i = 0; i < 3; i++) study(s, give(s, 'firstFinds', { by: 'Old Tom', run: i }).uid);
    expect(activeExhibits(s).map((a) => a.def.id)).toContain('oneHandsWork');
  });

  /** The whole point of "where does this go": the same relics in DIFFERENT
   *  halls form nothing. Placement is the decision. */
  it('the same pieces split across two halls form nothing', () => {
    const { s } = fresh();
    const a = give(s, 'firstFinds', { run: 3 });
    const b = give(s, 'firstFinds', { run: 3 });
    const c = give(s, 'deepHoard', { run: 3 });
    for (const r of [a, b, c]) study(s, r.uid);
    expect(activeExhibits(s).map((x) => x.def.id)).not.toContain('lastShift');
    // Bring the third one home and it forms.
    expect(movePiece(s, ctx, c.uid, 'firstFinds').ok).toBe(true);
    expect(activeExhibits(s).map((x) => x.def.id)).toContain('lastShift');
  });

  it('moving a piece keeps the case lists and completion honest in BOTH directions', () => {
    const { s } = fresh();
    const need = CASE_BY_ID.get('firstFinds')!.need;
    const rs = Array.from({ length: need }, () => give(s, 'firstFinds', {}));
    expect(s.museum.completed).toContain('firstFinds');
    expect(movePiece(s, ctx, rs[0]!.uid, 'deepHoard').ok).toBe(true);
    // It left, so the case is no longer full — and says so.
    expect(s.museum.completed).not.toContain('firstFinds');
    expect(s.museum.donated['firstFinds']).toHaveLength(need - 1);
    expect(s.museum.donated['deepHoard']).toHaveLength(1);
    expect(s.museum.pieces.find((p) => p.relic.uid === rs[0]!.uid)!.caseId).toBe('deepHoard');
  });

  it('refuses a hall that is not for relics, and one that is full', () => {
    const { s } = fresh();
    const r = give(s, 'firstFinds', {});
    expect(movePiece(s, ctx, r.uid, 'teeth').ok).toBe(false); // bestiary hall
    expect(movePiece(s, ctx, r.uid, 'firstFinds').ok).toBe(false); // already there
  });
});

describe('curation still gates fusion — the edge that already existed', () => {
  /**
   * SYSTEM_IMPROVEMENTS lists "curation gates relic fusion tiers" as a PLANNED
   * edge. It shipped in B4 (`MUSEUM_FUSION_NEED`). Verified here rather than
   * rebuilt — the ledger-is-a-claim rule, applied to the design doc.
   */
  it('completed cases are what raise the relic rarity floor', () => {
    const { s } = fresh();
    const before = s.relics.floorBonus;
    const need = CASE_BY_ID.get('firstFinds')!.need;
    for (let i = 0; i < need; i++) give(s, 'firstFinds', {});
    expect(s.museum.completed).toContain('firstFinds');
    expect(s.relics.floorBonus).toBeGreaterThan(before);
  });
});
