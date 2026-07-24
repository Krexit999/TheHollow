/**
 * SALVAGE — the exit path fifteen tiers of tools never had.
 *
 * Before this, a tool you outgrew sat in the list forever. There was
 * `discardTool`, which destroyed it and gave back nothing; nobody used it,
 * because throwing a Tier IX pick in the bin is not a decision, it is a loss.
 *
 * Salvage breaks a tool back into materials at a real loss, and — the part that
 * makes it a decision — you choose whether to pay to EXTRACT the runes and gems
 * first. Extraction costs Brick and gives back the sockets' contents; skipping
 * it gets you more raw material and loses whatever was set into it.
 *
 * NO TREADMILL: salvage is always progress. The tool you fed in was already
 * dead inventory, so the exchange rate does not need to be generous to be
 * worth taking — and a salvaged tool's materials are the input to the NEXT
 * tool, which is the loop the Forge never closed.
 *
 * PILLAR 2: this produces materials, never currency, never income. Salvaging
 * your entire armoury cannot raise the field ceiling by a single point.
 */
import { D } from '../decimal';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { spendCurrency } from '../resources';
import { convCurrencyId } from '../shells';
import { addMaterial, recipeById } from './forge';

/** Share of a recipe's inputs that come back. The rest is residue. */
export const SALVAGE_RETURN = 0.5;
/** Extraction fee, in the shell's converter currency, per socket recovered. */
export const EXTRACT_FEE = 40;
/** Residue material — salvage always leaves something, never a pure sink. */
export const SALVAGE_RESIDUE = 'salvagedust';

export interface SalvagePreview {
  /** materialId -> units returned. */
  returns: Record<string, number>;
  /** materialId -> purity the returned units come back at. */
  returnPurity: Record<string, number>;
  residue: number;
  /** Runes and gems that would be recovered if you pay. */
  recoverable: { gems: string[]; runes: string[] };
  fee: number;
}

export function salvagePreview(state: GameState, toolId: number): SalvagePreview | null {
  const tool = state.forge.tools.find((t) => t.id === toolId);
  if (!tool) return null;

  const returns: Record<string, number> = {};
  const returnPurity: Record<string, number> = {};
  let residue = 0;
  if (tool.parts) {
    // The Phase 17 payoff, and DETERMINISTIC so the preview is honest: the HEAD
    // is spent — it met the rock and took the wear — and comes back as dust.
    // The HAFT and BINDING survive whole, each at its own purity. You lose one
    // part of three, which is the "at a loss" the brief asked for, and you
    // recover the two you probably chose more carefully.
    residue += 1; // the head, ground down
    for (const slot of ['haft', 'binding'] as const) {
      const part = tool.parts[slot];
      returns[part.materialId] = (returns[part.materialId] ?? 0) + 1;
      returnPurity[part.materialId] = Math.max(returnPurity[part.materialId] ?? 0, part.purity);
    }
  } else {
    // A legacy tool with no composition (pre-v15, unmigrated) falls back to the
    // recipe. The STARTER tool ('delversPick') has no parts AND no craftable
    // recipe, so this must NOT throw — a throw here unmounts the whole React
    // root (the Refinery/Salvage black-screen crash). A tool with no resolvable
    // recipe simply cannot be broken down: return null so callers skip it.
    const recipe = recipeById(tool.recipeId);
    if (!recipe) return null;
    for (const [matId, count] of Object.entries(recipe.inputs)) {
      const back = Math.floor(count * SALVAGE_RETURN);
      if (back > 0) { returns[matId] = back; returnPurity[matId] = tool.purity; }
      residue += count - back;
    }
  }

  const gems = tool.sockets.filter((g): g is string => g !== null);
  const runes = (state.runes.inscriptions[`tool:${tool.id}`] ?? [])
    .filter((r): r is string => r !== null);

  return {
    returns,
    returnPurity,
    residue,
    recoverable: { gems, runes },
    fee: (gems.length + runes.length) * EXTRACT_FEE,
  };
}

/**
 * BULK SALVAGE (v22) — the exit fifteen tiers of dead inventory needed. Breaks down
 * many tools in one act (never the equipped one, never the last). `extract` pays the
 * per-socket fee to keep runes and gems, exactly as the single salvage does; without
 * it you take more raw material and lose the settings. Skips anything it cannot
 * salvage rather than failing the whole batch.
 */
export function bulkSalvage(
  state: GameState,
  ctx: EngineCtx,
  toolIds: number[],
  extract: boolean,
): ActionResult {
  let done = 0;
  let units = 0;
  // Snapshot the ids: salvaging mutates the tools array as we go.
  for (const id of [...toolIds]) {
    if (id === state.forge.equipped) continue;
    if (state.forge.tools.length <= 1) break;
    const r = salvageTool(state, ctx, id, extract);
    if (r.ok) { done += 1; units += (r.data as { units: number }).units ?? 0; }
  }
  if (done === 0) return { ok: false, reason: 'Nothing there to break down' };
  ctx.emit({ type: 'bulkSalvaged', count: done, units });
  return { ok: true, data: { count: done, units } };
}

export function salvageTool(
  state: GameState,
  ctx: EngineCtx,
  toolId: number,
  extract: boolean,
): ActionResult {
  const tool = state.forge.tools.find((t) => t.id === toolId);
  if (!tool) return { ok: false, reason: 'No such tool' };
  if (state.forge.tools.length <= 1) {
    return { ok: false, reason: 'It is the only tool you have. You would be down there with your hands.' };
  }
  if (tool.id === state.forge.equipped) {
    return { ok: false, reason: 'Not the one in your hands. Put something else on first.' };
  }
  const preview = salvagePreview(state, toolId);
  if (!preview) return { ok: false, reason: 'Nothing to break down' };

  if (extract) {
    if (preview.fee > 0 && !spendCurrency(state, convCurrencyId(state), D(preview.fee))) {
      return { ok: false, reason: `${preview.fee} to draw the settings out intact` };
    }
    // Gems come back to the pile; runes come back to the rune bank.
    for (const gemId of preview.recoverable.gems) {
      state.materials.gems[gemId] = (state.materials.gems[gemId] ?? 0) + 1;
    }
    for (const runeId of preview.recoverable.runes) {
      state.runes.found[runeId] = (state.runes.found[runeId] ?? 0) + 1;
    }
  }

  // Each returned material comes back at ITS OWN part's purity — a fine haft
  // salvages fine, even off a tool whose head was filthy.
  for (const [matId, units] of Object.entries(preview.returns)) {
    addMaterial(state, matId, Math.max(1, Math.round(preview.returnPurity[matId] ?? tool.purity)), units);
  }
  if (preview.residue > 0) addMaterial(state, SALVAGE_RESIDUE, 5, preview.residue);

  // The tool, and anything still set into it, is gone.
  state.forge.tools = state.forge.tools.filter((t) => t.id !== toolId);
  delete state.runes.inscriptions[`tool:${toolId}`];
  state.forge.salvaged += 1;

  const units = Object.values(preview.returns).reduce((a, b) => a + b, 0);
  ctx.emit({ type: 'salvaged', toolName: tool.name, units });
  ctx.dirty();
  return {
    ok: true,
    data: { units, residue: preview.residue, extracted: extract },
  };
}
