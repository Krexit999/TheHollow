/**
 * THE LAW REGISTRY — Axioms rewrite rules, not numbers, and this is how the
 * codebase survives that without becoming a conditional thicket.
 *
 * The ~14 places where the engine decides HOW THE WORLD WORKS (does a cell
 * empty? how many cells does a drill stroke touch? which way does the Kiln
 * run? does a wall block or slow?) each consult a typed LAW SLOT instead of
 * a constant. The choke points do not know Axioms exist; they know law
 * slots exist. An Axiom is a named, permanent override registered into one
 * or more slots at purchase (The Rewrite, Shell VII).
 *
 * COMPOSITION RULES (documented the way signature stacking was):
 *  - Numeric slots declare a mode: 'max' (strongest law wins), 'mult'
 *    (laws compound), or 'add'. Commutative by construction — acquisition
 *    order can never contradict.
 *  - Flag slots OR together. Each flag slot is owned by exactly ONE Axiom
 *    by design; the few intended interactions are pairwise-documented on
 *    the Axioms themselves (axioms.ts).
 *  - No law may consult another law. Slots are leaves.
 *
 * PILLAR 2: exactly one Axiom touches the regen ceiling ('Heresy of the
 * Ceiling', mult 1.15) and it is marked heresy — it announces itself in
 * the UI as a deliberate, legible break. Every other slot is ceiling-
 * neutral by construction (floors, retention, routing, direction — never
 * generation).
 */
import type { GameState } from './types';

export interface NumLawDef {
  base: number;
  mode: 'max' | 'mult' | 'add';
}

export const NUM_LAWS = {
  /** Cells never deplete below cap × this ('The Unemptying'). */
  regenFloorShare: { base: 0, mode: 'max' },
  /** Cells a single drill stroke works ('Two Hands'). */
  drillStrokes: { base: 1, mode: 'max' },
  /** The offline efficiency cap ('The Insomniac Camp'). */
  offlineEffCap: { base: 0.95, mode: 'max' },
  /** THE ONE HERESY: multiplies the regen ceiling itself. */
  regenCeilingMult: { base: 1, mode: 'mult' },
  /** Face-upgrade levels a Collapse retains ('The Gentle Fall'; max with Momentum). */
  collapseRetain: { base: 0, mode: 'max' },
  /** A lost Magma Well pays back this share ('The Honest Well'). */
  wellFloorShare: { base: 0, mode: 'max' },
  /** Echo Chamber tape length ('The Long Echo'). */
  tapeSteps: { base: 12, mode: 'add' },
  /** Hardness walls: 0 = hard stop; 1 = passable one tier under at 3× cost ('The Unwritten Wall'). */
  wallSoftness: { base: 0, mode: 'max' },
} as const satisfies Record<string, NumLawDef>;

export type NumLaw = keyof typeof NUM_LAWS;

export type FlagLaw =
  | 'kilnReverse' // the Kiln gains a reverse gear: Brick back to Dust at a premium
  | 'twinDescent' // the shell you left keeps producing at the pace you left it
  | 'wardenOptional' // the floor opens without the warden felled (they keep their drops)
  | 'assayPersist' // a survey's mark never expires
  | 'autoReplant' // greenhouse plots re-seed themselves
  | 'chainPersistDescend' // polarity chains ride the stair down
  | 'beamWide' // the refraction beam lights its shoulders at half gift
  | 'sealedSeam' // the choke keeps a safety seam: heat caps at 97, flooding impossible
  | 'crewAlwaysWorks' // recalled crew keep working from the stair
  | 'structuresRemember' // Recursions begin with Kiln, Bay, Forge standing
  | 'guildRemembers' // the Lamphouse is open from minute one of a Recursion
  | 'convDescend' // the stair accepts the converter currency when it is cheaper
  | 'runeMirror' // every etched pair also speaks backwards
  | 'progressionPalindrome'; // Progressions also read right-to-left

/** Registered by axioms.ts at content load; keyed by axiom id. */
export interface LawContribution {
  num?: Partial<Record<NumLaw, number>>;
  flags?: FlagLaw[];
}

const contributions = new Map<string, LawContribution>();

export function registerLawContribution(axiomId: string, c: LawContribution): void {
  contributions.set(axiomId, c);
}

// ---------------------------------------------------------------------------
// CHALLENGE SEALS (Phase 12)
// ---------------------------------------------------------------------------
/**
 * Axiom laws only ever make the world MORE permissive — every numeric slot is
 * 'max' or 'mult' off a base, by design, so acquisition order can never
 * contradict. Challenges need the opposite: they take things away for the
 * duration of one run. Rather than bend the axiom slots into something that
 * can subtract (which would make Axiom composition order-dependent), seals are
 * their own small registry with their own rule: a seal is ON if the ACTIVE
 * challenge declares it, and off otherwise. Exactly one challenge is ever
 * active, so seals need no composition rule at all.
 *
 * Registered from content (challenges.ts) the same way axioms register, so
 * laws.ts still imports nothing from content.
 */
export interface ChallengeLaws {
  /** Hard cap on the number of face cells. */
  faceCells?: number;
  /** Heat climbs this much faster (Cinder). */
  heatRateMult?: number;
  /** Multiplies cell regen — the inverse lesson to faceCells. */
  regenMult?: number;
  /** Hard cap on depth for the run. */
  depthCap?: number;
  /** Multiplies encounter frequency. */
  encounterMult?: number;
  /** Hard cap on how many Axioms may be owned. */
  axiomCap?: number;
  sealWiden?: boolean;
  sealKiln?: boolean;
  sealHand?: boolean;
  sealTools?: boolean;
  sealRooms?: boolean;
  sealGovernor?: boolean;
  sealSignatures?: boolean;
  sharedBank?: boolean;
  // --- Phase 15 ---------------------------------------------------------
  /** Nothing accrues while away. */
  sealOffline?: boolean;
  /** The world cannot be collapsed. One run, all the way down. */
  sealCollapse?: boolean;
  /** Nothing drops. No materials, no gems, no geodes. */
  sealDrops?: boolean;
  /** Every shell reads its neutral weather forever. */
  sealWeather?: boolean;
  /** Every material rolls at zero purity. */
  sealPurity?: boolean;
  /** You cannot slip away from an encounter. */
  sealFlee?: boolean;
}

export type ChallengeSeal =
  | 'sealWiden' | 'sealKiln' | 'sealHand' | 'sealTools'
  | 'sealRooms' | 'sealGovernor' | 'sealSignatures' | 'sharedBank'
  | 'sealOffline' | 'sealCollapse' | 'sealDrops' | 'sealWeather'
  | 'sealPurity' | 'sealFlee';

const challengeLaws = new Map<string, ChallengeLaws>();

export function registerChallengeLaws(id: string, laws: ChallengeLaws): void {
  challengeLaws.set(id, laws);
}

function activeLaws(state: GameState): ChallengeLaws | undefined {
  const active = state.spiral?.activeChallenge;
  return active ? challengeLaws.get(active.id) : undefined;
}

/** Is this seal in force right now? False whenever no challenge is running. */
export function sealed(state: GameState, seal: ChallengeSeal): boolean {
  return activeLaws(state)?.[seal] === true;
}

/** A numeric challenge override, or the given base when none is in force. */
export function challengeNum(
  state: GameState,
  key: 'faceCells' | 'heatRateMult' | 'regenMult' | 'depthCap' | 'encounterMult' | 'axiomCap',
  base: number,
): number {
  return activeLaws(state)?.[key] ?? base;
}

export function clearLaws(): void {
  contributions.clear();
  challengeLaws.clear();
}

function owned(state: GameState): string[] {
  return state.recursion?.axioms ?? [];
}

export function lawNum(state: GameState, slot: NumLaw): number {
  const def = NUM_LAWS[slot] as NumLawDef;
  const axioms = owned(state);
  if (axioms.length === 0) return def.base; // the pre-Axiom world — the hot path
  let value: number = def.base;
  for (const id of axioms) {
    const v = contributions.get(id)?.num?.[slot];
    if (v === undefined) continue;
    if (def.mode === 'max') value = Math.max(value, v);
    else if (def.mode === 'mult') value *= v;
    else value += v;
  }
  return value;
}

export function lawFlag(state: GameState, flag: FlagLaw): boolean {
  const axioms = owned(state);
  if (axioms.length === 0) return false; // the hot path: no Axioms, no override
  for (const id of axioms) {
    if (contributions.get(id)?.flags?.includes(flag)) return true;
  }
  return false;
}
