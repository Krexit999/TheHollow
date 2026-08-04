/**
 * TRAP MATERIALS AND THEIR STILLED FORMS (§16.3) — A.90.
 *
 * "Eight materials with excellent purity ceilings and a trait that wrecks
 * coherence in the part they look perfect for. They are not a gotcha: the Assay
 * Lens shows the trait, and the answer is the Still — distil the bad trait out
 * and you have the best material in the shell. Trap materials are the Still's
 * tutorial, and they exist from era I so the lesson is waiting when the machine
 * arrives."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FINDING FIRST, because the brief asked for it before it asked for the
 * machine: THE TRAPS WERE NOT IN THE GAME.
 *
 * §16.3 names three by way of example. Measured against the registry:
 *
 *   millstone   "superb Core magnitude, `brittle`"        loam, flawless,
 *               dense+brittle — CORRECT, and a real trap by measurement:
 *               dropping `brittle` moves it 69% -> 85% of the best Loam handle.
 *   rimeiron    "best Ferrite Edge, `warm`"               ferrite, RICH,
 *               dense+SPRINGY. Not warm. Not pure+. NOT A TRAP.
 *   bluesteel   "highest raw Head numbers in VERDANCE,    ferrite, RICH,
 *               `hollow`"                                 keen+TOUGH. Not
 *               hollow, wrong shell, not pure+. NOT A TRAP.
 *
 * So one of the three examples was accidentally right and two were prose. There
 * was no trap registry, nothing marked a material as one, and the "eight" did
 * not exist as a set. The lesson was NOT waiting when the machine arrived; the
 * lesson did not exist.
 *
 * WHAT IS AUTHORED HERE INSTEAD, and how it was chosen. A trap is a MEASURED
 * property, not a label: for every pure+ material in every shell, drop each of
 * its traits in turn and re-derive every part type. A trap is a material where
 * one trait is holding it well below what its own stone is worth. The rows
 * below carry the measurement that put them there, so a later phase can re-run
 * it rather than trust the sentence (`scripts/traps.ts`).
 *
 * SEVEN, NOT EIGHT — one per shell. §16.3's "eight" against seven shells means
 * one shell carries two, and a doubled shell is a worse shape than a clean
 * one-per-world: the tutorial is supposed to be waiting wherever you are.
 * Recorded as a deliberate deviation rather than a shortfall.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE STILLED FORM IS A REAL MATERIAL, generated from these rows at content
 * load. That is the whole reason this works without touching the Forge: a
 * stilled stone is a MaterialDef like any other, so `traitsOf`, `partTraits`,
 * `derivePart`, coherence, balance, the clone check and the Codex all read it
 * correctly on the day it exists. `source: 'still'` keeps it out of every
 * rarity pool and every seam — you cannot dig one up, only make one.
 */
import type { MaterialDef } from '../materials';
import { MATERIALS, registerMaterial } from '../materials';
import { MATERIAL_TRAITS, type TraitId } from '../traits';

export interface TrapDef {
  materialId: string;
  /** The trait that is holding it back. */
  trait: TraitId;
  /** What it is otherwise excellent at — the part it LOOKS perfect for. */
  part: string;
  /** The measurement that put it on this list, from `scripts/traps.ts`. */
  measured: string;
  /** The name the stilled form carries. */
  stilledName: string;
  line: string;
}

export const TRAPS: TrapDef[] = [
  {
    materialId: 'millstone', trait: 'brittle', part: 'handle',
    measured: '69% -> 85% of the best Loam handle',
    stilledName: 'Stilled Millstone',
    line: 'The grit came out of it and it stopped arguing with itself.',
  },
  {
    materialId: 'gnashmetal', trait: 'brittle', part: 'handle',
    measured: '83% -> BEST Ferrite handle',
    stilledName: 'Stilled Gnashmetal',
    line: 'It stopped biting the hand. It is still ready to bite everything else.',
  },
  {
    materialId: 'springvein', trait: 'charged', part: 'handle',
    measured: '87% -> 98% of the best Verdance handle',
    stilledName: 'Stilled Springvein',
    line: 'The hum went out of it. It is only wood now, and it is superb wood.',
  },
  {
    materialId: 'unlight', trait: 'hollow', part: 'head',
    measured: '96% -> BEST Glassmere head',
    stilledName: 'Stilled Unlight',
    line: 'Whatever was missing from the middle of it has been taken out and named.',
  },
  {
    materialId: 'howlbasalt', trait: 'brittle', part: 'core',
    measured: '100% -> BEST Cinder core, +19.5%',
    stilledName: 'Stilled Howlbasalt',
    line: 'It has stopped making the noise. Nobody has said what the noise was.',
  },
  {
    materialId: 'nothing', trait: 'hollow', part: 'core',
    measured: '89% -> BEST Hollow core, +20.9%',
    stilledName: 'Stilled Nothing',
    line: 'A piece of nothing with the nothing taken out. It weighs slightly more.',
  },
  {
    materialId: 'paradoxa', trait: 'brittle', part: 'core',
    measured: '91% -> BEST Aleph core, +20.0%',
    stilledName: 'Stilled Paradoxa',
    line: 'It agrees with itself now. It is much less interesting and much more useful.',
  },
];

export function isTrap(materialId: string): boolean {
  return TRAPS.some((t) => t.materialId === materialId);
}

export function trapDef(materialId: string): TrapDef | undefined {
  return TRAPS.find((t) => t.materialId === materialId);
}

/** The id a stilled form carries. One per (material, trait) pair. */
export function stilledId(materialId: string, trait: TraitId): string {
  return `${materialId}_no${trait}`;
}

export function isStilled(materialId: string): boolean {
  return materialId.includes('_no');
}

let registered = false;

/**
 * REGISTER THE STILLED FORMS. Called once from the content loader, after the
 * base registry exists — every row here is a material minus one trait, so it
 * cannot be written until the thing it subtracts from is.
 *
 * ONLY THE TRAPS' NAMED TRAIT. A tier-II Still can take any trait out of a
 * trap and a tier-III can take one out of any pure+ stone, so the general case
 * is registered lazily by the Still itself (`ensureStilledForm`) rather than
 * enumerated here — 84 pure+ materials times their traits is 180 registry rows
 * for a capability most players will use twice.
 */
export function registerTraps(): void {
  if (registered) return;
  registered = true;
  for (const t of TRAPS) registerStilledForm(t.materialId, t.trait, t.stilledName, t.line);
}

/**
 * MAKE THE STILLED FORM OF A (material, trait) PAIR EXIST, if it does not.
 *
 * Idempotent, and safe to call from a verb: the registry is a plain array and a
 * material is only ever ADDED, so no existing id changes meaning. The traits
 * table gets the source's traits minus the one that came out — which is the
 * entire mechanic, and the reason nothing downstream had to be taught about it.
 */
export function registerStilledForm(
  materialId: string, trait: TraitId, name?: string, line?: string,
): MaterialDef | null {
  const id = stilledId(materialId, trait);
  const already = MATERIALS.find((m) => m.id === id);
  if (already) return already;
  const src = MATERIALS.find((m) => m.id === materialId);
  if (!src) return null;
  const left = (MATERIAL_TRAITS[materialId] ?? []).filter((t) => t !== trait);
  if (left.length === 0) return null; // nothing left to be; refuse rather than make a blank
  const def: MaterialDef = {
    id,
    name: name ?? `Stilled ${src.name}`,
    shellId: src.shellId,
    rarity: src.rarity,
    palette: src.palette,
    facets: src.facets,
    shimmer: src.shimmer,
    flavor: line ?? `${src.name}, with the ${trait} taken out of it.`,
    // NEVER IN A POOL AND NEVER IN A SEAM. You cannot dig one up.
    source: 'still',
  };
  registerMaterial(def);
  MATERIAL_TRAITS[id] = left;
  return def;
}
