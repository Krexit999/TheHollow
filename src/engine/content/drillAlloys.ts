/**
 * DRILL ALLOYS (A.53) — the bay's abilities, forged at the Forge.
 *
 * This replaces the per-drill configuration layer that A.52 built and A.53
 * stripped. The lesson from that reversal is the shape of this system: the
 * drills themselves are furniture and should stay that way, so the interesting
 * decision lives on a screen you go to ON PURPOSE, and what it produces is not
 * a stat but a VISIBLE CHANGE IN HOW THE GRID BEHAVES.
 *
 * AN ABILITY IS NEVER A NUMBER. "+8% drill power" is what the old heads did and
 * it is what made the bay a lookup. Every ability here changes the RULE the
 * drills work by, and every one of them is drawn on the face — the arc jumps
 * between cells you can see, the set leaves a mark on the rock, the call shows
 * ore gathering under a cell. If a proposed ability cannot be seen happening,
 * it does not belong in this file.
 *
 * PILLAR 2, per ability, because it is the constraint that shapes all three:
 *  - ARC harvests the charge that is ALREADY IN neighbouring cells. It empties
 *    the field faster; it does not put anything into it. Regen is still the
 *    ceiling.
 *  - THE CALL shifts WHAT DROPS, by rolling the drop table as if the cell were
 *    deeper. Drops are outside the income path entirely (the same argument
 *    relic affixes make for `dropRate`).
 *  - THE SET makes a recently-worked cell give up more of its charge PER BITE.
 *    A bigger bite of the same charge, never more charge — deliberately not a
 *    yield multiplier, which WOULD move the ceiling (dpsMax = W·H·regen·Y).
 *
 * PILLAR 5: which materials make which ability is NOT listed. Traits are
 * visible (traits.ts rule 3 — a trait is a property, not a solution), so the
 * bench can HINT at what a mix leans toward, and the ability is named and
 * recorded the moment you actually make it. Hint, try, confirm-and-remember.
 *
 * ONE ALLOY PER DRILL (A.54). The first cut fitted a single alloy bay-wide,
 * on the theory that anything per-drill would rebuild A.52's configuration
 * screen. That was the wrong lesson from the right reversal: what made A.52 a
 * chore was that every drill needed a SETUP before it would work properly.
 * Here a drill works fine bare, and an alloy is an optional thing you pour into
 * one — so the choice is which of your drills gets which ability, and the
 * answer is a MIX rather than a setting to clone across twenty-four rows.
 *
 * THE MARKS BELONG TO THE ROCK, NOT THE DRILL. A cell softened by an emberset
 * drill is soft for whatever bites it next, and a cell gathered under by a
 * lodecall drill drops richer whoever empties it. That is what makes a mix
 * worth assembling instead of a bay of clones, and it is the honest reading of
 * the copy — the ability changes the ROCK, and the rock does not know which
 * machine touched it.
 *
 * ADDING ONE IS DATA. A new ability is a row in DRILL_ABILITIES plus a runtime
 * hook keyed on its `kind`. The later-shell kinds are declared in the union and
 * deliberately have no rows yet.
 */
import type { TraitId } from '../traits';
import { traitsOf } from '../traits';

/**
 * The live kinds have runtime hooks in systems/drillAlloys.ts. The rest are
 * STUBS: named here so the framework and the UI already have a slot for them,
 * with no defs authored yet.
 *   bind      — bind drills into a pattern that works cells in formation
 *   resonance — read the shell's own signature (Ferrite poles, Verdance growth)
 *   phantom   — a strike splits into a second, half-real hit elsewhere
 */
export type DrillAbilityKind = 'arc' | 'attract' | 'residue' | 'bind' | 'resonance' | 'phantom';

export interface DrillAbilityDef {
  id: string;
  name: string;
  kind: DrillAbilityKind;
  /** Which shell's materials this belongs to — gates when it can be forged. */
  shell: string;
  /** What it does, in the game's voice. Shown only AFTER discovery. */
  effect: string;
  /** Flavour. Shown only after discovery. */
  line: string;
  /**
   * WHAT IT IS WORTH, AND THEREFORE WHAT IT COSTS. Set from the measured
   * alloy-vs-bare readings in `sim-out/a53-alloy-rtp.md`, not by feel: ARC ran
   * 1.74x income in the power-bound regime, THE SET 1.24x, and THE CALL moved
   * the drop table rather than the income at all. Pricing reads this so a
   * stronger ability is a bigger commitment (see `alloyCost`).
   */
  weight: number;
  /**
   * The trait signature. Matched against the POOLED traits of everything fed
   * in, so two `charged` materials and one three-trait `charged` material both
   * satisfy `{ charged: 2 }` — the player reasons about the mix, not a recipe.
   */
  needs: Partial<Record<TraitId, number>>;
  params: Record<string, number>;
}

/**
 * THE THREE LOAM ABILITIES. Each signature is two of one trait, and every shell
 * in the game has at least two materials carrying each of `charged`, `dense`
 * and `warm` (checked against MATERIAL_TRAITS) — so all three stay forgeable
 * in every world, which is the standing reach rule.
 */
export const DRILL_ABILITIES: DrillAbilityDef[] = [
  {
    id: 'arcvein', name: 'Arcvein', kind: 'arc', shell: 'loam',
    effect: 'A drill strike jumps to neighbouring cells and takes their charge too.',
    line: 'It will not sit still in the head. The stroke lands and then keeps going.',
    needs: { charged: 2 },
    params: { jumps: 2 },
    weight: 3,
  },
  {
    id: 'lodecall', name: 'Lodecall', kind: 'attract', shell: 'loam',
    effect: 'Worked cells draw the richer seam toward them — what they drop gets better the more you work them.',
    line: 'The rock leans in. Whatever is down there would rather be here.',
    needs: { dense: 2 },
    params: { every: 6, depthBonus: 30 },
    weight: 2,
  },
  {
    id: 'emberset', name: 'Emberset', kind: 'residue', shell: 'loam',
    effect: 'Rock a drill has just worked stays soft, so the next bite takes far more of what is in it.',
    line: 'It leaves the heat behind in the stone. The stone gives up quicker for it.',
    needs: { warm: 2 },
    params: { bite: 0.5, decay: 9 },
    weight: 2,
  },
];

export const ABILITY_BY_ID = new Map(DRILL_ABILITIES.map((a) => [a.id, a]));

/** Every trait the fed materials carry, counted. */
export function traitPool(materialIds: string[]): Partial<Record<TraitId, number>> {
  const pool: Partial<Record<TraitId, number>> = {};
  for (const id of materialIds) {
    for (const t of traitsOf(id)) pool[t] = (pool[t] ?? 0) + 1;
  }
  return pool;
}

/** Which ability this exact mix makes, or null for slag. */
export function matchDrillAlloy(materialIds: string[]): DrillAbilityDef | null {
  if (materialIds.length === 0) return null;
  const pool = traitPool(materialIds);
  // Most demanding signature first, so a rich pool resolves to the ability that
  // actually needed it rather than whichever happens to be listed first.
  const ranked = [...DRILL_ABILITIES].sort(
    (a, b) => Object.values(b.needs).reduce((x, y) => x + y, 0) - Object.values(a.needs).reduce((x, y) => x + y, 0),
  );
  for (const def of ranked) {
    let ok = true;
    for (const [trait, n] of Object.entries(def.needs)) {
      if ((pool[trait as TraitId] ?? 0) < n) { ok = false; break; }
    }
    if (ok) return def;
  }
  return null;
}

/** The trait the pool leans on hardest, for the hint and the miss message. */
export function dominantTrait(materialIds: string[]): TraitId | null {
  const pool = traitPool(materialIds);
  let best: TraitId | null = null;
  let bestN = 0;
  for (const [t, n] of Object.entries(pool)) {
    if ((n ?? 0) > bestN) { bestN = n ?? 0; best = t as TraitId; }
  }
  return best;
}

/**
 * WHAT THE BENCH WILL SAY BEFORE YOU POUR.
 *
 * Every line describes the MIX, never the ability — pillar 5 holds because a
 * player who reads "it wants to jump" has a reason to try it and still has to
 * make the thing to learn what it is. Traits that no ability reads yet get an
 * honest "nothing in this is reaching for anything", which is a real signal
 * rather than a shrug.
 */
const TRAIT_HINT: Record<TraitId, string> = {
  charged: 'It will not settle. Whatever is in this is looking for somewhere to jump to.',
  dense: 'Heavy out of all proportion. Set it down and things nearby lean toward it.',
  warm: 'It holds the heat long after the fire is out. Whatever it touches stays warm.',
  keen: 'It takes an edge and keeps it. A cutting mix, but nothing in it reaches past the cut.',
  tough: 'It will not break. It will not do much else either.',
  light: 'Almost nothing in the hand. Nothing in it wants to act on the rock.',
  springy: 'It gives and comes back. A lively mix with nowhere to put the liveliness.',
  brittle: 'It wants to come apart. On its own that is just breakage.',
  hollow: 'There is space inside it. Space is not yet an instruction.',
  trueseated: 'It sits exactly where you put it. Steady, and steady is not a behaviour.',
};

/** A reasoning aid, not an answer. Empty pool → the bench says nothing. */
export function alloyHint(materialIds: string[]): string | null {
  if (materialIds.length === 0) return null;
  const dom = dominantTrait(materialIds);
  if (!dom) return null;
  const pool = traitPool(materialIds);
  const n = pool[dom] ?? 0;
  const base = TRAIT_HINT[dom];
  // Two of a trait is the threshold every authored signature uses. Saying the
  // COUNT is honest and still not a recipe: the player is told the mix is
  // leaning hard, not what it leans into.
  return n >= 2 ? `${base} Strongly — there is a lot of it in here.` : base;
}
