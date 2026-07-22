/**
 * The 40 Chords and 8 Progressions of the Shell I Lattice.
 *
 * Chord identity is combinatorial: shape (4) × line context (5) × rank
 * uniformity (2) = 40. Every combination has a name, flavour, and either a
 * bucket effect scaled by the line's summed ranks, or a DOOR — a permanent
 * unlock that survives even if the chord is later broken. Uniform-rank
 * variants are the stronger siblings of their mixed twins.
 *
 * Shape families: circle = the face and its waters (regen/cap/motifs);
 * square = industry (kiln/brick); triangle = extraction (dust/drills);
 * hex = seals and meta (xp/descent/offline).
 */
import type { Bucket } from '../../modifiers';
import type { ChordContext, ProgressionStep } from '../../systems/lattice/latticeCore';
import { chordId } from '../../systems/lattice/latticeCore';
import type { MotifShape } from '../../types';

export type LatticeDoor = 'ring4' | 'progressions' | 'press';

export interface ChordDef {
  id: string;
  shape: MotifShape;
  context: ChordContext;
  uniform: boolean;
  name: string;
  flavor: string;
  /** Stat chords: bucket + percent per summed rank (negative = reduction). */
  bucket?: Bucket;
  pctPerRank?: number;
  /** Door chords: a permanent unlock instead of a multiplier. */
  door?: LatticeDoor;
}

const C = (
  shape: MotifShape,
  context: ChordContext,
  uniform: boolean,
  name: string,
  flavor: string,
  rest: Partial<ChordDef>,
): ChordDef => ({ id: chordId(shape, context, uniform), shape, context, uniform, name, flavor, ...rest });

export const CHORD_DEFS: ChordDef[] = [
  // --- CIRCLE — wells, springs, cycles -----------------------------------
  C('circle', 'isolated', false, 'Quiet Spring', 'Water finds its own way down.', { bucket: 'regen', pctPerRank: 0.5 }),
  C('circle', 'isolated', true, 'Perfect Well', 'Three mouths of one depth, drinking the same dark.', { bucket: 'regen', pctPerRank: 0.9 }),
  C('circle', 'supported', false, 'Gathering Pool', 'Rings beside rings; the water remembers all of them.', { bucket: 'cap', pctPerRank: 0.6 }),
  C('circle', 'supported', true, 'Deep Cistern', 'Built round, banked round, and it has never once run dry.', { bucket: 'cap', pctPerRank: 1.1 }),
  C('circle', 'flowing', false, 'The Grammar', 'The circles lean toward the square, and suddenly the order of things is legible.', { door: 'progressions' }),
  C('circle', 'flowing', true, 'Turning Rings', 'Each ring hands its motion to the next. None of it is wasted.', { bucket: 'motifGain', pctPerRank: 1.2 }),
  C('circle', 'opposed', false, 'Besieged Spring', 'Pressed on all sides, the water rises harder.', { bucket: 'regen', pctPerRank: 0.8 }),
  C('circle', 'opposed', true, 'Stone-Ringed Well', 'What surrounds it cannot enter it. That is the point of a well.', { bucket: 'regen', pctPerRank: 1.4 }),
  C('circle', 'attended', false, 'Court of Rings', 'Watched but unhurried, the circles go on being circles.', { bucket: 'motifGain', pctPerRank: 0.8 }),
  C('circle', 'attended', true, 'Round Assembly', 'A quorum of equals. The rock defers.', { bucket: 'cap', pctPerRank: 0.8 }),

  // --- SQUARE — masonry, industry ----------------------------------------
  C('square', 'isolated', false, 'First Course', 'Every wall in the world began as three bricks in a row.', { bucket: 'brickYield', pctPerRank: 0.8 }),
  C('square', 'isolated', true, 'True Course', 'Level, plumb, and proud of it.', { bucket: 'brickYield', pctPerRank: 1.4 }),
  C('square', 'supported', false, 'The Press', 'Squares braced by squares. Something heavy becomes something useful.', { door: 'press' }),
  C('square', 'supported', true, 'Bonded Wall', 'Each block carries its neighbours. The kiln breathes easier.', { bucket: 'kilnRate', pctPerRank: 1.3 }),
  C('square', 'flowing', false, 'Feeding Line', 'The wall passes its weight forward like a bucket brigade.', { bucket: 'kilnRate', pctPerRank: 0.8 }),
  C('square', 'flowing', true, 'Fed Furnace Row', 'Stoked in sequence, burning in step.', { bucket: 'kilnRate', pctPerRank: 1.4 }),
  C('square', 'opposed', false, 'Loadbearing', 'It holds because something is trying to bring it down.', { bucket: 'brickYield', pctPerRank: 1.1 }),
  C('square', 'opposed', true, 'Buttress Line', 'Three squares set against the six-sided dark, unbowed.', { bucket: 'brickYield', pctPerRank: 1.8 }),
  C('square', 'attended', false, 'Worked Yard', 'Busy hands around the masonry. The fire catches faster.', { bucket: 'kilnHeatRamp', pctPerRank: 1.5 }),
  C('square', 'attended', true, 'Guild Row', 'A street of equal houses, every chimney drawing well.', { bucket: 'kilnHeatRamp', pctPerRank: 2.5 }),

  // --- TRIANGLE — wedges, extraction -------------------------------------
  C('triangle', 'isolated', false, 'Lone Wedge', 'One line of intent, driven into nothing in particular. It still splits.', { bucket: 'dustYield', pctPerRank: 0.6 }),
  C('triangle', 'isolated', true, 'Clean Split', 'Struck once, true, and the stone agrees to open.', { bucket: 'dustYield', pctPerRank: 1.1 }),
  C('triangle', 'supported', false, 'Toothed Seam', 'Wedge behind wedge — the drills learn the angle.', { bucket: 'drillPower', pctPerRank: 1.0 }),
  C('triangle', 'supported', true, 'Serried Teeth', 'A jaw of matched edges. The rock stops arguing.', { bucket: 'drillPower', pctPerRank: 1.8 }),
  C('triangle', 'flowing', false, 'Driven Wedge', 'Each blow lands where the last one pointed.', { bucket: 'drillSpeed', pctPerRank: 1.0 }),
  C('triangle', 'flowing', true, 'Hammer Rhythm', 'The cadence of good work. You could set a clock by it.', { bucket: 'drillSpeed', pctPerRank: 1.8 }),
  C('triangle', 'opposed', false, 'Bitter Edge', 'Sharpened on what resists it.', { bucket: 'dustYield', pctPerRank: 0.9 }),
  C('triangle', 'opposed', true, 'Defiant Edge', 'The circle says stop. The wedge has never once heard it.', { bucket: 'dustYield', pctPerRank: 1.6 }),
  // Phase 3: the Lattice talks to the material game — Quarry Chorus finds ore.
  C('triangle', 'attended', false, 'Quarry Chorus', 'Every shape leaning in to watch the cut — and to point at what glitters in it.', { bucket: 'dropRate', pctPerRank: 1.0 }),
  C('triangle', 'attended', true, 'Measured Cut', 'An audience makes a craftsman careful. Careful is fast.', { bucket: 'dustYield', pctPerRank: 1.2 }),

  // --- HEX — seals, meta --------------------------------------------------
  // Phase 3: Old Seal reads the rock — assays run faster under it.
  C('hex', 'isolated', false, 'Old Seal', 'Whoever set these knew what they were closing — and what it was worth.', { bucket: 'assaySpeed', pctPerRank: 1.0 }),
  C('hex', 'isolated', true, 'The Keystone', 'Three seals of one weight, alone by design. The outer ring answers.', { door: 'ring4' }),
  C('hex', 'supported', false, 'Seal Line', 'Wards keep better company with wards.', { bucket: 'xpGain', pctPerRank: 1.0 }),
  C('hex', 'supported', true, 'Triple Sigil', 'Thrice-signed. The dark countersigns.', { bucket: 'xpGain', pctPerRank: 1.7 }),
  C('hex', 'flowing', false, 'Descending Steps', 'Each seal opens the way to the next.', { bucket: 'descendCost', pctPerRank: -0.35 }),
  C('hex', 'flowing', true, 'The Stair Unbroken', 'A stairway cut by someone who meant to come back. They did not.', { bucket: 'descendCost', pctPerRank: -0.6 }),
  C('hex', 'opposed', false, 'Ward of Patience', 'It outlasts what presses against it. So do you.', { bucket: 'offlineEffAdd', pctPerRank: 0.2 }),
  C('hex', 'opposed', true, 'Vigil Ward', 'It does not sleep, so that you may.', { bucket: 'offlineEffAdd', pctPerRank: 0.35 }),
  // Phase 3: Counsel of Six advises on where the good veins are.
  C('hex', 'attended', false, 'Counsel of Six', 'Advice from every side. Some of it is even good — the part about where to dig.', { bucket: 'dropRate', pctPerRank: 0.9 }),
  C('hex', 'attended', true, 'The Sixfold Court', 'All six sides in session. The verdict favours the digger.', { bucket: 'xpGain', pctPerRank: 1.5 }),
];

export const CHORD_BY_ID: Record<string, ChordDef> = Object.fromEntries(
  CHORD_DEFS.map((c) => [c.id, c]),
);

/** Floor for descend-cost reductions from chords. */
export const DESCEND_COST_FLOOR = 0.5;

// ---------------------------------------------------------------------------
// Progressions — chord sequences read in placement order. Rarer, stronger.
// ---------------------------------------------------------------------------

export interface ProgressionDef {
  id: string;
  name: string;
  flavor: string;
  steps: ProgressionStep[];
  /** Flat multipliers (or additive for offlineEffAdd) while the sequence holds. */
  effects: { bucket: Bucket; mult: number }[];
}

export const PROGRESSION_DEFS: ProgressionDef[] = [
  {
    id: 'longDescent',
    name: 'The Long Descent',
    flavor: 'Three wedges, driven in order, each deeper than the last.',
    steps: [{ shape: 'triangle' }, { shape: 'triangle' }, { shape: 'triangle' }],
    effects: [{ bucket: 'dustYield', mult: 1.75 }],
  },
  {
    id: 'roundOfCoals',
    name: 'Round of Coals',
    flavor: 'One wall raised, then another, while the first still holds its heat.',
    steps: [{ shape: 'square' }, { shape: 'square' }],
    effects: [{ bucket: 'brickYield', mult: 2 }],
  },
  {
    id: 'turningWheel',
    name: 'The Turning Wheel',
    flavor: 'Circle into square into wedge into seal — the whole engine of the world, in order.',
    steps: [{ shape: 'circle' }, { shape: 'square' }, { shape: 'triangle' }, { shape: 'hex' }],
    effects: [
      { bucket: 'dustYield', mult: 1.5 },
      { bucket: 'xpGain', mult: 1.5 },
    ],
  },
  {
    id: 'rootBeforeCrown',
    name: 'Root Before Crown',
    flavor: 'The spring was dug before the seal was set. It matters which came first.',
    steps: [{ shape: 'circle' }, { shape: 'hex' }],
    effects: [{ bucket: 'regen', mult: 1.6 }],
  },
  {
    id: 'marchOfCourses',
    name: 'March of Courses',
    flavor: 'Two true walls, raised in step, neither out of plumb.',
    steps: [{ shape: 'square', uniform: true }, { shape: 'square', uniform: true }],
    effects: [{ bucket: 'kilnRate', mult: 1.75 }],
  },
  {
    id: 'quietScale',
    name: 'The Quiet Scale',
    flavor: 'Seal upon seal. The dig keeps its own hours now.',
    steps: [{ shape: 'hex' }, { shape: 'hex' }],
    effects: [{ bucket: 'offlineEffAdd', mult: 0.05 }],
  },
  {
    id: 'veinSong',
    name: 'Vein Song',
    flavor: 'The wedge found the rhythm; the circle gave it a voice.',
    steps: [{ shape: 'triangle', context: 'flowing' }, { shape: 'circle' }],
    effects: [{ bucket: 'drillPower', mult: 1.75 }],
  },
  {
    id: 'sablesCadence',
    name: "Sable's Cadence",
    flavor: 'Five figures in sequence — her journals sketch this exact board, margins full of exclamation marks.',
    steps: [{}, {}, {}, {}, {}],
    effects: [
      { bucket: 'motifGain', mult: 2 },
      { bucket: 'dustYield', mult: 1.3 },
    ],
  },
];

export const PROGRESSION_BY_ID: Record<string, ProgressionDef> = Object.fromEntries(
  PROGRESSION_DEFS.map((p) => [p.id, p]),
);
