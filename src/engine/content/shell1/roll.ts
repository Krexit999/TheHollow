/**
 * THE ROLL — LOAM'S FIFTEEN STATIONS (§1.3).
 *
 * The shaft is a numbered, named list of places. Between them the rock is
 * procedural; these are the rungs that have names, and a player learns them.
 *
 * WHAT IS AUTHORED HERE NEVER MOVES: name, depth, type, and a WALL's hardness.
 * Everything a station HOLDS — its seam, its feature, a hazard's intensity —
 * is rolled fresh at every Collapse (systems/roll.ts). The Ashfall is always
 * The Ashfall: hazard, at depth 72. What is in it this time is not what was in
 * it last time. The place is authored; the contents are generated.
 *
 * THE TWO WALLS ARE THE HARDNESS WALLS THAT ALREADY EXISTED. BRICKLIGHT sits at
 * 44 and the shell's tier-II wall at 45; THE KNOT at 109 and tier III at 110.
 * That is deliberate — the Roll gives the existing walls a name and a face
 * rather than adding a second gate beside them.
 */

export type StationType = 'seam' | 'wall' | 'wreck' | 'works' | 'chamber' | 'hazard' | 'rest' | 'floor';

export interface StationDef {
  id: string;
  /** Depth at which the station sits. Never moves. */
  depth: number;
  name: string;
  type: StationType;
  /** WALL only: the tool tier that opens it. Never moves; clearance is forever. */
  hardness?: number;
  /** WRECK only: what was lost here. Looting turns the station into a WORKS. */
  wreck?: string;
  /**
   * THE RE-ROLL BAND, and it is deliberately NARROW (§45.1 risk 3): if a
   * station's contents change too much the name stops meaning anything and the
   * ladder loses the legibility that justified it. Two or three candidates per
   * station, drawn from its own depth band — so Sinter Row is always a place
   * where you find one of the same short list, and never a surprise.
   */
  seams?: string[];
  /**
   * WHAT IS BURIED HERE — and it is a SEPARATE FIELD from `seams` on purpose.
   *
   * The first cut put the remains in `seams`, which broke a rule that was right:
   * the re-roll band is two or three candidates because a station whose contents
   * swing widely stops meaning anything (§45.1 risk 3), and `roll.test.ts`
   * enforces it. Five candidates at The Sag failed that test, correctly.
   *
   * They are different things. A SEAM is what this place is featuring THIS RUN
   * and it re-rolls at every Collapse. REMAINS are what is in the ground here,
   * permanently — the Tapmother's roots do not move because the shaft fell in.
   * So the re-roll never touches this, and `remainsAt` never reads `seams`.
   */
  remains?: string[];
  /** One line the row can show when it is legible. */
  line?: string;
}

/** Stations a player passes but which hold no seam: their contents are the place. */
const NO_SEAM: string[] = [];

/**
 * THE REMAINS ARE SEAMED HERE, AND THIS IS THE ONLY PLACE THEY EXIST (A.84).
 *
 * Six Loam materials were `source: 'combat'` after combat was cut, which made
 * them unobtainable by any route in the game. They are not in the rarity pool
 * — dropping them in would have thinned Loam's four commons and three riches
 * by a third, and those are the stones the tier-II floor recipe and the whole
 * shallow chain board are made of. They are in PLACES instead: `remainsAt` in
 * materials.ts reads the `remains` lists below and substitutes a share of the
 * drops within four depths of the station.
 *
 * So a seam entry here is now load-bearing rather than decorative — it is the
 * ONLY thing that makes these six drop. Which is also why the material audit
 * had to learn to skip this file: naming a stone in a place you FIND it is the
 * opposite of consuming it, and counting it as a consumer is a fake rescue.
 *
 *   chitinshard   The Sag 17 · Marlgate 40      buried under a slow roof-fall
 *   gravemote     Kiln Yard 9 · The Ashfall 72  it drifts, so it is where dust hangs
 *   wormsilk      The Sag 17 · The Undersill 28 damp forever, so: the damp places
 *   burrowertooth The Undersill 28 · Long Cut 47 something bored that shortcut
 *   marrowglass   Sinter Row 60 · Umberdeep 90  cooked once already; vitrified
 *   taproot       DEEPGRAVE 150                 her roots, and only at the floor
 *
 * Every one still answers to its RARITY GATE, so Marrowglass (pure, gate 40)
 * cannot come up at a shallower station even if one seamed it.
 */

export const LOAM_ROLL: StationDef[] = [
  {
    id: 'turnrow', depth: 0, name: 'The Turnrow', type: 'seam',
    seams: ['marl', 'ochre'],
    line: 'Where the cart turns around. Everything you own started here.',
  },
  {
    id: 'kilnyard', depth: 9, name: 'Kiln Yard', type: 'wreck', wreck: 'THE KILN',
    seams: ['ochre', 'bonechalk'], remains: ['gravemote'],
    line: 'Somebody fired brick here until they stopped.',
  },
  {
    id: 'sag', depth: 17, name: 'The Sag', type: 'seam',
    seams: ['bonechalk', 'graveclay', 'marl'], remains: ['chitinshard', 'wormsilk'],
    line: 'The roof came down slowly enough that they kept working under it.',
  },
  {
    id: 'undersill', depth: 28, name: 'The Undersill', type: 'wreck', wreck: 'A DRILL',
    seams: ['graveclay', 'loamiron'], remains: ['wormsilk', 'burrowertooth'],
    line: 'Under the sill, where things roll to and are not fetched back.',
  },
  /**
   * THE TWO REST STATIONS, AND WHY THEY ARE NEW.
   *
   * `rest` has been in `StationType` and in the label map since the Roll was
   * built, and NOT ONE OF LOAM'S FIFTEEN STATIONS USED IT. §40.1 gates gear
   * swapping on standing at a REST — so shipping that rule against this
   * geography would have made gear permanently unswappable: a system that
   * cannot be used, behind a refusal that always fires.
   *
   * So the type gets its stations. Two, one in each half of the run, at depths
   * that sat empty (28→40 and 72→90). They hold no seam; the place IS the
   * contents, which is what `NO_SEAM` is for.
   */
  {
    id: 'lampline', depth: 33, name: 'The Lampline', type: 'rest',
    seams: NO_SEAM,
    line: 'A row of hooks, most of them empty. Somebody kept this stretch lit on purpose.',
  },
  {
    id: 'marlgate', depth: 40, name: 'Marlgate', type: 'chamber',
    seams: ['marl', 'graveclay', 'rootglass'], remains: ['chitinshard'],
    line: 'A room, and the marl worked into a gate that shuts on nothing.',
  },
  {
    id: 'bricklight', depth: 44, name: 'BRICKLIGHT', type: 'wall', hardness: 2,
    seams: NO_SEAM,
    line: 'The rock goes pale and hard here, and it does not care how long you have been at it.',
  },
  {
    id: 'longcut', depth: 47, name: 'The Long Cut', type: 'wreck', wreck: 'CRUSHER',
    seams: ['loamiron', 'duskflint'], remains: ['burrowertooth'],
    line: 'A shortcut that took longer than the way round.',
  },
  {
    id: 'sinterrow', depth: 60, name: 'Sinter Row', type: 'wreck', wreck: 'REFINERY',
    seams: ['loamiron', 'duskflint', 'rootglass'], remains: ['marrowglass'],
    line: 'Everything here has been cooked once already.',
  },
  {
    id: 'ashfall', depth: 72, name: 'The Ashfall', type: 'hazard',
    seams: ['duskflint', 'bonechalk'], remains: ['gravemote'],
    line: 'Dust that has not settled in a hundred years and is in no hurry.',
  },
  {
    id: 'lowbench', depth: 80, name: 'The Low Bench', type: 'rest',
    seams: NO_SEAM,
    line: 'Cut into the wall at sitting height, worn smooth. You are not the first to stop here.',
  },
  {
    id: 'umberdeep', depth: 90, name: 'Umberdeep', type: 'seam',
    seams: ['umberjade', 'hollowamber'], remains: ['marrowglass'],
    line: 'Deep enough that the good stone stops being a rumour.',
  },
  {
    id: 'quillrest', depth: 98, name: 'Quillrest', type: 'wreck', wreck: 'THE READING',
    // MILLSTONE is here so the trap is FINDABLE rather than merely possible.
    // It rolls out of the rarity table anywhere past depth 70, but a material
    // that only ever arrives by chance cannot be named by the Assay Bench —
    // and a trap the information system cannot warn you about is a gotcha,
    // which §16.3 is explicit it must not be. Seaming it here means the Bench
    // can read "Millstone · dense · brittle" off the row before you dig it.
    seams: ['umberjade', 'wormsteel', 'millstone'],
    line: 'Someone sat down here to write and did not get up.',
  },
  {
    id: 'knot', depth: 109, name: 'THE KNOT', type: 'wall', hardness: 3,
    seams: NO_SEAM,
    line: 'The seams cross each other and pull tight. It has held longer than the shaft has existed.',
  },
  {
    id: 'shoringdeep', depth: 120, name: 'Shoring Deep', type: 'wreck', wreck: 'SHORING RIG',
    seams: ['wormsteel', 'palegold'],
    line: 'They propped it and propped it and then left the props.',
  },
  {
    id: 'longroom', depth: 135, name: 'The Long Room', type: 'chamber',
    seams: ['palegold', 'chthonite', 'starmarl'],
    line: 'It goes further than the lamp does.',
  },
  {
    id: 'deepgrave', depth: 150, name: 'DEEPGRAVE', type: 'floor',
    seams: ['sablequartz', 'starmarl'], remains: ['taproot'],
    line: 'The floor of this world. It sounds hollow underfoot.',
  },
];

/**
 * FEATURES — the second thing a Collapse re-rolls. Narrow on purpose, and
 * Signs are deliberately absent: they are their own system and not built.
 */
export const ROLL_FEATURES = ['nothing', 'geode', 'journal', 'dry'] as const;
export type RollFeature = (typeof ROLL_FEATURES)[number];

/**
 * ONE WORD EACH. The row is `seam · feature` inside about 140px at 380px, and
 * "a page of somebody's journal" truncated to "a page of som…" — which reads as
 * a broken layout rather than as information. The §1 mock's middle column is
 * one short phrase; this keeps it one.
 */
export const FEATURE_LABEL: Record<RollFeature, string> = {
  nothing: '—',
  geode: 'geode',
  journal: 'journal',
  dry: 'dry',
};

export const TYPE_LABEL: Record<StationType, string> = {
  seam: 'SEAM',
  wall: 'WALL',
  wreck: 'WRECK',
  works: 'WORKS',
  chamber: 'CHAMBER',
  hazard: 'HAZARD',
  rest: 'REST',
  floor: 'FLOOR',
};

export function loamRoll(): StationDef[] {
  return LOAM_ROLL;
}

export function stationDef(id: string): StationDef | undefined {
  return LOAM_ROLL.find((s) => s.id === id);
}
