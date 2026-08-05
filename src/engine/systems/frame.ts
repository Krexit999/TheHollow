/**
 * THE RECONSTRUCTION FRAME — REBUILDING (§13, the wreck at The Unbuilt 178).
 *
 * §13: "buy back a face cell by cell, choosing each cell's physics · Hollow
 * income."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HALF OF THIS ALREADY SHIPPED, INSIDE THE LOCKED SIGNATURE.
 *
 * `absence.ts` has had RECONSTRUCTION since Phase 10: `rebuildCell`, a cost
 * curve (`REBUILD_BASE` × 1.62^k), depth-gated sites, and `faceWhole` gating
 * the Breach. "Buy back a face cell by cell" is built, it is Hollow's income
 * sink, and it is part of the shell's signature — which is LOCKED.
 *
 * WHAT IS NOT BUILT IS THE OTHER CLAUSE: **choosing each cell's physics.** A
 * rebuilt cell arrives as `state.face.cells[cell] = 0` — bare rock, identical
 * to every other bare cell, with no say in what it comes back as.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SO THE FRAME DRIVES THE SIGNATURE AND DOES NOT REPLACE IT. The Hollow still
 * decides IF a cell comes back and what it costs; the Frame decides WHAT IT
 * COMES BACK AS. There is no second rebuild verb, no second cost curve, and no
 * second gate — `absence.ts` gains exactly one call, at the end of a rebuild
 * that has already succeeded, in the same shape `pressure.ts` gained
 * `answerKlaxon` at A.95. It cannot refuse a rebuild, cannot change its price,
 * and cannot rebuild anything itself.
 *
 * THE THREE GRAINS ARE MEDIUMS THE CARRIED SIGNATURES ALREADY WANT, which is
 * the whole of §13's "Hollow income": a rebuilt face is where your carried
 * shells get to work again, and the Frame is you choosing which of them.
 *
 *   SEEDED    it comes back already vined — the Bloom's medium (growth)
 *   POLED     it comes back with a sign set — polarity's medium
 *   POCKETED  it comes back holding a pocket — the ore medium
 *
 * TIERS ARE CAPABILITY (§15.4):
 *   I    ONE GRAIN, spent on the next cell you buy back
 *   II   THE FRAME HOLDS THE PATTERN — the grain stays set for every cell after
 *   III  TWO GRAINS ON ONE CELL — a cell that is two mediums at once
 *
 * PILLAR 2, and it is why one grain that suggests itself is NOT here. "It comes
 * back at full cap" would be charge injected at a point no window-differencing
 * can see — the A.42 residual, deliberately not made worse. Every grain below
 * is a MEDIUM: a vine banks overflow the field already produced, a sign is a
 * routing fact, a pocket DEFERS charge and hands it back. None is a second
 * source, and none touches `cellCap`, `cellRegen` or `chipYield`.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import { MAX_MACHINE_TIER, TIER_PART_COST, ensurePlant, noteBuiltOf, tierOf } from './plant';
import { conditionOf } from './condition';
import { isLooted } from './roll';
import { allAuthoredStations } from '../content/rolls';

/** The wreck it is found in — Hollow, The Unbuilt 178. Authored with the shell. */
export const FRAME_WRECK = 'THE RECONSTRUCTION FRAME';

export const GRAINS = ['seeded', 'poled', 'pocketed'] as const;
export type GrainId = (typeof GRAINS)[number];

export interface GrainDef {
  id: GrainId;
  name: string;
  /** Said plainly on the card. A grain is chosen, never rolled. */
  does: string;
  flavor: string;
}

export const GRAIN_DEFS: GrainDef[] = [
  {
    id: 'seeded', name: 'Seeded',
    does: 'It comes back already vined, so what you carried out of Verdance has somewhere to stand.',
    flavor: 'You put a cell of rock back and something was already growing on it.',
  },
  {
    id: 'poled', name: 'Poled',
    does: 'It comes back with a sign, so a chain can start there.',
    flavor: 'It remembers which way it used to point, which is more than the rest of this place manages.',
  },
  {
    id: 'pocketed', name: 'Pocketed',
    does: 'It comes back holding a pocket — charge deferred, and something in it.',
    flavor: 'Whatever was in this cell when the world stopped is still in it.',
  },
];

export const GRAIN_BY_ID = new Map(GRAIN_DEFS.map((g) => [g.id, g]));

export const TIER_CAPABILITY_FRAME = [
  'not built',
  'one grain, spent on the next cell you buy back',
  '...and the frame holds the pattern, for every cell after',
  '...and two grains on one cell',
] as const;

export interface FrameState {
  /** Grains set for the next rebuild, in order chosen. */
  grains: GrainId[];
  /** Tier II: keep them set after a rebuild instead of spending them. */
  hold: boolean;
  /** Grains that have actually come back in a cell — a small Codex. */
  laid: GrainId[];
}

export function defaultFrameState(): FrameState {
  return { grains: [], hold: false, laid: [] };
}

export function ensureFrame(state: GameState): FrameState {
  const f = (state.frame ??= defaultFrameState());
  f.grains ??= [];
  f.laid ??= [];
  f.hold ??= false;
  return f;
}

export function frameStation(): { shellId: string; depth: number; name: string } | null {
  const f = allAuthoredStations().find((s) => s.def.wreck === FRAME_WRECK);
  return f ? { shellId: f.shellId, depth: f.def.depth, name: f.def.name } : null;
}

export function frameFound(state: GameState): boolean {
  const at = allAuthoredStations().find((s) => s.def.wreck === FRAME_WRECK);
  return at ? isLooted(state, at.def.id) : false;
}

export function frameBuilt(state: GameState): boolean {
  return tierOf(state, 'frame') > 0;
}

/** Tier II: the pattern stays set. */
export function holdsPattern(state: GameState): boolean {
  return tierOf(state, 'frame') >= 2;
}

/** How many grains one cell may carry. Tier III lays two. */
export function grainSlots(state: GameState): number {
  const t = tierOf(state, 'frame');
  return t <= 0 ? 0 : t >= 3 ? 2 : 1;
}

export function nextFrameTierCost(state: GameState): number | null {
  const t = tierOf(state, 'frame');
  if (t >= MAX_MACHINE_TIER) return null;
  return TIER_PART_COST[t + 1] ?? null;
}

export function buildFrame(state: GameState, ctx: EngineCtx): ActionResult {
  if (!frameFound(state)) {
    const at = frameStation();
    return { ok: false, reason: at ? `It is still in the wreck at ${at.name}.` : 'No Frame.' };
  }
  const cost = nextFrameTierCost(state);
  if (cost === null) return { ok: false, reason: 'The Frame is at its last tier' };
  const rack = state.casting.rack ?? [];
  if (rack.length < cost) {
    return { ok: false, reason: `Needs ${cost} cast parts on the rack (you have ${rack.length})` };
  }
  const order = [...rack].sort((a, b) => (a.purity ?? 0) - (b.purity ?? 0));
  const taken = order.slice(0, cost);
  const spend = new Set(taken.map((p) => p.id));
  state.casting.rack = rack.filter((p) => !spend.has(p.id));
  noteBuiltOf(state, 'frame', taken.map((p) => p.materialId));
  const plant = ensurePlant(state);
  plant.tiers['frame'] = tierOf(state, 'frame') + 1;
  ensureFrame(state);
  ctx.dirty();
  ctx.emit({ type: 'machineBuilt', machineId: 'frame', tier: plant.tiers['frame']! });
  return { ok: true, data: { tier: plant.tiers['frame'] } };
}

// ---------------------------------------------------------------------------
// Choosing the physics
// ---------------------------------------------------------------------------

export function grainsSet(state: GameState): GrainId[] {
  return state.frame?.grains ?? [];
}

export function grainBlocker(state: GameState, grain: GrainId): string | null {
  if (!frameBuilt(state)) return 'The Frame is not standing.';
  if (conditionOf(state, 'frame')?.seized) return 'The jig has gone out of true. Re-cast it.';
  if (!GRAIN_BY_ID.has(grain)) return 'No such grain.';
  if (grainsSet(state).includes(grain)) return null;      // taking one off is free
  if (grainsSet(state).length >= grainSlots(state)) {
    return grainSlots(state) === 1
      ? 'This Frame lays one grain at a time. A deeper one lays two.'
      : 'Two is all it will hold.';
  }
  return null;
}

/** Set or clear one grain. Clearing is free — a plan you cannot change is a trap. */
export function setGrain(state: GameState, ctx: EngineCtx, grain: GrainId): ActionResult {
  const blocked = grainBlocker(state, grain);
  if (blocked) return { ok: false, reason: blocked };
  const f = ensureFrame(state);
  const at = f.grains.indexOf(grain);
  if (at >= 0) f.grains.splice(at, 1);
  else f.grains.push(grain);
  ctx.dirty();
  return { ok: true, data: { grains: [...f.grains] } };
}

/** Tier II's switch: spend the pattern, or keep it. */
export function setHold(state: GameState, ctx: EngineCtx, hold: boolean): ActionResult {
  if (!holdsPattern(state)) return { ok: false, reason: 'This Frame spends its grain. A deeper one holds it' };
  ensureFrame(state).hold = hold;
  ctx.dirty();
  return { ok: true, data: { hold } };
}

/**
 * WHAT A REBUILT CELL COMES BACK AS — called by `absence.ts` at the end of a
 * rebuild that has already succeeded, and only there.
 *
 * It cannot refuse the rebuild, cannot change its price and cannot rebuild
 * anything; every branch below writes ONE cell's medium and nothing else.
 */
export function applyGrain(state: GameState, cell: number): GrainId[] {
  if (!frameBuilt(state)) return [];
  const f = ensureFrame(state);
  const laying = f.grains.slice(0, grainSlots(state));
  if (laying.length === 0) return [];
  for (const g of laying) {
    if (g === 'seeded') {
      // A vine, at its first stage. `growth.ts` takes it from there, on its
      // own rules — nothing here touches a constant or a timer.
      const gr = state.growth;
      if (gr) {
        while (gr.stage.length <= cell) gr.stage.push(0);
        while (gr.fruit.length <= cell) gr.fruit.push(0);
        while (gr.age.length <= cell) gr.age.push(0);
        while (gr.fullSince.length <= cell) gr.fullSince.push(0);
        gr.stage[cell] = 1;
        gr.age[cell] = 0;
      }
    } else if (g === 'poled') {
      const p = state.polarity;
      if (p) {
        while (p.signs.length <= cell) p.signs.push(1);
        p.signs[cell] = 1;
      }
    } else if (g === 'pocketed') {
      // The ore system's own medium. A pocket DEFERS charge and returns it —
      // it is not a second source, which is why this grain is allowed.
      const ore = (state.face.ore ??= []);
      while (ore.length <= cell) ore.push('');
      // The universal seam — the one pocket every shell has had from the first
      // minute, so the grain can never name an ore this shell does not roll.
      if (!ore[cell]) ore[cell] = 'fatseam';
    }
    if (!f.laid.includes(g)) f.laid.push(g);
  }
  if (!f.hold) f.grains = [];
  return laying;
}

/** What the panel says — the UI computes nothing. */
export function frameRead(state: GameState): {
  built: boolean; tier: number; slots: number; grains: GrainId[]; hold: boolean; laid: GrainId[];
} {
  return {
    built: frameBuilt(state),
    tier: tierOf(state, 'frame'),
    slots: grainSlots(state),
    grains: grainsSet(state),
    hold: state.frame?.hold ?? false,
    laid: state.frame?.laid ?? [],
  };
}
