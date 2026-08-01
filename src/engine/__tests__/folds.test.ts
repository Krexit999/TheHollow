/**
 * B5 — THE FOLDS. Each fold is tested for the ruled property:
 *  - the Journal's first-reads pay KNOWLEDGE (hints/cures), never twice,
 *    never ambiently;
 *  - a tapped well runs faster and an untapped one is exactly as before;
 *  - a closed sky grinds into a lens that PAYS through the pipeline;
 *  - the nav fold: wells are a room inside vents; museum was too (B5) and
 *    was unfolded back to its own tab in A.47 once it grew a real loop. The
 *    codex surfaces are flagged, not deleted.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { CONFLUENCES } from '../systems/confluence';
import { CURE_RECIPES } from '../systems/curing';
import { computeBucket } from '../modifiers';
import { CLUSTERS, ALL_SYSTEMS } from '../../ui/nav';

const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};

describe('the journal pays for reading', () => {
  it('first reads alternate cure/hint, a re-read pays nothing, and pools fall through', () => {
    const { engine, s } = fresh();
    s.guild.sable.found.push('p02', 'p03', 'p05');
    engine.dispatch({ type: 'markFragmentRead', fragmentId: 'p02' });
    expect(s.shaft.curesHinted.length).toBe(1); // odd read → a cure
    expect(s.confluences.hinted.length).toBe(0);
    engine.dispatch({ type: 'markFragmentRead', fragmentId: 'p02' }); // re-read
    expect(s.shaft.curesHinted.length + s.confluences.hinted.length).toBe(1);
    engine.dispatch({ type: 'markFragmentRead', fragmentId: 'p03' });
    expect(s.confluences.hinted.length).toBe(1); // even read → a hint
    engine.dispatch({ type: 'markFragmentRead', fragmentId: 'p05' });
    expect(s.shaft.curesHinted.length).toBe(2);
  });

  it('a hint is knowledge, not a bonus: nothing in the pipeline moves', () => {
    const { engine, s } = fresh();
    const before = computeBucket(s, 'dustYield').toNumber();
    s.guild.sable.found.push('p02');
    engine.dispatch({ type: 'markFragmentRead', fragmentId: 'p02' });
    expect(computeBucket(s, 'dustYield').toNumber()).toBe(before);
  });

  it('the pools cover every confluence and cure with pages to spare', () => {
    // 37 fragments; 23 confluences + 7 cures = 30 reveals — reading the whole
    // archive reveals everything, which is the incentive.
    expect(CONFLUENCES.length + CURE_RECIPES.length).toBeLessThanOrEqual(37);
  });
});

describe('the nav fold', () => {
  it('vents and relics keep their tabs', () => {
    const ids = ALL_SYSTEMS.map((sys) => sys.id);
    expect(ids).toContain('vents');
    expect(ids).toContain('relics');
  });

  /**
   * MUSEUM UNFOLDED (A.47). The B5 fold reasoned that curation gates fusion,
   * so keeping and curating were "one decision" and belonged under one header.
   * That reason held while the Museum was a donate button; it dissolved when
   * A.47 gave it its own arrange-and-discover loop (exhibits, identify,
   * curated halls) and stacking both full panels under one header buried the
   * exhibits below a long relic list. Same discipline as "a cut is
   * provisional, and its reason can dissolve" (PILLARS) — the fold's cause
   * is re-checked here, not assumed permanent.
   */
  it('museum is its own tab again', () => {
    const ids = ALL_SYSTEMS.map((sys) => sys.id);
    expect(ids).toContain('museum');
  });

  it('exactly three codex surfaces: bestiary, journal, parallel', () => {
    const codex = ALL_SYSTEMS.filter((sys) => sys.codex).map((sys) => sys.id).sort();
    expect(codex).toEqual(['bestiary', 'journal', 'parallel']);
  });

  /**
   * 24 AS OF A.72: ten nav tabs (greenhouse, mycelium, loom, bench, array,
   * chamber, brew, warrens, observatory, foundry) were cut along with their
   * systems, taking the count from 34 down to 24. Recorded here so the next
   * change is a deliberate act rather than a drift.
   */
  it('the counted-system number is 24 (A.72 cut ten craft-system tabs)', () => {
    expect(ALL_SYSTEMS.filter((sys) => !sys.codex).length).toBe(24);
    expect(CLUSTERS.length).toBe(5); // the five rooms stand
  });
});
