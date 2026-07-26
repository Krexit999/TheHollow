/**
 * A.49 — THE GALLERY SHOWS WHAT YOU OWN.
 *
 * A.47 built the Museum around ARRANGEMENT: hand a relic over, pay to study it,
 * shuffle it between halls, and a set formed out of what stood together. Play
 * reported the result as a donate button attached to a grid of empty slots, and
 * the deeper problem is in that description — the screen asked the player to
 * give up the thing they had just earned in order to look at it.
 *
 * So the author of a set changed. A hall fills from what you HOLD, and a set
 * fires because the collection says something, not because you placed it. The
 * properties that matter now:
 *
 *  - donation is gone and nothing was taken (the v29 migration is tested in
 *    save-migrations, not here — this file tests the model);
 *  - completion is MONOTONIC, so scrapping a relic can never claw a permanent
 *    bonus back or slam the fusion gate shut mid-fuse;
 *  - a set is a statement about the collection, discovered, never listed.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { EngineCtx, GameState, RelicInstance } from '../types';
import { addRelic } from '../systems/relics';
import {
  EXHIBITS, activeExhibits, exhibitBonus, caseProgress, caseComplete,
  noteMuseum, museumBonus, museumFloorBonus, CASE_BY_ID, codexCount, gemKinds,
} from '../systems/museum';

const ctx: EngineCtx = { emit() {}, dirty() {} };
const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};
/** A relic with a story, straight into the hold — which IS the gallery now. */
function own(s: GameState, found: Partial<NonNullable<RelicInstance['found']>> = {}, over: Partial<RelicInstance> = {}) {
  return addRelic(s, {
    uid: 0, defId: 'x', rarity: 1, affixes: { regen: 0.1 }, source: 'depth', fusedFrom: 0,
    found: { depth: 300, shell: 'loam', run: 4, playSec: 100, ...found },
    ...over,
  });
}

describe('a hall fills from what you hold', () => {
  it('counts the collection directly — nothing is handed over', () => {
    const { s } = fresh();
    const def = CASE_BY_ID.get('firstFinds')!;
    expect(caseProgress(s, 'firstFinds')).toEqual({ have: 0, need: def.need });
    for (let i = 0; i < def.need; i++) own(s);
    expect(caseComplete(s, 'firstFinds')).toBe(true);
    // ...and the relics are still yours.
    expect(s.relics.held).toHaveLength(def.need);
  });

  it('reads the other collections from their own registries', () => {
    const { s } = fresh();
    s.combat.seen = ['a', 'b', 'c'];
    expect(caseProgress(s, 'quietRoom').have).toBe(3);
    s.materials.gems = { ruby: 2, jade: 1, dead: 0 };
    expect(gemKinds(s)).toBe(2);
    s.lattice.discovered = ['x', 'y'];
    s.crucible.discovered = ['z'];
    expect(codexCount(s)).toBe(3);
  });

  /** The load-bearing one: ownership falls, a permanent bonus must not. */
  it('completion is REMEMBERED — scrapping a relic never claws a bonus back', () => {
    const { s } = fresh();
    const def = CASE_BY_ID.get('firstFinds')!;
    const rs = Array.from({ length: def.need }, () => own(s));
    noteMuseum(s, ctx);
    expect(s.museum.completed).toContain('firstFinds');
    const paid = museumBonus(s, def.bucket);
    expect(paid).toBeGreaterThan(0);

    s.relics.held = s.relics.held.filter((r) => r.uid !== rs[0]!.uid);
    expect(caseComplete(s, 'firstFinds')).toBe(false);   // the shelf has a gap
    expect(s.museum.completed).toContain('firstFinds');  // the record does not
    expect(museumBonus(s, def.bucket)).toBe(paid);
  });

  it('the floor bonus rises with filled halls and formed sets', () => {
    const { s } = fresh();
    expect(museumFloorBonus(s)).toBe(0);
    s.museum.completed = ['firstFinds'];
    const withHall = museumFloorBonus(s);
    expect(withHall).toBeGreaterThan(0);
    s.museum.exhibitsFound = ['lastShift'];
    expect(museumFloorBonus(s)).toBeGreaterThan(withHall);
  });
});

describe('sets are statements about the collection, found not listed', () => {
  it('THE LAST SHIFT fires on four out of one run, and names those four', () => {
    const { engine, s } = fresh();
    const def = EXHIBITS.find((e) => e.id === 'lastShift')!;
    for (let i = 0; i < 3; i++) own(s, { run: 9 });
    expect(activeExhibits(s).map((a) => a.def.id)).not.toContain('lastShift');
    own(s, { run: 9 });
    const live = activeExhibits(s).find((a) => a.def.id === 'lastShift');
    expect(live).toBeDefined();
    expect(live!.members.length).toBeGreaterThanOrEqual(def.need);
    expect(exhibitBonus(s, def.bucket)).toBeCloseTo(def.bonus, 6);

    // PILLAR 5: written down only once it has actually happened.
    expect(s.museum.exhibitsFound).not.toContain('lastShift');
    engine.tick(2);
    expect((engine.getState() as GameState).museum.exhibitsFound).toContain('lastShift');
  });

  it("ONE HAND'S WORK reads the drill that found each — the A.46 record, not a copy", () => {
    const { s } = fresh();
    for (let i = 0; i < 4; i++) own(s, { by: 'Old Tom', run: i });
    expect(activeExhibits(s).map((a) => a.def.id)).toContain('oneHandsWork');
  });

  it('A WANDERING LIFE wants one from every kind of place', () => {
    const { s } = fresh();
    for (const source of ['depth', 'warren', 'anomaly', 'well', 'expedition']) own(s, {}, { source });
    expect(activeExhibits(s).map((a) => a.def.id)).not.toContain('wanderingLife');
    own(s, {}, { source: 'warden' });
    expect(activeExhibits(s).map((a) => a.def.id)).toContain('wanderingLife');
  });

  it('THE WORKED ONES is about what you MADE, not what you found', () => {
    const { s } = fresh();
    for (let i = 0; i < 3; i++) own(s, {}, { fusedFrom: 2 });
    expect(activeExhibits(s).map((a) => a.def.id)).not.toContain('theWorked');
    for (const r of s.relics.held) r.fusedFrom = 3;
    expect(activeExhibits(s).map((a) => a.def.id)).toContain('theWorked');
  });

  /** A set you would trip over by holding forty commons is not a discovery. */
  it('no set fires on a pile of identical commons', () => {
    const { s } = fresh();
    for (let i = 0; i < 12; i++) own(s, { run: i, depth: 150, by: undefined }, { rarity: 0 });
    const ids = activeExhibits(s).map((a) => a.def.id);
    expect(ids).not.toContain('lastShift');
    expect(ids).not.toContain('wanderingLife');
    expect(ids).not.toContain('everyColour');
    expect(ids).not.toContain('wokenTogether');
  });

  it('a set comes apart again when the collection does', () => {
    const { s } = fresh();
    for (let i = 0; i < 4; i++) own(s, { run: 2 });
    expect(activeExhibits(s).map((a) => a.def.id)).toContain('lastShift');
    s.relics.held.pop();
    expect(activeExhibits(s).map((a) => a.def.id)).not.toContain('lastShift');
    // ...but it stays in the Codex, because it did happen.
    noteMuseum(s, ctx);
    for (let i = 0; i < 4; i++) own(s, { run: 5 });
    noteMuseum(s, ctx);
    s.relics.held = [];
    expect(s.museum.exhibitsFound).toContain('lastShift');
  });
});

describe('curation still gates fusion — the edge that already existed', () => {
  /**
   * SYSTEM_IMPROVEMENTS lists "curation gates relic fusion tiers" as a PLANNED
   * edge. It shipped in B4 (`MUSEUM_FUSION_NEED`). Verified here rather than
   * rebuilt — the ledger-is-a-claim rule, applied to the design doc.
   */
  it('filled halls are what raise the relic rarity floor', () => {
    const { s } = fresh();
    const before = s.relics.floorBonus;
    const need = CASE_BY_ID.get('firstFinds')!.need;
    for (let i = 0; i < need; i++) own(s);
    noteMuseum(s, ctx);
    expect(s.museum.completed).toContain('firstFinds');
    expect(s.relics.floorBonus).toBeGreaterThan(before);
  });
});
