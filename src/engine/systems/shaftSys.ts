/**
 * THE SHAFT — the column is a place, not a one-way chute.
 *
 * Three ideas, one slice:
 *
 *  1. DESCENT IS NO LONGER ONE-WAY. `state.depth` is now a WORKING position you
 *     can move up and down. Re-treading rock you have already cleared THIS RUN
 *     is free; only NEW ground (past `reached`) pays the locked descend formula.
 *     Climbing up is always free. Income still comes from the face at your
 *     working depth, so climbing shallow earns LESS — going up is access, never
 *     a farm (pillar 2 holds: a revisited depth is a door, not a second till).
 *
 *  2. INFRASTRUCTURE SURVIVES COLLAPSE. A RAIL is laid per shell, to a depth,
 *     with Cores. It persists through the cave-in when face upgrades do not, and
 *     it DISCOUNTS re-descent to railed rock — the "return to peak" after a
 *     Collapse. It never makes new ground free: the marginal deepest step always
 *     pays full freight, so the Collapse loop's floor is untouched. The sim
 *     (scripts/shaft-verify.ts) proves the cadence stays bounded.
 *
 *  3. THE COLUMN REMEMBERS. Scars — floods, wardens faced, breaches — are logged
 *     at the depth they happened, a bounded record the Shaft view draws so a
 *     long-running player reads their own history off the wall without labels.
 *
 * Headless: no imports from React/Pixi/DOM.
 */
import { Decimal } from '../decimal';
import type { ActionResult, EngineCtx, GameState } from '../types';
import { currentShell } from '../shells';
import { getCurrency, spendCurrency, addCurrency } from '../resources';
import { materialCount, consumeMaterial, addMaterial } from './forge';
import { cureFor, HOUR_MS } from './curing';
import { EXCAVATION_BY_ID } from '../content/excavations';
import { grantRelic } from './relics';

export type ScarKind = 'flood' | 'warden' | 'breach' | 'well' | 'station';

export interface ShaftScar {
  shell: string;
  depth: number;
  kind: ScarKind;
  /** Guild clock ms when it happened — a rough "when", for ordering only. */
  atMs: number;
}

/**
 * A cache is storage installed at a depth. It holds ONE stack of a stone left to
 * cure (see curing.ts); `material: null` means empty. It moves material in SPACE
 * — from the Hold down into the deep — and time changes it there. It never
 * changes the COUNT, so it is a convenience, never a yield. It SURVIVES Collapse.
 */
export interface CacheSlot {
  shell: string;
  depth: number;
  material: string | null;
  qty: number;
  purity: number;
  /** Guild-clock ms the cure began (0 when empty). Real time, offline included. */
  startedMs: number;
}

export interface ShaftState {
  /** Deepest depth reached since the last Collapse. New ground past this pays. */
  reached: number;
  /** Rail extent per shell id — the deepest railed depth. SURVIVES Collapse. */
  rail: Record<string, number>;
  /** A bounded record of what happened where, newest last. For the view. */
  scars: ShaftScar[];
  /** Storage installed on the column. SURVIVES Collapse; surfaces on Breach. */
  caches: CacheSlot[];
  /** Per shell: is the lift fitted to the rail (rides down in one action). */
  lift: Record<string, boolean>;
  /** Cure recipes DISCOVERED, by id — the Codex of patience (pillar 5). */
  curesFound: string[];
  /** Excavation SHIFTS cleared per site id — permanent, survives Collapse. */
  digs: Record<string, number>;
  /** The depth a dig-shift was last worked at, so a site takes one shift per
   *  visit; reset to -1 the moment you move, forcing a climb-and-return. */
  lastDigDepth: number;
}

export function defaultShaftState(): ShaftState {
  return { reached: 0, rail: {}, scars: [], caches: [], lift: {}, curesFound: [], digs: {}, lastDigDepth: -1 };
}

export const MAX_CACHES_PER_SHELL = 4;
export const CACHE_CAP = 25; // a cache holds this much of one stone — the honesty cap
export const CACHE_CORE_BASE = 3; // Cores for the first cache in a shell
export const LIFT_CORE_COST = 12;

/** The re-descent discount for railed rock. A bounded speedup, never free. */
export const RAIL_DISCOUNT = 0.5;
/** Cores to lay rail, per depth of NEW rail. Kept cheap enough to be worth it,
 *  dear enough that you buy it once you are deep, not on the first collapse. */
export const RAIL_CORE_PER_DEPTH = 0.5;
const SCAR_CAP = 120; // the wall only holds so many marks; oldest fade

/** The deepest point this run — what a Collapse pays out on. */
export function shaftPeak(state: GameState): number {
  return Math.max(state.depth, state.shaft.reached);
}

/** Rail extent for the current shell (0 if none). */
export function railDepth(state: GameState): number {
  return state.shaft.rail[currentShell(state).id] ?? 0;
}

/**
 * The descend-cost multiplier for reaching `targetDepth` right now:
 *  - free (0) if it is rock already cleared this run (re-tread),
 *  - discounted if the rail reaches it,
 *  - full otherwise.
 * Multiplies the base `descendCost(targetDepth)` in depthSys.
 */
export function descendMultiplier(state: GameState, targetDepth: number): number {
  if (targetDepth <= state.shaft.reached) return 0; // already cleared — walk down free
  if (targetDepth <= railDepth(state)) return RAIL_DISCOUNT; // the rail carries you
  return 1;
}

/** Keep `reached` in step after a descent to new ground. */
export function noteReached(state: GameState): void {
  if (state.depth > state.shaft.reached) state.shaft.reached = state.depth;
}

/** Reset the run column on Collapse. The RAIL is NOT touched — it is the point. */
export function resetShaftRun(state: GameState): void {
  state.shaft.reached = 0;
}

// ---------------------------------------------------------------------------
// CLIMB — retreat up your own shaft, free, through cleared rock
// ---------------------------------------------------------------------------

/**
 * Walk to a depth you have already cleared THIS RUN — up or down, free. New
 * ground below the cleared floor is not reachable this way: that is the stair's
 * job (descend), and it pays. `to` omitted means one step up.
 */
export function climb(state: GameState, ctx: EngineCtx, to?: number): ActionResult {
  const target = to === undefined ? state.depth - 1 : Math.floor(to);
  if (target < 0) return { ok: false, reason: 'You are already at the surface of this shaft.' };
  if (target > state.shaft.reached) {
    return { ok: false, reason: 'You have not cleared that deep this run. Take the stair down.' };
  }
  if (target === state.depth) return { ok: false, reason: 'You are already standing here.' };
  state.depth = target; // cleared rock is free to walk, in either direction
  state.shaft.lastDigDepth = -1; // moving frees the next dig-shift (come-and-return)
  ctx.dirty(); // Depth Pressure changed
  ctx.emit({ type: 'climb', depth: state.depth });
  return { ok: true, data: { depth: state.depth } };
}

/** Moving frees the next excavation shift — called by descend too. */
export function clearDigStop(state: GameState): void {
  state.shaft.lastDigDepth = -1;
}

// ---------------------------------------------------------------------------
// RAIL — lay infrastructure that outlives the Collapse
// ---------------------------------------------------------------------------

/** Cost in Cores to extend the rail from its current extent to the working depth. */
export function railExtendCost(state: GameState): Decimal {
  const shell = currentShell(state);
  const from = state.shaft.rail[shell.id] ?? 0;
  const added = Math.max(0, state.depth - from);
  return new Decimal(Math.ceil(added * RAIL_CORE_PER_DEPTH));
}

export function extendRail(state: GameState, ctx: EngineCtx): ActionResult {
  const shell = currentShell(state);
  const from = state.shaft.rail[shell.id] ?? 0;
  if (state.depth <= from) {
    return { ok: false, reason: 'The rail already reaches here. Go deeper to extend it.' };
  }
  if (state.depth <= 0) return { ok: false, reason: 'Nothing to rail at the surface.' };
  const cost = railExtendCost(state);
  if (getCurrency(state, 'core').lt(cost)) {
    return { ok: false, reason: `The rail needs ${cost.toString()} Cores of iron.` };
  }
  spendCurrency(state, 'core', cost);
  state.shaft.rail[shell.id] = state.depth;
  logScar(state, ctx, 'station', state.depth);
  ctx.dirty();
  ctx.emit({ type: 'railExtended', shell: shell.id, depth: state.depth });
  return { ok: true, data: { depth: state.depth, shell: shell.id } };
}

// ---------------------------------------------------------------------------
// SCARS — the column's memory
// ---------------------------------------------------------------------------

export function logScar(state: GameState, _ctx: EngineCtx, kind: ScarKind, depth: number): void {
  if (depth <= 0) return;
  const shell = currentShell(state).id;
  const scars = state.shaft.scars;
  // Dedup: one mark of a kind per (shell, depth) — the wall does not repeat itself.
  if (scars.some((s) => s.shell === shell && s.depth === depth && s.kind === kind)) return;
  scars.push({ shell, depth, kind, atMs: state.guild?.clockMs ?? 0 });
  if (scars.length > SCAR_CAP) scars.splice(0, scars.length - SCAR_CAP);
}

// ---------------------------------------------------------------------------
// CACHES — storage on the column that outlives the Collapse
// ---------------------------------------------------------------------------

export function cachesOf(state: GameState, shellId = currentShell(state).id): CacheSlot[] {
  return state.shaft.caches.filter((c) => c.shell === shellId);
}

/** Cores to install the next cache in this shell — dearer the more you own. */
export function cacheInstallCost(state: GameState): Decimal {
  const n = cachesOf(state).length;
  return new Decimal(CACHE_CORE_BASE * (n + 1)); // 3, 6, 9, 12
}

export function installCache(state: GameState, ctx: EngineCtx): ActionResult {
  const shell = currentShell(state).id;
  if (state.depth <= 0) return { ok: false, reason: 'There is nothing to cache at the surface.' };
  if (cachesOf(state).length >= MAX_CACHES_PER_SHELL) {
    return { ok: false, reason: `This shell holds ${MAX_CACHES_PER_SHELL} caches at most.` };
  }
  if (state.shaft.caches.some((c) => c.shell === shell && c.depth === state.depth)) {
    return { ok: false, reason: 'A cache already sits at this depth.' };
  }
  const cost = cacheInstallCost(state);
  if (getCurrency(state, 'core').lt(cost)) {
    return { ok: false, reason: `A cache costs ${cost.toString()} Cores to shore up.` };
  }
  spendCurrency(state, 'core', cost);
  state.shaft.caches.push({ shell, depth: state.depth, material: null, qty: 0, purity: 0, startedMs: 0 });
  ctx.dirty();
  ctx.emit({ type: 'cacheInstalled', depth: state.depth });
  return { ok: true, data: { depth: state.depth } };
}

/** Remove an EMPTY cache (frees a slot to install elsewhere). No refund. */
export function removeCache(state: GameState, ctx: EngineCtx, index: number): ActionResult {
  const cache = state.shaft.caches[index];
  if (!cache) return { ok: false, reason: 'No such cache.' };
  if (cache.material) return { ok: false, reason: 'Empty it before you pull the cache.' };
  state.shaft.caches.splice(index, 1);
  ctx.dirty();
  return { ok: true };
}

/**
 * Deposit a curable stone into an empty cache — it begins to cure. Moves the
 * stone from the Hold to the deep; NOTHING is created. Refuses a stone that will
 * not change, or a cache too shallow for it (the stone needs the deep).
 */
export function depositCache(state: GameState, ctx: EngineCtx, index: number, materialId: string, qty: number): ActionResult {
  const cache = state.shaft.caches[index];
  if (!cache) return { ok: false, reason: 'No such cache.' };
  if (cache.material) return { ok: false, reason: 'This cache is already holding something.' };
  const recipe = cureFor(materialId);
  if (!recipe) return { ok: false, reason: 'That stone will not change no matter how long it sits.' };
  if (cache.depth < recipe.minDepth) {
    return { ok: false, reason: `This stone needs the deep — a cache at ${recipe.minDepth} or below.` };
  }
  const n = Math.min(Math.floor(qty), CACHE_CAP, materialCount(state, materialId));
  if (n < 1) return { ok: false, reason: 'Nothing to leave here.' };
  const purity = consumeMaterial(state, materialId, n);
  if (purity === null) return { ok: false, reason: 'Short of that stone.' };
  cache.material = materialId;
  cache.qty = n;
  cache.purity = purity;
  cache.startedMs = state.guild?.clockMs ?? 0;
  ctx.dirty();
  ctx.emit({ type: 'cacheDeposited', materialId, qty: n });
  return { ok: true, data: { materialId, qty: n } };
}

/** 0..1 progress of the cure in a cache (1 = ready; stays 1 forever after). */
export function cacheProgress(state: GameState, cache: CacheSlot): number {
  if (!cache.material) return 0;
  const recipe = cureFor(cache.material);
  if (!recipe) return 1;
  const elapsed = (state.guild?.clockMs ?? 0) - cache.startedMs;
  return Math.max(0, Math.min(1, elapsed / (recipe.hours * HOUR_MS)));
}

export function cacheReady(state: GameState, cache: CacheSlot): boolean {
  return cache.material !== null && cacheProgress(state, cache) >= 1;
}

/**
 * Take from a cache. A finished cure returns the CHANGED stone (same count) and
 * writes the recipe into the Codex. Pulling early returns the ORIGINAL stone,
 * uncured — nothing is ever lost, nothing is ever missed.
 */
export function collectCache(state: GameState, ctx: EngineCtx, index: number): ActionResult {
  const cache = state.shaft.caches[index];
  if (!cache || !cache.material) return { ok: false, reason: 'This cache is empty.' };
  const recipe = cureFor(cache.material);
  const ready = cacheReady(state, cache);
  const from = cache.material;
  const qty = cache.qty;
  const purity = cache.purity;

  if (recipe && ready) {
    addMaterial(state, recipe.to, purity, qty);
    const isNew = !state.shaft.curesFound.includes(recipe.id);
    if (isNew) { state.shaft.curesFound.push(recipe.id); ctx.emit({ type: 'cureFound', id: recipe.id, to: recipe.to }); }
    cache.material = null; cache.qty = 0; cache.purity = 0; cache.startedMs = 0;
    ctx.dirty();
    ctx.emit({ type: 'cacheCollected', materialId: recipe.to, qty, cured: true });
    return { ok: true, data: { materialId: recipe.to, qty, cured: true, isNew } };
  }

  // Early, or a non-curing stone: give back exactly what was left.
  addMaterial(state, from, purity, qty);
  cache.material = null; cache.qty = 0; cache.purity = 0; cache.startedMs = 0;
  ctx.dirty();
  ctx.emit({ type: 'cacheCollected', materialId: from, qty, cured: false });
  return { ok: true, data: { materialId: from, qty, cured: false } };
}

/** Breach leaves the shell: surface every cache's contents to the Hold, then
 *  clear this shell's caches. Nothing curing is ever lost to a Breach. */
export function surfaceCaches(state: GameState, ctx: EngineCtx, shellId: string): void {
  for (const cache of state.shaft.caches) {
    if (cache.shell !== shellId || !cache.material) continue;
    const recipe = cureFor(cache.material);
    const give = recipe && cacheReady(state, cache) ? recipe.to : cache.material;
    if (recipe && cacheReady(state, cache) && !state.shaft.curesFound.includes(recipe.id)) {
      state.shaft.curesFound.push(recipe.id);
    }
    addMaterial(state, give, cache.purity, cache.qty);
  }
  state.shaft.caches = state.shaft.caches.filter((c) => c.shell !== shellId);
  ctx.dirty();
}

// ---------------------------------------------------------------------------
// LIFT — ride the rail you built, in one action (never past the rail head)
// ---------------------------------------------------------------------------

export function hasLift(state: GameState): boolean {
  return !!state.shaft.lift[currentShell(state).id];
}

export function installLift(state: GameState, ctx: EngineCtx): ActionResult {
  const shell = currentShell(state).id;
  if (hasLift(state)) return { ok: false, reason: 'The lift is already fitted here.' };
  if ((state.shaft.rail[shell] ?? 0) <= 0) {
    return { ok: false, reason: 'The lift rides the rail. Lay some rail first.' };
  }
  const cost = new Decimal(LIFT_CORE_COST);
  if (getCurrency(state, 'core').lt(cost)) {
    return { ok: false, reason: `The lift costs ${LIFT_CORE_COST} Cores.` };
  }
  spendCurrency(state, 'core', cost);
  state.shaft.lift[shell] = true;
  ctx.dirty();
  ctx.emit({ type: 'liftInstalled', shell });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// EXCAVATION — clearing a thing too big to chip, a shift per visit
// ---------------------------------------------------------------------------

export function digShifts(state: GameState, id: string): number {
  return state.shaft.digs[id] ?? 0;
}
export function excavationDone(state: GameState, id: string): boolean {
  const site = EXCAVATION_BY_ID.get(id);
  return !!site && digShifts(state, id) >= site.stages.length;
}

/**
 * Work one shift at the excavation you are standing on. A shift reveals the next
 * stage; the last reveals what it IS and yields a one-time keepsake. You get ONE
 * shift per stop — moving away and back (the Shaft's own verb) frees the next,
 * which is what makes a big dig a thing you finish across many visits.
 */
export function workExcavation(state: GameState, ctx: EngineCtx, id: string): ActionResult {
  const site = EXCAVATION_BY_ID.get(id);
  if (!site) return { ok: false, reason: 'Nothing to dig there.' };
  if (state.shell.current !== site.shell || state.depth !== site.depth) {
    return { ok: false, reason: 'You have to be standing on it to work it.' };
  }
  if (excavationDone(state, id)) return { ok: false, reason: 'This one is fully uncovered.' };
  if (state.shaft.lastDigDepth === state.depth) {
    return { ok: false, reason: 'You have done a shift here. Move off it and come back for the next.' };
  }

  const shift = digShifts(state, id) + 1;
  state.shaft.digs[id] = shift;
  state.shaft.lastDigDepth = state.depth;
  const done = shift >= site.stages.length;

  if (done && site.find) {
    // A one-time keepsake — never an income. Granted once, on the last shift.
    if (site.find.scrip) addCurrency(state, 'scrip', new Decimal(site.find.scrip));
    if (site.find.renown) addCurrency(state, 'renown', new Decimal(site.find.renown));
    if (site.find.relic) grantRelic(state, ctx, 'excavation');
  }
  ctx.dirty();
  ctx.emit({ type: done ? 'digComplete' : 'digShift', id, name: site.name, shift });
  return { ok: true, data: { id, shift, done, reveal: site.stages[shift - 1] } };
}
