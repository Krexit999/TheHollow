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
import { rollForEncounter } from '../combat/combat';
import { chipCurrencyId, currentShell } from '../shells';
import { activeSignatures, registerSignature, runChipMult } from '../signatures';
import { registerTechnique } from '../techniques';
import { masteryLevel } from './mastery';
import { lawNum, sealed, challengeNum } from '../laws';

export const BASE_CAP = 8;
export const BASE_REGEN = 0.08;

// SWEEP STAMINA (v20). The one new tracked value, scoped to the sweep gesture.
// It regenerates fast (full in ~20s), never gates ordinary chipping, and an idle
// player is entirely unaffected — stamina just sits full while you idle.
export const STAMINA_REGEN = 5; // per second
export const SWEEP_COST_PER_CELL = 6; // ~16 cells per full bar

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
 * SKIM — Loam's TECHNIQUE (the verb-per-signature layer). While seepage runs,
 * a pool banks EXTRA seep — half the leak's rate again — up to a tenth of the
 * face's full storage. Skimming collects the pool by hand. The idle leak is
 * UNTOUCHED: a player who never skims earns exactly what they always did
 * (folds.test asserts this equivalence); the pool cap self-paces the verb.
 */
export const SKIM_POOL_RATIO = 0.5;
export const SKIM_POOL_CAP_FRACTION = 0.1;

export function skimPoolCap(state: GameState, mods: ModifierCache): number {
  return state.face.w * state.face.h * cellCap(state, mods) * SKIM_POOL_CAP_FRACTION;
}

/** The current seep strength: native 1, carried 0.4×memory, else 0. */
export function seepStrength(state: GameState): number {
  for (const sig of activeSignatures(state)) {
    if (sig.def.id === 'seepage') return sig.strength;
  }
  return 0;
}

/** Refill cells from below; with Seepage active, full cells leak. */
export function tickFace(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number): void {
  const cap = cellCap(state, mods);
  const regen = cellRegen(state, mods) * dt;
  const cells = state.face.cells;
  // THE HOLLOW: there is no rock. Only RECONSTRUCTED cells regen — each is a
  // real cell with the real ceiling (pillar 2 binds cell by rebuilt cell).
  const rebuilt = currentShell(state).id === 'hollow' ? new Set(state.hollow.rebuilt) : null;
  let overflow = 0;
  for (let i = 0; i < cells.length; i++) {
    if (rebuilt && !rebuilt.has(i)) continue; // absence does not regenerate
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
      // Seepage is harvest: it rolls drops (and, faintly, encounters) like
      // any harvest — this is what lets a fully idle player forge past the
      // hardness walls instead of deadlocking at them (pillar 1).
      rollForDrop(state, mods, ctx, collected, 1);
      rollForEncounter(state, ctx, collected, 0.5);
      // SKIM's pool banks on top — the leak above is byte-for-byte unchanged.
      state.face.seepPool = Math.min(
        skimPoolCap(state, mods),
        state.face.seepPool + collected * SKIM_POOL_RATIO,
      );
    }
  }

  // Sweep stamina regenerates toward full. It gates nothing an idle player needs
  // (ordinary chipping ignores it), so filling offline is a pure convenience.
  if (state.face.stamina < state.face.staminaMax) {
    state.face.stamina = Math.min(state.face.staminaMax, state.face.stamina + STAMINA_REGEN * dt);
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
  registerTechnique({
    id: 'skim',
    signatureId: 'seepage',
    name: 'Skim',
    verb: 'Skim the pool',
    flavor: 'The loam gives more than the channels catch. Cup your hands.',
    describe: (_s, strength) => {
      const pct = Math.round(SKIM_POOL_RATIO * 100);
      return `Seepage banks an extra ${pct}% of its leak into a pool (at ×${strength.toFixed(2)} strength). Skimming collects it by hand — the idle leak itself is never touched.`;
    },
    cooldownSec: 0, // the pool cap self-paces the verb
    targeted: false,
    perform: (state, mods, ctx, _strength) => {
      const pool = state.face.seepPool;
      if (pool < 1) return { ok: false, reason: 'Nothing worth cupping yet' };
      state.face.seepPool = 0;
      const paid = chipYield(state, mods).mul(pool);
      addCurrency(state, chipCurrencyId(state), paid);
      // A skim is harvest, like the leak it rides on.
      rollForDrop(state, mods, ctx, pool, 1);
      ctx.emit({ type: 'skimmed', charge: pool, paid });
      return { ok: true, data: { charge: pool, paid } };
    },
  });
}

export interface ChipResult {
  dust: Decimal;
  charge: number;
  crit: boolean;
  /** Cells splashed by Fault Lines. */
  fractured: number[];
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
  // cell ever goes dark under the law.
  const floor = cellCap(state, mods) * lawNum(state, 'regenFloorShare');
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
 * A manual chip: takes the cell's full charge, may crit (Heavy Hands skill),
 * may fracture into neighbors (Fault Lines core node). Grants XP.
 */
export function manualChip(state: GameState, mods: ModifierCache, ctx: EngineCtx, cell: number): ChipResult {
  if (cell < 0 || cell >= state.face.cells.length) {
    return { dust: D(0), charge: 0, crit: false, fractured: [] };
  }

  // Heavy Hands: +10% crit chance per rank, crits chip for 3x.
  const critChance = 0.1 * skillRank(state, 'heavyHands');
  const crit = Math.random() < critChance;
  // Signature mechanics (polarity chains, carried growth...) compose here.
  const sigMult = runChipMult(state, mods, ctx, cell, true);
  const mult = D(sigMult).mul(crit ? 3 : 1);

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

  state.stats.manualChips += 1;
  // XP scales with charge harvested and depth — see chipXP in DESIGN appendix.
  grantXP(state, mods, ctx, D(0.7 * (1 + 0.08 * state.depth) * (charge / BASE_CAP)));
  rollForDrop(state, mods, ctx, charge, 1);
  rollForEncounter(state, ctx, charge, 1);
  // FIGURES (v20): a chip that completes a traced shape pays a ceiling-free bonus
  // (XP + a drop roll + stamina) and records the figure in the Codex. Never Dust.
  recordChipForFigures(state, mods, ctx, cell);
  // AFFINITY (v21): the equipped tool learns the shell it works — a small capped
  // bonus through the modifier pipeline (dropRate), never dustYield (pillar 2).
  logImplementUse(equippedTool(state), currentShell(state).id, 1);
  ctx.emit({ type: 'chip', cell, dust: totalDust, charge, crit, manual: true });
  return { dust: totalDust, charge, crit, fractured };
}

/**
 * THE SWEEP (v20). A drag chips a swathe of cells at once for stamina. It is
 * pure ERGONOMICS — each cell is harvested exactly as a manual chip would harvest
 * it (regen-bound charge, same yield), so the sweep can never take more than the
 * field produced (pillar 2). Stamina caps how MANY cells one gesture clears, never
 * the throughput; a player with no stamina still chips normally, one cell a tap.
 * Returns what was cleared.
 */
export function sweep(state: GameState, mods: ModifierCache, ctx: EngineCtx, cells: number[]): { dust: Decimal; swept: number[] } {
  let dust = D(0);
  const swept: number[] = [];
  const affordable = Math.floor(state.face.stamina / SWEEP_COST_PER_CELL);
  const seen = new Set<number>();
  for (const cell of cells) {
    if (swept.length >= affordable) break;
    if (cell < 0 || cell >= state.face.cells.length || seen.has(cell)) continue;
    seen.add(cell);
    // A cultivated (vined) cell is left for its own harvest, like the drills do.
    if ((state.growth.stage[cell] ?? 0) > 0) continue;
    const before = state.face.cells[cell] ?? 0;
    const sigMult = runChipMult(state, mods, ctx, cell, true);
    const r = harvestCell(state, mods, cell, 1, D(sigMult));
    if (r.charge <= 0) continue;
    dust = dust.add(r.dust);
    swept.push(cell);
    void before;
  }
  if (swept.length > 0) {
    state.face.stamina = Math.max(0, state.face.stamina - swept.length * SWEEP_COST_PER_CELL);
    state.stats.manualChips += swept.length;
    grantXP(state, mods, ctx, D(0.5 * swept.length * (1 + 0.08 * state.depth)));
    rollForDrop(state, mods, ctx, swept.length * 2, 1);
    ctx.emit({ type: 'chip', cell: swept[swept.length - 1]!, dust, charge: swept.length, crit: false, manual: true });
  }
  return { dust, swept };
}

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
  // Preserve existing charges in the overlapping region.
  for (let y = 0; y < Math.min(h, state.face.h); y++) {
    for (let x = 0; x < Math.min(w, state.face.w); x++) {
      next[y * w + x] = state.face.cells[y * state.face.w + x] ?? cap;
    }
  }
  state.face.w = w;
  state.face.h = h;
  state.face.cells = next;
}
