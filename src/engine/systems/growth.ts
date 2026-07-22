/**
 * GROWTH — Verdance's signature. Cells you DON'T mine sprout into vines that
 * bank charge passively and spread to neighbors. The first shell where not
 * acting is a strategy.
 *
 * PILLAR 2, stated plainly (and in DESIGN Appendix A.15): vines never add
 * generation. A vined cell sits at cap; the overflow regen that Seepage
 * would leak is instead CAPTURED into fruit at 0.65× (× strength), and the
 * harvest bonus tops out at ×1.5 — so the best possible recovery is
 * 0.975 of overflow the regen ceiling already produced. Vines change WHERE
 * charge accumulates and HOW it is collected. The ceiling never moves.
 *
 * The two strategies: CLEARING keeps cells under cap (100% of regen, paid
 * in attention); CULTIVATING parks quadrants at cap and recovers most of
 * the overflow hands-free, with ripe feral vines auto-dropping a share (the
 * farmer's idle floor). The sim verifies the routes land within ~20%.
 *
 * Carried down (0.4×): sprouting slows and capture thins, but neglected
 * cells still creep. Interplay with carried Polarity is EMERGENT: a vined
 * cell is never harvested, so its sign never re-rolls — vines freeze the
 * routing map where they stand while the bare cells keep churning.
 *
 * Automation law (same as chains): DRILLS SKIP VINED CELLS. Machines must
 * not trash a cultivation.
 */
import { D } from '../decimal';
import type { ModifierCache } from '../modifiers';
import { addCurrency } from '../resources';
import type { EngineCtx, GameState } from '../types';
import { registerSignature } from '../signatures';
import { cellCap, cellRegen, chipYield } from './face';
import { growthAgingMult } from './weather';
import { brewGrowthMult } from '../content/shell3/brews';
import { rollForSeed } from '../content/shell3/greenhouse';
import { masteryLevel } from './mastery';

export const GROW_DELAY_SEC = 25; // at cap, before sprouting (÷ strength)
/** Feral inside ~3.5 min: a crop must fit between Collapses (the shell's own
 * rhythm runs ~5 min late-game) or farming loses to the reset button. */
export const STAGE_UP_SEC = [0, 30, 60, 90]; // sprout→creeper→bloom→feral
export const CAPTURE = 0.8; // share of overflow regen banked (× strength)
export const FRUIT_CAP_MULT = [0, 3, 7, 16, 32]; // × cellCap, by stage
/** Capture × best bonus = 0.8 × 1.2 = 0.96 — strictly under the ceiling. */
export const HARVEST_BONUS = [1, 1.02, 1.08, 1.14, 1.2];
export const RIPE_DROP_EFF = 0.8; // feral auto-drop pays this share
export const SPREAD_EVERY_SEC = 45;
export const STAGE_NAMES = ['bare', 'sprout', 'creeper', 'bloom', 'feral'];

export function vineStage(state: GameState, cell: number): number {
  return state.growth.stage[cell] ?? 0;
}

export function vinedCellCount(state: GameState): number {
  return state.growth.stage.filter((s) => s > 0).length;
}

export function feralCellCount(state: GameState): number {
  return state.growth.stage.filter((s) => s >= 4).length;
}

function ensureSized(state: GameState): void {
  const n = state.face.cells.length;
  const g = state.growth;
  while (g.stage.length < n) g.stage.push(0);
  while (g.fruit.length < n) g.fruit.push(0);
  while (g.age.length < n) g.age.push(0);
  while (g.fullSince.length < n) g.fullSince.push(0);
  if (g.stage.length > n) {
    g.stage.length = n; g.fruit.length = n; g.age.length = n; g.fullSince.length = n;
  }
}

/** Clear a vine (harvest or reset), returning banked fruit. */
function clearVine(state: GameState, cell: number): { fruit: number; stage: number } {
  const g = state.growth;
  const out = { fruit: g.fruit[cell] ?? 0, stage: g.stage[cell] ?? 0 };
  g.stage[cell] = 0;
  g.fruit[cell] = 0;
  g.age[cell] = 0;
  g.fullSince[cell] = 0;
  return out;
}

function orthNeighbors(state: GameState, cell: number): number[] {
  const { w, h } = state.face;
  const x = cell % w;
  const y = Math.floor(cell / w);
  const out: number[] = [];
  if (x > 0) out.push(cell - 1);
  if (x < w - 1) out.push(cell + 1);
  if (y > 0) out.push(cell - w);
  if (y < h - 1) out.push(cell + w);
  return out;
}

function tickGrowth(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number, strength: number): void {
  ensureSized(state);
  const g = state.growth;
  const cap = cellCap(state, mods);
  const regen = cellRegen(state, mods);
  const cells = state.face.cells;
  const aging = dt * strength * growthAgingMult(state) * brewGrowthMult(state); // bloom seasons and Greenmantle hasten it
  g.spreadTimer += dt;
  const spreadPass = g.spreadTimer >= SPREAD_EVERY_SEC;
  if (spreadPass) g.spreadTimer = 0;

  for (let i = 0; i < cells.length; i++) {
    const stage = g.stage[i]!;
    if (stage === 0) {
      // Bare: count time at cap toward sprouting.
      if (cells[i]! >= cap - 0.01) {
        g.fullSince[i]! += aging;
        if (g.fullSince[i]! >= GROW_DELAY_SEC / Math.max(0.1, strength)) {
          g.stage[i] = 1;
          g.age[i] = 0;
        }
      } else {
        g.fullSince[i] = 0;
      }
      continue;
    }
    // Vined: the cell holds at cap; overflow regen is captured into fruit.
    g.age[i]! += aging;
    const fruitCap = cap * FRUIT_CAP_MULT[stage]!;
    if (g.fruit[i]! < fruitCap) {
      g.fruit[i] = Math.min(fruitCap, g.fruit[i]! + regen * dt * CAPTURE * strength);
    }
    // Feral vines DRIP once heavy: the IDLE farmer's safety valve — an
    // attentive farmer harvests first (and earns the crit-bearing chip),
    // while an absent one still gets paid before any reset takes the plant.
    if (stage >= 4 && spreadPass && g.fruit[i]! > fruitCap * 0.6) {
      const dropped = g.fruit[i]! * 0.6;
      g.fruit[i]! -= dropped;
      const paid = chipYield(state, mods).mul(dropped * RIPE_DROP_EFF);
      addCurrency(state, currentChipId(state), paid);
      g.autoDropped += dropped;
      ctx.emit({ type: 'vineRipe', cell: i, dust: paid });
    }
    // Aging up.
    if (stage < 4 && g.age[i]! >= STAGE_UP_SEC[stage]!) {
      g.stage[i] = stage + 1;
      g.age[i] = 0;
    }
    // Feral spread: colonize one near-full bare neighbor.
    if (spreadPass && stage >= 4) {
      for (const n of orthNeighbors(state, i)) {
        if (g.stage[n] === 0 && cells[n]! >= cap * 0.8) {
          g.stage[n] = 1;
          g.age[n] = 0;
          g.fullSince[n] = 0;
          break;
        }
      }
    }
  }
}

// Local import indirection: face.ts imports growth helpers; avoid the cycle
// by resolving the chip currency through shells lazily.
import { chipCurrencyId } from '../shells';
function currentChipId(state: GameState): string {
  return chipCurrencyId(state);
}

/** Harvesting a vined cell: the banked fruit rides the SAME chip as the
 * cell's charge — returned as a multiplier so crits, Grit, chords and every
 * other manual-chip multiplier apply to the farmer's payout exactly as they
 * apply to the clearer's. Both routes arrive through your build. */
function harvestVine(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  cell: number,
  strength: number,
): number {
  const stage = vineStage(state, cell);
  if (stage === 0) return 1;
  const cellCharge = Math.max(0.01, state.face.cells[cell] ?? 0);
  const { fruit } = clearVine(state, cell);
  if (fruit <= 0) return 1;
  state.growth.fruitHarvested += fruit;
  if (stage >= 3) {
    const chloro = Math.max(1, Math.floor(fruit / cellCap(state, mods)));
    addCurrency(state, 'chlorophyll', D(chloro * Math.max(0.25, strength)));
    rollForSeed(state, ctx, stage); // blooms carry seed — the Greenhouse's gate
  }
  ctx.emit({ type: 'vineHarvest', cell, stage, dust: chipYield(state, mods).mul(fruit * HARVEST_BONUS[stage]!) });
  return 1 + (fruit * HARVEST_BONUS[stage]!) / cellCharge;
}

export function registerGrowth(): void {
  registerSignature({
    id: 'growth',
    shellId: 'verdance',
    name: 'Growth',
    hooks: {
      chipMult(state, mods, ctx, cell, strength, manual) {
        void manual;
        return harvestVine(state, mods, ctx, cell, strength);
      },
      onFaceTick(state, mods, ctx, dt, strength) {
        tickGrowth(state, mods, ctx, dt, strength);
      },
      // In the Hollow: nothing grows, but entropy RIPENS — Growth loves the
      // Silence the way it loved an untended quadrant. Highest when loud.
      voidTick: (s, _m, _dt, strength) =>
        0.4 * strength * (1 + (s.hollow?.silence ?? 0) / 100) * (1 + 0.08 * masteryLevel(s, 'verdance')),
      onFaceReset(state, _strength, cause) {
        // A cultivation LIVES through the core loop: descend and expansion
        // carry the green down with you. Collapse and Breach take everything.
        if (cause === 'descend' || cause === 'expand') return;
        state.growth.stage.fill(0);
        state.growth.fruit.fill(0);
        state.growth.age.fill(0);
        state.growth.fullSince.fill(0);
      },
    },
  });
}

export function defaultGrowthState(): GameState['growth'] {
  return { stage: [], fruit: [], age: [], fullSince: [], spreadTimer: 0, fruitHarvested: 0, autoDropped: 0 };
}
