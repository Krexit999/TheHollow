/**
 * THE COIL — SURGE (§13, the wreck at Coilwright's Fall 22).
 *
 * §13: "bank chain-charge as burst power · blocks ALL Ferrite machines and
 * every Line firing."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ITEM 11, SETTLED BY MEASUREMENT. "Surge already exists as a capacity from
 * A.86. Settle whether the Coil is what should have granted it, or a second
 * thing."
 *
 * IT IS WHAT SHOULD HAVE GRANTED IT, and the reading that proves it is not the
 * §3.2 table — it is the arithmetic:
 *
 *   SURGE_FLOOR   14      a flat bank, in every shell, from turn one
 *   line          18      a Line's draw
 *
 * **A BARE PLANT CANNOT FIRE A LINE. Not slowly — ever.** So §13's "blocks
 * every Line firing" has been literally true this whole time, and the only
 * thing that lifts it is `surgeCapacity`, a CORE-TREE NODE that `doBreach`
 * wipes at every Breach (`breach.ts`: `state.collapse.nodes = {}`). The gate
 * §13 hangs on a machine was hanging on a currency purchase that resets.
 *
 * So the Coil does not add a second Surge. It becomes WHERE FERRITE'S SURGE
 * COMES FROM, which is what §3.2 says Ferrite's plant is: "pure Surge — a chain
 * banks a burst".
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * AND THE CHAIN IS THE POINT. §3.3 calls this "the tightest active→industrial
 * link in the design": chaining by hand at the face directly buys the biggest
 * action in the plant. `polarity.ts` has tracked `chain` and `bestChain` since
 * Phase 4 and nothing outside the face has ever read them. The Coil reads them.
 *
 * TIERS ARE CAPABILITY (§15.4):
 *   I    THE BANK IS BIGGER, and it is Ferrite's rather than the Core tree's —
 *        a Line can fire at all
 *   II   A CHAIN BANKS — every link you hold at the face deposits into the
 *        burst, so the plant's biggest action is bought by hand
 *   III  THE COIL REMEMBERS — the bank keeps what your BEST chain earned it
 *        rather than what the live one is worth, so a chain broken by a
 *        Collapse is not a chain wasted
 *
 * `polarity.ts` IS NOT TOUCHED. The Coil reads `chain` and `bestChain`; it
 * writes neither, and no constant in the chain grammar moves.
 *
 * PILLAR 2. Surge is what MACHINES draw on. There is no path from this file to
 * `cellCap`, `cellRegen` or `chipYield`, so a bigger bank converts faster and
 * cannot raise the ceiling it converts against.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';
import { currentShell } from '../shells';

/** The wreck it is found in — Ferrite, Coilwright's Fall 22. Authored with the shell. */
export const COIL_WRECK = 'THE COIL';

/**
 * WHAT A COIL IS WORTH AS A BANK, before any chain.
 *
 * Sized against the thing it exists to unblock: a Line costs 18 against a floor
 * of 14, so a tier-I Coil has to clear 18 on its own or the machine §13 says
 * unblocks Lines still does not. Ten over the floor gives 24 — one Line, with
 * room to be spent on something else first.
 */
export const COIL_BANK = 10;
/** Per link of the chain you are holding, at tier II. */
export const COIL_PER_LINK = 1.6;

export const TIER_CAPABILITY_COIL = [
  'not built',
  'a bank of Ferrite\'s own — big enough to fire a Line at all',
  '...and every link of a chain you hold banks into the burst',
  '...and it remembers your best chain, so a broken one was not wasted',
] as const;

export function coilStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === COIL_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function coilFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === COIL_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function coilBuilt(state: GameState): boolean {
  return tierOf(state, 'coil') > 0;
}

/** Tier II: the chain banks. */
export function chainBanks(state: GameState): boolean {
  return tierOf(state, 'coil') >= 2;
}

/** Tier III: it remembers the best one. */
export function coilRemembers(state: GameState): boolean {
  return tierOf(state, 'coil') >= 3;
}

export function nextCoilTierCost(state: GameState): number | null {
  const t = tierOf(state, 'coil');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildCoil(state: GameState, ctx: EngineCtx): ActionResult {
  if (!coilFound(state)) {
    const at = coilStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Coil.' };
  }
  const cost = nextCoilTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Coil is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'coil', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['coil'] = tierOf(state, 'coil') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'coil', tier: plant.tiers['coil']! });
  return { ok: true, data: { tier: plant.tiers['coil'] } };
}

// ---------------------------------------------------------------------------
// The bank it IS — read by `plant.ts`, which owns Flow and Surge
// ---------------------------------------------------------------------------

/**
 * HOW LONG A CHAIN THE COIL IS READING. The live one, or — at tier III — the
 * best this run held. Both are `polarity.ts`'s own numbers, read and never
 * written; the Coil has no opinion about how a chain is made or broken.
 */
export function chainRead(state: GameState): number {
  const p = state.polarity;
  if (!p) return 0;
  const live = p.chain ?? 0;
  return coilRemembers(state) ? Math.max(live, p.bestChain ?? 0) : live;
}

/** What the Coil adds to the bank. Zero anywhere it is not standing. */
export function coilSurge(state: GameState): number {
  if (!coilBuilt(state)) return 0;
  let bank = COIL_BANK;
  if (chainBanks(state)) bank += COIL_PER_LINK * chainRead(state);
  return bank;
}

/** Is this shell's Surge the Coil's business? Ferrite, and what carries it. */
export function coilShell(state: GameState): boolean {
  if (currentShell(state).id === 'ferrite') return true;
  return state.shell?.signatures?.includes('polarity') ?? false;
}

/** What the panel says — the UI computes nothing. */
export function coilRead(state: GameState): {
  built: boolean; tier: number; chain: number; best: number; banked: number; here: boolean;
} {
  return {
    built: coilBuilt(state),
    tier: tierOf(state, 'coil'),
    chain: state.polarity?.chain ?? 0,
    best: state.polarity?.bestChain ?? 0,
    banked: coilSurge(state),
    here: coilShell(state),
  };
}
