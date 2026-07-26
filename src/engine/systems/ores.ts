/**
 * ORES — the runtime. Defs and the odds live in content/ores.ts; this is the
 * spawning, the dig, and what happens when a pocket opens.
 *
 * THE ONE INVARIANT EVERYTHING HERE PROTECTS: an ore raises a cell's CAP and
 * nothing else. `dpsMax = W·H·regen·Y` has no cap term, so no amount of ore can
 * move the ceiling — you are always taking charge the rock itself produced,
 * just concentrated and on a delay. The reward for the delay is paid in DROPS,
 * which sit outside the income path. See content/ores.ts for the full argument.
 *
 * SPAWNING has three rules and they pull against each other on purpose:
 *   TRICKLE  — a low steady chance, so ore is a thing you NOTICE rather than a
 *              thing the grid is made of.
 *   CAP      — never more than a fifth of the face, so the grid never becomes
 *              a field of timers.
 *   DROUGHT  — but never a full minute with none, either. A grid with nothing
 *              in it is the failure this feature exists to fix, so a dry minute
 *              forces a real seeding. The floor is a SAFETY NET, not a faucet:
 *              it only fires from zero, and the trickle stays low so it is rare.
 */
import type { EngineCtx, GameState, ActionResult } from '../types';
import type { ModifierCache } from '../modifiers';
import { D } from '../decimal';
import { cellCap, harvestCell } from './face';
import { rollForOre } from './drops';
import { runChipMult } from '../signatures';
import { currentShell } from '../shells';
import { oreDef, rollOreType } from '../content/ores';

/** Never more than a fifth of the face is pocket. */
export const ORE_CAP_SHARE = 0.20;
/** Per-second chance a new pocket forms. Low: ore is an event, not terrain. */
export const ORE_SPAWN_CHANCE = 0.022;
/** A dry minute is a dead grid. */
export const ORE_DROUGHT_SEC = 60;
/** What the drought floor seeds up to — enough to see, well under the cap. */
export const ORE_DROUGHT_SHARE = 0.15;
/** Chance a pocket comes up as a vein rather than a lone cell. */
export const ORE_VEIN_CHANCE = 0.4;
export const ORE_VEIN_MIN = 2;
export const ORE_VEIN_MAX = 5;

/** How full a pocket must be before a machine thinks it worth six seconds. */
export const ORE_WORTH_OPENING = 0.7;

/** A drill opens a pocket FASTER than hands can... */
export const DRILL_ORE_SPEED = 0.8;
/** ...but is not thorough, and leaves this share of it in the rock. */
export const DRILL_ORE_SHARE = 0.85;
/**
 * ...and gets only this FRACTION of a pocket's guaranteed pulls.
 *
 * Sized against the sim, not by feel. A bay opens ~130 pockets an hour, so a
 * whole roll each measured twenty-six times the baseline drop economy — a
 * pillar-1 violation on the material gate even though pillar 2 never noticed.
 * The hand keeps whole rolls because it is rate-limited by attention and no
 * upgrade can inflate that; the bay gets a fraction, resolved as a probability.
 */
export const DRILL_ORE_ROLL_SHARE = 0.15;

// --- reading the face ------------------------------------------------------

function oreArray(state: GameState): string[] {
  const want = state.face.cells.length;
  let arr = state.face.ore;
  if (!Array.isArray(arr) || arr.length !== want) {
    arr = new Array(want).fill('');
    state.face.ore = arr;
  }
  return arr;
}

function digArray(state: GameState): number[] {
  const want = state.face.cells.length;
  let arr = state.face.oreDug;
  if (!Array.isArray(arr) || arr.length !== want) {
    arr = new Array(want).fill(0);
    state.face.oreDug = arr;
  }
  return arr;
}

/** The ore in this cell, or null for plain rock. */
export function oreAt(state: GameState, cell: number) {
  const id = state.face.ore?.[cell];
  return id ? oreDef(id) : null;
}

export function isOre(state: GameState, cell: number): boolean {
  return !!state.face.ore?.[cell];
}

/** How many cells are pocket right now. */
export function oreCount(state: GameState): number {
  return (state.face.ore ?? []).reduce((n, id) => (id ? n + 1 : n), 0);
}

/**
 * THE CAP FOR ONE CELL — the whole mechanism, in one function. A pocket holds
 * more; everything else about it is the same rock. Every reader of `cellCap`
 * that works per-cell must come through here, or a pocket silently behaves
 * like plain rock and the feature is a texture.
 */
export function cellCapAt(state: GameState, mods: ModifierCache, cell: number): number {
  const base = cellCap(state, mods);
  const def = oreAt(state, cell);
  return def ? base * def.richness : base;
}

/** How far along the hand-dig on this cell is, 0..1 — the face draws it. */
export function digProgress(state: GameState, cell: number): number {
  const def = oreAt(state, cell);
  if (!def) return 0;
  return Math.min(1, (state.face.oreDug?.[cell] ?? 0) / def.digSec);
}

// --- spawning --------------------------------------------------------------

/**
 * Cells that could become pocket: plain rock, not vined, not already one.
 *
 * THE CALL (lodecall, the ore-attract alloy) puts its thumb on this scale. Its
 * text has always been "worked cells draw the richer seam toward them", and
 * until now that only meant a deeper drop roll — a cell it has gathered under
 * is listed TWICE here, so a pocket is likelier to form where that drill has
 * been working. It is a weight, not a guarantee, and it changes WHERE ore
 * appears rather than HOW MUCH: the cap and the trickle rate are untouched, so
 * an attract drill cannot pave the grid.
 */
function spawnable(state: GameState): number[] {
  const ore = oreArray(state);
  const gathered = state.drills.richness;
  const out: number[] = [];
  for (let i = 0; i < ore.length; i++) {
    if (ore[i]) continue;
    if ((state.growth.stage[i] ?? 0) > 0) continue;
    out.push(i);
    if ((gathered?.[i] ?? 0) > 0) out.push(i);
  }
  return out;
}

/** Grow a vein out from a seed cell, orthogonally, through plain rock only. */
function veinFrom(state: GameState, seed: number, size: number, rng: () => number): number[] {
  const { w, h } = state.face;
  const ore = oreArray(state);
  const taken = new Set<number>([seed]);
  const out = [seed];
  let guard = 0;
  while (out.length < size && guard++ < 40) {
    const from = out[Math.floor(rng() * out.length)]!;
    const x = from % w;
    const y = Math.floor(from / w);
    const opts: number[] = [];
    if (x > 0) opts.push(from - 1);
    if (x < w - 1) opts.push(from + 1);
    if (y > 0) opts.push(from - w);
    if (y < h - 1) opts.push(from + w);
    const next = opts[Math.floor(rng() * opts.length)];
    if (next === undefined || taken.has(next) || ore[next] || (state.growth.stage[next] ?? 0) > 0) continue;
    taken.add(next);
    out.push(next);
  }
  return out;
}

/**
 * Put one pocket in the rock — a lone cell, or a vein. Returns the cells taken.
 * Respects the cap, so this can return fewer cells than asked for (or none).
 */
export function seedOre(
  state: GameState, mods: ModifierCache, ctx: EngineCtx, rng: () => number = Math.random,
): number[] {
  const ore = oreArray(state);
  const limit = Math.floor(ore.length * ORE_CAP_SHARE);
  const room = limit - oreCount(state);
  if (room <= 0) return [];

  const free = spawnable(state);
  if (free.length === 0) return [];
  const seed = free[Math.floor(rng() * free.length)]!;

  // BOTH PATTERNS: most pockets are a single cell you happen on; some are a
  // run of them. A grid that only ever scattered would read as noise.
  const wantVein = rng() < ORE_VEIN_CHANCE;
  const size = wantVein
    ? ORE_VEIN_MIN + Math.floor(rng() * (ORE_VEIN_MAX - ORE_VEIN_MIN + 1))
    : 1;
  const cells = (size > 1 ? veinFrom(state, seed, size, rng) : [seed]).slice(0, room);

  const shell = currentShell(state).id;
  const lean = mods.get(state, 'oreRarity').toNumber();
  // One type per pocket: a vein is one thing, not a mixed bag.
  const def = rollOreType(shell, state.depth, lean, rng);
  if (!def) return [];
  for (const c of cells) {
    ore[c] = def.id;
    // A fresh pocket starts holding what the cell already held. It does not
    // arrive full — that would be charge nobody's rock produced.
    void mods;
  }
  ctx.emit({ type: 'oreAppeared', cells, oreId: def.id });
  return cells;
}

/**
 * The per-second beat. Trickle, then the drought floor.
 *
 * Deliberately NOT scaled by dt beyond the roll: this runs on the engine's
 * one-second tick like the rest of the slow world, so a warp of an hour gets an
 * hour of chances rather than one enormous one.
 */
export function tickOres(state: GameState, mods: ModifierCache, ctx: EngineCtx, dt: number): void {
  if (state.face.cells.length === 0) return;
  // A WORLD WITH NO ORE IN IT HAS NO ORE IN IT. The drought floor is a safety
  // net for a face that has gone quiet, not a mandate that ore must exist — so
  // if something has zeroed the chance outright (a law, a challenge, a sim
  // control arm) the floor stays out of it. Found from the sim: the "no ore"
  // control arm was seeding four hundred pockets an hour through this exact
  // path, which made every comparison against it meaningless.
  const chanceMult = mods.get(state, 'oreChance').toNumber();
  if (chanceMult <= 0) return;
  const ore = oreArray(state);
  const count = oreCount(state);

  // THE DROUGHT CLOCK. Only runs while the face is completely bare.
  if (count === 0) {
    state.face.oreDryFor = (state.face.oreDryFor ?? 0) + dt;
  } else {
    state.face.oreDryFor = 0;
  }

  if ((state.face.oreDryFor ?? 0) >= ORE_DROUGHT_SEC) {
    // A dry minute: seed properly, once, and reset the clock. Pockets are
    // seeded one at a time so the result is still a mix of veins and singles.
    const want = Math.max(1, Math.round(ore.length * ORE_DROUGHT_SHARE));
    let guard = 0;
    while (oreCount(state) < want && guard++ < 40) {
      if (seedOre(state, mods, ctx).length === 0) break;
    }
    state.face.oreDryFor = 0;
    ctx.emit({ type: 'oreDrought', cells: oreCount(state) });
    return;
  }

  // THE TRICKLE. `oreChance` is the upgradeable frequency; the cap inside
  // seedOre is what keeps a big multiplier from paving the grid.
  const chance = ORE_SPAWN_CHANCE * chanceMult * dt;
  if (Math.random() < chance) seedOre(state, mods, ctx);
}

// --- opening a pocket ------------------------------------------------------

/**
 * WHAT AN ORE PAYS. The charge is whatever the rock had banked in it — this
 * takes a `share` of it exactly as an ordinary harvest would, so it can never
 * be more than the field produced. The DROPS are the reward, rolled deeper for
 * a richer type and outside the income path entirely.
 *
 * BY HAND takes the pocket clean and gets its guaranteed pulls on top. BY DRILL
 * is faster and free, and pays for it twice: it leaves `1 - DRILL_ORE_SHARE` of
 * the charge in the rock, and it gets only the ordinary charge-proportional
 * roll. Neither is dead time, and a player with no drills at all loses nothing —
 * the hand path is the complete one (pillar 1's floor).
 */
export function openOre(
  state: GameState, mods: ModifierCache, ctx: EngineCtx, cell: number,
  by: 'hand' | 'drill',
  dropWeight: number,
  byName?: string,
): { charge: number; oreId: string } | null {
  const def = oreAt(state, cell);
  if (!def) return null;

  const share = by === 'hand' ? 1 : DRILL_ORE_SHARE;
  const sig = runChipMult(state, mods, ctx, cell, by === 'hand');
  const { charge } = harvestCell(state, mods, cell, share, D(sig));

  // The pocket is spent whether or not there was much in it — you opened it.
  oreArray(state)[cell] = '';
  digArray(state)[cell] = 0;

  // FIRST ONE OF ITS KIND IS THE DISCOVERY (pillar 5). Nothing is listed
  // anywhere until a pocket of that type has actually been opened.
  const seen = state.face.oreSeen ?? (state.face.oreSeen = []);
  const first = !seen.includes(def.id);
  if (first) seen.push(def.id);

  /**
   * THE PAYOUT, and this is where the first cut of the feature was wrong.
   *
   * It gave every pocket 1-3 GUARANTEED rolls regardless of who opened it. A
   * sim of two idle hours read 341 drops against a baseline of 13 — twenty-six
   * times — because a guarantee ignores `dropChance` entirely, and at shallow
   * depth where natural drops are rare the guarantee IS the whole economy.
   * Pillar 1 binds the material drop economy at ~5x just as hard as it binds
   * income, so that was a violation even though pillar 2 never noticed.
   *
   * The fix is the fiction, stated properly: a pocket is a DENSER POCKET OF
   * WHAT YOU WERE ALREADY MINING. Its ordinary roll already scales with the
   * charge it held, so a 3.6x pocket is already worth 3.6x a plain cell — no
   * more, which is exactly right. What makes it special is the DEPTH BONUS: it
   * rolls the same table far deeper, so a pocket pays in RARITY rather than in
   * count. That is outside the income path AND outside the count economy.
   *
   * The hand keeps its guaranteed pulls, and can afford to: opening one by hand
   * costs eight to sixteen seconds of the player's attention, so the rate is
   * capped by something no upgrade can inflate. A bay opening eighty an hour
   * has no such brake, which is why it gets none.
   */
  const rolls = by === 'hand' ? def.rolls : def.rolls * DRILL_ORE_ROLL_SHARE;
  // Scaled to the depth you are standing at, plus a floor so a pocket still
  // means something in the first minutes. See OreDef.depthMult for why this
  // stopped being a flat number.
  const deeper = Math.round(state.depth * def.depthMult + 10 * def.depthMult);
  rollForOre(state, mods, ctx, charge, dropWeight, rolls, deeper, byName, cell);

  state.stats.oresOpened = (state.stats.oresOpened ?? 0) + 1;
  ctx.emit({ type: 'oreOpened', cell, oreId: def.id, charge, by, first });
  return { charge, oreId: def.id };
}

/**
 * HAND-WORKING A POCKET. Called from the hold gesture with the seconds elapsed,
 * so the cost is the player's ATTENTION — while you are on this cell you are
 * not chipping anything else, which is exactly what makes handing it to a drill
 * a real alternative rather than a strictly worse one.
 *
 * Progress is per cell and persists if you let go, so a slip does not cost the
 * work. It does NOT decay: an ore you half-opened is a thing you can come back
 * to, and punishing that would just make the gesture tense for no reason.
 */
export function workOre(
  state: GameState, ctx: EngineCtx, cell: number, seconds: number,
): ActionResult {
  const def = oreAt(state, cell);
  if (!def) return { ok: false, reason: 'No pocket there' };
  const dug = digArray(state);
  const before = dug[cell] ?? 0;
  const after = Math.min(def.digSec, before + Math.max(0, seconds));
  dug[cell] = after;
  if (after < def.digSec) {
    return { ok: true, data: { done: false, progress: after / def.digSec } };
  }
  ctx.dirty();
  return { ok: true, data: { done: true, progress: 1 } };
}

/** Has the hand finished this one? The action layer reads it to decide. */
export function digComplete(state: GameState, cell: number): boolean {
  const def = oreAt(state, cell);
  if (!def) return false;
  return (state.face.oreDug?.[cell] ?? 0) >= def.digSec;
}

/** Wipe every pocket — the face is not the same face any more. */
export function clearOres(state: GameState): void {
  state.face.ore = [];
  state.face.oreDug = [];
  state.face.oreDryFor = 0;
}
