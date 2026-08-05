/**
 * LEGENDARY PARTS — the components you EARN, poured in a stone that is yours.
 *
 * `FORGE_design.md`'s fantasy is "a tool that is YOURS ... you never throw it
 * away for a better drop". Legendary parts are the one place a drop enters that
 * promise without breaking it: you never find a TOOL, you find ONE PART, and it
 * is worth nothing until you have built the other six around it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE STONE IS YOURS AND NOT THE PART'S.
 *
 * The obvious build — a legendary part is a fixed named object made of a fixed
 * named material — is dead on arrival here, for two reasons that are both load-
 * bearing rules elsewhere in the forge:
 *
 *   RULING 1 (`forgeParts.ts`) says only the shell compounds. A legendary Loam
 *   head is therefore beaten by an ORDINARY Ferrite head, and must be — so a
 *   fixed-stone legendary is trash one shell after you earn it, which is the
 *   exact "throw it away for a better drop" the doc forbids.
 *
 *   COHERENCE reads `shellOrdinal` per part. Seven legendaries earned across
 *   seven shells would be the most incoherent tool in the game, so completing
 *   the set would PUNISH you.
 *
 * So what you earn is the PATTERN. The part arrives real, poured in the best
 * stone you were holding at the moment you earned it — and once earned it can be
 * re-poured, at the normal cost in stock, in any stone you hold. The legend is
 * yours forever; the material is a decision you keep making.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ALMOST NOTHING BELOW IS NEW MACHINERY, and that is deliberate.
 *
 * A legendary part is a `Part` like any other. What makes it legendary is three
 * things the game ALREADY knows how to do:
 *
 *   1. It is poured at the top of the purity ladder — `pristine`, the band A.68
 *      P2 added, which no drop table can reach. You cannot cast pristine stock.
 *   2. It carries a MASTERWORK perk (`craft: 'masterwork'` + a `work`), so
 *      `craftFold` reads it exactly as it reads a lucky pour. Flawless, Roomy,
 *      Thrifty and Trueborn all work unchanged — and you do not get to CHOOSE a
 *      masterwork on an ordinary cast, which is half of what "legendary" means.
 *   3. It carries a bounded magnitude `boost`, the only genuinely new term, held
 *      well under `SHELL_STEP` so ruling 1 still holds against the next shell.
 *
 * So a legendary part is "your stone at its absolute best, plus the masterwork
 * you would have had to be lucky to roll". Better than anything you can cast —
 * not because it plays by different rules, but because it is the top of the
 * rules you already have.
 *
 * PILLAR 2. `boost` moves `magnitude`, which feeds the same ten stats every part
 * feeds, through the same `effectOf` clamps. No part has ever had a yield term:
 * value lives in reach, per-cell take, ore speed, durability and utility. A
 * legendary tool clears the face faster; the face still holds `W x H x regen`.
 */
import type { GameState } from '../types';
import type { MasterworkId, PartType } from './forgeParts';

export interface LegendaryPartDef {
  id: string;
  /** It arrives named, like a relic or a prize drill. The stone changes; this does not. */
  name: string;
  partType: PartType;
  /**
   * Magnitude multiplier. Held well under `SHELL_STEP` (6.0) so a legendary part
   * of one shell can never out-stat an ordinary part of the next — the guarantee
   * ruling 1 rests on, asserted in `legendary.test.ts` rather than assumed.
   */
  boost: number;
  /** The masterwork perk it always carries. Reuses `craftFold` entirely. */
  work: MasterworkId;
  /** What it says when it arrives. Once. */
  line: string;
  /** Shown BEFORE it is earned — a goal, not a locked list entry (pillar 5). */
  requirement: string;
  /** A pure read of the save. Nothing is stored for an unearned part. */
  earned: (s: GameState) => boolean;
}

/** How far a legend may lift its stone. Ruling 1's headroom, asserted in test. */
export const LEGENDARY_BOOST_MAX = 1.6;

const deepest = (s: GameState, shell: string): number => s.depthRecords?.[shell] ?? 0;
const achievementCount = (s: GameState): number =>
  Object.keys(s.achievements?.unlocked ?? {}).length;
// The Wardens are gone (A.7x) — not combat; THE STANDOFF is live and fought at
// the five hazard stations (types.ts). No warden means no felling, so instead:
// every past Breach implied a floor was overcome, so
// breachCount is the surviving proxy for wardens felled.
const wardensFelled = (s: GameState): number => s.shell?.breachCount ?? 0;

/**
 * SEVEN, one per part type, so a fully legendary tool is a real long-game goal
 * rather than seven near-duplicates competing for one slot. Every source is
 * something the player was already doing — depth, wardens, achievements, ore,
 * collapses — because a reward for a detour is a chore with a prize on it.
 */
export const LEGENDARY_PARTS: LegendaryPartDef[] = [
  {
    id: 'firstbite',
    name: 'The First Bite',
    partType: 'head',
    boost: 1.45,
    work: 'flawless',
    line: 'Somebody swung this until it stopped wearing out. You can feel where their hand went.',
    requirement: 'Stand at Loam 120',
    earned: (s) => deepest(s, 'loam') >= 120,
  },
  {
    id: 'lastedge',
    name: 'The Last Edge',
    partType: 'edge',
    boost: 1.4,
    work: 'trueborn',
    line: 'Ground so fine it reads as a line rather than a thing.',
    requirement: 'Fell a Floor Warden',
    earned: (s) => wardensFelled(s) >= 1,
  },
  {
    id: 'deadweight',
    name: 'Dead Weight',
    partType: 'core',
    boost: 1.5,
    work: 'trueborn',
    line: 'It does not want to move. Nothing that hits it wants to either.',
    requirement: 'Fell three Floor Wardens',
    earned: (s) => wardensFelled(s) >= 3,
  },
  {
    id: 'thelashing',
    name: 'The Lashing',
    partType: 'binding',
    boost: 1.35,
    work: 'roomy',
    line: 'Whoever tied this expected it to hold something that did not want holding.',
    requirement: 'Twenty achievements',
    earned: (s) => achievementCount(s) >= 20,
  },
  {
    id: 'longmorning',
    name: 'The Long Morning',
    partType: 'handle',
    boost: 1.4,
    work: 'thrifty',
    line: 'Still growing, after all this. It has decided it is a handle now.',
    requirement: 'Stand at Verdance 100',
    earned: (s) => deepest(s, 'verdance') >= 100,
  },
  {
    id: 'wornsmooth',
    name: 'Worn Smooth',
    partType: 'grip',
    boost: 1.3,
    work: 'flawless',
    line: 'The commonest thing in the world, held long enough to become the rarest.',
    requirement: 'Survive forty Collapses',
    earned: (s) => (s.collapse?.count ?? 0) >= 40,
  },
  {
    id: 'theopening',
    name: 'The Opening',
    partType: 'sockets',
    boost: 1.45,
    work: 'roomy',
    line: 'More holes than stone, and every one of them wants something in it.',
    requirement: 'Open two hundred ore pockets',
    earned: (s) => (s.stats?.oresOpened ?? 0) >= 200,
  },
];

export const LEGENDARY_BY_ID = new Map(LEGENDARY_PARTS.map((l) => [l.id, l]));

/** The legend for a part type, if there is one. The diagram and rack ask this. */
export function legendaryFor(type: PartType): LegendaryPartDef | undefined {
  return LEGENDARY_PARTS.find((l) => l.partType === type);
}
