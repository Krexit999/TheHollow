/**
 * REDUCTIONS — what the Retort turns ash and pyre into (§13, §17).
 *
 * THE RULE EVERY ROW OBEYS, and there is a test for it: a reduction CLIMBS A
 * RARITY BAND. That is the whole verb — nothing else in the game moves stock up
 * a rarity, and it is what §13 means when it says the Retort blocks `starred`.
 *
 * Each row is two of a QUENCH MEDIUM plus one PYRE STONE. The pyre stone is
 * always a `warm` Cinder common, because a fire is what the machine needs and
 * Cinder is where fire is lying around; the medium is what is being worked.
 * The ladder therefore runs UP the six media rather than sideways across them,
 * and a player climbing it is spending shallow media to reach deep ones.
 *
 * PILLAR 5: none of this is listed anywhere the player can read as a recipe.
 * The Retort's panel shows what YOU HOLD that will reduce, and what it becomes
 * — a destination, never a catalogue.
 */
import { MATERIALS, registerMaterial } from '../materials';
import { MATERIAL_TRAITS } from '../traits';

export interface ReductionDef {
  /** The medium going in — two units, at one band. */
  from: string;
  /** The Cinder pyre stone that makes the fire — one unit. */
  pyre: string;
  /** What comes out, one unit, at the input's own purity. */
  to: string;
  /** Tier III only: §17's last medium. */
  pyreBath?: boolean;
  /** One line, shown on the row. Never a recipe. */
  line: string;
}

/**
 * THE PYRE-BATH — §17 names it "the only route to tier-XI temper" and the
 * registry had never held it. Registered here rather than in `materials.ts`
 * because it is the Retort's output and nothing else in the game can make one:
 * a material whose only producer is a machine belongs beside that machine's
 * content, the same arrangement `washer.ts` uses for its concentrate and silt.
 *
 * `starred`, which is the band §13 says this machine blocks, and the first
 * WORKED material to sit in it besides Loam's Law Filing.
 */
export const PYRE_BATH = 'pyrebath';

export function ensurePyreBath(): void {
  if (MATERIALS.some((m) => m.id === PYRE_BATH)) return;
  registerMaterial({
    id: PYRE_BATH,
    name: 'Pyre-bath',
    shellId: 'cinder',
    rarity: 'starred',
    palette: ['#2a0f08', '#7a2410', '#e0662a'],
    facets: 9,
    shimmer: 'soft',
    worked: true,
    flavor: 'Not a liquid and not a fire. Whatever you put in it comes out having been somewhere.',
  });
  MATERIAL_TRAITS[PYRE_BATH] = ['warm', 'trueseated', 'charged'];
}

export const REDUCTIONS: ReductionDef[] = [
  {
    from: 'frostsand', pyre: 'emberflake', to: 'lumenshard',
    line: 'The sand gives up its cold first, and what is left of it holds light instead.',
  },
  {
    from: 'charstone', pyre: 'emberflake', to: 'temperash',
    line: 'Burnt past burning. The grey powder in the bottom is worth more than the coal was.',
  },
  {
    from: 'temperash', pyre: 'charstone', to: 'truesilver',
    line: 'Ash reduced until the metal that was always in it has nowhere left to hide.',
  },
  {
    from: 'lumenshard', pyre: 'charstone', to: 'voidresidue',
    line: 'Light, reduced. What is left is the shape the light was in.',
  },
  {
    from: 'voidresidue', pyre: 'ashgrit', to: PYRE_BATH, pyreBath: true,
    line: 'The last reduction. It takes a long time and the hall gets very quiet.',
  },
];

export const REDUCTION_BY_FROM = new Map(REDUCTIONS.map((r) => [r.from, r]));
