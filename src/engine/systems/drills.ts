/**
 * The Drill Bay — up to 24 drills, each individually upgradeable, each with a
 * selectable targeting behavior. Drills can only harvest what the field
 * produces (pillar 2): they take charge from cells, so regen is the ceiling.
 *
 * Invented numbers (appended to DESIGN.md):
 *   - Strike interval: 2.0s / (1 + 0.04 * level) / drillSpeed-bucket
 *   - Strike power:    (2 + 0.75 * level) charge * drillPower-bucket
 */
import { D } from '../decimal';
import type { ModifierCache } from '../modifiers';
import type { DrillBehavior, DrillState, EngineCtx, GameState } from '../types';
import { harvestCell, neighbors } from './face';
import { grantXP } from './xp';
import { DRILL_DROP_FACTOR, rollForDrop } from './drops';
import { ENCOUNTER_DRILL_FACTOR, rollForEncounter } from '../combat/combat';
import { addCurrency } from '../resources';
import { currentShell } from '../shells';
import { runChipMult } from '../signatures';
import { drillConfig } from '../content/drillParts';
import { affinityMult, logImplementUse } from './affinity';

export const MAX_DRILLS = 24;
export const DRILL_BASE_INTERVAL = 2.0;

// WEAR (v21). Strikes grind the head. A fresh drill takes ~8h of continuous ONLINE
// work to reach failure, and it is visibly straining long before — so a break is
// never a surprise (the hireling-permadeath standard). It accrues only online (the
// closed-form offline path never runs tickDrills), so an away/idle player never
// wears a drill (pillar 1). A "broken" drill does not stop dead; it limps at a
// floor, so breakage is a repairable penalty, not a hole in idle income.
export const WEAR_PER_STRIKE = 3.4e-5;
export const BROKEN_FLOOR = 0.15;
export const WEAR_STRAINED = 0.7;
export const WEAR_FAILING = 0.9;

export function drillBroken(drill: DrillState): boolean {
  return (drill.wear ?? 0) >= 1;
}

/** A drill's condition, for the UI: ok / strained / failing / broken. */
export function drillCondition(drill: DrillState): 'ok' | 'strained' | 'failing' | 'broken' {
  const w = drill.wear ?? 0;
  if (w >= 1) return 'broken';
  if (w >= WEAR_FAILING) return 'failing';
  if (w >= WEAR_STRAINED) return 'strained';
  return 'ok';
}

/** Conv-currency cost to repair a drill back to pristine — scales with its level. */
export function drillRepairCost(drill: DrillState): number {
  return Math.ceil(4 * Math.pow(1.18, drill.level) * (0.5 + (drill.wear ?? 0)));
}

export function drillInterval(state: GameState, mods: ModifierCache, drill: DrillState): number {
  const cfg = drillConfig(drill);
  return DRILL_BASE_INTERVAL / (1 + 0.04 * drill.level) / mods.get(state, 'drillSpeed').toNumber() / cfg.speedMult;
}

export function drillPower(state: GameState, mods: ModifierCache, drill: DrillState): number {
  const cfg = drillConfig(drill);
  // AFFINITY: a drill that has worked this shell a lot hits it a little harder —
  // and, being drillPower, only reaches the regen ceiling sooner, never past it.
  const aff = affinityMult(drill, currentShell(state).id);
  const floor = drillBroken(drill) ? BROKEN_FLOOR : 1;
  return (2 + 0.75 * drill.level) * mods.get(state, 'drillPower').toNumber() * cfg.powerMult * aff * floor;
}

/** Default names so a drill arrives as an individual, not "drill 3". The player
 *  can rename any of them. Cycles, then falls back to a number past the pool. */
const DRILL_NAMES = ['Bess', 'Old Tom', 'The Mole', 'Gnash', 'Patience', 'Grinder', 'Sunday', 'Whistler', 'The Badger', 'Nib', 'Molly', 'Crib', 'Digby', 'The Ferret', 'Auntie', 'Rasp', 'Cinders', 'The Terrier', 'Nub', 'Gravel', 'The Toad', 'Pip', 'Quarry', 'Muncher'];
export function defaultDrillName(index: number): string {
  return DRILL_NAMES[index] ?? `Drill ${index + 1}`;
}

export function newDrill(name?: string): DrillState {
  return { level: 0, behavior: 'fullest', timer: 0, lastCell: 0, use: {}, wear: 0, name };
}

function pickTarget(state: GameState, drill: DrillState): number {
  const cells = state.face.cells;
  const n = cells.length;
  // A fitted HEAD supersedes the legacy behavior enum (drillConfig falls back to
  // `drill.behavior` when no head is fitted).
  switch (drillConfig(drill).behavior) {
    case 'fullest': {
      let best = 0;
      let bestCharge = -1;
      for (let i = 0; i < n; i++) {
        const c = cells[i]!;
        if (c > bestCharge) {
          bestCharge = c;
          best = i;
        }
      }
      return best;
    }
    case 'sweep':
      return (drill.lastCell + 1) % n;
    case 'random':
      return Math.floor(Math.random() * n);
    case 'chain': {
      // Prefer the richest orthogonal neighbor of the last strike; if the
      // whole neighborhood is dry, restart the chain on the fullest cell.
      const nbs = neighbors(state, drill.lastCell);
      let best = -1;
      let bestCharge = 0.5; // ignore nearly-dry neighbors
      for (const i of nbs) {
        const c = cells[i]!;
        if (c > bestCharge) {
          bestCharge = c;
          best = i;
        }
      }
      if (best >= 0) return best;
      let fallback = 0;
      let fc = -1;
      for (let i = 0; i < n; i++) {
        if (cells[i]! > fc) {
          fc = cells[i]!;
          fallback = i;
        }
      }
      return fallback;
    }
  }
}

import { lawNum } from '../laws';

export function tickDrills(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number): void {
  if (!state.drills.bayBuilt || state.drills.units.length === 0) return;
  // A drill never works a cultivated (vined) cell — the Growth automation law
  // leaves those for their own harvest.
  const skip = (i: number): boolean => (state.growth.stage[i] ?? 0) > 0;
  const shellId = currentShell(state).id;
  for (let d = 0; d < state.drills.units.length; d++) {
    const drill = state.drills.units[d]!;
    drill.timer += dt;
    const interval = drillInterval(state, mods, drill);
    const wasBroken = drillBroken(drill);
    const wearRate = WEAR_PER_STRIKE * drillConfig(drill).wearMult * (1 + 0.03 * drill.level);
    // A drill strikes at most a few times per tick even after catch-up; the
    // cells it would have hit are regen-limited anyway.
    let strikes = 0;
    while (drill.timer >= interval && strikes < 4) {
      drill.timer -= interval;
      strikes++;
      let target = pickTarget(state, drill);
      // A drill never works a vined cell (Growth automation law). Re-aim at the
      // fullest workable cell; if every cell is vined, the drill idles this strike.
      if (skip(target)) {
        let best = -1;
        let bestCharge = 0;
        for (let i = 0; i < state.face.cells.length; i++) {
          if (skip(i)) continue;
          if (state.face.cells[i]! > bestCharge) {
            bestCharge = state.face.cells[i]!;
            best = i;
          }
        }
        if (best < 0) continue;
        target = best;
      }
      const power = drillPower(state, mods, drill);
      // TWO HANDS (law): a stroke works this many cells. The second cell is
      // the next-fullest bare one — same power each, still regen-bound.
      const handCells: number[] = [target];
      const hands = lawNum(state, 'drillStrokes');
      if (hands > 1) {
        let second = -1;
        let secondCharge = 0;
        for (let i = 0; i < state.face.cells.length; i++) {
          if (i === target || skip(i)) continue;
          if (state.face.cells[i]! > secondCharge) {
            secondCharge = state.face.cells[i]!;
            second = i;
          }
        }
        if (second >= 0) handCells.push(second);
      }
      for (const hit of handCells) {
        const cellCharge = state.face.cells[hit] ?? 0;
        const take = Math.min(power, cellCharge);
        drill.lastCell = hit;
        if (take <= 0) continue;
        const sigMult = runChipMult(state, mods, ctx, hit, false);
        const { dust } = harvestCell(state, mods, hit, take / cellCharge, D(sigMult));
        state.stats.drillStrikes += 1;
        // Some shells' drills scrape a byproduct (Ferrite: Scale).
        const by = currentShell(state).drillByproduct;
        if (by) addCurrency(state, by.currencyId, D(take * by.perCharge));
        grantXP(state, mods, ctx, D(0.12 * (1 + 0.08 * state.depth) * (take / 8)));
        rollForDrop(state, mods, ctx, take, DRILL_DROP_FACTOR);
        rollForEncounter(state, ctx, take, ENCOUNTER_DRILL_FACTOR);
        ctx.emit({ type: 'drillStrike', drill: d, cell: hit, dust });
      }
      // A stroke grinds the head a little, and teaches it this shell a little.
      // Wear accrues only here (online); the closed-form offline path never runs.
      drill.wear = Math.min(1, (drill.wear ?? 0) + wearRate);
      logImplementUse(drill, shellId, 1);
    }
    if (!wasBroken && drillBroken(drill)) {
      ctx.emit({ type: 'drillBroke', drill: d, name: drill.name });
    }
    if (drill.timer > interval) drill.timer = interval; // don't bank strikes
  }
}

/** Steady-state charge/sec the bay can consume — used by the offline calc. */
export function drillThroughput(state: GameState, mods: ModifierCache): number {
  let total = 0;
  for (const drill of state.drills.units) {
    total += drillPower(state, mods, drill) / drillInterval(state, mods, drill);
  }
  return total * lawNum(state, 'drillStrokes');
}

export const DRILL_BEHAVIORS: DrillBehavior[] = ['fullest', 'sweep', 'random', 'chain'];
