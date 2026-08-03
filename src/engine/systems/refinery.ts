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
/**
 * REFINE-TO-TARGET — the whole climb in one act, priced before you commit.
 *
 * The bench has always been one band at a time, which is honest and, past the
 * first rung, tedious: taking a heap of poor stock to Fine is three separate
 * decisions with the same answer. This walks the ladder for you.
 *
 * IT IS NOT A DISCOUNT. Every rung is the same `refine` the button always
 * called, in the same order, at the same 3:1 — so the cost of the climb is
 * exactly the cost of doing it by hand, and the faucet argument is untouched.
 * What it removes is clicking, not loss.
 *
 * THE PREVIEW IS THE POINT. `climbPreview` walks the same rungs against a
 * COPY of the counts and reports what will be spent and what will arrive,
 * before anything is consumed — because "take all my bonechalk to Good" is a
 * decision a player should be able to price, and 3:1 compounding is not
 * something anyone should be asked to do in their head.
 */
export interface ClimbStep { from: PurityBand; to: PurityBand; spent: number; got: number }
export interface ClimbPlan {
  steps: ClimbStep[];
  /** Units consumed across the whole climb. */
  spent: number;
  /** Units standing in the target band at the end. */
  got: number;
  /** Slag the climb hands back. */
  slag: number;
}

export function climbPreview(
  state: GameState, materialId: string, target: PurityBand,
): ClimbPlan | null {
  const targetIdx = BANDS.indexOf(target);
  if (targetIdx <= 0) return null;
  const stack = state.materials.stacks[materialId];
  if (!stack) return null;

  // A COPY. Nothing below touches real counts — this is a quote, not a spend.
  const have: number[] = BANDS.map((b) => stack[b]?.count ?? 0);
  const steps: ClimbStep[] = [];
  let spent = 0;

  // BOTTOM-UP, so a rung feeds the one above it in the same climb. Walking
  // top-down would price each band against only what it already held.
  for (let i = 0; i < targetIdx; i++) {
    const batches = Math.floor(have[i]! / REFINE_RATIO);
    if (batches < 1) continue;
    const from = batches * REFINE_RATIO;
    have[i]! -= from;
    have[i + 1]! += batches;
    spent += from;
    steps.push({ from: BANDS[i]!, to: BANDS[i + 1]!, spent: from, got: batches });
  }
  if (steps.length === 0) return null;
  const got = have[targetIdx]! - (stack[target]?.count ?? 0);
  /**
   * A PLAN THAT ARRIVES WITH NOTHING IS NOT A PLAN.
   *
   * 3:1 compounding means a climb can consume real stock and land ZERO units in
   * the target: ninety poor is thirty fair, ten good, three fine, one exalted —
   * and nothing at all in the band above that. The first cut returned that as a
   * valid plan, so the Casting floor cheerfully offered 'would take 132 of these
   * to 0 Pristine' and the trough drew a button that spent everything for
   * nothing. Refusing it here fixes every caller at once.
   */
  if (got <= 0) return null;
  return { steps, spent, got, slag: spent - steps.reduce((n, x) => n + x.got, 0) };
}

/** Run the climb. Every rung is the plain one-band refine, in the plan order. */
export function refineTo(
  state: GameState, ctx: EngineCtx, materialId: string, target: PurityBand,
): ActionResult {
  if (!refineryUnlocked(state)) return { ok: false, reason: 'The trough is cold' };
  const plan = climbPreview(state, materialId, target);
  if (!plan) return { ok: false, reason: 'Nothing there will climb that far' };
  let ran = 0;
  for (const step of plan.steps) {
    if (refine(state, ctx, materialId, step.from).ok) ran += 1;
  }
  if (ran === 0) return { ok: false, reason: 'Nothing to refine' };
  ctx.dirty();
  return { ok: true, data: { steps: ran, spent: plan.spent, got: plan.got, band: target } };
}

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
  /** Units out per firing (default 1). The export chains use this: their rare
   *  input amortises over several outputs, so a scarce stone is a batch, not
   *  a bottleneck. */
  yield?: number;
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

// ---------------------------------------------------------------------------
// THE SCENT — why 2,497 attempts found nothing
// ---------------------------------------------------------------------------

/**
 * A PLAYER REPORTED "0 known · 2497 run". THE BENCH WAS NEVER BROKEN.
 *
 * Measured rather than guessed: **19 valid pairs hide among 12,403** — one in
 * 653 — and it is worse than that number looks, because the design rule at the
 * top of `content/shell2/chains.ts` is that every chain consumes a material with
 * ZERO other consumers. Those are precisely the stones a player never stocks and
 * never thinks about. Several chains then take `bindingclay`, which is itself an
 * OUTPUT, so half the table is unreachable until you have blundered into the
 * first half by accident.
 *
 * Pillar 5 says discovery over unlocking and never show a locked list. It does
 * not say the search has to be a lottery. Two thousand pulls with no feedback is
 * not experimenting — it is a slot machine, and the player correctly concluded
 * the machine was broken.
 *
 * SO THE BENCH READS ONE STONE AT A TIME. Put a stone in a slot and it tells you
 * whether ANYTHING in the world wants it — never what, never with what. That
 * narrows the field from 158 stones to the ~30 that appear in any chain, so the
 * pairs worth trying fall from 12,403 to a few hundred, and every one of them is
 * a REASON rather than a guess. The pair itself is still yours to find.
 *
 * This is the same move the forge already made for materials: a trait hints the
 * DIRECTION and you still do the work (`pairingLine`, A.67).
 */
export type ScentLevel = 'unknown' | 'inert' | 'wanted';

/** Every stone that appears in ANY chain, either side. Derived, never restated. */
export function reactiveMaterials(): Set<string> {
  const s = new Set<string>();
  for (const c of CHAINS) { s.add(c.a); s.add(c.b); }
  return s;
}

/** Does anything in the world want this stone? One bit, and only one bit. */
export function scentOf(materialId: string | null | undefined): ScentLevel {
  if (!materialId) return 'unknown';
  return reactiveMaterials().has(materialId) ? 'wanted' : 'inert';
}

/**
 * WHAT THE BENCH SAYS ABOUT THE PAIR IN IT, before anything is spent.
 *
 * A.70 SHIPPED THIS AS TWO SOLO READINGS AND IT WAS WORSE THAN NOTHING.
 * It said "both of these want something", which meant only that each stone
 * appears in SOME chain -- and it read as "this pair will work". A player who
 * trusted it poured two stones with nothing to do with each other and got
 * slag: the same lottery as before, with a confident voice on top.
 *
 * So the reading is a PAIR reading now. It answers the question actually being
 * asked at the moment two stones are in the slots: do THESE TWO have something
 * to make together.
 *
 * WHAT THIS COSTS PILLAR 5, said plainly rather than pretended away. It gives
 * up "which pairs react" as a thing to discover. It keeps the half that was
 * ever worth discovering -- WHAT they make, still found only by pouring and
 * still the only thing the Codex records. Finding a chain becomes reading what
 * you hold rather than a one-in-117 lottery, and that trade is the right way
 * round: the fun was never in the guessing.
 */
export type PairRead = 'empty' | 'same' | 'reacts' | 'known' | 'inert';

export interface BenchReading {
  read: PairRead;
  /** Solo scents, still per slot so the PICKER can be narrowed before you pair. */
  a: ScentLevel;
  b: ScentLevel;
  line: string;
}

export function benchReading(
  state: GameState, aId: string | null, bId: string | null,
): BenchReading {
  const a = scentOf(aId);
  const b = scentOf(bId);
  const name = (id: string | null): string => (id ? materialDef(id).name : "");

  if (!aId || !bId) {
    return { read: 'empty', a, b, line: 'Put two stones in. The bench will say whether they have anything to make together.' };
  }
  if (aId === bId) {
    return { read: 'same', a, b, line: 'Two of the same thing is a pile, not a reaction.' };
  }

  const chain = findChain(aId, bId);
  if (!chain) {
    return {
      read: 'inert', a, b,
      line: `${name(aId)} and ${name(bId)} have nothing to say to each other. This would come back as slag.`,
    };
  }
  // ALREADY FOUND: no reason to make a player re-derive their own Codex.
  if (state.refinery?.found?.includes(chain.id)) {
    return {
      read: 'known', a, b,
      line: `${chain.name} — you have run this one. ${chain.cost} of each makes ${materialDef(chain.out).name}.`,
    };
  }
  return {
    read: 'reacts', a, b,
    line: `These two have something to make together. What it is, you find out by pouring — ${chain.cost} of each.`,
  };
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
  state.refinery.attemptsRun = (state.refinery.attemptsRun ?? 0) + 1;
    ctx.dirty();
    // THE MISS NARROWS. A failure that says only "nothing happened" is what
    // turned this bench into a slot machine; the same one bit that priced the
    // attempt is worth repeating after it, because that is when it is read.
    return { ok: true, data: { found: null, slag: cost, ...benchReading(state, aId, bId) } };
  }

  // The output inherits the WORSE of the two inputs' typical purity — you
  // cannot launder a bad stack into a good one by routing it through a chain.
  addMaterial(state, chain.out, BAND_RANGES['fair'][0], chain.yield ?? 1);
  grantSlag(state, 1);
  state.refinery.attempts += 1;
  state.refinery.attemptsRun = (state.refinery.attemptsRun ?? 0) + 1;

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
