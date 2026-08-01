/**
 * THE FERRITE BAND — the reference implementation of the expanded upgrade
 * tree (Progression & Differentiation, Part B; ruled ~15/shell, discovery-
 * gated, priced through the spine).
 *
 * Three rules, proved here and repeated per shell when the creative pass
 * lands:
 *  - DISCOVERY-GATED (pillar 5): a row appears because you did the thing —
 *    felt a chain break, rigged a magnet, held the ore. Never a locked list.
 *  - SPINE-PRICED: costs are the shell's own currencies and materials, so
 *    the tree consumes what the shell produces. Rows with material costs are
 *    FITTINGS — they persist through Collapse (material wealth is never
 *    burned by the 4–12-minute loop) and wash away at Breach like the shell.
 *  - A THIRD OF THE BAND IS BEHAVIORAL: the signature rows don't buy bigger
 *    numbers, they buy different play (timeout, mercy, cap, bias, a faster
 *    hand). The mechanic reads them in polarity.ts; the rows stay data.
 */
import { D } from '../../decimal';
import { registerModifier } from '../../modifiers';
import { registerUpgrade, stat, type UpgradeDef } from '../../upgrades';
import { getTotal } from '../../resources';
import { materialCount } from '../../systems/forge';
import { masteryLevel } from '../../systems/mastery';
import type { GameState } from '../../types';

const inFerriteEra = (s: GameState) => (s.depthRecords['ferrite'] ?? 0) > 0 || s.shell.current === 'ferrite';
const held = (s: GameState, id: string) => materialCount(s, id) > 0;

/** Every row in the band is a shell-band fitting. */
const reg = (def: Omit<UpgradeDef, 'band'>) => registerUpgrade({ ...def, band: 'shell' });

export function registerShell2Upgrades(): void {
  // --- The signature band: buying DIFFERENT, not bigger --------------------
  reg({
    id: 'inductionCoil',
    name: 'Induction Coil',
    currency: 'scale',
    baseCost: D(60),
    ratio: 1.75,
    maxLevel: 4,
    resetsOnCollapse: false,
    visible: (s) => inFerriteEra(s) && s.polarity.bestChain >= 3,
    description: (l) => `The field holds its breath longer between strokes. Chain timeout +0.75s per coil (now +${(0.75 * l).toFixed(2)}s).`,
  });
  reg({
    id: 'keeperMagnets',
    name: 'Keeper Magnets',
    currency: 'lodestone',
    baseCost: D(12),
    ratio: 1.75,
    maxLevel: 3,
    resetsOnCollapse: false,
    visible: (s) => inFerriteEra(s) && s.polarity.bestChain >= 5,
    description: (l) => `A broken chain is caught falling, not dropped. Break penalty softens by 5% per keeper (now ×${(0.5 + 0.05 * l).toFixed(2)} on the snap).`,
  });
  reg({
    id: 'longRoute',
    name: 'The Long Route',
    currency: 'lodestone',
    baseCost: D(30),
    ratio: 1.75,
    maxLevel: 3,
    resetsOnCollapse: false,
    visible: (s) => inFerriteEra(s) && s.polarity.bestChain >= 10,
    description: (l) => `The rock will follow an argument further than twelve steps. Chain cap +1 per level (now ${12 + l}).`,
  });
  reg({
    id: 'woundCores',
    name: 'Wound Cores',
    currency: 'scale',
    baseCost: D(150),
    ratio: 1.75,
    maxLevel: 5,
    resetsOnCollapse: false,
    visible: (s) => inFerriteEra(s) && s.polarity.magnetCount >= 1,
    description: (l) => `Tighter windings, surer poles. Magnet bias +2% per level (now ${Math.round(Math.min(95, 85 + 2 * l))}%).`,
  });
  reg({
    id: 'poleDampers',
    name: 'Pole Dampers',
    currency: 'lodestone',
    baseCost: D(20),
    ratio: 1.75,
    maxLevel: 3,
    resetsOnCollapse: false,
    visible: (s) => inFerriteEra(s) && s.techniques.lastUsed['poleshift'] !== undefined,
    description: (l) => `The iron argues back less. Poleshift recovers 1s faster per damper (now −${l}s).`,
  });

  // --- The industry band: the machines learn the shell ---------------------
  reg({
    id: 'alloyBores',
    name: 'Alloyed Bores',
    currency: 'flux',
    baseCost: D(8),
    ratio: 1.4,
    maxLevel: 6,
    resetsOnCollapse: false,
    materialCosts: [{ id: 'bluesteel', count: 3 }],
    visible: (s) => s.drills.bayBuilt && held(s, 'bluesteel'),
    description: (l) => `Drill bits poured from the shell they bite. Drill speed +6% per bore (now +${6 * l}%).`,
  });
  reg({
    id: 'fluxFeeds',
    name: 'Flux Feeds',
    currency: 'scale',
    baseCost: D(40),
    ratio: 1.25,
    maxLevel: 8,
    resetsOnCollapse: false,
    visible: (s) => s.kiln.built && getTotal(s, 'flux').gt(0),
    description: (l) => `The Bloomery eats from a hopper, not a hand. Converter intake +8% per feed (now +${8 * l}%).`,
  });
  reg({
    id: 'sluiceScreens',
    name: 'Sluice Screens',
    currency: 'scale',
    baseCost: D(30),
    ratio: 1.4,
    maxLevel: 5,
    resetsOnCollapse: false,
    materialCosts: [{ id: 'rimeiron', count: 3 }],
    visible: (s) => inFerriteEra(s) && held(s, 'rimeiron'),
    description: (l) => `What the wash would lose, the mesh keeps. Drop rate +4% per screen (now +${4 * l}%).`,
  });
  reg({
    id: 'deepAnchors',
    name: 'Deep Anchors',
    currency: 'lodestone',
    baseCost: D(25),
    ratio: 1.5,
    maxLevel: 5,
    resetsOnCollapse: false,
    visible: (s) => (s.depthRecords['ferrite'] ?? 0) >= 40,
    description: (l) => `The stair bolts to the vein itself. Descent −2% per anchor (now −${2 * l}%).`,
  });
  reg({
    id: 'bloomJacks',
    name: 'Bloom Jacks',
    currency: 'scale',
    baseCost: D(45),
    ratio: 1.4,
    maxLevel: 5,
    resetsOnCollapse: false,
    materialCosts: [{ id: 'magnetile', count: 2 }],
    visible: (s) => inFerriteEra(s) && held(s, 'magnetile'),
    description: (l) => `Rust pressed back into worth. Converter output +8% per jack (now +${8 * l}%).`,
  });

  // --- The face band: the dig itself, shell-priced -------------------------
  reg({
    id: 'ironBlades',
    name: 'Bluesteel Blades',
    currency: 'scale',
    baseCost: D(25),
    ratio: 1.4,
    maxLevel: 10,
    resetsOnCollapse: false,
    materialCosts: [{ id: 'bluesteel', count: 4 }],
    visible: (s) => inFerriteEra(s) && held(s, 'bluesteel'),
    description: (l) => `Edges folded from steel that was never asked to be soft. Chip yield +5% per blade (now +${5 * l}%).`,
  });
  reg({
    id: 'galvanicBed',
    name: 'Galvanic Bed',
    currency: 'scale',
    baseCost: D(80),
    ratio: 1.35,
    maxLevel: 8,
    resetsOnCollapse: false,
    visible: (s) => masteryLevel(s, 'ferrite') >= 2,
    description: (l) => `A current under the face; the rock refills like a held breath. Regen +4% per level (now +${4 * l}%).`,
  });
  reg({
    id: 'quenchedPicks',
    name: 'Quenched Picks',
    currency: 'scale',
    baseCost: D(35),
    ratio: 1.4,
    maxLevel: 6,
    resetsOnCollapse: false,
    materialCosts: [{ id: 'rimeiron', count: 4 }],
    visible: (s) => inFerriteEra(s) && held(s, 'rimeiron'),
    description: (l) => `Hardened for what bites back. Dust +5% per pick (now +${5 * l}%).`,
  });
  reg({
    id: 'filingsJournal',
    name: 'Filings Journal',
    currency: 'scale',
    baseCost: D(20),
    ratio: 1.4,
    maxLevel: 5,
    resetsOnCollapse: false,
    materialCosts: [{ id: 'voltglass', count: 1 }],
    visible: (s) => inFerriteEra(s) && held(s, 'voltglass'),
    description: (l) => `Every shaving taught something. XP +6% per volume (now +${6 * l}%).`,
  });
  reg({
    id: 'loderails',
    name: 'Loderails',
    currency: 'lodestone',
    baseCost: D(18),
    ratio: 1.5,
    maxLevel: 4,
    resetsOnCollapse: false,
    materialCosts: [{ id: 'lodeframe', count: 2 }],
    visible: (s) => inFerriteEra(s) && held(s, 'lodeframe') && s.assay.surveysDone >= 1,
    description: (l) => `Survey gear that rides the field instead of fighting it. Assay speed +12% per rail (now +${12 * l}%).`,
  });
}

export function registerShell2UpgradeModifiers(): void {
  const rows: Array<{ id: string; bucket: Parameters<typeof registerModifier>[0]['bucket']; per: number; label: string }> = [
    { id: 'alloyBores', bucket: 'drillSpeed', per: 0.06, label: 'Alloyed Bores' },
    { id: 'fluxFeeds', bucket: 'kilnRate', per: 0.08, label: 'Flux Feeds' },
    { id: 'sluiceScreens', bucket: 'dropRate', per: 0.04, label: 'Sluice Screens' },
    { id: 'bloomJacks', bucket: 'brickYield', per: 0.08, label: 'Bloom Jacks' },
    { id: 'ironBlades', bucket: 'dustYield', per: 0.05, label: 'Ironbloom Blades' },
    { id: 'galvanicBed', bucket: 'regen', per: 0.04, label: 'Galvanic Bed' },
    { id: 'quenchedPicks', bucket: 'dustYield', per: 0.05, label: 'Quenched Picks' },
    { id: 'filingsJournal', bucket: 'xpGain', per: 0.06, label: 'Filings Journal' },
    { id: 'loderails', bucket: 'assaySpeed', per: 0.12, label: 'Loderails' },
  ];
  for (const r of rows) {
    registerModifier({
      id: `upgrade.${r.id}`,
      label: r.label,
      bucket: r.bucket,
      value: (s) => 1 + r.per * stat(s, r.id),
    });
  }
  registerModifier({
    id: 'upgrade.deepAnchors',
    label: 'Deep Anchors',
    bucket: 'descendCost',
    value: (s) => 1 - 0.02 * stat(s, 'deepAnchors'),
  });
  // keeperMagnets / inductionCoil / longRoute / woundCores / poleDampers are
  // BEHAVIORAL — polarity.ts and the poleshift technique read them directly.
}
