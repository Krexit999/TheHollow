/**
 * THE REFINERY — everything between "material in the Hold" and "material worth
 * using." Two verbs, one bench.
 *
 * THE PROBLEM IT SOLVES, measured: 49 of the game's 132 materials had ZERO
 * consumers (`scripts/material-audit.ts`). They dropped, they stacked, and
 * nothing ever asked for them. Meanwhile purity was a number you received and
 * lived with — a bad roll was simply a worse stack forever, and the only
 * answer was to go and mine more of the same thing.
 *
 * REFINING fixes the second problem. Feed N units of a material in, get back
 * fewer units at a higher purity band. It is a real loss ratio, so it is a
 * decision and not a free upgrade — but it is ALWAYS progress, which is the
 * anti-treadmill rule this project has held since relic fusion: a bad roll
 * becomes material for a good one rather than a reason to farm again.
 *
 * TRANSMUTING fixes the first. Materials become a GRAPH rather than 132
 * independent buckets: a chain converts one material into another, within a
 * shell or across an adjacent one. That is also the honest answer to the
 * one-way stair — a shell you left is no longer unreachable, it is expensive.
 *
 * PILLAR 5: chains are DISCOVERED. Feeding two materials in and seeing what
 * comes out is the verb; the Codex records what you found. The Compendium
 * explains that transmutation exists and never lists a single chain.
 *
 * PILLAR 2: nothing here generates income. Refining strictly REDUCES the
 * number of units you hold, and transmuting converts one thing into another
 * at a loss. Neither touches the field.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { BANDS, BAND_RANGES, MATERIALS, materialDef, type PurityBand } from '../materials';
import { materialCount, consumeMaterial, addMaterial } from './forge';
import { masteryLevel } from './mastery';

// ---------------------------------------------------------------------------
// Refining — purity becomes workable
// ---------------------------------------------------------------------------

/** How many units go in per unit out. The loss IS the mechanic. */
export const REFINE_RATIO = 3;

/** The Refinery opens on Ferrite Mastery — it is a Ferrite-era bench. */
export const REFINERY_MASTERY = 3;

export function refineryUnlocked(state: GameState): boolean {
  return masteryLevel(state, 'ferrite') >= REFINERY_MASTERY;
}

/** The band above this one, or null at the top. */
export function nextBand(band: PurityBand): PurityBand | null {
  const i = BANDS.indexOf(band);
  return i >= 0 && i < BANDS.length - 1 ? BANDS[i + 1]! : null;
}

/**
 * What a refine would produce: `REFINE_RATIO` units of `band` become one unit
 * in the band above, at the BOTTOM of that band's range.
 *
 * Landing at the bottom of the new band rather than the middle is deliberate:
 * refining should be worth doing and never better than finding a genuinely
 * good stone. A refined 'fine' is the worst 'fine' in the game.
 */
export function refinePreview(
  state: GameState,
  materialId: string,
  band: PurityBand,
): { from: number; to: number; toBand: PurityBand; purity: number } | null {
  const up = nextBand(band);
  if (!up) return null;
  const have = state.materials.stacks[materialId]?.[band]?.count ?? 0;
  const batches = Math.floor(have / REFINE_RATIO);
  if (batches < 1) return null;
  return {
    from: batches * REFINE_RATIO,
    to: batches,
    toBand: up,
    purity: BAND_RANGES[up][0],
  };
}

export function refine(
  state: GameState,
  ctx: EngineCtx,
  materialId: string,
  band: PurityBand,
): ActionResult {
  if (!refineryUnlocked(state)) return { ok: false, reason: 'The Refinery is cold' };
  const preview = refinePreview(state, materialId, band);
  if (!preview) {
    const up = nextBand(band);
    return {
      ok: false,
      reason: up ? `${REFINE_RATIO} of the same band, at least` : 'Nothing refines past exalted',
    };
  }

  // Take from the SPECIFIC band, not best-first — the player chose this one.
  const perMat = state.materials.stacks[materialId]!;
  const stack = perMat[band]!;
  const avg = stack.count > 0 ? stack.puritySum / stack.count : 0;
  stack.count -= preview.from;
  stack.puritySum -= avg * preview.from;
  if (stack.count === 0) delete perMat[band];

  addMaterial(state, materialId, preview.purity, preview.to);
  grantSlag(state, preview.from - preview.to);

  ctx.emit({ type: 'refined', materialId, from: preview.from, to: preview.to, band: preview.toBand });
  ctx.dirty();
  return { ok: true, data: { ...preview } };
}

/**
 * AUTO-REFINE (Phase 21) — the Hold's standing rules. For each enabled preset,
 * push every band that sits BELOW the target up exactly one level, highest-first
 * so a poor→fair conversion this tick is not itself pushed to good until the
 * next. It calls the ordinary `refine` — same loss ratio, same slag, so it can
 * only ever REDUCE the count you hold (pillar 2). Runs on a gentle clock, not
 * every frame; a background convenience, never a firehose.
 */
export function tickAutoRefine(state: GameState, ctx: EngineCtx): void {
  if (!refineryUnlocked(state)) return;
  const presets = state.qol.refinePresets;
  for (const preset of presets) {
    if (!preset.enabled) continue;
    const targetIdx = BANDS.indexOf(preset.toBand);
    if (targetIdx <= 0) continue; // 'poor' is the floor — nothing sits below it
    for (let i = targetIdx - 1; i >= 0; i--) {
      // refine() no-ops (ok:false) when this band lacks a full batch — fine.
      refine(state, ctx, preset.materialId, BANDS[i]!);
    }
  }
}

// ---------------------------------------------------------------------------
// Byproducts — nothing here is a pure sink
// ---------------------------------------------------------------------------

/**
 * SLAG. Every refine and every transmute throws it off, and it is the input to
 * the coarse end of the transmutation graph. The rule the brief set — nothing
 * in this game should be a pure sink — means the loss ratio above is not
 * destruction, it is a change of form.
 */
export const SLAG_MATERIAL = 'refineslag';

function grantSlag(state: GameState, units: number): void {
  if (units <= 0) return;
  // Slag is slag: it always lands at the bottom of the scale.
  addMaterial(state, SLAG_MATERIAL, 5, units);
}

// ---------------------------------------------------------------------------
// Transmutation — the 132 buckets become a graph
// ---------------------------------------------------------------------------

export interface TransmuteChain {
  id: string;
  /** Two inputs; order does not matter — this is not the rune grammar. */
  a: string;
  b: string;
  /** What comes out. */
  out: string;
  /** How many of each input per unit out. */
  cost: number;
  /** Recorded in the Codex when found. */
  name: string;
  flavor: string;
}

/**
 * The chains. Authored, not generated, so each one is a sentence about the two
 * materials rather than an arbitrary edge.
 *
 * DESIGN RULE: every chain's OUTPUT is a material with real consumers, and at
 * least one INPUT is one of the 49 orphans. That is what converts the audit
 * finding into gameplay: the useless commons become the raw feedstock of the
 * things people actually want.
 */
export const CHAINS: TransmuteChain[] = [];

/** Registered from content so this module stays data-free like the rest. */
export function registerChain(chain: TransmuteChain): void {
  if (CHAINS.some((c) => c.id === chain.id)) throw new Error(`Duplicate chain: ${chain.id}`);
  CHAINS.push(chain);
}

export function clearChains(): void {
  CHAINS.length = 0;
}

/** Order-independent lookup: the pair is a SET, unlike a rune pair. */
export function findChain(a: string, b: string): TransmuteChain | undefined {
  return CHAINS.find(
    (c) => (c.a === a && c.b === b) || (c.a === b && c.b === a),
  );
}

export function transmuteUnlocked(state: GameState): boolean {
  // Transmutation is the deeper half of the same bench.
  return masteryLevel(state, 'ferrite') >= REFINERY_MASTERY + 3;
}

/**
 * Feed two materials in and see what comes out. A miss costs one of each and
 * pays slag — the discovery verb has a price, and the price is never a dead
 * end because slag is itself an input.
 */
export function transmute(
  state: GameState,
  ctx: EngineCtx,
  aId: string,
  bId: string,
): ActionResult {
  if (!transmuteUnlocked(state)) return { ok: false, reason: 'The crucible bench is not yours yet' };
  if (aId === bId) return { ok: false, reason: 'Two of the same thing is a pile, not a reaction' };

  const chain = findChain(aId, bId);
  const cost = chain?.cost ?? 1;
  if (materialCount(state, aId) < cost || materialCount(state, bId) < cost) {
    return { ok: false, reason: `${cost} of each, at least` };
  }

  consumeMaterial(state, aId, cost);
  consumeMaterial(state, bId, cost);

  if (!chain) {
    // A miss. It still pays: slag is feedstock, so a failed attempt moves you.
    grantSlag(state, cost);
    state.refinery.attempts += 1;
    ctx.dirty();
    return { ok: true, data: { found: null, slag: cost } };
  }

  // The output inherits the WORSE of the two inputs' typical purity — you
  // cannot launder a bad stack into a good one by routing it through a chain.
  addMaterial(state, chain.out, BAND_RANGES['fair'][0], 1);
  grantSlag(state, 1);
  state.refinery.attempts += 1;

  const isNew = !state.refinery.found.includes(chain.id);
  if (isNew) {
    state.refinery.found.push(chain.id);
    ctx.emit({ type: 'chainFound', chainId: chain.id, name: chain.name });
  }
  ctx.dirty();
  return { ok: true, data: { found: chain.id, isNew, out: chain.out } };
}

/** Chains the player has actually found — the Codex view. */
export function foundChains(state: GameState): TransmuteChain[] {
  return CHAINS.filter((c) => state.refinery.found.includes(c.id));
}

export function defaultRefineryState(): GameState['refinery'] {
  return { found: [], attempts: 0, refined: 0 };
}

/** Every material that no chain, recipe or system consumes — used by tests. */
export function orphanMaterials(consumedIds: ReadonlySet<string>): string[] {
  return MATERIALS.filter((m) => !consumedIds.has(m.id)).map((m) => m.id);
}

export { materialDef };
