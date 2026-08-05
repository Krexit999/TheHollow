/**
 * THE TEN INVERSIONS (§20.2) — the content that finally reaches the seals.
 *
 * `registerChallengeLaws` has existed since Phase 12 with ZERO callers. Ten
 * seals were read at thirteen guard sites and every one of them was
 * permanently false, because nothing ever wrote a law set and nothing ever set
 * `spiral.activeChallenge`. A.82 cut four seals that no guard read at all (the
 * dead-NAME class). This file closes the other half — the dead-BEHAVIOUR class:
 * a reader that is wired correctly and can never fire.
 *
 * EVERY NAME BELOW WAS ALREADY IN THE CODE. The guards were authored with their
 * challenge's name in the comment above them — THE UNATTENDED, COLD IRON,
 * SABLE'S WALK, THE THIN SEAM — for phases, waiting. Nothing here is invented;
 * it is the other end of thirteen sentences someone already wrote.
 *
 * WHAT A CHALLENGE IS, AND IS NOT (§20.2, LAW 9):
 *  - It is a RULE INVERSION for one run, never a difficulty slider. There is no
 *    "×0.5 income" challenge here. Nine of the ten change what the world will
 *    DO; the three numeric laws that survive (`regenMult`, `heatRateMult`,
 *    `depthCap`) each ride alongside a seal rather than standing as a challenge
 *    of their own, because a multiplier is not an inversion.
 *  - It is NEVER mandatory. Nothing in the game gates on `challengeDone`, and a
 *    challenge you must complete is a toll.
 *  - IT STARTS WHERE YOU STAND. A challenge that demanded a fresh world would
 *    be a reset layer hidden inside a reward, and the reset ladder already has
 *    four rungs that are honest about being one.
 *
 * THE GOAL IS ALWAYS "CARRY IT DOWN N DEPTHS FROM WHERE YOU BEGAN". Relative,
 * not absolute, for the same reason: an absolute target would be already-met
 * for a deep player and unreachable for a shallow one, and either way the
 * answer would be about where you happened to be standing rather than about
 * the run.
 */
import { registerChallengeLaws, type ChallengeGrant, type ChallengeLaws } from '../laws';
import type { GameState } from '../types';

export interface ChallengeDef {
  /** The id IS the grant id — one name, no second table to drift. */
  id: ChallengeGrant;
  name: string;
  /** What the run is like. A place and a constraint, never a recipe (LAW 3). */
  line: string;
  /** The rules in force while it runs. */
  laws: ChallengeLaws;
  /** Depths below where you started, to be made under the seal. */
  descend: number;
  /** What you keep. A capability, stated as the world's new willingness. */
  grant: string;
  /** Why it cannot begin right now, or null. Constraints, named. */
  requires?: (s: GameState) => string | null;
}

/** The Governor and the gauge are Cinder's. A held breath needs something to hold. */
function runsHot(s: GameState): string | null {
  if (s.shell.current === 'cinder') return null;
  if (s.shell.signatures?.includes('pressure')) return null;
  return 'Nothing here runs hot enough to hold. Cinder, or a world you carried its gauge into.';
}

export const CHALLENGES: ChallengeDef[] = [
  {
    id: 'unattended',
    name: 'THE UNATTENDED',
    line: 'Your hands are not part of this run. No chipping, no techniques — and the rock '
      + 'gives its charge back slower than it should.',
    laws: { sealHand: true, regenMult: 0.6 },
    descend: 40,
    grant: 'The machines stop crowding you: a drill leaves the cell your hand last worked '
      + 'alone, in every world, without the boots that used to buy it.',
  },
  {
    id: 'longfall',
    name: 'THE LONG FALL',
    line: 'This world does not fall. One run, all the way down — no Collapse, no fresh face, '
      + 'nothing rebuilt cheaper the second time.',
    laws: { sealCollapse: true },
    descend: 60,
    grant: 'Your drifts survive the Breach. The bands you timbered here are read onto the '
      + 'next shell\'s ladder at the depth they sat, and the fall starts already fallen.',
  },
  {
    id: 'thinseam',
    name: 'THE THIN SEAM',
    line: 'Nothing drops. No material, no gem, no geode, and no deep-entry at the gates. '
      + 'Whatever you are carrying when you start it is what you have.',
    laws: { sealDrops: true },
    descend: 30,
    grant: 'A geode opens where it is found. You never carry a shut one up again.',
  },
  {
    id: 'honeststone',
    name: 'THE HONEST STONE',
    line: 'Every material comes up at zero purity. The ladder you built on refined stock is '
      + 'the ladder you do without.',
    laws: { sealPurity: true },
    descend: 35,
    grant: 'A drop names its purity as it lands, before it reaches the Hold.',
  },
  {
    id: 'onecell',
    name: 'ONE CELL',
    line: 'The face will not widen. Whatever it is when you start is what it stays — every '
      + 'expansion you own, and every one you buy, does nothing.',
    laws: { sealWiden: true },
    descend: 25,
    grant: 'The face may be turned on its side. Width and height trade places on command, '
      + 'the same cells in a different shape.',
  },
  {
    id: 'emptyhand',
    name: 'THE EMPTY HAND',
    line: 'Bare hands. Whatever tool is on your back, you swing nothing — and you find out '
      + 'exactly what the tier ladder was buying.',
    laws: { sealTools: true },
    descend: 30,
    grant: 'Salvage hands the cast parts back instead of scrap. Nothing you poured is ever '
      + 'spent for good.',
  },
  {
    id: 'coldiron',
    name: 'COLD IRON',
    line: 'The Kiln stands and will not light. No converter runs, so nothing you own turns '
      + 'Dust into the thing you build with.',
    laws: { sealKiln: true },
    descend: 25,
    grant: 'The Kiln never needs to recover. Overstoke it whenever you can pay the Dust — '
      + 'the fire is only ever waiting on you.',
  },
  {
    id: 'unlit',
    name: 'THE UNLIT',
    line: 'The world only runs while it is watched. Nothing accrues while you are away — '
      + 'not a grain of it.',
    laws: { sealOffline: true },
    descend: 40,
    grant: 'Your crews keep walking while you are away. They were never the part of the '
      + 'world that needed watching.',
  },
  {
    id: 'heldbreath',
    name: 'THE HELD BREATH',
    line: 'The Governor is off and the relief valve is shut. Heat climbs at twice the rate '
      + 'and the cap is the real one, not the carried one.',
    laws: { sealGovernor: true, heatRateMult: 2 },
    descend: 30,
    grant: 'The choke works anywhere. Any world you stand in can be run shut, not only the '
      + 'one that taught you how.',
    requires: runsHot,
  },
  {
    id: 'sableswalk',
    name: "SABLE'S WALK",
    line: 'A lamp, a pick and a hole. Every room but the Face is shut, and the shaft will '
      + 'go no deeper than sixty.',
    laws: { sealRooms: true, depthCap: 60 },
    descend: 40,
    // Sixty is a hard ceiling, so beginning it deep would make it unwinnable
    // rather than hard. The room says this out loud rather than failing late.
    requires: (s) => (s.depth <= 15 ? null : 'Begin this one within fifteen of the top. '
      + 'The shaft will not go past sixty once it is running.'),
    grant: 'A room you have opened never closes again. Nothing you have already walked into '
      + 'goes back behind a condition.',
  },
];

export const CHALLENGE_BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]));

/**
 * REGISTER THEM. Called once at content load, exactly the way `axioms.ts`
 * registers its law contributions, so `laws.ts` still imports nothing from
 * content. This function is the caller `registerChallengeLaws` has been
 * missing since Phase 12.
 */
export function registerChallenges(): void {
  for (const c of CHALLENGES) registerChallengeLaws(c.id, c.laws);
}
