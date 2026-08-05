/**
 * THE ROLL — CINDER'S NINETEEN STATIONS (§1.3, §36.1).
 *
 * The fifth authored geography, written to the same pattern as Ferrite,
 * Verdance and Glassmere — and the first to use the FLOOD station type.
 *
 * WHERE THE NAMES COME FROM. DESIGN_SPINE.md carries Loam's and Ferrite's lists
 * in full and defers the rest to `DESIGN_SPINE_v4.md`, which is not in this
 * repository. What IS authored for Cinder, and is kept here exactly:
 *
 *   Boilerworks 40    THE BOILER      (§6 keystone table)
 *   Vent Row 58       THE VENT ARRAY  (§6)
 *   Retort Hall 120   THE RETORT      (§6)
 *   FLASHPOINT        the floor       (§10.2 — "needs a Retort throughput one
 *                                      Kiln cannot feed")
 *
 * The other sixteen are invented under the freedom clause. They are named for
 * what a shell that is never cold does: bank, tap, vent, burn, choke.
 *
 * THE WALLS SIT ON THE WALLS THAT ALREADY EXIST, one depth above each gate.
 * Cinder's gates are 55 / 175 / 300 (`content/shells.ts`), so THE CLINKER is 54,
 * THE SLUMP 174 and THE WHITE HEAT 299.
 *
 * THE FLOOR IS AT 470, per `shellDef('cinder').floorDepth`, which carries its
 * own sizing note (A.16: ~+90 per shell past Glassmere's 380). Not a number from
 * the spine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO FLOOD STATIONS (§1.3: "Cinder gains two FLOOD-eligible stations").
 *
 *   The Bank 210        a place that already holds heat, and would hold more
 *   The Choke 355       the shaft's own narrowest point, deep in the hot half
 *
 * `flood` is the type of a station that CAN be drowned, not one that has been —
 * the row tells you it will take the heat before you decide to give it any
 * (LAW 3, and the same reason a WRECK reads as a WRECK before you loot it).
 * Once the Floodgate takes one, `typeOf` reads it as a HAZARD for the rest of
 * the game and its contents never re-roll again. Both carry a `floodSeams` pool
 * of the shell's own deep stock, which is what the one permanent seam is drawn
 * from.
 *
 * THEY ARE 145 DEPTHS APART ON PURPOSE. §36.1's payoff is a HEAT CORRIDOR —
 * "flooding three adjacent stations makes a stretch that is permanently hot,
 * permanently rich and permanently hostile" — and a corridor is a THIRD flood
 * this build does not have. Two adjacent ones would read as a corridor with a
 * piece missing; two far apart read as two decisions, which is what they are.
 * The corridor is ledgered, not faked.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CINDER'S SIGNATURE (pressure) IS UNTOUCHED. Nothing here reads or writes
 * `systems/pressure.ts`; the Floodgate is paid for in Ember, the currency the
 * Slagworks renders heat into, through the same `convCurrencyId` seam every
 * other station-scale purchase uses.
 */
import type { StationDef } from '../shell1/roll';

/** Stations a player passes but which hold no seam: their contents are the place. */
const NO_SEAM: string[] = [];

/**
 * THE REMAINS OF CINDER (§16.4, the A.84 mechanism, fifth shell).
 *
 *   emberplate   Cinderfall 16 · Breaker's Slag 260    shed plate, still warm
 *   charsinew    The Tapline 28 · The Long Burn 175    it cooked and kept working
 *   magmaduct    Boilerworks 40 · Vent Row 58          veins, where veins were plumbed
 *   pyregland    The Bank 210 · Retort Hall 120        where the decision to burn is banked
 *   smolderheart The Choke 355 · Coronaway 400         she sheds them; they roll downhill
 */

export const CINDER_ROLL: StationDef[] = [
  {
    id: 'cindershore', depth: 0, name: 'The Cindershore', type: 'seam',
    seams: ['ashgrit', 'charstone'],
    line: 'A beach of it, warm through the boot, going down instead of out.',
  },
  {
    id: 'cinderfall', depth: 16, name: 'Cinderfall', type: 'seam',
    seams: ['charstone', 'slagrock', 'emberflake'], remains: ['emberplate'],
    line: 'It comes off the roof in slow sheets and nothing here has ever put it out.',
  },
  {
    id: 'tapline', depth: 28, name: 'The Tapline', type: 'seam',
    seams: ['slagrock', 'emberflake', 'pyroclast'], remains: ['charsinew'],
    line: 'Tapped every forty feet by somebody who knew exactly how much they could take.',
  },
  {
    id: 'boilerworks', depth: 40, name: 'Boilerworks', type: 'wreck', wreck: 'THE BOILER',
    seams: ['pyroclast', 'obsidianheart'], remains: ['magmaduct'],
    line: 'Your power source can end the run, and this one did, and it is still standing.',
  },
  {
    id: 'theclinker', depth: 54, name: 'THE CLINKER', type: 'wall', hardness: 13,
    seams: NO_SEAM,
    line: 'Fused waste, harder than anything that was ever ore. It is what the fire could not use.',
  },
  {
    id: 'ventrow', depth: 58, name: 'Vent Row', type: 'wreck', wreck: 'THE VENT ARRAY',
    seams: ['obsidianheart', 'brimshard'], remains: ['magmaduct'],
    line: 'Twenty valves in a line, all of them open, all of them cast from stock that needed heat.',
  },
  {
    id: 'ashfield', depth: 80, name: 'The Ashfield', type: 'rest',
    seams: NO_SEAM,
    line: 'Deep enough in the fall to be soft, far enough from a vent to be cool. People slept here.',
  },
  {
    /**
     * THE QUENCH TANK'S PLACE — the THIRD station this project has authored
     * around a hole in §6's keystone table (the Grafthouse was the first at
     * A.92, The Long Spin the second at A.93). §13 lists the QUENCH TANK and
     * says it blocks "tier XI+ stats"; §6 gives it no wreck at all.
     *
     * WHY CINDER, AND WHY HERE. §13's own ordering puts the tank between the
     * Retort and the Floodgate, which are both Cinder's; and §17 names the
     * PYRE-BATH as "the only route to tier-XI temper", which is a Cinder
     * medium. It sits between The Ashfield (80) and Retort Hall (120), deep
     * enough that a player meets it after the Boiler and the Vents.
     *
     * IT BURIES NOTHING, for the reason A.93 learned at The Long Spin: a new
     * station carrying `remains` is a drop-economy change wearing a station's
     * hat, and depth 96 has a guard on it like every other.
     */
    id: 'theslake', depth: 96, name: 'The Slake', type: 'wreck', wreck: 'THE QUENCH TANK',
    seams: ['brimshard', 'cindersteel'],
    line: 'Long stone troughs, all of them dry, all of them stained a different colour at the waterline.',
  },
  {
    id: 'retorthall', depth: 120, name: 'Retort Hall', type: 'wreck', wreck: 'THE RETORT',
    seams: ['brimshard', 'magmajade', 'cindersteel'], remains: ['pyregland'],
    line: 'A hall of long glass necks, most of them intact, one of them still dripping.',
  },
  {
    id: 'theslump', depth: 174, name: 'THE SLUMP', type: 'wall', hardness: 14,
    seams: NO_SEAM,
    line: 'The rock went soft, moved a little, and set again. It is not going to move a second time for you.',
  },
  {
    id: 'thelongburn', depth: 175, name: 'The Long Burn', type: 'seam',
    seams: ['magmajade', 'cindersteel', 'pyrite'], remains: ['charsinew'],
    line: 'It has been alight since before the shaft, and it will be alight after.',
  },
  /**
   * ─────────────────────────────────────────────────────────────────────────
   * THE HEATWORKS — a sluice, a bank, and an overflow (§36.1, authored A.101).
   *
   * A.100 measured what nobody had checked: only a `flood` station can ever be
   * flooded, Cinder was the only shell with any, it had TWO, and they sat 145
   * depths apart against a `LEAK_REACH` of 20. So the HEAT CORRIDOR — four
   * consequences of §36.1, the mechanism shipped at A.99 — could not be built
   * by any save. The mechanism was reachable only from a test that wrote
   * `roll.flooded` directly, which is the failure PILLARS names as "a test that
   * a function works is not a test that anything calls it".
   *
   * These two rows are the fix, and they are authored as ONE THING with The
   * Bank rather than as two more floodable rooms at convenient depths: a sluice
   * that feeds it, and an overflow that takes what it cannot hold. Flooding all
   * three is flooding a works that was built as a works — which is why the
   * corridor reads as a place rather than as an arithmetic result.
   *
   * THE SPACING IS THE MECHANISM. 196 · 210 · 224, so a delver standing at the
   * Bank has all three inside the leak, and one standing at either end has two.
   * The corridor is something you stand in the middle of.
   *
   * Both are FAR side of THE SLUMP (174, hardness 14), so the corridor is late
   * Cinder exactly as §36.1 asks — "what late Cinder now does: you SPEND
   * pressure, on the world".
   * ─────────────────────────────────────────────────────────────────────────
   */
  {
    id: 'thesluice', depth: 196, name: 'The Sluice', type: 'flood',
    seams: ['pyrite', 'cindersteel'], floodSeams: ['heartflame', 'pyroclast'],
    line: 'A cut channel with a gate at the end of it, and the gate is the newest thing down here.',
  },
  {
    id: 'thebank', depth: 210, name: 'The Bank', type: 'flood',
    seams: ['pyrite', 'heartflame'], floodSeams: ['heartflame', 'coronaite'],
    remains: ['pyregland'],
    line: 'Built to hold heat and never emptied. It would take a great deal more, if you had it.',
  },
  {
    id: 'theoverflow', depth: 224, name: 'The Overflow', type: 'flood',
    seams: ['heartflame', 'obsidianheart'], floodSeams: ['coronaite', 'howlbasalt'],
    remains: ['charsinew'],
    line: 'Where the Bank goes when the Bank has had enough. Somebody dug it in a hurry and then never needed it.',
  },
  {
    id: 'breakerslag', depth: 260, name: "Breaker's Slag", type: 'wreck', wreck: 'THE BREAKER',
    seams: ['heartflame', 'ventglass'], remains: ['emberplate'],
    line: 'Everything here came apart on purpose and went back out as something that could take the heat.',
  },
  {
    id: 'glassbank', depth: 290, name: 'The Glassbank', type: 'chamber',
    seams: ['ventglass', 'heartflame', 'coronaite'],
    line: 'A room of it, poured and cooled against the wall in one go, and you can see the pour lines.',
  },
  {
    id: 'whiteheat', depth: 299, name: 'THE WHITE HEAT', type: 'wall', hardness: 15,
    seams: NO_SEAM,
    line: 'Past a certain temperature colour stops meaning anything. This is past it.',
  },
  {
    // `heatchoke`, not `thechoke` — Verdance already owns that id at 119, and
    // `ferrite-roll.test.ts` asserts no two stations in the GAME share one.
    id: 'heatchoke', depth: 355, name: 'The Choke', type: 'flood',
    seams: ['coronaite', 'ventglass'], floodSeams: ['coronaite', 'howlbasalt'],
    remains: ['smolderheart'],
    line: 'The narrowest point in the shaft, and the hottest. Everything that goes down goes through here.',
  },
  {
    id: 'quietkiln', depth: 380, name: 'The Quiet Kiln', type: 'rest',
    seams: NO_SEAM,
    line: 'It went out. It is the only thing in this shell that ever did, and it is cool enough to lean on.',
  },
  {
    id: 'coronaway', depth: 400, name: 'Coronaway', type: 'seam',
    seams: ['coronaite', 'howlbasalt'], remains: ['smolderheart'],
    line: 'A ring of light around something you are not looking directly at.',
  },
  {
    id: 'thepurge', depth: 430, name: 'The Purge', type: 'wreck', wreck: 'THE FLOODGATE',
    seams: ['howlbasalt', 'coronaite'],
    line: 'Somebody dumped the whole bank in here at once, on purpose, and walked out the far side.',
  },
  {
    id: 'flashpoint', depth: 470, name: 'FLASHPOINT', type: 'floor',
    seams: ['howlbasalt', 'coronaite'],
    line: 'The floor of this world. It is not hot yet. That is the part to think about.',
  },
];

export function cinderRoll(): StationDef[] {
  return CINDER_ROLL;
}
