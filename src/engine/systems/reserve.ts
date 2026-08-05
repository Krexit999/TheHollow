/**
 * RESERVE (§25.5) — any stack marked reserved in one tap is untouchable.
 *
 * §25.5 lists four automation problems and a lever for each. The first is *"it
 * consumes what you were saving"*, and the lever is this flag. It is the thing
 * that makes automation safe to point at a Hold you care about: without it,
 * every filter is a bet that the Circuit agrees with you about what matters.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS REPLACES THE PIN. It does not sit beside it.
 *
 * A.85 wired `qol.pins` into exactly ONE consumer — the Circuit's "run the
 * Crusher" act — with a comment saying the RESERVE flag "is what this build
 * already has as `qol.pins`". That was true of the storage and false of the
 * behaviour: a pinned stack was safe from one act of one machine and fair game
 * for the other thirteen. A safety primitive honoured in one place out of
 * fourteen is worse than none, because it reads as protection.
 *
 * So the ARRAY is kept (no migration, nobody loses a pin) and the MEANING is
 * promoted: `qol.pins` is now the reserve list, this module owns what it means,
 * and the Circuit reads `isReserved` like everyone else rather than reaching
 * into `qol` itself. One flag, one tap, fourteen consumers.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LAW 9 — NO TOLLS. Reserving costs nothing, un-reserving costs nothing, and
 * both are the same tap on the same row. A reserve you had to pay to set would
 * be a toll on caution, and a reserve you could not undo would be a trap.
 *
 * PILLAR 2 — IT WITHHOLDS AND NEVER PRODUCES. There is no path from this file
 * to `cellCap`, `cellRegen` or `chipYield`; it cannot add a unit, raise a band,
 * or change what anything pays. The only thing it does is turn a `null` from a
 * blocker into a sentence. `reserve.test.ts` reserves the entire Hold and reads
 * the ceiling unmoved.
 *
 * WHY IT GUARDS THE BLOCKERS AND NOT `consumeMaterial`: the seam would be
 * tidier, but every machine in this codebase already answers "why can I not do
 * this" with a NAMED sentence, and a reserve that silently made a verb a no-op
 * would be the worst kind of protection. Refusing by name at the blocker is
 * what the brief asks for and what the player needs — and `reserve.test.ts`
 * enumerates the consumers so a new machine cannot quietly skip it.
 */
import type { GameState } from '../types';
import { materialDef } from '../materials';

/**
 * IS THIS STACK RESERVED. The one question, asked by everything.
 *
 * Reads `qol.pins` because that is where a player's "I care about this one"
 * has always been stored — see the header. Nothing else should touch that array
 * directly, and `reserve.test.ts` asserts nothing does.
 */
export function isReserved(state: GameState, materialId: string): boolean {
  return state.qol?.pins?.includes(materialId) ?? false;
}

/** Every reserved stack, for the panel and for the automation pickers. */
export function reservedList(state: GameState): string[] {
  return [...(state.qol?.pins ?? [])];
}

/**
 * THE REFUSAL, and it names the stone and the way out.
 *
 * Null when the stack is free. Every machine blocker returns this before it
 * looks at anything else about the material, so "it is reserved" is the first
 * thing you are told rather than the last.
 */
export function reservedBlocker(state: GameState, materialId: string): string | null {
  if (!isReserved(state, materialId)) return null;
  let name = materialId;
  try { name = materialDef(materialId).name; } catch { /* unknown stone */ }
  return `${name} is reserved. Tap it in the Hold to release it.`;
}

/** ...and the same question for a whole recipe's worth of inputs. */
export function anyReserved(state: GameState, materialIds: string[]): string | null {
  for (const id of materialIds) {
    const blocked = reservedBlocker(state, id);
    if (blocked) return blocked;
  }
  return null;
}

/**
 * WHAT AUTOMATION MAY PICK FROM. A machine a player is standing at REFUSES a
 * reserved stack by name; a machine choosing for itself must never have been
 * looking at it in the first place, or the Circuit would spend its whole cycle
 * failing on the one stack you protected.
 *
 * Two behaviours from one flag, and the difference is who is choosing.
 */
export function unreserved<T extends { materialId: string }>(
  state: GameState, candidates: T[],
): T[] {
  return candidates.filter((c) => !isReserved(state, c.materialId));
}

/** One tap, both ways. The action layer calls this; nothing else writes pins. */
export function toggleReserve(state: GameState, materialId: string): boolean {
  const pins = (state.qol.pins ??= []);
  const at = pins.indexOf(materialId);
  if (at >= 0) {
    pins.splice(at, 1);
    return false;
  }
  pins.push(materialId);
  return true;
}
