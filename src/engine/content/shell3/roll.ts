/**
 * THE ROLL — VERDANCE'S TWENTY STATIONS (§1.3).
 *
 * The third authored geography, written to Ferrite's file as its pattern: name,
 * depth, type and a WALL's hardness are authored and never move; seam, feature
 * and hazard intensity re-roll at every Collapse (§1.1); REMAINS are permanent
 * facts about the place and the re-roll never touches them.
 *
 * WHERE THE NAMES COME FROM, stated because half of them are invented.
 * DESIGN_SPINE.md carries Loam's and Ferrite's lists in full and then says the
 * other five are "retained from the v4 Roll listing in `DESIGN_SPINE_v4.md`" —
 * a document that is not in this repository. What IS authored for Verdance,
 * and is kept here exactly:
 *
 *   Stillwright's Bower 30   THE STILL     (§6 keystone table)
 *   Pressyard 120            THE PRESS     (§6)
 *   Linewright's Fall 172    THE LINE      (§6)
 *   THORNWALL                the floor     (§10.2 — "the wall is fallow rock")
 *
 * The other sixteen are invented under the freedom clause, which is explicit
 * that names and flavour are open. They are named for what a green shell does:
 * rot, fallow, sap, wick, seed, choke.
 *
 * THE WALLS SIT ON THE WALLS THAT ALREADY EXIST, one depth above each gate, as
 * BRICKLIGHT (44) sits above Loam's tier-II gate (45) and POLEBREAK (39) above
 * Ferrite's tier-IV gate (40). Verdance's gates are 45 / 120 / 210
 * (`content/shells.ts`), so BRAMBLEWALL is 44, THE CHOKE 119 and THE SPLIT 209.
 * Pressyard keeps its authored depth of 120 and sits directly under THE CHOKE —
 * the same adjacency Siever's Rest (98) and THE REVERSAL (99) have, and it
 * reads well: the machine you need is the last thing before the wall.
 *
 * THE FLOOR IS AT 290, not the spine's 250. `shellDef('verdance').floorDepth`
 * is 290 and carries its own note ("shell spans are sized to the multiplier
 * machinery one shell actually accrues — Verdance at 350 measured a 13h arc").
 * Where a number in that document disagrees with `src/engine/`, PILLARS is
 * explicit that the registry is right.
 *
 * THE SEAM BANDS RESPECT THE RARITY GATES. `wildstar` is `starred` (gate 110)
 * and first appears at Heartwood Stand (160); `thornmind` is `aberrant` (gate
 * 150) and only at the last two. A seam that could never produce its stone is a
 * lie the Assay Bench would repeat.
 *
 * WORKED MATERIALS ARE NOT SEAMED. `sunamber`, `setresin` and `fibercloth` are
 * Verdance stone by taxonomy and `worked: true` by construction — made at the
 * Still and the Loom, never dug — so none of them is in a pool here.
 */
import type { StationDef } from '../shell1/roll';

/** Stations a player passes but which hold no seam: their contents are the place. */
const NO_SEAM: string[] = [];

/**
 * THE REMAINS OF VERDANCE (§16.4, the A.84 mechanism, third shell).
 *
 * Six materials were `source: 'combat'` after combat was cut, so they were
 * obtainable by no route at all. They are NOT in the rarity pool — Verdance
 * holds four commons and the tier VII–IX ladder is built out of them — but in
 * PLACES, and every one still answers to its RARITY GATE.
 *
 *   throatroot   Rootbind 12 · The Fallow 38        a root that swallowed, in the root places
 *   mothspool    The Mulchworks 22 · Mothgarden 104 where the moths are, and where they end up
 *   wireweed     Stillwright's Bower 30 · Heartwood Stand 160  it grows on structure
 *   palefiber    Sapline 56 · Linewright's Fall 172 thread, and the two places thread is wanted
 *   mawpith      The Cankerworks 72 · Old Plenty's Round 240   soft centres, hard places
 *   plentyheart  Pressyard 120 · The Seedhouse 196  she drops them, and they are collected
 */

export const VERDANCE_ROLL: StationDef[] = [
  {
    id: 'greenfall', depth: 0, name: 'The Greenfall', type: 'seam',
    seams: ['sporewood', 'sapstone'],
    line: 'You come down through the canopy rather than into the dark, and it takes some getting used to.',
  },
  {
    id: 'rootbind', depth: 12, name: 'Rootbind', type: 'seam',
    seams: ['sporewood', 'mosscoal', 'barkiron'], remains: ['throatroot'],
    line: 'Six kinds of root arguing over one seam, and all six of them winning.',
  },
  {
    id: 'mulchworks', depth: 22, name: 'The Mulchworks', type: 'wreck', wreck: 'THE RENDERY',
    seams: ['mosscoal', 'chlorite'], remains: ['mothspool'],
    line: 'It rendered green things down to something that would keep. It is still warm and it still drips.',
  },
  {
    id: 'stillwrights', depth: 30, name: "Stillwright's Bower", type: 'wreck', wreck: 'THE STILL',
    seams: ['chlorite', 'resinpearl'], remains: ['wireweed'],
    line: 'She built it under a living arch so the heat would not carry. The arch has closed over it since.',
  },
  {
    id: 'thefallow', depth: 38, name: 'The Fallow', type: 'chamber',
    seams: ['barkiron', 'humusgold', 'sapstone'], remains: ['throatroot'],
    line: 'Nobody has cut anything here in a long time, and it shows in every direction at once.',
  },
  {
    id: 'bramblewall', depth: 44, name: 'BRAMBLEWALL', type: 'wall', hardness: 7,
    seams: NO_SEAM,
    line: 'Not stone. Thorn, grown across and through itself until it is harder than the rock it replaced.',
  },
  {
    id: 'sapline', depth: 56, name: 'Sapline', type: 'seam',
    seams: ['resinpearl', 'humusgold', 'verdantine'], remains: ['palefiber'],
    line: 'A seam that runs the way sap runs — downhill, and only when it feels like it.',
  },
  {
    id: 'cankerworks', depth: 72, name: 'The Cankerworks', type: 'hazard',
    seams: ['verdantine', 'feralglass'], remains: ['mawpith'],
    line: 'Something went wrong here and then kept going, and the going is what is dangerous.',
  },
  {
    id: 'wickrow', depth: 88, name: 'Wick Row', type: 'rest',
    seams: NO_SEAM,
    line: 'A row of tapped trunks with wicks still in them. Somebody sat here nightly and burned the sap for light.',
  },
  {
    id: 'mothgarden', depth: 104, name: 'Mothgarden', type: 'seam',
    seams: ['bloomsteel', 'feralglass', 'heartwood'], remains: ['mothspool'],
    line: 'Planted for them, apparently. They have kept it up better than whoever planted it.',
  },
  {
    id: 'thechoke', depth: 119, name: 'THE CHOKE', type: 'wall', hardness: 8,
    seams: NO_SEAM,
    line: 'The seam narrows and the green does not. It closes the shaft a little more every season.',
  },
  {
    id: 'pressyard', depth: 120, name: 'Pressyard', type: 'wreck', wreck: 'THE PRESS',
    seams: ['bloomsteel', 'springvein'], remains: ['plentyheart'],
    line: 'Six steps and four minutes of tapping, done in one stroke, by a thing the size of a room.',
  },
  {
    id: 'quietquarter', depth: 145, name: 'The Quiet Quarter', type: 'rest',
    seams: NO_SEAM,
    line: 'A quadrant that was let go on purpose and has been quiet ever since. Sit in it; nothing here minds.',
  },
  {
    id: 'heartwoodstand', depth: 160, name: 'Heartwood Stand', type: 'seam',
    seams: ['heartwood', 'springvein', 'wildstar'], remains: ['wireweed'],
    line: 'Trunks with iron in the middle of them, standing in rows nobody planted.',
  },
  {
    id: 'linewrights', depth: 172, name: "Linewright's Fall", type: 'wreck', wreck: 'THE LINE',
    seams: ['heartwood', 'wildstar'], remains: ['palefiber'],
    line: 'He got six machines firing as one action and then the sixth one stopped.',
  },
  {
    id: 'seedhouse', depth: 196, name: 'The Seedhouse', type: 'chamber',
    seams: ['wildstar', 'springvein'], remains: ['plentyheart'],
    line: 'Racks of what was worth keeping, labelled in a hand that expected to come back for them.',
  },
  {
    id: 'thesplit', depth: 209, name: 'THE SPLIT', type: 'wall', hardness: 9,
    seams: NO_SEAM,
    line: 'One trunk, split top to bottom some long time ago, and both halves still growing away from each other.',
  },
  {
    id: 'plentysround', depth: 240, name: "Old Plenty's Round", type: 'seam',
    seams: ['wildstar', 'heartwood'], remains: ['mawpith'],
    line: 'A path worn a foot deep in a perfect circle. She still walks it. You can hear where she is.',
  },
  {
    id: 'longfallow', depth: 265, name: 'The Long Fallow', type: 'chamber',
    seams: ['thornmind', 'wildstar'],
    line: 'Refused for so long that the refusing became the crop.',
  },
  {
    id: 'thornwall', depth: 290, name: 'THORNWALL', type: 'floor',
    seams: ['thornmind', 'wildstar'],
    line: 'The floor of this world, and it is not stone either. You will have to grow through it.',
  },
];

export function verdanceRoll(): StationDef[] {
  return VERDANCE_ROLL;
}
