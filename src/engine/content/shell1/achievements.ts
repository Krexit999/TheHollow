/**
 * The achievement grid — 19 columns x 10 rows, 190 cells for the whole game.
 * Phase 1 ships ~21 real achievements; the emptiness of the rest is the hook.
 * Every achievement grants a real bonus (registered as a named modifier).
 * Completing a full row (19) or column (10) grants a large one; column 0 is
 * fully populated so the first column bonus is reachable in Shell I.
 *
 * Rows are themes: 0 Dust / 1 Kiln / 2 Depth / 3 Collapse / 4 Delver /
 * 5 Drills / 6 The Face / 7 Rituals / 8 Works / 9 The Lattice.
 */
import type { Bucket } from '../../modifiers';
import { computeBucket, registerModifier } from '../../modifiers';
import { getTotal } from '../../resources';
import { materialDef } from '../../materials';
import { networkCapacity } from '../../systems/pressure';
import type { EngineCtx, GameState } from '../../types';

/**
 * NINETEEN columns, not the twenty-five the spec first asked for (Phase 13).
 *
 * Columns 0-18 are full — ten achievements each, 190 real cells. Columns 19-24
 * were never authored and never would be: the game ran out of things worth
 * asking for before it ran out of grid. Sixty permanently unfillable cells is
 * not a hook, it is a defect that tells every completionist the game is broken.
 * Shrinking loses no content and no bonus; it just stops promising six columns
 * that do not exist.
 */
export const ACH_COLS = 19;
export const ACH_ROWS = 10;

export interface AchievementDef {
  id: string;
  row: number;
  col: number;
  name: string;
  description: string;
  check: (state: GameState) => boolean;
  bonus: { bucket: Bucket; value: number; label: string };
}

const A = (
  id: string,
  row: number,
  col: number,
  name: string,
  description: string,
  check: (s: GameState) => boolean,
  bucket: Bucket,
  value: number,
  bonusLabel: string,
): AchievementDef => ({ id, row, col, name, description, check, bonus: { bucket, value, label: bonusLabel } });

export const ACHIEVEMENTS: AchievementDef[] = [
  // Row 0 — Dust
  A('firstChip', 0, 0, 'First Blood from Stone', 'Chip a cell by hand.', (s) => s.stats.manualChips >= 1, 'dustYield', 1.01, '+1% Dust'),
  A('dust1k', 0, 1, 'A Thousand Grains', 'Earn 1,000 total Dust.', (s) => getTotal(s, 'dust').gte(1e3), 'dustYield', 1.01, '+1% Dust'),
  A('dust100k', 0, 2, 'Dust Devil', 'Earn 100K total Dust.', (s) => getTotal(s, 'dust').gte(1e5), 'dustYield', 1.02, '+2% Dust'),
  A('dust10m', 0, 3, 'Ten Million Motes', 'Earn 10M total Dust.', (s) => getTotal(s, 'dust').gte(1e7), 'dustYield', 1.03, '+3% Dust'),
  A('firstIngot', 0, 4, 'New Rock, Old Hands', 'Chip your first Ingot.', (s) => getTotal(s, 'ingot').gte(1), 'dustYield', 1.03, '+3% chip yield'),
  // Row 1 — The Kiln
  A('kilnBuilt', 1, 0, 'Firstfire', 'Raise the Kiln.', (s) => s.kiln.built, 'kilnRate', 1.02, '+2% Kiln intake'),
  A('brick1', 1, 1, 'It Holds', 'Fire your first Brick.', (s) => s.stats.bricksFired.gte(1), 'brickYield', 1.01, '+1% Brick'),
  A('brick100', 1, 2, 'Mason', 'Fire 100 Bricks.', (s) => s.stats.bricksFired.gte(100), 'brickYield', 1.05, '+5% Brick'),
  A('conv1k', 1, 3, 'A Thousand Firings', 'Fire 1,000 converter units, in any shell.', (s) => s.stats.bricksFired.gte(1000), 'kilnRate', 1.05, '+5% converter intake'),
  A('flux100', 1, 4, 'Bloomery Song', 'Earn 100 Flux.', (s) => (s.totals['flux']?.gte(100)) ?? false, 'brickYield', 1.05, '+5% converter output'),
  // Row 2 — Depth
  A('depth10', 2, 0, 'Ten Under', 'Reach depth 10.', (s) => s.maxDepthRecord >= 10, 'dustYield', 1.01, '+1% Dust'),
  A('depth40', 2, 1, 'Where the Light Quits', 'Reach depth 40.', (s) => s.maxDepthRecord >= 40, 'dustYield', 1.02, '+2% Dust'),
  A('depth100', 2, 2, 'A Hundred Down', 'Reach depth 100.', (s) => s.maxDepthRecord >= 100, 'xpGain', 1.05, '+5% XP'),
  A('assayed', 2, 3, 'Read the Rock', 'Complete an assay survey.', (s) => s.assay.surveysDone >= 1, 'dropRate', 1.02, '+2% drops'),
  A('floor150', 2, 4, 'The Floor of the World', 'Stand on the floor of Loam.', (s) => (s.depthRecords['loam'] ?? 0) >= 150, 'dustYield', 1.05, '+5% chip yield'),
  // Row 3 — Collapse
  A('collapse1', 3, 0, 'Let It Fall', 'Collapse the shaft once.', (s) => s.collapse.count >= 1, 'dustYield', 1.02, '+2% Dust'),
  A('coreNode1', 3, 1, 'Core Sampler', 'Buy a Core tree node.', (s) => Object.values(s.collapse.nodes).some((l) => l > 0), 'xpGain', 1.02, '+2% XP'),
  A('collapse10', 3, 2, 'Serial Collapser', 'Collapse ten times.', (s) => s.collapse.count >= 10, 'dustYield', 1.05, '+5% Dust'),
  A('collapse25', 3, 3, 'Habitual Ruin', 'Collapse twenty-five times.', (s) => s.collapse.count >= 25, 'dustYield', 1.05, '+5% Dust'),
  A('nodeMax', 3, 4, 'Root of the Matter', 'Raise a Core node to level 10.', (s) => Object.values(s.collapse.nodes).some((l) => l >= 10), 'dustYield', 1.05, '+5% Dust'),
  // Row 4 — Delver
  A('level5', 4, 0, 'Delver', 'Reach Delver level 5.', (s) => s.delver.level >= 5, 'xpGain', 1.02, '+2% XP'),
  A('level10', 4, 1, 'Sure-Footed', 'Reach Delver level 10.', (s) => s.delver.level >= 10, 'xpGain', 1.03, '+3% XP'),
  A('level20', 4, 2, 'The Shaft Knows You', 'Reach Delver level 20.', (s) => s.delver.level >= 20, 'xpGain', 1.05, '+5% XP'),
  A('level30', 4, 3, 'Deep Habits', 'Reach Delver level 30.', (s) => s.delver.level >= 30, 'xpGain', 1.05, '+5% XP'),
  A('level40', 4, 4, 'Older Than the Maps', 'Reach Delver level 40.', (s) => s.delver.level >= 40, 'xpGain', 1.05, '+5% XP'),
  // Row 5 — Drills
  A('bayBuilt', 5, 0, 'It Digs Alone', 'Assemble the Drill Bay.', (s) => s.drills.bayBuilt, 'drillSpeed', 1.02, '+2% drill speed'),
  A('drills6', 5, 1, 'Shift Crew', 'Run six drills at once.', (s) => s.drills.units.length >= 6, 'drillSpeed', 1.03, '+3% drill speed'),
  A('drills24', 5, 2, 'Full Bay', 'Run all twenty-four drills.', (s) => s.drills.units.length >= 24, 'drillSpeed', 1.1, '+10% drill speed'),
  A('drills12', 5, 3, 'Twelve on the Rails', 'Run twelve drills at once.', (s) => s.drills.units.length >= 12, 'drillSpeed', 1.05, '+5% drill speed'),
  A('drills18', 5, 4, 'Eighteen Strong', 'Run eighteen drills at once.', (s) => s.drills.units.length >= 18, 'drillSpeed', 1.05, '+5% drill speed'),
  // Row 6 — The Face
  A('chips1k', 6, 0, 'Callouses', 'Chip cells by hand 1,000 times.', (s) => s.stats.manualChips >= 1000, 'dustYield', 1.02, '+2% Dust'),
  A('chips5k', 6, 1, 'Bare Hands, Broken Stone', 'Chip cells by hand 5,000 times.', (s) => s.stats.manualChips >= 5000, 'dustYield', 1.02, '+2% Dust'),
  A('fullField', 6, 2, 'Brimming', 'Every cell at full charge at once.', (s) => {
    const cap = 8 * (1 + 0.5 * (s.upgrades['roots'] ?? 0)) * computeBucket(s, 'cap').toNumber();
    return s.face.cells.every((c) => c >= cap - 0.01);
  }, 'regen', 1.03, '+3% regen'),
  A('firstMaterial', 6, 3, 'Something in the Dust', 'Find your first material.', (s) => s.materials.totalDrops >= 1, 'dropRate', 1.02, '+2% drops'),
  A('flawlessFind', 6, 4, 'Without Flaw', 'Hold a Flawless or better material.', (s) =>
    s.assay.knownMaterials.some((id) => {
      try {
        const r = materialDef(id).rarity;
        return r === 'flawless' || r === 'starred' || r === 'aberrant';
      } catch {
        return false;
      }
    }), 'dropRate', 1.03, '+3% drops'),
  // Row 7 — Rituals
  A('exported', 7, 0, 'Kept in Amber', 'Export your save.', (s) => s.stats.saveExported, 'xpGain', 1.01, '+1% XP'),
  A('returned', 7, 1, 'The Dig Went On', 'Return to collected offline progress.', (s) => s.stats.offlineClaimed, 'offlineEffAdd', 0.01, '+1% offline efficiency'),
  A('longWatch', 7, 2, 'The Long Watch', 'Collect eight hours of offline progress at once.', (s) => s.stats.longestOfflineSec >= 8 * 3600, 'offlineEffAdd', 0.01, '+1% offline efficiency'),
  A('longWatch24', 7, 3, 'Keeper of the Dark', 'Collect a full day of offline progress at once.', (s) => s.stats.longestOfflineSec >= 24 * 3600, 'offlineEffAdd', 0.02, '+2% offline efficiency'),
  A('firstBreach', 7, 4, 'Through the Floor', 'Breach into a second world.', (s) => s.shell.breachCount >= 1, 'dustYield', 1.1, '+10% chip yield'),
  // Columns 6-7 (Phase 5): the fighting columns.
  A('dust1b', 0, 5, 'A Billion Motes', 'Earn 1B total Dust.', (s) => getTotal(s, 'dust').gte(1e9), 'dustYield', 1.05, '+5% chip yield'),
  A('ingot10m', 0, 6, 'Ten Million Ingots', 'Earn 10M total Ingot.', (s) => getTotal(s, 'ingot').gte(1e7), 'dustYield', 1.05, '+5% chip yield'),
  A('conv10k', 1, 5, 'Ten Thousand Firings', 'Fire 10,000 converter units.', (s) => s.stats.bricksFired.gte(1e4), 'kilnRate', 1.05, '+5% converter intake'),
  A('flux5k', 1, 6, 'Flux Baron', 'Earn 5,000 Flux.', (s) => getTotal(s, 'flux').gte(5e3), 'brickYield', 1.05, '+5% converter output'),
  A('ferrite100', 2, 5, 'A Hundred Into Iron', 'Reach Ferrite depth 100.', (s) => (s.depthRecords['ferrite'] ?? 0) >= 100, 'dustYield', 1.05, '+5% chip yield'),
  A('ferrite250', 2, 6, 'The Second Floor', 'Stand on the floor of Ferrite.', (s) => (s.depthRecords['ferrite'] ?? 0) >= 250, 'dustYield', 1.05, '+5% chip yield'),
  A('collapse50', 3, 5, 'Ruin, Perfected', 'Collapse fifty times.', (s) => s.collapse.count >= 50, 'dustYield', 1.05, '+5% Dust'),
  A('cores1k', 3, 6, 'A Thousand Cold Hearts', 'Earn 1,000 lifetime Cores.', (s) => getTotal(s, 'core').gte(1000), 'dustYield', 1.05, '+5% chip yield'),
  A('level50', 4, 5, 'Half the Ladder', 'Reach Delver level 50.', (s) => s.delver.level >= 50, 'xpGain', 1.05, '+5% XP'),
  A('level60', 4, 6, 'The Long Habit', 'Reach Delver level 60.', (s) => s.delver.level >= 60, 'xpGain', 1.05, '+5% XP'),
  A('drillLevels60', 5, 5, 'Well-Oiled', '60 total drill levels.', (s) => s.drills.units.reduce((a, d) => a + d.level, 0) >= 60, 'drillSpeed', 1.05, '+5% drill speed'),
  A('drillLevels120', 5, 6, 'The Tireless Shift', '120 total drill levels.', (s) => s.drills.units.reduce((a, d) => a + d.level, 0) >= 120, 'drillSpeed', 1.05, '+5% drill speed'),
  // Ferrite-era extras (columns 6+ seed the wider grid)
  A('chain6', 6, 5, 'Six in a Row', 'Ride a polarity chain to length 6.', (s) => s.polarity.bestChain >= 6, 'chainPower', 1.03, '+3% chain power'),
  A('chain12', 6, 6, 'The Full Circuit', 'Ride a polarity chain to length 12.', (s) => s.polarity.bestChain >= 12, 'chainPower', 1.05, '+5% chain power'),
  A('magnet1', 6, 7, 'Rigged Column', 'Install a magnet on the Array.', (s) => s.polarity.magnetCount >= 1, 'chainPower', 1.03, '+3% chain power'),
  // Row 8 — Works
  A('upgrades10', 8, 0, 'Patron of the Works', 'Buy 10 upgrade levels.', (s) => s.stats.upgradesBought >= 10, 'dustYield', 1.01, '+1% Dust'),
  A('charge10k', 8, 1, 'Ten Thousand Tons', 'Chip 10,000 total charge.', (s) => s.stats.totalChargeChipped.gte(1e4), 'dustYield', 1.02, '+2% Dust'),
  A('firstTool', 8, 2, 'Smith of One', 'Forge a tool.', (s) => s.stats.toolsForged >= 1, 'dustYield', 1.02, '+2% Dust'),
  A('firstGeode', 8, 3, "What's Inside", 'Crack a geode.', (s) => s.materials.geodesCracked >= 1, 'dropRate', 1.03, '+3% drops'),
  A('gemSet', 8, 4, 'Set in Stone', 'Socket a gem into a tool.', (s) => s.forge.tools.some((t) => t.sockets.some((g) => g !== null)), 'dustYield', 1.02, '+2% Dust'),
  A('tier3Tool', 8, 5, 'Third Tier', 'Forge a Tier III tool.', (s) => s.forge.tools.some((t) => t.tier >= 3), 'dustYield', 1.03, '+3% Dust'),
  // Columns 8-9 (Phase 6): the Lamphouse columns.
  A('marrowNod', 1, 8, "Marrow's Nod", 'Forge a tool at 80+ purity.', (s) => s.forge.tools.some((t) => t.purity >= 80), 'brickYield', 1.05, '+5% converter output'),
  // Columns 10-11 (Phase 7): the green columns.
  A('spore10k', 0, 9, 'Green Dust', 'Earn 10K Spore.', (s) => (s.totals['spore']?.gte(1e4)) ?? false, 'dustYield', 1.04, '+4% chip yield'),
  A('sap2k', 1, 9, 'The Slow Gold', 'Render 2,000 Sap.', (s) => (s.totals['sap']?.gte(2e3)) ?? false, 'kilnRate', 1.05, '+5% converter intake'),
  A('verdance100', 2, 9, 'A Hundred Into Green', 'Reach Verdance depth 100.', (s) => (s.depthRecords['verdance'] ?? 0) >= 100, 'dustYield', 1.05, '+5% chip yield'),
  A('breach2', 7, 9, 'Twice Through the Floor', 'Breach into a third world.', (s) => s.shell.breachCount >= 2, 'dustYield', 1.1, '+10% chip yield'),
  A('chloro1k', 0, 10, 'Deep Green', 'Shed 1,000 Chlorophyll from blooms.', (s) => (s.totals['chlorophyll']?.gte(1e3)) ?? false, 'dustYield', 1.05, '+5% chip yield'),
  A('conv50k', 1, 10, 'Fifty Thousand Firings', 'Fire 50,000 converter units.', (s) => s.stats.bricksFired.gte(5e4), 'brickYield', 1.05, '+5% converter output'),
  A('verdance350', 2, 10, 'The Third Floor', 'Stand on the floor of Verdance.', (s) => (s.depthRecords['verdance'] ?? 0) >= 290, 'dustYield', 1.08, '+8% chip yield'),
  A('cores10k', 3, 10, 'Ten Thousand Cold Hearts', 'Earn 10,000 lifetime Cores.', (s) => getTotal(s, 'core').gte(1e4), 'dustYield', 1.05, '+5% chip yield'),
  A('level100', 4, 10, 'The Long Century', 'Reach Delver level 100.', (s) => s.delver.level >= 100, 'xpGain', 1.06, '+6% XP'),
  A('drillLevels200', 5, 10, 'Two Hundred Turns', '200 total drill levels.', (s) => s.drills.units.reduce((a, d) => a + d.level, 0) >= 200, 'drillSpeed', 1.05, '+5% drill speed'),
  A('fruit400', 6, 10, 'The Patient Harvest', 'Harvest 400 charge of vine-fruit.', (s) => s.growth.fruitHarvested >= 400, 'regen', 1.04, '+4% regen'),
  // Verdance extras seeding column 12.
  A('feral9', 6, 11, 'A Wild Quarter', 'Let nine cells go feral at once.', (s) => s.growth.stage.filter((st) => st >= 4).length >= 9, 'regen', 1.04, '+4% regen'),
  // Columns 12-13 (Phase 8): the cold light columns.
  A('prism100k', 0, 11, 'A Hundred Thousand Facets', 'Earn 100K Prism.', (s) => (s.totals['prism']?.gte(1e5)) ?? false, 'dustYield', 1.05, '+5% chip yield'),
  A('lumen10k', 1, 11, 'Weightless Wealth', 'Render 10K Lumen.', (s) => (s.totals['lumen']?.gte(1e4)) ?? false, 'kilnRate', 1.05, '+5% converter intake'),
  A('glassmere100', 2, 11, 'A Hundred Into Glass', 'Reach Glassmere depth 100.', (s) => (s.depthRecords['glassmere'] ?? 0) >= 100, 'dustYield', 1.05, '+5% chip yield'),
  A('breach3', 3, 11, 'Thrice Through the Floor', 'Breach into a fourth world.', (s) => s.shell.breachCount >= 3, 'dustYield', 1.1, '+10% chip yield'),
  A('level140', 4, 11, 'Older Than the Charts', 'Reach Delver level 140.', (s) => s.delver.level >= 140, 'xpGain', 1.06, '+6% XP'),
  A('mirrors4', 5, 11, 'A Working Optic', 'Own four mirrors for the face.', (s) => s.refraction.mirrorStock >= 4, 'dustYield', 1.04, '+4% chip yield'),
  A('spectrum500', 0, 12, 'Bottled Skies', 'Earn 500 Spectrum.', (s) => (s.totals['spectrum']?.gte(500)) ?? false, 'xpGain', 1.05, '+5% XP'),
  A('beam1k', 1, 12, 'A Thousand Lit Harvests', 'Harvest 1,000 beam-lit cells.', (s) => s.refraction.beamHarvests >= 1000, 'dustYield', 1.05, '+5% chip yield'),
  A('glassmere380', 2, 12, 'The Fourth Floor', 'Stand on the floor of Glassmere.', (s) => (s.depthRecords['glassmere'] ?? 0) >= 380, 'dustYield', 1.08, '+8% chip yield'),
  A('pairs5', 4, 12, 'A Working Grammar', 'Discover five rune pairs.', (s) => s.runes.pairsSeen.length >= 5, 'dustYield', 1.05, '+5% chip yield'),
  // Columns 14-15 (Phase 9): the burnt columns.
  A('slag1m', 0, 13, 'A Million Regrets', 'Earn 1M Slag.', (s) => (s.totals['slag']?.gte(1e6)) ?? false, 'dustYield', 1.05, '+5% chip yield'),
  A('ember50k', 1, 13, 'Spendable Heat', 'Run 50K Ember through the Slagworks.', (s) => (s.totals['ember']?.gte(5e4)) ?? false, 'kilnRate', 1.05, '+5% converter intake'),
  A('cinder100', 2, 13, 'A Hundred Into Ash', 'Reach Cinder depth 100.', (s) => (s.depthRecords['cinder'] ?? 0) >= 100, 'dustYield', 1.05, '+5% chip yield'),
  A('breach4', 3, 13, 'Four Floors Down', 'Breach into a fifth world.', (s) => s.shell.breachCount >= 4, 'dustYield', 1.1, '+10% chip yield'),
  A('level160', 4, 13, 'Seasoned Past Reason', 'Reach Delver level 160.', (s) => s.delver.level >= 160, 'xpGain', 1.06, '+6% XP'),
  A('vent1k', 5, 13, 'A Thousand Breaths', 'Vent 1,000 heat.', (s) => s.pressure.ventedTotal >= 1000, 'regen', 1.05, '+5% regen'),
  A('pipes8', 6, 13, 'Plumbing the Depths', 'Lay eight sections of the Vent Network.', (s) => s.pressure.pipes.filter((p) => p > 0).length >= 8, 'dustYield', 1.04, '+4% chip yield'),
  A('heat90', 0, 14, 'Ninety Degrees of Nerve', 'Run the shaft at ninety heat.', (s) => s.pressure.peakHeat >= 90, 'dustYield', 1.06, '+6% chip yield'),
  A('unflooded', 1, 14, 'The Klaxon, Answered', 'Enter OVERPRESSURE and never flood.', (s) => s.pressure.overpressures >= 1 && s.pressure.floods === 0, 'regen', 1.05, '+5% regen'),
  A('cinder470', 2, 14, 'The Burnt Floor', 'Stand on the floor of Cinder.', (s) => (s.depthRecords['cinder'] ?? 0) >= 470, 'dustYield', 1.08, '+8% chip yield'),
  A('tool15', 4, 14, 'The Fifteenth', 'Forge the Cinder Maul. The ladder ends.', (s) => s.forge.tools.some((t) => t.tier >= 15), 'dustYield', 1.1, '+10% chip yield'),
  A('network2', 5, 14, 'A Second Wind', 'Route the Vent Network to two heat per second.', (s) => networkCapacity(s) >= 2, 'regen', 1.05, '+5% regen'),
  // Columns 16-19 (Phase 10): the last columns. The grid closes.
  A('void100k', 0, 15, 'A Hundred Thousand Nothings', 'Earn 100K Void.', (s) => (s.totals['void']?.gte(1e5)) ?? false, 'dustYield', 1.05, '+5% chip yield'),
  A('breach5', 1, 15, 'Five Floors Down', 'Breach into the Hollow.', (s) => s.shell.breachCount >= 5, 'dustYield', 1.1, '+10% chip yield'),
  A('hollow100', 2, 15, 'A Hundred Into Nothing', 'Reach Hollow depth 100.', (s) => (s.depthRecords['hollow'] ?? 0) >= 100, 'dustYield', 1.05, '+5% chip yield'),
  A('listen50', 3, 15, 'Fifty Harvested Quiets', 'Harvest 50 total Silence stacks.', (s) => s.hollow.silenceHarvested >= 50, 'regen', 1.05, '+5% regen'),
  A('rebuild1', 4, 15, 'One Cell of Rock', 'Rebuild the first phantom cell.', (s) => s.hollow.rebuilt.length >= 1, 'dustYield', 1.05, '+5% chip yield'),
  A('level180', 5, 15, 'Older Than the Question', 'Reach Delver level 180.', (s) => s.delver.level >= 180, 'xpGain', 1.06, '+6% XP'),
  A('carriedAll', 7, 15, 'Five Ghosts Working', 'Hold all five carried signatures at once.', (s) => s.shell.signatures.length >= 5, 'dustYield', 1.06, '+6% chip yield'),
  A('silence90', 8, 15, 'Let It Get Loud', 'Let the Silence reach ninety.', (s) => s.hollow.silence >= 90 || s.hollow.silenceHarvested >= 500, 'dropRate', 1.05, '+5% drops'),
  A('pairs20', 9, 15, 'A Fluent Grammar', 'Know twenty rune pairs.', (s) => s.runes.pairsSeen.length >= 20, 'dustYield', 1.06, '+6% chip yield'),
  A('rebuild12', 0, 16, 'A Working Face', 'Rebuild twelve cells.', (s) => s.hollow.rebuilt.length >= 12, 'regen', 1.05, '+5% regen'),
  A('hollow560', 1, 16, 'The Unwritten Floor', 'Stand at the bottom of the Hollow.', (s) => (s.depthRecords['hollow'] ?? 0) >= 560, 'dustYield', 1.08, '+8% chip yield'),
  A('faceWhole', 3, 16, 'The World, Remembered', 'Rebuild the whole face.', (s) => s.shell.current === 'hollow' && s.hollow.rebuilt.length >= s.face.cells.length ? true : s.shell.breachCount >= 6, 'dustYield', 1.1, '+10% chip yield'),
  A('resonance1k', 5, 16, 'A Thousand Returns', 'Earn 1K Resonance.', (s) => (s.totals['resonance']?.gte(1000)) ?? false, 'dropRate', 1.05, '+5% find rate'),
  A('heirloom1', 9, 16, 'It Outlived Its World', 'Own an heirloom tool.', (s) => s.forge.tools.some((t) => t.heirloom === true), 'dustYield', 1.05, '+5% chip yield'),
  A('breach6', 0, 17, 'The Last Fall', 'Breach into Aleph.', (s) => s.shell.breachCount >= 6, 'dustYield', 1.1, '+10% chip yield'),
  A('coreTouch', 2, 17, 'The Desk, The Chair, The Pen', 'Touch the Core.', (s) => s.aleph.coreTouched || (s.recursion?.count ?? 0) >= 1, 'dustYield', 1.08, '+8% chip yield'),
  A('recursion1', 4, 17, 'Begin Again, Knowing', 'Complete a Recursion.', (s) => (s.recursion?.count ?? 0) >= 1, 'dustYield', 1.12, '+12% chip yield'),
  A('axiom1', 5, 17, 'One True Thing', 'Write your first Axiom.', (s) => (s.recursion?.axioms.length ?? 0) >= 1, 'dustYield', 1.06, '+6% chip yield'),
  A('recursion2', 6, 17, 'The Long Habit', 'Complete a second Recursion.', (s) => (s.recursion?.count ?? 0) >= 2, 'dropRate', 1.08, '+8% drops'),
  A('axioms4', 7, 17, 'A Style of Play', 'Own four Axioms.', (s) => (s.recursion?.axioms.length ?? 0) >= 4, 'xpGain', 1.08, '+8% XP'),
  A('fragments1k', 8, 17, 'A Thousand Pieces of a Rule', 'Earn 1K Axiom Fragments.', (s) => (s.totals['fragment']?.gte(1000)) ?? false, 'kilnRate', 1.05, '+5% converter intake'),
  A('heresyOwned', 9, 17, 'Announced Heresy', 'Own the one Axiom that breaks the pillar.', (s) => (s.recursion?.axioms ?? []).includes('heresy'), 'regen', 1.06, '+6% regen'),
  A('level200', 8, 18, 'The Cap Itself', 'Reach Delver level 200.', (s) => s.delver.level >= 200, 'xpGain', 1.1, '+10% XP'),
  A('recursion4', 9, 18, 'The Spiral Waits', 'Complete a fourth Recursion.', (s) => (s.recursion?.count ?? 0) >= 4, 'dustYield', 1.15, '+15% chip yield'),
];

/** Large bonuses for full lines. Column 0 is the Shell-I-reachable one. */
export const COL_BONUSES: Record<number, { bucket: Bucket; value: number; label: string }> = {
  0: { bucket: 'dustYield', value: 1.1, label: 'Column: The First of Everything (+10% Dust)' },
  1: { bucket: 'xpGain', value: 1.1, label: 'Column II complete (+10% XP)' },
  2: { bucket: 'dustYield', value: 1.15, label: 'Column III complete (+15% Dust)' },
  3: { bucket: 'dropRate', value: 1.15, label: 'Column IV complete (+15% drops)' },
  4: { bucket: 'dustYield', value: 1.2, label: 'Column V complete (+20% chip yield)' },
  5: { bucket: 'dustYield', value: 1.15, label: 'Column VI complete (+15% chip yield)' },
  6: { bucket: 'xpGain', value: 1.15, label: 'Column VII complete (+15% XP)' },
  7: { bucket: 'dropRate', value: 1.15, label: 'Column VIII: The Lamphouse (+15% find rate)' },
  8: { bucket: 'dropRate', value: 1.15, label: 'Column IX complete (+15% drops)' },
  9: { bucket: 'dustYield', value: 1.2, label: 'Column X: The Green Door (+20% chip yield)' },
  10: { bucket: 'xpGain', value: 1.2, label: 'Column XI complete (+20% XP)' },
  11: { bucket: 'dustYield', value: 1.2, label: 'Column XII: Frozen Light (+20% chip yield)' },
  12: { bucket: 'dropRate', value: 1.2, label: 'Column XIII complete (+20% drops)' },
  13: { bucket: 'dustYield', value: 1.2, label: 'Column XIV: The Banked Fire (+20% chip yield)' },
  14: { bucket: 'dustYield', value: 1.2, label: 'Column XV: Restraint (+20% chip yield)' },
  15: { bucket: 'dustYield', value: 1.2, label: 'Column XVI: Absence (+20% chip yield)' },
  16: { bucket: 'regen', value: 1.2, label: 'Column XVII: Reconstruction (+20% regen)' },
  17: { bucket: 'dustYield', value: 1.25, label: 'Column XVIII: The Core (+25% chip yield)' },
  18: { bucket: 'dropRate', value: 1.25, label: 'Column XIX: The Reading, Finished (+25% drops)' },
};
export const ROW_BONUSES: Record<number, { bucket: Bucket; value: number; label: string }> = {
  0: { bucket: 'dustYield', value: 1.25, label: 'Row: Dust complete (+25% Dust)' },
  1: { bucket: 'brickYield', value: 1.25, label: 'Row: Kiln complete (+25% Brick)' },
  2: { bucket: 'dustYield', value: 1.25, label: 'Row: Depth complete (+25% Dust)' },
};

export function achievementAt(row: number, col: number): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.row === row && a.col === col);
}

export function isUnlocked(state: GameState, id: string): boolean {
  return state.achievements.unlocked[id] === true;
}

/** A line is complete when every DEFINED cell in it exists AND is unlocked —
 * and at least one cell is defined for the full span. Empty cells block. */
export function isColComplete(state: GameState, col: number): boolean {
  for (let row = 0; row < ACH_ROWS; row++) {
    const a = achievementAt(row, col);
    if (!a || !isUnlocked(state, a.id)) return false;
  }
  return true;
}

export function isRowComplete(state: GameState, row: number): boolean {
  for (let col = 0; col < ACH_COLS; col++) {
    const a = achievementAt(row, col);
    if (!a || !isUnlocked(state, a.id)) return false;
  }
  return true;
}

export function registerAchievementModifiers(): void {
  for (const a of ACHIEVEMENTS) {
    const additive = a.bonus.bucket === 'offlineEffAdd';
    registerModifier({
      id: `ach.${a.id}`,
      label: `${a.name} (Achievement)`,
      bucket: a.bonus.bucket,
      value: (s) => (isUnlocked(s, a.id) ? a.bonus.value : additive ? 0 : 1),
    });
  }
  for (const [col, bonus] of Object.entries(COL_BONUSES)) {
    registerModifier({
      id: `ach.col.${col}`,
      label: bonus.label,
      bucket: bonus.bucket,
      value: (s) => (isColComplete(s, Number(col)) ? bonus.value : 1),
    });
  }
  for (const [row, bonus] of Object.entries(ROW_BONUSES)) {
    registerModifier({
      id: `ach.row.${row}`,
      label: bonus.label,
      bucket: bonus.bucket,
      value: (s) => (isRowComplete(s, Number(row)) ? bonus.value : 1),
    });
  }
}

/** Called ~1/sec by the engine. Unlocks anything newly earned. */
export function checkAchievements(state: GameState, ctx: EngineCtx): void {
  for (const a of ACHIEVEMENTS) {
    if (state.achievements.unlocked[a.id]) continue;
    if (!a.check(state)) continue;
    state.achievements.unlocked[a.id] = true;
    ctx.dirty();
    ctx.emit({ type: 'achievement', id: a.id });
    if (isRowComplete(state, a.row)) ctx.emit({ type: 'rowComplete', row: a.row });
    if (isColComplete(state, a.col)) ctx.emit({ type: 'colComplete', col: a.col });
  }
}
