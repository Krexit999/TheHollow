/**
 * ABSENCE — the Hollow's signature. There is no rock. No face. Nothing to
 * click. All income is the five carried signatures' voidTick sum (the
 * Phase-10 interface completion, signatures.ts) — the payoff for every
 * Breach, muted by THE SILENCE and spent, in the end, on RECONSTRUCTION.
 *
 * THE SILENCE: a 0-100 stack that mutes carried strength as it climbs
 * (linear, to 70% mute at 100) and converts CONVEXLY into Void when you
 * LISTEN (stacks² scaling). Elsewhere you fight entropy; here you farm it:
 * the whole management question is how loud you dare let the quiet get.
 * The auto-listener (the Damper pattern, again) keeps idle play safe and
 * modest — set a threshold, it harvests there forever.
 *
 * RECONSTRUCTION: buy back the face one phantom cell at a time, at a cost
 * curve that totals more than everything before it. A rebuilt cell is a
 * REAL cell — real cap, real regen, pillar 2 binds — and it hands the
 * carried signatures their medium back: vines on the third cell, a beam
 * across the fifth. Light returning. A whole face opens the way down to
 * the Core. Descending, with no rock, means letting yourself sink deeper
 * into the Silence: it accrues faster and pays richer, and the deeper
 * reconstruction sites only exist below.
 */
import { D, type Decimal } from '../decimal';
import type { ActionResult, EngineCtx, GameState } from '../types';
import type { ModifierCache } from '../modifiers';
import { addCurrency, spendCurrency } from '../resources';
import { registerSignature, runVoidTick } from '../signatures';
import { consumeMaterial, materialCount } from './forge';
import { currentShell } from '../shells';

export const SILENCE_MUTE_MAX = 0.7; // at 100 stacks, carried income runs at 30%
export const SILENCE_PER_MIN_BASE = 1.1; // stacks/min at depth 0...
export const SILENCE_PER_MIN_DEEP = 2.6; // ...+ this × depth/560
export const LISTEN_CONVEXITY = 0.011; // Void per rate-unit per stacks² — the crop
export const RESONANCE_PER_STACK = 0.25; // listening also shakes loose Resonance
export const REBUILD_BASE = 250; // first cell...
export const REBUILD_RATIO = 1.62; // ...then the curve that outweighs the world
export const REBUILD_DEPTH_PER_CELL = 14; // site k wants depth ≥ 14k
export const HOLLOW_FLOOR = 560;

export function inHollow(state: GameState): boolean {
  return currentShell(state).id === 'hollow';
}

/** The muted carried-income rate, Void/sec (pre-listen; the drip). */
export function voidRate(state: GameState, mods: ModifierCache): number {
  const raw = runVoidTick(state, mods, 1);
  const mute = 1 - (state.hollow.silence / 100) * SILENCE_MUTE_MAX;
  const rebuilt = 1 + 0.06 * state.hollow.rebuilt.length; // the face remembers you back
  return raw * mute * rebuilt;
}

export function silenceRatePerMin(state: GameState): number {
  return SILENCE_PER_MIN_BASE + SILENCE_PER_MIN_DEEP * Math.min(1, state.depth / HOLLOW_FLOOR);
}

/** LISTEN: convert the accumulated quiet into Void, convexly. */
export function listen(state: GameState, mods: ModifierCache, ctx: EngineCtx): ActionResult {
  const stacks = state.hollow.silence;
  if (stacks < 1) return { ok: false, reason: 'The quiet is too thin to hold' };
  const raw = runVoidTick(state, mods, 1); // UNMUTED rate — the harvest hears everything
  const gained = D(raw * stacks * stacks * LISTEN_CONVEXITY * (1 + 0.06 * state.hollow.rebuilt.length));
  addCurrency(state, 'void', gained);
  addCurrency(state, 'resonance', D(Math.floor(stacks * RESONANCE_PER_STACK)));
  state.hollow.silence = 0;
  state.hollow.silenceHarvested += stacks;
  ctx.dirty();
  ctx.emit({ type: 'silenceHarvest', stacks, voidGained: gained });
  return { ok: true, data: { stacks, gained } };
}

export function rebuildCost(state: GameState): Decimal {
  return D(REBUILD_BASE).mul(D(REBUILD_RATIO).pow(state.hollow.rebuilt.length));
}

/**
 * The depth site k opens at — 14 per cell, CLAMPED TO THE SHELL FLOOR.
 *
 * The clamp closes a hard wall on the endgame. The schedule was a bare
 * `14 * k` with no relation to how deep the shell actually goes: a default
 * 36-cell face put its last site at 490, comfortably inside the Hollow's 560,
 * but the face is not fixed at 36. Buying `expand` once takes it to 42 cells,
 * whose last site wanted depth 574 — deeper than the shell has floor. The face
 * could then never be whole, and faceWhole() gates the Breach, so a player who
 * bought an ordinary upgrade in the Hollow permanently sealed Aleph and
 * Recursion behind it.
 *
 * Clamping (rather than re-spacing) is deliberate: for every face the shell
 * already paced correctly the returned schedule is UNCHANGED — a test pins
 * that — and past the floor the sites stop being depth-gated and are paced by
 * the Void curve alone, which was always the real cost.
 */
export function rebuildDepthFor(k: number, floorDepth: number): number {
  return Math.min(REBUILD_DEPTH_PER_CELL * k, floorDepth);
}

export function rebuildCell(state: GameState, ctx: EngineCtx, cell: number): ActionResult {
  if (!inHollow(state)) return { ok: false, reason: 'There is nothing to rebuild anywhere else' };
  if (cell < 0 || cell >= state.face.cells.length) return { ok: false, reason: 'Beyond even the absence' };
  if (state.hollow.rebuilt.includes(cell)) return { ok: false, reason: 'That cell already remembers being rock' };
  const k = state.hollow.rebuilt.length;
  const site = rebuildDepthFor(k, currentShell(state).floorDepth);
  if (state.depth < site) {
    return { ok: false, reason: `The ${k + 1}th cell only exists below depth ${site}` };
  }
  // THE EXPORT SPINE (Part B): the ninth cell on is rebuilt IN something —
  // Emberglass, Cinder's export, glass that remembers heat where the void
  // remembers nothing. Annealed at a held burn, or hauled up by Serra.
  const wantsGlass = k >= 8;
  if (wantsGlass && materialCount(state, 'emberglass') < 1) {
    return { ok: false, reason: 'Cells past the eighth want 1 Emberglass — hold the Ember Array in the band, or buy it from Serra' };
  }
  const cost = rebuildCost(state);
  if (!spendCurrency(state, 'void', cost)) return { ok: false, reason: `${cost.toExponential(1)} Void to remember one cell of rock` };
  if (wantsGlass) consumeMaterial(state, 'emberglass', 1);
  state.hollow.rebuilt.push(cell);
  state.hollow.voidSpent = D(state.hollow.voidSpent).add(cost).toString();
  state.face.cells[cell] = 0; // it begins empty. It begins.
  ctx.dirty();
  ctx.emit({ type: 'cellRebuilt', cell, total: state.hollow.rebuilt.length });
  if (state.hollow.rebuilt.length >= state.face.cells.length) ctx.emit({ type: 'faceWhole' });
  return { ok: true };
}

export function faceWhole(state: GameState): boolean {
  return inHollow(state) && state.hollow.rebuilt.length >= state.face.cells.length;
}

function tickAbsence(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number): void {
  if (!inHollow(state)) return;
  const h = state.hollow;
  // The drip: muted carried income, always flowing. Pillar 2 does not bind
  // here BY CONSTRUCTION AND BY STATEMENT: there are no cells generating —
  // this is the shell's own faucet, sized by carry investment, not regen.
  addCurrency(state, 'void', D(voidRate(state, mods) * dt));
  // The Silence climbs.
  h.silence = Math.min(100, h.silence + (silenceRatePerMin(state) / 60) * dt);
  // The auto-listener: the idle floor. Set it and the quiet farms itself.
  if (h.listenAt > 0 && h.silence >= h.listenAt) listen(state, mods, ctx);
}

export function registerAbsence(): void {
  registerSignature({
    id: 'absence',
    shellId: 'hollow',
    name: 'Absence',
    hooks: {
      onFaceTick(state, mods, ctx, dt) {
        tickAbsence(state, mods, ctx, dt);
      },
      onFaceReset(state, _strength, cause) {
        // Collapse in the Hollow: the rebuilt cells SURVIVE (they are the
        // long arc, bigger than any run); only their charge washes.
        if (cause === 'collapse' || cause === 'breach') state.hollow.silence = 0;
      },
    },
  });
}

export function defaultHollowState(): GameState['hollow'] {
  return { silence: 0, listenAt: 0, silenceHarvested: 0, rebuilt: [], voidSpent: '0' };
}
