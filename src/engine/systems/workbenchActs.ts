/**
 * THE WORKBENCH — action layer. Begins a craft, advances it a stage at a time,
 * and applies the outcome. One set of actions for all four acts; the outcome
 * appliers reach into the Forge, the runes and the gems as needed.
 *
 * The invariant that makes RULE 3 true — failure costs material, never the item
 * — lives here: nothing is consumed until FINISH, and every act's finish
 * produces its piece even at low quality. A carve that goes badly consumes its
 * runes and fouls the surface; the tool is never touched.
 */
import { D } from '../decimal';
import type { ActionResult, EngineCtx, GameState } from '../types';
import {
  ACT_STAGES, CRAFT_ACTS, craftsmanship, currentStage, delegateQuality,
  jobComplete, jobQuality, type CraftAct, type CraftJob, type GemLean,
} from './workbench';
import { craftFromParts, materialCount, consumeMaterial } from './forge';
import { materialDef } from '../materials';
import { inscribe, grantRune, RUNES, type RuneId } from '../content/shell4/runes';
import { GEMS } from '../materials';
import { traitsOf } from '../traits';
import type { ModifierCache } from '../modifiers';

const CARVE_FAIL_BELOW = 0.4; // below this quality the carve does not take

/** Which NPC delegates each act, and their standing 0..1. */
export const ACT_DELEGATE: Record<CraftAct, string> = {
  forge: 'marrow', carve: 'quill', cut: 'ilma', cast: 'ossian',
};
function repOf(state: GameState, npcId: string): number {
  const rep = state.guild.npcs[npcId]?.rep ?? 0;
  return Math.max(0, Math.min(1, rep / 250)); // REP_TIERS tops at 250
}

// ---------------------------------------------------------------------------
// The process — begin, stage, delegate, finish, abandon
// ---------------------------------------------------------------------------

export function beginCraft(
  state: GameState,
  ctx: EngineCtx,
  act: CraftAct,
  context: Record<string, unknown>,
): ActionResult {
  if (!CRAFT_ACTS.includes(act)) return { ok: false, reason: 'No such craft' };
  if (state.workbench.job) return { ok: false, reason: 'A piece is already on the bench' };
  const check = validateInputs(state, act, context);
  if (!check.ok) return check;
  state.workbench.job = { act, context, results: [], delegated: false };
  ctx.dirty();
  return { ok: true, data: { stage: currentStage(state.workbench.job) } };
}

/**
 * Record one stage's EXECUTION (0..1, produced by the UI's tactile interaction)
 * and advance. Optional `data` merges act-specific choices into the context —
 * a cut's lean, a cast's proportions. When the last stage lands, the piece is
 * produced automatically.
 */
export function craftStage(
  state: GameState,
  mods: ModifierCache,
  ctx: EngineCtx,
  execution: number,
  data?: Record<string, unknown>,
): ActionResult {
  const job = state.workbench.job;
  if (!job) return { ok: false, reason: 'Nothing on the bench' };
  if (jobComplete(job)) return { ok: false, reason: 'The work is done — set it or take it' };
  if (data) job.context = { ...job.context, ...data };
  job.results.push(Math.max(0, Math.min(1, execution)));
  ctx.dirty();
  if (jobComplete(job)) return finishCraft(state, mods, ctx);
  return { ok: true, data: { stage: currentStage(job), quality: jobQuality(job) } };
}

/** Hand the whole job to the NPC delegate. Safe, guaranteed, slightly worse,
 * and better if you are on good terms with them. */
export function delegateCraft(state: GameState, mods: ModifierCache, ctx: EngineCtx): ActionResult {
  const job = state.workbench.job;
  if (!job) return { ok: false, reason: 'Nothing on the bench' };
  const q = delegateQuality(repOf(state, ACT_DELEGATE[job.act]));
  job.results = ACT_STAGES[job.act].map(() => q);
  job.delegated = true;
  ctx.dirty();
  return finishCraft(state, mods, ctx);
}

export function abandonCraft(state: GameState, ctx: EngineCtx): ActionResult {
  if (!state.workbench.job) return { ok: false, reason: 'Nothing to set down' };
  // Nothing was consumed — abandoning is free. That is the whole point of
  // consuming only at finish.
  state.workbench.job = null;
  ctx.dirty();
  return { ok: true };
}

function finishCraft(state: GameState, mods: ModifierCache, ctx: EngineCtx): ActionResult {
  const job = state.workbench.job!;
  const quality = jobQuality(job);
  let result: ActionResult;
  switch (job.act) {
    case 'forge': result = finishForge(state, mods, ctx, job, quality); break;
    case 'carve': result = finishCarve(state, ctx, job, quality); break;
    case 'cut': result = finishCut(state, ctx, job, quality); break;
    case 'cast': result = finishCast(state, ctx, job, quality); break;
  }
  if (result.ok && !job.delegated) {
    state.workbench.done[job.act] += 1;
    state.workbench.bestQuality[job.act] = Math.max(state.workbench.bestQuality[job.act], quality);
  }
  state.workbench.job = null;
  ctx.emit({ type: 'craftFinished', act: job.act, quality: Math.round(quality * 100), delegated: job.delegated });
  ctx.dirty();
  return result;
}

// ---------------------------------------------------------------------------
// Input validation — so beginCraft can refuse before any stage is played
// ---------------------------------------------------------------------------

function validateInputs(state: GameState, act: CraftAct, ctx: Record<string, unknown>): ActionResult {
  if (act === 'forge') {
    for (const slot of ['head', 'haft', 'binding'] as const) {
      const id = ctx[slot] as string;
      if (!id || materialCount(state, id) < 1) return { ok: false, reason: `Short of ${id ? materialDef(id).name : 'a ' + slot}` };
    }
    return { ok: true };
  }
  if (act === 'carve') {
    const seq = (ctx['sequence'] as (RuneId | null)[]) ?? [];
    if (!seq.some((r) => r)) return { ok: false, reason: 'No runes chosen' };
    return { ok: true };
  }
  if (act === 'cut') {
    const gemId = ctx['gemId'] as string;
    if (!gemId || (state.materials.gems[gemId] ?? 0) < 1) return { ok: false, reason: 'No such gem held' };
    return { ok: true };
  }
  if (act === 'cast') {
    const inputs = (ctx['inputs'] as string[]) ?? [];
    if (inputs.length < 2) return { ok: false, reason: 'Casting wants at least two materials' };
    for (const id of inputs) if (materialCount(state, id) < 1) return { ok: false, reason: `Short of ${materialDef(id).name}` };
    return { ok: true };
  }
  return { ok: false, reason: 'No such craft' };
}

// ---------------------------------------------------------------------------
// FORGE — heat / shape / set, producing a tool at earned craftsmanship
// ---------------------------------------------------------------------------

function finishForge(state: GameState, mods: ModifierCache, ctx: EngineCtx, job: CraftJob, quality: number): ActionResult {
  const c = job.context;
  return craftFromParts(
    state, mods, ctx,
    c['tier'] as number, c['head'] as string, c['haft'] as string, c['binding'] as string,
    craftsmanship(quality),
  );
}

// ---------------------------------------------------------------------------
// CARVE — steady / stroke, inscribing a rune. Botch consumes prep, keeps tool.
// ---------------------------------------------------------------------------

function finishCarve(state: GameState, ctx: EngineCtx, job: CraftJob, quality: number): ActionResult {
  const c = job.context;
  const target = c['target'] as 'tool' | 'offhand' | 'lantern' | 'harness' | 'boots';
  const sequence = c['sequence'] as (RuneId | null)[];

  if (quality < CARVE_FAIL_BELOW) {
    // A shaking hand. The runes are spent and the surface fouled — the tool is
    // untouched. This is the softened-rune ruling: ruin the work, keep the piece.
    const used: Record<string, number> = {};
    for (const r of sequence) if (r) used[r] = (used[r] ?? 0) + 1;
    for (const [r, n] of Object.entries(used)) {
      if ((state.runes.found[r] ?? 0) >= n) state.runes.found[r]! -= n;
    }
    state.runes.fouled[target] = true;
    ctx.emit({ type: 'carveBotched', target });
    return { ok: true, data: { botched: true, quality } };
  }

  // A clean-enough carve. The inscription takes; a very clean one is recorded
  // as the bench's best and the pairs read a touch stronger (handled by the
  // craftsmanship the runes layer reads from bestQuality if it wishes).
  const r = inscribe(state, ctx, target, sequence);
  return { ...r, data: { ...(r.data as object), quality, clean: quality > 0.8 } };
}

// ---------------------------------------------------------------------------
// CUT — read / cleave, giving a gem TYPE a cut and a lean
// ---------------------------------------------------------------------------

export const GEM_LEANS: GemLean[] = ['mine', 'fight', 'balanced'];

function finishCut(state: GameState, ctx: EngineCtx, job: CraftJob, quality: number): ActionResult {
  const gemId = job.context['gemId'] as string;
  const lean = (job.context['lean'] as GemLean) ?? 'balanced';
  if ((state.materials.gems[gemId] ?? 0) < 1) return { ok: false, reason: 'No such gem held' };

  // The gem is spent as practice stock, whatever the outcome — failure costs
  // material. What you keep is the SKILL: a better cut for this gem type.
  state.materials.gems[gemId] = (state.materials.gems[gemId] ?? 0) - 1;

  const prev = state.workbench.gemCuts[gemId];
  if (!prev || quality > prev.quality || prev.lean !== lean) {
    // Keep the best cut per lean is overkill; keep the best quality, and let a
    // fresh lean overwrite — you re-learn the stone for the new purpose.
    if (!prev || quality >= prev.quality) {
      state.workbench.gemCuts[gemId] = { lean, quality };
    }
  }
  ctx.emit({ type: 'gemCut', gemId, lean, quality: Math.round(quality * 100) });
  return { ok: true, data: { gemId, lean, quality } };
}

// ---------------------------------------------------------------------------
// CAST — mix / pour, casting a RUNE from material traits (the trait-only act)
// ---------------------------------------------------------------------------

/**
 * The cast recipes. Each maps an input TRAIT SIGNATURE to a rune. This is the
 * discovery the brief calls out as only possible once traits shipped: what you
 * mix decides what you cast, and you find the mappings by trying. PILLAR 5: the
 * Compendium says casting exists and never lists a mapping.
 */
export const CAST_RECIPES: Array<{ id: string; needs: string[]; rune: RuneId; name: string; flavor: string }> = [
  { id: 'castKel', needs: ['keen', 'trueseated'], rune: 'kel', name: 'The Struck Note', flavor: 'A keen edge held true rings a clean note. It casts as Kel.' },
  { id: 'castThur', needs: ['dense', 'tough'], rune: 'thur', name: 'The Anvil Cast', flavor: 'Heavy and unbreakable, poured slow. Thur comes out of the mould.' },
  { id: 'castAsh', needs: ['warm', 'charged'], rune: 'ash', name: 'The Live Coal', flavor: 'Warmth and charge together spit sparks. Ash, every time.' },
  { id: 'castVey', needs: ['light', 'springy'], rune: 'vey', name: 'The Quick Pour', flavor: 'Light and springy runs fast and sets faster. Vey.' },
  { id: 'castMol', needs: ['hollow', 'charged'], rune: 'mol', name: 'The Ringing Mould', flavor: 'A charged hollow hums as it cools. Mol.' },
  { id: 'castSen', needs: ['brittle', 'keen'], rune: 'sen', name: 'The Fine Fracture', flavor: 'Brittle and keen: a rune that is all edge and no patience. Sen.' },
  { id: 'castUr', needs: ['dense', 'warm'], rune: 'ur', name: 'The Deep Heat', flavor: 'Heavy and warm, from the floor of the shaft. Ur.' },
  { id: 'castNix', needs: ['hollow', 'trueseated'], rune: 'nix', name: 'The Held Nothing', flavor: 'A hollow that holds true is a contradiction that casts as Nix.' },
];

/** The recipe whose needs are all present in the input traits, best match first. */
export function matchCast(inputTraits: string[]): (typeof CAST_RECIPES)[number] | undefined {
  const set = new Set(inputTraits);
  // Prefer the recipe needing the most traits that are all satisfied — a
  // richer mix is a more specific cast.
  return [...CAST_RECIPES]
    .filter((r) => r.needs.every((t) => set.has(t)))
    .sort((a, b) => b.needs.length - a.needs.length)[0];
}

function finishCast(state: GameState, ctx: EngineCtx, job: CraftJob, quality: number): ActionResult {
  const inputs = (job.context['inputs'] as string[]) ?? [];
  // Consume the inputs — cast always spends its stock, hit or miss.
  for (const id of inputs) consumeMaterial(state, id, 1);
  state.currencies['silica'] = (state.currencies['silica'] ?? D(0)); // ensure key

  const traits = [...new Set(inputs.flatMap((id) => traitsOf(id)))];
  const recipe = matchCast(traits);
  if (!recipe) {
    // No shape emerged — slag, and a lesson. (Nothing granted; the inputs are
    // spent, the tool of the trade — the mould — is fine.)
    ctx.emit({ type: 'castMissed' });
    return { ok: true, data: { cast: null } };
  }
  // A clean pour yields two runes; a rough one, one. Never zero on a hit.
  const yield_ = quality >= 0.75 ? 2 : 1;
  grantRune(state, ctx, recipe.rune, yield_);
  // CAST vs FOUND (v22): remember how many of this rune came from the crucible, so
  // a cast rune is distinguishable from one the Warrens gave up.
  const kinds = (state.runes.castKinds ??= {});
  kinds[recipe.rune] = (kinds[recipe.rune] ?? 0) + yield_;
  const isNew = !state.workbench.castsFound.includes(recipe.id);
  if (isNew) {
    state.workbench.castsFound.push(recipe.id);
    ctx.emit({ type: 'castFound', id: recipe.id, name: recipe.name });
  }
  return { ok: true, data: { cast: recipe.id, rune: recipe.rune, yield: yield_, isNew } };
}

/** Every gem that can be cut (has both a mining and combat face to lean between). */
export function cuttableGems(): typeof GEMS {
  return GEMS;
}

// ---------------------------------------------------------------------------
// GEM FUSION (v22) — duplicates fuse upward into cut quality
// ---------------------------------------------------------------------------

/** Duplicates spent per fuse, and the ceiling fusion alone can reach. A clean
 *  HAND-cut still reaches 1.0, so grinding duplicates gives a serviceable cut but
 *  never replaces the skill — fusion is the exit for surplus, not a shortcut. */
export const FUSE_COST = 2;
export const FUSE_CAP = 0.7;

export function fuseGemsPreview(state: GameState, gemId: string): { from: number; to: number; cost: number } | null {
  if ((state.materials.gems[gemId] ?? 0) < FUSE_COST) return null;
  const cur = state.workbench.gemCuts[gemId]?.quality ?? 0;
  const next = Math.max(cur, cur + (FUSE_CAP - cur) * 0.4);
  return { from: cur, to: next, cost: FUSE_COST };
}

/**
 * Fuse duplicate gems of one TYPE into a better cut for that type. Non-destructive
 * (the cut quality never falls — it keeps the better), so a duplicate is always
 * progress. Diminishing toward FUSE_CAP; the lean is kept, or set balanced.
 * PILLAR 2: it raises a gem's cut quality, which modulates a gem effect already in
 * the modifier pipeline — no new income path.
 */
export function fuseGems(state: GameState, ctx: EngineCtx, gemId: string): ActionResult {
  if (!GEMS.some((g) => g.id === gemId)) return { ok: false, reason: 'No such gem' };
  const p = fuseGemsPreview(state, gemId);
  if (!p) return { ok: false, reason: `Two ${gemId} duplicates fuse into a better cut` };
  state.materials.gems[gemId] = (state.materials.gems[gemId] ?? 0) - FUSE_COST;
  const cur = state.workbench.gemCuts[gemId];
  state.workbench.gemCuts[gemId] = { lean: cur?.lean ?? 'balanced', quality: p.to };
  state.materials.gemFused = (state.materials.gemFused ?? 0) + 1;
  ctx.emit({ type: 'gemFused', gemId, quality: Math.round(p.to * 100) });
  ctx.dirty();
  return { ok: true, data: { gemId, quality: p.to } };
}

export { RUNES };
