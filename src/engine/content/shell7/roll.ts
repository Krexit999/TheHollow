/**
 * THE ROLL — ALEPH'S SIX STATIONS (§1.3, §0.5.3, §49.2).
 *
 * The seventh and last authored geography, and the smallest by a distance:
 * §1.3 says six, `shellDef('aleph').floorDepth` says 40, and §49.2 refuses to
 * lift it on purpose — "it is forty depths and a composite exam by design.
 * Giving it more would make it a shell it is not."
 *
 * NO WALLS, for the second time. `shellDef('aleph').walls` is `[]`, so this
 * authors none — same three consequences as Hollow's (nothing is ever
 * `cleared`, no station asks for a tool tier, the landmark horizon is carried
 * by wrecks). Here it barely registers, because at six stations everything is
 * a landmark.
 *
 * WHERE THE NAMES COME FROM. §6's keystone table authors two exactly:
 *
 *   The Author's Cut 16   THE AXIOM ENGINE   "tiers XIV-XV unreachable"
 *   The Reading Room 32   THE SEATING        "the game does not end"
 *
 * The other four are invented under the freedom clause.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RARITY GATES AND THIS SHELL'S FLOOR DISAGREE, and the Roll cannot fix it.
 *
 * `RARITY_GATES` opens the bands at absolute depths — common 0, rich 10, pure
 * 40, flawless 70, starred 110, aberrant 150 — and its own comment says those
 * are Shell-I depths. Aleph's floor is 40. So THREE of Aleph's ten materials
 * sit above the deepest band this shell can ever roll:
 *
 *   alephite   flawless   gate 70    unreachable from Aleph rock
 *   worldseed  starred    gate 110   unreachable from Aleph rock
 *   paradoxa   aberrant   gate 150   unreachable from Aleph rock
 *
 * That is PRE-EXISTING — it has been true since Phase 10 — and it is a gate
 * problem, not a geography one: no arrangement of six stations inside forty
 * depths can seam a stone the drop table will not produce there. So this file
 * does not pretend. The three are absent from every pool below, `authorsInk`
 * came down one band so its rescue actually fires (see `materials.ts`), and the
 * gap is ledgered rather than papered over with a seam that lies.
 *
 * The consequence for the pool shape: THE CORE is the only station in the shell
 * at or past depth 40, so it is the only one that can hold a `pure` seam, and
 * it holds all three of them. The five above it split two commons and two
 * riches between them, which is why the shallow pools repeat.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ALEPH'S SIGNATURE IS LOCKED and is `absence` — the void follows you to the
 * Core; the rock here is the FIRST rock. Nothing in this file touches it.
 */
import type { StationDef } from '../shell1/roll';

/** Stations a player passes but which hold no seam: their contents are the place. */
const NO_SEAM: string[] = [];

/**
 * ALEPH'S ONE REMAINS (§16.4, the A.84 mechanism, seventh and last shell).
 *
 *   authorsInk   THE CORE 40   the pen is bolted to the desk, and the desk is here
 *
 * ONE PLACE, not the usual two, and that is forced rather than chosen: at
 * `pure` its gate is depth 40 and THE CORE is the only station in the shell at
 * that depth. Same shape as Loam's Tapmother's Root and Ferrite's Loadstar Core
 * — the floor keeps its own — arrived at from the other direction.
 */

export const ALEPH_ROLL: StationDef[] = [
  {
    // ONE CANDIDATE, and it is forced: `firstiron` is Aleph's only common and a
    // depth-0 station can hold nothing else. Its seam is the one thing in the
    // game the §1.1 re-roll cannot move, which is a fair thing for the first
    // rock to be.
    id: 'thefirstrock', depth: 0, name: 'The First Rock', type: 'seam',
    seams: ['firstiron'],
    line: 'It is the rock every other rock has been a copy of, and it is completely unremarkable.',
  },
  {
    id: 'themargin', depth: 10, name: 'The Margin', type: 'seam',
    seams: ['firstiron', 'protolith', 'axiomdust'],
    line: 'A narrow strip down the side of everything, where the notes go. Most of the notes are yours.',
  },
  {
    // §6, kept exactly: "The Author's Cut 16 — THE AXIOM ENGINE — tiers XIV-XV
    // unreachable".
    id: 'authorscut', depth: 16, name: "The Author's Cut", type: 'wreck', wreck: 'THE AXIOM ENGINE',
    seams: ['protolith', 'axiomdust'],
    line: 'A clean edit through forty feet of rock. Whatever was written here is not missing; it was never written.',
  },
  {
    id: 'longsentence', depth: 24, name: 'The Long Sentence', type: 'rest',
    seams: NO_SEAM,
    line: 'It goes on, and it has not finished, and there is a chair partway down it.',
  },
  {
    // §6, kept exactly: "The Reading Room 32 — THE SEATING — the game does not
    // end".
    id: 'readingroom', depth: 32, name: 'The Reading Room', type: 'wreck', wreck: 'THE SEATING',
    seams: ['protolith', 'axiomdust'],
    line: 'Seven seats around a table, six of them pushed in. Nobody has sat here and everybody has.',
  },
  {
    id: 'thecore', depth: 40, name: 'THE CORE', type: 'floor',
    seams: ['axiomite2', 'sigilstone', 'lawgold'], remains: ['authorsInk'],
    line: 'The floor of the last world. The desk is bolted down. The pen is on it.',
  },
];

export function alephRoll(): StationDef[] {
  return ALEPH_ROLL;
}
