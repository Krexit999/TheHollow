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

  it('two codex surfaces: parallel, and THE DEAD', () => {
    // B5's rule is that a codex surface is a reference you READ — reachable
    // like any tab, exempt from the payoff floor, outside the counted system
    // number. THE DEAD (§48.1, A.105) is the second one and it is the purest
    // case in the game: it produces nothing at all, deliberately, and
    // `dead.test.ts` §5 reads dpsMax either side of finding every object to
    // hold that. Counting it as a system would demand a payoff it exists not
    // to have.
    const codex = ALL_SYSTEMS.filter((sys) => sys.codex).map((sys) => sys.id).sort();
    expect(codex).toEqual(['dead', 'parallel']);
  });

  /**
   * Recorded here so the next change is a deliberate act rather than a drift.
   */
  it('the counted-system number matches the three surviving clusters', () => {
    // 18 since A.77: THE DESK (A.76, the Reading) and GEAR joined their clusters.
    // 19 since A.103: THE INVERSIONS joined at the Spiral — the room the ten
    // rule-inversions are started from, which is a system with a payoff and not
    // a codex surface, so it counts.
    expect(ALL_SYSTEMS.filter((sys) => !sys.codex).length).toBe(19);
    expect(CLUSTERS.length).toBe(3);
  });
});
