/**
 * Shell I upgrades. Cost classes per DESIGN.md: Spam 1.15 / Standard 1.25 /
 * Structural 1.75. Blade/Soil/Roots feed the locked face formulas directly;
 * everything else registers named modifiers.
 */
import { D } from '../../decimal';
import { registerModifier } from '../../modifiers';
import { registerUpgrade, stat, upgradeLevel } from '../../upgrades';
import type { GameState } from '../../types';
import { newDrill, defaultDrillName, MAX_DRILLS } from '../../systems/drills';
import { rigFound } from '../../systems/shoring';
import { floodgateFound } from '../../systems/flood';
import { ensureRoll } from '../../systems/roll';

const hasKiln = (s: GameState) => s.kiln.built;
const hasBay = (s: GameState) => s.drills.bayBuilt;

/**
 * The Loam depth record that unlocks the DRILL BAY.
 *
 * Named, not inlined, because A.42 found it is the single most load-bearing
 * number in the idle arc and nothing said so. Drills are what lift an idle
 * player off the seepage floor (~10% of the field ceiling) to near it; until
 * the bay exists, idle income is a tenth of what the same field pays a player
 * with machines. 55 lands near the 45-minute beat for an ACTIVE player and
 * eight and a half HOURS for an idle one, because the tier-II hardness wall
 * sits at depth 44 — so the unlock that ends the starvation is behind the gate
 * that the starvation makes unpassable.
 *
 * FIXED at A.42 (ruled): **35**, below the wall. A structural unlock that the
 * idle path depends on must never gate behind the wall it is required to cross
 * — that is now a working rule in PILLARS.md, because this is its general form.
 * 35 leaves margin under the wall AND lands before the d15-45 stretch where
 * the ratio still peaked at 7.4 with the gate at 40 — the residual was the
 * same shape as the bug, one gate lower: R peaks immediately before whatever
 * depth the bay waits at, because that is the last of the seepage-only run.
 *
 * The sim overrides it (`--bay N`) so the old ordering stays measurable rather
 * than merely remembered. See sim-out/descent-a42.md.
 */
export const BAY_DEPTH_UNLOCK = { depth: 35 };

export function registerShell1Upgrades(): void {
  // --- Face upgrades (reset on Collapse) ----------------------------------
  registerUpgrade({
    id: 'blade',
    name: 'Whetted Blades',
    currency: 'CHIP',
    baseCost: D(50),
    ratio: 1.15,
    // 200, not 120: the doc's own Shell-IV budget line assumes Blade 200
    // (×71). The macro-tuning pass found the 120 cap freezing the ceiling
    // mid-Ferrite (+4% over 32h). The 1.15 spam curve self-paces the rest.
    maxLevel: 200,
    resetsOnCollapse: true,
    description: (l) => `A keener edge on every stroke. +35% Dust per point of charge chipped (now +${35 * l}%).`,
  });
  registerUpgrade({
    id: 'soil',
    name: 'Rich Soil',
    currency: 'CHIP',
    baseCost: D(80),
    ratio: 1.15,
    maxLevel: 120,
    resetsOnCollapse: true,
    description: (l) => `The loam grows back eager. Cells regenerate +25% faster (now +${25 * l}%).`,
  });
  registerUpgrade({
    id: 'roots',
    name: 'Deep Roots',
    currency: 'CHIP',
    baseCost: D(300),
    ratio: 1.25,
    maxLevel: 40,
    resetsOnCollapse: true,
    description: (l) => `Old roots hold more water, and water holds charge. Cell capacity +50% (now +${50 * l}%).`,
  });
  registerUpgrade({
    id: 'lantern',
    name: 'Warmer Lantern',
    currency: 'CHIP',
    baseCost: D(150),
    ratio: 1.25,
    maxLevel: 30,
    resetsOnCollapse: true,
    description: (l) => `You see more, so you learn more. +8% Delver XP (now +${8 * l}%).`,
  });
  // ORE ROWS. Visible only once a pocket has actually been opened — before
  // that there is nothing on screen to explain what they would even do, and a
  // row offering to improve a thing the player has never seen is a locked list
  // wearing a price tag (pillar 5).
  registerUpgrade({
    id: 'prospect',
    name: "A Prospector's Eye",
    currency: 'CHIP',
    baseCost: D(400),
    ratio: 1.3,
    maxLevel: 25,
    resetsOnCollapse: true,
    visible: (s) => (s.face.oreSeen?.length ?? 0) > 0,
    description: (l) => `You start seeing where the rock swells. +25% chance a pocket forms (now +${25 * l}%). It never fills the face — there is only ever room for so many.`,
  });
  registerUpgrade({
    id: 'deepsense',
    name: 'Deepsense',
    currency: 'CONV',
    baseCost: D(60),
    ratio: 1.45,
    maxLevel: 15,
    resetsOnCollapse: true,
    visible: (s) => (s.face.oreSeen?.length ?? 0) > 0,
    description: (l) => `Some pockets are worth more than others and you are learning to tell. Leans the roll toward the richer seams (now ×${(1 + 0.18 * l).toFixed(2)}).`,
  });
  registerUpgrade({
    id: 'expand',
    name: 'Widen the Face',
    currency: 'CONV',
    baseCost: D(12),
    ratio: 1.75,
    maxLevel: 10,
    resetsOnCollapse: true,
    visible: hasKiln,
    description: () => 'Brick shores the walls; the face grows by a column, then a row. New cells come in full.',
  });

  // --- Structures (persist through Collapse) ------------------------------
  registerUpgrade({
    id: 'kilnBuild',
    name: 'Raise the Kiln',
    currency: 'CHIP',
    baseCost: D(500),
    ratio: 1,
    maxLevel: 1,
    resetsOnCollapse: false,
    description: () => 'A throat of stacked stone that turns Dust into Brick. Your first machine.',
    onPurchase: (s) => {
      s.kiln.built = true;
      s.kiln.feeding = true;
    },
  });
  registerUpgrade({
    id: 'bellows',
    name: 'Twin Bellows',
    currency: 'CONV',
    baseCost: D(4),
    ratio: 1.25,
    maxLevel: 40,
    resetsOnCollapse: false,
    visible: hasKiln,
    description: (l) => `Force-fed fire. Kiln intake +20% per level (now +${20 * l}%).`,
  });
  registerUpgrade({
    id: 'firebrick',
    name: 'Firebrick Lining',
    currency: 'CONV',
    baseCost: D(6),
    ratio: 1.25,
    maxLevel: 30,
    resetsOnCollapse: false,
    visible: hasKiln,
    description: (l) => `The Kiln keeps what it burns. +10% Brick output per level (now +${10 * l}%).`,
  });
  registerUpgrade({
    id: 'bayBuild',
    name: 'Assemble the Drill Bay',
    currency: 'CONV',
    baseCost: D(12),
    ratio: 1,
    maxLevel: 1,
    resetsOnCollapse: false,
    // The bay's rails need deeper anchoring. Once proven (or once you've
    // breached), the technique is yours in every shell.
    visible: (s) => hasKiln(s)
      && ((s.depthRecords['loam'] ?? 0) >= BAY_DEPTH_UNLOCK.depth || s.shell.breachCount > 0),
    description: () => `Rails, a winch, and a place to bolt down machines that dig while you think. The anchoring needed depth ${BAY_DEPTH_UNLOCK.depth} to hold.`,
    onPurchase: (s) => {
      s.drills.bayBuilt = true;
      if (s.drills.units.length === 0) s.drills.units.push(newDrill(defaultDrillName(0)));
    },
  });
  /**
   * THE CASTING FLOOR'S OWN UNLOCK — re-homed off the retired Forge.
   *
   * The Forge TAB was retired at A.71 and casting became the station that
   * replaced it, but this row went on being called "Raise the Forge" and the
   * flag it sets (`forge.built`) went on being the only thing `castingUnlocked`
   * reads. So the door to the new station was still the old station's name, and
   * a player who bought it was told they had built a room that no longer exists.
   *
   * THE ID AND THE FLAG DO NOT MOVE — `forgeBuild` / `state.forge.built` are in
   * every save, in `SURVIVES_BREACH`, and in `recursionSys`. Renaming the STORAGE
   * would be a migration for no gain. What moves is what the row SAYS it opens,
   * which is the part that was lying. Same currency, same 15, same visibility
   * rule: nothing about pacing moves.
   *
   * LAW 3: this shows a DESTINATION (a named place you can go), not a
   * requirement list and not "unlock tier 2 to continue".
   */
  registerUpgrade({
    id: 'forgeBuild',
    name: 'Open the Casting Floor',
    currency: 'CONV',
    baseCost: D(15),
    ratio: 1,
    maxLevel: 1,
    resetsOnCollapse: false,
    // Appears once the loam has given up something worth working.
    visible: (s) => s.materials.totalDrops >= 1 && !s.forge.built,
    description: () =>
      'Sand moulds, a crucible, and a chimney borrowed from the Kiln. The ore you keep finding wants shaping.',
    onPurchase: (s) => {
      s.forge.built = true;
    },
  });
  /**
   * THE SHORING RIG (§9.4) — found in the wreck at Shoring Deep, raised with
   * Brick, and it never falls again.
   *
   * The established pattern for every machine in this shell: the Roll shows you
   * the wreck, walking to it makes it yours, and a repair price turns it back
   * on (§23's cracked kiln at depth 9, seized drill at 28). So the gate is a
   * PLACE you walked to, not a count — LAW 9's "do it once under a condition",
   * and the condition is the one the geography already authored.
   *
   * It sits at depth 120, which is AFTER Loam's last wall (THE KNOT, 109), so
   * the standing rule holds: this is not a structural unlock gated behind the
   * wall it exists to cross. It cannot be — it crosses no wall. It removes a
   * TAX, and the tax it removes is the Collapse re-walk, which is worst
   * precisely at the depths you have to be at to find it.
   */
  registerUpgrade({
    id: 'shoringRig',
    name: 'Raise the Shoring Rig',
    currency: 'CONV',
    baseCost: D(400),
    ratio: 1,
    maxLevel: 1,
    resetsOnCollapse: false,
    visible: (s) => rigFound(s),
    description: () => 'A winch, a saw bench and four hundred feet of prop timber, all of it still where it fell. With it standing you can timber a band so it never has to be walked again.',
    onPurchase: (s) => {
      ensureRoll(s);
      s.roll!.rig = true;
    },
  });
  /**
   * THE FLOODGATE (§36.1) — found in a wreck at a late station, raised with the
   * shell purse, and then it never falls. Same shape as the Shoring Rig, and
   * for the same reason: a machine the Roll shows you before you can have it.
   *
   * CURRENCY IS CONV, so it costs whatever the shell it is found in renders
   * heat into — Ember in Cinder, which is the only shell that authors one.
   */
  registerUpgrade({
    id: 'floodgate',
    name: 'Raise the Floodgate',
    currency: 'CONV',
    baseCost: D(2500),
    ratio: 1,
    maxLevel: 1,
    resetsOnCollapse: false,
    visible: (s) => floodgateFound(s),
    description: () => 'A sluice, a counterweight and a very long lever, all of it cast for one job. With it standing you can give a station the whole bank at once — and it will never be the same place again.',
    onPurchase: (s) => {
      ensureRoll(s);
      s.roll!.floodgate = true;
    },
  });
  registerUpgrade({
    id: 'drillCount',
    name: 'Drill Chassis',
    currency: 'CONV',
    baseCost: D(6),
    /**
     * A.57 — FOUR BANDS, NOT ONE EXPONENT.
     *
     * A.56 moved this row from the "Standard" spam class (r=1.25, 23 levels,
     * ~5,100 for the whole bay) to "Structural" (r=1.75, 15 levels). That was
     * the right direction and the wrong shape: a single ratio makes the FIRST
     * drills feel as punishing as the last, and the first four are supposed to
     * arrive easily — they are how a new bay stops being a curiosity.
     *
     * So the ratio escalates in bands, which is the shape the brief describes
     * and which no single r can draw:
     *
     *   levels 0-3   x1.35   the first four: easy, almost impulse buys
     *   levels 4-7   x1.70   harder — you notice these
     *   levels 8-11  x2.10   very hard, one at a time, between other goals
     *   levels 12-14 x2.60   brutal, and worth it
     *
     * The 16th chassis lands near 900k CONV against a first one at 6, which is
     * a five-order-of-magnitude spread across one row. The other eight rails
     * are not for sale at any price (systems/prizeDrills.ts).
     */
    ratio: 1.7, // the fallback; `ratioAt` is what actually prices it
    ratioAt: (level: number) => (level < 4 ? 1.35 : level < 8 ? 1.7 : level < 12 ? 2.1 : 2.6),
    maxLevel: 15, // bay build grants the 1st; 16 bought, 8 prize, 24 rails
    resetsOnCollapse: false,
    visible: hasBay,
    description: () => 'Another chassis on the rails. It works the best cell without being told — and it is one more machine you could pour an alloy into. They do not get cheaper.',
    onPurchase: (s, levels) => {
      for (let i = 0; i < levels; i++) {
        if (s.drills.units.length < MAX_DRILLS) s.drills.units.push(newDrill(defaultDrillName(s.drills.units.length)));
      }
    },
  });
}

export function registerShell1UpgradeModifiers(): void {
  // ORES. Two rows, deliberately separate: HOW OFTEN pockets form is a
  // different purchase from HOW RICH they run, and a player who wants more
  // small ones is buying a different thing from a player waiting on a Heartrot.
  // Neither touches regen or yield, so neither can move the ceiling — the
  // frequency row is capped by ORE_CAP_SHARE and the rarity row only tilts a
  // roll between types that were already forming (pillar 2, pillar 5).
  registerModifier({
    id: 'upgrade.prospect',
    label: 'A Prospector\'s Eye',
    bucket: 'oreChance',
    value: (s) => 1 + 0.25 * upgradeLevel(s, 'prospect'),
  });
  registerModifier({
    id: 'upgrade.deepsense',
    label: 'Deepsense',
    bucket: 'oreRarity',
    value: (s) => 1 + 0.18 * upgradeLevel(s, 'deepsense'),
  });
  registerModifier({
    id: 'upgrade.bellows',
    label: 'Twin Bellows',
    bucket: 'kilnRate',
    value: (s) => 1 + 0.2 * stat(s, 'bellows'),
  });
  registerModifier({
    id: 'upgrade.firebrick',
    label: 'Firebrick Lining',
    bucket: 'brickYield',
    value: (s) => 1 + 0.1 * stat(s, 'firebrick'),
  });
  registerModifier({
    id: 'upgrade.lantern',
    label: 'Warmer Lantern',
    bucket: 'xpGain',
    value: (s) => 1 + 0.08 * upgradeLevel(s, 'lantern'),
  });
  // Depth Pressure — the invented +2%/depth dust bonus that makes descending
  // pay for itself. Registered here so the breakdown names it.
  registerModifier({
    id: 'depth.pressure',
    label: 'Depth Pressure',
    bucket: 'dustYield',
    value: (s) => 1 + 0.02 * s.depth,
  });
}
