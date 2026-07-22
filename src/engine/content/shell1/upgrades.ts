/**
 * Shell I upgrades. Cost classes per DESIGN.md: Spam 1.15 / Standard 1.25 /
 * Structural 1.75. Blade/Soil/Roots feed the locked face formulas directly;
 * everything else registers named modifiers.
 */
import { D } from '../../decimal';
import { registerModifier } from '../../modifiers';
import { registerUpgrade, stat, upgradeLevel } from '../../upgrades';
import type { GameState } from '../../types';
import { newDrill, defaultDrillName } from '../../systems/drills';
import { UNCOVER_MOTIF_GRANT } from './latticeSystem';

const hasKiln = (s: GameState) => s.kiln.built;
const hasBay = (s: GameState) => s.drills.bayBuilt;

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
    // The bay's rails need deeper anchoring: Loam depth record 55 lands the
    // unlock near the 45-minute beat. Once proven (or once you've breached),
    // the technique is yours in every shell.
    visible: (s) => hasKiln(s) && ((s.depthRecords['loam'] ?? 0) >= 55 || s.shell.breachCount > 0),
    description: () => 'Rails, a winch, and a place to bolt down machines that dig while you think. The anchoring needed depth 55 to hold.',
    onPurchase: (s) => {
      s.drills.bayBuilt = true;
      if (s.drills.units.length === 0) s.drills.units.push(newDrill(defaultDrillName(0)));
    },
  });
  registerUpgrade({
    id: 'latticeUncover',
    name: 'Clear the Rubble',
    currency: 'CONV',
    baseCost: D(25),
    ratio: 1,
    maxLevel: 1,
    resetsOnCollapse: false,
    // The first Collapse breaks through into something older.
    visible: (s) => s.collapse.count >= 1 && !s.lattice.unlocked,
    description: () =>
      'The collapse broke through into something older. Carved. Geometric. Waiting. Shore it up and see.',
    onPurchase: (s) => {
      s.lattice.unlocked = true;
      s.currencies['motif'] = (s.currencies['motif'] ?? D(0)).add(UNCOVER_MOTIF_GRANT);
    },
  });
  registerUpgrade({
    id: 'forgeBuild',
    name: 'Raise the Forge',
    currency: 'CONV',
    baseCost: D(15),
    ratio: 1,
    maxLevel: 1,
    resetsOnCollapse: false,
    // Appears once the loam has given up something worth working.
    visible: (s) => s.materials.totalDrops >= 1 && !s.forge.built,
    description: () =>
      'An anvil, a quench-barrel, and a chimney borrowed from the Kiln. The ore you keep finding wants shaping.',
    onPurchase: (s) => {
      s.forge.built = true;
    },
  });
  registerUpgrade({
    id: 'chisels',
    name: 'Finer Chisels',
    currency: 'CONV',
    baseCost: D(30),
    ratio: 1.75,
    maxLevel: 3,
    resetsOnCollapse: false,
    visible: (s) => s.lattice.unlocked,
    description: (l) =>
      `Cut Motifs of rank ${3 + l > 5 ? 5 : 3 + l}. The Lattice accepts finer work only from finer tools (now up to rank ${2 + l}).`,
  });
  registerUpgrade({
    id: 'drillCount',
    name: 'Drill Chassis',
    currency: 'CONV',
    baseCost: D(6),
    ratio: 1.25,
    maxLevel: 23, // bay build grants the 1st; 24 total (locked cap)
    resetsOnCollapse: false,
    visible: hasBay,
    description: () => 'Another chassis on the rails. Each drill is upgraded and targeted individually.',
    onPurchase: (s, levels) => {
      for (let i = 0; i < levels; i++) {
        if (s.drills.units.length < 24) s.drills.units.push(newDrill(defaultDrillName(s.drills.units.length)));
      }
    },
  });
}

export function registerShell1UpgradeModifiers(): void {
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
