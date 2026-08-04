/**
 * THE LAPIDARY — CUTTING (§13), in the wreck at The Lenswork, Glassmere 62.
 *
 * §13: "shape a gem before socketing · blocks binding at scale."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WRECK WAS ALREADY AUTHORED AND NOBODY HAD CLAIMED IT.
 *
 * `content/shell4/roll.ts` has carried THE LENSWORK at depth 62 since Glassmere
 * was authored — "a cold gallery of ground glass, still focused on a spot on the
 * floor that is slightly warm" — with no machine behind the string. So this is
 * the opposite of the Grafthouse and The Long Spin, which had to be written
 * around a hole in §6: here the station existed and the system did not.
 *
 * AND CUTTING USED TO EXIST. `finishCut`/`gemCuts` shipped in the P18 Workbench
 * and went with it when the Workbench was culled — `toolSockets.ts` still has
 * the scar, a `const cut = 1` and a comment saying nothing can cut a gem any
 * more. The save migration still writes an empty `gemCuts` map. Rune practice
 * and gem fusion survived the same cull; cutting did not.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT A CUT IS FOR, AND WHY IT IS NOT A MULTIPLIER.
 *
 * The socket row is a SEQUENCE (`runeSequence`), and adjacent runes speak.
 * `sequencePairs` skips a null, and a gem slot reads as null — so **an uncut gem
 * silently kills the pair it sits between.** That is real and it is invisible:
 * put a Voidopal in the middle of a four-socket row and you lose a rune pair
 * with no message anywhere. It is also exactly §13's "blocks binding at scale",
 * sitting in the code already, unexplained.
 *
 * A CUT DECIDES HOW THE ROW READS THROUGH THE STONE. Three shapes, one per
 * tier, and each is a different sentence rather than a bigger number (§15.4):
 *
 *   I   TABLE  — flat and clear. The runes on either side speak ACROSS it.
 *   II  STAR   — it takes its bucket FROM the pair reading through it. The stone
 *                is aimed by its neighbours instead of by what it is: not more,
 *                elsewhere. A Hearthstone in a dropRate row pays dropRate.
 *   III WATER  — the row it sits in tolerates ONE dissonant pair. It spends
 *                itself holding two runes that hate each other in the same row,
 *                so its own effect is not read at all.
 *
 * None of the three obsoletes the one before it: a Table keeps its own bucket
 * where a Star would move it somewhere worse, and a Water gives its bucket up
 * entirely. LAW 8 — three capabilities, each right in a different row.
 *
 * A SHAPE IS PER GEM TYPE, not per stone. You are a lapidary with a house style
 * for Voidopals, and `state.materials.gems` has always been a count rather than
 * a pile of instances — making it a pile would be a save migration for every
 * socket in the game to buy an axis this system does not need.
 *
 * PILLAR 2. Every socketed contribution still leaves through `registerModifier`
 * into an existing bucket (`toolSockets.ts` header). A cut MOVES a contribution
 * or SILENCES it; it cannot add a second one, and there is no path from here to
 * the face.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { D } from '../decimal';
import { GEMS, gemDef } from '../materials';
import { spendCurrency } from '../resources';
import { convCurrencyId } from '../shells';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { conditionOf } from './condition';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';

/** The wreck it is found in — Glassmere, The Lenswork 62. Authored long before. */
export const LAPIDARY_WRECK = 'THE LENSWORK';

export const CUT_SHAPES = ['table', 'star', 'water'] as const;
export type CutShape = (typeof CUT_SHAPES)[number];

export interface CutDef {
  id: CutShape;
  name: string;
  /** The tier that can grind it. */
  tier: number;
  /** Said plainly on the card — a cut is chosen, never rolled. */
  does: string;
  flavor: string;
}

export const CUTS: CutDef[] = [
  {
    id: 'table', name: 'Table cut', tier: 1,
    does: 'The runes on either side speak across it.',
    flavor: 'Ground flat and clear until you can read the far side of it.',
  },
  {
    id: 'star', name: 'Star cut', tier: 2,
    does: 'It takes its effect from the pair reading through it, not from what it is.',
    flavor: 'Facets cut to catch whatever is coming, and hand it on wearing a different colour.',
  },
  {
    id: 'water', name: 'Water cut', tier: 3,
    does: 'The row tolerates one pair that would otherwise fight. It gives up its own effect to do it.',
    flavor: 'Cut so thin it barely exists. Two runes that will not sit together will sit either side of nothing.',
  },
];

export const CUT_BY_ID = new Map(CUTS.map((c) => [c.id, c]));

export const TIER_CAPABILITY_LAPIDARY = [
  'not built',
  'the table cut — the row reads through the stone',
  '...and the star cut — the stone is aimed by its neighbours',
  '...and the water cut — the row tolerates one quarrel',
] as const;

/** What it costs to grind one, in the shell's own converted currency. */
export const CUT_BASE_COST = 45;

export interface LapidaryState {
  /** gemId → the shape you have ground that stone to. */
  cuts: Record<string, CutShape>;
  /** Shapes you have actually ground, for the Codex. */
  ground: CutShape[];
}

export function defaultLapidaryState(): LapidaryState {
  return { cuts: {}, ground: [] };
}

export function ensureLapidary(state: GameState): LapidaryState {
  return (state.lapidary ??= defaultLapidaryState());
}

export function lapidaryStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === LAPIDARY_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function lapidaryFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === LAPIDARY_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function lapidaryBuilt(state: GameState): boolean {
  return tierOf(state, 'lapidary') > 0;
}

/** Which shapes this Lapidary can grind — the whole of §15.4 for this machine. */
export function shapesAvailable(state: GameState): CutDef[] {
  const t = tierOf(state, 'lapidary');
  return CUTS.filter((c) => c.tier <= t);
}

export function nextLapidaryTierCost(state: GameState): number | null {
  const t = tierOf(state, 'lapidary');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildLapidary(state: GameState, ctx: EngineCtx): ActionResult {
  if (!lapidaryFound(state)) {
    const at = lapidaryStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Lapidary.' };
  }
  const cost = nextLapidaryTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Lapidary is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'lapidary', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['lapidary'] = tierOf(state, 'lapidary') + 1;
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'lapidary', tier: plant.tiers['lapidary']! });
  return { ok: true, data: { tier: plant.tiers['lapidary'] } };
}

// ---------------------------------------------------------------------------
// The verb
// ---------------------------------------------------------------------------

/** How this stone is shaped right now — `null` means uncut, which is a state. */
export function cutOf(state: GameState, gemId: string): CutShape | null {
  return state.lapidary?.cuts?.[gemId] ?? null;
}

export function cutDefOf(state: GameState, gemId: string): CutDef | null {
  const id = cutOf(state, gemId);
  return id ? CUT_BY_ID.get(id) ?? null : null;
}

/**
 * A CUT COSTS ONE OF THE STONE. Grinding takes material off; the first one is
 * the one you learn on. That is the whole price — a cut is not a stat, so it
 * does not want a stat's price, and re-cutting later costs the same again
 * because you are grinding a fresh stone, not editing the old one.
 */
export const CUT_GEM_COST = 1;

export function cutCost(state: GameState, gemId: string): { conv: number; gems: number } {
  const again = cutOf(state, gemId) != null;
  void gemId;
  return {
    conv: Math.round(CUT_BASE_COST * (1 + tierOf(state, 'lapidary') * 0.25) * (again ? 1 : 1)),
    gems: CUT_GEM_COST,
  };
}

export function cutBlocker(state: GameState, gemId: string, shape: CutShape): string | null {
  if (!lapidaryBuilt(state)) return 'The Lapidary is not standing.';
  if (conditionOf(state, 'lapidary')?.seized) return 'The wheel has seized. Re-cast it before it will turn.';
  if (!GEMS.some((g) => g.id === gemId)) return 'No such stone.';
  const def = CUT_BY_ID.get(shape);
  if (!def) return 'No such cut.';
  if (def.tier > tierOf(state, 'lapidary')) return `A ${def.name} wants a deeper wheel than this one.`;
  if (cutOf(state, gemId) === shape) return `Your ${gemDef(gemId).name}s are already ground that way.`;
  const cost = cutCost(state, gemId);
  // You must be able to spend one AND still have one to seat.
  if ((state.materials.gems[gemId] ?? 0) < cost.gems + 1) {
    return `Wants ${cost.gems + 1} ${gemDef(gemId).name} — one to grind away and one to keep.`;
  }
  return null;
}

export function cutGem(
  state: GameState, ctx: EngineCtx, gemId: string, shape: CutShape,
): ActionResult {
  const blocked = cutBlocker(state, gemId, shape);
  if (blocked) return { ok: false, reason: blocked };
  const cost = cutCost(state, gemId);
  if (!spendCurrency(state, convCurrencyId(state), D(cost.conv))) {
    return { ok: false, reason: `${cost.conv} to turn the wheel` };
  }
  state.materials.gems[gemId] = (state.materials.gems[gemId] ?? 0) - cost.gems;
  const lap = ensureLapidary(state);
  const previous = lap.cuts[gemId] ?? null;
  lap.cuts[gemId] = shape;
  if (!lap.ground.includes(shape)) lap.ground.push(shape);
  ctx.emit({ type: 'gemCut', gemId, shape });
  ctx.dirty();
  return { ok: true, data: { gemId, shape, previous } };
}

/** The stones you hold enough of to grind — LAW 3, what is in reach. */
export function cuttable(
  state: GameState,
): Array<{ gemId: string; name: string; count: number; cut: CutShape | null }> {
  if (!lapidaryBuilt(state)) return [];
  return GEMS
    .filter((g) => (state.materials.gems[g.id] ?? 0) > 0)
    .map((g) => ({
      gemId: g.id, name: g.name,
      count: state.materials.gems[g.id] ?? 0,
      cut: cutOf(state, g.id),
    }));
}

// ---------------------------------------------------------------------------
// What the row does about it — read by `toolSockets`, which owns the row
// ---------------------------------------------------------------------------

/** Does the sequence read THROUGH a gem shaped like this? Uncut stone blocks. */
export function readsThrough(shape: CutShape | null): boolean {
  return shape === 'table' || shape === 'star' || shape === 'water';
}

/** Is this stone's own bucket read at all? A Water cut spends itself. */
export function paysItsOwn(shape: CutShape | null): boolean {
  return shape !== 'water';
}

/** Does a stone shaped like this hold a quarrelling pair apart? */
export function calmsTheRow(shape: CutShape | null): boolean {
  return shape === 'water';
}

/** Is this stone aimed by its neighbours rather than by what it is? */
export function aimedByNeighbours(shape: CutShape | null): boolean {
  return shape === 'star';
}
