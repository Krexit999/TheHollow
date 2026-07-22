/**
 * THE TWENTY AXIOMS — each rewrites a rule; none is a multiplier in a
 * costume. Every one is noticeable inside the first five minutes of the
 * Recursion it applies to, and the noticing is written down (`felt`).
 *
 * ACQUISITION: each costs ONE Axiom. The locked formula
 * Axioms = floor((TotalEchoes/25)^0.8) budgets roughly 4-8 lifetime across
 * 4-6 Recursions — you will finish the game owning a QUARTER of this list.
 * Scarcity is the playstyle divergence: two players' third descents share
 * almost nothing.
 *
 * INTERACTIONS (pairwise, documented here per the composition contract):
 *  - unemptying + twoHands: drills never stall — the floor feeds both
 *    strokes; income remains regen-bound (the floor is a floor, not a well).
 *  - heresy + anything: the +15% ceiling lifts every ceiling-bound system
 *    together; it composes multiplicatively and announces itself.
 *  - structuresRemember + guildRemembers: minute-one Recursions skip the
 *    teaching hour entirely — intended for veterans, verified non-softlock.
 *  - sealedSeam + greedy play: the failure state trades away — you cannot
 *    flood, and you also can never touch 100-heat yield. A real trade.
 */
import { registerLawContribution, type LawContribution } from '../../laws';

export interface AxiomDef {
  id: string;
  name: string;
  /** What you notice in the first five minutes. Shown at the Rewrite. */
  felt: string;
  flavor: string;
  /** Announces itself as a deliberate pillar break. */
  heresy?: boolean;
  laws: LawContribution;
}

const A = (def: AxiomDef): AxiomDef => def;

export const AXIOMS: AxiomDef[] = [
  A({ id: 'unemptying', name: 'The Unemptying', felt: 'No cell on the face ever goes dark — chip anywhere, always.',
    flavor: 'The rock forgets how to be finished.', laws: { num: { regenFloorShare: 0.15 } } }),
  A({ id: 'twoHands', name: 'Two Hands', felt: 'Every drill stroke works two cells at once.',
    flavor: 'The drills dreamed of this. Machines dream slowly, but they finish.', laws: { num: { drillStrokes: 2 } } }),
  A({ id: 'reversedKiln', name: 'The Reversed Kiln', felt: 'The Kiln gains a reverse gear: Brick melts back to Dust at a premium.',
    flavor: 'Fire runs downhill too, if you ask it in the old grammar.', laws: { flags: ['kilnReverse'] } }),
  A({ id: 'insomniac', name: 'The Insomniac Camp', felt: 'Offline runs at one hundred percent. The camp does not sleep.',
    flavor: 'Someone is always awake now. Nobody asks who.', laws: { num: { offlineEffCap: 1.0 } } }),
  A({ id: 'heresy', name: 'Heresy of the Ceiling', heresy: true,
    felt: 'The regen ceiling itself rises 15%. The face announces the break.',
    flavor: 'The second pillar, chiselled. The mountain files no objection, which is worse.',
    laws: { num: { regenCeilingMult: 1.15 } } }),
  A({ id: 'twinDescent', name: 'Twin Descent', felt: 'The shell you left keeps producing at the pace you left it.',
    flavor: 'You may stand in two worlds. Every delver already did; now it pays.', laws: { flags: ['twinDescent'] } }),
  A({ id: 'gentleFall', name: 'The Gentle Fall', felt: 'Collapse keeps your first twenty levels of every face upgrade.',
    flavor: 'The shaft falls slower for those it knows.', laws: { num: { collapseRetain: 20 } } }),
  A({ id: 'openDoor', name: 'The Open Door', felt: 'Floors open without their warden felled. The wardens keep their treasure, and their patience.',
    flavor: 'They were never doors. They were questions, and you have answered enough.', laws: { flags: ['wardenOptional'] } }),
  A({ id: 'patientVein', name: 'The Patient Vein', felt: "A survey's doubled drops never expire.",
    flavor: 'The vein waits. It always waited; now it admits it.', laws: { flags: ['assayPersist'] } }),
  A({ id: 'secondSeed', name: 'The Second Seed', felt: 'Greenhouse plots replant themselves the moment they are harvested.',
    flavor: 'The green remembered what you always chose.', laws: { flags: ['autoReplant'] } }),
  A({ id: 'ironMemory', name: 'The Iron Memory', felt: 'Polarity chains survive the stair — descend mid-chain and keep counting.',
    flavor: 'The field holds its breath with you.', laws: { flags: ['chainPersistDescend'] } }),
  A({ id: 'honestWell', name: 'The Honest Well', felt: 'A lost Magma Well pays back half.',
    flavor: 'The well learned shame. Nobody taught it; depth did.', laws: { num: { wellFloorShare: 0.5 } } }),
  A({ id: 'broadBeam', name: 'The Broad Beam', felt: 'The beam lights its shoulder cells at half gift.',
    flavor: 'Light, asked twice, answers wider.', laws: { flags: ['beamWide'] } }),
  A({ id: 'sealedSeam', name: 'The Sealed Seam', felt: 'Choked heat caps at 97: you can never flood — and never touch the top of the gauge.',
    flavor: 'A seam of cold set in the choke by someone who lost a crew once.', laws: { flags: ['sealedSeam'] } }),
  A({ id: 'deepPost', name: 'The Deep Post', felt: 'Recalled crew keep working from the stair.',
    flavor: 'Safety and duty stopped being opposites. The crew voted.', laws: { flags: ['crewAlwaysWorks'] } }),
  A({ id: 'longEcho', name: 'The Long Echo', felt: 'The Echo Chamber tape holds eight more steps.',
    flavor: 'The Chamber learned to hold its breath longer.', laws: { num: { tapeSteps: 8 } } }),
  A({ id: 'firstWord', name: 'The First Word', felt: 'Every Recursion begins with the Kiln, the Bay, and the Forge already standing.',
    flavor: 'Some things you built are now true.', laws: { flags: ['structuresRemember'] } }),
  A({ id: 'earlyDoor', name: 'The Early Door', felt: 'The Lamphouse is open from minute one.',
    flavor: 'Lark saw you coming. Lark always sees you coming.', laws: { flags: ['guildRemembers'] } }),
  A({ id: 'weightlessPurse', name: 'The Weightless Purse', felt: 'The stair accepts Brick when Brick is cheaper.',
    flavor: 'The mountain takes payment in what you value less. It is not stupid; it is patient.', laws: { flags: ['convDescend'] } }),
  A({ id: 'mirroredGrammar', name: 'The Mirrored Grammar', felt: 'Every etched rune pair also speaks backwards.',
    flavor: 'Kel-Thur was always half a sentence.', laws: { flags: ['runeMirror', 'progressionPalindrome'] } }),
];

export const AXIOM_BY_ID = new Map(AXIOMS.map((a) => [a.id, a]));

export function registerAxioms(): void {
  for (const a of AXIOMS) registerLawContribution(a.id, a.laws);
}
