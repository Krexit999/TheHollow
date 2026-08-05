/**
 * CREWS (§25.4) — FINDINGS, NOT LOGS.
 *
 * §25.4 is unusually specific about what this is for, and it answers the
 * brief's item 11 before it is asked:
 *
 *   "The fleet screen is a queue of work that requires your hands, and the
 *    endgame loop becomes: dispatch → accumulate findings → go down there and
 *    resolve them personally. Automation is a WORK-GENERATOR, not a
 *    work-eliminator, which is the only version of a late game that is
 *    consistent with an active-first design."
 *
 * So a crew is not a throughput multiplier and could not become one without
 * contradicting its own section. IT MINES NOTHING. It carries no haul, banks no
 * currency, and touches no material stack — the whole of what it produces is a
 * list of things it could not decide. `crews.test.ts` drives a full descent and
 * asserts every purse and every stack is byte-identical afterward.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A CREW IS A DELEGATION OF A DECISION YOU HAVE ALREADY MADE — item 11's test,
 * and it is met three times over:
 *
 *   THE TOOL     it carries the tier you built. A wall it cannot pass is a wall
 *                YOUR tool could not pass either.
 *   THE CIRCUIT  it carries your circuit's READS. A crew can only make a call
 *                its circuit is equipped to make, which is §25.4's "a seam whose
 *                CALL it cannot make" and the reason two crews with different
 *                circuits disagree about the same station.
 *   THE DRIFT    you shored the band. You chose where it walks.
 *
 * None of those is a number the crew improves. Each is a decision you made,
 * carried out while you are elsewhere, and handed back the moment it runs into
 * something a decision cannot cover.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THREE SYSTEMS NAMED CREWS AS THEIR BLOCKER, and this closes all three:
 *   §36.2   the fleet era wants a queue of work
 *   §25.3   the Circuit was specified to make crews SITUATIONAL
 *   A.86    shoring's LAW 7 phase four — "walked by crews"
 *
 * ...and a fourth that nobody had connected: `laws.ts`'s `crewAlwaysWorks` slot
 * has had a name and no subject since Phase 10. It has one now.
 */
import type { ActionResult, EngineCtx, GameState } from '../types';
import type { StationDef } from '../content/shell1/roll';
import { shellRoll, contentsOf, isCleared, isFlooded, isLooted, typeOf } from './roll';
import { bands, isShored } from './shoring';
import { availableReads, ensureCircuit } from './circuit';
import { ensureGear } from './gear';
import { gearDef, type GearSlot } from '../content/shell1/gear';
import { lawFlag } from '../laws';
import { maxToolTier } from '../shells';
import { materialDef } from '../materials';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GEAR LOADOUT (§25.4) — "a crew is a tool from your rack, a GEAR LOADOUT
 * and a circuit". A.99 shipped two of the three and said so; this is the third.
 *
 * IT IS A SNAPSHOT OF WHAT YOU ARE WEARING, taken at dispatch, exactly as the
 * tool tier and the circuit reads are. That is not a shortcut — it is what
 * makes the brief's item 6 STRUCTURAL instead of a check:
 *
 *   gear swaps at a REST (`gear.equipGear`)
 *   a crew carries what you were wearing
 *   → the only way to change what a crew carries is to change what YOU wear
 *   → which needs a REST
 *
 * There is no verb that sets a crew's gear, so there is nothing to guard and
 * nothing to get wrong. `crews.test.ts` asserts no such action exists.
 *
 * WHAT EACH SLOT DOES FOR A CREW, read off the gear's own authored effect
 * rather than invented for this:
 *
 *   LAMP    what it can SEE. Both lamps are about legibility on the ladder, so
 *           a crew with one NAMES the hazard it withdrew from instead of
 *           reporting a shape. §25.4's own example finding is "Withdrew from a
 *           Deepwrought at 40% condition" — that is a lit crew talking.
 *   BOOTS   how fast it covers ground. Marching Boots "covers two squares a
 *           stroke", so a shod crew walks the drift quicker.
 *   GLOVES  NOTHING, and that is stated rather than faked. Both glove effects
 *           are about YOUR hand at the rock ("pockets you dig by hand", "a
 *           swing that finds nothing") and a crew does not chip. Inventing a
 *           crew-shaped reading would be authoring content to fill a table.
 *
 * PILLAR 2: a lamp changes what a finding SAYS and boots change how fast an
 * index moves. Neither adds a unit of anything — the module still has no route
 * to a currency, a stack or the face, asserted.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** How many crews you may have out at once. Small — each is a commitment. */
export const MAX_CREWS = 3;

/** Boots that cover ground. A shod crew walks its drift this much quicker. */
export const BOOT_PACE = 0.6;

/** Seconds a crew spends on one station before it moves to the next. */
export const STATION_SEC = 45;

/** Findings a crew will carry before it stops and waits for you. */
export const FINDING_CAP = 6;

export type FindingKind = 'wall' | 'sign' | 'dig' | 'call' | 'hazard';

export interface Finding {
  kind: FindingKind;
  stationId: string;
  /** The whole row, as §25.4 prints it. The UI computes nothing. */
  line: string;
  /** What resolving it means, said plainly. */
  wants: string;
}

export interface Crew {
  id: number;
  name: string;
  /** The band it walks. A shored station id — you chose it. */
  driftId: string;
  /** Tool tier it carries: yours, at the moment you dispatched it. */
  tier: number;
  /** Circuit reads it carries, by id. Yours, at the moment you dispatched it. */
  reads: string[];
  /**
   * THE GEAR LOADOUT (§25.4, A.100) — slot → gear id. Yours, at the moment you
   * dispatched it. See `GEAR_READS` for what a crew does with each slot.
   */
  gear: Partial<Record<GearSlot, string>>;
  /** Where it is now. */
  atIndex: number;
  /** Seconds banked toward the next station. */
  timer: number;
  /** Recalled crews stop — unless the law says otherwise. */
  recalled: boolean;
  findings: Finding[];
}

export interface CrewsState {
  crews: Crew[];
  nextId: number;
  /** Findings you have gone down and resolved, lifetime. A small Codex. */
  resolved: number;
}

export function defaultCrewsState(): CrewsState {
  return { crews: [], nextId: 1, resolved: 0 };
}

export function ensureCrews(state: GameState): CrewsState {
  const c = (state.crews ??= defaultCrewsState());
  c.crews ??= [];
  c.nextId ??= 1;
  c.resolved ??= 0;
  for (const crew of c.crews) {
    crew.findings ??= [];
    crew.reads ??= [];
    crew.gear ??= {};
    crew.recalled ??= false;
  }
  return c;
}

// ---------------------------------------------------------------------------
// Dispatching
// ---------------------------------------------------------------------------

/**
 * A CREW WALKS A DRIFT, so drifts are the gate — which is A.86's phase four
 * arriving on its own terms rather than a second kind of assignment. No shored
 * band, no crew, and the refusal says which.
 */
export function driftsAvailable(state: GameState): StationDef[] {
  return shellRoll(state).filter((d) => isShored(state, d.id));
}

/** The lamp a crew is carrying, or null. Decides what it can report. */
export function crewLamp(crew: Crew): string | null {
  return crew.gear?.lamp ?? null;
}

/** Seconds this crew spends on one station. Boots cover ground. */
export function crewPace(crew: Crew): number {
  return crew.gear?.boots ? STATION_SEC * BOOT_PACE : STATION_SEC;
}

/** The stations a crew on this drift will walk, shallowest first. */
export function driftStations(state: GameState, driftId: string): StationDef[] {
  const band = bands(state).find((b) => b.def.id === driftId);
  if (!band) return [];
  return [...shellRoll(state)]
    .filter((d) => d.depth > band.from - 1 && d.depth <= band.to)
    .sort((a, b) => a.depth - b.depth);
}

export function crewBlocker(state: GameState, driftId: string): string | null {
  const c = ensureCrews(state);
  if (c.crews.length >= MAX_CREWS) return `Three crews is all you can keep track of.`;
  if (!isShored(state, driftId)) return 'Nothing walks a band you have not timbered.';
  if (c.crews.some((x) => x.driftId === driftId)) return 'A crew is already down there.';
  if (driftStations(state, driftId).length === 0) return 'That drift has nothing in it.';
  return null;
}

/**
 * SEND ONE DOWN. It takes a SNAPSHOT of your tool tier and your circuit's
 * reads, which is what makes two crews dispatched at different times disagree —
 * §25.4's "two crews with different circuits report contradictory findings about
 * the same station, and the only way to settle it is to go and look."
 */
export function dispatchCrew(state: GameState, ctx: EngineCtx, driftId: string): ActionResult {
  const blocked = crewBlocker(state, driftId);
  if (blocked) return { ok: false, reason: blocked };
  const c = ensureCrews(state);
  const def = shellRoll(state).find((d) => d.id === driftId)!;
  const crew: Crew = {
    id: c.nextId++,
    name: `Crew ${roman(c.nextId - 1)}`,
    driftId,
    tier: maxToolTier(state),
    reads: availableReads(state).map((r) => r.id),
    // A SNAPSHOT, exactly like the tool and the reads — and that is what makes
    // item 6 structural rather than a check. See the header.
    gear: { ...ensureGear(state).worn },
    atIndex: 0,
    timer: 0,
    recalled: false,
    findings: [],
  };
  c.crews.push(crew);
  ctx.dirty();
  ctx.emit({ type: 'crewSent', crew: crew.name, drift: def.name });
  return { ok: true, data: { id: crew.id, name: crew.name } };
}

export function recallCrew(state: GameState, ctx: EngineCtx, id: number): ActionResult {
  const c = ensureCrews(state);
  const crew = c.crews.find((x) => x.id === id);
  if (!crew) return { ok: false, reason: 'No such crew.' };
  crew.recalled = true;
  ctx.dirty();
  return { ok: true, data: { name: crew.name } };
}

/** Bring one home. Its findings come with it — they are the point. */
export function dismissCrew(state: GameState, ctx: EngineCtx, id: number): ActionResult {
  const c = ensureCrews(state);
  const at = c.crews.findIndex((x) => x.id === id);
  if (at < 0) return { ok: false, reason: 'No such crew.' };
  c.crews.splice(at, 1);
  ctx.dirty();
  return { ok: true };
}

function roman(n: number): string {
  return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] ?? String(n);
}

// ---------------------------------------------------------------------------
// What a crew finds
// ---------------------------------------------------------------------------

/**
 * WHAT THIS STATION HANDS BACK, or null if the crew can deal with it.
 *
 * Every branch is §25.4's own list, and every one is a thing a DECISION cannot
 * cover — which is why resolving one requires the player to be standing there.
 */
export function findingAt(state: GameState, crew: Crew, def: StationDef): Finding | null {
  const kind = typeOf(state, def);

  // "WALL, hardness 3 — its tool is 2." The crew carries the tier you had.
  if (kind === 'wall' && !isCleared(state, def.id)) {
    const need = def.hardness ?? 1;
    if (crew.tier < need) {
      return {
        kind: 'wall', stationId: def.id,
        line: `WALL, hardness ${need} — its tool is ${crew.tier}.`,
        wants: 'you, or a better tool',
      };
    }
  }

  /**
   * "Withdrew from a Deepwrought at 40% condition." A hazard is not fought —
   * combat is gone (A.7x) — so the crew comes back either way. WHAT IT CAN TELL
   * YOU is the loadout's job: a lit crew names the place and how bad it was, an
   * unlit one reports a shape in the dark.
   */
  if (kind === 'hazard') {
    const lit = crewLamp(crew) !== null;
    const bite = contentsOf(state, def.id).hazard;
    return {
      kind: 'hazard', stationId: def.id,
      line: lit
        ? `Withdrew from ${def.name}, hazard ${bite}. It is not a place a crew goes.`
        : 'Withdrew from something in the dark. It did not stay to look.',
      wants: lit ? 'you, or a different drift' : 'you, or a lamp',
    };
  }

  // "A DIG it will not open (circuits don't dig)." There is no `dig` station
  // TYPE in this build — the registry's list is seam/wall/wreck/works/chamber/
  // rest/floor/flood — and a CHAMBER is the thing §25.4 is describing: a place
  // you open, not a place you walk past. Named against the registry, not the
  // sentence, per PILLARS.
  if (kind === 'chamber' && !isLooted(state, def.id)) {
    return {
      kind: 'dig', stationId: def.id,
      line: `A CHAMBER at ${def.name} it will not open.`,
      wants: 'you, in person — circuits do not dig',
    };
  }

  // "A SIGN it cannot read." A wreck nobody has opened is the same shape: the
  // crew can see there is something in it and will not put a hand in.
  if (kind === 'wreck' && !isLooted(state, def.id)) {
    return {
      kind: 'sign', stationId: def.id,
      line: `Something is still in the wreck at ${def.name}.`,
      wants: 'you, in person',
    };
  }

  /**
   * "A seam whose CALL it cannot make." THE CIRCUIT MAKES THE CREW
   * SITUATIONAL, which is item 9's third blocker and §25.3's stated purpose: a
   * crew without the `seam` read cannot say what it is standing on, so it logs
   * the double it left on the table rather than guessing.
   */
  const seam = contentsOf(state, def.id).seam;
  if (seam && !crew.reads.includes('seam')) {
    return {
      kind: 'call', stationId: def.id,
      line: `A seam at ${def.name} whose call it cannot make.`,
      wants: 'you, or leave the double on the table',
    };
  }
  void materialDef;      // the seam's NAME is deliberately not reported: it did not read it
  return null;
}

/**
 * ONE TICK OF THE FLEET. Called from the engine's slow block.
 *
 * PILLAR 2 — read it and see what is not here. Nothing in this file adds a
 * currency, adds a material, spends, or writes to the face. A crew moves an
 * index and appends strings. `crews.test.ts` greps this module for the call
 * sites rather than trusting the sentence, which is why the sentence does not
 * name them.
 */
export function tickCrews(state: GameState, ctx: EngineCtx, dt: number): void {
  const c = state.crews;
  if (!c || c.crews.length === 0) return;
  const keepWalking = lawFlag(state, 'crewAlwaysWorks');
  for (const crew of c.crews) {
    // RECALLED CREWS STOP — unless the law says they keep working from the
    // stair. `laws.ts`'s `crewAlwaysWorks`, which has had a name and no subject
    // since Phase 10 and now has one.
    if (crew.recalled && !keepWalking) continue;
    if (crew.findings.length >= FINDING_CAP) continue;
    const stops = driftStations(state, crew.driftId);
    if (stops.length === 0 || crew.atIndex >= stops.length) continue;
    crew.timer += dt;
    const pace = crewPace(crew);
    while (crew.timer >= pace && crew.atIndex < stops.length) {
      crew.timer -= pace;
      const def = stops[crew.atIndex]!;
      crew.atIndex += 1;
      const found = findingAt(state, crew, def);
      if (found && !crew.findings.some((f: Finding) => f.stationId === found.stationId && f.kind === found.kind)) {
        crew.findings.push(found);
        ctx.emit({ type: 'crewFinding', crew: crew.name, line: found.line });
        if (crew.findings.length >= FINDING_CAP) break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Resolving one, which is the whole loop
// ---------------------------------------------------------------------------

/**
 * A FINDING IS RESOLVED BY BEING STOOD IN, and by nothing else. Not by a
 * button, not by spending, not by waiting: the endgame loop §25.4 describes is
 * "go down there and resolve them personally", so the check is simply whether
 * the world at that station has changed in the way the finding asked for.
 *
 * Called from the same place `markReached` is — walking into a station.
 */
export function resolveFindings(state: GameState): Finding[] {
  const c = state.crews;
  if (!c || c.crews.length === 0) return [];
  const cleared: Finding[] = [];
  for (const crew of c.crews) {
    crew.findings = crew.findings.filter((f: Finding) => {
      const def = shellRoll(state).find((d) => d.id === f.stationId);
      if (!def) return true;
      const done =
        (f.kind === 'wall' && isCleared(state, f.stationId))
        || (f.kind === 'sign' && isLooted(state, f.stationId))
        || (f.kind === 'dig' && isLooted(state, f.stationId))
        || (f.kind === 'hazard' && isFlooded(state, f.stationId))
        || (f.kind === 'call' && (state.depth ?? 0) >= def.depth);
      if (done) cleared.push(f);
      return !done;
    });
  }
  if (cleared.length > 0) c.resolved += cleared.length;
  return cleared;
}

// ---------------------------------------------------------------------------
// What the panel says — the UI computes nothing
// ---------------------------------------------------------------------------

export interface CrewRow {
  id: number;
  name: string;
  drift: string;
  at: string;
  tier: number;
  reads: number;
  /** Slot → the kit's NAME, for the panel. Empty slots are absent. */
  gear: Array<{ slot: string; name: string }>;
  recalled: boolean;
  walking: boolean;
  findings: Finding[];
}

export function crewsRead(state: GameState): {
  rows: CrewRow[]; slots: number; drifts: Array<{ id: string; name: string; taken: boolean }>;
  resolved: number; open: number;
} {
  const c = ensureCrews(state);
  const keepWalking = lawFlag(state, 'crewAlwaysWorks');
  const rows: CrewRow[] = c.crews.map((crew) => {
    const stops = driftStations(state, crew.driftId);
    const here = stops[Math.min(crew.atIndex, stops.length - 1)];
    const done = crew.atIndex >= stops.length;
    return {
      id: crew.id,
      name: crew.name,
      drift: shellRoll(state).find((d) => d.id === crew.driftId)?.name ?? crew.driftId,
      at: done ? 'walked the whole drift' : `at ${here?.name ?? '—'}`,
      tier: crew.tier,
      reads: crew.reads.length,
      gear: Object.entries(crew.gear ?? {}).map(([slot, id]) => ({
        slot,
        name: gearDef(id as string)?.name ?? (id as string),
      })),
      recalled: crew.recalled,
      walking: (!crew.recalled || keepWalking) && !done && crew.findings.length < FINDING_CAP,
      findings: crew.findings,
    };
  });
  return {
    rows,
    slots: MAX_CREWS,
    drifts: driftsAvailable(state).map((d) => ({
      id: d.id, name: d.name, taken: c.crews.some((x) => x.driftId === d.id),
    })),
    resolved: c.resolved,
    open: rows.reduce((n, r) => n + r.findings.length, 0),
  };
}

/** Circuit reads a crew would carry if you sent one right now. */
export function readsNow(state: GameState): number {
  ensureCircuit(state);
  return availableReads(state).length;
}
