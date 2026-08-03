/**
 * THE ROLL — GLASSMERE'S NINETEEN STATIONS (§1.3).
 *
 * The fourth authored geography, written to Ferrite's and Verdance's files as
 * its pattern: name, depth, type and a WALL's hardness are authored and never
 * move; seam, feature and hazard intensity re-roll at every Collapse (§1.1);
 * REMAINS are permanent facts about the place and the re-roll never touches
 * them.
 *
 * WHERE THE NAMES COME FROM, stated because most of them are invented.
 * DESIGN_SPINE.md carries Loam's and Ferrite's lists in full and defers the
 * rest to `DESIGN_SPINE_v4.md`, which is not in this repository. What IS
 * authored for Glassmere, and is kept here exactly:
 *
 *   Prism Fall 20             THE PRISM         (§6 keystone table)
 *   Patternwright's Rest 90   THE PATTERN BENCH (§6)
 *   The Balance House 130     THE BALANCE       (§6)
 *   THE DARK PANE             the floor         (§10.2 — "compacted and unlit")
 *
 * The other fifteen are invented under the freedom clause, which is explicit
 * that names and flavour are open. They are named for what a cold shell of
 * ground glass does: silver, focus, refract, go quiet.
 *
 * THE WALLS SIT ON THE WALLS THAT ALREADY EXIST, one depth above each gate, as
 * BRICKLIGHT (44) sits above Loam's tier-II gate (45). Glassmere's gates are
 * 50 / 160 / 270 (`content/shells.ts`), so THE STILL AIR is 49, THE UNLIT 159
 * and THE REFRACTION 269.
 *
 * THE FLOOR IS AT 380, per `shellDef('glassmere').floorDepth`, not a number
 * from the spine. Where the document and the registry disagree, PILLARS is
 * explicit that the registry is right.
 *
 * THE SEAM BANDS RESPECT THE RARITY GATES: `spectrum` is `starred` (gate 110)
 * and first appears at Spectrum Row (110); `unlight` is `aberrant` (gate 150)
 * and only from THE UNLIT down. A seam that could never produce its stone is a
 * lie the Assay Bench would repeat.
 *
 * WORKED MATERIALS ARE NOT SEAMED. `frostpane`, `groundlens` and `glasseal` are
 * Glassmere stone by taxonomy and `worked: true` by construction — made at the
 * Lenswork and the export spine, never dug — so none of them is in a pool here.
 */
import type { StationDef } from '../shell1/roll';

/** Stations a player passes but which hold no seam: their contents are the place. */
const NO_SEAM: string[] = [];

/**
 * THE REMAINS OF GLASSMERE (§16.4, the A.84 mechanism, fourth shell).
 *
 *   glasschitin     Dimglass Reach 14 · The Coldspar Run 34   shed plate, in the plate places
 *   coldsinew       Prism Fall 20                             it flexes slowly, where it is coldest
 *   lenswing        The Lenswork 62 · Patternwright's Rest 90  a wing that focuses, where focus is made
 *   prismheart      Spectrum Row 110 · The Balance House 130  it splits light, where light is split
 *   unblinkingTear  The Cold Cut 178 · Starlens Deep 258      it wept once, and the cold kept it
 */

export const GLASSMERE_ROLL: StationDef[] = [
  {
    id: 'silvering', depth: 0, name: 'The Silvering', type: 'seam',
    seams: ['silicash', 'frostsand'],
    line: 'Every surface here has been backed with something. You keep meeting yourself on the way down.',
  },
  {
    id: 'dimglassreach', depth: 14, name: 'Dimglass Reach', type: 'seam',
    seams: ['dimglass', 'mirrorgrit', 'silicash'], remains: ['glasschitin'],
    line: 'Glass that gave up on being clear some long time ago and settled for being glass.',
  },
  {
    id: 'prismfall', depth: 20, name: 'Prism Fall', type: 'wreck', wreck: 'THE PRISM',
    seams: ['mirrorgrit', 'lumenshard'], remains: ['coldsinew'],
    line: 'It came down from somewhere above and it has been splitting the same beam ever since.',
  },
  {
    id: 'coldsparrun', depth: 34, name: 'The Coldspar Run', type: 'seam',
    seams: ['coldspar', 'prismite', 'frostsand'], remains: ['glasschitin'],
    line: 'A seam you can hear cooling. It is the only sound in the shell and it is not a loud one.',
  },
  {
    id: 'stillair', depth: 49, name: 'THE STILL AIR', type: 'wall', hardness: 10,
    seams: NO_SEAM,
    line: 'Nothing moves through it. Not dust, not light, and not you without a better edge.',
  },
  {
    id: 'lenswork', depth: 62, name: 'The Lenswork', type: 'wreck', wreck: 'THE LENSWORK',
    seams: ['prismite', 'spectralite'], remains: ['lenswing'],
    line: 'A cold gallery of ground glass, still focused on a spot on the floor that is slightly warm.',
  },
  {
    id: 'quietgallery', depth: 78, name: 'The Quiet Gallery', type: 'rest',
    seams: NO_SEAM,
    line: 'Benches facing a wall of panes. Somebody used to sit here and watch the light not arrive.',
  },
  {
    id: 'patternwrights', depth: 90, name: "Patternwright's Rest", type: 'wreck', wreck: 'THE PATTERN BENCH',
    seams: ['spectralite', 'sunglass', 'beamiron'], remains: ['lenswing'],
    line: 'She drew the shape first and poured to it after, which everyone said was backwards.',
  },
  {
    id: 'spectrumrow', depth: 110, name: 'Spectrum Row', type: 'seam',
    seams: ['sunglass', 'beamiron', 'starlens'], remains: ['prismheart'],
    line: 'The whole band, laid out in order, in the rock, by nobody.',
  },
  {
    id: 'balancehouse', depth: 130, name: 'The Balance House', type: 'wreck', wreck: 'THE BALANCE',
    seams: ['starlens', 'wavelength'], remains: ['prismheart'],
    line: 'A room built around one beam and one pan, for weighing what a thing is worth in what it is made of.',
  },
  {
    id: 'theunlit', depth: 159, name: 'THE UNLIT', type: 'wall', hardness: 11,
    seams: NO_SEAM,
    line: 'Glass with nothing in it. Bring your own light and it will not help.',
  },
  {
    id: 'coldcut', depth: 178, name: 'The Cold Cut', type: 'seam',
    seams: ['wavelength', 'spectrum', 'coldspar'], remains: ['unblinkingTear'],
    line: 'Cut in one pass by something that did not need to stop and look.',
  },
  {
    id: 'frostwork', depth: 205, name: 'Frostwork', type: 'chamber',
    seams: ['spectrum', 'starlens'],
    line: 'A room that grew its own decoration, and it is better than anything anybody carved.',
  },
  {
    id: 'longfocus', depth: 232, name: 'The Long Focus', type: 'rest',
    seams: NO_SEAM,
    line: 'Everything two hundred yards away is perfectly sharp. Everything nearer is a smear.',
  },
  {
    id: 'starlensdeep', depth: 258, name: 'Starlens Deep', type: 'seam',
    seams: ['starlens', 'spectrum', 'wavelength'], remains: ['unblinkingTear'],
    line: 'The lenses down here were not ground. They came out of the rock this way.',
  },
  {
    id: 'therefraction', depth: 269, name: 'THE REFRACTION', type: 'wall', hardness: 12,
    seams: NO_SEAM,
    line: 'The face is not where the face is. You will hit it eventually, from the wrong angle.',
  },
  {
    id: 'unblinkinground', depth: 300, name: "The Unblinking's Round", type: 'seam',
    seams: ['spectrum', 'unlight'],
    line: 'It does not walk it so much as occupy all of it at once. You will know when you are in it.',
  },
  {
    id: 'whiteroom', depth: 340, name: 'The White Room', type: 'chamber',
    seams: ['unlight', 'spectrum'],
    line: 'Lit from every direction equally, so nothing in it has an edge. Including the walls.',
  },
  {
    id: 'darkpane', depth: 380, name: 'THE DARK PANE', type: 'floor',
    seams: ['unlight', 'spectrum'],
    line: 'The floor of this world: one pane, compacted and unlit, and there is something on the far side of it.',
  },
];

export function glassmereRoll(): StationDef[] {
  return GLASSMERE_ROLL;
}
