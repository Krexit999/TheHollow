/**
 * The Face — grid of cells with charge. Locked formulas:
 *   cap   = 8 * (1 + 0.50 * Roots)
 *   regen = 0.08 * (1 + 0.25 * Soil)      (charge / sec / cell)
 *   Y     = (1 + 0.35 * Blade) * PROD(globalMults)
 * Cell charge stays a plain number (it never approaches 1e15); yields are
 * Decimal from the moment charge is converted to Dust.
 */
import { D, Decimal } from '../decimal';
import type { ModifierCache } from '../modifiers';
import { addCurrency } from '../resources';
import { stat } from '../upgrades';
import type { EngineCtx, GameState } from '../types';
// (EngineCtx now also threads through tickFace for seep drops/encounters.)
import { coreNodeLevel } from '../content/shell1/coreTree';
import { skillRank } from '../content/shell1/skillTree';
import { grantXP } from './xp';
import { rollForDrop } from './drops';
import { recordChipForFigures } from './figures';
import { logImplementUse } from './affinity';
import { equippedTool } from './forge';
import { gainToolXp, spendToolUse, toolEffect } from './toolMining';
import { advanceToolCharges, wireHandHarvest } from './toolAbilities';
import { gainModXp, modCache } from './toolMods';
import { growLivingParts } from './casting';
import { noteBioWork } from './toolBio';
import { chipCurrencyId, currentShell } from '../shells';
import { activeSignatures, registerSignature, runChipMult } from '../signatures';
import { masteryLevel } from './mastery';
import { lawNum, sealed, challengeNum } from '../laws';
import { oreDef, oreRichness } from '../content/ores';
import type { ReachPattern } from '../content/forgeParts';
import {
  applyChipCompaction, ensureCompaction, remapCompaction, type CompactionResult,
} from './compaction';

export const BASE_CAP = 8;
export const BASE_REGEN = 0.08;

// SWEEP AND ITS STAMINA ARE CUT. Sweep was a drag that cleared a swathe for a
// resource that gated nothing else, which made it a faster tap rather than a
// different verb. Grain briefly gave it and SKIM distinct jobs (§2.4 — SKIM
// with-grain, HOLD across); grain is cut, and neither verb has had a job since.
// ONE CHIP VERB.

export function cellCap(state: GameState, mods: ModifierCache): number {
  return BASE_CAP * (1 + 0.5 * stat(state, 'roots')) * mods.get(state, 'cap').toNumber();
}

/** Charge per second per cell. */
export function cellRegen(state: GameState, mods: ModifierCache): number {
  // regenCeilingMult is THE ONE HERESY (laws.ts): base 1; only the Axiom
  // 'Heresy of the Ceiling' moves it, deliberately and announced.
  // THE CROWDED FACE (challenge) scales regen down while the board is wide —
  // pillar 2 stated as an experiment rather than a sentence.
  return BASE_REGEN * (1 + 0.25 * stat(state, 'soil')) * mods.get(state, 'regen').toNumber()
    * lawNum(state, 'regenCeilingMult') * challengeNum(state, 'regenMult', 1);
}

/** Y — dust per point of charge chipped. */
export function chipYield(state: GameState, mods: ModifierCache): Decimal {
  return mods.get(state, 'dustYield').mul(1 + 0.35 * stat(state, 'blade'));
}

/** Hard ceiling on income: W * H * regen * Y. Shown in the UI, used offline. */
export function dpsMax(state: GameState, mods: ModifierCache): Decimal {
  const { w, h } = state.face;
  return chipYield(state, mods).mul(w * h * cellRegen(state, mods));
}

/**
 * SEEPAGE — LOAM'S SIGNATURE (promoted in Phase 5; a correction to the doc).
 * A cell at cap can't hold more, but the rock keeps producing: 15% × strength
 * of the overflow leaks out as chip currency. Native in Loam; carried down
 * like any signature (0.4 base, raised by Resonant Memory). Pillar 1's idle
 * floor — thin, never absent, strictly under the regen ceiling.
 *
 * THIS CONSTANT IS THE PRE-MACHINE IDLE/ACTIVE RATIO (A.43).
 *
 * Not a flavour number. Before the drill bay exists it is the ONLY income an
 * idle player has, and an active player sustains 0.96–1.00 of the field
 * ceiling (measured, `sim-out/a43-part-a.md`) — so this fraction *is* the ratio
 * pillar 1 legislates, and at 0.10 it was setting it to 10× against a stated
 * ~5×. Everything the last two phases chased through the descent curve, the
 * drop economy and the tier walls was this one number seen from downstream.
 *
 * Raised to 0.15 at A.43, and the value is MEASURED, not derived. The
 * derivation says 0.20 (make income exactly 5×) and is wrong: idle also earns
 * from the opening bootstrap, from Depth Pressure and later from drills, and
 * those compound on top, so 0.20 overshoots time-to-depth to 3.0–3.9×. 0.15
 * lands R at 4.0–5.0 across d30–d60. Three seeds, both arms, one flag apart.
 *
 * It cannot become a faucet at any value below 1.0: seepage takes a fraction of
 * OVERFLOW, which is regen the field produced and no drill harvested, so
 * seep + drill ≤ regen identically. Pillar 2 binds unchanged.
 *
 * It cannot speed an ACTIVE player at any value: overflow only exists when a
 * cell is AT CAP, and a player working the face never leaves one there.
 */
export const SEEP_EFFICIENCY = 0.15;

/**
 * SKIM IS CUT, AND SEEPAGE IS NOT.
 *
 * Skim was the verb that collected a side-pool seepage banked on top of its
 * leak. The leak was always the real mechanic — it is what lets a fully idle
 * player forge past the hardness walls (pillar 1) — and the pool existed only
 * to give the verb something to do. With the verb gone the pool has no reader,
 * so both go; SEEPAGE, the signature, is untouched and still carries on Breach.
 */

/** The current seep strength: native 1, carried 0.4×memory, else 0. */
export function seepStrength(state: GameState): number {
  for (const sig of activeSignatures(state)) {
    if (sig.def.id === 'seepage') return sig.strength;
  }
  return 0;
}

/** Refill cells from below; with Seepage active, full cells leak. */
export function tickFace(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number): void {
  // THE COUNTER EXISTS BY THE TIME ANYTHING ELSE ASKS. Every save reaches the
  // compaction layer through here first — one length check per tick, no migration.
  ensureCompaction(state);
  const base = cellCap(state, mods);
  const regen = cellRegen(state, mods) * dt;
  const cells = state.face.cells;
  // Only consult the pocket array if there IS one with something in it. This
  // loop runs every cell every 100ms step, so a cross-module call per cell was
  // measurable: it roughly doubled the cost of a two-hour warp, all of it paid
  // by the overwhelmingly common case of a face made entirely of plain rock.
  const ore = state.face.ore?.some(Boolean) ? state.face.ore : undefined;
  // THE HOLLOW: there is no rock. Only RECONSTRUCTED cells regen — each is a
  // real cell with the real ceiling (pillar 2 binds cell by rebuilt cell).
  const rebuilt = currentShell(state).id === 'hollow' ? new Set(state.hollow.rebuilt) : null;
  let overflow = 0;
  for (let i = 0; i < cells.length; i++) {
    if (rebuilt && !rebuilt.has(i)) continue; // absence does not regenerate
    // A POCKET HOLDS MORE, and that is the entire mechanism. REGEN IS NOT
    // TOUCHED here — the loop still adds exactly `regen` to every cell — so
    // `dpsMax = W·H·regen·Y` cannot move. A richer cell just takes longer to
    // fill and overflows later, which is why an ore reads as banking what
    // would otherwise have seeped away rather than as a second faucet.
    const oreId = ore === undefined ? undefined : ore[i];
    const cap = oreId === undefined || oreId === '' ? base : base * oreRichness(oreId);
    const c = cells[i]!;
    if (c < cap) {
      const next = c + regen;
      if (next > cap) {
        overflow += next - cap;
        cells[i] = cap;
      } else {
        cells[i] = next;
      }
    } else {
      overflow += regen;
    }
  }
  if (overflow > 0) {
    const strength = seepStrength(state);
    if (strength > 0) {
      const collected = overflow * SEEP_EFFICIENCY * strength;
      const seeped = chipYield(state, mods).mul(collected);
      addCurrency(state, chipCurrencyId(state), seeped);
      // Seepage is field harvest (it rolls drops like any other), so it counts
      // toward the pillar-2 numerator. It does NOT count as charge CHIPPED —
      // nothing struck the rock — which is why the two stats differ.
      state.stats.fieldChargeHarvested = state.stats.fieldChargeHarvested.add(collected);
      // Seepage is harvest: it rolls drops like any harvest — this is what
      // lets a fully idle player forge past the hardness walls instead of
      // deadlocking at them (pillar 1).
      rollForDrop(state, mods, ctx, collected, 1);
    }
  }
}

/** Register Seepage as a signature mechanic (content bootstrap calls this). */
export function registerSeepage(): void {
  registerSignature({
    id: 'seepage',
    shellId: 'loam',
    name: 'Seepage',
    // The leak itself lives in tickFace (it needs the overflow accounting);
    // the registration is what makes it carriable and strength-scaled.
    hooks: {
      // In the Hollow: the loam always gives a little. Even here. This is
      // the floor every minimal-carry run stands on.
      voidTick: (s, _m, _dt, strength) => 0.5 * strength * (1 + 0.08 * masteryLevel(s, 'loam')),
    },
  });
  // SEEPAGE REGISTERS NO TECHNIQUE. Skim was Loam's verb and it is cut; the
  // signature keeps its leak and its voidTick hook, which is everything that
  // made it worth carrying.
}

export interface ChipResult {
  dust: Decimal;
  charge: number;
  crit: boolean;
  /** Cells splashed by Fault Lines. */
  fractured: number[];
  /**
   * WHAT THE CHIP DID TO THE ROCK. Absent when nothing came away, so a refused
   * swing reads exactly as it always did. Distinct from `fractured` above,
   * which is Fault Lines' splash.
   */
  compaction?: CompactionResult;
}

/**
 * Harvest charge from one cell. `fraction` of current charge is taken
 * (manual chips take everything; fractures take half). Returns the dust
 * actually credited.
 */
export function harvestCell(
  state: GameState,
  mods: ModifierCache,
  cell: number,
  fraction: number,
  yieldMult: Decimal,
): { dust: Decimal; charge: number } {
  // THE UNEMPTYING (law): cells never deplete below cap × floor-share. Only
  // charge ABOVE the floor can be taken — income stays regen-bound while no
  // cell ever goes dark under the law. A pocket's floor rides its own richer
  // cap, so the law means the same proportion of the rock wherever it applies.
  const floor = cellCap(state, mods) * oreRichness(state.face.ore?.[cell]) * lawNum(state, 'regenFloorShare');
  const held = state.face.cells[cell] ?? 0;
  const charge = Math.min(held * fraction, Math.max(0, held - floor));
  if (charge <= 0) return { dust: D(0), charge: 0 };
  state.face.cells[cell] = held - charge;
  const dust = chipYield(state, mods).mul(charge).mul(yieldMult);
  addCurrency(state, chipCurrencyId(state), dust);
  // Deep rock carries a byproduct in some shells (Ferrite: Rime below 200).
  const deep = currentShell(state).deepByproduct;
  if (deep && state.depth >= deep.minDepth) {
    addCurrency(state, deep.currencyId, D(charge * deep.perCharge));
  }
  state.stats.totalChargeChipped = state.stats.totalChargeChipped.add(charge);
  state.stats.fieldChargeHarvested = state.stats.fieldChargeHarvested.add(charge); // pillar-2
  return { dust, charge };
}

/** Orthogonal neighbors of a cell index. */
export function neighbors(state: GameState, cell: number): number[] {
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

/**
 * THE CELLS A SWING REACHES, nearest first — orthogonal before diagonal, so a
 * small tool spreads in a cross and a big one fills the 3x3 around the strike.
 * Deterministic: the same swing on the same cell touches the same rock, because
 * a reach that wandered would make the tool impossible to aim.
 */
export function reachFrom(state: GameState, cell: number, want: number): number[] {
  if (want <= 0) return [];
  const { w, h } = state.face;
  const x = cell % w;
  const y = Math.floor(cell / w);
  const out: number[] = [];
  const RINGS: Array<[number, number]> = [
    [0, -1], [-1, 0], [1, 0], [0, 1],      // orthogonal
    [-1, -1], [1, -1], [-1, 1], [1, 1],    // diagonal
  ];
  for (const [dx, dy] of RINGS) {
    if (out.length >= want) break;
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    out.push(ny * w + nx);
  }
  return out;
}

/**
 * WHERE A SHAPED HEAD PUTS ITS SWING.
 *
 * `reachFrom` above is the `spread` pattern and stays exactly what it was — a
 * plain-shaped tool, and every tool cast before shapes existed, goes through
 * the same code it always did. The other five arrange the SAME NUMBER of
 * harvests differently, which is the whole claim: a shape moves cells, it does
 * not manufacture them.
 *
 * ALL SIX ARE DETERMINISTIC, for the reason the original was: the same swing on
 * the same cell must touch the same rock, or the tool is impossible to aim and
 * the shape stops being a thing you can build around.
 *
 * Every one is bounded by `want`, which is `tool.cells - 1` and is itself
 * clamped to `MAX_EXTRA_CELLS`. A pattern that runs out of board returns fewer
 * cells rather than wrapping — walking off the edge and reappearing would make
 * a Spike at the wall behave like a Spike in open rock, which it should not.
 */
export function reachPattern(
  state: GameState, cell: number, want: number, pattern: ReachPattern,
): number[] {
  if (want <= 0 || pattern === 'single') return [];
  const { w, h } = state.face;
  const x = cell % w;
  const y = Math.floor(cell / w);
  const at = (nx: number, ny: number): number =>
    (nx < 0 || nx >= w || ny < 0 || ny >= h ? -1 : ny * w + nx);
  const take = (list: number[]): number[] => {
    const out: number[] = [];
    for (const c of list) {
      if (out.length >= want) break;
      if (c >= 0 && c !== cell && !out.includes(c)) out.push(c);
    }
    return out;
  };

  switch (pattern) {
    /** A TWO-BY-TWO with the strike in a corner, leaning to whichever corner
     *  has board under it — so a Wide head at the wall still cuts a square. */
    case 'block': {
      const dx = x + 1 < w ? 1 : -1;
      const dy = y + 1 < h ? 1 : -1;
      return take([at(x + dx, y), at(x, y + dy), at(x + dx, y + dy)]);
    }
    /**
     * TWO CELLS, NOT NEXT TO EACH OTHER.
     *
     * The far one is the strike reflected through the middle of the face —
     * deterministic and, for most of the board, genuinely elsewhere. NOT for
     * all of it: a cell NEAR THE CENTRE reflects onto its own diagonal
     * neighbour, so a Twin head swung at the middle of a 6x6 was cutting
     * exactly what a Point head cuts. Found by asserting that no two head
     * shapes sweep the same rock, which failed on `twin` vs `point` at cell 14.
     *
     * So the mirror has to EARN being the twin. If it lands within a step or
     * two of the strike it is not a second place at all, and the farthest
     * corner is used instead — still deterministic, still one specific cell.
     */
    case 'twin': {
      let far = at(w - 1 - x, h - 1 - y);
      const near = (c: number): boolean =>
        c < 0 || Math.max(Math.abs((c % w) - x), Math.abs(Math.floor(c / w) - y)) <= 2;
      if (near(far)) {
        far = at(x < w / 2 ? w - 1 : 0, y < h / 2 ? h - 1 : 0);
      }
      return take([far, ...reachFrom(state, cell, want)]);
    }
    /** AN ARC beside the strike: the column over, curving away. More cells than
     *  a spread reaches, which is why the Crescent trades splash for them. */
    case 'arc': {
      const dx = x + 1 < w ? 1 : -1;
      return take([
        at(x + dx, y - 1), at(x + dx, y), at(x + dx, y + 1),
        at(x + dx * 2, y - 1), at(x + dx * 2, y + 1),
        at(x, y - 2), at(x, y + 2),
        at(x + dx * 2, y),
      ]);
    }
    /** A RUN straight through, in whichever direction has more wall left. */
    case 'line': {
      const dir = x <= (w - 1) / 2 ? 1 : -1;
      const out: number[] = [];
      for (let i = 1; i <= want + 2; i++) out.push(at(x + dir * i, y));
      return take(out);
    }
    default:
      return reachFrom(state, cell, want);
  }
}

/**
 * A manual chip: takes the cell's full charge, may crit (Heavy Hands skill),
 * may fracture into neighbors (Fault Lines core node), and REACHES past it if
 * the player is carrying a tool. Grants XP.
 */
export function manualChip(
  state: GameState, mods: ModifierCache, ctx: EngineCtx, cell: number,
): ChipResult {
  if (cell < 0 || cell >= state.face.cells.length) {
    return { dust: D(0), charge: 0, crit: false, fractured: [] };
  }
  // A POCKET WILL NOT COME AWAY WITH ONE SWING. This refusal is what makes an
  // ore a decision rather than a bigger tap: the only ways in are to WORK it
  // (`workOre`, the hold gesture) or to leave it to a drill. Without this the
  // whole feature collapses into "some cells pay more", and the time cost —
  // the thing the drill is actually competing against — never exists.
  if (state.face.ore?.[cell]) {
    return { dust: D(0), charge: 0, crit: false, fractured: [] };
  }

  /**
   * THE WIND-UP — the rate half of the balance trade.
   *
   * A heavy tool reaches further and takes more of every cell it reaches, and
   * pays for it here: it will not swing again until it has come back round.
   * That is what makes "fewer, bigger" literally true rather than a description
   * of a strictly better tool, and it is the term the convergence claim rests
   * on — heavy clears more per swing and swings less often, light the reverse,
   * and both arrive at W x H x regen.
   *
   * IT EXISTS ONLY ON THE HEAVY SIDE, and only outside the deadzone. Bare hands
   * have no wind-up, an even tool has no wind-up, and a light tool has no
   * wind-up — because neutral is unlimited clicking and "faster than unlimited"
   * cannot be sold. Nobody who is not deliberately building heavy ever meets
   * this, which is the whole reason it is allowed to exist.
   */
  if ((state.casting?.windup ?? 0) > 0) {
    return { dust: D(0), charge: 0, crit: false, fractured: [] };
  }

  // Heavy Hands: +10% crit chance per rank, crits chip for 3x.
  const critChance = 0.1 * skillRank(state, 'heavyHands');
  const crit = Math.random() < critChance;
  // Signature mechanics (polarity chains, carried growth...) compose here.
  const sigMult = runChipMult(state, mods, ctx, cell, true);
  const mult = D(sigMult).mul(crit ? 3 : 1);

  // Read BEFORE the swing takes it: the ability meters' `onFull` rule asks
  // whether the rock you hit was nearly full, and after the harvest it never is.
  const wasFull = (state.face.cells[cell] ?? 0) >= cellCap(state, mods) * 0.7;

  const { dust, charge } = harvestCell(state, mods, cell, 1, mult);
  if (charge <= 0) return { dust, charge, crit: false, fractured: [] };

  let totalDust = dust;
  const fractured: number[] = [];
  // Fault Lines: 4% chance per level to splash all orthogonal neighbors for
  // half their current charge.
  const fractureChance = 0.04 * coreNodeLevel(state, 'faultLines');
  if (fractureChance > 0 && Math.random() < fractureChance) {
    for (const n of neighbors(state, cell)) {
      const r = harvestCell(state, mods, n, 0.5, D(1));
      if (r.charge > 0) {
        fractured.push(n);
        totalDust = totalDust.add(r.dust);
      }
    }
    if (fractured.length > 0) ctx.emit({ type: 'fracture', cells: fractured });
  }

  /**
   * THE TOOL (step 3). A swing reaches past the cell it landed on: CADENCE
   * decides how many more it touches, BITE how much of each it takes.
   *
   * IT IS REACH, NOT YIELD, and that is the whole pillar-2 argument. Every
   * extra cell goes through `harvestCell` — the same funnel the drills and the
   * abilities use — so each take is `min(share, what the cell holds)` and no
   * tool can pull charge the field has not grown. A better tool clears the face
   * faster; the face still holds exactly W x H x regen.
   *
   * Bare hands take this branch with `cells: 1` and do nothing at all, so a
   * player with no tool mines exactly as they did before this existed
   * (pillar 1).
   */
  const tool = toolEffect(state);
  let splashCharge = 0;
  const reached: number[] = [];
  const reachMods = modCache(state);
  if (tool.cells > 1 && tool.splash > 0) {
    for (const n of reachPattern(state, cell, tool.cells - 1, tool.pattern)) {
      // A pocket is immune to a swing, the same as it is to the first strike —
      // UNLESS the tool carries a Lodestone Head, which works every pocket it
      // reaches instead of only the one under the hand. It still WORKS them
      // (the hold gesture's progress, not an opening), so a pocket is still a
      // decision about attention and this is only ever a wider hand.
      if (state.face.ore?.[n]) {
        if (reachMods.oreReach) reachPocket(state, n, tool.oreRate);
        continue;
      }
      const r = harvestCell(state, mods, n, tool.splash, D(1));
      if (r.charge > 0) {
        totalDust = totalDust.add(r.dust);
        splashCharge += r.charge;
        fractured.push(n);
        reached.push(n);
      }
    }
    if (reached.length > 0) ctx.emit({ type: 'fracture', cells: reached });
  }
  if (tool.hasTool) {
    spendToolUse(state, 1);
    // THE TOOL LEARNS FROM WHAT IT ACTUALLY DID: the cell it broke, plus every
    // one it reached that gave something up. A swing at empty rock teaches it
    // nothing, which is what stops levelling from being a tapping exercise —
    // and what there is to learn from is regen-bound, so the ladder is paced
    // by the same ceiling as everything else.
    gainToolXp(state, 1 + reached.length, ctx);
    // AND THE MODIFIERS LEARN THE SAME WORK. Same currency as the tool's own
    // level — cells that actually gave something up — so nothing on the tool
    // can climb faster than the rock allows.
    gainModXp(state, ctx, 1 + reached.length);
    // AND THE LIVING PARTS GROW, and the biography records it. Same currency:
    // cells that actually gave something up.
    growLivingParts(state, ctx, 1 + reached.length);
    noteBioWork(state, 1 + reached.length, 1);
    // AND A SWING FILLS THE ABILITY METER. `wasFull` is the same 70%-of-cap
    // rule the bay uses, so "mining a charged cell releases lightning" means
    // the same thing in the hand as it does on the rails. This can fire an
    // ability, which harvests through `harvestCell` like everything above it.
    // LIGHT'S OTHER HALF: a light tool builds its meter faster, which is the
    // "more swings means more firings" side of the trade made real.
    advanceToolCharges(state, mods, ctx, cell, wasFull, 1 + tool.balance.charge);
    if (tool.balance.windup > 0) state.casting.windup = tool.balance.windup;
  }

  state.stats.manualChips += 1;
  // XP scales with charge harvested and depth — see chipXP in DESIGN appendix.
  grantXP(state, mods, ctx, D(0.7 * (1 + 0.08 * state.depth) * ((charge + splashCharge) / BASE_CAP)));
  // CONTROL leans the drop roll and nothing else. Drops are outside the charge
  // economy, which is exactly why it is the only stat allowed a multiplier.
  rollForDrop(state, mods, ctx, charge + splashCharge, tool.dropWeight);
  // FIGURES (v20): a chip that completes a traced shape pays a ceiling-free bonus
  // (XP + a drop roll) and records the figure in the Codex. Never Dust.
  recordChipForFigures(state, mods, ctx, cell);
  // AFFINITY (v21): the equipped tool learns the shell it works — a small capped
  // bonus through the modifier pipeline (dropRate), never dustYield (pillar 2).
  logImplementUse(equippedTool(state), currentShell(state).id, 1);
  // COMPACTION RESOLVES LAST, and only on a swing that actually took something.
  // It is a record of work done to the rock; a swing that found nothing did no
  // work, and a face you can compact by tapping empty cells would let a player
  // walk every deep-entry gate open for free.
  const compaction = applyChipCompaction(state, ctx, cell);
  ctx.emit({ type: 'chip', cell, dust: totalDust, charge, crit, manual: true });
  return { dust: totalDust, charge, crit, fractured, compaction };
}

/**
 * THE LODESTONE HEAD — a swing works the pockets it reaches.
 *
 * IT ADVANCES A DIG AND NEVER OPENS ONE. Opening lives in `openOre`, which is
 * in `systems/ores.ts`, and that module reads THIS one — so a call the other
 * way would close a cycle. That constraint turned out to be the right design
 * as well as the necessary one: the modifier widens the HAND, it does not
 * remove the decision. A pocket still has to be finished by the hold gesture
 * or left to a drill, so "attention is what a pocket costs" (A.55) survives a
 * player who has stacked every ore modifier in the library.
 *
 * The seconds per swing are deliberately small. At `oreRate` 1 a pocket wants
 * several seconds of the hold; this is a fraction of one swing's worth, spread
 * over however many pockets happen to be under the arc.
 */
const SWING_ORE_SECONDS = 0.35;

function reachPocket(state: GameState, cell: number, oreRate: number): void {
  const id = state.face.ore?.[cell];
  if (!id) return;
  const dug = state.face.oreDug;
  if (!Array.isArray(dug) || dug.length !== state.face.cells.length) return;
  const def = oreDef(id);
  if (!def) return;
  dug[cell] = Math.min(def.digSec, (dug[cell] ?? 0) + SWING_ORE_SECONDS * oreRate);
}

/**
 * WHAT ONE CELL OF A TOOL ABILITY'S PLAN DOES, wired into `toolAbilities` so
 * that module never has to import this one (the meter is called from here, so
 * the arrow runs one way).
 *
 * IT IS THE MANUAL FUNNEL AND NOTHING ELSE. `harvestCell` with the plan's share
 * — the same call `manualChip` makes for its own splash, taking
 * `min(share × held, held − floor)`. That is where pillar 2 lives for every
 * ability in the hand: an explosion cannot take charge the field has not grown,
 * because there is no code path here that could.
 *
 * The drop weight is scaled by the share for the A.56 reason: `rollForDrop`
 * fires on WEIGHT, so a figure covering twelve cells at full weight would
 * multiply the material economy twelvefold on a term pillar 2 cannot see. A
 * whole explosion is worth about one swing of drops, spread wide.
 */
wireHandHarvest((state, mods, ctx, cell, share) => {
  if ((state.growth.stage[cell] ?? 0) > 0) return;
  const r = harvestCell(state, mods, cell, share, D(1));
  if (r.charge <= 0) return;
  const tool = toolEffect(state);
  rollForDrop(state, mods, ctx, r.charge, tool.dropWeight * share);
  grantXP(state, mods, ctx, D(0.7 * (1 + 0.08 * state.depth) * (r.charge / BASE_CAP)));
});


/** Field dimensions for an expansion level: 6x6 -> 7x6 -> 7x7 -> ... */
export function fieldDims(expandLevel: number): { w: number; h: number } {
  return {
    w: 6 + Math.ceil(expandLevel / 2),
    h: 6 + Math.floor(expandLevel / 2),
  };
}

/** Resize the face after buying expansion. New cells spawn full — a reward. */
export function applyFieldSize(state: GameState, mods: ModifierCache): void {
  // ONE CELL (challenge): the face is a single cell and cannot be widened.
  // Width was never income — regen was — and this is where that gets proved.
  if (sealed(state, 'sealWiden')) return;
  const { w, h } = fieldDims(stat(state, 'expand'));
  if (w === state.face.w && h === state.face.h) return;
  const cap = cellCap(state, mods);
  const next: number[] = new Array(w * h).fill(cap);
  // ORES AND THEIR DIGS MOVE WITH THE ROCK. Widening the face used to wipe
  // every pocket and abandon every dig in progress: `applyFieldSize` rebuilt
  // `cells` and left `ore` at the old length, so the next read saw a mismatch
  // and replaced the whole array with empties. Buying an upgrade destroyed the
  // contents of the grid, which is about as bad as a purchase can be.
  //
  // The remap is by COORDINATE, not by index — a wider grid renumbers every
  // row, so copying the array straight across would slide every pocket.
  const oldOre = state.face.ore;
  const oldDug = state.face.oreDug;
  const nextOre: string[] = new Array(w * h).fill('');
  const nextDug: number[] = new Array(w * h).fill(0);
  /** Old index -> new index, for anything holding a cell reference. */
  const remap = new Map<number, number>();
  // Preserve existing charges in the overlapping region.
  for (let y = 0; y < Math.min(h, state.face.h); y++) {
    for (let x = 0; x < Math.min(w, state.face.w); x++) {
      const from = y * state.face.w + x;
      const to = y * w + x;
      next[to] = state.face.cells[from] ?? cap;
      nextOre[to] = oldOre?.[from] ?? '';
      nextDug[to] = oldDug?.[from] ?? 0;
      remap.set(from, to);
    }
  }
  // A drill mid-dig keeps its pocket across the resize. If its cell fell
  // outside the new grid (only possible if the face ever shrinks) it lets go,
  // which is the one case where there is genuinely nothing to stay on.
  for (const drill of state.drills.units) {
    // A PAINTED ZONE MOVES WITH THE ROCK, for the identical reason the pockets
    // do: a wider grid renumbers every row, so keeping the indices would slide
    // a player's hand-painted region sideways one cell per row. Same remap,
    // same coordinate basis. Cells that fell off a shrinking grid are dropped;
    // if that empties the zone, the drill goes back to working everywhere
    // rather than standing idle over nothing.
    if (drill.zone && drill.zone.length > 0) {
      const moved = drill.zone.map((c) => remap.get(c)).filter((c): c is number => c !== undefined);
      if (moved.length === 0) delete drill.zone;
      else drill.zone = moved.sort((a, b) => a - b);
    }
    if (drill.oreCell === undefined) continue;
    const to = remap.get(drill.oreCell);
    if (to === undefined) {
      delete drill.oreCell;
      delete drill.oreProgress;
    } else {
      drill.oreCell = to;
      drill.lastCell = to;
    }
  }
  state.face.w = w;
  state.face.h = h;
  state.face.cells = next;
  state.face.ore = nextOre;
  state.face.oreDug = nextDug;
  // COMPACTION MOVES WITH THE ROCK, by the same coordinate remap and for the
  // same reason as the pockets: a wider grid renumbers every row, so an index
  // copy would slide the whole board sideways one cell per row and a player's
  // worked seam would land somewhere they never touched.
  remapCompaction(state, w, h, remap);
}
