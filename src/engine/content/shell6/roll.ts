/**
 * THE ROLL — HOLLOW'S SIXTEEN STATIONS (§1.3, §19, §49.2).
 *
 * The sixth authored geography, and the first with NO WALLS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT NO WALLS CHANGES ABOUT THE SHAPE, since no shell has done this.
 *
 * `shellDef('hollow').walls` is `[]` — the registry's own comment says "there is
 * no rock to be hard" — so this Roll authors no WALL station, and three things
 * follow that are worth saying out loud rather than discovering in play:
 *
 *   1  NOTHING IN HOLLOW IS EVER `cleared`. `markReached` only ever pushes to
 *      `roll.cleared` for a WALL, so half of §1.1's permanence table — "you keep
 *      the road; you lose the tools" — has nothing to record here. A Hollow
 *      player's permanent geography is WRECKS ONLY.
 *   2  NO STATION HERE ASKS FOR A TOOL TIER. Every other shell paces itself
 *      twice, on the descent price and on the hardness gate; Hollow paces itself
 *      once. The floor at 560 is the deepest in the game and the descent curve
 *      is the whole of the resistance.
 *   3  §1.2's LANDMARK HORIZON ("the next WALL or WRECK") is carried entirely by
 *      wrecks and by the two chambers. So the wrecks are spaced as landmarks
 *      rather than as machines-in-order: 55, 140, 178, and then a two-hundred
 *      and forty depth run to the floor with nothing standing in it. That empty
 *      stretch is the shell being itself, not an authoring gap.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHERE THE NAMES COME FROM. §6's keystone table authors two of these exactly:
 *
 *   Condenser Wreck 55   THE CONDENSER   "Witnesses cannot run"
 *   Witness Hall 140     THE WITNESS     "Hollow's entire material economy"
 *
 * The other fourteen are invented under the freedom clause, including THE
 * RECONSTRUCTION FRAME's station — §13 names the machine and no station for it.
 * They are named for what a shell whose identity is SUBTRACTION does: quieten,
 * absent, unsound, stop.
 *
 * THE FLOOR IS AT 560, per `shellDef('hollow').floorDepth`. Not a spine number.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOLLOW'S SIGNATURE (absence) IS UNTOUCHED. Nothing here reads or writes
 * `systems/absence.ts`. The Roll is geography; the signature is physics.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { StationDef } from '../shell1/roll';

/** Stations a player passes but which hold no seam: their contents are the place. */
const NO_SEAM: string[] = [];

/**
 * THE REMAINS OF HOLLOW (§16.4, the A.84 mechanism, sixth shell).
 *
 *   quietsinew   Nullmarch 18 · The Unsound 76        it moved here; it is not here now
 *   hollowplate  The Grey Reach 42 · Witness Hall 140 armour with no inside, and its hall
 *   unheart      Hushfall 98 · NOTHING AT ALL 560     the floor keeps its own
 */

export const HOLLOW_ROLL: StationDef[] = [
  {
    id: 'thequietening', depth: 0, name: 'The Quietening', type: 'seam',
    seams: ['nothingstone', 'quietchalk'],
    line: 'You landed. You are fairly sure you landed. The sound of it has not arrived.',
  },
  {
    id: 'nullmarch', depth: 18, name: 'Nullmarch', type: 'seam',
    seams: ['nullchalk', 'greyecho'], remains: ['quietsinew'],
    line: 'A long flat walk with nothing on either side of it, which took somebody a great deal of work.',
  },
  {
    id: 'greyreach', depth: 42, name: 'The Grey Reach', type: 'seam',
    seams: ['hushslate', 'echograin', 'umbralite'], remains: ['hollowplate'],
    line: 'Everything the same colour, at every distance. You cannot tell how far the far wall is.',
  },
  {
    // §6, kept exactly: "Condenser Wreck 55 — THE CONDENSER — Witnesses cannot run".
    id: 'condenserwreck', depth: 55, name: 'Condenser Wreck', type: 'wreck', wreck: 'THE CONDENSER',
    seams: ['umbralite', 'voidmarl'],
    line: 'It was pulling the nothing out of the air and folding it small. There is a great deal of it on the floor.',
  },
  {
    id: 'theunsound', depth: 76, name: 'The Unsound', type: 'hazard',
    seams: ['voidmarl', 'umbrite', 'voidglass'], remains: ['quietsinew'],
    line: 'Not silent. Silence is a thing you can be in. This is the other one.',
  },
  {
    id: 'hushfall', depth: 98, name: 'Hushfall', type: 'seam',
    seams: ['hushmetal', 'voidglass'], remains: ['unheart'],
    line: 'It comes down off the roof in sheets and lands without arriving.',
  },
  {
    id: 'longabsence', depth: 125, name: 'The Long Absence', type: 'rest',
    seams: NO_SEAM,
    line: 'Somebody stopped here for a considerable while and left no trace whatsoever, deliberately.',
  },
  {
    // §6, kept exactly: "Witness Hall 140 — THE WITNESS — Hollow's entire
    // material economy".
    id: 'witnesshall', depth: 140, name: 'Witness Hall', type: 'wreck', wreck: 'THE WITNESS',
    seams: ['silencesteel', 'resonarium'], remains: ['hollowplate'],
    line: 'Rows of seats, all of them facing the same undecided thing, all of them empty and none of them dusty.',
  },
  {
    id: 'theunbuilt', depth: 178, name: 'The Unbuilt', type: 'wreck', wreck: 'THE RECONSTRUCTION FRAME',
    seams: ['resonarium', 'absentia'],
    line: 'A frame for putting a face back one cell at a time. Four cells were put back. They are still here.',
  },
  {
    id: 'nowhereparticular', depth: 215, name: 'Nowhere In Particular', type: 'chamber',
    seams: ['absentia', 'absencia'],
    line: 'A room with the specific quality of not being anywhere, which is not the same as being lost.',
  },
  {
    id: 'umbraldeep', depth: 260, name: 'Umbral Deep', type: 'seam',
    seams: ['absencia', 'phantomsilver'],
    line: 'The shadow of the shaft above you, at the bottom of a shaft with nothing above it.',
  },
  {
    id: 'roomthatisnt', depth: 310, name: "The Room That Isn't", type: 'chamber',
    seams: ['phantomsilver', 'lacuna'],
    line: 'You can walk the length of it and out the far side and it will not have been there.',
  },
  {
    id: 'standingquiet', depth: 365, name: 'The Standing Quiet', type: 'rest',
    seams: NO_SEAM,
    line: 'It has been here longer than the shaft. Everything else moved out around it.',
  },
  {
    id: 'starfallunder', depth: 420, name: 'Starfall Under', type: 'seam',
    seams: ['lacuna', 'stillstar', 'voidstar'],
    line: 'They fell in from somewhere and stopped partway, and none of them has agreed to finish.',
  },
  {
    id: 'longnothing', depth: 480, name: 'The Long Nothing', type: 'hazard',
    seams: ['voidstar', 'nothing'],
    line: 'The stretch everybody who came this far wrote about, and none of them managed to write down.',
  },
  {
    id: 'nothingatall', depth: 560, name: 'NOTHING AT ALL', type: 'floor',
    seams: ['nothing', 'stillstar'], remains: ['unheart'],
    line: 'The floor of this world, and it is not a floor. You have been standing on it for some time.',
  },
];

export function hollowRoll(): StationDef[] {
  return HOLLOW_ROLL;
}
