/**
 * THE DEAD, in play (§48.1).
 *
 * FOUND BY WALKING PAST, and by nothing else. `markReached` already has the
 * one place in this codebase where "the player has now physically been at this
 * depth" is true — it is where a wall clears, a wreck is looted and a crew's
 * finding resolves. A ghost is hung on the same hook rather than given a verb,
 * because "go down there" is not a button and §48.1's whole claim is that these
 * things are somewhere real rather than in a menu.
 *
 * PERMANENT, like `cleared` and `looted`. A Collapse re-rolls what a station is
 * HOLDING; it does not un-happen the fact that you stood there and picked
 * something up off the floor. Survives Breach and Recursion too: what you know
 * about the dead is the one thing in this game nothing takes back.
 *
 * PAYS NOTHING. There is no call to `addMaterial`, `addCurrency`, `grantGear`,
 * or any modifier from this file, and `dead.test.ts` §5 reads `dpsMax` at a
 * fixed depth with zero objects and with all thirty-six and asserts the two are
 * equal. §48.3's Long Shelf is a RECORD and this is the record.
 *
 * THE ABSENCE IS THE MECHANIC and it is computed, never authored. A delver's
 * trail CLOSES when you have found everything of theirs AND then gone deeper
 * than the deepest of it — at which point you have walked the ground where the
 * next one would have been and there was nothing on it. Only then does the
 * epitaph read, and only then does the room say where they stopped. Nothing
 * announces it; it resolves quietly the next time you look.
 */
import type { EngineCtx, GameState } from '../types';
import { DEAD, ALL_OBJECTS, DELVER_OF, type Delver, type DelverObject } from '../content/dead';
import { authoredRoll } from '../content/rolls';

export interface DeadState {
  /** Object ids picked up, ever. Permanent through every reset layer. */
  found: string[];
  /** Delver ids whose trail has closed. Derived, but stored so the moment it
   *  happens can be a feed line exactly once instead of a recomputed truth. */
  closed: string[];
}

export function defaultDeadState(): DeadState {
  return { found: [], closed: [] };
}

export function ensureDead(state: GameState): DeadState {
  if (!state.dead) state.dead = defaultDeadState();
  if (!Array.isArray(state.dead.found)) state.dead.found = [];
  if (!Array.isArray(state.dead.closed)) state.dead.closed = [];
  return state.dead;
}

export function hasFound(state: GameState, objectId: string): boolean {
  return state.dead?.found?.includes(objectId) === true;
}

/**
 * The depth an object lies at — read off the STATION, never stored beside it.
 * A station that moves takes its ghost with it, and a ghost placed at a station
 * that does not exist is a test failure rather than a silent depth of zero.
 */
export function depthOf(o: DelverObject): number {
  const def = authoredRoll(o.shell).find((d) => d.id === o.station);
  return def ? def.depth : -1;
}

/** Sorted shallowest-first, which is the order they will be found in. */
export function trailOf(delver: Delver): DelverObject[] {
  return [...delver.objects].sort((a, b) => depthOf(a) - depthOf(b));
}

// ---------------------------------------------------------------------------
// Finding
// ---------------------------------------------------------------------------

/**
 * Everything of the dead lying at or above `depth` in `shell` that has not been
 * picked up. Called from `markReached` with the depth actually reached, so an
 * unbroken descent past three of them finds three.
 */
export function findAt(state: GameState, ctx: EngineCtx, shell: string, depth: number): string[] {
  const d = ensureDead(state);
  const newly: string[] = [];
  for (const o of ALL_OBJECTS) {
    if (o.shell !== shell) continue;
    const at = depthOf(o);
    if (at < 0 || at > depth) continue;
    if (d.found.includes(o.id)) continue;
    d.found.push(o.id);
    newly.push(o.id);
    ctx.emit({ type: 'delverObjectFound', objectId: o.id, delverId: DELVER_OF[o.id]!.id });
  }
  if (newly.length) closeTrails(state, ctx);
  return newly;
}

// ---------------------------------------------------------------------------
// The absence
// ---------------------------------------------------------------------------

/**
 * TRUE when you have found all of a delver's objects and have since been deeper
 * than the last of them — in their own shell, or in any shell below it.
 *
 * That second clause is the whole point. Having every object is not knowing
 * they stopped; it is knowing they got that far. You learn they STOPPED by
 * walking the ground underneath the last thing they left and finding it empty,
 * which is a thing you do while descending anyway and never on purpose.
 */
export function trailClosed(state: GameState, delver: Delver): boolean {
  const d = ensureDead(state);
  if (!delver.objects.every((o) => d.found.includes(o.id))) return false;
  const last = trailOf(delver)[delver.objects.length - 1]!;
  const lastDepth = depthOf(last);
  const order = SHELL_ORDER.indexOf(last.shell);
  for (const [shell, rec] of Object.entries(state.depthRecords ?? {})) {
    const i = SHELL_ORDER.indexOf(shell);
    if (i < 0 || i < order) continue;
    if (i > order) return true;
    if ((rec ?? 0) > lastDepth) return true;
  }
  return false;
}

/** Descent order. Read from the shell registry would be circular at module
 *  scope; this list is asserted against `allShells()` in test. */
const SHELL_ORDER = ['loam', 'ferrite', 'verdance', 'glassmere', 'cinder', 'hollow', 'aleph'];

function closeTrails(state: GameState, ctx: EngineCtx): void {
  const d = ensureDead(state);
  for (const delver of DEAD) {
    if (d.closed.includes(delver.id)) continue;
    if (!trailClosed(state, delver)) continue;
    d.closed.push(delver.id);
    ctx.emit({ type: 'delverTrailClosed', delverId: delver.id });
  }
}

/**
 * Re-checks every trail without finding anything. Hung off the descent so a
 * trail that completes by GOING DEEPER — rather than by picking something up —
 * still closes. Without this, a player who found Peel's last object at 33 and
 * then dug to 150 would never be told Peel stopped.
 */
export function tickDead(state: GameState, ctx: EngineCtx): void {
  ensureDead(state);
  closeTrails(state, ctx);
}

// ---------------------------------------------------------------------------
// Reading the record
// ---------------------------------------------------------------------------

export interface TrailRow {
  delver: Delver;
  /** Objects in depth order, with whether this one is in hand. */
  objects: { o: DelverObject; depth: number; found: boolean }[];
  /** Every object found. Not the same as closed. */
  complete: boolean;
  /** The absence has been walked. Only now does `stopped` read. */
  closed: boolean;
}

/**
 * ONLY DELVERS YOU HAVE MET. A room listing twelve names with eleven greyed out
 * is exactly the locked list pillar 5 and LAW 3 both forbid — the twelve are
 * not a collection to complete, they are people you keep running into.
 */
export function trailRows(state: GameState): TrailRow[] {
  const d = ensureDead(state);
  const rows: TrailRow[] = [];
  for (const delver of DEAD) {
    const objects = trailOf(delver).map((o) => ({ o, depth: depthOf(o), found: d.found.includes(o.id) }));
    if (!objects.some((x) => x.found)) continue;
    rows.push({
      delver,
      objects,
      complete: objects.every((x) => x.found),
      closed: d.closed.includes(delver.id),
    });
  }
  return rows;
}

/** How many of the thirty-six are in hand. The room's one number, and it is a
 *  count of what you have seen, never a completion target. */
export function foundCount(state: GameState): number {
  return ensureDead(state).found.length;
}

export function deadOpen(state: GameState): boolean {
  return foundCount(state) > 0;
}
