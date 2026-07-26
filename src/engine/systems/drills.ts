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
import { foldBonus, registerModifier, type Bucket, type ModifierCache } from '../modifiers';
import type { ActionResult, DrillBehavior, DrillState, EngineCtx, GameState, SeamProfile } from '../types';
import { harvestCell, neighbors } from './face';
import { grantXP } from './xp';
import { DRILL_DROP_FACTOR, rollForDrop } from './drops';
import { ENCOUNTER_DRILL_FACTOR, rollForEncounter } from '../combat/combat';
import { addCurrency, currencyDef, spendCurrency } from '../resources';
import { convCurrencyId, currentShell } from '../shells';
import { runChipMult } from '../signatures';
import { DRILL_HEADS, drillConfig, drillDraw, drillHead } from '../content/drillParts';
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
  const shellId = currentShell(state).id;
  // AFFINITY: a drill that has worked this shell a lot hits it a little harder —
  // and, being drillPower, only reaches the regen ceiling sooner, never past it.
  const aff = affinityMult(drill, shellId);
  const floor = drillBroken(drill) ? BROKEN_FLOOR : 1;
  // A.52, three terms, all of them multipliers on how fast this chassis reaches
  // the ceiling and none of them on the ceiling itself (pillar 2):
  //   THE FEED   — shared across the bay, so one drill's fine bit is taken out
  //                of the others' share. Browns out, never stops (pillar 1).
  //   THE GRAIN  — the shape this bit has taken, worth ±12% in the world it is
  //                standing in. Exactly 1 on a bit that has not settled yet.
  //   THE FIT    — how well the head suits the seam as the face reads RIGHT NOW.
  //                Floored at 0.8: a badly fitted head still digs.
  const load = bayLoadFactor(state);
  const grain = bitGrainMult(drill, shellId);
  const fit = headFit(drill.head, seamOf(state));
  return (2 + 0.75 * drill.level) * mods.get(state, 'drillPower').toNumber()
    * cfg.powerMult * aff * floor * load * grain * fit;
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
import { relicRule } from './relicPowers';

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
        rollForDrop(state, mods, ctx, take, DRILL_DROP_FACTOR, drill.name);
        rollForEncounter(state, ctx, take, ENCOUNTER_DRILL_FACTOR);
        ctx.emit({ type: 'drillStrike', drill: d, cell: hit, dust });
      }
      // A stroke grinds the head a little, and teaches it this shell a little.
      // Wear accrues only here (online); the closed-form offline path never runs.
      drill.wear = Math.min(1, (drill.wear ?? 0) + wearRate);
      logImplementUse(drill, shellId, 1);
      // THE GRAIN (A.52) rides the same stroke, but on the BIT rather than the
      // chassis — a bit carried to a new world is the thing that goes wrong,
      // and a bit swapped in is the thing that fixes it.
      if (drill.bit) {
        const grain = (drill.bit.grain ??= {});
        grain[shellId] = (grain[shellId] ?? 0) + 1;
      }
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

// ---------------------------------------------------------------------------
// THE BAY (A.52) — the four things that make a setup a puzzle and not a lookup
// ---------------------------------------------------------------------------
/**
 * The Drill Bay was "pick the best material, clone it across 24" — a lookup
 * with a buy button. Four mechanisms, and they only work because they
 * interlock:
 *
 *  1 THE FEED — one shared budget. A heavy head and a fine bit on one chassis
 *    is taken out of what the other twenty-three can have, so the question
 *    stops being "what is best" and becomes "what is worth it, HERE".
 *  2 THE GRAIN — a bit takes the shape of the rock it works. Sharpening it for
 *    one world is the same act as blunting it for the next, which is what
 *    eventually asks a question instead of answering one.
 *  3 THE SEAM — the face is read every second, and heads are fitted against
 *    that reading. Descending and the shell signatures turn the seam under a
 *    bay nobody touched, so the puzzle re-opens on its own.
 *  4 THE ARRANGEMENTS — bay-wide combinations that a cloned fleet cannot have.
 *    Found by arranging, never listed (pillar 5).
 *
 * PILLAR 1 IS THE CONSTRAINT ON ALL FOUR. Not one of them can stop a drill:
 * the feed browns out to a floor, a wrong-grained bit is still a bit, a badly
 * fitted head still digs, and an arrangement nobody found simply is not paid.
 * A player who never opens this panel keeps every drill they had and loses
 * only the margin. Every mechanism leaves value on the table; none takes it
 * off the plate.
 *
 * PILLAR 2 IS UNTOUCHED. Every term here lands in drillPower / drillSpeed /
 * dropRate — how fast the bay reaches the regen ceiling, and what it finds on
 * the way. None of it multiplies dust, so none of it lifts the ceiling.
 */

/** What one level of feed adds, and where a bay with no upgrades starts. */
export const BAY_BASE_SUPPLY = 6;
export const BAY_SUPPLY_PER_LEVEL = 3;
/**
 * The brownout floor. An over-drawn bay runs slow, never stops — the whole
 * point of a budget that cannot block (pillar 1). At 0.5 a bay drawing double
 * its feed is exactly as productive as one drawing none of it, which is the
 * honest shape: over-committing wastes the investment and takes nothing away.
 */
export const BROWNOUT_FLOOR = 0.5;

export function baySupply(state: GameState): number {
  return BAY_BASE_SUPPLY + BAY_SUPPLY_PER_LEVEL * (state.drills.supply ?? 0);
}

export function bayDraw(state: GameState): number {
  let total = 0;
  for (const d of state.drills.units) total += drillDraw(d);
  return total;
}

/** 1 when the feed covers the bay; falls toward the floor when it does not. */
export function bayLoadFactor(state: GameState): number {
  const draw = bayDraw(state);
  if (draw <= 0) return 1;
  return Math.max(BROWNOUT_FLOOR, Math.min(1, baySupply(state) / draw));
}

// --- 2. THE GRAIN ----------------------------------------------------------

/** Strikes a bit must have done before it has taken any shape at all. */
export const GRAIN_SETTLE = 4000;
/** The full range a grain can swing a bit: 0.88 wrong-shaped .. 1.12 right. */
export const GRAIN_LOW = 0.88;
export const GRAIN_HIGH = 1.12;

/** How much of this bit's working life was spent in `shellId`, 0..1. */
export function grainShare(bit: NonNullable<DrillState['bit']>, shellId: string): number {
  const g = bit.grain;
  if (!g) return 0;
  let total = 0;
  for (const v of Object.values(g)) total += v;
  if (total <= 0) return 0;
  return (g[shellId] ?? 0) / total;
}

/** Total strikes this bit has taken — below GRAIN_SETTLE it is still flat. */
export function grainWork(bit: NonNullable<DrillState['bit']>): number {
  let total = 0;
  for (const v of Object.values(bit.grain ?? {})) total += v;
  return total;
}

/**
 * What the bit's shape is worth in the world it is standing in. A fresh bit is
 * exactly neutral; a bit that has only ever worked here is at its best; a bit
 * carried down from the world above is genuinely worse than a flat one — which
 * is the decision the whole mechanism exists to produce.
 */
export function bitGrainMult(drill: DrillState, shellId: string): number {
  const bit = drill.bit;
  if (!bit) return 1;
  if (grainWork(bit) < GRAIN_SETTLE) return 1;
  return GRAIN_LOW + (GRAIN_HIGH - GRAIN_LOW) * grainShare(bit, shellId);
}

/** Grinding a bit back to a flat edge. Priced in the shell's own converted
 *  currency, so it is payable in every world (the standing reach rule). */
export function recutCost(drill: DrillState): number {
  return Math.ceil(6 * Math.pow(1.15, drill.level));
}

export function recutBit(state: GameState, index: number): ActionResult {
  const drill = state.drills.units[index];
  if (!drill) return { ok: false, reason: 'No such drill' };
  if (!drill.bit) return { ok: false, reason: 'Nothing fitted to re-cut' };
  if (grainWork(drill.bit) < GRAIN_SETTLE) return { ok: false, reason: 'That bit has not taken a shape yet' };
  const cost = recutCost(drill);
  if (!spendCurrency(state, convCurrencyId(state), D(cost))) {
    return { ok: false, reason: `Grinding it flat costs ${cost} ${currencyDef(convCurrencyId(state)).name}` };
  }
  drill.bit.grain = {};
  return { ok: true };
}

// --- 3. THE SEAM -----------------------------------------------------------

/**
 * Read the live face. Cheap by construction — one pass for the statistics and
 * one for the neighbour test, over 36-400 cells, on the one-second beat.
 *
 * Vined cells (the Growth automation law) are EXCLUDED, because a drill will
 * not work them: that is how Verdance's signature turns the seam without any
 * special case here.
 */
export function readSeam(state: GameState): SeamProfile {
  const cells = state.face.cells;
  const n = cells.length;
  const vined = (i: number): boolean => (state.growth.stage[i] ?? 0) > 0;

  let sum = 0, max = 0, count = 0;
  for (let i = 0; i < n; i++) {
    if (vined(i)) continue;
    const c = cells[i]!;
    sum += c;
    if (c > max) max = c;
    count++;
  }
  const mean = count > 0 ? sum / count : 0;
  // SPREAD: mean over max. One hot cell on a dead face → near 0; a face that
  // has refilled evenly → near 1.
  const spread = max > 0 ? Math.max(0, Math.min(1, mean / max)) : 1;

  // CLUSTER: of the cells above the mean, how many have a neighbour above it.
  let rich = 0, richTouching = 0;
  for (let i = 0; i < n; i++) {
    if (vined(i) || cells[i]! <= mean || mean <= 0) continue;
    rich++;
    for (const j of neighbors(state, i)) {
      if (!vined(j) && cells[j]! > mean) { richTouching++; break; }
    }
  }
  const cluster = rich > 0 ? richTouching / rich : 0.5;

  const floor = Math.max(1, currentShell(state).floorDepth);
  const hardness = Math.max(0, Math.min(1, state.depth / floor));
  return { spread, cluster, hardness, at: Math.floor(state.stats.playTimeSec) };
}

/** The seam as the bay last read it — the panel and the fit both use this. */
export function seamOf(state: GameState): SeamProfile {
  return state.drills.seam ?? readSeam(state);
}

/** How well a head suits a seam: 0.80 (wrong rock) .. 1.15 (its rock). */
export const FIT_LOW = 0.8;
export const FIT_HIGH = 1.15;

export function headFit(headId: string | undefined, seam: SeamProfile): number {
  const head = drillHead(headId);
  if (!head) return 1; // an unconfigured drill is never penalised for it
  const d =
    Math.abs(head.likes.spread - seam.spread) * 0.40
    + Math.abs(head.likes.cluster - seam.cluster) * 0.30
    + Math.abs(head.likes.hardness - seam.hardness) * 0.30;
  return Math.max(FIT_LOW, Math.min(FIT_HIGH, FIT_HIGH - d * 0.75));
}

/**
 * WHAT THE BAY IS LEAVING ON THE TABLE. The best head for each chassis against
 * the seam as it stands, compared with what is actually fitted. This is the
 * "it has gone stale" reading, and it is a RATIO, so it says how much better a
 * re-solve would be rather than scolding.
 */
export function bayStaleness(state: GameState): { now: number; best: number; gain: number } {
  const seam = seamOf(state);
  let now = 0, best = 0;
  for (const d of state.drills.units) {
    now += headFit(d.head, seam);
    let b = headFit(undefined, seam);
    for (const h of DRILL_HEADS) b = Math.max(b, headFit(h.id, seam));
    best += b;
  }
  if (state.drills.units.length === 0) return { now: 1, best: 1, gain: 0 };
  const nowAvg = now / state.drills.units.length;
  const bestAvg = best / state.drills.units.length;
  return { now: nowAvg, best: bestAvg, gain: bestAvg / nowAvg - 1 };
}

// --- 4. THE ARRANGEMENTS ---------------------------------------------------

export interface BaySynergy {
  id: string;
  name: string;
  line: string;
  bucket: Bucket;
  bonus: number;
  /** Read over the whole bay. Never shown before it has fired once. */
  holds: (state: GameState) => boolean;
}

const headCount = (s: GameState, id: string): number =>
  s.drills.units.filter((d) => d.head === id).length;

/**
 * Six arrangements a cloned fleet cannot have. Every one is about the bay as a
 * WHOLE — that is the point: the per-drill question has an answer you can look
 * up, and this one does not.
 */
export const BAY_SYNERGIES: BaySynergy[] = [
  {
    id: 'chainGang', name: 'The Chain Gang', bucket: 'drillSpeed', bonus: 0.08,
    line: 'Three seekers working one seam. Each one leaves the next a warmer trail.',
    holds: (s) => headCount(s, 'seeker') >= 3,
  },
  {
    id: 'matchedSet', name: 'A Matched Set', bucket: 'drillPower', bonus: 0.08,
    line: 'Four bits off the same stone. They ring at the same pitch and the rock notices.',
    holds: (s) => {
      const counts = new Map<string, number>();
      for (const d of s.drills.units) {
        if (!d.bit) continue;
        counts.set(d.bit.materialId, (counts.get(d.bit.materialId) ?? 0) + 1);
      }
      for (const n of counts.values()) if (n >= 4) return true;
      return false;
    },
  },
  {
    id: 'theSpread', name: 'The Full Spread', bucket: 'dropRate', bonus: 0.07,
    line: 'One of every hunt on the board at once. Nothing on this face goes unlooked-at.',
    holds: (s) => {
      const seen = new Set(s.drills.units.map((d) => drillConfig(d).behavior));
      return seen.size >= 4;
    },
  },
  {
    id: 'deepCut', name: 'The Deep Cut', bucket: 'drillPower', bonus: 0.1,
    line: 'Three bits that have forgotten every other world. They only know this one now.',
    holds: (s) => {
      const shell = currentShell(s).id;
      return s.drills.units.filter((d) => d.bit && grainWork(d.bit) >= GRAIN_SETTLE
        && grainShare(d.bit, shell) >= 0.6).length >= 3;
    },
  },
  {
    id: 'quietBay', name: 'The Quiet Bay', bucket: 'drillSpeed', bonus: 0.07,
    line: 'Six chassis and headroom to spare. Nothing here is straining, and it runs sweeter for it.',
    holds: (s) => s.drills.units.length >= 6 && bayDraw(s) <= baySupply(s) * 0.7,
  },
  {
    id: 'mixedGrind', name: 'The Mixed Grind', bucket: 'dropRate', bonus: 0.06,
    line: 'Five different stones on the rails. Between them they turn up things a matched bay walks past.',
    holds: (s) => new Set(s.drills.units.filter((d) => d.bit).map((d) => d.bit!.materialId)).size >= 5,
  },
];

export const SYNERGY_BY_ID = new Map(BAY_SYNERGIES.map((x) => [x.id, x]));

export function activeSynergies(state: GameState): BaySynergy[] {
  if (!state.drills.bayBuilt) return [];
  return BAY_SYNERGIES.filter((x) => x.holds(state));
}

/** Write down anything the arrangement has newly formed. The bonus applies the
 *  first time regardless; this only records that it was SEEN (pillar 5). */
export function noteSynergies(state: GameState, ctx: EngineCtx): void {
  const found = (state.drills.synergiesFound ??= []);
  for (const syn of activeSynergies(state)) {
    if (found.includes(syn.id)) continue;
    found.push(syn.id);
    ctx.emit({ type: 'baySynergy', id: syn.id });
    ctx.dirty();
  }
}

export function synergyBonus(state: GameState, bucket: Bucket): number {
  return activeSynergies(state)
    .filter((x) => x.bucket === bucket)
    .reduce((sum, x) => sum + x.bonus, 0);
}

/** The arrangements enter the game as named modifier sources, so a bay bonus
 *  is breakdown-able like everything else rather than an invisible multiplier. */
export function registerBayModifiers(): void {
  for (const bucket of new Set(BAY_SYNERGIES.map((x) => x.bucket))) {
    registerModifier({
      id: `bay.${bucket}`,
      label: 'Bay arrangement',
      bucket,
      value: (s) => foldBonus(bucket, synergyBonus(s, bucket)),
    });
  }
}

export const DRILL_BEHAVIORS: DrillBehavior[] = ['fullest', 'sweep', 'random', 'chain'];
