/**
 * THE UNMINEABLE — one per shell, at a fixed depth, that no tool has ever marked.
 *
 * The premise of the whole game is a world of shells inside shells. This is where
 * you touch that literally: the wall of the shell, the boundary, made somewhere
 * you can put a hand on it. You cannot chip it, ever. It is not a puzzle and it is
 * not a door (Sable checked, for years).
 *
 * It does three things, none of which are a reward track:
 *  1. IT READS YOU. The deeper you have gone, the more Recursions you have run,
 *     the more Axioms you have written — the more it shows. A mirror, not a prize.
 *  2. SABLE'S MARKS ARE ON IT. Her ending is that the world resets and the writing
 *     survives, so her marks belong on the one thing that persists through
 *     everything — and they come back in a DIFFERENT ORDER each Recursion.
 *  3. AXIOMS ACT ON IT. You cannot chip it, but you can rewrite the rules, and a
 *     law you wrote is the only thing that has ever changed one.
 *
 * Headless: pure data + a reader that folds current state into the lines to show.
 */
import type { GameState } from '../types';

export interface ShellWall {
  shell: string;
  /** The fixed depth it sits at — near the floor, but not the floor (that Breaches). */
  depth: number;
  name: string;
}

export const SHELL_WALLS: ShellWall[] = [
  { shell: 'loam', depth: 130, name: 'The Seam That Does Not Give' },
  { shell: 'ferrite', depth: 220, name: 'The Cold Face' },
  { shell: 'verdance', depth: 260, name: 'The Rootless Stone' },
  { shell: 'glassmere', depth: 340, name: 'The Clear Wall' },
  { shell: 'cinder', depth: 420, name: 'The Unburnt Slab' },
  { shell: 'hollow', depth: 500, name: 'The Wall That Is Not Absent' },
  { shell: 'aleph', depth: 33, name: 'The First Wall' },
];

export const WALL_BY_SHELL = new Map(SHELL_WALLS.map((w) => [w.shell, w]));

/** The mirror — lines about YOU, revealed by how far you have come. */
const MIRROR = [
  'The stone here takes no tool. It never has. This is the wall of the shell: the world\'s edge, made somewhere you can lay a hand on it.',
  'You came all the way down to it. It is exactly as unmoved as everyone who came this far before you.',
  'You have stood here in a world that does not exist any more. The wall did not notice the world end. It noticed you come back.',
  'The rules you rewrote reached even this deep. There are lines on the stone now that were not on it the first time you fell.',
];

/** SABLE'S MARKS. Scratched, out of order, older than your tools. They come back
 *  in a different order every time the world does. */
export const SABLE_MARKS = [
  'I could not dig it either. So I wrote on it instead.',
  'Everything I made washed away. This did not. Draw your own conclusion. I drew mine.',
  'A shell, inside a shell, inside a shell. Count them if you like. I stopped counting.',
  'If you are reading this you have fallen at least as far as I did. Hello, then.',
  'It is not a door. I checked. I checked for a very long time.',
  'The marks return in a new order each time the world does. I think that is the point. I think I am the point.',
];

export interface WallReading {
  name: string;
  depth: number;
  mirror: string[];
  marks: string[];
  law: string[];
}

/** What the wall of `shellId` shows right now, folding depth, Recursion and
 *  written Axioms into the reading. Pure — no state written. */
export function wallReading(state: GameState, shellId: string): WallReading | null {
  const wall = WALL_BY_SHELL.get(shellId);
  if (!wall) return null;
  const deepestHere = state.depthRecords[shellId] ?? 0;
  const reachedIt = deepestHere >= wall.depth;
  const rec = state.recursion.count;
  const axioms = state.recursion.axioms;

  const mirror = [MIRROR[0]!];
  if (reachedIt) mirror.push(MIRROR[1]!);
  if (rec >= 1) mirror.push(MIRROR[2]!);
  if (axioms.length >= 3) mirror.push(MIRROR[3]!);

  // THE FIRST WORD (Axiom) is the one that reads the writing whole — Sable's own
  // ending, made mechanical. Otherwise the marks reveal with depth and Recursion.
  const showAll = axioms.includes('firstWord');
  const reveal = showAll
    ? SABLE_MARKS.length
    : Math.min(SABLE_MARKS.length, 2 + rec + (reachedIt ? 1 : 0));
  const rot = rec % SABLE_MARKS.length; // a different order each Recursion
  const marks: string[] = [];
  for (let i = 0; i < reveal; i++) marks.push(SABLE_MARKS[(i + rot) % SABLE_MARKS.length]!);

  // Axioms are gone (A.7x); the wall never changes now — `axioms` stays empty.
  const law: string[] = axioms.map((id) => `${id} — a law you wrote, and it reached this deep.`);

  return { name: wall.name, depth: wall.depth, mirror, marks, law };
}
