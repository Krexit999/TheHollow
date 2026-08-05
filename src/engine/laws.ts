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
  /** Hardness walls: 0 = hard stop; 1 = passable one tier under at 3× cost ('The Unwritten Wall'). */
  wallSoftness: { base: 0, mode: 'max' },
} as const satisfies Record<string, NumLawDef>;

export type NumLaw = keyof typeof NUM_LAWS;

export type FlagLaw =
  | 'kilnReverse' // the Kiln gains a reverse gear: Brick back to Dust at a premium
  | 'twinDescent' // the shell you left keeps producing at the pace you left it
  | 'assayPersist' // a survey's mark never expires
  | 'autoReplant' // greenhouse plots re-seed themselves
  | 'chainPersistDescend' // polarity chains ride the stair down
  | 'beamWide' // the refraction beam lights its shoulders at half gift
  | 'sealedSeam' // the choke keeps a safety seam: heat caps at 97, flooding impossible
  | 'crewAlwaysWorks' // recalled crew keep working from the stair
  | 'structuresRemember' // Recursions begin with Kiln, Bay, Forge standing
  | 'convDescend' // the stair accepts the converter currency when it is cheaper
  | 'runeMirror' // every etched pair also speaks backwards
  | 'progressionPalindrome'; // Progressions also read right-to-left

/*
 * FOUR SLOTS CUT AT A.99 — `wellFloorShare`, `tapeSteps`, `wardenOptional`,
 * `guildRemembers`.
 *
 * Not deprecated. DELETED, exactly as A.82 deleted four dead SEALS from the
 * union below, and for a stronger reason than that one had. Those four seals had
 * no READER; these four have no SUBJECT:
 *
 *   wellFloorShare    "a lost Magma Well pays back this share" — there is no
 *                     Well system. `relics.ts` has 'a Magma Well' as the NAME of
 *                     a relic drop-source and `shaftSys` has 'well' as a scar
 *                     kind. Nothing is ever lost, so nothing can pay back.
 *   tapeSteps         "Echo Chamber tape length" — the Echo Chamber appears in
 *                     exactly one place in `src/`: a COMMENT in
 *                     `recursionSys`'s survive-ledger listing what it would keep
 *                     if it existed.
 *   wardenOptional    "the floor opens without the warden felled" — `breach.ts`
 *                     says it plainly: "Combat is gone (A.7x) — the Floor Warden
 *                     gate went with it". The law would remove a gate that was
 *                     already removed. (A.106: that quoted comment means the
 *                     WARDENS, not combat — THE STANDOFF is live. Either way
 *                     there is no warden gate on the floor for a law to lift.)
 *   guildRemembers    "the Lamphouse is open from minute one of a Recursion" —
 *                     the Guild slice survives only as a stub in
 *                     `migrations.ts` and as achievement LABELS. It is not in
 *                     `GameState`.
 *
 * The brief's own test applies: a slot with a reader nobody would write a law
 * for is worse than no slot, and a slot whose reader CANNOT BE WRITTEN without
 * first building an absent system is worse again — it is a construction event
 * disguised as a name, which is the Rune Bench ruling.
 *
 * Three of the seven earned their reader instead: `autoReplant` (growth.ts,
 * A.99), `progressionPalindrome` (shell4/runes.ts, A.99) and `crewAlwaysWorks`
 * (crews.ts, A.99). `regenCeilingMult` keeps its reader and stays deliberately
 * WRITER-less — it is the heresy, and pillar 2 owns it.
 */

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
/*
 * THREE NUMERIC LAWS CUT AT A.102 — `faceCells`, `encounterMult`, `axiomCap`.
 *
 * Same treatment A.82 gave four dead SEALS, for the same reason and with the
 * same sweep behind it: each was declared here and read by NOTHING. One of them
 * is combat, which went at A.7x. Authoring a challenge around any of the three
 * would be the dead-name class coming back through the door A.82 closed.
 *
 * The three that remain — `heatRateMult`, `regenMult`, `depthCap` — each have a
 * live reader, and `seals.test.ts` now fails the build if one loses it.
 */
export interface ChallengeLaws {
  /** Heat climbs this much faster (Cinder). */
  heatRateMult?: number;
  /** Multiplies cell regen. */
  regenMult?: number;
  /** Hard cap on depth for the run. */
  depthCap?: number;
  sealWiden?: boolean;
  sealKiln?: boolean;
  sealHand?: boolean;
  sealTools?: boolean;
  sealRooms?: boolean;
  sealGovernor?: boolean;
  // --- Phase 15 ---------------------------------------------------------
  /** Nothing accrues while away. */
  sealOffline?: boolean;
  /** The world cannot be collapsed. One run, all the way down. */
  sealCollapse?: boolean;
  /** Nothing drops. No materials, no gems, no geodes. */
  sealDrops?: boolean;
  /** Every material rolls at zero purity. */
  sealPurity?: boolean;
}
/*
 * FOUR SEALS CUT AT A.82: `sealSignatures`, `sharedBank`, `sealWeather`,
 * `sealFlee`.
 *
 * Not deprecated — DELETED. Each had ZERO references anywhere in `src/` outside
 * this file: no guard read them, so no challenge could ever have expressed
 * itself through them and no player could ever have felt one. They were names
 * in a union, and a name in a union is the cheapest possible way to look like a
 * feature.
 *
 * The ten that remain all have a live reader (`seals.test.ts` enforces it), and
 * that is a WEAKER claim than "they work": nothing calls
 * `registerChallengeLaws`, so every one of those readers is still dead code
 * waiting on the layer that switches it on. Cutting the four closes the
 * dead-NAME class; the dead-BEHAVIOUR class is still open and still ledgered.
 */

export type ChallengeSeal =
  | 'sealWiden' | 'sealKiln' | 'sealHand' | 'sealTools'
  | 'sealRooms' | 'sealGovernor'
  | 'sealOffline' | 'sealCollapse' | 'sealDrops'
  | 'sealPurity';

/** Every seal, as data — so a test can walk them rather than trust a list in a
 *  comment. Kept beside the union it mirrors; `seals.test.ts` asserts the two
 *  agree, because a hand-maintained copy of a type is a copy that drifts. */
export const ALL_SEALS: ChallengeSeal[] = [
  'sealWiden', 'sealKiln', 'sealHand', 'sealTools',
  'sealRooms', 'sealGovernor',
  'sealOffline', 'sealCollapse', 'sealDrops',
  'sealPurity',
];

const challengeLaws = new Map<string, ChallengeLaws>();

export function registerChallengeLaws(id: string, laws: ChallengeLaws): void {
  challengeLaws.set(id, laws);
}

// ---------------------------------------------------------------------------
// WHAT A CHALLENGE LEAVES BEHIND (A.103)
// ---------------------------------------------------------------------------
/**
 * A SEAL IS FOR THE RUN; A GRANT IS FOREVER — and it is a CAPABILITY, never a
 * number. §20.2's own table breaks that rule four times ("+25% Surge", "the
 * lock threshold rises 20 → 26", "two essences per unit", "the Line gains a
 * slot"), and every one of those would have put a permanent multiplier behind a
 * restriction, which is the shape pillar 2 exists to refuse. What the ten
 * grants below do instead is change what the world is WILLING to do: a drift
 * survives a fall, a geode opens where it lies, the face turns on its side,
 * crews walk while nobody watches. None of them touch `W·H·regen·Y`.
 *
 * THE SYMMETRY WITH SEALS IS DELIBERATE. `sealed()` asks "is this rule in force
 * for the run"; `keptLaw()` asks "did you beat the run that pays for it". Both
 * are read at exactly one place per name, both are walked by a test rather than
 * trusted to a comment, and both fail the build if a name loses its reader —
 * because the seals spent phases as a registry with a writer and nothing that
 * reached it, and a second registry of the same shape would be that failure
 * knowingly repeated.
 *
 * The grant id IS the challenge id. There is no second table to drift.
 */
export type ChallengeGrant =
  | 'unattended'    // drills tend themselves — a worn drill never wants a hand
  | 'longfall'      // drifts survive a Breach, translated onto the new ladder
  | 'thinseam'      // a geode opens where it is found
  | 'honeststone'   // a drop names its purity as it lands
  | 'onecell'       // the face may be turned on its side
  | 'emptyhand'     // salvage hands the cast parts back, not scrap
  | 'coldiron'      // the Kiln comes back lit after a Collapse
  | 'unlit'         // crews keep walking while you are away
  | 'heldbreath'    // the choke works in any shell, not only Cinder
  | 'sableswalk';   // a room you have opened never closes again

/** Every grant, as data, for the same reason `ALL_SEALS` is data. */
export const ALL_GRANTS: ChallengeGrant[] = [
  'unattended', 'longfall', 'thinseam', 'honeststone', 'onecell',
  'emptyhand', 'coldiron', 'unlit', 'heldbreath', 'sableswalk',
];

/**
 * Do you hold this permanently? Read off `spiral.challengeDone`, which is the
 * completion record itself — so there is no separate grant store to fall out of
 * step with it, and a grant is kept exactly as long as the memory of beating
 * the run is. `doSpiral` spreads `spiral` forward and a Recursion never touches
 * it, so "forever" is literal.
 */
export function keptLaw(state: GameState, grant: ChallengeGrant): boolean {
  return state.spiral?.challengeDone?.includes(grant) === true;
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
  key: 'heatRateMult' | 'regenMult' | 'depthCap',
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
