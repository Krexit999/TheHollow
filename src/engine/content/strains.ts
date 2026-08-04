/**
 * STRAINS — what a bed can be seeded with (§13's CULTIVATION, A.95).
 *
 * A strain is a TRAIT you want the vines in a quadrant to become, and the crop
 * is Verdance stone carrying it. There is no strain the registry does not
 * already have a home for: every one names an EXISTING Verdance material, so
 * cultivation feeds the economy that is there rather than minting a parallel
 * one. `crossOf` is the same rule at tier III — a crossed pair names a stone
 * that already carries both traits, and returns nothing when no such stone
 * exists, so a cross can never invent a material.
 *
 * PILLAR 5: none of this is a recipe list. The bench shows the four strains it
 * can seed and what each one IS — a trait, which the game has always shown —
 * and the crossing is found by seeding two beds side by side.
 */
import { MATERIALS } from '../materials';
import { traitsOf, type TraitId } from '../traits';

export interface StrainDef {
  id: string;
  name: string;
  trait: TraitId;
  flavor: string;
}

export const STRAINS: StrainDef[] = [
  {
    id: 'creeper', name: 'Creeping stock', trait: 'springy',
    flavor: 'It gives when you lean on it and it is still there when you let go.',
  },
  {
    id: 'hardwood', name: 'Hardwood stock', trait: 'tough',
    flavor: 'Grown slow on purpose. Everything about it is an argument against being cut.',
  },
  {
    id: 'lantern', name: 'Lantern stock', trait: 'charged',
    flavor: 'It holds a charge the way a leaf holds light, and gives it back at night.',
  },
  {
    id: 'hollowreed', name: 'Hollow reed', trait: 'hollow',
    flavor: 'All the room is on the inside. Set something in it and it stays set.',
  },
];

export const STRAIN_BY_ID = new Map(STRAINS.map((s) => [s.id, s]));

/**
 * THE STONE A STRAIN CROPS. The shallowest VERDANCE material carrying that
 * trait — derived, never authored, so a strain can never name a stone the
 * registry does not have and a new Verdance material joins the table for free.
 */
export function strainStone(trait: TraitId): string {
  const found = MATERIALS.find((m) => m.shellId === 'verdance' && !m.worked && traitsOf(m.id).includes(trait));
  return found?.id ?? 'sapstone';
}

/** Tier III: a Verdance stone carrying BOTH, or nothing. Never invented. */
export function crossOf(a: TraitId, b: TraitId): string | null {
  const found = MATERIALS.find((m) => {
    if (m.shellId !== 'verdance' || m.worked) return false;
    const t = traitsOf(m.id);
    return t.includes(a) && t.includes(b);
  });
  return found?.id ?? null;
}
