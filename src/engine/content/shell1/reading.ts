/**
 * THE READING (§10.1–10.3) — Sable's desk, and the nine sentences it holds.
 *
 * NOTES are earned by NOVELTY and never by repetition. PROPOSITIONS are
 * sentences that change a rule. PROOFS are behavioural: to open one you go and
 * do the thing it is about, in a system you already own.
 *
 * WHY NINE AND NOT TWELVE. §10.3's list was written for a game with more in it,
 * and the brief is explicit that it is a shape to match rather than a manifest
 * to fill. Every row here is wired to a call site that exists in Loam today and
 * fires in play. The three that were cut, and why:
 *
 *   "Wear is information"     — there is no wear. The axis was cut at A.75 on
 *                               the grounds that it was a knob, not an axis.
 *   "A line is one machine"   — there are no Lines in Loam. A proposition about
 *                               an unreached machine also breaks LAW 3.
 *   "Deep material is older"  — it wants a SECOND TRAIT on a drop, and traits
 *                               are per-material, not per-drop. Wiring it means
 *                               a per-drop trait channel through `applyDrop`,
 *                               the Hold, the Forge and the Compendium. That is
 *                               a phase, not a row, and half of it would be a
 *                               proposition that proves and then does nothing.
 *
 * LAW 3 IS THE WHOLE SHAPE OF THIS FILE. A proposition shows its QUESTION and
 * nothing else until it is proven — never its effect, never a recipe, and never
 * the name of a machine or material you have not reached. `rule` is the
 * sentence the player earns; it is not rendered before `proven`.
 *
 * PILLAR 2: not one of the nine touches cap, regen or yield. They change what
 * the machines will do, what the rock remembers, and what stays legible — reach
 * and behaviour, which is the only kind of thing a rule change is allowed to be.
 */
import type { GameState } from '../../types';

/** What the desk counts. Written ONLY by `noteTally` in systems/reading.ts, so
 *  there is one choke point rather than a counter per call site. */
export type Tally =
  /** Deep-entry gates crossed by hand, at any depth. */
  | 'gates'
  /** A cell taken all the way to the terminal gate. */
  | 'terminal'
  /** Pockets opened by the player's own hand. */
  | 'handPockets'
  /** Pockets a machine claimed and finished. */
  | 'drillPockets'
  /** Machines given a painted zone. */
  | 'routed'
  /** Machines given a bar to wait behind. */
  | 'barSet'
  /** A hand strike landed while a CHAIN machine was working. */
  | 'chainWithHand'
  /** The Kiln was closed while it stood above three-quarters heat. */
  | 'bankedHot'
  /** Stations sampled on the Roll. */
  | 'sampled';

export interface Proposition {
  id: string;
  /** §10.3's disciplines, for the Codex grouping. */
  discipline: 'Metallurgy' | 'Mechanics' | 'Prospecting';
  /** ALL the player sees before it is proven (LAW 3). Never states the effect. */
  question: string;
  /** The behaviour that opens it, in plain words. Shown for the one being worked. */
  proof: string;
  /** THE SENTENCE. Rendered only once proven — this is the thing you earn. */
  rule: string;
  /** Notes needed before the question is even on the desk. */
  notes: number;
  /** Is the proof satisfied? Reads state the player has already produced. */
  proved: (s: GameState, t: (k: Tally) => number) => boolean;
}

/**
 * The nine. Ordered by the notes they cost, which is roughly the order a player
 * meets the systems they are about.
 */
export const PROPOSITIONS: Proposition[] = [
  {
    id: 'gateSight',
    discipline: 'Metallurgy',
    notes: 1,
    question: 'The rock changes long before it gives anything up. Can that be read?',
    proof: 'Take one cell all the way down to the deepest gate.',
    rule: 'You can feel a gate coming. Compaction shows on the rock from the first blow, not from the first gate.',
    proved: (_s, t) => t('terminal') >= 1,
  },
  {
    id: 'shallowHolds',
    discipline: 'Metallurgy',
    notes: 2,
    question: 'Why does rock you barely touched go soft as fast as rock you worked?',
    proof: 'Hold six cells at the first gate or better, at the same time.',
    rule: 'Shallow rock does not relax. Work below the first gate stays in the rock instead of seeping back out of it.',
    proved: (s) => (s.face.compaction ?? []).filter((c) => c >= 8).length >= 6,
  },
  {
    id: 'patientBank',
    discipline: 'Mechanics',
    notes: 3,
    question: 'A machine told to wait loses the stroke it was owed. Why should waiting cost it?',
    proof: 'Give three machines a bar to wait behind.',
    rule: 'A machine that waits is not resting. Time spent under its bar is banked, and spent the moment the rock comes back.',
    proved: (_s, t) => t('barSet') >= 3,
  },
  {
    id: 'handLed',
    discipline: 'Mechanics',
    notes: 3,
    question: 'The machines work beside you all shift and never once follow you.',
    proof: 'Set a machine to CHAIN, then strike the face yourself while it runs.',
    rule: 'A machine follows the hand. A chaining machine works out from the cell you last struck, not from its own.',
    proved: (_s, t) => t('chainWithHand') >= 1,
  },
  {
    id: 'zoneIsOrder',
    discipline: 'Mechanics',
    notes: 4,
    question: 'You painted the squares yourself. Why do the machines still keep out of each other\'s way?',
    proof: 'Paint a zone on two machines.',
    rule: 'A painted square is an order, not a preference. Machines working a zone you drew stop making room for each other inside it.',
    proved: (_s, t) => t('routed') >= 2,
  },
  {
    id: 'oreIsRock',
    discipline: 'Mechanics',
    notes: 4,
    question: 'A pocket sits in a zone you painted, and the machine you put there walks past it.',
    proof: 'Open three pockets with your own hands.',
    rule: 'Ore is not a different kind of rock. A machine set to rock only will still take a pocket that sits inside its own zone.',
    proved: (_s, t) => t('handPockets') >= 3,
  },
  {
    id: 'pocketPatience',
    discipline: 'Mechanics',
    notes: 5,
    question: 'You broke the ground. Something else finished it and called the find its own.',
    proof: 'Let the machines take five pockets, and watch what it costs you.',
    rule: 'A pocket you started is yours. Machines leave alone any pocket your own hands have already broken ground on.',
    proved: (_s, t) => t('drillPockets') >= 5,
  },
  {
    id: 'heldBreath',
    discipline: 'Mechanics',
    notes: 5,
    question: 'The fire cools at the same rate whether you close it or starve it.',
    proof: 'Bank the Kiln above three-quarters heat, then close it yourself.',
    rule: 'A throat you close keeps its heat. Only a starved fire loses it — a Kiln you shut deliberately holds what it had.',
    proved: (_s, t) => t('bankedHot') >= 1,
  },
  {
    id: 'readStays',
    discipline: 'Prospecting',
    notes: 6,
    question: 'You read the seam, and the cave-in took the reading along with the rock.',
    proof: 'Read a station, then come back through a Collapse.',
    rule: 'A place you have read stays read. The fall changes what a station holds; it no longer closes the fog over where it is.',
    proved: (s, t) => t('sampled') >= 1 && s.collapse.count >= 1,
  },
];

export function propositionById(id: string): Proposition | undefined {
  return PROPOSITIONS.find((p) => p.id === id);
}

/**
 * NOTES — earned by novelty, never by repetition (§10.1). Each fires ONCE, ever,
 * and the id is what makes that true: the set of ids a player holds IS the
 * record, so there is no counter to farm.
 *
 * These are deliberately spread across the systems Loam opens in its first
 * couple of hours, so the desk fills as a by-product of playing rather than as
 * an errand. A note is never a reward for grinding something you already did.
 */
export interface NoteDef { id: string; text: string }

export const NOTES: NoteDef[] = [
  { id: 'firstGate', text: 'Worked rock gives up something the fresh rock never does.' },
  { id: 'terminalGate', text: 'There is a floor to how deep one cell will go, and it is reachable.' },
  { id: 'firstPocket', text: 'A pocket does not come away in one blow. It has to be opened.' },
  { id: 'firstCollapse', text: 'The fall takes the face and leaves what you learned.' },
  { id: 'firstRoute', text: 'A machine will work only the squares you paint for it.' },
  { id: 'firstBehaviour', text: 'Two machines given the same rock will not go to the same cell.' },
  { id: 'firstBar', text: 'A machine can be told to leave thin rock alone.' },
  { id: 'firstOverstoke', text: 'The fire can be pushed past what it will hold.' },
  { id: 'firstSample', text: 'A place can be read before it is reached.' },
  { id: 'firstDrillPocket', text: 'The machines will take a pocket if nobody stops them.' },
];
