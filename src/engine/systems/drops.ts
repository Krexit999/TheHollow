/**
 * Material drops + the Assay Table.
 *
 * Drops roll per chip with probability proportional to charge harvested —
 * chips are regen-bound, so drop income rides ON TOP of the ceiling instead
 * of adding a second rate (pillar 2). Drills roll the same formula at 40%
 * weight, so idle players still accumulate.
 *
 * The Assay Table (Insight-gated): a timed survey of the current depth that
 * reveals its vein profile and grants boosted-drop chips. Costs time and
 * Insight — never wear.
 */
import { D } from '../decimal';
import { maybeDropRelic, relicChanceForDepth } from './relics';
import { lawFlag , sealed } from '../laws';
import { attractDepthBonus } from './drillAlloys';
import type { ModifierCache } from '../modifiers';
import type { ActionResult, EngineCtx, GameState } from '../types';
import {
  crackGeodeRolls,
  DRILL_DROP_FACTOR,
  DROP_BASE_CHANCE,
  DROP_DEPTH_FACTOR,
  materialDef,
  RARITIES,
  RARITY_GATES,
  rollDrop,
  type RolledDrop,
} from '../materials';
import { addMaterial } from './forge';
import { logToolDeed } from './heirloom';
import { skillRank } from '../content/shell1/skillTree';
import { grantXP } from './xp';
import { currentShell } from '../shells';
import { rollForFragment } from '../guild/sable';

export const ASSAY_BASE_SECONDS = 20;
export const ASSAY_BOOST_CHIPS = 80;

// ---------------------------------------------------------------------------
// Drop rolling
// ---------------------------------------------------------------------------

export function dropChance(state: GameState, mods: ModifierCache, charge: number): number {
  const boost = state.assay.boostChips > 0 ? 2 : 1;
  return (
    DROP_BASE_CHANCE *
    (charge / 8) *
    (1 + DROP_DEPTH_FACTOR * state.depth) *
    mods.get(state, 'dropRate').toNumber() *
    boost
  );
}

export function applyDrop(state: GameState, ctx: EngineCtx, drop: RolledDrop): void {
  if (drop.kind === 'geode') {
    state.materials.geodes += 1;
    ctx.emit({ type: 'geodeFound' });
    return;
  }
  if (drop.kind === 'gem' && drop.gemId) {
    state.materials.gems[drop.gemId] = (state.materials.gems[drop.gemId] ?? 0) + 1;
    ctx.emit({ type: 'gemFound', gemId: drop.gemId });
    return;
  }
  if (drop.materialId !== undefined && drop.purity !== undefined) {
    // THE HONEST STONE (challenge): every material comes up at zero purity.
    // Enforced HERE rather than in rollDrop, which is a pure function with no
    // state — this is the point where the stone actually enters your hands.
    const purity = sealed(state, 'sealPurity') ? 0 : drop.purity;
    // Is this the first one of these you have ever held? Read it BEFORE
    // noteMaterialSeen marks it known, or the answer is always "no".
    const first = !state.assay.knownMaterials.includes(drop.materialId);
    addMaterial(state, drop.materialId, purity);
    noteMaterialSeen(state, drop.materialId);
    ctx.emit({
      type: 'materialFound',
      materialId: drop.materialId,
      purity,
      rarity: materialDef(drop.materialId).rarity,
      first,
    });
  }
}

/**
 * Called from every harvest (manual chips and drill strikes). `weight` is 1
 * for manual, DRILL_DROP_FACTOR for drills.
 */
export function rollForDrop(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  charge: number,
  weight: number,
  /** The drill that struck, when a drill did — a relic remembers who found it. */
  by?: string,
  /** Which cell was struck. THE CALL (drill alloy) reads it: a cell that has
   *  gathered enough rolls its drop as if the seam there were deeper. */
  cell?: number,
): void {
  // Sable's pages ride the same harvest rhythm as everything else —
  // surfaced while mining, never a modal (Phase 6).
  rollForFragment(state, ctx, weight);
  // Relics ride the same harvest rhythm as ore and Sable's pages — the one
  // call site that makes the Relics room and the Museum reachable at all.
  maybeDropRelic(state, ctx, 'depth', relicChanceForDepth(state) * weight, by);
  // THE THIN SEAM (challenge): nothing drops at all for the run.
  if (sealed(state, 'sealDrops')) return;
  const chance = dropChance(state, mods, charge) * weight;
  // THE PATIENT VEIN (law): a survey's mark never expires — chips unspent.
  if (state.assay.boostChips > 0 && !lawFlag(state, 'assayPersist')) state.assay.boostChips -= 1;
  if (Math.random() >= chance) return;
  // THE CALL rolls the table DEEPER for a cell that has gathered — richer
  // rarities, same drop chance. Drops sit outside the income path, so this
  // shifts what you find without touching the regen ceiling (pillar 2).
  applyDrop(state, ctx, rollDrop(currentShell(state).id, state.depth + attractDepthBonus(state, cell)));
}

export { DRILL_DROP_FACTOR };

// ---------------------------------------------------------------------------
// Geodes — the deliberate little moment
// ---------------------------------------------------------------------------

export function crackGeode(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
): ActionResult {
  if (state.materials.geodes < 1) return { ok: false, reason: 'No geodes held' };
  state.materials.geodes -= 1;
  state.materials.geodesCracked += 1;
  logToolDeed(state, 'geodes', 1); // the tool in hand earns a mark at a hundred (heirloom)
  const rolls = crackGeodeRolls(currentShell(state).id, state.depth);
  for (const drop of rolls) applyDrop(state, ctx, drop);
  grantXP(state, mods, ctx, D(10));
  ctx.emit({ type: 'geodeCracked', drops: rolls });
  return { ok: true, data: rolls };
}

// ---------------------------------------------------------------------------
// The Assay Table
// ---------------------------------------------------------------------------

export function assayUnlocked(state: GameState): boolean {
  return skillRank(state, 'assayersHunch') >= 1;
}

export function assayDuration(state: GameState, mods: ModifierCache): number {
  const skillCut = 1 - 0.25 * Math.max(0, skillRank(state, 'assayersHunch') - 1);
  return (ASSAY_BASE_SECONDS * skillCut) / mods.get(state, 'assaySpeed').toNumber();
}

export interface AssayReportEntry {
  rarity: string;
  /** Share of drops at this depth, 0-1. */
  share: number;
  /** Representative materials of that rarity in this shell. */
  materialIds: string[];
}

export function buildAssayReport(state: GameState): AssayReportEntry[] {
  const depth = state.depth;
  let total = 0;
  for (const r of RARITIES) if (depth >= RARITY_GATES[r].minDepth) total += RARITY_GATES[r].weight;
  const out: AssayReportEntry[] = [];
  for (const r of RARITIES) {
    const gate = RARITY_GATES[r];
    if (depth < gate.minDepth) continue;
    out.push({
      rarity: r,
      share: gate.weight / total,
      materialIds: state.assay.knownMaterials.filter((id) => {
        try {
          return materialDef(id).rarity === r;
        } catch {
          return false;
        }
      }),
    });
  }
  return out;
}

export function startAssay(state: GameState, mods: ModifierCache): ActionResult {
  if (!assayUnlocked(state)) return { ok: false, reason: "Needs the Assayer's Hunch" };
  if (state.assay.active) return { ok: false, reason: 'A survey is already running' };
  state.assay.active = {
    endsAtPlaySec: state.stats.playTimeSec + assayDuration(state, mods),
    depth: state.depth,
  };
  return { ok: true, data: { seconds: assayDuration(state, mods) } };
}

/** Ticked by the engine: completes surveys, applies the reward. */
export function tickAssay(state: GameState, mods: ModifierCache, ctx: EngineCtx): void {
  const active = state.assay.active;
  if (!active || state.stats.playTimeSec < active.endsAtPlaySec) return;
  state.assay.active = null;
  state.assay.surveysDone += 1;
  state.assay.boostChips = ASSAY_BOOST_CHIPS * (skillRank(state, 'assayersHunch') >= 3 ? 2 : 1);
  state.assay.reportDepth = active.depth;
  ctx.emit({ type: 'assayComplete', depth: active.depth });
  grantXP(state, mods, ctx, D(8));
}

/** Record a material as seen (drives the assay report's names). */
export function noteMaterialSeen(state: GameState, materialId: string): void {
  if (!state.assay.knownMaterials.includes(materialId)) {
    state.assay.knownMaterials.push(materialId);
  }
}
