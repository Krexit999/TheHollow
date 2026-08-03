/**
 * B5 — THE FOLDS. Each fold is tested for the ruled property:
 *  - the Journal's first-reads pay KNOWLEDGE (hints/cures), never twice,
 *    never ambiently;
 *  - a tapped well runs faster and an untapped one is exactly as before;
 *  - a closed sky grinds into a lens that PAYS through the pipeline;
 *  - the nav fold: wells are a room inside vents.
 *
 * THE SPEED-RUN CUT (A.7x) took combat, guild, museum/expeditions, workbench,
 * lattice, axioms/challenges/gridModules, excavations and legacy alloys —
 * bestiary, museum and journal went with the systems that fed them, so this
 * fold's old pins (museum's own tab, three codex surfaces, "24 systems") are
 * stale claims about a nav shape that no longer exists. Re-pinned to what
 * src/ui/nav.ts actually declares now.
 */
import { describe, expect, it } from 'vitest';
import { CLUSTERS, ALL_SYSTEMS } from '../../ui/nav';

describe('the nav fold', () => {
  it('vents and relics keep their tabs', () => {
    const ids = ALL_SYSTEMS.map((sys) => sys.id);
    expect(ids).toContain('vents');
    expect(ids).toContain('relics');
  });

  it('museum, bestiary and journal left with the systems that fed them', () => {
    const ids = ALL_SYSTEMS.map((sys) => sys.id);
    expect(ids).not.toContain('museum');
    expect(ids).not.toContain('bestiary');
    expect(ids).not.toContain('journal');
  });

  it('exactly one codex surface: parallel', () => {
    const codex = ALL_SYSTEMS.filter((sys) => sys.codex).map((sys) => sys.id).sort();
    expect(codex).toEqual(['parallel']);
  });

  /**
   * Recorded here so the next change is a deliberate act rather than a drift.
   */
  it('the counted-system number matches the three surviving clusters', () => {
    // 18 since A.77: THE DESK (A.76, the Reading) and GEAR joined their clusters.
    expect(ALL_SYSTEMS.filter((sys) => !sys.codex).length).toBe(18);
    expect(CLUSTERS.length).toBe(3);
  });
});
