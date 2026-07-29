/**
 * EMERGENT TOOL CLASSES — the third build axis, and the one you do not pick.
 *
 * Material decides how big the numbers are. Shape decides where the swing
 * lands. CLASS is what the whole thing turns out to BE, and it is not chosen
 * anywhere: it is read off the seven parts you happened to build with.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT IS READ AND NOT PICKED.
 *
 * A class you select is a menu, and a menu is the opposite of what the doc's
 * "discovery over unlocking" pillar asks for. A class you FALL INTO is a
 * consequence — you built seven parts out of heavy stone because heavy stone
 * was what the shaft was giving you, and one day the tool tells you it has
 * become a Siege and hands you something only a Siege can carry.
 *
 * COHERENCE IS THE GATE, and that is the tie-in that makes the whole thing sit
 * on top of a system that already existed. A scattered set — seven materials
 * from four shells — gets NO class at all, however good its numbers are,
 * because it is not a thing, it is seven things in a bag. The same coherence
 * factor that already docks a mismatched tool's stats decides whether it has
 * an identity, so "make a set that belongs together" now pays twice.
 *
 * NOTHING HERE IS LISTED. The player is never shown the five signatures. What
 * they are shown, once they have a coherent set, is the class they landed in,
 * WHICH TRAITS TIPPED IT, and what it unlocked. The leaning is legible from
 * the trait tags every material already prints, so a player who wants a Siege
 * can reason their way toward one without ever being handed the recipe.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PILLAR 2. A class unlocks MODIFIERS, and a modifier cannot touch yield —
 * that is enforced in the type, at `ModEffectDef`, and asserted over the data.
 * A class therefore cannot either; it is a key, and every door it opens was
 * already checked.
 */
import type { TraitId } from '../traits';
import type { PartShape } from './forgeParts';

export interface ToolClassDef {
  id: string;
  name: string;
  /**
   * The trait counts across all seven parts that lean toward it. A part
   * contributes every trait its material carries, so seven dense/tough parts
   * pile up fast and a mixed bag piles up nothing in particular.
   */
  needs: Partial<Record<TraitId, number>>;
  /** Shapes that lean the same way. Worth half a trait each — a nudge, never
   *  the deciding vote, so shape and class stay separate axes. */
  favours?: PartShape[];
  /** What it is, in the game's voice. Shown once you are in it. */
  blurb: string;
  line: string;
  /** Modifiers only this class may work in. */
  unlocks: string[];
  color: number;
}

/**
 * HOW COHERENT A SET HAS TO BE BEFORE IT IS ANYTHING AT ALL.
 *
 * `coherence.factor` is 1 for a set of one material and falls as the set
 * scatters across shells. 0.86 is roughly "one stray part out of seven" —
 * generous enough that a real build with a better Head from one shell down
 * still counts, tight enough that a bag of whatever the shaft dropped does not.
 */
export const CLASS_COHERENCE = 0.86;

/** Trait-weight a class needs before it will claim a tool. */
export const CLASS_THRESHOLD = 1;

/** How much a favoured shape is worth against a trait. */
export const SHAPE_WEIGHT = 0.5;

export const TOOL_CLASSES: ToolClassDef[] = [
  {
    id: 'siege', name: 'Siege', color: 0xd08a4a,
    needs: { dense: 5, tough: 4 },
    favours: ['wide', 'longhaft', 'solid'],
    blurb: 'Heavy all the way through, and it does not so much mine the wall as decide against it.',
    line: 'Two people to lift it. One to swing it. You have been doing both.',
    unlocks: ['siegeweight'],
  },
  {
    id: 'precision', name: 'Precision', color: 0xb9d8e8,
    needs: { keen: 5, trueseated: 4 },
    favours: ['needle', 'keened', 'pinned'],
    blurb: 'Ground fine and seated true. It goes exactly where you put it, every time.',
    line: 'You have stopped aiming. It is already there.',
    unlocks: ['surgeon'],
  },
  {
    id: 'excavation', name: 'Excavation', color: 0x9ac07a,
    needs: { dense: 3, keen: 3, tough: 2 },
    favours: ['hooked', 'stub', 'needle'],
    blurb: 'Built by somebody who was looking for something, rather than getting through something.',
    line: 'It finds the pocket. You are only holding it.',
    unlocks: ['prospector'],
  },
  {
    id: 'tempest', name: 'Tempest', color: 0xa8c8f0,
    needs: { charged: 5, springy: 3 },
    favours: ['twin', 'banded', 'deepset'],
    blurb: 'It will not sit still. Whatever it carries is always most of the way to going off.',
    line: 'You can hear it through the handle.',
    unlocks: ['stormfed'],
  },
  {
    id: 'revenant', name: 'Revenant', color: 0x9a90a8,
    needs: { hollow: 4, brittle: 3 },
    favours: ['spike', 'cored', 'crescent'],
    blurb: 'Made mostly of the spaces in it, and half of what it does happens somewhere it is not.',
    line: 'It went off twice. You are fairly sure it went off twice.',
    unlocks: ['secondhand'],
  },
];

export const CLASS_BY_ID = new Map(TOOL_CLASSES.map((c) => [c.id, c]));

/** Every modifier that belongs to some class. Used to gate the library. */
export const CLASS_LOCKED = new Set(TOOL_CLASSES.flatMap((c) => c.unlocks));

/** Which class owns this modifier, if any. */
export function classOwning(modId: string): ToolClassDef | null {
  return TOOL_CLASSES.find((c) => c.unlocks.includes(modId)) ?? null;
}
