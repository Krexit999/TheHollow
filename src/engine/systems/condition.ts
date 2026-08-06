/**
 * E2 — HAZARDS LEAK INTO THE PLANT (§7.2).
 *
 * "Shell hazards currently affect the run. Now they affect machines. One
 * condition value per machine, one rule per shell."
 *
 * Blocking three separate things since A.85: the Circuit's machine-condition
 * read, Glassmere's unallocated-band rule, and half of what a flood does. It is
 * one field and five rules, exactly as §7.2 sizes it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT MAKES THIS E2 AND NOT A STATUS EFFECT.
 *
 * A condition is written BY THE WORLD, not by the player and not by the
 * machine. Nobody authors "my Crusher spent forty hours in Cinder and now it
 * runs better and shatters every twenty cycles" — the rule permits it and your
 * own scheduling produces it. So every `write` below reads a number the shell
 * was already keeping for its own reasons (Cinder's heat, Verdance's idleness,
 * Glassmere's beam, Hollow's silence, Ferrite's chain) and none of them reads
 * an input the player aimed at a machine.
 *
 * PILLAR 2, and it is the same argument `plant.ts` makes one layer up. A
 * condition GATES: it decides whether a machine runs, how fast it converts what
 * it already has, which band comes out, and what traits it counts as being
 * built from. There is no path from any line in this file to `cellCap`,
 * `cellRegen` or `chipYield`, so `dpsMax = W·H·regen·Y` cannot move — asserted
 * by driving every rule to full on every machine and reading the ceiling.
 *
 * AND IT IS REVERSIBLE BY RE-CASTING THE PART, which §7.2 names as the reason
 * the balance risk is bounded. `recastMachine` spends cast parts and clears
 * whatever the world wrote. That is the only way out of a SEIZURE, and it is
 * a way out of any of the five.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE FIVE RULES ARE NOT FIVE MODIFIERS. Each one is a different SHAPE:
 *
 *   Cinder      BAKED       a slow ratchet with two opposite readings — the
 *                           machine you cast `warm` gets quicker the longer it
 *                           sits in the heat, and the one you cast `brittle`
 *                           eventually stops dead.
 *   Verdance    OVERGROWN   written when the Bloom cannot cover what is built —
 *                           clear the face bare and your own machines go
 *                           hungry. Hands the machine a TRAIT it was not cast
 *                           with, so every trait-reading behaviour changes.
 *                           RE-POINTED A.108 (see the note at the rule itself).
 *   Glassmere   UNLIT       a straight trade you can aim: half speed, and the
 *                           purity band survives whatever tier the machine is.
 *   Hollow      UNDECIDED   attention IS the mechanic. An unwatched machine
 *                           will not commit to a band; looking at the plant
 *                           settles it.
 *   Ferrite     MAGNETISED  it takes stock one band wider than it was told to,
 *                           which is sometimes exactly wrong. Written when the
 *                           polarity chain is long, and READ by the Sieve.
 */
import type { EngineCtx, GameState } from '../types';
import { bandCount } from './thresholds';
import { brokenAs, clearBreakOnRecast } from './breaks';
import type { ModifierCache } from '../modifiers';
import { traitsOf, type TraitId } from '../traits';
import { currentShell } from '../shells';
import { shellRoll } from './roll';
import { MACHINE_DEMAND, ensurePlant, flowSatisfaction, tierOf } from './plant';
/**
 * THE THIRD DELIBERATE CYCLE, and it follows the same discipline as the two
 * this file and `plant.ts` already document: `governor.ts` reads `conditionOf`
 * from here and this reads `overclockSpeed` from there, both only ever from
 * inside a function body, so neither binding can arrive undefined at module
 * scope. `machineSpeed` is the plant's ONE answer to "how fast is this running",
 * and the world's mark and the player's setting both belong in it — two
 * separate reads would mean every caller multiplying them by hand, which is how
 * one of them ends up forgotten.
 */
import { overclockSpeed } from './governor';
/** ...and the same arrangement with `prism.ts`: it reads `conditionOf` from
 *  here, and `litBands` reads its allocation. Runtime-only, both ways. */
import { carriedBands } from './prism';
/**
 * §31.2 — A SPECIFIED WORLD PUTS PHYSICS IN THE WRONG PLACES, and E2 is where
 * that lands.  is the shell you are standing in until a
 * poured world says otherwise, so this is a no-op for every save that has never
 * poured one. Runtime-only, like every other cycle this file documents.
 */
import { conditionRate, conditionShellId } from './specify';

export type ConditionId = 'baked' | 'overgrown' | 'unlit' | 'undecided' | 'magnetised';

export interface MachineCondition {
  id: ConditionId;
  /** 0..1. Every rule writes into the same range so one readout serves all five. */
  level: number;
  /** OVERGROWN only: the trait it came back carrying. */
  trait?: TraitId;
  /** BAKED + a `brittle` part only: it has cracked and will not run at all. */
  seized?: boolean;
  /** Seconds this has been standing at full. What a cascade waits on (§55). */
  fullFor?: number;
}

/**
 * THE DRAG (§55, A.106) — a machine failing because ANOTHER MACHINE IS.
 *
 * Deliberately NOT a sixth `ConditionId`, and the first draft of this pass got
 * that wrong. A condition is what the SHELL writes, and three of the five rules
 * (`leakedHeat`, `silence`, `polarity.chain`) read no machine id at all — they
 * are true for every built machine at once. So "pass the condition to a
 * neighbour" has no neighbour to pass to in Cinder, Hollow or Ferrite, and in
 * Glassmere the neighbourhood IS the rule, so the target is unlit already. A
 * cascade built out of conditions can only ever fire in Verdance. That is not a
 * system; it is a Verdance feature with four shells of dead code behind it.
 *
 * A DRAG IS ITS OWN FAILURE with its own cause: the machine beside it has been
 * broken long enough that this one is running on what it can get. It is
 * shell-agnostic, it stacks with whatever the world is separately doing, and it
 * names its parent — which is the whole of item 7.
 */
export interface Drag {
  /** The machine that dragged this one. Never itself, never an ancestor. */
  from: string;
  /** Seconds it has been dragged. What the NEXT step of the chain waits on. */
  sec: number;
}

/**
 * HOW LONG A RULE TAKES TO WRITE ITSELF IN FULL, in seconds of the world doing
 * the thing. Four minutes: long enough that it is your scheduling and not a
 * blink, short enough that a player who changes shells sees it happen.
 */
export const CONDITION_FULL_SEC = 240;
/** And how fast it comes back off when the world stops writing it. */
export const CONDITION_CLEAR_SEC = 90;

/** Above this, the rule's consequence is in force. Below, it is only weather. */
export const CONDITION_BITE = 0.5;

/** The speed a machine runs at while UNLIT (§7.2: "runs at half"). */
export const UNLIT_SPEED = 0.5;
/** What a fully BAKED `warm` machine gains in speed. Small, and capped. */
export const BAKED_SPEED = 0.25;
/** Cinder heat above which the plant counts as being run hot. */
export const BAKE_HEAT = 55;
/** Ferrite chain length at which machines start to magnetise. */
export const MAGNET_CHAIN = 5;
/** Hollow silence stacks at which an unwatched machine stops committing. */
export const UNDECIDED_SILENCE = 20;
/** What an OVERGROWN machine comes back carrying. Verdance's own. */
export const OVERGROWTH_TRAIT: TraitId = 'springy';

/**
 * HOW LONG A FAILURE STANDS BEFORE IT TAKES THE NEXT MACHINE WITH IT. Half a
 * condition: long enough that the first failure is the one you notice and act
 * on, short enough that ignoring it for a session is a chain and not a shrug.
 */
export const CASCADE_SEC = 120;
/** What a dragged machine runs at. A cost, never a stop — see rule 4. */
export const DRAG_SPEED = 0.6;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * WHICH MACHINES HAVE A CONDITION: whatever the plant knows about. Derived
 * rather than listed, so a machine added to `MACHINE_DEMAND` is conditioned the
 * day it is built and not a pass later — the same reason the clone check is
 * driven off the Roll registry.
 */
export function conditionedMachines(): string[] {
  return Object.keys(MACHINE_DEMAND);
}

export function ensureCondition(state: GameState): Record<string, MachineCondition> {
  const p = ensurePlant(state);
  return (p.condition ??= {});
}

export function conditionOf(state: GameState, machineId: string): MachineCondition | null {
  const c = state.plant?.condition?.[machineId];
  return c && c.level > 0 ? c : null;
}

export function ensureDrags(state: GameState): Record<string, Drag> {
  const p = ensurePlant(state);
  return (p.dragged ??= {});
}

/** In force, rather than merely present. */
export function biting(state: GameState, machineId: string, id?: ConditionId): boolean {
  const c = conditionOf(state, machineId);
  if (!c || c.level < CONDITION_BITE) return false;
  return id === undefined || c.id === id;
}

// ---------------------------------------------------------------------------
// The five rules
// ---------------------------------------------------------------------------

export interface ConditionRule {
  shellId: string;
  id: ConditionId;
  label: string;
  /** What the condition DOES, in one sentence, for the panel and the Compendium. */
  effect: string;
  /**
   * Is the world writing this right now, for this machine? The rule reads the
   * shell's own state — never an input the player pointed at a machine.
   */
  writing: (state: GameState, machineId: string, mods: ModifierCache) => boolean;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FLOOD LEAK (§36.1 clause 4), WIRED AT A.99 — and it is a CUT WHOSE REASON
 * DISSOLVED, which PILLARS says to go back and re-test rather than treat as
 * settled.
 *
 * `flood.ts` cut this at A.89 and said exactly why: *"its heat leaks into any
 * machine working there (§7.2) — E2 is not built. A machine has tiers,
 * served-Flow and the parts it was cast from, and no CONDITION a station could
 * warp."* **E2 shipped at A.90.** The machine has a condition now, so the only
 * thing the cut was waiting for is standing right here.
 *
 * WHAT LEAKS: a drowned station is permanently hot, so working the band it sits
 * in reads hotter than the shaft actually is. The bonus is per flooded station
 * in reach, which is what makes §36.1's HEAT CORRIDOR a real thing — flooding
 * three adjacent stations does not just make three hot places, it makes the
 * stretch between them warp a plant faster than any of them would alone.
 *
 * IT COSTS IN BOTH DIRECTIONS, and that is §36.1's own wording. `baked` is not
 * a bonus: a machine cast `warm` gets quicker as it bakes, and one cast
 * `brittle` SEIZES and will not run until it is re-cast. So a corridor is a
 * place your `warm` plant loves and your `brittle` plant dies in, and you chose
 * where it is.
 *
 * PILLAR 2 AND ITEM 8 — THE TERRAFORM STILL PAYS NOTHING. This writes a
 * CONDITION and nothing else. `flood.test.ts` has asserted since A.89 that the
 * drop table is bit-identical either side of a flood, and this file's own header
 * states there is no path from a condition to `cellCap`, `cellRegen` or
 * `chipYield`. What a flood buys is still certainty — a seam that never
 * re-rolls — and what it now also buys is a place with weather.
 *
 * NOTHING IS WRITTEN TO `pressure.ts`. The shaft's real heat is untouched;
 * this is a read-side term, used by exactly one rule, and the Cinder signature
 * cannot tell the difference.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** How far up-shaft a drowned station is still felt. */
export const LEAK_REACH = 20;
/** ...and how much each one in reach adds to what the plant thinks it is in. */
export const LEAK_PER_STATION = 14;

/** Flooded stations whose heat reaches the depth the player is working at. */
export function leakingStations(state: GameState): string[] {
  const drowned = state.roll?.flooded ?? [];
  if (drowned.length === 0) return [];
  const here = state.depth ?? 0;
  const out: string[] = [];
  for (const def of shellRoll(state)) {
    if (!drowned.includes(def.id)) continue;
    if (Math.abs(def.depth - here) <= LEAK_REACH) out.push(def.id);
  }
  return out;
}

/** The heat a machine working here BELIEVES it is in. Never written anywhere. */
export function leakedHeat(state: GameState): number {
  return (state.pressure?.heat ?? 0) + LEAK_PER_STATION * leakingStations(state).length;
}

export const CONDITION_RULES: ConditionRule[] = [
  {
    shellId: 'cinder',
    id: 'baked',
    label: 'Baked',
    effect: 'A warm frame runs quicker the longer it bakes. A brittle one cracks.',
    // The shell's own heat, which `pressure.ts` keeps for its own reasons. This
    // READS the signature and never writes to it — plus whatever a drowned
    // station leaks into the band you are standing in (§36.1, wired A.99).
    writing: (s) => leakedHeat(s) >= BAKE_HEAT,
  },
  {
    shellId: 'verdance',
    id: 'overgrown',
    label: 'Overgrown',
    effect: 'It comes back carrying a trait it was never cast with. Feed the plant and it clears.',
    /**
     * RE-POINTED A.108. The old predicate was `served <= 0` — "not drawing",
     * meant to read as IDLE — and it could never be true: `served` is
     * `flowSatisfaction`, a supply RATIO with a floor (`PLANT_FLOOR` 2.4 through
     * `bloomFlow`) that a machine drawing zero simply reads as 1 (satisfied by
     * definition). Verdance's condition had never fired for anybody.
     *
     * THE RULING: "the plant cannot feed it" — `flowSatisfaction(s, id) < 1`,
     * read LIVE rather than off the cached `served` field so this cannot
     * desync from tick order the way the cache can. This is §19's own claim
     * ("the plant runs on your gardening") turned into the write condition
     * instead of contradicted by it: the Bloom's floor is 2.4 and a single
     * tier-I Refinery alone wants 4.0, so a Verdance player who clears fast and
     * builds before cultivating starves their own plant from the FIRST machine
     * that asks for real Flow — no hand-set precondition required, driven and
     * measured in `condition.test.ts` and `scripts/sim.ts --conditions`.
     *
     * ONLY EVER FIRES ON A FLOW DRAWER. `flowSatisfaction` returns 1 for a
     * machine outside `flowDrawers()` — a Surge-only machine (the Crusher, the
     * Breaker, the Line, ...) is never short of Flow because it never asks for
     * any, so it cannot go overgrown under this rule. That is narrower than
     * "any built machine", and it is the honest boundary of "the plant cannot
     * feed it": a machine that draws nothing was never owed anything.
     */
    writing: (s, id) => flowSatisfaction(s, id) < 1,
  },
  {
    shellId: 'glassmere',
    id: 'unlit',
    label: 'Unlit',
    effect: 'Half speed, and the purity band survives whatever tier it is.',
    // §7.2, and §19's one real Glassmere difference: "machines in an
    // unallocated band run at half and lose no purity". A band is allocated
    // when the beam is currently carrying that wavelength.
    writing: (s, id) => !litBand(s, id),
  },
  {
    shellId: 'hollow',
    id: 'undecided',
    label: 'Undecided',
    effect: 'It will not commit to a band until somebody looks at the plant.',
    writing: (s) => (s.hollow?.silence ?? 0) >= UNDECIDED_SILENCE,
  },
  {
    shellId: 'ferrite',
    id: 'magnetised',
    label: 'Magnetised',
    effect: 'It takes stock one band wider than its filter says. Sometimes that is wrong.',
    writing: (s) => (s.polarity?.chain ?? 0) >= MAGNET_CHAIN,
  },
];

export function ruleFor(shellId: string): ConditionRule | undefined {
  return CONDITION_RULES.find((r) => r.shellId === shellId);
}

export function ruleOf(id: ConditionId): ConditionRule | undefined {
  return CONDITION_RULES.find((r) => r.id === id);
}

// ---------------------------------------------------------------------------
// GLASSMERE'S BAND (§7.2, §19)
// ---------------------------------------------------------------------------

/**
 * WHICH WAVELENGTH A MACHINE SITS IN, and why this is a choice rather than a
 * lookup.
 *
 * `refraction.ts` splits the beam into six wavelengths and the player aims the
 * mirrors. A machine is assigned to one of them; whether that band is LIT is
 * decided by where the beam actually goes, which the player is already shaping
 * for reasons of their own. So Glassmere's rule is the one condition you can
 * deliberately induce — half speed to keep a band you would otherwise lose is
 * a trade a tier-I plant will take and a tier-II plant will not.
 *
 * Assignment defaults to the machine's index in the plant, so a player who
 * never opens the optics still has machines in different bands and still sees
 * the rule happen.
 */
export function bandOfMachine(state: GameState, machineId: string): number {
  // THE BEND (§53) opens a seventh. Everything that reads a band reads the
  // count, so the new one is a real place to stand a machine and not a label —
  // and a plant spread over seven has fewer neighbours one band along, which is
  // the cascade above reading the threshold without being told about it.
  const n = bandCount(state);
  const set = state.plant?.bands?.[machineId];
  if (typeof set === 'number') return Math.max(0, Math.min(n - 1, set));
  const idx = conditionedMachines().indexOf(machineId);
  return idx < 0 ? 0 : idx % n;
}

export function setMachineBand(state: GameState, machineId: string, band: number): boolean {
  if (!conditionedMachines().includes(machineId)) return false;
  const p = ensurePlant(state);
  p.bands ??= {};
  p.bands[machineId] = Math.max(0, Math.min(bandCount(state) - 1, Math.floor(band)));
  return true;
}

/**
 * The wavelengths the beam is carrying right now. 0 (white) counts as all.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A.90 SHIPPED THIS RULE AND RECORDED THAT IT COULD NOT FIRE. A pre-Split beam
 * is white, white lights all six, so no machine was ever in an unallocated
 * band — for the twenty-five mastery levels it takes to reach THE SPLIT.
 *
 * A standing PRISM (§13, A.93) is what changes it: the ALLOCATION is what the
 * plant reads, not the traced path, so a player who spends three points of
 * intensity has left three bands dark and every machine sitting in one goes
 * UNLIT. That works from the Prism's first tier. Without a Prism this is
 * exactly the function A.90 wrote, white and all.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function litBands(state: GameState): Set<number> {
  const out = new Set<number>();
  if (currentShell(state).id !== 'glassmere') {
    for (let i = 0; i < bandCount(state); i++) out.add(i);
    return out;
  }
  const carried = carriedBands(state);
  if (carried.length > 0) {
    for (const b of carried) out.add(b);
    if (out.has(0)) for (let i = 0; i < bandCount(state); i++) out.add(i); // white IS all of them
    return out;
  }
  // Imported lazily through the state rather than the module so this file does
  // not depend on the renderer's trace cache. `refraction.path` is what the
  // beam last traced, which is what the player can see.
  for (const seg of state.refraction?.path ?? []) out.add(seg.color ?? 0);
  if (out.has(0)) for (let i = 0; i < bandCount(state); i++) out.add(i); // pre-Split white lights everything
  return out;
}

function litBand(state: GameState, machineId: string): boolean {
  return litBands(state).has(bandOfMachine(state, machineId));
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

/**
 * ONE RULE PER SHELL, and it only ever applies to the shell you are standing
 * in. A condition written in Cinder does not follow you to Hollow — it decays
 * out, which is what makes "my plant spent forty hours in Cinder" a thing that
 * happened rather than a permanent stat.
 */
export function tickCondition(state: GameState, mods: ModifierCache, dt: number): void {
  if (dt <= 0) return;
  const table = ensureCondition(state);
  // THE BAND'S PHYSICS, NOT THE SHELL'S — §31.2's whole claim, landing on the
  // one system that already models "the world does something to your machines".
  const rule = ruleFor(conditionShellId(state));
  const rate = conditionRate(state);
  for (const id of conditionedMachines()) {
    const built = tierOf(state, id) > 0 || (id === 'kiln' && state.kiln.built);
    const writing = built && rule ? rule.writing(state, id, mods) : false;
    const held = table[id];
    if (writing && rule) {
      const level = Math.min(1, (held?.id === rule.id ? held.level : 0) + (dt * rate) / CONDITION_FULL_SEC);
      const next: MachineCondition = { id: rule.id, level };
      if (rule.id === 'overgrown') next.trait = OVERGROWTH_TRAIT;
      // A BRITTLE MACHINE RUN HOT CRACKS. §7.2's own sentence, and it is a stop
      // rather than a slow: the machine will not run until it is re-cast.
      if (rule.id === 'baked' && level >= 1 && castWith(state, id, 'brittle')) next.seized = true;
      else if (held?.seized) next.seized = true;
      // The clock only runs at full, and only while it is the SAME condition.
      next.fullFor = level >= 1 ? (held?.id === rule.id ? (held.fullFor ?? 0) : 0) + dt : 0;
      table[id] = next;
    } else if (held) {
      // A SEIZURE DOES NOT DECAY. Leaving the shell does not un-crack a liner;
      // only re-casting the part does.
      if (held.seized) { held.level = Math.max(CONDITION_BITE, held.level); continue; }
      held.level -= dt / CONDITION_CLEAR_SEC;
      held.fullFor = 0;
      if (held.level <= 0) delete table[id];
    }
  }
  cascade(state, table, dt);
}

// ---------------------------------------------------------------------------
// §55 — one failure causes the next
// ---------------------------------------------------------------------------

/**
 * THE CASCADE, over the pieces that already shipped.
 *
 * §55's claim is that a failure is an EVENT THAT CASCADES rather than a number
 * going down, and A.105's audit found the honest gap: `CONDITION_RULES` is five
 * predicates that each read SHELL state independently, so five machines can be
 * broken at once and none of them broke another. The world writes; nothing
 * spreads. What is added here is the spreading, and nothing else.
 *
 * WHAT SPREADS: a machine that has been FAILING for `CASCADE_SEC` drags ONE
 * neighbour in the NEXT BAND ALONG. Failing means either the world has written
 * its condition in full, or it is itself being dragged — which is what makes a
 * chain rather than a star. Neighbourhood is `bandOfMachine`, Glassmere's
 * existing allocation model and the same spatial idea `LEAK_REACH` uses for a
 * drowned station, so this adds no geometry.
 *
 * ONE BAND ALONG, NOT THE SAME BAND, and the first draft had that wrong too. A
 * band is a set, so "spreads within its band" makes the neighbourhood a clique:
 * the source reaches every member directly and the result is a STAR with one
 * failure at the centre, never a chain, and `cascadeChain` returns two forever.
 * Stepping one band per hop makes the failure TRAVEL — Kiln to Crusher to
 * Refinery — which is the thing §55 actually describes and the thing item 7's
 * trace is worth having for. Default bands are the machine's index in the
 * plant, so this works on a plant nobody has ever opened the optics on.
 *
 * FIVE RULES, and each is load-bearing:
 *
 *  1. ONLY AT FULL, and only after standing there. A machine halfway into a
 *     condition is being written by the world and has nothing to give.
 *  2. ONE STEP PER PLANT PER `CASCADE_SEC`, AND ONE CHILD PER MACHINE. Both
 *     halves are needed and the first draft had neither.
 *
 *     "One step per pass" was per TICK, and a Cinder plant is written by a rule
 *     that reads no machine id — so all twenty-seven machines hit full at the
 *     same second, all twenty-seven became eligible sources, and the plant went
 *     one machine per SECOND. A wipe, dressed as a cascade. The step is now
 *     gated on `plant.cascadeIn`, which is the plant's clock and not a
 *     machine's.
 *
 *     One child per machine is what makes the shape a CHAIN. A source that
 *     merely reset its own clock kept dragging fresh machines forever, so every
 *     link pointed back at the same failure and `cascadeChain` returned two no
 *     matter how long you left it. A machine that has already dragged one has
 *     given what it has; the next step has to come from the machine it dragged,
 *     which is the sentence §55 is actually making. It may take another only
 *     when that one lets go.
 *  3. NEVER ONTO AN ANCESTOR, so a cycle is structurally impossible rather
 *     than merely unlikely.
 *  4. NEVER SEIZES. `seized` is BAKED plus a brittle part, a stop rather than a
 *     slow, and re-casting is its only exit. A drag costs you speed; it may not
 *     cost you a machine. `DRAG_SPEED` is a multiplier and it is not zero.
 *  5. IT UNWINDS FROM THE HEAD. A drag survives only while its parent is still
 *     failing, so fixing the FIRST failure lifts the chain one machine per
 *     tick, in order. That is item 7 made mechanical rather than narrated: the
 *     player who traces it back and re-casts the root watches the rest come
 *     back, which is the proof that the trace was true.
 *
 * PILLAR 2: a drag is a term in `machineSpeed`, which is how fast a machine
 * converts what it already has — never cap, regen or yield, and never above 1.
 * A cascade costs; it cannot pay.
 */

/** Is this machine failing on its own account — i.e. can it drag another? */
function failing(state: GameState, machineId: string): boolean {
  const c = state.plant?.condition?.[machineId];
  if (c && c.level >= 1) return true;
  return state.plant?.dragged?.[machineId] !== undefined;
}

function built(state: GameState, machineId: string): boolean {
  return tierOf(state, machineId) > 0 || (machineId === 'kiln' && state.kiln.built);
}

function cascade(state: GameState, table: Record<string, MachineCondition>, dt: number): void {
  if (dt <= 0) return;
  const p = ensurePlant(state);
  const drags = ensureDrags(state);

  // RULE 5 — CLEAR FIRST. A drag whose parent has stopped failing is over.
  //
  // AGAINST A SNAPSHOT, and that is the whole of the rule rather than a detail.
  // Read live, a deletion earlier in the loop makes the next link's parent look
  // fine immediately, and the entire chain vanishes in one tick — correct
  // arithmetic, and it throws away the one moment where the player can SEE that
  // the trace they read was true. Frozen, the head lets go this tick and each
  // link the tick after, in the order they were taken.
  const wasFailing = new Set(
    conditionedMachines().filter((id) => failing(state, id)),
  );
  for (const [id, d] of Object.entries(drags)) {
    if (!built(state, id) || !wasFailing.has(d.from)) delete drags[id];
    else d.sec += dt;
  }

  // RULE 2a — the PLANT's clock, not a machine's.
  p.cascadeIn = Math.max(0, (p.cascadeIn ?? 0) - dt);
  if (p.cascadeIn > 0) return;

  const taken = new Set(Object.values(drags).map((d) => d.from));
  // Sources are checked in a fixed order so the chain a save produces does not
  // depend on which key happened to be written first.
  for (const from of conditionedMachines()) {
    if (!built(state, from) || taken.has(from)) continue;   // RULE 2b
    const cond = table[from];
    const drag = drags[from];
    const stood = cond && cond.level >= 1 ? (cond.fullFor ?? 0) : drag ? drag.sec : -1;
    if (stood < CASCADE_SEC) continue;
    const band = bandOfMachine(state, from);
    const ancestors = new Set(cascadeChain(state, from));   // RULE 3
    for (const to of conditionedMachines()) {
      if (to === from || drags[to] || ancestors.has(to)) continue;
      if (!built(state, to)) continue;
      if (Math.abs(bandOfMachine(state, to) - band) !== 1) continue;
      drags[to] = { from, sec: 0 };
      p.cascadeIn = CASCADE_SEC;
      return;
    }
  }
}

/**
 * WALK IT BACK TO THE MACHINE THE WORLD BROKE (item 7).
 *
 * Returns the chain oldest-first, so the panel can say "the Sieve is running
 * slow because the Crusher is, and the Crusher is where the shell did it".
 * Loop-guarded as well as loop-proofed: `cascade` refuses to drag an ancestor,
 * so a cycle should be impossible — which is exactly the kind of should that
 * ships an infinite loop.
 */
export function cascadeChain(state: GameState, machineId: string): string[] {
  const drags = state.plant?.dragged ?? {};
  const chain: string[] = [];
  const seen = new Set<string>();
  let at: string | undefined = machineId;
  while (at && !seen.has(at)) {
    seen.add(at);
    chain.unshift(at);
    at = drags[at]?.from;
  }
  return chain;
}

/** True when this machine is failing because ITS NEIGHBOUR is. */
export function cascadedFrom(state: GameState, machineId: string): string | null {
  return state.plant?.dragged?.[machineId]?.from ?? null;
}

/** How much a drag costs this machine. 1 when it is not being dragged. */
export function dragSpeed(state: GameState, machineId: string): number {
  return state.plant?.dragged?.[machineId] ? DRAG_SPEED : 1;
}

/**
 * WHAT THE MACHINE WAS CAST FROM, read straight off `builtOf` rather than
 * through `machineTraits` — because `machineTraits` folds THIS file's
 * `conditionTraits` back in, and a condition deciding whether a condition
 * applies is how a loop gets written by accident.
 */
function castWith(state: GameState, machineId: string, trait: TraitId): boolean {
  return (state.plant?.builtOf?.[machineId] ?? []).some((m) => traitsOf(m).includes(trait));
}

// ---------------------------------------------------------------------------
// What the rest of the engine reads
// ---------------------------------------------------------------------------

/**
 * HOW FAST THIS MACHINE CONVERTS WHAT IT ALREADY HAS. Never how much it makes —
 * the distinction pillar 2 lives on, and the same one `plant.ts` draws for Flow.
 */
export function machineSpeed(state: GameState, machineId: string): number {
  return conditionSpeed(state, machineId) * overclockSpeed(state, machineId) * dragSpeed(state, machineId);
}

/**
 * ...AND WHAT THE WORLD ALONE HAS DONE TO IT, apart from what the player asked
 * for. Kept separate because a SEIZURE is a hard stop that no setting can
 * override — `machineSpeed` multiplies, and zero times anything is still zero,
 * which is exactly the behaviour a cracked machine should have.
 */
export function conditionSpeed(state: GameState, machineId: string): number {
  const c = conditionOf(state, machineId);
  if (!c) return 1;
  if (c.seized) return 0;
  if (c.level < CONDITION_BITE) return 1;
  if (c.id === 'unlit') return UNLIT_SPEED;
  if (c.id === 'baked' && castWith(state, machineId, 'warm')) return 1 + BAKED_SPEED * c.level;
  return 1;
}

/**
 * DOES THE CONDITION OVERRIDE THE TIER'S BAND RULE? `null` = it has no opinion
 * and the tier decides, which is the ordinary case.
 */
export function conditionRetainsBand(state: GameState, machineId: string): boolean | null {
  if (biting(state, machineId, 'unlit')) return true;      // "loses no purity"
  if (biting(state, machineId, 'undecided')) return false; // will not commit
  return null;
}

/** OVERGROWN hands the machine a trait it was never cast with. */
export function conditionTraits(state: GameState, machineId: string): TraitId[] {
  const c = conditionOf(state, machineId);
  if (!c || c.level < CONDITION_BITE || c.id !== 'overgrown' || !c.trait) return [];
  return [c.trait];
}

/**
 * HOW MANY BANDS WIDER THAN ITS FILTER a machine will take. Ferrite's rule, and
 * the Sieve is what reads it — until filters exist this is written and read by
 * nothing, which is why the rule ships with the Sieve rather than before it.
 */
export function bandWiden(state: GameState, machineId: string): number {
  return biting(state, machineId, 'magnetised') ? 1 : 0;
}

/**
 * SOMEBODY LOOKED AT THE PLANT. Hollow's rule and only Hollow's: an UNDECIDED
 * machine settles the moment it is observed, which is the shell's whole idea
 * pointed at the plant instead of at the face.
 *
 * Deliberately NOT a button. Attention is the mechanic, so opening the panel IS
 * the act — a "settle" button would turn a rule about being away into a chore
 * for a player who is present.
 */
export function observePlant(state: GameState): number {
  const table = state.plant?.condition;
  if (!table) return 0;
  let settled = 0;
  for (const [id, c] of Object.entries(table)) {
    if (c.id !== 'undecided') continue;
    delete table[id];
    settled += 1;
  }
  return settled;
}

// ---------------------------------------------------------------------------
// The way out
// ---------------------------------------------------------------------------

/** Cast parts a re-cast costs. Flat, and cheaper than the tier that built it. */
export const RECAST_PART_COST = 2;

export function recastBlocker(state: GameState, machineId: string): string | null {
  if (!conditionedMachines().includes(machineId)) return 'No such machine.';
  if (tierOf(state, machineId) <= 0 && !(machineId === 'kiln' && state.kiln.built)) {
    return 'It is not built.';
  }
  if (!conditionOf(state, machineId)) return 'There is nothing wrong with it.';
  /**
   * A NEW FRAME DOES NOT PULL THE VINES OFF IT (A.108). §55.4's recovery is the
   * harvest and nothing else, and before this the panel offered a re-cast beside
   * it that took two cast parts and left the machine BROKEN — `recastMachine`
   * clears the condition, `clearBreakOnRecast` only ever cleared a blowout, so
   * the machine started running again while `stopped()` still read true. That is
   * A.107's "reads fine and still does not run" inverted, and it was found by
   * looking at a screenshot of the panel rather than by any check here.
   *
   * Refused rather than made to work: one break, one named recovery. A paid
   * path that forfeits the strain is a strictly worse fix wearing a button.
   */
  if (brokenAs(state, machineId) === 'overgrowth') {
    return 'The green has it. Harvest it — a new frame will not pull the vines off.';
  }
  const rack = state.casting?.rack ?? [];
  if (rack.length < RECAST_PART_COST) {
    return `Needs ${RECAST_PART_COST} cast parts — the rack holds ${rack.length}.`;
  }
  return null;
}

/**
 * RE-CAST THE PART AND THE WORLD'S MARK COMES OFF WITH IT (§7.2: "reversible by
 * re-casting the part, so the balance risk is bounded").
 *
 * It spends parts and returns nothing but the machine you already had, which is
 * what keeps it from being an upgrade: the only reason to do it is that
 * something has gone wrong, and the only thing it does is make that stop.
 */
export function recastMachine(
  state: GameState, ctx: EngineCtx, machineId: string,
): { ok: boolean; reason?: string } {
  const blocked = recastBlocker(state, machineId);
  if (blocked) return { ok: false, reason: blocked };
  const rack = state.casting!.rack;
  const spent = rack.splice(0, RECAST_PART_COST).map((p) => p.materialId);
  // The machine is now partly made of the stone you just fed it (§11.2).
  const p = ensurePlant(state);
  p.builtOf ??= {};
  p.builtOf[machineId] = [...(p.builtOf[machineId] ?? []), ...spent];
  delete ensureCondition(state)[machineId];
  // A RE-CAST VALVE IS A WORKING BOILER. Without this the condition clears and
  // the BREAK does not, so the machine reads fine and still will not run —
  // which is the shape of every "fixed it and nothing happened" bug report.
  // A DELIBERATE RUNTIME-ONLY CYCLE, the pattern this file already documents:
  // `breaks` imports this module at load, so the call has to happen inside a
  // function body and never at module scope.
  clearBreakOnRecast(state, machineId);
  ctx.emit({ type: 'machineRecast', machineId });
  ctx.dirty();
  return { ok: true };
}

/** One line for the panel: what the world has done to this machine. */
export function conditionLine(state: GameState, machineId: string): string | null {
  const c = conditionOf(state, machineId);
  if (!c) return null;
  const rule = ruleOf(c.id);
  if (!rule) return null;
  if (c.seized) return `${rule.label} — it has cracked. It will not run until it is re-cast.`;
  const pct = Math.round(c.level * 100);
  return c.level < CONDITION_BITE
    ? `${rule.label}, ${pct}% — not yet enough to matter.`
    : `${rule.label}, ${pct}% — ${rule.effect}`;
}

/**
 * ...AND ONE LINE FOR A DRAG (item 7). Names the machine beside it, and then
 * the machine at the head of the chain when they are not the same one — which
 * is the difference between "something is wrong" and "go and look at the
 * Crusher". LAW 3: it names the destination, not the arithmetic.
 */
export function cascadeLine(state: GameState, machineId: string): string | null {
  const from = cascadedFrom(state, machineId);
  if (!from) return null;
  const chain = cascadeChain(state, machineId);
  const root = chain[0]!;
  const pct = Math.round((1 - DRAG_SPEED) * 100);
  const near = `The ${machineLabel(from)} is failing beside it — ${pct}% slower.`;
  return root === from
    ? near
    : `${near} That started at the ${machineLabel(root)}, ${chain.length - 1} along.`;
}

/**
 * A machine id as a person would say it. The UI keeps its own prettier maps;
 * this exists so the ENGINE's one sentence about a cascade reads as English
 * without the engine depending on the renderer.
 */
export function machineLabel(machineId: string): string {
  return machineId.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
