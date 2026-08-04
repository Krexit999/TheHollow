/**
 * THE ROLL — FERRITE'S TWENTY STATIONS (§1.3).
 *
 * The second authored geography in the game, and it is deliberately the SAME
 * shape as Loam's rather than a second pattern: name, depth, type and a WALL's
 * hardness are authored and never move; seam, feature and hazard intensity
 * re-roll at every Collapse (§1.1); REMAINS are permanent facts about the place
 * and the re-roll never touches them (A.84).
 *
 * The type definitions live in `../shell1/roll.ts` on purpose. They were
 * written there when Loam was the only Roll, and they are the SHARED SHAPE, not
 * Loam content — re-declaring them here would be two copies of one type, which
 * is the drift this codebase has been bitten by before. `../rolls.ts` is the
 * registry both shells are read through.
 *
 * THE WALLS SIT ON THE WALLS THAT ALREADY EXIST, one depth above each gate —
 * exactly as BRICKLIGHT (44) sits above Loam's tier-II gate (45). Ferrite's
 * gates are at 40 / 100 / 170 (`content/shells.ts`), so POLEBREAK is at 39,
 * THE REVERSAL at 99 and THE SEIZE at 169. The spine's own list puts POLEBREAK
 * at 62 and THE REVERSAL at 128 and names no third wall at all; where a number
 * in that document disagrees with `src/engine/`, PILLARS is explicit that the
 * REGISTRY is right and the document is the bug. Giving the existing walls a
 * name and a face is the whole point of the Roll — adding a second gate beside
 * them would be a different, worse system.
 *
 * THE SEAM BANDS RESPECT THE RARITY GATES. `polarite` is `pure` and pure does
 * not open until depth 40, so it is seamed at Scaleway (48) and below and
 * nowhere shallower; `polestar` is `starred` (gate 110) and appears from The
 * Long Pole (160). A seam that could never produce its stone is a lie the Assay
 * Bench would repeat.
 *
 * RIMEIRON IS SEAMED, and for the reason `millstone` is seamed at Quillrest:
 * §16.3's trap materials must be FINDABLE rather than merely possible, because
 * a trap the information system cannot warn you about is a gotcha. The Bench
 * can read it off the row at Alloyer's End before you ever dig it. (§16.3 calls
 * rimeiron `warm`; `traits.ts` has it `dense`/`springy`, and PILLARS is explicit
 * that the registry wins — the trait is NOT changed here to match a sentence.)
 */
import type { StationDef } from '../shell1/roll';

/** Stations a player passes but which hold no seam: their contents are the place. */
const NO_SEAM: string[] = [];

/**
 * THE REMAINS OF FERRITE (§16.4, the A.84 mechanism generalised).
 *
 * Six materials were `source: 'combat'` after combat was cut, which made them
 * obtainable by no route in the game — the six this project has carried in the
 * UNBUILT ledger since A.84 said "they need authored Rolls in six shells and
 * that is not a content pass, it's six". This is one of the six.
 *
 * They are NOT in the rarity pool, for the reason Loam's are not: Ferrite holds
 * four commons and the tier-IV/V ladder is built out of them, so six more in
 * the pool would silently re-price the shell's own hardness walls. They are in
 * PLACES instead, and every one still answers to its RARITY GATE.
 *
 *   scalebackplate  Scaleway 48 · Breaker's Yard 210   shed plate, and where plate is broken
 *   ironsinew       The Draw 35 · The Long Pole 160    drawn wire is what sinew looks like here
 *   voltgland       The Attracting Dark 85 · Fluxgate 140  where the charge collects
 *   magnetheart     Governor's Wreck 175 · The Sympathy 195  two things agreeing at a distance
 *   nullquill       Siever's Rest 98 · Fluxgate 140 · The Sympathy 195  it sorts, and it erases
 *   loadstarcore    POLEIRON 250                       the floor, and only the floor
 */

export const FERRITE_ROLL: StationDef[] = [
  {
    id: 'rustfall', depth: 0, name: 'The Rustfall', type: 'seam',
    seams: ['ironbloom', 'scalechip'],
    line: 'You land in a slope of it. Everything above you is orange and everything below is not.',
  },
  {
    id: 'lodestonecut', depth: 14, name: 'Lodestone Cut', type: 'seam',
    seams: ['lodestone', 'ironbloom', 'scalechip'],
    line: 'The first cut anyone made here, and it was made in the direction the rock wanted.',
  },
  {
    id: 'coilwrights', depth: 22, name: "Coilwright's Fall", type: 'wreck', wreck: 'THE COIL',
    seams: ['lodestone', 'rustmarrow'],
    line: 'She wound it standing on a plank over the drop. The coil is still here.',
  },
  {
    id: 'thedraw', depth: 35, name: 'The Draw', type: 'seam',
    seams: ['greyflux', 'rustmarrow', 'bluesteel'], remains: ['ironsinew'],
    line: 'Iron was pulled through a hole in a plate here until it was wire.',
  },
  {
    id: 'polebreak', depth: 39, name: 'POLEBREAK', type: 'wall', hardness: 4,
    seams: NO_SEAM,
    line: 'The field turns over inside the rock and the rock will not be told otherwise.',
  },
  {
    id: 'scaleway', depth: 48, name: 'Scaleway', type: 'seam',
    seams: ['scalechip', 'bluesteel', 'polarite'], remains: ['scalebackplate'],
    line: 'A road paved in shed plate. It rings under a boot and nothing here rings.',
  },
  {
    id: 'alloyersend', depth: 70, name: "Alloyer's End", type: 'wreck', wreck: 'THE ALLOY CRUCIBLE',
    seams: ['polarite', 'rimeiron', 'voltglass'],
    line: 'He got three traits into one pour and then he stopped, which is one way to finish.',
  },
  {
    id: 'attractingdark', depth: 85, name: 'The Attracting Dark', type: 'hazard',
    seams: ['voltglass', 'magnetile'], remains: ['voltgland'],
    line: 'Your tools lean toward it. So does the lamp, and the lamp has no iron in it.',
  },
  {
    id: 'sieversrest', depth: 98, name: "Siever's Rest", type: 'wreck', wreck: 'THE SIEVE',
    seams: ['magnetile', 'nullsilver'], remains: ['nullquill'],
    line: 'Four grades of waste in four neat heaps, and the man who sorted them gone.',
  },
  {
    id: 'reversal', depth: 99, name: 'THE REVERSAL', type: 'wall', hardness: 5,
    seams: NO_SEAM,
    line: 'North is the other way through this. Everything you know about the rock is inverted in it.',
  },
  {
    id: 'ironvespers', depth: 112, name: 'Iron Vespers', type: 'rest',
    seams: NO_SEAM,
    line: 'The seams hum on one note at this depth, all of them, and it is a comfortable place to sit.',
  },
  {
    /**
     * THE CENTRIFUGE'S PLACE, and it is the second station in this project
     * authored because §6's keystone table has a hole in it (the Infuser's
     * Grafthouse was the first, A.92). §13 lists the CENTRIFUGE and says it
     * blocks "~10 split-only materials"; §6 gives it no wreck at all.
     *
     * WHY FERRITE, AND WHY HERE. The measurement decides it, not taste:
     * `scripts/material-sources.ts` finds ELEVEN materials nothing in the game
     * produces, and SIX of them are Ferrite's — the five castings plus the
     * Lodeframe. It sits between Iron Vespers (112) and Fluxgate (140), deep
     * enough that a player meets it after the Sieve and the Crucible.
     *
     * IT BURIES NOTHING, deliberately. The first draft gave it `ironsinew` out
     * of habit and broke `a barren depth rolls what it did` — depth 125 is the
     * drop economy's own guard, and a new station that moved it would have been
     * a drop-economy change wearing a station's hat.
     */
    id: 'longspin', depth: 126, name: 'The Long Spin', type: 'wreck', wreck: 'THE CENTRIFUGE',
    seams: ['nullsilver', 'magnetile'],
    line: 'It turned until things came apart into what they had been all along. It is still turning.',
  },
  {
    id: 'fluxgate', depth: 140, name: 'Fluxgate', type: 'chamber',
    seams: ['nullsilver', 'stormcore', 'greyflux'], remains: ['voltgland', 'nullquill'],
    line: 'A room with a door in every wall and flux caked around all four.',
  },
  {
    id: 'longpole', depth: 160, name: 'The Long Pole', type: 'seam',
    seams: ['stormcore', 'polestar'], remains: ['ironsinew'],
    line: 'One seam, running down as far as the lamp reaches and further.',
  },
  {
    id: 'theseize', depth: 169, name: 'THE SEIZE', type: 'wall', hardness: 6,
    seams: NO_SEAM,
    line: 'Two faces of it clamped together some long time ago and have not let go since.',
  },
  {
    id: 'governorswreck', depth: 175, name: "Governor's Wreck", type: 'wreck', wreck: 'THE GOVERNOR',
    seams: ['polestar', 'magnetile'], remains: ['magnetheart'],
    line: 'It kept the line running at the pace of its slowest member until it did not.',
  },
  {
    id: 'sympathy', depth: 195, name: 'The Sympathy', type: 'chamber',
    seams: ['polestar', 'nullsilver', 'magnetile'], remains: ['magnetheart', 'nullquill'],
    line: 'Strike one wall and the far wall answers. It has been doing this without an audience.',
  },
  {
    id: 'breakersyard', depth: 210, name: "Breaker's Yard", type: 'wreck', wreck: 'THE BREAKER',
    seams: ['rimeiron', 'bluesteel', 'scalechip'], remains: ['scalebackplate'],
    line: 'Everything here came apart on purpose, and most of it went back out as something else.',
  },
  {
    id: 'lastpole', depth: 232, name: 'The Last Pole', type: 'rest',
    seams: NO_SEAM,
    line: 'The needle stops arguing here. Whatever is underneath has already won it.',
  },
  {
    id: 'poleiron', depth: 250, name: 'POLEIRON', type: 'floor',
    seams: ['gnashmetal', 'polestar'], remains: ['loadstarcore'],
    line: 'The floor of this world, and it is one continuous piece of iron.',
  },
];

export function ferriteRoll(): StationDef[] {
  return FERRITE_ROLL;
}
