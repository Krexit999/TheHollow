/**
 * THE UNTOLD (§47 + §49) — things you find by doing something else.
 *
 * §47's seven accidents and §49's seventeen secrets are ONE LIST, not two:
 * §49's rows 1, 3, 5, 7, 9, 11 and 13 ARE the seven, restated. Building them
 * twice would have produced two registries that disagree.
 *
 * WHAT AN ENTRY IS ALLOWED TO PAY, and the rule that made this phase tractable:
 * **nothing**. It POINTS. §49's own table labels eleven of seventeen "puzzle",
 * meaning the secret feeds a system — and a secret that feeds a system reduces
 * to "do X, get Y", which is a QUEST and this phase's brief cuts those on
 * sight. So every entry here resolves to a DESTINATION: a place to go, a thing
 * to go and look at, a shell that is not what you assumed. LAW 3 exactly ("hide
 * recipes, show destinations"), and it makes the whole layer pillar-2-safe by
 * construction rather than by tuning — `untold.test.ts` §4 reads dpsMax at one
 * depth with none known and with all of them.
 *
 * THE TELL IS A MECHANISM, NOT A PROMISE (§49.1). "Accidental" quietly means
 * "never found" unless something is odd first, and §49.1's audit found eleven
 * of seventeen with no tell at all. Rather than seven bespoke UI anomalies in
 * seven panels, every entry carries a NEAR condition: get within reach of it
 * and the world says one strange thing, once, that names nothing. That is
 * §49.1's "suspicious behaviour" category, uniform, and it costs one mechanism
 * instead of seven.
 *
 * ONE PER SHELL, and SIX rather than seven. ALEPH IS CUT, with its blocker
 * named rather than stubbed: §47 wants "CITE a technique onto a cell of its own
 * shell", and there is no CITE verb, no per-cell targeting UI in Aleph, and
 * `AlephState` is two fields (`sigils`, `coreTouched`). There is nothing to do
 * by accident in a shell with no verbs of its own. It stays cut until Aleph has
 * an act that can be fumbled.
 */
import type { GameState } from '../types';

export type UntoldKind =
  /** §47: one per shell, found by doing something else. */
  | 'accident'
  /** §49's pure secrets: they feed nothing and are simply true. */
  | 'secret';

export interface UntoldDef {
  id: string;
  shell: string;
  kind: UntoldKind;
  name: string;
  /** What you did. Shown AFTER, never before — this is not a quest step. */
  did: string;
  /** What it points at. A destination, never a recipe, never a payout. */
  points: string;
  /** The strange thing the world says when you are one step off it (§49.1).
   *  Names nothing. It is meant to make you look, not to tell you. */
  tell: string;
}

export const UNTOLD: UntoldDef[] = [
  {
    id: 'patientcell',
    shell: 'loam',
    kind: 'accident',
    name: 'THE PATIENT CELL',
    did: 'You took one cell all the way to twenty-six by hand and let no machine near it.',
    points:
      'It does not lock. It opens. Rock worked that far by a hand rather than a drum comes apart along its own seams, and what is under it is what is under the deep gates — the same stone, at the depth you are standing, without the walk. Go and look at what the gates were holding back.',
    tell: 'Something on the face is packing tighter than the work you have put into it accounts for.',
  },
  {
    id: 'markedbreak',
    shell: 'ferrite',
    kind: 'accident',
    name: 'THE MARKED BREAK',
    did: 'You broke a long chain on a cell you had already magnetised.',
    points:
      'The chain did not go. Iron holds a count the way it holds a direction, and a magnet is a place it can put one down. Everything in this shell that reads a chain will read that one — the Coil first, and the Reversal at ninety-nine is not a wall so much as an argument about which way the count runs.',
    tell: 'The Coil reads back for a moment after the chain should already be gone.',
  },
  {
    id: 'fallowcorner',
    shell: 'verdance',
    kind: 'accident',
    name: 'THE FALLOW CORNER',
    did: 'You left a corner of the face alone for a very long time, probably without meaning to.',
    points:
      'It did not stop at full. Growth in this shell has no ceiling you have met yet — it has a ceiling nobody working the whole face ever sees, because working it is what holds it down. There is a stand of what that corner is turning into, at a hundred and sixty, and nobody had to forget anything to find it.',
    tell: 'Something out at the edge of the face is still escalating, past where you thought it stopped.',
  },
  {
    id: 'darkface',
    shell: 'glassmere',
    kind: 'accident',
    name: 'THE DARK FACE',
    did: 'You held mirrors and allocated the beam to nothing at all.',
    points:
      'The face goes dark and unchippable, which is the obvious half. The other half is that a thing which finds you by light cannot. A hazard row on the Roll is a place you cannot walk past; in the dark it is a place, and you can stand in it and read what is there.',
    tell: 'A hazard row on the Roll fades as the beam does, and keeps fading the less of it there is.',
  },
  {
    id: 'fullgauge',
    shell: 'cinder',
    kind: 'accident',
    name: 'THE CHOKE YOU FORGOT',
    did: 'You shut the choke to bank heat, went and did something else, and the station drowned itself.',
    points:
      'It floods, you survive it, and the station is flooded — the thing the Floodgate is for, done by forgetting a dial. What matters is not the saving: it is that flooding is something the shell does to itself the moment you stop breathing for it, which means the drowned stations on the Roll are not a purchase. They are a decision about how close you are willing to run.',
    tell: 'The gauge is past the mark and still climbing, and nothing is venting.',
  },
  {
    id: 'unheardstack',
    shell: 'hollow',
    kind: 'accident',
    name: 'THE UNHEARD',
    did: 'You let the Silence stand at full and never once listened to it.',
    points:
      'A thing nobody observed does not stay what it was. It is not lost and it is not spoiled — it is undecided, which in this shell is a state a stone can be in and a state a MACHINE can be in. The Unbuilt at a hundred and seventy-eight is a room full of that, and it has been waiting for somebody who understood it was a condition rather than a ruin.',
    tell: 'The Silence has stopped reading as a quantity and started reading as an age.',
  },
];

export const UNTOLD_BY_ID: Record<string, UntoldDef> = Object.fromEntries(UNTOLD.map((u) => [u.id, u]));

export function untoldDef(id: string): UntoldDef | undefined {
  return UNTOLD_BY_ID[id];
}

/** Nothing here reads state; it is a name table. */
export function registerUntold(_state?: GameState): void {
  /* no side effects */
}
