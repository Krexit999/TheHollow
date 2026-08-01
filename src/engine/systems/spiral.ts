/**
 * THE SPIRAL — reset layer 4, and the last one.
 *
 * The ladder's verbs are NUMBERS -> MECHANICS -> RULES: Collapse pays Cores,
 * Breach carries a signature mechanic forever, Recursion rewrites rules through
 * the law registry. The only honest thing left above "rules" is a change of
 * VERB, not of magnitude:
 *
 *   Below the Spiral you PLAY a world. At the Spiral you ADMINISTRATE many.
 *
 * That is why it is not "Recursion but bigger". A Spiral converts the laws you
 * wrote into CAPACITY — grid slots and parallel-shell licences — and hands the
 * playing of worlds to a program that runs through the real dispatch path. The
 * game you mastered starts playing itself, and your skill moves from your hands
 * into the design.
 *
 * DESIGN table (LOCKED): "Spiral | Post-Recursion | Axioms | Spiral:
 * challenges, parallel shells, Automation Grid | Endgame", with
 *   Spiral = floor( sqrt(TotalAxioms) * RecursionCount ).
 *
 * INTERPRETATIONS (A.22, flagged and approved at kickoff):
 *  - That formula yields a SMALL LIFETIME TOTAL (~2 at Recursion 1, ~17 at
 *    Recursion 4 with 20 Axioms). Spiral is therefore a SLOT-GATING currency
 *    spent once per node, never a renewable resource. Capacity is bought with
 *    Spiral; the CONTENT that fills it is unlocked by challenges. Two axes.
 *  - "Resets: Axioms" is read as: the owned laws and banked Axiom currency wash;
 *    lifetime biography (records, Delver, Guild, codices, totals, recursion
 *    COUNT, axiomsEarned) survives, exactly as a Recursion preserves it. You
 *    are trading the rules you wrote for the capacity to stop playing by hand.
 *  - Awarded on a HIGH-WATER MARK (like Axioms), so repeat Spirals never
 *    double-pay the same lifetime figures.
 */
import { D } from '../decimal';
import { spiralFor } from '../prestigeMath';
import type { ActionResult, EngineCtx, GameState, SpiralState, ToolInstance } from '../types';
import { initialState } from '../state';
import { purityMult } from './forge';
import { serialize, deserialize } from '../save/codec';
import { CHALLENGE_BY_ID } from '../content/shell7/challenges';
import { automationRate } from '../content/shell7/gridModules';
import { dpsMax } from './face';
import { addCurrency } from '../resources';
import { chipCurrencyId } from '../shells';
import { sealed } from '../laws';
import type { ModifierCache } from '../modifiers';

/** The locked formula, on lifetime figures. */
/**
 * THE SECOND DEAD TWIN (found A.44 twin audit). This carried its own
 * `floor(sqrt(A)·R)` while `prestigeMath.spiralFor` held an identical copy —
 * and `spiralFor` was referenced by nothing but the "prestige formulas
 * (locked)" suite, exactly like `axiomsForEchoes` before it.
 *
 * Two of the five prestige formulas had twins, BOTH of the dead copies live in
 * `prestigeMath.ts`, and BOTH were guarded by the same test file. That module
 * is partly documentation the game does not call, and the locked-formula suite
 * has been asserting the documentation. Delegated; see `prestige-live.test.ts`,
 * which checks these curves through real dispatches into the purse instead.
 */
export function spiralFromLifetime(totalAxiomsEarned: number, recursionCount: number): number {
  return spiralFor(D(Math.max(0, totalAxiomsEarned)), Math.max(0, recursionCount)).toNumber();
}

/** A Spiral needs a Recursion behind it — you cannot administrate nothing. */
export function canSpiral(state: GameState): boolean {
  if (state.recursion.count < 1) return false;
  return spiralPending(state) >= 1;
}

/** What a Spiral would pay right now (past the high-water mark). */
export function spiralPending(state: GameState): number {
  const target = spiralFromLifetime(state.recursion.axiomsEarned, state.recursion.count);
  return Math.max(0, target - state.spiral.earned);
}

/** Same heirloom rule as Recursion — the pack is never empty. */
function heirloom(t: ToolInstance): ToolInstance {
  const former = Math.max(t.formerTier ?? 0, t.tier);
  return {
    ...t,
    tier: 1,
    heirloom: true,
    formerTier: former,
    chipPower: Math.round(1 * purityMult(t.purity) * (1 + 0.05 * Math.min(15, former)) * 100) / 100,
    strikePower: Math.round(3 * purityMult(t.purity) * (1 + 0.05 * Math.min(15, former)) * 100) / 100,
  };
}

export function doSpiral(
  state: GameState,
  ctx: EngineCtx,
  replaceState: (next: GameState) => void,
): ActionResult {
  if (state.recursion.count < 1) return { ok: false, reason: 'A Spiral needs a Recursion behind it' };
  const gained = spiralPending(state);
  if (gained < 1) return { ok: false, reason: 'Nothing more to wind — deepen the Axioms first' };

  const next = initialState(state.stats.lastSavedAt);

  // --- the survive-ledger: everything a Recursion keeps -------------------
  next.depthRecords = { ...state.depthRecords };
  next.maxDepthRecord = state.maxDepthRecord;
  next.delver = state.delver;
  next.achievements = state.achievements;
  next.guild = state.guild;
  next.guild.contracts.board = state.guild.contracts.board.map(() => null);
  next.stats = state.stats;
  next.totals = state.totals;
  next.combat.seen = state.combat.seen;
  next.combat.kills = state.combat.kills;
  next.combat.stats = state.combat.stats;
  next.lattice.discovered = state.lattice.discovered;
  next.lattice.discoveredProgressions = state.lattice.discoveredProgressions;
  next.crucible.discovered = state.crucible.discovered;
  next.crucible.ranks = state.crucible.ranks;
  next.runes = state.runes;
  for (const id of ['scrip', 'renown', 'charter'] as const) {
    next.currencies[id] = state.currencies[id] ?? D(0);
  }
  next.forge.tools = state.forge.tools.map(heirloom);
  next.forge.equipped = Math.min(state.forge.equipped, Math.max(0, next.forge.tools.length - 1));
  next.forge.nextId = state.forge.nextId;

  // Possessions the endgame is made of ride through a Spiral untouched — the
  // whole point of the layer is that what you COLLECTED is now the game.
  next.relics = state.relics;
  next.museum = state.museum;
  next.expeditions = state.expeditions;

  // --- what a Spiral costs: the laws you wrote ----------------------------
  // Lifetime biography (count, axiomsEarned) is kept: it is what the formula
  // reads, and erasing it would make repeat Spirals pay twice.
  next.recursion = {
    count: state.recursion.count,
    axioms: [],            // the rules wash — this is the price
    axiomsEarned: state.recursion.axiomsEarned,
    leftBehind: null,
  };
  next.currencies['axiom'] = D(0);

  // --- what a Spiral pays: capacity --------------------------------------
  // The FIRST Spiral hands over one slot and one module, so the Automation Grid
  // is visibly alive the moment you first open it. Before this, a new Spiraller
  // met a board where all sixteen cells were locked AND all eight modules were
  // locked — a blank wall presented as a system.
  const firstWind = state.spiral.count === 0;
  next.spiral = {
    ...state.spiral,
    count: state.spiral.count + 1,
    earned: state.spiral.earned + gained,
    slots: state.spiral.slots + (firstWind ? 1 : 0),
    modules: firstWind && state.spiral.modules.length === 0
      ? ['autoBuyFace']
      : state.spiral.modules,
  };
  next.currencies['spiral'] = (state.currencies['spiral'] ?? D(0)).add(gained);
  next.totals['spiral'] = (next.totals['spiral'] ?? D(0)).add(gained);

  replaceState(next);
  ctx.dirty();
  ctx.emit({ type: 'spiral', count: next.spiral.count, spiralGained: gained });
  return { ok: true, data: { count: next.spiral.count, spiralGained: gained } };
}

// ---------------------------------------------------------------------------
// Parallel shells — abstracted, and deliberately so
// ---------------------------------------------------------------------------
/**
 * A parallel shell has a depth and its own field ceiling; it has NO interactive
 * face. Six live faces would mean rewriting face/depth/collapse, which are
 * singletons keyed off currentShell() and which everything else sits on. So a
 * parallel world runs a REDUCED model and exactly one shell is "in hand".
 *
 * PILLAR 2 binds each shell separately and explicitly: its income is its own
 * W·H·regen·Y ceiling, scaled by how well the Grid plays it. It cannot exceed
 * what its own field grows back, because that ceiling is literally the term.
 *
 * PILLAR 1 survives because `automationRate` caps at 1.0 — a fully-built Grid
 * plays a world exactly as well as a good IDLE player and never as well as an
 * attentive one, so the hands-on ~1.3x edge is untouched.
 */
export const PARALLEL_IDLE_SHARE = 0.55; // an unattended world runs at the idle floor

export function tickParallelShells(
  state: GameState,
  mods: ModifierCache,
  dt: number,
): void {
  const shells = state.spiral.shells;
  if (shells.length === 0) return;
  const rate = automationRate(state.spiral.grid);
  if (rate <= 0) return; // licensed but unautomated worlds sit idle, banked

  // The ceiling of the world IN HAND is the reference; a parallel world is a
  // fraction of it, never a copy of it.
  const ceiling = dpsMax(state, mods);
  for (const sh of shells) {
    if (sh.policy === null) continue; // no policy = not running
    sh.runSec += dt;
    // SHARED BANK (Two Worlds challenge): spending in one spends in both, so
    // the parallel stream is halved — capacity without a policy is two shafts
    // starving each other, which is the challenge's whole argument.
    const split = sealed(state, 'sharedBank') ? 0.5 : 1;
    const gained = ceiling.mul(rate * PARALLEL_IDLE_SHARE * split * dt);
    addCurrency(state, chipCurrencyId(state), gained);
    // Depth creeps on its own clock — the Stair-Walker module is what makes a
    // parallel world descend at all.
    if (state.spiral.grid && Object.values(state.spiral.grid).includes('autoDescend')) {
      sh.depth += rate * dt * 0.02;
    }
  }
}

// ---------------------------------------------------------------------------
// Capacity: what Spiral currency buys
// ---------------------------------------------------------------------------
/**
 * THE GRID RE-RATE (A.44 ruling 2).
 *
 * The note this replaces was half right and that is what made it dangerous:
 * "the lifetime Spiral budget is small by the formula, so a full board is an
 * endgame-long project rather than an afternoon's shopping." The budget IS
 * small — `spiralFor` pays sqrt(Axioms)·Recursions, about 21 across the spec's
 * six Recursions — and the price was set steep ANYWAY, at 1+floor(1.5n), so a
 * full sixteen-slot board cost **192 against a lifetime supply of ~12**. That
 * is not endgame-long, it is unreachable by 16x, and the Automation Grid is
 * precisely the "earlier systems run themselves" mechanism the game needs to
 * make a re-climb fast. Sixteen modules were authored; nobody could seat four.
 *
 * Re-rated so a full board costs 20: a genuine endgame commitment that lands
 * around Recursion 5–6, and competes with licences for the same purse rather
 * than sitting outside the economy entirely. Sized in scripts/a44-ladder.ts.
 */
export function gridSlotCost(owned: number): number {
  return 1 + Math.floor(owned / 12);
}

/** A licence lets one more world run beside the one in your hands. Re-rated
 *  with the slots above — parallel worlds now TRADE against Grid depth for a
 *  shared Spiral purse, which is the choice the layer is supposed to offer. */
export function licenceCost(owned: number): number {
  return 1 + owned;
}

// ---------------------------------------------------------------------------
// Challenges — the part you still play by hand
// ---------------------------------------------------------------------------
/**
 * A challenge runs in a SEPARATE WORLD, not over your own. Starting one swaps
 * in a fresh state carrying only biography (records, Delver, codices, Guild);
 * abandoning or finishing swaps your real world back. That is the only honest
 * way to seal the Kiln or shrink the face to one cell without risking the run
 * a player has spent a hundred hours on — and it means a challenge can never
 * cost you anything but the time you chose to spend on it.
 */
export function startChallenge(
  state: GameState,
  ctx: EngineCtx,
  id: string,
  replaceState: (next: GameState) => void,
): ActionResult {
  if (state.spiral.count < 1) return { ok: false, reason: 'The Spiral has not opened' };
  if (state.spiral.activeChallenge) return { ok: false, reason: 'One at a time' };
  const def = CHALLENGE_BY_ID.get(id);
  if (!def) return { ok: false, reason: 'No such challenge' };
  if (state.spiral.challengeDone.includes(id)) return { ok: false, reason: 'Already done' };

  const next = initialState(state.stats.lastSavedAt);
  next.depthRecords = { ...state.depthRecords };
  next.maxDepthRecord = state.maxDepthRecord;
  next.delver = state.delver;
  next.achievements = state.achievements;
  next.guild = state.guild;
  next.stats = { ...state.stats };
  next.totals = state.totals;
  next.spiral = { ...state.spiral, activeChallenge: { id, startedAtPlaySec: state.stats.playTimeSec } };
  next.relics = state.relics;
  next.museum = state.museum;
  next.expeditions = state.expeditions;
  // The world you were playing is put down, whole, and picked up again after.
  // Serialized through the real save codec so Decimals round-trip exactly.
  next.spiral.saved = serialize(state, state.stats.lastSavedAt);
  def.setup?.(next);

  replaceState(next);
  ctx.dirty();
  ctx.emit({ type: 'challengeStarted', id });
  return { ok: true };
}

/** Put the challenge down and pick your own world back up, won or not. */
export function endChallenge(
  state: GameState,
  ctx: EngineCtx,
  won: boolean,
  replaceState: (next: GameState) => void,
): ActionResult {
  const active = state.spiral.activeChallenge;
  if (!active) return { ok: false, reason: 'No challenge is running' };
  const def = CHALLENGE_BY_ID.get(active.id);
  const saved = state.spiral.saved;
  if (!saved) return { ok: false, reason: 'The world you left could not be found' };

  const next = deserialize(saved);
  next.spiral = { ...state.spiral, activeChallenge: null, saved: undefined };
  // Biography earned inside the challenge still counts — records survive
  // everything, and a challenge is not an exception to that.
  next.depthRecords = { ...next.depthRecords };
  for (const [sh, d] of Object.entries(state.depthRecords)) {
    next.depthRecords[sh] = Math.max(next.depthRecords[sh] ?? 0, d);
  }
  next.delver = state.delver;
  next.achievements = state.achievements;
  next.relics = state.relics;
  next.museum = state.museum;

  if (won && def) {
    next.spiral.challengeDone = [...next.spiral.challengeDone, def.id];
    if (!next.spiral.modules.includes(def.reward)) next.spiral.modules = [...next.spiral.modules, def.reward];
    ctx.emit({ type: 'challengeDone', id: def.id, moduleId: def.reward });
  } else {
    ctx.emit({ type: 'challengeAbandoned', id: active.id });
  }

  replaceState(next);
  ctx.dirty();
  return { ok: true, data: { won } };
}

export function abandonChallenge(
  state: GameState,
  ctx: EngineCtx,
  replaceState: (next: GameState) => void,
): ActionResult {
  return endChallenge(state, ctx, false, replaceState);
}

/** Checked every step: a challenge ends the moment its goal is true. */
export function checkChallengeGoal(
  state: GameState,
  ctx: EngineCtx,
  replaceState: (next: GameState) => void,
): void {
  const active = state.spiral.activeChallenge;
  if (!active) return;
  const def = CHALLENGE_BY_ID.get(active.id);
  if (def && def.goal(state)) endChallenge(state, ctx, true, replaceState);
}

export function defaultSpiralState(): SpiralState {
  return {
    count: 0,
    earned: 0,
    slots: 0,
    licences: 0,
    grid: {},
    modules: [],
    challengeDone: [],
    activeChallenge: null,
    shells: [],
    inHand: null,
  };
}
