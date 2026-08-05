/**
 * THE AXIOMS — the content the law registry has been waiting for since Phase 10.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS ACTUALLY FOUND, and it is worse than "unbuilt".
 *
 * `laws.ts` is a finished, careful piece of machinery: 8 numeric slots with
 * declared composition modes, 14 flag slots, `lawNum`/`lawFlag`, hot paths for
 * the no-Axiom world, and a documented rule that no law may consult another.
 * Fourteen choke points across the engine consult it. It has ONE writer —
 * `registerLawContribution` — and **that function has had zero callers**.
 *
 * `hollow.tsx` says why, in a line nobody had followed up: *"Writing a law with
 * them is gone with axioms.ts (A.7x) — the count still banks."* The content
 * module was deleted; the registry, the readers and the currency were not. So
 * every Recursion has banked an Axiom the player could not spend, into a slot
 * system nothing could write, feeding readers that could never fire.
 *
 * The brief called `content/shell7/axioms.ts` LOCKED. There is no such file in
 * the repository, and there is no Axiom content anywhere else — the three ids
 * the codebase still mentions (`unemptying`, `twoHands`, `gentleFall`) appear
 * only inside test fixtures. Nothing here can touch a locked layer, because the
 * layer is the hole this file fills.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * FOURTEEN AXIOMS, NOT TWENTY-TWO, AND THE DIFFERENCE IS MEASURED.
 *
 * Seven of the twenty-two slots have NO READER anywhere outside this registry
 * and its tests — `wardenOptional`, `autoReplant`, `crewAlwaysWorks`,
 * `guildRemembers`, `progressionPalindrome`, `wellFloorShare`, `tapeSteps`.
 * Writing an Axiom into one of those would be the dead-NAME class `laws.ts`
 * already cut four seals for: a purchase that changes nothing, indistinguishable
 * from a working one. They stay unwritten and ledgered, and `axioms.test.ts`
 * asserts every Axiom below lands in a slot with a live reader.
 *
 * AND THE HERESY IS DELIBERATELY UNWRITTEN. `regenCeilingMult` is the one slot
 * that multiplies the regen ceiling — `laws.ts` names it a heresy and says so in
 * the UI. Pillar 2 binds this pass: every Axiom here is reach, retention,
 * routing or direction, and `dpsMax` is re-asserted unmoved with all fourteen
 * live. The slot keeps its base of 1 and no contributor, asserted by a test so
 * it reads as a decision rather than an oversight.
 *
 * WHAT IS OFFERED IS DRAWN FROM WHAT YOU USE (§31.2's rule for defects, applied
 * here for the same reason): each Axiom declares `shown`, and the Engine will
 * not list a rule about a system this world has never run. LAW 3 — a menu of
 * fourteen rules for systems you have not met is a spoiler, not a choice.
 */
import { registerLawContribution, type FlagLaw, type NumLaw } from '../laws';
import type { GameState } from '../types';

export interface AxiomDef {
  id: string;
  name: string;
  /** The rule, as a rule. Never "+x%". */
  rule: string;
  flavor: string;
  /** Axioms spent to write it. */
  cost: number;
  /** The slot it writes, for the panel and for the "live reader" test. */
  slot: NumLaw | FlagLaw;
  num?: Partial<Record<NumLaw, number>>;
  flags?: FlagLaw[];
  /** Has this world shown you the system the rule is about? */
  shown: (s: GameState) => boolean;
}

/** Every Axiom, in the order the Engine lists them. */
export const AXIOMS: AxiomDef[] = [
  // --- The face -----------------------------------------------------------
  {
    id: 'unemptying', name: 'The Unemptying',
    rule: 'A cell never empties below a fifth of its cap.',
    flavor: 'You have never seen bare rock and you never will again.',
    cost: 1, slot: 'regenFloorShare', num: { regenFloorShare: 0.2 },
    shown: () => true,
  },
  {
    id: 'twoHands', name: 'Two Hands',
    rule: 'A drill works two cells per stroke.',
    flavor: 'It was always going to. Nobody had written that it did not.',
    cost: 2, slot: 'drillStrokes', num: { drillStrokes: 2 },
    shown: (s) => s.drills?.bayBuilt === true,
  },
  // --- The resets ---------------------------------------------------------
  {
    id: 'gentleFall', name: 'The Gentle Fall',
    rule: 'A Collapse leaves twenty levels of every face upgrade standing.',
    flavor: 'The world still ends. It just stops taking the furniture.',
    cost: 2, slot: 'collapseRetain', num: { collapseRetain: 20 },
    shown: (s) => (s.collapse?.count ?? 0) >= 1,
  },
  {
    id: 'firstWord', name: 'The First Word',
    rule: 'A Recursion begins with the Kiln, the Bay and the Forge already standing.',
    flavor: 'Somebody has been here. It was you, and it has not happened yet.',
    cost: 3, slot: 'structuresRemember', flags: ['structuresRemember'],
    shown: (s) => (s.recursion?.count ?? 0) >= 1,
  },
  // --- The walls ----------------------------------------------------------
  {
    id: 'unwrittenWall', name: 'The Unwritten Wall',
    rule: 'A hardness wall is passable one tier under, at three times the cost.',
    flavor: 'The wall is still there. The sentence saying you cannot is not.',
    cost: 3, slot: 'wallSoftness', num: { wallSoftness: 1 },
    shown: (s) => (s.maxDepthRecord ?? 0) >= 40,
  },
  {
    id: 'honestStair', name: 'The Honest Stair',
    rule: 'The stair takes the converted currency whenever that is cheaper.',
    flavor: 'It had been taking one and refusing the other for no stated reason.',
    cost: 1, slot: 'convDescend', flags: ['convDescend'],
    shown: (s) => (s.maxDepthRecord ?? 0) >= 20,
  },
  // --- Away ---------------------------------------------------------------
  {
    id: 'insomniacCamp', name: 'The Insomniac Camp',
    rule: 'Nothing is lost while you are away. Offline runs at full.',
    flavor: 'The camp does not sleep. You may.',
    cost: 3, slot: 'offlineEffCap', num: { offlineEffCap: 1 },
    shown: (s) => (s.stats?.longestOfflineSec ?? 0) > 0,
  },
  {
    id: 'twinDescent', name: 'The Twin Descent',
    rule: 'The shell you left keeps working at the pace you left it.',
    flavor: 'Two of you, one hand. Do not think about it near the Core.',
    cost: 3, slot: 'twinDescent', flags: ['twinDescent'],
    shown: (s) => (s.shell?.breachCount ?? 0) >= 1,
  },
  // --- The shells ---------------------------------------------------------
  {
    id: 'reverseKiln', name: 'The Reversed Kiln',
    rule: 'The Kiln runs backwards: Brick returns to Dust, at a premium.',
    flavor: 'It was always a door. It had a hinge on one side only.',
    cost: 2, slot: 'kilnReverse', flags: ['kilnReverse'],
    shown: (s) => s.kiln?.built === true,
  },
  {
    id: 'longChain', name: 'The Long Chain',
    rule: 'A polarity chain rides the stair down instead of breaking on it.',
    flavor: 'You took the shape with you. Nothing said you could not.',
    cost: 2, slot: 'chainPersistDescend', flags: ['chainPersistDescend'],
    shown: (s) => Object.keys(s.polarity?.signs ?? {}).length > 0,
  },
  {
    id: 'wideBeam', name: 'The Wide Beam',
    rule: 'The beam lights its shoulders too, at half gift.',
    flavor: 'Light was never a line. Somebody had simply drawn it as one.',
    cost: 2, slot: 'beamWide', flags: ['beamWide'],
    shown: (s) => Object.keys(s.refraction?.mirrors ?? {}).length > 0 || s.shell?.signatures?.includes('refraction') === true,
  },
  {
    id: 'sealedSeam', name: 'The Sealed Seam',
    rule: 'The shaft keeps a safety seam: heat caps at 97 and a flood is impossible.',
    flavor: 'It cannot flood. It can still hurt, and it would like you to know that.',
    cost: 3, slot: 'sealedSeam', flags: ['sealedSeam'],
    shown: (s) => (s.pressure?.heat ?? 0) > 0 || s.shell?.signatures?.includes('pressure') === true,
  },
  // --- What you have written down -----------------------------------------
  {
    id: 'standingMark', name: 'The Standing Mark',
    rule: 'A survey\'s mark never expires.',
    flavor: 'You wrote it on the rock. The rock is not going anywhere.',
    cost: 1, slot: 'assayPersist', flags: ['assayPersist'],
    shown: (s) => (s.assayBench?.tier ?? 0) > 0 || (s.assayBench?.sampled?.length ?? 0) > 0,
  },
  {
    id: 'mirrorRune', name: 'The Mirror Rune',
    rule: 'Every etched pair also speaks backwards.',
    flavor: 'It reads the same from the other end, which is a thing about you.',
    cost: 2, slot: 'runeMirror', flags: ['runeMirror'],
    shown: (s) => (s.runes?.found?.length ?? 0) > 0,
  },
];

export const AXIOM_BY_ID = new Map(AXIOMS.map((a) => [a.id, a]));

/**
 * REGISTER THEM. Called once at content load, exactly the way `challenges.ts`
 * registers its seals, so `laws.ts` still imports nothing from content.
 */
export function registerAxioms(): void {
  for (const a of AXIOMS) {
    registerLawContribution(a.id, { num: a.num, flags: a.flags });
  }
}
