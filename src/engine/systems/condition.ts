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
 *   Verdance    OVERGROWN   written by NOT using it, and it hands the machine a
 *                           TRAIT it was not cast with, so every trait-reading
 *                           behaviour in the plant changes underneath you.
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
import type { ModifierCache } from '../modifiers';
import { traitsOf, type TraitId } from '../traits';
import { currentShell } from '../shells';
import { MACHINE_DEMAND, ensurePlant, tierOf } from './plant';
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

export type ConditionId = 'baked' | 'overgrown' | 'unlit' | 'undecided' | 'magnetised';

export interface MachineCondition {
  id: ConditionId;
  /** 0..1. Every rule writes into the same range so one readout serves all five. */
  level: number;
  /** OVERGROWN only: the trait it came back carrying. */
  trait?: TraitId;
  /** BAKED + a `brittle` part only: it has cracked and will not run at all. */
  seized?: boolean;
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

export const CONDITION_RULES: ConditionRule[] = [
  {
    shellId: 'cinder',
    id: 'baked',
    label: 'Baked',
    effect: 'A warm frame runs quicker the longer it bakes. A brittle one cracks.',
    // The shell's own heat, which `pressure.ts` keeps for its own reasons. This
    // READS the signature and never writes to it.
    writing: (s) => (s.pressure?.heat ?? 0) >= BAKE_HEAT,
  },
  {
    shellId: 'verdance',
    id: 'overgrown',
    label: 'Overgrown',
    effect: 'It comes back carrying a trait it was never cast with. Using it clears it.',
    // Written by NOT using it. A machine that is drawing is a machine somebody
    // is standing at; one that is built and idle is one the green gets into.
    writing: (s, id) => tierOf(s, id) > 0 && (s.plant?.served?.[id] ?? 0) <= 0,
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
  const set = state.plant?.bands?.[machineId];
  if (typeof set === 'number') return Math.max(0, Math.min(5, set));
  const idx = conditionedMachines().indexOf(machineId);
  return idx < 0 ? 0 : idx % 6;
}

export function setMachineBand(state: GameState, machineId: string, band: number): boolean {
  if (!conditionedMachines().includes(machineId)) return false;
  const p = ensurePlant(state);
  p.bands ??= {};
  p.bands[machineId] = Math.max(0, Math.min(5, Math.floor(band)));
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
    for (let i = 0; i < 6; i++) out.add(i);
    return out;
  }
  const carried = carriedBands(state);
  if (carried.length > 0) {
    for (const b of carried) out.add(b);
    if (out.has(0)) for (let i = 0; i < 6; i++) out.add(i); // white IS all of them
    return out;
  }
  // Imported lazily through the state rather than the module so this file does
  // not depend on the renderer's trace cache. `refraction.path` is what the
  // beam last traced, which is what the player can see.
  for (const seg of state.refraction?.path ?? []) out.add(seg.color ?? 0);
  if (out.has(0)) for (let i = 0; i < 6; i++) out.add(i); // pre-Split white lights everything
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
  const rule = ruleFor(currentShell(state).id);
  for (const id of conditionedMachines()) {
    const built = tierOf(state, id) > 0 || (id === 'kiln' && state.kiln.built);
    const writing = built && rule ? rule.writing(state, id, mods) : false;
    const held = table[id];
    if (writing && rule) {
      const level = Math.min(1, (held?.id === rule.id ? held.level : 0) + dt / CONDITION_FULL_SEC);
      const next: MachineCondition = { id: rule.id, level };
      if (rule.id === 'overgrown') next.trait = OVERGROWTH_TRAIT;
      // A BRITTLE MACHINE RUN HOT CRACKS. §7.2's own sentence, and it is a stop
      // rather than a slow: the machine will not run until it is re-cast.
      if (rule.id === 'baked' && level >= 1 && castWith(state, id, 'brittle')) next.seized = true;
      else if (held?.seized) next.seized = true;
      table[id] = next;
    } else if (held) {
      // A SEIZURE DOES NOT DECAY. Leaving the shell does not un-crack a liner;
      // only re-casting the part does.
      if (held.seized) { held.level = Math.max(CONDITION_BITE, held.level); continue; }
      held.level -= dt / CONDITION_CLEAR_SEC;
      if (held.level <= 0) delete table[id];
    }
  }
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
  return conditionSpeed(state, machineId) * overclockSpeed(state, machineId);
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
