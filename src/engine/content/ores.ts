/**
 * ORES — the grid gets things in it.
 *
 * An ore is NOT a bonus cell and NOT a multiplier. It is a DENSER POCKET of
 * exactly what that rock was already going to give you: the cell holds more
 * (a bigger cap), it takes real time to open, and what comes out is the same
 * currency and the same drop table, concentrated.
 *
 * WHY THIS SHAPE IS PILLAR-2 SAFE, and it is the whole reason it was built this
 * way. `dpsMax = W·H·regen·Y`. An ore raises `cap` and NOTHING ELSE — regen is
 * untouched, yield is untouched, so the ceiling does not move by construction.
 * A bigger cap only lets the field BUFFER more of what it already produced,
 * which is a pillar-1 gift to a player who stepped away and a mild cost to one
 * who chips constantly. You can never take more charge out of an ore than the
 * rock put into it.
 *
 * SO WHERE IS THE REWARD? In the DROPS, not the charge. Opening an ore pays a
 * guaranteed roll (or several) on the drop table, rolled as if the seam were
 * `depthBonus` deeper. Drops sit outside the income path entirely — the same
 * argument relic affixes and THE CALL (drill alloy) make for `dropRate` — so
 * this is where a rarer ore can be worth dramatically more without the ceiling
 * noticing. An ore is worth stopping for because of what is IN it, not because
 * it prints Dust faster.
 *
 * THE CHOICE, which is the point of the feature:
 *   BY HAND  — slower, and takes the pocket CLEAN (all of it), with the full
 *              drop weight. Costs your attention for `digSec`.
 *   BY DRILL — faster per cell and free (your hands stay on the face), but a
 *              drill is not thorough: it leaves some in the rock and rolls the
 *              drops at the usual drill weight.
 * Neither is dead time and neither is forced. With no drills at all every ore
 * is still hand-mineable, which is the pillar-1 floor.
 *
 * PILLAR 5: which ore types exist is NOT a list you are shown. A type is
 * recorded the first time you open one, and the odds are described in the
 * game's voice ("the deep rock keeps more") rather than printed as a table.
 *
 * REACH: the three UNIVERSAL seams carry no shell, so every world has ore from
 * the first minute — the standing rule that a system may not go dead after
 * Loam. Per-shell types sit alongside them; Ferrite's Lodeknot is authored to
 * prove that path is live rather than a stub nobody ever ran.
 */

export interface OreDef {
  id: string;
  name: string;
  /**
   * Which shell's rock grows it, or null for a seam that forms anywhere.
   * The universal three are deliberately shell-agnostic: they are about the
   * rock being DENSE, which is not a property any one world owns.
   */
  shell: string | null;
  /** Cell cap multiplier — the "denser pocket". Never touches regen (pillar 2). */
  richness: number;
  /** Seconds of hand work to open it. A drill does it in `digSec * DRILL_ORE_SPEED`. */
  digSec: number;
  /**
   * Rolls its drops as if the seam were this much DEEPER, as a fraction of the
   * current depth plus a small floor so it still means something at the top.
   *
   * A fraction and not a flat number, and that is a correction rather than a
   * preference: the first cut used flat values (+15, +45, +90) and the sim
   * measured a pocket's rarity payoff at 0.96-1.05x of plain rock — nothing.
   * Fifteen depths is a rounding error at depth 40 and invisible at 400, so
   * the one thing an ore is actually FOR did not survive contact with the
   * drop table. Scaling with depth keeps it meaningful for the whole game.
   */
  depthMult: number;
  /** Guaranteed drop rolls when it opens. THIS is what an ore is worth. */
  rolls: number;
  /** Relative spawn weight among the types available at this depth. */
  weight: number;
  /** Nothing this rich forms in the shallows. */
  minDepth: number;
  /** What the face draws it as. */
  colour: number;
  /**
   * HOW the face draws it, and this is not decoration. Colour alone was not
   * enough: at 380px a tile is about 55 pixels across, and four crystals in
   * four hues read as "that is an ore" rather than as four different things.
   * Each pattern is a different SHAPE, so the type is legible at a glance —
   * and still legible to someone who cannot separate the hues.
   *   bands   — flat strata, a seam that swelled
   *   cluster — round nodules gathered in the dark
   *   core    — a soft hollow middle with cracks running out of it
   *   needles — spikes all leaning inward, filings around a magnet
   */
  pattern: 'bands' | 'cluster' | 'core' | 'needles';
  /** Shown only after one has been opened (pillar 5). */
  line: string;
}

export const ORES: OreDef[] = [
  // --- the universal seams: every shell, from the first minute ---------------
  {
    id: 'fatseam', name: 'Fat Seam', shell: null,
    richness: 1.8, digSec: 8, depthMult: 0.6, rolls: 1, weight: 62, minDepth: 0,
    colour: 0xe0b552, pattern: 'bands',
    line: 'The rock swells here. Something took its time about it.',
  },
  {
    id: 'blindglut', name: 'Blind Glut', shell: null,
    richness: 2.6, digSec: 12, depthMult: 1.4, rolls: 2, weight: 26, minDepth: 25,
    colour: 0x5fe0b4, pattern: 'cluster',
    line: 'No seam runs to it and none runs away. It simply gathered, in the dark, alone.',
  },
  {
    id: 'heartrot', name: 'Heartrot', shell: null,
    richness: 3.6, digSec: 16, depthMult: 3.0, rolls: 3, weight: 9, minDepth: 60,
    colour: 0xe85f9c, pattern: 'core',
    line: 'The stone went soft at its middle and kept everything it ever held.',
  },
  // --- per-shell types sit alongside them ------------------------------------
  // Ferrite's is AUTHORED rather than stubbed, so the per-shell path has a live
  // call site instead of a promise (the working rule: a test that a function
  // works is not a test that anything calls it). Shells III-VII have no rows
  // yet and fall back to the universal three, which is why nothing goes dead.
  {
    id: 'lodeknot', name: 'Lodeknot', shell: 'ferrite',
    richness: 3.0, digSec: 14, depthMult: 1.8, rolls: 2, weight: 22, minDepth: 0,
    colour: 0x74a6f5, pattern: 'needles',
    line: 'Every filing in the drift leans at it. Cut it out and the compasses settle again.',
  },
];

export const ORE_BY_ID = new Map(ORES.map((o) => [o.id, o]));

export function oreDef(id: string): OreDef | null {
  return ORE_BY_ID.get(id) ?? null;
}

/**
 * The cap multiplier for an ore id, or 1 for plain rock / an id this build no
 * longer authors. Kept here as a bare lookup so `face.ts` can read it in its
 * hot loop without importing the ore SYSTEM (which imports face.ts back).
 */
export function oreRichness(id: string | undefined): number {
  return (id && ORE_BY_ID.get(id)?.richness) || 1;
}

/** The types that can form in this shell at this depth. */
export function oreTable(shellId: string, depth: number): OreDef[] {
  return ORES.filter((o) => (o.shell === null || o.shell === shellId) && depth >= o.minDepth);
}

/**
 * Pick a type for a new pocket. `rarityLean` (>= 1) comes from the modifier
 * bucket: it does not add types, it tilts the roll toward the ones that were
 * already forming here, so a rarity upgrade is felt without being a list.
 */
export function rollOreType(shellId: string, depth: number, rarityLean: number, rng = Math.random): OreDef | null {
  // Commonest first, so "how rare is it" is just this list's index.
  const table = oreTable(shellId, depth).sort((a, b) => b.weight - a.weight);
  if (table.length === 0) return null;
  const lean = Math.max(1, rarityLean);
  // Each step up the rarity ladder gets multiplied by the lean again, so a
  // rarity upgrade tilts an EXISTING roll rather than unlocking anything —
  // there is no new type to reveal and therefore no list to leak (pillar 5).
  const weights = table.map((o, i) => o.weight * Math.pow(lean, i));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < table.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return table[i]!;
  }
  return table[table.length - 1]!;
}

/**
 * WHAT THE PLAYER IS TOLD ABOUT THE ODDS — a description, never a table
 * (pillar 5). It reads the live depth so it changes as you go down, which is
 * the honest way to say "the deep rock keeps more" without printing weights.
 */
export function oreOddsHint(shellId: string, depth: number): string {
  const table = oreTable(shellId, depth);
  if (table.length <= 1) return 'Shallow rock is even. What pockets there are, are plain ones.';
  if (table.length === 2) return 'Deep enough now that the odd pocket comes up fatter than it has any right to.';
  return 'Down here the rock keeps things. Most pockets are ordinary; a few are not, and there is no telling which until it opens.';
}
