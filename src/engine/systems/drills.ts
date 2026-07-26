/**
 * THE DRILL BAY — dumb auto-miners. Buy more, they mine. That is the whole bay.
 *
 * A.53 STRIPPED THE CONFIGURATION LAYER, and the reason is worth keeping: the
 * bay is the IDLE layer, and every knob put on it was a chore on the screen a
 * player is least often looking at. Heads and bits (v21), the shared feed, the
 * seam reading, the bit grain and the bay synergies (A.52) are all gone —
 * along with per-drill wear and repair, which was the same mistake one phase
 * earlier: an upkeep button on a machine whose entire job is to work while you
 * are elsewhere.
 *
 * The A.52 puzzle was not badly built; it was built in the wrong place. What
 * replaced it is DRILL ALLOYS (content/drillAlloys.ts): you pour an alloy into
 * a drill at the Forge and THAT DRILL gains an ABILITY that visibly changes how
 * it works the grid. The interesting decision moved to a screen you visit on
 * purpose, and the drills went back to being furniture — a drill with no alloy
 * needs nothing and mines fine, which is the line A.52 crossed and this does
 * not. A.54 moved the fitting from one bay-wide slot onto the individual
 * machine, so a bay can run three abilities at once and the question is which
 * drill gets which.
 *
 * Drills can only harvest what the field produces (pillar 2): they take charge
 * from cells, so regen is the ceiling. Every alloy ability obeys the same rule
 * — see drillAlloys.ts for the per-ability argument.
 *
 * Invented numbers (appended to DESIGN.md):
 *   - Strike interval: 2.0s / (1 + 0.04 * level) / drillSpeed-bucket
 *   - Strike power:    (2 + 0.75 * level) charge * drillPower-bucket
 */
import { D } from '../decimal';
import type { ModifierCache } from '../modifiers';
import type { DrillState, EngineCtx, GameState } from '../types';
import { cellCap, harvestCell, neighbors } from './face';
import { grantXP } from './xp';
import { DRILL_DROP_FACTOR, rollForDrop } from './drops';
import { ENCOUNTER_DRILL_FACTOR, rollForEncounter } from '../combat/combat';
import { addCurrency } from '../resources';
import { currentShell } from '../shells';
import { runChipMult } from '../signatures';
import { affinityMult, logImplementUse } from './affinity';
import { lawNum } from '../laws';
import { relicRule } from './relicPowers';
import {
  drillAbility, arcTargets, residueBite, markResidue, markRichness, ARC_SHARE,
} from './drillAlloys';
import { DRILL_ORE_SPEED, ORE_WORTH_OPENING, oreAt, openOre } from './ores';
import { oreRichness } from '../content/ores';

export const MAX_DRILLS = 24;
export const DRILL_BASE_INTERVAL = 2.0;

export function drillInterval(state: GameState, mods: ModifierCache, drill: DrillState): number {
  return DRILL_BASE_INTERVAL / (1 + 0.04 * drill.level) / mods.get(state, 'drillSpeed').toNumber();
}

export function drillPower(state: GameState, mods: ModifierCache, drill: DrillState): number {
  // AFFINITY: a drill that has worked this shell a lot hits it a little harder —
  // and, being drillPower, only reaches the regen ceiling sooner, never past it.
  const aff = affinityMult(drill, currentShell(state).id);
  return (2 + 0.75 * drill.level) * mods.get(state, 'drillPower').toNumber() * aff;
}

/** Default names so a drill arrives as an individual, not "drill 3". The player
 *  can rename any of them. Cycles, then falls back to a number past the pool. */
const DRILL_NAMES = ['Bess', 'Old Tom', 'The Mole', 'Gnash', 'Patience', 'Grinder', 'Sunday', 'Whistler', 'The Badger', 'Nib', 'Molly', 'Crib', 'Digby', 'The Ferret', 'Auntie', 'Rasp', 'Cinders', 'The Terrier', 'Nub', 'Gravel', 'The Toad', 'Pip', 'Quarry', 'Muncher'];
export function defaultDrillName(index: number): string {
  return DRILL_NAMES[index] ?? `Drill ${index + 1}`;
}

export function newDrill(name?: string): DrillState {
  return { level: 0, timer: 0, lastCell: 0, use: {}, name };
}

/**
 * ONE TARGETING RULE: the cell this bay would get the most out of. The four
 * selectable behaviours went with the rest of the configuration — a dropdown
 * per drill was the definition of fiddling on the idle layer, and "hit the
 * richest rock" is the only one a player would ever have a reason to pick.
 *
 * The score is charge × what this bite would actually take, which is plain
 * charge for a bare bay. THE SET has to be in the score or it is a lie: the
 * first sim run had emberset reading 1.00x against bare, because a rule that
 * always picks the FULLEST cell can never return to the one it just softened,
 * so an ability whose whole text is "the next bite takes far more" never got a
 * next bite. Still regen-bound — this changes which charge is taken first,
 * never how much of it there is.
 */
function pickTarget(state: GameState, skip: (i: number) => boolean): number {
  const cells = state.face.cells;
  const ore = state.face.ore;
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < cells.length; i++) {
    if (skip(i)) continue;
    // A pocket is never an ordinary target: it will not come away in one bite,
    // and a drill that kept picking it would stand there striking nothing.
    if (ore?.[i]) continue;
    const score = cells[i]! * residueBite(state, i);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * SEND THEM AT THE POCKETS. The whole of drill routing, on purpose: one
 * bay-wide toggle, no per-drill areas, no pattern learning. A.52 proved what
 * happens when the idle layer gets a configuration screen, and "which cells
 * should the machines prefer" is exactly the shape of question that turns into
 * one. `huntOres` defaults ON, so an idle player harvests pockets without ever
 * opening the panel (pillar 1); turning it off is the interesting choice,
 * because a pocket is richer by hand.
 *
 * The FULLEST unclaimed pocket that is worth the trip, so two drills never
 * crowd one cell while another sits open and none of them wastes the job on a
 * pocket that has barely started filling.
 */
function openPockets(
  state: GameState, mods: ModifierCache, skip: (i: number) => boolean,
): number[] | null {
  const ore = state.face.ore;
  if (!ore || state.drills.huntOres === false) return null;

  // BUILT ONCE FOR THE WHOLE BAY, not once per drill, and this is a real cost
  // rather than tidiness: the per-drill version scanned the face for every
  // machine on every 100ms step — twelve drills over a two-hour catch-up is
  // thirty-one million iterations, and it doubled the cost of a warp. Almost
  // all of that work found nothing, because on a typical step every pocket
  // worth taking is already claimed by somebody.
  const claimedBy = new Set<number>();
  for (const u of state.drills.units) if (u.oreCell !== undefined) claimedBy.add(u.oreCell);

  let out: number[] | null = null;
  const base = cellCap(state, mods);
  for (let i = 0; i < ore.length; i++) {
    const id = ore[i];
    if (!id || claimedBy.has(i) || skip(i)) continue;
    // A MACHINE WILL NOT SPEND SIX SECONDS ON AN EMPTY POCKET. Without this
    // the sim's ore-heavy arm ran 0.82x of the control: pockets spawned faster
    // than they filled, drills opened them barely started, and buying the
    // spawn-rate upgrade made income go DOWN — a trap sold as an improvement.
    // It also self-limits: crank spawning as hard as you like and the bay
    // simply waits for them to be worth the trip.
    if ((state.face.cells[i] ?? 0) < base * oreRichness(id) * ORE_WORTH_OPENING) continue;
    (out ??= []).push(i);
  }
  // Fullest first, so the best pocket goes to the first free machine.
  out?.sort((a, b) => (state.face.cells[b] ?? 0) - (state.face.cells[a] ?? 0));
  return out;
}

export function tickDrills(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number): void {
  if (!state.drills.bayBuilt || state.drills.units.length === 0) return;
  // A drill never works a cultivated (vined) cell — the Growth automation law
  // leaves those for their own harvest.
  const skip = (i: number): boolean => (state.growth.stage[i] ?? 0) > 0;
  const shellId = currentShell(state).id;
  // ORE BOOKKEEPING, once for the whole bay rather than once per drill. The
  // claim set is mutated as drills take pockets, so two never crowd one.
  // Every pocket free and worth taking, in one pass for the whole bay. `null`
  // when there is nothing on offer, which is the overwhelmingly common case and
  // costs one array read to establish.
  const offered = openPockets(state, mods, skip);

  for (let d = 0; d < state.drills.units.length; d++) {
    const drill = state.drills.units[d]!;
    // ONE ALLOY PER DRILL (A.54). Read here rather than once for the bay: the
    // machine next to this one may be running something else entirely, which
    // is the whole decision the system is made of.
    const ability = drillAbility(drill);

    // --- THE POCKET JOB -----------------------------------------------------
    // A drill on an ore is doing NOTHING ELSE for the duration, and that is the
    // cost the player is weighing when they leave one to the machines. It is
    // also why this sits before the strike loop rather than inside it: the
    // drill's strike timer does not advance while it is digging.
    //
    // A pocket already in hand is dropped if somebody else opened it (or a vine
    // took the cell); otherwise, if the bay is hunting, take one now. CLAIMING
    // AND DIGGING HAPPEN IN THE SAME TICK on purpose — an earlier cut spent the
    // whole tick claiming, which is invisible at the engine's real step size and
    // very visible in one big catch-up tick, where a drill would claim a pocket
    // and then never touch it.
    if (drill.oreCell !== undefined && (!oreAt(state, drill.oreCell) || skip(drill.oreCell))) {
      delete drill.oreCell;
      delete drill.oreProgress;
    }
    if (drill.oreCell === undefined && offered && offered.length > 0) {
      const claim = offered.shift()!; // taken off the list, so nobody doubles up
      drill.oreCell = claim;
      drill.oreProgress = 0;
      drill.lastCell = claim; // the face draws the arm reaching for it
    }
    if (drill.oreCell !== undefined) {
      const cell = drill.oreCell;
      const need = oreAt(state, cell)!.digSec * DRILL_ORE_SPEED;
      drill.oreProgress = (drill.oreProgress ?? 0) + dt;
      if (drill.oreProgress >= need) {
        openOre(state, mods, ctx, cell, 'drill', DRILL_DROP_FACTOR, drill.name);
        state.stats.drillStrikes += 1;
        logImplementUse(drill, shellId, 1);
        delete drill.oreCell;
        delete drill.oreProgress;
      }
      continue; // busy either way
    }

    drill.timer += dt;
    const interval = drillInterval(state, mods, drill);
    // A drill strikes at most a few times per tick even after catch-up; the
    // cells it would have hit are regen-limited anyway.
    let strikes = 0;
    while (drill.timer >= interval && strikes < 4) {
      drill.timer -= interval;
      strikes++;
      const target = pickTarget(state, skip);
      if (target < 0) continue; // every cell is vined — this drill idles

      // THE SECOND BITE (A.48 relic power) is the one rule change on this path.
      // It is deliberately NOT the 'Two Hands' Axiom in cheaper clothes: the
      // Axiom gives a second cell at FULL power, this splits the stroke and
      // gives two at 65% each. Net 1.3x on a full face, worse than the Axiom,
      // and worth MORE than the Axiom on a face where every cell is part-full,
      // because the ceiling is regen and two shallow bites waste less of it.
      // Still bounded by regen either way — pillar 2 is untouched.
      const secondBite = relicRule(state, 'twinBite');
      const power = drillPower(state, mods, drill) * (secondBite ? 0.65 : 1);
      // TWO HANDS (law): a stroke works this many cells. The second cell is
      // the next-fullest bare one — same power each, still regen-bound.
      const handCells: number[] = [target];
      const hands = Math.max(lawNum(state, 'drillStrokes'), secondBite ? 2 : 1);
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
        // THE SET (alloy ability): rock a drill has recently worked stays soft,
        // so the next bite takes MORE OF THE CHARGE THAT IS THERE. A bigger
        // bite, never a bigger yield — the cell still only holds what regen put
        // in it, which is why this cannot lift the ceiling.
        strike(state, mods, ctx, drill, hit, power * residueBite(state, hit), d);
        // The MARK is left by this drill's own alloy, but it is left on the
        // ROCK — the drill that comes to this cell next gets the benefit
        // whatever it is carrying. That is what makes a mixed bay worth
        // assembling instead of twenty-four of the same thing.
        markResidue(state, hit, ability);
        markRichness(state, hit, ability);
      }

      // THE ARC (alloy ability): the strike jumps to neighbouring cells and
      // takes their charge too. Faster to the ceiling, never past it.
      if (ability?.kind === 'arc') {
        const jumped = arcTargets(state, target, skip, ability);
        for (const j of jumped) strike(state, mods, ctx, drill, j, power * ARC_SHARE, d);
        if (jumped.length > 0) ctx.emit({ type: 'drillArc', from: target, to: jumped });
      }

      // A stroke teaches the drill this shell a little.
      logImplementUse(drill, shellId, 1);
    }
    if (drill.timer > interval) drill.timer = interval; // don't bank strikes
  }
}

/** One drill hit on one cell: harvest, byproduct, XP, drop and encounter rolls. */
function strike(
  state: GameState, mods: ModifierCache, ctx: EngineCtx,
  drill: DrillState, hit: number, power: number, d: number,
): void {
  const cellCharge = state.face.cells[hit] ?? 0;
  const take = Math.min(power, cellCharge);
  drill.lastCell = hit;
  if (take <= 0) return;
  const sigMult = runChipMult(state, mods, ctx, hit, false);
  const { dust } = harvestCell(state, mods, hit, take / cellCharge, D(sigMult));
  state.stats.drillStrikes += 1;
  // Some shells' drills scrape a byproduct (Ferrite: Scale).
  const by = currentShell(state).drillByproduct;
  if (by) addCurrency(state, by.currencyId, D(take * by.perCharge));
  grantXP(state, mods, ctx, D(0.12 * (1 + 0.08 * state.depth) * (take / 8)));
  rollForDrop(state, mods, ctx, take, DRILL_DROP_FACTOR, drill.name, hit);
  rollForEncounter(state, ctx, take, ENCOUNTER_DRILL_FACTOR);
  ctx.emit({ type: 'drillStrike', drill: d, cell: hit, dust });
}

/** Steady-state charge/sec the bay can consume — used by the offline calc. */
export function drillThroughput(state: GameState, mods: ModifierCache): number {
  let total = 0;
  for (const drill of state.drills.units) {
    total += drillPower(state, mods, drill) / drillInterval(state, mods, drill);
  }
  return total * lawNum(state, 'drillStrokes');
}

export { neighbors };
