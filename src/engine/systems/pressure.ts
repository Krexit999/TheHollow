/**
 * PRESSURE — Cinder's signature, and the game's first failure state.
 *
 * Heat (0-100) accumulates as you mine: every manual chip stokes it, drills
 * add a little, and the rock itself runs hotter the deeper you stand. Yield
 * scales with heat — ×(1 + (heat/100)³ · 2.2), the best income in the game
 * at the top of the gauge, deliberately convex: the last ten degrees hold
 * most of the money. If heat reaches 100 and stays there through the
 * OVERPRESSURE countdown, the shaft FLOODS: the run ends, paying nothing.
 *
 * THE FOUR LAWS (from the Phase 9 charter, enforced by construction):
 *
 *  1. A flood costs the run, never permanent progress. floodRun() is a
 *     Collapse that pays zero Cores. Records, Codex, materials, tools,
 *     boards, rep — everything that survives a Collapse survives a flood.
 *
 *  2. AN IDLE PLAYER CAN NEVER FLOOD. The Damper (auto-vent, always on,
 *     free) governs any shaft nobody has chipped for IDLE_GRACE_SEC: idle
 *     heat converges to the hold-line, WHICH IS ALWAYS BELOW 100, from
 *     either side. Idle sources are clamped under vent capacity in the same
 *     branch, so the clamp is not a tuning outcome — it is the code path.
 *     A choked shaft un-chokes itself when you walk away: the crew will
 *     not tend a fire you abandoned. (Unit-tested; sim-verified 16h.)
 *
 *  3. A flood is always foreseeable: heat is one number, the face glows
 *     with it, OVERPRESSURE is a 45-second named countdown, and the
 *     EMERGENCY PURGE (always available, costs a quarter of held Slag)
 *     drops 60 heat instantly. THE GOVERNOR makes the opt-in literal:
 *     with the vents open, heat physically cannot pass holdLine+15 (≤90) —
 *     ordinary mining, however furious, never floods. Only CHOKING the
 *     vents (or Array overdrive) defeats the relief valve, and releasing
 *     it mid-klaxon sheds heat fast enough to always be an escape.
 *
 *  4. The tension is voluntary. The safe line (Damper hold-line, raised by
 *     the Vent Network) stays viable — meaningfully slower, never fatal.
 *     The network is what buys headroom: better routing = hotter safely,
 *     for the idler (higher hold-line) and the pusher (faster venting).
 *
 * CARRY-DOWN (Hollow/Aleph): heat accrues and pays at carried strength but
 * is HARD-CAPPED at 90 — heat that matters, and cannot flood.
 */
import { D } from '../decimal';
import type { ModifierCache } from '../modifiers';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { registerSignature } from '../signatures';
import { allCurrencies } from '../resources';
import { allUpgrades, stat } from '../upgrades';
import { coreNodeLevel } from '../content/shell1/coreTree';
import { applyFieldSize, cellCap } from './face';
import { runFaceReset } from '../signatures';
import { resetCompaction } from './compaction';
import { chipCurrencyId, currentShell } from '../shells';
import { lawFlag, sealed, challengeNum } from '../laws';
import { masteryLevel } from './mastery';
import { logScar, resetShaftRun } from './shaftSys';

// ---------------------------------------------------------------------------
// Tuning surface (every number named; the sim's three heat policies audit it)
// ---------------------------------------------------------------------------

export const HEAT_YIELD = 1.9; // ×(1 + (heat/100)³ · this · strength) — convex:
// the last ten degrees hold most of the money, which is the whole argument.
// Measured (sim, 6h active): safe line ~×1, greedy band ≈ ×2.2-2.4 total.
export const CHIP_HEAT = 0.55; // heat per manual chip
export const DRILL_HEAT = 0.05; // heat per drill strike
export const AMBIENT_BASE = 0.05; // heat/s at depth 0
export const AMBIENT_DEEP = 0.4; // + this × depth/floor
export const BASE_VENT = 0.9; // heat/s with no network
export const CHOKE_VENT_MULT = 0.25; // choked vents barely breathe
export const IDLE_GRACE_SEC = 45; // no manual chip for this long = Damper governs
export const HOLD_LINE_BASE = 25; // Damper idles the shaft this warm...
export const HOLD_LINE_PER_CAP = 18; // ...plus this per point of network capacity
export const HOLD_LINE_MAX = 75; // and never hotter than this
export const CARRY_HEAT_CAP = 90; // carried-down heat cannot reach the flood line
/** THE GOVERNOR: with the vents OPEN, heat cannot pass holdLine + this — a
 * relief valve only the choke (or Array overdrive) defeats. Flooding
 * therefore requires an explicit, labeled opt-in, never mere activity. */
export const ACTIVE_MARGIN = 15;
export const GOVERNOR_MAX = 90; // unchoked heat never exceeds this, ever
export const RELIEF_RATE = 3; // heat/s the reopened valve sheds above the governor
export const OVERPRESSURE_SEC = 45; // the countdown
export const OVERPRESSURE_CLEAR = 95; // dropping under this clears it
/** The klaxon only speaks when 100 is HELD — grazing the pin for a substep
 * while riding the band must not cry wolf, or the warning stops warning. */
export const OVERPRESSURE_FUSE_SEC = 2;
export const PURGE_HEAT = 60; // emergency purge drops this much
export const PURGE_SLAG_COST = 0.25; // ...for a quarter of held slag
export const FLOOD_RESIDUAL_HEAT = 20;

// Vent Network: a 7×5 grid of Obsidian pipework. The shaft breathes out of
// the left edge; five outlets sit high and low. Routing = BFS through laid
// pipe; each reached outlet vents 0.5/s with 8% falloff per cell of path.
export const VENT_W = 7;
export const VENT_H = 5;
export const VENT_SHAFT_CELL = 2 * VENT_W + 0; // (row 2, col 0)
export const VENT_OUTLETS = [3, 6, 2 * VENT_W + 6, 4 * VENT_W + 3, 4 * VENT_W + 6];
export const OUTLET_VENT = 0.5;
export const VENT_FALLOFF = 0.92;
export const MAX_PIPES = 24;
/** Sections that join without a gasket (Part B export spine). Twelve covers
 *  the full three-outlet route the heat sim's every stance lays — the flood
 *  guarantees never touch the gate. Pipes 13-24 want a Glasseal each. */
export const FREE_PIPES = 12;
export const PIPE_COST_BASE = 15;
export const PIPE_COST_RATIO = 1.45;

export function pipeCount(state: GameState): number {
  return state.pressure.pipes.filter((p) => p > 0).length;
}

export function nextPipeCost(state: GameState): number {
  return Math.round(PIPE_COST_BASE * PIPE_COST_RATIO ** pipeCount(state));
}

/** BFS from the shaft through laid pipe; returns vent capacity (heat/s). */
export function networkCapacity(state: GameState): number {
  const pipes = state.pressure.pipes;
  const dist = new Map<number, number>();
  const queue: number[] = [];
  // The shaft mouth connects to any pipe in its cell or orthogonal to it.
  dist.set(VENT_SHAFT_CELL, 0);
  queue.push(VENT_SHAFT_CELL);
  while (queue.length > 0) {
    const cell = queue.shift()!;
    const d = dist.get(cell)!;
    const x = cell % VENT_W;
    const y = Math.floor(cell / VENT_W);
    const neigh: number[] = [];
    if (x > 0) neigh.push(cell - 1);
    if (x < VENT_W - 1) neigh.push(cell + 1);
    if (y > 0) neigh.push(cell - VENT_W);
    if (y < VENT_H - 1) neigh.push(cell + VENT_W);
    for (const n of neigh) {
      if (pipes[n] !== 1 || dist.has(n)) continue;
      dist.set(n, d + 1);
      queue.push(n);
    }
  }
  let cap = 0;
  for (const outlet of VENT_OUTLETS) {
    const d = dist.get(outlet);
    if (d !== undefined && d > 0) cap += OUTLET_VENT * VENT_FALLOFF ** d;
  }
  return cap;
}

export function layPipe(state: GameState, cell: number): ActionResult {
  if (cell < 0 || cell >= VENT_W * VENT_H) return { ok: false, reason: 'Off the board' };
  if (state.pressure.pipes[cell] === 1) {
    // Pulling pipe back up is free — re-routing is the whole game here.
    state.pressure.pipes[cell] = 0;
    return { ok: true, data: { removed: true } };
  }
  if (pipeCount(state) >= MAX_PIPES) return { ok: false, reason: 'No more pipe fits the gallery' };
  const cost = nextPipeCost(state);
  const held = state.currencies['obsidian'] ?? D(0);
  if (held.lt(cost)) return { ok: false, reason: `${cost} Obsidian to cast the section` };
  /**
   * THE EXPORT-SPINE GATE IS GONE (A.72). Sections past the twelfth wanted a
   * Glasseal gasket — Glassmere's export, cast at the Bench — and both roads to
   * one (cast it, or buy it from Serra) went with the Bench and the Guild. A
   * requirement nothing can ever satisfy is not a decision, it is a wall with
   * no door; dropped rather than left standing.
   */
  state.currencies['obsidian'] = held.sub(cost);
  state.pressure.pipes[cell] = 1;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The heat model
// ---------------------------------------------------------------------------

export function holdLine(state: GameState): number {
  return Math.min(HOLD_LINE_MAX, HOLD_LINE_BASE + networkCapacity(state) * HOLD_LINE_PER_CAP);
}

export function ventRate(state: GameState): number {
  // A.72: weather's 'updraft' bonus is gone with weather.ts — dropped rather
  // than left as a term that can never fire.
  let vent = BASE_VENT + networkCapacity(state);
  if (state.pressure.choke) vent *= CHOKE_VENT_MULT;
  return vent;
}

export function ambientHeatRate(state: GameState): number {
  const floor = currentShell(state).floorDepth || 470;
  return AMBIENT_BASE + AMBIENT_DEEP * Math.min(1, state.depth / floor);
}

/**
 * A.72: the Ember Array's 'overdrive' flag is gone with the Array — it always
 * read as "not overdriving" once nothing can ever set it, so the term is
 * dropped rather than left as permanent dead weight on every call.
 */
export function heatIdle(state: GameState): boolean {
  return state.stats.playTimeSec - state.pressure.lastStokeSec > IDLE_GRACE_SEC;
}

export function yieldMult(state: GameState, strength: number): number {
  return 1 + (state.pressure.heat / 100) ** 3 * HEAT_YIELD * strength;
}

/** The current ceiling: 100 only while the vents are deliberately defeated. */
export function heatCeiling(state: GameState, native: boolean): number {
  // THE HELD BREATH (challenge): the Governor is off and the relief valve is
  // welded shut. Nothing quietly saves you from your own plumbing — which is
  // the whole point of the run, and the only way to feel what it was doing.
  if (sealed(state, 'sealGovernor')) return native ? 100 : CARRY_HEAT_CAP;
  if (state.pressure.choke) {
    // THE SEALED SEAM (law): the choke keeps a safety seam at 97 — you can
    // never flood, and you can never touch the top of the gauge. A trade.
    if (lawFlag(state, 'sealedSeam')) return Math.min(native ? 97 : CARRY_HEAT_CAP, 97);
    return native ? 100 : CARRY_HEAT_CAP;
  }
  return Math.min(native ? GOVERNOR_MAX : CARRY_HEAT_CAP, holdLine(state) + ACTIVE_MARGIN);
}

function addHeat(state: GameState, amount: number, native: boolean): void {
  // The same challenge doubles the rate the gauge climbs at.
  if (amount > 0) amount *= challengeNum(state, 'heatRateMult', 1);
  // Additions clamp to the ceiling; heat already above it (you just released
  // the choke at 98) is not teleported down — the relief valve decays it.
  const ceiling = Math.max(heatCeiling(state, native), Math.min(state.pressure.heat, 100));
  state.pressure.heat = Math.max(0, Math.min(ceiling, state.pressure.heat + amount));
  if (state.pressure.heat > state.pressure.peakHeat) state.pressure.peakHeat = state.pressure.heat;
}

function tickPressure(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number, strength: number): void {
  const p = state.pressure;
  const native = strength >= 1 && currentShell(state).id === 'cinder';
  const vent = ventRate(state);
  const idle = heatIdle(state);

  // The crew will not tend a fire you abandoned: choke releases when idle.
  if (idle && p.choke) {
    p.choke = false;
    ctx.emit({ type: 'chokeReleased', reason: 'idle' });
  }

  let sources = ambientHeatRate(state) * strength + p.drillHeatPending / Math.max(dt, 0.001);
  p.drillHeatPending = 0;

  if (idle) {
    // THE DAMPER (pillar 1, by construction): an untended shaft converges to
    // the hold-line from either side. Sources are clamped under the vents in
    // this same branch — idle heat CANNOT rise past the line, ever.
    const line = native ? holdLine(state) : Math.min(holdLine(state), CARRY_HEAT_CAP);
    if (p.heat > line) {
      const fall = Math.max(vent - Math.min(sources, vent * 0.8), 0.5);
      addHeat(state, -Math.min(fall * dt, p.heat - line), native);
    } else if (p.heat < line) {
      addHeat(state, Math.min(sources * dt, line - p.heat), native);
    }
  } else {
    addHeat(state, (sources - vent) * dt, native);
    // THE GOVERNOR'S RELIEF: with the vents open, anything above the ceiling
    // sheds fast — unchoking during the klaxon is always a real escape.
    if (!p.choke) {
      const ceiling = heatCeiling(state, native);
      if (p.heat > ceiling) {
        const shed = Math.min(RELIEF_RATE * dt, p.heat - ceiling);
        p.heat -= shed;
        p.ventedTotal += shed;
      }
    }
  }
  p.ventedTotal += vent * dt;

  // Overpressure & the flood — native Cinder only. Carried heat caps at 90.
  if (!native) {
    p.overpressureAtSec = null;
    return;
  }
  if (p.heat < 100) p.fuseAtSec = null;
  else if (p.fuseAtSec === null) p.fuseAtSec = state.stats.playTimeSec;
  if (
    p.heat >= 100 &&
    p.overpressureAtSec === null &&
    p.fuseAtSec !== null &&
    state.stats.playTimeSec - p.fuseAtSec >= OVERPRESSURE_FUSE_SEC
  ) {
    p.overpressureAtSec = state.stats.playTimeSec;
    p.overpressures += 1;
    // Entering the klaxon un-chokes the vents unless you are actively riding
    // it (a manual chip in the last 20s) — the failure needs your hands on it.
    if (p.choke && state.stats.playTimeSec - p.lastStokeSec > 20) {
      p.choke = false;
      ctx.emit({ type: 'chokeReleased', reason: 'overpressure' });
    }
    ctx.emit({ type: 'overpressure', secondsLeft: OVERPRESSURE_SEC });
  }
  if (p.overpressureAtSec !== null) {
    if (p.heat < OVERPRESSURE_CLEAR) {
      p.overpressureAtSec = null;
      ctx.emit({ type: 'overpressureCleared' });
    } else if (state.stats.playTimeSec - p.overpressureAtSec >= OVERPRESSURE_SEC) {
      floodRun(state, mods, ctx);
    }
  }
}

// ---------------------------------------------------------------------------
// The flood — a Collapse that pays nothing
// ---------------------------------------------------------------------------

export function floodRun(state: GameState, mods: ModifierCache, ctx: EngineCtx): void {
  const p = state.pressure;
  const depthLost = state.depth;
  // The column remembers where the water took you — a scar on the shaft wall.
  logScar(state, ctx, 'flood', depthLost);

  // Exactly a Collapse's resets — and none of its payout.
  const retained = 4 * coreNodeLevel(state, 'momentum');
  for (const def of allUpgrades()) {
    if (!def.resetsOnCollapse) continue;
    state.upgrades[def.id] = Math.min(stat(state, def.id), retained);
  }
  for (const cur of allCurrencies()) {
    if (cur.resetsOnCollapse) state.currencies[cur.id] = D(0);
  }
  state.depth = 0;
  resetShaftRun(state); // the run's cleared floor washes with the flood; the rail holds
  state.kiln.heat = 0;
  state.kiln.progress = D(0);

  p.heat = FLOOD_RESIDUAL_HEAT;
  p.overpressureAtSec = null;
  p.choke = false;
  p.floods += 1;

  ctx.dirty();
  applyFieldSize(state, mods);
  state.face.cells = new Array(state.face.w * state.face.h).fill(cellCap(state, mods));
  runFaceReset(state, 'collapse'); // signatures treat a flood as a collapse
  resetCompaction(state); // ...and the worked rock goes with it
  ctx.emit({ type: 'flood', depth: depthLost });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function setChoke(state: GameState, on: boolean): ActionResult {
  if (currentShell(state).id !== 'cinder') return { ok: false, reason: 'Only Cinder runs hot enough to choke' };
  state.pressure.choke = on;
  if (on) state.pressure.lastStokeSec = state.stats.playTimeSec;
  return { ok: true };
}

export function emergencyPurge(state: GameState, ctx: EngineCtx): ActionResult {
  const chipId = chipCurrencyId(state);
  const held = state.currencies[chipId] ?? D(0);
  state.currencies[chipId] = held.mul(1 - PURGE_SLAG_COST);
  addHeat(state, -PURGE_HEAT, true);
  state.pressure.ventedTotal += PURGE_HEAT;
  ctx.emit({ type: 'purged', heat: state.pressure.heat });
  return { ok: true, data: { heat: state.pressure.heat } };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerPressure(): void {
  registerSignature({
    id: 'pressure',
    shellId: 'cinder',
    name: 'Pressure',
    hooks: {
      chipMult(state, _mods, _ctx, _cell, strength, manual) {
        const mult = yieldMult(state, strength);
        const native = currentShell(state).id === 'cinder';
        if (manual) {
          addHeat(state, CHIP_HEAT * strength, native);
          state.pressure.lastStokeSec = state.stats.playTimeSec;
        } else {
          // Drills stoke gently, batched into the next tick so the idle
          // branch can clamp them (the Damper law needs one code path).
          state.pressure.drillHeatPending += DRILL_HEAT * strength;
        }
        return mult;
      },
      onFaceTick(state, mods, ctx, dt, strength) {
        tickPressure(state, mods, ctx, dt, strength);
      },
      onFaceReset(state, _strength, cause) {
        if (cause === 'collapse' || cause === 'breach') {
          state.pressure.heat = Math.min(state.pressure.heat, FLOOD_RESIDUAL_HEAT);
          state.pressure.overpressureAtSec = null;
          state.pressure.choke = false;
        }
      },
      // In the Hollow: heat still pays, capped at 90, and cannot flood —
      // the void has no seam to choke. Warmth is just worth more out here.
      voidTick: (s, _m, _dt, strength) =>
        0.4 * strength * (1 + (s.pressure.heat / 100) * 1.2) * (1 + 0.08 * masteryLevel(s, 'cinder')),
    },
  });
}

export function defaultPressureState(): GameState['pressure'] {
  return {
    heat: 0,
    choke: false,
    overpressureAtSec: null,
    fuseAtSec: null,
    lastStokeSec: -9999,
    drillHeatPending: 0,
    pipes: new Array(VENT_W * VENT_H).fill(0),
    ventedTotal: 0,
    floods: 0,
    overpressures: 0,
    peakHeat: 0,
  };
}
