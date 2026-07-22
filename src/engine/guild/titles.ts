/**
 * TITLES — Old Iron Sal's book of names. ~60, every one earned and every one
 * a real modifier. ONE equipped at a time: choosing a title is choosing a
 * build, not decorating a nameplate.
 */
import { registerModifier, type Bucket } from '../modifiers';
import { getTotal } from '../resources';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { FRAGMENTS } from './sable';
import { repTier } from './npcs';

export interface TitleDef {
  id: string;
  name: string;
  flavor: string;
  check: (s: GameState) => boolean;
  bucket: Bucket;
  value: number;
  effect: string;
}

const T = (
  id: string,
  name: string,
  flavor: string,
  check: (s: GameState) => boolean,
  bucket: Bucket,
  value: number,
  effect: string,
): TitleDef => ({ id, name, flavor, check, bucket, value, effect });

const gems = (s: GameState) => Object.values(s.materials.gems).reduce((a, b) => a + b, 0);
const sworn = (s: GameState) => Object.values(s.guild.npcs).filter((n) => repTier(n.rep) >= 3).length;
const hired = (s: GameState) => Object.keys(s.guild.hirelings).length;
const bestPurity = (s: GameState) => s.forge.tools.reduce((a, t) => Math.max(a, t.purity), 0);
const drillLv = (s: GameState) => s.drills.units.reduce((a, d) => a + d.level, 0);

export const TITLES: TitleDef[] = [
  // --- The dig itself ------------------------------------------------------
  T('ashwalker', 'Ashwalker', 'You let it fall twenty-five times and walked out of every one.', (s) => s.collapse.count >= 25, 'dustYield', 1.06, '+6% chip yield'),
  T('unbroken', 'The Unbroken', 'A Warden, first try, no rehearsal.', (s) => s.combat.wardens.some((w) => (s.combat.wardenAttempts[w] ?? 99) <= 1), 'strikePower', 1.08, '+8% strike power'),
  T('sablesHeir', "Sable's Heir", 'Every page she left in two worlds, found and read into the light.', (s) => FRAGMENTS.filter((f) => f.shellId === 'loam' || f.shellId === 'ferrite').every((f) => s.guild.sable.translated.includes(f.id)), 'xpGain', 1.1, '+10% XP'),
  T('firstblood', 'Chipper', 'A thousand swings by hand.', (s) => s.stats.manualChips >= 1000, 'dustYield', 1.03, '+3% chip yield'),
  T('tenthousand', 'Stonehanded', 'Ten thousand swings. The rock knows your knuckles.', (s) => s.stats.manualChips >= 10000, 'dustYield', 1.05, '+5% chip yield'),
  T('deeploam', 'Floorwalker', 'You stood on the floor of Loam.', (s) => (s.depthRecords['loam'] ?? 0) >= 150, 'descendCost', 0.97, '−3% descend cost'),
  T('deepferrite', 'Ironfloor', 'You stood where every compass points.', (s) => (s.depthRecords['ferrite'] ?? 0) >= 250, 'descendCost', 0.95, '−5% descend cost'),
  T('centurion', 'Hundred-Down', 'Depth 100, on your own feet.', (s) => s.maxDepthRecord >= 100, 'dustYield', 1.04, '+4% chip yield'),
  T('serialfall', 'Fond of Falling', 'Fifty collapses. It stopped being an accident around nine.', (s) => s.collapse.count >= 50, 'dustYield', 1.07, '+7% chip yield'),
  T('coldhearted', 'Coldhearted', 'A thousand lifetime Cores.', (s) => getTotal(s, 'core').gte(1000), 'dustYield', 1.06, '+6% chip yield'),
  T('echoed', 'Twice-Fallen', 'You breached, and what you built came down with you as Echoes.', (s) => s.shell.breachCount >= 1, 'xpGain', 1.05, '+5% XP'),
  T('descender', 'Stairwright', 'Two hundred descents rung by rung.', (s) => s.stats.descents >= 200, 'descendCost', 0.96, '−4% descend cost'),
  T('billionaire', 'Dustlord', 'A billion motes through your hands.', (s) => getTotal(s, 'dust').gte(1e9), 'dustYield', 1.06, '+6% chip yield'),
  T('longwatch', 'Keeper of the Long Watch', 'A full day away, and the dig went on.', (s) => s.stats.longestOfflineSec >= 24 * 3600, 'offlineEffAdd', 0.03, '+3% offline efficiency'),
  T('patient', 'The Patient', 'Forty-eight hours collected in one return.', (s) => s.stats.longestOfflineSec >= 48 * 3600, 'offlineEffAdd', 0.04, '+4% offline efficiency'),

  // --- The fight -----------------------------------------------------------
  T('firstfang', 'It Bit First', 'One of the Deepwrought, put down.', (s) => s.combat.stats.wins >= 1, 'strikePower', 1.03, '+3% strike power'),
  T('culler', 'Culler', 'Fifty of the dark\'s children.', (s) => s.combat.stats.wins >= 50, 'strikePower', 1.06, '+6% strike power'),
  T('centcull', 'Warden of Nothing', 'A hundred kills. The tunnels go quiet when you pass.', (s) => s.combat.stats.wins >= 100, 'strikePower', 1.08, '+8% strike power'),
  T('perfectist', 'Metronome', 'Twenty-five perfect strikes on the sweep.', (s) => s.combat.stats.perfects >= 25, 'strikePower', 1.05, '+5% strike power'),
  T('drummer', 'The Drummer', 'A hundred perfects. You ARE the beat.', (s) => s.combat.stats.perfects >= 100, 'strikePower', 1.07, '+7% strike power'),
  T('rootfeller', 'Rootfeller', 'The Tapmother yielded the floor.', (s) => s.combat.wardens.includes('loam'), 'strikePower', 1.05, '+5% strike power'),
  T('starkiller', 'Needle\'s End', 'The Loadstar yielded the deep.', (s) => s.combat.wardens.includes('ferrite'), 'strikePower', 1.07, '+7% strike power'),
  T('lorist', 'Deepwright Lorist', 'Twenty species recorded in the book of teeth.', (s) => s.combat.seen.length >= 20, 'dropRate', 1.05, '+5% drops'),
  T('completist', 'The Whole Bestiary', 'All thirty shapes, and both wardens.', (s) => s.combat.seen.length >= 32, 'dropRate', 1.08, '+8% drops'),
  T('untouched', 'Slippery', 'Twenty encounters declined. Discretion is a craft.', (s) => s.combat.stats.flees >= 20, 'descendCost', 0.97, '−3% descend cost'),

  // --- The craft -----------------------------------------------------------
  T('smithsworn', 'Forge-Sworn', 'Ten tools bear your mark.', (s) => s.stats.toolsForged >= 10, 'dustYield', 1.04, '+4% chip yield'),
  T('purist', 'Purist', 'A tool at ninety purity. Marrow nodded. Once.', (s) => bestPurity(s) >= 90, 'dustYield', 1.06, '+6% chip yield'),
  T('gemmed', 'Facet-Counter', 'Ten gems held at once.', (s) => gems(s) >= 10, 'dropRate', 1.04, '+4% drops'),
  T('geodist', 'Shellcracker', 'Twenty-five geodes opened at the bench.', (s) => s.materials.geodesCracked >= 25, 'dropRate', 1.05, '+5% drops'),
  T('collector', 'Magpie', 'A thousand drops hauled home.', (s) => s.materials.totalDrops >= 1000, 'dropRate', 1.04, '+4% drops'),
  T('hoarder', 'The Deep Larder', 'Ten thousand drops. Vess weeps with pride.', (s) => s.materials.totalDrops >= 10000, 'dropRate', 1.06, '+6% drops'),
  T('assayer', 'Vein-Reader', 'Twenty-five surveys filed.', (s) => s.assay.surveysDone >= 25, 'assaySpeed', 1.15, '+15% assay speed'),
  T('alloyist', 'Slag-Prophet', 'Ten alloys poured true.', (s) => s.crucible.discovered.length >= 10, 'brickYield', 1.05, '+5% converter output'),
  T('sablesteel', 'Keeper of the Ratio', 'Sable\'s Steel, poured from her own numbers.', (s) => s.crucible.discovered.includes('sablesteel'), 'brickYield', 1.06, '+6% converter output'),
  T('founder', 'Wellfitted', 'Six Foundry modules bolted and humming.', (s) => s.foundry.installed.length >= 6, 'kilnRate', 1.05, '+5% converter intake'),
  T('kilnkeeper', 'Firstfire\'s Friend', 'Ten thousand firings.', (s) => s.stats.bricksFired.gte(1e4), 'kilnRate', 1.05, '+5% converter intake'),
  T('foreman', 'Bay Foreman', 'A hundred drill levels under your whistle.', (s) => drillLv(s) >= 100, 'drillSpeed', 1.05, '+5% drill speed'),
  T('fullbay', 'Twenty-Four Hands', 'Every drill slot filled.', (s) => s.drills.units.length >= 24, 'drillSpeed', 1.06, '+6% drill speed'),

  // --- The Lattice and the rails ------------------------------------------
  T('firststone', 'Stonesetter', 'A hundred motifs placed.', (s) => s.lattice.placeSeq >= 100, 'motifGain', 1.05, '+5% Motifs'),
  T('chordist', 'Chorister', 'Fifteen chords rung.', (s) => s.lattice.discovered.length >= 15, 'motifGain', 1.06, '+6% Motifs'),
  T('composer', 'Composer', 'Five progressions read in order.', (s) => s.lattice.discoveredProgressions.length >= 5, 'motifGain', 1.07, '+7% Motifs'),
  T('widecircle', 'Wide-Circle Thinker', 'The board at four rings.', (s) => s.lattice.rings >= 4, 'motifGain', 1.05, '+5% Motifs'),
  T('chained', 'Rail-Rider', 'A polarity chain of eight.', (s) => s.polarity.bestChain >= 8, 'chainPower', 1.05, '+5% chain power'),
  T('fullcircuit', 'The Full Circuit', 'Chain twelve. The rails sang back.', (s) => s.polarity.bestChain >= 12, 'chainPower', 1.07, '+7% chain power'),
  T('magnetized', 'Polewright', 'Six magnets rigged on the Array.', (s) => s.polarity.magnetCount >= 6, 'chainPower', 1.05, '+5% chain power'),

  // --- The Guild -----------------------------------------------------------
  T('errander', 'Reliable', 'Ten contracts off the board.', (s) => s.guild.contracts.completed >= 10, 'scripGain', 1.08, '+8% Scrip'),
  T('journeyman', 'The Board\'s Favorite', 'Fifty contracts. Your name goes up first.', (s) => s.guild.contracts.completed >= 50, 'scripGain', 1.12, '+12% Scrip'),
  T('renowned', 'Lamphouse Name', 'A hundred Renown at the hearth.', (s) => getTotal(s, 'renown').gte(100), 'scripGain', 1.08, '+8% Scrip'),
  T('legend', 'The Stair\'s Own', 'Three hundred Renown. Dovekin lights a lamp for you unpaid.', (s) => getTotal(s, 'renown').gte(300), 'xpGain', 1.07, '+7% XP'),
  T('swornfriend', 'Thrice-Sworn', 'Three of the thirty would take a wall down for you.', (s) => sworn(s) >= 3, 'scripGain', 1.1, '+10% Scrip'),
  T('crewed', 'Captain of the Loft', 'Five hirelings drawing your colors.', (s) => hired(s) >= 5, 'offlineEffAdd', 0.02, '+2% offline efficiency'),
  T('fairhand', 'Fair-Handed', 'Twenty straight deals in Vess\'s good ledger.', (s) => s.guild.vess.trust >= 20, 'scripGain', 1.08, '+8% Scrip'),
  T('roadwise', 'Roadwise', 'Twenty-five caravan loads over the Breach stair.', (s) => s.guild.caravan.trades >= 25, 'scripGain', 1.1, '+10% Scrip'),
  T('pagefinder', 'Pagefinder', 'Ten of Sable\'s pages lifted from the dark.', (s) => s.guild.sable.found.length >= 10, 'dropRate', 1.05, '+5% drops'),
  T('archivist', 'Quill\'s Better', 'Five ciphered pages paid into the light.', (s) => FRAGMENTS.filter((f) => f.legibility === 'ciphered' && s.guild.sable.translated.includes(f.id)).length >= 5, 'xpGain', 1.06, '+6% XP'),
  T('readinorder', 'Out-of-Order Reader', 'Twenty pages read, in whatever order the rock gave them.', (s) => s.guild.sable.read.length >= 20, 'xpGain', 1.05, '+5% XP'),

  // --- The person ----------------------------------------------------------
  T('leveled20', 'Delver', 'Level twenty. The shaft knows you.', (s) => s.delver.level >= 20, 'xpGain', 1.04, '+4% XP'),
  T('leveled50', 'Half the Ladder', 'Level fifty.', (s) => s.delver.level >= 50, 'xpGain', 1.05, '+5% XP'),
  T('leveled80', 'Older Than the Maps', 'Level eighty.', (s) => s.delver.level >= 80, 'xpGain', 1.06, '+6% XP'),
  T('longhaul', 'The Long Haul', 'Forty hours at the face, all told.', (s) => s.stats.playTimeSec >= 40 * 3600, 'regen', 1.03, '+3% regen'),
  T('brimful', 'Brimful', 'A regenerate heart: every cell full at once, and you waited.', (s) => s.achievements.unlocked['fullField'] === true, 'regen', 1.04, '+4% regen'),
];

export const TITLE_BY_ID = new Map(TITLES.map((t) => [t.id, t]));

export function titleDef(id: string): TitleDef {
  const def = TITLE_BY_ID.get(id);
  if (!def) throw new Error(`Unknown title: ${id}`);
  return def;
}

/** Swept ~1/sec from the guild tick; earned titles are permanent. */
export function sweepTitles(state: GameState, ctx: EngineCtx): void {
  for (const t of TITLES) {
    if (state.guild.titles.earned.includes(t.id)) continue;
    if (!t.check(state)) continue;
    state.guild.titles.earned.push(t.id);
    ctx.dirty();
    ctx.emit({ type: 'titleEarned', id: t.id });
  }
}

export function equipTitle(state: GameState, ctx: EngineCtx, titleId: string | null): ActionResult {
  if (titleId !== null) {
    if (!TITLE_BY_ID.has(titleId)) return { ok: false, reason: 'No such name in the book' };
    if (!state.guild.titles.earned.includes(titleId)) return { ok: false, reason: 'Not yours yet' };
  }
  state.guild.titles.equipped = titleId;
  ctx.dirty();
  return { ok: true };
}

/** One modifier per bucket any title uses, reading the equipped title. */
export function registerTitleModifiers(): void {
  const buckets = [...new Set(TITLES.map((t) => t.bucket))];
  for (const bucket of buckets) {
    const additive = bucket === 'offlineEffAdd';
    registerModifier({
      id: `title.${bucket}`,
      label: 'Title (equipped)',
      bucket,
      value: (s) => {
        const id = s.guild.titles.equipped;
        if (!id) return additive ? 0 : 1;
        const t = TITLE_BY_ID.get(id);
        if (!t || t.bucket !== bucket) return additive ? 0 : 1;
        return t.value;
      },
    });
  }
}
