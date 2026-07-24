/**
 * THE EXPORT SPINE (Part B, A.39) — one thing per shell that the NEXT shell's
 * signature infrastructure refuses to run without.
 *
 * The Part A audit's verdict was that the shells are reskins because nothing
 * needs anything else: every system pays into the same modifier pool and no
 * shell's output is another shell's input. This registry is the fix. Each
 * shell EXPORTS one worked material, made by its own craft system, and each
 * shell's flagship infrastructure CONSUMES the export of the shell before it:
 *
 *   Loam      Kilnflux    (Refinery chain)      → Ferrite Crucible pours
 *   Ferrite   Lodeframe   (cast at the Crucible) → Verdance plots 5+, Loom frame
 *   Verdance  Set Resin   (rendered at the Still),
 *             Fibercloth  (every committed weave) → Glassmere mirrors 5+, exposures
 *   Glassmere Ground Lens + Glasseal (the Bench) → Cinder Array rows 2+, pipes 13+
 *   Cinder    Emberglass  (Array anneal)          → Hollow rebuilds 9+, the Chamber
 *   Hollow    Resonance   (already a currency)    → Aleph Axiom writing
 *
 * THE CURRICULUM LAW HOLDS BY CONSTRUCTION: every consumer's requirement
 * begins no earlier than its producer becomes available (the Crucible's flux
 * bill starts exactly when transmutation unlocks), and Serra's export shelf
 * (guild.ts) sells every export of a shell you have already left — the road
 * runs up as well as down, so the spine can gate but never softlock.
 *
 * Exports are MATERIALS (`worked: true`): they ride the Hold, survive Breach,
 * and never appear in a drop table. Production for the four bench-made ones
 * runs through the single `produceExport` action below; Kilnflux is a
 * Refinery chain, Fibercloth falls out of every committed weave, Emberglass
 * anneals out of a sustained burn, and Resonance was always a currency.
 */
import { D } from '../decimal';
import type { ActionResult, GameState } from '../types';
import { getCurrency, spendCurrency } from '../resources';
import { addMaterial } from '../systems/forge';
import { crucibleUnlocked } from './shell2/crucibleSystem';
import { brewingUnlocked } from './shell3/brews';
import { benchUnlocked } from './shell4/bench';

export interface ShellExport {
  shellId: string;
  /** The exported material id, or null for the Hollow (Resonance, a currency). */
  materialId: string | null;
  currencyId?: string;
  /** Where it is made, named for the UI ("refine it in Loam…"). */
  producedBy: string;
  /** What demands it, named for the UI. */
  consumedBy: string;
}

/** Ordered loam → hollow; aleph consumes and exports nothing (it ends). */
export const SHELL_EXPORTS: ShellExport[] = [
  { shellId: 'loam', materialId: 'kilnflux', producedBy: 'the Refinery (The Kiln Firing)', consumedBy: 'every Crucible pour in Ferrite' },
  { shellId: 'ferrite', materialId: 'lodeframe', producedBy: 'the Crucible (cast)', consumedBy: 'Greenhouse plots past four and the Loom\'s iron frame' },
  { shellId: 'verdance', materialId: 'setresin', producedBy: 'the Still (render)', consumedBy: 'every mirror past the fourth' },
  { shellId: 'verdance', materialId: 'fibercloth', producedBy: 'the Loom (every committed weave)', consumedBy: 'Observatory exposures past a glance' },
  { shellId: 'glassmere', materialId: 'groundlens', producedBy: 'the Bench (grind)', consumedBy: 'Ember Array rows past the first' },
  { shellId: 'glassmere', materialId: 'glasseal', producedBy: 'the Bench (cast)', consumedBy: 'vent pipes past the twelfth' },
  { shellId: 'cinder', materialId: 'emberglass', producedBy: 'the Ember Array (90s held in the band)', consumedBy: 'Hollow rebuilds past eight and arming the Echo Chamber' },
  { shellId: 'hollow', materialId: null, currencyId: 'resonance', producedBy: 'listening in the Hollow', consumedBy: 'writing an Axiom' },
];

export const EXPORT_BY_MATERIAL = new Map(
  SHELL_EXPORTS.filter((e) => e.materialId).map((e) => [e.materialId!, e]),
);

export function exportsOfShell(shellId: string): ShellExport[] {
  return SHELL_EXPORTS.filter((e) => e.shellId === shellId);
}

// ---------------------------------------------------------------------------
// Production — the four exports made at a bench by spending shell currency.
// ---------------------------------------------------------------------------

export interface ExportRecipe {
  materialId: string;
  costs: Array<{ currencyId: string; amount: number }>;
  /** Made per production run. */
  yieldCount: number;
  unlocked: (state: GameState) => boolean;
  lockedReason: string;
}

export const EXPORT_RECIPES: ExportRecipe[] = [
  {
    materialId: 'lodeframe',
    costs: [{ currencyId: 'scale', amount: 60 }, { currencyId: 'lodestone', amount: 60 }],
    yieldCount: 1,
    unlocked: crucibleUnlocked,
    lockedReason: 'The Crucible is cold',
  },
  {
    materialId: 'setresin',
    costs: [{ currencyId: 'sap', amount: 150 }, { currencyId: 'resin', amount: 60 }],
    yieldCount: 1,
    unlocked: brewingUnlocked,
    lockedReason: 'The still wants Verdance Mastery 6',
  },
  {
    materialId: 'groundlens',
    costs: [{ currencyId: 'silica', amount: 90 }, { currencyId: 'prism', amount: 45 }],
    yieldCount: 1,
    unlocked: benchUnlocked,
    lockedReason: 'The Bench is not yours yet',
  },
  {
    materialId: 'glasseal',
    costs: [{ currencyId: 'silica', amount: 70 }, { currencyId: 'rime', amount: 30 }],
    yieldCount: 1,
    unlocked: benchUnlocked,
    lockedReason: 'The Bench is not yours yet',
  },
];

export const EXPORT_RECIPE_BY_ID = new Map(EXPORT_RECIPES.map((r) => [r.materialId, r]));

/** Purity of a bench-made export: consistent, unremarkable, honest work. */
export const EXPORT_PURITY = 70;

export function produceExport(state: GameState, materialId: string): ActionResult {
  const recipe = EXPORT_RECIPE_BY_ID.get(materialId);
  if (!recipe) return { ok: false, reason: 'Nothing makes that' };
  if (!recipe.unlocked(state)) return { ok: false, reason: recipe.lockedReason };
  for (const c of recipe.costs) {
    if (getCurrency(state, c.currencyId).lt(c.amount)) {
      return { ok: false, reason: `Wants ${recipe.costs.map((k) => `${k.amount} ${k.currencyId}`).join(' + ')}` };
    }
  }
  for (const c of recipe.costs) spendCurrency(state, c.currencyId, D(c.amount));
  addMaterial(state, materialId, EXPORT_PURITY, recipe.yieldCount);
  return { ok: true, data: { materialId, count: recipe.yieldCount } };
}
