/**
 * THE CHALLENGES — the part of the Spiral you still play with your hands.
 *
 * With parallel shells and the Automation Grid, the endgame risks becoming a
 * dashboard you watch. Challenges are the counterweight: each one is a
 * SPECIFIC IDEA ABOUT THIS GAME, not a difficulty slider. Every one takes a
 * pillar or a system the player has stopped noticing and removes it, so that
 * what it was doing becomes visible.
 *
 * The rule of authoring, borrowed from the Warrens: a challenge must be
 * describable in one sentence that is interesting BEFORE you know the numbers.
 * "One cell, and prove you understand the ceiling" is a challenge. "Everything
 * costs 3x" is a slider.
 *
 * Each pays a GRID MODULE, never Spiral currency: Spiral (the locked formula)
 * buys capacity, challenges unlock the content that fills it. Two axes, so a
 * player who loves challenges is not also the player with the most slots.
 *
 * Constraints are expressed as law-registry overrides wherever the registry can
 * carry them (laws.ts already owns "how the world works"), plus a `setup` hook
 * for the few that reshape the starting world instead of a rule.
 */
import type { GameState } from '../../types';
import type { ChallengeLaws } from '../../laws';

export interface ChallengeDef {
  id: string;
  name: string;
  /** The idea, in the game's voice. Shown before you commit. */
  premise: string;
  /** The rule, stated plainly. One line, no numbers if avoidable. */
  rule: string;
  /** What it is actually teaching — shown after completion, not before. */
  lesson: string;
  /** Law overrides active for the duration. */
  laws?: ChallengeLaws;
  /** Reshape the starting world (runs on a fresh challenge state). */
  setup?: (s: GameState) => void;
  /** Won when this is true. */
  goal: (s: GameState) => boolean;
  /** Plain statement of the goal for the UI. */
  goalText: string;
  /** The Automation Grid module this unlocks. */
  reward: string;
  /** Ordering hint; roughly ascending difficulty. */
  order: number;
}

export const CHALLENGES: ChallengeDef[] = [
  {
    id: 'oneCell',
    name: 'One Cell',
    order: 1,
    premise:
      'Sable cut a shaft one hand wide, on purpose, and worked it for a season. Her note says: "I wanted to know what the rock owed me, and a wide face was lying about it."',
    rule: 'The face is a single cell. It cannot be widened.',
    goalText: 'Reach depth 30.',
    lesson:
      'Width was never income — regen was. One cell earns exactly what one cell grows back, and every upgrade you actually needed was the one that made a cell worth more.',
    laws: { faceCells: 1, sealWiden: true },
    setup: (s) => {
      s.face.w = 1;
      s.face.h = 1;
      s.face.cells = [0];
    },
    goal: (s) => s.depth >= 30,
    reward: 'autoBuyFace',
  },
  {
    id: 'coldIron',
    name: 'Cold Iron',
    order: 2,
    premise:
      'The Kiln stands, and it will not light. Nothing you own converts. Everything you have ever built was bought with Brick — so build without it.',
    rule: 'The Kiln cannot be lit. No converter runs.',
    goalText: 'Reach depth 40.',
    lesson:
      'The converter is the spine of the economy, and you can feel exactly where it sits by its absence: the Lattice, the Guild and the drop table are the only other roads, and they are narrower than you thought.',
    laws: { sealKiln: true },
    goal: (s) => s.depth >= 40,
    reward: 'autoKiln',
  },
  {
    id: 'unattended',
    name: 'The Unattended',
    order: 3,
    premise:
      'You are not here. The shaft does not care. This is the promise the game has been making since the first minute — that it runs without you — and this is the run where it has to keep it.',
    rule: 'You cannot chip by hand. Not once.',
    goalText: 'Reach depth 50 on drills and idle income alone.',
    lesson:
      'Pillar 1 is not a slogan. Idle really does reach the floor; it just takes the drills you would have skipped and the regen you would not have bought.',
    laws: { sealHand: true },
    goal: (s) => s.depth >= 50,
    reward: 'autoDescend',
  },
  {
    id: 'emptyHand',
    name: 'The Empty Hand',
    order: 4,
    premise:
      'No pick. No gear. Whatever you learned to do with your hands, do it with nothing in them.',
    rule: 'No tool may be equipped. Strike and chip run at bare-hand power.',
    goalText: 'Reach depth 20.',
    lesson:
      'The tool ladder is the pacing. Take it away and the hardness wall stops being a number on a bar and becomes the reason you stopped.',
    laws: { sealTools: true },
    goal: (s) => s.depth >= 20,
    reward: 'autoForge',
  },
  {
    id: 'sablesWalk',
    name: "Sable's Walk",
    order: 5,
    premise:
      'She had a lamp, a pick and a hole. No Lamphouse, no boards, no ledgers. Walk it the way the first one did, and see whether the thing at the bottom of all this still holds up on its own.',
    rule: 'Only the Face. Every other room is shut.',
    goalText: 'Reach depth 25.',
    lesson:
      'The core loop stands by itself. Everything else is depth — genuinely optional, exactly as pillar 4 claims — and now you have proved it rather than trusting it.',
    laws: { sealRooms: true },
    goal: (s) => s.depth >= 25,
    reward: 'autoCollapse',
  },
  {
    id: 'heldBreath',
    name: 'The Held Breath',
    order: 6,
    premise:
      'The Governor is off. The relief valve is welded shut. The heat is yours to hold, and the only thing between you and a flooded shaft is how well you laid your pipe.',
    rule: 'Heat climbs at double rate and the Governor never intervenes.',
    goalText: 'Hold a working shaft for six minutes without flooding.',
    lesson:
      'The Governor was doing more than you noticed. Pressure is a real-time puzzle when nothing is quietly saving you from it.',
    laws: { heatRateMult: 2, sealGovernor: true },
    setup: (s) => {
      s.shell.current = 'cinder';
      s.pressure.heat = 40;
    },
    goal: (s) => (s.spiral.activeChallenge ? s.stats.playTimeSec - s.spiral.activeChallenge.startedAtPlaySec >= 360 : false),
    reward: 'autoVent',
  },
  {
    id: 'longSilence',
    name: 'The Long Silence',
    order: 7,
    premise:
      'The Hollow, with nothing carried into it. No seepage, no polarity, no growth, no refraction, no pressure. There is no rock and there is nothing of yours to make up for it.',
    rule: 'Begin in the Hollow with no carried signatures.',
    goalText: 'Harvest 500 Void out of the quiet.',
    lesson:
      'Absence is a real income system and not a trick played by the five signatures standing behind it. The Silence pays on its own terms.',
    laws: { sealSignatures: true },
    setup: (s) => {
      s.shell.current = 'hollow';
      s.shell.signatures = [];
      s.hollow.silence = 0;
    },
    goal: (s) => s.hollow.silenceHarvested >= 500,
    reward: 'autoListen',
  },
  {
    id: 'twoWorlds',
    name: 'Two Worlds',
    order: 8,
    premise:
      'Two shells, running at once, drawing on one purse. This is the Spiral turned against itself: the layer that let you stop choosing, insisting that you choose.',
    rule: 'Two shells run in parallel and share a single bank. Spending in one spends in both.',
    goalText: 'Bring both shells to depth 60.',
    lesson:
      'Parallelism is not free. Capacity without a policy is just two shafts starving each other, which is the argument for the Grid you have been putting off building.',
    laws: { sharedBank: true },
    goal: (s) => s.spiral.shells.filter((sh) => sh.depth >= 60).length >= 2,
    reward: 'autoBalance',
  },
  // --- Phase 15: eight more, each taking away exactly one thing -----------
  // The test every one of these had to pass: does removing this teach the
  // player something they could not have learned by reading a number? A
  // challenge that just makes the run slower is a slider, and was cut.
  {
    id: 'honestStone',
    name: 'The Honest Stone',
    order: 9,
    premise:
      'Dovekin keeps a tray of zero-purity samples under the counter and will show anyone who asks. "People think they are buying the stone," he says. "They are buying how clean it came up."',
    rule: 'Every material rolls at zero purity.',
    goalText: 'Craft a Tier V tool.',
    lesson:
      'Purity was never a bonus on top of the material — it was most of the material. A clean stack beat a big one at every step, and you never saw the number doing it because it was folded into everything downstream.',
    laws: { sealPurity: true },
    setup: () => {},
    goal: (s) => s.forge.tools.some((t) => t.tier >= 5),
    reward: 'autoAssay',
  },
  {
    id: 'theShallow',
    name: 'The Shallow',
    order: 10,
    premise:
      'A seam forty deep that someone worked for eleven years. The walls are polished. They were not going down; they were going THROUGH.',
    rule: 'The stair will not pass depth 40.',
    goalText: 'Bank 250,000 total Dust.',
    lesson:
      'Depth is a multiplier you buy with time. Everything else is a multiplier you buy with attention — and the ceiling was always reachable from where you already stood, if you were willing to build instead of walk.',
    laws: { depthCap: 40 },
    setup: () => {},
    goal: (s) => s.totals['dust']?.gte(250_000) ?? false,
    reward: 'autoCraft',
  },
  {
    id: 'theUnlit',
    name: 'The Unlit',
    order: 11,
    premise:
      'The lamp goes out when you leave. Not banked, not low — out. Whatever the shaft does in the dark, it does not do it for you.',
    rule: 'Nothing accrues while you are away.',
    goalText: 'Reach depth 120.',
    lesson:
      'Offline efficiency is not a convenience — it is a rate, and it was carrying more of your progress than the whole Forge. This is the run that shows you the shape of the thing you were taking for granted.',
    laws: { sealOffline: true },
    setup: () => {},
    goal: (s) => s.depth >= 120,
    reward: 'autoVault',
  },
  {
    id: 'noSecondChance',
    name: 'No Second Chance',
    order: 12,
    premise:
      'Sable tried this once and wrote a single line about it: "The world will not fall for you today. Go on from where you are."',
    rule: 'The world cannot be collapsed.',
    goalText: 'Reach depth 150 in one unbroken run.',
    lesson:
      'A Collapse is not a punishment you accept — it is a tool you spend. Without it, every upgrade has to pay for itself at the price you bought it, and you find out which ones never did.',
    laws: { sealCollapse: true },
    setup: () => {},
    goal: (s) => s.depth >= 150,
    reward: 'autoRelic',
  },
  {
    id: 'loudDark',
    name: 'The Loud Dark',
    order: 13,
    premise:
      'Ashka has a theory that the Deepwrought can hear the lamp. Nobody has disproved it, and nobody has tried very hard, because the alternative is that they can hear you.',
    rule: 'Four times the encounters, and nothing lets you past.',
    goalText: 'Put down forty of them.',
    lesson:
      'Combat was an interruption you could always decline, and declining had a price you never had to look at. Strike power comes out of the same tool the rock does — the fight was always paid for out of the mining.',
    laws: { encounterMult: 4, sealFlee: true },
    setup: () => {},
    goal: (s) => Object.values(s.combat.kills).reduce((a, b) => a + b, 0) >= 40,
    reward: 'autoFight',
  },
  {
    id: 'thinSeam',
    name: 'The Thin Seam',
    order: 14,
    premise:
      'Clean rock. No ore, no geodes, no glitter — just the stone and the charge in it, all the way down. Some shells are like this. None of the good ones.',
    rule: 'Nothing drops.',
    goalText: 'Reach depth 100.',
    lesson:
      'The whole material chain — Forge, Crucible, contracts, gems — is downstream of a drop roll you never think about. Cut it and the shaft is still a shaft, but everything you built ON the shaft stops.',
    laws: { sealDrops: true },
    setup: () => {},
    goal: (s) => s.depth >= 100,
    reward: 'autoSell',
  },
  {
    id: 'flatWorld',
    name: 'The Flat World',
    order: 15,
    premise:
      'Serra will not run the road in a flat season. "Nothing to sell into," she says. "Nothing is happening anywhere, and I can feel it."',
    rule: 'Every shell reads its neutral weather, forever.',
    goalText: 'Bank 50,000 Dust.',
    lesson:
      'Weather never changed what you could do, only when it was worth doing. A flat world is a fair one and a much duller one — the free multiplier you never planned around was worth planning around.',
    laws: { sealWeather: true },
    setup: () => {},
    goal: (s) => s.totals['dust']?.gte(50_000) ?? false,
    reward: 'autoWeather',
  },
  {
    id: 'crowdedFace',
    name: 'The Crowded Face',
    order: 16,
    premise:
      'The opposite of her one-hand shaft, and she tried it in the same season: a face so wide two people could work it, cut into rock that gives back almost nothing.',
    rule: 'The face is 8x8. Regen runs at a quarter.',
    goalText: 'Chip 400,000 charge out of the wide face.',
    lesson:
      'One Cell taught you that width is not income. This is the same lesson from the other side: all the width in the world against a quarter of the regen, and the ceiling barely moves. Regen was the whole sentence.',
    laws: { regenMult: 0.25 },
    setup: (s) => {
      s.face.w = 8;
      s.face.h = 8;
      s.face.cells = new Array(64).fill(0);
    },
    goal: (s) => s.stats.totalChargeChipped.gte(400_000),
    reward: 'autoWiden',
  },
];

export const CHALLENGE_BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]));

/** Challenges available to start: unlocked by the Spiral, minus the done ones. */
export function availableChallenges(s: GameState): ChallengeDef[] {
  if (s.spiral.count < 1) return [];
  return CHALLENGES.filter((c) => !s.spiral.challengeDone.includes(c.id)).sort((a, b) => a.order - b.order);
}
