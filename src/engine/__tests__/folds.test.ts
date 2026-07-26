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
import { D } from '../decimal';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { CONFLUENCES } from '../systems/confluence';
import { CURE_RECIPES } from '../systems/curing';
import { WELLS, WELL_TAP_SPEED, wellProgress, wellTapLive } from '../content/shell5/wells';
import { CONSTELLATIONS } from '../content/shell4/observatory';
import { lensFor } from '../content/shell4/bench';
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

describe('the pressure tap', () => {
  it('a well fed while the gallery vents hot runs 25% faster; untapped is untouched', () => {
    const { s } = fresh();
    s.depthRecords['cinder'] = 200; // mastery 6
    // untapped: at 75% of the printed minutes the rope is still down
    s.pressure.heat = 0;
    s.wells.active.push({ wellId: 'nearWell', currencyId: 'slag', amount: D(200), startedMs: 0 });
    const well = WELLS[0]!;
    s.guild.clockMs = well.minutes * 60_000 * WELL_TAP_SPEED;
    expect(wellProgress(s, 'nearWell')).toBeLessThan(1);
    // tapped: the same fraction of the clock resolves it
    s.pressure.heat = 60;
    s.pressure.pipes = [1, 0, 0];
    expect(wellTapLive(s)).toBe(true);
    s.wells.active.push({ wellId: 'deepWell', currencyId: 'ember', amount: D(60), startedMs: 0, tapped: true });
    const deep = WELLS[1]!;
    s.guild.clockMs = deep.minutes * 60_000 * WELL_TAP_SPEED + 1;
    expect(wellProgress(s, 'deepWell')).toBe(1);
  });
});

describe('star charts are lens blueprints', () => {
  it('grinding needs the constellation closed, costs silica, and the lens pays', () => {
    const { engine, s } = fresh();
    s.depthRecords['glassmere'] = 150; // bench mastery
    s.currencies['silica'] = D(1000);
    const refused = engine.dispatch({ type: 'grindChartLens', constellationId: 'pick' });
    expect(refused.ok).toBe(false);
    expect((refused as { reason: string }).reason).toContain('Observatory');

    s.observatory.constellations.push('pick');
    expect(engine.dispatch({ type: 'grindChartLens', constellationId: 'pick' }).ok).toBe(true);
    expect(s.bench.solved).toContain('chart:pick');
    expect(engine.dispatch({ type: 'grindChartLens', constellationId: 'pick' }).ok).toBe(false); // once

    const lens = lensFor('chart:pick');
    expect(lens.name).toBe('Lens of The Pick');
    const before = computeBucket(s, lens.bucket).toNumber();
    expect(engine.dispatch({ type: 'equipLens', puzzleId: 'chart:pick' }).ok).toBe(true);
    expect(computeBucket(s, lens.bucket).toNumber()).toBeGreaterThan(before);
  });

  it('every constellation yields a well-formed lens (no inert buckets)', () => {
    for (const con of CONSTELLATIONS) {
      const lens = lensFor(`chart:${con.id}`);
      expect(lens.name, con.id).toContain(con.name);
      // The Door maps to regen — offlineEffAdd is additive and no lens mount
      // carries it; everything else echoes its own theme.
      if (con.bonus.bucket === 'offlineEffAdd') expect(lens.bucket).toBe('regen');
      expect(lens.value, con.id).not.toBe(1);
    }
  });
});

describe('the nav fold', () => {
  it('wells are still no tab; their panel lives inside vents', () => {
    const ids = ALL_SYSTEMS.map((sys) => sys.id);
    expect(ids).not.toContain('wells');
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

  it('the counted-system number is 33 (was 32 before Museum unfolded)', () => {
    expect(ALL_SYSTEMS.filter((sys) => !sys.codex).length).toBe(33);
    expect(CLUSTERS.length).toBe(5); // the five rooms stand
  });
});
