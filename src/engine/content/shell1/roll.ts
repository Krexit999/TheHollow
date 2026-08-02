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
  /** One line the row can show when it is legible. */
  line?: string;
}

/** Stations a player passes but which hold no seam: their contents are the place. */
const NO_SEAM: string[] = [];

export const LOAM_ROLL: StationDef[] = [
  {
    id: 'turnrow', depth: 0, name: 'The Turnrow', type: 'seam',
    seams: ['marl', 'ochre'],
    line: 'Where the cart turns around. Everything you own started here.',
  },
  {
    id: 'kilnyard', depth: 9, name: 'Kiln Yard', type: 'wreck', wreck: 'THE KILN',
    seams: ['ochre', 'bonechalk'],
    line: 'Somebody fired brick here until they stopped.',
  },
  {
    id: 'sag', depth: 17, name: 'The Sag', type: 'seam',
    seams: ['bonechalk', 'graveclay', 'marl'],
    line: 'The roof came down slowly enough that they kept working under it.',
  },
  {
    id: 'undersill', depth: 28, name: 'The Undersill', type: 'wreck', wreck: 'A DRILL',
    seams: ['graveclay', 'loamiron'],
    line: 'Under the sill, where things roll to and are not fetched back.',
  },
  {
    id: 'marlgate', depth: 40, name: 'Marlgate', type: 'chamber',
    seams: ['marl', 'graveclay', 'rootglass'],
    line: 'A room, and the marl worked into a gate that shuts on nothing.',
  },
  {
    id: 'bricklight', depth: 44, name: 'BRICKLIGHT', type: 'wall', hardness: 2,
    seams: NO_SEAM,
    line: 'The rock goes pale and hard here, and it does not care how long you have been at it.',
  },
  {
    id: 'longcut', depth: 47, name: 'The Long Cut', type: 'wreck', wreck: 'CRUSHER',
    seams: ['loamiron', 'duskflint'],
    line: 'A shortcut that took longer than the way round.',
  },
  {
    id: 'sinterrow', depth: 60, name: 'Sinter Row', type: 'wreck', wreck: 'REFINERY',
    seams: ['loamiron', 'duskflint', 'rootglass'],
    line: 'Everything here has been cooked once already.',
  },
  {
    id: 'ashfall', depth: 72, name: 'The Ashfall', type: 'hazard',
    seams: ['duskflint', 'bonechalk'],
    line: 'Dust that has not settled in a hundred years and is in no hurry.',
  },
  {
    id: 'umberdeep', depth: 90, name: 'Umberdeep', type: 'seam',
    seams: ['umberjade', 'hollowamber'],
    line: 'Deep enough that the good stone stops being a rumour.',
  },
  {
    id: 'quillrest', depth: 98, name: 'Quillrest', type: 'wreck', wreck: 'THE READING',
    seams: ['umberjade', 'wormsteel'],
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
    seams: ['sablequartz', 'starmarl'],
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
