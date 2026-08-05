/**
 * RAISE A WRECK, in a fixture, the way the game does it (A.106).
 *
 * Six machines are now gated on the named place they are lying in — THE KILN at
 * Loam 9, A DRILL at 28, CRUSHER at 47, REFINERY at 60, THE READING at 98 — so
 * a test that builds a Crusher has to have been to The Long Cut first, exactly
 * like a player.
 *
 * This exists so that fact is written down ONCE. Twenty-seven tests across ten
 * files broke on the wiring, and the temptation with that many is to reach past
 * the gate in each of them (set `plant.tiers.crusher = 1` and move on), which
 * would leave ten fixtures quietly asserting a world the game cannot produce.
 * The helper writes the SAME state the game writes: the station id into
 * `roll.looted`, which is what `markReached` does when you walk past it.
 *
 * It resolves the station through `wreckStation`, so a wreck that moves takes
 * every fixture with it, and a wreck that is deleted fails loudly here rather
 * than silently unlocking nothing.
 */
import { wreckStation } from '../systems/roll';
import type { GameState } from '../types';

export function raiseWreck(state: GameState, wreck: string): void {
  const at = wreckStation(wreck);
  if (!at) throw new Error(`no station carries the wreck "${wreck}"`);
  const roll = (state.roll ??= { rolled: {}, cleared: [], looted: [], rolls: 0 });
  roll.looted ??= [];
  if (!roll.looted.includes(at.def.id)) roll.looted.push(at.def.id);
}

/** The five Loam machines a mid-game fixture normally assumes it has walked to. */
export function raiseLoamWrecks(state: GameState): void {
  for (const w of ['THE KILN', 'A DRILL', 'CRUSHER', 'REFINERY', 'THE READING']) {
    raiseWreck(state, w);
  }
}
